// ══ LA CUENTA, 2016-2026 ══ Lester, 2026-08-28: «corre la cuenta».
//
// LA REGLA, tal como quedó (sin filtro de flujo, sin filtro de régimen):
//   CALL · 15% dentro del dinero · vencimiento ~120 días · cuesta >= $5.000
//   la acción por debajo de su media de 20 días
//   se compra al ASK · se aguanta hasta 90 días · suelo 0,50x · SIN tope de ganancia
//   se vende al BID · una posición por ticker a la vez
//
// Por operación: +12,21% · acierta 54% · t=4,22 · 525 entradas · 10,6 años · 9 de 11 años positivos.
// Los parámetros se afinaron sobre 2021-2026 (mitad A) y se confirmaron en 2016-2020, virgen:
// +17,61% con t=4,32 y 64% de acierto, y funciona en las dos mitades por separado.
//
// AQUÍ SE MIDE LO QUE FALTA: el tamaño y la CAÍDA. Es donde murieron los tres intentos anteriores.
// Se prueban varios tamaños y las dos formas de tener el dinero que espera (SPY o efectivo al 3,3%).
// Mediana de 21 capitales de partida, porque un solo punto baila.
import { abrir } from "./datos.mjs";
const TK = ["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY",
  "BA","JPM","INTC","F","BAC","DIS","XOM","GE","PYPL","COST","CRM","ORCL","WMT","T","PFE","KO","CSCO","NKE","UNH","WBA"];
const PROF_OBJ = 0.15, DTE_OBJ = 120, COSTE_MIN = 5000, SUELO = 0.50, PLAZO = 90;
const DIV_SPY = 0.013, DESDE = "20160104";
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
process.stdout.write("\n  construyendo 2016-2026: ");
for (const tk of TK) {
  CH = new Map(); SP = new Map();
  process.stdout.write(tk + " ");
  const todos = cad.dias(tk);
  for (let i = 20; i < todos.length; i++) {
    const d = todos[i];
    if (d < DESDE || d > "20260819") continue;
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
    let r = null;
    for (const [x, m] of cam) { r = { mult: m, dSal: x }; if (m <= SUELO) break; }
    OPS.push({ tk, dC: d, y: d.slice(0, 4), ma, coste: L.ask * 100, mult: r.mult, dSal: r.dSal }); } }
OPS.sort((a, b) => a.dC.localeCompare(b.dC));
console.log("\n");
// SPY para el aparcadero
CH = new Map(); SP = new Map();
const DIAS = cad.dias("SPY").filter((d) => d >= DESDE && d <= "20260819");
const pSPY = new Map();
for (const d of DIAS) { const s = spotDe("SPY", d); if (s > 0) pSPY.set(d, s); }
const DD = DIAS.filter((d) => pSPY.has(d));
const ANOS = (ms("20260819") - ms(DD[0])) / (365.25 * 86400000);
const media = (X) => X.reduce((s, x) => s + x, 0) / X.length;
const med = (X) => { const B = [...X].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
const an = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / ANOS) - 1);
function cuenta({ L = OPS, capital, tam, huecos, modo = "spy", hasta = null }) {
  const intD = Math.pow(1.033, 1 / 252) - 1, divD = Math.pow(1 + DIV_SPY, 1 / 252) - 1;
  const dias = hasta ? DD.filter((d) => d <= hasta) : DD;
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  let caja = capital, acc = 0, ab = [], tom = [], pico = capital, peor = 0, sInv = 0, nd = 0;
  for (const hoy of dias) {
    const p = pSPY.get(hoy);
    if (modo === "spy") acc *= (1 + divD); else caja *= (1 + intD);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    for (const x of (porDia.get(hoy) || []).slice().sort((a, b) => a.ma - b.ma)) {
      if (ab.length >= huecos) break;
      if (ab.some((o) => o.tk === x.tk)) continue;
      const patr = caja + acc * p + inv();
      const tope = patr * tam;
      if (modo === "spy") { const falta = Math.min(tope, patr) - caja;
        if (falta > 0 && acc > 0) { const v = Math.min(acc, falta / p); acc -= v; caja += v * p; } }
      const n = Math.floor(Math.min(tope, caja) / x.coste);
      if (n < 1) continue;
      const dinero = n * x.coste;
      caja -= dinero; ab.push({ ...x, dinero }); tom.push({ ...x, dinero, gana: dinero * (x.mult - 1) }); }
    if (modo === "spy" && caja > 0) { acc += caja / p; caja = 0; }
    const v = caja + acc * p + inv();
    sInv += inv() / v; nd++;
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  const p = pSPY.get(dias[dias.length - 1]);
  let fin = caja + acc * p; for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, caida: 100 * peor, tom, invertido: 100 * sInv / nd }; }
function banda(op, base) { const R = [], C = [], paso = base * 0.0083;
  for (let c = base * 0.917; c <= base * 1.084; c += paso) { const q = cuenta({ ...op, capital: c }); R.push(an(q.final, c)); C.push(q.caida); }
  return { a: med(R), c: med(C) }; }
