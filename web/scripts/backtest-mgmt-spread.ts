// BACKTEST DE GESTIÓN — para CREDIT SPREADS (no para opciones compradas).
//
// Por qué existe: el backtest de gestión que ya teníamos (backtest-management.ts) es LONG-only,
// y ahí cortar temprano EMPEORA (matas los jackpots). En credit spreads el perfil es al REVÉS:
// ganas poco muchas veces y pierdes mucho pocas veces. Los números en vivo del 5d lo gritan:
// win 65% pero media -14% → cada perdedor pierde ~5x lo que gana un ganador.
// Este script prueba si reglas de salida (tomar ganancia / cortar pérdida) arreglan eso.
//
// NO BAJA DATOS: lee la caché que dejó backtest-strategy.ts (scripts/cache-theta/*.json) →
// puede correr en paralelo con otro backtest sin robarle peticiones al Theta Terminal.
//
// Uso: node --import tsx scripts/backtest-mgmt-spread.ts

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { bsPrice } from "../lib/blackScholes";
import { executionLevel, executionScore, spreadScore, spreadPct, unusualTradeScore, type FlowRow } from "../lib/flow";
import { impliedVol } from "../lib/blackScholes";

const CACHE_DIR = process.env.BT_CACHE_DIR || "scripts/cache-theta";
const OUT = process.env.BT_OUT || "scripts/backtest-mgmt-spread-reporte.md";
const CELLS = [5, 60, 90];         // plazos a evaluar
const SIGMA = 1;                    // strike corto a 1σ (la celda validada)
const WIDTH_EM = 0.5;               // ancho del spread en σ
const YR = 365 * 24 * 3600 * 1000;

interface DBar { time: string; close: number }

