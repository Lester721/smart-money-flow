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
/** Los numeros VIVOS de un cuaderno, para que el texto los saque de la MISMA consulta que la
 *  tabla. Una cifra escrita a mano al lado de una tabla viva es una mentira en espera: la ficha
 *  del Wheel decia "7 cerrados" mientras su propia tabla, dos centimetros mas abajo, decia 19. */
type Vivo = { filas: number; cerradas: number; abiertas: number; dias: number; acierto: number | null;
              media: number | null; ganadoras: number; perdedoras: number; mediaGana: number | null;
              mediaPierde: number | null; ruina: number; colateral: number };
const n = (x: number) => x.toLocaleString("es-ES");
const pc = (x: number | null, d = 2) => (x == null ? "—" : (x >= 0 ? "+" : "") + x.toFixed(d).replace(".", ",") + "%");
const usdN = (x: number) => "$" + Math.round(x).toLocaleString("es-ES");

// APAGADOS el 2026-09-06 por orden de Lester: mariposa, mariposa-umbral, tres-sies y
// condor-sinfiltro. Sus registros quedan en Redis bajo "cerrado:*". Se queda el cóndor de
// GEX, que es la mejor candidata medida (+3,93%, t=2,09, positiva en los 3 años).
const CUADERNOS: { id: string; clave: string; nombre: string; familia: Familia; unidad: string; enContra?: string | ((v: Vivo) => string);
                   filtro?: (f: Record<string, unknown>) => boolean;
                   extrae?: (raw: unknown) => Record<string, unknown>[];
                   campoRes?: string;
                   /** Cómo llama ESTE cuaderno a sus campos. Sin esto se deducen de la familia,
                    *  y ahí está la trampa nº1 de la lista: los combinados guardan
                    *  `estado: "abierta"` mientras la familia "riesgo" hace buscar
                    *  `status: "open"`. La API leía 2 filas y decía "sin operar todavía" —
                    *  vacío, no un error. Se escribe explícito y se acaba la adivinanza. */
                   campoEstado?: string; abiertoEs?: string; cerradoEs?: string; campoDia?: string;
                   /** Dolares de una operacion cerrada. Sin esto, los cuadernos que miden en %
                    *  salian SOLO en porcentaje mientras los que miden en $ salian en dolares:
                    *  las perdidas se leian como dinero real y las ganancias como una abstraccion.
                    *  Lester, 31-ago-2026: "por que demonios no puedes colocar el dinero que
                    *  estamos ganando en las positivas?". */
                   /** Clave del latido si no coincide con el id (la mariposa guarda
                    *  latido:mariposa-15h y el credit spread latido:credit-spread). */
                   latido?: string;
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
  { id: "gex-condor", clave: "forward:gex-condor", nombre: "Cóndor · filtro de GEX", familia: "condor", unidad: "$ por operación",
    enContra: "Usa ±25, que es la geometría con la peor caída de las tres versiones con GEX (−$20.356 en el backtest)." },
  // condor-tendencia RETIRADO el 2026-09-04 por orden de Lester: "cierra el filtro de
  // tendencia como un fracaso". Corria el filtro +-30 + MA20/MA50 que el proyecto ya tenia
  // declarado muerto fuera de muestra, y aparentaba ser candidato en la tabla. Su registro
  // queda en Redis bajo "cerrado:condor-tendencia" y su ficha en /estado como CERRADO,
  // para que nadie lo vuelva a proponer sin leer por que murio.
  { id: "ledger", latido: "credit-spread", clave: "forward:ledger", nombre: "Credit spread", familia: "riesgo", unidad: "% sobre el riesgo",
    usd: (f) => (typeof f.pnlPerSpread === "number" ? f.pnlPerSpread : null),
    enContra: (v) => `RESUELTO el 31 de agosto: no hay contradicción con el backtest. Aquel −2,53% es la celda de 5 días a 1σ medida sobre CUATRO AÑOS con un crash dentro; aquí se mide sobre ${v.dias} días tranquilos, que no traen ni una caída. Ya estaba medido que el edge de 5 días es un artefacto del año calmo y se cae al incluir un crash — el robusto era el de 90 días. Así que este ${pc(v.media)} no desmiente nada. LA FORMA YA SE VE, y es la de vender prima: ${n(v.ganadoras)} ganadoras de ${pc(v.mediaGana)} de media contra ${n(v.perdedoras)} perdedoras de ${pc(v.mediaPierde)}${v.ruina ? `, ${v.ruina} de ellas pérdida total del riesgo (−100%)` : ""}. Hacen falta ${v.mediaGana && v.mediaPierde ? Math.ceil(Math.abs(v.mediaPierde / v.mediaGana)) : "—"} ganadoras para pagar UNA perdedora media. Con esa geometría el resultado lo deciden las perdedoras, no el acierto de ${pc(v.acierto == null ? null : v.acierto * 100, 0)} — y ${v.dias} días no traen suficientes. Y el número tampoco es directamente tuyo: son ${n(v.filas)} spreads en 6 combinaciones a la vez (5@1, 7@1, 5@1.5, 7@1.5, 21@1.5, 90@1), una rejilla para ver qué celda sirve, no una cartera.` },
  // ── LOS DOS COMBINADOS (La Palanca + TSLA's Missile sobre UNA cuenta de $60.000) ──
  // Guardan las cerradas en `operaciones` con `resultado` YA EN DOLARES, y las vivas en
  // `abiertas`. Cada posicion lleva `estrategia` para saber quien la abrio.
  { id: "combi6x4", latido: "combinado-6x4", clave: "forward:combinado-6x4", nombre: "Combinado · 6 huecos × 4%", familia: "riesgo",
    campoEstado: "estado", abiertoEs: "abierta", cerradoEs: "cerrada", campoDia: "dia",
    unidad: "$ por operación · cuenta de $60.000, el ocioso en SPY",
    extrae: (raw) => (raw && typeof raw === "object" && !Array.isArray(raw)
      ? [...((raw as { operaciones?: unknown }).operaciones as Record<string, unknown>[] ?? []),
         ...((raw as { abiertas?: unknown }).abiertas as Record<string, unknown>[] ?? [])] : []),
    campoRes: "resultado",
    usd: (f) => (typeof f.resultado === "number" ? f.resultado : null),
    enContra: (v) => `Compras de $2.400. Es el reparto que Lester dice que se atrevería a llevar. Mide lo que NINGÚN otro cuaderno puede: cuánto se estorban las dos reglas al compartir una sola cuenta — lleva ${v.filas} operaciones y ${v.cerradas} cerradas. El backtest de este reparto da $55.923 al año con caída del 51%, PERO ese número sale de los mismos datos que produjeron la regla, así que no es prueba: es la misma opinión repetida. Esto es lo que la convierte en prueba, o no.` },
  { id: "combi4x6", latido: "combinado-4x6", clave: "forward:combinado-4x6", nombre: "Combinado · 4 huecos × 6%", familia: "riesgo",
    campoEstado: "estado", abiertoEs: "abierta", cerradoEs: "cerrada", campoDia: "dia",
    unidad: "$ por operación · cuenta de $60.000, el ocioso en SPY",
    extrae: (raw) => (raw && typeof raw === "object" && !Array.isArray(raw)
      ? [...((raw as { operaciones?: unknown }).operaciones as Record<string, unknown>[] ?? []),
         ...((raw as { abiertas?: unknown }).abiertas as Record<string, unknown>[] ?? [])] : []),
    campoRes: "resultado",
    usd: (f) => (typeof f.resultado === "number" ? f.resultado : null),
    enContra: (v) => `Compras de $3.600 — el mismo dinero en menos manos. Lester: «4 huecos sería mi próximo paso y quiero ver cómo se siente». Con la mediana de un contrato hoy en $3.620, este es el primer reparto que alcanza a comprar la mitad de las señales; el de 6 se queda corto en muchas. En el backtest gana más ($57.971 contra $55.923) y asusta casi igual (−52% contra −51%), pero concentra: cada posición pesa el 6% de la cuenta.` },
  { id: "wheel", clave: "forward:wheel", nombre: "Wheel", familia: "riesgo", unidad: "% sobre el colateral",
    // El Wheel guarda el resultado en `retOnColl` (sobre el COLATERAL, que es lo correcto para una
    // put vendida), no en `retOnRisk`. Sin esto la web decia "0 cerradas" habiendo 7 con +23,57%
    // de media. Es la MISMA trampa que ya dio por muertos a credit spread, wheel e ideas en agosto:
    // cada familia guarda con SUS nombres y leerlos con los del vecino devuelve vacio, no un error.
    campoRes: "retOnColl",
    usd: (f) => (typeof f.retOnColl === "number" && typeof f.collateral === "number" ? (f.retOnColl / 100) * f.collateral : null),
    enContra: (v) => `Son ${n(v.filas)} puts vendidos de verdad, repartidos en sólo ${v.dias} días: cada día abre hasta 48 a la vez (12 acciones × 2 deltas × 2 plazos). Es una rejilla que prueba todas las celdas en paralelo para ver cuál sirve, no una cartera. El colateral comprometido suma ${usdN(v.colateral)} — unas ${Math.round(v.colateral / 73874)} veces la cuenta real, así que el ${pc(v.media)} de media NO es dinero que se pueda ganar: es el rendimiento de una celda, no de una cartera. Y el acierto de ${pc(v.acierto == null ? null : v.acierto * 100, 0)} no dice nada: vender puts a 0,15 de delta acierta casi siempre por construcción, y de las ${v.cerradas} cerradas NO ha habido ni una asignación. Con 0,15 de delta toca ~1 asignación de cada 7 operaciones, y ganando ${pc(v.media)} cada vez, una sola que cueste más del 1,7% se lleva la racha entera.` },
  { id: "ideas", clave: "forward:ideas", nombre: "Ideas (scorecard de EVA)", familia: "riesgo", unidad: "% sobre el riesgo",
    // Ideas NO guarda dolares: solo retOnRisk, sin el riesgo en dolares al lado. No se puede
    // convertir sin inventarse el tamano, y eso no se hace. Se dice y se queda en %.
    enContra: "El scorecard está medido y cerrado (19.465 operaciones, no separa). Esto es la comprobación en directo de esa conclusión." },
];

