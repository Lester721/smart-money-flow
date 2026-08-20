// NULO DE LA MEZCLA · segunda vuelta
// El match por CAIDA MAXIMA usa UN solo numero de UN solo camino. El propio proyecto ya midio
// que lo que se HEREDA entre periodos es la media del 5% peor (rho +0,98) y el peor dia (+0,97),
// no la caida maxima. Se rehace el casamiento con esas dos, mas el casamiento por BETA y el
// alfa de la regresion (que es literalmente "¿es solo exposicion?").
import fs from 'node:fs';
import { listonT } from '../lib/barreraHallazgos.ts';

const CUENTA = 56389;
const filas = JSON.parse(fs.readFileSync('scripts/cache-theta/_nulo-mezcla-filas.json', 'utf8'));
const media = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const equity = (rs) => { let e = 1; const c = [1]; for (const r of rs) { e *= 1 + r; c.push(e); } return c; };
const mdd = (rs) => { const c = equity(rs); let p = c[0], m = 0; for (const v of c) { if (v > p) p = v; m = Math.max(m, 1 - v / p); } return m; };
const años = (f) => f.reduce((a, x) => a + x.dur, 0) / 365.25;
const cagr = (rs, f) => Math.pow(equity(rs).at(-1), 1 / años(f)) - 1;
const cvar5 = (rs) => { const s = [...rs].sort((a, b) => a - b); return media(s.slice(0, Math.max(1, Math.round(rs.length * 0.05)))); };
const peor = (rs) => Math.min(...rs);
const S = (f, m) => f.map((x) => (1 - m) * x.rQqq + m * x.rPut);
const pct = (x) => (100 * x).toFixed(2) + '%';
const usd = (r) => '$' + Math.round(CUENTA * r).toLocaleString('es');

// casador generico: encuentra w tal que metrica(w*rQqq) == objetivo  (metricas decrecientes en w)
const casar = (f, objetivo, metrica) => {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (metrica(f.map((x) => m * x.rQqq)) > objetivo) lo = m; else hi = m; }
  return (lo + hi) / 2;
};
const casarMdd = (f, obj) => { let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (mdd(f.map((x) => m * x.rQqq)) < obj) lo = m; else hi = m; } return (lo + hi) / 2; };

const METRICAS = [
  { nom: 'CAIDA MAXIMA (no se hereda)', casa: (f, o) => casarMdd(f, o), val: mdd },
  { nom: 'MEDIA DEL 5% PEOR (rho +0,98)', casa: (f, o) => casar(f, o, cvar5), val: cvar5 },
  { nom: 'PEOR SEMANA (rho +0,97)', casa: (f, o) => casar(f, o, peor), val: peor },
];

console.log('\n══ A · MISMO 50/50, TRES formas de "la misma caida" ══');
for (const M of METRICAS) {
  const rm = S(filas, 0.5);
  const w = M.casa(filas, M.val(rm));
  const rb = filas.map((x) => w * x.rQqq);
  console.log('  ' + M.nom.padEnd(32) + ' → indice al ' + (100 * w).toFixed(1).padStart(5) + '%  ·  mezcla ' + usd(cagr(rm, filas)).padStart(8) + '/año  vs  indice ' + usd(cagr(rb, filas)).padStart(8) + '/año  =  ' + (cagr(rm, filas) - cagr(rb, filas) >= 0 ? '+' : '') + usd(cagr(rm, filas) - cagr(rb, filas)) + '/año');
}

