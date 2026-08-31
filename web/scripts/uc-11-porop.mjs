// A nivel de OPERACION (sin cartera: inmune al tamano y al camino de la cuenta).
// Salida exacta: plazo 120 sesiones con suelo 0,50x, y el castigo del 1,38%.
import { marcar, UNI, PROF, OPS } from './uc-lab.mjs';
const c = 0.0138, kM = (1-c/2)/(1+c/2);
marcar({ hoyo:-0.07 });
const E = OPS.filter(o=>o.ma<0);
function salida(o){ let iFin = Math.min(119, o.camino.length-1);
  for (let j=0;j<=iFin;j++) if (o.camino[j][1] <= 0.50) { iFin=j; break; }
  return o.camino[iFin][1]*kM; }
const todas = E.map(o=>({tk:o.tk,dC:o.dC,m:salida(o)}));
// muestra INDEPENDIENTE: una entrada por ticker cada 180 sesiones naturales
const ult = new Map(), ind = [];
for (const x of todas.slice().sort((a,b)=>a.dC.localeCompare(b.dC))) {
  const t = Date.parse(x.dC.slice(0,4)+'-'+x.dC.slice(4,6)+'-'+x.dC.slice(6,8));
  if (ult.has(x.tk) && t-ult.get(x.tk) < 180*86400000) continue; ult.set(x.tk,t); ind.push(x); }
const st = (A) => { const m=A.reduce((a,x)=>a+x.m,0)/A.length;
  const sd=Math.sqrt(A.reduce((a,x)=>a+(x.m-m)**2,0)/(A.length-1));
  return { n:A.length, media:m, acierto:100*A.filter(x=>x.m>1).length/A.length, sd, t:(m-1)/(sd/Math.sqrt(A.length)) }; };
const a=st(todas), b=st(ind);
console.log(`${UNI} p${PROF}  TODAS n=${a.n} media ${a.media.toFixed(3)} acierto ${a.acierto.toFixed(1)}% sd ${a.sd.toFixed(2)} | INDEP n=${b.n} media ${b.media.toFixed(3)} acierto ${b.acierto.toFixed(1)}% t=${b.t.toFixed(2)}`);
