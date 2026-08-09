// ¿EL MERCADO YA SABE LO QUE EVA VE?
//
// EVA separa el movimiento REALIZADO de forma limpia y monótona (7.461 señales):
//   Bottom⅓  1,039 veces lo esperado · rompe 1,5σ el 22,8% (teórico 13,4%)
//   Top⅓     0,751 veces lo esperado · rompe 1,5σ el  9,2%
//
// Eso es una propiedad del subyacente, sin modelo ni precios. Pero NO basta: si el mercado
// también ve ese flujo raro y ya cobra más IV esos días, la opción no está barata — está bien
// valorada, y no hay negocio. Es exactamente lo que pasó con los verticales: la señal era real
// (94% de aciertos) y aun así perdíamos, porque el precio ya lo reflejaba.
//
// LA PRUEBA: comparar la IV que COBRA el mercado en cada tercio contra el movimiento que DESPUÉS
// ocurrió. Lo que importa no es la IV alta o baja, sino la BRECHA — cuánto cobra frente a lo que
// acaba costando.
//
//   brecha = movimiento realizado / movimiento implícito en la IV
//     > 1  → el mercado cobra POCO: la opción está barata, comprar tiene sentido
//     < 1  → el mercado cobra DE MÁS: vender tiene sentido
//     = 1  → bien valorada, no hay nada
//
// Uso: node --import tsx scripts/eva-el-mercado-ya-lo-sabe.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, barIdxOnOrAfter, type DBar, type Signal } from "../lib/backtestCore";
import { impliedVol } from "../lib/blackScholes";

const DIR = "scripts/cache-theta", CDIR = `${DIR}/cadenas`;
const TICKERS = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "TSLA", "AMD"];
const DTE = Number(process.env.EV_DTE ?? 21);

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
type CadenaDia = Record<string, Record<string, [number, number]>>;

interface Obs { eva: number; iv: number; rv: number; movRel: number; brecha: number }

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
      const entrada = bars[sig.entryIdx].time.replace(/-/g, "");
      const cad = leer<CadenaDia>(`${CDIR}/${t}_d${entrada}.json`);
      if (!cad) continue;
      const objetivo = new Date(Date.parse(`${bars[sig.entryIdx].time}T12:00:00Z`) + DTE * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
      const exp = Object.keys(cad).sort().find((e) => e >= objetivo);
      if (!exp) continue;
      const expIdx = barIdxOnOrAfter(bars, Date.parse(`${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}T20:00:00Z`));
      if (expIdx < 0 || expIdx <= sig.entryIdx) continue;

      // La IV del mercado se lee en la CALL más cercana al dinero — donde hay más liquidez y
      // donde el skew pesa menos.
      const calls = Object.keys(cad[exp]).filter((x) => x.endsWith("|C")).map((x) => Number(x.split("|")[0]));
      if (calls.length < 5) continue;
      const kAtm = calls.reduce((b, k) => (Math.abs(k - sig.spot) < Math.abs(b - sig.spot) ? k : b), calls[0]);
      const q = cad[exp][`${kAtm}|C`];
      if (!q) continue;
      const precio = (q[0] + q[1]) / 2;
      if (!(precio > 0)) continue;
      const T = (expIdx - sig.entryIdx) / 252;
      if (!(T > 0)) continue;
      const iv = impliedVol(precio, sig.spot, kAtm, T, "call");
      if (iv == null || !(iv > 0.02) || !(iv < 4)) continue;

      // Movimiento realizado contra el que la IV implicaba.
      const movReal = Math.abs(bars[expIdx].close - sig.spot);
      const movImplicito = sig.spot * iv * Math.sqrt(T);
      const movEsperadoRv = sig.spot * sig.rv * Math.sqrt(T);
      if (!(movImplicito > 0) || !(movEsperadoRv > 0)) continue;
      obs.push({ eva: sig.evaComp, iv, rv: sig.rv, movRel: movReal / movEsperadoRv, brecha: movReal / movImplicito });
    }
  }

  console.log(`\n## ¿El mercado ya sabe lo que EVA ve? · ${DTE} días · ${obs.length} señales\n`);
  if (obs.length < 500) { console.log(`muestra insuficiente (${obs.length})`); return; }

  const porEva = [...obs].sort((a, b) => a.eva - b.eva);
  const k = Math.floor(porEva.length / 3);
  const grupos: [string, Obs[]][] = [
    ["Bottom⅓ (baja convicción)", porEva.slice(0, k)],
    ["Medio", porEva.slice(k, 2 * k)],
    ["Top⅓ (alta convicción)", porEva.slice(2 * k)],
  ];

  console.log("| Tercio | n | IV que cobra | rv previa | IV/rv | mov real / implícito |");
  console.log("|---|---|---|---|---|---|");
  const brechas: number[] = [];
  for (const [nom, g] of grupos) {
    const iv = media(g.map((x) => x.iv)), rv = media(g.map((x) => x.rv));
    const br = media(g.map((x) => x.brecha));
    brechas.push(br);
    console.log(`| ${nom} | ${g.length} | ${(iv * 100).toFixed(1)}% | ${(rv * 100).toFixed(1)}% | ${(iv / rv).toFixed(2)} | **${br.toFixed(3)}** |`);
  }

  const [bot, , top] = brechas;
  console.log(`\n### Veredicto\n`);
  console.log(`   La brecha es movimiento REAL / movimiento que la IV implicaba.`);
  console.log(`   Para una normal, esa razon deberia rondar 0,798 si el precio fuera justo.\n`);
  console.log(`   Bottom⅓: ${bot.toFixed(3)}   ${bot > 0.85 ? "← el mercado cobra POCO para lo que pasa" : bot < 0.75 ? "← el mercado cobra DE MAS" : "← bien valorado"}`);
  console.log(`   Top⅓   : ${top.toFixed(3)}   ${top < 0.75 ? "← el mercado cobra DE MAS (vender tiene sentido)" : top > 0.85 ? "← cobra poco" : "← bien valorado"}`);
  const dif = bot - top;
  console.log(`\n   diferencia Bottom − Top: **${dif >= 0 ? "+" : ""}${dif.toFixed(3)}**`);
  console.log(`\n   → ${Math.abs(dif) < 0.05
    ? "EL MERCADO YA LO SABE. Cobra proporcionalmente lo mismo en los dos tercios, asi que la\n     ventaja de EVA ya esta en el precio. No hay negocio por esta via."
    : dif > 0
      ? "EL MERCADO NO LO SABE DEL TODO. En el Bottom 1/3 el movimiento real supera al implicito\n     mas que en el Top: esas opciones estan comparativamente BARATAS. Comprar volatilidad\n     ahi tiene fundamento."
      : "AL REVES DE LO PREVISTO: el mercado cobra relativamente mas en el Bottom 1/3."}`);
})();
