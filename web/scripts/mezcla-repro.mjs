// REPRODUCIR LA MEZCLA (mitad QQQ comprado + mitad vendiendo put semanal OTM a media sesion)
// y PARTIRLA EN DOS. Precios reales: bid al vender. Liquidacion = valor intrinseco al cierre
// del vencimiento (el pago contractual de la asignacion), nunca un modelo.
import fs from 'node:fs';
import { radiografia } from '../lib/radiografia.ts';
import { listonT } from '../lib/barreraHallazgos.ts';

const R = 'scripts/cache-theta', N = `${R}/noche-2026-08-10`;
const INTRA = `${N}/theta-intra`, GRIEG = `${N}/theta-griegas`;
const CUENTA = 56389, EFECTIVO = 7977, PODER = 73874;
const FEE = 0.03;                       // $/contrato, Robinhood (tasas). Se paga al VENDER.
const HORAS = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00'];
const OTMS = [0.02, 0.03, 0.04, 0.05];
const PRUEBAS = HORAS.length * OTMS.length;      // 24 geometrias barridas

const csv = p => { const l = fs.readFileSync(p, 'utf8').trim().split(/\r?\n/); return { h: l[0].split(',').map(s => s.replace(/^"|"$/g, '')), rows: l.slice(1).map(x => x.split(',').map(s => s.replace(/^"|"$/g, ''))) }; };
const med = a => a.reduce((x, y) => x + y, 0) / a.length;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
const iso = d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;

// --- 1. CIERRES. qqq-oc validado contra el underlying de las 16:00 (err medio $0,069).
//     barsPAR NO es el cierre de sesion (err medio $0,77, peor $4,99) -> descartado.
const cQ = new Map(JSON.parse(fs.readFileSync(`${N}/qqq-oc.json`, 'utf8')).map(x => [x.d, x.c]));
const cS = new Map(Object.entries(JSON.parse(fs.readFileSync(`${R}/cierres/SPY.json`, 'utf8'))).map(([d, c]) => [iso(d), c]));
const cSpar = new Map(); for (const f of fs.readdirSync(R)) { if (!/^SPY_barsPAR_y_/.test(f)) continue; for (const x of JSON.parse(fs.readFileSync(`${R}/${f}`, 'utf8'))) cSpar.set(x.time, x.close); }

// --- 2. SPOT por hora (theta-griegas: underlying_price, FOTO del instante).
const spot = {}; for (const h of HORAS) spot[h] = new Map();
for (const f of fs.readdirSync(GRIEG)) {
  const d = csv(`${GRIEG}/${f}`), iT = d.h.indexOf('timestamp'), iC = d.h.indexOf('close');
  for (const r of d.rows) { const hh = r[iT].slice(11, 16); if (spot[hh]) spot[hh].set(r[iT].slice(0, 10), +r[iC]); }
}

// --- 3. CADENAS INTRADIA.
const cadenas = [];
for (const f of fs.readdirSync(INTRA).filter(x => /^QQQ_\d{4}-\d\d-\d\d_\d{4}-\d\d-\d\d\.csv$/.test(x)).sort()) {
  const [, fecha, exp] = f.replace('.csv', '').split('_');
  const d = csv(`${INTRA}/${f}`);
  const iK = d.h.indexOf('strike'), iT = d.h.indexOf('timestamp'), iB = d.h.indexOf('bid'), iA = d.h.indexOf('ask');
  const porHora = {};
  for (const r of d.rows) { const hh = r[iT].slice(11, 16); if (!HORAS.includes(hh)) continue; (porHora[hh] ??= []).push({ k: +r[iK], b: +r[iB], a: +r[iA] }); }
  cadenas.push({ fecha, exp, porHora });
}

