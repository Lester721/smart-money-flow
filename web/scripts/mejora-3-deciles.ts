// MEJORA #3 — ¿Le queda jugo al score de convicción de EVA?
//
// Hoy la estrategia corta en TERCILES y opera el Top⅓. Nunca se ha mirado si DENTRO de ese
// tercio el score sigue discriminando. Dos desenlaces posibles y opuestos:
//
//   · el decil de arriba rinde bastante más → hay señal sin explotar, conviene ser más selectivo
//   · plano dentro del Top⅓ → el score ya dio lo que tenía; mejorar pasa por cambiar sus
//     componentes, no por afinar el corte
//
// CRITERIO FIJADO ANTES DE VER EL RESULTADO (esto es lo que impide que la conclusión se
// acomode al dato):
//   A. "Hay jugo" exige que la media del decil top sea >= 1.5x la del Top⅓ actual, Y que
//      aguante las DOS mitades OOS. Sin lo segundo es ruido de una muestra más chica.
//   B. "Está plano" si los 3 deciles de arriba caen dentro de 0.5pp entre sí.
//   C. Cualquier otra cosa: intermedio, no concluyente.
//
// Uso: npx tsx scripts/mejora-3-deciles.ts

import { readFileSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, creditSpreadPnl, type DBar, type Signal } from "../lib/backtestCore";

const TICKERS = (process.env.BT_TICKERS || "SPY,AAPL,MSFT,NVDA,META,TSLA,AMD,QQQ,HOOD").split(",");
const DTE = Number(process.env.M3_DTE) || 5;
const SIGMA = 1;
const DIR = "scripts/cache-theta";
const BT_START = "20160101", BT_END = "20260731";

// Umbrales del criterio, arriba y explícitos.
const FACTOR_JUGO = 1.5;
const PLANO_PP = 0.5;

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

