// ═══ GAMMA LADDER · PASO 6 — LA SEÑAL SOBRE LA ESCALERA DE VERDAD ══════════════════════
//
// LA PREGUNTA, literal: ¿el precio va HACIA el pico de gamma o HUYE de él? ¿la distancia al
// pico predice el movimiento del día siguiente?
//
// ─── DE DÓNDE SALE LA ESCALERA ─────────────────────────────────────────────────────────────
// De /gex, calculada por MarketSnack con la cadena COMPLETA de cada día: call_wall, put_wall,
// magnet, max_pain, gamma_flip, net_gex. NO la reconstruida del flujo — esa quedó muerta en el
// paso 4 (el feed histórico no devuelve contratos ya vencidos: 82 días de 82, 0% de vencimientos
// cortos en el primer tercio, y la gamma vive justo ahí).
//
// ─── CUÁNDO SE OBSERVA · QUÉ PREDICE · CON QUÉ SE COBRARÍA ────────────────────────────────
//   · SE OBSERVA: al CIERRE del día D. Medido, no supuesto: el `asset_price` del punto D
//     empareja con el cierre de D (error 0,57%) y no con el de D-1 (2,86%). Paso 5, sección A.
//   · PREDICE: el retorno del subyacente cierre(D) -> cierre(D+n), n = 1 y 5.
//   · VEHÍCULO: comprar/vender la ACCIÓN, largo el tercio alto contra corto el tercio bajo,
//     dentro de cada día. Neutro al mercado por construcción (se resta la media del día).
//
// ─── LA VARIANTE CONSERVADORA, y por qué existe ───────────────────────────────────────────
// Su `asset_price` no cuadra EXACTO con el cierre (0,57% de error medio, 13,9% de coincidencias
// exactas). No se puede jurar que su foto sea de antes de la campana. Así que todo se mide DOS
// veces: entrando al cierre de D, y entrando al cierre de D+1 —donde la duda desaparece del
// todo—. Si el efecto sólo vive en la primera, es la ambigüedad de la hora y no una señal.
//
// PRUEBAS DECLARADAS: 7 metricas x 2 horizontes x 2 entradas = 28.
//
// USO: node --env-file=.env.local --import tsx --max-old-space-size=10240 \
//        scripts/marketsnack/ladder-6-senal.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { radiografia } from "../../lib/radiografia.ts";
import { pasarBarrera, informe, listonT, potencia } from "../../lib/barreraHallazgos.ts";

const BASE = path.join("scripts", "cache-theta", "marketsnack");
const GEXDIR = path.join(BASE, "aux", "gex", "2026-08-19");
const CHART = path.join(BASE, "aux", "chart-all");
const leer = (p) => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8"));

const METRICAS = ["distMagnet", "distCallWall", "distPutWall", "distMaxPain", "distFlip", "anchoMuros", "posEnBanda"];
const HORIZONTES = [1, 5];
const ENTRADAS = [0, 1];               // 0 = cierre de D · 1 = cierre de D+1 (conservadora)
const PRUEBAS = METRICAS.length * HORIZONTES.length * ENTRADAS.length;   // 28
const LISTON = listonT(PRUEBAS);

// ── cierres ──────────────────────────────────────────────────────────────────────────────
const cierre = new Map();
for (const f of fs.readdirSync(CHART)) {
  const j = leer(path.join(CHART, f));
  const fechas = [], v = new Map(), idx = new Map();
  for (const p of j.data ?? []) { const d = p.t.slice(0, 10); if (v.has(d)) continue; idx.set(d, fechas.length); fechas.push(d); v.set(d, p.v); }
  cierre.set(f.slice(0, -8), { fechas, v, idx });
}
/** retorno entre el cierre de (D + desfase) y el de (D + desfase + n). */
function retorno(T, d, n, desfase) {
  const s = cierre.get(T); if (!s) return null;
  const i0 = s.idx.get(d); if (i0 == null) return null;
  const i = i0 + desfase, j = i + n;
  if (i < 0 || j >= s.fechas.length) return null;
  const a = s.v.get(s.fechas[i]), b = s.v.get(s.fechas[j]);
  if (!(a > 0) || !(b > 0)) return null;
  return b / a - 1;
}

