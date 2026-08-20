// MEZCLA · PROPORCION — paso 2: barrido 11 proporciones x 7 distancias = 77 combinaciones.
// Se ELIGE POR RIESGO (caida), nunca por $/año, y se comprueba en la mitad que no eligio.
import fs from 'node:fs';
import { listonT } from '../lib/barreraHallazgos.ts';

const R = 'scripts/cache-theta';
const NOCHE = `${R}/noche-2026-08-10`;
const CUENTA = 56389;

const DIST = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07];
const PESOS = [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1];   // peso del INDICE
const PRUEBAS = PESOS.length * DIST.length;                 // 77

const mas = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const oc = JSON.parse(fs.readFileSync(`${NOCHE}/qqq-oc.json`, 'utf8'));
const cQQQ = new Map(oc.map((x) => [x.d, x.c]));
const habil = new Set(oc.map((x) => x.d));
const px = (m, d) => { for (let k = 0; k < 7; k++) { const x = mas(d, -k); if (m.has(x)) return m.get(x); } return null; };

const cSPY = new Map();
for (const f of fs.readdirSync(R)) {
  if (!/^SPY_barsPAR_y_\d+_\d+\.json$/.test(f)) continue;
  for (const x of JSON.parse(fs.readFileSync(`${R}/${f}`, 'utf8'))) cSPY.set(x.time, x.close);
}

const ops = JSON.parse(fs.readFileSync(`${R}/_mezcla-ops.json`, 'utf8'));
const porFechaDist = new Map();
for (const o of ops) porFechaDist.set(`${o.fecha}|${o.dist}`, o);

// ── rejilla COMPLETA de viernes (la pata de indice corre siempre; la de put va a caja si falta dato)
const semanas = [];
{
  let d = '2020-01-03';
  while (mas(d, 7) <= '2026-07-31') {
    const a = px(cQQQ, d), b = px(cQQQ, mas(d, 7));
    const sa = px(cSPY, d), sb = px(cSPY, mas(d, 7));
    if (a != null && b != null) semanas.push({ d, exp: mas(d, 7), rQ: b / a - 1, rS: sa != null && sb != null ? sb / sa - 1 : null, habilViernes: habil.has(d) });
    d = mas(d, 7);
  }
}
const anos = (Date.parse(semanas[semanas.length - 1].exp) - Date.parse(semanas[0].d)) / 86400000 / 365.25;

console.log('## LA REJILLA');
console.log(`   ${semanas.length} semanas · ${semanas[0].d} → ${semanas[semanas.length - 1].exp} · ${anos.toFixed(2)} años`);
for (const x of DIST) {
  const con = semanas.filter((s) => porFechaDist.has(`${s.d}|${x}`)).length;
  if (x === DIST[0] || x === DIST[DIST.length - 1]) console.log(`   distancia ${(100 * x).toFixed(0)}%: ${con} semanas con put · ${semanas.length - con} en CAJA (festivos/sin dato)`);
}
const sinPut = semanas.filter((s) => !porFechaDist.has(`${s.d}|0.03`));
const mQ = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`   las ${sinPut.length} semanas sin put: QQQ rindio ${(100 * mQ(sinPut.map((s) => s.rQ))).toFixed(2)}% de media contra ${(100 * mQ(semanas.filter((s) => porFechaDist.has(`${s.d}|0.03`)).map((s) => s.rQ))).toFixed(2)}% las otras`);

// ── una carrera
function correr(sems, wIdx, dist) {
  let eq = CUENTA, pico = CUENTA, dd = 0, ddD = 0, peor = 0, peorD = 0, peorSem = null;
  let itm = 0, conPut = 0, primaBruta = 0, recompras = 0;
  const curva = [];
  for (const s of sems) {
    const o = porFechaDist.get(`${s.d}|${dist}`);
    const rPut = o ? o.rPut : 0;
    if (o) { conPut++; itm += o.itm; primaBruta += o.bid * 100; recompras += o.recompra * 100; }
    const r = wIdx * s.rQ + (1 - wIdx) * rPut;
    const antes = eq;
    eq *= 1 + r;
    if (r < peor) { peor = r; peorD = eq - antes; peorSem = s.d; }
    if (eq > pico) pico = eq;
    const c = (pico - eq) / pico;
    if (c > dd) { dd = c; ddD = pico - eq; }
    curva.push({ d: s.exp, eq, r });
  }
  const cagr = (eq / CUENTA) ** (1 / (sems.length * 7 / 365.25)) - 1;
  return {
    wIdx, dist, eq, cagr, dd, ddD, peor, peorD, peorSem,
    dolAno: (eq - CUENTA) / (sems.length * 7 / 365.25),
    pctItm: conPut ? itm / conPut : 0, conPut, primaBruta, recompras, curva,
  };
}

