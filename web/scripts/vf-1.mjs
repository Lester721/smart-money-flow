import {M,BASE,med41,calibra,conc,fila,UNI,CAP} from './vf-base.mjs';
const t0=Date.now();
console.log(`═══ ${UNI} ═══  ops totales en fichero: ${M.OPS.length}  elegibles: ${M.OPS.filter(o=>o.ma<0).length}`);
const b=med41(BASE); fila('PLANA 2,4%',b,conc(BASE));
console.log('t=',((Date.now()-t0)/1000).toFixed(0),'s');
for(const k of [1,1.5,2,2.5,3]){
  const tam=calibra({...BASE,kv:k},b.inv);
  const cfg={...BASE,kv:k,tam};
  fila(`k=${k} tamBase ${(tam*100).toFixed(3)}%`,med41(cfg),conc(cfg));
  console.log('  t=',((Date.now()-t0)/1000).toFixed(0),'s');
}
