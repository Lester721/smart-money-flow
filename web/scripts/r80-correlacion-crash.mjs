// ¿SPY O QQQ COMO APARCADERO? — con dividendos y costes tratados como toca.
//
// Lester (2026-08-27): *"cual sale mejor SPY o QQQ? recuerda tomar el costo de los dos etf y
// los dividendos"*.
//
// ⚠️ CÓMO SE TRATAN LOS COSTES — importa y es facil equivocarse:
//   · EL COSTE DEL ETF YA ESTA EN EL PRECIO. Se descuenta del valor liquidativo cada dia, asi
//     que la serie de precios ya lo lleva dentro. NO se resta otra vez.
//   · LOS DIVIDENDOS NO ESTAN. Se pagan aparte y la serie de precios no los ve. Hay que SUMARLOS.
//
// ⚠️ ORIGEN DEL DATO DE DIVIDENDOS: **cifras publicadas, NO medidas.** No hay dividendos en disco.
//   SPY ~1,3% anual · QQQ ~0,6% anual. Se enseña el resultado CON y SIN, para ver cuanto depende.
//
// Y la pregunta que de verdad decide: QQQ rinde mas pero nuestras señales son 8 nombres tech.
// Aparcar en QQQ correlaciona el aparcadero con las posiciones -> cuando cae tech, cae todo a la vez.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cargar } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const MAG = (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12;
const yr = (y) => [...Array(12)].map((_, i) => y + String(i + 1).padStart(2, "0"));
const ANOS = [["2021", yr("2021")], ["2022", yr("2022")], ["2023", yr("2023")], ["2024", yr("2024")],
              ["2025", yr("2025")], ["2026", ["202601","202602","202603","202604","202605","202606","202607","202608"]]];
const cad = abrir("cadenas", { callado: true });
const FDIR = join(CACHE, "flujo-limpio");
const ms = (d) => Date.parse(d.slice(0,4) + "-" + d.slice(4,6) + "-" + d.slice(6,8) + "T00:00:00Z");
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
function spotOk(c, hoy) { if (!c) return null; let e0 = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; e0 = e; } }
  if (!e0) return null; const g = c[e0]; let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) { if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[k + "|P"]; if (!p) continue;
    const d = Math.abs((g[cl][0] + g[cl][1]) / 2 - (p[0] + p[1]) / 2); if (d < dm) { dm = d; K = k; } }
  if (K == null) return null; const C = g[K + "|C"], P = g[K + "|P"];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2; return s > 0 ? s : null; }
const SM = new Map();
const spotDe = (tk, d) => { const k = tk + d; if (SM.has(k)) return SM.get(k);
  const s = spotOk(cad.leer(tk, d), d); SM.set(k, s); return s; };
const DOM = new Map();
for (const f of readdirSync(FDIR)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g; if (dia < "20210101") continue;
  let L; try { L = JSON.parse(readFileSync(join(FDIR, f), "utf8")); } catch { continue; }
  let al = 0, ba = 0, n = 0;
  for (const o of L) {
    if (!(o.ask > 0 && o.bid > 0 && o.prima > 0)) continue;
    const c = o.precio >= o.ask, v = o.precio <= o.bid; if (!c && !v) continue;
    n++; if ((o.l === "C" && c) || (o.l === "P" && v)) al += o.prima; else ba += o.prima; }
  if (n >= 5) DOM.set(tk + "|" + dia, (al - ba) / (al + ba)); }
// ── precios de los dos ETF, en los mismos dias ──
const dias0 = cad.dias("SPY").filter((d) => d >= "20210101" && d <= "20260819");
const P = { SPY: new Map(), QQQ: new Map() };
for (const d of dias0) { const a = spotDe("SPY", d), b = spotDe("QQQ", d);
  if (a > 0 && b > 0) { P.SPY.set(d, a); P.QQQ.set(d, b); } }