// ── la escalera publicada ────────────────────────────────────────────────────────────────
const filas = [];
for (const fich of fs.readdirSync(GEXDIR)) {
  const T = fich.replace(".json.gz", "");
  if (!cierre.has(T)) continue;                       // indices sin precio: FUERA, no se sustituyen
  for (const p of leer(path.join(GEXDIR, fich))["1m"]?.data ?? []) {
    const S = p.asset_price;
    if (!(S > 0) || p.call_wall == null || p.put_wall == null) continue;
    const ancho = (p.call_wall - p.put_wall) / S;
    filas.push({
      ticker: T, fecha: p.t.slice(0, 10), spot: S, netGex: p.net_gex,
      distMagnet: p.magnet != null ? (p.magnet - S) / S : null,
      distCallWall: (p.call_wall - S) / S,
      distPutWall: (p.put_wall - S) / S,
      distMaxPain: p.max_pain != null ? (p.max_pain - S) / S : null,
      distFlip: p.gamma_flip != null ? (p.gamma_flip - S) / S : null,
      anchoMuros: ancho,
      posEnBanda: ancho > 0 ? (S - p.put_wall) / (p.call_wall - p.put_wall) : null,
      r1_0: retorno(T, p.t.slice(0, 10), 1, 0), r5_0: retorno(T, p.t.slice(0, 10), 5, 0),
      r1_1: retorno(T, p.t.slice(0, 10), 1, 1), r5_1: retorno(T, p.t.slice(0, 10), 5, 1),
    });
  }
}
console.log("escalera publicada: " + filas.length + " filas · " + new Set(filas.map((f) => f.ticker)).size + " tickers · " +
  new Set(filas.map((f) => f.fecha)).size + " dias (" + [...new Set(filas.map((f) => f.fecha))].sort()[0] + " -> " +
  [...new Set(filas.map((f) => f.fecha))].sort().slice(-1)[0] + ")\n");

radiografia(filas, ["distMagnet", "distCallWall", "distPutWall", "distMaxPain", "anchoMuros", "posEnBanda", "spot", "netGex", "r1_0", "r5_0"],
  "escalera de gamma publicada", { cerosLegitimos: ["distMagnet", "distMaxPain"] });

// ── preparacion transversal ──────────────────────────────────────────────────────────────
const porDia = new Map();
for (const f of filas) { if (!porDia.has(f.fecha)) porDia.set(f.fecha, []); porDia.get(f.fecha).push(f); }
const diasOrden = [...porDia.keys()].sort();

function preparar(metrica, hz, entrada) {
  const campo = "r" + hz + "_" + entrada;
  const salida = [];
  for (const d of diasOrden) {
    const g = porDia.get(d).filter((f) => f[campo] != null && f[metrica] != null && Number.isFinite(f[metrica]));
    if (g.length < 10) continue;
    const mediaDia = g.reduce((s, f) => s + f[campo], 0) / g.length;
    const ord = [...g].sort((a, b) => a[metrica] - b[metrica]);
    ord.forEach((f, i) => salida.push({
      pnl: f[campo] - mediaDia,                          // neutro al mercado dentro del dia
      ticker: f.ticker, fecha: f.fecha,
      rango: g.length > 1 ? i / (g.length - 1) : 0.5,
      bruto: f[metrica],
    }));
  }
  return salida;
}

