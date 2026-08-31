// ══ LA DESNUDA DE 90 DÍAS, CON EL EFECTIVO EN SPY ══ Lester, 2026-08-28.
//
// ⚠️ LA MITAD B NO SE TOCA.
//
// La regla: calls · 15% dentro del dinero · contrato de ~120 días y >= $5.000 · la acción bajo
// su media de 20 · golpe de call de $500k+ al ask tras las 14:00 · 12x el OI de la víspera ·
// aguantar 90 días · suelo 0,50x · SIN tope de ganancia · 6 huecos al 15%.
//
// Lo único que cambia aquí: el dinero que espera. Antes al 3,3% (Gold), ahora en SPY.
// Con ~8,5 operaciones al año que duran 90 días hay ~3 posiciones abiertas de media, o sea
// ~45% invertido: más de la mitad del dinero está parado y eso pesa.
//
// ⚠️ El dividendo de SPY (1,3%) es CIFRA PUBLICADA, no medida. Se enseña con y sin.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const A = ["AMAT","ASML","AVGO","BA","COIN","COST","DELL","JPM","META","MRVL","NVDA","PFE","PYPL","QQQ","STX","UNH"];
const PROF_OBJ = 0.15, DTE_OBJ = 120, COSTE_MIN = 5000, SUELO = 0.50, PLAZO = 90;
const HUECOS = 6, TAM = 0.15, ANOS = 5.63, DIV_SPY = 0.013;
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const cad = abrir("cadenas", { callado: true });
const oiA = abrir("oi-ancho", { callado: true });
const FDIR = join(CACHE, "flujo-limpio");
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
const GOLPE = new Map();
for (const f of readdirSync(FDIR)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g;
  if (!A.includes(tk) || dia < "20210101" || dia > "20260819") continue;
  let L; try { L = JSON.parse(readFileSync(join(FDIR, f), "utf8")); } catch { continue; }
  let hay = false; const pc = new Map();
  for (const o of L) {
    if (o.l !== "C" || !(o.ask > 0 && o.precio >= o.ask) || o.prima < 500000) continue;
    if (o.hora && o.hora.slice(11, 16) < "14:00") continue;
    hay = true; const k = o.exp + "|" + o.K; pc.set(k, (pc.get(k) || 0) + o.tam); }
  if (hay) GOLPE.set(tk + "|" + dia, pc); }
function larga(tk, d) {
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
process.stdout.write("\n  construyendo: ");
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
  const iDe = new Map(); todos.forEach((d, i) => iDe.set(d, i));
  for (const d of DS) {
    const ma = MA.get(d); if (ma == null || ma >= 0) continue;
    const i = iDe.get(d); const ayer = i > 0 ? todos[i - 1] : null;
    const g = ayer ? GOLPE.get(tk + "|" + ayer) : null; if (!g) continue;
    const oiV = i > 1 ? oiA.leer(tk, todos[i - 2]) : null;
    let vsOI = 0;
    if (oiV) for (const [k, tam] of g) { const [exp, K] = k.split("|");
      const o = oiV[exp] && oiV[exp][K + "|C"]; const n = Array.isArray(o) ? o[0] : o;
      if (n > 0) vsOI = Math.max(vsOI, tam / n); }
    if (!(vsOI >= 12)) continue;
    const L = larga(tk, d); if (!L) continue;
    const cam = [];
    for (const x of todos.filter((y) => y > d && y <= L.exp)) {
      const ch = leer(tk, x); if (!ch) continue;
      const q = ch[L.exp] && ch[L.exp][L.K + "|C"]; if (!q || !(q[0] > 0)) continue;
      cam.push([x, q[0] / L.ask]); if (cam.length >= PLAZO) break; }
    if (cam.length < 15) continue;
    let r = null;
    for (const [x, m] of cam) { r = { mult: m, dSal: x }; if (m <= SUELO) break; }
    OPS.push({ tk, dC: d, y: d.slice(0, 4), ma, coste: L.ask * 100, mult: r.mult, dSal: r.dSal }); } }
