// ══ ¿ES ESTA LA REGLA QUE MÁS DA EN EL GRUPO A? ══ Lester, 30-ago-2026.
// Pregunta directa: el filtro de volatilidad se midió por OPERACIÓN (pool 27+A). Nunca se ha
// corrido en CARTERA sobre el grupo A. Aquí se comprueba, y se compara con lo que ya teníamos.
// NOTA: el grupo A ya está gastado como examen (se gastó esta mañana con el umbral del 3%).
// Optimizar sobre A es legítimo AHORA; el examen limpio que queda es B.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const CAP=60000, CAST=0.0138, NMA=50;
const PREC={...JSON.parse(readFileSync(join(CACHE,"precios-ajustados.json"),"utf8")),
            ...JSON.parse(readFileSync(join(CACHE,"precios-A.json"),"utf8"))};
const PX={},IDX={},SPLIT={},VOL={};
const mmv=(V)=>V.reduce((a,b)=>a+b,0)/V.length;
for(const tk of Object.keys(PREC)){const D=Object.keys(PREC[tk]).sort();
 PX[tk]=D.map(d=>PREC[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
 const S=new Set(),R=[];
 for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1];
   if(r>1.35||r<0.65){S.add(i);continue;} R.push(r-1);}
 SPLIT[tk]=S; const m=mmv(R);
 VOL[tk]=Math.sqrt(R.reduce((a,x)=>a+(x-m)**2,0)/(R.length-1))*Math.sqrt(252);}
function ma50(tk,d){const i=IDX[tk]?.get(d);if(i==null||i<NMA)return null;
 for(let j=i-NMA+1;j<=i;j++)if(SPLIT[tk].has(j))return null;
 let s=0;for(let j=i-NMA;j<i;j++)s+=PX[tk][j];return PX[tk][i]/(s/NMA)-1;}
// ⚠️ volatilidad VIVA: la de los 50 días previos a ESE día, no la de todo el período.
//    Usar la del período entero sería mirar al futuro.
function volViva(tk,d){const i=IDX[tk]?.get(d);if(i==null||i<NMA+1)return null;
 const R=[];for(let j=i-NMA+1;j<=i;j++){if(SPLIT[tk].has(j))return null;R.push(PX[tk][j]/PX[tk][j-1]-1);}
 const m=mmv(R);return Math.sqrt(R.reduce((a,x)=>a+(x-m)**2,0)/(R.length-1))*Math.sqrt(252);}

async function correr(f,{usa50,u,cm,maxVol,huecos,tam,hold=120}) {
  process.env.CAMINOS=f;
  const M=await import("./motor-cartera.mjs?k="+f+usa50+u+cm+maxVol+huecos+tam);
  const MA0=M.OPS.map(o=>o.ma);
  for(let i=0;i<M.OPS.length;i++){const o=M.OPS[i];
    const v = usa50 ? ma50(o.tk,o.dC) : MA0[i];
    let ok = v!=null && v<u && v>=-0.30;
    if (ok && maxVol) { const vv=volViva(o.tk,o.dC); ok = vv!=null && vv<maxVol; }
    o.ma = ok ? v : 999; }
  const F=[],A=[],C=[],S=[],O=[];
  for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
    const q=M.simular({tam,huecos,modo:"spy",plazo:hold,castigo:CAST,suelo:0.50,costeMin:cm,capital:cap});
    F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);}
  return {g:M.med(F),a:M.med(A),c:M.med(C),s:M.med(S),o:M.med(O),anos:M.ANOS,spy:M.spyApalancado(1)};}

const TA=["ABBV","ABT","AIG","AMAT","AMGN","AVGO","AXP","C","CVX","DAL","DE","EBAY","HON","LLY",
          "LMT","LRCX","MDT","PEP","PG","SCHW","SLB","TGT","YUM","ZTS"];
console.log("");
console.log("  volatilidad de todo el período, grupo A:");
console.log("   " + TA.filter(t=>VOL[t]).sort((a,b)=>VOL[a]-VOL[b])
  .map(t=>t+" "+(100*VOL[t]).toFixed(0)).join("  "));
console.log("   por debajo del 27%: " + TA.filter(t=>VOL[t]&&VOL[t]<0.27).length + " de " + TA.filter(t=>VOL[t]).length);
console.log("");
console.log("  ══ GRUPO A, EN CARTERA ══   (mediana de 41 capitales)");
console.log("  " + "regla".padEnd(46) + "AL AÑO".padStart(10) + "%".padStart(7) +
  "caída".padStart(8) + "Sharpe".padStart(8) + "ops".padStart(6));
const F=(et,r)=>console.log("  "+et.padEnd(46)+
  ("$"+Math.round(r.g/r.anos).toLocaleString("en-US")).padStart(10)+
  (r.a.toFixed(1)+"%").padStart(7)+("−"+r.c.toFixed(0)+"%").padStart(8)+
  r.s.toFixed(2).padStart(8)+String(Math.round(r.o)).padStart(6));

const CA="caminos-A.json", SA="sincosteA-p25-d400.json";
F("ACTUAL · media 20, bajo, $5k, 2 huecos",
  await correr(CA,{usa50:false,u:0,cm:5000,maxVol:0,huecos:2,tam:0.12}));
F("entrada nueva · media 50 −11,2% · 2 huecos",
  await correr(SA,{usa50:true,u:-0.112,cm:0,maxVol:0,huecos:2,tam:0.12}));
F("  + filtro de volatilidad < 27%",
  await correr(SA,{usa50:true,u:-0.112,cm:0,maxVol:0.27,huecos:2,tam:0.12}));
console.log("  ── con más huecos (misma exposición del 24%) ──");
for (const h of [6,10,20]) {
  F("entrada nueva · "+h+" huecos, sin filtro de vol",
    await correr(SA,{usa50:true,u:-0.112,cm:0,maxVol:0,huecos:h,tam:0.24/h}));
  F("  + filtro de volatilidad < 27%",
    await correr(SA,{usa50:true,u:-0.112,cm:0,maxVol:0.27,huecos:h,tam:0.24/h})); }
const r0=await correr(CA,{usa50:false,u:0,cm:5000,maxVol:0,huecos:2,tam:0.12});
console.log("  " + "comprar SPY y dormir".padEnd(46) +
  ("$"+Math.round((r0.spy.final-CAP)/r0.anos).toLocaleString("en-US")).padStart(10) +
  (r0.spy.cagr.toFixed(1)+"%").padStart(7) + ("−"+r0.spy.caida.toFixed(0)+"%").padStart(8) +
  r0.spy.sharpe.toFixed(2).padStart(8));
console.log("");
