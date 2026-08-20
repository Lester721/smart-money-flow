// ─────────────────────────────────────────────────────────────────────────────
// LA HIPOTESIS NULA DE LA MEZCLA
// ¿hace falta VENDER la put, o basta con tener MENOS INDICE?
// Se comparan a la MISMA CAIDA: (a) put+indice (b) indice+efectivo (c) indice+bonos
// (d) indice con menos tamaño.  Precios reales: bid al vender, ask al recomprar.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import { radiografia } from '../lib/radiografia.ts';
import { listonT } from '../lib/barreraHallazgos.ts';

const R = 'scripts/cache-theta', N = R + '/noche-2026-08-10';
const INTRA = N + '/theta-intra', GRIEG = N + '/theta-griegas', VENC = N + '/theta-venc';
const CUENTA = 56389;
const HORA = '12:00', OTM = 0.03, TASA_CONTRATO = 0.03;

const csv = (p) => {
  const l = fs.readFileSync(p, 'utf8').trim().split(/\r?\n/);
  return {
    h: l[0].split(',').map((s) => s.replace(/^"|"$/g, '')),
    rows: l.slice(1).map((x) => x.split(',').map((s) => s.replace(/^"|"$/g, ''))),
  };
};
const media = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const dias = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

// ── 1. spot a las 12:00 (comprobado: la fila 16:00 == cierre del dia, mediana 0,0000) ──
const spot12 = new Map();
for (const f of fs.readdirSync(GRIEG)) {
  const { h, rows } = csv(GRIEG + '/' + f);
  const iT = h.indexOf('timestamp'), iC = h.indexOf('close');
  for (const r of rows) if (r[iT].slice(11, 16) === HORA) spot12.set(r[iT].slice(0, 10), +r[iC]);
}
const oc = JSON.parse(fs.readFileSync(N + '/qqq-oc.json', 'utf8'));
const cierre = new Map(oc.map((x) => [x.d, x.c]));

// ── 2. una fila por viernes ──
const filas = [];
const desc = { sinHora: 0, sinSpot: 0, rejilla: 0, sinBid: 0, sinCierreExp: 0 };
let conAskVenc = 0;
for (const f of fs.readdirSync(INTRA).filter((x) => /^QQQ_\d{4}-\d\d-\d\d_\d{4}-\d\d-\d\d\.csv$/.test(x)).sort()) {
  const [, fecha, exp] = f.replace('.csv', '').split('_');
  const d = csv(INTRA + '/' + f);
  const iK = d.h.indexOf('strike'), iT = d.h.indexOf('timestamp'), iB = d.h.indexOf('bid'), iA = d.h.indexOf('ask');
  const cad = [];
  for (const r of d.rows) if (r[iT].slice(11, 16) === HORA) cad.push({ k: +r[iK], b: +r[iB], a: +r[iA] });
  if (!cad.length) { desc.sinHora++; continue; }
  const S = spot12.get(fecha);
  if (!(S > 0)) { desc.sinSpot++; continue; }
  const obj = S * (1 - OTM);
  let mej = null, dif = Infinity;
  for (const c of cad) { if (c.k > S) continue; const x = Math.abs(c.k - obj); if (x < dif) { dif = x; mej = c; } }
  if (!mej || dif > S * 0.01) { desc.rejilla++; continue; }
  if (!(mej.b > 0 && mej.a >= mej.b)) { desc.sinBid++; continue; }
  const Sexp = cierre.get(exp);
  if (Sexp == null) { desc.sinCierreExp++; continue; }
  const intrin = Math.max(0, mej.k - Sexp);
  let askVenc = null;
  const pv = VENC + '/QQQ_' + exp + '_P.csv';
  if (fs.existsSync(pv)) {
    const dv = csv(pv);
    const jK = dv.h.indexOf('strike'), jA = dv.h.indexOf('ask'), jB = dv.h.indexOf('bid');
    const r = dv.rows.find((r) => Math.abs(+r[jK] - mej.k) < 1e-6);
    if (r && +r[jA] >= +r[jB] && +r[jA] >= 0) { askVenc = +r[jA]; conAskVenc++; }
  }
  const costo = askVenc != null ? Math.max(askVenc, intrin) : intrin;
  const pnlPut = (mej.b - costo) * 100 - 2 * TASA_CONTRATO;
  filas.push({
    fecha, exp, ticker: 'QQQ', spot: S, strike: mej.k, bid: mej.b, ask: mej.a,
    otmReal: (S - mej.k) / S, horq: (mej.a - mej.b) / ((mej.a + mej.b) / 2),
    sExp: Sexp, intrin, askVenc, costo, pnlPut,
    rPut: pnlPut / (mej.k * 100),
    rQqq: Sexp / S - 1,
    dur: dias(fecha, exp),
    pnl: pnlPut / (mej.k * 100),
  });
}

