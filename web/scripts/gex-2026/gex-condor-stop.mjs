// ¿STOP LOSS? — cortar cuando la pérdida abierta llegue al 25, 50, 75 o 100% del riesgo.
//
// La regla pre-registrada sostiene al cierre. Pero cerrar antes nunca se probó en ESTA
// estructura, y en este proyecto ha fallado tres veces en otras (gestión TP25%/SL1×, objetivo de
// beneficio en los 7 tickers, stops en el spread 0DTE: 19 de 20 peor).
//
// Aquí se mide de verdad: se entra a las 11:00 y se valora el cóndor en CADA foto de 5 minutos
// del resto del día con las cotizaciones reales. Cerrar significa deshacer las cuatro patas
// cruzando la horquilla otra vez (recomprar las cortas al ask, vender las largas al bid).
//
// Se leen los ficheros día a día para no reventar la memoria.

import fs from 'node:fs';
const DIR = process.argv[2] || 'scripts/cache-theta/gex-2026';
const SEP = 25, ALA = 50, COMM = 0.03, HORA = '11:00', PASO = 5;

const nd = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p; };
const phi = x => 0.3989423 * Math.exp(-x * x / 2);
const d1f = (S, K, T, v) => (Math.log(S / K) + (v * v / 2) * T) / (v * Math.sqrt(T));
const gamma = (S, K, T, v) => phi(d1f(S, K, T, v)) / (S * v * Math.sqrt(T));

