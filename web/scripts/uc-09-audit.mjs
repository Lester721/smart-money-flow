// ¿Por que los caminos del contrato barato son mas cortos? Si acaban por el SUELO de 0,50x
// es la estrategia; si acaban sin motivo es el fichero truncado — un fallo silencioso.
import { marcar, UNI, PROF, OPS } from './uc-lab.mjs';
marcar({ hoyo:-0.07 });
const E = OPS.filter(o=>o.ma<0);
let cortos=0, porSuelo=0, sinMotivo=0; const L=[];
for (const o of E) { const n=o.camino.length; L.push(n);
  if (n < 120) { cortos++; const m=o.camino[n-1][1]; if (m<=0.505) porSuelo++; else sinMotivo++; } }
L.sort((a,b)=>a-b);
console.log(`${UNI} p${PROF}: elegibles ${E.length} · largo camino p10=${L[Math.floor(L.length*.1)]} med=${L[Math.floor(L.length/2)]} p90=${L[Math.floor(L.length*.9)]} max=${L[L.length-1]}`);
console.log(`   caminos < 120 sesiones: ${cortos} (${(100*cortos/E.length).toFixed(1)}%) · de ellos por SUELO 0,50x: ${porSuelo} · SIN MOTIVO (fichero corto): ${sinMotivo} (${(100*sinMotivo/E.length).toFixed(2)}%)`);
