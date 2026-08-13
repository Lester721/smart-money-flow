// PRUEBA OOS DE LA REGLA DE RÉGIMEN — ¿condicionar por clima es señal o fue mirar la tabla?
//
// De dónde sale: el diagnóstico mostró que el credit spread rinde MEJOR en clima volátil
// (5d Top⅓ EVA: tranquilo -0,1% · normal -2,7% · volátil +4,3%). Lester propuso la regla
// obvia: "opera el 5d SOLO en volátil".
//
// El problema: esa regla se diseñó DESPUÉS de ver el resultado. Eso es exactamente donde nace
// el sobreajuste. Este script la somete a la única prueba que la separa de la casualidad:
// ¿aguanta en la mitad VIEJA **y** en la mitad NUEVA del período?
//   · Si aguanta en las dos → la regla es real y vale cablearla.
//   · Si se voltea → era ruido de haber mirado la tabla completa.
//
// NO BAJA DATOS: corre sobre scripts/cache-theta/*.json → no compite con otros backtests.
// Uso: node --import tsx scripts/backtest-regimen-oos.ts

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { impliedVol } from "../lib/blackScholes";
// ⛔ resultado NO válido: valora con modelo. Ver PRECIO-TEORICO-NO-USAR-PARA-RESULTADOS.ts
import { bsPriceHistorico as bsPrice } from "../lib/PRECIO-TEORICO-NO-USAR-PARA-RESULTADOS";
import { executionLevel, executionScore, spreadScore, spreadPct, unusualTradeScore, type FlowRow } from "../lib/flow";

const CACHE_DIR = process.env.BT_CACHE_DIR || "scripts/cache-theta";
const OUT = process.env.BT_OUT || "scripts/backtest-regimen-oos-reporte.md";
const CELLS = [5, 30, 60, 90];
const SIGMA = 1, WIDTH_EM = 0.5;
const YR = 365 * 24 * 3600 * 1000;

interface DBar { time: string; close: number }

// ── Helpers (idénticos al backtest principal para que los números sean comparables) ───────────
function barIdxOnOrAfter(b: DBar[], ms: number) { for (let i = 0; i < b.length; i++) if (Date.parse(`${b[i].time}T20:00:00Z`) >= ms) return i; return -1; }
function barIdxOnOrBefore(b: DBar[], ms: number) { let x = -1; for (let i = 0; i < b.length; i++) { if (Date.parse(`${b[i].time}T00:00:00Z`) <= ms) x = i; else break; } return x; }
function realizedVol(b: DBar[], endIdx: number, lookback = 20): number | null {
  const s = Math.max(1, endIdx - lookback), r: number[] = [];
  for (let i = s; i <= endIdx; i++) if (b[i - 1].close > 0 && b[i].close > 0) r.push(Math.log(b[i].close / b[i - 1].close));
  if (r.length < 5) return null;
  const m = r.reduce((a, x) => a + x, 0) / r.length;
  return Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(252);
}
const ivProxy = (iv: number, rv: number | null) => rv == null || !(rv > 0) ? 5 : (iv / rv < 0.9 ? 10 : iv / rv <= 1.2 ? 7 : iv / rv <= 1.6 ? 4 : 0);

interface Signal { entryIdx: number; spot: number; rv: number; dir: 1 | -1; evaComp: number; entryMs: number }
function signals(rows: FlowRow[], bars: DBar[]): Signal[] {
  const byDay = new Map<string, FlowRow[]>();
  for (const r of rows) { const d = r.timestamp.slice(0, 10); const a = byDay.get(d); if (a) a.push(r); else byDay.set(d, [r]); }
  const out: Signal[] = [];
  for (const [d, day] of byDay) {
    const i = barIdxOnOrBefore(bars, Date.parse(`${d}T20:00:00Z`));
    if (i < 20 || i >= bars.length - 1) continue;
    const rv = realizedVol(bars, i); if (rv == null || !(rv > 0)) continue;
    const spot = bars[i].close;
    let net = 0, tot = 0, aA = 0, aC = 0, aU = 0, aI = 0;
    for (const r of day) {
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
      aI += ivProxy(iv, rv) * r.premium;
      tot += r.premium;
    }
    if (net === 0 || tot <= 0) continue;
    const evaComp = ((aC / tot / 10) * 30 + (aU / tot / 10) * 20 + (aI / tot / 10) * 15 + (aA / tot / 10) * 10) / 75 * 100;
    out.push({ entryIdx: i, spot, rv, dir: net > 0 ? 1 : -1, evaComp, entryMs: Date.parse(`${d}T20:00:00Z`) });
  }
  return out;
}

