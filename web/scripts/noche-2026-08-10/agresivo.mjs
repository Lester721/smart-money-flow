// MÁS AGRESIVO + STOP LOSS. La idea de Lester: acercarse al dinero para cobrar más, y cortar
// la cola con un stop.
//
// Dos ejes a la vez, con cotizaciones reales:
//   AGRESIVIDAD: strike al 0% / 1% / 2% / 3% / 4% por debajo del spot del viernes a mediodía.
//   STOP: sin stop, o recomprar en cuanto el ask del cierre de un día llegue a N× lo cobrado.
//
// El stop se comprueba al CIERRE de cada día, no intradía. Un stop intradía saltaría antes y
// PEOR (justo en el pico de pánico), así que esto es la versión optimista del stop. Si el stop
// no gana ni así, no gana.
//
// Aviso previo: los stops ya fallaron dos veces en este proyecto (gestión TP25%/SL1× con
// modelo, y objetivo de beneficio con precios reales en los 7 tickers). Pero aquello era lejos
// del dinero y con spreads. Cerca del dinero es otra situación.

import fs from 'node:fs';
import { res, met, med } from './intradia-lib.mjs';
const S = process.argv[2];
const COMM = 0.03;
const P = JSON.parse(fs.readFileSync(S + '/precios.json', 'utf8'));
const px = new Map(P.QQQ.map(b => [b.d, b.c]));
const cerca = (d) => { for (let k = 0; k < 8; k++) { const x = new Date(new Date(d) - k * 864e5).toISOString().slice(0, 10); if (px.has(x)) return px.get(x); } return null; };

// spot y cadena del viernes a mediodía (ya validados, sin look-ahead)
const entradaPorViernes = new Map();
for (const o of res.get('12:00')) entradaPorViernes.set(o.rolo, o);

// cadena intradía del viernes de entrada, para poder elegir OTRO strike distinto al 3%
function cadenaEntrada(rolo, exp) {
  const f = `${S}/theta-intra/QQQ_${rolo}_${exp}.csv`;
  if (!fs.existsSync(f)) return null;
  const lin = fs.readFileSync(f, 'utf8').split('\n'), cab = lin[0].split(',');
  const iK = cab.indexOf('strike'), iT = cab.indexOf('timestamp'), iB = cab.indexOf('bid'), iA = cab.indexOf('ask');
  const m = new Map();
  for (let n = 1; n < lin.length; n++) {
    const c = lin[n].split(','); if (c.length < cab.length) continue;
    if (c[iT]?.slice(11, 16) !== '12:00') continue;
    const bid = +c[iB], ask = +c[iA]; if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
    const mid = (bid + ask) / 2; if ((ask - bid) / mid > 0.5) continue;
    m.set(+c[iK], { bid, ask, mid });
  }
  return m;
}

// Tipo de interés de la semana, sacado de la paridad put-call de la propia cadena.
// Hace falta porque el colateral está en efectivo cobrando letras: son ~3 puntos al año y sin
// ellos esta tabla no se puede comparar con las anteriores.
function leerEOD(f) {
  if (!fs.existsSync(f)) return null;
  const lin = fs.readFileSync(f, 'utf8').split('\n'), cab = lin[0].split(',');
  const iK = cab.indexOf('strike'), iB = cab.indexOf('bid'), iA = cab.indexOf('ask');
  const m = new Map();
  for (let n = 1; n < lin.length; n++) {
    const c = lin[n].split(','); if (c.length < cab.length) continue;
    const bid = +c[iB], ask = +c[iA]; if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
    if ((ask - bid) / ((ask + bid) / 2) > 0.5) continue;
    m.set(+c[iK], (bid + ask) / 2);
  }
  return m;
}
function tipoSemana(rolo, exp) {
  const p = leerEOD(`${S}/theta-sem/QQQ_${rolo}_${exp}_P.csv`), c = leerEOD(`${S}/theta-sem/QQQ_${rolo}_${exp}_C.csv`);
  if (!p || !c) return 0;
  const S0 = cerca(rolo); if (S0 == null) return 0;
  const T = (new Date(exp) - new Date(rolo)) / 365 / 864e5;
  let r = 0, dm = Infinity;
  for (const [K, pm] of p) { const cm = c.get(K); if (cm == null) continue; const d = Math.abs(K - S0);
    if (d < dm) { dm = d; const v = (S0 - cm + pm) / K; const rr = -Math.log(v) / T; if (rr > -0.02 && rr < 0.12) r = rr; } }
  return r;
}

