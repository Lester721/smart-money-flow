// V3-L3 — LENTE 3: ¿LA SEÑAL ES LO QUE DICE SER?
//
// Hallazgo a tumbar: "DOS PISOS — A (opción cara) Y C (frente caro) en el quinto más alto
// deciden QUÉ DÍA; la sonrisa decide QUÉ DISTANCIA. Envase A, 55-65 días, salir a los 30
// de bolsa. Ratio 1.49 contra listón 0.98, 249 patas/año, 0 de 20 barajados lo baten."
//
// El motor (etapas 0-3, la vara, las señales y la base) es COPIA VERBATIM de
// v3-se-suman-o-son-la-misma.mjs líneas 46-519, con TRES contadores añadidos que el original
// no tenía y una serie extra guardada en cada registro (rv60, caro y curva en crudo).
// Lo de abajo es nuevo.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/v3-l3-la-senal-no-es-lo-que-dice.mjs
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
// ── NUEVO (lente 3): el original nunca contaba esto ────────────────────────
//  ausente = el vencimiento SÍ está en la cadena de salida pero el contrato NO. El original lo
//  convierte en bid 0 (pérdida total) sin decir cuántas veces pasa. Aquí se cuenta y se marca.
let salExiste = 0, salAusente = 0, ausITM = 0, ausOTM = 0, ausSinSpot = 0;
const AUSPROF = [];   // cuanto DENTRO del dinero estaba el contrato que desaparecio
const AUSENTE = new Set();   // "sym|dia|ei|li" de las salidas que se leyeron como 0 por ausencia
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
          const cot = g[o.clave];
          if (cot) salExiste++;
          else {
            salAusente++; AUSENTE.add(`${sym}|${o.i}|${o.ei}|${o.li}`);
            // ¿estaba DENTRO del dinero el dia que desaparecio? Si lo estaba, el 0 es inventado.
            const Kx = Number(o.clave.slice(0, -2)), esC = o.clave.slice(-1) === "C", Sx = s[i];
            if (Sx == null) ausSinSpot++;
            else { const dentro = esC ? Kx < Sx : Kx > Sx; if (dentro) { ausITM++; AUSPROF.push(esC ? Sx / Kx - 1 : Kx / Sx - 1); } else ausOTM++; }
          }
          const salida = cot?.[0] ?? 0;             // sin puja = 0. Dato real.
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
        // NUEVO: los niveles EN CRUDO, no el percentil — para ver si el umbral es un termómetro
        rv: rv[i], caro: mCaro[ei][i], curva: mCurva[i], i,
        aus: Array.from({ length: 10 }, (_, li) => AUSENTE.has(`${sym}|${i}|${ei}|${li}`)),
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


// ████████████████████████████████████████████████████████████████████████████████████████████
// ██  DE AQUÍ PARA ABAJO ES NUEVO — LENTE 3
// ████████████████████████████████████████████████████████████████████████████████████████████

const base = BASE[0];
const fA = SIG[0].f, fC = SIG[2].f;
const PRED = (o) => fA(o) && fC(o);
const LISTON = mide(base, () => true, FIJO[0]);
const rnd = (s) => () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
function pctl2(v, q) { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }

