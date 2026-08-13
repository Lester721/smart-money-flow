// Validación EVA-tuned vs Victor — MISMOS flujos, MISMO P&L, solo cambia el scoring.
// Puntúa cada flujo dos veces (pesos de Victor vs evaScore con pesos nuevos + vetos + modif.)
// y compara cuál separa mejor ganadores de perdedores.
// Uso: node --env-file=.env.local --import tsx scripts/backtest-eva-vs-victor.ts

import { writeFileSync } from "node:fs";
import { fetchFlow } from "../lib/massiveFlow";
import {
  classifyFlow, unusualTradeScore, executionLevel, executionScore, spreadScore, spreadPct, type FlowRow,
} from "../lib/flow";
import { impliedVol } from "../lib/blackScholes";
import { quoteCierre } from "../lib/thetadata";   // salida a precio REAL: se vende al bid
import { fetchDailyBars } from "../lib/massive";
import { evaScore, classifyIntent, type EvaScores } from "../lib/scorecardEva";

const TICKERS = (process.env.BT_TICKERS || "AAPL,MSFT,NVDA,AMZN,GOOGL,META,TSLA,AMD,NFLX,QQQ,SPY,HOOD").split(",").map((t) => t.trim()).filter(Boolean);
const DAYS = Number(process.env.BT_DAYS) || 180;
const MIN_PREMIUM = Number(process.env.BT_MIN_PREMIUM) || 1_000_000;
const HOLD = Number(process.env.BT_HOLD) || 10;
const OUT = process.env.BT_OUT || "scripts/backtest-eva-vs-victor-reporte.md";
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
  if (ratio < 0.9) return 10;
  if (ratio <= 1.2) return 7;
  if (ratio <= 1.6) return 4;
  return 0;
}

interface Row {
  pnl: number; aggr: number; conv: number; unus: number; ivp: number;
  spreadPct: number | null; oi: number; volume: number; dte: number | null;
  side: string; exceededOI: boolean; isCall: boolean;
}

async function buildRow(r: FlowRow, bars: DBar[]): Promise<Row | null> {
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
  const expIdx = barIdxAt(bars, expMs);
  const cap = expIdx >= 0 ? Math.min(entryIdx + HOLD, expIdx) : entryIdx + HOLD;
  if (cap >= bars.length) return null;
  const exitBar = bars[cap];
  const tExit = (expMs - barMs(exitBar)) / YEAR_MS;
  // SALIDA CON PRECIO REAL (2026-08-13). Antes era bsPrice con la IV de entrada mantenida
  // constante: menos grave que meter volatilidad realizada —la IV era real— pero seguía
  // siendo un supuesto en el camino del dinero. Ahora se pide la cotización de ThetaData
  // del día de salida y se VENDE AL BID, que es lo que cobra quien cierra una opción comprada.
  // Si no hay cotización real, el flujo se descarta: no se rellena con modelo.
  const expYmd = new Date(expMs).toISOString().slice(0, 10).replace(/-/g, "");
  const salidaYmd = exitBar.time.replace(/-/g, "");
  let exitNet: number;
  if (tExit <= 0) {
    // Ya venció: valor intrínseco con el cierre real. No es un estimado, es la liquidación.
    exitNet = Math.max(isCall ? exitBar.close - r.strike : r.strike - exitBar.close, 0);
  } else {
    const q = await quoteCierre(r.symbol ?? "", expYmd, r.strike!, isCall ? "C" : "P", salidaYmd);
    if (!q || !(q.bid > 0)) return null;      // sin precio real no se inventa: se descarta
    exitNet = q.bid;
  }
  return {
    pnl: exitNet / r.price - 1,
    aggr: executionScore(executionLevel(r.price, r.bid, r.ask, r.side)),
    conv: spreadScore(spreadPct(r.bid, r.ask)),
    unus: unusualTradeScore(r).total,
    ivp: ivProxyScore(ivEntry, realizedVol(bars, entryIdx)),
    spreadPct: spreadPct(r.bid, r.ask), oi: r.openInterest, volume: r.volume, dte: r.dte,
    side: r.side, exceededOI: r.flags.exceededOI, isCall,
  };
}

