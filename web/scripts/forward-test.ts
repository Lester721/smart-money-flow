// FORWARD-TEST (paper trading) del credit spread filtrado por convicción de EVA.
// NO ejecuta órdenes reales — solo registra jugadas de PAPEL y las liquida a vencimiento
// contra el cierre real, para validar en datos GENUINAMENTE hacia adelante lo que el
// backtest encontró (el edge vive en el Top⅓ de convicción de EVA).
//
// Cada corrida hace 3 cosas:
//   1) ABRE: baja flujo reciente del panel, arma la señal neta del día y registra un credit
//      spread de papel (short a 1σ, ancho 0.5σ) en las celdas validadas (5d y 90d @1σ).
//      Deduplica por ticker|fecha|dte|σ → correr 2 veces el mismo día no duplica nada.
//   2) LIQUIDA: toda posición de papel ya vencida se cierra contra el cierre real del
//      subyacente en/tras el vencimiento → retorno sobre riesgo realizado.
//   3) REPORTA: estado del ledger + el VALOR DEL FILTRO (Top⅓ vs Bottom⅓ por convicción
//      de EVA) sobre las jugadas ya cerradas.
//
// Uso:  node --env-file=.env.local --import tsx scripts/forward-test.ts
// Programable a diario (el ledger es un JSON versionable en el repo).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import Redis from "ioredis";
import { PANEL_TICKERS } from "../lib/panel";
import { fetchFlow, fetchDailyBars } from "../lib/flowProvider";
import {
  classifyFlow, executionLevel, executionScore, spreadScore, spreadPct, unusualTradeScore, type FlowRow,
} from "../lib/flow";
import { bsPrice, impliedVol } from "../lib/blackScholes";
import { asegurarBarrasDeLiquidacion, vencidasSinLiquidar } from "../lib/forwardBars";
import { fetchGexNormalizado } from "../lib/thetadata";

// GEX: se REGISTRA en todos los tickers y no filtra en ninguno.
//
// El mecanismo solo se midió en los ETF de índice: en SPY el precio se movió 1,217 veces lo
// esperado con gamma negativa contra 0,919 con positiva (2.608 días, 4/4 sub-períodos), y en
// QQQ igual; en acciones sueltas no aparece (MSFT 2/4, AMD 1/4). Y en el backtest, filtrar
// acciones GANABA por operación (+4,64% vs +4,00%) pero PERDÍA dinero al año ($5.637 vs
// $6.331), porque recorta 31 operaciones.
//
// Aun así se registra en todas: medir no cuesta nada —una llamada por ticker y corrida— y así
// el vivo decide si el efecto de las acciones existe, en vez de darlo por muerto con un
// backtest. Los índices se marcan porque son donde la regla tiene respaldo teórico.
const INDICES_GEX = new Set(["SPY", "QQQ"]);

