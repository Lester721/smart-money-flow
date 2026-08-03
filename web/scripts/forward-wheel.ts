// FORWARD-TEST (paper) de la WHEEL — vender PUTS cash-secured en días de flujo ALCISTA
// + alta convicción de EVA. NO ejecuta órdenes: registra puts de PAPEL y los liquida a
// vencimiento (con gestión 50%) contra el precio real. Valida hacia adelante lo que el
// backtest insinuó: que el filtro de EVA baja la asignación y mejora el retorno.
//
// Cada corrida: (1) ABRE un put de papel por ticker/día con flujo alcista, en las celdas
// {delta × DTE} configuradas; (2) LIQUIDA los vencidos; (3) REPORTA Top⅓ convicción vs resto.
// Meta = cobrar prima SIN ser asignado (la asignación se MIDE, no se persigue).
// Uso: node --env-file=.env.local --import tsx scripts/forward-wheel.ts

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import Redis from "ioredis";
import { PANEL_TICKERS } from "../lib/panel";
import { fetchFlow } from "../lib/massiveFlow";
import {
  classifyFlow, executionLevel, executionScore, spreadScore, spreadPct, unusualTradeScore, type FlowRow,
} from "../lib/flow";
import { bsPrice, bsDelta, impliedVol } from "../lib/blackScholes";
import { fetchDailyBars } from "../lib/massive";

const TICKERS = (process.env.FWD_TICKERS || PANEL_TICKERS.join(",")).split(",").map((t) => t.trim()).filter(Boolean);
const FWD_DAYS = Number(process.env.FWD_DAYS) || 10;
const MIN_PREMIUM = Number(process.env.FWD_MIN_PREMIUM) || 1_000_000;
const LEDGER = process.env.FWD_LEDGER || "data/forward/wheel-ledger.json";
const REPORT = process.env.FWD_REPORT || "data/forward/wheel-report.md";
const TAKE = Number(process.env.FWD_TAKE ?? 0.5);          // gestión: cerrar al capturar 50% de la prima
const STORE = (process.env.FWD_STORE || (process.env.REDIS_URL ? "redis" : "file")).toLowerCase();
const REDIS_KEY = process.env.FWD_REDIS_KEY || "forward:wheel";
// Celdas prometedoras del backtest: conservador/balanceado a 15-30 días.
const CELLS: { delta: number; dte: number }[] = (process.env.FWD_CELLS || "0.15@15,0.15@30,0.25@30")
  .split(",").map((s) => { const [d, t] = s.split("@"); return { delta: Number(d), dte: Number(t) }; });
const YR = 365 * 24 * 3600 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface WPut {
  id: string; ticker: string; entryDate: string; entryMs: number;
  delta: number; dte: number; spot: number; rv: number;
  strike: number; premium: number; collateral: number; expiryMs: number; expiryDate: string;
  evaComp: number; victorComp: number;
  status: "open" | "closed";
  exitDate?: string; exitSpot?: number; retOnColl?: number; assigned?: boolean; closedReason?: string;
}

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    if (!process.env.REDIS_URL) throw new Error("FWD_STORE=redis pero falta REDIS_URL");
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return redis;
}
function readJsonFile(path: string): WPut[] { try { return JSON.parse(readFileSync(path, "utf8")) as WPut[]; } catch { return []; } }
function saveJson(path: string, data: unknown) { if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(data, null, 2), "utf8"); }
async function loadLedger(): Promise<WPut[]> {
  if (STORE === "redis") { const raw = await getRedis().get(REDIS_KEY); if (raw) { try { return JSON.parse(raw) as WPut[]; } catch { return []; } } return readJsonFile(LEDGER); }
  return readJsonFile(LEDGER);
}
async function persist(ledger: WPut[], report: string) {
  if (STORE === "redis") { const r = getRedis(); await r.set(REDIS_KEY, JSON.stringify(ledger)); await r.set(`${REDIS_KEY}:report`, report); return; }
  saveJson(LEDGER, ledger); saveJson(REPORT, report);
}

