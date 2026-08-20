// TAM-FILO — ¿a qué distancia estuvo UN contrato de obligarle a vender HOOD?
//
// La llamada de margen llega cuando:  HOOD + efectivo  <  25% de HOOD + colateral retenido
// Con HOOD = $48.412 y 1 cóndor de $5.000 de colateral:  efectivo < −$31.309

import { readFileSync } from "node:fs";
const dias = JSON.parse(readFileSync("scripts/tam-anchos.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const TOTAL = 56389, EFECTIVO = 7977, HOOD = TOTAL - EFECTIVO, TASA = 0.05, MANT = 0.25;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.round(Math.abs(x)).toLocaleString("es-ES");
const cal = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000));

for (const N of [1, 2]) {
  const COL = 5000 * N;
  const umbral = MANT * HOOD + COL - HOOD;   // efectivo por debajo del cual hay llamada
  let ef = EFECTIVO, peorEf = EFECTIVO, peorFecha = "", cum = 0;
  const curva = [];
  for (let i = 0; i < dias.length; i++) {
    const d = dias[i].por[50]; if (!d) continue;
    ef += d.pl * N; cum += d.pl * N;
    const nat = i > 0 ? cal(dias[i - 1].fecha, dias[i].fecha) : 1;
    const int = Math.max(0, COL - ef) * TASA * (nat / 365);
    ef -= int; cum -= int;
    if (ef < peorEf) { peorEf = ef; peorFecha = dias[i].fecha; }
    curva.push({ f: dias[i].fecha, ef });
  }
  console.log(`\n═══ ${N} CONTRATO(S) · ala 50 · colateral ${eur(COL)} ═══`);
  console.log(`  umbral de llamada de margen: efectivo por debajo de ${eur(umbral)}`);
  console.log(`  efectivo mínimo alcanzado:   ${eur(peorEf)}  el ${peorFecha}`);
  const margen = peorEf - umbral;
  console.log(`  margen de seguridad: ${eur(margen)}` +
    (margen > 0 ? `  →  ${(margen / 4940).toFixed(1)} días máximos de pérdida ($4.940) de distancia a vender HOOD` : `  →  YA HUBO LLAMADA`));
  // ¿cuántos días estuvo en préstamo?
  const enDeuda = curva.filter((x) => x.ef < 0).length;
  console.log(`  días con el efectivo en negativo (pagando 5%): ${enDeuda} de ${curva.length} (${((enDeuda / curva.length) * 100).toFixed(0)}%)`);
  const dentro2022 = curva.filter((x) => x.f < "2024-01-01");
  const min22 = dentro2022.reduce((a, b) => (b.ef < a.ef ? b : a));
  console.log(`  peor momento dentro de 2022-2023: ${eur(min22.ef)} el ${min22.f}`);
}

// ── ¿Y si el orden de los días hubiera sido otro? El peor tramo de 6 meses ──
console.log(`\n═══ EL PEOR SEMESTRE DE LA HISTORIA (126 días seguidos), 1 contrato ═══`);
const pls = dias.map((d) => d.por[50].pl);
let peor = Infinity, iPeor = 0;
for (let i = 0; i + 126 <= pls.length; i++) {
  const s = pls.slice(i, i + 126).reduce((a, b) => a + b, 0);
  if (s < peor) { peor = s; iPeor = i; }
}
console.log(`  ${dias[iPeor].fecha} → ${dias[iPeor + 125].fecha}: ${eur(peor)} con 1 contrato ` +
  `(${eur(peor * 2)} con 2 · ${eur(peor * 3)} con 3)`);
console.log(`  Sobre el efectivo de ${eur(EFECTIVO)}: ese semestre solo se lo come ${(-peor / EFECTIVO).toFixed(1)} veces con 1 contrato.`);

// ── El mejor semestre, para no contar sólo la mitad ──
let mejor = -Infinity, iMejor = 0;
for (let i = 0; i + 126 <= pls.length; i++) {
  const s = pls.slice(i, i + 126).reduce((a, b) => a + b, 0);
  if (s > mejor) { mejor = s; iMejor = i; }
}
console.log(`\n  El MEJOR semestre: ${dias[iMejor].fecha} → ${dias[iMejor + 125].fecha}: ${eur(mejor)} con 1 contrato.`);
console.log(`  La horquilla entre el mejor y el peor semestre es de ${eur(mejor - peor)} POR CONTRATO.`);
console.log(`  Eso, y no la media, es lo que hay que poder aguantar.`);
