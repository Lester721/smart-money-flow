// ══ AFINAR CON CABEZA — PASO 8: LAS DOS CUENTAS ══ Lester, 2026-08-28: «haz las dos».
//
// ⚠️ LA MITAD B NO SE TOCA.
//
// A) DESNUDA A 90 DÍAS: comprar la call, aguantar 90 días. Acierta 55%, +40% por operación,
//    dobla el 24,5%. Es la del misil.
// B) SPREAD A 30 DÍAS: comprar la call 15% dentro y VENDER otra más arriba. Acierta 62%, y a
//    ese acierto un vertical de débito sí gana. Cuesta la mitad, así que caben más posiciones.
//
// FILTRO EN LAS DOS: la acción bajo su media de 20 · golpe de call de $500k+ al ask tras las
// 14:00 · 12x el interés abierto de la víspera.
//
// ⚠️ CÓMO SE PAGA EL SPREAD, que es donde mueren estas ideas:
//    al ABRIR   se paga el ASK de la que se compra y se cobra el BID de la que se vende
//    al CERRAR  se cobra el BID de la que se compra y se paga el ASK de la que se vende
//    Se cruza la horquilla ENTERA en las dos patas y en los dos sentidos. Sin trampas.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const A = ["AMAT","ASML","AVGO","BA","COIN","COST","DELL","JPM","META","MRVL","NVDA","PFE","PYPL","QQQ","STX","UNH"];
const PROF_OBJ = 0.15, DTE_OBJ = 120, COSTE_MIN = 5000, SUELO = 0.50;
const ANOS = 5.63;
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
/** la call larga: 15% dentro, ~120 días, >= $5.000 */
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
/** la call corta del spread: la más cercana a `arriba` por encima del precio, MISMO vencimiento */
function corta(tk, d, exp, spot, arriba) {
  const ch = leer(tk, d); if (!ch || !ch[exp]) return null;
  const objetivo = spot * (1 + arriba);
  let mejor = null, mejorD = Infinity;
  for (const cl of Object.keys(ch[exp])) {
    if (!cl.endsWith("|C")) continue;
    const K = Number(cl.slice(0, cl.indexOf("|")));
    if (K <= spot) continue;
    const q = ch[exp][cl]; if (!q || !(q[0] > 0)) continue;
    const dist = Math.abs(K - objetivo);
    if (dist < mejorD) { mejorD = dist; mejor = { K, ask: q[1], bid: q[0] }; } }
  return mejor; }
const media = (X) => X.reduce((s, x) => s + x, 0) / X.length;
const med = (X) => { const B = [...X].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
const an = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / ANOS) - 1);

