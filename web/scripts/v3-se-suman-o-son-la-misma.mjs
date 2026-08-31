// V3 — ¿SE SUMAN LAS CINCO SEÑALES O SON LA MISMA COSA VISTA CINCO VECES?
//
// ═══ LA PREGUNTA ════════════════════════════════════════════════════════════════════════════
//
// Cinco señales apuntan al mismo sitio — comprar cuando YA hay movimiento o la opción está CARA:
//   A · LA OPCIÓN CARA        (cuña al dinero ÷ movimiento real de 60 días), percentil propio
//   B · EL RUIDO DE AYER      (|movimiento del subyacente ayer|), percentil propio
//   C · EL FRENTE CARO        (sigma del vencimiento de 30 días ÷ el de 180), percentil propio
//   D · DESPUÉS DEL SUSTO     (mayor movimiento diario de las últimas 5 sesiones), percentil propio
//   E · LA SONRISA            (qué distancia está hoy más barata de lo normal para este ticker)
//
// La sospecha: A, B y D podrían ser la MISMA cosa vista de tres maneras. Cuando una acción pega
// un salto, la opción se encarece de golpe pero la desviación de 60 días apenas se mueve (un día
// entre sesenta), así que el cociente cuña/movimiento salta justo después del susto.
//
// POR ESO SE MIDE PRIMERO EL SOLAPAMIENTO (tabla 5×5) Y SÓLO DESPUÉS SE COMBINA.
//
// ═══ CÓMO SE MIDE — las tres cosas que cambiaron y que mandan ═══════════════════════════════
//
//   1. UNIVERSO DIARIO. Todas las sesiones, no una entrada al mes. (El 1.11 del "primer día del
//      mes" era la tirada afortunada de una muestra pequeña; el listón honesto es 0.95 / 1.00.)
//   2. PLAZO FIJADO A UNA BANDA ESTRECHA. Envase A sólo compra vencimientos de 55 a 65 días;
//      envase B, de 85 a 95. Si ese día no hay ninguno en la banda, ESE DÍA NO SE OPERA y se
//      cuenta. (El "efecto del día del mes" era PLAZO y LIQUIDEZ, no mercado.)
//   3. CONTRA EL LISTÓN HONESTO. Y además se vuelve a medir el envase vacío AQUÍ MISMO, en este
//      universo con la banda puesta, porque la banda cambia lo que se compra.
//
// ═══ EL ENVASE ══════════════════════════════════════════════════════════════════════════════
//   A: 10% fuera del dinero · vencimiento de 55-65 días · vender a los 30 días de bolsa
//   B:  5% fuera del dinero · vencimiento de 85-95 días · vender a los 30 días de bolsa
//   Opción SUELTA. Se COMPRA AL ASK y se VENDE AL BID. $1,000 arriesgados por pata.
//
// ═══ LAS REGLAS DE LA CASA ══════════════════════════════════════════════════════════════════
//   1. Se compra al ASK y se vende al BID. Nunca punto medio para el dinero. (La cuña de la
//      CURVA sí se lee a punto medio: es una LECTURA, no una operación.)
//   2. Ningún modelo de precios. Black-Scholes prohibido. Todo sale de la cadena.
//   3. UN HUECO NO ES UN CERO. Falta la cadena de salida o el vencimiento entero → se descarta y
//      se cuenta aparte. El vencimiento está y el contrato no → no tiene puja: vale 0, dato real.
//   4. SÓLO EL PASADO. Todo percentil se calcula contra los 250 días ANTERIORES del mismo ticker.
//   5. Se avisa de cuántas combinaciones se midieron.
//
// ═══ EL PRECIO DEL SUBYACENTE ═══════════════════════════════════════════════════════════════
// Paridad put-call SÓLO EN EL VENCIMIENTO MÁS CERCANO, la serie ya validada de w1/y9
// (scripts/cache-theta/_y9-spots.json). Y la misma criba de días rotos: sin precio, o se aparta
// >5% del cierre real, o salta >35% sin que el cierre real lo avale.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/v3-se-suman-o-son-la-misma.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const SPOTCACHE = "scripts/cache-theta/_y9-spots.json";

const APUESTA = 1000;
const SALIDA = 30;          // días de bolsa hasta vender
const ASKMIN = 0.10;
const TOLK = 0.50;          // cuánto puede apartarse el strike de la distancia pedida
const DISTS = [0.02, 0.05, 0.10, 0.15, 0.20];
const VENT_PCTL = 250;
const MIN_PCTL = 150;
const RV_VENT = 60;         // ventana del movimiento real (la de la señal A)
const ALTO = 0.80;          // "está en el quinto más alto de su propia historia"
const BAJO = 0.20;          // "está en el quinto más barato de su propia historia"

const ENVASES = [
  { id: "A", dist: 0.10, di: 2, lo: 55, hi: 65, obj: 60, liston: 0.95 },
  { id: "B", dist: 0.05, di: 1, lo: 85, hi: 95, obj: 90, liston: 1.00 },
];

