// REFUTACIÓN · F — la cola año a año (lo único que sobrevivió al nulo) y la caja de enero de 2022.
import { readFileSync } from "node:fs";
const { filas } = JSON.parse(readFileSync("scripts/tend-filas.json","utf8"));
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
const eur=x=>`$${Math.round(x).toLocaleString("es-ES")}`;
const P=(v,q)=>v[Math.min(v.length-1,Math.max(0,Math.round((v.length-1)*q)))];
function met(per,pasa){ const pls=[]; let ac=0,pi=0,pe=0;
  for(const f of per){const ok=pasa(f);const p=ok?f.pl:0;if(ok)pls.push(f.pl);ac+=p;pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
  const o=pls.slice().sort((a,b)=>a-b),k5=Math.max(1,Math.floor(pls.length*0.05));
  return{nOp:pls.length,pctOp:pls.length/per.length,ano:pls.reduce((a,b)=>a+b,0)/(per.length/252),
    peorRacha:pe,peorDia:o.length?o[0]:0,p5:o.length?P(o,0.05):0,es5:o.length?o.slice(0,k5).reduce((a,b)=>a+b,0)/k5:0,
    n2000:pls.filter(x=>x<=-2000).length}; }
const ge=(N,u)=>(f=>f["d"+N]*100>=u);
const banda=(N,lo,hi)=>(f=>{const d=f["d"+N]*100;return d>=lo&&d<=hi;});

console.log("═".repeat(112));
console.log("TEST 5 · AÑO A AÑO — sobre la ÚNICA métrica que sobrevivió al nulo con re-elección: la COLA (p5 / ES5)");
console.log("═".repeat(112));
for(const [nom,r] of [["MA50≥1% (elegida en A)",ge(50,1)],["MA25[1.5,5] (elegida en B)",banda(25,1.5,5)],["MA30≥1% (titular)",ge(30,1)]]){
  console.log(`\n  ── ${nom} ──`);
  console.log("   | año | opera | base p5 | filtro p5 | Δp5 | base ES5 | filtro ES5 | ΔES5 | base peorDía | filtro peorDía |");
  let okp5=0, okes5=0, okpd=0, tot=0;
  for(const a of ["2022","2023","2024","2025","2026"]){
    const g=filas.filter(f=>f.fecha.startsWith(a)); const b=met(g,()=>true), m=met(g,r); tot++;
    if(m.p5>b.p5) okp5++; if(m.es5>b.es5) okes5++; if(m.peorDia>b.peorDia) okpd++;
    console.log(`   | ${a} | ${(m.pctOp*100).toFixed(0)}% | ${eur(b.p5)} | ${eur(m.p5)} | ${eur(m.p5-b.p5)} | ${eur(b.es5)} | ${eur(m.es5)} | ${eur(m.es5-b.es5)} | ${eur(b.peorDia)} | ${eur(m.peorDia)} |`);
  }
  console.log(`   → p5 mejora en ${okp5}/${tot} años · ES5 en ${okes5}/${tot} · peor día en ${okpd}/${tot}`);
}

console.log("\n"+"═".repeat(112));
console.log("LA SERIE FUERA DE MUESTRA HONESTA (A con la regla de B, B con la regla de A) — año a año");
console.log("═".repeat(112));
const oosR = f => f.fecha<"2024-01-01" ? banda(25,1.5,5)(f) : ge(50,1)(f);
console.log("   | año | opera | Δ$/año | Δracha | Δp5 | ΔES5 | Δpeor día |");
for(const a of ["2022","2023","2024","2025","2026"]){
  const g=filas.filter(f=>f.fecha.startsWith(a)); const b=met(g,()=>true), m=met(g,oosR);
  console.log(`   | ${a} | ${(m.pctOp*100).toFixed(0)}% | ${eur(m.ano-b.ano)} | ${eur(m.peorRacha-b.peorRacha)} | ${eur(m.p5-b.p5)} | ${eur(m.es5-b.es5)} | ${eur(m.peorDia-b.peorDia)} |`);
}
const bT=met(filas,()=>true), mT=met(filas,oosR);
console.log(`   TOTAL 1.121 días: Δ${eur(mT.ano-bT.ano)}/año · Δracha ${eur(mT.peorRacha-bT.peorRacha)} · Δp5 ${eur(mT.p5-bT.p5)} · ΔES5 ${eur(mT.es5-bT.es5)} · peor día ${eur(mT.peorDia)} vs ${eur(bT.peorDia)}`);
console.log(`   sobre la cuenta de $56.389: base ${((bT.ano/56389)*100).toFixed(1)}%/año · OOS ${((mT.ano/56389)*100).toFixed(1)}%/año`);

console.log("\n"+"═".repeat(112));
console.log("LA CAJA DE ENERO-MARZO 2022 (donde vive el titular «ninguna llamada de margen»)");
console.log("   efectivo de partida $7.977 · pérdidas del cóndor salen del EFECTIVO");
console.log("═".repeat(112));
const ene = filas.filter(f=>f.fecha>="2022-01-03"&&f.fecha<="2022-04-01");
for(const [nom,r] of [["SIN FILTRO",()=>true],["MA30≥1% (titular, DENTRO de muestra)",ge(30,1)],["MA25[1.5,5] (la regla FUERA de muestra)",banda(25,1.5,5)],["MA50≥1%",ge(50,1)]]){
  let caja=7977, minCaja=7977, minF="", op=0;
  for(const f of ene){ if(r(f)){ caja+=f.pl; op++; if(caja<minCaja){minCaja=caja;minF=f.fecha;} } }
  console.log(`   ${nom.padEnd(40)} opera ${String(op).padStart(3)}/${ene.length} · caja mínima ${eur(minCaja)} el ${minF||"—"} · caja final ${eur(caja)}`);
}
