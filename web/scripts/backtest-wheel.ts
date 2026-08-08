// BACKTEST DE LA WHEEL — nunca se había hecho.
//
// El forward-test del Wheel lleva 57 puts de papel corriendo SIN una sola validación histórica
// detrás. Con el credit spread hicimos 10 años, OOS, costos, régimen y crash; con la Wheel,
// nada. Esto lo cierra, sobre la misma caché (2016-2026, 9 tickers).
//
// LA ESTRATEGIA: vender un cash-secured put en los días de flujo ALCISTA (el dinero apuesta al
// alza → vendes el suelo). Colateral = strike × 100. Se sostiene a vencimiento:
//   · si expira por encima del strike → te quedas la prima entera
//   · si expira por debajo → te asignan, y el resultado es prima − (strike − precio final)
//
// Retorno = resultado / colateral. Es lo que de verdad rinde tu efectivo inmovilizado, y no es
// comparable con el "retorno sobre riesgo" del credit spread — ahí el riesgo es el ancho del
// spread, aquí es el strike entero.
//
// Se prueban 3 presets de delta (conservador / equilibrado / agresivo) × 3 plazos, con el
// filtro de convicción de EVA aplicado igual que en el credit spread.
//
// Uso: npx tsx scripts/backtest-wheel.ts

import { readFileSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, type DBar, type Signal } from "../lib/backtestCore";
import { bsPrice, bsDelta } from "../lib/blackScholes";

const TICKERS = (process.env.BT_TICKERS || "SPY,AAPL,MSFT,NVDA,META,TSLA,AMD,QQQ,HOOD").split(",");
const CAPITAL = Number(process.env.W_CAPITAL) || 60_000;
const AÑOS = 10.5;
const DIR = "scripts/cache-theta";
const BT_START = "20160101", BT_END = "20260731";

// Deltas objetivo (|delta| del put). Más alto = strike más cerca = más prima y más asignación.
const PRESETS: [string, number][] = [["conservador (Δ0.15)", 0.15], ["equilibrado (Δ0.25)", 0.25], ["agresivo (Δ0.35)", 0.35]];
const DTES = [14, 30, 45];

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
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

function barIdxOnOrAfter(bars: DBar[], ms: number): number {
  for (let i = 0; i < bars.length; i++) if (Date.parse(`${bars[i].time}T20:00:00Z`) >= ms) return i;
  return -1;
}

/**
 * Vende un put cash-secured al delta objetivo. Devuelve el retorno sobre el COLATERAL.
 * El strike se busca por bisección sobre el delta de Black-Scholes — no hay cadena real aquí,
 * igual que en el resto de backtests.
 */
function wheelPnl(sig: Signal, bars: DBar[], dte: number, deltaObj: number): number | null {
  const { spot, rv, entryIdx, dir } = sig;
  if (dir !== 1) return null;               // solo días ALCISTAS: vendes el suelo
  const T = dte / 365;
  if (!(rv > 0) || !(spot > 0)) return null;

  // Bisección: buscar el strike cuyo |delta| ≈ deltaObj (delta del put es negativo).
  let lo = spot * 0.5, hi = spot;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const d = Math.abs(bsDelta(spot, mid, T, rv, "put"));
    if (d > deltaObj) hi = mid; else lo = mid;
  }
  const strike = (lo + hi) / 2;
  if (!(strike > 0) || strike >= spot) return null;

  const prima = bsPrice(spot, strike, T, rv, "put");
  if (!(prima > 0)) return null;

  const expMs = Date.parse(`${bars[entryIdx].time}T20:00:00Z`) + dte * 86_400_000;
  const expIdx = barIdxOnOrAfter(bars, expMs);
  if (expIdx < 0) return null;
  const sExp = bars[expIdx].close;

  // Asignado si cierra por debajo del strike: pierdes (strike − precio), te quedas la prima.
  const perdida = Math.max(strike - sExp, 0);
  return (prima - perdida) / strike;       // sobre el COLATERAL (strike), no sobre el spread
}

(async () => {
  const todas: { sig: Signal; bars: DBar[] }[] = [];
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
    for (const sig of signals(classifyFlow(trades as any, new Date()).rows, bars)) todas.push({ sig, bars });
  }

  const k = Math.floor(todas.length / 3);
  const top = [...todas].sort((a, b) => a.sig.evaComp - b.sig.evaComp).slice(todas.length - k);

  console.log(`\n## BACKTEST DE LA WHEEL · 2016-2026 · ${todas.length} señales (Top⅓ EVA: ${top.length})`);
  console.log(`### Solo días de flujo ALCISTA · retorno sobre COLATERAL · cuenta de $${CAPITAL.toLocaleString("en-US")}\n`);
  console.log("| Preset | Plazo | Ops/año | Asignado | Media | Peor | $/AÑO* | OOS vieja/nueva |");
  console.log("|---|---|---|---|---|---|---|---|");

  for (const [nombre, dObj] of PRESETS) {
    for (const dte of DTES) {
      const ops = top
        .map(({ sig, bars }) => { const p = wheelPnl(sig, bars, dte, dObj); return p == null ? null : { ms: sig.entryMs, pnl: p }; })
        .filter((x): x is { ms: number; pnl: number } => x != null);
      if (ops.length < 100) continue;
      const o = [...ops].sort((a, b) => a.ms - b.ms);
      const mid = Math.floor(o.length / 2);
      const vieja = media(o.slice(0, mid).map((x) => x.pnl)) * 100;
      const nueva = media(o.slice(mid).map((x) => x.pnl)) * 100;
      const m = media(ops.map((x) => x.pnl));
      const asignado = Math.round(ops.filter((x) => x.pnl < 0).length / ops.length * 100);
      const peor = Math.min(...ops.map((x) => x.pnl)) * 100;
      const opsAño = ops.length / AÑOS;

      // $/AÑO: el colateral limita cuántas puedes tener a la vez. Con la cuenta entera
      // inmovilizada y posiciones de `dte` días, caben ~365/dte rotaciones al año.
      // Es un TECHO teórico: en la práctica no siempre hay señal disponible para reinvertir.
      const rotaciones = Math.min(365 / dte, opsAño);
      const dolarAño = rotaciones * m * CAPITAL;
      console.log(
        `| ${nombre} | ${dte}d | ${Math.round(opsAño)} | ${asignado}% | ${m >= 0 ? "+" : ""}${(m * 100).toFixed(2)}% | ${peor.toFixed(1)}% | **$${Math.round(dolarAño).toLocaleString("en-US")}** | ${vieja.toFixed(2)} / ${nueva.toFixed(2)} ${vieja > 0 && nueva > 0 ? "✅" : "✗"} |`,
      );
    }
  }
  console.log(`\n*$/AÑO asume la cuenta entera como colateral y ~${Math.round(365 / 30)} rotaciones al año a 30 días.`);
  console.log(` Es un TECHO: cada put inmoviliza strike×100 en efectivo, así que con $${CAPITAL.toLocaleString("en-US")}`);
  console.log(` solo caben 1-2 contratos a la vez en tickers caros. NO es comparable con el credit spread,`);
  console.log(` donde el riesgo por operación es el ancho del spread y no el strike entero.`);
})();
