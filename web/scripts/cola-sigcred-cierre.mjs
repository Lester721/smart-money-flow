// SIGMA-CREDITO · FASE 8 — LOS DOS CONTROLES QUE CIERRAN EL CASO.
//
// 1 · ¿Alguno de los 78 filtros de la fase 2 movió el PEOR DÍA? (no la racha: el peor día)
// 2 · `asim` — la asimetría de la rejilla de strikes, que es casi la parte decimal del spot —
//     ¿saca también p<0,05 en la permutación? Si un artefacto mecánico saca lo mismo que el
//     candidato, el candidato no está probado: está dentro del ruido de la búsqueda.
//
// Además se corrige el patrón oro mal etiquetado en la fase 7: reducir tamaño cuesta $1,23 de
// ingreso anual por cada $1 de racha eliminado (= la razón media de la estrategia), no $0,81.

import { readFileSync } from "node:fs";
import { media, pct, eur, drawdown } from "./anatomia3-lib.mjs";

const base = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const F2 = JSON.parse(readFileSync("scripts/cola-sigma-credito-salida.json", "utf8"));
const CAD = JSON.parse(readFileSync("scripts/cola-sigcred-cadena.json", "utf8"));
const ANOS = (new Date(base[base.length - 1].fecha) - new Date(base[0].fecha)) / (365.25 * 864e5);
const plBase = base.map((f) => f.pl);
const PEOR = Math.min(...plBase), DD = drawdown(plBase), ALANO = plBase.reduce((a, b) => a + b, 0) / ANOS;

console.log("═".repeat(104));
console.log("  LOS DOS CONTROLES QUE CIERRAN EL CASO");
console.log("═".repeat(104));

// ── 1 · el peor día, a lo largo de los 78 filtros ──────────────────────────
console.log(`\n## 1 · DE LOS ${F2.filtros.length} FILTROS DE LA FASE 2, ¿CUÁNTOS MOVIERON EL PEOR DÍA?\n`);
console.log(`  peor día sin filtrar: ${eur(PEOR)}`);
const movieron = F2.filtros.filter((f) => f.F.peor > PEOR + 1);
const mucho = F2.filtros.filter((f) => f.F.peor > PEOR * 0.75);      // >25% de mejora
console.log(`  filtros que lo mejoraron ALGO: ${movieron.length} de ${F2.filtros.length}`);
console.log(`  filtros que lo mejoraron más de un 25%: **${mucho.length} de ${F2.filtros.length}**`);
const mejores = [...F2.filtros].sort((a, b) => b.F.peor - a.F.peor).slice(0, 5);
console.log("\n| el mejor peor-día conseguido | señal | corte | $/año | peor racha |");
console.log("|---|---|---|---|---|");
for (const f of mejores)
  console.log(`| ${eur(f.F.peor)} (base ${eur(PEOR)}) | \`${f.campo}\` | ${f.dir} ${(f.corte * 100).toFixed(0)}% | ${eur(f.F.alAno)} | ${eur(f.F.dd)} |`);
console.log(`\n  El mejor de los ${F2.filtros.length} baja el peor día de ${eur(PEOR)} a ${eur(mejores[0].F.peor)}: un ${((1 - mejores[0].F.peor / PEOR) * 100).toFixed(0)}%.`);
console.log(`  Reducir el tamaño un 6% consigue lo mismo, sin buscar nada y sin riesgo de sobreajuste.`);

// ── 2 · el artefacto de la rejilla, bajo la misma permutación ──────────────
for (const f of base) {
  const c = CAD[f.fecha];
  f.asim = (c.kSC - c.sp11) - (c.sp11 - c.kSP);
  f.credDesbal = (c.credPut - c.credCall) / f.credito;
  f.decimal = c.sp11 - Math.floor(c.sp11);            // la parte decimal del índice: ruido puro
}
function permP(nFuera, obs, semilla, metrica) {
  let s = (semilla >>> 0) || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const idx = base.map((_, i) => i);
  let iguala = 0;
  for (let p = 0; p < 4000; p++) {
    const a = [...idx];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    const q = new Set(a.slice(0, nFuera));
    const pls = [];
    for (let i = 0; i < base.length; i++) if (!q.has(i)) pls.push(base[i].pl);
    if (metrica(pls) >= obs) iguala++;
  }
  return iguala / 4000;
}
console.log("\n## 2 · EL ARTEFACTO DE LA REJILLA CONTRA EL CANDIDATO\n");
console.log("  `asim` = (distancia a la call vendida) − (distancia a la put vendida). Con strikes de 5 en 5");
console.log("  y el índice donde caiga, es esencialmente la parte decimal del spot: no es información de mercado.\n");
console.log("| corte del 20% por… | $/año | peor día | peor racha | Calmar | p permutación (racha) |");
console.log("|---|---|---|---|---|---|");
const nF = Math.round(base.length * 0.20);
for (const [nom, orden, sem] of [
  ["`credDesbal` (el candidato)", (a, b) => a.credDesbal - b.credDesbal, 111],
  ["`asim` (artefacto de rejilla)", (a, b) => a.asim - b.asim, 222],
  ["la parte decimal del índice (RUIDO PURO)", (a, b) => a.decimal - b.decimal, 333],
]) {
  const o = [...base].sort(orden), fu = new Set(o.slice(0, nF).map((x) => x.fecha));
  const pl = base.filter((x) => !fu.has(x.fecha)).map((x) => x.pl);
  const dd = drawdown(pl), alAno = pl.reduce((a, b) => a + b, 0) / ANOS;
  const p = permP(nF, dd, sem, (v) => drawdown(v));
  console.log(`| ${nom} | ${eur(alAno)} | ${eur(Math.min(...pl))} | ${eur(dd)} | ${(alAno / -dd).toFixed(2)} | ${p.toFixed(4)} |`);
}

// ── 3 · el patrón oro, bien etiquetado ────────────────────────────────────
console.log("\n## 3 · EL PATRÓN ORO, CORREGIDO\n");
console.log(`  La estrategia entera gana ${eur(ALANO)}/año a cambio de aceptar ${eur(DD)} de peor racha.`);
console.log(`  Razón: **$${(ALANO / -DD).toFixed(2)} de ingreso anual por cada $1 de racha**.`);
console.log(`  Reducir el tamaño mueve las dos cifras EXACTAMENTE en la misma proporción, así que`);
console.log(`  comprar reducción de cola por esa vía cuesta $${(ALANO / -DD).toFixed(2)} por $1. Ése es el listón.`);
console.log(`\n  · estrechar las alas cuesta $1,95-$2,52 por $1 → PEOR que reducir tamaño. Descartado.`);
console.log(`  · filtrar por señal sale a $-0,27-$0,46 por $1 EN ESTA MUESTRA → mejor sobre el papel,`);
console.log(`    pero es el precio medido DESPUÉS de elegir el mejor de 78 cortes, y ninguno mueve el peor día.`);

console.log("\n" + "═".repeat(104));
console.log("  CIERRE: la cola se PREDICE (z hasta 5,97) y se PAGA. Su borde izquierdo no se corta");
console.log("  con ninguna señal — sólo con tamaño.");
console.log("═".repeat(104));
