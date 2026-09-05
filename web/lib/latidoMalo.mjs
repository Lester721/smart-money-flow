// ¿ESTE LATIDO DICE QUE ALGO FUE MAL? — una sola lista, compartida por todos los vigilantes.
//
// POR QUÉ EXISTE. El 2026-09-04 tres vigilantes distintos tenían tres listas distintas escritas a
// mano, y los tres fallaron ABIERTO: el auditor de Railway no miraba el contenido del latido; el
// de la página conocía tres palabras; y el validador de los cuatro cuadernos dijo «✅ los cuatro
// están corriendo bien» EN SU PRIMERA CORRIDA teniendo delante un «PARADO por SIGTERM».
//
// Un vigilante que falla abierto es peor que no tenerlo: sustituye la duda por tranquilidad falsa.
// Por eso la lista vive AQUÍ y hay una prueba que la compara con lo que los cuadernos escriben de
// verdad -- si alguien inventa una palabra nueva, salta.

/** Los comienzos de latido que significan «no se hizo el trabajo». */
export const PALABRAS_MALAS = [
  "NO CORRIÓ",   // with-theta: sin candado, sin Terminal, sin clave, el lanzador falló
  "NO CORRIO",   // por si alguien lo escribe sin tilde
  "ABORTADO",    // with-theta: perdió el candado a mitad
  "COLGADO",     // with-theta: el vigilante mató un cuaderno pasado de tiempo
  "PARADO",      // with-theta: SIGTERM/SIGINT, Railway lo paró a mitad
  "RECHAZADO",   // los cuadernos: les pidieron un día anterior al ya procesado
  "FALLÓ",       // los cuadernos: reventaron con una excepcion (escribirLatidoDirecto)
  "FALLO",
  "ERROR",
];
// ⚠️ "FALLÓ" lo encontro esta misma herramienta el 2026-09-05, y NINGUNO de los tres vigilantes
//    lo conocia: un cuaderno cascando con una excepcion se habria visto VERDE en los tres.

const RE = new RegExp("^(" + PALABRAS_MALAS.join("|") + ")", "i");

/** true si el texto del latido dice que el trabajo NO se hizo. */
export const latidoMalo = (resultado) => RE.test(String(resultado ?? "").trim());

/** LA PRUEBA: lee los ficheros que ESCRIBEN latidos y comprueba que no hay ninguna palabra
 *  que esta lista no conozca. Sin esto la lista se queda vieja en silencio, que es como
 *  empezó todo. Se corre con: node lib/latidoMalo.mjs */
export async function comprobarQueNoFaltaNinguna(dir = "scripts") {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const desconocidas = new Set();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".mjs") || x.endsWith(".ts"))) {
    const txt = readFileSync(join(dir, f), "utf8");
    // SOLO los ficheros que ESCRIBEN latidos. Mirando todos salian PEORES, CABECERA, PLACEBO...
    // y un aviso que grita en falso se acaba ignorando, que es como se pierde un vigilante.
    if (!/avisarNoCorrio|escribirLatido|latir\(/.test(txt)) continue;
    // busca cadenas que empiecen en MAYÚSCULAS seguidas de ":" o " por " dentro de un avisar/latir
    for (const m of txt.matchAll(/["'`]([A-ZÁÉÍÓÚÑ]{4,12})(?::| por )/g)) {
      const w = m[1];
      if (!PALABRAS_MALAS.includes(w)) desconocidas.add(w + "  (en " + f + ")");
    }
  }
  return [...desconocidas];
}

if (process.argv[1]?.endsWith("latidoMalo.mjs")) {
  const faltan = await comprobarQueNoFaltaNinguna();
  if (faltan.length) { console.log("⚠️ palabras en MAYÚSCULAS que la lista no conoce (revisar si son latidos):");
    for (const f of faltan) console.log("   " + f); }
  else console.log("✅ ninguna palabra nueva");
  // autoprueba: la lista tiene que cazar los casos reales que ya nos pasaron
  const casos = ["NO CORRIÓ: la sesión de ThetaData seguía ocupada tras 1800s",
                 "PARADO por SIGTERM a mitad de corrida (Railway)",
                 "RECHAZADO: me pidieron 2026-09-02 estando ya en 2026-09-03",
                 "COLGADO: el comando no terminó en 35 min"];
  const fallan = casos.filter((c) => !latidoMalo(c));
  if (fallan.length) { console.error("⛔ LA LISTA NO CAZA:", fallan); process.exit(2); }
  console.log("✅ autoprueba: caza los 4 casos reales");
  const buenos = ["337 puts en el ledger", "875 operaciones en el ledger", "2026-09-04: 0 abiertas"];
  if (buenos.some(latidoMalo)) { console.error("⛔ da por MALO un latido bueno"); process.exit(2); }
  console.log("✅ autoprueba: no confunde los buenos");
}
