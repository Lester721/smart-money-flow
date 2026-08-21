"use client";

// LA ⓘ DEL GEX — qué estás viendo, qué significa, y qué sabemos de verdad.
//
// Lester lo pidió así: "incluye una i de lo que estamos viendo, lo que significa y lo que sabemos
// del GEX. Honestamente creo que no sabemos cómo usarlo en este momento; si me equivoco, menciona
// en el web cómo es que deberíamos usarlo."
//
// No se equivoca, y eso es lo que pone aquí. La única excepción medida —los días de gamma positiva
// son mejores para vender prima— está escrita con su número y con su pega (que nuestra regla ya
// elige esos días por otro camino).
//
// REGLA DE ESTE PANEL: ningún número sin su medición detrás. Si alguien lee esto dentro de seis
// meses tiene que poder distinguir lo probado de lo que suena bien.

import { useState } from "react";

type Bloque = { titulo: string; cuerpo: React.ReactNode };

const QUE_VES: Bloque[] = [
  {
    titulo: "El muro de calls",
    cuerpo: (
      <>
        El strike <strong>por encima</strong> del precio donde hay más gamma acumulada de calls. Ahí
        se concentra el mayor volumen de contratos abiertos, así que es donde los creadores de
        mercado tienen más que cubrir si el precio llega.
      </>
    ),
  },
  {
    titulo: "El muro de puts",
    cuerpo: <>Lo mismo por debajo del precio, con puts. Suele quedar donde está la cobertura del mercado.</>,
  },
  {
    titulo: "El punto de giro (el imán)",
    cuerpo: (
      <>
        El strike con más gamma <strong>total</strong>, sumando calls y puts. La teoría dice que el
        precio tiende a quedarse pegado ahí. <strong>Nosotros lo medimos y no es verdad</strong> —
        ver abajo.
      </>
    ),
  },
  {
    titulo: "El GEX neto",
    cuerpo: (
      <>
        La gamma de calls menos la de puts, en millones. <strong>Positivo</strong> significa que los
        creadores de mercado, para cubrirse, venden cuando sube y compran cuando baja: eso{" "}
        <em>frena</em> el movimiento. <strong>Negativo</strong> es al revés: compran fuerza y venden
        debilidad, y eso <em>amplifica</em>.
      </>
    ),
  },
];

export default function GexQueSignifica() {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="gexi">
      <button type="button" className="gexi-btn" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
        <span className="gexi-icono" aria-hidden="true">ⓘ</span>
        Qué es esto, qué significa y qué sabemos
        <span className={`gexi-flecha ${abierto ? "on" : ""}`} aria-hidden="true">▾</span>
      </button>

      {abierto ? (
        <div className="gexi-cuerpo">
          <section>
            <h4>Qué estás viendo</h4>
            <dl className="gexi-defs">
              {QUE_VES.map((b) => (
                <div key={b.titulo}>
                  <dt>{b.titulo}</dt>
                  <dd>{b.cuerpo}</dd>
                </div>
              ))}
            </dl>
            <p className="gexi-nota">
              Todo se recalcula <strong>en vivo</strong> contra el mercado: el interés abierto se
              publica antes de abrir y no cambia en el día, pero la gamma de cada strike depende del
              precio y de la volatilidad, y ésos se mueven minuto a minuto. Por eso los muros se
              mueven durante la sesión.
            </p>
          </section>

          <section className="gexi-medido">
            <h4>Qué sabemos — medido, no opinado</h4>

            <div className="gexi-hallazgo gexi-no">
              <h5>❌ No sirve para saber hacia dónde va el precio</h5>
              <p>
                Lo medimos sobre <strong>85.021 barras de 5 minutos</strong> entre enero de 2022 y
                agosto de 2026, con el interés abierto real. Entrar en la dirección del imán da{" "}
                <strong>−0,02 puntos</strong> de SPX por operación a 5 minutos. Entrar al azar da{" "}
                <strong>+0,21</strong>.
              </p>
              <p className="gexi-clave">
                Y el dato que lo cierra: si coges el imán de <strong>otro día al azar</strong> en vez
                del de hoy, lo haces <strong>mejor</strong> — 0,124 puntos a 30 minutos (t=3,1)
                contra −0,021 del verdadero. Saber dónde está el imán real te hace ir peor que no
                saberlo.
              </p>
            </div>

            <div className="gexi-hallazgo gexi-no">
              <h5>❌ Los muros no frenan el precio</h5>
              <p>
                Sobre 1.122 días: el precio se para en el muro el <strong>38,8%</strong> de las
                veces. Una raya trazada al azar a la misma distancia lo para el{" "}
                <strong>43,2%</strong>. El muro lo hace peor que una raya cualquiera.
              </p>
            </div>

            <div className="gexi-hallazgo gexi-si">
              <h5>✅ Lo único que sí está medido</h5>
              <p>
                Los días que <strong>abren con gamma positiva</strong> son mejores para{" "}
                <strong>vender prima</strong>. Un cóndor 0DTE de ±25 puntos gana{" "}
                <strong>$85 por operación</strong> esos días y pierde <strong>−$49</strong> los días
                de gamma negativa. Diferencia de $134 con t=1,89, sobre 1.112 días.
              </p>
              <p className="gexi-pega">
                <strong>La pega:</strong> nuestra regla desplegada (los tres síes) ya elige esos
                mismos días por otro camino. Dentro de sus 201 operaciones, los días de gamma
                positiva dan $132 y los de negativa $109 — diferencia de $22 con t=0,15, o sea nada.
                Añadir el GEX como cuarto filtro quitaría el 22% de los días y bajaría el resultado
                de $5.541 a $4.496 al año.
              </p>
            </div>
          </section>

          <section className="gexi-veredicto">
            <h4>Entonces, ¿cómo se usa?</h4>
            <p>
              <strong>Hoy, para decidir una operación: no se usa.</strong> No dice la dirección, no
              frena el precio, y lo único que sí señala —qué días son buenos para vender prima— ya
              lo capturan las medias móviles de nuestra regla.
            </p>
            <p>
              Para lo que sirve es como <strong>mapa</strong>: enseña dónde está la posición grande
              del mercado. Eso es información de contexto —saber que hay 40.000 contratos abiertos en
              un strike concreto es un hecho útil— pero es una foto de dónde está el dinero, no una
              flecha de hacia dónde va.
            </p>
            <p className="gexi-nota">
              Si alguna vez esto cambia será porque una medición nueva lo demuestre, y entonces este
              texto cambiará con ella. Mientras tanto, cualquiera que diga que opera con el GEX en
              SPX está describiendo lo que ya pasó.
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