// ── formato: punto para decimales, coma para miles ──────────────────────────
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "n/d");
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "n/d");
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const usd = (n) => (Number.isFinite(n) ? "$" + Math.round(n).toLocaleString("en-US") : "n/d");
const mil = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "n/d");
const L = (x = "") => console.log(x);
const linea = (t) => { L(`\n${"═".repeat(118)}`); L(`  ${t}`); L(`${"═".repeat(118)}`); };

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const cal = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const sd = (v) => { if (v.length < 2) return NaN; const m = v.reduce((a, x) => a + x, 0) / v.length; return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 0 — índice de días por ticker
// ════════════════════════════════════════════════════════════════════════════
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
let TICKERS = [...diasPorSim.keys()].filter((t) => diasPorSim.get(t).length >= 800).sort();
if (process.env.SOLO) TICKERS = TICKERS.filter((t) => process.env.SOLO.split(",").includes(t));

const leer = (sym, dia) => {
  const f = `${CDIR}/${sym}_d${dia}.json`;
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
};

/** EL SPOT: paridad put-call en el vencimiento MÁS CERCANO. Nada de mirar toda la cadena. */
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = cal(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
  if (!exp) return null;
  const g = c[exp];
  let K = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[`${k}|P`]; if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
  return s > 0 ? s : null;
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 1 — la serie de precios (la ya validada de w1/y9)
// ════════════════════════════════════════════════════════════════════════════
let SPOTS = existsSync(SPOTCACHE) ? JSON.parse(readFileSync(SPOTCACHE, "utf8")) : {};
{
  const faltan = TICKERS.filter((t) => !Array.isArray(SPOTS[t]) || SPOTS[t].length !== diasPorSim.get(t).length);
  if (faltan.length) {
    L(`## reconstruyendo la serie de precios de ${faltan.length} tickers`);
    for (const sym of faltan) {
      const arr = [];
      for (const d of diasPorSim.get(sym)) { const c = leer(sym, d); arr.push(c ? spotOk(c, d) : null); }
      SPOTS[sym] = arr;
      process.stderr.write(`\r   spots · ${sym}     `);
    }
    process.stderr.write("\n");
    writeFileSync(SPOTCACHE, JSON.stringify(SPOTS));
  } else {
    L(`## serie de precios leída de ${SPOTCACHE} (la misma de w1/y9) — ${TICKERS.length} tickers`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 2 — días rotos (misma criba que w1/y9)
// ════════════════════════════════════════════════════════════════════════════
const cierresDe = (t) => { const p = `${CIERRES}/${t}.json`; if (!existsSync(p)) return null; try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const ROTO = {}, PREF = {};
let rotoSinSpot = 0, rotoContraCierre = 0, rotoSalto = 0, saltoSalvado = 0;
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym), s = SPOTS[sym], cl = cierresDe(sym);
  const n = dias.length, ro = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (s[i] == null) { ro[i] = true; rotoSinSpot++; continue; }
    const c = cl?.[dias[i]];
    if (c != null && c > 0 && Math.abs(s[i] / c - 1) > 0.05) { ro[i] = true; rotoContraCierre++; continue; }
    if (i > 0 && s[i - 1] != null) {
      const rat = s[i] / s[i - 1];
      if (Math.abs(rat - 1) > 0.35) {
        const c0 = cl?.[dias[i - 1]], c1 = cl?.[dias[i]];
        if (c0 > 0 && c1 > 0 && Math.abs(rat / (c1 / c0) - 1) < 0.03) saltoSalvado++;
        else { ro[i] = true; rotoSalto++; }
      }
    }
  }
  ROTO[sym] = ro;
  const pf = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) pf[i + 1] = pf[i] + (ro[i] ? 1 : 0);
  PREF[sym] = pf;
}

// ════════════════════════════════════════════════════════════════════════════
// HERRAMIENTAS DE CADENA
// ════════════════════════════════════════════════════════════════════════════
/** Vencimiento dentro de la BANDA [lo,hi], el más cercano al objetivo. Fuera de banda: null. */
function expEnBanda(c, hoy, lo, hi, obj) {
  let mejor = null, md = Infinity, dte = 0;
  for (const e of Object.keys(c)) {
    const d = cal(hoy, e);
    if (d < lo || d > hi) continue;
    const x = Math.abs(d - obj);
    if (x < md) { md = x; mejor = e; dte = d; }
  }
  return mejor ? { exp: mejor, dte } : null;
}
/** El vencimiento más cercano a `obj` con tolerancia `tol` (para leer la CURVA, no para comprar). */
function expCerca(c, hoy, obj, tol) {
  let mejor = null, md = Infinity, dte = 0;
  for (const e of Object.keys(c)) {
    const d = cal(hoy, e);
    if (d < 1) continue;
    const x = Math.abs(d - obj);
    if (x < md) { md = x; mejor = e; dte = d; }
  }
  return mejor && md <= tol ? { exp: mejor, dte } : null;
}
/** Un vencimiento leído UNA sola vez: calls y puts en dos listas. Sin esto, cada búsqueda de
 *  contrato recorrería el objeto entero y el barrido tardaría horas. */
function parsea(g) {
  const C = [], P = [];
  for (const clave in g) {
    const ba = g[clave];
    const o = { K: Number(clave.slice(0, -2)), clave, bid: ba[0], ask: ba[1] };
    if (clave.charCodeAt(clave.length - 1) === 67) C.push(o); else P.push(o);
  }
  const byK = new Map();
  for (const o of C) byK.set(o.K, { c: o, p: null });
  for (const o of P) { const e = byK.get(o.K); if (e) e.p = o; }
  return { C, P, byK };
}
/** El strike AL DINERO de un vencimiento: asks de call y put, y la cuña (lo que cobran). */
function alDinero(pg, S) {
  let mej = null, dm = Infinity;
  for (const [K, e] of pg.byK) {
    if (!e.p) continue;
    const d = Math.abs(K - S);
    if (d < dm) { dm = d; mej = e; }
  }
  if (!mej || dm > S * 0.05) return null;
  const c = mej.c, p = mej.p;
  if (!(c.ask > 0) || !(p.ask > 0)) return null;
  return {
    K: c.K, askC: c.ask, askP: p.ask,
    cunaAsk: (c.ask + p.ask) / S,
    cunaMid: ((c.bid + c.ask) / 2 + (p.bid + p.ask) / 2) / S,
  };
}
/** El contrato de la esquina: `dist` fuera del dinero dentro de la tolerancia. */
function contrato(pg, S, dist, tipo) {
  const objetivo = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
  const lista = tipo === "C" ? pg.C : pg.P;
  let mej = null, dd = Infinity;
  for (const o of lista) {
    if (!(o.ask > 0) || o.ask < ASKMIN) continue;
    const d = Math.abs(o.K - objetivo);
    if (d < dd) { dd = d; mej = o; }
  }
  if (!mej) return null;
  const distReal = tipo === "C" ? mej.K / S - 1 : 1 - mej.K / S;
  if (Math.abs(distReal - dist) > dist * TOLK) return null;
  return { K: mej.K, clave: mej.clave, bid: mej.bid, ask: mej.ask, distReal };
}
/**
 * Percentil de cada valor contra las VENT_PCTL VECES ANTERIORES en que ese mismo ticker tuvo el
 * dato. Se cuentan OBSERVACIONES, no posiciones del calendario: con la banda de plazo puesta sólo
 * un día de cada tres tiene vencimiento en banda, y una ventana de 250 casillas se quedaría con
 * ~90 valores y nunca llegaría al mínimo. La ventana SIEMPRE termina antes del valor de hoy.
 */
function pctlSerie(serie) {
  const n = serie.length;
  const out = new Array(n).fill(null);
  const vals = [];
  for (let i = 0; i < n; i++) {
    const v = serie[i];
    if (v == null) continue;
    const desde = Math.max(0, vals.length - VENT_PCTL);
    const m = vals.length - desde;
    if (m >= MIN_PCTL) {
      let men = 0;
      for (let j = desde; j < vals.length; j++) if (vals[j] < v) men++;
      out[i] = men / m;
    }
    vals.push(v);
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 3 — EL BARRIDO. Un pase por ticker: métricas, contratos y salidas.
// ════════════════════════════════════════════════════════════════════════════
// REC[ei] = Map(sym -> [registros en orden de fecha])
const REC = ENVASES.map(() => new Map());
let diasLeidos = 0, sinBanda = 0, conBanda = 0, sinSpotEnt = 0, contaminadas = 0;
let huecos = 0, patasOk = 0, sinContrato = 0, sinPercentil = 0;
const t0 = Date.now();

for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym), n = dias.length;
  const s = SPOTS[sym], ro = ROTO[sym], pf = PREF[sym];

  // ── retornos diarios del subyacente, saltando los días rotos ──────────────
  const r = new Array(n).fill(null);
  for (let i = 1; i < n; i++) { if (ro[i] || ro[i - 1]) continue; r[i] = s[i] / s[i - 1] - 1; }
  // rv de 60 días, SIEMPRE terminando en i-1
  const rv = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const v = [];
    for (let j = i - 1; j >= 0 && v.length < RV_VENT; j--) if (r[j] != null) v.push(Math.log(1 + r[j]));
    if (v.length < Math.round(RV_VENT * 0.8)) continue;
    const x = sd(v);
    if (x > 0) rv[i] = x;
  }
  // B · el ruido de AYER  y  D · el mayor movimiento de las últimas 5 sesiones (hasta i-1)
  const mRuido = new Array(n).fill(null), mSusto = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (i >= 1 && r[i - 1] != null) mRuido[i] = Math.abs(r[i - 1]);
    let mx = 0, c = 0;
    for (let j = i - 5; j <= i - 1; j++) { if (j < 0 || r[j] == null) continue; c++; const a = Math.abs(r[j]); if (a > mx) mx = a; }
    if (c >= 4) mSusto[i] = mx;
  }

  // ── series que salen de la cadena ─────────────────────────────────────────
  const mCaro = ENVASES.map(() => new Array(n).fill(null));
  const mCurva = new Array(n).fill(null);
  // sonrisa: score[ei][dist][side] = ask(dist) / ask(al dinero), del vencimiento que se compra
  const mSonr = ENVASES.map(() => DISTS.map(() => [new Array(n).fill(null), new Array(n).fill(null)]));
  // contratos y salidas
  const CT = ENVASES.map(() => new Array(n).fill(null));
  const RET = ENVASES.map(() => new Float64Array(n * 10).fill(NaN));
  const HQ = ENVASES.map(() => new Float64Array(n * 10).fill(NaN));   // horquilla pagada, en % de la prima
  const ASK = ENVASES.map(() => new Float64Array(n * 10).fill(NaN));

  // pendientes de salida: índice de día de salida -> [{ei, i, li, exp, clave, ask}]
  const pend = new Map();

  for (let i = 0; i < n; i++) {
    const c = leer(sym, dias[i]);
    diasLeidos++;
    if (c) {
      // ── 1) cerrar lo que sale hoy ───────────────────────────────────────
      if (pend.has(i)) {
        for (const o of pend.get(i)) {
          const g = c[o.exp];
          if (!g) { huecos++; continue; }          // el vencimiento entero no está: HUECO
          const salida = g[o.clave]?.[0] ?? 0;      // sin puja = 0. Dato real.
          RET[o.ei][o.i * 10 + o.li] = (salida - o.ask) / o.ask;
          patasOk++;
        }
        pend.delete(i);
      }
      // ── 2) leer las métricas y abrir lo de hoy ──────────────────────────
      const S = s[i];
      if (S != null && !ro[i]) {
        const pcache = new Map();
        const pget = (e) => { let v = pcache.get(e); if (!v) { v = parsea(c[e]); pcache.set(e, v); } return v; };
        // C · la curva del propio ticker: frente (30d) contra fondo (180d), a punto medio
        const ef = expCerca(c, dias[i], 30, 10), eb = expCerca(c, dias[i], 180, 45);
        if (ef && eb && c[ef.exp] && c[eb.exp]) {
          const af = alDinero(pget(ef.exp), S), ab = alDinero(pget(eb.exp), S);
          if (af && ab) {
            const sf = af.cunaMid / Math.sqrt(ef.dte / 365), sb = ab.cunaMid / Math.sqrt(eb.dte / 365);
            if (sf > 0 && sb > 0) mCurva[i] = sf / sb;
          }
        }
        for (let ei = 0; ei < ENVASES.length; ei++) {
          const env = ENVASES[ei];
          const eo = expEnBanda(c, dias[i], env.lo, env.hi, env.obj);
          if (!eo) { sinBanda++; continue; }
          conBanda++;
          const g = pget(eo.exp);
          const atm = alDinero(g, S);
          // A · lo cara que está la opción: cuña ÷ movimiento real, escalado al plazo
          if (atm && rv[i] != null) {
            const diasBolsa = Math.max(1, eo.dte * 252 / 365);
            const mov = rv[i] * Math.sqrt(diasBolsa);
            if (mov > 0) mCaro[ei][i] = atm.cunaAsk / mov;
          }
          // los diez contratos del día (5 distancias × call/put) + la sonrisa
          const legs = new Array(10).fill(null);
          for (let d = 0; d < DISTS.length; d++) {
            for (let t = 0; t < 2; t++) {
              const tipo = t === 0 ? "C" : "P";
              const ct = contrato(g, S, DISTS[d], tipo);
              if (!ct) { sinContrato++; continue; }
              legs[d * 2 + t] = ct;
              HQ[ei][i * 10 + d * 2 + t] = (ct.ask - ct.bid) / ct.ask;
              ASK[ei][i * 10 + d * 2 + t] = ct.ask;
              if (atm) {
                const base = t === 0 ? atm.askC : atm.askP;
                if (base > 0) mSonr[ei][d][t][i] = ct.ask / base;
              }
            }
          }
          CT[ei][i] = { exp: eo.exp, dte: eo.dte, legs };
        }
      }
    }
    // ── 3) programar las salidas de hoy (se hace fuera del if(c) por claridad) ──
    if (!c) continue;
    for (let ei = 0; ei < ENVASES.length; ei++) {
      const ct = CT[ei][i];
      if (!ct) continue;
      const iSal = i + SALIDA;
      if (iSal >= n) continue;                                  // no hay salida: no se abre
      if (dias[iSal] >= ct.exp) continue;                       // no debería pasar con la banda
      if (pf[iSal + 1] - pf[i] > 0) { contaminadas++; continue; } // día roto por el camino
      for (let li = 0; li < 10; li++) {
        if (!ct.legs[li]) continue;
        if (!pend.has(iSal)) pend.set(iSal, []);
        pend.get(iSal).push({ ei, i, li, exp: ct.exp, clave: ct.legs[li].clave, ask: ct.legs[li].ask });
      }
    }
    if (i % 400 === 0) process.stderr.write(`\r   ${sym} · ${mil(diasLeidos)} días · ${Math.round((Date.now() - t0) / 1000)}s     `);
  }
  // lo que quede abierto al final del fichero no tiene salida: hueco
  for (const [, arr] of pend) huecos += arr.length;

  // ── percentiles y registros ────────────────────────────────────────────────
  const pRuido = pctlSerie(mRuido), pSusto = pctlSerie(mSusto), pCurva = pctlSerie(mCurva);

  for (let ei = 0; ei < ENVASES.length; ei++) {
    const pCaro = pctlSerie(mCaro[ei]);
    const pSon = DISTS.map((_, d) => [pctlSerie(mSonr[ei][d][0]), pctlSerie(mSonr[ei][d][1])]);

    const lista = [];
    for (let i = 0; i < n; i++) {
      const ct = CT[ei][i];
      if (!ct) continue;
      // ¿hay al menos una pata con salida medida?
      let alguna = false;
      for (let li = 0; li < 10; li++) if (Number.isFinite(RET[ei][i * 10 + li])) { alguna = true; break; }
      if (!alguna) continue;
      // E · la sonrisa: qué distancia está hoy más barata de lo normal PARA ESTE TICKER
      let eIdx = null, eMin = null;
      for (let d = 0; d < DISTS.length; d++) {
        const a = pSon[d][0][i], b = pSon[d][1][i];
        if (a == null || b == null) continue;
        if (!Number.isFinite(RET[ei][i * 10 + d * 2]) && !Number.isFinite(RET[ei][i * 10 + d * 2 + 1])) continue;
        const v = (a + b) / 2;
        if (eMin == null || v < eMin) { eMin = v; eIdx = d; }
      }
      const rets = new Float64Array(10), hq = new Float64Array(10), ask = new Float64Array(10);
      for (let li = 0; li < 10; li++) { rets[li] = RET[ei][i * 10 + li]; hq[li] = HQ[ei][i * 10 + li]; ask[li] = ASK[ei][i * 10 + li]; }
      lista.push({
        sym, dia: dias[i], ano: dias[i].slice(0, 4), dte: ct.dte,
        pA: pCaro[i], pB: pRuido[i], pC: pCurva[i], pD: pSusto[i], pE: eMin,
        ruido: mRuido[i], eIdx, rets, hq, ask,
      });
      if (pCaro[i] == null || pRuido[i] == null || pCurva[i] == null || pSusto[i] == null || eMin == null) sinPercentil++;
    }
    REC[ei].set(sym, lista);
  }
  process.stderr.write(`\r   ${sym} · ${mil(diasLeidos)} días · ${Math.round((Date.now() - t0) / 1000)}s     `);
}
process.stderr.write("\n");

