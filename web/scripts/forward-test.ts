// FORWARD-TEST (paper trading) del credit spread filtrado por convicción de EVA.
// NO ejecuta órdenes reales — solo registra jugadas de PAPEL y las liquida a vencimiento
// contra el cierre real, para validar en datos GENUINAMENTE hacia adelante lo que el
// backtest encontró (el edge vive en el Top⅓ de convicción de EVA).
//
// Cada corrida hace 3 cosas:
//   1) ABRE: baja flujo reciente del panel, arma la señal neta del día y registra un credit
//      spread de papel (short a 1σ, ancho 0.5σ) en las celdas validadas (5d y 90d @1σ).
//      Deduplica por ticker|fecha|dte|σ → correr 2 veces el mismo día no duplica nada.
//   2) LIQUIDA: toda posición de papel ya vencida se cierra contra el cierre real del
//      subyacente en/tras el vencimiento → retorno sobre riesgo realizado.
//   3) REPORTA: estado del ledger + el VALOR DEL FILTRO (Top⅓ vs Bottom⅓ por convicción
//      de EVA) sobre las jugadas ya cerradas.
//
// Uso:  node --env-file=.env.local --import tsx scripts/forward-test.ts
// Programable a diario (el ledger es un JSON versionable en el repo).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import Redis from "ioredis";
import { PANEL_TICKERS } from "../lib/panel";
import { fetchFlow, fetchDailyBars } from "../lib/flowProvider";
import {
  classifyFlow, executionLevel, executionScore, spreadScore, spreadPct, unusualTradeScore, type FlowRow,
} from "../lib/flow";
import { bsPrice, impliedVol } from "../lib/blackScholes";

// ── Parámetros ────────────────────────────────────────────────────────────────
const TICKERS = (process.env.FWD_TICKERS || PANEL_TICKERS.join(",")).split(",").map((t) => t.trim()).filter(Boolean);
const FWD_DAYS = Number(process.env.FWD_DAYS) || 10;        // ventana de flujo a revisar por corrida
const MIN_PREMIUM = Number(process.env.FWD_MIN_PREMIUM) || 1_000_000;
const LEDGER = process.env.FWD_LEDGER || "data/forward/ledger.json";
const REPORT = process.env.FWD_REPORT || "data/forward/forward-report.md";
// Almacenamiento: "redis" en Railway (persistente, sin git), "file" en local. Autodetecta
// redis si hay REDIS_URL. En Railway el ledger vive en la key FWD_REDIS_KEY.
const STORE = (process.env.FWD_STORE || (process.env.REDIS_URL ? "redis" : "file")).toLowerCase();
const REDIS_KEY = process.env.FWD_REDIS_KEY || "forward:ledger";
const SLIP = Number(process.env.FWD_SLIP ?? 0.05);         // 5% de slippage al abrir (conservador, dentro de lo validado)
const COMM = Number(process.env.FWD_COMM ?? 0.03);         // comisión Robinhood ~$0.03/contrato
const WIDTH_EM = 0.5;                                       // ancho del spread = 0.5σ
// Celdas validadas: 5d = feedback rápido (semanal), 90d = la más fuerte del backtest.
// Celdas: 90d es la ROBUSTA del backtest de 4 años (OOS +3,1/+6,2, aguanta 15% de slippage).
// 60d también pasó OOS (+2,5%) y cierra un mes ANTES → veredicto más rápido.
// 5d se mantiene como CONTROL: el backtest dice que falla y en vivo va -14% — sirve para
// confirmar que el sistema distingue lo bueno de lo malo, no solo para operarlo.
const CELLS: { dte: number; sigma: number }[] = (process.env.FWD_CELLS || "5@1,60@1,90@1")
  .split(",").map((s) => { const [d, g] = s.split("@"); return { dte: Number(d), sigma: Number(g) }; });
