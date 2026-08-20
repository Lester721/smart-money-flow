// SALIDA POR HORA · PASO 3 — el cruce en las dos direcciones, el contrafactual de ejecución
// perfecta, la mezcla parcial y el diagnóstico de por qué 2022-2023 es otro mundo.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/salida-hora-cruce.mjs
//
// PRUEBAS DECLARADAS AQUÍ: 7 horas × 2 direcciones de cruce = 14 · 7 contrafactuales de punto
// medio = 7 · 6 pesos de mezcla × 3 períodos = 18. Total 39, sobre las 23 del paso 2 y las 187
// previas de esta familia: 249.

import { readFileSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const SALIDAS = ["12:00", "13:00", "14:00", "14:30", "15:00", "15:30", "15:45"];
const PRUEBAS = 249, LISTON = listonT(PRUEBAS);
const CUENTA = 56389, EFECTIVO = 7977;

const filas = JSON.parse(readFileSync("scripts/salida-hora-filas.json", "utf8"));
const A = filas.filter((f) => f.fecha < "2024-01-01");
const B = filas.filter((f) => f.fecha >= "2024-01-01");

const media = (v) => v.reduce((a, x) => a + x, 0) / v.length;
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const eur = (x) => (x < 0 ? "-$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
function maxDD(p) { let c = 0, pi = 0, w = 0; for (const x of p) { c += x; if (c > pi) pi = c; w = Math.min(w, c - pi); } return w; }
function res(pls) {
  const n = pls.length, t = pls.reduce((a, x) => a + x, 0);
  return { n, alAno: t / (n / 252), peor: Math.min(...pls), p1: pct(pls, 0.01), p5: pct(pls, 0.05), dd: maxDD(pls), acierto: pls.filter((x) => x > 0).length / n };
}
const tPar = (d) => media(d) / (sd(d) / Math.sqrt(d.length));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. EL BARRIDO SE INVIERTE — el orden de las 7 horas en A no se parece al de B.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const anoA = SALIDAS.map((h) => res(A.map((f) => f.salidas[h].pl)).alAno);
const anoB = SALIDAS.map((h) => res(B.map((f) => f.salidas[h].pl)).alAno);
const rango = (v) => { const o = [...v].map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]); const r = Array(v.length); o.forEach(([, i], k) => r[i] = k + 1); return r; };
const rA = rango(anoA), rB = rango(anoB);
const d2 = rA.reduce((a, x, i) => a + (x - rB[i]) ** 2, 0);
const spearman = 1 - (6 * d2) / (7 * (49 - 1));

