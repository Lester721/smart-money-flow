// RADIOGRAFÍA DE LOS CAMPOS DE MARKETSNACK — ¿cuáles sirven para construir señales y cuáles son
// derivados de otros?
//
// Se mide sobre el fichero YA CACHEADO (93 MB, 178.445 operaciones con prima ≥ $1M, del
// 2026-04-15 al 2026-08-12), no sobre una página suelta: un campo puede parecer vivo en 50 filas
// y estar muerto en la muestra entera.
//
// Además se comprueba UNA A UNA la sospecha de que cierto campo es derivado de otros. Un campo
// derivado no aporta información nueva: medirlo como si fuera independiente es contarse la misma
// prueba dos veces y bajar el listón de la t sin darse cuenta.
//
// Uso: node scripts/marketsnack/radiografia-campos.mjs [muestra]

import fs from "node:fs";
import rl from "node:readline";
import { radiografia } from "../../lib/radiografia.ts";

const FLUJO = "data/marketsnack/flujo-prima1000k.jsonl";
const MUESTRA = Number(process.argv[2] || 60000);

const filas = [];
for await (const l of rl.createInterface({ input: fs.createReadStream(FLUJO) })) {
  if (!l.trim()) continue;
  let t; try { t = JSON.parse(l); } catch { continue; }
  filas.push(t);
  if (filas.length >= MUESTRA) break;
}
console.log(`═══ RADIOGRAFÍA DE LOS CAMPOS · ${filas.length} operaciones del caché ═══`);
const dias = [...new Set(filas.map((t) => t.timestamp?.slice(0, 10)))].sort();
console.log(`   días cubiertos: ${dias.length}  ·  ${dias[0]} → ${dias[dias.length - 1]}\n`);

// ── 1 · campos numéricos crudos ─────────────────────────────────────────────
const NUM = ["premium", "price", "size", "volume", "open_interest", "bid_price", "ask_price",
             "bid_size", "ask_size", "asset_price", "delta", "gamma", "theta", "vega",
             "implied_volatility", "break_even", "break_even_percentage", "score",
             "exchange_id", "trade_condition_id"];
try { radiografia(filas, NUM, "campos crudos de flow_feed"); }
catch (e) { console.log(String(e.message)); }

