// COSTE-REAL - cuanto se lleva la HORQUILLA del credito del condor de SPX, por ano.
// Es el numero contra el que hay que comparar cualquier vehiculo mas pequeno (XSP).
import { readFileSync, readdirSync, existsSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00", DIST = 25, ALA = 50;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
function leer(fecha, r) {
  const f = `${DIR}/iv_${fecha}_${r}.csv`; if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n"); const fs = [];
  for (let j = 1; j < lin.length; j++) {
    if (lin[j].length < 20) continue; const c = lin[j].split(",");
    if (c[4].slice(11, 16) !== HORA) continue;
    const K = +c[2], b = +c[5], a = +c[9], sp = +c[13];
    if (K > 0 && a > 0 && b >= 0 && sp > 0) fs.push({ K, b, a, sp });
  }
  return fs.length ? fs : null;
}
const cerca = (fs, o) => fs.reduce((x, y) => (Math.abs(y.K - o) < Math.abs(x.K - o) ? y : x));
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const filas = [];
for (const d of fechas) {
  const C = leer(d, "C"), P = leer(d, "P"); if (!C || !P) continue;
  const sp = C[0].sp;
  const cc = cerca(C, sp + DIST), pc = cerca(P, sp - DIST);
  const cl = cerca(C, cc.K + ALA), pl = cerca(P, pc.K - ALA);
  if (!(cl.K > cc.K && pl.K < pc.K)) continue;
  const real = cc.b + pc.b - cl.a - pl.a;
  const medio = (cc.b + cc.a) / 2 + (pc.b + pc.a) / 2 - (cl.b + cl.a) / 2 - (pl.b + pl.a) / 2;
  if (!(medio > 0)) continue;
  filas.push({ fecha: d, real, medio, peaje: medio - real });
}
console.log(`n = ${filas.length} dias\n`);
console.log("| ano | credito al punto medio | credito REAL (bid/ask) | peaje de la horquilla | peaje en % del credito medio |");
console.log("|---|---|---|---|---|");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const g = filas.filter((f) => f.fecha.startsWith(a)); if (!g.length) continue;
  const m = g.reduce((x, y) => x + y.medio, 0) / g.length * 100;
  const r = g.reduce((x, y) => x + y.real, 0) / g.length * 100;
  console.log(`| ${a} | ${eur(m)} | ${eur(r)} | ${eur(m - r)} | ${((m - r) / m * 100).toFixed(1)}% |`);
}
const m = filas.reduce((x, y) => x + y.medio, 0) / filas.length * 100;
const r = filas.reduce((x, y) => x + y.real, 0) / filas.length * 100;
console.log(`\nTODA la muestra: medio ${eur(m)} - real ${eur(r)} - peaje ${eur(m - r)} = ${((m - r) / m * 100).toFixed(1)}% del credito`);
console.log(`en dolares al ano (252 sesiones, 1 contrato): la horquilla se lleva ${eur((m - r) * 252)}/ano`);
