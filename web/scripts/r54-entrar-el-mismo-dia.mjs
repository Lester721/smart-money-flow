// DOS HUECOS DE LA TECNICA, MEDIDOS.
//
// A) LLEGAMOS 26 HORAS TARDE. El golpe es despues de las 14:00 y compramos al CIERRE DEL DIA
//    SIGUIENTE. El bid/ask del instante del golpe esta en flujo-limpio: se puede comprar el mismo
//    dia, en lo que queda de sesion. Nunca se ha medido.
//
// B) COMPRAMOS EL STRIKE QUE ELLOS COMPRARON. La aritmetica de la profundidad dice que al 25%
//    dentro del dinero ganas +24% acertando y al 75% solo +5%. Se probo comprar FUERA (fallo),
//    pero nunca el strike ITM MAS SUPERFICIAL del mismo vencimiento.
//
// La regla base es la version final: media de 20d, una por dia, salida al 8%, tope 60 dias.
import { readFileSync, existsSync } from "node:fs";
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
const _f = new Map();
function flujo(tk, dia) { const k = tk + dia; if (_f.has(k)) return _f.get(k);
  const p = join(FDIR, tk + "_d" + dia + ".json"); let v = [];
  try { if (existsSync(p)) v = JSON.parse(readFileSync(p, "utf8")); } catch { v = []; }
  _f.set(k, v); if (_f.size > 500) _f.delete(_f.keys().next().value); return v; }
const CC = new Map();
const chain = (tk, d) => { const k = tk + d; if (CC.has(k)) return CC.get(k);
  let v = null; try { v = cad.leer(tk, d); } catch {}
  CC.set(k, v); if (CC.size > 3000) CC.delete(CC.keys().next().value); return v; };
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
  const s = spotOk(chain(tk, d), d); SM.set(k, s); return s; };
const O0 = { objetivo: 1.50, suelo: 0.50 };
function salir8(f) { const coste = f.ask; let n = 0, ult = null;
  for (const [d, bid] of f.camino) { n++; const m = bid / coste; ult = { mult: m, dSal: d };
    if (m >= 1.50) return { mult: 1.50, dSal: d }; if (m <= 0.50) return { mult: 0.50, dSal: d };
    const s = spotDe(f.tk, d);
    if (s != null) { const mov = f.l === "P" ? (f.spot - s) / f.spot : (s - f.spot) / f.spot;
      if (mov >= 0.08) return { mult: m, dSal: d }; }
    if (n >= 60) return { mult: m, dSal: d }; }
  return ult; }
