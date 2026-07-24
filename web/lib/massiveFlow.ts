// Proveedor de Time & Sales por MASSIVE Advanced — reemplazo definitivo de MarketSnack.
//
// Massive entrega el tape (trades) y el BBO (quotes) por SEPARADO. Aquí:
//   · emparejamos cada trade con el quote (BBO) vigente en su instante ("as-of join"),
//   · clasificamos el agresor comparando precio vs ese BBO,
//   · calculamos griegas/IV con greeks.ts,
//   · mapeamos las condiciones OPRA (multileg / cancelado) — los IDs de Massive coinciden
//     con el catálogo de Victor (conditions.ts).
// El resultado es el mismo RawTrade[] que daba MarketSnack.

import type { RawTrade } from "./flow";
import type { RawContract } from "./types";
import { tradeGreeks } from "./greeks";
import { sideFor, underlyingAt } from "./databento";
import { isMultiLegCondition, isCanceledCondition } from "./conditions";
import { fetchOptionChain, fetchBars, fetchOptionTrades, fetchAsOfQuote } from "./massive";

/** Trade crudo de Massive: /v3/trades/{O:...} */
export interface MassiveTrade {
  price: number;
  size: number;
  conditions?: number[];
  exchange?: number;
  sip_timestamp: number; // epoch NANOsegundos
}

/** Quote crudo de Massive: /v3/quotes/{O:...} */
export interface MassiveQuote {
  bid_price?: number;
  ask_price?: number;
  sip_timestamp: number; // epoch NANOsegundos
}

/** BBO liviano ya en milisegundos (los ns exceden el entero seguro de JS). */
export interface QuoteLite {
  tMs: number;
  bid: number | null;
  ask: number | null;
}

const nsToMs = (ns: number): number => Math.floor((ns || 0) / 1e6);

/** Convierte y ORDENA los quotes por tiempo (ms) para el as-of join. */
export function toQuoteLites(quotes: MassiveQuote[]): QuoteLite[] {
  return quotes
    .map((q) => ({ tMs: nsToMs(q.sip_timestamp), bid: q.bid_price ?? null, ask: q.ask_price ?? null }))
    .sort((a, b) => a.tMs - b.tMs);
}

