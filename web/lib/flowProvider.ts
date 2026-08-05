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
import { fetchDailyBars as massiveDailyBars } from "./massive";
import type { FetchFlowOptions, FlowResult } from "./massiveFlow";

export const DATA_PROVIDER = (process.env.DATA_PROVIDER || "massive").toLowerCase();
export const usingTheta = DATA_PROVIDER === "theta";

/** fetchFlow del proveedor activo. Misma firma y mismo RawTrade[] en ambos. */
export function fetchFlow(ticker: string, opts: FetchFlowOptions = {}): Promise<FlowResult> {
  return usingTheta ? thetadata.fetchFlow(ticker, opts) : massiveFlow.fetchFlow(ticker, opts);
}

export interface DailyBar { time: string; close: number }

/** Barras diarias del subyacente del proveedor activo (mismo shape: {time:"YYYY-MM-DD", close}). */
export async function fetchDailyBars(ticker: string, days = 800): Promise<DailyBar[]> {
  if (!usingTheta) return (await massiveDailyBars(ticker, days)) as DailyBar[];
  const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
  const end = Date.now();
  const map = await thetadata.fetchDailyUnderlying(ticker, ymd(end - days * 86_400_000), ymd(end));
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([d, close]) => ({ time: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, close }));
}
