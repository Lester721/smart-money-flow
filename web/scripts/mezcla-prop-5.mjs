// MEZCLA · PROPORCION — paso 5: EL CONTROL QUE FALTABA.
// La rejilla dice que bajar el peso del indice baja la caida. Eso lo hace TAMBIEN dejar el dinero
// en caja. La pregunta que decide si la put sirve para algo: A IGUAL RIESGO, ¿cuanto dinero
// añade la put por encima de "indice + caja"?
import fs from 'node:fs';

const R = 'scripts/cache-theta', NOCHE = `${R}/noche-2026-08-10`;
const CUENTA = 56389, EFECTIVO = 7977;
const DIST = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07];
const PESOS = [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1];

const mas = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dol = (v) => (v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('es');
const oc = JSON.parse(fs.readFileSync(`${NOCHE}/qqq-oc.json`, 'utf8'));
const cQQQ = new Map(oc.map((x) => [x.d, x.c]));
const px = (d) => { for (let k = 0; k < 7; k++) { const x = mas(d, -k); if (cQQQ.has(x)) return cQQQ.get(x); } return null; };
const ops = JSON.parse(fs.readFileSync(`${R}/_mezcla-ops.json`, 'utf8'));
const pfd = new Map(ops.map((o) => [`${o.fecha}|${o.dist}`, o]));

const semanas = [];
{ let d = '2020-01-03'; while (mas(d, 7) <= '2026-07-31') { const a = px(d), b = px(mas(d, 7)); if (a != null && b != null) semanas.push({ d, rQ: b / a - 1 }); d = mas(d, 7); } }
const anos = semanas.length * 7 / 365.25;

function correr(sems, w, dist /* null = caja */) {
  let eq = CUENTA, pico = CUENTA, dd = 0, peor = 0;
  for (const s of sems) {
    const o = dist == null ? null : pfd.get(`${s.d}|${dist}`);
    const r = w * s.rQ + (1 - w) * (o ? o.rPut : 0);
    peor = Math.min(peor, r); eq *= 1 + r; if (eq > pico) pico = eq; dd = Math.max(dd, (pico - eq) / pico);
  }
  return { eq, dd, peor, dAno: (eq - CUENTA) / (sems.length * 7 / 365.25), cagr: (eq / CUENTA) ** (1 / (sems.length * 7 / 365.25)) - 1 };
}

console.log('═══ EL CONTROL — "indice + CAJA" contra "indice + PUT", en TODO el periodo ═══\n');
console.log('   La caja rinde 0% (no hay serie de tipos en el repo; con intereses la caja saldria MEJOR).\n');
console.log('   %ind │   indice+CAJA        │   indice + put al 3%      │  lo que APORTA la put');
console.log('        │  $/año     caida     │  $/año     caida          │  $/año extra   caida extra');
const filas = [];
for (const w of PESOS) {
  const c = correr(semanas, w, null), p = correr(semanas, w, 0.03);
  filas.push({ w, c, p });
  console.log(`   ${(100 * w).toFixed(0).padStart(4)} │ ${dol(c.dAno).padStart(8)}  ${(100 * c.dd).toFixed(1).padStart(5)}%    │ ${dol(p.dAno).padStart(8)}  ${(100 * p.dd).toFixed(1).padStart(5)}%       │ ${dol(p.dAno - c.dAno).padStart(8)}     ${((100 * (p.dd - c.dd))).toFixed(1).padStart(5)} pts`);
}

// ── LA COMPARACION A IGUAL RIESGO (lo unico que vale)
console.log('\n\n═══ A IGUAL RIESGO — interpolando "indice+caja" hasta la MISMA caida que cada celda ═══\n');
console.log('   Para cada celda de la rejilla busco el peso de indice que, SOLO con caja, da la misma');
console.log('   caida. Si la put no aporta, las dos dan el mismo dinero.\n');
const cajaCurva = [];
for (let w = 0; w <= 1.0001; w += 0.01) cajaCurva.push({ w, ...correr(semanas, w, null) });
const cajaAlRiesgo = (dd) => {
  let mejor = cajaCurva[0];
  for (const c of cajaCurva) if (c.dd <= dd && c.dd > mejor.dd) mejor = c;
  return mejor;
};
console.log('   dist │ ' + PESOS.filter((w) => w > 0 && w < 1).map((w) => (100 * w).toFixed(0).padStart(6)).join('') + '   ← peso del indice');
for (const x of DIST) {
  const cel = PESOS.filter((w) => w > 0 && w < 1).map((w) => {
    const p = correr(semanas, w, x);
    const c = cajaAlRiesgo(p.dd);
    return dol(p.dAno - c.dAno).padStart(6);
  });
  console.log(`   ${(100 * x).toFixed(0).padStart(3)}% │ ${cel.join('')}   $/año que la PUT añade sobre caja A LA MISMA CAIDA`);
}

// mitades del mismo control
console.log('\n   El mismo control, partido (peso 50% de indice):');
const mit = Math.floor(semanas.length / 2);
for (const [nom, sems] of [['1a mitad', semanas.slice(0, mit)], ['2a mitad', semanas.slice(mit)]]) {
  const cc = [];
  for (let w = 0; w <= 1.0001; w += 0.01) cc.push({ w, ...correr(sems, w, null) });
  const linea = DIST.map((x) => {
    const p = correr(sems, 0.5, x);
    let m = cc[0]; for (const c of cc) if (c.dd <= p.dd && c.dd > m.dd) m = c;
    return `${(100 * x).toFixed(0)}%:${dol(p.dAno - m.dAno)}`;
  });
  console.log(`      ${nom}: ${linea.join('  ')}`);
}

// ── EL TAMAÑO: que subyacente hace que UN contrato sea del tamaño que se quiere
console.log('\n\n═══ EL PUENTE REAL: el problema no es la estrategia, es el TAMAÑO DEL CONTRATO ═══\n');
const ult = ops.filter((o) => o.dist === 0.03).slice(-1)[0];
console.log(`   1 put de QQQ al 3% (${ult.fecha}): strike ${ult.strike} → colateral ${dol(ult.colateral)} = ${(100 * ult.colateral / CUENTA).toFixed(0)}% de la cuenta.`);
for (const w of [0.5, 0.4, 0.3, 0.2]) {
  const need = w * CUENTA;
  console.log(`   Para que la pata de put pese el ${(100 * w).toFixed(0)}% (${dol(need)}) hace falta un subyacente a ~$${(need / 100 / 0.97).toFixed(0)}/accion.`);
}
console.log(`   Y con el EFECTIVO de verdad (${dol(EFECTIVO)}, de donde salen las PERDIDAS): ~$${(EFECTIVO / 100 / 0.97).toFixed(0)}/accion.`);

const CAD = `${R}/cadenas`;
const cierres = JSON.parse(fs.readFileSync(`${R}/cierres/QQQ.json`, 'utf8'));
const tickers = [...new Set(fs.readdirSync(CAD).filter((f) => /_d\d{8}\.json$/.test(f)).map((f) => f.split('_d')[0]))].sort();
console.log(`\n   Tickers con cadena EOD en disco (${tickers.length}): ${tickers.join(' ')}`);
console.log('   Precio del ultimo cierre en disco y colateral de 1 put al 3% — cuales caben:');
const filasT = [];
for (const t of tickers) {
  const p = `${R}/cierres/${t}.json`;
  if (!fs.existsSync(p)) continue;
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  const ks = Object.keys(c).sort();
  if (!ks.length) continue;
  const S = c[ks[ks.length - 1]];
  filasT.push({ t, d: ks[ks.length - 1], S, col: S * 0.97 * 100 });
}
filasT.sort((a, b) => a.col - b.col);
for (const f of filasT) {
  const pctCuenta = 100 * f.col / CUENTA;
  const marca = f.col <= EFECTIVO ? 'CABE EN EFECTIVO' : (pctCuenta <= 60 ? 'pesa ' + pctCuenta.toFixed(0) + '% — sleeve razonable' : 'pesa ' + pctCuenta.toFixed(0) + '% — demasiado');
  console.log(`      ${f.t.padEnd(5)} $${f.S.toFixed(2).padStart(8)} (${f.d}) → colateral ${dol(f.col).padStart(9)}  ${marca}`);
}
