// Cliente ThetaData (API v3, Theta Terminal local en :25503). PARALELO a massive.ts — NO lo toca.
// Massive queda como fallback hasta verificar paridad. Provee el FLUJO (fetchFlow) sobre ThetaData:
//   · trade_quote  → cada trade YA emparejado con su NBBO (agresor exacto en 1 llamada)
//   · implied_volatility → spot (underlying_price) + IV real por minuto
//   · open_interest (bulk) → OI por contrato
// Ventaja vs Massive: no hay que pedir el quote por-trade ni hacer el as-of join de quotes;
// ThetaData lo entrega junto. El spot sale del endpoint de IV (incluido en Standard Options).
//
// Nota: los endpoints SNAPSHOT (vivo) hoy están bloqueados por Norton (feed en tiempo real);
// los HISTÓRICOS funcionan. Este cliente usa históricos (que es lo que backtests + flujo reciente
// necesitan). Para el vivo intradía haría falta la excepción de Norton al feed.

import type { RawTrade } from "./flow";
import { tradeGreeks } from "./greeks";
import { isMultiLegCondition, isCanceledCondition } from "./conditions";
import { sideFor } from "./massiveFlow";
import type { FetchFlowOptions, FlowResult } from "./massiveFlow";

const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const YEAR_MS = 365 * 24 * 3600 * 1000;

// ── CSV ────────────────────────────────────────────────────────────────────
interface Csv { header: string[]; rows: string[][] }
const unq = (s: string) => s.replace(/^"(.*)"$/, "$1");

async function getCsv(path: string): Promise<Csv | null> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) return null; // 403/404/etc. → sin datos (mensaje de error, no CSV)
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  // Los mensajes de error de ThetaData son prosa (con espacios) o HTML; los headers CSV no tienen
  // espacios ni "<". Así aceptamos tanto los de opción ("symbol,...") como los de acción ("created,...").
  if (lines[0].includes(" ") || lines[0].includes("<")) return null;
  const header = lines[0].split(",").map(unq);
  const rows = lines.slice(1).map((l) => l.split(",").map(unq));
  return { header, rows };
}
const idx = (h: string[], name: string) => h.indexOf(name);

/** map con concurrencia limitada (el Theta Terminal permite ~4 requests a la vez). */
async function pMapT<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const res: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const j = i++; res[j] = await fn(items[j]); }
  }));
  return res;
}

/** "2024-11-08" → "20241108" (formato de expiración/fecha que piden los endpoints). */
const yyyymmdd = (d: string) => d.replace(/-/g, "");

/** Timestamp ET-naïve de ThetaData ("2024-11-04T09:30:00.471") → ms. Se trata como UTC para
 *  un reloj CONSISTENTE entre trades y spot (el as-of join y la prima no dependen del offset;
 *  el epoch absoluto queda ~ offset ET corrido, refinable después). */
const tsToMs = (iso: string): number => Date.parse(`${iso}Z`);

// ── Condiciones OPRA (mismo catálogo de Victor; 255 = "sin condición" en ThetaData) ──────────
function primaryCondition(ids: number[]): number | undefined {
  const valid = ids.filter((n) => Number.isFinite(n) && n !== 255 && n !== 0);
  for (const id of valid) if (isMultiLegCondition(id)) return id;
  for (const id of valid) if (isCanceledCondition(id)) return id;
  return valid[0];
}
function sentimentFor(side: string): string {
  if (side === "ABOVE_ASK" || side === "AT_ASK") return "bullish";
  if (side === "BELOW_BID" || side === "AT_BID") return "bearish";
  return "neutral";
}