// ── Parámetros ────────────────────────────────────────────────────────────────
const TICKERS = (process.env.FWD_TICKERS || PANEL_TICKERS.join(",")).split(",").map((t) => t.trim()).filter(Boolean);
const FWD_DAYS = Number(process.env.FWD_DAYS) || 10;        // ventana de flujo a revisar por corrida
const MIN_PREMIUM = Number(process.env.FWD_MIN_PREMIUM) || 1_000_000;
const LEDGER = process.env.FWD_LEDGER || "data/forward/ledger.json";
const REPORT = process.env.FWD_REPORT || "data/forward/forward-report.md";
// Almacenamiento: "redis" en Railway (persistente, sin git), "file" en local. Autodetecta
// redis si hay REDIS_URL. En Railway el ledger vive en la key FWD_REDIS_KEY.
const STORE = (process.env.FWD_STORE || (process.env.REDIS_URL ? "redis" : "file")).toLowerCase();
const REDIS_KEY = process.env.FWD_REDIS_KEY || "forward:ledger";
const SLIP = Number(process.env.FWD_SLIP ?? 0.05);         // 5% de slippage al abrir (conservador, dentro de lo validado)
const COMM = Number(process.env.FWD_COMM ?? 0.03);         // comisión Robinhood ~$0.03/contrato
const WIDTH_EM = 0.5;                                       // ancho del spread = 0.5σ
// CELDAS — reponderadas el 2026-08-07 tras el backtest 2021-2026 (n=5.094, 3,3× la muestra
// anterior). La conclusión se INVIRTIÓ respecto a la corrida de 2 años:
//
//   5d @1σ   +1,9%  OOS +1,4 / +2,4  ✅        90d @1σ   -3,8%  OOS -0,9 / -6,7  ✗
//   7d @1σ   +1,3%  OOS +0,7 / +2,0  ✅        60d @1σ   -1,8%  OOS +1,0 / -4,5  ✗
//   5d @1.5σ +0,4%  ✅ · 7d @1.5σ +0,8% ✅     180d/365d ✗
//
// Las 4 celdas robustas de 16 están TODAS en plazo corto — antes concluí lo contrario porque
// la muestra de 2 años no daba para distinguirlo. El vivo coincide: 5d Top⅓ EVA va +7,3%
// (n=11) mientras el Bottom⅓ va -16,4%.
//
// 90d se MANTIENE como control, no por fe: tiene 67 posiciones abiertas que ya están pagadas
// en tiempo, y sin un plazo largo corriendo no hay con qué contrastar si el hallazgo vuelve a
// darse vuelta. Lo que se quita es 60d, que no aporta nada que no diga el 90d.
//
// GESTIÓN: APAGADA desde el 2026-08-07. Se sostiene a vencimiento.
//
// La regla anterior (TG 25% + stop 1x) salió del backtest de 2 AÑOS, que decía que gestionar el
// 5d ayudaba: +0,9% → +2,2%. Rehecho con 10 años (scripts/mejora-6-gestion.ts, n=7.595 con
// COVID), dice lo contrario — y es la PEOR de las nueve reglas probadas:
//
//   sostener a vencimiento  +3,22%  →  $8.053/año     TG 75%          +3,48%  →  $8.678
//   TG 25% + stop 1x        +1,99%  →  $4.973/año     stop 1x crédito +2,85%  →  $7.121
//
// Destruía el 38% del retorno. MECANISMO: la toma de ganancia al 25% recorta las ganadoras
// (cobras un cuarto de la prima y renuncias al resto del desgaste temporal) mientras la cola de
// pérdidas sigue igual; y el stop a 1x corta demasiado pronto — a 5 días hay tiempo de que el
// precio vuelva, y el win rate se cae de 89% a 78%.
//
// TG 75% daba $625 más al año, pero es un 8% que cae dentro del margen de un modelo que valora
// con volatilidad constante. No se construye sobre eso.
//
// Las posiciones ya abiertas CON gestión se quedan como grupo de control: en unas semanas
// dirán en vivo, con precios reales, si el backtest tiene razón. Por eso la regla se asigna al
// abrir y nunca se le cambia a una posición existente.
const MGMT_CELLS = new Set((process.env.FWD_MGMT_CELLS || "").split(",").map(Number).filter(Boolean));
const MGMT_TP = Number(process.env.FWD_MGMT_TP ?? 0.25); // cerrar al ganar 25% del crédito
const MGMT_SL = Number(process.env.FWD_MGMT_SL ?? 1);    // cortar al perder 1× el crédito

const CELLS: { dte: number; sigma: number }[] = (process.env.FWD_CELLS || "5@1,7@1,5@1.5,7@1.5,90@1")
  .split(",").map((s) => { const [d, g] = s.split("@"); return { dte: Number(d), sigma: Number(g) }; });
const YR = 365 * 24 * 3600 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Ledger ──────────────────────────────────────────────────────────────────
interface Trade {
  id: string; ticker: string; entryDate: string; entryMs: number;
  dte: number; sigma: number; dir: 1 | -1; type: "put" | "call";
  spot: number; rv: number; shortK: number; longK: number; width: number;
  credit: number; netCredit: number; expiryMs: number; expiryDate: string;
  evaComp: number; victorComp: number;
  /** IV pagada por el flujo / vol realizada. <1.1 es el filtro del scorer EVA-IV. */
  ivRatio?: number;
  netRatio?: number;
  /** GEX neto / spot², solo en ETF de índice. Se REGISTRA, no filtra: como con EVA-IV, el vivo
   *  mide si la regla funciona antes de dejarla decidir nada. */
  gexNorm?: number;
  /** Nocional del OI cercano ($). El criterio ex-ante de dónde el mecanismo de gamma existe. */
  oiNocional?: number;
  /**
   * SOMBRA DEL IRON CONDOR — se GRABA, no decide. Lo que se abre sigue siendo el vertical.
   *
   * Sale de P2 (8 ago 2026): EVA hace dos cosas y solo una funciona. Elegir QUÉ DÍAS operar
   * separa +3,1% de −4,0% incluso con el lado al azar; elegir DE QUÉ LADO no supera a una
   * moneda al aire. Si el lado da igual, vender los DOS cobra prima de las dos patas sobre la
   * única parte que sí vale.
   *
   * En backtest (P5) dio +6,68% contra +2,52% del vertical, aguantando en las dos mitades y a
   * todo nivel de coste — pero DOBLANDO las catástrofes (13,5% vs 7,4%), porque el cóndor tiene
   * dos fronteras en vez de una. Falló el criterio fijado antes de correr, así que aquí solo se
   * mide: que decidan los datos en vivo.
   */
  condor?: {
    shortPut: number; longPut: number; shortCall: number; longCall: number;
    netCredit: number; width: number;
    /** Se rellena al liquidar, igual que el retOnRisk del vertical. */
    retOnRisk?: number;
  };
  status: "open" | "closed";
  exitDate?: string; exitSpot?: number; retOnRisk?: number; pnlPerSpread?: number;
  /** Regla de salida asignada AL ABRIR. Ausente = sin gestión (sostener a vencimiento).
   *  Se fija al abrir a propósito: cambiarle las reglas a una posición ya abierta arruinaría
   *  la comparación. Las abiertas antes de esto siguen como GRUPO DE CONTROL. */
  mgmt?: { tp: number; sl: number };
  /** Por qué se cerró: vencimiento, toma de ganancia o stop. */
  exitReason?: "vencimiento" | "ganancia" | "stop";
}
let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    if (!process.env.REDIS_URL) throw new Error("FWD_STORE=redis pero falta REDIS_URL en el entorno");
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return redis;
}
function readJsonFile(path: string): Trade[] {
  try { return JSON.parse(readFileSync(path, "utf8")) as Trade[]; } catch { return []; }
}
function saveJson(path: string, data: unknown) {
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}
// Carga el ledger del backend activo. En redis: si la key está vacía (primera vez),
// SIEMBRA desde el JSON committeado para no perder las 64 jugadas iniciales.
async function loadLedger(): Promise<Trade[]> {
  if (STORE === "redis") {
    const raw = await getRedis().get(REDIS_KEY);
    if (raw) { try { return JSON.parse(raw) as Trade[]; } catch { return []; } }
    return readJsonFile(LEDGER); // semilla desde git la primera vez
  }
  return readJsonFile(LEDGER);
}
// Persiste ledger + reporte en el backend activo.
async function persist(ledger: Trade[], report: string) {
  if (STORE === "redis") {
    const r = getRedis();
    await r.set(REDIS_KEY, JSON.stringify(ledger));
    await r.set(`${REDIS_KEY}:report`, report);
    return;
  }
  saveJson(LEDGER, ledger);
  saveJson(REPORT, report);
}

