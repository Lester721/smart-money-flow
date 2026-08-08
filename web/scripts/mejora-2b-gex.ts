// MEJORA #2 — ¿conviene vender EN UN MURO DE GAMMA en vez de a 1σ?
//
// LA IDEA: hoy el strike corto se coloca a `spot − 1σ` sin mirar dónde está el dinero. La
// teoría del GEX dice que los strikes con mucho open interest actúan como imanes/frenos: los
// market makers que están cortos de gamma tienen que comprar cuando el precio cae hacia el
// muro, lo que amortigua el movimiento. Vender AHÍ debería tener menos probabilidad de que te
// pasen por encima.
//
// Es la primera prueba que usa el OI histórico bajado esta noche (22.427 días).
//
// GEX por strike = gamma(BS) × OI × 100 × spot² × 0.01, con signo (+call, −put). El muro es el
// strike con más |GEX| en la zona útil.
//
// CRITERIOS FIJADOS ANTES DE CORRER:
//   · Solo muros del lado correcto (por debajo si es alcista, por encima si es bajista).
//   · Solo entre 0.5σ y 2σ. Más cerca es suicidio (te pasan seguro), más lejos no paga prima.
//   · Sirve solo si mejora la media Y aguanta las DOS mitades OOS. Sin lo segundo es ruido.
//
// Uso: npx tsx scripts/mejora-2b-gex.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, WIDTH_EM, type DBar, type Signal } from "../lib/backtestCore";
import { bsPrice, bsGamma } from "../lib/blackScholes";

const TICKERS = (process.env.BT_TICKERS || "SPY,AAPL,MSFT,NVDA,META,TSLA,AMD,QQQ,HOOD").split(",");
const DTE = 5, SIGMA = 1;
const RIESGO = Number(process.env.G_RIESGO) || 1200;
const REJILLA_FIJA = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const AÑOS = 10.5;
const DIR = "scripts/cache-theta";
const BT_START = "20160101", BT_END = "20260731";

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

/** fecha "YYYYMMDD" → strike → [oiCalls, oiPuts] */
type OiTicker = Map<string, Record<string, [number, number]>>;

function cargarOi(t: string): OiTicker {
  const m: OiTicker = new Map();
  for (const f of readdirSync(DIR)) {
    if (!f.startsWith(`${t}_oi_y_`) || !f.endsWith(".json")) continue;
    const d = leer<Record<string, Record<string, [number, number]>>>(`${DIR}/${f}`) ?? {};
    for (const [dia, porStrike] of Object.entries(d)) m.set(dia, porStrike);
  }
  return m;
}
function cargarBarras(t: string): DBar[] {
  const trozos: DBar[] = [];
  for (const f of readdirSync(DIR)) {
    if (!f.startsWith(`${t}_barsPAR_y_`) || !f.endsWith(".json")) continue;
    for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
  }
  const porFecha = new Map(trozos.map((x) => [x.time, x] as const));
  return [...porFecha.values()].sort((a, b) => (a.time < b.time ? -1 : 1));
}

/**
 * Strike del MURO de gamma en el lado que interesa, o null si no hay ninguno en la zona útil.
 * `bull` = vendemos put spread abajo → muros por DEBAJO del spot.
 */
function muroGamma(
  porStrike: Record<string, [number, number]>,
  spot: number, em: number, T: number, iv: number, bull: boolean,
  minSig: number, maxSig: number,
): number | null {
  let mejor: number | null = null, mejorPeso = 0;
  for (const [kStr, [oiC, oiP]] of Object.entries(porStrike)) {
    const k = Number(kStr);
    if (!(k > 0)) continue;
    const dist = bull ? (spot - k) / em : (k - spot) / em;   // en unidades de σ, hacia el lado bueno
    if (!(dist >= minSig && dist <= maxSig)) continue;
    const g = bsGamma(spot, k, T, iv);
    if (!(g > 0)) continue;
    // |GEX| del strike: pesa el OI de las dos patas — el muro lo forma todo el interés abierto,
    // no solo el lado que vamos a vender.
    const peso = g * (oiC + oiP) * 100 * spot * spot * 0.01;
    if (peso > mejorPeso) { mejorPeso = peso; mejor = k; }
  }
  return mejor;
}

/** P&L del credit spread con el strike corto DADO (no calculado a 1σ). */
function pnlConStrike(sig: Signal, bars: DBar[], dte: number, shortK: number, em: number): number | null {
  const { spot, rv, entryIdx, dir } = sig;
  const bull = dir === 1;
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
  const shortIntr = bull ? Math.max(shortK - sExp, 0) : Math.max(sExp - shortK, 0);
  const longIntr = bull ? Math.max(longK - sExp, 0) : Math.max(sExp - longK, 0);
  const pnl = credit - (shortIntr - longIntr);
  const risk = width - credit;
  return risk > 0 ? pnl / risk : pnl / width;
}

