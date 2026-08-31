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
// ¿EL EDGE SOBREVIVE A PESO IGUAL? — el test justo de concentración.
// En dólares, las últimas operaciones SIEMPRE son las mayores porque la cuenta creció.
// A peso igual eso desaparece: cada señal pesa lo mismo y sólo cuenta el múltiplo.
const pct = (A, p) => { const B = [...A].sort((a, b) => a - b); return B[Math.min(B.length - 1, Math.floor(p * B.length))]; };
const media = (A) => A.reduce((s, x) => s + x, 0) / A.length;
function stats(L) {
  if (L.length < 3) return null;
  const m = L.map((x) => x.mult);
  const r = media(m) - 1;
  const sd = Math.sqrt(m.reduce((s, x) => s + (x - 1 - r) ** 2, 0) / (m.length - 1));
  return { n: m.length, ret: 100 * r, gana: 100 * m.filter((x) => x > 1).length / m.length,
           t: r / (sd / Math.sqrt(m.length)) }; }
console.log("");
console.log("  ══ AUDIT ══");
const S = stats(T);
console.log("  81 señales, cada una pesando lo mismo. Rendimiento medio por operación: " + S.ret.toFixed(2) +
  "%  ·  acierta " + S.gana.toFixed(0) + "%  ·  t = " + S.t.toFixed(2));
console.log("  ⚠️ esto NO es el rendimiento de la cuenta: ignora tamaño, huecos y composición.");
console.log("  ⚠️ el peaje de la horquilla YA está dentro (compra al ask, vende al bid).");
console.log("");
console.log("  ══ (1) A PESO IGUAL, ¿SOBREVIVE AL QUITAR LAS MEJORES? ══");
console.log("");
const orden = [...T].sort((a, b) => b.mult - a.mult);
console.log("  " + "".padEnd(26) + "n".padStart(5) + "% por operación".padStart(17) + "acierta".padStart(9) + "t".padStart(8));
for (const k of [0, 1, 3, 5, 10]) {
  const s = stats(orden.slice(k));
  console.log("  " + (k === 0 ? "todas" : "sin las " + k + " mejores").padEnd(26) + String(s.n).padStart(5) +
    (s.ret.toFixed(2) + "%").padStart(17) + (s.gana.toFixed(0) + "%").padStart(9) + s.t.toFixed(2).padStart(8)); }
console.log("");
console.log("  ══ (2) POR AÑO, A PESO IGUAL ══");
console.log("");
console.log("  " + "año".padEnd(8) + "n".padStart(5) + "% por operación".padStart(17) + "acierta".padStart(9) + "t".padStart(8) + "  TSLA de esas");
for (const y of ["2021", "2022", "2023", "2024", "2025", "2026"]) {
  const L = T.filter((x) => x.y === y); const s = stats(L);
  const nt = L.filter((x) => x.tk === "TSLA").length;
  console.log("  " + y.padEnd(8) + String(L.length).padStart(5) + (s ? (s.ret.toFixed(2) + "%").padStart(17) : "—".padStart(17)) +
    (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) + (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)) +
    ("   " + nt + " de " + L.length)); }
console.log("");
console.log("  ══ (3) POR TICKER, A PESO IGUAL ══");
console.log("");
console.log("  " + "ticker".padEnd(8) + "n".padStart(5) + "% por operación".padStart(17) + "acierta".padStart(9) + "t".padStart(8));
for (const t of [...new Set(T.map((x) => x.tk))].sort()) {
  const s = stats(T.filter((x) => x.tk === t));
  console.log("  " + t.padEnd(8) + String(T.filter((x) => x.tk === t).length).padStart(5) +
    (s ? (s.ret.toFixed(2) + "%").padStart(17) : "—".padStart(17)) +
    (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) + (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8))); }
console.log("");
console.log("  ══ (4) LOS DOS SOSPECHOSOS, QUITADOS A LA VEZ ══");
console.log("");
for (const [nom, F] of [["todo", () => true], ["sin TSLA", (x) => x.tk !== "TSLA"], ["sin 2026", (x) => x.y !== "2026"],
                        ["sin TSLA Y sin 2026", (x) => x.tk !== "TSLA" && x.y !== "2026"]]) {
  const s = stats(T.filter(F));
  console.log("  " + nom.padEnd(26) + (s ? String(s.n).padStart(5) + (s.ret.toFixed(2) + "%").padStart(17) +
    (s.gana.toFixed(0) + "%").padStart(9) + ("t=" + s.t.toFixed(2)).padStart(10) : "sin muestra")); }
console.log("");
console.log("  ══ (5) EL REPARTO DE MÚLTIPLOS — ¿lotería o goteo? ══");
console.log("");
const M = T.map((x) => x.mult);
console.log("  peor: x" + Math.min(...M).toFixed(2) + "   ·   percentil 25: x" + pct(M, 0.25).toFixed(2) +
  "   ·   MEDIANA: x" + pct(M, 0.50).toFixed(2) + "   ·   percentil 75: x" + pct(M, 0.75).toFixed(2) +
  "   ·   mejor: x" + Math.max(...M).toFixed(2));
console.log("  operaciones que doblan o más: " + M.filter((x) => x >= 2).length + " de " + M.length);
console.log("  operaciones que tocan el tope de +50%: " + M.filter((x) => x >= 1.4999).length);
console.log("  operaciones que tocan el stop de −50%: " + M.filter((x) => x <= 0.5001).length);
console.log("");
