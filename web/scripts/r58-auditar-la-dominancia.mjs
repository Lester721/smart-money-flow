// AUDITORIA DE LA DOMINANCIA — "¿no me estas mintiendo?"
//
// Se comprueban CINCO cosas, la tercera es la que de verdad me preocupa:
//   A) ¿mira al futuro? el dia del golpe tiene que ser ANTERIOR al dia de compra
//   B) ¿el 19,3% se reproduce sumando las operaciones a mano?
//   C) 🔴 ¿la dominancia se esta midiendo CONTRA SI MISMA? el golpe de la señal esta dentro
//      del total del dia. Si la señal es $3M de $5M, "la cinta confirma" = "la señal es grande".
//      Se recalcula QUITANDO el propio contrato del total.
//   D) ¿esta el dinero concentrado en 2 o 3 operaciones?
//   E) ¿que pasa si la dominancia se toma con un dia MAS de retraso (que nadie discuta el timing)?
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cargar } from "./consultar.mjs";
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
const _fl = new Map();
function flujoDe(tk, dia) { const k = tk + dia; if (_fl.has(k)) return _fl.get(k);
  const p = join(FDIR, tk + "_d" + dia + ".json"); let v = [];
  try { v = JSON.parse(readFileSync(p, "utf8")); } catch { v = []; }
  _fl.set(k, v); if (_fl.size > 600) _fl.delete(_fl.keys().next().value); return v; }
