// P5 — IRON CONDOR sobre la selección de días de EVA
//
// DE DÓNDE SALE. P2 demostró que EVA hace dos cosas y solo una funciona: elegir QUÉ DÍAS operar
// (Top⅓ separa +3,1% de −4,0% incluso con el lado al azar) y elegir DE QUÉ LADO ponerse (no
// supera a una moneda al aire). Si el lado da igual, vender LOS DOS cobra prima de las dos patas
// sobre la única parte que sí vale.
//
// LA OBJECIÓN DE LA LITERATURA, que hay que tener delante: en 0DTE el iron condor pasa de Sharpe
// bruto +0,77 a NETO −0,20; los costes se lo comen entero. Pero eso es a 0 días, donde el spread
// bid/ask pesa muchísimo sobre una prima diminuta. A 5-7 días la prima es mayor y el mismo coste
// relativo duele menos. No está medido — por eso se mide aquí, CON costes.
//
// CRITERIO FIJADO ANTES DE CORRER:
//   más $/año que la estrategia actual EN LAS DOS MITADES, sin empeorar la tasa de catástrofes.
//   Ganar en una mitad y perder en la otra = descartado.
//
// NO TOCA backtestCore. El cóndor se valora aquí; el camino de la estrategia actual queda intacto.
//
// Uso: node --import tsx scripts/mejora-p5-iron-condor.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, creditSpreadPnl, type DBar } from "../lib/backtestCore";
import { ironCondorPnl } from "../lib/ironCondor";

const DIR = "scripts/cache-theta";
const TICKERS = (process.env.BT_TICKERS || "SPY,QQQ,AAPL,MSFT,NVDA,META,TSLA,AMD,HOOD").split(",");
const DTE = Number(process.env.P5_DTE) || 5;
const SIGMA = Number(process.env.P5_SIGMA) || 1;
const RIESGO = 1200;          // 2% de una cuenta de 60k, igual que siempre
const CATASTROFE = -0.5;      // perder más de la mitad del colateral
// 2% del crédito por defecto. Se puede subir con P5_SLIP para probar la objeción de la
// literatura: en 0DTE el cóndor pasa de +0,77 bruto a −0,20 NETO, o sea que los costes deciden.
// Si el edge del cóndor a 5 días muere al subir el slippage, es frágil y no se toca.
const SLIP = Number(process.env.P5_SLIP ?? 0.02);
const COMM = 0.65;            // por contrato

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

let semilla = 4242;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };

interface Fila { ms: number; condor: number; vertical: number; azar: number }

