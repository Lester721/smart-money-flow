// ══ ¿LA SEÑAL ELIGE EL DÍA, O VALE CUALQUIER DÍA BAJO LA MEDIA? ══
// Lester, 2026-08-27: «corre la prueba de las puts sobre TSLA».
//
// LA PREGUNTA: 29 de las 34 señales de TSLA eran PUTS dentro del dinero, y dieron +11.34% por
// operación. Pero TSLA cayó un 74% en el período. ¿La señal eligió CUÁNDO, o cualquier put dentro
// del dinero sobre TSLA bajo su media habría funcionado igual?
//
// EL DISEÑO — la clave es que las dos ramas se elijan IGUAL:
//   Para CADA día en que TSLA está bajo su media de 20, se compra el contrato de la cadena más
//   cercano al perfil MEDIANO de las señales (45% dentro del dinero, 51 días, >=$10.000).
//   La MISMA regla de selección haya golpe o no. Después se parten los días en dos:
//     · los que tuvieron un golpe que pasaba todos los filtros de la tabla mágica
//     · los que no
//   Si las dos ramas rinden igual, el golpe no elige nada.
//
// Salida idéntica: 8% si la cinta confirma / 12% si no · barreras +50%/−50% · tope 60 días.
// Entrada al ASK, salida al BID. Camino leído de las cadenas DÍA A DÍA y EN ORDEN, sin resúmenes.
//
// ⚠️ Las entradas solapadas inflan la t (son la misma apuesta repetida). Se informan las dos
//    versiones: TODOS los días, y sólo las NO SOLAPADAS (una abierta a la vez).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cargar } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const TK = "TSLA";
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
const SM = new Map();
const spotDe = (t, d) => { const k = t + d; if (SM.has(k)) return SM.get(k); const s = spotOk(cad.leer(t, d), d); SM.set(k, s); return s; };
const DS = cad.dias(TK).filter((d) => d >= "20210101" && d <= "20260819");
// media de 20
const MA = new Map();
{ const todos = cad.dias(TK);
  for (const d of DS) { const i = todos.indexOf(d);
    if (i < 20) continue;
    const p = todos.slice(i - 20, i).map((x) => spotDe(TK, x)).filter((x) => x != null);
    const s = spotDe(TK, d);
    if (p.length >= 15 && s != null) MA.set(d, s / (p.reduce((a, b) => a + b, 0) / p.length) - 1); } }
// dominancia de la cinta
const DOM = new Map();
for (const f of readdirSync(FDIR)) {
  const g = new RegExp("^" + TK + "_d(\\d{8})\\.json$").exec(f); if (!g) continue;
  const dia = g[1]; if (dia < "20210101") continue;
  let L; try { L = JSON.parse(readFileSync(join(FDIR, f), "utf8")); } catch { continue; }
  let al = 0, ba = 0, n = 0;
  for (const o of L) { if (!(o.ask > 0 && o.bid > 0 && o.prima > 0)) continue;
    const c = o.precio >= o.ask, v = o.precio <= o.bid; if (!c && !v) continue;
    n++; if ((o.l === "C" && c) || (o.l === "P" && v)) al += o.prima; else ba += o.prima; }
  if (n >= 5) DOM.set(dia, (al - ba) / (al + ba)); }