// ════════════════════════════════════════════════════════════════════════════
// LA VARA
// ════════════════════════════════════════════════════════════════════════════
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0, max: 0 });
function meteLeg(a, ret) {
  const d = APUESTA * ret;
  a.n++;
  if (d > 0) { a.win++; a.gan += d; if (d > a.max) a.max = d; } else a.per += -d;
}
const R = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const AC = (a) => (a.n ? a.win / a.n : NaN);

/** Mide una regla: `pred` decide QUÉ DÍAS, `strike` decide QUÉ DISTANCIA (índice en DISTS). */
function mide(filas, pred, strike) {
  const a = acc();
  for (const o of filas) {
    if (!pred(o)) continue;
    const d = strike(o);
    if (d == null) continue;
    for (let t = 0; t < 2; t++) { const x = o.rets[d * 2 + t]; if (Number.isFinite(x)) meteLeg(a, x); }
  }
  return a;
}
/** Los k billetes más gordos de una regla, con TODO lo que hace falta para ir al fichero a mirarlo.
 *  Un ratio que vive de un billete de $200,000 hay que verlo antes de creérselo. */
function billetes(filas, pred, strike, k = 8) {
  const v = [];
  for (const o of filas) {
    if (!pred(o)) continue;
    const d = strike(o);
    if (d == null) continue;
    for (let t = 0; t < 2; t++) {
      const x = o.rets[d * 2 + t];
      if (!Number.isFinite(x)) continue;
      v.push({ d: APUESTA * x, sym: o.sym, dia: o.dia, dist: DISTS[d], tipo: t === 0 ? "call" : "put", veces: 1 + x });
    }
  }
  v.sort((a, b) => b.d - a.d);
  return v.slice(0, k);
}
function midePorClave(filas, pred, strike, clave) {
  const m = new Map();
  for (const o of filas) {
    if (!pred(o)) continue;
    const d = strike(o);
    if (d == null) continue;
    const k = clave(o);
    if (!m.has(k)) m.set(k, acc());
    for (let t = 0; t < 2; t++) { const x = o.rets[d * 2 + t]; if (Number.isFinite(x)) meteLeg(m.get(k), x); }
  }
  return m;
}

