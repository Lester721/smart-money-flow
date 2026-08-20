// ═══ CONVEXIDAD · PASO 3 — LA TABLA DE CANDIDATOS ═══════════════════════════════════════
//
// Construye, para cada (día, ticker) del solape, EL MISMO contrato convexo, con PRECIOS REALES:
// se compra al ASK de cierre de ese día y se vende al BID de cierre H días después.
//
// ── EL PERFIL (no se inventa aquí: es el "cubo estrella" ya establecido en contratos-10x.mjs)
//    calls · vencimiento a más de un año · lejos del dinero · ask ≥ $0,10 · horquilla ≤ 40%
//    La distancia se fija en σ (1,5σ del movimiento hasta el vencimiento, con la volatilidad
//    realizada de 60 días ANTERIORES) para que el mismo número signifique lo mismo en KO que
//    en TSLA. Cuando ese strike NO está listado (INTC con rv60=92% pediría K/S=3,98) se compra
//    EL MÁS LEJANO QUE SE PUEDE COMPRAR y se anota cuántas σ son de verdad. No se rellena nada.
//
// ── LO QUE NO SE HACE
//    · nada de Black-Scholes: ni para el precio ni para elegir el strike.
//    · el descargador de cadenas TIRA todo contrato con bid ≤ 0. Por eso, si el contrato NO
//      aparece el día de la salida, vale CERO — no se salta la operación. Saltarla sería
//      quedarse sólo con las que sobrevivieron.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/convex-3-tabla.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { radiografia } from "../../lib/radiografia.ts";

const RAIZ = path.join("scripts", "cache-theta");
const MS = path.join(RAIZ, "marketsnack", "flujo-100k");
const CAD = path.join(RAIZ, "cadenas");
const CIE = path.join(RAIZ, "cierres");
const SAL = path.join("scripts", "marketsnack", "convex-3-tabla.json");

const HS = [5, 10, 20, 40];
const SIGMAS = 1.5;
const ASK_MIN = 0.10;          // mismo filtro de liquidez que contratos-10x.mjs
const SPREAD_MAX = 0.40;       // % del ask
const DTE_MIN = 330, DTE_MAX = 450;

const COMPRA = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const VENTA = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);
const parseOcc = (s) => {
  const k = s.slice(-8), t = s.slice(-9, -8), d = s.slice(-15, -9), u = s.slice(0, -15);
  return (/^\d{8}$/.test(k) && /^[CP]$/.test(t) && /^\d{6}$/.test(d) && u)
    ? { u, call: t === "C", exp: "20" + d } : null;
};
const aDate = (d) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)));
const dd = (a, b) => Math.round((aDate(b) - aDate(a)) / 86400e3);

// ── universo y calendario ─────────────────────────────────────────────────────────────────
const porTicker = new Map();
for (const f of fs.readdirSync(CAD)) {
  const m = f.match(/^([A-Z]+)_d(2026\d{4})\.json$/); if (!m) continue;
  if (!porTicker.has(m[1])) porTicker.set(m[1], []);
  porTicker.get(m[1]).push(m[2]);
}
for (const v of porTicker.values()) v.sort();
const TICKERS = [...porTicker.keys()].sort();
const CAL = porTicker.get("SPY");
const idx = new Map(CAL.map((d, i) => [d, i]));

const diasMS = fs.readdirSync(MS).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
const SOLAPE = diasMS.map((d) => d.replace(/-/g, "")).filter((d) => idx.has(d));
console.log(`\n## ${TICKERS.length} tickers · ${SOLAPE.length} días de entrada (${SOLAPE[0]} → ${SOLAPE.at(-1)})`);

// ── 1. PANEL DE SEÑALES DE MS (sólo cuenta operaciones — nada del futuro) ─────────────────
console.log(`\n## leyendo el flujo…`);
const setT = new Set(TICKERS);
const panel = new Map();
for (const dia of diasMS) {
  const comp = dia.replace(/-/g, "");
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(MS, `${dia}.jsonl.gz`))).toString("utf8").trim();
  if (!txt) continue;
  for (const l of txt.split("\n")) {
    if (!l) continue;
    const r = JSON.parse(l);
    const o = parseOcc(r.symbol); if (!o || !setT.has(o.u) || !o.call) continue;
    const c = COMPRA.has(r.side), v = VENTA.has(r.side); if (!c && !v) continue;
    const k = `${comp}|${o.u}`;
    let a = panel.get(k);
    if (!a) { a = { ask: 0, bid: 0, n: 0, lAsk: 0, lBid: 0, nL: 0 }; panel.set(k, a); }
    const p = r.premium || 0;
    a.n++; if (c) a.ask += p; else a.bid += p;
    if (dd(comp, o.exp) >= 180) { a.nL++; if (c) a.lAsk += p; else a.lBid += p; }
  }
}
console.log(`   celdas (día,ticker) con calls: ${panel.size}`);

