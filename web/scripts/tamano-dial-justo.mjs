// ¿QUÉ DIAL DE TAMAÑO ES JUSTO? · la única pregunta de este encargo que puede cruzar los períodos
//
// Reducir tamaño tiene que reducir el ingreso Y la caída EN LA MISMA PROPORCIÓN. Si un dial baja
// el ingreso más deprisa que la caída, ese dial cobra de más y es peor que simplemente operar menos.
//
//   eficiencia = (P&L nuevo / P&L base) ÷ (caída nueva / caída base)
//
// Para un multiplicador puro vale 1,00 EXACTO, gane o pierda el período — por eso esta medida sí se
// puede cruzar entre 2022-2023 y 2024-2026 aunque uno gane y el otro pierda.
//   > 1  el dial conserva más ingreso del que conserva de caída → mejor que proporcional
//   < 1  el dial se come el ingreso más rápido que la caída → cobra de más
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/tamano-dial-justo.mjs

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT } from "../lib/barreraHallazgos.ts";

const TOTAL0 = 56389;
const dias = JSON.parse(readFileSync("scripts/tamano-serie.json", "utf8"));
radiografia(dias, ["pl", "credito", "mov"], "serie del cóndor (dial)");
const D22 = dias.filter((d) => d.fecha < "2024-01-01");
const D24 = dias.filter((d) => d.fecha >= "2024-01-01");
const D26 = dias.filter((d) => d.fecha >= "2026-01-01");

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pc = (x) => (x * 100).toFixed(1) + "%";

function medir(serie, { ala = 50, cad = 1, k = 1 }) {
  const op = serie.filter((d, i) => i % cad === 0 && d.porAla[ala] && d.porAla[ala].credito > 0);
  const pls = op.map((d) => d.porAla[ala].pl * k);
  let eq = 0, pico = 0, peor = 0;
  for (const p of pls) { eq += p; pico = Math.max(pico, eq); peor = Math.max(peor, pico - eq); }
  const total = pls.reduce((a, x) => a + x, 0);
  return { n: op.length, total, porAno: total / (serie.length / 252), peorRacha: peor,
    caida: peor / TOTAL0, peorDia: Math.min(...pls), colateral: ala * 100 * k };
}

const DIALES = [
  ["BASE · ala 50, todos los días, 1c", { ala: 50, cad: 1, k: 1 }, 1.00],
  ["frecuencia · 1 de cada 2 días", { ala: 50, cad: 2, k: 1 }, 0.50],
  ["frecuencia · 1 de cada 3 días", { ala: 50, cad: 3, k: 1 }, 0.33],
  ["frecuencia · 1 de cada 4 días", { ala: 50, cad: 4, k: 1 }, 0.25],
  ["ancho de ala · 40 (‑20%)", { ala: 40, cad: 1, k: 1 }, 0.80],
  ["ancho de ala · 30 (‑40%)", { ala: 30, cad: 1, k: 1 }, 0.60],
  ["ancho de ala · 25 (‑50%)", { ala: 25, cad: 1, k: 1 }, 0.50],
  ["ancho de ala · 20 (‑60%)", { ala: 20, cad: 1, k: 1 }, 0.40],
  ["ancho de ala · 15 (‑70%)", { ala: 15, cad: 1, k: 1 }, 0.30],
  ["ancho de ala · 10 (‑80%)", { ala: 10, cad: 1, k: 1 }, 0.20],
  ["contratos · 2 (×2)", { ala: 50, cad: 1, k: 2 }, 2.00],
  ["contratos · 3 (×3)", { ala: 50, cad: 1, k: 3 }, 3.00],
];

const PERIODOS = [["TODO 22-26", dias], ["2022-2023", D22], ["2024-2026", D24], ["sólo 2026", D26]];

console.log(`\n${"═".repeat(112)}`);
console.log(`EFICIENCIA DE CADA DIAL DE TAMAÑO · 1,00 = multiplicador puro y justo · <1,00 = cobra de más`);
console.log(`${"═".repeat(112)}\n`);

const base = {}; for (const [et, s] of PERIODOS) base[et] = medir(s, { ala: 50, cad: 1, k: 1 });

console.log("| dial | exposición nominal | " + PERIODOS.map(([e]) => `efic. ${e}`).join(" | ") + " | ¿misma dirección en los 4? |");
console.log("|---|---|" + PERIODOS.map(() => "---|").join("") + "---|");
const filas = [];
for (const [et, cfg, expo] of DIALES) {
  const efs = PERIODOS.map(([pe, s]) => {
    const r = medir(s, cfg), b = base[pe];
    return b.peorRacha > 0 && b.total !== 0 ? (r.total / b.total) / (r.peorRacha / b.peorRacha) : NaN;
  });
  const sobre = efs.filter((x) => x > 1.02).length, bajo = efs.filter((x) => x < 0.98).length;
  const coherente = sobre === efs.length ? "todas >1" : bajo === efs.length ? "todas <1" : sobre + bajo === 0 ? "todas ≈1" : "**se contradicen**";
  filas.push({ et, cfg, expo, efs, coherente });
  console.log(`| ${et} | ${expo.toFixed(2)}× | ${efs.map((x) => x.toFixed(2)).join(" | ")} | ${coherente} |`);
}

