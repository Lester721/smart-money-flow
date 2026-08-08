// MEJORA #5 — ¿ayuda cortar las pérdidas antes de vencimiento?
//
// LA IDEA (de Lester): cerrar cuando has perdido el 50% u 80% del colateral, en vez de
// sostener a vencimiento. Es la palanca correcta: las catastróficas pesan −91,5% de media y son
// el 8,3% de las operaciones; el win rate no se mueve nunca (85-94%). Todo el resultado del año
// lo decide la cola.
//
// PERO cortar tiene un coste que no se ve a primera vista: muchas posiciones que van perdiendo
// a mitad de camino TERMINAN GANANDO. Un credit spread a 5 días recupera si el precio vuelve.
// El stop las convierte en pérdidas seguras. Por eso hay que medirlo y no suponerlo.
//
// LIMITACIÓN DECLARADA: la valoración diaria usa la volatilidad de entrada. En un desplome la
// IV se expande y el spread vale MÁS que este modelo — el stop real saltaría antes y peor.
// Estos números son la versión OPTIMISTA del stop.
//
// Uso: npx tsx scripts/mejora-5-stops.ts

import { readFileSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, creditSpreadPnl, type DBar, type Signal } from "../lib/backtestCore";

const TICKERS = (process.env.BT_TICKERS || "SPY,AAPL,MSFT,NVDA,META,TSLA,AMD,QQQ,HOOD").split(",");
const DTE = 5, SIGMA = 1;
const RIESGO = Number(process.env.M5_RIESGO) || 1200;
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

  // Universo: el ganador de hoy — Top⅓ EVA + IV/rv < 1.1
  const k = Math.floor(todas.length / 3);
  const universo = [...todas].sort((a, b) => a.sig.evaComp - b.sig.evaComp)
    .slice(todas.length - k)
    .filter((x) => x.sig.ivRatio < 1.1);

  console.log(`\n## MEJORA #5 — cortar pérdidas · ${DTE}d @${SIGMA}σ`);
  console.log(`### Universo: Top⅓ EVA + IV/rv<1.1 · riesgo $${RIESGO}/op · ${AÑOS} años\n`);
  console.log("| Stop | Ops/año | Win | Media | Peor | $/op | $/AÑO | OOS vieja/nueva |");
  console.log("|---|---|---|---|---|---|---|---|");

  const variantes: [string, number | undefined][] = [
    ["sin stop (actual)", undefined],
    ["cortar al −30%", 0.30],
    ["cortar al −50%", 0.50],
    ["cortar al −80%", 0.80],
  ];

  for (const [nombre, stop] of variantes) {
    const ops = universo
      .map(({ sig, bars }) => {
        const pnl = creditSpreadPnl(sig, bars, DTE, SIGMA, 0, 0, undefined, stop);
        return pnl == null ? null : { ms: sig.entryMs, pnl };
      })
      .filter((x): x is { ms: number; pnl: number } => x != null);
    if (!ops.length) continue;
    const o = [...ops].sort((a, b) => a.ms - b.ms);
    const mid = Math.floor(o.length / 2);
    const vieja = media(o.slice(0, mid).map((x) => x.pnl)) * 100;
    const nueva = media(o.slice(mid).map((x) => x.pnl)) * 100;
    const m = media(ops.map((x) => x.pnl));
    const win = Math.round(ops.filter((x) => x.pnl > 0).length / ops.length * 100);
    const peor = Math.min(...ops.map((x) => x.pnl)) * 100;
    const opsAño = ops.length / AÑOS;
    const dOp = m * RIESGO;
    console.log(
      `| ${nombre} | ${Math.round(opsAño)} | ${win}% | ${m >= 0 ? "+" : ""}${(m * 100).toFixed(2)}% | ${peor.toFixed(0)}% | $${dOp.toFixed(0)} | **$${Math.round(opsAño * dOp).toLocaleString("en-US")}** | ${vieja.toFixed(1)} / ${nueva.toFixed(1)} ${vieja > 0 && nueva > 0 ? "✅" : "✗"} |`,
    );
  }

  // ── El coste oculto: ¿cuántas de las que el stop mata habrían terminado ganando? ──────────
  console.log(`\n### El coste del stop — posiciones rescatadas vs sacrificadas\n`);
  console.log("| Stop | Cortadas | De ésas, habrían GANADO | Habrían perdido más |");
  console.log("|---|---|---|---|");
  for (const [nombre, stop] of variantes.slice(1)) {
    let cortadas = 0, salvadas = 0, sacrificadas = 0;
    for (const { sig, bars } of universo) {
      const conStop = creditSpreadPnl(sig, bars, DTE, SIGMA, 0, 0, undefined, stop);
      const sinStop = creditSpreadPnl(sig, bars, DTE, SIGMA);
      if (conStop == null || sinStop == null) continue;
      if (Math.abs(conStop - sinStop) < 1e-9) continue; // el stop no actuó
      cortadas++;
      if (sinStop > conStop) sacrificadas++; else salvadas++;
    }
    console.log(`| ${nombre} | ${cortadas} | ${sacrificadas} (${(sacrificadas / Math.max(1, cortadas) * 100).toFixed(0)}%) | ${salvadas} (${(salvadas / Math.max(1, cortadas) * 100).toFixed(0)}%) |`);
  }
  console.log(`\n   "Habrían GANADO" = el stop cortó una posición que, sostenida, terminaba mejor.`);
  console.log(`   Ese es el precio de cortar: se paga en las que se habrían recuperado.`);
})();