// ── los días que la tabla mágica marcó como señal de PUT en TSLA ──
const MAG = (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12;
const cand = cargar().filter((f) => f.tk === TK).filter(MAG);
for (const f of cand) f.ma = MA.get(f.dC) ?? null;
function unaPorDia(L) { const g = new Map();
  for (const f of L) { const k = f.dC; if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
  return [...g.values()].map((G) => G.reduce((a, b) =>
    (Number(b.exp) > Number(a.exp) || (Number(b.exp) === Number(a.exp) && b.prof < a.prof)) ? b : a)); }
const SENAL = unaPorDia(cand.filter((x) => x.ma != null && x.ma < 0));
const diaSenalPut = new Set(SENAL.filter((x) => x.l === "P").map((x) => x.dC));
// ── selección de contrato: la MISMA regla haya golpe o no ──
function elegirPut(d) {
  const ch = cad.leer(TK, d); if (!ch) return null;
  const s = spotDe(TK, d); if (s == null) return null;
  let mejor = null, mejorD = Infinity;
  for (const exp of Object.keys(ch)) {
    const dte = dteDe(d, exp); if (dte < 5 || dte > 400) continue;
    for (const cl of Object.keys(ch[exp])) {
      if (!cl.endsWith("|P")) continue;
      const K = Number(cl.slice(0, cl.indexOf("|")));
      if (K <= s) continue;                                     // dentro del dinero para una put
      const q = ch[exp][cl]; if (!q || !(q[1] > 0) || !(q[0] > 0)) continue;
      if (q[1] * 100 < COSTE_MIN) continue;
      const prof = (K - s) / s;
      const dist = Math.abs(prof - PROF_OBJ) / PROF_OBJ + Math.abs(dte - DTE_OBJ) / DTE_OBJ;
      if (dist < mejorD) { mejorD = dist; mejor = { exp, K, ask: q[1], bid: q[0], prof, dte, spot: s }; } } }
  return mejor; }
function recorrer(d, c, pc) {
  const ds = cad.dias(TK).filter((x) => x > d && x <= c.exp);
  const clave = c.K + "|P";
  let n = 0, ult = null;
  for (const x of ds) {
    const ch = cad.leer(TK, x); if (!ch) continue;
    const q = ch[c.exp]?.[clave]; if (!q || !(q[0] > 0)) continue;
    n++;
    const m = q[0] / c.ask; ult = { mult: m, dSal: x, dias: n };
    if (m >= 1.50) return { mult: 1.50, dSal: x, dias: n };
    if (m <= 0.50) return { mult: 0.50, dSal: x, dias: n };
    const s = spotDe(TK, x);
    if (s != null && (c.spot - s) / c.spot >= pc) return { mult: m, dSal: x, dias: n };
    if (n >= 60) return { mult: m, dSal: x, dias: n }; }
  return ult; }
// ── construir TODOS los días bajo la media ──
const TODOS = [];
for (const d of DS) {
  const m = MA.get(d); if (m == null || m >= 0) continue;
  const c = elegirPut(d); if (!c) continue;
  const dm = DOM.get(d);
  const confirma = (dm == null ? 0 : -dm) >= 0.3;               // put: dominancia bajista a favor
  const r = recorrer(d, c, confirma ? 0.08 : 0.12);
  if (!r) continue;
  TODOS.push({ dC: d, y: d.slice(0, 4), ...c, confirma, mult: r.mult, dSal: r.dSal, dias: r.dias,
               conGolpe: diaSenalPut.has(d), ma: m }); }
const media = (A) => A.reduce((s, x) => s + x, 0) / A.length;
function stats(L) { if (!L || L.length < 3) return null;
  const m = L.map((x) => x.mult); const r = media(m) - 1;
  const sd = Math.sqrt(m.reduce((s, x) => s + (x - 1 - r) ** 2, 0) / (m.length - 1));
  return { n: m.length, ret: 100 * r, gana: 100 * m.filter((x) => x > 1).length / m.length, t: r / (sd / Math.sqrt(m.length)) }; }
/** deja sólo entradas no solapadas: no se abre una nueva hasta cerrar la anterior */
function sinSolape(L) { const out = []; let libre = "00000000";
  for (const x of [...L].sort((a, b) => a.dC.localeCompare(b.dC))) {
    if (x.dC <= libre) continue; out.push(x); libre = x.dSal; }
  return out; }
console.log("");
console.log("  ══ AUDIT ══");
console.log("  días de TSLA en el período: " + DS.length + "  ·  con media de 20 calculable: " + MA.size);
console.log("  días BAJO la media: " + DS.filter((d) => (MA.get(d) ?? 1) < 0).length);
console.log("  de esos, con contrato válido y camino: " + TODOS.length);
console.log("  señales de la tabla mágica en TSLA: " + SENAL.length + " (esperado 34)" + (SENAL.length === 34 ? " ✓" : " ⚠") +
  "  ·  de ellas PUTS: " + diaSenalPut.size + " (esperado 29)" + (diaSenalPut.size === 29 ? " ✓" : " ⚠"));
console.log("  días de TODOS que coinciden con señal de put: " + TODOS.filter((x) => x.conGolpe).length + " de " + diaSenalPut.size);
console.log("  ⚠️ la MISMA regla de selección en las dos ramas: put dentro del dinero, más cercana a 45% / 51 días / ≥$10.000");
console.log("  ⚠️ entrada al ASK, salida al BID; camino leído de las cadenas día a día, en orden");
const conG = TODOS.filter((x) => x.conGolpe), sinG = TODOS.filter((x) => !x.conGolpe);
const a = stats(conG), b = stats(sinG), c = stats(TODOS);
console.log("");
console.log("  ══ ¿ELIGE ALGO EL GOLPE? — puts dentro del dinero sobre TSLA bajo su media ══");
console.log("");
console.log("  " + "".padEnd(36) + "n".padStart(6) + "% por operación".padStart(17) + "acierta".padStart(9) + "t".padStart(8));
console.log("  " + "días CON golpe (la señal)".padEnd(36) + String(a?.n ?? 0).padStart(6) + (a ? (a.ret.toFixed(2) + "%").padStart(17) : "—".padStart(17)) + (a ? (a.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) + (a ? a.t.toFixed(2).padStart(8) : "—".padStart(8)));
console.log("  " + "días SIN golpe".padEnd(36) + String(b?.n ?? 0).padStart(6) + (b ? (b.ret.toFixed(2) + "%").padStart(17) : "—".padStart(17)) + (b ? (b.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) + (b ? b.t.toFixed(2).padStart(8) : "—".padStart(8)));
console.log("  " + "TODOS los días bajo la media".padEnd(36) + String(c?.n ?? 0).padStart(6) + (c ? (c.ret.toFixed(2) + "%").padStart(17) : "—".padStart(17)) + (c ? (c.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) + (c ? c.t.toFixed(2).padStart(8) : "—".padStart(8)));
if (a && b) { const dif = a.ret - b.ret;
  console.log("");
  console.log("  → diferencia: " + (dif >= 0 ? "+" : "") + dif.toFixed(2) + " puntos a favor del golpe");
  console.log("  → " + (Math.abs(dif) < 2 ? "🔴 EL GOLPE NO ELIGE EL DÍA. Vale cualquier día bajo la media."
    : dif > 0 ? "🟢 el golpe SÍ elige el día" : "🔴 el golpe elige PEOR que el azar")); }
console.log("");
console.log("  ⚠️ las cifras de arriba SOLAPAN (misma apuesta repetida) y eso infla la t.");
console.log("  ══ LO MISMO, SIN SOLAPAR — una posición abierta a la vez ══");
console.log("");
const nsT = sinSolape(TODOS), nsS = sinSolape(conG), nsN = sinSolape(sinG);
console.log("  " + "".padEnd(36) + "n".padStart(6) + "% por operación".padStart(17) + "acierta".padStart(9) + "t".padStart(8));
for (const [nom, L] of [["sólo los días CON golpe", nsS], ["sólo los días SIN golpe", nsN], ["TODOS los días bajo la media", nsT]]) {
  const s = stats(L);
  console.log("  " + nom.padEnd(36) + String(L.length).padStart(6) + (s ? (s.ret.toFixed(2) + "%").padStart(17) : "—".padStart(17)) + (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) + (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8))); }
console.log("");
console.log("  ══ POR AÑO — todos los días bajo la media ══");
console.log("");
console.log("  " + "año".padEnd(8) + "n".padStart(6) + "% por op".padStart(12) + "acierta".padStart(9) + "t".padStart(8) + "   con golpe / sin golpe");
for (const y of ["2021","2022","2023","2024","2025","2026"]) {
  const L = TODOS.filter((x) => x.y === y); const s = stats(L);
  const g = stats(L.filter((x) => x.conGolpe)), n = stats(L.filter((x) => !x.conGolpe));
  console.log("  " + y.padEnd(8) + String(L.length).padStart(6) + (s ? (s.ret.toFixed(2) + "%").padStart(12) : "—".padStart(12)) +
    (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) + (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)) +
    "   " + (g ? g.ret.toFixed(1) + "%" : "—") + " / " + (n ? n.ret.toFixed(1) + "%" : "—")); }
console.log("");
console.log("  ══ CONTRASTE: las señales REALES con SU propio contrato ══");
console.log("");
const realPuts = SENAL.filter((x) => x.l === "P").map((x) => {
  const dm = DOM.get(x.dia); const ac = dm == null ? 0 : -dm;
  const confirma = ac >= 0.3 || (x.golpes >= 2 && x.golpes < 10);
  let n = 0, ult = null;
  for (const [d, bid] of x.camino) { n++; const m = bid / x.ask; ult = { mult: m };
    if (m >= 1.50) { ult = { mult: 1.50 }; break; } if (m <= 0.50) { ult = { mult: 0.50 }; break; }
    const s = spotDe(TK, d);
    if (s != null && (x.spot - s) / x.spot >= (confirma ? 0.08 : 0.12)) { ult = { mult: m }; break; }
    if (n >= 60) break; }
  return { mult: ult.mult }; });
const sr = stats(realPuts);
console.log("  las 29 puts de la señal, con el contrato que ELIGIÓ la regla: " +
  sr.ret.toFixed(2) + "% · acierta " + sr.gana.toFixed(0) + "% · t=" + sr.t.toFixed(2));
console.log("  (arriba, esos mismos días con el contrato ESTÁNDAR: " + (a ? a.ret.toFixed(2) + "%" : "—") + ")");
console.log("");
