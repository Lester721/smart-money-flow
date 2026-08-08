// Resultado del Top⅓ de convicción EVA, desglosado POR PLAZO y POR AÑO.
//
// Usa el mismo núcleo que el backtest (lib/backtestCore), no una copia.
//
// OJO con el tercil: se calcula sobre TODA la muestra, igual que el backtest. En vivo no
// podrías conocer esa frontera de antemano — habría que fijarla con datos previos. Está así
// para que la tabla sea comparable con el reporte, no porque sea operable tal cual.
//
// Uso: npx tsx scripts/tabla-top-eva.ts

import { readFileSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, creditSpreadPnl, type DBar, type Signal } from "../lib/backtestCore";

const TICKERS = (process.env.BT_TICKERS || "SPY,AAPL,MSFT,NVDA,META,TSLA,AMD,QQQ,HOOD").split(",");
const DTES = [3, 5, 7, 30, 60, 90];
const SIGMA = 1;
const DIR = "scripts/cache-theta";
const BT_START = "20160101", BT_END = "20260731";

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
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

(async () => {
  const todas: { sig: Signal; bars: DBar[] }[] = [];
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
    for (const sig of signals(classifyFlow(trades as any, new Date()).rows, bars)) todas.push({ sig, bars });
  }

  const est = (p: number[]) => {
    if (!p.length) return null;
    const s = [...p].sort((a, b) => a - b);
    return {
      n: s.length,
      win: Math.round(s.filter((x) => x > 0).length / s.length * 100),
      media: s.reduce((a, x) => a + x, 0) / s.length * 100,
      mediana: s[Math.floor(s.length / 2)] * 100,
      peor: s[0] * 100,
    };
  };

  // Top⅓ EVA por plazo, y el pnl de cada operación con su año.
  const porDte = new Map<number, { año: string; pnl: number }[]>();
  for (const dte of DTES) {
    const rec = todas
      .map(({ sig, bars }) => ({ eva: sig.evaComp, año: ymd(sig.entryMs).slice(0, 4), pnl: creditSpreadPnl(sig, bars, dte, SIGMA) }))
      .filter((x): x is { eva: number; año: string; pnl: number } => x.pnl != null);
    const k = Math.max(1, Math.floor(rec.length / 3));
    const top = [...rec].sort((a, b) => a.eva - b.eva).slice(rec.length - k);
    porDte.set(dte, top.map((x) => ({ año: x.año, pnl: x.pnl })));
  }

  console.log(`\n## Top⅓ convicción EVA — credit spread @${SIGMA}σ · 2016-2026 · precio derivado\n`);
  console.log("### Por PLAZO (los 10 años juntos)\n");
  console.log("| Plazo | n | Win | Media | Mediana | Peor |");
  console.log("|---|---|---|---|---|---|");
  for (const dte of DTES) {
    const s = est(porDte.get(dte)!.map((x) => x.pnl));
    if (s) console.log(`| ${dte}d | ${s.n} | ${s.win}% | ${s.media >= 0 ? "+" : ""}${s.media.toFixed(1)}% | +${s.mediana.toFixed(1)}% | ${s.peor.toFixed(0)}% |`);
  }

  const años = [...new Set(porDte.get(DTES[0])!.map((x) => x.año))].sort();
  console.log("\n### Por AÑO (media del Top⅓, retorno sobre riesgo)\n");
  console.log(`| Año | ${DTES.map((d) => `${d}d`).join(" | ")} | n (5d) |`);
  console.log(`|---|${DTES.map(() => "---").join("|")}|---|`);
  for (const a of años) {
    const celdas = DTES.map((dte) => {
      const s = est(porDte.get(dte)!.filter((x) => x.año === a).map((x) => x.pnl));
      return s ? `${s.media >= 0 ? "+" : ""}${s.media.toFixed(1)}%` : "—";
    });
    const n5 = porDte.get(5)!.filter((x) => x.año === a).length;
    console.log(`| ${a} | ${celdas.join(" | ")} | ${n5} |`);
  }

  console.log("\n### Por AÑO — detalle del 5d (la celda de la estrategia)\n");
  console.log("| Año | n | Win | Media | Mediana | Peor |");
  console.log("|---|---|---|---|---|---|");
  for (const a of años) {
    const s = est(porDte.get(5)!.filter((x) => x.año === a).map((x) => x.pnl));
    if (s) console.log(`| ${a} | ${s.n} | ${s.win}% | ${s.media >= 0 ? "+" : ""}${s.media.toFixed(1)}% | +${s.mediana.toFixed(1)}% | ${s.peor.toFixed(0)}% |`);
  }
})();
