"use client";

// EL MAPA DE LIQUIDEZ — dónde se cruza de verdad cada pata, antes de mandar la orden.
//
// El bid/ask de la pantalla es lo que te cobran por cruzar sin pensar. La cinta enseña que la
// mayoría de las operaciones se cruzan por DENTRO de la horquilla. Este panel dice en qué punto
// se está cruzando cada pata hoy, y traduce la diferencia a dólares.
//
// HONESTIDAD SOBRE EL TAMAÑO DEL PREMIO: el famoso "$697 por operación" salió de la cinta de
// MarketSnack sobre contratos caros y de horquilla ancha. En SPX 0DTE la horquilla ya es del 3%,
// así que aquí el ahorro es de dólares, no de cientos. El panel enseña el número real, no el
// del folleto.

import { useCallback, useEffect, useState } from "react";

type Print = { hora: string; precio: number; bid: number; ask: number; tam: number; pos: number };
type Pata = {
  strike: number; right: "C" | "P"; accion: "vender" | "comprar";
  prints: number; hayMapa: boolean; motivo?: string;
  bid?: number; ask?: number; horquilla?: number; horquillaPct?: number;
  posicionMediana?: number; cruzando?: number; realista?: number;
  ahorroPorContrato: number; volumen?: number; ultimos?: Print[];
};
type Resp = {
  ok: boolean; motivo?: string; dia?: string; hora?: string; ms?: number;
  patasConMapa?: number; patasTotales?: number; ahorroTotal?: number; completo?: boolean; detalle?: Pata[];
};

const usd = (x: number) => (x < 0 ? "−$" : "$") + Math.abs(x).toFixed(2);
const pct = (x: number) => (x * 100).toFixed(0) + "%";

export default function MapaLiquidez({ patas, hipotetico = false }: {
  patas?: { callCorta: number; callLarga: number; putCorta: number; putLarga: number } | null;
  /** true cuando la regla dice HOY NO SE OPERA: las patas son las que tocarían, no una orden. */
  hipotetico?: boolean;
}) {
  const [d, setD] = useState<Resp | null>(null);
  const [cargando, setCargando] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    const q = new URLSearchParams();
    if (patas) {
      q.set("callCorta", String(patas.callCorta)); q.set("callLarga", String(patas.callLarga));
      q.set("putCorta", String(patas.putCorta)); q.set("putLarga", String(patas.putLarga));
    }
    fetch(`/api/mapa-liquidez${q.toString() ? `?${q}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setD)
      .catch(() => setD({ ok: false, motivo: "no se pudo consultar la cinta" }))
      .finally(() => setCargando(false));
  }, [patas]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <section className="card mapl">
      <div className="mapl-head">
        <div>
          <h3 className="card-title">Mapa de liquidez</h3>
          <p className="card-sub">
            dónde se cruza de verdad cada pata · <strong>no es el bid/ask de pantalla</strong>
          </p>
          {hipotetico ? (
            <p className="mapl-hipo">
              Hoy la regla dice <strong>no operar</strong>. Estas son las patas que tocarían
              (±45 con alas de 50): el mapa sirve igual para ver cómo está la ejecución.
            </p>
          ) : null}
        </div>
        <button type="button" className="mapl-refrescar" onClick={cargar} disabled={cargando}>
          {cargando ? "leyendo la cinta…" : "actualizar"}
        </button>
      </div>

      {!d ? (
        <p className="mapl-vacio">Leyendo la cinta…</p>
      ) : !d.ok ? (
        <p className="mapl-vacio">{d.motivo}</p>
      ) : (
        <>
          <div className="mapl-total">
            <div>
              <b>{usd(d.ahorroTotal ?? 0)}</b>
              <span>por cóndor, si entras donde se cruza en vez de cruzando la horquilla</span>
            </div>
            {!d.completo ? (
              <p className="mapl-aviso">
                ⚠ Sólo {d.patasConMapa} de {d.patasTotales} patas tienen cinta suficiente. El total
                NO es el del cóndor entero.
              </p>
            ) : null}
          </div>

          <div className="mapl-patas">
            {d.detalle?.map((p) => {
              const id = `${p.strike}${p.right}`;
              const on = abierta === id;
              return (
                <div key={id} className={`mapl-pata ${p.hayMapa ? "" : "mapl-sin"}`}>
                  <button
                    type="button"
                    className="mapl-pata-head"
                    onClick={() => p.hayMapa && setAbierta(on ? null : id)}
                  >
                    <span className={`mapl-accion mapl-${p.accion}`}>{p.accion}</span>
                    <span className="mapl-strike">{p.strike}<sub>{p.right}</sub></span>

                    {p.hayMapa ? (
                      <>
                        <span className="mapl-barra" title={`se cruza en el ${pct(p.posicionMediana!)} de la horquilla`}>
                          <span className="mapl-barra-bid">bid</span>
                          <span className="mapl-barra-pista">
                            <span className="mapl-barra-marca" style={{ left: `${(p.posicionMediana ?? 0) * 100}%` }} />
                          </span>
                          <span className="mapl-barra-ask">ask</span>
                        </span>
                        <span className="mapl-precios">
                          cruzando <b>{p.cruzando!.toFixed(2)}</b> → realista <b>{p.realista!.toFixed(2)}</b>
                        </span>
                        <span className={`mapl-ahorro ${p.ahorroPorContrato > 0 ? "pos" : ""}`}>
                          {usd(p.ahorroPorContrato)}
                        </span>
                      </>
                    ) : (
                      <span className="mapl-motivo">{p.motivo}</span>
                    )}
                  </button>

                  {on && p.ultimos ? (
                    <div className="mapl-detalle">
                      <p className="mapl-ctx">
                        {p.prints.toLocaleString("es-ES")} operaciones hoy · {p.volumen?.toLocaleString("es-ES")} contratos ·
                        horquilla {p.horquilla!.toFixed(2)} ({pct(p.horquillaPct!)} de la prima)
                      </p>
                      <table className="mapl-tabla">
                        <thead><tr><th>hora</th><th>tam</th><th>bid</th><th>precio</th><th>ask</th><th>dónde</th></tr></thead>
                        <tbody>
                          {p.ultimos.map((t, i) => (
                            <tr key={i}>
                              <td>{t.hora}</td>
                              <td>{t.tam}</td>
                              <td className="mapl-tenue">{t.bid.toFixed(2)}</td>
                              <td><b>{t.precio.toFixed(2)}</b></td>
                              <td className="mapl-tenue">{t.ask.toFixed(2)}</td>
                              <td>{pct(t.pos)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <p className="mapl-pie">
            <strong>Cómo se usa:</strong> manda la orden como límite en el precio &quot;realista&quot;,
            no cruzando. Si no te atienden, sube o baja un céntimo. La cinta dice dónde han cruzado
            OTROS hoy — no promete que a ti te atiendan ahí.
            <br />
            <strong>Y el tamaño del premio, sin adornos:</strong> el &quot;$697 por operación&quot; que
            medimos salió de contratos caros y de horquilla ancha. En SPX 0DTE la horquilla ya es del
            3%, así que aquí se ahorran dólares, no cientos. Aun así, {usd(d.ahorroTotal ?? 0)} × 52
            cóndores al año son <strong>{usd((d.ahorroTotal ?? 0) * 52)}</strong>.
          </p>
        </>
      )}
    </section>
  );
}
