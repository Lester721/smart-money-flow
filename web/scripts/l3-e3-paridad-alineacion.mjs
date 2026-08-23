// ¿El underlying_price de la fila está alineado con ESA barra? Paridad put-call.
// F = K + C - P  (0DTE, tipos ~0). Comparo F con el spot de la barra i-1, i, i+1.
import { diasDisponibles, cargarDia, rejilla } from "./lib0dte.mjs";
const dias = diasDisponibles();
const muestra = [dias[0], dias[200], dias[500], dias[800], dias[1122]];
const err = {"-1":[], "0":[], "1":[]};
for (const dia of muestra) {
  const d = cargarDia(dia);
  for (let i=1;i<d.barras.length-1;i++){
    const b=d.barras[i], K=rejilla(b.spot);
    const c=b.o.get(K+"C"), p=b.o.get(K+"P");
    if(!c||!p) continue;
    const F = K + (c[0]+c[1])/2 - (p[0]+p[1])/2;
    for (const k of ["-1","0","1"]) err[k].push(F - d.barras[i+ +k].spot);
  }
}
for (const k of ["-1","0","1"]){
  const v=err[k], m=v.reduce((a,b)=>a+b,0)/v.length;
  const ab=v.map(Math.abs).sort((a,b)=>a-b);
  console.log(`spot de la barra i${k==="0"?"":(k>0?"+"+k:k)}: n=${v.length} sesgo medio ${m.toFixed(3)} pts · |error| mediana ${ab[Math.floor(ab.length/2)].toFixed(3)} · p90 ${ab[Math.floor(0.9*ab.length)].toFixed(3)}`);
}
