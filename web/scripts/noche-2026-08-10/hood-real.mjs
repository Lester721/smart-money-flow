// LA PRUEBA DE VERDAD: la estrategia de Lester en HOOD con COTIZACIONES REALES.
//
// Aqui no hay modelo de precio. Cada prima es el bid/ask que de verdad hubo al cierre de ese
// dia, bajado de ThetaData. La IV se invierte DESDE ese precio (no al reves), y con esa IV se
// calcula la delta para elegir el strike. Black-Scholes solo sirve para etiquetar la delta.
//
// Las cuatro barreras:
//   1. precios reales                -> bid/ask de ThetaData
//   2. comisiones de Robinhood       -> $0,03 por contrato
//   3. strikes y vencimientos listados-> solo los que existen en la cadena
//   4. filtro de cotizacion rota     -> bid>0, ask>0, horquilla relativa < 50%
//
// Se mide con dos precios de entrada:
//   MEDIO  = como opera Lester de verdad (dijo que casi siempre entra al medio)
//   BID    = el peor caso, cruzando la horquilla entera

import fs from 'node:fs';
const S = process.argv[2];
const DIR = S + '/theta-hood';
const SYM = process.env.SYM || 'HOOD';
// OJO: todos los tickers viven en el mismo directorio. Sin este filtro por nombre de fichero
// se mezclan las cadenas de PLTR y COIN con los precios de HOOD y sale cualquier cosa.
const bars = SYM === 'HOOD'
  ? JSON.parse(fs.readFileSync(S + '/hood-full.json', 'utf8'))
  : JSON.parse(fs.readFileSync(S + '/precios.json', 'utf8'))[SYM];
const px = new Map(bars.map(b => [b.d, b.c]));
const COMM = 0.03;

const N = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p; };
const d1f = (S0, K, T, v, r = 0.045) => (Math.log(S0 / K) + (r + v * v / 2) * T) / (v * Math.sqrt(T));
const putBS = (S0, K, T, v, r = 0.045) => T <= 0 ? Math.max(K - S0, 0)
  : K * Math.exp(-r * T) * N(-(d1f(S0, K, T, v, r) - v * Math.sqrt(T))) - S0 * N(-d1f(S0, K, T, v, r));
const ivPut = (precio, S0, K, T) => { let lo = 0.02, hi = 6;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (putBS(S0, K, T, m) > precio) hi = m; else lo = m; }
  return (lo + hi) / 2; };
const dPut = (S0, K, T, v) => N(d1f(S0, K, T, v)) - 1;

