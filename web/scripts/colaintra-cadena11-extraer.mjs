// EXTRACTOR — la cadena de las 11:00 (±250 puntos del spot), para poder MOVER los strikes.
//
// Hace falta para probar el puente: en los días que la señal marca, en vez de NO operar, vender
// más lejos. Sin la cadena entera a las 11:00 no se puede construir otro cóndor que el de ±25.
// Bid y ask REALES, tal como vienen del fichero. Nada de punto medio ni de Black-Scholes.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026", SALIDA = "scripts/colaintra-cadena11.json";
const HORA = "11:00", VENTANA = 250;

const fechas = [...new Set(readdirSync(DIR)
  .map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();

function leer(fecha, right) {
  const txt = readFileSync(`${DIR}/iv_${fecha}_${right}.csv`, "utf8");
  const finCab = txt.indexOf("\n");
  const cab = txt.slice(0, finCab).replace(/\r/g, "").split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "implied_vol", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error(`${fecha} ${right}: faltan columnas → ${cab.join("|")}`);
  const [iK, iT, iB, iA, iV, iU] = idx;
  const filas = [];
  let spot = 0, pos = finCab + 1;
  while (pos < txt.length) {
    let fin = txt.indexOf("\n", pos);
    if (fin < 0) fin = txt.length;
    const linea = txt.slice(pos, fin); pos = fin + 1;
    if (linea.length < 20) continue;
    const c = linea.split(",");
    if (String(c[iT]).slice(11, 16) !== HORA) continue;
    const K = +c[iK], bid = +c[iB], ask = +c[iA], iv = +c[iV], sp = +c[iU];
    if (sp > 0) spot = sp;
    if (K > 0 && bid >= 0 && ask > 0) filas.push([K, bid, ask, iv > 0 ? +iv.toFixed(4) : 0]);
  }
  if (!(spot > 0)) return null;
  return { spot, filas: filas.filter((r) => Math.abs(r[0] - spot) <= VENTANA) };
}

const salida = {};
const t0 = Date.now();
for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  if (i % 100 === 0) console.log(`   ${i}/${fechas.length} · ${fecha} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const C = leer(fecha, "C"), P = leer(fecha, "P");
  if (!C || !P) { console.log(`   ⚠️  ${fecha}: sin cadena a las ${HORA} — fuera, no se rellena`); continue; }
  salida[fecha] = { spot: C.spot, C: C.filas, P: P.filas };
}
writeFileSync(SALIDA, JSON.stringify(salida), "utf8");
const nC = Object.values(salida).map((d) => d.C.length).sort((a, b) => a - b);
console.log(`\n✅ ${Object.keys(salida).length} días · strikes de call por día: min ${nC[0]} · p50 ${nC[nC.length >> 1]} · max ${nC[nC.length - 1]}`);