// ── Helpers (mismos que el backtest principal, para que los números sean comparables) ─────────
function barIdxOnOrAfter(bars: DBar[], ms: number): number {
  for (let i = 0; i < bars.length; i++) if (Date.parse(`${bars[i].time}T20:00:00Z`) >= ms) return i;
  return -1;
}
function barIdxOnOrBefore(bars: DBar[], ms: number): number {
  let idx = -1;
  for (let i = 0; i < bars.length; i++) { if (Date.parse(`${bars[i].time}T00:00:00Z`) <= ms) idx = i; else break; }
  return idx;
}
function realizedVol(bars: DBar[], endIdx: number, lookback = 20): number | null {
  const start = Math.max(1, endIdx - lookback);
  const rets: number[] = [];
  for (let i = start; i <= endIdx; i++) if (bars[i - 1].close > 0 && bars[i].close > 0) rets.push(Math.log(bars[i].close / bars[i - 1].close));
  if (rets.length < 5) return null;
  const m = rets.reduce((s, x) => s + x, 0) / rets.length;
  const v = rets.reduce((s, x) => s + (x - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}
function ivProxyScore(iv: number, rv: number | null): number {
  if (rv == null || !(rv > 0)) return 5;
  const r = iv / rv;
  return r < 0.9 ? 10 : r <= 1.2 ? 7 : r <= 1.6 ? 4 : 0;
}

interface Signal { entryIdx: number; spot: number; rv: number; dir: 1 | -1; evaComp: number; entryMs: number }
function signals(rows: FlowRow[], bars: DBar[]): Signal[] {
  const byDay = new Map<string, FlowRow[]>();
  for (const r of rows) {
    const d = r.timestamp.slice(0, 10);
    const a = byDay.get(d); if (a) a.push(r); else byDay.set(d, [r]);
  }
  const out: Signal[] = [];
  for (const [d, dayRows] of byDay) {
    const entryIdx = barIdxOnOrBefore(bars, Date.parse(`${d}T20:00:00Z`));
    if (entryIdx < 20 || entryIdx >= bars.length - 1) continue;
    const rv = realizedVol(bars, entryIdx);
    if (rv == null || !(rv > 0)) continue;
    const spot = bars[entryIdx].close;
    let net = 0, totP = 0, aA = 0, aC = 0, aU = 0, aI = 0;
    for (const r of dayRows) {
      const s = r.sentiment === "bullish" ? 1 : r.sentiment === "bearish" ? -1 : 0;
      if (s !== 0) net += s * r.premium;
      if (r.strike == null || !r.expiration || !(r.price > 0)) continue;
      const T = (Date.parse(`${r.expiration}T20:00:00Z`) - Date.parse(`${d}T20:00:00Z`)) / YR;
      if (T <= 0) continue;
      const iv = impliedVol(r.price, spot, r.strike, T, r.type === "call" ? "call" : "put");
      if (iv == null || !(iv > 0)) continue;
      aA += executionScore(executionLevel(r.price, r.bid, r.ask, r.side)) * r.premium;
      aC += spreadScore(spreadPct(r.bid, r.ask)) * r.premium;
      aU += unusualTradeScore(r).total * r.premium;
      aI += ivProxyScore(iv, rv) * r.premium;
      totP += r.premium;
    }
    if (net === 0 || totP <= 0) continue;
    const wa = aA / totP, wc = aC / totP, wu = aU / totP, wi = aI / totP;
    const evaComp = ((wc / 10) * 30 + (wu / 10) * 20 + (wi / 10) * 15 + (wa / 10) * 10) / 75 * 100;
    out.push({ entryIdx, spot, rv, dir: net > 0 ? 1 : -1, evaComp, entryMs: Date.parse(`${d}T20:00:00Z`) });
  }
  return out;
}

// ── Reglas de gestión ────────────────────────────────────────────────────────────────────────
// tp: cerrar cuando la ganancia alcanza tp × crédito recibido (0.5 = "me llevo el 50% de la prima")
// sl: cerrar cuando la pérdida alcanza sl × crédito recibido (2 = "pierdo el doble de lo que cobré")
interface Rule { name: string; tp: number | null; sl: number | null }
const RULES: Rule[] = [
  { name: "Sostener a vencimiento (baseline)", tp: null, sl: null },
  { name: "Tomar ganancia 25%", tp: 0.25, sl: null },
  { name: "Tomar ganancia 50%", tp: 0.50, sl: null },
  { name: "Tomar ganancia 75%", tp: 0.75, sl: null },
  { name: "Stop a 1× el crédito", tp: null, sl: 1 },
  { name: "Stop a 2× el crédito", tp: null, sl: 2 },
  { name: "TG 50% + stop 2×", tp: 0.50, sl: 2 },
  { name: "TG 50% + stop 1×", tp: 0.50, sl: 1 },
  { name: "TG 25% + stop 1×", tp: 0.25, sl: 1 },
];

/**
 * Camina el spread día a día y aplica la regla. Modela el valor con Black-Scholes (mismo
 * método que el backtest principal), así que NO necesita datos nuevos.
 * Devuelve el retorno sobre el riesgo máximo, o null si no se puede evaluar.
 */
function walkSpread(sig: Signal, bars: DBar[], dte: number, rule: Rule): number | null {
  const { spot, rv, entryIdx, dir } = sig;
  const em = spot * rv * Math.sqrt(dte / 365);
  if (!(em > 0)) return null;
  const bull = dir === 1;
  const type = bull ? "put" : "call";
  const shortK = bull ? spot - SIGMA * em : spot + SIGMA * em;
  const longK = bull ? shortK - WIDTH_EM * em : shortK + WIDTH_EM * em;
  if (shortK <= 0 || longK <= 0) return null;

  const credit = bsPrice(spot, shortK, dte / 365, rv, type) - bsPrice(spot, longK, dte / 365, rv, type);
  const width = Math.abs(shortK - longK);
  if (!(credit > 0) || !(width > 0)) return null;
  const risk = width - credit;
  if (!(risk > 0)) return null;

  const entryMs = Date.parse(`${bars[entryIdx].time}T20:00:00Z`);
  const expMs = entryMs + dte * 86_400_000;
  const expIdx = barIdxOnOrAfter(bars, expMs);
  if (expIdx < 0) return null; // aún no vence dentro de los datos

  // Camina cada día hábil hasta el vencimiento.
  for (let i = entryIdx + 1; i <= expIdx; i++) {
    const s = bars[i].close;
    const tMs = Date.parse(`${bars[i].time}T20:00:00Z`);
    const Trem = Math.max((expMs - tMs) / YR, 1 / 365 / 24); // nunca 0 (evita NaN)
    const val = bsPrice(s, shortK, Trem, rv, type) - bsPrice(s, longK, Trem, rv, type);
    const pnl = credit - val; // vendimos en `credit`, recomprar cuesta `val`
    if (rule.tp != null && pnl >= rule.tp * credit) return (pnl / risk) * 100;
    if (rule.sl != null && pnl <= -rule.sl * credit) return (pnl / risk) * 100;
  }
  // Sin gatillo → liquidar a vencimiento por valor intrínseco.
  const sExp = bars[expIdx].close;
  const shortIntr = bull ? Math.max(shortK - sExp, 0) : Math.max(sExp - shortK, 0);
  const longIntr = bull ? Math.max(longK - sExp, 0) : Math.max(sExp - longK, 0);
  return ((credit - (shortIntr - longIntr)) / risk) * 100;
}

// ── Estadística ──────────────────────────────────────────────────────────────────────────────
interface Stat { n: number; win: number | null; mean: number | null; median: number | null; peor: number | null }
function stat(v: number[]): Stat {
  if (!v.length) return { n: 0, win: null, mean: null, median: null, peor: null };
  const s = [...v].sort((a, b) => a - b);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    n: s.length,
    win: Math.round((s.filter((x) => x > 0).length / s.length) * 100),
    mean: r1(s.reduce((a, x) => a + x, 0) / s.length),
    median: r1(s[Math.floor(s.length / 2)]),
    peor: r1(s[0]),
  };
}
const fmt = (s: Stat) => s.n === 0 ? "—" : `win ${s.win}% · media ${s.mean}% · mediana ${s.median}% · peor ${s.peor}%`;

// ── Main ─────────────────────────────────────────────────────────────────────────────────────
(async () => {
  // Lee TODA la caché disponible (formato por ventana: {rows, bars}).
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json") && !f.includes("_y_") && !f.includes("_bars_"));
  if (!files.length) { console.error(`Sin caché en ${CACHE_DIR}. Corre antes backtest-strategy.ts con DATA_PROVIDER=theta.`); process.exit(1); }

  const all: { sig: Signal; bars: DBar[] }[] = [];
  for (const f of files) {
    try {
      const c: { rows: FlowRow[]; bars: DBar[] } = JSON.parse(readFileSync(`${CACHE_DIR}/${f}`, "utf8"));
      if (!c.rows?.length || !c.bars?.length) continue;
      for (const s of signals(c.rows, c.bars)) all.push({ sig: s, bars: c.bars });
      console.log(`[${f.split("_")[0]}] ${c.rows.length} flujos → señales acumuladas: ${all.length}`);
    } catch { /* archivo ilegible → siguiente */ }
  }
  if (!all.length) { console.error("Sin señales."); process.exit(1); }

  const L: string[] = [
    "# Backtest de GESTIÓN — credit spreads (tomar ganancia / cortar pérdida)",
    "",
    `**Muestra:** ${all.length} señales de la caché (${files.length} tickers). Short a ${SIGMA}σ, ancho ${WIDTH_EM}σ, filtro **Top⅓ de convicción EVA**.`,
    "",
    "**Por qué este test:** en credit spreads ganas poco muchas veces y pierdes mucho pocas veces.",
    "En vivo, el 5d va **win 65% pero media −14%** → cada perdedor pierde ~5× lo que gana un ganador.",
    "La pregunta: ¿una regla de salida arregla eso, o solo mata los ganadores?",
    "",
    "_TG = tomar ganancia (% del crédito cobrado) · Stop = pérdida máxima en múltiplos del crédito._",
    "",
  ];

  for (const dte of CELLS) {
    // Umbral Top⅓ por convicción, calculado sobre las señales evaluables de esta celda.
    const evaluables = all.filter(({ sig, bars }) => walkSpread(sig, bars, dte, RULES[0]) != null);
    if (evaluables.length < 30) { L.push(`## ${dte} días`, "", "_Muestra insuficiente._", ""); continue; }
    const cut = [...evaluables.map((x) => x.sig.evaComp)].sort((a, b) => a - b)[Math.floor(evaluables.length * 2 / 3)];
    const top = evaluables.filter((x) => x.sig.evaComp >= cut);

    L.push(`## ${dte} días @ ${SIGMA}σ — Top⅓ EVA (n≈${top.length})`, "",
      "| Regla de salida | Resultado |", "|---|---|");
    for (const rule of RULES) {
      const vals = top.map(({ sig, bars }) => walkSpread(sig, bars, dte, rule)).filter((x): x is number => x != null);
      L.push(`| ${rule.name} | ${fmt(stat(vals))} |`);
    }
    L.push("");
  }

  L.push(
    "## Cómo leerlo",
    "",
    "Compara cada regla contra el **baseline** (sostener a vencimiento):",
    "- Si una regla sube la **media**, la gestión agrega expectativa → vale cablearla.",
    "- Mira también **peor**: es la peor operación del conjunto. Un stop debería mejorarla mucho;",
    "  si no la mejora, el stop no está funcionando como creemos.",
    "- Cuidado con el espejismo: tomar ganancia temprano **sube el win%** casi siempre, pero puede",
    "  **bajar la media** (cierras ganadores chicos y dejas correr los perdedores). La media manda.",
    "",
    "## Caveats",
    "- Granularidad DIARIA: los gatillos se evalúan al CIERRE de cada día → en vivo saltarían antes",
    "  (y a veces peor, por gaps de apertura).",
    "- Valor del spread modelado con Black-Scholes e **IV constante** = la vol realizada de entrada.",
    "  No modela expansión de IV, que es justo lo que agranda las pérdidas en la vida real →",
    "  **las pérdidas aquí están probablemente SUBESTIMADAS**.",
    "- Sin comisiones ni slippage en las salidas anticipadas (cada cierre extra tiene su costo real).",
    "",
  );

  const report = L.join("\n") + "\n";
  writeFileSync(OUT, report, "utf8");
  console.log("\n" + report);
  console.log(`=== reporte en ${OUT} ===`);
})();
