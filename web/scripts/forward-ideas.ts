// FORWARD-TEST de IDEAS (paper) — ¿qué ideas vale la pena tomar, y cómo jugarlas?
//
// Ideas te muestra flujo institucional con métricas (historial del ticker, score de
// inusualidad, agresor, prima). La pregunta que este script responde con datos:
//   1. ¿Esas métricas PREDICEN algo? (¿sirve filtrar por historial ≥90%? ¿por score alto?)
//   2. ¿Cuál es la mejor forma de jugar una idea?
//        (a) COPIAR el trade  → comprar el mismo contrato
//        (b) VENDER PRIMA en su dirección → credit spread a 10 / 30 / 60 días
//
// El (b) importa porque el backtest ya nos enseñó que COMPRAR el flujo pierde de media
// (-1,3%, n=339) mientras que VENDER prima filtrada sí tiene edge. Quizá el valor de Ideas
// no sea "compra esto" sino "aquí entra el dinero grande → vende prima en esa dirección".
//
// Cada corrida: registra las ideas del día, liquida lo vencido y reporta por FILTRO.
// Uso: node --env-file=.env.local --import tsx scripts/forward-ideas.ts

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import Redis from "ioredis";
import { loadMarketFlow, closeIdeasStore } from "../lib/ideasStore";
import { classifyFlow, type FlowRow } from "../lib/flow";
import { validationScore } from "../lib/validation";
import { fetchDailyBars } from "../lib/flowProvider";
import { bsPrice } from "../lib/blackScholes";

// ── Parámetros ────────────────────────────────────────────────────────────────
const MIN_PREMIUM = Number(process.env.FWI_MIN_PREMIUM) || 500_000;
const MAX_PER_DAY = Number(process.env.FWI_MAX_PER_DAY) || 40;  // tope de ideas por corrida
const SPREAD_DTES = (process.env.FWI_DTES || "10,30,60").split(",").map(Number).filter(Boolean);
const SIGMA = 1;            // strike corto a 1σ
const WIDTH_EM = 0.5;       // ancho del spread
const COPY_SESSIONS = 10;   // horizonte para el "copiar el trade" (igual que backtest-pnl)
const STORE = (process.env.FWI_STORE || (process.env.REDIS_URL ? "redis" : "file")).toLowerCase();
const REDIS_KEY = process.env.FWI_REDIS_KEY || "forward:ideas";
const LEDGER = process.env.FWI_LEDGER || "data/forward/ideas-ledger.json";
const REPORT = process.env.FWI_REPORT || "data/forward/ideas-report.md";
const SLIP = Number(process.env.FWI_SLIP ?? 0.05);
const YR = 365 * 24 * 3600 * 1000;

// ── Registro ─────────────────────────────────────────────────────────────────
interface IdeaTrade {
  id: string;               // ticker|símbolo|fecha|vehículo
  ticker: string; symbol: string;
  entryDate: string; entryMs: number;
  dir: 1 | -1;              // dirección de la idea (alcista / bajista)
  /** Métricas de la idea AL MOMENTO de registrarla — son las que queremos validar. */
  premium: number; unusualScore: number; aggression: string;
  hitRate: number | null; hitResolved: number;  // historial del ticker + su tamaño de muestra
  /** Vehículo: "copiar" = comprar el contrato · "spreadNd" = vender credit spread a N días. */
  vehicle: string;
  spot: number; rv: number;
  // copiar
  optPrice?: number; optStrike?: number; optType?: "call" | "put"; optExpiry?: string;
  // spread
  dte?: number; shortK?: number; longK?: number; width?: number; netCredit?: number;
  expiryMs: number; expiryDate: string;
  status: "open" | "closed";
  exitDate?: string; retOnRisk?: number;
}

let redis: Redis | null = null;
const getRedis = (): Redis => {
  if (!redis) {
    if (!process.env.REDIS_URL) throw new Error("Falta REDIS_URL");
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return redis;
};
const readJson = (p: string): IdeaTrade[] => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return []; } };
const saveJson = (p: string, d: unknown) => { if (!existsSync(dirname(p))) mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(d, null, 2), "utf8"); };
async function loadLedger(): Promise<IdeaTrade[]> {
  if (STORE === "redis") { const raw = await getRedis().get(REDIS_KEY); return raw ? JSON.parse(raw) : []; }
  return readJson(LEDGER);
}
async function persist(l: IdeaTrade[], report: string) {
  if (STORE === "redis") { const r = getRedis(); await r.set(REDIS_KEY, JSON.stringify(l)); await r.set(`${REDIS_KEY}:report`, report); return; }
  saveJson(LEDGER, l); saveJson(REPORT, report);
}

