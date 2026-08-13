"use client";

import { useCallback, useEffect, useState } from "react";

// Cómo va el forward-test en papel del cóndor 0DTE + GEX.
//
// Lo importante de esta tarjeta no es el P&L: es la columna "backtest". Con 143 operaciones
// medidas el backtest dijo 73% de acierto, $725 de crédito y +$196 por operación. Si en vivo
// se separa de eso, la regla no se sostiene — y da igual si el acumulado está en verde.
//
// Y mientras haya menos de 30 cierres, lo dice en grande: no distingue nada.

interface Op {
  dia: string; hora: string; spx: number; gexNeto: number;
  estado: "abierta" | "cerrada" | "sin señal"; motivo?: string;
  callCorta?: number; putCorta?: number; credito?: number; cierreSPX?: number; pl?: number;
}
interface Datos {
  ok: boolean; vacio: boolean;
  backtest: { señalPct: number; acierto: number; credito: number; porOperacion: number; n: number };
  dias?: number; señales?: number; señalPct?: number | null; abiertas?: number; cerradas?: number;
  acierto?: number | null; creditoMediano?: number | null; total?: number; porOperacion?: number | null;
  suficiente?: boolean; ops?: Op[];
}

const C = { rojo: "#F04438", verde: "#12B76A", ambar: "#F79009", tenue: "rgba(148,163,184,.75)", linea: "rgba(148,163,184,.18)" };

export default function ForwardGexCard() {
  const [d, setD] = useState<Datos | null>(null);
  const cargar = useCallback(async () => {
    try { setD(await (await fetch("/api/forward-gex", { cache: "no-store" })).json()); } catch { /* nada */ }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  if (!d?.ok) return null;

  const b = d.backtest;
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>Forward-test en papel</b>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".05em", padding: "2px 8px",
                       borderRadius: 5, background: "rgba(247,144,9,.16)", color: C.ambar }}>PAPEL</span>
        <span className="muted" style={{ fontSize: 12 }}>no ejecuta ninguna orden</span>
      </div>

      {d.vacio || !d.cerradas ? (
        <p className="muted" style={{ margin: 0 }}>
          Empezado el 2026-08-11. Sin cierres todavía. Con ~55 señales al año hacen falta unos
          seis meses para tener 30 operaciones, que es el mínimo para que esto diga algo.
        </p>
      ) : (
        <>
          {!d.suficiente && (
            <div style={{ padding: "9px 12px", borderRadius: 8, background: "rgba(247,144,9,.12)",
                          color: C.ambar, fontSize: 13, fontWeight: 600 }}>
              ⚠ {d.cerradas} {d.cerradas === 1 ? "cierre" : "cierres"}. Esto todavía no distingue nada —
              hacen falta ~30. Lo que ves abajo puede ser suerte en cualquier dirección.
            </div>
          )}

          <table className="cs-table">
            <thead>
              <tr><th>&nbsp;</th><th style={{ textAlign: "right" }}>en vivo</th><th style={{ textAlign: "right" }}>backtest</th></tr>
            </thead>
            <tbody>
              <Fila t="días registrados" v={String(d.dias)} r={`${b.n} operaciones en 2,6 años`} />
              <Fila t="días con señal" v={`${d.señales} (${d.señalPct}%)`} r={`${b.señalPct}%`} />
              <Fila t="operaciones cerradas" v={String(d.cerradas)} r="—" />
              <Fila t="acierto" v={`${d.acierto}%`} r={`${b.acierto}%`}
                    col={d.acierto != null && d.acierto >= b.acierto - 15 ? undefined : C.rojo} />
              <Fila t="crédito mediano" v={`$${d.creditoMediano}`} r={`$${b.credito}`}
                    col={d.creditoMediano != null && d.creditoMediano >= b.credito * 0.7 ? undefined : C.rojo} />
              <Fila t="por operación" v={`${(d.porOperacion ?? 0) >= 0 ? "+" : "−"}$${Math.abs(d.porOperacion ?? 0)}`}
                    r={`+$${b.porOperacion}`} col={(d.porOperacion ?? 0) >= 0 ? C.verde : C.rojo} />
              <Fila t="acumulado" v={`${(d.total ?? 0) >= 0 ? "+" : "−"}$${Math.abs(d.total ?? 0)}`} r="—"
                    col={(d.total ?? 0) >= 0 ? C.verde : C.rojo} negrita />
            </tbody>
          </table>
        </>
      )}

      {!!d.ops?.length && (
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          <table className="cs-table">
            <thead>
              <tr><th>día</th><th>SPX 11:00</th><th>GEX</th><th>rango vendido</th><th>cierre</th><th style={{ textAlign: "right" }}>P&amp;L</th></tr>
            </thead>
            <tbody>
              {d.ops.map((o) => (
                <tr key={o.dia}>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{o.dia}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{o.spx?.toLocaleString("es-ES")}</td>
                  <td style={{ color: o.gexNeto > 0 ? C.verde : C.rojo, fontVariantNumeric: "tabular-nums" }}>
                    {o.gexNeto > 0 ? "+" : "−"}${Math.abs(Math.round(o.gexNeto / 1000))}B
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    {o.estado === "sin señal"
                      ? <span className="muted">sin señal · {o.motivo}</span>
                      : `${o.putCorta} – ${o.callCorta}`}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{o.cierreSPX?.toLocaleString("es-ES") ?? "—"}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600,
                               color: o.pl == null ? undefined : o.pl > 0 ? C.verde : C.rojo }}>
                    {o.pl == null ? (o.estado === "abierta" ? "abierta" : "—") : `${o.pl > 0 ? "+" : "−"}$${Math.abs(Math.round(o.pl))}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>
        Reglas fijadas de antemano y sin tocar: entrada a las 11:00, cóndor ±25 con alas 50, solo
        con GEX positivo, precios cruzando la horquilla entera, sostener al cierre. Si cambio un
        parámetro porque no me gusta el resultado, esto deja de valer y hay que empezar de cero.
      </p>
    </div>
  );
}

function Fila({ t, v, r, col, negrita }: { t: string; v: string; r: string; col?: string; negrita?: boolean }) {
  return (
    <tr>
      <td style={{ fontWeight: negrita ? 700 : 400 }}>{t}</td>
      <td style={{ textAlign: "right", fontWeight: 700, color: col, fontVariantNumeric: "tabular-nums" }}>{v}</td>
      <td style={{ textAlign: "right", color: C.tenue, fontVariantNumeric: "tabular-nums" }}>{r}</td>
    </tr>
  );
}
