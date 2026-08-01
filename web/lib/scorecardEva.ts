// EVA-tuned scorecard — versión PARALELA del scoring. NO toca el de Victor (ScorecardPanel /
// flow.ts quedan intactos como baseline y fallback). Combina, en un solo módulo puro y testeable:
//   1. Pesos RECALIBRADOS por el backtest limpio (n=1140): Convicción/liquidez arriba (única que
//      gana dinero), Agresividad abajo (no separó), IV arriba. Ver chequeo-confianza-resultados.
//   2. VETOS duros + MODIFICADORES + bandas de decisión del Documento Maestro v2.0 (spec canónico).
//   3. Clasificación de intención BTO/STO (paso previo del spec).
// Los scores de sub-agente (0-10) entran ya calculados por las funciones de Victor.

export interface EvaScores {
  aggression: number | null;
  conviction: number | null;
  unusuality: number | null;
  structure: number | null;
  ivContext: number | null;
  validation: number | null;
}

/**
 * Pesos EVA-tuned (suman 100). Base = pesos de Victor (20/20/20/15/10/15); ajuste = backtest:
 * Convicción 20→30 (única con edge en dinero), Agresividad 20→10 (win 44 vs 48, no separa),
 * IV 10→15, Confirmación 15→10. Inusualidad y Estructura se mantienen (win-rate / pendiente
 * forward-test). Divergen a propósito del spec (que ponía Inusual 30 > Convicción 25): los datos
 * dicen que la liquidez manda. Es una HIPÓTESIS a re-medir, no una verdad.
 */
export const EVA_WEIGHTS: Record<keyof EvaScores, number> = {
  conviction: 30,
  unusuality: 20,
  structure: 15,
  ivContext: 15,
  aggression: 10,
  validation: 10,
};

// ── Intención BTO/STO (Documento Maestro §4) ─────────────────────────────────
export type Intent = "BTO" | "STO" | "indeterminado";
export interface IntentResult { intent: Intent; bias: "alcista" | "bajista" | "neutral" }

/** Clasifica intención antes de puntuar: un put comprado (bajista) ≠ un put vendido (alcista). */
export function classifyIntent(side: string, exceededOI: boolean, isCall: boolean): IntentResult {
  const aggressiveBuy = side === "ABOVE_ASK" || side === "AT_ASK";
  const aggressiveSell = side === "BELOW_BID" || side === "AT_BID";
  if (aggressiveBuy && exceededOI) return { intent: "BTO", bias: isCall ? "alcista" : "bajista" };
  if (aggressiveSell) return { intent: "STO", bias: isCall ? "bajista" : "alcista" }; // venta de prima
  return { intent: "indeterminado", bias: "neutral" };
}

// ── Vetos duros. Cualquiera fuerza el score a 0. ─────────────────────────────
// NOTA (ajuste post-backtest n=1274): el spread ancho ya NO es veto — esos flujos igual ganan
// seguido, expulsarlos era muy duro → pasó a PENALIZACIÓN (modificador wideSpread). OI/volumen
// SÍ siguen como veto: ahí el contrato es literalmente inoperable (no entras/sales), algo que el
// backtest no puede ver (asume que siempre llenas). El spec tenía spread como veto; divergimos
// con evidencia (el mandato de recalibración lo permite).
export interface VetoInputs {
  totalOI: number;       // OI del strike
  volume: number;        // volumen del contrato en la sesión
  ivRank: number | null; // 0-100
  dte: number | null;
}
export const VETO = { MIN_OI: 250, MIN_VOLUME: 100, IVRANK_EXTREME: 100, IVRANK_MIN_DTE: 14 };
export const WIDE_SPREAD_PCT = 15;    // spread > esto → penalización wideSpread (×0.60)
export const MOD_LIQ_SPREAD_PCT = 10; // spread en (10,15] → penalización lowLiquidity (×0.70)

export function evaVetos(v: VetoInputs): string[] {
  const out: string[] = [];
  if (v.totalOI < VETO.MIN_OI) out.push("OI<250");
  if (v.volume < VETO.MIN_VOLUME) out.push("volumen<100");
  if (v.ivRank != null && v.ivRank >= VETO.IVRANK_EXTREME && v.dte != null && v.dte < VETO.IVRANK_MIN_DTE) {
    out.push("IVRank100+DTE<14");
  }
  return out;
}

// ── Modificadores. Se aplican DESPUÉS de la suma ponderada. ──────────────────
export interface ModifierInputs {
  intentIndeterminate: boolean;
  wideSpread: boolean;   // spread>15% (antes veto, ahora penaliza ×0.60)
  lowLiquidity: boolean; // spread moderado 10-15% (×0.70)
  earningsWithinDte: boolean;
  gexConfluence: boolean;
}
export function evaModifiers(m: ModifierInputs): { factor: number; applied: string[] } {
  let factor = 1;
  const applied: string[] = [];
  if (m.intentIndeterminate) { factor *= 0.8; applied.push("intención_indeterminada×0.80"); }
  if (m.wideSpread) { factor *= 0.6; applied.push("spread_ancho×0.60"); }
  else if (m.lowLiquidity) { factor *= 0.7; applied.push("baja_liquidez×0.70"); }
  if (m.earningsWithinDte) { factor *= 0.85; applied.push("earnings×0.85"); }
  if (m.gexConfluence) { factor *= 1.1; applied.push("confluencia_GEX×1.10"); }
  return { factor, applied };
}

// ── Bandas de decisión (Documento Maestro §5) ────────────────────────────────
export type Verdict = "CONVICCION_ALTA" | "CONVICCION_MEDIA" | "OBSERVACION" | "DESCARTE";
export function verdictFor(score: number): { verdict: Verdict; sizeR: number } {
  if (score >= 85) return { verdict: "CONVICCION_ALTA", sizeR: 1.0 };
  if (score >= 70) return { verdict: "CONVICCION_MEDIA", sizeR: 0.5 };
  if (score >= 55) return { verdict: "OBSERVACION", sizeR: 0 };
  return { verdict: "DESCARTE", sizeR: 0 };
}

// ── Score compuesto EVA-tuned ────────────────────────────────────────────────
export interface EvaResult {
  composite: number;   // 0-100 (0 si hay veto)
  raw: number;         // suma ponderada antes de modificadores
  vetoed: boolean;
  vetos: string[];
  modifiers: string[];
  verdict: Verdict;
  sizeR: number;
  activeWeight: number; // suma de pesos de las categorías presentes
}

export function evaScore(scores: EvaScores, vetoInputs: VetoInputs, modifierInputs: ModifierInputs): EvaResult {
  const vetos = evaVetos(vetoInputs);
  let pts = 0;
  let activeWeight = 0;
  (Object.keys(EVA_WEIGHTS) as (keyof EvaScores)[]).forEach((k) => {
    const s = scores[k];
    if (s != null) {
      pts += (s / 10) * EVA_WEIGHTS[k];
      activeWeight += EVA_WEIGHTS[k];
    }
  });
  const raw = activeWeight > 0 ? Math.round((pts / activeWeight) * 1000) / 10 : 0;
  if (vetos.length > 0) {
    return { composite: 0, raw, vetoed: true, vetos, modifiers: [], ...verdictFor(0), activeWeight };
  }
  const { factor, applied } = evaModifiers(modifierInputs);
  const composite = Math.min(100, Math.round(raw * factor * 10) / 10);
  return { composite, raw, vetoed: false, vetos: [], modifiers: applied, ...verdictFor(composite), activeWeight };
}