// --- 4. ENTRADAS por geometria. Cero look-ahead: todo se decide con la foto de esa hora.
function entradas(otm, hora) {
  const out = [];
  for (const c of cadenas) {
    const S = spot[hora].get(c.fecha); if (!(S > 0)) continue;
    const cad = c.porHora[hora]; if (!cad?.length) continue;
    if (cQ.get(c.exp) == null) continue;              // sin cierre del vencimiento no hay liquidacion
    const obj = S * (1 - otm);
    let mej = null, dif = Infinity;
    for (const x of cad) { if (x.k > S) continue; const e = Math.abs(x.k - obj); if (e < dif) { dif = e; mej = x; } }
    if (!mej || dif > S * 0.01) continue;
    if (!(mej.b > 0 && mej.a >= mej.b)) continue;
    const settle = Math.max(0, mej.k - cQ.get(c.exp));
    out.push({
      fecha: c.fecha, exp: c.exp, ticker: 'QQQ', spot: S, strike: mej.k, bid: mej.b, ask: mej.a,
      otmReal: (S - mej.k) / S, horq: (mej.a - mej.b) / ((mej.a + mej.b) / 2),
      settle, pnl: (mej.b - settle - FEE / 100) / mej.k,      // retorno sobre el nocional (K*100)
      colateral: mej.k * 100,
    });
  }
  return out;
}

