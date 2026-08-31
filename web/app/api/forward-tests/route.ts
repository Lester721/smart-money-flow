// GET /api/forward-tests — el marcador de los cuadernos que corren en directo.
//
// ═══ POR QUÉ EXISTE ════════════════════════════════════════════════════════════════════════
//
// Lester preguntó cuántos forward tests había, y al mirarlo apareció que el del credit spread
// llevaba **126 operaciones cerradas y +$3.562** desde el 3 de agosto. Nadie se lo había dicho —
// yo lo tenía archivado como "cerrado" desde que el backtest dio −2,53% y dejé de mirarlo.
//
// Su respuesta fue la correcta: *"si no te pregunto no me lo dices"*. Un marcador que depende de
// que yo me acuerde de mirarlo no es un marcador. Este lee Redis cada vez que se abre la página.
//
// ═══ LA TRAMPA QUE YA ME COMIÓ UNA VEZ ═════════════════════════════════════════════════════
//
// Los cuadernos NO comparten esquema. Los del cóndor usan `dia` / `estado` / `pl`; los de credit
// spread, wheel e ideas usan `entryDate` / `status` / `retOnRisk`. Al leerlos con los nombres del
// cóndor me salieron vacíos y los di por muertos — y llegué a ofrecer borrarlos.
//
// Por eso aquí cada familia declara SUS nombres, y si un cuaderno no encaja en ninguna se dice
// en la respuesta en vez de contarlo como cero.

import { NextResponse } from "next/server";
import Redis from "ioredis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Familia = "condor" | "riesgo";

// `filtro` permite leer una SEGUNDA regla del MISMO registro. La mariposa guarda
// `creditoSobreCuna` en cada fila precisamente para esto: la variante con umbral no necesita su
// propio cuaderno, y así las dos no se pueden desincronizar ni ver mercados distintos.
// OJO: `clave` es la clave de REDIS y dos entradas pueden compartirla (la mariposa y su
// variante filtrada leen el mismo registro). `id` es lo que identifica la FILA en pantalla, y
// tiene que ser único: la web lo usa como key de React y para abrir la pega.
// `extrae` y `campoRes` existen porque NO todos los cuadernos guardan igual. El Missile guarda
// un OBJETO `{operaciones:[...]}` en vez de un array, y llama `resultado` a lo que los demás
// llaman `pl`. Sin esto se leería vacío y saldría con cero operaciones — que es exactamente el
// fallo que ya dio por muertos a credit spread, wheel e ideas una vez.
const CUADERNOS: { id: string; clave: string; nombre: string; familia: Familia; unidad: string; pega?: string;
                   filtro?: (f: Record<string, unknown>) => boolean;
                   extrae?: (raw: unknown) => Record<string, unknown>[];
                   campoRes?: string }[] = [
  { id: "la-palanca", clave: "forward:la-palanca", nombre: "LA PALANCA", familia: "condor",
    unidad: "$ por operación · cartera de $60.000 · 60 grandes capitalizaciones",
    // El cuaderno guarda un OBJETO con `abiertas` y `operaciones` (las cerradas), no un array.
    // Se juntan las dos para que la API vea abiertas y cerradas a la vez.
    extrae: (raw) => { const o = raw as { abiertas?: unknown[]; operaciones?: unknown[] } | null;
      if (!o || typeof o !== "object") return [];
      return [...(Array.isArray(o.operaciones) ? o.operaciones : []),
              ...(Array.isArray(o.abiertas) ? o.abiertas : [])] as Record<string, unknown>[]; },
    campoRes: "resultado",
    pega: "Aprobó el examen fuera de muestra el 30 de agosto de 2026: afinada en 24 empresas dio 17,6% al año y en 36 que nunca había visto dio 17,6%, con los criterios escritos antes de mirar los datos. En el histórico da $36.702 al año contra los $19.039 de comprar SPY. PERO el Sharpe apenas supera al índice (0,73 contra 0,70) y la caída es −47% contra −34%: se gana más porque se asume más. Cada posición guarda la HORQUILLA que pagó, porque con horquilla menor del 3% la regla da Sharpe 0,80-0,82 y caída −36% en los dos universos — pero son sólo ~6 operaciones al año y no decide nada todavía. Por eso no se filtra al escribir: se apunta y se lee de las dos maneras dentro de un año. Arrancó el 30 de agosto de 2026." },
  { id: "tsla-missile", clave: "forward:tsla-missile", nombre: "TSLA's Missile", familia: "condor",
    unidad: "$ por operación · cartera de $60.000",
    extrae: (raw) => (raw && typeof raw === "object" && Array.isArray((raw as { operaciones?: unknown }).operaciones)
      ? (raw as { operaciones: Record<string, unknown>[] }).operaciones : []),
    campoRes: "resultado",
    pega: "La tabla mágica está CERRADA como regla general: falló dos exámenes fuera de muestra y su lado dominante (puts dentro del dinero con la acción bajo su media) pierde −5,21% con t=−5,36 sobre 580 entradas independientes. En TSLA no se pudo tumbar (34 señales, +11,34% por operación, t=4,23, seis de seis años positivos), pero 34 señales sobre UN solo nombre es exactamente donde vive la casualidad. Este cuaderno es la única prueba que le queda. Arrancó el 28 de agosto de 2026." },
  { id: "mariposa", clave: "forward:mariposa-15h", nombre: "Mariposa de hierro · 15:00", familia: "condor", unidad: "$ por operación",
    pega: "La mejor candidata medida: $11.405/año contra los $6.722 del cóndor, y con menos susto. PERO no cruza el listón de las muchas puertas (t=3,41 con el listón en 4) y se va apagando (primera mitad $14.872/año, segunda $7.939). Este cuaderno es la única prueba fuera de muestra que le queda. Arrancó el 22 de agosto." },
  { id: "mariposa-umbral", clave: "forward:mariposa-15h", nombre: "Mariposa · con umbral de crédito", familia: "condor", unidad: "$ por operación",
    filtro: (f) => typeof f.creditoSobreCuna === "number" && f.creditoSobreCuna >= 0.30,
    pega: "MISMO cuaderno que la de arriba, leído con una condición añadida: sólo las operaciones donde el crédito llegó al 30% de la cuna de la mañana. En el backtest da el MISMO dinero operando un 28% menos días ($11.140 contra $11.405) y con mejor peor día (−$2.965 contra −$3.247). El umbral se eligió mirando el backtest, así que no es independiente — por eso corre al lado de la regla sin filtro y no dentro de ella." },
  { id: "tres-sies", clave: "forward:tres-sies", nombre: "Cóndor · los tres síes", familia: "condor", unidad: "$ por operación",
    pega: "Es la regla que damos como buena. Arrancó el 21 de agosto y aún no ha operado ni una vez." },
  { id: "gex-condor", clave: "forward:gex-condor", nombre: "Cóndor · filtro de GEX", familia: "condor", unidad: "$ por operación",
    pega: "Usa ±25, que es la geometría con la peor caída de las tres versiones con GEX (−$20.356 en el backtest)." },
  { id: "condor-sinfiltro", clave: "forward:condor-sinfiltro", nombre: "Cóndor · sin filtro", familia: "condor", unidad: "$ por operación",
    pega: "Es el control: opera todos los días. Sirve para saber cuánto aportan los filtros, no para operarlo." },
  { id: "condor-tendencia", clave: "forward:condor-tendencia", nombre: "Cóndor · filtro de tendencia", familia: "condor", unidad: "$ por operación" },
  { id: "ledger", clave: "forward:ledger", nombre: "Credit spread", familia: "riesgo", unidad: "% sobre el riesgo",
    pega: "OJO: el backtest de esta estrategia con precios reales daba −2,53%, y aquí sale positivo. Uno de los dos está mal y falta averiguar cuál." },
  { id: "wheel", clave: "forward:wheel", nombre: "Wheel", familia: "riesgo", unidad: "% sobre el riesgo",
    pega: "195 posiciones abiertas y NINGUNA cerrada. Hay vencimientos ya pasados sin liquidar: el cuaderno abre pero no cierra." },
  { id: "ideas", clave: "forward:ideas", nombre: "Ideas (scorecard de EVA)", familia: "riesgo", unidad: "% sobre el riesgo",
    pega: "El scorecard está medido y cerrado (19.465 operaciones, no separa). Esto es la comprobación en directo de esa conclusión." },
];

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

