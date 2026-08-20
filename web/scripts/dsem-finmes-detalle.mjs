// ¿VIVE EL EFECTO EN DOS DÍAS? · los 55 últimos-días-de-mes, uno a uno.
// Uso: node --import tsx --max-old-space-size=10240 scripts/dsem-finmes-detalle.mjs
import { readFileSync } from "node:fs";
import { tWelch } from "../lib/barreraHallazgos";

const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const filas = JSON.parse(readFileSync("scripts/dsem-filas.json", "utf8"));
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const FEST = new Set(["2022-01-17","2022-02-21","2022-04-15","2022-05-30","2022-06-20","2022-07-04","2022-09-05","2022-11-24","2022-12-26",
"2023-01-02","2023-01-16","2023-02-20","2023-04-07","2023-05-29","2023-06-19","2023-07-04","2023-09-04","2023-11-23","2023-12-25",
"2024-01-01","2024-01-15","2024-02-19","2024-03-29","2024-05-27","2024-06-19","2024-07-04","2024-09-02","2024-11-28","2024-12-25",
"2025-01-01","2025-01-09","2025-01-20","2025-02-17","2025-04-18","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-11-27","2025-12-25",
"2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25"]);
const iso = (d) => d.toISOString().slice(0, 10);
const SES = [];
for (let d = new Date("2021-12-01T00:00:00Z"); iso(d) <= "2026-12-31"; d.setUTCDate(d.getUTCDate() + 1)) {
  const s = iso(d), w = d.getUTCDay(); if (w !== 0 && w !== 6 && !FEST.has(s)) SES.push(s);
}
const POS = new Map(SES.map((s, i) => [s, i]));
for (const f of filas) {
  const i = POS.get(f.fecha); let k = 0;
  while (SES[i + k + 1] && SES[i + k + 1].slice(0, 7) === f.fecha.slice(0, 7)) k++;
  f.posFin = k; f.ultimoMes = k === 0 ? 1 : 0;
}
const ult = filas.filter((f) => f.ultimoMes), resto = filas.filter((f) => f.posFin > 4);
console.log(`meses completos en la muestra: ${new Set(filas.map((f) => f.fecha.slice(0, 7))).size} · últimos-día-de-mes encontrados: ${ult.length}`);
const faltan = [...new Set(filas.map((f) => f.fecha.slice(0, 7)))].filter((m) => !ult.some((f) => f.fecha.slice(0, 7) === m));
console.log(`meses SIN su último día en los datos: ${faltan.join(" ") || "ninguno"} ${faltan.length ? "(el mes está incompleto o ese día no cotizó 0DTE)" : ""}`);

console.log(`\n| fecha | día | P&L | crédito | mov. tarde (pts) | mov. 15:30→cierre |`);
console.log("|---|---|---|---|---|---|");
const D = ["dom","lun","mar","mié","jue","vie"];
for (const f of ult) console.log(`| ${f.fecha} | ${D[new Date(f.fecha + "T00:00:00Z").getUTCDay()]} | ${eur(f.pl)} | ${eur(f.credito)} | ${f.zTardePts.toFixed(0)} | — |`);

const pls = ult.map((f) => f.pl).sort((a, b) => a - b);
console.log(`\n  n=${ult.length} · media ${eur(media(pls))} · mediana ${eur(pls[Math.floor(pls.length / 2)])} · ganan ${pls.filter((x) => x > 0).length} de ${pls.length} (${(pls.filter((x) => x > 0).length / pls.length * 100).toFixed(0)}%)  ·  el resto del mes gana el ${(resto.filter((f) => f.pl > 0).length / resto.length * 100).toFixed(0)}%`);
console.log(`\n  QUITANDO LOS PEORES DÍAS DE FIN DE MES (¿vive el efecto en dos catástrofes?):`);
const mR = media(resto.map((f) => f.pl));
for (const q of [0, 1, 2, 3, 5]) {
  const rec = ult.map((f) => f.pl).sort((a, b) => a - b).slice(q);
  console.log(`    sin los ${q} peores: n=${rec.length} · media ${eur(media(rec)).padStart(7)} · resto del mes ${eur(mR)} · diferencia ${eur(media(rec) - mR).padStart(7)} · t=${tWelch(rec, resto.map((f) => f.pl)).toFixed(2)}`);
}
console.log(`\n  Y AL REVÉS, quitando los mejores del resto del mes no cambia nada: es la comparación honesta al contrario.`);
