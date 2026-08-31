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
// ¿APARCAR EN SPY O EN IBIT (bitcoin)? — Lester, 2026-08-27.
//
// ⚠️ LÍMITE DURO: IBIT no existe antes del 2024-01-11. La ventana es 2.6 años, no 6,
//    y DEJA FUERA 2022 ENTERO — el año que decide todo en esta estrategia.
// ⚠️ Precios de Robinhood con adjustment_type=all: los DIVIDENDOS YA ESTÁN DENTRO.
//    No se suma nada — aquí no hay cifra publicada, es el dato real. Los dos ETF, misma fuente.
import { readFileSync as RF } from "node:fs";
const PX = JSON.parse(RF(new URL("./precios-ibit-spy.json", import.meta.url), "utf8"));
const D0 = "20240111";
const DV = DIAS.filter((d) => d >= D0 && PX.SPY[d] && PX.IBIT[d]);
const TIPO = 0.033;
function correr({ capital, etf = "SPY", tipo = TIPO, hasta = DV[DV.length - 1] }) {
  const intD = Math.pow(1 + tipo, 1 / 252) - 1;
  const dias = DV.filter((d) => d <= hasta);
  let caja = capital, acc = 0, ab = [], tom = [], pico = capital, peor = 0;
  const porDia = new Map();
  for (const x of T) { if (x.dC < D0) continue; if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  for (const hoy of dias) {
    const p = etf === "NADA" ? 1 : PX[etf][hoy];
    caja *= (1 + intD);
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
      caja -= n * x.ask * 100; ab.push({ ...x, dinero: n * x.ask * 100 }); tom.push({ ...x, dC: x.dC, mult: x.mult }); }
    if (etf !== "NADA" && caja > 0) { acc += caja / p; caja = 0; }
    const v = caja + acc * p + inv();
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  const p = etf === "NADA" ? 1 : PX[etf][dias[dias.length - 1]];
  let fin = caja + acc * p;
  for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, caida: 100 * peor, tom }; }
const ANOS_V = 2.61;                                    // 2024-01-11 → 2026-08-19
const an = (f, c, a = ANOS_V) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / a) - 1);
const med = (A) => { const B = [...A].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
function banda(op, base) { const A = [], C = [], paso = base * 0.0083;
  for (let c = base * 0.917; c <= base * 1.084; c += paso) { const q = correr({ ...op, capital: c });
    A.push(an(q.final, c)); C.push(q.caida); }
  return { a: med(A), c: med(C), lo: Math.min(...A), hi: Math.max(...A) }; }
console.log("");
console.log("  ══ AUDIT ══");
console.log("  ventana: " + DV[0] + " → " + DV[DV.length - 1] + "  (" + DV.length + " días, " + ANOS_V + " años)");
console.log("  ⚠️ 2022 QUEDA FUERA. IBIT no existía.");
console.log("  señales dentro de la ventana: " + T.filter((x) => x.dC >= D0).length + " de " + T.length);
for (const etf of ["SPY", "IBIT"]) {
  const solo = 60000 * PX[etf][DV[DV.length - 1]] / PX[etf][DV[0]];
  const ctrl = correr({ capital: 60000, etf, tipo: 0 });
  const q = correr({ capital: 60000, etf });
  console.log("  " + etf + " solo (dividendos dentro): " + D(solo) + "  " + an(solo, 60000).toFixed(1) + "% al año"); }
const ctrl0 = correr({ capital: 60000, etf: "NADA", tipo: 0 });
console.log("  control efectivo al 0% sin interés: " + D(ctrl0.final));
console.log("  ¿mira al futuro? " + (T.every((x) => x.dia < x.dC) ? "NO ✓" : "⚠ SÍ"));
for (const base of [60000, 300000]) {
  console.log("");
  console.log("  ══════ CUENTA DE " + D(base) + "  ·  2024-2026 (2.6 años)  ·  con Gold 3.3% ══════");
  console.log("");
  console.log("  " + "".padEnd(28) + "al año".padStart(10) + "caída".padStart(9) + "rango del baile".padStart(18));
  for (const [nom, etf] of [["EN LIMPIO (sin ETF)", "NADA"], ["aparcado en SPY", "SPY"], ["aparcado en IBIT (bitcoin)", "IBIT"]]) {
    const b = banda({ etf }, base);
    console.log("  " + nom.padEnd(28) + (b.a.toFixed(1) + "%").padStart(10) + ("−" + b.c.toFixed(0) + "%").padStart(9) +
      (b.lo.toFixed(1) + "% a " + b.hi.toFixed(1) + "%").padStart(18)); }
  console.log("");
  console.log("  " + "año".padEnd(6) + "EN LIMPIO".padStart(12) + "en SPY".padStart(12) + "en IBIT".padStart(12) +
    "     │ " + "SPY solo".padStart(10) + "IBIT solo".padStart(11));
  const pv = { NADA: base, SPY: base, IBIT: base }, pe = { SPY: base, IBIT: base };
  for (const y of ["2024", "2025", "2026"]) {
    const fin = [...DV].reverse().find((d) => d.startsWith(y));
    const f = ["NADA", "SPY", "IBIT"].map((etf) => { const v = correr({ capital: base, etf, hasta: fin }).final;
      const p = 100 * (v / pv[etf] - 1); pv[etf] = v; return ((p >= 0 ? "+" : "−") + Math.abs(p).toFixed(0) + "%").padStart(12); });
    const g = ["SPY", "IBIT"].map((etf) => { const v = base * PX[etf][fin] / PX[etf][DV[0]];
      const p = 100 * (v / pe[etf] - 1); pe[etf] = v; return ((p >= 0 ? "+" : "−") + Math.abs(p).toFixed(0) + "%").padStart(etf === "SPY" ? 10 : 11); });
    console.log("  " + y.padEnd(6) + f.join("") + "     │ " + g.join("")); } }
console.log("");
console.log("  ── correlación diaria con la cesta de nuestros tickers ──");
const tks = [...new Set(T.map((x) => x.tk))].sort();
for (const etf of ["SPY", "IBIT"]) {
  const rE = [], rC = [];
  for (let i = 1; i < DV.length; i++) {
    const a = PX[etf][DV[i]] / PX[etf][DV[i - 1]] - 1;
    let s = 0, n = 0;
    for (const tk of tks) { const p1 = spotDe(tk, DV[i]), p0 = spotDe(tk, DV[i - 1]);
      if (p1 > 0 && p0 > 0) { const x = p1 / p0 - 1; if (Math.abs(x) < 0.25) { s += x; n++; } } }
    if (n >= 4) { rE.push(a); rC.push(s / n); } }
  const m = (A) => A.reduce((x, y) => x + y, 0) / A.length, mA = m(rE), mB = m(rC);
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < rC.length; i++) { const dx = rE[i] - mA, dy = rC[i] - mB; sxy += dx * dy; sx += dx * dx; sy += dy * dy; }
  console.log("  " + etf.padEnd(6) + (sxy / Math.sqrt(sx * sy)).toFixed(3) + "   (n=" + rC.length + ")"); }
console.log("");
