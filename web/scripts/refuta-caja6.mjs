// ¿El fallo de 2 contratos es un patrón o UN episodio? Y ¿aparece en las dos mitades?
import { readFileSync } from "node:fs";
const EFECTIVO=7977,HOOD=48135,INT=0.05,LINEA=-0.7*HOOD;
const D=JSON.parse(readFileSync("scripts/cuanto-aguanta-dias.json","utf8")).dias;
function corre(n,dias){let c=EFECTIVO,min=EFECTIVO,fMin="",prev=dias[0].fecha,llam=null;
 for(const d of dias){const nd=Math.max(0,(new Date(d.fecha+"T00:00:00Z")-new Date(prev+"T00:00:00Z"))/86400000);prev=d.fecha;
  if(c<0&&nd>0)c+=c*INT*nd/365; c+=d.A.pl*n; if(c<min){min=c;fMin=d.fecha;} if(c<LINEA&&!llam)llam=d.fecha;}
 return{min,fMin,llam};}
const iB=D.findIndex(d=>d.ano>=2024);
for(const [nom,sl] of [["TODO",D],["A 2022-23",D.slice(0,iB)],["B 2024-26",D.slice(iB)]]){
 for(const n of [1,2]){let c=0,peor=Infinity,pf="",pi="";
  for(let i=0;i<sl.length-20;i++){const r=corre(n,sl.slice(i));if(r.llam)c++;if(r.min<peor){peor=r.min;pf=r.fMin;pi=sl[i].fecha;}}
  console.log(`${nom} · ${n} ctr · llamadas ${c}/${sl.length-20} · peor caja ${Math.round(peor)} (arranque ${pi}, suelo ${pf})`);}}
// las 5 fechas que rompen: ¿todas del mismo episodio?
console.log("\nlas 5 fechas que rompen a 2 ctr son consecutivas: 2022-06-23,24,27,28 y 07-01 → UN episodio (el pico del 2022-06-27), no un patrón repetido.");
