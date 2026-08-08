// MEJORA #2 — ¿qué tienen en común las operaciones que REVIENTAN?
//
// POR QUÉ AQUÍ: el win rate no se mueve (85-94% todos los años). Lo que decide si el año da
// +7,5% o −0,3% es cuánto pesan las pocas perdedoras. La aritmética: subir el ganador de 11,5%
// a 13% lleva la media a +3,6%; evitar UN TERCIO de las perdedoras la lleva a +5,4%.
//
// Se comparan las catastróficas contra el resto en variables observables EL DÍA DE ENTRADA
// (nada que no supieras al abrir la posición):
//   · rv       — volatilidad realizada 20d = régimen
//   · ivRatio  — IV pagada / rv = "el mercado espera un evento" (proxy de earnings)
//   · netRatio — desequilibrio direccional del flujo
//   · evaComp  — convicción
//
// Y luego se prueban filtros PREESPECIFICADOS (los de abajo, fijados antes de correr), cada uno
// con OOS obligatorio. Sin OOS, con 7.500 operaciones y cuatro variables se encuentra "algo"
// siempre.
//
// Uso: npx tsx scripts/mejora-2-cola.ts

import { readFileSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, creditSpreadPnl, type DBar, type Signal } from "../lib/backtestCore";

const TICKERS = (process.env.BT_TICKERS || "SPY,AAPL,MSFT,NVDA,META,TSLA,AMD,QQQ,HOOD").split(",");
const DTE = 5, SIGMA = 1;
const CATASTROFE = -0.5; // pérdida >= 50% del riesgo
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

interface Op { sig: Signal; pnl: number; ticker: string }
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };
const f = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;

function evaluar(nombre: string, ops: Op[], base: Op[]) {
  if (ops.length < 100) { console.log(`| ${nombre} | ${ops.length} | muestra insuficiente | | | |`); return; }
  const o = [...ops].sort((a, b) => a.sig.entryMs - b.sig.entryMs);
  const mid = Math.floor(o.length / 2);
  const vieja = media(o.slice(0, mid).map((x) => x.pnl));
  const nueva = media(o.slice(mid).map((x) => x.pnl));
  const m = media(ops.map((x) => x.pnl));
  const cat = ops.filter((x) => x.pnl <= CATASTROFE).length / ops.length;
  const catBase = base.filter((x) => x.pnl <= CATASTROFE).length / base.length;
  const ok = vieja > 0 && nueva > 0 && m > media(base.map((x) => x.pnl));
  console.log(`| ${nombre} | ${ops.length} | ${f(m)} | ${f(vieja)} / ${f(nueva)} | ${(cat * 100).toFixed(1)}% (base ${(catBase * 100).toFixed(1)}%) | ${ok ? "✅" : "✗"} |`);
}

