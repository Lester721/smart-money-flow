import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
const DIR=path.join("scripts","cache-theta","marketsnack","flujo-100k");
const dias=fs.readdirSync(DIR).filter(f=>f.endsWith(".jsonl.gz")).map(f=>f.slice(0,10)).sort();
const parseU=(s)=>{ if(!s||s.length<16) return null; const k=s.slice(-8),t=s.slice(-9,-8),d=s.slice(-15,-9),u=s.slice(0,-15);
  if(!/^\d{8}$/.test(k)||!/^[CP]$/.test(t)||!/^\d{6}$/.test(d)||!u) return null; return u; };
const cnt=new Map();
for(const d of dias){
  const ls=zlib.gunzipSync(fs.readFileSync(path.join(DIR,`${d}.jsonl.gz`))).toString("utf8").split("\n");
  for(const l of ls){ if(!l)continue; const r=JSON.parse(l);
    const minET=(Date.parse(r.timestamp)-4*3600e3)/60000%1440; if(minET>=12*60)continue;
    const u=parseU(r.symbol); if(!u)continue; let m=cnt.get(u); if(!m){m=new Map();cnt.set(u,m);} m.set(d,(m.get(d)||0)+1); }
}
const lista=[...cnt.entries()].filter(([u,m])=>[...m.values()].filter(v=>v>=5).length>=40).map(([u])=>u).sort();
const CH=path.join("scripts","cache-theta","marketsnack","aux","chart-all");
const tienen=new Set(fs.readdirSync(CH).map(f=>f.replace(".json.gz","")));
const faltan=lista.filter(u=>!tienen.has(u));
console.log(`universo ancho ${lista.length} · faltan precio ${faltan.length}: ${faltan.join(" ")}`);
fs.writeFileSync("scripts/marketsnack/lado-faltan.json",JSON.stringify(faltan));
fs.writeFileSync("scripts/marketsnack/lado-universo-ancho.json",JSON.stringify(lista));
