// ══ LOS CAMINOS DIARIOS ══ Lester, 2026-08-28: los lentes del Medallion.
//
// r109 calculaba el camino día a día de cada opción (la variable `cam`) y LO TIRABA:
// se quedaba sólo con la salida. Por eso la curva de la cuenta valoraba las posiciones
// abiertas AL COSTE (línea 98 y 111) y la caída del −43% era una caída REALIZADA,
// no la que se ve en pantalla.
//
// Esto guarda el camino entero. Nada más. La misma selección que r109, byte a byte,
// para que lo que se mida después sea comparable con lo ya medido.
//
// Salida: caminos-120d.json  →  [{ tk, dC, ma, coste, camino: [[fecha, mult], ...] }]
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";

const TK = ["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY",
  "BA","JPM","INTC","F","BAC","DIS","XOM","GE","PYPL","COST","CRM","ORCL","WMT","T","PFE","KO","CSCO","NKE","UNH","WBA"];
const PROF_OBJ = 0.15, DTE_OBJ = 120, COSTE_MIN = 5000, SUELO = 0.50, PLAZO = 90;
const DESDE = "20160104", HASTA = "20260819";

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

function elegir(tk, d) {
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
process.stdout.write("\n  caminos 2016-2026: ");
for (const tk of TK) {
  CH = new Map(); SP = new Map();
  process.stdout.write(tk + " ");
  const todos = cad.dias(tk);
  for (let i = 20; i < todos.length; i++) {
    const d = todos[i];
    if (d < DESDE || d > HASTA) continue;
    const p = todos.slice(i - 20, i).map((x) => spotDe(tk, x)).filter((x) => x != null);
    const s = spotDe(tk, d);
    if (p.length < 15 || s == null) continue;
    const ma = s / (p.reduce((a, b) => a + b, 0) / p.length) - 1;
    if (ma >= 0) continue;
    const L = elegir(tk, d); if (!L) continue;
    const cam = [];
    for (const x of todos.filter((y) => y > d && y <= L.exp)) {
      const ch = leer(tk, x); if (!ch) continue;
      const q = ch[L.exp] && ch[L.exp][L.K + "|C"]; if (!q || !(q[0] > 0)) continue;
      cam.push([x, Math.round((q[0] / L.ask) * 10000) / 10000]);
      if (cam.length >= PLAZO) break; }
    if (cam.length < 15) continue;
    // el camino se CORTA en el suelo del 0,50x, igual que r109: a partir de ahí ya está vendida
    let corte = cam.length;
    for (let j = 0; j < cam.length; j++) if (cam[j][1] <= SUELO) { corte = j + 1; break; }
    const camino = cam.slice(0, corte);
    OPS.push({ tk, dC: d, ma: Math.round(ma * 10000) / 10000, coste: Math.round(L.ask * 100 * 100) / 100,
      spot: Math.round(L.spot * 100) / 100, K: L.K, exp: L.exp, camino }); } }
OPS.sort((a, b) => a.dC.localeCompare(b.dC));

// ── SPY diario, para el aparcadero y para el factor de mercado ──
CH = new Map(); SP = new Map();
const SPYD = {};
for (const d of cad.dias("SPY")) {
  if (d < DESDE || d > HASTA) continue;
  const s = spotDe("SPY", d); if (s > 0) SPYD[d] = Math.round(s * 100) / 100; }

const fuera = join(CACHE, "caminos-120d.json");
writeFileSync(fuera, JSON.stringify({ ops: OPS, spy: SPYD }));

console.log("\n");
console.log("  ══ AUDIT ══");
console.log("  entradas: " + OPS.length.toLocaleString("en-US"));
console.log("  días de SPY: " + Object.keys(SPYD).length.toLocaleString("en-US"));
const largos = OPS.map((o) => o.camino.length);
console.log("  días aguantados: mediana " + largos.slice().sort((a,b)=>a-b)[Math.floor(largos.length/2)] +
  "  ·  mín " + Math.min(...largos) + "  ·  máx " + Math.max(...largos));
// el último punto de cada camino tiene que ser el `mult` que usaba r109
const salidas = OPS.map((o) => o.camino[o.camino.length - 1][1]);
const m = salidas.reduce((a,b)=>a+b,0) / salidas.length;
console.log("  multiplicador de salida medio: " + m.toFixed(4) + "  (r109 daba +12,21% sobre las que entran en cartera)");
console.log("  ¿algún camino empieza antes de comprar? " +
  (OPS.every((o) => o.camino[0][0] > o.dC) ? "no ✓" : "SÍ ⛔"));
console.log("  ¿algún camino sigue después de tocar el suelo? " +
  (OPS.every((o) => o.camino.slice(0, -1).every(([, v]) => v > 0.50)) ? "no ✓" : "SÍ ⛔"));
console.log("");
console.log("  guardado en " + fuera);
console.log("");
