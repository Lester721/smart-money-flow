// Backtest de ESTRATEGIA (el embudo) — ETAPA 1: venta de prima CON red (credit spread).
// Señal = dirección neta del flujo por día (a favor). Vende prima FUERA del movimiento esperado
// (short en ±1σ y ±1.5σ del cono), en 3/5/7/30/60/90 días. Sostiene a vencimiento.
// Precios modelados con Black-Scholes (IV ≈ volatilidad realizada 20d — sin smile histórico).
// Etapas 2-4 (naked, debit, 0DTE, filtro Eva/Victor) se añaden después.
// Uso: node --env-file=.env.local --import tsx scripts/backtest-strategy.ts

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { fetchFlow } from "../lib/massiveFlow";
import {
  classifyFlow, executionLevel, executionScore, spreadScore, spreadPct, unusualTradeScore, type FlowRow,
} from "../lib/flow";
import { bsPrice, impliedVol } from "../lib/blackScholes";
import { fetchDailyBars } from "../lib/massive";
import { fetchFlowRange, fetchDailyUnderlying, fetchDailyUnderlyingParidad } from "../lib/thetadata";

const TICKERS = (process.env.BT_TICKERS || "AAPL,MSFT,NVDA,AMZN,GOOGL,META,TSLA,AMD,NFLX,QQQ,SPY,HOOD").split(",").map((t) => t.trim()).filter(Boolean);
const DAYS = Number(process.env.BT_DAYS) || 180;
const MAXPAGES = Number(process.env.BT_MAXPAGES) || 6; // páginas de flujo por ticker (ensanchable)
const MIN_PREMIUM = Number(process.env.BT_MIN_PREMIUM) || 1_000_000;
// Proveedor: DATA_PROVIDER=theta usa ThetaData por RANGO de fechas (BT_START..BT_END, YYYYMMDD);
// default Massive (ventana relativa a hoy). Barras: 40d antes / 220d después para rv + liquidación.
const PROVIDER = (process.env.DATA_PROVIDER || "massive").toLowerCase();
const BT_START = process.env.BT_START || "20250101";
const BT_END = process.env.BT_END || "20250601";
const shiftYmd = (y: string, d: number) => new Date(Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
// Ventanas de 1 año calendario para selección de contratos POR PERÍODO (los líquidos cambian año a año).
function yearWindows(startYmd: string, endYmd: string): [string, string][] {
  const out: [string, string][] = [];
  let s = startYmd;
  while (Number(s) <= Number(endYmd)) {
    const e = String(Math.min(Number(`${s.slice(0, 4)}1231`), Number(endYmd)));
    out.push([s, e]);
    s = `${Number(s.slice(0, 4)) + 1}0101`;
  }
  return out;
}
// Fuente del precio del subyacente: "stock" (suscripción de acciones, desde 2021) o
// "parity" (derivado de opciones, llega a 2016). Ver fetchDailyUnderlyingParidad.
const SPOT_SRC = (process.env.BT_SPOT || "stock").toLowerCase();
// Piso de fecha para las SEÑALES (YYYY-MM-DD). Sirve para comparar dos corridas sobre la
// MISMA muestra: los precios derivados de opciones no tienen el tope de suscripción, así que
// arrancan antes y generan señales que la fuente real no puede — comparar así mide dos cosas
// a la vez (fuente del precio Y período) y no se puede atribuir la diferencia a ninguna.
const SIG_FROM = process.env.BT_SIG_FROM || "";
const OUT = process.env.BT_OUT || "scripts/backtest-strategy-reporte.md";
const DTES = [3, 5, 7, 30, 60, 90, 180, 365];
const SIGMAS = [1, 1.5];
const WIDTH_EM = 0.5; // ancho del spread = 0.5σ (pata protectora más OTM)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DBar { time: string; close: number }
function dateStr(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }
function barIdxOnOrAfter(bars: DBar[], ms: number): number {
  for (let i = 0; i < bars.length; i++) if (Date.parse(`${bars[i].time}T20:00:00Z`) >= ms) return i;
  return -1;
}
function barIdxOnOrBefore(bars: DBar[], ms: number): number {
  let idx = -1;
  for (let i = 0; i < bars.length; i++) { if (Date.parse(`${bars[i].time}T00:00:00Z`) <= ms) idx = i; else break; }
  return idx;
}
function realizedVol(bars: DBar[], endIdx: number, lookback = 20): number | null {
  const start = Math.max(1, endIdx - lookback);
  const rets: number[] = [];
  for (let i = start; i <= endIdx; i++) if (bars[i - 1].close > 0 && bars[i].close > 0) rets.push(Math.log(bars[i].close / bars[i - 1].close));
  if (rets.length < 5) return null;
  const m = rets.reduce((s, x) => s + x, 0) / rets.length;
  const v = rets.reduce((s, x) => s + (x - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}
function ivProxyScore(iv: number, rv: number | null): number {
  if (rv == null || !(rv > 0)) return 5;
  const ratio = iv / rv;
  if (ratio < 0.9) return 10;
  if (ratio <= 1.2) return 7;
  if (ratio <= 1.6) return 4;
  return 0;
}

interface Signal { entryIdx: number; spot: number; rv: number; dir: 1 | -1; evaComp: number; victorComp: number; entryMs: number }
const YR = 365 * 24 * 3600 * 1000;

// Agrupa el flujo por DÍA: dirección neta (a favor del dinero) + composite de fuerza Eva/Victor
// (promedio ponderado por premium de los 4 sub-scores por-flujo, con los pesos de cada uno).
function signals(rows: FlowRow[], bars: DBar[]): Signal[] {
  const byDay = new Map<string, FlowRow[]>();
  for (const r of rows) {
    const d = r.timestamp.slice(0, 10);
    const arr = byDay.get(d); if (arr) arr.push(r); else byDay.set(d, [r]);
  }
  const out: Signal[] = [];
  for (const [d, dayRows] of byDay) {
    const entryIdx = barIdxOnOrBefore(bars, Date.parse(`${d}T20:00:00Z`));
    if (entryIdx < 20 || entryIdx >= bars.length - 1) continue;
    const rv = realizedVol(bars, entryIdx);
    if (rv == null || !(rv > 0)) continue;
    const spot = bars[entryIdx].close;
    let net = 0, totP = 0, aA = 0, aC = 0, aU = 0, aI = 0;
    for (const r of dayRows) {
      const s = r.sentiment === "bullish" ? 1 : r.sentiment === "bearish" ? -1 : 0;
      if (s !== 0) net += s * r.premium;
      if (r.strike == null || !r.expiration || !(r.price > 0)) continue;
      const T = (Date.parse(`${r.expiration}T20:00:00Z`) - Date.parse(`${d}T20:00:00Z`)) / YR;
      if (T <= 0) continue;
      const iv = impliedVol(r.price, spot, r.strike, T, r.type === "call" ? "call" : "put");
      if (iv == null || !(iv > 0)) continue;
      aA += executionScore(executionLevel(r.price, r.bid, r.ask, r.side)) * r.premium;
      aC += spreadScore(spreadPct(r.bid, r.ask)) * r.premium;
      aU += unusualTradeScore(r).total * r.premium;
      aI += ivProxyScore(iv, rv) * r.premium;
      totP += r.premium;
    }
    if (net === 0 || totP <= 0) continue;
    const wa = aA / totP, wc = aC / totP, wu = aU / totP, wi = aI / totP;
    const victorComp = ((wa / 10) * 20 + (wc / 10) * 20 + (wu / 10) * 20 + (wi / 10) * 10) / 70 * 100;
    const evaComp = ((wc / 10) * 30 + (wu / 10) * 20 + (wi / 10) * 15 + (wa / 10) * 10) / 75 * 100;
    out.push({ entryIdx, spot, rv, dir: net > 0 ? 1 : -1, evaComp, victorComp, entryMs: Date.parse(`${d}T20:00:00Z`) });
  }
  return out;
}

// P&L de un credit spread a favor de la dirección, sostenido a vencimiento. Retorno sobre riesgo.
// Costos: slip = fracción del crédito perdida al slippage (cruzar el bid/ask); commPerContract =
// comisión por contrato (Robinhood ~0). El crédito real recibido baja por ambos.
function creditSpreadPnl(sig: Signal, bars: DBar[], dte: number, sigmaMult: number, slip = 0, commPerContract = 0): number | null {
  const { spot, rv, entryIdx, dir } = sig;
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
  const sExp = bars[expIdx].close;
  const shortIntr = bull ? Math.max(shortK - sExp, 0) : Math.max(sExp - shortK, 0);
  const longIntr = bull ? Math.max(longK - sExp, 0) : Math.max(sExp - longK, 0);
  const pnl = netCredit - (shortIntr - longIntr); // $ por spread
  const risk = width - netCredit;
  return risk > 0 ? pnl / risk : pnl / width; // retorno sobre riesgo
}

// ETAPA 2a — Debit spread DIRECCIONAL a favor (riesgo = débito pagado). Long ATM, short en el strike σ.
function debitSpreadPnl(sig: Signal, bars: DBar[], dte: number, sigmaMult: number): number | null {
  const { spot, rv, entryIdx, dir } = sig;
  const T = dte / 365;
  const em = spot * rv * Math.sqrt(dte / 365);
  if (!(em > 0)) return null;
  const bull = dir === 1;
  const type = bull ? "call" : "put";
  const longK = spot;                                                    // ATM
  const shortK = bull ? spot + sigmaMult * em : spot - sigmaMult * em;   // cap en σ
  if (shortK <= 0) return null;
  const debit = bsPrice(spot, longK, T, rv, type) - bsPrice(spot, shortK, T, rv, type);
  if (!(debit > 0)) return null;
  const expMs = Date.parse(`${bars[entryIdx].time}T20:00:00Z`) + dte * 86_400_000;
  const expIdx = barIdxOnOrAfter(bars, expMs);
  if (expIdx < 0) return null;
  const sExp = bars[expIdx].close;
  const longIntr = bull ? Math.max(sExp - longK, 0) : Math.max(longK - sExp, 0);
  const shortIntr = bull ? Math.max(sExp - shortK, 0) : Math.max(shortK - sExp, 0);
  const value = longIntr - shortIntr;
  return (value - debit) / debit; // retorno sobre riesgo (débito)
}

// ETAPA 2b — Naked (SIN red). Riesgo teóricamente ilimitado; retorno sobre MARGEN estilo broker
// (Reg-T aprox: max(20% del subyacente − OTM, 10% del subyacente)). Ojo: la cola es catastrófica.
function nakedPnl(sig: Signal, bars: DBar[], dte: number, sigmaMult: number): number | null {
  const { spot, rv, entryIdx, dir } = sig;
  const T = dte / 365;
  const em = spot * rv * Math.sqrt(dte / 365);
  if (!(em > 0)) return null;
  const bull = dir === 1;
  const type = bull ? "put" : "call";
  const shortK = bull ? spot - sigmaMult * em : spot + sigmaMult * em;
  if (shortK <= 0) return null;
  const credit = bsPrice(spot, shortK, T, rv, type);
  if (!(credit > 0)) return null;
  const expMs = Date.parse(`${bars[entryIdx].time}T20:00:00Z`) + dte * 86_400_000;
  const expIdx = barIdxOnOrAfter(bars, expMs);
  if (expIdx < 0) return null;
  const sExp = bars[expIdx].close;
  const intr = bull ? Math.max(shortK - sExp, 0) : Math.max(sExp - shortK, 0);
  const pnl = credit - intr;
  const margin = Math.max(0.20 * spot - sigmaMult * em, 0.10 * spot); // Reg-T aprox por acción
  return margin > 0 ? pnl / margin : null;
}

interface Stat { n: number; win: number | null; mean: number | null; median: number | null }
function stat(v: number[]): Stat {
  if (v.length === 0) return { n: 0, win: null, mean: null, median: null };
  const s = [...v].sort((a, b) => a - b);
  return { n: s.length, win: Math.round((s.filter((x) => x > 0).length / s.length) * 100), mean: Math.round((s.reduce((a, x) => a + x, 0) / s.length) * 1000) / 10, median: Math.round(s[Math.floor(s.length / 2)] * 1000) / 10 };
}
const fmt = (s: Stat) => s.n === 0 ? "—" : `win ${s.win}% · media ${s.mean}% · mediana ${s.median}% (n=${s.n})`;

(async () => {
  console.log(`Estrategia ETAPA 1 (credit spread) · ${TICKERS.length} tickers · ${DAYS}d`);
  const all: { sig: Signal; bars: DBar[] }[] = [];
  let spyBars: DBar[] = []; // para el diagnóstico de régimen (clima de mercado)
  // PROCEDENCIA de los datos — se estampa en el reporte. Un día de flujo sin barra de precio
  // se descarta EN SILENCIO, así que un run "de 10 años" puede salir con la mitad de la muestra
  // y un n grande que parece sano. Sin esto, el período REAL del backtest no existe en ningún lado.
  const cobertura: { t: string; barras: number; ini: string; fin: string; diasFlujo: number; señales: number }[] = [];
  const omitidos: string[] = [];
  // Caché acumulativa por ticker: cada corrida guarda la versión con MÁS flujo vista hasta
  // ahora y reusa el caché cuando la descarga en vivo falla o viene más pobre. Así, ante el
  // throttling de Massive, corridas repetidas CONVERGEN al mejor dataset sin re-bajar lo bueno.
  const CACHE_DIR = process.env.BT_CACHE_DIR || "scripts/cache";
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = (t: string) => `${CACHE_DIR}/${t}.json`;
  const INTER = Number(process.env.BT_SLEEP) || 3500;
  const RETRIES = Number(process.env.BT_RETRIES) || 3;
  const MIN_CACHE = Number(process.env.BT_MIN_CACHE_ROWS) || 20; // caché "suficiente" → no re-bajar
  type Cache = { rows: FlowRow[]; bars: DBar[] };
  const readCache = (t: string): Cache | null => { try { return JSON.parse(readFileSync(cachePath(t), "utf8")); } catch { return null; } };

  for (const t of TICKERS) {
    let rows: FlowRow[] | null = null;
    let bars: DBar[] = [];
    if (PROVIDER === "theta") {
      // ThetaData por RANGO, año por año + barras de acción.
      // CACHÉ POR (ticker, AÑO) — no por ventana completa: así un run con otro rango REUSA los
      // años ya bajados, y si se interrumpe solo se pierde el año en curso (~10 min), no el
      // ticker entero. Retries por año para los transitorios del Terminal.
      const tCacheDir = "scripts/cache-theta";
      if (!existsSync(tCacheDir)) mkdirSync(tCacheDir, { recursive: true });
      const yearPath = (ys: string, ye: string) => `${tCacheDir}/${t}_y_${ys}_${ye}.json`;
      const barsPath = `${tCacheDir}/${t}_bars${SPOT_SRC === "parity" ? "PAR" : ""}_${shiftYmd(BT_START, -40)}_${shiftYmd(BT_END, 220)}.json`;

      type Raw = Awaited<ReturnType<typeof fetchFlowRange>>;
      const allTrades: Raw = [];
      let añosOk = 0, añosCache = 0;
      for (const [ys, ye] of yearWindows(BT_START, BT_END)) {
        let year: Raw | null = null;
        try { year = JSON.parse(readFileSync(yearPath(ys, ye), "utf8")); } catch { year = null; }
        if (year && year.length > 0) { añosCache++; }
        else {
          for (let attempt = 0; attempt < 4 && year == null; attempt++) {
            try {
              const got = await fetchFlowRange(t, ys, ye, { minPremium: MIN_PREMIUM, contractCap: 60 });
              if (!got.length) throw new Error("año vacío");
              year = got;
              writeFileSync(yearPath(ys, ye), JSON.stringify(year), "utf8");
            } catch (e) {
              console.error(`[${t}] ${ys.slice(0, 4)} intento ${attempt + 1}/4 falló: ${(e as Error).message}`);
              await sleep(3000 * (attempt + 1));
            }
          }
        }
        if (year?.length) { allTrades.push(...year); añosOk++; }
      }

      // Barras del subyacente (cacheadas aparte: cubren toda la ventana de una vez).
      let b: DBar[] = [];
      try { b = JSON.parse(readFileSync(barsPath, "utf8")); } catch { b = []; }
      if (!b.length) {
        for (let attempt = 0; attempt < 4 && !b.length; attempt++) {
          try {
            // BT_SPOT=parity deriva el precio de las OPCIONES en vez de bajarlo de acciones.
            // No es un capricho: la suscripción de acciones solo llega a 2021 y las opciones a
            // 2016, así que es el único camino al COVID sin pagar. Se usa para el A/B —
            // mismo período, dos fuentes de precio— antes de fiarse de él en 2020.
            const dmap = SPOT_SRC === "parity"
              ? await fetchDailyUnderlyingParidad(t, shiftYmd(BT_START, -40), shiftYmd(BT_END, 220))
              : await fetchDailyUnderlying(t, shiftYmd(BT_START, -40), shiftYmd(BT_END, 220));
            b = [...dmap.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))
              .map(([d, c]) => ({ time: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, close: c }));
            if (!b.length) throw new Error("sin barras");
            writeFileSync(barsPath, JSON.stringify(b), "utf8");
          } catch (e) {
            console.error(`[${t}] barras intento ${attempt + 1}/4 falló: ${(e as Error).message}`);
            await sleep(3000 * (attempt + 1));
          }
        }
      }

      if (allTrades.length && b.length) {
        rows = classifyFlow(allTrades, new Date()).rows;
        bars = b;
        console.log(`[${t}] ThetaData: ${rows.length} flujos · ${bars.length} barras · ${añosOk} años (${añosCache} de caché)`);
      }
    } else {
    const cached = readCache(t);
    const cacheGood = !!cached && cached.rows.length >= MIN_CACHE && cached.bars.length > 40;

    if (cacheGood && process.env.BT_PREFER_CACHE !== "0") {
      // Ya tenemos datos ricos de este ticker → sáltate Massive (baja la carga → menos throttle).
      rows = cached!.rows; bars = cached!.bars;
      console.log(`[${t}] caché suficiente (${rows.length} flujos) — sin bajar`);
    } else {
      // Descarga en vivo con reintentos (maneja "terminated"/throttle transitorio).
      for (let attempt = 0; attempt < RETRIES && rows == null; attempt++) {
        try {
          const { trades } = await fetchFlow(t, { targetDays: DAYS, minPremium: MIN_PREMIUM, contractCap: 25, maxPages: MAXPAGES });
          const r = classifyFlow(trades, new Date()).rows;
          let b: DBar[] = [];
          for (let i = 0; i < 4; i++) { b = (await fetchDailyBars(t, 800).catch(() => [])) as DBar[]; if (b.length > 0) break; await sleep(800 * (i + 1)); }
          if (b.length > 0) { rows = r; bars = b; }
          else throw new Error("sin barras");
        } catch (e) {
          console.error(`[${t}] intento ${attempt + 1}/${RETRIES} falló: ${(e as Error).message}`);
          await sleep(3000 * (attempt + 1));
        }
      }
      // Quédate con la versión de MÁS flujo (live vs caché previo) → mejora monótona.
      if (rows != null && bars.length) {
        if (!cached || rows.length >= cached.rows.length) writeFileSync(cachePath(t), JSON.stringify({ rows, bars }), "utf8");
        else { rows = cached.rows; bars = cached.bars; console.log(`[${t}] caché previo más rico (${cached.rows.length}) — reusando`); }
      } else if (cached) {
        rows = cached.rows; bars = cached.bars; console.log(`[${t}] usando CACHÉ (vivo falló)`);
      }
    }
    }

    if (rows == null || !bars.length) { console.log(`[${t}] sin datos ni caché — omitido`); omitidos.push(t); await sleep(INTER); continue; }
    const sigs = signals(rows, bars).filter((s) => !SIG_FROM || dateStr(s.entryMs) >= SIG_FROM);
    if (t === "SPY") spyBars = bars;
    for (const sig of sigs) all.push({ sig, bars });

    const diasFlujo = new Set(rows.map((r) => r.timestamp.slice(0, 10))).size;
    cobertura.push({ t, barras: bars.length, ini: bars[0].time, fin: bars[bars.length - 1].time, diasFlujo, señales: sigs.length });
    const pedidoIni = `${BT_START.slice(0, 4)}-${BT_START.slice(4, 6)}-${BT_START.slice(6, 8)}`;
    if (bars[0].time > pedidoIni) {
      console.warn(`[${t}] ⚠ BARRAS INCOMPLETAS: pediste desde ${pedidoIni}, empiezan el ${bars[0].time} — las señales anteriores se DESCARTAN en silencio.`);
    }
    console.log(`[${t}] señales: ${sigs.length} (de ${diasFlujo} días con flujo)`);
    await sleep(INTER);
  }

  const VEHICLES: { name: string; note: string; fn: (s: Signal, b: DBar[], dte: number, sm: number) => number | null }[] = [
    { name: "Venta de prima CON red (credit spread)", note: "retorno sobre riesgo = pérdida máx del spread", fn: creditSpreadPnl },
    { name: "Debit spread direccional (a favor)", note: "retorno sobre riesgo = débito pagado", fn: debitSpreadPnl },
    { name: "Naked / venta SIN red", note: "retorno sobre margen Reg-T aprox — OJO: cola catastrófica no capada", fn: nakedPnl },
  ];
  // ── PROCEDENCIA ────────────────────────────────────────────────────────────────────────
  // Va PRIMERO y sin adornos: el período REAL de un backtest es el de sus señales, no el que
  // se pidió por variable de entorno. Sin este bloque hay que ir a hurgar en la caché para
  // saber qué se probó de verdad — y nadie lo hace.
  const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const pedido = (y: string) => `${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}`;
  const sigDates = all.map(({ sig }) => sig.entryMs).sort((a, b) => a - b);
  const realIni = sigDates.length ? ymd(sigDates[0]) : "—";
  const realFin = sigDates.length ? ymd(sigDates[sigDates.length - 1]) : "—";
  const spanPedido = Date.parse(pedido(BT_END)) - Date.parse(pedido(BT_START));
  const spanReal = sigDates.length ? sigDates[sigDates.length - 1] - sigDates[0] : 0;
  const pctCobertura = spanPedido > 0 ? Math.round((spanReal / spanPedido) * 100) : 0;
  const truncado = pctCobertura < 90;
  if (truncado) {
    console.warn(`\n⚠⚠ PERÍODO TRUNCADO: pediste ${pedido(BT_START)}..${pedido(BT_END)} pero las señales van de ${realIni} a ${realFin} (${pctCobertura}% del rango).`);
    console.warn("   Causa típica: la suscripción de acciones no cubre tan atrás y las señales sin barra se descartan.\n");
  }

  const lines = [
    "# Backtest de estrategia (ETAPAS 1+2) — 3 vehículos",
    "",
    "## Procedencia — QUÉ SE PROBÓ DE VERDAD",
    "",
    `| | |`,
    `|---|---|`,
    `| Período **pedido** | ${pedido(BT_START)} → ${pedido(BT_END)} |`,
    `| Período **real de las señales** | **${realIni} → ${realFin}** |`,
    `| Cobertura | **${pctCobertura}%** del rango pedido ${truncado ? "⚠️ **TRUNCADO**" : "✅"} |`,
    `| Proveedor | ${PROVIDER} |`,
    `| Precio del subyacente | **${SPOT_SRC === "parity" ? "DERIVADO de opciones (paridad put-call)" : "real (suscripción de acciones)"}** |`,
    `| Tickers | ${cobertura.length} con datos${omitidos.length ? ` · **omitidos: ${omitidos.join(", ")}**` : ""} |`,
    `| Señales | ${all.length} |`,
    "",
    ...(truncado
      ? [`> ⚠️ **El período real es más corto que el pedido.** Los días de flujo sin barra de precio se descartan en silencio, así que el \`n\` de abajo es grande pero NO cubre el rango que se pidió. **No describas este run por su período pedido.** Causa habitual: la suscripción de acciones de ThetaData (VALUE ≈ 5,5 años) no llega más atrás — ver \`docs/Theta-Terminal-Windows.md\`.`, ""]
      : []),
    "| Ticker | Barras | Desde | Hasta | Días c/ flujo | Señales |",
    "|---|---|---|---|---|---|",
    ...cobertura.map((c) => `| ${c.t} | ${c.barras} | ${c.ini}${c.ini > pedido(BT_START) ? " ⚠️" : ""} | ${c.fin} | ${c.diasFlujo} | ${c.señales} |`),
    "",
    `**Señales:** ${all.length} (dirección neta del flujo por día, a favor). Fuera del movimiento esperado (short a 1σ/1.5σ), 3/5/7/30/60/90d, hold a vencimiento. BS con IV≈vol realizada 20d.`,
    "",
  ];
  for (const v of VEHICLES) {
    lines.push(`## ${v.name}`, `_${v.note}._`, "", "| DTE | 1σ | 1.5σ |", "|---|---|---|");
    for (const dte of DTES) {
      const cells = SIGMAS.map((sm) => {
        const pnls = all.map(({ sig, bars }) => v.fn(sig, bars, dte, sm)).filter((x): x is number => x != null);
        return fmt(stat(pnls));
      });
      lines.push(`| ${dte}d | ${cells[0]} | ${cells[1]} |`);
    }
    lines.push("");
  }

  // ETAPA 4 — ¿filtrar por alta convicción (Eva/Victor) mejora la estrategia?
  const cands: { name: string; fn: (s: Signal, b: DBar[], dte: number, sm: number) => number | null; dte: number; sm: number }[] = [
    { name: "Credit spread 5d @ 1σ", fn: creditSpreadPnl, dte: 5, sm: 1 },
    { name: "Naked 90d @ 1σ", fn: nakedPnl, dte: 90, sm: 1 },
  ];
  lines.push("## ETAPA 4 — filtro de convicción + OUT-OF-SAMPLE del hilo prometedor", "");
  for (const c of cands) {
    const rec = all.map(({ sig, bars }) => ({ pnl: c.fn(sig, bars, c.dte, c.sm), eva: sig.evaComp, vic: sig.victorComp, ms: sig.entryMs }))
      .filter((x) => x.pnl != null) as { pnl: number; eva: number; vic: number; ms: number }[];
    const k = Math.max(1, Math.floor(rec.length / 3));
    const byEva = [...rec].sort((a, b) => a.eva - b.eva);
    const topEva = byEva.slice(rec.length - k);
    const botEva = byEva.slice(0, k);
    const topVic = [...rec].sort((a, b) => a.vic - b.vic).slice(rec.length - k);
    // OOS: partir el Top⅓-EVA por fecha (mitad vieja vs nueva)
    const topSorted = [...topEva].sort((a, b) => a.ms - b.ms);
    const mid = Math.floor(topSorted.length / 2);
    const early = topSorted.slice(0, mid).map((x) => x.pnl);
    const late = topSorted.slice(mid).map((x) => x.pnl);
    lines.push(
      `### ${c.name}`,
      `- TODAS: ${fmt(stat(rec.map((x) => x.pnl)))}`,
      `- **Top⅓ EVA:** ${fmt(stat(topEva.map((x) => x.pnl)))} · Bottom⅓ EVA: ${fmt(stat(botEva.map((x) => x.pnl)))} · Top⅓ Victor: ${fmt(stat(topVic.map((x) => x.pnl)))}`,
      `- **OOS del Top⅓ EVA** → mitad VIEJA: ${fmt(stat(early))} · mitad NUEVA: ${fmt(stat(late))}`,
      "",
    );
  }
  lines.push("Robusto SOLO si el Top⅓ EVA gana a TODAS/Bottom **Y** aguanta en las DOS mitades OOS. Si se voltea entre mitades → cherry-picking/régimen (como pasó con la gestión).", "");

  // ETAPA 5 — OOS del Top⅓-EVA en TODAS las celdas del credit spread (matar el cherry-picking).
  const creditOOS = (dte: number, sm: number) => {
    const rec = all.map(({ sig, bars }) => ({ pnl: creditSpreadPnl(sig, bars, dte, sm), eva: sig.evaComp, ms: sig.entryMs }))
      .filter((x) => x.pnl != null) as { pnl: number; eva: number; ms: number }[];
    if (rec.length < 9) return null;
    const k = Math.max(1, Math.floor(rec.length / 3));
    const top = [...rec].sort((a, b) => a.eva - b.eva).slice(rec.length - k);
    const ts = [...top].sort((a, b) => a.ms - b.ms);
    const mid = Math.floor(ts.length / 2);
    return { all_: stat(top.map((x) => x.pnl)), early: stat(ts.slice(0, mid).map((x) => x.pnl)), late: stat(ts.slice(mid).map((x) => x.pnl)) };
  };
  lines.push("## ETAPA 5 — Credit spread: Top⅓ EVA + OOS en TODAS las celdas", "", "| DTE | 1σ: todas → vieja / nueva | 1.5σ: todas → vieja / nueva |", "|---|---|---|");
  let robust = 0, total = 0;
  for (const dte of DTES) {
    const cells = SIGMAS.map((sm) => {
      const r = creditOOS(dte, sm);
      if (!r) return "—";
      total++;
      const ok = (r.early.mean ?? -1) > 0 && (r.late.mean ?? -1) > 0;
      if (ok) robust++;
      return `${r.all_.mean}% → ${r.early.mean}% / ${r.late.mean}% ${ok ? "✅" : "✗"} (n=${r.all_.n})`;
    });
    lines.push(`| ${dte}d | ${cells[0]} | ${cells[1]} |`);
  }
  lines.push("", `**Celdas robustas (Top-EVA positivo en las DOS mitades OOS): ${robust}/${total}.** Muchas ✅ → el edge es AMPLIO (no fue suerte de una celda). Pocas → cherry-picking.`, "");

  // ETAPA 6 — ¿el edge sobrevive los COSTOS? Comisión Robinhood (~$0.03/contrato) + slippage sensible.
  const COMM = 0.03;
  const SLIPS = [0, 0.05, 0.10, 0.15];
  const keyCells: { name: string; dte: number; sm: number }[] = [
    { name: "5d @1σ (mejor n)", dte: 5, sm: 1 },
    { name: "90d @1σ", dte: 90, sm: 1 },
    { name: "180d @1σ", dte: 180, sm: 1 },
  ];
  const topEvaMean = (dte: number, sm: number, slip: number): Stat | null => {
    const rec = all.map(({ sig, bars }) => ({ pnl: creditSpreadPnl(sig, bars, dte, sm, slip, COMM), eva: sig.evaComp }))
      .filter((x) => x.pnl != null) as { pnl: number; eva: number }[];
    if (rec.length < 6) return null;
    const k = Math.max(1, Math.floor(rec.length / 3));
    const top = [...rec].sort((a, b) => a.eva - b.eva).slice(rec.length - k);
    return stat(top.map((x) => x.pnl));
  };
  lines.push("## ETAPA 6 — ¿el edge sobrevive los COSTOS? (Top⅓ EVA · comisión Robinhood + slippage)", "", "| Celda | slip 0% | 5% | 10% | 15% |", "|---|---|---|---|---|");
  for (const kc of keyCells) {
    const cols = SLIPS.map((s) => { const st = topEvaMean(kc.dte, kc.sm, s); return st && st.mean != null ? `${st.mean}%` : "—"; });
    lines.push(`| ${kc.name} | ${cols[0]} | ${cols[1]} | ${cols[2]} | ${cols[3]} |`);
  }
  lines.push("", "**Cómo leerlo:** media del Top⅓-Eva a cada nivel de slippage. Donde pasa a NEGATIVO, ahí el costo se comió el edge. Cuanto más slippage aguante positivo, más operable de verdad.", "");

  // ETAPA 7 — DIAGNÓSTICO DE RÉGIMEN. ¿El edge del credit spread depende del CLIMA de
  // volatilidad? Clima = vol realizada 20d de SPY (el mercado) el día de entrada, en terciles
  // sobre los días realmente operados. Solo diagnóstico — nada cableado a la estrategia todavía.
  lines.push("## ETAPA 7 — Diagnóstico de régimen (¿el edge depende del clima?)", "");
  const spyRvAt = (ms: number): number | null => {
    const i = barIdxOnOrBefore(spyBars, ms);
    return i >= 20 ? realizedVol(spyBars, i) : null;
  };
  if (spyBars.length < 40) {
    lines.push("_No hay barras de SPY suficientes para clasificar el régimen._", "");
  } else {
    const regimeCells: { name: string; dte: number; sm: number }[] = [
      { name: "Credit spread 5d @ 1σ", dte: 5, sm: 1 },
      { name: "Credit spread 90d @ 1σ", dte: 90, sm: 1 },
    ];
    for (const rc of regimeCells) {
      const rec = all.map(({ sig, bars }) => ({
        pnl: creditSpreadPnl(sig, bars, rc.dte, rc.sm),
        eva: sig.evaComp,
        spyRv: spyRvAt(sig.entryMs),
      })).filter((x) => x.pnl != null && x.spyRv != null) as { pnl: number; eva: number; spyRv: number }[];
      if (rec.length < 15) { lines.push(`### ${rc.name}`, "_Muestra insuficiente para partir por régimen._", ""); continue; }
      // Terciles de la vol de SPY sobre los días operados → 3 climas.
      const rvs = rec.map((x) => x.spyRv).sort((a, b) => a - b);
      const q1 = rvs[Math.floor(rvs.length / 3)];
      const q2 = rvs[Math.floor((2 * rvs.length) / 3)];
      const regimeOf = (rv: number) => (rv <= q1 ? "Tranquilo" : rv <= q2 ? "Normal" : "Volátil");
      // Umbral Top⅓ por convicción EVA (global, como opera la estrategia).
      const k = Math.max(1, Math.floor(rec.length / 3));
      const evaCut = [...rec].sort((a, b) => a.eva - b.eva)[rec.length - k].eva;
      lines.push(
        `### ${rc.name}`,
        `Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ ${Math.round(q1 * 100)}% · **Normal** ${Math.round(q1 * 100)}–${Math.round(q2 * 100)}% · **Volátil** > ${Math.round(q2 * 100)}%.`,
        "",
        "| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |",
        "|---|---|---|",
      );
      for (const reg of ["Tranquilo", "Normal", "Volátil"] as const) {
        const inReg = rec.filter((x) => regimeOf(x.spyRv) === reg);
        const top = inReg.filter((x) => x.eva >= evaCut);
        lines.push(`| ${reg} | ${fmt(stat(inReg.map((x) => x.pnl)))} | ${fmt(stat(top.map((x) => x.pnl)))} |`);
      }
      lines.push("");
    }
    lines.push(
      "**Cómo leerlo:** si el **Top⅓ EVA** se mantiene positivo en los 3 climas → el edge es robusto al régimen (un filtro de clima aporta poco). Si es fuerte en Tranquilo/Normal y **negativo en Volátil** → los credit spreads se rompen en clima volátil, y ahí SÍ vale un filtro de régimen (apagar/achicar en volátil). Si solo funciona en un clima → el edge de ~1 año puede ser dependiente del régimen (frágil).",
      "",
      "_Régimen = vol realizada 20d de SPY el día de entrada, en terciles sobre los días operados. Es DIAGNÓSTICO, no un filtro: no hay nada cableado a la estrategia todavía._",
      "",
    );
  }

  lines.push(
    "**Cómo leerlo:** credit/naked (vender prima) ganan seguido pero pierden grande → mira la MEDIA, no solo el win%. El debit spread pierde seguido pero gana grande. Candidata = media positiva con win razonable.",
    "",
    "## Caveats",
    "- 0DTE (por delta) y filtro de fuerza Eva/Victor vienen en etapas 3-4.",
    "- Ancho credit/debit = σ; naked con riesgo ilimitado (margen Reg-T aprox). Hold a vencimiento, sin gestión.",
    "- IV = vol realizada 20d (aprox, sin smile). Vencimiento por calendario. Sin comisiones.",
    "- Dirección = flujo neto del día (misma Eva/Victor; el filtro de fuerza es etapa 4).",
  );
  const report = lines.join("\n") + "\n";
  writeFileSync(OUT, report, "utf8");
  console.log("\n" + report);
  console.log(`=== reporte en ${OUT} ===`);
})();
