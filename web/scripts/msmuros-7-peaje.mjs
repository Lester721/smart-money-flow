// ═══════════════════════════════════════════════════════════════════════════════════════════
// MUROS-MS · PASO 7 — EL PEAJE DE LA VERTICAL 0DTE, MEDIDO
//
// La regla pierde. Antes de firmar, hay que decir CUÁNTO tendría que acertar para no perder, y
// eso es el peaje: lo que se deja en la horquilla al entrar y al salir. Se mide sobre las MISMAS
// operaciones del paso 6, comparando el precio real (ask al comprar, bid al vender) contra el
// punto medio — que NO se usa para operar, sólo para medir el peaje.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/msmuros-7-peaje.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const NIV = "scripts/gex-niveles.json";
const CAM = "scripts/msmuros-5-camino.json";
const ANCHO = 25, THETA = 0.10, HORA0 = "09:40", HORAF = "15:55";

function columnas(cab, pedidas, f) {
  const c = cab.split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = {}; const faltan = [];
  for (const p of pedidas) { const i = c.indexOf(p); if (i < 0) faltan.push(p); idx[p] = i; }
  if (faltan.length) throw new Error(f + ": faltan columnas");
  return idx;
}
function leerQuotes(fecha) {
  const f = DIR + "/iv_" + fecha + "_C.csv";
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  if (lin.length < 3) return null;
  const I = columnas(lin[0], ["strike", "timestamp", "bid", "ask"], f);
  const q = new Map();
  for (let j = 1; j < lin.length; j++) {
    const l = lin[j]; if (l.length < 20) continue;
    const c = l.split(",");
    const ts = c[I.timestamp]; if (ts.length < 16) continue;
    const b = +c[I.bid], a = +c[I.ask];
    if (a > 0 && a >= b) q.set(+c[I.strike] + "|" + ts.slice(11, 16), [b, a]);
  }
  return q;
}
const media = (v) => v.reduce((s, x) => s + x, 0) / (v.length || 1);
const p50 = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const N = JSON.parse(readFileSync(NIV, "utf8"));
const camino = JSON.parse(readFileSync(CAM, "utf8"));

const ev = [];
for (const fila of N.filas) {
  const c0 = camino[fila.fecha]; if (!c0) continue;
  const cam = c0.filter(([h, s]) => h >= HORA0 && h <= HORAF && s > 0);
  if (cam.length < 40) continue;
  const S0 = fila.apertura, tol = (S0 * THETA) / 100;
  const niv = fila.niveles.gam; if (!niv) continue;
  for (const [ln, dir] of [["put", -1], ["call", +1]]) {
    const muro = ln === "put" ? niv.muroPut : niv.muroCall;
    const iman = niv.imanBruto;
    if (muro == null || iman == null) continue;
    if (ln === "put" && !(S0 > muro && iman > muro)) continue;
    if (ln === "call" && !(S0 < muro && iman < muro)) continue;
    let i1 = -1;
    for (let i = 0; i < cam.length; i++) { const s = cam[i][1]; if (ln === "put" ? s <= muro + tol : s >= muro - tol) { i1 = i; break; } }
    if (i1 < 0 || i1 >= cam.length - 3) continue;
    ev.push({ fecha: fila.fecha, h: cam[i1][0], S: cam[i1][1], dir });
  }
}
const porFecha = new Map();
for (const e of ev) { if (!porFecha.has(e.fecha)) porFecha.set(e.fecha, []); porFecha.get(e.fecha).push(e); }

const peajes = [], costesMid = [], costesReal = [], anchoPata = [];
for (const [fecha, evs] of porFecha) {
  const q = leerQuotes(fecha); if (!q) continue;
  for (const e of evs) {
    const K1 = Math.round(e.S / 5) * 5, K2 = K1 + ANCHO;
    const a = q.get(K1 + "|" + e.h), b = q.get(K2 + "|" + e.h);
    if (!a || !b) continue;
    const midA = (a[0] + a[1]) / 2, midB = (b[0] + b[1]) / 2;
    const midSpread = midA - midB;
    if (!(midSpread > 0.05)) continue;
    const real = e.dir > 0 ? a[1] - b[0] : a[0] - b[1];      // pagar / cobrar de verdad
    const peajeEntrada = Math.abs(real - midSpread);
    peajes.push((2 * peajeEntrada / midSpread) * 100);        // ida y vuelta, % del precio medio
    costesMid.push(midSpread * 100);
    costesReal.push(Math.abs(real) * 100);
    anchoPata.push(((a[1] - a[0]) / midA) * 100);
  }
}
const r = {
  n: peajes.length,
  peajeIdaVueltaPctMedio: +media(peajes).toFixed(1),
  peajeIdaVueltaPctMediana: +p50(peajes).toFixed(1),
  costeMedioMid: +media(costesMid).toFixed(0),
  costeMedioReal: +media(costesReal).toFixed(0),
  peajeDolaresIdaVuelta: +(2 * media(costesReal.map((x, i) => Math.abs(x - costesMid[i])))).toFixed(0),
  horquillaPataPct: +media(anchoPata).toFixed(1),
};
console.log("PEAJE DE LA VERTICAL SPXW 0DTE DE " + ANCHO + " PUNTOS  (n=" + r.n + " entradas reales de la regla)");
console.log("  horquilla de UNA pata (ask−bid / medio):        " + r.horquillaPataPct + "%");
console.log("  precio medio de la vertical al punto medio:     $" + r.costeMedioMid);
console.log("  precio real (ask/bid) de la misma vertical:     $" + r.costeMedioReal);
console.log("  PEAJE ida y vuelta:                             " + r.peajeIdaVueltaPctMedio + "% del precio  (mediana " + r.peajeIdaVueltaPctMediana + "%)  ≈ $" + r.peajeDolaresIdaVuelta + " por operación");
// cuánto hay que acertar: con un objetivo simétrico, cada acierto gana G y cada fallo pierde G,
// más el peaje P en las dos. acierto mínimo p tal que p·G − (1−p)·G − P = 0 → p = (1 + P/G)/2
const G = media(costesMid) * 0.6;   // recorrido típico hasta objetivo/stop en $ (60% del precio de la vertical)
console.log("\n  con un objetivo y un stop simétricos, para EMPATAR hace falta acertar");
console.log("  p = (1 + peaje/ganancia)/2 ; con ganancia ≈ $" + G.toFixed(0) + " y peaje $" + r.peajeDolaresIdaVuelta + "  →  " + (((1 + r.peajeDolaresIdaVuelta / G) / 2) * 100).toFixed(1) + "% de aciertos");
console.log("  la regla acierta el 58,7% y el azar-hora el 57,3% (paso 6).");
writeFileSync("scripts/msmuros-7-salida.json", JSON.stringify({ generado: new Date().toISOString(), ...r, aciertoParaEmpatar: +(((1 + r.peajeDolaresIdaVuelta / G) / 2) * 100).toFixed(1) }, null, 1));
