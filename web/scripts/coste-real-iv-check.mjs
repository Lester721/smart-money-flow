// ¿Es fiable la columna implied_vol para 0DTE? Se contrasta contra el precio del STRADDLE del
// dinero, que es un dato de mercado y no un modelo: straddle ≈ 0,7979 × σ_restante (en puntos).
import { readFileSync, existsSync } from "node:fs";
const DIR="scripts/cache-theta/gex-2026";
function atm(fecha){
  const out={};
  for(const r of ["C","P"]){
    const f=`${DIR}/iv_${fecha}_${r}.csv`; if(!existsSync(f))return null;
    const lin=readFileSync(f,"utf8").split("\n"); const fs=[];
    for(let j=1;j<lin.length;j++){ if(lin[j].length<20)continue; const c=lin[j].split(",");
      if(c[4].slice(11,16)!=="11:00")continue; const K=+c[2],b=+c[5],a=+c[9],iv=+c[8],sp=+c[13];
      if(K>0&&a>0&&sp>0)fs.push({K,b,a,mid:(b+a)/2,iv,sp}); }
    if(!fs.length)return null;
    const sp=fs[0].sp; const n=fs.reduce((x,y)=>Math.abs(y.K-sp)<Math.abs(x.K-sp)?y:x);
    out[r]={...n,sp};
  }
  return out;
}
const T=Math.sqrt((5/6.5)/252);   // 5 horas de sesión que quedan a las 11:00
console.log("| fecha | spot | straddle atm | σ implícita por PRECIO (pts) | σ por la columna implied_vol (pts) | ratio |");
console.log("|---|---|---|---|---|---|");
const ratios=[];
for(const d of ["2022-01-05","2022-06-15","2022-10-13","2023-03-13","2023-09-20","2024-04-12","2024-08-05","2025-04-07","2025-10-10","2026-04-10","2026-08-01"]){
  const a=atm(d); if(!a)continue;
  const straddle=a.C.mid+a.P.mid, sigPrecio=straddle/0.7979;
  const ivCol=(a.C.iv+a.P.iv)/2, sigCol=a.C.sp*ivCol*T;
  ratios.push(sigCol/sigPrecio);
  console.log(`| ${d} | ${a.C.sp.toFixed(0)} | ${straddle.toFixed(2)} | ${sigPrecio.toFixed(1)} | ${sigCol.toFixed(1)} | ${(sigCol/sigPrecio).toFixed(2)}x |`);
}
console.log(`\nratio medio columna/precio: ${(ratios.reduce((a,b)=>a+b,0)/ratios.length).toFixed(2)}x`);
