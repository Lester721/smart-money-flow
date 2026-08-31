// FORWARD-TEST EN PAPEL — MARIPOSA DE HIERRO 0DTE de SPXW a las 15:00.
//
// NO ejecuta órdenes. Es hermano de forward-tres-sies.mjs, que sigue corriendo INTACTO: los dos
// cuadernos se comparan dentro de un año contra el mismo mercado y la diferencia es la regla.
//
// ╔═══ POR QUÉ EXISTE ═══╗
// Buscando el lado vendedor del agujero de comprar 0DTE por la tarde apareció esto: gana MÁS y
// asusta MENOS que el cóndor que ya corre. Y todo lo que se podía medir sobre 2022-2026 ya se
// gastó en elegirla, así que la ÚNICA prueba honesta que le queda es el futuro. Cada día sin
// cuaderno es un día de muestra fuera de muestra que se pierde.
//
// ╔═══ PRE-REGISTRO · 2026-08-22 · NO TOCAR ═══╗
//   ENTRADA    a las 15:00 ET, y sólo si el SPX está por encima de su media de 5 cierres Y de
//              la de 50 (calculadas con cierres ESTRICTAMENTE anteriores a hoy)
//   ESTRUCTURA mariposa de hierro AL DINERO: se venden la call y la put del strike múltiplo de
//              5 más cercano al precio, y se compran la call 50 puntos arriba y la put 50 abajo
//   PRECIO     cruzando la horquilla entera: lo vendido al bid, lo comprado al ask
//   SALIDA     NUNCA se cierra. Se deja vencer. Medido: las 282 formas de cerrar antes de
//              tiempo pierden dinero, entre $3.753 y $69.077 al año, sin una sola excepción —
//              son cuatro patas y cerrar hace pagar la horquilla otra vez en las cuatro
//   SIN FILTRO DE CRÉDITO. El cóndor tiene el suyo ($100); ésta NO. Si se le añade uno más
//              adelante, va en un cuaderno APARTE, no aquí.
//   COSTES     $0,03 por contrato y pata
//   TAMAÑO     1 contrato. Robinhood retiene $5.000, el mismo colateral que el cóndor.
//
// ╔═══ LO QUE EL BACKTEST DICE QUE DEBE PASAR (518 operaciones, 2022-2026) ═══╗
//   · opera 113 días al año (el filtro de medias apaga algo más de la mitad)
//   · 66,6% de acierto
//   · crédito mediano $790 (p10 $590 · p25 $655 · p90 $1.210)
//   · +$101 por operación  ->  $11.405 al año por contrato
//   · mediana $226 · peor día −$3.247 · peor bajón de la caja −$5.321
//   · ningún año perdedor: 2022 +$8.903 · 2023 +$14.907 · 2024 +$17.739 · 2025 +$8.494
//   · el 100% de los días acabó DENTRO de las alas (a las 15:00 sólo queda una hora)
//
// ╔═══ LAS CUATRO DEBILIDADES, ESCRITAS ANTES DE EMPEZAR ═══╗
//  1. NO CRUZA EL LISTÓN. 468 celdas medidas en este encargo más ~300 previas del proyecto
//     ponen el listón honesto cerca de t=4. La regla da t=3,41. No llega. Es exactamente el
//     mismo agujero que tiene «los tres síes», y por eso este cuaderno existe.
//  2. SE VA APAGANDO. Primera mitad $14.872/año, segunda $7.939. Tercios 17.122 / 8.014 / 9.106.
//     Si el forward test da la mitad de lo prometido, eso NO será una sorpresa.
//  3. EL FILTRO DE LAS MEDIAS NO ES NUEVO. Salió de un barrido sobre estos mismos días al
//     construir «los tres síes». Reutilizarlo aquí no es una comprobación independiente. A su
//     favor: mejora las 78 casillas donde se probó, sin una sola excepción.
//  4. 2022 CASI NO ESTÁ PROBADO: sólo 40 operaciones, porque el filtro apaga el mercado
//     bajista — que es justo el año que decidiría si esto aguanta un susto de verdad.
//
// ╔═══ QUÉ CONTARÁ COMO FRACASO ═══╗
//   · crédito mediano por debajo de $590 (el p10 del backtest) de forma sostenida
//   · acierto por debajo del 55% con 30 cierres o más
//   · CUALQUIER día que acabe FUERA de las alas siendo el backtest 0 de 518: sería la señal de
//     que el mercado de las 15:00 no es el que se midió
//   · P&L por operación negativo con 60 cierres o más
//
// ╔═══ LO QUE NO SE HARÁ ═══╗
//   · no se toca la hora, ni el ala, ni el filtro, ni se añade un mínimo de crédito
//   · no se cierra ninguna operación antes del vencimiento, pase lo que pase
//   · no se borra ninguna fila: las malas son el dato
//   · el GEX se calcula y se guarda en cada fila pero NO veta nada — medido el 2026-08-22:
//     no mejora esta regla (escalera no monótona, el barajado hace lo mismo, y dentro de
//     tercios de volatilidad se evapora). Se guarda para poder responder más adelante sin
//     montar otro cuaderno.
//
// Uso:  node scripts/forward-mariposa-15h.mjs
//       node scripts/forward-mariposa-15h.mjs --dia 2026-08-25

