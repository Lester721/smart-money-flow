import { res, met, med } from './intradia-lib.mjs';
const o = res.get('10:00'), c = res.get('16:00');
const m = met(o);
console.log('=== AUDITORIA: vender a las 10:00, 3% fuera ===\n');
console.log(`1. muestra: ${m.n} viernes, ${o[0].rolo} a ${o[o.length-1].exp}`);
console.log(`2. acierto ${(m.win*100).toFixed(0)}%   peor semana ${(Math.min(...o.map(x=>x.ret))*100).toFixed(1)}%`);
console.log('3. LAS 8 PEORES SEMANAS a las 10:00 (¿estan las de marzo 2020?)');
[...o].sort((a,b)=>a.ret-b.ret).slice(0,8).forEach(x=>
  console.log(`     ${x.rolo} -> ${x.exp}  QQQ ${x.S0.toFixed(2)} -> ${x.ST.toFixed(2)} (${((x.ST/x.S0-1)*100).toFixed(1)}%)  K=${x.K}  cobro $${(x.cobro*100).toFixed(0)}  ${(x.ret*100).toFixed(1)}%`));
console.log('4. ¿que paso en las semanas del COVID?');
for (const f of ['2020-02-21','2020-02-28','2020-03-06','2020-03-13','2020-03-20']) {
  const a = o.find(x=>x.rolo===f), b = c.find(x=>x.rolo===f);
  if (!a) { console.log(`     ${f}  (fuera de la muestra)`); continue; }
  console.log(`     ${f}  10:00 -> cobro $${(a.cobro*100).toFixed(0)} K=${a.K} ret ${(a.ret*100).toFixed(1)}%   |   cierre -> cobro $${(b?b.cobro*100:0).toFixed(0)} K=${b?b.K:'-'} ret ${(b?b.ret*100:0).toFixed(1)}%`);
}
console.log('5. ¿vive de pocas semanas? quitando las mejores:');
for (const q of [0.01,0.05,0.10]) {
  const s=[...o].sort((a,b)=>b.ret-a.ret).slice(Math.floor(o.length*q)).sort((a,b)=>a.rolo<b.rolo?-1:1);
  console.log(`     sin el ${(q*100).toFixed(0)}% mejor: ${met(s).anual.toFixed(1)}%/año`);
}
const r=o.map(x=>x.ret).sort((a,b)=>a-b);
console.log(`6. media ${(r.reduce((s,x)=>s+x,0)/r.length*100).toFixed(3)}%  mediana ${(r[Math.floor(r.length/2)]*100).toFixed(3)}%`);
console.log('7. ¿y si te dan 20% menos prima de la cotizada?');
let eq=1; for(const x of o) eq*=(1+x.ret-Math.abs(x.cobro*0.20/x.K));
const años=(new Date(o[o.length-1].exp)-new Date(o[0].rolo))/365/864e5;
console.log(`     ${((eq**(1/años)-1)*100).toFixed(1)}%/año`);
console.log('8. ¿el strike a las 10:00 acaba mas lejos o mas cerca que el del cierre?');
const par=o.map(x=>{const y=c.find(z=>z.rolo===x.rolo); return y?{k10:x.K,k16:y.K,S:y.S0}:null;}).filter(Boolean);
console.log(`     strike 10:00 vs strike cierre: ${(med(par.map(p=>p.k10/p.k16))*100-100).toFixed(2)}% de diferencia mediana`);
console.log(`     (si fuera muy negativo, la ventaja seria "strike mas bajo", no "mas prima")`);
