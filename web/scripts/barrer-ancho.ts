// BARRIDO DEL ANCHO — la única dimensión que nunca hemos tocado.
//
// `WIDTH_EM = 0.5` ha sido constante en TODO el proyecto. Y ahí está el problema: se pide 0,5σ
// de ancho ($7 en SPY) y los strikes listados dan $14. Se coge el doble de riesgo del que se
// quería, con el mismo crédito.
//
// LA CUENTA QUE LO DECIDE: con win rate w, el equilibrio exige cobrar (1−w) del ancho.
//   95% de aciertos → hace falta cobrar el 5% del ancho. Medido: 3-4%. Hueco de 1-2 puntos.
//
// Aquí el ancho se mide en PASOS DE STRIKE (1 = strikes adyacentes), no en sigmas — porque la
// granularidad de la cadena es justo lo que rompía el calculo.
//
// Uso: node --import tsx scripts/barrer-ancho.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, barIdxOnOrAfter, type DBar, type Signal } from "../lib/backtestCore";

const DIR = "scripts/cache-theta", CDIR = `${DIR}/cadenas`;
const TICKERS = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "TSLA", "AMD"];
const DTE = Number(process.env.AN_DTE ?? 21);
const DISTS = [1.0, 1.25, 1.5];
const PASOS = [1, 2, 3, 5, 8];              // ancho en pasos de strike
const COMM = 0.03, RIESGO = 900;            // 1,5% de $60k

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
type CadenaDia = Record<string, Record<string, [number, number]>>;

interface R { ms: number; r: number; credWidth: number }

