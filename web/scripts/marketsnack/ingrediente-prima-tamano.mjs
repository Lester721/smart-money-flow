// ═══ INGREDIENTE «PRIMA Y TAMAÑO» DE MARKETSNACK ═══════════════════════════════════════════
//
// El SCORE compuesto de MarketSnack ya está medido y muerto (4 meses, 3.321 eventos, t=0,62,
// las dos mitades del período se contradicen). Lo que nunca se midió son sus INGREDIENTES por
// separado. Esto mide el de PRIMA Y TAMAÑO, y además la CONCENTRACIÓN: si el flujo de un día
// lo mueven trescientas operaciones o tres muy grandes.
//
// ╔═══ CÓMO SE EVITA MIRAR AL FUTURO ═══╗
//   · La métrica se construye SÓLO con operaciones entre 13:30 y 19:00 UTC (9:30–15:00 ET).
//     Ventana fija todos los días: la composición del flujo depende muchísimo de la hora, y
//     medir un trozo variable de sesión muestrea una población distinta cada día.
//   · La ENTRADA es el CIERRE del día D (20:00 UTC), una hora DESPUÉS del corte.
//   · El umbral de "operación gigante" (percentil 99 de prima) sale de un histograma que SÓLO
//     contiene días ANTERIORES a D. El día D se suma al histograma después de usarlo.
//   · La "inusualidad" es contra la mediana móvil de los 20 días ANTERIORES de ese ticker.
//   · El orden transversal es dentro del día y con datos del propio corte: observable a las 15:00.
//
// ╔═══ QUÉ SE COMPRUEBA ANTES DE MEDIR ═══╗
//   · que el `v` del chart es el CIERRE (contrastado contra el último asset_price del día)
//   · radiografia() sobre las filas — caza campos muertos
//   · salud de premium/size a los dos lados de la ruptura del 2026-07-16
//
// Uso: node --env-file=.env.local --import tsx --max-old-space-size=10240 \
//        scripts/marketsnack/ingrediente-prima-tamano.mjs

import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { radiografia } from "../../lib/radiografia.ts";
import { pasarBarrera, listonT, potencia } from "../../lib/barreraHallazgos.ts";

const DIR_FLUJO = path.resolve("scripts/cache-theta/marketsnack/flujo-100k");
const DIR_CHART = path.resolve("scripts/cache-theta/marketsnack/aux/chart-all");
const SALIDA = path.resolve("scripts/marketsnack/ingrediente-prima-tamano.json");

const CORTE_MS = 19 * 3600e3; // 15:00 ET — última operación que entra en la métrica
const APERTURA_MS = 13.5 * 3600e3; // 9:30 ET
const HORIZONTES = [1, 5, 20];
const MIN_OPS = 10; // un símbolo-día con 3 operaciones no tiene ni mediana ni concentración
const DIAS_CALENTAMIENTO = 5; // el umbral de gigante necesita días anteriores
const VENTANA_INUSUAL = 20; // mediana móvil para la inusualidad
const MIN_PREVIOS = 10; // filas anteriores mínimas de ese ticker para la inusualidad

const mediana = (v) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const media = (v) => v.reduce((a, x) => a + x, 0) / v.length;

/**
 * t DEL DÍA, no del símbolo-día. Dos correcciones que la t de Welch sobre filas sueltas no hace:
 *   1. Las ~110 filas de un mismo día NO son 110 datos: comparten el movimiento del mercado de
 *      ese día. El dato independiente es la SEPARACIÓN transversal del día.
 *   2. A 20 días, las ventanas de días consecutivos se solapan 19/20. Newey-West con retardo h
 *      descuenta esa autocorrelación. Sin esto la t sale inflada varias veces.
 */
function tPorDia(spreads, h) {
  const D = spreads.length;
  if (D < 8) return { t: null, D, media: null };
  const m = media(spreads);
  const e = spreads.map((s) => s - m);
  const g = (k) => { let a = 0; for (let d = k; d < D; d++) a += e[d] * e[d - k]; return a / D; };
  let v = g(0);
  for (let k = 1; k <= h; k++) v += 2 * (1 - k / (h + 1)) * g(k);
  if (!(v > 0)) return { t: null, D, media: m };
  return { t: m / Math.sqrt(v / D), D, media: m };
}

