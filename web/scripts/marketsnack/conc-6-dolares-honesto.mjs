// CONCENTRACION · LOS DOLARES, CON SU RUIDO AL LADO.
//
// conc-5 escupio un numero que parece bueno y NO se puede reportar tal cual:
//     "1 cono al dia del tercio alto -> +30,0% por operacion -> +$89.236/ano"
// Ese numero elige, con retrovisor, UNA operacion por dia entre las del tercio alto. Con pagos que
// van de -100% a +756%, la media de 50 sorteos asi tiene un ruido enorme. Aqui se le pone el error
// estandar, se compara contra el reparto equitativo del mismo dia -que es el control correcto- y
// se dice cuantos periodos independientes hay de verdad.

import fs from "node:fs"; import path from "node:path";
import { listonT } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const RAIZ = path.join("scripts", "cache-theta", "marketsnack");
const conos = JSON.parse(fs.readFileSync(path.join(RAIZ, "conc-5-conos.json"), "utf8"));
const CUENTA = 56389, LISTON = listonT(96);

const media = (v)=>(v.length?v.reduce((a,x)=>a+x,0)/v.length:NaN);
const sd = (v)=>{if(v.length<2)return NaN;const m=media(v);return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1));};
const tUna = (v)=>(v.length>2?media(v)/(sd(v)/Math.sqrt(v.length)):NaN);

radiografia(conos, ["ret","prima","rangoSenal","movSigma"], "conos reales", { cerosLegitimos: [] });

console.log("=".repeat(100));
console.log("EL +30% CON SU ERROR ESTANDAR AL LADO");
console.log("=".repeat(100));
const porDia = new Map();
for (const c of conos) { const g = porDia.get(c.fecha) ?? []; g.push(c); porDia.set(c.fecha, g); }

const elegido = [], todosDia = [], difDia = [];
for (const [d, g] of [...porDia].sort()) {
  const alto = g.filter(c=>c.rangoSenal>=2/3);
  if (!alto.length) continue;
  const e = [...alto].sort((a,b)=>b.rangoSenal-a.rangoSenal)[0];
  elegido.push(e.ret);
  todosDia.push(media(g.map(c=>c.ret)));                 // control: reparto equitativo del MISMO dia
  difDia.push(media(alto.map(c=>c.ret)) - media(g.map(c=>c.ret)));
}
const linea = (n, v) => console.log(`  ${n.padEnd(38)} n=${String(v.length).padStart(3)}  media ${(100*media(v)).toFixed(1).padStart(7)}%  sd ${(100*sd(v)).toFixed(0).padStart(4)}%  EE ${(100*sd(v)/Math.sqrt(v.length)).toFixed(1).padStart(6)}%  t=${tUna(v).toFixed(2)}`);
linea("1 cono/dia, el mas alto (retrovisor)", elegido);
linea("todos los conos del dia (control)", todosDia);
linea("tercio ALTO menos todos, mismo dia", difDia);

console.log(`\n  liston |t| >= ${LISTON}. El +30% tiene un error estandar de +-${(100*sd(elegido)/Math.sqrt(elegido.length)).toFixed(0)} puntos:`);
console.log(`  el intervalo va de ${(100*(media(elegido)-2*sd(elegido)/Math.sqrt(elegido.length))).toFixed(0)}% a ${(100*(media(elegido)+2*sd(elegido)/Math.sqrt(elegido.length))).toFixed(0)}%. En dolares al ano, de $${(252*1182*(media(elegido)-2*sd(elegido)/Math.sqrt(elegido.length))).toFixed(0)} a $${(252*1182*(media(elegido)+2*sd(elegido)/Math.sqrt(elegido.length))).toFixed(0)}.`);
console.log(`  Un intervalo que cruza el cero de lado a lado no es un resultado: es no saber.`);

// de que sale el +30%: cuantas operaciones lo sostienen
const o = [...elegido].sort((a,b)=>b-a);
console.log(`\n  de donde sale la media de ${(100*media(elegido)).toFixed(1)}%:`);
console.log(`    la MEJOR operacion sola aporta ${(100*o[0]/elegido.length).toFixed(1)} puntos de los ${(100*media(elegido)).toFixed(1)}`);
console.log(`    las 3 mejores aportan ${(100*(o[0]+o[1]+o[2])/elegido.length).toFixed(1)} puntos`);
console.log(`    sin la mejor operacion, la media queda en ${(100*media(o.slice(1))).toFixed(1)}%`);
console.log(`    sin las 3 mejores,      la media queda en ${(100*media(o.slice(3))).toFixed(1)}%`);
console.log(`    operaciones que expiran sin valor: ${elegido.filter(x=>x<=-0.999).length} de ${elegido.length}`);

console.log(`\n  n EFECTIVA en dolares: ${elegido.length} entradas, cada cono vive ~30 dias naturales (~21 habiles).`);
console.log(`  Periodos que NO se solapan: ${Math.max(1, Math.round(elegido.length/21))}. Con ${Math.max(1, Math.round(elegido.length/21))} periodos no se establece nada.`);
console.log(`  Y ademas TODAS las entradas caen antes del 2026-07-16: las cadenas paran el 08-06 y un cono`);
console.log(`  a 30 dias comprado despues del 07-07 no llega a vencer. El tramo "despues" no existe aqui.`);
