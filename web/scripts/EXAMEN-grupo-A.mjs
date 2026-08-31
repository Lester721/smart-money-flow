// ══════════════════════════════════════════════════════════════════════════════════════════
// EXAMEN DEL GRUPO A — escrito el 2026-08-29, ANTES de bajar un solo byte de datos nuevos
// ══════════════════════════════════════════════════════════════════════════════════════════
//
// Lester: «congela la palanca con todo lo que ya tenemos, escribe el examen y enséñamelo».
//
// Este fichero se escribe AHORA para que los criterios no se puedan mover después. Es
// exactamente el procedimiento que mató la tabla mágica en agosto: la regla daba +7,44% con
// t=3,03 sobre los 8 tickers donde se afinó, y −6,30% sobre los 20 que nunca había mirado.
//
// ═══ LA HIPÓTESIS ═════════════════════════════════════════════════════════════════════════
//
//   Exigir que la acción esté MÁS DE UN 3% por debajo de su media de 20 sesiones mejora
//   LA PALANCA respecto a entrar con sólo estar por debajo.
//
// Sobre los 27 tickers de siempre: Sharpe 0,80 contra 0,72 y ~23% al año contra 20,9%.
// PERO ese umbral se ha barrido TRES VECES sobre esos mismos 27 tickers. Puede ser ruido.
//
// ═══ POR QUÉ 3% Y NO 2% ═══════════════════════════════════════════════════════════════════
// El barrido dio 2%→0,83 · 3%→0,80 · 4%→0,75, con un hoyo en 1%→0,58.
// Se congela el **3%**, que es el CENTRO de la zona alta, NO el máximo. Coger el máximo de un
// barrido es exactamente lo que ha matado seis hallazgos hoy.
//
// ═══ LOS CRITERIOS — escritos antes de ver los datos ═══════════════════════════════════════
//
//   APRUEBA si, sobre los 30 tickers del grupo A, se cumplen LAS DOS:
//     (1) el umbral del 3% da un Sharpe al menos 0,04 MAYOR que el control sin umbral, y
//     (2) el umbral del 3% da más rendimiento anual que comprar SPY
//
//   SUSPENDE en cualquier otro caso. Y «suspende» significa que el umbral se retira, no que
//   se ajusta. Si se ajusta mirando el grupo A, el grupo A deja de ser examen.
//
//   Se reporta ADEMÁS, aunque no decida:
//     · si LA PALANCA sin umbral bate a SPY en los tickers nuevos (eso examina TODO lo demás:
//       la profundidad del 25%, el plazo de 400 días, coger las más hundidas, el aguante)
//     · el barrido completo del umbral, para ver si la FORMA se parece a la de los 27
//     · el número de operaciones, por si la muestra no da
//
// ═══ EL GRUPO A Y EL GRUPO B ═══════════════════════════════════════════════════════════════
// La partición se fija AQUÍ, con un hash del nombre. No se toca. El grupo B no se mira hasta
// que Lester haya visto el resultado de A y haya decidido si ajusta algo.
// ══════════════════════════════════════════════════════════════════════════════════════════

// 60 tickers de gran capitalización con opciones líquidas desde 2016, NINGUNO en LA PALANCA
export const NUEVOS = [
  "ABBV","ABT","ACN","ADBE","AIG","AMAT","AMGN","AMZN","AVGO","AXP",
  "BKNG","BMY","C","CAT","CVS","CVX","DAL","DE","DHR","EBAY",
  "FDX","GILD","GM","GOOGL","GS","HD","HON","IBM","JNJ","LLY",
  "LMT","LOW","LRCX","MA","MCD","MDT","MRK","MS","MU","NFLX",
  "PEP","PG","QCOM","RTX","SBUX","SCHW","SLB","SO","TGT","TMO",
  "TXN","UPS","USB","V","VZ","WFC","X","XLNX","YUM","ZTS",
];

// hash determinista del nombre — la misma familia que usamos en el examen de agosto
function hash(s) { let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0); }
export const GRUPO_A = NUEVOS.filter((t) => hash(t) % 2 === 0);
export const GRUPO_B = NUEVOS.filter((t) => hash(t) % 2 === 1);

