// ══ AFINAR CON CABEZA — PASO 4: BAJAR EL MÍNIMO DEL CONTRATO ══ Lester, 2026-08-28: «dale».
//
// ⚠️ LA MITAD B NO SE TOCA. NO es el examen.
//
// EL DIAGNÓSTICO QUE LLEVA AQUÍ. Con contratos de $11.000 y una cuenta de $60.000 no se puede
// diversificar: 4 huecos al 25% es estar 100% invertido en algo que pierde el 52% de las veces
// (caída −67%), y en cuanto la cuenta baja de ~$40.000 ya no alcanza para UN contrato — 2023
// tuvo CERO operaciones por eso, no por falta de señales.
//
// El mínimo de $10.000 venía de la versión profunda, donde los contratos son caros por
// naturaleza. Con opciones poco profundas ya no tiene sentido.
//
// DOS CAMBIOS, los dos con razón mecánica (no son parámetros buscados hasta que salgan):
//   1. BAJAR EL MÍNIMO. Permite posiciones pequeñas de verdad.
//   2. MÁS HUECOS. Si el 10% mejor aporta toda la ganancia, con 4 apuestas casi nunca coges la
//      cola. Una estrategia de cola positiva NECESITA muchas apuestas. Con contratos baratos
//      caben.
//
// LO QUE HAY QUE VIGILAR: contratos más baratos = acciones más baratas = horquilla más ancha
// en % de la prima. Se mide y se enseña, porque eso es lo que mató a todo lo anterior.
import { abrir } from "./datos.mjs";
const A = ["AMAT","ASML","AVGO","BA","COIN","COST","DELL","JPM","META","MRVL","NVDA","PFE","PYPL","QQQ","STX","UNH"];
const PROF_OBJ = 0.15, DTE_OBJ = 51, TOPE = 60, SUELO = 0.50;
const MINIMOS = [1000, 2000, 3000, 5000, 10000];
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
/** la call más cercana al 15% dentro y a 51 días que cueste AL MENOS `minimo` */
function elegir(tk, d, minimo) {
  const ch = leer(tk, d); if (!ch) return null;
  const s = spotDe(tk, d); if (s == null) return null;
  let mejor = null, mejorD = Infinity;
  for (const exp of Object.keys(ch)) {
    const dte = dteDe(d, exp); if (dte < 5 || dte > 400) continue;
    for (const cl of Object.keys(ch[exp])) {
      if (!cl.endsWith("|C")) continue;
      const K = Number(cl.slice(0, cl.indexOf("|")));
      if (K >= s) continue;
      const q = ch[exp][cl]; if (!q || !(q[1] > 0) || !(q[0] > 0)) continue;
      if (q[1] * 100 < minimo) continue;
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
    if (out.length >= TOPE) break; }
  return out; }
function resultado(cam) { let ult = null;
  for (const [d, m] of cam) { ult = { mult: m, dSal: d }; if (m <= SUELO) return { mult: SUELO, dSal: d }; }
  return ult; }

const CAND = {}; for (const m of MINIMOS) CAND[m] = [];
process.stdout.write("\n  construyendo: ");
const DIAS_SPY = cad.dias("SPY").filter((d) => d >= "20210101" && d <= "20260819");
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
  for (const d of DS) {
    const ma = MA.get(d); if (ma == null || ma >= 0) continue;
    for (const m of MINIMOS) {
      const c = elegir(tk, d, m); if (!c) continue;
      const cam = caminoDe(tk, d, c, todos); if (cam.length < 3) continue;
      const r = resultado(cam); if (!r) continue;
      CAND[m].push({ tk, dC: d, y: d.slice(0, 4), ask: c.ask, coste: c.ask * 100, ma,
                     horq: (c.ask - c.bid) / c.ask, prof: c.prof, mult: r.mult, dSal: r.dSal }); } } }
console.log("\n");
for (const m of MINIMOS) CAND[m].sort((a, b) => a.dC.localeCompare(b.dC));
const media = (X) => X.reduce((s, x) => s + x, 0) / X.length;
const med = (X) => { const B = [...X].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
function sinSolape(L) { const g = new Map();
  for (const x of L) { if (!g.has(x.tk)) g.set(x.tk, []); g.get(x.tk).push(x); }
  const out = [];
  for (const G of g.values()) { let libre = "00000000";
    for (const x of G.sort((a, b) => a.dC.localeCompare(b.dC))) { if (x.dC <= libre) continue; out.push(x); libre = x.dSal; } }
  return out; }
function stats(L) { if (!L || L.length < 3) return null;
  const m = L.map((x) => x.mult); const r = media(m) - 1;
  const sd = Math.sqrt(m.reduce((s, x) => s + (x - 1 - r) ** 2, 0) / (m.length - 1));
  return { n: m.length, ret: 100 * r, gana: 100 * m.filter((x) => x > 1).length / m.length,
           t: r / (sd / Math.sqrt(m.length)), dobla: 100 * m.filter((x) => x >= 2).length / m.length }; }

console.log("  ══ 1. ¿SOBREVIVE LA VENTAJA CON CONTRATOS BARATOS? ══  (sin solapar)");
console.log("");
console.log("  " + "mínimo".padEnd(12) + "n".padStart(6) + "coste medio".padStart(13) + "horquilla".padStart(11) +
  "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
for (const m of MINIMOS) {
  const L = sinSolape(CAND[m]); const s = stats(L);
  console.log("  " + ("≥ " + D(m)).padEnd(12) + String(L.length).padStart(6) +
    D(media(L.map((x) => x.coste))).padStart(13) + ((100 * media(L.map((x) => x.horq))).toFixed(1) + "%").padStart(11) +
    (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
    (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)) + (s ? (s.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9))); }

const an = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / 5.63) - 1);
function cuenta({ L, capital, tam, huecos, tipo = 0.033, hasta = null }) {
  const intD = Math.pow(1 + tipo, 1 / 252) - 1;
  const dias = hasta ? DIAS_SPY.filter((d) => d <= hasta) : DIAS_SPY;
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  let caja = capital, ab = [], tom = [], pico = capital, peor = 0, sumaInv = 0, nd = 0;
  for (const hoy of dias) {
    caja *= (1 + intD);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    for (const x of (porDia.get(hoy) || []).slice().sort((a, b) => a.ma - b.ma)) {
      if (ab.length >= huecos) break;
      if (ab.some((o) => o.tk === x.tk)) continue;
      const tope = (caja + inv()) * tam;
      const n = Math.floor(Math.min(tope, caja) / (x.ask * 100));
      if (n < 1) continue;
      const dinero = n * x.ask * 100;
      caja -= dinero; ab.push({ ...x, dinero }); tom.push({ ...x, dinero, gana: dinero * (x.mult - 1) }); }
    const v = caja + inv();
    sumaInv += inv() / v; nd++;
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  let fin = caja; for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, caida: 100 * peor, tom, invertido: 100 * sumaInv / nd }; }
function banda(op, base) { const R = [], C = [], paso = base * 0.0083;
  for (let c = base * 0.917; c <= base * 1.084; c += paso) { const q = cuenta({ ...op, capital: c }); R.push(an(q.final, c)); C.push(q.caida); }
  return { a: med(R), c: med(C) }; }

