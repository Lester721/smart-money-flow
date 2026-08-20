// APAGAR-Y-ENCENDER · PARTE 3 — el nulo CORREGIDO POR SELECCIÓN.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/apagar-encender-3.mjs
//
// Los nulos de la parte 2 (percentil 99,8%) preguntan "¿es este día mejor que un día al azar del
// mes?" — pero "el último día del mes" NO se sacó de un sombrero: salió de mirar una lista entera
// de cubos de calendario (18 en regimen-18.mjs, 58 en la tanda de dsem). El nulo honesto tiene que
// REPETIR LA SELECCIÓN dentro de cada sorteo y quedarse con el MEJOR, igual que se hizo de verdad.
//
// NULO: se gira el P&L contra el calendario (rotación circular). Conserva volatilidad, agrupamiento,
// colas y el número de días; rompe SÓLO el vínculo fecha↔resultado. Legítimo porque la
// autocorrelación del P&L diario es ≈0 (−0,047 / −0,086 / −0,008, medido el 2026-08-20).
//
// FAMILIA que se mira entera, igual que se miró de verdad: "saltarse el j-ésimo día del mes
// contando por el final" (j=1..10) y "contando por el principio" (j=1..10) = 20 reglas hermanas,
// todas con ~55 días apagados. finMes es j=1 por el final.

import { readFileSync } from "node:fs";

const EFECTIVO = 7977, INT = 0.05;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : NaN; };
const anos = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;

const G = JSON.parse(readFileSync("scripts/dm-grid.json", "utf8"));
const filas = [];
for (let i = 0; i < G.dias.length; i++) {
  const a = G.variantes["s0.80_a30"].serie[i], b = G.variantes["p25_a50"].serie[i];
  if (!a || !b) continue;
  filas.push({ fecha: G.dias[i].fecha, mes: G.dias[i].fecha.slice(0, 7), finMes: G.dias[i].finMes, plProp: a.pl, plHoy: b.pl });
}
filas.sort((x, y) => x.fecha.localeCompare(y.fecha));
const N = filas.length, AN = anos(filas[0].fecha, filas[N - 1].fecha);

// ── la familia de 20 reglas hermanas ────────────────────────────────────────────────────────
const porMes = new Map();
filas.forEach((f, i) => { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(i); });
const mesesConFin = new Set(filas.filter((f) => f.finMes).map((f) => f.mes));
const REGLAS = [];
for (let j = 1; j <= 10; j++) {
  const off = new Array(N).fill(0);
  for (const m of mesesConFin) { const idx = porMes.get(m); const p = idx[idx.length - j]; if (p != null) off[p] = 1; }
  REGLAS.push({ nom: "fin−" + (j - 1), off, n: suma(off) });
}
for (let j = 1; j <= 10; j++) {
  const off = new Array(N).fill(0);
  for (const m of mesesConFin) { const idx = porMes.get(m); const p = idx[j - 1]; if (p != null) off[p] = 1; }
  REGLAS.push({ nom: "ini+" + (j - 1), off, n: suma(off) });
}
const I_FIN = 0;                                        // fin−0 = el último día del mes = finMes

// ── el motor, sobre un vector de P&L ya girado ──────────────────────────────────────────────
const DIAS = filas.map((f) => (new Date(f.fecha + "T00:00:00Z")).getTime());
function anual(pl, off) {
  let caja = EFECTIVO, prev = DIAS[0];
  for (let i = 0; i < N; i++) {
    const d = Math.max(1, (DIAS[i] - prev) / 86400000); prev = DIAS[i];
    if (caja < 0) caja += caja * INT * d / 365;
    if (!off[i]) caja += pl[i];
  }
  return (caja - EFECTIVO) / AN;
}

console.log("═".repeat(100));
console.log("  PARTE 3 · EL NULO CORREGIDO POR SELECCIÓN · " + N + " días · " + (N - 1) + " rotaciones (todas)");
console.log("═".repeat(100));

