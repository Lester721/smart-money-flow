// Resumen en lenguaje sencillo del flujo — 100% DETERMINÍSTICO.
//
// Lee los scores y las filas del flujo y arma una lectura accionable en una frase.
// NO usa un modelo que "invente": es una plantilla que lee agresividad + convicción +
// dominancia call/put + lado (ask/bid) — la misma lógica que un humano leería a mano,
// pero automática. Así es 100% fiel al dato (regla de datos exactos del usuario).
//
// Direccionalidad: comprar calls / vender puts = alcista · comprar puts / vender calls
// = bajista (misma convención que detectClusters en flow.ts).

import type { AggressionScore, ConvictionScore, FlowRow } from "./flow";
import type { StructureScore } from "./structure";

export type Lean = "alcista" | "bajista" | "mixto";

export interface FlowSummary {
  lean: Lean;
  headline: string;
  text: string;
  warning: string | null;
}

const usd = (n: number): string =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;

export function flowSummary(
  ticker: string,
  rows: FlowRow[] | null,
  aggression: AggressionScore | null,
  conviction: ConvictionScore | null,
  structure: StructureScore | null,
): FlowSummary | null {
  if (!rows || rows.length === 0) return null;

  let bull = 0;
  let bear = 0;
  let callPrem = 0;
  let putPrem = 0;
  let total = 0;
  for (const r of rows) {
    const p = r.premium || 0;
    total += p;
    if (r.type === "call") callPrem += p;
    else if (r.type === "put") putPrem += p;
    if (r.aggression === "ask") {
      if (r.type === "call") bull += p;
      else if (r.type === "put") bear += p;
    } else if (r.aggression === "bid") {
      if (r.type === "put") bull += p;
      else if (r.type === "call") bear += p;
    }
  }

  const dir = bull + bear;
  const bullPct = dir > 0 ? bull / dir : 0.5;
  const lean: Lean = bullPct >= 0.58 ? "alcista" : bullPct <= 0.42 ? "bajista" : "mixto";

  const optPrem = callPrem + putPrem;
  const instrument =
    optPrem > 0 && callPrem / optPrem >= 0.6
      ? "calls"
      : optPrem > 0 && putPrem / optPrem >= 0.6
        ? "puts"
        : "calls y puts";

  const askRatio = aggression?.ratio ?? 0.5;
  const aggWord =
    askRatio >= 0.6
      ? "agresivo (comprando al ask)"
      : askRatio <= 0.4
        ? "defensivo (golpeando el bid)"
        : "repartido entre ask y bid";

  const conv = conviction?.score ?? 0;
  const convWord = conv >= 8 ? "muy alta" : conv >= 6 ? "alta" : conv >= 4 ? "media" : "baja";
  const heavy = total >= 5e6 ? "pesado" : total >= 1e6 ? "moderado" : "ligero";

  const leanPhrase =
    lean === "alcista"
      ? "se inclina ALCISTA"
      : lean === "bajista"
        ? "se inclina BAJISTA"
        : "está MIXTO, sin dirección clara";

  const headline =
    lean === "alcista"
      ? "📈 El flujo se inclina alcista"
      : lean === "bajista"
        ? "📉 El flujo se inclina bajista"
        : "➖ Flujo mixto (sin dirección clara)";

  const text =
    `Flujo institucional ${heavy} en ${ticker} (${usd(total)} notable), concentrado en ${instrument}, ` +
    `ejecutado ${aggWord} — ${Math.round(askRatio * 100)}% del dinero entró al ask, ` +
    `Convicción ${conv}/10 (${convWord}). El posicionamiento ${leanPhrase}.`;

  const warning = structure?.notional?.lowLiquidity
    ? "Cadena de baja liquidez — la señal es poco fiable; no operar sobre ella."
    : null;

  return { lean, headline, text, warning };
}
