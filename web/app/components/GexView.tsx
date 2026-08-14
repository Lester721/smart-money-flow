"use client";

import { useCallback, useEffect, useState } from "react";
// Petición compartida: este panel y PanelDecision necesitan los MISMOS datos. Si cada uno
// pidiera lo suyo serían dos esperas de ~20 s y, peor, dos fotos de instantes distintos.
import { pedirGex } from "@/lib/gexCliente";

// GEX de SPX 0DTE — el diseño de MarketSnack (docs/referencias-visuales) en oscuro, con lo
// mismo que enseñan ellos y cuatro cosas que no enseñan:
//
//   1. El PERCENTIL del GEX contra los 652 días medidos. "−$22B" no dice si es mucho.
//   2. Cuántas veces AGUANTA un muro a esa distancia. Uno pegado al precio aguanta el 58-65%;
//      uno a 0,6-1% aguanta el 92%. Lo que decide es la distancia, no lo alta que sea la barra.
//   3. La SEÑAL: los cuatro strikes con precios reales, o el veto. Con su respaldo al lado.
//   4. Escala robusta: al filo del cierre la gamma al dinero es 3.000× la del resto y con escala
//      lineal desaparece todo lo demás. Se escala al percentil 90 y lo que se pasa lleva "›".

interface Barra { strike: number; call: number; put: number; oiCall: number; oiPut: number }
interface Señal {
  operar: boolean; motivo?: string; credito?: number; riesgoMax?: number;
  callCorta?: number; callLarga?: number; putCorta?: number; putLarga?: number;
  deltaCorta?: number; rangoGanador?: [number, number];
  precios?: { callCorta: number; callLarga: number; putCorta: number; putLarga: number };
}
interface Datos {
  ok: boolean; motivo?: string; dia: string; hora?: string; ahora: string; ms?: number;
  spx?: number; minutosAlCierre?: number;
  gexNeto?: number; gexCalls?: number; gexPuts?: number; oiTotal?: number;
  nominal?: number; volumen?: number; primaDia?: number;
  muroCall?: number | null; muroPut?: number | null; giro?: number | null;
  barras?: Barra[];
  historia?: { n: number; percentil: number | null; aciertoConSeñal: number; mediaConSeñal: number } | null;
  aguante?: { call: number | null; put: number | null; distCall: number | null; distPut: number | null; n: number } | null;
  señal?: Señal;
}

const M = (x: number) => (Math.abs(x) >= 1000 ? `${(x / 1000).toFixed(1)}B` : `${Math.round(x)}M`);
const K = (x: number) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1000 ? `${(x / 1000).toFixed(1)}K` : `${x}`);

const C = {
  rojo: "#F04438", verde: "#12B76A", azul: "#3B82F6", ambar: "#F79009",
  linea: "rgba(148,163,184,.18)", tenue: "rgba(148,163,184,.75)",
};