console.log('\n══ 0 · DE QUE ESTAN HECHAS LAS FILAS ══');
console.log('descartes: sin hora ' + desc.sinHora + ' · sin spot ' + desc.sinSpot + ' · rejilla ' + desc.rejilla + ' · sin bid ' + desc.sinBid + ' · sin cierre del vto ' + desc.sinCierreExp);
console.log('filas: ' + filas.length + ' · ' + filas[0].fecha + ' → ' + filas[filas.length - 1].exp);
console.log('recompra con ASK REAL del vencimiento: ' + conAskVenc + '/' + filas.length + ' (' + (100 * conAskVenc / filas.length).toFixed(1) + '%) · el resto liquida al INTRINSECO');
const cubiertos = filas.reduce((a, x) => a + x.dur, 0);
const naturales = dias(filas[0].fecha, filas[filas.length - 1].exp);
console.log('dias cubiertos: ' + cubiertos + ' de ' + naturales.toFixed(0) + ' naturales → HUECOS ' + (naturales - cubiertos).toFixed(0) + ' dias sin medir');
radiografia(filas, ['spot', 'strike', 'bid', 'otmReal', 'horq', 'rQqq', 'rPut'], 'put semanal QQQ 3% OTM 12:00 + indice');

// ── 3. maquinaria de carteras ──
const equity = (rs) => { let e = 1; const c = [1]; for (const r of rs) { e *= 1 + r; c.push(e); } return c; };
const mdd = (rs) => { const c = equity(rs); let pico = c[0], m = 0; for (const v of c) { if (v > pico) pico = v; m = Math.max(m, 1 - v / pico); } return m; };
const años = (f) => f.reduce((a, x) => a + x.dur, 0) / 365.25;
const cagr = (rs, f) => Math.pow(equity(rs).at(-1), 1 / años(f)) - 1;
const cvar5 = (rs) => { const s = [...rs].sort((a, b) => a - b); return media(s.slice(0, Math.max(1, Math.round(rs.length * 0.05)))); };
const M = (rs, f) => ({ cagr: cagr(rs, f), mdd: mdd(rs), cvar5: cvar5(rs), peor: Math.min(...rs), fin: equity(rs).at(-1) });
const S = (f, wI, wP) => f.map((x) => wI * x.rQqq + wP * x.rPut);

const casarMdd = (obj, f) => { let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (mdd(f.map((x) => m * x.rQqq)) < obj) lo = m; else hi = m; } return (lo + hi) / 2; };
const casarCvar = (obj, f) => { let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (cvar5(f.map((x) => m * x.rQqq)) > obj) lo = m; else hi = m; } return (lo + hi) / 2; };

const pct = (x) => (100 * x).toFixed(2) + '%';
const usd = (r) => '$' + Math.round(CUENTA * r).toLocaleString('es');

// ── 4. periodo entero ──
console.log('\n══ 1 · PERIODO ENTERO — la mezcla contra tener menos indice ══');
console.log('  efectivo al 0%: NO existe fichero de tipos. Si rindiera letras, (b) saldria MEJOR.');
console.log('  QQQ SOLO precio: NO existe fichero de dividendos. El dividendo favorece a quien tiene MAS indice.');
console.log('  (c) indice+bonos: NO se puede medir, no hay TLT/IEF/AGG/BND/SHY en cache-theta/cierres.\n');

