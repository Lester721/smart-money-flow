// REFUTACION - la MISMA regla en OTRO instrumento: SPY 0DTE.
// scripts/cache-theta/spy-0dte/AAAA-MM-DD.json = [[hora, right, strike, bid, ask, ?, subyacente], ...]
// La distancia se traduce literalmente: +-45 puntos de SPX = 45/SPX_11:00 en tanto por uno, y ese
// mismo tanto por uno se aplica al precio de SPY. Alas 50 puntos de SPX, igual. CERO parametros nuevos.
import { readFileSync, readdirSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const DIR = "scripts/cache-theta/spy-0dte";
const HORA = "11:00", COMM = 0.03;
const PRUEBAS = 60, LISTON = listonT(PRUEBAS);
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(1) + "%");
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
function caidaMax(pl){let c=0,p=0,w=0;for(const x of pl){c+=x;p=Math.max(p,c);w=Math.min(w,c-p);}return w;}
function es5de(pl){const o=[...pl].sort((a,b)=>a-b);return media(o.slice(0,Math.max(1,Math.round(pl.length*0.05))));}
const raya=(t)=>{console.log("\n"+"=".repeat(104));console.log("  "+t);console.log("=".repeat(104));};

// tanto por uno de la regla SPX, dia a dia, desde la tabla de horas ya construida
const spx = JSON.parse(readFileSync("scripts/refutar-amplitud-horas.json","utf8"));
const ratio = new Map(spx.dias.filter(d=>d.sp["11:00"]).map(d=>[d.fecha,{dist:45/d.sp["11:00"],ala:50/d.sp["11:00"]}]));

const fechas = readdirSync(DIR).map(f=>(f.match(/^(\d{4}-\d{2}-\d{2})\.json$/)||[])[1]).filter(Boolean).sort();
console.log(`\n# LA MISMA REGLA EN OTRO INSTRUMENTO - SPY 0DTE\n`);
console.log(`${fechas.length} ficheros en ${DIR} - ${PRUEBAS} pruebas - liston |t| ${LISTON}`);

const cerca=(f,o)=>f.reduce((a,b)=>(Math.abs(b.K-o)<Math.abs(a.K-o)?b:a));
const dias=[];
let sinRatio=0, sinHora=0;
for(const fecha of fechas){
  const r = ratio.get(fecha);
  if(!r){ sinRatio++; continue; }
  let filas;
  try{ filas = JSON.parse(readFileSync(`${DIR}/${fecha}.json`,"utf8")); }catch{ continue; }
  if(!Array.isArray(filas)||!filas.length) continue;
  const C=[],P=[]; let cierre=0,hFin="";
  for(const f of filas){
    const [h,right,K,bid,ask,,sp]=f;
    if(sp>0&&h>=hFin){hFin=h;cierre=sp;}
    if(h!==HORA) continue;
    if(!(K>0)||!(ask>0)||!(bid>=0)) continue;
    (right==="C"?C:P).push({K,bid,ask,spot:sp});
  }
  if(!C.length||!P.length||!(cierre>0)){ sinHora++; continue; }
  const sph=C[0].spot; if(!(sph>0)) continue;
  const dist=r.dist*sph, ala=r.ala*sph;
  const cC=cerca(C,sph+dist), pC=cerca(P,sph-dist);
  const cL=cerca(C,cC.K+ala), pL=cerca(P,pC.K-ala);
  if(cL.K<=cC.K||pL.K>=pC.K) continue;
  const cred=cC.bid+pC.bid-cL.ask-pL.ask;
  if(!(cred>0)) continue;
  const S=cierre;
  const pl=(cred-Math.min(Math.max(S-cC.K,0),cL.K-cC.K)-Math.min(Math.max(pC.K-S,0),pC.K-pL.K))*100-8*COMM;
  // escala: un condor de SPY vale la decima parte de uno de SPX. Se multiplica x10 para comparar en dolares.
  dias.push({fecha,ano:fecha.slice(0,4),sph,cierre,pl,cred:cred*100,anchoAla:(cL.K-cC.K),
             horq:((cC.ask-cC.bid)+(pC.ask-pC.bid)+(cL.ask-cL.bid)+(pL.ask-pL.bid))*100});
}
console.log(`${dias.length} dias usables - sin fecha equivalente en SPX: ${sinRatio} - sin foto a las ${HORA}: ${sinHora}`);
console.log(`ultima marca del dia usada como cierre - primera ${dias[0].fecha} ultima ${dias[dias.length-1].fecha}`);

