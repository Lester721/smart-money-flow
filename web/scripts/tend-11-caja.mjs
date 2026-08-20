// TENDENCIA-OTRA-VEZ · PASO 11 — LA CAJA DE LESTER, con precios REALES de HOOD.
// Efectivo $7.977 · 500 acciones de HOOD (precio real de cada día) · interés de margen 5%
// · colateral $5.000 por cóndor (comprobado en pantalla) · las PÉRDIDAS salen del efectivo.
// Línea de llamada: el patrimonio tiene que cubrir el mantenimiento del 30% sobre HOOD.
import { readFileSync } from "node:fs";
const { filas } = JSON.parse(readFileSync("scripts/tend-filas.json","utf8"));
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
const hood = new Map(JSON.parse(readFileSync("scripts/cache-theta/HOOD_bars_20201122_20270308.json","utf8")).map(b=>[b.time,b.close]));
const eur=x=>`$${Math.round(x).toLocaleString("es-ES")}`, pc=x=>`${(x*100).toFixed(0)}%`;
const EFECTIVO=7977, ACC=500, INT=0.05/252, MANT=0.30;
let ultimoH=null; const hoodDe=d=>{ if(hood.has(d)) ultimoH=hood.get(d); return ultimoH ?? 18.44; };

// ── ¿qué reglas del centro de la región superviviente? ──
const REGLAS = {
  "sin filtro":            ()=>true,
  "MA50 ≥ 1% (elegida en 22-23)": x=>x.d50*100>=1,
  "MA25 ≥ 1,5% (elegida en 24-26)": x=>x.d25*100>=1.5,
  "MA30 ≥ 1% (centro de la región)": x=>x.d30*100>=1,
  "MA30 ≥ 1% Y corto ≥1,10σ": x=>x.d30*100>=1 && 25/x.straddle>=1.10,
};
function caja(f, contratos){
  let efec=EFECTIVO, deuda=0, intTot=0, llamada=null, minEfec=EFECTIVO, maxDeuda=0, opera=0;
  for(const d of filas){
    const h=hoodDe(d.fecha);
    if(deuda>0){ const i=deuda*INT; deuda+=i; intTot+=i; }
    if(f(d)){
      opera++;
      const pl=d.pl*contratos;
      if(pl>=0){ if(deuda>0){ const p=Math.min(deuda,pl); deuda-=p; efec+=pl-p; } else efec+=pl; }
      else { const falta=Math.min(efec,-pl); efec-=falta; deuda+= -pl-falta; }
    }
    minEfec=Math.min(minEfec,efec-deuda); maxDeuda=Math.max(maxDeuda,deuda);
    const valorHood=ACC*h, patrimonio=efec+valorHood-deuda;
    if(!llamada && patrimonio < valorHood*MANT) llamada={fecha:d.fecha,h,patrimonio,deuda,valorHood};
  }
  return { llamada, intTot, maxDeuda, opera, efecFinal:efec-deuda };
}
console.log("═══ LA CAJA · precios REALES de HOOD, mantenimiento 30%, interés 5% ═══");
console.log("  | regla | contratos | opera | máx. prestado | interés pagado | ¿LLAMADA DE MARGEN? | caja final |");
console.log("  |---|---|---|---|---|---|---|");
for(const [nom,f] of Object.entries(REGLAS)) for(const c of [1,2,3]){
  const r=caja(f,c);
  console.log(`  | ${nom} | ${c} | ${pc(r.opera/filas.length)} | ${eur(r.maxDeuda)} | ${eur(r.intTot)} | ${r.llamada?`SÍ · ${r.llamada.fecha} (HOOD $${r.llamada.h})`:"no"} | ${eur(r.efecFinal)} |`);
}
// ── el resultado de cada regla, en dinero y en cola ──
const P=(v,q)=>v[Math.min(v.length-1,Math.max(0,Math.round((v.length-1)*q)))];
function met(f){const pls=[];let ac=0,pi=0,pe=0;
  for(const d of filas){const p=f(d)?d.pl:0; if(f(d))pls.push(d.pl); ac+=p;pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
  const o=[...pls].sort((a,b)=>a-b),k5=Math.max(1,Math.floor(pls.length*0.05));
  return{pctOp:pls.length/filas.length,total:pls.reduce((a,b)=>a+b,0),ano:pls.reduce((a,b)=>a+b,0)/(filas.length/252),
  peorRacha:pe,peorDia:o[0],p1:P(o,0.01),p5:P(o,0.05),es5:o.slice(0,k5).reduce((a,b)=>a+b,0)/k5,
  n2000:pls.filter(x=>x<=-2000).length,n4000:pls.filter(x=>x<=-4000).length};}
console.log("\n═══ RESULTADO sobre los 1.121 días · 1 contrato ═══");
console.log("  | regla | opera | $/año bruto | $/año NETO de interés | racha | p1 | p5 | ES5 | días < −$2k | días < −$4k |");
console.log("  |---|---|---|---|---|---|---|---|---|---|");
const anos=filas.length/252;
for(const [nom,f] of Object.entries(REGLAS)){
  const m=met(f), r=caja(f,1);
  console.log(`  | ${nom} | ${pc(m.pctOp)} | ${eur(m.ano)} | ${eur((m.total-r.intTot)/anos)} | ${eur(m.peorRacha)} | ${eur(m.p1)} | ${eur(m.p5)} | ${eur(m.es5)} | ${m.n2000} | ${m.n4000} |`);
}
console.log("\n═══ CRUCE de las reglas del centro (que NO son el máximo de ningún período) ═══");
const A=filas.filter(x=>x.fecha<"2024-01-01"), B=filas.filter(x=>x.fecha>="2024-01-01");
function metP(per,f){const pls=[];let ac=0,pi=0,pe=0;
  for(const d of per){const p=f(d)?d.pl:0;if(f(d))pls.push(d.pl);ac+=p;pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
  const o=[...pls].sort((a,b)=>a-b),k5=Math.max(1,Math.floor(pls.length*0.05));
  return{pctOp:pls.length/per.length,ano:pls.reduce((a,b)=>a+b,0)/(per.length/252),peorRacha:pe,
  p5:P(o,0.05),es5:o.slice(0,k5).reduce((a,b)=>a+b,0)/k5,n2000:pls.filter(x=>x<=-2000).length};}
console.log("  | regla | período | opera | $/año | base | racha | base | p5 | base | <−$2k | base |");
console.log("  |---|---|---|---|---|---|---|---|---|---|---|");
for(const [nom,f] of Object.entries(REGLAS)){
  for(const [et,per] of [["22-23",A],["24-26",B]]){
    const m=metP(per,f), b=metP(per,()=>true);
    console.log(`  | ${nom} | ${et} | ${pc(m.pctOp)} | ${eur(m.ano)} | ${eur(b.ano)} | ${eur(m.peorRacha)} | ${eur(b.peorRacha)} | ${eur(m.p5)} | ${eur(b.p5)} | ${m.n2000} | ${b.n2000} |`);
  }
}
