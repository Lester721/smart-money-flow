"use client";

// LA TABLA DE ESTRATEGIAS, AÑO POR AÑO.
//
// Lester pidió tres columnas que un $/año promedio esconde: la peor pérdida del año, y las
// rachas. La racha perdedora es la que decide si aguantarías la estrategia en la vida real —
// un año que cierra en verde con nueve perdedoras seguidas en medio se abandona en la séptima.
//
// Los números NO se escriben aquí: salen de lib/estrategias-por-ano.json, que genera
// scripts/estrategias-por-ano.mjs desde las cadenas con precios reales. Si se transcribieran
// a mano, la tabla y el cálculo acabarían diciendo cosas distintas.

import { useState } from "react";
import datos from "@/lib/estrategias-por-ano.json";

const eur = (x: number) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
const signo = (x: number) => (x > 0 ? "pos" : x < 0 ? "neg" : "");

export default function EstrategiasTabla() {
  // CERRADA al abrir la pagina. Antes arrancaba con la primera desplegada y eso empuja todo lo
  // demas media pantalla hacia abajo cada vez que se refresca. Lester, 31-ago-2026.
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <section className="est-grupo">
      <header className="est-grupo-head">
        <h2><span aria-hidden="true">📊</span> Las estrategias, año por año</h2>
        <p>lo que habría ganado, lo peor que habría pasado, y cuántas seguidas se pierden</p>
      </header>

      <p className="etab-aviso">
        Esto es <strong>backtest</strong>, no resultados. El cóndor va <strong>por contrato</strong> y
        la mezcla sobre <strong>{eur(datos.capital)}</strong> de capital: no son la misma unidad y no
        se suman.
      </p>

      <div className="est-lista">
        {datos.tablas.map((t) => {
          const on = abierta === t.nombre;
          const tot = t.total;
          return (
            <article key={t.nombre} className={`est-item etab ${tot.alAno > 0 ? "est-funciona" : "est-cerrado"}`}>
              <header
                className="est-head"
                role="button"
                tabIndex={0}
                onClick={() => setAbierta(on ? null : t.nombre)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAbierta(on ? null : t.nombre); } }}
              >
                <div className="est-head-main">
                  <h3 className="est-titulo">{t.nombre}</h3>
                  <p className="est-quees">{t.unidad} · {tot.desde} → {tot.hasta}</p>
                  <div className="etab-resumen">
                    <span className={signo(tot.alAno)}><b>{eur(tot.alAno)}</b> al año</span>
                    <span><b>{Math.round(tot.acierto * 100)}%</b> acierto</span>
                    <span className="neg"><b>{eur(tot.peorOp)}</b> peor operación</span>
                    <span className="neg"><b>{tot.rachaPerd}</b> perdedoras seguidas</span>
                  </div>
                </div>
                <span className={`est-flecha ${on ? "on" : ""}`} aria-hidden="true">▾</span>
              </header>

              {on ? (
                <div className="est-detalle">
                  <div className="etab-scroll">
                    <table className="etab-tabla">
                      <thead>
                        <tr>
                          <th>año</th><th>ops</th><th>ganancia</th>
                          <th>peor operación</th><th>peor caída seguida</th>
                          <th>racha perdedora</th><th>racha ganadora</th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.porAno.map((a) => (
                          <tr key={a.ano}>
                            <td>{a.ano}</td>
                            <td>{a.ops}</td>
                            <td className={signo(a.ganancia)}><b>{eur(a.ganancia)}</b></td>
                            <td className={signo(a.peorOp)}>{eur(a.peorOp)}</td>
                            <td className={signo(a.peorCaida)}>{eur(a.peorCaida)}</td>
                            <td>{a.rachaPerd}</td>
                            <td>{a.rachaGan}</td>
                          </tr>
                        ))}
                        <tr className="etab-total">
                          <td>todo</td>
                          <td>{tot.ops}</td>
                          <td className={signo(tot.ganancia)}><b>{eur(tot.ganancia)}</b></td>
                          <td className={signo(tot.peorOp)}>{eur(tot.peorOp)}</td>
                          <td className={signo(tot.peorCaida)}>{eur(tot.peorCaida)}</td>
                          <td><b>{tot.rachaPerd}</b></td>
                          <td>{tot.rachaGan}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {t.nota ? (
                    // El titulo NO es solo "En contra": este bloque muestra `nota`, que trae la
                    // regla entera Y sus avisos juntos. Con el nombre viejo pasaba desapercibido;
                    // al renombrarlo quedo a la vista que la etiqueta mentia. Se dice lo que hay.
                    <div className="est-bloque est-encontra">
                      <h4>Cómo funciona, y lo que va en contra</h4>
                      <p>{t.nota}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <p className="etab-pie">
        Generado el {datos.generado} por <code>scripts/estrategias-por-ano.mjs</code>, desde las
        cadenas con bid/ask reales. <strong>&quot;Peor caída seguida&quot;</strong> no es lo mismo
        que <strong>&quot;peor operación&quot;</strong>: son varias pequeñas encadenadas, y duelen igual.
      </p>
    </section>
  );
}
