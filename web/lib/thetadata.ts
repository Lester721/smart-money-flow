// Cliente ThetaData (API v3, Theta Terminal local en :25503). PARALELO a massive.ts — NO lo toca.
// Massive queda como fallback hasta verificar paridad. Provee el FLUJO (fetchFlow) sobre ThetaData:
//   · trade_quote  → cada trade YA emparejado con su NBBO (agresor exacto en 1 llamada)
//   · implied_volatility → spot (underlying_price) + IV real por minuto
//   · open_interest (bulk) → OI por contrato
// Ventaja vs Massive: no hay que pedir el quote por-trade ni hacer el as-of join de quotes;
// ThetaData lo entrega junto. El spot sale del endpoint de IV (incluido en Standard Options).
//
// Nota: los endpoints SNAPSHOT (vivo) hoy están bloqueados por Norton (feed en tiempo real);
// los HISTÓRICOS funcionan. Este cliente usa históricos (que es lo que backtests + flujo reciente
// necesitan). Para el vivo intradía haría falta la excepción de Norton al feed.

import type { RawTrade } from "./flow";
import { tradeGreeks } from "./greeks";
import { isMultiLegCondition, isCanceledCondition } from "./conditions";
import { sideFor } from "./massiveFlow";
import type { FetchFlowOptions, FlowResult } from "./massiveFlow";

const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const YEAR_MS = 365 * 24 * 3600 * 1000;

// ── CSV ────────────────────────────────────────────────────────────────────
interface Csv { header: string[]; rows: string[][] }
const unq = (s: string) => s.replace(/^"(.*)"$/, "$1");

async function getCsv(path: string): Promise<Csv | null> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) return null; // 403/404/etc. → sin datos (mensaje de error, no CSV)
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  // Los mensajes de error de ThetaData son prosa (con espacios) o HTML; los headers CSV no tienen
  // espacios ni "<". Así aceptamos tanto los de opción ("symbol,...") como los de acción ("created,...").
  if (lines[0].includes(" ") || lines[0].includes("<")) return null;
  const header = lines[0].split(",").map(unq);
  const rows = lines.slice(1).map((l) => l.split(",").map(unq));
  return { header, rows };
}
const idx = (h: string[], name: string) => h.indexOf(name);

/**
 * Concurrencia de peticiones al Terminal. Debe COINCIDIR con `http_concurrency` del config.toml:
 * si pedimos más, las peticiones extra se encolan y pueden expirar; si pedimos menos,
 * desperdiciamos capacidad. Default 4 (el default del Terminal).
 */
const CONC = Number(process.env.THETA_CONCURRENCY) || 4;

/** map con concurrencia limitada. */
async function pMapT<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const res: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const j = i++; res[j] = await fn(items[j]); }
  }));
  return res;
}

/** "2024-11-08" → "20241108" (formato de expiración/fecha que piden los endpoints). */
const yyyymmdd = (d: string) => d.replace(/-/g, "");

/** Timestamp ET-naïve de ThetaData ("2024-11-04T09:30:00.471") → ms. Se trata como UTC para
 *  un reloj CONSISTENTE entre trades y spot (el as-of join y la prima no dependen del offset;
 *  el epoch absoluto queda ~ offset ET corrido, refinable después). */
const tsToMs = (iso: string): number => Date.parse(`${iso}Z`);

// ── Condiciones OPRA (mismo catálogo de Victor; 255 = "sin condición" en ThetaData) ──────────
function primaryCondition(ids: number[]): number | undefined {
  const valid = ids.filter((n) => Number.isFinite(n) && n !== 255 && n !== 0);
  for (const id of valid) if (isMultiLegCondition(id)) return id;
  for (const id of valid) if (isCanceledCondition(id)) return id;
  return valid[0];
}
function sentimentFor(side: string): string {
  if (side === "ABOVE_ASK" || side === "AT_ASK") return "bullish";
  if (side === "BELOW_BID" || side === "AT_BID") return "bearish";
  return "neutral";
}

