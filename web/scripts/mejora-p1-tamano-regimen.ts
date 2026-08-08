// P1 — TAMAÑO DINÁMICO POR RÉGIMEN DE VOLATILIDAD
//
// La idea viene de "Sizing the Risk: Kelly, VIX, and Hybrid Approaches in Put-Writing on Index
// Options" (2025): en vez de arriesgar un % fijo, multiplicar por (1 − percentil de volatilidad).
// Se encoge cuando el mercado está nervioso y se expande cuando está tranquilo. Fuera de muestra
// (2024) el híbrido dio 22-23% anual con 9-10% de caída, contra caídas severas del tamaño fijo.
//
// POR QUÉ ESTA PRUEBA ES DISTINTA A TODAS LAS ANTERIORES
// Nuestro backtest mide retOnRisk — el % sobre el riesgo de CADA operación. El tamaño de
// posición NO cambia ese número: cambia los dólares. Así que aquí no se compara una media, se
// simula la CUENTA componiendo. Es la única forma de que el tamaño se note.
//
// EL PERCENTIL SE CALCULA SOLO CON EL PASADO
// Usar el percentil sobre toda la muestra sería mirar el futuro: el día 1 no se sabe cuál es el
// percentil 80 de una serie que aún no ha ocurrido. Se usa ventana móvil de 252 días previos.
//
// CRITERIO FIJADO ANTES DE CORRER (docs/Research-Mejoras-y-0DTE.md):
//   debe subir el $/año Y bajar la caída máxima, EN LAS DOS MITADES del período.
//   Si solo mejora una de las dos cosas, o solo en una mitad, NO se adopta.
//
// Uso: node --env-file=.env.local --import tsx scripts/mejora-p1-tamano-regimen.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, creditSpreadPnl, realizedVol, type DBar } from "../lib/backtestCore";

const TICKERS = (process.env.BT_TICKERS || "SPY,QQQ,AAPL,MSFT,NVDA,META,TSLA,AMD,HOOD").split(",");
const CELDAS: [number, number][] = [[5, 1], [7, 1]];
const DIR = "scripts/cache-theta";
const CUENTA0 = 60_000;
const BASE = 0.02;          // el 2% fijo de hoy
const VENTANA = 252;        // ventana móvil para el percentil de volatilidad

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

interface Op { ms: number; ret: number; pctlRv: number; ticker: string }

/** Percentil de la rv de HOY dentro de los `VENTANA` días previos. Solo pasado. */
function percentilRv(rvSerie: (number | null)[], i: number): number | null {
  const ini = Math.max(0, i - VENTANA);
  const previos: number[] = [];
  for (let j = ini; j < i; j++) { const v = rvSerie[j]; if (v != null && v > 0) previos.push(v); }
  const hoy = rvSerie[i];
  if (hoy == null || !(hoy > 0) || previos.length < 60) return null;
  return previos.filter((v) => v < hoy).length / previos.length;
}

function cargar(): Op[] {
  const ops: Op[] = [];
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

    const rvSerie = bars.map((_, i) => realizedVol(bars, i));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sigs = signals(classifyFlow(trades as any, new Date()).rows, bars);
    const k = Math.floor(sigs.length / 3);
    const top = [...sigs].sort((a, b) => a.evaComp - b.evaComp).slice(sigs.length - k).filter((s) => s.ivRatio < 1.1);

    for (const sig of top) {
      const pctl = percentilRv(rvSerie, sig.entryIdx);
      if (pctl == null) continue;
      for (const [dte, sigma] of CELDAS) {
        const r = creditSpreadPnl(sig, bars, dte, sigma);
        if (r != null) ops.push({ ms: sig.entryMs, ret: r, pctlRv: pctl, ticker: t });
      }
    }
  }
  return ops.sort((a, b) => a.ms - b.ms);
}

/** Simula la cuenta. `frac(op)` decide qué fracción del capital se arriesga en cada operación. */
function simular(ops: Op[], frac: (o: Op) => number, c0 = CUENTA0) {
  let c = c0, pico = c0, ddMax = 0;
  for (const o of ops) {
    const riesgo = c * frac(o);
    c += riesgo * o.ret;          // ret ya es retorno SOBRE el riesgo
    if (c <= 0) return { final: 0, ddMax: 1, cagr: -1, quiebra: true };
    pico = Math.max(pico, c);
    ddMax = Math.max(ddMax, (pico - c) / pico);
  }
  const años = (ops[ops.length - 1].ms - ops[0].ms) / (365.25 * 86_400_000);
  return { final: c, ddMax, cagr: Math.pow(c / c0, 1 / años) - 1, quiebra: false, años };
}

const fmt = (x: number) => "$" + Math.round(x).toLocaleString("en-US");
const pc = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%";