console.log(`\n${"═".repeat(112)}`);
console.log(`LO QUE CUESTA CADA DIAL, EN CRUDO · % del ingreso conservado vs % de la caída conservada`);
console.log(`${"═".repeat(112)}\n`);
for (const [pe, s] of PERIODOS) {
  const b = base[pe];
  console.log(`\n### ${pe} · base: ${eur(b.porAno)}/año, caída ${eur(b.peorRacha)} (${pc(b.caida)}), peor día ${eur(b.peorDia)}\n`);
  console.log("| dial | colateral | $/año | % del ingreso base | caída | % de la caída base | peor día | eficiencia |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const [et, cfg] of DIALES) {
    const r = medir(s, cfg);
    const fi = r.total / b.total, fc = r.peorRacha / b.peorRacha;
    console.log(`| ${et} | ${eur(r.colateral)} | ${eur(r.porAno)} | ${pc(fi)} | ${eur(-r.peorRacha)} (${pc(r.caida)}) | ${pc(fc)} | ${eur(r.peorDia)} | ${(fi / fc).toFixed(2)} |`);
  }
}

// ── LA PRUEBA CRUZADA DEL DIAL ───────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(112)}`);
console.log(`PRUEBA CRUZADA · ¿el ORDEN de los diales se mantiene al cambiar de período?`);
console.log(`${"═".repeat(112)}\n`);
const orden = (pe) => DIALES.slice(1).map(([et, cfg]) => {
  const r = medir(PERIODOS.find((p) => p[0] === pe)[1], cfg), b = base[pe];
  return { et, ef: (r.total / b.total) / (r.peorRacha / b.peorRacha) };
}).sort((a, c) => c.ef - a.ef).map((x) => x.et);
const o22 = orden("2022-2023"), o24 = orden("2024-2026");
console.log("  mejor→peor en 2022-2023:");
o22.forEach((x, i) => console.log(`    ${i + 1}. ${x}`));
console.log("  mejor→peor en 2024-2026:");
o24.forEach((x, i) => console.log(`    ${i + 1}. ${x}`));
const rho = (() => {   // Spearman entre los dos órdenes
  const n = o22.length, r22 = new Map(o22.map((x, i) => [x, i])), r24 = new Map(o24.map((x, i) => [x, i]));
  let s = 0; for (const x of o22) s += (r22.get(x) - r24.get(x)) ** 2;
  return 1 - (6 * s) / (n * (n * n - 1));
})();
console.log(`\n  correlación de rangos (Spearman) entre los dos períodos: ${rho.toFixed(2)}`);
console.log(`  ${rho > 0.6 ? "El orden SE MANTIENE: el dial que sale mejor en un período sale mejor en el otro." :
  rho > 0.2 ? "El orden se mantiene A MEDIAS. No es una guía fiable." :
  "El orden NO se mantiene: elegir el dial mirando un período no sirve para el otro."}`);

// ── UNA COSA QUE SÍ ES CIERTA POR CONSTRUCCIÓN ───────────────────────────────────────────────
console.log(`\n${"═".repeat(112)}`);
console.log(`EL CONTRASTE DEL TAMAÑO PURO · multiplicar contratos es exactamente lineal, en los cuatro períodos`);
console.log(`${"═".repeat(112)}\n`);
console.log("| período | 1 contrato $/año | 2 contratos | 3 contratos | 1c caída | 2c caída | 3c caída | ¿exactamente ×2 y ×3? |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [pe, s] of PERIODOS) {
  const r = [1, 2, 3].map((k) => medir(s, { ala: 50, cad: 1, k }));
  const lineal = Math.abs(r[1].total / r[0].total - 2) < 1e-9 && Math.abs(r[2].total / r[0].total - 3) < 1e-9;
  console.log(`| ${pe} | ${eur(r[0].porAno)} | ${eur(r[1].porAno)} | ${eur(r[2].porAno)} | ${pc(r[0].caida)} | ${pc(r[1].caida)} | ${pc(r[2].caida)} | ${lineal ? "SÍ, exacto" : "no"} |`);
}
console.log(`\n  Ésa es la única regla del proyecto que funciona en los dos períodos, y funciona porque no`);
console.log(`  puede no funcionar: el tamaño es un MULTIPLICADOR. Y por eso mismo NO ARREGLA EL SIGNO.`);
console.log(`  Multiplicar por cualquier número un ${eur(medir(D22, { ala: 50 }).porAno)}/año lo deja negativo.`);

const PRUEBAS = DIALES.length * PERIODOS.length + 12;
console.log(`\n${"═".repeat(112)}`);
console.log(`RECUENTO: ${DIALES.length} diales × ${PERIODOS.length} períodos + 12 = ${PRUEBAS} pruebas · listón |t| = ${listonT(PRUEBAS)}`);
console.log("═".repeat(112));
