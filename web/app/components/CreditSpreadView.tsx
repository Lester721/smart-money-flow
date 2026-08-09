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
  cells: { key: string; dte: number; sigma: number; stat: Stat; statTop: Stat }[];
  cutEva: number | null;
  trades: Trade[];
}

const pct = (x: number | null) => (x == null ? "—" : `${x > 0 ? "+" : ""}${x}%`);
const cellLabel = (dte: number, sigma: number) => `${dte}d @ ${sigma}σ`;

// ── Las 5 mejoras: qué hacen (del Informe) + estado real ──────────────────────
const MEJORAS: { n: number; name: string; does: string; status: "viva" | "parcial" | "dev" | "descartada"; here: string }[] = [
  {
    n: 1, name: "Conciencia de régimen", status: "descartada",
    does: "Sabe en qué 'clima' está el mercado (tranquilo o volátil) y ajusta: una señal que en promedio es ruido puede ser fuerte en un clima específico.",
    here: "DESCARTADA el 7 ago 2026, no pendiente. Con 10 años el clima dejó de importar: el 5d de alta convicción da +1.0% / +2.5% / +2.9% en tranquilo / normal / volátil — positivo en los tres, así que no hay nada que condicionar. Y los filtros de régimen FALLAN fuera de muestra: «rv<30%» daba +3.35% en la mitad vieja y −0.92% en la nueva — se veía bien con poca muestra y se caía con mucha. Lo que sí funcionó no fue el clima del mercado sino el precio de la prima: no vender cuando el flujo paga una IV desproporcionada. Esa idea vive ahora en el scorer EVA-IV.",
  },
  {
    n: 2, name: "Lado del dealer (GEX)", status: "parcial",
    does: "Ve hacia dónde los market makers están forzados a comprar/vender — los muros de gamma que frenan o aceleran el precio.",
    here: "PROBADA A FONDO el 8 ago 2026: se bajó el open interest por strike Y por expiración de los 10 años (22,465 días, 192 MB) y se probó de cuatro formas. Resultado honesto: el MECANISMO existe y está confirmado —en SPY el precio se mueve 1.22 veces lo esperado con gamma negativa contra 0.92 con positiva, y aguanta los 4 sub-períodos— pero COBRARLO es otra cosa. Elegir el strike por el muro pierde contra distancias fijas. Filtrar por régimen aporta +$857/año en índices y −$694/año en acciones: neto, ruido. Vive en la vista Ticker, y en el forward-test se GRABA en cada operación sin decidir nada, para que en unos meses la juzguen los datos en vivo y no mi backtest.",
  },
  {
    n: 3, name: "Bucle de aprendizaje", status: "parcial",
    does: "Mide sus propios aciertos y se re-calibra sola. Victor es estático; EVA aprende de lo que funcionó.",
    here: "La mitad que MIDE ya funciona: el ledger de abajo lleva 71 cierres y de ahí salió todo lo del 7 ago 2026 — se vio que la gestión restaba, que el plazo largo no servía y que filtrar por IV sumaba. Lo que falta es el AUTOMATISMO: ese bucle lo cerró una persona a mano (mirar resultados → probar una idea → aplicarla). EVA todavía no se re-calibra sola.",
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
  descartada: { label: "DESCARTADA", bg: "#FEE4E2", fg: "#B42318" },
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

      {/* EL RESULTADO, corregido el 9 ago 2026. Antes decía +3,2% / ~$8.053 al año / ~13%.
          Era falso: se medía con Black-Scholes y volatilidad realizada, y con comisiones de un
          bróker que Lester no usa. Con bid/ask reales el mismo vehículo PIERDE dinero. */}
      <div className="card" style={{ borderLeft: "4px solid #F04438" }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>El resultado, corregido el 9 ago 2026 🔴</div>
        <div className="card-sub">
          Esta tarjeta decía <strong>+3.2% por operación · ~$8,053 al año · ~13% sobre la cuenta</strong>.
          <strong> Era falso.</strong> Ese número se medía valorando las opciones con
          <strong> Black-Scholes</strong> y volatilidad realizada, no con los precios a los que el mercado
          cotizaba de verdad. Medido con <strong>bid/ask reales</strong>, el mismo vehículo
          <strong> pierde dinero</strong>.
        </div>
        <div style={{ fontSize: 13.5, color: "#101828", marginTop: 10, background: "#F1F5F4", borderRadius: 8, padding: "10px 12px" }}>
          <strong>Lo que dio cada versión de la misma estrategia:</strong>
          <div style={{ margin: "8px 0", fontVariantNumeric: "tabular-nums", display: "flex", flexDirection: "column", gap: 5 }}>
            <div>• Black-Scholes, strikes ideales: <strong>+3.20%</strong> &nbsp;<span style={{ color: "#667085" }}>← lo que decía esta página</span></div>
            <div>• Black-Scholes, strikes reales: <strong>+3.10%</strong></div>
            <div>• <strong>Precios reales (bid/ask):</strong> <strong style={{ color: "#B42318" }}>−2.53%</strong> &nbsp;<span style={{ color: "#667085" }}>← la realidad</span></div>
          </div>
          <div style={{ color: "#101828" }}>
            <strong>La rejilla de strikes cuesta 0.1 puntos. Los precios cuestan 5.6.</strong> No es que los
            strikes listados sean peores: es que el mercado <strong>paga mucha menos prima</strong> de la que el
            modelo suponía. Cobrábamos, en la simulación, un crédito que en la realidad no existe.
          </div>
        </div>
        <div style={{ fontSize: 13.5, color: "#101828", marginTop: 10, background: "#F1F5F4", borderRadius: 8, padding: "10px 12px" }}>
          <strong>Y no se arregla ajustando parámetros.</strong> Se barrieron 15 combinaciones de distancia y
          ancho con precios reales, sobre el Top⅓ de convicción. <strong>Ninguna es positiva.</strong> El motivo
          es aritmético: con un {" "}<strong>94% de aciertos</strong> el equilibrio exige cobrar el <strong>6.2%</strong> del
          ancho, y el mercado paga <strong>5.0%</strong>. Ese hueco de <strong>1.2 puntos</strong> es, con buena
          aproximación, <strong>lo que cuesta cruzar el bid/ask</strong>.
          <div style={{ marginTop: 6 }}>
            Dicho de otro modo: <strong>el vehículo está bien valorado y perdemos el coste de transacción.</strong>
          </div>
        </div>
        {/* var(--muted), no #667085: sobre el fondo oscuro del tema ese gris da contraste 3,5 —
            por debajo del mínimo legible. Y esto son las ADVERTENCIAS, lo que más hay que leer.
            Ojo: dentro de las cajas de fondo claro (#F1F5F4, #FFF) el #667085 sí es correcto;
            en este archivo conviven los dos casos. */}
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>
          Simulación sobre <strong>10 años</strong> de datos reales (2016-2026). Vencimiento por calendario, IV≈vol realizada, costos incluidos.
          El monto en $ es <strong>ilustrativo</strong> y depende del tamaño de posición. Es el <strong>promedio esperado</strong> de
          una distribución con cola gorda —ganas 11.5% muchas veces y pierdes ~65% pocas veces—, <strong>no una renta mensual</strong>:
          hubo <strong>2 años perdedores de 11</strong>. Es backtest — la prueba en vivo (abajo) es la que manda.
        </div>
      </div>

      {/* 1. Las pruebas que hicimos */}
      <div className="card">
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>1 · Las pruebas que hicimos (backtest)</div>
        <div className="card-sub" style={{ marginBottom: 10 }}>
          Probamos la idea contra <strong>10 años</strong> de datos reales (2016-2026, con el COVID y el bear de 2022 dentro). Le pusimos 4 exámenes duros:
        </div>
        <div style={{ fontSize: 12, color: "#B54708", background: "#FFFAEB", border: "1px solid #FEDF89", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
          <strong>⚠️ Historial de correcciones (7 ago 2026).</strong> Esta vista dijo dos cosas que resultaron falsas, y conviene
          que queden escritas: <strong>(1)</strong> se describió un backtest como &ldquo;4 años con el crash del COVID&rdquo; cuando el
          proveedor solo daba precios desde 2021 y las señales sin precio se descartaban en silencio — fueron <strong>2 años sin
          COVID</strong>. <strong>(2)</strong> Con esos 2 años se concluyó que el plazo bueno era el de <strong>90 días</strong>. Con
          10 años reales, el 90d da <strong>−2.5%</strong> y falla out-of-sample: el edge está en el <strong>plazo corto</strong>.
          Cuatro conclusiones se dieron vuelta al ampliar la muestra — ninguna era un error de cálculo, era <strong>ruido con
          aspecto de señal</strong>.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {[
            ["Out-of-sample", "¿Aguanta en el tiempo o fue suerte de un período? Partimos los 10 años en 2 mitades (la vieja incluye el COVID).", "PASA (5d) — +3.4% y +3.0%", true],
            ["Amplitud", "¿El edge es de UNA combinación con suerte, o de muchas?", "OJO — 6 de 16 combinaciones; todas en plazo CORTO (3d a 30d)", false],
            ["El crash", "¿Qué hizo durante el desplome del COVID (feb-abr 2020)?", "SOBREVIVE, no gana — media −1.6% en esos 3 meses (n=34)", false],
            ["El GEX", "¿El lado del dealer aporta dinero, no solo teoría?", "MECANISMO SÍ (4/4 sub-períodos) — dinero casi no: +$163/año neto", false],
          ].map(([t, q, r, ok]) => (
            <div key={t as string} style={{ background: "#F1F5F4", borderRadius: 10, padding: 12 }}>
              {/* El color va explícito: la tarjeta tiene fondo claro fijo (#F1F5F4) pero el tema
                  de la app es oscuro y pinta el texto heredado en casi-blanco — el título salía
                  blanco sobre blanco, invisible. La pregunta y el veredicto de abajo ya tenían
                  color propio, por eso se leían y este no. */}
              <div style={{ fontWeight: 700, fontSize: 13, color: "#101828" }}>{t}</div>
              <div style={{ fontSize: 12, color: "#667085", margin: "4px 0 8px" }}>{q}</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: ok ? "#027A48" : "#B54708" }}>{ok ? "✓" : "⚠"} {r}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10 }}>
          <strong>Tres conclusiones:</strong> (1) el <strong>filtro de EVA funciona</strong> — el Top⅓ de convicción rinde
          <strong> +2.3%</strong> vs <strong>−3.7%</strong> del Bottom⅓, y le gana a los pesos de Victor (+1.5%). Es lo único que ha
          sobrevivido a las cuatro versiones de esta prueba. (2) <strong>El edge está en el plazo corto</strong>: 5d da +2.3% y 90d
          da <strong>−2.5%</strong> fallando out-of-sample. (3) <strong>El win rate casi no cambia nunca</strong> —entre 85% y 94%
          todos los años—, así que lo que decide el año no es cuántas ganas sino <strong>cuánto pesan las pocas que pierdes</strong>.
          Por eso la mejora que sirvió fue un filtro de cola, no uno de dirección.
        </div>

        {/* El GEX en detalle. Va aquí y no en "mejoras" porque es el ejemplo más claro de la
            distancia entre "el efecto existe" y "el efecto se cobra" — que es la lección que
            más veces hemos tenido que reaprender en este proyecto. */}
        <div style={{ fontSize: 13, color: "#101828", background: "#F1F5F4", borderRadius: 8, padding: "10px 12px", marginTop: 12 }}>
          <strong>El GEX, en detalle (8 ago 2026).</strong> Se bajó el open interest por strike y por
          expiración de los 10 años y se probó de cuatro formas. El <strong>mecanismo existe</strong>:
          en SPY el precio se mueve <strong>1.22</strong> veces lo esperado cuando la gamma es negativa
          contra <strong>0.92</strong> cuando es positiva, sobre 2,608 días y aguantando los
          <strong> 4 sub-períodos</strong>. Pero cobrarlo es otra cosa:
          <div style={{ margin: "8px 0", display: "flex", flexDirection: "column", gap: 5 }}>
            <div>• <strong>Índices (SPY+QQQ):</strong> sin filtro +0.22% × 67 ops = $174/año · con filtro +3.50% × 25 ops = <strong style={{ color: "#027A48" }}>$1,031/año</strong> &nbsp;(+$857)</div>
            <div>• <strong>Acciones:</strong> sin filtro +4.00% × 132 ops = $6,331/año · con filtro +4.64% × 101 ops = <strong style={{ color: "#B42318" }}>$5,637/año</strong> &nbsp;(−$694)</div>
            <div>• <strong>Neto: +$163/año.</strong> El filtro sube el rendimiento por operación pero <strong>quita operaciones</strong>, y en acciones lo segundo pesa más.</div>
          </div>
          <div>
            <strong>Y la cola no se distingue del azar:</strong> las catástrofes bajan de 10.3% a 7.8% en
            índices, pero eso son <strong>10 casos de 129</strong> — el margen de error (±2.4 puntos) es
            mayor que la diferencia. No la contamos como real. Por eso en el forward-test el GEX
            <strong> se graba pero no decide</strong>.
          </div>
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
        <div style={{ fontSize: 12.5, color: "#101828", background: "#F1F5F4", borderRadius: 8, padding: "10px 12px", marginTop: 10 }}>
          <strong>Cambios del 7 ago 2026, tras el backtest de 10 años:</strong>
          <div style={{ margin: "6px 0 0", display: "flex", flexDirection: "column", gap: 4 }}>
            <div>• <strong>Celdas:</strong> se pasó de 5d/60d/90d a <strong>5d y 7d (a 1σ y 1.5σ)</strong> — las 4 que aguantan out-of-sample. El 90d se queda solo como <strong>control</strong>.</div>
            <div>• <strong>Gestión APAGADA.</strong> La regla que corría (cerrar al ganar 25% / cortar al perder 1× la prima) salió de la muestra vieja de 2 años. Con 10 años resultó ser <strong>la peor de 9 reglas</strong>. <em>(Las dos cifras que comparábamos aquí —$8,053 y $4,973— eran del modelo. Rehecho con precios reales el 9 ago 2026: los stops tampoco salvan nada, van de −2.76% a −3.59%.)</em></div>
            <div>• <strong>Scorer nuevo &laquo;EVA-IV&raquo;</strong> corriendo en paralelo, sin cambiar qué se abre: mide si saltarse los días de IV desproporcionada funciona también en vivo.</div>
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Cambio del 8 ago 2026:</strong> cada operación que se abre queda anotada con el
            <strong> GEX del día</strong> y con el tamaño del mercado de opciones del ticker. <strong>No
            filtra nada</strong> —se abren exactamente las mismas operaciones— pero dentro de unos meses
            se podrá partir el histórico EN VIVO por régimen de gamma y decidir con datos propios en vez
            de con el backtest. Empieza a grabar hoy: las posiciones abiertas antes no lo llevan.
          </div>
        </div>
      </div>

      {/* 3. Las mejoras, agrupadas: las que produjeron el edge vs. las de futuro */}
      <div className="card">
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>3 · Las mejoras de EVA</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>
          El edge de abajo vino de <strong>2</strong> de ellas. Otras <strong>2</strong> siguen pendientes y <strong>1 se probó y falló</strong>.
          Las pendientes se quedan escritas con lo que les falta de verdad, y la descartada no se borra: si no queda constancia de lo que
          NO funcionó, alguien lo vuelve a proponer dentro de tres meses.
        </div>

        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--green)", margin: "0 0 8px" }}>✅ Lo que produce el edge hoy</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[5, 4].map((n) => <MejoraCard key={n} m={MEJORAS.find((x) => x.n === n)!} />)}
        </div>

        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--amber)", margin: "16px 0 8px" }}>🔜 A futuro — todavía NO aportan al edge</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[2, 3].map((n) => <MejoraCard key={n} m={MEJORAS.find((x) => x.n === n)!} />)}
        </div>

        {/* La descartada va en su propio grupo. Mezclarla con "a futuro" la hacía parecer
            pendiente cuando ya se probó y falló — y borrarla escondería que se intentó. */}
        {/* Rojo CLARO: este encabezado va sobre el fondo oscuro del tema. El #B42318 de las
            tarjetas claras daba contraste 2,65 — por debajo del mínimo legible. */}
        <div style={{ fontSize: 13, fontWeight: 800, color: "#F97066", margin: "16px 0 8px" }}>❌ Probada y descartada</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1].map((n) => <MejoraCard key={n} m={MEJORAS.find((x) => x.n === n)!} />)}
        </div>

        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
          Honestidad: el edge de hoy = <strong>convicción → vehículo</strong> + <strong>resultado como distribución</strong>.
          El régimen se probó y falló. El GEX se probó a fondo: el mecanismo es real pero el dinero es ruido, así que
          se graba sin decidir. El aprendizaje automático sigue pendiente. No inventamos lo que no está listo.
        </div>
      </div>

      {/* 4. El forward-test en vivo */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>4 · El forward-test EN VIVO</div>
          {data && (
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              fuente: {data.source === "redis" ? "Redis (vivo)" : "semilla"} · {data.counts.total} jugadas
            </span>
          )}
        </div>

        {err && <div style={{ color: "var(--red)", marginTop: 8 }}>No pude cargar el ledger: {err}</div>}
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
              {/* Color explícito: la tarjeta tiene fondo claro y el tema pinta el texto heredado
                  en casi-blanco → sería invisible. Ver el comentario de MejoraCard. */}
              <div style={{ fontWeight: 700, fontSize: 14, color: "#101828" }}>El valor de EVA: el filtro (Top⅓ vs Bottom⅓ por convicción)</div>
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
                <div style={{ fontSize: 12.5, color: "#98A2B3", marginBottom: 6 }}>
                  La columna que cuenta es la de <strong>ALTA CONVICCIÓN</strong>: es lo que se operaría de verdad.
                  &laquo;Todas&raquo; incluye el tercio de baja convicción que el filtro descarta — está de referencia,
                  para ver cuánto aporta filtrar{data.cutEva != null && <> (umbral actual: <strong>{Math.round(data.cutEva * 10) / 10}</strong>)</>}.
                </div>
                <table className="cs-table">
                  <thead>
                    <tr>
                      <th>Celda (plazo @ distancia)</th>
                      <th>Cerradas</th><th>Win</th><th>Media</th>
                      <th>Todas (n)</th><th>Todas (media)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cells.map((c) => (
                      <tr key={c.key}>
                        <td>{cellLabel(c.dte, c.sigma)}</td>
                        <td>{c.statTop.n || "—"}</td>
                        <td>{c.statTop.win == null ? "—" : `${c.statTop.win}%`}</td>
                        {/* Las tablas van sobre el fondo OSCURO del tema, así que usan
                            var(--green)/var(--red) — los #027A48/#B42318 de las cajas claras dan
                            contraste 2,9 aquí, y estos son los números que se vienen a leer. */}
                        <td style={{ color: (c.statTop.mean ?? 0) > 0 ? "var(--green)" : (c.statTop.mean ?? 0) < 0 ? "var(--red)" : "var(--muted)", fontWeight: 700 }}>{pct(c.statTop.mean)}</td>
                        <td style={{ color: "var(--muted)" }}>{c.stat.n || "—"}</td>
                        <td style={{ color: "var(--muted)" }}>{pct(c.stat.mean)}</td>
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
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>vende ${t.shortK} / compra ${t.longK}</div>
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
                      <td style={{ fontWeight: 700, color: t.retOnRisk == null ? "var(--muted)" : t.retOnRisk > 0 ? "var(--green)" : t.retOnRisk < 0 ? "var(--red)" : "var(--muted)" }}>
                        {t.status === "closed" ? pct(t.retOnRisk) : "en curso"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.trades.length > 80 && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Mostrando 80 de {data.trades.length}.</div>}
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10 }}>
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
      {/* Esta tarjeta NO tiene fondo propio: hereda el oscuro del tema. Tenía color #101828
          (casi negro) sobre ese fondo → texto invisible. Se deja que herede el color del tema,
          que ya es claro. Ojo con copiar colores de las tarjetas de fondo claro: en este
          archivo conviven los dos casos y se confunden con facilidad. */}
      <div style={{ fontSize: 13, marginTop: 6 }}>{m.does}</div>
      <div style={{ fontSize: 12.5, color: "#98A2B3", marginTop: 5 }}><strong>Aquí:</strong> {m.here}</div>
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
