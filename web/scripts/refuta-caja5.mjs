import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
console.log("listonT(90) =", listonT(90).toFixed(2), " listonT(36) =", listonT(36).toFixed(2));
const EFECTIVO=7977,HOOD=48135,BP0=73874,INT=0.05,LINEA=-0.7*HOOD;
const D=JSON.parse(readFileSync("scripts/cuanto-aguanta-dias.json","utf8")).dias;
function corre(n,dias){let c=EFECTIVO,min=EFECTIVO,fMin="",prev=dias[0].fecha,llam=null,rojo=0,interes=0;
 for(const d of dias){const nd=Math.max(0,(new Date(d.fecha+"T00:00:00Z")-new Date(prev+"T00:00:00Z"))/86400000);prev=d.fecha;
  if(c<0&&nd>0){const i=c*INT*nd/365;interes+=i;c+=i;} c+=d.A.pl*n;
  if(c<min){min=c;fMin=d.fecha;} if(c<0)rojo++; if(c<LINEA&&!llam)llam=d.fecha;}
 return{min,fMin,llam,rojo,interes,final:c};}
const rotos=[];
for(let i=0;i<D.length-20;i++){const r=corre(2,D.slice(i)); if(r.llam) rotos.push(`${D[i].fecha} → llamada ${r.llam} (caja ${Math.round(r.min)}, ${r.rojo} d. rojo, int. ${Math.round(r.interes)})`);}
console.log("\nARRANQUES QUE ROMPEN con 2 contratos del cóndor, HOOD fijo, mant. 30%:");
rotos.forEach(x=>console.log("  "+x));
// cuantos arranques dejan la caja bajo -5000 / -10000  (1 contrato)
const mins=[];for(let i=0;i<D.length-20;i++)mins.push(corre(1,D.slice(i)).min);
console.log(`\n1 contrato · arranques con caja bajo −$5.000: ${mins.filter(x=>x<-5000).length}/1049 · bajo −$10.000: ${mins.filter(x=>x<-10000).length}/1049 · caja negativa alguna vez: ${mins.filter(x=>x<0).length}/1049`);
const mins2=[];for(let i=0;i<D.length-20;i++)mins2.push(corre(2,D.slice(i)).min);
console.log(`2 contratos · arranques con caja bajo −$10.000: ${mins2.filter(x=>x<-10000).length}/1049 · bajo −$20.000: ${mins2.filter(x=>x<-20000).length}/1049 · negativa alguna vez: ${mins2.filter(x=>x<0).length}/1049`);
// ventana de la caida maxima
let pico=-Infinity,fp="",dd=0,fdd="",acc=0,mejorP="";
for(const d of D){acc+=d.A.pl; if(acc>pico){pico=acc;fp=d.fecha;} if(pico-acc>dd){dd=pico-acc;fdd=d.fecha;mejorP=fp;}}
console.log(`\ncaída máxima del cóndor (1 ctr): ${Math.round(dd)} desde el pico del ${mejorP} hasta el ${fdd}`);
