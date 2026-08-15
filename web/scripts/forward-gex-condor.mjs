// FORWARD-TEST EN PAPEL — cóndor de hierro 0DTE de SPX filtrado por GEX.
//
// NO ejecuta órdenes. Registra cada día lo que la regla habría hecho, con cotizaciones REALES
// del momento, y lo liquida contra el cierre real del índice.
//
// ╔═══ LO QUE SE REGISTRA DE ANTEMANO (pre-registro) ═══╗
// Esto se fija AHORA y no se toca. Si luego cambio un parámetro porque los resultados no
// gustan, el forward-test deja de valer y hay que empezar de cero. Ese es todo su sentido:
// es lo único que ninguno de los dos puede manosear.
//
//   ENTRADA   viernes no, TODOS los días de mercado, a las 11:00 ET
//             (11:00 y no 13:00, que salió mejor: NO se elige el máximo del barrido)
//   FILTRO    GEX neto POSITIVO. Si es negativo -> no se opera. Ese es el veto.
//   ESTRUCTURA cóndor de hierro: vender call a +25 puntos del dinero y put a −25,
//             comprar las alas 50 puntos más allá
//   PRECIO    cruzando la horquilla ENTERA: se vende al bid y se compra al ask
//   SALIDA    sostener al cierre. SPX es europea y en efectivo: no hay asignación
//   COSTES    $0,03 por contrato y pata
//
// ╔═══ LO QUE EL BACKTEST DICE QUE DEBE PASAR ═══╗
// 143 operaciones, 2024-2026, precios reales:
//   · señal en el 22% de los días (uno de cada 4,6)
//   · 73% de acierto
//   · crédito mediano $725
//   · +$196 por operación de media  ->  ~$10.775 al año por contrato
//   · peor día −$4.135
// Si en vivo el acierto baja de ~60% o el crédito mediano de ~$600, la regla no se sostiene.
//
// Uso:  node scripts/forward-gex-condor.mjs           (abre lo de hoy y liquida lo pendiente)
//       node scripts/forward-gex-condor.mjs --dia 2026-08-11
//
// Necesita el Theta Terminal arriba. Puede correrse a cualquier hora del día: la decisión usa
// SOLO la foto de las 11:00, así que ejecutarlo a las 11:05 o a las 17:00 da lo mismo.

import fs from 'node:fs';
import path from 'node:path';

// Este script pide rutas bajo /v3, pero el resto de servicios definen THETA_BASE SIN /v3
// (forward-test.ts, with-theta.mjs). Si en Railway existe esa variable a nivel de proyecto,
// aquí llegaría sin /v3 y todas las peticiones darían 404 — correría cada día y no grabaría
// nada, sin un solo error visible. Se normaliza en vez de confiar en cómo esté puesta.
const B = (process.env.THETA_BASE || 'http://127.0.0.1:25503').replace(/\/+$/, '').replace(/\/v3$/, '') + '/v3';
const SYM = 'SPXW';
const LEDGER = process.env.GEX_LEDGER || 'data/forward/gex-condor.json';

// ── parámetros pre-registrados. NO TOCAR. ────────────────────────────────────
const HORA = '11:00';
const SEP = 25;
const ALA = 50;
const COMM = 0.03;
const PASO_STRIKE = 5;

// Distribución REAL del crédito del ±25 en los últimos 12 meses del backtest (n=73, precios reales,
// cruzando la horquilla entera). Medido el 2026-08-15 con gex-condor-ultimos-dias.mjs. Sirve para
// que el aviso de crédito compare contra un RANGO y no contra la mediana del año bueno.
const CRED = { p10: 360, p25: 470, p50: 600, p90: 1070 };

const hoyET = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const ahoraET = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/New_York' }).slice(0, 16);
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const DIA = arg('--dia') || hoyET();

const nd = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p; };
const phi = x => 0.3989423 * Math.exp(-x * x / 2);
const d1f = (S, K, T, v) => (Math.log(S / K) + (v * v / 2) * T) / (v * Math.sqrt(T));
const gamma = (S, K, T, v) => phi(d1f(S, K, T, v)) / (S * v * Math.sqrt(T));

async function csv(ruta) {
  const r = await fetch(`${B}/${ruta}`, { signal: AbortSignal.timeout(180_000) });
  const txt = await r.text();
  if (!r.ok || txt.length < 200 || txt.split('\n')[0].includes(' ')) return null;
  const lin = txt.trim().split('\n');
  return { cab: lin[0].split(','), filas: lin.slice(1).map(l => l.split(',')) };
}