interface DBar { time: string; close: number }
function barIdxOnOrAfter(bars: DBar[], ms: number): number { for (let i = 0; i < bars.length; i++) if (Date.parse(`${bars[i].time}T20:00:00Z`) >= ms) return i; return -1; }
function barIdxOnOrBefore(bars: DBar[], ms: number): number { let idx = -1; for (let i = 0; i < bars.length; i++) { if (Date.parse(`${bars[i].time}T00:00:00Z`) <= ms) idx = i; else break; } return idx; }
function realizedVol(bars: DBar[], endIdx: number, lookback = 20): number | null {
  const start = Math.max(1, endIdx - lookback); const rets: number[] = [];
  for (let i = start; i <= endIdx; i++) if (bars[i - 1].close > 0 && bars[i].close > 0) rets.push(Math.log(bars[i].close / bars[i - 1].close));
  if (rets.length < 5) return null;
  const m = rets.reduce((s, x) => s + x, 0) / rets.length;
  const v = rets.reduce((s, x) => s + (x - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}
function ivProxyScore(iv: number, rv: number | null): number { if (rv == null || !(rv > 0)) return 5; const r = iv / rv; if (r < 0.9) return 10; if (r <= 1.2) return 7; if (r <= 1.6) return 4; return 0; }

interface Signal { entryDate: string; entryMs: number; entryIdx: number; spot: number; rv: number; dir: 1 | -1; evaComp: number; victorComp: number }
function signals(rows: FlowRow[], bars: DBar[]): Signal[] {
  const byDay = new Map<string, FlowRow[]>();
  for (const r of rows) { const d = r.timestamp.slice(0, 10); const a = byDay.get(d); if (a) a.push(r); else byDay.set(d, [r]); }
  const out: Signal[] = [];
  for (const [d, dayRows] of byDay) {
    const entryIdx = barIdxOnOrBefore(bars, Date.parse(`${d}T20:00:00Z`)); if (entryIdx < 20) continue;
    const rv = realizedVol(bars, entryIdx); if (rv == null || !(rv > 0)) continue;
    const spot = bars[entryIdx].close;
    let net = 0, totP = 0, aA = 0, aC = 0, aU = 0, aI = 0;
    for (const r of dayRows) {
      const s = r.sentiment === "bullish" ? 1 : r.sentiment === "bearish" ? -1 : 0; if (s !== 0) net += s * r.premium;
      if (r.strike == null || !r.expiration || !(r.price > 0)) continue;
      const T = (Date.parse(`${r.expiration}T20:00:00Z`) - Date.parse(`${d}T20:00:00Z`)) / YR; if (T <= 0) continue;
      const iv = impliedVol(r.price, spot, r.strike, T, r.type === "call" ? "call" : "put"); if (iv == null || !(iv > 0)) continue;
      aA += executionScore(executionLevel(r.price, r.bid, r.ask, r.side)) * r.premium;
      aC += spreadScore(spreadPct(r.bid, r.ask)) * r.premium; aU += unusualTradeScore(r).total * r.premium; aI += ivProxyScore(iv, rv) * r.premium; totP += r.premium;
    }
    if (net === 0 || totP <= 0) continue;
    const wa = aA / totP, wc = aC / totP, wu = aU / totP, wi = aI / totP;
    const victorComp = ((wa / 10) * 20 + (wc / 10) * 20 + (wu / 10) * 20 + (wi / 10) * 10) / 70 * 100;
    const evaComp = ((wc / 10) * 30 + (wu / 10) * 20 + (wi / 10) * 15 + (wa / 10) * 10) / 75 * 100;
    out.push({ entryDate: d, entryMs: Date.parse(`${d}T20:00:00Z`), entryIdx, spot, rv, dir: net > 0 ? 1 : -1, evaComp: round(evaComp, 1), victorComp: round(victorComp, 1) });
  }
  return out;
}
function round(x: number, d = 2): number { const p = 10 ** d; return Math.round(x * p) / p; }

function strikeForDelta(spot: number, T: number, iv: number, target: number): number | null {
  let best: number | null = null, err = Infinity;
  for (let f = 0.55; f <= 1.0; f += 0.005) { const K = spot * f; const e = Math.abs(Math.abs(bsDelta(spot, K, T, iv, "put")) - target); if (e < err) { err = e; best = K; } }
  return best;
}
// Abre un put de papel (solo días alcistas). Colateral = strike×100.
function openPut(sig: Signal, delta: number, dte: number): WPut | null {
  const T = Math.max(dte, 1) / 365;
  const K = strikeForDelta(sig.spot, T, sig.rv, delta); if (K == null || K <= 0) return null;
  const P0 = bsPrice(sig.spot, K, T, sig.rv, "put"); if (!(P0 > 0)) return null;
  const expiryMs = sig.entryMs + Math.max(dte, 1) * 86_400_000;
  return {
    id: "", ticker: "", entryDate: sig.entryDate, entryMs: sig.entryMs, delta, dte,
    spot: round(sig.spot), rv: round(sig.rv, 4), strike: round(K), premium: round(P0, 4), collateral: round(K * 100),
    expiryMs, expiryDate: new Date(expiryMs).toISOString().slice(0, 10), evaComp: sig.evaComp, victorComp: sig.victorComp, status: "open",
  };
}
// Liquida con gestión: cierra si captura TAKE de la prima antes de vencer; si no, a vencimiento
// (asignado si el precio quedó bajo el strike). Retorno sobre el colateral.
function settle(p: WPut, bars: DBar[]): boolean {
  const entryIdx = barIdxOnOrBefore(bars, p.entryMs); if (entryIdx < 0) return false;
  const expiryIdx = barIdxOnOrAfter(bars, p.expiryMs); if (expiryIdx < 0) return false; // aún no vence en los datos
  // Gestión: cerrar temprano al capturar TAKE de la prima.
  for (let i = entryIdx + 1; i < expiryIdx; i++) {
    const Trem = Math.max((p.expiryMs - Date.parse(`${bars[i].time}T20:00:00Z`)) / YR, 0.5 / 365);
    const Pi = bsPrice(bars[i].close, p.strike, Trem, p.rv, "put");
    if (p.premium - Pi >= TAKE * p.premium) {
      p.retOnColl = round(((p.premium - Pi) / p.strike) * 100, 2); p.assigned = false; p.closedReason = `gestión ${Math.round(TAKE * 100)}%`;
      p.exitSpot = round(bars[i].close); p.exitDate = bars[i].time; p.status = "closed"; return true;
    }
  }
  const sExp = bars[expiryIdx].close; const assigned = sExp < p.strike;
  p.retOnColl = round(((p.premium - Math.max(p.strike - sExp, 0)) / p.strike) * 100, 2);
  p.assigned = assigned; p.closedReason = assigned ? "asignado" : "expiró sin valor";
  p.exitSpot = round(sExp); p.exitDate = bars[expiryIdx].time; p.status = "closed"; return true;
}

interface Stat { n: number; win: number | null; mean: number | null; assign: number | null }
function stat(rows: WPut[]): Stat {
  if (!rows.length) return { n: 0, win: null, mean: null, assign: null };
  const r = rows.map((x) => x.retOnColl!);
  return { n: rows.length, win: Math.round((r.filter((x) => x > 0).length / r.length) * 100), mean: round(r.reduce((a, x) => a + x, 0) / r.length, 1), assign: Math.round((rows.filter((x) => x.assigned).length / rows.length) * 100) };
}
const fmt = (s: Stat) => s.n === 0 ? "—" : `win ${s.win}% · media ${s.mean}% · asig ${s.assign}% (n=${s.n})`;
function pctile(v: number[], p: number): number | null { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

(async () => {
  console.log(`Forward-test WHEEL (vender puts) · ${TICKERS.length} tickers · celdas ${CELLS.map((c) => `${c.delta}Δ@${c.dte}d`).join(", ")} · gestión ${Math.round(TAKE * 100)}% · store=${STORE}`);
  const ledger = await loadLedger();
  const byId = new Map(ledger.map((t) => [t.id, t] as const));
  const barsByTicker = new Map<string, DBar[]>();
  const added: WPut[] = [];

  for (const t of TICKERS) {
    try {
      const { trades } = await fetchFlow(t, { targetDays: FWD_DAYS, minPremium: MIN_PREMIUM, contractCap: 25, maxPages: 6 });
      const { rows } = classifyFlow(trades, new Date());
      let bars: DBar[] = [];
      for (let i = 0; i < 4; i++) { bars = (await fetchDailyBars(t, 800).catch(() => [])) as DBar[]; if (bars.length > 0) break; await sleep(1000 * (i + 1)); }
      if (!bars.length) { console.log(`[${t}] sin barras — omitido`); continue; }
      barsByTicker.set(t, bars);
      let newN = 0;
      for (const sig of signals(rows, bars)) {
        if (sig.dir !== 1) continue;                          // solo días de flujo ALCISTA (vender puts)
        for (const c of CELLS) {
          const rec = openPut(sig, c.delta, c.dte); if (!rec) continue;
          rec.ticker = t; rec.id = `${t}|${sig.entryDate}|${c.delta}|${c.dte}`;
          if (byId.has(rec.id)) continue;
          byId.set(rec.id, rec); ledger.push(rec); added.push(rec); newN++;
        }
      }
      console.log(`[${t}] nuevos puts de papel ${newN}`);
    } catch (e) { console.error(`[${t}] ERROR:`, (e as Error).message); }
    await sleep(2500);
  }

  let settled = 0;
  for (const p of ledger) { if (p.status !== "open") continue; const bars = barsByTicker.get(p.ticker); if (!bars) continue; if (Date.now() < p.expiryMs) continue; if (settle(p, bars)) settled++; }

  const closed = ledger.filter((p) => p.status === "closed");
  const open = ledger.filter((p) => p.status === "open");
  const cut = pctile(ledger.map((p) => p.evaComp), 2 / 3);
  const k = Math.max(1, Math.floor(closed.length / 3));
  const byEva = [...closed].sort((a, b) => a.evaComp - b.evaComp);
  const topEva = byEva.slice(closed.length - k), botEva = byEva.slice(0, k);

  const L: string[] = [
    "# Forward-test — WHEEL (vender puts en días alcistas + convicción de EVA)",
    "",
    `Corrida: ${new Date().toISOString().slice(0, 16)}Z · celdas ${CELLS.map((c) => `${c.delta}Δ@${c.dte}d`).join(", ")} · gestión ${Math.round(TAKE * 100)}%`,
    `Ledger: **${ledger.length}** puts de papel (**${open.length}** abiertos · **${closed.length}** cerrados). Nuevos: **${added.length}** · liquidados: **${settled}**.`,
    "> Meta: cobrar prima SIN ser asignado. Solo se abren puts en días de flujo ALCISTA. Delta conservador/balanceado. Simulación (BS, IV≈vol realizada); sin recuperación con calls cubiertas, sin costos.",
    "",
  ];
  if (added.length) {
    L.push("## Nuevos puts de papel esta corrida", "", "| Ticker | Entrada | Celda | Strike | Prima | Conv. EVA | ¿Alta conv.? |", "|---|---|---|---|---|---|---|");
    for (const p of [...added].sort((a, b) => b.evaComp - a.evaComp)) L.push(`| ${p.ticker} | ${p.entryDate} | ${p.delta}Δ@${p.dte}d | $${p.strike} | $${p.premium} | ${p.evaComp} | ${cut != null && p.evaComp >= cut ? "★ sí" : "no"} |`);
    L.push("");
  }
  if (closed.length) {
    L.push("## Resultados de los puts CERRADOS", "", `- **TODOS:** ${fmt(stat(closed))}`);
    for (const c of CELLS) { const cc = closed.filter((p) => p.delta === c.delta && p.dte === c.dte); if (cc.length) L.push(`- ${c.delta}Δ@${c.dte}d: ${fmt(stat(cc))}`); }
    L.push("", "### El filtro de EVA (¿la alta convicción baja la asignación?)",
      `- **Top⅓ EVA:** ${fmt(stat(topEva))}`, `- Bottom⅓ EVA: ${fmt(stat(botEva))}`, "",
      "Confirma el backtest **solo si** el Top⅓ EVA tiene MENOR asignación y MEJOR media que el Bottom⅓, con suficientes cierres (apunta a n≥30 por grupo).", "");
  } else {
    L.push("## Resultados", "", "_Aún no hay puts cerrados — los de 15d empiezan a liquidar en ~2 semanas, los de 30d en ~1 mes._", "");
  }
  if (open.length) {
    L.push("## Puts de papel ABIERTOS (próximos a vencer)", "", "| Ticker | Entrada | Vence | Celda | Strike | Conv. EVA |", "|---|---|---|---|---|---|");
    for (const p of [...open].sort((a, b) => a.expiryMs - b.expiryMs).slice(0, 25)) L.push(`| ${p.ticker} | ${p.entryDate} | ${p.expiryDate} | ${p.delta}Δ@${p.dte}d | $${p.strike} | ${p.evaComp} |`);
    if (open.length > 25) L.push(`| … | | | | | (+${open.length - 25}) |`);
    L.push("");
  }
  const report = L.join("\n") + "\n";
  await persist(ledger, report);
  console.log("\n" + report);
  console.log(STORE === "redis" ? `=== ledger en Redis "${REDIS_KEY}" ===` : `=== ledger: ${LEDGER} ===`);
  if (redis) await redis.quit();
})();
