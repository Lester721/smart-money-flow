// LA PREGUNTA DE LESTER: ¿que patron te habria avisado de cuando usar la estrategia?
//
// La tabla por año lo grita: 2023 y 2024 buenos para casi todos los tickers, 2022 y 2026
// malos para casi todos. No es el activo, es el MERCADO. Vender puts es una posicion
// alcista disfrazada, y cobra cuando el mercado sube.
//
// Aqui se prueba, con las operaciones REALES ya calculadas (bid/ask de ThetaData):
//   1. cartera de los 7 tickers a la vez, sin filtro
//   2. la misma, entrando SOLO cuando el SPY esta sobre su media de 200 dias
//   3. la misma, entrando SOLO cuando el propio ticker esta sobre su media de 200
//   4. las dos a la vez
// y siempre contra comprar y mantener el SPY, que es su alternativa de verdad.

import fs from 'node:fs';
const S = process.argv[2];
const P = JSON.parse(fs.readFileSync(S + '/precios.json', 'utf8'));
const TICK = ['HOOD', 'PLTR', 'COIN', 'SOFI', 'MARA', 'RBLX', 'DKNG'];

// mercado: SPY sobre su media de 200
const spy = P.SPY;
const spyMA = new Map();
for (let i = 200; i < spy.length; i++) {
  const m = spy.slice(i - 199, i + 1).reduce((s, b) => s + b.c, 0) / 200;
  spyMA.set(spy[i].d, spy[i].c > m);
}
const alcista = d => { for (let k = 0; k < 8; k++) { const x = new Date(new Date(d) - k * 864e5).toISOString().slice(0, 10); if (spyMA.has(x)) return spyMA.get(x); } return null; };

const ops = [];
for (const t of TICK) {
  const f = S + `/ops-${t}.json`; if (!fs.existsSync(f)) { console.log('falta', t); continue; }
  for (const o of JSON.parse(fs.readFileSync(f, 'utf8'))) ops.push({ ...o, t });
}
ops.sort((a, b) => a.d < b.d ? -1 : 1);
console.log(`${ops.length} operaciones reales, ${TICK.length} tickers, ${ops[0].d} a ${ops[ops.length - 1].d}\n`);

// Cartera: capital repartido en N ranuras. Cada operacion toma 1/N del capital como colateral.
// Es la forma honesta de comparar con comprar el indice: mismo dinero, no "por operacion".
function cartera(sel, N = TICK.length) {
  const usados = ops.filter(sel);
  if (usados.length < 20) return null;
  // equity diaria
  const porDia = new Map();
  for (const o of usados) { if (!porDia.has(o.fSal)) porDia.set(o.fSal, []); porDia.get(o.fSal).push(o); }
  const fechas = [...porDia.keys()].sort();
  let eq = 1, pico = 1, dd = 0;
  for (const f of fechas) {
    for (const o of porDia.get(f)) eq *= (1 + o.ret / N);
    pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico);
  }
  const años = (new Date(fechas[fechas.length - 1]) - new Date(usados[0].d)) / 365 / 864e5;
  return { n: usados.length, eq, dd, anual: (eq ** (1 / años) - 1) * 100,
           win: usados.filter(o => o.ret > 0).length / usados.length, años };
}
const fmt = (nom, r) => r ? console.log(`${nom.padEnd(42)} n=${String(r.n).padStart(4)}  acierto ${(r.win * 100).toFixed(0)}%  ` +
  `ANUAL ${r.anual.toFixed(1).padStart(6)}%  caida ${(r.dd * 100).toFixed(0).padStart(3)}%  x${r.eq.toFixed(2)}`) : console.log(nom, '(pocas)');

console.log('=== CARTERA DE 7 TICKERS — capital repartido en 7 ranuras ===\n');
fmt('1. sin filtro (vender siempre)', cartera(() => true));
fmt('2. solo si SPY > su media de 200', cartera(o => alcista(o.d) === true));
fmt('3. solo si el TICKER > su media de 200', cartera(o => o.sobreMA200 === true));
fmt('4. las dos a la vez', cartera(o => alcista(o.d) === true && o.sobreMA200 === true));
fmt('5. al reves: SPY BAJO su media de 200', cartera(o => alcista(o.d) === false));

console.log('\n--- ¿y si el filtro decide, no descarta? por año, filtro 4 ---');
const y = new Map();
for (const o of ops) { const k = o.d.slice(0, 4); if (!y.has(k)) y.set(k, []); y.get(k).push(o); }
console.log('año    sin filtro      con SPY>MA200    con las dos     SPY (comprar)');
for (const [k, v] of [...y.entries()].sort()) {
  const c = (sel) => { const u = v.filter(sel); if (!u.length) return null; let e = 1; for (const o of u) e *= (1 + o.ret / TICK.length); return (e - 1) * 100; };
  const sp = spy.filter(b => b.d.startsWith(k));
  console.log(`${k}   ${(c(() => true)?.toFixed(1) ?? '—').padStart(7)}%      ` +
    `${(c(o => alcista(o.d) === true)?.toFixed(1) ?? 'fuera').padStart(7)}%       ` +
    `${(c(o => alcista(o.d) === true && o.sobreMA200 === true)?.toFixed(1) ?? 'fuera').padStart(7)}%      ` +
    `${((sp[sp.length - 1].c / sp[0].c - 1) * 100).toFixed(1).padStart(7)}%`);
}

// referencia: SPY comprado y mantenido en el mismo periodo
const s0 = spy.find(b => b.d >= ops[0].d), s1 = spy[spy.length - 1];
let pico = 0, ddS = 0;
for (const b of spy.filter(b => b.d >= s0.d)) { pico = Math.max(pico, b.c); ddS = Math.max(ddS, 1 - b.c / pico); }
const añosS = (new Date(s1.d) - new Date(s0.d)) / 365 / 864e5;
console.log(`\nREFERENCIA — comprar y mantener SPY el mismo periodo: ${(((s1.c / s0.c) ** (1 / añosS) - 1) * 100).toFixed(1)}%/año, caida maxima ${(ddS * 100).toFixed(0)}%`);
console.log('(sin dividendos: el real es ~1,3 puntos mas)');
