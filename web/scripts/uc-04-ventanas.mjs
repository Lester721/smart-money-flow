// La bateria de controles: quitar anos de ENTRADA (2020, 2025, los dos) y ventanas de
// CALENDARIO. Es el examen que tumbo a la via del contrato barato en la verificacion 4.
import { readFileSync, writeFileSync } from 'node:fs';
import { M, marcar, correr, correrVent, UNI, PROF } from './uc-lab.mjs';
const COMBO = JSON.parse(readFileSync(`uc-combo-${UNI}-p${PROF}.json`, 'utf8'));
const LISTA = ['h7_H10','h7_H10_spy','h7_H10_prof','h7_H10_spy_prof','h5_H10','h5_H10_spy',
               'h5_H10_spy_prof','h7_H13_spy','h7_H13_spy_prof','h5_H13_spy_prof'];
const VENT = [
  ['TODO',        null, null, null],
  ['sin2020',     ['2020'], null, null],
  ['sin2025',     ['2025'], null, null],
  ['sin2020y2025',['2020','2025'], null, null],
  ['cal 2016-19', null, '20160101', '20191231'],
  ['cal 2020-22', null, '20200101', '20221231'],
  ['cal 2021-24', null, '20210101', '20241231'],
  ['cal 2023-26', null, '20230101', '20261231'],
  ['1a mitad',    null, '20160101', '20210430'],
  ['2a mitad',    null, '20210501', '20261231'],
];
const R = {};
for (const k of LISTA) {
  const cfg = COMBO[k].cfg; const hoyo = k.startsWith('h5') ? -0.05 : -0.07;
  R[k] = {};
  for (const [nv, fuera, d0, d1] of VENT) {
    marcar({ hoyo, anosFuera: fuera });
    R[k][nv] = (d0 ? correrVent(cfg, d0, d1) : correr(cfg));
  } }
writeFileSync(`uc-vent-${UNI}-p${PROF}.json`, JSON.stringify(R));
console.log(`escrito uc-vent-${UNI}-p${PROF}.json`);
