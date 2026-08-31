import {readFileSync} from 'node:fs'; import {join} from 'node:path'; import {CACHE} from './raiz.mjs';
export const CAP=60000, UNI=process.env.UNI||'AB';
const P={}; for(const f of (UNI==='AB'?['precios-A.json','precios-B.json']:['precios-ajustados.json']))
  Object.assign(P, JSON.parse(readFileSync(join(CACHE,f),'utf8')));
const PX={},IDX={},SPL={};
for(const tk of Object.keys(P)){const D=Object.keys(P[tk]).sort();
 PX[tk]=D.map(d=>P[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
 const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);} SPL[tk]=S;}
const maN=(tk,d,N)=>{const i=IDX[tk]?.get(d); if(i==null||i<N)return null;
 for(let j=i-N+1;j<=i;j++) if(SPL[tk].has(j))return null;
 let s=0; for(let j=i-N;j<i;j++)s+=PX[tk][j]; return PX[tk][i]/(s/N)-1;};
process.env.CAMINOS = UNI==='AB' ? 'sincosteAB-p25-d400.json' : 'sincoste-p25-d400.json';
export const M=await import('./motor-vv.mjs');
const V=M.OPS.map(o=>maN(o.tk,o.dC,50));
export const MA0=new Float64Array(M.OPS.length);
for(let i=0;i<M.OPS.length;i++){const v=V[i]; MA0[i]=(v!=null&&v<-0.07&&v>=-0.30)?v:999; M.OPS[i].ma=MA0[i];}
export const restaura=()=>{for(let i=0;i<M.OPS.length;i++)M.OPS[i].ma=MA0[i];};
export const BASE={tam:0.024,huecos:10,modo:'spy',plazo:120,castigo:0.0138,suelo:0.50,costeMin:0};
export const med41=(cfg)=>{const F=[],A=[],C=[],S=[],O=[],I=[],K=[]; let dias=null;
  for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005); const q=M.simular({...cfg,capital:cap});
    if(!dias)dias=q.dias;
    F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);I.push(q.invertido);K.push(q.saltadas);}
  const ms=(d)=>Date.parse(d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8)+"T00:00:00Z");
  const anos=(ms(dias[dias.length-1])-ms(dias[0]))/(365.25*86400000);
  return {dol:M.med(F)/anos,cagr:M.med(A),caida:M.med(C),sharpe:M.med(S),ops:M.med(O),inv:M.med(I),skip:M.med(K),anos};};
export const calibra=(cfg,obj)=>{let lo=0.001,hi=0.20;
  for(let i=0;i<20;i++){const m=(lo+hi)/2; if(med41({...cfg,tam:m}).inv<obj) lo=m; else hi=m;}
  return (lo+hi)/2;};
export const conc=(cfg)=>{const q=M.simular({...cfg,capital:CAP});
  const pos=q.LIB.filter(o=>o.pnl>0).map(o=>o.pnl).sort((a,b)=>b-a);
  const sp=pos.reduce((a,x)=>a+x,0), neto=q.LIB.reduce((a,o)=>a+o.pnl,0);
  const dolMax=Math.max(...q.LIB.map(o=>o.dinero));
  return {mayorBruto:100*pos[0]/sp, mayorNeto:100*pos[0]/neto, top3:100*(pos[0]+pos[1]+pos[2])/sp,
          n:q.LIB.length, neto, mayorPos:100*dolMax/CAP};};
export const fila=(et,r,c)=>console.log(`${et.padEnd(30)} $/año ${String(Math.round(r.dol)).padStart(7)}  cagr ${r.cagr.toFixed(2)}  caida ${r.caida.toFixed(1)}  sharpe ${r.sharpe.toFixed(3)}  ops ${String(r.ops).padStart(4)}  inv ${r.inv.toFixed(2)}  saltadas ${String(r.skip).padStart(5)}${c?`  may/bruto ${c.mayorBruto.toFixed(1)}%  may/neto ${c.mayorNeto.toFixed(1)}%  top3 ${c.top3.toFixed(1)}%`:''}`);
