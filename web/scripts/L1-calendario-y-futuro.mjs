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
  const AUS = ENVASES.map(() => new Uint8Array(n * 10));

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
          const bruto = g[o.clave];
          if (bruto === undefined) AUS[o.ei][o.i * 10 + o.li] = 1;
          const salida = bruto?.[0] ?? 0;
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
      let eIdx = null, eMin = null, eIdx2 = null, eMin2 = null;
      for (let d = 0; d < DISTS.length; d++) {
        const a = pSon[d][0][i], b = pSon[d][1][i];
        if (a == null || b == null) continue;
        const v0 = (a + b) / 2;
        if (eMin2 == null || v0 < eMin2) { eMin2 = v0; eIdx2 = d; }
        if (!Number.isFinite(RET[ei][i * 10 + d * 2]) && !Number.isFinite(RET[ei][i * 10 + d * 2 + 1])) continue;
        const v = (a + b) / 2;
        if (eMin == null || v < eMin) { eMin = v; eIdx = d; }
      }
      const rets = new Float64Array(10), hq = new Float64Array(10), ask = new Float64Array(10), aus = new Uint8Array(10);
      for (let li = 0; li < 10; li++) { rets[li] = RET[ei][i * 10 + li]; hq[li] = HQ[ei][i * 10 + li]; ask[li] = ASK[ei][i * 10 + li]; aus[li] = AUS[ei][i * 10 + li]; }
      lista.push({
        sym, dia: dias[i], ano: dias[i].slice(0, 4), dte: ct.dte,
        pA: pCaro[i], pB: pRuido[i], pC: pCurva[i], pD: pSusto[i], pE: eMin,
        ruido: mRuido[i], eIdx, eIdx2, rets, hq, ask, aus, exp: ct.exp,
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
//  L E N T E   1  —  EL CALENDARIO Y EL FUTURO
// ════════════════════════════════════════════════════════════════════════════
const base = BASE[0];
const fA = SIG[0].f, fC = SIG[2].f;
const PRED = (o) => fA(o) && fC(o);
const STRK = PORE;
const dow = (d) => new Date(Date.UTC(+d.slice(0,4), +d.slice(4,6)-1, +d.slice(6,8))).getUTCDay();
const dom = (d) => +d.slice(6,8);
const mes = (d) => d.slice(0,6);
const LISTON = ENVASES.map((_, ei) => mide(BASE[ei], () => true, fijo(ei)));
const RG = mide(base, PRED, STRK), LS = LISTON[0];
L(`\n\n${"#".repeat(118)}`);
L(`  LENTE 1 — la regla: A Y C deciden CUÁNDO + la sonrisa el STRIKE`);
L(`  de verdad da ${f2(R(RG))} con n=${mil(RG.n)} · listón ${f2(R(LS))} (n=${mil(LS.n)})`);
L(`${"#".repeat(118)}`);

// ── T1 · ¿EL PLAZO QUE COMPRA ES EL QUE DICE? ───────────────────────────────
linea("T1 · EL PLAZO REAL — ¿la banda lo fija o sigue bailando?");
function dteStats(pred) {
  const v = []; for (const o of base) if (pred(o) && STRK(o) != null) v.push(o.dte);
  v.sort((a,b)=>a-b);
  return { n: v.length, med: v.reduce((a,x)=>a+x,0)/v.length, p10: v[Math.floor(v.length*0.1)], p50: v[v.length>>1], p90: v[Math.floor(v.length*0.9)], min: v[0], max: v.at(-1) };
}
const dR = dteStats(PRED), dL = dteStats(()=>true);
L(`  | poblacion | dias-ticker | plazo medio | minimo | 10% | mediana | 90% | maximo |`);
L(`  |---|---|---|---|---|---|---|---|`);
L(`  | la REGLA | ${mil(dR.n)} | ${f1(dR.med)} | ${dR.min} | ${dR.p10} | ${dR.p50} | ${dR.p90} | ${dR.max} |`);
L(`  | el LISTON (todos) | ${mil(dL.n)} | ${f1(dL.med)} | ${dL.min} | ${dL.p10} | ${dL.p50} | ${dL.p90} | ${dL.max} |`);
L(`\n  Ratio DENTRO de cada tramo de plazo (asi el plazo no puede explicar nada):`);
L(`  | plazo | n regla | RATIO regla | n liston | RATIO liston |`);
L(`  |---|---|---|---|---|`);
for (const par of [[55,57],[58,60],[61,62],[63,65]]) {
  const lo = par[0], hi = par[1];
  const f = (o) => o.dte >= lo && o.dte <= hi;
  const a = mide(base, (o)=>PRED(o)&&f(o), STRK), b = mide(base, f, fijo(0));
  L(`  | ${lo}-${hi} dias | ${mil(a.n)} | **${f2(R(a))}** | ${mil(b.n)} | ${f2(R(b))} |`);
}

// ── T2 · DÍA DEL MES Y DÍA DE LA SEMANA ─────────────────────────────────────
linea("T2 · ¿DEPENDE DEL DIA DEL MES O DEL DIA DE LA SEMANA?");
const DOWN = ["dom","LUNES","MARTES","MIERCOLES","JUEVES","VIERNES","sab"];
L(`  | dia de la semana | n regla | % de la regla | RATIO regla | % del liston | RATIO liston |`);
L(`  |---|---|---|---|---|---|`);
for (let w = 1; w <= 5; w++) {
  const f = (o) => dow(o.dia) === w;
  const a = mide(base, (o)=>PRED(o)&&f(o), STRK), b = mide(base, f, fijo(0));
  L(`  | ${DOWN[w]} | ${mil(a.n)} | ${pct(a.n/RG.n)} | **${f2(R(a))}** | ${pct(b.n/LS.n)} | ${f2(R(b))} |`);
}
L(`\n  | tramo del mes | n regla | % de la regla | RATIO regla | % del liston | RATIO liston |`);
L(`  |---|---|---|---|---|---|`);
for (const tr of [[1,7,"dias 1-7"],[8,15,"dias 8-15"],[16,23,"dias 16-23"],[24,31,"dias 24-31"]]) {
  const lo = tr[0], hi = tr[1], et = tr[2];
  const f = (o) => dom(o.dia) >= lo && dom(o.dia) <= hi;
  const a = mide(base, (o)=>PRED(o)&&f(o), STRK), b = mide(base, f, fijo(0));
  L(`  | ${et} | ${mil(a.n)} | ${pct(a.n/RG.n)} | **${f2(R(a))}** | ${pct(b.n/LS.n)} | ${f2(R(b))} |`);
}

// ── T3 · CUÁNTOS EVENTOS DE VERDAD HAY DETRÁS ───────────────────────────────
linea("T3 · ¿CUANTAS APUESTAS DISTINTAS HAY DE VERDAD? — el mismo billete contado cinco veces");
{
  const legs = [];
  for (const o of base) { if (!PRED(o)) continue; const d = STRK(o); if (d == null) continue;
    for (let t=0;t<2;t++){ const x=o.rets[d*2+t]; if(!Number.isFinite(x)) continue;
      legs.push({ d: APUESTA*x, sym:o.sym, dia:o.dia, exp:o.exp, mes:mes(o.dia), dist:DISTS[d], tipo:t?"put":"call" }); } }
  const gan = legs.filter(x=>x.d>0).reduce((a,x)=>a+x.d,0);
  const per = legs.filter(x=>x.d<=0).reduce((a,x)=>a-x.d,0);
  L(`  ${mil(legs.length)} patas · ganado ${usd(gan)} · perdido ${usd(per)} · ratio ${f2(gan/per)}`);
  const gr = (k) => { const m=new Map(); for(const x of legs){const K=k(x); if(!m.has(K))m.set(K,{g:0,p:0,n:0}); const e=m.get(K); e.n++; if(x.d>0)e.g+=x.d; else e.p+=-x.d;} return m; };
  const grupos = [["ticker + VENCIMIENTO + lado", (x)=>`${x.sym}|${x.exp}|${x.tipo}`], ["ticker + MES de compra + lado", (x)=>`${x.sym}|${x.mes}|${x.tipo}`], ["MES de compra (todos los tickers)", (x)=>x.mes]];
  for (const par of grupos) {
    const et = par[0], k = par[1];
    const m = gr(k);
    const v = [...m.entries()].sort((a,b)=>b[1].g-a[1].g);
    L(`\n  Agrupando por ${et}: ${mil(v.length)} grupos para ${mil(legs.length)} patas (${f1(legs.length/v.length)} patas por grupo)`);
    L(`  | # | grupo | patas | ganado | % de lo ganado |`);
    L(`  |---|---|---|---|---|`);
    v.slice(0,6).forEach((e2,i)=>L(`  | ${i+1} | ${e2[0]} | ${e2[1].n} | ${usd(e2[1].g)} | ${pct(e2[1].g/gan)} |`));
    let acum=0, cuantos=0; for(const e2 of v){acum+=e2[1].g;cuantos++; if(acum>=gan/2)break;}
    L(`  → ${cuantos} grupo(s) de ${mil(v.length)} juntan la MITAD de todo lo ganado.`);
    for (const q of [1,2,3,5]) { const quitar=new Set(v.slice(0,q).map(x=>x[0])); let g=0,p=0;
      for(const x of legs){ if(quitar.has(k(x)))continue; if(x.d>0)g+=x.d; else p+=-x.d; }
      L(`     ratio quitando los ${q} grupos mas gordos: ${f2(g/p)}`); }
  }
}

// ── T4 · ¿CUÁNTOS DÍAS SEGUIDOS DISPARA LA SEÑAL? ───────────────────────────
linea("T4 · LA SENAL SE QUEDA ENCENDIDA — cuantos dias seguidos dispara sobre el mismo ticker");
{
  let rachas = [], diasOn = 0;
  for (const lista of REC[0].values()) {
    const v = lista.filter(completo); let run = 0;
    for (const o of v) { if (PRED(o)) { run++; diasOn++; } else { if (run) rachas.push(run); run = 0; } }
    if (run) rachas.push(run);
  }
  rachas.sort((a,b)=>a-b);
  const larga = rachas.filter(x=>x>=3).reduce((a,x)=>a+x,0);
  L(`  ${mil(diasOn)} dias-ticker encendidos repartidos en ${mil(rachas.length)} RACHAS.`);
  L(`  racha media ${f1(diasOn/rachas.length)} dias · mediana ${rachas[rachas.length>>1]} · la mas larga ${rachas.at(-1)} dias`);
  L(`  el ${pct(larga/diasOn)} de los dias encendidos esta dentro de una racha de 3 dias o mas.`);
  L(`  → las ${mil(RG.n/NANOS)} "operaciones al ano" son en realidad ~${mil(rachas.length/NANOS)} EPISODIOS al ano.`);
}

// ── T5 · EL DESPLAZAMIENTO CORTO (y hacia el FUTURO) ────────────────────────
linea("T5 · EMPUJAR LA SENAL — un dia atras, y tambien hacia el FUTURO");
L(`  Se le pega a cada dia la senal que le tocaba a otro. k>0 = senal del PASADO (k sesiones antes).`);
L(`  k<0 = senal del FUTURO. Si el futuro funciona igual o mejor, la senal no elige el dia: es el periodo.`);
function corr(k) {
  const a = acc();
  for (const lista of REC[0].values()) {
    const v = lista.filter(completo);
    for (let j = 0; j < v.length; j++) {
      const s2 = j - k; if (s2 < 0 || s2 >= v.length) continue;
      const sen = v[s2], din = v[j];
      if (!PRED(sen)) continue; const d = STRK(sen); if (d == null) continue;
      for (let t=0;t<2;t++){ const x=din.rets[d*2+t]; if(Number.isFinite(x)) meteLeg(a,x); }
    }
  }
  return a;
}
L(`  | k (sesiones) | que mira | n | RATIO | acierto |`);
L(`  |---|---|---|---|---|`);
for (const k of [-40,-20,-10,-5,-3,-2,-1,0,1,2,3,5,10,15,20,25,40,60]) {
  const a = corr(k);
  L(`  | ${k>0?"+"+k:k} | ${k===0?"**la de verdad**":k>0?"senal de "+k+" sesiones ANTES":"senal de "+(-k)+" sesiones DESPUES (futuro)"} | ${mil(a.n)} | **${f2(R(a))}** | ${pct(AC(a))} |`);
}

// ── T6 · ¿ES LA SONRISA O ES COMPRAR MÁS LEJOS? ─────────────────────────────
linea("T6 · EN LOS MISMOS DIAS, ¿QUE HACE CADA DISTANCIA FIJA? — el segundo piso a examen");
L(`  | que se compra en los dias de A Y C | n | RATIO | acierto | prima media |`);
L(`  |---|---|---|---|---|`);
for (let d = 0; d < DISTS.length; d++) {
  const dd = d;
  const a = mide(base, PRED, () => dd);
  let sa=0,nh=0; for(const o of base){ if(!PRED(o))continue; for(let t=0;t<2;t++){ if(Number.isFinite(o.rets[dd*2+t])&&Number.isFinite(o.ask[dd*2+t])){sa+=o.ask[dd*2+t];nh++;} } }
  L(`  | siempre ${pct(DISTS[d])} fuera | ${mil(a.n)} | **${f2(R(a))}** | ${pct(AC(a))} | $${f2(sa/nh)} |`);
}
L(`  | la SONRISA elige (la regla) | ${mil(RG.n)} | **${f2(R(RG))}** | ${pct(AC(RG))} | |`);
L(`\n  Y el mismo cuadro para TODOS los dias (sin A ni C), para ver si es la senal o es la distancia:`);
L(`  | que se compra TODOS los dias | n | RATIO | acierto |`);
L(`  |---|---|---|---|`);
for (let d = 0; d < DISTS.length; d++) { const dd=d; const a = mide(base, ()=>true, () => dd); L(`  | siempre ${pct(DISTS[d])} fuera | ${mil(a.n)} | **${f2(R(a))}** | ${pct(AC(a))} |`); }

// ── T7 · HUECO O CERO EN LA SALIDA ──────────────────────────────────────────
linea("T7 · ¿EL CERO DE SALIDA ES UN CERO O ES UN HUECO?");
{
  let nA=0, nT=0, nAg=0, ausR=0, totR=0;
  for (const o of base) for (let li=0; li<10; li++) { if(!Number.isFinite(o.rets[li]))continue; nT++; if(o.aus[li]){nA++; if(o.rets[li]>0)nAg++;} }
  for (const o of base){ if(!PRED(o))continue; const d=STRK(o); if(d==null)continue; for(let t=0;t<2;t++){ const li=d*2+t; if(!Number.isFinite(o.rets[li]))continue; totR++; if(o.aus[li])ausR++; } }
  L(`  patas cuyo contrato NO aparece en la cadena del dia de salida (se anotan como bid 0 = perdida total):`);
  L(`    en toda la base: ${mil(nA)} de ${mil(nT)} = ${pct(nA/nT)} · de esas, ${nAg} habrian sido ganadoras`);
  L(`    en la REGLA    : ${mil(ausR)} de ${mil(totR)} = ${pct(ausR/totR)}`);
  const a = acc(), b = acc();
  for (const o of base){ const d=STRK(o); if(d==null)continue; for(let t=0;t<2;t++){const li=d*2+t; if(!Number.isFinite(o.rets[li])||o.aus[li])continue; if(PRED(o))meteLeg(a,o.rets[li]); } }
  for (const o of base){ const li=2; if(!Number.isFinite(o.rets[li])||o.aus[li])continue; meteLeg(b,o.rets[li]); }
  L(`    ratio de la regla DESCARTANDO esas patas: ${f2(R(a))} (n=${mil(a.n)}) · liston igual tratado: ${f2(R(b))} (n=${mil(b.n)})`);
}

// ── T8 · SIN LOS DOS EPISODIOS ──────────────────────────────────────────────
linea("T8 · QUITANDO LOS EPISODIOS QUE LO PAGAN TODO");
const casos = [
  ["todo", ()=>true],
  ["sin 2020", (o)=>o.ano!=="2020"],
  ["sin 2026", (o)=>o.ano!=="2026"],
  ["sin 2020 y sin 2026", (o)=>o.ano!=="2020"&&o.ano!=="2026"],
  ["sin QQQ", (o)=>o.sym!=="QQQ"],
  ["sin QQQ ni SPY", (o)=>o.sym!=="QQQ"&&o.sym!=="SPY"],
  ["sin marzo-abril 2026", (o)=>!(mes(o.dia)==="202603"||mes(o.dia)==="202604")],
  ["sin feb-marzo 2020", (o)=>!(mes(o.dia)==="202002"||mes(o.dia)==="202003")],
  ["sin los cuatro meses de crisis", (o)=>!["202002","202003","202603","202604"].includes(mes(o.dia))],
];
for (const par of casos) {
  const et = par[0], f = par[1];
  const a = mide(base, (o)=>PRED(o)&&f(o), STRK), b = mide(base, f, fijo(0));
  L(`  | ${et.padEnd(32)} | regla ${f2(R(a))} (n=${mil(a.n)}) | liston ${f2(R(b))} (n=${mil(b.n)}) |`);
}

// ── T9 · AÑO A AÑO CONTRA SU PROPIO LISTÓN ──────────────────────────────────
linea("T9 · ANO A ANO — la regla dividida por el liston de ESE ano");
const pa = midePorClave(base, PRED, STRK, (o)=>o.ano), pl = midePorClave(base, ()=>true, fijo(0), (o)=>o.ano);
L(`  | ano | n | RATIO regla | liston | regla / liston | gana? |`);
L(`  |---|---|---|---|---|---|`);
let arriba=0, cuentan=0;
for (const y of ANOS) { const v=pa.get(y), l=pl.get(y); if(!v||v.n<40)continue; cuentan++; const q=R(v)/R(l); if(q>1)arriba++;
  L(`  | ${y} | ${mil(v.n)} | ${f2(R(v))} | ${f2(R(l))} | **${f2(q)}** | ${q>1?"si":"NO"} |`); }
L(`  anos en que la regla bate a su propio liston: ${arriba} de ${cuentan}`);
linea("T10 · EL UNICO SITIO DONDE EL CODIGO MIRA AL FUTURO: elegir el strike solo entre los que TIENEN salida");
{
  let cambia = 0, total = 0;
  for (const o of base) { if (o.eIdx == null && o.eIdx2 == null) continue; total++; if (o.eIdx !== o.eIdx2) cambia++; }
  L(`  dias-ticker donde el filtro de "tiene salida medida" cambia la distancia elegida: ${mil(cambia)} de ${mil(total)} = ${pct(cambia/total)}`);
  const a = mide(base, PRED, (o) => o.eIdx2);
  L(`  la regla eligiendo el strike SIN mirar si hay salida: ${f2(R(a))} (n=${mil(a.n)}) · con el filtro puesto: ${f2(R(RG))} (n=${mil(RG.n)})`);
}
L(`\n  tiempo: ${Math.round((Date.now()-t0)/1000)}s`);
