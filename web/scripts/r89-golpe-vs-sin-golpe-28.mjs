// ══ ¿EL GOLPE ELIGE EL DÍA? — LOS 28 TICKERS ══ Lester, 2026-08-27: «córrelo en los otros 27».
//
// EN TSLA salió que sí: días con golpe +10.40% (n=29) contra días sin golpe −0.51% (n=673).
// Pero eso son 14 observaciones independientes y se invierte en 2022. Aquí se repite en los 28.
//
// EL DISEÑO — las dos ramas se eligen IGUAL:
//   Para CADA día en que el ticker está bajo su media de 20, se compra el contrato de la cadena
//   más cercano al perfil MEDIANO de las señales (45% dentro del dinero, 51 días, >=$10.000),
//   del lado que se esté midiendo (put o call). La MISMA regla haya golpe o no.
//   Después se parten los días en dos: los que tuvieron un golpe que pasaba TODOS los filtros de
//   la tabla mágica de ese lado, y los que no.
//
// Salida: 8% si la cinta confirma / 12% si no · barreras +50%/−50% · tope 60 días.
// Entrada al ASK, salida al BID. Camino leído de las cadenas DÍA A DÍA y EN ORDEN.
//
// ⚠️ Se informan las dos versiones: TODAS las entradas (solapan e inflan la t) y las NO SOLAPADAS.
// ⚠️ Lo que decide es la columna SIN TSLA. Si sólo funciona en TSLA, fue el 2022-2023 de TSLA.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cargar } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const TICKERS = ["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY","TSLA",
  "BA","JPM","INTC","F","BAC","DIS","XOM","GE","PYPL","COST","CRM","ORCL","WMT","T","PFE","KO","CSCO","NKE","UNH","WBA"];
