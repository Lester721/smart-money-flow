"use client";

import { useState } from "react";
import { useGexVivo } from "@/lib/gexCliente";
import Info from "./Info";
import DatoViejo from "./DatoViejo";

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
  rojo: "#F04438", verde: "#12B76A", azul: "#3B82F6", ambar: "#F79009", violeta: "#A855F7",
  tenue: "rgba(148,163,184,.75)",
};
const M = (x: number) => (Math.abs(x) >= 1000 ? `${(x / 1000).toFixed(1)}B` : `${Math.round(x)}M`);


// ── LAS PISTAS AL VUELO ──────────────────────────────────────────────────────
// Lo que sale al dejar el cursor encima. Dos partes siempre: QUÉ ES y CÓMO SE USA.
//
// Las tres que la gente usa como si predijeran —el muro, el imán y el Gamma Flip— llevan su
// medición escrita. Callarla aquí sería dejar el panel invitando al error que ya pagamos por
// descubrir.
const P = {
  put: (mill: string, oi: number) =>
    "PUTS en este strike: " + mill +
    "\n\nEs dinero de cobertura por cada 1% que se mueva SPX: si el índice se mueve un 1%, cuánto tienen que operar los dealers por culpa de las puts de aquí." +
    "\n\nROJO = AMPLIFICA. Con puts mandando, los dealers compran cuando sube y venden cuando baja, así que el precio pasa de largo y más rápido." +
    (oi ? "\n\n" + oi.toLocaleString("es-ES") + " contratos abiertos." : ""),
  call: (mill: string, oi: number) =>
    "CALLS en este strike: " + mill +
    "\n\nEs dinero de cobertura por cada 1% que se mueva SPX." +
    "\n\nVERDE = AMORTIGUA. Con calls mandando, los dealers venden cuando sube y compran cuando baja: frenan el movimiento en los dos sentidos." +
    (oi ? "\n\n" + oi.toLocaleString("es-ES") + " contratos abiertos." : ""),
  strike: (k: number, dist: string) =>
    "Strike " + k.toLocaleString("es-ES") + " · a " + dist + " del precio" +
    "\n\nCÓMO SE USA: es donde iría una pata del cóndor. La regla de los tres síes pone la pata corta a ±45 puntos, que es donde la gamma ya ha caído bastante — no en el muro.",
  oi: (n: number, lado: string) =>
    n.toLocaleString("es-ES") + " contratos de " + lado + " abiertos aquí, del cierre de ayer." +
    "\n\nPOR QUÉ IMPORTA: la gamma es (contratos abiertos × gamma por contrato). Dos muros iguales en dólares con muy distinto número de contratos NO son la misma situación: mucho interés abierto lejos del dinero es posición vieja acumulada; poco interés abierto pegado al precio es gente colocándose ahora.",
  muroCall:
    "MURO DE CALLS\n\nEl strike con más gamma de calls de todo el gráfico." +
    "\n\nCÓMO SE USA, y esto importa: NO es una barrera. Medido sobre 1.122 días, el precio se para aquí el 38,8% de las veces; una raya trazada al azar a la misma distancia lo para el 43,2%. Sirve para saber dónde está la posición, no para apoyarse en ella.",
  muroPut:
    "MURO DE PUTS\n\nEl strike con más gamma de puts de todo el gráfico. Suele ser donde está la cobertura del mercado." +
    "\n\nMisma advertencia que el muro de calls: medido, frena menos que una raya al azar.",
  precio: (u: number) =>
    "SPX " + u.toLocaleString("es-ES", { minimumFractionDigits: 2 }) + " — el precio AHORA MISMO." +
    "\n\nTodo lo de arriba son strikes por encima del precio; todo lo de abajo, por debajo. La gamma es máxima cerca de aquí y se desploma al alejarse.",
  flip: (g: number) =>
    "GAMMA FLIP " + g.toLocaleString("es-ES") +
    "\n\nEl precio al que el GEX neto cambiaría de signo. Por encima el mercado tiene freno; por debajo, acelerador." +
    "\n\nCÓMO SE USA: como contexto de si el día será tranquilo o nervioso. NO como señal de entrada — está medido y no predice la dirección.",
  iman: (k: number, es: boolean) =>
    es
      ? "IMÁN " + k.toLocaleString("es-ES") + "\n\nEl strike con más gamma total. La teoría dice que el precio se queda pegado aquí." +
        "\n\nLO MEDIMOS Y NO ES VERDAD: sobre 85.021 barras de 5 minutos, ir hacia el imán da −0,02 puntos por operación y entrar al azar da +0,21. Y usar el imán de OTRO DÍA da mejor resultado que el de hoy."
      : "ACELERADOR " + k.toLocaleString("es-ES") + "\n\nEl strike con más gamma total, pero aquí mandan las puts: en vez de frenar, empuja. El precio tiende a pasar de largo y más rápido." +
        "\n\nIgual que el imán: sirve para describir, no para entrar.",
  fuera:
    "La barra se sale de la escala.\n\nEl gráfico se escala al percentil 90 porque al filo del cierre la gamma pegada al precio es miles de veces la del resto y aplastaría todo lo demás. Este strike lo supera.",
};