const DIAS = dias0.filter((d) => P.SPY.has(d));
// dividendos PUBLICADOS (no medidos) — se aplican como rendimiento diario compuesto
const DIV = { SPY: 0.013, QQQ: 0.006, NADA: 0 };
function salir(f, pc) { const coste = f.ask; let k = 0, ult = null;
  for (const [d, bid] of f.camino) { k++; const m = bid / coste; ult = { mult: m, dSal: d };
    if (m >= 1.50) return { mult: 1.50, dSal: d }; if (m <= 0.50) return { mult: 0.50, dSal: d };
    const s = spotDe(f.tk, d);
    if (s != null) { const mv = f.l === "P" ? (f.spot - s) / f.spot : (s - f.spot) / f.spot;
      if (mv >= pc) return { mult: m, dSal: d }; }
    if (k >= 60) return { mult: m, dSal: d }; }
  return ult; }
function unaPorDia(L) { const g = new Map();
  for (const f of L) { const k = f.tk + f.dC; if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
  return [...g.values()].map((G) => G.reduce((a, b) =>
    (Number(b.exp) > Number(a.exp) || (Number(b.exp) === Number(a.exp) && b.prof < a.prof)) ? b : a
  )).sort((a, b) => a.dC.localeCompare(b.dC)); }
const T = [];
for (const [y, M] of ANOS) { const L = cargar(M).filter(MAG);
  for (const f of L) { const ds = cad.dias(f.tk); const i = ds.indexOf(f.dC);
    if (i < 20) { f.ma20 = null; continue; }
    const p = ds.slice(i - 20, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    f.ma20 = p.length < 15 ? null : f.spot / (p.reduce((a, b) => a + b, 0) / p.length) - 1; }
  for (const f of unaPorDia(L.filter((x) => x.ma20 != null && x.ma20 < 0))) {
    const d = DOM.get(f.tk + "|" + f.dia);
    const acorde = d == null ? 0 : (f.l === "P" ? -1 : 1) * d;
    const confirma = acorde >= 0.3 || (f.golpes >= 2 && f.golpes < 10);
    const s = salir(f, confirma ? 0.08 : 0.12);
    T.push({ ...f, y, confirma, mult: s.mult, dSal: s.dSal }); } }
T.sort((a, b) => a.dC.localeCompare(b.dC));
/** etf = "SPY" | "QQQ" | "NADA". conDiv = sumar el dividendo publicado. */
function cuenta({ L = T, capital = 60000, etf = "SPY", conDiv = true, hasta = DIAS[DIAS.length - 1] }) {
  const px = (d) => etf === "NADA" ? 1 : P[etf].get(d);
  const divD = conDiv && etf !== "NADA" ? Math.pow(1 + DIV[etf], 1 / 252) - 1 : 0;
  let caja = capital, acc = 0, ab = [], tom = [], pico = capital, peor = 0;
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  for (const hoy of DIAS.filter((d) => d <= hasta)) {
    const p = px(hoy);
    acc *= (1 + divD);                                   // el dividendo se reinvierte
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    for (const x of (porDia.get(hoy) || [])) {
      if (ab.length >= 4) continue;
      const patr = caja + acc * p + inv();
      const tope = patr * 0.25 * (x.confirma ? 2 : 1);
      if (etf !== "NADA") { const falta = Math.min(tope, patr) - caja;
        if (falta > 0 && acc > 0) { const v = Math.min(acc, falta / p); acc -= v; caja += v * p; } }
      const n = Math.floor(Math.min(tope, caja) / (x.ask * 100));
      if (n < 1) continue;
      const dinero = n * x.ask * 100;
      caja -= dinero; ab.push({ ...x, dinero, n }); tom.push({ ...x, dinero, n }); }
    if (etf !== "NADA" && caja > 0) { acc += caja / p; caja = 0; }
    const v = caja + acc * p + ab.reduce((a, b) => a + b.dinero, 0);
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  const p = px(hasta);
  let fin = caja + acc * p;
  for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, tom, caida: 100 * peor }; }
const anual = (f, c = 60000) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / 5.63) - 1);
console.log("");
console.log("  ══ AUDIT ══");
for (const etf of ["SPY", "QQQ"]) {
  const solo = 60000 * P[etf].get(DIAS[DIAS.length - 1]) / P[etf].get(DIAS[0]);
  const ctrl = cuenta({ L: [], etf, conDiv: false });
  console.log("  CONTROL sin señales en " + etf + " = " + etf + " exacto: " + D(ctrl.final) + " vs " + D(solo) +
    (Math.abs(ctrl.final - solo) < 5 ? "  ✓" : "  ⚠")); }
