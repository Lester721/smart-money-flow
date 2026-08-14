// Cliente compartido de /api/gex — una sola petición para todos los paneles.
//
// POR QUÉ: calcular el GEX contra el Terminal cuesta entre 6 y 20 segundos. La vista de GEX y el
// panel de decisión necesitan EXACTAMENTE los mismos datos; si cada uno pidiera lo suyo, serían
// dos esperas largas y —peor— dos fotos de instantes distintos. Que dos paneles de la misma
// pantalla enseñen precios de momentos diferentes es la clase de incoherencia que hace dudar de
// todo lo demás.
//
// Aquí se comparte la MISMA promesa: el segundo que pida se engancha a la petición en vuelo.

export interface Barra { strike: number; call: number; put: number; oiCall: number; oiPut: number }
export interface Señal {
  operar: boolean; motivo?: string; credito?: number; riesgoMax?: number;
  callCorta?: number; callLarga?: number; putCorta?: number; putLarga?: number;
  deltaCorta?: number; rangoGanador?: [number, number];
  precios?: { callCorta: number; callLarga: number; putCorta: number; putLarga: number };
}
export interface DatosGex {
  ok: boolean; motivo?: string; dia: string; hora?: string; ahora: string; ms?: number;
  spx?: number; minutosAlCierre?: number;
  gexNeto?: number; gexCalls?: number; gexPuts?: number; oiTotal?: number;
  nominal?: number; volumen?: number; primaDia?: number;
  muroCall?: number | null; muroPut?: number | null; giro?: number | null;
  barras?: Barra[];
  historia?: { n: number; percentil: number | null; aciertoConSeñal: number; mediaConSeñal: number } | null;
  aguante?: { call: number | null; put: number | null; distCall: number | null; distPut: number | null; n: number } | null;
  señal?: Señal;
}

let enVuelo: Promise<DatosGex> | null = null;
let ultima: { t: number; d: DatosGex } | null = null;
const TTL_MS = 45_000;

/** Pide el GEX. Si ya hay una petición en vuelo se engancha a ella; si hay una respuesta reciente
 *  la reutiliza. `forzar` salta la caché (el botón de "actualizar"). */
export function pedirGex(forzar = false): Promise<DatosGex> {
  if (!forzar) {
    if (enVuelo) return enVuelo;
    if (ultima && Date.now() - ultima.t < TTL_MS) return Promise.resolve(ultima.d);
  }
  enVuelo = fetch("/api/gex", { cache: "no-store" })
    .then((r) => r.json())
    .then((d: DatosGex) => { ultima = { t: Date.now(), d }; return d; })
    .finally(() => { enVuelo = null; });
  return enVuelo;
}

// ── LO QUE CONVIERTE EL DATO EN DECISIÓN ─────────────────────────────────────
//
// Estas dos funciones existen porque el 2026-08-14, explicándole a Lester cómo se usa el GEX,
// hubo que cruzar TRES sitios distintos de la pantalla para llegar a una conclusión que cabía en
// una línea: "el muro está pegado al precio, así que aguanta el 58%, y te pagan $240 por
// arriesgar $4.760". Su frase fue: *"no me falta información, me falta que llegue ordenada en el
// momento de decidir"*.

/** Distancia del muro al precio, en % del precio. Es lo que decide si el muro es fiable. */
export function distanciaPct(muro: number | null | undefined, spx: number | null | undefined): number | null {
  if (muro == null || spx == null || !(spx > 0)) return null;
  return (Math.abs(muro - spx) / spx) * 100;
}

/**
 * Cuántas veces aguanta un muro a esa distancia. Medido sobre 652 días (2024-2026) de SPX.
 *
 * **Lo que decide NO es lo alto que sea el muro, es lo lejos que esté.** Un muro enorme pegado al
 * precio aguanta poco más que una moneda; uno moderado a un 0,8% aguanta casi siempre.
 */
export function fiabilidadMuro(distPct: number | null): { pct: number; texto: string; nivel: "malo" | "medio" | "bueno" } | null {
  if (distPct == null) return null;
  if (distPct < 0.3) return { pct: 61, texto: "pegado al precio — poco más que una moneda", nivel: "malo" };
  if (distPct < 0.6) return { pct: 78, texto: "distancia intermedia", nivel: "medio" };
  return { pct: 92, texto: "a distancia cómoda — es cuando el muro de verdad frena", nivel: "bueno" };
}
