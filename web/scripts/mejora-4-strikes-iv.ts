// MEJORA #4 — colocar los strikes con la IV del mercado, no con la volatilidad realizada.
//
// HOY: el spread se vende en `spot ± 1σ` donde σ sale de la volatilidad REALIZADA de 20 días,
// o sea de lo que ya pasó. El mercado cotiza otra cosa: medimos que paga un 21% más de prima
// porque espera más movimiento del que hubo.
//
// LA PRUEBA: usar la IV que pagó el flujo de ese día (rv × ivRatio) para las DOS cosas —
// colocar los strikes y valorar el spread. La liquidación sigue usando precios reales, así que
// la comparación es limpia.
//
// Dos efectos que tiran en sentidos opuestos, por eso hay que medirlo y no razonarlo:
//   · IV mayor que rv → strikes MÁS LEJOS → menos probabilidad de que te pasen por encima
//   · IV mayor que rv → más crédito cobrado al mismo nivel de moneyness
//
// LIMITACIÓN QUE HAY QUE DECIR: `ivRatio` sale del flujo del día, que mezcla vencimientos y
// strikes. No es la IV a 5 días del dinero — es una aproximación ponderada por premium.
//
// Todo en dólares al año: riesgo por operación declarado abajo.
//
// Uso: npx tsx scripts/mejora-4-strikes-iv.ts

import { readFileSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, creditSpreadPnl, type DBar, type Signal } from "../lib/backtestCore";

const TICKERS = (process.env.BT_TICKERS || "SPY,AAPL,MSFT,NVDA,META,TSLA,AMD,QQQ,HOOD").split(",");
const DTE = 5, SIGMA = 1;
const RIESGO = Number(process.env.M4_RIESGO) || 1200; // $ por operación (2% de una cuenta de 60k)
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

interface Op { sig: Signal; pnl: number }
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

function fila(nombre: string, ops: Op[]) {
  if (ops.length < 100) { console.log(`| ${nombre} | ${ops.length} | muestra insuficiente | | | |`); return; }
  const o = [...ops].sort((a, b) => a.sig.entryMs - b.sig.entryMs);
  const mid = Math.floor(o.length / 2);
  const vieja = media(o.slice(0, mid).map((x) => x.pnl)) * 100;
  const nueva = media(o.slice(mid).map((x) => x.pnl)) * 100;
  const m = media(ops.map((x) => x.pnl));
  const opsAño = ops.length / AÑOS;
  const dolarOp = m * RIESGO;
  const dolarAño = opsAño * dolarOp;
  const ok = vieja > 0 && nueva > 0;
  console.log(
    `| ${nombre} | ${Math.round(opsAño)} | ${(m * 100 >= 0 ? "+" : "")}${(m * 100).toFixed(2)}% | $${dolarOp.toFixed(0)} | **$${Math.round(dolarAño).toLocaleString("en-US")}** | ${vieja.toFixed(1)} / ${nueva.toFixed(1)} ${ok ? "✅" : "✗"} |`,
  );
}

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

  // Universo: Top⅓ EVA, que es lo que la estrategia opera.
  const k = Math.floor(todas.length / 3);
  const top = [...todas].sort((a, b) => a.sig.evaComp - b.sig.evaComp).slice(todas.length - k);

  const conVol = (usarIV: boolean) => top
    .map(({ sig, bars }) => {
      const vol = usarIV ? sig.rv * sig.ivRatio : undefined;
      const pnl = creditSpreadPnl(sig, bars, DTE, SIGMA, 0, 0, vol);
      return pnl == null ? null : { sig, pnl };
    })
    .filter((x): x is Op => x != null);

  const base = conVol(false);
  const conIV = conVol(true);

  console.log(`\n## MEJORA #4 — strikes con IV vs volatilidad realizada`);
  console.log(`### ${DTE}d @${SIGMA}σ · Top⅓ EVA · riesgo $${RIESGO}/operación · ${AÑOS} años\n`);
  console.log("| Variante | Ops/año | Por op | $/op | $/AÑO | OOS vieja/nueva |");
  console.log("|---|---|---|---|---|---|");
  fila("Volatilidad realizada (actual)", base);
  fila("**IV del mercado**", conIV);
  fila("realizada + IV/rv < 1.1", base.filter((x) => x.sig.ivRatio < 1.1));
  fila("**IV + IV/rv < 1.1**", conIV.filter((x) => x.sig.ivRatio < 1.1));

  // ¿Cuánto se mueven los strikes de verdad?
  const desvio = top.map(({ sig }) => sig.ivRatio).sort((a, b) => a - b);
  const p = (q: number) => desvio[Math.floor(desvio.length * q)];
  console.log(`\nIV/rv en el Top⅓ — p10 ${p(0.1).toFixed(2)} · mediana ${p(0.5).toFixed(2)} · p90 ${p(0.9).toFixed(2)}`);
  console.log(`(por debajo de 1 la IV va por DEBAJO de la realizada → strikes MÁS CERCA → más riesgo)`);
})();