// ── 0. series de precio (el único histórico largo de toda la API) ─────────────────────────
// El último punto de la serie es de HOY: se bajó con la sesión abierta o recién cerrada, así que
// puede no ser un cierre. No se usa como precio de salida de nada.
const HOY = new Date().toISOString().slice(0, 10);
const tickers = fs.readdirSync(DIR_CHART).map((f) => f.replace(".json.gz", ""));
const PRECIO = new Map();
for (const t of tickers) {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR_CHART, t + ".json.gz"))).toString("utf8"));
  let serie = j.data.map((p) => ({ f: p.t.slice(0, 10), v: p.v })).filter((p) => p.v > 0);
  if (serie.length && serie[serie.length - 1].f >= HOY) serie = serie.slice(0, -1);
  if (serie.length < 60) continue;
  PRECIO.set(t, { serie, idx: new Map(serie.map((p, i) => [p.f, i])) });
}
console.log(`series de precio: ${PRECIO.size} tickers · ${[...PRECIO.values()][0].serie.length} barras` +
  ` (último punto ${HOY} descartado: puede no ser un cierre)`);

// ── 1. histograma de prima para el percentil 99 de DÍAS ANTERIORES ────────────────────────
// 1.200 celdas de 0,005 dex entre 10^4 y 10^10. Exacto de sobra para un p99 y O(1) por día.
const CELDA = 0.005, BASE = 4, NCEL = 1200;
const hist = new Int32Array(NCEL);
let histN = 0;
const celda = (p) => Math.max(0, Math.min(NCEL - 1, Math.floor((Math.log10(p) - BASE) / CELDA)));
function p99Previo() {
  if (histN === 0) return null;
  const objetivo = histN * 0.99;
  let acc = 0;
  for (let i = 0; i < NCEL; i++) { acc += hist[i]; if (acc >= objetivo) return 10 ** (BASE + (i + 1) * CELDA); }
  return 10 ** (BASE + NCEL * CELDA);
}

// ── 2. recorrer los días EN ORDEN y agregar por (ticker, día) ─────────────────────────────
const ficheros = fs.readdirSync(DIR_FLUJO).filter((f) => f.endsWith(".jsonl.gz")).sort();
const filas = [];
let totalLeidas = 0, fueraVentana = 0, malaCot = 0, sinOcc = 0, sinPrecio = 0;
const salud = {
  antes: { n: 0, primaNula: 0, sizeNulo: 0, apNulo: 0 },
  desde: { n: 0, primaNula: 0, sizeNulo: 0, apNulo: 0 },
};

for (let d = 0; d < ficheros.length; d++) {
  const fecha = ficheros[d].slice(0, 10);
  const t0 = Date.parse(fecha + "T00:00:00Z");
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR_FLUJO, ficheros[d]))).toString("utf8");
  const umbralGigante = p99Previo(); // ← SÓLO días anteriores
  const porTicker = new Map();
  const primasDelDia = [];

  for (const linea of txt.split("\n")) {
    if (!linea) continue;
    totalLeidas++;
    const r = JSON.parse(linea);
    const lado = salud[fecha < "2026-07-16" ? "antes" : "desde"];
    lado.n++;
    if (!(r.premium > 0)) lado.primaNula++;
    if (!(r.size > 0)) lado.sizeNulo++;
    if (r.asset_price == null) lado.apNulo++;

    const s = r.symbol || "";
    const raiz = s.slice(0, -15), tipo = s.slice(-9, -8);
    if (!/^\d{8}$/.test(s.slice(-8)) || !/^[CP]$/.test(tipo) || !/^\d{6}$/.test(s.slice(-15, -9)) || !raiz) { sinOcc++; continue; }
    // hay filas con cotización cero o cruzada — fuera de cualquier medición
    if (!(r.ask_price > 0) || !(r.bid_price > 0) || r.bid_price > r.ask_price) { malaCot++; continue; }
    const off = Date.parse(r.timestamp) - t0;
    if (off < APERTURA_MS || off > CORTE_MS) { fueraVentana++; continue; }
    primasDelDia.push(r.premium);
    if (!PRECIO.has(raiz)) { sinPrecio++; continue; } // SPX, SPXW, NDX… no tienen precio en esta API
    let a = porTicker.get(raiz);
    if (!a) { a = { primas: [], tam: [], primaCall: 0, primaPut: 0, primaGigante: 0 }; porTicker.set(raiz, a); }
    a.primas.push(r.premium);
    a.tam.push(r.size);
    if (tipo === "C") a.primaCall += r.premium; else a.primaPut += r.premium;
    if (umbralGigante != null && r.premium >= umbralGigante) a.primaGigante += r.premium;
  }

  // el día se suma al histograma DESPUÉS de haberlo usado
  for (const p of primasDelDia) { hist[celda(p)]++; histN++; }
  if (d < DIAS_CALENTAMIENTO) continue;

  for (const [tk, a] of porTicker) {
    if (a.primas.length < MIN_OPS) continue;
    const total = a.primas.reduce((x, y) => x + y, 0);
    const top3 = [...a.primas].sort((x, y) => y - x).slice(0, 3).reduce((x, y) => x + y, 0);
    filas.push({
      ticker: tk,
      fecha,
      nOps: a.primas.length,
      primaTotal: total,
      primaMediana: mediana(a.primas),
      tamMediano: mediana(a.tam),
      gigShare: a.primaGigante / total,
      callPut: Math.log((a.primaCall + 1) / (a.primaPut + 1)),
      top3Share: top3 / total,
    });
  }
  if (d % 20 === 0) console.log(`  ${fecha} · filas acumuladas ${filas.length} · umbral gigante ${umbralGigante ? "$" + Math.round(umbralGigante).toLocaleString() : "—"}`);
}

