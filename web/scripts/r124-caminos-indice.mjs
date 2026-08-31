// ══ CAMINOS DEL ÍNDICE, SIN FILTRO DE MEDIA ══ Lester, 2026-08-28.
//
// r123 dejó una candidata: la misma call (15% dentro, ~120 días) pero sobre SPY/QQQ en vez de
// sobre empresas. Sharpe 0,71 · funciona en las DOS mitades (0,73 y 0,77) · y le gana a SPY
// a crédito por 1-2,5 puntos a la misma caída.
//
// PERO SON 64 OPERACIONES. Ese es el punto flojo y hay que atacarlo de frente.
//
// La pregunta que lo decide: ¿el mérito es de LA MEDIA DE 20 DÍAS (elegir el momento) o es
// de LA CALL (la convexidad)? Si es de la call, el disparador sobra y la estrategia se
// simplifica a «tener siempre puesta una call sobre índice», que se puede medir con MUCHOS
// más días y no depende de 64 casillas.
//
// Para poder separarlo hay que bajar los caminos SIN el filtro de la media, que r119 aplicaba
// al construir. Son 2 tickers, es barato.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";

const TK = ["SPY", "QQQ"];
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
process.stdout.write("\n  caminos de índice SIN filtro de media: ");
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
    const ma = s / (p.reduce((a, b) => a + b, 0) / p.length) - 1;   // SE GUARDA, no se filtra
    const L = elegir(tk, d); if (!L) continue;
    const cam = [];
    for (const x of todos.filter((y) => y > d && y <= L.exp)) {
      const ch = leer(tk, x); if (!ch) continue;
      const q = ch[L.exp] && ch[L.exp][L.K + "|C"]; if (!q || !(q[0] > 0)) continue;
      cam.push([x, Math.round((q[0] / L.ask) * 10000) / 10000]);
      if (cam.length >= PLAZO) break; }
    if (cam.length < 15) continue;
    let corte = cam.length;
    for (let j = 0; j < cam.length; j++) if (cam[j][1] <= SUELO) { corte = j + 1; break; }
    OPS.push({ tk, dC: d, ma: Math.round(ma * 10000) / 10000, coste: Math.round(L.ask * 10000) / 100,
      spot: Math.round(L.spot * 100) / 100, K: L.K, exp: L.exp, camino: cam.slice(0, corte) }); } }
OPS.sort((a, b) => a.dC.localeCompare(b.dC));

CH = new Map(); SP = new Map();
const SPYD = {};
for (const d of cad.dias("SPY")) { if (d < DESDE || d > HASTA) continue;
  const s = spotDe("SPY", d); if (s > 0) SPYD[d] = Math.round(s * 100) / 100; }

writeFileSync(join(CACHE, "caminos-indice.json"), JSON.stringify({ ops: OPS, spy: SPYD }));
console.log("\n");
console.log("  ══ AUDIT ══");
console.log("  entradas: " + OPS.length.toLocaleString("en-US") +
  "   (bajo la media: " + OPS.filter((o) => o.ma < 0).length.toLocaleString("en-US") +
  " · sobre la media: " + OPS.filter((o) => o.ma >= 0).length.toLocaleString("en-US") + ")");
console.log("  SPY: " + OPS.filter((o) => o.tk === "SPY").length.toLocaleString("en-US") +
  "  ·  QQQ: " + OPS.filter((o) => o.tk === "QQQ").length.toLocaleString("en-US"));
const L = OPS.map((o) => o.camino.length).sort((a,b)=>a-b);
console.log("  días aguantados: mediana " + L[Math.floor(L.length/2)] + " · mín " + L[0] + " · máx " + L[L.length-1]);
console.log("  ¿algún camino empieza antes de comprar? " + (OPS.every((o) => o.camino[0][0] > o.dC) ? "no ✓" : "SÍ ⛔"));
console.log("  días de SPY: " + Object.keys(SPYD).length.toLocaleString("en-US"));
console.log("");
