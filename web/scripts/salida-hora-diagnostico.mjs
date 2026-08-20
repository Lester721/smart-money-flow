// SALIDA POR HORA · PASO 4 — dos comprobaciones antes de firmar nada.
//
//  a) ¿De qué está hecho el peor día? Un cóndor de $5.000 de ancho cobrando $5 no es una
//     operación, es un error de mesa. Hay que ver cuántos días son así antes de contarlos.
//  b) Si el crédito mínimo separa, ¿SOBREVIVE AL CRUCE en las dos direcciones? Se elige el
//     umbral en un período y se aplica al otro, sin tocarlo.
//
// PRUEBAS: 5 cubos de crédito × 3 períodos = 15 · 4 umbrales × 2 direcciones de cruce = 8.
// Total 23, sobre las 249 anteriores: 272.

import { readFileSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos";

const PRUEBAS = 272, LISTON = listonT(PRUEBAS);
const filas = JSON.parse(readFileSync("scripts/salida-hora-filas.json", "utf8"));
const A = filas.filter((f) => f.fecha < "2024-01-01");
const B = filas.filter((f) => f.fecha >= "2024-01-01");

const media = (v) => v.reduce((a, x) => a + x, 0) / v.length;
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const eur = (x) => (x < 0 ? "-$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
function maxDD(p) { let c = 0, pi = 0, w = 0; for (const x of p) { c += x; if (c > pi) pi = c; w = Math.min(w, c - pi); } return w; }
// El ancho real de la vertical más ancha, en dólares. El crédito se juzga contra eso.
const ancho = (f) => Math.max(f.kLC - f.kSC, f.kSP - f.kLP) * 100;
const credPct = (f) => (f.credito * 100) / ancho(f);

console.log("\n=== a) DE QUÉ ESTÁ HECHO EL DAÑO — los 10 peores días de los 1.121 ===\n");
console.log("| fecha | spot 11:00 | cierre | movimiento | crédito cobrado | % del ancho | P&L aguantando |");
console.log("|---|---|---|---|---|---|---|");
for (const f of [...filas].sort((a, b) => a.plHold - b.plHold).slice(0, 10))
  console.log("| " + f.fecha + " | " + f.spot.toFixed(0) + " | " + f.cierre.toFixed(0) + " | " + (f.mov >= 0 ? "+" : "") + f.mov.toFixed(0) +
    " pts | " + eur(f.credito * 100).padStart(6) + " | " + (credPct(f) * 100).toFixed(1) + "% | " + eur(f.plHold).padStart(8) + " |");

const cp = filas.map(credPct).sort((a, b) => a - b);
console.log("\n  crédito como % del ancho: p5 " + (pct(cp, 0.05) * 100).toFixed(1) + "% · p25 " + (pct(cp, 0.25) * 100).toFixed(1) +
  "% · mediana " + (pct(cp, 0.5) * 100).toFixed(1) + "% · p75 " + (pct(cp, 0.75) * 100).toFixed(1) + "% · p95 " + (pct(cp, 0.95) * 100).toFixed(1) + "%");
console.log("  días con crédito por debajo del 3% del ancho (menos de $150 por $5.000 de riesgo): " +
  filas.filter((f) => credPct(f) < 0.03).length + " de " + filas.length);

// ── cubos de crédito, en los tres períodos ───────────────────────────────────────────────────
const CUBOS = [[0, 0.04], [0.04, 0.07], [0.07, 0.10], [0.10, 0.15], [0.15, 99]];
function cubos(sub, nom) {
  console.log("\n  " + nom + ":");
  console.log("  | crédito / ancho | días | $/año si sólo se operan estos | media $/día | peor día | % acierto |");
  console.log("  |---|---|---|---|---|---|");
  for (const [lo, hi] of CUBOS) {
    const g = sub.filter((f) => credPct(f) >= lo && credPct(f) < hi);
    if (g.length < 10) { console.log("  | " + (lo * 100) + "-" + (hi === 99 ? "+" : hi * 100) + "% | " + g.length + " | (muestra corta) | | | |"); continue; }
    const pls = g.map((f) => f.plHold);
    console.log("  | " + (lo * 100).toFixed(0) + "-" + (hi === 99 ? "+" : (hi * 100).toFixed(0)) + "% | " + g.length + " | " +
      eur(media(pls) * (g.length / sub.length) * 252).padStart(9) + " | " + eur(media(pls)).padStart(6) + " | " +
      eur(Math.min(...pls)).padStart(8) + " | " + (pls.filter((x) => x > 0).length / g.length * 100).toFixed(0) + "% |");
  }
}
console.log("\n\n=== b) ¿SEPARA EL CRÉDITO? — aguantando al cierre, por cubos ===");
cubos(filas, "los 1.121 días");
cubos(A, "2022-2023 (468)");
cubos(B, "2024-2026 (653)");

// ── el cruce del umbral ──────────────────────────────────────────────────────────────────────
console.log("\n\n=== c) EL CRUCE DEL UMBRAL DE CRÉDITO — se elige en uno y se aplica al otro ===\n");
const UMBRALES = [0.04, 0.06, 0.08, 0.10];
function evalua(sub, u) {
  const g = sub.filter((f) => credPct(f) >= u);
  if (g.length < 50) return null;
  const pls = g.map((f) => f.plHold);
  // $/año sobre el CALENDARIO completo: los días filtrados no se operan, no desaparecen del año.
  return { n: g.length, alAno: media(pls) * (g.length / sub.length) * 252, peor: Math.min(...pls), p5: pct(pls, 0.05), dd: maxDD(pls),
           t: tWelch(pls, sub.filter((f) => credPct(f) < u).map((f) => f.plHold)) };
}
const holdA = { alAno: media(A.map((f) => f.plHold)) * 252, dd: maxDD(A.map((f) => f.plHold)) };
const holdB = { alAno: media(B.map((f) => f.plHold)) * 252, dd: maxDD(B.map((f) => f.plHold)) };
console.log("  sin filtro: 2022-23 " + eur(holdA.alAno) + "/año (racha " + eur(holdA.dd) + ") · 2024-26 " + eur(holdB.alAno) + "/año (racha " + eur(holdB.dd) + ")\n");
console.log("| umbral | 2022-23: días · $/año · mejora | 2024-26: días · $/año · mejora | mismo signo |");
console.log("|---|---|---|---|");
for (const u of UMBRALES) {
  const a = evalua(A, u), b = evalua(B, u);
  if (!a || !b) { console.log("| " + (u * 100) + "% | muestra corta | | |"); continue; }
  const dA = a.alAno - holdA.alAno, dB = b.alAno - holdB.alAno;
  console.log("| " + (u * 100).toFixed(0) + "% | " + a.n + " · " + eur(a.alAno) + " · " + eur(dA) + " | " + b.n + " · " + eur(b.alAno) +
    " · " + eur(dB) + " | " + (Math.sign(dA) === Math.sign(dB) ? "sí" : "NO") + " |");
}
console.log("\nlistón de t (Bonferroni, " + PRUEBAS + " pruebas) = " + LISTON);
