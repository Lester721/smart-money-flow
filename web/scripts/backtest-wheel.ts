// Backtest de la WHEEL — vender PUTS cash-secured para INGRESO (meta: NO ser asignado).
// La asignación se MIDE como riesgo (no se persigue). Modela la venta de puts con
// Black-Scholes (IV ≈ vol realizada 20d), barre delta × DTE × gestión, en 2 modos:
// MECÁNICO (todos los días) y con FILTRO EVA (días de flujo alcista + alta convicción).
// La pata de calls cubiertas (recuperación tras asignación) NO se modela aún (v1).
// Uso: node --env-file=.env.local --import tsx scripts/backtest-wheel.ts

import { writeFileSync } from "node:fs";
import { fetchFlow } from "../lib/massiveFlow";
import {
  classifyFlow, executionLevel, executionScore, spreadScore, spreadPct, unusualTradeScore, type FlowRow,
} from "../lib/flow";
import { bsPrice, bsDelta, impliedVol } from "../lib/blackScholes";
import { fetchDailyBars } from "../lib/massive";

const TICKERS = (process.env.BT_TICKERS || "AAPL,MSFT,NVDA,AMZN,GOOGL,META,TSLA,AMD,NFLX,QQQ,SPY,HOOD").split(",").map((t) => t.trim()).filter(Boolean);
const DAYS = Number(process.env.BT_DAYS) || 365;             // ventana de flujo (~1 año, para el head-to-head)
const MIN_PREMIUM = Number(process.env.BT_MIN_PREMIUM) || 1_000_000;
const OUT = process.env.BT_OUT || "scripts/backtest-wheel-reporte.md";

// 3 presets de delta (usamos el punto medio de cada banda como delta objetivo del put).
const DELTAS = [{ label: "0.10-0.20 (conserv.)", target: 0.15 }, { label: "0.20-0.30 (balanc.)", target: 0.25 }, { label: "0.30-0.40 (agres.)", target: 0.35 }];
const DTES = [0, 1, 3, 5, 10, 15, 30];
// Gestión: null = sostener a vencimiento; 0.5/0.7 = cerrar al capturar 50%/70% de la prima.
const MGMT: { label: string; take: number | null }[] = [{ label: "vencimiento", take: null }, { label: "50%", take: 0.5 }, { label: "70%", take: 0.7 }];

const YR = 365 * 24 * 3600 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
interface DBar { time: string; close: number }

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
  if (ratio < 0.9) return 10; if (ratio <= 1.2) return 7; if (ratio <= 1.6) return 4; return 0;
}

interface Signal { entryIdx: number; spot: number; rv: number; dir: 1 | -1; evaComp: number }
// Convicción por día (igual que el backtest de credit spread) — para el filtro EVA.
function signals(rows: FlowRow[], bars: DBar[]): Signal[] {
  const byDay = new Map<string, FlowRow[]>();
  for (const r of rows) { const d = r.timestamp.slice(0, 10); const a = byDay.get(d); if (a) a.push(r); else byDay.set(d, [r]); }
  const out: Signal[] = [];
  for (const [d, dayRows] of byDay) {
    const entryIdx = barIdxOnOrBefore(bars, Date.parse(`${d}T20:00:00Z`));
    if (entryIdx < 20 || entryIdx >= bars.length - 1) continue;
    const rv = realizedVol(bars, entryIdx); if (rv == null || !(rv > 0)) continue;
    const spot = bars[entryIdx].close;
    let net = 0, totP = 0, aA = 0, aC = 0, aU = 0, aI = 0;
    for (const r of dayRows) {
      const s = r.sentiment === "bullish" ? 1 : r.sentiment === "bearish" ? -1 : 0;
      if (s !== 0) net += s * r.premium;
      if (r.strike == null || !r.expiration || !(r.price > 0)) continue;
      const T = (Date.parse(`${r.expiration}T20:00:00Z`) - Date.parse(`${d}T20:00:00Z`)) / YR; if (T <= 0) continue;
      const iv = impliedVol(r.price, spot, r.strike, T, r.type === "call" ? "call" : "put"); if (iv == null || !(iv > 0)) continue;
      aA += executionScore(executionLevel(r.price, r.bid, r.ask, r.side)) * r.premium;
      aC += spreadScore(spreadPct(r.bid, r.ask)) * r.premium;
      aU += unusualTradeScore(r).total * r.premium;
      aI += ivProxyScore(iv, rv) * r.premium; totP += r.premium;
    }
    if (net === 0 || totP <= 0) continue;
    const wc = aC / totP, wu = aU / totP, wi = aI / totP, wa = aA / totP;
    const evaComp = ((wc / 10) * 30 + (wu / 10) * 20 + (wi / 10) * 15 + (wa / 10) * 10) / 75 * 100;
    out.push({ entryIdx, spot, rv, dir: net > 0 ? 1 : -1, evaComp });
  }
  return out;
}

