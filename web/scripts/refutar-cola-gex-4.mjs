// REFUTACIÓN parte 4 — separar las piezas: ¿qué pieza aguanta y contra qué nulo?
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
 return{pl:(cr-Math.min(Math.max(d.cierre-cC[0],0),cL[0]-cC[0])-Math.min(Math.max(pC[0]-d.cierre,0),pC[0]-pL[0]))*100-8*0.03,cr};}
const fechas=[...dias.keys()].sort();
const S=fechas.map(f=>{const d=dias.get(f),c=condor(d,50),r=g.find(x=>x.fecha===f);
 return{fecha:f,pl:c.pl,cr:c.cr,zona:r.zonaSobreTotal,iv:r.ivATM,sigma:r.sigmaPts};});
const met=(o)=>{const p=o.map(x=>x.pl),t=p.reduce((s,x)=>s+x,0);let pi=0,ac=0,pe=0;
 for(const x of o){ac+=x.pl;pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
 const s=[...p].sort((a,b)=>a-b);
 return{n:o.length,total:t,anio:t/A,peor:s[0],p5:s[Math.floor(s.length*0.05)],racha:pe,m2k:p.filter(x=>x<-2000).length};};
function fueraSerie(vals,q,sent,ven=60,minv=30){const s=new Set();
 for(let i=0;i<vals.length;i++){const v=vals[i];if(v==null||!isFinite(v))continue;
  const w=vals.slice(Math.max(0,i-ven),i).filter(x=>x!=null&&isFinite(x));
  if(w.length<minv)continue;const p=w.filter(x=>x<v).length/w.length;
  if(sent==="bajo"?p<q:p>1-q)s.add(i);} return s;}
const z2=(k1,n1,k2,n2)=>{const p=(k1+k2)/(n1+n2);return (k1/n1-k2/n2)/Math.sqrt(p*(1-p)*(1/n1+1/n2));};

console.log("═══ 14. CADA PIEZA POR SEPARADO, sobre los días <−$2.000 ═══");
console.log("| filtro | días fuera | malos fuera | tasa fuera | días dentro | malos dentro | tasa dentro | z |");
console.log("|---|---|---|---|---|---|---|---|");
const FG=fueraSerie(S.map(x=>x.zona),0.20,"bajo");
const FIV=fueraSerie(S.map(x=>x.iv),0.20,"alto");
const FCR=fueraSerie(S.map(x=>x.cr),0.20,"alto");
const PIEZAS=[["GEX rodante 20% (zona baja)",i=>FG.has(i)],["IV rodante 20% (alta)",i=>FIV.has(i)],
 ["crédito rodante 20% (alto)",i=>FCR.has(i)],["crédito < $2",i=>S[i].cr<2],
 ["GEX + crédito<$2 (la receta)",i=>FG.has(i)||S[i].cr<2]];
for(const [nom,f] of PIEZAS){
 const fu=[...S.keys()].filter(f), de=[...S.keys()].filter(i=>!f(i));
 const kf=fu.filter(i=>S[i].pl<-2000).length, kd=de.filter(i=>S[i].pl<-2000).length;
 console.log(`| ${nom} | ${fu.length} | ${kf} | ${(kf/fu.length*100).toFixed(1)}% | ${de.length} | ${kd} | ${(kd/de.length*100).toFixed(1)}% | ${z2(kf,fu.length,kd,de.length).toFixed(2)} |`);}
console.log(`\nlistón 87 pruebas: ${listonT(87)}  ·  El hallazgo declara t=4,89 (tercil ESTÁTICO in-sample, no operativo).`);

console.log("\n═══ 15. EL CRÉDITO<$2: sus 94 días, uno a uno en la cola ═══");
const c2=[...S.keys()].filter(i=>S[i].cr<2);
const peores=c2.sort((a,b)=>S[a].pl-S[b].pl).slice(0,5);
console.log("  los 5 peores de esos 94:",peores.map(i=>`${S[i].fecha} ${eur(S[i].pl)}`).join(" · "));
const tot=c2.reduce((a,i)=>a+S[i].pl,0);
const sinPeor=c2.filter(i=>i!==peores[0]).reduce((a,i)=>a+S[i].pl,0);
console.log(`  suma de los 94: ${eur(tot)}   ·  quitando SOLO el peor día (${S[peores[0]].fecha}): ${eur(sinPeor)} en 93 días`);
console.log(`  → el argumento "arriesgar $4.900 por $100" descansa en UN día de los 94.`);

console.log("\n═══ 16. GEX SOLO (sin el suelo de crédito) contra el nulo de rotación, por año ═══");
const N=S.length;
console.log("| tramo | base racha | GEX racha | mediana nulo | percentil | base <−2k | GEX <−2k | percentil |");
console.log("|---|---|---|---|---|---|---|---|");
for(const [nom,pred] of [["todo",()=>true],["2024",x=>x.fecha.startsWith("2024")],["2025",x=>x.fecha.startsWith("2025")],["2026",x=>x.fecha.startsWith("2026")]]){
 const idx=[...S.keys()].filter(i=>pred(S[i]));
 const B=met(idx.map(i=>S[i]));
 const R=met(idx.filter(i=>!FG.has(i)).map(i=>S[i]));
 const nr=[],nm=[];
 for(let kk=13;kk<N-13;kk+=1){const rot=S.map((_,i)=>S[(i+kk)%N].zona);const F=fueraSerie(rot,0.20,"bajo");
  const o=idx.filter(i=>!F.has(i)).map(i=>S[i]); if(o.length<30)continue; const M=met(o); nr.push(M.racha); nm.push(M.m2k);}
 nr.sort((a,b)=>a-b);nm.sort((a,b)=>a-b);
 console.log(`| ${nom} | ${eur(B.racha)} | ${eur(R.racha)} | ${eur(nr[nr.length>>1])} | ${(nr.filter(x=>x<R.racha).length/nr.length*100).toFixed(1)}% | ${B.m2k} | ${R.m2k} | ${(nm.filter(x=>x<R.m2k).length/nm.length*100).toFixed(1)}% |`);}

console.log("\n═══ 17. ¿VIVE EL 2025 EN UN SOLO EPISODIO? ═══");
// la caída base 2025-01-30 → 2025-03-07
const vent=S.filter(x=>x.fecha>="2025-01-30"&&x.fecha<="2025-03-07");
const iv=[...S.keys()].filter(i=>S[i].fecha>="2025-01-30"&&S[i].fecha<="2025-03-07");
console.log(`  ventana de la caída base: ${vent.length} días · suma ${eur(vent.reduce((a,x)=>a+x.pl,0))}`);
console.log(`  el filtro quita ${iv.filter(i=>FG.has(i)||S[i].cr<2).length} de esos ${vent.length}, que suman ${eur(iv.filter(i=>FG.has(i)||S[i].cr<2).reduce((a,i)=>a+S[i].pl,0))}`);
const sin=met(S.filter(x=>!(x.fecha>="2025-01-30"&&x.fecha<="2025-03-07")));
const sinF=met(S.filter((x,i)=>!(x.fecha>="2025-01-30"&&x.fecha<="2025-03-07")&&!FG.has(i)&&x.cr>=2));
console.log(`  QUITANDO esa ventana de AMBOS:  base racha ${eur(sin.racha)} (<−2k ${sin.m2k}) · filtrada ${eur(sinF.racha)} (<−2k ${sinF.m2k})`);
console.log(`  → mejora de la caída sin el episodio: ${((1-sinF.racha/sin.racha)*100).toFixed(0)}%   (con él: 42%)`);

console.log("\n═══ 18. LA MÉTRICA QUE DECIDE: $/año retenidos por $ de caída eliminado ═══");
const base=met(S);
for(const [nom,pred] of [["GEX solo",i=>!FG.has(i)],["GEX+créd≥2",i=>!FG.has(i)&&S[i].cr>=2],["IV rodante solo",i=>!FIV.has(i)],["crédito rodante solo",i=>!FCR.has(i)]]){
 const R=met([...S.keys()].filter(pred).map(i=>S[i]));
 const dCaida=R.racha-base.racha, dIng=R.anio-base.anio;
 console.log(`  ${nom.padEnd(22)} caída ${eur(base.racha)}→${eur(R.racha)} (${eur(dCaida)} menos) · ingreso ${eur(base.anio)}→${eur(R.anio)} (${dIng>=0?"+":""}${eur(dIng)}) · ${dCaida>0?(dIng/dCaida).toFixed(2):"—"} $ingreso/$caída`);}
