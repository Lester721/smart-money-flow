// Backtest de ESTRATEGIA (el embudo) — ETAPA 1: venta de prima CON red (credit spread).
// Señal = dirección neta del flujo por día (a favor). Vende prima FUERA del movimiento esperado
// (short en ±1σ y ±1.5σ del cono), en 3/5/7/30/60/90 días. Sostiene a vencimiento.
// Precios modelados con Black-Scholes (IV ≈ volatilidad realizada 20d — sin smile histórico).
// Etapas 2-4 (naked, debit, 0DTE, filtro Eva/Victor) se añaden después.
// Uso: node --env-file=.env.local --import tsx scripts/backtest-strategy.ts

import { writeFileSync } from "node:fs";
import { fetchFlow } from "../lib/massiveFlow";
import { classifyFlow, type FlowRow } from "../lib/flow";
import { bsPrice } from "../lib/blackScholes";
import { fetchDailyBars } from "../lib/massive";

const TICKERS = (process.env.BT_TICKERS || "AAPL,MSFT,NVDA,AMZN,GOOGL,META,TSLA,AMD,NFLX,QQQ,SPY,HOOD").split(",").map((t) => t.trim()).filter(Boolean);
const DAYS = Number(process.env.BT_DAYS) || 180;
const MIN_PREMIUM = Number(process.env.BT_MIN_PREMIUM) || 1_000_000;
const OUT = process.env.BT_OUT || "scripts/backtest-strategy-reporte.md";
const DTES = [3, 5, 7, 30, 60, 90];
const SIGMAS = [1, 1.5];
const WIDTH_EM = 0.5; // ancho del spread = 0.5σ (pata protectora más OTM)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DBar { time: string; close: number }
function dateStr(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }
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

interface Signal { entryIdx: number; spot: number; rv: number; dir: 1 | -1 }

// Agrupa el flujo por DÍA y saca la dirección neta (a favor del dinero).
function signals(rows: FlowRow[], bars: DBar[]): Signal[] {
  const byDay = new Map<string, number>(); // fecha -> neto de premium con signo
  for (const r of rows) {
    const d = r.timestamp.slice(0, 10);
    const s = r.sentiment === "bullish" ? 1 : r.sentiment === "bearish" ? -1 : 0;
    if (s !== 0) byDay.set(d, (byDay.get(d) ?? 0) + s * r.premium);
  }
  const out: Signal[] = [];
  for (const [d, net] of byDay) {
    if (net === 0) continue;
    const entryIdx = barIdxOnOrBefore(bars, Date.parse(`${d}T20:00:00Z`));
    if (entryIdx < 20 || entryIdx >= bars.length - 1) continue;
    const rv = realizedVol(bars, entryIdx);
    if (rv == null || !(rv > 0)) continue;
    out.push({ entryIdx, spot: bars[entryIdx].close, rv, dir: net > 0 ? 1 : -1 });
  }
  return out;
}

// P&L de un credit spread a favor de la dirección, sostenido a vencimiento. Retorno sobre riesgo.
function creditSpreadPnl(sig: Signal, bars: DBar[], dte: number, sigmaMult: number): number | null {
  const { spot, rv, entryIdx, dir } = sig;
  const T = dte / 365;
  const em = spot * rv * Math.sqrt(dte / 365);
  if (!(em > 0)) return null;
  const bull = dir === 1;
  // bull → vende put spread abajo; bear → vende call spread arriba (a favor).
  const shortK = bull ? spot - sigmaMult * em : spot + sigmaMult * em;
  const longK = bull ? shortK - WIDTH_EM * em : shortK + WIDTH_EM * em;
  if (shortK <= 0 || longK <= 0) return null;
  const type = bull ? "put" : "call";
  const credit = bsPrice(spot, shortK, T, rv, type) - bsPrice(spot, longK, T, rv, type);
  const width = Math.abs(shortK - longK);
  if (!(credit > 0) || !(width > 0)) return null;
  // vencimiento
  const expMs = Date.parse(`${bars[entryIdx].time}T20:00:00Z`) + dte * 86_400_000;
  const expIdx = barIdxOnOrAfter(bars, expMs);
  if (expIdx < 0) return null; // aún no vence en los datos
  const sExp = bars[expIdx].close;
  const shortIntr = bull ? Math.max(shortK - sExp, 0) : Math.max(sExp - shortK, 0);
  const longIntr = bull ? Math.max(longK - sExp, 0) : Math.max(sExp - longK, 0);
  const pnl = credit - (shortIntr - longIntr); // $ por spread
  const risk = width - credit;
  return risk > 0 ? pnl / risk : pnl / width; // retorno sobre riesgo
}