// Strike del put OTM cuyo |delta| ≈ target (búsqueda en grilla).
function strikeForDelta(spot: number, T: number, iv: number, target: number): number | null {
  let best: number | null = null, bestErr = Infinity;
  for (let f = 0.55; f <= 1.0; f += 0.005) {
    const K = spot * f;
    const d = Math.abs(bsDelta(spot, K, T, iv, "put"));
    const err = Math.abs(d - target);
    if (err < bestErr) { bestErr = err; best = K; }
  }
  return best;
}

interface PutResult { retOnColl: number; assigned: boolean; annualized: number }
// Vende un put a `target` delta, `dte` días, con regla de gestión `take`. Retorno sobre
// el colateral (strike×100). Éxito = te quedas prima; asignación = riesgo medido.
function sellPut(sig: Signal, bars: DBar[], target: number, dte: number, take: number | null): PutResult | null {
  const { spot, rv, entryIdx } = sig;
  const dteEff = Math.max(dte, 1);                    // 0DTE con barras diarias ≈ 1 día (aprox, ver caveats)
  const T0 = dteEff / 365;
  const K = strikeForDelta(spot, T0, rv, target);
  if (K == null || K <= 0) return null;
  const P0 = bsPrice(spot, K, T0, rv, "put");         // prima por acción
  if (!(P0 > 0)) return null;
  const expiryIdx = entryIdx + dteEff;
  if (expiryIdx >= bars.length) return null;           // aún no vence en los datos

  // Gestión: cerrar temprano si capturas `take` de la prima.
  if (take != null) {
    for (let i = entryIdx + 1; i < expiryIdx; i++) {
      const Trem = (dteEff - (i - entryIdx)) / 365;
      const Pi = bsPrice(bars[i].close, K, Math.max(Trem, 0.5 / 365), rv, "put");
      const captured = P0 - Pi;                         // ganancia por acción si cierras aquí
      if (captured >= take * P0) {
        const ret = captured / K;
        return { retOnColl: ret, assigned: false, annualized: ret * (365 / (i - entryIdx)) };
      }
    }
  }
  // A vencimiento.
  const sExp = bars[expiryIdx].close;
  const assigned = sExp < K;
  const pnl = P0 - Math.max(K - sExp, 0);              // prima − pérdida intrínseca si ITM
  const ret = pnl / K;
  return { retOnColl: ret, assigned, annualized: ret * (365 / dteEff) };
}

// Entradas MECÁNICAS cada `step` días sobre TODA la historia de barras (sin flujo) →
// habilita la ventana larga (~3 años), a diferencia del flujo institucional (~1 año).
function barSignals(bars: DBar[], step: number, maxDte: number): Signal[] {
  const out: Signal[] = [];
  for (let i = 20; i < bars.length - maxDte - 1; i += step) {
    const rv = realizedVol(bars, i); if (rv == null || !(rv > 0)) continue;
    out.push({ entryIdx: i, spot: bars[i].close, rv, dir: 1, evaComp: 0 });
  }
  return out;
}

interface Stat { n: number; win: number | null; mean: number | null; assign: number | null; ann: number | null }
function stat(rows: PutResult[]): Stat {
  if (!rows.length) return { n: 0, win: null, mean: null, assign: null, ann: null };
  const r = rows.map((x) => x.retOnColl);
  const round = (x: number) => Math.round(x * 1000) / 10;                 // fracción → %
  return {
    n: rows.length,
    win: Math.round((r.filter((x) => x > 0).length / r.length) * 100),
    mean: round(r.reduce((a, x) => a + x, 0) / r.length),
    assign: Math.round((rows.filter((x) => x.assigned).length / rows.length) * 100),
    ann: round(rows.reduce((a, x) => a + x.annualized, 0) / rows.length),
  };
}
const fmt = (s: Stat) => s.n === 0 ? "—" : `win ${s.win}% · media ${s.mean}% · asig ${s.assign}% · anual ${s.ann}% (n=${s.n})`;

