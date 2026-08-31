// AUDITORIA de la candidata: huecos 20 · tam 1,20% · porTicker 2 (exposicion 24%).
// Vecinas finas, sin 2020, mitades, correlacion de las dobladas.
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
const VV=M.OPS.map(o=>maN(o.tk,o.dC,50));
for(let i=0;i<M.OPS.length;i++){const v=VV[i]; M.OPS[i].ma=(v!=null&&v<-0.07&&v>=-0.30)?v:999;}
const BASE={modo:'spy',plazo:120,castigo:0.0138,suelo:0.50,costeMin:0};
function medir(extra){
  const F=[],A=[],C=[],S=[],O=[],MAY=[],CL=[]; let tom=null;
  for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
    const q=M.simular({...BASE,...extra,capital:cap});
    F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);
    const pos=q.tom.reduce((a,o)=>a+Math.max(0,o.pnl),0);
    MAY.push(pos>0?100*q.tom.reduce((a,o)=>Math.max(a,o.pnl),0)/pos:0);
    const byTk={}; for(const o of q.tom){(byTk[o.tk]=byTk[o.tk]||[]).push(o);} let mx=0;
    for(const tk in byTk){const L=byTk[tk].sort((a,b)=>a.dC<b.dC?-1:1); let acc=0,fin='';
      for(const o of L){ if(fin&&o.dC>fin)acc=0; acc+=o.pnl; const s2=o.dS||'99999999'; if(!fin||s2>fin)fin=s2; if(acc>mx)mx=acc; }}
    CL.push(pos>0?100*mx/pos:0);
    if(i===20)tom=q.tom;}
  const anos=extra.desdeD||extra.hasta?null:M.ANOS;
  return {d:M.med(F)/(anos||M.ANOS),a:M.med(A),c:M.med(C),s:M.med(S),o:M.med(O),may:M.med(MAY),cl:M.med(CL),tom};
}
const f=(x,n=0)=>x.toFixed(n);
const fila=(et,r)=>console.log(`${et.padEnd(26)}| ${('$'+f(r.d)).padStart(8)} ${f(r.a,1).padStart(5)}% ${f(-r.c,1).padStart(6)}% ${f(r.s,2).padStart(6)} ${f(r.o).padStart(5)} | ${f(r.may,1).padStart(5)}% ${f(r.cl,1).padStart(6)}%`);
console.log(`\n═══ ${U} — AUDITORIA de huecos20/tam1,20%/porTicker2 ═══`);
console.log('caso                      |    $/año   CAGR   caída  Sharpe   ops | mayor% racimo%');
fila('BASE 10 huecos pTk=1', medir({huecos:10,tam:0.024,porTicker:1}));
console.log('-- vecinas finas (exposicion siempre 24%) --');
for(const h of [17,18,19,20,21,22,23]) fila(`huecos ${h} pTk 2`, medir({huecos:h,tam:0.24/h,porTicker:2}));
for(const pt of [1,2,3,4]) fila(`huecos 20 pTk ${pt}`, medir({huecos:20,tam:0.24/20,porTicker:pt}));
for(const ex of [0.20,0.22,0.24,0.26,0.28]) fila(`h20 pTk2 exp ${(100*ex).toFixed(0)}%`, medir({huecos:20,tam:ex/20,porTicker:2}));
console.log('-- doblar solo si la caida es MAS PROFUNDA --');
for(const dp of [0,0.02,0.05,0.08]) fila(`h20 pTk2 dobleSiPeor ${dp}`, medir({huecos:20,tam:0.012,porTicker:2,dobleSiPeor:dp}));
console.log('-- separacion minima entre entradas del mismo ticker --');
for(const sd of [0,3,5,10,21]) fila(`h20 pTk2 sepDias ${sd}`, medir({huecos:20,tam:0.012,porTicker:2,sepDias:sd}));
console.log('-- SIN 2020 (2016-2019 y 2021-2026 por separado) --');
fila('BASE   2016-2019', medir({huecos:10,tam:0.024,porTicker:1,hasta:'20191231'}));
fila('h20p2  2016-2019', medir({huecos:20,tam:0.012,porTicker:2,hasta:'20191231'}));
fila('BASE   2021-2026', medir({huecos:10,tam:0.024,porTicker:1,desdeD:'20210101'}));
fila('h20p2  2021-2026', medir({huecos:20,tam:0.012,porTicker:2,desdeD:'20210101'}));
console.log('-- mitades --');
fila('BASE   2016-2020', medir({huecos:10,tam:0.024,porTicker:1,hasta:'20201231'}));
fila('h20p2  2016-2020', medir({huecos:20,tam:0.012,porTicker:2,hasta:'20201231'}));
fila('BASE   2021-2026', medir({huecos:10,tam:0.024,porTicker:1,desdeD:'20210101'}));
fila('h20p2  2021-2026', medir({huecos:20,tam:0.012,porTicker:2,desdeD:'20210101'}));
// correlacion: rendimiento de la 1a pata vs el de la 2a pata del mismo ticker solapadas
const r=medir({huecos:20,tam:0.012,porTicker:2});
const byTk={}; for(const o of r.tom){(byTk[o.tk]=byTk[o.tk]||[]).push(o);}
const A=[],B=[];
for(const tk in byTk){const L=byTk[tk].sort((a,b)=>a.dC<b.dC?-1:1);
  for(let i=1;i<L.length;i++) if(L[i].dobla>0 && L[i].dC<=(L[i-1].dS||'99999999')){
    A.push(L[i-1].pnl/L[i-1].dinero); B.push(L[i].pnl/L[i].dinero);}}
const mA=A.reduce((a,x)=>a+x,0)/A.length, mB=B.reduce((a,x)=>a+x,0)/B.length;
let n=0,d1=0,d2=0; for(let i=0;i<A.length;i++){n+=(A[i]-mA)*(B[i]-mB);d1+=(A[i]-mA)**2;d2+=(B[i]-mB)**2;}
console.log(`\nCORRELACION de las patas solapadas del mismo ticker: ${(n/Math.sqrt(d1*d2)).toFixed(3)}  (n=${A.length} pares)`);
console.log(`  rendimiento medio 1a pata ${(100*mA).toFixed(1)}% · 2a pata ${(100*mB).toFixed(1)}%`);
const dob=r.tom.filter(o=>o.dobla>0), sol=r.tom.filter(o=>o.dobla===0);
const sm=(L)=>L.reduce((a,o)=>a+o.pnl,0);
console.log(`  P&L total: primeras patas ${(sm(sol)).toFixed(0)} (${sol.length} ops) · dobladas ${(sm(dob)).toFixed(0)} (${dob.length} ops)`);
