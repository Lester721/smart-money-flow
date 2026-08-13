// LA COMBINACION. Lo que Lester pidio hace semanas y quedo pendiente.
//
// De todo lo medido, dos cosas sobreviven a los precios reales:
//   A) comprar el indice — gana mas, pero se come la caida entera
//   B) vender puts AL DINERO mensuales sobre el indice, colateral en letras — gana menos,
//      pero en 2022 gano +6,2% mientras el SPY perdia -19,9%
//
// No se parecen: una cobra cuando sube, la otra cobra cuando NO se desploma. Aqui se mide
// la mezcla, mes a mes, con las mismas cotizaciones reales.

import fs from 'node:fs';
const S = process.argv[2];
const DIR = S + '/theta-idx';
const P = JSON.parse(fs.readFileSync(S + '/precios.json', 'utf8'));
const COMM = 0.03;

function leer(f) {
  const lin = fs.readFileSync(f, 'utf8').split('\n'); const cab = lin[0].split(',');
  const iK = cab.indexOf('strike'), iB = cab.indexOf('bid'), iA = cab.indexOf('ask');
  const m = new Map();
  for (let n = 1; n < lin.length; n++) { const c = lin[n].split(','); if (c.length < cab.length) continue;
    const bid = +c[iB], ask = +c[iA];
    if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
    if ((ask - bid) / ((ask + bid) / 2) > 0.50) continue;
    m.set(+c[iK], { bid, ask, mid: (bid + ask) / 2 }); }
  return m;
}
function serie(SYM) {   // retorno mensual del indice PUT (al dinero, colateral con intereses)
  const bars = P[SYM], px = new Map(bars.map(b => [b.d, b.c]));
  const cie = d => { for (let k = 0; k < 8; k++) { const x = new Date(new Date(d) - k * 864e5).toISOString().slice(0, 10); if (px.has(x)) return px.get(x); } return null; };
  const out = [];
  for (const fp of fs.readdirSync(DIR).filter(f => f.startsWith(SYM + '_') && f.endsWith('_P.csv')).sort()) {
    const [, rolo, exp] = fp.replace('.csv', '').split('_');
    const fc = `${DIR}/${SYM}_${rolo}_${exp}_C.csv`; if (!fs.existsSync(fc)) continue;
    const puts = leer(`${DIR}/${fp}`), calls = leer(fc);
    const S0 = cie(rolo), ST = cie(exp); if (S0 == null || ST == null || !puts.size) continue;
    const T = (new Date(exp) - new Date(rolo)) / 365 / 864e5;
    let r = null, dm = 1e9;
    for (const [K, p] of puts) { const c = calls.get(K); if (!c) continue; const d = Math.abs(K - S0);
      if (d < dm) { dm = d; const v = (S0 - c.mid + p.mid) / K; if (v > 0.5 && v <= 1.02) r = -Math.log(v) / T; } }
    if (!(r > -0.02 && r < 0.12)) r = 0;
    let K = null, dif = 1e9;
    for (const k of puts.keys()) { const d = Math.abs(k - S0); if (d < dif) { dif = d; K = k; } }
    if (dif > S0 * 0.01) continue;
    const pl = puts.get(K).mid * 100 - Math.max(K - ST, 0) * 100 + K * 100 * (Math.exp(r * T) - 1) - COMM;
    out.push({ rolo, exp, ret: pl / (K * 100), retIdx: ST / S0 - 1 });
  }
  return out;
}

const put = { SPY: serie('SPY'), QQQ: serie('QQQ'), IWM: serie('IWM') };
// alinear por fecha de rolo
const fechas = put.SPY.map(o => o.rolo).filter(f => put.QQQ.some(o => o.rolo === f) && put.IWM.some(o => o.rolo === f));
const m = (s, f) => put[s].find(o => o.rolo === f);

