// EXTRACTOR — el camino de 5 minutos de la MAÑANA (09:30 → 11:00) de cada día.
//
// Las filas de scripts/regimen-filas.json sólo guardan max/min de la mañana. Para medir la
// VELOCIDAD y si la mañana fue tendencia o rango hacen falta las 19 marcas de 5 minutos.
// Se leen del fichero de CALLS (el underlying_price es el mismo en ambos lados).
//
// Nada de esto mira al futuro: todo es ≤ 11:00 ET, la hora de entrada.

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026", SALIDA = "scripts/colaintra-camino.json";
const LIMITE = "11:00";

const fechas = [...new Set(readdirSync(DIR)
  .map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
console.log(`## ${fechas.length} días con fichero de calls`);

const salida = {};
const t0 = Date.now();
for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  if (i % 50 === 0) console.log(`   ${i}/${fechas.length} · ${fecha} · ${((Date.now()-t0)/1000).toFixed(0)}s`);
  const txt = readFileSync(`${DIR}/iv_${fecha}_C.csv`, "utf8");

  // CABECERA COMPROBADA — un campo que no existe se lee como 0.
  const finCab = txt.indexOf("\n");
  const cab = txt.slice(0, finCab).replace(/\r/g, "").split(",").map((x) => x.replace(/"/g, "").trim());
  if (cab[cab.length - 1] !== "underlying_price" || cab[cab.length - 2] !== "underlying_timestamp")
    throw new Error(`${fecha}: las dos últimas columnas no son underlying_timestamp,underlying_price → ${cab.slice(-3)}`);

  const camino = {};
  let pos = finCab + 1;
  while (pos < txt.length) {
    let fin = txt.indexOf("\n", pos);
    if (fin < 0) fin = txt.length;
    const linea = txt.slice(pos, fin);
    pos = fin + 1;
    if (linea.length < 20) continue;
    const c1 = linea.lastIndexOf(",");
    const c2 = linea.lastIndexOf(",", c1 - 1);
    const sp = Number(linea.slice(c1 + 1));
    if (!(sp > 0)) continue;
    const h = linea.slice(c2 + 1, c1).slice(11, 16);   // HH:MM del underlying_timestamp
    if (h.length !== 5 || h > LIMITE) continue;
    camino[h] = sp;                                     // misma marca = mismo spot
  }
  const marcas = Object.keys(camino).sort();
  if (marcas.length < 5) { console.log(`   ⚠️  ${fecha}: sólo ${marcas.length} marcas — se salta`); continue; }
  salida[fecha] = camino;
}
writeFileSync(SALIDA, JSON.stringify(salida), "utf8");
const ns = Object.values(salida).map((c) => Object.keys(c).length).sort((a, b) => a - b);
console.log(`\n✅ ${Object.keys(salida).length} días guardados en ${SALIDA}`);
console.log(`   marcas por día: min ${ns[0]} · p50 ${ns[ns.length >> 1]} · max ${ns[ns.length - 1]}`);
