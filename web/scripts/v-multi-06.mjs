// CONFIRMACION FINAL: h20 / tam 1,20% / porTicker 2 / sepDias 21, y su rejilla vecina.
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
      for(const o of L){ if(fin&&o.dC>fin)acc=0; acc+=o.pnl; const s2=o.dS||'99999999'; if(!fin||s2>fin)fin=s2; if(acc>mx)mx=acc;}}
    CL.push(pos>0?100*mx/pos:0); if(i===20)tom=q.tom;}
  return {d:M.med(F)/M.ANOS,a:M.med(A),c:M.med(C),s:M.med(S),o:M.med(O),may:M.med(MAY),cl:M.med(CL),tom};
}
const f=(x,n=0)=>x.toFixed(n);
const fila=(et,r)=>console.log(`${et.padEnd(24)}| ${('$'+f(r.d)).padStart(8)} ${f(r.a,1).padStart(5)}% ${f(-r.c,1).padStart(6)}% ${f(r.s,2).padStart(6)} ${f(r.o).padStart(5)} | ${f(r.may,1).padStart(5)}% ${f(r.cl,1).padStart(6)}%`);
console.log(`\n═══ ${U} — rejilla huecos x sepDias, porTicker 2, exposicion 24% ═══`);
console.log('caso                    |    $/año   CAGR   caída  Sharpe   ops | mayor% racimo%');
fila('BASE h10 pTk1', medir({huecos:10,tam:0.024,porTicker:1}));
for(const h of [18,20,22]) for(const sd of [10,15,21,30])
  fila(`h${h} pTk2 sep ${sd}`, medir({huecos:h,tam:0.24/h,porTicker:2,sepDias:sd}));
console.log('-- SIN 2020: los dos trozos por separado --');
const EL={huecos:20,tam:0.012,porTicker:2,sepDias:21};
fila('BASE 2016-2019', medir({huecos:10,tam:0.024,porTicker:1,hasta:'20191231'}));
fila('ELEG 2016-2019', medir({...EL,hasta:'20191231'}));
fila('BASE 2021-2026', medir({huecos:10,tam:0.024,porTicker:1,desdeD:'20210101'}));
fila('ELEG 2021-2026', medir({...EL,desdeD:'20210101'}));
// operaciones por año: enseña el problema del capital pequeño
const rb=medir({huecos:10,tam:0.024,porTicker:1}), re=medir(EL);
const porY=(t)=>{const c={}; for(const o of t)c[o.y]=(c[o.y]||0)+1; return c;};
const cb=porY(rb.tom), ce=porY(re.tom);
const ys=[...new Set([...Object.keys(cb),...Object.keys(ce)])].sort();
console.log('\naño   BASE  ELEG');
for(const y of ys) console.log(`${y}  ${String(cb[y]||0).padStart(4)}  ${String(ce[y]||0).padStart(4)}`);
