// ¿CUÁNTO CUESTA LEGAR? — meter las dos verticales por separado en vez de la mariposa entera.
//
// En Robinhood no hay mariposa de un botón: hay que meter el vertical de calls y el de puts
// como dos órdenes. Entre una y otra el precio se mueve, y esa segunda pata se cotiza a otro
// precio. Aquí se mide con los datos de 5 minutos: primera pata a las 11:00, segunda 5, 10, 15
// o 30 minutos después, con las cotizaciones REALES de ese momento.
//
// También se compara la MARIPOSA (vender las dos al dinero) contra el CÓNDOR (vender separadas).

import { obs, med, mean, COMM } from './gex-lib-gex.mjs';

// obs solo trae :00 y :30. Aquí hace falta la rejilla de 5 min, así que se reconstruye
// buscando en obs todas las horas disponibles del mismo día.
const porDiaHora = new Map();
for (const o of obs) porDiaHora.set(`${o.d} ${o.h}`, o);
const dias = [...new Set(obs.map(o => o.d))].sort();

const atm = o => { let K = null, dif = Infinity;
  for (const k of o.calls.keys()) if (o.puts.has(k) && Math.abs(k - o.U) < dif) { dif = Math.abs(k - o.U); K = k; }
  return dif <= 10 ? K : null; };

const st = r => { if (r.length < 20) return null;
  const m = mean(r), sd = Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1));
  return { n: r.length, m, med: med(r), t: m / (sd / Math.sqrt(r.length)), win: r.filter(x => x > 0).length / r.length }; };

const mas = (h, min) => { const t = +h.slice(0, 2) * 60 + +h.slice(3) + min;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

// Estructura genérica: vender call en Kc y put en Kp, comprar alas a distancia `ala`.
// mariposa -> Kc = Kp = ATM.   cóndor -> Kc = ATM+sep, Kp = ATM−sep.
function estructura(o1, o2, sep, ala) {
  const K = atm(o1); if (K == null) return null;
  const Kc = K + sep, Kp = K - sep;
  // pata de calls con la foto o1, pata de puts con la foto o2 (la que va después al legar)
  const c = o1.calls.get(Kc), cA = o1.calls.get(Kc + ala);
  const p = o2.puts.get(Kp), pA = o2.puts.get(Kp - ala);
  if (!c || !cA || !p || !pA) return null;
  const cr = c.bid + p.bid - cA.ask - pA.ask;         // cruzando la horquilla entera, lo realista
  if (!(cr > 0.2) || cr > ala) return null;
  const S = o1.cierre;
  const perd = Math.min(Math.max(S - Kc, 0), ala) + Math.min(Math.max(Kp - S, 0), ala);
  return { d: o1.d, net: o1.net1, cr, ret: ((cr - perd) * 100 - 8 * COMM) / (ala * 100) };
}

console.log('═══ 1. EL COSTE DE LEGAR — mariposa alas 50, días GEX+ ═══');
console.log('   Primera pata (calls) a las 11:00. Segunda pata (puts) N minutos después.\n');
console.log('   retraso        n    acierto   media    mediana     t      pierde vs simultáneo');
let base = null;
for (const min of [0, 5, 10, 15, 30]) {
  const g = [];
  for (const d of dias) {
    const o1 = porDiaHora.get(`${d} 11:00`); if (!o1) continue;
    const o2 = min === 0 ? o1 : porDiaHora.get(`${d} ${mas('11:00', min)}`);
    if (!o2 || o1.net1 <= 0) continue;
    const r = estructura(o1, o2, 0, 50); if (r) g.push(r.ret);
  }
  const s = st(g); if (!s) { console.log(`   +${min} min: muestra corta (n=${g.length})`); continue; }
  if (min === 0) base = s.m;
  console.log(`   +${String(min).padStart(2)} min   ${String(s.n).padStart(4)}    ${(s.win * 100).toFixed(0).padStart(3)}%   ${(s.m * 100).toFixed(2).padStart(6)}%  ${(s.med * 100).toFixed(2).padStart(7)}%  ${s.t.toFixed(2).padStart(5)}     ${min === 0 ? '—' : ((s.m - base) * 100).toFixed(2) + ' puntos'}`);
}

console.log('\n\n═══ 2. MARIPOSA contra CÓNDOR — mismas alas, días GEX+, cruzando la horquilla ═══\n');
console.log('   separación    n    acierto   media    mediana     t     crédito mediano');
for (const sep of [0, 10, 25, 50]) {
  const g = [];
  for (const d of dias) {
    const o = porDiaHora.get(`${d} 11:00`); if (!o || o.net1 <= 0) continue;
    const r = estructura(o, o, sep, 50); if (r) g.push(r);
  }
  const s = st(g.map(x => x.ret)); if (!s) { console.log(`   ${sep === 0 ? 'mariposa' : '±' + sep}: corta (n=${g.length})`); continue; }
  const nom = sep === 0 ? 'MARIPOSA (al dinero)' : `cóndor ±${sep}`;
  console.log(`   ${nom.padEnd(22)} ${String(s.n).padStart(4)}   ${(s.win * 100).toFixed(0).padStart(3)}%   ${(s.m * 100).toFixed(2).padStart(6)}%  ${(s.med * 100).toFixed(2).padStart(7)}%  ${s.t.toFixed(2).padStart(5)}    $${(med(g.map(x => x.cr)) * 100).toFixed(0)}`);
}
