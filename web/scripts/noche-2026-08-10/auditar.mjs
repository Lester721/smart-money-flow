// AUDITORIA de la cifra que voy a reportar. Antes de decirla, romperla.
import { correr, met, P } from './semanal-lib.mjs';
const o = correr('theta-sem', 'QQQ', { otm: 0.03 });
const oB = correr('theta-sem', 'QQQ', { otm: 0.03, entrada: 'bid' });
const m = met(o), mB = met(oB);
console.log('=== AUDITORIA: QQQ semanal 3% fuera ===\n');
console.log(`1. COBERTURA        ${m.n} semanas de ${Math.round(m.años*52)} posibles (${(m.n/(m.años*52)*100).toFixed(0)}%)`);
console.log(`   periodo          ${o[0].rolo} -> ${o[o.length-1].exp}  (${m.años.toFixed(1)} años)`);
console.log(`2. ENTRADA          al medio ${m.anual.toFixed(1)}%/año   al BID ${mB.anual.toFixed(1)}%/año   -> el bid/ask cuesta ${(m.anual-mB.anual).toFixed(1)} puntos`);
console.log(`3. ACIERTO          ${(m.win*100).toFixed(0)}%   peor semana ${(Math.min(...o.map(x=>x.ret))*100).toFixed(1)}%`);
const peor = [...o].sort((a,b)=>a.ret-b.ret).slice(0,5);
console.log('4. LAS 5 PEORES SEMANAS (¿son crisis reales o datos raros?)');
for (const x of peor) console.log(`     ${x.rolo} -> ${x.exp}  QQQ ${x.S0.toFixed(2)} -> ${x.ST.toFixed(2)} (${((x.ST/x.S0-1)*100).toFixed(1)}%)  K=${x.K}  ${(x.ret*100).toFixed(1)}%`);
console.log('5. ¿DEPENDE DE POCAS SEMANAS BUENAS? quitando el 1% y el 5% mejores:');
for (const q of [0.01, 0.05]) {
  const s = [...o].sort((a,b)=>b.ret-a.ret).slice(Math.floor(o.length*q));
  s.sort((a,b)=>a.rolo<b.rolo?-1:1);
  const mm = met(s);
  console.log(`     sin el ${(q*100).toFixed(0)}% mejor:  ${mm.anual.toFixed(1)}%/año`);
}
console.log('6. MEDIA vs MEDIANA por operacion:');
const r = o.map(x=>x.ret).sort((a,b)=>a-b);
console.log(`     media ${(r.reduce((s,x)=>s+x,0)/r.length*100).toFixed(3)}%   mediana ${(r[Math.floor(r.length/2)]*100).toFixed(3)}%   (si la media dependiera de colas, se separarian)`);
console.log('7. ¿y si la prima fuese un 20% peor de lo cotizado? (margen de seguridad)');
let eq=1; for (const x of o) eq *= (1 + x.ret - Math.abs(x.prima*0.20/x.K));
console.log(`     ${((eq**(1/m.años)-1)*100).toFixed(1)}%/año`);
