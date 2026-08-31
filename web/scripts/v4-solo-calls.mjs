// ¿SOLO CALLS ES VENTAJA, O SON DIEZ AÑOS DE MERCADO ALCISTA?
//
// ═══ LA PREGUNTA ════════════════════════════════════════════════════════════════════════════
//
// En todas las familias medidas ayer las puts perdían y las calls ganaban. En diez años de
// mercado alcista comprar calls gana aunque el vehículo no valga nada, así que antes de
// recomendar "compra sólo calls" hay que separar las dos cosas:
//   · LA PRUEBA QUE DECIDE: las calls SÓLO en los tramos BAJISTAS (Q4 2018, marzo 2020, todo
//     2022, abril 2025). Si ahí siguen ganando, hay algo más que la deriva.
//   · El ratio de las calls por AÑO contra lo que hizo el SPY ese año. Si van pegados, es beta
//     apalancada y punto.
//   · LA VERSIÓN LIMPIA: comprar las DOS PATAS (call y put del mismo día y ticker) quita la
//     dirección del medio y deja sólo el vehículo.
//   · Y LA PREGUNTA QUE SALE DE AHÍ: ¿hay alguna señal que funcione EN LAS PUTS?
//
// ═══ CÓMO SE MIDE — las dos correcciones de ayer, sin excepción ═════════════════════════════
//
//   1) universo DIARIO (todas las sesiones), no una entrada al mes.
//   2) plazo FIJADO A UNA BANDA ESTRECHA: envase A sólo vencimientos de 55 a 65 días; envase B
//      de 85 a 95. Si no hay ninguno en la banda, ESE DÍA NO SE OPERA y se cuenta.
//   3) el listón honesto: 0.95 (A) y 1.00 (B). Nunca 1.11. Y además se re-mide aquí, porque la
//      banda estrecha cambia el universo y el listón de este script tiene que salir de este
//      script.
//
// ═══ LAS REGLAS DE LA CASA ══════════════════════════════════════════════════════════════════
//   · se COMPRA al ASK y se VENDE al BID. Nunca punto medio.
//   · ningún modelo de precios. Black-Scholes ni se importa.
//   · un HUECO no es un cero: falta la cadena de salida o el vencimiento entero → se descarta y
//     se cuenta aparte. El vencimiento está y el contrato no aparece → sin puja: vale 0, real.
//   · SÓLO EL PASADO: toda ventana termina el día ANTERIOR al de la compra.
//   · el precio del subyacente sale de la paridad put-call SÓLO EN EL VENCIMIENTO MÁS CERCANO
//     (la serie ya validada de w1/y9, cacheada en _y9-spots.json).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/v4-solo-calls.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const SPOTCACHE = "scripts/cache-theta/_y9-spots.json";

const APUESTA = 1000;
const TOLK = 0.50;          // cuánto puede apartarse el strike de la distancia pedida
const SALIDA = 30;          // días de bolsa hasta vender
const ASKMIN = 0.10;
const VENT_PCTL = 250;      // ventana móvil del percentil (señales A y C)
const MIN_PCTL = 150;
const MIN_PASADO = 250;     // historia propia mínima para rankear (señales B-relativa y D)
const DISTS = [0.02, 0.05, 0.10, 0.15, 0.20];
const MIN_SONRISA = 60;     // observaciones pasadas mínimas por distancia para la señal E
const DESPLS = Array.from({ length: 20 }, (_, i) => 21 * (i + 1));   // 20 desplazamientos

// LA BANDA ESTRECHA — esto es lo que cambió ayer
const ENVASES = [
  { id: "A", dist: 0.10, dte: 60, lo: 55, hi: 65, liston: 0.95 },
  { id: "B", dist: 0.05, dte: 90, lo: 85, hi: 95, liston: 1.00 },
];

const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const usd = (n) => (Number.isFinite(n) ? "$" + Math.round(n).toLocaleString("en-US") : "n/d");
const num = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "n/d");
const mil = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "n/d");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const L = (x = "") => console.log(x);
const linea = (t) => { L(`\n${"═".repeat(112)}`); L(`  ${t}`); L(`${"═".repeat(112)}`); };
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const mediana = (v) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ── índice de días por ticker ────────────────────────────────────────────────
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

function leer(sym, dia) {
  const f = `${CDIR}/${sym}_d${dia}.json`;
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
}

/** EL SPOT ARREGLADO: paridad put-call en el vencimiento MÁS CERCANO. */
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
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

/** La CUÑA al dinero de un vencimiento, con ASK (es lo que se paga). Devuelve (askC+askP)/S. */
function cunaAsk(g, S) {
  let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2));
    if (!g[`${k}|P`]) continue;
    const d = Math.abs(k - S);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null || Math.abs(K / S - 1) > 0.05) return null;
  const aC = g[`${K}|C`][1], aP = g[`${K}|P`][1];
  if (!(aC > 0) || !(aP > 0)) return null;
  return (aC + aP) / S;
}

/** La CUÑA a PUNTO MEDIO, normalizada por el plazo: es una LECTURA, no una operación. */
function sigmaDe(g, S, dte) {
  let mej = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2));
    const p = g[`${K}|P`];
    if (!p) continue;
    if (!(ba[1] > 0) || !(p[1] > 0)) continue;
    const d = Math.abs(K - S);
    if (d < dm) { dm = d; mej = { K, c: (ba[0] + ba[1]) / 2, p: (p[0] + p[1]) / 2 }; }
  }
  if (!mej || dm > S * 0.05) return null;
  const cuna = mej.c + mej.p;
  return cuna > 0 ? (cuna / S) / Math.sqrt(dte / 365) : null;
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 1 — la serie de precios (reutilizada de w1/y9)
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
    L(`## serie de precios leída de ${SPOTCACHE} (la misma que usan w1 y y9) — ${TICKERS.length} tickers`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 2 — días rotos (misma criba que w1)
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
        const confirmado = c0 > 0 && c1 > 0 && Math.abs(rat / (c1 / c0) - 1) < 0.03;
        if (confirmado) saltoSalvado++; else { ro[i] = true; rotoSalto++; }
      }
    }
  }
  ROTO[sym] = ro;
  const pf = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) pf[i + 1] = pf[i] + (ro[i] ? 1 : 0);
  PREF[sym] = pf;
}

// ── retornos y volatilidad realizada, por ticker (sólo con el pasado) ────────
const RET = {}, RV60 = {}, MAX5 = {};
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym), s = SPOTS[sym], ro = ROTO[sym], n = dias.length;
  const r = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (ro[i] || ro[i - 1]) continue;
    if (dteDe(dias[i - 1], dias[i]) > 5) continue;
    const v = Math.log(s[i] / s[i - 1]);
    if (Math.abs(v) > 0.35) continue;
    r[i] = v;
  }
  RET[sym] = r;
  const rv = new Array(n).fill(null), m5 = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const v = [];
    for (let j = i - 1; j >= 0 && v.length < 60; j--) if (r[j] != null) v.push(r[j]);
    if (v.length >= 48) { const x = sd(v); if (x > 0) rv[i] = x; }
    let mx = 0, c = 0;
    for (let j = Math.max(1, i - 5); j <= i - 1; j++) { if (r[j] == null) continue; c++; const a = Math.abs(r[j]); if (a > mx) mx = a; }
    if (c >= 4) m5[i] = mx;
  }
  RV60[sym] = rv; MAX5[sym] = m5;
}

