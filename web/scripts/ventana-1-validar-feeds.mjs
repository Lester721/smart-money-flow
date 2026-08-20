// VALIDACIÓN 1 — ¿son comparables la cotización de MarketSnack y la cadena EOD de ThetaData?
//
// Si voy a entrar al ASK que trae el propio print de MS y salir al BID de la cadena EOD de Theta,
// estoy cruzando dos feeds. La trampa ya conocida ("no cruzar series de feeds distintos") obliga a
// comprobarlo ANTES: cojo los prints de los ÚLTIMOS MINUTOS de sesión y comparo su bid/ask con el
// bid/ask EOD del MISMO contrato el MISMO día. Si los dos feeds miden lo mismo, tienen que coincidir.
//
// Además: ¿cuál es el filtro de supervivencia del archivo de MS? Mínimo de expiración por día.

import { diasFlujo, leerDia, parseOCC, eod, pct } from "./ventana-lib.mjs";
import { readdirSync } from "node:fs";

const NIVEL = process.argv[2] || "100k";
const CDIR = "scripts/cache-theta/cadenas";
const conCadena = new Set(readdirSync(CDIR).filter((f) => /_d\d{8}\.json$/.test(f)).map((f) => f.split("_d")[0]));

const difBid = [], difAsk = [], difMid = [];
let n = 0, ausentes = 0, sinCad = 0;
const ejemplos = [];

for (const dia of diasFlujo(NIVEL)) {
  const dc = dia.replace(/-/g, "");
  for (const o of leerDia(dia, NIVEL)) {
    const p = parseOCC(o.symbol);
    if (!p || !conCadena.has(p.raiz)) continue;
    const hhmm = o.timestamp.slice(11, 16);
    if (hhmm < "19:45" || hhmm > "20:00") continue;       // últimos 15 min de sesión (UTC, EDT)
    if (!(o.bid_price > 0) || !(o.ask_price > 0)) continue;
    const q = eod(p.raiz, dc, p.exp, p.tipo, p.strike);
    if (!q) { sinCad++; continue; }
    if (q.ausente) { ausentes++; continue; }
    n++;
    difBid.push((q.bid - o.bid_price) / o.bid_price);
    difAsk.push((q.ask - o.ask_price) / o.ask_price);
    const mMs = (o.bid_price + o.ask_price) / 2, mTh = (q.bid + q.ask) / 2;
    difMid.push((mTh - mMs) / mMs);
    if (ejemplos.length < 6) ejemplos.push({ sym: o.symbol, hhmm, ms: [o.bid_price, o.ask_price], theta: [q.bid, q.ask] });
  }
}

console.log(`\n## Validación de feeds — prints de 19:45–20:00 UTC vs cadena EOD del mismo día`);
console.log(`nivel ${NIVEL} · n comparables = ${n} · contrato ausente de la cadena = ${ausentes} · sin cadena del día = ${sinCad}\n`);
for (const e of ejemplos) console.log(`  ${e.sym} ${e.hhmm}  MS ${e.ms[0]}/${e.ms[1]}   Theta EOD ${e.theta[0]}/${e.theta[1]}`);

const linea = (nom, v) => console.log(`  ${nom.padEnd(6)} p10 ${(100 * pct(v, 0.1)).toFixed(2)}%  p25 ${(100 * pct(v, 0.25)).toFixed(2)}%  MEDIANA ${(100 * pct(v, 0.5)).toFixed(2)}%  p75 ${(100 * pct(v, 0.75)).toFixed(2)}%  p90 ${(100 * pct(v, 0.9)).toFixed(2)}%  |  |dif|<2% en ${(100 * v.filter((x) => Math.abs(x) < 0.02).length / v.length).toFixed(1)}%`);
console.log(`\n### Diferencia relativa Theta_EOD vs MS (mismo contrato, últimos 15 min)`);
if (n > 20) { linea("bid", difBid); linea("ask", difAsk); linea("medio", difMid); }
else console.log("  muestra insuficiente");

// ── El filtro de supervivencia ─────────────────────────────────────────────────────────────
console.log(`\n### Filtro de supervivencia del archivo de MarketSnack`);
const minExpPorDia = [];
for (const dia of diasFlujo(NIVEL)) {
  const ops = leerDia(dia, NIVEL);
  let min = null;
  for (const o of ops) { const p = parseOCC(o.symbol); if (p && (min === null || p.exp < min)) min = p.exp; }
  if (min) minExpPorDia.push({ dia, min, n: ops.length });
}
const distintos = new Set(minExpPorDia.map((x) => x.min));
console.log(`  días con datos: ${minExpPorDia.length} · valores distintos de min(expiración): ${[...distintos].sort().join(", ")}`);
console.log(`  → en los ${minExpPorDia.length} días NO existe ni una sola operación sobre un contrato que expirase antes del ${[...distintos].sort()[0]}`);
console.log(`  → la descarga se hizo el 2026-08-19: el archivo sólo conserva contratos VIVOS ese día.`);
