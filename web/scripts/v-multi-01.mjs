// VÍA: MÁS DE UNA POSICIÓN POR TICKER.
// Barrido de `porTicker` (posiciones simultáneas en la misma acción) x `sepDias`
// (sesiones mínimas entre dos entradas del mismo ticker), en los DOS universos.
// Uso: node --max-old-space-size=6144 v-multi-01.mjs AB   |   ... 27
import {readFileSync} from 'node:fs'; import {join} from 'node:path'; import {CACHE} from './raiz.mjs';
const U = (process.argv[2]||'AB').toUpperCase();
const CAP=60000;
const FICH = U==='AB' ? ['precios-A.json','precios-B.json'] : ['precios-ajustados.json'];
const P={}; for(const f of FICH) Object.assign(P, JSON.parse(readFileSync(join(CACHE,f),'utf8')));
const PX={},IDX={},SPL={};
for(const tk of Object.keys(P)){const D=Object.keys(P[tk]).sort();
 PX[tk]=D.map(d=>P[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
 const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);} SPL[tk]=S;}
const maN=(tk,d,N)=>{const i=IDX[tk]?.get(d); if(i==null||i<N)return null;
 for(let j=i-N+1;j<=i;j++) if(SPL[tk].has(j))return null;
 let s=0; for(let j=i-N;j<i;j++)s+=PX[tk][j]; return PX[tk][i]/(s/N)-1;};
process.env.CAMINOS = U==='AB' ? 'sincosteAB-p25-d400.json' : 'sincoste-p25-d400.json';
const M=await import('./motor-multi.mjs');
const V=M.OPS.map(o=>maN(o.tk,o.dC,50));
for(let i=0;i<M.OPS.length;i++){const v=V[i]; M.OPS[i].ma=(v!=null&&v<-0.07&&v>=-0.30)?v:999;}
const CF={tam:0.024,huecos:10,modo:'spy',plazo:120,castigo:0.0138,suelo:0.50,costeMin:0};

// mediana de 41 capitales de partida — nunca una corrida suelta
function medir(extra){
  const F=[],A=[],C=[],S=[],O=[],DOB=[],MAY=[];
  let tomMed=null, mid=null;
  for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
    const q=M.simular({...CF,...extra,capital:cap});
    F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);
    // concentración: cuánto pesa la operación MAYOR sobre la suma de P&L
    const pos=q.tom.reduce((a,o)=>a+Math.max(0,o.pnl),0);
    const may=q.tom.reduce((a,o)=>Math.max(a,o.pnl),0);
    MAY.push(pos>0?100*may/pos:0);
    DOB.push(100*q.tom.filter(o=>o.dobla>0).length/Math.max(1,q.tom.length));
    if(i===20){tomMed=q.tom; mid=q;}}
  return {d:M.med(F)/M.ANOS, a:M.med(A), c:M.med(C), s:M.med(S), o:M.med(O),
          may:M.med(MAY), dob:M.med(DOB), tom:tomMed, q:mid};
}
const f=(x,n=0)=>x.toFixed(n);
console.log(`\n═══ UNIVERSO ${U}  (tam 2,4% · 10 huecos · 120 sesiones · suelo 0,50) ═══`);
console.log('porTicker sepDias |    $/año   CAGR   caída  Sharpe   ops | mayor%  dobladas%');
const RES={};
for(const pt of [1,2,3,0]) for(const sd of (pt===1?[0]:[0,5,10,21,42])){
  const r=medir({porTicker:pt,sepDias:sd});
  RES[`${pt}|${sd}`]=r;
  console.log(`${String(pt===0?'sin lim':pt).padStart(9)} ${String(sd).padStart(7)} | ${('$'+f(r.d)).padStart(8)} ${f(r.a,1).padStart(5)}% ${f(-r.c,1).padStart(6)}% ${f(r.s,2).padStart(6)} ${f(r.o).padStart(5)} | ${f(r.may,1).padStart(5)}% ${f(r.dob,1).padStart(8)}%`);
}
globalThis.__RES=RES; globalThis.__M=M; globalThis.__medir=medir;
export {RES, M, medir, CF, CAP};
