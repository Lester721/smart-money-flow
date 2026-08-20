// VOLATILIDAD · PASO 2 — MIRAR el fichero antes de medirlo, y retratar el día malo.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/vol-mirar.mjs
//
// Primero radiografia(): si un campo está muerto, esto lanza y no se mide nada. Después, el
// retrato: qué valor tiene cada señal de volatilidad en los días buenos y en los malos, POR
// PERÍODO, para ver de un vistazo cuáles cambian de escala entre 2022-23 y 2024-26 y cuáles no.

import { cargar, media, sd, pct, eur, auc, tWelch, P1, P2 } from "./vol-lib.mjs";
import { radiografia } from "../lib/radiografia.ts";

const { dias, descartes } = cargar();
console.log(`\n## ${dias.length} días · descartes: ${JSON.stringify(descartes)}`);
const porAno = {};
for (const d of dias) porAno[d.fecha.slice(0, 4)] = (porAno[d.fecha.slice(0, 4)] ?? 0) + 1;
console.log(`   por año: ${JSON.stringify(porAno)}`);
console.log(`   con historia de 20 días de IV (listo): ${dias.filter((d) => d.listo).length}`);

// ── RADIOGRAFÍA · lanza si algún campo está muerto ────────────────────────────
const listos = dias.filter((d) => d.listo);
radiografia(listos, [
  "pl", "ivAtm", "rvMan", "rvIv", "son25", "son75", "son05", "son15",
  "son15Rel", "son05Rel", "skew25", "skew15", "skew15Rel",
  "sigmasCorto", "straddle", "credRel", "credStr", "sepPct",
  "ivRel5", "ivRel20", "ivPctil20", "rvAyerIv",
], "señales de volatilidad", { cerosLegitimos: [] });

// ── LA ESCALA: ¿qué señal habla la misma lengua en los dos períodos? ──────────
const A = dias.filter((d) => d.periodo === P1), B = dias.filter((d) => d.periodo === P2);
const SEN = [
  ["ivAtm", "IV del dinero 11:00 (%)", "CRUDA"],
  ["rvMan", "RV de la mañana (%)", "CRUDA"],
  ["son25", "sonrisa a ±25 pts fijos", "CRUDA"],
  ["son75", "sonrisa a ±75 pts fijos", "CRUDA"],
  ["skew25", "sesgo put−call a ±25 pts", "CRUDA"],
  ["straddle", "straddle del dinero (pts)", "CRUDA"],
  ["credAbs", "crédito cobrado ($)", "CRUDA"],
  ["sepPct", "los 25 pts como % del índice", "CRUDA"],
  ["rvIv", "RV mañana ÷ IV", "adimensional"],
  ["son15Rel", "sonrisa ±1,5% ÷ IV (%)", "adimensional"],
  ["son05Rel", "sonrisa ±0,5% ÷ IV (%)", "adimensional"],
  ["skew15Rel", "sesgo ±1,5% ÷ IV (%)", "adimensional"],
  ["sigmasCorto", "25 pts ÷ straddle", "adimensional"],
  ["credRel", "crédito ÷ ancho (%)", "adimensional"],
  ["credStr", "crédito ÷ straddle", "adimensional"],
  ["ivRel5", "IV hoy vs 5 días (%)", "adimensional"],
  ["ivRel20", "IV hoy vs 20 días (%)", "adimensional"],
  ["ivPctil20", "percentil de IV en 20 días", "adimensional"],
  ["rvAyerIv", "RV ayer ÷ IV hoy", "adimensional"],
];

console.log(`\n${"═".repeat(96)}`);
console.log(`  ¿QUÉ SEÑAL CAMBIA DE ESCALA ENTRE PERÍODOS? — mediana en cada uno y t de la diferencia`);
console.log(`  (una señal con |t| grande está escrita en una moneda distinta en cada período:`);
console.log(`   un umbral elegido en uno NO significa lo mismo en el otro)`);
console.log("═".repeat(96));
console.log("| señal | unidad | mediana 22-23 | mediana 24-26 | cambio | t |");
console.log("|---|---|---|---|---|---|");
for (const [k, nom, uni] of SEN) {
  const a = A.map((d) => d[k]).filter((x) => x != null && Number.isFinite(x));
  const b = B.map((d) => d[k]).filter((x) => x != null && Number.isFinite(x));
  if (a.length < 30 || b.length < 30) continue;
  const ma = pct(a, 0.5), mb = pct(b, 0.5);
  const t = tWelch(a, b);
  const cam = ma !== 0 ? ((mb / ma - 1) * 100).toFixed(0) + "%" : "—";
  console.log(`| ${nom} | ${uni} | ${ma.toFixed(3)} | ${mb.toFixed(3)} | ${cam} | ${t.toFixed(2)} |`);
}

