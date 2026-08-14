"use client";

import { useCallback, useEffect, useState } from "react";
import { pedirGex, distanciaPct, fiabilidadMuro, type DatosGex } from "@/lib/gexCliente";

// PANEL DE DECISIÓN — los números que hay que cruzar para decidir, juntos y en el mismo sitio.
//
// POR QUÉ EXISTE. El 2026-08-14, explicándole a Lester cómo se usa el GEX, hubo que mirar TRES
// sitios distintos de la pantalla para llegar a una conclusión que cabía en una línea: "el muro
// está pegado al precio, así que aguanta el 58%, y te pagan $240 por arriesgar $4.760". Su frase:
//
//   "No me falta información, me falta que la información llegue ordenada en el momento de decidir."
//
// Así que este panel NO trae ningún dato nuevo. Trae los mismos de siempre puestos en el orden en
// que se toma la decisión: ¿cuánto me pagan contra cuánto arriesgo, y qué tan firme es la pared
// en la que me estoy apoyando?
//
// Deliberadamente NO dice "compra" ni "vende". La decisión es de Lester; lo que hace el panel es
// que sea obvia en vez de intuitiva.

const C = { verde: "#12B76A", rojo: "#F04438", ambar: "#F79009", azul: "#3B82F6",
            tenue: "rgba(148,163,184,.75)", linea: "rgba(148,163,184,.18)" };

const COLOR_NIVEL = { malo: C.rojo, medio: C.ambar, bueno: C.verde } as const;

