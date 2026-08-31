// ¿El veto por ticker es el cuello de botella, o lo son los 10 HUECOS?
// Diagnóstico: ocupación de huecos + señales rechazadas por cada motivo.
import {readFileSync} from 'node:fs'; import {join} from 'node:path'; import {CACHE} from './raiz.mjs';
const U=(process.argv[2]||'AB').toUpperCase(); const CAP=60000;
const FICH=U==='AB'?['precios-A.json','precios-B.json']:['precios-ajustados.json'];
const P={}; for(const f of FICH) Object.assign(P,JSON.parse(readFileSync(join(CACHE,f),'utf8')));
const PX={},IDX={},SPL={};
for(const tk of Object.keys(P)){const D=Object.keys(P[tk]).sort();
 PX[tk]=D.map(d=>P[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
 const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);} SPL[tk]=S;}
const maN=(tk,d,N)=>{const i=IDX[tk]?.get(d); if(i==null||i<N)return null;
 for(let j=i-N+1;j<=i;j++) if(SPL[tk].has(j))return null;
 let s=0; for(let j=i-N;j<i;j++)s+=PX[tk][j]; return PX[tk][i]/(s/N)-1;};
process.env.CAMINOS=U==='AB'?'sincosteAB-p25-d400.json':'sincoste-p25-d400.json';
const M=await import('./motor-multi.mjs');
const V=M.OPS.map(o=>maN(o.tk,o.dC,50));
for(let i=0;i<M.OPS.length;i++){const v=V[i]; M.OPS[i].ma=(v!=null&&v<-0.07&&v>=-0.30)?v:999;}
// cuántas señales elegibles hay cada día
const porDia=new Map();
for(const o of M.OPS) if(o.ma<0){ porDia.set(o.dC,(porDia.get(o.dC)||0)+1); }
const tot=[...porDia.values()].reduce((a,x)=>a+x,0);
const dias=[...porDia.keys()].length;
console.log(`\nUNIVERSO ${U}: ${tot} señales elegibles en ${dias} días con al menos una.`);
const H=[...porDia.values()].sort((a,b)=>a-b);
console.log(`  señales por día con señal: mediana ${H[Math.floor(H.length/2)]}, p90 ${H[Math.floor(H.length*0.9)]}, máx ${H[H.length-1]}`);
const CF={tam:0.024,huecos:10,modo:'spy',plazo:120,castigo:0.0138,suelo:0.50,costeMin:0};
const q=M.simular({...CF,capital:CAP});
console.log(`  base: ${q.ops} operaciones de ${tot} señales -> se toma el ${(100*q.ops/tot).toFixed(1)}%`);
console.log(`  invertido medio: ${q.invertido.toFixed(1)}% del patrimonio (objetivo 24%)`);
