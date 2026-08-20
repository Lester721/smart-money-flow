// REFUTACIÓN · E — (a) la métrica que decide dentro del nulo, (b) el mecanismo declarado medido
// directamente, (c) quitar 2022 entero.
import { readFileSync } from "node:fs";
const { filas, largos } = JSON.parse(readFileSync("scripts/tend-filas.json","utf8"));
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
const eur=x=>`$${Math.round(x).toLocaleString("es-ES")}`;
const P=(v,q)=>v[Math.min(v.length-1,Math.max(0,Math.round((v.length-1)*q)))];
function met(per,pasa){ const pls=[]; let ac=0,pi=0,pe=0;
  for(const f of per){const ok=pasa(f);const p=ok?f.pl:0;if(ok)pls.push(f.pl);ac+=p;pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
  const o=pls.slice().sort((a,b)=>a-b),k5=Math.max(1,Math.floor(pls.length*0.05));
  return{nOp:pls.length,pctOp:pls.length/per.length,ano:pls.reduce((a,b)=>a+b,0)/(per.length/252),
    peorRacha:pe,peorDia:o.length?o[0]:0,p5:o.length?P(o,0.05):0,es5:o.length?o.slice(0,k5).reduce((a,b)=>a+b,0)/k5:0}; }
const ge=(N,u)=>(f=>f["d"+N]*100>=u);

console.log("═".repeat(112));
console.log("(b) EL MECANISMO QUE EL MEMO DECLARA, MEDIDO DIRECTAMENTE.");
console.log("    Dice: «lo que decide es la σ del día; el corto a ±25 PUNTOS está a 25/straddle sigmas».");
console.log("    Esa variable se observa a las 11:00 y NO hace falta ninguna media móvil. Si el mecanismo");
console.log("    es cierto, filtrar por ella tiene que funcionar IGUAL O MEJOR — y son 2 pruebas, no 4.704.");
console.log("═".repeat(112));
for(const f of filas) f.cortoSigma = 25 / f.straddle;
const A=filas.filter(f=>f.fecha<"2024-01-01"), B=filas.filter(f=>f.fecha>="2024-01-01");
console.log(`  mediana de «el corto en σ»:  A 2022-23 = ${P(A.map(f=>f.cortoSigma).sort((a,b)=>a-b),0.5).toFixed(3)} · B 2024-26 = ${P(B.map(f=>f.cortoSigma).sort((a,b)=>a-b),0.5).toFixed(3)}  (el memo dice 1,14 y 1,15)`);
// elegir el umbral de cortoSigma en un período (misma regla: máx peorRacha con pctOp≥0.40) y aplicarlo al otro
const UMBS=[]; for(let u=0.6;u<=2.2001;u+=0.02) UMBS.push(+u.toFixed(2));
function elegirSigma(ent,pru,etEnt,etPru){
  const bEnt=met(ent,()=>true), bPru=met(pru,()=>true);
  let best=null;
  for(const u of UMBS){ const r=f=>f.cortoSigma>=u; const m=met(ent,r);
    if(m.pctOp>=0.40 && (!best||m.peorRacha>best.m.peorRacha)) best={u,m,r}; }
  const mp=met(pru,best.r);
  console.log(`\n  elige en ${etEnt} → corto ≥ ${best.u}σ  (opera ${(best.m.pctOp*100).toFixed(0)}% · ${eur(best.m.ano)}/año · racha ${eur(best.m.peorRacha)} vs base ${eur(bEnt.peorRacha)})`);
  console.log(`     FUERA DE MUESTRA en ${etPru}: opera ${(mp.pctOp*100).toFixed(0)}% · ${eur(mp.ano)}/año (base ${eur(bPru.ano)}) · racha ${eur(mp.peorRacha)} (base ${eur(bPru.peorRacha)}) · p5 ${eur(mp.p5)} (base ${eur(bPru.p5)}) · ES5 ${eur(mp.es5)} (base ${eur(bPru.es5)})`);
  console.log(`     Δingreso ${eur(mp.ano-bPru.ano)}/año · Δracha ${eur(mp.peorRacha-bPru.peorRacha)}`);
  return {best,mp,bPru};
}
elegirSigma(A,B,"2022-23","2024-26");
elegirSigma(B,A,"2024-26","2022-23");
console.log(`\n  · Y la comparación directa contra la MA, mismo número de días, en TODO:`);
const bT=met(filas,()=>true);
const objetivo = met(filas,ge(30,1)).nOp;
const ordSig=[...filas].sort((a,b)=>b.cortoSigma-a.cortoSigma);
const corte = ordSig[objetivo-1].cortoSigma;
const mSig = met(filas, f=>f.cortoSigma>=corte);
const mMA  = met(filas, ge(30,1));
console.log(`     σ directa (corto ≥ ${corte.toFixed(3)}σ, ${mSig.nOp} días): ${eur(mSig.ano)}/año · racha ${eur(mSig.peorRacha)} · p5 ${eur(mSig.p5)} · ES5 ${eur(mSig.es5)}`);
console.log(`     MA30≥1%        (${mMA.nOp} días): ${eur(mMA.ano)}/año · racha ${eur(mMA.peorRacha)} · p5 ${eur(mMA.p5)} · ES5 ${eur(mMA.es5)}`);
console.log(`     base           (${bT.nOp} días): ${eur(bT.ano)}/año · racha ${eur(bT.peorRacha)} · p5 ${eur(bT.p5)} · ES5 ${eur(bT.es5)}`);
console.log(`     → si el mecanismo fuese la σ, la σ directa NO debería quedar por debajo. Queda ${mSig.peorRacha<mMA.peorRacha?"POR DEBAJO":"por encima"} en racha.`);
// solapamiento de las dos máscaras
const mk1=filas.map(ge(30,1)), mk2=filas.map(f=>f.cortoSigma>=corte);
let ambos=0,solo1=0,solo2=0; for(let i=0;i<filas.length;i++){ if(mk1[i]&&mk2[i])ambos++; else if(mk1[i])solo1++; else if(mk2[i])solo2++; }
console.log(`     solapamiento de las dos máscaras: ${ambos} días en las dos · ${solo1} sólo MA · ${solo2} sólo σ  → coinciden en el ${(ambos/objetivo*100).toFixed(0)}%`);

console.log("\n"+"═".repeat(112));
console.log("(c) QUITAR 2022 ENTERO — el memo admite que «el 78% de la diferencia de ingreso vive en 2022»");
console.log("    y que «todo el poder de esta prueba sale de 2022». Se rehace el cruce sin 2022.");
console.log("═".repeat(112));
const sin22 = filas.filter(f=>!f.fecha.startsWith("2022"));
const A2=sin22.filter(f=>f.fecha<"2024-01-01"), B2=sin22.filter(f=>f.fecha>="2024-01-01");
console.log(`  A' = 2023 (${A2.length} días) · B' = 2024-26 (${B2.length} días)`);
const bA2=met(A2,()=>true), bB2=met(B2,()=>true), bT2=met(sin22,()=>true);
console.log(`  base A' ${eur(bA2.ano)}/año racha ${eur(bA2.peorRacha)} · base B' ${eur(bB2.ano)}/año racha ${eur(bB2.peorRacha)} · base TODO' ${eur(bT2.ano)}/año racha ${eur(bT2.peorRacha)}`);
const banda=(N,lo,hi)=>(f=>{const d=f["d"+N]*100;return d>=lo&&d<=hi;});
for(const [nom,r] of [["MA50≥1%",ge(50,1)],["MA25[1.5,5]",banda(25,1.5,5)],["MA30≥1%",ge(30,1)]]){
  const mA2=met(A2,r), mB2=met(B2,r), mT2=met(sin22,r);
  console.log(`   ${nom.padEnd(13)} A'(2023): opera ${(mA2.pctOp*100).toFixed(0)}% Δing ${eur(mA2.ano-bA2.ano)}/año Δracha ${eur(mA2.peorRacha-bA2.peorRacha)}  |  B'(24-26): Δing ${eur(mB2.ano-bB2.ano)}/año Δracha ${eur(mB2.peorRacha-bB2.peorRacha)}  |  TODO' Δing ${eur(mT2.ano-bT2.ano)}/año Δracha ${eur(mT2.peorRacha-bT2.peorRacha)}`);
}
// re-elegir DENTRO de sin-2022, en las dos direcciones, sobre las 4.704
const UMB=[]; for(let u=-5;u<=5.0001;u+=0.5) UMB.push(+u.toFixed(2));
const SIG=[]; for(let u=-8;u<=12.0001;u+=1) SIG.push(u);
const reglas=[];
for(const N of largos){
  for(const u of UMB){ reglas.push({id:`MA${N}≥${u}%`,f:x=>x["d"+N]*100>=u}); reglas.push({id:`MA${N}≤${u}%`,f:x=>x["d"+N]*100<=u}); }
  for(let i=0;i<UMB.length;i++) for(let j=i+1;j<UMB.length;j++){const lo=UMB[i],hi=UMB[j];reglas.push({id:`MA${N}[${lo},${hi}]`,f:x=>{const d=x["d"+N]*100;return d>=lo&&d<=hi;}});}
  for(const u of SIG){ reglas.push({id:`MA${N}≥${u}σ`,f:x=>x["s"+N]>=u}); reglas.push({id:`MA${N}≤${u}σ`,f:x=>x["s"+N]<=u}); }
}
console.log(`\n  re-eligiendo entre ${reglas.length} reglas DENTRO de la muestra sin 2022:`);
for(const [ent,pru,etE,etP,bE,bP] of [[A2,B2,"2023","2024-26",bA2,bB2],[B2,A2,"2024-26","2023",bB2,bA2]]){
  let best=null;
  for(const r of reglas){ const m=met(ent,r.f); if(m.pctOp>=0.40 && (!best||m.peorRacha>best.m.peorRacha)) best={r,m}; }
  const mp=met(pru,best.r.f);
  console.log(`   elige en ${etE} → ${best.r.id}  ·  FUERA DE MUESTRA en ${etP}: opera ${(mp.pctOp*100).toFixed(0)}% · Δingreso ${eur(mp.ano-bP.ano)}/año · Δracha ${eur(mp.peorRacha-bP.peorRacha)} · Δp5 ${eur(mp.p5-bP.p5)} · ΔES5 ${eur(mp.es5-bP.es5)}`);
}
