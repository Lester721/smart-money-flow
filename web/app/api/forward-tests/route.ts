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
// tiene que ser único: la web lo usa como key de React y para abrir lo que hay en contra.
// `extrae` y `campoRes` existen porque NO todos los cuadernos guardan igual. El Missile guarda
// un OBJETO `{operaciones:[...]}` en vez de un array, y llama `resultado` a lo que los demás
// llaman `pl`. Sin esto se leería vacío y saldría con cero operaciones — que es exactamente el
// fallo que ya dio por muertos a credit spread, wheel e ideas una vez.
const CUADERNOS: { id: string; clave: string; nombre: string; familia: Familia; unidad: string; enContra?: string;
                   filtro?: (f: Record<string, unknown>) => boolean;
                   extrae?: (raw: unknown) => Record<string, unknown>[];
                   campoRes?: string;
                   /** Dolares de una operacion cerrada. Sin esto, los cuadernos que miden en %
                    *  salian SOLO en porcentaje mientras los que miden en $ salian en dolares:
                    *  las perdidas se leian como dinero real y las ganancias como una abstraccion.
                    *  Lester, 31-ago-2026: "por que demonios no puedes colocar el dinero que
                    *  estamos ganando en las positivas?". */
                   usd?: (f: Record<string, unknown>) => number | null }[] = [
  { id: "la-palanca", clave: "forward:la-palanca", nombre: "LA PALANCA", familia: "condor",
    unidad: "$ por operación · cartera de $60.000 · 60 grandes capitalizaciones",
    // El cuaderno guarda un OBJETO con `abiertas` y `operaciones` (las cerradas), no un array.
    // Se juntan las dos para que la API vea abiertas y cerradas a la vez.
    extrae: (raw) => { const o = raw as { abiertas?: unknown[]; operaciones?: unknown[] } | null;
      if (!o || typeof o !== "object") return [];
      return [...(Array.isArray(o.operaciones) ? o.operaciones : []),
              ...(Array.isArray(o.abiertas) ? o.abiertas : [])] as Record<string, unknown>[]; },
    campoRes: "resultado",
    enContra: "Aprobó el examen fuera de muestra el 30 de agosto de 2026: afinada en 24 empresas dio 17,6% al año y en 36 que nunca había visto dio 17,6%, con los criterios escritos antes de mirar los datos. En el histórico da $36.702 al año contra los $19.039 de comprar SPY. PERO el Sharpe apenas supera al índice (0,73 contra 0,70) y la caída es −47% contra −34%: se gana más porque se asume más. Cada posición guarda la HORQUILLA que pagó, porque con horquilla menor del 3% la regla da Sharpe 0,80-0,82 y caída −36% en los dos universos — pero son sólo ~6 operaciones al año y no decide nada todavía. Por eso no se filtra al escribir: se apunta y se lee de las dos maneras dentro de un año. Arrancó el 30 de agosto de 2026." },
  { id: "tsla-missile", clave: "forward:tsla-missile", nombre: "TSLA's Missile", familia: "condor",
    unidad: "$ por operación · cartera de $60.000",
    extrae: (raw) => (raw && typeof raw === "object" && Array.isArray((raw as { operaciones?: unknown }).operaciones)
      ? (raw as { operaciones: Record<string, unknown>[] }).operaciones : []),
    campoRes: "resultado",
    enContra: "La tabla mágica está CERRADA como regla general: falló dos exámenes fuera de muestra y su lado dominante (puts dentro del dinero con la acción bajo su media) pierde −5,21% con t=−5,36 sobre 580 entradas independientes. En TSLA no se pudo tumbar (34 señales, +11,34% por operación, t=4,23, seis de seis años positivos), pero 34 señales sobre UN solo nombre es exactamente donde vive la casualidad. Este cuaderno es la única prueba que le queda. Arrancó el 28 de agosto de 2026." },
  { id: "mariposa", clave: "forward:mariposa-15h", nombre: "Mariposa de hierro · 15:00", familia: "condor", unidad: "$ por operación",
    enContra: "La mejor candidata medida: $11.405/año contra los $6.722 del cóndor, y con menos susto. PERO no cruza el listón de las muchas puertas (t=3,41 con el listón en 4) y se va apagando (primera mitad $14.872/año, segunda $7.939). Este cuaderno es la única prueba fuera de muestra que le queda. Arrancó el 22 de agosto." },
  { id: "mariposa-umbral", clave: "forward:mariposa-15h", nombre: "Mariposa · con umbral de crédito", familia: "condor", unidad: "$ por operación",
    filtro: (f) => typeof f.creditoSobreCuna === "number" && f.creditoSobreCuna >= 0.30,
    enContra: "MISMO cuaderno que la de arriba, leído con una condición añadida: sólo las operaciones donde el crédito llegó al 30% de la cuna de la mañana. En el backtest da el MISMO dinero operando un 28% menos días ($11.140 contra $11.405) y con mejor peor día (−$2.965 contra −$3.247). El umbral se eligió mirando el backtest, así que no es independiente — por eso corre al lado de la regla sin filtro y no dentro de ella." },
  { id: "tres-sies", clave: "forward:tres-sies", nombre: "Cóndor · los tres síes", familia: "condor", unidad: "$ por operación",
    enContra: "Es la regla que damos como buena, y en directo va PERDIENDO: −$530 por operación. Con 2 operaciones cerradas eso no decide nada — hacen falta unas 30 — pero conviene mirarlo junto a los otros tres cóndores, que también van los cuatro en rojo, incluido el que no lleva filtro. Arrancó el 21 de agosto." },
  { id: "gex-condor", clave: "forward:gex-condor", nombre: "Cóndor · filtro de GEX", familia: "condor", unidad: "$ por operación",
    enContra: "Usa ±25, que es la geometría con la peor caída de las tres versiones con GEX (−$20.356 en el backtest)." },
  { id: "condor-sinfiltro", clave: "forward:condor-sinfiltro", nombre: "Cóndor · sin filtro", familia: "condor", unidad: "$ por operación",
    enContra: "Es el control: opera todos los días. Sirve para saber cuánto aportan los filtros, no para operarlo." },
  { id: "condor-tendencia", clave: "forward:condor-tendencia", nombre: "Cóndor · filtro de tendencia", familia: "condor", unidad: "$ por operación" },
  { id: "ledger", clave: "forward:ledger", nombre: "Credit spread", familia: "riesgo", unidad: "% sobre el riesgo",
    usd: (f) => (typeof f.pnlPerSpread === "number" ? f.pnlPerSpread : null),
    enContra: "RESUELTO el 31 de agosto: no hay contradicción con el backtest. Aquel −2,53% es la celda de 5 días a 1σ medida sobre CUATRO AÑOS con un crash dentro; aquí esa misma celda da +1,07% sobre 78 operaciones de DIECISIETE DÍAS tranquilos. Ya estaba medido que el edge de 5 días es un artefacto del año calmo y se cae al incluir una caída — el robusto era el de 90 días. Así que este +1,25% no desmiente nada: confirma que vender prima en un mes sin sustos acierta el 95% de las veces. LA FORMA YA SE VE, y es la de vender prima: 240 ganadoras de +3,84% de media contra 13 perdedoras de −46,7%, TRES de ellas pérdida total del riesgo (−100%). Hacen falta 13 ganadoras para pagar UNA perdedora media. Con esa geometría, el resultado lo deciden las perdedoras, no el 95% de acierto — y 17 días no traen suficientes. Y el número tampoco es directamente tuyo: son 669 spreads en 6 combinaciones distintas a la vez (5@1, 7@1, 5@1.5, 7@1.5, 21@1.5, 90@1), una rejilla para ver qué celda sirve, no una cartera." },
  { id: "wheel", clave: "forward:wheel", nombre: "Wheel", familia: "riesgo", unidad: "% sobre el colateral",
    // El Wheel guarda el resultado en `retOnColl` (sobre el COLATERAL, que es lo correcto para una
    // put vendida), no en `retOnRisk`. Sin esto la web decia "0 cerradas" habiendo 7 con +23,57%
    // de media. Es la MISMA trampa que ya dio por muertos a credit spread, wheel e ideas en agosto:
    // cada familia guarda con SUS nombres y leerlos con los del vecino devuelve vacio, no un error.
    campoRes: "retOnColl",
    usd: (f) => (typeof f.retOnColl === "number" && typeof f.collateral === "number" ? (f.retOnColl / 100) * f.collateral : null),
    enContra: "Son 274 puts vendidos de verdad, repartidos en sólo 19 días: cada día abre hasta 48 a la vez (12 acciones × 2 deltas × 2 plazos). Es una rejilla que prueba todas las celdas en paralelo para ver cuál sirve, no una cartera. El colateral comprometido suma $10.609.650 — unas 140 veces la cuenta real, así que el +0,24% de media NO es dinero que se pueda ganar: es el rendimiento de una celda, no de una cartera. Y el 100% de acierto no dice nada: vender puts a 0,15 de delta acierta casi siempre por construcción, y todavía NO ha habido ni una asignación. Con 0,15 de delta toca ~1 asignación de cada 7 operaciones, y ganando 0,24% cada vez, una sola que cueste más del 1,7% se lleva la racha entera. Pendiente: 12 puts vencieron el 28 de agosto y siguen sin liquidar (las otras 255 abiertas vencen entre hoy y el 2 de octubre, y están bien)." },
  { id: "ideas", clave: "forward:ideas", nombre: "Ideas (scorecard de EVA)", familia: "riesgo", unidad: "% sobre el riesgo",
    // Ideas NO guarda dolares: solo retOnRisk, sin el riesgo en dolares al lado. No se puede
    // convertir sin inventarse el tamano, y eso no se hace. Se dice y se queda en %.
    enContra: "El scorecard está medido y cerrado (19.465 operaciones, no separa). Esto es la comprobación en directo de esa conclusión." },
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
        // LA MUESTRA DE VERDAD: las ultimas operaciones cerradas, una a una, con su resultado.
        // Lester lo pidio cuatro veces y yo le daba un RESUMEN. "La muestra de lo que han
        // tradeado con su respectivo resultado" son las operaciones, no un promedio.
        ultimas: cerradas.slice(-10).reverse().map((f) => ({
          que: String(f.ticker ?? f.tk ?? f.symbol ?? c.nombre),
          cuando: String(f.exitDate ?? f.diaSalida ?? f[campoDia] ?? ""),
          usd: c.usd ? c.usd(f) : (typeof f[campoRes] === "number" && c.unidad.startsWith("$") ? (f[campoRes] as number) : null),
          pct: typeof f[campoRes] === "number" && !c.unidad.startsWith("$") ? (f[campoRes] as number) : null,
          nota: String(f.closedReason ?? f.exitReason ?? f.motivo ?? ""),
        })),
        // en DOLARES, para los que miden en % — asi las ganancias se leen igual que las perdidas
        totalUsd: c.usd ? (() => { const v = cerradas.map(c.usd!).filter((x): x is number => typeof x === "number");
          return v.length ? v.reduce((a, b) => a + b, 0) : null; })() : null,
        mediaUsd: c.usd ? (() => { const v = cerradas.map(c.usd!).filter((x): x is number => typeof x === "number");
          return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; })() : null,
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