// ── Serie de spot (underlying) para una expiración/fecha, desde el endpoint de IV ────────────
/** [tMs, underlying][] ascendente, deduplicado por timestamp (el subyacente repite entre strikes). */
async function fetchSpotSeries(symbol: string, expYmd: string, dateYmd: string): Promise<[number, number][]> {
  const csv = await getCsv(
    `/v3/option/history/greeks/implied_volatility?symbol=${symbol}&expiration=${expYmd}&date=${dateYmd}&interval=1m`,
  );
  if (!csv) return [];
  const iTs = idx(csv.header, "underlying_timestamp");
  const iPx = idx(csv.header, "underlying_price");
  if (iTs < 0 || iPx < 0) return [];
  const seen = new Set<number>();
  const out: [number, number][] = [];
  for (const r of csv.rows) {
    const t = tsToMs(r[iTs]);
    const px = Number(r[iPx]);
    if (!Number.isFinite(t) || !(px > 0) || seen.has(t)) continue;
    seen.add(t);
    out.push([t, px]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

/** Spot en (o justo antes de) tMs. Búsqueda binaria. */
function spotAt(series: [number, number][], tMs: number): number | null {
  if (!series.length || tMs < series[0][0]) return series.length ? series[0][1] : null;
  let lo = 0, hi = series.length - 1, best: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= tMs) { best = series[mid][1]; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}

// ── OI por contrato (bulk, una llamada para todo el símbolo) ─────────────────────────────────
/** Map "EXP|STRIKE|RIGHT" → open interest (EXP en YYYY-MM-DD, RIGHT CALL/PUT), as-of `dateYmd`. */
async function fetchOpenInterestMap(symbol: string, dateYmd: string): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  // Histórico bulk (el snapshot vivo está bloqueado por Norton). expiration=* = todos los contratos.
  const csv = await getCsv(`/v3/option/history/open_interest?symbol=${symbol}&expiration=*&start_date=${dateYmd}&end_date=${dateYmd}`);
  if (!csv) return m;
  const iE = idx(csv.header, "expiration"), iK = idx(csv.header, "strike"), iR = idx(csv.header, "right"), iO = idx(csv.header, "open_interest");
  for (const r of csv.rows) {
    const oi = Number(r[iO]);
    if (Number.isFinite(oi)) m.set(`${r[iE]}|${Number(r[iK])}|${r[iR]}`, oi);
  }
  return m;
}

// ── Fechas ───────────────────────────────────────────────────────────────────────────────────
/** Últimos `days` días hábiles (aprox; ignora feriados) como YYYYMMDD, desc. */
function tradingDates(days: number): string[] {
  const out: string[] = [];
  const d = new Date();
  while (out.length < days) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

async function fetchExpirations(symbol: string): Promise<string[]> {
  const csv = await getCsv(`/v3/option/list/expirations?symbol=${symbol}`);
  if (!csv) return [];
  const iE = idx(csv.header, "expiration");
  return csv.rows.map((r) => r[iE]).filter(Boolean);
}

// ThetaData limita los rangos históricos a 1 MES por llamada → troceamos en ventanas de 28 días.
const dayMs = 86_400_000;
const parseYmd = (y: string) => Date.parse(`${y.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}T00:00:00Z`);
const toYmd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
function monthChunks(startYmd: string, endYmd: string): [string, string][] {
  const chunks: [string, string][] = [];
  let s = parseYmd(startYmd);
  const e = parseYmd(endYmd);
  while (s <= e) {
    const cEnd = Math.min(s + 27 * dayMs, e);
    chunks.push([toYmd(s), toYmd(cEnd)]);
    s = cEnd + dayMs;
  }
  return chunks;
}

// ── Subyacente DIARIO (para backtests) — barras de ACCIÓN limpias (suscripción Value Stocks) ──
// El stock EOD da un cierre por día, confiable y denso (derivar de opciones salía frágil).
/** Map "YYYYMMDD" → cierre diario del subyacente, sobre [startYmd, endYmd]. Troceado a ≤1 mes. */
export async function fetchDailyUnderlying(symbol: string, startYmd: string, endYmd: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const [cs, ce] of monthChunks(startYmd, endYmd)) {
    const csv = await getCsv(`/v3/stock/history/eod?symbol=${symbol}&start_date=${cs}&end_date=${ce}`);
    if (!csv) continue;
    const iC = idx(csv.header, "close");
    const iT = idx(csv.header, "last_trade") >= 0 ? idx(csv.header, "last_trade") : idx(csv.header, "created");
    if (iC < 0 || iT < 0) continue;
    for (const r of csv.rows) {
      const close = Number(r[iC]);
      const day = (r[iT] || "").slice(0, 10).replace(/-/g, "");
      if (day && close > 0) out.set(day, close);
    }
  }
  return out;
}

// ── Volumen por contrato (para seleccionar líquidos) — EOD bulk troceado ─────────────────────
interface VolInfo { vol: number; close: number }
async function fetchContractVolumes(symbol: string, startYmd: string, endYmd: string): Promise<Map<string, VolInfo>> {
  const m = new Map<string, VolInfo>();
  for (const [cs, ce] of monthChunks(startYmd, endYmd)) {
    const csv = await getCsv(`/v3/option/history/eod?symbol=${symbol}&expiration=*&start_date=${cs}&end_date=${ce}`);
    if (!csv) continue;
    const iE = idx(csv.header, "expiration"), iK = idx(csv.header, "strike"), iR = idx(csv.header, "right"),
      iV = idx(csv.header, "volume"), iC = idx(csv.header, "close");
    for (const r of csv.rows) {
      const key = `${r[iE]}|${Number(r[iK])}|${r[iR]}`;
      const vol = Number(r[iV]) || 0, close = Number(r[iC]) || 0;
      const prev = m.get(key);
      if (prev) { prev.vol += vol; if (close > 0) prev.close = close; }
      else m.set(key, { vol, close });
    }
  }
  return m;
}

// ── Flujo por RANGO de fechas (para backtests) — con SELECCIÓN de contratos ───────────────────
// En vez de bajar todo el tape por expiración (lento), seleccionamos los contratos LÍQUIDOS por
// dólar-volumen (EOD bulk, barato) y pedimos trade_quote SOLO de esos, con strike (respuesta
// ~100x menor). Mismo criterio que selectContracts de Massive.
export async function fetchFlowRange(
  symbol: string, startYmd: string, endYmd: string,
  opts: { minPremium?: number; contractCap?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<RawTrade[]> {
  const minPremium = opts.minPremium ?? 0;
  const cap = opts.contractCap ?? 120;
  const chunks = monthChunks(startYmd, endYmd);

  // 1. Volumen por contrato → seleccionar por dólar-volumen (¿podría un trade llegar a minPremium?).
  const volMap = await fetchContractVolumes(symbol, startYmd, endYmd);
  const selected = [...volMap.entries()]
    .map(([key, v]) => { const [exp, strike, right] = key.split("|"); return { exp, strike: Number(strike), right, dv: v.vol * v.close * 100 }; })
    .filter((c) => c.dv >= minPremium)
    .sort((a, b) => b.dv - a.dv)
    .slice(0, cap);

  // 2. Subyacente diario (spot/griegas).
  const daily = await fetchDailyUnderlying(symbol, startYmd, endYmd);

  // 3. trade_quote por contrato seleccionado (con strike+right → respuesta chica), EN PARALELO.
  let done = 0;
  const perContract = await pMapT(selected, 4, async (c) => {
    const local: RawTrade[] = [];
    const expYmd = yyyymmdd(c.exp);
    const expMs = Date.parse(`${c.exp}T20:00:00Z`);
    const rightWord = c.right.toUpperCase() === "CALL" ? "call" : "put";
    const isCall = rightWord === "call";
    for (const [cs, ce] of chunks) {
      if (parseYmd(cs) > expMs) break;
      const csv = await getCsv(`/v3/option/history/trade_quote?symbol=${symbol}&expiration=${expYmd}&strike=${c.strike.toFixed(3)}&right=${rightWord}&start_date=${cs}&end_date=${ce}`);
      if (!csv) continue;
      const h = csv.header;
      const iTts = idx(h, "trade_timestamp"), iCond = idx(h, "condition"), iSize = idx(h, "size"),
        iPx = idx(h, "price"), iBid = idx(h, "bid"), iAsk = idx(h, "ask");
      const iExt = ["ext_condition1", "ext_condition2", "ext_condition3", "ext_condition4"].map((n) => idx(h, n));
      for (const r of csv.rows) {
        const price = Number(r[iPx]), size = Number(r[iSize]);
        if (!(price > 0) || !(size > 0) || price * size * 100 < minPremium) continue;
        const tMs = tsToMs(r[iTts]);
        const dayYmd = (r[iTts] || "").slice(0, 10).replace(/-/g, "");
        const bid = Number(r[iBid]), ask = Number(r[iAsk]);
        const side = sideFor(price, Number.isFinite(bid) ? bid : null, Number.isFinite(ask) ? ask : null);
        const sp = daily.get(dayYmd) ?? null;
        const T = (expMs - tMs) / YEAR_MS;
        const g = sp != null && T > 0 ? tradeGreeks(price, sp, c.strike, T, isCall) : { iv: null, delta: null, gamma: 0, theta: 0, vega: 0 };
        const conds = [Number(r[iCond]), ...iExt.map((i) => Number(r[i]))].filter(Number.isFinite);
        local.push({
          id: 0, symbol: occFor(symbol, c.exp, c.strike, isCall), price, size, side,
          bid_price: Number.isFinite(bid) ? bid : 0, ask_price: Number.isFinite(ask) ? ask : 0,
          premium: price * size * 100, delta: g.delta ?? 0, gamma: g.gamma, theta: g.theta / 365, vega: g.vega,
          implied_volatility: g.iv ?? 0, open_interest: 0, volume: 0, score: 0, sentiment: sentimentFor(side),
          timestamp: new Date(tMs).toISOString(), asset_price: sp ?? undefined, trade_condition_id: primaryCondition(conds),
        });
      }
    }
    opts.onProgress?.(++done, selected.length);
    return local;
  });
  return perContract.flat().map((t, i) => ({ ...t, id: i }));
}

// ── trade_quote de una expiración/fecha → RawTrade[] notables ────────────────────────────────
async function tradesForExpDate(
  symbol: string, expYmd: string, dateYmd: string, minPremium: number,
  spot: [number, number][], oi: Map<string, number>,
): Promise<RawTrade[]> {
  const csv = await getCsv(`/v3/option/history/trade_quote?symbol=${symbol}&expiration=${expYmd}&date=${dateYmd}`);
  if (!csv) return [];
  const h = csv.header;
  const iStrike = idx(h, "strike"), iRight = idx(h, "right"), iTts = idx(h, "trade_timestamp");
  const iCond = idx(h, "condition"), iSize = idx(h, "size"), iPx = idx(h, "price"),
    iBid = idx(h, "bid"), iAsk = idx(h, "ask"), iExp = idx(h, "expiration");
  const iExt = ["ext_condition1", "ext_condition2", "ext_condition3", "ext_condition4"].map((n) => idx(h, n));

  const out: RawTrade[] = [];
  for (const r of csv.rows) {
    const price = Number(r[iPx]);
    const size = Number(r[iSize]);
    if (!(price > 0) || !(size > 0)) continue;
    if (price * size * 100 < minPremium) continue; // NOTABLE

    const strike = Number(r[iStrike]);
    const isCall = r[iRight].toUpperCase() === "CALL";
    const expDash = r[iExp]; // "2024-11-08"
    const tMs = tsToMs(r[iTts]);
    const bid = Number(r[iBid]);
    const ask = Number(r[iAsk]);
    const side = sideFor(price, Number.isFinite(bid) ? bid : null, Number.isFinite(ask) ? ask : null);

    const sp = spotAt(spot, tMs);
    const expiryMs = Date.parse(`${expDash}T20:00:00Z`);
    const T = (expiryMs - tMs) / YEAR_MS;
    const g = sp != null && T > 0
      ? tradeGreeks(price, sp, strike, T, isCall)
      : { iv: null, delta: null, gamma: 0, theta: 0, vega: 0 };

    const conds = [Number(r[iCond]), ...iExt.map((i) => Number(r[i]))].filter(Number.isFinite);
    const occ = occFor(symbol, expDash, strike, isCall);

    out.push({
      id: 0,
      symbol: occ,
      price, size, side,
      bid_price: Number.isFinite(bid) ? bid : 0,
      ask_price: Number.isFinite(ask) ? ask : 0,
      premium: price * size * 100,
      delta: g.delta ?? 0,
      gamma: g.gamma,
      theta: g.theta / 365,
      vega: g.vega,
      implied_volatility: g.iv ?? 0,
      open_interest: oi.get(`${expDash}|${strike}|${r[iRight].toUpperCase()}`) ?? 0,
      volume: 0, // volumen por-contrato no se usa aguas abajo; el ranking de Massive no aplica aquí
      score: 0,
      sentiment: sentimentFor(side),
      timestamp: new Date(tMs).toISOString(),
      asset_price: sp ?? undefined,
      trade_condition_id: primaryCondition(conds),
    });
  }
  return out;
}

/** OCC estilo Victor: "AAPL241108C00220000" (sin prefijo O:). */
export function occFor(symbol: string, expDash: string, strike: number, isCall: boolean): string {
  const yy = expDash.slice(2, 4), mm = expDash.slice(5, 7), dd = expDash.slice(8, 10);
  const k = String(Math.round(strike * 1000)).padStart(8, "0");
  return `${symbol}${yy}${mm}${dd}${isCall ? "C" : "P"}${k}`;
}

// ── fetchFlow — drop-in del de massiveFlow, sobre ThetaData ───────────────────────────────────
export interface ThetaFlowOptions extends FetchFlowOptions {
  /** Máx expiraciones a escanear (las más cercanas). Acota llamadas. Default 40. */
  expCap?: number;
  /** Solo expiraciones hasta N días hacia adelante desde hoy. Default 400. */
  expHorizonDays?: number;
  /** Fechas explícitas (YYYYMMDD) a escanear. Si se da, ignora targetDays. Para backtests/tests. */
  dates?: string[];
}

export async function fetchFlow(ticker: string, opts: ThetaFlowOptions = {}): Promise<FlowResult> {
  const days = opts.targetDays ?? 5;
  const minPremium = opts.minPremium ?? 0;
  const expCap = opts.expCap ?? 40;
  const horizon = opts.expHorizonDays ?? 400;

  const dates = opts.dates ?? tradingDates(days);   // YYYYMMDD, desc
  const allExps = await fetchExpirations(ticker);   // YYYY-MM-DD, asc
  const nowMs = Date.now();
  // Expiraciones vigentes durante la ventana: no vencidas al inicio, y dentro del horizonte.
  const winStartMs = tsToMs(`${dates[dates.length - 1]}`.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3T00:00:00"));
  const exps = allExps
    .filter((e) => {
      const em = Date.parse(`${e}T20:00:00Z`);
      return em >= winStartMs && em <= nowMs + horizon * 86_400_000;
    })
    .slice(0, expCap);

  const oi = await fetchOpenInterestMap(ticker, dates[0]);

  let scanned = 0;
  const all: RawTrade[] = [];
  for (const dateYmd of dates) {
    for (const expDash of exps) {
      const expYmd = yyyymmdd(expDash);
      if (Number(expYmd) < Number(dateYmd)) continue; // ya venció para esa fecha
      const spot = await fetchSpotSeries(ticker, expYmd, dateYmd);
      const rows = await tradesForExpDate(ticker, expYmd, dateYmd, minPremium, spot, oi);
      all.push(...rows);
      scanned += 1;
      await opts.onPage?.(scanned, rows.length);
    }
  }

  const trades = all.map((t, i) => ({ ...t, id: i }));
  return { trades, pages: scanned, truncated: false };
}
