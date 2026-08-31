// ══ ¿HAY QUE TRATAR DISTINTO A CADA TIPO DE ACCIÓN? ══ Lester, 2026-08-30
//
// Su idea: los 27 (tecnología/crecimiento) y el grupo A (defensivas) no son lo mismo, y quizá
// la entrada hundida funcione en unas y no en otras.
//
// ⚠️ POR CARACTERÍSTICA, NO POR NOMBRE. Hay 351 operaciones independientes en 51 tickers = 7
//    por acción. Con 7 datos no se calibra, se memoriza — y una regla por nombre no se puede
//    probar nunca en una acción nueva.
//    Aquí se parte por VOLATILIDAD del subyacente, que es medible de antemano y se puede
//    aplicar a un nombre que no hayas visto jamás.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const CAST=0.0138, kM=(1-CAST/2)/(1+CAST/2), NMA=50, CORTE=-0.112;
const ms=(d)=>Date.parse(d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8));
function ss(L){const P={};for(const x of L)(P[x.k]=P[x.k]||[]).push(x);const o=[];
 for(const g of Object.values(P)){let u=-1e15;for(const x of g.sort((a,b)=>a.dC.localeCompare(b.dC))){
  const t=ms(x.dC);if(t-u<180*86400000)continue;u=t;o.push(x);}}return o;}
const mm=(V)=>V.reduce((a,b)=>a+b,0)/V.length;
function t2(A,B){if(A.length<8||B.length<8)return{d:NaN,t:NaN};
 const a=mm(A),b=mm(B);
 const va=A.reduce((s,x)=>s+(x-a)**2,0)/(A.length-1),vb=B.reduce((s,x)=>s+(x-b)**2,0)/(B.length-1);
 return{d:a-b,t:(a-b)/Math.sqrt(va/A.length+vb/B.length)};}

const PREC={...JSON.parse(readFileSync(join(CACHE,"precios-ajustados.json"),"utf8")),
            ...JSON.parse(readFileSync(join(CACHE,"precios-A.json"),"utf8"))};
const PX={},IDX={},SPLIT={},VOL={};
for(const tk of Object.keys(PREC)){const D=Object.keys(PREC[tk]).sort();
 PX[tk]=D.map(d=>PREC[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
 const S=new Set(); const R=[];
 for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1];
   if(r>1.35||r<0.65){S.add(i);continue;} R.push(r-1);}
 SPLIT[tk]=S;
 const m=mm(R); VOL[tk]=Math.sqrt(R.reduce((a,x)=>a+(x-m)**2,0)/(R.length-1))*Math.sqrt(252);}
function ma50(tk,d){const i=IDX[tk]?.get(d);if(i==null||i<NMA)return null;
 for(let j=i-NMA+1;j<=i;j++)if(SPLIT[tk].has(j))return null;
 let s=0;for(let j=i-NMA;j<i;j++)s+=PX[tk][j];return PX[tk][i]/(s/NMA)-1;}

let T=[];
for(const g of ["27","A"]){const f=join(CACHE,"prof"+g+"-p25-d400.json"); if(!existsSync(f))continue;
 for(const o of JSON.parse(readFileSync(f,"utf8")).ops){const v=ma50(o.tk,o.dC); if(v==null)continue;
  T.push({k:g+"|"+o.tk,g,tk:o.tk,dC:o.dC,v,m:o.m120*kM,vol:VOL[o.tk]});}}

const TKS=[...new Set(T.map(x=>x.tk))].sort((a,b)=>VOL[a]-VOL[b]);
console.log("");
console.log("  volatilidad anual de cada acción (la que decide el grupo, medible de antemano):");
console.log("    más tranquilas: "+TKS.slice(0,6).map(t=>t+" "+(100*VOL[t]).toFixed(0)+"%").join("  "));
console.log("    más movidas:    "+TKS.slice(-6).map(t=>t+" "+(100*VOL[t]).toFixed(0)+"%").join("  "));
const c1=VOL[TKS[Math.floor(TKS.length/3)]], c2=VOL[TKS[Math.floor(2*TKS.length/3)]];
console.log("    cortes de tercio: "+(100*c1).toFixed(0)+"%  y  "+(100*c2).toFixed(0)+"%");

console.log("");
console.log("  ══ ¿la entrada hundida paga distinto según el TIPO de acción? ══  (aguante 120)");
console.log("  "+"grupo".padEnd(30)+"tickers".padStart(8)+"n".padStart(6)+
  "x dentro".padStart(10)+"x fuera".padStart(10)+"dif".padStart(9)+"t".padStart(7));
