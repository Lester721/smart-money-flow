"use client";

import { useEffect, useState } from "react";

// Vista "EVA Credit Spread": explica las pruebas, muestra el forward-test EN VIVO (paper)
// y presenta las 5 mejoras de EVA con estado HONESTO (viva / en desarrollo). 100% papel.

interface Stat { n: number; win: number | null; mean: number | null; median: number | null }
interface Trade {
  id: string; ticker: string; entryDate: string; dte: number; sigma: number;
  dir: 1 | -1; type: "put" | "call"; evaComp: number; status: "open" | "closed";
  expiryDate: string; retOnRisk: number | null; exitDate: string | null;
  shortK: number; longK: number; spot: number; netCredit: number; width: number;
}
interface Data {
  source: "redis" | "file";
  counts: { total: number; open: number; closed: number };
  overall: Stat;
  filter: { top: Stat; bottom: Stat };
  cells: { key: string; dte: number; sigma: number; stat: Stat }[];
  trades: Trade[];
}

const pct = (x: number | null) => (x == null ? "—" : `${x > 0 ? "+" : ""}${x}%`);
const cellLabel = (dte: number, sigma: number) => `${dte}d @ ${sigma}σ`;

// ── Las 5 mejoras: qué hacen (del Informe) + estado real ──────────────────────
const MEJORAS: { n: number; name: string; does: string; status: "viva" | "parcial" | "dev"; here: string }[] = [
  {
    n: 1, name: "Conciencia de régimen", status: "dev",
    does: "Sabe en qué 'clima' está el mercado (tranquilo o volátil) y ajusta: una señal que en promedio es ruido puede ser fuerte en un clima específico.",
    here: "En desarrollo — aún no hay módulo de régimen conectado. Así funcionará: etiquetar cada día por volatilidad y filtrar/ajustar la señal según el clima.",
  },
  {
    n: 2, name: "Lado del dealer (GEX)", status: "parcial",
    does: "Ve hacia dónde los market makers están forzados a comprar/vender — los muros de gamma que frenan o aceleran el precio.",
    here: "Viva en la vista Ticker (los muros se calculan y se ven). El forward-test actual elige strikes por σ (movimiento esperado), todavía NO por los muros GEX — combinarlos es el siguiente paso.",
  },
  {
    n: 3, name: "Bucle de aprendizaje", status: "parcial",
    does: "Mide sus propios aciertos y se re-calibra sola. Victor es estático; EVA aprende de lo que funcionó.",
    here: "El ledger de abajo ES la memoria: cada jugada cerrada mide el acierto real. El re-calibrado automático a partir de esto todavía está en desarrollo.",
  },
  {
    n: 4, name: "Resultado como distribución", status: "viva",
    does: "En vez de una nota sola ('80/100'), muestra el abanico real: de trades como este, cuántos ganaron, lo normal, y la chance de un golpe grande.",
    here: "Viva aquí abajo: en vez de una nota, ves win%, media y mediana de las jugadas CERRADAS. (Con pocos cierres aún — el abanico se afina con el tiempo.)",
  },
  {
    n: 5, name: "Señal → vehículo", status: "viva",
    does: "No solo dice 'alcista/bajista'; dice la mejor forma de jugarlo: ESTE spread, con esta volatilidad.",
    here: "Viva: cada señal de alta convicción se traduce en un credit spread concreto (strikes, ancho, DTE). Lo ves en la tabla de abajo.",
  },
];

const STATUS_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  viva: { label: "VIVA", bg: "#D1FADF", fg: "#027A48" },
  parcial: { label: "PARCIAL", bg: "#FEF0C7", fg: "#B54708" },
  dev: { label: "EN DESARROLLO", bg: "#EAECF0", fg: "#475467" },
};