// la semana entera de ese contrato: fecha -> {bid, ask}
function semanaDe(rolo, exp, strike) {
  const f = `${S}/theta-semana/QQQ_${rolo}_${exp}.csv`;
  if (!fs.existsSync(f)) return null;
  const lin = fs.readFileSync(f, 'utf8').split('\n'), cab = lin[0].split(',');
  const iK = cab.indexOf('strike'), iC = cab.indexOf('created'), iB = cab.indexOf('bid'), iA = cab.indexOf('ask');
  const m = new Map();
  for (let n = 1; n < lin.length; n++) {
    const c = lin[n].split(','); if (c.length < cab.length) continue;
    if (+c[iK] !== strike) continue;
    const bid = +c[iB], ask = +c[iA]; if (!(ask > 0)) continue;
    m.set(c[iC].slice(0, 10), { bid, ask });
  }
  return m;
}

function correr({ otm, stopX = null }) {
  const ops = [];
  for (const [rolo, base] of entradaPorViernes) {
    const exp = base.exp;
    const cad = cadenaEntrada(rolo, exp); if (!cad) continue;
    const S0 = base.S0;
    const objetivo = S0 * (1 - otm);
    let K = null, dif = Infinity;
    for (const k of cad.keys()) { if (k > S0) continue; const d = Math.abs(k - objetivo); if (d < dif) { dif = d; K = k; } }
    if (K == null || dif > S0 * 0.01) continue;
    const cobro = cad.get(K).mid;
    if (!(cobro > 0.02)) continue;

    const sem = semanaDe(rolo, exp, K);
    const ST = cerca(exp); if (ST == null) continue;

    let salida = null, fSalida = exp, porStop = false;
    if (stopX != null && sem) {
      const dias = [...sem.keys()].sort().filter(d => d > rolo && d < exp);
      for (const d of dias) {
        const a = sem.get(d).ask;
        if (a >= cobro * stopX) { salida = a; fSalida = d; porStop = true; break; }
      }
    }
    if (salida == null) {
      // desenlace normal: si acaba dentro del dinero se recompra al ask del viernes
      if (ST < K) {
        const a = sem?.get(exp)?.ask;
        salida = a != null ? a : Math.max(K - ST, 0);
      }
    }
    // Intereses del colateral: en efectivo cobra letras hasta que se cierra la posición.
    const r = tipoSemana(rolo, exp);
    const T = (new Date(fSalida) - new Date(rolo)) / 365 / 864e5;
    const interes = K * 100 * (Math.exp(r * T) - 1);
    const pl = (salida == null ? cobro * 100 - COMM : (cobro - salida) * 100 - 2 * COMM) + interes;
    ops.push({ rolo, exp, fSalida, K, S0, ST, cobro, salida, porStop, ret: pl / (K * 100) });
  }
  return ops;
}

