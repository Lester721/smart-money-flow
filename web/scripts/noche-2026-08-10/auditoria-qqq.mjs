// AUDITORÍA COMPLETA del backtest de la put semanal de QQQ.
//
// La auditoría anterior miraba la DISTRIBUCIÓN del resultado (colas, media vs mediana,
// castigos de ejecución) y no vio el look-ahead, porque el look-ahead no está en la
// distribución: está en la PROCEDENCIA de cada dato. Esta empieza por ahí.

import fs from 'node:fs';
import { res, met, med, cierreEOD } from './intradia-lib.mjs';
const S = process.argv[2];
const HORA = '12:00';
const o = res.get(HORA);
const P = JSON.parse(fs.readFileSync(S + '/precios.json', 'utf8')).QQQ;
const px = new Map(P.map(b => [b.d, b.c]));

console.log(`=== AUDITORÍA — put semanal QQQ 3%, entrada ${HORA} ===\n`);

// ─── A. PROCEDENCIA ───────────────────────────────────────────────────────────
console.log('A. PROCEDENCIA — ¿cada dato existía al decidir?\n');

// A.1 el spot y la cotización salen del mismo feed y la misma etiqueta
const g = fs.readFileSync(`${S}/theta-griegas/QQQ_${o[10].rolo}.csv`, 'utf8').split('\n');
const gh = g[0].split(','), gT = gh.indexOf('timestamp'), gC = gh.indexOf('close');
const spotG = g.slice(1).find(l => l.split(',')[gT]?.slice(11, 16) === HORA)?.split(',')[gC];
console.log(`  A.1 spot y cotización, mismo feed (griegas de opciones) y misma etiqueta`);
console.log(`      ${o[10].rolo} ${HORA}: spot usado ${o[10].S0.toFixed(2)} · en el fichero crudo ${spotG}`);
console.log(`      ${Math.abs(+spotG - o[10].S0) < 0.01 ? '      OK' : '      ✗ NO CUADRA'}`);

// A.2 ¿el precio de SALIDA estaba disponible al cierre del viernes de vencimiento?
console.log(`\n  A.2 el precio de RECOMPRA sale del fichero EOD, sellado FUERA de mercado (17:22).`);
const conRecompra = o.filter(x => x.ST < x.K);
console.log(`      afecta a ${conRecompra.length} de ${o.length} operaciones (${Math.round(conRecompra.length / o.length * 100)}%) — las que acaban dentro del dinero.`);
console.log(`      Se mide abajo cuánto cambia el resultado si esa recompra fuese un 20% más cara.`);

// A.3 reproducir UNA operación a mano
const m0 = o.find(x => x.ST < x.K && x.rolo > '2024-01-01');
console.log(`\n  A.3 reproducción a mano de una operación con recompra:`);
console.log(`      viernes ${m0.rolo}, QQQ a ${m0.S0.toFixed(2)} → 3% abajo = ${(m0.S0 * 0.97).toFixed(2)} → strike listado ${m0.K}`);
console.log(`      cobro (punto medio a las ${HORA}) = $${(m0.cobro * 100).toFixed(0)}`);
console.log(`      el ${m0.exp} QQQ cerró en ${m0.ST.toFixed(2)} → por debajo de ${m0.K}, se recompra`);
console.log(`      P&L declarado $${(m0.ret * m0.K * 100).toFixed(0)} sobre colateral $${(m0.K * 100).toFixed(0)} = ${(m0.ret * 100).toFixed(3)}%`);
const cierreReal = px.get(m0.exp);
console.log(`      control: cierre de QQQ el ${m0.exp} según la serie diaria = ${cierreReal} ${Math.abs(cierreReal - m0.ST) < 0.01 ? '(cuadra)' : '(✗ NO CUADRA)'}`);

// ─── B. MUESTRA ───────────────────────────────────────────────────────────────
console.log('\n\nB. MUESTRA\n');
const todosViernes = [];
{ const d = new Date(Date.UTC(2020, 0, 3));
  while (d < new Date(Date.UTC(2026, 7, 1))) { todosViernes.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 7); } }
const dentro = new Set(o.map(x => x.rolo));
const fuera = todosViernes.slice(0, -1).filter(f => !dentro.has(f));
console.log(`  B.1 cobertura: ${o.length} de ${todosViernes.length - 1} viernes posibles (${Math.round(o.length / (todosViernes.length - 1) * 100)}%)`);
console.log(`      viernes que se cayeron: ${fuera.length}`);
console.log(`      ${fuera.join(', ')}`);
// ¿la semana siguiente a un viernes ausente fue mala? (sesgo de supervivencia)
const movFuera = fuera.map(f => {
  const i = P.findIndex(b => b.d >= f); if (i < 0 || i + 5 >= P.length) return null;
  return P[i + 5].c / P[i].c - 1;
}).filter(x => x != null);
const movDentro = o.map(x => x.ST / x.S0 - 1);
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
console.log(`\n  B.2 ¿faltan las semanas malas? (sesgo de supervivencia)`);
console.log(`      movimiento medio del QQQ en las semanas AUSENTES : ${(mean(movFuera) * 100).toFixed(2)}%`);
console.log(`      movimiento medio en las semanas PRESENTES        : ${(mean(movDentro) * 100).toFixed(2)}%`);
console.log(`      peor semana ausente ${(Math.min(...movFuera) * 100).toFixed(1)}%  ·  peor presente ${(Math.min(...movDentro) * 100).toFixed(1)}%`);
console.log(`      ${Math.abs(mean(movFuera) - mean(movDentro)) < 0.01 ? 'OK — las ausentes no son sistemáticamente mejores' : '⚠ REVISAR'}`);

