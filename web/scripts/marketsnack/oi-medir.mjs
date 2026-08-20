// ═══ INGREDIENTE · INTERÉS ABIERTO ══════════════════════════════════════════════════════
//
// La idea: en cada operación del flow_feed viene el `open_interest` DEL CONTRATO y el `size`
// DE LA OPERACIÓN. Si size > OI, esa operación NO PUEDE ser un cierre: no se puede cerrar más
// de lo que hay abierto. Es POSICIÓN NUEVA, con seguridad aritmética. Con eso se construye la
// fracción de prima del día que abre posición nueva, por símbolo.
//
// Este proyecto ya midió el OI de otra fuente y estaba TRUNCADO a ±25% del dinero (570 de 573
// valores eran CERO). Aquí el OI viene POR OPERACIÓN y validado en oi-validar.mjs:
//   · 0,2-0,6% de nulos, 2,7-3,5% de ceros — el campo está VIVO
//   · constante dentro del día (0 de ~9.000 contratos cambian) → es una foto diaria
//   · corr(|ΔOI|, volumen del día D) = 0,861 contra 0,291 con el del día D+1
//     → el OI mostrado el día D es el CIERRE DE D-1. NO mira al futuro.
//
// ─── CÓMO SE MIDE, sin futuro ───────────────────────────────────────────────────────────
//   · se observa a las 12:00 ET (16:00Z) — sólo operaciones ANTERIORES a esa hora
//   · se entra al CIERRE de ese mismo día D (posterior al corte: legítimo)
//   · se predice el retorno del subyacente cierre(D) → cierre(D+1 / D+5 / D+20)
//   · se ordena TRANSVERSALMENTE dentro de cada día → el mercado se cancela solo
//   · nada se normaliza con datos de días posteriores: el rango transversal es del propio día
//
// ─── LO QUE NO SE PUEDE MEDIR Y SE DICE ─────────────────────────────────────────────────
//   SPX, SPXW, NDX, RUT y VIX son el grueso del flujo caro y MarketSnack NO SIRVE su precio
//   (/assets/SPX/chart devuelve {"data":[]}). Quedan FUERA del universo. No se sustituyen.
//
// USO: node --env-file=.env.local --import tsx --max-old-space-size=10240 \
//        scripts/marketsnack/oi-medir.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { radiografia } from "../../lib/radiografia.ts";
import { pasarBarrera, informe, listonT, comprobarDescarte, potencia } from "../../lib/barreraHallazgos.ts";

const DIR = path.join("scripts", "cache-theta", "marketsnack", "flujo-100k");
const CHART = path.join("scripts", "cache-theta", "marketsnack", "aux", "chart-all");
const CORTE = "T16:00:00";     // 12:00 ET — hora de observación, fija todo el período
const RUPTURA = "2026-07-16";
const MIN_OPS = 15;            // operaciones antes del corte para que la fracción signifique algo
const MIN_PRIMA = 1_000_000;   // $ de prima antes del corte
const HORIZONTES = [1, 5, 20];
const METRICAS = ["fracNuevaPrima", "fracNuevaNeta", "fracNuevaOps", "intensidadOI"];
const PRUEBAS = METRICAS.length * HORIZONTES.length;   // 12 — declarado antes de mirar nada

const OCC = /^([A-Z]+)(\d{6})([CP])\d{8}$/;

// ── series de precio (cierre diario) ─────────────────────────────────────────────────────
const universo = fs.readdirSync(CHART).map((f) => f.slice(0, -8));
const cierre = new Map();   // raíz → { fechas: [], v: Map(fecha→cierre), idx: Map(fecha→i) }
for (const T of universo) {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CHART, T + ".json.gz"))).toString("utf8"));
  const fechas = [], v = new Map(), idx = new Map();
  for (const p of j.data ?? []) { const f = p.t.slice(0, 10); if (v.has(f)) continue; idx.set(f, fechas.length); fechas.push(f); v.set(f, p.v); }
  cierre.set(T, { fechas, v, idx });
}
console.log("universo con precio: " + universo.length + " simbolos (indices EXCLUIDOS: sin precio en la API)\n");

function retorno(T, d, n) {
  const s = cierre.get(T); if (!s) return null;
  const i = s.idx.get(d); if (i == null) return null;
  const j = i + n; if (j >= s.fechas.length) return null;
  const a = s.v.get(s.fechas[i]), b = s.v.get(s.fechas[j]);
  if (!(a > 0) || !(b > 0)) return null;
  return b / a - 1;
}

// ── métricas por (símbolo, día) con lo observable hasta el corte ─────────────────────────
const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
const filasBrutas = [];
let candidatos = 0, opsUsadas = 0, opsDescartadasCampo = 0;

