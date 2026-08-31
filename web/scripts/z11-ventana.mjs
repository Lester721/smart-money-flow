// ¿el hallazgo depende de la ventana de 100 sesiones con que mido la volatilidad?
// Si sólo funciona con 100, es un dial afinado; si funciona con 50, 150 y 250, es real.
import {readFileSync} from 'node:fs'; import {join} from 'node:path'; import {CACHE} from './raiz.mjs';
import {M,OPS,poner,medir,CFBASE,fila,UNI,IDX} from './z1-rescate27.mjs';
const PREC = UNI==='AB' ? ['precios-A.json','precios-B.json'] : ['precios-ajustados.json'];
const P={}; for(const f of PREC) Object.assign(P, JSON.parse(readFileSync(join(CACHE,f),'utf8')));
const VOLN={};
for(const tk of Object.keys(P)){ const D=Object.keys(P[tk]).sort(); const px=D.map(d=>P[tk][d]);
  const S=new Set(); for(let i=1;i<px.length;i++){const r=px[i]/px[i-1]; if(r>1.35||r<0.65)S.add(i);}
  const lr=new Array(px.length).fill(null);
  for(let i=1;i<px.length;i++) if(!S.has(i)) lr[i]=Math.log(px[i]/px[i-1]);
  VOLN[tk]={};
  for(const N of [50,100,150,250]){ const v=new Array(px.length).fill(null);
    for(let i=N;i<px.length;i++){ const a=[];
      for(let j=i-N;j<i;j++) if(lr[j]!=null) a.push(lr[j]);
      if(a.length<N*0.8) continue;
      const m=a.reduce((x,y)=>x+y,0)/a.length;
      v[i]=Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/(a.length-1))*Math.sqrt(252); }
    VOLN[tk][N]=v; } }
const cab='regla'.padEnd(34)+'$/año'.padStart(11)+'CAGR'.padStart(8)+'caída'.padStart(7)+'Sharpe'.padStart(7)+'ops'.padStart(6)+'mayor'.padStart(7);
console.log('\n══ UNIVERSO '+UNI+' ══\n'+cab);
poner(o=>(o._dev!=null&&o._dev<-0.07&&o._dev>=-0.30)?o._dev:null);
const B=medir(CFBASE); console.log(fila('ACTUAL',B,B.q));
for(const N of [50,100,150,250]){
  for(const o of OPS){ const i=IDX[o.tk]?.get(o.dC); o._vN=(i!=null)?(VOLN[o.tk]?.[N]?.[i]??null):null; }
  for(const v of [0.28,0.30,0.32]){
    poner(o=> (o._dev!=null&&o._dev<-0.05&&o._dev>=-0.30&&o._vN!=null&&o._vN>v)?o._dev:null);
    const r=medir(CFBASE); console.log(fila('vol '+N+' sesiones > '+(100*v).toFixed(0)+'%',r,r.q)); }
  console.log(''); }