// ── dónde vive el ledger ─────────────────────────────────────────────────────
// En Railway el disco del contenedor SE BORRA en cada arranque. Si esto escribiera sólo en
// fichero, correría cada día y no acumularía nada: dos meses después el ledger tendría una sola
// operación y nadie se habría enterado. Con REDIS_URL presente guarda en Redis, igual que el
// forward-test del credit spread. En local, sin REDIS_URL, sigue en fichero como hasta ahora.
const STORE = (process.env.GEX_STORE || (process.env.REDIS_URL ? 'redis' : 'file')).toLowerCase();
const REDIS_KEY = process.env.GEX_REDIS_KEY || 'forward:gex-condor';
let _redis = null;
async function redis() {
  if (!_redis) {
    if (!process.env.REDIS_URL) throw new Error('GEX_STORE=redis pero falta REDIS_URL en el entorno');
    const { default: Redis } = await import('ioredis');
    _redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return _redis;
}

const leer = async () => {
  if (STORE === 'redis') {
    const crudo = await (await redis()).get(REDIS_KEY);
    // Primera vez en Redis: si hay un fichero local, se siembra con él para no perder el
    // histórico ya registrado a mano. Después manda Redis.
    if (crudo) return JSON.parse(crudo);
    try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch { return []; }
  }
  try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch { return []; }
};

const guardar = async (l, reporte = '', resumen = '') => {
  if (STORE === 'redis') {
    const r = await redis();
    await r.set(REDIS_KEY, JSON.stringify(l));
    if (reporte) await r.set(`${REDIS_KEY}:report`, reporte);
    // Siempre, aunque hoy no hubiera señal. Ver el comentario del latido en origenEjecucion.
    const { escribirLatido } = await import('../lib/origenEjecucion.ts');
    await escribirLatido(r, 'gex-condor', resumen || `${l.length} operaciones en el ledger`);
    return;
  }
  if (!fs.existsSync(path.dirname(LEDGER))) fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 1), 'utf8');
};