// ── 2 · categóricos ─────────────────────────────────────────────────────────
console.log(`── campos categóricos ──`);
for (const c of ["side", "sentiment"]) {
  const cuenta = {};
  for (const t of filas) cuenta[t[c] ?? "(nulo)"] = (cuenta[t[c] ?? "(nulo)"] ?? 0) + 1;
  console.log(`  ${c.padEnd(10)} ${Object.entries(cuenta).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${((v / filas.length) * 100).toFixed(1)}%`).join("  ")}`);
}
const conds = {};
for (const t of filas) conds[t.trade_condition_id] = (conds[t.trade_condition_id] ?? 0) + 1;
console.log(`  condición  ${Object.entries(conds).sort((a, b) => b[1] - a[1]).slice(0, 8)
  .map(([k, v]) => `${k}=${((v / filas.length) * 100).toFixed(1)}%`).join("  ")}`);

// ── 3 · ¿QUÉ CAMPOS SON DERIVADOS DE OTROS? ─────────────────────────────────
// Se comprueba la identidad exacta, no una correlación. Si se cumple en >99% de las filas, el
// campo NO es información nueva.
console.log(`\n── ¿derivados? (identidad comprobada fila a fila) ──`);
const P = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const pruebas = [
  ["premium = price × size × 100", (t) => Math.abs(t.premium - t.price * t.size * 100) < Math.max(1, t.premium * 0.001)],
  ["break_even = strike ± price", (t) => { const m = P.exec(t.symbol); if (!m) return null;
      const k = +m[4] / 1000; const be = m[3] === "C" ? k + t.price : k - t.price;
      return Math.abs(t.break_even - be) < Math.max(0.02, Math.abs(be) * 0.002); }],
  ["break_even_% = |be/asset_price − 1|", (t) => Math.abs(Math.abs(t.break_even / t.asset_price - 1) - t.break_even_percentage) < 0.004],
  ["sentiment = f(side, call/put)", (t) => { const m = P.exec(t.symbol); if (!m) return null;
      const compra = ["ASKSIDE", "ABOVE_ASK", "AT_ASK"].includes(t.side);
      const venta = ["BIDSIDE", "BELOW_BID", "AT_BID"].includes(t.side);
      if (!compra && !venta) return t.sentiment === "neutral";
      const alcista = (m[3] === "C") === compra;
      return t.sentiment === (alcista ? "bullish" : "bearish"); }],
  ["side = f(price vs bid/ask)", (t) => { if (!(t.ask_price > 0) || !(t.bid_price > 0)) return null;
      const esp = t.price > t.ask_price ? "ABOVE_ASK" : t.price === t.ask_price ? "AT_ASK"
        : t.price < t.bid_price ? "BELOW_BID" : t.price === t.bid_price ? "AT_BID" : null;
      return esp === null ? null : t.side === esp; }],
];
for (const [nombre, f] of pruebas) {
  let ok = 0, no = 0, na = 0;
  for (const t of filas) { const r = f(t); if (r === null) na++; else if (r) ok++; else no++; }
  const pct = ok / Math.max(1, ok + no) * 100;
  console.log(`  ${pct >= 99 ? "DERIVADO " : pct >= 60 ? "parcial  " : "INDEPEND."} ${nombre.padEnd(38)} se cumple en ${pct.toFixed(1)}% (${ok} sí / ${no} no / ${na} n.a.)`);
}

// ── 4 · las 9 BANDERAS "unusual" de MarketSnack, reconstruidas ───────────────
// Salen de su propio bundle (función bp del JavaScript de la app). Se calculan EN EL CLIENTE a
// partir de campos que ya están en el caché: no hace falta bajar nada nuevo para usarlas.
console.log(`\n── las 9 banderas "unusual" de MarketSnack (calculadas en su cliente, no vienen en la API) ──`);
const banderas = {
  size: (t) => t.open_interest >= 1000 && t.size > t.open_interest * 2,
  premium: (t) => t.premium >= 900_000,
  price: (t) => t.price >= 100,
  volume: (t) => t.volume >= 2000,
  openInterest: (t) => t.open_interest >= 10_000,
  bidAsk: (t) => t.ask_price && t.bid_price && (t.ask_price - t.bid_price) / t.ask_price > 0.1,
  impliedVolatility: (t) => t.implied_volatility >= 0.5,
  delta: (t) => t.delta && Math.abs(t.delta) >= 0.9,
  breakEvenPct: (t) => t.break_even_percentage >= 0.2,
};
const conteo = {};
const nBanderas = [];
for (const t of filas) {
  let n = 0;
  for (const [k, f] of Object.entries(banderas)) { if (f(t)) { conteo[k] = (conteo[k] ?? 0) + 1; n++; } }
  nBanderas.push(n);
}
for (const [k] of Object.entries(banderas))
  console.log(`  ${k.padEnd(18)} se enciende en ${((conteo[k] ?? 0) / filas.length * 100).toFixed(2).padStart(6)}% de las operaciones` +
    ((conteo[k] ?? 0) / filas.length < 0.005 ? "   ⚠ casi nunca: no ordena nada" : ""));
const unusual = nBanderas.filter((n) => n >= 3).length;
console.log(`  ${"≥3 banderas (=Unusual)".padEnd(18)} ${(unusual / filas.length * 100).toFixed(2)}%  (${unusual} operaciones)`);
try { radiografia(nBanderas.map((n) => ({ n })), ["n"], "nº de banderas por operación", { maxCeros: 0.95 }); }
catch (e) { console.log(String(e.message).split("\n")[0]); }

// ── 5 · las etiquetas de la app (notas) ─────────────────────────────────────
const ML = new Set([232, 233, 234, 235, 246, 247]);
const SL = new Set([208, 209, 227, 228, 229, 230, 231, 236, 239, 243, 244, 245, 248]);
const SWEEP = new Set([219, 228, 230]);
let ml = 0, sl = 0, otro = 0, spec = 0, hedge = 0, sweep = 0;
for (const t of filas) {
  if (ML.has(t.trade_condition_id)) ml++; else if (SL.has(t.trade_condition_id)) sl++; else otro++;
  if (t.delta && Math.abs(t.delta) <= 0.1 && t.break_even_percentage >= 0.25) spec++;
  if (t.delta && Math.abs(t.delta) >= 0.95 && t.size >= 500) hedge++;
  if (SWEEP.has(t.trade_condition_id)) sweep++;
}
console.log(`\n── etiquetas de la app (todas derivadas de trade_condition_id / delta / size) ──`);
const pc = (x) => `${(x / filas.length * 100).toFixed(2)}%`;
console.log(`  multi-pata (ML)  ${pc(ml)}   ·  una pata (SL)  ${pc(sl)}   ·  otras  ${pc(otro)}`);
console.log(`  Speculative      ${pc(spec)}   ·  Hedge          ${pc(hedge)}   ·  Sweep  ${pc(sweep)}`);