function leerLado(dia, lado) {
  const f = `${DIR}/iv_${dia}_${lado}.csv`;
  if (!fs.existsSync(f)) return null;
  const lin = fs.readFileSync(f, 'utf8').split('\n'), cab = lin[0].split(',');
  const iK = cab.indexOf('strike'), iT = cab.indexOf('timestamp'), iB = cab.indexOf('bid'),
        iA = cab.indexOf('ask'), iM = cab.indexOf('midpoint'), iV = cab.indexOf('implied_vol'), iU = cab.indexOf('underlying_price');
  const porHora = new Map();
  for (let n = 1; n < lin.length; n++) {
    const c = lin[n].split(','); if (c.length < cab.length) continue;
    const h = c[iT].slice(11, 16), U = +c[iU];
    if (!porHora.has(h)) porHora.set(h, { U: 0, q: new Map() });
    const g = porHora.get(h); if (U > 0) g.U = U;
    const bid = +c[iB], ask = +c[iA], mid = +c[iM], iv = +c[iV];
    if (!(bid > 0) || !(ask > 0) || ask < bid || !(mid > 0) || !(iv > 0.01) || iv > 4) continue;
    if ((ask - bid) / mid > 0.5) continue;
    g.q.set(+c[iK], { bid, ask, mid, iv });
  }
  return porHora;
}
function leerOI(dia) {
  const f = `${DIR}/oi_${dia}.csv`; if (!fs.existsSync(f)) return null;
  const lin = fs.readFileSync(f, 'utf8').split('\n'), cab = lin[0].split(',');
  const iK = cab.indexOf('strike'), iT = cab.indexOf('timestamp'), iO = cab.indexOf('open_interest'), iR = cab.indexOf('right');
  const oi = { C: new Map(), P: new Map() };
  for (let n = 1; n < lin.length; n++) {
    const c = lin[n].split(','); if (c.length < cab.length) continue;
    if (c[iT].slice(0, 10) !== dia) continue;
    const v = +c[iO]; if (v > 0) oi[c[iR].replace(/"/g, '') === 'CALL' ? 'C' : 'P'].set(+c[iK], v);
  }
  return oi;
}

const dias = fs.readdirSync(DIR).filter(f => f.startsWith('oi_')).map(f => f.slice(3, 13)).sort();
const OBJETIVOS = [0.25, 0.50, 0.75, 1.00];   // ahora son STOPS: % del riesgo
const res = { cierre: [], ...Object.fromEntries(OBJETIVOS.map(x => [x, []])) };
let n = 0;

for (const dia of dias) {
  const P = leerLado(dia, 'P'), C = leerLado(dia, 'C'), oi = leerOI(dia);
  if (!P || !C || !oi) continue;
  const g0P = P.get(HORA), g0C = C.get(HORA);
  if (!g0P || !g0C || !(g0C.U > 0)) continue;
  const U = g0C.U;
  const T0 = (16 * 60 - 660) / 60 / 24 / 365;

  // GEX a las 11:00
  let gC = 0, gP = 0;
  for (const [lado, mapa, oim] of [['C', g0C.q, oi.C], ['P', g0P.q, oi.P]])
    for (const [K, q] of mapa) {
      const o = oim.get(K); if (!o) continue;
      const gm = gamma(U, K, T0, q.iv); if (!isFinite(gm) || gm <= 0) continue;
      const $ = gm * o * 100 * U * U * 0.01; if (!isFinite($)) continue;
      if (lado === 'C') gC += $; else gP += $;
    }
  if (gC - gP <= 0) continue;                       // el veto

  const red = x => Math.round(x / PASO) * PASO;
  const Kc = red(U) + SEP, Kp = red(U) - SEP;
  const c0 = g0C.q.get(Kc), cA0 = g0C.q.get(Kc + ALA), p0 = g0P.q.get(Kp), pA0 = g0P.q.get(Kp - ALA);
  if (!c0 || !cA0 || !p0 || !pA0) continue;
  const credito = c0.bid + p0.bid - cA0.ask - pA0.ask;
  if (!(credito > 0.2) || credito > ALA) continue;
  n++;

  // el cierre real: la última foto con precio
  const horas = [...C.keys()].filter(h => h > HORA).sort();
  const ultima = horas[horas.length - 1];
  const S = C.get(ultima)?.U ?? U;
  const perdF = Math.min(Math.max(S - Kc, 0), ALA) + Math.min(Math.max(Kp - S, 0), ALA);
  res.cierre.push({ dia, ret: ((credito - perdF) * 100 - 8 * COMM) / (ALA * 100) });

  // recorrido intradía: coste de deshacer en cada foto
  for (const obj of OBJETIVOS) {
    let salida = null;
    for (const h of horas) {
      const gc = C.get(h), gp = P.get(h); if (!gc || !gp) continue;
      const c = gc.q.get(Kc), cA = gc.q.get(Kc + ALA), p = gp.q.get(Kp), pA = gp.q.get(Kp - ALA);
      if (!c || !cA || !p || !pA) continue;
      // deshacer: recomprar las cortas al ASK, vender las largas al BID
      const coste = c.ask + p.ask - cA.bid - pA.bid;
      // STOP: la pérdida abierta (lo que cuesta deshacer menos lo que cobraste) medida
      // contra el RIESGO de la operación (ancho − crédito)
      const riesgo = ALA - credito;
      const perdidaAbierta = coste - credito;
      if (perdidaAbierta >= riesgo * obj) { salida = { h, coste }; break; }
    }
    const ret = salida
      ? ((credito - salida.coste) * 100 - 16 * COMM) / (ALA * 100)     // 8 patas: entrar y salir
      : ((credito - perdF) * 100 - 8 * COMM) / (ALA * 100);
    res[obj].push({ dia, ret, cerradoAntes: !!salida, hora: salida?.h });
  }
}

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const st = a => { const m = mean(a), sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
  return { m, med: med(a), t: m / (sd / Math.sqrt(a.length)), win: a.filter(x => x > 0).length / a.length, peor: Math.min(...a) }; };

console.log(`═══ ¿STOP LOSS? — cóndor ±25/alas 50, días GEX+, ${n} operaciones ═══\n`);
console.log('regla                     acierto   media    mediana    t     peor día   \$/año   cortadas por stop');
{
  const s = st(res.cierre.map(x => x.ret));
  const años = 2.6;
  console.log(`SOSTENER al cierre         ${(s.win * 100).toFixed(0).padStart(3)}%   ${(s.m * 100).toFixed(2).padStart(6)}%  ${(s.med * 100).toFixed(2).padStart(7)}%  ${s.t.toFixed(2).padStart(5)}   ${(s.peor * 5000).toFixed(0).padStart(7)}   ${(s.m * 5000 * n / años).toFixed(0).padStart(6)}      —`);
  for (const obj of OBJETIVOS) {
    const g = res[obj]; const ss = st(g.map(x => x.ret));
    const antes = g.filter(x => x.cerradoAntes);
    console.log(`stop al ${(obj * 100).toFixed(0)}% del riesgo  ${(ss.win * 100).toFixed(0).padStart(3)}%   ${(ss.m * 100).toFixed(2).padStart(6)}%  ${(ss.med * 100).toFixed(2).padStart(7)}%  ${ss.t.toFixed(2).padStart(5)}   ${(ss.peor * 5000).toFixed(0).padStart(7)}   ${(ss.m * 5000 * n / años).toFixed(0).padStart(6)}     ${antes.length} (${(antes.length / g.length * 100).toFixed(0)}%)`);
  }
}
console.log('\n(el \$/año supone 1 contrato y ~55 operaciones al año, riesgo \$5.000)');
console.log('(cortar paga la horquilla DOS veces: 8 patas en vez de 4)');
console.log('(el stop se comprueba al cierre de cada foto de 5 min: uno intradía saltaría ANTES y PEOR)');
