// ═══ GAMMA LADDER · PASO 1 — RECONOCIMIENTO Y VALIDACIÓN ═══════════════════════════════
//
// Antes de medir nada: ¿se puede RECONSTRUIR la escalera de gamma por strike con lo que hay
// en disco, y se parece a la de verdad?
//
// De dónde sale cada pieza:
//   · el OCC del `symbol` da STRIKE, TIPO y VENCIMIENTO de cada operación
//   · `gamma` viene POR OPERACIÓN (gamma por acción del contrato en ese momento)
//   · `open_interest` viene POR CONTRATO y ya está validado en oi-validar.mjs: es el CIERRE
//     DE D-1 (corr(|ΔOI|, volumen de D)=0,861 contra 0,291 con el de D+1). Pasado, no futuro.
//
// Escalera = por strike, Σ gamma × OI × 100 × S² × 0,01  (dólares de delta por 1% de movimiento)
// Convención de dealer, la misma de lib/gex.ts: netGex = callGex − putGex.
//
// LO QUE HAY QUE COMPROBAR AQUÍ, y por qué:
//   A. ¿Está vivo el campo `gamma`? (radiografía)
//   B. ¿Cuánto del interés abierto REAL captura el flujo? El flow_feed sólo trae contratos que
//      OPERARON con prima ≥ $100k. La cadena completa del 2026-08-19 (150 ficheros) sirve de
//      patrón para medirlo. Si el flujo captura el 3% del OI, la escalera es otra cosa.
//   C. ¿Coinciden mis muros con los de MarketSnack? Ellos publican call_wall/put_wall/net_gex/
//      gamma_flip por día (19 días de solape). Es una RUTA DISTINTA: si cuadra, la
//      reconstrucción vale; si no, se dice y se para.
//   D. ¿Sobrevive el spot a la ruptura del 2026-07-16? `asset_price` es nulo el 27,3% de las
//      filas ANTES de esa fecha. Se mide cuántos pares símbolo-día se quedan sin spot.
//
// USO: node --env-file=.env.local --import tsx --max-old-space-size=10240 \
//        scripts/marketsnack/ladder-1-recon.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { radiografia } from "../../lib/radiografia.ts";

const BASE = path.join("scripts", "cache-theta", "marketsnack");
const DIR = path.join(BASE, "flujo-100k");
const CHART = path.join(BASE, "aux", "chart-all");
const CADENAS = path.join(BASE, "aux", "cadenas", "2026-08-19");
const GEXDIR = path.join(BASE, "aux", "gex", "2026-08-19");
const CORTE = "T16:00:00"; // 12:00 ET

const OCC = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const leer = (p) => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8"));

function parseOCC(sym) {
  const m = OCC.exec(sym);
  if (!m) return null;
  return { raiz: m[1], venc: "20" + m[2].slice(0, 2) + "-" + m[2].slice(2, 4) + "-" + m[2].slice(4, 6), tipo: m[3], strike: Number(m[4]) / 1000 };
}

// ── universo con precio ───────────────────────────────────────────────────────────────────
const universo = new Set(fs.readdirSync(CHART).map((f) => f.slice(0, -8)));
console.log("universo con serie de precio: " + universo.size + " simbolos\n");

const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
console.log("dias de flujo en disco: " + dias.length + "  (" + dias[0] + " -> " + dias[dias.length - 1] + ")\n");

// ═══ A. ¿ESTÁ VIVO EL CAMPO GAMMA? ═══════════════════════════════════════════════════════
console.log("═".repeat(96));
console.log("A. RADIOGRAFIA DEL CAMPO gamma  (muestra: 6 dias repartidos por todo el periodo)");
console.log("═".repeat(96));

const muestraDias = [dias[0], dias[15], dias[30], dias[45], dias[60], dias[dias.length - 1]];
const muestra = [];
for (const d of muestraDias) {
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR, d + ".jsonl.gz"))).toString("utf8").trim();
  if (!txt) continue;
  for (const l of txt.split("\n")) {
    const f = JSON.parse(l);
    const o = parseOCC(f.symbol);
    if (!o) continue;
    muestra.push({ gamma: f.gamma, oi: f.open_interest, strike: o.strike, assetPrice: f.asset_price, iv: f.implied_volatility, delta: f.delta, size: f.size });
  }
}
console.log("filas de la muestra: " + muestra.length.toLocaleString("es-ES"));
radiografia(muestra, ["gamma", "oi", "strike", "delta", "iv"], "campos de la escalera de gamma");

