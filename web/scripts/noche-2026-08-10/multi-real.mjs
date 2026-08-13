// ¿Hay estrategia, o solo hubo HOOD? — la misma regla, cotizaciones REALES, varios tickers.
//
// Todo con las cuatro barreras. Se mide entrando al MEDIO (como opera Lester) y al BID
// (el peor caso). Y se compara siempre contra comprar y mantener el mismo activo, que es
// la alternativa de verdad.

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const S = process.argv[2];
const tickers = (process.argv[3] || 'HOOD,PLTR,COIN,SOFI').split(',');

const res = [];
for (const t of tickers) {
  const r = spawnSync(process.execPath, [S + '/una-real.mjs', S], {
    env: { ...process.env, SYM: t }, encoding: 'utf8', maxBuffer: 1 << 28,
  });
  if (r.status !== 0) { console.log(t, 'FALLO', (r.stderr || '').slice(0, 300)); continue; }
  try { res.push(JSON.parse(r.stdout)); } catch { console.log(t, 'salida rara:', r.stdout.slice(0, 300)); }
}

console.log('\n=== LA MISMA REGLA CON PRECIOS REALES (vender put ~delta -0,25, vencimiento a 2-6 dias) ===');
console.log('    2021-2026, sostenida a vencimiento, comisiones Robinhood, cotizaciones rotas fuera.\n');
console.log('ticker   n     acierto   AL MEDIO           AL BID          comprar-y-mantener');
console.log('                        anual   caida     anual   caida');
for (const r of res) {
  console.log(`${r.sym.padEnd(8)} ${String(r.n).padStart(3)}    ${(r.win * 100).toFixed(0).padStart(3)}%   ` +
    `${r.medio.anual.toFixed(1).padStart(7)}%  ${(r.medio.dd * 100).toFixed(0).padStart(3)}%    ` +
    `${r.bid.anual.toFixed(1).padStart(7)}%  ${(r.bid.dd * 100).toFixed(0).padStart(3)}%     ` +
    `${r.bh.anual.toFixed(1).padStart(7)}%/año  caida ${(r.bh.dd * 100).toFixed(0)}%`);
}

console.log('\n=== ¿mejora cerrar antes (objetivo de beneficio) en vez de sostener? ===');
console.log('    Lester recompraba el 47% de sus puts antes de vencer. Aqui se mide con el ASK real.\n');
console.log('ticker   sostener   TP 50%    TP 25%    TP 75%');
for (const r of res) {
  const f = x => x == null ? '   n/d' : (x.toFixed(1) + '%').padStart(7);
  console.log(`${r.sym.padEnd(8)} ${f(r.medio.anual)}  ${f(r.tp50)}  ${f(r.tp25)}  ${f(r.tp75)}`);
}

console.log('\n=== por año, al MEDIO ===');
const años = [...new Set(res.flatMap(r => Object.keys(r.porAño)))].sort();
console.log('ticker   ' + años.map(a => a.padStart(9)).join(''));
for (const r of res)
  console.log(r.sym.padEnd(8) + años.map(a => (r.porAño[a] != null ? r.porAño[a].toFixed(0) + '%' : '—').padStart(9)).join(''));