const bloque=(et,fl)=>{const D=T.filter(fl);
  const A=ss(D.filter(x=>x.v<=CORTE)),B=ss(D.filter(x=>x.v>CORTE));
  const r=t2(A.map(x=>x.m),B.map(x=>x.m));
  console.log("  "+et.padEnd(30)+String(new Set(D.map(x=>x.tk)).size).padStart(8)+
    String(A.length).padStart(6)+mm(A.map(x=>x.m)).toFixed(3).padStart(10)+
    mm(B.map(x=>x.m)).toFixed(3).padStart(10)+
    (isNaN(r.d)?"—":(r.d>=0?"+":"")+r.d.toFixed(3)).padStart(9)+
    (isNaN(r.t)?"—":r.t.toFixed(2)).padStart(7));};
bloque("TODAS", ()=>true);
console.log("  ── por volatilidad (la característica) ──");
bloque("tranquilas (tercio bajo)", x=>x.vol< c1);
bloque("medias (tercio medio)",    x=>x.vol>=c1&&x.vol<c2);
bloque("movidas (tercio alto)",    x=>x.vol>=c2);
console.log("  ── por grupo (el nombre) — para comparar ──");
bloque("los 27 (tecnología)", x=>x.g==="27");
bloque("grupo A (defensivas)", x=>x.g==="A");
console.log("  ── el cruce: ¿la volatilidad manda dentro de CADA grupo? ──");
for (const g of ["27","A"]) for (const [et,fl] of [["tranquilas",x=>x.vol<c2],["movidas",x=>x.vol>=c2]])
  bloque("  "+g+" · "+et, x=>x.g===g && fl(x));
console.log("");

// ── LA IMPLICACIÓN: si un −11,2% es 2 sigmas en PG y menos de 1 en AMD, el corte no debe ser
//    un PORCENTAJE sino DESVIACIONES. Así la regla mide lo mismo en cualquier acción, incluida
//    una que no hayas visto nunca. sigma de la media de 50 ≈ vol_anual × raíz(50/252).
const sig = (tk) => VOL[tk] * Math.sqrt(NMA/252);
const TS = T.map(x=>({...x, z: x.v / sig(x.tk)}));
console.log("  ══ EL CORTE EN DESVIACIONES, no en porcentaje ══");
console.log("  "+"corte".padEnd(30)+"n".padStart(6)+"x dentro".padStart(10)+"x fuera".padStart(10)+
  "dif".padStart(9)+"t".padStart(7)+"    sin 2020        sólo A");
for (const z of [-1.0,-1.25,-1.5,-1.75,-2.0,-2.5]) {
  const A=ss(TS.filter(x=>x.z<=z)), B=ss(TS.filter(x=>x.z>z));
  if (A.length<10) { console.log("  "+(z+" sigmas").padEnd(30)+String(A.length).padStart(6)+"  (pocas)"); continue; }
  const r=t2(A.map(x=>x.m),B.map(x=>x.m));
  const f0=(x)=>x.dC.slice(0,4)!=="2020", fa=(x)=>x.g==="A";
  const r0=t2(A.filter(f0).map(x=>x.m),B.filter(f0).map(x=>x.m));
  const ra=t2(A.filter(fa).map(x=>x.m),B.filter(fa).map(x=>x.m));
  console.log("  "+(z.toFixed(2)+" sigmas o más").padEnd(30)+String(A.length).padStart(6)+
    mm(A.map(x=>x.m)).toFixed(3).padStart(10)+mm(B.map(x=>x.m)).toFixed(3).padStart(10)+
    ((r.d>=0?"+":"")+r.d.toFixed(3)).padStart(9)+r.t.toFixed(2).padStart(7)+
    "   "+(isNaN(r0.t)?"—":((r0.d>=0?"+":"")+r0.d.toFixed(3)+" (t="+r0.t.toFixed(2)+")"))+
    "   "+(isNaN(ra.t)?"—":((ra.d>=0?"+":"")+ra.d.toFixed(3)+" (t="+ra.t.toFixed(2)+")"))); }
console.log("");
console.log("  ── y por tercio de volatilidad, con el corte en sigmas: ¿se iguala? ──");
const Z=-1.5;
for (const [et,fl] of [["tranquilas",x=>x.vol<c1],["medias",x=>x.vol>=c1&&x.vol<c2],["movidas",x=>x.vol>=c2]]) {
  const D=TS.filter(fl); const A=ss(D.filter(x=>x.z<=Z)), B=ss(D.filter(x=>x.z>Z));
  const r=t2(A.map(x=>x.m),B.map(x=>x.m));
  console.log("  "+et.padEnd(30)+String(A.length).padStart(6)+
    mm(A.map(x=>x.m)).toFixed(3).padStart(10)+mm(B.map(x=>x.m)).toFixed(3).padStart(10)+
    (isNaN(r.d)?"—":(r.d>=0?"+":"")+r.d.toFixed(3)).padStart(9)+(isNaN(r.t)?"—":r.t.toFixed(2)).padStart(7)); }
console.log("");
