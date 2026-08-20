// TENDENCIA-OTRA-VEZ · PASO 10 — el nulo con LA MÉTRICA QUE DECIDE y en las DOS direcciones.
import { readFileSync } from "node:fs";
const { filas, largos } = JSON.parse(readFileSync("scripts/tend-filas.json","utf8"));
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
const n=filas.length, iA=filas.findIndex(f=>f.fecha>="2024-01-01"), pl=filas.map(f=>f.pl);
const eur=x=>`$${Math.round(x).toLocaleString("es-ES")}`;
const P=(v,q)=>v[Math.min(v.length-1,Math.max(0,Math.round((v.length-1)*q)))];
function metR(ini,fin,mask){const pls=[];let ac=0,pi=0,pe=0;
  for(let i=ini;i<fin;i++){const p=mask[i]?pl[i]:0;if(mask[i])pls.push(pl[i]);ac+=p;pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
  const o=[...pls].sort((a,b)=>a-b),k5=Math.max(1,Math.floor(pls.length*0.05));
  return{pctOp:pls.length/(fin-ini),ano:pls.reduce((a,b)=>a+b,0)/((fin-ini)/252),peorRacha:pe,
    p5:o.length?P(o,0.05):0,es5:o.length?o.slice(0,k5).reduce((a,b)=>a+b,0)/k5:0,n2000:pls.filter(x=>x<=-2000).length};}
const T=new Array(n).fill(true), bA=metR(0,iA,T), bB=metR(iA,n,T);
const UMB=[]; for(let u=-5;u<=5.0001;u+=0.5) UMB.push(+u.toFixed(2));
const sen=largos.map(N=>filas.map(f=>f["d"+N]*100));

function corrida(desp){
  const sh=sen.map(s=>{const r=new Array(n);for(let i=0;i<n;i++)r[i]=s[(i+desp)%n];return r;});
  let AB=null, BA=null;
  for(let li=0;li<largos.length;li++) for(const u of UMB){
    const s=sh[li], mask=new Array(n); for(let i=0;i<n;i++) mask[i]= s[i]>=u;
    const mA=metR(0,iA,mask), mB=metR(iA,n,mask);
    if(mA.pctOp>=0.4 && (!AB||mA.peorRacha>AB.mA.peorRacha)) AB={li,u,mA,mB};
    if(mB.pctOp>=0.4 && (!BA||mB.peorRacha>BA.mB.peorRacha)) BA={li,u,mA,mB};
  }
  const rAB={ mejRacha: AB.mB.peorRacha-bB.peorRacha, dIng: bB.ano-AB.mB.ano, exp: AB.mB.pctOp,
              p5: AB.mB.p5-bB.p5, es5: AB.mB.es5-bB.es5 };
  rAB.coste = rAB.mejRacha>0 ? rAB.dIng/rAB.mejRacha : Infinity;
  const rBA={ mejRacha: BA.mA.peorRacha-bA.peorRacha, dIng: bA.ano-BA.mA.ano, exp: BA.mA.pctOp,
              p5: BA.mA.p5-bA.p5, es5: BA.mA.es5-bA.es5 };
  rBA.coste = rBA.mejRacha>0 ? rBA.dIng/rBA.mejRacha : Infinity;
  return { AB, BA, rAB, rBA };
}
const real=corrida(0);
console.log("═══ REAL ═══");
console.log(`  A→B: elegida MA${largos[real.AB.li]} ≥ ${real.AB.u}% · fuera de muestra opera ${(real.rAB.exp*100).toFixed(0)}% · racha mejora ${eur(real.rAB.mejRacha)} · ingreso ${real.rAB.dIng<=0?"gana":"pierde"} ${eur(Math.abs(real.rAB.dIng))}/año · p5 ${eur(real.rAB.p5)} · COSTE ${real.rAB.coste.toFixed(3)} $/$`);
console.log(`  B→A: elegida MA${largos[real.BA.li]} ≥ ${real.BA.u}% · fuera de muestra opera ${(real.rBA.exp*100).toFixed(0)}% · racha mejora ${eur(real.rBA.mejRacha)} · ingreso ${real.rBA.dIng<=0?"gana":"pierde"} ${eur(Math.abs(real.rBA.dIng))}/año · p5 ${eur(real.rBA.p5)} · COSTE ${real.rBA.coste.toFixed(3)} $/$`);

const S=300, nAB=[], nBA=[];
for(let s=0;s<S;s++){ const d=30+((Math.random()*(n-60))|0); const r=corrida(d); nAB.push(r.rAB); nBA.push(r.rBA);
  if((s+1)%50===0) process.stdout.write(`  ${s+1}/${S}\r`); }
console.log("\n");
const pctl=(arr,v)=>arr.filter(x=>x<v).length/arr.length;
function informe(nom, real, nulo){
  console.log(`═══ ${nom} — contra ${S} desplazamientos circulares ═══`);
  const campos=[["mejora de la peor racha","mejRacha",true],["ingreso perdido $/año","dIng",false],
                ["mejora del p5","p5",true],["mejora del ES5","es5",true],["días operados","exp",true]];
  console.log("  | métrica | real | nulo p50 | nulo p90 | nulo p95 | percentil del real |");
  console.log("  |---|---|---|---|---|---|");
  for(const [et,k,mayorMejor] of campos){
    const arr=nulo.map(x=>x[k]).sort((a,b)=>a-b), v=real[k];
    const p = mayorMejor ? pctl(arr,v) : 1-pctl(arr,v);
    const f = k==="exp" ? (x)=>`${(x*100).toFixed(0)}%` : eur;
    console.log(`  | ${et} | ${f(v)} | ${f(P(arr,0.5))} | ${f(P(arr,0.9))} | ${f(P(arr,0.95))} | ${(p*100).toFixed(1)}% |`);
  }
  const cost=nulo.map(x=>x.coste).filter(Number.isFinite).sort((a,b)=>a-b);
  console.log(`  | COSTE $ingreso/$racha | ${real.coste.toFixed(3)} | ${P(cost,0.5).toFixed(3)} | ${P(cost,0.1).toFixed(3)} | ${P(cost,0.05).toFixed(3)} | ${((1-pctl(cost,real.coste))*100).toFixed(1)}% |`);
  // comparar sólo contra los nulos con exposición PARECIDA (±7 puntos)
  const par=nulo.filter(x=>Math.abs(x.exp-real.exp)<=0.07);
  if(par.length>=20){
    const ai=par.map(x=>x.dIng).sort((a,b)=>a-b), ar=par.map(x=>x.mejRacha).sort((a,b)=>a-b);
    console.log(`  · sólo contra los ${par.length} nulos que operan un % de días parecido (${((real.exp-0.07)*100).toFixed(0)}–${((real.exp+0.07)*100).toFixed(0)}%):`);
    console.log(`      ingreso perdido: real ${eur(real.dIng)} · nulo p50 ${eur(P(ai,0.5))} · percentil del real ${((1-pctl(ai,real.dIng))*100).toFixed(1)}%`);
    console.log(`      mejora de racha: real ${eur(real.mejRacha)} · nulo p50 ${eur(P(ar,0.5))} · percentil del real ${(pctl(ar,real.mejRacha)*100).toFixed(1)}%`);
  } else console.log(`  · sólo ${par.length} nulos con exposición parecida — no alcanza para comparar`);
  console.log("");
}
informe("A→B (elegido en 2022-23, probado en 2024-26)", real.rAB, nAB);
informe("B→A (elegido en 2024-26, probado en 2022-23)", real.rBA, nBA);
