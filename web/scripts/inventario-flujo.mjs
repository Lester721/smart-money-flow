// INVENTARIO del flujo histórico bajado — para ELEGIR la muestra con datos, no a ojo.
//
// Uso: node scripts/inventario-flujo.mjs
//
// POR QUÉ EXISTE. Los ficheros traen las operaciones notables con su bid/ask y su open interest:
// todo lo de la ENTRADA. Pero el P&L necesita el precio de SALIDA, y eso es una petición nueva a
// ThetaData **por operación**. Con ~200.000 notables eso no se pide entero.
//
// Así que hay que elegir un umbral de prima, y esa elección cambia el resultado. Este script
// enseña cuántas operaciones quedan con cada umbral y cuánto costaría medirlas, para que la
// decisión se tome mirando la tabla en vez de por intuición.
//
// No toca el Terminal ni la red: sólo lee ficheros locales.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = process.env.FLUJO_DIR || "scripts/cache-theta/flujo-historico";
if (!existsSync(DIR)) { console.error(`No existe ${DIR}`); process.exit(1); }

const UMBRALES = [1, 2, 3, 5, 10, 20, 50];      // millones de dólares de prima
const SEG_POR_OP = 0.25;                         // coste medido: ~4 cotizaciones por segundo

const porTicker = {}, porAnio = {};
const primas = [];
let total = 0, sinBBO = 0, sinOI = 0;

for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  if (d.sinDatos) continue;
  const t = d.sym ?? f.split("_")[0];
  const anio = (d.dia ?? "????").slice(0, 4);
  porTicker[t] ??= {}; porAnio[anio] ??= {};
  for (const n of d.notables ?? []) {
    total++;
    primas.push(n.prima);
    if (n.bid == null || n.ask == null) sinBBO++;
    if (n.oi == null) sinOI++;
    for (const u of UMBRALES) {
      if (n.prima >= u * 1e6) {
        porTicker[t][u] = (porTicker[t][u] ?? 0) + 1;
        porAnio[anio][u] = (porAnio[anio][u] ?? 0) + 1;
      }
    }
  }
}

primas.sort((a, b) => a - b);
const pct = (p) => primas[Math.floor(primas.length * p)] ?? 0;
const M = (x) => `$${(x / 1e6).toFixed(1)}M`;

console.log(`\n═══ INVENTARIO · ${total.toLocaleString()} operaciones notables ═══\n`);
console.log(`  prima  mediana ${M(pct(0.5))} · p75 ${M(pct(0.75))} · p90 ${M(pct(0.9))} · p99 ${M(pct(0.99))} · máx ${M(primas[primas.length - 1] ?? 0)}`);
console.log(`  huecos: ${sinBBO} sin bid/ask (${((sinBBO / total) * 100).toFixed(1)}%) · ${sinOI} sin open interest (${((sinOI / total) * 100).toFixed(1)}%)`);

console.log(`\n─── CUÁNTAS QUEDAN CON CADA UMBRAL, Y CUÁNTO COSTARÍA MEDIRLAS ───`);
console.log(`umbral        operaciones     horas de descarga (salida)`);
for (const u of UMBRALES) {
  const n = primas.filter((p) => p >= u * 1e6).length;
  console.log(`  ≥ $${String(u).padStart(2)}M   ${String(n.toLocaleString()).padStart(12)}   ${((n * SEG_POR_OP) / 3600).toFixed(1).padStart(10)} h`);
}

console.log(`\n─── REPARTO POR AÑO (para que ningún año domine la muestra) ───`);
console.log(`año` + UMBRALES.map((u) => `≥$${u}M`.padStart(10)).join(""));
for (const a of Object.keys(porAnio).sort()) {
  console.log(a.padEnd(6) + UMBRALES.map((u) => String(porAnio[a][u] ?? 0).padStart(10)).join(""));
}

console.log(`\n─── REPARTO POR TICKER (lo que tumbó el hallazgo de agosto fue NFLX al 25%) ───`);
console.log(`ticker` + UMBRALES.map((u) => `≥$${u}M`.padStart(10)).join(""));
for (const t of Object.keys(porTicker).sort()) {
  console.log(t.padEnd(8) + UMBRALES.map((u) => String(porTicker[t][u] ?? 0).padStart(10)).join(""));
}

console.log(`\nLa muestra buena es la que cabe en una noche Y no deja que un ticker o un año pase`);
console.log(`del ~20%. Con eso decide Lester, no yo.\n`);
