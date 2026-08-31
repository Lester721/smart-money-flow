// ¿Que fraccion de las señales es COMPRABLE con un hueco de X dolares?
import {readFileSync} from 'node:fs'; import {join} from 'node:path'; import {CACHE} from './raiz.mjs';
const U=(process.argv[2]||'AB').toUpperCase();
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
const VV=M.OPS.map(o=>maN(o.tk,o.dC,50));
const C=[]; for(let i=0;i<M.OPS.length;i++){const v=VV[i]; if(v!=null&&v<-0.07&&v>=-0.30) C.push(M.OPS[i].coste*1.0069);}
C.sort((a,b)=>a-b);
console.log(`\n${U}: ${C.length} señales elegibles. Fraccion COMPRABLE con un hueco de:`);
for(const h of [720,1000,1440,2000,3000,5000,10000])
  console.log(`  $${String(h).padStart(6)} -> ${(100*C.filter(c=>c<=h).length/C.length).toFixed(1)}%`);
console.log(`  patrimonio necesario para que un hueco del 1,20% compre la MEDIANA ($${C[Math.floor(C.length/2)].toFixed(0)}): $${(C[Math.floor(C.length/2)]/0.012).toFixed(0)}`);
console.log(`  patrimonio necesario para que un hueco del 2,40% compre la MEDIANA: $${(C[Math.floor(C.length/2)]/0.024).toFixed(0)}`);