// ── Serie de spot (underlying) intradía, desde el endpoint de IV ─────────────────────────────
// El `underlying_price` es el MISMO sin importar la expiración que consultes (solo hace falta
// una con datos). Por eso cacheamos por (símbolo, fecha): sin esto se pedía una vez por cada
// expiración escaneada — ~200 llamadas donde bastan 5.
const spotSeriesCache = new Map<string, [number, number][]>();

/** [tMs, underlying][] ascendente, deduplicado por timestamp (el subyacente repite entre strikes). */
async function fetchSpotSeries(symbol: string, expYmd: string, dateYmd: string): Promise<[number, number][]> {
  const ck = `${symbol}|${dateYmd}`;
  const hit = spotSeriesCache.get(ck);
  if (hit && hit.length) return hit;
  const csv = await getCsv(
    `/v3/option/history/greeks/implied_volatility?symbol=${symbol}&expiration=${expYmd}&date=${dateYmd}&interval=1m`,
  );
  if (!csv) return [];
  const iTs = idx(csv.header, "underlying_timestamp");
  const iPx = idx(csv.header, "underlying_price");
  if (iTs < 0 || iPx < 0) return [];
  const seen = new Set<number>();
  const out: [number, number][] = [];
  for (const r of csv.rows) {
    const t = tsToMs(r[iTs]);
    const px = Number(r[iPx]);
    if (!Number.isFinite(t) || !(px > 0) || seen.has(t)) continue;
    seen.add(t);
    out.push([t, px]);
  }
  out.sort((a, b) => a[0] - b[0]);
  if (out.length) spotSeriesCache.set(ck, out);
  return out;
}

/** Spot en (o justo antes de) tMs. Búsqueda binaria. */
function spotAt(series: [number, number][], tMs: number): number | null {
  if (!series.length || tMs < series[0][0]) return series.length ? series[0][1] : null;
  let lo = 0, hi = series.length - 1, best: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= tMs) { best = series[mid][1]; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}

// ── OI por contrato (bulk, una llamada para todo el símbolo) ─────────────────────────────────
/**
 * Map "EXP|STRIKE|RIGHT" → open interest (EXP en YYYY-MM-DD, RIGHT CALL/PUT), as-of `dateYmd`.
 *
 * OJO con el día EN CURSO: el endpoint histórico lo rechaza ("Cannot fetch current-day data
 * without specifying an expiration") → sin este caso especial, TODO el flujo en vivo saldría
 * con open_interest = 0, degradando el scorecard en silencio. Para hoy usamos el SNAPSHOT.
 */
async function fetchOpenInterestMap(symbol: string, dateYmd: string): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const path = dateYmd >= hoy
    ? `/v3/option/snapshot/open_interest?symbol=${symbol}&expiration=*`
    : `/v3/option/history/open_interest?symbol=${symbol}&expiration=*&start_date=${dateYmd}&end_date=${dateYmd}`;
  const csv = await getCsv(path);
  if (!csv) return m;
  const iE = idx(csv.header, "expiration"), iK = idx(csv.header, "strike"), iR = idx(csv.header, "right"), iO = idx(csv.header, "open_interest");
  for (const r of csv.rows) {
    const oi = Number(r[iO]);
    if (Number.isFinite(oi)) m.set(`${r[iE]}|${Number(r[iK])}|${r[iR]}`, oi);
  }
  return m;
}

/**
 * Map "EXP|STRIKE|RIGHT" → {volumen, cierre} del contrato en `dateYmd`. Mismo caso especial
 * que el OI: el histórico rechaza el día en curso, así que para hoy usamos el snapshot.
 * El cierre sirve para el dólar-volumen (criterio de selección de contratos líquidos).
 */