const pc = (a, b) => ((a / b) * 100).toFixed(1) + "%";
console.log(`\nleídas ${totalLeidas.toLocaleString()} operaciones · fuera de ventana ${fueraVentana.toLocaleString()}` +
  ` · cotización mala ${malaCot} · sin OCC ${sinOcc} · sin serie de precio ${sinPrecio.toLocaleString()}`);
console.log(`ruptura 2026-07-16 — ANTES n=${salud.antes.n} prima nula ${pc(salud.antes.primaNula, salud.antes.n)}` +
  ` size nulo ${pc(salud.antes.sizeNulo, salud.antes.n)} asset_price nulo ${pc(salud.antes.apNulo, salud.antes.n)}`);
console.log(`ruptura 2026-07-16 — DESDE n=${salud.desde.n} prima nula ${pc(salud.desde.primaNula, salud.desde.n)}` +
  ` size nulo ${pc(salud.desde.sizeNulo, salud.desde.n)} asset_price nulo ${pc(salud.desde.apNulo, salud.desde.n)}`);
console.log(`símbolo-día con ≥${MIN_OPS} operaciones: ${filas.length}`);

// ── 3. retornos futuros desde el CIERRE del día D ─────────────────────────────────────────
for (const f of filas) {
  const p = PRECIO.get(f.ticker);
  const i = p.idx.get(f.fecha);
  if (i == null) { f.malo = true; continue; }
  f.entrada = p.serie[i].v;
  for (const h of HORIZONTES) {
    const j = i + h;
    f["r" + h] = j < p.serie.length ? p.serie[j].v / p.serie[i].v - 1 : null;
  }
}
const conRetorno = filas.filter((f) => !f.malo);
console.log(`con precio de entrada: ${conRetorno.length}`);

// ── 4. inusualidad: la métrica contra la mediana de los 20 días ANTERIORES del ticker ─────
const porTk = new Map();
for (const f of conRetorno) { if (!porTk.has(f.ticker)) porTk.set(f.ticker, []); porTk.get(f.ticker).push(f); }
const NIVEL = ["primaTotal", "primaMediana", "tamMediano", "nOps"];
const RATIO = ["gigShare", "callPut", "top3Share"];
for (const [, arr] of porTk) {
  arr.sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (let i = 0; i < arr.length; i++) {
    if (i < MIN_PREVIOS) { arr[i].sinHistoria = true; continue; }
    const prev = arr.slice(Math.max(0, i - VENTANA_INUSUAL), i);
    for (const m of NIVEL) arr[i]["u_" + m] = Math.log(arr[i][m] / mediana(prev.map((x) => x[m])));
    for (const m of RATIO) arr[i]["u_" + m] = arr[i][m] - mediana(prev.map((x) => x[m]));
  }
}

// ── 5. radiografía ANTES de medir ─────────────────────────────────────────────────────────
const base = conRetorno.filter((f) => !f.sinHistoria && f.r1 != null);
radiografia(
  base,
  [...NIVEL, ...RATIO, ...NIVEL.map((m) => "u_" + m), ...RATIO.map((m) => "u_" + m), "r1", "entrada"],
  "prima-tamaño por símbolo-día",
  { minDistintos: 20, cerosLegitimos: ["gigShare", "u_gigShare", "u_callPut", "u_top3Share"] },
);

