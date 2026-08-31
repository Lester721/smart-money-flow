// ══ AFINAR CON CABEZA — PASO 1: partir los 47 y DIAGNOSTICAR la mitad A ══
// Lester, 2026-08-28: «parte los 47 y afina, pero quiero ver qué encuentras y afinas ANTES de
// que lo pruebes en la otra mitad».
//
// ⚠️ LA MITAD B NO SE TOCA EN ESTE FICHERO. Ni se lee. Es el examen.
// ⚠️ TSLA queda FUERA de las dos: está en forward-test y distorsiona.
//
// POR QUÉ ESTE DIAGNÓSTICO Y NO UN BARRIDO DE PARÁMETROS. Con 90 señales, barrer diez knobs
// encuentra algo por puro azar. Aquí se mide la SUPERFICIE DE PAGO de la operación desnuda
// —comprar dentro del dinero con la acción bajo su media— sobre miles de entradas, que es donde
// hay muestra de verdad. La regla del golpe se aplica DESPUÉS, encima de lo que salga.
//
// LO QUE SE PREGUNTA, y por qué cada pregunta:
//   1. ¿A qué PROFUNDIDAD conviene comprar? La regla nunca lo acotó y la mediana acabó en 45%
//      dentro del dinero. Un contrato así tiene delta ~0,9: para doblar, la acción tiene que
//      subir un 50%. Por eso CERO de 81 operaciones doblaron.
//   2. ¿Cuánto cuesta la horquilla a cada profundidad? Lo barato de operar y lo que puede doblar
//      están en extremos opuestos. Hay que ver dónde se cruzan.
//   3. ¿Qué pasa si se quita el tope de 1,50x? Se lo pusimos nosotros.
//   4. ¿Cuántos días conviene aguantar?
//
// Camino leído de las cadenas DÍA A DÍA y EN ORDEN. Entrada al ASK, salida al BID.
import { abrir } from "./datos.mjs";
const TODOS = ["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY",
  "BA","JPM","INTC","F","BAC","DIS","XOM","GE","PYPL","COST","CRM","ORCL","WMT","T","PFE","KO","CSCO","NKE","UNH","WBA",
  "GOOGL","AMZN","AVGO","MU","MRVL","TSM","PLTR","ASML","MSTR","DELL","WDC","AMAT","STX","GS","NFLX","COIN","BABA","SHOP","UBER","ARM"];