function neweyWest(serie, lag) {
  const n = serie.length; if (n < 5) return { media: 0, t: 0, n };
  const m = serie.reduce((s, x) => s + x, 0) / n;
  const e = serie.map((x) => x - m);
  let s2 = e.reduce((s, x) => s + x * x, 0) / n;
  for (let l = 1; l <= Math.min(lag, n - 1); l++) {
    let g = 0; for (let i = l; i < n; i++) g += e[i] * e[i - l];
    s2 += 2 * (1 - l / (lag + 1)) * (g / n);
  }
  const ee = Math.sqrt(Math.max(s2, 0) / n);
  return { media: m, t: ee > 0 ? m / ee : 0, n };
}
function separacionDiaria(fs_, hz) {
  const porF = new Map();
  for (const f of fs_) { if (!porF.has(f.fecha)) porF.set(f.fecha, []); porF.get(f.fecha).push(f); }
  const serie = [];
  for (const d of [...porF.keys()].sort()) {
    const g = porF.get(d).sort((a, b) => b.rango - a.rango);
    const k = Math.floor(g.length / 3); if (k < 4) continue;
    serie.push(g.slice(0, k).reduce((s, f) => s + f.pnl, 0) / k - g.slice(-k).reduce((s, f) => s + f.pnl, 0) / k);
  }
  return { serie, nw: neweyWest(serie, hz) };
}

console.log("\n" + "═".repeat(120));
console.log("REJILLA · " + PRUEBAS + " PRUEBAS DECLARADAS · liston de |t| = " + LISTON + " (Bonferroni)");
console.log("signo POSITIVO = el tercio con el nivel MAS ARRIBA rinde mas -> el precio va HACIA el nivel (iman)");
console.log("signo NEGATIVO = el precio HUYE del nivel");
console.log("═".repeat(120));
console.log("metrica          entrada  hz      n     sep dia    t(NW)   sep pool   t(pool)   tercios                barrera");
console.log("─".repeat(120));