console.log("\n");
// precio de SPY
CH = new Map(); SP = new Map();
const DIAS = cad.dias("SPY").filter((d) => d >= "20210101" && d <= "20260819");
const pSPY = new Map();
for (const d of DIAS) { const s = spotDe("SPY", d); if (s > 0) pSPY.set(d, s); }
const DD = DIAS.filter((d) => pSPY.has(d));
const med = (X) => { const B = [...X].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
const an = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / ANOS) - 1);
/** modo: 'efectivo' (3,3%) o 'spy' (el ocioso en SPY, con dividendo) */
function cuenta({ L = OPS, capital, modo = "spy", conDiv = true, hasta = null }) {
  const intD = Math.pow(1.033, 1 / 252) - 1;
  const divD = conDiv ? Math.pow(1 + DIV_SPY, 1 / 252) - 1 : 0;
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
      if (ab.length >= HUECOS) break;
      if (ab.some((o) => o.tk === x.tk)) continue;
      const patr = caja + acc * p + inv();
      const tope = patr * TAM;
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
const spySolo = 60000 * (pSPY.get(DD[DD.length - 1]) / pSPY.get(DD[0])) * Math.pow(1 + DIV_SPY, ANOS);
const ctrl = cuenta({ L: [], capital: 60000, modo: "spy" });
console.log("  control sin señales = SPY con dividendos: " + D(ctrl.final) + " vs " + D(spySolo) +
  (Math.abs(ctrl.final - spySolo) < 500 ? "  ✓" : "  ⚠"));
console.log("  operaciones disponibles: " + OPS.length + "   ·   " + (OPS.length / ANOS).toFixed(1) + " al año");
console.log("");
console.log("  ══ EL EFECTIVO EN SPY vs AL 3,3% ══   mediana de 21 capitales · 6 huecos al 15%");
console.log("");
console.log("  " + "".padEnd(30) + "al año".padStart(10) + "caída".padStart(9) + "ops".padStart(6) + "invertido".padStart(11));
for (const [nom, modo] of [["efectivo al 3,3% (Gold)", "efectivo"], ["el ocioso en SPY", "spy"]]) {
  const b = banda({ modo }, 60000); const q = cuenta({ capital: 60000, modo });
  console.log("  " + nom.padEnd(30) + (b.a.toFixed(1) + "%").padStart(10) + ("−" + b.c.toFixed(0) + "%").padStart(9) +
    String(q.tom.length).padStart(6) + (q.invertido.toFixed(0) + "%").padStart(11)); }
console.log("  " + "comprar SPY y dormir".padEnd(30) + (an(spySolo, 60000).toFixed(1) + "%").padStart(10) + "−25%".padStart(9));
for (const modo of ["efectivo", "spy"]) {
  const q = cuenta({ capital: 60000, modo });
  console.log("");
  console.log("  ── " + (modo === "spy" ? "CON EL EFECTIVO EN SPY" : "con el efectivo al 3,3%") + " ──");
  console.log("  " + "año".padEnd(7) + "valor".padStart(13) + "% del año".padStart(11) + "ops".padStart(6) + "gana".padStart(7) + "pierde".padStart(8));
  let v0 = 60000;
  for (const y of ["2021","2022","2023","2024","2025","2026"]) {
    const fin = [...DD].reverse().find((d) => d.startsWith(y)); if (!fin) continue;
    const r = cuenta({ L: OPS.filter((x) => x.dC <= fin), capital: 60000, modo, hasta: fin });
    const del = q.tom.filter((x) => x.dC.startsWith(y));
    console.log("  " + y.padEnd(7) + D(r.final).padStart(13) +
      (((r.final / v0 - 1) >= 0 ? "+" : "−") + Math.abs(100 * (r.final / v0 - 1)).toFixed(0) + "%").padStart(11) +
      String(del.length).padStart(6) + String(del.filter((x) => x.gana > 0).length).padStart(7) +
      String(del.filter((x) => x.gana <= 0).length).padStart(8));
    v0 = r.final; }
  const g = q.tom.filter((x) => x.gana > 0).length;
  console.log("  TOTAL: " + D(q.final) + "  ·  " + an(q.final, 60000).toFixed(1) + "% al año  ·  caída −" + q.caida.toFixed(0) +
    "%  ·  " + q.tom.length + " ops  ·  acierta " + (100 * g / Math.max(1, q.tom.length)).toFixed(0) + "%"); }
console.log("");
console.log("  ⚠️ MITAD A, y afinado sobre ella. El examen NO se ha hecho.");
console.log("");
