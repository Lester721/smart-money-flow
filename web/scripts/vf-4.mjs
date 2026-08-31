import {M,UNI} from './vf-base.mjs';
// GRADIENTE POR PROFUNDIDAD, sobre TODAS las señales elegibles, con la salida de la regla.
const kM=(1-0.0138/2)/(1+0.0138/2);
const salida=(o)=>{let iFin=Math.min(120,o.camino.length)-1;
  for(let j=0;j<=iFin;j++){ if(o.camino[j][1]<=0.50){iFin=j;break;} }
  return o.camino[iFin][1]*kM;};
const FR=[[0.07,0.09],[0.09,0.11],[0.11,0.13],[0.13,0.15],[0.15,0.18],[0.18,0.22],[0.22,0.30]];
const tabla=(et,filtro)=>{console.log(`--- ${et} ---`);
 for(const [a,b] of FR){const X=[];
  for(const o of M.OPS){ if(!(o.ma<0))continue; const p=-o.ma; if(p<a||p>=b)continue; if(filtro&&!filtro(o))continue; X.push(salida(o)); }
  if(!X.length){console.log(`  ${(a*100).toFixed(0)}-${(b*100).toFixed(0)}%  vacio`);continue;}
  const m=X.reduce((s,x)=>s+x,0)/X.length;
  const sd=Math.sqrt(X.reduce((s,x)=>s+(x-m)**2,0)/(X.length-1));
  console.log(`  ${(a*100).toFixed(0)}-${(b*100).toFixed(0)}%  mult ${m.toFixed(3)}  n ${String(X.length).padStart(5)}  t ${((m-1)/(sd/Math.sqrt(X.length))).toFixed(1)}`);}};
console.log(`═══ ${UNI} — gradiente de profundidad ═══`);
tabla('TODO');
tabla('señales 2016-2020', o=>o.dC<'20210101');
tabla('señales 2021-2026', o=>o.dC>='20210101');
tabla('sin 2020', o=>o.dC.slice(0,4)!=='2020');
tabla('sin 2020 ni 2025', o=>o.dC.slice(0,4)!=='2020'&&o.dC.slice(0,4)!=='2025');