import fs from 'node:fs';
import path from 'node:path';

// Este script pide rutas bajo /v3, pero el resto de servicios definen THETA_BASE SIN /v3
// (forward-test.ts, with-theta.mjs). Si en Railway existe esa variable a nivel de proyecto,
// aquí llegaría sin /v3 y todas las peticiones darían 404 — correría cada día y no grabaría
// nada, sin un solo error visible. Se normaliza en vez de confiar en cómo esté puesta.
const B = (process.env.THETA_BASE || 'http://127.0.0.1:25503').replace(/\/+$/, '').replace(/\/v3$/, '') + '/v3';
const SYM = 'SPXW';
const LEDGER = process.env.MARIPOSA_LEDGER || 'data/forward/mariposa-15h.json';

// ── parámetros pre-registrados. NO TOCAR. ────────────────────────────────────
const HORA = '15:00';        // CONGELADO en el pre-registro del 2026-08-22
const ALA = 50;              // alas a 50 puntos, arriba y abajo
// SIN mínimo de crédito: es la diferencia deliberada con «los tres síes».
const COMM = 0.03;
const PASO_STRIKE = 5;

// Distribución REAL del crédito de esta mariposa, medida sobre las 518 operaciones del backtest
// con precios reales y cruzando la horquilla entera (scripts/_cred-mariposa.mjs, 2026-08-22).
// El aviso compara contra un RANGO y no contra una mediana inventada: el crédito rebota con la
// volatilidad, y un aviso que salta la mitad de los días normales enseña a ignorar los avisos.
// Últimos 12 meses (n=244): p10 $595 · p25 $670 · mediana $810 · p90 $1.260 — prácticamente igual.
const CRED = { p10: 590, p25: 655, p50: 790, p90: 1210 };

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
const STORE = (process.env.MARIPOSA_STORE || (process.env.REDIS_URL ? 'redis' : 'file')).toLowerCase();
const REDIS_KEY = process.env.MARIPOSA_REDIS_KEY || 'forward:mariposa-15h';
let _redis = null;
async function redis() {
  if (!_redis) {
    if (!process.env.REDIS_URL) throw new Error('MARIPOSA_STORE=redis pero falta REDIS_URL en el entorno');
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
    await escribirLatido(r, 'mariposa-15h', resumen || `${l.length} operaciones en el ledger`);
    return;
  }
  if (!fs.existsSync(path.dirname(LEDGER))) fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 1), 'utf8');
};

