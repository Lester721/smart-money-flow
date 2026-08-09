// 0DTE, PASO 2 — el backtest de verdad, con entrada INTRADÍA.
//
// Lo que esto añade sobre el paso 1: allí entrábamos al cierre y liquidábamos al cierre siguiente,
// cargando el HUECO DE LA NOCHE que el 0DTE real no tiene. Aquí se entra a una hora concreta del
// día y se liquida al cierre de ESE mismo día. Es la prueba que decide.
//
// SIN MIRAR EL FUTURO — el punto que hace honesto (o no) este backtest:
// La señal de EVA se calcula con el flujo del día D. Usarla para entrar a las 11:00 del día D
// sería imposible en la vida real. Así que la señal y la gamma salen del CIERRE DEL DÍA ANTERIOR
// y se opera el 0DTE del día siguiente. Que es además como se haría de verdad: miras el flujo de
// ayer y operas por la mañana.
//
// TIEMPO EN AÑOS: rv está anualizada con sqrt(252) sobre retornos DIARIOS, así que un día hábil
// es 1/252 de año. Si quedan M minutos para el cierre de una sesión de 390, el tiempo a
// vencimiento es (M/390)/252. Usar 1/365 aquí mezclaría dos convenciones y daría primas mal.
//
// Uso: node --import tsx scripts/odte-2-backtest.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, WIDTH_EM, type DBar } from "../lib/backtestCore";
import { bsPrice, bsGamma } from "../lib/blackScholes";

const DIR = "scripts/cache-theta";
const TICKER = "SPY";
const HORAS = [9 * 60 + 45, 10 * 60, 10 * 60 + 30, 11 * 60, 11 * 60 + 30, 12 * 60, 13 * 60, 14 * 60];
const CIERRE = 16 * 60;
const MIN_SESION = 390;
const SIGMA = 1;
const RIESGO = 1200, COMM = 0.65, CATASTROFE = -0.5;
// El slippage decide en 0DTE: la prima es pequena y el bid/ask pesa mucho. Es la objecion
// principal de la literatura (condor 0DTE: Sharpe bruto +0,77 -> NETO -0,20).
const SLIP = Number(process.env.ODTE_SLIP ?? 0.02);

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
type SerieDia = Record<string, [number, number][]>;
type OiExp = Record<string, Record<string, Record<string, [number, number]>>>;

/** Precio en (o justo antes de) el minuto pedido. */
function spotEn(serie: [number, number][], min: number): number | null {
  let best: number | null = null;
  for (const [m, p] of serie) { if (m > min) break; best = p; }
  return best;
}

/**
 * Iron condor 0DTE: se abre a `minEntrada` y se liquida al cierre del MISMO día.
 *
 * `emEsperado` es el movimiento esperado EN DÓLARES para esa ventana, estimado con los días
 * ANTERIORES. NO se extrapola la volatilidad diaria: medido sobre 1.053 días, el movimiento real
 * de 11:00 al cierre es 0,563 veces el que predice la vol diaria, cuando debería ser 0,798
 * (= E|X| de una normal). O sea que la diaria SOBREESTIMA la tarde un 42% — porque una parte
 * grande de la varianza diaria es el hueco de la noche, que dentro del día no ocurre.
 *
 * Usarla habría puesto los strikes un 40% más lejos de lo debido: casi nunca se rompen, y salen
 * +25% con 0% de catástrofes. Ese número sería del modelo, no del mercado.
 */
function condor0dte(spot: number, emEsperado: number, minEntrada: number, spotCierre: number): number | null {
  const minRestantes = CIERRE - minEntrada;
  if (minRestantes <= 0) return null;
  const T = (minRestantes / MIN_SESION) / 252;          // años, en tiempo de MERCADO
  const em = emEsperado;
  if (!(em > 0)) return null;
  // Black-Scholes necesita una sigma: se despeja de la que reproduce ESTE movimiento esperado.
  const rv = em / (spot * Math.sqrt(T));

  const sp = spot - SIGMA * em, lp = sp - WIDTH_EM * em;
  const sc = spot + SIGMA * em, lc = sc + WIDTH_EM * em;
  if (lp <= 0) return null;

  const credit = (bsPrice(spot, sp, T, rv, "put") - bsPrice(spot, lp, T, rv, "put"))
    + (bsPrice(spot, sc, T, rv, "call") - bsPrice(spot, lc, T, rv, "call"));
  const width = WIDTH_EM * em;
  const netCredit = credit * (1 - SLIP) - (COMM * 4) / 100;
  const risk = width - netCredit;
  if (!(credit > 0) || !(netCredit > 0) || !(risk > 0)) return null;

  const perdPut = Math.max(sp - spotCierre, 0) - Math.max(lp - spotCierre, 0);
  const perdCall = Math.max(spotCierre - sc, 0) - Math.max(spotCierre - lc, 0);
  return (netCredit - (perdPut + perdCall)) / risk;
}

