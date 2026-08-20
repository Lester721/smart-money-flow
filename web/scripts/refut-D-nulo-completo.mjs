// REFUTACIÓN · D — EL NULO QUE FALTABA.
// El memo desplaza la señal pero RE-ELIGE sólo entre las 336 reglas «MA_N ≥ u%».
// La búsqueda real fue de 4.704 (≥, ≤, 210 bandas, ≥σ, ≤σ). Aquí se re-elige entre LAS 4.704
// en cada desplazamiento circular, en las DOS direcciones. Es el nulo correcto: conserva la
// autocorrelación de la tendencia y sí paga el precio de haber buscado tanto.
import { readFileSync } from "node:fs";
const { filas, largos } = JSON.parse(readFileSync("scripts/tend-filas.json","utf8"));
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
const n=filas.length, iA=filas.findIndex(f=>f.fecha>="2024-01-01");
const pl=Float64Array.from(filas.map(f=>f.pl));
const eur=x=>`$${Math.round(x).toLocaleString("es-ES")}`;
const P=(v,q)=>v[Math.min(v.length-1,Math.max(0,Math.round((v.length-1)*q)))];
const UMB=[]; for(let u=-5;u<=5.0001;u+=0.5) UMB.push(+u.toFixed(2));
const SIG=[]; for(let u=-8;u<=12.0001;u+=1) SIG.push(u);
const D=largos.map(N=>Float64Array.from(filas.map(f=>f["d"+N]*100)));
const S=largos.map(N=>Float64Array.from(filas.map(f=>f["s"+N])));
const buf=new Float64Array(n);
const shift=(src,k,dst)=>{ for(let i=0;i<n;i++) dst[i]=src[(i+k)%n]; return dst; };

// base
function metRango(ini,fin,mask){ let ac=0,pi=0,pe=0,s=0,c=0;
  for(let i=ini;i<fin;i++){ if(mask[i]){s+=pl[i];c++;ac+=pl[i];} if(ac>pi)pi=ac; if(ac-pi<pe)pe=ac-pi; }
  return {nOp:c,pctOp:c/(fin-ini),ano:s/((fin-ini)/252),peorRacha:pe}; }
function colas(ini,fin,mask){ const v=[]; for(let i=ini;i<fin;i++) if(mask[i]) v.push(pl[i]);
  v.sort((a,b)=>a-b); const k5=Math.max(1,Math.floor(v.length*0.05));
  return {p5:v.length?P(v,0.05):0, es5:v.length?v.slice(0,k5).reduce((a,b)=>a+b,0)/k5:0, peorDia:v.length?v[0]:0}; }
const TODO=new Uint8Array(n).fill(1);
const bA=metRango(0,iA,TODO), bB=metRango(iA,n,TODO);
const cA=colas(0,iA,TODO), cB=colas(iA,n,TODO);
console.log(`base A ${eur(bA.ano)}/año racha ${eur(bA.peorRacha)} p5 ${eur(cA.p5)} · base B ${eur(bB.ano)}/año racha ${eur(bB.peorRacha)} p5 ${eur(cB.p5)}`);