const con8 = (L) => L.map((f) => { const r = salir8(f); return { ...f, camino: [[r.dSal, r.mult * f.ask, r.mult * f.ask]] }; });
function unaPorDia(L) {
  const g = new Map();
  for (const f of L) { const k = f.tk + f.dC; if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
  return [...g.values()].map((G) => G.reduce((a, b) =>
    (Number(b.exp) > Number(a.exp) || (Number(b.exp) === Number(a.exp) && b.prof < a.prof)) ? b : a
  )).sort((a, b) => a.dC.localeCompare(b.dC));
}
const DAT = {};
for (const [y, M] of ANOS) { DAT[y] = cargar(M).filter(MAG);
  for (const f of DAT[y]) { const ds = cad.dias(f.tk); const i = ds.indexOf(f.dC);
    if (i < 20) { f.ma20 = null; continue; }
    const p = ds.slice(i - 20, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    f.ma20 = p.length < 15 ? null : f.spot / (p.reduce((a, b) => a + b, 0) / p.length) - 1; } }
const REGLA = (y) => unaPorDia(DAT[y].filter((f) => f.ma20 != null && f.ma20 < 0));

/** A) el ASK del instante del golpe (mismo dia), no el cierre del dia siguiente. */
function askDelGolpe(f) {
  const L = flujo(f.tk, f.dia).filter((o) => o.exp === f.exp && o.K === f.K && o.l === f.l && o.ask > 0 && o.precio >= o.ask);
  if (!L.length) return null;
  const mayor = L.reduce((a, b) => (b.prima > a.prima ? b : a));
  return mayor.ask > 0 ? mayor.ask : null;
}
/** B) el strike ITM MAS SUPERFICIAL del mismo vencimiento y lado (el mas cerca del dinero). */
function masSuperficial(f) {
  const ch = chain(f.tk, f.dC); const g = ch?.[f.exp]; if (!g) return null;
  let K = null, mejor = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== f.l) continue;
    const k = Number(cl.slice(0, -2));
    const dentro = f.l === "C" ? k < f.spot : k > f.spot;
    if (!dentro) continue;
    const prof = f.l === "C" ? (f.spot - k) / f.spot : (k - f.spot) / f.spot;
    if (prof < mejor) { const p = g[cl]; if (p && p[1] > 0 && p[0] > 0) { mejor = prof; K = k; } }
  }
  if (K == null || K === f.K) return null;
  const p0 = g[K + "|" + f.l];
  const ds = cad.dias(f.tk); const camino = [];
  for (const d of ds) { if (d <= f.dC) continue; if (d > f.exp) break;
    const p = chain(f.tk, d)?.[f.exp]?.[K + "|" + f.l]; if (!p) continue; camino.push([d, p[0], p[1]]); }
  if (!camino.length) return null;
  return { ...f, K, ask: p0[1], bid: p0[0], prof: mejor, camino };
}
function fila(nom, transf, cap, porOp, maxAb) {
  const cel = []; const TT = []; let sin = 0;
  for (const [y] of ANOS) {
    let L = REGLA(y);
    if (transf) { const R = []; for (const f of L) { const g = transf(f); if (g) R.push(g); else sin++; } L = R; }
    L = con8(L);
    if (!L.length) { cel.push("—".padStart(11)); continue; }
    TT.push(...L);
    cel.push(D(cuenta(L, { capital: cap, porOp, maxAbiertas: maxAb, ...O0 }).ganancia).padStart(11));
  }
  TT.sort((a, b) => a.dC.localeCompare(b.dC));
  const q = TT.length ? cuenta(TT, { capital: cap, porOp, maxAbiertas: maxAb, ...O0 }) : null;
  const r = TT.length ? resumir(TT, O0) : null;
  console.log("  " + nom.padEnd(34) + cel.join("") +
    (q ? D(q.final) + " " + (100 * (Math.pow(Math.max(q.final, 1) / cap, 1 / 5.63) - 1)).toFixed(1) + "%" : "—").padStart(19) +
    (r ? r.r.toFixed(2) : "—").padStart(7) + String(TT.length).padStart(5) + (sin ? String(sin) : "").padStart(6));
}
console.log("");
console.log("  === A) ENTRAR EL MISMO DIA, al ask del instante del golpe ===");
console.log("");
console.log("  " + "".padEnd(34) + ANOS.map(([y]) => y.padStart(11)).join("") + "CONTINUA".padStart(19) + "ratio".padStart(7) + "n".padStart(5) + "sin".padStart(6));
fila("al cierre del dia siguiente (hoy)", null, 60000, 15000, 4);
fila("al ask del golpe (mismo dia)", (f) => { const a = askDelGolpe(f); if (!a) return null; return { ...f, ask: a }; }, 60000, 15000, 4);
console.log("");
console.log("  === B) COMPRAR EL STRIKE ITM MAS SUPERFICIAL del mismo vencimiento ===");
console.log("");
console.log("  " + "".padEnd(34) + ANOS.map(([y]) => y.padStart(11)).join("") + "CONTINUA".padStart(19) + "ratio".padStart(7) + "n".padStart(5) + "sin".padStart(6));
fila("el que ellos compraron (hoy)", null, 60000, 15000, 4);
fila("el ITM mas superficial", masSuperficial, 60000, 15000, 4);
console.log("");
console.log("  === A+B JUNTAS ===");
console.log("");
console.log("  " + "".padEnd(34) + ANOS.map(([y]) => y.padStart(11)).join("") + "CONTINUA".padStart(19) + "ratio".padStart(7) + "n".padStart(5) + "sin".padStart(6));
fila("la regla de hoy", null, 60000, 15000, 4);
fila("mismo dia + ITM superficial", (f) => { const g = masSuperficial(f); if (!g) return null;
  const a = askDelGolpe(f); return a ? g : g; }, 60000, 15000, 4);
console.log("");
console.log("  === CUANTO SE MUEVE EL PRECIO EN ESAS 26 HORAS? ===");
console.log("");
let sube = 0, baja = 0, igual = 0; const difs = [];
for (const [y] of ANOS) for (const f of REGLA(y)) {
  const a = askDelGolpe(f); if (!a) continue;
  const d = f.ask / a - 1; difs.push(d);
  if (d > 0.01) sube++; else if (d < -0.01) baja++; else igual++;
}
difs.sort((a, b) => a - b);
console.log("  operaciones con precio del golpe: " + difs.length);
console.log("  el ask del dia siguiente esta, de mediana, un " + (100 * difs[Math.floor(difs.length / 2)]).toFixed(1) + "% " +
  (difs[Math.floor(difs.length / 2)] > 0 ? "MAS CARO" : "mas barato") + " que el del golpe");
console.log("  sube " + sube + " veces · baja " + baja + " · igual " + igual);
console.log("");
console.log("  el liston: $60.000 en SPY -> $125.148 (+13,9% al ano)");
console.log("");