export async function GET() {
  const url = process.env.REDIS_URL;
  if (!url) return NextResponse.json({ ok: false, motivo: "sin REDIS_URL" });

  const r = new Redis(url, { maxRetriesPerRequest: 2, connectTimeout: 8000 });
  r.on("error", () => { /* que un fallo de red no tumbe la página */ });

  try {
    const salida = [];
    for (const c of CUADERNOS) {
      let filas: Record<string, unknown>[] = [];
      try {
        const crudo = JSON.parse((await r.get(c.clave)) ?? "[]");
        filas = c.extrae ? c.extrae(crudo) : crudo;      // el Missile guarda {operaciones:[...]}
      } catch { /* se dice abajo */ }
      // La variante filtrada ve las MISMAS filas, sólo que se queda con las que cumplen su
      // condición. Las que no la cumplen no son "sin señal" para ella: simplemente no opera.
      if (c.filtro && Array.isArray(filas)) filas = filas.filter((f) => f.estado === "sin señal" || c.filtro!(f));
      if (!Array.isArray(filas) || !filas.length) {
        salida.push({ ...c, filas: 0, vacio: true });
        continue;
      }

      // Cada familia con SUS nombres de campo. Nunca al revés.
      const esCondor = c.familia === "condor";
      const campoDia = esCondor ? "dia" : "entryDate";
      const campoEstado = esCondor ? "estado" : "status";
      const cerrado = esCondor ? "cerrada" : "closed";
      const campoRes = c.campoRes ?? (esCondor ? "pl" : "retOnRisk");

      const dias = [...new Set(filas.map((f) => f[campoDia]).filter(Boolean))].sort() as string[];
      const cerradas = filas.filter((f) => f[campoEstado] === cerrado && typeof f[campoRes] === "number");
      const vals = cerradas.map((f) => f[campoRes] as number);
      const abiertas = filas.filter((f) => f[campoEstado] === (esCondor ? "abierta" : "open")).length;
      const sinSenal = filas.filter((f) => f[campoEstado] === "sin señal").length;

      salida.push({
        ...c,
        filas: filas.length,
        desde: dias[0] ?? null,
        hasta: dias[dias.length - 1] ?? null,
        cerradas: cerradas.length,
        abiertas,
        sinSenal,
        media: vals.length ? media(vals) : null,
        total: esCondor && vals.length ? vals.reduce((a, b) => a + b, 0) : null,
        acierto: vals.length ? vals.filter((x) => x > 0).length / vals.length : null,
        vacio: false,
      });
    }
    await r.quit().catch(() => {});
    return NextResponse.json({ ok: true, generado: new Date().toISOString(), cuadernos: salida });
  } catch (e) {
    await r.quit().catch(() => {});
    return NextResponse.json({ ok: false, motivo: e instanceof Error ? e.message : "error leyendo Redis" });
  }
}