// --- 5. SIMULACION. NAV marcado los viernes AL CIERRE. Put abierta a `hora` (antes del cierre).
const viernesTodos = [...cQ.keys()].filter(d => new Date(d + 'T00:00:00Z').getUTCDay() === 5).sort();
function simula(ents, desde, hasta) {
  const porFecha = new Map(ents.map(e => [e.fecha, e]));
  const marks = viernesTodos.filter(d => d >= desde && d <= hasta);
  const sem = [];
  for (let i = 0; i < marks.length - 1; i++) {
    const t = marks[i], t1 = marks[i + 1];
    const rEq = cQ.get(t1) / cQ.get(t) - 1;
    const e = porFecha.get(t);
    const rPut = (e && e.exp === t1) ? e.pnl : 0;
    const rSpy = (cS.get(t) && cS.get(t1)) ? cS.get(t1) / cS.get(t) - 1 : null;
    const rSpyP = (cSpar.get(t) && cSpar.get(t1)) ? cSpar.get(t1) / cSpar.get(t) - 1 : null;
    sem.push({ t, t1, rEq, rPut, conPut: !!(e && e.exp === t1), rSpy, rSpyP, e });
  }
  return sem;
}
const curva = (sem, f) => { let v = 1; const c = [v]; for (const s of sem) { const r = f(s); if (r == null) { c.push(v); continue; } v *= 1 + r; c.push(v); } return c; };
const caida = c => { let pico = c[0], mx = 0; for (const v of c) { if (v > pico) pico = v; mx = Math.max(mx, 1 - v / pico); } return mx; };
const cagr = (c, sem) => { const d = (Date.parse(sem[sem.length - 1].t1) - Date.parse(sem[0].t)) / 86400000; return (c[c.length - 1]) ** (365 / d) - 1; };
const MEZ = s => 0.5 * s.rEq + 0.5 * s.rPut;
function resumen(sem) {
  const cM = curva(sem, MEZ), cQq = curva(sem, s => s.rEq), cSp = curva(sem, s => s.rSpy), cSpP = curva(sem, s => s.rSpyP);
  const rs = sem.map(MEZ);
  return {
    n: sem.length, nPut: sem.filter(s => s.conPut).length, desde: sem[0].t, hasta: sem[sem.length - 1].t1,
    cagrM: cagr(cM, sem), cagrQ: cagr(cQq, sem), cagrS: cagr(cSp, sem), cagrSP: cagr(cSpP, sem),
    ddM: caida(cM), ddQ: caida(cQq), ddS: caida(cSp), ddSP: caida(cSpP),
    peor: Math.min(...rs), cola5: med([...rs].sort((a, b) => a - b).slice(0, Math.max(1, Math.round(rs.length * 0.05)))),
  };
}
function corrPut(sem) {
  const A = sem.filter(s => s.conPut);
  const x = A.map(s => s.rEq), y = A.map(s => s.rPut);
  const mx = med(x), my = med(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  const baja = A.filter(s => s.rEq < 0);
  return { n: A.length, corr: sxy / Math.sqrt(sxx * syy), beta: sxy / sxx, nBaja: baja.length, putEnBaja: med(baja.map(s => s.rPut)), eqEnBaja: med(baja.map(s => s.rEq)) };
}
const pct = x => (x == null || !isFinite(x) ? ' n/d ' : (100 * x).toFixed(1) + '%');
const usd = x => '$' + Math.round(x).toLocaleString('es-ES');

// ========= A . RADIOGRAFIA + inventario de la geometria base =========
const BASE = entradas(0.03, '12:00');
console.log(`\n${'='.repeat(95)}\nA . LA PUT BASE - 3% OTM, viernes a las 12:00, vence el viernes siguiente\n${'='.repeat(95)}`);
console.log(`ficheros de cadena intradia: ${cadenas.length} . entradas validas (bid>0, strike en rejilla, cierre del venc): ${BASE.length}`);
radiografia(BASE, ['spot', 'strike', 'bid', 'ask', 'otmReal', 'horq', 'settle', 'pnl'], 'put semanal QQQ 3% OTM a las 12:00', { cerosLegitimos: ['settle'] });
console.log(`\nOTM real mediano ${pct(q(BASE.map(x => x.otmReal), .5))} . horquilla mediana ${pct(q(BASE.map(x => x.horq), .5))} . prima mediana $${q(BASE.map(x => x.bid), .5).toFixed(2)}`);
console.log(`acaban DENTRO del dinero: ${BASE.filter(x => x.settle > 0).length}/${BASE.length} (${pct(BASE.filter(x => x.settle > 0).length / BASE.length)})`);
console.log(`\nnumero de pruebas declaradas: ${PRUEBAS} geometrias (${OTMS.length} OTM x ${HORAS.length} horas) -> liston de |t| = ${listonT(PRUEBAS).toFixed(2)}`);

// ========= B . REPRODUCCION, periodo completo =========
const semTodo = simula(BASE, '2020-01-01', '2026-12-31');
const rTodo = resumen(semTodo), cor = corrPut(semTodo);
console.log(`\n${'='.repeat(95)}\nB . REPRODUCCION - periodo completo ${rTodo.desde} -> ${rTodo.hasta}\n${'='.repeat(95)}`);
console.log(`semanas ${rTodo.n} . con put viva ${rTodo.nPut} (${pct(rTodo.nPut / rTodo.n)})`);
console.log(`\n                        %/ano     caida    $/ano sobre ${usd(CUENTA)}   caida en $`);
const linea = (nom, c, d) => console.log(`  ${nom.padEnd(22)} ${pct(c).padStart(7)}  ${pct(d).padStart(7)}   ${(isFinite(c) ? usd(CUENTA * c) : 'n/d').padStart(10)}      ${(isFinite(d) ? usd(CUENTA * d) : 'n/d').padStart(10)}`);
linea('MEZCLA 50/50', rTodo.cagrM, rTodo.ddM);
linea('QQQ comprado 100%', rTodo.cagrQ, rTodo.ddQ);
linea('SPY 100% (desde 2021)', rTodo.cagrS, rTodo.ddS);
linea('SPY 100% barsPAR*', rTodo.cagrSP, rTodo.ddSP);
console.log(`  * barsPAR NO es el cierre de sesion (err medio $1,07). Unica serie de SPY que llega a 2020. Solo orientativa.`);
console.log(`\nla correlacion: put contra QQQ, semana a semana (n=${cor.n})`);
console.log(`  correlacion ${cor.corr.toFixed(3)} . beta ${cor.beta.toFixed(3)}`);
console.log(`  en las ${cor.nBaja} semanas de BAJADA de QQQ: QQQ ${pct(cor.eqEnBaja)} . la put ${pct(cor.putEnBaja)}`);
console.log(`  peor semana de la mezcla ${pct(rTodo.peor)} . media del 5% peor ${pct(rTodo.cola5)}`);

// ========= C . ANO A ANO, sin promediar =========
console.log(`\n${'='.repeat(95)}\nC . ANO A ANO (sin promediar)\n${'='.repeat(95)}`);
console.log(`  ano  sem  put   MEZCLA   caida     QQQ    caida     SPY    caida    $ mezcla   $ QQQ`);
const anos = [...new Set(semTodo.map(s => s.t.slice(0, 4)))].sort();
for (const a of anos) {
  const S = semTodo.filter(s => s.t.startsWith(a)); if (!S.length) continue;
  const cM = curva(S, MEZ), cQq = curva(S, s => s.rEq), cSp = curva(S, s => s.rSpy);
  const rM = cM[cM.length - 1] - 1, rQ = cQq[cQq.length - 1] - 1, rS = S.every(s => s.rSpy == null) ? null : cSp[cSp.length - 1] - 1;
  console.log(`  ${a}  ${String(S.length).padStart(3)}  ${String(S.filter(s => s.conPut).length).padStart(3)}  ${pct(rM).padStart(7)} ${pct(caida(cM)).padStart(7)}  ${pct(rQ).padStart(7)} ${pct(caida(cQq)).padStart(7)}  ${(rS == null ? ' n/d ' : pct(rS)).padStart(7)} ${(rS == null ? ' n/d ' : pct(caida(cSp))).padStart(7)}  ${usd(CUENTA * rM).padStart(9)} ${usd(CUENTA * rQ).padStart(9)}`);
}
console.log('  (2020 empieza el 2020-01-03 y 2026 acaba en julio: son anos parciales)');

// ========= D . PARTIR LA MUESTRA =========
const fechas = BASE.map(x => x.fecha).sort();
const CORTE = fechas[Math.floor(fechas.length / 2)];
console.log(`\n${'='.repeat(95)}\nD . PARTIR LA MUESTRA - corte en ${CORTE}\n${'='.repeat(95)}`);
const H1 = ['2020-01-01', CORTE], H2 = [CORTE, '2026-12-31'];
console.log(`\nD.1 . la MISMA especificacion (3% / 12:00) en cada mitad:\n`);
console.log(`  mitad                 sem  put   MEZCLA   caida     QQQ    caida     SPY    caida   corr  put-en-bajada`);
for (const [nom, [a, b]] of [['1a ' + H1[0].slice(0, 7) + '-' + H1[1].slice(0, 7), H1], ['2a ' + H2[0].slice(0, 7) + '-' + H2[1].slice(0, 7), H2]]) {
  const S = simula(BASE, a, b), r = resumen(S), c = corrPut(S);
  console.log(`  ${nom.padEnd(20)} ${String(r.n).padStart(4)} ${String(r.nPut).padStart(4)}  ${pct(r.cagrM).padStart(7)} ${pct(r.ddM).padStart(7)}  ${pct(r.cagrQ).padStart(7)} ${pct(r.ddQ).padStart(7)}  ${pct(r.cagrS).padStart(7)} ${pct(r.ddS).padStart(7)}  ${c.corr.toFixed(2).padStart(5)}  ${pct(c.putEnBaja).padStart(7)}`);
}

// --- D.2 elegir geometria POR RIESGO en una mitad, aplicarla TAL CUAL a la otra
console.log(`\nD.2 . elegir la geometria POR RIESGO (menor caida) en una mitad y aplicarla a la otra:\n`);
const cache = new Map();
const geo = (o, h) => { const k = `${o}|${h}`; if (!cache.has(k)) cache.set(k, entradas(o, h)); return cache.get(k); };
function barrido(a, b) {
  const out = [];
  for (const o of OTMS) for (const h of HORAS) {
    const S = simula(geo(o, h), a, b); if (S.filter(x => x.conPut).length < 50) continue;
    const r = resumen(S); out.push({ o, h, ...r });
  }
  return out;
}
const bH1 = barrido(...H1), bH2 = barrido(...H2);
for (const [nomA, A, nomB, B, bar] of [['1a mitad', H1, '2a mitad', H2, bH1], ['2a mitad', H2, '1a mitad', H1, bH2]]) {
  const porRiesgo = [...bar].sort((x, y) => x.ddM - y.ddM);
  const porDinero = [...bar].sort((x, y) => y.cagrM - x.cagrM);
  const eleg = porRiesgo[0], elegD = porDinero[0];
  const fuera = resumen(simula(geo(eleg.o, eleg.h), ...B));
  const fueraD = resumen(simula(geo(elegD.o, elegD.h), ...B));
  console.log(`  elegido en ${nomA} POR RIESGO: OTM ${(100 * eleg.o).toFixed(0)}% a las ${eleg.h}  ->  dentro ${pct(eleg.cagrM)}/${pct(eleg.ddM)}  .  FUERA (${nomB}) ${pct(fuera.cagrM)}/${pct(fuera.ddM)}  = ${usd(CUENTA * fuera.cagrM)}/ano`);
  console.log(`  elegido en ${nomA} POR DINERO: OTM ${(100 * elegD.o).toFixed(0)}% a las ${elegD.h}  ->  dentro ${pct(elegD.cagrM)}/${pct(elegD.ddM)}  .  FUERA (${nomB}) ${pct(fueraD.cagrM)}/${pct(fueraD.ddM)}  = ${usd(CUENTA * fueraD.cagrM)}/ano`);
  const base = bar.find(x => x.o === 0.03 && x.h === '12:00');
  console.log(`     (la base 3%/12:00 en ${nomA}: ${pct(base.cagrM)}/${pct(base.ddM)} . puesto ${porRiesgo.findIndex(x => x.o === 0.03 && x.h === '12:00') + 1}/${bar.length} por riesgo, ${porDinero.findIndex(x => x.o === 0.03 && x.h === '12:00') + 1}/${bar.length} por dinero)`);
}
const rho = (A, B, key) => {
  const kb = new Map(B.map(x => [`${x.o}|${x.h}`, x]));
  const pares = A.filter(x => kb.has(`${x.o}|${x.h}`)).map(x => [x[key], kb.get(`${x.o}|${x.h}`)[key]]);
  const rk = v => { const s = [...v].map((x, i) => [x, i]).sort((p, r) => p[0] - r[0]); const o = new Array(v.length); s.forEach(([, i], j) => o[i] = j); return o; };
  const x = rk(pares.map(p => p[0])), y = rk(pares.map(p => p[1]));
  const mx = med(x), my = med(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return { n: pares.length, r: sxy / Math.sqrt(sxx * syy) };
};
console.log(`\n  que se hereda entre mitades sobre las ${bH1.length} geometrias?`);
for (const [k, nom] of [['ddM', 'caida (riesgo)'], ['cola5', 'media del 5% peor'], ['cagrM', 'ingreso %/ano']]) {
  const r = rho(bH1, bH2, k); console.log(`     ${nom.padEnd(20)} rho(1a,2a) = ${r.r >= 0 ? '+' : ''}${r.r.toFixed(2)}  (n=${r.n})`);
}

// ========= E . TERCIOS =========
console.log(`\n${'='.repeat(95)}\nE . TERCIOS (dos mitades aprueban lo que tres tercios matan)\n${'='.repeat(95)}`);
const c1 = fechas[Math.floor(fechas.length / 3)], c2 = fechas[Math.floor(2 * fechas.length / 3)];
console.log(`  tercio                sem  put   MEZCLA   caida     QQQ    caida   corr  put-en-bajada`);
for (const [nom, a, b] of [['1o', '2020-01-01', c1], ['2o', c1, c2], ['3o', c2, '2026-12-31']]) {
  const S = simula(BASE, a, b), r = resumen(S), c = corrPut(S);
  console.log(`  ${(nom + ' ' + a.slice(0, 7) + '-' + b.slice(0, 7)).padEnd(20)} ${String(r.n).padStart(4)} ${String(r.nPut).padStart(4)}  ${pct(r.cagrM).padStart(7)} ${pct(r.ddM).padStart(7)}  ${pct(r.cagrQ).padStart(7)} ${pct(r.ddQ).padStart(7)}  ${c.corr.toFixed(2).padStart(5)}  ${pct(c.putEnBaja).padStart(7)}`);
}

// ========= F . EL TAMANO =========
console.log(`\n${'='.repeat(95)}\nF . EL TAMANO - la mezcla usa contratos FRACCIONARIOS. Robinhood no los vende.\n${'='.repeat(95)}`);
const col = BASE.map(x => x.colateral);
const ult = BASE[BASE.length - 1];
console.log(`  colateral de 1 contrato: mediana ${usd(q(col, .5))} . ultimo ${usd(ult.colateral)} (${ult.fecha}) . maximo ${usd(Math.max(...col))}`);
console.log(`  "la otra mitad" de la cuenta = ${usd(CUENTA / 2)} -> contratos que caben HOY: ${(CUENTA / 2 / ult.colateral).toFixed(2)}  (hace falta 1 entero)`);
console.log(`  semanas en que 1 contrato NO cabe en EFECTIVO (${usd(EFECTIVO)}): ${col.filter(c => c > EFECTIVO).length}/${col.length}`);
console.log(`  semanas en que 1 contrato NO cabe en PODER DE COMPRA (${usd(PODER)}): ${col.filter(c => c > PODER).length}/${col.length}`);
const semUlt = semTodo.slice(-52).filter(s => s.conPut);
const pnl1 = semUlt.map(s => s.e.pnl * s.e.colateral);
console.log(`  con 1 CONTRATO ENTERO en el ultimo ano: prima+resultado medio ${usd(med(pnl1))}/semana . peor ${usd(Math.min(...pnl1))} . ${usd(med(pnl1) * 48)}/ano`);
console.log(`  ese contrato pone ${usd(ult.colateral)} de nocional sobre una cuenta de ${usd(CUENTA)} = ${(100 * ult.colateral / CUENTA).toFixed(0)}% -> no es "media cuenta", es ${(ult.colateral / (CUENTA / 2)).toFixed(1)}x la mitad`);
const peorSem = [...semTodo].filter(s => s.conPut).sort((a, b) => a.e.pnl - b.e.pnl)[0];
console.log(`  peor semana con 1 contrato entero: ${peorSem.t} -> ${usd(peorSem.e.pnl * peorSem.e.colateral)} (${pct(peorSem.e.pnl * peorSem.e.colateral / CUENTA)} de la cuenta) SALEN DEL EFECTIVO de ${usd(EFECTIVO)}`);

// ========= G . EL LISTON HONESTO - QQQ AJUSTADO AL MISMO RIESGO =========
// La mezcla tiene beta ~0,58 a QQQ. Compararla con QQQ al 100% mide sobre todo que lleva
// menos riesgo. El listON que hay que batir es "w% de QQQ + resto en efectivo" con la MISMA
// caida. El efectivo va al 0%: como el colateral de la put tambien va al 0%, el interES se
// cancela entre las dos patas y la comparaciOn queda limpia.
function mezclaW(sem, w) { return curva(sem, s => w * (0.5 * s.rEq + 0.5 * s.rPut)); }
function qqqW(sem, w) { return curva(sem, s => w * s.rEq); }
function buscaW(sem, ddObj) {   // w de QQQ+efectivo que iguala la caida objetivo
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (caida(qqqW(sem, m)) < ddObj) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const vol = (sem, f) => { const r = sem.map(f), m = med(r); return Math.sqrt(med(r.map(x => (x - m) ** 2)) * 52); };
console.log(`\n${'='.repeat(95)}\nG . EL LISTON HONESTO - QQQ bajado al MISMO riesgo que la mezcla\n${'='.repeat(95)}`);
console.log(`  periodo                  MEZCLA          QQQ al mismo riesgo      diferencia`);
for (const [nom, a, b] of [['completo', '2020-01-01', '2026-12-31'], ['1a mitad', ...H1], ['2a mitad', ...H2], ['1er tercio', '2020-01-01', c1], ['2o tercio', c1, c2], ['3er tercio', c2, '2026-12-31']]) {
  const S = simula(BASE, a, b), r = resumen(S);
  const w = buscaW(S, r.ddM);
  const cW = qqqW(S, w), cagrW = cagr(cW, S);
  const dif = r.cagrM - cagrW;
  console.log(`  ${nom.padEnd(12)} ${pct(r.cagrM).padStart(7)}/${pct(r.ddM).padStart(6)}   ${(100 * w).toFixed(0)}% QQQ ${pct(cagrW).padStart(7)}/${pct(caida(cW)).padStart(6)}   ${(dif >= 0 ? '+' : '') + pct(dif)}  = ${usd(CUENTA * dif)}/ano`);
}
console.log(`\n  y contra "50% QQQ + 50% efectivo al 0%" (aisla lo que aporta la put, sin ajustar riesgo):`);
for (const [nom, a, b] of [['completo', '2020-01-01', '2026-12-31'], ['1a mitad', ...H1], ['2a mitad', ...H2]]) {
  const S = simula(BASE, a, b), r = resumen(S);
  const c5 = qqqW(S, 0.5), g5 = cagr(c5, S);
  console.log(`  ${nom.padEnd(12)} mezcla ${pct(r.cagrM).padStart(7)}/${pct(r.ddM).padStart(6)} . 50/50 con efectivo ${pct(g5).padStart(7)}/${pct(caida(c5)).padStart(6)} . la put aporta ${(r.cagrM - g5 >= 0 ? '+' : '') + pct(r.cagrM - g5)} = ${usd(CUENTA * (r.cagrM - g5))}/ano`);
}
console.log(`\n  volatilidad anual: mezcla ${pct(vol(semTodo, MEZ))} . QQQ ${pct(vol(semTodo, s => s.rEq))} . ratio ${(vol(semTodo, MEZ) / vol(semTodo, s => s.rEq)).toFixed(2)}`);

// ========= H . SUBIRLE EL TAMANO CON EL MARGEN QUE TIENE =========
console.log(`\n${'='.repeat(95)}\nH . SUBIRLE EL TAMANO - poder de compra ${usd(PODER)} sobre ${usd(CUENTA)} = ${(PODER / CUENTA).toFixed(2)}x, margen al 5%\n${'='.repeat(95)}`);
console.log(`  apalanc.   MEZCLA %/ano   caida    $/ano      contra QQQ 100% (${pct(rTodo.cagrQ)}/${pct(rTodo.ddQ)})`);
for (const w of [1, 1.1, 1.2, 1.31, 1.5, 2]) {
  const c = curva(semTodo, s => w * MEZ(s) - (w - 1) * 0.05 / 52);
  const g = cagr(c, semTodo), d = caida(c);
  const cabe = w <= PODER / CUENTA ? 'cabe' : 'NO CABE en la cuenta';
  console.log(`   ${w.toFixed(2)}x      ${pct(g).padStart(7)}    ${pct(d).padStart(6)}   ${usd(CUENTA * g).padStart(8)}     ${g > rTodo.cagrQ ? 'gana en $' : 'pierde en $'} . ${d < rTodo.ddQ ? 'menos caida' : 'mas caida'}   ${cabe}`);
}
// el mismo apalancamiento en cada mitad, para que no sea un numero de una sola pasada
console.log(`\n  el 1,31x (lo que da su poder de compra) en cada trozo:`);
for (const [nom, a, b] of [['1a mitad', ...H1], ['2a mitad', ...H2], ['1er tercio', '2020-01-01', c1], ['2o tercio', c1, c2], ['3er tercio', c2, '2026-12-31']]) {
  const S = simula(BASE, a, b);
  const c = curva(S, s => 1.31 * MEZ(s) - 0.31 * 0.05 / 52), g = cagr(c, S), d = caida(c);
  const r = resumen(S);
  console.log(`   ${nom.padEnd(12)} ${pct(g).padStart(7)}/${pct(d).padStart(6)}  contra QQQ ${pct(r.cagrQ).padStart(7)}/${pct(r.ddQ).padStart(6)}  ${g > r.cagrQ ? 'GANA' : 'pierde'} en dinero, ${d < r.ddQ ? 'con menos caida' : 'con mas caida'}`);
}

// ========= I . LO QUE DE VERDAD SALE DEL EFECTIVO =========
console.log(`\n${'='.repeat(95)}\nI . EL EFECTIVO (${usd(EFECTIVO)}) - las perdidas de la put salen de ahi\n${'='.repeat(95)}`);
for (const [nom, nocional] of [['fraccionario (50% de la cuenta = ' + usd(CUENTA / 2) + ')', CUENTA / 2], ['1 CONTRATO ENTERO hoy (' + usd(ult.colateral) + ')', ult.colateral]]) {
  const perd = semTodo.filter(s => s.conPut).map(s => ({ t: s.t, d: s.e.pnl * nocional }));
  let acum = 0, peorAcum = 0, tPeor = '';
  for (const p of perd) { acum = Math.min(0, acum + p.d); if (acum < peorAcum) { peorAcum = acum; tPeor = p.t; } }
  const negs = perd.filter(p => p.d < 0);
  console.log(`  ${nom}`);
  console.log(`     peor semana ${usd(Math.min(...perd.map(p => p.d)))} . racha acumulada peor ${usd(peorAcum)} (hasta ${tPeor}) . ${negs.length}/${perd.length} semanas en perdida`);
  console.log(`     -> ${peorAcum < -EFECTIVO ? 'AGOTA EL EFECTIVO de ' + usd(EFECTIVO) : 'cabe en el efectivo de ' + usd(EFECTIVO)} (${(100 * Math.abs(peorAcum) / EFECTIVO).toFixed(0)}% del efectivo)`);
}

// ========= J . EL EXCESO SOBRE EL LISTON, SEMANA A SEMANA, CON SU t =========
// Serie semanal: exceso = mezcla - (w*QQQ), con w FIJADO en la mitad de ajuste para igualar
// la caida. Asi el exceso no es un artefacto de llevar menos riesgo.
function excesoSerie(sem, w) { return sem.map(s => MEZ(s) - w * s.rEq); }
function tDe(v) { const m = med(v), sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); return { m, t: m / (sd / Math.sqrt(v.length)), n: v.length, anual: m * 52 }; }
console.log(`\n${'='.repeat(95)}\nJ . EL EXCESO SOBRE EL LISTON, CON SU t  (liston de Bonferroni con ${PRUEBAS} pruebas: |t| > ${listonT(PRUEBAS).toFixed(2)})\n${'='.repeat(95)}`);
const semH1 = simula(BASE, ...H1), semH2 = simula(BASE, ...H2);
const wH1 = buscaW(semH1, resumen(semH1).ddM), wH2 = buscaW(semH2, resumen(semH2).ddM);
console.log(`\n  DIRECCION 1 - w ajustado en la 1a mitad (w=${(100 * wH1).toFixed(0)}% QQQ), aplicado TAL CUAL a la 2a:`);
for (const [nom, S] of [['1a (dentro, ajuste)', semH1], ['2a (FUERA)', semH2]]) {
  const e = tDe(excesoSerie(S, wH1));
  console.log(`     ${nom.padEnd(22)} exceso ${pct(e.anual).padStart(7)}/ano = ${usd(CUENTA * e.anual).padStart(7)} . t = ${e.t.toFixed(2).padStart(5)} . ${Math.abs(e.t) > listonT(PRUEBAS) ? 'PASA' : 'NO pasa'} el liston`);
}
console.log(`\n  DIRECCION 2 - w ajustado en la 2a mitad (w=${(100 * wH2).toFixed(0)}% QQQ), aplicado TAL CUAL a la 1a:`);
for (const [nom, S] of [['2a (dentro, ajuste)', semH2], ['1a (FUERA)', semH1]]) {
  const e = tDe(excesoSerie(S, wH2));
  console.log(`     ${nom.padEnd(22)} exceso ${pct(e.anual).padStart(7)}/ano = ${usd(CUENTA * e.anual).padStart(7)} . t = ${e.t.toFixed(2).padStart(5)} . ${Math.abs(e.t) > listonT(PRUEBAS) ? 'PASA' : 'NO pasa'} el liston`);
}
console.log(`\n  y en TERCIOS, con el w del periodo completo (w=${(100 * buscaW(semTodo, rTodo.ddM)).toFixed(0)}%):`);
const wT = buscaW(semTodo, rTodo.ddM);
for (const [nom, a, b] of [['1er tercio', '2020-01-01', c1], ['2o tercio', c1, c2], ['3er tercio', c2, '2026-12-31']]) {
  const e = tDe(excesoSerie(simula(BASE, a, b), wT));
  console.log(`     ${nom.padEnd(22)} exceso ${pct(e.anual).padStart(7)}/ano = ${usd(CUENTA * e.anual).padStart(7)} . t = ${e.t.toFixed(2).padStart(5)}`);
}

// ========= K . LA GEOMETRIA ELEGIDA POR RIESGO, CONTRA EL MISMO LISTON, FUERA DE MUESTRA =========
console.log(`\n${'='.repeat(95)}\nK . la geometria elegida POR RIESGO, medida FUERA contra QQQ al mismo riesgo\n${'='.repeat(95)}`);
for (const [nomA, A, nomB, B, bar] of [['1a mitad', H1, '2a mitad', H2, bH1], ['2a mitad', H2, '1a mitad', H1, bH2]]) {
  const eleg = [...bar].sort((x, y) => x.ddM - y.ddM)[0];
  const ents = geo(eleg.o, eleg.h);
  const Sf = simula(ents, ...B);
  const MZ = s => 0.5 * s.rEq + 0.5 * s.rPut;
  const cM = curva(Sf, MZ), ddF = caida(cM), cagrF = cagr(cM, Sf);
  const w = buscaW(Sf, ddF), cW = qqqW(Sf, w), gW = cagr(cW, Sf);
  const e = tDe(Sf.map(s => MZ(s) - w * s.rEq));
  console.log(`  elegido en ${nomA} (OTM ${(100 * eleg.o).toFixed(0)}% a las ${eleg.h}) -> en ${nomB}: ${pct(cagrF)}/${pct(ddF)} contra ${(100 * w).toFixed(0)}% QQQ ${pct(gW)}/${pct(caida(cW))}`);
  console.log(`     exceso ${pct(e.anual)}/ano = ${usd(CUENTA * e.anual)} . t = ${e.t.toFixed(2)} . ${Math.abs(e.t) > listonT(PRUEBAS) ? 'PASA' : 'NO pasa'} el liston de ${listonT(PRUEBAS).toFixed(2)}`);
}
