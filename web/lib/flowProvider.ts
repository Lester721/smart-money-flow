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
import type { WheelChainResult, WheelChainQuote } from "./massive";
import type { DailyBar as DailyBarCanonica } from "./types";
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
// EL MISMO SHAPE QUE EL RESTO DE LA WEB. Antes este interface tenia `high`/`low` opcionales y
// NO tenia `open`: era un tipo mas flojo que el canonico, y por eso `/api/ideas`, `/api/prediction`
// y `/api/validation` seguian importando de `./massive` a pelo - pasarlos al conmutador no
// compilaba. Se arreglo el tipo en vez de forzar los `as`, que es lo que habria escondido el
// problema. ThetaData da los cuatro precios (endpoint EOD), asi que no se inventa ninguno.
//
// `aproximada` es la parte honesta: cuando la sesion no traia maximo/minimo reales, `BarraDiaria`
// usa el cierre para los tres y lo DICE. Quien mida toques de un umbral necesita saberlo.
export interface DailyBar extends DailyBarCanonica { aproximada?: true }

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
  return barras.map((b) => ({
    time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
    ...(b.aproximada ? { aproximada: true as const } : {}),
  }));
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

/**
 * Cadena de PUTS para la Wheel, del proveedor activo.
 *
 * POR QUE EXISTE. `/api/wheel` importaba `fetchWheelChain` de `./massive` a pelo, saltandose el
 * conmutador: era una de las cinco dependencias de Massive que quedaban vivas despues de dar la
 * migracion por terminada. Se vio el 2026-08-15 leyendo los imports uno a uno, no probando las
 * rutas - porque probandolas NO se veia: sin clave, `fetchDailyBars` devolvia lista vacia y la
 * ruta seguia respondiendo 200.
 *
 * DE DONDE SALE CADA COSA con ThetaData:
 *   - bid/ask       -> reales, del cierre de la ultima sesion con cadena. Massive en este plan NO
 *                      los daba, asi que aqui se gana precision, no se pierde.
 *   - lastTrade     -> el cierre del contrato.
 *   - openInterest  -> del mismo dia que la cadena, en una sola llamada.
 *   - spot          -> el cierre del subyacente de ESA sesion, no el de ahora.
 *
 * OJO: es la ultima sesion CERRADA. Durante la sesion en curso esto va retrasado, igual que el
 * resto de la web con este plan. No se disimula.
 */
export async function fetchWheelChain(
  ticker: string,
  opts: { dteMin: number; dteMax: number; now?: Date },
): Promise<WheelChainResult> {
  if (!usingTheta) {
    const { fetchWheelChain: massiveWheel } = await import("./massive");
    return massiveWheel(ticker, opts);
  }

  const cadena = await thetadata.cadenaOpciones(ticker);
  // null = no hay ninguna sesion con cadena, que NO es lo mismo que "la cadena esta vacia".
  // Se devuelve spot null y la ruta ya lo cuenta como "sin cadena" en vez de tragarselo.
  if (!cadena) return { spot: null, quotes: [] };

  // El dia se ancla en ET, no en UTC: pasadas las ~8 PM ET el dia UTC ya salto y todos los dte
  // saldrian desfasados uno (la trampa de siempre, ver marketDateStr en lib/occ.ts).
  const { marketDateStr } = await import("./occ");
  const hoyMs = Date.parse(`${marketDateStr(opts.now ?? new Date())}T00:00:00Z`);

  const quotes: WheelChainQuote[] = [];
  for (const c of cadena.contracts) {
    if (c.details.contract_type !== "put") continue;
    const exp = c.details.expiration_date;
    // Tolerante a los dos formatos: ThetaData sirve YYYYMMDD y la web usa YYYY-MM-DD. Sin esto,
    // `Date.parse("20260821")` es NaN, el dte sale NaN, y NaN falla TODAS las comparaciones:
    // la ventana de vencimientos se quedaria vacia sin un solo error.
    const iso = exp.includes("-") ? exp : `${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}`;
    const dte = Math.round((Date.parse(`${iso}T00:00:00Z`) - hoyMs) / 86_400_000);
    if (!Number.isFinite(dte) || dte < opts.dteMin || dte > opts.dteMax) continue;
    quotes.push({
      strike: c.details.strike_price,
      expiration: iso,
      dte,
      bid: c.bid ?? null,
      ask: c.ask ?? null,
      lastTrade: c.last_trade.price || null,
      openInterest: c.open_interest,
    });
  }
  return { spot: cadena.underlyingPrice, quotes };
}