/** Quote vigente en (o justo antes de) `tMs`. Búsqueda binaria; null si no hay uno previo. */
export function asOfQuote(quotes: QuoteLite[], tMs: number): QuoteLite | null {
  if (!quotes.length || tMs < quotes[0].tMs) return null;
  let lo = 0;
  let hi = quotes.length - 1;
  let best: QuoteLite | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (quotes[mid].tMs <= tMs) {
      best = quotes[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * Massive da un ARRAY de condiciones por trade; RawTrade espera una sola. Elegimos la más
 * relevante: multileg > cancelada > la primera. Los IDs de Massive == catálogo de Victor.
 */
export function primaryConditionId(ids: number[] | undefined): number | undefined {
  if (!ids || !ids.length) return undefined;
  for (const id of ids) if (isMultiLegCondition(id)) return id;
  for (const id of ids) if (isCanceledCondition(id)) return id;
  return ids[0];
}

/** "O:AAPL260724C00315000" → "AAPL260724C00315000" (OCC de Victor). */
export function occFromMassive(sym: string): string {
  return sym.replace(/^O:/, "");
}

function sentimentFor(side: string): string {
  if (side === "ABOVE_ASK" || side === "AT_ASK") return "bullish";
  if (side === "BELOW_BID" || side === "AT_BID") return "bearish";
  return "neutral";
}

export interface MassiveContractContext {
  massiveSymbol: string; // "O:AAPL260724C00315000"
  strike: number;
  expiration: string; // YYYY-MM-DD
  isCall: boolean;
  openInterest: number;
  volume: number;
  /** Precio del subyacente por minuto: [ [tsMs, close], ... ] ascendente. */
  underlyingBars: [number, number][];
}

const YEAR_MS = 365 * 24 * 3600 * 1000;

/** Trades + quotes de Massive de UN contrato → RawTrade[] (mismo shape que MarketSnack). */
export function massiveTradesToRawTrades(
  trades: MassiveTrade[],
  quotes: MassiveQuote[],
  ctx: MassiveContractContext,
  startId = 0,
): RawTrade[] {
  const occ = occFromMassive(ctx.massiveSymbol);
  const qs = toQuoteLites(quotes);
  const expiryMs = Date.parse(`${ctx.expiration}T20:00:00Z`); // cierre 16:00 ET ≈ 20:00Z
  const sorted = [...trades].sort((a, b) => a.sip_timestamp - b.sip_timestamp);

  const out: RawTrade[] = [];
  let id = startId;
  for (const t of sorted) {
    const price = Number(t.price);
    const size = Number(t.size ?? 0);
    if (!(price > 0) || !(size > 0)) continue;

    const tMs = nsToMs(t.sip_timestamp);
    const q = asOfQuote(qs, tMs);
    const bid = q?.bid ?? null;
    const ask = q?.ask ?? null;
    const side = sideFor(price, bid, ask);

    const spot = underlyingAt(ctx.underlyingBars, tMs);
    const T = (expiryMs - tMs) / YEAR_MS;
    const g =
      spot != null && T > 0
        ? tradeGreeks(price, spot, ctx.strike, T, ctx.isCall)
        : { iv: null, delta: null, gamma: 0, theta: 0, vega: 0 };

    out.push({
      id: id++,
      symbol: occ,
      price,
      size,
      side,
      bid_price: bid ?? 0,
      ask_price: ask ?? 0,
      premium: price * size * 100,
      delta: g.delta ?? 0,
      gamma: g.gamma,
      theta: g.theta / 365,
      vega: g.vega,
      implied_volatility: g.iv ?? 0,
      open_interest: ctx.openInterest,
      volume: ctx.volume,
      score: 0,
      sentiment: sentimentFor(side),
      timestamp: new Date(tMs).toISOString(),
      asset_price: spot ?? undefined,
      // Condición OPRA real → multileg/cancelado exactos (Victor los decodifica por id).
      trade_condition_id: primaryConditionId(t.conditions),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Orquestador: fetchFlow(ticker) — drop-in del fetchFlow de MarketSnack, sobre Massive.
// ---------------------------------------------------------------------------

export interface SelectedContract {
  ticker: string; // "O:AAPL260724C00315000"
  strike: number;
  expiration: string;
  isCall: boolean;
  openInterest: number;
  volume: number;
}

/**
 * Elige los contratos que vale la pena escanear: activos (volumen>0) y CAPACES de contener
 * un trade ≥ minPremium (volumen×precio×100). Ordena por volumen y limita a `cap` para acotar
 * las llamadas. Puro y testeable.
 */
export function selectContracts(
  contracts: RawContract[],
  minPremium: number,
  cap: number,
): SelectedContract[] {
  const out: SelectedContract[] = [];
  for (const c of contracts) {
    const ticker = c.details?.ticker;
    const strike = c.details?.strike_price;
    const expiration = c.details?.expiration_date;
    const ct = c.details?.contract_type;
    const volume = c.day?.volume ?? 0;
    const close = c.day?.close ?? c.last_trade?.price ?? 0;
    if (!ticker || !strike || !expiration || !ct || volume <= 0) continue;
    // ¿podría un solo trade de este contrato llegar a minPremium?
    if (minPremium > 0 && volume * close * 100 < minPremium) continue;
    out.push({
      ticker,
      strike,
      expiration,
      isCall: ct === "call",
      openInterest: c.open_interest ?? 0,
      volume,
    });
  }
  out.sort((a, b) => b.volume - a.volume);
  return cap > 0 ? out.slice(0, cap) : out;
}

/** Ejecuta `fn` sobre `items` con concurrencia limitada (respeta el rate limit). */
async function pMap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface FetchFlowOptions {
  period?: string;
  maxPages?: number;
  minPremium?: number;
  targetDays?: number;
  onPage?: (page: number, accumulated: number) => void | Promise<void>;
  contractCap?: number; // tope de contratos a escanear (default 60)
  concurrency?: number; // llamadas en paralelo (default 6)
}

export interface FlowResult {
  trades: RawTrade[];
  pages: number;
  truncated: boolean;
}

function periodDays(period?: string): number {
  if (!period) return 5;
  const n = parseInt(period, 10) || 1;
  if (period.endsWith("m")) return n * 30;
  return n; // "5d" → 5
}

/**
 * Time & Sales de un ticker desde Massive: selecciona contratos capaces, baja su tape,
 * filtra los trades notables (≥ minPremium), consigue el BBO as-of de cada uno, y arma el
 * RawTrade[] con agresor + griegas + condiciones OPRA. Mismo shape que MarketSnack.
 */
export async function fetchFlow(ticker: string, opts: FetchFlowOptions = {}): Promise<FlowResult> {
  const days = opts.targetDays ?? periodDays(opts.period);
  const minPremium = opts.minPremium ?? 0;
  const cap = opts.contractCap ?? 60;
  const nowMs = Date.now();
  const gteNs = (nowMs - days * 86_400_000) * 1_000_000;
  const lteNs = nowMs * 1_000_000;

  // 1. Cadena (para elegir contratos) + barras de minuto del subyacente (asset_price).
  const [{ contracts }, bars] = await Promise.all([
    fetchOptionChain(ticker),
    fetchBars(ticker, 1, "minute", days),
  ]);
  const underlyingBars: [number, number][] = bars.map((b) => [b.time * 1000, b.close]);

  // 2. Selección de contratos capaces de tener un trade notable.
  const selected = selectContracts(contracts, minPremium, cap);

  // 3. Por contrato: tape → notables → BBO as-of por notable → RawTrade[].
  let page = 0;
  const perContract = await pMap(selected, opts.concurrency ?? 6, async (c) => {
    const rawTrades = await fetchOptionTrades(c.ticker, {
      gteNs, lteNs, maxPages: opts.maxPages ?? 10,
    });
    const notable = rawTrades.filter((t) => (t.price || 0) * (t.size || 0) * 100 >= minPremium);
    if (notable.length === 0) return [] as RawTrade[];
    // BBO as-of de cada notable (una llamada por trade notable).
    const quotes = await pMap(notable, 8, (t) => fetchAsOfQuote(c.ticker, t.sip_timestamp));
    const validQuotes = quotes.filter((q): q is NonNullable<typeof q> => q != null);
    const ctx: MassiveContractContext = {
      massiveSymbol: c.ticker,
      strike: c.strike,
      expiration: c.expiration,
      isCall: c.isCall,
      openInterest: c.openInterest,
      volume: c.volume,
      underlyingBars,
    };
    const rows = massiveTradesToRawTrades(notable, validQuotes, ctx);
    page += 1;
    await opts.onPage?.(page, rows.length);
    return rows;
  });

  const trades = perContract.flat().map((t, i) => ({ ...t, id: i }));
  return { trades, pages: selected.length, truncated: false };
}