function medir(pesos) {   // {SPY_comprar, QQQ_comprar, SPY_put, QQQ_put, IWM_put}
  let eq = 1, pico = 1, dd = 0; const rets = [];
  for (const f of fechas) {
    let r = 0;
    r += (pesos.SPYc || 0) * m('SPY', f).retIdx;
    r += (pesos.QQQc || 0) * m('QQQ', f).retIdx;
    r += (pesos.SPYp || 0) * m('SPY', f).ret;
    r += (pesos.QQQp || 0) * m('QQQ', f).ret;
    r += (pesos.IWMp || 0) * m('IWM', f).ret;
    rets.push(r); eq *= (1 + r); pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico);
  }
  const años = (new Date(m('SPY', fechas[fechas.length - 1]).exp) - new Date(fechas[0])) / 365 / 864e5;
  const media = rets.reduce((s, x) => s + x, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((s, x) => s + (x - media) ** 2, 0) / (rets.length - 1));
  return { anual: (eq ** (1 / años) - 1) * 100, dd, rd: (eq ** (1 / años) - 1) * 100 / (dd * 100),
           sharpe: media / sd * Math.sqrt(12), peorMes: Math.min(...rets), años, rets };
}
const f = (nom, r) => console.log(`${nom.padEnd(46)} ${r.anual.toFixed(1).padStart(6)}%/año   caida ${(r.dd * 100).toFixed(0).padStart(3)}%   ret/caida ${r.rd.toFixed(2)}   peor mes ${(r.peorMes * 100).toFixed(1)}%`);

console.log(`=== ${fechas.length} meses alineados, ${fechas[0]} a ${fechas[fechas.length - 1]} ===\n`);
console.log('LAS PIEZAS SUELTAS');
f('  comprar SPY', medir({ SPYc: 1 }));
f('  comprar QQQ', medir({ QQQc: 1 }));
f('  vender put al dinero SPY', medir({ SPYp: 1 }));
f('  vender put al dinero QQQ', medir({ QQQp: 1 }));
f('  vender put al dinero IWM', medir({ IWMp: 1 }));

console.log('\nMEZCLAS  (comprar QQQ  +  vender puts al dinero QQQ)');
for (const w of [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1])
  f(`  ${Math.round((1 - w) * 100)}% comprar QQQ / ${Math.round(w * 100)}% vender put QQQ`, medir({ QQQc: 1 - w, QQQp: w }));

console.log('\nMEZCLAS  (comprar SPY  +  vender puts al dinero QQQ)');
for (const w of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8])
  f(`  ${Math.round((1 - w) * 100)}% comprar SPY / ${Math.round(w * 100)}% vender put QQQ`, medir({ SPYc: 1 - w, QQQp: w }));

console.log('\nMEZCLAS DE TRES  (comprar QQQ + put QQQ + put IWM)');
for (const [a, b, c] of [[0.5, 0.25, 0.25], [0.4, 0.3, 0.3], [0.34, 0.33, 0.33], [0.3, 0.5, 0.2], [0.5, 0.5, 0]])
  f(`  ${Math.round(a * 100)}/${Math.round(b * 100)}/${Math.round(c * 100)}  QQQ / putQQQ / putIWM`, medir({ QQQc: a, QQQp: b, IWMp: c }));

console.log('\n=== la mejor mezcla, año a año, contra comprar SPY ===');
const mej = { QQQc: 0.5, QQQp: 0.5 };
const y = new Map();
fechas.forEach((fa, i) => { const k = fa.slice(0, 4); if (!y.has(k)) y.set(k, []); y.get(k).push(i); });
const rM = medir(mej).rets, rS = medir({ SPYc: 1 }).rets, rQ = medir({ QQQc: 1 }).rets;
console.log('año     mezcla 50/50    comprar SPY    comprar QQQ');
for (const [k, idxs] of [...y.entries()].sort()) {
  const p = (arr) => ((idxs.reduce((e, i) => e * (1 + arr[i]), 1) - 1) * 100).toFixed(1).padStart(7);
  console.log(`${k}    ${p(rM)}%       ${p(rS)}%       ${p(rQ)}%`);
}
