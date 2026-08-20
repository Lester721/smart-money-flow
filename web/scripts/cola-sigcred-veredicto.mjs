// SIGMA-CREDITO · FASE 7 — EL VEREDICTO, Y EL PRECIO DE CADA PALANCA.
//
// Tres palancas para bajar la cola, medidas contra la misma vara: cuánto ingreso anual cuesta
// cada dólar de PEOR RACHA eliminado. Es la métrica que pidió Lester.
//
//   A · FILTRAR días (las 13 señales de sigma-crédito, y las 47 anteriores)
//   B · ESTRECHAR las alas (fase 6)
//   C · REDUCIR el tamaño (escalado exacto, no hay nada que medir: es multiplicar)
//
// La palanca C es el patrón oro: por construcción cuesta exactamente la razón media de la
// estrategia ($1,23 de ingreso por cada $1 de racha). Una palanca sólo MERECE LA PENA si cuesta
// MENOS que eso. Si cuesta más, es peor que simplemente operar menos contratos.

import { readFileSync } from "node:fs";
import { media, pct, eur, drawdown } from "./anatomia3-lib.mjs";

const base = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const ALAS = JSON.parse(readFileSync("scripts/cola-sigcred-alas-cache.json", "utf8"));
const CAD = JSON.parse(readFileSync("scripts/cola-sigcred-cadena.json", "utf8"));
const ANOS = (new Date(base[base.length - 1].fecha) - new Date(base[0].fecha)) / (365.25 * 864e5);

function foto(pls) {
  const tot = pls.reduce((a, b) => a + b, 0);
  return { n: pls.length, alAno: tot / ANOS, media: media(pls), peor: Math.min(...pls),
           p1: pct(pls, 0.01), p5: pct(pls, 0.05), dd: drawdown(pls),
           acierto: pls.filter((x) => x > 0).length / pls.length };
}
const plBase = base.map((f) => f.pl);
const B = foto(plBase);
const RAZON = B.alAno / -B.dd;

console.log("═".repeat(118));
console.log("  EL PRECIO DE CADA PALANCA · $/año que cuesta cada $1 de PEOR RACHA eliminado");
console.log(`  Patrón oro = reducir tamaño: cuesta exactamente $${(1 / RAZON).toFixed(2)} por $1. Nada que cueste más merece la pena.`);
console.log("═".repeat(118));
console.log(`\n  BASE · 1 cóndor de 50 pts: ${eur(B.alAno)}/año · peor día ${eur(B.peor)} · p5 ${eur(B.p5)} · p1 ${eur(B.p1)} · peor racha ${eur(B.dd)}\n`);

console.log("| palanca | ajuste | $/año | peor día | p5 | p1 | peor racha | racha eliminada | **$/año por $1 de racha** | ¿mejor que reducir tamaño? |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const linea = (pal, ajuste, f) => {
  const elim = f.dd - B.dd;                                  // dd son negativos: + = eliminada
  const coste = elim > 0 ? (B.alAno - f.alAno) / elim : NaN;
  const veredicto = !isFinite(coste) ? "no elimina racha" : coste < 1 / RAZON ? "🟢 **SÍ**" : "no";
  console.log(`| ${pal} | ${ajuste} | ${eur(f.alAno)} | ${eur(f.peor)} | ${eur(f.p5)} | ${eur(f.p1)} | ${eur(f.dd)} | ${elim > 0 ? eur(elim) : "—"} | ${isFinite(coste) ? "$" + coste.toFixed(2) : "—"} | ${veredicto} |`);
  return { pal, ajuste, ...f, elim, coste };
};
const filas = [];
filas.push(linea("— base —", "1 × ala 50", B));

// ── C · TAMAÑO (escalado exacto) ───────────────────────────────────────────
for (const m of [0.75, 0.5, 0.25])
  filas.push(linea("**C · tamaño**", `× ${m}`, foto(plBase.map((x) => x * m))));

// ── B · ALAS (fase 6, por contrato) ────────────────────────────────────────
for (const a of [30, 25, 20, 15])
  filas.push(linea("**B · alas**", `ala ${a} pts`, foto(ALAS["a" + a].map((r) => r.pl))));

// ── A · FILTRAR (los mejores de las 13 señales de esta tanda) ──────────────
for (const f of base) {
  const c = CAD[f.fecha];
  f.credDesbal = (c.credPut - c.credCall) / f.credito;
  f.credPorSigma = f.credito / f.sigma;
  f.sonrisa = (c.ivLC + c.ivLP) / 2 - (c.ivAtmC + c.ivAtmP) / 2;
}
const filtro = (nom, orden, corte) => {
  const o = [...base].sort(orden), fu = new Set(o.slice(0, Math.round(base.length * corte)).map((x) => x.fecha));
  return linea("**A · filtrar**", nom, foto(base.filter((x) => !fu.has(x.fecha)).map((x) => x.pl)));
};
filas.push(filtro("`credDesbal` bajo 20%", (a, b) => a.credDesbal - b.credDesbal, 0.20));
filas.push(filtro("`sigma` alto 20%", (a, b) => b.sigma - a.sigma, 0.20));
filas.push(filtro("`credPorSigma` alto 10%", (a, b) => b.credPorSigma - a.credPorSigma, 0.10));
filas.push(filtro("`sonrisa` bajo 33%", (a, b) => a.sonrisa - b.sonrisa, 1 / 3));

