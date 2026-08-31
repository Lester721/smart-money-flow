// CONTROL 0 — la copia motor-multi.mjs con porTicker=1/sepDias=0 tiene que dar
// EXACTAMENTE lo mismo que motor-cartera.mjs. Si no, la comparacion esta viciada.
import {readFileSync} from 'node:fs'; import {join} from 'node:path'; import {CACHE} from './raiz.mjs';
const U=(process.argv[2]||'27').toUpperCase(); const CAP=60000;
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
const MO=await import('./motor-cartera.mjs');
const M =await import('./motor-multi.mjs');
for(const MM of [MO,M]){ const VV=MM.OPS.map(o=>maN(o.tk,o.dC,50));
  for(let i=0;i<MM.OPS.length;i++){const v=VV[i]; MM.OPS[i].ma=(v!=null&&v<-0.07&&v>=-0.30)?v:999;} }
const CF={tam:0.024,huecos:10,modo:'spy',plazo:120,castigo:0.0138,suelo:0.50,costeMin:0};
const F0=[],F1=[],S0=[],S1=[],O0=[],O1=[];
for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
  const a=MO.simular({...CF,capital:cap}), b=M.simular({...CF,porTicker:1,sepDias:0,capital:cap});
  F0.push(a.final-cap);F1.push(b.final-cap);S0.push(a.sharpe);S1.push(b.sharpe);O0.push(a.ops);O1.push(b.ops);}
console.log(`${U}  ORIGINAL  $${(MO.med(F0)/MO.ANOS).toFixed(0)}/año · Sharpe ${MO.med(S0).toFixed(4)} · ops ${MO.med(O0)}`);
console.log(`${U}  COPIA     $${(M.med(F1)/M.ANOS).toFixed(0)}/año · Sharpe ${M.med(S1).toFixed(4)} · ops ${M.med(O1)}`);
let iguales=true; for(let i=0;i<41;i++) if(Math.abs(F0[i]-F1[i])>1e-6||Math.abs(S0[i]-S1[i])>1e-12||O0[i]!==O1[i]) iguales=false;
console.log(`IDENTICOS en las 41 corridas: ${iguales?'SI':'NO'}`);
