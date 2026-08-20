// REFUTACIÓN parte 3 — el listón, el ala escalada, y fuera de muestra de verdad
import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
const g = JSON.parse(readFileSync("scripts/cola-gex-filas.json","utf8")).sort((a,b)=>a.fecha.localeCompare(b.fecha));
const dias = new Map(JSON.parse(readFileSync("scripts/cola-cadena11.json","utf8")).map(d=>[d.fecha,d]));
const eur=(x)=>(x<0?"−":"")+"$"+Math.abs(Math.round(x)).toLocaleString("es-ES");
const cerca=(f,o)=>f.reduce((a,b)=>(Math.abs(b[0]-o)<Math.abs(a[0]-o)?b:a));
const A=653/252;
function condor(d,ala){const cC=cerca(d.C,d.spot+25),pC=cerca(d.P,d.spot-25);
 const cL=cerca(d.C,cC[0]+ala),pL=cerca(d.P,pC[0]-ala);
 if(cL[0]<=cC[0]||pL[0]>=pC[0])return null;
 const cr=cC[1]+pC[1]-cL[2]-pL[2]; if(!(cr>0))return null;
 const pl=(cr-Math.min(Math.max(d.cierre-cC[0],0),cL[0]-cC[0])-Math.min(Math.max(pC[0]-d.cierre,0),pC[0]-pL[0]))*100-8*0.03;
 return{pl,cr,col:(Math.max(cL[0]-cC[0],pC[0]-pL[0])-cr)*100};}
const fechas=[...dias.keys()].sort();
const S=fechas.map(f=>{const d=dias.get(f),r=g.find(x=>x.fecha===f);
 const o={fecha:f,zona:r.zonaSobreTotal,iv:r.ivATM,sigma:r.sigmaPts};
 for(const ala of [50,40,30]){const c=condor(d,ala);o["pl"+ala]=c?c.pl:null;o["cr"+ala]=c?c.cr:null;o["col"+ala]=c?c.col:null;}
 return o;});