// ── EL CARA A CARA QUE DECIDE ──────────────────────────────────────────────
console.log("\n## CARA A CARA · media posición contra ala mitad — el mismo peor día, ¿cuál da más?\n");
const mitad = foto(plBase.map((x) => x * 0.5)), ala25 = foto(ALAS.a25.map((r) => r.pl));
console.log("| | 0,5 × cóndor de ala 50 | 1 × cóndor de ala 25 |");
console.log("|---|---|---|");
console.log(`| colateral | $2.500 | $2.500 |`);
console.log(`| $/año | **${eur(mitad.alAno)}** | ${eur(ala25.alAno)} |`);
console.log(`| peor día | ${eur(mitad.peor)} | ${eur(ala25.peor)} |`);
console.log(`| p5 | ${eur(mitad.p5)} | ${eur(ala25.p5)} |`);
console.log(`| p1 | ${eur(mitad.p1)} | ${eur(ala25.p1)} |`);
console.log(`| PEOR RACHA | **${eur(mitad.dd)}** | ${eur(ala25.dd)} |`);
console.log(`| acierto | ${(mitad.acierto * 100).toFixed(1)}% | ${(ala25.acierto * 100).toFixed(1)}% |`);
console.log(`| Calmar | **${(mitad.alAno / -mitad.dd).toFixed(2)}** | ${(ala25.alAno / -ala25.dd).toFixed(2)} |`);

// ── POR QUÉ: estrechar el ala sólo recorta los días catastróficos ──────────
console.log("\n## POR QUÉ ESTRECHAR EL ALA PAGA PEOR · qué le pasa a cada tipo de día\n");
const m25 = new Map(ALAS.a25.map((r) => [r.fecha, r.pl]));
console.log("| tipo de día (según el ala de 50) | n | media ala 50 | media ala 25 | ¿se reduce a la mitad? |");
console.log("|---|---|---|---|---|");
const cubos = [
  ["ganancia", (p) => p > 0],
  ["pérdida pequeña (0 a $1.000)", (p) => p <= 0 && p > -1000],
  ["pérdida media ($1.000 a $3.000)", (p) => p <= -1000 && p > -3000],
  ["pérdida grande (> $3.000)", (p) => p <= -3000],
];
for (const [nom, cond] of cubos) {
  const g = base.filter((f) => cond(f.pl) && m25.has(f.fecha));
  if (!g.length) continue;
  const a50 = media(g.map((f) => f.pl)), a25 = media(g.map((f) => m25.get(f.fecha)));
  const r = a25 / a50;
  console.log(`| ${nom} | ${g.length} | ${eur(a50)} | ${eur(a25)} | ${(r * 100).toFixed(0)}% del de 50 ${Math.abs(r - 0.5) < 0.1 ? "← sí" : "← **no**"} |`);
}
console.log("\n  El ala estrecha SÓLO parte por la mitad los días catastróficos. Los días de pérdida");
console.log("  pequeña y media pierden casi lo mismo que con el ala ancha, porque la pérdida la");
console.log("  fija lo lejos que cerró del strike vendido, no el ala. Pero el crédito baja TODOS");
console.log("  los días. Se paga la protección los 653 días y sólo se cobra en los 26 peores.");

// ── el peor día, la única prueba que ninguna señal pasa ────────────────────
console.log("\n## EL DÍA QUE NINGUNA SEÑAL VIO\n");
const peor = base.reduce((a, b) => (b.pl < a.pl ? b : a));
const c = CAD[peor.fecha];
console.log(`  ${peor.fecha} · P&L ${eur(peor.pl)} — el peor de los 653 días.`);
console.log(`    crédito ${eur(peor.credito)} (percentil ${(base.filter((f) => f.credito <= peor.credito).length / base.length * 100).toFixed(0)} de la serie)`);
console.log(`    σ ${peor.sigma.toFixed(0)} pts (percentil ${(base.filter((f) => f.sigma <= peor.sigma).length / base.length * 100).toFixed(0)})`);
console.log(`    los ±25 puntos eran ${(25 / peor.sigma).toFixed(2)}σ — de los más SEGUROS de la serie`);
console.log(`    movimiento de 11:00 al cierre: ${(peor.cierre - peor.sp11).toFixed(0)} pts = ${(Math.abs(peor.cierre - peor.sp11) / peor.sigma).toFixed(2)}σ`);
console.log(`    todas las señales lo daban por día TRANQUILO. Lo fue: hasta que dejó de serlo.`);
console.log(`\n  Contra ese día no hay filtro posible. Sólo tamaño.`);

console.log("\n" + "═".repeat(118));
console.log("  RESUMEN · palancas ordenadas por precio ($/año por cada $1 de racha eliminado; menos es mejor)");
console.log("═".repeat(118));
for (const f of filas.filter((x) => isFinite(x.coste)).sort((a, b) => a.coste - b.coste))
  console.log(`   $${f.coste.toFixed(2)}  ${f.pal.replace(/\*/g, "")} · ${f.ajuste.replace(/`/g, "")} → ${eur(f.alAno)}/año, racha ${eur(f.dd)}`);
console.log(`\n   patrón oro (reducir tamaño): $${(1 / RAZON).toFixed(2)}`);
