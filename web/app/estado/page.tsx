"use client";

// LA LISTA DEL PROYECTO — todo lo que se ha medido, en una sola pantalla.
//
// Nace de una preocupación de Lester: "con tanta validación puede estar pasando desapercibido
// algo importante". Y es cierto — llevamos más de cien mediciones y lo único que las unía era
// la memoria de Claude y los mensajes de commit.
//
// Los CERRADOS están aquí a propósito. Una lista que sólo enseña lo vivo invita a volver a
// proponer lo que ya se mató, y eso ha pasado más de una vez.
//
// El contenido vive en lib/estadoProyecto.ts. Esta página sólo lo pinta.

import { useEffect, useState } from "react";
import NavTabs from "@/app/components/NavTabs";
import EvaLogo from "@/app/components/EvaLogo";
import EstrategiasTabla from "@/app/components/EstrategiasTabla";
import ForwardTests from "@/app/components/ForwardTests";
import { ITEMS, RESUMEN, ACTUALIZADO, type EstadoItem, type Item } from "@/lib/estadoProyecto";

const GRUPOS: { estado: EstadoItem; titulo: string; sub: string; icono: string }[] = [
  { estado: "en-prueba", titulo: "EN PRUEBA AHORA MISMO", sub: "desplegado y midiéndose en directo", icono: "🔬" },
  { estado: "funciona", titulo: "Medido y en pie", sub: "sobrevivió a las pruebas, listo para usar", icono: "🟢" },
  { estado: "pendiente", titulo: "Pendiente", sub: "por orden de lo que yo haría primero", icono: "📋" },
  { estado: "cerrado", titulo: "Cerrado", sub: "medido y descartado — está aquí para no volver a proponerlo", icono: "⛔" },
];

/** ¿Hay algun cuaderno CORRIENDO que no este en la lista de "En prueba ahora mismo"?
 *
 *  El 31 de agosto de 2026 Lester lo vio: la seccion decia "2 en prueba" habiendo DIEZ cuadernos
 *  escribiendo en Redis — con el credit spread marcado como CERRADO mientras acumulaba 253
 *  operaciones, y el Wheel como PENDIENTE ("crear backtest y monitoreo") llevando 274 posiciones
 *  desde el 4 de agosto. La lista se escribe a mano y los cuadernos escriben solos: se separan y
 *  nadie se entera.
 *
 *  Rellenar la lista no arregla nada — se volveria a quedar vieja al siguiente despliegue. Lo que
 *  arregla es que la pagina lo DIGA. Cada entrada declara que cuadernos cubre (`cuadernos`) y
 *  esto avisa de los que no cubre nadie. */
