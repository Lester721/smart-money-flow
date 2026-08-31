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
// ══ ¿ES UNA ESTRATEGIA O SON TRES GOLPES DE SUERTE? ══ Lester, 2026-08-27.
// Ya sabíamos que "el 38% del dinero está en 3 operaciones". Aquí se mide en serio:
// quitar las mejores, dejar fuera cada año, dejar fuera cada ticker.
const an = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / 5.63) - 1);
const med = (A) => { const B = [...A].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
function cuenta({ L, capital, tipo = 0.033 }) {
  const intD = Math.pow(1 + tipo, 1 / 252) - 1;
  let caja = capital, ab = [], tom = [], pico = capital, peor = 0;
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  for (const hoy of DIAS) {
    caja *= (1 + intD);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    for (const x of (porDia.get(hoy) || [])) {
      if (ab.length >= 4) continue;
      const tope = (caja + inv()) * 0.25 * (x.confirma ? 2 : 1);
      const n = Math.floor(Math.min(tope, caja) / (x.ask * 100));
      if (n < 1) continue;
      const dinero = n * x.ask * 100;
      caja -= dinero; ab.push({ ...x, dinero }); tom.push({ ...x, dinero, gana: dinero * (x.mult - 1) }); }
    const v = caja + inv();
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  let fin = caja; for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, caida: 100 * peor, tom }; }
function banda(L, base) { const A = [], paso = base * 0.0083;
  for (let c = base * 0.917; c <= base * 1.084; c += paso) A.push(an(cuenta({ L, capital: c }).final, c));
  return med(A); }
const base = cuenta({ L: T, capital: 60000 });
const ops = [...base.tom].sort((a, b) => b.gana - a.gana);
const totalG = ops.reduce((s, x) => s + x.gana, 0);
console.log("");
console.log("  ══ AUDIT ══");
console.log("  reproduce lo de antes: " + D(base.final) + " (esperado $254,097)" + (Math.abs(base.final - 254097) < 3 ? "  ✓" : "  ⚠"));
console.log("  operaciones ejecutadas: " + ops.length + "  ·  suma de ganancias/pérdidas: " + D(totalG) +
  "  ·  $60,000 + eso = " + D(60000 + totalG) + " (falta " + D(base.final - 60000 - totalG) + " de intereses)");
console.log("");
console.log("  ══ (1) ¿DE DÓNDE SALE EL DINERO? ══");
console.log("");
console.log("  " + "".padEnd(28) + "aporta".padStart(14) + "% del total".padStart(13));
let ac = 0;
for (const k of [1, 2, 3, 5, 10]) { ac = ops.slice(0, k).reduce((s, x) => s + x.gana, 0);
  console.log("  " + ("las " + k + " mejores").padEnd(28) + D(ac).padStart(14) + ((100 * ac / totalG).toFixed(0) + "%").padStart(13)); }
const gan = ops.filter((x) => x.gana > 0), per = ops.filter((x) => x.gana <= 0);
console.log("  " + ("ganadoras (" + gan.length + ")").padEnd(28) + D(gan.reduce((s, x) => s + x.gana, 0)).padStart(14));
console.log("  " + ("perdedoras (" + per.length + ")").padEnd(28) + D(per.reduce((s, x) => s + x.gana, 0)).padStart(14));
console.log("");
console.log("  las 5 mejores, una por una:");
for (const x of ops.slice(0, 5)) console.log("    " + x.dC + "  " + x.tk.padEnd(5) + x.l + " " + String(x.K).padEnd(7) +
  "vence " + x.exp + "   puso " + D(x.dinero).padStart(9) + "   ganó " + D(x.gana).padStart(9) + "   x" + x.mult.toFixed(2));
console.log("");
console.log("  ══ (2) QUITAR LAS MEJORES — ¿qué queda? ══");
console.log("");
console.log("  " + "".padEnd(30) + "tu cuenta".padStart(11) + "la grande".padStart(11));
for (const k of [0, 1, 2, 3, 5, 10]) {
  const fuera = new Set(ops.slice(0, k).map((x) => x.tk + x.dC + x.K + x.exp));
  const L = T.filter((x) => !fuera.has(x.tk + x.dC + x.K + x.exp));
  console.log("  " + (k === 0 ? "la estrategia entera" : "sin las " + k + " mejores").padEnd(30) +
    (banda(L, 60000).toFixed(1) + "%").padStart(11) + (banda(L, 300000).toFixed(1) + "%").padStart(11)); }
console.log("  (listón: comprar SPY y dormir = 15.4% al año)");
console.log("");
console.log("  ══ (3) DEJAR FUERA UN AÑO ENTERO ══");
console.log("");
console.log("  " + "".padEnd(30) + "tu cuenta".padStart(11) + "la grande".padStart(11) + "señales que quedan".padStart(20));
for (const y of ["2021", "2022", "2023", "2024", "2025", "2026"]) {
  const L = T.filter((x) => x.y !== y);
  console.log("  " + ("sin " + y).padEnd(30) + (banda(L, 60000).toFixed(1) + "%").padStart(11) +
    (banda(L, 300000).toFixed(1) + "%").padStart(11) + String(L.length).padStart(20)); }
console.log("");
console.log("  ══ (4) DEJAR FUERA UN TICKER ENTERO ══");
console.log("");
const tks = [...new Set(T.map((x) => x.tk))].sort();
console.log("  " + "".padEnd(30) + "tu cuenta".padStart(11) + "la grande".padStart(11) + "señales que quedan".padStart(20));
for (const t of tks) { const L = T.filter((x) => x.tk !== t);
  console.log("  " + ("sin " + t).padEnd(30) + (banda(L, 60000).toFixed(1) + "%").padStart(11) +
    (banda(L, 300000).toFixed(1) + "%").padStart(11) + String(L.length).padStart(20)); }
console.log("");
