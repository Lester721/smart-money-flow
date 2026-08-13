// LA PREGUNTA QUE DECIDE: ¿cuánto cuesta de VERDAD entrar en la mariposa?
//
// Hasta ahora se valoraba al punto medio de las cuatro patas y se castigaba un 10% "a ojo".
// Eso no vale. Aquí se mide con el bid/ask REAL:
//   · al MEDIO      -> lo optimista (todas las patas al punto medio)
//   · REALISTA      -> vendes al bid y compras al ask (cruzas la horquilla entera)
//   · a MITAD       -> cruzas media horquilla en cada pata (lo típico con orden límite)
// Y se mide la horquilla real de cada pata, para saber de qué estamos hablando.
import { obs, med, mean, COMM } from './gex-lib-gex.mjs';

const porDia=new Map(); for(const o of obs) if(o.h==='11:00') porDia.set(o.d,o);
const dias=[...porDia.values()].sort((a,b)=>a.d<b.d?-1:1);
const atm=o=>{let K=null,dif=Infinity; for(const k of o.calls.keys()) if(o.puts.has(k)&&Math.abs(k-o.U)<dif){dif=Math.abs(k-o.U);K=k;} return dif<=10?K:null;};

function mariposa(o,ala,modo){
  const K=atm(o); if(K==null)return null;
  const c=o.calls.get(K),p=o.puts.get(K),cA=o.calls.get(K+ala),pA=o.puts.get(K-ala);
  if(!c||!p||!cA||!pA)return null;
  // vendes ATM (cobras), compras alas (pagas)
  const vend=(q)=> modo==='medio'? q.mid : modo==='bid'? q.bid : (q.mid+q.bid)/2;
  const comp=(q)=> modo==='medio'? q.mid : modo==='bid'? q.ask : (q.mid+q.ask)/2;
  const cr=vend(c)+vend(p)-comp(cA)-comp(pA);
  if(!(cr>0.2)||cr>ala)return null;
  const perd=Math.min(Math.abs(o.cierre-K),ala);
  const horq=[(c.ask-c.bid)/c.mid,(p.ask-p.bid)/p.mid,(cA.ask-cA.bid)/cA.mid,(pA.ask-pA.bid)/pA.mid];
  return {d:o.d,net:o.net1,cr,crMedio:c.mid+p.mid-cA.mid-pA.mid,ret:((cr-perd)*100-8*COMM)/(ala*100),horq};
}
const st=r=>{if(r.length<20)return null;const m=mean(r),sd=Math.sqrt(r.reduce((s,x)=>s+(x-m)**2,0)/(r.length-1));return{n:r.length,m,med:med(r),t:m/(sd/Math.sqrt(r.length)),win:r.filter(x=>x>0).length/r.length};};

console.log('═══ LA HORQUILLA REAL DE LA MARIPOSA (alas 50, días GEX+) ═══\n');
{
  const g=dias.map(o=>mariposa(o,50,'medio')).filter(x=>x&&x.net>0);
  const todas=g.flatMap(x=>x.horq);
  console.log(`  horquilla por pata (mediana): ${(med(todas)*100).toFixed(1)}% del precio de la opción`);
  console.log(`  crédito al medio (mediana):   $${(med(g.map(x=>x.cr))*100).toFixed(0)}  sobre un ala de $5.000`);
}
console.log('\n═══ EL MISMO SISTEMA, TRES FORMAS DE EJECUTARLO ═══\n');
for(const ala of [50,100]){
  console.log(`── alas ${ala} ──`);
  for(const [nom,modo] of [['al MEDIO (optimista)','medio'],['a MITAD de horquilla (límite)','mitad'],['cruzando ENTERA (realista malo)','bid']]){
    const g=dias.map(o=>mariposa(o,ala,modo)).filter(x=>x&&x.net>0);
    const s=st(g.map(x=>x.ret));
    if(!s){console.log(`   ${nom.padEnd(32)} (corta)`);continue;}
    const perdCred = mean(g.map(x=>1-x.cr/x.crMedio))*100;
    console.log(`   ${nom.padEnd(32)} n=${String(s.n).padStart(3)}  media ${(s.m*100).toFixed(2).padStart(6)}%  t=${s.t.toFixed(2).padStart(5)}  (cobras un ${perdCred.toFixed(0)}% menos que al medio)`);
  }
  console.log('');
}
console.log('═══ ¿y si en vez de 4 patas se legan DOS VERTICALES? ═══');
console.log('   (es lo que habría que hacer en Robinhood: no admite la mariposa de un botón)');
console.log('   Cada vertical se mete por separado -> se cruza la horquilla en las 4 patas igual,');
console.log('   pero además hay riesgo de que el precio se mueva entre una y otra. Eso NO está medido.');