interface Stat { n: number; win: number | null; mean: number | null; median: number | null }
function stat(v: number[]): Stat {
  if (v.length === 0) return { n: 0, win: null, mean: null, median: null };
  const s = [...v].sort((a, b) => a - b);
  return { n: s.length, win: Math.round((s.filter((x) => x > 0).length / s.length) * 100), mean: Math.round((s.reduce((a, x) => a + x, 0) / s.length) * 1000) / 10, median: Math.round(s[Math.floor(s.length / 2)] * 1000) / 10 };
}
const fmt = (s: Stat) => s.n === 0 ? "—" : `win ${s.win}% · media ${s.mean}% · mediana ${s.median}% (n=${s.n})`;

(async () => {
  console.log(`Estrategia ETAPA 1 (credit spread) · ${TICKERS.length} tickers · ${DAYS}d`);
  const all: { sig: Signal; bars: DBar[] }[] = [];
  for (const t of TICKERS) {
    try {
      const { trades } = await fetchFlow(t, { targetDays: DAYS, minPremium: MIN_PREMIUM, contractCap: 25, maxPages: 6 });
      const { rows } = classifyFlow(trades, new Date());
      let bars: DBar[] = [];
      for (let i = 0; i < 4; i++) { bars = (await fetchDailyBars(t, 400).catch(() => [])) as DBar[]; if (bars.length > 0) break; await sleep(800 * (i + 1)); }
      const sigs = bars.length ? signals(rows, bars) : [];
      for (const sig of sigs) all.push({ sig, bars });
      console.log(`[${t}] señales: ${sigs.length}`);
    } catch (e) { console.error(`[${t}] ERROR:`, (e as Error).message); }
    await sleep(2500);
  }

  const lines = [
    "# Backtest de estrategia — ETAPA 1: venta de prima CON red (credit spread)",
    "",
    `**Señales:** ${all.length} (dirección neta del flujo por día, a favor). Vende prima fuera del movimiento esperado, sostiene a vencimiento. Retorno = P&L / riesgo (max pérdida). BS con IV≈vol realizada 20d.`,
    "",
    "## Resultado por temporalidad y distancia (retorno sobre riesgo)",
    "| DTE | Short a 1σ | Short a 1.5σ |",
    "|---|---|---|",
  ];
  for (const dte of DTES) {
    const cells = SIGMAS.map((sm) => {
      const pnls = all.map(({ sig, bars }) => creditSpreadPnl(sig, bars, dte, sm)).filter((x): x is number => x != null);
      return fmt(stat(pnls));
    });
    lines.push(`| ${dte}d | ${cells[0]} | ${cells[1]} |`);
  }
  lines.push(
    "",
    "**Cómo leerlo:** vender prima gana seguido (win alto) pero cada pérdida es grande (por eso mira la MEDIA de retorno-sobre-riesgo, no solo el win%). Una temporalidad/distancia con media positiva y win alto es candidata.",
    "",
    "## Caveats (ETAPA 1)",
    "- Solo credit spread aún (naked, debit, 0DTE vienen en etapas 2-3).",
    "- Ancho del spread = 0.5σ. Sostiene a vencimiento (sin gestión).",
    "- IV = vol realizada 20d (aprox; sin smile). Vencimiento por calendario. Sin comisiones.",
    "- Dirección = flujo neto del día (misma para Eva y Victor; el filtro de fuerza es etapa 4).",
  );
  const report = lines.join("\n") + "\n";
  writeFileSync(OUT, report, "utf8");
  console.log("\n" + report);
  console.log(`=== reporte en ${OUT} ===`);
})();