(async () => {
  // ── Datos ────────────────────────────────────────────────────────────────────────────────
  const trozos: DBar[] = [];
  for (const f of readdirSync(DIR)) {
    if (f.startsWith(`${TICKER}_barsPAR_y_`) && f.endsWith(".json")) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
  }
  const bars = [...new Map(trozos.map((x) => [x.time, x] as const)).values()].sort((a, b) => (a.time < b.time ? -1 : 1));
  const idxDe = new Map(bars.map((b, i) => [b.time, i] as const));

  const intradia: SerieDia = {};
  for (const f of readdirSync(DIR)) {
    if (f.startsWith(`${TICKER}_spotmin_y_`) && f.endsWith(".json")) Object.assign(intradia, leer<SerieDia>(`${DIR}/${f}`) ?? {});
  }
  const oi: OiExp = {};
  for (const f of readdirSync(DIR)) {
    if (f.startsWith(`${TICKER}_oiexp_y_`) && f.endsWith(".json")) Object.assign(oi, leer<OiExp>(`${DIR}/${f}`) ?? {});
  }
  const trades: unknown[] = [];
  for (const f of readdirSync(DIR)) {
    if (f.startsWith(`${TICKER}_y_`) && f.endsWith(".json")) { const y = leer<unknown[]>(`${DIR}/${f}`); if (y?.length) trades.push(...y); }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sigs = signals(classifyFlow(trades as any, new Date()).rows, bars);
  const k = Math.floor(sigs.length / 3);
  const top = new Set(
    [...sigs].sort((a, b) => a.evaComp - b.evaComp).slice(sigs.length - k)
      .filter((s) => s.ivRatio < 1.1).map((s) => bars[s.entryIdx].time),
  );
  const rvDe = new Map(sigs.map((s) => [bars[s.entryIdx].time, s.rv] as const));

  // ── Se arma un caso por DÍA OPERADO: señal y gamma del cierre ANTERIOR ───────────────────
  interface Caso { ymd: string; rv: number; gex: number; señal: boolean; serie: [number, number][]; cierre: number }
  const casos: Caso[] = [];
  let sinIntradia = 0, sinPrevio = 0;
  for (const [ymd, serie] of Object.entries(intradia)) {
    const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    const i = idxDe.get(iso);
    if (i == null || i < 1) { sinPrevio++; continue; }
    const previo = bars[i - 1].time;                       // el día ANTERIOR: lo único conocido al abrir
    const rv = rvDe.get(previo);
    if (rv == null || !(rv > 0)) { sinPrevio++; continue; }

    const porExp = oi[previo.replace(/-/g, "")];
    if (!porExp) { sinIntradia++; continue; }
    const spotPrev = bars[i - 1].close;
    let gex = 0;
    const Tg = 1 / 365;
    for (const porStrike of Object.values(porExp)) {
      for (const [kStr, [oiC, oiP]] of Object.entries(porStrike)) {
        const g = bsGamma(spotPrev, Number(kStr), Tg, rv);
        if (g > 0) gex += g * (oiC - oiP) * 100 * spotPrev * spotPrev * 0.01;
      }
    }
    const cierre = serie[serie.length - 1]?.[1];
    if (!(cierre > 0)) continue;
    casos.push({ ymd, rv, gex: gex / (spotPrev * spotPrev), señal: top.has(previo), serie, cierre });
  }

  console.log(`\n## 0DTE paso 2 — backtest con entrada INTRADÍA · ${TICKER}\n`);
  console.log(`${casos.length} días operables · señal y gamma del CIERRE ANTERIOR (sin mirar el futuro)`);
  console.log(`descartados: ${sinPrevio} sin día previo o sin rv · ${sinIntradia} sin OI del día previo`);
  console.log(`costes: slippage ${SLIP * 100}% + $${COMM}/contrato × 4 patas\n`);
  if (casos.length < 200) { console.log("muestra insuficiente"); return; }

  const años = (a: Caso[]) => {
    const f = a.map((c) => c.ymd).sort();
    return (Date.parse(`${f[f.length - 1].slice(0, 4)}-${f[f.length - 1].slice(4, 6)}-${f[f.length - 1].slice(6, 8)}`)
      - Date.parse(`${f[0].slice(0, 4)}-${f[0].slice(4, 6)}-${f[0].slice(6, 8)}`)) / (365.25 * 86_400_000);
  };

  // VOLATILIDAD INTRADÍA, estimada solo con el PASADO. Para cada hora de entrada se guarda el
  // histórico de |log(cierre/spot_entrada)| y se usa la desviación de los 20 días anteriores.
  // Nada de esto mira hacia adelante: el día D se valora con lo ocurrido hasta D−1.
  const porFechaOrden = [...casos].sort((a, b) => (a.ymd < b.ymd ? -1 : 1));
  const histPorHora = new Map<number, { ymd: string; lr: number }[]>();
  for (const min of HORAS) {
    const h: { ymd: string; lr: number }[] = [];
    for (const c of porFechaOrden) {
      const s = spotEn(c.serie, min);
      if (s != null && s > 0 && c.cierre > 0) h.push({ ymd: c.ymd, lr: Math.log(c.cierre / s) });
    }
    histPorHora.set(min, h);
  }
  /** Movimiento esperado en $ para esa hora y ese día, con los 20 días previos. */
  const emDe = (ymd: string, min: number, spot: number): number | null => {
    const h = histPorHora.get(min);
    if (!h) return null;
    const i = h.findIndex((x) => x.ymd === ymd);
    if (i < 20) return null;
    const prev = h.slice(i - 20, i).map((x) => x.lr);
    const m = prev.reduce((s, x) => s + x, 0) / prev.length;
    const sd = Math.sqrt(prev.reduce((s, x) => s + (x - m) ** 2, 0) / (prev.length - 1));
    return sd > 0 ? spot * sd : null;
  };

  const evaluar = (sub: Caso[], min: number) => {
    const r: number[] = [];
    for (const c of sub) {
      const s = spotEn(c.serie, min);
      if (s == null) continue;
      const em = emDe(c.ymd, min, s);
      if (em == null) continue;
      const p = condor0dte(s, em, min, c.cierre);
      if (p != null) r.push(p);
    }
    if (r.length < 20) return null;
    const m = media(r) * 100;
    return { n: r.length, m, cat: (r.filter((x) => x <= CATASTROFE).length / r.length) * 100, porAño: (r.length / años(sub)) * (m / 100) * RIESGO };
  };

  // ── El barrido de horas, en tres poblaciones ─────────────────────────────────────────────
  const universos: [string, Caso[]][] = [
    ["TODOS los días", casos],
    ["solo gamma POSITIVA", casos.filter((c) => c.gex > 0)],
    ["gamma positiva + señal EVA", casos.filter((c) => c.gex > 0 && c.señal)],
  ];
  for (const [nombre, sub] of universos) {
    console.log(`### ${nombre} — ${sub.length} días\n`);
    console.log("| Entrada | n | Media | Catástrofes | $/año |");
    console.log("|---|---|---|---|---|");
    for (const min of HORAS) {
      const r = evaluar(sub, min);
      if (!r) { console.log(`| ${hhmm(min)} | — | — | — | — |`); continue; }
      console.log(`| ${hhmm(min)}${min === 11 * 60 ? " ←la tuya" : ""} | ${r.n} | ${r.m >= 0 ? "+" : ""}${r.m.toFixed(2)}% | ${r.cat.toFixed(1)}% | $${Math.round(r.porAño).toLocaleString("en-US")} |`);
    }
    console.log("");
  }

  // ── Validación fuera de muestra de la mejor hora ─────────────────────────────────────────
  console.log(`### VALIDACIÓN — la hora se elige en la mitad VIEJA y se mide en la NUEVA\n`);
  for (const [nombre, sub] of universos) {
    const orden = [...sub].sort((a, b) => (a.ymd < b.ymd ? -1 : 1));
    const mid = Math.floor(orden.length / 2);
    const [vj, nv] = [orden.slice(0, mid), orden.slice(mid)];
    let mejor = HORAS[0], mejorV = -Infinity;
    for (const min of HORAS) { const r = evaluar(vj, min); if (r && r.m > mejorV) { mejorV = r.m; mejor = min; } }
    const enNueva = evaluar(nv, mejor);
    console.log(`   ${nombre}: elegida **${hhmm(mejor)}** (${mejorV.toFixed(2)}% en la vieja) → en la NUEVA ${enNueva ? `${enNueva.m >= 0 ? "+" : ""}${enNueva.m.toFixed(2)}%` : "sin muestra"}`);
  }
  console.log(`\n   Si la hora ganadora cambia entre mitades, la hora NO importa — y eso también es`);
  console.log(`   un resultado: significa que lo que decide es el filtro, no el reloj.`);
})();
