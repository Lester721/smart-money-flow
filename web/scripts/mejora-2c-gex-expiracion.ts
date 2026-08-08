// EL MURO DE LA EXPIRACIÓN QUE SE OPERA — la versión buena de la mejora #2.
//
// La primera prueba usó el OI agregado de todas las expiraciones a ≤60 días y el muro perdió
// contra distancias fijas. Pero esa agregación borraba la señal: el 2020-03-20 había cuatro
// vencimientos con sus muros en 260, 245, 200 y 250 — promediarlos los anula.
//
// AQUÍ se usa el muro de la expiración QUE EL SPREAD VA A USAR: la primera listada en o después
// de entrada+DTE. Es lo que la teoría del GEX describe — los dealers cubren gamma contra los
// contratos que vencen ese día.
//
// CONTROL, el mismo que tumbó la versión anterior: el muro tiene que ganarle a TODAS las
// distancias fijas, no a una elegida a conveniencia. Si alguna constante le gana, el GEX no
// aporta: su mérito sería solo estar vendiendo más cerca.
//
// Uso: npx tsx scripts/mejora-2c-gex-expiracion.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, WIDTH_EM, type DBar, type Signal } from "../lib/backtestCore";
import { bsPrice, bsGamma } from "../lib/blackScholes";

const TICKERS = (process.env.BT_TICKERS || "SPY,AAPL,MSFT,NVDA,META,TSLA,AMD,QQQ,HOOD").split(",");
const DTE = 5;
const RIESGO = Number(process.env.G_RIESGO) || 1200;
const AÑOS = 10.5;
const DIR = "scripts/cache-theta";
const FIJAS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const MIN_SIG = 0.3, MAX_SIG = 2.0;   // zona donde se acepta un muro

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const ymdToMs = (y: string) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);

/** fecha → expiración → strike → [oiCalls, oiPuts] */
type OiExp = Record<string, Record<string, Record<string, [number, number]>>>;

function pnlConStrike(sig: Signal, bars: DBar[], shortK: number, em: number): number | null {
  const { spot, rv, entryIdx, dir } = sig;
  const bull = dir === 1;
  const longK = bull ? shortK - WIDTH_EM * em : shortK + WIDTH_EM * em;
  if (shortK <= 0 || longK <= 0) return null;
  const T = DTE / 365;
  const type = bull ? "put" : "call";
  const credit = bsPrice(spot, shortK, T, rv, type) - bsPrice(spot, longK, T, rv, type);
  const width = Math.abs(shortK - longK);
  if (!(credit > 0) || !(width > 0)) return null;
  const expMs = Date.parse(`${bars[entryIdx].time}T20:00:00Z`) + DTE * 86_400_000;
  let expIdx = -1;
  for (let i = 0; i < bars.length; i++) if (Date.parse(`${bars[i].time}T20:00:00Z`) >= expMs) { expIdx = i; break; }
  if (expIdx < 0) return null;
  const sExp = bars[expIdx].close;
  const sI = bull ? Math.max(shortK - sExp, 0) : Math.max(sExp - shortK, 0);
  const lI = bull ? Math.max(longK - sExp, 0) : Math.max(sExp - longK, 0);
  const risk = width - credit;
  return risk > 0 ? (credit - (sI - lI)) / risk : (credit - (sI - lI)) / width;
}

interface Fila { ms: number; muro: number | null; distMuro: number | null; fijas: Map<number, number> }

