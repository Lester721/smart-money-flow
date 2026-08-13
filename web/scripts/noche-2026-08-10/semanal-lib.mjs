// SEMANAL AL DINERO vs MENSUAL AL DINERO, cotizaciones reales.
//
// La pieza que explica todo lo de esta noche: el coste del bid/ask es un porcentaje de la
// PRIMA, no del nominal. Lejos del dinero la prima es calderilla y la horquilla se la come;
// al dinero la prima es grande y la horquilla no se nota. Aqui se comprueba en las dos
// frecuencias, y se mide tambien cuanto cuesta de verdad entrar al bid en cada una.

import fs from 'node:fs';
const S = process.argv[2];
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

function correr(DIR, SYM, { otm = 0, entrada = 'medio' } = {}) {
  const bars = P[SYM], px = new Map(bars.map(b => [b.d, b.c]));
  const cie = d => { for (let k = 0; k < 8; k++) { const x = new Date(new Date(d) - k * 864e5).toISOString().slice(0, 10); if (px.has(x)) return px.get(x); } return null; };
  const out = [];
  for (const fp of fs.readdirSync(S + '/' + DIR).filter(f => f.startsWith(SYM + '_') && f.endsWith('_P.csv')).sort()) {
    const [, rolo, exp] = fp.replace('.csv', '').split('_');
    const fc = `${S}/${DIR}/${SYM}_${rolo}_${exp}_C.csv`; if (!fs.existsSync(fc)) continue;
    const puts = leer(`${S}/${DIR}/${fp}`), calls = leer(fc);
    const S0 = cie(rolo), ST = cie(exp); if (S0 == null || ST == null || !puts.size) continue;
    const T = (new Date(exp) - new Date(rolo)) / 365 / 864e5;
    let r = 0, dm = 1e9;
    for (const [K, p] of puts) { const c = calls.get(K); if (!c) continue; const d = Math.abs(K - S0);
      if (d < dm) { dm = d; const v = (S0 - c.mid + p.mid) / K; const rr = -Math.log(v) / T; if (rr > -0.02 && rr < 0.12) r = rr; } }
    const obj = S0 * (1 - otm);
    let K = null, dif = 1e9;
    for (const k of puts.keys()) { const d = Math.abs(k - obj); if (d < dif) { dif = d; K = k; } }
    if (K == null || dif > S0 * 0.01) continue;
    const q = puts.get(K), cobro = entrada === 'medio' ? q.mid : q.bid;
    const pl = cobro * 100 - Math.max(K - ST, 0) * 100 + K * 100 * (Math.exp(r * T) - 1) - COMM;
    out.push({ rolo, exp, ret: pl / (K * 100), prima: q.mid, horq: (q.ask - q.bid) / q.mid, K, S0, ST });
  }
  return out;
}
function met(o) { if (o.length < 10) return null;
  let eq = 1, pico = 1, dd = 0;
  for (const x of o) { eq *= (1 + x.ret); pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
  const años = (new Date(o[o.length - 1].exp) - new Date(o[0].rolo)) / 365 / 864e5;
  return { n: o.length, anual: (eq ** (1 / años) - 1) * 100, dd, win: o.filter(x => x.ret > 0).length / o.length, años }; }
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const f = (nom, o) => { const m = met(o); if (!m) return console.log(nom, '—');
  console.log(`${nom.padEnd(38)} n=${String(m.n).padStart(3)}  acierto ${(m.win * 100).toFixed(0).padStart(3)}%  ` +
    `ANUAL ${m.anual.toFixed(1).padStart(6)}%  caida ${(m.dd * 100).toFixed(0).padStart(3)}%`); };

export { correr, met, P };
