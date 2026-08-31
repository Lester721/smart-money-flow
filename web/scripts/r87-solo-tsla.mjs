// EL ESTADO CON LA REGLA COMPLETA — las dos cuentas, año por año.
//
// LA REGLA (2026-08-27):
//   señal   golpe >$500k al ask · 12x el OI de la vispera · DENTRO del dinero · >=$10.000 ·
//           >=5 dias a vencer · despues de las 14:00
//   filtro  la accion por debajo de su media de 20 dias
//   cual    UNA por ticker-dia: la del vencimiento mas lejano
//   compra  el dia siguiente, al ask
//   salida  8% de movimiento SI la cinta confirma · 12% si NO confirma · tope 60 dias
//   tamaño  25% del capital · 50% si confirma · 4 HUECOS SIEMPRE
//   resto   en SPY, siempre
//   confirma = dominancia a favor (>=0,3) O repeticion (2-9 golpes)
//
// AUDIT DENTRO antes de enseñar: control sin señales = SPY exacto · suma que cuadre ·
// sin mirada al futuro · la posicion mayor nunca pasa del 50%.
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
const dSPY = cad.dias("SPY").filter((d) => d >= "20210101" && d <= "20260819");
const pSPY = new Map(); for (const d of dSPY) { const s = spotDe("SPY", d); if (s > 0) pSPY.set(d, s); }
const DIAS = dSPY.filter((d) => pSPY.has(d));
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
// ══ ¿LA ESTRATEGIA SOBRE TSLA LE GANA A COMPRAR TSLA? ══ Lester, 2026-08-27:
//   «¿qué importa si todo el dinero gana con TSLA? dinero es dinero, ¿no?»
// Tiene razón en el principio. La pregunta que lo decide es su propia regla:
// EL LISTÓN TIENE QUE SER COMPRABLE. Si no le gana a comprar TSLA, no es una estrategia:
// es una forma cara y complicada de estar largo en TSLA.
import { readFileSync as RF } from "node:fs";
const PX = JSON.parse(RF(new URL("./precios-ibit-spy.json", import.meta.url), "utf8"));
const an = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / 5.63) - 1);
const med = (A) => { const B = [...A].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
const media = (A) => A.reduce((s, x) => s + x, 0) / A.length;
function stats(L) { if (!L || L.length < 3) return null;
  const m = L.map((x) => x.mult); const r = media(m) - 1;
  const sd = Math.sqrt(m.reduce((s, x) => s + (x - 1 - r) ** 2, 0) / (m.length - 1));
  return { n: m.length, ret: 100 * r, gana: 100 * m.filter((x) => x > 1).length / m.length, t: r / (sd / Math.sqrt(m.length)) }; }
function cuenta({ L, capital, tipo = 0.033 }) {
  const intD = Math.pow(1 + tipo, 1 / 252) - 1;
  let caja = capital, ab = [], nOps = 0, pico = capital, peor = 0;
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  for (const hoy of DIAS) { caja *= (1 + intD);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    for (const x of (porDia.get(hoy) || [])) { if (ab.length >= 4) continue;
      const tope = (caja + inv()) * 0.25 * (x.confirma ? 2 : 1);
      const n = Math.floor(Math.min(tope, caja) / (x.ask * 100)); if (n < 1) continue;
      caja -= n * x.ask * 100; ab.push({ ...x, dinero: n * x.ask * 100 }); nOps++; }
    const v = caja + inv(); if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  let fin = caja; for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, caida: 100 * peor, nOps }; }
function banda(L, base) { const A = [], C = [], N = [], paso = base * 0.0083;
  for (let c = base * 0.917; c <= base * 1.084; c += paso) { const q = cuenta({ L, capital: c }); A.push(an(q.final, c)); C.push(q.caida); N.push(q.nOps); }
  return { a: med(A), c: med(C), n: med(N) }; }
/** comprar y guardar el subyacente, con el mismo dinero y el mismo período */
function guardar(tk, capital) {
  const dd = DIAS.filter((d) => PX[tk]?.[d]);
  if (dd.length < 100) return null;
  let pico = 0, peor = 0;
  const p0 = PX[tk][dd[0]];
  for (const d of dd) { const v = PX[tk][d]; if (v > pico) pico = v; const q = 1 - v / pico; if (q > peor) peor = q; }
  const fin = capital * PX[tk][dd[dd.length - 1]] / p0;
  return { final: fin, caida: 100 * peor }; }
const T_TSLA = T.filter((x) => x.tk === "TSLA");
console.log("");
console.log("  ══ AUDIT ══");
console.log("  señales de TSLA: " + T_TSLA.length + " de " + T.length + " (esperado 34)" + (T_TSLA.length === 34 ? "  ✓" : "  ⚠"));
const s = stats(T_TSLA);
console.log("  a peso igual: " + s.ret.toFixed(2) + "% · acierta " + s.gana.toFixed(0) + "% · t=" + s.t.toFixed(2) + "   (esperado 11.34 / 82 / 4.23)");
const puts = T_TSLA.filter((x) => x.l === "P").length;
console.log("  de esas 34: " + puts + " PUTS y " + (34 - puts) + " calls");
const gT = guardar("TSLA", 60000), gS = guardar("SPY", 60000);
console.log("  precios de TSLA ajustados por splits, fuente Robinhood: " + DIAS.filter((d) => PX.TSLA?.[d]).length + " días cruzados");
console.log("  período: " + DIAS[0] + " → " + DIAS[DIAS.length - 1]);
console.log("");
console.log("  ══ ¿LE GANA A COMPRAR TSLA Y GUARDARLO? ══");
console.log("");
console.log("  " + "".padEnd(40) + "acaba con".padStart(14) + "al año".padStart(10) + "caída".padStart(9) + "ops".padStart(6));
const bT = banda(T_TSLA, 60000);
console.log("  " + "la estrategia SÓLO con TSLA".padEnd(40) + D(60000 * Math.pow(1 + bT.a / 100, 5.63)).padStart(14) +
  (bT.a.toFixed(1) + "%").padStart(10) + ("−" + bT.c.toFixed(0) + "%").padStart(9) + String(bT.n).padStart(6));
console.log("  " + "comprar TSLA y guardarlo".padEnd(40) + D(gT.final).padStart(14) +
  (an(gT.final, 60000).toFixed(1) + "%").padStart(10) + ("−" + gT.caida.toFixed(0) + "%").padStart(9) + "1".padStart(6));
const bAll = banda(T, 60000);
console.log("  " + "la estrategia con los 8 tickers".padEnd(40) + D(60000 * Math.pow(1 + bAll.a / 100, 5.63)).padStart(14) +
  (bAll.a.toFixed(1) + "%").padStart(10) + ("−" + bAll.c.toFixed(0) + "%").padStart(9) + String(bAll.n).padStart(6));
console.log("  " + "comprar SPY y guardarlo (con dividendos)".padEnd(40) + D(134588).padStart(14) + "15.4%".padStart(10) + "−25%".padStart(9) + "1".padStart(6));
console.log("");
console.log("  ══ Y SI HUBIERAS PUESTO EL MISMO DINERO EN TSLA CADA VEZ QUE LA REGLA DIJO ══");
console.log("");
console.log("  (misma fecha de entrada y de salida que cada señal, pero comprando la ACCIÓN, no la opción)");
let nOk = 0, sumaOp = 0, sumaAc = 0, mejorOp = 0;
const parejas = [];
for (const x of T_TSLA) {
  const p0 = PX.TSLA?.[x.dC], p1 = PX.TSLA?.[x.dSal];
  if (!(p0 > 0 && p1 > 0)) continue;
  nOk++;
  const rOp = x.mult - 1;
  const rAc = x.l === "P" ? (p0 - p1) / p0 : (p1 - p0) / p0;   // la acción, en la dirección de la apuesta
  sumaOp += rOp; sumaAc += rAc; if (rOp > rAc) mejorOp++;
  parejas.push({ rOp, rAc });
}
console.log("  parejas comparables: " + nOk + " de " + T_TSLA.length);
console.log("  la OPCIÓN, por operación:                " + (100 * sumaOp / nOk).toFixed(2) + "%");
console.log("  la ACCIÓN, misma dirección y fechas:     " + (100 * sumaAc / nOk).toFixed(2) + "%");
console.log("  la opción gana a la acción en " + mejorOp + " de " + nOk + " operaciones");
const dm = parejas.map((p) => p.rOp - p.rAc);
const sdd = Math.sqrt(dm.reduce((s, x) => s + (x - media(dm)) ** 2, 0) / (dm.length - 1));
console.log("  diferencia media: " + (100 * media(dm)).toFixed(2) + " puntos  ·  t=" + (media(dm) / (sdd / Math.sqrt(dm.length))).toFixed(2));
console.log("");
