import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
const DIR = path.join("scripts","cache-theta","marketsnack","flujo-100k");
const dias = fs.readdirSync(DIR).filter(f=>f.endsWith(".jsonl.gz")).map(f=>f.slice(0,10)).sort();
const parseU = (s)=>{ if(!s||s.length<16) return null; const k=s.slice(-8),t=s.slice(-9,-8),d=s.slice(-15,-9),u=s.slice(0,-15);
  if(!/^\d{8}$/.test(k)||!/^[CP]$/.test(t)||!/^\d{6}$/.test(d)||!u) return null; return u; };
// nº de ops ANTES de las 12:00 ET por (u,dia)
const cnt = new Map(); // u -> dia -> n
for(const d of dias){
  const ls = zlib.gunzipSync(fs.readFileSync(path.join(DIR,`${d}.jsonl.gz`))).toString("utf8").split("\n");
  for(const l of ls){ if(!l) continue; const r=JSON.parse(l);
    const minET = (Date.parse(r.timestamp) - 4*3600e3)/60000 % 1440;
    if(minET >= 12*60) continue;
    const u=parseU(r.symbol); if(!u) continue;
    let m=cnt.get(u); if(!m){m=new Map();cnt.set(u,m);} m.set(d,(m.get(d)||0)+1);
  }
}
for(const min of [5,10,20,30]){
  for(const diasMin of [40,60,70,80]){
    const ok=[...cnt.entries()].filter(([u,m])=>[...m.values()].filter(v=>v>=min).length>=diasMin);
    console.log(`≥${min} ops antes de 12:00 en ≥${diasMin} de 86 días → ${ok.length} subyacentes`);
  }
}
const lista=[...cnt.entries()].filter(([u,m])=>[...m.values()].filter(v=>v>=10).length>=60).map(([u])=>u).sort();
console.log(`\nLISTA (≥10 ops antes de 12:00 en ≥60 días): ${lista.length}`);
console.log(lista.join(" "));
const CH=path.join("scripts","cache-theta","marketsnack","aux","chart-all");
const tienen=new Set(fs.readdirSync(CH).map(f=>f.replace(".json.gz","")));
const faltan=lista.filter(u=>!tienen.has(u));
console.log(`\nFALTAN precio (${faltan.length}): ${faltan.join(" ")}`);
fs.writeFileSync("scripts/marketsnack/lado-universo.json", JSON.stringify({lista,faltan},null,1));
