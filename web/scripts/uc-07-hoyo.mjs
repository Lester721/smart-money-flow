// El dial del HOYO (cuanto por debajo de la MA50 tiene que estar la accion) con vecinas
// y la bateria de ventanas, sobre el contrato barato y sobre el actual.
import { writeFileSync } from 'node:fs';
import { marcar, correr, correrVent, UNI, PROF } from './uc-lab.mjs';
const CF = { tam:0.024, huecos:10, modo:'spy', plazo:120, castigo:0.0138, suelo:0.50, costeMin:0 };
const VENT = [['TODO',null,null,null],['sin2020',['2020'],null,null],['sin2025',['2025'],null,null],
  ['sin2020y2025',['2020','2025'],null,null],['2016-19',null,'20160101','20191231'],
  ['2020-22',null,'20200101','20221231'],['2021-24',null,'20210101','20241231'],
  ['2023-26',null,'20230101','20261231'],['1a mitad',null,'20160101','20210430'],['2a mitad',null,'20210501','20261231']];
const R = {};
for (const hoyo of [-0.04,-0.05,-0.06,-0.07,-0.08,-0.09,-0.10]) { const k = 'h'+(hoyo*-100).toFixed(0); R[k]={};
  for (const [nv,fuera,d0,d1] of VENT) { marcar({ hoyo, anosFuera:fuera });
    R[k][nv] = d0 ? correrVent(CF,d0,d1) : correr(CF); } }
writeFileSync(`uc-hoyo-${UNI}-p${PROF}.json`, JSON.stringify(R));
console.log(`${UNI} p${PROF}`, Object.entries(R).map(([k,v])=>`${k}:$${Math.round(v.TODO.dol/1000)}k/${Math.round(v.TODO.ops)}`).join('  '));
