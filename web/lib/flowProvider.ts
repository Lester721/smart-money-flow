// Selector de proveedor de FLUJO. Permite conmutar Massive ⇄ ThetaData sin borrar Massive
// (que queda como fallback). Default = Massive, así nada cambia hasta poner DATA_PROVIDER=theta.
//
//   DATA_PROVIDER=theta   → ThetaData (requiere el Theta Terminal corriendo en :25503)
//   DATA_PROVIDER=massive → Massive (default)
//
// Nota: el Theta Terminal corre LOCAL. En Railway habría que correr el jar como servicio propio
// (o seguir con Massive allá) — ver docs/Proveedores-Datos-Opciones.md.

import * as massiveFlow from "./massiveFlow";
import * as thetadata from "./thetadata";
import { fetchDailyBars as massiveDailyBars, fetchBars as massiveBars } from "./massive";
import type { FetchFlowOptions, FlowResult } from "./massiveFlow";

export const DATA_PROVIDER = (process.env.DATA_PROVIDER || "massive").toLowerCase();
export const usingTheta = DATA_PROVIDER === "theta";

/** fetchFlow del proveedor activo. Misma firma y mismo RawTrade[] en ambos. */
export function fetchFlow(ticker: string, opts: FetchFlowOptions = {}): Promise<FlowResult> {
  return usingTheta ? thetadata.fetchFlow(ticker, opts) : massiveFlow.fetchFlow(ticker, opts);
}

// high/low son OPCIONALES porque no todos los caminos los traen, pero los dos proveedores SÍ los
// dan hoy: Massive de siempre, y ThetaData desde que se lee la cabecera entera del EOD. Quien los
// use debe comprobar que existen — un `undefined` leído como número es el fallo silencioso de
// siempre.
export interface DailyBar { time: string; close: number; high?: number; low?: number }

/** Barras diarias del subyacente del proveedor activo: {time, close, high, low}. */
export async function fetchDailyBars(ticker: string, days = 800): Promise<DailyBar[]> {
  if (!usingTheta) return (await massiveDailyBars(ticker, days)) as DailyBar[];
  // CON MÁXIMO Y MÍNIMO REALES. La versión anterior usaba `fetchDailyUnderlying`, que sólo
  // devuelve el cierre: las rutas que miden toques de umbral (validation) o el patrón histórico
  // (ideas) habrían seguido respondiendo 200, con números plausibles y CONCLUSIONES DISTINTAS,
  // sin un solo error. El endpoint EOD trae open/high/low/close/volume — comprobado pidiéndole
  // la cabecera al Terminal el 2026-08-15, no suponiéndolo.
  const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
  const end = Date.now();
  const barras = await thetadata.fetchBarrasDiarias(ticker, ymd(end - days * 86_400_000), ymd(end));
  return barras.map((b) => ({ time: b.time, close: b.close, high: b.high, low: b.low }));
}

/** Barras INTRADÍA del proveedor activo. Mismo shape en los dos: {time(seg), open, high, low, close}. */
export async function fetchBars(
  ticker: string, multiplier: number, timespan: "day" | "minute", days: number,
) {
  if (!usingTheta) return massiveBars(ticker, multiplier, timespan, days);
  // ThetaData pide el intervalo en minutos; "day" se traduce a la sesión entera (390 min).
  return thetadata.fetchBarrasIntradia(ticker, timespan === "day" ? 390 : multiplier, days);
}

/** Ficha de empresa del proveedor activo. Con ThetaData, la identidad sale de la SEC (gratis). */
export async function fetchCompany(ticker: string) {
  if (!usingTheta) {
    const { fetchCompany: massiveCompany } = await import("./massive");
    return massiveCompany(ticker);
  }
  const { fichaCompleta } = await import("./empresa");
  return fichaCompleta(ticker);
}

/**
 * Cadena de opciones del proveedor activo.
 *
 * Con ThetaData son DOS llamadas para toda la cadena (comodín `expiration=*`), así que no hay
 * paginación ni truncado: `pages: 1` y `truncated: false` no son un apaño, es que no aplican.
 * Massive paginaba con `next_url` y podía cortar la cadena a la mitad sin avisar.
 */
export async function fetchOptionChain(ticker: string, progress: { onPage?: (p: number, acc: number) => void } = {}) {
  if (!usingTheta) {
    const { fetchOptionChain: massiveChain } = await import("./massive");
    return massiveChain(ticker, progress);
  }
  const r = await thetadata.cadenaOpciones(ticker);
  if (!r) {
    // NO se devuelve una cadena vacía como si fuera un resultado: no haber encontrado ninguna
    // sesión con datos es un problema, y tiene que verse.
    throw new Error(`Sin cadena de opciones para ${ticker}: ninguna sesión con datos en los últimos 7 días.`);
  }
  progress.onPage?.(1, r.contracts.length);
  return { contracts: r.contracts as never[], underlyingPrice: r.underlyingPrice, pages: 1, truncated: false };
}
