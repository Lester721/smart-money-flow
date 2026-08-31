import {M,OPS,poner,medir,CFBASE,fila,mayor,UNI} from './z1-rescate27.mjs';
const t0=Date.now();
console.log('\n══ UNIVERSO '+UNI+' ══');
// A · huecos con TAM FIJO (aisla la plaza; en z3 el tam variable lo confundía)
console.log('\n  ── A · plazas, tam fijo 2,4% ──');
console.log('regla'.padEnd(34)+'$/año'.padStart(11)+'CAGR'.padStart(8)+'caída'.padStart(7)+'Sharpe'.padStart(7)+'ops'.padStart(6)+'mayor'.padStart(7));
const ACT=o=> (o._dev!=null && o._dev<-0.07 && o._dev>=-0.30) ? o._dev : null;
for(const h of [6,8,10,12,16,20]){ poner(ACT); const r=medir({...CFBASE,huecos:h});
  console.log(fila('huecos '+h,r,r.q)); }
// B · TAM con 10 plazas
console.log('\n  ── B · tamaño de posición, 10 plazas ──');
for(const tm of [0.018,0.024,0.030,0.040,0.050]){ poner(ACT); const r=medir({...CFBASE,tam:tm});
  console.log(fila('tam '+(100*tm).toFixed(1)+'%',r,r.q)); }
// C · GRID umbral × porTk
console.log('\n  ── C · profundidad × posiciones por ticker (10 plazas, 2,4%) ──');
for(const u of [0.05,0.07,0.09,0.11,0.13,0.15]){
  for(const p of [1,2,3,4]){
    poner(o=> (o._dev!=null && o._dev<-u && o._dev>=-0.30) ? o._dev : null);
    const r=medir({...CFBASE,porTk:p});
    console.log(fila('−'+(100*u).toFixed(0)+'% · porTk '+p,r,r.q)); }
  console.log(''); }
console.log('  ('+((Date.now()-t0)/1000).toFixed(0)+'s)');