function bloque(f, etiqueta) {
  const mm = M(S(f, 0.5, 0.5), f);
  const wMdd = casarMdd(mm.mdd, f);
  const wCvar = casarCvar(mm.cvar5, f);
  const bMdd = M(f.map((x) => wMdd * x.rQqq), f);
  const bCvar = M(f.map((x) => wCvar * x.rQqq), f);
  const idx = M(f.map((x) => x.rQqq), f);
  const put = M(f.map((x) => x.rPut), f);
  console.log('── ' + etiqueta + ' · n=' + f.length + ' · ' + f[0].fecha + '→' + f.at(-1).exp + ' · ' + años(f).toFixed(2) + ' años');
  const fila = (nom, m) => console.log('   ' + nom.padEnd(44) + pct(m.cagr).padStart(8) + '/año ' + usd(m.cagr).padStart(9) + '/año  caida ' + pct(m.mdd).padStart(7) + '  peor sem ' + pct(m.peor).padStart(7) + '  5%peor ' + pct(m.cvar5).padStart(7));
  fila('(a) MEZCLA 50% QQQ + 50% put', mm);
  fila('(b/d) QQQ al ' + (100 * wMdd).toFixed(1) + '% + efectivo [misma CAIDA]', bMdd);
  fila('(b/d) QQQ al ' + (100 * wCvar).toFixed(1) + '% + efectivo [mismo 5% peor]', bCvar);
  fila('      QQQ 100% (referencia)', idx);
  fila('      solo la put sobre su nocional (ref.)', put);
  const dif = mm.cagr - bMdd.cagr;
  console.log('   → a la MISMA CAIDA la mezcla ' + (dif >= 0 ? 'GANA' : 'PIERDE') + ' ' + pct(Math.abs(dif)) + '/año = ' + usd(Math.abs(dif)) + '/año');
  return { mm, wMdd, wCvar, bMdd, bCvar, idx, put, dif };
}
const TODO = bloque(filas, 'TODO');

// ── 5. barrido: no solo el 50/50 ──
console.log('\n══ 2 · BARRIDO de mezclas — ¿alguna reparte del lado bueno? ══');
console.log('   mezcla        CAIDA    $/año mezcla   w indice casado   $/año indice   diferencia');
const barrido = [];
for (const m of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
  const rs = S(filas, 1 - m, m);
  const a = M(rs, filas);
  const w = casarMdd(a.mdd, filas);
  const b = M(filas.map((x) => w * x.rQqq), filas);
  barrido.push({ m, a, w, b, dif: a.cagr - b.cagr });
  console.log('   ' + ((100 * (1 - m)).toFixed(0) + '/' + (100 * m).toFixed(0)).padEnd(10) + pct(a.mdd).padStart(8) + usd(a.cagr).padStart(14) + (100 * w).toFixed(1).padStart(16) + '%' + usd(b.cagr).padStart(14) + (usd(a.cagr - b.cagr)).padStart(13));
}

