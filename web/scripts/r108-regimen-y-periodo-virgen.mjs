// ══ EL FILTRO DE RÉGIMEN, Y EL PERÍODO VIRGEN 2016-2020 ══ Lester, 2026-08-28.
//
// ⚠️ LO QUE NO SE PUDO HACER, dicho primero: QQQ desde 1999 NO existe para nosotros. La
// suscripción devuelve HTTP 403 para todo lo anterior a 2016. La propuesta de bajarlo era mala.
//
// LO QUE SÍ HAY, y ya está en disco: cadenas e interés abierto desde el 2016-01-04 para los 28
// tickers. 10,6 años en vez de 5,6, y CUATRO períodos de estrés en vez de uno:
//   · corrección de 2018 Q4      · crash del COVID (2020)
//   · mercado bajista de 2022    · susto de abril de 2025
//
// Y algo que vale más: TODO lo que se afinó se afinó sobre 2021-2026. **2016-2020 es virgen.**
//
// ⚠️ El flujo empieza en 2021, así que el GOLPE no se puede evaluar antes. Esto mide la
//    operación DESNUDA: calls · 15% dentro · contrato ~120 días y >=$5.000 · la acción bajo su
//    media de 20 · aguantar 90 días · suelo 0,50x · sin tope.
//
// EL FILTRO DE RÉGIMEN, dicho antes de medir: comprar calls largas en un mercado bajista pierde
// por aritmética, no por mala señal. El filtro canónico es SPY por encima de su media de 200
// días. PREDICCIÓN: las entradas con SPY bajo su media de 200 deben ser mucho peores.
// (Ojo: el filtro de régimen ya se probó y se descartó para VENDER prima — [[regla-de-regimen-probada-y-descartada]].
//  Comprar calls es la operación contraria, así que la pregunta vuelve a estar abierta.)
import { abrir } from "./datos.mjs";
const TK = ["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY",
  "BA","JPM","INTC","F","BAC","DIS","XOM","GE","PYPL","COST","CRM","ORCL","WMT","T","PFE","KO","CSCO","NKE","UNH","WBA"];
const MITAD_A = new Set(["AMAT","ASML","AVGO","BA","COIN","COST","DELL","JPM","META","MRVL","NVDA","PFE","PYPL","QQQ","STX","UNH"]);
const PROF_OBJ = 0.15, DTE_OBJ = 120, COSTE_MIN = 5000, SUELO = 0.50, PLAZO = 90;
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const cad = abrir("cadenas", { callado: true });
const ms = (d) => Date.parse(d.slice(0,4) + "-" + d.slice(4,6) + "-" + d.slice(6,8) + "T00:00:00Z");
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
let CH = new Map(), SP = new Map();
const leer = (tk, d) => { if (CH.has(d)) return CH.get(d); const c = cad.leer(tk, d); CH.set(d, c); return c; };
function spotOk(c, hoy) { if (!c) return null; let e0 = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; e0 = e; } }
  if (!e0) return null; const g = c[e0]; let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) { if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[k + "|P"]; if (!p) continue;
    const d = Math.abs((g[cl][0] + g[cl][1]) / 2 - (p[0] + p[1]) / 2); if (d < dm) { dm = d; K = k; } }
  if (K == null) return null; const C = g[K + "|C"], P = g[K + "|P"];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2; return s > 0 ? s : null; }
const spotDe = (tk, d) => { if (SP.has(d)) return SP.get(d); const s = spotOk(leer(tk, d), d); SP.set(d, s); return s; };
// ── el régimen: SPY contra su media de 200 días ──
console.log("\n  leyendo SPY para el régimen…");
const dSPY = cad.dias("SPY");
const pSPY = new Map();
for (const d of dSPY) { const s = spotDe("SPY", d); if (s > 0) pSPY.set(d, s); }
const DSPY = dSPY.filter((d) => pSPY.has(d));
const REG = new Map();                 // dia -> { alcista, ma200 }
for (let i = 200; i < DSPY.length; i++) {
  const v = DSPY.slice(i - 200, i).map((d) => pSPY.get(d));
  const ma = v.reduce((a, b) => a + b, 0) / v.length;
  REG.set(DSPY[i], { alcista: pSPY.get(DSPY[i]) > ma, ma }); }
const cuantos = [...REG.values()].filter((x) => x.alcista).length;
console.log("  días con régimen calculable: " + REG.size + "  ·  SPY sobre su media de 200: " +
  (100 * cuantos / REG.size).toFixed(0) + "% del tiempo");
function elegir(tk, d) {
  const ch = leer(tk, d); if (!ch) return null;
  const s = spotDe(tk, d); if (s == null) return null;
  let mejor = null, mejorD = Infinity;
  for (const exp of Object.keys(ch)) {
    const dte = dteDe(d, exp); if (dte < 30 || dte > 400) continue;
    for (const cl of Object.keys(ch[exp])) {
      if (!cl.endsWith("|C")) continue;
      const K = Number(cl.slice(0, cl.indexOf("|")));
      if (K >= s) continue;
      const q = ch[exp][cl]; if (!q || !(q[1] > 0) || !(q[0] > 0)) continue;
      if (q[1] * 100 < COSTE_MIN) continue;
      const prof = (s - K) / s;
      const dist = Math.abs(prof - PROF_OBJ) / PROF_OBJ + Math.abs(dte - DTE_OBJ) / DTE_OBJ;
      if (dist < mejorD) { mejorD = dist; mejor = { exp, K, ask: q[1], bid: q[0], prof, dte, spot: s }; } } }
  return mejor; }
