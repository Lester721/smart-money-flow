// LA DOMINANCIA COMO TAMAÑO, NO COMO INTERRUPTOR.
//
// Lester, el 2026-08-27: *"yo creo que es un factor que si se activa te da confianza en que vas a
// salir bien y puedes aumentar el tamaño de tu inversion"*.
//
// Es la lectura correcta: la dominancia sube el ratio de 1,42 a 5,23 pero recorta las operaciones
// de 81 a 21. Como FILTRO cuesta dinero. Como TAMAÑO te quedas con las 81 y apuestas mas donde la
// cinta acompaña.
//
// ⚠️ Subir el tamaño sube el riesgo. Se reporta SIEMPRE la caja minima y la peor caida.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cargar, resumir } from "./consultar.mjs";
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
    n++; if ((o.l === "C" && c) || (o.l === "P" && v)) al += o.prima; else ba += o.prima;
  }
  if (n >= 5) DOM.set(tk + "|" + dia, (al - ba) / (al + ba));
}
const O0 = { objetivo: 1.50, suelo: 0.50 };
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
const TODO = [];
for (const [y, M] of ANOS) { const L = cargar(M).filter(MAG);
  for (const f of L) { const ds = cad.dias(f.tk); const i = ds.indexOf(f.dC);
    if (i < 20) { f.ma20 = null; continue; }
    const p = ds.slice(i - 20, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    f.ma20 = p.length < 15 ? null : f.spot / (p.reduce((a, b) => a + b, 0) / p.length) - 1; }
  for (const f of unaPorDia(L.filter((x) => x.ma20 != null && x.ma20 < 0))) {
    const d = DOM.get(f.tk + "|" + f.dia);
    const r = salir8(f);
    TODO.push({ ...f, y, acorde: d == null ? 0 : (f.l === "P" ? -1 : 1) * d, mult: r.mult, dSal: r.dSal });
  } }
TODO.sort((a, b) => a.dC.localeCompare(b.dC));

/** Cuenta con TAMAÑO VARIABLE por operacion. `pct(acorde)` -> fraccion del capital. */
function cuentaVar(L, { capital = 60000, maxAb = 4, pct }) {
  let caja = capital, ab = [], tomadas = 0, gana = 0, pierde = 0, pico = capital, peor = 0, minCaja = capital;
  const fechas = [...new Set([...L.map((x) => x.dC), ...L.map((x) => x.dSal)])].sort();
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  const invertido = () => ab.reduce((a, b) => a + b.dinero, 0);
  for (const hoy of fechas) {
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) {
      caja += ab[i].dinero * ab[i].mult; if (ab[i].mult > 1) gana++; else pierde++; ab.splice(i, 1); }
    for (const x of (porDia.get(hoy) || [])) {
      if (ab.length >= maxAb) continue;
      const patrimonio = caja + invertido();
      const quiere = patrimonio * pct(x.acorde);
      const n = Math.floor(Math.min(quiere, caja) / (x.ask * 100));
      if (n < 1) continue;
      const dinero = n * x.ask * 100;
      caja -= dinero; ab.push({ ...x, dinero }); tomadas++;
    }
    const v = caja + invertido(); if (v > pico) pico = v;
    const dd = 1 - v / pico; if (dd > peor) peor = dd;
    if (caja < minCaja) minCaja = caja;
  }
  for (const x of ab) { caja += x.dinero * x.mult; if (x.mult > 1) gana++; else pierde++; }
  return { final: caja, tomadas, gana, pierde, minCaja, caida: 100 * peor };
}
function tabla(titulo, capital, maxAb, ESCALAS) {
  console.log("");
  console.log("  ==============  " + titulo + "  ==============");
  console.log("");
  console.log("  " + "".padEnd(34) + ANOS.map(([y]) => y.padStart(11)).join("") +
    "CONTINUA".padStart(19) + "ops".padStart(5) + "caida".padStart(8) + "caja min".padStart(11));
  for (const [nom, pct] of ESCALAS) {
    const cel = [];
    for (const [y] of ANOS) {
      const L = TODO.filter((x) => x.y === y);
      if (!L.length) { cel.push("—".padStart(11)); continue; }
      const q = cuentaVar(L, { capital, maxAb, pct });
      cel.push(D(q.final - capital).padStart(11));
    }
    const q = cuentaVar(TODO, { capital, maxAb, pct });
    console.log("  " + nom.padEnd(34) + cel.join("") +
      (D(q.final) + " " + (100 * (Math.pow(Math.max(q.final, 1) / capital, 1 / 5.63) - 1)).toFixed(1) + "%").padStart(19) +
      String(q.tomadas).padStart(5) + ("−" + q.caida.toFixed(0) + "%").padStart(8) + D(q.minCaja).padStart(11));
  }
}
console.log("");
console.log("  reparto de las " + TODO.length + " senales por acorde:");
for (const [a, b, nom] of [[-2, 0, "en contra (<0)"], [0, 0.3, "neutro (0 a 0.3)"], [0.3, 2, "a favor (>=0.3)"]])
  console.log("     " + nom.padEnd(22) + String(TODO.filter((x) => x.acorde >= a && x.acorde < b).length).padStart(4) + " senales");
// ── LA ESCALERA CON MULTIPLICADORES IDENTICOS EN LAS DOS CUENTAS ──
// La posicion "normal" es $15.000 en las dos: 25% de $60.000 y 5% de $300.000.
// Aqui se aplican los MISMOS multiplicadores sobre esa base, para que las dos tablas comparen
// exactamente lo mismo y se vea si la FORMA de la escalera aguanta al cambiar de escala.
const ESCALERA = [
  ["1.0 / 1.0 / 1.0   fijo, sin dominancia", [1.0, 1.0, 1.0]],
  ["1.0 / 1.0 / 2.0   SOLO doblar las buenas", [1.0, 1.0, 2.0]],
  ["0.5 / 1.0 / 1.0   SOLO reducir las malas", [0.5, 1.0, 1.0]],
  ["0.5 / 1.0 / 2.0   las dos cosas", [0.5, 1.0, 2.0]],
];
const escalas = (base) => ESCALERA.map(([nom, m]) => [
  nom + "  →  " + m.map((x) => (100 * x * base).toFixed(1) + "%").join(" / "),
  (a) => base * (a < 0 ? m[0] : a < 0.3 ? m[1] : m[2]),
]);
tabla("TU CUENTA $60.000 · 4 huecos · base 25% = $15.000", 60000, 4, escalas(0.25));
tabla("CUENTA GRANDE $300.000 · 18 huecos · base 5% = $15.000", 300000, 18, escalas(0.05));
console.log("");
console.log("  el liston: $60.000 en SPY -> $125.148 (+13,9% al ano)");
console.log("");
