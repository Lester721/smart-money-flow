// VERIFICADOR ADVERSARIO — reproduccion independiente de h20/tam1,2%/pTk2/sep15
// Uso: node --max-old-space-size=6144 z-adv-01.mjs AB   |   ... 27
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

// ── CONTROL 0: el motor copiado tiene que dar EXACTAMENTE lo mismo que el original
//    cuando porTicker=1 y sepDias=0. Si no, la copia no es una copia.
const M =await import('./motor-multi.mjs');
{ const VV=M.OPS.map(o=>maN(o.tk,o.dC,50));
  for(let i=0;i<M.OPS.length;i++){const v=VV[i]; M.OPS[i].ma=(v!=null&&v<-0.07&&v>=-0.30)?v:999;} }

const ms=(d)=>Date.parse(d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8)+'T00:00:00Z');
const BASE={modo:'spy',plazo:120,castigo:0.0138,suelo:0.50,costeMin:0};

function medir(extra,MM=M){
  const F=[],A=[],C=[],S=[],O=[],MAY=[],MAYN=[],INV=[],COST=[];
  let tom=null, anos=null;
  for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
    const q=MM.simular({...BASE,...extra,capital:cap});
    if(anos==null) anos=(ms(q.dias[q.dias.length-1])-ms(q.dias[0]))/(365.25*86400000);
    F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);
    INV.push(q.invertido);
    if(q.tom&&q.tom.length&&q.tom[0].pnl!==undefined){
      const pos=q.tom.reduce((a,o)=>a+Math.max(0,o.pnl),0);
      const net=q.tom.reduce((a,o)=>a+o.pnl,0);
      const may=q.tom.reduce((a,o)=>Math.max(a,o.pnl),0);
      MAY.push(pos>0?100*may/pos:0); MAYN.push(net>0?100*may/net:0);
      const cs=q.tom.map(o=>o.dinero).sort((a,b)=>a-b); COST.push(cs[Math.floor(cs.length/2)]);
    }
    if(i===20)tom=q.tom;}
  const md=MM.med;
  return {d:md(F)/anos,a:md(A),c:md(C),s:md(S),o:md(O),
          may:MAY.length?md(MAY):NaN, mayn:MAYN.length?md(MAYN):NaN,
          inv:md(INV), cost:COST.length?md(COST):NaN, anos, tom};
}
const f=(x,n=0)=>Number.isFinite(x)?x.toFixed(n):'  —';
const fila=(et,r)=>console.log(`${et.padEnd(30)}| ${('$'+f(r.d)).padStart(9)} ${f(r.a,1).padStart(5)}% ${f(-r.c,1).padStart(6)}% ${f(r.s,2).padStart(6)} ${f(r.o).padStart(5)} | ${f(r.may,1).padStart(5)}% ${f(r.mayn,1).padStart(6)}% ${f(r.inv,1).padStart(6)}% ${('$'+f(r.cost)).padStart(7)}`);
const BAS={huecos:10,tam:0.024,porTicker:1,sepDias:0};
const ELE={huecos:20,tam:0.012,porTicker:2,sepDias:15};

console.log(`\n═══════ ${U} ═══════`);
console.log('caso                          |     $/año   CAGR   caída  Sharpe   ops | mayor%  /neto  inv%  $medop');
fila('BASE h10/2,4%/pTk1', medir(BAS));
fila('CANDIDATA h20/1,2%/pTk2/s15', medir(ELE));
console.log('-- vecinas: huecos (exposicion 24% congelada, sep15, pTk2) --');
for(const h of [16,18,20,22,24]) fila(`  huecos ${h}`, medir({...ELE,huecos:h,tam:0.24/h}));
console.log('-- vecinas: sepDias --');
for(const s of [0,5,10,15,21,30,45]) fila(`  sepDias ${s}`, medir({...ELE,sepDias:s}));
console.log('-- vecinas: porTicker --');
for(const p of [1,2,3,4,0]) fila(`  porTicker ${p===0?'sin lim':p}`, medir({...ELE,porTicker:p}));
console.log('-- vecinas: exposicion total (h20, sep15, pTk2) --');
for(const e of [0.18,0.20,0.24,0.28,0.32]) fila(`  exp ${(100*e).toFixed(0)}%`, medir({...ELE,tam:e/20}));
console.log('-- CONTROL: mas huecos SIN doblar (pTk1) --');
for(const h of [10,14,20,26]) fila(`  huecos ${h} pTk1`, medir({huecos:h,tam:0.24/h,porTicker:1,sepDias:0}));
