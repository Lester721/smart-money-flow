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
// ¿UN TROZO EN IBIT AL LADO DE SPY? — Lester, 2026-08-27: "mídelo".
// El argumento real de IBIT no es rendir más (los dos ETF dieron +67% en la ventana):
// es que correlaciona 0.411 con nuestros tickers contra 0.897 de SPY.
//
// ⚠️ VENTANA 2024-01-11 → 2026-08-19 (2.6 años). 2022 QUEDA FUERA. IBIT no existía.
// ⚠️ Precios de Robinhood adjustment=all: los dividendos YA ESTÁN dentro. Misma fuente los dos.
// Reequilibrado por FLUJO DE CAJA (el dinero nuevo entra al peso objetivo, no se fuerza venta),
// más un control con reequilibrado diario forzado para ver si la respuesta depende de eso.
import { readFileSync as RF } from "node:fs";
const PX = JSON.parse(RF(new URL("./precios-ibit-spy.json", import.meta.url), "utf8"));
const D0 = "20240111";
const DV = DIAS.filter((d) => d >= D0 && PX.SPY[d] && PX.IBIT[d]);
const TIPO = 0.033, ANOS_V = 2.61;
function correr({ capital, w = 0, forzado = false, tipo = TIPO, hasta = DV[DV.length - 1] }) {
  const intD = Math.pow(1 + tipo, 1 / 252) - 1;
  const dias = DV.filter((d) => d <= hasta);
  let caja = capital, aS = 0, aI = 0, ab = [], pico = capital, peor = 0;
  const porDia = new Map();
  for (const x of T) { if (x.dC < D0) continue; if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  for (const hoy of dias) {
    const pS = PX.SPY[hoy], pI = PX.IBIT[hoy];
    caja *= (1 + intD);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    const etfV = () => aS * pS + aI * pI;
    for (const x of (porDia.get(hoy) || [])) {
      if (ab.length >= 4) continue;
      const patr = caja + etfV() + inv();
      const tope = patr * 0.25 * (x.confirma ? 2 : 1);
      const falta = Math.min(tope, patr) - caja;
      if (falta > 0 && etfV() > 0) {                       // se vende A PRORRATA de los dos
        const f = Math.min(1, falta / etfV());
        const vS = aS * f, vI = aI * f;
        aS -= vS; aI -= vI; caja += vS * pS + vI * pI; }
      const n = Math.floor(Math.min(tope, caja) / (x.ask * 100));
      if (n < 1) continue;
      caja -= n * x.ask * 100; ab.push({ ...x, dinero: n * x.ask * 100 }); }
    if (forzado) {                                          // control: reequilibrar a la fuerza
      const v = etfV() + caja; aS = v * (1 - w) / pS; aI = v * w / pI; caja = 0; }
    else if (caja > 0) {                                    // por flujo de caja: el dinero nuevo entra al objetivo
      const v = etfV() + caja;
      const objI = v * w, objS = v * (1 - w);
      let cI = Math.max(0, Math.min(caja, objI - aI * pI));
      let cS = Math.max(0, Math.min(caja - cI, objS - aS * pS));
      if (cI + cS < caja) { const r = caja - cI - cS; cI += r * w; cS += r * (1 - w); }
      aI += cI / pI; aS += cS / pS; caja = 0; }
    const v = caja + etfV() + inv();
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  const dU = dias[dias.length - 1];
  let fin = caja + aS * PX.SPY[dU] + aI * PX.IBIT[dU];
  for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, caida: 100 * peor }; }
const an = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / ANOS_V) - 1);
const med = (A) => { const B = [...A].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
function banda(op, base) { const A = [], C = [], paso = base * 0.0083;
  for (let c = base * 0.917; c <= base * 1.084; c += paso) { const q = correr({ ...op, capital: c });
    A.push(an(q.final, c)); C.push(q.caida); }
  return { a: med(A), c: med(C) }; }
console.log("");
console.log("  ══ AUDIT ══");
const w0 = banda({ w: 0 }, 60000), w1 = banda({ w: 1 }, 60000);
console.log("  0% IBIT reproduce «aparcado en SPY» (74.7% / −14%):  " + w0.a.toFixed(1) + "% / −" + w0.c.toFixed(0) + "%" +
  (Math.abs(w0.a - 74.7) < 0.3 ? "  ✓" : "  ⚠"));
console.log("  100% IBIT reproduce «aparcado en IBIT» (77.1% / −28%): " + w1.a.toFixed(1) + "% / −" + w1.c.toFixed(0) + "%" +
  (Math.abs(w1.a - 77.1) < 0.3 ? "  ✓" : "  ⚠"));
console.log("  ⚠️ 2022 QUEDA FUERA — sólo 2.6 años y 55 de las 81 señales.");
const PESOS = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50, 0.75, 1.00];
for (const base of [60000, 300000]) {
  console.log("");
  console.log("  ══════ CUENTA DE " + D(base) + " ══════");
  console.log("");
  console.log("  " + "% del aparcadero en IBIT".padEnd(26) + "al año".padStart(9) + "caída".padStart(8) +
    "por punto de caída".padStart(20) + "reequ. forzado".padStart(17));
  let mejor = null;
  for (const w of PESOS) {
    const b = banda({ w }, base), f = banda({ w, forzado: true }, base);
    const r = b.a / b.c;
    if (!mejor || r > mejor.r) mejor = { w, r, ...b };
    console.log("  " + ((100 * w).toFixed(0) + "%").padEnd(26) + (b.a.toFixed(1) + "%").padStart(9) +
      ("−" + b.c.toFixed(0) + "%").padStart(8) + r.toFixed(2).padStart(20) +
      (f.a.toFixed(1) + "% / −" + f.c.toFixed(0) + "%").padStart(17)); }
  console.log("  → mejor relación rendimiento/caída: " + (100 * mejor.w).toFixed(0) + "% en IBIT (" +
    mejor.a.toFixed(1) + "% / −" + mejor.c.toFixed(0) + "%)"); }
console.log("");
