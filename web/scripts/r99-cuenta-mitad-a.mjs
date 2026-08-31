// ══ AFINAR CON CABEZA — PASO 3: LA CUENTA ══ Lester, 2026-08-28:
//   «con el 15-25% ¿cuánto hubiera ganado con mi cuenta en los años anteriores?»
//
// ⚠️ LA MITAD B NO SE TOCA. NO es el examen.
//
// ⚠️ EL PROBLEMA DE DISEÑO QUE APARECE AQUÍ. Sin el filtro del golpe NO HAY ESCASEZ: en la mitad
// A hay ~11.000 días-ticker por debajo de la media y sólo caben 4 posiciones. La regla de «cuál
// de todas» pasa a ser la estrategia. Se prueban DOS criterios y se enseñan los dos, para que se
// vea cuánto depende de esa elección:
//    · la más caída bajo su media   (natural: comprar la caída más honda)
//    · orden alfabético             (control tonto: si da lo mismo, el criterio no aporta)
//
// LA REGLA QUE SE MIDE:  calls · 15% o 25% dentro del dinero · SIN tope de ganancia ·
//   suelo 0,50x · 60 días · 4 huecos · efectivo al 3,3% (Gold) · sin doblar tamaño
//   (el doblar dependía de la dominancia del golpe, y sin golpe no hay dominancia).
import { abrir } from "./datos.mjs";
const A = ["AMAT","ASML","AVGO","BA","COIN","COST","DELL","JPM","META","MRVL","NVDA","PFE","PYPL","QQQ","STX","UNH"];
const DTE_OBJ = 51, COSTE_MIN = 10000, TOPE = 60, SUELO = 0.50;
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const cad = abrir("cadenas", { callado: true });
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
function elegir(tk, d, profObj) {
  const ch = leer(tk, d); if (!ch) return null;
  const s = spotDe(tk, d); if (s == null) return null;
  let mejor = null, mejorD = Infinity;
  for (const exp of Object.keys(ch)) {
    const dte = dteDe(d, exp); if (dte < 5 || dte > 400) continue;
    for (const cl of Object.keys(ch[exp])) {
      if (!cl.endsWith("|C")) continue;
      const K = Number(cl.slice(0, cl.indexOf("|")));
      if (K >= s) continue;
      const q = ch[exp][cl]; if (!q || !(q[1] > 0) || !(q[0] > 0)) continue;
      if (q[1] * 100 < COSTE_MIN) continue;
      const prof = (s - K) / s;
      const dist = Math.abs(prof - profObj) / profObj + Math.abs(dte - DTE_OBJ) / DTE_OBJ;
      if (dist < mejorD) { mejorD = dist; mejor = { exp, K, ask: q[1], bid: q[0], prof, dte, spot: s }; } } }
  return mejor; }
function caminoDe(tk, d, c, dias) {
  const out = [];
  for (const x of dias.filter((y) => y > d && y <= c.exp)) {
    const ch = leer(tk, x); if (!ch) continue;
    const q = ch[c.exp] && ch[c.exp][c.K + "|C"]; if (!q || !(q[0] > 0)) continue;
    out.push([x, q[0] / c.ask]);
    if (out.length >= TOPE) break; }
  return out; }
function resultado(cam) {
  let ult = null;
  for (const [d, m] of cam) { ult = { mult: m, dSal: d }; if (m <= SUELO) return { mult: SUELO, dSal: d }; }
  return ult; }

// ── construir todas las candidatas de la mitad A, a las dos profundidades ──
const CAND = { 0.15: [], 0.25: [] };
process.stdout.write("\n  construyendo la mitad A: ");
const DIAS_SPY = cad.dias("SPY").filter((d) => d >= "20210101" && d <= "20260819");
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
  for (const d of DS) {
    const ma = MA.get(d); if (ma == null || ma >= 0) continue;
    for (const p of [0.15, 0.25]) {
      const c = elegir(tk, d, p); if (!c) continue;
      const cam = caminoDe(tk, d, c, todos); if (cam.length < 3) continue;
      const r = resultado(cam); if (!r) continue;
      CAND[p].push({ tk, dC: d, y: d.slice(0, 4), ask: c.ask, ma, mult: r.mult, dSal: r.dSal }); } } }
console.log("\n");
for (const p of [0.15, 0.25]) CAND[p].sort((a, b) => a.dC.localeCompare(b.dC));
console.log("  candidatas: 15% dentro → " + CAND[0.15].length.toLocaleString("en-US") +
            "   ·   25% dentro → " + CAND[0.25].length.toLocaleString("en-US"));
console.log("  (sólo caben 4 a la vez: por eso el criterio de CUÁL elegir manda)\n");

