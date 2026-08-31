// LA REGLA FINAL, CON Y SIN DOMINANCIA — año por año, las dos cuentas.
// Regla base: golpe >$500k al ask · 12x el OI de la vispera · dentro del dinero · >=$10.000 ·
//             >=5 dias · despues de las 14:00 · la accion BAJO su media de 20d ·
//             UNA por ticker-dia (venc. mas lejano) · salida al 8% (tope 60 dias)
// La dominancia se toma del dia del GOLPE (se sabe antes de comprar).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cargar, resumir, cuenta } from "./consultar.mjs";
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
// ── dominancia direccional de cada ticker-dia ──
const DOM = new Map();
for (const f of readdirSync(FDIR)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g; if (dia < "20210101") continue;
  let L; try { L = JSON.parse(readFileSync(join(FDIR, f), "utf8")); } catch { continue; }
  let al = 0, ba = 0, n = 0;
  for (const o of L) {
    if (!(o.ask > 0 && o.bid > 0 && o.prima > 0)) continue;
    const esCompra = o.precio >= o.ask, esVenta = o.precio <= o.bid;
    if (!esCompra && !esVenta) continue;
    n++;
    if ((o.l === "C" && esCompra) || (o.l === "P" && esVenta)) al += o.prima; else ba += o.prima;
  }
  if (n < 5) continue;
  DOM.set(tk + "|" + dia, (al - ba) / (al + ba));
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
const con8 = (L) => L.map((f) => { const r = salir8(f); return { ...f, camino: [[r.dSal, r.mult * f.ask, r.mult * f.ask]] }; });
function unaPorDia(L) { const g = new Map();
  for (const f of L) { const k = f.tk + f.dC; if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
  return [...g.values()].map((G) => G.reduce((a, b) =>
    (Number(b.exp) > Number(a.exp) || (Number(b.exp) === Number(a.exp) && b.prof < a.prof)) ? b : a
  )).sort((a, b) => a.dC.localeCompare(b.dC)); }
const DAT = {};
for (const [y, M] of ANOS) { const L = cargar(M).filter(MAG);
  for (const f of L) { const ds = cad.dias(f.tk); const i = ds.indexOf(f.dC);
    if (i < 20) { f.ma20 = null; continue; }
    const p = ds.slice(i - 20, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    f.ma20 = p.length < 15 ? null : f.spot / (p.reduce((a, b) => a + b, 0) / p.length) - 1; }
  DAT[y] = unaPorDia(L.filter((x) => x.ma20 != null && x.ma20 < 0))
    .map((f) => { const d = DOM.get(f.tk + "|" + f.dia);
      return { ...f, acorde: d == null ? null : (f.l === "P" ? -1 : 1) * d }; }); }

const VARS = [
  ["SIN dominancia (la regla de hoy)", () => true],
  ["la cinta NO en contra (acorde ≥ 0)", (f) => f.acorde != null && f.acorde >= 0],
  ["la cinta a favor (acorde ≥ 0.3)", (f) => f.acorde != null && f.acorde >= 0.3],
  ["la cinta muy a favor (≥ 0.5)", (f) => f.acorde != null && f.acorde >= 0.5],
];
function tabla(titulo, cap, porOp, maxAb) {
  console.log("");
  console.log("  ==============  " + titulo + "  ==============");
  console.log("");
  console.log("  " + "".padEnd(36) + ANOS.map(([y]) => y.padStart(11)).join("") +
    "CONTINUA".padStart(19) + "ops".padStart(5) + "ratio".padStart(7) + "caja min".padStart(11));
  for (const [nom, fl] of VARS) {
    const cel = []; const TT = []; let nops = 0;
    for (const [y] of ANOS) {
      const L = con8(DAT[y].filter(fl));
      if (!L.length) { cel.push("—".padStart(11)); continue; }
      TT.push(...L);
      const q = cuenta(L, { capital: cap, porOp, maxAbiertas: maxAb, ...O0 });
      nops += q.tomadas.length;
      cel.push(D(q.ganancia).padStart(11));
    }
    TT.sort((a, b) => a.dC.localeCompare(b.dC));
    const q = TT.length ? cuenta(TT, { capital: cap, porOp, maxAbiertas: maxAb, ...O0 }) : null;
    const r = TT.length ? resumir(TT, O0) : null;
    console.log("  " + nom.padEnd(36) + cel.join("") +
      (q ? D(q.final) + " " + (100 * (Math.pow(Math.max(q.final, 1) / cap, 1 / 5.63) - 1)).toFixed(1) + "%" : "—").padStart(19) +
      String(q ? q.tomadas.length : 0).padStart(5) +
      (r ? (r.r === Infinity ? "∞" : r.r.toFixed(2)) : "—").padStart(7) +
      (q ? D(q.minCaja) : "—").padStart(11));
  }
}
console.log("");
console.log("  senales por variante (antes del tope de posicion):");
for (const [nom, fl] of VARS) {
  const n = ANOS.reduce((a, [y]) => a + DAT[y].filter(fl).length, 0);
  console.log("     " + nom.padEnd(38) + String(n).padStart(4) + " senales   (" + (n / 5.63).toFixed(1) + " al ano)");
}
tabla("TU CUENTA $60.000 · 25% por posicion · 4 huecos", 60000, 15000, 4);
tabla("CUENTA GRANDE $300.000 · 5% por posicion · 18 huecos", 300000, 15000, 18);
console.log("");
console.log("  el liston: $60.000 en SPY -> $125.148 (+13,9% al ano)");
console.log("");
