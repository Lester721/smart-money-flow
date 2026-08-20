// ═══ GAMMA LADDER · PASO 5 — LA ESCALERA DE VERDAD, Y A QUÉ HORA ESTÁ ETIQUETADA ═══════
//
// El paso 4 cerró la vía del flujo: el feed histórico sólo devuelve contratos que seguían vivos
// el día de la descarga, 82 de 82 días, así que en el primer tercio del período NO HAY ni un
// contrato a menos de 90 días. La gamma vive justo ahí. Escalera imposible por esa ruta.
//
// EL PUENTE: MarketSnack publica SU PROPIA escalera resumida en /gex — call_wall, put_wall,
// magnet, max_pain, gamma_flip, net_gex y asset_price, un punto por día, 40 tickers, 19 días.
// Eso lo calcularon ELLOS con la cadena completa del momento: no tiene el sesgo de supervivencia.
//
// ─── LO PRIMERO, ANTES DE MEDIR NADA: ¿A QUÉ MOMENTO SE REFIERE CADA PUNTO? ────────────────
// El sello de tiempo es "2026-07-24T04:00:00.000Z" = medianoche de Nueva York. Un punto
// etiquetado con el día D puede ser la foto del CIERRE de D o la del cierre de D-1. Si es la de
// D y yo entro al cierre de D-1, he metido el futuro. Este proyecto ya selló un look-ahead
// exactamente así (una barra OHLC se etiqueta por su INICIO y su cierre es de después).
//
// Se resuelve con el dato que ellos mismos incluyen: `asset_price`. Se compara contra los cierres
// reales de chart-all —ruta distinta— y gana el que empareje. No se supone: se mide.
//
// USO: node --env-file=.env.local --import tsx --max-old-space-size=10240 \
//        scripts/marketsnack/ladder-5-real.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const BASE = path.join("scripts", "cache-theta", "marketsnack");
const GEXDIR = path.join(BASE, "aux", "gex", "2026-08-19");
const CHART = path.join(BASE, "aux", "chart-all");
const leer = (p) => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8"));

// ── series de cierre ─────────────────────────────────────────────────────────────────────
const cierre = new Map();
for (const f of fs.readdirSync(CHART)) {
  const T = f.slice(0, -8);
  const j = leer(path.join(CHART, f));
  const fechas = [], v = new Map(), idx = new Map();
  for (const p of j.data ?? []) { const d = p.t.slice(0, 10); if (v.has(d)) continue; idx.set(d, fechas.length); fechas.push(d); v.set(d, p.v); }
  cierre.set(T, { fechas, v, idx });
}

// ── carga de la escalera publicada ───────────────────────────────────────────────────────
const puntos = [];
const tickersGex = [];
for (const fich of fs.readdirSync(GEXDIR)) {
  const T = fich.replace(".json.gz", "");
  tickersGex.push(T);
  for (const p of leer(path.join(GEXDIR, fich))["1m"]?.data ?? []) puntos.push({ T, fecha: p.t.slice(0, 10), ...p });
}
const conPrecio = tickersGex.filter((T) => cierre.has(T));
console.log("tickers con escalera publicada: " + tickersGex.length);
console.log("de esos, con serie de precio (los indices NO la tienen): " + conPrecio.length);
console.log("  SIN precio, quedan fuera y no se sustituyen: " + tickersGex.filter((T) => !cierre.has(T)).join(" "));
console.log("puntos totales: " + puntos.length + "\n");

// ═══ A. ¿A QUÉ CIERRE CORRESPONDE `asset_price`? ═════════════════════════════════════════
console.log("═".repeat(104));
console.log("A. ETIQUETA DE TIEMPO — el asset_price del punto D, ¿es el cierre de D o el de D-1?");
console.log("═".repeat(104));

function errorContra(desfase) {
  let n = 0, suma = 0, exactos = 0;
  for (const p of puntos) {
    const s = cierre.get(p.T); if (!s || p.asset_price == null) continue;
    const i = s.idx.get(p.fecha); if (i == null) continue;
    const j = i + desfase; if (j < 0 || j >= s.fechas.length) continue;
    const c = s.v.get(s.fechas[j]); if (!(c > 0)) continue;
    const err = Math.abs(p.asset_price - c) / c;
    n++; suma += err; if (err < 0.0005) exactos++;
  }
  return { n, err: suma / n, exactos: exactos / n };
}
console.log("desfase           n     error medio    coincidencia exacta (<0,05%)");
for (const [nom, dz] of [["cierre de D-1", -1], ["cierre de D", 0], ["cierre de D+1", 1]]) {
  const r = errorContra(dz);
  console.log(nom.padEnd(18) + String(r.n).padStart(5) + (r.err * 100).toFixed(3).padStart(14) + "%" + (r.exactos * 100).toFixed(1).padStart(20) + "%");
}
const e0 = errorContra(0), em1 = errorContra(-1);
const esCierreDeD = e0.exactos > em1.exactos;
console.log("\nVEREDICTO: el punto etiquetado D lleva el " + (esCierreDeD ? "CIERRE DE D" : "CIERRE DE D-1") + ".");
if (esCierreDeD) {
  console.log("  -> la escalera del dia D SOLO se conoce al cierre de D. La entrada mas temprana");
  console.log("     posible es el cierre de D, y lo que se puede predecir es D -> D+n. Entrar antes");
  console.log("     seria mirar al futuro.");
} else {
  console.log("  -> la escalera del dia D ya se conoce al abrir D.");
}