// ── construir las operaciones de las dos variantes ──
const DESNUDA = [], SPREAD = {};
const ARRIBAS = [0.0, 0.10, 0.20];
for (const a of ARRIBAS) SPREAD[a] = [];
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
    const g = ayer ? GOLPE.get(tk + "|" + ayer) : null;
    if (!g) continue;
    const oiV = i > 1 ? oiA.leer(tk, todos[i - 2]) : null;
    let vsOI = 0;
    if (oiV) for (const [k, tam] of g) { const [exp, K] = k.split("|");
      const o = oiV[exp] && oiV[exp][K + "|C"]; const n = Array.isArray(o) ? o[0] : o;
      if (n > 0) vsOI = Math.max(vsOI, tam / n); }
    if (!(vsOI >= 12)) continue;
    const L = larga(tk, d); if (!L) continue;
    const futuros = todos.filter((y) => y > d && y <= L.exp);
    // A) desnuda, 90 días
    { const cam = [];
      for (const x of futuros) { const ch = leer(tk, x); if (!ch) continue;
        const q = ch[L.exp] && ch[L.exp][L.K + "|C"]; if (!q || !(q[0] > 0)) continue;
        cam.push([x, q[0] / L.ask]); if (cam.length >= 90) break; }
      if (cam.length >= 15) {
        let r = null;
        for (const [x, m] of cam) { r = { mult: m, dSal: x }; if (m <= SUELO) break; }
        DESNUDA.push({ tk, dC: d, y: d.slice(0, 4), ma, coste: L.ask * 100, mult: r.mult, dSal: r.dSal }); } }
    // B) spread, 30 días
    for (const arriba of ARRIBAS) {
      const C = corta(tk, d, L.exp, L.spot, arriba); if (!C) continue;
      const debito = L.ask - C.bid; if (!(debito > 0.05)) continue;
      const ancho = C.K - L.K;
      const cam = [];
      for (const x of futuros) {
        const ch = leer(tk, x); if (!ch || !ch[L.exp]) continue;
        const qL = ch[L.exp][L.K + "|C"], qC = ch[L.exp][C.K + "|C"];
        if (!qL || !qC || !(qL[0] > 0)) continue;
        const valor = Math.max(0, qL[0] - qC[1]);          // vendo la larga al bid, recompro la corta al ask
        cam.push([x, valor / debito]); if (cam.length >= 30) break; }
      if (cam.length < 10) continue;
      let r = null;
      for (const [x, m] of cam) { r = { mult: m, dSal: x }; if (m <= SUELO) break; }
      SPREAD[arriba].push({ tk, dC: d, y: d.slice(0, 4), ma, coste: debito * 100, ancho: ancho * 100,
                            mult: r.mult, dSal: r.dSal }); } } }