const YR = 365 * 24 * 3600 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Ledger ──────────────────────────────────────────────────────────────────
interface Trade {
  id: string; ticker: string; entryDate: string; entryMs: number;
  dte: number; sigma: number; dir: 1 | -1; type: "put" | "call";
  spot: number; rv: number; shortK: number; longK: number; width: number;
  credit: number; netCredit: number; expiryMs: number; expiryDate: string;
  evaComp: number; victorComp: number;
  status: "open" | "closed";
  exitDate?: string; exitSpot?: number; retOnRisk?: number; pnlPerSpread?: number;
}
let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    if (!process.env.REDIS_URL) throw new Error("FWD_STORE=redis pero falta REDIS_URL en el entorno");
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return redis;
}
function readJsonFile(path: string): Trade[] {
  try { return JSON.parse(readFileSync(path, "utf8")) as Trade[]; } catch { return []; }
}
function saveJson(path: string, data: unknown) {
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}
// Carga el ledger del backend activo. En redis: si la key está vacía (primera vez),
// SIEMBRA desde el JSON committeado para no perder las 64 jugadas iniciales.
async function loadLedger(): Promise<Trade[]> {
  if (STORE === "redis") {
    const raw = await getRedis().get(REDIS_KEY);
    if (raw) { try { return JSON.parse(raw) as Trade[]; } catch { return []; } }
    return readJsonFile(LEDGER); // semilla desde git la primera vez
  }
  return readJsonFile(LEDGER);
}
// Persiste ledger + reporte en el backend activo.
async function persist(ledger: Trade[], report: string) {
  if (STORE === "redis") {
    const r = getRedis();
    await r.set(REDIS_KEY, JSON.stringify(ledger));
    await r.set(`${REDIS_KEY}:report`, report);
    return;
  }
  saveJson(LEDGER, ledger);
  saveJson(REPORT, report);
}

// ── Helpers de barras / señal (copiados del backtest para mantener el script aislado) ──
interface DBar { time: string; close: number }
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
  const ratio = iv / rv;
  if (ratio < 0.9) return 10;
  if (ratio <= 1.2) return 7;
  if (ratio <= 1.6) return 4;
  return 0;
}

interface Signal { entryDate: string; entryIdx: number; spot: number; rv: number; dir: 1 | -1; evaComp: number; victorComp: number; entryMs: number }
// Igual que el backtest: agrupa el flujo por DÍA → dirección neta + composite de convicción.
// Diferencia: NO exige una barra "siguiente" (en vivo entramos al cierre del último día).
function signals(rows: FlowRow[], bars: DBar[]): Signal[] {
  const byDay = new Map<string, FlowRow[]>();
  for (const r of rows) {
    const d = r.timestamp.slice(0, 10);
    const arr = byDay.get(d); if (arr) arr.push(r); else byDay.set(d, [r]);
  }
  const out: Signal[] = [];
  for (const [d, dayRows] of byDay) {
    const entryIdx = barIdxOnOrBefore(bars, Date.parse(`${d}T20:00:00Z`));
    if (entryIdx < 20) continue;
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
    const victorComp = ((wa / 10) * 20 + (wc / 10) * 20 + (wu / 10) * 20 + (wi / 10) * 10) / 70 * 100;
    const evaComp = ((wc / 10) * 30 + (wu / 10) * 20 + (wi / 10) * 15 + (wa / 10) * 10) / 75 * 100;
    out.push({ entryDate: d, entryIdx, spot, rv, dir: net > 0 ? 1 : -1, evaComp, victorComp, entryMs: Date.parse(`${d}T20:00:00Z`) });
  }
  return out;
}

// ── Abrir / liquidar un credit spread de papel ────────────────────────────────
function openSpread(sig: Signal, dte: number, sigma: number): Trade | null {
  const { spot, rv, entryMs, dir } = sig;
  const T = dte / 365;
  const em = spot * rv * Math.sqrt(dte / 365);
  if (!(em > 0)) return null;
  const bull = dir === 1;
  const type: "put" | "call" = bull ? "put" : "call";       // a favor: bull→put spread abajo, bear→call spread arriba
  const shortK = bull ? spot - sigma * em : spot + sigma * em;
  const longK = bull ? shortK - WIDTH_EM * em : shortK + WIDTH_EM * em;
  if (shortK <= 0 || longK <= 0) return null;
  const credit = bsPrice(spot, shortK, T, rv, type) - bsPrice(spot, longK, T, rv, type);
  const width = Math.abs(shortK - longK);
  if (!(credit > 0) || !(width > 0)) return null;
  const netCredit = credit * (1 - SLIP) - (COMM * 2) / 100;  // crédito tras slippage + comisión de 2 patas
  if (!(netCredit > 0)) return null;
  const expiryMs = entryMs + dte * 86_400_000;
  return {
    id: "", // se completa abajo con `${ticker}|${entryDate}|${dte}|${sigma}`
    ticker: "", entryDate: sig.entryDate, entryMs,
    dte, sigma, dir, type,
    spot: round(spot), rv: round(rv, 4), shortK: round(shortK), longK: round(longK), width: round(width),
    credit: round(credit, 4), netCredit: round(netCredit, 4), expiryMs, expiryDate: new Date(expiryMs).toISOString().slice(0, 10),
    evaComp: round(sig.evaComp, 1), victorComp: round(sig.victorComp, 1),
    status: "open",
  };
}
function settle(t: Trade, bars: DBar[]): boolean {
  const expIdx = barIdxOnOrAfter(bars, t.expiryMs);
  if (expIdx < 0) return false; // aún no hay cierre tras el vencimiento en los datos
  const sExp = bars[expIdx].close;
  const bull = t.dir === 1;
  const shortIntr = bull ? Math.max(t.shortK - sExp, 0) : Math.max(sExp - t.shortK, 0);
  const longIntr = bull ? Math.max(t.longK - sExp, 0) : Math.max(sExp - t.longK, 0);
  const pnlPerShare = t.netCredit - (shortIntr - longIntr);
  const risk = t.width - t.netCredit;
  t.retOnRisk = round((risk > 0 ? pnlPerShare / risk : pnlPerShare / t.width) * 100, 1);
  t.pnlPerSpread = round(pnlPerShare * 100, 2);
  t.exitSpot = round(sExp);
  t.exitDate = bars[expIdx].time;
  t.status = "closed";
  return true;
}
function round(x: number, d = 2): number { const p = 10 ** d; return Math.round(x * p) / p; }