/** Describe LAS PATAS de una operacion en palabras: "Venta Put $292,5 / Compra Put $287,5".
 *
 *  Lester, 31-ago-2026: "describe mejor lo que estas comprando las patas". Sin esto la tabla
 *  decia solo el ticker, y un credit spread, un condor y una put vendida se veian identicos.
 *  Cada familia guarda los strikes con SUS nombres — leerlos con los del vecino da vacio. */
const $$ = (x: unknown) => "$" + Number(x).toLocaleString("es-ES", { maximumFractionDigits: 2 });
function patas(f: Record<string, unknown>): string {
  // condor de hierro: cuatro patas
  if (f.callCorta != null && f.putCorta != null)
    return `Venta Call ${$$(f.callCorta)} / Compra Call ${$$(f.callLarga)} · Venta Put ${$$(f.putCorta)} / Compra Put ${$$(f.putLarga)}`;
  // vertical de credito: dos patas del mismo lado
  if (f.shortK != null && f.longK != null) {
    const t = String(f.type ?? "").toLowerCase().startsWith("c") ? "Call" : "Put";
    return `Venta ${t} ${$$(f.shortK)} / Compra ${t} ${$$(f.longK)}`; }
  // put vendida suelta (Wheel)
  if (f.strike != null && f.collateral != null) return `Venta Put ${$$(f.strike)}`;
  // opcion comprada suelta (Ideas, La Palanca, Missile)
  if (f.optStrike != null) return `Compra ${String(f.optType ?? "").toLowerCase().startsWith("c") ? "Call" : "Put"} ${$$(f.optStrike)}`;
  if (f.K != null) return `Compra Call ${$$(f.K)}`;
  if (f.strike != null) return `Venta Put ${$$(f.strike)}`;
  return "—";
}
/** Dias entre la compra y el vencimiento. Se calcula, no se lee: `dte` es el OBJETIVO, no lo real. */
function diasHasta(entrada: unknown, vence: unknown): number | null {
  const a = Date.parse(String(entrada ?? "")), b = Date.parse(String(vence ?? "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"));
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : null;
}

