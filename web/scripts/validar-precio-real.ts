// ¿El crédito que cobra el backtest existe en el mercado?
//
// EL PROBLEMA: el backtest valora el credit spread con Black-Scholes usando la volatilidad
// realizada de 20 días como sustituto de la IV. Nunca se comparó con lo que el mercado pagaba
// de verdad. Si el modelo cobra de más, el edge de +2,3% podría ser el error del modelo — y no
// se notaría, porque TODAS las celdas usan el mismo modelo y las comparaciones internas
// seguirían siendo coherentes mientras el número absoluto está inflado.
//
// SE MIDEN DOS COSAS DISTINTAS, y las dos juegan en contra:
//   1. STRIKE: el backtest vende en `spot − 1σ`, que puede ser 327,43 — ese contrato no existe.
//      Hay que ir al strike listado más cercano.
//   2. PRECIO: vender la pata corta al BID y comprar la larga al ASK (lo que de verdad te
//      ejecutan), contra el precio teórico de Black-Scholes.
//
// Muestra, no censo: buscamos un sesgo sistemático, no el resultado de cada operación.
//
// Uso: DATA_PROVIDER=theta node --env-file=.env.thetadata scripts/with-theta.mjs \
//        npx tsx scripts/validar-precio-real.ts

import { readFileSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, creditSpreadPnl, WIDTH_EM, type DBar, type Signal } from "../lib/backtestCore";
import { bsPrice } from "../lib/blackScholes";

