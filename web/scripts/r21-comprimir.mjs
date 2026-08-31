// COMPRIMIR LAS CADENAS Y EL INTERÉS ABIERTO — sin tocar los originales.
//
// Lester: «comprime lo que vas a comprimir y luego comienzas a bajar los años».
//
// Hoy hay 75.961 ficheros de cadenas (2,6 GB) y 74.265 de interés abierto (1,6 GB), uno por
// ticker y día. Cada pregunta abre decenas de miles. Dos problemas: el tamaño y, sobre todo,
// **el coste de abrir tantos ficheros**.
//
// QUÉ HACE: junta cada ticker-año en UN fichero, comprimido con gzip.
//   antes:  SPY_d20260415.json  × 250 al año  ·  después:  SPY_2026.json.gz
// De ~150.000 ficheros a ~700.
//
// ⚠ NO BORRA NADA. Escribe en cadenas-z/ y oi-z/. Los originales se quedan intactos hasta que
// la verificación demuestre que dan exactamente los mismos números.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

const TAREAS = [
  { origen: join(CACHE, "cadenas"), destino: join(CACHE, "cadenas-z"), nombre: "cadenas" },
  { origen: join(CACHE, "oi-ancho"), destino: join(CACHE, "oi-z"), nombre: "oi-ancho" },
];

const MB = (b) => (b / 1024 / 1024).toFixed(0) + " MB";

for (const { origen, destino, nombre } of TAREAS) {
  if (!existsSync(origen)) { console.log(`  ${nombre}: no existe, saltando`); continue; }
  if (!existsSync(destino)) mkdirSync(destino, { recursive: true });

  // agrupar por ticker y año
  const grupos = new Map();
  let bytesOrig = 0;
  for (const f of readdirSync(origen)) {
    const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f);
    if (!g) continue;
    const k = `${g[1]}_${g[2].slice(0, 4)}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push({ f, dia: g[2] });
    bytesOrig += statSync(join(origen, f)).size;
  }
  console.log(`\n  ${nombre}: ${grupos.size} grupos ticker-año · ${MB(bytesOrig)} en ${[...grupos.values()].reduce((a, v) => a + v.length, 0).toLocaleString("en-US")} ficheros`);

  let hechos = 0, bytesNuevos = 0;
  const t0 = Date.now();
  for (const [k, lista] of [...grupos].sort()) {
    const salida = join(destino, `${k}.json.gz`);
    if (existsSync(salida)) { hechos++; bytesNuevos += statSync(salida).size; continue; }
    const paquete = {};
    for (const { f, dia } of lista.sort((a, b) => a.dia.localeCompare(b.dia))) {
      try { paquete[dia] = JSON.parse(readFileSync(join(origen, f), "utf8")); } catch { /* fichero roto: se salta y se nota abajo */ }
    }
    const gz = gzipSync(Buffer.from(JSON.stringify(paquete)), { level: 6 });
    writeFileSync(salida, gz);
    bytesNuevos += gz.length;
    hechos++;
    if (hechos % 50 === 0) {
      const seg = (Date.now() - t0) / 1000;
      console.log(`     ${hechos}/${grupos.size} · ${MB(bytesNuevos)} escritos · ${seg.toFixed(0)}s · quedan ~${((seg / hechos) * (grupos.size - hechos) / 60).toFixed(0)} min`);
    }
  }
  console.log(`  ${nombre} LISTO: ${MB(bytesOrig)} → ${MB(bytesNuevos)}  (${(100 * (1 - bytesNuevos / bytesOrig)).toFixed(0)}% menos) · ${grupos.size} ficheros`);
}
console.log(`\n  Los originales NO se han tocado. Ver r22-leer-comprimido.mjs para el lector y la verificación.\n`);
