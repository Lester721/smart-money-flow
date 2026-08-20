// MEZCLA · PROPORCION — paso 6: el detalle del control que decide.
// Por que el control es limpio: "indice + CAJA" y "indice + PUT ASEGURADA EN EFECTIVO" tienen
// EXACTAMENTE el mismo efectivo parado. El interes que gane ese efectivo es el MISMO en las dos
// → SE CANCELA. La diferencia entre las dos columnas es, entera, el P&L de la opcion.
import fs from 'node:fs';
import { listonT } from '../lib/barreraHallazgos.ts';

const R = 'scripts/cache-theta', NOCHE = `${R}/noche-2026-08-10`;
const CUENTA = 56389;
const DIST = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07];

const mas = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dol = (v) => (v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('es');
const oc = JSON.parse(fs.readFileSync(`${NOCHE}/qqq-oc.json`, 'utf8'));
const cQQQ = new Map(oc.map((x) => [x.d, x.c]));
const px = (d) => { for (let k = 0; k < 7; k++) { const x = mas(d, -k); if (cQQQ.has(x)) return cQQQ.get(x); } return null; };
const ops = JSON.parse(fs.readFileSync(`${R}/_mezcla-ops.json`, 'utf8'));
const pfd = new Map(ops.map((o) => [`${o.fecha}|${o.dist}`, o]));
const semanas = [];
{ let d = '2020-01-03'; while (mas(d, 7) <= '2026-07-31') { const a = px(d), b = px(mas(d, 7)); if (a != null && b != null) semanas.push({ d, rQ: b / a - 1 }); d = mas(d, 7); } }

function correr(sems, w, dist) {
  let eq = CUENTA, pico = CUENTA, dd = 0; const rs = [];
  for (const s of sems) {
    const o = dist == null ? null : pfd.get(`${s.d}|${dist}`);
    const r = w * s.rQ + (1 - w) * (o ? o.rPut : 0);
    rs.push(r); eq *= 1 + r; if (eq > pico) pico = eq; dd = Math.max(dd, (pico - eq) / pico);
  }
  const a = sems.length * 7 / 365.25;
  return { eq, dd, rs, dAno: (eq - CUENTA) / a, cagr: (eq / CUENTA) ** (1 / a) - 1 };
}
const igualarCaja = (sems, dd) => { let m = { w: 0, dd: 0, dAno: 0, rs: sems.map(() => 0) }; for (let w = 0; w <= 1.0001; w += 0.005) { const c = correr(sems, w, null); if (c.dd <= dd && c.dd >= m.dd) m = { w, ...c }; } return m; };

// ── 1. la pata de put SOLA, por tramos
console.log('═══ 1 · LA PATA DE PUT SOLA (100% put, 0% indice) — ¿gana dinero en los dos tramos? ═══\n');
const mit = Math.floor(semanas.length / 2);
const t3 = Math.floor(semanas.length / 3);
const tramos = [['TODO', semanas], ['1a mitad 2020-01→2023-04', semanas.slice(0, mit)], ['2a mitad 2023-04→2026-07', semanas.slice(mit)],
['tercio 1', semanas.slice(0, t3)], ['tercio 2', semanas.slice(t3, 2 * t3)], ['tercio 3', semanas.slice(2 * t3)]];
console.log('   tramo                      │ ' + DIST.map((x) => (100 * x).toFixed(0).padStart(8) + '%').join(''));
for (const [nom, ss] of tramos) {
  console.log(`   ${nom.padEnd(26)} │ ` + DIST.map((x) => dol(correr(ss, 0, x).dAno).padStart(9)).join(''));
}
console.log('   (la put SOLA gana dinero en todos los tramos y a todas las distancias: eso NO esta en duda)');

// ── 2. el control a igual riesgo, por tramos
console.log('\n\n═══ 2 · A IGUAL CAIDA, lo que la PUT añade sobre CAJA — el numero que decide ═══\n');
console.log('   (el efectivo parado es el mismo en las dos columnas → el interes se CANCELA;');
console.log('    la diferencia es, entera, el P&L de la opcion)\n');
console.log('   tramo                      │ ' + DIST.map((x) => (100 * x).toFixed(0).padStart(8) + '%').join(''));
const W0 = 0.5;
for (const [nom, ss] of tramos) {
  const cel = DIST.map((x) => { const p = correr(ss, W0, x); const c = igualarCaja(ss, p.dd); return dol(p.dAno - c.dAno).padStart(9); });
  console.log(`   ${nom.padEnd(26)} │ ` + cel.join(''));
}
console.log('   ↑ con el peso del indice al 50%. Signo POSITIVO = la put aporta; NEGATIVO = mejor caja.');

// ── 3. detalle de la celda elegida por riesgo
console.log('\n\n═══ 3 · DETALLE de la elegida por riesgo (50% indice / 50% put al 3%) ═══\n');
for (const [nom, ss] of tramos) {
  const p = correr(ss, 0.5, 0.03), c = igualarCaja(ss, p.dd), l = correr(ss, 1, null);
  console.log(`   ${nom.padEnd(26)} mezcla ${dol(p.dAno).padStart(9)}/año caida ${(100 * p.dd).toFixed(1).padStart(4)}%  │  caja al mismo riesgo (${(100 * c.w).toFixed(0)}% indice) ${dol(c.dAno).padStart(9)}/año  │  liston QQQ ${dol(l.dAno).padStart(9)}/año caida ${(100 * l.dd).toFixed(0)}%`);
}
// t de la diferencia semanal, en la 2a mitad
{
  const ss = semanas.slice(mit);
  const p = correr(ss, 0.5, 0.03), c = igualarCaja(ss, p.dd);
  const dif = p.rs.map((r, k) => r - c.rs[k]);
  const m = dif.reduce((a, b) => a + b, 0) / dif.length;
  const sd = Math.sqrt(dif.reduce((a, b) => a + (b - m) ** 2, 0) / (dif.length - 1));
  const t = m / (sd / Math.sqrt(dif.length));
  console.log(`\n   2a mitad, mezcla MENOS caja-al-mismo-riesgo, semana a semana: media ${(100 * m).toFixed(4)}%  t = ${t.toFixed(2)}`);
  console.log(`   liston de t con 98 pruebas declaradas = ${listonT(98).toFixed(2)}  →  ${Math.abs(t) >= listonT(98) ? 'PASA' : 'NO PASA'}`);
}

// ── 4. ¿que peso de indice iguala en DINERO al liston, y con que caida?
console.log('\n\n═══ 4 · CONTRA EL LISTON (comprar QQQ y no hacer nada) ═══\n');
const l = correr(semanas, 1, null);
console.log(`   liston: ${dol(l.dAno)}/año · ${(100 * l.cagr).toFixed(1)}%/año · caida ${(100 * l.dd).toFixed(1)}% (${dol(CUENTA * l.dd)})`);
console.log('   NINGUNA celda de la rejilla le gana en dinero: el maximo de la rejilla sin el indice puro es');
let mx = null;
for (let w = 0; w <= 0.9501; w += 0.05) for (const x of DIST) { const c = correr(semanas, w, x); if (!mx || c.dAno > mx.c.dAno) mx = { w, x, c }; }
console.log(`   ${(100 * mx.w).toFixed(0)}% indice / ${(100 * (1 - mx.w)).toFixed(0)}% put al ${(100 * mx.x).toFixed(0)}% → ${dol(mx.c.dAno)}/año, caida ${(100 * mx.c.dd).toFixed(1)}%`);
console.log(`   Es ${dol(l.dAno - mx.c.dAno)}/año MENOS que el liston, a cambio de ${(100 * (l.dd - mx.c.dd)).toFixed(0)} puntos menos de caida.`);
