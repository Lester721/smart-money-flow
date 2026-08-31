import {M,OPS,poner,medir,CFBASE,fila,UNI,VOL,IDX} from './z1-rescate27.mjs';
const ACT=o=> (o._dev!=null && o._dev<-0.07 && o._dev>=-0.30) ? o._dev : null;
poner(ACT);
const q=M.simular({...CFBASE,capital:60000});
const S=q.pnlS.reduce((a,b)=>a+b,0), O=q.pnlO.reduce((a,b)=>a+b,0);
console.log('\n══ UNIVERSO '+UNI+' ══');
console.log('  invertido medio en opciones : '+q.invertido.toFixed(1)+'%   (tope teórico 24%)');
console.log('  P&L del SPY ocioso          : $'+Math.round(S).toLocaleString('en-US'));
console.log('  P&L de las OPCIONES         : $'+Math.round(O).toLocaleString('en-US'));
console.log('  final $'+Math.round(q.final).toLocaleString('en-US')+'  ·  ops '+q.ops+'  ·  años '+M.ANOS.toFixed(2));
// SPY puro
const spyq=M.spyApalancado(1);
console.log('  SPY puro (1x)               : $'+Math.round(spyq.final).toLocaleString('en-US')+'  Sharpe '+spyq.sharpe.toFixed(2));

// por ticker
const T={};
for(const t of q.tom){ const g=t.dinero*(t.mult-1);
  (T[t.tk]=T[t.tk]||{n:0,g:0,inv:0,m:[]}); T[t.tk].n++; T[t.tk].g+=g; T[t.tk].inv+=t.dinero; T[t.tk].m.push(t.mult); }
console.log('\n  ticker'.padEnd(10)+'n'.padStart(5)+'$ neto'.padStart(11)+'invertido'.padStart(11)+'x medio'.padStart(9)+'vol ex-ante'.padStart(12));
const V={}; for(const o of OPS) if(o.ma!==999&&o._vol!=null){ (V[o.tk]=V[o.tk]||[]).push(o._vol); }
const filas=Object.entries(T).sort((a,b)=>a[1].g-b[1].g);
for(const [tk,x] of filas){ const vv=V[tk]||[]; const mv=vv.length?vv.reduce((a,b)=>a+b,0)/vv.length:null;
  console.log('  '+tk.padEnd(8)+String(x.n).padStart(5)+('$'+Math.round(x.g).toLocaleString('en-US')).padStart(11)+
    ('$'+Math.round(x.inv).toLocaleString('en-US')).padStart(11)+
    (x.m.reduce((a,b)=>a+b,0)/x.m.length).toFixed(2).padStart(9)+
    (mv!=null?(100*mv).toFixed(0)+'%':'—').padStart(12)); }

// por año
const Y={}; for(const t of q.tom){ (Y[t.y]=Y[t.y]||{n:0,g:0}); Y[t.y].n++; Y[t.y].g+=t.dinero*(t.mult-1); }
console.log('\n  año'.padEnd(8)+'n'.padStart(5)+'$ neto'.padStart(12));
for(const y of Object.keys(Y).sort()) console.log('  '+y.padEnd(6)+String(Y[y].n).padStart(5)+('$'+Math.round(Y[y].g).toLocaleString('en-US')).padStart(12));

// ¿la vol ex-ante separa? tercios por vol en el momento de la señal
const ops=q.tom.map(t=>{ const o=OPS.find(z=>z.tk===t.tk&&z.dC===t.dC); return {...t,vol:o?o._vol:null,dev:o?o._dev:null}; }).filter(x=>x.vol!=null);
ops.sort((a,b)=>a.vol-b.vol); const n3=Math.floor(ops.length/3);
console.log('\n  tercios por VOLATILIDAD ex-ante (100 sesiones) de la acción al comprar:');
for(let k=0;k<3;k++){ const s=ops.slice(k*n3,k===2?ops.length:(k+1)*n3);
  const g=s.reduce((a,x)=>a+x.dinero*(x.mult-1),0), inv=s.reduce((a,x)=>a+x.dinero,0);
  const mm=s.reduce((a,x)=>a+x.mult,0)/s.length;
  console.log('   '+['tranquilas','medias','movidas'][k].padEnd(12)+'n='+String(s.length).padStart(4)+
   '  vol '+(100*s[0].vol).toFixed(0)+'–'+(100*s[s.length-1].vol).toFixed(0)+'%'+
   '   x medio '+mm.toFixed(3)+'   $ neto '+('$'+Math.round(g).toLocaleString('en-US')).padStart(10)+
   '   sobre invertido '+(100*g/inv).toFixed(1)+'%'); }
