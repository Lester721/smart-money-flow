// ═══════════════════════════════════════════════════════════════════════════════════════════
// MUROS-MS · PASO 2 — LA RECETA DE MARKETSNACK
//
// El paso 1 dejó una cosa CERRADA: el max_pain de MS coincide con el nuestro 12 de 12, EXACTO.
// Nuestro max_pain se calcula con el OI de la cadena 0DTE de SPXW (la foto de la mañana = cierre
// de ayer). Si coincide exacto en 12 días con valores entre 7410 y 7675 y granularidad de 5
// puntos, MS está usando EL MISMO INTERÉS ABIERTO Y EL MISMO VENCIMIENTO. No es casualidad.
//
// Entonces la diferencia en los MUROS no es de datos: es de RECETA (ponderación, hora, plazo).
// Este script busca la receta probando una rejilla y puntuando por aciertos EXACTOS contra MS.
//
// Si se encuentra la receta → podemos emular su herramienta con 1.122 días en vez de 19.
// Si no → se dice qué recetas se probaron y cuánto se acercó la mejor.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/msmuros-2-receta.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import zlib from "node:zlib";

const DIR = "scripts/cache-theta/gex-2026";
const MSF = "scripts/cache-theta/marketsnack/aux/gex/2026-08-19/SPX.json.gz";
const SALIDA = "scripts/msmuros-2-salida.json";

const phi = (x) => 0.3989422804014327 * Math.exp((-x * x) / 2);
function gammaBS(S, K, t, v) {
  const st = v * Math.sqrt(t);
  if (!(st > 0) || !(S > 0) || !(K > 0)) return 0;
  const d1 = (Math.log(S / K) + (v * v / 2) * t) / st;
  const g = phi(d1) / (S * st);
  return Number.isFinite(g) ? g : 0;
}
function columnas(cab, pedidas, f) {
  const c = cab.split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = {}; const faltan = [];
  for (const p of pedidas) { const i = c.indexOf(p); if (i < 0) faltan.push(p); idx[p] = i; }
  if (faltan.length) throw new Error(f + ": faltan columnas [" + faltan.join(",") + "]");
  return idx;
}

// ── MS ─────────────────────────────────────────────────────────────────────────────────────
const ms = JSON.parse(zlib.gunzipSync(readFileSync(MSF)).toString("utf8"))["1m"].data
  .map((d) => ({ ...d, fecha: d.t.slice(0, 10) }));

