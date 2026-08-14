"use client";

import { useCallback, useEffect, useState } from "react";
import { pedirGex, type DatosGex } from "@/lib/gexCliente";

// EL PERFIL DE GAMMA POR STRIKE — vivía dentro de `GexView`. Se sacó a su propio componente el
// 2026-08-14 para poder ponerlo AL LADO del panel de decisión, que es como Lester lo pidió:
//
//   "Esta tabla me encanta. Pero me gustaría verla a la vez que veo la tabla de gamma exposure."
//
// Tiene sentido: el gráfico dice DÓNDE están los muros y el panel de decisión dice SI COMPENSA
// apoyarse en ellos. Mirar uno y luego bajar al otro obliga a recordar números; uno al lado del
// otro se lee de un vistazo.
//
// Comparte la petición con los demás paneles vía `lib/gexCliente`: una sola llamada para todos.

const C = {
  rojo: "#F04438", verde: "#12B76A", azul: "#3B82F6", ambar: "#F79009",
  tenue: "rgba(148,163,184,.75)",
};
const M = (x: number) => (Math.abs(x) >= 1000 ? `${(x / 1000).toFixed(1)}B` : `${Math.round(x)}M`);

export default function GexPerfil() {
  const [d, setD] = useState<DatosGex | null>(null);
  const [cargando, setCargando] = useState(true);
  const [nStrikes, setNStrikes] = useState(40);

  const cargar = useCallback(async (forzar = false) => {
    setCargando(true);
    try { setD(await pedirGex(forzar)); } finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  if (cargando && !d) return <div className="card"><p>Calculando el perfil de gamma…</p></div>;
  if (!d?.ok) return <div className="card"><b style={{ fontSize: 17 }}>Gamma Exposure</b>
    <p className="muted">{d?.motivo ?? "sin datos"}</p></div>;

  const U = d.spx ?? 0;
  const cerca = [...(d.barras ?? [])]
    .sort((a, b) => Math.abs(a.strike - U) - Math.abs(b.strike - U))
    .slice(0, nStrikes)
    .sort((a, b) => a.strike - b.strike);
  const strikePrecio = cerca.reduce((a, b) => (Math.abs(b.strike - U) < Math.abs(a.strike - U) ? b : a), cerca[0])?.strike;
  const vals = cerca.flatMap((b) => [b.call, b.put]).filter((x) => x > 0).sort((a, b) => a - b);
  // Escala robusta: al filo del cierre la gamma al dinero es miles de veces la del resto y con
  // escala lineal desaparece todo lo demás. Se escala al percentil 90 y lo que se pasa lleva "›".
  const tope = Math.max(1, vals[Math.floor(vals.length * 0.9)] ?? 1);
  const ancho = (v: number) => Math.min(100, (v / tope) * 100);

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <b style={{ fontSize: 17 }}>Gamma Exposure</b>
          <span className="muted" style={{ fontSize: 13, marginLeft: 10 }}>por cada 1% que se mueva el índice</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="muted" style={{ fontSize: 13 }}>strikes</span>
          {[20, 40, 60, 100].map((n) => (
            <button key={n} onClick={() => setNStrikes(n)}
              style={{ fontSize: 13, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
                       border: `1px solid ${nStrikes === n ? C.azul : "rgba(148,163,184,.3)"}`,
                       background: nStrikes === n ? C.azul : "transparent",
                       color: nStrikes === n ? "#fff" : "inherit", fontWeight: nStrikes === n ? 700 : 400 }}>{n}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, fontSize: 12.5 }} className="muted">
        <span style={{ flex: 1, textAlign: "right" }}>◀ PUTS · amplifican</span>
        <span style={{ width: 104, textAlign: "center" }}>strike</span>
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
              <div style={{ display: "flex", alignItems: "center", gap: 8, height: 22 }}>
                <div style={{ width: 66, textAlign: "right", fontSize: 12.5, color: C.tenue, fontVariantNumeric: "tabular-nums" }}>
                  {b.put > 0 ? `$${M(b.put / 1e6)}` : ""}
                </div>
                <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 3 }}>
                  {b.put > tope && <span style={{ fontSize: 12, color: C.rojo, fontWeight: 700 }}>‹</span>}
                  {b.put > 0 && <div style={{ width: 6, height: 6, borderRadius: 3, background: C.rojo }} />}
                  <div style={{ width: `${ancho(b.put)}%`, height: 11, background: C.rojo, borderRadius: 2,
                                opacity: mP ? 1 : .8, outline: mP ? `1.5px solid ${C.rojo}` : undefined, outlineOffset: 2 }} />
                </div>
                <div style={{ width: 104, textAlign: "center", fontSize: 14.5, fontVariantNumeric: "tabular-nums",
                              fontWeight: esPrecio || mC || mP ? 700 : 500 }}>
                  {mP && <Etiq t="PW" c={C.rojo} antes />}
                  {b.strike.toLocaleString("es-ES")}
                  {mC && <Etiq t="CW" c={C.verde} />}
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 3 }}>
                  <div style={{ width: `${ancho(b.call)}%`, height: 11, background: C.verde, borderRadius: 2,
                                opacity: mC ? 1 : .8, outline: mC ? `1.5px solid ${C.verde}` : undefined, outlineOffset: 2 }} />
                  {b.call > 0 && <div style={{ width: 6, height: 6, borderRadius: 3, background: C.verde }} />}
                  {b.call > tope && <span style={{ fontSize: 12, color: C.verde, fontWeight: 700 }}>›</span>}
                </div>
                <div style={{ width: 66, fontSize: 12.5, color: C.tenue, fontVariantNumeric: "tabular-nums" }}>
                  {b.call > 0 ? `$${M(b.call / 1e6)}` : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>
        <b>CW</b> muro de calls · <b>PW</b> muro de puts · línea ámbar = punto de giro de gamma (donde el
        GEX neto cambiaría de signo) · línea azul = precio · <b>›</b> <b>‹</b> = la barra se sale de la
        escala, vale el número de al lado.
        {d.giro == null && " Hoy no hay punto de giro en el ±3%: la gamma es del mismo signo en todo el rango."}
      </p>
    </div>
  );
}

function Marca({ texto, color, punteada, izquierda }: { texto: string; color: string; punteada?: boolean; izquierda?: boolean }) {
  const pill = <div style={{ fontSize: 12, fontWeight: 700, color, background: `${color}22`,
                             padding: "2px 9px", borderRadius: 10, whiteSpace: "nowrap" }}>{texto}</div>;
  const linea = <div style={{ flex: 1, borderTop: `1.5px ${punteada ? "dashed" : "solid"} ${color}` }} />;
  return <div style={{ display: "flex", alignItems: "center", gap: 8, height: 22 }}>
    {izquierda ? <>{pill}{linea}</> : <>{linea}{pill}{linea}</>}
  </div>;
}

function Etiq({ t, c, antes }: { t: string; c: string; antes?: boolean }) {
  return <span style={{ [antes ? "marginRight" : "marginLeft"]: 5, fontSize: 10, fontWeight: 800,
                        background: `${c}22`, color: c, padding: "1px 5px", borderRadius: 3,
                        letterSpacing: ".04em" }}>{t}</span>;
}
