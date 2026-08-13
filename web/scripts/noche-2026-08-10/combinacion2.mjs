// LA COMBINACIÓN, esta vez con la pieza buena.
//
// La primera prueba de combinación mezclaba puts MENSUALES AL DINERO (23-30% de caída) con
// comprar el índice. Con esas piezas, mezclar solo diluía: comprar QQQ ganaba a todo.
//
// Pero la pieza que sobrevivió a la auditoría es otra: la put SEMANAL al 3%, que tiene
// 13,5%/año con 7% de caída. Esa nunca la mezclé. Y nunca miré lo único que decide si
// mezclar sirve: la CORRELACIÓN entre las dos piezas.
//
// Todo sobre la MISMA rejilla semanal, las MISMAS semanas, sin solapes.

import fs from 'node:fs';
import { res, met, med } from './intradia-lib.mjs';
const S = process.argv[2];
const HORA = '12:00';
const put = res.get(HORA);
const P = JSON.parse(fs.readFileSync(S + '/precios.json', 'utf8'));

// Retorno del índice EXACTAMENTE en la misma semana que cada operación de put:
// del cierre del viernes de entrada al cierre del viernes de vencimiento.
const px = (s) => new Map(P[s].map(b => [b.d, b.c]));
const pQ = px('QQQ'), pS = px('SPY');
const cerca = (m, d) => { for (let k = 0; k < 8; k++) { const x = new Date(new Date(d) - k * 864e5).toISOString().slice(0, 10); if (m.has(x)) return m.get(x); } return null; };

// REJILLA COMPLETA de viernes, no solo los que tienen operación.
//
// Primero lo hice sobre las 315 semanas con operación y el índice salía a 10,9%/año cuando en
// la auditoría daba 20,3%. El motivo: al saltarme las 28 semanas de festivo me saltaba TAMBIÉN
// el retorno del índice en ellas — y resulta que el QQQ subió +1,82% de media justo en esas.
// Comprar y mantener no se salta los festivos; la put sí (no hay vencimiento que vender).
//
// Lo correcto: todas las semanas. En las que no hay operación, la pata de put está en EFECTIVO
// (retorno 0, conservador: en realidad cobraría el tipo de las letras) y el índice rinde lo que
// rindió.
const todos = [];
{ const d = new Date(Date.UTC(2020, 0, 3));
  while (d < new Date(Date.UTC(2026, 7, 25))) { todos.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 7); } }
const porRolo = new Map(put.map(o => [o.rolo, o]));
const semanas = [];
let sinOp = 0;
for (let i = 0; i < todos.length - 1; i++) {
  const a = todos[i], b = todos[i + 1];
  const q0 = cerca(pQ, a), q1 = cerca(pQ, b), s0 = cerca(pS, a), s1 = cerca(pS, b);
  if (q0 == null || q1 == null || s0 == null || s1 == null) continue;
  const o = porRolo.get(a);
  if (!o) sinOp++;
  semanas.push({ rolo: a, exp: b, put: o ? o.ret : 0, hayOp: !!o, qqq: q1 / q0 - 1, spy: s1 / s0 - 1 });
}
console.log(`=== ${semanas.length} semanas, ${semanas[0].rolo} a ${semanas[semanas.length - 1].exp} ===`);
console.log(`    ${semanas.length - sinOp} con operación de put · ${sinOp} en efectivo (festivos, sin vencimiento que vender)\n`);

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const corr = (a, b) => { const ma = mean(a), mb = mean(b);
  return a.reduce((s, _, i) => s + (a[i] - ma) * (b[i] - mb), 0) / ((a.length - 1) * sd(a) * sd(b)); };

const rPut = semanas.map(x => x.put), rQ = semanas.map(x => x.qqq), rS = semanas.map(x => x.spy);

console.log('1. CORRELACIÓN — lo que decide si mezclar sirve de algo\n');
console.log(`   put semanal vs comprar QQQ : ${corr(rPut, rQ).toFixed(3)}`);
console.log(`   put semanal vs comprar SPY : ${corr(rPut, rS).toFixed(3)}`);
console.log(`   comprar QQQ vs comprar SPY : ${corr(rQ, rS).toFixed(3)}`);
console.log(`\n   Si fuese 1,00 mezclar no serviría de nada. Cuanto más baja, más aporta la mezcla.`);

// ¿de dónde sale la descorrelación? separando semanas de subida y de bajada
const sube = semanas.filter(x => x.qqq > 0), baja = semanas.filter(x => x.qqq <= 0);
console.log(`\n   semanas que el QQQ SUBE (${sube.length}): put ${(mean(sube.map(x => x.put)) * 100).toFixed(3)}%  ·  QQQ ${(mean(sube.map(x => x.qqq)) * 100).toFixed(2)}%`);
console.log(`   semanas que el QQQ BAJA (${baja.length}): put ${(mean(baja.map(x => x.put)) * 100).toFixed(3)}%  ·  QQQ ${(mean(baja.map(x => x.qqq)) * 100).toFixed(2)}%`);

