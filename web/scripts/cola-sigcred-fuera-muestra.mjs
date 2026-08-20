// SIGMA-CREDITO · FASE 9 — EL ÚNICO CANDIDATO, FUERA DE MUESTRA.
//
// `credDesbal` bajo 20% conserva el 109% del ingreso y baja la peor racha un 39%. Es lo más
// cerca que ha estado el proyecto de un filtro que sirva. Pero el corte (¿bajo? ¿20%?) se eligió
// mirando los 653 días. La única prueba que no se puede trampear: fijar el umbral con lo que se
// sabía ENTONCES y aplicarlo hacia delante, sin volver a mirar.
//
// Se hace de dos formas, las dos declaradas antes de correr:
//   A · umbral fijado con 2024, aplicado a 2025+2026
//   B · walk-forward: cada día usa el percentil 20 de los 250 días hábiles ANTERIORES

import { readFileSync } from "node:fs";
import { media, pct, eur, drawdown } from "./anatomia3-lib.mjs";

const base = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const CAD = JSON.parse(readFileSync("scripts/cola-sigcred-cadena.json", "utf8"));
for (const f of base) { const c = CAD[f.fecha]; f.credDesbal = (c.credPut - c.credCall) / f.credito; }

const anosDe = (fs) => (new Date(fs[fs.length - 1].fecha) - new Date(fs[0].fecha)) / (365.25 * 864e5);
function foto(fs) {
  const pl = fs.map((f) => f.pl), a = anosDe(fs) || 1;
  return { n: pl.length, alAno: pl.reduce((x, y) => x + y, 0) / a, peor: Math.min(...pl),
           p5: pct(pl, 0.05), p1: pct(pl, 0.01), dd: drawdown(pl) };
}
const linea = (nom, f) => console.log(`| ${nom} | ${f.n} | ${eur(f.alAno)} | ${eur(f.peor)} | ${eur(f.p5)} | ${eur(f.p1)} | ${eur(f.dd)} | ${(f.alAno / -f.dd).toFixed(2)} |`);

console.log("═".repeat(100));
console.log("  `credDesbal` bajo 20% · FUERA DE MUESTRA");
console.log("═".repeat(100));

// ── A · umbral de 2024, aplicado a 2025-2026 ──────────────────────────────
const y24 = base.filter((f) => f.fecha < "2025-01-01");
const resto = base.filter((f) => f.fecha >= "2025-01-01");
const umbral = pct(y24.map((f) => f.credDesbal), 0.20);
console.log(`\n## A · umbral fijado SÓLO con 2024 (${y24.length} días): credDesbal < ${umbral.toFixed(4)} = no operar\n`);
console.log("| serie | días | $/año | peor día | p5 | p1 | peor racha | Calmar |");
console.log("|---|---|---|---|---|---|---|---|");
linea("2025-2026 · **sin filtrar**", foto(resto));
const fueraA = resto.filter((f) => f.credDesbal >= umbral);
linea("2025-2026 · **filtrado con el umbral de 2024**", foto(fueraA));
console.log(`\n  tira ${resto.length - fueraA.length} de ${resto.length} días (${((1 - fueraA.length / resto.length) * 100).toFixed(0)}%, buscaba 20%)`);

// ── B · walk-forward de 250 días ──────────────────────────────────────────
console.log("\n## B · walk-forward: cada día, percentil 20 de los 250 días hábiles ANTERIORES\n");
const wf = [];
for (let i = 0; i < base.length; i++) {
  const prev = base.slice(Math.max(0, i - 250), i);
  if (prev.length < 250) continue;                       // sin historia suficiente: no se opera ni se cuenta
  const u = pct(prev.map((f) => f.credDesbal), 0.20);
  wf.push({ ...base[i], opera: base[i].credDesbal >= u });
}
console.log("| serie | días | $/año | peor día | p5 | p1 | peor racha | Calmar |");
console.log("|---|---|---|---|---|---|---|---|");
linea("desde el día 251 · **sin filtrar**", foto(wf));
const wfIn = wf.filter((f) => f.opera);
linea("desde el día 251 · **walk-forward**", foto(wfIn));
console.log(`\n  tira ${wf.length - wfIn.length} de ${wf.length} días (${((1 - wfIn.length / wf.length) * 100).toFixed(0)}%)`);

// ── por año, dentro del walk-forward ──────────────────────────────────────
console.log("\n## POR AÑO, DENTRO DEL WALK-FORWARD\n");
console.log("| año | días | $/año sin filtrar | $/año filtrado | racha sin filtrar | racha filtrada | ¿mejora? |");
console.log("|---|---|---|---|---|---|---|");
for (const y of [...new Set(wf.map((f) => f.fecha.slice(0, 4)))].sort()) {
  const v = wf.filter((f) => f.fecha.slice(0, 4) === y), d = v.filter((f) => f.opera);
  if (!d.length || v.length < 40) { console.log(`| ${y} | ${v.length} | — | — | — | — | muestra corta |`); continue; }
  const av = v.reduce((a, b) => a + b.pl, 0) / (v.length / 252), ad = d.reduce((a, b) => a + b.pl, 0) / (v.length / 252);
  const dv = drawdown(v.map((f) => f.pl)), dd = drawdown(d.map((f) => f.pl));
  console.log(`| ${y} | ${v.length} | ${eur(av)} | ${eur(ad)} | ${eur(dv)} | ${eur(dd)} | ${dd > dv && ad > av * 0.85 ? "🟢 sí" : "no"} |`);
}

console.log("\n" + "═".repeat(100));
