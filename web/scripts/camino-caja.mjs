// CAMINO · PASO 9 — la caja, bien medida.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/camino-caja.mjs
//
// La "peor racha" (de pico a valle) es la medida estándar, pero para saber si una cuenta AGUANTA
// no es la buena: si la caída llega después de meses de beneficios, la financian los beneficios,
// no el efectivo de partida. Lo que vacía la caja es el PUNTO MÁS BAJO DEL ACUMULADO DESDE EL
// PRIMER DÍA. Las dos se calculan aquí, y la diferencia entre ellas es grande.
//
// También se mira lo que de verdad decide: cuántos días seguidos se puede estar por debajo de cero
// y cuánto hay que poner encima de la mesa para no quedarse sin caja a mitad de camino.

import { cargar, eur, peorRacha, periodo, P1, P2, EFECTIVO, CUENTA } from "./camino-lib.mjs";

const dias = cargar();
const pls = dias.map((d) => d.pl);

function caja(p) {
  let acum = 0, minAcum = 0, iMin = 0;
  const serie = [];
  for (let i = 0; i < p.length; i++) { acum += p[i]; serie.push(acum); if (acum < minAcum) { minAcum = acum; iMin = i; } }
  return { minAcum, iMin, final: acum, racha: peorRacha(p), serie };
}

console.log(`\n═══ 1 · LO QUE DE VERDAD HAY QUE TENER EN LA CAJA (1 contrato, ala 50) ═══\n`);
console.log("| desde | días | resultado final | peor racha (pico→valle) | PUNTO MÁS BAJO desde el inicio | cuándo |");
console.log("|---|---|---|---|---|---|");
for (const [nom, sel] of [
  ["2022-01 (todo)", dias],
  ["2022-01 sólo 22-23", dias.filter((d) => periodo(d.f) === P1)],
  ["2024-01 sólo 24-26", dias.filter((d) => periodo(d.f) === P2)],
  ["2023-01", dias.filter((d) => d.f >= "2023-01-01")],
  ["2025-01", dias.filter((d) => d.f >= "2025-01-01")],
]) {
  const c = caja(sel.map((d) => d.pl));
  console.log(`| ${nom} | ${sel.length} | ${eur(c.final)} | ${eur(c.racha)} | ${eur(c.minAcum)} | ${sel[c.iMin].f} |`);
}

console.log(`\n\n═══ 2 · ¿CUÁNTOS CONTRATOS AGUANTA LA CAJA DE VERDAD? ═══`);
console.log(`\nEfectivo $${EFECTIVO.toLocaleString("es-ES")}. Se exige que el punto más bajo del acumulado no se lo coma entero,`);
console.log(`dejando la mitad de colchón (o sea: contratos = efectivo ÷ 2 ÷ |punto más bajo|).\n`);
console.log("| si hubiera empezado en | punto más bajo/contrato | contratos con colchón 2× | contratos al límite | $/año a 1 contrato |");
console.log("|---|---|---|---|---|");
for (const [nom, sel] of [
  ["2022-01", dias],
  ["2024-01", dias.filter((d) => periodo(d.f) === P2)],
  ["2025-01", dias.filter((d) => d.f >= "2025-01-01")],
]) {
  const c = caja(sel.map((d) => d.pl));
  const anual = (c.final / sel.length) * 252;
  const bajo = Math.abs(c.minAcum);
  console.log(`| ${nom} | ${eur(c.minAcum)} | ${Math.floor(EFECTIVO / 2 / bajo)} | ${Math.floor(EFECTIVO / bajo)} | ${eur(anual)} |`);
}

console.log(`\n\n═══ 3 · EL AÑO A AÑO, QUE ES LO QUE SE VIVE ═══\n`);
console.log("| año | días | resultado | punto más bajo del año | peor día | mejor día | % ganados |");
console.log("|---|---|---|---|---|---|---|");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const g = dias.filter((d) => d.f.startsWith(a));
  const c = caja(g.map((d) => d.pl));
  const p = g.map((d) => d.pl);
  console.log(`| ${a} | ${g.length} | ${eur(c.final)} | ${eur(c.minAcum)} | ${eur(Math.min(...p))} | ${eur(Math.max(...p))} | ${((p.filter((x) => x > 0).length / p.length) * 100).toFixed(0)}% |`);
}

console.log(`\n\n═══ 4 · CUÁNTO EFECTIVO PIDE LA ESTRATEGIA ═══\n`);
const cTodo = caja(pls), c24 = caja(dias.filter((d) => periodo(d.f) === P2).map((d) => d.pl));
console.log(`  Para 1 contrato de ala 50, sin quedarse sin caja:`);
console.log(`    · si el futuro se parece a 2024-2026 (el régimen bueno): ${eur(Math.abs(c24.minAcum) * 2)} de efectivo libre`);
console.log(`    · si el futuro se parece a 2022-2026 entero:            ${eur(Math.abs(cTodo.minAcum) * 2)} de efectivo libre`);
console.log(`  Lester tiene ${eur(EFECTIVO)} libres de una cuenta de ${eur(CUENTA)}.`);
console.log(`\n  Y lo que rinde 1 contrato: ${eur((cTodo.final / dias.length) * 252)}/año sobre los 4,5 años · ${eur((c24.final / 653) * 252)}/año si sólo se cuenta 2024-2026.`);
console.log(`  Sobre la cuenta de ${eur(CUENTA)}: ${(((cTodo.final / dias.length) * 252 / CUENTA) * 100).toFixed(1)}% al año y ${(((c24.final / 653) * 252 / CUENTA) * 100).toFixed(1)}% al año respectivamente.`);
