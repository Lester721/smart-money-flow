import {M,OPS,poner,medir,CFBASE,fila,UNI} from './z1-rescate27.mjs';
const cab='regla'.padEnd(34)+'$/año'.padStart(11)+'CAGR'.padStart(8)+'caída'.padStart(7)+'Sharpe'.padStart(7)+'ops'.padStart(6)+'mayor'.padStart(7);
const base=o=> (o._dev!=null && o._dev<-0.07 && o._dev>=-0.30);
console.log('\n══ UNIVERSO '+UNI+' ══\n'+cab);
poner(o=>base(o)?o._dev:null); const B=medir(CFBASE); console.log(fila('ACTUAL (sin filtro)',B,B.q));

console.log('\n  ── el hoyo es la MA50; la TENDENCIA es la MA200 ──');
for(const u of [-0.15,-0.10,-0.05,0,0.05,0.10]){
  poner(o=> (base(o)&&o._t200!=null&&o._t200>u) ? o._dev : null);
  const r=medir(CFBASE); console.log(fila('MA200 > '+(100*u).toFixed(0)+'%',r,r.q)); }

console.log('\n  ── momento de 12 meses ──');
for(const u of [-0.20,-0.10,0,0.10,0.20]){
  poner(o=> (base(o)&&o._mom!=null&&o._mom>u) ? o._dev : null);
  const r=medir(CFBASE); console.log(fila('mom12m > '+(100*u).toFixed(0)+'%',r,r.q)); }

console.log('\n  ── volatilidad ex-ante MÍNIMA (el diagnóstico decía movidas) ──');
for(const u of [0,0.20,0.25,0.30,0.35,0.40]){
  poner(o=> (base(o)&&o._vol!=null&&o._vol>u) ? o._dev : null);
  const r=medir(CFBASE); console.log(fila('vol > '+(100*u).toFixed(0)+'%',r,r.q)); }