export default function GexPerfil() {
  const { d, cargando, auto } = useGexVivo();
  const [nStrikes, setNStrikes] = useState(40);
  // El interés abierto se puede apagar: en pantallas estrechas dos columnas más aprietan.
  const [verOI, setVerOI] = useState(true);

  if (cargando && !d) return <div className="card"><p>Calculando el perfil de gamma…</p></div>;
  if (!d?.ok) return <div className="card"><b style={{ fontSize: 17 }}>Gamma Exposure</b>
    <p className="muted">{d?.motivo ?? "sin datos"}</p></div>;

  const U = d.spx ?? 0;
  const cerca = [...(d.barras ?? [])]
    .sort((a, b) => Math.abs(a.strike - U) - Math.abs(b.strike - U))
    .slice(0, nStrikes)
    .sort((a, b) => a.strike - b.strike);
  const strikePrecio = cerca.reduce((a, b) => (Math.abs(b.strike - U) < Math.abs(a.strike - U) ? b : a), cerca[0])?.strike;
  // EL strike del giro: el más cercano, uno y sólo uno. El giro cae entre strikes (SPX va de 5 en
  // 5) y marcar "todo lo que esté a menos de 3" pintaba la etiqueta dos veces.
  const strikeGiro = d.giro != null && cerca.length
    ? cerca.reduce((a, b) => (Math.abs(b.strike - d.giro!) < Math.abs(a.strike - d.giro!) ? b : a), cerca[0]).strike
    : null;
  const vals = cerca.flatMap((b) => [b.call, b.put]).filter((x) => x > 0).sort((a, b) => a - b);
  // Escala robusta: al filo del cierre la gamma al dinero es miles de veces la del resto y con
  // escala lineal desaparece todo lo demás. Se escala al percentil 90 y lo que se pasa lleva "›".
  const tope = Math.max(1, vals[Math.floor(vals.length * 0.9)] ?? 1);
  const ancho = (v: number) => Math.min(100, (v / tope) * 100);

  // El strike que MANDA hoy: el de mayor gamma total (calls + puts). Es el que explica la nota ⓘ,
  // y por eso el texto es dinámico — si mañana manda otro, o si mandan los puts, la explicación
  // cambia sola en vez de quedarse contando un ejemplo viejo.
  const mand = cerca.length
    ? (() => {
        const b = cerca.reduce((a, x) => (x.call + x.put > a.call + a.put ? x : a), cerca[0]);
        return { strike: b.strike, call: b.call, put: b.put, imán: b.call >= b.put };
      })()
    : null;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <b style={{ fontSize: 17 }}>Gamma Exposure</b>
          <DatoViejo viejo={d.viejo} capturadaEn={d.capturadaEn} compacto />
          <Info titulo="Qué son estas cifras y por qué un strike hace de imán" ancho={520}>
            <p style={{ margin: "0 0 9px" }}>
              Cada número es <b>dinero de cobertura por cada 1% que se mueva el índice</b>: si SPX
              se mueve un 1%, cuánto tienen que comprar o vender los dealers <em>por culpa de las
              opciones de ese strike</em>.
            </p>
            {mand && (
              <>
                <p style={{ margin: "0 0 9px" }}>
                  Ahora mismo el strike que más manda es <b>{mand.strike.toLocaleString("es-ES")}</b>,
                  con <b style={{ color: C.verde }}>${M(mand.call / 1e6)}</b> en calls contra{" "}
                  <b style={{ color: C.rojo }}>${M(mand.put / 1e6)}</b> en puts.
                  Neto: <b>${M(Math.abs(mand.call - mand.put) / 1e6)}</b>{" "}
                  {mand.imán ? "amortiguando" : "amplificando"}.
                </p>
                <p style={{ margin: "0 0 9px" }}>
                  {mand.imán ? (
                    <>
                      Con los dealers <b>largos de gamma</b> ahí: si el precio <b>sube</b> hacia{" "}
                      {mand.strike.toLocaleString("es-ES")} tienen que <b>vender</b> índice, y eso lo
                      empuja abajo; si <b>baja</b>, tienen que <b>comprar</b>, y eso lo empuja arriba.{" "}
                      <b>Venden cuando sube y compran cuando baja.</b> No es que el strike atraiga:{" "}
                      <b>castiga la salida por los dos lados</b>. Eso es el imán.
                    </>
                  ) : (
                    <>
                      Aquí mandan los <b style={{ color: C.rojo }}>puts</b>, así que es{" "}
                      <b>lo contrario de un imán</b>: los dealers <b>compran cuando sube</b> y{" "}
                      <b>venden cuando baja</b>, <b>acelerando</b> el movimiento. El precio pasa de
                      largo y más rápido.
                    </>
                  )}
                </p>
              </>
            )}
            <p style={{ margin: "0 0 9px" }}>
              <b>La barra grande dice dónde hay fuerza; el color, si esa fuerza te frena o te empuja.</b>{" "}
              Verde (calls) amortigua · rojo (puts) amplifica.
            </p>
            {mand && (
              <p style={{ margin: "0 0 9px", paddingTop: 8, borderTop: "1px solid rgba(148,163,184,.18)" }}>
                <b style={{ color: C.violeta }}>Las tres líneas del gráfico</b><br />
                <span style={{ color: C.violeta }}>◆</span>{" "}
                <b>{mand.imán ? "IMÁN" : "ACELERADOR"} {mand.strike.toLocaleString("es-ES")}</b> — el
                strike con más gamma de todo el gráfico, el que acabas de leer arriba.{" "}
                {mand.imán
                  ? "Ahí el precio tiende a quedarse pegado."
                  : "Ahí el precio tiende a pasar de largo y más rápido."}<br />
                <span style={{ color: C.azul }}>—</span> <b>SPX</b> — dónde está el precio ahora.{" "}
                {Math.abs(mand.strike - U) / U < 0.003
                  ? <>Está <b>pegado</b> al {mand.imán ? "imán" : "acelerador"} ({((Math.abs(mand.strike - U) / U) * 100).toFixed(2)}%): la fuerza es enorme, pero tan cerca que no sirve de apoyo para vender un rango.</>
                  : <>Está a <b>{((Math.abs(mand.strike - U) / U) * 100).toFixed(2)}%</b> del {mand.imán ? "imán" : "acelerador"}.</>}<br />
                <span style={{ color: C.ambar }}>┄</span> <b>Gamma Flip</b> — el precio donde el GEX
                neto cambiaría de signo. Por encima, el mercado tiene freno; por debajo, acelerador.
                {d.giro == null && <> Hoy no aparece: la gamma es del mismo signo en todo el rango visible.</>}
              </p>
            )}
            <p style={{ margin: 0, fontSize: 12, color: C.tenue }}>
              Los strikes de <b>millones</b> son ruido; los de <b>miles de millones</b> son donde
              pasa algo — la gamma es máxima donde está el precio y se desploma al alejarse.
              Y ojo: lo del <b>61% / 92%</b> según la distancia lo medimos nosotros sobre 652 días;
              el mecanismo de cobertura de arriba es teoría estándar que <b>no hemos medido por
              separado</b>. Medimos la consecuencia, no la causa.
            </p>
          </Info>
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
          <button type="button" onClick={() => setVerOI((v) => !v)}
                  style={{ marginLeft: 6, padding: "2px 9px", borderRadius: 6, fontSize: 11.5, cursor: "pointer",
                           border: `1px solid ${verOI ? C.azul : "rgba(148,163,184,.3)"}`,
                           background: "transparent", color: verOI ? C.azul : "inherit" }}>
            OI
          </button>
          {auto && (
            <span title="se refresca solo cada minuto con el mercado abierto"
                  style={{ marginLeft: 8, fontSize: 11, color: C.verde, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: C.verde, display: "inline-block" }} />
              en vivo
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, fontSize: 12.5, alignItems: "center" }} className="muted">
        {verOI && <span style={{ width: 52, textAlign: "right", fontSize: 10.5, letterSpacing: ".04em" }}>OI</span>}
        <span style={{ flex: 1, textAlign: "right" }}>◀ PUTS · amplifican</span>
        <span style={{ width: 104, textAlign: "center" }}>strike</span>
        <span style={{ flex: 1 }}>CALLS · amortiguan ▶</span>
        {verOI && <span style={{ width: 52, fontSize: 10.5, letterSpacing: ".04em" }}>OI</span>}
      </div>

      <div>
        {[...cerca].reverse().map((b, iFila) => {
          // Las cuatro primeras filas no tienen sitio por encima: su pista sale por debajo.
          const arriba = iFila < 4;
          const mC = d.muroCall === b.strike, mP = d.muroPut === b.strike;
          const esPrecio = b.strike === strikePrecio;
          // EL GIRO SE PINTA UNA SOLA VEZ. Antes se marcaba todo strike a menos de 3 puntos, y
          // como SPX va de 5 en 5, un giro a mitad de camino (7672,46) caía a menos de 3 de DOS
          // strikes (7670 y 7675) y salían dos "Gamma Flip" en pantalla. Ahora se elige el más
          // cercano de todos los visibles y sólo ése lleva la marca.
          const esGiro = d.giro != null && b.strike === strikeGiro;
          const esImán = mand != null && b.strike === mand.strike;
          return (
            <div key={b.strike}>
              {esGiro && (
                <span data-pista={P.flip(d.giro!)} data-izq="" data-abajo={arriba ? "" : undefined} style={{ display: "block" }}>
                  <Marca texto={`Gamma Flip ${d.giro?.toLocaleString("es-ES")}`} color={C.ambar} punteada izquierda />
                </span>
              )}
              {/* La línea del IMÁN: el strike de mayor gamma total. Si ahí mandan los puts no es
                  un imán sino un ACELERADOR, y la etiqueta lo dice — son efectos opuestos. */}
              {esImán && (
                <span data-pista={P.iman(mand!.strike, mand!.imán)} data-abajo={arriba ? "" : undefined} style={{ display: "block" }}>
                  <Marca texto={`${mand!.imán ? "◆ IMÁN" : "▲ ACELERADOR"} ${mand!.strike.toLocaleString("es-ES")}`} color={C.violeta} />
                </span>
              )}
              {esPrecio && (
                <span data-pista={P.precio(U)} data-abajo={arriba ? "" : undefined} style={{ display: "block" }}>
                  <Marca texto={`● PRECIO AHORA · SPX ${U.toLocaleString("es-ES", { minimumFractionDigits: 2 })}`} color={C.azul} />
                </span>
              )}
              <div className={esPrecio ? "gex-fila-precio" : undefined}
                   style={{ display: "flex", alignItems: "center", gap: 8, height: 22 }}>
                {/* EL INTERÉS ABIERTO, que la gamma sola esconde. La gamma es
                    (contratos abiertos × gamma por contrato), así que un muro de $4B hecho de
                    8.000 contratos lejos del dinero y otro de $4B hecho de 1.700 pegados al
                    precio son el mismo número y NO la misma situación. */}
                {verOI && (
                  <div data-pista={b.oiPut ? P.oi(b.oiPut, "puts") : undefined} data-izq="" data-abajo={arriba ? "" : undefined}
                       style={{ width: 52, textAlign: "right", fontSize: 11, color: "rgba(148,163,184,.5)", fontVariantNumeric: "tabular-nums" }}>
                    {b.oiPut ? b.oiPut.toLocaleString("es-ES") : ""}
                  </div>
                )}
                <div data-pista={b.put > 0 ? P.put(`$${M(b.put / 1e6)}`, b.oiPut ?? 0) : undefined} data-izq="" data-abajo={arriba ? "" : undefined}
                     style={{ width: 66, textAlign: "right", fontSize: 12.5, color: C.tenue, fontVariantNumeric: "tabular-nums" }}>
                  {b.put > 0 ? `$${M(b.put / 1e6)}` : ""}
                </div>
                <div data-pista={b.put > 0 ? P.put(`$${M(b.put / 1e6)}`, b.oiPut ?? 0) : undefined} data-abajo={arriba ? "" : undefined}
                     style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 3 }}>
                  {b.put > tope && <span data-pista={P.fuera} style={{ fontSize: 12, color: C.rojo, fontWeight: 700 }}>‹</span>}
                  {b.put > 0 && <div style={{ width: 6, height: 6, borderRadius: 3, background: C.rojo }} />}
                  <div style={{ width: `${ancho(b.put)}%`, height: 11, background: C.rojo, borderRadius: 2,
                                opacity: mP ? 1 : .8, outline: mP ? `1.5px solid ${C.rojo}` : undefined, outlineOffset: 2 }} />
                </div>
                <div style={{ width: 104, textAlign: "center", fontSize: 14.5, fontVariantNumeric: "tabular-nums",
                              fontWeight: esPrecio || mC || mP ? 700 : 500 }}>
                  {mP && <span data-pista={P.muroPut} data-abajo={arriba ? "" : undefined}><Etiq t="PW" c={C.rojo} antes /></span>}
                  {b.strike.toLocaleString("es-ES")}
                  {/* El precio exacto pegado al strike más cercano: sin esto hay que mirar
                      la cabecera de la tarjeta y volver, que es justo lo que Lester pidió evitar. */}
                  {esPrecio && (
                    <span className="gex-precio-tag" data-pista={P.precio(U)} data-abajo={arriba ? "" : undefined}>
                      SPX {U.toLocaleString("es-ES", { minimumFractionDigits: 2 })}
                    </span>
                  )}
                  {mC && <span data-pista={P.muroCall} data-abajo={arriba ? "" : undefined}><Etiq t="CW" c={C.verde} /></span>}
                </div>
                <div data-pista={b.call > 0 ? P.call(`$${M(b.call / 1e6)}`, b.oiCall ?? 0) : undefined} data-abajo={arriba ? "" : undefined}
                     style={{ flex: 1, display: "flex", alignItems: "center", gap: 3 }}>
                  <div style={{ width: `${ancho(b.call)}%`, height: 11, background: C.verde, borderRadius: 2,
                                opacity: mC ? 1 : .8, outline: mC ? `1.5px solid ${C.verde}` : undefined, outlineOffset: 2 }} />
                  {b.call > 0 && <div style={{ width: 6, height: 6, borderRadius: 3, background: C.verde }} />}
                  {b.call > tope && <span data-pista={P.fuera} style={{ fontSize: 12, color: C.verde, fontWeight: 700 }}>›</span>}
                </div>
                <div data-pista={b.call > 0 ? P.call(`$${M(b.call / 1e6)}`, b.oiCall ?? 0) : undefined} data-der="" data-abajo={arriba ? "" : undefined}
                     style={{ width: 66, fontSize: 12.5, color: C.tenue, fontVariantNumeric: "tabular-nums" }}>
                  {b.call > 0 ? `$${M(b.call / 1e6)}` : ""}
                </div>
                {verOI && (
                  <div data-pista={b.oiCall ? P.oi(b.oiCall, "calls") : undefined} data-der="" data-abajo={arriba ? "" : undefined}
                       style={{ width: 52, fontSize: 11, color: "rgba(148,163,184,.5)", fontVariantNumeric: "tabular-nums" }}>
                    {b.oiCall ? b.oiCall.toLocaleString("es-ES") : ""}
                  </div>
                )}
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