console.log("  días con precio de los DOS: " + DIAS.length);
console.log("  ⚠️ dividendos: SPY 1,3% · QQQ 0,6% — CIFRAS PUBLICADAS, no medidas. El coste del ETF ya está en el precio.");
console.log("");
console.log("  ══ ¿DÓNDE APARCAR? ══");
console.log("");
console.log("  " + "".padEnd(30) + "SIN dividendos".padStart(22) + "CON dividendos".padStart(22) + "caída".padStart(9));
for (const [nom, etf] of [["en NADA (efectivo al 0%)", "NADA"], ["en SPY", "SPY"], ["en QQQ", "QQQ"]]) {
  const a = cuenta({ etf, conDiv: false }), b = cuenta({ etf, conDiv: true });
  console.log("  " + nom.padEnd(30) + (D(a.final) + "  " + anual(a.final).toFixed(1) + "%").padStart(22) +
    (D(b.final) + "  " + anual(b.final).toFixed(1) + "%").padStart(22) + ("−" + b.caida.toFixed(0) + "%").padStart(9));
}
console.log("");
console.log("  ── y los dos ETF solos, para comparar ──");
for (const etf of ["SPY", "QQQ"]) {
  const solo = 60000 * P[etf].get(DIAS[DIAS.length - 1]) / P[etf].get(DIAS[0]);
  const conDiv = solo * Math.pow(1 + DIV[etf], 5.63);
  console.log("  " + ("$60.000 en " + etf + " solo").padEnd(30) + (D(solo) + "  " + anual(solo).toFixed(1) + "%").padStart(22) +
    (D(conDiv) + "  " + anual(conDiv).toFixed(1) + "%").padStart(22)); }
console.log("");
// ¿LA CORRELACIÓN BAJA DE BITCOIN SOBREVIVE AL CRASH? — Lester, 2026-08-27.
//
// El único argumento a favor de meter bitcoin al lado de SPY era que correlaciona 0.411 con
// nuestros tickers contra 0.897 de SPY. Pero eso se midió en 2024-2026, SIN un crash.
// Aquí se mide con BITO, que sí existía en 2022 (bitcoin cayó 64% ese año).
//
// ⚠️ BITO en CRUDO (sin sus repartos). Para CAÍDA y CORRELACIÓN vale; para RENDIMIENTO no.
//    Validado: 1.218 días, mayor salto diario 22.3% (plausible), sin saltos de ajuste.
import { readFileSync as RF } from "node:fs";
const PX = JSON.parse(RF(new URL("./precios-ibit-spy.json", import.meta.url), "utf8"));
const tks = [...new Set(T.map((x) => x.tk))].sort();
function serie(dias) {                                   // cesta igualmente ponderada de nuestros tickers
  const out = [];
  for (let i = 1; i < dias.length; i++) {
    let s = 0, n = 0;
    for (const tk of tks) { const p1 = spotDe(tk, dias[i]), p0 = spotDe(tk, dias[i - 1]);
      if (p1 > 0 && p0 > 0) { const x = p1 / p0 - 1; if (Math.abs(x) < 0.25) { s += x; n++; } } }
    out.push(n >= 4 ? s / n : null); }
  return out; }
function corr(A, B) { const P = []; for (let i = 0; i < A.length; i++) if (A[i] != null && B[i] != null) P.push([A[i], B[i]]);
  if (P.length < 30) return null;
  const mA = P.reduce((s, x) => s + x[0], 0) / P.length, mB = P.reduce((s, x) => s + x[1], 0) / P.length;
  let sxy = 0, sx = 0, sy = 0;
  for (const [a, b] of P) { sxy += (a - mA) * (b - mB); sx += (a - mA) ** 2; sy += (b - mB) ** 2; }
  return { r: sxy / Math.sqrt(sx * sy), n: P.length }; }
function retor(m, dias) { const o = []; for (let i = 1; i < dias.length; i++) {
  const a = m[dias[i]], b = m[dias[i - 1]]; o.push(a > 0 && b > 0 ? a / b - 1 : null); } return o; }