(async () => {
  // clave "dist|pasos" → resultados
  const celdas = new Map<string, R[]>();
  for (const d of DISTS) for (const p of PASOS) celdas.set(`${d}|${p}`, []);

  for (const t of TICKERS) {
    const trozos: DBar[] = [];
    for (const f of readdirSync(DIR)) if (f.startsWith(`${t}_barsPAR_y_`)) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
    const bars = [...new Map(trozos.map((x) => [x.time, x] as const)).values()].sort((a, b) => (a.time < b.time ? -1 : 1));
    const trades: unknown[] = [];
    for (const f of readdirSync(DIR)) if (f.startsWith(`${t}_y_`) && f.endsWith(".json")) { const y = leer<unknown[]>(`${DIR}/${f}`); if (y?.length) trades.push(...y); }
    if (bars.length < 300 || !trades.length) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sigs: Signal[] = signals(classifyFlow(trades as any, new Date()).rows, bars);
    // Top⅓ de convicción — que es donde el win rate llega al 91-95%.
    const k = Math.floor(sigs.length / 3);
    const top = [...sigs].sort((a, b) => a.evaComp - b.evaComp).slice(sigs.length - k);

    for (const sig of top) {
      const entrada = bars[sig.entryIdx].time.replace(/-/g, "");
      const cad = leer<CadenaDia>(`${CDIR}/${t}_d${entrada}.json`);
      if (!cad) continue;
      const em = sig.spot * sig.rv * Math.sqrt(DTE / 365);
      if (!(em > 0)) continue;
      const objetivo = new Date(Date.parse(`${bars[sig.entryIdx].time}T12:00:00Z`) + DTE * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
      const exp = Object.keys(cad).sort().find((e) => e >= objetivo);
      if (!exp) continue;
      const expIdx = barIdxOnOrAfter(bars, Date.parse(`${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}T20:00:00Z`));
      if (expIdx < 0) continue;
      const bull = sig.dir === 1, right = bull ? "P" : "C";
      const ks = Object.keys(cad[exp]).filter((x) => x.endsWith(`|${right}`)).map((x) => Number(x.split("|")[0])).sort((a, b) => a - b);
      if (ks.length < 12) continue;
      const sExp = bars[expIdx].close;

      for (const dist of DISTS) {
        const objK = bull ? sig.spot - dist * em : sig.spot + dist * em;
        // Indice del strike corto dentro de la lista ordenada.
        let iC = 0, mejor = Infinity;
        for (let i = 0; i < ks.length; i++) { const d2 = Math.abs(ks[i] - objK); if (d2 < mejor) { mejor = d2; iC = i; } }
        const kC = ks[iC];
        for (const pasos of PASOS) {
          // La pata larga está `pasos` strikes MÁS LEJOS del dinero.
          const iL = bull ? iC - pasos : iC + pasos;
          if (iL < 0 || iL >= ks.length) continue;
          const kL = ks[iL];
          const q1 = cad[exp][`${kC}|${right}`], q2 = cad[exp][`${kL}|${right}`];
          if (!q1 || !q2) continue;
          const credito = (q1[0] + q1[1]) / 2 - (q2[0] + q2[1]) / 2 - (COMM * 2) / 100;
          const ancho = Math.abs(kL - kC), riesgo = ancho - credito;
          if (!(credito > 0) || !(riesgo > 0)) continue;
          if (credito > 0.5 * ancho) continue;
          if (!((q1[1] - q1[0]) / ((q1[1] + q1[0]) / 2) < 0.5)) continue;
          const perd = bull ? Math.max(kC - sExp, 0) - Math.max(kL - sExp, 0) : Math.max(sExp - kC, 0) - Math.max(sExp - kL, 0);
          celdas.get(`${dist}|${pasos}`)!.push({ ms: sig.entryMs, r: (credito - perd) / riesgo, credWidth: credito / ancho });
        }
      }
    }
  }

  console.log(`\n## BARRIDO DEL ANCHO · ${DTE} días · Top⅓ de convicción · precios reales\n`);
  console.log(`El ancho va en PASOS DE STRIKE (1 = adyacentes). La cuenta: con win w, el`);
  console.log(`equilibrio exige cobrar (1−w) del ancho.\n`);
  console.log(`| Distancia | Ancho | n | Media | Win | Cobra % ancho | Necesita | $/año |`);
  console.log(`|---|---|---|---|---|---|---|---|`);
  const buenas: string[] = [];
  for (const dist of DISTS) {
    for (const pasos of PASOS) {
      const g = celdas.get(`${dist}|${pasos}`)!;
      if (g.length < 200) continue;
      const o = [...g].sort((a, b) => a.ms - b.ms);
      const mid = Math.floor(o.length / 2);
      const m = media(g.map((x) => x.r)) * 100;
      const win = g.filter((x) => x.r > 0).length / g.length;
      const cobra = media(g.map((x) => x.credWidth));
      const años = (o[o.length - 1].ms - o[0].ms) / (365.25 * 86_400_000);
      const porAño = (g.length / años) * (m / 100) * RIESGO;
      const v = media(o.slice(0, mid).map((x) => x.r)) * 100, n2 = media(o.slice(mid).map((x) => x.r)) * 100;
      const ok = v > 0 && n2 > 0;
      if (ok) buenas.push(`${dist}σ · ancho ${pasos} → ${m.toFixed(2)}% (vieja ${v.toFixed(2)}, nueva ${n2.toFixed(2)}, n=${g.length}, $${Math.round(porAño).toLocaleString("en-US")}/año)`);
      console.log(`| ${dist}σ | ${pasos} paso${pasos > 1 ? "s" : ""} | ${g.length} | ${ok ? "**" : ""}${m >= 0 ? "+" : ""}${m.toFixed(2)}%${ok ? "**" : ""} | ${(win * 100).toFixed(0)}% | ${(cobra * 100).toFixed(1)}% | ${((1 - win) * 100).toFixed(1)}% | $${Math.round(porAño).toLocaleString("en-US")} |`);
    }
  }
  console.log(`\n### Positivas en las DOS mitades\n`);
  if (!buenas.length) console.log(`   NINGUNA.`);
  else for (const b of buenas) console.log(`   · ${b}`);
  console.log(`\n   "Cobra" tiene que superar a "Necesita". Es la condición matemática, no una opinión.`);
})();