// ── las cinco señales ───────────────────────────────────────────────────────
// `g(u)` rehace la misma señal con el corte movido — para poder mirar si la ganadora tiene vecinas
const SIG = [
  { id: "A", et: "la opción CARA (cuña ÷ movimiento de 60d, quinto más alto)", g: (u) => (o) => o.pA > u },
  { id: "B", et: "el RUIDO DE AYER (quinto más alto del propio ticker)", g: (u) => (o) => o.pB > u },
  { id: "C", et: "el FRENTE CARO respecto al fondo (quinto más alto)", g: (u) => (o) => o.pC > u },
  { id: "D", et: "DESPUÉS DEL SUSTO (mayor mov. de 5 sesiones, quinto más alto)", g: (u) => (o) => o.pD > u },
  { id: "E", et: "LA SONRISA barata (la distancia del día, quinto más barato)", g: (u) => (o) => o.pE < 1 - u },
];
for (const s of SIG) s.f = s.g(ALTO);
const NS = SIG.length;

// base común: sólo los días donde LAS CINCO señales existen. Si no, la tabla 5×5 compararía
// poblaciones distintas y el solapamiento saldría inventado.
const completo = (o) => o.pA != null && o.pB != null && o.pC != null && o.pD != null && o.pE != null;
const BASE = ENVASES.map((_, ei) => {
  const v = [];
  for (const lista of REC[ei].values()) for (const o of lista) if (completo(o)) v.push(o);
  v.sort((x, y) => (x.dia < y.dia ? -1 : x.dia > y.dia ? 1 : 0));
  return v;
});
const TODO = ENVASES.map((_, ei) => { const v = []; for (const lista of REC[ei].values()) v.push(...lista); return v; });

const ANOS = [...new Set(BASE[0].map((o) => o.ano))].sort();
const NANOS = ANOS.length;
const FIJO = ENVASES.map((e) => () => e.di);
const fijo = (ei) => FIJO[ei];
const PORE = (o) => o.eIdx;
const porE = () => PORE;

// ════════════════════════════════════════════════════════════════════════════
// SANIDAD
// ════════════════════════════════════════════════════════════════════════════
linea("SANIDAD — antes de mirar ningún resultado");
L(`  tickers: ${TICKERS.length} · días de cadena leídos: ${mil(diasLeidos)} · de ${diasPorSim.get(TICKERS[0])[0]} a ${diasPorSim.get(TICKERS[0]).at(-1)}`);
L(`  DÍAS CON VENCIMIENTO EN LA BANDA: ${mil(conBanda)} de ${mil(conBanda + sinBanda)} intentos (envase × día) = ${pct(conBanda / (conBanda + sinBanda))}`);
L(`  → los ${mil(sinBanda)} restantes NO SE OPERAN. Es el precio de fijar el plazo, y está contado.`);
L(`  patas con salida medida: ${mil(patasOk)} · HUECOS descartados (falta el vencimiento en la cadena de salida): ${mil(huecos)} = ${pct(huecos / (huecos + patasOk))}`);
L(`  entradas descartadas por día roto entre compra y venta: ${mil(contaminadas)}`);
L(`  combinaciones distancia×lado sin contrato que encaje (strike lejos o ask < $${f2(ASKMIN)}): ${mil(sinContrato)}`);
L(`  días rotos: sin precio ${mil(rotoSinSpot)} · se apartan >5% del cierre real ${mil(rotoContraCierre)} · saltos >35% no avalados ${mil(rotoSalto)} · saltos avalados que se quedan ${saltoSalvado}`);
for (let ei = 0; ei < ENVASES.length; ei++) {
  const env = ENVASES[ei];
  const t = TODO[ei], b = BASE[ei];
  const dteMed = t.reduce((a, o) => a + o.dte, 0) / Math.max(1, t.length);
  L(`\n  ENVASE ${env.id} — ${pct(env.dist)} fuera · vencimiento de ${env.lo}-${env.hi} días · vender a los ${SALIDA} de bolsa`);
  L(`    días de entrada con contrato: ${mil(t.length)} · plazo real medio ${f1(dteMed)} días (banda ${env.lo}-${env.hi}, se pidió ${env.obj})`);
  L(`    días donde LAS CINCO señales existen (base común): ${mil(b.length)} = ${pct(b.length / Math.max(1, t.length))} — el resto es calentamiento de los 250 días`);
}

