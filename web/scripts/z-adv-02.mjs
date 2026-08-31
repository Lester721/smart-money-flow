// ADVERSARIO 2 — ¿de donde sale la mejora? Atribucion SPY/opciones, control de
// exposicion IGUALADA, subperiodos, y media de la rejilla contra la base.
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
{const VV=M.OPS.map(o=>maN(o.tk,o.dC,50));
 for(let i=0;i<M.OPS.length;i++){const v=VV[i]; M.OPS[i].ma=(v!=null&&v<-0.07&&v>=-0.30)?v:999;}}
const ms=(d)=>Date.parse(d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8)+'T00:00:00Z');
const BASE={modo:'spy',plazo:120,castigo:0.0138,suelo:0.50,costeMin:0};
const sum=(A)=>A.reduce((a,x)=>a+x,0);
function medir(extra){
  const F=[],A=[],C=[],S=[],O=[],INV=[],PS=[],PO=[],MAY=[],COST=[]; let tom=null,anos=null;
  for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
    const q=M.simular({...BASE,...extra,capital:cap});
    if(anos==null)anos=(ms(q.dias[q.dias.length-1])-ms(q.dias[0]))/(365.25*86400000);
    F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);INV.push(q.invertido);
    PS.push(sum(q.pnlS)); PO.push(sum(q.pnlO));
    if(q.tom.length){const may=q.tom.reduce((a,o)=>Math.max(a,o.pnl),0);
      MAY.push(100*may/Math.max(1,q.final-cap));
      const cs=q.tom.map(o=>o.dinero).sort((a,b)=>a-b); COST.push(cs[Math.floor(cs.length/2)]);}
    if(i===20)tom=q.tom;}
  const md=M.med;
  return {d:md(F)/anos,a:md(A),c:md(C),s:md(S),o:md(O),inv:md(INV),
          ps:md(PS)/anos,po:md(PO)/anos,may:MAY.length?md(MAY):NaN,cost:COST.length?md(COST):NaN,anos,tom};
}
const f=(x,n=0)=>Number.isFinite(x)?x.toFixed(n):' —';
const fila=(et,r)=>console.log(`${et.padEnd(28)}| ${('$'+f(r.d)).padStart(9)} ${f(r.a,1).padStart(5)}% ${f(-r.c,1).padStart(6)}% ${f(r.s,2).padStart(6)} ${f(r.o).padStart(5)} | ${('$'+f(r.ps)).padStart(8)} ${('$'+f(r.po)).padStart(8)} | ${f(r.inv,1).padStart(5)}% ${f(r.may,1).padStart(6)}%`);
const BAS={huecos:10,tam:0.024,porTicker:1,sepDias:0};
const ELE={huecos:20,tam:0.012,porTicker:2,sepDias:15};
console.log(`\n═══════ ${U} — ATRIBUCION ═══════`);
console.log('caso                        |     $/año   CAGR   caída  Sharpe   ops |  SPY$/año  OPC$/año | inv%  mayor/neto');
fila('SOLO SPY (huecos 0)', medir({huecos:0,tam:0.024}));
fila('BASE h10/2,4%/pTk1', medir(BAS));
fila('CANDIDATA h20/1,2%/p2/s15', medir(ELE));
console.log('\n-- CONTROL DE EXPOSICION IGUALADA: la BASE (h10, pTk1) con menos tamaño --');
for(const tm of [0.010,0.012,0.014,0.016,0.018,0.020,0.024,0.028])
  fila(`  BASE h10 tam ${(100*tm).toFixed(1)}%`, medir({...BAS,tam:tm}));
console.log('\n-- CONTROL: huecos SIN doblar, exposicion nominal 24% --');
for(const h of [10,12,14,16,18,20,22,24,26,30])
  fila(`  h${h} pTk1 tam ${(100*0.24/h).toFixed(2)}%`, medir({huecos:h,tam:0.24/h,porTicker:1}));
console.log('\n-- SUBPERIODOS --');
const SUB=[['2016-2019',{hasta:'20191231'}],['2021-2026',{desdeD:'20210101'}],
           ['sin 2025-26 (->2024)',{hasta:'20241231'}],['1a mitad ->2020',{hasta:'20201231'}],
           ['2a mitad 2021->',{desdeD:'20210101'}],['sin 2020 y sin 2025',{hasta:'20191231'}]];
for(const [et,ex] of SUB.slice(0,5)){ fila(`BASE  ${et}`, medir({...BAS,...ex})); fila(`ELEG  ${et}`, medir({...ELE,...ex})); }
console.log('\n-- 2021-2024 (sin 2020 Y sin 2025-26) --');
fila('BASE  2021-2024', medir({...BAS,desdeD:'20210101',hasta:'20241231'}));
fila('ELEG  2021-2024', medir({...ELE,desdeD:'20210101',hasta:'20241231'}));
console.log('\n-- REJILLA COMPLETA h{18,20,22} x sep{10,15,21,30}, pTk2: media contra la base --');
const G=[]; for(const h of [18,20,22]) for(const s of [10,15,21,30]){
  const r=medir({huecos:h,tam:0.24/h,porTicker:2,sepDias:s}); G.push(r);
  console.log(`  h${h} s${String(s).padStart(2)} -> $${f(r.d)}  Sh ${f(r.s,2)}  dd ${f(-r.c,1)}%  ops ${f(r.o)}`);}
const bb=medir(BAS);
console.log(`  MEDIA de las 12: $${f(sum(G.map(x=>x.d))/12)}  Sh ${f(sum(G.map(x=>x.s))/12,2)}  dd ${f(-sum(G.map(x=>x.c))/12,1)}%  ops ${f(sum(G.map(x=>x.o))/12)}`);
console.log(`  BASE          : $${f(bb.d)}  Sh ${f(bb.s,2)}  dd ${f(-bb.c,1)}%  ops ${f(bb.o)}`);
console.log(`  ELEGIDA / media de la rejilla: ${f(100*medir(ELE).d/(sum(G.map(x=>x.d))/12),1)}% del promedio`);
