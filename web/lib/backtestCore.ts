// Núcleo del backtest: construcción de SEÑALES y P&L del credit spread.
//
// Vive en lib/ y no dentro del script para que los diagnósticos usen EXACTAMENTE el mismo
// código. Copiar estas funciones a un script aparte fue la alternativa descartada: dos copias
// divergen con el tiempo y un día dan números distintos sin que nadie se entere — que es el
// modo de fallo que este proyecto lleva persiguiendo.
//
// Extraído de scripts/backtest-strategy.ts SIN cambios de lógica (verificado re-corriendo el
// backtest sobre caché y comparando el reporte carácter a carácter).

import { executionLevel, executionScore, spreadScore, spreadPct, unusualTradeScore, type FlowRow } from "./flow";
import { bsPrice, impliedVol } from "./blackScholes";

export const WIDTH_EM = 0.5; // ancho del spread = 0.5σ (pata protectora más OTM)
const YR = 365 * 24 * 3600 * 1000;

export interface DBar { time: string; close: number }
export function dateStr(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }
export function barIdxOnOrAfter(bars: DBar[], ms: number): number {
  for (let i = 0; i < bars.length; i++) if (Date.parse(`${bars[i].time}T20:00:00Z`) >= ms) return i;
  return -1;
}
export function barIdxOnOrBefore(bars: DBar[], ms: number): number {
  let idx = -1;
  for (let i = 0; i < bars.length; i++) { if (Date.parse(`${bars[i].time}T00:00:00Z`) <= ms) idx = i; else break; }
  return idx;
}
export function realizedVol(bars: DBar[], endIdx: number, lookback = 20): number | null {
  const start = Math.max(1, endIdx - lookback);
  const rets: number[] = [];
  for (let i = start; i <= endIdx; i++) if (bars[i - 1].close > 0 && bars[i].close > 0) rets.push(Math.log(bars[i].close / bars[i - 1].close));
  if (rets.length < 5) return null;
  const m = rets.reduce((s, x) => s + x, 0) / rets.length;
  const v = rets.reduce((s, x) => s + (x - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}
export function ivProxyScore(iv: number, rv: number | null): number {
  if (rv == null || !(rv > 0)) return 5;
  const ratio = iv / rv;
  if (ratio < 0.9) return 10;
  if (ratio <= 1.2) return 7;
  if (ratio <= 1.6) return 4;
  return 0;
}


export interface Signal {
  entryIdx: number; spot: number; rv: number; dir: 1 | -1;
  evaComp: number; victorComp: number; entryMs: number;
  /**
   * Desequilibrio direccional del día: |neto| / premium direccional total. 1 = todo el dinero
   * en un sentido; 0 = perfectamente empatado. HOY NO SE USA para decidir nada — la dirección
   * se toma del signo del neto, así que un día con +$1 de desequilibrio pesa igual que uno con
   * +$50M. Se registra para poder medir si exigir un mínimo mejora (mejora #1).
   */
  netRatio: number;
  /**
   * IV que pagó el flujo del día (ponderada por premium) dividida por la volatilidad realizada
   * de 20d. Proxy OFFLINE de "el mercado espera un evento" (earnings, típicamente): antes de un
   * reporte la implícita se despega de la realizada. Se usa como sustituto del calendario de
   * earnings, que el proveedor no sirve para 10 años atrás.
   */
  ivRatio: number;
}

// Agrupa el flujo por DÍA: dirección neta (a favor del dinero) + composite de fuerza Eva/Victor
// (promedio ponderado por premium de los 4 sub-scores por-flujo, con los pesos de cada uno).
/** Motivos por los que un día con flujo NO llega a ser señal. Diagnóstico puro. */
export interface MotivosDescarte {
  sin_barra: number;        // no hay barra de precio para ese día (o cae fuera del rango)
  sin_20_barras: number;    // hay barra, pero no 20 previas para calcular la volatilidad
  sin_volatilidad: number;  // menos de 5 retornos utilizables
  neto_cero: number;        // alcista y bajista se cancelan, o todo el flujo es neutral
  sin_premium: number;      // ninguna fila dio una IV válida (sin strike/vencimiento/precio)
  ok: number;
}

/**
 * `motivos` es OPCIONAL y solo cuenta: no altera ni una decisión. Se añadió para auditar por
 * qué se pierde ~la mitad de los días con flujo, sin duplicar la función en otro script —
 * medir sobre una copia es medir otra cosa.
 */
export function signals(rows: FlowRow[], bars: DBar[], motivos?: MotivosDescarte): Signal[] {
  const byDay = new Map<string, FlowRow[]>();
  for (const r of rows) {
    const d = r.timestamp.slice(0, 10);
    const arr = byDay.get(d); if (arr) arr.push(r); else byDay.set(d, [r]);
  }
  const out: Signal[] = [];
  for (const [d, dayRows] of byDay) {
    const entryIdx = barIdxOnOrBefore(bars, Date.parse(`${d}T20:00:00Z`));
    if (entryIdx < 20 || entryIdx >= bars.length - 1) {
      if (motivos) { if (entryIdx < 0 || entryIdx >= bars.length - 1) motivos.sin_barra++; else motivos.sin_20_barras++; }
      continue;
    }
    const rv = realizedVol(bars, entryIdx);
    if (rv == null || !(rv > 0)) { if (motivos) motivos.sin_volatilidad++; continue; }
    const spot = bars[entryIdx].close;
    let net = 0, totP = 0, aA = 0, aC = 0, aU = 0, aI = 0;
    let dirP = 0, aIV = 0; // premium direccional y IV ponderada — solo para diagnóstico
    for (const r of dayRows) {
      const s = r.sentiment === "bullish" ? 1 : r.sentiment === "bearish" ? -1 : 0;
      if (s !== 0) { net += s * r.premium; dirP += r.premium; }
      if (r.strike == null || !r.expiration || !(r.price > 0)) continue;
      const T = (Date.parse(`${r.expiration}T20:00:00Z`) - Date.parse(`${d}T20:00:00Z`)) / YR;
      if (T <= 0) continue;
      const iv = impliedVol(r.price, spot, r.strike, T, r.type === "call" ? "call" : "put");
      if (iv == null || !(iv > 0)) continue;
      aA += executionScore(executionLevel(r.price, r.bid, r.ask, r.side)) * r.premium;
      aC += spreadScore(spreadPct(r.bid, r.ask)) * r.premium;
      aU += unusualTradeScore(r).total * r.premium;
      aI += ivProxyScore(iv, rv) * r.premium;
      aIV += iv * r.premium;
      totP += r.premium;
    }
    if (net === 0 || totP <= 0) {
      if (motivos) { if (net === 0) motivos.neto_cero++; else motivos.sin_premium++; }
      continue;
    }
    if (motivos) motivos.ok++;
    const wa = aA / totP, wc = aC / totP, wu = aU / totP, wi = aI / totP;
    const victorComp = ((wa / 10) * 20 + (wc / 10) * 20 + (wu / 10) * 20 + (wi / 10) * 10) / 70 * 100;
    const evaComp = ((wc / 10) * 30 + (wu / 10) * 20 + (wi / 10) * 15 + (wa / 10) * 10) / 75 * 100;
    out.push({
      entryIdx, spot, rv, dir: net > 0 ? 1 : -1, evaComp, victorComp,
      entryMs: Date.parse(`${d}T20:00:00Z`),
      netRatio: dirP > 0 ? Math.abs(net) / dirP : 0,
      ivRatio: rv > 0 ? (aIV / totP) / rv : 0,
    });
  }
  return out;
}


// P&L de un credit spread a favor de la dirección, sostenido a vencimiento. Retorno sobre riesgo.
// Costos: slip = fracción del crédito perdida al slippage (cruzar el bid/ask); commPerContract =
// comisión por contrato (Robinhood ~0). El crédito real recibido baja por ambos.
export function creditSpreadPnl(
  sig: Signal, bars: DBar[], dte: number, sigmaMult: number,
  slip = 0, commPerContract = 0, volOverride?: number,
  /**
   * STOP: cerrar cuando la pérdida alcanza esta fracción del riesgo (0.5 = perdiste la mitad
   * del colateral). Sin él, se sostiene a vencimiento — que es el comportamiento por defecto y
   * el que produjo todos los resultados anteriores.
   *
   * LIMITACIÓN QUE HAY QUE DECLARAR: la posición se valora cada día con Black-Scholes usando la
   * volatilidad de ENTRADA. En un desplome real la IV se expande y el spread vale MÁS de lo que
   * este modelo dice, así que el stop saltaría antes y peor de lo simulado. Los números de aquí
   * son la versión OPTIMISTA del stop.
   */
  stopOnRisk?: number,
  /**
   * Gestión al estilo del forward-test en vivo, expresada sobre el CRÉDITO (no sobre el riesgo):
   *   tp = 0.25 → cerrar al capturar el 25% de la prima cobrada
   *   sl = 1    → cerrar al perder 1x la prima cobrada
   * Es la convención que usa la regla que ya corre en vivo, para poder comparar manzanas con
   * manzanas. Sin este objeto, se sostiene a vencimiento igual que siempre.
   */
  gestion?: { tp?: number; sl?: number },
): number | null {
  const { spot, entryIdx, dir } = sig;
  // `volOverride` sustituye la volatilidad usada para DOS cosas a la vez: colocar los strikes
  // (el ±1σ) y valorar el spread. Sirve para probar la mejora #4 —usar la IV que paga el
  // mercado en vez de la volatilidad realizada— sin tocar el camino por defecto: si no se
  // pasa, el cálculo es EXACTAMENTE el de siempre.
  const rv = volOverride != null && volOverride > 0 ? volOverride : sig.rv;
  const T = dte / 365;
  const em = spot * rv * Math.sqrt(dte / 365);
  if (!(em > 0)) return null;
  const bull = dir === 1;
  // bull → vende put spread abajo; bear → vende call spread arriba (a favor).
  const shortK = bull ? spot - sigmaMult * em : spot + sigmaMult * em;
  const longK = bull ? shortK - WIDTH_EM * em : shortK + WIDTH_EM * em;
  if (shortK <= 0 || longK <= 0) return null;
  const type = bull ? "put" : "call";
  const credit = bsPrice(spot, shortK, T, rv, type) - bsPrice(spot, longK, T, rv, type);
  const width = Math.abs(shortK - longK);
  if (!(credit > 0) || !(width > 0)) return null;
  // COSTOS: crédito neto = crédito×(1−slip) − comisión por acción (2 patas al abrir / 100).
  const commPerShare = (commPerContract * 2) / 100;
  const netCredit = credit * (1 - slip) - commPerShare;
  if (!(netCredit > 0)) return null; // no queda prima tras costos
  // vencimiento
  const expMs = Date.parse(`${bars[entryIdx].time}T20:00:00Z`) + dte * 86_400_000;
  const expIdx = barIdxOnOrAfter(bars, expMs);
  if (expIdx < 0) return null; // aún no vence en los datos
  const risk = width - netCredit;
  const sobreRiesgo = (p: number) => (risk > 0 ? p / risk : p / width);

  // Con GESTIÓN o STOP: recorrer día a día y cerrar si se cumple alguna regla.
  if ((stopOnRisk != null && stopOnRisk > 0) || gestion?.tp != null || gestion?.sl != null) {
    for (let i = entryIdx + 1; i < expIdx; i++) {
      const S = bars[i].close;
      const restante = (expMs - Date.parse(`${bars[i].time}T20:00:00Z`)) / (365 * 86_400_000);
      if (!(restante > 0)) break;
      // Coste de cerrar el spread hoy = recomprar la corta, vender la larga.
      const valor = bsPrice(S, shortK, restante, rv, type) - bsPrice(S, longK, restante, rv, type);
      const ganancia = netCredit - valor;      // $ por acción a favor
      const r = sobreRiesgo(ganancia);
      // Orden de comprobación: primero la toma de ganancia. Si en el mismo día se tocaran las
      // dos, con datos diarios no se sabe cuál llegó antes — asumirlo a favor es lo optimista,
      // y hay que decirlo. Con cierres diarios el caso es raro pero existe.
      if (gestion?.tp != null && ganancia >= gestion.tp * netCredit) return r;
      if (gestion?.sl != null && ganancia <= -gestion.sl * netCredit) return r;
      if (stopOnRisk != null && stopOnRisk > 0 && r <= -stopOnRisk) return r;
    }
  }

  const sExp = bars[expIdx].close;
  const shortIntr = bull ? Math.max(shortK - sExp, 0) : Math.max(sExp - shortK, 0);
  const longIntr = bull ? Math.max(longK - sExp, 0) : Math.max(sExp - longK, 0);
  return sobreRiesgo(netCredit - (shortIntr - longIntr));
}

