// ¿A QUÉ DISTANCIA conviene vender? — con validación honesta del parámetro.
//
// EL PROBLEMA: en la prueba del GEX apareció que vender a 0,80σ rinde más que a 1σ. Pero ese
// 0,80 salió de la MEDIANA del muro, o sea del propio resultado. Decir "0,8 es mejor" mirando
// el dato con el que lo elegiste no vale — es el mismo autoengaño que nos costó el 90d.
//
// LA VALIDACIÓN CORRECTA (protocolo fijado antes de correr):
//   1. Se barre una rejilla de distancias y se enseña la CURVA entera. Un pico estrecho es
//      sobreajuste; una meseta ancha es un efecto real. La forma dice más que el máximo.
//   2. Se elige el mejor valor usando SOLO la mitad vieja.
//   3. Se mide ese valor en la mitad nueva, que no participó en la elección. ESE es el número
//      defendible; cualquier otro está contaminado.
//   4. Se compara contra el titular actual (1σ) en esa misma mitad nueva.
//
// Uso: npx tsx scripts/mejora-7-distancia.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, WIDTH_EM, type DBar, type Signal } from "../lib/backtestCore";
import { bsPrice } from "../lib/blackScholes";

const TICKERS = (process.env.BT_TICKERS || "SPY,AAPL,MSFT,NVDA,META,TSLA,AMD,QQQ,HOOD").split(",");
const DTE = 5;
const RIESGO = Number(process.env.D_RIESGO) || 1200;
const AÑOS = 10.5;
const DIR = "scripts/cache-theta";
// Rejilla EXTENDIDA hacia abajo: en la primera pasada el óptimo salió en 0,5σ, o sea en el
// borde. Un máximo en el borde no es un óptimo — es una rejilla demasiado corta. A 0σ vendes
// en el dinero y pierdes la mitad de las veces, así que el punto de giro tiene que existir.
const REJILLA = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.5];
const INCUMBENTE = 1.0;

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

function pnlADistancia(sig: Signal, bars: DBar[], dte: number, sig_: number): number | null {
  const { spot, rv, entryIdx, dir } = sig;
  const em = spot * rv * Math.sqrt(dte / 365);
  if (!(em > 0)) return null;
  const bull = dir === 1;
  const shortK = bull ? spot - sig_ * em : spot + sig_ * em;
  const longK = bull ? shortK - WIDTH_EM * em : shortK + WIDTH_EM * em;
  if (shortK <= 0 || longK <= 0) return null;
  const T = dte / 365;
  const type = bull ? "put" : "call";
  const credit = bsPrice(spot, shortK, T, rv, type) - bsPrice(spot, longK, T, rv, type);
  const width = Math.abs(shortK - longK);
  if (!(credit > 0) || !(width > 0)) return null;
  const expMs = Date.parse(`${bars[entryIdx].time}T20:00:00Z`) + dte * 86_400_000;
  let expIdx = -1;
  for (let i = 0; i < bars.length; i++) if (Date.parse(`${bars[i].time}T20:00:00Z`) >= expMs) { expIdx = i; break; }
  if (expIdx < 0) return null;
  const sExp = bars[expIdx].close;
  const sI = bull ? Math.max(shortK - sExp, 0) : Math.max(sExp - shortK, 0);
  const lI = bull ? Math.max(longK - sExp, 0) : Math.max(sExp - longK, 0);
  const risk = width - credit;
  const pnl = credit - (sI - lI);
  return risk > 0 ? pnl / risk : pnl / width;
}

