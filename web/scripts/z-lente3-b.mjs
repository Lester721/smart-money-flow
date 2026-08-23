import { readFileSync } from "node:fs";
const L = readFileSync("scripts/z-lente3-libro.csv","utf8").trim().split("\n").slice(1)
  .map(l=>l.split(",")).filter(c=>c[9]!=="HUECO");
const dol = L.map(c=>+c[9]), ret = L.map(c=>+c[10]);
const media=v=>v.reduce((a,b)=>a+b,0)/v.length;
const tDe=v=>{const n=v.length,m=media(v);const sd=Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/(n-1));return m*Math.sqrt(n)/sd;};

console.log(`n=${dol.length}  suma=$${dol.reduce((a,b)=>a+b,0).toFixed(0)}  media=$${media(dol).toFixed(2)}`);
console.log(`t del RET (lo que titula e9) : ${tDe(ret).toFixed(2)}`);
console.log(`t de los DÓLARES (lo que se cobra): ${tDe(dol).toFixed(2)}`);

// concentración: ¿de dónde salen los $11.260?
const orden=[...dol].sort((a,b)=>b-a), tot=dol.reduce((a,b)=>a+b,0);
console.log(`\n── CONCENTRACIÓN del beneficio ──`);
for (const k of [1,2,3,5,10]) console.log(`  las ${String(k).padStart(2)} mejores operaciones suman $${orden.slice(0,k).reduce((a,b)=>a+b,0).toFixed(0)}  = ${(orden.slice(0,k).reduce((a,b)=>a+b,0)/tot*100).toFixed(0)}% del total`);
console.log(`  quitando las 3 mejores: total $${orden.slice(3).reduce((a,b)=>a+b,0).toFixed(0)}  → $/op ${media(orden.slice(3)).toFixed(2)}  → $/año ${((orden.slice(3).length/4.148)*media(orden.slice(3))).toFixed(0)}`);
console.log(`  operaciones a -100% (bid 0 o casi): ${ret.filter(x=>x<=-0.99).length} de ${ret.length} = ${(ret.filter(x=>x<=-0.99).length/ret.length*100).toFixed(1)}%`);
const bidCero = L.filter(c=>+c[8]===0).length;
console.log(`  salidas con BID EXACTAMENTE 0 (precio real, no hueco): ${bidCero}`);
// mediana
const s=[...dol].sort((a,b)=>a-b);
console.log(`  mediana $/op = $${s[s.length>>1].toFixed(0)}   (la media es $${media(dol).toFixed(0)})`);
