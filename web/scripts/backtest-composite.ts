// Chequeo de confianza v3 — COMPUESTO del scorecard (categorías por-flujo) medido en P&L real.
//
// Combina las 3 categorías backtesteables históricamente + un proxy de la 4ta, ponderadas por
// los pesos del scorecard de Victor, y mide el P&L de comprar el contrato del flujo por tier:
//   · Agresividad (peso 20) = executionScore(nivel de ejecución ask/bid).
//   · Convicción  (peso 20) = spreadScore (liquidez del spread bid/ask).
//   · Inusualidad (peso 20) = unusualTradeScore.total (6 sub-señales de griegas/tamaño).
//   · Contexto IV (peso 10) = PROXY: IV de entrada vs volatilidad realizada del subyacente.
// (Estructura y Confirmación de Precio NO entran: la 1ra necesita cadena histórica que no tenemos;
//  la 2da es el resultado mismo. Ver forward-test.)
//
// Estos son PROXIES por-flujo de categorías que en la app son agregados por-ticker: aproximación.
// Uso: node --env-file=.env.local --import tsx scripts/backtest-composite.ts
// Config: BT_TICKERS, BT_DAYS, BT_MIN_PREMIUM, BT_HOLD, BT_OUT.

import { writeFileSync } from "node:fs";
import { fetchFlow } from "../lib/massiveFlow";
import {
  classifyFlow, unusualTradeScore, executionLevel, executionScore, spreadScore, spreadPct,
  type FlowRow,
} from "../lib/flow";
import { impliedVol } from "../lib/blackScholes";
// ⛔ resultado NO válido: valora con modelo. Ver PRECIO-TEORICO-NO-USAR-PARA-RESULTADOS.ts
import { bsPriceHistorico as bsPrice } from "../lib/PRECIO-TEORICO-NO-USAR-PARA-RESULTADOS";
import { fetchDailyBars } from "../lib/massive";

const TICKERS = (process.env.BT_TICKERS || "AAPL,NVDA,QQQ").split(",").map((t) => t.trim()).filter(Boolean);
const DAYS = Number(process.env.BT_DAYS) || 180;
const MIN_PREMIUM = Number(process.env.BT_MIN_PREMIUM) || 1_000_000;
const HOLD = Number(process.env.BT_HOLD) || 10;
const OUT = process.env.BT_OUT || "scripts/backtest-composite-reporte.md";
const YEAR_MS = 365 * 24 * 3600 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DBar { time: string; close: number }
const barMs = (b: DBar) => Date.parse(`${b.time}T20:00:00Z`);

interface Row { pnl: number; aggr: number; conv: number; unus: number; ivp: number }

function barIdxAt(bars: DBar[], ms: number): number {
  let idx = -1;
  for (let i = 0; i < bars.length; i++) {
    if (Date.parse(`${bars[i].time}T00:00:00Z`) <= ms) idx = i; else break;
  }
  return idx;
}

