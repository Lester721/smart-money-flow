"use client";

// LA ESCALERA DE GAMMA — el perfil por strike, pero en números.
//
// GexPerfil ya dibuja la misma información como gráfico. La escalera existe porque un gráfico
// contesta "dónde está el bulto" y una escalera contesta "cuánto hay exactamente en 7700", que
// es la pregunta que se hace justo antes de elegir un strike.
//
// Es el panel que MarketSnack llama "Gamma Ladder". Los datos son NUESTROS: salen de /api/gex,
// que recalcula la gamma con la IV real del mercado y el interés abierto del día.
//
// ⚠ ENSEÑA DÓNDE ESTÁ LA POSICIÓN, NO HACIA DÓNDE VA EL PRECIO. Está medido: el precio se para
// en el muro el 38,8% de las veces y en una raya al azar a la misma distancia el 43,2%.

import { useMemo, useState } from "react";

export type Barra = { strike: number; call: number; put: number; oiCall: number; oiPut: number };

const M = (x: number) => (Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : Math.abs(x) >= 1e3 ? `${(x / 1e3).toFixed(0)}k` : x.toFixed(0));

export default function GammaLadder({ barras, spx, muroCall, muroPut, giro }: {
  barras: Barra[] | null | undefined;
  spx?: number | null;
  muroCall?: number | null;
  muroPut?: number | null;
  giro?: number | null;
}) {
  const [radio, setRadio] = useState(15);

  const { filas, maxAbs } = useMemo(() => {
    if (!barras?.length || !spx) return { filas: [] as (Barra & { neto: number })[], maxAbs: 1 };
    // Sólo los strikes alrededor del precio: la cadena entera son 346 filas y nadie lee eso.
    const cerca = barras
      .filter((b) => b.call > 0 || b.put > 0)
      .map((b) => ({ ...b, neto: b.call - b.put }))
      .sort((a, b) => Math.abs(a.strike - spx) - Math.abs(b.strike - spx))
      .slice(0, radio * 2 + 1)
      .sort((a, b) => b.strike - a.strike);            // de mayor a menor, como una escalera
    const maxAbs = Math.max(1, ...cerca.map((b) => Math.max(b.call, b.put)));
    return { filas: cerca, maxAbs };
  }, [barras, spx, radio]);

  if (!filas.length) return null;

  return (
    <section className="card glad">
      <div className="glad-head">
        <div>
          <h3 className="card-title">Escalera de gamma</h3>
          <p className="card-sub">cuánta gamma hay en cada strike · el mismo dato del perfil, en números</p>
        </div>
        <div className="glad-radio">
          {[10, 15, 25].map((r) => (
            <button key={r} type="button" className={`glad-r ${radio === r ? "on" : ""}`} onClick={() => setRadio(r)}>
              ±{r}
            </button>
          ))}
        </div>
      </div>

      <div className="glad-scroll">
        <table className="glad-tabla">
          <thead>
            <tr>
              <th className="glad-izq">gamma puts</th>
              <th className="glad-k">strike</th>
              <th className="glad-der">gamma calls</th>
              <th>OI puts</th>
              <th>OI calls</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((b) => {
              const esMuroC = muroCall != null && b.strike === muroCall;
              const esMuroP = muroPut != null && b.strike === muroPut;
              const esGiro = giro != null && Math.abs(b.strike - giro) < 2.5;
              const cruzaPrecio = spx != null && Math.abs(b.strike - spx) < 2.5;
              return (
                <tr key={b.strike} className={cruzaPrecio ? "glad-precio" : ""}>
                  <td className="glad-izq">
                    {/* La barra vive en una PISTA de ancho fijo. Sin ella, el porcentaje se
                        calcula sobre una celda que cambia de ancho y las proporciones mienten. */}
                    <span className="glad-pista">
                      <span className="glad-barra glad-put" style={{ width: `${(b.put / maxAbs) * 100}%` }} />
                    </span>
                    <span className="glad-cifra">{b.put > 0 ? M(b.put) : ""}</span>
                  </td>
                  <td className="glad-k">
                    <b>{b.strike}</b>
                    {esMuroC ? <span className="glad-tag glad-tc">muro calls</span> : null}
                    {esMuroP ? <span className="glad-tag glad-tp">muro puts</span> : null}
                    {esGiro ? <span className="glad-tag glad-tg">giro</span> : null}
                    {cruzaPrecio ? <span className="glad-tag glad-tx">precio</span> : null}
                  </td>
                  <td className="glad-der">
                    <span className="glad-cifra">{b.call > 0 ? M(b.call) : ""}</span>
                    <span className="glad-pista">
                      <span className="glad-barra glad-call" style={{ width: `${(b.call / maxAbs) * 100}%` }} />
                    </span>
                  </td>
                  <td className="glad-oi">{b.oiPut ? b.oiPut.toLocaleString("es-ES") : "—"}</td>
                  <td className="glad-oi">{b.oiCall ? b.oiCall.toLocaleString("es-ES") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="glad-pie">
        Enseña <strong>dónde está la posición</strong>, no hacia dónde va el precio. Medido: el precio
        se para en el muro el <strong>38,8%</strong> de las veces; una raya al azar a la misma
        distancia lo para el <strong>43,2%</strong>.
      </p>
    </section>
  );
}
