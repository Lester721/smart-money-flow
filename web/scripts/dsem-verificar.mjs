// MIRAR EL FICHERO ANTES DE MEDIRLO · comprobaciones sobre los 1.121 días.
// Uso: node --import tsx --max-old-space-size=10240 scripts/dsem-verificar.mjs
import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const filas = JSON.parse(readFileSync("scripts/dsem-filas.json", "utf8"));
const CAM = JSON.parse(readFileSync("scripts/dsem-camino.json", "utf8"));
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));

// ── 1 · RADIOGRAFÍA ───────────────────────────────────────────────────────────────────────
radiografia(filas, ["pl", "credito", "sp11", "cierre", "sigma", "ivAtm", "rvMan", "zTardePts"], "cóndor 0DTE 1.121 días", { cerosLegitimos: [] });

// ── 2 · ¿EL CAMINO CUADRA CON LA FILA? ────────────────────────────────────────────────────
let mal = 0;
for (const f of filas) {
  const c = CAM[f.fecha];
  const i11 = c.h.indexOf("11:00");
  if (i11 < 0 || Math.abs(c.s[i11] - f.sp11) > 0.01 || Math.abs(c.s[c.s.length - 1] - f.cierre) > 0.01) mal++;
}
console.log(`camino vs fila: ${mal} descuadres (tiene que ser 0)`);
if (mal) throw new Error("el camino de 5 min no cuadra");

// ── 3 · MEDIOS DÍAS DETECTADOS DESDE EL FICHERO (no de memoria) ───────────────────────────
// En un medio día el mercado cierra a las 13:00; Theta rellena hasta las 16:00 repitiendo el
// último precio. Se detecta porque el precio NO CAMBIA en toda la tarde.
const medios = [];
for (const f of filas) {
  const c = CAM[f.fecha];
  const i13 = c.h.indexOf("13:05");
  if (i13 < 0) continue;
  const tarde = c.s.slice(i13);
  if (new Set(tarde.map((x) => x.toFixed(2))).size === 1) medios.push(f.fecha);
}
console.log(`\nMEDIOS DÍAS detectados en los datos (${medios.length}): ${medios.join(" ")}`);

// ── 4 · HUECOS DEL CALENDARIO: qué días hábiles NO están ───────────────────────────────────
const FEST = new Set(["2022-01-17","2022-02-21","2022-04-15","2022-05-30","2022-06-20","2022-07-04","2022-09-05","2022-11-24","2022-12-26",
"2023-01-02","2023-01-16","2023-02-20","2023-04-07","2023-05-29","2023-06-19","2023-07-04","2023-09-04","2023-11-23","2023-12-25",
"2024-01-01","2024-01-15","2024-02-19","2024-03-29","2024-05-27","2024-06-19","2024-07-04","2024-09-02","2024-11-28","2024-12-25",
"2025-01-01","2025-01-09","2025-01-20","2025-02-17","2025-04-18","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-11-27","2025-12-25",
"2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03"]);

const hay = new Set(filas.map((f) => f.fecha));
const iso = (d) => d.toISOString().slice(0, 10);
const faltan = [];
for (let d = new Date("2022-01-03T00:00:00Z"); iso(d) <= filas[filas.length - 1].fecha; d.setUTCDate(d.getUTCDate() + 1)) {
  const s = iso(d), w = d.getUTCDay();
  if (w === 0 || w === 6 || FEST.has(s)) continue;
  if (!hay.has(s)) faltan.push(s);
}
const porMes = {};
for (const f of faltan) porMes[f.slice(0, 7)] = (porMes[f.slice(0, 7)] ?? 0) + 1;
console.log(`\nDÍAS HÁBILES SIN FILA: ${faltan.length}`);
console.log(`  por mes: ${Object.entries(porMes).map(([m, n]) => m + ":" + n).join(" ")}`);
console.log(`  (2022-01 a 2022-03 son martes/jueves: SPX no tenía 0DTE esos días — NO faltan, no existían)`);
const fueraDeQ1 = faltan.filter((f) => f > "2022-05-01");
console.log(`  huecos REALES (fuera del arranque de 2022): ${fueraDeQ1.length ? fueraDeQ1.join(" ") : "ninguno"}`);
const dowFaltan = {};
for (const f of faltan.filter((x) => x < "2022-05-01")) { const w = new Date(f + "T00:00:00Z").getUTCDay(); dowFaltan[w] = (dowFaltan[w] ?? 0) + 1; }
console.log(`  días de la semana de los que faltan en 2022-Q1: ${JSON.stringify(dowFaltan)} (1=lun … 5=vie)`);

// ── 5 · ¿ALGÚN FESTIVO TIENE FICHERO? (sería señal de fechas mal etiquetadas) ─────────────
const festConDatos = [...FEST].filter((f) => hay.has(f));
console.log(`\nfestivos CON fichero (tiene que ser vacío): ${festConDatos.join(" ") || "ninguno"}`);

// ── 6 · REPARTO POR DÍA DE LA SEMANA Y PERÍODO ────────────────────────────────────────────
const N = ["dom", "LUN", "MAR", "MIE", "JUE", "VIE", "sab"];
const tab = {};
for (const f of filas) {
  const w = new Date(f.fecha + "T00:00:00Z").getUTCDay();
  const p = f.fecha < "2024-01-01" ? "2022-2023" : "2024-2026";
  tab[p] ??= {}; tab[p][w] = (tab[p][w] ?? 0) + 1;
}
console.log(`\nREPARTO POR DÍA DE LA SEMANA`);
console.log(`  período      ${[1,2,3,4,5].map((w) => N[w].padStart(6)).join("")}   total`);
for (const [p, o] of Object.entries(tab))
  console.log(`  ${p}   ${[1,2,3,4,5].map((w) => String(o[w] ?? 0).padStart(6)).join("")}   ${Object.values(o).reduce((a,b)=>a+b,0)}`);

// ── 7 · CIFRAS BASE ────────────────────────────────────────────────────────────────────────
const pls = filas.map((f) => f.pl);
const s = [...pls].sort((a, b) => a - b);
const pc = (q) => s[Math.floor(s.length * q)];
console.log(`\nBASE · ${filas.length} días  ${filas[0].fecha} → ${filas[filas.length-1].fecha}`);
console.log(`  total $${Math.round(pls.reduce((a,b)=>a+b,0)).toLocaleString("es-ES")} · media $${(pls.reduce((a,b)=>a+b,0)/pls.length).toFixed(2)}/día`);
console.log(`  aciertos ${(pls.filter((x)=>x>0).length/pls.length*100).toFixed(1)}% · peor $${Math.round(s[0])} · p1 $${Math.round(pc(0.01))} · p5 $${Math.round(pc(0.05))}`);
console.log(`  crédito medio $${(filas.reduce((a,f)=>a+f.credito,0)/filas.length).toFixed(0)} · riesgo máx medio $${(filas.reduce((a,f)=>a+f.zRiesgoMax,0)/filas.length).toFixed(0)}`);