for (const d of dias) {
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR, d + ".jsonl.gz"))).toString("utf8").trim();
  if (!txt) continue;
  const lim = d + CORTE;
  const agg = new Map();
  for (const linea of txt.split("\n")) {
    const f = JSON.parse(linea);
    if (f.timestamp >= lim) continue;                       // sólo lo anterior a las 12:00 ET
    const m = OCC.exec(f.symbol); if (!m) continue;
    const T = m[1]; if (!cierre.has(T)) continue;           // sin precio → fuera, no se sustituye
    if (f.open_interest == null || f.size == null || f.premium == null) { opsDescartadasCampo++; continue; }
    let a = agg.get(T);
    if (!a) { a = { ops: 0, prima: 0, nuevaPrima: 0, nuevaOps: 0, nuevaAlza: 0, nuevaBaja: 0, size: 0, oi: 0, vistos: new Set() }; agg.set(T, a); }
    a.ops++; a.prima += f.premium; a.size += f.size;
    if (!a.vistos.has(f.symbol)) { a.vistos.add(f.symbol); a.oi += f.open_interest; }
    if (f.size > f.open_interest) {                         // aritméticamente NO puede ser cierre
      a.nuevaOps++; a.nuevaPrima += f.premium;
      if (f.sentiment === "bullish") a.nuevaAlza += f.premium;
      else if (f.sentiment === "bearish") a.nuevaBaja += f.premium;
    }
    opsUsadas++;
  }
  for (const [T, a] of agg) {
    candidatos++;
    if (a.ops < MIN_OPS || a.prima < MIN_PRIMA || a.oi <= 0) continue;
    filasBrutas.push({
      fecha: d, ticker: T, ops: a.ops, prima: a.prima,
      fracNuevaPrima: a.nuevaPrima / a.prima,
      fracNuevaNeta: (a.nuevaAlza - a.nuevaBaja) / a.prima,
      fracNuevaOps: a.nuevaOps / a.ops,
      intensidadOI: a.size / a.oi,
      r1: retorno(T, d, 1), r5: retorno(T, d, 5), r20: retorno(T, d, 20),
    });
  }
}
console.log("operaciones usadas (antes de las 12:00 ET, con precio y campos completos): " + opsUsadas.toLocaleString("es-ES"));
console.log("operaciones sin OI/size/premium descartadas: " + opsDescartadasCampo.toLocaleString("es-ES"));
comprobarDescarte(candidatos, filasBrutas.length, "filtro de liquidez minima (" + MIN_OPS + " ops y $" + (MIN_PRIMA / 1e6) + "M antes del corte)");
console.log("pares simbolo-dia: " + candidatos.toLocaleString("es-ES") + " candidatos -> " + filasBrutas.length.toLocaleString("es-ES") + " con muestra suficiente\n");

// ── RADIOGRAFÍA antes de medir ───────────────────────────────────────────────────────────
radiografia(filasBrutas, [...METRICAS, "r1", "r5", "r20", "ops", "prima"], "OI por operacion (simbolo-dia)");

// ── demediar dentro del día + rango transversal del propio día ───────────────────────────
const porDia = new Map();
for (const f of filasBrutas) { if (!porDia.has(f.fecha)) porDia.set(f.fecha, []); porDia.get(f.fecha).push(f); }
const diasOrden = [...porDia.keys()].sort();

function preparar(metrica, hz) {
  const salida = [];
  for (const d of diasOrden) {
    const g = porDia.get(d).filter((f) => f["r" + hz] != null);
    if (g.length < 12) continue;                            // corte transversal demasiado fino
    const mediaDia = g.reduce((s, f) => s + f["r" + hz], 0) / g.length;
    const ord = [...g].sort((a, b) => a[metrica] - b[metrica]);
    ord.forEach((f, i) => salida.push({
      pnl: f["r" + hz] - mediaDia,                          // neutro al mercado por construccion
      ticker: f.ticker, fecha: f.fecha,
      rango: g.length > 1 ? i / (g.length - 1) : 0.5,       // percentil DENTRO del dia
      bruto: f[metrica],
    }));
  }
  return salida;
}

// t de Newey-West sobre la serie diaria de la separacion: los retornos a 5 y 20 dias se
// solapan, y sin corregir eso la t sale inflada.
function neweyWest(serie, lag) {
  const n = serie.length; if (n < 5) return { media: 0, t: 0, n };
  const m = serie.reduce((s, x) => s + x, 0) / n;
  const e = serie.map((x) => x - m);
  let g0 = e.reduce((s, x) => s + x * x, 0) / n, s2 = g0;
  for (let l = 1; l <= Math.min(lag, n - 1); l++) {
    let g = 0; for (let i = l; i < n; i++) g += e[i] * e[i - l];
    s2 += 2 * (1 - l / (lag + 1)) * (g / n);
  }
  const ee = Math.sqrt(Math.max(s2, 0) / n);
  return { media: m, t: ee > 0 ? m / ee : 0, n };
}