(async () => {
  console.log(`Backtest WHEEL (vender puts) · ${TICKERS.length} tickers · ${DAYS}d`);
  const all: { sig: Signal; bars: DBar[] }[] = [];
  const barsByTicker = new Map<string, DBar[]>();
  for (const t of TICKERS) {
    try {
      const { trades } = await fetchFlow(t, { targetDays: DAYS, minPremium: MIN_PREMIUM, contractCap: 25, maxPages: 6 });
      const { rows } = classifyFlow(trades, new Date());
      let bars: DBar[] = [];
      for (let i = 0; i < 4; i++) { bars = (await fetchDailyBars(t, 800).catch(() => [])) as DBar[]; if (bars.length > 0) break; await sleep(1000 * (i + 1)); }
      if (bars.length) barsByTicker.set(t, bars);
      const sigs = bars.length ? signals(rows, bars) : [];
      for (const sig of sigs) all.push({ sig, bars });
      console.log(`[${t}] señales ${sigs.length}${bars.length ? "" : " (SIN BARRAS)"}`);
    } catch (e) { console.error(`[${t}] ERROR:`, (e as Error).message); }
    await sleep(2500);
  }
  console.log(`Total días-señal: ${all.length}`);

  // Umbral de convicción (Top⅓) sobre los días de flujo ALCISTA (para el filtro EVA).
  const bull = all.filter((x) => x.sig.dir === 1).map((x) => x.sig.evaComp).sort((a, b) => a - b);
  const convCut = bull.length ? bull[Math.floor(bull.length * 2 / 3)] : Infinity;
  const isEva = (s: Signal) => s.dir === 1 && s.evaComp >= convCut;     // alcista + alta convicción

  const L: string[] = [
    "# Backtest de la WHEEL (vender puts cash-secured)",
    "",
    `**Meta:** cobrar prima SIN ser asignado. La asignación se MIDE como riesgo. Precios con Black-Scholes (IV≈vol realizada 20d). Ventana de flujo ~${DAYS}d.`,
    `**Días-señal:** ${all.length}. **Filtro EVA** = días de flujo alcista + convicción Top⅓ (umbral ${Math.round(convCut)}).`,
    "> Caveats: 0DTE aproximado con barras diarias (≈1 día). La pata de calls cubiertas (recuperación tras asignación) NO se modela aún. Sin comisiones/slippage en v1.",
    "",
  ];

  for (const dl of DELTAS) {
    L.push(`## Delta ${dl.label}`, "");
    for (const mg of MGMT) {
      L.push(`### Gestión: ${mg.label}`, "", "| DTE | MECÁNICO (todos) | EVA como está (alcista+conv) | EVA con cambios (solo alcista) |", "|---|---|---|---|");
      for (const dte of DTES) {
        const mech: PutResult[] = [], eva: PutResult[] = [], evaLite: PutResult[] = [];
        for (const { sig, bars } of all) {
          const r = sellPut(sig, bars, dl.target, dte, mg.take);
          if (!r) continue;
          mech.push(r);
          if (sig.dir === 1) evaLite.push(r);   // EVA con cambios: filtro direccional ligero (solo alcista)
          if (isEva(sig)) eva.push(r);           // EVA como está: alcista + Top⅓ convicción
        }
        L.push(`| ${dte}d | ${fmt(stat(mech))} | ${fmt(stat(eva))} | ${fmt(stat(evaLite))} |`);
      }
      L.push("");
    }
  }
  L.push(
    "## Cómo leerlo",
    "- **win%** = % de trades con retorno positivo (te quedaste prima). **asig%** = con qué frecuencia terminaste ASIGNADO (lo que queremos EVITAR).",
    "- **media** = retorno medio sobre el colateral por trade. **anual** = ese retorno llevado a un año (ojo: infla los DTE cortos).",
    "- Candidata buena = **win alto + asig bajo + media positiva**. Si el FILTRO EVA baja la asignación y sube la media vs MECÁNICO → el flujo de EVA aporta.",
  );
  const report = L.join("\n") + "\n";
  writeFileSync(OUT, report, "utf8");
  console.log("\n" + report);
  console.log(`=== reporte en ${OUT} ===`);
})();