(async () => {
  const ops = cargar();
  console.log(`\n## P1 — TAMAÑO DINÁMICO POR RÉGIMEN · ${ops.length} operaciones · cuenta ${fmt(CUENTA0)}\n`);
  if (ops.length < 300) { console.log("   muestra insuficiente"); return; }

  const mitad = Math.floor(ops.length / 2);
  const tramos: [string, Op[]][] = [
    ["PERÍODO COMPLETO", ops],
    ["mitad VIEJA", ops.slice(0, mitad)],
    ["mitad NUEVA", ops.slice(mitad)],
  ];

  // Las reglas a comparar. La "fija" es lo que corre hoy.
  const reglas: [string, (o: Op) => number][] = [
    ["FIJA 2% (lo de hoy)", () => BASE],
    ["× (1 − pctl)", (o) => BASE * (1 - o.pctlRv)],
    ["× (1 − pctl), suelo 25%", (o) => BASE * Math.max(0.25, 1 - o.pctlRv)],
    ["mitad si pctl > 0,8", (o) => BASE * (o.pctlRv > 0.8 ? 0.5 : 1)],
    // LA HIPÓTESIS CONTRARIA. No sale de mirar el resultado de arriba, sale de un hallazgo
    // PREVIO (7 ago 2026): el 5d de alta convicción rinde +1,0% / +2,5% / +2,9% en régimen
    // tranquilo / normal / volátil. Nuestra estrategia rinde MÁS cuando hay volatilidad —
    // justo al revés que el put-writing desnudo del paper, porque el filtro IV/rv<1,1 ya
    // quita antes los días de prima envenenada. Si eso es cierto, encoger en volatilidad alta
    // es exactamente lo contrario de lo que conviene.
    ["× pctl (al revés)", (o) => BASE * o.pctlRv],
    ["× (0,5 + pctl)", (o) => BASE * (0.5 + o.pctlRv)],
  ];

  // ── NORMALIZACIÓN — sin esto la comparación no dice nada ────────────────────────────────
  // Una regla que multiplica por (1 − pctl) arriesga de media la MITAD que el 2% fijo. Que
  // gane menos y caiga menos no prueba nada: es lo que hace cualquiera que arriesgue menos.
  // La pregunta de P1 es si VARIAR el tamaño según el régimen aporta algo A IGUAL RIESGO.
  // Se escala cada regla por una constante para que su fracción MEDIA sea el 2%.
  const normalizar = (f: (o: Op) => number, sub: Op[]) => {
    const media = sub.reduce((s, o) => s + f(o), 0) / sub.length;
    const k = BASE / media;
    return (o: Op) => f(o) * k;
  };

  for (const [nombre, sub] of tramos) {
    console.log(`### ${nombre} — ${sub.length} ops, ${((sub[sub.length - 1].ms - sub[0].ms) / (365.25 * 86_400_000)).toFixed(1)} años`);
    console.log(`(todas normalizadas al mismo riesgo MEDIO del 2% — si no, solo mediríamos quién arriesga menos)\n`);
    console.log("| Regla de tamaño | Cuenta final | Anual | Caída máxima | $ por unidad de caída |");
    console.log("|---|---|---|---|---|");
    for (const [rn, f] of reglas) {
      const fn = rn.startsWith("FIJA") ? f : normalizar(f, sub);
      const r = simular(sub, fn);
      const porAño = (r.final - CUENTA0) / (r.años ?? 1);
      console.log(`| ${rn} | ${fmt(r.final)} | ${pc(r.cagr)} | ${(r.ddMax * 100).toFixed(1)}% | ${fmt(porAño / Math.max(0.01, r.ddMax))} |`);
    }
    console.log("");
  }

  // ── Veredicto contra el criterio prefijado ──────────────────────────────────────────────
  console.log(`### Veredicto (criterio fijado ANTES de correr)\n`);
  const base = reglas[0][1];
  const norm = (f: (o: Op) => number, sub: Op[]) => {
    const m = sub.reduce((s, o) => s + f(o), 0) / sub.length;
    return (o: Op) => (f(o) * BASE) / m;
  };
  for (const [rn, f] of reglas.slice(1)) {
    let cumple = true;
    const detalle: string[] = [];
    for (const [nombre, sub] of tramos.slice(1)) {   // solo las dos mitades
      const a = simular(sub, base), b = simular(sub, norm(f, sub));
      const masDinero = b.final > a.final, menosCaida = b.ddMax < a.ddMax;
      if (!masDinero || !menosCaida) cumple = false;
      detalle.push(
        `${nombre}: ${fmt(a.final)} → ${fmt(b.final)} (${masDinero ? "más" : "MENOS"} $) · ` +
        `caída ${(a.ddMax * 100).toFixed(1)}% → ${(b.ddMax * 100).toFixed(1)}% (${menosCaida ? "mejor" : "PEOR"})`);
    }
    console.log(`   ${cumple ? "✅ ADOPTAR" : "❌ NO"} · ${rn}`);
    for (const d of detalle) console.log(`        ${d}`);
  }
  console.log(`\n   El criterio era: más $/año Y menos caída, en las DOS mitades. Si solo cumple`);
  console.log(`   una cosa o una mitad, no se adopta — es como se colaron los 4 hallazgos que se cayeron.`);
})();
