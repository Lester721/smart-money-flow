import {M,OPS,poner,medir,marcarRec,CFBASE,fila,mayor,UNI} from './z1-rescate27.mjs';
const cab='regla'.padEnd(30)+'$/año'.padStart(11)+'CAGR'.padStart(8)+'caída'.padStart(7)+'Sharpe'.padStart(7)+'ops'.padStart(6)+'mayor'.padStart(7);
console.log('\n══ UNIVERSO '+UNI+' ══\n'); console.log(cab);

// ── 0 · LA REGLA ACTUAL ──────────────────────────────────────────────────────────
poner(o=> (o._dev!=null && o._dev<-0.07 && o._dev>=-0.30) ? o._dev : null);
const B=medir(CFBASE); console.log(fila('ACTUAL  −7% en %',B,B.q));

// ── 1 · CORTE EN DESVIACIONES (z) en vez de en % ─────────────────────────────────
console.log('');
for(const zc of [0.75,1.00,1.25,1.50,1.75,2.00,2.25]){
  poner(o=> (o._z!=null && o._z<=-zc && o._dev>=-0.30) ? o._z : null);
  const r=medir(CFBASE); console.log(fila('z ≤ −'+zc.toFixed(2),r,r.q)); }

// ── 2 · CORTE EN % MÁS PROFUNDO ──────────────────────────────────────────────────
console.log('');
for(const u of [0.05,0.07,0.09,0.11,0.13,0.15,0.18]){
  poner(o=> (o._dev!=null && o._dev<-u && o._dev>=-0.30) ? o._dev : null);
  const r=medir(CFBASE); console.log(fila('% ≤ −'+(100*u).toFixed(0)+'%',r,r.q)); }