const mask=new Uint8Array(n);
// evalúa una máscara y actualiza los dos mejores (uno por dirección de entrenamiento)
function corrida(k){
  let bestA=null, bestB=null;  // bestA: mejor peorRacha entrenando en A;  bestB: entrenando en B
  const ev=(id)=>{
    const mA=metRango(0,iA,mask), mB=metRango(iA,n,mask);
    if(mA.pctOp>=0.40 && (!bestA || mA.peorRacha>bestA.mA.peorRacha)) bestA={id,mA,mB,mask:mask.slice()};
    if(mB.pctOp>=0.40 && (!bestB || mB.peorRacha>bestB.mB.peorRacha)) bestB={id,mA,mB,mask:mask.slice()};
  };
  for(let li=0; li<largos.length; li++){
    const d=shift(D[li],k,buf).slice(), s=shift(S[li],k,new Float64Array(n));
    for(const u of UMB){ for(let i=0;i<n;i++) mask[i]=d[i]>=u?1:0; ev(`MA${largos[li]}≥${u}%`); }
    for(const u of UMB){ for(let i=0;i<n;i++) mask[i]=d[i]<=u?1:0; ev(`MA${largos[li]}≤${u}%`); }
    for(let a=0;a<UMB.length;a++) for(let b=a+1;b<UMB.length;b++){ const lo=UMB[a],hi=UMB[b];
      for(let i=0;i<n;i++) mask[i]=(d[i]>=lo&&d[i]<=hi)?1:0; ev(`MA${largos[li]}[${lo},${hi}]`); }
    for(const u of SIG){ for(let i=0;i<n;i++) mask[i]=s[i]>=u?1:0; ev(`MA${largos[li]}≥${u}σ`); }
    for(const u of SIG){ for(let i=0;i<n;i++) mask[i]=s[i]<=u?1:0; ev(`MA${largos[li]}≤${u}σ`); }
  }
  const oA=colas(iA,n,bestA.mask), oB=colas(0,iA,bestB.mask);   // métricas FUERA de muestra
  return {
    AB:{ id:bestA.id, exp:bestA.mB.pctOp, dRacha:bestA.mB.peorRacha-bB.peorRacha, dIng:bestA.mB.ano-bB.ano,
         dP5:oA.p5-cB.p5, dES5:oA.es5-cB.es5, peorDia:oA.peorDia },
    BA:{ id:bestB.id, exp:bestB.mA.pctOp, dRacha:bestB.mA.peorRacha-bA.peorRacha, dIng:bestB.mA.ano-bA.ano,
         dP5:oB.p5-cA.p5, dES5:oB.es5-cA.es5, peorDia:oB.peorDia },
  };
}
const t0=Date.now();
const real=corrida(0);
console.log(`\n═══ REAL (desplazamiento 0) ═══   [${((Date.now()-t0)/1000).toFixed(1)}s por corrida]`);
console.log(`  A→B: elegida ${real.AB.id} · fuera de muestra opera ${(real.AB.exp*100).toFixed(0)}% · Δracha ${eur(real.AB.dRacha)} · Δingreso ${eur(real.AB.dIng)}/año · Δp5 ${eur(real.AB.dP5)} · ΔES5 ${eur(real.AB.dES5)}`);
console.log(`  B→A: elegida ${real.BA.id} · fuera de muestra opera ${(real.BA.exp*100).toFixed(0)}% · Δracha ${eur(real.BA.dRacha)} · Δingreso ${eur(real.BA.dIng)}/año · Δp5 ${eur(real.BA.dP5)} · ΔES5 ${eur(real.BA.dES5)}`);

const SORT = +(process.env.SORTEOS || 200);
const nAB=[], nBA=[], usados=new Set([0]);
for(let s=0;s<SORT;s++){
  let k; do{ k = 30+((Math.random()*(n-60))|0); } while(usados.has(k)); usados.add(k);
  const r=corrida(k); nAB.push(r.AB); nBA.push(r.BA);
  process.stdout.write(`  nulo ${s+1}/${SORT} (${((Date.now()-t0)/1000).toFixed(0)}s)\r`);
}
console.log("\n");
const pctl=(arr,v)=>arr.filter(x=>x<v).length/arr.length;
function inf(nom, r, nul){
  console.log(`═══ ${nom} — contra ${SORT} desplazamientos circulares CON RE-ELECCIÓN entre las 4.704 reglas ═══`);
  console.log("  | métrica | real | nulo p50 | nulo p90 | nulo p95 | PERCENTIL DEL REAL |");
  for(const [et,k,mayorMejor] of [["Δ peor racha","dRacha",true],["Δ ingreso $/año","dIng",true],
        ["Δ p5","dP5",true],["Δ ES5","dES5",true],["días operados","exp",false]]){
    const a=nul.map(x=>x[k]).sort((x,y)=>x-y), v=r[k];
    const f=k==="exp"?(x)=>`${(x*100).toFixed(0)}%`:eur;
    console.log(`  | ${et.padEnd(15)} | ${f(v).padStart(9)} | ${f(P(a,0.5)).padStart(9)} | ${f(P(a,0.9)).padStart(9)} | ${f(P(a,0.95)).padStart(9)} | ${(pctl(a,v)*100).toFixed(1).padStart(5)}% |`);
  }
  // sólo contra nulos con exposición parecida
  const par=nul.filter(x=>Math.abs(x.exp-r.exp)<=0.07);
  if(par.length>=20){
    console.log(`  · sólo contra los ${par.length} nulos que operan un % de días parecido:`);
    for(const [et,k] of [["Δ peor racha","dRacha"],["Δ ingreso","dIng"],["Δ p5","dP5"],["Δ ES5","dES5"]]){
      const a=par.map(x=>x[k]).sort((x,y)=>x-y);
      console.log(`      ${et.padEnd(14)} real ${eur(r[k]).padStart(9)} · nulo p50 ${eur(P(a,0.5)).padStart(9)} · percentil ${(pctl(a,r[k])*100).toFixed(1)}%`);
    }
  } else console.log(`  · sólo ${par.length} nulos con exposición parecida — no alcanza`);
  console.log("");
}
inf("A→B (elige en 2022-23, prueba en 2024-26)", real.AB, nAB);
inf("B→A (elige en 2024-26, prueba en 2022-23)", real.BA, nBA);