// ═══ B. ¿ES UN REGISTRO DIARIO O UN RECÁLCULO RETROACTIVO? ══════════════════════════════
console.log("\n" + "═".repeat(104));
console.log("B. ¿SERIE VIVA O RECALCULADA HOY? — si la hubieran recalculado con la cadena de hoy,");
console.log("   los muros de hace un mes se parecerian a los de hoy y el asset_price no cuadraria.");
console.log("═".repeat(104));
const porT = new Map();
for (const p of puntos) { if (!porT.has(p.T)) porT.set(p.T, []); porT.get(p.T).push(p); }
let variaMuro = 0, totalT = 0, murosDistintos = [];
for (const [T, arr] of porT) {
  const cw = new Set(arr.map((x) => x.call_wall));
  totalT++; if (cw.size > 1) variaMuro++;
  murosDistintos.push({ T, dias: arr.length, callWallsDistintos: cw.size });
}
console.log("tickers cuyo call_wall CAMBIA a lo largo del mes: " + variaMuro + " de " + totalT);
console.log("media de valores distintos de call_wall por ticker: " + (murosDistintos.reduce((a, x) => a + x.callWallsDistintos, 0) / totalT).toFixed(1) + " sobre " + (puntos.length / totalT).toFixed(0) + " dias");
console.log("error medio del asset_price contra el cierre real: " + (Math.min(e0.err, em1.err) * 100).toFixed(3) + "%  (si fuera un recalculo de hoy, este numero seria enorme)");

// ═══ C. LA FOTO DEL PANEL ═══════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(104));
console.log("C. EL PANEL EN NUMEROS — la escalera real, no la reconstruida");
console.log("═".repeat(104));
const filas = [];
for (const p of puntos) {
  if (!cierre.has(p.T)) continue;
  const S = p.asset_price;
  if (!(S > 0) || p.call_wall == null || p.put_wall == null) continue;
  const ancho = (p.call_wall - p.put_wall) / S;
  filas.push({
    ticker: p.T, fecha: p.fecha, spot: S, netGex: p.net_gex,
    distMagnet: p.magnet != null ? (p.magnet - S) / S : null,
    distCallWall: (p.call_wall - S) / S,
    distPutWall: (p.put_wall - S) / S,
    distMaxPain: p.max_pain != null ? (p.max_pain - S) / S : null,
    distFlip: p.gamma_flip != null ? (p.gamma_flip - S) / S : null,
    anchoMuros: ancho,
    posEnBanda: ancho > 0 ? (S - p.put_wall) / (p.call_wall - p.put_wall) : null,
  });
}
console.log("filas utilizables: " + filas.length + "  ·  tickers " + new Set(filas.map((f) => f.ticker)).size + "  ·  dias " + new Set(filas.map((f) => f.fecha)).size);
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
console.log("\nmetrica            n      p10       p25       p50       p75       p90");
for (const m of ["distMagnet", "distCallWall", "distPutWall", "distMaxPain", "distFlip", "anchoMuros", "posEnBanda"]) {
  const v = filas.map((f) => f[m]).filter((x) => x != null && Number.isFinite(x));
  console.log(m.padEnd(16) + String(v.length).padStart(5) + [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => (q(v, p) * 100).toFixed(1).padStart(9) + "%").join(""));
}
const conFlip = filas.filter((f) => f.distFlip != null).length;
console.log("\ncon gamma_flip definido: " + conFlip + " de " + filas.length + " (" + (conFlip / filas.length * 100).toFixed(1) + "%) — cuando la gamma neta no cruza cero, no hay flip");
const gexPos = filas.filter((f) => f.netGex > 0).length;
console.log("dias-ticker con gamma neta POSITIVA: " + (gexPos / filas.length * 100).toFixed(1) + "%");
console.log("el magnet esta POR ENCIMA del precio en el " + (filas.filter((f) => f.distMagnet > 0).length / filas.filter((f) => f.distMagnet != null).length * 100).toFixed(1) + "% de los casos");

fs.writeFileSync(path.join("scripts", "marketsnack", "ladder-5-salida.json"), JSON.stringify({
  generado: new Date().toISOString(), esCierreDeD, errorD: e0, errorD1: em1,
  tickersConPrecio: conPrecio, filas,
}, null, 1));
console.log("\nguardado en scripts/marketsnack/ladder-5-salida.json");