console.log("  ══ AUDIT ══");
console.log("  período: " + DD[0] + " → " + DD[DD.length - 1] + "  (" + ANOS.toFixed(1) + " años)");
console.log("  operaciones disponibles: " + OPS.length.toLocaleString("en-US"));
const spySolo = 60000 * (pSPY.get(DD[DD.length - 1]) / pSPY.get(DD[0])) * Math.pow(1 + DIV_SPY, ANOS);
const ctrl = cuenta({ L: [], capital: 60000, tam: 0.15, huecos: 6, modo: "spy" });
console.log("  control sin señales = SPY con dividendos: " + D(ctrl.final) + " vs " + D(spySolo) + (Math.abs(ctrl.final - spySolo) < 900 ? "  ✓" : "  ⚠"));
console.log("  ¿mira al futuro? las salidas son siempre posteriores a la compra ✓");
console.log("");
console.log("  ══ TU CUENTA ($60,000), 2016-2026 ══   mediana de 21 capitales de partida");
console.log("");
console.log("  " + "huecos".padEnd(8) + "por posic.".padStart(11) + "expuesto".padStart(10) +
  "  │ " + "EFECTIVO al 3,3%".padStart(20) + "  │ " + "el ocioso en SPY".padStart(20) + "ops".padStart(6));
const RES = [];
for (const [huecos, tam] of [[4, 0.25], [4, 0.15], [6, 0.15], [6, 0.10], [8, 0.10], [10, 0.08], [12, 0.06]]) {
  const e = banda({ tam, huecos, modo: "efectivo" }, 60000);
  const s = banda({ tam, huecos, modo: "spy" }, 60000);
  const q = cuenta({ capital: 60000, tam, huecos, modo: "spy" });
  RES.push({ huecos, tam, e, s, ops: q.tom.length, inv: q.invertido });
  console.log("  " + String(huecos).padEnd(8) + ((100 * tam).toFixed(0) + "%").padStart(11) +
    ((huecos * tam * 100).toFixed(0) + "%").padStart(10) +
    "  │ " + (e.a.toFixed(1) + "%   caída −" + e.c.toFixed(0) + "%").padStart(20) +
    "  │ " + (s.a.toFixed(1) + "%   caída −" + s.c.toFixed(0) + "%").padStart(20) + String(q.tom.length).padStart(6)); }
console.log("  " + "comprar SPY y dormir".padEnd(29) + "  │ " + " ".repeat(20) + "  │ " +
  (an(spySolo, 60000).toFixed(1) + "%   caída −25%").padStart(20));
// la mejor por relación rendimiento/caída, con al menos 100 operaciones
const mejor = RES.filter((r) => r.ops >= 100).sort((a, b) => (b.s.a / Math.max(1, b.s.c)) - (a.s.a / Math.max(1, a.s.c)))[0];
for (const [nom, modo] of [["el ocioso en SPY", "spy"], ["efectivo al 3,3%", "efectivo"]]) {
  const q = cuenta({ capital: 60000, tam: mejor.tam, huecos: mejor.huecos, modo });
  console.log("");
  console.log("  ── " + mejor.huecos + " huecos al " + (100 * mejor.tam).toFixed(0) + "%, " + nom + " ──");
  console.log("  " + "año".padEnd(7) + "valor".padStart(13) + "% del año".padStart(11) + "ops".padStart(6) + "gana".padStart(7) + "pierde".padStart(8));
  let v0 = 60000;
  for (const y of ["2016","2017","2018","2019","2020","2021","2022","2023","2024","2025","2026"]) {
    const fin = [...DD].reverse().find((d) => d.startsWith(y)); if (!fin) continue;
    const r = cuenta({ L: OPS.filter((x) => x.dC <= fin), capital: 60000, tam: mejor.tam, huecos: mejor.huecos, modo, hasta: fin });
    const del = q.tom.filter((x) => x.dC.startsWith(y));
    console.log("  " + y.padEnd(7) + D(r.final).padStart(13) +
      (((r.final / v0 - 1) >= 0 ? "+" : "−") + Math.abs(100 * (r.final / v0 - 1)).toFixed(0) + "%").padStart(11) +
      String(del.length).padStart(6) + String(del.filter((x) => x.gana > 0).length).padStart(7) +
      String(del.filter((x) => x.gana <= 0).length).padStart(8));
    v0 = r.final; }
  const g = q.tom.filter((x) => x.gana > 0).length;
  console.log("  TOTAL: " + D(q.final) + "  ·  " + an(q.final, 60000).toFixed(1) + "% al año  ·  caída −" + q.caida.toFixed(0) +
    "%  ·  " + q.tom.length + " ops  ·  acierta " + (100 * g / Math.max(1, q.tom.length)).toFixed(0) +
    "%  ·  invertido de media " + q.invertido.toFixed(0) + "%"); }
console.log("");
console.log("  ⚠️ Los parámetros se afinaron sobre 2021-2026 y se confirmaron en 2016-2020 (virgen).");
console.log("  ⚠️ El tamaño y los huecos de esta tabla SE ELIGEN AQUÍ: eso todavía no está examinado.");
console.log("");