// ── 6. LA REGLA DE HIERRO: partir la muestra en las dos direcciones ──
console.log('\n══ 3 · PARTIR LA MUESTRA — se elige w en una mitad y se aplica TAL CUAL a la otra ══');
const mitad = Math.floor(filas.length / 2);
const A = filas.slice(0, mitad), B = filas.slice(mitad);
function cruzado(fit, test, nom) {
  const mFit = M(S(fit, 0.5, 0.5), fit);
  const w = casarMdd(mFit.mdd, fit);                // el peso se ELIGE aqui
  const mTest = M(S(test, 0.5, 0.5), test);
  const bTest = M(test.map((x) => w * x.rQqq), test); // se APLICA tal cual
  const dif = mTest.cagr - bTest.cagr;
  console.log('   ' + nom);
  console.log('      ajusta ' + fit[0].fecha + '→' + fit.at(-1).exp + ' (w=' + (100 * w).toFixed(1) + '%)  ·  prueba ' + test[0].fecha + '→' + test.at(-1).exp + ' n=' + test.length);
  console.log('      mezcla ' + pct(mTest.cagr) + '/año ' + usd(mTest.cagr) + ' caida ' + pct(mTest.mdd) + '   |   indice al ' + (100 * w).toFixed(1) + '% ' + pct(bTest.cagr) + '/año ' + usd(bTest.cagr) + ' caida ' + pct(bTest.mdd));
  console.log('      → ' + (dif >= 0 ? 'la mezcla GANA ' : 'la mezcla PIERDE ') + pct(Math.abs(dif)) + '/año = ' + usd(Math.abs(dif)) + '/año');
  return { w, mTest, bTest, dif };
}
const AB = cruzado(A, B, '1a mitad ELIGE → 2a mitad PRUEBA');
const BA = cruzado(B, A, '2a mitad ELIGE → 1a mitad PRUEBA');
const sobrevive = AB.dif > 0 && BA.dif > 0;
console.log('   SOBREVIVE AL CRUCE: ' + (sobrevive ? 'SI' : 'NO') + '  (hace falta que la mezcla gane en LAS DOS direcciones)');

// ── 7. tercios (la criba que mato a la inusualidad) ──
console.log('\n══ 4 · TERCIOS de tiempo — a la misma caida elegida en el tercio ANTERIOR ══');
const k = Math.floor(filas.length / 3);
const T = [filas.slice(0, k), filas.slice(k, 2 * k), filas.slice(2 * k)];
for (let i = 0; i < 3; i++) {
  const f = T[i];
  const a = M(S(f, 0.5, 0.5), f);
  const w = casarMdd(a.mdd, f);
  const b = M(f.map((x) => w * x.rQqq), f);
  console.log('   T' + (i + 1) + ' ' + f[0].fecha + '→' + f.at(-1).exp + ' n=' + f.length + ' : mezcla ' + pct(a.cagr).padStart(8) + '/año  vs indice(' + (100 * w).toFixed(0) + '%) ' + pct(b.cagr).padStart(8) + '/año  → ' + (a.cagr - b.cagr >= 0 ? '+' : '') + pct(a.cagr - b.cagr));
}

// ── 8. t pareado semana a semana, con listón declarado ──
console.log('\n══ 5 · ¿es distinguible de cero? t pareado semanal ══');
const PRUEBAS = 12;
{
  const w = TODO.wMdd;
  const d = filas.map((x) => (0.5 * x.rQqq + 0.5 * x.rPut) - w * x.rQqq);
  const m = media(d);
  const sd = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / (d.length - 1));
  const t = m / (sd / Math.sqrt(d.length));
  console.log('   diferencia semanal media ' + pct(m) + ' · t = ' + t.toFixed(2) + ' · liston Bonferroni con ' + PRUEBAS + ' pruebas = ' + listonT(PRUEBAS).toFixed(2));
  console.log('   ' + (Math.abs(t) >= listonT(PRUEBAS) ? 'PASA el liston' : 'NO PASA el liston'));
}