function metricas(ops) {
  if (ops.length < 20) return null;
  let eq = 1, pico = 1, dd = 0;
  for (const o of ops) { eq *= (1 + o.ret); pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
  const años = (new Date(ops[ops.length - 1].exp) - new Date(ops[0].rolo)) / 365 / 864e5;
  return { n: ops.length, an: (eq ** (1 / años) - 1) * 100, dd: dd * 100, eq,
           win: ops.filter(o => o.ret > 0).length / ops.length,
           peor: Math.min(...ops.map(o => o.ret)) * 100,
           stops: ops.filter(o => o.porStop).length };
}

console.log('=== MÁS AGRESIVO + STOP — QQQ semanal, entrada viernes 12:00, precios reales ===\n');
console.log('distancia   stop      n   acierto  stops   ANUAL   caída   peor semana');
const tabla = [];
for (const otm of [0, 0.01, 0.02, 0.03, 0.04]) {
  for (const stopX of [null, 2, 3, 4]) {
    const m = metricas(correr({ otm, stopX }));
    if (!m) { continue; }
    tabla.push({ otm, stopX, ...m });
    console.log(`${(otm * 100).toFixed(0)}% fuera   ${(stopX ? stopX + 'x' : 'ninguno').padEnd(8)} ${String(m.n).padStart(4)}   ${(m.win * 100).toFixed(0).padStart(3)}%   ${String(m.stops).padStart(4)}   ${m.an.toFixed(1).padStart(6)}%  ${m.dd.toFixed(0).padStart(4)}%   ${m.peor.toFixed(1).padStart(6)}%`);
  }
  console.log('');
}

const mejor = tabla.reduce((a, b) => (b.an > a.an ? b : a));
console.log(`mejor por retorno: ${(mejor.otm * 100).toFixed(0)}% fuera, stop ${mejor.stopX ?? 'ninguno'} → ${mejor.an.toFixed(1)}%/año, caída ${mejor.dd.toFixed(0)}%`);
const mejorRD = tabla.reduce((a, b) => (b.an / b.dd > a.an / a.dd ? b : a));
console.log(`mejor por retorno/caída: ${(mejorRD.otm * 100).toFixed(0)}% fuera, stop ${mejorRD.stopX ?? 'ninguno'} → ${mejorRD.an.toFixed(1)}%/año, caída ${mejorRD.dd.toFixed(0)}%`);

console.log('\n=== ¿el stop ayuda o estorba? mismo strike, con y sin ===\n');
for (const otm of [0, 0.01, 0.02, 0.03]) {
  const sin = tabla.find(t => t.otm === otm && t.stopX === null);
  if (!sin) continue;
  const con = [2, 3, 4].map(x => tabla.find(t => t.otm === otm && t.stopX === x)).filter(Boolean);
  console.log(`  ${(otm * 100).toFixed(0)}% fuera:  sin stop ${sin.an.toFixed(1)}%  ·  ` +
    con.map(c => `stop ${c.stopX}x → ${c.an.toFixed(1)}% (${c.stops} disparos)`).join('  ·  '));
}

// ─── AUDITORÍA antes de reportar ──────────────────────────────────────────────
console.log('\n\n=== AUDITORÍA ===\n');
console.log('CONTROL: el 3% sin stop tiene que dar ~13,5%/año, que es lo ya validado.');
const ctrl = metricas(correr({ otm: 0.03, stopX: null }));
console.log(`   da ${ctrl.an.toFixed(1)}%/año, caída ${ctrl.dd.toFixed(0)}%   ${Math.abs(ctrl.an - 13.5) < 1 ? '-> CUADRA' : '-> NO CUADRA, revisar'}`);
console.log(`\n¿la curva de distancia es un pico o una meseta? (sin stop)`);
console.log('   ' + [0, 0.01, 0.02, 0.03, 0.04].map(o => `${(o*100).toFixed(0)}% → ${metricas(correr({ otm: o })).an.toFixed(1)}%`).join(' · '));
console.log(`\npartida de la muestra (3% sin stop vs 3% con stop 3x):`);
for (const [n, cfg] of [['sin stop', { otm: 0.03 }], ['stop 3x', { otm: 0.03, stopX: 3 }]]) {
  const ops = correr(cfg);
  const a = metricas(ops.filter(o => o.rolo <= '2022-12-31')), b = metricas(ops.filter(o => o.rolo > '2022-12-31'));
  console.log(`   ${n.padEnd(10)} 2020-2022 ${a.an.toFixed(1)}%  ·  2023-2026 ${b.an.toFixed(1)}%`);
}
console.log(`\n¿el stop hace lo que promete? (recorta la peor semana)`);
for (const otm of [0.02, 0.03]) {
  const s = metricas(correr({ otm })), c = metricas(correr({ otm, stopX: 2 }));
  console.log(`   ${(otm*100).toFixed(0)}% fuera: peor semana ${s.peor.toFixed(1)}% → ${c.peor.toFixed(1)}% con stop 2x.  Pero el anual pasa de ${s.an.toFixed(1)}% a ${c.an.toFixed(1)}%.`);
}
console.log(`\napalancamiento (la otra vía de ser agresivo), 3% sin stop:`);
{
  const ops = correr({ otm: 0.03 });
  for (const lev of [1, 1.5, 2, 2.5]) {
    let eq = 1, pk = 1, dd = 0;
    for (const o of ops) { eq *= (1 + o.ret * lev); pk = Math.max(pk, eq); dd = Math.max(dd, 1 - eq / pk); }
    const años = (new Date(ops[ops.length-1].exp) - new Date(ops[0].rolo)) / 365 / 864e5;
    const an = (eq ** (1 / años) - 1) * 100;
    console.log(`   x${lev}   ${an.toFixed(1).padStart(5)}%/año   caída ${(dd*100).toFixed(0).padStart(3)}%   $60.000 → $${(60000*eq).toFixed(0)}`);
  }
  console.log(`   (referencia: comprar SPY con dividendos 16,6%/año con 36% de caída)`);
}