function medir(w, activo = 'qqq') {
  let eq = 1, pico = 1, dd = 0; const rs = [];
  for (const s of semanas) { const r = w * s.put + (1 - w) * s[activo]; rs.push(r); eq *= (1 + r); pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
  const años = (new Date(semanas[semanas.length - 1].exp) - new Date(semanas[0].rolo)) / 365 / 864e5;
  const an = (eq ** (1 / años) - 1) * 100;
  return { an, dd: dd * 100, rd: an / (dd * 100), sharpe: mean(rs) / sd(rs) * Math.sqrt(52), eq, años, rs };
}
const fila = (n, m) => console.log(`${n.padEnd(34)} ${m.an.toFixed(1).padStart(6)}%/año  caída ${m.dd.toFixed(0).padStart(3)}%  ret/caída ${m.rd.toFixed(2)}  Sharpe ${m.sharpe.toFixed(2)}`);

console.log('\n\n2. MEZCLA — parte en la put semanal, parte comprando QQQ\n');
for (const w of [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) fila(`  ${Math.round(w * 100)}% put / ${Math.round((1 - w) * 100)}% QQQ`, medir(w));
console.log('\n   con SPY en vez de QQQ:');
for (const w of [0, 0.3, 0.5, 0.7, 1]) fila(`  ${Math.round(w * 100)}% put / ${Math.round((1 - w) * 100)}% SPY`, medir(w, 'spy'));

// la mejor por ret/caída y por Sharpe
let mejorRD = null, mejorSh = null;
for (let w = 0; w <= 1.0001; w += 0.05) { const m = medir(w);
  if (!mejorRD || m.rd > mejorRD.m.rd) mejorRD = { w, m };
  if (!mejorSh || m.sharpe > mejorSh.m.sharpe) mejorSh = { w, m }; }
console.log(`\n   mejor por retorno/caída: ${Math.round(mejorRD.w * 100)}% put  (${mejorRD.m.an.toFixed(1)}%/año, caída ${mejorRD.m.dd.toFixed(0)}%)`);
console.log(`   mejor por Sharpe       : ${Math.round(mejorSh.w * 100)}% put  (${mejorSh.m.an.toFixed(1)}%/año, caída ${mejorSh.m.dd.toFixed(0)}%)`);

// ─── AUDITORÍA de la mezcla, antes de decir nada ──────────────────────────────
console.log('\n\n3. AUDITORÍA DE LA MEZCLA\n');
const W = mejorSh.w;
const parte = (a, b) => {
  const sub = semanas.filter(x => x.rolo >= a && x.rolo <= b);
  let eq = 1, pico = 1, dd = 0;
  for (const s of sub) { const r = W * s.put + (1 - W) * s.qqq; eq *= (1 + r); pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
  const años = (new Date(sub[sub.length - 1].exp) - new Date(sub[0].rolo)) / 365 / 864e5;
  return `${((eq ** (1 / años) - 1) * 100).toFixed(1)}% (n=${sub.length}, caída ${(dd * 100).toFixed(0)}%)`;
};
console.log(`   3.1 partida (mezcla ${Math.round(W * 100)}/${Math.round((1 - W) * 100)}):`);
console.log(`       2020-2022 → ${parte('2020-01-01', '2022-12-31')}`);
console.log(`       2023-2026 → ${parte('2023-01-01', '2099')}`);

console.log(`\n   3.2 ¿la mezcla ganadora es un pico o una meseta?`);
const barrido = [];
for (let w = 0.3; w <= 0.9001; w += 0.1) barrido.push(`${Math.round(w * 100)}%→${medir(w).sharpe.toFixed(2)}`);
console.log(`       Sharpe por peso: ${barrido.join(' · ')}`);

console.log(`\n   3.3 castigo de ejecución sobre la pata de put (−20% de prima):`);
{
  const semC = semanas.map((s) => {
    const o = porRolo.get(s.rolo);
    return o ? { ...s, put: s.put - Math.abs(o.cobro * 0.20 / o.K) } : s;
  });
  let eq = 1, pico = 1, dd = 0;
  for (const s of semC) { const r = W * s.put + (1 - W) * s.qqq; eq *= (1 + r); pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
  const años = (new Date(semanas[semanas.length - 1].exp) - new Date(semanas[0].rolo)) / 365 / 864e5;
  console.log(`       ${((eq ** (1 / años) - 1) * 100).toFixed(1)}%/año, caída ${(dd * 100).toFixed(0)}%`);
}

console.log(`\n   3.4 año a año`);
const y = new Map();
semanas.forEach((s, i) => { const k = s.rolo.slice(0, 4); if (!y.has(k)) y.set(k, []); y.get(k).push(i); });
console.log(`       año     mezcla ${Math.round(W * 100)}/${Math.round((1 - W) * 100)}    solo put    comprar QQQ   comprar SPY`);
for (const [k, idxs] of [...y.entries()].sort()) {
  const acc = f => ((idxs.reduce((e, i) => e * (1 + f(semanas[i])), 1) - 1) * 100).toFixed(1).padStart(7);
  console.log(`       ${k}    ${acc(s => W * s.put + (1 - W) * s.qqq)}%    ${acc(s => s.put)}%    ${acc(s => s.qqq)}%    ${acc(s => s.spy)}%`);
}

console.log('\n\n4. SOBRE $60.000\n');
const cap = 60000, años = medir(0).años;
for (const [n, m] of [[`mezcla ${Math.round(W * 100)}/${Math.round((1 - W) * 100)}`, medir(W)], ['solo put semanal', medir(1)], ['comprar QQQ', medir(0)], ['comprar SPY', medir(0, 'spy')]])
  console.log(`   ${n.padEnd(22)} → $${(cap * m.eq).toFixed(0).padStart(8)}   (${m.an.toFixed(1)}%/año, peor caída ${m.dd.toFixed(0)}% = -$${(cap * m.dd / 100).toFixed(0)})`);
