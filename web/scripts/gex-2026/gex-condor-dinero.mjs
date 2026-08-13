// ¿CUÁNTO DINERO ES? — el cóndor ±25/alas 50 en días GEX+, traducido a dólares.
import { obs, med, mean, COMM } from './gex-lib-gex.mjs';
const porDiaHora=new Map(); for(const o of obs) porDiaHora.set(`${o.d} ${o.h}`,o);
const dias=[...new Set(obs.map(o=>o.d))].sort();
const atm=o=>{let K=null,dif=Infinity; for(const k of o.calls.keys()) if(o.puts.has(k)&&Math.abs(k-o.U)<dif){dif=Math.abs(k-o.U);K=k;} return dif<=10?K:null;};
function condor(o,sep=25,ala=50,castigo=0){
  const K=atm(o); if(K==null)return null;
  const Kc=K+sep,Kp=K-sep;
  const c=o.calls.get(Kc),cA=o.calls.get(Kc+ala),p=o.puts.get(Kp),pA=o.puts.get(Kp-ala);
  if(!c||!cA||!p||!pA)return null;
  let cr=c.bid+p.bid-cA.ask-pA.ask;
  cr-=(c.mid+p.mid-cA.mid-pA.mid)*castigo;
  if(!(cr>0.2)||cr>ala)return null;
  const S=o.cierre;
  const perd=Math.min(Math.max(S-Kc,0),ala)+Math.min(Math.max(Kp-S,0),ala);
  const pl=(cr-perd)*100-8*COMM;
  return {d:o.d,cr:cr*100,pl,riesgo:(ala-cr)*100,ret:pl/(ala*100)};
}
const g=dias.map(d=>{const o=porDiaHora.get(`${d} 11:00`); return o&&o.net1>0?condor(o):null;}).filter(Boolean);
const años=(new Date(dias[dias.length-1])-new Date(dias[0]))/365/864e5;
const gan=g.filter(x=>x.pl>0), per=g.filter(x=>x.pl<=0);
const tot=g.reduce((s,x)=>s+x.pl,0);

console.log('═══ CÓNDOR ±25 / ALAS 50 · DÍAS GEX+ · 1 CONTRATO ═══');
console.log(`   ${g.length} operaciones en ${años.toFixed(1)} años  (${(g.length/años).toFixed(0)} al año, uno de cada ${(dias.length/g.length).toFixed(1)} días)\n`);
console.log(`   crédito que cobras (mediana):  $${med(g.map(x=>x.cr)).toFixed(0)}`);
console.log(`   riesgo por operación (mediana): $${med(g.map(x=>x.riesgo)).toFixed(0)}\n`);
console.log(`   días GANADORES  ${gan.length} (${(gan.length/g.length*100).toFixed(0)}%)   ganancia mediana  $${med(gan.map(x=>x.pl)).toFixed(0)}   media $${mean(gan.map(x=>x.pl)).toFixed(0)}`);
console.log(`   días PERDEDORES ${per.length} (${(per.length/g.length*100).toFixed(0)}%)   pérdida  mediana −$${Math.abs(med(per.map(x=>x.pl))).toFixed(0)}   media −$${Math.abs(mean(per.map(x=>x.pl))).toFixed(0)}`);
console.log(`   PEOR DÍA: −$${Math.abs(Math.min(...g.map(x=>x.pl))).toFixed(0)}   ·   mejor día: +$${Math.max(...g.map(x=>x.pl)).toFixed(0)}\n`);
console.log(`   ═══> GANANCIA TOTAL: $${tot.toFixed(0)}  en ${años.toFixed(1)} años`);
console.log(`   ═══> AL AÑO: $${(tot/años).toFixed(0)} por contrato\n`);

console.log('   con castigo extra de ejecución:');
for(const c of [0.05,0.10,0.20]){
  const gg=dias.map(d=>{const o=porDiaHora.get(`${d} 11:00`); return o&&o.net1>0?condor(o,25,50,c):null;}).filter(Boolean);
  const t=gg.reduce((s,x)=>s+x.pl,0);
  console.log(`     −${(c*100).toFixed(0)}% de crédito:  $${(t/años).toFixed(0)}/año`);
}
console.log('\n   la racha peor (suma de pérdidas seguidas):');
{
  let racha=0,peor=0,cont=0,peorCont=0;
  for(const x of g){ if(x.pl<0){racha+=x.pl;cont++; if(racha<peor){peor=racha;peorCont=cont;}} else {racha=0;cont=0;} }
  console.log(`     −$${Math.abs(peor).toFixed(0)} en ${peorCont} operaciones seguidas`);
  // caida maxima sobre el acumulado
  let eq=0,pico=0,dd=0; for(const x of g){eq+=x.pl;pico=Math.max(pico,eq);dd=Math.max(dd,pico-eq);}
  console.log(`     caída máxima del acumulado: −$${dd.toFixed(0)}`);
}
console.log('\n   sobre TU cuenta: $55.419 en total, $8.159 libres (el resto está en HOOD)');
console.log(`     1 contrato arriesga $${med(g.map(x=>x.riesgo)).toFixed(0)} = ${(med(g.map(x=>x.riesgo))/8159*100).toFixed(0)}% de lo que tienes libre`);
