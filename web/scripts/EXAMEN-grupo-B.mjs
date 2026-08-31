// ══════════════════════════════════════════════════════════════════════════════════════════
// EXAMEN DEL GRUPO B — escrito el 2026-08-30, ANTES de construir un solo camino del grupo B
// ══════════════════════════════════════════════════════════════════════════════════════════
//
// Lester: «vamos con 24% y corre el examen del grupo B».
//
// El grupo B son 36 tickers BAJADOS Y NUNCA MIRADOS. Es el último examen limpio que queda en
// todo el proyecto y se gasta UNA sola vez. Por eso los criterios se escriben aquí, ahora, y
// no se tocan después de ver el resultado.
//
// El grupo A ya se gastó esta mañana (con el umbral del 3%, que SUSPENDIÓ) y desde entonces se
// ha usado para optimizar. O sea que A es entrenamiento y B es el examen. A y B son dos mitades
// aleatorias del MISMO universo de 60 grandes capitalizaciones, partidas por hash del nombre,
// así que una regla afinada en A y probada en B es un examen fuera de muestra legítimo.
//
// ═══ LA REGLA QUE SE EXAMINA — congelada ══════════════════════════════════════════════════
export const REGLA = {
  profundidad: 0.25,   tolProfundidad: 0.45,   // call 25% dentro (13,75% a 36,25%)
  plazo: 400,          tolPlazo: 0.55,         // ~400 días (180 a 620)
  costeMin: 0,                                 // SIN mínimo de coste (decidido el 30-ago)
  mediaN: 50,                                  // media de 50 sesiones
  umbral: -0.07,                               // entrar a más de 7% por debajo de esa media
  descarteRoto: -0.30,                         // por debajo de esto es un split, se ignora
  huecos: 10,
  exposicionTotal: 0.24,                       // ← LA DECISIÓN DE LESTER
  tam: 0.024,                                  // 0,24 / 10 huecos
  aguante: 120,
  suelo: 0.50,
  topeGanancia: 0, arrastre: 0,
  ocioso: "spy",
  castigo: 0.0138,
  capital: 60000,
  bandas: 41,
};
//
// En el grupo A esta regla da: $26.470/año · 17,6% · Sharpe 0,72 · caída −45% · 185 operaciones.
// Comprar SPY y dormir da:     $19.039/año · 14,9% · Sharpe 0,70 · caída −34%.
//
// ═══ LOS CRITERIOS — escritos antes de ver los datos ══════════════════════════════════════
export const CRITERIOS = {
  batirSPYenDinero: true,   // (1) más $/año que comprar SPY y dormir, en la MISMA ventana
  sharpeMinimo: 0.70,       // (2) Sharpe al menos el de SPY: no se acepta ganar más pagándolo
                            //     entero en susto. 0,70 es el de SPY en este período.
  minOperaciones: 100,      // (3) por debajo de esto la muestra no decide. En A hubo 185.
};
//
//   APRUEBA sólo si se cumplen LAS TRES.
//   SUSPENDE en cualquier otro caso — y suspender significa que la regla se RETIRA para el
//   forward test, no que se ajusta. Si se ajusta mirando B, B deja de ser examen y no queda
//   ningún grupo virgen en todo el proyecto.
//
// ═══ SE REPORTA ADEMÁS, aunque NO decida ══════════════════════════════════════════════════
//   · el CONTROL: la entrada vieja (por debajo de la media de 20, sin umbral) con todo lo
//     demás igual. Dice si la mejora de la entrada replicó o no.
//   · los umbrales VECINOS (−6% y −8%): si los tres no se parecen, la casilla era lotería
//     aunque apruebe.
//   · la concentración (cuánto pesa la operación mayor) y los años positivos.
//   · LA PALANCA original (media 20, «bajo la media», $5.000, 2 huecos) como referencia.
//
// ⛔ PROHIBIDO: cambiar cualquier valor de REGLA o de CRITERIOS después de ver el resultado y
//    seguir llamando a esto un examen. Reportar un «casi». Correr variantes sobre B para
//    buscar una que apruebe.
// ══════════════════════════════════════════════════════════════════════════════════════════
import { GRUPO_B } from "./EXAMEN-grupo-A.mjs";
export { GRUPO_B };

if (process.argv[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  console.log("");
  console.log("  ══ EXAMEN DEL GRUPO B — congelado el 2026-08-30 ══");
  console.log("");
  console.log("  " + GRUPO_B.length + " tickers, nunca mirados:");
  console.log("    " + GRUPO_B.join(" "));
  console.log("");
  console.log("  LA REGLA:");
  console.log("    call 25% dentro · ~400 días · SIN mínimo de coste");
  console.log("    entrar cuando la acción está más de un 7% por debajo de su media de 50");
  console.log("    aguante 120 sesiones · suelo 0,50x · 10 huecos · 24% de exposición total");
  console.log("    el ocioso en SPY · comprar al ask, vender al bid");
  console.log("");
  console.log("  APRUEBA sólo si LAS TRES:");
  console.log("    (1) gana más $/año que comprar SPY y dormir");
  console.log("    (2) Sharpe >= " + CRITERIOS.sharpeMinimo + " (el de SPY)");
  console.log("    (3) al menos " + CRITERIOS.minOperaciones + " operaciones");
  console.log("");
  console.log("  SUSPENDE en cualquier otro caso. Suspender = la regla se RETIRA, no se ajusta.");
  console.log("");
  console.log("  en el grupo A dio: $26.470/año · Sharpe 0,72 · −45% · 185 ops");
  console.log("  comprar SPY:       $19.039/año · Sharpe 0,70 · −34%");
  console.log("");
}
