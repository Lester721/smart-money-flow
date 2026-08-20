// DECISION FINAL · 3 — la t FUERA DE MUESTRA y el liston honesto.
import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const sum = (v) => v.reduce((a, b) => a + b, 0);
const med = (v) => (v.length ? sum(v) / v.length : NaN);
const desv = (v) => { const m = med(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const { dias } = JSON.parse(readFileSync("scripts/amplitud-riesgo-dias.json", "utf8"));
const N = dias.length;
const MA = {};
for (const k of [5, 50]) MA[k] = dias.map((_, i) => { if (i < k) return null; let s = 0; for (let j = i - k; j < i; j++) s += dias[j].cierre; return s / k; });
const op = (i, cfg) => {
  const d = dias[i], p = d.pnl[String(cfg.dist)], c = d.cred[String(cfg.dist)];
  if (p == null || c == null) return false;
  const m1 = MA[cfg.a][i], m2 = MA[cfg.b][i];
  if (m1 == null || m2 == null || d.sp11 < m1 || d.sp11 < m2) return false;
  return !(cfg.suelo && c < cfg.suelo);
};
const es5 = (v) => { const o = [...v].sort((a, b) => a - b); return med(o.slice(0, Math.max(1, Math.round(v.length * 0.05)))); };

console.log("\n## LISTONES (Bonferroni)");
for (const k of [1, 7, 14, 60, 105, 735]) console.log("  " + String(k).padStart(3) + " pruebas → |t| >= " + listonT(k).toFixed(2));

const H1 = [...Array(N).keys()].filter((i) => i < Math.floor(N / 2));
const H2 = [...Array(N).keys()].filter((i) => i >= Math.floor(N / 2));
const SUELOS = [0, 25, 50, 75, 100, 150, 200];

console.log("\n## EL CRUCE FORMAL DEL SUELO — elegir por MENOR 5% peor en una mitad, aplicar tal cual");
console.log("| ajuste | suelo elegido | prueba | ops | media/op | t (fuera de muestra) | $/año | 5% peor |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [nomA, A, nomB, B] of [["H1", H1, "H2", H2], ["H2", H2, "H1", H1]]) {
  let best = null;
  for (const su of SUELOS) {
    const cfg = { dist: 45, a: 5, b: 50, suelo: su };
    const pl = A.map((i) => (op(i, cfg) ? dias[i].pnl["45"] : 0));
    const e = es5(pl);
    if (!best || e > best.e) best = { su, e };
  }
  const cfg = { dist: 45, a: 5, b: 50, suelo: best.su };
  const plAll = B.map((i) => (op(i, cfg) ? dias[i].pnl["45"] : 0));
  const ops = B.filter((i) => op(i, cfg)).map((i) => dias[i].pnl["45"]);
  const t = med(ops) / (desv(ops) / Math.sqrt(ops.length));
  console.log("| " + nomA + " | >=$" + best.su + " | " + nomB + " | " + ops.length + " | " + eur(med(ops)) + " | " + t.toFixed(2) + " | " + eur(sum(plAll) / (B.length / 252)) + " | " + eur(es5(plAll)) + " |");
}

console.log("\n## LA CANDIDATA C EN CADA MITAD — t sobre los dias operados");
for (const [nom, idx] of [["periodo entero", [...Array(N).keys()]], ["H1", H1], ["H2", H2]]) {
  const cfg = { dist: 45, a: 5, b: 50, suelo: 100 };
  const ops = idx.filter((i) => op(i, cfg)).map((i) => dias[i].pnl["45"]);
  const t = med(ops) / (desv(ops) / Math.sqrt(ops.length));
  console.log("  " + nom.padEnd(15) + " ops " + String(ops.length).padStart(3) + " · media/op " + eur(med(ops)).padStart(6) + " · t = " + t.toFixed(2) + " · ganadoras " + (ops.filter((x) => x > 0).length / ops.length * 100).toFixed(1) + "%");
}

console.log("\n## QUE HACE FALTA PARA CRUZAR EL LISTON DE 105 PRUEBAS (|t|>=3.50) EN UNA SOLA MITAD");
const cfg = { dist: 45, a: 5, b: 50, suelo: 100 };
const opsH2 = H2.filter((i) => op(i, cfg)).map((i) => dias[i].pnl["45"]);
const m = med(opsH2), s = desv(opsH2);
const nNec = Math.ceil((3.50 * s / m) ** 2);
console.log("  H2: media/op " + eur(m) + " · desv " + eur(s) + " · n actual " + opsH2.length + " · n necesario " + nNec);
console.log("  a " + (218 / (N / 252)).toFixed(0) + " operaciones/año → " + ((nNec - opsH2.length) / (218 / (N / 252))).toFixed(1) + " años mas de forward-test");