// ── el barrido, en las dos mitades y en el total
const mitad = Math.floor(semanas.length / 2);
const H1 = semanas.slice(0, mitad), H2 = semanas.slice(mitad);
const bloques = { TODO: semanas, H1, H2 };
console.log(`   mitad 1: ${H1[0].d} → ${H1[H1.length - 1].exp} (${H1.length})  ·  mitad 2: ${H2[0].d} → ${H2[H2.length - 1].exp} (${H2.length})`);

const rej = {};
for (const [nom, sems] of Object.entries(bloques)) {
  rej[nom] = [];
  for (const w of PESOS) for (const x of DIST) rej[nom].push(correr(sems, w, x));
}

const fmt = (v) => (v >= 0 ? '+' : '') + (100 * v).toFixed(1);
const tabla = (nom, campo, f = fmt) => {
  console.log(`\n### ${nom}`);
  console.log('   %ind │ ' + DIST.map((x) => (100 * x).toFixed(0).padStart(7) + '%').join(''));
  for (const w of PESOS) {
    const fila = DIST.map((x) => { const c = rej[nom.split(' ')[0]] ? null : null; return null; });
    console.log('   ' + (100 * w).toFixed(0).padStart(4) + ' │ ' + DIST.map((x) => f(campo(rej[nom.split(' ')[0]].find((c) => c.wIdx === w && c.dist === x))).padStart(8)).join(''));
  }
};

console.log('\n\n═══ TODO EL PERIODO (2020-01 → 2026-07) ═══');
tabla('TODO · CAIDA MAXIMA % de la cuenta', (c) => c.dd, (v) => (100 * v).toFixed(1));
tabla('TODO · $/año sobre $56.389', (c) => c.dolAno, (v) => Math.round(v).toLocaleString('es'));
tabla('TODO · PEOR SEMANA %', (c) => c.peor, (v) => (100 * v).toFixed(1));
tabla('TODO · % de semanas ASIGNADAS (la put acaba ITM)', (c) => c.pctItm, (v) => (100 * v).toFixed(0));

// ── el liston
const liston = rej.TODO.find((c) => c.wIdx === 1 && c.dist === 0.03);
let eqS = CUENTA, picoS = CUENTA, ddS = 0;
for (const s of semanas) { if (s.rS == null) continue; eqS *= 1 + s.rS; if (eqS > picoS) picoS = eqS; ddS = Math.max(ddS, (picoS - eqS) / picoS); }
console.log('\n## EL LISTON — comprar y no hacer nada');
console.log(`   comprar QQQ : ${(100 * liston.cagr).toFixed(1)}%/año · $${Math.round(liston.dolAno).toLocaleString('es')}/año · caida ${(100 * liston.dd).toFixed(0)}% ($${Math.round(liston.ddD).toLocaleString('es')}) · peor semana ${(100 * liston.peor).toFixed(1)}%`);
console.log(`   comprar SPY : ${(100 * ((eqS / CUENTA) ** (1 / anos) - 1)).toFixed(1)}%/año · $${Math.round((eqS - CUENTA) / anos).toLocaleString('es')}/año · caida ${(100 * ddS).toFixed(0)}%`);
console.log('   AVISO: los dos SIN DIVIDENDOS. No hay fichero de dividendos en el repo y precios-ajustados.json');
console.log('          esta roto (fecha +4d y el cociente ajustado/crudo BAJA en el 40% de los pasos).');
console.log('          El liston esta INFRAVALORADO en ~0,5-1,3 puntos/año. La caida NO cambia.');

// ── ¿SE HEREDA EL RIESGO? el test que ordena todo
const spearman = (a, b) => {
  const rank = (v) => { const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = new Array(v.length); idx.forEach(([, i], k) => { r[i] = k; }); return r; };
  const ra = rank(a), rb = rank(b), n = a.length;
  const m = (z) => z.reduce((x, y) => x + y, 0) / n;
  const ma = m(ra), mb = m(rb);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (ra[i] - ma) * (rb[i] - mb); sxx += (ra[i] - ma) ** 2; syy += (rb[i] - mb) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
};
const clave = (c) => `${c.wIdx}|${c.dist}`;
const m1 = new Map(rej.H1.map((c) => [clave(c), c])), m2 = new Map(rej.H2.map((c) => [clave(c), c]));
const ks = [...m1.keys()];
console.log('\n\n═══ ¿SE HEREDA EL RIESGO EN ESTA REJILLA? (77 combinaciones, mitad 1 vs mitad 2) ═══');
console.log(`   caida maxima : ρ = ${spearman(ks.map((k) => m1.get(k).dd), ks.map((k) => m2.get(k).dd)).toFixed(2)}`);
console.log(`   peor semana  : ρ = ${spearman(ks.map((k) => -m1.get(k).peor), ks.map((k) => -m2.get(k).peor)).toFixed(2)}`);
console.log(`   $/año        : ρ = ${spearman(ks.map((k) => m1.get(k).dolAno), ks.map((k) => m2.get(k).dolAno)).toFixed(2)}`);
// solo entre distancias, con el peso fijo (¿el ρ del ingreso viene del peso o de la distancia?)
for (const w of [0.5]) {
  const kk = DIST.map((x) => `${w}|${x}`);
  console.log(`   con el peso FIJO al ${100 * w}% de indice, solo la distancia:`);
  console.log(`      caida ρ = ${spearman(kk.map((k) => m1.get(k).dd), kk.map((k) => m2.get(k).dd)).toFixed(2)} · $/año ρ = ${spearman(kk.map((k) => m1.get(k).dolAno), kk.map((k) => m2.get(k).dolAno)).toFixed(2)}`);
}

