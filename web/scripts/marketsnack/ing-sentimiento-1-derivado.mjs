// INGREDIENTE · SENTIMIENTO — PASO 1: ¿es `sentiment` un campo NUEVO o sólo una función del
// lado y del tipo de opción?
//
// Antes de medir nada hay que saber si estamos midiendo información o una etiqueta que ya
// tenemos. Si `sentiment` = f(side, call/put), no es un ingrediente: es un renombrado del
// desequilibrio compra/venta, que YA se midió (scripts/marketsnack/medir-desequilibrio.mjs).
//
// Salida: tabla cruzada sentiment × (side, tipo) sobre los 86 días en disco, más el % de filas
// que la regla evidente explicaría. Y el inventario de lo que hay: símbolos, filas, huecos.
//
// Uso: node --env-file=.env.local --import tsx --max-old-space-size=10240 \
//        scripts/marketsnack/ing-sentimiento-1-derivado.mjs

import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const RAIZ = "C:/Users/leste/dev/agente-tito-metralleta/web";
const DIR = path.join(RAIZ, "scripts/cache-theta/marketsnack/flujo-100k");
const CHART = path.join(RAIZ, "scripts/cache-theta/marketsnack/aux/chart-all");

function parseOcc(symbol) {
  if (!symbol || symbol.length < 16) return null;
  const strikeRaw = symbol.slice(-8);
  const typeRaw = symbol.slice(-9, -8);
  const dateRaw = symbol.slice(-15, -9);
  const underlying = symbol.slice(0, -15);
  if (!/^\d{8}$/.test(strikeRaw) || !/^[CP]$/.test(typeRaw) || !/^\d{6}$/.test(dateRaw) || !underlying) return null;
  return { underlying, tipo: typeRaw, exp: `20${dateRaw.slice(0, 2)}-${dateRaw.slice(2, 4)}-${dateRaw.slice(4, 6)}`, strike: +strikeRaw / 1000 };
}

const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).sort();
console.log(`═══ PASO 1 · ¿ES "sentiment" UN CAMPO DERIVADO? ═══\n`);
console.log(`   ficheros-día: ${dias.length}   (${dias[0].slice(0, 10)} → ${dias[dias.length - 1].slice(0, 10)})\n`);

// ── recuentos ──────────────────────────────────────────────────────────────────────────────
const cruz = new Map();           // "side|tipo" -> Map(sentiment -> n)
const sentPorSide = new Map();    // side -> Map(sentiment -> n)
const sentCuenta = new Map();
const sideCuenta = new Map();
const simbolos = new Map();       // underlying -> {n, prima}
const porDia = new Map();
let filas = 0, sinOcc = 0, sinSent = 0, askCero = 0;
// para ver si el delta/sentiment se relacionan
const sentPorDelta = new Map();   // sentiment -> {neg, pos}

for (const f of dias) {
  const dia = f.slice(0, 10);
  const buf = zlib.gunzipSync(fs.readFileSync(path.join(DIR, f))).toString("utf8");
  let nDia = 0;
  for (const l of buf.split("\n")) {
    if (!l) continue;
    let t; try { t = JSON.parse(l); } catch { continue; }
    filas++; nDia++;
    const occ = parseOcc(t.symbol ?? "");
    if (!occ) { sinOcc++; continue; }
    const s = t.sentiment ?? "(nulo)";
    const lado = t.side ?? "(nulo)";
    if (s === "(nulo)") sinSent++;
    if (!(t.ask_price > 0) || (t.bid_price > t.ask_price)) askCero++;

    sentCuenta.set(s, (sentCuenta.get(s) ?? 0) + 1);
    sideCuenta.set(lado, (sideCuenta.get(lado) ?? 0) + 1);

    const k = `${lado}|${occ.tipo}`;
    let m = cruz.get(k); if (!m) { m = new Map(); cruz.set(k, m); }
    m.set(s, (m.get(s) ?? 0) + 1);

    let m2 = sentPorSide.get(lado); if (!m2) { m2 = new Map(); sentPorSide.set(lado, m2); }
    m2.set(s, (m2.get(s) ?? 0) + 1);

    let d = sentPorDelta.get(s); if (!d) { d = { neg: 0, pos: 0, nulo: 0 }; sentPorDelta.set(s, d); }
    if (t.delta == null) d.nulo++; else if (t.delta < 0) d.neg++; else d.pos++;

    let e = simbolos.get(occ.underlying);
    if (!e) { e = { n: 0, prima: 0, dias: new Set() }; simbolos.set(occ.underlying, e); }
    e.n++; e.prima += t.premium ?? 0; e.dias.add(dia);
  }
  porDia.set(dia, nDia);
}