// B.3 solapes
let solape = 0;
for (let i = 1; i < o.length; i++) if (o[i].rolo < o[i - 1].exp) solape++;
console.log(`\n  B.3 solapes (operaciones que comparten capital sin decirlo): ${solape} ${solape === 0 ? 'OK' : '✗'}`);

// B.4 mismas filas en las comparaciones
const n16 = res.get('16:00').length;
console.log(`  B.4 la fila del cierre tiene ${n16} operaciones y la de ${HORA} ${o.length} ${n16 === o.length ? 'OK — mismas semanas' : '✗ muestras distintas'}`);

// ─── C. ROBUSTEZ ──────────────────────────────────────────────────────────────
console.log('\n\nC. ROBUSTEZ\n');
const m = met(o);
console.log(`  base: ${m.anual.toFixed(1)}%/año · caída ${(m.dd * 100).toFixed(0)}% · acierto ${(m.win * 100).toFixed(0)}%`);
const parte = (a, b) => { const s = o.filter(x => x.rolo >= a && x.rolo <= b); const mm = met(s); return `${mm.anual.toFixed(1)}% (n=${mm.n}, caída ${(mm.dd * 100).toFixed(0)}%)`; };
console.log(`  C.1 partida:  2020-2022 → ${parte('2020-01-01', '2022-12-31')}   ·   2023-2026 → ${parte('2023-01-01', '2099')}`);
const sinTop = q => { const s = [...o].sort((a, b) => b.ret - a.ret).slice(Math.floor(o.length * q)).sort((a, b) => a.rolo < b.rolo ? -1 : 1); return met(s).anual.toFixed(1); };
console.log(`  C.2 sin el 1% mejor ${sinTop(0.01)}%  ·  sin el 5% ${sinTop(0.05)}%  ·  sin el 10% ${sinTop(0.10)}%`);
const r = o.map(x => x.ret);
console.log(`  C.3 media ${(mean(r) * 100).toFixed(3)}%  ·  mediana ${(med(r) * 100).toFixed(3)}%  ${med(r) >= mean(r) ? 'OK — la mediana manda, no vive de la cola' : '⚠ la media supera a la mediana'}`);
// castigos de ejecución
const castigo = (pctPrima, pctRecompra) => {
  let eq = 1;
  for (const x of o) {
    let ret = x.ret;
    ret -= x.cobro * pctPrima / x.K;                       // te llenan peor al vender
    if (x.ST < x.K) ret -= Math.max(x.K - x.ST, 0) * pctRecompra / x.K;  // y peor al recomprar
    eq *= (1 + ret);
  }
  const años = (new Date(o[o.length - 1].exp) - new Date(o[0].rolo)) / 365 / 864e5;
  return ((eq ** (1 / años) - 1) * 100).toFixed(1);
};
console.log(`  C.4 castigos de ejecución:`);
console.log(`      −10% de prima          → ${castigo(0.10, 0)}%/año`);
console.log(`      −20% de prima          → ${castigo(0.20, 0)}%/año`);
console.log(`      −20% prima Y +20% recompra → ${castigo(0.20, 0.20)}%/año   ← el escenario feo`);
console.log(`  C.5 meseta de la hora (no es un pico):`);
console.log(`      ${['10:00','11:00','12:00','13:00','14:00','15:00'].map(h => `${h} ${met(res.get(h)).anual.toFixed(1)}%`).join(' · ')}`);

// ─── D. PRESENTACIÓN ──────────────────────────────────────────────────────────
console.log('\n\nD. CONTRA LA ALTERNATIVA REAL\n');
const ref = (s) => {
  const A = JSON.parse(fs.readFileSync(S + '/precios.json', 'utf8'))[s].filter(b => b.d >= o[0].rolo);
  let pk = 0, dd = 0; for (const b of A) { pk = Math.max(pk, b.c); dd = Math.max(dd, 1 - b.c / pk); }
  const años = (new Date(A[A.length - 1].d) - new Date(A[0].d)) / 365 / 864e5;
  return { an: ((A[A.length - 1].c / A[0].c) ** (1 / años) - 1) * 100, dd: dd * 100, años };
};
const spy = ref('SPY'), qqq = ref('QQQ');
console.log(`  put semanal QQQ 3% @ ${HORA} : ${m.anual.toFixed(1)}%/año · caída ${(m.dd * 100).toFixed(0)}%`);
console.log(`  comprar SPY                 : ${spy.an.toFixed(1)}%/año · caída ${spy.dd.toFixed(0)}%   (sin dividendos: el real es ~1,3 pts más)`);
console.log(`  comprar QQQ                 : ${qqq.an.toFixed(1)}%/año · caída ${qqq.dd.toFixed(0)}%`);
console.log('');
const cap = 60000;
console.log(`  sobre $${cap.toLocaleString()} en ${spy.años.toFixed(1)} años:`);
console.log(`     put semanal → $${(cap * (1 + m.anual / 100) ** spy.años).toFixed(0)}`);
console.log(`     SPY         → $${(cap * (1 + spy.an / 100) ** spy.años).toFixed(0)}`);
console.log(`     QQQ         → $${(cap * (1 + qqq.an / 100) ** spy.años).toFixed(0)}`);
console.log(`  al año: put semanal ~$${(cap * m.anual / 100).toFixed(0)} · SPY ~$${(cap * spy.an / 100).toFixed(0)}`);
