// NULO DE LA MEZCLA · tercera vuelta — ¿existe ALGUNA mezcla que sobreviva?
// Barrido completo: 7 pesos x 5 metricas de riesgo x las 2 direcciones del cruce.
import fs from 'node:fs';
import { listonT } from '../lib/barreraHallazgos.ts';

const CUENTA = 56389;
const filas = JSON.parse(fs.readFileSync('scripts/cache-theta/_nulo-mezcla-filas.json', 'utf8'));
const media = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const equity = (rs) => { let e = 1; for (const r of rs) e *= 1 + r; return e; };
const curva = (rs) => { let e = 1; const c = [1]; for (const r of rs) { e *= 1 + r; c.push(e); } return c; };
const mdd = (rs) => { const c = curva(rs); let p = c[0], m = 0; for (const v of c) { if (v > p) p = v; m = Math.max(m, 1 - v / p); } return m; };
const años = (f) => f.reduce((a, x) => a + x.dur, 0) / 365.25;
const cagr = (rs, f) => Math.pow(equity(rs), 1 / años(f)) - 1;
const colaq = (p) => (rs) => { const s = [...rs].sort((a, b) => a - b); return media(s.slice(0, Math.max(1, Math.round(rs.length * p)))); };
const S = (f, m) => f.map((x) => (1 - m) * x.rQqq + m * x.rPut);
const usd = (r) => '$' + Math.round(CUENTA * r).toLocaleString('es');
const pct = (x) => (100 * x).toFixed(2) + '%';

const MET = [
  { n: 'caida max', hereda: 'NO', f: mdd, mayorEsPeor: true },
  { n: '10% peor', hereda: '?', f: colaq(0.10), mayorEsPeor: false },
  { n: '5% peor', hereda: '+0,98', f: colaq(0.05), mayorEsPeor: false },
  { n: '2,5% peor', hereda: '?', f: colaq(0.025), mayorEsPeor: false },
  { n: 'peor semana', hereda: '+0,97', f: (rs) => Math.min(...rs), mayorEsPeor: false },
];
const casar = (f, obj, M, tasaSem = 0) => {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    const rr = f.map((x) => m * x.rQqq + (1 - m) * tasaSem);
    const peorQueObj = M.mayorEsPeor ? M.f(rr) < obj : M.f(rr) > obj;
    if (peorQueObj) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
};

const mitad = Math.floor(filas.length / 2);
const A = filas.slice(0, mitad), B = filas.slice(mitad);

for (const tasa of [0, 0.045]) {
  const sem = Math.pow(1 + tasa, 7 / 365.25) - 1;
  console.log('\n════ EFECTIVO AL ' + (100 * tasa).toFixed(1) + '%  ' + (tasa === 0 ? '(el mejor caso posible para la mezcla)' : '(lo que pagaron las letras 2023-2026)') + ' ════');
  console.log('  metrica      hereda │ ' + [0.3, 0.4, 0.5, 0.6, 0.7].map((m) => ('m=' + m).padStart(9)).join('') + '   │ cruce 1→2   cruce 2→1  SOBREVIVE');
  for (const M of MET) {
    let linea = '  ' + M.n.padEnd(12) + M.hereda.padStart(6) + ' │ ';
    for (const m of [0.3, 0.4, 0.5, 0.6, 0.7]) {
      const rm = S(filas, m);
      const w = casar(filas, M.f(rm), M, sem);
      const rb = filas.map((x) => w * x.rQqq + (1 - w) * sem);
      linea += usd(cagr(rm, filas) - cagr(rb, filas)).padStart(9);
    }
    // cruce con m=0,5
    const c = [];
    for (const [fit, test] of [[A, B], [B, A]]) {
      const w = casar(fit, M.f(S(fit, 0.5)), M, sem);
      const rm = S(test, 0.5), rb = test.map((x) => w * x.rQqq + (1 - w) * sem);
      c.push(cagr(rm, test) - cagr(rb, test));
    }
    linea += '   │ ' + usd(c[0]).padStart(9) + ' ' + usd(c[1]).padStart(10) + '   ' + (c[0] > 0 && c[1] > 0 ? 'SI' : 'NO');
    console.log(linea);
  }
}

console.log('\n════ LA COLA, EN CRUDO — cuanto se lleva la mezcla en el peor 5% de semanas ════');
{
  const orden = [...filas].sort((a, b) => a.rQqq - b.rQqq);
  const k = Math.round(filas.length * 0.05);
  const peores = orden.slice(0, k);
  const rm = peores.map((x) => 0.5 * x.rQqq + 0.5 * x.rPut);
  console.log('  n=' + k + ' semanas · QQQ medio ' + pct(media(peores.map((x) => x.rQqq))));
  for (const w of [0.5, 0.586, 0.721, 0.862]) {
    console.log('    indice al ' + (100 * w).toFixed(1).padStart(5) + '%: ' + pct(w * media(peores.map((x) => x.rQqq))).padStart(8) + '   |   mezcla 50/50: ' + pct(media(rm)));
  }
  console.log('  peor semana de QQQ: ' + pct(Math.min(...filas.map((x) => x.rQqq))) + ' · esa misma semana la mezcla: ' + pct(Math.min(...filas.map((x) => 0.5 * x.rQqq + 0.5 * x.rPut))));
  const peor5 = orden.slice(0, 5);
  console.log('  las 5 peores semanas de QQQ:');
  for (const x of peor5) console.log('    ' + x.fecha + ' QQQ ' + pct(x.rQqq).padStart(8) + ' · put ' + pct(x.rPut).padStart(8) + ' · mezcla ' + pct(0.5 * x.rQqq + 0.5 * x.rPut).padStart(8) + ' · indice al 86,2% ' + pct(0.862 * x.rQqq).padStart(8));
}

console.log('\n════ EL COSTE DE OPERAR ════');
{
  const n = filas.length / años(filas);
  console.log('  ' + n.toFixed(0) + ' operaciones/año · 316 en total');
  const horqUsd = filas.map((x) => (x.ask - x.bid) * 100);
  console.log('  horquilla pagada al VENDER (ask-bid, ya dentro del resultado): mediana $' + media(horqUsd).toFixed(2) + '/contrato');
  const brutoPrima = media(filas.map((x) => x.bid * 100));
  console.log('  prima bruta media $' + brutoPrima.toFixed(2) + '/contrato · perdida media por recompra $' + media(filas.map((x) => x.costo * 100)).toFixed(2));
  console.log('  neto medio $' + media(filas.map((x) => x.pnlPut)).toFixed(2) + '/contrato/semana');
}

console.log('\n════ PRUEBAS ════');
const PR = 40;
console.log('  declaradas: ' + PR + ' (7 pesos x 5 metricas + cruces + sensibilidades) → liston |t| = ' + listonT(PR).toFixed(2));
{
  const w = 0.862;
  const d = filas.map((x) => (0.5 * x.rQqq + 0.5 * x.rPut) - w * x.rQqq);
  const m = media(d), sd = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / (d.length - 1));
  console.log('  mezcla menos indice-casado-por-peor-semana: media ' + pct(m) + '/sem · t = ' + (m / (sd / Math.sqrt(d.length))).toFixed(2) + ' → ' + (Math.abs(m / (sd / Math.sqrt(d.length))) >= listonT(PR) ? 'PASA' : 'NO PASA'));
}
