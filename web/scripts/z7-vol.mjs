import {M,OPS,poner,medir,CFBASE,fila,UNI} from './z1-rescate27.mjs';
const cab='regla'.padEnd(34)+'$/año'.padStart(11)+'CAGR'.padStart(8)+'caída'.padStart(7)+'Sharpe'.padStart(7)+'ops'.padStart(6)+'mayor'.padStart(7);
const dip=(o,u)=> (o._dev!=null && o._dev<-u && o._dev>=-0.30);
console.log('\n══ UNIVERSO '+UNI+' ══\n'+cab);
poner(o=>dip(o,0.07)?o._dev:null); console.log(fila('ACTUAL',medir(CFBASE),medir(CFBASE).q));

console.log('\n  ── 1 · vol ABSOLUTA, malla fina ──');
for(const u of [0.22,0.24,0.26,0.28,0.30,0.32,0.34,0.36,0.38]){
  poner(o=> (dip(o,0.07)&&o._vol!=null&&o._vol>u)?o._dev:null);
  const r=medir(CFBASE); console.log(fila('vol > '+(100*u).toFixed(0)+'%',r,r.q)); }

console.log('\n  ── 2 · vol RELATIVA a la mediana del día (sin régimen) ──');
for(const u of [0.8,0.9,1.0,1.1,1.2,1.3,1.4,1.6]){
  poner(o=> (dip(o,0.07)&&o._volR!=null&&o._volR>u)?o._dev:null);
  const r=medir(CFBASE); console.log(fila('volR > '+u.toFixed(2)+'×',r,r.q)); }

console.log('\n  ── 3 · vol RELATIVA × profundidad del hoyo (recuperar operaciones) ──');
for(const u of [0.03,0.05,0.07,0.09,0.11]){
  for(const v of [1.0,1.2,1.4]){
    poner(o=> (dip(o,u)&&o._volR!=null&&o._volR>v)?o._dev:null);
    const r=medir(CFBASE); console.log(fila('−'+(100*u).toFixed(0)+'% · volR>'+v.toFixed(1),r,r.q)); }
  console.log(''); }