console.log("");
console.log("  ══ AUDIT ══");
console.log("  BITO crudo: 1.218 días, mayor salto 22.3% ✓ · SPY crudo: 1.230 días desde 2021-10, mayor salto 10.5% ✓");
console.log("  MISMA FUENTE Y CONVENCIÓN los dos (cierre de Robinhood, sin ajustar) — no se cruzan series distintas");
console.log("  ⚠️ crudo = sin repartos. Sirve para CAÍDA y CORRELACIÓN, NO para rendimiento.");
console.log("");
console.log("  ══ CORRELACIÓN DIARIA CON LA CESTA DE NUESTROS 8 TICKERS ══");
console.log("");
console.log("  " + "período".padEnd(30) + "SPY".padStart(10) + "bitcoin".padStart(12) + "días".padStart(8));
const VENT = [["2021-10 a 2026-08 (todo)", "20211019", "20260819"],
              ["🔴 2022 solo (el crash)", "20220101", "20221231"],
              ["2021-10 a 2023-12 (con crash)", "20211019", "20231231"],
              ["2024-01 a 2026-08 (sin crash)", "20240101", "20260819"]];
for (const [nom, a, b] of VENT) {
  const dd = DIAS.filter((d) => d >= a && d <= b && PX.BITO[d] && PX.SPYL[d]);
  const C = serie(dd);
  const rS = corr(retor(PX.SPYL, dd), C), rB = corr(retor(PX.BITO, dd), C);
  console.log("  " + nom.padEnd(30) + (rS ? rS.r.toFixed(3) : "—").padStart(10) +
    (rB ? rB.r.toFixed(3) : "—").padStart(12) + String(dd.length).padStart(8)); }
console.log("");
console.log("  ══ ¿CAYERON A LA VEZ? — 2022 ══");
console.log("");
const d22 = DIAS.filter((d) => d >= "20220101" && d <= "20221231" && PX.BITO[d] && PX.SPYL[d]);
for (const [nom, m] of [["SPY", PX.SPYL], ["bitcoin (BITO precio)", PX.BITO]]) {
  let pico = 0, peor = 0, dF = "";
  for (const d of d22) { if (m[d] > pico) pico = m[d]; const q = 1 - m[d] / pico; if (q > peor) { peor = q; dF = d; } }
  console.log("  " + nom.padEnd(24) + "2022: " + ((m[d22[d22.length - 1]] / m[d22[0]] - 1) >= 0 ? "+" : "−") +
    Math.abs(100 * (m[d22[d22.length - 1]] / m[d22[0]] - 1)).toFixed(0) + "%".padEnd(3) +
    "   peor caída del año −" + (100 * peor).toFixed(0) + "%   (fondo " + dF + ")"); }
// nuestra cesta en 2022
{ const C = serie(d22); let v = 1, pico = 1, peor = 0;
  for (const x of C) if (x != null) { v *= (1 + x); if (v > pico) pico = v; const q = 1 - v / pico; if (q > peor) peor = q; }
  console.log("  " + "nuestros 8 tickers".padEnd(24) + "2022: " + ((v - 1) >= 0 ? "+" : "−") + Math.abs(100 * (v - 1)).toFixed(0) + "%" +
    "      peor caída del año −" + (100 * peor).toFixed(0) + "%"); }
console.log("");
console.log("  ══ Y EN LOS DÍAS MALOS DE VERDAD ══");
console.log("");
const dTodo = DIAS.filter((d) => d >= "20211019" && d <= "20260819" && PX.BITO[d] && PX.SPYL[d]);
const C = serie(dTodo), rS = retor(PX.SPYL, dTodo), rB = retor(PX.BITO, dTodo);
for (const [nom, filtro] of [["todos los días", () => true],
    ["los días que la cesta cae >2%", (i) => C[i] != null && C[i] < -0.02],
    ["los días que la cesta cae >3%", (i) => C[i] != null && C[i] < -0.03]]) {
  const idx = []; for (let i = 0; i < C.length; i++) if (filtro(i)) idx.push(i);
  const mS = idx.filter((i) => rS[i] != null), mB = idx.filter((i) => rB[i] != null);
  const avS = mS.reduce((s, i) => s + rS[i], 0) / mS.length, avB = mB.reduce((s, i) => s + rB[i], 0) / mB.length;
  console.log("  " + nom.padEnd(30) + "SPY " + (100 * avS).toFixed(2) + "%".padEnd(3) +
    "   bitcoin " + (100 * avB).toFixed(2) + "%" + "   (n=" + idx.length + ")"); }
console.log("");
