// Chequeo de confianza v2 — P&L REAL de la opción (no solo dirección) + COMPUESTO del scorecard.
//
// Dos mejoras sobre el backtest de dirección:
//  1. Mide el P&L de COMPRAR el contrato del flujo y sostenerlo BT_HOLD sesiones (o hasta vencer),
//     valorando la salida con Black-Scholes (bsPrice) — captura theta, apalancamiento y convexidad.
//  2. Agrupa por el COMPUESTO: cruza unusualTradeScore.total (suma de 6 params de Victor) con el
//     agresor (ask/bid). Prueba la hipótesis de Lester: "todas las señales juntas" > cada una sola.
//
// Modelo (con sus supuestos honestos):
//  · Entry = precio real del trade (row.price). Long-only (imita al que compró).
//  · Exit  = min(entry + BT_HOLD sesiones, vencimiento). Valor de salida por BS con la IV de entrada
//            (IV constante = simplificación) o intrínseco si ya venció.
//  · Solo cuenta flujos con barras suficientes adelante (los recientes no resuelven).
//
// Uso: node --env-file=.env.local --import tsx scripts/backtest-pnl.ts
// Config: BT_TICKERS, BT_DAYS, BT_MIN_PREMIUM, BT_HOLD (sesiones), BT_OUT.

import { writeFileSync } from "node:fs";
import { fetchFlow } from "../lib/massiveFlow";
import { classifyFlow, unusualTradeScore, UNUSUAL_TRADE_THRESHOLD, type FlowRow } from "../lib/flow";
import { impliedVol } from "../lib/blackScholes";
// ⛔ resultado NO válido: valora con modelo. Ver PRECIO-TEORICO-NO-USAR-PARA-RESULTADOS.ts
import { bsPriceHistorico as bsPrice } from "../lib/PRECIO-TEORICO-NO-USAR-PARA-RESULTADOS";
import { fetchDailyBars } from "../lib/massive";

const TICKERS = (process.env.BT_TICKERS || "AAPL,NVDA,QQQ").split(",").map((t) => t.trim()).filter(Boolean);
const DAYS = Number(process.env.BT_DAYS) || 180;
const MIN_PREMIUM = Number(process.env.BT_MIN_PREMIUM) || 1_000_000;
const HOLD = Number(process.env.BT_HOLD) || 10;
const OUT = process.env.BT_OUT || "scripts/backtest-pnl-reporte.md";
const YEAR_MS = 365 * 24 * 3600 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DBar { time: string; close: number } // time = fecha "YYYY-MM-DD"

const barMs = (b: DBar) => Date.parse(`${b.time}T20:00:00Z`); // cierre ~16:00 ET

interface Outcome {
  pnl: number;          // retorno de la opción (long), ej. 0.35 = +35%
  side: string;         // sentiment: bullish (ask) / bearish (bid) / neutral
  unusual: number;      // unusualTradeScore.total (0-10)
  premium: number;
}

/** Índice de la última barra cuyo DÍA es ≤ `ms`. Búsqueda lineal (pocas barras). */
function barIdxAt(bars: DBar[], ms: number): number {
  let idx = -1;
  for (let i = 0; i < bars.length; i++) {
    if (Date.parse(`${bars[i].time}T00:00:00Z`) <= ms) idx = i; else break;
  }
  return idx;
}

function pnlForRow(r: FlowRow, bars: DBar[]): number | null {
  if (r.type === "unknown" || r.strike == null || !r.expiration) return null;
  if (!(r.price > 0)) return null;
  const entryMs = Date.parse(r.timestamp);
  const expMs = Date.parse(`${r.expiration}T20:00:00Z`);
  const entryIdx = barIdxAt(bars, entryMs);
  if (entryIdx < 0) return null;
  const isCall = r.type === "call";
  const type = isCall ? "call" : "put";

  // IV de entrada: la que hace que BS iguale el precio REAL del trade, dado el subyacente del día.
  // (No usamos r.iv: solo se computa dentro de la cobertura de barras-minuto, ~34 días.)
  const sEntry = bars[entryIdx].close;
  const tEntry = (expMs - barMs(bars[entryIdx])) / YEAR_MS;
  if (tEntry <= 0) return null; // ya vencido a la entrada (no debería pasar)
  const ivEntry = impliedVol(r.price, sEntry, r.strike, tEntry, type);
  if (ivEntry == null || !(ivEntry > 0)) return null; // sin solución de IV (muy ITM / precio raro)

  const expIdx = barIdxAt(bars, expMs);
  // Salida: HOLD sesiones adelante, sin pasar del vencimiento.
  const cap = expIdx >= 0 ? Math.min(entryIdx + HOLD, expIdx) : entryIdx + HOLD;
  if (cap >= bars.length) return null; // aún no hay datos para resolverlo
  const exitBar = bars[cap];
  const sExit = exitBar.close;
  const tExit = (expMs - barMs(exitBar)) / YEAR_MS;
  const exitVal = tExit <= 0
    ? Math.max(isCall ? sExit - r.strike : r.strike - sExit, 0) // intrínseco al vencer
    : bsPrice(sExit, r.strike, tExit, ivEntry, type);
  return exitVal / r.price - 1;
}

