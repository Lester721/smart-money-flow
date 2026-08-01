// Backtest de GESTIÓN DEL TRADE — ¿reglas de salida convierten señales débiles en expectativa
// positiva? Mismos flujos, pero en vez de "comprar y sostener a ciegas", camina el valor de la
// opción día a día y sale con: stop-loss, take-profit, o stop por tiempo. Compara configs vs
// el baseline (hold N). Salida al bid (costo de ejecución) igual que el resto.
// Uso: node --env-file=.env.local --import tsx scripts/backtest-management.ts

import { writeFileSync } from "node:fs";
import { fetchFlow } from "../lib/massiveFlow";
import { classifyFlow, spreadPct, type FlowRow } from "../lib/flow";
import { bsPrice, impliedVol } from "../lib/blackScholes";
import { fetchDailyBars } from "../lib/massive";

const TICKERS = (process.env.BT_TICKERS || "AAPL,MSFT,NVDA,AMZN,GOOGL,META,TSLA,AMD,NFLX,QQQ,SPY,HOOD").split(",").map((t) => t.trim()).filter(Boolean);
const DAYS = Number(process.env.BT_DAYS) || 180;
const MIN_PREMIUM = Number(process.env.BT_MIN_PREMIUM) || 1_000_000;
const OUT = process.env.BT_OUT || "scripts/backtest-management-reporte.md";
const YEAR_MS = 365 * 24 * 3600 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DBar { time: string; close: number }
const barMs = (b: DBar) => Date.parse(`${b.time}T20:00:00Z`);
function barIdxAt(bars: DBar[], ms: number): number {
  let idx = -1;
  for (let i = 0; i < bars.length; i++) { if (Date.parse(`${bars[i].time}T00:00:00Z`) <= ms) idx = i; else break; }
  return idx;
}

interface Cfg { name: string; stop: number | null; target: number | null; horizon: number }
const CONFIGS: Cfg[] = [
  { name: "Baseline hold 10 (sin gestión)", stop: null, target: null, horizon: 10 },
  { name: "Baseline hold 20 (sin gestión)", stop: null, target: null, horizon: 20 },
  { name: "Stop -50% / Target +100% / H20", stop: 0.5, target: 1.0, horizon: 20 },
  { name: "Stop -50% / Target +50% / H10", stop: 0.5, target: 0.5, horizon: 10 },
  { name: "Stop -30% / Target +100% / H20", stop: 0.3, target: 1.0, horizon: 20 },
  { name: "Sin stop / Target +100% / H20 (deja correr)", stop: null, target: 1.0, horizon: 20 },
  { name: "Stop -50% / sin target / H20 (corta perdedores)", stop: 0.5, target: null, horizon: 20 },
  { name: "Stop -40% / Target +80% / H15", stop: 0.4, target: 0.8, horizon: 15 },
];

interface Setup {
  entryIdx: number; ivEntry: number; expMs: number; strike: number; isCall: boolean; price: number; spreadHc: number;
}
function setup(r: FlowRow, bars: DBar[]): Setup | null {
  if (r.type === "unknown" || r.strike == null || !r.expiration || !(r.price > 0)) return null;
  const entryMs = Date.parse(r.timestamp);
  const expMs = Date.parse(`${r.expiration}T20:00:00Z`);
  const entryIdx = barIdxAt(bars, entryMs);
  if (entryIdx < 0) return null;
  const isCall = r.type === "call";
  const sEntry = bars[entryIdx].close;
  const tEntry = (expMs - barMs(bars[entryIdx])) / YEAR_MS;
  if (tEntry <= 0) return null;
  const ivEntry = impliedVol(r.price, sEntry, r.strike, tEntry, isCall ? "call" : "put");
  if (ivEntry == null || !(ivEntry > 0)) return null;
  const sp = spreadPct(r.bid, r.ask);
  return { entryIdx, ivEntry, expMs, strike: r.strike, isCall, price: r.price, spreadHc: 1 - (sp ?? 0) / 200 };
}

