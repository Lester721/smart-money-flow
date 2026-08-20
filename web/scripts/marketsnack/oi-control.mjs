// ═══ EL CONTROL QUE DECIDE SI EL INGREDIENTE "OI" APORTA ALGO ══════════════════════════
//
// En la rejilla de oi-medir.mjs el unico candidato es `fracNuevaNeta`: la prima NETA
// (alcista - bajista) de las operaciones que ABREN posicion nueva (size > OI), sobre la prima
// total del simbolo esa mañana. A 5 dias separa +0,66% con el mismo signo en los tres tercios,
// pero con t(NW)=2,06, por debajo del liston.
//
// Antes de pedir mas muestra hay que saber SI EL INGREDIENTE ES EL OI. Porque `fracNuevaNeta`
// mezcla DOS cosas: la direccion del flujo y el filtro de posicion nueva. Si el desequilibrio
// direccional a secas —sin mirar el OI para nada— separa lo mismo o mas, entonces el OI no
// aporta nada y el candidato es otro ingrediente disfrazado.
//
//   netaTodo   = (prima alcista - prima bajista) / prima total   sobre TODAS las operaciones
//   netaNueva  = idem pero SOLO size > OI      (= fracNuevaNeta, el candidato)
//   netaVieja  = idem pero SOLO size <= OI     (el complemento: lo que PUEDE ser cierre)
//
// Si netaNueva > netaTodo > netaVieja, el OI separa señal de ruido y el ingrediente vale.
// Si los tres van igual, el OI no aporta.
//
// Se declara la familia entera: 12 pruebas de oi-medir.mjs + 6 aqui = 18.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { radiografia } from "../../lib/radiografia.ts";
import { pasarBarrera, listonT, comprobarDescarte, potencia } from "../../lib/barreraHallazgos.ts";

const DIR = path.join("scripts", "cache-theta", "marketsnack", "flujo-100k");
const CHART = path.join("scripts", "cache-theta", "marketsnack", "aux", "chart-all");
const CORTE = "T16:00:00";
const MIN_OPS = 15, MIN_PRIMA = 1_000_000;
const HORIZONTES = [1, 5, 20];
const METRICAS = ["netaNueva", "netaTodo", "netaVieja"];
const PRUEBAS = 18;
const LISTON = listonT(PRUEBAS);
const OCC = /^([A-Z]+)(\d{6})([CP])\d{8}$/;

const universo = fs.readdirSync(CHART).map((f) => f.slice(0, -8));
const cierre = new Map();
for (const T of universo) {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CHART, T + ".json.gz"))).toString("utf8"));
  const fechas = [], v = new Map(), idx = new Map();
  for (const p of j.data ?? []) { const f = p.t.slice(0, 10); if (v.has(f)) continue; idx.set(f, fechas.length); fechas.push(f); v.set(f, p.v); }
  cierre.set(T, { fechas, v, idx });
}
function retorno(T, d, n) {
  const s = cierre.get(T); const i = s?.idx.get(d); if (i == null) return null;
  const j = i + n; if (j >= s.fechas.length) return null;
  const a = s.v.get(s.fechas[i]), b = s.v.get(s.fechas[j]);
  return a > 0 && b > 0 ? b / a - 1 : null;
}

