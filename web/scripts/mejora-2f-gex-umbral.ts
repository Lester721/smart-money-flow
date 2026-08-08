// EL FILTRO DE GAMMA, validado con el umbral elegido a ciegas.
//
// Ya sabemos que el MECANISMO existe: en SPY el precio se mueve 1,217 veces lo esperado con
// gamma negativa contra 0,919 con positiva (2.608 días, 4/4 sub-períodos). En QQQ igual. En las
// acciones, no. Falta la pregunta que decide: ¿evitar esos días GANA DINERO?
//
// EL PROTOCOLO, el mismo que usamos con la distancia:
//   1. Se parte la muestra por fecha en dos mitades.
//   2. Se busca el mejor umbral usando SOLO la mitad vieja.
//   3. El umbral se congela como VALOR ABSOLUTO de GEX y se aplica a la mitad nueva.
//      (Recalcular el percentil sobre la mitad nueva sería mirar el futuro: el corte dependería
//      de datos que en el momento de decidir no existían.)
//   4. Se compara contra no filtrar, en esa misma mitad nueva.
//
// UNIVERSO: los ETF de índice (SPY+QQQ), que es donde el mecanismo se midió. Las acciones van
// como CONTROL: si el filtro también "funciona" ahí, es que no estamos midiendo gamma sino otra
// cosa, porque en las acciones el mecanismo NO aparece.
//
// Uso: npx tsx scripts/mejora-2f-gex-umbral.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, creditSpreadPnl, type DBar, type Signal } from "../lib/backtestCore";
import { bsGamma } from "../lib/blackScholes";

const DTE = 5, SIGMA = 1;
const CATASTROFE = -0.5;
const RIESGO = 1200, AÑOS = 10.5;
const DIR = "scripts/cache-theta";
const INDICES = ["SPY", "QQQ"];
const ACCIONES = ["AAPL", "MSFT", "NVDA", "META", "TSLA", "AMD"];
// Qué fracción de los días de gamma MÁS NEGATIVA se descarta. 0 = no filtrar (el titular).
const REJILLA = [0, 0.10, 0.20, 0.30, 0.40, 0.50];

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
type OiExp = Record<string, Record<string, Record<string, [number, number]>>>;

interface Op { ms: number; pnl: number; gex: number }

