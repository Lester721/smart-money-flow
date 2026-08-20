// MIRAR el fichero antes de medirlo.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";
const F = JSON.parse(readFileSync("scripts/coste-real-base.json","utf8"));
const DIR = "scripts/cache-theta/gex-2026";

// ¿qué 2 días se cayeron?
const hay = new Set(F.map(f=>f.fecha));
const todas = [...new Set(readdirSync(DIR).map(f=>f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
console.log("días sin fila:", todas.filter(d=>!hay.has(d)), "→ PUT existe?", todas.filter(d=>!hay.has(d)).map(d=>existsSync(`${DIR}/iv_${d}_P.csv`)));

radiografia(F, ["credito","pl","spot","cierre","ivAtm","rangoMananaPts","recorridoPts","rvManana","movManana","riesgoMax"], "cóndor 1.121 días");

const pct=(v,q)=>{const s=[...v].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(s.length*q))];};
const eur=x=>(x<0?"−":"")+"$"+Math.abs(Math.round(x)).toLocaleString("es-ES");
console.log("\n| año | n | crédito medio | crédito p10 | acierto | P&L año/contrato | peor día | p1 | p5 | spot medio | ±25 en % |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const a of ["2022","2023","2024","2025","2026"]) {
  const g=F.filter(f=>f.fecha.startsWith(a)); if(!g.length) continue;
  const pl=g.map(f=>f.pl), cr=g.map(f=>f.credito);
  console.log(`| ${a} | ${g.length} | $${(cr.reduce((x,y)=>x+y,0)/g.length*100).toFixed(0)} | $${(pct(cr,0.1)*100).toFixed(0)} | ${(pl.filter(x=>x>0).length/g.length*100).toFixed(0)}% | ${eur(pl.reduce((x,y)=>x+y,0))} | ${eur(Math.min(...pl))} | ${eur(pct(pl,0.01))} | ${eur(pct(pl,0.05))} | ${(g.reduce((x,y)=>x+y.spot,0)/g.length).toFixed(0)} | ${(g.reduce((x,y)=>x+25/y.spot*100,0)/g.length).toFixed(2)}% |`);
}
// ¿cuántos días la pata vendida está exactamente donde debe?
const dCall = F.map(f=>f.kCorC-f.spot), dPut = F.map(f=>f.spot-f.kCorP);
console.log(`\ndistancia real de la call vendida: p5 ${pct(dCall,0.05).toFixed(1)} · p50 ${pct(dCall,0.5).toFixed(1)} · p95 ${pct(dCall,0.95).toFixed(1)} pts`);
console.log(`distancia real de la put  vendida: p5 ${pct(dPut,0.05).toFixed(1)} · p50 ${pct(dPut,0.5).toFixed(1)} · p95 ${pct(dPut,0.95).toFixed(1)} pts`);
const anchos = F.map(f=>`${f.anchoC}/${f.anchoP}`); const cA={}; for(const a of anchos) cA[a]=(cA[a]??0)+1;
console.log("anchos de ala (C/P):", Object.entries(cA).sort((a,b)=>b[1]-a[1]).slice(0,5));
const pl=F.map(f=>f.pl);
console.log(`\nTOTAL 1 contrato: ${eur(pl.reduce((a,b)=>a+b,0))} en ${F.length} días · ${eur(pl.reduce((a,b)=>a+b,0)/(F.length/252))}/año · media/día ${eur(pl.reduce((a,b)=>a+b,0)/F.length)}`);
console.log(`peor día ${eur(Math.min(...pl))} · p1 ${eur(pct(pl,0.01))} · p5 ${eur(pct(pl,0.05))} · acierto ${(pl.filter(x=>x>0).length/F.length*100).toFixed(1)}%`);