// S3 = inusualidad: prima de COMPRA de calls de hoy contra la mediana de los 20 días previos del
// MISMO ticker (mediana y MAD: robustas, no las arrastra un solo día enorme).
const diasFlujo = diasMS.map((d) => d.replace(/-/g, ""));
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const inusual = new Map();
for (const t of TICKERS) {
  for (let i = 20; i < diasFlujo.length; i++) {
    const hoy = panel.get(`${diasFlujo[i]}|${t}`); if (!hoy) continue;
    const prev = [];
    for (let j = i - 20; j < i; j++) { const a = panel.get(`${diasFlujo[j]}|${t}`); if (a) prev.push(a.ask); }
    if (prev.length < 10) continue;
    const m = mediana(prev);
    const mad = mediana(prev.map((x) => Math.abs(x - m))) || 1;
    inusual.set(`${diasFlujo[i]}|${t}`, (hoy.ask - m) / (1.4826 * mad));
  }
}
console.log(`   celdas con z de inusualidad: ${inusual.size}`);

// ── 2. VOLATILIDAD REALIZADA (sólo pasado) ───────────────────────────────────────────────
const cierres = {};
for (const t of TICKERS) cierres[t] = JSON.parse(fs.readFileSync(path.join(CIE, `${t}.json`), "utf8"));
function rv60(t, dia) {
  const c = cierres[t], ds = Object.keys(c).sort().filter((d) => d < dia);
  if (ds.length < 61) return null;
  const u = ds.slice(-61), r = [];
  for (let i = 1; i < u.length; i++) { const a = c[u[i - 1]], b = c[u[i]]; if (!(a > 0) || !(b > 0)) return null; r.push(Math.log(b / a)); }
  const m = r.reduce((s, x) => s + x, 0) / r.length;
  return Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1) * 252);
}

// ── 3. CADENAS ────────────────────────────────────────────────────────────────────────────
const cache = new Map();
const leerCad = (t, d) => {
  const k = `${t}|${d}`;
  if (cache.has(k)) return cache.get(k);
  let j = null;
  try { j = JSON.parse(fs.readFileSync(path.join(CAD, `${t}_d${d}.json`), "utf8")); } catch {}
  cache.set(k, j); return j;
};

// ── 4. LA TABLA ───────────────────────────────────────────────────────────────────────────
const filas = [];
let sinCad = 0, sinExp = 0, sinComprable = 0, sinSenal = 0, degradado = 0;
let salidaFaltaFichero = 0, salidaCero = 0, salidaOk = 0;

for (const dia of SOLAPE) {
  for (const t of TICKERS) {
    const S = cierres[t][dia], sig = rv60(t, dia);
    if (!(S > 0) || !sig) { sinCad++; continue; }
    const j = leerCad(t, dia); if (!j) { sinCad++; continue; }
    let exp = null;
    for (const e of Object.keys(j)) {
      const n = dd(dia, e); if (n < DTE_MIN || n > DTE_MAX) continue;
      if (!exp || Math.abs(n - 365) < Math.abs(dd(dia, exp) - 365)) exp = e;
    }
    if (!exp) { sinExp++; continue; }
    const dte = dd(dia, exp);

    // señales (idénticas para call y put: describen el ticker ese día)
    const p = panel.get(`${dia}|${t}`);
    if (!p || p.n < 5) { sinSenal++; continue; }
    const s1 = (p.ask - p.bid) / (p.ask + p.bid || 1);
    const s2 = p.nL >= 3 ? (p.lAsk - p.lBid) / (p.lAsk + p.lBid || 1) : null;
    const s3 = inusual.get(`${dia}|${t}`) ?? null;
    const i0 = idx.get(dia);

    for (const tipo of ["C", "P"]) {
      const objetivo = tipo === "C"
        ? S * Math.exp(SIGMAS * sig * Math.sqrt(dte / 365))
        : S * Math.exp(-SIGMAS * sig * Math.sqrt(dte / 365));

      // contratos COMPRABLES de ese vencimiento (ask ≥ $0,10 y horquilla ≤ 40%)
      const comprables = [];
      for (const key of Object.keys(j[exp])) {
        if (!key.endsWith(`|${tipo}`)) continue;
        const K = Number(key.slice(0, -2)); const [b, a] = j[exp][key];
        if (!(a >= ASK_MIN) || !(b > 0) || (a - b) / a > SPREAD_MAX) continue;
        comprables.push({ K, b, a });
      }
      if (!comprables.length) { sinComprable++; continue; }
      comprables.sort((x, y) => x.K - y.K);
      // el que llega justo a 1,5σ; si ninguno llega, EL MÁS LEJANO COMPRABLE (y se anota)
      let el, deg = 0;
      if (tipo === "C") { el = comprables.find((c) => c.K >= objetivo); if (!el) { el = comprables.at(-1); deg = 1; } }
      else { el = [...comprables].reverse().find((c) => c.K <= objetivo); if (!el) { el = comprables[0]; deg = 1; } }
      if (deg) degradado++;
      if (tipo === "C" ? !(el.K > S) : !(el.K < S)) { sinComprable++; continue; }   // FUERA del dinero
      const sigmasReales = Math.abs(Math.log(el.K / S)) / (sig * Math.sqrt(dte / 365));

      // salidas con precios reales
      const rets = {};
      for (const H of HS) {
        const i1 = i0 + H;
        if (i1 >= CAL.length) { rets[H] = null; continue; }
        const jd = leerCad(t, CAL[i1]);
        if (!jd) { rets[H] = null; salidaFaltaFichero++; continue; }
        const q = jd[exp]?.[`${el.K}|${tipo}`];
        if (!q || !(q[0] > 0)) { rets[H] = -1; salidaCero++; continue; }   // sin puja = vale CERO
        rets[H] = q[0] / el.a - 1;                                        // vendo al BID, compré al ASK
        salidaOk++;
      }

      filas.push({
        dia, ticker: t, tipo, exp, dte, S, K: el.K, ask: el.a, bid: el.b,
        horquilla: (el.a - el.b) / el.a, rv60: sig, moneyness: el.K / S, sigmasReales, degradado: deg,
        nCall: p.n, nLargo: p.nL, s1, s2, s3,
        r5: rets[5], r10: rets[10], r20: rets[20], r40: rets[40],
      });
    }
  }
}

