// ¿EL CRÉDITO EN VIVO ES BAJO POR UN FALLO, O EL MERCADO PAGA ESO AHORA?
//
// El forward-test cobró $205, $410 y $335 los días 11, 12 y 13 de agosto de 2026, y el backtest
// dice $725 de mediana. La caché de cadenas llega al 2026-08-10, así que no se pueden cruzar esos
// tres días — pero sí se puede ver qué pagaba el mercado en los días INMEDIATAMENTE ANTERIORES.
//
// Si el 10 de agosto ya pagaba ~$300, el crédito en vivo es el mercado y no hay fallo.
// Si el 10 de agosto pagaba $700 y al día siguiente $205, hay que mirar la tubería.
//
// Uso: node scripts/gex-2026/gex-condor-ultimos-dias.mjs

import { obs, med } from './gex-lib-gex.mjs';

const P = new Map();
for (const o of obs) P.set(`${o.d} ${o.h}`, o);
const dias = [...new Set(obs.map((o) => o.d))].sort();

const atm = (o) => {
  let K = null, d = Infinity;
  for (const k of o.calls.keys()) if (o.puts.has(k) && Math.abs(k - o.U) < d) { d = Math.abs(k - o.U); K = k; }
  return d <= 10 ? K : null;
};
const credito = (o) => {
  const K = atm(o); if (K == null) return null;
  const c = o.calls.get(K + 25), cA = o.calls.get(K + 75), p = o.puts.get(K - 25), pA = o.puts.get(K - 75);
  return (c && cA && p && pA) ? (c.bid + p.bid - cA.ask - pA.ask) * 100 : null;
};

console.log('CÓNDOR ±25 ALAS 50 A LAS 11:00 — los últimos días que hay en caché\n');
console.log('día          GEX    índice    crédito    cierre−11:00');
for (const d of dias.slice(-18)) {
  const o = P.get(`${d} 11:00`);
  if (!o) { console.log(`${d}   (sin foto a las 11:00)`); continue; }
  const cr = credito(o);
  console.log(`${d}   ${o.net1 > 0 ? 'POS' : 'neg'}  ${o.U.toFixed(0).padStart(7)}   ` +
              `${cr == null ? ' sin cadena' : ('$' + cr.toFixed(0)).padStart(8)}   ${(o.cierre - o.U).toFixed(0).padStart(6)} pts`);
}

// Mediana por mes de 2026, sólo días GEX+: enseña si el deshinchado es gradual o de golpe.
console.log('\nMEDIANA DEL CRÉDITO POR MES (días con GEX positivo):\n');
const porMes = {};
for (const d of dias) {
  const o = P.get(`${d} 11:00`);
  if (!o || !(o.net1 > 0)) continue;
  const cr = credito(o);
  if (cr == null) continue;
  (porMes[d.slice(0, 7)] ??= []).push(cr);
}
for (const [mes, v] of Object.entries(porMes).sort()) {
  const m = med(v);
  const barra = '█'.repeat(Math.max(1, Math.round(m / 60)));
  console.log(`  ${mes}  n=${String(v.length).padStart(3)}  $${m.toFixed(0).padStart(5)}  ${barra}`);
}

console.log('\nEN VIVO: 2026-08-11 $205 · 2026-08-12 $410 · 2026-08-13 $335');
const ult = porMes['2026-08'];
if (ult?.length) {
  console.log(`Agosto en caché (hasta el día 10): n=${ult.length} · mediana $${med(ult).toFixed(0)} · ` +
              `mínimo $${Math.min(...ult).toFixed(0)} · máximo $${Math.max(...ult).toFixed(0)}`);
}
