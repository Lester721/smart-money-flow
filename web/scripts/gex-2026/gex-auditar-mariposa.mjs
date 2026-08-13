// Auditar la mariposa de hierro con alas a 50, filtrada por GEX positivo — la única celda
// que se mueve de cero. Y la vía 1 (GEX como veto sobre la put semanal de QQQ).
import fs from 'node:fs';
import { obs, med, mean, COMM } from './gex-lib-gex.mjs';

const HORA='11:00';
const porDia=new Map(); for(const o of obs) if(o.h===HORA) porDia.set(o.d,o);
const dias=[...porDia.values()].sort((a,b)=>a.d<b.d?-1:1);

const atm=o=>{let K=null,dif=Infinity; for(const k of o.calls.keys()) if(o.puts.has(k)&&Math.abs(k-o.U)<dif){dif=Math.abs(k-o.U);K=k;} return dif<=10?K:null;};
function mariposa(o,ala){
  const K=atm(o); if(K==null)return null;
  const c=o.calls.get(K),p=o.puts.get(K),cA=o.calls.get(K+ala),pA=o.puts.get(K-ala);
  if(!c||!p||!cA||!pA)return null;
  const cr=c.mid+p.mid-cA.mid-pA.mid;
  if(!(cr>0.5)||cr>ala)return null;
  const perd=Math.min(Math.abs(o.cierre-K),ala);
  return {d:o.d,net:o.net1,K,cr,mov:Math.abs(o.cierre-K),ret:((cr-perd)*100-8*COMM)/(ala*100)};
}
const st=r=>{const m=mean(r),sd=Math.sqrt(r.reduce((s,x)=>s+(x-m)**2,0)/(r.length-1));return{n:r.length,m,med:med(r),t:m/(sd/Math.sqrt(r.length)),win:r.filter(x=>x>0).length/r.length};};

console.log('═══ AUDITORÍA — mariposa alas 50, GEX positivo ═══\n');
const t=dias.map(o=>mariposa(o,50)).filter(Boolean);
const g=t.filter(x=>x.net>0);
const s=st(g.map(x=>x.ret));
console.log(`  base: n=${s.n}  acierto ${(s.win*100).toFixed(0)}%  media ${(s.m*100).toFixed(2)}%  mediana ${(s.med*100).toFixed(2)}%  t=${s.t.toFixed(2)}`);
console.log(`  peor día: ${(Math.min(...g.map(x=>x.ret))*100).toFixed(1)}%   mejor: ${(Math.max(...g.map(x=>x.ret))*100).toFixed(1)}%`);
const perd=g.filter(x=>x.ret<=0);
console.log(`  perdedoras: ${perd.length} de ${g.length}  (media de las pérdidas ${(mean(perd.map(x=>x.ret))*100).toFixed(1)}%)`);
console.log('\n  1. partida de la muestra');
for(const [n,a,b] of [['2024','2024-01-01','2024-12-31'],['2025','2025-01-01','2025-12-31'],['2026','2026-01-01','2099']]){
  const sub=g.filter(x=>x.d>=a&&x.d<=b); if(sub.length<20){console.log(`     ${n}: n=${sub.length} (corta)`);continue;}
  const ss=st(sub.map(x=>x.ret));
  console.log(`     ${n}:  n=${ss.n}  media ${(ss.m*100).toFixed(2)}%  acierto ${(ss.win*100).toFixed(0)}%  t=${ss.t.toFixed(2)}`);
}
console.log('\n  2. ¿vive de pocos días?');
for(const q of [0.01,0.05,0.10]){
  const r=[...g.map(x=>x.ret)].sort((a,b)=>b-a).slice(Math.floor(g.length*q));
  console.log(`     sin el ${(q*100).toFixed(0)}% mejor: ${(mean(r)*100).toFixed(2)}%`);
}
console.log('\n  3. castigo de ejecución (4 patas es mucho que cruzar)');
for(const c of [0.05,0.10,0.20]){
  const r=g.map(x=>x.ret-x.cr*c/50);
  console.log(`     cobrando un ${(c*100).toFixed(0)}% menos de crédito: ${(mean(r)*100).toFixed(2)}%`);
}
console.log('\n  4. ¿aguanta en otras horas?');
for(const H of ['10:30','11:00','12:00','13:00','14:00']){
  const pd=new Map(); for(const o of obs) if(o.h===H) pd.set(o.d,o);
  const gg=[...pd.values()].map(o=>mariposa(o,50)).filter(x=>x&&x.net>0);
  if(gg.length<30){console.log(`     ${H}: n=${gg.length}`);continue;}
  const ss=st(gg.map(x=>x.ret));
  console.log(`     ${H}:  n=${ss.n}  media ${(ss.m*100).toFixed(2)}%  t=${ss.t.toFixed(2)}`);
}
console.log('\n  5. ¿y las alas? (GEX+)');
for(const ala of [25,50,75,100]){
  const gg=dias.map(o=>mariposa(o,ala)).filter(x=>x&&x.net>0);
  if(gg.length<30){console.log(`     alas ${ala}: n=${gg.length}`);continue;}
  const ss=st(gg.map(x=>x.ret));
  console.log(`     alas ${ala}:  n=${ss.n}  media ${(ss.m*100).toFixed(2)}%  acierto ${(ss.win*100).toFixed(0)}%  t=${ss.t.toFixed(2)}`);
}
