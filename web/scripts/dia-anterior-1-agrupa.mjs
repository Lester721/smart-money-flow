// ¿SE AGRUPAN LAS PÉRDIDAS? — con 2022 (bajista) DENTRO.
//
// La anatomía anterior midió autocorrelación −0,064 sobre 653 días de mercado alcista. La duda
// legítima de Lester: en un bajista, ¿sí se agrupan? Si se agrupan en 2022 y no en 2024-26, eso
// ES un patrón, y toda la familia "parar tras N pérdidas" vuelve a estar viva.
//
// Todo lo de aquí es DESCRIPTIVO. No hay decisión de entrada, no hay umbral elegido.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/dia-anterior-1-agrupa.mjs

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const F = JSON.parse(readFileSync("scripts/dia-anterior-base.json", "utf8"));
radiografia(F, ["pl", "credD", "cierre", "sp11", "straddle", "penMax", "ivATM"], "cóndor 1.121 días",
  { maxCeros: 0.2, cerosLegitimos: ["penMax"] });

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const racha = (v) => { let c = 0, p = 0; for (const x of v) { c = Math.min(0, c + x); p = Math.min(p, c); } return p; };
const corr = (a, b) => {
  const ma = media(a), mb = media(b); let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return n / Math.sqrt(da * db);
};
const varz = (v) => { const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const tW = (a, b) => (a.length < 3 || b.length < 3) ? NaN
  : (media(a) - media(b)) / Math.sqrt(varz(a) / a.length + varz(b) / b.length);

const PRUEBAS = 60;                 // se declara ALTO a propósito (ver barreraHallazgos)
const LISTON = listonT(PRUEBAS);

const GRUPOS = [
  ["2022 BAJISTA", (d) => d.fecha < "2023-01-01"],
  ["2023", (d) => d.fecha >= "2023-01-01" && d.fecha < "2024-01-01"],
  ["2024", (d) => d.fecha >= "2024-01-01" && d.fecha < "2025-01-01"],
  ["2025", (d) => d.fecha >= "2025-01-01" && d.fecha < "2026-01-01"],
  ["2026 (a 10 ago)", (d) => d.fecha >= "2026-01-01"],
  ["A = 2022-2023", (d) => d.fecha < "2024-01-01"],
  ["B = 2024-2026", (d) => d.fecha >= "2024-01-01"],
  ["TODO", () => true],
];

console.log("\n" + "=".repeat(100));
console.log(`  SE AGRUPAN LAS PERDIDAS? · ${F.length} dias · ${F[0].fecha} -> ${F[F.length - 1].fecha} · liston |t| = ${LISTON} (${PRUEBAS} pruebas)`);
console.log("=".repeat(100));

console.log("\n## 0 · LA BASE POR PERIODO\n");
console.log("| periodo | n | $/anio | acierto | peor dia | p1 | p5 | peor racha |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [et, f] of GRUPOS) {
  const g = F.filter(f); if (g.length < 20) continue;
  const pl = g.map((x) => x.pl), o = [...pl].sort((a, b) => a - b);
  console.log(`| ${et} | ${g.length} | ${eur(pl.reduce((a, b) => a + b, 0) / (g.length / 252))} | ${(pl.filter((x) => x > 0).length / pl.length * 100).toFixed(1)}% | ${eur(o[0])} | ${eur(o[Math.floor(pl.length * 0.01)])} | ${eur(o[Math.floor(pl.length * 0.05)])} | ${eur(racha(pl))} |`);
}

// -- 1 · AUTOCORRELACION, por periodo -----------------------------------------
console.log("\n## 1 · AUTOCORRELACION DEL P&L — el de ayer dice algo del de hoy?\n");
console.log("| periodo | n | rho(1) | t | rho(2) | rho(3) | rho(5) |");
console.log("|---|---|---|---|---|---|---|");
for (const [et, f] of GRUPOS) {
  const g = F.filter(f); if (g.length < 40) continue;
  const pl = g.map((x) => x.pl);
  const rr = [1, 2, 3, 5].map((k) => corr(pl.slice(0, pl.length - k), pl.slice(k)));
  const t1 = rr[0] * Math.sqrt(pl.length - 3) / Math.sqrt(1 - rr[0] ** 2);
  console.log(`| ${et} | ${g.length} | ${rr[0].toFixed(4)} | ${t1.toFixed(2)} | ${rr[1].toFixed(4)} | ${rr[2].toFixed(4)} | ${rr[3].toFixed(4)} |`);
}

// -- 2 · PIERDE MAS DESPUES DE PERDER? ----------------------------------------
console.log("\n## 2 · CONDICIONAL: tras N perdidas seguidas (t de Welch contra los demas dias)\n");
console.log("| periodo | condicion | n | % pierde | media del dia | t vs resto | pasa liston? |");
console.log("|---|---|---|---|---|---|---|");
for (const [et, f] of GRUPOS.filter(([e]) => e.startsWith("A =") || e.startsWith("B =") || e.startsWith("2022") || e === "TODO")) {
  const g = F.filter(f); if (g.length < 40) continue;
  const pl = g.map((x) => x.pl), perd = pl.map((x) => x < 0);
  const base = perd.filter(Boolean).length / pl.length;
  const rachaN = (i, k) => { for (let j = 1; j <= k; j++) if (i - j < 0 || !perd[i - j]) return false; return true; };
  for (const [nom, c] of [
    ["ayer GANO", (i) => i >= 1 && !perd[i - 1]],
    ["ayer perdio", (i) => rachaN(i, 1)],
    ["2 seguidas", (i) => rachaN(i, 2)],
    ["3 seguidas", (i) => rachaN(i, 3)],
  ]) {
    const dentro = [], fuera = [];
    for (let i = 1; i < pl.length; i++) (c(i) ? dentro : fuera).push(pl[i]);
    if (dentro.length < 5) { console.log(`| ${et} | ${nom} | ${dentro.length} | — | — | — | — |`); continue; }
    const t = tW(dentro, fuera);
    console.log(`| ${et} | ${nom} (base ${(base * 100).toFixed(0)}%) | ${dentro.length} | ${(dentro.filter((x) => x < 0).length / dentro.length * 100).toFixed(1)}% | ${eur(media(dentro))} | ${t.toFixed(2)} | ${Math.abs(t) >= LISTON ? "SI" : "no"} |`);
  }
}

// -- 3 · TEST DE RACHAS (Wald-Wolfowitz) por periodo ---------------------------
console.log("\n## 3 · TEST DE RACHAS (Wald-Wolfowitz) — z<0 = se agrupan · z>0 = alternan\n");
console.log("| periodo | n | rachas observadas | esperadas si es azar | z |");
console.log("|---|---|---|---|---|");
for (const [et, f] of GRUPOS) {
  const g = F.filter(f); if (g.length < 40) continue;
  const perd = g.map((x) => x.pl < 0);
  let runs = 1; for (let i = 1; i < perd.length; i++) if (perd[i] !== perd[i - 1]) runs++;
  const n1 = perd.filter(Boolean).length, n2 = perd.length - n1, n = perd.length;
  const esp = (2 * n1 * n2) / n + 1;
  const vr = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1));
  console.log(`| ${et} | ${n} | ${runs} | ${esp.toFixed(1)} | ${((runs - esp) / Math.sqrt(vr)).toFixed(2)} |`);
}

