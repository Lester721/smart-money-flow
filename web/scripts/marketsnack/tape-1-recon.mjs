// PANEL FLOW-TAPE · PASO 1 — RECONOCIMIENTO. Mirar el fichero ANTES de medir con él.
// No mide ninguna hipótesis: cuenta qué hay, con qué cobertura, y si la cinta tiene la
// densidad necesaria para hablar de "ritmo", "rachas" y "aceleración".
// Uso: node --import tsx scripts/marketsnack/tape-1-recon.mjs

import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
// La raíz se DEDUCE (scripts/raiz.mjs): escrita a mano se rompe al renombrar la carpeta.
import { RAIZ } from "../raiz.mjs";

const DIR = path.join(RAIZ, "scripts/cache-theta/marketsnack/flujo-100k");
const CHART = path.join(RAIZ, "scripts/cache-theta/marketsnack/aux/chart-all");

function parseOcc(s) {
  if (!s || s.length < 16) return null;
  const k = s.slice(-8), tp = s.slice(-9, -8), fe = s.slice(-15, -9), u = s.slice(0, -15);
  return /^\d{8}$/.test(k) && /^[CP]$/.test(tp) && /^\d{6}$/.test(fe) && u ? { u, tipo: tp } : null;
}
const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

// ── qué símbolos tienen serie de precio (el vehículo) ─────────────────────────────────────
const conPrecio = new Set();
for (const f of fs.readdirSync(CHART)) {
  let j; try { j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CHART, f))).toString("utf8")); } catch { continue; }
  if (j?.data?.length >= 100) conPrecio.add(f.replace(".json.gz", ""));
}
const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).sort().map((f) => f.slice(0, 10));
console.log(`═══ FLOW TAPE · PASO 1 · RECONOCIMIENTO ═══`);
console.log(`   ${dias.length} ficheros-día (${dias[0]} → ${dias.at(-1)}) · ${conPrecio.size} símbolos con serie de precio\n`);

const lados = new Map(), condiciones = new Map(), sentimientos = new Map();
let total = 0, sinOcc = 0, sinPrecioSim = 0, askMalo = 0, tsFuera = 0, apNulo = 0;
const opsPorTD = [], opsPorTDconPrecio = [];
const horaHist = new Array(24).fill(0);
const porDiaSim = new Map();
const primaPorRaiz = new Map();

for (const dia of dias) {
  const buf = zlib.gunzipSync(fs.readFileSync(path.join(DIR, `${dia}.jsonl.gz`))).toString("utf8");
  const cuenta = new Map();
  for (const l of buf.split("\n")) {
    if (!l) continue;
    let t; try { t = JSON.parse(l); } catch { continue; }
    total++;
    lados.set(t.side, (lados.get(t.side) ?? 0) + 1);
    sentimientos.set(t.sentiment, (sentimientos.get(t.sentiment) ?? 0) + 1);
    condiciones.set(t.trade_condition_id, (condiciones.get(t.trade_condition_id) ?? 0) + 1);
    if (t.asset_price == null) apNulo++;
    const occ = parseOcc(t.symbol ?? "");
    if (!occ) { sinOcc++; continue; }
    primaPorRaiz.set(occ.u, (primaPorRaiz.get(occ.u) ?? 0) + (t.premium || 0));
    if (!t.timestamp) { tsFuera++; continue; }
    const h = +t.timestamp.slice(11, 13) + (+t.timestamp.slice(14, 16)) / 60;
    horaHist[Math.floor(h)]++;
    if (!(t.ask_price > 0) || t.bid_price > t.ask_price) askMalo++;
    if (!conPrecio.has(occ.u)) { sinPrecioSim++; continue; }
    cuenta.set(occ.u, (cuenta.get(occ.u) ?? 0) + 1);
  }
  porDiaSim.set(dia, cuenta.size);
  for (const [, n] of cuenta) opsPorTDconPrecio.push(n);
}

console.log(`── censo bruto ──`);
console.log(`   ${total.toLocaleString("es-ES")} operaciones · sin OCC parseable ${sinOcc} · sin timestamp ${tsFuera}`);
console.log(`   asset_price nulo: ${apNulo} (${((apNulo / total) * 100).toFixed(1)}%)`);
console.log(`   ask_price=0 o cruzada: ${askMalo} (${((askMalo / total) * 100).toFixed(4)}%)`);
console.log(`   subyacente SIN serie de precio: ${sinPrecioSim} (${((sinPrecioSim / total) * 100).toFixed(1)}%) ← estos NO pueden entrar\n`);

console.log(`── el campo "side" (base de la dirección de la cinta) ──`);
for (const [k, v] of [...lados].sort((a, b) => b[1] - a[1])) console.log(`   ${String(k).padEnd(14)} ${String(v).padStart(9)}  ${((v / total) * 100).toFixed(1)}%`);
console.log(`\n── el campo "sentiment" ──`);
for (const [k, v] of [...sentimientos].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`   ${String(k).padEnd(14)} ${String(v).padStart(9)}  ${((v / total) * 100).toFixed(1)}%`);

console.log(`\n── prima por raíz: los que NO tienen precio ──`);
const sinP = [...primaPorRaiz].filter(([u]) => !conPrecio.has(u)).sort((a, b) => b[1] - a[1]);
const primaTotal = [...primaPorRaiz.values()].reduce((a, b) => a + b, 0);
const primaSinP = sinP.reduce((a, b) => a + b[1], 0);
console.log(`   ${((primaSinP / primaTotal) * 100).toFixed(1)}% de la prima total es de subyacentes sin serie de precio`);
console.log(`   los mayores: ${sinP.slice(0, 8).map(([u, p]) => `${u} $${(p / 1e9).toFixed(1)}B`).join("  ")}`);

console.log(`\n── reloj (hora UTC de llegada; 13:30 = apertura, 20:00 = cierre ET) ──`);
for (let h = 12; h <= 23; h++) if (horaHist[h]) console.log(`   ${String(h).padStart(2)}h UTC (${String(h - 4).padStart(2)}h ET)  ${String(horaHist[h]).padStart(8)}  ${"█".repeat(Math.round((horaHist[h] / Math.max(...horaHist)) * 40))}`);

console.log(`\n── densidad de la cinta: operaciones por (símbolo, día) con precio ──`);
console.log(`   n=${opsPorTDconPrecio.length.toLocaleString("es-ES")} pares · p50 ${pct(opsPorTDconPrecio, 0.5)} · p75 ${pct(opsPorTDconPrecio, 0.75)} · p90 ${pct(opsPorTDconPrecio, 0.9)} · p99 ${pct(opsPorTDconPrecio, 0.99)} · max ${Math.max(...opsPorTDconPrecio)}`);
for (const min of [20, 30, 50, 100, 200]) {
  const q = opsPorTDconPrecio.filter((x) => x >= min).length;
  console.log(`   con ≥${String(min).padStart(3)} ops: ${String(q).padStart(6)} pares (${(q / dias.length).toFixed(1)} símbolos/día de media)`);
}
console.log(`\n   símbolos con ops/día (cualquier cantidad): p50 ${pct([...porDiaSim.values()], 0.5)} por día`);