const gNulos = muestra.filter((m) => m.gamma == null || !Number.isFinite(m.gamma)).length;
const gCeros = muestra.filter((m) => m.gamma === 0).length;
const apNulos = muestra.filter((m) => m.assetPrice == null).length;
console.log("\ngamma nulos: " + (gNulos / muestra.length * 100).toFixed(2) + "%   gamma == 0: " + (gCeros / muestra.length * 100).toFixed(2) + "%");
console.log("asset_price nulos en la muestra: " + (apNulos / muestra.length * 100).toFixed(2) + "%");

// ═══ B. ¿CUANTO DEL OI REAL CAPTURA EL FLUJO? ════════════════════════════════════════════
console.log("\n" + "═".repeat(96));
console.log("B. COBERTURA — que fraccion del INTERES ABIERTO real esta en el flujo");
console.log("   patron: las cadenas completas del 2026-08-19 (ruta distinta a flow_feed)");
console.log("═".repeat(96));

// contratos vistos en el flujo del 2026-08-19 (dia completo, para comparar contra la cadena)
const flujoHoy = new Map(); // symbol -> {oi, gamma}
{
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR, "2026-08-19.jsonl.gz"))).toString("utf8").trim();
  for (const l of txt.split("\n")) {
    const f = JSON.parse(l);
    flujoHoy.set(f.symbol, { oi: f.open_interest, gamma: f.gamma });
  }
}
console.log("contratos distintos en el flujo del 2026-08-19: " + flujoHoy.size.toLocaleString("es-ES"));

const porTicker = new Map();
for (const fich of fs.readdirSync(CADENAS)) {
  const T = fich.split("-")[0];
  const arr = leer(path.join(CADENAS, fich));
  let a = porTicker.get(T);
  if (!a) { a = { oiTotal: 0, oiEnFlujo: 0, contratos: 0, contratosEnFlujo: 0, oiDiscrepa: 0, oiPares: 0, oiAbsDif: 0 }; porTicker.set(T, a); }
  for (const c of arr) {
    const oi = c.open_interest ?? 0;
    a.oiTotal += oi; a.contratos++;
    const f = flujoHoy.get(c.symbol);
    if (f) {
      a.oiEnFlujo += oi; a.contratosEnFlujo++;
      if (f.oi != null && oi > 0) { a.oiPares++; a.oiAbsDif += Math.abs(f.oi - oi) / oi; }
    }
  }
}
console.log("\nticker   contratos  en flujo   %contr   OI total      OI en flujo   %OI    dif media OI (flujo vs cadena)");
console.log("─".repeat(104));
let sumOi = 0, sumOiF = 0, sumPares = 0, sumDif = 0;
for (const [T, a] of [...porTicker].sort((x, y) => y[1].oiTotal - x[1].oiTotal).slice(0, 18)) {
  sumOi += a.oiTotal; sumOiF += a.oiEnFlujo; sumPares += a.oiPares; sumDif += a.oiAbsDif;
  console.log(T.padEnd(8) + String(a.contratos).padStart(9) + String(a.contratosEnFlujo).padStart(10) +
    (a.contratosEnFlujo / a.contratos * 100).toFixed(1).padStart(8) + "%" +
    a.oiTotal.toLocaleString("es-ES").padStart(13) + a.oiEnFlujo.toLocaleString("es-ES").padStart(15) +
    (a.oiTotal ? (a.oiEnFlujo / a.oiTotal * 100).toFixed(1) : "—").padStart(7) + "%" +
    (a.oiPares ? (a.oiAbsDif / a.oiPares * 100).toFixed(2) + "%" : "—").padStart(12));
}
let gOi = 0, gOiF = 0, gPares = 0, gDif = 0;
for (const [, a] of porTicker) { gOi += a.oiTotal; gOiF += a.oiEnFlujo; gPares += a.oiPares; gDif += a.oiAbsDif; }
console.log("─".repeat(104));
console.log("TOTAL (" + porTicker.size + " tickers de cadena)   OI " + gOi.toLocaleString("es-ES") + "   en flujo " + gOiF.toLocaleString("es-ES") +
  "   = " + (gOiF / gOi * 100).toFixed(1) + "%   |  discrepancia media del OI en contratos comunes: " + (gDif / gPares * 100).toFixed(2) + "%");