const PROF_OBJ = 0.45, DTE_OBJ = 51, COSTE_MIN = 10000;
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
// ── caché de cadenas POR TICKER, se vacía al cambiar de ticker ──
let CH = new Map(), SP = new Map();
const leer = (tk, d) => { if (CH.has(d)) return CH.get(d); const c = cad.leer(tk, d); CH.set(d, c); return c; };
const spotDe = (tk, d) => { if (SP.has(d)) return SP.get(d); const s = spotOk(leer(tk, d), d); SP.set(d, s); return s; };
// ── las señales de la tabla mágica, por ticker-día-lado ──
const MAG = (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12;
const TODO = cargar().filter(MAG);
const porTk = new Map();
for (const f of TODO) { if (!porTk.has(f.tk)) porTk.set(f.tk, []); porTk.get(f.tk).push(f); }
// ── dominancia por ticker-día ──
const DOM = new Map();
for (const f of readdirSync(FDIR)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g; if (dia < "20210101") continue;
  let L; try { L = JSON.parse(readFileSync(join(FDIR, f), "utf8")); } catch { continue; }
  let al = 0, ba = 0, n = 0;
  for (const o of L) { if (!(o.ask > 0 && o.bid > 0 && o.prima > 0)) continue;
    const c = o.precio >= o.ask, v = o.precio <= o.bid; if (!c && !v) continue;
    n++; if ((o.l === "C" && c) || (o.l === "P" && v)) al += o.prima; else ba += o.prima; }
  if (n >= 5) DOM.set(tk + "|" + dia, (al - ba) / (al + ba)); }
function elegir(tk, d, lado) {
  const ch = leer(tk, d); if (!ch) return null;
  const s = spotDe(tk, d); if (s == null) return null;
  let mejor = null, mejorD = Infinity;
  for (const exp of Object.keys(ch)) {
    const dte = dteDe(d, exp); if (dte < 5 || dte > 400) continue;
    for (const cl of Object.keys(ch[exp])) {
      if (!cl.endsWith("|" + lado)) continue;
      const K = Number(cl.slice(0, cl.indexOf("|")));
      const dentro = lado === "C" ? K < s : K > s; if (!dentro) continue;
      const q = ch[exp][cl]; if (!q || !(q[1] > 0) || !(q[0] > 0)) continue;
      if (q[1] * 100 < COSTE_MIN) continue;
      const prof = Math.abs(K - s) / s;
      const dist = Math.abs(prof - PROF_OBJ) / PROF_OBJ + Math.abs(dte - DTE_OBJ) / DTE_OBJ;
      if (dist < mejorD) { mejorD = dist; mejor = { exp, K, ask: q[1], bid: q[0], prof, dte, spot: s }; } } }
  return mejor; }
function recorrer(tk, d, c, lado, pc, dias) {
  const ds = dias.filter((x) => x > d && x <= c.exp);
  const clave = c.K + "|" + lado;
  let n = 0, ult = null;
  for (const x of ds) {
    const ch = leer(tk, x); if (!ch) continue;
    const q = ch[c.exp]?.[clave]; if (!q || !(q[0] > 0)) continue;
    n++;
    const m = q[0] / c.ask; ult = { mult: m, dSal: x };
    if (m >= 1.50) return { mult: 1.50, dSal: x };
    if (m <= 0.50) return { mult: 0.50, dSal: x };
    const s = spotDe(tk, x);
    if (s != null) { const mv = lado === "P" ? (c.spot - s) / c.spot : (s - c.spot) / c.spot;
      if (mv >= pc) return { mult: m, dSal: x }; }
    if (n >= 60) return { mult: m, dSal: x }; }
  return ult; }
function unaPorDia(L) { const g = new Map();
  for (const f of L) { if (!g.has(f.dC)) g.set(f.dC, []); g.get(f.dC).push(f); }
  return [...g.values()].map((G) => G.reduce((a, b) =>
    (Number(b.exp) > Number(a.exp) || (Number(b.exp) === Number(a.exp) && b.prof < a.prof)) ? b : a)); }
const RES = [];
process.stdout.write("\n  midiendo: ");
for (const tk of TICKERS) {
  CH = new Map(); SP = new Map();                                 // vaciar caché por ticker
  process.stdout.write(tk + " ");
  const todos = cad.dias(tk);
  const DS = todos.filter((d) => d >= "20210101" && d <= "20260819");
  const MA = new Map();
  for (const d of DS) { const i = todos.indexOf(d); if (i < 20) continue;
    const p = todos.slice(i - 20, i).map((x) => spotDe(tk, x)).filter((x) => x != null);
    const s = spotDe(tk, d);
    if (p.length >= 15 && s != null) MA.set(d, s / (p.reduce((a, b) => a + b, 0) / p.length) - 1); }
  const cand = (porTk.get(tk) || []).map((f) => ({ ...f, ma: MA.get(f.dC) ?? null }));
  const SENAL = unaPorDia(cand.filter((x) => x.ma != null && x.ma < 0));
  const diaSenal = { P: new Set(), C: new Set() };
  for (const s of SENAL) diaSenal[s.l].add(s.dC);
  const bajo = DS.filter((d) => (MA.get(d) ?? 1) < 0);
  for (const lado of ["P", "C"]) {
    for (const d of bajo) {
      const c = elegir(tk, d, lado); if (!c) continue;
      const dm = DOM.get(tk + "|" + d);
      const ac = dm == null ? 0 : (lado === "P" ? -1 : 1) * dm;
      const confirma = ac >= 0.3;
      const r = recorrer(tk, d, c, lado, confirma ? 0.08 : 0.12, todos);
      if (!r) continue;
      RES.push({ tk, dC: d, y: d.slice(0, 4), lado, mult: r.mult, dSal: r.dSal, conGolpe: diaSenal[lado].has(d) }); } } }
console.log("\n");
const media = (A) => A.reduce((s, x) => s + x, 0) / A.length;
function stats(L) { if (!L || L.length < 3) return null;
  const m = L.map((x) => x.mult); const r = media(m) - 1;
  const sd = Math.sqrt(m.reduce((s, x) => s + (x - 1 - r) ** 2, 0) / (m.length - 1));
  return { n: m.length, ret: 100 * r, gana: 100 * m.filter((x) => x > 1).length / m.length, t: r / (sd / Math.sqrt(m.length)) }; }
function sinSolape(L) { const porT = new Map();
  for (const x of L) { const k = x.tk + x.lado; if (!porT.has(k)) porT.set(k, []); porT.get(k).push(x); }
  const out = [];
  for (const G of porT.values()) { let libre = "00000000";
    for (const x of G.sort((a, b) => a.dC.localeCompare(b.dC))) { if (x.dC <= libre) continue; out.push(x); libre = x.dSal; } }
  return out; }
const fila = (nom, L) => { const s = stats(L);
  return "  " + nom.padEnd(34) + String(L.length).padStart(7) + (s ? (s.ret.toFixed(2) + "%").padStart(16) : "—".padStart(16)) +
    (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) + (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)); };
console.log("  ══ AUDIT ══");
const tP = RES.filter((x) => x.tk === "TSLA" && x.lado === "P");
const a0 = stats(tP.filter((x) => x.conGolpe)), b0 = stats(tP.filter((x) => !x.conGolpe));
console.log("  TSLA puts reproduce lo de antes: con golpe " + (a0 ? a0.ret.toFixed(2) : "—") + "% (esperado 10.40) · sin golpe " +
  (b0 ? b0.ret.toFixed(2) : "—") + "% (esperado -0.51)" + (a0 && Math.abs(a0.ret - 10.40) < 0.2 ? "  ✓" : "  ⚠"));