// ════════════════════════════════════════════════════════════════════════════
// EL LISTÓN MEDIDO AQUÍ MISMO
// ════════════════════════════════════════════════════════════════════════════
linea("EL LISTÓN — el envase VACÍO en ESTE universo (diario + banda estrecha de plazo)");
L(`  | envase | población | n (patas) | ops/año | RATIO | acierto | ganador medio | perdedor medio | listón publicado |`);
L(`  |---|---|---|---|---|---|---|---|---|`);
const LISTON = [];
for (let ei = 0; ei < ENVASES.length; ei++) {
  const env = ENVASES[ei];
  const todo = mide(TODO[ei], () => true, fijo(ei));
  const base = mide(BASE[ei], () => true, fijo(ei));
  LISTON[ei] = base;
  L(`  | ${env.id} | todos los días con banda | ${mil(todo.n)} | ${mil(todo.n / NANOS)} | **${f2(R(todo))}** | ${pct(AC(todo))} | ${usd(todo.gan / todo.win)} | ${usd(todo.per / (todo.n - todo.win))} | ${f2(env.liston)} |`);
  L(`  | ${env.id} | **base común (las 5 señales existen)** | ${mil(base.n)} | ${mil(base.n / NANOS)} | **${f2(R(base))}** | ${pct(AC(base))} | ${usd(base.gan / base.win)} | ${usd(base.per / (base.n - base.win))} | ${f2(env.liston)} |`);
}
L(`\n  El listón que cuenta para todo lo de abajo es el de la BASE COMÚN del envase A: ${f2(R(LISTON[0]))}`);
L(`  (el publicado sin banda de plazo era ${f2(ENVASES[0].liston)}; la banda cambia lo que se compra, por eso se vuelve a medir)`);

// ════════════════════════════════════════════════════════════════════════════
// PASO 1 — EL SOLAPAMIENTO. Antes de combinar nada.
// ════════════════════════════════════════════════════════════════════════════
linea("PASO 1 · EL SOLAPAMIENTO — ¿son cinco señales o es una vista cinco veces?");
{
  const base = BASE[0];
  // los días (fecha+ticker) son la unidad, no las patas
  const disp = SIG.map((s) => base.filter(s.f).length);
  L(`  Base: ${mil(base.length)} días-ticker del envase A donde las cinco señales existen.`);
  L(`\n  Cuántos días dispara cada una por su cuenta:`);
  L(`  | señal | días | fracción de días |`);
  L(`  |---|---|---|`);
  for (let i = 0; i < NS; i++) L(`  | ${SIG[i].id} · ${SIG[i].et} | ${mil(disp[i])} | ${pct(disp[i] / base.length)} |`);

  L(`\n  LA TABLA 5×5 — de los días en que dispara la de la FILA, qué % dispara también la de la COLUMNA.`);
  L(`  Si fueran independientes, cada casilla saldría igual a la fracción propia de la columna (~20%).`);
  L(`  Si fueran la misma cosa, saldría 100%.`);
  L(`  | dispara → | ${SIG.map((s) => s.id).join(" | ")} |`);
  L(`  |---|${SIG.map(() => "---").join("|")}|`);
  const cond = Array.from({ length: NS }, () => new Array(NS).fill(0));
  const jac = Array.from({ length: NS }, () => new Array(NS).fill(0));
  for (let a = 0; a < NS; a++) {
    const fa = base.filter(SIG[a].f);
    for (let b = 0; b < NS; b++) {
      const both = fa.filter(SIG[b].f).length;
      cond[a][b] = fa.length ? both / fa.length : NaN;
      const either = base.filter((o) => SIG[a].f(o) || SIG[b].f(o)).length;
      jac[a][b] = either ? both / either : NaN;
    }
    L(`  | **${SIG[a].id}** (n=${mil(fa.length)}) | ${cond[a].map((x, b) => (a === b ? "—" : pct(x))).join(" | ")} |`);
  }
  L(`\n  LO MISMO EN UNA SOLA CIFRA POR PAREJA — solapamiento = días en que disparan LAS DOS ÷ días en que dispara ALGUNA.`);
  L(`  0% = no coinciden nunca · 100% = son idénticas · ~11% = lo que darían dos monedas independientes al 20%.`);
  L(`  | pareja | solapamiento | veredicto |`);
  L(`  |---|---|---|`);
  const parejas = [];
  for (let a = 0; a < NS; a++) for (let b = a + 1; b < NS; b++) {
    const j = jac[a][b];
    const v = j > 0.55 ? "LA MISMA COSA" : j > 0.30 ? "muy parecidas" : j > 0.16 ? "algo pegadas" : "independientes";
    parejas.push({ a, b, j, v });
  }
  parejas.sort((x, y) => y.j - x.j);
  for (const p of parejas) L(`  | ${SIG[p.a].id} + ${SIG[p.b].id} | ${pct(p.j)} | ${p.v} |`);
  L(`\n  Y la sospecha concreta del encargo — ¿es A el eco de un susto?`);
  const dA = base.filter(SIG[0].f);
  L(`    de los días en que dispara A (la opción cara), el ${pct(dA.filter(SIG[3].f).length / dA.length)} venía de un susto (D) y el ${pct(dA.filter(SIG[1].f).length / dA.length)} de ruido ayer (B).`);
  L(`    si A fuera el eco del susto, estos dos números serían altísimos; el suelo de "independiente" es ${pct(disp[3] / base.length)} y ${pct(disp[1] / base.length)}.`);
}