/** Credit spread a favor, sostenido a vencimiento. Retorno sobre riesgo máximo. */
function spreadPnl(sig: Signal, bars: DBar[], dte: number): number | null {
  const em = sig.spot * sig.rv * Math.sqrt(dte / 365);
  if (!(em > 0)) return null;
  const bull = sig.dir === 1, type = bull ? "put" : "call";
  const shortK = bull ? sig.spot - SIGMA * em : sig.spot + SIGMA * em;
  const longK = bull ? shortK - WIDTH_EM * em : shortK + WIDTH_EM * em;
  if (shortK <= 0 || longK <= 0) return null;
  const credit = bsPrice(sig.spot, shortK, dte / 365, sig.rv, type) - bsPrice(sig.spot, longK, dte / 365, sig.rv, type);
  const width = Math.abs(shortK - longK);
  if (!(credit > 0) || !(width > 0)) return null;
  const expIdx = barIdxOnOrAfter(bars, Date.parse(`${bars[sig.entryIdx].time}T20:00:00Z`) + dte * 86_400_000);
  if (expIdx < 0) return null;
  const s = bars[expIdx].close;
  const si = bull ? Math.max(shortK - s, 0) : Math.max(s - shortK, 0);
  const li = bull ? Math.max(longK - s, 0) : Math.max(s - longK, 0);
  const risk = width - credit;
  return ((credit - (si - li)) / (risk > 0 ? risk : width)) * 100;
}

interface Stat { n: number; win: number | null; mean: number | null }
const stat = (v: number[]): Stat => v.length
  ? { n: v.length, win: Math.round(v.filter((x) => x > 0).length / v.length * 100), mean: Math.round(v.reduce((a, x) => a + x, 0) / v.length * 10) / 10 }
  : { n: 0, win: null, mean: null };
const fmt = (s: Stat) => s.n === 0 ? "—" : `${s.mean! > 0 ? "+" : ""}${s.mean}% (win ${s.win}%, n=${s.n})`;

