// BACKTEST DE GESTIÓN, rehecho con la muestra de 10 años.
//
// POR QUÉ: la regla que ya corre EN VIVO (toma de ganancia 25% + stop 1× del crédito) salió del
// backtest de 2 años — la misma muestra que nos dijo que el 90d era la celda buena y resultó
// falso. Nunca se revalidó con los 10 años.
//
// Convención (la del vivo): los umbrales van sobre el CRÉDITO cobrado, no sobre el riesgo.
//   tp 0.25 → cerrar al capturar el 25% de la prima · sl 1 → cerrar al perder 1× la prima
//
// LIMITACIONES DECLARADAS:
//   · La valoración diaria usa la volatilidad de ENTRADA. En un desplome la IV se expande y el
//     spread vale MÁS → el stop real saltaría antes y peor. Estos números son optimistas.
//   · Solo hay cierres diarios: si en el mismo día se tocaran TP y SL, se asume TP. Optimista.
//
// Uso: npx tsx scripts/mejora-6-gestion.ts

import { readFileSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, creditSpreadPnl, type DBar, type Signal } from "../lib/backtestCore";

const TICKERS = (process.env.BT_TICKERS || "SPY,AAPL,MSFT,NVDA,META,TSLA,AMD,QQQ,HOOD").split(",");
const SIGMA = 1;
const RIESGO = Number(process.env.M6_RIESGO) || 1200;
const AÑOS = 10.5;
const DIR = "scripts/cache-theta";
const BT_START = "20160101", BT_END = "20260731";

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
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

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

  // Universo: el scorer que llevamos al forward-test — Top⅓ EVA + IV/rv < 1.1
  const k = Math.floor(todas.length / 3);
  const universo = [...todas].sort((a, b) => a.sig.evaComp - b.sig.evaComp)
    .slice(todas.length - k)
    .filter((x) => x.sig.ivRatio < 1.1);

  const REGLAS: [string, { tp?: number; sl?: number } | undefined][] = [
    ["sostener a vencimiento", undefined],
    ["TG 25%", { tp: 0.25 }],
    ["TG 50%", { tp: 0.50 }],
    ["TG 75%", { tp: 0.75 }],
    ["stop 1× crédito", { sl: 1 }],
    ["stop 2× crédito", { sl: 2 }],
    ["**TG 25% + stop 1× (la del vivo)**", { tp: 0.25, sl: 1 }],
    ["TG 50% + stop 2×", { tp: 0.50, sl: 2 }],
    ["TG 75% + stop 2×", { tp: 0.75, sl: 2 }],
  ];

  for (const DTE of [5, 7]) {
    console.log(`\n## Gestión · ${DTE}d @${SIGMA}σ · Top⅓ EVA + IV/rv<1,1 · riesgo $${RIESGO}/op\n`);
    console.log("| Regla | Ops/año | Win | Media | Peor | $/AÑO | OOS vieja/nueva |");
    console.log("|---|---|---|---|---|---|---|");
    for (const [nombre, g] of REGLAS) {
      const ops = universo
        .map(({ sig, bars }) => {
          const pnl = creditSpreadPnl(sig, bars, DTE, SIGMA, 0, 0, undefined, undefined, g);
          return pnl == null ? null : { ms: sig.entryMs, pnl };
        })
        .filter((x): x is { ms: number; pnl: number } => x != null);
      if (ops.length < 100) continue;
      const o = [...ops].sort((a, b) => a.ms - b.ms);
      const mid = Math.floor(o.length / 2);
      const vieja = media(o.slice(0, mid).map((x) => x.pnl)) * 100;
      const nueva = media(o.slice(mid).map((x) => x.pnl)) * 100;
      const m = media(ops.map((x) => x.pnl));
      const win = Math.round(ops.filter((x) => x.pnl > 0).length / ops.length * 100);
      const peor = Math.min(...ops.map((x) => x.pnl)) * 100;
      const opsAño = ops.length / AÑOS;
      console.log(
        `| ${nombre} | ${Math.round(opsAño)} | ${win}% | ${m >= 0 ? "+" : ""}${(m * 100).toFixed(2)}% | ${peor.toFixed(0)}% | **$${Math.round(opsAño * m * RIESGO).toLocaleString("en-US")}** | ${vieja.toFixed(1)} / ${nueva.toFixed(1)} ${vieja > 0 && nueva > 0 ? "✅" : "✗"} |`,
      );
    }
  }
})();