console.log("\n=== 1. ¿SE PARECE EL ORDEN DE LAS HORAS EN LOS DOS PERÍODOS? ===\n");
console.log("| hora | $/año 2022-23 | puesto | $/año 2024-26 | puesto |");
console.log("|---|---|---|---|---|");
SALIDAS.forEach((h, i) => console.log("| " + h + " | " + eur(anoA[i]).padStart(9) + " | " + rA[i] + "º | " + eur(anoB[i]).padStart(9) + " | " + rB[i] + "º |"));
console.log("\n  correlación de puestos (Spearman) entre los dos períodos: " + spearman.toFixed(2));
console.log("  la mejor hora de 2022-23 (" + SALIDAS[rA.indexOf(1)] + ") queda " + rB[rA.indexOf(1)] + "ª de 7 en 2024-26.");
console.log("  la mejor hora de 2024-26 (" + SALIDAS[rB.indexOf(1)] + ") queda " + rA[rB.indexOf(1)] + "ª de 7 en 2022-23.");

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. EL CRUCE, hora por hora, en las dos direcciones. Sin regla de selección que lo esconda.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const holdA = res(A.map((f) => f.plHold)), holdB = res(B.map((f) => f.plHold));
console.log("\n\n=== 2. EL CRUCE HORA POR HORA — ¿mejora a AGUANTAR en los DOS períodos? ===\n");
console.log("  aguantar: 2022-23 " + eur(holdA.alAno) + "/año (racha " + eur(holdA.dd) + ") · 2024-26 " + eur(holdB.alAno) + "/año (racha " + eur(holdB.dd) + ")\n");
console.log("| hora | mejora $/año en 2022-23 | mejora $/año en 2024-26 | mismo signo | reduce racha en 2022-23 | en 2024-26 | SOBREVIVE EL CRUCE |");
console.log("|---|---|---|---|---|---|---|");
const cruce = {};
for (const h of SALIDAS) {
  const a = res(A.map((f) => f.salidas[h].pl)), b = res(B.map((f) => f.salidas[h].pl));
  const dA = a.alAno - holdA.alAno, dB = b.alAno - holdB.alAno;
  const ddA = Math.abs(holdA.dd) - Math.abs(a.dd), ddB = Math.abs(holdB.dd) - Math.abs(b.dd);
  const ok = dA > 0 && dB > 0;
  cruce[h] = { dA, dB, ddA, ddB, ok };
  console.log("| " + h + " | " + eur(dA).padStart(9) + " | " + eur(dB).padStart(9) + " | " + (Math.sign(dA) === Math.sign(dB) ? "sí" : "NO") +
    " | " + eur(ddA).padStart(9) + " | " + eur(ddB).padStart(9) + " | " + (ok ? "sí" : "NO") + " |");
}
console.log("\n  horas que mejoran el ingreso en los DOS períodos: " + (SALIDAS.filter((h) => cruce[h].ok).join(", ") || "NINGUNA"));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. CONTRAFACTUAL — ¿y si la ejecución fuese PERFECTA (relleno al punto medio, horquilla cero)?
//    No es operable: es la cota superior de lo que la salida por hora podría llegar a dar.
// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n\n=== 3. LA COTA SUPERIOR — salida al PUNTO MEDIO (no operable; horquilla cero) ===\n");
console.log("  Si ni siquiera con relleno perfecto gana, el problema no es la ejecución.\n");
console.log("| hora | $/año con ejecución real | $/año al punto medio | aguantar | ¿bate a aguantar ni con relleno perfecto? |");
console.log("|---|---|---|---|---|");
const holdT = res(filas.map((f) => f.plHold));
const midio = {};
for (const h of SALIDAS) {
  const real = res(filas.map((f) => f.salidas[h].pl)).alAno;
  const mid = res(filas.map((f) => (f.credito - f.salidas[h].debMid) * 100 - 0.24)).alAno;
  midio[h] = mid;
  console.log("| " + h + " | " + eur(real).padStart(9) + " | " + eur(mid).padStart(9) + " | " + eur(holdT.alAno).padStart(8) + " | " + (mid > holdT.alAno ? "SÍ" : "no") + " |");
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. EL PUENTE QUE SÍ TIENE FORMA — cerrar sólo UNA PARTE a las 12:00 y aguantar el resto.
//    La cola se corta mucho antes de que el ingreso se vaya a cero: la frontera es convexa.
// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n\n=== 4. MEZCLA — cerrar una fracción w a las 12:00 y aguantar el resto (los 1.121 días) ===\n");
console.log("| w cerrado a 12:00 | $/año | peor día | p1 | p5 | peor racha | $ de ingreso por $ de p5 quitado |");
console.log("|---|---|---|---|---|---|---|");
const PESOS = [0, 0.15, 0.25, 0.35, 0.5, 0.75, 1];
const mezcla = {};
for (const w of PESOS) {
  const pls = filas.map((f) => w * f.salidas["12:00"].pl + (1 - w) * f.plHold);
  const r = res(pls);
  const dIng = holdT.alAno - r.alAno, dP5 = Math.abs(holdT.p5) - Math.abs(r.p5);
  mezcla[w] = r;
  console.log("| " + (w * 100).toFixed(0) + "% | " + eur(r.alAno).padStart(8) + " | " + eur(r.peor).padStart(8) + " | " + eur(r.p1).padStart(8) +
    " | " + eur(r.p5).padStart(8) + " | " + eur(r.dd).padStart(9) + " | " + (dP5 > 0 ? (dIng / dP5).toFixed(2) : "-") + " |");
}
console.log("\n  cruce de la mezcla (¿el mismo w mejora a aguantar en los dos períodos?):");
console.log("| w | $/año 2022-23 | vs aguantar | $/año 2024-26 | vs aguantar | mismo signo |");
console.log("|---|---|---|---|---|---|");
for (const w of PESOS.slice(1)) {
  const a = res(A.map((f) => w * f.salidas["12:00"].pl + (1 - w) * f.plHold));
  const b = res(B.map((f) => w * f.salidas["12:00"].pl + (1 - w) * f.plHold));
  const dA = a.alAno - holdA.alAno, dB = b.alAno - holdB.alAno;
  console.log("| " + (w * 100).toFixed(0) + "% | " + eur(a.alAno).padStart(9) + " | " + eur(dA).padStart(9) + " | " + eur(b.alAno).padStart(9) +
    " | " + eur(dB).padStart(9) + " | " + (Math.sign(dA) === Math.sign(dB) ? "sí" : "NO") + " |");
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 5. DIAGNÓSTICO — qué hace distinto a 2022-2023, y qué significa para la ejecución.
// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n\n=== 5. POR QUÉ 2022-2023 ES OTRO MUNDO — y no es la hora de salida ===\n");
console.log("| año | días | AGUANTAR $/año | acierto | mov. medio 11:00→cierre | 25 pts como % del spot | crédito medio | % días fuera de ±25 |");
console.log("|---|---|---|---|---|---|---|---|");
const porAno = {};
for (const y of ["2022", "2023", "2024", "2025", "2026"]) {
  const g = filas.filter((f) => f.fecha.startsWith(y)); if (!g.length) continue;
  const r = res(g.map((f) => f.plHold));
  const movAbs = media(g.map((f) => Math.abs(f.mov)));
  const pctSpot = media(g.map((f) => 25 / f.spot * 100));
  const cred = media(g.map((f) => f.credito)) * 100;
  const fuera = g.filter((f) => Math.abs(f.mov) >= 25).length / g.length * 100;
  porAno[y] = { alAno: r.alAno, movAbs, pctSpot, cred, fuera, n: g.length, dd: r.dd, peor: r.peor };
  console.log("| " + y + " | " + g.length + " | " + eur(r.alAno).padStart(9) + " | " + (r.acierto * 100).toFixed(0) + "% | " +
    movAbs.toFixed(1) + " pts | " + pctSpot.toFixed(2) + "% | " + eur(cred).padStart(6) + " | " + fuera.toFixed(0) + "% |");
}
const rt = res(filas.map((f) => f.plHold));
console.log("\n  TOTAL 4,5 años, 1 contrato: " + eur(rt.alAno) + "/año · peor día " + eur(rt.peor) + " · peor racha " + eur(rt.dd) +
  " · " + (rt.alAno / CUENTA * 100).toFixed(1) + "% de la cuenta al año");
console.log("  El efectivo disponible son $" + EFECTIVO.toLocaleString("es-ES") + ". La peor racha de UN contrato es " + eur(rt.dd) + ".");

writeFileSync("scripts/salida-hora-cruce.json", JSON.stringify({ liston: LISTON, spearman, cruce, midio, porAno, mezcla }, null, 1));
console.log("\nlistón de t (Bonferroni, " + PRUEBAS + " pruebas) = " + LISTON);
console.log("escrito scripts/salida-hora-cruce.json");
