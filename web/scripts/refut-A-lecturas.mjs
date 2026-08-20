// REFUTACIÓN · A — auditoría de fuga y lectura literal de lo afirmado.
import { readFileSync } from "node:fs";
const { filas, largos } = JSON.parse(readFileSync("scripts/tend-filas.json","utf8"));
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
const eur=x=>`$${Math.round(x).toLocaleString("es-ES")}`;
const P=(v,q)=>v[Math.min(v.length-1,Math.max(0,Math.round((v.length-1)*q)))];
const A=filas.filter(f=>f.fecha<"2024-01-01"), B=filas.filter(f=>f.fecha>="2024-01-01");

function met(per,pasa){
  const pls=[]; let ac=0,pi=0,pe=0;
  for(const f of per){ const ok=pasa(f); const p=ok?f.pl:0; if(ok)pls.push(f.pl); ac+=p; pi=Math.max(pi,ac); pe=Math.min(pe,ac-pi); }
  const o=[...pls].sort((a,b)=>a-b), k5=Math.max(1,Math.floor(pls.length*0.05));
  return { nTot:per.length, nOp:pls.length, pctOp:pls.length/per.length,
    total:pls.reduce((a,b)=>a+b,0), ano:pls.reduce((a,b)=>a+b,0)/(per.length/252),
    peorRacha:pe, peorDia:o.length?o[0]:0, p1:o.length?P(o,0.01):0, p5:o.length?P(o,0.05):0,
    es5:o.length?o.slice(0,k5).reduce((a,b)=>a+b,0)/k5:0, n2000:pls.filter(x=>x<=-2000).length };
}
const ge=(N,u)=>(f=>f["d"+N]*100>=u);
const banda=(N,lo,hi)=>(f=>{const d=f["d"+N]*100; return d>=lo&&d<=hi;});
const linea=(et,m)=>console.log(`   ${et.padEnd(34)} opera ${(m.pctOp*100).toFixed(0).padStart(3)}% · ${eur(m.ano).padStart(9)}/año · racha ${eur(m.peorRacha).padStart(9)} · peorDía ${eur(m.peorDia).padStart(7)} · p5 ${eur(m.p5).padStart(7)} · ES5 ${eur(m.es5).padStart(7)} · >$2k ${m.n2000}`);

console.log("═".repeat(110));
console.log("1) ¿QUÉ SE ELIGIÓ DE VERDAD EN CADA DIRECCIÓN, Y QUÉ NÚMEROS SE REPORTARON?");
console.log("═".repeat(110));
const bA=met(A,()=>true), bB=met(B,()=>true), bT=met(filas,()=>true);
linea("BASE A 2022-23", bA); linea("BASE B 2024-26", bB); linea("BASE TODO", bT);
console.log("");
console.log("  · Regla que el propio tend-4 elige en A→B (peor racha): MA50 ≥ 1%");
linea("     MA50≥1% en A (dentro)", met(A,ge(50,1)));
linea("     MA50≥1% en B (FUERA)", met(B,ge(50,1)));
console.log("  · Regla que el propio tend-4 elige en B→A (peor racha): MA25 en [1.5%,5%]");
linea("     MA25[1.5,5] en B (dentro)", met(B,banda(25,1.5,5)));
linea("     MA25[1.5,5] en A (FUERA)", met(A,banda(25,1.5,5)));
console.log("");
console.log("  · LA REGLA DE LA QUE SE DAN LOS TITULARES: MA30 ≥ 1% — NO la eligió ninguna dirección.");
linea("     MA30≥1% en A", met(A,ge(30,1)));
linea("     MA30≥1% en B", met(B,ge(30,1)));
linea("     MA30≥1% en TODO (titular)", met(filas,ge(30,1)));
console.log("");
console.log("  · Lo que dice el memo: MA25 ≥ +1,5% (sin banda). Se mide:");
linea("     MA25≥1.5% en B (dentro)", met(B,ge(25,1.5)));
linea("     MA25≥1.5% en A (FUERA)", met(A,ge(25,1.5)));

console.log("");
console.log("═".repeat(110));
console.log("2) LA SERIE FUERA-DE-MUESTRA HONESTA: cada período con la regla elegida en el OTRO");
console.log("═".repeat(110));
// OOS concatenada: A con la regla de B, B con la regla de A
const rA_deB = banda(25,1.5,5), rB_deA = ge(50,1);
const oos = filas.map(f => ({...f, pasa: f.fecha<"2024-01-01" ? rA_deB(f) : rB_deA(f)}));
const mOOS = met(oos, f=>f.pasa);
linea("OOS concatenada (1.121 días)", mOOS);
linea("BASE misma serie", bT);
console.log(`   Δingreso ${eur(mOOS.ano-bT.ano)}/año · Δracha ${eur(mOOS.peorRacha-bT.peorRacha)} · coste ${( (bT.ano-mOOS.ano)/(mOOS.peorRacha-bT.peorRacha) ).toFixed(3)} $ingreso/$racha`);
console.log(`   Titular del memo:  alAnoDespues $8.355 · caidaDespues −$13.647  ←  es MA30≥1% en TODO (dentro de muestra), no esto.`);

console.log("");
console.log("═".repeat(110));
console.log("5) AÑO A AÑO — con las reglas FIJAS (sin reelegir)");
console.log("═".repeat(110));
const reglas = [["MA50≥1% (elegida en A)",ge(50,1)],["MA25[1.5,5] (elegida en B)",banda(25,1.5,5)],["MA30≥1% (titular)",ge(30,1)]];
for(const [nom,r] of reglas){
  console.log(`\n  ── ${nom} ──`);
  console.log("   | año | días | opera | base $/año | filtro $/año | Δ$/año | base racha | filtro racha | Δracha |");
  for(const a of ["2022","2023","2024","2025","2026"]){
    const g=filas.filter(f=>f.fecha.startsWith(a)); if(!g.length) continue;
    const b=met(g,()=>true), m=met(g,r);
    console.log(`   | ${a} | ${g.length} | ${(m.pctOp*100).toFixed(0)}% | ${eur(b.ano)} | ${eur(m.ano)} | ${eur(m.ano-b.ano)} | ${eur(b.peorRacha)} | ${eur(m.peorRacha)} | ${eur(m.peorRacha-b.peorRacha)} |`);
  }
}
