// EL INDICE PUT DE CBOE, replicado con cotizaciones reales.
//
// Es la unica configuracion de venta de prima que nunca probamos, y la unica con historial
// publicado independiente (CBOE lo calcula desde 1986). Se diferencia de todo lo que hemos
// medido en tres cosas, y las tres importan:
//
//   1. AL DINERO (delta ~ -0,50), no lejos. Vendiamos a 1,5 sigma, que cobra calderilla.
//   2. MENSUAL sostenido a vencimiento, no semanal.
//   3. TOTALMENTE COLATERALIZADO EN LETRAS -> el colateral COBRA INTERESES. Ese componente
//      nunca lo modelamos, y con tipos al 4-5% no es un detalle: es la mitad del retorno.
//
// El tipo de interes NO se supone: se saca de la PARIDAD PUT-CALL de la propia cadena
//      C - P = S - K*e^(-rT)   ->   r = -ln((S - C + P)/K)/T
// usando las calls y puts reales del mismo strike y vencimiento.

import fs from 'node:fs';
const S = process.argv[2];
const DIR = S + '/theta-idx';
const P = JSON.parse(fs.readFileSync(S + '/precios.json', 'utf8'));
const COMM = 0.03;

function leer(f) {
  const lin = fs.readFileSync(f, 'utf8').split('\n'); const cab = lin[0].split(',');
  const iK = cab.indexOf('strike'), iB = cab.indexOf('bid'), iA = cab.indexOf('ask');
  const m = new Map();
  for (let n = 1; n < lin.length; n++) {
    const c = lin[n].split(','); if (c.length < cab.length) continue;
    const bid = +c[iB], ask = +c[iA];
    if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
    if ((ask - bid) / ((ask + bid) / 2) > 0.50) continue;
    m.set(+c[iK], { bid, ask, mid: (bid + ask) / 2 });
  }
  return m;
}

function correr(SYM, { otm = 0, entrada = 'medio', interes = true } = {}) {
  const bars = P[SYM], px = new Map(bars.map(b => [b.d, b.c]));
  const cierre = d => { for (let k = 0; k < 8; k++) { const x = new Date(new Date(d) - k * 864e5).toISOString().slice(0, 10); if (px.has(x)) return px.get(x); } return null; };
  const fich = fs.readdirSync(DIR).filter(f => f.startsWith(SYM + '_') && f.endsWith('_P.csv')).sort();
  const ops = [];
  for (const fp of fich) {
    const [, rolo, exp] = fp.replace('.csv', '').split('_');
    const fc = `${DIR}/${SYM}_${rolo}_${exp}_C.csv`;
    if (!fs.existsSync(fc)) continue;
    const puts = leer(`${DIR}/${fp}`), calls = leer(fc);
    const S0 = cierre(rolo), ST = cierre(exp);
    if (S0 == null || ST == null || !puts.size) continue;
    const T = (new Date(exp) - new Date(rolo)) / 365 / 864e5;

    // tipo de interes por paridad, con el strike mas cercano al dinero que tenga las dos patas
    let r = null, mejorD = 1e9;
    for (const [K, p] of puts) { const c = calls.get(K); if (!c) continue;
      const d = Math.abs(K - S0); if (d < mejorD) { mejorD = d;
        const v = (S0 - c.mid + p.mid) / K; if (v > 0.5 && v <= 1.02) r = -Math.log(v) / T; } }
    if (r == null || !(r > -0.02) || r > 0.12) r = null;

    // strike objetivo
    const obj = S0 * (1 - otm);
    let K = null, dif = 1e9;
    for (const k of puts.keys()) { const d = Math.abs(k - obj); if (d < dif) { dif = d; K = k; } }
    if (K == null || dif > S0 * 0.01) continue;
    const q = puts.get(K);
    const cobro = entrada === 'medio' ? q.mid : q.bid;
    const colat = K * 100;
    const inter = (interes && r != null) ? colat * (Math.exp(r * T) - 1) : 0;
    const pl = cobro * 100 - Math.max(K - ST, 0) * 100 + inter - COMM;
    ops.push({ rolo, exp, S0, ST, K, cobro, r, T, inter, pl, ret: pl / colat });
  }
  return ops;
}

