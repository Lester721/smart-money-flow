// EL DINERO MUERTO — la cuenta esta entre el 52% y el 67% en efectivo esperando señales.
//
// Lester (2026-08-27): *"asegurate que si no pasamos la prueba vas a encontrar como obtener el
// resultado que nos lleve al camino correcto"*.
//
// Con 13 señales al año la cuenta NO PUEDE estar llena. Eso no es un defecto de la señal: es que
// el modelo deja el efectivo a cero. Aqui el efectivo ocioso se aparca en SPY y se vende cuando
// hace falta para una señal.
//
// ⚠️ ESTO NO MEJORA LA SEÑAL. Mejora la CUENTA. Son cosas distintas y hay que decirlo.
//
// Se mide tambien la mezcla pura (X% estrategia / resto SPY) para separar los dos efectos.
// AUDIT DENTRO, antes de enseñar.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cargar } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const BASE = (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 10000 && f.hora >= "14:30" && f.vsOI >= 12;
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
function salir(f, pc) { const coste = f.ask; let k = 0, ult = null;
  for (const [d, bid] of f.camino) { k++; const m = bid / coste; ult = { mult: m, dSal: d };
    if (m >= 1.50) return { mult: 1.50, dSal: d }; if (m <= 0.50) return { mult: 0.50, dSal: d };
    const s = spotDe(f.tk, d);
    if (s != null) { const mv = f.l === "P" ? (f.spot - s) / f.spot : (s - f.spot) / f.spot;
      if (mv >= pc) return { mult: m, dSal: d }; }
    if (k >= 60) return { mult: m, dSal: d }; }
  return ult; }
