// MEZCLA · PROPORCION — paso 7: sensibilidad al INTERES del efectivo parado.
// No hay serie de tipos en el repo, asi que esto NO es un dato: es un "¿y si?" declarado.
// Importa porque a igual caida la mezcla tiene MAS efectivo parado que el control de caja
// (50% contra 35% en la 2a mitad), asi que el interes NO se cancela: favorece a la mezcla.
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
const pfd = new Map(ops.map((o) => [`${o.fecha}|${o.dist}`, o]));
const semanas = [];
{ let d = '2020-01-03'; while (mas(d, 7) <= '2026-07-31') { const a = px(d), b = px(mas(d, 7)); if (a != null && b != null) semanas.push({ d, rQ: b / a - 1 }); d = mas(d, 7); } }

// tasa: interes semanal sobre TODO el efectivo parado (la parte que no esta en el indice),
// tanto si esta como colateral de la put como si esta en caja
function correr(sems, w, dist, tasa) {
  const rSem = tasa / 52;
  let eq = CUENTA, pico = CUENTA, dd = 0;
  for (const s of sems) {
    const o = dist == null ? null : pfd.get(`${s.d}|${dist}`);
    const r = w * s.rQ + (1 - w) * ((o ? o.rPut : 0) + rSem);
    eq *= 1 + r; if (eq > pico) pico = eq; dd = Math.max(dd, (pico - eq) / pico);
  }
  const a = sems.length * 7 / 365.25;
  return { eq, dd, dAno: (eq - CUENTA) / a };
}
const igualar = (sems, dd, tasa) => { let m = { w: 0, dAno: 0, dd: 0 }; for (let w = 0; w <= 1.0001; w += 0.005) { const c = correr(sems, w, null, tasa); if (c.dd <= dd && c.dd >= m.dd) m = { w, ...c }; } return m; };

const mit = Math.floor(semanas.length / 2);
const tramos = [['TODO', semanas], ['1a mitad', semanas.slice(0, mit)], ['2a mitad', semanas.slice(mit)]];

console.log('═══ SENSIBILIDAD AL INTERES — lo que la PUT añade sobre CAJA a igual caida ═══');
console.log('   (peso del indice al 50%; el interes se aplica IGUAL al colateral de la put y a la caja)\n');
for (const tasa of [0, 0.02, 0.045]) {
  console.log(`   ── si el efectivo parado rinde ${(100 * tasa).toFixed(1)}%/año ──`);
  console.log('   tramo      │ ' + DIST.map((x) => (100 * x).toFixed(0).padStart(8) + '%').join(''));
  for (const [nom, ss] of tramos) {
    const cel = DIST.map((x) => { const p = correr(ss, 0.5, x, tasa); const c = igualar(ss, p.dd, tasa); return dol(p.dAno - c.dAno).padStart(9); });
    console.log(`   ${nom.padEnd(10)} │ ` + cel.join(''));
  }
  console.log('');
}

console.log('═══ Y LA MEZCLA CONTRA EL LISTON, con interes ═══\n');
for (const tasa of [0, 0.045]) {
  const m = correr(semanas, 0.5, 0.03, tasa), l = correr(semanas, 1, null, tasa);
  console.log(`   interes ${(100 * tasa).toFixed(1)}%: mezcla 50/50 @3% ${dol(m.dAno)}/año caida ${(100 * m.dd).toFixed(1)}%  ·  liston QQQ ${dol(l.dAno)}/año caida ${(100 * l.dd).toFixed(1)}%  → ${dol(l.dAno - m.dAno)}/año a favor del LISTON`);
}
console.log('\n   Recordatorio: el liston va SIN DIVIDENDOS (QQQ reparte ~0,5-0,6%/año y no hay fichero');
console.log('   en el repo). Contarlos ensancharia todavia mas la distancia a favor del liston.');