// ── Helpers de barras / señal (copiados del backtest para mantener el script aislado) ──
interface DBar { time: string; close: number }
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

// DEUDA CONOCIDA: esta `signals()` es gemela de la de lib/backtestCore.ts. Difieren en UNA
// línea a propósito — el backtest descarta la última barra (no puede liquidar) y aquí sí se
// abre con la del día. Unificarlas con un parámetro está pendiente; no se hizo el mismo día en
// que la corrida en vivo depende de este script. Si tocas una, TOCA LA OTRA.
interface Signal {
  entryDate: string; entryIdx: number; spot: number; rv: number; dir: 1 | -1;
  evaComp: number; victorComp: number; entryMs: number;
  netRatio: number; ivRatio: number;
}
// Igual que el backtest: agrupa el flujo por DÍA → dirección neta + composite de convicción.
// Diferencia: NO exige una barra "siguiente" (en vivo entramos al cierre del último día).
function signals(rows: FlowRow[], bars: DBar[]): Signal[] {
  const byDay = new Map<string, FlowRow[]>();
  for (const r of rows) {
    const d = r.timestamp.slice(0, 10);
    const arr = byDay.get(d); if (arr) arr.push(r); else byDay.set(d, [r]);
  }
  const out: Signal[] = [];
  for (const [d, dayRows] of byDay) {
    const entryIdx = barIdxOnOrBefore(bars, Date.parse(`${d}T20:00:00Z`));
    if (entryIdx < 20) continue;
    const rv = realizedVol(bars, entryIdx);
    if (rv == null || !(rv > 0)) continue;
    const spot = bars[entryIdx].close;
    let net = 0, totP = 0, aA = 0, aC = 0, aU = 0, aI = 0;
    let dirP = 0, aIV = 0;
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
    if (net === 0 || totP <= 0) continue;
    const wa = aA / totP, wc = aC / totP, wu = aU / totP, wi = aI / totP;
    const victorComp = ((wa / 10) * 20 + (wc / 10) * 20 + (wu / 10) * 20 + (wi / 10) * 10) / 70 * 100;
    const evaComp = ((wc / 10) * 30 + (wu / 10) * 20 + (wi / 10) * 15 + (wa / 10) * 10) / 75 * 100;
    out.push({
      entryDate: d, entryIdx, spot, rv, dir: net > 0 ? 1 : -1, evaComp, victorComp,
      entryMs: Date.parse(`${d}T20:00:00Z`),
      netRatio: dirP > 0 ? Math.abs(net) / dirP : 0,
      ivRatio: rv > 0 ? (aIV / totP) / rv : 0,
    });
  }
  return out;
}

