// Proveedor de Time & Sales por Databento OPRA — reemplazo de MarketSnack.
//
// OPRA (Databento) entrega el tape crudo EXACTO: cada operación + el mejor bid/ask (BBO)
// en ese instante, pero SIN agresor ni griegos. Aquí producimos el mismo `RawTrade[]` que
// daba MarketSnack, calculando nosotros:
//   · el agresor (side) comparando el precio contra el BBO exacto,
//   · las griegas e IV con Black-Scholes (greeks.ts), desde el precio real y el subyacente
//     del momento.
//
// Este archivo tiene la TRANSFORMACIÓN pura (testeable, sin red). La descarga del tape y la
// selección de contratos (con cotización previa y control de presupuesto) van aparte.

import type { RawTrade } from "./flow";
import { tradeGreeks } from "./greeks";

/** Registro crudo de Databento, schema `tcbbo`, encoding json con pretty_px/pretty_ts. */
export interface DbLevel {
  bid_px?: string;
  ask_px?: string;
  bid_sz?: number;
  ask_sz?: number;
}
export interface DbRecord {
  hd?: { ts_event?: string };
  action?: string; // "T" = trade
  price?: string;
  size?: number;
  levels?: DbLevel[];
}

/**
 * Metadatos y LIMITACIONES de esta fuente, para que la interfaz muestre una nota honesta.
 * Databento OPRA no expone las condiciones de operación de OPRA (se pierden en su
 * normalización; es una función pendiente en su roadmap), así que multileg y el filtro de
 * cancelados quedan inactivos con esta fuente. Se resuelven con Massive Advanced ($199/mes),
 * que sí trae las condiciones OPRA.
 */
export const DATABENTO_SOURCE = {
  id: "databento",
  label: "Databento OPRA (tape exacto)",
  limitations: [
    "Multileg: no disponible (Databento no expone la condición OPRA).",
    "Filtro de cancelados: inactivo (misma razón).",
  ],
} as const;

/** OSI de Databento (root con espacios, "AAPL  260724C00320000") → OCC de Victor (sin espacios). */
export function osiToOcc(osi: string): string {
  return osi.replace(/\s+/g, "");
}

/** Clasifica el agresor con los strings que reconoce `aggressionOf` en flow.ts. */
export function sideFor(price: number, bid: number | null, ask: number | null): string {
  if (bid == null || ask == null || !(ask > 0) || ask < bid) return "MIDMKT";
  if (price > ask) return "ABOVE_ASK";
  if (price === ask) return "AT_ASK";
  if (price < bid) return "BELOW_BID";
  if (price === bid) return "AT_BID";
  return "MIDMKT";
}

function sentimentFor(side: string): string {
  if (side === "ABOVE_ASK" || side === "AT_ASK") return "bullish";
  if (side === "BELOW_BID" || side === "AT_BID") return "bearish";
  return "neutral";
}

export interface ContractContext {
  osiSymbol: string; // "AAPL  260724C00320000"
  strike: number;
  expiration: string; // YYYY-MM-DD
  isCall: boolean;
  openInterest: number;
  volume: number;
  /** Precio del subyacente por minuto: [ [tsMs, close], ... ] ordenado ascendente. */
  underlyingBars: [number, number][];
}

/** Precio del subyacente en (o justo antes de) el instante del trade. Búsqueda binaria. */
export function underlyingAt(bars: [number, number][], tsMs: number): number | null {
  if (!bars.length) return null;
  if (tsMs < bars[0][0]) return bars[0][1];
  let lo = 0;
  let hi = bars.length - 1;
  let best: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid][0] <= tsMs) {
      best = bars[mid][1];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

const YEAR_MS = 365 * 24 * 3600 * 1000;

/**
 * Convierte los registros crudos de Databento (tcbbo) de UN contrato en `RawTrade[]`,
 * con el mismo shape que entregaba MarketSnack.
 */
export function recordsToRawTrades(
  records: DbRecord[],
  ctx: ContractContext,
  startId = 0,
): RawTrade[] {
  const occ = osiToOcc(ctx.osiSymbol);
  // Vencimiento al cierre (16:00 ET ≈ 20:00Z en verano).
  const expiryMs = Date.parse(`${ctx.expiration}T20:00:00Z`);
  const out: RawTrade[] = [];
  let id = startId;

  for (const r of records) {
    if (r.action && r.action !== "T") continue; // solo operaciones
    const price = Number(r.price);
    const size = Number(r.size ?? 0);
    const ts = r.hd?.ts_event;
    if (!(price > 0) || !(size > 0) || !ts) continue;

    const tsMs = Date.parse(ts);
    const lv = r.levels?.[0] ?? {};
    const bid = lv.bid_px != null ? Number(lv.bid_px) : null;
    const ask = lv.ask_px != null ? Number(lv.ask_px) : null;
    const side = sideFor(price, bid, ask);

    const spot = underlyingAt(ctx.underlyingBars, tsMs);
    const T = (expiryMs - tsMs) / YEAR_MS;
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
      theta: g.theta / 365, // theta diaria (convención de MarketSnack/flow.ts)
      vega: g.vega,
      implied_volatility: g.iv ?? 0,
      open_interest: ctx.openInterest,
      volume: ctx.volume,
      score: 0, // MarketSnack ponía su propio score; flow.ts recalcula el suyo → no se usa
      sentiment: sentimentFor(side),
      timestamp: ts,
      asset_price: spot ?? undefined,
      // Multileg: Databento OPRA no expone aquí el trade_condition_id de OPRA. PENDIENTE.
      trade_condition_id: undefined,
    });
  }
  return out;
}