const OPS = [];
process.stdout.write("\n  midiendo 2016-2026: ");
for (const tk of TK) {
  CH = new Map(); SP = new Map();
  process.stdout.write(tk + " ");
  const todos = cad.dias(tk);
  for (let i = 20; i < todos.length; i++) {
    const d = todos[i];
    if (d < "20160101" || d > "20260819") continue;
    const r = REG.get(d); if (!r) continue;
    const p = todos.slice(i - 20, i).map((x) => spotDe(tk, x)).filter((x) => x != null);
    const s = spotDe(tk, d);
    if (p.length < 15 || s == null) continue;
    const ma = s / (p.reduce((a, b) => a + b, 0) / p.length) - 1;
    if (ma >= 0) continue;
    const L = elegir(tk, d); if (!L) continue;
    const cam = [];
    for (const x of todos.filter((y) => y > d && y <= L.exp)) {
      const ch = leer(tk, x); if (!ch) continue;
      const q = ch[L.exp] && ch[L.exp][L.K + "|C"]; if (!q || !(q[0] > 0)) continue;
      cam.push([x, q[0] / L.ask]); if (cam.length >= PLAZO) break; }
    if (cam.length < 15) continue;
    let res = null;
    for (const [x, m] of cam) { res = { mult: m, dSal: x }; if (m <= SUELO) break; }
    OPS.push({ tk, dC: d, y: d.slice(0, 4), ma, alcista: r.alcista, mitad: MITAD_A.has(tk) ? "A" : "B",
               virgen: d < "20210101", coste: L.ask * 100, mult: res.mult, dSal: res.dSal }); } }
console.log("\n");
const media = (X) => X.reduce((s, x) => s + x, 0) / X.length;
function stats(L) { if (!L || L.length < 3) return null;
  const m = L.map((x) => x.mult); const r = media(m) - 1;
  const sd = Math.sqrt(m.reduce((s, x) => s + (x - 1 - r) ** 2, 0) / (m.length - 1));
  return { n: m.length, ret: 100 * r, gana: 100 * m.filter((x) => x > 1).length / m.length,
           t: r / (sd / Math.sqrt(m.length)), dobla: 100 * m.filter((x) => x >= 2).length / m.length }; }
function sinSolape(L) { const g = new Map();
  for (const x of L) { if (!g.has(x.tk)) g.set(x.tk, []); g.get(x.tk).push(x); }
  const out = [];
  for (const G of g.values()) { let libre = "00000000";
    for (const x of G.sort((a, b) => a.dC.localeCompare(b.dC))) { if (x.dC <= libre) continue; out.push(x); libre = x.dSal; } }
  return out; }
const NS = sinSolape(OPS);
const fila = (nom, L) => { const s = stats(L);
  console.log("  " + nom.padEnd(38) + String(L.length).padStart(6) +
    (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
    (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)) + (s ? (s.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9))); };
console.log("  entradas 2016-2026: " + OPS.length.toLocaleString("en-US") + "  ·  sin solapar: " + NS.length);
console.log("");
console.log("  ══ 1. EL FILTRO DE RÉGIMEN — SPY contra su media de 200 días ══");
console.log("");
console.log("  " + "".padEnd(38) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
fila("TODO (sin filtro de régimen)", NS);
fila("SPY sobre su media de 200 (alcista)", NS.filter((x) => x.alcista));
fila("SPY bajo su media de 200 (bajista)", NS.filter((x) => !x.alcista));
console.log("");
console.log("  ══ 2. EL PERÍODO VIRGEN — 2016-2020, que nadie ha mirado ══");
console.log("");
console.log("  " + "".padEnd(38) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
fila("🎯 2016-2020 VIRGEN, sin filtro", NS.filter((x) => x.virgen));
fila("🎯 2016-2020 VIRGEN, sólo alcista", NS.filter((x) => x.virgen && x.alcista));
fila("2021-2026 (donde se afinó), sin filtro", NS.filter((x) => !x.virgen));
fila("2021-2026, sólo alcista", NS.filter((x) => !x.virgen && x.alcista));
console.log("");
console.log("  ══ 3. LAS DOS MITADES, EN EL PERÍODO VIRGEN ══");
console.log("");
console.log("  " + "".padEnd(38) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
fila("mitad A, 2016-2020, alcista", NS.filter((x) => x.virgen && x.alcista && x.mitad === "A"));
fila("mitad B, 2016-2020, alcista", NS.filter((x) => x.virgen && x.alcista && x.mitad === "B"));
console.log("");
console.log("  ══ 4. AÑO POR AÑO — con el filtro de régimen puesto ══");
console.log("");
console.log("  " + "año".padEnd(8) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) +
  "  │ " + "sin filtro".padStart(20));
for (const y of ["2016","2017","2018","2019","2020","2021","2022","2023","2024","2025","2026"]) {
  const con = NS.filter((x) => x.y === y && x.alcista), todo = NS.filter((x) => x.y === y);
  const s = stats(con), st = stats(todo);
  console.log("  " + y.padEnd(8) + String(con.length).padStart(6) +
    (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
    (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)) +
    "  │ " + (st ? (todo.length + " ops  " + st.ret.toFixed(1) + "%  " + st.gana.toFixed(0) + "%").padStart(20) : "—".padStart(20))); }
console.log("");
console.log("  ⚠️ El GOLPE no está en esta prueba: el flujo empieza en 2021. Esto es la operación desnuda.");
console.log("");
