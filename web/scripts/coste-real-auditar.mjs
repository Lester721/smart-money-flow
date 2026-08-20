import { readFileSync } from "node:fs";
const F = JSON.parse(readFileSync("scripts/coste-real-base.json","utf8")).sort((a,b)=>a.fecha.localeCompare(b.fecha));
const eur = x => (x<0?"−":"")+"$"+Math.abs(Math.round(x)).toLocaleString("es-ES");

console.log("═══ los 25 primeros días de 2022, pata por pata ═══");
console.log("| fecha | spot 11:00 | call vend/comp | put vend/comp | crédito | cierre | mov | P&L |");
console.log("|---|---|---|---|---|---|---|---|");
for (const f of F.slice(0,25))
  console.log(`| ${f.fecha} | ${f.spot.toFixed(1)} | ${f.kCorC}/${f.kLarC} | ${f.kCorP}/${f.kLarP} | ${eur(f.credito*100)} | ${f.cierre.toFixed(1)} | ${f.zMovTarde.toFixed(2)}% | ${eur(f.pl)} |`);

// acumulado mensual, 1 contrato
console.log("\n═══ acumulado por MES, 1 contrato ═══");
const mes = {}; for (const f of F) { const m=f.fecha.slice(0,7); (mes[m] ??= []).push(f.pl); }
let acc=0; const filas=[];
for (const m of Object.keys(mes).sort()) { const s=mes[m].reduce((a,b)=>a+b,0); acc+=s; filas.push([m,mes[m].length,s,acc]); }
// sólo los peores 12 meses y los mejores 5
const ord=[...filas].sort((a,b)=>a[2]-b[2]);
console.log("PEORES 12 meses:"); for (const r of ord.slice(0,12)) console.log(`  ${r[0]}  n=${r[1]}  ${eur(r[2]).padStart(9)}   acum ${eur(r[3])}`);
console.log("MEJORES 5 meses:"); for (const r of ord.slice(-5).reverse()) console.log(`  ${r[0]}  n=${r[1]}  ${eur(r[2]).padStart(9)}   acum ${eur(r[3])}`);

// la peor racha exacta de 1 contrato
let pico=0,a2=0,peor=0,ini=null,fin=null,iniCand=F[0].fecha;
for (const f of F){ a2+=f.pl; if(a2>pico){pico=a2;iniCand=f.fecha;} const dd=a2-pico; if(dd<peor){peor=dd;ini=iniCand;fin=f.fecha;} }
console.log(`\npeor racha 1 contrato: ${eur(peor)} desde ${ini} hasta ${fin}`);

// distribución de pérdidas
const pl=F.map(f=>f.pl).sort((a,b)=>a-b);
console.log(`\ndías con pérdida total (< −$4.000): ${F.filter(f=>f.pl<-4000).length} de ${F.length} (${(F.filter(f=>f.pl<-4000).length/F.length*100).toFixed(1)}%)`);
console.log(`por año:`, ["2022","2023","2024","2025","2026"].map(a=>`${a}:${F.filter(f=>f.fecha.startsWith(a)&&f.pl<-4000).length}/${F.filter(f=>f.fecha.startsWith(a)).length}`).join("  "));
console.log(`días rotos (call o put dentro): ${F.filter(f=>f.zRotoC||f.zRotoP).length} (${(F.filter(f=>f.zRotoC||f.zRotoP).length/F.length*100).toFixed(1)}%)`);
console.log(`por año:`, ["2022","2023","2024","2025","2026"].map(a=>{const g=F.filter(f=>f.fecha.startsWith(a));return `${a}:${(g.filter(f=>f.zRotoC||f.zRotoP).length/g.length*100).toFixed(0)}%`}).join("  "));

// ¿cuánto vale ±25 puntos en SIGMAS de la sesión restante?
console.log("\n═══ ±25 puntos medido en la volatilidad que la propia cadena declara a las 11:00 ═══");
console.log("| año | IV atm media | σ restante (5h, pts) | 25 pts en σ | % de días rotos |");
console.log("|---|---|---|---|---|");
for (const a of ["2022","2023","2024","2025","2026"]) {
  const g=F.filter(f=>f.fecha.startsWith(a)); if(!g.length) continue;
  const iv=g.reduce((x,y)=>x+y.ivAtm,0)/g.length;
  const sig=g.reduce((x,y)=>x+y.spot*(y.ivAtm/100)*Math.sqrt(5/6.5/252),0)/g.length;
  console.log(`| ${a} | ${iv.toFixed(1)}% | ${sig.toFixed(1)} | ${(25/sig).toFixed(2)}σ | ${(g.filter(f=>f.zRotoC||f.zRotoP).length/g.length*100).toFixed(0)}% |`);
}
