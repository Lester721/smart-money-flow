// Valoración del iron condor. Vive fuera de backtestCore a propósito: ahí está el camino de la
// estrategia que corre hoy y de los cálculos de Victor, y no se toca.
//
// Un cóndor vende un put spread abajo Y un call spread arriba con el mismo vencimiento. Cobra
// las dos primas; a vencimiento solo UNA de las dos patas cortas puede acabar dentro del dinero.

import { WIDTH_EM, barIdxOnOrAfter, type DBar, type Signal } from "./backtestCore";
import { bsPrice } from "./blackScholes";

export interface CostesCondor {
  /** Fracción del crédito que se pierde al cruzar el spread. */
  slip: number;
  /** Comisión por contrato. El cóndor son 4 patas, así que paga el DOBLE que un vertical. */
  commPerContract: number;
}

/**
 * Retorno sobre el riesgo del cóndor, o null si no es operable (crédito ≤ 0 tras costes,
 * o crédito ≥ ancho — que sería dinero gratis y solo puede venir de un precio mal calculado).
 *
 * `sigmaMult` es la distancia de las patas cortas en unidades del movimiento esperado.
 */
export function ironCondorPnl(
  sig: Signal, bars: DBar[], dte: number, sigmaMult: number, costes: CostesCondor,
): number | null {
  const { spot, rv, entryIdx } = sig;
  const T = dte / 365;
  const em = spot * rv * Math.sqrt(dte / 365);
  if (!(em > 0)) return null;

  const shortPut = spot - sigmaMult * em, longPut = shortPut - WIDTH_EM * em;
  const shortCall = spot + sigmaMult * em, longCall = shortCall + WIDTH_EM * em;
  if (longPut <= 0) return null;

  const creditPut = bsPrice(spot, shortPut, T, rv, "put") - bsPrice(spot, longPut, T, rv, "put");
  const creditCall = bsPrice(spot, shortCall, T, rv, "call") - bsPrice(spot, longCall, T, rv, "call");
  const credit = creditPut + creditCall;
  const width = WIDTH_EM * em;
  if (!(credit > 0) || !(width > 0)) return null;

  const netCredit = credit * (1 - costes.slip) - (costes.commPerContract * 4) / 100;
  if (!(netCredit > 0)) return null;

  const expMs = Date.parse(`${bars[entryIdx].time}T20:00:00Z`) + dte * 86_400_000;
  const expIdx = barIdxOnOrAfter(bars, expMs);
  if (expIdx < 0) return null;
  const sExp = bars[expIdx].close;

  const perdidaPut = Math.max(shortPut - sExp, 0) - Math.max(longPut - sExp, 0);
  const perdidaCall = Math.max(sExp - shortCall, 0) - Math.max(sExp - longCall, 0);

  const risk = width - netCredit;
  if (!(risk > 0)) return null;
  return (netCredit - (perdidaPut + perdidaCall)) / risk;
}

/** Distancia de las patas cortas en % del subyacente — para comparar con la literatura, que
 *  habla de "5-10% OTM" y no de sigmas. */
export function distanciaPct(sig: Signal, dte: number, sigmaMult: number): number {
  const em = sig.spot * sig.rv * Math.sqrt(dte / 365);
  return (sigmaMult * em) / sig.spot;
}