// ── Abrir / liquidar un credit spread de papel ────────────────────────────────
function openSpread(sig: Signal, dte: number, sigma: number, gexHoy: number | null, nocionalHoy: number | null): Trade | null {
  const { spot, rv, entryMs, dir } = sig;
  const T = dte / 365;
  const em = spot * rv * Math.sqrt(dte / 365);
  if (!(em > 0)) return null;
  const bull = dir === 1;
  const type: "put" | "call" = bull ? "put" : "call";       // a favor: bull→put spread abajo, bear→call spread arriba
  const shortK = bull ? spot - sigma * em : spot + sigma * em;
  const longK = bull ? shortK - WIDTH_EM * em : shortK + WIDTH_EM * em;
  if (shortK <= 0 || longK <= 0) return null;
  const credit = bsPrice(spot, shortK, T, rv, type) - bsPrice(spot, longK, T, rv, type);
  const width = Math.abs(shortK - longK);
  if (!(credit > 0) || !(width > 0)) return null;
  const netCredit = credit * (1 - SLIP) - (COMM * 2) / 100;  // crédito tras slippage + comisión de 2 patas
  if (!(netCredit > 0)) return null;
  const expiryMs = entryMs + dte * 86_400_000;

  // ── Sombra del iron condor ──────────────────────────────────────────────────────────────
  // Mismos strikes que el vertical en el lado que EVA elige, MÁS el lado contrario simétrico.
  // 4 patas → el doble de comisión que el vertical. No cambia nada de lo que se abre.
  const condor = (() => {
    const shortPut = spot - sigma * em, longPut = shortPut - WIDTH_EM * em;
    const shortCall = spot + sigma * em, longCall = shortCall + WIDTH_EM * em;
    if (longPut <= 0) return undefined;
    const cPut = bsPrice(spot, shortPut, T, rv, "put") - bsPrice(spot, longPut, T, rv, "put");
    const cCall = bsPrice(spot, shortCall, T, rv, "call") - bsPrice(spot, longCall, T, rv, "call");
    const cTot = cPut + cCall;
    const w = WIDTH_EM * em;                                  // el ancho es el mismo en los dos lados
    const nc = cTot * (1 - SLIP) - (COMM * 4) / 100;
    // Crédito ≥ ancho significaría dinero gratis: imposible en la práctica, señal de mal precio.
    if (!(cTot > 0) || !(nc > 0) || !(w - nc > 0)) return undefined;
    return {
      shortPut: round(shortPut), longPut: round(longPut),
      shortCall: round(shortCall), longCall: round(longCall),
      netCredit: round(nc, 4), width: round(w),
    };
  })();
  return {
    id: "", // se completa abajo con `${ticker}|${entryDate}|${dte}|${sigma}`
    ticker: "", entryDate: sig.entryDate, entryMs,
    dte, sigma, dir, type,
    spot: round(spot), rv: round(rv, 4), shortK: round(shortK), longK: round(longK), width: round(width),
    credit: round(credit, 4), netCredit: round(netCredit, 4), expiryMs, expiryDate: new Date(expiryMs).toISOString().slice(0, 10),
    evaComp: round(sig.evaComp, 1), victorComp: round(sig.victorComp, 1),
    ivRatio: round(sig.ivRatio, 3), netRatio: round(sig.netRatio, 3),
    ...(gexHoy != null ? { gexNorm: Math.round(gexHoy) } : {}),
    ...(nocionalHoy != null ? { oiNocional: Math.round(nocionalHoy / 1e6) } : {}),   // en millones
    ...(condor ? { condor } : {}),
    status: "open",
  };
}
/**
 * GESTIÓN DIARIA (solo para las celdas que la tienen asignada). Camina la posición abierta y
 * la cierra si tocó la toma de ganancia o el stop, valorando el spread con Black-Scholes
 * (misma IV de entrada), igual que el backtest de gestión.
 *
 * Por qué solo en 5d: el backtest mostró que a 5 días cortar AYUDA (+0,9% → +2,2%), pero a
 * 60/90 días ESTORBA (hay tiempo de recuperarse; cortar cristaliza pérdidas que se revierten).
 */
function manage(t: Trade, bars: DBar[]): boolean {
  if (!t.mgmt || t.status !== "open") return false;
  const risk = t.width - t.netCredit;
  if (!(risk > 0)) return false;
  // Recorre los días hábiles desde la entrada hasta hoy (o el vencimiento, lo que llegue antes).
  const startIdx = barIdxOnOrAfter(bars, t.entryMs + 86_400_000);
  if (startIdx < 0) return false;
  for (let i = startIdx; i < bars.length; i++) {
    const tMs = Date.parse(`${bars[i].time}T20:00:00Z`);
    if (tMs > t.expiryMs) break;                 // a partir de aquí lo liquida settle()
    const Trem = Math.max((t.expiryMs - tMs) / YR, 1 / 365 / 24);
    const val = bsPrice(bars[i].close, t.shortK, Trem, t.rv, t.type)
      - bsPrice(bars[i].close, t.longK, Trem, t.rv, t.type);
    const pnlPerShare = t.netCredit - val;
    const hitTp = pnlPerShare >= t.mgmt.tp * t.netCredit;
    const hitSl = pnlPerShare <= -t.mgmt.sl * t.netCredit;
    if (!hitTp && !hitSl) continue;
    t.retOnRisk = round((pnlPerShare / risk) * 100, 1);
    t.pnlPerSpread = round(pnlPerShare * 100, 2);
    t.exitSpot = round(bars[i].close);
    t.exitDate = bars[i].time;
    t.exitReason = hitTp ? "ganancia" : "stop";
    t.status = "closed";
    return true;
  }
  return false;
}

