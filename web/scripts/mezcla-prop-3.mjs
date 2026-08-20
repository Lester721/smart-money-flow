// MEZCLA · PROPORCION — paso 3:
//   A) el muro del TAMAÑO: que parte de la rejilla es ejecutable de verdad
//   B) año a año de la combinacion elegida por riesgo
//   C) EL PUENTE: la misma pata pero como VERTICAL (put spread), que es lo unico que cabe en
//      $7.977 de efectivo y es un boton en Robinhood.
import fs from 'node:fs';
import { radiografia } from '../lib/radiografia.ts';
import { listonT } from '../lib/barreraHallazgos.ts';

const R = 'scripts/cache-theta';
const NOCHE = `${R}/noche-2026-08-10`;
const INTRA = `${NOCHE}/theta-intra`;
const GRIEG = `${NOCHE}/theta-griegas`;
const VENC = `${NOCHE}/theta-venc`;
const CUENTA = 56389, EFECTIVO = 7977, PODER = 73874;
const DIST = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07];
const ANCHOS = [5, 10, 20];
const TASA = 0.03, TOL = 0.005, HORA = '12:00';

const csv = (p) => { const l = fs.readFileSync(p, 'utf8').trim().split(/\r?\n/); const h = l[0].split(',').map((s) => s.replace(/^"|"$/g, '')); return { h, rows: l.slice(1).map((x) => x.split(',').map((s) => s.replace(/^"|"$/g, ''))) }; };
const mas = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const q = (a, p) => { const s = a.slice().sort((u, v) => u - v); return s[Math.floor(p * (s.length - 1))]; };
const dol = (v) => (v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('es');

const oc = JSON.parse(fs.readFileSync(`${NOCHE}/qqq-oc.json`, 'utf8'));
const cQQQ = new Map(oc.map((x) => [x.d, x.c]));
const px = (d) => { for (let k = 0; k < 7; k++) { const x = mas(d, -k); if (cQQQ.has(x)) return cQQQ.get(x); } return null; };
const ops = JSON.parse(fs.readFileSync(`${R}/_mezcla-ops.json`, 'utf8'));

// ═══ A · EL MURO DEL TAMAÑO ═══════════════════════════════════════════════════════════════════
console.log('═══ A · EL MURO DEL TAMAÑO — la rejilla es de porcentajes; el contrato es indivisible ═══\n');
for (const x of [0.01, 0.03, 0.07]) {
  const o = ops.filter((r) => r.dist === x);
  const ult = o[o.length - 1];
  console.log(`   put al ${(100 * x).toFixed(0)}%: colateral asegurado-en-efectivo (strike x 100) mediana ${dol(q(o.map((r) => r.colateral), .5))} · ULTIMA semana (${ult.fecha}) ${dol(ult.colateral)}`);
  console.log(`      → ese contrato solo es la "mitad de la cuenta" si la mitad vale ${dol(ult.colateral)}. La mitad de Lester son ${dol(CUENTA / 2)}.`);
  console.log(`      → 1 contrato = ${(100 * ult.colateral / CUENTA).toFixed(0)}% de la cuenta. Semanas en que NO cabe en el efectivo (${dol(EFECTIVO)}): ${o.filter((r) => r.colateral > EFECTIVO).length} de ${o.length}`);
  console.log(`      → semanas en que no cabe en el PODER DE COMPRA (${dol(PODER)}): ${o.filter((r) => r.colateral > PODER).length} de ${o.length}`);
}
{
  const o = ops.filter((r) => r.dist === 0.03);
  const pesoReal = o.map((r) => r.colateral / CUENTA);
  console.log(`\n   El peso de la pata de put que UN contrato impone, semana a semana (distancia 3%):`);
  console.log(`      2020 ${(100 * pesoReal[0]).toFixed(0)}% → 2026 ${(100 * pesoReal[pesoReal.length - 1]).toFixed(0)}% · mediana ${(100 * q(pesoReal, .5)).toFixed(0)}% · nunca por debajo del ${(100 * Math.min(...pesoReal)).toFixed(0)}%`);
  console.log(`      La rejilla barre del 0% al 100%. Con un contrato entero de QQQ el peso NO es elegible:`);
  console.log(`      hoy vale el ${(100 * pesoReal[pesoReal.length - 1]).toFixed(0)}% de la cuenta. La celda "50% put" NO EXISTE en la vida real.`);
}

// ═══ B · AÑO A AÑO de la elegida por riesgo (50% indice / 50% put al 3%) ══════════════════════
console.log('\n\n═══ B · AÑO A AÑO — 50% indice / 50% put al 3% (la que eligio el riesgo) ═══\n');
const porFechaDist = new Map(ops.map((o) => [`${o.fecha}|${o.dist}`, o]));
const semanas = [];
{ let d = '2020-01-03'; while (mas(d, 7) <= '2026-07-31') { const a = px(d), b = px(mas(d, 7)); if (a != null && b != null) semanas.push({ d, exp: mas(d, 7), rQ: b / a - 1 }); d = mas(d, 7); } }

function carrera(sems, w, dist) {
  let eq = CUENTA, pico = CUENTA, dd = 0; const rs = [];
  for (const s of sems) {
    const o = porFechaDist.get(`${s.d}|${dist}`);
    const r = w * s.rQ + (1 - w) * (o ? o.rPut : 0);
    rs.push(r); eq *= 1 + r; if (eq > pico) pico = eq; dd = Math.max(dd, (pico - eq) / pico);
  }
  return { eq, dd, rs };
}
const anosLista = [...new Set(semanas.map((s) => s.d.slice(0, 4)))].sort();
console.log('   año │  mezcla 50/50 @3%          │  comprar QQQ');
console.log('       │    $/año     caida  peor   │    $/año     caida');
const porAno = [];
for (const a of anosLista) {
  const ss = semanas.filter((s) => s.d.startsWith(a));
  const m = carrera(ss, 0.5, 0.03), i = carrera(ss, 1, 0.03);
  const dM = CUENTA * (m.eq / CUENTA - 1), dI = CUENTA * (i.eq / CUENTA - 1);
  console.log(`   ${a} │ ${dol(dM).padStart(9)}  ${(100 * m.dd).toFixed(0).padStart(4)}%  ${(100 * Math.min(...m.rs)).toFixed(1).padStart(5)}%  │ ${dol(dI).padStart(9)}  ${(100 * i.dd).toFixed(0).padStart(4)}%   (${ss.length} sem)`);
  porAno.push(`${a}: mezcla ${dol(dM)}/caida ${(100 * m.dd).toFixed(0)}% · QQQ ${dol(dI)}/caida ${(100 * i.dd).toFixed(0)}%`);
}

// t de la mezcla contra el liston, semana a semana, en la mitad que NO eligio
{
  const H2 = semanas.slice(Math.floor(semanas.length / 2));
  const m = carrera(H2, 0.5, 0.03), i = carrera(H2, 1, 0.03);
  const dif = m.rs.map((r, k) => r - i.rs[k]);
  const md = dif.reduce((x, y) => x + y, 0) / dif.length;
  const sd = Math.sqrt(dif.reduce((x, y) => x + (y - md) ** 2, 0) / (dif.length - 1));
  console.log(`\n   La mezcla MENOS el liston, semana a semana, en la 2a mitad (la que no eligio):`);
  console.log(`      media ${(100 * md).toFixed(3)}%/semana · t = ${(md / (sd / Math.sqrt(dif.length))).toFixed(2)} · liston con 98 pruebas = ${listonT(98).toFixed(2)}`);
  console.log(`      → en DINERO no separa del indice. Lo unico que cambia de verdad es la caida.`);
}

// ═══ C · EL PUENTE — la misma pata como VERTICAL ══════════════════════════════════════════════
console.log('\n\n═══ C · EL PUENTE — la put como VERTICAL, que es lo unico que cabe en ' + dol(EFECTIVO) + ' ═══\n');
const spot12 = new Map();
for (const f of fs.readdirSync(GRIEG)) { const { h, rows } = csv(`${GRIEG}/${f}`); const iT = h.indexOf('timestamp'), iC = h.indexOf('close'); for (const r of rows) if (r[iT].slice(11, 16) === HORA) spot12.set(r[iT].slice(0, 10), +r[iC]); }
const vencCache = new Map();
const cotVenc = (exp, K) => {
  if (!vencCache.has(exp)) { const p = `${VENC}/QQQ_${exp}_P.csv`; if (!fs.existsSync(p)) vencCache.set(exp, null); else { const d = csv(p); const iK = d.h.indexOf('strike'), iA = d.h.indexOf('ask'), iB = d.h.indexOf('bid'); const m = new Map(); for (const r of d.rows) m.set((+r[iK]).toFixed(3), { b: +r[iB], a: +r[iA] }); vencCache.set(exp, m); } }
  const m = vencCache.get(exp); return m ? m.get(K.toFixed(3)) ?? null : null;
};

const fIntra = fs.readdirSync(INTRA).filter((f) => /^QQQ_\d{4}-\d\d-\d\d_\d{4}-\d\d-\d\d\.csv$/.test(f)).sort();
const vert = [];
const fallo = { sinLargo: 0, creditoNoPositivo: 0, sinCierreVenc: 0 };
for (const f of fIntra) {
  const [, fecha, exp] = f.replace('.csv', '').split('_');
  const S = spot12.get(fecha); if (!(S > 0)) continue;
  const C = px(exp); if (C == null) continue;
  const d = csv(`${INTRA}/${f}`);
  const iK = d.h.indexOf('strike'), iT = d.h.indexOf('timestamp'), iB = d.h.indexOf('bid'), iA = d.h.indexOf('ask');
  const cad = new Map();
  for (const r of d.rows) { if (r[iT].slice(11, 16) !== HORA) continue; cad.set((+r[iK]).toFixed(3), { k: +r[iK], b: +r[iB], a: +r[iA] }); }
  if (!cad.size) continue;
  const lista = [...cad.values()];
  for (const x of DIST) {
    const obj = S * (1 - x);
    let corto = null, dif = Infinity;
    for (const c of lista) { if (c.k > S) continue; const e = Math.abs(c.k - obj); if (e < dif) { dif = e; corto = c; } }
    if (!corto || dif > S * TOL || !(corto.b > 0)) continue;
    for (const W of ANCHOS) {
      const largo = cad.get((corto.k - W).toFixed(3));
      if (!largo || !(largo.a > 0)) { fallo.sinLargo++; continue; }
      const credito = corto.b - largo.a;                       // vender al BID, comprar al ASK
      if (!(credito > 0)) { fallo.creditoNoPositivo++; continue; }
      let cierre = 0, cerrado = false;
      if (C < corto.k) {                                        // hay que deshacerla
        const qc = cotVenc(exp, corto.k), ql = cotVenc(exp, largo.k);
        if (!qc || !(qc.a > 0)) { fallo.sinCierreVenc++; continue; }
        cierre = qc.a - (ql ? ql.b : 0);                        // recomprar al ASK, vender al BID
        cerrado = true;
      }
      const riesgo = W * 100 - credito * 100;
      const pnl = (credito - cierre) * 100 - TASA * (cerrado ? 4 : 2);
      vert.push({ fecha, exp, dist: x, ancho: W, spot: S, kC: corto.k, kL: largo.k, credito, cierre, riesgo, pnl, rVert: pnl / riesgo, itm: C < corto.k ? 1 : 0 });
    }
  }
}
console.log(`   verticales construidas: ${vert.length} · descartes: sin la pata larga ${fallo.sinLargo} · credito<=0 ${fallo.creditoNoPositivo} · sin cotizacion al vencimiento ${fallo.sinCierreVenc}\n`);
radiografia(vert, ['spot', 'kC', 'kL', 'credito', 'riesgo', 'rVert'], 'vertical de puts QQQ a las 12:00', { cerosLegitimos: ['cierre'] });

console.log('\n   ancho  dist │  credito medio   riesgo/contrato   contratos que caben en ' + dol(EFECTIVO) + '   $/año con ESE tamaño   acierto');
const puente = [];
for (const W of ANCHOS) {
  for (const x of DIST) {
    const o = vert.filter((v) => v.ancho === W && v.dist === x);
    if (o.length < 50) continue;
    const riesgoMed = q(o.map((v) => v.riesgo), .5);
    const n = Math.floor(EFECTIVO / riesgoMed);
    const pnlAno = o.reduce((a, v) => a + v.pnl, 0) / 6.57;
    const acierto = o.filter((v) => v.pnl > 0).length / o.length;
    puente.push({ W, x, n, pnlAno, riesgoMed, o, acierto });
    console.log(`   ${String(W).padStart(4)}$  ${(100 * x).toFixed(0).padStart(2)}% │ ${('$' + (100 * o.reduce((a, v) => a + v.credito, 0) / o.length).toFixed(0)).padStart(8)}   ${dol(riesgoMed).padStart(10)}   ${String(n).padStart(12)}   ${dol(pnlAno * n).padStart(14)}   ${(100 * acierto).toFixed(0).padStart(5)}%`);
  }
}

// la vertical con el tamaño que cabe, mezclada con el indice: caida en % de la cuenta
console.log('\n   Con el tamaño que el EFECTIVO permite, mezclado con el resto de la cuenta en QQQ:');
console.log('   ancho dist  n │ $/año TOTAL   caida % cuenta   peor semana   vs LISTON (QQQ solo: $18.977/año, caida 35%)');
const porFV = new Map(vert.map((v) => [`${v.fecha}|${v.dist}|${v.ancho}`, v]));
const resPuente = [];
for (const p of puente) {
  // el capital en riesgo de las verticales sale del EFECTIVO; el resto de la cuenta sigue en el indice
  const wIdx = 1 - (p.n * p.riesgoMed) / CUENTA;
  let eq = CUENTA, pico = CUENTA, dd = 0, peor = 0;
  for (const s of semanas) {
    const v = porFV.get(`${s.d}|${p.x}|${p.W}`);
    const rV = v ? (v.pnl * p.n) / (p.n * p.riesgoMed) : 0;
    const r = wIdx * s.rQ + (1 - wIdx) * rV;
    peor = Math.min(peor, r); eq *= 1 + r; if (eq > pico) pico = eq; dd = Math.max(dd, (pico - eq) / pico);
  }
  const dAno = (eq - CUENTA) / 6.57;
  resPuente.push({ ...p, wIdx, dAno, dd, peor, eq });
  console.log(`   ${String(p.W).padStart(4)}$ ${(100 * p.x).toFixed(0).padStart(2)}% ${String(p.n).padStart(2)} │ ${dol(dAno).padStart(10)}   ${(100 * dd).toFixed(1).padStart(11)}%   ${(100 * peor).toFixed(1).padStart(10)}%   ${dAno > 18977 ? 'GANA en dinero' : 'pierde en dinero'} / ${dd < 0.355 ? 'GANA en caida' : 'pierde en caida'}`);
}

// mitades del puente: elegir por riesgo en una, comprobar en la otra
const mit = Math.floor(semanas.length / 2);
console.log('\n   MITADES del puente (elegir por caida en una mitad, comprobar en la otra):');
function corrPuente(sems, p) {
  const wIdx = 1 - (p.n * p.riesgoMed) / CUENTA;
  let eq = CUENTA, pico = CUENTA, dd = 0;
  for (const s of sems) { const v = porFV.get(`${s.d}|${p.x}|${p.W}`); const rV = v ? v.pnl / p.riesgoMed : 0; const r = wIdx * s.rQ + (1 - wIdx) * rV; eq *= 1 + r; if (eq > pico) pico = eq; dd = Math.max(dd, (pico - eq) / pico); }
  return { dd, dAno: (eq - CUENTA) / (sems.length * 7 / 365.25) };
}
for (const [ida, vueltaSems, nomI, nomV] of [[semanas.slice(0, mit), semanas.slice(mit), '1a', '2a'], [semanas.slice(mit), semanas.slice(0, mit), '2a', '1a']]) {
  const cand = resPuente.map((p) => ({ p, ...corrPuente(ida, p) })).filter((c) => c.dd <= 0.20);
  if (!cand.length) { console.log(`      ${nomI} mitad: ninguna vertical baja del 20% de caida`); continue; }
  const el = cand.reduce((a, b) => (b.dd > a.dd ? b : a));
  const fu = corrPuente(vueltaSems, el.p);
  console.log(`      elegida en la ${nomI} mitad (presupuesto 20%): ancho $${el.p.W}, distancia ${(100 * el.p.x).toFixed(0)}%, ${el.p.n} contratos → caida ${(100 * el.dd).toFixed(1)}%`);
  console.log(`         en la ${nomV} mitad (no participo): caida ${(100 * fu.dd).toFixed(1)}% · ${dol(fu.dAno)}/año → presupuesto ${fu.dd <= 0.20 ? 'RESPETADO' : 'ROTO'}`);
}

fs.writeFileSync(`${R}/_mezcla-puente.json`, JSON.stringify(resPuente.map(({ o, ...r }) => r)));
fs.writeFileSync(`${R}/_mezcla-vert.json`, JSON.stringify(vert));
console.log(`
guardadas ${vert.length} verticales en ${R}/_mezcla-vert.json`);