console.log('\n══ B · PARTIR LA MUESTRA con cada metrica, en las DOS direcciones ══');
const mitad = Math.floor(filas.length / 2);
const A = filas.slice(0, mitad), B = filas.slice(mitad);
const resultados = [];
for (const M of METRICAS) {
  console.log('  ── ' + M.nom);
  const par = [];
  for (const [fit, test, nom] of [[A, B, '1a elige → 2a prueba'], [B, A, '2a elige → 1a prueba']]) {
    const w = M.casa(fit, M.val(S(fit, 0.5)));       // se elige aqui
    const rm = S(test, 0.5), rb = test.map((x) => w * x.rQqq);
    const d = cagr(rm, test) - cagr(rb, test);
    par.push(d);
    console.log('     ' + nom.padEnd(22) + ' w=' + (100 * w).toFixed(1).padStart(5) + '%  mezcla ' + usd(cagr(rm, test)).padStart(8) + '  indice ' + usd(cagr(rb, test)).padStart(8) + '  → ' + (d >= 0 ? '+' : '') + usd(d) + '/año  (caida mezcla ' + pct(mdd(rm)) + ' vs indice ' + pct(mdd(rb)) + ')');
  }
  const ok = par[0] > 0 && par[1] > 0;
  console.log('     SOBREVIVE: ' + (ok ? 'SI' : 'NO'));
  resultados.push({ nom: M.nom, ok, par });
}

console.log('\n══ C · CASAMIENTO POR BETA — la prueba literal de "es solo exposicion" ══');
{
  const reg = (ys, xs) => {
    const mx = media(xs), my = media(ys);
    let sxy = 0, sxx = 0;
    for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    const b = sxy / sxx, a = my - b * mx;
    const res = ys.map((y, i) => y - a - b * xs[i]);
    const sd = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / (ys.length - 2));
    return { a, b, t: a / (sd / Math.sqrt(sxx) * Math.sqrt(sxx / ys.length + mx * mx)) * 1, sdRes: sd, n: ys.length, seA: sd * Math.sqrt(1 / ys.length + mx * mx / sxx) };
  };
  const xs = filas.map((x) => x.rQqq);
  const rm = S(filas, 0.5);
  const r = reg(rm, xs);
  const tA = r.a / r.seA;
  console.log('  mezcla 50/50 = alfa ' + pct(r.a) + '/semana + beta ' + r.b.toFixed(3) + ' x QQQ   ·  t(alfa) = ' + tA.toFixed(2));
  console.log('  alfa anualizada ≈ ' + pct(r.a * 52) + '/año = ' + usd(r.a * 52) + '/año  sobre un indice al ' + (100 * r.b).toFixed(1) + '%');
  const rb = filas.map((x) => r.b * x.rQqq);
  console.log('  a la MISMA BETA (' + (100 * r.b).toFixed(1) + '%): mezcla ' + usd(cagr(rm, filas)) + '/año caida ' + pct(mdd(rm)) + '  vs  indice ' + usd(cagr(rb, filas)) + '/año caida ' + pct(mdd(rb)));
  console.log('  → ' + (cagr(rm, filas) - cagr(rb, filas) >= 0 ? '+' : '') + usd(cagr(rm, filas) - cagr(rb, filas)) + '/año  Y ademas ' + pct(mdd(rb) - mdd(rm)) + ' MENOS de caida');
  // el alfa lineal miente con un payoff curvo: se añade el termino de cola
  const xs2 = filas.map((x) => Math.max(0, -x.rQqq));
  const mx1 = media(xs), mx2 = media(xs2), my = media(rm);
  let s11 = 0, s22 = 0, s12 = 0, s1y = 0, s2y = 0;
  for (let i = 0; i < xs.length; i++) { const a1 = xs[i] - mx1, a2 = xs2[i] - mx2, ay = rm[i] - my; s11 += a1 * a1; s22 += a2 * a2; s12 += a1 * a2; s1y += a1 * ay; s2y += a2 * ay; }
  const det = s11 * s22 - s12 * s12;
  const b1 = (s22 * s1y - s12 * s2y) / det, b2 = (s11 * s2y - s12 * s1y) / det;
  const a0 = my - b1 * mx1 - b2 * mx2;
  console.log('  con termino de COLA: alfa ' + pct(a0) + '/sem (' + usd(a0 * 52) + '/año) · beta ' + b1.toFixed(3) + ' · beta extra en las bajadas ' + b2.toFixed(3));
}