export default function GexView() {
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nStrikes, setNStrikes] = useState(40);

  const cargar = useCallback(async (forzar = false) => {
    setCargando(true); setError(null);
    try { setD(await pedirGex(forzar)); }
    catch (e) { setError(String(e)); }
    setCargando(false);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  if (!d && cargando) return <div className="card"><p>Calculando el GEX contra el Terminal…</p></div>;
  if (error) return <div className="card"><p>No se pudo cargar: {error}</p></div>;
  if (!d) return null;
  if (!d.ok) return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>GEX 0DTE · SPX</h2>
      <p style={{ color: C.ambar }}>{d.motivo}</p>
      <p className="muted">Necesita el Theta Terminal encendido. {d.dia} · {d.ahora} ET</p>
      <button className="btn" onClick={() => void cargar(true)}>Reintentar</button>
    </div>
  );

  const U = d.spx ?? 0;
  const cerca = [...(d.barras ?? [])]
    .sort((a, b) => Math.abs(a.strike - U) - Math.abs(b.strike - U))
    .slice(0, nStrikes)
    .sort((a, b) => a.strike - b.strike);
  const strikePrecio = cerca.reduce((a, b) => (Math.abs(b.strike - U) < Math.abs(a.strike - U) ? b : a), cerca[0])?.strike;
  const vals = cerca.flatMap((b) => [b.call, b.put]).filter((x) => x > 0).sort((a, b) => a - b);
  const tope = Math.max(1, vals[Math.floor(vals.length * 0.9)] ?? 1);
  const ancho = (v: number) => Math.min(100, (v / tope) * 100);
  const pos = (d.gexNeto ?? 0) > 0;

  return (
    <>
      {/* ══ cabecera: ticker + métricas ══ */}
      <div className="card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 24px", flexWrap: "wrap" }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: C.rojo, color: "#fff",
                        display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13 }}>500</div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.1 }}>SPX</div>
            <div className="muted" style={{ fontSize: 12 }}>S&amp;P 500 · vencimiento de hoy</div>
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, marginLeft: 8, fontVariantNumeric: "tabular-nums" }}>
            {U.toLocaleString("es-ES", { minimumFractionDigits: 2 })}
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }} className="muted">
            <div style={{ fontSize: 12 }}>foto de las <b style={{ color: "var(--text)" }}>{d.hora}</b> ET · quedan {d.minutosAlCierre} min</div>
            <div style={{ fontSize: 11 }}>calculado en {((d.ms ?? 0) / 1000).toFixed(1)} s</div>
          </div>
          <button className="btn" onClick={() => void cargar(true)} disabled={cargando}>{cargando ? "…" : "Actualizar"}</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
                      borderTop: `1px solid ${C.linea}` }}>
          <Metrica t="Net GEX" v={`${pos ? "+" : "−"}$${M(Math.abs(d.gexNeto ?? 0))}`} color={pos ? C.verde : C.rojo}
                   pie={d.historia?.percentil != null ? `percentil ${d.historia.percentil} de ${d.historia.n} días` : undefined} />
          <Metrica t="Notional" v={`$${M(d.nominal ?? 0)}`} pie="ajustado por delta" />
          <Metrica t="Prima del día" v={`$${M(d.primaDia ?? 0)}`} pie="volumen × vwap real" />
          <Metrica t="Open Interest" v={K(d.oiTotal ?? 0)} pie="del cierre de ayer" />
          <Metrica t="Volumen" v={K(d.volumen ?? 0)} pie="contratos hoy" />
          <Metrica t="Gamma calls / puts" v={`$${M(d.gexCalls ?? 0)} / $${M(d.gexPuts ?? 0)}`} />
        </div>
      </div>

      {/* La SEÑAL ya no se pinta aquí: se mudó a `PanelDecision`, que va DEBAJO del panel de
          vencimientos. Lo pidió Lester el 2026-08-14 y tiene sentido — la decisión se toma
          después de ver el contexto (cuánta gamma hay y dónde está), no antes. Los datos son
          los mismos: los dos paneles comparten una sola petición vía `lib/gexCliente`. */}

      {/* El perfil por strike se mudó a `GexPerfil` para poder ponerlo AL LADO del panel de
          decisión (lo pidió Lester el 2026-08-14). El gráfico dice DÓNDE están los muros y el
          panel dice SI COMPENSA apoyarse en ellos: juntos se leen de un vistazo. */}
    </>
  );
}

function Metrica({ t, v, pie, color }: { t: string; v: string; pie?: string; color?: string }) {
  return (
    <div style={{ padding: "14px 20px", borderRight: `1px solid ${C.linea}` }}>
      <div style={{ fontSize: 11, color: C.tenue, letterSpacing: ".03em" }}>{t}</div>
      <div style={{ fontSize: 21, fontWeight: 700, color, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{v}</div>
      {pie && <div style={{ fontSize: 10.5, color: C.tenue, marginTop: 1 }}>{pie}</div>}
    </div>
  );
}

function Pata({ accion, tipo, k, p, corta, extra }: {
  accion: string; tipo: string; k: number; p: number; corta?: boolean; extra?: string;
}) {
  const col = corta ? (tipo === "call" ? C.verde : C.rojo) : C.tenue;
  return (
    <div style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${corta ? col + "55" : C.linea}`,
                  background: corta ? col + "12" : "transparent" }}>
      <div style={{ fontSize: 11, color: C.tenue }}>{accion} {tipo}{extra ? ` · ${extra}` : ""}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 2 }}>
        <b style={{ fontSize: 17, fontVariantNumeric: "tabular-nums" }}>{k.toLocaleString("es-ES")}</b>
        <span style={{ fontSize: 13, color: col }}>${p.toFixed(2)}</span>
      </div>
    </div>
  );
}


