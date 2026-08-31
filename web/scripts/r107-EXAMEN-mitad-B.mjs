// ╔════════════════════════════════════════════════════════════════════════════════════════════╗
// ║  EL EXAMEN — LA MITAD B                                    Lester, 2026-08-28              ║
// ╚════════════════════════════════════════════════════════════════════════════════════════════╝
//
// La regla se CONGELA tal como salió de afinar la mitad A. No se toca nada aquí.
//
//   calls · 15% dentro del dinero · contrato de ~120 días y >= $5.000
//   la acción por debajo de su media de 20 días
//   golpe de CALL de $500.000 o más, al ask o por encima, después de las 14:00
//   12x el interés abierto de la víspera
//   aguantar 90 días · suelo 0,50x · SIN tope de ganancia
//   6 huecos al 15% · una posición por ticker · el efectivo ocioso en SPY
//
// CRITERIOS ESCRITOS ANTES DE CORRER:
//   t > 2 y positivo          → el efecto es real y no era la mitad A
//   positivo con t entre 1 y 2 → plausible, insuficiente
//   t < 1 o negativo          → era la mitad A
//   menos de 15 señales       → sin muestra: no es «falla», es que no hay examen
//
// ⚠️ SPY está en la mitad B y además es el aparcadero. La regla no lo excluye, así que se deja
//    y se dice. Se enseña también el resultado sin SPY, por si acaso.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const MITAD_A = ["AMAT","ASML","AVGO","BA","COIN","COST","DELL","JPM","META","MRVL","NVDA","PFE","PYPL","QQQ","STX","UNH"];
const MITAD_B = ["AAPL","AMD","AMZN","ARM","BABA","BAC","CRM","CSCO","DIS","F","GE","GOOGL","GS","INTC","KO",
                 "MSFT","MSTR","MU","NFLX","NKE","ORCL","PLTR","SHOP","SPY","T","TSM","UBER","WBA","WDC","WMT","XOM"];
const PROF_OBJ = 0.15, DTE_OBJ = 120, COSTE_MIN = 5000, SUELO = 0.50, PLAZO = 90;
const HUECOS = 6, TAM = 0.15, ANOS = 5.63, DIV_SPY = 0.013;
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const cad = abrir("cadenas", { callado: true });
const oiA = abrir("oi-ancho", { callado: true });
const FDIR = join(CACHE, "flujo-limpio");
const ms = (d) => Date.parse(d.slice(0,4) + "-" + d.slice(4,6) + "-" + d.slice(6,8) + "T00:00:00Z");
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
let CH = new Map(), SP = new Map();
const leer = (tk, d) => { const k = tk + "|" + d; if (CH.has(k)) return CH.get(k); const c = cad.leer(tk, d); CH.set(k, c); return c; };
function spotOk(c, hoy) { if (!c) return null; let e0 = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; e0 = e; } }
  if (!e0) return null; const g = c[e0]; let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) { if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[k + "|P"]; if (!p) continue;
    const d = Math.abs((g[cl][0] + g[cl][1]) / 2 - (p[0] + p[1]) / 2); if (d < dm) { dm = d; K = k; } }
  if (K == null) return null; const C = g[K + "|C"], P = g[K + "|P"];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2; return s > 0 ? s : null; }