/** Dominancia direccional del dia. `excluir` = {exp,K,l} para quitar el propio contrato. */
function domDe(tk, dia, excluir) {
  const L = flujoDe(tk, dia); let al = 0, ba = 0, n = 0, propio = 0, total = 0;
  for (const o of L) {
    if (!(o.ask > 0 && o.bid > 0 && o.prima > 0)) continue;
    const c = o.precio >= o.ask, v = o.precio <= o.bid; if (!c && !v) continue;
    total += o.prima;
    const esPropio = excluir && o.exp === excluir.exp && o.K === excluir.K && o.l === excluir.l;
    if (esPropio) { propio += o.prima; continue; }
    n++; if ((o.l === "C" && c) || (o.l === "P" && v)) al += o.prima; else ba += o.prima;
  }
  if (n < 5 || al + ba === 0) return null;
  return { dir: (al - ba) / (al + ba), propio, total, n };
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
const T = [];
for (const [y, M] of ANOS) { const L = cargar(M).filter(MAG);
  for (const f of L) { const ds = cad.dias(f.tk); const i = ds.indexOf(f.dC);
    if (i < 20) { f.ma20 = null; continue; }
    const p = ds.slice(i - 20, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    f.ma20 = p.length < 15 ? null : f.spot / (p.reduce((a, b) => a + b, 0) / p.length) - 1; }
  for (const f of unaPorDia(L.filter((x) => x.ma20 != null && x.ma20 < 0))) {
    const r = salir8(f);
    const conmigo = domDe(f.tk, f.dia, null);
    const sinmigo = domDe(f.tk, f.dia, { exp: f.exp, K: f.K, l: f.l });
    const sg = f.l === "P" ? -1 : 1;
    // la vispera del golpe, para la comprobacion E
    const ds = cad.dias(f.tk); const i = ds.indexOf(f.dia);
    const ayer = i > 0 ? domDe(f.tk, ds[i - 1], null) : null;
    T.push({ ...f, y, mult: r.mult, dSal: r.dSal,
      acorde: conmigo ? sg * conmigo.dir : 0,
      acordeSin: sinmigo ? sg * sinmigo.dir : null,
      acordeAyer: ayer ? sg * ayer.dir : null,
      propio: sinmigo ? sinmigo.propio : 0, total: sinmigo ? sinmigo.total : 0 });
  } }
T.sort((a, b) => a.dC.localeCompare(b.dC));
console.log("");
console.log("  ══ A) ¿MIRA AL FUTURO? ══");
const mal = T.filter((x) => !(x.dia < x.dC)).length;
console.log("  el dia del golpe es ANTERIOR al de compra en " + (T.length - mal) + " de " + T.length +
  (mal ? "  ⚠ " + mal + " FALLOS" : "  ✓"));
const sinDom = T.filter((x) => x.acorde === 0 && x.propio === 0).length;
console.log("  señales sin dominancia calculable: " + sinDom);

function cuentaVar(L, { capital, maxAb, pct, campo = "acorde" }) {
  let caja = capital, ab = [], tomadas = [], pico = capital, peor = 0;
  const fechas = [...new Set([...L.map((x) => x.dC), ...L.map((x) => x.dSal)])].sort();
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
  for (const hoy of fechas) {
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    for (const x of (porDia.get(hoy) || [])) {
      if (ab.length >= maxAb) continue;
      const a = x[campo] == null ? 0 : x[campo];
      const quiere = (caja + inv()) * pct(a);
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
const DOBLA = (a) => a >= 0.3 ? 0.50 : 0.25;
const FIJO = () => 0.25;
console.log("");
console.log("  ══ B) ¿SE REPRODUCE EL 19,3% SUMANDO A MANO? ══");
const q = cuentaVar(T, { capital: 60000, maxAb: 4, pct: DOBLA });
const suma = q.tomadas.reduce((a, x) => a + x.dinero * (x.mult - 1), 0);
console.log("  cuenta final: " + D(q.final) + "  (" + (100 * (Math.pow(q.final / 60000, 1 / 5.63) - 1)).toFixed(1) + "% al año)");
console.log("  suma de las " + q.tomadas.length + " operaciones: " + D(suma) + " · 60.000 + eso = " + D(60000 + suma) +
  (Math.abs(60000 + suma - q.final) < 1 ? "  ✓ cuadra" : "  ⚠ NO CUADRA"));
console.log("");
console.log("  ══ C) 🔴 ¿LA DOMINANCIA SE MIDE CONTRA SI MISMA? ══");
const conP = T.filter((x) => x.total > 0);
const frac = conP.map((x) => x.propio / x.total).sort((a, b) => a - b);
console.log("  señales donde el propio golpe SE ENCONTRO en el flujo: " + T.filter((x) => x.propio > 0).length + " de " + T.length +
  (T.filter((x) => x.propio > 0).length === T.length ? "  ✓" : "  ⚠ si no es 81, el emparejamiento de tipos falla"));
console.log("  el golpe propio es, del total clasificado del dia:");
console.log("     mediana " + (100 * frac[Math.floor(frac.length / 2)]).toFixed(0) + "%  ·  p75 " +
  (100 * frac[Math.floor(frac.length * 0.75)]).toFixed(0) + "%  ·  maximo " + (100 * frac[frac.length - 1]).toFixed(0) + "%");
const dobles = T.filter((x) => x.acorde >= 0.3);
const doblesSin = T.filter((x) => x.acordeSin != null && x.acordeSin >= 0.3);
console.log("  señales que confirman CON su propio golpe dentro: " + dobles.length);
console.log("  señales que confirman SIN su propio golpe:        " + doblesSin.length);
const q2 = cuentaVar(T, { capital: 60000, maxAb: 4, pct: DOBLA, campo: "acordeSin" });
console.log("  cuenta QUITANDO el propio golpe del calculo: " + D(q2.final) + "  (" +
  (100 * (Math.pow(Math.max(q2.final, 1) / 60000, 1 / 5.63) - 1)).toFixed(1) + "% al año)");
console.log("");
console.log("  ══ D) ¿ESTA EL DINERO EN 2 O 3 OPERACIONES? ══");
const ops = q.tomadas.map((x) => ({ ...x, din: x.dinero * (x.mult - 1) })).sort((a, b) => b.din - a.din);
const tot = ops.reduce((a, x) => a + x.din, 0);
console.log("  " + "dia".padEnd(11) + "tk".padEnd(6) + "contrato".padEnd(13) + "n".padStart(4) + "acorde".padStart(8) + "mult".padStart(7) + "dinero".padStart(11));
for (const x of ops.slice(0, 6))
  console.log("  " + x.dC.padEnd(11) + x.tk.padEnd(6) + (x.l + x.K).padEnd(13) + String(x.n).padStart(4) +
    x.acorde.toFixed(2).padStart(8) + x.mult.toFixed(2).padStart(7) + D(x.din).padStart(11));
console.log("  las 3 mayores: " + D(ops.slice(0, 3).reduce((a, x) => a + x.din, 0)) + " de " + D(tot) +
  "  (" + (100 * ops.slice(0, 3).reduce((a, x) => a + x.din, 0) / tot).toFixed(0) + "%)");
console.log("");
console.log("  ══ E) ¿Y SI LA DOMINANCIA SE TOMA DE LA VISPERA DEL GOLPE? ══");
const q3 = cuentaVar(T, { capital: 60000, maxAb: 4, pct: DOBLA, campo: "acordeAyer" });
console.log("  con la dominancia de AYER (un dia mas de margen): " + D(q3.final) + "  (" +
  (100 * (Math.pow(Math.max(q3.final, 1) / 60000, 1 / 5.63) - 1)).toFixed(1) + "% al año)");
const qf = cuentaVar(T, { capital: 60000, maxAb: 4, pct: FIJO });
console.log("");
console.log("  ══ RESUMEN ══");
console.log("  tamaño fijo, sin dominancia ......... " + D(qf.final) + "  (" + (100 * (Math.pow(qf.final / 60000, 1 / 5.63) - 1)).toFixed(1) + "%)");
console.log("  doblando, dominancia CON su golpe ... " + D(q.final) + "  (" + (100 * (Math.pow(q.final / 60000, 1 / 5.63) - 1)).toFixed(1) + "%)");
console.log("  doblando, dominancia SIN su golpe ... " + D(q2.final) + "  (" + (100 * (Math.pow(Math.max(q2.final, 1) / 60000, 1 / 5.63) - 1)).toFixed(1) + "%)");
console.log("  doblando, dominancia de la VISPERA .. " + D(q3.final) + "  (" + (100 * (Math.pow(Math.max(q3.final, 1) / 60000, 1 / 5.63) - 1)).toFixed(1) + "%)");
console.log("  el liston SPY ....................... $125,148  (13,9%)");
console.log("");
