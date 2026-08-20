// ANATOMÍA 3 · PASO 1 — extraer el CAMINO de 5 minutos de cada día.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/anatomia3-camino.mjs
//
// scripts/regimen-filas.json ya trae ap / sp11 / maxM / minM, pero eso son los EXTREMOS de la
// mañana. El encargo pide la FORMA del recorrido, no sólo sus bordes: si el precio fue en línea
// recta o dio vueltas, si aceleró contra las 11:00, si la IV del dinero subía o bajaba mientras.
// Nada de eso se puede reconstruir de cuatro números, así que hay que volver a las cadenas.
//
// De cada día se guarda:
//   h  — las marcas de 5 minutos que existen de verdad (09:35…16:00; a las 09:30 el subyacente
//        viene a 0,0 en el fichero y ese cero NO se rellena: la marca simplemente no está)
//   s  — el precio del subyacente en cada marca
//   iv — la implícita del strike MÁS CERCANO AL DINERO en esa marca (null si no hay ninguna > 0)
//
// Se guarda el día ENTERO, no sólo la mañana, porque el rango real de AYER (que sí es observable
// hoy a las 11:00) necesita el máximo y el mínimo de toda la sesión de ayer, no los de su mañana.
// El campo `rangoAyer` de regimen-18 usaba maxM/minM de ayer, o sea el rango de la MAÑANA de ayer.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const OUT = "scripts/anatomia3-camino.json";

const fechas = [...new Set(
  readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean),
)].sort();
console.log(`## ${fechas.length} días de cadena CALL en ${DIR}`);

const res = {};
const t0 = Date.now();
for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  if (i % 50 === 0) {
    const seg = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`   ${i}/${fechas.length} · ${fecha} · ${seg}s`);
  }
  const p = `${DIR}/iv_${fecha}_C.csv`;
  const lin = readFileSync(p, "utf8").split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp");
  const iV = cab.indexOf("implied_vol"), iU = cab.indexOf("underlying_price");
  if ([iK, iT, iV, iU].some((x) => x < 0)) throw new Error(`faltan columnas en ${p}`);

  const spot = new Map();          // "HH:MM" -> precio del subyacente
  const atm = new Map();           // "HH:MM" -> { d: distancia al dinero, iv }
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j];
    if (L.length < 20) continue;
    const c = L.split(",");
    const sp = Number(c[iU]);
    if (!(sp > 0)) continue;       // 09:30 viene a 0,0 — no se inventa
    const h = c[iT].slice(11, 16);
    spot.set(h, sp);
    const iv = Number(c[iV]);
    if (!(iv > 0)) continue;
    const d = Math.abs(Number(c[iK]) - sp);
    const cur = atm.get(h);
    if (!cur || d < cur.d) atm.set(h, { d, iv });
  }
  const horas = [...spot.keys()].sort();
  if (!horas.length) { console.log(`   ⚠️ ${fecha}: 0 marcas con subyacente > 0 — se salta`); continue; }
  res[fecha] = {
    h: horas,
    s: horas.map((h) => spot.get(h)),
    iv: horas.map((h) => (atm.has(h) ? Number(atm.get(h).iv.toFixed(6)) : null)),
  };
}

writeFileSync(OUT, JSON.stringify(res), "utf8");
const dias = Object.keys(res);
const marcas = dias.map((d) => res[d].h.length);
console.log(`\n## guardado ${OUT}`);
console.log(`   ${dias.length} días · marcas por día: mín ${Math.min(...marcas)} · máx ${Math.max(...marcas)}`);
console.log(`   ${((Date.now() - t0) / 1000).toFixed(0)}s`);
