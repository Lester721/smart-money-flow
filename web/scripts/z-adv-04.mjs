// ADVERSARIO 4 — la version RESCATABLE: mas huecos, SIN doblar (porTicker=1).
// Se comprueba en los dos universos, subperiodos, y capital x0,25 .. x8.
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
{const VV=M.OPS.map(o=>maN(o.tk,o.dC,50));
 for(let i=0;i<M.OPS.length;i++){const v=VV[i]; M.OPS[i].ma=(v!=null&&v<-0.07&&v>=-0.30)?v:999;}}
const ms=(d)=>Date.parse(d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8)+'T00:00:00Z');
const BASE={modo:'spy',plazo:120,castigo:0.0138,suelo:0.50,costeMin:0};
const sum=(A)=>A.reduce((a,x)=>a+x,0);
function medir(extra,C0=60000){
  const F=[],A=[],C=[],S=[],O=[],INV=[],PO=[],PS=[]; let anos=null;
  for(let i=0;i<41;i++){const cap=C0*(1+(i-20)*0.005);
    const q=M.simular({...BASE,...extra,capital:cap});
    if(anos==null)anos=(ms(q.dias[q.dias.length-1])-ms(q.dias[0]))/(365.25*86400000);
    F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);
    INV.push(q.invertido);PO.push(sum(q.pnlO));PS.push(sum(q.pnlS));}
  const md=M.med;
  return {d:md(F)/anos,a:md(A),c:md(C),s:md(S),o:md(O),inv:md(INV),po:md(PO)/anos,ps:md(PS)/anos};
}
const f=(x,n=0)=>Number.isFinite(x)?x.toFixed(n):' —';
const fila=(et,r)=>console.log(`${et.padEnd(26)}| ${('$'+f(r.d)).padStart(9)} ${f(r.a,1).padStart(5)}% ${f(-r.c,1).padStart(6)}% ${f(r.s,2).padStart(6)} ${f(r.o).padStart(5)} | ${('$'+f(r.ps)).padStart(8)} ${('$'+f(r.po)).padStart(8)} | ${f(r.inv,1).padStart(5)}%`);
const BAS={huecos:10,tam:0.024,porTicker:1,sepDias:0};
const R16={huecos:16,tam:0.015,porTicker:1,sepDias:0};   // la version modesta
const ELE={huecos:20,tam:0.012,porTicker:2,sepDias:15};
console.log(`\n═══════ ${U} — ¿aguanta la version MODESTA (h16, pTk1, 24% de exposicion)? ═══════`);
console.log('caso                      |     $/año   CAGR   caída  Sharpe   ops |  SPY$/año  OPC$/año | inv%');
fila('BASE  h10/2,4%/pTk1', medir(BAS));
fila('MODESTA h16/1,5%/pTk1', medir(R16));
fila('SUYA  h20/1,2%/p2/s15', medir(ELE));
console.log('-- vecinas de la modesta: huecos, exposicion 24%, pTk1 --');
for(const h of [13,14,15,16,17,18,19]) fila(`  h${h} tam ${(100*.24/h).toFixed(2)}%`, medir({huecos:h,tam:0.24/h,porTicker:1}));
console.log('-- h16 pTk1 vs h16 pTk2 (¿aporta doblar?) --');
for(const p of [1,2,3]) fila(`  h16 pTk ${p} sep15`, medir({huecos:16,tam:0.015,porTicker:p,sepDias:15}));
console.log('-- subperiodos de la MODESTA --');
for(const [et,ex] of [['2016-2019',{hasta:'20191231'}],['2021-2026',{desdeD:'20210101'}],
                      ['->2024 (sin 2025-26)',{hasta:'20241231'}],['2021-2024',{desdeD:'20210101',hasta:'20241231'}]]){
  fila(`BASE ${et}`, medir({...BAS,...ex})); fila(`MOD  ${et}`, medir({...R16,...ex})); }
console.log('-- capital de partida --');
console.log('capital    |  BASE $/año  Sh  ops |  MODESTA $/año  Sh  ops | dif');
for(const C0 of [15000,30000,60000,120000,250000,500000]){
  const b=medir(BAS,C0), m=medir(R16,C0);
  console.log(`$${String(C0).padStart(7)}   | ${('$'+f(b.d)).padStart(9)} ${f(b.s,2)} ${String(b.o).padStart(4)} | ${('$'+f(m.d)).padStart(12)} ${f(m.s,2)} ${String(m.o).padStart(4)} | ${(m.d>=b.d?'+':'')+f(100*(m.d/b.d-1),1)}%`);}