function settle(t: Trade, bars: DBar[]): boolean {
  const expIdx = barIdxOnOrAfter(bars, t.expiryMs);
  if (expIdx < 0) return false; // aún no hay cierre tras el vencimiento en los datos
  const sExp = bars[expIdx].close;
  const bull = t.dir === 1;
  const shortIntr = bull ? Math.max(t.shortK - sExp, 0) : Math.max(sExp - t.shortK, 0);
  const longIntr = bull ? Math.max(t.longK - sExp, 0) : Math.max(sExp - t.longK, 0);
  const pnlPerShare = t.netCredit - (shortIntr - longIntr);
  const risk = t.width - t.netCredit;
  t.retOnRisk = round((risk > 0 ? pnlPerShare / risk : pnlPerShare / t.width) * 100, 1);
  t.pnlPerSpread = round(pnlPerShare * 100, 2);
  t.exitSpot = round(sExp);
  t.exitDate = bars[expIdx].time;
  t.exitReason = "vencimiento";
  t.status = "closed";

  // La sombra del cóndor se liquida con el MISMO precio de vencimiento. Solo una de las dos
  // patas cortas puede acabar dentro del dinero, así que se suman las dos y una es cero.
  if (t.condor) {
    const c = t.condor;
    const perdPut = Math.max(c.shortPut - sExp, 0) - Math.max(c.longPut - sExp, 0);
    const perdCall = Math.max(sExp - c.shortCall, 0) - Math.max(sExp - c.longCall, 0);
    const riesgoC = c.width - c.netCredit;
    if (riesgoC > 0) c.retOnRisk = round(((c.netCredit - (perdPut + perdCall)) / riesgoC) * 100, 1);
  }
  return true;
}
function round(x: number, d = 2): number { const p = 10 ** d; return Math.round(x * p) / p; }

