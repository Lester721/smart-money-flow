// 0DTE con PRECIOS REALES — se acabaron los supuestos.
//
// Hasta aquí el backtest valoraba con Black-Scholes y volatilidad realizada, y restaba un 2% de
// slippage inventado. Eso metía DOS supuestos grandes:
//   1. que la IV que cobras es igual a la volatilidad que va a ocurrir (prima de varianza = 0)
//   2. que cruzar el spread cuesta un 2%
// Los dos se caen aquí: se usan el bid y el ask que de verdad había a las 11:00.
//
// TRES FORMAS DE LLENARSE, de pesimista a optimista:
//   · AGRESIVO  — vendes al bid, compras al ask. Entras seguro, pagas el spread entero.
//   · MEDIO     — las dos patas al punto medio. Es lo que consigue una orden límite paciente.
//   · +25%      — a un cuarto del spread desde el medio, a tu favor. Realista con límite y algo
//                 de espera, que es como opera Lester (deja la orden puesta).
//
// Uso: node --import tsx scripts/odte-4-precios-reales.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, type DBar } from "../lib/backtestCore";
import { bsGamma } from "../lib/blackScholes";

const DIR = "scripts/cache-theta";
const TICKER = "SPY";
const ENTRADA = 11 * 60;
const RIESGO = 1200, COMM = 0.65, CATASTROFE = -0.5;

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const spotEn = (s: [number, number][], m: number) => { let b: number | null = null; for (const [x, p] of s) { if (x > m) break; b = p; } return b; };
type SerieDia = Record<string, [number, number][]>;
type QuotesDia = Record<string, Record<string, [number, number]>>;
type OiExp = Record<string, Record<string, Record<string, [number, number]>>>;

type Llenado = "agresivo" | "medio" | "cuarto";
/** Precio al que se ejecuta cada pata según el tipo de llenado. */
function precio(bid: number, ask: number, lado: "vende" | "compra", ll: Llenado): number {
  const mid = (bid + ask) / 2, medio = (ask - bid) / 2;
  if (ll === "medio") return mid;
  if (ll === "cuarto") return lado === "vende" ? mid - medio * 0.5 : mid + medio * 0.5;
  return lado === "vende" ? bid : ask;   // agresivo
}

interface Caso {
  ymd: string; gex: number; señal: boolean; cierre: number;
  kCorto: number; kLargo: number;
  qCorto: [number, number]; qLargo: [number, number];
}