// ── EL RETRATO: ¿distinguen los días malos? AUC dentro de cada período ────────
// AUC = P(un día malo puntúa por debajo de uno bueno). Se calcula POR PERÍODO para que el
// resultado no venga de que los dos períodos tengan niveles distintos de todo.
const UMBRALES = [
  ["pérdida > $2.000", (d) => d.pl < -2000],
  ["el 5% peor del período", null],
];

console.log(`\n${"═".repeat(96)}`);
console.log(`  ¿SEPARA LA SEÑAL LOS DÍAS MALOS? — AUC dentro de cada período (0,50 = no distingue)`);
console.log("═".repeat(96));
for (const [et, fn] of UMBRALES) {
  console.log(`\n### malos = ${et}\n`);
  console.log("| señal | AUC 22-23 | n malos | AUC 24-26 | n malos | mismo signo |");
  console.log("|---|---|---|---|---|---|");
  const filas = [];
  for (const [k, nom] of SEN) {
    const auc2 = [];
    for (const G of [A, B]) {
      const g = G.filter((d) => d[k] != null && Number.isFinite(d[k]));
      const corte = fn ? null : pct(g.map((d) => d.pl), 0.05);
      const esMalo = fn ?? ((d) => d.pl <= corte);
      const mal = g.filter(esMalo).map((d) => d[k]);
      const bien = g.filter((d) => !esMalo(d)).map((d) => d[k]);
      auc2.push({ a: auc(mal, bien), n: mal.length });
    }
    const mismo = Math.sign(auc2[0].a - 0.5) === Math.sign(auc2[1].a - 0.5);
    const fuerza = Math.min(Math.abs(auc2[0].a - 0.5), Math.abs(auc2[1].a - 0.5));
    filas.push({ nom, auc2, mismo, fuerza: mismo ? fuerza : -1 });
  }
  filas.sort((x, y) => y.fuerza - x.fuerza);
  for (const f of filas) {
    console.log(`| ${f.nom} | ${f.auc2[0].a.toFixed(3)} | ${f.auc2[0].n} | ${f.auc2[1].a.toFixed(3)} | ${f.auc2[1].n} | ${f.mismo ? "sí" : "NO"} |`);
  }
}

// ── DÓNDE ESTÁ EL DINERO: los 20 peores días y su volatilidad ────────────────
const peores = [...dias].sort((a, b) => a.pl - b.pl).slice(0, 20);
console.log(`\n${"═".repeat(96)}`);
console.log(`  LOS 20 PEORES DÍAS (suman ${eur(peores.reduce((a, d) => a + d.pl, 0))} de ${eur(dias.reduce((a, d) => a + d.pl, 0))} del total)`);
console.log("═".repeat(96));
console.log("| fecha | P&L | IV 11:00 | RV mañana | RV÷IV | IV vs 20d | 25÷straddle | créd÷ancho | mov. tarde |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const d of peores) {
  console.log(`| ${d.fecha} | ${eur(d.pl)} | ${d.ivAtm.toFixed(1)}% | ${d.rvMan.toFixed(1)}% | ${d.rvIv.toFixed(2)} | ${d.ivRel20 != null ? d.ivRel20.toFixed(0) + "%" : "—"} | ${d.sigmasCorto.toFixed(2)} | ${d.credRel.toFixed(1)}% | ${d.zMovTarde.toFixed(0)} pts |`);
}
const todosMed = (k) => pct(dias.map((d) => d[k]).filter((x) => x != null && Number.isFinite(x)), 0.5);
console.log(`\n  mediana de TODOS los días:  IV ${todosMed("ivAtm").toFixed(1)}% · RV mañana ${todosMed("rvMan").toFixed(1)}% · RV÷IV ${todosMed("rvIv").toFixed(2)} · IV vs 20d ${todosMed("ivRel20").toFixed(0)}% · 25÷straddle ${todosMed("sigmasCorto").toFixed(2)} · créd÷ancho ${todosMed("credRel").toFixed(1)}%`);