const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
const filasBrutas = [];
let candidatos = 0;
for (const d of dias) {
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR, d + ".jsonl.gz"))).toString("utf8").trim();
  if (!txt) continue;
  const lim = d + CORTE;
  const agg = new Map();
  for (const linea of txt.split("\n")) {
    const f = JSON.parse(linea);
    if (f.timestamp >= lim) continue;
    const m = OCC.exec(f.symbol); if (!m) continue;
    const T = m[1]; if (!cierre.has(T)) continue;
    if (f.open_interest == null || f.size == null || f.premium == null) continue;
    let a = agg.get(T);
    if (!a) { a = { ops: 0, prima: 0, nA: 0, nB: 0, vA: 0, vB: 0, tA: 0, tB: 0 }; agg.set(T, a); }
    a.ops++; a.prima += f.premium;
    const alza = f.sentiment === "bullish", baja = f.sentiment === "bearish";
    if (alza) a.tA += f.premium; else if (baja) a.tB += f.premium;
    if (f.size > f.open_interest) { if (alza) a.nA += f.premium; else if (baja) a.nB += f.premium; }
    else { if (alza) a.vA += f.premium; else if (baja) a.vB += f.premium; }
  }
  for (const [T, a] of agg) {
    candidatos++;
    if (a.ops < MIN_OPS || a.prima < MIN_PRIMA) continue;
    filasBrutas.push({
      fecha: d, ticker: T,
      netaNueva: (a.nA - a.nB) / a.prima,
      netaTodo: (a.tA - a.tB) / a.prima,
      netaVieja: (a.vA - a.vB) / a.prima,
      r1: retorno(T, d, 1), r5: retorno(T, d, 5), r20: retorno(T, d, 20),
    });
  }
}
comprobarDescarte(candidatos, filasBrutas.length, "filtro de liquidez minima");
console.log("pares simbolo-dia: " + filasBrutas.length.toLocaleString("es-ES") + " de " + candidatos.toLocaleString("es-ES") + " candidatos\n");
radiografia(filasBrutas, METRICAS, "control direccional");

const porDia = new Map();
for (const f of filasBrutas) { if (!porDia.has(f.fecha)) porDia.set(f.fecha, []); porDia.get(f.fecha).push(f); }
const diasOrden = [...porDia.keys()].sort();
console.log("corte transversal por dia: mediana " + [...porDia.values()].map((g) => g.length).sort((a, b) => a - b)[Math.floor(porDia.size / 2)] + " simbolos\n");

function preparar(met, hz) {
  const out = [];
  for (const d of diasOrden) {
    const g = porDia.get(d).filter((f) => f["r" + hz] != null);
    if (g.length < 12) continue;
    const m = g.reduce((s, f) => s + f["r" + hz], 0) / g.length;
    const ord = [...g].sort((a, b) => a[met] - b[met]);
    ord.forEach((f, i) => out.push({ pnl: f["r" + hz] - m, ticker: f.ticker, fecha: f.fecha, rango: i / (g.length - 1) }));
  }
  return out;
}
function neweyWest(s, lag) {
  const n = s.length; if (n < 5) return { media: 0, t: 0 };
  const m = s.reduce((a, x) => a + x, 0) / n, e = s.map((x) => x - m);
  let s2 = e.reduce((a, x) => a + x * x, 0) / n;
  for (let l = 1; l <= Math.min(lag, n - 1); l++) { let g = 0; for (let i = l; i < n; i++) g += e[i] * e[i - l]; s2 += 2 * (1 - l / (lag + 1)) * (g / n); }
  const ee = Math.sqrt(Math.max(s2, 0) / n);
  return { media: m, t: ee > 0 ? m / ee : 0, dias: n };
}
function sepDiaria(filas, hz) {
  const pF = new Map();
  for (const f of filas) { if (!pF.has(f.fecha)) pF.set(f.fecha, []); pF.get(f.fecha).push(f); }
  const serie = [];
  for (const d of [...pF.keys()].sort()) {
    const g = pF.get(d).sort((a, b) => b.rango - a.rango);
    const k = Math.floor(g.length / 3); if (k < 4) continue;
    serie.push(g.slice(0, k).reduce((s, f) => s + f.pnl, 0) / k - g.slice(-k).reduce((s, f) => s + f.pnl, 0) / k);
  }
  return { serie, nw: neweyWest(serie, hz) };
}