linea("SANIDAD — el motor es el mismo. ¿Salen los mismos números?");
L(`  tickers ${TICKERS.length} · dias-ticker de base ${mil(base.length)} · anos ${NANOS} · patas medidas ${mil(patasOk)}`);
const AREG = mide(base, PRED, PORE);
L(`  LISTON (envase vacio, base comun, 10% fijo): ${f2(R(LISTON))} · acierta ${pct(AC(LISTON))} · n=${mil(LISTON.n)}   [el informe decia 0.98 / 21.1% / 43,135]`);
L(`  LA REGLA: ${f2(R(AREG))} · acierta ${pct(AC(AREG))} · n=${mil(AREG.n)} · ${mil(AREG.n / NANOS)} patas/ano   [el informe decia 1.49 / 21.3% / 2,488 / 249]`);
L(`  A sola ${f2(R(mide(base, fA, FIJO[0])))} · C sola ${f2(R(mide(base, fC, FIJO[0])))} · A Y C con strike fijo ${f2(R(mide(base, PRED, FIJO[0])))} · sonrisa sola ${f2(R(mide(base, () => true, PORE)))}`);

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("1 · EL HUECO QUE NUNCA SE CONTO — el informe dice 'huecos: 0'. De verdad?");
L(`  salidas donde el vencimiento estaba Y el contrato tambien: ${mil(salExiste)}`);
L(`  salidas donde el vencimiento estaba pero EL CONTRATO NO: ${mil(salAusente)} = ${pct(salAusente / (salExiste + salAusente))}`);
L(`  esas el motor las lee como bid 0 -> perdida del 100%. El original no las contaba por separado.`);
{
  let nA = 0, nP = 0;
  const conAus = acc(), sinAus = acc();
  for (const o of base) {
    if (!PRED(o)) continue;
    const d = PORE(o); if (d == null) continue;
    for (let t = 0; t < 2; t++) {
      const x = o.rets[d * 2 + t]; if (!Number.isFinite(x)) continue;
      if (o.aus[d * 2 + t]) { nA++; meteLeg(conAus, x); } else { nP++; meteLeg(sinAus, x); }
    }
  }
  L(`  DENTRO de la regla: ${mil(nA)} de ${mil(nA + nP)} patas (${pct(nA / (nA + nP))}) se cerraron con el contrato AUSENTE.`);
  L(`  ratio de la regla TIRANDO esas patas (tratarlas como hueco, no como cero): ${f2(R(sinAus))} (n=${mil(sinAus.n)})`);
  L(`  -> si tirarlas SUBE el ratio, el motor se estaba cobrando perdidas que quiza eran huecos de datos.`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("2 · DE CUANTOS BILLETES VIVE? — concentracion por ticker y por operacion");
{
  const porTk = midePorClave(base, PRED, PORE, (o) => o.sym);
  const tks = [...porTk.entries()].map(([k, v]) => ({ k, v, r: R(v) })).sort((x, y) => y.v.gan - x.v.gan);
  const G = AREG.gan, P = AREG.per;
  L(`  | quitando | ratio de lo que queda | n |`);
  L(`  |---|---|---|`);
  let g = G, p = P, n = AREG.n; const quita = [];
  L(`  | nada (la regla entera) | **${f2(G / P)}** | ${mil(n)} |`);
  for (let i = 0; i < 5; i++) {
    g -= tks[i].v.gan; p -= tks[i].v.per; n -= tks[i].v.n; quita.push(tks[i].k);
    L(`  | ${quita.join(" + ")} | **${f2(g / p)}** | ${mil(n)} |`);
  }
  L(``);
  L(`  Lo que gana cada uno de los cinco grandes:`);
  L(`  | ticker | n patas | ganado | % de TODO lo ganado | ratio propio | mayor billete |`);
  L(`  |---|---|---|---|---|---|`);
  for (let i = 0; i < 5; i++) L(`  | ${tks[i].k} | ${mil(tks[i].v.n)} | ${usd(tks[i].v.gan)} | ${pct(tks[i].v.gan / G)} | ${f2(tks[i].r)} | ${usd(tks[i].v.max)} |`);
  L(`  tickers con ratio > 1: ${tks.filter((t) => t.r > 1).length} de ${tks.length}`);

  const bil = billetes(base, PRED, PORE, 12);
  L(``);
  L(`  Los doce billetes mas gordos (apuesta $${mil(APUESTA)}):`);
  L(`  | # | ticker | dia compra | distancia | lado | x | dinero | % de todo lo ganado |`);
  L(`  |---|---|---|---|---|---|---|---|`);
  bil.forEach((b, i) => L(`  | ${i + 1} | ${b.sym} | ${b.dia} | ${pct(b.dist)} | ${b.tipo} | ${f1(b.veces)}x | ${usd(b.d)} | ${pct(b.d / G)} |`));
  for (const k of [1, 3, 5, 10]) {
    const s = bil.slice(0, k).reduce((z, b) => z + b.d, 0);
    L(`  quitando los ${k} mayores: ratio ${f2((G - s) / P)} (esos ${k} son el ${pct(s / G)} de lo ganado)`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("3 · ES UN TERMOMETRO DE VOLATILIDAD? — compra la fraccion de dias que dice comprar?");
{
  L(`  El corte es el quinto mas alto de A Y el quinto mas alto de C. Si fueran independientes`);
  L(`  dispararia el 20%x20% = 4.0% de los dias, IGUAL todos los anos.`);
  L(``);
  L(`  | ano | dias-ticker | dias que dispara | fraccion | ratio de la regla | liston de ese ano | rv60 medio anualizado |`);
  L(`  |---|---|---|---|---|---|---|`);
  const porAnoR = midePorClave(base, PRED, PORE, (o) => o.ano);
  const porAnoL = midePorClave(base, () => true, FIJO[0], (o) => o.ano);
  const fr = [];
  for (const y of ANOS) {
    const dd = base.filter((o) => o.ano === y);
    const ds = dd.filter(PRED);
    const v = porAnoR.get(y), l = porAnoL.get(y);
    const rvs = dd.filter((o) => o.rv != null).map((o) => o.rv);
    const rvm = rvs.length ? rvs.reduce((a, b) => a + b, 0) / rvs.length : NaN;
    fr.push({ y, f: ds.length / Math.max(1, dd.length), n: dd.length, rv: rvm });
    L(`  | ${y} | ${mil(dd.length)} | ${mil(ds.length)} | **${pct(ds.length / Math.max(1, dd.length))}** | ${v && v.n >= 40 ? f2(R(v)) : "n/d"} | ${l && l.n >= 40 ? f2(R(l)) : "n/d"} | ${pct(rvm * Math.sqrt(252))} |`);
  }
  const vv = fr.filter((x) => x.n >= 300);
  const mn = Math.min(...vv.map((x) => x.f)), mx = Math.max(...vv.map((x) => x.f));
  L(``);
  L(`  La fraccion va del ${pct(mn)} al ${pct(mx)} — ${f1(mx / mn)} veces mas en un ano que en otro.`);
  const porMes = new Map();
  for (const o of base) {
    const m = o.dia.slice(0, 6);
    if (!porMes.has(m)) porMes.set(m, { n: 0, s: 0, rv: 0, rn: 0 });
    const e = porMes.get(m); e.n++; if (PRED(o)) e.s++; if (o.rv != null) { e.rv += o.rv; e.rn++; }
  }
  const msr = [...porMes.entries()].filter(([, e]) => e.n >= 40 && e.rn > 0).map(([m, e]) => ({ m, f: e.s / e.n, rv: e.rv / e.rn }));
  const cor = (a, b) => { const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length; let nn = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { nn += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return nn / Math.sqrt(da * db); };
  L(`  Mes a mes (${msr.length} meses): la correlacion entre "que fraccion de dias dispara" y "cuanto se mueve el subyacente (rv60)" es ${f2(cor(msr.map((x) => x.f), msr.map((x) => x.rv)))}.`);
  const cAlto = pctl2(msr.map((z) => z.rv), 0.8), cBajo = pctl2(msr.map((z) => z.rv), 0.2);
  const alto = msr.filter((x) => x.rv >= cAlto), bajo = msr.filter((x) => x.rv <= cBajo);
  L(`    en el quinto de meses MAS movidos dispara el ${pct(alto.reduce((a, x) => a + x.f, 0) / alto.length)} de los dias;`);
  L(`    en el quinto de meses MAS CALMOS dispara el ${pct(bajo.reduce((a, x) => a + x.f, 0) / bajo.length)}.`);
  L(`  -> si el umbral fuera lo que dice (percentil del PROPIO ticker), estas dos cifras serian iguales.`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("4 · CUANTAS APUESTAS DE VERDAD? — no son 2,488 monedas independientes");
{
  const porDia = new Map();
  for (const o of base) {
    if (!PRED(o)) continue; const d = PORE(o); if (d == null) continue;
    if (!porDia.has(o.dia)) porDia.set(o.dia, { tk: new Set(), gan: 0, per: 0, n: 0 });
    const e = porDia.get(o.dia); e.tk.add(o.sym);
    for (let t = 0; t < 2; t++) { const x = o.rets[d * 2 + t]; if (!Number.isFinite(x)) continue; e.n++; const q = APUESTA * x; if (q > 0) e.gan += q; else e.per += -q; }
  }
  const dd = [...porDia.entries()].map(([k, e]) => ({ k, ...e })).sort((a, b) => b.gan - a.gan);
  L(`  dias de calendario distintos en que dispara: ${mil(dd.length)} (con ${mil(AREG.n)} patas -> ${f1(AREG.n / dd.length)} patas por dia)`);
  L(`  maximo de tickers disparando el MISMO dia: ${Math.max(...dd.map((x) => x.tk.size))} de ${TICKERS.length}`);
  L(``);
  L(`  Los diez dias que mas dinero dieron:`);
  L(`  | dia de compra | tickers | patas | ganado | % de TODO lo ganado |`);
  L(`  |---|---|---|---|---|`);
  let ac = 0;
  dd.slice(0, 10).forEach((x) => { ac += x.gan; L(`  | ${x.k} | ${x.tk.size} | ${x.n} | ${usd(x.gan)} | ${pct(x.gan / AREG.gan)} |`); });
  L(`  esos diez DIAS juntos: ${pct(ac / AREG.gan)} de todo lo ganado. Ratio sin ellos: ${f2((AREG.gan - ac) / AREG.per)}`);
  const porMesG = new Map();
  for (const x of dd) { const m = x.k.slice(0, 6); if (!porMesG.has(m)) porMesG.set(m, { gan: 0, per: 0, n: 0 }); const e = porMesG.get(m); e.gan += x.gan; e.per += x.per; e.n += x.n; }
  const mm = [...porMesG.entries()].map(([k, e]) => ({ k, ...e })).sort((a, b) => b.gan - a.gan);
  L(``);
  L(`  Los seis MESES de compra que mas dieron (de ${mm.length} meses con senal):`);
  L(`  | mes de compra | patas | ganado | % de todo |`);
  L(`  |---|---|---|---|`);
  let am = 0, ap = 0;
  mm.slice(0, 6).forEach((x) => { am += x.gan; ap += x.per; L(`  | ${x.k} | ${x.n} | ${usd(x.gan)} | ${pct(x.gan / AREG.gan)} |`); });
  L(`  esos seis MESES: ${pct(am / AREG.gan)} de todo lo ganado. Ratio sin ellos: ${f2((AREG.gan - am) / (AREG.per - ap))}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("5 · LA REGLA TONTA — comprar cuando el MERCADO ENTERO esta movido");
{
  const porDia = new Map();
  for (const o of base) { if (o.rv == null) continue; if (!porDia.has(o.dia)) porDia.set(o.dia, { s: 0, n: 0 }); const e = porDia.get(o.dia); e.s += o.rv; e.n++; }
  const dias = [...porDia.keys()].sort();
  const serie = dias.map((d) => porDia.get(d).s / porDia.get(d).n);
  const pM = new Map(); const vals = [];
  for (let i = 0; i < dias.length; i++) { const desde = Math.max(0, vals.length - 250); const m = vals.length - desde; if (m >= 150) { let men = 0; for (let j = desde; j < vals.length; j++) if (vals[j] < serie[i]) men++; pM.set(dias[i], men / m); } vals.push(serie[i]); }
  const tonta = (o) => (pM.get(o.dia) ?? 0) > 0.80;
  const aT = mide(base, tonta, PORE), aTf = mide(base, tonta, FIJO[0]);
  L(`  Regla TONTA: no mira nada de la cadena. Solo "esta el mercado entero en su quinto mas movido?"`);
  L(`  · con la sonrisa eligiendo strike: ratio ${f2(R(aT))} · acierta ${pct(AC(aT))} · n=${mil(aT.n)} (${mil(aT.n / NANOS)}/ano)`);
  L(`  · con el 10% fijo                : ratio ${f2(R(aTf))} · acierta ${pct(AC(aTf))} · n=${mil(aTf.n)}`);
  L(`  · LA REGLA de verdad             : ratio ${f2(R(AREG))} · acierta ${pct(AC(AREG))} · n=${mil(AREG.n)}`);
  const dS = base.filter(PRED), coin = dS.filter(tonta).length;
  L(``);
  L(`  De los ${mil(dS.length)} dias-ticker que compra la regla, el ${pct(coin / dS.length)} caen en dias de mercado movido`);
  L(`  (que son el ${pct(base.filter(tonta).length / base.length)} de todos los dias). Si la regla no fuera un termometro, saldria lo mismo.`);
  const aCal = mide(base, (o) => PRED(o) && !tonta(o), PORE);
  const lCal = mide(base, (o) => !tonta(o), PORE);
  const aMov = mide(base, (o) => PRED(o) && tonta(o), PORE);
  const lMov = mide(base, (o) => tonta(o), PORE);
  L(``);
  L(`  | donde | la REGLA | el ENVASE VACIO ahi mismo | aporta la regla? |`);
  L(`  |---|---|---|---|`);
  L(`  | dias de mercado MOVIDO | ${f2(R(aMov))} (n=${mil(aMov.n)}) | ${f2(R(lMov))} (n=${mil(lMov.n)}) | ${R(aMov) > R(lMov) ? "si" : "NO"} |`);
  L(`  | dias de mercado CALMO  | ${f2(R(aCal))} (n=${mil(aCal.n)}) | ${f2(R(lCal))} (n=${mil(lCal.n)}) | ${R(aCal) > R(lCal) ? "si" : "NO"} |`);
  L(`  -> si la regla solo gana en la fila de arriba, no es una senal: es la fecha.`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("6 · CALLS O PUTS? — es la senal, o es la caida del mercado?");
{
  const lado = (t, p) => { const a = acc(); for (const o of base) { if (p && !PRED(o)) continue; const d = o.eIdx; if (d == null) continue; const x = o.rets[d * 2 + t]; if (Number.isFinite(x)) meteLeg(a, x); } return a; };
  L(`  | lado | LA REGLA | acierto | n | el envase vacio (misma sonrisa) |`);
  L(`  |---|---|---|---|---|`);
  for (const [t, et] of [[0, "CALL"], [1, "PUT"]]) { const a = lado(t, true), l = lado(t, false); L(`  | ${et} | **${f2(R(a))}** | ${pct(AC(a))} | ${mil(a.n)} | ${f2(R(l))} |`); }
  L(`  -> si solo gana en puts, la regla es un seguro contra caidas y su nota es el crash de 2020, no la senal.`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("7 · ES EARNINGS? — semana del trimestre, e indices contra acciones");
{
  const sem = (d) => { const mes = +d.slice(4, 6), dia = +d.slice(6, 8); const mq = (mes - 1) % 3; return Math.min(13, Math.floor((mq * 30.4 + dia) / 7)); };
  const cnt = new Array(14).fill(0), tot = new Array(14).fill(0);
  for (const o of base) { const s = sem(o.dia); tot[s]++; if (PRED(o)) cnt[s]++; }
  L(`  Semana del trimestre (0 = primera semana de ene/abr/jul/oct). Los earnings caen casi siempre en las semanas 2-6.`);
  L(`  | semana | dias | dispara | fraccion |`);
  L(`  |---|---|---|---|`);
  for (let s = 0; s <= 13; s++) if (tot[s] > 100) L(`  | ${s} | ${mil(tot[s])} | ${mil(cnt[s])} | ${pct(cnt[s] / tot[s])} |`);
  const IDX = new Set(["SPY", "QQQ"]);
  const aI = mide(base, (o) => PRED(o) && IDX.has(o.sym), PORE), aS = mide(base, (o) => PRED(o) && !IDX.has(o.sym), PORE);
  const lI = mide(base, (o) => IDX.has(o.sym), FIJO[0]), lS = mide(base, (o) => !IDX.has(o.sym), FIJO[0]);
  L(``);
  L(`  SPY y QQQ NO tienen earnings. Si la senal fuera earnings, no deberia funcionar en ellos:`);
  L(`  | grupo | ratio de la regla | n | liston de ese grupo |`);
  L(`  |---|---|---|---|`);
  L(`  | SPY + QQQ (indices, sin earnings) | **${f2(R(aI))}** | ${mil(aI.n)} | ${f2(R(lI))} |`);
  L(`  | las demas acciones sueltas | **${f2(R(aS))}** | ${mil(aS.n)} | ${f2(R(lS))} |`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("8 · EL BARAJADO QUE RESPETA EL REGIMEN — 20 tiradas, cambiando el DIA pero no el MES");
{
  L(`  El barajado del informe desplaza 25..500 sesiones: eso saca la senal de 2020 y la mete en 2021.`);
  L(`  Claro que se cae. Aqui se cambia el dia por OTRO DIA DEL MISMO TICKER Y EL MISMO MES.`);
  L(`  Si la regla elige el DIA, tiene que ganarle a su propio mes. Si solo elige el MES, saldra igual.`);
  const porTM = new Map();
  for (const o of base) { const k = `${o.sym}|${o.dia.slice(0, 6)}`; if (!porTM.has(k)) porTM.set(k, []); porTM.get(k).push(o); }
  const nulos = [];
  for (let s = 1; s <= 20; s++) {
    const rr = rnd(s * 7919); const a = acc();
    for (const o of base) { if (!PRED(o)) continue; const v = porTM.get(`${o.sym}|${o.dia.slice(0, 6)}`); const c = v[Math.min(v.length - 1, Math.floor(rr() * v.length))]; const d = c.eIdx; if (d == null) continue; for (let t = 0; t < 2; t++) { const x = c.rets[d * 2 + t]; if (Number.isFinite(x)) meteLeg(a, x); } }
    nulos.push(R(a));
  }
  const sn = [...nulos].sort((x, y) => x - y);
  L(``);
  L(`  | tirada | ratio | | tirada | ratio |`);
  L(`  |---|---|---|---|---|`);
  for (let i = 0; i < 10; i++) L(`  | ${i + 1} | ${f2(nulos[i])} | | ${i + 11} | ${f2(nulos[i + 10])} |`);
  L(`  las 20 van de ${f2(sn[0])} a ${f2(sn[19])}, mediana ${f2(sn[10])}. La regla de verdad: ${f2(R(AREG))}.`);
  L(`  tiradas que BATEN a la regla: ${sn.filter((x) => x > R(AREG)).length} de 20.`);
  const porTA = new Map();
  for (const o of base) { const k = `${o.sym}|${o.ano}`; if (!porTA.has(k)) porTA.set(k, []); porTA.get(k).push(o); }
  const nulosA = [];
  for (let s = 1; s <= 20; s++) {
    const rr = rnd(s * 104729); const a = acc();
    for (const o of base) { if (!PRED(o)) continue; const v = porTA.get(`${o.sym}|${o.ano}`); const c = v[Math.min(v.length - 1, Math.floor(rr() * v.length))]; const d = c.eIdx; if (d == null) continue; for (let t = 0; t < 2; t++) { const x = c.rets[d * 2 + t]; if (Number.isFinite(x)) meteLeg(a, x); } }
    nulosA.push(R(a));
  }
  const sa = [...nulosA].sort((x, y) => x - y);
  L(``);
  L(`  El mismo nulo pero dentro del mismo ANO (mas flojo): van de ${f2(sa[0])} a ${f2(sa[19])}, mediana ${f2(sa[10])}, la baten ${sa.filter((x) => x > R(AREG)).length} de 20.`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("9 · QUE COMPRA DE VERDAD? — la distancia elegida y el tamano del billete");
{
  const cd = new Map(DISTS.map((x) => [x, 0])), cdL = new Map(DISTS.map((x) => [x, 0]));
  const tramos = [[0.10, 0.25], [0.25, 0.50], [0.50, 1.00], [1.00, 2.50], [2.50, 1e9]];
  const aT = tramos.map(() => acc()), lT = tramos.map(() => acc());
  let sh = 0, nh = 0, sa = 0, nL = 0;
  for (const o of base) {
    const d = o.eIdx; if (d == null) continue;
    for (let t = 0; t < 2; t++) {
      const x = o.rets[d * 2 + t]; if (!Number.isFinite(x)) continue;
      const pr = o.ask[d * 2 + t]; const ti = tramos.findIndex(([a, b]) => pr >= a && pr < b);
      cdL.set(DISTS[d], cdL.get(DISTS[d]) + 1); nL++; if (ti >= 0) meteLeg(lT[ti], x);
      if (!PRED(o)) continue;
      cd.set(DISTS[d], cd.get(DISTS[d]) + 1); if (ti >= 0) meteLeg(aT[ti], x);
      if (Number.isFinite(o.hq[d * 2 + t])) { nh++; sh += o.hq[d * 2 + t]; sa += pr; }
    }
  }
  L(`  Distancia que elige la sonrisa cuando la regla compra: ${[...cd].map(([k, v]) => `${pct(k)}->${pct(v / AREG.n)}`).join(" · ")}`);
  L(`  Y cuando compra todos los dias (el envase vacio con sonrisa): ${[...cdL].map(([k, v]) => `${pct(k)}->${pct(v / nL)}`).join(" · ")}`);
  L(`  peaje de entrada: la horquilla se lleva el ${pct(sh / nh)} de la prima · prima media pagada $${f2(sa / nh)}`);
  L(``);
  L(`  | prima pagada por contrato | patas de la regla | ratio | ratio del envase vacio ahi |`);
  L(`  |---|---|---|---|`);
  tramos.forEach(([a, b], i) => L(`  | $${f2(a)}${b > 1e8 ? "+" : `-$${f2(b)}`} | ${mil(aT[i].n)} (${pct(aT[i].n / AREG.n)}) | **${f2(R(aT[i]))}** | ${f2(R(lT[i]))} |`));
  L(`  -> si todo el dinero sale del tramo de $0.10-$0.25, no es una estrategia: es el suelo de ASKMIN.`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("10 · A MANO, EN EL FICHERO — los seis billetes grandes leidos del JSON crudo");
{
  const bil = billetes(base, PRED, PORE, 6);
  L(`  | ticker | compra | venta | contrato | ask compra | bid venta | x | spot compra | spot venta | cierre compra | cierre venta |`);
  L(`  |---|---|---|---|---|---|---|---|---|---|---|`);
  for (const b of bil) {
    try {
      const dias = diasPorSim.get(b.sym); const i = dias.indexOf(b.dia); const iSal = i + SALIDA;
      const t = b.tipo === "call" ? 0 : 1;
      const cE = leer(b.sym, dias[i]), cS = leer(b.sym, dias[iSal]);
      const S = SPOTS[b.sym][i];
      const eo = expEnBanda(cE, dias[i], 55, 65, 60); const g = parsea(cE[eo.exp]);
      const ct = contrato(g, S, b.dist, t === 0 ? "C" : "P");
      const gs = cS?.[eo.exp]; const cot = gs?.[ct.clave];
      const cl = cierresDe(b.sym);
      L(`  | ${b.sym} | ${b.dia} | ${dias[iSal]} | ${ct.clave} venc.${eo.exp} (${eo.dte}d) | $${f2(ct.ask)} (bid $${f2(ct.bid)}) | ${cot ? `$${f2(cot[0])} (ask $${f2(cot[1])})` : "**AUSENTE->0**"} | ${f1(b.veces)}x | $${f2(S)} | $${f2(SPOTS[b.sym][iSal])} | $${f2(cl?.[dias[i]])} | $${f2(cl?.[dias[iSal]])} |`);
    } catch (e) { L(`  | ${b.sym} | ${b.dia} | ERROR ${e.message} | | | | | | | | |`); }
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("11 · SIN LOS DOS ANOS QUE LO SOSTIENEN");
{
  const q = (f, et) => { const a = mide(base, (o) => PRED(o) && f(o), PORE), l = mide(base, f, FIJO[0]); L(`  | ${et} | ${mil(a.n)} | **${f2(R(a))}** | ${f2(R(l))} |`); };
  L(`  | periodo | n | ratio de la regla | liston del mismo periodo |`);
  L(`  |---|---|---|---|`);
  q(() => true, "todo");
  q((o) => o.ano !== "2020", "sin 2020");
  q((o) => o.ano !== "2026", "sin 2026");
  q((o) => o.ano !== "2020" && o.ano !== "2026", "**sin 2020 NI 2026**");
  q((o) => o.ano >= "2021", "de 2021 en adelante");
  q((o) => o.ano >= "2021" && o.ano <= "2025", "2021-2025 (los cinco anos enteros mas recientes)");
  q((o) => o.ano !== "2020" && o.ano !== "2026" && o.sym !== "QQQ", "sin 2020, sin 2026 y sin QQQ");
}

L(``);
L(`  tiempo total: ${Math.round((Date.now() - t0) / 1000)}s`);
L(``);

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("12 · LOS FANTASMAS — el contrato que desaparece, esta DENTRO del dinero?");
{
  L(`  De las ${mil(salAusente)} salidas en que el vencimiento estaba pero el contrato NO:`);
  L(`    estaba FUERA del dinero (valia 0 de verdad, el cero es correcto): ${mil(ausOTM)} = ${pct(ausOTM / salAusente)}`);
  L(`    estaba DENTRO del dinero (el cero es INVENTADO, es un hueco): ${mil(ausITM)} = ${pct(ausITM / salAusente)}`);
  L(`    sin precio del subyacente ese dia: ${mil(ausSinSpot)}`);
  if (AUSPROF.length) {
    const sp = [...AUSPROF].sort((a, b) => a - b);
    L(`    de los que estaban DENTRO, la mediana estaba un ${pct(sp[sp.length >> 1])} dentro y el peor un ${pct(sp[sp.length - 1])} dentro.`);
    L(`    (una opcion un ${pct(sp[sp.length - 1])} dentro del dinero NO vale 0; ese 0 es dinero regalado al perdedor)`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("13 · POR QUE SE MUEVE LA FRACCION — A sola, C sola y el solape, ano a ano");
{
  L(`  A y C se calculan cada una como percentil del PROPIO ticker: por construccion cada una`);
  L(`  dispara ~20% de los dias TODOS los anos. Si el 'A Y C' salta del 1.8% al 10.5%, lo que se`);
  L(`  mueve es CUANTO COINCIDEN — o sea, cuando son dos confirmaciones y cuando son una sola.`);
  L(``);
  L(`  | ano | A sola | C sola | A Y C | si fueran independientes | veces mas de lo independiente |`);
  L(`  |---|---|---|---|---|---|`);
  for (const y of ANOS) {
    const dd = base.filter((o) => o.ano === y);
    if (dd.length < 300) continue;
    const a = dd.filter(fA).length / dd.length, c = dd.filter(fC).length / dd.length;
    const j = dd.filter(PRED).length / dd.length;
    L(`  | ${y} | ${pct(a)} | ${pct(c)} | **${pct(j)}** | ${pct(a * c)} | ${f1(j / (a * c))}x |`);
  }
  L(``);
  L(`  -> si esa ultima columna se mueve mucho, "las dos a la vez" no significa lo mismo cada ano.`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("14 · EL NULO DEL MISMO MES, PERO SIN LOS DOS EPISODIOS QUE LO SOSTIENEN");
{
  const dentro = (o) => o.ano !== "2020" && o.ano !== "2026";
  const real = mide(base, (o) => PRED(o) && dentro(o), PORE);
  const porTM = new Map();
  for (const o of base) { if (!dentro(o)) continue; const k = `${o.sym}|${o.dia.slice(0, 6)}`; if (!porTM.has(k)) porTM.set(k, []); porTM.get(k).push(o); }
  const nulos = [];
  for (let s = 1; s <= 20; s++) {
    const rr = rnd(s * 7919); const a = acc();
    for (const o of base) { if (!PRED(o) || !dentro(o)) continue; const v = porTM.get(`${o.sym}|${o.dia.slice(0, 6)}`); const c = v[Math.min(v.length - 1, Math.floor(rr() * v.length))]; const d = c.eIdx; if (d == null) continue; for (let t = 0; t < 2; t++) { const x = c.rets[d * 2 + t]; if (Number.isFinite(x)) meteLeg(a, x); } }
    nulos.push(R(a));
  }
  const sn = [...nulos].sort((x, y) => x - y);
  L(`  Fuera de 2020 y 2026, la regla da ${f2(R(real))} (n=${mil(real.n)}).`);
  L(`  Los 20 nulos del mismo mes van de ${f2(sn[0])} a ${f2(sn[19])}, mediana ${f2(sn[10])}.`);
  L(`  nulos que BATEN a la regla: **${sn.filter((x) => x > R(real)).length} de 20**.`);
  L(`  -> el "0 de 20" del informe se mide con los dos episodios dentro. Aqui se ve sin ellos.`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("15 · FUERA DE MUESTRA DE VERDAD — partir la historia en dos y en tres");
{
  const q = (f, et) => { const a = mide(base, (o) => PRED(o) && f(o), PORE), l = mide(base, f, FIJO[0]); L(`  | ${et} | ${mil(a.n)} | **${f2(R(a))}** | ${f2(R(l))} | ${R(a) > R(l) ? "gana" : "**PIERDE**"} |`); };
  L(`  | trozo | n | ratio de la regla | liston del mismo trozo | veredicto |`);
  L(`  |---|---|---|---|---|`);
  q((o) => o.ano <= "2020", "primera mitad 2017-2020");
  q((o) => o.ano >= "2021", "segunda mitad 2021-2026");
  q((o) => o.ano <= "2019", "tercio 1 · 2017-2019");
  q((o) => o.ano >= "2020" && o.ano <= "2022", "tercio 2 · 2020-2022");
  q((o) => o.ano >= "2023", "tercio 3 · 2023-2026");
  L(``);
  L(`  Y lo mismo SIN los dos indices (SPY y QQQ), que son de donde sale todo:`);
  L(`  | trozo | n | ratio de la regla | liston del mismo trozo | veredicto |`);
  L(`  |---|---|---|---|---|`);
  const noIdx = (o) => o.sym !== "SPY" && o.sym !== "QQQ";
  const q2 = (f, et) => { const a = mide(base, (o) => PRED(o) && noIdx(o) && f(o), PORE), l = mide(base, (o) => noIdx(o) && f(o), FIJO[0]); L(`  | ${et} | ${mil(a.n)} | **${f2(R(a))}** | ${f2(R(l))} | ${R(a) > R(l) ? "gana" : "**PIERDE**"} |`); };
  q2(() => true, "todo, sin SPY ni QQQ");
  q2((o) => o.ano <= "2020", "2017-2020, sin SPY ni QQQ");
  q2((o) => o.ano >= "2021", "2021-2026, sin SPY ni QQQ");
}

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("16 · ANO A ANO SIN LOS DOS INDICES — donde vive de verdad el hallazgo");
{
  const noIdx = (o) => o.sym !== "SPY" && o.sym !== "QQQ";
  L(`  | ano | n (26 acciones) | ratio | liston | n (SPY+QQQ) | ratio indices |`);
  L(`  |---|---|---|---|---|---|`);
  for (const y of ANOS) {
    const a = mide(base, (o) => PRED(o) && noIdx(o) && o.ano === y, PORE);
    const l = mide(base, (o) => noIdx(o) && o.ano === y, FIJO[0]);
    const i = mide(base, (o) => PRED(o) && !noIdx(o) && o.ano === y, PORE);
    if (a.n < 30 && i.n < 10) continue;
    L(`  | ${y} | ${mil(a.n)} | ${a.n >= 30 ? f2(R(a)) : "n/d"} | ${f2(R(l))} | ${mil(i.n)} | ${i.n >= 10 ? f2(R(i)) : "n/d"} |`);
  }
}

L(``);
L(`  tiempo total parte B: ${Math.round((Date.now() - t0) / 1000)}s`);
L(``);