console.log("  entradas construidas: " + RES.length.toLocaleString("en-US") + "  ·  con golpe: " + RES.filter((x) => x.conGolpe).length);
console.log("  la MISMA regla de selección en las dos ramas · entrada al ask, salida al bid · camino en orden");
for (const lado of ["P", "C"]) {
  const L = RES.filter((x) => x.lado === lado);
  console.log("");
  console.log("  ══════ " + (lado === "P" ? "PUTS" : "CALLS") + " dentro del dinero, con la acción bajo su media de 20 ══════");
  console.log("");
  console.log("  " + "".padEnd(34) + "n".padStart(7) + "% por operación".padStart(16) + "acierta".padStart(9) + "t".padStart(8));
  console.log(fila("días CON golpe", L.filter((x) => x.conGolpe)));
  console.log(fila("días SIN golpe", L.filter((x) => !x.conGolpe)));
  const g = stats(L.filter((x) => x.conGolpe)), n = stats(L.filter((x) => !x.conGolpe));
  if (g && n) console.log("  → diferencia: " + ((g.ret - n.ret) >= 0 ? "+" : "") + (g.ret - n.ret).toFixed(2) + " puntos");
  console.log("");
  console.log("  ── LO MISMO SIN TSLA (lo que decide) ──");
  const S = L.filter((x) => x.tk !== "TSLA");
  console.log(fila("días CON golpe, sin TSLA", S.filter((x) => x.conGolpe)));
  console.log(fila("días SIN golpe, sin TSLA", S.filter((x) => !x.conGolpe)));
  const g2 = stats(S.filter((x) => x.conGolpe)), n2 = stats(S.filter((x) => !x.conGolpe));
  if (g2 && n2) console.log("  → diferencia: " + ((g2.ret - n2.ret) >= 0 ? "+" : "") + (g2.ret - n2.ret).toFixed(2) + " puntos");
  console.log("");
  console.log("  ── SIN SOLAPAR (una abierta a la vez por ticker) ──");
  const ns = sinSolape(L), nsS = sinSolape(S);
  console.log(fila("con golpe", ns.filter((x) => x.conGolpe)));
  console.log(fila("sin golpe", ns.filter((x) => !x.conGolpe)));
  console.log(fila("con golpe, SIN TSLA", nsS.filter((x) => x.conGolpe)));
  console.log(fila("sin golpe, SIN TSLA", nsS.filter((x) => !x.conGolpe)));
}
console.log("");
console.log("  ══ POR TICKER — puts, la diferencia que hace el golpe ══");
console.log("");
console.log("  " + "ticker".padEnd(8) + "n golpe".padStart(9) + "con golpe".padStart(12) + "n sin".padStart(8) + "sin golpe".padStart(12) + "diferencia".padStart(13));
let aFavor = 0, conMuestra = 0;
for (const tk of TICKERS) {
  const L = RES.filter((x) => x.tk === tk && x.lado === "P");
  const g = stats(L.filter((x) => x.conGolpe)), n = stats(L.filter((x) => !x.conGolpe));
  if (g && n) { conMuestra++; if (g.ret > n.ret) aFavor++; }
  console.log("  " + tk.padEnd(8) + String(L.filter((x) => x.conGolpe).length).padStart(9) +
    (g ? (g.ret.toFixed(2) + "%").padStart(12) : "—".padStart(12)) +
    String(L.filter((x) => !x.conGolpe).length).padStart(8) +
    (n ? (n.ret.toFixed(2) + "%").padStart(12) : "—".padStart(12)) +
    (g && n ? (((g.ret - n.ret) >= 0 ? "+" : "") + (g.ret - n.ret).toFixed(2)).padStart(13) : "—".padStart(13))); }
console.log("  → tickers con muestra en las dos ramas: " + conMuestra + "  ·  el golpe gana en: " + aFavor);
console.log("");
console.log("  ══ POR AÑO — puts, todos los tickers ══");
console.log("");
console.log("  " + "año".padEnd(8) + "n golpe".padStart(9) + "con golpe".padStart(12) + "n sin".padStart(8) + "sin golpe".padStart(12) + "diferencia".padStart(13));
for (const y of ["2021","2022","2023","2024","2025","2026"]) {
  const L = RES.filter((x) => x.y === y && x.lado === "P");
  const g = stats(L.filter((x) => x.conGolpe)), n = stats(L.filter((x) => !x.conGolpe));
  console.log("  " + y.padEnd(8) + String(L.filter((x) => x.conGolpe).length).padStart(9) +
    (g ? (g.ret.toFixed(2) + "%").padStart(12) : "—".padStart(12)) +
    String(L.filter((x) => !x.conGolpe).length).padStart(8) +
    (n ? (n.ret.toFixed(2) + "%").padStart(12) : "—".padStart(12)) +
    (g && n ? (((g.ret - n.ret) >= 0 ? "+" : "") + (g.ret - n.ret).toFixed(2)).padStart(13) : "—".padStart(13))); }
console.log("");