// sorteo determinista: hash del nombre. Reproducible y sin relación con el alfabeto ni el sector.
function h(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
const A = TODOS.filter((t) => h(t) % 2 === 0).sort();
const Bsecreta = TODOS.filter((t) => h(t) % 2 === 1).sort();
console.log("");
console.log("  ══ EL SORTEO ══   (TSLA fuera de las dos: está en forward-test)");
console.log("");
console.log("  MITAD A — donde se afina (" + A.length + "):");
console.log("    " + A.join(" "));
console.log("  MITAD B — el examen, NO se toca (" + Bsecreta.length + "):");
console.log("    " + Bsecreta.join(" "));
console.log("");

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

const PROF = [0.05, 0.15, 0.25, 0.45, 0.70];   // qué tan dentro del dinero
const DTE_OBJ = 51, COSTE_MIN = 10000, TOPE = 60;
/** en el día d, la call dentro del dinero más cercana al objetivo de profundidad */
function elegir(tk, d, profObj) {
  const ch = leer(tk, d); if (!ch) return null;
  const s = spotDe(tk, d); if (s == null) return null;
  let mejor = null, mejorD = Infinity;
  for (const exp of Object.keys(ch)) {
    const dte = dteDe(d, exp); if (dte < 5 || dte > 400) continue;
    for (const cl of Object.keys(ch[exp])) {
      if (!cl.endsWith("|C")) continue;
      const K = Number(cl.slice(0, cl.indexOf("|")));
      if (K >= s) continue;                                    // dentro del dinero para una call
      const q = ch[exp][cl]; if (!q || !(q[1] > 0) || !(q[0] > 0)) continue;
      if (q[1] * 100 < COSTE_MIN) continue;
      const prof = (s - K) / s;
      const dist = Math.abs(prof - profObj) / profObj + Math.abs(dte - DTE_OBJ) / DTE_OBJ;
      if (dist < mejorD) { mejorD = dist; mejor = { exp, K, ask: q[1], bid: q[0], prof, dte, spot: s }; } } }
  return mejor; }
/** guarda el camino ENTERO de múltiplos, para poder probar varias salidas sin releer nada */
function camino(tk, d, c, dias) {
  const out = [];
  for (const x of dias.filter((y) => y > d && y <= c.exp)) {
    const ch = leer(tk, x); if (!ch) continue;
    const q = ch[c.exp] && ch[c.exp][c.K + "|C"]; if (!q || !(q[0] > 0)) continue;
    out.push([x, q[0] / c.ask]);
    if (out.length >= TOPE) break; }
  return out; }
function salir(cam, objetivo, suelo, tope) {
  let ult = null;
  for (let i = 0; i < cam.length && i < tope; i++) {
    const m = cam[i][1]; ult = m;
    if (objetivo && m >= objetivo) return objetivo;
    if (suelo && m <= suelo) return suelo; }
  return ult; }

const DATOS = [];                                              // { tk, dC, prof, horq, cam }
process.stdout.write("  midiendo la mitad A: ");
for (const tk of A) {
  CH = new Map(); SP = new Map();
  process.stdout.write(tk + " ");
  const todos = cad.dias(tk);
  const DS = todos.filter((d) => d >= "20210101" && d <= "20260819");
  const MA = new Map();
  for (const d of DS) { const i = todos.indexOf(d); if (i < 20) continue;
    const p = todos.slice(i - 20, i).map((x) => spotDe(tk, x)).filter((x) => x != null);
    const s = spotDe(tk, d);
    if (p.length >= 15 && s != null) MA.set(d, s / (p.reduce((a, b) => a + b, 0) / p.length) - 1); }
  const bajo = DS.filter((d) => (MA.get(d) ?? 1) < 0);
  for (const d of bajo) for (const pObj of PROF) {
    const c = elegir(tk, d, pObj); if (!c) continue;
    const cam = camino(tk, d, c, todos); if (cam.length < 3) continue;
    DATOS.push({ tk, dC: d, y: d.slice(0, 4), pedida: pObj, prof: c.prof, dte: c.dte,
                 horq: (c.ask - c.bid) / c.ask, coste: c.ask * 100, cam }); } }
console.log("\n");
const media = (X) => X.reduce((s, x) => s + x, 0) / X.length;
function stats(L, f) { if (!L || L.length < 3) return null;
  const m = L.map(f).filter((x) => x != null); if (m.length < 3) return null;
  const r = media(m) - 1;
  const sd = Math.sqrt(m.reduce((s, x) => s + (x - 1 - r) ** 2, 0) / (m.length - 1));
  return { n: m.length, ret: 100 * r, gana: 100 * m.filter((x) => x > 1).length / m.length,
           t: r / (sd / Math.sqrt(m.length)), dobla: 100 * m.filter((x) => x >= 2).length / m.length }; }
function sinSolape(L) { const g = new Map();
  for (const x of L) { if (!g.has(x.tk)) g.set(x.tk, []); g.get(x.tk).push(x); }
  const out = [];
  for (const G of g.values()) { let libre = "00000000";
    for (const x of G.sort((a, b) => a.dC.localeCompare(b.dC))) {
      if (x.dC <= libre) continue; out.push(x);
      const fin = x.cam[Math.min(x.cam.length - 1, TOPE - 1)]; libre = fin ? fin[0] : x.dC; } }
  return out; }

console.log("  entradas construidas: " + DATOS.length.toLocaleString("en-US") + "  ·  tickers: " + A.length);
console.log("");
console.log("  ══ 1. LA SUPERFICIE DE PAGO POR PROFUNDIDAD ══   (calls, acción bajo su media, sin solapar)");
console.log("");
console.log("  " + "profund.".padEnd(10) + "n".padStart(6) + "coste".padStart(10) + "horquilla".padStart(11) +
  "  │ " + "tope 1,50x".padStart(22) + "  │ " + "SIN TOPE, 60 días".padStart(24));
console.log("  " + "".padEnd(10) + "".padStart(6) + "".padStart(10) + "(% prima)".padStart(11) +
  "  │ " + "% op    acierta      t".padStart(22) + "  │ " + "% op    acierta   doblan".padStart(24));
for (const p of PROF) {
  const L = sinSolape(DATOS.filter((x) => x.pedida === p));
  const conTope = stats(L, (x) => salir(x.cam, 1.50, 0.50, TOPE));
  const sinTope = stats(L, (x) => salir(x.cam, null, null, TOPE));
  const costeM = media(L.map((x) => x.coste)), horqM = media(L.map((x) => x.horq));
  console.log("  " + ((100 * p).toFixed(0) + "% dentro").padEnd(10) + String(L.length).padStart(6) +
    ("$" + Math.round(costeM).toLocaleString("en-US")).padStart(10) + ((100 * horqM).toFixed(1) + "%").padStart(11) +
    "  │ " + (conTope ? (conTope.ret.toFixed(2) + "%").padStart(8) + (conTope.gana.toFixed(0) + "%").padStart(9) + conTope.t.toFixed(2).padStart(7) : "—".padStart(24)) +
    "  │ " + (sinTope ? (sinTope.ret.toFixed(2) + "%").padStart(8) + (sinTope.gana.toFixed(0) + "%").padStart(9) + (sinTope.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(24)));
}
console.log("");
console.log("  ══ 2. ¿Y SI SE QUITA EL TOPE DE 1,50x? ══   (a la profundidad que gane arriba)");
console.log("");
const mejor = PROF.map((p) => ({ p, s: stats(sinSolape(DATOS.filter((x) => x.pedida === p)), (x) => salir(x.cam, null, null, TOPE)) }))
  .filter((x) => x.s).sort((a, b) => b.s.ret - a.s.ret)[0];
const LM = sinSolape(DATOS.filter((x) => x.pedida === mejor.p));
console.log("  profundidad elegida por la tabla de arriba: " + (100 * mejor.p).toFixed(0) + "% dentro del dinero");
console.log("");
console.log("  " + "salida".padEnd(26) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
for (const [nom, obj, sue] of [["tope 1,50x / suelo 0,50x", 1.50, 0.50], ["tope 2x / suelo 0,50x", 2.00, 0.50],
                               ["tope 3x / suelo 0,50x", 3.00, 0.50], ["SIN tope, suelo 0,50x", null, 0.50],
                               ["SIN tope NI suelo", null, null]]) {
  const s = stats(LM, (x) => salir(x.cam, obj, sue, TOPE));
  console.log("  " + nom.padEnd(26) + String(s ? s.n : 0).padStart(6) + (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) +
    (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) + (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)) +
    (s ? (s.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9))); }
console.log("");
console.log("  ══ 3. ¿CUÁNTOS DÍAS AGUANTAR? ══   (sin tope, suelo 0,50x)");
console.log("");
console.log("  " + "días".padEnd(10) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
for (const d of [10, 20, 30, 60]) {
  const s = stats(LM, (x) => salir(x.cam, null, 0.50, d));
  console.log("  " + String(d).padEnd(10) + String(s ? s.n : 0).padStart(6) + (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) +
    (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) + (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)) +
    (s ? (s.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9))); }
console.log("");
console.log("  ══ 4. POR AÑO, la combinación que gane ══");
console.log("");
console.log("  " + "año".padEnd(8) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8));
for (const y of ["2021","2022","2023","2024","2025","2026"]) {
  const s = stats(LM.filter((x) => x.y === y), (x) => salir(x.cam, null, 0.50, TOPE));
  console.log("  " + y.padEnd(8) + String(s ? s.n : 0).padStart(6) + (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) +
    (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) + (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8))); }
console.log("");
console.log("  ⚠️ TODO ESTO ES LA MITAD A. La mitad B no se ha tocado.");
console.log("  ⚠️ Esto es la operación DESNUDA (sin el golpe). El filtro del flujo va encima, después.");
console.log("");
