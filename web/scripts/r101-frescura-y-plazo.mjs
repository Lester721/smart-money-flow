// ══ AFINAR CON CABEZA — PASO 5: EL FILTRO DE ENTRADA Y EL PLAZO ══ Lester, 2026-08-28.
//
// ⚠️ LA MITAD B NO SE TOCA. NO es el examen.
//
// DOS PREGUNTAS, las dos con mecanismo dicho ANTES de medir:
//
// 1. ¿CUÁNTOS DÍAS LLEVA LA ACCIÓN BAJO SU MEDIA?
//    Ahora tratamos igual una acción que ACABA de caer y una que lleva tres meses cayendo. La
//    primera es una caída; la segunda es una tendencia bajista, y comprar calls ahí es agarrar
//    un cuchillo. Y no es teoría: es lo que se vio en los que fallaron fuera de muestra —
//    UNH se desplomó en 2025 y siguió (−5,37%), COST cayó y siguió (−40,69%), y ORCL, que sí
//    rebotaba, fue el único positivo. PREDICCIÓN: las entradas FRESCAS deben acertar más.
//
// 2. ¿CUÁNTO AGUANTAR? El tope de 60 días se heredó de la regla vieja y NUNCA se midió más
//    allá. La tendencia era monótona: 10 días pierde, 20 da +4%, 30 da +6%, 60 da +9,26%.
//    Es la palanca más barata que queda sin tocar.
//
// Base: calls · 15% dentro del dinero · contrato de $5.000 o más · sin tope de ganancia ·
//       suelo 0,50x · entrada al ASK, salida al BID · camino día a día y en orden.
import { abrir } from "./datos.mjs";
const A = ["AMAT","ASML","AVGO","BA","COIN","COST","DELL","JPM","META","MRVL","NVDA","PFE","PYPL","QQQ","STX","UNH"];
const PROF_OBJ = 0.15, DTE_OBJ = 120, COSTE_MIN = 5000, SUELO = 0.50;
const PLAZOS = [30, 60, 90, 120, 180];
const TOPE_MAX = Math.max(...PLAZOS);
const CAJONES = [[1, 3, "1-3 días (fresca)"], [4, 10, "4-10 días"], [11, 25, "11-25 días"],
                 [26, 60, "26-60 días"], [61, 9999, "más de 60 días"]];
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
/** la call más cercana al 15% dentro y al plazo objetivo, de al menos $5.000 */
function elegir(tk, d) {
  const ch = leer(tk, d); if (!ch) return null;
  const s = spotDe(tk, d); if (s == null) return null;
  let mejor = null, mejorD = Infinity;
  for (const exp of Object.keys(ch)) {
    const dte = dteDe(d, exp); if (dte < 30 || dte > 400) continue;   // hace falta plazo para aguantar 180 días
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
function caminoDe(tk, d, c, dias) {
  const out = [];
  for (const x of dias.filter((y) => y > d && y <= c.exp)) {
    const ch = leer(tk, x); if (!ch) continue;
    const q = ch[c.exp] && ch[c.exp][c.K + "|C"]; if (!q || !(q[0] > 0)) continue;
    out.push([x, q[0] / c.ask]);
    if (out.length >= TOPE_MAX) break; }
  return out; }
function salir(cam, plazo) { let ult = null;
  for (let i = 0; i < cam.length && i < plazo; i++) { const [d, m] = cam[i]; ult = { mult: m, dSal: d };
    if (m <= SUELO) return { mult: SUELO, dSal: d }; }
  return ult; }

const DATOS = [];
process.stdout.write("\n  midiendo la mitad A: ");
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
  // racha: cuántos días SEGUIDOS lleva bajo la media, contando hoy
  let racha = 0;
  for (const d of DS) {
    const ma = MA.get(d);
    if (ma == null) { racha = 0; continue; }
    racha = ma < 0 ? racha + 1 : 0;
    if (racha === 0) continue;
    const c = elegir(tk, d); if (!c) continue;
    const cam = caminoDe(tk, d, c, todos); if (cam.length < 20) continue;
    DATOS.push({ tk, dC: d, y: d.slice(0, 4), racha, ma, coste: c.ask * 100,
                 horq: (c.ask - c.bid) / c.ask, dte: c.dte, cam }); } }
console.log("\n");
const media = (X) => X.reduce((s, x) => s + x, 0) / X.length;
function stats(L, plazo) { if (!L || L.length < 3) return null;
  const m = L.map((x) => { const r = salir(x.cam, plazo); return r ? r.mult : null; }).filter((x) => x != null);
  if (m.length < 3) return null;
  const r = media(m) - 1;
  const sd = Math.sqrt(m.reduce((s, x) => s + (x - 1 - r) ** 2, 0) / (m.length - 1));
  return { n: m.length, ret: 100 * r, gana: 100 * m.filter((x) => x > 1).length / m.length,
           t: r / (sd / Math.sqrt(m.length)), dobla: 100 * m.filter((x) => x >= 2).length / m.length }; }
function sinSolape(L, plazo) { const g = new Map();
  for (const x of L) { if (!g.has(x.tk)) g.set(x.tk, []); g.get(x.tk).push(x); }
  const out = [];
  for (const G of g.values()) { let libre = "00000000";
    for (const x of G.sort((a, b) => a.dC.localeCompare(b.dC))) {
      if (x.dC <= libre) continue; out.push(x);
      const r = salir(x.cam, plazo); libre = r ? r.dSal : x.dC; } }
  return out; }

console.log("  entradas: " + DATOS.length.toLocaleString("en-US") + "   ·   coste medio " +
  "$" + Math.round(media(DATOS.map((x) => x.coste))).toLocaleString("en-US") +
  "   ·   horquilla " + (100 * media(DATOS.map((x) => x.horq))).toFixed(1) + "%" +
  "   ·   plazo medio del contrato " + Math.round(media(DATOS.map((x) => x.dte))) + " días");
console.log("");
console.log("  ══ 1. ¿IMPORTA LO FRESCA QUE SEA LA CAÍDA? ══   (aguantando 90 días, sin solapar)");
console.log("");
console.log("  " + "días bajo la media".padEnd(22) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
for (const [lo, hi, nom] of CAJONES) {
  const L = sinSolape(DATOS.filter((x) => x.racha >= lo && x.racha <= hi), 90);
  const s = stats(L, 90);
  console.log("  " + nom.padEnd(22) + String(L.length).padStart(6) +
    (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
    (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)) + (s ? (s.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9))); }
const TODO90 = sinSolape(DATOS, 90);
const sT = stats(TODO90, 90);
console.log("  " + "TODAS (sin filtro)".padEnd(22) + String(TODO90.length).padStart(6) +
  (sT.ret.toFixed(2) + "%").padStart(11) + (sT.gana.toFixed(0) + "%").padStart(9) + sT.t.toFixed(2).padStart(8) + (sT.dobla.toFixed(1) + "%").padStart(9));

console.log("");
console.log("  ══ 2. ¿CUÁNTO AGUANTAR? ══   (todas las entradas, sin solapar)");
console.log("");
console.log("  " + "plazo".padEnd(12) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
for (const p of PLAZOS) {
  const L = sinSolape(DATOS, p); const s = stats(L, p);
  console.log("  " + (p + " días").padEnd(12) + String(L.length).padStart(6) +
    (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
    (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)) + (s ? (s.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9))); }

console.log("");
console.log("  ══ 3. LAS DOS COSAS A LA VEZ ══   (% por operación / acierta)");
console.log("");
console.log("  " + "días bajo la media".padEnd(22) + PLAZOS.map((p) => (p + "d").padStart(15)).join(""));
for (const [lo, hi, nom] of CAJONES) {
  const fila = PLAZOS.map((p) => {
    const L = sinSolape(DATOS.filter((x) => x.racha >= lo && x.racha <= hi), p);
    const s = stats(L, p);
    return (s ? s.ret.toFixed(1) + "% / " + s.gana.toFixed(0) + "%" : "—").padStart(15); });
  console.log("  " + nom.padEnd(22) + fila.join("")); }

console.log("");
console.log("  ══ 4. LA MEJOR CASILLA, POR AÑO ══");
console.log("");
let mejor = null;
for (const [lo, hi, nom] of CAJONES) for (const p of PLAZOS) {
  const L = sinSolape(DATOS.filter((x) => x.racha >= lo && x.racha <= hi), p);
  const s = stats(L, p);
  if (s && s.n >= 40 && (!mejor || s.ret > mejor.s.ret)) mejor = { nom, lo, hi, p, s, L }; }
if (mejor) {
  console.log("  " + mejor.nom + " · aguantando " + mejor.p + " días  →  " + mejor.s.ret.toFixed(2) +
    "% por operación · acierta " + mejor.s.gana.toFixed(0) + "% · t=" + mejor.s.t.toFixed(2) + " · n=" + mejor.s.n);
  console.log("");
  console.log("  " + "año".padEnd(8) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8));
  for (const y of ["2021","2022","2023","2024","2025","2026"]) {
    const s = stats(mejor.L.filter((x) => x.y === y), mejor.p);
    console.log("  " + y.padEnd(8) + String(mejor.L.filter((x) => x.y === y).length).padStart(6) +
      (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
      (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8))); }
}
console.log("");
console.log("  ⚠️ MITAD A. El examen NO se ha hecho.");
console.log("");
