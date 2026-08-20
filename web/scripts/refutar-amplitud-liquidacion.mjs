// REFUTACION - el punto 3 del "queFaltaria": la liquidacion. SPXW es PM-settled y el proyecto usa
// la ultima marca de 16:00 del fichero. Aqui se mide CUANTO puede mover eso el resultado.
import { readFileSync, readdirSync, existsSync } from "node:fs";

const DIR="scripts/cache-theta/gex-2026", HORA="11:00", COMM=0.03, DIST=45, ALA=50;
const eur=(x)=>(x==null||!Number.isFinite(x)?"—":(x<0?"−":"")+"$"+Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct=(x)=>(x==null||!Number.isFinite(x)?"—":(x*100).toFixed(1)+"%");
const suma=(v)=>v.reduce((a,b)=>a+b,0);
const media=(v)=>(v.length?suma(v)/v.length:NaN);
function caidaMax(pl){let c=0,p=0,w=0;for(const x of pl){c+=x;p=Math.max(p,c);w=Math.min(w,c-p);}return w;}
function es5de(pl){const o=[...pl].sort((a,b)=>a-b);return media(o.slice(0,Math.max(1,Math.round(pl.length*0.05))));}
const raya=(t)=>{console.log("\n"+"=".repeat(104));console.log("  "+t);console.log("=".repeat(104));};

function leer(fecha,right){
  const f=`${DIR}/iv_${fecha}_${right}.csv`; if(!existsSync(f))return null;
  const lin=readFileSync(f,"utf8").trim().split("\n"); if(lin.length<2)return null;
  const cab=lin[0].split(",").map(x=>x.replace(/"/g,"").trim());
  const idx=["strike","timestamp","bid","ask","underlying_price"].map(c=>cab.indexOf(c));
  if(idx.some(x=>x<0))throw new Error("faltan columnas");
  const [iK,iT,iB,iA,iU]=idx; const enH=[]; let cierre=0,hFin="";
  for(let j=1;j<lin.length;j++){const c=lin[j].split(",");
    const h=String(c[iT]).slice(11,16),sp=Number(c[iU]);
    if(sp>0&&h>=hFin){hFin=h;cierre=sp;}
    if(h!==HORA)continue;
    const K=Number(c[iK]),bid=Number(c[iB]),ask=Number(c[iA]);
    if(K>0&&bid>=0&&ask>0)enH.push({K,bid,ask,spot:sp});}
  return enH.length?{filas:enH,cierre}:null;
}
const cerca=(f,o)=>f.reduce((a,b)=>(Math.abs(b.K-o)<Math.abs(a.K-o)?b:a));
const fechas=[...new Set(readdirSync(DIR).map(f=>(f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)||[])[1]).filter(Boolean))].sort();

console.log(`\n# LA LIQUIDACION - cuanto depende el resultado del ultimo precio del fichero\n`);
const filas=[];
for(const fecha of fechas){
  const C=leer(fecha,"C"),P=leer(fecha,"P");
  if(!C||!P||!(C.cierre>0))continue;
  const sp=C.filas[0].spot; if(!(sp>0))continue;
  const cC=cerca(C.filas,sp+DIST),pC=cerca(P.filas,sp-DIST);
  const cL=cerca(C.filas,cC.K+ALA),pL=cerca(P.filas,pC.K-ALA);
  if(cL.K<=cC.K||pL.K>=pC.K)continue;
  const cred=cC.bid+pC.bid-cL.ask-pL.ask; if(!(cred>0))continue;
  filas.push({fecha,ano:fecha.slice(0,4),sp,cierre:C.cierre,cred,cCK:cC.K,pCK:pC.K,cLK:cL.K,pLK:pL.K});
}
const pl=(f,S)=>(f.cred-Math.min(Math.max(S-f.cCK,0),f.cLK-f.cCK)-Math.min(Math.max(f.pCK-S,0),f.pCK-f.pLK))*100-8*COMM;
const MA={}; for(const k of [5,50]) MA[k]=filas.map((_,i)=>{if(i<k)return null;let s=0;for(let j=i-k;j<i;j++)s+=filas[j].cierre;return s/k;});
const on=filas.map((f,i)=>{const m1=MA[5][i],m2=MA[50][i];return m1!=null&&m2!=null&&f.sp>=m1&&f.sp>=m2;});

console.log(`${filas.length} sesiones - ${on.filter(Boolean).length} operadas por la regla`);
raya("Q . SENSIBILIDAD AL PRECIO DE LIQUIDACION");
console.log("| desplazamiento del cierre | $/ano | 5% peor | caida max | dias operados que cambian de resultado |");
console.log("|---|---|---|---|---|");
const base=filas.map((f,i)=>on[i]?pl(f,f.cierre):0);
for(const dz of [-5,-2,-1,-0.25,0,0.25,1,2,5]){
  const s=filas.map((f,i)=>on[i]?pl(f,f.cierre+dz):0);
  const cambian=s.filter((x,i)=>on[i]&&Math.abs(x-base[i])>0.5).length;
  console.log(`| ${dz>0?"+":""}${dz} puntos | ${eur(suma(s)/(filas.length/252))} | ${eur(es5de(s))} | ${eur(caidaMax(s))} | ${cambian} |`);
}
const opF=filas.filter((f,i)=>on[i]);
const margen=opF.map(f=>Math.min(Math.abs(f.cierre-f.cCK),Math.abs(f.cierre-f.pCK),Math.abs(f.cierre-f.cLK),Math.abs(f.cierre-f.pLK)));
console.log(`\n  Distancia del cierre al strike mas cercano, dias operados: mediana ${[...margen].sort((a,b)=>a-b)[Math.floor(margen.length/2)].toFixed(1)} puntos`);
console.log(`  dias operados con el cierre a menos de 1 punto de un strike: ${margen.filter(x=>x<1).length}/${opF.length}`);
console.log(`  dias operados con el cierre a menos de 5 puntos de un strike: ${margen.filter(x=>x<5).length}/${opF.length}`);

raby: {
  raya("R . CONTRASTE DEL CIERRE CON EL FICHERO INDEPENDIENTE DE CIERRES DE SPY");
  const p="scripts/cache-theta/cierres/SPY.json";
  if(!existsSync(p)){console.log("  no existe "+p);break raby;}
  const raw=JSON.parse(readFileSync(p,"utf8"));
  const spy=Array.isArray(raw)?Object.fromEntries(raw.map(r=>[r.fecha??r.date??r[0], r.close??r.cierre??r[1]])):raw;
  const spyDir="scripts/cache-theta/spy-0dte";
  const fs2=readdirSync(spyDir).map(f=>(f.match(/^(\d{4}-\d{2}-\d{2})\.json$/)||[])[1]).filter(Boolean).sort();
  let n=0,peor=0,suma2=0;
  for(const f of fs2){
    const of_=spy[f]; if(of_==null||!Number.isFinite(Number(of_)))continue;
    let ult=0,h="";
    for(const r of JSON.parse(readFileSync(`${spyDir}/${f}.json`,"utf8"))){ if(r[6]>0&&r[0]>=h){h=r[0];ult=r[6];} }
    if(!(ult>0))continue;
    const e=Math.abs(ult-Number(of_)); n++; suma2+=e; if(e>peor)peor=e;
  }
  if(!n){console.log("  el fichero de cierres de SPY no tiene un formato que se pueda cruzar - NO validado");break raby;}
  console.log(`  ${n} dias cruzados - error medio ${suma2/n<0.001?"<$0,001":"$"+(suma2/n).toFixed(4)} - error maximo $${peor.toFixed(4)}`);
  console.log(`  (compara la ultima marca de 5 min del fichero 0DTE contra el cierre diario independiente)`);
}