// ── 9. correlacion y forma: ¿la put aporta algo que el efectivo no? ──
console.log('\n══ 6 · ¿que hace la put en las semanas MALAS? ══');
{
  const bajas = filas.filter((x) => x.rQqq < 0).sort((a, b) => a.rQqq - b.rQqq);
  const peor10 = bajas.slice(0, Math.round(filas.length * 0.1));
  console.log('   en el 10% de semanas peores de QQQ (n=' + peor10.length + '): QQQ ' + pct(media(peor10.map((x) => x.rQqq))) + ' · put ' + pct(media(peor10.map((x) => x.rPut))) + ' · mezcla ' + pct(media(peor10.map((x) => 0.5 * x.rQqq + 0.5 * x.rPut))) + ' · indice al ' + (100 * TODO.wMdd).toFixed(0) + '% ' + pct(TODO.wMdd * media(peor10.map((x) => x.rQqq))));
  const xs = filas.map((x) => x.rQqq), ys = filas.map((x) => x.rPut);
  const mx = media(xs), my = media(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  console.log('   corr(put, QQQ) = ' + (sxy / Math.sqrt(sxx * syy)).toFixed(3) + ' · beta de la put respecto a QQQ = ' + (sxy / sxx).toFixed(3));
  console.log('   → beta de la mezcla 50/50 = ' + (0.5 + 0.5 * (sxy / sxx)).toFixed(3) + '  (el indice casado por caida esta al ' + (100 * TODO.wMdd).toFixed(1) + '%)');
}

// ── 10. sensibilidad: liquidar al INTRINSECO en vez de al ask, y efectivo al 4% ──
console.log('\n══ 7 · SENSIBILIDAD ══');
{
  const alt = filas.map((x) => ({ ...x, rPut: ((x.bid - x.intrin) * 100 - 2 * TASA_CONTRATO) / (x.strike * 100) }));
  const a = M(S(alt, 0.5, 0.5), alt);
  const w = casarMdd(a.mdd, alt);
  const b = M(alt.map((x) => w * x.rQqq), alt);
  console.log('   liquidando al INTRINSECO (asignacion) en vez de recomprar al ask:');
  console.log('      mezcla ' + pct(a.cagr) + '/año ' + usd(a.cagr) + '  vs indice(' + (100 * w).toFixed(1) + '%) ' + pct(b.cagr) + '/año ' + usd(b.cagr) + ' → ' + (a.cagr - b.cagr >= 0 ? '+' : '') + usd(a.cagr - b.cagr) + '/año');
  for (const tipo of [0.02, 0.04]) {
    const sem = Math.pow(1 + tipo, 7 / 365.25) - 1;
    const w2 = TODO.wMdd;
    const bb = M(filas.map((x) => w2 * x.rQqq + (1 - w2) * sem), filas);
    console.log('   si el efectivo rindiera ' + (100 * tipo).toFixed(0) + '%: (b) sube a ' + pct(bb.cagr) + '/año ' + usd(bb.cagr) + '/año (caida ' + pct(bb.mdd) + ') → la mezcla ' + (TODO.mm.cagr - bb.cagr >= 0 ? 'gana ' : 'pierde ') + usd(Math.abs(TODO.mm.cagr - bb.cagr)) + '/año');
  }
}

// ── 11. el tamaño: contratos ENTEROS contra la cuenta real ──
console.log('\n══ 8 · ¿CABE? contratos enteros contra $56.389 ($7.977 en efectivo, poder $73.874) ══');
{
  const nocional = filas.map((x) => x.strike * 100);
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
  console.log('   nocional de 1 put: mediana $' + Math.round(q(nocional, 0.5)).toLocaleString('es') + ' · ultimo $' + Math.round(nocional.at(-1)).toLocaleString('es') + ' · maximo $' + Math.round(Math.max(...nocional)).toLocaleString('es'));
  console.log('   "50% del capital" = $' + Math.round(CUENTA / 2).toLocaleString('es') + ' → contratos enteros posibles: ' + filas.filter((x) => x.strike * 100 <= CUENTA / 2).length + '/' + filas.length + ' semanas');
  console.log('   el 50/50 medido arriba NO es ejecutable: pide ' + (q(nocional, 0.5) / (CUENTA / 2)).toFixed(2) + 'x el medio capital en la semana mediana');
  const sobre = filas.filter((x) => x.strike * 100 > 73874).length;
  console.log('   1 contrato por encima del PODER DE COMPRA ($73.874): ' + sobre + '/' + filas.length + ' semanas');
}

fs.writeFileSync('scripts/cache-theta/_nulo-mezcla-filas.json', JSON.stringify(filas));
console.log('\nfilas en scripts/cache-theta/_nulo-mezcla-filas.json');