function unaPorDia(L) { const g = new Map();
  for (const f of L) { const k = f.tk + f.dC; if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
  return [...g.values()].map((G) => G.reduce((a, b) =>
    (Number(b.exp) > Number(a.exp) || (Number(b.exp) === Number(a.exp) && b.prof < a.prof)) ? b : a
  )).sort((a, b) => a.dC.localeCompare(b.dC)); }
const T = [];
for (const [y, M] of ANOS) { const L = cargar(M).filter(BASE);
  for (const f of L) { const ds = cad.dias(f.tk); const i = ds.indexOf(f.dC);
    if (i < 20) { f.ma20 = null; continue; }
    const p = ds.slice(i - 20, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    f.ma20 = p.length < 15 ? null : f.spot / (p.reduce((a, b) => a + b, 0) / p.length) - 1; }
  for (const f of unaPorDia(L.filter((x) => x.ma20 != null && x.ma20 < 0))) {
    const d = DOM.get(f.tk + "|" + f.dia); const r = salir(f, 0.08);
    T.push({ ...f, y, mult: r.mult, dSal: r.dSal,
      dobla: ((d == null ? 0 : (f.l === "P" ? -1 : 1) * d) >= 0.3) || (f.golpes >= 2 && f.golpes < 10) }); } }
T.sort((a, b) => a.dC.localeCompare(b.dC));
const dSPY = cad.dias("SPY").filter((d) => d >= "20210101" && d <= "20260819");
const pSPY = new Map(); for (const d of dSPY) { const s = spotDe("SPY", d); if (s > 0) pSPY.set(d, s); }
const DIAS = dSPY.filter((d) => pSPY.has(d));
const P0 = pSPY.get(DIAS[0]), P1 = pSPY.get(DIAS[DIAS.length - 1]);
const anual = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / 5.63) - 1);
/** enSPY = el efectivo ocioso se aparca en SPY. mezcla = fraccion del patrimonio reservada a SPY. */
function cuenta({ capital = 60000, enSPY = false, mezcla = 0 }) {
  let caja = capital, accSPY = 0, ab = [], tomadas = [], pico = capital, peor = 0;
  let sumaOcioso = 0, nd = 0;
  const porDia = new Map();
  for (const x of T) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  const salidas = new Map();
  for (const x of T) { if (!salidas.has(x.dSal)) salidas.set(x.dSal, []); salidas.get(x.dSal).push(x); }
  for (const hoy of DIAS) {
    const px = pSPY.get(hoy);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    for (const x of (porDia.get(hoy) || [])) {
      if (ab.length >= 4) continue;
      const patr = caja + accSPY * px + inv();
      const tope = patr * (1 - mezcla) * 0.25 * (x.dobla ? 2 : 1);
      let disp = caja;
      if (enSPY || mezcla > 0) { const falta = Math.min(tope, patr) - caja;
        if (falta > 0 && accSPY > 0) { const vender = Math.min(accSPY, falta / px); accSPY -= vender; caja += vender * px; disp = caja; } }
      const n = Math.floor(Math.min(tope, disp) / (x.ask * 100));
      if (n < 1) continue;
      const dinero = n * x.ask * 100;
      caja -= dinero; ab.push({ ...x, dinero, n }); tomadas.push({ ...x, dinero, n });
    }
    if (enSPY || mezcla > 0) {
      const patr = caja + accSPY * px + ab.reduce((a, b) => a + b.dinero, 0);
      const objetivo = enSPY ? caja : Math.max(0, patr * mezcla - accSPY * px);
      if (enSPY && caja > 0) { accSPY += caja / px; caja = 0; }
      else if (!enSPY && objetivo > 0 && caja > 0) { const c = Math.min(caja, objetivo); accSPY += c / px; caja -= c; }
    }
    const v = caja + accSPY * px + ab.reduce((a, b) => a + b.dinero, 0);
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd;
    sumaOcioso += (caja + accSPY * px) / v; nd++;
  }
  const px = pSPY.get(DIAS[DIAS.length - 1]);
  for (const x of ab) caja += x.dinero * x.mult;
  return { final: caja + accSPY * px, tomadas, caida: 100 * peor, ocioso: 100 * sumaOcioso / nd };
}
console.log("");
console.log("  ══ AUDIT ══");
const ref = cuenta({});
const suma = ref.tomadas.reduce((a, x) => a + x.dinero * (x.mult - 1), 0);
console.log("  la regla sola reproduce: " + D(ref.final) + " (esperado $202.630)" + (Math.abs(ref.final - 202630) < 3 ? "  ✓" : "  ⚠"));
console.log("  la suma cuadra: $60.000 + " + D(suma) + " = " + D(60000 + suma) + (Math.abs(60000 + suma - ref.final) < 2 ? "  ✓" : "  ⚠"));
console.log("  SPY de " + DIAS[0] + " a " + DIAS[DIAS.length - 1] + ": $" + P0.toFixed(2) + " → $" + P1.toFixed(2) +
  "  (" + anual(60000 * P1 / P0, 60000).toFixed(1) + "% al año)");
console.log("  el efectivo ocioso de la regla sola: " + ref.ocioso.toFixed(0) + "% del patrimonio de media");
console.log("");
console.log("  ══ APARCAR EL EFECTIVO OCIOSO EN SPY ══");
console.log("");
console.log("  " + "".padEnd(34) + "acaba con".padStart(14) + "al año".padStart(9) + "caida".padStart(8) + "ocioso".padStart(9));
const V = [
  ["la regla sola (efectivo a 0%)", { }],
  ["+ el efectivo ocioso en SPY", { enSPY: true }],
  ["SPY solo, sin operar", null],
  ["mezcla: 25% reservado a SPY", { mezcla: 0.25 }],
  ["mezcla: 50% reservado a SPY", { mezcla: 0.50 }],
];
for (const [nom, op] of V) {
  if (op === null) { const f = 60000 * P1 / P0;
    console.log("  " + nom.padEnd(34) + D(f).padStart(14) + (anual(f, 60000).toFixed(1) + "%").padStart(9) + "".padStart(8) + "100%".padStart(9));
    continue; }
  const q = cuenta(op);
  console.log("  " + nom.padEnd(34) + D(q.final).padStart(14) + (anual(q.final, 60000).toFixed(1) + "%").padStart(9) +
    ("−" + q.caida.toFixed(0) + "%").padStart(8) + (q.ocioso.toFixed(0) + "%").padStart(9));
}
console.log("");
