// ═══════════════════════════════════════════════════════════════════════════════════════════
// EL CAMINO DEL PRECIO CADA 5 MINUTOS — 2022-01 → 2026-08, los 1.122 días.
//
// Por qué hace falta: `gex-niveles.json` guarda el recorrido sólo CADA 30 MINUTOS (13 puntos).
// Para preguntar "¿el precio TOCÓ el muro?" 13 puntos al día no valen: un toque de diez minutos
// se pierde entero entre dos muestras. `anatomia3-camino.json` sí tiene 5 minutos pero empieza
// en 2024 — 653 días de los 1.122. Así que se reconstruye desde el CSV, que es donde vive.
//
// De dónde sale: `underlying_price` de iv_AAAA-MM-DD_{C,P}.csv. Es el índice SPX a esa hora,
// idéntico en las dos caras de la cadena; se leen las dos y se unen porque a veces una barra
// falta en un lado. La barra de las 09:30 trae underlying_price = 0 (la cadena aún no cotiza),
// así que el camino EMPIEZA a las 09:35 — que es también el momento de decisión de los niveles.
//
// Validación (no opcional): los 13 puntos de `cada30` y el cierre de gex-niveles.json tienen que
// caer sobre este camino al céntimo. Si no cuadran, LANZA.
//
// Salida: scripts/muros-camino.json   { "AAAA-MM-DD": { h:[...78], s:[...78] } }
// Uso:    node --import tsx --max-old-space-size=10240 scripts/muros-camino.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const NIVELES = "scripts/gex-niveles.json";
const SALIDA = "scripts/muros-camino.json";
const DESDE = "09:35";

/** Un campo que no existe se lee como 0 y 0 no da error. Aquí lanza. */
function columnas(cabecera, pedidas, fichero) {
  const cab = cabecera.split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = {};
  const faltan = [];
  for (const p of pedidas) { const i = cab.indexOf(p); if (i < 0) faltan.push(p); idx[p] = i; }
  if (faltan.length) throw new Error(`${fichero}: faltan columnas [${faltan.join(", ")}]`);
  return idx;
}

function leerCamino(fecha, right, dst) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return false;
  const txt = readFileSync(f, "utf8");
  const nl = txt.indexOf("\n");
  if (nl < 0) return false;
  const I = columnas(txt.slice(0, nl), ["timestamp", "underlying_price"], f);
  const lin = txt.split("\n");
  for (let j = 1; j < lin.length; j++) {
    const l = lin[j];
    if (l.length < 20) continue;
    const c = l.split(",");
    const ts = c[I.timestamp];
    if (!ts || ts.length < 16) continue;
    const h = ts.slice(11, 16);
    if (h < DESDE) continue;
    const p = +c[I.underlying_price];
    if (p > 0 && !dst.has(h)) dst.set(h, p);
  }
  return true;
}

const fechas = [...new Set(readdirSync(DIR)
  .map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

console.log(`\n## CAMINO DE 5 MINUTOS · ${fechas.length} días de cadena\n`);

const out = {};
const t0 = Date.now();
let sinNada = 0;
for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  if (i % 150 === 0) console.log(`  ${String(i).padStart(4)}/${fechas.length} · ${fecha} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const m = new Map();
  leerCamino(fecha, "C", m);
  leerCamino(fecha, "P", m);
  if (m.size < 10) { sinNada++; continue; }
  const h = [...m.keys()].sort();
  out[fecha] = { h, s: h.map((x) => +m.get(x).toFixed(2)) };
}
console.log(`  ${fechas.length}/${fechas.length} · ${((Date.now() - t0) / 1000).toFixed(0)}s · ${sinNada} días sin camino\n`);

// ═══ VALIDACIÓN CONTRA gex-niveles.json ════════════════════════════════════════════════════
const N = JSON.parse(readFileSync(NIVELES, "utf8"));
let comprobados = 0, puntos = 0, peor = 0, faltan = 0, malBarras = 0;
const largos = {};
for (const f of N.filas) {
  const c = out[f.fecha];
  if (!c) { faltan++; continue; }
  comprobados++;
  largos[c.h.length] = (largos[c.h.length] || 0) + 1;
  if (c.h.length !== f.barras5min) malBarras++;
  const m = new Map(c.h.map((x, i) => [x, c.s[i]]));
  const chequeos = [[DESDE, f.apertura], ["16:00", f.cierre], ...f.cada30];
  for (const [h, v] of chequeos) {
    const p = m.get(h);
    if (p == null) continue;
    const d = Math.abs(p - v);
    if (d > peor) peor = d;
    puntos++;
  }
}
console.log(`## VALIDACIÓN`);
console.log(`   días de niveles con camino ............ ${comprobados} / ${N.filas.length}   (faltan ${faltan})`);
console.log(`   puntos comparados ..................... ${puntos}`);
console.log(`   diferencia MÁXIMA ..................... ${peor.toFixed(4)}`);
console.log(`   días donde barras5min NO cuadra ....... ${malBarras}`);
console.log(`   longitudes del camino ................. ${Object.entries(largos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}→${v}d`).join(" · ")}`);
if (peor > 0.011) throw new Error(`FALLO CERRADO: el camino no cuadra con gex-niveles.json (${peor})`);
if (malBarras > 0) throw new Error(`FALLO CERRADO: ${malBarras} días con distinto número de barras`);

writeFileSync(SALIDA, JSON.stringify(out));
console.log(`\n   escrito ${SALIDA} · ${Object.keys(out).length} días\n`);
