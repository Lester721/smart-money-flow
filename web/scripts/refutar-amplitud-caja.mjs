// REFUTACION - la pregunta que decide si Lester puede operarlo: el EFECTIVO.
// La caida maxima se mide desde el pico. La cuenta arranca en $7.977 y no en un pico. Si el mal
// tramo hubiera llegado antes, no habria cuenta. Se remuestrea el ORDEN de los dias por bloques.
import { readFileSync } from "node:fs";

const CUENTA=56389, EFECTIVO=7977, PODER=73874, COLATERAL=5000;
const eur=(x)=>(x==null||!Number.isFinite(x)?"—":(x<0?"−":"")+"$"+Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct=(x)=>(x==null||!Number.isFinite(x)?"—":(x*100).toFixed(1)+"%");
const suma=(v)=>v.reduce((a,b)=>a+b,0);
const media=(v)=>(v.length?suma(v)/v.length:NaN);
function caidaMax(pl){let c=0,p=0,w=0;for(const x of pl){c+=x;p=Math.max(p,c);w=Math.min(w,c-p);}return w;}
function desdeArranque(pl){let c=0,w=0;for(const x of pl){c+=x;w=Math.min(w,c);}return w;}
const raya=(t)=>{console.log("\n"+"=".repeat(104));console.log("  "+t);console.log("=".repeat(104));};

const {dias}=JSON.parse(readFileSync("scripts/amplitud-riesgo-dias.json","utf8"));
const MC=[5,50], MA={};
for(const k of MC) MA[k]=dias.map((_,i)=>{if(i<k)return null;let s=0;for(let j=i-k;j<i;j++)s+=dias[j].cierre;return s/k;});
const serie=dias.map((d,i)=>{const p=d.pnl["45"];const m1=MA[5][i],m2=MA[50][i];
  if(p==null||m1==null||m2==null)return 0;
  return (d.sp11>=m1&&d.sp11>=m2)?p:0;});
const fechas=dias.map(d=>d.fecha);

console.log(`\n# EL EFECTIVO - lo unico que puede tumbar la cuenta\n`);
console.log(`Regla: +-45, alas 50, sobre MA5 y MA50, 11:00. ${serie.filter(x=>x!==0).length} dias operados de ${dias.length}.`);
console.log(`Efectivo de arranque ${eur(EFECTIVO)} - colateral ${eur(COLATERAL)}/condor sale del poder de compra ${eur(PODER)}.`);

raya("N . EL CAMINO REAL, CONTINUO, DE PUNTA A PUNTA");
console.log("| contratos | colateral | $/ano | caida max (desde pico) | peor racha DESDE EL ARRANQUE | efectivo minimo | fecha | dias en rojo |");
console.log("|---|---|---|---|---|---|---|---|");
for(const k of [1,2,3]){
  const s=serie.map(x=>x*k);
  let caja=EFECTIVO,min=EFECTIVO,f=null,rojo=0;
  for(let i=0;i<s.length;i++){caja+=s[i];if(caja<min){min=caja;f=fechas[i];}if(caja<0)rojo++;}
  console.log(`| ${k} | ${eur(k*COLATERAL)}${k*COLATERAL>PODER?" **NO CABE**":""} | ${eur(suma(s)/(dias.length/252))} | ${eur(caidaMax(s))} (${pct(caidaMax(s)/CUENTA)}) | ${eur(desdeArranque(s))} | ${eur(min)} | ${f} | ${rojo} |`);
}

raya("O . Y SI EL MAL TRAMO HUBIERA LLEGADO PRIMERO - 5.000 remuestreos del ORDEN por bloques de 21 dias");
console.log(`
  Se conservan EXACTAMENTE los mismos dias y los mismos resultados; solo se baraja el orden en
  bloques de un mes (21 sesiones) para no romper el racimo de volatilidad. La pregunta es una sola:
  con que frecuencia el efectivo de ${eur(EFECTIVO)} se pone en rojo antes de que lleguen los beneficios.
`);
let rng=20260820; const rnd=()=>{rng=(rng*1103515245+12345)&0x7fffffff;return rng/0x7fffffff;};
const B=21;
const bloques=[]; for(let i=0;i<serie.length;i+=B) bloques.push(serie.slice(i,i+B));
console.log("| contratos | quiebra el efectivo | efectivo minimo p5 | mediana | p95 | peor de 5.000 | camino real |");
console.log("|---|---|---|---|---|---|---|");
for(const k of [1,2,3]){
  const mins=[]; let quiebra=0;
  for(let r=0;r<5000;r++){
    const o=bloques.map((b,i)=>i); for(let i=o.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[o[i],o[j]]=[o[j],o[i]];}
    let caja=EFECTIVO,min=EFECTIVO;
    for(const bi of o) for(const x of bloques[bi]){caja+=x*k;if(caja<min)min=caja;}
    mins.push(min); if(min<0)quiebra++;
  }
  mins.sort((a,b)=>a-b);
  let caja=EFECTIVO,mreal=EFECTIVO; for(const x of serie){caja+=x*k;if(caja<mreal)mreal=caja;}
  console.log(`| ${k} | **${pct(quiebra/5000)}** | ${eur(mins[250])} | ${eur(mins[2500])} | ${eur(mins[4750])} | ${eur(mins[0])} | ${eur(mreal)} |`);
}

raya("P . CUANTO EFECTIVO HACE FALTA PARA QUE NO QUIEBRE NUNCA EN 5.000 ORDENES");
console.log("| contratos | efectivo necesario (peor de 5.000) | tiene Lester | alcanza? |");
console.log("|---|---|---|---|");
for(const k of [1,2,3]){
  let peor=0;
  for(let r=0;r<5000;r++){
    const o=bloques.map((b,i)=>i); for(let i=o.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[o[i],o[j]]=[o[j],o[i]];}
    let c=0,m=0; for(const bi of o) for(const x of bloques[bi]){c+=x*k;if(c<m)m=c;}
    if(m<peor)peor=m;
  }
  console.log(`| ${k} | ${eur(-peor)} | ${eur(EFECTIVO)} | ${-peor<=EFECTIVO?"**si**":"**NO**"} |`);
}
