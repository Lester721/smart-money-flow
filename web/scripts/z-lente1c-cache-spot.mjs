// ══════════════════════════════════════════════════════════════════════════════════════════════
// LENTE 1-C — ¿EL CACHE DE PRECIOS ES EL BUENO?
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// EN CRISTIANO
// El script y3 guarda la serie de precios en scripts/cache-theta/_y3-spots.json y la vuelve a usar
// tal cual si el fichero existe. Solo comprueba que estan todos los tickers — NO comprueba que el
// contenido lo haya escrito la version buena del codigo. Si ese fichero lo genero una version
// anterior (la que miraba la paridad en TODOS los vencimientos a la vez, el fallo que inflaba el
// precio), el arreglo nunca habria entrado en vigor y nadie se enteraria.
//
// Aqui se recalcula el precio desde cero, dia a dia, con la version CORREGIDA (vencimiento mas
// cercano) sobre una muestra grande, y se compara contra el cache. Ademas se calcula lo que daria
// la version MALA, para ver si el cache se parece a una o a la otra.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/z-lente1c-cache-spot.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync, readdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CACHE_SPOT = "scripts/cache-theta/_y3-spots.json";
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const num = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

// la version CORREGIDA: solo el vencimiento mas cercano
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
  if (!exp) return null;
  const g = c[exp];
  let K = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[`${k}|P`]; if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
  return s > 0 ? s : null;
}

// la version MALA: mira TODA la cadena a la vez (el fallo conocido)
function spotMal(c, hoy) {
  let mejor = null, dm = Infinity;
  for (const e of Object.keys(c)) {
    if (dteDe(hoy, e) < 1) continue;
    const g = c[e];
    for (const [cl, ba] of Object.entries(g)) {
      if (cl.slice(-1) !== "C") continue;
      const k = Number(cl.slice(0, -2)); const p = g[`${k}|P`]; if (!p) continue;
      const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
      if (d < dm) { dm = d; mejor = { g, k }; }
    }
  }
  if (!mejor) return null;
  const C = mejor.g[`${mejor.k}|C`], P = mejor.g[`${mejor.k}|P`];
  const s = mejor.k + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
  return s > 0 ? s : null;
}

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort().filter((t) => diasPorSim.get(t).length >= 400);
const SPOT = JSON.parse(readFileSync(CACHE_SPOT, "utf8"));

console.log(`\n${"═".repeat(100)}`);
console.log("  LENTE 1-C — ¿el cache de precios lo escribio la version corregida?");
console.log(`${"═".repeat(100)}`);

let n = 0, igualOk = 0, igualMal = 0, distinto = 0;
const difOk = [], difMal = [];
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  // una muestra de 1 de cada 25 dias, repartida por toda la historia
  for (let i = 0; i < dias.length; i += 25) {
    let c = null;
    try { c = JSON.parse(readFileSync(`${CDIR}/${sym}_d${dias[i]}.json`, "utf8")); } catch { continue; }
    const cache = SPOT[sym][i];
    if (!(cache > 0)) continue;
    const ok = spotOk(c, dias[i]), mal = spotMal(c, dias[i]);
    if (!(ok > 0) || !(mal > 0)) continue;
    n++;
    const dO = Math.abs(cache / ok - 1), dM = Math.abs(cache / mal - 1);
    difOk.push(dO); difMal.push(dM);
    if (dO < 1e-9) igualOk++;
    if (dM < 1e-9) igualMal++;
    if (dO >= 1e-9 && dM >= 1e-9) distinto++;
  }
}
difOk.sort((a, b) => a - b); difMal.sort((a, b) => a - b);
console.log(`  ${num(n)} dias comprobados (1 de cada 25, todos los tickers y todo el periodo)`);
console.log(`  el cache coincide EXACTAMENTE con la version CORREGIDA en : ${num(igualOk)} (${(100 * igualOk / n).toFixed(1)}%)`);
console.log(`  el cache coincide EXACTAMENTE con la version MALA en      : ${num(igualMal)} (${(100 * igualMal / n).toFixed(1)}%)`);
console.log(`  no coincide con ninguna de las dos                        : ${num(distinto)}`);
console.log(`  diferencia mediana cache vs corregida : ${(100 * difOk[difOk.length >> 1]).toFixed(4)}%`);
console.log(`  diferencia mediana cache vs mala      : ${(100 * difMal[difMal.length >> 1]).toFixed(4)}%`);
console.log(`  peor 1% cache vs corregida            : ${(100 * difOk[Math.floor(difOk.length * 0.99)]).toFixed(4)}%`);
console.log(`\n${"═".repeat(100)}\n`);
