import {M,OPS,poner,medir,CFBASE,fila,UNI} from './z1-rescate27.mjs';
const cab='regla'.padEnd(34)+'$/año'.padStart(11)+'CAGR'.padStart(8)+'caída'.padStart(7)+'Sharpe'.padStart(7)+'ops'.padStart(6)+'mayor'.padStart(7);
const dip=(o,u)=> (o._dev!=null && o._dev<-u && o._dev>=-0.30);
const R=(u,v)=>o=> (dip(o,u)&&o._vol!=null&&o._vol>v)?o._dev:null;
const CF2={...CFBASE,porTk:2};
console.log('\n══ UNIVERSO '+UNI+' ══\n'+cab);
poner(o=>dip(o,0.07)?o._dev:null); const B=medir(CFBASE); console.log(fila('ACTUAL',B,B.q));
poner(R(0.05,0.30)); console.log(fila('F1  vol>30%·−5%  porTk1',medir(CFBASE),medir(CFBASE).q));
poner(R(0.05,0.30)); const F2=medir(CF2); console.log(fila('F2  vol>30%·−5%  porTk2',F2,F2.q));

console.log('\n  ── VECINDARIO de F2 (porTk 2) ──');
for(const v of [0.28,0.30,0.32]) for(const u of [0.04,0.05,0.06]){
  poner(R(u,v)); const r=medir(CF2);
  console.log(fila('  vol>'+(100*v).toFixed(0)+'% · −'+(100*u).toFixed(0)+'%',r,r.q)); }

console.log('\n  ── F2: robustez ──');
poner(o=> (o.dC.slice(0,4)==='2020')?null:R(0.05,0.30)(o));
let r=medir(CF2); console.log(fila('  F2 sin 2020',r,r.q));
poner(R(0.05,0.30));
r=medir({...CF2,hasta:'20201231'}); console.log(fila('  F2 2016-2020',r,r.q));
r=medir({...CF2,desdeD:'20210101'}); console.log(fila('  F2 2021-2026',r,r.q));
r=medir({...CF2,castigo:0.0276}); console.log(fila('  F2 doble peaje (2,76%)',r,r.q));
r=medir({...CF2,plazo:100}); console.log(fila('  F2 aguante 100',r,r.q));
r=medir({...CF2,plazo:150}); console.log(fila('  F2 aguante 150',r,r.q));
r=medir({...CF2,suelo:0.40}); console.log(fila('  F2 suelo 0,40',r,r.q));
r=medir({...CF2,suelo:0.60}); console.log(fila('  F2 suelo 0,60',r,r.q));

console.log('\n  ── F2 año a año ──');
poner(R(0.05,0.30)); const q=M.simular({...CF2,capital:60000});
const Y={}; for(const t of q.tom){ (Y[t.y]=Y[t.y]||{n:0,g:0}); Y[t.y].n++; Y[t.y].g+=t.dinero*(t.mult-1); }
console.log('   '+Object.keys(Y).sort().map(y=>y+':'+Y[y].n+'/$'+Math.round(Y[y].g/1000)+'k').join('  '));
console.log('   invertido '+q.invertido.toFixed(1)+'%  ·  P&L opciones $'+
  Math.round(q.pnlO.reduce((a,b)=>a+b,0)).toLocaleString('en-US'));
