"use client";

import { useCallback, useEffect, useState } from "react";

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

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try { setD(await (await fetch("/api/gex", { cache: "no-store" })).json()); }
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
      <button className="btn" onClick={() => void cargar()}>Reintentar</button>
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
          <button className="btn" onClick={() => void cargar()} disabled={cargando}>{cargando ? "…" : "Actualizar"}</button>
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

      {/* ══ la señal ══ */}
      <div className="card" style={{ borderLeft: `3px solid ${d.señal?.operar ? C.verde : C.rojo}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", padding: "3px 9px", borderRadius: 5,
                         background: d.señal?.operar ? "rgba(18,183,106,.16)" : "rgba(240,68,56,.16)",
                         color: d.señal?.operar ? C.verde : C.rojo }}>
            {d.señal?.operar ? "SEÑAL" : "SIN SEÑAL"}
          </span>
          <b style={{ fontSize: 15 }}>{d.señal?.operar ? "Cóndor de hierro ±25 · alas 50" : "No operar"}</b>
        </div>

        {!d.señal?.operar ? (
          <p style={{ margin: 0 }}>{d.señal?.motivo}. <b>Es lo único firme que hemos medido:</b> con GEX
            negativo la misma estructura da −2% a −5% en todas las horas y las dos mitades del periodo.</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
              <Pata accion="vender" tipo="call" k={d.señal.callCorta!} p={d.señal.precios!.callCorta} corta
                    extra={`delta ${d.señal.deltaCorta}`} />
              <Pata accion="comprar" tipo="call" k={d.señal.callLarga!} p={d.señal.precios!.callLarga} />
              <Pata accion="vender" tipo="put" k={d.señal.putCorta!} p={d.señal.precios!.putCorta} corta />
              <Pata accion="comprar" tipo="put" k={d.señal.putLarga!} p={d.señal.precios!.putLarga} />
            </div>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 14 }}>
              <span>crédito <b style={{ color: C.verde }}>${d.señal.credito}</b></span>
              <span>riesgo máximo <b>${d.señal.riesgoMax}</b></span>
              <span>gana entre <b>{d.señal.rangoGanador?.[0]}</b> y <b>{d.señal.rangoGanador?.[1]}</b></span>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              Precios cruzando la horquilla entera. Sostener al cierre: SPX se liquida en efectivo y
              salir antes cuesta más que la pérdida máxima.
            </p>
          </>
        )}
        {d.historia && (
          <div style={{ fontSize: 12, padding: "9px 12px", borderRadius: 8, background: "rgba(148,163,184,.07)" }}>
            <span className="muted">Respaldo — {d.historia.n} días (2024-2026): con GEX positivo esta estructura
              acertó </span><b>{d.historia.aciertoConSeñal}%</b>
            <span className="muted">, media </span><b>{d.historia.mediaConSeñal}%</b>
            <span className="muted"> por operación (t=2,09). </span>
            <b style={{ color: C.ambar }}>Nunca se ha operado hacia adelante.</b>
          </div>
        )}
      </div>

      {/* ══ el perfil por strike ══ */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <b style={{ fontSize: 15 }}>Gamma Exposure</b>
            <span className="muted" style={{ fontSize: 12, marginLeft: 10 }}>por cada 1% que se mueva el índice</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>strikes</span>
            {[20, 40, 60, 100].map((n) => (
              <button key={n} onClick={() => setNStrikes(n)}
                style={{ fontSize: 12, padding: "3px 11px", borderRadius: 6, cursor: "pointer",
                         border: `1px solid ${nStrikes === n ? C.azul : "rgba(148,163,184,.3)"}`,
                         background: nStrikes === n ? C.azul : "transparent",
                         color: nStrikes === n ? "#fff" : "inherit", fontWeight: nStrikes === n ? 700 : 400 }}>{n}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, fontSize: 11 }} className="muted">
          <span style={{ flex: 1, textAlign: "right" }}>◀ PUTS · amplifican</span>
          <span style={{ width: 96, textAlign: "center" }}>strike</span>
          <span style={{ flex: 1 }}>CALLS · amortiguan ▶</span>
        </div>

        <div>
          {[...cerca].reverse().map((b) => {
            const mC = d.muroCall === b.strike, mP = d.muroPut === b.strike;
            const esPrecio = b.strike === strikePrecio;
            const esGiro = d.giro != null && Math.abs(b.strike - d.giro) < 3;
            return (
              <div key={b.strike}>
                {esGiro && <Marca texto={`Gamma Flip ${d.giro?.toLocaleString("es-ES")}`} color={C.ambar} punteada izquierda />}
                {esPrecio && <Marca texto={`SPX ${U.toLocaleString("es-ES", { minimumFractionDigits: 2 })}`} color={C.azul} />}
                <div style={{ display: "flex", alignItems: "center", gap: 8, height: 16 }}>
                  <div style={{ width: 58, textAlign: "right", fontSize: 10.5, color: C.tenue, fontVariantNumeric: "tabular-nums" }}>
                    {b.put > 0 ? `$${M(b.put / 1e6)}` : ""}
                  </div>
                  <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 3 }}>
                    {b.put > tope && <span style={{ fontSize: 10, color: C.rojo, fontWeight: 700 }}>‹</span>}
                    {b.put > 0 && <div style={{ width: 5, height: 5, borderRadius: 3, background: C.rojo }} />}
                    <div style={{ width: `${ancho(b.put)}%`, height: 8, background: C.rojo, borderRadius: 2,
                                  opacity: mP ? 1 : .8, outline: mP ? `1.5px solid ${C.rojo}` : undefined, outlineOffset: 2 }} />
                  </div>
                  <div style={{ width: 96, textAlign: "center", fontSize: 11.5, fontVariantNumeric: "tabular-nums",
                                fontWeight: esPrecio || mC || mP ? 700 : 400 }}>
                    {mP && <Etiq t="PW" c={C.rojo} antes />}
                    {b.strike.toLocaleString("es-ES")}
                    {mC && <Etiq t="CW" c={C.verde} />}
                  </div>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 3 }}>
                    <div style={{ width: `${ancho(b.call)}%`, height: 8, background: C.verde, borderRadius: 2,
                                  opacity: mC ? 1 : .8, outline: mC ? `1.5px solid ${C.verde}` : undefined, outlineOffset: 2 }} />
                    {b.call > 0 && <div style={{ width: 5, height: 5, borderRadius: 3, background: C.verde }} />}
                    {b.call > tope && <span style={{ fontSize: 10, color: C.verde, fontWeight: 700 }}>›</span>}
                  </div>
                  <div style={{ width: 58, fontSize: 10.5, color: C.tenue, fontVariantNumeric: "tabular-nums" }}>
                    {b.call > 0 ? `$${M(b.call / 1e6)}` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {d.aguante && (d.aguante.call != null || d.aguante.put != null) && (
          <div style={{ padding: "10px 13px", borderRadius: 9, background: "rgba(59,130,246,.09)", fontSize: 13 }}>
            <b>Cuántas veces aguanta un muro a esa distancia</b> <span className="muted">({d.aguante.n} días medidos)</span><br />
            <span style={{ color: C.verde }}>■</span> muro de calls a <b>{d.aguante.distCall}%</b> → aguantó el <b>{d.aguante.call}%</b>
            {"   ·   "}
            <span style={{ color: C.rojo }}>■</span> muro de puts a <b>{d.aguante.distPut}%</b> → aguantó el <b>{d.aguante.put}%</b>
            <div className="muted" style={{ marginTop: 5 }}>
              Lo que decide es la <b>distancia</b>, no lo alta que sea la barra: pegado al precio (0-0,3%)
              aguanta el 58-65%; a 0,6-1% aguanta el 92%.
            </div>
          </div>
        )}

        <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>
          <b>CW</b> muro de calls · <b>PW</b> muro de puts · línea ámbar = punto de giro de gamma (donde el
          GEX neto cambiaría de signo) · línea azul = precio · <b>›</b> <b>‹</b> = la barra se sale de la
          escala, vale el número de al lado.
          {d.giro == null && " Hoy no hay punto de giro en el ±3%: la gamma es del mismo signo en todo el rango."}
        </p>
      </div>
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

function Marca({ texto, color, punteada, izquierda }: { texto: string; color: string; punteada?: boolean; izquierda?: boolean }) {
  const pill = <div style={{ fontSize: 10.5, fontWeight: 700, color, background: `${color}22`,
                             padding: "1px 8px", borderRadius: 10, whiteSpace: "nowrap" }}>{texto}</div>;
  const linea = <div style={{ flex: 1, borderTop: `1.5px ${punteada ? "dashed" : "solid"} ${color}` }} />;
  return <div style={{ display: "flex", alignItems: "center", gap: 8, height: 17 }}>
    {izquierda ? <>{pill}{linea}</> : <>{linea}{pill}{linea}</>}
  </div>;
}

function Etiq({ t, c, antes }: { t: string; c: string; antes?: boolean }) {
  return <span style={{ [antes ? "marginRight" : "marginLeft"]: 5, fontSize: 8.5, fontWeight: 800,
                        background: `${c}22`, color: c, padding: "1px 4px", borderRadius: 3,
                        letterSpacing: ".04em" }}>{t}</span>;
}
