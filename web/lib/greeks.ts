// Griegas Black-Scholes para el proveedor de Time & Sales por Databento.
//
// Por qué: OPRA (Databento) entrega solo trade + BBO, SIN delta ni IV. MarketSnack sí los
// daba ya calculados. Para producir el mismo `RawTrade` sin depender de MarketSnack, aquí
// calculamos delta/IV/gamma/theta/vega a partir del precio REAL de la operación y el precio
// del subyacente en ese instante.
//
// Convención alineada con el resto del proyecto de Victor: r = 0, sin dividendos
// (igual que `bsGamma` en gex.ts), para que las griegas sean consistentes con el GEX.

import { normCdf } from "./expectedMove";
import { bsGamma } from "./gex";

export { bsGamma };

/** Densidad normal estándar φ(x). */
function phi(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function d1of(spot: number, strike: number, T: number, iv: number): number {
  return (Math.log(spot / strike) + 0.5 * iv * iv * T) / (iv * Math.sqrt(T));
}

function valid(spot: number, strike: number, T: number, iv: number): boolean {
  return spot > 0 && strike > 0 && T > 0 && iv > 0;
}

/** Precio Black-Scholes (r = 0, sin dividendos). En el límite devuelve el valor intrínseco. */
export function bsPrice(
  spot: number,
  strike: number,
  T: number,
  iv: number,
  isCall: boolean,
): number {
  if (!valid(spot, strike, T, iv)) {
    return Math.max(isCall ? spot - strike : strike - spot, 0);
  }
  const d1 = d1of(spot, strike, T, iv);
  const d2 = d1 - iv * Math.sqrt(T);
  return isCall
    ? spot * normCdf(d1) - strike * normCdf(d2)
    : strike * normCdf(-d2) - spot * normCdf(-d1);
}

/** Delta Black-Scholes (r = 0). null si los insumos no son válidos. */
export function bsDelta(
  spot: number,
  strike: number,
  T: number,
  iv: number,
  isCall: boolean,
): number | null {
  if (!valid(spot, strike, T, iv)) return null;
  const d1 = d1of(spot, strike, T, iv);
  return isCall ? normCdf(d1) : normCdf(d1) - 1;
}

/** Vega Black-Scholes (por 1.00 de vol, no por 1%). */
export function bsVega(spot: number, strike: number, T: number, iv: number): number {
  if (!valid(spot, strike, T, iv)) return 0;
  const d1 = d1of(spot, strike, T, iv);
  return spot * phi(d1) * Math.sqrt(T);
}

/** Theta Black-Scholes por AÑO (r = 0). Dividir entre 365 para theta diaria. */
export function bsTheta(
  spot: number,
  strike: number,
  T: number,
  iv: number,
  _isCall: boolean,
): number {
  if (!valid(spot, strike, T, iv)) return 0;
  const d1 = d1of(spot, strike, T, iv);
  // Con r = 0 el término −rK·N(d2) desaparece → theta es igual para call y put.
  return -(spot * phi(d1) * iv) / (2 * Math.sqrt(T));
}

/**
 * IV implícita por bisección a partir del precio real de la operación (r = 0).
 * Devuelve null si el precio está por debajo del intrínseco o fuera del rango alcanzable.
 */
export function impliedVol(
  price: number,
  spot: number,
  strike: number,
  T: number,
  isCall: boolean,
  lo = 1e-4,
  hi = 5,
  tol = 1e-6,
): number | null {
  if (!(price > 0) || !(spot > 0) || !(strike > 0) || !(T > 0)) return null;
  const intrinsic = Math.max(isCall ? spot - strike : strike - spot, 0);
  if (price < intrinsic - 1e-6) return null;
  if (price > bsPrice(spot, strike, T, hi, isCall)) return null;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (a + b);
    const p = bsPrice(spot, strike, T, mid, isCall);
    if (Math.abs(p - price) < tol) return mid;
    if (p > price) b = mid;
    else a = mid;
  }
  return 0.5 * (a + b);
}

/** Todas las griegas de una operación, calculadas desde su precio real y el subyacente. */
export interface TradeGreeks {
  iv: number | null;
  delta: number | null;
  gamma: number;
  theta: number; // por año
  vega: number;
}

export function tradeGreeks(
  tradePrice: number,
  spot: number,
  strike: number,
  T: number,
  isCall: boolean,
): TradeGreeks {
  const iv = impliedVol(tradePrice, spot, strike, T, isCall);
  if (iv == null) return { iv: null, delta: null, gamma: 0, theta: 0, vega: 0 };
  return {
    iv,
    delta: bsDelta(spot, strike, T, iv, isCall),
    gamma: bsGamma(spot, strike, T, iv),
    theta: bsTheta(spot, strike, T, iv, isCall),
    vega: bsVega(spot, strike, T, iv),
  };
}