(async () => {
  const filas: Fila[] = [];
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
    if (bars.length < 300 || !trades.length) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sigs = signals(classifyFlow(trades as any, new Date()).rows, bars);
    const k = Math.floor(sigs.length / 3);
    const top = [...sigs].sort((a, b) => a.evaComp - b.evaComp).slice(sigs.length - k).filter((s) => s.ivRatio < 1.1);

    for (const sig of top) {
      // El vertical se valora con los MISMOS costes, o la comparación estaría amañada.
      const v = creditSpreadPnl(sig, bars, DTE, SIGMA, SLIP, COMM);
      const c = ironCondorPnl(sig, bars, DTE, SIGMA, { slip: SLIP, commPerContract: COMM });
      const a = creditSpreadPnl({ ...sig, dir: rnd() < 0.5 ? 1 : -1 }, bars, DTE, SIGMA, SLIP, COMM);
      if (v == null || c == null || a == null) continue;
      filas.push({ ms: sig.entryMs, condor: c, vertical: v, azar: a });
    }
  }

  filas.sort((a, b) => a.ms - b.ms);
  console.log(`\n## P5 — IRON CONDOR sobre la selección de días de EVA · ${DTE}d @${SIGMA}σ\n`);
  console.log(`n=${filas.length} · costes INCLUIDOS: slippage ${SLIP * 100}% + $${COMM}/contrato`);
  console.log(`(el cóndor paga el DOBLE: 4 patas contra 2)\n`);
  if (filas.length < 300) { console.log("muestra insuficiente"); return; }

  const mit = Math.floor(filas.length / 2);
  const tramos: [string, Fila[]][] = [
    ["COMPLETO", filas], ["mitad VIEJA", filas.slice(0, mit)], ["mitad NUEVA", filas.slice(mit)],
  ];
  const años = (f: Fila[]) => (f[f.length - 1].ms - f[0].ms) / (365.25 * 86_400_000);

  for (const [nombre, sub] of tramos) {
    const a = años(sub);
    console.log(`### ${nombre} — ${sub.length} ops, ${a.toFixed(1)} años\n`);
    console.log("| Vehículo | Media | Win | Catástrofes | $/año |");
    console.log("|---|---|---|---|---|");
    for (const [vn, sel] of [["Vertical (EVA) — hoy", (f: Fila) => f.vertical], ["Vertical (lado al azar)", (f: Fila) => f.azar], ["**IRON CONDOR**", (f: Fila) => f.condor]] as const) {
      const r = sub.map(sel);
      const m = media(r) * 100;
      const win = (r.filter((x) => x > 0).length / r.length) * 100;
      const cat = (r.filter((x) => x <= CATASTROFE).length / r.length) * 100;
      const porAño = (sub.length / a) * (m / 100) * RIESGO;
      console.log(`| ${vn} | ${m >= 0 ? "+" : ""}${m.toFixed(2)}% | ${win.toFixed(0)}% | ${cat.toFixed(1)}% | $${Math.round(porAño).toLocaleString("en-US")} |`);
    }
    console.log("");
  }

  console.log(`### Veredicto (criterio fijado ANTES de correr)\n`);
  let cumple = true;
  for (const [nombre, sub] of tramos.slice(1)) {
    const a = años(sub);
    const dinero = (sel: (f: Fila) => number) => (sub.length / a) * media(sub.map(sel)) * RIESGO;
    const catas = (sel: (f: Fila) => number) => sub.map(sel).filter((x) => x <= CATASTROFE).length / sub.length;
    const masDinero = dinero((f) => f.condor) > dinero((f) => f.vertical);
    const noPeorCola = catas((f) => f.condor) <= catas((f) => f.vertical) * 1.05;
    if (!masDinero || !noPeorCola) cumple = false;
    console.log(`   ${nombre}: $${Math.round(dinero((f) => f.vertical)).toLocaleString("en-US")} → $${Math.round(dinero((f) => f.condor)).toLocaleString("en-US")} ` +
      `(${masDinero ? "MÁS" : "menos"}) · catástrofes ${(catas((f) => f.vertical) * 100).toFixed(1)}% → ${(catas((f) => f.condor) * 100).toFixed(1)}% (${noPeorCola ? "ok" : "PEOR"})`);
  }
  console.log(`\n   → ${cumple ? "✅ ADOPTAR — el cóndor gana en las DOS mitades sin empeorar la cola." : "❌ NO cumple el criterio (fijado antes de correr)."}`);

  // ── INFORMACIÓN ADICIONAL, no un cambio de criterio ─────────────────────────────────────
  // La tasa de catástrofes puede ser el instrumento equivocado para comparar DOS vehículos
  // distintos: el cóndor tiene dos fronteras en vez de una, así que romper alguna es el doble
  // de probable por pura aritmética. Lo que de verdad decide si esa cola importa es la CAÍDA
  // de la cuenta al componer — la media ya lleva las catástrofes dentro, la caída no.
  //
  // Esto NO reemplaza al veredicto de arriba. Se añade para que la decisión sea informada.
  console.log(`\n### Dato adicional: la cuenta al componer (2% por operación, $60.000)\n`);
  const simular = (sub: Fila[], sel: (f: Fila) => number) => {
    let c = 60_000, pico = c, dd = 0;
    for (const f of sub) {
      c += c * 0.02 * sel(f);
      if (c <= 0) return { final: 0, dd: 1 };
      pico = Math.max(pico, c); dd = Math.max(dd, (pico - c) / pico);
    }
    return { final: c, dd };
  };
  console.log("| Tramo | Vehículo | Cuenta final | Caída máxima |");
  console.log("|---|---|---|---|");
  for (const [nombre, sub] of tramos.slice(1)) {
    for (const [vn, sel] of [["vertical (EVA)", (f: Fila) => f.vertical], ["IRON CONDOR", (f: Fila) => f.condor]] as const) {
      const r = simular(sub, sel);
      console.log(`| ${nombre} | ${vn} | $${Math.round(r.final).toLocaleString("en-US")} | ${(r.dd * 100).toFixed(1)}% |`);
    }
  }
  console.log(`\n   Recordatorio del caveat de P1: la simulación liquida en secuencia y de verdad hay`);
  console.log(`   4-5 posiciones abiertas a la vez, así que la caída REAL es peor en los dos casos.`);
})();