const TICKERS = (process.env.VP_TICKERS || "SPY,AAPL,NVDA,TSLA,QQQ,AMD").split(",");
const MUESTRA = Number(process.env.VP_MUESTRA) || 400;
const DTE = 5, SIGMA = 1;
const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const DIR = "scripts/cache-theta";
const BT_START = "20160101", BT_END = "20260731";

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const compact = (s: string) => s.replace(/-/g, "");
const shiftYmd = (y: string, d: number) =>
  new Date(Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`) + d * 86_400_000)
    .toISOString().slice(0, 10).replace(/-/g, "");
function yearWindows(s0: string, e0: string): [string, string][] {
  const out: [string, string][] = [];
  let s = s0;
  while (Number(s) <= Number(e0)) {
    const e = String(Math.min(Number(`${s.slice(0, 4)}1231`), Number(e0)));
    out.push([s, e]); s = `${Number(s.slice(0, 4)) + 1}0101`;
  }
  return out;
}
const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

interface Csv { header: string[]; rows: string[][] }
async function getCsv(path: string): Promise<Csv | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const txt = await res.text();
    const lines = txt.trim().split(/\r?\n/);
    if (lines.length < 2 || lines[0].includes(" ")) return null; // los errores son prosa, no CSV
    const unq = (x: string) => x.replace(/^"|"$/g, "");
    return { header: lines[0].split(",").map(unq), rows: lines.slice(1).map((l) => l.split(",").map(unq)) };
  } catch { return null; }
}
const idx = (h: string[], n: string) => h.indexOf(n);

/** Vencimientos listados por ticker (una vez, cacheado en memoria). */
const expCache = new Map<string, string[]>();
async function expiraciones(sym: string): Promise<string[]> {
  const hit = expCache.get(sym); if (hit) return hit;
  const csv = await getCsv(`/v3/option/list/expirations?symbol=${sym}`);
  const iE = csv ? idx(csv.header, "expiration") : -1;
  const out = csv && iE >= 0 ? csv.rows.map((r) => compact(r[iE])).filter(Boolean).sort() : [];
  expCache.set(sym, out);
  return out;
}

interface Pata { strike: number; bid: number; ask: number }
/** Cadena de un vencimiento en una fecha: strike → {bid, ask} del tipo pedido. */
async function cadena(sym: string, expYmd: string, dayYmd: string, right: "call" | "put"): Promise<Pata[]> {
  const csv = await getCsv(`/v3/option/history/eod?symbol=${sym}&expiration=${expYmd}&start_date=${dayYmd}&end_date=${dayYmd}`);
  if (!csv) return [];
  const iK = idx(csv.header, "strike"), iR = idx(csv.header, "right"),
    iB = idx(csv.header, "bid"), iA = idx(csv.header, "ask");
  if (iK < 0 || iR < 0 || iB < 0 || iA < 0) return [];
  const want = right === "call" ? "CALL" : "PUT";
  const out: Pata[] = [];
  for (const r of csv.rows) {
    if (r[iR] !== want) continue;
    const strike = Number(r[iK]), bid = Number(r[iB]), ask = Number(r[iA]);
    if (strike > 0 && bid >= 0 && ask > 0) out.push({ strike, bid, ask });
  }
  return out;
}
const masCercano = (patas: Pata[], k: number) =>
  patas.length ? patas.reduce((a, b) => (Math.abs(b.strike - k) < Math.abs(a.strike - k) ? b : a)) : null;

(async () => {
  // ── 1. Reconstruir señales con el MISMO código del backtest ──────────────────────────────
  const todas: { sig: Signal; bars: DBar[]; ticker: string }[] = [];
  const vIni = shiftYmd(BT_START, -40), vFin = shiftYmd(BT_END, 220);
  for (const t of TICKERS) {
    const trades: unknown[] = [];
    for (const [ys, ye] of yearWindows(BT_START, BT_END)) {
      const y = leer<unknown[]>(`${DIR}/${t}_y_${ys}_${ye}.json`); if (y?.length) trades.push(...y);
    }
    const trozos: DBar[] = [];
    for (const [ys, ye] of yearWindows(vIni, vFin)) {
      const b = leer<DBar[]>(`${DIR}/${t}_barsPAR_y_${ys}_${ye}.json`); if (b?.length) trozos.push(...b);
    }
    const porFecha = new Map(trozos.map((x) => [x.time, x] as const));
    const bars = [...porFecha.values()].sort((a, b) => (a.time < b.time ? -1 : 1));
    if (!trades.length || !bars.length) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const sig of signals(classifyFlow(trades as any, new Date()).rows, bars)) todas.push({ sig, bars, ticker: t });
  }
  todas.sort((a, b) => a.sig.entryMs - b.sig.entryMs);

  // Muestreo DETERMINISTA (cada k-ésima): reparte por todo el período y es reproducible.
  const paso = Math.max(1, Math.floor(todas.length / MUESTRA));
  const muestra = todas.filter((_, i) => i % paso === 0).slice(0, MUESTRA);
  console.log(`\n=== CRÉDITO MODELADO vs REAL · ${DTE}d @${SIGMA}σ ===`);
  console.log(`Señales totales ${todas.length} · muestra ${muestra.length} (1 de cada ${paso})\n`);

  // ── 2. Comparar, señal a señal ───────────────────────────────────────────────────────────
  const filas: { modelado: number; real: number; mid: number; dK: number; año: string }[] = [];
  let sinCadena = 0, sinVenc = 0;
  let hechas = 0;

  for (const { sig, ticker } of muestra) {
    const dia = ymd(sig.entryMs);
    const objetivo = compact(ymd(sig.entryMs + DTE * 86_400_000));
    const exps = await expiraciones(ticker);
    const exp = exps.find((e) => e >= objetivo);
    if (!exp) { sinVenc++; continue; }

    const { spot, rv, dir } = sig;
    const em = spot * rv * Math.sqrt(DTE / 365);
    const bull = dir === 1;
    const shortK = bull ? spot - SIGMA * em : spot + SIGMA * em;
    const longK = bull ? shortK - WIDTH_EM * em : shortK + WIDTH_EM * em;
    const right = bull ? "put" : "call";

    const patas = await cadena(ticker, exp, compact(dia), right);
    const s = masCercano(patas, shortK), l = masCercano(patas, longK);
    if (!s || !l || s.strike === l.strike) { sinCadena++; continue; }

    // REAL, como te ejecutan: vendes la corta al BID, compras la larga al ASK.
    const real = s.bid - l.ask;
    // MID: referencia optimista (a mitad del spread), para separar el efecto del bid/ask.
    const mid = (s.bid + s.ask) / 2 - (l.bid + l.ask) / 2;
    // MODELADO: lo mismo que hace el backtest, pero sobre los strikes REALES listados —
    // así el error de strike no se mezcla con el error de precio.
    const T = DTE / 365;
    const modelado = bsPrice(spot, s.strike, T, rv, right) - bsPrice(spot, l.strike, T, rv, right);
    if (!(modelado > 0)) continue;

    filas.push({ modelado, real, mid, dK: Math.abs(s.strike - shortK) / spot * 100, año: dia.slice(0, 4) });
    if (++hechas % 50 === 0) console.log(`   … ${hechas}/${muestra.length}`);
  }

  if (!filas.length) { console.error("Sin datos comparables — aborta."); process.exit(1); }

  // ── 3. Veredicto ─────────────────────────────────────────────────────────────────────────
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const ratioReal = filas.map((f) => f.real / f.modelado);
  const ratioMid = filas.map((f) => f.mid / f.modelado);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  console.log(`\n--- RESULTADO (n=${filas.length}, ${sinCadena} sin cadena, ${sinVenc} sin vencimiento) ---\n`);
  console.log(`Crédito REAL / MODELADO   mediana ${pct(med(ratioReal))}   media ${pct(ratioReal.reduce((s, x) => s + x, 0) / ratioReal.length)}`);
  console.log(`Crédito MID  / MODELADO   mediana ${pct(med(ratioMid))}   media ${pct(ratioMid.reduce((s, x) => s + x, 0) / ratioMid.length)}`);
  console.log(`\nDesvío del strike listado vs el pedido: mediana ${med(filas.map((f) => f.dK)).toFixed(2)}% del spot`);

  const r = med(ratioReal);
  const dir = r >= 1 ? "MAYOR" : "MENOR";
  console.log(`\n→ El mercado paga el ${pct(r)} de lo que el modelo supone: el crédito real es`);
  console.log(`  ${pct(Math.abs(1 - r))} ${dir} que el modelado.`);
  if (r >= 1) {
    console.log(`  El backtest SUBESTIMA el crédito, así que el edge de +2,3% es un PISO, no un techo.`);
    console.log(`  Causa esperada: la IV implícita suele ir por encima de la volatilidad realizada`);
    console.log(`  (prima de riesgo de varianza), y el modelo usa la realizada.`);
  } else {
    console.log(`  El backtest COBRA DE MÁS: el edge de +2,3% baja al orden de ${(2.3 * r).toFixed(1)}%.`);
  }
  console.log(`  Ojo: el efecto no es lineal — más crédito también baja el riesgo (ancho − crédito).`);

  // Por año: ¿el sesgo es estable o cambió con el tiempo?
  const años = [...new Set(filas.map((f) => f.año))].sort();
  console.log(`\nPor año (mediana real/modelado) — si varía mucho, el sesgo NO es una constante:`);
  for (const a of años) {
    const sub = filas.filter((f) => f.año === a).map((f) => f.real / f.modelado);
    if (sub.length >= 5) console.log(`   ${a}  ${pct(med(sub)).padStart(7)}  (n=${sub.length})`);
  }
})();