// ── la foto de las 15:00 (NO las 11:00 del condor: esta estrategia es de las 15:00) ──────────────────────────────────────────────────
async function foto(dia) {
  const oiRaw = await csv(`option/history/open_interest?symbol=${SYM}&expiration=${dia}&start_date=${dia}&end_date=${dia}`);
  if (!oiRaw) return null;
  const iK = oiRaw.cab.indexOf('strike'), iR = oiRaw.cab.indexOf('right'), iO = oiRaw.cab.indexOf('open_interest');
  const oi = { C: new Map(), P: new Map() };
  for (const c of oiRaw.filas) { const v = +c[iO]; if (v > 0) oi[c[iR].replace(/"/g, '') === 'CALL' ? 'C' : 'P'].set(+c[iK], v); }

  const cad = { C: new Map(), P: new Map() }; let U = 0;
  // LA CUNA DE LA MAÑANA, capturada en el MISMO bucle. La cadena que se descarga trae todas las
  // barras del día, así que leer también las 09:35 no cuesta ni una petición más. Sirve para
  // medir el crédito RELATIVO a lo que el mercado decía que se iba a mover ese día — sin eso,
  // un crédito de $800 en un día tranquilo y otro de $800 en uno salvaje se ven iguales.
  const cad35 = { C: new Map(), P: new Map() }; let U35 = 0;
  for (const lado of ['P', 'C']) {
    const d = await csv(`option/history/greeks/implied_volatility?symbol=${SYM}&expiration=${dia}&start_date=${dia}&end_date=${dia}&right=${lado}&interval=5m`);
    if (!d) return null;
    const jK = d.cab.indexOf('strike'), jT = d.cab.indexOf('timestamp'), jB = d.cab.indexOf('bid'),
          jA = d.cab.indexOf('ask'), jM = d.cab.indexOf('midpoint'), jV = d.cab.indexOf('implied_vol'), jU = d.cab.indexOf('underlying_price');
    for (const c of d.filas) {
      const hora = c[jT].slice(11, 16);
      if (hora === '09:35') {
        const u35 = +c[jU], a35 = +c[jA];
        if (u35 > 0) U35 = u35;
        if (a35 > 0) cad35[lado].set(+c[jK], a35);
      }
      if (hora !== HORA) continue;
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
  // La cuna al dinero de las 09:35, al ask las dos patas: lo que costaba comprar el movimiento
  // del día entero. NO veta nada — se guarda para poder medir después el filtro de crédito
  // relativo sin montar un segundo cuaderno.
  let cuna35 = null;
  if (U35 > 0 && cad35.C.size && cad35.P.size) {
    const cercano = (m) => [...m.keys()].reduce((a, b) => (Math.abs(b - U35) < Math.abs(a - U35) ? b : a));
    const Kc = cercano(cad35.C), Kp = cercano(cad35.P);
    // sólo vale si las dos patas caen en el MISMO strike; si no, no es una cuna al dinero
    if (Kc === Kp) cuna35 = Math.round((cad35.C.get(Kc) + cad35.P.get(Kp)) * 100) / 100;
  }
  return { U, T, cad, U35, cuna35, gexNeto: gC - gP, gexCalls: gC, gexPuts: gP };
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
  console.log(`\n═══ FORWARD-TEST · MARIPOSA DE HIERRO 15:00 · ${DIA} ═══`);
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
    if (!f) {
      // ⚠️ ANTES no se registraba NADA aqui. El cuaderno quedaba vacio y eso es
      //    indistinguible de "nunca corrio": el 31 de agosto llevaba 9 dias sin una sola fila
      //    y el informe decia "dias registrados: 0". El fallo real era de HORA — corria a las
      //    11:10 de Nueva York buscando la foto de las 15:00, cuatro horas en el futuro.
      //    Un dia sin dato se APUNTA, con su motivo. Un cuaderno vacio no dice nada; uno con
      //    nueve filas que dicen "sin datos a las 15:00" grita lo que pasa.
      const origen = Object.keys(process.env).some(k => k.startsWith('RAILWAY_'))
        ? `railway:${process.env.RAILWAY_SERVICE_NAME || '?'}` : 'local';
      ledger.push({ dia: DIA, hora: HORA, registradoEn: ahoraET(), origen, estado: 'sin señal',
                    motivo: `sin datos de ${SYM} a las ${HORA} (¿festivo, o el cron corrio antes de esa hora?)` });
      console.log(`    ✗ sin datos para ${DIA} a las ${HORA} — se APUNTA el dia con el motivo`);
    }
    else {
      // railway o local: sin esto el ledger no se puede auditar (ver lib/origenEjecucion.ts)
      const origen = Object.keys(process.env).some(k => k.startsWith('RAILWAY_'))
        ? `railway:${process.env.RAILWAY_SERVICE_NAME || '?'}` : 'local';
      const base = { dia: DIA, hora: HORA, registradoEn: ahoraET(), origen, spx: Math.round(f.U * 100) / 100,
                     spx0935: f.U35 ? Math.round(f.U35 * 100) / 100 : null,
                     cuna0935: f.cuna35,
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
        // LA MARIPOSA: las DOS patas vendidas en el MISMO strike, el pegado al precio. Ésa es
        // toda la diferencia con el cóndor, que las separa ±45. El backtest usa el múltiplo de 5
        // más cercano al precio; aquí se pide el más cercano COTIZADO, que es lo mismo salvo
        // cuando ese strike no tiene mercado.
        const Kc = cercaK(f.cad.C, f.U);
        const Kp = cercaK(f.cad.P, Kc);          // el MISMO strike, buscado en la cadena de puts
        const KcA = cercaK(f.cad.C, Kc + ALA), KpA = cercaK(f.cad.P, Kp - ALA);
        const c = f.cad.C.get(Kc), cA = f.cad.C.get(KcA), p = f.cad.P.get(Kp), pA = f.cad.P.get(KpA);
        if (!c || !cA || !p || !pA) {
          ledger.push({ ...base, estado: 'sin señal', motivo: 'faltan strikes cotizados para la mariposa' });
          console.log(`    faltan strikes para la mariposa -> no se opera`);
        } else if (Kc !== Kp) {
          // Si las dos patas cortas no caen en el mismo strike, esto NO es una mariposa. Antes
          // de registrar algo que no es lo pre-registrado, se dice y no se opera.
          ledger.push({ ...base, callCorta: Kc, putCorta: Kp, estado: 'sin señal',
                        motivo: `la call y la put más cercanas al dinero caen en strikes distintos (${Kc} y ${Kp})` });
          console.log(`    call en ${Kc} y put en ${Kp}: no es una mariposa -> no se opera`);
        } else {
          const credito = Math.round((c.bid + p.bid - cA.ask - pA.ask) * 100) / 100;
          const anchoC = KcA - Kc, anchoP = Kp - KpA;
          if (!(anchoC > 0) || !(anchoP > 0)) throw new Error('ancho de ala no positivo: ' + anchoC + '/' + anchoP);
          // SIN MÍNIMO DE CRÉDITO — es la diferencia deliberada con «los tres síes». Si algún
          // día se le quiere poner uno, va en un cuaderno APARTE.
          // EL COCIENTE QUE MIDE LA SEGUNDA REGLA. Declarado el 2026-08-23, antes de que exista
          // una sola operación: la variante «crédito ≥ 30% de la cuna de las 09:35» se evalúa
          // DESDE ESTE MISMO cuaderno filtrando por este campo. No hace falta un segundo
          // registro y así los dos no se pueden desincronizar.
          const credCuna = f.cuna35 > 0 ? Math.round((credito / f.cuna35) * 10000) / 10000 : null;
          ledger.push({ ...base, estado: 'abierta', callCorta: Kc, callLarga: KcA, putCorta: Kp, putLarga: KpA,
                        credito, creditoSobreCuna: credCuna,
                        riesgoMax: Math.round((Math.max(anchoC, anchoP) - credito) * 100),
                        precios: { callCorta: c.bid, callLarga: cA.ask, putCorta: p.bid, putLarga: pA.ask } });
          console.log(`    ✓ SEÑAL · SPX ${f.U.toFixed(2)} · GEX ${f.gexNeto >= 0 ? "+" : "−"}${Math.abs(f.gexNeto / 1e6).toFixed(0)}M (no veta, sólo se anota)`);
          console.log(`      vender call ${Kc} Y put ${Kp}  ·  comprar call ${KcA} y put ${KpA}`);
          console.log(`      crédito $${(credito * 100).toFixed(0)}  ·  riesgo máx $${((ALA - credito) * 100).toFixed(0)}  ·  gana si SPX cierra entre ${(Kp - credito).toFixed(0)} y ${(Kc + credito).toFixed(0)}`);
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
  di(`    días registrados: ${ledger.length}  ·  con señal: ${señales.length} (${ledger.length ? Math.round(señales.length / ledger.length * 100) : 0}%, el backtest dice ~46%)`);
  if (cer.length) {
    const gan = cer.filter(o => o.pl > 0);
    const tot = cer.reduce((s, o) => s + o.pl, 0);
    const cred = [...cer.map(o => o.credito * 100)].sort((a, b) => a - b);
    const credMed = cred[Math.floor(cred.length / 2)];
    di(`    cerradas: ${cer.length}  ·  acierto ${Math.round(gan.length / cer.length * 100)}% (backtest 66,6%)`);
    di(`    crédito mediano: $${credMed.toFixed(0)}  (backtest: p10 $${CRED.p10} · mediana $${CRED.p50} · p90 $${CRED.p90})`);
    di(`    P&L acumulado: $${tot.toFixed(0)}  ·  por operación $${(tot / cer.length).toFixed(0)} (backtest $101)`);
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
    await escribirLatidoDirecto('mariposa-15h', `FALLÓ: ${e?.message ?? e}`);
  } catch { /* si ni eso se puede, que al menos el error salga */ }
  console.error(e);
  process.exit(1);
});
