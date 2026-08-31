// Segunda ronda: sobre el contrato barato, la curva FINA de huecos con sus vecinas,
// el freno de mercado, y la modulacion por SPY. Todo con la bateria de ventanas.
import { writeFileSync } from 'node:fs';
import { marcar, correr, correrVent, UNI, PROF } from './uc-lab.mjs';
const EXP = 0.24;
const B0 = { modo:'spy', plazo:120, castigo:0.0138, suelo:0.50, costeMin:0 };
const CFG = {};
for (const h of [10,11,12,13,14,15,16]) CFG[`H${h}`] = { ...B0, huecos:h, tam:EXP/h };
for (const h of [11,12,13,14]) CFG[`H${h}_spy`] = { ...B0, huecos:h, tam:EXP/h, kBajo:1.15, kAlto:0.90 };
CFG['H10_freno']  = { ...B0, huecos:10, tam:0.024, frenoSPY:0.12, reentrada:0.05 };
CFG['H12_freno']  = { ...B0, huecos:12, tam:EXP/12, frenoSPY:0.12, reentrada:0.05 };
CFG['H13_freno']  = { ...B0, huecos:13, tam:EXP/13, frenoSPY:0.12, reentrada:0.05 };
CFG['H12_pt2']    = { ...B0, huecos:12, tam:EXP/12, porTicker:2, sepDias:15 };
CFG['H13_pt2']    = { ...B0, huecos:13, tam:EXP/13, porTicker:2, sepDias:15 };
const VENT = [['TODO',null,null,null],['sin2020',['2020'],null,null],['sin2025',['2025'],null,null],
  ['sin2020y2025',['2020','2025'],null,null],['2016-19',null,'20160101','20191231'],
  ['2020-22',null,'20200101','20221231'],['2021-24',null,'20210101','20241231'],
  ['2023-26',null,'20230101','20261231'],['1a mitad',null,'20160101','20210430'],['2a mitad',null,'20210501','20261231']];
const R = {};
for (const [k,cfg] of Object.entries(CFG)) { R[k]={};
  for (const [nv,fuera,d0,d1] of VENT) { marcar({ hoyo:-0.07, anosFuera:fuera });
    R[k][nv] = d0 ? correrVent(cfg,d0,d1) : correr(cfg); } }
writeFileSync(`uc-huec-${UNI}-p${PROF}.json`, JSON.stringify(R));
console.log(`escrito uc-huec-${UNI}-p${PROF}.json`);
