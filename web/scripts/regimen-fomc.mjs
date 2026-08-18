// LA PRUEBA 17 · DÍAS DE FOMC — la que mejor mecanismo tiene de las 18.
//
// POR QUÉ ES DISTINTA DE TODAS LAS DEMÁS: el comunicado sale a las 14:00 ET, o sea TRES HORAS
// DESPUÉS de que entres. Te metes corto de gamma sabiendo que hay un choque programado por
// delante. Es el único caso donde el peligro es conocido, con fecha, y todavía no ha ocurrido
// cuando decides. (El dato de inflación sale a las 08:30 — ya ha pasado cuando entras a las
// 11:00, y por eso siempre fue una hipótesis más floja.)
//
// FECHAS: sacadas de federalreserve.gov/monetarypolicy/fomccalendars.htm el 2026-08-17. Es el
// ÚLTIMO día de cada reunión, que es el día del comunicado. NO están escritas de memoria.
//
// El listón sigue siendo el de 18 pruebas. Y ya se dijo antes de correr: con ~21 días esto NO
// va a concluir. Se mide igual, para MIRARLO, no para decidir con ello.

import { readFileSync, existsSync } from "node:fs";
import { tWelch, listonT } from "../lib/barreraHallazgos";

const PRUEBAS = 18;
const liston = listonT(PRUEBAS);

// Último día de cada reunión del FOMC (día del comunicado), 2024-2026.
const FOMC = new Set([
  "2024-01-31", "2024-03-20", "2024-05-01", "2024-06-12", "2024-07-31", "2024-09-18", "2024-11-07", "2024-12-18",
  "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18", "2025-07-30", "2025-09-17", "2025-10-29", "2025-12-10",
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
]);

const CACHE = "scripts/regimen-filas.json";
if (!existsSync(CACHE)) throw new Error("falta " + CACHE + " — hay que correr regimen-18.mjs antes");
const filas = JSON.parse(readFileSync(CACHE, "utf8"));

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");

const si = filas.filter((f) => FOMC.has(f.fecha));
const no = filas.filter((f) => !FOMC.has(f.fecha));

// COMPROBACIÓN DE CORDURA: si el cruce de fechas fallara, `si` saldría vacío o absurdo y el
// resultado sería "no pasa" por la razón equivocada. Se mira ANTES de mirar el resultado.
const esperadas = [...FOMC].filter((d) => d >= filas[0].fecha && d <= filas[filas.length - 1].fecha);
console.log("\n## PRUEBA 17 · DÍAS DE FOMC\n");
console.log("  fechas de FOMC dentro del período de datos: " + esperadas.length);
console.log("  días de FOMC encontrados en la muestra:     " + si.length +
            (si.length === esperadas.length ? "  ✅" : "  ⚠️ NO CUADRA — mirar antes de interpretar"));
if (si.length !== esperadas.length) {
  const faltan = esperadas.filter((d) => !filas.some((f) => f.fecha === d));
  console.log("  faltan (¿festivo, o sin cadena ese día?): " + faltan.join(", "));
}

const t = tWelch(si.map((f) => f.pl), no.map((f) => f.pl));
const gana = (v) => (v.filter((f) => f.pl > 0).length / v.length) * 100;
console.log("\n| | días | P&L medio | mediana | % ganados | peor día |");
console.log("|---|---|---|---|---|---|");
for (const [nom, v] of [["**días de FOMC**", si], ["el resto", no]]) {
  const pls = v.map((f) => f.pl).sort((a, b) => a - b);
  console.log("| " + nom + " | " + v.length + " | " + eur(media(pls)) + " | " + eur(pls[pls.length >> 1]) +
              " | " + gana(v).toFixed(0) + "% | " + eur(pls[0]) + " |");
}
console.log("\n  diferencia: " + eur(media(si.map((f) => f.pl)) - media(no.map((f) => f.pl))) +
            " por operación · t = " + t.toFixed(2) + " contra un listón de " + liston);
console.log("  " + (Math.abs(t) >= liston ? "🟢 PASA" : "no pasa"));

// LO QUE HARÍA FALTA — la orden permanente es decir qué falta, no sólo que no pasó.
if (Math.abs(t) < liston && Math.abs(t) > 0.01) {
  const nHace = Math.ceil(si.length * Math.pow(liston / Math.abs(t), 2));
  console.log("\n  Para cruzar el listón con este mismo tamaño de efecto harían falta ~" + nHace +
              " días de FOMC; hay " + si.length + ". Son " + Math.ceil((nHace - si.length) / 8) + " años más de reuniones.");
}

// Y el desglose, que con 21 días es lo único de verdad informativo: verlos uno a uno.
console.log("\n  los días de FOMC, uno a uno:\n");
for (const f of si) console.log("    " + f.fecha + "  " + (f.pl >= 0 ? " " : "") + eur(f.pl));
