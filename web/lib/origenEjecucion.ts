// ¿Quién escribió esta operación: Railway o el portátil de Lester?
//
// POR QUÉ EXISTE. Los forward-tests de Railway y las pruebas que corro en local escriben en la
// MISMA clave de Redis. El 2026-08-13, mirando los ledgers, no pude decir cuáles de las 43
// operaciones de la Wheel las había escrito Railway y cuáles yo esa misma tarde. Y un
// forward-test que no distingue quién escribió **no se puede auditar**: no hay forma de saber si
// el servicio funciona o si lo que ves es tu propia prueba de hace un rato.
//
// Peor todavía: si Railway lleva días sin escribir y yo corro el script en local, el ledger
// parece sano. El fallo silencioso queda tapado por mi propia mano.
//
// Railway inyecta sus propias variables (RAILWAY_SERVICE_NAME, RAILWAY_ENVIRONMENT_NAME…) en
// todos sus contenedores; en el portátil no existe ninguna. Eso basta para distinguirlos sin
// tener que configurar nada — una variable más que poner a mano es una variable más que puede
// faltar, y ya sabemos cómo acaba eso.

export type Origen = "railway" | "local";

export function origenEjecucion(): Origen {
  return Object.keys(process.env).some((k) => k.startsWith("RAILWAY_")) ? "railway" : "local";
}

/** Etiqueta completa: origen + servicio, para el caso de que Railway corra varios. */
export function etiquetaEjecucion(): string {
  const o = origenEjecucion();
  return o === "railway" ? `railway:${process.env.RAILWAY_SERVICE_NAME || "?"}` : "local";
}

// ── EL LATIDO ────────────────────────────────────────────────────────────────
//
// POR QUÉ EXISTE, y es una lección cara. El campo `origen` sólo aparece cuando un servicio
// ESCRIBE UNA OPERACIÓN NUEVA. Si el servicio corre bien pero ese día no hay señal —o el dedup
// no añade nada, que es lo normal— no escribe nada, y desde fuera no hay forma de distinguir
// "corrió y no tenía nada que hacer" de "lleva tres días muerto".
//
// El 2026-08-15 eso costó una mañana entera: la Wheel corría perfectamente, pero como no añadía
// operaciones nuevas no se podía comprobar si el contenedor tenía el código actual. La única
// respuesta posible era "espera a las 18:00 a ver".
//
// Con el latido, CADA corrida deja constancia aunque no haga nada: cuándo, qué servicio, y —lo
// que de verdad importa— QUÉ COMMIT está corriendo. Railway inyecta RAILWAY_GIT_COMMIT_SHA en
// el contenedor, así que comparándolo con `main` se sabe al instante si un servicio quedó en un
// despliegue viejo, sin esperar a nada.

export interface Latido {
  servicio: string;
  origen: Origen;
  commit: string;          // el SHA que Railway está corriendo de verdad
  cuandoISO: string;
  cuandoET: string;
  resultado: string;       // resumen de una línea: qué hizo esta corrida
}

/**
 * Qué versión corre este contenedor. Se prueban varias variables porque NO está comprobado cuál
 * inyecta Railway en un servicio de tipo cron — y si diera por hecha una que no existe, el
 * comprobador avisaría todos los días de un problema inventado, que es peor que no avisar.
 * Si ninguna está, devuelve "desconocido" y el comprobador lo dice como lo que es: no se sabe.
 */
export function versionEjecucion(): string {
  return (
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.RAILWAY_DEPLOYMENT_ID ||
    process.env.GIT_COMMIT_SHA ||
    process.env.SOURCE_COMMIT ||
    "desconocido"
  );
}

export function construirLatido(servicio: string, resultado: string): Latido {
  const ahora = new Date();
  return {
    servicio,
    origen: origenEjecucion(),
    commit: versionEjecucion(),
    cuandoISO: ahora.toISOString(),
    cuandoET: ahora.toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16),
    resultado,
  };
}

/**
 * Escribe el latido. `redis` es el cliente ya abierto por el script (ioredis o compatible).
 * NUNCA lanza: un fallo escribiendo el latido no puede tumbar el forward-test, que es lo que
 * de verdad importa. Si falla, lo dice por consola y sigue.
 */
export async function escribirLatido(
  redis: { set: (k: string, v: string) => Promise<unknown> } | null,
  servicio: string,
  resultado: string,
): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(`latido:${servicio}`, JSON.stringify(construirLatido(servicio, resultado)));
  } catch (e) {
    console.error(`  (no se pudo escribir el latido de ${servicio}: ${(e as Error).message})`);
  }
}

/**
 * Como el anterior, pero ABRE SU PROPIA CONEXIÓN. Para el caso que de verdad importa: el script
 * revienta ANTES de haber creado el cliente de Redis (falta una variable, no arranca el Terminal,
 * el build está roto…). Ahí `escribirLatido` recibiría null y se callaría — y un servicio que
 * peta al arrancar volvería a verse igual que uno que no corrió, que es justo el agujero que se
 * cerró el 2026-08-15.
 *
 * Cierra la conexión siempre; si no hay REDIS_URL no hace nada. Nunca lanza.
 */
export async function escribirLatidoDirecto(servicio: string, resultado: string): Promise<void> {
  if (!process.env.REDIS_URL) return;
  type Cliente = { set: (k: string, v: string) => Promise<unknown>; quit: () => Promise<unknown> };
  let cli: Cliente | null = null;
  try {
    const { default: Redis } = await import("ioredis");
    cli = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 }) as unknown as Cliente;
    await cli.set(`latido:${servicio}`, JSON.stringify(construirLatido(servicio, resultado)));
  } catch (e) {
    console.error(`  (no se pudo escribir el latido de ${servicio}: ${(e as Error).message})`);
  } finally {
    try { await cli?.quit(); } catch { /* daba igual, ya nos vamos */ }
  }
}