async function forTicker(ticker: string): Promise<Outcome[]> {
  const { trades } = await fetchFlow(ticker, {
    targetDays: DAYS, minPremium: MIN_PREMIUM, contractCap: 25, maxPages: 6,
  });
  const { rows } = classifyFlow(trades, new Date());
  // Barras diarias con reintento: fetchDailyBars no reintenta y en horario de mercado el
  // throttle las devuelve vacías → 0 resueltos para todo el ticker (bug sutil, no del modelo).
  let bars: DBar[] = [];
  for (let i = 0; i < 4; i++) {
    bars = (await fetchDailyBars(ticker, 400).catch(() => [])) as DBar[];
    if (bars.length > 0) break;
    await sleep(800 * (i + 1));
  }
  const out: Outcome[] = [];
  for (const r of rows) {
    const pnl = pnlForRow(r, bars);
    if (pnl == null) continue;
    out.push({ pnl, side: r.sentiment, unusual: unusualTradeScore(r).total, premium: r.premium });
  }
  return out;
}

interface Stat { n: number; win: number | null; mean: number | null; median: number | null }
function stat(items: Outcome[]): Stat {
  if (items.length === 0) return { n: 0, win: null, mean: null, median: null };
  const pnls = items.map((o) => o.pnl).sort((a, b) => a - b);
  const win = Math.round((items.filter((o) => o.pnl > 0).length / items.length) * 100);
  const mean = pnls.reduce((s, x) => s + x, 0) / pnls.length;
  const median = pnls[Math.floor(pnls.length / 2)];
  return { n: items.length, win, mean: Math.round(mean * 1000) / 10, median: Math.round(median * 1000) / 10 };
}
const fmt = (s: Stat) => s.n === 0 ? "—" : `win ${s.win}% · media ${s.mean}% · mediana ${s.median}% (n=${s.n})`;

(async () => {
  console.log(`Backtest P&L v2 · tickers=${TICKERS.join(",")} · días=${DAYS} · hold=${HOLD} sesiones · minPremium=$${(MIN_PREMIUM / 1e6).toFixed(1)}M`);
  const all: Outcome[] = [];
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

  const ask = all.filter((o) => o.side === "bullish");
  const bid = all.filter((o) => o.side === "bearish");
  const hi = all.filter((o) => o.unusual >= UNUSUAL_TRADE_THRESHOLD);
  const lo = all.filter((o) => o.unusual < UNUSUAL_TRADE_THRESHOLD);
  // EL CRUCE (hipótesis "todas juntas"): agresor ask × compuesto alto.
  const askHi = all.filter((o) => o.side === "bullish" && o.unusual >= UNUSUAL_TRADE_THRESHOLD);
  const askLo = all.filter((o) => o.side === "bullish" && o.unusual < UNUSUAL_TRADE_THRESHOLD);
  const bidHi = all.filter((o) => o.side === "bearish" && o.unusual >= UNUSUAL_TRADE_THRESHOLD);

  const lines = [
    "# Chequeo de confianza v2 — P&L real + compuesto",
    "",
    `**Modelo:** comprar el contrato del flujo (long), sostener ${HOLD} sesiones o hasta vencer, salida por Black-Scholes (IV de entrada). Long-only, IV constante, cierre diario — supuestos simplificadores.`,
    "",
    `**Muestra:** ${TICKERS.join(", ")} · ${DAYS}d · prima ≥ $${(MIN_PREMIUM / 1e6).toFixed(1)}M · **${all.length} flujos resueltos**.`,
    "",
    "## Global",
    `- Todos los flujos (long): ${fmt(stat(all))}`,
    "",
    "## Por agresor",
    `- **Compra al ask** (imitar al comprador): ${fmt(stat(ask))}`,
    `- Venta al bid (fadear al vendedor comprando): ${fmt(stat(bid))}`,
    "",
    "## Por compuesto (unusualTradeScore, suma de 6 params)",
    `- Compuesto ALTO (≥${UNUSUAL_TRADE_THRESHOLD}): ${fmt(stat(hi))}`,
    `- Compuesto bajo (<${UNUSUAL_TRADE_THRESHOLD}): ${fmt(stat(lo))}`,
    "",
    "## EL CRUCE — «todas juntas» (agresor × compuesto)",
    `- **ask + compuesto ALTO**: ${fmt(stat(askHi))}`,
    `- ask + compuesto bajo: ${fmt(stat(askLo))}`,
    `- bid + compuesto alto: ${fmt(stat(bidHi))}`,
    "",
    "## Cómo leerlo",
    "Si «ask + compuesto ALTO» supera claramente a las demás celdas, la CONFLUENCIA sí agrega valor (las señales juntas dicen algo que solas no). Si es parecido o peor, el compuesto no rescata a las partes.",
    "",
    "## Caveats",
    "- **Long-only, IV constante**: no modela venta de opciones ni cambios de IV (una caída de IV puede volver perdedor un acierto direccional).",
    "- **Salida a horizonte fijo** (no stop ni toma de ganancia): un trader real gestiona la posición.",
    "- **Skew**: el P&L de opciones long es asimétrico (pocos aciertos grandes). Por eso se reporta media Y mediana Y win-rate — la mediana y el win% son más honestos que la media.",
    "- **Cobertura**: solo flujos con barras suficientes adelante; el flujo más reciente (TSLA/QQQ) puede no resolver.",
  ];
  const report = lines.join("\n") + "\n";
  writeFileSync(OUT, report, "utf8");
  console.log("\n" + report);
  console.log(`=== reporte escrito en ${OUT} ===`);
})();