interface Op { eva: number; vic: number; ms: number; pnl: number }
const est = (p: number[]) => {
  if (!p.length) return null;
  const s = [...p].sort((a, b) => a - b);
  return {
    n: s.length,
    win: Math.round(s.filter((x) => x > 0).length / s.length * 100),
    media: s.reduce((a, x) => a + x, 0) / s.length * 100,
    peor: s[0] * 100,
  };
};
const f = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`;

/** Media de las dos mitades por FECHA (mismo método que el backtest). */
function oos(ops: Op[]): { vieja: number; nueva: number; corte: string } {
  const o = [...ops].sort((a, b) => a.ms - b.ms);
  const mid = Math.floor(o.length / 2);
  const m = (a: Op[]) => a.reduce((s, x) => s + x.pnl, 0) / Math.max(1, a.length) * 100;
  return { vieja: m(o.slice(0, mid)), nueva: m(o.slice(mid)), corte: ymd(o[mid]?.ms ?? 0) };
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

  const ops: Op[] = todas
    .map(({ sig, bars }) => ({ eva: sig.evaComp, vic: sig.victorComp, ms: sig.entryMs, pnl: creditSpreadPnl(sig, bars, DTE, SIGMA) }))
    .filter((x): x is Op => x.pnl != null);

  console.log(`\n## MEJORA #3 — deciles de convicción · credit spread ${DTE}d @${SIGMA}σ · n=${ops.length}\n`);

  // ── Deciles de EVA sobre TODA la muestra ────────────────────────────────────────────────
  const porEva = [...ops].sort((a, b) => a.eva - b.eva);
  const paso = porEva.length / 10;
  console.log("### Deciles de convicción EVA (1 = peor, 10 = mejor)\n");
  console.log("| Decil | Rango EVA | n | Win | Media | Peor |");
  console.log("|---|---|---|---|---|---|");
  const mediaDecil: number[] = [];
  for (let d = 0; d < 10; d++) {
    const trozo = porEva.slice(Math.floor(d * paso), Math.floor((d + 1) * paso));
    const s = est(trozo.map((x) => x.pnl))!;
    mediaDecil.push(s.media);
    console.log(`| ${d + 1} | ${trozo[0].eva.toFixed(1)}–${trozo[trozo.length - 1].eva.toFixed(1)} | ${s.n} | ${s.win}% | ${f(s.media)} | ${s.peor.toFixed(0)}% |`);
  }

  // ── El Top⅓ actual, partido en tres ─────────────────────────────────────────────────────
  const k = Math.floor(ops.length / 3);
  const top = porEva.slice(porEva.length - k);
  const t3 = Math.floor(top.length / 3);
  console.log(`\n### Dentro del Top⅓ actual (n=${top.length}) — ¿sigue discriminando?\n`);
  console.log("| Franja del Top⅓ | n | Win | Media |");
  console.log("|---|---|---|---|");
  const franjas: [string, Op[]][] = [
    ["baja  (el peor tercio del Top⅓)", top.slice(0, t3)],
    ["media", top.slice(t3, 2 * t3)],
    ["alta  (la crema)", top.slice(2 * t3)],
  ];
  for (const [nombre, sub] of franjas) {
    const s = est(sub.map((x) => x.pnl))!;
    console.log(`| ${nombre} | ${s.n} | ${s.win}% | ${f(s.media)} |`);
  }

  // ── Veredicto contra el criterio PREFIJADO ──────────────────────────────────────────────
  const mediaTop = est(top.map((x) => x.pnl))!.media;
  const decilTop = porEva.slice(porEva.length - Math.floor(paso));
  const sTop10 = est(decilTop.map((x) => x.pnl))!;
  const o10 = oos(decilTop);
  const oTop = oos(top);

  console.log(`\n### Comparación directa\n`);
  console.log("| Corte | n | Media | OOS vieja | OOS nueva |");
  console.log("|---|---|---|---|---|");
  console.log(`| Top⅓ (actual) | ${top.length} | ${f(mediaTop)} | ${f(oTop.vieja)} | ${f(oTop.nueva)} |`);
  console.log(`| **Decil 10** | ${sTop10.n} | **${f(sTop10.media)}** | ${f(o10.vieja)} | ${f(o10.nueva)} |`);

  const spread3 = Math.max(...mediaDecil.slice(7)) - Math.min(...mediaDecil.slice(7));
  const pasaOOS = o10.vieja > 0 && o10.nueva > 0;
  const hayJugo = sTop10.media >= FACTOR_JUGO * mediaTop && pasaOOS;
  const plano = spread3 <= PLANO_PP;

  console.log(`\n### VEREDICTO (criterio fijado antes de correr)\n`);
  console.log(`   decil 10 = ${f(sTop10.media)} · Top⅓ = ${f(mediaTop)} · factor = ${(sTop10.media / mediaTop).toFixed(2)}x (exigido ${FACTOR_JUGO}x)`);
  console.log(`   OOS del decil 10: ${f(o10.vieja)} / ${f(o10.nueva)} → ${pasaOOS ? "PASA" : "FALLA"}`);
  console.log(`   dispersión de los 3 deciles de arriba: ${spread3.toFixed(2)}pp (plano si <= ${PLANO_PP}pp)`);
  console.log(`\n   → ${hayJugo ? "A. HAY JUGO: ser más selectivo mejora y aguanta OOS." : plano ? "B. PLANO: el score ya dio lo que tenía; hay que cambiar sus componentes." : "C. INTERMEDIO: no concluyente — ni gana claro ni está plano."}`);

  // ── Referencia: ¿el score de Victor discrimina igual? ───────────────────────────────────
  const porVic = [...ops].sort((a, b) => a.vic - b.vic);
  const vTop10 = est(porVic.slice(porVic.length - Math.floor(paso)).map((x) => x.pnl))!;
  console.log(`\n   Referencia — decil 10 de VICTOR: ${f(vTop10.media)} (EVA: ${f(sTop10.media)})`);
})();