console.log("\n");
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
console.log("  ══ POR OPERACIÓN ══   (una por ticker a la vez · el peaje cruzado entero)");
console.log("");
console.log("  " + "".padEnd(34) + "n".padStart(6) + "coste".padStart(10) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
const DNS = sinSolape(DESNUDA), sD = stats(DNS);
console.log("  " + "A) desnuda, 90 días".padEnd(34) + String(DNS.length).padStart(6) + D(media(DNS.map((x) => x.coste))).padStart(10) +
  (sD ? (sD.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (sD ? (sD.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
  (sD ? sD.t.toFixed(2).padStart(8) : "—".padStart(8)) + (sD ? (sD.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9)));
const SNS = {};
for (const a of ARRIBAS) {
  SNS[a] = sinSolape(SPREAD[a]); const s = stats(SNS[a]);
  console.log("  " + ("B) spread 30d, corta a " + (a === 0 ? "el dinero" : "+" + (100 * a).toFixed(0) + "%")).padEnd(34) +
    String(SNS[a].length).padStart(6) + D(media(SNS[a].map((x) => x.coste))).padStart(10) +
    (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
    (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)) + (s ? (s.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9))); }

// ── la cuenta ──
const DIAS = cad.dias("SPY").filter((d) => d >= "20210101" && d <= "20260819");
function cuenta({ L, capital, tam, huecos, tipo = 0.033, hasta = null }) {
  const intD = Math.pow(1 + tipo, 1 / 252) - 1;
  const dias = hasta ? DIAS.filter((d) => d <= hasta) : DIAS;
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  let caja = capital, ab = [], tom = [], pico = capital, peor = 0;
  for (const hoy of dias) {
    caja *= (1 + intD);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    for (const x of (porDia.get(hoy) || []).slice().sort((a, b) => a.ma - b.ma)) {
      if (ab.length >= huecos) break;
      if (ab.some((o) => o.tk === x.tk)) continue;
      const tope = (caja + inv()) * tam;
      const n = Math.floor(Math.min(tope, caja) / x.coste);
      if (n < 1) continue;
      const dinero = n * x.coste;
      caja -= dinero; ab.push({ ...x, dinero }); tom.push({ ...x, dinero, gana: dinero * (x.mult - 1) }); }
    const v = caja + inv();
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  let fin = caja; for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, caida: 100 * peor, tom }; }
function banda(op, base) { const R = [], C = [], paso = base * 0.0083;
  for (let c = base * 0.917; c <= base * 1.084; c += paso) { const q = cuenta({ ...op, capital: c }); R.push(an(q.final, c)); C.push(q.caida); }
  return { a: med(R), c: med(C) }; }
console.log("");
console.log("  ══ TU CUENTA ($60,000) ══   mediana de 21 capitales · efectivo al 3,3%");
console.log("");
console.log("  " + "".padEnd(38) + "huecos".padStart(8) + "por posic.".padStart(11) + "al año".padStart(9) + "caída".padStart(8) + "ops".padStart(6));
const VAR = [];
for (const [nom, L] of [["A) desnuda 90 días", DESNUDA], ["B) spread 30d, corta al dinero", SPREAD[0]],
                        ["B) spread 30d, corta a +10%", SPREAD[0.10]], ["B) spread 30d, corta a +20%", SPREAD[0.20]]]) {
  for (const [huecos, tam] of [[4, 0.25], [4, 0.15], [6, 0.15], [8, 0.10]]) {
    const b = banda({ L, tam, huecos }, 60000);
    const q = cuenta({ L, capital: 60000, tam, huecos });
    VAR.push({ nom, L, huecos, tam, a: b.a, c: b.c, ops: q.tom.length });
    console.log("  " + nom.padEnd(38) + String(huecos).padStart(8) + ((100 * tam).toFixed(0) + "%").padStart(11) +
      (b.a.toFixed(1) + "%").padStart(9) + ("−" + b.c.toFixed(0) + "%").padStart(8) + String(q.tom.length).padStart(6)); } }
console.log("  " + "comprar SPY y dormir".padEnd(38 + 8 + 11) + "15.4%".padStart(9) + "−25%".padStart(8));
const mejor = VAR.filter((v) => v.ops >= 20).sort((a, b) => (b.a / Math.max(1, b.c)) - (a.a / Math.max(1, a.c)))[0];
if (mejor) {
  console.log("");
  console.log("  ══ AÑO POR AÑO — la de mejor relación: " + mejor.nom + ", " + mejor.huecos + " huecos al " + (100 * mejor.tam).toFixed(0) + "% ══");
  console.log("");
  const q = cuenta({ L: mejor.L, capital: 60000, tam: mejor.tam, huecos: mejor.huecos });
  console.log("  " + "año".padEnd(7) + "valor".padStart(13) + "% del año".padStart(11) + "ops".padStart(6) + "gana".padStart(7) + "pierde".padStart(8));
  let v0 = 60000;
  for (const y of ["2021","2022","2023","2024","2025","2026"]) {
    const fin = [...DIAS].reverse().find((d) => d.startsWith(y)); if (!fin) continue;
    const r = cuenta({ L: mejor.L.filter((x) => x.dC <= fin), capital: 60000, tam: mejor.tam, huecos: mejor.huecos, hasta: fin });
    const del = q.tom.filter((x) => x.dC.startsWith(y));
    console.log("  " + y.padEnd(7) + D(r.final).padStart(13) +
      (((r.final / v0 - 1) >= 0 ? "+" : "−") + Math.abs(100 * (r.final / v0 - 1)).toFixed(0) + "%").padStart(11) +
      String(del.length).padStart(6) + String(del.filter((x) => x.gana > 0).length).padStart(7) +
      String(del.filter((x) => x.gana <= 0).length).padStart(8));
    v0 = r.final; }
  const g = q.tom.filter((x) => x.gana > 0).length;
  console.log("  TOTAL: " + D(q.final) + "  ·  " + an(q.final, 60000).toFixed(1) + "% al año  ·  caída −" + q.caida.toFixed(0) +
    "%  ·  " + q.tom.length + " ops  ·  acierta " + (100 * g / Math.max(1, q.tom.length)).toFixed(0) + "%");
}
console.log("");
console.log("  ⚠️ MITAD A, y afinado sobre ella. El examen NO se ha hecho.");
console.log("");
