// URGENCIA · RECON — antes de medir nada: ¿de qué está hecho el campo `side`?
// ABOVE_ASK = alguien pagó POR ENCIMA del ask. BELOW_BID = alguien vendió POR DEBAJO del bid.
// Eso no es conveniencia, es urgencia. Aquí se comprueba (a) cuánto pesa, (b) si la RUPTURA del
// 2026-07-16 lo tocó, (c) si es un artefacto de cotización rezagada.
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";

const RAIZ = path.join("scripts","cache-theta","marketsnack");
const DIR  = path.join(RAIZ,"flujo-100k");
const dias = fs.readdirSync(DIR).filter(f=>f.endsWith(".jsonl.gz")).map(f=>f.slice(0,10)).sort();
console.log(`días de flujo: ${dias.length}  (${dias[0]} → ${dias[dias.length-1]})`);

const parseOcc = (s)=>{ if(!s||s.length<16) return null;
  const k=s.slice(-8),t=s.slice(-9,-8),d=s.slice(-15,-9),u=s.slice(0,-15);
  if(!/^\d{8}$/.test(k)||!/^[CP]$/.test(t)||!/^\d{6}$/.test(d)||!u) return null;
  return { u, call: t==="C" }; };

const cnt = { antes:new Map(), despues:new Map() };
let leidas=0, sinLado=0, cruzadas=0, primaAntes=0, primaDespues=0;
// ¿ABOVE_ASK es urgencia o cotización rezagada? cuánto por encima del ask se pagó
const exceso = [];
const porHora = new Map();   // hora ET -> {n, urg}

for(const dia of dias){
  const tramo = dia < "2026-07-16" ? "antes" : "despues";
  const M = cnt[tramo];
  const ls = zlib.gunzipSync(fs.readFileSync(path.join(DIR,`${dia}.jsonl.gz`))).toString("utf8").split("\n");
  for(const l of ls){ if(!l) continue; const r=JSON.parse(l); leidas++;
    if(r.side==null){ sinLado++; continue; }
    M.set(r.side, (M.get(r.side)??0)+1);
    if(tramo==="antes") primaAntes += r.premium||0; else primaDespues += r.premium||0;
    if(r.ask_price===0 || r.bid_price===0 || (r.ask_price!=null && r.bid_price!=null && r.ask_price<r.bid_price)){ cruzadas++; continue; }
    if(r.side==="ABOVE_ASK" && r.ask_price>0 && exceso.length<200000) exceso.push((r.price-r.ask_price)/r.ask_price);
    const h = Math.floor(((Date.parse(r.timestamp)-4*3600e3)/3600e3) % 24);
    let g = porHora.get(h); if(!g){ g={n:0,urg:0}; porHora.set(h,g); }
    g.n++; if(r.side==="ABOVE_ASK"||r.side==="BELOW_BID") g.urg++;
  }
  process.stdout.write(`\r  ${dia}  ${leidas.toLocaleString("es-ES")}   `);
}
console.log(`\nleídas ${leidas.toLocaleString("es-ES")} · side nulo ${sinLado} · cotización cruzada/cero ${cruzadas.toLocaleString("es-ES")}`);

const tot=(M)=>[...M.values()].reduce((a,x)=>a+x,0);
console.log(`\n── reparto de \`side\` ANTES vs DESPUÉS del 2026-07-16 ──`);
console.log(`${"side".padEnd(12)} ${"antes".padStart(12)} ${"%".padStart(7)} ${"después".padStart(12)} ${"%".padStart(7)}`);
const claves=[...new Set([...cnt.antes.keys(),...cnt.despues.keys()])].sort();
const tA=tot(cnt.antes), tD=tot(cnt.despues);
for(const k of claves){
  const a=cnt.antes.get(k)??0, d=cnt.despues.get(k)??0;
  console.log(`${k.padEnd(12)} ${a.toLocaleString("es-ES").padStart(12)} ${((a/tA)*100).toFixed(2).padStart(6)}% ${d.toLocaleString("es-ES").padStart(12)} ${((d/tD)*100).toFixed(2).padStart(6)}%`);
}
console.log(`${"TOTAL".padEnd(12)} ${tA.toLocaleString("es-ES").padStart(12)} ${"".padStart(7)} ${tD.toLocaleString("es-ES").padStart(12)}`);

exceso.sort((a,b)=>a-b);
const P=(q)=>exceso[Math.floor(exceso.length*q)];
console.log(`\n── ¿ABOVE_ASK es urgencia de verdad? exceso (price−ask)/ask sobre ${exceso.length.toLocaleString("es-ES")} ops ──`);
console.log(`  p10 ${(P(.1)*100).toFixed(2)}% · p50 ${(P(.5)*100).toFixed(2)}% · p90 ${(P(.9)*100).toFixed(2)}% · max ${(P(.999)*100).toFixed(1)}%`);
console.log(`  fracción con exceso ≤ 0 (o sea, NO por encima del ask): ${((exceso.filter(x=>x<=0).length/exceso.length)*100).toFixed(2)}%`);

console.log(`\n── urgencia por hora ET (¿se concentra en la apertura?) ──`);
for(const h of [...porHora.keys()].sort((a,b)=>a-b)){
  const g=porHora.get(h); if(g.n<1000) continue;
  console.log(`  ${String(h).padStart(2)}h  n=${g.n.toLocaleString("es-ES").padStart(9)}  urgencia ${((g.urg/g.n)*100).toFixed(2)}%`);
}
