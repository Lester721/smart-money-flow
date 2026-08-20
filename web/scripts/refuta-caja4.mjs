// REFUTACIÓN CAJA · PARTE 4 — el peor arranque contra la línea de llamada bajo estrés de HOOD.
import { readFileSync } from "node:fs";
const EFECTIVO=7977, HOOD_HOY=48135, BP0=73874, INT=0.05;
const eur=(x)=>(x==null||!isFinite(x)?"—":(x<0?"−":"")+"$"+Math.abs(Math.round(x)).toLocaleString("es-ES"));
const D=JSON.parse(readFileSync("scripts/cuanto-aguanta-dias.json","utf8")).dias;
const CFG=[{nom:"cóndor de HOY  ±25/50",ala:50,pl:(d)=>d.A.pl,abre:()=>true},
           {nom:"FILTRO AMPLITUD ±30/50",ala:50,pl:(d)=>d.B.pl,abre:(d)=>d.opera===true},
           {nom:"por STRADDLE 2,3×/30",ala:30,pl:(d)=>d.C.pl,abre:()=>true}];
function corre(cfg,n,dias){let c=EFECTIVO,min=EFECTIVO,fMin=dias[0].fecha,prev=dias[0].fecha,rojo=0,interes=0;
 for(const d of dias){const nd=Math.max(0,(new Date(d.fecha+"T00:00:00Z")-new Date(prev+"T00:00:00Z"))/86400000);prev=d.fecha;
  if(c<0&&nd>0){const i2=c*INT*nd/365;interes+=i2;c+=i2;}
  if(cfg.abre(d)&&cfg.ala*100*n<=BP0+(c-EFECTIVO))c+=cfg.pl(d)*n;
  if(c<min){min=c;fMin=d.fecha;} if(c<0)rojo++;}
 return{min,fMin,rojo,interes,final:c};}
console.log("### EL PEOR DE LOS 1.049 ARRANQUES CONTRA LA LÍNEA DE LLAMADA (mantenimiento 30%)\n");
const CAIDAS=[[0,"HOOD entero"],[0.30,"HOOD −30%"],[0.50,"HOOD −50%"],[0.573,"HOOD −57,3% (su caída máx REAL)"]];
console.log("| geometría | ctr | peor caja de 1.049 arranques | arranque | "+CAIDAS.map(([f,n])=>`${n} → línea ${eur(-0.7*HOOD_HOY*(1-f))}`).join(" | ")+" |");
console.log("|---|---|---|---|"+CAIDAS.map(()=>"---").join("|")+"|");
for(const cfg of CFG)for(const n of [1,2]){
 let peor=Infinity,ini="",res=null;
 for(let i=0;i<D.length-20;i++){const r=corre(cfg,n,D.slice(i));if(r.min<peor){peor=r.min;ini=D[i].fecha;res=r;}}
 const cel=CAIDAS.map(([f])=>peor<-0.7*HOOD_HOY*(1-f)?`**ROMPE** (${res.fMin})`:"aguanta");
 console.log(`| ${cfg.nom} | ${n} | ${eur(peor)} (${res.rojo} d. rojo, int. ${eur(res.interes)}) | ${ini} | ${cel.join(" | ")} |`);}
console.log("\n\n### Y CON EL ARRANQUE ORIGINAL (2022-04-27), que es el único que el hallazgo mide\n");
console.log("| geometría | ctr | caja mínima | "+CAIDAS.map(([f,n])=>n).join(" | ")+" |");
console.log("|---|---|---|"+CAIDAS.map(()=>"---").join("|")+"|");
for(const cfg of CFG)for(const n of [1,2]){const r=corre(cfg,n,D);
 console.log(`| ${cfg.nom} | ${n} | ${eur(r.min)} | ${CAIDAS.map(([f])=>r.min<-0.7*HOOD_HOY*(1-f)?"**ROMPE**":"aguanta").join(" | ")} |`);}