// ── Estadística ───────────────────────────────────────────────────────────────
interface Stat { n: number; win: number | null; mean: number | null; median: number | null }
function stat(v: number[]): Stat {
  if (v.length === 0) return { n: 0, win: null, mean: null, median: null };
  const s = [...v].sort((a, b) => a - b);
  return { n: s.length, win: Math.round((s.filter((x) => x > 0).length / s.length) * 100), mean: Math.round((s.reduce((a, x) => a + x, 0) / s.length) * 10) / 10, median: Math.round(s[Math.floor(s.length / 2)] * 10) / 10 };
}
const fmt = (s: Stat) => s.n === 0 ? "—" : `win ${s.win}% · media ${s.mean}% · mediana ${s.median}% (n=${s.n})`;
function pctile(vals: number[], p: number): number | null {
  if (vals.length === 0) return null;
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`Forward-test credit spread · ${TICKERS.length} tickers · celdas ${CELLS.map((c) => `${c.dte}d@${c.sigma}σ`).join(", ")} · flujo ${FWD_DAYS}d · store=${STORE}`);
  const ledger = await loadLedger();
  const byId = new Map(ledger.map((t) => [t.id, t] as const));
  const barsByTicker = new Map<string, DBar[]>();
  const added: Trade[] = [];

  for (const t of TICKERS) {
    try {
      const { trades } = await fetchFlow(t, { targetDays: FWD_DAYS, minPremium: MIN_PREMIUM, contractCap: 25, maxPages: 6 });
      const { rows } = classifyFlow(trades, new Date());
      let bars: DBar[] = [];
      for (let i = 0; i < 4; i++) { bars = (await fetchDailyBars(t, 800).catch(() => [])) as DBar[]; if (bars.length > 0) break; await sleep(800 * (i + 1)); }
      if (!bars.length) { console.log(`[${t}] sin barras — omitido`); continue; }
      barsByTicker.set(t, bars);
      const sigs = signals(rows, bars);

      // GEX del día, una sola vez por ticker. Si falla se registra null y no pasa nada: es una
      // medición paralela, no una condición para operar. Nunca asumir "gamma positiva" ante un
      // fallo — eso convertiría un error de red en una decisión.
      let gexHoy: number | null = null;
      let nocionalHoy: number | null = null;
      const ultima = sigs[sigs.length - 1];
      if (ultima) {
        const r = await fetchGexNormalizado(t, ultima.spot, ultima.rv).catch(() => null);
        if (r) {
          gexHoy = r.gex; nocionalHoy = r.nocional;
          console.log(`[${t}] GEX ${gexHoy > 0 ? "+" : ""}${Math.round(gexHoy).toLocaleString("en-US")} · OI nocional $${(r.nocional / 1e9).toFixed(1)}B${INDICES_GEX.has(t) ? " (índice)" : ""}`);
        }
      }

      let newN = 0;
      for (const sig of sigs) {
        for (const cell of CELLS) {
          const rec = openSpread(sig, cell.dte, cell.sigma, gexHoy, nocionalHoy);
          if (!rec) continue;
          rec.ticker = t;
          // Gestión SOLO al 5d (el backtest dice que a 60/90 días estorba). Se fija al abrir:
          // las posiciones abiertas antes de esto quedan sin `mgmt` = grupo de CONTROL.
          if (MGMT_CELLS.has(cell.dte)) rec.mgmt = { tp: MGMT_TP, sl: MGMT_SL };
          rec.id = `${t}|${sig.entryDate}|${cell.dte}|${cell.sigma}`;
          if (byId.has(rec.id)) continue; // dedupe: ya registrado
          byId.set(rec.id, rec); ledger.push(rec); added.push(rec); newN++;
        }
      }
      console.log(`[${t}] señales ${sigs.length} · nuevas de papel ${newN}`);
    } catch (e) { console.error(`[${t}] ERROR:`, (e as Error).message); }
    await sleep(2500);
  }

  // Antes de liquidar: rescatar barras de los tickers que HOY fallaron pero tienen posiciones
  // abiertas. Sin esto, un ticker con problemas de datos deja sus vencidas abiertas para
  // siempre y quedan FUERA de las estadísticas — sesgando el win-rate hacia arriba.
  const rescate = await asegurarBarrasDeLiquidacion(ledger, barsByTicker, (tk) => fetchDailyBars(tk, 800) as Promise<DBar[]>);
  if (rescate.rescatados.length) console.log(`Barras rescatadas para liquidar: ${rescate.rescatados.join(", ")}`);
  for (const s of rescate.sinResolver) console.warn(`[${s.ticker}] ⚠ NO se pudieron bajar barras — sus posiciones vencidas NO liquidan: ${s.motivo}`);

  // Liquidar las vencidas.
  let settled = 0, managed = 0;
  for (const t of ledger) {
    if (t.status !== "open") continue;
    const bars = barsByTicker.get(t.ticker);
    if (!bars) continue;
    // 1º la gestión (puede cerrar ANTES del vencimiento); 2º el vencimiento.
    if (manage(t, bars)) { managed++; settled++; continue; }
    if (Date.now() < t.expiryMs) continue;
    if (settle(t, bars)) settled++;
  }

  // Red de seguridad: si tras liquidar queda alguna vencida abierta, se dice. Es la señal de
  // que el forward-test está midiendo menos de lo que cree.
  const zombis = vencidasSinLiquidar(ledger, Date.now());
  if (zombis.length) console.warn(`⚠ ${zombis.length} posiciones VENCIDAS siguen abiertas: ${zombis.map((z) => `${z.ticker}/${z.expiryDate}`).join(", ")}`);

  // ── Reporte ──────────────────────────────────────────────────────────────
  const closed = ledger.filter((t) => t.status === "closed");
  const open = ledger.filter((t) => t.status === "open");
  const allEva = ledger.map((t) => t.evaComp);
  const cut = pctile(allEva, 2 / 3); // umbral vivo de "alta convicción" (Top⅓) sobre lo acumulado

  const L: string[] = [
    "# Forward-test — credit spread filtrado por convicción de EVA",
    "",
    `Corrida: ${new Date().toISOString().slice(0, 16)}Z · panel ${TICKERS.length} · celdas ${CELLS.map((c) => `${c.dte}d@${c.sigma}σ`).join(", ")}`,
    `Ledger: **${ledger.length}** de papel (**${open.length}** abiertas · **${closed.length}** cerradas). Nuevas esta corrida: **${added.length}** · liquidadas: **${settled}** (${managed} por gestión).`,
    "",
    "> PAPEL — nada de esto es una orden real. Entrada al cierre del día de la señal; IV≈vol realizada 20d; slippage 5% + comisión Robinhood; vencimiento por calendario. El 5d se GESTIONA (toma de ganancia 25% / stop 1x, revisado a diario); 60d y 90d se sostienen a vencimiento.",
    "",
  ];

  if (added.length) {
    L.push("## Nuevas jugadas de papel esta corrida", "", "| Ticker | Entrada | Celda | Dir | Convicción EVA | ¿Alta conv.? |", "|---|---|---|---|---|---|");
    for (const t of added.sort((a, b) => b.evaComp - a.evaComp)) {
      const hi = cut != null && t.evaComp >= cut ? "★ sí" : "no";
      L.push(`| ${t.ticker} | ${t.entryDate} | ${t.dte}d@${t.sigma}σ | ${t.dir === 1 ? "alcista (put spread)" : "bajista (call spread)"} | ${t.evaComp} | ${hi} |`);
    }
    L.push("");
  }

  L.push(`## Umbral vivo de alta convicción (Top⅓): **${cut != null ? round(cut, 1) : "—"}** (percentil 67 de la convicción EVA acumulada)`, "");

  if (closed.length) {
    L.push("## Resultados de las jugadas CERRADAS (datos hacia adelante)", "");
    // Global + por celda
    L.push(`- **TODAS:** ${fmt(stat(closed.map((t) => t.retOnRisk!)))}`);
    for (const cell of CELLS) {
      const cc = closed.filter((t) => t.dte === cell.dte && t.sigma === cell.sigma);
      if (cc.length) L.push(`- ${cell.dte}d@${cell.sigma}σ: ${fmt(stat(cc.map((t) => t.retOnRisk!)))}`);
    }

    // A/B de la GESTIÓN: solo vale comparar dentro del mismo plazo (los gestionados nacieron
    // con la regla; los de antes son el control). Sin este corte, se mezclarían peras y manzanas.
    // Los plazos a comparar salen del LEDGER, no de MGMT_CELLS: la gestión está apagada para las
    // posiciones nuevas, pero las que se abrieron con ella siguen vivas y son el grupo de
    // control. Si esto mirara MGMT_CELLS (ahora vacío), esas posiciones desaparecerían del
    // reporte justo cuando empiecen a cerrar y a decir algo.
    const dtesConGestion = [...new Set(closed.filter((t) => t.mgmt).map((t) => t.dte))].sort((a, b) => a - b);
    for (const dte of dtesConGestion) {
      const conG = closed.filter((t) => t.dte === dte && t.mgmt);
      const sinG = closed.filter((t) => t.dte === dte && !t.mgmt);
      if (!conG.length && !sinG.length) continue;
      L.push(
        "",
        `### ¿La gestión mejora el ${dte}d? (TG ${Math.round(MGMT_TP * 100)}% + stop ${MGMT_SL}× — APAGADA para las nuevas)`,
        `- **Con gestión:** ${fmt(stat(conG.map((t) => t.retOnRisk!)))}`,
        `- Sin gestión (control): ${fmt(stat(sinG.map((t) => t.retOnRisk!)))}`,
      );
      if (conG.length) {
        const porRazón = ["ganancia", "stop", "vencimiento"]
          .map((r) => `${r}: ${conG.filter((t) => t.exitReason === r).length}`).join(" · ");
        L.push(`- Cómo salieron: ${porRazón}`);
      }
      L.push(`- El backtest de 2 años esperaba +0,9% → +2,2%; el de **10 años dice lo contrario**: +3,22% → +1,99% (la peor de 9 reglas). Por eso se apagó. Estas posiciones son el grupo de control que lo confirma o lo desmiente EN VIVO.`);
    }
    // ── SCORER NUEVO "EVA-IV" — el mismo Top⅓ pero SIN los días en que el flujo paga una IV
    // desproporcionada frente a la volatilidad realizada (ivRatio >= 1.1). Sale del backtest de
    // 10 años (2016-2026, n=7.595): sobre el Top⅓, filtrar por IV/rv<1.1 subió la media de
    // +2,27% a +3,19% conservando el 86% de las operaciones, y aguantó las DOS mitades OOS
    // (+3,41 / +2,97). En dólares, con $1.200 de riesgo por operación: de ~$6.660 a ~$8.053 al año.
    //
    // MECANISMO (no es minería de datos): cuando el flujo paga mucha IV, el mercado está
    // descontando un movimiento que la volatilidad pasada no ve — vender prima contra eso es
    // ponerse delante del camión.
    //
    // EVA SIGUE INTACTA como referencia: esto NO cambia qué posiciones se abren, solo añade una
    // lectura paralela sobre las mismas jugadas. Si el filtro resulta ser humo, se borra esta
    // sección y no hay nada que deshacer.
    const conIv = closed.filter((t) => t.ivRatio != null);
    if (conIv.length >= 10) {
      const kk = Math.max(1, Math.floor(conIv.length / 3));
      const topIv = [...conIv].sort((a, b) => a.evaComp - b.evaComp).slice(conIv.length - kk);
      const filtrado = topIv.filter((t) => (t.ivRatio ?? 9) < 1.1);
      const excluido = topIv.filter((t) => (t.ivRatio ?? 9) >= 1.1);
      L.push(
        "",
        "### Scorer EVA-IV — Top⅓ sin los días de IV desproporcionada",
        `- **EVA-IV (Top⅓ + IV/rv<1,1):** ${fmt(stat(filtrado.map((t) => t.retOnRisk!)))}`,
        `- Top⅓ sin filtrar (control): ${fmt(stat(topIv.map((t) => t.retOnRisk!)))}`,
        `- Lo que el filtro DESCARTA: ${fmt(stat(excluido.map((t) => t.retOnRisk!)))}`,
        `- El backtest de 10 años esperaba **+2,3% → +3,2%**. Sirve solo si lo descartado rinde PEOR que lo filtrado; si rinde igual o mejor, el filtro es ruido.`,
      );
    }

    // ── IRON CONDOR (sombra) — vender TAMBIÉN el lado contrario ───────────────────────────
    // P2 mostró que EVA acierta el DÍA pero no el LADO. Si el lado da igual, el cóndor cobra
    // prima de las dos patas sobre la misma selección. En backtest: +6,68% vs +2,52%, pero con
    // el DOBLE de catástrofes. Aquí solo se mide sobre las MISMAS jugadas — no se abre nada
    // distinto, así que la comparación es limpia y no cuesta un dólar comprobarla.
    const conCondor = closed.filter((t) => t.condor?.retOnRisk != null);
    if (conCondor.length >= 10) {
      const rv2 = conCondor.map((t) => t.retOnRisk!);
      const rc = conCondor.map((t) => t.condor!.retOnRisk!);
      const cat = (a: number[]) => ((a.filter((x) => x <= -50).length / a.length) * 100).toFixed(1);
      L.push(
        "",
        "### Iron condor (sombra) — mismas jugadas, vendiendo los DOS lados",
        `- **Cóndor:** ${fmt(stat(rc))} · catástrofes ${cat(rc)}%`,
        `- Vertical (lo que se abre de verdad): ${fmt(stat(rv2))} · catástrofes ${cat(rv2)}%`,
        `- El backtest esperaba **+6,68% vs +2,52%** con las catástrofes al doble (13,5% vs 7,4%).`,
        `- Se GRABA, no decide. Adoptarlo sería aceptar más caída a cambio de más dinero — y esa es una decisión de Lester, no del script.`,
      );
    }

    // ── FILTRO DE GAMMA — se mide en índices Y en acciones, y filtra en ninguno ───────────
    // El mecanismo solo aparece en los ETF de índice, pero medirlo en todos no cuesta nada y
    // deja que el VIVO decida si el efecto de las acciones existe. Si al cabo de unos meses
    // los índices con gamma negativa rinden claramente peor y las acciones no, la regla se
    // gana el derecho a filtrar. Hasta entonces, solo mira.
    const conGex = closed.filter((t) => t.gexNorm != null);
    if (conGex.length >= 10) {
      for (const [etiqueta, sel] of [
        ["ÍNDICES (SPY/QQQ) — con respaldo teórico", (t: Trade) => t.ticker === "SPY" || t.ticker === "QQQ"],
        ["ACCIONES — sin mecanismo medido", (t: Trade) => t.ticker !== "SPY" && t.ticker !== "QQQ"],
      ] as [string, (t: Trade) => boolean][]) {
        const g = conGex.filter(sel);
        if (g.length < 6) continue;
        const orden = [...g].sort((a, b) => (a.gexNorm ?? 0) - (b.gexNorm ?? 0));
        const mitad = Math.floor(orden.length / 2);
        L.push(
          "",
          `### Filtro de gamma · ${etiqueta}`,
          `- Gamma más NEGATIVA (mitad inferior): ${fmt(stat(orden.slice(0, mitad).map((t) => t.retOnRisk!)))}`,
          `- Gamma más POSITIVA (mitad superior): ${fmt(stat(orden.slice(mitad).map((t) => t.retOnRisk!)))}`,
        );
      }
      L.push(`- El backtest esperaba que la mitad negativa rindiera PEOR, y solo en índices: ahí evitar el 50% más negativo llevó de +0,22% a +3,50% fuera de muestra. En acciones mejoraba por operación pero perdía dinero al año. Se REGISTRA en ambos; no filtra en ninguno.`, "");
    }

    // EL FILTRO: Top⅓ vs Bottom⅓ por convicción de EVA (misma metodología validada)
    const k = Math.max(1, Math.floor(closed.length / 3));
    const byEva = [...closed].sort((a, b) => a.evaComp - b.evaComp);
    const topEva = byEva.slice(closed.length - k), botEva = byEva.slice(0, k);
    const byVic = [...closed].sort((a, b) => a.victorComp - b.victorComp).slice(closed.length - k);
    L.push(
      "",
      "### El valor del filtro en vivo (¿la alta convicción de EVA rinde mejor?)",
      `- **Top⅓ EVA:** ${fmt(stat(topEva.map((t) => t.retOnRisk!)))}`,
      `- Bottom⅓ EVA: ${fmt(stat(botEva.map((t) => t.retOnRisk!)))}`,
      `- Top⅓ Victor (comparación): ${fmt(stat(byVic.map((t) => t.retOnRisk!)))}`,
      "",
      "Se confirma el hallazgo del backtest **solo si** el Top⅓ EVA le gana a TODAS y al Bottom⅓ una vez haya suficientes cierres (apunta a n≥30 por grupo antes de sacar conclusiones).",
      "",
    );
  } else {
    L.push("## Resultados", "", "_Aún no hay jugadas cerradas — las de 5d empiezan a liquidar en ~1 semana; las de 90d en ~3 meses. Vuelve a correr el script periódicamente._", "");
  }

  if (open.length) {
    L.push("## Posiciones de papel ABIERTAS (próximas a vencer primero)", "", "| Ticker | Entrada | Vence | Celda | Dir | Conv. EVA |", "|---|---|---|---|---|---|");
    for (const t of [...open].sort((a, b) => a.expiryMs - b.expiryMs).slice(0, 25)) {
      L.push(`| ${t.ticker} | ${t.entryDate} | ${t.expiryDate} | ${t.dte}d@${t.sigma}σ | ${t.dir === 1 ? "↑" : "↓"} | ${t.evaComp} |`);
    }
    if (open.length > 25) L.push(`| … | | | | | (+${open.length - 25} más) |`);
    L.push("");
  }

  const report = L.join("\n") + "\n";
  await persist(ledger, report);
  console.log("\n" + report);
  console.log(STORE === "redis"
    ? `=== ledger en Redis key "${REDIS_KEY}" (reporte en "${REDIS_KEY}:report") ===`
    : `=== ledger: ${LEDGER} · reporte: ${REPORT} ===`);
  if (redis) await redis.quit(); // cierra la conexión para que el proceso (cron) termine
})();