console.log("═".repeat(112));
console.log("EL CONTROL · " + PRUEBAS + " pruebas declaradas en total · liston de |t| = " + LISTON);
console.log("═".repeat(112));
console.log("metrica       hz      n    sep dia   t(NW)   dias   sep pool  t(pool)   tercios                 ¿pasa barrera?");
console.log("─".repeat(112));
const R = {};
for (const met of METRICAS) {
  for (const hz of HORIZONTES) {
    const filas = preparar(met, hz);
    const sd = sepDiaria(filas, hz);
    const v = pasarBarrera(filas, (f) => f.rango, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
    const terc = v.detalle.tercios.map((t) => (t.sep >= 0 ? "+" : "-") + Math.abs(t.sep * 100).toFixed(2)).join(" ");
    R[met + hz] = { sd, v, filas };
    console.log(met.padEnd(12) + String(hz).padStart(3) + String(filas.length).padStart(8) +
      (sd.nw.media * 100).toFixed(3).padStart(10) + "%" + sd.nw.t.toFixed(2).padStart(8) + String(sd.nw.dias).padStart(7) +
      (v.detalle.sep * 100).toFixed(3).padStart(10) + "%" + v.detalle.t.toFixed(2).padStart(8) + "   " + terc.padEnd(22) +
      (v.pasa ? "PASA" : "no: " + (v.motivos[0] ?? "").slice(0, 40)));
  }
}
console.log("\n" + "═".repeat(112));
console.log("VEREDICTO SOBRE EL INGREDIENTE — ¿aporta el OI algo sobre el desequilibrio direccional a secas?");
for (const hz of HORIZONTES) {
  const n = R["netaNueva" + hz].sd.nw, t = R["netaTodo" + hz].sd.nw, v = R["netaVieja" + hz].sd.nw;
  const gana = n.media > t.media && t.media > v.media;
  console.log("  " + hz + "d:  nueva(size>OI) " + (n.media * 100).toFixed(3) + "% (t " + n.t.toFixed(2) + ")" +
    "  |  todo " + (t.media * 100).toFixed(3) + "% (t " + t.t.toFixed(2) + ")" +
    "  |  vieja(size<=OI) " + (v.media * 100).toFixed(3) + "% (t " + v.t.toFixed(2) + ")" +
    "   -> " + (gana ? "el OI ORDENA: nueva > todo > vieja" : "el OI NO ordena"));
}

console.log("\nPOTENCIA del negativo (efecto que importa: 0,30% de separacion mensual):");
for (const met of METRICAS) for (const hz of HORIZONTES) {
  const p = potencia(R[met + hz].filas, 0.003);
  console.log("  " + (met + " " + hz + "d").padEnd(18) + "minima detectable " + (p.detectable * 100).toFixed(3) + "%  " + (p.concluyente ? "CONCLUYENTE" : "no se pudo ver"));
}

console.log("\nCUANTA MUESTRA FALTA para que el mejor candidato alcance el liston (la t crece con la raiz de n):");
for (const hz of HORIZONTES) {
  const nw = R["netaNueva" + hz].sd.nw;
  if (Math.abs(nw.t) < 0.2) { console.log("  netaNueva " + hz + "d: t=" + nw.t.toFixed(2) + " — no hay nada que escalar"); continue; }
  const need = Math.ceil(nw.dias * (LISTON / Math.abs(nw.t)) ** 2);
  console.log("  netaNueva " + hz + "d: t=" + nw.t.toFixed(2) + " con " + nw.dias + " dias -> harian falta ~" + need +
    " dias de mercado (" + (need - nw.dias) + " mas, ~" + ((need - nw.dias) / 21).toFixed(1) + " meses) si el efecto es real y estable");
}

fs.writeFileSync(path.join("data", "marketsnack", "inventario", "oi-control.json"), JSON.stringify({
  generado: new Date().toISOString(), pruebas: PRUEBAS, liston: LISTON, pares: filasBrutas.length,
  tabla: METRICAS.flatMap((m) => HORIZONTES.map((h) => ({
    metrica: m, hz: h, sepDiaria: R[m + h].sd.nw.media, tNW: R[m + h].sd.nw.t, dias: R[m + h].sd.nw.dias,
    sepPooled: R[m + h].v.detalle.sep, tPooled: R[m + h].v.detalle.t, pasa: R[m + h].v.pasa, motivos: R[m + h].v.motivos,
    tercios: R[m + h].v.detalle.tercios,
  }))),
}, null, 1));
console.log("\nguardado en data/marketsnack/inventario/oi-control.json");
