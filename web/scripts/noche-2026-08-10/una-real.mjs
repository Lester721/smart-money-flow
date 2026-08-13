// Un ticker, cotizaciones reales. Devuelve JSON por stdout (lo consume multi-real.mjs).
// Se ejecuta en su propio proceso porque cada cadena ocupa cientos de MB en memoria.
import fs from 'node:fs';
const S = process.argv[2];
const SYM = process.env.SYM;
const DIR = S + '/theta-hood';
const COMM = 0.03;

const bars = SYM === 'HOOD'
  ? JSON.parse(fs.readFileSync(S + '/hood-full.json', 'utf8'))
  : JSON.parse(fs.readFileSync(S + '/precios.json', 'utf8'))[SYM];
const px = new Map(bars.map(b => [b.d, b.c]));

const N = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p; };
const d1f = (S0, K, T, v, r = 0.045) => (Math.log(S0 / K) + (r + v * v / 2) * T) / (v * Math.sqrt(T));
const putBS = (S0, K, T, v, r = 0.045) => T <= 0 ? Math.max(K - S0, 0)
  : K * Math.exp(-r * T) * N(-(d1f(S0, K, T, v, r) - v * Math.sqrt(T))) - S0 * N(-d1f(S0, K, T, v, r));
const ivPut = (p, S0, K, T) => { let lo = 0.02, hi = 6;
  for (let k = 0; k < 55; k++) { const m = (lo + hi) / 2; if (putBS(S0, K, T, m) > p) hi = m; else lo = m; }
  return (lo + hi) / 2; };
const dPut = (S0, K, T, v) => N(d1f(S0, K, T, v)) - 1;