const an = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / 5.63) - 1);
const med = (X) => { const B = [...X].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
/** criterio: 'caida' = la más caída bajo su media · 'alfa' = orden alfabético */
function cuenta({ L, capital, tam = 0.25, huecos = 4, criterio = "caida", tipo = 0.033, hasta = null }) {
  const intD = Math.pow(1 + tipo, 1 / 252) - 1;
  const dias = hasta ? DIAS_SPY.filter((d) => d <= hasta) : DIAS_SPY;
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  let caja = capital, ab = [], tom = [], pico = capital, peor = 0;
  for (const hoy of dias) {
    caja *= (1 + intD);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    const hoyL = (porDia.get(hoy) || []).slice()
      .sort((a, b) => criterio === "caida" ? a.ma - b.ma : a.tk.localeCompare(b.tk));
    for (const x of hoyL) {
      if (ab.length >= huecos) break;
      if (ab.some((o) => o.tk === x.tk)) continue;          // una posición por ticker a la vez
      const tope = (caja + inv()) * tam;
      const n = Math.floor(Math.min(tope, caja) / (x.ask * 100));
      if (n < 1) continue;
      const dinero = n * x.ask * 100;
      caja -= dinero; ab.push({ ...x, dinero }); tom.push({ ...x, dinero, gana: dinero * (x.mult - 1) }); }
    const v = caja + inv();
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  let fin = caja; for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, caida: 100 * peor, tom }; }
function banda(op, base) { const A2 = [], C2 = [], paso = base * 0.0083;
  for (let c = base * 0.917; c <= base * 1.084; c += paso) { const q = cuenta({ ...op, capital: c }); A2.push(an(q.final, c)); C2.push(q.caida); }
  return { a: med(A2), c: med(C2) }; }

console.log("  ══ TU CUENTA ($60,000), MITAD A ══   mediana de 21 capitales de partida");
console.log("");
console.log("  " + "".padEnd(34) + "al año".padStart(9) + "caída".padStart(9) + "  │ " + "orden alfabético".padStart(20));
for (const p of [0.15, 0.25]) for (const tam of [0.25, 0.15, 0.10]) {
  const b = banda({ L: CAND[p], tam, criterio: "caida" }, 60000);
  const b2 = banda({ L: CAND[p], tam, criterio: "alfa" }, 60000);
  console.log("  " + ((100 * p).toFixed(0) + "% dentro · " + (100 * tam).toFixed(0) + "% por posición").padEnd(34) +
    (b.a.toFixed(1) + "%").padStart(9) + ("−" + b.c.toFixed(0) + "%").padStart(9) +
    "  │ " + (b2.a.toFixed(1) + "%  −" + b2.c.toFixed(0) + "%").padStart(20)); }
console.log("  " + "comprar SPY y dormir".padEnd(34) + "15.4%".padStart(9) + "−25%".padStart(9));
console.log("");

// año por año de las dos que interesan
for (const [p, tam] of [[0.15, 0.25], [0.25, 0.25], [0.15, 0.10]]) {
  const q = cuenta({ L: CAND[p], capital: 60000, tam });
  console.log("  ── " + (100 * p).toFixed(0) + "% dentro · " + (100 * tam).toFixed(0) + "% por posición ──");
  console.log("  " + "año".padEnd(7) + "valor".padStart(13) + "% del año".padStart(11) + "ops".padStart(6) + "gana".padStart(7) + "pierde".padStart(8));
  let v0 = 60000;
  for (const y of ["2021","2022","2023","2024","2025","2026"]) {
    const fin = [...DIAS_SPY].reverse().find((d) => d.startsWith(y)); if (!fin) continue;
    const r = cuenta({ L: CAND[p].filter((x) => x.dC <= fin), capital: 60000, tam, hasta: fin });
    const del = q.tom.filter((x) => x.dC.startsWith(y));
    console.log("  " + y.padEnd(7) + D(r.final).padStart(13) +
      (((r.final / v0 - 1) >= 0 ? "+" : "−") + Math.abs(100 * (r.final / v0 - 1)).toFixed(0) + "%").padStart(11) +
      String(del.length).padStart(6) + String(del.filter((x) => x.gana > 0).length).padStart(7) +
      String(del.filter((x) => x.gana <= 0).length).padStart(8));
    v0 = r.final; }
  const g = q.tom.filter((x) => x.gana > 0).length;
  console.log("  TOTAL: " + D(q.final) + "  ·  " + an(q.final, 60000).toFixed(1) + "% al año  ·  caída −" + q.caida.toFixed(0) +
    "%  ·  " + q.tom.length + " ops  ·  acierta " + (100 * g / Math.max(1, q.tom.length)).toFixed(0) + "%");
  console.log("");
}
console.log("  ⚠️ MITAD A, y afinado sobre ella. El examen (mitad B) NO se ha hecho.");
console.log("");