// -- 4 · PERMUTACION DE LA PEOR RACHA, por periodo -----------------------------
console.log("\n## 4 · PEOR RACHA REAL vs 2.000 BARAJADAS DEL MISMO PERIODO\n");
console.log("| periodo | peor racha real | mediana barajada | p5 barajada | percentil de la real | peor que el azar? |");
console.log("|---|---|---|---|---|---|");
let semilla = 20260820;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
for (const [et, f] of GRUPOS) {
  const g = F.filter(f); if (g.length < 40) continue;
  const pl = g.map((x) => x.pl);
  const real = racha(pl);
  const sim = [];
  for (let s = 0; s < 2000; s++) {
    const v = pl.slice();
    for (let i = v.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [v[i], v[j]] = [v[j], v[i]]; }
    sim.push(racha(v));
  }
  sim.sort((a, b) => a - b);
  const pct = sim.filter((x) => x <= real).length / sim.length;
  console.log(`| ${et} | ${eur(real)} | ${eur(sim[1000])} | ${eur(sim[100])} | ${(pct * 100).toFixed(0)}% | ${pct <= 0.05 ? "SI" : "no"} |`);
}

// -- 5 · LOS DIAS TOPE ---------------------------------------------------------
console.log("\n## 5 · SE AGRUPAN LOS DIAS TOPE (perdida maxima)?  multiplicador = P(TOPE|ayer TOPE) / P(TOPE)\n");
console.log("| periodo | n TOPE | P(TOPE) | P(TOPE tras TOPE) | multiplicador |");
console.log("|---|---|---|---|---|");
for (const [et, f] of GRUPOS) {
  const g = F.filter(f); if (g.length < 40) continue;
  const tope = g.map((d) => (d.penCierre >= 50 ? 1 : 0));
  const nT = tope.reduce((a, b) => a + b, 0);
  if (nT < 3) { console.log(`| ${et} | ${nT} | — | — | — |`); continue; }
  const p = nT / g.length;
  let seg = 0, prev = 0;
  for (let i = 1; i < tope.length; i++) if (tope[i - 1]) { prev++; if (tope[i]) seg++; }
  const cond = prev ? seg / prev : NaN;
  console.log(`| ${et} | ${nT} | ${(p * 100).toFixed(1)}% | ${(cond * 100).toFixed(1)}% | ${(cond / p).toFixed(2)}x |`);
}