function Pata({ accion, tipo, k, p, corta, extra }: {
  accion: "vender" | "comprar"; tipo: "call" | "put"; k: number; p: number; corta?: boolean; extra?: string;
}) {
  return (
    <div style={{
      border: `1px solid ${corta ? (tipo === "call" ? "rgba(18,183,106,.35)" : "rgba(240,68,56,.35)") : C.linea}`,
      background: corta ? (tipo === "call" ? "rgba(18,183,106,.06)" : "rgba(240,68,56,.06)") : "transparent",
      borderRadius: 9, padding: "9px 12px",
    }}>
      <div style={{ fontSize: 11, color: C.tenue }}>
        {accion} {tipo}{corta ? " · PATA CORTA" : ""}{extra ? ` · ${extra}` : ""}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <b style={{ fontSize: 19 }}>{k}</b>
        <span style={{ color: accion === "vender" ? C.verde : C.tenue }}>${p.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default function PanelDecision() {
  const [d, setD] = useState<DatosGex | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async (forzar = false) => {
    setCargando(true);
    try { setD(await pedirGex(forzar)); } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  if (cargando && !d) return <div className="card"><span className="muted">Preparando la decisión…</span></div>;
  if (!d?.ok) return (
    <div className="card">
      <b style={{ fontSize: 15 }}>Panel de decisión</b>
      <div className="muted" style={{ marginTop: 8 }}>Sin datos: {d?.motivo ?? "no se pudo consultar"}.</div>
    </div>
  );

  const s = d.señal;
  const spx = d.spx ?? null;
  const dC = distanciaPct(d.muroCall, spx), dP = distanciaPct(d.muroPut, spx);
  const fC = fiabilidadMuro(dC), fP = fiabilidadMuro(dP);
  // Relación premio/riesgo: cuántos dólares se arriesgan por cada dólar que pagan. Es el número
  // que más rápido descarta una operación y el que menos se mira.
  const ratio = s?.operar && s.credito && s.riesgoMax ? s.riesgoMax / s.credito : null;
  // Acierto mínimo para EMPATAR: riesgo / (riesgo + crédito).
  const empate = s?.operar && s.credito && s.riesgoMax ? (s.riesgoMax / (s.riesgoMax + s.credito)) * 100 : null;
  const peorMuro = fC && fP ? (fC.pct <= fP.pct ? fC : fP) : (fC ?? fP);
  // La comparación que decide: ¿el acierto que hace falta cabe dentro del que aguantan los muros?
  const cuadra = empate != null && peorMuro != null ? peorMuro.pct >= empate : null;

  return (
    <div className="card" style={{ borderLeft: `3px solid ${s?.operar ? C.verde : C.rojo}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", padding: "3px 9px", borderRadius: 5,
                       background: s?.operar ? "rgba(18,183,106,.16)" : "rgba(240,68,56,.16)",
                       color: s?.operar ? C.verde : C.rojo }}>
          {s?.operar ? "SEÑAL" : "SIN SEÑAL"}
        </span>
        <b style={{ fontSize: 15 }}>{s?.operar ? "Cóndor de hierro ±25 · alas 50" : "No operar"}</b>
        <button onClick={() => cargar(true)} disabled={cargando} style={{
          marginLeft: "auto", border: `1px solid ${C.linea}`, background: "transparent", color: "inherit",
          borderRadius: 8, padding: "5px 11px", cursor: cargando ? "default" : "pointer", fontSize: 12,
        }}>{cargando ? "…" : "actualizar"}</button>
      </div>

      {/* ── LO PRIMERO: ¿compensa? Antes que los strikes, antes que nada. ── */}
      {s?.operar && ratio != null && empate != null && (
        <div style={{
          marginTop: 12, padding: "12px 14px", borderRadius: 10,
          border: `1px solid ${cuadra ? "rgba(18,183,106,.35)" : "rgba(240,68,56,.35)"}`,
          background: cuadra ? "rgba(18,183,106,.07)" : "rgba(240,68,56,.07)",
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
            {cuadra
              ? "Los números cuadran: los muros aguantan más de lo que hace falta para empatar."
              : "Los números NO cuadran: hace falta acertar más de lo que aguantan los muros."}
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
            <span>arriesgas <b>${s.riesgoMax}</b> para ganar <b>${s.credito}</b> · <b>1 a {ratio.toFixed(0)}</b></span>
            <span>hace falta acertar <b style={{ color: cuadra ? C.verde : C.rojo }}>{empate.toFixed(1)}%</b> sólo para empatar</span>
            {peorMuro && <span>el muro más flojo aguanta <b style={{ color: COLOR_NIVEL[peorMuro.nivel] }}>{peorMuro.pct}%</b></span>}
          </div>
          {!cuadra && (
            <div style={{ fontSize: 12, color: C.tenue, marginTop: 7 }}>
              No significa que vaya a salir mal: significa que el precio que pagan hoy no compensa
              la pared en la que te apoyas. El uso del GEX que más dinero ahorra es saber cuándo no operar.
            </div>
          )}
        </div>
      )}

      {/* ── LOS MUROS Y SU DISTANCIA ── */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
          Los muros — y lo que decide no es su tamaño, es su distancia
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10 }}>
          {([["muro de CALLS", d.muroCall, dC, fC], ["muro de PUTS", d.muroPut, dP, fP]] as const).map(([t, k, dist, fi]) => (
            <div key={t} style={{ border: `1px solid ${C.linea}`, borderRadius: 9, padding: "9px 12px" }}>
              <div style={{ fontSize: 11, color: C.tenue }}>{t}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <b style={{ fontSize: 19 }}>{k ?? "—"}</b>
                <span style={{ fontSize: 13, color: C.tenue }}>
                  a {dist != null ? `${dist.toFixed(2)}%` : "—"} del precio
                </span>
              </div>
              {fi && (
                <div style={{ fontSize: 12, marginTop: 4, color: COLOR_NIVEL[fi.nivel] }}>
                  aguanta el <b>{fi.pct}%</b> <span style={{ color: C.tenue }}>· {fi.texto}</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.tenue, marginTop: 8, lineHeight: 1.5 }}>
          <b>Cómo leerlo</b> — medido sobre 652 días de SPX (2024-2026): un muro <b>pegado</b> al
          precio (menos del 0,3%) aguanta el <b>61%</b>; a media distancia (0,3–0,6%), el <b>78%</b>;
          a partir del <b>0,6%</b>, el <b>92%</b>. Un muro enorme pegado al precio es poco fiable;
          uno moderado a un 0,8% aguanta casi siempre. <b>La pata corta se pone por fuera del muro</b>,
          apostando a que el precio no lo atraviesa — por eso importa que la pared sea firme.
        </div>
      </div>

      {/* ── LA OPERACIÓN ── */}
      {!s?.operar ? (
        <p style={{ marginTop: 14 }}>
          {s?.motivo}. <b>Es lo único firme que hemos medido:</b> con GEX negativo la misma
          estructura da −2% a −5% en todas las horas y en las dos mitades del período.
        </p>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>La estructura</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
            <Pata accion="vender" tipo="call" k={s.callCorta!} p={s.precios!.callCorta} corta extra={`delta ${s.deltaCorta}`} />
            <Pata accion="comprar" tipo="call" k={s.callLarga!} p={s.precios!.callLarga} />
            <Pata accion="vender" tipo="put" k={s.putCorta!} p={s.precios!.putCorta} corta />
            <Pata accion="comprar" tipo="put" k={s.putLarga!} p={s.precios!.putLarga} />
          </div>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 14, marginTop: 10 }}>
            <span>crédito <b style={{ color: C.verde }}>${s.credito}</b></span>
            <span>riesgo máximo <b>${s.riesgoMax}</b></span>
            <span>gana entre <b>{s.rangoGanador?.[0]}</b> y <b>{s.rangoGanador?.[1]}</b></span>
          </div>
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
            <b>Cortas</b> (las que vendes) definen dónde ganas; <b>largas</b> (las que compras) definen
            cuánto puedes perder — son el seguro. Precios cruzando la horquilla entera. Sostener al
            cierre: SPX se liquida en efectivo y salir antes cuesta más que la pérdida máxima.
          </p>
        </div>
      )}

      {/* ── LA TABLA DE DECISIÓN ── */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Qué encaja con lo que hay hoy</div>
        <table className="cs-table">
          <thead><tr><th>Lo que ves</th><th>Lo que encaja</th></tr></thead>
          <tbody>
            <tr style={(d.gexNeto ?? 0) > 0 && peorMuro?.nivel === "bueno" ? { background: "var(--green-bg)" } : undefined}>
              <td>GEX positivo <b>y muros lejos</b></td>
              <td>vender rango (cóndor, spreads): el freno trabaja a favor</td>
            </tr>
            <tr style={(d.gexNeto ?? 0) <= 0 ? { background: "var(--green-bg)" } : undefined}>
              <td>GEX negativo</td>
              <td><b>no vender rango.</b> Los muros se rompen; comprar movimiento encaja mejor</td>
            </tr>
            <tr style={(d.gexNeto ?? 0) > 0 && peorMuro?.nivel !== "bueno" ? { background: "var(--green-bg)" } : undefined}>
              <td>GEX positivo <b>pero muros pegados</b></td>
              <td>régimen bueno, <b>entrada mala</b>. Esperar</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: C.tenue, marginTop: 6 }}>
          La fila resaltada es la que corresponde a lo que hay ahora mismo en pantalla.
          El GEX <b>no dice si va a subir o bajar</b> — dice si el mercado tiene freno o acelerador.
        </div>
      </div>

      {d.historia && (
        <div style={{ fontSize: 12, marginTop: 14, padding: "9px 12px", borderRadius: 8, background: "rgba(148,163,184,.07)" }}>
          <span className="muted">Respaldo — {d.historia.n} días (2024-2026): con GEX positivo esta estructura acertó </span>
          <b>{d.historia.aciertoConSeñal}%</b><span className="muted">, media </span><b>{d.historia.mediaConSeñal}%</b>
          <span className="muted"> por operación (t=2,09). </span>
          <b style={{ color: C.ambar }}>Nunca se ha operado hacia adelante</b>
          <span className="muted">, y el crédito real del forward-test viene muy por debajo del backtest.</span>
        </div>
      )}
    </div>
  );
}
