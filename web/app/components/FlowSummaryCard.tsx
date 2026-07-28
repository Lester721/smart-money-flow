"use client";

import type { FlowSummary } from "@/lib/flowSummary";

/** Resumen en lenguaje sencillo, al tope del Pro: lees esto y luego atas el detalle abajo. */
export default function FlowSummaryCard({ summary }: { summary: FlowSummary }) {
  const color =
    summary.lean === "alcista" ? "#12b76a" : summary.lean === "bajista" ? "#f04438" : "#8a94a6";
  return (
    <section className="card flow-summary" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="flow-summary-head" style={{ color }}>
        {summary.headline}
      </div>
      <p className="flow-summary-text">{summary.text}</p>
      {summary.warning && <div className="iv-special">⚠ {summary.warning}</div>}
      <div className="flow-summary-note">
        No es consejo — es lo que el flujo muestra. La decisión (y el riesgo) son tuyos.
      </div>
    </section>
  );
}
