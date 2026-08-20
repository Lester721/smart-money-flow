// ¿ES 13:45 UN PICO REAL O EL MÁXIMO DE 23 SORTEOS RUIDOSOS?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/refuta-hora-argmax.mjs
//
// Bootstrap EMPAREJADO por día: se remuestrean los 653 días con reemplazo y se recalculan las 23
// horas SOBRE LOS MISMOS DÍAS remuestreados. Así se conserva la correlación entre horas (todas
// ven el mismo día) y la única fuente de variación es qué días tocaron.
//
// Dos preguntas:
//   (a) ¿en qué fracción de los remuestreos sigue siendo 13:45 la hora más eficiente?
//   (b) ¿cuánto vale la EFICIENCIA MÁXIMA DE 23 HORAS por puro azar? (el listón que falta)

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { media, pct, eur, drawdown } from "./anatomia3-lib.mjs";

const DIR = "scripts/cache-theta/gex-2026";
const SEP = 25, ALA = 50, COMM = 0.03;
const TODAS = ["09:35", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30",
               "11:45", "12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "13:45",
               "14:00", "14:15", "14:30", "14:45", "15:00"];

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid");
  const iA = cab.indexOf("ask"), iU = cab.indexOf("underlying_price");
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) throw new Error(`faltan columnas en ${f}`);
  const set = new Set(TODAS), filas = new Map(), spots = new Map();
  let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j]; if (L.length < 20) continue;
    const c = L.split(",");
    const h = c[iT].slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (!set.has(h)) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (!(K > 0) || !(ask > 0) || !(bid >= 0)) continue;
    if (!filas.has(h)) filas.set(h, []);
    filas.get(h).push({ K, bid, ask });
    if (sp > 0) spots.set(h, sp);
  }
  return { filas, spots, cierre };
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

// matriz dia × hora de P&L (null si ese día esa hora no da cóndor)
const dias = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const S = C.cierre;
  const fila = { fecha, pl: {} };
  for (const h of TODAS) {
    const fc = C.filas.get(h), fp = P.filas.get(h), spot = C.spots.get(h);
    if (!fc || !fp || !(spot > 0)) continue;
    const cC = cerca(fc, spot + SEP), pC = cerca(fp, spot - SEP);
    const cL = cerca(fc, cC.K + ALA), pL = cerca(fp, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) continue;
    const credito = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(credito > 0)) continue;
    const perdC = Math.min(Math.max(S - cC.K, 0), cL.K - cC.K);
    const perdP = Math.min(Math.max(pC.K - S, 0), pC.K - pL.K);
    fila.pl[h] = (credito - perdC - perdP) * 100 - 8 * COMM;
  }
  dias.push(fila);
}
// sólo los días en que TODAS las horas dan cóndor: comparación emparejada limpia
const panel = dias.filter((d) => TODAS.every((h) => d.pl[h] != null));
console.log(`\npanel emparejado: ${panel.length} días de ${dias.length} (los que dan cóndor a las 23 horas)`);

const ef = (pls) => { const dd = drawdown(pls); return dd < 0 ? (media(pls) * 251) / Math.abs(dd) : -Infinity; };
const real = {};
for (const h of TODAS) real[h] = ef(panel.map((d) => d.pl[h]));
const ordReal = [...TODAS].sort((a, b) => real[b] - real[a]);
console.log(`eficiencia real (panel): ${ordReal.slice(0, 5).map((h) => `${h}=${real[h].toFixed(2)}`).join("  ")}   …   11:00=${real["11:00"].toFixed(2)}`);

let seed = 424242;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const B = 2000;
const gana = Object.fromEntries(TODAS.map((h) => [h, 0]));
const maxEf = [], ef1345 = [], ef1100 = [], rank1345 = [];
for (let b = 0; b < B; b++) {
  const idx = []; for (let i = 0; i < panel.length; i++) idx.push((rnd() * panel.length) | 0);
  const serie = {};
  for (const h of TODAS) serie[h] = ef(idx.map((i) => panel[i].pl[h]));
  const mejor = TODAS.reduce((a, h) => (serie[h] > serie[a] ? h : a), TODAS[0]);
  gana[mejor]++;
  maxEf.push(serie[mejor]); ef1345.push(serie["13:45"]); ef1100.push(serie["11:00"]);
  rank1345.push([...TODAS].sort((a, x) => serie[x] - serie[a]).indexOf("13:45") + 1);
}

console.log(`\n-- (a) ¿QUIÉN GANA EL CONCURSO EN CADA REMUESTREO? (${B} remuestreos emparejados) --`);
const rank = Object.entries(gana).sort((a, b) => b[1] - a[1]);
for (const [h, n] of rank.slice(0, 8)) console.log(`   ${h}  gana ${(n / B * 100).toFixed(1)}% de las veces`);
console.log(`   …  13:45 gana ${(gana["13:45"] / B * 100).toFixed(1)}% · 11:00 gana ${(gana["11:00"] / B * 100).toFixed(1)}%`);
console.log(`   puesto de 13:45 entre las 23: mediana ${pct(rank1345, 0.5)} · p05 ${pct(rank1345, 0.05)} · p95 ${pct(rank1345, 0.95)}`);