async function fetchVolumeMap(symbol: string, dateYmd: string): Promise<Map<string, VolInfo>> {
  const m = new Map<string, VolInfo>();
  const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const path = dateYmd >= hoy
    ? `/v3/option/snapshot/ohlc?symbol=${symbol}&expiration=*`
    : `/v3/option/history/eod?symbol=${symbol}&expiration=*&start_date=${dateYmd}&end_date=${dateYmd}`;
  const csv = await getCsv(path);
  if (!csv) return m;
  const iE = idx(csv.header, "expiration"), iK = idx(csv.header, "strike"),
    iR = idx(csv.header, "right"), iV = idx(csv.header, "volume"), iC = idx(csv.header, "close");
  if (iE < 0 || iK < 0 || iR < 0 || iV < 0) return m;
  for (const r of csv.rows) {
    const v = Number(r[iV]);
    if (Number.isFinite(v)) m.set(`${r[iE]}|${Number(r[iK])}|${r[iR]}`, { vol: v, close: iC >= 0 ? Number(r[iC]) || 0 : 0 });
  }
  return m;
}

// ── Fechas ───────────────────────────────────────────────────────────────────────────────────
/** Últimos `days` días hábiles (aprox; ignora feriados) como YYYYMMDD, desc. */
function tradingDates(days: number): string[] {
  const out: string[] = [];
  const d = new Date();
  while (out.length < days) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

async function fetchExpirations(symbol: string): Promise<string[]> {
  const csv = await getCsv(`/v3/option/list/expirations?symbol=${symbol}`);
  if (!csv) return [];
  const iE = idx(csv.header, "expiration");
  return csv.rows.map((r) => r[iE]).filter(Boolean);
}

// ThetaData limita los rangos históricos a 1 MES por llamada → troceamos en ventanas de 28 días.
const dayMs = 86_400_000;
const parseYmd = (y: string) => Date.parse(`${y.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}T00:00:00Z`);
const toYmd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
export function monthChunks(startYmd: string, endYmd: string): [string, string][] {
  const chunks: [string, string][] = [];
  let s = parseYmd(startYmd);
  const e = parseYmd(endYmd);
  while (s <= e) {
    const cEnd = Math.min(s + 27 * dayMs, e);
    chunks.push([toYmd(s), toYmd(cEnd)]);
    s = cEnd + dayMs;
  }
  return chunks;
}

// ── Subyacente DIARIO (para backtests) — barras de ACCIÓN limpias (suscripción Value Stocks) ──
// El stock EOD da un cierre por día, confiable y denso (derivar de opciones salía frágil).

// Los ÍNDICES no son acciones: `/v3/stock/history/eod?symbol=SPX` no devuelve nada, y como el
// error se tragaba silenciosamente, SPX y SPXW se caían de TODAS las corridas del forward-test
// de Ideas sin que nadie lo notara. Van por `/v3/index/...`, que la suscripción Index FREE sí
// sirve. SPXW/NDXP son raíces SEMANALES: su subyacente es el índice base.
const RAIZ_INDICE: Record<string, string> = { SPXW: "SPX", NDXP: "NDX", RUTW: "RUT" };
const INDICES = new Set(["SPX", "NDX", "RUT", "VIX", "XSP", "DJX", "OEX", "MXEA", "MXEF"]);
/** Símbolo del subyacente real y si es índice (SPXW → SPX, índice). */
export function resolverSubyacente(symbol: string): { symbol: string; esIndice: boolean } {
  const base = RAIZ_INDICE[symbol] ?? symbol;
  return { symbol: base, esIndice: INDICES.has(base) };
}

// ── Símbolos que CAMBIARON de nombre ────────────────────────────────────────────────────────
// Una empresa que se renombra no arrastra su historia al símbolo nuevo: pedir META en 2021
// devuelve "No data found", porque entonces se llamaba FB. Y el fallo es silencioso — el año
// sale vacío y el backtest sigue como si nada, con seis años menos de muestra.
// Detectado el 2026-08-07: META perdió su 2021 entero en una corrida y solo se vio porque el
// log decía "5 años" donde debía decir 6.
// `desde` = primer día que el símbolo NUEVO tiene datos.
const RENOMBRADOS: Record<string, { antes: string; desde: string }> = {
  META: { antes: "FB", desde: "20220609" }, // Facebook → Meta Platforms
};

/**
 * Parte [start, end] en tramos con el símbolo que REALMENTE se usaba en cada uno.
 * Puro: sin esto no hay forma de testear el corte sin llamar a la red.
 */
export function segmentosPorSimbolo(symbol: string, startYmd: string, endYmd: string): { symbol: string; start: string; end: string }[] {
  const r = RENOMBRADOS[symbol];
  if (!r || endYmd < r.desde) {
    // Todo el rango es anterior al cambio → todo con el nombre viejo.
    if (r && endYmd < r.desde) return [{ symbol: r.antes, start: startYmd, end: endYmd }];
    return [{ symbol, start: startYmd, end: endYmd }];
  }
  if (startYmd >= r.desde) return [{ symbol, start: startYmd, end: endYmd }];
  // El rango cruza el cambio de nombre → dos tramos.
  // Ojo: la víspera se calcula con fechas de verdad, NO restando 1 al número. `20220101 - 1`
  // da `20220100`, que no es un día y rompe el troceado mensual aguas abajo.
  const d = new Date(Date.parse(`${r.desde.slice(0, 4)}-${r.desde.slice(4, 6)}-${r.desde.slice(6, 8)}T00:00:00Z`) - 86_400_000);
  const víspera = d.toISOString().slice(0, 10).replace(/-/g, "");
  return [
    { symbol: r.antes, start: startYmd, end: víspera },
    { symbol, start: r.desde, end: endYmd },
  ];
}

/** Map "YYYYMMDD" → cierre diario del subyacente, sobre [startYmd, endYmd]. Troceado a ≤1 mes. */
export async function fetchDailyUnderlying(symbolRaw: string, startYmd: string, endYmd: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { symbol, esIndice } = resolverSubyacente(symbolRaw);
  const ruta = esIndice ? "index" : "stock";
  // Un tramo por cada nombre que tuvo el símbolo en el rango (META era FB antes de 2022-06-09).
  for (const seg of segmentosPorSimbolo(symbol, startYmd, endYmd))
  for (const [cs, ce] of monthChunks(seg.start, seg.end)) {
    const csv = await getCsv(`/v3/${ruta}/history/eod?symbol=${seg.symbol}&start_date=${cs}&end_date=${ce}`);
    if (!csv) continue;
    const iC = idx(csv.header, "close");
    const iT = idx(csv.header, "last_trade") >= 0 ? idx(csv.header, "last_trade") : idx(csv.header, "created");
    if (iC < 0 || iT < 0) continue;
    for (const r of csv.rows) {
      const close = Number(r[iC]);
      const day = (r[iT] || "").slice(0, 10).replace(/-/g, "");
      if (day && close > 0) out.set(day, close);
    }
  }
  return out;
}

// ── Subyacente DIARIO derivado de OPCIONES (sin suscripción de acciones) ────────────────────
// La suscripción Stocks VALUE solo sirve precios desde 2021-01, pero las OPCIONES llegan a
// 2016. Como el precio del subyacente es lo único que falta para probar el crash del COVID,
// se reconstruye por paridad put-call:
//
//     S = C − P + K        (exacto salvo tasas y dividendos, pequeños a pocas semanas)
//
// Validado contra el precio real donde SÍ lo tenemos (error mediano): SPY 2021 0,133% ·
// SPY 2022 (bear) 0,140% · AMD 2022 0,168%. La cola es peor en tickers menos líquidos
// (AMD llega a 2,46% en su peor día), así que sirve de sobra para calcular volatilidad pero
// hay que medir su efecto antes de liquidar spreads con él — para eso está el A/B.
export interface FilaEodOpcion { exp: string; strike: number; right: string; close: number; volume: number; day: string }

/** Map "YYYYMMDD" → spot derivado. Puro: se testea sin red. */
export function spotPorParidad(filas: FilaEodOpcion[]): Map<string, number> {
  const porDia = new Map<string, FilaEodOpcion[]>();
  for (const f of filas) { const a = porDia.get(f.day); if (a) a.push(f); else porDia.set(f.day, [f]); }

  const out = new Map<string, number>();
  for (const [day, delDia] of porDia) {
    const pares = new Map<string, { c?: FilaEodOpcion; p?: FilaEodOpcion }>();
    for (const f of delDia) {
      // Exigir volumen en la pata: sin operaciones ese día el "close" es de días atrás y
      // mete un precio rancio en la paridad.
      if (!(f.close > 0) || !(f.volume > 0)) continue;
      const k = `${f.exp}|${f.strike}`;
      const e = pares.get(k) ?? {};
      if (f.right === "CALL") e.c = f; else if (f.right === "PUT") e.p = f;
      pares.set(k, e);
    }
    const cand: { s: number; dist: number }[] = [];
    for (const [k, e] of pares) {
      if (!e.c || !e.p) continue;
      const K = Number(k.split("|")[1]);
      // |C−P| mínimo ≈ strike más cercano al dinero, donde ambas patas cotizan apretadas.
      cand.push({ s: e.c.close - e.p.close + K, dist: Math.abs(e.c.close - e.p.close) });
    }
    if (!cand.length) continue;
    cand.sort((a, b) => a.dist - b.dist);
    // MEDIANA de los 5 mejores: un solo par con un cierre raro no decide el precio del día.
    const top = cand.slice(0, 5).map((c) => c.s).sort((a, b) => a - b);
    out.set(day, top[Math.floor(top.length / 2)]);
  }
  return out;
}

/**
 * Igual que fetchDailyUnderlying, pero SIN tocar la suscripción de acciones.
 * Deriva TROZO A TROZO y solo guarda el resultado: un año de SPY son ~2,2 millones de filas
 * útiles, así que acumular 5 años antes de calcular se queda sin memoria. Como la paridad se
 * resuelve dentro de cada día, trocear no cambia el resultado.
 */
export async function fetchDailyUnderlyingParidad(symbol: string, startYmd: string, endYmd: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const seg of segmentosPorSimbolo(symbol, startYmd, endYmd))
  for (const [cs, ce] of monthChunks(seg.start, seg.end)) {
    const filas: FilaEodOpcion[] = [];
    const csv = await getCsv(`/v3/option/history/eod?symbol=${seg.symbol}&expiration=*&start_date=${cs}&end_date=${ce}`);
    if (!csv) continue;
    const iE = idx(csv.header, "expiration"), iK = idx(csv.header, "strike"), iR = idx(csv.header, "right"),
      iC = idx(csv.header, "close"), iV = idx(csv.header, "volume");
    const iT = idx(csv.header, "date") >= 0 ? idx(csv.header, "date") : idx(csv.header, "created");
    if (iE < 0 || iK < 0 || iR < 0 || iC < 0 || iT < 0) continue;
    for (const r of csv.rows) {
      const day = (r[iT] || "").slice(0, 10).replace(/-/g, "");
      const close = Number(r[iC]) || 0, volume = Number(r[iV]) || 0;
      if (!day || !(close > 0) || !(volume > 0)) continue; // filtrar YA: un año de SPY son ~5M de filas
      filas.push({ exp: r[iE], strike: Number(r[iK]), right: r[iR], close, volume, day });
    }
    for (const [d, s] of spotPorParidad(filas)) out.set(d, s);
  }
  return out;
}