// cadena: fecha -> exp|K -> {bid,ask}  (hace falta poder consultar el mismo contrato otro dia
// para valorar el cierre anticipado)
const cadena = new Map();
for (const f of fs.readdirSync(DIR).filter(x => x.startsWith(SYM + '_') && x.endsWith('.csv'))) {
  const lin = fs.readFileSync(DIR + '/' + f, 'utf8').split('\n');
  const cab = lin[0].split(',');
  const iE = cab.indexOf('expiration'), iK = cab.indexOf('strike'), iC = cab.indexOf('created'),
        iB = cab.indexOf('bid'), iA = cab.indexOf('ask'), iS = cab.indexOf('symbol');
  for (let n = 1; n < lin.length; n++) {
    const c = lin[n].split(','); if (c.length < cab.length) continue;
    if (c[iS].replace(/"/g, '') !== SYM) continue;
    const bid = +c[iB], ask = +c[iA];
    if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
    if ((ask - bid) / ((ask + bid) / 2) > 0.50) continue;
    const d = c[iC].slice(0, 10), exp = c[iE].replace(/"/g, ''), K = +c[iK];
    if (!cadena.has(d)) cadena.set(d, new Map());
    cadena.get(d).set(exp + '|' + K, { bid, ask, K, exp });
  }
}
const dias = [...cadena.keys()].sort();

function correr({ deltaObj = -0.25, minD = 2, maxD = 6, entrada = 'medio', tp = null } = {}) {
  const ops = []; let i = 0;
  while (i < dias.length) {
    const d = dias[i], S0 = px.get(d);
    if (S0 == null) { i++; continue; }
    const todos = [...cadena.get(d).values()];
    const exps = [...new Set(todos.map(c => c.exp))]
      .filter(e => { const dd = (new Date(e) - new Date(d)) / 864e5; return dd >= minD && dd <= maxD && px.has(e); }).sort();
    if (!exps.length) { i++; continue; }
    const exp = exps[0], dd = (new Date(exp) - new Date(d)) / 864e5, T = dd / 365;
    let mejor = null, dif = 9;
    for (const c of todos) {
      if (c.exp !== exp || c.K > S0 || c.K < S0 * 0.5) continue;
      const mid = (c.bid + c.ask) / 2, iv = ivPut(mid, S0, c.K, T);
      if (iv <= 0.03 || iv >= 5.9) continue;
      const dl = dPut(S0, c.K, T, iv);
      if (Math.abs(dl - deltaObj) < dif) { dif = Math.abs(dl - deltaObj); mejor = { ...c, mid, iv, dl }; }
    }
    if (!mejor || dif > 0.08) { i++; continue; }
    const cobro = entrada === 'medio' ? mejor.mid : mejor.bid;
    let salida = null, fSal = exp;
    if (tp != null) {   // recomprar al ASK real cuando quede <= (1-tp) de la prima
      for (let k = i + 1; k < dias.length && dias[k] < exp; k++) {
        const c = cadena.get(dias[k])?.get(exp + '|' + mejor.K); if (!c) continue;
        if (c.ask <= cobro * (1 - tp)) { salida = c.ask; fSal = dias[k]; break; }
      }
    }
    const pl = salida != null ? (cobro - salida) * 100 - 2 * COMM
                              : (cobro - Math.max(mejor.K - px.get(exp), 0)) * 100 - COMM;
    // rasgos del dia de entrada, para las reglas de adaptacion que se prueban despues
    const iB = bars.findIndex(b => b.d === d);
    const ma50 = iB >= 50 ? bars.slice(iB - 49, iB + 1).reduce((s, b) => s + b.c, 0) / 50 : null;
    const ma200 = iB >= 200 ? bars.slice(iB - 199, iB + 1).reduce((s, b) => s + b.c, 0) / 200 : null;
    ops.push({ d, exp, fSal, ret: pl / (mejor.K * 100), K: mejor.K, S0, iv: mejor.iv,
               sobreMA50: ma50 != null ? S0 > ma50 : null, sobreMA200: ma200 != null ? S0 > ma200 : null,
               r20: iB >= 20 ? S0 / bars[iB - 20].c - 1 : null });
    const k = dias.indexOf(fSal);
    i = k >= 0 ? k + 1 : i + 1;
  }
  return ops;
}
function met(ops) {
  if (ops.length < 10) return null;
  let eq = 1, pico = 1, dd = 0;
  for (const o of ops) { eq *= (1 + o.ret); pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
  const t = (new Date(ops[ops.length - 1].exp) - new Date(ops[0].d)) / 864e5;
  return { n: ops.length, eq, dd, anual: (eq ** (365 / t) - 1) * 100, win: ops.filter(o => o.ret > 0).length / ops.length };
}

const oMedio = correr({}), oBid = correr({ entrada: 'bid' });
const mm = met(oMedio);
const porAño = {};
{ const y = new Map();
  for (const o of oMedio) { const k = o.d.slice(0, 4); if (!y.has(k)) y.set(k, []); y.get(k).push(o); }
  for (const [k, v] of y) { let e = 1; for (const o of v) e *= (1 + o.ret); porAño[k] = (e - 1) * 100; } }

// comprar y mantener el mismo activo, mismo periodo
const b0 = bars.find(b => b.d >= oMedio[0].d), b1 = bars[bars.length - 1];
let pico = 0, ddBh = 0;
for (const b of bars.filter(b => b.d >= b0.d)) { pico = Math.max(pico, b.c); ddBh = Math.max(ddBh, 1 - b.c / pico); }
const años = (new Date(b1.d) - new Date(b0.d)) / 365 / 864e5;

fs.writeFileSync(S + `/ops-${SYM}.json`, JSON.stringify(oMedio));
process.stdout.write(JSON.stringify({
  sym: SYM, n: mm.n, win: mm.win,
  medio: { anual: mm.anual, dd: mm.dd },
  bid: (m => ({ anual: m.anual, dd: m.dd }))(met(oBid)),
  bh: { anual: ((b1.c / b0.c) ** (1 / años) - 1) * 100, dd: ddBh },
  tp25: met(correr({ tp: 0.25 }))?.anual ?? null,
  tp50: met(correr({ tp: 0.50 }))?.anual ?? null,
  tp75: met(correr({ tp: 0.75 }))?.anual ?? null,
  porAño,
}));