/**
 * Percentil contra las últimas VENT_PCTL LECTURAS VÁLIDAS anteriores del propio ticker.
 *
 * ⚠️ Por qué "lecturas válidas" y no "días de calendario": con la BANDA ESTRECHA de plazo sólo
 * hay vencimiento utilizable ~1 día de cada 3, así que una ventana de 250 días de calendario deja
 * ~90 lecturas y el percentil no se puede formar NUNCA (comprobado: disponibilidad 0.0%). La
 * ventana sigue terminando el día ANTERIOR y sigue siendo del mismo ticker: lo único que cambia
 * es que se cuentan lecturas en vez de huecos.
 */
function pctlMovil(s) {
  const out = new Array(s.length).fill(null);
  const idx = [];                       // índices con lectura, en orden
  for (let i = 0; i < s.length; i++) {
    if (s[i] == null) continue;
    if (idx.length >= MIN_PCTL) {
      const ini = Math.max(0, idx.length - VENT_PCTL);
      let n = 0, men = 0;
      for (let k = ini; k < idx.length; k++) { n++; if (s[idx[k]] < s[i]) men++; }
      out[i] = men / n;
    }
    idx.push(i);
  }
  return out;
}
/** Percentil contra TODA la historia previa del propio ticker (ventana que crece). */
function pctlPasado(s) {
  const out = new Array(s.length).fill(null);
  for (let i = 0; i < s.length; i++) {
    if (s[i] == null) continue;
    let n = 0, men = 0;
    for (let j = 0; j < i; j++) { if (s[j] == null) continue; n++; if (s[j] < s[i]) men++; }
    if (n >= MIN_PASADO) out[i] = men / n;
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 3 — EL BARRIDO. Un pase por ticker; cada fichero de cadena se lee UNA vez.
// ════════════════════════════════════════════════════════════════════════════
const OPS = [];       // operaciones del envase con distancia FIJA
const OPSE = [];      // operaciones de la señal E (la sonrisa: la distancia más barata de 5)
const SIG = {};       // sym -> series de señales alineadas a diasPorSim

let diasVistos = 0, entradasDia = 0, sinBanda = 0, sinSpot = 0, sinContrato = 0, huecos = 0, contaminadas = 0;
const t0 = Date.now();

for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym), s = SPOTS[sym], ro = ROTO[sym], pf = PREF[sym], n = dias.length;
  const idxDe = new Map(dias.map((d, i) => [d, i]));
  const rv = RV60[sym];

  // series crudas de las señales, se llenan según avanza el pase (sólo con lo de ese día)
  const cocA = [new Array(n).fill(null), new Array(n).fill(null)];   // cuña/movimiento por envase
  const cocC = new Array(n).fill(null);                              // frente/fondo
  const pend = new Map();                                            // idx de salida -> ops abiertas
  // «lo normal» de cada distancia para ESTE ticker: media móvil de las últimas VENT_SON lecturas.
  // (y10 usaba la mediana; con universo diario la mediana de 500 valores en cada uno de 2.600 días
  //  × 5 distancias × 2 lados × 2 envases × 28 tickers no cabe en el reloj. La media móvil hace el
  //  mismo trabajo — normalizar el nivel del propio ticker — y es O(1). Se dice para que conste.)
  const histSon = new Map();
  const VENT_SON = 250;
  const empuja = (k, x) => {
    let h = histSon.get(k);
    if (!h) { h = { v: [], pre: [0] }; histSon.set(k, h); }
    h.v.push(x); h.pre.push(h.pre[h.pre.length - 1] + x);
    return h;
  };
  const normal = (k) => {
    const h = histSon.get(k);
    if (!h || h.v.length < MIN_SONRISA) return NaN;
    const nn = h.v.length, m = Math.min(VENT_SON, nn);
    return (h.pre[nn] - h.pre[nn - m]) / m;
  };

  for (let j = 0; j < n; j++) {
    const c = leer(sym, dias[j]);
    diasVistos++;
    if (!c) {
      if (pend.has(j)) { huecos += pend.get(j).length; pend.delete(j); }
      continue;
    }

    // ── 1) cerrar lo que sale hoy ──────────────────────────────────────────
    if (pend.has(j)) {
      for (const o of pend.get(j)) {
        const grupo = c[o.exp];
        if (!grupo) { huecos++; continue; }
        const salida = grupo[o.clave]?.[0] ?? 0;    // sin puja = 0. Dato real.
        o.dol = APUESTA * (salida - o.ask) / o.ask;
        o.salida = salida;
        (o.son ? OPSE : OPS).push(o);
      }
      pend.delete(j);
    }

    // ── 2) LAS LECTURAS DEL DÍA ────────────────────────────────────────────
    // Todo lo que alimenta una señal se calcula AQUÍ, con la única condición de que el precio del
    // día sea utilizable. NO se cuela la criba de "hay un día roto en los próximos 30", porque eso
    // es información del FUTURO y decidiría qué días entran en la ventana del percentil.
    const sp = s[j];
    const plan = [null, null];      // por envase: { exp, dteReal, fija, sonrisa }
    if (sp != null && !ro[j]) {
      // frente/fondo: vencimiento más cerca de 30 (±10) y de 180 (±45)
      let ef = null, df = Infinity, dtf = 0, eb = null, db = Infinity, dtb = 0;
      for (const e of Object.keys(c)) {
        const dt = dteDe(dias[j], e);
        if (dt < 1) continue;
        const xf = Math.abs(dt - 30); if (xf < df) { df = xf; ef = e; dtf = dt; }
        const xb = Math.abs(dt - 180); if (xb < db) { db = xb; eb = e; dtb = dt; }
      }
      if (ef && eb && df <= 10 && db <= 45 && ef !== eb) {
        const sf = sigmaDe(c[ef], sp, dtf), sb = sigmaDe(c[eb], sp, dtb);
        if (sf > 0 && sb > 0) cocC[j] = sf / sb;
      }

      for (let ei = 0; ei < ENVASES.length; ei++) {
        const env = ENVASES[ei];
        // LA BANDA ESTRECHA: sólo vencimientos dentro de [lo, hi]. Si no hay, ese día no se opera.
        let exp = null, md = Infinity, dteReal = 0;
        for (const e of Object.keys(c)) {
          const dt = dteDe(dias[j], e);
          if (dt < env.lo || dt > env.hi) continue;
          const x = Math.abs(dt - env.dte);
          if (x < md) { md = x; exp = e; dteReal = dt; }
        }
        if (!exp) continue;

        // la cuña del vencimiento que SE COMPRA, para la señal A
        const cu = cunaAsk(c[exp], sp);
        const raiz = Math.sqrt(Math.max(1, dteReal * 252 / 365));
        if (cu != null && rv[j] > 0) cocA[ei][j] = cu / (rv[j] * raiz);

        const P = { exp, dteReal, fija: {}, son: {} };
        for (const tipo of ["C", "P"]) {
          const objetivo = tipo === "C" ? sp * (1 + env.dist) : sp * (1 - env.dist);
          const obj = DISTS.map((d) => (tipo === "C" ? sp * (1 + d) : sp * (1 - d)));
          const cand = DISTS.map(() => null);
          let mej = null, dd = Infinity;
          for (const [clave, ba] of Object.entries(c[exp])) {
            if (clave.slice(-1) !== tipo) continue;
            if (!(ba[1] >= ASKMIN)) continue;
            const K = Number(clave.slice(0, -2));
            const d = Math.abs(K - objetivo);
            if (d < dd) { dd = d; mej = { K, clave, bid: ba[0], ask: ba[1] }; }
            for (let a = 0; a < DISTS.length; a++) {
              const x = Math.abs(K - obj[a]);
              if (!cand[a] || x < cand[a].x) cand[a] = { x, K, clave, bid: ba[0], ask: ba[1] };
            }
          }
          const dReal = (K) => (tipo === "C" ? K / sp - 1 : 1 - K / sp);
          if (mej && Math.abs(dReal(mej.K) - env.dist) <= env.dist * TOLK) P.fija[tipo] = mej;

          // LA SONRISA (señal E): la distancia más barata DE LO NORMAL para este ticker
          let best = -1, bv = Infinity, disponibles = 0;
          for (let a = 0; a < DISTS.length; a++) {
            const ct = cand[a];
            if (!ct) continue;
            if (Math.abs(dReal(ct.K) - DISTS[a]) > DISTS[a] * TOLK) continue;
            if (!(rv[j] > 0)) continue;
            const cMov = ct.ask / (sp * rv[j] * raiz);
            const k = `${ei}|${tipo}|${a}`;
            const nrm = normal(k);                  // se LEE antes de escribir: sólo pasado
            empuja(k, cMov);
            if (!(nrm > 0)) continue;
            disponibles++;
            const z = cMov / nrm;
            if (z < bv) { bv = z; best = a; }
          }
          if (best >= 0 && disponibles >= 3) P.son[tipo] = { ...cand[best], dIdx: best };
        }
        plan[ei] = P;
      }
    }

    // ── 3) abrir lo de hoy ─────────────────────────────────────────────────
    if (j + SALIDA >= n) continue;
    if (sp == null || ro[j]) { sinSpot++; continue; }
    if (pf[j + SALIDA + 1] - pf[j] > 0) { contaminadas++; continue; }   // día roto en el camino
    entradasDia++;

    for (let ei = 0; ei < ENVASES.length; ei++) {
      const P = plan[ei];
      if (!P) { sinBanda++; continue; }
      const { exp, dteReal } = P;

      // día de salida: 30 de bolsa, o el vencimiento si cae antes
      let iSal = j + SALIDA, trunc = 0;
      if (dias[iSal] >= exp) {
        const k = idxDe.get(exp);
        if (k == null || k <= j) { huecos += 2; continue; }
        iSal = k; trunc = 1;
      }
      const abre = (ct, tipo, son, dIdx) => {
        const o = {
          sym, i: j, dia: dias[j], diaSal: dias[iSal], ano: dias[j].slice(0, 4), ei, tipo, son, dIdx,
          exp, clave: ct.clave, K: ct.K, ask: ct.ask, bid: ct.bid,
          coste: ct.ask / sp, horq: (ct.ask - ct.bid) / ct.ask,
          distReal: tipo === "C" ? ct.K / sp - 1 : 1 - ct.K / sp, dteReal, trunc,
        };
        if (!pend.has(iSal)) pend.set(iSal, []);
        pend.get(iSal).push(o);
      };
      for (const tipo of ["C", "P"]) {
        if (P.fija[tipo]) abre(P.fija[tipo], tipo, 0, DISTS.indexOf(ENVASES[ei].dist));
        else sinContrato++;
        if (P.son[tipo]) abre(P.son[tipo], tipo, 1, P.son[tipo].dIdx);
      }
    }
  }
  // lo que quede abierto al final del fichero no tiene salida: es un hueco
  for (const [, arr] of pend) huecos += arr.length;

  // ── las señales del ticker, ya con la serie entera ──────────────────────
  const rr = RET[sym];
  const rAy = new Array(n).fill(null);
  for (let i = 1; i < n; i++) if (rr[i - 1] != null) rAy[i] = Math.abs(rr[i - 1]);
  SIG[sym] = {
    pA: [pctlMovil(cocA[0]), pctlMovil(cocA[1])],
    pC: pctlMovil(cocC),
    pD: pctlPasado(MAX5[sym]),
    pAy: pctlPasado(rAy),
    rAy,
  };
  process.stderr.write(`\r   ${sym} · ${mil(diasVistos)} días · ${mil(OPS.length)} ops · ${Math.round((Date.now() - t0) / 1000)}s     `);
}
process.stderr.write("\n");

