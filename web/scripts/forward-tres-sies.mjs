// FORWARD-TEST EN PAPEL — cóndor de hierro 0DTE de SPX, SIN NINGÚN FILTRO.
//
// NO ejecuta órdenes. Es el HERMANO de forward-gex-condor.mjs, que sigue corriendo intacto.
//
// ╔═══ POR QUÉ EXISTE ESTE SEGUNDO REGISTRO ═══╗
// El primero veta los días de GEX negativo. Medido el 2026-08-17 sobre 653 días, ese veto NO
// separa (t=0,67, percentil 79 de coger días al azar) y CUESTA ~$4.300 al año por tirar 286
// días de 649. O sea: lo que corre en vivo no es la estrategia que se recomienda.
//
// El primero NO SE TOCA — su valor entero es que sus parámetros están pre-registrados y nadie
// los ha manoseado. Por eso esto es un fichero aparte y no una variable de entorno: dentro de
// un año los dos ledgers se comparan contra el MISMO mercado y la diferencia es el filtro.
//
// ╔═══ PRE-REGISTRO DE ESTE TEST · 2026-08-17 · NO TOCAR ═══╗
//   ENTRADA    TODOS los días de mercado, a las 11:00 ET. Sin excepciones y sin filtro.
//   ESTRUCTURA vender call a +25 puntos del dinero y put a −25; alas 50 puntos más allá
//   PRECIO     cruzando la horquilla entera: se vende al bid y se compra al ask
//   SALIDA     sostener al cierre. Sin stops, sin recompras: 30 reglas de gestión medidas y
//              29 pierden; la que "gana" es un stop a 8x que casi nunca salta (+$1/op, t=0,06)
//   COSTES     $0,03 por contrato y pata
//
// ╔═══ LO QUE EL BACKTEST DICE QUE DEBE PASAR (653 días, 2024-2026) ═══╗
//   · señal el 100% de los días
//   · 75% de acierto
//   · crédito mediano $500 (p10 $220 · p90 $1.175)
//   · +$74 por operación  ->  ~$18.770 al año por contrato
//   · peor día −$4.900 · peor racha acumulada −$15.176
//
// ⚠️ EL AVISO QUE MANDA SOBRE TODOS: el +$74/op tiene t=1,70. NO está establecido. Este
// registro existe justamente para eso — con 653 días más (un año) llegaría a t=2,0. Hasta
// entonces, cualquier lectura de "funciona" es prematura, incluida la mía.
//
// ⚠️ El GEX SE SIGUE CALCULANDO Y GUARDANDO en cada fila, simplemente no veta. Así este mismo
// ledger puede responder las dos preguntas más adelante sin montar un tercer registro.
//
// Uso:  node scripts/forward-condor-sinfiltro.mjs
//       node scripts/forward-condor-sinfiltro.mjs --dia 2026-08-18

import fs from 'node:fs';
import path from 'node:path';

// Este script pide rutas bajo /v3, pero el resto de servicios definen THETA_BASE SIN /v3
// (forward-test.ts, with-theta.mjs). Si en Railway existe esa variable a nivel de proyecto,
// aquí llegaría sin /v3 y todas las peticiones darían 404 — correría cada día y no grabaría
// nada, sin un solo error visible. Se normaliza en vez de confiar en cómo esté puesta.
const B = (process.env.THETA_BASE || 'http://127.0.0.1:25503').replace(/\/+$/, '').replace(/\/v3$/, '') + '/v3';
const SYM = 'SPXW';
const LEDGER = process.env.TRESSIES_LEDGER || 'data/forward/tres-sies.json';

// ── parámetros pre-registrados. NO TOCAR. ────────────────────────────────────
const HORA = '11:00';
const SEP = 45;              // ±45 · CONGELADO en el pre-registro del 2026-08-20
const CREDITO_MIN = 1.00;    // $100 por contrato · el TERCER SÍ
const ALA = 50;
const COMM = 0.03;
const PASO_STRIKE = 5;

