// LA DERIVA DEL ±25 FIJO: ¿QUÉ ES LO QUE EMPEORA, EL CRÉDITO O EL ACIERTO?
//
// El informe del 2026-08-15 dijo que la estructura se deshincha porque vende a ±25 puntos fijos
// mientras el índice sube, y que por eso el crédito cayó de $1.165 a $600.
//
// LA MECÁNICA DE ESA EXPLICACIÓN ESTÁ AL REVÉS, y lo enseña la propia meseta por porcentaje:
//   0,28% del índice (más CERCA del dinero) → crédito mediano $960
//   0,52% del índice (más LEJOS)            → crédito mediano $595
// Vender más cerca del dinero paga MÁS, no menos. Si el ±25 fijo se ha ido acercando al dinero,
// el crédito debería SUBIR con los años, no bajar.
//
// Lo que la deriva sí tiene que empeorar es el ACIERTO: más cerca del dinero = te tocan más
// veces. Y eso es lo que se comprueba aquí, año a año, con el ±25 fijo:
//   · a qué % del índice equivalen esos 25 puntos,
//   · el acierto,
//   · el crédito.
//
// Uso: node scripts/gex-2026/gex-condor-deriva.mjs

import { obs, med, mean } from './gex-lib-gex.mjs';

const P = new Map();
for (const o of obs) P.set(`${o.d} ${o.h}`, o);
const dias = [...new Set(obs.map((o) => o.d))].sort();

const atm = (o) => {
  let K = null, d = Infinity;
  for (const k of o.calls.keys()) if (o.puts.has(k) && Math.abs(k - o.U) < d) { d = Math.abs(k - o.U); K = k; }
  return d <= 10 ? K : null;
};

function op(o, sep) {
  const K = atm(o); if (K == null) return null;
  const Kc = K + sep, Kp = K - sep;
  const c = o.calls.get(Kc), cA = o.calls.get(Kc + 50), p = o.puts.get(Kp), pA = o.puts.get(Kp - 50);
  if (!c || !cA || !p || !pA) return null;
  const cr = c.bid + p.bid - cA.ask - pA.ask;
  if (!(cr > 0.2) || cr > 50) return null;
  const S = o.cierre;
  const perd = Math.min(Math.max(S - Kc, 0), 50) + Math.min(Math.max(Kp - S, 0), 50);
  return { cr: cr * 100, ret: ((cr - perd) * 100 - 8 * 0.03) / 5000, tocado: perd > 0, U: o.U, pctSep: 100 * sep / o.U };
}

function porAnio(sepDe, nombre) {
  const a = {};
  for (const d of dias) {
    const o = P.get(`${d} 11:00`);
    if (!o || !(o.net1 > 0)) continue;
    const r = op(o, sepDe(o));
    if (!r) continue;
    (a[d.slice(0, 4)] ??= []).push(r);
  }
  console.log(`\n── ${nombre}`);
  console.log('  año     n    separación   acierto   crédito   nunca tocado   retorno');
  for (const [an, v] of Object.entries(a).sort()) {
    const pct = mean(v.map((x) => x.pctSep));
    const acierto = 100 * v.filter((x) => x.ret > 0).length / v.length;
    const intacto = 100 * v.filter((x) => !x.tocado).length / v.length;
    console.log(`  ${an}  ${String(v.length).padStart(4)}   ${pct.toFixed(3)}% del índice  ` +
                `${acierto.toFixed(0).padStart(4)}%   $${med(v.map((x) => x.cr)).toFixed(0).padStart(5)}   ` +
                `${intacto.toFixed(0).padStart(9)}%   ${(100 * mean(v.map((x) => x.ret))).toFixed(2).padStart(6)}%`);
  }
  return a;
}

console.log('¿QUÉ EMPEORA CON LA DERIVA — EL CRÉDITO O EL ACIERTO?\n');
console.log('"nunca tocado" = el índice cerró DENTRO de las dos cortas: el cóndor se cobra entero.');
console.log('Es la medida limpia de la deriva; el retorno mezcla el crédito con lo que se perdió.');

porAnio(() => 25, '±25 PUNTOS FIJOS (lo que corre hoy)');
porAnio((o) => Math.max(5, Math.round((o.U * 0.44 / 100) / 5) * 5), '0,44% DEL ÍNDICE (la re-especificación)');

// Y el contexto que explica el crédito de verdad: cuánto se movía el índice cada año.
console.log('\n── LO QUE SÍ MUEVE EL CRÉDITO: cuánto se mueve el índice');
const mv = {};
for (const d of dias) {
  const o = P.get(`${d} 11:00`);
  if (!o) continue;
  (mv[d.slice(0, 4)] ??= []).push(100 * Math.abs(o.cierre - o.U) / o.U);
}
console.log('  año     n    movimiento medio de 11:00 al cierre');
for (const [an, v] of Object.entries(mv).sort())
  console.log(`  ${an}  ${String(v.length).padStart(4)}   ${mean(v).toFixed(3)}%`);