function met(ops) {
  if (!ops.length) return null;
  let eq = 1, pico = 1, dd = 0;
  for (const o of ops) { eq *= (1 + o.ret); pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
  const años = (new Date(ops[ops.length - 1].exp) - new Date(ops[0].rolo)) / 365 / 864e5;
  return { n: ops.length, eq, dd, años, anual: (eq ** (1 / años) - 1) * 100, win: ops.filter(o => o.ret > 0).length / ops.length };
}
const f = (nom, m) => m ? console.log(`${nom.padEnd(40)} n=${String(m.n).padStart(3)}  acierto ${(m.win * 100).toFixed(0).padStart(3)}%  ANUAL ${m.anual.toFixed(1).padStart(6)}%  caida ${(m.dd * 100).toFixed(0).padStart(3)}%`) : console.log(nom, '—');

// referencia
function bh(SYM, desde) {
  const b = P[SYM].filter(x => x.d >= desde);
  let pico = 0, dd = 0; for (const x of b) { pico = Math.max(pico, x.c); dd = Math.max(dd, 1 - x.c / pico); }
  const años = (new Date(b[b.length - 1].d) - new Date(b[0].d)) / 365 / 864e5;
  return { anual: ((b[b.length - 1].c / b[0].c) ** (1 / años) - 1) * 100, dd, años };
}

const base = correr('SPY');
console.log('=== CONTROL: ¿el tipo de interes sale bien de la paridad? ===');
const porAñoR = new Map();
for (const o of base) { const k = o.rolo.slice(0, 4); if (!porAñoR.has(k)) porAñoR.set(k, []); porAñoR.get(k).push(o.r); }
for (const [k, v] of [...porAñoR.entries()].sort()) {
  const c = v.filter(x => x != null).sort((a, b) => a - b);
  console.log(`   ${k}  tipo implicito mediano ${(c[Math.floor(c.length / 2)] * 100).toFixed(2)}%   (${c.length}/${v.length} con paridad limpia)`);
}
console.log('   -> compara con la realidad: 2020-21 ~0%, 2022 subiendo, 2023-24 ~5%, 2025-26 bajando.');

console.log('\n=== EL INDICE PUT, cotizaciones reales, SPY ===\n');
for (const [nom, o] of [
  ['al dinero + intereses (CBOE PUT)', correr('SPY')],
  ['al dinero SIN intereses', correr('SPY', { interes: false })],
  ['al dinero, entrando al BID', correr('SPY', { entrada: 'bid' })],
  ['2% fuera + intereses', correr('SPY', { otm: 0.02 })],
  ['5% fuera + intereses', correr('SPY', { otm: 0.05 })],
  ['10% fuera + intereses', correr('SPY', { otm: 0.10 })],
]) f(nom, met(o));

const m = met(base), r = bh('SPY', base[0].rolo);
console.log(`\nREFERENCIA comprar y mantener SPY (${r.años.toFixed(1)} años): ${r.anual.toFixed(1)}%/año, caida ${(r.dd * 100).toFixed(0)}%`);
console.log(`   retorno/caida   indice PUT ${(m.anual / (m.dd * 100)).toFixed(2)}   vs   SPY ${(r.anual / (r.dd * 100)).toFixed(2)}`);
console.log(`   de que se compone el retorno del indice PUT:`);
const primaT = base.reduce((s, o) => s + o.cobro * 100, 0), interT = base.reduce((s, o) => s + o.inter, 0),
      perdT = base.reduce((s, o) => s + Math.max(o.K - o.ST, 0) * 100, 0);
console.log(`      prima cobrada  $${primaT.toFixed(0)}`);
console.log(`      intereses      $${interT.toFixed(0)}   <-- lo que nunca modelamos`);
console.log(`      asignaciones  -$${perdT.toFixed(0)}`);
console.log(`      neto           $${(primaT + interT - perdT).toFixed(0)} sobre ~$${(base[0].K * 100).toFixed(0)} de colateral inicial`);

console.log('\n=== por año ===');
const y = new Map(); for (const o of base) { const k = o.rolo.slice(0, 4); if (!y.has(k)) y.set(k, []); y.get(k).push(o); }
console.log('año     indice PUT    SPY');
for (const [k, v] of [...y.entries()].sort()) {
  let e = 1; for (const o of v) e *= (1 + o.ret);
  const s = P.SPY.filter(b => b.d.startsWith(k));
  console.log(`${k}    ${((e - 1) * 100).toFixed(1).padStart(7)}%   ${((s[s.length - 1].c / s[0].c - 1) * 100).toFixed(1).padStart(7)}%`);
}

console.log('\n=== lo mismo en QQQ y IWM ===');
for (const t of ['QQQ', 'IWM']) {
  const o = correr(t); const mm = met(o), rr = bh(t, o[0].rolo);
  f(`${t} indice PUT`, mm);
  console.log(`${''.padEnd(40)}          comprar ${t}: ${rr.anual.toFixed(1)}%/año, caida ${(rr.dd * 100).toFixed(0)}%`);
}
