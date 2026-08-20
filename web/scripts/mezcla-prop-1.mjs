// MEZCLA · PROPORCION — paso 1: construir las filas (7 distancias x 345 semanas) y radiografiarlas.
// No mide todavia la mezcla: deja el fichero de operaciones y dice de que esta hecho.
import fs from 'node:fs';
import { radiografia } from '../lib/radiografia.ts';

const R = 'scripts/cache-theta';
const NOCHE = `${R}/noche-2026-08-10`;
const INTRA = `${NOCHE}/theta-intra`;
const GRIEG = `${NOCHE}/theta-griegas`;
const VENC = `${NOCHE}/theta-venc`;

const HORA = '12:00';
const DIST = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07];
const TOL = 0.005;          // el strike elegido no puede alejarse mas de 0,5% del objetivo
const TASA = 0.03;          // Robinhood: $0 comision, ~$0,03 de tasas por contrato y lado

const csv = (p) => {
  const l = fs.readFileSync(p, 'utf8').trim().split(/\r?\n/);
  const h = l[0].split(',').map((s) => s.replace(/^"|"$/g, ''));
  return { h, rows: l.slice(1).map((x) => x.split(',').map((s) => s.replace(/^"|"$/g, ''))) };
};
const mas = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ── precios crudos del subyacente (cierre y apertura), 2020-2026
const oc = JSON.parse(fs.readFileSync(`${NOCHE}/qqq-oc.json`, 'utf8'));
const cierre = new Map(oc.map((x) => [x.d, x.c]));
const diasHabiles = oc.map((x) => x.d).sort();
const setHabil = new Set(diasHabiles);
/** cierre del ultimo dia habil EN O ANTES de d */
const pxHasta = (d) => { for (let k = 0; k < 6; k++) { const x = mas(d, -k); if (setHabil.has(x)) return { d: x, c: cierre.get(x) }; } return null; };

// ── spot intradia, del MISMO feed que las cotizaciones (foto del instante, no barra OHLC)
const spot12 = new Map();
for (const f of fs.readdirSync(GRIEG)) {
  const { h, rows } = csv(`${GRIEG}/${f}`);
  const iT = h.indexOf('timestamp'), iC = h.indexOf('close');
  for (const r of rows) if (r[iT].slice(11, 16) === HORA) spot12.set(r[iT].slice(0, 10), +r[iC]);
}

// ── VALIDACION 1: la etiqueta de tiempo del spot. griegas[T] tiene que ser el precio EN T,
//    es decir la APERTURA de la barra que empieza en T, no su cierre (que es media hora despues).
{
  const meses = fs.readdirSync(INTRA).filter((f) => /^spot_\d{4}-\d\d\.csv$/.test(f));
  let nOpen = 0, nClose = 0, n = 0;
  for (const m of meses) {
    const { h, rows } = csv(`${INTRA}/${m}`);
    const iT = h.indexOf('timestamp'), iO = h.indexOf('open'), iC = h.indexOf('close');
    for (const r of rows) {
      const ts = r[iT]; if (ts.slice(11, 16) !== HORA) continue;
      const s = spot12.get(ts.slice(0, 10)); if (s == null || !(+r[iO] > 0)) continue;
      n++;
      if (Math.abs(s - +r[iO]) < 0.02) nOpen++;
      if (Math.abs(s - +r[iC]) < 0.02) nClose++;
    }
  }
  console.log('## VALIDACION · la etiqueta de tiempo del spot');
  console.log(`   n=${n} viernes cruzados con las barras de 30 min del mismo dia`);
  console.log(`   griegas[12:00] == APERTURA de la barra 12:00 (precio EN 12:00): ${nOpen} (${(100 * nOpen / n).toFixed(1)}%)`);
  console.log(`   griegas[12:00] == CIERRE  de la barra 12:00 (precio a las 12:30, FUTURO): ${nClose} (${(100 * nClose / n).toFixed(1)}%)`);
  if (nClose > nOpen) throw new Error('el spot lleva media hora de futuro dentro — PARAR');
}

// ── construir las operaciones
const fIntra = fs.readdirSync(INTRA).filter((f) => /^QQQ_\d{4}-\d\d-\d\d_\d{4}-\d\d-\d\d\.csv$/.test(f)).sort();
const vencCache = new Map();
const askVenc = (exp, K) => {
  if (!vencCache.has(exp)) {
    const p = `${VENC}/QQQ_${exp}_P.csv`;
    if (!fs.existsSync(p)) { vencCache.set(exp, null); }
    else {
      const d = csv(p);
      const iK = d.h.indexOf('strike'), iA = d.h.indexOf('ask'), iB = d.h.indexOf('bid');
      const m = new Map();
      for (const r of d.rows) m.set((+r[iK]).toFixed(3), { b: +r[iB], a: +r[iA] });
      vencCache.set(exp, m);
    }
  }
  const m = vencCache.get(exp);
  return m ? m.get(K.toFixed(3)) ?? null : null;
};

