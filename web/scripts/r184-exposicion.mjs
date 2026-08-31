// ══ LA EXPOSICIÓN — el dial que nunca toqué ══ Lester: «NO LIMITES LO QUE PODEMOS COMPRAR POR
// EL EFECTIVO ACTUAL» y «nunca colocaría el 100% de la cuenta en una posición».
//
// Todo lo de hoy corre al 24% del patrimonio (2 huecos × 12%), heredado de la regla congelada.
// Con contratos de ~$3.190 eso son 4 posiciones como mucho — y con 4 posiciones manda el azar.
// Con más exposición caben más posiciones a la vez, y sólo entonces se puede saber si la señal
// vale algo o no.
//
// ⚠️ Se comprueba la ESTABILIDAD, no el máximo: cada configuración se corre en tres umbrales
//    contiguos (−6%, −7%, −8%). Si los tres no se parecen, la casilla es lotería y se marca.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const CAP=60000, CAST=0.0138;
const P=JSON.parse(readFileSync(join(CACHE,"precios-A.json"),"utf8"));
const PX={},IDX={},SPLIT={};
for(const tk of Object.keys(P)){const D=Object.keys(P[tk]).sort();
 PX[tk]=D.map(d=>P[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
 const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);}
 SPLIT[tk]=S;}
function ma50(tk,d){const i=IDX[tk]?.get(d);if(i==null||i<50)return null;
 for(let j=i-49;j<=i;j++)if(SPLIT[tk].has(j))return null;
 let s=0;for(let j=i-50;j<i;j++)s+=PX[tk][j];return PX[tk][i]/(s/50)-1;}
process.env.CAMINOS="sincosteA-p25-d400.json";
const M=await import("./motor-cartera.mjs");
const V=M.OPS.map(o=>ma50(o.tk,o.dC));
const poner=(u)=>{for(let i=0;i<M.OPS.length;i++){const v=V[i];M.OPS[i].ma=(v!=null&&v<u&&v>=-0.30)?v:999;}};
const banda=(u,h,expo)=>{poner(u); const F=[],S=[],C=[],O=[],I=[];
  for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
    const q=M.simular({tam:expo/h,huecos:h,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0,capital:cap});
    F.push(q.final-cap);S.push(q.sharpe);C.push(q.caida);O.push(q.ops);I.push(q.invertido);}
  return {d:M.med(F)/M.ANOS,s:M.med(S),c:M.med(C),o:M.med(O),i:M.med(I)};};
const SPY=M.spyApalancado(1);
console.log("");
console.log("  ══ EXPOSICIÓN × HUECOS · grupo A · media 50 ══");
console.log("  cada casilla: la MEDIANA de correr −6%, −7% y −8%, y entre paréntesis cuánto");
console.log("  se separan el mejor y el peor de los tres. Separación grande = lotería.");
console.log("");
console.log("  " + "expo".padEnd(8) + [4,6,8,10,14,20].map(h=>(h+" huecos").padStart(17)).join(""));
for (const expo of [0.24, 0.36, 0.48, 0.60, 0.75]) {
  const fila=[];
  for (const h of [4,6,8,10,14,20]) {
    const R=[-0.06,-0.07,-0.08].map(u=>banda(u,h,expo));
    const D=R.map(r=>r.d).sort((a,b)=>a-b);
    const disp = D[2]>0 ? (D[2]-D[0])/Math.abs(D[1]) : 9;
    fila.push({med:D[1], disp, s:R[1].s, c:R[1].c, o:R[1].o, i:R[1].i}); }
  console.log("  " + ((100*expo).toFixed(0)+"%").padEnd(8) +
    fila.map(x=>("$"+Math.round(x.med/1000)+"k ("+(100*x.disp).toFixed(0)+"%)").padStart(17)).join(""));
  console.log("  " + "".padEnd(8) + fila.map(x=>("Sh "+x.s.toFixed(2)+" "+Math.round(x.o)+"op").padStart(17)).join("")); }
console.log("");
console.log("  comprar SPY y dormir: $"+Math.round((SPY.final-CAP)/M.ANOS).toLocaleString("en-US")+
  "/año · Sharpe "+SPY.sharpe.toFixed(2)+" · caída −"+SPY.caida.toFixed(0)+"%");
console.log("");
