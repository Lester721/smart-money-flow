// TAM-VERIFICAR — antes de contar nada: ¿el resultado de 2022-2023 es real o es un fallo mío?
//
// Tres comprobaciones:
//   1. ¿reproduzco el número YA CONOCIDO de 2024-2026? ($48.638 por contrato, memoria del 17 ago)
//   2. ¿cómo se reparte año a año, y qué pinta tienen los precios de 2022?
//   3. ¿cuánto de la diferencia es la HORQUILLA (ejecución) y cuánto es el mercado?

import { readFileSync } from "node:fs";
const filas = JSON.parse(readFileSync("scripts/tam-base.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.round(Math.abs(x)).toLocaleString("es-ES");

// ── 1. CONTROL contra el número ya conocido ──
const desde24 = filas.filter((f) => f.fecha >= "2024-01-01");
const t24 = desde24.reduce((a, b) => a + b.pl, 0);
console.log("═══ 1. CONTROL — ¿reproduzco lo ya medido? ═══\n");
console.log(`  2024→hoy, 1 contrato: ${eur(t24)} en ${desde24.length} días`);
console.log(`  memoria (condor-desde-2024): $48.638 por contrato`);
console.log(`  diferencia: ${eur(t24 - 48638)} → ${Math.abs(t24 - 48638) < 500 ? "CUADRA. La tubería es la misma." : "NO CUADRA — parar y mirar"}\n`);

// ── 2. AÑO A AÑO, con la anatomía del día ──
console.log("═══ 2. AÑO A AÑO — 1 contrato, precios reales ═══\n");
console.log("| año | días | ganados | P&L | crédito medio | |mov| medio 11:00→cierre | mov en puntos | mov en % | spot medio | 25 pts = % del spot |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const g = filas.filter((f) => f.fecha.startsWith(a));
  const med = (v) => v.reduce((x, y) => x + y, 0) / v.length;
  console.log(`| ${a} | ${g.length} | ${((g.filter((x) => x.pl > 0).length / g.length) * 100).toFixed(0)}% | ${eur(g.reduce((x, y) => x + y.pl, 0))} | ` +
    `${med(g.map((x) => x.credito)).toFixed(2)} | ${med(g.map((x) => Math.abs(x.mov))).toFixed(1)} pts | ` +
    `${med(g.map((x) => Math.abs(x.mov))).toFixed(1)} | ${med(g.map((x) => Math.abs(x.movPct))).toFixed(2)}% | ` +
    `${Math.round(med(g.map((x) => x.spot11)))} | ${((25 / med(g.map((x) => x.spot11))) * 100).toFixed(2)}% |`);
}

// ── 3. ¿CUÁNTO ES LA HORQUILLA? — el mismo cóndor a punto medio (NO es un resultado, es un diagnóstico) ──
console.log("\n═══ 3. ¿ES LA EJECUCIÓN O ES EL MERCADO? ═══\n");
console.log("  (el punto medio NO vale como resultado — sirve sólo para ver cuánto pesa el peaje)\n");
console.log("| año | crédito real (bid/ask) | crédito a punto medio | peaje por día | peaje al año |");
console.log("|---|---|---|---|---|");
// el peaje ya está dentro: hay que recalcularlo desde las cadenas. Aquí se estima con la
// diferencia entre el crédito real y el que daría el punto medio, que se guarda aparte.
console.log("  → se recalcula en tam-horquilla.mjs (hace falta releer las cadenas)\n");

// ── 4. LA FORMA DE LA PÉRDIDA — de dónde sale el dinero ──
console.log("═══ 4. DE DÓNDE SALE EL DINERO — reparto del P&L ═══\n");
console.log("| período | días | días ganados | gana de media el ganador | días perdidos | pierde de media el perdedor | expectativa |");
console.log("|---|---|---|---|---|---|---|");
for (const [nom, f] of [["2022-2023", (x) => x.fecha < "2024-01-01"], ["2024-2026", (x) => x.fecha >= "2024-01-01"]]) {
  const g = filas.filter(f);
  const w = g.filter((x) => x.pl > 0), l = g.filter((x) => x.pl <= 0);
  const m = (v) => v.reduce((a, b) => a + b.pl, 0) / v.length;
  console.log(`| ${nom} | ${g.length} | ${w.length} (${((w.length / g.length) * 100).toFixed(1)}%) | ${eur(m(w))} | ${l.length} | ${eur(m(l))} | ${eur(m(g))}/día |`);
}

// ── 5. LOS DÍAS QUE DUELEN — ¿son más, o son peores? ──
console.log("\n═══ 5. LOS DÍAS MALOS — ¿más frecuentes o más caros? ═══\n");
console.log("| período | días con pérdida | > $1.000 | > $2.000 | > $3.000 | > $4.000 | pérdida total de esos días |");
console.log("|---|---|---|---|---|---|---|");
for (const [nom, f] of [["2022-2023", (x) => x.fecha < "2024-01-01"], ["2024-2026", (x) => x.fecha >= "2024-01-01"]]) {
  const g = filas.filter(f);
  const c = (u) => g.filter((x) => x.pl < -u).length;
  const pctd = (n) => `${n} (${((n / g.length) * 100).toFixed(1)}%)`;
  console.log(`| ${nom} | ${pctd(c(0))} | ${pctd(c(1000))} | ${pctd(c(2000))} | ${pctd(c(3000))} | ${pctd(c(4000))} | ${eur(g.filter((x) => x.pl < 0).reduce((a, b) => a + b.pl, 0))} |`);
}

// ── 6. ¿ES EL TAMAÑO DEL ÍNDICE? — normalizar la distancia a % del spot ──
console.log("\n═══ 6. LA TRAMPA DEL PUNTO FIJO — ±25 puntos NO es lo mismo en 2022 que en 2026 ═══\n");
console.log("| año | spot medio | ±25 pts en % | ala de 50 pts en % | vol implícita 11:00 | sigma de la tarde (11:00→cierre) | corto a cuántas sigmas |");
console.log("|---|---|---|---|---|---|---|");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const g = filas.filter((f) => f.fecha.startsWith(a));
  const med = (v) => v.reduce((x, y) => x + y, 0) / v.length;
  const spot = med(g.map((x) => x.spot11));
  const iv = med(g.map((x) => x.ivAtm));
  // 5 horas de las 6,5 de sesión = 0,77 del día; sigma diaria = iv/sqrt(252)
  const sigTarde = (iv / 100 / Math.sqrt(252)) * Math.sqrt(5 / 6.5) * 100;
  console.log(`| ${a} | ${Math.round(spot)} | ${((25 / spot) * 100).toFixed(3)}% | ${((50 / spot) * 100).toFixed(3)}% | ${iv.toFixed(1)}% | ${sigTarde.toFixed(3)}% | ${((25 / spot) * 100 / sigTarde).toFixed(2)}σ |`);
}
console.log("\n  Si la última columna cae con los años, el cóndor de HOY está MÁS cerca del dinero que el de 2022,");
console.log("  aunque los '25 puntos' se escriban igual. Eso solo no explica el signo, pero cambia qué se compara.\n");