(async () => {
  const trozos: DBar[] = [];
  for (const f of readdirSync(DIR)) {
    if (f.startsWith(`${TICKER}_barsPAR_y_`) && f.endsWith(".json")) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
  }
  const bars = [...new Map(trozos.map((x) => [x.time, x] as const)).values()].sort((a, b) => (a.time < b.time ? -1 : 1));
  const idxDe = new Map(bars.map((b, i) => [b.time, i] as const));
  const intradia: SerieDia = {}, quotes: QuotesDia = {}, oi: OiExp = {};
  for (const f of readdirSync(DIR)) {
    if (f.startsWith(`${TICKER}_spotmin_y_`)) Object.assign(intradia, leer<SerieDia>(`${DIR}/${f}`) ?? {});
    if (f.startsWith(`${TICKER}_q0dte_y_`)) Object.assign(quotes, leer<QuotesDia>(`${DIR}/${f}`) ?? {});
    if (f.startsWith(`${TICKER}_oiexp_y_`)) Object.assign(oi, leer<OiExp>(`${DIR}/${f}`) ?? {});
  }
  const trades: unknown[] = [];
  for (const f of readdirSync(DIR)) {
    if (f.startsWith(`${TICKER}_y_`) && f.endsWith(".json")) { const y = leer<unknown[]>(`${DIR}/${f}`); if (y?.length) trades.push(...y); }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sigs = signals(classifyFlow(trades as any, new Date()).rows, bars);
  const k3 = Math.floor(sigs.length / 3);
  const top = new Set([...sigs].sort((a, b) => a.evaComp - b.evaComp).slice(sigs.length - k3)
    .filter((s) => s.ivRatio < 1.1).map((s) => bars[s.entryIdx].time));
  // La rv se calcula de las BARRAS, no del mapa de señales de EVA. Sacarla de las señales
  // descartaba 453 días — casi la mitad de la muestra — solo porque EVA no había emitido señal
  // ese día. La estrategia de gamma no necesita a EVA para nada; atarla a sus señales era una
  // restricción artificial que además sesga la muestra hacia los días que a EVA le llaman la
  // atención.
  const rvEn = (i: number): number | null => {
    if (i < 21) return null;
    const lr: number[] = [];
    for (let j = i - 20; j <= i; j++) if (bars[j - 1]?.close > 0 && bars[j].close > 0) lr.push(Math.log(bars[j].close / bars[j - 1].close));
    if (lr.length < 15) return null;
    const m = lr.reduce((a, x) => a + x, 0) / lr.length;
    return Math.sqrt(lr.reduce((a, x) => a + (x - m) ** 2, 0) / (lr.length - 1)) * Math.sqrt(252);
  };

  const casos: Caso[] = [];
  let sinRv = 0, sinOi = 0;
  for (const ymd of Object.keys(quotes).sort()) {
    const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    const i = idxDe.get(iso);
    if (i == null || i < 1) continue;
    const previo = bars[i - 1].time;
    const rv = rvEn(i - 1);
    if (rv == null || !(rv > 0)) { sinRv++; continue; }
    const porExp = oi[previo.replace(/-/g, "")];
    if (!porExp) { sinOi++; continue; }
    const serie = intradia[ymd];
    const cierre = serie?.[serie.length - 1]?.[1];
    if (!(cierre > 0)) continue;

    const strikes = Object.keys(quotes[ymd]).map(Number).sort((a, b) => a - b);
    if (strikes.length < 2) continue;

    const spotPrev = bars[i - 1].close;
    let gex = 0;
    for (const porStrike of Object.values(porExp)) {
      for (const [kStr, [oiC, oiP]] of Object.entries(porStrike)) {
        const g = bsGamma(spotPrev, Number(kStr), 1 / 365, rv);
        if (g > 0) gex += g * (oiC - oiP) * 100 * spotPrev * spotPrev * 0.01;
      }
    }
    casos.push({
      ymd, gex: gex / (spotPrev * spotPrev), señal: top.has(previo), cierre,
      kCorto: strikes[0], kLargo: strikes[1],
      qCorto: quotes[ymd][String(strikes[0])], qLargo: quotes[ymd][String(strikes[1])],
    });
  }

  console.log(`\n## 0DTE con PRECIOS REALES (bid/ask) · ${TICKER} · ${casos.length} días\n`);
  console.log(`descartados: ${sinRv} sin rv previa · ${sinOi} sin OI previo`);
  console.log(`Sin Black-Scholes y sin slippage inventado: se usa lo que de verdad cotizaba a las 11:00.\n`);
  if (casos.length < 200) { console.log("muestra insuficiente"); return; }

  const años = (a: Caso[]) => {
    const f = a.map((c) => c.ymd).sort();
    const d = (s: string) => Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
    return (d(f[f.length - 1]) - d(f[0])) / (365.25 * 86_400_000);
  };
  const evaluar = (sub: Caso[], ll: Llenado, maxSpread = Infinity) => {
    const r: number[] = [];
    for (const c of sub) {
      const [b1, a1] = c.qCorto, [b2, a2] = c.qLargo;
      if (!(b1 > 0) || !(a1 > 0) || !(a2 > 0)) continue;
      const spreadRel = (a1 - b1) / ((a1 + b1) / 2);
      if (spreadRel > maxSpread) continue;                    // el filtro de spread
      const credito = precio(b1, a1, "vende", ll) - precio(b2, a2, "compra", ll) - (COMM * 2) / 100;
      const ancho = c.kLargo - c.kCorto;
      const riesgo = ancho - credito;
      if (!(credito > 0) || !(riesgo > 0)) continue;          // sin prima tras costes: no se opera
      const perd = Math.max(c.cierre - c.kCorto, 0) - Math.max(c.cierre - c.kLargo, 0);
      r.push((credito - perd) / riesgo);
    }
    if (r.length < 25) return null;
    const m = media(r) * 100;
    return { n: r.length, m, cat: (r.filter((x) => x <= CATASTROFE).length / r.length) * 100, porAño: (r.length / años(sub)) * (m / 100) * RIESGO };
  };

  const universos: [string, Caso[]][] = [
    ["TODOS los días", casos],
    ["solo gamma POSITIVA", casos.filter((c) => c.gex > 0)],
    ["gamma+ y señal EVA", casos.filter((c) => c.gex > 0 && c.señal)],
  ];

  console.log(`### Resultado con precios reales\n`);
  console.log("| Universo | Llenado | n | Media | Catástrofes | $/año |");
  console.log("|---|---|---|---|---|---|");
  for (const [nombre, sub] of universos) {
    for (const ll of ["agresivo", "medio", "cuarto"] as Llenado[]) {
      const r = evaluar(sub, ll);
      if (!r) { console.log(`| ${nombre} | ${ll} | — | — | — | — |`); continue; }
      console.log(`| ${nombre} | ${ll} | ${r.n} | ${r.m >= 0 ? "+" : ""}${r.m.toFixed(2)}% | ${r.cat.toFixed(1)}% | $${Math.round(r.porAño).toLocaleString("en-US")} |`);
    }
  }

  // ── El filtro de spread: no entrar cuando el mercado está caro de cruzar ─────────────────
  console.log(`\n### Filtro de spread máximo (llenado "medio", gamma positiva)\n`);
  console.log("| Spread máximo | n | Media | Catástrofes | $/año |");
  console.log("|---|---|---|---|---|");
  const gPos = casos.filter((c) => c.gex > 0);
  for (const ms of [Infinity, 0.20, 0.15, 0.10, 0.07, 0.05]) {
    const r = evaluar(gPos, "medio", ms);
    if (!r) { console.log(`| ${ms === Infinity ? "sin filtro" : `${(ms * 100).toFixed(0)}%`} | — | — | — | — |`); continue; }
    console.log(`| ${ms === Infinity ? "sin filtro" : `${(ms * 100).toFixed(0)}%`} | ${r.n} | ${r.m >= 0 ? "+" : ""}${r.m.toFixed(2)}% | ${r.cat.toFixed(1)}% | $${Math.round(r.porAño).toLocaleString("en-US")} |`);
  }

  // ── Validación en las dos mitades ───────────────────────────────────────────────────────
  console.log(`\n### VALIDACIÓN — las dos mitades (llenado "medio")\n`);
  console.log("| Universo | vieja | nueva | ¿aguanta? |");
  console.log("|---|---|---|---|");
  for (const [nombre, sub] of universos) {
    const orden = [...sub].sort((a, b) => (a.ymd < b.ymd ? -1 : 1));
    const mid = Math.floor(orden.length / 2);
    const v = evaluar(orden.slice(0, mid), "medio"), n = evaluar(orden.slice(mid), "medio");
    const ok = v && n && v.m > 0 && n.m > 0;
    console.log(`| ${nombre} | ${v ? `${v.m >= 0 ? "+" : ""}${v.m.toFixed(2)}%` : "—"} | ${n ? `${n.m >= 0 ? "+" : ""}${n.m.toFixed(2)}%` : "—"} | ${ok ? "**SÍ**" : "no"} |`);
  }
})();