// Victor: pesos del código (Agr 20, Conv 20, Inus 20, IV 10) renormalizados entre los 4.
function victorScore(r: Row): number {
  const pts = (r.aggr / 10) * 20 + (r.conv / 10) * 20 + (r.unus / 10) * 20 + (r.ivp / 10) * 10;
  return (pts / 70) * 100;
}
// EVA pesos SOLOS (Conv 30, Inus 20, IV 15, Agr 10), SIN vetos — para aislar el efecto de re-pesar.
function evaWeightsScore(r: Row): number {
  const pts = (r.conv / 10) * 30 + (r.unus / 10) * 20 + (r.ivp / 10) * 15 + (r.aggr / 10) * 10;
  return (pts / 75) * 100;
}
// EVA-tuned: evaScore con pesos nuevos + vetos + modificadores (los medibles).
function evaOf(r: Row): { composite: number; vetoed: boolean } {
  const scores: EvaScores = { aggression: r.aggr, conviction: r.conv, unusuality: r.unus, structure: null, ivContext: r.ivp, validation: null };
  const intent = classifyIntent(r.side, r.exceededOI, r.isCall);
  const sp = r.spreadPct;
  const res = evaScore(scores,
    { totalOI: r.oi, volume: r.volume, ivRank: null, dte: r.dte },
    {
      intentIndeterminate: intent.intent === "indeterminado",
      wideSpread: sp != null && sp > 15,          // spread ancho: penaliza (ya no vetea)
      lowLiquidity: sp != null && sp > 10 && sp <= 15,
      earningsWithinDte: false, gexConfluence: false,
    });
  return { composite: res.composite, vetoed: res.vetoed };
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

// terciles por score: top⅓ vs bottom⅓ (misma n para ambos métodos = justo)
function terciles(rows: Row[], scoreOf: (r: Row) => number) {
  const sorted = [...rows].sort((a, b) => scoreOf(a) - scoreOf(b));
  const k = Math.floor(sorted.length / 3);
  const low = sorted.slice(0, k).map((r) => r.pnl);
  const high = sorted.slice(sorted.length - k).map((r) => r.pnl);
  const hi = stat(high), lo = stat(low);
  const sep = hi.mean != null && lo.mean != null ? Math.round((hi.mean - lo.mean) * 10) / 10 : null;
  const sepWin = hi.win != null && lo.win != null ? hi.win - lo.win : null;
  return { hi, lo, sep, sepWin };
}

(async () => {
  console.log(`EVA-tuned vs Victor · ${TICKERS.length} tickers · ${DAYS}d · hold ${HOLD}`);
  const all: Row[] = [];
  for (const t of TICKERS) {
    try {
      const { trades } = await fetchFlow(t, { targetDays: DAYS, minPremium: MIN_PREMIUM, contractCap: 25, maxPages: 6 });
      const { rows } = classifyFlow(trades, new Date());
      let bars: DBar[] = [];
      for (let i = 0; i < 4; i++) { bars = (await fetchDailyBars(t, 400).catch(() => [])) as DBar[]; if (bars.length > 0) break; await sleep(800 * (i + 1)); }
      // De uno en uno y no con Promise.all: cada buildRow pide una cotización real a ThetaData,
      // y el Terminal admite 4 peticiones a la vez. Lanzar cientos en paralelo lo satura.
      const rr: Row[] = [];
      for (const r of rows) { const x = await buildRow(r, bars); if (x != null) rr.push(x); }
      all.push(...rr);
      console.log(`[${t}] ${rr.length}`);
    } catch (e) { console.error(`[${t}] ERROR:`, (e as Error).message); }
    await sleep(2500);
  }

  const V = terciles(all, victorScore);
  const Ew = terciles(all, evaWeightsScore);
  const vetoed = all.filter((r) => evaOf(r).vetoed).map((r) => r.pnl);
  const notVetoed = all.filter((r) => !evaOf(r).vetoed).map((r) => r.pnl);
  const vTrade = all.filter((r) => victorScore(r) >= 70).map((r) => r.pnl);
  const eTrade = all.filter((r) => { const e = evaOf(r); return !e.vetoed && e.composite >= 70; }).map((r) => r.pnl);

  const lines = [
    "# Validación EVA-tuned vs Victor — CON costo de ejecución (salida al bid)",
    "",
    `**Muestra:** ${TICKERS.join(", ")} · ${DAYS}d · **${all.length} flujos**. Ahora la salida paga media horquilla (spread). Solo cambia el scoring.`,
    "",
    "## 1. PESOS solos, sin vetos: ¿re-pesar rankea mejor? (top⅓ vs bottom⅓)",
    `- **Victor** (20/20/20/10) — top⅓: ${fmt(V.hi)} · bottom⅓: ${fmt(V.lo)} · **sep media ${V.sep} · win ${V.sepWin}**`,
    `- **EVA pesos** (Conv30/Inus20/IV15/Agr10) — top⅓: ${fmt(Ew.hi)} · bottom⅓: ${fmt(Ew.lo)} · **sep media ${Ew.sep} · win ${Ew.sepWin}**`,
    "",
    "## 2. VETOS (ya solo OI<250 / vol<100 — spread pasó a penalización): ¿los inoperables pierden?",
    `- **Vetados por EVA** (OI<250 / vol<100): ${fmt(stat(vetoed))}`,
    `- No vetados: ${fmt(stat(notVetoed))}`,
    "",
    "Con el costo del spread, si los vetados ahora rinden PEOR, el veto está justificado.",
    "",
    "## 3. EVA-tuned completo (pesos+vetos) vs Victor — lo que operaría (≥70)",
    `- **Victor** (≥70): ${fmt(stat(vTrade))}`,
    `- **EVA-tuned** (≥70, sin veto): ${fmt(stat(eTrade))}`,
    "",
    "## Caveats",
    "- Costo de ejecución = media horquilla en la SALIDA (entrada = precio real del trade). Aproximación honesta, no exacta.",
    "- Solo 4 de 6 categorías (faltan Estructura y Confirmación → forward-test).",
    "- Vetos spread/OI/volumen aplicados; IV Rank y modificadores earnings/GEX NO (sin dato histórico).",
    "- Long-only, IV constante, horizonte fijo. P&L de opciones asimétrico → win% y mediana > media.",
  ];
  const report = lines.join("\n") + "\n";
  writeFileSync(OUT, report, "utf8");
  console.log("\n" + report);
  console.log(`=== reporte en ${OUT} ===`);
})();