// ════════════════════════════════════════════════════════════════════════════
// LA VARA
// ════════════════════════════════════════════════════════════════════════════
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0, max: 0, coste: 0, horq: 0, dte: 0, dist: 0, cero: 0 });
function add(a, o) {
  const d = o.dol;
  a.n++;
  if (d > 0) { a.win++; a.gan += d; if (d > a.max) a.max = d; } else a.per += -d;
  a.coste += o.coste ?? 0; a.horq += o.horq ?? 0; a.dte += o.dteReal ?? 0; a.dist += o.distReal ?? 0;
  if (o.salida === 0) a.cero++;
}
const R = (a) => (a && a.per > 0 ? a.gan / a.per : (a && a.gan > 0 ? Infinity : NaN));
const AC = (a) => (a && a.n ? a.win / a.n : NaN);
function mide(v) { const a = acc(); for (const o of v) add(a, o); return a; }

const ANOS = [...new Set(OPS.map((o) => o.ano))].sort();
const NANOS = ANOS.length;
// años de calendario que cubre la muestra, para ops/año honestas
const DIASTOT = [...new Set(OPS.map((o) => o.dia))].sort();
const ANOSCAL = DIASTOT.length ? (ms(DIASTOT.at(-1)) - ms(DIASTOT[0])) / 86_400_000 / 365.25 : NaN;

// ── las cinco señales, como funciones sobre una operación ───────────────────
const S_ = (o) => SIG[o.sym];
const REGLAS = [
  { id: "A80", et: "A · la opción CARA (percentil > 80)", f: (o, sh = 0) => { const v = S_(o).pA[o.ei][o.i - sh]; return v != null && v > 0.80; }, disp: (o, sh = 0) => S_(o).pA[o.ei][o.i - sh] != null },
  { id: "A60", et: "A · la opción cara (percentil > 60)", f: (o, sh = 0) => { const v = S_(o).pA[o.ei][o.i - sh]; return v != null && v > 0.60; }, disp: (o, sh = 0) => S_(o).pA[o.ei][o.i - sh] != null },
  { id: "B2", et: "B · ayer se movió más del 2%", f: (o, sh = 0) => { const v = S_(o).rAy[o.i - sh]; return v != null && v > 0.02; }, disp: (o, sh = 0) => S_(o).rAy[o.i - sh] != null },
  { id: "B1", et: "B · ayer se movió más del 1%", f: (o, sh = 0) => { const v = S_(o).rAy[o.i - sh]; return v != null && v > 0.01; }, disp: (o, sh = 0) => S_(o).rAy[o.i - sh] != null },
  { id: "B15", et: "B · ayer se movió más del 1.5%", f: (o, sh = 0) => { const v = S_(o).rAy[o.i - sh]; return v != null && v > 0.015; }, disp: (o, sh = 0) => S_(o).rAy[o.i - sh] != null },
  { id: "B3", et: "B · ayer se movió más del 3%", f: (o, sh = 0) => { const v = S_(o).rAy[o.i - sh]; return v != null && v > 0.03; }, disp: (o, sh = 0) => S_(o).rAy[o.i - sh] != null },
  { id: "BREL", et: "B · lo de ayer en el quinto más alto DE SU PROPIA historia", f: (o, sh = 0) => { const v = S_(o).pAy[o.i - sh]; return v != null && v > 0.80; }, disp: (o, sh = 0) => S_(o).pAy[o.i - sh] != null },
  { id: "C60", et: "C · frente CARO respecto al fondo (percentil móvil > 60)", f: (o, sh = 0) => { const v = S_(o).pC[o.i - sh]; return v != null && v > 0.60; }, disp: (o, sh = 0) => S_(o).pC[o.i - sh] != null },
  { id: "C80", et: "C · frente MUY caro respecto al fondo (percentil móvil > 80)", f: (o, sh = 0) => { const v = S_(o).pC[o.i - sh]; return v != null && v > 0.80; }, disp: (o, sh = 0) => S_(o).pC[o.i - sh] != null },
  { id: "D80", et: "D · después del susto (mayor movimiento de 5 días, quinto más alto)", f: (o, sh = 0) => { const v = S_(o).pD[o.i - sh]; return v != null && v > 0.80; }, disp: (o, sh = 0) => S_(o).pD[o.i - sh] != null },
];
const REGLA = new Map(REGLAS.map((r) => [r.id, r]));

