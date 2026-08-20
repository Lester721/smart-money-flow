// ═══ GAMMA LADDER · PASO 7 — RETIRADO. LA CONCLUSIÓN ERA MÍA Y ERA FALSA ═══════════════
//
// ⛔ ESTE PASO ESTÁ RETIRADO. Lo que decía: que el cierre de MRNA del 2026-08-19 (174,38 viniendo
// de 62,96) era un valor CORRUPTO de MarketSnack, y que por tanto `chart-all` estaba sucio.
//
// POR QUÉ ERA FALSO: lo "verifiqué" contra una barra del bróker marcada `interpolated:true` con
// volumen 0. Eso es RELLENO DE HUECO, no un cierre — la propia guía de la herramienta lo dice, y
// dice también que el precio de la última barra NO es el cierre liquidado. Al pedirlo por la ruta
// correcta (`get_equity_quotes`), el cierre oficial del 2026-08-19 es 174,38: EXACTO al de
// MarketSnack. El +177% es un movimiento REAL de MRNA.
//
// LA CLASE DE FALLO, para que no se repita: usé como patrón de verificación un campo que la
// propia fuente marca como "no lleva información". Un dato de relleno no refuta nada. Antes de
// declarar corrupta una fuente hay que comprobar que el patrón contra el que se compara es un
// dato de verdad — y aquí venía ETIQUETADO de que no lo era.
//
// El script se deja porque el censo de saltos sigue siendo útil (110 saltos >30% en 434 series,
// de los cuales WOLF +1726% está TAMBIÉN en el bróker: son splits y movimientos reales, no basura).
// Lo que NO vale es su conclusión de que la serie está corrupta. No lo está.
//
// USO: node --env-file=.env.local --import tsx --max-old-space-size=10240 \
//        scripts/marketsnack/ladder-7-precios-sucios.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const BASE = path.join("scripts", "cache-theta", "marketsnack");
const CHART = path.join(BASE, "aux", "chart-all");
const leer = (p) => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8"));

const series = new Map();
for (const f of fs.readdirSync(CHART)) {
  const j = leer(path.join(CHART, f));
  const pts = [];
  const vistos = new Set();
  for (const p of j.data ?? []) { const d = p.t.slice(0, 10); if (vistos.has(d)) continue; vistos.add(d); pts.push({ d, v: p.v }); }
  series.set(f.slice(0, -8), pts);
}
console.log("series de precio: " + series.size + " tickers\n");

// ── 1. saltos grandes ────────────────────────────────────────────────────────────────────
const saltos = [];
for (const [T, pts] of series) {
  for (let i = 1; i < pts.length; i++) {
    const r = pts[i].v / pts[i - 1].v - 1;
    if (Math.abs(r) > 0.30) saltos.push({ T, de: pts[i - 1].d, a: pts[i].d, v0: pts[i - 1].v, v1: pts[i].v, r });
  }
}
console.log("═".repeat(96));
console.log("1. SALTOS DE UN DIA MAYORES DEL 30%  —  " + saltos.length + " en " + series.size + " series de 252 barras");
console.log("═".repeat(96));

// un salto que se DESHACE al dia siguiente es un pico corrupto; uno que se queda es un split o
// un movimiento real. Se separan por ahi.
let picos = 0, permanentes = 0;
const detalle = [];
for (const s of saltos) {
  const pts = series.get(s.T);
  const i = pts.findIndex((p) => p.d === s.a);
  const siguiente = i + 1 < pts.length ? pts[i + 1].v / pts[i].v - 1 : null;
  const vuelve = siguiente != null && Math.sign(siguiente) !== Math.sign(s.r) && Math.abs(siguiente) > Math.abs(s.r) * 0.5;
  if (vuelve) picos++; else permanentes++;
  detalle.push({ ...s, siguiente, tipo: vuelve ? "PICO que se deshace" : "permanente (split o mov. real)" });
}
console.log("  de ida y vuelta (valor corrupto de un solo dia): " + picos);
console.log("  permanentes (split o movimiento real):           " + permanentes);
console.log("\n  los 25 mayores:");
console.log("  ticker   de           a              valor -> valor          salto     dia siguiente   tipo");
for (const s of detalle.sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 25)) {
  console.log("  " + s.T.padEnd(8) + s.de + "   " + s.a + "   " + String(s.v0).padStart(9) + " ->" + String(s.v1).padStart(9) +
    (s.r * 100).toFixed(1).padStart(10) + "%" + (s.siguiente != null ? (s.siguiente * 100).toFixed(1).padStart(14) + "%" : "".padStart(15)) + "   " + s.tipo);
}

// ── 2. el ultimo dia, que es el que mas duele ────────────────────────────────────────────
console.log("\n" + "═".repeat(96));
console.log("2. EL ULTIMO DIA DE LA SERIE (2026-08-19) — el dia de la descarga, con la sesion a medias");
console.log("═".repeat(96));
let ultRaros = 0;
const listaUlt = [];
for (const [T, pts] of series) {
  if (pts.length < 3) continue;
  const u = pts[pts.length - 1], p = pts[pts.length - 2];
  if (u.d !== "2026-08-19") continue;
  const r = u.v / p.v - 1;
  if (Math.abs(r) > 0.15) { ultRaros++; listaUlt.push({ T, r, v0: p.v, v1: u.v }); }
}
console.log("tickers con movimiento >15% EN EL ULTIMO DIA: " + ultRaros);
for (const x of listaUlt.sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 15)) {
  console.log("  " + x.T.padEnd(8) + String(x.v0).padStart(10) + " ->" + String(x.v1).padStart(10) + (x.r * 100).toFixed(1).padStart(10) + "%");
}

// ── 3. huecos y ceros ────────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(96));
console.log("3. CEROS, NULOS Y LONGITUDES");
console.log("═".repeat(96));
let ceros = 0, nulos = 0, cortas = 0;
const largos = new Map();
for (const [T, pts] of series) {
  largos.set(pts.length, (largos.get(pts.length) ?? 0) + 1);
  if (pts.length < 200) cortas++;
  for (const p of pts) { if (p.v == null) nulos++; else if (p.v === 0) ceros++; }
}
console.log("valores nulos: " + nulos + " · valores cero: " + ceros + " · series con menos de 200 barras: " + cortas);
console.log("longitudes mas comunes: " + [...largos].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([l, n]) => l + " barras x" + n).join(" · "));

// ── 4. la regla de limpieza ──────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(96));
console.log("4. LA REGLA — que hay que hacer con esto en TODA medicion que use chart-all");
console.log("═".repeat(96));
console.log("  a) tirar el ULTIMO dia de la serie: es el dia de la descarga, con la sesion sin cerrar.");
console.log("  b) marcar como sospechoso todo salto >30% que se deshaga al dia siguiente y NO usar");
console.log("     ni ese retorno ni el anterior.");
console.log("  c) los saltos permanentes se comprueban UNO A UNO contra el broker antes de decidir");
console.log("     si son split (y entonces la serie ya viene ajustada o no) o movimiento real.");
console.log("  Sin (a) y (b), un solo cierre inventado mete un +177% en un tercio del periodo.");

fs.writeFileSync(path.join("scripts", "marketsnack", "ladder-7-salida.json"), JSON.stringify({
  generado: new Date().toISOString(), tickers: series.size,
  saltos30: saltos.length, picosQueSeDeshacen: picos, permanentes,
  ultimoDiaRaros: listaUlt, detalle: detalle.slice(0, 60),
}, null, 1));
console.log("\nguardado en scripts/marketsnack/ladder-7-salida.json");