interface Fila { ms: number; base: number; muro: number | null; muroCons: number | null; distMuro: number | null; fija08: number | null; ivOk: boolean; fijas: Map<number, number> }

(async () => {
  const filas: Fila[] = [];
  let conOi = 0, sinOi = 0, sinMuro = 0;

  for (const t of TICKERS) {
    const bars = cargarBarras(t);
    const oi = cargarOi(t);
    const trades: unknown[] = [];
    for (const f of readdirSync(DIR)) {
      if (!f.startsWith(`${t}_y_`) || !f.endsWith(".json")) continue;
      const y = leer<unknown[]>(`${DIR}/${f}`); if (y?.length) trades.push(...y);
    }
    if (!bars.length || !trades.length) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sigs = signals(classifyFlow(trades as any, new Date()).rows, bars);
    // Top⅓ de convicción, que es lo que se opera.
    const k = Math.floor(sigs.length / 3);
    const top = [...sigs].sort((a, b) => a.evaComp - b.evaComp).slice(sigs.length - k);

    for (const sig of top) {
      const { spot, rv, dir } = sig;
      const em = spot * rv * Math.sqrt(DTE / 365);
      if (!(em > 0)) continue;
      const bull = dir === 1;
      const base = pnlConStrike(sig, bars, DTE, bull ? spot - SIGMA * em : spot + SIGMA * em, em);
      if (base == null) continue;

      const dia = ymd(sig.entryMs).replace(/-/g, "");
      const porStrike = oi.get(dia);
      if (!porStrike) { sinOi++; filas.push({ ms: sig.entryMs, base, muro: null, muroCons: null, distMuro: null, fija08: null, ivOk: sig.ivRatio < 1.1, fijas: new Map() }); continue; }
      conOi++;

      const T = DTE / 365;
      const kMuro = muroGamma(porStrike, spot, em, T, rv, bull, 0.5, 2.0);
      const kCons = muroGamma(porStrike, spot, em, T, rv, bull, 1.0, 2.0);
      if (kMuro == null) sinMuro++;
      // CONTROL DECISIVO: vender a 0,80σ FIJO —la distancia MEDIANA a la que acaba estando el
      // muro— sin mirar el open interest. Si esto rinde igual que el muro, entonces el GEX no
      // aporta nada y todo el hallazgo se reduce a "vender más cerca paga más". Sin este
      // control, el muro se lleva un mérito que podría ser solo de la distancia.
      const kFija = bull ? spot - 0.80 * em : spot + 0.80 * em;
      filas.push({
        ms: sig.entryMs, base,
        muro: kMuro == null ? null : pnlConStrike(sig, bars, DTE, kMuro, em),
        muroCons: kCons == null ? null : pnlConStrike(sig, bars, DTE, kCons, em),
        distMuro: kMuro == null ? null : Math.abs(spot - kMuro) / em,
        fija08: pnlConStrike(sig, bars, DTE, kFija, em),
        ivOk: sig.ivRatio < 1.1,   // el filtro de la mejora anterior
        // El muro compite contra TODA la rejilla de distancias fijas, no contra una elegida a
        // conveniencia. Si alguna fija le gana, el GEX no aporta: su único mérito sería estar
        // eligiendo una distancia media más corta, y eso lo consigue cualquiera fijándola.
        fijas: new Map(REJILLA_FIJA.map((d) => [d, pnlConStrike(sig, bars, DTE, bull ? spot - d * em : spot + d * em, em)])
          .filter((e): e is [number, number] => e[1] != null)),
      });
    }
  }

  console.log(`\n## MEJORA #2 — vender en el MURO DE GAMMA vs a 1σ · ${DTE}d · Top⅓ EVA\n`);
  console.log(`Señales: ${filas.length} · con OI del día: ${conOi} · sin OI: ${sinOi} · sin muro en zona: ${sinMuro}\n`);

  const comparar = (nombre: string, get: (f: Fila) => number | null) => {
    // Se comparan SOLO las señales donde ambas variantes existen — si no, se compararían
    // poblaciones distintas y la diferencia podría ser la muestra, no la estrategia.
    const pares = filas.map((f) => ({ ms: f.ms, a: f.base, b: get(f) })).filter((x): x is { ms: number; a: number; b: number } => x.b != null);
    if (pares.length < 100) { console.log(`| ${nombre} | ${pares.length} | muestra insuficiente | | | |`); return; }
    const o = [...pares].sort((x, y) => x.ms - y.ms);
    const mid = Math.floor(o.length / 2);
    const mB = media(pares.map((x) => x.b));
    const mA = media(pares.map((x) => x.a));
    const vieja = media(o.slice(0, mid).map((x) => x.b)) * 100;
    const nueva = media(o.slice(mid).map((x) => x.b)) * 100;
    const opsAño = pares.length / AÑOS;
    console.log(
      `| ${nombre} | ${pares.length} | ${(mB * 100 >= 0 ? "+" : "")}${(mB * 100).toFixed(2)}% | ${(mA * 100 >= 0 ? "+" : "")}${(mA * 100).toFixed(2)}% | **$${Math.round(opsAño * mB * RIESGO).toLocaleString("en-US")}** | ${vieja.toFixed(2)} / ${nueva.toFixed(2)} ${vieja > 0 && nueva > 0 && mB > mA ? "✅" : "✗"} |`,
    );
  };

  console.log("| Variante | n | Media | Base (1σ) en las MISMAS señales | $/AÑO | OOS vieja/nueva |");
  console.log("|---|---|---|---|---|---|");
  comparar("Muro de gamma (0.5σ–2σ)", (f) => f.muro);
  comparar("Muro conservador (1σ–2σ)", (f) => f.muroCons);
  comparar("**CONTROL: 0.80σ fijo, sin mirar el OI**", (f) => f.fija08);

  // ── LA COMBINACIÓN — medida, no sumada ──────────────────────────────────────────────────
  // Sumar los efectos medidos por separado (+0,9 pp del filtro de IV, +1,35 pp del muro) daría
  // un número inventado: los filtros actúan sobre las MISMAS operaciones y pueden solaparse.
  // La única cifra defendible es correr la configuración completa y medirla.
  console.log(`
### La combinación completa (Top⅓ EVA + IV/rv<1,1 + muro de gamma)
`);
  console.log("| Configuración | Ops/año | Media | $/AÑO | OOS vieja/nueva |");
  console.log("|---|---|---|---|---|");
  const conf = (nombre: string, sel: (f: Fila) => number | null) => {
    const v = filas.map((f) => ({ ms: f.ms, p: sel(f) })).filter((x): x is { ms: number; p: number } => x.p != null);
    if (v.length < 100) return;
    const o = [...v].sort((a, b) => a.ms - b.ms);
    const mid = Math.floor(o.length / 2);
    const vieja = media(o.slice(0, mid).map((x) => x.p)) * 100;
    const nueva = media(o.slice(mid).map((x) => x.p)) * 100;
    const m = media(v.map((x) => x.p));
    const opsAño = v.length / AÑOS;
    console.log(`| ${nombre} | ${Math.round(opsAño)} | ${(m * 100 >= 0 ? "+" : "")}${(m * 100).toFixed(2)}% | **$${Math.round(opsAño * m * RIESGO).toLocaleString("en-US")}** | ${vieja.toFixed(2)} / ${nueva.toFixed(2)} ${vieja > 0 && nueva > 0 ? "✅" : "✗"} |`);
  };
  conf("1. Base: Top⅓ a 1σ", (f) => f.base);
  conf("2. + filtro IV/rv<1,1", (f) => (f.ivOk ? f.base : null));
  conf("3. + muro de gamma (sin filtro IV)", (f) => f.muro);
  conf("**4. TODO: Top⅓ + IV + muro**", (f) => (f.ivOk ? f.muro : null));

  // ── ¿El muro le gana a TODAS las distancias fijas? ──────────────────────────────────────
  const conMuro = filas.filter((f) => f.muro != null && f.fijas.size);
  const mediaMuro = media(conMuro.map((f) => f.muro!)) * 100;
  const distMedia = media(conMuro.map((f) => f.distMuro!));
  console.log(`
### El muro contra TODAS las distancias fijas (mismas ${conMuro.length} señales)
`);
  console.log(`Distancia MEDIA del muro: ${distMedia.toFixed(2)}σ · su rendimiento: **${mediaMuro.toFixed(2)}%**
`);
  console.log("| Distancia fija | Media | ¿Le gana al muro? |");
  console.log("|---|---|---|");
  let algunaGana = false;
  for (const d of REJILLA_FIJA) {
    const v = media(conMuro.map((f) => f.fijas.get(d)!).filter((x) => x != null)) * 100;
    const gana = v > mediaMuro;
    if (gana) algunaGana = true;
    console.log(`| ${d.toFixed(1)}σ | ${v >= 0 ? "+" : ""}${v.toFixed(2)}% | ${gana ? "**SÍ**" : "no"} |`);
  }
  console.log(`
   → ${algunaGana
    ? "El GEX NO aporta: hay distancias fijas que le ganan. Su mérito era elegir una distancia media más corta, y eso se consigue fijándola."
    : "El GEX SÍ aporta: le gana a todas las distancias fijas, así que la elección caso por caso lleva información que una constante no tiene."}`);

  const dists = filas.map((f) => f.distMuro).filter((x): x is number => x != null).sort((a, b) => a - b);
  if (dists.length) {
    const p = (q: number) => dists[Math.floor(dists.length * q)];
    console.log(`\nDistancia del muro al spot (en σ): p10 ${p(0.1).toFixed(2)} · mediana ${p(0.5).toFixed(2)} · p90 ${p(0.9).toFixed(2)}`);
    console.log(`(1.00 sería exactamente donde vende la estrategia actual)`);
  }
})();
