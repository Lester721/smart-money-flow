// AUTOPSIA: ¿de donde salieron de verdad tus $15.913 en HOOD?
//
// La pregunta de Lester es literal: "como es que el año pasado yo logre vender puts en HOOD y
// generar cerca de $10k y tu no puedes ayudarme a replicar esa estrategia".
//
// Aqui se desmonta el P&L en sus piezas reales: puts, calls, spreads grandes, y cuanto vino de
// cerrar antes de vencimiento contra sostener.

import fs from 'node:fs';
const S = process.argv[2];
const ord = JSON.parse(fs.readFileSync(S + '/hood-ordenes.json', 'utf8'))
  .sort((a, b) => a.created_at < b.created_at ? -1 : 1);
const bars = JSON.parse(fs.readFileSync(S + '/hood-full.json', 'utf8'));
const px = new Map(bars.map(b => [b.d, b.c]));
const spot = d => { for (let i = 0; i < 8; i++) { const k = new Date(new Date(d) - i * 864e5).toISOString().slice(0, 10); if (px.has(k)) return px.get(k); } return null; };

// clave de contrato para casar apertura con cierre
const clave = o => o.legs.map(l => `${l.expiration_date}|${(+l.strike_price).toFixed(2)}|${l.option_type}`).sort().join('+');

const abre = ord.filter(o => o.opening_strategy), cierra = ord.filter(o => o.closing_strategy);
console.log('=== 1. ¿CUANTO DINERO MOVIO CADA PIEZA? ===\n');

const grupo = { 'puts sueltas': [], 'calls sueltas': [], 'spreads grandes (0DTE)': [] };
for (const o of abre) {
  const q = +o.quantity;
  if (o.opening_strategy.includes('spread')) grupo['spreads grandes (0DTE)'].push(o);
  else if (o.opening_strategy === 'short_put') grupo['puts sueltas'].push(o);
  else grupo['calls sueltas'].push(o);
}
for (const [k, v] of Object.entries(grupo)) {
  const prima = v.reduce((s, o) => s + (+o.processed_premium), 0);
  const contratos = v.reduce((s, o) => s + (+o.quantity), 0);
  console.log(`  ${k.padEnd(24)} ${String(v.length).padStart(3)} ordenes, ${String(contratos).padStart(4)} contratos, prima cobrada $${prima.toFixed(0)}`);
}
const primaCierres = cierra.reduce((s, o) => s + (+o.processed_premium), 0);
console.log(`  ${'recompras (cierres)'.padEnd(24)} ${String(cierra.length).padStart(3)} ordenes, ${String(cierra.reduce((s,o)=>s+ +o.quantity,0)).padStart(4)} contratos, pagado    -$${primaCierres.toFixed(0)}`);
const primaTotal = abre.reduce((s, o) => s + (+o.processed_premium), 0);
console.log(`\n  NETO de opciones: $${(primaTotal - primaCierres).toFixed(0)}   (tu P&L reportado por Robinhood: $15.913)`);
console.log('  La diferencia es lo que se perdio/gano por ASIGNACION y por las acciones.');

console.log('\n=== 2. ¿CERRABAS ANTES O SOSTENIAS? ===\n');
const puts = grupo['puts sueltas'];
const cerradas = new Map();
for (const c of cierra) cerradas.set(clave(c), (cerradas.get(clave(c)) || 0) + 1);
let sost = 0, cer = 0;
for (const p of puts) { if (cerradas.get(clave(p))) { cer++; cerradas.set(clave(p), cerradas.get(clave(p)) - 1); } else sost++; }
console.log(`  puts que RECOMPRASTE antes de vencer : ${cer}`);
console.log(`  puts que dejaste VENCER              : ${sost}   (${Math.round(sost / puts.length * 100)}%)`);

console.log('\n=== 3. LAS OPERACIONES QUE DE VERDAD MOVIERON LA AGUJA ===\n');
const grandes = abre.filter(o => +o.quantity >= 10).sort((a, b) => +b.processed_premium - +a.processed_premium);
console.log(`  ordenes de 10+ contratos: ${grandes.length}`);
for (const o of grandes) {
  const L = o.legs.map(l => `${l.side} ${l.option_type[0].toUpperCase()}${l.strike_price.replace(/\.0+$/, '')}`).join(' / ');
  console.log(`   ${o.created_at.slice(0, 10)}  x${(+o.quantity).toString().padStart(3)}  ${o.opening_strategy.padEnd(18)} ${L.padEnd(28)} exp ${o.legs[0].expiration_date}  prima $${(+o.processed_premium).toFixed(0)}`);
}

console.log('\n=== 4. ¿QUE PASO EL DIA QUE MAS GANASTE? ===');
console.log('  (los 3 mejores dias del P&L: 2026-05-22 $1.478, 2025-09-29 $1.215, 2025-12-03 $1.135)\n');
for (const d of ['2026-05-22', '2025-09-29', '2025-12-03', '2025-10-24']) {
  const dOrd = ord.filter(o => o.created_at.slice(0, 10) === d);
  console.log(`  ${d}  HOOD a $${spot(d)?.toFixed(2)}   ${dOrd.length} ordenes`);
  for (const o of dOrd) {
    const L = o.legs.map(l => `${l.side} ${l.position_effect} ${l.option_type[0].toUpperCase()}${l.strike_price.replace(/\.0+$/, '')} ${l.expiration_date}`).join(' / ');
    console.log(`      x${(+o.quantity).toString().padStart(3)} ${(o.opening_strategy || 'cierre ' + o.closing_strategy).padEnd(20)} ${o.direction.padEnd(6)} $${(+o.processed_premium).toFixed(0).padStart(5)}  ${L}`);
  }
}

console.log('\n=== 5. TAMAÑO: ¿cuanto colateral tenias comprometido a la vez? ===\n');
// posiciones abiertas dia a dia (aprox: una put esta viva desde su apertura hasta su expiracion)
const vivas = [];
for (const p of puts) vivas.push({ ini: p.created_at.slice(0, 10), fin: p.legs[0].expiration_date, col: +p.legs[0].strike_price * 100 * (+p.quantity) });
let maxCol = 0, maxD = '';
const dias = [...new Set(bars.map(b => b.d))].filter(d => d >= '2025-05-01');
const serie = [];
for (const d of dias) {
  const c = vivas.filter(v => v.ini <= d && d < v.fin).reduce((s, v) => s + v.col, 0);
  serie.push(c); if (c > maxCol) { maxCol = c; maxD = d; }
}
const noCero = serie.filter(x => x > 0);
console.log(`  colateral MAXIMO comprometido a la vez : $${maxCol.toFixed(0)}  (el ${maxD})`);
console.log(`  colateral MEDIO los dias con posicion  : $${(noCero.reduce((s, x) => s + x, 0) / noCero.length).toFixed(0)}`);
console.log(`  dias con alguna put viva               : ${noCero.length} de ${dias.length}  (${Math.round(noCero.length / dias.length * 100)}%)`);
console.log(`\n  -> $15.913 sobre un colateral medio de $${(noCero.reduce((s, x) => s + x, 0) / noCero.length).toFixed(0)} en 15 meses`);
