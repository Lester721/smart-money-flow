// REFUTACIÓN del hallazgo "La cola del cóndor sí se anticipa — el crédito, no la gamma"
import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
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

const res=(o)=>{const p=o.map(x=>x.pl),t=p.reduce((s,x)=>s+x,0);let pi=0,ac=0,pe=0;
 for(const x of o){ac+=x.pl;pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
 const s=[...p].sort((a,b)=>a-b);
 return{n:o.length,total:t,anio:t/A,peor:s[0],p1:s[Math.floor(s.length*0.01)],p5:s[Math.floor(s.length*0.05)],racha:pe,
   m2k:p.filter(x=>x<-2000).length,ac:p.filter(x=>x>0).length/p.length};};

// ── serie ordenada, con todo precalculado ───────────────────────────────────────────────
const fechas=[...dias.keys()].sort();
const S=[];
for(const f of fechas){const d=dias.get(f);const c50=condor(d,50),c40=condor(d,40);
 const r=g.find(x=>x.fecha===f);
 S.push({fecha:f,pl50:c50.pl,cr50:c50.cr,col50:c50.col,pl40:c40?c40.pl:null,cr40:c40?c40.cr:null,col40:c40?c40.col:null,
   zona:r.zonaSobreTotal,iv:r.ivATM,sigma:r.sigmaPts,ancho:r.anchoRel,gexNet:r.gexNetSuave,gexRatio:r.gexRatio,credG:r.credito});}
console.log(`serie: ${S.length} días`);

// ── 0. RADIOGRAFÍA ──────────────────────────────────────────────────────────────────────
radiografia(S,["zona","iv","sigma","ancho","cr50","pl50"],"refutacion", {cerosLegitimos:["pl50"]});

// ── control: ¿coincide el crédito de cadena11 con el de gex-filas? ──────────────────────
let difMax=0; for(const x of S) difMax=Math.max(difMax,Math.abs(x.cr50-x.credG));
console.log(`\ncontrol crédito cadena11 vs gex-filas: dif máx ${difMax.toFixed(4)}`);
console.log(`corr(zona, crédito) = ${corr(S.map(x=>x.zona),S.map(x=>x.cr50)).toFixed(3)}`);
console.log(`corr(zona, ivATM)   = ${corr(S.map(x=>x.zona),S.map(x=>x.iv)).toFixed(3)}`);

function corr(a,b){const n=a.length,ma=a.reduce((s,x)=>s+x,0)/n,mb=b.reduce((s,x)=>s+x,0)/n;
 let sa=0,sb=0,sab=0;for(let i=0;i<n;i++){sa+=(a[i]-ma)**2;sb+=(b[i]-mb)**2;sab+=(a[i]-ma)*(b[i]-mb);}
 return sab/Math.sqrt(sa*sb);}

// ── filtro rodante genérico sobre una serie arbitraria ──────────────────────────────────
function fueraSerie(vals,q,sent,ven=60,minv=30){const s=new Set();
 for(let i=0;i<vals.length;i++){const v=vals[i];if(v==null||!isFinite(v))continue;
  const w=vals.slice(Math.max(0,i-ven),i).filter(x=>x!=null&&isFinite(x));
  if(w.length<minv)continue;const p=w.filter(x=>x<v).length/w.length;
  if(sent==="bajo"?p<q:p>1-q)s.add(i);} return s;}

function aplicar(exc,creditoMin,ala){const o=[];
 for(let i=0;i<S.length;i++){if(exc.has(i))continue;
  const pl=ala===50?S[i].pl50:S[i].pl40, cr=ala===50?S[i].cr50:S[i].cr40, col=ala===50?S[i].col50:S[i].col40;
  if(pl==null)continue; if(cr<creditoMin)continue; o.push({pl,cr,col});}
 return res(o);}

const base=aplicar(new Set(),0,50);
const linea=(nom,R)=>console.log(`| ${nom} | ${R.n} | ${eur(R.anio)} | ${(R.anio/base.anio*100).toFixed(0)}% | ${eur(R.peor)} | ${eur(R.p5)} | ${eur(R.racha)} | ${R.m2k} |`);
const CAB=()=>{console.log("| variante | días | $/año | % | peor día | p5 | PEOR RACHA | <−2k |");console.log("|---|---|---|---|---|---|---|---|");};

console.log("\n═══ 1. REPRODUCCIÓN ═══");CAB();linea("base",base);
const FG20=fueraSerie(S.map(x=>x.zona),0.20,"bajo");
linea("GEX rod 20%",aplicar(FG20,0,50));
linea("GEX rod 20% + créd≥2",aplicar(FG20,2,50));
linea("GEX rod 20% + créd≥2 + ala40",aplicar(FG20,2,40));

// ── 2. SENSIBILIDAD DEL UMBRAL ──────────────────────────────────────────────────────────
console.log("\n═══ 2. UMBRAL q DEL FILTRO GEX (±20% y más) ═══");CAB();
for(const q of [0.10,0.14,0.16,0.18,0.20,0.22,0.24,0.26,0.30,0.35,0.40]){
 const F=fueraSerie(S.map(x=>x.zona),q,"bajo");
 linea(`q=${(q*100).toFixed(0)}% (solo GEX)`,aplicar(F,0,50));}
console.log("\n   ── con crédito ≥ $2 ──");CAB();
for(const q of [0.10,0.16,0.20,0.24,0.30,0.40]){
 const F=fueraSerie(S.map(x=>x.zona),q,"bajo");
 linea(`q=${(q*100).toFixed(0)}% + créd≥2`,aplicar(F,2,50));}
console.log("\n═══ 2b. SUELO DE CRÉDITO (±20%) ═══");CAB();
for(const c of [0,1,1.5,1.6,1.8,2,2.2,2.4,2.5,3,4]) linea(`GEX20 + créd≥$${c}`,aplicar(FG20,c,50));
console.log("\n═══ 2c. VENTANA RODANTE ═══");CAB();
for(const v of [30,40,60,80,120,250]){const F=fueraSerie(S.map(x=>x.zona),0.20,"bajo",v,Math.min(30,Math.floor(v/2)));
 linea(`ventana ${v}d`,aplicar(F,2,50));}
