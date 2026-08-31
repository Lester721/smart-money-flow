// ¿El contrato barato gana por elegir mejor o solo por invertir mas? Se baja su `tam`
// hasta que su exposicion media iguala la de la regla actual, y se vuelve a medir todo.
import { writeFileSync } from 'node:fs';
import { M, marcar, correr, correrVent, UNI, PROF } from './uc-lab.mjs';
const CF = { tam:0.024, huecos:10, modo:'spy', plazo:120, castigo:0.0138, suelo:0.50, costeMin:0 };
const REF = { AB: 18.87, '27': 14.41 };           // invertido% de la REGLA ACTUAL (p25), medido
const inv = (c) => M.simular({ ...c, capital:60000 }).invertido;
marcar({ hoyo:-0.07 });
let lo=0.004, hi=0.024;
for (let k=0;k<20;k++){ const mid=(lo+hi)/2; if (inv({...CF,tam:mid}) < REF[UNI]) lo=mid; else hi=mid; }
const tamIg = (lo+hi)/2;
const CFI = { ...CF, tam: tamIg };
const VENT = [['TODO',null,null,null],['sin2020',['2020'],null,null],['sin2025',['2025'],null,null],
  ['sin2020y2025',['2020','2025'],null,null],['2016-19',null,'20160101','20191231'],
  ['2020-22',null,'20200101','20221231'],['2021-24',null,'20210101','20241231'],
  ['2023-26',null,'20230101','20261231'],['1a mitad',null,'20160101','20210430'],['2a mitad',null,'20210501','20261231']];
const R = { tam: tamIg, inv: inv(CFI) };
for (const [nv,fuera,d0,d1] of VENT) { marcar({ hoyo:-0.07, anosFuera:fuera });
  R[nv] = d0 ? correrVent(CFI,d0,d1) : correr(CFI); }
writeFileSync(`uc-expo-${UNI}-p${PROF}.json`, JSON.stringify(R));
console.log(`${UNI} p${PROF} · tam igualado ${(tamIg*100).toFixed(3)}% (inv ${R.inv.toFixed(2)}% contra ref ${REF[UNI]}) -> $${Math.round(R.TODO.dol).toLocaleString('en-US')}/ano  Sh ${R.TODO.sharpe.toFixed(3)}  cai ${R.TODO.caida.toFixed(1)}  ops ${Math.round(R.TODO.ops)}  may ${R.TODO.mayor.toFixed(1)}%`);
