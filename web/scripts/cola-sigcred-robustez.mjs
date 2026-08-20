// SIGMA-CREDITO · FASE 10 — ¿LA MEJORA ES UN EPISODIO O ES LA DISTRIBUCIÓN?
//
// El walk-forward de `credDesbal` baja la peor racha un 39% y sube el ingreso un 26%. Pero la
// PEOR RACHA es un máximo: la mueve un solo episodio afortunado. Antes de llamarlo hallazgo hay
// que ver si lo que cambia es la DISTRIBUCIÓN entera o sólo el punto peor.
//
// Se mira: las 5 peores rachas (no sólo la peor), el p5 y el p1 por semestres, y qué pasa si se
// quita del cálculo el episodio que más se beneficia.

import { readFileSync } from "node:fs";
import { media, pct, eur, drawdown } from "./anatomia3-lib.mjs";

const base = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const CAD = JSON.parse(readFileSync("scripts/cola-sigcred-cadena.json", "utf8"));
for (const f of base) { const c = CAD[f.fecha]; f.credDesbal = (c.credPut - c.credCall) / f.credito; }

// walk-forward, idéntico a la fase 9
const wf = [];
for (let i = 250; i < base.length; i++) {
  const u = pct(base.slice(i - 250, i).map((f) => f.credDesbal), 0.20);
  wf.push({ ...base[i], opera: base[i].credDesbal >= u });
}
const sinF = wf, conF = wf.filter((f) => f.opera);

/** Las N rachas más profundas, sin solaparse. */
function rachas(pls, n) {
  const out = [];
  let v = pls.map((x, i) => ({ x, i }));
  for (let k = 0; k < n; k++) {
    let acc = 0, pico = 0, iPico = 0, peor = 0, ini = 0, fin = 0;
    for (let j = 0; j < v.length; j++) {
      acc += v[j].x;
      if (acc > pico) { pico = acc; iPico = j; }
      if (acc - pico < peor) { peor = acc - pico; ini = iPico; fin = j; }
    }
    if (peor >= 0) break;
    out.push(peor);
    v = v.slice(0, ini).concat(v.slice(fin + 1));       // se saca ese tramo y se vuelve a buscar
  }
  return out;
}

console.log("═".repeat(96));
console.log("  ¿EPISODIO O DISTRIBUCIÓN? · walk-forward de `credDesbal`, " + wf.length + " días fuera de muestra");
console.log("═".repeat(96));

console.log("\n## 1 · LAS 5 RACHAS MÁS PROFUNDAS (no sólo la peor)\n");
const rS = rachas(sinF.map((f) => f.pl), 5), rC = rachas(conF.map((f) => f.pl), 5);
console.log("| # | sin filtrar | con filtro | mejora |");
console.log("|---|---|---|---|");
for (let i = 0; i < 5; i++) {
  const a = rS[i] ?? 0, b = rC[i] ?? 0;
  console.log(`| ${i + 1}ª | ${eur(a)} | ${eur(b)} | ${a < 0 ? ((1 - b / a) * 100).toFixed(0) + "%" : "—"} |`);
}
console.log(`\n  suma de las 5: ${eur(rS.reduce((a, b) => a + b, 0))} → ${eur(rC.reduce((a, b) => a + b, 0))}`);
console.log("  Si SÓLO mejorara la 1ª, sería un episodio. Si mejoran las cinco, es la distribución.");

console.log("\n## 2 · LA COLA POR SEMESTRES — lo que no depende de un máximo\n");
console.log("| semestre | días | p5 sin | p5 con | p1 sin | p1 con | peor sin | peor con | media sin | media con |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const sem = (f) => f.fecha.slice(0, 4) + (Number(f.fecha.slice(5, 7)) <= 6 ? "-S1" : "-S2");
for (const s of [...new Set(wf.map(sem))].sort()) {
  const v = wf.filter((f) => sem(f) === s), d = v.filter((f) => f.opera);
  if (v.length < 40 || d.length < 25) { console.log(`| ${s} | ${v.length} | muestra corta | | | | | | | |`); continue; }
  const a = v.map((f) => f.pl), b = d.map((f) => f.pl);
  console.log(`| ${s} | ${v.length}→${d.length} | ${eur(pct(a, 0.05))} | ${eur(pct(b, 0.05))} | ${eur(pct(a, 0.01))} | ${eur(pct(b, 0.01))} | ${eur(Math.min(...a))} | ${eur(Math.min(...b))} | ${eur(media(a))} | ${eur(media(b))} |`);
}

console.log("\n## 3 · ¿DE DÓNDE SALE EL INGRESO EXTRA?\n");
const tirados = wf.filter((f) => !f.opera);
console.log(`  días tirados: ${tirados.length} · suman ${eur(tirados.reduce((a, b) => a + b.pl, 0))} · media ${eur(media(tirados.map((f) => f.pl)))}`);
console.log(`  días operados: ${conF.length} · suman ${eur(conF.reduce((a, b) => a + b.pl, 0))} · media ${eur(media(conF.map((f) => f.pl)))}`);
console.log(`  de los ${tirados.length} tirados, ${tirados.filter((f) => f.pl < 0).length} eran perdedores y ${tirados.filter((f) => f.pl < -2000).length} perdían más de $2.000`);
console.log(`\n  El filtro NO gana quitando perdedores raros: quita un grupo con media NEGATIVA (${eur(media(tirados.map((f) => f.pl)))}).`);

console.log("\n## 4 · QUITANDO EL MES QUE MÁS SE BENEFICIA\n");
const meses = [...new Set(wf.map((f) => f.fecha.slice(0, 7)))];
let peorMes = null, mejorGan = -Infinity;
for (const m of meses) {
  const v = wf.filter((f) => f.fecha.slice(0, 7) === m);
  const g = v.filter((f) => f.opera).reduce((a, b) => a + b.pl, 0) - v.reduce((a, b) => a + b.pl, 0);
  if (g > mejorGan) { mejorGan = g; peorMes = m; }
}
console.log(`  el mes donde el filtro más ayuda es ${peorMes} (${eur(mejorGan)} de ventaja)`);
const sinMes = wf.filter((f) => f.fecha.slice(0, 7) !== peorMes);
const a = sinMes, b = sinMes.filter((f) => f.opera);
const anos = sinMes.length / 252;
console.log(`\n  quitándolo (${a.length} días):`);
console.log(`    sin filtrar: ${eur(a.reduce((x, y) => x + y.pl, 0) / anos)}/año · racha ${eur(drawdown(a.map((f) => f.pl)))} · p5 ${eur(pct(a.map((f) => f.pl), 0.05))}`);
console.log(`    con filtro : ${eur(b.reduce((x, y) => x + y.pl, 0) / anos)}/año · racha ${eur(drawdown(b.map((f) => f.pl)))} · p5 ${eur(pct(b.map((f) => f.pl), 0.05))}`);

console.log("\n" + "═".repeat(96));