console.log("");
console.log("  ══ 2. TU CUENTA ($60,000) ══  mediana de 21 capitales · 15% dentro · sin tope · 60 días");
console.log("");
console.log("  " + "mínimo".padEnd(11) + "huecos".padStart(7) + "por posic.".padStart(11) +
  "expuesto".padStart(10) + "al año".padStart(9) + "caída".padStart(8) + "ops".padStart(6) + "acierta".padStart(9));
const RES = [];
for (const m of MINIMOS) for (const [huecos, tam] of [[4, 0.25], [4, 0.125], [8, 0.125], [8, 0.0625], [12, 0.0833], [12, 0.0417]]) {
  const b = banda({ L: CAND[m], tam, huecos }, 60000);
  const q = cuenta({ L: CAND[m], capital: 60000, tam, huecos });
  const g = q.tom.filter((x) => x.gana > 0).length;
  RES.push({ m, huecos, tam, a: b.a, c: b.c, ops: q.tom.length, gana: q.tom.length ? 100 * g / q.tom.length : 0, inv: q.invertido });
  console.log("  " + ("≥ " + D(m)).padEnd(11) + String(huecos).padStart(7) + ((100 * tam).toFixed(1) + "%").padStart(11) +
    ((huecos * tam * 100).toFixed(0) + "%").padStart(10) + (b.a.toFixed(1) + "%").padStart(9) +
    ("−" + b.c.toFixed(0) + "%").padStart(8) + String(q.tom.length).padStart(6) +
    (q.tom.length ? (100 * g / q.tom.length).toFixed(0) + "%" : "—").padStart(9)); }
console.log("  " + "comprar SPY y dormir".padEnd(11 + 7 + 11 + 10) + "15.4%".padStart(9) + "−25%".padStart(8));

const mejor = RES.filter((r) => r.ops >= 20).sort((a, b) => b.a - a.a)[0];
if (mejor) {
  console.log("");
  console.log("  ══ 3. AÑO POR AÑO — la mejor: mínimo " + D(mejor.m) + ", " + mejor.huecos + " huecos al " + (100 * mejor.tam).toFixed(1) + "% ══");
  console.log("");
  const q = cuenta({ L: CAND[mejor.m], capital: 60000, tam: mejor.tam, huecos: mejor.huecos });
  console.log("  " + "año".padEnd(7) + "valor".padStart(13) + "% del año".padStart(11) + "ops".padStart(6) + "gana".padStart(7) + "pierde".padStart(8));
  let v0 = 60000;
  for (const y of ["2021","2022","2023","2024","2025","2026"]) {
    const fin = [...DIAS_SPY].reverse().find((d) => d.startsWith(y)); if (!fin) continue;
    const r = cuenta({ L: CAND[mejor.m].filter((x) => x.dC <= fin), capital: 60000, tam: mejor.tam, huecos: mejor.huecos, hasta: fin });
    const del = q.tom.filter((x) => x.dC.startsWith(y));
    console.log("  " + y.padEnd(7) + D(r.final).padStart(13) +
      (((r.final / v0 - 1) >= 0 ? "+" : "−") + Math.abs(100 * (r.final / v0 - 1)).toFixed(0) + "%").padStart(11) +
      String(del.length).padStart(6) + String(del.filter((x) => x.gana > 0).length).padStart(7) +
      String(del.filter((x) => x.gana <= 0).length).padStart(8));
    v0 = r.final; }
  const g = q.tom.filter((x) => x.gana > 0).length;
  console.log("  TOTAL: " + D(q.final) + "  ·  " + an(q.final, 60000).toFixed(1) + "% al año  ·  caída −" + q.caida.toFixed(0) +
    "%  ·  " + q.tom.length + " ops  ·  acierta " + (100 * g / Math.max(1, q.tom.length)).toFixed(0) +
    "%  ·  invertido de media " + q.invertido.toFixed(0) + "%");
}
console.log("");
console.log("  ⚠️ MITAD A, y afinado sobre ella. El examen (mitad B) NO se ha hecho.");
console.log("");