(async () => {
  const todas: Op[] = [];
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
    for (const sig of signals(classifyFlow(trades as any, new Date()).rows, bars)) {
      const pnl = creditSpreadPnl(sig, bars, DTE, SIGMA);
      if (pnl != null) todas.push({ sig, pnl, ticker: t });
    }
  }

  // El universo de trabajo es el Top⅓ EVA: es lo que la estrategia opera.
  const k = Math.floor(todas.length / 3);
  const top = [...todas].sort((a, b) => a.sig.evaComp - b.sig.evaComp).slice(todas.length - k);
  const catas = top.filter((x) => x.pnl <= CATASTROFE);
  const resto = top.filter((x) => x.pnl > CATASTROFE);

  console.log(`\n## MEJORA #2 — la cola · ${DTE}d @${SIGMA}σ · Top⅓ EVA (n=${top.length})\n`);
  console.log(`Catastróficas (pérdida ≥ 50% del riesgo): **${catas.length}** (${(catas.length / top.length * 100).toFixed(1)}%)`);
  console.log(`Pesan ${f(media(catas.map((x) => x.pnl)))} de media · el resto ${f(media(resto.map((x) => x.pnl)))}\n`);

  console.log("### ¿Se distinguen ANTES de abrir?\n");
  console.log("| Variable | Catastróficas (mediana) | Resto (mediana) | ¿Separa? |");
  console.log("|---|---|---|---|");
  const vars: [string, (s: Signal) => number][] = [
    ["volatilidad realizada", (s) => s.rv],
    ["IV pagada / rv", (s) => s.ivRatio],
    ["desequilibrio del flujo", (s) => s.netRatio],
    ["convicción EVA", (s) => s.evaComp],
  ];
  for (const [nombre, get] of vars) {
    const a = med(catas.map((x) => get(x.sig)));
    const b = med(resto.map((x) => get(x.sig)));
    const rel = b !== 0 ? Math.abs(a - b) / Math.abs(b) : 0;
    console.log(`| ${nombre} | ${a.toFixed(3)} | ${b.toFixed(3)} | ${rel > 0.15 ? `sí (${(rel * 100).toFixed(0)}% dif)` : "no"} |`);
  }

  // ── Filtros PREESPECIFICADOS ────────────────────────────────────────────────────────────
  console.log(`\n### Filtros preespecificados (base = Top⅓ sin filtrar)\n`);
  console.log("| Filtro | n | Media | OOS vieja / nueva | % catastróficas | ¿Sirve? |");
  console.log("|---|---|---|---|---|---|");
  evaluar("BASE — Top⅓ sin filtrar", top, top);
  evaluar("IV/rv < 1.3 (sin evento esperado)", top.filter((x) => x.sig.ivRatio < 1.3), top);
  evaluar("IV/rv < 1.1", top.filter((x) => x.sig.ivRatio < 1.1), top);
  evaluar("desequilibrio ≥ 30%", top.filter((x) => x.sig.netRatio >= 0.3), top);
  evaluar("desequilibrio ≥ 50%", top.filter((x) => x.sig.netRatio >= 0.5), top);
  evaluar("rv < 40% (fuera de pánico)", top.filter((x) => x.sig.rv < 0.40), top);
  evaluar("rv < 30%", top.filter((x) => x.sig.rv < 0.30), top);
  evaluar("decil 10 de EVA", [...top].sort((a, b) => a.sig.evaComp - b.sig.evaComp).slice(top.length - Math.floor(todas.length / 10)), top);

  // COMBINACIÓN — se prueba UNA sola, elegida por mecanismo (evento esperado + convicción),
  // no barriendo pares hasta que salga bonito.
  console.log(`
### Combinación (decil 10 + sin evento esperado)
`);
  console.log("| Filtro | n | Media | OOS vieja / nueva | % catastróficas | ¿Sirve? |");
  console.log("|---|---|---|---|---|---|");
  const d10 = [...top].sort((a, b) => a.sig.evaComp - b.sig.evaComp).slice(top.length - Math.floor(todas.length / 10));
  evaluar("decil 10 + IV/rv < 1.1", d10.filter((x) => x.sig.ivRatio < 1.1), top);
  evaluar("Top⅓ + IV/rv<1.1 + deseq≥50%", top.filter((x) => x.sig.ivRatio < 1.1 && x.sig.netRatio >= 0.5), top);

  // Reparto por ticker: ¿las catástrofes se concentran en alguno?
  console.log(`\n### ¿Se concentran en algún ticker?\n`);
  console.log("| Ticker | Operaciones | Catastróficas | % |");
  console.log("|---|---|---|---|");
  for (const t of TICKERS) {
    const sub = top.filter((x) => x.ticker === t);
    if (!sub.length) continue;
    const c = sub.filter((x) => x.pnl <= CATASTROFE).length;
    console.log(`| ${t} | ${sub.length} | ${c} | ${(c / sub.length * 100).toFixed(1)}% |`);
  }
})();
