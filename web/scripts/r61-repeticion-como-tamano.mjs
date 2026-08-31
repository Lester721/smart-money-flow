// LA REPETICION COMO TAMAÑO — la idea de Lester aplicada al segundo factor.
//
// Lester (2026-08-27): *"en el tema de solo 2 a 9 golpes ¿no deberiamos hacer lo mismo que con la
// dominancia — doblar o aumentar 0,5 mas cuando se active, y no reducir cuando no se active?"*
//
// EL PROBLEMA A RESOLVER: si la dominancia dobla Y la repeticion dobla, cuando coinciden pones el
// 100% de la cuenta en una posicion. Hay que decidir como se APILAN.
//
// LA CRIBA QUE VALE PARA UNA REGLA DE TAMAÑO: el ratio por señal NO cambia (el tamaño no cambia
// que señales hay). Lo que hay que exigir es que gane en LAS DOS ESCALAS DE CUENTA — que es lo
// que valido la dominancia y lo que tumbo a la media de 20 dias cuando se probo mal.
//
// BASE: la regla con el corte a las 14:30 ya puesto (72 señales).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cargar } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const MAG = (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 10000 && f.hora >= "14:30" && f.vsOI >= 12;
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
    n++; if ((o.l === "C" && c) || (o.l === "P" && v)) al += o.prima; else ba += o.prima;
  }
  if (n >= 5) DOM.set(tk + "|" + dia, (al - ba) / (al + ba));
}
function salir8(f) { const coste = f.ask; let n = 0, ult = null;
  for (const [d, bid] of f.camino) { n++; const m = bid / coste; ult = { mult: m, dSal: d };
    if (m >= 1.50) return { mult: 1.50, dSal: d }; if (m <= 0.50) return { mult: 0.50, dSal: d };
    const s = spotDe(f.tk, d);
    if (s != null) { const mv = f.l === "P" ? (f.spot - s) / f.spot : (s - f.spot) / f.spot;
      if (mv >= 0.08) return { mult: m, dSal: d }; }
    if (n >= 60) return { mult: m, dSal: d }; }
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
    const d = DOM.get(f.tk + "|" + f.dia); const r = salir8(f);
    T.push({ ...f, y, mult: r.mult, dSal: r.dSal,
      dom: (d == null ? 0 : (f.l === "P" ? -1 : 1) * d) >= 0.3,
      rep: f.golpes >= 2 && f.golpes < 10 }); } }
T.sort((a, b) => a.dC.localeCompare(b.dC));
function cuentaVar(L, { capital, maxAb, base, mult }) {
  let caja = capital, ab = [], tomadas = [], pico = capital, peor = 0;
  const fechas = [...new Set([...L.map((x) => x.dC), ...L.map((x) => x.dSal)])].sort();
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
  for (const hoy of fechas) {
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    for (const x of (porDia.get(hoy) || [])) {
      if (ab.length >= maxAb) continue;
      const quiere = (caja + inv()) * Math.min(base * mult(x), 1.0);
      const n = Math.floor(Math.min(quiere, caja) / (x.ask * 100));
      if (n < 1) continue;
      const dinero = n * x.ask * 100;
      caja -= dinero; const op = { ...x, dinero, n }; ab.push(op); tomadas.push(op);
    }
    const v = caja + inv(); if (v > pico) pico = v;
    const dd = 1 - v / pico; if (dd > peor) peor = dd;
  }
  for (const x of ab) caja += x.dinero * x.mult;
  return { final: caja, tomadas, caida: 100 * peor };
}
const anual = (f, c) => (100 * (Math.pow(Math.max(f, 1) / c, 1 / 5.63) - 1)).toFixed(1) + "%";
const VARS = [
  ["sin nada (fijo)", () => 1],
  ["SOLO dominancia ×2  (lo de hoy)", (x) => x.dom ? 2 : 1],
  ["SOLO repeticion ×2", (x) => x.rep ? 2 : 1],
  ["+0,5 cada uno  (1 / 1,5 / 2)", (x) => 1 + (x.dom ? 0.5 : 0) + (x.rep ? 0.5 : 0)],
  ["cualquiera ×2  (tope 2)", (x) => (x.dom || x.rep) ? 2 : 1],
  ["dom ×2 · rep ×1,5  (hasta 3)", (x) => (x.dom ? 2 : 1) * (x.rep ? 1.5 : 1)],
  ["los dos ×2  (hasta 4)", (x) => (x.dom ? 2 : 1) * (x.rep ? 2 : 1)],
  ["SOLO si las DOS  (×2)", (x) => (x.dom && x.rep) ? 2 : 1],
];
console.log("");
console.log("  base: corte a las 14:30 · " + T.length + " señales");
console.log("  de ellas: dominancia a favor " + T.filter((x) => x.dom).length +
  " · repeticion 2-9 " + T.filter((x) => x.rep).length +
  " · LAS DOS " + T.filter((x) => x.dom && x.rep).length);
console.log("");
console.log("  ══ ¿GANA EN LAS DOS ESCALAS? (es la criba que valido la dominancia) ══");
console.log("");
console.log("  " + "".padEnd(34) + "TU CUENTA $60k".padStart(24) + "caida".padStart(7) +
  "CUENTA GRANDE $300k".padStart(26) + "caida".padStart(7) + "  ¿las 2?");
const refA = cuentaVar(T, { capital: 60000, maxAb: 4, base: 0.25, mult: () => 1 }).final;
const refB = cuentaVar(T, { capital: 300000, maxAb: 4, base: 0.25, mult: () => 1 }).final;
for (const [nom, m] of VARS) {
  const a = cuentaVar(T, { capital: 60000, maxAb: 4, base: 0.25, mult: m });
  const b = cuentaVar(T, { capital: 300000, maxAb: 4, base: 0.25, mult: m });
  const ok = (a.final > refA && b.final > refB) ? "✓ SI" : (a.final < refA && b.final < refB) ? "✗ no" : "⚠ mixto";
  console.log("  " + nom.padEnd(34) + (D(a.final) + "  " + anual(a.final, 60000)).padStart(24) +
    ("−" + a.caida.toFixed(0) + "%").padStart(7) +
    (D(b.final) + "  " + anual(b.final, 300000)).padStart(26) +
    ("−" + b.caida.toFixed(0) + "%").padStart(7) + "   " + (nom.startsWith("sin nada") ? "(ref)" : ok));
}
console.log("");
console.log("  ══ AÑO POR AÑO — las tres mejores contra la de hoy (cuenta de $60k) ══");
console.log("");
console.log("  " + "".padEnd(34) + ANOS.map(([y]) => y.padStart(11)).join(""));
for (const [nom, m] of VARS) {
  const cel = ANOS.map(([y]) => {
    const L = T.filter((x) => x.y === y);
    if (!L.length) return "—".padStart(11);
    return D(cuentaVar(L, { capital: 60000, maxAb: 4, base: 0.25, mult: m }).final - 60000).padStart(11);
  });
  console.log("  " + nom.padEnd(34) + cel.join(""));
}
console.log("");
console.log("  el liston: $60.000 en SPY -> $125.148 (+13,9% al ano)");
console.log("");
