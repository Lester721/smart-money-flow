// Forward-test logger — toma una FOTO diaria del scorecard para el panel fijo de 12 líquidos.
//
// Cada corrida (idealmente 1×/día tras el cierre) agrega, por ticker, un registro con las señales
// del scorecard que podemos medir hoy + el spot. Con el tiempo, `panel-evaluate` medirá el
// retorno hacia adelante y así validamos las señales de "foto" (Estructura, IV) que NO se pueden
// backtestear hacia atrás. Es la única forma rigurosa de validar esas categorías.
//
// Uso: node --env-file=.env.local --import tsx scripts/panel-snapshot.ts   (correr OFF-HOURS)
// Salida: scripts/panel-log.json (se ACUMULA; no se sobreescribe).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fetchFlow } from "../lib/massiveFlow";
import {
  classifyFlow, unusualTradeScore, executionLevel, executionScore, spreadScore, spreadPct,
  type FlowRow,
} from "../lib/flow";
import { impliedVol } from "../lib/blackScholes";
import { fetchDailyBars } from "../lib/massive";
import { PANEL_TICKERS } from "../lib/panel";

const MIN_PREMIUM = Number(process.env.PANEL_MIN_PREMIUM) || 1_000_000;
const DAYS = 7; // ventana de flujo para la foto (reciente)
const LOG = process.env.PANEL_LOG || "scripts/panel-log.json";
const YEAR_MS = 365 * 24 * 3600 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DBar { time: string; close: number }
const barMs = (b: DBar) => Date.parse(`${b.time}T20:00:00Z`);

function realizedVol(bars: DBar[], lookback = 20): number | null {
  const start = Math.max(1, bars.length - lookback);
  const rets: number[] = [];
  for (let i = start; i < bars.length; i++) {
    if (bars[i - 1].close > 0 && bars[i].close > 0) rets.push(Math.log(bars[i].close / bars[i - 1].close));
  }
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

interface Scored { aggr: number; conv: number; unus: number; ivp: number; composite: number; premium: number; dir: number }

function scoreRow(r: FlowRow, bars: DBar[], rv: number | null): Scored | null {
  if (r.type === "unknown" || r.strike == null || !r.expiration || !(r.price > 0)) return null;
  const spot = bars[bars.length - 1]?.close;
  if (!(spot > 0)) return null;
  const expMs = Date.parse(`${r.expiration}T20:00:00Z`);
  const tNow = (expMs - barMs(bars[bars.length - 1])) / YEAR_MS;
  if (tNow <= 0) return null;
  const iv = impliedVol(r.price, spot, r.strike, tNow, r.type === "call" ? "call" : "put");
  if (iv == null || !(iv > 0)) return null;
  const aggr = executionScore(executionLevel(r.price, r.bid, r.ask, r.side));
  const conv = spreadScore(spreadPct(r.bid, r.ask));
  const unus = unusualTradeScore(r).total;
  const ivp = ivProxyScore(iv, rv);
  const composite = (2 * aggr + 2 * conv + 2 * unus + 1 * ivp) / 7;
  const dir = r.sentiment === "bullish" ? 1 : r.sentiment === "bearish" ? -1 : 0;
  return { aggr, conv, unus, ivp, composite, premium: r.premium, dir };
}

async function snapshot(ticker: string) {
  const { trades } = await fetchFlow(ticker, {
    targetDays: DAYS, minPremium: MIN_PREMIUM, contractCap: 25, maxPages: 6,
  });
  const { rows } = classifyFlow(trades, new Date());
  let bars: DBar[] = [];
  for (let i = 0; i < 4; i++) {
    bars = (await fetchDailyBars(ticker, 60).catch(() => [])) as DBar[];
    if (bars.length > 0) break;
    await sleep(800 * (i + 1));
  }
  const spot = bars[bars.length - 1]?.close ?? null;
  const rv = bars.length ? realizedVol(bars) : null;
  const scored = rows.map((r) => scoreRow(r, bars, rv)).filter((s): s is Scored => s != null);
  const totPrem = scored.reduce((s, x) => s + x.premium, 0);
  const wavg = (key: keyof Scored) =>
    totPrem > 0 ? Math.round((scored.reduce((s, x) => s + (x[key] as number) * x.premium, 0) / totPrem) * 100) / 100 : null;
  const bullPrem = scored.filter((s) => s.dir > 0).reduce((s, x) => s + x.premium, 0);
  const bearPrem = scored.filter((s) => s.dir < 0).reduce((s, x) => s + x.premium, 0);
  return {
    ticker, spot, nFlows: scored.length,
    composite: wavg("composite"), aggr: wavg("aggr"), conv: wavg("conv"), unus: wavg("unus"), ivp: wavg("ivp"),
    bullPremium: Math.round(bullPrem), bearPremium: Math.round(bearPrem),
    netDir: bullPrem > bearPrem ? "bullish" : bearPrem > bullPrem ? "bearish" : "neutral",
  };
}

(async () => {
  const date = new Date().toISOString().slice(0, 10);
  const prev: unknown[] = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf8")) : [];
  console.log(`Panel snapshot ${date} · ${PANEL_TICKERS.length} tickers · minPremium=$${(MIN_PREMIUM / 1e6).toFixed(1)}M`);
  const records: unknown[] = [];
  for (const t of PANEL_TICKERS) {
    try {
      const snap = await snapshot(t);
      records.push({ date, ...snap });
      console.log(`[${t}] spot=${snap.spot} flows=${snap.nFlows} composite=${snap.composite} dir=${snap.netDir}`);
    } catch (e) {
      console.error(`[${t}] ERROR:`, (e as Error).message);
      records.push({ date, ticker: t, error: (e as Error).message });
    }
    await sleep(2500);
  }
  writeFileSync(LOG, JSON.stringify([...prev, ...records], null, 1), "utf8");
  console.log(`=== ${records.length} registros agregados a ${LOG} (total ${prev.length + records.length}) ===`);
})();
