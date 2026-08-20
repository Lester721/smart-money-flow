// MEZCLA · PROPORCION — paso 4: EL PUENTE bien dimensionado.
// El paso 3 hundio la vertical porque la dimensione a "todos los contratos que caben en el
// efectivo" — eso no es la mezcla, es apalancarse al maximo. Aqui el tamaño se elige POR RIESGO,
// igual que la rejilla: el mayor numero de contratos que respeta el presupuesto de caida.
import fs from 'node:fs';

const R = 'scripts/cache-theta', NOCHE = `${R}/noche-2026-08-10`;
const CUENTA = 56389, EFECTIVO = 7977;
const DIST = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07];
const ANCHOS = [5, 10, 20];
const PRESUPUESTO = 0.172;           // la caida que eligio el riesgo en la rejilla (50% ind / 50% put 3%)

const mas = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dol = (v) => (v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('es');
const oc = JSON.parse(fs.readFileSync(`${NOCHE}/qqq-oc.json`, 'utf8'));
const cQQQ = new Map(oc.map((x) => [x.d, x.c]));
const px = (d) => { for (let k = 0; k < 7; k++) { const x = mas(d, -k); if (cQQQ.has(x)) return cQQQ.get(x); } return null; };

const semanas = [];
{ let d = '2020-01-03'; while (mas(d, 7) <= '2026-07-31') { const a = px(d), b = px(mas(d, 7)); if (a != null && b != null) semanas.push({ d, exp: mas(d, 7), rQ: b / a - 1 }); d = mas(d, 7); } }
const mit = Math.floor(semanas.length / 2);
const H1 = semanas.slice(0, mit), H2 = semanas.slice(mit);
const anos = (s) => s.length * 7 / 365.25;

// reconstruir las verticales (el paso 3 no las guardo con detalle)
import { execSync } from 'node:child_process';
const vertPath = `${R}/_mezcla-vert.json`;
let vert;
if (fs.existsSync(vertPath)) vert = JSON.parse(fs.readFileSync(vertPath, 'utf8'));
else { console.log('faltan las verticales; ejecuta mezcla-prop-3.mjs con guardado'); process.exit(1); }
const porFV = new Map(vert.map((v) => [`${v.fecha}|${v.dist}|${v.ancho}`, v]));

// carrera: N verticales (capital en riesgo N*W*100 apartado del indice), el resto en QQQ
function correr(sems, W, x, N) {
  const cap = N * W * 100;
  if (cap >= CUENTA) return null;
  const wIdx = 1 - cap / CUENTA;
  let eq = CUENTA, pico = CUENTA, dd = 0, peor = 0, peorD = 0, peorSem = null;
  for (const s of sems) {
    const v = porFV.get(`${s.d}|${x}|${W}`);
    const rV = v ? v.pnl / (W * 100) : 0;             // retorno sobre el capital en riesgo del sleeve
    const r = wIdx * s.rQ + (1 - wIdx) * rV;
    const antes = eq; eq *= 1 + r;
    if (r < peor) { peor = r; peorD = eq - antes; peorSem = s.d; }
    if (eq > pico) pico = eq; dd = Math.max(dd, (pico - eq) / pico);
  }
  return { N, cap, wIdx, eq, dd, peor, peorD, peorSem, dAno: (eq - CUENTA) / anos(sems), cagr: (eq / CUENTA) ** (1 / anos(sems)) - 1 };
}

// caida del liston en cada tramo
const lis = (sems) => { let eq = CUENTA, pico = CUENTA, dd = 0; for (const s of sems) { eq *= 1 + s.rQ; if (eq > pico) pico = eq; dd = Math.max(dd, (pico - eq) / pico); } return { dd, dAno: (eq - CUENTA) / anos(sems), cagr: (eq / CUENTA) ** (1 / anos(sems)) - 1 }; };

console.log('═══ EL PUENTE, DIMENSIONADO POR RIESGO ═══');
console.log(`   presupuesto de caida: ${(100 * PRESUPUESTO).toFixed(1)}% de la cuenta (el que eligio la rejilla)`);
console.log(`   liston (comprar QQQ y no hacer nada): ${dol(lis(semanas).dAno)}/año · caida ${(100 * lis(semanas).dd).toFixed(0)}%\n`);
console.log('   ancho dist │  N maximo que respeta el presupuesto (elegido en la 1a mitad)');
console.log('              │  cap.riesgo  1a mitad(elige)   2a mitad(comprueba)   PERIODO ENTERO');

const salida = [];
for (const W of ANCHOS) for (const x of DIST) {
  let mejor = null;
  for (let N = 1; N <= 60; N++) {
    const c = correr(H1, W, x, N);
    if (!c) break;
    if (c.dd <= PRESUPUESTO) mejor = c; else break;      // la caida crece con N: en cuanto pasa, parar
  }
  if (!mejor) { console.log(`   ${String(W).padStart(4)}$ ${(100 * x).toFixed(0).padStart(2)}% │  ni con 1 contrato baja del presupuesto`); continue; }
  const fu = correr(H2, W, x, mejor.N);
  const tot = correr(semanas, W, x, mejor.N);
  const ok = fu.dd <= PRESUPUESTO;
  salida.push({ W, x, N: mejor.N, h1: mejor, h2: fu, tot, ok });
  console.log(`   ${String(W).padStart(4)}$ ${(100 * x).toFixed(0).padStart(2)}% │ N=${String(mejor.N).padStart(2)} ${dol(mejor.cap).padStart(7)}  caida ${(100 * mejor.dd).toFixed(1).padStart(4)}%  │  caida ${(100 * fu.dd).toFixed(1).padStart(4)}% ${ok ? 'OK ' : 'ROTO'} ${dol(fu.dAno).padStart(8)}/año │ ${dol(tot.dAno).padStart(8)}/año caida ${(100 * tot.dd).toFixed(1)}% peor sem ${(100 * tot.peor).toFixed(1)}%`);
}

// el mismo ejercicio al reves
console.log('\n   AL REVES (elegir el tamaño en la 2a mitad, comprobar en la 1a):');
for (const W of ANCHOS) for (const x of DIST) {
  let mejor = null;
  for (let N = 1; N <= 60; N++) { const c = correr(H2, W, x, N); if (!c) break; if (c.dd <= PRESUPUESTO) mejor = c; else break; }
  if (!mejor) continue;
  const fu = correr(H1, W, x, mejor.N);
  const ok = fu.dd <= PRESUPUESTO;
  if (x === 0.03 || x === 0.05 || x === 0.07) console.log(`   ${String(W).padStart(4)}$ ${(100 * x).toFixed(0).padStart(2)}% │ N=${String(mejor.N).padStart(2)}  2a mitad caida ${(100 * mejor.dd).toFixed(1)}% → 1a mitad caida ${(100 * fu.dd).toFixed(1)}% ${ok ? 'OK' : 'ROTO'} · ${dol(fu.dAno)}/año`);
}

// ── el filtro que manda: la PERDIDA sale del EFECTIVO
console.log('\n\n═══ EL FILTRO QUE MANDA: las perdidas salen de ' + dol(EFECTIVO) + ' de efectivo ═══\n');
console.log('   ancho dist  N │ capital en riesgo │ PEOR SEMANA en $ │ cabe en el efectivo?');
const vivos = [];
for (const s of salida) {
  const peorSleeve = Math.min(...semanas.map((w) => { const v = porFV.get(`${w.d}|${s.x}|${s.W}`); return v ? v.pnl * s.N : 0; }));
  const cabe = Math.abs(peorSleeve) <= EFECTIVO && s.N * s.W * 100 <= EFECTIVO * 3;
  if (s.x >= 0.03) console.log(`   ${String(s.W).padStart(4)}$ ${(100 * s.x).toFixed(0).padStart(2)}% ${String(s.N).padStart(2)} │ ${dol(s.N * s.W * 100).padStart(11)}   │ ${dol(peorSleeve).padStart(10)}      │ ${Math.abs(peorSleeve) <= EFECTIVO ? 'SI' : 'NO — llamada de margen'}`);
  if (Math.abs(peorSleeve) <= EFECTIVO && s.ok) vivos.push({ ...s, peorSleeve });
}

console.log('\n\n═══ LAS QUE PASAN TODO (presupuesto respetado fuera de muestra Y la peor semana cabe en el efectivo) ═══\n');
if (!vivos.length) console.log('   NINGUNA.');
else {
  vivos.sort((a, b) => a.tot.dd - b.tot.dd);
  console.log('   ancho dist  N │ $/año   %/año  caida   peor semana($)  vs liston QQQ (' + dol(lis(semanas).dAno) + '/año, caida ' + (100 * lis(semanas).dd).toFixed(0) + '%)');
  for (const v of vivos) console.log(`   ${String(v.W).padStart(4)}$ ${(100 * v.x).toFixed(0).padStart(2)}% ${String(v.N).padStart(2)} │ ${dol(v.tot.dAno).padStart(8)} ${(100 * v.tot.cagr).toFixed(1).padStart(5)}% ${(100 * v.tot.dd).toFixed(1).padStart(5)}%   ${dol(v.peorSleeve).padStart(8)}      ${v.tot.dAno > lis(semanas).dAno ? 'gana' : 'PIERDE'} en dinero · ${v.tot.dd < lis(semanas).dd ? 'gana' : 'pierde'} en caida`);
}
