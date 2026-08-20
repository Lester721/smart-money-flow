// ANATOMÍA 3 · la prueba que de verdad le toca al fin de mes.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/anatomia3-cola-finmes.mjs
//
// La hipótesis NO es "el fin de mes gana menos de media". La mediana del fin de mes es +$45:
// veintiún de los treinta y un fines de mes son días normales o buenos. La hipótesis es
// "el fin de mes tiene la COLA MÁS GORDA". Medirla con una t de medias es usar la herramienta
// equivocada y perder potencia: la t reparte el peso entre los 31 días, y el efecto está en 10.
//
// La prueba correcta es de FRECUENCIA DE COLA: ¿cuántos días por debajo de −$1.000, −$2.000 y
// −$3.000 hay entre los fines de mes, contra los que habría si el fin de mes fuera un día
// cualquiera? Es una binomial exacta, no una aproximación.
//
// Y al final, lo único que le sirve a Lester para decidir: CUÁNTO CUESTA EQUIVOCARSE.

import { writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { cargar, resumen, media, pct, eur } from "./anatomia3-lib.mjs";

const PRUEBAS = 180, LISTON = listonT(PRUEBAS);
const { filas } = cargar();
const ANOS = filas.length / 251;
const BASE = resumen(filas, ANOS);
const FIN = filas.filter((f) => f.finMes === 1), RESTO = filas.filter((f) => f.finMes === 0);

// binomial exacta, cola derecha: P(X >= k) con X ~ Bin(n, p)
function binomCola(k, n, p) {
  let acc = 0;
  for (let i = k; i <= n; i++) {
    let lc = 0;
    for (let j = 0; j < i; j++) lc += Math.log(n - j) - Math.log(j + 1);
    acc += Math.exp(lc + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return acc;
}

console.log("═".repeat(104));
console.log(`  FRECUENCIA DE COLA · ${FIN.length} fines de mes contra ${RESTO.length} días normales`);
console.log("═".repeat(104));
console.log("| umbral | fines de mes | tasa | días normales | tasa | esperados si fuera un día cualquiera | p (binomial exacta) | z |");
console.log("|---|---|---|---|---|---|---|---|");
const colas = [];
for (const u of [-1000, -2000, -3000]) {
  const kF = FIN.filter((f) => f.pl < u).length, kR = RESTO.filter((f) => f.pl < u).length;
  const p0 = kR / RESTO.length;
  const esp = p0 * FIN.length;
  const p = binomCola(kF, FIN.length, p0);
  const z = (kF / FIN.length - p0) / Math.sqrt((p0 * (1 - p0)) / FIN.length);
  colas.push({ umbral: u, kF, nF: FIN.length, tasaF: kF / FIN.length, kR, tasaR: p0, esperados: esp, p, z });
  console.log(`| P&L < ${eur(u)} | ${kF} | ${((kF / FIN.length) * 100).toFixed(0)}% | ${kR} | ${(p0 * 100).toFixed(0)}% | ${esp.toFixed(1)} | ${p.toExponential(2)} | ${z.toFixed(2)} |`);
}
console.log(`\n  listón |z| ≥ ${LISTON} (Bonferroni sobre ${PRUEBAS} pruebas).`);

// los 30 peores: ¿cuántos son fin de mes?
const ord = [...filas].sort((a, b) => a.pl - b.pl);
for (const n of [10, 20, 30, 50]) {
  const k = ord.slice(0, n).filter((f) => f.finMes === 1).length;
  console.log(`  de los ${String(n).padStart(2)} peores días del período, ${k} son fin de mes (esperados ${(n * FIN.length / filas.length).toFixed(1)})`);
}

// ── la mediana: el fin de mes NO es un día malo, es un día de cola gorda ────
console.log("\n" + "─".repeat(104));
console.log("  Y ESTO ES LO QUE NO SE PUEDE CONTAR MAL:");
console.log("─".repeat(104));
console.log(`  mediana del fin de mes ${eur(pct(FIN.map((f) => f.pl), 0.5))} · mediana del resto ${eur(pct(RESTO.map((f) => f.pl), 0.5))}`);
console.log(`  acierto del fin de mes ${((FIN.filter((f) => f.pl > 0).length / FIN.length) * 100).toFixed(0)}% · del resto ${((RESTO.filter((f) => f.pl > 0).length / RESTO.length) * 100).toFixed(0)}%`);
console.log(`  El fin de mes GANA casi tan a menudo como cualquier otro día. Lo que cambia es lo que`);
console.log(`  pasa cuando pierde. Por eso la media se hunde y la mediana no se entera.`);

// ── ¿CUÁNTO CUESTA EQUIVOCARSE? ────────────────────────────────────────────
console.log("\n" + "═".repeat(104));
console.log("  LO ÚNICO QUE HACE FALTA PARA DECIDIR: cuánto cuesta equivocarse en cada dirección");
console.log("═".repeat(104));
const dentro = filas.filter((f) => f.finMes === 0);
const r = resumen(dentro, ANOS);
const finesPorAno = FIN.length / ANOS;
const costeSiFalso = finesPorAno * media(RESTO.map((f) => f.pl));
console.log(`  SI EL EFECTO ES FALSO y el fin de mes es un día como otro cualquiera:`);
console.log(`     dejas de operar ${finesPorAno.toFixed(1)} días al año que valían ${eur(media(RESTO.map((f) => f.pl)))} cada uno`);
console.log(`     → cuesta ${eur(costeSiFalso)}/año, el ${((costeSiFalso / BASE.alAno) * 100).toFixed(0)}% del ingreso. Y la caída NO empeora.`);
console.log(`\n  SI EL EFECTO ES CIERTO:`);
console.log(`     ingreso ${eur(BASE.alAno)}/año → ${eur(r.alAno)}/año (+${eur(r.alAno - BASE.alAno)})`);
console.log(`     peor racha ${eur(BASE.dd)} → ${eur(r.dd)} · p5 ${eur(BASE.p5)} → ${eur(r.p5)} · peor día ${eur(BASE.peor)} → ${eur(r.peor)} (NO cambia)`);
console.log(`\n  La apuesta es asimétrica: se arriesga el ${((costeSiFalso / BASE.alAno) * 100).toFixed(0)}% del ingreso para quitar el ${((1 - Math.abs(r.dd) / Math.abs(BASE.dd)) * 100).toFixed(0)}% de la caída.`);
console.log(`  ESO NO CONVIERTE UN t DE 2,41 EN UN HALLAZGO. Es un argumento de decisión, no de prueba,`);
console.log(`  y va etiquetado como tal.`);

writeFileSync("scripts/anatomia3-cola-finmes.json", JSON.stringify({ colas, costeSiFalso, base: BASE, filtrado: r }, null, 2), "utf8");
console.log("\n  detalle en scripts/anatomia3-cola-finmes.json");