(async () => {
  const filas: Fila[] = [];
  let sinDia = 0, sinExp = 0, sinMuro = 0;

  for (const t of TICKERS) {
    const trozos: DBar[] = [];
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_barsPAR_y_`) && f.endsWith(".json")) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
    }
    const porFecha = new Map(trozos.map((x) => [x.time, x] as const));
    const bars = [...porFecha.values()].sort((a, b) => (a.time < b.time ? -1 : 1));

    const oi: OiExp = {};
    for (const f of readdirSync(DIR)) {
      if (!f.startsWith(`${t}_oiexp_y_`) || !f.endsWith(".json")) continue;
      Object.assign(oi, leer<OiExp>(`${DIR}/${f}`) ?? {});
    }
    const trades: unknown[] = [];
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_y_`) && f.endsWith(".json")) { const y = leer<unknown[]>(`${DIR}/${f}`); if (y?.length) trades.push(...y); }
    }
    if (!bars.length || !trades.length || !Object.keys(oi).length) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sigs = signals(classifyFlow(trades as any, new Date()).rows, bars);
    const k = Math.floor(sigs.length / 3);
    const top = [...sigs].sort((a, b) => a.evaComp - b.evaComp).slice(sigs.length - k)
      .filter((s) => s.ivRatio < 1.1);

    for (const sig of top) {
      const { spot, rv, dir } = sig;
      const em = spot * rv * Math.sqrt(DTE / 365);
      if (!(em > 0)) continue;
      const bull = dir === 1;
      const dia = ymd(sig.entryMs);
      const porExp = oi[dia];
      if (!porExp) { sinDia++; continue; }

      // LA EXPIRACIÓN QUE SE VA A OPERAR: la primera listada en/después de entrada + DTE.
      const objetivo = ymd(sig.entryMs + DTE * 86_400_000);
      const exp = Object.keys(porExp).sort().find((e) => e >= objetivo);
      if (!exp) { sinExp++; continue; }

      // El muro de ESA expiración.
      const T = DTE / 365;
      let kMuro: number | null = null, mejorPeso = 0;
      for (const [kStr, [oiC, oiP]] of Object.entries(porExp[exp])) {
        const kk = Number(kStr);
        const dist = bull ? (spot - kk) / em : (kk - spot) / em;
        if (!(dist >= MIN_SIG && dist <= MAX_SIG)) continue;
        const g = bsGamma(spot, kk, T, rv);
        if (!(g > 0)) continue;
        const peso = g * (oiC + oiP) * 100 * spot * spot * 0.01;
        if (peso > mejorPeso) { mejorPeso = peso; kMuro = kk; }
      }
      if (kMuro == null) { sinMuro++; continue; }

      const fijas = new Map<number, number>();
      for (const d of FIJAS) {
        const p = pnlConStrike(sig, bars, bull ? spot - d * em : spot + d * em, em);
        if (p != null) fijas.set(d, p);
      }
      const pMuro = pnlConStrike(sig, bars, kMuro, em);
      if (pMuro == null || fijas.size !== FIJAS.length) continue;

      filas.push({ ms: sig.entryMs, muro: pMuro, distMuro: Math.abs(spot - kMuro) / em, fijas });
    }
  }

  const conMuro = filas.filter((f) => f.muro != null);
  const mMuro = media(conMuro.map((f) => f.muro!)) * 100;
  const dMedia = media(conMuro.map((f) => f.distMuro!));
  const o = [...conMuro].sort((a, b) => a.ms - b.ms);
  const mid = Math.floor(o.length / 2);
  const vMuro = media(o.slice(0, mid).map((f) => f.muro!)) * 100;
  const nMuro = media(o.slice(mid).map((f) => f.muro!)) * 100;
  const opsAño = conMuro.length / AÑOS;

  console.log(`\n## MURO DE LA EXPIRACIÓN OPERADA · ${DTE}d · Top⅓ EVA + IV/rv<1,1\n`);
  console.log(`n=${conMuro.length} · sin OI del día: ${sinDia} · sin expiración: ${sinExp} · sin muro en zona: ${sinMuro}`);
  console.log(`Distancia MEDIA del muro: ${dMedia.toFixed(2)}σ\n`);
  console.log("| Estrategia | Media | OOS vieja / nueva | $/AÑO |");
  console.log("|---|---|---|---|");
  console.log(`| **Muro de la expiración** | **${mMuro >= 0 ? "+" : ""}${mMuro.toFixed(2)}%** | ${vMuro.toFixed(2)} / ${nMuro.toFixed(2)} ${vMuro > 0 && nMuro > 0 ? "✅" : "✗"} | **$${Math.round(opsAño * mMuro / 100 * RIESGO).toLocaleString("en-US")}** |`);

  console.log(`\n### El control: ¿le gana a TODAS las distancias fijas?\n`);
  console.log("| Distancia fija | Media | ¿Le gana al muro? |");
  console.log("|---|---|---|");
  let algunaGana = false;
  for (const d of FIJAS) {
    const v = media(conMuro.map((f) => f.fijas.get(d)!)) * 100;
    const gana = v > mMuro;
    if (gana) algunaGana = true;
    console.log(`| ${d.toFixed(1)}σ | ${v >= 0 ? "+" : ""}${v.toFixed(2)}% | ${gana ? "**SÍ**" : "no"} |`);
  }
  console.log(`\n   → ${algunaGana
    ? "El GEX POR EXPIRACIÓN tampoco aporta: hay constantes que le ganan."
    : "El GEX POR EXPIRACIÓN SÍ APORTA: le gana a todas las constantes, así que elegir el strike caso por caso lleva información que una distancia fija no tiene."}`);
})();