// ════════════════════════════════════════════════════════════════════════════
// PASO 2 — LAS CINCO SUELTAS
// ════════════════════════════════════════════════════════════════════════════
linea("PASO 2 · LAS CINCO SEÑALES SUELTAS en el universo diario con la banda puesta");
const SUELTAS = [];
for (let ei = 0; ei < ENVASES.length; ei++) {
  const base = BASE[ei], lst = LISTON[ei];
  L(`\n  ── ENVASE ${ENVASES[ei].id} · listón de la base común ${f2(R(lst))} / acierta ${pct(AC(lst))} ──`);
  L(`  | señal | n (patas) | ops/año | RATIO | acierto | ganador medio | perdedor medio |`);
  L(`  |---|---|---|---|---|---|---|`);
  for (const sg of SIG) {
    // E se mide de sus dos maneras: como MOMENTO (cuándo) y como STRIKE (qué distancia)
    const a = mide(base, sg.f, fijo(ei));
    L(`  | ${sg.id} · ${sg.et} | ${mil(a.n)} | ${mil(a.n / NANOS)} | **${f2(R(a))}** | ${pct(AC(a))} | ${usd(a.gan / a.win)} | ${usd(a.per / (a.n - a.win))} |`);
    if (ei === 0) SUELTAS.push({ id: sg.id, et: sg.et, a, pred: sg.f, strike: FIJO[0], gen: sg.g });
  }
  const es = mide(base, () => true, PORE);
  L(`  | E' · LA SONRISA como STRIKE (todos los días, la distancia más barata) | ${mil(es.n)} | ${mil(es.n / NANOS)} | **${f2(R(es))}** | ${pct(AC(es))} | ${usd(es.gan / es.win)} | ${usd(es.per / (es.n - es.win))} |`);
  if (ei === 0) SUELTAS.push({ id: "E'", et: "LA SONRISA como STRIKE (todos los días)", a: es, pred: () => true, strike: PORE, gen: null });
}
{
  const rep = new Map([["A", 1.67], ["B", 1.08], ["C", 1.45], ["D", 1.36], ["E'", 1.18]]);
  L(`\n  Contra lo que daban ANTES (universo del día 1 del mes, listón inflado de 1.11):`);
  L(`  | señal | daba antes | da ahora (envase A) | diferencia |`);
  L(`  |---|---|---|---|`);
  for (const s of SUELTAS) {
    const v = rep.get(s.id);
    if (v == null) continue;
    L(`  | ${s.id} | ${f2(v)} | ${f2(R(s.a))} | ${f2(R(s.a) - v)} |`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PASO 3 — LAS COMBINACIONES
// ════════════════════════════════════════════════════════════════════════════
linea("PASO 3 · LAS COMBINACIONES — exigir DOS, exigir ALGUNA, y la de DOS PISOS");
const COMB = [];
const idxE = 4;
const TIEMPO = [0, 1, 2, 3];    // A B C D deciden CUÁNDO; E es de otra naturaleza

const pon = (et, fam, gen, strike) => COMB.push({ et, fam, gen, pred: gen(ALTO), strike });
// (a) parejas AND y OR entre las cinco
for (let a = 0; a < NS; a++) for (let b = a + 1; b < NS; b++) {
  pon(`${SIG[a].id} Y ${SIG[b].id} a la vez`, "dos a la vez",
    (u) => { const fa = SIG[a].g(u), fb = SIG[b].g(u); return (o) => fa(o) && fb(o); }, FIJO[0]);
  pon(`${SIG[a].id} O ${SIG[b].id} (al menos una)`, "al menos una",
    (u) => { const fa = SIG[a].g(u), fb = SIG[b].g(u); return (o) => fa(o) || fb(o); }, FIJO[0]);
}
// (b) cuántas de las cinco a la vez
for (const k of [1, 2, 3]) pon(`al menos ${k} de las cinco`, `${k} de 5`,
  (u) => { const fs = SIG.map((s) => s.g(u)); return (o) => fs.reduce((z, f) => z + (f(o) ? 1 : 0), 0) >= k; }, FIJO[0]);
// (c) DOS PISOS: una decide CUÁNDO, E decide QUÉ STRIKE
for (const i of TIEMPO) pon(`${SIG[i].id} decide CUÁNDO + la sonrisa decide el STRIKE`, "dos pisos", (u) => SIG[i].g(u), PORE);
for (let a = 0; a < TIEMPO.length; a++) for (let b = a + 1; b < TIEMPO.length; b++) {
  pon(`${SIG[a].id} Y ${SIG[b].id} deciden CUÁNDO + la sonrisa el STRIKE`, "dos pisos",
    (u) => { const fa = SIG[a].g(u), fb = SIG[b].g(u); return (o) => fa(o) && fb(o); }, PORE);
  pon(`${SIG[a].id} O ${SIG[b].id} deciden CUÁNDO + la sonrisa el STRIKE`, "dos pisos",
    (u) => { const fa = SIG[a].g(u), fb = SIG[b].g(u); return (o) => fa(o) || fb(o); }, PORE);
}
for (const k of [1, 2, 3]) pon(`al menos ${k} de A/B/C/D deciden CUÁNDO + la sonrisa el STRIKE`, "dos pisos",
  (u) => { const fs = TIEMPO.map((i) => SIG[i].g(u)); return (o) => fs.reduce((z, f) => z + (f(o) ? 1 : 0), 0) >= k; }, PORE);

for (const c of COMB) c.a = mide(BASE[0], c.pred, c.strike);
const MIN_OPS_ANO = 200;   // con el universo diario, una regla utilizable tiene que dejar muestra

L(`  Envase A. Listón de la base común: ${f2(R(LISTON[0]))} / acierta ${pct(AC(LISTON[0]))}.`);
L(`  Se piden al menos ${MIN_OPS_ANO} patas al año para considerar una regla utilizable.`);
for (const fam of ["dos a la vez", "al menos una", "1 de 5", "2 de 5", "3 de 5", "dos pisos"]) {
  const v = COMB.filter((c) => c.fam === fam).sort((x, y) => R(y.a) - R(x.a));
  if (!v.length) continue;
  L(`\n  ── ${fam.toUpperCase()} ──`);
  L(`  | regla | n (patas) | ops/año | RATIO | acierto |`);
  L(`  |---|---|---|---|---|`);
  for (const c of v) L(`  | ${c.et} | ${mil(c.a.n)} | ${mil(c.a.n / NANOS)} | **${f2(R(c.a))}** | ${pct(AC(c.a))} |`);
}

// ════════════════════════════════════════════════════════════════════════════
// PASO 4 — LA GANADORA A EXAMEN
// ════════════════════════════════════════════════════════════════════════════
const TODAS = [
  ...SUELTAS.map((s) => ({ et: `${s.id} · ${s.et}`, fam: "suelta", pred: s.pred, strike: s.strike, a: s.a, gen: s.gen })),
  ...COMB,
];
const utilizables = TODAS.filter((c) => c.a.n / NANOS >= MIN_OPS_ANO);
const ranking = [...utilizables].sort((x, y) => R(y.a) - R(x.a));
const mejorSuelta = [...SUELTAS].filter((s) => s.a.n / NANOS >= MIN_OPS_ANO).sort((x, y) => R(y.a) - R(x.a))[0];
const mejorComb = [...COMB].filter((c) => c.a.n / NANOS >= MIN_OPS_ANO).sort((x, y) => R(y.a) - R(x.a))[0];
const GAN = ranking[0];

linea("PASO 4 · LA GANADORA A EXAMEN");
L(`  Ranking de las diez mejores con al menos ${MIN_OPS_ANO} patas al año:`);
L(`  | # | regla | familia | n | ops/año | RATIO | acierto |`);
L(`  |---|---|---|---|---|---|---|`);
ranking.slice(0, 10).forEach((c, i) => L(`  | ${i + 1} | ${c.et} | ${c.fam} | ${mil(c.a.n)} | ${mil(c.a.n / NANOS)} | **${f2(R(c.a))}** | ${pct(AC(c.a))} |`));

L(`\n  LA PREGUNTA DEL ENCARGO:`);
L(`    mejor señal SUELTA     : ${mejorSuelta ? `${mejorSuelta.id} · ${f2(R(mejorSuelta.a))} (${mil(mejorSuelta.a.n / NANOS)} ops/año)` : "ninguna llega al mínimo"}`);
L(`    mejor COMBINACIÓN      : ${mejorComb ? `${mejorComb.et} · ${f2(R(mejorComb.a))} (${mil(mejorComb.a.n / NANOS)} ops/año)` : "ninguna llega al mínimo"}`);
if (mejorSuelta && mejorComb) {
  const gana = R(mejorComb.a) > R(mejorSuelta.a);
  L(`    → la mejor combinación ${gana ? "GANA" : "PIERDE"} contra la mejor señal suelta (${f2(R(mejorComb.a))} contra ${f2(R(mejorSuelta.a))}).`);
  if (!gana) L(`    → o sea: NO SE SUMAN. Combinar no aporta y construir encima sería construir sobre arena.`);
}

function examen(c) {
  const base = BASE[0];
  L(`\n${"─".repeat(118)}`);
  L(`  EXAMEN COMPLETO — ${c.et}`);
  L(`${"─".repeat(118)}`);
  const a = c.a;
  L(`  n=${mil(a.n)} patas · ${mil(a.n / NANOS)} al año · RATIO ${f2(R(a))} · acierta ${pct(AC(a))} · listón ${f2(R(LISTON[0]))} / ${pct(AC(LISTON[0]))}`);
  L(`  ganador medio ${usd(a.gan / a.win)} · perdedor medio ${usd(a.per / (a.n - a.win))} · mayor billete ${usd(a.max)}`);
  L(`  ratio quitando el mayor billete: ${f2((a.gan - a.max) / a.per)}`);

  // LOS BILLETES GRANDES — con nombre y fecha, para poder ir al fichero a comprobarlos
  const bil = billetes(base, c.pred, c.strike, 8);
  L(`\n  Los ocho billetes más gordos (cada apuesta son $${mil(APUESTA)}):`);
  L(`  | ticker | día de compra | distancia | lado | multiplicó por | dinero |`);
  L(`  |---|---|---|---|---|---|`);
  for (const b of bil) L(`  | ${b.sym} | ${b.dia} | ${pct(b.dist)} | ${b.tipo} | ${f1(b.veces)}x | ${usd(b.d)} |`);
  const suma8 = bil.reduce((z, b) => z + b.d, 0);
  L(`  esos ocho juntos son ${pct(suma8 / a.gan)} de todo lo ganado. Ratio sin los ocho: ${f2((a.gan - suma8) / a.per)}`);

  // QUÉ COMPRA DE VERDAD — la distancia elegida y lo que cuesta el peaje
  const cd = new Map(DISTS.map((x) => [x, 0]));
  let nh = 0, sh = 0, sa = 0;
  for (const o of base) {
    if (!c.pred(o)) continue;
    const d = c.strike(o);
    if (d == null) continue;
    for (let t = 0; t < 2; t++) {
      if (!Number.isFinite(o.rets[d * 2 + t])) continue;
      cd.set(DISTS[d], cd.get(DISTS[d]) + 1);
      if (Number.isFinite(o.hq[d * 2 + t])) { nh++; sh += o.hq[d * 2 + t]; sa += o.ask[d * 2 + t]; }
    }
  }
  L(`\n  QUÉ COMPRA DE VERDAD: ${[...cd].map(([k, v]) => `${pct(k)} fuera → ${pct(v / a.n)}`).join(" · ")}`);
  L(`  peaje de entrada: la horquilla se lleva el ${pct(sh / nh)} de la prima · prima media pagada $${f2(sa / nh)} por contrato`);

  // año a año
  const porAno = midePorClave(base, c.pred, c.strike, (o) => o.ano);
  const lstAno = midePorClave(base, () => true, fijo(0), (o) => o.ano);
  L(`\n  | año | n | RATIO | acierto | listón de ese año |`);
  L(`  |---|---|---|---|---|`);
  let malos = 0, cuentan = 0;
  const filaAno = [];
  for (const y of ANOS) {
    const v = porAno.get(y), l = lstAno.get(y);
    if (!v || v.n < 40) { L(`  | ${y} | ${v ? v.n : 0} | muestra corta | | |`); continue; }
    cuentan++; if (R(v) < 1) malos++;
    filaAno.push(`${y} ${f2(R(v))}`);
    L(`  | ${y} | ${mil(v.n)} | **${f2(R(v))}** | ${pct(AC(v))} | ${f2(R(l))} |`);
  }
  L(`  años con ratio por debajo de 1.00: ${malos} de ${cuentan}`);

  // los cuatro años duros
  const crisis = ["2018", "2020", "2022", "2025"].map((y) => { const v = porAno.get(y); return `${y}: ${v && v.n >= 40 ? f2(R(v)) : "n/d"} (n=${mil(v?.n ?? 0)})`; }).join(" · ");
  L(`\n  Los cuatro años duros: ${crisis}`);

  // sin 2020
  const sin20 = mide(base, (o) => c.pred(o) && o.ano !== "2020", c.strike);
  const sin20L = mide(base, (o) => o.ano !== "2020", fijo(0));
  L(`  Sin 2020 entero: ratio ${f2(R(sin20))} (n=${mil(sin20.n)}) · el listón sin 2020: ${f2(R(sin20L))}`);

  // tercios
  const T = [["2016", "2019"], ["2020", "2022"], ["2023", "2026"]];
  const terc = T.map(([x, y]) => { const v = mide(base, (o) => c.pred(o) && o.ano >= x && o.ano <= y, c.strike); return `${x}-${y} ${f2(R(v))} (n=${mil(v.n)})`; });
  L(`  Por tercios: ${terc.join(" · ")}`);

  // tickers
  const porTk = midePorClave(base, c.pred, c.strike, (o) => o.sym);
  const tks = [...porTk.entries()].map(([k, v]) => ({ k, v, r: R(v) })).sort((x, y) => y.v.gan - x.v.gan);
  let ac2 = 0, cuantos = 0;
  for (const t of tks) { ac2 += t.v.gan; cuantos++; if (ac2 >= a.gan / 2) break; }
  const porR = [...tks].sort((x, y) => y.r - x.r);
  L(`  Por ticker: ${tks.length} tickers · ${tks.filter((t) => t.r > 1).length} con ratio > 1 · ${cuantos} juntan la mitad de todo lo ganado`);
  L(`    mejores: ${porR.slice(0, 4).map((t) => `${t.k} ${f2(t.r)}`).join(" · ")}`);
  L(`    peores : ${porR.slice(-4).map((t) => `${t.k} ${f2(t.r)}`).join(" · ")}`);
  L(`    ratio quitando ${tks[0].k} entero: ${f2((a.gan - tks[0].v.gan) / (a.per - tks[0].v.per))}`);

  // la misma regla en el envase B
  const b = mide(BASE[1], c.pred, c.strike === PORE ? PORE : FIJO[1]);
  L(`  La MISMA regla en el envase B (5% fuera, 85-95 días): ratio ${f2(R(b))} · acierta ${pct(AC(b))} (n=${mil(b.n)}) · listón B ${f2(R(LISTON[1]))}`);

  return { malos, cuentan, cuantos, sin20: R(sin20), tercios: terc, crisis, tks, filaAno, ratioB: R(b), aciertoB: AC(b) };
}

const INFO = GAN ? examen(GAN) : null;
// y si la ganadora no es una señal suelta, se examina también la mejor suelta para poder comparar
let INFO2 = null;
if (mejorSuelta && GAN && GAN.fam !== "suelta") {
  INFO2 = examen({ et: `MEJOR SEÑAL SUELTA — ${mejorSuelta.id} · ${mejorSuelta.et}`, pred: mejorSuelta.pred, strike: mejorSuelta.strike, a: mejorSuelta.a, fam: "suelta" });
}

// ════════════════════════════════════════════════════════════════════════════
// PASO 5 — EL BARAJADO CON VEINTE DESPLAZAMIENTOS
// ════════════════════════════════════════════════════════════════════════════
// A cada día se le pega la señal que le tocaba a OTRO día del MISMO ticker, desplazando k
// sesiones. La operación (el dinero) no se toca: sólo se cambia el día que la señal elige.
// Si la regla vale, tiene que caerse al barajar.
linea("PASO 5 · EL BARAJADO — la misma regla mirando el día equivocado, 20 desplazamientos");
function barajado(c, ei = 0) {
  const out = [];
  for (const k of Array.from({ length: 20 }, (_, i) => 25 * (i + 1))) {
    const a = acc();
    for (const lista of REC[ei].values()) {
      const v = lista.filter(completo);
      for (let j = k; j < v.length; j++) {
        const senal = v[j - k], dinero = v[j];
        if (!c.pred(senal)) continue;
        const d = c.strike(senal);
        if (d == null) continue;
        for (let t = 0; t < 2; t++) { const x = dinero.rets[d * 2 + t]; if (Number.isFinite(x)) meteLeg(a, x); }
      }
    }
    out.push({ k, r: R(a), n: a.n, ac: AC(a) });
  }
  return out;
}
let BAR = [];
if (GAN) {
  BAR = barajado(GAN);
  const rs = BAR.map((x) => x.r).filter(Number.isFinite).sort((x, y) => x - y);
  L(`  Regla: ${GAN.et} — de verdad da ${f2(R(GAN.a))}.`);
  L(`  | desplazamiento | n | ratio barajado |`);
  L(`  |---|---|---|`);
  for (const x of BAR) L(`  | ${x.k} sesiones | ${mil(x.n)} | ${f2(x.r)} |`);
  L(`\n  los 20 barajados van de ${f2(rs[0])} a ${f2(rs.at(-1))}, con mediana ${f2(rs[rs.length >> 1])}.`);
  L(`  barajados que BATEN a la regla de verdad: ${rs.filter((x) => x > R(GAN.a)).length} de 20.`);
  L(`  → si ese número es alto, la regla no está eligiendo días: es el envase.`);
}
let BAR2 = [];
if (mejorSuelta) {
  BAR2 = barajado({ pred: mejorSuelta.pred, strike: mejorSuelta.strike });
  const rs = BAR2.map((x) => x.r).filter(Number.isFinite).sort((x, y) => x - y);
  L(`\n  Y la mejor señal SUELTA (${mejorSuelta.id}), que de verdad da ${f2(R(mejorSuelta.a))}:`);
  L(`    los 20 barajados van de ${f2(rs[0])} a ${f2(rs.at(-1))}, mediana ${f2(rs[rs.length >> 1])} · la baten ${rs.filter((x) => x > R(mejorSuelta.a)).length} de 20.`);
}

// ════════════════════════════════════════════════════════════════════════════
// PASO 6 — ¿TIENE VECINAS BUENAS LA GANADORA?
// ════════════════════════════════════════════════════════════════════════════
linea("PASO 6 · ¿TIENE VECINAS BUENAS LA GANADORA? — mover el umbral y ver si el resultado aguanta");
L(`  Se mueve el corte del quinto (0.80 arriba / 0.20 abajo) a los vecinos. Si sólo funciona en un punto exacto,`);
L(`  es una tirada afortunada y no una regla.`);
for (const c of [GAN, mejorSuelta ? { et: `${mejorSuelta.id} · ${mejorSuelta.et}`, gen: mejorSuelta.gen, strike: mejorSuelta.strike, a: mejorSuelta.a } : null]) {
  if (!c) continue;
  L(`\n  ── ${c.et} ──`);
  if (!c.gen) { L(`  (esta regla no tiene corte que mover: compra todos los días)`); continue; }
  L(`  | corte | n | ops/año | RATIO | acierto |`);
  L(`  |---|---|---|---|---|`);
  for (const u of [0.60, 0.70, 0.75, 0.80, 0.85, 0.90]) {
    const a = mide(BASE[0], c.gen(u), c.strike);
    L(`  | ${f2(u)}${u === ALTO ? " ← la elegida" : ""} | ${mil(a.n)} | ${mil(a.n / NANOS)} | **${f2(R(a))}** | ${pct(AC(a))} |`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LAS PUERTAS
// ════════════════════════════════════════════════════════════════════════════
const PUERTAS = SIG.length * 2 /* 5 sueltas en 2 envases */ + 2 /* E como strike en 2 envases */ + COMB.length + 20 * 2 /* barajados */;
linea("LAS PUERTAS ABIERTAS");
L(`  ${SIG.length} señales sueltas × 2 envases = ${SIG.length * 2}`);
L(`  + la sonrisa como strike en 2 envases = 2`);
L(`  + ${COMB.length} combinaciones (${COMB.filter((c) => c.fam === "dos a la vez").length} parejas Y · ${COMB.filter((c) => c.fam === "al menos una").length} parejas O · ${COMB.filter((c) => c.fam.endsWith("de 5")).length} de "k de 5" · ${COMB.filter((c) => c.fam === "dos pisos").length} de dos pisos)`);
L(`  + 40 barajados (20 desplazamientos × 2 reglas)`);
L(`  = ${PUERTAS} mediciones en total.`);
L(`  Con ${mil(BASE[0].length)} días-ticker de base y ${PUERTAS} puertas, una ganadora que sólo gana por poco NO es un hallazgo.`);

// ════════════════════════════════════════════════════════════════════════════
// EL RESUMEN
// ════════════════════════════════════════════════════════════════════════════
linea("EL RESUMEN");
L(`  listón del envase A medido AQUÍ (diario + banda 55-65 días): ${f2(R(LISTON[0]))} · acierta ${pct(AC(LISTON[0]))} · n=${mil(LISTON[0].n)}`);
L(`  listón del envase B medido AQUÍ (diario + banda 85-95 días): ${f2(R(LISTON[1]))} · acierta ${pct(AC(LISTON[1]))} · n=${mil(LISTON[1].n)}`);
if (mejorSuelta) L(`  mejor señal suelta : ${mejorSuelta.id} · ratio ${f2(R(mejorSuelta.a))} · acierta ${pct(AC(mejorSuelta.a))} · ${mil(mejorSuelta.a.n / NANOS)} patas/año`);
if (mejorComb) L(`  mejor combinación  : ${mejorComb.et} · ratio ${f2(R(mejorComb.a))} · acierta ${pct(AC(mejorComb.a))} · ${mil(mejorComb.a.n / NANOS)} patas/año`);
if (GAN) L(`  la que gana de todas: ${GAN.et} · ratio ${f2(R(GAN.a))} · ¿llega a 1.40? ${R(GAN.a) >= 1.40 ? "SÍ" : "NO"}`);
L(`\n  tiempo total: ${Math.round((Date.now() - t0) / 1000)}s`);

// volcado corto para el informe
const salida = {
  liston: { A: R(LISTON[0]), aciertoA: AC(LISTON[0]), nA: LISTON[0].n, B: R(LISTON[1]), nB: LISTON[1].n },
  base: BASE[0].length, anos: NANOS, puertas: PUERTAS, huecos, patasOk,
  mejorSuelta: mejorSuelta ? { id: mejorSuelta.id, r: R(mejorSuelta.a), ac: AC(mejorSuelta.a), n: mejorSuelta.a.n } : null,
  mejorComb: mejorComb ? { et: mejorComb.et, r: R(mejorComb.a), ac: AC(mejorComb.a), n: mejorComb.a.n } : null,
  ganadora: GAN ? { et: GAN.et, r: R(GAN.a), ac: AC(GAN.a), n: GAN.a.n, opsAno: GAN.a.n / NANOS } : null,
  info: INFO, barajado: BAR, barajadoSuelta: BAR2,
  ranking: ranking.slice(0, 12).map((c) => ({ et: c.et, r: R(c.a), ac: AC(c.a), n: c.a.n })),
  sueltas: SUELTAS.map((s) => ({ id: s.id, r: R(s.a), ac: AC(s.a), n: s.a.n })),
};
writeFileSync("scripts/cache-theta/_v3-resumen.json", JSON.stringify(salida, null, 1));
L(`  resumen escrito en scripts/cache-theta/_v3-resumen.json\n`);
