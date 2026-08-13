// TUS 101 PUTS, una por una, sostenidas a vencimiento.
//
// No hay simulacion aqui: strike, vencimiento y prima son los tuyos, sacados de Robinhood.
// Lo unico que se calcula es el desenlace si las hubieras dejado vencer todas.
//
// Sirve para separar tres cosas que estaban mezcladas en los $15.913:
//   - lo que dio la ESTRUCTURA (vender la put)
//   - lo que dieron tus RECOMPRAS (cerrar antes)
//   - lo que dio HOOD subiendo

import fs from 'node:fs';
const S = process.argv[2];
const ord = JSON.parse(fs.readFileSync(S + '/hood-ordenes.json', 'utf8'));
const bars = JSON.parse(fs.readFileSync(S + '/hood-full.json', 'utf8'));
const px = new Map(bars.map(b => [b.d, b.c]));
const cierre = e => { for (let k = 0; k < 8; k++) { const d = new Date(new Date(e) - k * 864e5).toISOString().slice(0, 10); if (px.has(d)) return px.get(d); } return null; };
const spot = d => { for (let k = 0; k < 8; k++) { const x = new Date(new Date(d) - k * 864e5).toISOString().slice(0, 10); if (px.has(x)) return px.get(x); } return null; };

const puts = ord.filter(o => o.opening_strategy === 'short_put').sort((a, b) => a.created_at < b.created_at ? -1 : 1);
let plTot = 0, colTot = 0, asign = 0, gan = 0;
const detalle = [];
for (const o of puts) {
  const L = o.legs[0], q = +o.quantity, K = +L.strike_price, exp = L.expiration_date;
  const prima = +o.processed_premium;           // dolares totales cobrados
  const ST = cierre(exp); if (ST == null) continue;
  const perdida = Math.max(K - ST, 0) * 100 * q;
  const pl = prima - perdida - 0.03 * q;
  const col = K * 100 * q;
  plTot += pl; colTot += col;
  if (ST < K) asign++; if (pl > 0) gan++;
  detalle.push({ f: o.created_at.slice(0, 10), exp, K, q, prima, ST, S0: spot(o.created_at.slice(0, 10)), pl, col, ret: pl / col });
}
console.log('=== TUS 101 PUTS, SOSTENIDAS A VENCIMIENTO (contrafactual exacto) ===\n');
console.log(`  operaciones             : ${detalle.length}`);
console.log(`  acabaron dentro del dinero: ${asign}  (${Math.round(asign / detalle.length * 100)}%)`);
console.log(`  ganadoras               : ${gan}  (${Math.round(gan / detalle.length * 100)}%)`);
console.log(`  prima cobrada           : $${puts.reduce((s, o) => s + (+o.processed_premium), 0).toFixed(0)}`);
console.log(`  P&L si las sostienes    : $${plTot.toFixed(0)}`);
console.log(`  colateral sumado        : $${colTot.toFixed(0)}   -> ${(plTot / colTot * 100).toFixed(2)}% por operacion de media`);
console.log('');
console.log(`  TU P&L REAL de todo HOOD: $15.913   (puts + calls + spreads + acciones)`);

console.log('\n--- las peores si las hubieras sostenido ---');
[...detalle].sort((a, b) => a.pl - b.pl).slice(0, 8).forEach(d =>
  console.log(`   ${d.f} -> ${d.exp}  K=${d.K}  HOOD ${d.S0?.toFixed(2)} -> ${d.ST.toFixed(2)}   prima $${d.prima}  P&L $${d.pl.toFixed(0)}`));

console.log('\n=== ¿tus RECOMPRAS te salvaron o te costaron? ===');
const clave = o => o.legs.map(l => `${l.expiration_date}|${(+l.strike_price).toFixed(2)}|${l.option_type}`).sort().join('+');
const cerr = new Map();
for (const c of ord.filter(o => o.closing_strategy === 'short_put')) {
  const k = clave(c); if (!cerr.has(k)) cerr.set(k, []); cerr.get(k).push(c);
}
let nCer = 0, plCer = 0, plCerSost = 0;
for (const d of detalle) {
  const k = `${d.exp}|${d.K.toFixed(2)}|put`;
  const c = cerr.get(k)?.shift(); if (!c) continue;
  nCer++;
  plCer += d.prima - (+c.processed_premium) - 0.06 * d.q;
  plCerSost += d.pl;
}
console.log(`  puts que recompraste : ${nCer}`);
console.log(`  lo que te dieron cerrando   : $${plCer.toFixed(0)}`);
console.log(`  lo que habrian dado sostenidas: $${plCerSost.toFixed(0)}`);
console.log(`  -> cerrar antes te ${plCer > plCerSost ? 'GANO' : 'COSTO'} $${Math.abs(plCer - plCerSost).toFixed(0)}`);

console.log('\n=== y las CALLS (lo que la autopsia dejo suelto) ===');
const calls = ord.filter(o => o.opening_strategy === 'short_call');
let plC = 0, colC = 0;
for (const o of calls) {
  const L = o.legs[0], q = +o.quantity, K = +L.strike_price, exp = L.expiration_date;
  const ST = cierre(exp); if (ST == null) continue;
  plC += (+o.processed_premium) - Math.max(ST - K, 0) * 100 * q - 0.03 * q;
  colC += K * 100 * q;
}
console.log(`  ${calls.length} calls vendidas, sostenidas a vencimiento: P&L $${plC.toFixed(0)}`);
console.log(`  (si estaban cubiertas con acciones, la perdida de la call es ganancia de la accion)`);

console.log('\n=== reparto por año ===');
const y = new Map();
for (const d of detalle) { const k = d.f.slice(0, 4); if (!y.has(k)) y.set(k, []); y.get(k).push(d); }
for (const [k, v] of [...y.entries()].sort()) {
  const p = v.reduce((s, x) => s + x.pl, 0), c = v.reduce((s, x) => s + x.col, 0);
  console.log(`   ${k}  n=${String(v.length).padStart(3)}  P&L sostenido $${p.toFixed(0).padStart(7)}  sobre colateral $${c.toFixed(0).padStart(9)}  = ${(p / c * 100).toFixed(2)}%`);
}
