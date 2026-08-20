// REFUTACIÓN · B — los tres controles que deciden: umbral ±20%, azar/desplazamiento, y quitar 3 días.
import { readFileSync } from "node:fs";
const { filas } = JSON.parse(readFileSync("scripts/tend-filas.json","utf8"));
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
const eur=x=>`$${Math.round(x).toLocaleString("es-ES")}`;
const P=(v,q)=>v[Math.min(v.length-1,Math.max(0,Math.round((v.length-1)*q)))];

function metMask(pl, mask){
  let ac=0,pi=0,pe=0, s=0, nOp=0; const pls=[];
  for(let i=0;i<pl.length;i++){ const p=mask[i]?pl[i]:0; if(mask[i]){pls.push(pl[i]); s+=pl[i]; nOp++;} ac+=p; if(ac>pi)pi=ac; if(ac-pi<pe)pe=ac-pi; }
  const o=pls.slice().sort((a,b)=>a-b), k5=Math.max(1,Math.floor(nOp*0.05));
  return { nTot:pl.length, nOp, pctOp:nOp/pl.length, total:s, ano:s/(pl.length/252), peorRacha:pe,
           peorDia:nOp?o[0]:0, p5:nOp?P(o,0.05):0, es5:nOp?o.slice(0,k5).reduce((a,b)=>a+b,0)/k5:0,
           n2000:pls.filter(x=>x<=-2000).length };
}
const ge=(N,u)=>(f=>f["d"+N]*100>=u);
const banda=(N,lo,hi)=>(f=>{const d=f["d"+N]*100; return d>=lo&&d<=hi;});

const REGLAS = [
  { nom:"MA50≥1%  (elegida EN A, probada EN B)", ent:"A", f:ge(50,1),
    var20:[["−20% (≥0.8%)",ge(50,0.8)],["+20% (≥1.2%)",ge(50,1.2)]] },
  { nom:"MA25[1.5,5] (elegida EN B, probada EN A)", ent:"B", f:banda(25,1.5,5),
    var20:[["−20% ([1.2,4])",banda(25,1.2,4)],["+20% ([1.8,6])",banda(25,1.8,6)]] },
  { nom:"MA30≥1%  (el titular del memo)", ent:"TODO", f:ge(30,1),
    var20:[["−20% (≥0.8%)",ge(30,0.8)],["+20% (≥1.2%)",ge(30,1.2)]] },
];

const grupos = {
  "A 2022-23": filas.filter(f=>f.fecha<"2024-01-01"),
  "B 2024-26": filas.filter(f=>f.fecha>="2024-01-01"),
  "2022": filas.filter(f=>f.fecha.startsWith("2022")),
  "2023": filas.filter(f=>f.fecha.startsWith("2023")),
  "2024": filas.filter(f=>f.fecha.startsWith("2024")),
  "2025": filas.filter(f=>f.fecha.startsWith("2025")),
  "2026": filas.filter(f=>f.fecha.startsWith("2026")),
  "TODO": filas,
};

// ═══ TEST 2 — mover el umbral ±20% ═══
console.log("═".repeat(118));
console.log("TEST 2 · ¿SOBREVIVE SI MUEVO EL UMBRAL UN 20% ARRIBA Y ABAJO?  (en el período de PRUEBA, fuera de muestra)");
console.log("═".repeat(118));
for(const R of REGLAS){
  const pruEt = R.ent==="A" ? "B 2024-26" : R.ent==="B" ? "A 2022-23" : "TODO";
  const per = grupos[pruEt], pl = per.map(f=>f.pl);
  const base = metMask(pl, per.map(()=>true));
  console.log(`\n  ${R.nom}   ·  medido en ${pruEt}   ·   base ${eur(base.ano)}/año racha ${eur(base.peorRacha)} p5 ${eur(base.p5)}`);
  const vs = [["ORIGINAL",R.f], ...R.var20];
  for(const [et,fn] of vs){
    const m = metMask(pl, per.map(fn));
    console.log(`     ${et.padEnd(18)} opera ${(m.pctOp*100).toFixed(0).padStart(3)}% · ${eur(m.ano).padStart(9)}/año (Δ${eur(m.ano-base.ano).padStart(8)}) · racha ${eur(m.peorRacha).padStart(9)} (Δ${eur(m.peorRacha-base.peorRacha).padStart(8)}) · p5 ${eur(m.p5).padStart(7)} · peorDía ${eur(m.peorDia)}`);
  }
}