// ── la foto de las 11:00 ──────────────────────────────────────────────────────
async function foto(dia) {
  const oiRaw = await csv(`option/history/open_interest?symbol=${SYM}&expiration=${dia}&start_date=${dia}&end_date=${dia}`);
  if (!oiRaw) return null;
  const iK = oiRaw.cab.indexOf('strike'), iR = oiRaw.cab.indexOf('right'), iO = oiRaw.cab.indexOf('open_interest');
  const oi = { C: new Map(), P: new Map() };
  for (const c of oiRaw.filas) { const v = +c[iO]; if (v > 0) oi[c[iR].replace(/"/g, '') === 'CALL' ? 'C' : 'P'].set(+c[iK], v); }

  const cad = { C: new Map(), P: new Map() }; let U = 0;
  for (const lado of ['P', 'C']) {
    const d = await csv(`option/history/greeks/implied_volatility?symbol=${SYM}&expiration=${dia}&start_date=${dia}&end_date=${dia}&right=${lado}&interval=5m`);
    if (!d) return null;
    const jK = d.cab.indexOf('strike'), jT = d.cab.indexOf('timestamp'), jB = d.cab.indexOf('bid'),
          jA = d.cab.indexOf('ask'), jM = d.cab.indexOf('midpoint'), jV = d.cab.indexOf('implied_vol'), jU = d.cab.indexOf('underlying_price');
    for (const c of d.filas) {
      if (c[jT].slice(11, 16) !== HORA) continue;
      const u = +c[jU]; if (u > 0) U = u;
      const bid = +c[jB], ask = +c[jA], mid = +c[jM], iv = +c[jV];
      if (!(bid > 0) || !(ask > 0) || ask < bid || !(mid > 0) || !(iv > 0.01) || iv > 4) continue;
      if ((ask - bid) / mid > 0.5) continue;
      cad[lado].set(+c[jK], { bid, ask, mid, iv });
    }
  }
  if (!(U > 0) || cad.C.size < 20) return null;

  const T = Math.max((16 * 60 - (+HORA.slice(0, 2) * 60 + +HORA.slice(3))) / 60 / 24 / 365, 1 / 24 / 365);
  let gC = 0, gP = 0;
  for (const [lado, mapa] of [['C', cad.C], ['P', cad.P]])
    for (const [K, q] of mapa) {
      const o = oi[lado].get(K); if (!o) continue;
      const g = gamma(U, K, T, q.iv); if (!isFinite(g) || g <= 0) continue;
      const $ = g * o * 100 * U * U * 0.01; if (!isFinite($)) continue;
      if (lado === 'C') gC += $; else gP += $;
    }
  return { U, T, cad, gexNeto: gC - gP, gexCalls: gC, gexPuts: gP };
}

// ── cierre real del índice ────────────────────────────────────────────────────
async function cierreSPX(dia) {
  const d = await csv(`index/history/eod?symbol=SPX&start_date=${dia}&end_date=${dia}`);
  if (!d?.filas.length) return null;
  const i = d.cab.indexOf('close');
  const c = +d.filas[d.filas.length - 1][i];
  return c > 0 ? c : null;
}

(async () => {
  const ledger = await leer();
  console.log(`\n═══ FORWARD-TEST · cóndor 0DTE + GEX · ${DIA} ═══`);
  console.log(`   corriendo el ${ahoraET()} ET · 100% PAPEL, no ejecuta nada\n`);

  // 1. liquidar lo pendiente
  console.log('[1] liquidar pendientes');
  let liquidadas = 0;
  for (const op of ledger) {
    if (op.estado !== 'abierta') continue;
    const S = await cierreSPX(op.dia);
    if (S == null) { console.log(`    … ${op.dia}: aún sin cierre de SPX`); continue; }
    const perd = Math.min(Math.max(S - op.callCorta, 0), ALA) + Math.min(Math.max(op.putCorta - S, 0), ALA);
    op.cierreSPX = S;
    op.pl = Math.round(((op.credito - perd) * 100 - 8 * COMM) * 100) / 100;
    op.estado = 'cerrada';
    liquidadas++;
    console.log(`    ✓ ${op.dia}: SPX cerró ${S.toFixed(2)}  ·  P&L $${op.pl.toFixed(0)}`);
  }
  if (!liquidadas) console.log('    (nada que liquidar)');

  // 2. la señal de hoy
  console.log(`\n[2] señal de ${DIA} a las ${HORA}`);
  if (ledger.some(o => o.dia === DIA)) { console.log('    ya estaba registrado — no se duplica'); }
  else {
    const f = await foto(DIA);
    if (!f) { console.log(`    ✗ sin datos para ${DIA} (¿festivo? ¿aún no son las ${HORA}?)`); }
    else {
      // railway o local: sin esto el ledger no se puede auditar (ver lib/origenEjecucion.ts)
      const origen = Object.keys(process.env).some(k => k.startsWith('RAILWAY_'))
        ? `railway:${process.env.RAILWAY_SERVICE_NAME || '?'}` : 'local';
      const base = { dia: DIA, hora: HORA, registradoEn: ahoraET(), origen, spx: Math.round(f.U * 100) / 100,
                     gexNeto: Math.round(f.gexNeto / 1e6), gexCalls: Math.round(f.gexCalls / 1e6), gexPuts: Math.round(f.gexPuts / 1e6) };
      if (f.gexNeto <= 0) {
        ledger.push({ ...base, estado: 'sin señal', motivo: 'GEX negativo — el veto' });
        console.log(`    SPX ${f.U.toFixed(2)} · GEX neto $${(f.gexNeto / 1e6).toFixed(0)}M NEGATIVO  ->  NO OPERAR (veto)`);
      } else {
        const red = x => Math.round(x / PASO_STRIKE) * PASO_STRIKE;
        const Kc = red(f.U) + SEP, Kp = red(f.U) - SEP;
        const c = f.cad.C.get(Kc), cA = f.cad.C.get(Kc + ALA), p = f.cad.P.get(Kp), pA = f.cad.P.get(Kp - ALA);
        if (!c || !cA || !p || !pA) {
          ledger.push({ ...base, estado: 'sin señal', motivo: 'GEX positivo pero faltan strikes cotizados' });
          console.log(`    GEX positivo pero faltan strikes para el cóndor -> no se opera`);
        } else {
          const credito = Math.round((c.bid + p.bid - cA.ask - pA.ask) * 100) / 100;
          ledger.push({ ...base, estado: 'abierta', callCorta: Kc, callLarga: Kc + ALA, putCorta: Kp, putLarga: Kp - ALA,
                        credito, riesgoMax: Math.round((ALA - credito) * 100),
                        precios: { callCorta: c.bid, callLarga: cA.ask, putCorta: p.bid, putLarga: pA.ask } });
          console.log(`    ✓ SEÑAL · SPX ${f.U.toFixed(2)} · GEX +$${(f.gexNeto / 1e6).toFixed(0)}M`);
          console.log(`      vender call ${Kc} / comprar ${Kc + ALA}  ·  vender put ${Kp} / comprar ${Kp - ALA}`);
          console.log(`      crédito $${(credito * 100).toFixed(0)}  ·  riesgo máx $${((ALA - credito) * 100).toFixed(0)}  ·  gana si SPX cierra entre ${Kp} y ${Kc}`);
        }
      }
    }
  }

  // 3. estado
  const cer = ledger.filter(o => o.estado === 'cerrada');
  const señales = ledger.filter(o => o.estado !== 'sin señal');
  const lineas = [];
  const di = (s) => { lineas.push(s); console.log(s); };
  console.log(`\n[3] estado del ledger`);
  di(`    días registrados: ${ledger.length}  ·  con señal: ${señales.length} (${ledger.length ? Math.round(señales.length / ledger.length * 100) : 0}%, el backtest dice 22%)`);
  if (cer.length) {
    const gan = cer.filter(o => o.pl > 0);
    const tot = cer.reduce((s, o) => s + o.pl, 0);
    const cred = [...cer.map(o => o.credito * 100)].sort((a, b) => a - b);
    const credMed = cred[Math.floor(cred.length / 2)];
    di(`    cerradas: ${cer.length}  ·  acierto ${Math.round(gan.length / cer.length * 100)}% (backtest 73%)`);
    di(`    crédito mediano: $${credMed.toFixed(0)}  (últimos 12 meses del backtest: p10 $${CRED.p10} · mediana $${CRED.p50} · p90 $${CRED.p90})`);
    di(`    P&L acumulado: $${tot.toFixed(0)}  ·  por operación $${(tot / cer.length).toFixed(0)} (backtest $196)`);
    if (cer.length < 20) di(`    ⚠ con ${cer.length} cierres esto todavía no dice nada. Hacen falta ~30.`);
    // El crédito corto es la señal temprana de que lo medido no aparece en vivo, y pesa más que
    // el P&L de una operación suelta: en un cóndor el crédito ES el beneficio máximo.
    //
    // EL UMBRAL SE RE-BASÓ EL 2026-08-15, y el motivo importa. Antes avisaba por debajo de $600
    // comparando con los $725 de mediana de TODA la serie — o sea, contra el año bueno. Medida la
    // distribución real de los últimos 12 meses (n=73), la mediana es $600 y el p10 es $360: el
    // crédito rebota con la volatilidad, no baja en línea recta. Un aviso que salta la mitad de
    // los días normales no es un aviso, es ruido, y enseña a ignorar los avisos de verdad.
    if (credMed < CRED.p10)
      di(`    ⚠ crédito mediano $${credMed.toFixed(0)}: por debajo del percentil 10 ($${CRED.p10}) de los últimos 12 meses.`);
  } else di(`    sin cierres todavía`);

  await guardar(ledger, lineas.join('\n'));
  console.log(`\n    guardado en ${STORE === 'redis' ? `Redis, key "${REDIS_KEY}"` : LEDGER}\n`);
  if (_redis) await _redis.quit();

// SI ESTO REVIENTA, TAMBIÉN SE DEJA CONSTANCIA. Un servicio que se cae sin escribir nada se ve,
// desde fuera, EXACTAMENTE igual que uno que no arrancó — que es el agujero que costó la mañana
// del 2026-08-15. Con el latido de fallo, `estado-railway.mjs` dice "corrió y petó, y esto es lo
// que dijo" en vez de callarse. El error se relanza después: el cron tiene que seguir fallando.
})().catch(async (e) => {
  try {
    const { escribirLatidoDirecto } = await import('../lib/origenEjecucion.ts');
    // Directo: abre su propia conexión, porque puede haber petado ANTES de crear el cliente.
    await escribirLatidoDirecto('gex-condor', `FALLÓ: ${e?.message ?? e}`);
  } catch { /* si ni eso se puede, que al menos el error salga */ }
  console.error(e);
  process.exit(1);
});