/** Volatilidad realizada anualizada sobre `lookback` sesiones antes de la entrada. */
function realizedVol(bars: DBar[], entryIdx: number, lookback = 20): number | null {
  const start = Math.max(1, entryIdx - lookback);
  const rets: number[] = [];
  for (let i = start; i <= entryIdx; i++) {
    if (bars[i - 1].close > 0 && bars[i].close > 0) rets.push(Math.log(bars[i].close / bars[i - 1].close));
  }
  if (rets.length < 5) return null;
  const m = rets.reduce((s, x) => s + x, 0) / rets.length;
  const v = rets.reduce((s, x) => s + (x - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}

/** Proxy de Contexto IV (0-10): IV de la opción vs volatilidad realizada. Barata puntúa alto. */
function ivProxyScore(iv: number, rv: number | null): number {
  if (rv == null || !(rv > 0)) return 5; // neutral sin dato
  const ratio = iv / rv;
  if (ratio < 0.9) return 10;
  if (ratio <= 1.2) return 7;
  if (ratio <= 1.6) return 4;
  return 0;
}

function scoreRow(r: FlowRow, bars: DBar[]): Row | null {
  if (r.type === "unknown" || r.strike == null || !r.expiration || !(r.price > 0)) return null;
  const entryMs = Date.parse(r.timestamp);
  const expMs = Date.parse(`${r.expiration}T20:00:00Z`);
  const entryIdx = barIdxAt(bars, entryMs);
  if (entryIdx < 0) return null;
  const isCall = r.type === "call";
  const type = isCall ? "call" : "put";
  const sEntry = bars[entryIdx].close;
  const tEntry = (expMs - barMs(bars[entryIdx])) / YEAR_MS;
  if (tEntry <= 0) return null;
  const ivEntry = impliedVol(r.price, sEntry, r.strike, tEntry, type);
  if (ivEntry == null || !(ivEntry > 0)) return null;

  const expIdx = barIdxAt(bars, expMs);
  const cap = expIdx >= 0 ? Math.min(entryIdx + HOLD, expIdx) : entryIdx + HOLD;
  if (cap >= bars.length) return null;
  const exitBar = bars[cap];
  const tExit = (expMs - barMs(exitBar)) / YEAR_MS;
  const exitVal = tExit <= 0
    ? Math.max(isCall ? exitBar.close - r.strike : r.strike - exitBar.close, 0)
    : bsPrice(exitBar.close, r.strike, tExit, ivEntry, type);
  const pnl = exitVal / r.price - 1;

  // Componentes del scorecard (0-10 cada uno)
  const aggr = executionScore(executionLevel(r.price, r.bid, r.ask, r.side));
  const conv = spreadScore(spreadPct(r.bid, r.ask));
  const unus = unusualTradeScore(r).total;
  const ivp = ivProxyScore(ivEntry, realizedVol(bars, entryIdx));
  return { pnl, aggr, conv, unus, ivp };
}

async function forTicker(ticker: string): Promise<Row[]> {
  const { trades } = await fetchFlow(ticker, {
    targetDays: DAYS, minPremium: MIN_PREMIUM, contractCap: 25, maxPages: 6,
  });
  const { rows } = classifyFlow(trades, new Date());
  let bars: DBar[] = [];
  for (let i = 0; i < 4; i++) {
    bars = (await fetchDailyBars(ticker, 400).catch(() => [])) as DBar[];
    if (bars.length > 0) break;
    await sleep(800 * (i + 1));
  }
  const out: Row[] = [];
  for (const r of rows) {
    const s = scoreRow(r, bars);
    if (s) out.push(s);
  }
  return out;
}

interface Stat { n: number; win: number | null; mean: number | null; median: number | null }
function stat(items: Row[]): Stat {
  if (items.length === 0) return { n: 0, win: null, mean: null, median: null };
  const pnls = items.map((o) => o.pnl).sort((a, b) => a - b);
  const win = Math.round((items.filter((o) => o.pnl > 0).length / items.length) * 100);
  const mean = pnls.reduce((s, x) => s + x, 0) / pnls.length;
  return {
    n: items.length, win,
    mean: Math.round(mean * 1000) / 10,
    median: Math.round(pnls[Math.floor(pnls.length / 2)] * 1000) / 10,
  };
}
const fmt = (s: Stat) => s.n === 0 ? "—" : `win ${s.win}% · media ${s.mean}% · mediana ${s.median}% (n=${s.n})`;

(async () => {
  console.log(`Backtest COMPUESTO v3 · tickers=${TICKERS.join(",")} · días=${DAYS} · hold=${HOLD} · minPremium=$${(MIN_PREMIUM / 1e6).toFixed(1)}M`);
  const all: Row[] = [];
  for (const t of TICKERS) {
    try {
      const s = await forTicker(t);
      all.push(...s);
      console.log(`[${t}] resueltos=${s.length}`);
    } catch (e) {
      console.error(`[${t}] ERROR:`, (e as Error).message);
    }
    await sleep(2500);
  }

  // Barrido de PESOS alternativos sobre el compuesto de 4 componentes [aggr, conv, unus, ivp].
  const composite = (r: Row, w: number[]) => {
    const s = w[0] + w[1] + w[2] + w[3];
    return (w[0] * r.aggr + w[1] * r.conv + w[2] * r.unus + w[3] * r.ivp) / s;
  };
  // OJO: solo son 4 de las 6 categorías de Victor (faltan Estructura 15 y Confirmación 15,
  // no medibles hacia atrás). "Ratio Victor" = su proporción 20:20:20:10 SOLO entre estos 4,
  // renormalizada — NO es su ponderación real de 6 categorías. Esa se valida en el forward-test.
  const WEIGHT_SETS: { name: string; w: number[] }[] = [
    { name: "Ratio Victor entre los 4 (20:20:20:10)", w: [2, 2, 2, 1] },
    { name: "Igual 1/1/1/1", w: [1, 1, 1, 1] },
    { name: "IV-heavy (baja Inus)", w: [2, 2, 1, 4] },
    { name: "Costo/riesgo (Conv+IV)", w: [1, 3, 1, 3] },
    { name: "Sin Inusualidad", w: [2, 2, 0, 2] },
    { name: "Solo Contexto IV", w: [0, 0, 0, 1] },
    { name: "Solo Convicción", w: [0, 1, 0, 0] },
  ];
  const sweepLines = WEIGHT_SETS.map(({ name, w }) => {
    const hi = stat(all.filter((r) => composite(r, w) >= 7));
    const lo = stat(all.filter((r) => composite(r, w) < 5));
    const sep = hi.mean != null && lo.mean != null ? (hi.mean - lo.mean).toFixed(1) : "—";
    return `- **${name}** — alto≥7: ${fmt(hi)} · bajo<5: ${fmt(lo)} · separación: ${sep} pts`;
  });
  // Cada componente solo (alto ≥7 vs bajo <7) para ver cuál manda
  const comp = (key: keyof Row) => ({
    hi: stat(all.filter((r) => (r[key] as number) >= 7)),
    lo: stat(all.filter((r) => (r[key] as number) < 7)),
  });
  const A = comp("aggr"), C = comp("conv"), U = comp("unus"), I = comp("ivp");

  const lines = [
    "# Chequeo de confianza v3 — COMPUESTO del scorecard (P&L real)",
    "",
    `**Modelo:** comprar el contrato del flujo (calls y puts, long), sostener ${HOLD} sesiones, salida Black-Scholes. Compuesto ponderado por los pesos del scorecard: Agresividad 20 + Convicción 20 + Inusualidad 20 + Contexto IV 10 (proxy).`,
    "",
    `**Muestra:** ${TICKERS.join(", ")} · ${DAYS}d · prima ≥ $${(MIN_PREMIUM / 1e6).toFixed(1)}M · **${all.length} flujos resueltos**.`,
    "",
    "## Pesos alternativos: ¿qué ponderación separa mejor? (alto ≥7 vs bajo <5)",
    ...sweepLines,
    "",
    "**Separación = media(alto) − media(bajo). Más alta = esa ponderación distingue mejor ganadores de perdedores. NOTA: solo son 4 de las 6 categorías de Victor (faltan Estructura e Confirmación); el 'ratio Victor' es su proporción entre estos 4, no su ponderación real de 6.**",
    "",
    "## Cada componente por separado (¿cuál manda?)",
    `- Agresividad — alta: ${fmt(A.hi)} | baja: ${fmt(A.lo)}`,
    `- Convicción (spread) — alta: ${fmt(C.hi)} | baja: ${fmt(C.lo)}`,
    `- Inusualidad — alta: ${fmt(U.hi)} | baja: ${fmt(U.lo)}`,
    `- Contexto IV (proxy) — alta: ${fmt(I.hi)} | baja: ${fmt(I.lo)}`,
    "",
    "## Caveats",
    "- **Proxies por-flujo** de categorías que en la app son agregados por-ticker: aproximación, no idéntico al scorecard en vivo.",
    "- **Estructura (GEX) NO entra** — necesita cadena histórica que Massive no da. Requiere forward-test.",
    "- **Long-only, IV constante, horizonte fijo, sin stops.** El P&L de opciones long es asimétrico → mira win% y mediana, no solo la media.",
    "- Tiers con n chico son ruido: exige n grande antes de confiar.",
  ];
  const report = lines.join("\n") + "\n";
  writeFileSync(OUT, report, "utf8");
  console.log("\n" + report);
  console.log(`=== reporte escrito en ${OUT} ===`);
})();
