import {M,BASE,med41,calibra,conc,fila,UNI,CAP,restaura} from './vf-base.mjs';
const b=med41(BASE);
const tam2=calibra({...BASE,kv:2},b.inv), tam3=calibra({...BASE,kv:3},b.inv);
const K2={...BASE,kv:2,tam:tam2}, K3={...BASE,kv:3,tam:tam3};
console.log(`═══ ${UNI} ═══ tamBase k2 ${(tam2*100).toFixed(3)}%  k3 ${(tam3*100).toFixed(3)}%`);
fila('TODO  plana',b); fila('TODO  k=2',med41(K2)); fila('TODO  k=3',med41(K3));

const quita=(anos)=>{restaura(); for(const o of M.OPS) if(anos.includes(o.dC.slice(0,4))) o.ma=999;};
for(const A of [['2020'],['2025'],['2020','2025'],['2020','2021']]){
  quita(A);
  console.log(`--- sin ${A.join('+')} (señales de esos años eliminadas) ---`);
  fila('  plana',med41(BASE)); fila('  k=2',med41(K2)); fila('  k=3',med41(K3)); }
restaura();
console.log('--- mitades del periodo ---');
for(const [d,h,et] of [['20160101','20210630','1a mitad'],['20210630','20261231','2a mitad'],
                        ['20160101','20191231','16-19'],['20200101','20221231','20-22'],['20230101','20261231','23-26']]){
  fila(`${et} plana`,med41({...BASE,desdeD:d,hasta:h}));
  fila(`${et} k=2  `,med41({...K2,desdeD:d,hasta:h}));
  fila(`${et} k=3  `,med41({...K3,desdeD:d,hasta:h})); }
