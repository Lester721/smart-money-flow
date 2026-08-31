// La escalera del contrato (5/10/15/20/25 % dentro del dinero) con la regla actual intacta
// en todo lo demas, medida en TODAS las ventanas de control. Cifras absolutas.
import { writeFileSync } from 'node:fs';
import { marcar, correr, correrVent, UNI, PROF, OPS } from './uc-lab.mjs';
const CF = { tam:0.024, huecos:10, modo:'spy', plazo:120, castigo:0.0138, suelo:0.50, costeMin:0 };
const VENT = [['TODO',null,null,null],['sin2020',['2020'],null,null],['sin2025',['2025'],null,null],
  ['sin2020y2025',['2020','2025'],null,null],['2016-19',null,'20160101','20191231'],
  ['2020-22',null,'20200101','20221231'],['2021-24',null,'20210101','20241231'],
  ['2023-26',null,'20230101','20261231'],['1a mitad',null,'20160101','20210430'],['2a mitad',null,'20210501','20261231']];
const R = {};
for (const [nv,fuera,d0,d1] of VENT) { marcar({ hoyo:-0.07, anosFuera:fuera });
  R[nv] = d0 ? correrVent(CF,d0,d1) : correr(CF); }
// coste mediano del contrato elegible (para explicar de donde salen las operaciones extra)
marcar({ hoyo:-0.07 });
const C = OPS.filter(o=>o.ma<0).map(o=>o.coste).sort((a,b)=>a-b);
R._coste = { n:C.length, mediana:C[Math.floor(C.length/2)], p10:C[Math.floor(C.length*0.1)] };
writeFileSync(`uc-esc-${UNI}-p${PROF}.json`, JSON.stringify(R));
console.log(`${UNI} p${PROF}: TODO $${Math.round(R.TODO.dol)} Sh ${R.TODO.sharpe.toFixed(3)} cai ${R.TODO.caida.toFixed(1)} ops ${Math.round(R.TODO.ops)} may ${R.TODO.mayor.toFixed(1)}%  · coste mediano $${Math.round(R._coste.mediana)} (n=${R._coste.n})`);