function separacionDiaria(filas, hz) {
  const porF = new Map();
  for (const f of filas) { if (!porF.has(f.fecha)) porF.set(f.fecha, []); porF.get(f.fecha).push(f); }
  const serie = [], fechas = [];
  for (const d of [...porF.keys()].sort()) {
    const g = porF.get(d).sort((a, b) => b.rango - a.rango);
    const k = Math.floor(g.length / 3); if (k < 4) continue;
    const alto = g.slice(0, k).reduce((s, f) => s + f.pnl, 0) / k;
    const bajo = g.slice(-k).reduce((s, f) => s + f.pnl, 0) / k;
    serie.push(alto - bajo); fechas.push(d);
  }
  return { serie, fechas, nw: neweyWest(serie, hz) };
}

const LISTON = listonT(PRUEBAS);
console.log("\n══ REJILLA · " + METRICAS.length + " metricas x " + HORIZONTES.length + " horizontes = " + PRUEBAS + " PRUEBAS DECLARADAS · liston de |t| = " + LISTON + " ══\n");
console.log("metrica              hz     n     sep dia   t(NW)   sep pooled   t(pool)   tercios                      barrera");
console.log("─".repeat(122));

const resultados = [];
for (const met of METRICAS) {
  for (const hz of HORIZONTES) {
    const filas = preparar(met, hz);
    if (filas.length < 100) { console.log(met.padEnd(20) + String(hz).padStart(3) + "   muestra insuficiente (" + filas.length + ")"); continue; }
    const sd = separacionDiaria(filas, hz);
    const v = pasarBarrera(filas, (f) => f.rango, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
    const terc = v.detalle.tercios.map((t) => (t.sep >= 0 ? "+" : "-") + Math.abs(t.sep * 100).toFixed(2)).join(" ");
    console.log(met.padEnd(20) + String(hz).padStart(3) + String(filas.length).padStart(7) +
      (sd.nw.media * 100).toFixed(3).padStart(10) + "%" + sd.nw.t.toFixed(2).padStart(8) +
      (v.detalle.sep * 100).toFixed(3).padStart(12) + "%" + v.detalle.t.toFixed(2).padStart(9) +
      "   " + terc.padEnd(26) + (v.pasa ? " PASA" : " no"));
    resultados.push({ met, hz, filas, v, sd });
  }
}

console.log("\n" + "═".repeat(122));
console.log("sep dia = media de la separacion tercio alto - tercio bajo calculada DENTRO de cada dia; t(NW) corrige el solape de horizontes.");
console.log("sep pooled / t(pool) = lo que devuelve pasarBarrera() sobre los retornos ya demediados por dia.");
console.log("tercios = separacion pooled en cada tercio del periodo, en %. Mismo signo en los tres o no cuenta.\n");

// ── informe completo de los que pasan, y potencia de los que no ──────────────────────────
const pasan = resultados.filter((r) => r.v.pasa && Math.abs(r.sd.nw.t) >= LISTON);
if (pasan.length) {
  for (const r of pasan) {
    console.log("\n" + informe(r.v, r.met + " a " + r.hz + " dias"));
    console.log("  t de Newey-West sobre la serie diaria (" + r.sd.serie.length + " dias): " + r.sd.nw.t.toFixed(2));
  }
} else {
  console.log("NINGUNA metrica pasa las cuatro cribas Y el liston con la t corregida por solape.\n");
  console.log("POTENCIA — que separacion habria hecho falta para verlo (una ventaja del 0,30% mensual):");
  for (const r of resultados) {
    const p = potencia(r.filas, 0.003);
    console.log("  " + (r.met + " a " + r.hz + "d").padEnd(26) + "n=" + String(r.filas.length).padStart(6) +
      " -> separacion minima detectable " + (p.detectable * 100).toFixed(3) + "%  " + (p.concluyente ? "(negativo CONCLUYENTE)" : "(no lo pudimos ver)"));
  }
}

// ── guardar la rejilla para el informe ───────────────────────────────────────────────────
const salida = path.join("data", "marketsnack", "inventario", "oi-rejilla.json");
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, JSON.stringify({
  generado: new Date().toISOString(), corte: CORTE, pruebas: PRUEBAS, liston: LISTON,
  minOps: MIN_OPS, minPrima: MIN_PRIMA, universo: universo.length, paresSimboloDia: filasBrutas.length,
  rejilla: resultados.map((r) => ({
    metrica: r.met, horizonte: r.hz, n: r.filas.length,
    sepDiaria: r.sd.nw.media, tNW: r.sd.nw.t, diasSerie: r.sd.serie.length,
    sepPooled: r.v.detalle.sep, tPooled: r.v.detalle.t, pasa: r.v.pasa,
    motivos: r.v.motivos, tercios: r.v.detalle.tercios,
  })),
}, null, 1));
console.log("\nrejilla guardada en " + salida);