// ── 6. orden TRANSVERSAL dentro de cada día ───────────────────────────────────────────────
// El rango dentro del día cancela el movimiento del mercado: no hace falta control de índice.
function rangoDentroDelDia(arr, campo) {
  const dias = new Map();
  for (const f of arr) { if (!dias.has(f.fecha)) dias.set(f.fecha, []); dias.get(f.fecha).push(f); }
  for (const [, g] of dias) {
    const val = g.filter((f) => Number.isFinite(f[campo]));
    val.sort((a, b) => a[campo] - b[campo]);
    for (let i = 0; i < val.length; i++) val[i]["rk_" + campo] = val.length > 1 ? i / (val.length - 1) : 0.5;
  }
}

const METRICAS = [...NIVEL, ...RATIO, ...NIVEL.map((m) => "u_" + m), ...RATIO.map((m) => "u_" + m)];
const PRUEBAS = METRICAS.length * HORIZONTES.length;
const LISTON = listonT(PRUEBAS);
console.log(`\n${METRICAS.length} métricas × ${HORIZONTES.length} horizontes = ${PRUEBAS} pruebas · listón |t| ≥ ${LISTON}\n`);

const resultados = [];
for (const h of HORIZONTES) {
  const muestra = conRetorno.filter((f) => !f.sinHistoria && f["r" + h] != null);
  for (const m of METRICAS) rangoDentroDelDia(muestra, m);
  for (const m of METRICAS) {
    const usable = muestra.filter((f) => Number.isFinite(f["rk_" + m]));
    const barra = usable.map((f) => ({ pnl: f["r" + h], ticker: f.ticker, fecha: f.fecha, rk: f["rk_" + m] }));
    const v = pasarBarrera(barra, (f) => f.rk, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
    const ord = [...barra].sort((a, b) => b.rk - a.rk);
    const k = Math.floor(ord.length / 3);
    const alto = ord.slice(0, k).map((x) => x.pnl), bajo = ord.slice(-k).map((x) => x.pnl);
    const pot = potencia(barra, 0.002);

    // separación DENTRO de cada día → una observación por día → t de Newey-West
    const porDia = new Map();
    for (const f of usable) { if (!porDia.has(f.fecha)) porDia.set(f.fecha, []); porDia.get(f.fecha).push(f); }
    const fechasOrd = [...porDia.keys()].sort();
    const spreads = [];
    for (const fe of fechasOrd) {
      const g = [...porDia.get(fe)].sort((a, b) => b["rk_" + m] - a["rk_" + m]);
      const kk = Math.floor(g.length / 3);
      if (kk < 3) continue;
      spreads.push(media(g.slice(0, kk).map((x) => x["r" + h])) - media(g.slice(-kk).map((x) => x["r" + h])));
    }
    const nw = tPorDia(spreads, h);

    resultados.push({
      metrica: m, h, n: barra.length, dias: nw.D, sep: v.detalle.sep, t: v.detalle.t, tDia: nw.t,
      sepDia: nw.media, pasa: v.pasa, motivos: v.motivos, tercios: v.detalle.tercios,
      mediaAlto: media(alto), mediaBajo: media(bajo), detectable: pot.detectable, concluyente: pot.concluyente,
    });
    console.log(`${v.pasa ? "✔" : " "} ${m.padEnd(16)} h=${String(h).padStart(2)} n=${String(barra.length).padStart(5)}` +
      ` · alto ${(media(alto) * 100).toFixed(3).padStart(7)}% · bajo ${(media(bajo) * 100).toFixed(3).padStart(7)}%` +
      ` · sep ${(v.detalle.sep * 100).toFixed(3).padStart(7)}% · t(fila) ${(v.detalle.t ?? 0).toFixed(2).padStart(6)}` +
      ` · t(día,NW) ${(nw.t ?? 0).toFixed(2).padStart(6)} sobre ${String(nw.D).padStart(3)} días` +
      ` · tercios ${v.detalle.tercios.map((x) => (x.sep >= 0 ? "+" : "−")).join("")}` +
      ` · detectable ${(pot.detectable * 100).toFixed(3)}%`);
  }
  console.log("");
}

fs.writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString(),
  ventana: "13:30–19:00 UTC (9:30–15:00 ET); entrada al cierre 20:00 UTC",
  dias: ficheros.length, filasSimboloDia: conRetorno.length, pruebas: PRUEBAS, liston: LISTON,
  salud, resultados,
}, null, 1));
console.log(`→ ${SALIDA}`);
