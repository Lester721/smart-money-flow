// MEZCLA · PROPORCION — paso 8: robustez.
// (1) el 22% de recompras que cotizan POR DEBAJO del intrinseco (foto EOD rezagada en dias
//     violentos): forzar recompra >= intrinseco, que es el peor caso honesto.
// (2) castigo de ejecucion: -20% de prima al vender y +20% de coste al recomprar.
import fs from 'node:fs';

const R = 'scripts/cache-theta', NOCHE = `${R}/noche-2026-08-10`;
const CUENTA = 56389;
const DIST = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07];
const mas = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dol = (v) => (v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('es');
const oc = JSON.parse(fs.readFileSync(`${NOCHE}/qqq-oc.json`, 'utf8'));
const cQQQ = new Map(oc.map((x) => [x.d, x.c]));
const px = (d) => { for (let k = 0; k < 7; k++) { const x = mas(d, -k); if (cQQQ.has(x)) return cQQQ.get(x); } return null; };
const ops = JSON.parse(fs.readFileSync(`${R}/_mezcla-ops.json`, 'utf8'));
const semanas = [];
{ let d = '2020-01-03'; while (mas(d, 7) <= '2026-07-31') { const a = px(d), b = px(mas(d, 7)); if (a != null && b != null) semanas.push({ d, rQ: b / a - 1 }); d = mas(d, 7); } }
const mit = Math.floor(semanas.length / 2);

function variante(mult, castigo) {
  const m = new Map();
  for (const o of ops) {
    const bid = o.bid * (1 - castigo);
    let rec = o.recompra;
    if (o.itm) { const intr = o.strike - o.cierreExp; if (mult && rec < intr) rec = intr; rec *= (1 + castigo); }
    m.set(`${o.fecha}|${o.dist}`, ((bid - rec) * 100 - 0.03 * (o.itm ? 2 : 1)) / o.colateral);
  }
  return m;
}
function correr(sems, w, dist, m) {
  let eq = CUENTA, pico = CUENTA, dd = 0;
  for (const s of sems) { const rP = dist == null ? 0 : (m.get(`${s.d}|${dist}`) ?? 0); const r = w * s.rQ + (1 - w) * rP; eq *= 1 + r; if (eq > pico) pico = eq; dd = Math.max(dd, (pico - eq) / pico); }
  return { dd, dAno: (eq - CUENTA) / (sems.length * 7 / 365.25) };
}
const igualar = (sems, dd, m) => { let b = { w: 0, dAno: 0, dd: 0 }; for (let w = 0; w <= 1.0001; w += 0.005) { const c = correr(sems, w, null, m); if (c.dd <= dd && c.dd >= b.dd) b = { w, ...c }; } return b; };

const casos = [['tal cual (ask real)', false, 0], ['recompra >= intrinseco', true, 0], ['+ castigo 20% ejecucion', true, 0.20]];
for (const [nom, mult, cast] of casos) {
  const m = variante(mult, cast);
  const p = correr(semanas, 0.5, 0.03, m);
  console.log(`\n═══ ${nom} ═══`);
  console.log(`   mezcla 50% indice / 50% put 3%: ${dol(p.dAno)}/año · caida ${(100 * p.dd).toFixed(1)}%`);
  console.log('   lo que la PUT añade sobre CAJA a igual caida:');
  console.log('   tramo      │ ' + DIST.map((x) => (100 * x).toFixed(0).padStart(8) + '%').join(''));
  for (const [t, ss] of [['TODO', semanas], ['1a mitad', semanas.slice(0, mit)], ['2a mitad', semanas.slice(mit)]]) {
    console.log(`   ${t.padEnd(10)} │ ` + DIST.map((x) => { const a = correr(ss, 0.5, x, m); const c = igualar(ss, a.dd, m); return dol(a.dAno - c.dAno).padStart(9); }).join(''));
  }
}
const l = correr(semanas, 1, null, variante(false, 0));
console.log(`\n   liston (comprar QQQ, sin dividendos): ${dol(l.dAno)}/año · caida ${(100 * l.dd).toFixed(1)}%`);