(async () => {
  const ops: { ms: number; porDist: Map<number, number> }[] = [];

  for (const t of TICKERS) {
    const trozos: DBar[] = [];
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_barsPAR_y_`) && f.endsWith(".json")) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
    }
    const porFecha = new Map(trozos.map((x) => [x.time, x] as const));
    const bars = [...porFecha.values()].sort((a, b) => (a.time < b.time ? -1 : 1));
    const trades: unknown[] = [];
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_y_`) && f.endsWith(".json")) { const y = leer<unknown[]>(`${DIR}/${f}`); if (y?.length) trades.push(...y); }
    }
    if (!bars.length || !trades.length) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sigs = signals(classifyFlow(trades as any, new Date()).rows, bars);
    const k = Math.floor(sigs.length / 3);
    const top = [...sigs].sort((a, b) => a.evaComp - b.evaComp).slice(sigs.length - k)
      .filter((s) => s.ivRatio < 1.1);   // el filtro ya validado va puesto

    for (const sig of top) {
      const m = new Map<number, number>();
      for (const d of REJILLA) { const p = pnlADistancia(sig, bars, DTE, d); if (p != null) m.set(d, p); }
      if (m.size === REJILLA.length) ops.push({ ms: sig.entryMs, porDist: m });
    }
  }

  ops.sort((a, b) => a.ms - b.ms);
  const mid = Math.floor(ops.length / 2);
  const vieja = ops.slice(0, mid), nueva = ops.slice(mid);
  const mediaDe = (arr: typeof ops, d: number) => media(arr.map((o) => o.porDist.get(d)!));

  console.log(`\n## ¿A qué distancia vender? — validación honesta del parámetro`);
  console.log(`### ${DTE}d · Top⅓ EVA + IV/rv<1,1 · n=${ops.length} (vieja ${vieja.length} / nueva ${nueva.length})\n`);

  // El win% y el peor caso van en la tabla: la MEDIA sola esconde el precio que se paga por
  // vender cerca. Una media mejor con la mitad de aciertos es otra estrategia, no una mejora.
  const winDe = (arr: typeof ops, d: number) => Math.round(arr.filter((o) => o.porDist.get(d)! > 0).length / arr.length * 100);
  const peorDe = (arr: typeof ops, d: number) => Math.min(...arr.map((o) => o.porDist.get(d)!)) * 100;
  console.log("| Distancia | Mitad VIEJA | Mitad NUEVA | Todo | Win | Peor |");
  console.log("|---|---|---|---|---|---|");
  for (const d of REJILLA) {
    const v = mediaDe(vieja, d) * 100, n = mediaDe(nueva, d) * 100, t = mediaDe(ops, d) * 100;
    const marca = d === INCUMBENTE ? " ← actual" : "";
    console.log(`| ${d.toFixed(1)}σ | ${v >= 0 ? "+" : ""}${v.toFixed(2)}% | ${n >= 0 ? "+" : ""}${n.toFixed(2)}% | ${t >= 0 ? "+" : ""}${t.toFixed(2)}%${marca} | ${winDe(ops, d)}% | ${peorDe(ops, d).toFixed(0)}% |`);
  }

  // ── El protocolo: elegir en la vieja, medir en la nueva ─────────────────────────────────
  let mejorD = REJILLA[0], mejorV = -Infinity;
  for (const d of REJILLA) { const v = mediaDe(vieja, d); if (v > mejorV) { mejorV = v; mejorD = d; } }
  const enNueva = mediaDe(nueva, mejorD) * 100;
  const incumbenteNueva = mediaDe(nueva, INCUMBENTE) * 100;
  const opsAño = ops.length / AÑOS;

  console.log(`\n### El veredicto (parámetro elegido SIN ver la mitad nueva)\n`);
  console.log(`   Mejor distancia según la mitad VIEJA : ${mejorD.toFixed(1)}σ  (${(mejorV * 100).toFixed(2)}% ahí)`);
  console.log(`   Lo que rinde en la mitad NUEVA       : ${enNueva >= 0 ? "+" : ""}${enNueva.toFixed(2)}%   ← el número defendible`);
  console.log(`   El titular actual (${INCUMBENTE.toFixed(1)}σ) en la nueva  : ${incumbenteNueva >= 0 ? "+" : ""}${incumbenteNueva.toFixed(2)}%`);
  console.log(`   Diferencia real                      : ${(enNueva - incumbenteNueva) >= 0 ? "+" : ""}${(enNueva - incumbenteNueva).toFixed(2)} pp`);
  console.log(`\n   En dólares (${Math.round(opsAño)} ops/año × $${RIESGO}):`);
  console.log(`     ${mejorD.toFixed(1)}σ → $${Math.round(opsAño * enNueva / 100 * RIESGO).toLocaleString("en-US")}/año   ·   ${INCUMBENTE.toFixed(1)}σ → $${Math.round(opsAño * incumbenteNueva / 100 * RIESGO).toLocaleString("en-US")}/año`);

  // ── La forma de la curva importa más que el máximo ──────────────────────────────────────
  const todas = REJILLA.map((d) => mediaDe(ops, d) * 100);
  const mx = Math.max(...todas), mn = Math.min(...todas);
  const dentroDe1pp = REJILLA.filter((d, i) => mx - todas[i] <= 1).length;
  console.log(`\n### La forma de la curva\n`);
  console.log(`   Rango del barrido: ${mn.toFixed(2)}% a ${mx.toFixed(2)}%`);
  console.log(`   Distancias a menos de 1pp del máximo: ${dentroDe1pp} de ${REJILLA.length}`);
  const iMax = todas.indexOf(mx);
  const enBorde = iMax === 0 || iMax === todas.length - 1;
  console.log(`   Máximo en ${REJILLA[iMax].toFixed(1)}σ${enBorde ? " — EN EL BORDE de la rejilla" : ""}`);
  if (enBorde) {
    console.log(`   → El máximo en el borde NO es un óptimo: es una rejilla demasiado corta o una`);
    console.log(`     curva monótona. En ninguno de los dos casos hay un "valor mágico" que ajustar,`);
    console.log(`     así que el riesgo de sobreajuste del PARÁMETRO es bajo — pero tampoco se ha`);
    console.log(`     encontrado el punto donde se da la vuelta.`);
  } else {
    console.log(`   → ${dentroDe1pp >= 4 ? "MESETA ancha: el efecto no depende de clavar el valor exacto." : "PICO estrecho: sospechoso de sobreajuste."}`);
  }
})();
