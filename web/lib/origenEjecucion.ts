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
