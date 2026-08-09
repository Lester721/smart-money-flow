// ¿LA CONVICCIÓN DE EVA SEPARA CON PRECIOS REALES?
//
// Es el cimiento de todo el proyecto y NUNCA se ha comprobado sin el modelo. Lo único que
// sabemos —Top⅓ +2,3% contra Bottom⅓ −3,7%— se midió con Black-Scholes, el mismo modelo que
// infla los resultados entre 5 y 6 puntos.
//
// Si EVA separa, el filtro vale aunque el vehículo no dé dinero: habría que buscar otra forma de
// cobrarlo. Si NO separa, EVA no aporta nada y todo lo construido encima —incluido el Wheel—
// carece de base.
//
// Se compara el MISMO vehículo en los tres tercios de convicción. Da igual que la media sea
// baja: lo que se mide es la DIFERENCIA entre tercios.
//
// Uso: node --import tsx scripts/eva-sigue-separando.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, WIDTH_EM, barIdxOnOrAfter, type DBar, type Signal } from "../lib/backtestCore";

const DIR = "scripts/cache-theta", CDIR = `${DIR}/cadenas`;
const TICKERS = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "TSLA", "AMD"];
const DTE = Number(process.env.EVA_DTE ?? 21), DIST = Number(process.env.EVA_DIST ?? 1.5);
const COMM = 0.03;

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
type CadenaDia = Record<string, Record<string, [number, number]>>;

interface Op { ms: number; eva: number; r: number; t: string; credWidth: number }

(async () => {
  const ops: Op[] = [];
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
      if (!cad) continue;                                    // sin cadena de ese día: se salta
      const em = sig.spot * sig.rv * Math.sqrt(DTE / 365);
      if (!(em > 0)) continue;
      const objetivo = new Date(Date.parse(`${bars[sig.entryIdx].time}T12:00:00Z`) + DTE * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
      const exp = Object.keys(cad).sort().find((e) => e >= objetivo);
      if (!exp) continue;
      const expIdx = barIdxOnOrAfter(bars, Date.parse(`${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}T20:00:00Z`));
      if (expIdx < 0) continue;
      const bull = sig.dir === 1, right = bull ? "P" : "C";
      const ks = Object.keys(cad[exp]).filter((x) => x.endsWith(`|${right}`)).map((x) => Number(x.split("|")[0])).sort((a, b) => a - b);
      if (ks.length < 5) continue;
      const cerca = (arr: number[], x: number) => arr.reduce((b, k) => (Math.abs(k - x) < Math.abs(b - x) ? k : b), arr[0]);
      const kC = cerca(ks, bull ? sig.spot - DIST * em : sig.spot + DIST * em);
      const cand = ks.filter((x) => (bull ? x < kC : x > kC));
      if (!cand.length) continue;
      const kL = cerca(cand, bull ? kC - WIDTH_EM * em : kC + WIDTH_EM * em);
      if (kC === kL) continue;
      const q1 = cad[exp][`${kC}|${right}`], q2 = cad[exp][`${kL}|${right}`];
      if (!q1 || !q2) continue;
      const credito = (q1[0] + q1[1]) / 2 - (q2[0] + q2[1]) / 2 - (COMM * 2) / 100;
      const ancho = Math.abs(kL - kC), riesgo = ancho - credito;
      if (!(credito > 0) || !(riesgo > 0)) continue;
      if (credito > 0.5 * ancho) continue;                              // cotización rota
      if (!((q1[1] - q1[0]) / ((q1[1] + q1[0]) / 2) < 0.5)) continue;   // sin mercado
      const sExp = bars[expIdx].close;
      const perd = bull ? Math.max(kC - sExp, 0) - Math.max(kL - sExp, 0) : Math.max(sExp - kC, 0) - Math.max(sExp - kL, 0);
      ops.push({ ms: sig.entryMs, eva: sig.evaComp, r: (credito - perd) / riesgo, t, credWidth: credito / ancho });
    }
  }

  console.log(`\n## ¿EVA separa con PRECIOS REALES? · ${DTE}d @${DIST}σ · ${ops.length} señales\n`);
  if (ops.length < 300) { console.log(`muestra insuficiente (${ops.length}) — falta descarga`); return; }

  const porEva = [...ops].sort((a, b) => a.eva - b.eva);
  const k = Math.floor(porEva.length / 3);
  const grupos: [string, Op[]][] = [
    ["Bottom⅓ (baja convicción)", porEva.slice(0, k)],
    ["Medio", porEva.slice(k, 2 * k)],
    ["**Top⅓ (alta convicción)**", porEva.slice(2 * k)],
  ];

  console.log("| Tercio de convicción | n | Media | Win | vieja | nueva |");
  console.log("|---|---|---|---|---|---|");
  const medias: number[] = [];
  for (const [nom, g] of grupos) {
    const o = [...g].sort((a, b) => a.ms - b.ms);
    const mid = Math.floor(o.length / 2);
    const m = media(g.map((x) => x.r)) * 100;
    medias.push(m);
    const v = media(o.slice(0, mid).map((x) => x.r)) * 100, n2 = media(o.slice(mid).map((x) => x.r)) * 100;
    const win = (g.filter((x) => x.r > 0).length / g.length) * 100;
    console.log(`| ${nom} | ${g.length} | ${m >= 0 ? "+" : ""}${m.toFixed(2)}% | ${win.toFixed(0)}% | ${v >= 0 ? "+" : ""}${v.toFixed(2)}% | ${n2 >= 0 ? "+" : ""}${n2.toFixed(2)}% |`);
  }

  const sep = medias[2] - medias[0];
  const monotona = medias[0] < medias[1] && medias[1] < medias[2];
  console.log(`\n   separación Top⅓ − Bottom⅓: **${sep >= 0 ? "+" : ""}${sep.toFixed(2)} puntos**`);
  console.log(`   monótona entre los tres tercios: ${monotona ? "SÍ" : "NO"}`);
  console.log(`\n   → ${sep > 1 && monotona
    ? "EVA SIGUE SEPARANDO con precios reales. El filtro vale aunque el vehículo no dé dinero:\n     habría que buscar otra forma de cobrarlo."
    : sep > 0 ? "Separa poco. Con esta magnitud no sostiene una estrategia por sí sola."
    : "EVA NO SEPARA con precios reales. El filtro no aporta, y lo construido encima —Wheel\n     incluido— no tiene base."}`);
  console.log(`\n   Con Black-Scholes daba +2,3% contra −3,7% (6 puntos). Ese era el numero a batir.`);
})();