function CuadernosSinFicha() {
  const [sueltos, setSueltos] = useState<{ id: string; nombre: string; cerradas: number }[]>([]);
  const [fuera, setFuera] = useState<{ id: string; nombre: string; cerradas: number; donde: string }[]>([]);
  useEffect(() => {
    fetch("/api/forward-tests")
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ok || !Array.isArray(d.cuadernos)) return;
        const cubiertos = new Set(ITEMS.flatMap((i) => i.cuadernos ?? []));
        setSueltos(
          d.cuadernos
            .filter((c: { id: string }) => !cubiertos.has(c.id))
            .map((c: { id: string; nombre: string; cerradas?: number }) => ({
              id: c.id, nombre: c.nombre, cerradas: c.cerradas ?? 0 })));
        // Los que SI tienen ficha, pero en otra seccion. Lester, 31-ago: "por que hay forward
        // test que no aparecen en el area de en prueba ahora mismo". Estan corriendo; lo que
        // pasa es que su veredicto es otro y la ficha vive donde le toca. Se dice, no se duplica.
        const COMO: Record<string, string> = { "en-prueba": "En prueba", funciona: "Medido y en pie",
          pendiente: "Pendiente", cerrado: "Cerrado" };
        const enPrueba = new Set(ITEMS.filter((i) => i.estado === "en-prueba").flatMap((i) => i.cuadernos ?? []));
        setFuera(
          d.cuadernos
            .filter((c: { id: string }) => cubiertos.has(c.id) && !enPrueba.has(c.id))
            .map((c: { id: string; nombre: string; cerradas?: number }) => ({
              id: c.id, nombre: c.nombre, cerradas: c.cerradas ?? 0,
              donde: COMO[ITEMS.find((i) => (i.cuadernos ?? []).includes(c.id))?.estado ?? ""] ?? "otra sección" })));
      })
      .catch(() => {});
  }, []);
  if (!sueltos.length && !fuera.length) return null;
  return (
    <div className="est-deriva">
      {fuera.length ? (
        <>
          <b>📓 {fuera.length} cuadernos más se están midiendo ahora mismo</b>
          <p>
            Su ficha no está aquí sino en otra sección, porque ese es el veredicto de la
            estrategia — el cuaderno corre justamente para comprobarlo:
          </p>
          <ul>
            {fuera.map((c) => (
              <li key={c.id}>
                <b>{c.nombre}</b> — {c.cerradas ? `${c.cerradas} operaciones cerradas` : "sin operar todavia"}
                {" · ficha en "}<b>{c.donde}</b>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {sueltos.length ? (
        <>
          <b>⚠ {sueltos.length} cuadernos corriendo que no estan en esta lista.</b>
          <p>
            Estan escribiendo en Redis ahora mismo y no tienen ficha aqui. Salen todos en el
            marcador de arriba, pero esta seccion se escribe a mano y se ha quedado vieja:
          </p>
        </>
      ) : null}
      {sueltos.length ? (
      <ul>
        {sueltos.map((c) => (
          <li key={c.id}>
            <b>{c.nombre}</b> — {c.cerradas ? `${c.cerradas} operaciones cerradas` : "sin operar todavia"}
          </li>
        ))}
      </ul>
      ) : null}
    </div>
  );
}

/** La MUESTRA VIVA de una ficha: cuantas ha operado y con que resultado, leido de Redis.
 *
 *  Lester, 31-ago-2026: "en todas coloca la muestra de lo que han tradeado con su respectivo
 *  resultado". No se escribe a mano a proposito: un numero pegado aqui estaria viejo manana, que
 *  es exactamente la deriva que acabamos de arreglar. La prosa se escribe; la cifra se lee. */
let _cache: Promise<any> | null = null;
const traerCuadernos = () => (_cache ??= fetch("/api/forward-tests").then((r) => r.json()).catch(() => null));

/** LOS CUATRO NUMEROS DE ARRIBA — los pidio Lester asi, literalmente, el 31-ago-2026:
 *  "coloca cuantos forward test tenemos abiertos y cuantos cerrados. No se a que te refieres
 *   con en pie 2. Tenemos 5 TEMAS pendientes y aparentemente 10 IDEAS cerradas."
 *
 *  Antes contaban IDEAS mientras el resto de la pagina contaba OPERACIONES, y ademas habia un
 *  "2 en pie" que no significaba nada para quien lo leia. Los cuatro salen calculados de ITEMS:
 *  un forward test es una ficha CON cuaderno enganchado. Cerrados salen 0, y es correcto: la
 *  unica ficha cerrada que se llama "forward test" es una que se decidio NO arrancar.
 */
function Contadores() {
  const conCuaderno = (e: string) => ITEMS.filter((x) => x.estado === e && (x.cuadernos?.length ?? 0) > 0).length;
  return (
    <div className="est-cuentas">
      <div><b>{conCuaderno("en-prueba")}</b><span>forward tests abiertos</span></div>
      <div><b>{conCuaderno("cerrado")}</b><span>forward tests cerrados</span></div>
      <div><b>{RESUMEN.pendiente}</b><span>temas pendientes</span></div>
      <div className="est-cuenta-muerta"><b>{RESUMEN.cerrado}</b><span>ideas cerradas</span></div>
    </div>
  );
}

type Op = { accion: string; opcion: string; spot: number | null; abrio: string; vence: string;
  dias: number | null; que: string; cuando: string; usd: number | null; pct: number | null; nota: string };
function MuestraViva({ ids }: { ids: string[] }) {
  const [txt, setTxt] = useState<string | null>(null);
  const [ops, setOps] = useState<Op[]>([]);
  useEffect(() => {
    traerCuadernos().then((d) => {
      if (!d?.ok || !Array.isArray(d.cuadernos)) return;
      const mios = d.cuadernos.filter((c: { id: string }) => ids.includes(c.id));
      if (!mios.length) return;
      const partes = mios.map((c: any) => {
        const cer = c.cerradas ?? 0, abi = c.abiertas ?? 0;
        if (!cer && !abi) return `${mios.length > 1 ? c.nombre + ": " : ""}sin operar todavia`;
        // DÓLARES SIEMPRE que se puedan. Antes los que miden en % salían solo en porcentaje y
        // las ganancias no se leían como dinero, mientras las pérdidas sí. Lester, 31-ago.
        const d = (x: number) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("es-ES");
        const res = c.mediaUsd != null
          ? ` · ${d(c.mediaUsd)} por operación · ${d(c.totalUsd ?? 0)} total` +
            (c.media != null ? ` · ${c.media >= 0 ? "+" : "−"}${Math.abs(c.media).toFixed(2)}% ${(c.unidad || "").replace("% sobre", "sobre")}` : "")
          : c.media == null ? ""
          : c.unidad?.startsWith("$")
            ? ` · ${d(c.media)} por operación · ${d(c.total ?? c.media * (c.cerradas ?? 1))} total`
            : ` · ${c.media >= 0 ? "+" : "−"}${Math.abs(c.media).toFixed(2)}% ${c.unidad.replace("% sobre", "sobre")}`;
        const ac = c.acierto != null ? ` · acierta ${Math.round(c.acierto * 100)}%` : "";
        // El TOTAL delante: Lester pregunto tres veces "¿cuantas operaciones tradeo?" y la
        // muestra solo decia cerradas y abiertas. El numero que buscaba es la suma.
        const ops = cer + abi;
        return `${mios.length > 1 ? c.nombre + ": " : ""}${ops} operaciones (${cer} cerradas${abi ? `, ${abi} abiertas` : ""})${res}${ac}`;
      });
      setTxt(partes.join("  ·  "));
      setOps(mios.flatMap((c: { ultimas?: Op[] }) => c.ultimas ?? []).slice(0, 10));
    });
  }, [ids]);
  if (!txt) return null;
  // Era una linea de 12,5px en azul debajo del numero y Lester no la veia — la dijo TRES veces.
  // Que exista en el DOM no sirve de nada si se lee como una nota al pie. Ahora es una banda con
  // borde, etiqueta y las cifras grandes: no se puede confundir con el texto de la ficha.
  const d = (x: number) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("es-ES");
  return (
    <div className="est-muestra">
      <div className="est-muestra-cab">
        <span className="est-muestra-chip">EN DIRECTO</span>
        <b>{txt}</b>
      </div>
      {ops.length ? (
        <div className="est-muestra-scroll">
        <table className="est-muestra-tabla">
          <thead><tr>
            <th>acción</th><th>opción</th><th>acción al abrir</th>
            <th>abrió</th><th>vence</th><th>días</th><th>cerró</th><th>resultado</th><th>motivo</th>
          </tr></thead>
          <tbody>
            {ops.map((o, i) => (
              <tr key={i}>
                <td>{o.accion}</td>
                <td className="est-muestra-patas">{o.opcion}</td>
                <td>{o.spot != null ? d(o.spot) : "—"}</td>
                <td>{o.abrio ? o.abrio.slice(5) : "—"}</td>
                <td>{o.vence ? o.vence.slice(5) : "—"}</td>
                <td>{o.dias != null ? o.dias : "—"}</td>
                <td>{o.cuando ? o.cuando.slice(5) : "—"}</td>
                <td className={(o.usd ?? o.pct ?? 0) >= 0 ? "pos" : "neg"}>
                  {o.usd != null ? d(o.usd) : o.pct != null ? `${o.pct >= 0 ? "+" : "−"}${Math.abs(o.pct).toFixed(2)}%` : "—"}
                </td>
                <td className="est-muestra-nota">{o.nota}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : null}
    </div>
  );
}

function Tarjeta({ it }: { it: Item }) {
  const [abierto, setAbierto] = useState(false);
  const hayDetalle = Boolean(it.evidencia?.length || it.enContra || it.siguiente);

  return (
    <article className={`est-item est-${it.estado}`}>
      <header
        className="est-head"
        onClick={() => hayDetalle && setAbierto((v) => !v)}
        role={hayDetalle ? "button" : undefined}
        tabIndex={hayDetalle ? 0 : undefined}
        onKeyDown={(e) => { if (hayDetalle && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setAbierto((v) => !v); } }}
      >
        <div className="est-head-main">
          <h3 className="est-titulo">
            {it.prioridad ? <span className="est-prio">{it.prioridad}</span> : null}
            {it.titulo}
          </h3>
          <p className="est-quees">{it.queEs}</p>
          {it.numero ? <p className="est-numero">{it.numero}</p> : null}
          {it.cuadernos?.length ? <MuestraViva ids={it.cuadernos} /> : null}
        </div>
        {hayDetalle ? <span className={`est-flecha ${abierto ? "on" : ""}`} aria-hidden="true">▾</span> : null}
      </header>

      {abierto && hayDetalle ? (
        <div className="est-detalle">
          {it.evidencia?.length ? (
            <div className="est-bloque">
              <h4>Lo que lo sostiene</h4>
              <ul>{it.evidencia.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          ) : null}
          {it.enContra ? (
            <div className="est-bloque est-encontra">
              <h4>En contra</h4>
              <p>{it.enContra}</p>
            </div>
          ) : null}
          {it.siguiente ? (
            <div className="est-bloque est-siguiente">
              <h4>Lo siguiente</h4>
              <p>{it.siguiente}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default function EstadoPage() {
  const [verCerrados, setVerCerrados] = useState(false);

  return (
    <main className="est-page">
      <div className="hb hb-slim">
        <div className="hb-brand">
          <div className="hb-logo"><EvaLogo /></div>
          <div className="hb-name">EVA</div>
          <div className="hb-chip">Estado del proyecto</div>
        </div>
        <NavTabs />
      </div>

      <section className="est-intro">
        <h1>Qué hemos medido</h1>
        <p>
          Desde el <strong>{RESUMEN.desde}</strong>. Cada entrada lleva lo que hay en contra escrito al lado:
          un hallazgo sin su objeción es propaganda, no una nota de trabajo.
        </p>
        <Contadores />
        {/* SELLO DE VERSION. Lester enseño cuatro veces una captura con "10 CERRADOS" mientras el
            servidor ya mandaba "ideas descartadas": su navegador tenia la pagina vieja en cache y
            no habia forma rapida de saberlo — se fue una sesion entera en averiguarlo. Con el sello
            a la vista, "¿estas viendo lo ultimo?" se contesta en un segundo. Si el numero de aqui
            no coincide con el que yo diga, es cache: Ctrl+Shift+R. */}
        <p className="est-sello">versión {ACTUALIZADO}</p>
      </section>

      {/* ARRIBA DEL TODO: lo que esta pasando en directo va antes que el backtest.
          Lester se entero de que el credit spread llevaba 126 operaciones cerradas
          solo porque pregunto — eso no puede volver a depender de que yo me acuerde. */}
      <ForwardTests />

      <EstrategiasTabla />

      {GRUPOS.map((g) => {
        const items = ITEMS.filter((i) => i.estado === g.estado)
          .sort((a, b) => (a.prioridad ?? 99) - (b.prioridad ?? 99));
        if (!items.length) return null;
        const plegado = g.estado === "cerrado" && !verCerrados;

        return (
          <section key={g.estado} className="est-grupo">
            <header className="est-grupo-head">
              <h2><span aria-hidden="true">{g.icono}</span> {g.titulo}</h2>
              <p>{g.sub}</p>
              {g.estado === "cerrado" ? (
                <button type="button" className="est-toggle" onClick={() => setVerCerrados((v) => !v)}>
                  {verCerrados ? "ocultar" : `ver los ${items.length}`}
                </button>
              ) : null}
            </header>
            {g.estado === "en-prueba" ? <CuadernosSinFicha /> : null}
            {!plegado ? <div className="est-lista">{items.map((it) => <Tarjeta key={it.id} it={it} />)}</div> : null}
          </section>
        );
      })}

      <footer className="est-pie">
        Actualizado el {ACTUALIZADO}. El contenido vive en <code>lib/estadoProyecto.ts</code> —
        si un resultado no está ahí, para el proyecto no existe.
      </footer>
    </main>
  );
}
