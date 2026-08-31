import { M, marcar, correr, fila, UNI, PROF, OPS } from './uc-lab.mjs';
const t0 = Date.now();
console.log(`== UNI=${UNI} PROF=${PROF} · ops en fichero: ${OPS.length} · anos ${M.ANOS.toFixed(2)}`);
const n = marcar({ hoyo: -0.07 });
console.log('elegibles con hoyo -7%:', n);
const CF = { tam:0.024, huecos:10, modo:'spy', plazo:120, castigo:0.0138, suelo:0.50, costeMin:0 };
console.log(fila('REGLA ACTUAL', correr(CF)));
console.log('segundos:', ((Date.now()-t0)/1000).toFixed(1));