// ── Barras / vol ─────────────────────────────────────────────────────────────
// high/low son opcionales: Massive los trae, pero el camino de ThetaData solo guarda el cierre.
interface DBar { time: string; close: number; high?: number; low?: number }
/** Barras para validationScore. Sin high/low reales, usa el cierre (aproxima los toques). */
const toValBars = (bars: DBar[]) =>
  bars.map((b) => ({ time: b.time, close: b.close, high: b.high ?? b.close, low: b.low ?? b.close }));
function idxOnOrBefore(bars: DBar[], ms: number): number {
  let i = -1;
  for (let k = 0; k < bars.length; k++) { if (Date.parse(`${bars[k].time}T00:00:00Z`) <= ms) i = k; else break; }
  return i;
}
function idxOnOrAfter(bars: DBar[], ms: number): number {
  for (let k = 0; k < bars.length; k++) if (Date.parse(`${bars[k].time}T20:00:00Z`) >= ms) return k;
  return -1;
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
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

// ── Liquidación ──────────────────────────────────────────────────────────────
/** Copiar el trade: se compró la opción; se valora a los COPY_SESSIONS días (o al vencer). */
function settleCopy(t: IdeaTrade, bars: DBar[]): boolean {
  const entryIdx = idxOnOrBefore(bars, t.entryMs);
  if (entryIdx < 0) return false;
  const exitIdx = Math.min(entryIdx + COPY_SESSIONS, bars.length - 1);
  const expIdx = idxOnOrAfter(bars, t.expiryMs);
  const useIdx = expIdx >= 0 && expIdx < exitIdx ? expIdx : exitIdx;
  const salidaMs = Date.parse(`${bars[useIdx].time}T20:00:00Z`);
  if (Date.now() < salidaMs) return false;              // todavía no toca cerrarla
  if (useIdx <= entryIdx) return false;
  const s = bars[useIdx].close;
  const Trem = Math.max((t.expiryMs - salidaMs) / YR, 0);
  const val = Trem > 0
    ? bsPrice(s, t.optStrike!, Trem, t.rv, t.optType!)
    : (t.optType === "call" ? Math.max(s - t.optStrike!, 0) : Math.max(t.optStrike! - s, 0));
  const costo = t.optPrice! * (1 + SLIP);               // pagamos algo peor que el mid
  t.retOnRisk = round(((val - costo) / costo) * 100, 1); // riesgo = lo pagado
  t.exitDate = bars[useIdx].time;
  t.status = "closed";
  return true;
}

/** Credit spread: se sostiene a vencimiento y se liquida por valor intrínseco. */
function settleSpread(t: IdeaTrade, bars: DBar[]): boolean {
  const expIdx = idxOnOrAfter(bars, t.expiryMs);
  if (expIdx < 0 || Date.now() < t.expiryMs) return false;
  const s = bars[expIdx].close;
  const bull = t.dir === 1;
  const shortIntr = bull ? Math.max(t.shortK! - s, 0) : Math.max(s - t.shortK!, 0);
  const longIntr = bull ? Math.max(t.longK! - s, 0) : Math.max(s - t.longK!, 0);
  const pnl = t.netCredit! - (shortIntr - longIntr);
  const risk = t.width! - t.netCredit!;
  t.retOnRisk = round((risk > 0 ? pnl / risk : pnl / t.width!) * 100, 1);
  t.exitDate = bars[expIdx].time;
  t.status = "closed";
  return true;
}

// ── Estadística ──────────────────────────────────────────────────────────────
interface Stat { n: number; win: number | null; mean: number | null; median: number | null }
function stat(v: number[]): Stat {
  if (!v.length) return { n: 0, win: null, mean: null, median: null };
  const s = [...v].sort((a, b) => a - b);
  const r = (x: number) => Math.round(x * 10) / 10;
  return { n: s.length, win: Math.round(s.filter((x) => x > 0).length / s.length * 100), mean: r(s.reduce((a, x) => a + x, 0) / s.length), median: r(s[Math.floor(s.length / 2)]) };
}
const fmt = (s: Stat) => s.n === 0 ? "—" : `win ${s.win}% · media ${s.mean}% · mediana ${s.median}% (n=${s.n})`;

/** Cubeta de historial. OJO: exige muestra mínima — un "100%" sacado de 1 caso es RUIDO. */
const MIN_RESOLVED = Number(process.env.FWI_MIN_RESOLVED) || 5;
function hitBucket(t: IdeaTrade): string {
  if (t.hitRate == null || t.hitResolved < MIN_RESOLVED) return `sin historial fiable (<${MIN_RESOLVED} casos)`;
  if (t.hitRate >= 90) return "historial ≥90%";
  if (t.hitRate >= 70) return "historial 70-89%";
  if (t.hitRate >= 50) return "historial 50-69%";
  return "historial <50%";
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`Forward-test IDEAS · vehículos: copiar + spreads ${SPREAD_DTES.join("/")}d · store=${STORE}`);
  const ledger = await loadLedger();
  const byId = new Map(ledger.map((t) => [t.id, t] as const));
  const added: IdeaTrade[] = [];

  // 1. Ideas del búfer del worker (lo que la vista /ideas muestra).
  const { trades } = await loadMarketFlow();
  const { rows } = classifyFlow(trades, new Date());
  const candidatas = rows
    .filter((r) => r.premium >= MIN_PREMIUM && r.sentiment !== "neutral" && r.strike != null && r.expiration)
    .sort((a, b) => b.premium - a.premium)
    .slice(0, MAX_PER_DAY);
  console.log(`ideas en el búfer: ${rows.length} · candidatas (≥$${MIN_PREMIUM.toLocaleString("en-US")}): ${candidatas.length}`);

  // 2. Barras + historial por ticker (una vez por ticker).
  const tickers = [...new Set(candidatas.map((r) => r.underlying))];
  const barsBy = new Map<string, DBar[]>();
  const histBy = new Map<string, { hitRate: number | null; resolved: number }>();
  for (const tk of tickers) {
    // Reintentos: sin barras se PIERDE la idea, y el búfer es rodante (no vuelve mañana).
    // Massive throttlea por minuto (429), así que espaciamos y reintentamos antes de rendirnos.
    let bars: DBar[] = [];
    for (let i = 0; i < 3 && !bars.length; i++) {
      bars = (await fetchDailyBars(tk, 300).catch(() => [])) as DBar[];
      if (!bars.length && i < 2) await new Promise((r) => setTimeout(r, 4000 * (i + 1)));
    }
    if (!bars.length) { console.log(`[${tk}] sin barras tras 3 intentos — omitido`); continue; }
    await new Promise((r) => setTimeout(r, 1200)); // ritmo suave entre tickers
    barsBy.set(tk, bars);
    const propios = rows.filter((r) => r.underlying === tk);
    try {
      const rep = validationScore({ flows: propios, bars: toValBars(bars), now: new Date() });
      histBy.set(tk, { hitRate: rep.hitRate.value, resolved: rep.hitRate.resolved });
    } catch { histBy.set(tk, { hitRate: null, resolved: 0 }); }
  }

  // 3. Registrar cada idea con sus métricas, en los distintos vehículos.
  for (const r of candidatas) {
    const bars = barsBy.get(r.underlying);
    if (!bars) continue;
    const day = r.timestamp.slice(0, 10);
    const entryMs = Date.parse(`${day}T20:00:00Z`);
    const entryIdx = idxOnOrBefore(bars, entryMs);
    if (entryIdx < 20) continue;
    const rv = realizedVol(bars, entryIdx);
    if (rv == null || !(rv > 0)) continue;
    const spot = bars[entryIdx].close;
    const dir: 1 | -1 = r.sentiment === "bullish" ? 1 : -1;
    const h = histBy.get(r.underlying) ?? { hitRate: null, resolved: 0 };
    const base = {
      ticker: r.underlying, symbol: r.symbol, entryDate: day, entryMs, dir,
      premium: r.premium, unusualScore: r.scores?.total ?? 0, aggression: r.aggression ?? "unknown",
      hitRate: h.hitRate, hitResolved: h.resolved, spot: round(spot), rv: round(rv, 4),
      status: "open" as const,
    };

    // (a) COPIAR el trade: comprar el mismo contrato.
    const expMs = Date.parse(`${r.expiration}T20:00:00Z`);
    if (expMs > entryMs && r.price > 0) {
      const id = `${r.underlying}|${r.symbol}|${day}|copiar`;
      if (!byId.has(id)) {
        const rec: IdeaTrade = {
          ...base, id, vehicle: "copiar",
          optPrice: r.price, optStrike: r.strike!, optType: r.type === "call" ? "call" : "put",
          optExpiry: r.expiration!, expiryMs: expMs, expiryDate: r.expiration!,
        };
        byId.set(id, rec); ledger.push(rec); added.push(rec);
      }
    }

    // (b) VENDER PRIMA en la dirección de la idea, a 10/30/60 días.
    for (const dte of SPREAD_DTES) {
      const em = spot * rv * Math.sqrt(dte / 365);
      if (!(em > 0)) continue;
      const bull = dir === 1;
      const type = bull ? "put" : "call";
      const shortK = bull ? spot - SIGMA * em : spot + SIGMA * em;
      const longK = bull ? shortK - WIDTH_EM * em : shortK + WIDTH_EM * em;
      if (shortK <= 0 || longK <= 0) continue;
      const credit = bsPrice(spot, shortK, dte / 365, rv, type) - bsPrice(spot, longK, dte / 365, rv, type);
      const width = Math.abs(shortK - longK);
      const netCredit = credit * (1 - SLIP);
      if (!(credit > 0) || !(width > 0) || !(netCredit > 0)) continue;
      const id = `${r.underlying}|${r.symbol}|${day}|spread${dte}`;
      if (byId.has(id)) continue;
      const exp = entryMs + dte * 86_400_000;
      const rec: IdeaTrade = {
        ...base, id, vehicle: `spread${dte}d`, dte,
        shortK: round(shortK), longK: round(longK), width: round(width), netCredit: round(netCredit, 4),
        expiryMs: exp, expiryDate: new Date(exp).toISOString().slice(0, 10),
      };
      byId.set(id, rec); ledger.push(rec); added.push(rec);
    }
  }

  // 4. Liquidar lo que toque.
  let cerradas = 0;
  for (const t of ledger) {
    if (t.status !== "open") continue;
    const bars = barsBy.get(t.ticker) ?? (await fetchDailyBars(t.ticker, 300).catch(() => [])) as DBar[];
    if (!bars.length) continue;
    barsBy.set(t.ticker, bars);
    const ok = t.vehicle === "copiar" ? settleCopy(t, bars) : settleSpread(t, bars);
    if (ok) cerradas++;
  }

  // 5. Reporte — la pregunta central: ¿QUÉ FILTRO sirve?
  const cerr = ledger.filter((t) => t.status === "closed");
  const abiertas = ledger.filter((t) => t.status === "open");
  const vehiculos = ["copiar", ...SPREAD_DTES.map((d) => `spread${d}d`)];

  const L: string[] = [
    "# Forward-test de IDEAS — ¿qué ideas tomar, y cómo jugarlas?",
    "",
    `Corrida: ${new Date().toISOString().slice(0, 16)}Z · ledger: **${ledger.length}** (**${abiertas.length}** abiertas · **${cerr.length}** cerradas) · nuevas: **${added.length}** · liquidadas: **${cerradas}**`,
    "",
    "> PAPEL — nada de esto es una orden real. Dos formas de jugar cada idea:",
    `> **copiar** = comprar el mismo contrato (salida a ${COPY_SESSIONS} sesiones o al vencer) ·`,
    `> **spreadNd** = vender un credit spread a ${SIGMA}σ en la dirección de la idea, a N días.`,
    "",
  ];

  if (!cerr.length) {
    L.push("## Resultados", "", `_Aún sin cierres. Los de 10d empiezan en ~2 semanas; 30d y 60d después._`, "");
  } else {
    L.push("## 1. ¿Cuál es la mejor forma de jugar una idea?", "", "| Vehículo | Resultado |", "|---|---|");
    for (const v of vehiculos) {
      const s = stat(cerr.filter((t) => t.vehicle === v).map((t) => t.retOnRisk!));
      L.push(`| ${v} | ${fmt(s)} |`);
    }
    L.push("", "_Si `copiar` pierde y los spreads ganan, el valor de Ideas es señalar DIRECCIÓN para vender prima, no dar una lista de compra._", "");

    // Por historial (la pregunta original de Lester)
    L.push("## 2. ¿El HISTORIAL predice? (tu pregunta: ¿tomo solo las de 100%?)", "");
    const buckets = [`historial ≥90%`, "historial 70-89%", "historial 50-69%", "historial <50%", `sin historial fiable (<${MIN_RESOLVED} casos)`];
    for (const v of vehiculos) {
      const cv = cerr.filter((t) => t.vehicle === v);
      if (!cv.length) continue;
      L.push(`### ${v}`, "", "| Cubeta de historial | Resultado |", "|---|---|");
      for (const b of buckets) {
        const s = stat(cv.filter((t) => hitBucket(t) === b).map((t) => t.retOnRisk!));
        if (s.n) L.push(`| ${b} | ${fmt(s)} |`);
      }
      L.push("");
    }
    L.push(`_Exigimos **≥${MIN_RESOLVED} casos resueltos** para creerle al porcentaje: un "100%" sacado de 1 caso es ruido, y filtrar por él seleccionaría justo las ideas de muestra más chica._`, "");

    // Otros filtros
    L.push("## 3. ¿Otros filtros separan mejor?", "");
    for (const v of vehiculos) {
      const cv = cerr.filter((t) => t.vehicle === v);
      if (cv.length < 6) continue;
      const alto = cv.filter((t) => t.unusualScore >= 7), bajo = cv.filter((t) => t.unusualScore < 7);
      const ask = cv.filter((t) => t.aggression === "ask"), bid = cv.filter((t) => t.aggression === "bid");
      const k = Math.max(1, Math.floor(cv.length / 3));
      const porPrima = [...cv].sort((a, b) => a.premium - b.premium);
      L.push(`### ${v}`,
        `- Inusualidad ALTA (≥7): ${fmt(stat(alto.map((t) => t.retOnRisk!)))}`,
        `- Inusualidad baja (<7): ${fmt(stat(bajo.map((t) => t.retOnRisk!)))}`,
        `- Compra al ask: ${fmt(stat(ask.map((t) => t.retOnRisk!)))}`,
        `- Venta al bid: ${fmt(stat(bid.map((t) => t.retOnRisk!)))}`,
        `- Prima TOP⅓: ${fmt(stat(porPrima.slice(cv.length - k).map((t) => t.retOnRisk!)))}`,
        `- Prima BOTTOM⅓: ${fmt(stat(porPrima.slice(0, k).map((t) => t.retOnRisk!)))}`,
        "");
    }
  }

  if (abiertas.length) {
    L.push("## Abiertas (próximas a resolver)", "", "| Ticker | Idea | Vehículo | Entrada | Resuelve | Historial |", "|---|---|---|---|---|---|");
    for (const t of [...abiertas].sort((a, b) => a.expiryMs - b.expiryMs).slice(0, 20)) {
      const h = t.hitRate == null ? "—" : `${t.hitRate}% (n=${t.hitResolved})`;
      L.push(`| ${t.ticker} | ${t.dir === 1 ? "↑" : "↓"} $${(t.premium / 1000).toFixed(0)}k | ${t.vehicle} | ${t.entryDate} | ${t.expiryDate} | ${h} |`);
    }
    if (abiertas.length > 20) L.push(`| … | | | | | (+${abiertas.length - 20}) |`);
    L.push("");
  }

  L.push("## Caveats",
    "- Vehículo `copiar` valorado con Black-Scholes e IV constante (no modela colapso de IV).",
    "- Spreads sostenidos a vencimiento, sin gestión. Slippage 5% incluido; sin comisiones en la salida.",
    "- El búfer de Ideas es rodante (TTL de un día): este script debe correr A DIARIO o se pierden ideas.",
    "");

  const report = L.join("\n") + "\n";
  await persist(ledger, report);
  console.log("\n" + report);
  console.log(STORE === "redis" ? `=== ledger en Redis "${REDIS_KEY}" ===` : `=== ledger: ${LEDGER} ===`);
  // Cerrar AMBAS conexiones: la nuestra y la de ideasStore. Si queda alguna abierta,
  // el proceso no termina y el cron de Railway se queda "Running" para siempre.
  if (redis) await redis.quit();
  await closeIdeasStore();
})();