const met=(o,ala=50)=>{const p=o.map(x=>x["pl"+ala]),t=p.reduce((s,x)=>s+x,0);let pi=0,ac=0,pe=0;
 for(const x of o){ac+=x["pl"+ala];pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
 const s=[...p].sort((a,b)=>a-b);
 return{n:o.length,total:t,anio:t/A,peor:s[0],p5:s[Math.floor(s.length*0.05)],racha:pe,m2k:p.filter(x=>x<-2000).length,
  col:Math.max(...o.map(x=>x["col"+ala]))};};
function fueraSerie(vals,q,sent,ven=60,minv=30){const s=new Set();
 for(let i=0;i<vals.length;i++){const v=vals[i];if(v==null||!isFinite(v))continue;
  const w=vals.slice(Math.max(0,i-ven),i).filter(x=>x!=null&&isFinite(x));
  if(w.length<minv)continue;const p=w.filter(x=>x<v).length/w.length;
  if(sent==="bajo"?p<q:p>1-q)s.add(i);} return s;}
const FG=fueraSerie(S.map(x=>x.zona),0.20,"bajo");
const dentro=(i)=>!FG.has(i)&&S[i].cr50>=2;

// ═══ 9. LO QUE SE TIRA: ¿pierde dinero o es ruido? ═══
console.log("═══ 9. LOS DÍAS EXCLUIDOS: ¿pierden, o es ruido? ═══");
const gr=(pred)=>{const p=S.filter((x,i)=>pred(i)).map(x=>x.pl50);
 const m=p.reduce((a,x)=>a+x,0)/p.length; const v=p.reduce((a,x)=>a+(x-m)**2,0)/(p.length-1);
 return{n:p.length,m,se:Math.sqrt(v/p.length),tot:p.reduce((a,x)=>a+x,0),m2k:p.filter(x=>x<-2000).length};};
const EX=gr(i=>!dentro(i)), IN=gr(i=>dentro(i)), EXg=gr(i=>FG.has(i)), EXc=gr(i=>!FG.has(i)&&S[i].cr50<2);
for(const [n,x] of [["EXCLUIDOS (todo)",EX],["  · por GEX",EXg],["  · por crédito<$2",EXc],["RETENIDOS",IN]])
 console.log(`  ${n.padEnd(20)} n=${String(x.n).padStart(3)}  media ${eur(x.m).padStart(8)} ± ${eur(x.se)}  (t=${(x.m/x.se).toFixed(2)})  total ${eur(x.tot)}  <−2k ${x.m2k}`);
console.log(`  → el "106% del ingreso" sale de que los ${EX.n} días tirados suman ${eur(EX.tot)}: media ${eur(EX.m)}/día con t=${(EX.m/EX.se).toFixed(2)}`);

// ═══ 10. EL ESTADÍSTICO QUE DECIDE, hecho sobre el FILTRO OPERATIVO ═══
console.log("\n═══ 10. ¿PASA EL LISTÓN? ═══");
const n1=EX.n,k1=EX.m2k,n2=IN.n,k2=IN.m2k,pp=(k1+k2)/(n1+n2);
const se=Math.sqrt(pp*(1-pp)*(1/n1+1/n2)), z=(k1/n1-k2/n2)/se;
console.log(`  filtro OPERATIVO (rodante 20% + créd≥$2): días<−2k ${k1}/${n1}=${(k1/n1*100).toFixed(1)}% fuera vs ${k2}/${n2}=${(k2/n2*100).toFixed(1)}% dentro → z=${z.toFixed(2)}`);
// el tercil estático que reporta el hallazgo
const ord=[...S.keys()].sort((a,b)=>S[a].zona-S[b].zona); const k=Math.floor(S.length/3);
const T1=new Set(ord.slice(0,k));
const malos=[...S.keys()].filter(i=>S[i].pl50<-2000);
const enT1=malos.filter(i=>T1.has(i)).length;
const esp=malos.length/3, sd=Math.sqrt(malos.length*(1/3)*(2/3));
console.log(`  tercil ESTÁTICO (in-sample) de zona baja: ${enT1}/${malos.length} días malos (esperados ${esp.toFixed(1)}) → z=${((enT1-esp)/sd).toFixed(2)}`);
console.log(`  listón con 87 pruebas: |z| ≥ ${listonT(87)}   ·  con 40 pruebas: ${listonT(40)}  ·  con 1 prueba: ${listonT(1)}`);

// ═══ 11. EL ALA DE 40, A IGUAL COLATERAL ═══
console.log("\n═══ 11. EL ALA ESTRECHA, ESCALADA A IGUAL COLATERAL ═══");
console.log("| ala | días | colateral/contrato | $/año 1 contrato | contratos a $5.115 | $/año escalado | PEOR DÍA escalado |");
console.log("|---|---|---|---|---|---|---|");
const REF=met(S.filter((x,i)=>dentro(i)),50).col;
for(const ala of [50,40,30]){const R=met(S.filter((x,i)=>dentro(i)),ala);
 const mult=REF/R.col;
 console.log(`| ${ala} | ${R.n} | ${eur(R.col)} | ${eur(R.anio)} | ${mult.toFixed(2)} | ${eur(R.anio*mult)} | ${eur(R.peor*mult)} |`);}

// ═══ 12. FUERA DE MUESTRA DE VERDAD: campo, sentido y umbral elegidos SÓLO con 2024 ═══
console.log("\n═══ 12. FUERA DE MUESTRA — elegir campo+sentido+umbral SÓLO con 2024, aplicar a 2025-2026 ═══");
const iTest=[...S.keys()].filter(i=>!S[i].fecha.startsWith("2024"));
const CAMPOS=[["zona","bajo"],["zona","alto"],["iv","alto"],["iv","bajo"],["sigma","alto"],["sigma","bajo"],["cr50","alto"],["cr50","bajo"]];
let mejor=null;
for(const [c,s] of CAMPOS) for(const q of [0.1,0.15,0.2,0.25,0.3]){
 const F=fueraSerie(S.map(x=>x[c]),q,s);
 const tr=S.filter((x,i)=>x.fecha.startsWith("2024")&&!F.has(i)&&x.cr50>=2);
 if(tr.length<80)continue; const R=met(tr);
 const score=R.racha; // menos caída es mejor
 if(!mejor||score>mejor.score)mejor={c,s,q,score,R};}
console.log(`  elegido con 2024: campo=${mejor.c} sentido=${mejor.s} q=${mejor.q}  (racha 2024 ${eur(mejor.R.racha)})`);
const Fm=fueraSerie(S.map(x=>x[mejor.c]),mejor.q,mejor.s);
const testF=S.filter((x,i)=>iTest.includes(i)&&!Fm.has(i)&&x.cr50>=2), testB=S.filter((x,i)=>iTest.includes(i));
const RB=met(testB),RF=met(testF);
console.log(`  2025-2026 base:     n=${RB.n} total ${eur(RB.total)} racha ${eur(RB.racha)} p5 ${eur(RB.p5)} <−2k ${RB.m2k}`);
console.log(`  2025-2026 filtrado: n=${RF.n} total ${eur(RF.total)} racha ${eur(RF.racha)} p5 ${eur(RF.p5)} <−2k ${RF.m2k}`);
console.log(`  y con la receta publicada (zona/bajo/0,20) sobre 2025-2026:`);
const RP=met(S.filter((x,i)=>iTest.includes(i)&&dentro(i)));
console.log(`     n=${RP.n} total ${eur(RP.total)} racha ${eur(RP.racha)} p5 ${eur(RP.p5)} <−2k ${RP.m2k}`);

// ═══ 13. NULO POR AÑO ═══
console.log("\n═══ 13. NULO POR AÑO (rotación de la señal, 300 rotaciones) ═══");
console.log("| año | racha base | racha real | mediana nulo | percentil |");
console.log("|---|---|---|---|---|");
const N=S.length;
for(const a of ["2024","2025","2026"]){
 const idxA=[...S.keys()].filter(i=>S[i].fecha.startsWith(a));
 const rb=met(S.filter((x,i)=>idxA.includes(i))).racha;
 const rr=met(S.filter((x,i)=>idxA.includes(i)&&dentro(i))).racha;
 const nul=[];
 for(let kk=25;kk<N-25;kk+=2){const rot=S.map((_,i)=>S[(i+kk)%N].zona);const F=fueraSerie(rot,0.20,"bajo");
  const o=S.filter((x,i)=>idxA.includes(i)&&!F.has(i)&&x.cr50>=2); if(o.length<30)continue; nul.push(met(o).racha);}
 nul.sort((x,y)=>x-y);
 console.log(`| ${a} | ${eur(rb)} | ${eur(rr)} | ${eur(nul[nul.length>>1])} | ${(nul.filter(x=>x<rr).length/nul.length*100).toFixed(1)}% |`);}
