// TENDENCIA-OTRA-VEZ · PASO 8 — el mecanismo puesto a competir: ¿la MEDIA o la σ del día?
// El corto está a 25 PUNTOS fijos. En σ del día eso es mucho o poco según el régimen.
// Todo lo de aquí es observable a las 11:00 (el straddle del dinero es una cotización, no un modelo).
import { readFileSync, writeFileSync } from "node:fs";
import { tWelch, listonT } from "../lib/barreraHallazgos.ts";
const { filas } = JSON.parse(readFileSync("scripts/tend-filas.json","utf8"));
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
for (const f of filas) f.cortoSig = 25 / f.straddle;   // el corto medido en σ del propio día
const A = filas.filter(f=>f.fecha<"2024-01-01"), B = filas.filter(f=>f.fecha>="2024-01-01");
const eur=x=>`$${Math.round(x).toLocaleString("es-ES")}`, pc=x=>`${(x*100).toFixed(0)}%`;
const P=(v,q)=>v[Math.min(v.length-1,Math.max(0,Math.round((v.length-1)*q)))];
function met(per,mask){const pls=[];let ac=0,pi=0,pe=0;
  for(let i=0;i<per.length;i++){const p=mask[i]?per[i].pl:0;if(mask[i])pls.push(per[i].pl);ac+=p;pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
  const o=[...pls].sort((a,b)=>a-b),k5=Math.max(1,Math.floor(pls.length*0.05));
  return{nOp:pls.length,pctOp:pls.length/per.length,total:pls.reduce((a,b)=>a+b,0),
  ano:pls.reduce((a,b)=>a+b,0)/(per.length/252),peorRacha:pe,peorDia:o[0]??0,p1:P(o,0.01),p5:P(o,0.05),
  es5:o.slice(0,k5).reduce((a,b)=>a+b,0)/k5,n2000:pls.filter(x=>x<=-2000).length,n4000:pls.filter(x=>x<=-4000).length};}

console.log("distribución de «el corto en σ del día» (25 / straddle):");
const cs=filas.map(f=>f.cortoSig).sort((a,b)=>a-b);
console.log(`  p5 ${P(cs,0.05).toFixed(2)} · p25 ${P(cs,0.25).toFixed(2)} · p50 ${P(cs,0.5).toFixed(2)} · p75 ${P(cs,0.75).toFixed(2)} · p95 ${P(cs,0.95).toFixed(2)}`);
console.log(`  2022-23 mediana ${P(A.map(f=>f.cortoSig).sort((a,b)=>a-b),0.5).toFixed(2)} · 2024-26 mediana ${P(B.map(f=>f.cortoSig).sort((a,b)=>a-b),0.5).toFixed(2)}`);

// ═══ barrido del filtro de σ, en las dos direcciones del cruce ═══
const US=[]; for(let u=0.6;u<=1.8001;u+=0.05) US.push(+u.toFixed(2));
console.log(`\n═══ FILTRO DE σ: operar sólo si el corto está a ≥ u σ · ${US.length} umbrales ═══`);
console.log("  | u (σ) | opera A | $/año A | racha A | p5 A | opera B | $/año B | racha B | p5 B |");
console.log("  |---|---|---|---|---|---|---|---|---|");
const bA=met(A,A.map(()=>true)), bB=met(B,B.map(()=>true)), bT=met(filas,filas.map(()=>true));
for(const u of US.filter((_,i)=>i%2===0)){
  const f=x=>x.cortoSig>=u, mA=met(A,A.map(f)), mB=met(B,B.map(f));
  console.log(`  | ${u.toFixed(2)} | ${pc(mA.pctOp)} | ${eur(mA.ano)} | ${eur(mA.peorRacha)} | ${eur(mA.p5)} | ${pc(mB.pctOp)} | ${eur(mB.ano)} | ${eur(mB.peorRacha)} | ${eur(mB.p5)} |`);
}
// mejor umbral en cada período por peor racha con ≥40% de días
function mejorU(per,base){let m=null;for(const u of US){const x=met(per,per.map(y=>y.cortoSig>=u));if(x.pctOp<0.4)continue;if(!m||x.peorRacha>m.x.peorRacha)m={u,x};}return m;}
const eA=mejorU(A,bA), eB=mejorU(B,bB);
console.log(`\n  elegido en A (2022-23): u=${eA.u}σ  →  aplicado a B: ${(()=>{const m=met(B,B.map(y=>y.cortoSig>=eA.u));return `opera ${pc(m.pctOp)} · ${eur(m.ano)}/año (base ${eur(bB.ano)}) · racha ${eur(m.peorRacha)} (base ${eur(bB.peorRacha)}) · p5 ${eur(m.p5)}`})()}`);
console.log(`  elegido en B (2024-26): u=${eB.u}σ  →  aplicado a A: ${(()=>{const m=met(A,A.map(y=>y.cortoSig>=eB.u));return `opera ${pc(m.pctOp)} · ${eur(m.ano)}/año (base ${eur(bA.ano)}) · racha ${eur(m.peorRacha)} (base ${eur(bA.peorRacha)}) · p5 ${eur(m.p5)}`})()}`);

// ═══ LA COMPETENCIA ═══
const MA = x=>x.d50*100>=1;
const SIG = x=>x.cortoSig>=1.10;      // umbral elegido abajo; se comprueba el cruce aparte
console.log("\n═══ COMPETENCIA sobre los 1.121 días ═══");
console.log("  | filtro | opera | $/año | racha | peor día | p1 | p5 | ES5 | >$2k | >$4k | coste $/$ |");
console.log("  |---|---|---|---|---|---|---|---|---|---|---|");
const combos = [
  ["sin filtro", ()=>true],
  ["σ: corto ≥1,10σ", SIG],
  ["MA50 ≥ 1%", MA],
  ["σ ≥1,10σ  Y  MA50 ≥ 1%", x=>SIG(x)&&MA(x)],
  ["σ ≥1,10σ  O  MA50 ≥ 1%", x=>SIG(x)||MA(x)],
];
const g={};
for(const [n,f] of combos){const m=met(filas,filas.map(f)); g[n]=m;
  const dI=bT.ano-m.ano, dC=m.peorRacha-bT.peorRacha;
  console.log(`  | ${n} | ${pc(m.pctOp)} | ${eur(m.ano)} | ${eur(m.peorRacha)} | ${eur(m.peorDia)} | ${eur(m.p1)} | ${eur(m.p5)} | ${eur(m.es5)} | ${m.n2000} | ${m.n4000} | ${n==="sin filtro"?"—":(dI/dC).toFixed(3)} |`);}

// ═══ ¿AÑADE LA MEDIA ALGO POR ENCIMA DE LA σ? — dentro de los días que la σ ya aprueba ═══
console.log("\n═══ ¿AÑADE LA MEDIA ALGO SOBRE LA σ? — sólo entre los días que la σ ya aprueba ═══");
console.log("  | período | n con σ ok | opera MA | media/día MA sí | media/día MA no | t |");
console.log("  |---|---|---|---|---|---|");
const md=v=>v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
for(const [et,per] of [["A 22-23",A],["B 24-26",B],["TODO",filas]]){
  const s=per.filter(SIG), si=s.filter(MA).map(x=>x.pl), no=s.filter(x=>!MA(x)).map(x=>x.pl);
  console.log(`  | ${et} | ${s.length} | ${pc(si.length/s.length)} | ${eur(md(si))} | ${eur(md(no))} | ${tWelch(si,no).toFixed(2)} |`);
}
console.log("\n═══ ¿AÑADE LA σ ALGO SOBRE LA MEDIA? — sólo entre los días que la media ya aprueba ═══");
console.log("  | período | n con MA ok | opera σ | media/día σ sí | media/día σ no | t |");
console.log("  |---|---|---|---|---|---|");
for(const [et,per] of [["A 22-23",A],["B 24-26",B],["TODO",filas]]){
  const s=per.filter(MA), si=s.filter(SIG).map(x=>x.pl), no=s.filter(x=>!SIG(x)).map(x=>x.pl);
  console.log(`  | ${et} | ${s.length} | ${pc(si.length/s.length)} | ${eur(md(si))} | ${eur(md(no))} | ${tWelch(si,no).toFixed(2)} |`);
}
// ═══ el cruce del combinado ═══
console.log("\n═══ EL CRUCE del combinado (σ ≥1,10 Y MA50 ≥ 1%) ═══");
for(const [et,per,b] of [["A 22-23",A,bA],["B 24-26",B,bB]]){
  const m=met(per,per.map(x=>SIG(x)&&MA(x)));
  console.log(`  ${et}: opera ${pc(m.pctOp)} · ${eur(m.ano)}/año (base ${eur(b.ano)}) · racha ${eur(m.peorRacha)} (base ${eur(b.peorRacha)}) · p5 ${eur(m.p5)} (base ${eur(b.p5)}) · >$2k ${m.n2000} (base ${b.n2000})`);
}
console.log("\n═══ AÑO A AÑO del combinado ═══");
console.log("  | año | días | opera | $ combinado | $ base | racha combinado | racha base | >$2k |");
console.log("  |---|---|---|---|---|---|---|---|");
for(const Y of ["2022","2023","2024","2025","2026"]){
  const per=filas.filter(x=>x.fecha.startsWith(Y));
  const m=met(per,per.map(x=>SIG(x)&&MA(x))), b=met(per,per.map(()=>true));
  console.log(`  | ${Y} | ${per.length} | ${pc(m.pctOp)} | ${eur(m.total)} | ${eur(b.total)} | ${eur(m.peorRacha)} | ${eur(b.peorRacha)} | ${m.n2000}/${b.n2000} |`);
}
writeFileSync("scripts/tend-final.json", JSON.stringify({ filas: filas.map(f=>({fecha:f.fecha,pl:f.pl,d50:f.d50,cortoSig:f.cortoSig,cred:f.cred,spot11:f.spot11,cierre:f.cierre,straddle:f.straddle,ivAtm:f.ivAtm})) }));
