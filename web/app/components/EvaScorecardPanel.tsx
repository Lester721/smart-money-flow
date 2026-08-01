"use client";

import type { AggressionScore, ConvictionScore } from "@/lib/flow";
import { EVA_WEIGHTS, verdictFor } from "@/lib/scorecardEva";

// Scorecard EVA-tuned (pesos recalibrados por backtest). Paralelo al de Victor — NO lo toca.
// Muestra el compuesto con los pesos nuevos + el veredicto por bandas del spec.
// Nota: los VETOS de liquidez (OI/volumen) son por-flujo; aquí se muestra la ponderación
// a nivel ticker (la parte validada). El detalle por-flujo vive en el análisis de Time & Sales.

interface Cat { key: string; name: string; weight: number; question: string; score: number | null }

const VERDICT_ES: Record<string, { label: string; cls: string }> = {
  CONVICCION_ALTA: { label: "Convicción alta · 1.0R", cls: "up" },
  CONVICCION_MEDIA: { label: "Convicción media · 0.5R", cls: "up" },
  OBSERVACION: { label: "Observación · watchlist", cls: "neutral" },
  DESCARTE: { label: "Descarte", cls: "down" },
};

export default function EvaScorecardPanel({
  aggression, conviction, unusuality, structure, ivContext, validation,
}: {
  aggression: AggressionScore | null;
  conviction?: ConvictionScore | null;
  unusuality?: { score: number } | null;
  structure?: { score: number } | null;
  ivContext?: { score: number } | null;
  validation?: { score: number } | null;
}) {
  const cats: Cat[] = [
    { key: "con", name: "Convicción", weight: EVA_WEIGHTS.conviction, question: "¿Líquido y con dinero real? (señal #1 por P&L)", score: conviction?.score ?? null },
    { key: "inu", name: "Inusualidad", weight: EVA_WEIGHTS.unusuality, question: "¿Es flujo anormal?", score: unusuality?.score ?? null },
    { key: "est", name: "Estructura", weight: EVA_WEIGHTS.structure, question: "¿Strike/DTE de convicción o lotería?", score: structure?.score ?? null },
    { key: "iv", name: "Contexto IV", weight: EVA_WEIGHTS.ivContext, question: "¿IV barata o inflada?", score: ivContext?.score ?? null },
    { key: "agr", name: "Agresividad", weight: EVA_WEIGHTS.aggression, question: "¿Compran al ask? (bajó: no separó)", score: aggression?.score ?? null },
    { key: "cnf", name: "Confirmación de Precio", weight: EVA_WEIGHTS.validation, question: "¿El precio valida o absorbe?", score: validation?.score ?? null },
  ];

  const active = cats.filter((c) => c.score != null);
  const pts = active.reduce((s, c) => s + (c.score! / 10) * c.weight, 0);
  const activeWeight = active.reduce((s, c) => s + c.weight, 0);
  const composite = activeWeight > 0 ? Math.round((pts / activeWeight) * 100) : 0;
  const allActive = active.length === cats.length;
  const v = VERDICT_ES[verdictFor(composite).verdict];

  return (
    <section className="scpanel">
      <div className="scpanel-head">
        <h2>Scorecard EVA-tuned <span className="chip chip-ask">recalibrado</span></h2>
        <div className="scpanel-total">
          {allActive ? (
            <>Total <b>{composite}</b> / 100</>
          ) : (
            <span className="muted">
              <b>{composite}</b>/100 · <b>{active.length}/{cats.length}</b> activas
            </span>
          )}
        </div>
      </div>
      {active.length > 0 && (
        <div className={`score-verdict ${v.cls}`} style={{ marginTop: -6 }}>{v.label}</div>
      )}
      <div className="scgrid">
        {cats.map((c) => {
          const p = c.score == null ? null : (c.score / 10) * c.weight;
          const on = c.score != null;
          return (
            <div key={c.key} className={`sccat ${on ? "on" : "off"}`}>
              <div className="sccat-name">{c.name} <span className="sccat-w">{c.weight}%</span></div>
              <div className="sccat-q">{c.question}</div>
              {on ? (
                <div className="sccat-score">
                  {c.score}<span className="sccat-den">/10</span>
                  <span className="sccat-pts">→ {p!.toFixed(1)}/{c.weight} pts</span>
                </div>
              ) : (
                <div className="sccat-score pending">— <span className="sccat-den">pendiente</span></div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