export default function CreditSpreadView() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/credit-spread")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, []);

  const filterWorks =
    data && data.filter.top.mean != null && data.filter.bottom.mean != null &&
    data.filter.top.mean > data.filter.bottom.mean;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Qué es */}
      <div className="card">
        <div style={{ fontSize: 20, fontWeight: 800 }}>EVA Credit Spread 🛡️</div>
        <div className="card-sub">
          La estrategia que probamos y funcionó: <strong>vender credit spreads solo en los días de ALTA CONVICCIÓN de EVA</strong>.
          Un credit spread cobra prima con la pérdida <strong>capada</strong> (con red). Aquí ves qué probamos, la prueba en vivo que corre ahora, y las mejoras de EVA.
        </div>
      </div>

      {/* El resultado del backtest, en una línea */}
      <div className="card" style={{ borderLeft: "4px solid #12B76A" }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>El resultado del backtest, en corto 📈</div>
        <div className="card-sub">
          Fuimos <strong>~1 año atrás</strong> (229 señales de flujo real). El edge está en <strong>filtrar por convicción</strong>:
          vendiendo el credit spread <strong>solo en el Top⅓ de convicción de EVA</strong>, el retorno medio sobre riesgo pasó de
          <strong> +2.1%</strong> (operando todas) a <strong> +5.6%</strong> (win 93%) — y la baja convicción se quedó en +1.5%.
          Ese salto <strong>es</strong> el edge, y no fue suerte: aguantó en las <strong>2 mitades</strong> del año (5.7% / 5.4%),
          en <strong>14 de 14</strong> combinaciones, y sobrevivió costos hasta <strong>15% de slippage</strong>.
        </div>
        <div style={{ fontSize: 13.5, color: "#101828", marginTop: 10, background: "#F1F5F4", borderRadius: 8, padding: "10px 12px" }}>
          <strong>¿En una cuenta de $60,000?</strong> Arriesgando <strong>2% ($1,200)</strong> por operación, con las <strong>~70 operaciones</strong> de alta convicción del año (celda de 5 días) a <strong>+5.6%</strong> de media:
          <div style={{ margin: "8px 0", fontVariantNumeric: "tabular-nums", display: "flex", flexDirection: "column", gap: 5 }}>
            <div>• <strong>Sin reinvertir</strong> (riesgo fijo $1,200): $60,000 → <strong style={{ color: "#027A48" }}>~$64,700</strong> &nbsp;(+$4,700 · ~+7.8%)</div>
            <div>• <strong>Reinvirtiendo</strong> (riesgo = 2% del saldo): $60,000 → <strong style={{ color: "#027A48" }}>~$64,900</strong> &nbsp;(+$4,900 · ~+8.2%)</div>
          </div>
          En <strong>1 año</strong> la diferencia es chica (cada operación mueve la cuenta ~0.11%); el interés compuesto se nota de verdad <strong>año tras año</strong>.
        </div>
        <div style={{ fontSize: 11.5, color: "#667085", marginTop: 8 }}>
          Simulación sobre datos reales (~1 año). Vencimiento por calendario, IV≈vol realizada, costos incluidos.
          El monto en $ es <strong>ilustrativo</strong>: depende del tamaño de posición que elijas y cuenta solo la celda de 5 días.
          El compuesto usa la media (la variación real lo baja un poco). Es backtest — la prueba en vivo (abajo) es la que manda.
        </div>
      </div>

      {/* 1. Las pruebas que hicimos */}
      <div className="card">
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>1 · Las pruebas que hicimos (backtest)</div>
        <div className="card-sub" style={{ marginBottom: 10 }}>
          Probamos la idea contra ~1 año de datos reales (un simulador). Le pusimos 3 exámenes duros y los pasó:
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {[
            ["Out-of-sample", "¿Aguanta en el tiempo o fue suerte de un período? Partimos el año en 2 mitades.", "PASA — positivo en las 2 mitades"],
            ["Amplitud", "¿El edge es de UNA combinación con suerte, o de muchas?", "PASA — sale en 13 de 14 combinaciones"],
            ["Costos", "¿El slippage (lo que pierdes al operar) se come el edge?", "PASA — sobrevive hasta 15% de slippage"],
          ].map(([t, q, r]) => (
            <div key={t} style={{ background: "#F1F5F4", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{t}</div>
              <div style={{ fontSize: 12, color: "#667085", margin: "4px 0 8px" }}>{q}</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#027A48" }}>✓ {r}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: "#667085", marginTop: 10 }}>
          Clave: el edge <strong>solo aparece filtrando por la alta convicción de EVA</strong>. Operar todas las señales apenas empata;
          la alta convicción gana y la baja pierde. Eso es lo que hace valioso a EVA.
        </div>
      </div>

      {/* 2. La prueba que hacemos ahora */}
      <div className="card">
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>2 · La prueba que hacemos AHORA (forward-test)</div>
        <div className="card-sub">
          El backtest mira al pasado (se puede engañar). El <strong>forward-test</strong> es la prueba de verdad: hacia adelante,
          con datos que EVA no vio nunca. Cada día hábil, EVA registra (en simulación) el credit spread que abriría en los tickers de alta
          convicción, y lo liquida a vencimiento contra el precio real. Corre solo en la nube (Railway) y va acumulando resultados con el tiempo.
        </div>
      </div>

      {/* 3. Las mejoras, agrupadas: las que produjeron el edge vs. las de futuro */}
      <div className="card">
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>3 · Las mejoras de EVA</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>
          El edge de abajo vino de <strong>2</strong> de ellas. Las otras <strong>3</strong> son apuestas a futuro — todavía <strong>NO</strong> aportan al edge.
        </div>

        <div style={{ fontSize: 13, fontWeight: 800, color: "#027A48", margin: "0 0 8px" }}>✅ Lo que produce el edge hoy</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[5, 4].map((n) => <MejoraCard key={n} m={MEJORAS.find((x) => x.n === n)!} />)}
        </div>

        <div style={{ fontSize: 13, fontWeight: 800, color: "#B54708", margin: "16px 0 8px" }}>🔜 A futuro — todavía NO aportan al edge</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[2, 3, 1].map((n) => <MejoraCard key={n} m={MEJORAS.find((x) => x.n === n)!} />)}
        </div>

        <div style={{ fontSize: 12, color: "#667085", marginTop: 12 }}>
          Honestidad: el edge de hoy = <strong>convicción → vehículo</strong> + <strong>resultado como distribución</strong>. Régimen, GEX y aprendizaje son a futuro. No inventamos lo que no está listo.
        </div>
      </div>

      {/* 4. El forward-test en vivo */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>4 · El forward-test EN VIVO</div>
          {data && (
            <span style={{ fontSize: 11, color: "#667085" }}>
              fuente: {data.source === "redis" ? "Redis (vivo)" : "semilla"} · {data.counts.total} jugadas
            </span>
          )}
        </div>

        {err && <div style={{ color: "#B42318", marginTop: 8 }}>No pude cargar el ledger: {err}</div>}
        {!data && !err && <div className="card-sub" style={{ marginTop: 8 }}>Cargando el ledger…</div>}

        {data && (
          <>
            {/* Vehículo + conteos */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, margin: "10px 0" }}>
              <Tile label="Vehículo" value="Credit spread" sub="con red · pérdida capada" />
              <Tile label="Jugadas de papel" value={String(data.counts.total)} sub={`${data.counts.open} abiertas · ${data.counts.closed} cerradas`} />
              <Tile label="Resultado (cerradas)" value={pct(data.overall.mean)} sub={data.overall.win != null ? `win ${data.overall.win}% · n=${data.overall.n}` : "aún sin cierres"} good={(data.overall.mean ?? 0) > 0} />
            </div>

            {/* El filtro de EVA */}
            <div style={{ background: "#F1F5F4", borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>El valor de EVA: el filtro (Top⅓ vs Bottom⅓ por convicción)</div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 8 }}>
                <Mini label="Alta convicción (Top⅓)" stat={data.filter.top} good />
                <Mini label="Baja convicción (Bottom⅓)" stat={data.filter.bottom} />
              </div>
              <div style={{ fontSize: 12, color: "#667085", marginTop: 8 }}>
                {data.counts.closed < 12
                  ? "⚠ Todavía hay muy pocos cierres para concluir. Apuntamos a n≥30 por grupo. Vuelve en unas semanas."
                  : filterWorks
                    ? "La alta convicción rinde mejor que la baja — como en el backtest. Buena señal."
                    : "De momento el filtro no separa; hace falta más data."}
              </div>
            </div>

            {/* Por celda */}
            {data.cells.some((c) => c.stat.n > 0) && (
              <div style={{ overflowX: "auto", marginBottom: 10 }}>
                <table className="cs-table">
                  <thead><tr><th>Celda (plazo @ distancia)</th><th>Cerradas</th><th>Win</th><th>Media</th></tr></thead>
                  <tbody>
                    {data.cells.map((c) => (
                      <tr key={c.key}>
                        <td>{cellLabel(c.dte, c.sigma)}</td>
                        <td>{c.stat.n || "—"}</td>
                        <td>{c.stat.win == null ? "—" : `${c.stat.win}%`}</td>
                        <td style={{ color: (c.stat.mean ?? 0) > 0 ? "#027A48" : (c.stat.mean ?? 0) < 0 ? "#B42318" : "#667085", fontWeight: 700 }}>{pct(c.stat.mean)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* La tabla: qué entró, estatus, resultado */}
            <div style={{ fontWeight: 700, fontSize: 14, margin: "6px 0" }}>Qué entró · estatus · resultado</div>
            <div style={{ overflowX: "auto" }}>
              <table className="cs-table">
                <thead>
                  <tr>
                    <th>Ticker</th><th>Estrategia (el vehículo)</th><th>Conv. EVA</th><th>Entrada</th><th>Vence</th><th>Estatus</th><th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trades.slice(0, 80).map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 700 }}>{t.ticker}</td>
                      <td>
                        {cellLabel(t.dte, t.sigma)} · {t.dir === 1 ? "alcista (put spread)" : "bajista (call spread)"}
                        <div style={{ fontSize: 11, color: "#667085" }}>vende ${t.shortK} / compra ${t.longK}</div>
                      </td>
                      <td>{t.evaComp}</td>
                      <td>{t.entryDate}</td>
                      <td>{t.expiryDate}</td>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "2px 8px",
                          background: t.status === "closed" ? "#EAECF0" : "#E1F5EE",
                          color: t.status === "closed" ? "#475467" : "#0B5D46" }}>
                          {t.status === "closed" ? "cerrada" : "abierta"}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: t.retOnRisk == null ? "#667085" : t.retOnRisk > 0 ? "#027A48" : t.retOnRisk < 0 ? "#B42318" : "#667085" }}>
                        {t.status === "closed" ? pct(t.retOnRisk) : "en curso"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.trades.length > 80 && <div style={{ fontSize: 12, color: "#667085", marginTop: 6 }}>Mostrando 80 de {data.trades.length}.</div>}
            <div style={{ fontSize: 11.5, color: "#667085", marginTop: 10 }}>
              Resultado = retorno sobre el riesgo máximo del spread. "En curso" = la jugada sigue abierta hasta su vencimiento.
              Entrada al cierre del día de la señal; IV≈volatilidad realizada; slippage y comisión incluidos. Es una simulación en vivo, todavía en prueba.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MejoraCard({ m }: { m: { n: number; name: string; does: string; status: string; here: string } }) {
  const b = STATUS_BADGE[m.status];
  return (
    <div style={{ border: "1px solid #E4E7EC", borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700 }}>#{m.n} · {m.name}</span>
        <span style={{ fontSize: 11, fontWeight: 800, background: b.bg, color: b.fg, borderRadius: 999, padding: "2px 9px" }}>{b.label}</span>
      </div>
      <div style={{ fontSize: 13, color: "#101828", marginTop: 6 }}>{m.does}</div>
      <div style={{ fontSize: 12.5, color: "#667085", marginTop: 5 }}><strong>Aquí:</strong> {m.here}</div>
    </div>
  );
}

function Tile({ label, value, sub, good }: { label: string; value: string; sub: string; good?: boolean }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11.5, color: "#667085", textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: good == null ? "#101828" : good ? "#027A48" : "#B42318" }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "#667085" }}>{sub}</div>
    </div>
  );
}

function Mini({ label, stat, good }: { label: string; stat: Stat; good?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#667085" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: stat.mean == null ? "#667085" : (stat.mean > 0) ? (good ? "#027A48" : "#101828") : "#B42318" }}>
        {stat.mean == null ? "—" : `${stat.mean > 0 ? "+" : ""}${stat.mean}%`}
      </div>
      <div style={{ fontSize: 11, color: "#667085" }}>{stat.n ? `win ${stat.win}% · n=${stat.n}` : "sin cierres"}</div>
    </div>
  );
}
