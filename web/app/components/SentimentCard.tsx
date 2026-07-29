"use client";

import type { Lean } from "@/lib/flowSummary";

export interface SentimentPart {
  name: string;
  note: string;
  score: number | null; // 0-10, null = pendiente
  weight: number;
}

function colorFor(score100: number): string {
  return score100 >= 60 ? "#12b76a" : score100 >= 45 ? "#667085" : "#f04438";
}

const leanColor = (lean: Lean): string =>
  lean === "alcista" ? "#12b76a" : lean === "bajista" ? "#f04438" : "#667085";
const leanLabel = (lean: Lean): string =>
  lean === "alcista" ? "Bullish" : lean === "bajista" ? "Bearish" : "Neutral";
const strengthWord = (s: number): string => (s >= 60 ? "alta" : s >= 45 ? "media" : "baja");

/**
 * AI Sentiment Score — DIRECCIONAL (opción 2a).
 * La FUERZA es el mismo composite de Victor (promedio ponderado de los 6 sub-agentes, 0-100):
 * NO se toca. Lo nuevo: la etiqueta y el marcador van por DIRECCIÓN (del flujo, reusando
 * flowSummary), y la fuerza se muestra aparte. Sin dirección aún (flujo cargando) → cae al
 * composite como antes, para no romper nada.
 */
export default function SentimentCard({
  ticker,
  parts,
  lean,
  dirScore,
}: {
  ticker: string;
  parts: SentimentPart[];
  lean?: Lean | null;
  dirScore?: number | null;
}) {
  const active = parts.filter((p) => p.score != null);
  const activeWeight = active.reduce((s, p) => s + p.weight, 0);
  const pts = active.reduce((s, p) => s + (p.score! / 10) * p.weight, 0);
  const strength = activeWeight > 0 ? Math.round((pts / activeWeight) * 100) : 0;

  const hasDir = lean != null && dirScore != null;
  const label = hasDir
    ? leanLabel(lean)
    : strength >= 60 ? "Bullish" : strength >= 45 ? "Neutral" : "Bearish";
  const labelColor = hasDir ? leanColor(lean) : colorFor(strength);
  const markerPos = hasDir ? dirScore : strength;

  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="card-title">AI Sentiment Score</div>
          <div className="card-sub">
            {hasDir
              ? <>Hacia dónde apunta el flujo de {ticker}, y qué tan fuerte es la señal.</>
              : <>Qué tan positivo o negativo se ve el mercado para {ticker} ahora mismo.</>}
            {active.length < parts.length && <> Basado en {active.length} de {parts.length} señales.</>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="sent-label" style={{ color: labelColor, fontSize: 22, lineHeight: 1.1 }}>{label}</div>
          <div style={{ fontSize: 12, color: "#667085", marginTop: 3 }}>
            fuerza {strengthWord(strength)} · {strength}/100
          </div>
        </div>
      </div>

      <div>
        <div style={{ position: "relative", paddingTop: 10 }}>
          <div className="sent-marker" style={{ left: `${markerPos}%` }} />
          <div className="sent-band">
            <div style={{ borderRadius: "6px 2px 2px 6px", background: "#f97066" }} />
            <div style={{ background: "#d9a0a0" }} />
            <div style={{ background: "#d0d5dd" }} />
            <div style={{ background: "#9adbb9" }} />
            <div style={{ borderRadius: "2px 6px 6px 2px", background: "#32d583" }} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#667085", marginTop: 6 }}>
          <div>Bearish</div><div>Neutral</div><div>Bullish</div>
        </div>
        {hasDir && (
          <div style={{ fontSize: 11, color: "#98a2b3", marginTop: 6 }}>
            El marcador se posiciona por la <b>dirección</b> del flujo; la <b>fuerza</b> es el promedio de los 6 sub-agentes.
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid #f2f4f7", paddingTop: 16 }}>
        <div className="sent-head-label">Desglose por señal (promedios de cada sub-agente)</div>
        {parts.map((p) => {
          const s100 = p.score != null ? p.score * 10 : null;
          const c = s100 != null ? colorFor(s100) : "#d0d5dd";
          return (
            <div key={p.name} className="sent-part">
              <div>
                <div className="sent-part-name">{p.name}</div>
                <div className="sent-part-note">{p.note}</div>
              </div>
              <div className="sent-track">
                <div className="sent-fill" style={{ width: `${s100 ?? 0}%`, background: c }} />
              </div>
              <div className="sent-part-score" style={{ color: c }}>{s100 != null ? s100 : "—"}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
