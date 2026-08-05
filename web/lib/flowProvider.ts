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
import type { FetchFlowOptions, FlowResult } from "./massiveFlow";

export const DATA_PROVIDER = (process.env.DATA_PROVIDER || "massive").toLowerCase();
export const usingTheta = DATA_PROVIDER === "theta";

/** fetchFlow del proveedor activo. Misma firma y mismo RawTrade[] en ambos. */
export function fetchFlow(ticker: string, opts: FetchFlowOptions = {}): Promise<FlowResult> {
  return usingTheta ? thetadata.fetchFlow(ticker, opts) : massiveFlow.fetchFlow(ticker, opts);
}