const MC=[5,50], MA={};
for(const k of MC) MA[k]=dias.map((_,i)=>{if(i<k)return null;let s=0;for(let j=i-k;j<i;j++)s+=dias[j].cierre;return s/k;});
const opera=(d,i)=>{const m1=MA[5][i],m2=MA[50][i];return m1!=null&&m2!=null&&d.sph>=m1&&d.sph>=m2;};

let rng=20260820; const rnd=()=>{rng=(rng*1103515245+12345)&0x7fffffff;return rng/0x7fffffff;};
const REPS=4000;
function nulo(pl,N){const de=[],orden=pl.map((_,i)=>i);
  for(let r=0;r<REPS;r++){for(let i=orden.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[orden[i],orden[j]]=[orden[j],orden[i]];}
    const m=new Uint8Array(pl.length);for(let i=0;i<N;i++)m[orden[i]]=1;
    de.push(es5de(pl.map((x,i)=>m[i]?x:0)));}
  return de;}
const perc=(arr,v)=>arr.filter(x=>x<v).length/arr.length;
const med=(arr)=>{const s=[...arr].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};

raya("K . SPY 0DTE - misma regla, 10 contratos para igualar el tamano de un condor de SPX");
const m2=Math.floor(dias.length/2);
console.log("| tramo | dias | dias op. | $/ano (x10 contratos) | 5% peor filtro | 5% peor sin filtro | mediana sorteo | percentil del nulo | caida filtro |");
console.log("|---|---|---|---|---|---|---|---|---|");
for(const [nom,ini,fin] of [["entero",0,dias.length],["H1",0,m2],["H2",m2,dias.length]]){
  const ds=dias.slice(ini,fin);
  const pl=ds.map(d=>d.pl*10);
  const on=ds.map((d,j)=>opera(d,ini+j));
  const N=on.filter(Boolean).length;
  const fS=pl.map((x,i)=>on[i]?x:0);
  const de=nulo(pl,N);
  console.log(`| ${nom} ${ds[0].fecha} a ${ds[ds.length-1].fecha} | ${ds.length} | ${N} | ${eur(suma(fS)/(ds.length/252))} | ${eur(es5de(fS))} | ${eur(es5de(pl))} | ${eur(med(de))} | **${(perc(de,es5de(fS))*100).toFixed(1)}%** | ${eur(caidaMax(fS))} |`);
}

raya("L . LA HORQUILLA A +-45 - lo que la nota dejaba sin comprobar");
console.log(`
  Los precios ya son reales (bid al vender, ask al comprar), asi que la horquilla YA esta pagada.
  Lo que falta saber es cuanto pesa: si la horquilla de las cuatro patas es una fraccion enorme del
  credito, un tick de deslizamiento o falta de tamano se lo come. SPY 0DTE, mismas fechas.
`);
console.log("| ano | dias op. | credito medio (x10) | horquilla total 4 patas (x10) | horquilla / credito | $ del ano (x10) |");
console.log("|---|---|---|---|---|---|");
for(const a of [...new Set(dias.map(d=>d.ano))].sort()){
  const op=dias.map((d,i)=>({d,i})).filter(({d,i})=>d.ano===a&&opera(d,i)).map(({d})=>d);
  if(!op.length){console.log(`| ${a} | 0 | — | — | — | — |`);continue;}
  console.log(`| **${a}** | ${op.length} | ${eur(media(op.map(d=>d.cred))*10)} | ${eur(media(op.map(d=>d.horq))*10)} | **${pct(media(op.map(d=>d.horq/d.cred)))}** | ${eur(suma(op.map(d=>d.pl))*10)} |`);
}

raya("M . DESLIZAMIENTO - que queda si la ejecucion es peor de lo que dice la pantalla");
console.log(`
  Se resta un % del credito en cada operacion (peor ejecucion), sin tocar la perdida maxima.
  El riesgo no cambia (el ala manda); lo que se derrite es el ingreso.
`);
console.log("| recorte del credito | $/ano SPY (x10) | 5% peor | anos en negativo |");
console.log("|---|---|---|---|");
for(const rec of [0,0.05,0.10,0.25]){
  const on=dias.map((d,i)=>opera(d,i));
  const s=dias.map((d,i)=>on[i]?(d.pl-d.cred*rec)*10:0);
  const porAno={}; dias.forEach((d,i)=>{porAno[d.ano]=(porAno[d.ano]||0)+s[i];});
  console.log(`| ${pct(rec)} | ${eur(suma(s)/(dias.length/252))} | ${eur(es5de(s))} | ${Object.values(porAno).filter(x=>x<0).length}/${Object.keys(porAno).length} |`);
}
