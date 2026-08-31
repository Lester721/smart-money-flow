// TRES PREGUNTAS DE LESTER (2026-08-27):
//   A) ¿la cuenta grande pierde eficiencia por ser grande? Corre al 5% x 18 y da 5,0% mientras la
//      pequeña al 25% x 4 da 19,3%. ¿Es un limite real o es una decision mia de reparto?
//   B) ¿aguanta la LIQUIDEZ? cuantos contratos hacen falta por posicion segun el tamano de cuenta.
//   C) los dos ingredientes de EVA que quedan sin probar: la HORA del golpe y la REPETICION
//      (cuantas veces golpearon el mismo contrato ese dia).
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
    T.push({ ...f, y, mult: r.mult, dSal: r.dSal, acorde: d == null ? 0 : (f.l === "P" ? -1 : 1) * d }); } }
T.sort((a, b) => a.dC.localeCompare(b.dC));
const DOBLA = (a) => a >= 0.3 ? 0.50 : 0.25;
function cuentaVar(L, { capital, maxAb, base }) {
  let caja = capital, ab = [], tomadas = [], pico = capital, peor = 0, sumaDesplegado = 0, dias = 0;
  const fechas = [...new Set([...L.map((x) => x.dC), ...L.map((x) => x.dSal)])].sort();
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
  for (const hoy of fechas) {
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    for (const x of (porDia.get(hoy) || [])) {
      if (ab.length >= maxAb) continue;
      const quiere = (caja + inv()) * (base * (x.acorde >= 0.3 ? 2 : 1));
      const n = Math.floor(Math.min(quiere, caja) / (x.ask * 100));
      if (n < 1) continue;
      const dinero = n * x.ask * 100;
      caja -= dinero; const op = { ...x, dinero, n }; ab.push(op); tomadas.push(op);
    }
    const v = caja + inv(); if (v > pico) pico = v;
    const dd = 1 - v / pico; if (dd > peor) peor = dd;
    sumaDesplegado += inv() / v; dias++;
  }
  for (const x of ab) caja += x.dinero * x.mult;
  return { final: caja, tomadas, caida: 100 * peor, desplegado: 100 * sumaDesplegado / dias };
}
const anual = (f, c) => (100 * (Math.pow(Math.max(f, 1) / c, 1 / 5.63) - 1)).toFixed(1) + "%";
console.log("");
console.log("  ══ A) ¿PIERDE EFICIENCIA LA CUENTA GRANDE, O ES MI REPARTO? ══");
console.log("");
console.log("  " + "cuenta".padStart(10) + "por op".padStart(9) + "huecos".padStart(8) +
  "acaba con".padStart(14) + "al ano".padStart(9) + "ops".padStart(5) + "caida".padStart(8) +
  "% desplegado".padStart(14) + "contratos/op".padStart(14));
for (const [cap, base, maxAb] of [
  [60000, 0.25, 4], [300000, 0.05, 18], [300000, 0.25, 4], [300000, 0.125, 8],
  [1000000, 0.25, 4], [1000000, 0.125, 8], [3000000, 0.25, 4]]) {
  const q = cuentaVar(T, { capital: cap, maxAb, base });
  const cn = q.tomadas.map((x) => x.n).sort((a, b) => a - b);
  console.log("  " + D(cap).padStart(10) + ((100 * base).toFixed(1) + "%").padStart(9) + String(maxAb).padStart(8) +
    D(q.final).padStart(14) + anual(q.final, cap).padStart(9) + String(q.tomadas.length).padStart(5) +
    ("−" + q.caida.toFixed(0) + "%").padStart(8) + (q.desplegado.toFixed(0) + "%").padStart(14) +
    ("med " + (cn.length ? cn[Math.floor(cn.length / 2)] : 0) + " · max " + (cn.length ? cn[cn.length - 1] : 0)).padStart(14));
}
console.log("");
console.log("  ══ B) LIQUIDEZ: los contratos que necesitas contra los que se negociaron ══");
console.log("");
console.log("  " + "cuenta".padStart(10) + "contratos que compras".padStart(24) + "el golpe fue de".padStart(18) + "eres el".padStart(10));
for (const [cap, base, maxAb] of [[60000, 0.25, 4], [300000, 0.25, 4], [1000000, 0.25, 4], [3000000, 0.25, 4]]) {
  const q = cuentaVar(T, { capital: cap, maxAb, base });
  const frac = q.tomadas.map((x) => x.n / x.tam).sort((a, b) => a - b);
  const cn = q.tomadas.map((x) => x.n).sort((a, b) => a - b);
  console.log("  " + D(cap).padStart(10) +
    ("mediana " + cn[Math.floor(cn.length / 2)] + " · p90 " + cn[Math.floor(cn.length * 0.9)]).padStart(24) +
    ("mediana " + q.tomadas.map((x) => x.tam).sort((a, b) => a - b)[Math.floor(q.tomadas.length / 2)]).padStart(18) +
    ((100 * frac[Math.floor(frac.length / 2)]).toFixed(1) + "%").padStart(10));
}
const med = (v) => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
function tramos(nom, campo, cortes) {
  console.log("");
  console.log("  ── " + nom + " ──");
  console.log("  " + "".padEnd(20) + "n".padStart(5) + "ganan".padStart(8) + "mult med".padStart(10) + "ratio".padStart(8));
  for (const [a, b, etq] of cortes) {
    const L = T.filter((x) => campo(x) >= a && campo(x) < b);
    if (!L.length) { console.log("  " + etq.padEnd(20) + "0".padStart(5)); continue; }
    const g = L.filter((x) => x.mult > 1);
    const gan = L.filter((x) => x.mult > 1).reduce((s, x) => s + (x.mult - 1) * x.ask * 100, 0);
    const per = -L.filter((x) => x.mult <= 1).reduce((s, x) => s + (x.mult - 1) * x.ask * 100, 0);
    console.log("  " + etq.padEnd(20) + String(L.length).padStart(5) +
      ((100 * g.length / L.length).toFixed(0) + "%").padStart(8) +
      med(L.map((x) => x.mult)).toFixed(2).padStart(10) + (per ? (gan / per).toFixed(2) : "∞").padStart(8));
  }
}
console.log("");
console.log("  ══ C) LOS DOS INGREDIENTES DE EVA QUE QUEDABAN ══");
tramos("LA HORA DEL GOLPE (ahora el corte es >= 14:00)", (x) => Number(x.hora.slice(0, 2)) + Number(x.hora.slice(3)) / 60,
  [[14, 14.5, "14:00 a 14:30"], [14.5, 15, "14:30 a 15:00"], [15, 15.5, "15:00 a 15:30"], [15.5, 24, "15:30 al cierre"]]);
tramos("LA REPETICION (golpes al mismo contrato)", (x) => x.golpes,
  [[1, 2, "1 solo golpe"], [2, 4, "2 a 3"], [4, 10, "4 a 9"], [10, 1e9, "10 o mas"]]);
console.log("");