const spotDe = (tk, d) => { const k = tk + "|" + d; if (SP.has(k)) return SP.get(k); const s = spotOk(leer(tk, d), d); SP.set(k, s); return s; };
const GOLPE = new Map();
const TODOS_TK = new Set([...MITAD_A, ...MITAD_B]);
for (const f of readdirSync(FDIR)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g;
  if (!TODOS_TK.has(tk) || dia < "20210101" || dia > "20260819") continue;
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
function construir(TK, etiqueta) {
  const out = [];
  process.stdout.write("\n  " + etiqueta + ": ");
  for (const tk of TK) {
    process.stdout.write(tk + " ");
    CH = new Map(); SP = new Map();     // vaciar la cache al cambiar de ticker: con 47 no cabe en memoria
    const todos = cad.dias(tk);
    const iDe = new Map(); todos.forEach((d, i) => iDe.set(d, i));
    for (const d of todos.filter((x) => x >= "20210101" && x <= "20260819")) {
      const i = iDe.get(d);
      if (i < 20) continue;
      const p = todos.slice(i - 20, i).map((x) => spotDe(tk, x)).filter((x) => x != null);
      const s = spotDe(tk, d);
      if (p.length < 15 || s == null) continue;
      const ma = s / (p.reduce((a, b) => a + b, 0) / p.length) - 1;
      if (ma >= 0) continue;
      const ayer = todos[i - 1];
      const g = GOLPE.get(tk + "|" + ayer); if (!g) continue;
      const oiV = oiA.leer(tk, todos[i - 2]);
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
      out.push({ tk, dC: d, y: d.slice(0, 4), ma, coste: L.ask * 100, mult: r.mult, dSal: r.dSal }); } }
  return out; }
const OPS_A = construir(MITAD_A, "mitad A (referencia)");
const OPS_B = construir(MITAD_B, "MITAD B (el examen)");
console.log("\n");
const media = (X) => X.reduce((s, x) => s + x, 0) / X.length;
const med = (X) => { const B = [...X].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
function stats(L) { if (!L || L.length < 3) return null;
  const m = L.map((x) => x.mult); const r = media(m) - 1;
  const sd = Math.sqrt(m.reduce((s, x) => s + (x - 1 - r) ** 2, 0) / (m.length - 1));
  return { n: m.length, ret: 100 * r, gana: 100 * m.filter((x) => x > 1).length / m.length,
           t: r / (sd / Math.sqrt(m.length)), dobla: 100 * m.filter((x) => x >= 2).length / m.length }; }
function sinSolape(L) { const g = new Map();
  for (const x of L) { if (!g.has(x.tk)) g.set(x.tk, []); g.get(x.tk).push(x); }
  const out = [];
  for (const G of g.values()) { let libre = "00000000";
    for (const x of G.sort((a, b) => a.dC.localeCompare(b.dC))) { if (x.dC <= libre) continue; out.push(x); libre = x.dSal; } }
  return out; }
const NA = sinSolape(OPS_A), NB = sinSolape(OPS_B), NBsinSPY = sinSolape(OPS_B.filter((x) => x.tk !== "SPY"));
const sA = stats(NA), sB = stats(NB), sBs = stats(NBsinSPY), sT = stats([...NA, ...NB]);
console.log("  ══ AUDIT ══");
console.log("  mitad A reproduce lo de antes (n=53, +37.74%, 55%, t=2.83): n=" + NA.length + ", " +
  (sA ? sA.ret.toFixed(2) + "%, " + sA.gana.toFixed(0) + "%, t=" + sA.t.toFixed(2) : "—") +
  (sA && Math.abs(sA.ret - 37.74) < 0.5 ? "  ✓" : "  ⚠"));
console.log("  señales en la mitad B: " + NB.length + " (sin solapar) de " + OPS_B.length + " brutas");
console.log("");
console.log("  ══════════════ EL VEREDICTO ══════════════");
console.log("");
console.log("  " + "".padEnd(34) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
console.log("  " + "mitad A (donde se afinó)".padEnd(34) + String(NA.length).padStart(6) +
  (sA ? (sA.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (sA ? (sA.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
  (sA ? sA.t.toFixed(2).padStart(8) : "—".padStart(8)) + (sA ? (sA.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9)));
console.log("  " + "🎯 MITAD B (el examen)".padEnd(34) + String(NB.length).padStart(6) +
  (sB ? (sB.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (sB ? (sB.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
  (sB ? sB.t.toFixed(2).padStart(8) : "—".padStart(8)) + (sB ? (sB.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9)));
console.log("  " + "   mitad B, sin SPY".padEnd(34) + String(NBsinSPY.length).padStart(6) +
  (sBs ? (sBs.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (sBs ? (sBs.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
  (sBs ? sBs.t.toFixed(2).padStart(8) : "—".padStart(8)) + (sBs ? (sBs.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9)));
console.log("  " + "las dos juntas (47 tickers)".padEnd(34) + String(NA.length + NB.length).padStart(6) +
  (sT ? (sT.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (sT ? (sT.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
  (sT ? sT.t.toFixed(2).padStart(8) : "—".padStart(8)) + (sT ? (sT.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9)));
console.log("");
if (!sB || NB.length < 15) console.log("  → ⛔ SIN MUESTRA (" + NB.length + " señales). No es «falla», es que no hay examen.");
else console.log("  → " + (sB.t > 2 && sB.ret > 0 ? "✅ PASA — t>2 y positivo. El efecto no era la mitad A."
  : sB.ret > 0 && sB.t >= 1 ? "🟡 PLAUSIBLE pero insuficiente — positivo con t entre 1 y 2."
  : "🔴 NO PASA — era la mitad A."));
console.log("");
console.log("  ══ POR TICKER (mitad B) ══");
console.log("");
let conM = 0, pos = 0;
for (const tk of MITAD_B) {
  const L = NB.filter((x) => x.tk === tk); if (!L.length) continue;
  const s = stats(L); if (s) { conM++; if (s.ret > 0) pos++; }
  console.log("  " + tk.padEnd(7) + String(L.length).padStart(4) + (s ? ("  " + s.ret.toFixed(2) + "%  acierta " + s.gana.toFixed(0) + "%") : "  (menos de 3)")); }
console.log("  → tickers con al menos 3 señales: " + conM + "  ·  positivos: " + pos);
console.log("");
console.log("  ══ POR AÑO (mitad B) ══");
console.log("");
console.log("  " + "año".padEnd(8) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8));
for (const y of ["2021","2022","2023","2024","2025","2026"]) {
  const s = stats(NB.filter((x) => x.y === y));
  console.log("  " + y.padEnd(8) + String(NB.filter((x) => x.y === y).length).padStart(6) +
    (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
    (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8))); }
// ── la cuenta en la mitad B ──
CH = new Map(); SP = new Map();
const DIAS = cad.dias("SPY").filter((d) => d >= "20210101" && d <= "20260819");
const pSPY = new Map();
for (const d of DIAS) { const s = spotDe("SPY", d); if (s > 0) pSPY.set(d, s); }
const DD = DIAS.filter((d) => pSPY.has(d));
const an = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / ANOS) - 1);
function cuenta({ L, capital, hasta = null }) {
  const divD = Math.pow(1 + DIV_SPY, 1 / 252) - 1;
  const dias = hasta ? DD.filter((d) => d <= hasta) : DD;
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  let caja = capital, acc = 0, ab = [], tom = [], pico = capital, peor = 0;
  for (const hoy of dias) {
    const p = pSPY.get(hoy);
    acc *= (1 + divD);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    for (const x of (porDia.get(hoy) || []).slice().sort((a, b) => a.ma - b.ma)) {
      if (ab.length >= HUECOS) break;
      if (ab.some((o) => o.tk === x.tk)) continue;
      const patr = caja + acc * p + inv();
      const tope = patr * TAM;
      const falta = Math.min(tope, patr) - caja;
      if (falta > 0 && acc > 0) { const v = Math.min(acc, falta / p); acc -= v; caja += v * p; }
      const n = Math.floor(Math.min(tope, caja) / x.coste);
      if (n < 1) continue;
      const dinero = n * x.coste;
      caja -= dinero; ab.push({ ...x, dinero }); tom.push({ ...x, dinero, gana: dinero * (x.mult - 1) }); }
    if (caja > 0) { acc += caja / p; caja = 0; }
    const v = caja + acc * p + inv();
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  const p = pSPY.get(dias[dias.length - 1]);
  let fin = caja + acc * p; for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, caida: 100 * peor, tom }; }
function banda(L, base) { const R = [], C = [], paso = base * 0.0083;
  for (let c = base * 0.917; c <= base * 1.084; c += paso) { const q = cuenta({ L, capital: c }); R.push(an(q.final, c)); C.push(q.caida); }
  return { a: med(R), c: med(C) }; }
console.log("");
console.log("  ══ Y EN LA CUENTA ($60,000, efectivo en SPY, 6 huecos al 15%) ══");
console.log("");
console.log("  " + "".padEnd(30) + "al año".padStart(10) + "caída".padStart(9) + "ops".padStart(6));
for (const [nom, L] of [["mitad A (afinada)", OPS_A], ["🎯 MITAD B (el examen)", OPS_B],
                        ["las dos juntas", [...OPS_A, ...OPS_B].sort((a, b) => a.dC.localeCompare(b.dC))]]) {
  const b = banda(L, 60000); const q = cuenta({ L, capital: 60000 });
  console.log("  " + nom.padEnd(30) + (b.a.toFixed(1) + "%").padStart(10) + ("−" + b.c.toFixed(0) + "%").padStart(9) + String(q.tom.length).padStart(6)); }
const spySolo = 60000 * (pSPY.get(DD[DD.length - 1]) / pSPY.get(DD[0])) * Math.pow(1 + DIV_SPY, ANOS);
console.log("  " + "comprar SPY y dormir".padEnd(30) + (an(spySolo, 60000).toFixed(1) + "%").padStart(10) + "−25%".padStart(9));
const qB = cuenta({ L: OPS_B, capital: 60000 });
console.log("");
console.log("  ── la mitad B, año por año ──");
console.log("  " + "año".padEnd(7) + "valor".padStart(13) + "% del año".padStart(11) + "ops".padStart(6) + "gana".padStart(7) + "pierde".padStart(8));
let v0 = 60000;
for (const y of ["2021","2022","2023","2024","2025","2026"]) {
  const fin = [...DD].reverse().find((d) => d.startsWith(y)); if (!fin) continue;
  const r = cuenta({ L: OPS_B.filter((x) => x.dC <= fin), capital: 60000, hasta: fin });
  const del = qB.tom.filter((x) => x.dC.startsWith(y));
  console.log("  " + y.padEnd(7) + D(r.final).padStart(13) +
    (((r.final / v0 - 1) >= 0 ? "+" : "−") + Math.abs(100 * (r.final / v0 - 1)).toFixed(0) + "%").padStart(11) +
    String(del.length).padStart(6) + String(del.filter((x) => x.gana > 0).length).padStart(7) +
    String(del.filter((x) => x.gana <= 0).length).padStart(8));
  v0 = r.final; }
const g = qB.tom.filter((x) => x.gana > 0).length;
console.log("  TOTAL: " + D(qB.final) + "  ·  " + an(qB.final, 60000).toFixed(1) + "% al año  ·  caída −" + qB.caida.toFixed(0) +
  "%  ·  " + qB.tom.length + " ops  ·  acierta " + (100 * g / Math.max(1, qB.tom.length)).toFixed(0) + "%");
console.log("");

// ── AÑADIDO: ¿y sin 2022? ────────────────────────────────────────────────────
// ⚠️ Quitar el año que perdió NO es un resultado — es la definición de sobreajustar.
// Sirve para DIAGNOSTICAR (¿el problema es sólo el mercado bajista?), no para esperar nada.
console.log("");
console.log("  ══ ¿Y SIN 2022? ══   ⚠️ diagnóstico, NO una expectativa");
console.log("");
console.log("  " + "".padEnd(34) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
const fila2 = (nom, L) => { const s = stats(L);
  console.log("  " + nom.padEnd(34) + String(L.length).padStart(6) +
    (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
    (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)) + (s ? (s.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9))); };
fila2("mitad A, todo", NA);
fila2("mitad A, SIN 2022", NA.filter((x) => x.y !== "2022"));
fila2("🎯 MITAD B, todo", NB);
fila2("🎯 MITAD B, SIN 2022", NB.filter((x) => x.y !== "2022"));
fila2("   MITAD B sin 2022 y sin SPY", NB.filter((x) => x.y !== "2022" && x.tk !== "SPY"));
fila2("las dos juntas, SIN 2022", [...NA, ...NB].filter((x) => x.y !== "2022"));
console.log("");
console.log("  ══ LA CUENTA SIN 2022 ══   (arrancando en enero de 2023, capital $60,000)");
console.log("");
const DD23 = DD.filter((d) => d >= "20230101");
function cuenta23({ L, capital }) {
  const divD = Math.pow(1 + DIV_SPY, 1 / 252) - 1;
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  let caja = capital, acc = 0, ab = [], tom = [], pico = capital, peor = 0;
  for (const hoy of DD23) {
    const p = pSPY.get(hoy);
    acc *= (1 + divD);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    for (const x of (porDia.get(hoy) || []).slice().sort((a, b) => a.ma - b.ma)) {
      if (ab.length >= HUECOS) break;
      if (ab.some((o) => o.tk === x.tk)) continue;
      const patr = caja + acc * p + inv();
      const tope = patr * TAM;
      const falta = Math.min(tope, patr) - caja;
      if (falta > 0 && acc > 0) { const v = Math.min(acc, falta / p); acc -= v; caja += v * p; }
      const n = Math.floor(Math.min(tope, caja) / x.coste);
      if (n < 1) continue;
      const dinero = n * x.coste;
      caja -= dinero; ab.push({ ...x, dinero }); tom.push({ ...x, dinero, gana: dinero * (x.mult - 1) }); }
    if (caja > 0) { acc += caja / p; caja = 0; }
    const v = caja + acc * p + inv();
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  const p = pSPY.get(DD23[DD23.length - 1]);
  let fin = caja + acc * p; for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, caida: 100 * peor, tom }; }
const A23 = 3.63;   // años de 2023-01 a 2026-08
const an23 = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / A23) - 1);
console.log("  " + "".padEnd(30) + "acaba con".padStart(13) + "al año".padStart(10) + "caída".padStart(9) + "ops".padStart(6));
for (const [nom, L] of [["mitad A (afinada)", OPS_A], ["🎯 MITAD B (el examen)", OPS_B]]) {
  const q = cuenta23({ L: L.filter((x) => x.dC >= "20230101"), capital: 60000 });
  console.log("  " + nom.padEnd(30) + D(q.final).padStart(13) + (an23(q.final, 60000).toFixed(1) + "%").padStart(10) +
    ("−" + q.caida.toFixed(0) + "%").padStart(9) + String(q.tom.length).padStart(6)); }
const spy23 = 60000 * (pSPY.get(DD23[DD23.length - 1]) / pSPY.get(DD23[0])) * Math.pow(1 + DIV_SPY, A23);
console.log("  " + "comprar SPY y dormir".padEnd(30) + D(spy23).padStart(13) + (an23(spy23, 60000).toFixed(1) + "%").padStart(10));
console.log("");
const qB23 = cuenta23({ L: OPS_B.filter((x) => x.dC >= "20230101"), capital: 60000 });
console.log("  ── la mitad B desde 2023, año por año ──");
console.log("  " + "año".padEnd(7) + "valor".padStart(13) + "% del año".padStart(11) + "ops".padStart(6));
let v23 = 60000;
for (const y of ["2023","2024","2025","2026"]) {
  const fin = [...DD23].reverse().find((d) => d.startsWith(y)); if (!fin) continue;
  const r = cuenta23({ L: OPS_B.filter((x) => x.dC >= "20230101" && x.dC <= fin), capital: 60000 });
  const rr = { final: r.final };
  const del = qB23.tom.filter((x) => x.dC.startsWith(y));
  console.log("  " + y.padEnd(7) + D(rr.final).padStart(13) +
    (((rr.final / v23 - 1) >= 0 ? "+" : "−") + Math.abs(100 * (rr.final / v23 - 1)).toFixed(0) + "%").padStart(11) +
    String(del.length).padStart(6));
  v23 = rr.final; }
console.log("");
console.log("  ⚠️ Empezar en 2023 es elegir el punto de partida DESPUÉS de ver los datos.");
console.log("     El número real del examen sigue siendo +3,42% con t=0,43.");
console.log("");