// ═══ TEST 3 — control de azar: (a) días al azar mismo recuento  (b) el MISMO patrón desplazado en círculo ═══
console.log("\n"+"═".repeat(118));
console.log("TEST 3 · ¿LE GANA AL CONTROL DE QUITAR DÍAS, O SÓLO ESTABA OPERANDO MENOS?");
console.log("   (a) 5.000 máscaras al azar con EL MISMO número de días operados");
console.log("   (b) EXHAUSTIVO: la MISMA máscara desplazada en círculo los 1.120 desplazamientos (conserva exposición Y rachas de días seguidos)");
console.log("═".repeat(118));
function azarMatched(pl, nOp, draws){
  const n=pl.length, out=[];
  for(let d=0; d<draws; d++){
    const idx=[...Array(n).keys()];
    for(let i=n-1;i>0;i--){const j=(Math.random()*(i+1))|0;[idx[i],idx[j]]=[idx[j],idx[i]];}
    const mask=new Array(n).fill(false); for(let i=0;i<nOp;i++) mask[idx[i]]=true;
    out.push(metMask(pl,mask));
  }
  return out;
}
function circular(pl, mask0){
  const n=pl.length, out=[];
  for(let k=1;k<n;k++){ const mask=new Array(n); for(let i=0;i<n;i++) mask[i]=mask0[(i+k)%n]; out.push(metMask(pl,mask)); }
  return out;
}
const pctl=(arr,v)=>arr.filter(x=>x<v).length/arr.length;
for(const R of REGLAS){
  const pruEt = R.ent==="A" ? "B 2024-26" : R.ent==="B" ? "A 2022-23" : "TODO";
  for(const et of [pruEt, "TODO"]){
    if(et===pruEt && R.ent==="TODO") continue;
    const per=grupos[et], pl=per.map(f=>f.pl), mask0=per.map(R.f);
    const real=metMask(pl,mask0);
    const az=azarMatched(pl, real.nOp, 5000), ci=circular(pl, mask0);
    console.log(`\n  ${R.nom}  ·  en ${et}  ·  opera ${(real.pctOp*100).toFixed(0)}% (${real.nOp}/${per.length})`);
    console.log("   | métrica | real | azar p50 | azar p95 | pctil real vs azar | círculo p50 | círculo p95 | PCTIL REAL vs CÍRCULO |");
    const campos=[["$/año","ano"],["peor racha","peorRacha"],["p5","p5"],["ES5","es5"],["peor día","peorDia"]];
    for(const [nom,k] of campos){
      const a=az.map(x=>x[k]).sort((x,y)=>x-y), c=ci.map(x=>x[k]).sort((x,y)=>x-y), v=real[k];
      console.log(`   | ${nom.padEnd(11)} | ${eur(v).padStart(9)} | ${eur(P(a,0.5)).padStart(9)} | ${eur(P(a,0.95)).padStart(9)} | ${(pctl(a,v)*100).toFixed(1).padStart(5)}% | ${eur(P(c,0.5)).padStart(9)} | ${eur(P(c,0.95)).padStart(9)} | ${(pctl(c,v)*100).toFixed(1).padStart(5)}% |`);
    }
  }
}

// ═══ TEST 4 — quitar los 3 días que lo sostienen ═══
console.log("\n"+"═".repeat(118));
console.log("TEST 4 · ¿LO SOSTIENEN 3 DÍAS?  Se quitan los 3 días EVITADOS con peor P&L (los que dan toda la ventaja) y se recalcula todo.");
console.log("═".repeat(118));
for(const R of REGLAS){
  const evit = filas.filter(f=>!R.f(f)).sort((a,b)=>a.pl-b.pl).slice(0,3);
  console.log(`\n  ${R.nom}`);
  console.log(`   los 3 días evitados que más pesan: ${evit.map(f=>`${f.fecha} ${eur(f.pl)}`).join(" · ")}  (suman ${eur(evit.reduce((a,b)=>a+b.pl,0))})`);
  const quita = new Set(evit.map(f=>f.fecha));
  for(const et of ["A 2022-23","B 2024-26","TODO"]){
    const per=grupos[et], per2=per.filter(f=>!quita.has(f.fecha));
    const pl=per.map(f=>f.pl), pl2=per2.map(f=>f.pl);
    const b=metMask(pl,per.map(()=>true)), m=metMask(pl,per.map(R.f));
    const b2=metMask(pl2,per2.map(()=>true)), m2=metMask(pl2,per2.map(R.f));
    console.log(`   ${et.padEnd(10)} CON los 3: Δingreso ${eur(m.ano-b.ano).padStart(9)}/año · Δracha ${eur(m.peorRacha-b.peorRacha).padStart(9)}   ||   SIN los 3: Δingreso ${eur(m2.ano-b2.ano).padStart(9)}/año · Δracha ${eur(m2.peorRacha-b2.peorRacha).padStart(9)}`);
  }
}
