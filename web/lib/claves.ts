// LAS CLAVES DEL NAVEGADOR — renombradas SIN perder lo guardado.
//
// ═══ POR QUÉ HACE FALTA ESTO ════════════════════════════════════════════════════════════════
//
// Al quitar el nombre viejo del proyecto aparecieron ocho claves de `localStorage` con el
// prefijo `tito.`. Entre ellas están el **watchlist**, el **saldo de la cuenta** y la
// **tolerancia al riesgo**.
//
// Renombrarlas a secas no rompe ningún test ni ningún tipo: la página compila, arranca, y el
// usuario simplemente se encuentra su watchlist vacío y su perfil de riesgo en blanco, sin un
// solo mensaje de error. Es exactamente la clase de avería que este proyecto ya ha pagado varias
// veces — la que no grita.
//
// ═══ CÓMO SE MIGRA ══════════════════════════════════════════════════════════════════════════
//
// Al leer: si la clave nueva está vacía y la vieja tiene algo, se copia el valor a la nueva y se
// devuelve. Una sola vez, sin que el usuario note nada.
//
// La vieja NO se borra. Si algo sale mal, el dato sigue ahí; borrarlo sería apostar a que la
// migración es perfecta, y no hay razón para apostar cuando guardar cuesta cero.

const VIEJO = "tito.";
const NUEVO = "eva.";

/** El nombre nuevo de una clave. Se escribe `eva.watchlist`, nunca el prefijo a mano. */
export const clave = (nombre: string) => NUEVO + nombre;

/**
 * Lee una clave, trayéndose el valor del nombre viejo la primera vez.
 * Devuelve null si no hay nada en ninguno de los dos.
 */
export function leerClave(nombre: string): string | null {
  if (typeof window === "undefined") return null;
  const nueva = NUEVO + nombre;
  try {
    const actual = window.localStorage.getItem(nueva);
    if (actual !== null) return actual;

    const antigua = window.localStorage.getItem(VIEJO + nombre);
    if (antigua === null) return null;

    // Se copia al nombre nuevo y se deja la vieja donde estaba, por si acaso.
    window.localStorage.setItem(nueva, antigua);
    return antigua;
  } catch {
    return null;   // navegador con el almacenamiento bloqueado: no puede tumbar la página
  }
}

/** Escribe una clave con el nombre nuevo. */
export function escribirClave(nombre: string, valor: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NUEVO + nombre, valor);
  } catch { /* almacenamiento lleno o bloqueado: no es motivo para romper la página */ }
}

/** Borra una clave, en los dos nombres. */
export function borrarClave(nombre: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(NUEVO + nombre);
    window.localStorage.removeItem(VIEJO + nombre);
  } catch { /* igual que arriba */ }
}
