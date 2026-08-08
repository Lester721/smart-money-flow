import type { Metadata } from "next";
import NavTabs from "../components/NavTabs";
import EvaLogo from "../components/EvaLogo";

export const metadata: Metadata = {
  title: "0DTE — EVA",
  description: "Análisis de opciones que expiran el mismo día (0 días al vencimiento).",
};

// Sección aún sin estrategia. Lo que hay aquí es el HALLAZGO que la motiva, anotado para no
// perderlo: el mecanismo de gamma que medimos en el credit spread se hace MÁS fuerte cuanto
// más corto es el plazo, y el 0DTE es el plazo más corto que existe. Ver docs/hallazgos.md.
const HORIZONTES = [
  { h: "1 día", spy: "+0,354", qqq: "+0,357", nvda: "+0,192", amd: "+0,057", max: true },
  { h: "2 días", spy: "+0,322", qqq: "+0,310", nvda: "+0,131", amd: "+0,032", max: false },
  { h: "3 días", spy: "+0,298", qqq: "+0,269", nvda: "+0,099", amd: "−0,043", max: false },
  { h: "5 días", spy: "+0,297", qqq: "+0,226", nvda: "+0,209", amd: "−0,145", max: false },
  { h: "10 días", spy: "+0,171", qqq: "+0,103", nvda: "+0,254", amd: "−0,249", max: false },
];

const FALTA = [
  { q: "Precio del subyacente intradía", ok: true, c: "fetchSpotSeries lo saca minuto a minuto del endpoint de griegas, sin suscripción de acciones." },
  { q: "Open interest del vencimiento del día", ok: true, c: "Ya en caché (_oiexp_): incluye dte = 0." },
  { q: "Precios de opciones 0DTE", ok: true, c: "Mismo endpoint EOD con expiración = hoy." },
  { q: "Decidir QUÉ estrategia probar", ok: false, c: "Sin esto no se baja nada: cada variante necesita datos distintos." },
  { q: "Descarga intradía", ok: false, c: "390 datos por día en vez de 1. Acotar a SPY y a pocos años." },
];

export default function ZeroDtePage() {
  return (
    <main className="ideas-page">
      <div className="hb">
        <div className="hb-brand">
          <div className="hb-logo"><EvaLogo /></div>
          <div className="hb-name">EVA</div>
          <div className="hb-chip">0DTE · expiran hoy</div>
        </div>
        <NavTabs />
      </div>

      <div className="wrap page-stack">
        <div className="card">
          <div style={{ fontSize: 20, fontWeight: 700 }}>0DTE — sin estrategia todavía 🎯</div>
          <div className="card-sub" style={{ maxWidth: 640 }}>
            Esta sección no tiene lógica ni backtest. Lo que sigue es el <strong>hallazgo que la
            motiva</strong>, anotado para no perderlo.
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 17, fontWeight: 700 }}>
            El efecto de la gamma crece cuanto más corto es el plazo
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
            gamma en horas, no en semanas. Incluso AMD, donde el efecto no existe a 5 y 10 días,
            se vuelve positivo a un día.
          </div>
          <div className="card-sub" style={{ maxWidth: 640 }}>
            <strong>La gamma explota cerca del vencimiento.</strong> Un contrato que expira hoy
            tiene gamma órdenes de magnitud mayor que uno a cinco días, y el 0DTE es hoy el grueso
            del volumen del S&amp;P. Si el mecanismo vale para algo, es aquí.
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Qué falta para probarlo</div>
          <table className="cs-table">
            <tbody>
              {FALTA.map((f) => (
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
          <div className="card-sub" style={{ maxWidth: 640 }}>
            <strong>&quot;0DTE&quot; no es una estrategia, es un plazo.</strong> Dentro caben vender
            prima intradía, iron condors, comprar direccional u operar contra el muro de gamma — y
            cada una necesita datos distintos. Bajar &quot;todo por si acaso&quot; es como
            empezamos con el GEX: horas perdidas antes de saber qué preguntábamos.
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 17, fontWeight: 700 }}>La advertencia que va con esto</div>
          <div className="card-sub" style={{ maxWidth: 640 }}>
            Que el mecanismo exista <strong>no significa que se pueda cobrar</strong>. En el credit
            spread el mismo efecto está confirmado (SPY, 4/4 sub-períodos) y aun así el filtro
            aporta <strong>+$857/año en índices y −$694/año en acciones</strong>: neto, ruido.
            Medir una fuerza real y convertirla en dinero son dos problemas distintos.
          </div>
        </div>
      </div>
    </main>
  );
}
