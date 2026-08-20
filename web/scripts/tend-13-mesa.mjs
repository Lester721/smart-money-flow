// TENDENCIA-OTRA-VEZ · PASO 13 — la mesa: estado de hoy, cuántas decisiones al año, y el reparto.
import { readFileSync } from "node:fs";
const { filas } = JSON.parse(readFileSync("scripts/tend-filas.json","utf8"));
const base = JSON.parse(readFileSync("scripts/tend-base.json","utf8")).filas;
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
const eur=x=>`$${Math.round(x).toLocaleString("es-ES")}`, pc=x=>`${(x*100).toFixed(0)}%`;
const R=x=>x.d30*100>=1;
console.log("═══ ESTADO EN LOS ÚLTIMOS 12 DÍAS DE DATOS ═══");
console.log("  | fecha | SPX 11:00 | MA30 (cierres hasta ayer) | distancia | ¿opera? | P&L de ese día |");
console.log("  |---|---|---|---|---|---|");
for(const f of filas.slice(-12))
  console.log(`  | ${f.fecha} | ${f.spot11.toFixed(2)} | ${(f.spot11/(1+f.d30)).toFixed(2)} | ${(f.d30*100>=0?"+":"")}${(f.d30*100).toFixed(2)}% | ${R(f)?"SÍ":"no"} | ${eur(f.pl)} |`);

let cambios=0; for(let i=1;i<filas.length;i++) if(R(filas[i])!==R(filas[i-1])) cambios++;
const runs=[]; let i=0; while(i<filas.length){let j=i;while(j<filas.length&&R(filas[j])===R(filas[i]))j++;runs.push({v:R(filas[i]),n:j-i});i=j;}
const on=runs.filter(r=>r.v).map(r=>r.n), off=runs.filter(r=>!r.v).map(r=>r.n);
const med=v=>v.slice().sort((a,b)=>a-b)[v.length>>1];
console.log(`\n═══ CUÁNTAS DECISIONES ═══`);
console.log(`  la señal cambia ${cambios} veces en ${filas.length} días = ${(cambios/(filas.length/252)).toFixed(0)} cambios al año`);
console.log(`  tramos ENCENDIDO: ${on.length}, mediana ${med(on)} días, el más largo ${Math.max(...on)}`);
console.log(`  tramos APAGADO  : ${off.length}, mediana ${med(off)} días, el más largo ${Math.max(...off)}`);

console.log(`\n═══ QUÉ SE DEJA FUERA — los 20 peores días de los 1.121 ═══`);
const peores=[...filas].sort((a,b)=>a.pl-b.pl).slice(0,20);
console.log(`  la regla APAGA ${peores.filter(x=>!R(x)).length} de los 20 peores días`);
console.log(`  suma de los 20 peores: ${eur(peores.reduce((a,b)=>a+b.pl,0))} · de los que la regla evita: ${eur(peores.filter(x=>!R(x)).reduce((a,b)=>a+b.pl,0))}`);
const mejores=[...filas].sort((a,b)=>b.pl-a.pl).slice(0,20);
console.log(`  y APAGA ${mejores.filter(x=>!R(x)).length} de los 20 MEJORES días (suma evitada ${eur(mejores.filter(x=>!R(x)).reduce((a,b)=>a+b.pl,0))})`);

console.log(`\n═══ EL REPARTO por decil de distancia a la MA30 ═══`);
const ord=[...filas].sort((a,b)=>a.d30-b.d30), k=Math.floor(filas.length/10);
console.log("  | decil | rango de distancia | n | media $/día | mediana | p5 | % días < −$2.000 |");
console.log("  |---|---|---|---|---|---|---|");
for(let d=0;d<10;d++){
  const g=ord.slice(d*k, d===9?ord.length:(d+1)*k), pls=g.map(x=>x.pl).sort((a,b)=>a-b);
  const m=pls.reduce((a,b)=>a+b,0)/pls.length;
  console.log(`  | ${d+1} | ${(g[0].d30*100).toFixed(1)}% a ${(g[g.length-1].d30*100).toFixed(1)}% | ${g.length} | ${eur(m)} | ${eur(pls[pls.length>>1])} | ${eur(pls[Math.floor(pls.length*0.05)])} | ${pc(pls.filter(x=>x<=-2000).length/pls.length)} |`);
}
