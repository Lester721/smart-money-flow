// VALIDAR los datos del GEX antes de construir nada encima.
//
// Regla de la casa: primero se comprueba la procedencia y la cobertura, después se mide.
// Lo que se busca aquí:
//   1. ¿cuántas fotos de 5 min por día tienen precio del subyacente utilizable?
//   2. ¿cuántos strikes cotizan de verdad en cada foto?
//   3. ¿el precio del subyacente cuadra con el cierre real del índice?
//   4. ¿el open interest trae los dos días (víspera y vencimiento)?

import fs from 'node:fs';
const DIR = process.argv[2];

const dias = fs.readdirSync(DIR).filter(f => f.startsWith('oi_')).map(f => f.slice(3, 13)).sort();
console.log(`=== ${dias.length} días, ${dias[0]} a ${dias[dias.length - 1]} ===\n`);

function leerIV(f) {
  const lin = fs.readFileSync(f, 'utf8').split('\n'), cab = lin[0].split(',');
  const iK = cab.indexOf('strike'), iT = cab.indexOf('timestamp'), iB = cab.indexOf('bid'),
        iA = cab.indexOf('ask'), iM = cab.indexOf('midpoint'), iU = cab.indexOf('underlying_price');
  const porHora = new Map();
  for (let n = 1; n < lin.length; n++) {
    const c = lin[n].split(','); if (c.length < cab.length) continue;
    const h = c[iT].slice(11, 16), U = +c[iU], bid = +c[iB], ask = +c[iA], mid = +c[iM], K = +c[iK];
    if (!porHora.has(h)) porHora.set(h, { U: 0, n: 0, vivos: 0 });
    const g = porHora.get(h); g.n++;
    if (U > 0) g.U = U;
    if (bid > 0 && ask > 0 && ask >= bid && mid > 0) g.vivos++;
  }
  return porHora;
}

// 1 y 2 — cobertura, sobre una muestra de 12 días repartidos
console.log('1-2. COBERTURA (muestra de 12 días repartidos por el año)\n');
console.log('día          fotos   fotos con precio   strikes vivos (mediana por foto)');
const muestra = dias.filter((_, i) => i % Math.ceil(dias.length / 12) === 0);
const resumen = [];
for (const d of muestra) {
  const m = leerIV(`${DIR}/iv_${d}_P.csv`);
  const horas = [...m.keys()].sort();
  const conU = horas.filter(h => m.get(h).U > 0);
  const vivos = horas.map(h => m.get(h).vivos).sort((a, b) => a - b);
  const med = vivos[Math.floor(vivos.length / 2)];
  resumen.push({ d, horas: horas.length, conU: conU.length, med, U: m.get(conU[Math.floor(conU.length / 2)])?.U });
  console.log(`${d}    ${String(horas.length).padStart(4)}    ${String(conU.length).padStart(9)}          ${String(med).padStart(6)}`);
}

// 3 — el precio del subyacente contra el cierre real del índice
console.log('\n3. ¿EL PRECIO DEL SUBYACENTE ES CREÍBLE?\n');
for (const r of resumen.slice(0, 6)) console.log(`   ${r.d}  SPX a mediodía según los datos: ${r.U?.toFixed(2) ?? '(sin precio)'}`);

// 4 — open interest
console.log('\n4. OPEN INTEREST\n');
let okOI = 0, malOI = 0;
for (const d of dias) {
  const lin = fs.readFileSync(`${DIR}/oi_${d}.csv`, 'utf8').split('\n');
  const cab = lin[0].split(','), iT = cab.indexOf('timestamp'), iO = cab.indexOf('open_interest');
  const fechas = new Set(), conOI = [];
  for (let n = 1; n < lin.length; n++) {
    const c = lin[n].split(','); if (c.length < cab.length) continue;
    fechas.add(c[iT].slice(0, 10));
    if (+c[iO] > 0) conOI.push(+c[iO]);
  }
  if (fechas.size >= 1 && conOI.length > 50) okOI++; else malOI++;
}
console.log(`   días con open interest utilizable: ${okOI} de ${dias.length}  (${malOI} flojos)`);
const ej = dias[Math.floor(dias.length / 2)];
{
  const lin = fs.readFileSync(`${DIR}/oi_${ej}.csv`, 'utf8').split('\n');
  const cab = lin[0].split(','), iT = cab.indexOf('timestamp'), iO = cab.indexOf('open_interest'), iK = cab.indexOf('strike');
  const porFecha = new Map();
  for (let n = 1; n < lin.length; n++) {
    const c = lin[n].split(','); if (c.length < cab.length) continue;
    const f = c[iT].slice(0, 10); if (!porFecha.has(f)) porFecha.set(f, []); porFecha.get(f).push(+c[iO]);
  }
  console.log(`   ejemplo ${ej}:`);
  for (const [f, v] of [...porFecha.entries()].sort())
    console.log(`      ${f}: ${v.length} strikes, OI total ${v.reduce((a, b) => a + b, 0).toLocaleString('es-ES')}`);
}

console.log('\n5. LO QUE HAY QUE SABER ANTES DE MEDIR');
const totalFotos = resumen.reduce((s, r) => s + r.conU, 0) / resumen.length;
console.log(`   fotos utilizables por día: ~${totalFotos.toFixed(0)} (de 78 posibles en sesión de 6,5 h)`);
console.log(`   strikes vivos por foto: ~${resumen.reduce((s, r) => s + r.med, 0) / resumen.length | 0}`);