console.log(`\n-- (b) EL LISTÓN QUE FALTA: cuánto vale el MÁXIMO DE 23 HORAS por azar --`);
console.log(`   eficiencia de 13:45 en el dato real: ${real["13:45"].toFixed(2)}`);
console.log(`   distribución del MÁXIMO de las 23 en los remuestreos: p50 ${pct(maxEf, 0.5).toFixed(2)} · p95 ${pct(maxEf, 0.95).toFixed(2)}`);
console.log(`   → un 1,53 es lo NORMAL para el ganador de 23 sorteos: el ${(maxEf.filter((x) => x >= real["13:45"]).length / B * 100).toFixed(0)}% de los máximos lo iguala o supera.`);
console.log(`\n   intervalo de la eficiencia de 13:45: p05 ${pct(ef1345, 0.05).toFixed(2)} · p50 ${pct(ef1345, 0.5).toFixed(2)} · p95 ${pct(ef1345, 0.95).toFixed(2)}`);
console.log(`   intervalo de la eficiencia de 11:00: p05 ${pct(ef1100, 0.05).toFixed(2)} · p50 ${pct(ef1100, 0.5).toFixed(2)} · p95 ${pct(ef1100, 0.95).toFixed(2)}`);
const dif = ef1345.map((x, i) => x - ef1100[i]);
console.log(`   diferencia emparejada 13:45 − 11:00: p05 ${pct(dif, 0.05).toFixed(2)} · p50 ${pct(dif, 0.5).toFixed(2)} · p95 ${pct(dif, 0.95).toFixed(2)}` +
            ` · a favor de 13:45 en el ${(dif.filter((x) => x > 0).length / B * 100).toFixed(0)}% de los remuestreos`);

// la cola SOLA, sin el ingreso: ¿esa sí es estable?
const cvar = (pls, q) => { const v = [...pls].sort((a, b) => a - b); return media(v.slice(0, Math.max(1, Math.floor(v.length * q)))); };
const difC = [], difD = [], difI = [];
seed = 999;
for (let b = 0; b < B; b++) {
  const idx = []; for (let i = 0; i < panel.length; i++) idx.push((rnd() * panel.length) | 0);
  const a = idx.map((i) => panel[i].pl["13:45"]), c = idx.map((i) => panel[i].pl["11:00"]);
  difC.push(Math.abs(cvar(c, 0.05)) - Math.abs(cvar(a, 0.05)));
  difD.push(Math.abs(drawdown(c)) - Math.abs(drawdown(a)));
  difI.push((media(a) - media(c)) * 251);
}
console.log(`\n-- (c) LAS TRES PIEZAS POR SEPARADO (bootstrap emparejado, 13:45 contra 11:00) --`);
console.log(`   CVaR5 eliminado : p05 ${eur(pct(difC, 0.05))} · p50 ${eur(pct(difC, 0.5))} · p95 ${eur(pct(difC, 0.95))} · >0 en el ${(difC.filter((x) => x > 0).length / B * 100).toFixed(0)}%`);
console.log(`   caída eliminada : p05 ${eur(pct(difD, 0.05))} · p50 ${eur(pct(difD, 0.5))} · p95 ${eur(pct(difD, 0.95))} · >0 en el ${(difD.filter((x) => x > 0).length / B * 100).toFixed(0)}%`);
console.log(`   Δ ingreso/año   : p05 ${eur(pct(difI, 0.05))} · p50 ${eur(pct(difI, 0.5))} · p95 ${eur(pct(difI, 0.95))} · >0 en el ${(difI.filter((x) => x > 0).length / B * 100).toFixed(0)}%`);

writeFileSync("scripts/refuta-hora-argmax.json", JSON.stringify({
  panel: panel.length, real, gana, rank1345: { p50: pct(rank1345, 0.5), p05: pct(rank1345, 0.05), p95: pct(rank1345, 0.95) },
  maxEf: { p50: pct(maxEf, 0.5), p95: pct(maxEf, 0.95) },
  dif: { p05: pct(dif, 0.05), p50: pct(dif, 0.5), p95: pct(dif, 0.95) },
  piezas: { cvar: [pct(difC, 0.05), pct(difC, 0.5), pct(difC, 0.95)], dd: [pct(difD, 0.05), pct(difD, 0.5), pct(difD, 0.95)], ing: [pct(difI, 0.05), pct(difI, 0.5), pct(difI, 0.95)] },
}, null, 2));
console.log(`\n-> scripts/refuta-hora-argmax.json`);