// ── Main ─────────────────────────────────────────────────────────────────────────────────────
(async () => {
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json") && !f.includes("_y_") && !f.includes("_bars_"));
  const spyFile = files.find((f) => f.startsWith("SPY_"));
  if (!spyFile) { console.error("Falta SPY en la caché: sin él no se puede clasificar el clima."); process.exit(1); }
  const spyBars: DBar[] = JSON.parse(readFileSync(`${CACHE_DIR}/${spyFile}`, "utf8")).bars;

  /** Clima del mercado = vol realizada 20d de SPY el día de entrada. */
  const spyRvAt = (ms: number): number | null => {
    const i = barIdxOnOrBefore(spyBars, ms);
    return i >= 20 ? realizedVol(spyBars, i) : null;
  };

  const all: { sig: Signal; bars: DBar[]; spyRv: number }[] = [];
  for (const f of files) {
    try {
      const c: { rows: FlowRow[]; bars: DBar[] } = JSON.parse(readFileSync(`${CACHE_DIR}/${f}`, "utf8"));
      if (!c.rows?.length || !c.bars?.length) continue;
      for (const s of signals(c.rows, c.bars)) {
        const rv = spyRvAt(s.entryMs);
        if (rv != null) all.push({ sig: s, bars: c.bars, spyRv: rv });
      }
    } catch { /* siguiente */ }
  }
  if (all.length < 100) { console.error(`Muestra insuficiente (${all.length}).`); process.exit(1); }

  // Terciles de clima sobre los días operados (mismo criterio que el diagnóstico).
  const rvs = all.map((x) => x.spyRv).sort((a, b) => a - b);
  const q1 = rvs[Math.floor(rvs.length / 3)], q2 = rvs[Math.floor(rvs.length * 2 / 3)];
  const clima = (rv: number) => rv <= q1 ? "Tranquilo" : rv <= q2 ? "Normal" : "Volátil";

  const L: string[] = [
    "# ¿La regla de RÉGIMEN aguanta fuera de muestra?",
    "",
    `**Muestra:** ${all.length} señales · ${files.length} tickers · clima por vol de SPY ` +
    `(**Tranquilo** ≤${Math.round(q1 * 100)}% · **Normal** ${Math.round(q1 * 100)}-${Math.round(q2 * 100)}% · **Volátil** >${Math.round(q2 * 100)}%).`,
    "",
    "**La pregunta:** el diagnóstico mostró que vender prima rinde mejor en clima volátil. Pero esa",
    "regla se propuso DESPUÉS de ver la tabla — que es donde nace el sobreajuste. Aquí la partimos",
    "en dos mitades por fecha: si el patrón es real, debe aparecer en AMBAS.",
    "",
  ];

  for (const dte of CELLS) {
    const rec = all
      .map((x) => ({ pnl: spreadPnl(x.sig, x.bars, dte), eva: x.sig.evaComp, ms: x.sig.entryMs, clima: clima(x.spyRv) }))
      .filter((x) => x.pnl != null) as { pnl: number; eva: number; ms: number; clima: string }[];
    if (rec.length < 60) { L.push(`## ${dte}d`, "", "_Muestra insuficiente._", ""); continue; }

    // Filtro Top⅓ EVA (como opera la estrategia), y corte temporal en 2 mitades.
    const k = Math.max(1, Math.floor(rec.length / 3));
    const cut = [...rec].sort((a, b) => a.eva - b.eva)[rec.length - k].eva;
    const top = rec.filter((x) => x.eva >= cut).sort((a, b) => a.ms - b.ms);
    const mid = Math.floor(top.length / 2);
    const vieja = top.slice(0, mid), nueva = top.slice(mid);

    L.push(`## Credit spread ${dte}d @1σ — Top⅓ EVA`, "",
      "| Clima | Todo el período | Mitad VIEJA | Mitad NUEVA | ¿Aguanta? |", "|---|---|---|---|---|");
    for (const c of ["Tranquilo", "Normal", "Volátil"]) {
      const t = stat(top.filter((x) => x.clima === c).map((x) => x.pnl));
      const v = stat(vieja.filter((x) => x.clima === c).map((x) => x.pnl));
      const n = stat(nueva.filter((x) => x.clima === c).map((x) => x.pnl));
      const ok = v.mean != null && n.mean != null && v.mean > 0 && n.mean > 0;
      const insuf = (v.n < 15 || n.n < 15);
      L.push(`| ${c} | ${fmt(t)} | ${fmt(v)} | ${fmt(n)} | ${insuf ? "⚠ muestra chica" : ok ? "✅ sí" : "✗ se voltea"} |`);
    }
    // La comparación que de verdad decide: condicionar por clima vs no condicionar.
    const sinFiltro = stat(top.map((x) => x.pnl));
    const soloVol = stat(top.filter((x) => x.clima === "Volátil").map((x) => x.pnl));
    L.push("",
      `**¿Vale condicionar?** Operar SIEMPRE: ${fmt(sinFiltro)} · Operar SOLO en volátil: ${fmt(soloVol)}`,
      "");
  }

  L.push("## Cómo leerlo", "",
    "- **✅ sí** = positivo en las DOS mitades → el patrón sobrevive fuera de muestra.",
    "- **✗ se voltea** = ganó en una mitad y perdió en la otra → fue ruido de mirar la tabla completa.",
    "- **⚠ muestra chica** = menos de 15 casos en alguna mitad; ni confirma ni descarta.",
    "- Y aunque un clima aguante, la regla solo vale la pena si **operar SOLO en ese clima supera a operar siempre**.",
    "  Filtrar reduce el número de operaciones: si el retorno sube poco, quizá no compense la mitad de oportunidades.",
    "",
    "## Caveats",
    "- Terciles de clima calculados sobre ESTA muestra: 'volátil' aquí es relativo al período, no absoluto.",
    "- Sin gestión ni costos (el efecto del régimen se mide en bruto).",
    "");

  const report = L.join("\n") + "\n";
  writeFileSync(OUT, report, "utf8");
  console.log("\n" + report);
  console.log(`=== reporte en ${OUT} ===`);
})();
