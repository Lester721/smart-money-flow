// AUDITORÍA · ¿el ala estrecha es una PALANCA o es simplemente OPERAR MÁS PEQUEÑO?
// La caída y el peor día bajan con el tamaño. La única comparación honesta es a IGUAL CAPITAL.
import { readFileSync } from "node:fs";
import { eur } from "./anatomia3-lib.mjs";
const J = JSON.parse(readFileSync("scripts/calendario-cola-puente.json","utf8"));
const S = Object.fromEntries(J.estrategias.map(s=>[s.nombre,s]));
const B = S["BASE · ±25/50 todos los días"];

console.log("═".repeat(126));
console.log("  EL ALA ESTRECHA CONTRA SU ÚNICO RIVAL HONESTO: el MISMO cóndor con MENOS TAMAÑO");
console.log("═".repeat(126));
console.log("  El colateral máximo de ±25/50 es " + eur(B.colMax) + ". El de ±25/30 es " + eur(S["TODOS los días con alas de 30"].colMax) + ".");
console.log("  Escalar la base a ese mismo capital = multiplicar TODA la serie por " + (S["TODOS los días con alas de 30"].colMax/B.colMax).toFixed(3) + ".");
console.log("  La caída y el peor día escalan EXACTAMENTE con el tamaño (son lineales en el P&L diario).\n");

function fila(nom, s, ref) {
  const k = s.colMax/ref.colMax;
  return { nom, alAno:s.alAno, dd:s.dd, peor:s.peor, col:s.colMax,
           escAlAno: ref.alAno*k, escDd: ref.dd*k, escPeor: ref.peor*k,
           milAlAno: s.alAno/(s.colMax/1000), milDd: s.dd/(s.colMax/1000), milPeor: s.peor/(s.colMax/1000) };
}
const PARES = [
  ["ala 50 → ala 30 · TODOS los días", "TODOS los días con alas de 30", B],
  ["ala 50 → ala 20 · TODOS los días", "TODOS los días con alas de 20", B],
  ["saltar marcados: ala 50 → ala 30", "saltar marcados + alas de 30 el resto", S["no operar los días marcados"]],
  ["saltar marcados: ala 50 → ala 20", "saltar marcados + alas de 20 el resto", S["no operar los días marcados"]],
];
console.log("| comparación | $/año ala estrecha | $/año base ESCALADA al mismo capital | caída ala estrecha | caída base ESCALADA | peor día ala estrecha | peor día base ESCALADA |");
console.log("|---|---|---|---|---|---|---|");
for (const [nom, clave, ref] of PARES) {
  const r = fila(nom, S[clave], ref);
  console.log(`| ${nom} | ${eur(r.alAno)} | ${eur(r.escAlAno)} | ${eur(r.dd)} | ${eur(r.escDd)} | ${eur(r.peor)} | ${eur(r.escPeor)} |`);
}

console.log("\n\n  TODO NORMALIZADO POR CADA $1.000 DE COLATERAL — la única unidad en la que se pueden comparar\n");
console.log("| estrategia | colateral máx | $/año por $1.000 | PEOR RACHA por $1.000 | peor día por $1.000 |");
console.log("|---|---|---|---|---|");
for (const s of J.estrategias) {
  const k = s.colMax/1000;
  console.log(`| ${s.nombre} | ${eur(s.colMax)} | ${eur(s.alAno/k)} | ${eur(s.dd/k)} | ${eur(s.peor/k)} |`);
}

console.log("\n\n  LO QUE DECIDE — variación respecto a la BASE, a igual capital:\n");
console.log("| estrategia | Δ $/año por $1.000 | Δ PEOR RACHA por $1.000 | Δ peor día por $1.000 |");
console.log("|---|---|---|---|");
const kB = B.colMax/1000;
for (const s of J.estrategias.slice(1)) {
  const k = s.colMax/1000;
  const dA = (s.alAno/k)/(B.alAno/kB)-1, dD = Math.abs(s.dd/k)/Math.abs(B.dd/kB)-1, dP = Math.abs(s.peor/k)/Math.abs(B.peor/kB)-1;
  console.log(`| ${s.nombre} | ${(dA*100>=0?"+":"")}${(dA*100).toFixed(1)}% | ${(dD*100>=0?"+":"")}${(dD*100).toFixed(1)}% ${dD>0?"← PEOR":"← mejor"} | ${(dP*100>=0?"+":"")}${(dP*100).toFixed(1)}% ${dP>0?"← PEOR":"← mejor"} |`);
}
