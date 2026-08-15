// ¿LOS DÍAS QUE FALTAN POR COBERTURA DE CADENA SON LOS MALOS?
//
// El cóndor mide sobre 143 de 367 días con GEX positivo — al resto le faltan los strikes en el
// fichero descargado. Eso es un descarte del 61% que nadie estaba contando.
//
// Si los días sin cobertura son los de movimiento GRANDE, el cóndor está midiendo un mundo sin
// sus peores días y TODO el hallazgo (t=2,09 incluido) está inflado. Si el movimiento es igual
// en los dos grupos, el hueco es del descargador y no contamina el resultado.
//
// Esto se comprueba SIN saber el resultado del cóndor: sólo mira cuánto se movió el índice.

import { obs, mean, med } from './gex-lib-gex.mjs';

const ALA = 50, HORA = '11:00';
const porDiaHora = new Map();
for (const o of obs) porDiaHora.set(`${o.d} ${o.h}`, o);
const dias = [...new Set(obs.map((o) => o.d))].sort();

const atm = (o) => {
  let K = null, dif = Infinity;
  for (const k of o.calls.keys()) if (o.puts.has(k) && Math.abs(k - o.U) < dif) { dif = Math.abs(k - o.U); K = k; }
  return dif <= 10 ? K : null;
};

function cubre(o, sep) {
  const K = atm(o); if (K == null) return null;
  return o.calls.has(K + sep) && o.calls.has(K + sep + ALA) &&
         o.puts.has(K - sep) && o.puts.has(K - sep - ALA);
}

const resumen = (v) => v.length < 5 ? null : {
  n: v.length, media: mean(v), mediana: med(v),
  p90: [...v].sort((a, b) => a - b)[Math.floor(v.length * 0.9)],
};

console.log('═══ ¿SON LOS DÍAS SIN COBERTURA LOS DE MOVIMIENTO GRANDE? ═══\n');
console.log('movimiento = |cierre − índice a las 11:00|, en puntos. No sabe nada del cóndor.\n');

for (const [nombre, sepDe] of [
  ['±25 puntos fijos (lo que corre hoy)', () => 25],
  ['0,44% del índice', (o) => Math.max(5, Math.round((o.U * 0.44 / 100) / 5) * 5)],
]) {
  const con = [], sin = [];
  for (const d of dias) {
    const o = porDiaHora.get(`${d} ${HORA}`);
    if (!o || !(o.net1 > 0)) continue;
    const c = cubre(o, sepDe(o));
    if (c == null) continue;
    (c ? con : sin).push(100 * Math.abs(o.cierre - o.U) / o.U);   // EN % del índice, no en puntos
  }
  const a = resumen(con), b = resumen(sin);
  console.log(`── ${nombre}`);
  if (!a || !b) { console.log('   muestra insuficiente\n'); continue; }
  console.log(`   CON cadena  n=${String(a.n).padStart(3)} · movimiento medio ${a.media.toFixed(3)}% · mediana ${a.mediana.toFixed(3)}% · p90 ${a.p90.toFixed(3)}%`);
  console.log(`   SIN cadena  n=${String(b.n).padStart(3)} · movimiento medio ${b.media.toFixed(3)}% · mediana ${b.mediana.toFixed(3)}% · p90 ${b.p90.toFixed(3)}%`);
  const dif = b.media - a.media;
  console.log(`   diferencia: ${dif > 0 ? '+' : ''}${dif.toFixed(3)} puntos porcentuales en los que FALTAN`);
  console.log(`   → ${Math.abs(dif) < 0.05
    ? 'parecido: el hueco es del descargador, no contamina el resultado.'
    : dif > 0
      ? '⚠ LOS QUE FALTAN SE MUEVEN MÁS. El cóndor está midiendo un mundo sin sus peores días.'
      : 'los que faltan se mueven MENOS: el resultado estaría, si acaso, subestimado.'}\n`);
}

// ¿Y cuándo faltan? Si faltan sobre todo al principio o al final, además hay sesgo de época.
console.log('── ¿en qué años faltan? (±25 fijos)');
const porAnio = {};
for (const d of dias) {
  const o = porDiaHora.get(`${d} ${HORA}`);
  if (!o || !(o.net1 > 0)) continue;
  const c = cubre(o, 25);
  if (c == null) continue;
  const a = d.slice(0, 4);
  porAnio[a] ??= { con: 0, sin: 0 };
  porAnio[a][c ? 'con' : 'sin']++;
}
for (const [a, v] of Object.entries(porAnio).sort()) {
  const pct = 100 * v.con / (v.con + v.sin);
  console.log(`   ${a}: ${String(v.con).padStart(3)} con / ${String(v.sin).padStart(3)} sin  → cobertura ${pct.toFixed(0)}%`);
}