const resultados = [];
for (const m of METRICAS) {
  for (const e of ENTRADAS) {
    for (const hz of HORIZONTES) {
      const fl = preparar(m, hz, e);
      const et = e === 0 ? "cierre D" : "cierre D+1";
      if (fl.length < 200) { console.log(m.padEnd(16) + et.padEnd(10) + String(hz).padStart(3) + "   muestra insuficiente (" + fl.length + ")"); continue; }
      const sd = separacionDiaria(fl, hz);
      const v = pasarBarrera(fl, (f) => f.rango, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
      const terc = v.detalle.tercios.map((t) => (t.sep >= 0 ? "+" : "-") + Math.abs(t.sep * 100).toFixed(2)).join(" ");
      console.log(m.padEnd(16) + et.padEnd(10) + String(hz).padStart(3) + String(fl.length).padStart(7) +
        (sd.nw.media * 100).toFixed(3).padStart(11) + "%" + sd.nw.t.toFixed(2).padStart(8) +
        (v.detalle.sep * 100).toFixed(3).padStart(11) + "%" + v.detalle.t.toFixed(2).padStart(9) +
        "   " + terc.padEnd(22) + (v.pasa ? " PASA" : " no"));
      resultados.push({ metrica: m, entrada: e, hz, filas: fl, v, sd });
    }
  }
}

console.log("\n" + "═".repeat(120));
const pasan = resultados.filter((r) => r.v.pasa && Math.abs(r.sd.nw.t) >= LISTON);
if (pasan.length) {
  console.log("PASAN LAS CUATRO CRIBAS Y EL LISTON:\n");
  for (const r of pasan) {
    console.log(informe(r.v, r.metrica + " · entrada " + (r.entrada ? "cierre D+1" : "cierre D") + " · " + r.hz + "d"));
    console.log("  t de Newey-West sobre la serie diaria (" + r.sd.serie.length + " dias): " + r.sd.nw.t.toFixed(2) + "\n");
  }
} else {
  console.log("NINGUNA metrica de la escalera pasa. Ni el iman ni la huida aparecen.\n");
  console.log("POTENCIA — ¿podia esta muestra ver algo? (efecto de referencia: 0,30% mensual = 0,014% diario)");
  console.log("metrica          entrada  hz      n    separacion minima detectable   veredicto del negativo");
  for (const r of resultados) {
    const p = potencia(r.filas, r.hz === 1 ? 0.00014 * 1 : 0.00014 * 5);
    console.log("  " + r.metrica.padEnd(16) + (r.entrada ? "D+1" : "D  ").padEnd(9) + String(r.hz).padStart(2) +
      String(r.filas.length).padStart(7) + (p.detectable * 100).toFixed(3).padStart(22) + "%   " +
      (p.concluyente ? "CONCLUYENTE" : "no lo pudimos ver"));
  }
}

// ── ¿y el REGIMEN? el efecto iman deberia vivir solo con gamma neta POSITIVA ─────────────
console.log("\n" + "═".repeat(120));
console.log("CONTROL DE MECANISMO — el iman solo tiene sentido con gamma neta POSITIVA (dealer largo");
console.log("de gamma compra abajo y vende arriba = frena). Con gamma NEGATIVA deberia invertirse.");
console.log("Esto NO es una prueba nueva: es mirar si el signo se comporta como dice la teoria.");
console.log("═".repeat(120));
function porRegimen(metrica, hz, entrada, positivo) {
  const campo = "r" + hz + "_" + entrada;
  const salida = [];
  for (const d of diasOrden) {
    const g = porDia.get(d).filter((f) => f[campo] != null && f[metrica] != null && Number.isFinite(f[metrica]) && (positivo ? f.netGex > 0 : f.netGex <= 0));
    if (g.length < 8) continue;
    const mediaDia = g.reduce((s, f) => s + f[campo], 0) / g.length;
    const ord = [...g].sort((a, b) => a[metrica] - b[metrica]);
    ord.forEach((f, i) => salida.push({ pnl: f[campo] - mediaDia, ticker: f.ticker, fecha: f.fecha, rango: g.length > 1 ? i / (g.length - 1) : 0.5 }));
  }
  if (salida.length < 60) return null;
  const k = Math.floor(salida.length / 3);
  const ord = salida.slice().sort((a, b) => b.rango - a.rango);
  const alto = ord.slice(0, k).map((f) => f.pnl), bajo = ord.slice(-k).map((f) => f.pnl);
  const med = (v) => v.reduce((a, b) => a + b, 0) / v.length;
  return { n: salida.length, sep: med(alto) - med(bajo) };
}
console.log("metrica          hz   gamma neta POSITIVA        gamma neta NEGATIVA        ¿se invierte?");
for (const m of METRICAS) {
  for (const hz of HORIZONTES) {
    const a = porRegimen(m, hz, 0, true), b = porRegimen(m, hz, 0, false);
    if (!a || !b) continue;
    const inv = Math.sign(a.sep) !== Math.sign(b.sep);
    console.log(m.padEnd(16) + String(hz).padStart(2) + "   n=" + String(a.n).padStart(4) + " sep " + (a.sep * 100).toFixed(3).padStart(8) + "%" +
      "     n=" + String(b.n).padStart(4) + " sep " + (b.sep * 100).toFixed(3).padStart(8) + "%     " + (inv ? "SI" : "no"));
  }
}

fs.writeFileSync(path.join("scripts", "marketsnack", "ladder-6-salida.json"), JSON.stringify({
  generado: new Date().toISOString(), pruebas: PRUEBAS, liston: LISTON, n: filas.length,
  tickers: new Set(filas.map((f) => f.ticker)).size, dias: new Set(filas.map((f) => f.fecha)).size,
  rejilla: resultados.map((r) => ({
    metrica: r.metrica, entrada: r.entrada ? "cierre D+1" : "cierre D", horizonte: r.hz, n: r.filas.length,
    sepDiaria: r.sd.nw.media, tNW: r.sd.nw.t, sepPooled: r.v.detalle.sep, tPooled: r.v.detalle.t,
    pasa: r.v.pasa, motivos: r.v.motivos, tercios: r.v.detalle.tercios, tickerMayor: r.v.detalle.tickerMayor,
  })),
}, null, 1));
console.log("\nguardado en scripts/marketsnack/ladder-6-salida.json");
