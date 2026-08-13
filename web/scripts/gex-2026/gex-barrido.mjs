// BARRIDO de delta y ancho, con el filtro de GEX puesto. UNA entrada por día.
//
// La pregunta: la estructura base (delta 0,05-0,11, ancho 25) pierde. ¿Hay alguna combinación
// de distancia y ancho donde el call credit spread 0DTE sí pague, con GEX positivo?
//
// Todo con cotizaciones reales de SPXW 2026 y liquidación contra el cierre real del índice.
// La t que se imprime SÍ vale porque cada día es una observación independiente.

import { obs, deltaCall, med, mean, COMM } from './gex-lib.mjs';

const DELTAS = [0.05, 0.10, 0.15, 0.20, 0.30, 0.40];
const ANCHOS = [10, 25, 50, 100];
const HORA = '11:00';

function operar(o, deltaObj, ancho) {
  let corta = null, mejorD = 9;
  for (const [K, q] of o.calls) {
    if (K <= o.U) continue;
    const dl = deltaCall(o.U, K, o.T, q.iv);
    if (!(dl > 0.02) || dl > 0.60) continue;
    if (Math.abs(dl - deltaObj) < mejorD) { mejorD = Math.abs(dl - deltaObj); corta = { K, q, dl }; }
  }
  if (!corta || mejorD > 0.04) return null;            // si no hay strike a esa delta, no se opera
  const larga = o.calls.get(corta.K + ancho); if (!larga) return null;
  const credito = corta.q.mid - larga.mid;
  if (!(credito > 0.05) || credito > ancho * 0.5) return null;   // filtro de cotización rota
  const perdida = Math.min(Math.max(o.cierre - corta.K, 0), ancho);
  const pl = (credito - perdida) * 100 - 4 * COMM;
  return { d: o.d, net: o.net1, mom: o.mom, credito, delta: corta.dl, pl, ret: pl / (ancho * 100), ancho };
}

const stats = (g) => {
  if (g.length < 20) return null;
  const r = g.map(x => x.ret), m = mean(r);
  const sd = Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1));
  const a = g.filter(x => x.d < '2026-05-01').map(x => x.ret), b = g.filter(x => x.d >= '2026-05-01').map(x => x.ret);
  return { n: g.length, m, med: med(r), t: m / (sd / Math.sqrt(r.length)),
           win: g.filter(x => x.ret > 0).length / g.length,
           a: a.length > 8 ? mean(a) : null, b: b.length > 8 ? mean(b) : null,
           peor: Math.min(...r), dolAño: m * g[0].ancho * 100 * 250 };
};

for (const [nomFiltro, sel] of [['SIN FILTRO', () => true], ['GEX POSITIVO', x => x.net > 0], ['GEX NEGATIVO', x => x.net < 0]]) {
  console.log(`\n╔═══ ${nomFiltro} — entrada única a las ${HORA} ═══╗`);
  console.log('delta  ancho   n    acierto   media    mediana    t      ene-abr  may-ago   peor    $/año por contrato');
  for (const dObj of DELTAS) {
    for (const anc of ANCHOS) {
      const porDia = new Map();
      for (const o of obs) { if (o.h !== HORA) continue; const t = operar(o, dObj, anc); if (t) porDia.set(o.d, t); }
      const g = [...porDia.values()].filter(sel);
      const s = stats(g); if (!s) continue;
      console.log(`${dObj.toFixed(2)}  ${String(anc).padStart(4)}  ${String(s.n).padStart(4)}   ${(s.win * 100).toFixed(0).padStart(3)}%   ` +
        `${(s.m * 100).toFixed(2).padStart(7)}%  ${(s.med * 100).toFixed(2).padStart(6)}%  ${s.t.toFixed(2).padStart(6)}  ` +
        `${s.a != null ? (s.a * 100).toFixed(1).padStart(7) + '%' : '      —'} ${s.b != null ? (s.b * 100).toFixed(1).padStart(7) + '%' : '      —'}  ` +
        `${(s.peor * 100).toFixed(0).padStart(5)}%  ${('$' + Math.round(s.dolAño).toLocaleString('es-ES')).padStart(10)}` +
        `${Math.abs(s.t) > 2 && s.m > 0 ? '  <<<' : ''}`);
    }
  }
}

console.log('\n\n═══ ¿aguanta lo mejor en las otras horas? ═══');
for (const H of ['10:30', '11:00', '12:00', '13:00', '14:00']) {
  const linea = [];
  for (const dObj of [0.10, 0.20, 0.30, 0.40]) {
    const porDia = new Map();
    for (const o of obs) { if (o.h !== H) continue; const t = operar(o, dObj, 50); if (t) porDia.set(o.d, t); }
    const s = stats([...porDia.values()].filter(x => x.net > 0));
    linea.push(`d${dObj.toFixed(2)}: ${s ? (s.m * 100).toFixed(2) + '%' : '—'}`);
  }
  console.log(`   ${H}  (ancho 50, GEX+)   ${linea.join('   ')}`);
}
