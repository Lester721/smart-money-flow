// EL MENSAJE DE ERROR TIENE QUE DECIR QUÉ FALLÓ DE VERDAD.
//
// ═══ DE DÓNDE SALE ESTO ═════════════════════════════════════════════════════════════════════
//
// Lester vio en pantalla "Option chain: Error inesperado al consultar Massive" y preguntó:
// "¿de cuándo acá usamos Massive? Ya habíamos hecho estos cambios".
//
// Tenía razón. Massive se tumbó hace días y `DATA_PROVIDER=theta` estaba bien puesto. Lo que
// quedó sin migrar fue el TEXTO del error: la ruta llamaba a ThetaData, fallaba, y el mensaje
// —escrito a fuego en la época de Massive— culpaba al proveedor equivocado.
//
// Eso es peor que no decir nada. Un mensaje que nombra al culpable equivocado manda a buscar
// el fallo donde no está, y encima hace dudar de una migración que sí estaba hecha.
//
// ═══ LO QUE HACE ════════════════════════════════════════════════════════════════════════════
//
// Nombra al proveedor REAL, e intenta explicar la causa más probable en vez de dejar un
// "error inesperado" que no ayuda a nadie. Los dos fallos que de verdad pasan con ThetaData son
// el Terminal apagado y el choque de sesiones, y los dos tienen arreglo conocido.

import { DATA_PROVIDER, usingTheta } from "./flowProvider";

/** El nombre del proveedor que se está usando de verdad, para que el mensaje no mienta. */
export const nombreProveedor = usingTheta ? "ThetaData" : DATA_PROVIDER === "massive" ? "Massive" : DATA_PROVIDER;

/**
 * Convierte un error en un mensaje que sirva para arreglarlo.
 * `conocido` es el mensaje del error propio del proveedor, si lo hay: ése ya viene explicado.
 */
export function mensajeDeError(err: unknown, conocido?: string): string {
  if (conocido) return conocido;

  const crudo = err instanceof Error ? err.message : String(err ?? "");

  if (usingTheta) {
    // Los dos fallos reales de ThetaData, con su arreglo. Los dos han costado horas ya.
    if (/invalid session/i.test(crudo)) {
      return "ThetaData: sesión inválida — hay dos Terminal corriendo a la vez. Reinicia el Terminal (sólo uno).";
    }
    if (/ECONNREFUSED|fetch failed|connect|socket|network/i.test(crudo)) {
      return "ThetaData: el Terminal no responde en :25503. ¿Está encendido?";
    }
    if (/timeout|aborted/i.test(crudo)) {
      return "ThetaData: el Terminal tardó demasiado en responder.";
    }
    if (/no data|not found|472|478/i.test(crudo)) {
      return "ThetaData no tiene datos para eso (¿festivo? ¿fuera de horario? ¿contrato inexistente?).";
    }
  }

  // Si no se reconoce, se dice el proveedor correcto Y el error crudo. Nunca un
  // "error inesperado" a secas: el texto de la excepción suele ser la única pista que hay.
  return `${nombreProveedor}: ${crudo || "error inesperado"}`;
}
