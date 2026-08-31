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
  id: string; clave: string; nombre: string; familia: "condor" | "riesgo"; unidad: string; enContra?: string;
  filas: number; vacio: boolean;
  desde?: string | null; hasta?: string | null;
  cerradas?: number; abiertas?: number; sinSenal?: number;
  media?: number | null; total?: number | null; acierto?: number | null;
  totalUsd?: number | null; mediaUsd?: number | null;
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
        <h2><span aria-hidden="true">📡</span> LO QUE ESTÁ PASANDO AHORA</h2>
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
                  <th>cuaderno</th><th>desde</th><th>operaciones</th><th>cerradas</th><th>abiertas</th>
                  <th>resultado</th><th>acierto</th><th>días sin señal</th>
                </tr>
              </thead>
              <tbody>
                {cs.map((c) => {
                  const on = abierto === c.id;
                  const res = c.media == null ? null
                    : c.familia === "condor"
                      ? `${usd(c.media)} por operación${c.total != null ? ` · ${usd(c.total)} total` : ""}`
                      // La unidad NO se escribe a mano: cada cuaderno trae la suya. El Wheel mide
                      // sobre el COLATERAL y decia "sobre el riesgo" porque este texto estaba fijo.
                      // Los dolares PRIMERO tambien aqui: antes los que miden en % salian solo
                      // en porcentaje y las ganancias no se leian como dinero. Lester, 31-ago.
                      : c.mediaUsd != null
                        ? `${usd(c.mediaUsd)} por operación · ${usd(c.totalUsd ?? 0)} total` +
                          ` · ${pct(c.media)} ${(c.unidad || "").replace(/^%\s*/, "")}`
                        : pct(c.media) + " " + (c.unidad || "").replace(/^%\s*/, "");
                  const bueno = (c.media ?? 0) > 0;
                  return (
                    <tr key={c.id}
                        className={`${c.vacio ? "ftest-vacio" : ""} ${on ? "ftest-on" : ""}`}
                        onClick={() => c.enContra && setAbierto(on ? null : c.id)}>
                      <td className="ftest-nombre">
                        {c.nombre}
                        {c.enContra ? <span className="ftest-aviso" title="tiene algo en contra — pulsa">⚠</span> : null}
                      </td>
                      <td>{dia(c.desde)}</td>
                      {/* "operaciones" son las que de verdad ENTRARON, no las filas del cuaderno.
                          Para el Wheel coinciden (274 filas = 274 puts vendidos), pero para el
                          cóndor 7 filas son 2 operaciones + 5 días que miró y no entró. Con el
                          número crudo se comparaban peras con manzanas. Lester, 31-ago-2026. */}
                      <td>{(c.filas ?? 0) - (c.sinSenal ?? 0) || "—"}</td>
                      <td><b>{c.cerradas ?? 0}</b></td>
                      <td className="ftest-tenue">{c.abiertas ? c.abiertas : "—"}</td>
                      <td className={res ? (bueno ? "pos" : "neg") : "ftest-tenue"}>
                        {res ?? (c.abiertas ? `${c.abiertas} abiertas, ninguna cerrada` : "sin operar todavía")}
                      </td>
                      <td>{c.acierto != null ? Math.round(c.acierto * 100) + "%" : "—"}</td>
                      {/* No basta con "5 sin señal": sin saber sobre cuántos días, no se puede
                          juzgar si la regla es exigente o si simplemente no encuentra nada.
                          "5 de 7 días" dice las dos cosas de un vistazo. Lester, 31-ago-2026. */}
                      <td className="ftest-tenue">
                        {c.sinSenal
                          ? `${c.sinSenal} de ${c.filas ?? c.sinSenal} días`
                          : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {abierto ? (
            <div className="est-bloque est-encontra ftest-encontra">
              <h4>En contra de «{cs.find((c) => c.id === abierto)?.nombre}»</h4>
              <p>{cs.find((c) => c.id === abierto)?.enContra}</p>
            </div>
          ) : (
            <p className="ftest-pie">
              Las filas con <span className="ftest-aviso">⚠</span> tienen algo en contra — pulsa para leerla.
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