// Camina día a día y sale con stop/target/tiempo. Devuelve el P&L (retorno de la opción).
function walk(s: Setup, bars: DBar[], cfg: Cfg): number | null {
  const type = s.isCall ? "call" : "put";
  const lastIdx = Math.min(s.entryIdx + cfg.horizon, bars.length - 1);
  if (lastIdx <= s.entryIdx) return null; // sin días adelante
  let lastPnl = 0;
  for (let d = s.entryIdx + 1; d <= lastIdx; d++) {
    const bar = bars[d];
    const T = (s.expMs - barMs(bar)) / YEAR_MS;
    const val = T <= 0
      ? Math.max(s.isCall ? bar.close - s.strike : s.strike - bar.close, 0)
      : bsPrice(bar.close, s.strike, T, s.ivEntry, type);
    lastPnl = (val * s.spreadHc) / s.price - 1;
    if (cfg.stop != null && lastPnl <= -cfg.stop) return lastPnl;   // stop-loss (EOD)
    if (cfg.target != null && lastPnl >= cfg.target) return lastPnl; // take-profit (EOD)
  }
  return lastPnl; // stop por tiempo
}

interface Stat { n: number; win: number | null; mean: number | null; median: number | null }
function stat(pnls: number[]): Stat {
  if (pnls.length === 0) return { n: 0, win: null, mean: null, median: null };
  const s = [...pnls].sort((a, b) => a - b);
  return {
    n: s.length,
    win: Math.round((s.filter((x) => x > 0).length / s.length) * 100),
    mean: Math.round((s.reduce((a, x) => a + x, 0) / s.length) * 1000) / 10,
    median: Math.round(s[Math.floor(s.length / 2)] * 1000) / 10,
  };
}
const fmt = (s: Stat) => s.n === 0 ? "—" : `win ${s.win}% · media ${s.mean}% · mediana ${s.median}% (n=${s.n})`;

(async () => {
  console.log(`Gestión del trade · ${TICKERS.length} tickers · ${DAYS}d`);
  const setups: { s: Setup; bars: DBar[] }[] = [];
  for (const t of TICKERS) {
    try {
      const { trades } = await fetchFlow(t, { targetDays: DAYS, minPremium: MIN_PREMIUM, contractCap: 25, maxPages: 6 });
      const { rows } = classifyFlow(trades, new Date());
      let bars: DBar[] = [];
      for (let i = 0; i < 4; i++) { bars = (await fetchDailyBars(t, 400).catch(() => [])) as DBar[]; if (bars.length > 0) break; await sleep(800 * (i + 1)); }
      let n = 0;
      for (const r of rows) { const s = setup(r, bars); if (s) { setups.push({ s, bars }); n++; } }
      console.log(`[${t}] ${n}`);
    } catch (e) { console.error(`[${t}] ERROR:`, (e as Error).message); }
    await sleep(2500);
  }

  const lines = [
    "# Backtest de gestión del trade (stops / targets / horizonte)",
    "",
    `**Muestra:** ${TICKERS.join(", ")} · ${DAYS}d · **${setups.length} flujos**. Long-only, salida al bid, IV de entrada constante. Stops/targets se chequean al CIERRE de cada día (granularidad diaria → subestima toques intradía).`,
    "",
    "## Resultado por config (¿la gestión mejora la expectativa?)",
    "| Config | Resultado |",
    "|---|---|",
  ];
  for (const cfg of CONFIGS) {
    const pnls = setups.map(({ s, bars }) => walk(s, bars, cfg)).filter((x): x is number => x != null);
    lines.push(`| ${cfg.name} | ${fmt(stat(pnls))} |`);
  }
  lines.push(
    "",
    "**Cómo leerlo:** compara las configs con stop/target contra los baseline (hold sin gestión). Si una config sube el win% Y la mediana sobre el baseline, la gestión agrega expectativa. Ojo: cortar perdedores suele SUBIR win% pero puede bajar la media (menos jackpots); dejar correr sube la media.",
    "",
    "## Caveats",
    "- Granularidad DIARIA: los stops/targets se evalúan al cierre → subestima toques intradía (en vivo saltarían antes).",
    "- Long-only, IV de entrada constante (no modela cambios de IV). Sin comisiones.",
    "- Aplica a TODOS los flujos notables, no solo al set operable — mide el efecto de la gestión en bruto.",
  );
  const report = lines.join("\n") + "\n";
  writeFileSync(OUT, report, "utf8");
  console.log("\n" + report);
  console.log(`=== reporte en ${OUT} ===`);
})();
