// Out-of-sample — parte los flujos por FECHA (mitad vieja vs mitad nueva) y verifica que los
// hallazgos aguantan en AMBOS períodos (no son sobreajuste de un régimen):
//   1. ¿Los pesos EVA rankean mejor que Victor en las dos mitades?
//   2. ¿El hold sin gestión le gana al take-profit en las dos mitades?
// Uso: node --env-file=.env.local --import tsx scripts/backtest-oos.ts

import { writeFileSync } from "node:fs";
import { fetchFlow } from "../lib/massiveFlow";
import {
  classifyFlow, unusualTradeScore, executionLevel, executionScore, spreadScore, spreadPct, type FlowRow,
} from "../lib/flow";
import { bsPrice, impliedVol } from "../lib/blackScholes";
import { fetchDailyBars } from "../lib/massive";

const TICKERS = (process.env.BT_TICKERS || "AAPL,MSFT,NVDA,AMZN,GOOGL,META,TSLA,AMD,NFLX,QQQ,SPY,HOOD").split(",").map((t) => t.trim()).filter(Boolean);
const DAYS = Number(process.env.BT_DAYS) || 180;
const MIN_PREMIUM = Number(process.env.BT_MIN_PREMIUM) || 1_000_000;
const OUT = process.env.BT_OUT || "scripts/backtest-oos-reporte.md";
const YEAR_MS = 365 * 24 * 3600 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DBar { time: string; close: number }
const barMs = (b: DBar) => Date.parse(`${b.time}T20:00:00Z`);
function barIdxAt(bars: DBar[], ms: number): number {
  let idx = -1;
  for (let i = 0; i < bars.length; i++) { if (Date.parse(`${bars[i].time}T00:00:00Z`) <= ms) idx = i; else break; }
  return idx;
}
function realizedVol(bars: DBar[], entryIdx: number, lookback = 20): number | null {
  const start = Math.max(1, entryIdx - lookback);
  const rets: number[] = [];
  for (let i = start; i <= entryIdx; i++) if (bars[i - 1].close > 0 && bars[i].close > 0) rets.push(Math.log(bars[i].close / bars[i - 1].close));
  if (rets.length < 5) return null;
  const m = rets.reduce((s, x) => s + x, 0) / rets.length;
  const v = rets.reduce((s, x) => s + (x - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}
function ivProxyScore(iv: number, rv: number | null): number {
  if (rv == null || !(rv > 0)) return 5;
  const ratio = iv / rv;
  if (ratio < 0.9) return 10; if (ratio <= 1.2) return 7; if (ratio <= 1.6) return 4; return 0;
}

interface Rec { entryMs: number; victor: number; eva: number; pnlHold: number; pnlTarget: number }

function build(r: FlowRow, bars: DBar[]): Rec | null {
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
  const sp = spreadPct(r.bid, r.ask);
  const hc = 1 - (sp ?? 0) / 200;

  // scores (4 categorías) para el ranking de pesos
  const aggr = executionScore(executionLevel(r.price, r.bid, r.ask, r.side));
  const conv = spreadScore(sp);
  const unus = unusualTradeScore(r).total;
  const ivp = ivProxyScore(ivEntry, realizedVol(bars, entryIdx));
  const victor = ((aggr / 10) * 20 + (conv / 10) * 20 + (unus / 10) * 20 + (ivp / 10) * 10) / 70 * 100;
  const eva = ((conv / 10) * 30 + (unus / 10) * 20 + (ivp / 10) * 15 + (aggr / 10) * 10) / 75 * 100;

  // P&L: hold 20 vs target +100% (H20), salida al bid
  const expIdx = barIdxAt(bars, expMs);
  const last = Math.min(entryIdx + 20, expIdx >= 0 ? expIdx : entryIdx + 20, bars.length - 1);
  if (last <= entryIdx) return null;
  let hold = 0, target: number | null = null;
  for (let d = entryIdx + 1; d <= last; d++) {
    const bar = bars[d];
    const T = (expMs - barMs(bar)) / YEAR_MS;
    const val = T <= 0 ? Math.max(isCall ? bar.close - r.strike : r.strike - bar.close, 0) : bsPrice(bar.close, r.strike, T, ivEntry, type);
    hold = (val * hc) / r.price - 1;
    if (target == null && hold >= 1.0) target = hold; // take-profit +100%
  }
  return { entryMs, victor, eva, pnlHold: hold, pnlTarget: target ?? hold };
}

interface Stat { n: number; win: number | null; mean: number | null; median: number | null }
function stat(pnls: number[]): Stat {
  if (pnls.length === 0) return { n: 0, win: null, mean: null, median: null };
  const s = [...pnls].sort((a, b) => a - b);
  return { n: s.length, win: Math.round((s.filter((x) => x > 0).length / s.length) * 100), mean: Math.round((s.reduce((a, x) => a + x, 0) / s.length) * 1000) / 10, median: Math.round(s[Math.floor(s.length / 2)] * 1000) / 10 };
}
function tercileWinSep(recs: Rec[], key: "victor" | "eva"): number | null {
  if (recs.length < 6) return null;
  const s = [...recs].sort((a, b) => a[key] - b[key]);
  const k = Math.floor(s.length / 3);
  const hi = stat(s.slice(s.length - k).map((r) => r.pnlHold));
  const lo = stat(s.slice(0, k).map((r) => r.pnlHold));
  return hi.win != null && lo.win != null ? hi.win - lo.win : null;
}

function period(recs: Rec[], label: string): string[] {
  const vSep = tercileWinSep(recs, "victor");
  const eSep = tercileWinSep(recs, "eva");
  const hold = stat(recs.map((r) => r.pnlHold));
  const tgt = stat(recs.map((r) => r.pnlTarget));
  return [
    `### ${label} (n=${recs.length})`,
    `- **Pesos** — separación win: Victor ${vSep} · **EVA ${eSep}** ${eSep != null && vSep != null && eSep > vSep ? "✅ EVA gana" : ""}`,
    `- **Gestión** — hold: media ${hold.mean}% mediana ${hold.median}% · target+100%: media ${tgt.mean}% ${hold.mean != null && tgt.mean != null && hold.mean > tgt.mean ? "✅ hold gana" : ""}`,
    "",
  ];
}

(async () => {
  console.log(`Out-of-sample · ${TICKERS.length} tickers · ${DAYS}d`);
  const recs: Rec[] = [];
  for (const t of TICKERS) {
    try {
      const { trades } = await fetchFlow(t, { targetDays: DAYS, minPremium: MIN_PREMIUM, contractCap: 25, maxPages: 6 });
      const { rows } = classifyFlow(trades, new Date());
      let bars: DBar[] = [];
      for (let i = 0; i < 4; i++) { bars = (await fetchDailyBars(t, 400).catch(() => [])) as DBar[]; if (bars.length > 0) break; await sleep(800 * (i + 1)); }
      let n = 0;
      for (const r of rows) { const rec = build(r, bars); if (rec) { recs.push(rec); n++; } }
      console.log(`[${t}] ${n}`);
    } catch (e) { console.error(`[${t}] ERROR:`, (e as Error).message); }
    await sleep(2500);
  }
  const sorted = [...recs].sort((a, b) => a.entryMs - b.entryMs);
  const mid = Math.floor(sorted.length / 2);
  const early = sorted.slice(0, mid);
  const late = sorted.slice(mid);

  const lines = [
    "# Out-of-sample — ¿los hallazgos aguantan en el tiempo?",
    "",
    `**${recs.length} flujos** partidos por fecha de entrada en dos mitades. Si un hallazgo gana en AMBAS, es robusto (no sobreajuste de un régimen).`,
    "",
    ...period(early, "Mitad VIEJA"),
    ...period(late, "Mitad NUEVA"),
    "## Lectura",
    "Si 'EVA gana' y 'hold gana' aparecen en las DOS mitades → los hallazgos son consistentes en el tiempo. Si solo en una → frágiles/régimen-dependientes.",
    "",
    "## Caveats",
    "- Solo 4 de 6 categorías, proxies, long-only, IV constante, salida al bid. Granularidad diaria.",
  ];
  const report = lines.join("\n") + "\n";
  writeFileSync(OUT, report, "utf8");
  console.log("\n" + report);
  console.log(`=== reporte en ${OUT} ===`);
})();
