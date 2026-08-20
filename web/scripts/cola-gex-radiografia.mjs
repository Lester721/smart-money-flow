// PASO 2 — RADIOGRAFÍA de las filas del GEX antes de medir nada con ellas.
import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const filas = JSON.parse(readFileSync("scripts/cola-gex-filas.json", "utf8"));

radiografia(filas, [
  "pl", "credito", "spot", "cierre", "movDia",
  "gexC", "gexP", "gexNet", "gexAbs", "gexNetSuave", "gexAbsSuave",
  "gexRatio", "gexNetNorm", "distFlip", "gexZonaNet", "gexZonaAbs",
  "zonaSobreTotal", "nStrikes", "oiTotal",
], "GEX 11:00 del cóndor", { cerosLegitimos: [] });

// ¿cuántos días tienen flip? (null = el net no cruza cero en ±3%)
const sinFlip = filas.filter((f) => f.flip == null).length;
console.log(`\ndías SIN nivel de gamma cero dentro de ±3%: ${sinFlip} de ${filas.length}`);

// signo del net
const neg = filas.filter((f) => f.gexNetSuave < 0).length;
console.log(`días con net NEGATIVO (convención dealers largos de calls): ${neg} (${(neg / filas.length * 100).toFixed(1)}%)`);

// ¿el GEX crudo es sólo un reloj? correlación con el tiempo
const n = filas.length;
const t = filas.map((_, i) => i);
const cor = (a, b) => {
  const ma = a.reduce((s, x) => s + x, 0) / a.length, mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
};
console.log(`\n── ¿el campo es un RELOJ disfrazado? correlación con el orden temporal ──`);
for (const c of ["gexNetSuave", "gexAbsSuave", "gexRatio", "gexNetNorm", "distFlip", "zonaSobreTotal", "oiTotal"]) {
  const v = filas.map((f) => (f[c] == null ? 0 : f[c]));
  console.log(`  ${c.padEnd(16)} corr(t) = ${cor(t, v).toFixed(3)}`);
}

// medias por año, para ver si el crudo se puede comparar entre años
console.log(`\n── medias por año (si el crudo cambia de escala, un tercil = un año) ──`);
console.log("| año | n | gexNetSuave | gexAbsSuave | gexRatio | gexNetNorm | oiTotal |");
console.log("|---|---|---|---|---|---|---|");
for (const a of ["2024", "2025", "2026"]) {
  const g = filas.filter((f) => f.fecha.startsWith(a));
  const m = (c) => g.reduce((s, f) => s + (f[c] ?? 0), 0) / g.length;
  console.log(`| ${a} | ${g.length} | ${m("gexNetSuave").toExponential(2)} | ${m("gexAbsSuave").toExponential(2)} | ${m("gexRatio").toFixed(3)} | ${m("gexNetNorm").toExponential(2)} | ${Math.round(m("oiTotal")).toLocaleString("es-ES")} |`);
}