// ── Estadística ───────────────────────────────────────────────────────────────
interface Stat { n: number; win: number | null; mean: number | null; median: number | null }
function stat(v: number[]): Stat {
  if (v.length === 0) return { n: 0, win: null, mean: null, median: null };
  const s = [...v].sort((a, b) => a - b);
  return { n: s.length, win: Math.round((s.filter((x) => x > 0).length / s.length) * 100), mean: Math.round((s.reduce((a, x) => a + x, 0) / s.length) * 10) / 10, median: Math.round(s[Math.floor(s.length / 2)] * 10) / 10 };
}
const fmt = (s: Stat) => s.n === 0 ? "—" : `win ${s.win}% · media ${s.mean}% · mediana ${s.median}% (n=${s.n})`;
function pctile(vals: number[], p: number): number | null {
  if (vals.length === 0) return null;
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`Forward-test credit spread · ${TICKERS.length} tickers · celdas ${CELLS.map((c) => `${c.dte}d@${c.sigma}σ`).join(", ")} · flujo ${FWD_DAYS}d · store=${STORE}`);
  const ledger = await loadLedger();
  const byId = new Map(ledger.map((t) => [t.id, t] as const));
  const barsByTicker = new Map<string, DBar[]>();
  const added: Trade[] = [];

  for (const t of TICKERS) {
    try {
      const { trades } = await fetchFlow(t, { targetDays: FWD_DAYS, minPremium: MIN_PREMIUM, contractCap: 25, maxPages: 6 });
      const { rows } = classifyFlow(trades, new Date());
      let bars: DBar[] = [];
      for (let i = 0; i < 4; i++) { bars = (await fetchDailyBars(t, 800).catch(() => [])) as DBar[]; if (bars.length > 0) break; await sleep(800 * (i + 1)); }
      if (!bars.length) { console.log(`[${t}] sin barras — omitido`); continue; }
      barsByTicker.set(t, bars);
      const sigs = signals(rows, bars);
      let newN = 0;
      for (const sig of sigs) {
        for (const cell of CELLS) {
          const rec = openSpread(sig, cell.dte, cell.sigma);
          if (!rec) continue;
          rec.ticker = t;
          rec.id = `${t}|${sig.entryDate}|${cell.dte}|${cell.sigma}`;
          if (byId.has(rec.id)) continue; // dedupe: ya registrado
          byId.set(rec.id, rec); ledger.push(rec); added.push(rec); newN++;
        }
      }
      console.log(`[${t}] señales ${sigs.length} · nuevas de papel ${newN}`);
    } catch (e) { console.error(`[${t}] ERROR:`, (e as Error).message); }
    await sleep(2500);
  }

  // Liquidar las vencidas (usa las barras recién bajadas de cada ticker).
  let settled = 0;
  for (const t of ledger) {
    if (t.status !== "open") continue;
    const bars = barsByTicker.get(t.ticker);
    if (!bars) continue;
    if (Date.now() < t.expiryMs) continue;
    if (settle(t, bars)) settled++;
  }

  // ── Reporte ──────────────────────────────────────────────────────────────
  const closed = ledger.filter((t) => t.status === "closed");
  const open = ledger.filter((t) => t.status === "open");
  const allEva = ledger.map((t) => t.evaComp);
  const cut = pctile(allEva, 2 / 3); // umbral vivo de "alta convicción" (Top⅓) sobre lo acumulado

  const L: string[] = [
    "# Forward-test — credit spread filtrado por convicción de EVA",
    "",
    `Corrida: ${new Date().toISOString().slice(0, 16)}Z · panel ${TICKERS.length} · celdas ${CELLS.map((c) => `${c.dte}d@${c.sigma}σ`).join(", ")}`,
    `Ledger: **${ledger.length}** de papel (**${open.length}** abiertas · **${closed.length}** cerradas). Nuevas esta corrida: **${added.length}** · liquidadas: **${settled}**.`,
    "",
    "> PAPEL — nada de esto es una orden real. Entrada al cierre del día de la señal; IV≈vol realizada 20d; slippage 5% + comisión Robinhood; vencimiento por calendario, sin gestión intermedia.",
    "",
  ];

  if (added.length) {
    L.push("## Nuevas jugadas de papel esta corrida", "", "| Ticker | Entrada | Celda | Dir | Convicción EVA | ¿Alta conv.? |", "|---|---|---|---|---|---|");
    for (const t of added.sort((a, b) => b.evaComp - a.evaComp)) {
      const hi = cut != null && t.evaComp >= cut ? "★ sí" : "no";
      L.push(`| ${t.ticker} | ${t.entryDate} | ${t.dte}d@${t.sigma}σ | ${t.dir === 1 ? "alcista (put spread)" : "bajista (call spread)"} | ${t.evaComp} | ${hi} |`);
    }
    L.push("");
  }

  L.push(`## Umbral vivo de alta convicción (Top⅓): **${cut != null ? round(cut, 1) : "—"}** (percentil 67 de la convicción EVA acumulada)`, "");

  if (closed.length) {
    L.push("## Resultados de las jugadas CERRADAS (datos hacia adelante)", "");
    // Global + por celda
    L.push(`- **TODAS:** ${fmt(stat(closed.map((t) => t.retOnRisk!)))}`);
    for (const cell of CELLS) {
      const cc = closed.filter((t) => t.dte === cell.dte && t.sigma === cell.sigma);
      if (cc.length) L.push(`- ${cell.dte}d@${cell.sigma}σ: ${fmt(stat(cc.map((t) => t.retOnRisk!)))}`);
    }
    // EL FILTRO: Top⅓ vs Bottom⅓ por convicción de EVA (misma metodología validada)
    const k = Math.max(1, Math.floor(closed.length / 3));
    const byEva = [...closed].sort((a, b) => a.evaComp - b.evaComp);
    const topEva = byEva.slice(closed.length - k), botEva = byEva.slice(0, k);
    const byVic = [...closed].sort((a, b) => a.victorComp - b.victorComp).slice(closed.length - k);
    L.push(
      "",
      "### El valor del filtro en vivo (¿la alta convicción de EVA rinde mejor?)",
      `- **Top⅓ EVA:** ${fmt(stat(topEva.map((t) => t.retOnRisk!)))}`,
      `- Bottom⅓ EVA: ${fmt(stat(botEva.map((t) => t.retOnRisk!)))}`,
      `- Top⅓ Victor (comparación): ${fmt(stat(byVic.map((t) => t.retOnRisk!)))}`,
      "",
      "Se confirma el hallazgo del backtest **solo si** el Top⅓ EVA le gana a TODAS y al Bottom⅓ una vez haya suficientes cierres (apunta a n≥30 por grupo antes de sacar conclusiones).",
      "",
    );
  } else {
    L.push("## Resultados", "", "_Aún no hay jugadas cerradas — las de 5d empiezan a liquidar en ~1 semana; las de 90d en ~3 meses. Vuelve a correr el script periódicamente._", "");
  }

  if (open.length) {
    L.push("## Posiciones de papel ABIERTAS (próximas a vencer primero)", "", "| Ticker | Entrada | Vence | Celda | Dir | Conv. EVA |", "|---|---|---|---|---|---|");
    for (const t of [...open].sort((a, b) => a.expiryMs - b.expiryMs).slice(0, 25)) {
      L.push(`| ${t.ticker} | ${t.entryDate} | ${t.expiryDate} | ${t.dte}d@${t.sigma}σ | ${t.dir === 1 ? "↑" : "↓"} | ${t.evaComp} |`);
    }
    if (open.length > 25) L.push(`| … | | | | | (+${open.length - 25} más) |`);
    L.push("");
  }

  const report = L.join("\n") + "\n";
  await persist(ledger, report);
  console.log("\n" + report);
  console.log(STORE === "redis"
    ? `=== ledger en Redis key "${REDIS_KEY}" (reporte en "${REDIS_KEY}:report") ===`
    : `=== ledger: ${LEDGER} · reporte: ${REPORT} ===`);
  if (redis) await redis.quit(); // cierra la conexión para que el proceso (cron) termine
})();
