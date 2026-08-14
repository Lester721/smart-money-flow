import type { Metadata } from "next";
import NavTabs from "../components/NavTabs";
import EvaLogo from "../components/EvaLogo";
import GexView from "../components/GexView";
import GexVencimientos from "../components/GexVencimientos";
import GexPerfil from "../components/GexPerfil";
import PanelDecision from "../components/PanelDecision";
import ForwardGexCard from "../components/ForwardGexCard";

export const metadata: Metadata = {
  title: "0DTE — GEX de SPX en vivo",
  description: "Exposición a gamma de SPX 0DTE calculada en vivo, con la señal del cóndor filtrado por GEX y lo que la respalda.",
};

// Esta sección estuvo mucho tiempo diciendo "sin estrategia todavía" con una lista de lo que
// faltaba. Ya no: el 2026-08-10/11 se bajaron los 654 días de cadena intradía de SPXW, se midió
// y salió una candidata. Arriba va el GEX EN VIVO con su señal; abajo queda el hallazgo que
// motivó todo esto y la advertencia, que sigue vigente palabra por palabra.
//
// (Hubo un momento con DOS pestañas —"0DTE" y "GEX 0DTE"— porque monté la vista nueva al lado
//  en vez de rellenar esta. Están unidas: la ruta /gex ya no existe.)

const HORIZONTES = [
  { h: "1 día", spy: "+0,354", qqq: "+0,357", nvda: "+0,192", amd: "+0,057", max: true },
  { h: "2 días", spy: "+0,322", qqq: "+0,310", nvda: "+0,131", amd: "+0,032", max: false },
  { h: "3 días", spy: "+0,298", qqq: "+0,269", nvda: "+0,099", amd: "−0,043", max: false },
  { h: "5 días", spy: "+0,297", qqq: "+0,226", nvda: "+0,209", amd: "−0,145", max: false },
  { h: "10 días", spy: "+0,171", qqq: "+0,103", nvda: "+0,254", amd: "−0,249", max: false },
];

const MEDIDO = [
  { q: "Descarga intradía de SPXW", ok: true, c: "654 días (2024-2026), cadena cada 5 min, 3,5 GB. Hecho." },
  { q: "Precio del subyacente sin look-ahead", ok: true, c: "Del endpoint de griegas, foto del mismo instante que la cotización." },
  { q: "Qué estrategia probar", ok: true, c: "Cóndor de hierro ±25 con alas 50, filtrado por GEX positivo." },
  { q: "¿Se puede calcular en vivo?", ok: true, c: "Sí: retraso cero y ~5 s de cómputo. Es lo que se ve arriba." },
  { q: "Forward-test en papel", ok: false, c: "Empezado el 2026-08-11. Con 55 señales al año hacen falta meses." },
  { q: "Flujo firmado (quién compra y quién vende)", ok: false, c: "Websocket en ws://127.0.0.1:25520. Pendiente de probar en sesión." },
];

export default function ZeroDtePage() {
  return (
    <main className="ideas-page">
      <div className="hb">
        <div className="hb-brand">
          <div className="hb-logo"><EvaLogo /></div>
          <div className="hb-name">EVA</div>
          <div className="hb-chip">0DTE · papel</div>
        </div>
        <NavTabs />
      </div>

      <div className="wrap page-stack">
        <GexView />

        {/* El orden NO es casual, y lo fijó Lester el 2026-08-14: primero CUÁNTA gamma hay
            (GexView), luego DÓNDE está (GexVencimientos), y sólo entonces la DECISIÓN
            (PanelDecision). La señal vivía arriba del todo y obligaba a decidir antes de haber
            visto el contexto. El forward-test va al final: es el marcador, no la decisión. */}
        <GexVencimientos />

        {/* LADO A LADO, y lo pidió Lester: el gráfico dice DÓNDE están los muros y el panel de
            decisión dice SI COMPENSA apoyarse en ellos. Uno encima del otro obligaba a recordar
            números al bajar; juntos se leen de un vistazo. En pantalla estrecha se apilan solos
            (auto-fit), con el gráfico primero. */}
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", alignItems: "start" }}>
          <GexPerfil />
          <PanelDecision />
        </div>

        <ForwardGexCard />

        <div className="card">
          <div style={{ fontSize: 17, fontWeight: 700 }}>
            De dónde salió esto: la gamma pega más cuanto más corto es el plazo
          </div>
          <div className="card-sub" style={{ maxWidth: 640 }}>
            Cuánto más se mueve el precio con gamma negativa que con positiva, en unidades de σ
            esperada. Medido sobre ~2.630 días por ticker (2016–2026), no sobre las señales.
          </div>
          <table className="cs-table">
            <thead>
              <tr>
                <th>Horizonte</th><th>SPY</th><th>QQQ</th><th>NVDA</th><th>AMD</th>
              </tr>
            </thead>
            <tbody>
              {HORIZONTES.map((r) => (
                <tr key={r.h} style={r.max ? { background: "var(--green-bg)" } : undefined}>
                  <td style={{ fontWeight: r.max ? 700 : 400 }}>{r.h}</td>
                  <td style={{ fontWeight: r.max ? 700 : 400 }}>{r.spy}</td>
                  <td style={{ fontWeight: r.max ? 700 : 400 }}>{r.qqq}</td>
                  <td>{r.nvda}</td>
                  <td style={{ color: r.amd.startsWith("−") ? "var(--red)" : undefined }}>{r.amd}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="card-sub" style={{ maxWidth: 640 }}>
            Baja de forma monótona en SPY y QQQ: <strong>a un día es el doble de fuerte que a
            diez</strong>. Es la firma de una fuerza mecánica de corto plazo — los dealers cubren
            gamma en horas, no en semanas. Esa tabla es la que mandó bajar los 654 días.
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Qué está medido y qué no</div>
          <table className="cs-table">
            <tbody>
              {MEDIDO.map((f) => (
                <tr key={f.q}>
                  <td style={{ color: f.ok ? "var(--green)" : "var(--amber)", fontWeight: 700, width: 28 }}>
                    {f.ok ? "✓" : "!"}
                  </td>
                  <td style={{ fontWeight: 600 }}>{f.q}</td>
                  <td style={{ color: "var(--muted)" }}>{f.c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div style={{ fontSize: 17, fontWeight: 700 }}>La advertencia que va con esto</div>
          <div className="card-sub" style={{ maxWidth: 640 }}>
            Que el mecanismo exista <strong>no significa que se pueda cobrar</strong>. En el credit
            spread el mismo efecto está confirmado (SPY, 4/4 sub-períodos) y aun así el filtro
            aporta <strong>+$857/año en índices y −$694/año en acciones</strong>: neto, ruido.
            Medir una fuerza real y convertirla en dinero son dos problemas distintos.
          </div>
          <div className="card-sub" style={{ maxWidth: 640 }}>
            Y de lo de arriba, en concreto: <strong>la t es 2,09</strong>, justo en el filo. Los
            tres años dan positivo y las ocho horas también, pero <strong>ningún año por separado
            es significativo</strong> y hay una selección leve de ~0,7 puntos. Por eso está en
            papel y no en la cuenta.
          </div>
        </div>
      </div>
    </main>
  );
}
