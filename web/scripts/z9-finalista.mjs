import {M,OPS,poner,medir,CFBASE,fila,mayor,UNI} from './z1-rescate27.mjs';
const cab='regla'.padEnd(34)+'$/año'.padStart(11)+'CAGR'.padStart(8)+'caída'.padStart(7)+'Sharpe'.padStart(7)+'ops'.padStart(6)+'mayor'.padStart(7);
const dip=(o,u)=> (o._dev!=null && o._dev<-u && o._dev>=-0.30);
const R=(u,v)=>o=> (dip(o,u)&&o._vol!=null&&o._vol>v)?o._dev:null;
console.log('\n══ UNIVERSO '+UNI+' ══\n'+cab);
poner(o=>dip(o,0.07)?o._dev:null); const B=medir(CFBASE); console.log(fila('ACTUAL',B,B.q));
poner(R(0.05,0.30)); const F=medir(CFBASE); console.log(fila('FINALISTA vol>30% · −5%',F,F.q));

console.log('\n  ── VECINDARIO completo alrededor de la casilla ──');
for(const v of [0.28,0.30,0.32]) for(const u of [0.04,0.05,0.06]){
  poner(R(u,v)); const r=medir(CFBASE);
  console.log(fila('  vol>'+(100*v).toFixed(0)+'% · −'+(100*u).toFixed(0)+'%',r,r.q)); }

console.log('\n  ── MÁS OPERACIONES: 2 posiciones por ticker y más plazas ──');
for(const p of [1,2,3]){ poner(R(0.05,0.30)); const r=medir({...CFBASE,porTk:p});
  console.log(fila('  porTk '+p,r,r.q)); }
for(const h of [10,12,14]){ poner(R(0.05,0.30)); const r=medir({...CFBASE,huecos:h});
  console.log(fila('  huecos '+h,r,r.q)); }
for(const h of [12,14]) for(const p of [2]){ poner(R(0.05,0.30));
  const r=medir({...CFBASE,huecos:h,porTk:p}); console.log(fila('  huecos '+h+' · porTk '+p,r,r.q)); }

console.log('\n  ── SIN 2020: ninguna compra abierta en el año 2020 (periodo completo) ──');
for(const [n,f] of [['ACTUAL',o=>dip(o,0.07)?o._dev:null],['FINALISTA',R(0.05,0.30)]]){
  poner(o=> (o.dC.slice(0,4)==='2020')?null:f(o));
  const r=medir(CFBASE); console.log(fila('  '+n+' sin 2020',r,r.q)); }

console.log('\n  ── DOS MITADES (fuera de muestra la una de la otra) ──');
for(const [n,f] of [['ACTUAL',o=>dip(o,0.07)?o._dev:null],['FINALISTA',R(0.05,0.30)]]){
  poner(f);
  const a=medir({...CFBASE,hasta:'20201231'}), b=medir({...CFBASE,desdeD:'20210101'});
  console.log(fila('  '+n+' 2016-2020',a,a.q)); console.log(fila('  '+n+' 2021-2026',b,b.q)); }

console.log('\n  ── el FINALISTA año a año (una corrida, $60.000) ──');
poner(R(0.05,0.30));
const q=M.simular({...CFBASE,capital:60000});
const Y={}; for(const t of q.tom){ (Y[t.y]=Y[t.y]||{n:0,g:0}); Y[t.y].n++; Y[t.y].g+=t.dinero*(t.mult-1); }
let l='   '; for(const y of Object.keys(Y).sort()) l+=y+':'+Y[y].n+'ops/$'+Math.round(Y[y].g/1000)+'k  ';
console.log(l);
const S=q.pnlS.reduce((a,b)=>a+b,0), O=q.pnlO.reduce((a,b)=>a+b,0);
console.log('   invertido '+q.invertido.toFixed(1)+'%  ·  P&L SPY $'+Math.round(S).toLocaleString('en-US')+
            '  ·  P&L opciones $'+Math.round(O).toLocaleString('en-US'));
const T={}; for(const t of q.tom){ (T[t.tk]=T[t.tk]||{n:0,g:0}); T[t.tk].n++; T[t.tk].g+=t.dinero*(t.mult-1); }
console.log('   por ticker: '+Object.entries(T).sort((a,b)=>b[1].g-a[1].g)
  .map(([k,x])=>k+' '+x.n+'/$'+Math.round(x.g/1000)+'k').join('  '));
