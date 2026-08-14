"use client";

import { useCallback, useEffect, useState } from "react";

// GEX POR VENCIMIENTO — la vista "Trading Session" de MarketSnack, con lo que ellos no ponen.
//
// LA PREGUNTA QUE RESPONDE: de toda la gamma que hay hoy en el tablero, ¿en qué vencimiento
// está? Nuestra vista de arriba agrega todo en un número, y así no se ve.
//
// POR QUÉ IMPORTA Y NO ES COSMÉTICO: está medido que la gamma pega el DOBLE a 1 día que a 10
// (tabla de esta misma página). Si el peso está en el vencimiento de dentro de dos días y no en
// el 0DTE, el mecanismo del que vive el cóndor no está donde lo suponemos.
//
// LO QUE AÑADIMOS SOBRE ELLOS:
//   1. El aviso del horario. La gamma va como 1/√T, así que el peso del 0DTE SUBE SOLO según
//      avanza la sesión, sin que nadie abra una posición. Comparar dos días a horas distintas
//      es comparar peras con manzanas. Ellos no lo dicen.
//   2. Los muros de cada vencimiento, no sólo el agregado.
//   3. El nominal AJUSTADO POR DELTA. El bruto infla por diez y no significa nada.

interface Venc {
  exp: string; dte: number; gexNeto: number; gexCalls: number; gexPuts: number;
  nominal: number; oi: number; volumen: number; primaDia: number;
  muroCall: number | null; muroPut: number | null; peso: number;
}
interface Datos {
  ok: boolean; motivo?: string; dia: string; hora?: string; ahora: string; ms?: number;
  spx?: number; gexNetoTotal?: number;
  dominante?: { exp: string; dte: number; peso: number };
  elPesoEstaEn0dte?: boolean;
  vencimientos?: Venc[];
}

const M = (x: number) => (Math.abs(x) >= 1000 ? `${(x / 1000).toFixed(1)}B` : `${Math.round(x)}M`);
const C = { verde: "#12B76A", rojo: "#F04438", azul: "#3B82F6", tenue: "rgba(148,163,184,.75)", linea: "rgba(148,163,184,.18)" };

