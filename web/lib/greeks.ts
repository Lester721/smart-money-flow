// Extensión de blackScholes.ts para el proveedor de Time & Sales (Massive).
//
// El NÚCLEO Black-Scholes (precio, delta, gamma, IV implícita) vive en blackScholes.ts —
// fuente ÚNICA compartida con GEX y Wheel (r = RISK_FREE = 0.04). Aquí solo añadimos lo que
// blackScholes no expone —vega y theta— y el wrapper `tradeGreeks`, que arma todas las
// griegas de una operación a partir de su precio real. Antes esto duplicaba el núcleo;
// ahora delega en blackScholes para no divergir y para no chocar con los sync de Victor.

import { bsDelta, bsGamma, impliedVol, RISK_FREE } from "./blackScholes";
import { normCdf } from "./expectedMove";

const phi = (x: number): number => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

function d1(spot: number, strike: number, T: number, iv: number, r = RISK_FREE): number {
  return (Math.log(spot / strike) + (r + 0.5 * iv * iv) * T) / (iv * Math.sqrt(T));
}

const valid = (spot: number, strike: number, T: number, iv: number): boolean =>
  spot > 0 && strike > 0 && T > 0 && iv > 0;

/** Vega (por 1.00 de vol). blackScholes.ts no la expone. */
export function bsVega(spot: number, strike: number, T: number, iv: number): number {
  if (!valid(spot, strike, T, iv)) return 0;
  return spot * phi(d1(spot, strike, T, iv)) * Math.sqrt(T);
}

/** Theta por AÑO (÷365 para theta diaria). Usa r = RISK_FREE, consistente con blackScholes. */
export function bsTheta(
  spot: number, strike: number, T: number, iv: number, isCall: boolean,
): number {
  if (!valid(spot, strike, T, iv)) return 0;
  const D1 = d1(spot, strike, T, iv);
  const D2 = D1 - iv * Math.sqrt(T);
  const decay = -(spot * phi(D1) * iv) / (2 * Math.sqrt(T));
  const rate = RISK_FREE * strike * Math.exp(-RISK_FREE * T);
  return isCall ? decay - rate * normCdf(D2) : decay + rate * normCdf(-D2);
}

export interface TradeGreeks {
  iv: number | null;
  delta: number | null;
  gamma: number;
  theta: number; // por año
  vega: number;
}

/**
 * Todas las griegas de una operación, desde su precio real y el subyacente del momento.
 * Delega el núcleo en blackScholes (delta/gamma/IV) y añade vega/theta.
 */
export function tradeGreeks(
  tradePrice: number, spot: number, strike: number, T: number, isCall: boolean,
): TradeGreeks {
  const type = isCall ? "call" : "put";
  const iv = impliedVol(tradePrice, spot, strike, T, type);
  if (iv == null) {
    // Sin solución de IV: opción muy ITM que imprime a/bajo su intrínseco → delta límite ±1
    // (si no, delta 0 excluiría por error el filtro |Δ|>0.60).
    const intrinsic = Math.max(isCall ? spot - strike : strike - spot, 0);
    if (intrinsic > 0 && tradePrice <= intrinsic + 0.02 * Math.max(spot, 1)) {
      return { iv: null, delta: isCall ? 1 : -1, gamma: 0, theta: 0, vega: 0 };
    }
    return { iv: null, delta: null, gamma: 0, theta: 0, vega: 0 };
  }
  return {
    iv,
    delta: bsDelta(spot, strike, T, iv, type),
    gamma: bsGamma(spot, strike, T, iv),
    theta: bsTheta(spot, strike, T, iv, isCall),
    vega: bsVega(spot, strike, T, iv),
  };
}