// ── Volumen por contrato (para seleccionar líquidos) — EOD bulk troceado ─────────────────────
interface VolInfo { vol: number; close: number }
async function fetchContractVolumes(symbol: string, startYmd: string, endYmd: string): Promise<Map<string, VolInfo>> {
  const m = new Map<string, VolInfo>();
  for (const seg of segmentosPorSimbolo(symbol, startYmd, endYmd))
  for (const [cs, ce] of monthChunks(seg.start, seg.end)) {
    const csv = await getCsv(`/v3/option/history/eod?symbol=${seg.symbol}&expiration=*&start_date=${cs}&end_date=${ce}`);
    if (!csv) continue;
    const iE = idx(csv.header, "expiration"), iK = idx(csv.header, "strike"), iR = idx(csv.header, "right"),
      iV = idx(csv.header, "volume"), iC = idx(csv.header, "close");
    for (const r of csv.rows) {
      const key = `${r[iE]}|${Number(r[iK])}|${r[iR]}`;
      const vol = Number(r[iV]) || 0, close = Number(r[iC]) || 0;
      const prev = m.get(key);
      if (prev) { prev.vol += vol; if (close > 0) prev.close = close; }
      else m.set(key, { vol, close });
    }
  }
  return m;
}

// ── Flujo por RANGO de fechas (para backtests) — con SELECCIÓN de contratos ───────────────────
// En vez de bajar todo el tape por expiración (lento), seleccionamos los contratos LÍQUIDOS por
// dólar-volumen (EOD bulk, barato) y pedimos trade_quote SOLO de esos, con strike (respuesta
// ~100x menor). Mismo criterio que selectContracts de Massive.
export async function fetchFlowRange(
  symbol: string, startYmd: string, endYmd: string,
  opts: { minPremium?: number; contractCap?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<RawTrade[]> {
  const minPremium = opts.minPremium ?? 0;
  const cap = opts.contractCap ?? 120;
  const chunks = monthChunks(startYmd, endYmd);

  // 1. Volumen por contrato → seleccionar por dólar-volumen (¿podría un trade llegar a minPremium?).
  const volMap = await fetchContractVolumes(symbol, startYmd, endYmd);
  const selected = [...volMap.entries()]
    .map(([key, v]) => { const [exp, strike, right] = key.split("|"); return { exp, strike: Number(strike), right, dv: v.vol * v.close * 100 }; })
    .filter((c) => c.dv >= minPremium)
    .sort((a, b) => b.dv - a.dv)
    .slice(0, cap);

  // 2. Subyacente diario (spot/griegas) + OI por contrato.
  // El OI importa: `exceededOI` (volumen > interés abierto = posicionamiento NUEVO) es una de
  // las señales de flujo inusual. Sin volumen NI OI reales nunca se activaría.
  const daily = await fetchDailyUnderlying(symbol, startYmd, endYmd);
  const oiMap = await fetchOpenInterestMap(symbol, endYmd);

  // 3. trade_quote por contrato seleccionado (con strike+right → respuesta chica), EN PARALELO.
  let done = 0;
  const perContract = await pMapT(selected, CONC, async (c) => {
    const local: RawTrade[] = [];
    const expYmd = yyyymmdd(c.exp);
    const expMs = Date.parse(`${c.exp}T20:00:00Z`);
    const rightWord = c.right.toUpperCase() === "CALL" ? "call" : "put";
    const isCall = rightWord === "call";
    for (const [cs, ce] of chunks) {
      if (parseYmd(cs) > expMs) break;
      // El símbolo que se pide depende del TROZO, no del ticker de hoy: un trozo de 2021 de
      // META hay que pedirlo como FB. Ver segmentosPorSimbolo.
      const sym = segmentosPorSimbolo(symbol, cs, ce)[0].symbol;
      const csv = await getCsv(`/v3/option/history/trade_quote?symbol=${sym}&expiration=${expYmd}&strike=${c.strike.toFixed(3)}&right=${rightWord}&start_date=${cs}&end_date=${ce}`);
      if (!csv) continue;
      const h = csv.header;
      const iTts = idx(h, "trade_timestamp"), iCond = idx(h, "condition"), iSize = idx(h, "size"),
        iPx = idx(h, "price"), iBid = idx(h, "bid"), iAsk = idx(h, "ask");
      const iExt = ["ext_condition1", "ext_condition2", "ext_condition3", "ext_condition4"].map((n) => idx(h, n));
      for (const r of csv.rows) {
        const price = Number(r[iPx]), size = Number(r[iSize]);
        if (!(price > 0) || !(size > 0) || price * size * 100 < minPremium) continue;
        const tMs = tsToMs(r[iTts]);
        const dayYmd = (r[iTts] || "").slice(0, 10).replace(/-/g, "");
        const bid = Number(r[iBid]), ask = Number(r[iAsk]);
        const side = sideFor(price, Number.isFinite(bid) ? bid : null, Number.isFinite(ask) ? ask : null);
        const sp = daily.get(dayYmd) ?? null;
        const T = (expMs - tMs) / YEAR_MS;
        const g = sp != null && T > 0 ? tradeGreeks(price, sp, c.strike, T, isCall) : { iv: null, delta: null, gamma: 0, theta: 0, vega: 0 };
        const conds = [Number(r[iCond]), ...iExt.map((i) => Number(r[i]))].filter(Number.isFinite);
        const ck = `${c.exp}|${c.strike}|${c.right}`;
        local.push({
          id: 0, symbol: occFor(symbol, c.exp, c.strike, isCall), price, size, side,
          bid_price: Number.isFinite(bid) ? bid : 0, ask_price: Number.isFinite(ask) ? ask : 0,
          premium: price * size * 100, delta: g.delta ?? 0, gamma: g.gamma, theta: g.theta / 365, vega: g.vega,
          implied_volatility: g.iv ?? 0,
          open_interest: oiMap.get(ck) ?? 0,
          volume: volMap.get(ck)?.vol ?? 0,
          score: 0, sentiment: sentimentFor(side),
          timestamp: new Date(tMs).toISOString(), asset_price: sp ?? undefined, trade_condition_id: primaryCondition(conds),
        });
      }
    }
    opts.onProgress?.(++done, selected.length);
    return local;
  });
  return perContract.flat().map((t, i) => ({ ...t, id: i }));
}


/** OCC estilo Victor: "AAPL241108C00220000" (sin prefijo O:). */
export function occFor(symbol: string, expDash: string, strike: number, isCall: boolean): string {
  const yy = expDash.slice(2, 4), mm = expDash.slice(5, 7), dd = expDash.slice(8, 10);
  const k = String(Math.round(strike * 1000)).padStart(8, "0");
  return `${symbol}${yy}${mm}${dd}${isCall ? "C" : "P"}${k}`;
}

// ── fetchFlow — drop-in del de massiveFlow, sobre ThetaData ───────────────────────────────────
export interface ThetaFlowOptions extends FetchFlowOptions {
  /** Máx expiraciones a escanear (las más cercanas). Acota llamadas. Default 40. */
  expCap?: number;
  /** Solo expiraciones hasta N días hacia adelante desde hoy. Default 400. */
  expHorizonDays?: number;
  /** Fechas explícitas (YYYYMMDD) a escanear. Si se da, ignora targetDays. Para backtests/tests. */
  dates?: string[];
}

export async function fetchFlow(ticker: string, opts: ThetaFlowOptions = {}): Promise<FlowResult> {
  const days = opts.targetDays ?? 5;
  const minPremium = opts.minPremium ?? 0;
  const expCap = opts.expCap ?? 40;
  const horizon = opts.expHorizonDays ?? 400;

  const dates = opts.dates ?? tradingDates(days);   // YYYYMMDD, desc
  const allExps = await fetchExpirations(ticker);   // YYYY-MM-DD, asc
  const nowMs = Date.now();
  // Expiraciones vigentes durante la ventana: no vencidas al inicio, y dentro del horizonte.
  const winStartMs = tsToMs(`${dates[dates.length - 1]}`.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3T00:00:00"));
  const exps = allExps
    .filter((e) => {
      const em = Date.parse(`${e}T20:00:00Z`);
      return em >= winStartMs && em <= nowMs + horizon * 86_400_000;
    })
    .slice(0, expCap);

  const [oi, vol] = await Promise.all([
    fetchOpenInterestMap(ticker, dates[0]),
    fetchVolumeMap(ticker, dates[0]),
  ]);

  // SELECCIÓN DE CONTRATOS (clave para que esto sea usable en vivo): pedir el tape completo de
  // cada expiración trae decenas de miles de filas por día (AAPL: ~38.000 en UNA expiración) →
  // con 40 expiraciones × 5 días eran ~23 min por ticker. En vez de eso elegimos los contratos
  // con más dólar-volumen y pedimos SOLO esos, con strike: una llamada por contrato cubre TODO
  // el rango de fechas y devuelve respuestas pequeñas.
  const cap = opts.contractCap ?? 60;
  const vivas = new Set(exps);
  const seleccion = [...vol.entries()]
    .map(([k, v]) => { const [exp, strike, right] = k.split("|"); return { k, exp, strike: Number(strike), right, dv: v.vol * v.close * 100 }; })
    .filter((c) => vivas.has(c.exp) && c.dv >= minPremium)
    .sort((a, b) => b.dv - a.dv)
    .slice(0, cap);

  // Spot intradía: una serie por fecha (el subyacente no depende de la expiración).
  const spotPorFecha = new Map<string, [number, number][]>();
  for (const dateYmd of dates) {
    let s: [number, number][] = [];
    for (const c of seleccion.slice(0, 5)) {
      if (Number(yyyymmdd(c.exp)) < Number(dateYmd)) continue;
      s = await fetchSpotSeries(ticker, yyyymmdd(c.exp), dateYmd);
      if (s.length) break;
    }
    spotPorFecha.set(dateYmd, s);
  }

  const desde = dates[dates.length - 1], hasta = dates[0];
  let scanned = 0;
  const porContrato = await pMapT(seleccion, CONC, async (c) => {
    const local: RawTrade[] = [];
    const expMs = Date.parse(`${c.exp}T20:00:00Z`);
    const isCall = c.right.toUpperCase().startsWith("C");
    for (const [cs, ce] of monthChunks(desde, hasta)) {
      if (parseYmd(cs) > expMs) break;
      const csv = await getCsv(`/v3/option/history/trade_quote?symbol=${ticker}&expiration=${yyyymmdd(c.exp)}&strike=${c.strike.toFixed(3)}&right=${isCall ? "call" : "put"}&start_date=${cs}&end_date=${ce}`);
      if (!csv) continue;
      const h = csv.header;
      const iTts = idx(h, "trade_timestamp"), iCond = idx(h, "condition"), iSize = idx(h, "size"),
        iPx = idx(h, "price"), iBid = idx(h, "bid"), iAsk = idx(h, "ask");
      const iExt = ["ext_condition1", "ext_condition2", "ext_condition3", "ext_condition4"].map((n) => idx(h, n));
      for (const r of csv.rows) {
        const price = Number(r[iPx]), size = Number(r[iSize]);
        if (!(price > 0) || !(size > 0) || price * size * 100 < minPremium) continue;
        const tMs = tsToMs(r[iTts]);
        const dayYmd = (r[iTts] || "").slice(0, 10).replace(/-/g, "");
        const bid = Number(r[iBid]), ask = Number(r[iAsk]);
        const side = sideFor(price, Number.isFinite(bid) ? bid : null, Number.isFinite(ask) ? ask : null);
        const sp = spotAt(spotPorFecha.get(dayYmd) ?? [], tMs);
        const T = (expMs - tMs) / YEAR_MS;
        const g = sp != null && T > 0 ? tradeGreeks(price, sp, c.strike, T, isCall) : { iv: null, delta: null, gamma: 0, theta: 0, vega: 0 };
        const conds = [Number(r[iCond]), ...iExt.map((i) => Number(r[i]))].filter(Number.isFinite);
        local.push({
          id: 0, symbol: occFor(ticker, c.exp, c.strike, isCall), price, size, side,
          bid_price: Number.isFinite(bid) ? bid : 0, ask_price: Number.isFinite(ask) ? ask : 0,
          premium: price * size * 100, delta: g.delta ?? 0, gamma: g.gamma, theta: g.theta / 365, vega: g.vega,
          implied_volatility: g.iv ?? 0,
          open_interest: oi.get(c.k) ?? 0,
          volume: vol.get(c.k)?.vol ?? 0,
          score: 0, sentiment: sentimentFor(side),
          timestamp: new Date(tMs).toISOString(), asset_price: sp ?? undefined, trade_condition_id: primaryCondition(conds),
        });
      }
    }
    scanned += 1;
    await opts.onPage?.(scanned, local.length);
    return local;
  });

  const trades = porContrato.flat().map((t, i) => ({ ...t, id: i }));
  return { trades, pages: scanned, truncated: false };
}
