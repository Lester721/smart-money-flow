// ADVERSARIO 3 — ¿el hueco de 1,20% COMPRA algo al empezar? Ops por año, P&L por año,
// y sensibilidad al capital de partida (no ±10%, sino x0,5 y x4).
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
const BAS={huecos:10,tam:0.024,porTicker:1,sepDias:0};
const ELE={huecos:20,tam:0.012,porTicker:2,sepDias:15};
// coste de UN contrato entre las señales elegibles
const CO=M.OPS.filter(o=>o.ma<0).map(o=>o.coste*1.0069).sort((a,b)=>a-b);
console.log(`\n═══════ ${U} ═══════`);
console.log(`señales elegibles: ${CO.length}. Coste de UN contrato: p10 $${CO[Math.floor(CO.length*.1)].toFixed(0)} · p25 $${CO[Math.floor(CO.length*.25)].toFixed(0)} · mediana $${CO[Math.floor(CO.length/2)].toFixed(0)} · p75 $${CO[Math.floor(CO.length*.75)].toFixed(0)} · p90 $${CO[Math.floor(CO.length*.9)].toFixed(0)}`);
const cmp=(h)=>100*CO.filter(c=>c<=h).length/CO.length;
console.log(`  con un hueco de $720  (1,20% de $60.000) es comprable el ${cmp(720).toFixed(1)}% de las señales`);
console.log(`  con un hueco de $1440 (2,40% de $60.000) es comprable el ${cmp(1440).toFixed(1)}%`);
console.log(`  con un hueco de $2400 (1,20% de $200.000) es comprable el ${cmp(2400).toFixed(1)}%`);

console.log('\n-- OPS POR AÑO (corrida central, capital $60.000) --');
for(const [et,cf] of [['BASE',BAS],['ELEG',ELE]]){
  const q=M.simular({...BASE,...cf,capital:60000});
  const Y={},PY={}; for(const o of q.tom){Y[o.y]=(Y[o.y]||0)+1; PY[o.y]=(PY[o.y]||0)+o.pnl;}
  console.log(`${et}: ${Object.keys(Y).sort().map(y=>`${y}:${Y[y]}`).join(' ')}   total ${q.tom.length}`);
  console.log(`     P&L$: ${Object.keys(PY).sort().map(y=>`${y}:${Math.round(PY[y])}`).join(' ')}`);
}
console.log('\n-- SENSIBILIDAD AL CAPITAL DE PARTIDA (mediana de 41 alrededor de cada uno) --');
console.log('capital    |  BASE $/año  Sh   ops  |  ELEG $/año  Sh   ops  |  diferencia');
for(const C0 of [15000,30000,60000,120000,250000,500000]){
  const R={};
  for(const [et,cf] of [['b',BAS],['e',ELE]]){
    const F=[],S=[],O=[]; let anos=null;
    for(let i=0;i<41;i++){const cap=C0*(1+(i-20)*0.005);
      const q=M.simular({...BASE,...cf,capital:cap});
      if(anos==null)anos=(ms(q.dias[q.dias.length-1])-ms(q.dias[0]))/(365.25*86400000);
      F.push(q.final-cap);S.push(q.sharpe);O.push(q.ops);}
    R[et]={d:M.med(F)/anos,s:M.med(S),o:M.med(O)};}
  const dd=100*(R.e.d/R.b.d-1);
  console.log(`$${String(C0).padStart(7)}   |  ${('$'+R.b.d.toFixed(0)).padStart(9)} ${R.b.s.toFixed(2)} ${String(R.b.o).padStart(4)}  |  ${('$'+R.e.d.toFixed(0)).padStart(9)} ${R.e.s.toFixed(2)} ${String(R.e.o).padStart(4)}  |  ${(dd>=0?'+':'')+dd.toFixed(1)}%`);
}
console.log('\n-- ¿y si el hueco se fija en DOLARES en vez de en % (sin efecto bola de nieve)? --');
console.log('   (no se puede con el motor: tam es siempre % del patrimonio. Se mide por capital arriba.)');
