import {M,BASE,med41,calibra,fila,UNI,restaura} from './vf-base.mjs';
// TEST JUSTO: en CADA ventana se recalibra tamBase para igualar la exposición de la plana
// DENTRO de esa misma ventana. Si no, se compara una cartera mas grande contra otra mas chica.
const quita=(anos)=>{restaura(); for(const o of M.OPS) if(anos.includes(o.dC.slice(0,4))) o.ma=999;};
const par=(et,cfgBase)=>{const b=med41(cfgBase);
  const out=[['plana',b,null]];
  for(const k of [1,2,3]){const tam=calibra({...cfgBase,kv:k},b.inv); out.push([`k=${k}`,med41({...cfgBase,kv:k,tam}),tam]);}
  console.log(`--- ${et} ---`);
  for(const [n,r,t] of out) fila(`  ${n}${t?` tb ${(t*100).toFixed(3)}%`:''}`,r);
  const mej=out.slice(1).map(o=>o[1].dol/b.dol);
  console.log(`  ratio $/plana: k1 ${mej[0].toFixed(2)}  k2 ${mej[1].toFixed(2)}  k3 ${mej[2].toFixed(2)}`);};
console.log(`═══ ${UNI} — recalibrado DENTRO de cada ventana ═══`);
restaura(); par('TODO',BASE);
for(const A of [['2020'],['2025'],['2020','2025']]){ quita(A); par(`sin ${A.join('+')}`,BASE); }
restaura();
for(const [d,h,et] of [['20160101','20210630','1a mitad'],['20210630','20261231','2a mitad'],
                        ['20160101','20191231','16-19'],['20200101','20221231','20-22'],['20230101','20261231','23-26']])
  par(et,{...BASE,desdeD:d,hasta:h});