export default function GexVencimientos() {
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const r = await fetch("/api/gex/vencimientos?n=5", { cache: "no-store" });
      setD(await r.json());
    } catch (e) { setError((e as Error).message); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>¿En qué vencimiento está la gamma?</div>
          <div className="card-sub" style={{ maxWidth: 620 }}>
            El mismo GEX de arriba, pero repartido. Arriba se ve <em>cuánta</em> hay; aquí, <em>dónde</em> está.
          </div>
        </div>
        <button onClick={cargar} disabled={cargando} style={{
          border: `1px solid ${C.linea}`, background: "transparent", color: "inherit",
          borderRadius: 8, padding: "6px 12px", cursor: cargando ? "default" : "pointer", fontSize: 13,
        }}>{cargando ? "calculando…" : "actualizar"}</button>
      </div>

      {error && <div style={{ color: C.rojo, marginTop: 12 }}>Error: {error}</div>}

      {d && !d.ok && (
        <div style={{ marginTop: 14, padding: 12, border: `1px solid ${C.linea}`, borderRadius: 10, color: C.tenue }}>
          Sin datos: {d.motivo}
          <div style={{ fontSize: 12, marginTop: 6 }}>
            Esto necesita el Theta Terminal encendido. No se rellena con nada: si no hay dato, no hay número.
          </div>
        </div>
      )}

      {d?.ok && d.vencimientos && (
        <>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 14, fontSize: 13, color: C.tenue }}>
            <span>SPX <b style={{ color: "inherit" }}>{d.spx?.toLocaleString("es-ES")}</b></span>
            <span>foto de las <b>{d.hora}</b> ET</span>
            <span>{d.vencimientos.length} vencimientos</span>
            {d.ms != null && <span>{(d.ms / 1000).toFixed(1)} s de cálculo</span>}
          </div>

          {/* La lectura, en una frase. Es lo que de verdad se quiere saber. */}
          {d.dominante && (
            <div style={{
              marginTop: 14, padding: "10px 14px", borderRadius: 10,
              border: `1px solid ${d.elPesoEstaEn0dte ? "rgba(18,183,106,.35)" : "rgba(247,144,9,.35)"}`,
              background: d.elPesoEstaEn0dte ? "rgba(18,183,106,.08)" : "rgba(247,144,9,.08)",
            }}>
              <b>{d.elPesoEstaEn0dte ? "El peso está en el 0DTE" : "El peso NO está en el 0DTE"}</b>
              {" — manda el vencimiento del "}<b>{d.dominante.exp}</b>
              {d.dominante.dte === 0 ? " (hoy mismo)" : ` (a ${d.dominante.dte} día${d.dominante.dte === 1 ? "" : "s"})`}
              {" con el "}<b>{d.dominante.peso}%</b> de la gamma del tablero.
              {!d.elPesoEstaEn0dte && (
                <div style={{ fontSize: 12, marginTop: 6, color: C.tenue }}>
                  El cóndor 0DTE se apoya en la gamma de hoy. Si el grueso está en otro vencimiento,
                  el mecanismo es más débil de lo que sugiere el número agregado.
                </div>
              )}
            </div>
          )}

          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {d.vencimientos.map((v) => {
              const positivo = v.gexNeto >= 0;
              return (
                <div key={v.exp} style={{
                  border: `1px solid ${v.exp === d.dominante?.exp ? "rgba(59,130,246,.45)" : C.linea}`,
                  borderRadius: 10, padding: "10px 14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 15 }}>{v.exp}</b>
                    <span style={{
                      fontSize: 11, padding: "2px 7px", borderRadius: 999,
                      border: `1px solid ${C.linea}`, color: C.tenue,
                    }}>{v.dte === 0 ? "0DTE" : `${v.dte}D`}</span>
                    <span style={{ marginLeft: "auto", fontWeight: 700, color: positivo ? C.verde : C.rojo }}>
                      {positivo ? "+" : "−"}${M(Math.abs(v.gexNeto))}
                    </span>
                    <span style={{ fontSize: 13, color: C.tenue, minWidth: 46, textAlign: "right" }}>{v.peso}%</span>
                  </div>

                  {/* La barra es la CUOTA de gamma, no el neto: un vencimiento con mucha gamma
                      repartida a los dos lados manda aunque su neto sea casi cero. */}
                  <div style={{ height: 6, background: "rgba(148,163,184,.12)", borderRadius: 999, marginTop: 8, overflow: "hidden" }}>
                    <div style={{ width: `${v.peso}%`, height: "100%", background: C.azul, borderRadius: 999 }} />
                  </div>

                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: 12, color: C.tenue }}>
                    <span>muro calls <b style={{ color: "inherit" }}>{v.muroCall ?? "—"}</b></span>
                    <span>muro puts <b style={{ color: "inherit" }}>{v.muroPut ?? "—"}</b></span>
                    <span>nominal δ ${M(v.nominal)}</span>
                    <span>OI {(v.oi / 1000).toFixed(0)}K</span>
                    <span>vol {(v.volumen / 1000).toFixed(0)}K</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CÓMO SE USA. Lester, 2026-08-14: "no sé cómo sacarle valor a esa tabla". Con razón:
              enseñaba números sin decir qué hacer con ellos. Los tres usos son concretos. */}
          <div style={{ marginTop: 16, borderTop: `1px solid ${C.linea}`, paddingTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Para qué sirve esta tabla</div>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.65 }}>
              <li>
                <b>Saber si el freno de hoy es de verdad.</b> Si el grueso está en el 0DTE, la gamma
                aprieta <em>hoy</em>. Si está repartida en vencimientos lejanos, el número agregado
                promete un freno más firme del que hay. Está medido que la gamma pega el doble a un
                día que a diez.
              </li>
              <li>
                <b>Encontrar los niveles fuertes: los que se repiten.</b> Mira la columna de muros.
                Un strike que aparece como muro en <em>varios</em> vencimientos a la vez es mucho
                más sólido que uno que sale en uno solo — hay dinero apilado ahí a distintos plazos,
                no una sola posición grande. {(() => {
                  const cuenta = new Map<number, number>();
                  for (const v of d.vencimientos!) for (const k of [v.muroCall, v.muroPut]) if (k != null) cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
                  const rep = [...cuenta.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
                  return rep.length
                    ? <>Ahora mismo se repite <b>{rep[0][0]}</b> en {rep[0][1]} de los muros de la tabla.</>
                    : <>Ahora mismo no hay ningún strike que se repita en tres o más muros: no hay un nivel dominante claro.</>;
                })()}
              </li>
              <li>
                <b>Detectar un vencimiento a contracorriente.</b> Si uno pesa bastante pero su GEX
                neto es <span style={{ color: C.rojo }}>negativo</span> mientras el resto es positivo,
                ahí hay gente posicionada al revés. No es una señal para operar, es un aviso de que
                el freno no es uniforme.
              </li>
            </ol>
          </div>

          {/* Qué es "el tablero" y qué NO es. Lo preguntó Lester el 2026-08-14 y tenía razón:
              estaba escrito de forma que sugería "toda la gamma del mercado", que es falso. */}
          <div style={{ marginTop: 14, fontSize: 12, color: C.tenue, borderTop: `1px solid ${C.linea}`, paddingTop: 10, lineHeight: 1.6 }}>
            <b>Cómo se calcula el peso.</b> Para cada vencimiento se suman su gamma de calls y la de
            puts <b>en valor absoluto</b> (no el neto: un vencimiento con mucha gamma repartida a los
            dos lados manda aunque su neto sea casi cero), y se divide entre la suma de los{" "}
            {d.vencimientos.length}. Por eso los pesos suman 100%.
            <br /><br />
            <b>Lo que NO es:</b> estos {d.vencimientos.length} son los vencimientos <b>más cercanos</b>,
            no todo el mercado. Hay opciones de SPX a meses vista que no entran aquí. El porcentaje
            significa «de la gamma de los próximos días», no «de toda la que existe».
            <br /><br />
            <b>Cuidado al comparar entre días: hazlo siempre a la misma hora.</b> El peso del 0DTE
            se mueve durante la sesión por dos fuerzas opuestas — la gamma crece como 1/√T según se
            acerca el vencimiento, pero al final del día las opciones muy fuera del dinero dejan de
            cotizar y aportan cero. Medido el 2026-08-14: <b>65% a las 12:25 y 47,8% a las 16:00</b>.
            No tenemos medido el patrón, así que dos lecturas a horas distintas <b>no son comparables</b>.
          </div>
        </>
      )}
    </div>
  );
}
