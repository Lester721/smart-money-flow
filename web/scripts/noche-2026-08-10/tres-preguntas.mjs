// Las tres preguntas de Lester, contestadas con datos y no con suposiciones.
//
//  1. ¿Que supuse cuando te asignan? -> liquidacion al CIERRE del viernes.
//     Eso es una suposicion optimista: la asignacion se sabe el finde y vendes el LUNES.
//     Aqui se mide cuanto cuesta ese hueco de verdad.
//  2. ¿Viernes a viernes? -> si, 7 dias naturales.
//  3. ¿A que hora? -> al CIERRE del viernes. No hay dato intradia, asi que no puedo
//     afirmar nada de otras horas.
//
// Y la alternativa que evita el problema entero: RECOMPRAR la put el viernes antes del
// cierre en vez de dejar que te asignen. Se valora con el ask real de ese mismo viernes.

import fs from 'node:fs';
const S=process.argv[2];
const oc=JSON.parse(fs.readFileSync(S+'/qqq-oc.json','utf8'));
const iOf=new Map(oc.map((b,i)=>[b.d,i]));
const M=await import('./semanal-lib.mjs');
const o=M.correr('theta-sem','QQQ',{otm:0.03});

function leerVenc(f){
  const p=`${S}/theta-venc/QQQ_${f}_P.csv`; if(!fs.existsSync(p)) return null;
  const lin=fs.readFileSync(p,'utf8').split('\n'), cab=lin[0].split(',');
  const iK=cab.indexOf('strike'), iB=cab.indexOf('bid'), iA=cab.indexOf('ask');
  const m=new Map();
  for(let n=1;n<lin.length;n++){ const c=lin[n].split(','); if(c.length<cab.length) continue;
    const bid=+c[iB], ask=+c[iA]; if(!(ask>0)||ask<bid) continue; m.set(+c[iK],{bid,ask,mid:(bid+ask)/2}); }
  return m;
}

const perd=o.filter(x=>x.ST<x.K);   // las que acaban dentro del dinero = las que te asignan
console.log('=== 1. EL HUECO DEL LUNES (lo que NO habia modelado) ===\n');
console.log(`  semanas en que te asignan: ${perd.length} de ${o.length}  (${Math.round(perd.length/o.length*100)}%)\n`);
let dif=0, n=0, peor=null;
const detalle=[];
for(const x of perd){
  const i=iOf.get(x.exp); if(i==null||i+1>=oc.length) continue;
  const lun=oc[i+1];                       // siguiente sesion = el lunes
  const d=(lun.o-x.ST)*100;                // vender en la apertura del lunes vs el cierre del viernes
  dif+=d; n++; detalle.push({...x, lunes:lun.d, apertura:lun.o, delta:d});
  if(!peor||d<peor.delta) peor={...x,lunes:lun.d,apertura:lun.o,delta:d};
}
console.log(`  vender el LUNES en la apertura en vez del viernes al cierre:`);
console.log(`     media por asignacion : ${dif/n>=0?'+':''}$${(dif/n).toFixed(0)}`);
console.log(`     total en 6,6 años    : ${dif>=0?'+':''}$${dif.toFixed(0)}`);
console.log(`     el peor lunes        : ${peor.exp} cerro ${peor.ST.toFixed(2)}, el lunes ${peor.lunes} abrio ${peor.apertura.toFixed(2)}  ->  $${peor.delta.toFixed(0)}`);
console.log('');
console.log('  las 5 asignaciones donde el lunes fue peor:');
[...detalle].sort((a,b)=>a.delta-b.delta).slice(0,5).forEach(x=>
  console.log(`     ${x.exp} cierre ${x.ST.toFixed(2)} -> lunes ${x.apertura.toFixed(2)}   ${x.delta>=0?'+':''}$${x.delta.toFixed(0)}`));
console.log('  las 5 donde el lunes fue mejor:');
[...detalle].sort((a,b)=>b.delta-a.delta).slice(0,5).forEach(x=>
  console.log(`     ${x.exp} cierre ${x.ST.toFixed(2)} -> lunes ${x.apertura.toFixed(2)}   +$${x.delta.toFixed(0)}`));

// rehacer el resultado entero suponiendo que vendes el lunes en la apertura
let eq=1,pico=1,dd=0;
for(const x of o){
  let ret=x.ret;
  if(x.ST<x.K){ const i=iOf.get(x.exp); if(i!=null&&i+1<oc.length) ret += (oc[i+1].o-x.ST)*100/(x.K*100); }
  eq*=(1+ret); pico=Math.max(pico,eq); dd=Math.max(dd,1-eq/pico);
}
const años=(new Date(o[o.length-1].exp)-new Date(o[0].rolo))/365/864e5;
console.log(`\n  RESULTADO REHECHO vendiendo el lunes: ${((eq**(1/años)-1)*100).toFixed(1)}%/año, caida ${(dd*100).toFixed(0)}%`);
console.log(`  (el que te di anoche, liquidando el viernes: 11,3%/año, caida 14%)`);

console.log('\n=== LA ALTERNATIVA: recomprar la put el viernes y no dejar que te asignen ===\n');
let eq2=1,pico2=1,dd2=0, nRec=0, coste=0;
for(const x of o){
  let ret=x.ret;
  if(x.ST<x.K){
    const c=leerVenc(x.exp)?.get(x.K);
    if(c){ // recompras al ASK real del viernes en vez de aceptar la asignacion
      const real=(x.prima - c.ask)*100 - 0.06;
      const modelado=x.ret*x.K*100 - (x.prima*100 - Math.max(x.K-x.ST,0)*100);  // parte de intereses+com
      ret=(real + modelado)/(x.K*100); nRec++; coste += (c.ask - Math.max(x.K-x.ST,0))*100;
    }
  }
  eq2*=(1+ret); pico2=Math.max(pico2,eq2); dd2=Math.max(dd2,1-eq2/pico2);
}
console.log(`  recompras valoradas con cotizacion real: ${nRec} de ${perd.length}`);
console.log(`  lo que cuesta recomprar POR ENCIMA del valor intrinseco: $${(coste/nRec).toFixed(0)} de media por vez`);
console.log(`  RESULTADO: ${((eq2**(1/años)-1)*100).toFixed(1)}%/año, caida ${(dd2*100).toFixed(0)}%`);

console.log('\n=== 2 y 3. QUE SUPUSE EXACTAMENTE ===');
console.log(`  entrada: viernes, con la cotizacion de CIERRE`);
console.log(`  plazo  : ${Math.round(o.reduce((s,x)=>s+(new Date(x.exp)-new Date(x.rolo))/864e5,0)/o.length)} dias naturales (viernes a viernes)`);
console.log(`  strike : el listado mas cercano a un 3% por debajo del cierre del viernes`);
console.log(`  distancia real conseguida, mediana: ${(o.map(x=>(x.S0-x.K)/x.S0).sort((a,b)=>a-b)[Math.floor(o.length/2)]*100).toFixed(2)}%`);