for (const [campo, nomG] of [["plProp", "PROPUESTA ±0,80σ/ala30"], ["plHoy", "CÓNDOR HOY ±25/ala50"]]) {
  const pl = filas.map((f) => f[campo]);
  const CERO = new Array(N).fill(0);
  const base = anual(pl, CERO);
  const real = REGLAS.map((r) => anual(pl, r.off) - base);
  const gFin = real[I_FIN];

  console.log("\n" + "─".repeat(100));
  console.log(" " + nomG + " · base " + eur(base) + "/año · ganancia de finMes " + eur(gFin) + "/año");
  console.log("─".repeat(100));

  console.log("\n### LAS 20 REGLAS HERMANAS EN EL MUNDO REAL — ¿es finMes la mejor, o una de muchas?\n");
  const orden = REGLAS.map((r, i) => ({ nom: r.nom, n: r.n, g: real[i] })).sort((a, b) => b.g - a.g);
  console.log("| puesto | regla | días apagados | ganancia $/año |");
  console.log("|---|---|---|---|");
  orden.forEach((o, i) => { if (i < 5 || o.nom === "fin−0" || i >= orden.length - 2) console.log("| " + (i + 1) + " | " + o.nom + " | " + o.n + " | " + eur(o.g) + " |"); });
  console.log("   reglas con ganancia positiva: " + orden.filter((o) => o.g > 0).length + " de 20 · puesto de finMes: " +
    (orden.findIndex((o) => o.nom === "fin−0") + 1) + " de 20");

  // ── el nulo de rotación ───────────────────────────────────────────────────────────────────
  const solo = [], maxFam = [];
  for (let r = 1; r < N; r++) {
    const g = new Array(N);
    for (let i = 0; i < N; i++) g[i] = pl[(i + r) % N];
    const gb = anual(g, CERO);
    solo.push(anual(g, REGLAS[I_FIN].off) - gb);
    let mx = -Infinity;
    for (const R of REGLAS) { const v = anual(g, R.off) - gb; if (v > mx) mx = v; }
    maxFam.push(mx);
  }
  const pSolo = solo.filter((x) => x >= gFin).length / solo.length;
  const pFam = maxFam.filter((x) => x >= gFin).length / maxFam.length;
  console.log("\n### EL NULO DE ROTACIÓN (" + (N - 1) + " giros del P&L contra el calendario)\n");
  console.log("| nulo | mediana | p95 | p99 | máximo | ganancia real | **p** |");
  console.log("|---|---|---|---|---|---|---|");
  console.log("| finMes SOLA (sin corregir selección) | " + eur(pctl(solo, 0.5)) + " | " + eur(pctl(solo, 0.95)) + " | " +
    eur(pctl(solo, 0.99)) + " | " + eur(Math.max(...solo)) + " | " + eur(gFin) + " | **" + pSolo.toFixed(3) + "** |");
  console.log("| **la MEJOR de las 20 hermanas** (corregido) | " + eur(pctl(maxFam, 0.5)) + " | " + eur(pctl(maxFam, 0.95)) + " | " +
    eur(pctl(maxFam, 0.99)) + " | " + eur(Math.max(...maxFam)) + " | " + eur(gFin) + " | **" + pFam.toFixed(3) + "** |");
  console.log("   (en un mundo SIN señal, la mejor de 20 reglas de calendario ya 'gana' " + eur(media(maxFam)) + "/año de media)");

  // ── la tasa base de días catastróficos ────────────────────────────────────────────────────
  const umbral = pctl(pl, 0.02);
  const malos = pl.filter((x) => x <= umbral).length;
  const malosFin = filas.filter((f) => f.finMes && f[campo] <= umbral).length;
  const p = malos / N, esp = p * 55;
  // binomial exacta: P(X >= malosFin) con n=55
  let acum = 0;
  const comb = (n, k) => { let c = 1; for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1); return c; };
  for (let k = malosFin; k <= 55; k++) acum += comb(55, k) * p ** k * (1 - p) ** (55 - k);
  console.log("\n### LA TASA BASE — ¿caen MÁS desastres en fin de mes de lo que toca?\n");
  console.log("   'día catastrófico' = el 2% peor (P&L ≤ " + eur(umbral) + ") · " + malos + " días de " + N + " (" + (p * 100).toFixed(1) + "%)");
  console.log("   en los 55 días de fin de mes: **" + malosFin + "** · esperados por azar: " + esp.toFixed(1) +
    " · P(≥" + malosFin + " por azar) = **" + acum.toFixed(3) + "**");
}