// las dos patas: call + put del mismo día, ticker y envase, sumadas en una sola operación
function dosPatas(v) {
  const m = new Map();
  for (const o of v) {
    const k = `${o.sym}|${o.i}|${o.ei}`;
    if (!m.has(k)) m.set(k, {});
    m.get(k)[o.tipo] = o;
  }
  const out = [];
  for (const [, p] of m) {
    if (!p.C || !p.P) continue;
    out.push({
      sym: p.C.sym, i: p.C.i, dia: p.C.dia, ano: p.C.ano, ei: p.C.ei, tipo: "CP",
      dol: (p.C.dol + p.P.dol) / 2,          // $1,000 arriesgados en cada pata → $2,000; se normaliza a la unidad
      coste: (p.C.coste + p.P.coste) / 2, horq: (p.C.horq + p.P.horq) / 2,
      dteReal: p.C.dteReal, distReal: (p.C.distReal + p.P.distReal) / 2,
      salida: p.C.salida + p.P.salida,
    });
  }
  return out;
}

const A_FIJA = OPS.filter((o) => o.ei === 0);
const B_FIJA = OPS.filter((o) => o.ei === 1);
const A_C = A_FIJA.filter((o) => o.tipo === "C"), A_P = A_FIJA.filter((o) => o.tipo === "P");
const B_C = B_FIJA.filter((o) => o.tipo === "C"), B_P = B_FIJA.filter((o) => o.tipo === "P");
const A_CP = dosPatas(A_FIJA), B_CP = dosPatas(B_FIJA);

// ════════════════════════════════════════════════════════════════════════════
// SANIDAD
// ════════════════════════════════════════════════════════════════════════════
linea("SANIDAD — antes de mirar ningún resultado");
L(`  tickers: ${TICKERS.length} · días de cadena: ${mil(TICKERS.reduce((a, t) => a + diasPorSim.get(t).length, 0))} · de ${DIASTOT[0]} a ${DIASTOT.at(-1)} (${num(ANOSCAL, 1)} años)`);
L(`  días de cadena leídos de disco: ${mil(diasVistos)}`);
L(`  días de ENTRADA candidatos (universo DIARIO, con 30 días de bolsa por delante): ${mil(entradasDia)}`);
L(`  descartes — sin precio del subyacente o día roto en la entrada: ${mil(sinSpot)}`);
L(`  descartes — día roto entre la compra y la venta (la operación se va entera): ${mil(contaminadas)}`);
L(`  ⚠️ DÍAS SIN NINGÚN VENCIMIENTO EN LA BANDA (ese día no se opera): ${mil(sinBanda)} de ${mil(entradasDia * 2)} intentos envase×día = ${pct(sinBanda / (entradasDia * 2))}`);
L(`  descartes — sin contrato que encaje (strike lejos de la distancia o ask < $${ASKMIN.toFixed(2)}): ${mil(sinContrato)}`);
L(`  HUECOS descartados (falta la cadena de salida o el vencimiento entero): ${mil(huecos)} = ${pct(huecos / (huecos + OPS.length + OPSE.length))} de lo intentado`);
L(`  operaciones con distancia FIJA: ${mil(OPS.length)} · operaciones de la sonrisa (señal E): ${mil(OPSE.length)}`);
L(`  días rotos: sin precio ${mil(rotoSinSpot)} · se apartan >5% del cierre real ${mil(rotoContraCierre)} · saltos >35% no avalados ${mil(rotoSalto)} · saltos avalados ${saltoSalvado}`);
L(`\n  EL PLAZO, comprobado: envase A ${num(mide(A_FIJA).dte / A_FIJA.length, 1)} días de media (banda 55-65) · envase B ${num(mide(B_FIJA).dte / B_FIJA.length, 1)} días (banda 85-95)`);
L(`  La distancia real: A ${pct(mide(A_FIJA).dist / A_FIJA.length)} (se pidió 10.0%) · B ${pct(mide(B_FIJA).dist / B_FIJA.length)} (se pidió 5.0%)`);
L(`  La horquilla: A ${pct(mide(A_FIJA).horq / A_FIJA.length)} de la prima · B ${pct(mide(B_FIJA).horq / B_FIJA.length)}`);
L(`\n  Disponibilidad de cada señal (fracción de las operaciones del envase A que tienen el dato):`);
for (const r of REGLAS) L(`    ${r.et.padEnd(64)} ${pct(A_FIJA.filter((o) => r.disp(o)).length / A_FIJA.length)}`);

// ════════════════════════════════════════════════════════════════════════════
// EL LISTÓN MEDIDO AQUÍ
// ════════════════════════════════════════════════════════════════════════════
linea("EL LISTÓN MEDIDO AQUÍ — el envase VACÍO, universo diario, banda estrecha de plazo");
L(`  El listón publicado (0.95 en A, 1.00 en B) se midió SIN la banda estrecha. Con la banda el`);
L(`  universo cambia, así que el listón de este script tiene que salir de este script.`);
L(`\n  | envase | lado | n | ops/año | RATIO | acierta | ganador medio | perdedor medio | prima/subyacente | vence a cero |`);
L(`  |---|---|---|---|---|---|---|---|---|---|`);
const LISTON = {};
for (const [et, v, key] of [
  ["A", A_FIJA, "A|T"], ["A", A_C, "A|C"], ["A", A_P, "A|P"], ["A", A_CP, "A|CP"],
  ["B", B_FIJA, "B|T"], ["B", B_C, "B|C"], ["B", B_P, "B|P"], ["B", B_CP, "B|CP"],
]) {
  const a = mide(v);
  LISTON[key] = a;
  const lado = key.endsWith("|T") ? "las dos (como siempre)" : key.endsWith("|C") ? "**sólo CALLS**" : key.endsWith("|P") ? "sólo puts" : "las DOS PATAS juntas";
  L(`  | ${et} | ${lado} | ${mil(a.n)} | ${mil(a.n / ANOSCAL)} | **${num(R(a))}** | ${pct(AC(a))} | ${usd(a.gan / a.win)} | ${usd(a.per / (a.n - a.win))} | ${pct(a.coste / a.n)} | ${pct(a.cero / a.n)} |`);
}
L(`\n  listón publicado sin banda: A 0.95 · B 1.00`);
L(`  listón medido aquí (las dos, con banda): A ${num(R(LISTON["A|T"]))} · B ${num(R(LISTON["B|T"]))}`);

