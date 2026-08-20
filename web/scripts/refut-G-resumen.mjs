import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos.ts";
const { filas } = JSON.parse(readFileSync("scripts/tend-filas.json","utf8"));
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
const eur=x=>`$${Math.round(x).toLocaleString("es-ES")}`;
const P=(v,q)=>v[Math.min(v.length-1,Math.max(0,Math.round((v.length-1)*q)))];
function met(per,pasa){const pls=[];let ac=0,pi=0,pe=0;
 for(const f of per){const ok=pasa(f);const p=ok?f.pl:0;if(ok)pls.push(f.pl);ac+=p;pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
 const o=pls.slice().sort((a,b)=>a-b),k5=Math.max(1,Math.floor(pls.length*0.05));
 return{nOp:pls.length,pctOp:pls.length/per.length,ano:pls.reduce((a,b)=>a+b,0)/(per.length/252),peorRacha:pe,
  peorDia:o.length?o[0]:0,p5:o.length?P(o,0.05):0,es5:o.length?o.slice(0,k5).reduce((a,b)=>a+b,0)/k5:0};}
const ge=(N,u)=>(f=>f["d"+N]*100>=u), banda=(N,lo,hi)=>(f=>{const d=f["d"+N]*100;return d>=lo&&d<=hi;});
const oosR = f => f.fecha<"2024-01-01" ? banda(25,1.5,5)(f) : ge(50,1)(f);
const sin22=filas.filter(f=>!f.fecha.startsWith("2022"));
const b=met(filas,()=>true), m=met(filas,oosR), b2=met(sin22,()=>true), m2=met(sin22,oosR);
console.log(`OOS honesta TODO      : ${eur(m.ano)}/año (base ${eur(b.ano)}) → Δ ${eur(m.ano-b.ano)}/año · racha ${eur(m.peorRacha)} vs ${eur(b.peorRacha)}`);
console.log(`OOS honesta SIN 2022  : ${eur(m2.ano)}/año (base ${eur(b2.ano)}) → Δ ${eur(m2.ano-b2.ano)}/año · racha ${eur(m2.peorRacha)} vs ${eur(b2.peorRacha)} · Δp5 ${eur(m2.p5-b2.p5)} · ΔES5 ${eur(m2.es5-b2.es5)}`);
console.log(`   días sin 2022: ${sin22.length} · años ${(sin22.length/252).toFixed(2)}`);
console.log(`listonT(4904)=${listonT(4904)} · listonT(1)=${listonT(1)}`);
// z equivalente de un percentil
const z=p=>{ // inversa normal aprox (Acklam)
  const a=[-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00];
  const bb=[-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01];
  const c=[-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00];
  const d=[7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00];
  const pl=0.02425; let q,r;
  if(p<pl){q=Math.sqrt(-2*Math.log(p));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  if(p<=1-pl){q=p-0.5;r=q*q;return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((bb[0]*r+bb[1])*r+bb[2])*r+bb[3])*r+bb[4])*r+1);}
  q=Math.sqrt(-2*Math.log(1-p));return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);};
for(const [et,p] of [["Δracha A→B",0.785],["Δracha B→A",0.930],["Δracha B→A (exp. igualada)",0.922],["Δp5 A→B",0.975],["Δp5 B→A",0.980],["ΔES5 A→B",0.960],["Δingreso A→B",0.970],["Δingreso B→A",0.610]])
  console.log(`   percentil ${(p*100).toFixed(1)}% → z equivalente ${z(p).toFixed(2)}`);
