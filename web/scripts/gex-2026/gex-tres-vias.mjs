// LAS TRES VÍAS PARA CAPITALIZAR EL GEX.
//
// Lo único que el GEX predice de forma sólida es VOLATILIDAD, no dinero:
//   días GEX+ el índice se mueve 0,244%  ·  días GEX− se mueve 0,411%
//   cerca del muro 0,115% en la media hora siguiente  ·  lejos 0,176%
//
// VÍA 1 — como VETO sobre algo que ya gana (la put semanal de QQQ al 3%).
// VÍA 2 — cambiar el VEHÍCULO para que cobre lo que el GEX predice: cerca del dinero,
//          donde la prima es grande respecto a la horquilla, en vez de a delta 0,05.
// VÍA 3 — para el TAMAÑO: misma estructura, más contratos en días GEX+.
//
// Todo con cotizaciones reales de SPXW y UNA entrada por día.

import fs from 'node:fs';
import { obs, deltaCall, med, mean, COMM } from './gex-lib-gex.mjs';

const HORA = '11:00';
const stats = (r) => {
  if (r.length < 20) return null;
  const m = mean(r), sd = Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1));
  return { n: r.length, m, med: med(r), t: m / (sd / Math.sqrt(r.length)), win: r.filter(x => x > 0).length / r.length };
};
const fmt = (nom, s, extra = '') => s
  ? console.log(`${nom.padEnd(38)} n=${String(s.n).padStart(3)}  acierto ${(s.win * 100).toFixed(0).padStart(3)}%  media ${(s.m * 100).toFixed(2).padStart(7)}%  mediana ${(s.med * 100).toFixed(2).padStart(6)}%  t=${s.t.toFixed(2).padStart(5)}${Math.abs(s.t) > 2 ? ' <<<' : '    '}${extra}`)
  : console.log(`${nom.padEnd(38)} (muestra corta)`);

// una foto por día a la hora fija
const porDia = new Map();
for (const o of obs) if (o.h === HORA) porDia.set(o.d, o);
const dias = [...porDia.values()].sort((a, b) => a.d < b.d ? -1 : 1);
console.log(`${dias.length} días con foto a las ${HORA}  (${dias[0]?.d} a ${dias[dias.length - 1]?.d})\n`);

// ═══════════════════════════════════════════════════════════════════════════════
console.log('╔═══ VÍA 2 — CAMBIAR EL VEHÍCULO ═══╗');
console.log('   Si el GEX dice cuánto se va a mover, el instrumento tiene que cobrar el MOVIMIENTO,');
console.log('   no ser un billete de lotería. Se prueba al dinero, que es donde la prima es grande.\n');

function atm(o) {
  let K = null, dif = Infinity;
  for (const k of o.calls.keys()) if (o.puts.has(k) && Math.abs(k - o.U) < dif) { dif = Math.abs(k - o.U); K = k; }
  return (K != null && dif <= 10) ? K : null;
}

// (a) mariposa de hierro: vender la horquilla al dinero + comprar las alas. Riesgo definido.
function mariposa(o, ala) {
  const K = atm(o); if (K == null) return null;
  const c = o.calls.get(K), p = o.puts.get(K);
  const cAla = o.calls.get(K + ala), pAla = o.puts.get(K - ala);
  if (!c || !p || !cAla || !pAla) return null;
  const credito = c.mid + p.mid - cAla.mid - pAla.mid;
  if (!(credito > 0.5) || credito > ala) return null;
  const perdida = Math.min(Math.abs(o.cierre - K), ala);
  const pl = (credito - perdida) * 100 - 8 * COMM;      // 4 patas, entrada y salida
  return pl / (ala * 100);                               // riesgo = ala − crédito, se usa el ala
}

// (b) comprar la horquilla al dinero (largo de volatilidad)
function comprarStraddle(o) {
  const K = atm(o); if (K == null) return null;
  const c = o.calls.get(K), p = o.puts.get(K);
  if (!c || !p) return null;
  const coste = c.mid + p.mid;
  if (!(coste > 0.5)) return null;
  const valor = Math.abs(o.cierre - K);
  return ((valor - coste) * 100 - 4 * COMM) / (coste * 100);   // retorno sobre lo pagado
}

for (const ala of [25, 50]) {
  const todos = dias.map(o => ({ d: o.d, net: o.net1, r: mariposa(o, ala) })).filter(x => x.r != null);
  console.log(`── mariposa de hierro, alas a ${ala} puntos ──`);
  fmt('  sin filtro', stats(todos.map(x => x.r)));
  fmt('  solo GEX POSITIVO', stats(todos.filter(x => x.net > 0).map(x => x.r)));
  fmt('  solo GEX negativo', stats(todos.filter(x => x.net < 0).map(x => x.r)));
  console.log('');
}
{
  const todos = dias.map(o => ({ d: o.d, net: o.net1, r: comprarStraddle(o) })).filter(x => x.r != null);
  console.log('── COMPRAR la horquilla al dinero (largo de volatilidad) ──');
  fmt('  sin filtro', stats(todos.map(x => x.r)));
  fmt('  solo GEX POSITIVO', stats(todos.filter(x => x.net > 0).map(x => x.r)));
  fmt('  solo GEX NEGATIVO (el que se mueve)', stats(todos.filter(x => x.net < 0).map(x => x.r)));
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\n╔═══ VÍA 3 — EL TAMAÑO ═══╗');
console.log('   Misma estructura (spread delta 0,05, ancho 25), más contratos en días GEX+.\n');
function spread(o, dObj, ancho) {
  let corta = null, mejorD = 9;
  for (const [K, q] of o.calls) {
    if (K <= o.U) continue;
    const dl = deltaCall(o.U, K, o.T, q.iv);
    if (!(dl > 0.02) || dl > 0.6) continue;
    if (Math.abs(dl - dObj) < mejorD) { mejorD = Math.abs(dl - dObj); corta = { K, q }; }
  }
  if (!corta || mejorD > 0.04) return null;
  const larga = o.calls.get(corta.K + ancho); if (!larga) return null;
  const cr = corta.q.mid - larga.mid;
  if (!(cr > 0.05) || cr > ancho * 0.5) return null;
  const pl = (cr - Math.min(Math.max(o.cierre - corta.K, 0), ancho)) * 100 - 4 * COMM;
  return pl / (ancho * 100);
}
{
  const todos = dias.map(o => ({ net: o.net1, r: spread(o, 0.05, 25) })).filter(x => x.r != null);
  for (const [nom, mult] of [['1 contrato siempre', () => 1], ['2 si GEX+, 1 si GEX−', x => x.net > 0 ? 2 : 1], ['2 si GEX+, 0 si GEX−', x => x.net > 0 ? 2 : 0]]) {
    const r = todos.map(x => x.r * mult(x));
    const s = stats(r.filter((_, i) => mult(todos[i]) > 0));
    const total = r.reduce((a, b) => a + b, 0) * 25 * 100;
    console.log(`  ${nom.padEnd(24)} suma de P&L: $${Math.round(total).toLocaleString('es-ES').padStart(8)}   ${s ? `media ${(s.m * 100).toFixed(2)}%` : ''}`);
  }
}
