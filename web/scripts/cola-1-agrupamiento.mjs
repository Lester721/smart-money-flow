// ¿SE AGRUPAN LAS PÉRDIDAS DEL CÓNDOR? — la comprobación previa que decide si toda la familia
// "reducir tamaño tras perder" está condenada antes de medirla.
//
// Si las pérdidas son independientes, reducir DESPUÉS de perder sólo hace una cosa: apostar menos
// en días que, en media, son iguales al resto. Eso recorta ingreso sin recortar riesgo futuro.
//
// Todo lo de aquí es descriptivo: no hay ninguna decisión de entrada, no hay futuro que mirar.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const F = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
radiografia(F, ["pl", "credito", "cierre", "ap", "sp11", "sigma"], "días del cóndor", { maxCeros: 0.2, cerosLegitimos: [] });

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };

const pl = F.map((f) => f.pl);
const n = pl.length;
const ANOS = n / 252;

console.log("═".repeat(92));
console.log("  BASE · " + n + " días · " + F[0].fecha + " → " + F[n - 1].fecha + " · " + ANOS.toFixed(2) + " años");
console.log("═".repeat(92));
console.log("  total " + eur(pl.reduce((a, b) => a + b, 0)) + " · " + eur(pl.reduce((a, b) => a + b, 0) / ANOS) + "/año · media/op " + eur(media(pl)));
const ord = [...pl].sort((a, b) => a - b);
console.log("  peor día " + eur(ord[0]) + " · p1 " + eur(ord[Math.floor(n * 0.01)]) + " · p5 " + eur(ord[Math.floor(n * 0.05)]));
console.log("  desv. típica " + eur(sd(pl)) + " · acierto " + (pl.filter((x) => x > 0).length / n * 100).toFixed(1) + "%");

// ── 1. AUTOCORRELACIÓN ────────────────────────────────────────────────────────
const corr = (a, b) => {
  const ma = media(a), mb = media(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
};
console.log("\n## 1 · AUTOCORRELACIÓN DEL P&L (¿el de ayer dice algo del de hoy?)\n");
console.log("| retardo | correlación | t aprox |");
console.log("|---|---|---|");
for (const k of [1, 2, 3, 5, 10]) {
  const a = pl.slice(0, n - k), b = pl.slice(k);
  const r = corr(a, b), t = r * Math.sqrt(a.length - 2) / Math.sqrt(1 - r * r);
  console.log("| " + k + " | " + r.toFixed(4) + " | " + t.toFixed(2) + " |");
}

// ── 2. PROBABILIDAD CONDICIONAL DE PERDER ─────────────────────────────────────
const perd = pl.map((x) => x < 0);
const base = perd.filter(Boolean).length / n;
console.log("\n## 2 · ¿PIERDE MÁS DESPUÉS DE PERDER?\n");
console.log("  tasa base de pérdida: " + (base * 100).toFixed(1) + "%   (" + perd.filter(Boolean).length + " de " + n + ")");
console.log("\n| condición previa | n | % que pierde | media del día siguiente |");
console.log("|---|---|---|---|");
const tras = (cond) => {
  const ix = [];
  for (let i = 1; i < n; i++) if (cond(i)) ix.push(i);
  return ix;
};
const racha = (i, k) => { for (let j = 1; j <= k; j++) { if (i - j < 0 || !perd[i - j]) return false; } return true; };
const rows = [
  ["ayer GANÓ", (i) => !perd[i - 1]],
  ["ayer perdió (1 seguida)", (i) => racha(i, 1)],
  ["2 pérdidas seguidas", (i) => racha(i, 2)],
  ["3 pérdidas seguidas", (i) => racha(i, 3)],
  ["5 pérdidas seguidas", (i) => racha(i, 5)],
];
for (const [nom, c] of rows) {
  const ix = tras(c);
  if (!ix.length) { console.log("| " + nom + " | 0 | — | — |"); continue; }
  const p = ix.filter((i) => perd[i]).length / ix.length;
  console.log("| " + nom + " | " + ix.length + " | " + (p * 100).toFixed(1) + "% | " + eur(media(ix.map((i) => pl[i]))) + " |");
}

// ── 3. TEST DE RACHAS (Wald–Wolfowitz) ────────────────────────────────────────
let runs = 1;
for (let i = 1; i < n; i++) if (perd[i] !== perd[i - 1]) runs++;
const n1 = perd.filter(Boolean).length, n2 = n - n1;
const espRuns = (2 * n1 * n2) / n + 1;
const varRuns = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1));
const z = (runs - espRuns) / Math.sqrt(varRuns);
console.log("\n## 3 · TEST DE RACHAS (Wald–Wolfowitz)\n");
console.log("  rachas observadas " + runs + " · esperadas si fuera azar " + espRuns.toFixed(1) + " · z = " + z.toFixed(2));
console.log("  " + (Math.abs(z) < 2 ? "→ INDISTINGUIBLE del azar: las pérdidas NO se agrupan." : "→ se aparta del azar"));