console.log(`   filas totales: ${filas.toLocaleString("es-ES")}`);
console.log(`   sin OCC parseable: ${sinOcc}   ·   sentiment nulo: ${sinSent}   ·   ask≤0 o cruzada: ${askCero}\n`);

console.log(`── valores de "sentiment" ──`);
for (const [k, v] of [...sentCuenta].sort((a, b) => b[1] - a[1]))
  console.log(`   ${k.padEnd(12)} ${String(v).padStart(9)}  ${((v / filas) * 100).toFixed(2)}%`);

console.log(`\n── valores de "side" ──`);
for (const [k, v] of [...sideCuenta].sort((a, b) => b[1] - a[1]))
  console.log(`   ${k.padEnd(12)} ${String(v).padStart(9)}  ${((v / filas) * 100).toFixed(2)}%`);

console.log(`\n── TABLA CRUZADA  (side , tipo)  ×  sentiment ──`);
const sents = [...sentCuenta.keys()].sort();
console.log(`   ${"side|tipo".padEnd(20)} ${sents.map((s) => s.padStart(10)).join("")}   total    ¿determinista?`);
let explicadas = 0, totalCruz = 0;
for (const [k, m] of [...cruz].sort((a, b) => {
  const sa = [...a[1].values()].reduce((x, y) => x + y, 0), sb = [...b[1].values()].reduce((x, y) => x + y, 0);
  return sb - sa;
})) {
  const tot = [...m.values()].reduce((x, y) => x + y, 0);
  const may = Math.max(...m.values());
  explicadas += may; totalCruz += tot;
  console.log(`   ${k.padEnd(20)} ${sents.map((s) => String(m.get(s) ?? 0).padStart(10)).join("")} ${String(tot).padStart(9)}   ${((may / tot) * 100).toFixed(2)}% en la moda`);
}
console.log(`\n   >>> la regla "(side, tipo) → sentiment" acierta el ${((explicadas / totalCruz) * 100).toFixed(3)}% de las ${totalCruz.toLocaleString("es-ES")} filas`);

console.log(`\n── sentiment vs signo de delta ──`);
for (const [s, d] of sentPorDelta) console.log(`   ${s.padEnd(12)} delta<0: ${String(d.neg).padStart(9)}  delta≥0: ${String(d.pos).padStart(9)}  nulo: ${d.nulo}`);

// ── inventario de símbolos con precio ──────────────────────────────────────────────────────
const conPrecio = new Set(fs.readdirSync(CHART).map((f) => f.replace(".json.gz", "")));
const orden = [...simbolos].sort((a, b) => b[1].prima - a[1].prima);
console.log(`\n── símbolos en el flujo: ${simbolos.size}  ·  con serie de precio en disco: ${conPrecio.size} ──`);
console.log(`   top 25 por prima total:`);
let primaTot = 0; for (const [, e] of orden) primaTot += e.prima;
for (const [s, e] of orden.slice(0, 25))
  console.log(`   ${s.padEnd(8)} n=${String(e.n).padStart(7)}  días=${String(e.dias.size).padStart(3)}  prima=$${(e.prima / 1e9).toFixed(2)}B  ${((e.prima / primaTot) * 100).toFixed(1)}%  ${conPrecio.has(s) ? "precio ✓" : "SIN PRECIO ✗"}`);

const sinPrecioN = orden.filter(([s]) => !conPrecio.has(s)).reduce((a, [, e]) => a + e.n, 0);
console.log(`\n   filas de símbolos SIN serie de precio: ${sinPrecioN.toLocaleString("es-ES")} (${((sinPrecioN / filas) * 100).toFixed(1)}%)`);

fs.writeFileSync(path.join(RAIZ, "scripts/marketsnack/ing-sentimiento-1-salida.json"), JSON.stringify({
  filas, sinOcc, sinSent, askCero,
  sentCuenta: [...sentCuenta], sideCuenta: [...sideCuenta],
  cruz: [...cruz].map(([k, m]) => [k, [...m]]),
  deterministaPct: (explicadas / totalCruz) * 100,
  simbolos: orden.map(([s, e]) => [s, e.n, e.prima, e.dias.size, conPrecio.has(s)]),
  porDia: [...porDia],
}, null, 1));
console.log(`\n   escrito ing-sentimiento-1-salida.json`);
