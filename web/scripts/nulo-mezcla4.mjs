// NULO DE LA MEZCLA · cierre — traducir a la cuenta REAL y al EFECTIVO, que es el cuello de botella.
import fs from 'node:fs';
const CUENTA = 56389, EFECTIVO = 7977, PODER = 73874;
const filas = JSON.parse(fs.readFileSync('scripts/cache-theta/_nulo-mezcla-filas.json', 'utf8'));
const media = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const usd = (x) => '$' + Math.round(x).toLocaleString('es');

console.log('\n══ EL EFECTIVO — de donde salen las perdidas de la pata vendida ══');
const perd = filas.map((x) => -x.pnlPut).filter((x) => x > 0);
perd.sort((a, b) => b - a);
console.log('  1 contrato · semanas con perdida: ' + perd.length + '/' + filas.length + ' (' + (100 * perd.length / filas.length).toFixed(0) + '%)');
console.log('  peor semana en DOLARES por contrato: ' + usd(perd[0]) + ' · 2a ' + usd(perd[1]) + ' · 3a ' + usd(perd[2]));
console.log('  contra el EFECTIVO ($' + EFECTIVO.toLocaleString('es') + '): la peor semana se lleva el ' + (100 * perd[0] / EFECTIVO).toFixed(0) + '% del efectivo de un golpe');
console.log('  perdidas acumuladas en las 3 peores semanas: ' + usd(perd[0] + perd[1] + perd[2]) + ' = ' + (100 * (perd[0] + perd[1] + perd[2]) / EFECTIVO).toFixed(0) + '% del efectivo');
console.log('  neto medio por contrato/semana: ' + usd(media(filas.map((x) => x.pnlPut))) + ' → 52 semanas = ' + usd(52 * media(filas.map((x) => x.pnlPut))) + '/año con 1 contrato');

console.log('\n══ ¿QUE PARTE DE LA CUENTA OCUPA 1 CONTRATO? ══');
const noc = filas.map((x) => x.strike * 100);
console.log('  nocional 2020: ' + usd(noc[0]) + ' (' + (100 * noc[0] / CUENTA).toFixed(0) + '% de la cuenta) → 2026: ' + usd(noc.at(-1)) + ' (' + (100 * noc.at(-1) / CUENTA).toFixed(0) + '% de la cuenta)');
console.log('  para que 1 contrato fuera el 50% de la cuenta harian falta ' + usd(2 * noc.at(-1)) + ' de capital hoy');
console.log('  semanas en que 1 contrato <= 50% de la cuenta: ' + filas.filter((x) => x.strike * 100 <= CUENTA / 2).length + '/' + filas.length + ' · ultima: ' + (filas.filter((x) => x.strike * 100 <= CUENTA / 2).at(-1)?.fecha ?? 'ninguna'));

console.log('\n══ LO QUE FALTA PARA CERRAR LA COMPARACION ══');
const R = 'scripts/cache-theta';
for (const t of ['TLT', 'IEF', 'SHY', 'AGG', 'BND', 'BIL']) {
  const hay = fs.existsSync(R + '/cierres/' + t + '.json');
  console.log('  ' + t.padEnd(5) + ' en cache-theta/cierres/: ' + (hay ? 'SI' : 'NO'));
}
console.log('  tipos de las letras (DGS3MO o similar): NO existe ningun fichero en el repo');
console.log('  dividendos de QQQ: NO existe. precios-ajustados.json esta roto (fecha +4d y ratio que BAJA en el 40% de los pasos)');