// ── 4. RACHA MÁS LARGA OBSERVADA vs AZAR ──────────────────────────────────────
let cur = 0, maxR = 0;
for (const p of perd) { cur = p ? cur + 1 : 0; if (cur > maxR) maxR = cur; }
// racha máxima esperada en n tiradas independientes con p = base
const espMax = Math.log(n * (1 - base)) / -Math.log(base);
console.log("\n## 4 · RACHA MÁS LARGA DE PÉRDIDAS\n");
console.log("  observada " + maxR + " días seguidos · esperada por azar ≈ " + espMax.toFixed(1) + " días");

// ── 5. ANATOMÍA DE LA PEOR RACHA ACUMULADA ────────────────────────────────────
let acc = 0, pico = 0, ddMax = 0, iPico = 0, iFondo = 0, iPicoCur = 0;
const curva = [];
for (let i = 0; i < n; i++) {
  acc += pl[i]; curva.push(acc);
  if (acc > pico) { pico = acc; iPicoCur = i; }
  if (pico - acc > ddMax) { ddMax = pico - acc; iPico = iPicoCur; iFondo = i; }
}
const tramo = F.slice(iPico + 1, iFondo + 1);
const plTramo = tramo.map((f) => f.pl);
const ordT = [...plTramo].sort((a, b) => a - b);
console.log("\n## 5 · ANATOMÍA DE LA PEOR RACHA ACUMULADA (" + eur(-ddMax) + ")\n");
console.log("  de " + F[iPico].fecha + " a " + F[iFondo].fecha + " · " + tramo.length + " sesiones");
console.log("  días que perdieron: " + plTramo.filter((x) => x < 0).length + " de " + tramo.length);
console.log("  los 3 peores días del tramo suman " + eur(ordT.slice(0, 3).reduce((a, b) => a + b, 0)) +
            " = " + (ordT.slice(0, 3).reduce((a, b) => a + b, 0) / -ddMax * 100).toFixed(0) + "% de la caída");
console.log("  los 5 peores: " + eur(ordT.slice(0, 5).reduce((a, b) => a + b, 0)) +
            " = " + (ordT.slice(0, 5).reduce((a, b) => a + b, 0) / -ddMax * 100).toFixed(0) + "% de la caída");
console.log("\n  los 10 peores días del tramo:");
for (const f of [...tramo].sort((a, b) => a.pl - b.pl).slice(0, 10)) console.log("    " + f.fecha + "  " + eur(f.pl));

// ── 6. ¿DE DÓNDE SALE LA CAÍDA GLOBAL? Concentración de la cola ───────────────
console.log("\n## 6 · CONCENTRACIÓN DE LA COLA EN TODO EL PERÍODO\n");
const perdidas = pl.filter((x) => x < 0).sort((a, b) => a - b);
const totalPerd = perdidas.reduce((a, b) => a + b, 0);
console.log("  " + perdidas.length + " días en pérdida suman " + eur(totalPerd));
for (const k of [1, 3, 5, 10, 20]) {
  const s = perdidas.slice(0, k).reduce((a, b) => a + b, 0);
  console.log("    los " + String(k).padStart(2) + " peores: " + eur(s).padStart(10) + "  = " + (s / totalPerd * 100).toFixed(0) + "% de todo lo perdido");
}
console.log("\n  los 15 peores días de todo el período:");
for (const f of [...F].sort((a, b) => a.pl - b.pl).slice(0, 15))
  console.log("    " + f.fecha + "  " + eur(f.pl).padStart(9) + "  · movimiento del día: " +
              ((f.cierre / f.sp11 - 1) * 100).toFixed(2) + "%  · σ esperado " + (f.sigma / f.sp11 * 100).toFixed(2) + "%");
