// Auditar las celdas que salieron con t>2: delta 0,05 con GEX positivo.
// La sospecha: 99% de acierto con n≈70 significa UNA sola pérdida. Si todo el resultado
// depende de lo mala que fue esa única pérdida, la t no vale nada.
import { obs, deltaCall, med, mean, COMM } from './gex-lib.mjs';

function operar(o, deltaObj, ancho) {
  let corta = null, mejorD = 9;
  for (const [K, q] of o.calls) {
    if (K <= o.U) continue;
    const dl = deltaCall(o.U, K, o.T, q.iv);
    if (!(dl > 0.02) || dl > 0.60) continue;
    if (Math.abs(dl - deltaObj) < mejorD) { mejorD = Math.abs(dl - deltaObj); corta = { K, q, dl }; }
  }
  if (!corta || mejorD > 0.04) return null;
  const larga = o.calls.get(corta.K + ancho); if (!larga) return null;
  const credito = corta.q.mid - larga.mid;
  if (!(credito > 0.05) || credito > ancho * 0.5) return null;
  const perdida = Math.min(Math.max(o.cierre - corta.K, 0), ancho);
  const pl = (credito - perdida) * 100 - 4 * COMM;
  return { d: o.d, net: o.net1, credito, delta: corta.dl, K: corta.K, cierre: o.cierre, U: o.U, pl, ret: pl / (ancho * 100), ancho };
}

for (const [dObj, anc] of [[0.05, 10], [0.05, 25], [0.05, 50]]) {
  const porDia = new Map();
  for (const o of obs) { if (o.h !== '11:00') continue; const t = operar(o, dObj, anc); if (t) porDia.set(o.d, t); }
  const g = [...porDia.values()].filter(x => x.net > 0);
  const perd = g.filter(x => x.ret <= 0).sort((a, b) => a.ret - b.ret);
  const gan = g.filter(x => x.ret > 0);
  const m = mean(g.map(x => x.ret));
  console.log(`\n═══ delta ${dObj}, ancho ${anc}, GEX+ — n=${g.length} días, media ${(m * 100).toFixed(2)}% ═══`);
  console.log(`   ganadoras: ${gan.length}  (media +${(mean(gan.map(x => x.ret)) * 100).toFixed(2)}%)`);
  console.log(`   PERDEDORAS: ${perd.length}`);
  for (const p of perd) console.log(`      ${p.d}  SPX ${p.U.toFixed(0)} -> ${p.cierre.toFixed(0)}  strike ${p.K}  cobro $${(p.credito * 100).toFixed(0)}  ${(p.ret * 100).toFixed(1)}%`);
  // prueba de tensión: ¿y si la peor pérdida hubiera sido la máxima posible?
  const otros = g.filter(x => x !== perd[0]).map(x => x.ret);
  const conMax = mean([...otros, -1 + g[0].credito / anc]);
  console.log(`   media si esa peor pérdida hubiera sido la MÁXIMA (−100%): ${(conMax * 100).toFixed(2)}%`);
  // ¿y si añadimos UNA pérdida máxima más?
  const conUnaMas = mean([...g.map(x => x.ret), -1]);
  console.log(`   media si en el próximo día hubiera UNA pérdida máxima más: ${(conUnaMas * 100).toFixed(2)}%`);
  console.log(`   -> con ${(gan.length / g.length * 100).toFixed(0)}% de acierto, hace falta que la pérdida media sea < ${((mean(gan.map(x => x.ret)) * gan.length / Math.max(perd.length, 1)) * 100).toFixed(0)}% para no perder`);
}