// ════════════════════════════════════════════════════════════════════════════
// LA PRUEBA QUE DECIDE — las calls en los tramos BAJISTAS
// ════════════════════════════════════════════════════════════════════════════
const SPYI = diasPorSim.get("SPY") ? new Map(diasPorSim.get("SPY").map((d, i) => [d, i])) : new Map();
const SPYS = SPOTS["SPY"] || [];
const SPYD = diasPorSim.get("SPY") || [];
/** Rendimiento del SPY entre dos fechas (primer y último día de cadena dentro del rango). */
function spyRango(d0, d1) {
  let a = null, b = null;
  for (let i = 0; i < SPYD.length; i++) {
    const d = SPYD[i];
    if (d < d0 || d > d1) continue;
    if (SPYS[i] == null || ROTO["SPY"]?.[i]) continue;
    if (a == null) a = SPYS[i];
    b = SPYS[i];
  }
  return a != null && b != null && a > 0 ? b / a - 1 : NaN;
}
const spyIdx = new Map(SPYD.map((d, i) => [d, i]));
/** Lo que hizo el SPY entre el día de compra y el día de venta DE ESA operación. */
function spyOp(o) {
  const a = spyIdx.get(o.dia), b = spyIdx.get(o.diaSal);
  if (a == null || b == null) return NaN;
  const x = SPYS[a], y = SPYS[b];
  return x > 0 && y > 0 && !ROTO["SPY"][a] && !ROTO["SPY"][b] ? y / x - 1 : NaN;
}

const TRAMOS = [
  { id: "2018Q4", et: "último trimestre de 2018", d0: "20181001", d1: "20181231" },
  { id: "2020MAR", et: "marzo de 2020", d0: "20200301", d1: "20200331" },
  { id: "2020CAI", et: "la caída de 2020 (19 feb – 23 mar)", d0: "20200219", d1: "20200323" },
  { id: "2022", et: "todo 2022", d0: "20220101", d1: "20221231" },
  { id: "2025ABR", et: "abril de 2025", d0: "20250401", d1: "20250430" },
];