// ═══ C. ¿COINCIDEN MIS MUROS CON LOS DE MARKETSNACK? ═════════════════════════════════════
console.log("\n" + "═".repeat(96));
console.log("C. VALIDACION — mis muros reconstruidos contra los que publica MarketSnack");
console.log("   (su serie /gex trae call_wall, put_wall, net_gex, gamma_flip por dia: 19 dias de solape)");
console.log("═".repeat(96));

// escalera de un (ticker, dia) con TODO el dia (para comparar contra su foto de cierre)
function escaleraDia(d, filtroHora) {
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR, d + ".jsonl.gz"))).toString("utf8").trim();
  if (!txt) return new Map();
  const lim = d + CORTE;
  const porT = new Map();
  for (const l of txt.split("\n")) {
    const f = JSON.parse(l);
    if (filtroHora && f.timestamp >= lim) continue;
    const o = parseOCC(f.symbol);
    if (!o) continue;
    if (f.gamma == null || !Number.isFinite(f.gamma) || f.open_interest == null) continue;
    let a = porT.get(o.raiz);
    if (!a) { a = { contratos: new Map(), spots: [] }; porT.set(o.raiz, a); }
    // ultimo dato observado del contrato antes del limite
    a.contratos.set(f.symbol, { strike: o.strike, tipo: o.tipo, gamma: f.gamma, oi: f.open_interest, venc: o.venc });
    if (f.asset_price != null && f.asset_price > 0) a.spots.push(f.asset_price);
  }
  const out = new Map();
  for (const [T, a] of porT) {
    if (!a.spots.length) continue;
    const s = a.spots.slice().sort((x, y) => x - y);
    const spot = s[Math.floor(s.length / 2)];
    const strikes = new Map();
    for (const c of a.contratos.values()) {
      const g = c.gamma * c.oi * 100 * spot * spot * 0.01;
      let e = strikes.get(c.strike);
      if (!e) { e = { call: 0, put: 0 }; strikes.set(c.strike, e); }
      if (c.tipo === "C") e.call += g; else e.put += g;
    }
    out.set(T, { spot, strikes, nContratos: a.contratos.size });
  }
  return out;
}

function muros(esc) {
  let callWall = null, callMax = 0, putWall = null, putMax = 0, neto = 0;
  for (const [k, e] of esc.strikes) {
    if (e.call > callMax) { callMax = e.call; callWall = k; }
    if (e.put > putMax) { putMax = e.put; putWall = k; }
    neto += e.call - e.put;
  }
  return { callWall, putWall, neto };
}

const cmp = [];
for (const fich of fs.readdirSync(GEXDIR)) {
  const T = fich.replace(".json.gz", "");
  const j = leer(path.join(GEXDIR, fich));
  for (const p of j["1m"]?.data ?? []) {
    const d = p.t.slice(0, 10);
    cmp.push({ T, d, suyo: p });
  }
}
const diasCmp = [...new Set(cmp.map((c) => c.d))].sort().filter((d) => dias.includes(d));
console.log("dias comparables: " + diasCmp.length + "  (" + diasCmp[0] + " -> " + diasCmp[diasCmp.length - 1] + ")");