/** Los días llegan en DOS formatos: los cuadernos viejos escriben "2026-08-28" y los combinados
 *  "20260828". El segundo revienta cualquier `new Date(...)` y en pantalla salía "Invalid Date"
 *  y un año "2022" sacado de la nada. Se normaliza AQUÍ, en un solo sitio, en vez de esperar que
 *  cada cuaderno escriba igual — porque ya sabemos que no lo hacen. Es la misma familia de fallo
 *  que los nombres de campo: cada uno escribe a su manera y el lector tiene que absorberlo. */
const isoDia = (d: unknown): string => {
  const t = String(d ?? "");
  return /^\d{8}$/.test(t) ? t.slice(0, 4) + "-" + t.slice(4, 6) + "-" + t.slice(6, 8) : t;
};

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

export async function GET() {
  const url = process.env.REDIS_URL;
  if (!url) return NextResponse.json({ ok: false, motivo: "sin REDIS_URL" });

  const r = new Redis(url, { maxRetriesPerRequest: 2, connectTimeout: 8000 });
  r.on("error", () => { /* que un fallo de red no tumbe la página */ });

  try {
    const salida = [];
    /** CUANDO corrio por ultima vez y QUE dijo. Se le pone a TODAS las filas, no solo a las
     *  vacias: un cuaderno sin operaciones cerradas tampoco sabia decir si seguia vivo -- la
     *  mariposa con umbral salia como "sin senales de vida" llevando dias corriendo. */
    const pulso = async (c: { id: string; latido?: string }) => {
      const lat = await r.get("latido:" + (c.latido ?? c.id));
      if (!lat) return { ultima: null as string | null, dijo: null as string | null };
      try { const j = JSON.parse(lat);
            return { ultima: (j.cuandoET ?? j.cuandoISO ?? null) as string | null,
                     dijo: (j.resultado ?? null) as string | null }; }
      catch { return { ultima: null as string | null, dijo: null as string | null }; }
    };

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
        // SIN OPERACIONES NO ES SIN CORRER. Lester, 2026-09-04: "por que en el web no se ve el
        // estatus del forward test de la palanca y el TSLA missile?". Porque llevan dias
        // corriendo TODAS las noches y no han abierto nada -- La Palanca ve senales y las
        // descarta, el Missile no ha disparado -- asi que salian como fila vacia y gris, que se
        // lee como "esto no existe". Un cuaderno sano que dice "hoy no" es una RESPUESTA, no un
        // hueco. Se le adjunta su latido para que la fila diga cuando corrio y que dijo.
        salida.push({ ...c, filas: 0, vacio: true, ...(await pulso(c)) });
        continue;
      }

      // Cada familia con SUS nombres de campo. Nunca al revés.
      const esCondor = c.familia === "condor";
      const campoDia = c.campoDia ?? (esCondor ? "dia" : "entryDate");
      const campoEstado = c.campoEstado ?? (esCondor ? "estado" : "status");
      const cerrado = c.cerradoEs ?? (esCondor ? "cerrada" : "closed");
      const abierto = c.abiertoEs ?? (esCondor ? "abierta" : "open");
      const campoRes = c.campoRes ?? (esCondor ? "pl" : "retOnRisk");

      const dias = [...new Set(filas.map((f) => isoDia(f[campoDia])).filter(Boolean))].sort() as string[];
      const cerradas = filas.filter((f) => f[campoEstado] === cerrado && typeof f[campoRes] === "number");
      const vals = cerradas.map((f) => f[campoRes] as number);
      const abiertas = filas.filter((f) => f[campoEstado] === abierto).length;
      const sinSenal = filas.filter((f) => f[campoEstado] === "sin señal").length;
      const gana = vals.filter((x) => x > 0), pierde = vals.filter((x) => x <= 0);
      const prom = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
      const vivo: Vivo = {
        filas: filas.length, cerradas: cerradas.length, abiertas, dias: dias.length,
        acierto: vals.length ? gana.length / vals.length : null,
        media: prom(vals), ganadoras: gana.length, perdedoras: pierde.length,
        mediaGana: prom(gana), mediaPierde: prom(pierde),
        ruina: pierde.filter((x) => x <= -99).length,
        colateral: filas.reduce((a, f) => a + (typeof f.collateral === "number" ? f.collateral : 0), 0),
      };

      salida.push({
        ...c,
        // El texto se RESUELVE con los numeros de ESTA consulta, la misma que llena la tabla.
        // Una cifra escrita a mano al lado de una tabla viva es una mentira en espera: esta
        // ficha decia "7 cerrados" mientras su propia tabla, dos centimetros abajo, decia 19.
        enContra: typeof c.enContra === "function" ? c.enContra(vivo) : c.enContra,
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
          accion: String(f.ticker ?? f.tk ?? (c.familia === "condor" && !f.ticker ? "SPX" : f.symbol) ?? "—"),
          opcion: patas(f),
          spot: typeof f.spot === "number" ? f.spot : null,
          abrio: isoDia(f.entryDate ?? f.dia ?? f.dC ?? ""),
          vence: isoDia(f.expiryDate ?? f.exp ?? f.optExpiry ?? f.dia ?? ""),
          dias: diasHasta(f.entryDate ?? f.dia ?? f.dC, f.expiryDate ?? f.exp ?? f.optExpiry ?? f.dia),
          que: String(f.ticker ?? f.tk ?? f.symbol ?? c.nombre),
          cuando: isoDia(f.exitDate ?? f.diaSalida ?? f[campoDia] ?? ""),
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
        ...(await pulso(c)),
      });
    }
    // ═══ EL VIGILANTE, EN LA MISMA VISITA ══════════════════════════════════════════════════
    //
    // Idea de Lester, 2026-09-04: "¿por qué el vigilante no puede correr automáticamente cada
    // vez que sube la página?". Puede, y es mejor que un servicio aparte: las DOS comprobaciones
    // que habrían cazado el apagón de 43 horas -- lo que DICE el latido y quién tiene el candado
    // -- sólo necesitan Redis, con el que esta ruta ya está hablando. Cero conexiones de más.
    //
    // Lo que se comprueba, y por qué cada una:
    //   1. lo que DICE el latido. Un servicio que dispara puntual y escribe "NO CORRÍ" todas las
    //      noches se ve igual de fresco que uno sano: eso tapó dos días enteros sin datos.
    //   2. la EDAD del latido. Un servicio muerto deja de escribir, y el silencio no salta solo.
    //   3. el CANDADO de ThetaData. Si su dueño lleva horas sin latir, está colgado y está
    //      bloqueando a todos los demás. Esto solo habría cazado el apagón en un segundo.
    const salud = await (async () => {
      const problemas: { servicio: string; que: string; detalle: string }[] = [];
      // EL FIN DE SEMANA NO ES UN FALLO. Con un techo fijo de 26 h este aviso daba por muertos
      // los DOCE servicios cada domingo: la mayoria sólo corre de lunes a viernes, así que su
      // último latido es del viernes y son 40 h de silencio PERFECTAMENTE NORMALES. Un vigilante
      // que grita en falso todos los fines de semana se acaba ignorando, y entonces no avisa
      // el día que pasa algo de verdad. Cazado el 2026-09-06, en domingo.
      const diaSemana = new Date().getUTCDay();               // 0 domingo · 6 sábado
      const techoSilencio = (diaSemana === 0 || diaSemana === 6 || diaSemana === 1) ? 80 : 26;
      const { latidoMalo } = await import("@/lib/latidoMalo.mjs");
      const latidos: Record<string, { cuandoISO?: string; resultado?: string; horas: number }> = {};

      const claves = await r.keys("latido:*");
      for (const k of claves) {
        const crudo = await r.get(k);
        if (!crudo) continue;
        let j: { cuandoISO?: string; resultado?: string };
        try { j = JSON.parse(crudo); } catch { continue; }
        const nombre = k.replace("latido:", "");
        const horas = j.cuandoISO ? (Date.now() - Date.parse(j.cuandoISO)) / 36e5 : Infinity;
        latidos[nombre] = { ...j, horas };
        if (latidoMalo(j.resultado))
          problemas.push({ servicio: nombre, que: "no corrió", detalle: String(j.resultado ?? "").slice(0, 120) });
        else if (horas > techoSilencio)
          problemas.push({ servicio: nombre, que: "callado", detalle: `sin latir desde hace ${horas.toFixed(0)} h` });
      }
      if (!claves.length) problemas.push({ servicio: "todos", que: "sin latidos", detalle: "no hay ni un latido en Redis" });

      // El candado: su dueño se identifica como "<servicio de Railway>:<pid>", que NO es la clave
      // del latido. Se empareja por prefijo, y si no se reconoce se dice en vez de callar.
      // NO se mide por "cuanto hace que su dueno latio": eso da FALSO POSITIVO justo cuando un
      // servicio esta haciendo su primera corrida buena en dias (su latido es viejo porque aun
      // no ha terminado). Se mide por CUANTO LLEVA COGIDO, que es la pregunta de verdad. El
      // vigilante del lanzador mata a los 35 min, asi que pasar de 45 significa que ha fallado
      // hasta el vigilante. Si no hay hora de cogida (imagen vieja) no se inventa: no se avisa.
      const dueño = await r.get("lock:theta");
      let candado: { dueño: string; ttl: number; minutos: number | null } | null = null;
      if (dueño) {
        const ttl = await r.ttl("lock:theta");
        const desde = await r.get("lock:theta:desde");
        const min = desde ? (Date.now() - Date.parse(desde)) / 60000 : null;
        candado = { dueño, ttl, minutos: min };
        if (min != null && min > 45)
          problemas.push({ servicio: dueño, que: "candado colgado",
            detalle: `lleva ${min.toFixed(0)} min con la sesión de ThetaData: bloquea a los demás` });
      }
      return { ok: problemas.length === 0, problemas, candado };
    })();

    await r.quit().catch(() => {});
    return NextResponse.json({ ok: true, generado: new Date().toISOString(), cuadernos: salida, salud });
  } catch (e) {
    await r.quit().catch(() => {});
    return NextResponse.json({ ok: false, motivo: e instanceof Error ? e.message : "error leyendo Redis" });
  }
}