linea("LA PRUEBA QUE DECIDE — las calls SÓLO en los tramos BAJISTAS (por fecha de ENTRADA)");
L(`  Si las calls siguen ganando aquí, hay algo más que la deriva. Si pierden, era la deriva.`);
L(`  ⚠️ Y la trampa que hay que enseñar en la misma tabla: la opción se TIENE 30 días de bolsa, así`);
L(`  que una compra de marzo de 2020 se vende a mediados de abril — EN EL REBOTE. Por eso va la`);
L(`  columna "SPY durante la tenencia": es lo que de verdad vivió el dinero.`);
L(`\n  | tramo | SPY en el tramo | SPY durante la TENENCIA | n calls | RATIO calls | acierta | RATIO puts | n puts | RATIO las dos patas | listón (las dos) |`);
L(`  |---|---|---|---|---|---|---|---|---|---|`);
const TRAMORES = {};
for (const T of TRAMOS) {
  const enT = (o) => o.dia >= T.d0 && o.dia <= T.d1;
  const cc = mide(A_C.filter(enT)), pp = mide(A_P.filter(enT)), cp = mide(A_CP.filter(enT)), tt = mide(A_FIJA.filter(enT));
  const ten = media(A_C.filter(enT).map(spyOp).filter(Number.isFinite));
  TRAMORES[T.id] = { cc, pp, cp, tt, spy: spyRango(T.d0, T.d1), ten };
  L(`  | ${T.et} | ${pct(TRAMORES[T.id].spy)} | **${pct(ten)}** | ${mil(cc.n)} | **${num(R(cc))}** | ${pct(AC(cc))} | ${num(R(pp))} | ${mil(pp.n)} | ${num(R(cp))} | ${num(R(tt))} |`);
}
{
  // los cuatro tramos que pide el encargo, juntos
  const dentro = (o) => TRAMOS.filter((t) => t.id !== "2020CAI").some((t) => o.dia >= t.d0 && o.dia <= t.d1);
  const cc = mide(A_C.filter(dentro)), pp = mide(A_P.filter(dentro)), cp = mide(A_CP.filter(dentro));
  const fuera = (o) => !dentro(o);
  const ccf = mide(A_C.filter(fuera)), ppf = mide(A_P.filter(fuera));
  L(`\n  LOS CUATRO TRAMOS JUNTOS (Q4-2018 + marzo-2020 + 2022 + abril-2025):`);
  L(`    calls: n=${mil(cc.n)} · RATIO ${num(R(cc))} · acierta ${pct(AC(cc))}`);
  L(`    puts : n=${mil(pp.n)} · RATIO ${num(R(pp))} · acierta ${pct(AC(pp))}`);
  L(`    las dos patas: RATIO ${num(R(cp))} (n=${mil(cp.n)})`);
  L(`    FUERA de esos tramos: calls ${num(R(ccf))} (n=${mil(ccf.n)}) · puts ${num(R(ppf))} (n=${mil(ppf.n)})`);
  L(`\n  Y las mismas calls con cada señal, SÓLO dentro de los cuatro tramos bajistas:`);
  L(`  | señal | n | RATIO calls en tramos bajistas | acierta |`);
  L(`  |---|---|---|---|`);
  for (const r of REGLAS) {
    const a = mide(A_C.filter((o) => dentro(o) && r.f(o)));
    if (a.n < 50) continue;
    L(`  | ${r.et} | ${mil(a.n)} | ${num(R(a))} | ${pct(AC(a))} |`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LA MISMA PRUEBA, SIN VENTANAS ARBITRARIAS — ¿qué hizo el mercado MIENTRAS
// la opción estaba en la mano?
// ════════════════════════════════════════════════════════════════════════════
// Definir "tramo bajista" por la fecha de ENTRADA tiene una trampa: la opción se tiene 30 días de
// bolsa, así que una compra en marzo de 2020 se vende a mediados de abril de 2020 — EN EL REBOTE.
// La versión limpia de la pregunta no necesita ventanas: se le pega a cada operación lo que hizo
// el SPY entre SU día de compra y SU día de venta, y se parte por ahí.
linea("LA MISMA PRUEBA, SIN VENTANAS — el mercado MIENTRAS la opción estaba en la mano");
{
  const conSpy = A_FIJA.map((o) => ({ o, r: spyOp(o) })).filter((x) => Number.isFinite(x.r));
  const rs = conSpy.map((x) => x.r).sort((a, b) => a - b);
  const cortes = [0.2, 0.4, 0.6, 0.8].map((q) => rs[Math.floor(rs.length * q)]);
  const cubo = (r) => { let k = 0; while (k < 4 && r > cortes[k]) k++; return k; };
  const ETQ = ["1 · el mercado más BAJISTA", "2", "3 · el medio", "4", "5 · el mercado más alcista"];
  L(`  El SPY durante los 30 días de bolsa de tenencia, partido en cinco montones del mismo tamaño.`);
  L(`  Cortes: ${cortes.map((c) => pct(c)).join(" · ")}. Operaciones con dato del SPY: ${mil(conSpy.length)} de ${mil(A_FIJA.length)}.`);
  L(`\n  | el SPY durante la tenencia | SPY medio | n calls | RATIO calls | acierta | n puts | RATIO puts | RATIO las dos patas |`);
  L(`  |---|---|---|---|---|---|---|---|`);
  const porCubo = [0, 1, 2, 3, 4].map(() => ({ C: [], P: [], r: [] }));
  for (const x of conSpy) { const k = cubo(x.r); porCubo[k][x.o.tipo].push(x.o); porCubo[k].r.push(x.r); }
  for (let k = 0; k < 5; k++) {
    const cc = mide(porCubo[k].C), pp = mide(porCubo[k].P);
    const cp = mide(dosPatas([...porCubo[k].C, ...porCubo[k].P]));
    L(`  | ${ETQ[k]} | ${pct(media(porCubo[k].r))} | ${mil(cc.n)} | **${num(R(cc))}** | ${pct(AC(cc))} | ${mil(pp.n)} | ${num(R(pp))} | ${num(R(cp))} |`);
  }
  const baj = conSpy.filter((x) => x.r < 0);
  const ccB = mide(baj.filter((x) => x.o.tipo === "C").map((x) => x.o));
  const ppB = mide(baj.filter((x) => x.o.tipo === "P").map((x) => x.o));
  const alc = conSpy.filter((x) => x.r >= 0);
  const ccA = mide(alc.filter((x) => x.o.tipo === "C").map((x) => x.o));
  L(`\n  LA FRASE CORTA: cuando el SPY BAJA durante la tenencia (${pct(baj.length / conSpy.length)} de las veces),`);
  L(`    las calls dan ${num(R(ccB))} (n=${mil(ccB.n)}, acierta ${pct(AC(ccB))}) y las puts ${num(R(ppB))}.`);
  L(`    Cuando el SPY sube, las calls dan ${num(R(ccA))} (n=${mil(ccA.n)}).`);
  writeFileSync("scripts/cache-theta/v4-mercado-tenencia.json", JSON.stringify({ callBaja: R(ccB), callSube: R(ccA), putBaja: R(ppB), nBaja: ccB.n }, null, 1));
}

// ════════════════════════════════════════════════════════════════════════════
// LAS CALLS POR AÑO CONTRA EL SPY
// ════════════════════════════════════════════════════════════════════════════
linea("LAS CALLS POR AÑO CONTRA LO QUE HIZO EL SPY ESE AÑO");
L(`  Si el ratio de las calls va pegado al SPY, es beta apalancada: no es el vehículo, es el mercado.`);
L(`\n  | año | SPY ese año | n calls | RATIO calls | acierta | RATIO puts | RATIO las dos patas | listón del año |`);
L(`  |---|---|---|---|---|---|---|---|`);
const xsA = [], ysA = [];
for (const y of ANOS) {
  const spy = spyRango(`${y}0101`, `${y}1231`);
  const cc = mide(A_C.filter((o) => o.ano === y));
  const pp = mide(A_P.filter((o) => o.ano === y));
  const cp = mide(A_CP.filter((o) => o.ano === y));
  const tt = mide(A_FIJA.filter((o) => o.ano === y));
  if (cc.n >= 100 && Number.isFinite(spy) && Number.isFinite(R(cc))) { xsA.push(spy); ysA.push(R(cc)); }
  L(`  | ${y} | ${pct(spy)} | ${mil(cc.n)} | **${num(R(cc))}** | ${pct(AC(cc))} | ${num(R(pp))} | ${num(R(cp))} | ${num(R(tt))} |`);
}
{
  const mx = media(xsA), my = media(ysA);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xsA.length; i++) { sxy += (xsA[i] - mx) * (ysA[i] - my); sxx += (xsA[i] - mx) ** 2; syy += (ysA[i] - my) ** 2; }
  L(`\n  Correlación entre lo que hizo el SPY y el ratio de las calls, año a año: ${num(sxy / Math.sqrt(sxx * syy))}  (${xsA.length} años)`);
  L(`  Años con SPY negativo: ${xsA.filter((x) => x < 0).length}. Ratio medio de las calls en esos años: ${num(media(ysA.filter((_, i) => xsA[i] < 0)))}`);
  L(`  Años con SPY positivo: ${xsA.filter((x) => x > 0).length}. Ratio medio de las calls en esos años: ${num(media(ysA.filter((_, i) => xsA[i] > 0)))}`);
}

// ════════════════════════════════════════════════════════════════════════════
// LA VERSIÓN LIMPIA — las DOS PATAS, con las señales
// ════════════════════════════════════════════════════════════════════════════
/** Aplica una regla a un conjunto de operaciones sueltas y devuelve el par (con señal, listón restringido). */
function conSenal(v, r, sh = 0) {
  const base = v.filter((o) => r.disp(o, sh));
  return { sel: base.filter((o) => r.f(o, sh)), base };
}
/** las dos patas con una señal: la señal se evalúa sobre la call (mismo día, mismo ticker: es igual) */
function cpConSenal(vCP, vSueltas, r) {
  const ok = new Set();
  for (const o of vSueltas) if (o.tipo === "C" && r.disp(o) && r.f(o)) ok.add(`${o.sym}|${o.i}|${o.ei}`);
  const disp = new Set();
  for (const o of vSueltas) if (o.tipo === "C" && r.disp(o)) disp.add(`${o.sym}|${o.i}|${o.ei}`);
  return { sel: vCP.filter((o) => ok.has(`${o.sym}|${o.i}|${o.ei}`)), base: vCP.filter((o) => disp.has(`${o.sym}|${o.i}|${o.ei}`)) };
}

linea("LA VERSIÓN LIMPIA — las DOS PATAS (call + put del mismo día y ticker): el vehículo sin dirección");
L(`  Cada operación son $2,000 arriesgados ($1,000 por pata) y el resultado se normaliza a la unidad.`);
L(`  Si esto no llega a 1.00, el vehículo NO vale: lo que gana en las calls es la dirección del mercado.`);
L(`\n  | señal | envase | n | ops/año | RATIO las dos patas | acierta | listón restringido |`);
L(`  |---|---|---|---|---|---|---|`);
for (const [eti, vCP, vSu] of [["A", A_CP, A_FIJA], ["B", B_CP, B_FIJA]]) {
  L(`  | SIN señal | ${eti} | ${mil(mide(vCP).n)} | ${mil(mide(vCP).n / ANOSCAL)} | **${num(R(mide(vCP)))}** | ${pct(AC(mide(vCP)))} | — |`);
  for (const r of REGLAS) {
    const { sel, base } = cpConSenal(vCP, vSu, r);
    if (sel.length < 100) continue;
    const a = mide(sel), b = mide(base);
    L(`  | ${r.et} | ${eti} | ${mil(a.n)} | ${mil(a.n / ANOSCAL)} | ${num(R(a))} | ${pct(AC(a))} | ${num(R(b))} |`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LAS CINCO SEÑALES, LADO A LADO: CALLS Y PUTS POR SEPARADO
// ════════════════════════════════════════════════════════════════════════════
linea("LAS CINCO SEÑALES, RE-MEDIDAS AQUÍ — calls y puts POR SEPARADO (envase A)");
L(`  La pregunta que decide la frecuencia: ¿hay alguna señal que SALVE a las puts?`);
L(`\n  | señal | n calls | ops/año | RATIO calls | acierta | n puts | ops/año | RATIO puts | acierta |`);
L(`  |---|---|---|---|---|---|---|---|---|`);
{
  const lc = mide(A_C), lp = mide(A_P);
  L(`  | **SIN señal (el listón)** | ${mil(lc.n)} | ${mil(lc.n / ANOSCAL)} | **${num(R(lc))}** | ${pct(AC(lc))} | ${mil(lp.n)} | ${mil(lp.n / ANOSCAL)} | **${num(R(lp))}** | ${pct(AC(lp))} |`);
}
const PUTRES = [];
for (const r of REGLAS) {
  const c = conSenal(A_C, r), p = conSenal(A_P, r);
  const ac = mide(c.sel), ap = mide(p.sel);
  if (ac.n < 100 && ap.n < 100) continue;
  PUTRES.push({ r, ap, base: mide(p.base), ac, baseC: mide(c.base) });
  L(`  | ${r.et} | ${mil(ac.n)} | ${mil(ac.n / ANOSCAL)} | ${num(R(ac))} | ${pct(AC(ac))} | ${mil(ap.n)} | ${mil(ap.n / ANOSCAL)} | **${num(R(ap))}** | ${pct(AC(ap))} |`);
}
// la señal E (la sonrisa) va aparte porque cambia el CONTRATO, no filtra días
{
  const E_A = OPSE.filter((o) => o.ei === 0);
  const ec = mide(E_A.filter((o) => o.tipo === "C")), ep = mide(E_A.filter((o) => o.tipo === "P"));
  L(`  | E · la sonrisa (la distancia más barata de cinco) | ${mil(ec.n)} | ${mil(ec.n / ANOSCAL)} | ${num(R(ec))} | ${pct(AC(ec))} | ${mil(ep.n)} | ${mil(ep.n / ANOSCAL)} | **${num(R(ep))}** | ${pct(AC(ep))} |`);
  const rep = new Map();
  for (const o of E_A) rep.set(o.dIdx, (rep.get(o.dIdx) || 0) + 1);
  L(`\n  Qué distancia elige la sonrisa: ${DISTS.map((d, a) => `${pct(d)}: ${pct((rep.get(a) || 0) / E_A.length)}`).join(" · ")}`);
}
L(`\n  Y el mismo cuadro en el envase B:`);
L(`  | señal | n calls | RATIO calls | acierta | n puts | RATIO puts | acierta |`);
L(`  |---|---|---|---|---|---|---|`);
{
  const lc = mide(B_C), lp = mide(B_P);
  L(`  | SIN señal | ${mil(lc.n)} | ${num(R(lc))} | ${pct(AC(lc))} | ${mil(lp.n)} | ${num(R(lp))} | ${pct(AC(lp))} |`);
}
for (const r of REGLAS) {
  const ac = mide(conSenal(B_C, r).sel), ap = mide(conSenal(B_P, r).sel);
  if (ac.n < 100 && ap.n < 100) continue;
  L(`  | ${r.et} | ${mil(ac.n)} | ${num(R(ac))} | ${pct(AC(ac))} | ${mil(ap.n)} | ${num(R(ap))} | ${pct(AC(ap))} |`);
}

// ════════════════════════════════════════════════════════════════════════════
// LAS PUTS A EXAMEN — la mejor regla de puts, con todas las cribas
// ════════════════════════════════════════════════════════════════════════════
const mejorPut = PUTRES.filter((x) => x.ap.n / ANOSCAL >= 150).sort((a, b) => R(b.ap) - R(a.ap))[0] ?? PUTRES.sort((a, b) => R(b.ap) - R(a.ap))[0];
const mejorCall = PUTRES.filter((x) => x.ac.n / ANOSCAL >= 150).sort((a, b) => R(b.ac) - R(a.ac))[0] ?? PUTRES.sort((a, b) => R(b.ac) - R(a.ac))[0];

/** El barajado con VEINTE desplazamientos: la misma regla, con la señal de k días de bolsa antes. */
function barajado(v, r) {
  const rs = [];
  for (const sh of DESPLS) {
    const a = mide(v.filter((o) => o.i - sh >= 0 && r.disp(o, sh) && r.f(o, sh)));
    if (a.n >= 100) rs.push(R(a));
  }
  rs.sort((a, b) => a - b);
  return rs;
}

function examen(titulo, v, r, lado) {
  const { sel, base } = lado === "CP" ? cpConSenal(v.cp, v.su, r) : conSenal(v, r);
  const a = mide(sel), b = mide(base);
  linea(`${titulo} — ${r.et}`);
  L(`  n=${mil(a.n)} (${mil(a.n / ANOSCAL)} operaciones al año) · RATIO ${num(R(a))} · acierta ${pct(AC(a))}`);
  L(`  listón restringido (los mismos días, sin la señal): ratio ${num(R(b))} · acierta ${pct(AC(b))}`);
  const bar = barajado(lado === "CP" ? v.su : v, r);
  L(`  BARAJADO con ${DESPLS.length} desplazamientos (21, 42, … 420 días de bolsa): de ${num(bar[0])} a ${num(bar.at(-1))}, mediana ${num(bar[bar.length >> 1])}`);
  L(`    desplazamientos que BATEN al real: ${bar.filter((x) => x > R(a)).length} de ${bar.length}`);
  L(`  ganador medio ${usd(a.gan / a.win)} · perdedor medio ${usd(a.per / (a.n - a.win))} · mayor billete ${usd(a.max)}`);
  L(`  ratio quitando el mayor billete: ${num((a.gan - a.max) / a.per)}`);
  const sin20 = mide(sel.filter((o) => o.ano !== "2020"));
  const sin20f = mide(sel.filter((o) => !(o.dia >= "20200201" && o.dia <= "20200531")));
  L(`  sin el año 2020 entero: ${num(R(sin20))} (n=${mil(sin20.n)}) · sin febrero-mayo de 2020: ${num(R(sin20f))} (n=${mil(sin20f.n)})`);
  L(`\n  Año a año:`);
  L(`  | año | n | RATIO con la señal | acierta | RATIO sin la señal |`);
  L(`  |---|---|---|---|---|`);
  let malos = 0, cuentan = 0;
  for (const y of ANOS) {
    const s = mide(sel.filter((o) => o.ano === y)), l = mide(base.filter((o) => o.ano === y));
    if (s.n < 30) { L(`  | ${y} | ${mil(s.n)} | muestra corta | | |`); continue; }
    cuentan++; if (R(s) < 1) malos++;
    L(`  | ${y} | ${mil(s.n)} | **${num(R(s))}** | ${pct(AC(s))} | ${num(R(l))} |`);
  }
  L(`  años con ratio por debajo de 1.00: ${malos} de ${cuentan}`);
  const TER = [["2016", "2019"], ["2020", "2022"], ["2023", "2026"]];
  L(`\n  Por tercios: ${TER.map(([x, z]) => { const t = mide(sel.filter((o) => o.ano >= x && o.ano <= z)); return `${x}-${z} ${num(R(t))} (n=${mil(t.n)})`; }).join(" · ")}`);
  L(`  Los cuatro años duros: ${["2018", "2020", "2022", "2025"].map((y) => { const t = mide(sel.filter((o) => o.ano === y)); return `${y} ${t.n >= 30 ? num(R(t)) : "n/d"}`; }).join(" · ")}`);
  const porTk = new Map();
  for (const o of sel) { if (!porTk.has(o.sym)) porTk.set(o.sym, []); porTk.get(o.sym).push(o); }
  const tks = [...porTk.entries()].map(([k, vv]) => ({ k, a: mide(vv) })).sort((x, z) => z.a.gan - x.a.gan);
  let ac2 = 0, cuantos = 0;
  for (const t of tks) { if (t.a.gan <= 0) break; ac2 += t.a.gan; cuantos++; if (ac2 >= a.gan / 2) break; }
  L(`\n  Por ticker: ${tks.length} tickers · ${tks.filter((t) => R(t.a) > 1).length} con ratio > 1 · ${cuantos} juntan la mitad de lo ganado`);
  L(`  mejores: ${tks.slice(0, 4).map((t) => `${t.k} ${num(R(t.a))}`).join(" · ")}`);
  L(`  peores : ${tks.slice(-4).map((t) => `${t.k} ${num(R(t.a))}`).join(" · ")}`);
  return { a, b, bar, malos, cuentan, cuantos, sin20, tks };
}

const EXPUT = mejorPut ? examen("LAS PUTS A EXAMEN — la mejor regla sobre PUTS (envase A)", A_P, mejorPut.r, "P") : null;
const EXCALL = mejorCall ? examen("LAS CALLS A EXAMEN — la mejor regla sobre CALLS (envase A)", A_C, mejorCall.r, "C") : null;

// las calls SIN señal, a examen (es la recomendación cruda que hay que juzgar)
linea("LAS CALLS SIN NINGUNA SEÑAL, A EXAMEN — envase A");
{
  const a = mide(A_C);
  L(`  n=${mil(a.n)} (${mil(a.n / ANOSCAL)} al año) · RATIO ${num(R(a))} · acierta ${pct(AC(a))}`);
  L(`  ganador medio ${usd(a.gan / a.win)} · perdedor medio ${usd(a.per / (a.n - a.win))} · mayor billete ${usd(a.max)} · sin él: ${num((a.gan - a.max) / a.per)}`);
  const sin20 = mide(A_C.filter((o) => o.ano !== "2020"));
  L(`  sin el año 2020 entero: ${num(R(sin20))} (n=${mil(sin20.n)})`);
  const TER = [["2016", "2019"], ["2020", "2022"], ["2023", "2026"]];
  L(`  por tercios: ${TER.map(([x, z]) => { const t = mide(A_C.filter((o) => o.ano >= x && o.ano <= z)); return `${x}-${z} ${num(R(t))} (n=${mil(t.n)})`; }).join(" · ")}`);
  let malos = 0, cuentan = 0;
  for (const y of ANOS) { const t = mide(A_C.filter((o) => o.ano === y)); if (t.n < 30) continue; cuentan++; if (R(t) < 1) malos++; }
  L(`  años con ratio por debajo de 1.00: ${malos} de ${cuentan}`);
  const porTk = new Map();
  for (const o of A_C) { if (!porTk.has(o.sym)) porTk.set(o.sym, []); porTk.get(o.sym).push(o); }
  const tks = [...porTk.entries()].map(([k, vv]) => ({ k, a: mide(vv) })).sort((x, z) => z.a.gan - x.a.gan);
  let ac2 = 0, cuantos = 0;
  for (const t of tks) { if (t.a.gan <= 0) break; ac2 += t.a.gan; cuantos++; if (ac2 >= a.gan / 2) break; }
  L(`  por ticker: ${tks.filter((t) => R(t.a) > 1).length} de ${tks.length} con ratio > 1 · ${cuantos} juntan la mitad de lo ganado`);
  L(`  mejores: ${tks.slice(0, 4).map((t) => `${t.k} ${num(R(t.a))}`).join(" · ")} · peores: ${tks.slice(-4).map((t) => `${t.k} ${num(R(t.a))}`).join(" · ")}`);
}

// ════════════════════════════════════════════════════════════════════════════
// LA PEGA PRÁCTICA — cuántas operaciones al año quedan en cada caso
// ════════════════════════════════════════════════════════════════════════════
linea("LA PEGA PRÁCTICA — operaciones al año en cada caso (envase A)");
L(`  | qué se compra | n | operaciones al año |`);
L(`  |---|---|---|`);
L(`  | las dos patas, sin señal (lo de siempre) | ${mil(A_FIJA.length)} | ${mil(A_FIJA.length / ANOSCAL)} |`);
L(`  | SÓLO CALLS, sin señal | ${mil(A_C.length)} | ${mil(A_C.length / ANOSCAL)} |`);
L(`  | sólo puts, sin señal | ${mil(A_P.length)} | ${mil(A_P.length / ANOSCAL)} |`);
for (const r of REGLAS) {
  const c = conSenal(A_C, r).sel, p = conSenal(A_P, r).sel;
  if (c.length < 100) continue;
  L(`  | sólo calls + ${r.et} | ${mil(c.length)} | ${mil(c.length / ANOSCAL)} |`);
  L(`  | sólo puts + ${r.et} | ${mil(p.length)} | ${mil(p.length / ANOSCAL)} |`);
}
if (mejorCall && mejorPut) {
  const c = conSenal(A_C, mejorCall.r).sel, p = conSenal(A_P, mejorPut.r).sel;
  const junta = mide([...c, ...p]);
  L(`\n  LA COMBINACIÓN QUE SALDRÍA DE AQUÍ: calls con «${mejorCall.r.et}» + puts con «${mejorPut.r.et}»`);
  L(`    n=${mil(junta.n)} · ${mil(junta.n / ANOSCAL)} operaciones al año · RATIO conjunto ${num(R(junta))} · acierta ${pct(AC(junta))}`);
  L(`    (sólo calls con su señal daría ${mil(c.length / ANOSCAL)} al año; añadir las puts ${R(mide(p)) >= 1 ? "SUBE" : "BAJA"} el ratio de ${num(R(mide(c)))} a ${num(R(junta))})`);
}

// ════════════════════════════════════════════════════════════════════════════
// PUERTAS ABIERTAS
// ════════════════════════════════════════════════════════════════════════════
const COMB = ENVASES.length * (REGLAS.length + 1) * 3 /* calls, puts, dos patas */ + TRAMOS.length * 4 + ENVASES.length * 2 /* sonrisa */;
linea("RESUMEN");
L(`  PUERTAS ABIERTAS (combinaciones medidas): ${COMB}`);
L(`    = ${ENVASES.length} envases × (${REGLAS.length} reglas + el listón) × 3 lados (calls / puts / dos patas)`);
L(`      + ${TRAMOS.length} tramos bajistas × 4 medidas + ${ENVASES.length * 2} de la sonrisa`);
L(`  Ninguna se elige por resultado para la conclusión principal: la conclusión sale de LOS TRAMOS`);
L(`  BAJISTAS y de LAS DOS PATAS, que estaban fijados antes de mirar nada.`);
L(``);
L(`  listón medido aquí (las dos patas sueltas, envase A): ${num(R(LISTON["A|T"]))} · publicado 0.95`);
L(`  sólo calls, envase A: ${num(R(LISTON["A|C"]))} (${mil(LISTON["A|C"].n / ANOSCAL)} al año) · sólo puts: ${num(R(LISTON["A|P"]))}`);
L(`  las DOS PATAS juntas (el vehículo sin dirección), envase A: ${num(R(LISTON["A|CP"]))}`);
L(`  calls en los cuatro tramos bajistas: ${num(R(mide(A_C.filter((o) => TRAMOS.filter((t) => t.id !== "2020CAI").some((t) => o.dia >= t.d0 && o.dia <= t.d1)))))}`);
if (mejorPut) L(`  mejor regla sobre PUTS: ${mejorPut.r.et} → ${num(R(mejorPut.ap))} (listón de puts ${num(R(LISTON["A|P"]))})`);
if (mejorCall) L(`  mejor regla sobre CALLS: ${mejorCall.r.et} → ${num(R(mejorCall.ac))} (listón de calls ${num(R(LISTON["A|C"]))})`);
L(`\n  tiempo total: ${Math.round((Date.now() - t0) / 60000)} minutos`);

// volcado para el informe
writeFileSync("scripts/cache-theta/v4-solo-calls.json", JSON.stringify({
  anosCal: ANOSCAL, nOps: OPS.length, huecos, sinBanda,
  liston: Object.fromEntries(Object.entries(LISTON).map(([k, a]) => [k, { n: a.n, r: R(a), ac: AC(a) }])),
  tramos: Object.fromEntries(Object.entries(TRAMORES).map(([k, v]) => [k, { spy: v.spy, callN: v.cc.n, callR: R(v.cc), callAc: AC(v.cc), putR: R(v.pp), cpR: R(v.cp) }])),
  puts: PUTRES.map((x) => ({ id: x.r.id, et: x.r.et, n: x.ap.n, r: R(x.ap), ac: AC(x.ap), base: R(x.base), callN: x.ac.n, callR: R(x.ac), callAc: AC(x.ac) })),
}, null, 1));
L(`  (detalle en scripts/cache-theta/v4-solo-calls.json)\n`);