const ops = [];                       // una fila por (viernes, distancia)
const diag = { sinSpot: 0, sinHora: 0, rejilla: 0, sinBid: 0, sinCierreExp: 0, sinVenc: 0 };
for (const f of fIntra) {
  const [, fecha, exp] = f.replace('.csv', '').split('_');
  const S = spot12.get(fecha);
  if (!(S > 0)) { diag.sinSpot += DIST.length; continue; }
  const d = csv(`${INTRA}/${f}`);
  const iK = d.h.indexOf('strike'), iT = d.h.indexOf('timestamp'), iB = d.h.indexOf('bid'), iA = d.h.indexOf('ask');
  const cad = [];
  for (const r of d.rows) { if (r[iT].slice(11, 16) !== HORA) continue; cad.push({ k: +r[iK], b: +r[iB], a: +r[iA] }); }
  if (!cad.length) { diag.sinHora += DIST.length; continue; }
  const pExp = pxHasta(exp);
  if (!pExp) { diag.sinCierreExp += DIST.length; continue; }
  const C = pExp.c;

  for (const x of DIST) {
    const obj = S * (1 - x);
    let mej = null, dif = Infinity;
    for (const c of cad) { if (c.k > S) continue; const e = Math.abs(c.k - obj); if (e < dif) { dif = e; mej = c; } }
    if (!mej || dif > S * TOL) { diag.rejilla++; continue; }
    if (!(mej.b > 0 && mej.a >= mej.b)) { diag.sinBid++; continue; }
    const K = mej.k;
    const itm = C < K;
    let recompra = 0, fuente = 'expira';
    if (itm) {
      const q = askVenc(exp, K);
      if (q && q.a > 0) { recompra = q.a; fuente = 'ask-venc'; }
      else { diag.sinVenc++; recompra = K - C; fuente = 'INTRINSECO-SIN-DATO'; }
    }
    const pnl = (mej.b - recompra) * 100 - TASA * (itm ? 2 : 1);
    ops.push({
      fecha, exp, dist: x, spot: S, strike: K, bid: mej.b, ask: mej.a,
      otmReal: (S - K) / S, horq: (mej.a - mej.b) / ((mej.a + mej.b) / 2),
      cierreExp: C, itm: itm ? 1 : 0, recompra, fuente,
      colateral: K * 100, pnl, rPut: pnl / (K * 100),
    });
  }
}

console.log('\n## COBERTURA');
console.log(`   viernes con fichero intradia: ${fIntra.length} · distancias: ${DIST.length} → ${fIntra.length * DIST.length} celdas posibles`);
console.log(`   operaciones construidas: ${ops.length}`);
console.log(`   descartes: sin spot ${diag.sinSpot} · sin la hora ${diag.sinHora} · rejilla de strikes lejos ${diag.rejilla} · bid<=0 ${diag.sinBid} · sin cierre del vencimiento ${diag.sinCierreExp}`);
console.log(`   recompras ITM SIN cotizacion en theta-venc (se uso el intrinseco, PEOR dato): ${diag.sinVenc}`);
console.log('\n   por distancia:');
for (const x of DIST) {
  const o = ops.filter((r) => r.dist === x);
  const q = (a, p) => { const s = a.slice().sort((u, v) => u - v); return s[Math.floor(p * (s.length - 1))]; };
  console.log(`   ${(100 * x).toFixed(0)}%: n=${String(o.length).padStart(3)} (${(100 * o.length / fIntra.length).toFixed(0)}% de los viernes) · OTM real mediano ${(100 * q(o.map((r) => r.otmReal), .5)).toFixed(2)}% · bid mediano $${q(o.map((r) => r.bid), .5).toFixed(2)} · horquilla mediana ${(100 * q(o.map((r) => r.horq), .5)).toFixed(1)}% · acaban ITM ${o.filter((r) => r.itm).length} (${(100 * o.filter((r) => r.itm).length / o.length).toFixed(0)}%)`);
}

console.log('\n## RADIOGRAFIA de las operaciones (todas las distancias juntas)\n');
radiografia(ops, ['spot', 'strike', 'bid', 'ask', 'otmReal', 'horq', 'cierreExp', 'colateral', 'rPut'], 'put semanal QQQ a las 12:00, 7 distancias', { cerosLegitimos: ['recompra'] });

fs.writeFileSync(`${R}/_mezcla-ops.json`, JSON.stringify(ops));
console.log(`\nguardadas ${ops.length} operaciones en ${R}/_mezcla-ops.json`);
