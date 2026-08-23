"use client";

// EL MARCADOR DE LOS FORWARD TESTS — lo que está pasando en directo, sin que nadie lo pida.
//
// Nace de un reproche justo de Lester: el cuaderno del credit spread llevaba 126 operaciones
// cerradas y +$3.562 desde el 3 de agosto, y él se enteró sólo porque preguntó cuántos forward
// tests había. *"Si no te pregunto no me lo dices. Muy mal tuyo."*
//
// Tenía razón. Un marcador que depende de que yo me acuerde de mirarlo no es un marcador. Este
// va ARRIBA de /estado y se lee solo de Redis cada vez que se abre la página.

import { useEffect, useState } from "react";

type Cuaderno = {
  id: string; clave: string; nombre: string; familia: "condor" | "riesgo"; unidad: string; pega?: string;
  filas: number; vacio: boolean;
  desde?: string | null; hasta?: string | null;
  cerradas?: number; abiertas?: number; sinSenal?: number;
  media?: number | null; total?: number | null; acierto?: number | null;
};

const usd = (x: number) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pct = (x: number) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(2) + "%";
const dia = (s?: string | null) => (s ? new Date(s + "T12:00:00Z").toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "—");

export default function ForwardTests() {
  const [d, setD] = useState<{ ok: boolean; motivo?: string; cuadernos?: Cuaderno[] } | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/forward-tests", { cache: "no-store" })
      .then((r) => r.json())
      .then(setD)
      .catch(() => setD({ ok: false, motivo: "no se pudo leer el marcador" }));
  }, []);

  if (!d) return <section className="est-grupo"><p className="est-quees">Leyendo los cuadernos…</p></section>;

  const cs = d.cuadernos ?? [];
  const conCierres = cs.filter((c) => (c.cerradas ?? 0) > 0);
  const totalCierres = conCierres.reduce((a, c) => a + (c.cerradas ?? 0), 0);

  return (
    <section className="est-grupo">
      <header className="est-grupo-head">
        <h2><span aria-hidden="true">📡</span> Lo que está pasando AHORA</h2>
        <p>los cuadernos que corren en Railway · se lee de Redis al abrir la página</p>
      </header>

      {!d.ok ? (
        <p className="est-quees">{d.motivo}</p>
      ) : (
        <>
          <p className="ftest-resumen">
            <strong>{cs.filter((c) => !c.vacio).length} cuadernos</strong> escribiendo ·{" "}
            <strong>{totalCierres} operaciones cerradas</strong> entre todos
          </p>

          <div className="ftest-scroll">
            <table className="ftest-tabla">
              <thead>
                <tr>
                  <th>cuaderno</th><th>desde</th><th>filas</th><th>cerradas</th>
                  <th>resultado</th><th>acierto</th><th></th>
                </tr>
              </thead>
              <tbody>
                {cs.map((c) => {
                  const on = abierto === c.id;
                  const res = c.media == null ? null
                    : c.familia === "condor"
                      ? `${usd(c.media)} por operación${c.total != null ? ` · ${usd(c.total)} total` : ""}`
                      : pct(c.media) + " sobre el riesgo";
                  const bueno = (c.media ?? 0) > 0;
                  return (
                    <tr key={c.id}
                        className={`${c.vacio ? "ftest-vacio" : ""} ${on ? "ftest-on" : ""}`}
                        onClick={() => c.pega && setAbierto(on ? null : c.id)}>
                      <td className="ftest-nombre">
                        {c.nombre}
                        {c.pega ? <span className="ftest-aviso" title="tiene una pega — pulsa">⚠</span> : null}
                      </td>
                      <td>{dia(c.desde)}</td>
                      <td>{c.filas || "—"}</td>
                      <td><b>{c.cerradas ?? 0}</b></td>
                      <td className={res ? (bueno ? "pos" : "neg") : "ftest-tenue"}>
                        {res ?? (c.abiertas ? `${c.abiertas} abiertas, ninguna cerrada` : "sin operar todavía")}
                      </td>
                      <td>{c.acierto != null ? Math.round(c.acierto * 100) + "%" : "—"}</td>
                      <td className="ftest-tenue">{c.sinSenal ? `${c.sinSenal} sin señal` : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {abierto ? (
            <div className="est-bloque est-pega ftest-pega">
              <h4>La pega de «{cs.find((c) => c.id === abierto)?.nombre}»</h4>
              <p>{cs.find((c) => c.id === abierto)?.pega}</p>
            </div>
          ) : (
            <p className="ftest-pie">
              Las filas con <span className="ftest-aviso">⚠</span> tienen una pega — pulsa para leerla.
              <br />
              <strong>Nada de esto es dinero real:</strong> son cuadernos en papel. Y con pocas
              operaciones cerradas, un resultado bueno o malo puede ser simple suerte.
            </p>
          )}
        </>
      )}
    </section>
  );
}
