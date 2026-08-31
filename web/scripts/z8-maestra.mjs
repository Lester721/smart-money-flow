import {M,OPS,poner,medir,CFBASE,fila,mayor,UNI} from './z1-rescate27.mjs';
const cab='regla'.padEnd(34)+'$/año'.padStart(11)+'CAGR'.padStart(8)+'caída'.padStart(7)+'Sharpe'.padStart(7)+'ops'.padStart(6)+'mayor'.padStart(7);
const dip=(o,u)=> (o._dev!=null && o._dev<-u && o._dev>=-0.30);
console.log('\n══ UNIVERSO '+UNI+' ══\n'+cab);
poner(o=>dip(o,0.07)?o._dev:null); const B=medir(CFBASE); console.log(fila('ACTUAL',B,B.q));

console.log('\n  ── 1 · vol CONTRA EL SPY (portátil, sin régimen) ──');
for(const u of [1.2,1.4,1.6,1.8,2.0,2.2,2.5]){
  poner(o=> (dip(o,0.07)&&o._volS!=null&&o._volS>u)?o._dev:null);
  const r=medir(CFBASE); console.log(fila('volS > '+u.toFixed(1)+'× SPY',r,r.q)); }

console.log('\n  ── 2 · MALLA hoyo × vol absoluta ──');
for(const v of [0.26,0.28,0.30,0.32]){
  for(const u of [0.03,0.04,0.05,0.06,0.07,0.09]){
    poner(o=> (dip(o,u)&&o._vol!=null&&o._vol>v)?o._dev:null);
    const r=medir(CFBASE); console.log(fila('vol>'+(100*v).toFixed(0)+'% · hoyo −'+(100*u).toFixed(0)+'%',r,r.q)); }
  console.log(''); }

console.log('  ── 3 · MALLA hoyo × vol contra SPY ──');
for(const v of [1.4,1.6,1.8]){
  for(const u of [0.03,0.05,0.07,0.09]){
    poner(o=> (dip(o,u)&&o._volS!=null&&o._volS>v)?o._dev:null);
    const r=medir(CFBASE); console.log(fila('volS>'+v.toFixed(1)+' · hoyo −'+(100*u).toFixed(0)+'%',r,r.q)); }
  console.log(''); }
