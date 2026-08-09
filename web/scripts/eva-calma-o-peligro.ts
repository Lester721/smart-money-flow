// ¿EVA DETECTA CALMA O DETECTA PELIGRO?
//
// El Top⅓ acierta el 95% vendiendo a 1,5σ. Suena bien — pero vender a 1,5σ tiene ~93% de
// probabilidad de quedar dentro POR PURA ESTADISTICA. Si el Top⅓ da 95% y el Bottom⅓ da 89%,
// puede que EVA no aporte nada en el Top y que TODO su valor esté en marcar los días malos.
//
// La diferencia no es académica:
//   · si detecta CALMA  → operar el Top⅓ (lo que hacíamos)
//   · si detecta PELIGRO → EVITAR el Bottom⅓, o COMPRAR volatilidad esos días
//
// Se mide el movimiento REALIZADO contra el esperado, sin opciones ni precios de por medio. Es
// una propiedad del subyacente: o los días de baja convicción se mueven más, o no.
//
// Uso: node --import tsx scripts/eva-calma-o-peligro.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, type DBar, type Signal } from "../lib/backtestCore";

const DIR = "scripts/cache-theta";
const TICKERS = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "TSLA", "AMD"];
const DTE = Number(process.env.EV_DTE ?? 21);

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

interface Obs { eva: number; movRel: number; ms: number }

(async () => {
  const obs: Obs[] = [];
  for (const t of TICKERS) {
    const trozos: DBar[] = [];
    for (const f of readdirSync(DIR)) if (f.startsWith(`${t}_barsPAR_y_`)) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
    const bars = [...new Map(trozos.map((x) => [x.time, x] as const)).values()].sort((a, b) => (a.time < b.time ? -1 : 1));
    const trades: unknown[] = [];
    for (const f of readdirSync(DIR)) if (f.startsWith(`${t}_y_`) && f.endsWith(".json")) { const y = leer<unknown[]>(`${DIR}/${f}`); if (y?.length) trades.push(...y); }
    if (bars.length < 300 || !trades.length) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sigs: Signal[] = signals(classifyFlow(trades as any, new Date()).rows, bars);
    for (const sig of sigs) {
      // Días hábiles hasta el vencimiento (21 naturales ≈ 15 hábiles).
      const pasos = Math.round((DTE / 365) * 252);
      const j = sig.entryIdx + pasos;
      if (j >= bars.length) continue;
      const esperado = sig.spot * sig.rv * Math.sqrt(DTE / 365);
      if (!(esperado > 0)) continue;
      obs.push({ eva: sig.evaComp, ms: sig.entryMs, movRel: Math.abs(bars[j].close - sig.spot) / esperado });
    }
  }

  console.log(`\n## ¿EVA detecta CALMA o PELIGRO? · ${DTE} días · ${obs.length} señales\n`);
  console.log(`Movimiento REALIZADO / movimiento esperado. Sin opciones ni precios: es una`);
  console.log(`propiedad del subyacente.\n`);
  if (obs.length < 500) { console.log("muestra insuficiente"); return; }

  // Referencias teóricas para una distribución normal:
  //   E|X| = 0,798σ   ·   P(|X| > 1,5σ) = 13,4%   ·   P(|X| > 2σ) = 4,6%
  const porEva = [...obs].sort((a, b) => a.eva - b.eva);
  const k = Math.floor(porEva.length / 3);
  const grupos: [string, Obs[]][] = [
    ["Bottom⅓ (baja convicción)", porEva.slice(0, k)],
    ["Medio", porEva.slice(k, 2 * k)],
    ["Top⅓ (alta convicción)", porEva.slice(2 * k)],
  ];

  console.log("| Tercio | n | mov/esperado | vs 0,798 teórico | rompe 1,5σ | vs 13,4% teórico |");
  console.log("|---|---|---|---|---|---|");
  const filas: { nom: string; m: number; p15: number }[] = [];
  for (const [nom, g] of grupos) {
    const m = media(g.map((x) => x.movRel));
    const p15 = (g.filter((x) => x.movRel > 1.5).length / g.length) * 100;
    filas.push({ nom, m, p15 });
    const dm = m - 0.798, dp = p15 - 13.4;
    console.log(`| ${nom} | ${g.length} | ${m.toFixed(3)} | ${dm >= 0 ? "+" : ""}${dm.toFixed(3)} | ${p15.toFixed(1)}% | ${dp >= 0 ? "+" : ""}${dp.toFixed(1)} pts |`);
  }

  const [bot, med, top] = filas;
  console.log(`\n### Veredicto\n`);
  const topNormal = Math.abs(top.m - 0.798) < 0.05;
  const botPeor = bot.m > 0.798 + 0.05;
  console.log(`   Top⅓  : se mueve ${top.m.toFixed(3)} veces lo esperado ${topNormal ? "— practicamente LO NORMAL" : top.m < 0.798 ? "— MENOS de lo normal (calma real)" : "— MAS de lo normal"}`);
  console.log(`   Medio : ${med.m.toFixed(3)}`);
  console.log(`   Bottom: ${bot.m.toFixed(3)} ${botPeor ? "— MAS de lo normal (peligro real)" : bot.m < 0.798 ? "— menos de lo normal" : "— lo normal"}`);
  console.log(`\n   → ${topNormal && botPeor
    ? "EVA DETECTA PELIGRO, NO CALMA. El Top⅓ no aporta (es el mercado normal); todo el valor\n     está en marcar el Bottom⅓. El uso correcto es EVITAR esos días — o comprar volatilidad."
    : top.m < 0.798 - 0.05 && !botPeor
      ? "EVA DETECTA CALMA. El Top⅓ se mueve menos que el mercado normal: vender ahí tiene sentido."
      : top.m < bot.m - 0.05
        ? "Detecta LAS DOS COSAS: el Top se mueve menos y el Bottom mas. Sirve por los dos lados."
        : "NO SEPARA el movimiento realizado. Los aciertos que veiamos venian del strike, no de EVA."}`);
  console.log(`\n   Referencias de una normal: mov/esperado = 0,798 · rompe 1,5σ el 13,4% de las veces.`);
})();