// ── nuestra cadena 0DTE por día: IV/precio por strike a cada hora + OI ─────────────────────
function leerDia(fecha) {
  const out = { C: new Map(), P: new Map(), oiC: new Map(), oiP: new Map(), camino: new Map() };
  for (const [r, m] of [["C", out.C], ["P", out.P]]) {
    const f = DIR + "/iv_" + fecha + "_" + r + ".csv";
    if (!existsSync(f)) return null;
    const lin = readFileSync(f, "utf8").split("\n");
    if (lin.length < 3) return null;
    const I = columnas(lin[0], ["strike", "timestamp", "bid", "ask", "implied_vol", "underlying_price"], f);
    for (let j = 1; j < lin.length; j++) {
      const l = lin[j]; if (l.length < 20) continue;
      const c = l.split(",");
      const ts = c[I.timestamp]; if (ts.length < 16) continue;
      const h = ts.slice(11, 16);
      const sp = +c[I.underlying_price];
      if (sp > 0 && !out.camino.has(h)) out.camino.set(h, sp);
      const K = +c[I.strike];
      if (!m.has(K)) m.set(K, new Map());
      m.get(K).set(h, { bid: +c[I.bid], ask: +c[I.ask], iv: +c[I.implied_vol] });
    }
  }
  const fo = DIR + "/oi_" + fecha + ".csv";
  if (!existsSync(fo)) return null;
  const lin = readFileSync(fo, "utf8").split("\n");
  const I = columnas(lin[0], ["strike", "right", "timestamp", "open_interest"], fo);
  for (let j = 1; j < lin.length; j++) {
    const l = lin[j]; if (l.length < 10) continue;
    const c = l.split(",");
    const ts = c[I.timestamp];
    if (ts.slice(0, 10) !== fecha) continue;
    if (ts.slice(11, 16) >= "09:30") continue;
    const v = +c[I.open_interest]; if (!(v > 0)) continue;
    (c[I.right].replace(/"/g, "") === "CALL" ? out.oiC : out.oiP).set(+c[I.strike], v);
  }
  return out;
}

// ── la rejilla de recetas ──────────────────────────────────────────────────────────────────
const HORAS = ["09:35", "12:00", "15:00", "15:55", "16:00"];
const PLAZOS = [
  ["Treal", null],                 // lo que queda hasta las 16:00 de hoy
  ["T1d", 1 / 365],
  ["T7d", 7 / 365],
  ["T30d", 30 / 365],
];
const PESOS = [
  ["oi", (g, oi, S) => oi],                          // interés abierto puro, sin gamma
  ["g_oi", (g, oi, S) => g * oi],
  ["g_oi_S", (g, oi, S) => g * oi * 100 * S],        // $ por punto
  ["g_oi_S2", (g, oi, S) => g * oi * 100 * S * S * 0.01], // $ por 1%
];
const BANDAS = [0.01, 0.02, 0.05, 0.10];

const dias = ms.map((d) => d.fecha);
const cache = {};
for (const f of dias) { const d = leerDia(f); if (d) cache[f] = d; }
console.log("dias de MS: " + dias.length + "   con cadena 0DTE nuestra: " + Object.keys(cache).length);
console.log("dias medibles: " + Object.keys(cache).join(" "));

const argmax = (m) => { let k = null, v = -Infinity; for (const [a, b] of m) if (b > v) { v = b; k = a; } return v > 0 ? k : null; };

const resultados = [];
for (const hora of HORAS) {
  for (const [nomT, tFijo] of PLAZOS) {
    for (const [nomP, peso] of PESOS) {
      if (nomP === "oi" && (hora !== HORAS[0] || nomT !== PLAZOS[0][0])) continue; // OI puro no depende de hora/plazo
      for (const banda of BANDAS) {
        let okCall = 0, okPut = 0, okMag = 0, n = 0;
        let eCall = 0, ePut = 0, eMag = 0;
        for (const fecha of dias) {
          const d = cache[fecha]; if (!d) continue;
          const m = ms.find((x) => x.fecha === fecha);
          const S = d.camino.get(hora) ?? d.camino.get("16:00") ?? d.camino.get("09:35");
          if (!(S > 0)) continue;
          const hh = +hora.slice(0, 2) + (+hora.slice(3)) / 60;
          const t = tFijo ?? Math.max((16 - hh) / 24 / 365, 1e-6);
          const wC = new Map(), wP = new Map(), wT = new Map();
          const ks = new Set([...d.oiC.keys(), ...d.oiP.keys()]);
          for (const K of ks) {
            if (Math.abs(K - S) / S > banda) continue;
            const fc = d.C.get(K)?.get(hora), fp = d.P.get(K)?.get(hora);
            const ivC = fc && fc.iv > 0.02 && fc.iv < 3 ? fc.iv : null;
            const ivP = fp && fp.iv > 0.02 && fp.iv < 3 ? fp.iv : null;
            const gC = nomP === "oi" ? 1 : (ivC !== null ? gammaBS(S, K, t, ivC) : 0);
            const gP = nomP === "oi" ? 1 : (ivP !== null ? gammaBS(S, K, t, ivP) : 0);
            const vC = peso(gC, d.oiC.get(K) || 0, S);
            const vP = peso(gP, d.oiP.get(K) || 0, S);
            if (vC > 0) wC.set(K, vC);
            if (vP > 0) wP.set(K, vP);
            if (vC + vP > 0) wT.set(K, vC + vP);
          }
          const cw = argmax(wC), pw = argmax(wP), mg = argmax(wT);
          if (cw == null || pw == null || mg == null) continue;
          n++;
          if (cw === m.call_wall) okCall++;
          if (pw === m.put_wall) okPut++;
          if (mg === m.magnet) okMag++;
          eCall += Math.abs(cw - m.call_wall); ePut += Math.abs(pw - m.put_wall); eMag += Math.abs(mg - m.magnet);
        }
        if (!n) continue;
        resultados.push({
          receta: hora + "|" + nomT + "|" + nomP + "|b" + (banda * 100) + "%",
          n, call: okCall, put: okPut, mag: okMag, total: okCall + okPut + okMag,
          eCall: +(eCall / n).toFixed(1), ePut: +(ePut / n).toFixed(1), eMag: +(eMag / n).toFixed(1),
          eTotal: +((eCall + ePut + eMag) / (3 * n)).toFixed(1),
        });
      }
    }
  }
}

resultados.sort((a, b) => b.total - a.total || a.eTotal - b.eTotal);
console.log("\n" + "═".repeat(100));
console.log("RECETAS ORDENADAS POR ACIERTOS EXACTOS  (call+put+magnet, sobre n dias cada uno)");
console.log("═".repeat(100));
console.log("receta".padEnd(34) + "n".padStart(4) + "call".padStart(6) + "put".padStart(6) + "magnet".padStart(8) + "TOTAL".padStart(7) + "  |dif| medio  call/put/mag");
for (const r of resultados.slice(0, 25)) {
  console.log(r.receta.padEnd(34) + String(r.n).padStart(4) + String(r.call).padStart(6) + String(r.put).padStart(6) + String(r.mag).padStart(8) + String(r.total).padStart(7) + "      " + r.eCall.toFixed(1).padStart(6) + r.ePut.toFixed(1).padStart(8) + r.eMag.toFixed(1).padStart(8));
}
console.log("\n(el techo posible es 3×n = " + 3 * (resultados[0]?.n ?? 0) + ")");

// ── la mejor receta, día a día ─────────────────────────────────────────────────────────────
console.log("\nMEJOR RECETA día a día: " + resultados[0].receta);
writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), diasMS: dias.length, diasMedibles: Object.keys(cache).length, resultados: resultados.slice(0, 40) }, null, 1));
console.log("escrito " + SALIDA);