let okCall = 0, okPut = 0, okSigno = 0, totCmp = 0;
const detalle = [];
for (const d of diasCmp) {
  const esc = escaleraDia(d, false); // dia COMPLETO: su foto es de cierre
  for (const c of cmp.filter((x) => x.d === d)) {
    const e = esc.get(c.T);
    if (!e) continue;
    const m = muros(e);
    if (m.callWall == null || m.putWall == null) continue;
    totCmp++;
    const dCall = Math.abs(m.callWall - c.suyo.call_wall) / e.spot;
    const dPut = Math.abs(m.putWall - c.suyo.put_wall) / e.spot;
    if (dCall <= 0.02) okCall++;
    if (dPut <= 0.02) okPut++;
    if (Math.sign(m.neto) === Math.sign(c.suyo.net_gex)) okSigno++;
    detalle.push({ T: c.T, d, mioCall: m.callWall, suyoCall: c.suyo.call_wall, mioPut: m.putWall, suyoPut: c.suyo.put_wall, mioNeto: m.neto, suyoNeto: c.suyo.net_gex, spot: e.spot });
  }
}
console.log("comparaciones (ticker-dia): " + totCmp);
console.log("  call wall dentro del 2% del spot: " + (okCall / totCmp * 100).toFixed(1) + "%");
console.log("  put  wall dentro del 2% del spot: " + (okPut / totCmp * 100).toFixed(1) + "%");
console.log("  mismo SIGNO de gamma neta:        " + (okSigno / totCmp * 100).toFixed(1) + "%");
console.log("\n  ejemplos (los 12 primeros):");
console.log("  ticker  fecha        spot     call: mio / suyo      put: mio / suyo      neto: mio / suyo");
for (const x of detalle.slice(0, 12)) {
  console.log("  " + x.T.padEnd(7) + x.d + x.spot.toFixed(2).padStart(10) +
    ("   " + x.mioCall + " / " + x.suyoCall).padEnd(22) +
    ("   " + x.mioPut + " / " + x.suyoPut).padEnd(22) +
    "  " + (x.mioNeto / 1e6).toFixed(1) + "M / " + (x.suyoNeto / 1e6).toFixed(1) + "M");
}

// ═══ D. ¿SOBREVIVE EL SPOT A LA RUPTURA DEL 2026-07-16? ══════════════════════════════════
console.log("\n" + "═".repeat(96));
console.log("D. SPOT — cuantos pares simbolo-dia se quedan sin `asset_price` (ruptura del 2026-07-16)");
console.log("═".repeat(96));

let conSpot = 0, sinSpot = 0, conSpotPre = 0, sinSpotPre = 0;
const MUESTRA_D = [dias[2], dias[20], dias[40], dias[55], dias[70], dias[82]];
for (const d of MUESTRA_D) {
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR, d + ".jsonl.gz"))).toString("utf8").trim();
  if (!txt) continue;
  const lim = d + CORTE;
  const porT = new Map();
  for (const l of txt.split("\n")) {
    const f = JSON.parse(l);
    const o = parseOCC(f.symbol);
    if (!o || !universo.has(o.raiz)) continue;
    let a = porT.get(o.raiz);
    if (!a) { a = { ops: 0, spots: 0, opsPre: 0, spotsPre: 0 }; porT.set(o.raiz, a); }
    a.ops++; if (f.asset_price != null && f.asset_price > 0) a.spots++;
    if (f.timestamp < lim) { a.opsPre++; if (f.asset_price != null && f.asset_price > 0) a.spotsPre++; }
  }
  let cs = 0, ss = 0, csp = 0, ssp = 0;
  for (const [, a] of porT) {
    if (a.spots > 0) cs++; else ss++;
    if (a.opsPre >= 15) { if (a.spotsPre > 0) csp++; else ssp++; }
  }
  conSpot += cs; sinSpot += ss; conSpotPre += csp; sinSpotPre += ssp;
  console.log("  " + d + "   tickers " + String(porT.size).padStart(4) + "   con spot " + String(cs).padStart(4) + "   sin spot " + String(ss).padStart(3) +
    "   |  con >=15 ops antes de las 12:00: con spot " + String(csp).padStart(4) + " / sin " + String(ssp).padStart(3));
}
console.log("\n  TOTAL muestra: con spot " + conSpot + " · sin spot " + sinSpot + "  (" + (sinSpot / (conSpot + sinSpot) * 100).toFixed(2) + "% perdidos)");
console.log("  Con el filtro de >=15 ops antes del corte: con spot " + conSpotPre + " · sin spot " + sinSpotPre +
  "  (" + (sinSpotPre / (conSpotPre + sinSpotPre) * 100).toFixed(2) + "% perdidos)");

fs.writeFileSync(path.join("scripts", "marketsnack", "ladder-1-salida.json"), JSON.stringify({
  generado: new Date().toISOString(),
  gammaNulosPct: gNulos / muestra.length, gammaCerosPct: gCeros / muestra.length,
  coberturaOI: gOiF / gOi, discrepanciaOI: gDif / gPares,
  validacion: { n: totCmp, callWall2pct: okCall / totCmp, putWall2pct: okPut / totCmp, mismoSigno: okSigno / totCmp },
  spot: { conSpot, sinSpot, conSpotPre, sinSpotPre },
}, null, 1));
console.log("\nresumen guardado en scripts/marketsnack/ladder-1-salida.json");