// ── ELECCION POR RIESGO: presupuesto de caida fijado de antemano, se coge la que mas se le acerca SIN pasarse
function elegirPorRiesgo(rejilla, presupuesto) {
  const cand = rejilla.filter((c) => c.dd <= presupuesto);
  if (!cand.length) return null;
  return cand.reduce((a, b) => (b.dd > a.dd ? b : a));    // la que APURA el presupuesto
}
const ddListonH1 = rej.H1.find((c) => c.wIdx === 1 && c.dist === 0.03).dd;
const ddListonH2 = rej.H2.find((c) => c.wIdx === 1 && c.dist === 0.03).dd;

console.log('\n\n═══ ELEGIR POR RIESGO Y COMPROBAR EN LA OTRA MITAD ═══');
console.log('   La regla: fijar un PRESUPUESTO DE CAIDA antes de mirar nada, y coger la combinacion que');
console.log('   mas se le acerca sin pasarse. En la eleccion NO entra ni un solo dolar de ingreso.');
const resultados = [];
for (const [etq, presu] of [['la MITAD de la caida del indice', null], ['10% de la cuenta', .10], ['15% de la cuenta', .15], ['20% de la cuenta', .20]]) {
  for (const [ida, vuelta, nomI, nomV, ddL] of [[rej.H1, m2, '1a mitad', '2a mitad', ddListonH1], [rej.H2, m1, '2a mitad', '1a mitad', ddListonH2]]) {
    const p = presu ?? ddL / 2;
    const el = elegirPorRiesgo(ida, p);
    if (!el) { console.log(`\n   [${etq}] elegida en la ${nomI}: NINGUNA combinacion cumple`); continue; }
    const fu = vuelta.get(clave(el));
    const tot = rej.TODO.find((c) => c.wIdx === el.wIdx && c.dist === el.dist);
    const cumple = fu.dd <= p;
    console.log(`\n   [${etq} = ${(100 * p).toFixed(1)}%]  elegida con la ${nomI} → ${(100 * el.wIdx).toFixed(0)}% indice / ${(100 * (1 - el.wIdx)).toFixed(0)}% put al ${(100 * el.dist).toFixed(0)}%`);
    console.log(`      ${nomI} (donde se eligio): caida ${(100 * el.dd).toFixed(1)}% · ${(100 * el.cagr).toFixed(1)}%/año · $${Math.round(el.dolAno).toLocaleString('es')}/año`);
    console.log(`      ${nomV} (NO participo)  : caida ${(100 * fu.dd).toFixed(1)}% · ${(100 * fu.cagr).toFixed(1)}%/año · $${Math.round(fu.dolAno).toLocaleString('es')}/año   → presupuesto ${cumple ? 'RESPETADO' : 'ROTO'}`);
    console.log(`      periodo entero          : caida ${(100 * tot.dd).toFixed(1)}% ($${Math.round(tot.ddD).toLocaleString('es')}) · ${(100 * tot.cagr).toFixed(1)}%/año · $${Math.round(tot.dolAno).toLocaleString('es')}/año · peor semana ${(100 * tot.peor).toFixed(1)}% ($${Math.round(tot.peorD).toLocaleString('es')}, ${tot.peorSem}) · asignada ${(100 * tot.pctItm).toFixed(0)}% de las semanas`);
    resultados.push({ etq, nomI, el, fu, tot, cumple, presu: p });
  }
}

fs.writeFileSync(`${R}/_mezcla-rejilla.json`, JSON.stringify({ rej, semanas: semanas.length, anos }));
console.log(`\n\nliston de t con ${PRUEBAS} pruebas declaradas: |t| >= ${listonT(PRUEBAS).toFixed(2)}`);