console.log('\n══ D · AÑO A AÑO — ¿donde vive la ventaja? (casado por el 5% peor del propio año) ══');
const años_ = [...new Set(filas.map((x) => x.fecha.slice(0, 4)))].sort();
for (const a of años_) {
  const f = filas.filter((x) => x.fecha.startsWith(a));
  if (f.length < 20) { console.log('   ' + a + ': n=' + f.length + ' — muestra corta, no se mide'); continue; }
  const rm = S(f, 0.5);
  const w = casar(f, cvar5(rm), cvar5);
  const rb = f.map((x) => w * x.rQqq);
  const wM = casarMdd(f, mdd(rm));
  const rbM = f.map((x) => wM * x.rQqq);
  console.log('   ' + a + ' n=' + String(f.length).padStart(3) + ' QQQ ' + pct(cagr(f.map((x) => x.rQqq), f)).padStart(9) + ' | mezcla ' + pct(cagr(rm, f)).padStart(9) + ' | indice casado 5%peor(' + (100 * w).toFixed(0).padStart(3) + '%) ' + pct(cagr(rb, f)).padStart(9) + ' → ' + (cagr(rm, f) - cagr(rb, f) >= 0 ? '+' : '') + usd(cagr(rm, f) - cagr(rb, f)).padStart(8) + ' | casado caida(' + (100 * wM).toFixed(0).padStart(3) + '%) → ' + (cagr(rm, f) - cagr(rbM, f) >= 0 ? '+' : '') + usd(cagr(rm, f) - cagr(rbM, f)));
}

console.log('\n══ E · LOS DOS AÑOS QUE NO ELIGIERON NADA (2025-2026) ══');
{
  const f = filas.filter((x) => x.fecha >= '2025-01-01');
  const rm = S(f, 0.5);
  for (const M of METRICAS) {
    const w = M.casa(f, M.val(rm));
    const rb = f.map((x) => w * x.rQqq);
    console.log('   ' + M.nom.padEnd(32) + ' w=' + (100 * w).toFixed(1).padStart(5) + '%  mezcla ' + usd(cagr(rm, f)).padStart(8) + '  indice ' + usd(cagr(rb, f)).padStart(8) + '  → ' + (cagr(rm, f) - cagr(rb, f) >= 0 ? '+' : '') + usd(cagr(rm, f) - cagr(rb, f)) + '/año');
  }
  console.log('   n=' + f.length + ' semanas · ' + años(f).toFixed(2) + ' años · QQQ ' + pct(cagr(f.map((x) => x.rQqq), f)) + '/año');
}

console.log('\n══ F · CON EL EFECTIVO RINDIENDO DE VERDAD (el dato que falta) ══');
console.log('   NO hay fichero de tipos en el repo. Rango historico real 2020-2026: ~0% (2020-21) → ~5% (2023-24) → ~4%.');
{
  const rm = S(filas, 0.5);
  for (const M of METRICAS) {
    for (const tipo of [0, 0.03, 0.045]) {
      const sem = Math.pow(1 + tipo, 7 / 365.25) - 1;
      // casar CON el efectivo remunerado dentro
      let lo = 0, hi = 1;
      for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; const rr = filas.map((x) => m * x.rQqq + (1 - m) * sem); if (M.nom.startsWith('CAIDA') ? mdd(rr) < M.val(rm) : M.val(rr) > M.val(rm)) lo = m; else hi = m; }
      const w = (lo + hi) / 2;
      const rb = filas.map((x) => w * x.rQqq + (1 - w) * sem);
      console.log('   ' + M.nom.slice(0, 20).padEnd(21) + ' efectivo al ' + (100 * tipo).toFixed(1).padStart(4) + '% → indice ' + (100 * w).toFixed(1).padStart(5) + '%  ventaja de la mezcla ' + (cagr(rm, filas) - cagr(rb, filas) >= 0 ? '+' : '') + usd(cagr(rm, filas) - cagr(rb, filas)) + '/año');
    }
  }
}

console.log('\n══ G · CUANTAS PRUEBAS LLEVO ══');
const PR = 24;
console.log('   pruebas declaradas: ' + PR + ' → liston |t| = ' + listonT(PR).toFixed(2));