function cargar(tickers: string[]): Op[] {
  const ops: Op[] = [];
  for (const t of tickers) {
    const trozos: DBar[] = [];
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_barsPAR_y_`) && f.endsWith(".json")) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
    }
    const porFecha = new Map(trozos.map((x) => [x.time, x] as const));
    const bars = [...porFecha.values()].sort((a, b) => (a.time < b.time ? -1 : 1));
    const oi: OiExp = {};
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_oiexp_y_`) && f.endsWith(".json")) Object.assign(oi, leer<OiExp>(`${DIR}/${f}`) ?? {});
    }
    const trades: unknown[] = [];
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_y_`) && f.endsWith(".json")) { const y = leer<unknown[]>(`${DIR}/${f}`); if (y?.length) trades.push(...y); }
    }
    if (!bars.length || !trades.length || !Object.keys(oi).length) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sigs = signals(classifyFlow(trades as any, new Date()).rows, bars);
    const k = Math.floor(sigs.length / 3);
    const top = [...sigs].sort((a, b) => a.evaComp - b.evaComp).slice(sigs.length - k).filter((s) => s.ivRatio < 1.1);

    for (const sig of top) {
      const pnl = creditSpreadPnl(sig, bars, DTE, SIGMA);
      if (pnl == null) continue;
      const porExp = oi[ymd(sig.entryMs)];
      if (!porExp) continue;
      let gex = 0;
      const T = DTE / 365;
      for (const porStrike of Object.values(porExp)) {
        for (const [kStr, [oiC, oiP]] of Object.entries(porStrike)) {
          const g = bsGamma(sig.spot, Number(kStr), T, sig.rv);
          if (g > 0) gex += g * (oiC - oiP) * 100 * sig.spot * sig.spot * 0.01;
        }
      }
      ops.push({ ms: sig.entryMs, pnl, gex: gex / (sig.spot * sig.spot) });
    }
  }
  return ops.sort((a, b) => a.ms - b.ms);
}

function analizar(nombre: string, ops: Op[]) {
  if (ops.length < 120) { console.log(`\n### ${nombre}: solo ${ops.length} operaciones — muestra insuficiente`); return; }
  const mid = Math.floor(ops.length / 2);
  const vieja = ops.slice(0, mid), nueva = ops.slice(mid);

  console.log(`\n### ${nombre}  ·  ${ops.length} operaciones (${vieja.length} vieja / ${nueva.length} nueva)\n`);
  console.log("| Descarta el ⅓ peor… | Umbral (de la VIEJA) | Media VIEJA | Media NUEVA | n NUEVA |");
  console.log("|---|---|---|---|---|");

  let mejorFrac = 0, mejorVieja = -Infinity, mejorUmbral = -Infinity;
  const gexVieja = vieja.map((o) => o.gex).sort((a, b) => a - b);
  for (const frac of REJILLA) {
    // Umbral = el valor de GEX en el percentil `frac` DE LA MITAD VIEJA. Se congela como número
    // absoluto; la mitad nueva no participa en elegirlo.
    const umbral = frac === 0 ? -Infinity : gexVieja[Math.floor(gexVieja.length * frac)];
    const v = vieja.filter((o) => o.gex >= umbral), n = nueva.filter((o) => o.gex >= umbral);
    const mv = media(v.map((o) => o.pnl)) * 100, mn = media(n.map((o) => o.pnl)) * 100;
    if (mv > mejorVieja) { mejorVieja = mv; mejorFrac = frac; mejorUmbral = umbral; }
    console.log(`| ${(frac * 100).toFixed(0)}% | ${frac === 0 ? "—" : umbral.toExponential(2)} | ${mv >= 0 ? "+" : ""}${mv.toFixed(2)}% | ${mn >= 0 ? "+" : ""}${mn.toFixed(2)}% | ${n.length} |`);
  }

  const nFiltrada = nueva.filter((o) => o.gex >= mejorUmbral);
  const mFiltrada = media(nFiltrada.map((o) => o.pnl)) * 100;
  const mSin = media(nueva.map((o) => o.pnl)) * 100;
  const catFil = nFiltrada.filter((o) => o.pnl <= CATASTROFE).length / Math.max(1, nFiltrada.length) * 100;
  const catSin = nueva.filter((o) => o.pnl <= CATASTROFE).length / nueva.length * 100;
  const opsAño = nFiltrada.length / (AÑOS / 2), opsAñoSin = nueva.length / (AÑOS / 2);

  console.log(`\n   Elegido en la VIEJA: descartar el ${(mejorFrac * 100).toFixed(0)}% de gamma más negativa`);
  console.log(`   Medido en la NUEVA (no participó en la elección):`);
  console.log(`     con filtro : ${mFiltrada >= 0 ? "+" : ""}${mFiltrada.toFixed(2)}%  ·  catástrofes ${catFil.toFixed(1)}%  ·  ${Math.round(opsAño)} ops/año  →  $${Math.round(opsAño * mFiltrada / 100 * RIESGO).toLocaleString("en-US")}/año`);
  console.log(`     sin filtro : ${mSin >= 0 ? "+" : ""}${mSin.toFixed(2)}%  ·  catástrofes ${catSin.toFixed(1)}%  ·  ${Math.round(opsAñoSin)} ops/año  →  $${Math.round(opsAñoSin * mSin / 100 * RIESGO).toLocaleString("en-US")}/año`);
  console.log(`   → ${mFiltrada > mSin ? "MEJORA" : "NO mejora"} el rendimiento por operación · ${catFil < catSin ? "REDUCE" : "no reduce"} la cola`);
}

(async () => {
  console.log(`\n## FILTRO DE GAMMA con umbral elegido a ciegas · ${DTE}d @${SIGMA}σ · Top⅓ EVA + IV/rv<1,1`);
  analizar("ÍNDICES (SPY + QQQ) — donde el mecanismo SÍ existe", cargar(INDICES));
  analizar("ACCIONES (control) — donde el mecanismo NO existe", cargar(ACCIONES));
  console.log(`\nSi el filtro "funciona" igual en el control, no estamos midiendo gamma sino otra cosa.`);
})();
