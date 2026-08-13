// ¿La regla de HOOD es una estrategia o es HOOD?
//
// Misma regla en 21 subyacentes, 2020-2026. Y en vez de asumir la prima extra, se calcula
// la pregunta que de verdad importa:
//
//   RATIO DE EQUILIBRIO = cuanto tiene que estar sobrevalorada la opcion (IV/vol realizada)
//   para que la estrategia NO pierda dinero.
//
// Si el equilibrio de un ticker es 1,05 y el mercado paga 1,25, hay margen. Si el equilibrio
// es 1,30, no hay estrategia: se estaria apostando a mi estimacion de la prima, no al activo.
//
// Asi no hay que suponer nada sobre la prima de 2021-2024, que es lo que no puedo medir.

import fs from 'node:fs';
const S = process.argv[2];
const P = JSON.parse(fs.readFileSync(S + '/precios.json', 'utf8'));
const COMM = 0.03;

const N = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p; };
const d1f = (S0, K, T, v, r = 0.045) => (Math.log(S0 / K) + (r + v * v / 2) * T) / (v * Math.sqrt(T));
const putBS = (S0, K, T, v, r = 0.045) => T <= 0 ? Math.max(K - S0, 0)
  : K * Math.exp(-r * T) * N(-(d1f(S0, K, T, v, r) - v * Math.sqrt(T))) - S0 * N(-d1f(S0, K, T, v, r));
const dPut = (S0, K, T, v) => N(d1f(S0, K, T, v)) - 1;

function correr(bars, { deltaObj = -0.25, pasos = 2, ratio = 1.266, desde = '2020-06-01' } = {}) {
  const rv = i => { const n = 20; if (i - n < 0) return null; let s = 0, s2 = 0;
    for (let k = i - n + 1; k <= i; k++) { const r = Math.log(bars[k].c / bars[k - 1].c); s += r; s2 += r * r; }
    return Math.sqrt((s2 / n - (s / n) ** 2) * 252); };
  const ops = [];
  for (let i = 30; i + pasos < bars.length; ) {
    if (bars[i].d < desde) { i++; continue; }
    const v20 = rv(i); if (!v20) { i += pasos; continue; }
    const j = i + pasos;
    const dte = Math.max(1, Math.round((new Date(bars[j].d) - new Date(bars[i].d)) / 864e5));
    const S0 = bars[i].c, T = dte / 365, iv = v20 * ratio;
    const inc = S0 < 25 ? 0.5 : S0 < 200 ? 1 : 5;
    let K = null, mejor = 9;
    for (let k = Math.round(S0 * 0.55 / inc) * inc; k <= S0; k += inc) {
      const d = dPut(S0, k, T, iv); if (Math.abs(d - deltaObj) < mejor) { mejor = Math.abs(d - deltaObj); K = k; }
    }
    if (K == null) { i = j; continue; }
    const prima = putBS(S0, K, T, iv);
    if (prima <= 0.02) { i = j; continue; }
    const ST = bars[j].c;
    const pl = (prima - Math.max(K - ST, 0)) * 100 - COMM;
    ops.push({ d: bars[i].d, ret: pl / (K * 100), v20 });
    i = j;
  }
  return ops;
}

function met(ops, bars) {
  if (ops.length < 20) return null;
  let eq = 1, pico = 1, dd = 0;
  for (const o of ops) { eq *= (1 + o.ret); pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
  const dias = (new Date(ops[ops.length - 1].d) - new Date(ops[0].d)) / 864e5;
  return { n: ops.length, eq, dd, anual: (eq ** (365 / dias) - 1) * 100,
           win: ops.filter(o => o.ret > 0).length / ops.length };
}

// ratio de equilibrio: busqueda binaria sobre el anualizado
function equilibrio(bars) {
  let lo = 0.70, hi = 2.2;
  const f = r => { const m = met(correr(bars, { ratio: r }), bars); return m ? m.anual : -99; };
  if (f(hi) < 0) return null;
  for (let k = 0; k < 26; k++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; }
  return (lo + hi) / 2;
}

const tick = Object.keys(P);
console.log('=== LA MISMA REGLA (vender put a delta -0,25, 2 dias habiles) EN 21 SUBYACENTES ===');
console.log('   periodo 2020-06 -> 2026-08. "equilibrio" = cuanta prima extra hace falta para no perder.\n');
console.log('ticker    vol med   equilibrio   a 1,10   a 1,20   a 1,266   caida   comprar-y-manten');
const filas = [];
for (const t of tick) {
  const bars = P[t]; if (bars.length < 300) continue;
  const eqr = equilibrio(bars);
  const m10 = met(correr(bars, { ratio: 1.10 })), m20 = met(correr(bars, { ratio: 1.20 })), m26 = met(correr(bars, { ratio: 1.266 }));
  if (!m26) continue;
  const vols = correr(bars, {}).map(o => o.v20).sort((a, b) => a - b);
  const vmed = vols[Math.floor(vols.length / 2)];
  const b0 = bars.find(b => b.d >= '2020-06-01'), b1 = bars[bars.length - 1];
  const bhA = ((b1.c / b0.c) ** (365 / ((new Date(b1.d) - new Date(b0.d)) / 864e5)) - 1) * 100;
  filas.push({ t, vmed, eqr, a10: m10?.anual, a20: m20?.anual, a26: m26.anual, dd: m26.dd, bh: bhA });
}
filas.sort((a, b) => (a.eqr ?? 9) - (b.eqr ?? 9));
for (const f of filas)
  console.log(`${f.t.padEnd(8)} ${(f.vmed * 100).toFixed(0).padStart(4)}%     ` +
    `${f.eqr ? f.eqr.toFixed(3) : ' nunca'}      ${f.a10.toFixed(0).padStart(5)}%   ${f.a20.toFixed(0).padStart(5)}%   ` +
    `${f.a26.toFixed(0).padStart(5)}%   ${(f.dd * 100).toFixed(0).padStart(3)}%      ${f.bh.toFixed(0).padStart(5)}%/año`);

const conMargen = filas.filter(f => f.eqr && f.eqr < 1.15).length;
console.log(`\n${conMargen} de ${filas.length} tienen equilibrio por debajo de 1,15 (o sea, margen real).`);