console.log(`\n## TABLA`);
console.log(`   filas: ${filas.length}`);
console.log(`   descartes: sin cadena/cierre ${sinCad} · sin venc ~1año ${sinExp} · sin call comprable ${sinComprable} · sin ≥5 calls de flujo ${sinSenal}`);
console.log(`   contratos DEGRADADOS (no llegaba a 1,5σ, se compró el más lejano comprable): ${degradado} (${(100 * degradado / filas.length).toFixed(1)}%)`);
console.log(`   salidas: con puja ${salidaOk} · SIN puja → vale 0 ${salidaCero} · sin fichero de cadena ${salidaFaltaFichero}`);

const pc = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
for (const tipo of ["C", "P"]) {
  const sub = filas.filter((f) => f.tipo === tipo);
  const con20 = sub.filter((f) => f.r20 != null);
  console.log(`\n── ${tipo === "C" ? "CALLS" : "PUTS"} · ${sub.length} filas · con salida a H=20: ${con20.length} en ${new Set(con20.map(f => f.dia)).size} días`);
  console.log(`   moneyness K/S : p10 ${pc(sub.map(f => f.moneyness), .1).toFixed(2)} · p50 ${pc(sub.map(f => f.moneyness), .5).toFixed(2)} · p90 ${pc(sub.map(f => f.moneyness), .9).toFixed(2)}`);
  console.log(`   σ reales      : p10 ${pc(sub.map(f => f.sigmasReales), .1).toFixed(2)} · p50 ${pc(sub.map(f => f.sigmasReales), .5).toFixed(2)} · p90 ${pc(sub.map(f => f.sigmasReales), .9).toFixed(2)}`);
  console.log(`   horquilla     : p10 ${(100 * pc(sub.map(f => f.horquilla), .1)).toFixed(0)}% · p50 ${(100 * pc(sub.map(f => f.horquilla), .5)).toFixed(0)}% · p90 ${(100 * pc(sub.map(f => f.horquilla), .9)).toFixed(0)}%`);
  console.log(`   prima al ASK $: p10 ${(100 * pc(sub.map(f => f.ask), .1)).toFixed(0)} · p50 ${(100 * pc(sub.map(f => f.ask), .5)).toFixed(0)} · p90 ${(100 * pc(sub.map(f => f.ask), .9)).toFixed(0)}`);
  console.log(`   r20           : p10 ${pc(con20.map(f => f.r20), .1).toFixed(2)} · p50 ${pc(con20.map(f => f.r20), .5).toFixed(2)} · p90 ${pc(con20.map(f => f.r20), .9).toFixed(2)} · max ${Math.max(...con20.map(f => f.r20)).toFixed(2)}`);
  const porT = new Map();
  for (const f of con20) porT.set(f.ticker, (porT.get(f.ticker) ?? 0) + 1);
  console.log(`   por ticker: ${[...porT.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join(" ")}`);
  radiografia(con20, ["s1", "sigmasReales", "moneyness", "ask", "r20", "nCall"], `candidatos ${tipo}`);
  radiografia(con20.filter((f) => f.s2 != null), ["s2"], `señal de flujo largo ${tipo}`);
  radiografia(con20.filter((f) => f.s3 != null), ["s3"], `señal de inusualidad ${tipo}`);
}

fs.writeFileSync(SAL, JSON.stringify(filas), "utf8");
console.log(`\n## guardado ${filas.length} filas en ${SAL}`);