// Distribución REAL del crédito del ±25 en los últimos 12 meses del backtest (n=73, precios reales,
// cruzando la horquilla entera). Medido el 2026-08-15 con gex-condor-ultimos-dias.mjs. Sirve para
// que el aviso de crédito compare contra un RANGO y no contra la mediana del año bueno.
const CRED = { p10: 100, p25: 130, p50: 190, p90: 420 };

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
const STORE = (process.env.TRESSIES_STORE || (process.env.REDIS_URL ? 'redis' : 'file')).toLowerCase();
const REDIS_KEY = process.env.TRESSIES_REDIS_KEY || 'forward:tres-sies';
let _redis = null;
async function redis() {
  if (!_redis) {
    if (!process.env.REDIS_URL) throw new Error('TRESSIES_STORE=redis pero falta REDIS_URL en el entorno');
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
    await escribirLatido(r, 'tres-sies', resumen || `${l.length} operaciones en el ledger`);
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
      // MISMO CRITERIO QUE EL BACKTEST. El filtro de horquilla al 50% del punto medio que había
      // aquí descartaba las ALAS (bid 0,05 / ask 0,10 = 71% del mid) y con ellas el cóndor entero,
      // justo los días de volatilidad BAJA. Sesgo silencioso, no ruido.
      if (!(bid >= 0) || !(ask > 0) || ask < bid || !(iv > 0.01) || iv > 4) continue;
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

// ── LAS MEDIAS DE 20 Y 50, CON CIERRES HASTA AYER ────────────────────────────
//
// EL FILTRO. Si a las 11:00 el SPX está por encima de su media de 20 sesiones Y de la de 50,
// se opera; si está por debajo de cualquiera de las dos, NO SE OPERA.
//
// EL MECANISMO, medido sobre 649 días: por DEBAJO de la media de 20, el movimiento medio de
// las 11:00 al cierre es de 37,1 puntos; por ENCIMA, de 18,9. Se vende a ±30. Por debajo de la
// media la estructura no cubre el movimiento que ese régimen produce — y es SIMÉTRICO: la tasa
// de romper sube igual en el lado call que en el put, así que no es una apuesta direccional
// disfrazada de filtro.
//
// ⚠️ SÓLO CIERRES DE AYER HACIA ATRÁS. El cierre de HOY no existe a las 11:00, y meterlo sería
// el mismo fallo que ya costó tres hallazgos en este proyecto.
async function mediasHastaAyer(dia) {
  // 90 días naturales atrás dan de sobra para 50 sesiones aun con festivos.
  const desde = new Date(Date.parse(dia + "T00:00:00Z") - 90 * 86400000)
    .toISOString().slice(0, 10).replace(/-/g, "");
  const d = await csv("index/history/eod?symbol=SPX&start_date=" + desde + "&end_date=" + dia.replace(/-/g, ""));
  if (!d?.filas.length) return null;
  const iC = d.cab.indexOf("close");
  const iT = d.cab.indexOf("last_trade") >= 0 ? d.cab.indexOf("last_trade") : d.cab.indexOf("created");
  if (iC < 0 || iT < 0) return null;
  const limpia = (x) => String(x ?? "").split('"').join("").trim();
  const porDia = new Map();
  for (const c of d.filas) {
    const f = limpia(c[iT]).slice(0, 10);
    const v = Number(limpia(c[iC]));
    if (f && v > 0 && f < dia) porDia.set(f, v);          // ESTRICTAMENTE anterior a hoy
  }
  const cierres = [...porDia.entries()].sort().map((x) => x[1]);
  if (cierres.length < 50) return null;                    // se DICE, no se rellena
  const med = (n) => cierres.slice(-n).reduce((a, b) => a + b, 0) / n;
  return { ma5: med(5), ma50: med(50), n: cierres.length };
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
  console.log(`\n═══ FORWARD-TEST · LOS TRES SÍES · ${DIA} ═══`);
  console.log(`   corriendo el ${ahoraET()} ET · 100% PAPEL, no ejecuta nada\n`);

  // 1. liquidar lo pendiente
  console.log('[1] liquidar pendientes');
  let liquidadas = 0;
  for (const op of ledger) {
    if (op.estado !== 'abierta') continue;
    const S = await cierreSPX(op.dia);
    if (S == null) { console.log(`    … ${op.dia}: aún sin cierre de SPX`); continue; }
    // ANCHO REAL de cada ala, no la constante: con el strike más cercano puede no ser 50.
    const anC = op.callLarga - op.callCorta, anP = op.putCorta - op.putLarga;
    const perd = Math.min(Math.max(S - op.callCorta, 0), anC) + Math.min(Math.max(op.putCorta - S, 0), anP);
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
      const mm = await mediasHastaAyer(DIA);
      if (!mm) {
        // SIN DATO NO SE OPERA, Y SE DICE. Nunca se rellena una media que no se pudo calcular.
        ledger.push({ ...base, estado: 'sin señal', motivo: 'sin cierres suficientes de SPX para las medias' });
        console.log('    ✗ sin cierres suficientes de SPX — no se opera');
      } else if (!(f.U >= mm.ma5 && f.U >= mm.ma50)) {
        ledger.push({ ...base, ma5: Math.round(mm.ma5 * 100) / 100, ma50: Math.round(mm.ma50 * 100) / 100,
                      estado: 'sin señal', motivo: 'SPX por debajo de su MA5 y/o MA50 — falla el sí 1 o el 2' });
        console.log('    SPX ' + f.U.toFixed(2) + ' · MA5 ' + mm.ma5.toFixed(2) + ' · MA50 ' + mm.ma50.toFixed(2) + '  ->  NO OPERAR (por debajo)');
      } else {
        base.ma5 = Math.round(mm.ma5 * 100) / 100;
        base.ma50 = Math.round(mm.ma50 * 100) / 100;
        // EL MÁS CERCANO al objetivo, igual que el backtest. Pedir el strike exacto hacía que
        // un día sin ese strike cotizado no operara aquí y sí allí.
        const cercaK = (mapa, obj) => [...mapa.keys()].reduce((a, b) => (Math.abs(b - obj) < Math.abs(a - obj) ? b : a));
        const Kc = cercaK(f.cad.C, f.U + SEP), Kp = cercaK(f.cad.P, f.U - SEP);
        const KcA = cercaK(f.cad.C, Kc + ALA), KpA = cercaK(f.cad.P, Kp - ALA);
        const c = f.cad.C.get(Kc), cA = f.cad.C.get(KcA), p = f.cad.P.get(Kp), pA = f.cad.P.get(KpA);
        if (!c || !cA || !p || !pA) {
          ledger.push({ ...base, estado: 'sin señal', motivo: 'GEX positivo pero faltan strikes cotizados' });
          console.log(`    GEX positivo pero faltan strikes para el cóndor -> no se opera`);
        } else {
          const credito = Math.round((c.bid + p.bid - cA.ask - pA.ask) * 100) / 100;
          // ── EL TERCER SÍ ──
          // Si el mercado no paga $100 por asumir $5.000 de riesgo, no se opera.
          // Ese umbral convirtió 2023 de −$6.713 a +$2.078, y NO detecta años malos:
          // simplemente se niega a arriesgar mucho por poco.
          if (credito < CREDITO_MIN) {
            ledger.push({ ...base, callCorta: Kc, putCorta: Kp, credito,
                          estado: 'sin señal',
                          motivo: 'crédito $' + Math.round(credito * 100) + ' — falla el sí 3 (mínimo $100)' });
            console.log('    SPX ' + f.U.toFixed(2) + ' · crédito $' + Math.round(credito * 100) + '  ->  NO OPERAR');
          } else {
          const anchoC = KcA - Kc, anchoP = Kp - KpA;
          if (!(anchoC > 0) || !(anchoP > 0)) throw new Error('ancho de ala no positivo: ' + anchoC + '/' + anchoP);
          ledger.push({ ...base, estado: 'abierta', callCorta: Kc, callLarga: KcA, putCorta: Kp, putLarga: KpA,
                        credito, riesgoMax: Math.round((Math.max(anchoC, anchoP) - credito) * 100),
                        precios: { callCorta: c.bid, callLarga: cA.ask, putCorta: p.bid, putLarga: pA.ask } });
          console.log(`    ✓ SEÑAL · SPX ${f.U.toFixed(2)} · GEX ${f.gexNeto >= 0 ? "+" : "−"}${Math.abs(f.gexNeto / 1e6).toFixed(0)}M`);
          console.log(`      vender call ${Kc} / comprar ${KcA}  ·  vender put ${Kp} / comprar ${KpA}`);
          console.log(`      crédito $${(credito * 100).toFixed(0)}  ·  riesgo máx $${((ALA - credito) * 100).toFixed(0)}  ·  gana si SPX cierra entre ${Kp} y ${Kc}`);
        }
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
  di(`    días registrados: ${ledger.length}  ·  con señal: ${señales.length} (${ledger.length ? Math.round(señales.length / ledger.length * 100) : 0}%, con los tres síes debe rondar el 20%)`);
  if (cer.length) {
    const gan = cer.filter(o => o.pl > 0);
    const tot = cer.reduce((s, o) => s + o.pl, 0);
    const cred = [...cer.map(o => o.credito * 100)].sort((a, b) => a - b);
    const credMed = cred[Math.floor(cred.length / 2)];
    di(`    cerradas: ${cer.length}  ·  acierto ${Math.round(gan.length / cer.length * 100)}% (backtest 94,5%)`);
    di(`    crédito mediano: $${credMed.toFixed(0)}  (últimos 12 meses del backtest: p10 $${CRED.p10} · mediana $${CRED.p50} · p90 $${CRED.p90})`);
    di(`    P&L acumulado: $${tot.toFixed(0)}  ·  por operación $${(tot / cer.length).toFixed(0)} (backtest $152)`);
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
    await escribirLatidoDirecto('tres-sies', `FALLÓ: ${e?.message ?? e}`);
  } catch { /* si ni eso se puede, que al menos el error salga */ }
  console.error(e);
  process.exit(1);
});