// ── LA REGLA CONGELADA (ver LA-PALANCA-CONGELADA.md) ──────────────────────────────────────
export const REGLA = {
  profundidad: 0.25,   tolProfundidad: 0.45,     // 13,75% a 36,25% dentro
  plazo: 400,          tolPlazo: 0.55,           // 180 a 620 días
  costeMin: 5000,
  mediaN: 20,
  umbral: -0.03,                                  // ← LA HIPÓTESIS
  descarteRoto: -0.30,                            // por debajo de esto es un split, se ignora
  huecos: 2,
  tam: 0.12,
  aguante: 120,
  suelo: 0.50,
  topeGanancia: 0,                                // sin tope
  arrastre: 0,                                    // sin stop que sigue al máximo
  ocioso: "spy",
  castigo: 0.0138,                                // media horquilla medida en r140
  capital: 60000,
  bandas: 41,                                     // mediana de 41 capitales de partida
};

export const CRITERIOS = {
  margenSharpe: 0.04,        // el 3% tiene que ganar al control por al menos esto
  batirSPY: true,            // y tiene que batir a comprar SPY en rendimiento
  minOperaciones: 25,        // por debajo de esto la muestra no decide nada
};

// ══════════════════════════════════════════════════════════════════════════════════════════
// PROCEDIMIENTO — cuando estén los datos
//
//  1. Bajar cadenas de los 60 (2016-2026) y construir los caminos con r135, PROF=0,25 y
//     DTE=400, con las tolerancias de REGLA. Precios ajustados por split como en r161.
//  2. Correr SÓLO sobre GRUPO_A:
//       a) control  : umbral = 0      (sólo por debajo de la media)
//       b) hipótesis: umbral = −0,03
//       c) barrido completo del umbral, para comparar la FORMA con la de los 27
//       d) comprar SPY, en la misma ventana
//  3. Aplicar CRITERIOS. Escribir APRUEBA o SUSPENDE. Sin matices.
//  4. Enseñárselo a Lester. Él decide si ajusta.
//  5. GRUPO_B queda intacto para el segundo examen, con la regla que él decida.
//
// ⛔ PROHIBIDO: mirar el grupo B antes del paso 4. Cambiar cualquier valor de REGLA después
//    de ver el grupo A y seguir llamándolo examen. Reportar un resultado "casi".
// ══════════════════════════════════════════════════════════════════════════════════════════

// OJO: en Windows `file://C:/...` NO es igual a `file:///C:/...` — el guardian de antes
// nunca disparaba y el fichero salia MUDO. pathToFileURL lo construye bien en los dos.
const { pathToFileURL } = await import("node:url");
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log("");
  console.log("  ══ EXAMEN DEL GRUPO A — congelado el 2026-08-29 ══");
  console.log("");
  console.log("  HIPÓTESIS: exigir >3% por debajo de la media de 20 mejora LA PALANCA.");
  console.log("  En los 27 de siempre: Sharpe 0,80 contra 0,72 del control.");
  console.log("");
  console.log("  APRUEBA si sobre el grupo A:");
  console.log("    (1) el umbral 3% da Sharpe ≥ control + " + CRITERIOS.margenSharpe);
  console.log("    (2) y bate a comprar SPY en rendimiento anual");
  console.log("  SUSPENDE en cualquier otro caso. Suspender = se RETIRA el umbral, no se ajusta.");
  console.log("");
  console.log("  tickers nuevos: " + NUEVOS.length);
  console.log("");
  console.log("  GRUPO A (" + GRUPO_A.length + ") — el examen:");
  console.log("    " + GRUPO_A.join(" "));
  console.log("");
  console.log("  GRUPO B (" + GRUPO_B.length + ") — NO SE MIRA hasta después:");
  console.log("    " + GRUPO_B.join(" "));
  console.log("");
  console.log("  la regla congelada:");
  for (const [k, v] of Object.entries(REGLA)) console.log("    " + k.padEnd(18) + v);
  console.log("");
}
