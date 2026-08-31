// ══ VÍA "LA MISMA GANANCIA CON MENOS SUSTO" ══
// Barre los tres mandos de riesgo del motor (volObj, topeSector, frenoSPY/reentrada)
// + dos añadidos en la COPIA motor-susto.mjs (ddFreno = freno por caída de la propia
// cuenta, pesoSPY = cuánto del dinero ocioso vive en SPY).
// Todo se mide SIEMPRE como mediana de 41 capitales de partida.
import { readFileSync } from 'node:fs'; import { join } from 'node:path'; import { CACHE } from './raiz.mjs';

const CAP = 60000;
const UNIV = process.env.UNIV || 'AB';
const FICH = UNIV === 'AB' ? ['precios-A.json','precios-B.json'] : ['precios-ajustados.json'];
process.env.CAMINOS = UNIV === 'AB' ? 'sincosteAB-p25-d400.json' : 'sincoste-p25-d400.json';

const P = {}; for (const f of FICH) Object.assign(P, JSON.parse(readFileSync(join(CACHE, f), 'utf8')));
const PX = {}, IDX = {}, SPL = {};
for (const tk of Object.keys(P)) { const Dt = Object.keys(P[tk]).sort();
  PX[tk] = Dt.map(d => P[tk][d]); IDX[tk] = new Map(Dt.map((d,i)=>[d,i]));
  const S = new Set(); for (let i=1;i<Dt.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);} SPL[tk]=S; }
const maN = (tk,d,N) => { const i = IDX[tk]?.get(d); if (i==null||i<N) return null;
  for (let j=i-N+1;j<=i;j++) if (SPL[tk].has(j)) return null;
  let s=0; for (let j=i-N;j<i;j++) s+=PX[tk][j]; return PX[tk][i]/(s/N)-1; };

const M = await import('./motor-susto.mjs');
const V = M.OPS.map(o => maN(o.tk, o.dC, 50));
for (let i=0;i<M.OPS.length;i++){ const v=V[i]; M.OPS[i].ma = (v!=null && v<-0.07 && v>=-0.30) ? v : 999; }


const BASE = { tam:0.024, huecos:10, modo:'spy', plazo:120, castigo:0.0138, suelo:0.50, costeMin:0 };
const PER = [ ['2016-2026 (todo)', {}],
              ['2016-2019 (SIN 2020, antes)', {hasta:'20191231'}],
              ['2021-2026 (SIN 2020, despues)', {desdeD:'20210101'}],
              ['2020 solo', {desdeD:'20200101', hasta:'20201231'}],
              ['2022-2026 (fuera de muestra)', {desdeD:'20220101'}] ];

function medir(extra) {
  const F=[],A=[],C=[],S=[],O=[],MAY=[];
  for (let i=0;i<41;i++){ const cap = CAP*(1+(i-20)*0.005);
    const q = M.simular({ ...BASE, ...extra, capital: cap });
    const anos = q.dias.length/252;
    F.push((q.final-cap)/anos); A.push(q.cagr); C.push(q.caida); S.push(q.sharpe); O.push(q.ops);
    const tot=q.tom.reduce((a,t)=>a+t.pnl,0), mx=q.tom.reduce((a,t)=>Math.max(a,t.pnl),0);
    MAY.push(tot>0?100*mx/tot:NaN); }
  const Z=MAY.filter(x=>!isNaN(x));
  return { d:M.med(F), a:M.med(A), c:M.med(C), s:M.med(S), o:M.med(O), may:Z.length?M.med(Z):NaN };
}
const fmt=(r,e)=>`${e.padEnd(40)} $${Math.round(r.d).toLocaleString('en-US').padStart(7)}/año ${r.a.toFixed(1).padStart(5)}%  caída ${r.c.toFixed(1).padStart(5)}%  Sh ${r.s.toFixed(3)}  ops ${String(r.o).padStart(4)}  mayor ${isNaN(r.may)?' n/a':r.may.toFixed(1)+'%'}`;

const CFG = JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log('universo', UNIV, '| años', M.ANOS.toFixed(2));
for (const [np, pc] of PER) { console.log(String.fromCharCode(10) + '== ' + np + ' ==');
  for (const c of CFG) console.log(fmt(medir({ ...pc, ...c.cfg }), c.etq)); }
