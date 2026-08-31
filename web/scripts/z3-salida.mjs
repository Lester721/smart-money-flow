import {M,OPS,poner,medir,marcarRec,CFBASE,fila,UNI} from './z1-rescate27.mjs';
const cab='regla'.padEnd(34)+'$/año'.padStart(11)+'CAGR'.padStart(8)+'caída'.padStart(7)+'Sharpe'.padStart(7)+'ops'.padStart(6)+'mayor'.padStart(7);
const ACT=o=> (o._dev!=null && o._dev<-0.07 && o._dev>=-0.30) ? o._dev : null;
console.log('\n══ UNIVERSO '+UNI+' ══\n'+cab);
poner(ACT); const B=medir(CFBASE); console.log(fila('ACTUAL',B,B.q));

// ── 1 · SALIDA CONDICIONAL: soltar la plaza cuando la ACCIÓN recupera su media ──
console.log('\n  ── salida al recuperar la MA50 (aguante máx 120) ──');
for(const mar of [0,0.02,0.05]) for(const esp of [0,10,20,40]){
  marcarRec(mar,esp); poner(ACT);
  const r=medir({...CFBASE,usarRec:true});
  console.log(fila('rec +'+(100*mar).toFixed(0)+'% · espera '+esp,r,r.q)); }

console.log('\n  ── lo mismo pero con aguante máximo 250 (deja correr) ──');
for(const mar of [0,0.02,0.05]) for(const esp of [0,20,40]){
  marcarRec(mar,esp); poner(ACT);
  const r=medir({...CFBASE,plazo:250,usarRec:true});
  console.log(fila('rec250 +'+(100*mar).toFixed(0)+'% · esp '+esp,r,r.q)); }

// ── 2 · MÁS PLAZAS (sin salida condicional) ──
console.log('\n  ── número de plazas, exposición total constante 24% ──');
for(const h of [6,8,10,14,20,30]){ marcarRec(0,0); poner(ACT);
  const r=medir({...CFBASE,huecos:h,tam:0.24/h});
  console.log(fila('huecos '+h+' · tam '+(24/h).toFixed(1)+'%',r,r.q)); }

// ── 3 · MÁS DE UNA POSICIÓN POR TICKER ──
console.log('\n  ── varias posiciones por ticker (10 plazas, 2,4%) ──');
for(const p of [1,2,3]){ poner(ACT);
  const r=medir({...CFBASE,porTk:p});
  console.log(fila('porTk '+p,r,r.q)); }
