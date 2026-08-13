// AUDITORÍA COMPLETA del cóndor ±25 con alas 50, días GEX+ — la misma que le hice a la mariposa.
// Todo cruzando la horquilla ENTERA (vender al bid, comprar al ask).
import { obs, med, mean, COMM } from './gex-lib-gex.mjs';

const porDiaHora = new Map();
for (const o of obs) porDiaHora.set(`${o.d} ${o.h}`, o);
const dias = [...new Set(obs.map(o => o.d))].sort();
const atm = o => { let K = null, dif = Infinity;
  for (const k of o.calls.keys()) if (o.puts.has(k) && Math.abs(k - o.U) < dif) { dif = Math.abs(k - o.U); K = k; }
  return dif <= 10 ? K : null; };
const st = r => { if (r.length < 15) return null;
  const m = mean(r), sd = Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1));
  return { n: r.length, m, med: med(r), t: m / (sd / Math.sqrt(r.length)), win: r.filter(x => x > 0).length / r.length }; };

function condor(o, sep, ala, castigo = 0) {
  const K = atm(o); if (K == null) return null;
  const Kc = K + sep, Kp = K - sep;
  const c = o.calls.get(Kc), cA = o.calls.get(Kc + ala), p = o.puts.get(Kp), pA = o.puts.get(Kp - ala);
  if (!c || !cA || !p || !pA) return null;
  let cr = c.bid + p.bid - cA.ask - pA.ask;
  cr -= (c.mid + p.mid - cA.mid - pA.mid) * castigo;   // castigo extra sobre el crédito
  if (!(cr > 0.2) || cr > ala) return null;
  const S = o.cierre;
  const perd = Math.min(Math.max(S - Kc, 0), ala) + Math.min(Math.max(Kp - S, 0), ala);
  return { d: o.d, net: o.net1, cr, ret: ((cr - perd) * 100 - 8 * COMM) / (ala * 100) };
}
const sel = (h, sep, ala, castigo = 0) => dias.map(d => { const o = porDiaHora.get(`${d} ${h}`); return o && o.net1 > 0 ? condor(o, sep, ala, castigo) : null; }).filter(Boolean);

console.log('═══ AUDITORÍA — cóndor ±25, alas 50, GEX positivo, 11:00, cruzando horquilla ═══\n');
const g = sel('11:00', 25, 50);
const s = st(g.map(x => x.ret));
const perd = g.filter(x => x.ret <= 0);
console.log(`  base: n=${s.n}  acierto ${(s.win * 100).toFixed(0)}%  media ${(s.m * 100).toFixed(2)}%  mediana ${(s.med * 100).toFixed(2)}%  t=${s.t.toFixed(2)}`);
console.log(`  PERDEDORAS: ${perd.length}  (media ${(mean(perd.map(x => x.ret)) * 100).toFixed(1)}%)   peor día ${(Math.min(...g.map(x => x.ret)) * 100).toFixed(1)}%`);

console.log('\n  0. ¿POR QUÉ SE CAEN DÍAS? (la mariposa tenía 296 y el cóndor 143)');
{
  const mar = dias.map(d => { const o = porDiaHora.get(`${d} 11:00`); return o && o.net1 > 0 ? condor(o, 0, 50) : null; }).filter(Boolean);
  const dCondor = new Set(g.map(x => x.d)), dMar = new Set(mar.map(x => x.d));
  const soloMar = mar.filter(x => !dCondor.has(x.d));
  console.log(`     días con mariposa pero SIN cóndor: ${soloMar.length}`);
  const sm = st(soloMar.map(x => x.ret));
  console.log(`     ¿cómo fue la mariposa esos días?  media ${sm ? (sm.m * 100).toFixed(2) + '%' : '—'}  contra ${(mean(mar.filter(x => dCondor.has(x.d)).map(x => x.ret)) * 100).toFixed(2)}% los días que SÍ hay cóndor`);
  console.log(`     -> si el grupo que se cae fuese mucho peor, el cóndor estaría cobrando una selección, no una ventaja`);
}

console.log('\n  1. partida por año');
for (const a of ['2024', '2025', '2026']) {
  const sub = st(g.filter(x => x.d.startsWith(a)).map(x => x.ret));
  console.log(`     ${a}:  ${sub ? `n=${sub.n}  media ${(sub.m * 100).toFixed(2)}%  acierto ${(sub.win * 100).toFixed(0)}%  t=${sub.t.toFixed(2)}` : 'muestra corta'}`);
}

console.log('\n  2. ¿vive de pocos días?');
for (const q of [0.01, 0.05, 0.10]) {
  const r = [...g.map(x => x.ret)].sort((a, b) => b - a).slice(Math.floor(g.length * q));
  console.log(`     sin el ${(q * 100).toFixed(0)}% mejor: ${(mean(r) * 100).toFixed(2)}%`);
}

console.log('\n  3. castigo EXTRA de ejecución (ya se cruza la horquilla entera)');
for (const c of [0.05, 0.10, 0.20]) {
  const ss = st(sel('11:00', 25, 50, c).map(x => x.ret));
  console.log(`     un ${(c * 100).toFixed(0)}% menos de crédito: ${ss ? (ss.m * 100).toFixed(2) + '%  t=' + ss.t.toFixed(2) : '—'}`);
}

console.log('\n  4. otras horas');
for (const h of ['10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00']) {
  const ss = st(sel(h, 25, 50).map(x => x.ret));
  console.log(`     ${h}:  ${ss ? `n=${String(ss.n).padStart(3)}  media ${(ss.m * 100).toFixed(2).padStart(6)}%  t=${ss.t.toFixed(2)}` : 'corta'}`);
}

console.log('\n  5. rejilla separación × alas (¿pico o meseta?)');
console.log('     sep\ala      25          50          75         100');
for (const sep of [10, 25, 40, 50]) {
  const fila = [25, 50, 75, 100].map(ala => { const ss = st(sel('11:00', sep, ala).map(x => x.ret));
    return ss ? `${(ss.m * 100).toFixed(1)}%/t${ss.t.toFixed(1)}(${ss.n})`.padStart(18) : '—'.padStart(18); });
  console.log(`     ±${String(sep).padEnd(3)} ${fila.join('')}`);
}

console.log('\n  6. control: ¿y en días de GEX NEGATIVO?');
{
  const neg = dias.map(d => { const o = porDiaHora.get(`${d} 11:00`); return o && o.net1 < 0 ? condor(o, 25, 50) : null; }).filter(Boolean);
  const ss = st(neg.map(x => x.ret));
  console.log(`     ${ss ? `n=${ss.n}  acierto ${(ss.win * 100).toFixed(0)}%  media ${(ss.m * 100).toFixed(2)}%  t=${ss.t.toFixed(2)}` : 'corta'}`);
}