// --- cargar la cadena ---
const cadena = new Map();   // fecha -> [{exp,K,bid,ask}]
let filas = 0, rotas = 0;
for (const f of fs.readdirSync(DIR).filter(x => x.startsWith(SYM + '_') && x.endsWith('.csv'))) {
  const txt = fs.readFileSync(DIR + '/' + f, 'utf8');
  const lin = txt.split('\n'); const cab = lin[0].split(',');
  const iExp = cab.indexOf('expiration'), iK = cab.indexOf('strike'), iC = cab.indexOf('created'),
        iB = cab.indexOf('bid'), iA = cab.indexOf('ask');
  for (let n = 1; n < lin.length; n++) {
    const c = lin[n].split(','); if (c.length < cab.length) continue;
    const d = c[iC].slice(0, 10), exp = c[iExp].replace(/"/g, ''), K = +c[iK], bid = +c[iB], ask = +c[iA];
    filas++;
    if (!(bid > 0) || !(ask > 0) || ask < bid) { rotas++; continue; }
    if ((ask - bid) / ((ask + bid) / 2) > 0.50) { rotas++; continue; }   // barrera 4
    if (!cadena.has(d)) cadena.set(d, []);
    cadena.get(d).push({ exp, K, bid, ask });
  }
}
console.log(`cadena cargada: ${cadena.size} dias, ${filas.toLocaleString()} cotizaciones (${(rotas / filas * 100).toFixed(1)}% descartadas por rotas)`);

const fechas = bars.map(b => b.d);
const idx = new Map(fechas.map((d, i) => [d, i]));

export function correr({ deltaObj = -0.25, minDias = 2, maxDias = 6, entrada = 'medio', filtro = null } = {}) {
  const ops = []; let i = 0, saltados = 0;
  const dias = [...cadena.keys()].sort();
  while (i < dias.length) {
    const d = dias[i]; const S0 = px.get(d);
    if (S0 == null || !idx.has(d)) { i++; continue; }
    // vencimiento listado mas cercano dentro de la ventana
    const cands = cadena.get(d).filter(c => {
      const dd = (new Date(c.exp) - new Date(d)) / 864e5;
      return dd >= minDias && dd <= maxDias && px.has(c.exp);
    });
    if (!cands.length) { i++; continue; }
    const exp = cands.map(c => c.exp).sort()[0];
    const dd = (new Date(exp) - new Date(d)) / 864e5, T = dd / 365;
    // si el filtro dice que no, NO hay posicion: se prueba al dia siguiente, no se salta al vencimiento
    if (filtro && !filtro(idx.get(d), bars)) { saltados++; i++; continue; }
    // elegir strike por delta, con la IV invertida del PRECIO REAL
    let mejor = null, dif = 9;
    for (const c of cands) {
      if (c.exp !== exp || c.K > S0) continue;
      const mid = (c.bid + c.ask) / 2;
      const iv = ivPut(mid, S0, c.K, T);
      if (iv <= 0.03 || iv >= 5.9) continue;
      const dl = dPut(S0, c.K, T, iv);
      if (Math.abs(dl - deltaObj) < dif) { dif = Math.abs(dl - deltaObj); mejor = { ...c, iv, dl, mid }; }
    }
    if (!mejor || dif > 0.08) { i++; continue; }
    const cobro = entrada === 'medio' ? mejor.mid : mejor.bid;
    const ST = px.get(exp), colat = mejor.K * 100;
    const pl = (cobro - Math.max(mejor.K - ST, 0)) * 100 - COMM;
    ops.push({ d, exp, dd, S0, K: mejor.K, ST, cobro, iv: mejor.iv, dl: mejor.dl,
               horq: (mejor.ask - mejor.bid) / mejor.mid, colat, pl, ret: pl / colat });
    const k = dias.indexOf(exp);
    i = k >= 0 ? k + 1 : i + 1;
  }
  return { ops, saltados };
}

export function met(ops) {
  if (!ops.length) return null;
  let eq = 1, pico = 1, dd = 0;
  for (const o of ops) { eq *= (1 + o.ret); pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
  const t = (new Date(ops[ops.length - 1].exp) - new Date(ops[0].d)) / 864e5;
  return { n: ops.length, eq, dd, anual: (eq ** (365 / t) - 1) * 100,
           win: ops.filter(o => o.ret > 0).length / ops.length, peor: Math.min(...ops.map(o => o.ret)) };
}
export function resumir(nombre, r) {
  const ops = r.ops || r; const m = met(ops);
  if (!m) { console.log(nombre.padEnd(28), '(sin operaciones)'); return null; }
  console.log(`${nombre.padEnd(28)} n=${String(m.n).padStart(4)}  acierto ${(m.win * 100).toFixed(0)}%  ` +
    `ANUAL ${m.anual.toFixed(1).padStart(7)}%  caida ${(m.dd * 100).toFixed(0).padStart(3)}%  peor op ${(m.peor * 100).toFixed(1).padStart(6)}%  x${m.eq.toFixed(2)}`);
  return m;
}
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

if (process.argv[3] === 'main') {
  console.log('\n=== CONTROL: ¿reproduce esto tus operaciones reales? (2025-06 a 2026-08) ===');
  const c = correr({}).ops.filter(o => o.d >= '2025-06-01' && o.d <= '2026-08-01');
  console.log(`  prima/colateral  real-simulado ${(med(c.map(o => o.cobro / o.K)) * 100).toFixed(2)}%   TUYA REAL 1.11%`);
  console.log(`  distancia OTM    real-simulado ${(med(c.map(o => (o.S0 - o.K) / o.S0)) * 100).toFixed(1)}%    TUYA REAL 3.9%`);
  console.log(`  IV               real-simulado ${(med(c.map(o => o.iv)) * 100).toFixed(0)}%     TUYA REAL 72%`);
  console.log(`  horquilla bid/ask mediana      ${(med(c.map(o => o.horq)) * 100).toFixed(1)}% del precio`);

  for (const entrada of ['medio', 'bid']) {
    console.log(`\n=== HOOD 2021-2026, COTIZACIONES REALES — entrando al ${entrada.toUpperCase()} ===`);
    const base = correr({ entrada });
    resumir('delta -0.25', base);
    const y = new Map();
    for (const o of base.ops) { const k = o.d.slice(0, 4); if (!y.has(k)) y.set(k, []); y.get(k).push(o); }
    const byY = new Map(); for (const b of bars) { const k = b.d.slice(0, 4); if (!byY.has(k)) byY.set(k, []); byY.get(k).push(b.c); }
    for (const [k, ops] of [...y.entries()].sort()) {
      const m = met(ops), bh = byY.get(k);
      console.log(`   ${k}  n=${String(m.n).padStart(3)}  estrategia ${((m.eq - 1) * 100).toFixed(1).padStart(8)}%  (caida ${(m.dd * 100).toFixed(0).padStart(2)}%)   comprar HOOD ${((bh[bh.length - 1] / bh[0] - 1) * 100).toFixed(1).padStart(8)}%`);
    }
    console.log('   --- barrido de delta ---');
    for (const d of [-0.10, -0.15, -0.20, -0.25, -0.30, -0.40]) resumir(`   delta ${d.toFixed(2)}`, correr({ deltaObj: d, entrada }));
  }

  const base = correr({});
  console.log('\n--- las 10 peores operaciones (al medio) ---');
  [...base.ops].sort((a, b) => a.ret - b.ret).slice(0, 10).forEach(o =>
    console.log(`   ${o.d} -> ${o.exp}  S=${o.S0.toFixed(2)} K=${o.K} -> ${o.ST.toFixed(2)}  cobro ${o.cobro.toFixed(2)}  ${(o.ret * 100).toFixed(1).padStart(6)}%`));
}
