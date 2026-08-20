// RECONOCIMIENTO del ingrediente LADO — mirar el fichero ANTES de medir.
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
const DIR = path.join("scripts","cache-theta","marketsnack","flujo-100k");
const dias = fs.readdirSync(DIR).filter(f=>f.endsWith(".jsonl.gz")).map(f=>f.slice(0,10)).sort();
console.log(`${dias.length} días  ${dias[0]} → ${dias[dias.length-1]}`);

const sideGlobal = {}, sinLado = {}, porDia = [];
const subyacentes = new Map();       // underlying -> nº operaciones
const primaPorSub = new Map();
let total=0, sinParse=0, cruzadas=0, sinPrima=0, fueraSesion=0;
const horas = new Array(24).fill(0);

const parseOcc = (s) => {
  if(!s || s.length<16) return null;
  const k=s.slice(-8), t=s.slice(-9,-8), d=s.slice(-15,-9), u=s.slice(0,-15);
  if(!/^\d{8}$/.test(k)||!/^[CP]$/.test(t)||!/^\d{6}$/.test(d)||!u) return null;
  return { u, tipo: t==="C"?"call":"put", strike:+k/1000, exp:`20${d.slice(0,2)}-${d.slice(2,4)}-${d.slice(4,6)}` };
};

for(const d of dias){
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR,`${d}.jsonl.gz`))).toString("utf8");
  const ls = txt.split("\n"); let n=0; const sd={};
  for(const l of ls){ if(!l) continue; n++; total++;
    const r = JSON.parse(l);
    sd[r.side]=(sd[r.side]||0)+1; sideGlobal[r.side]=(sideGlobal[r.side]||0)+1;
    if(r.side==null) sinLado[d]=(sinLado[d]||0)+1;
    const o = parseOcc(r.symbol); if(!o){ sinParse++; continue; }
    subyacentes.set(o.u,(subyacentes.get(o.u)||0)+1);
    primaPorSub.set(o.u,(primaPorSub.get(o.u)||0)+(r.premium||0));
    if(!(r.premium>0)) sinPrima++;
    if(r.ask_price===0 || r.bid_price===0 || (r.ask_price!=null&&r.bid_price!=null&&r.ask_price<r.bid_price)) cruzadas++;
    const ms = Date.parse(r.timestamp); const hET = new Date(ms - 4*3600e3).getUTCHours();
    horas[hET]++;
    const minET = (ms - 4*3600e3)/60000 % 1440;
    if(minET < 9*60+30 || minET > 16*60) fueraSesion++;
  }
  porDia.push({d,n});
}
console.log(`\ntotal ${total.toLocaleString()} ops · sin parsear OCC ${sinParse} · prima<=0 ${sinPrima} · cruzadas/cero ${cruzadas} · fuera de 9:30-16:00 ET ${fueraSesion} (${(100*fueraSesion/total).toFixed(2)}%)`);
console.log(`\nside global:`); for(const [k,v] of Object.entries(sideGlobal).sort((a,b)=>b[1]-a[1])) console.log(`   ${String(k).padEnd(11)} ${String(v).padStart(9)}  ${(100*v/total).toFixed(2)}%`);
console.log(`\ndías con side nulo:`, JSON.stringify(sinLado));
console.log(`\nhoras ET (nº ops):`); horas.forEach((v,i)=>{ if(v) console.log(`   ${String(i).padStart(2)}h ${String(v).padStart(9)}  ${(100*v/total).toFixed(2)}%`); });

const top = [...subyacentes.entries()].sort((a,b)=>b[1]-a[1]);
console.log(`\n${top.length} subyacentes distintos. Top 30 por nº ops:`);
for(const [u,n] of top.slice(0,30)) console.log(`   ${u.padEnd(8)} ${String(n).padStart(8)}  ${(100*n/total).toFixed(2)}%  prima $${(primaPorSub.get(u)/1e9).toFixed(2)}B`);

// ¿cuáles tienen serie de precio?
const CH = path.join("scripts","cache-theta","marketsnack","aux","chart-all");
const conPrecio = new Set(fs.readdirSync(CH).map(f=>f.replace(".json.gz","")));
const conP = top.filter(([u])=>conPrecio.has(u));
console.log(`\ncon serie de precio en caché: ${conP.length} de ${top.length} subyacentes`);
console.log(`   cubren ${(100*conP.reduce((a,x)=>a+x[1],0)/total).toFixed(1)}% de las operaciones`);
const sinP = top.filter(([u])=>!conPrecio.has(u)).slice(0,15);
console.log(`   SIN precio, top:`, sinP.map(([u,n])=>`${u}(${(100*n/total).toFixed(1)}%)`).join(" "));
fs.writeFileSync("scripts/marketsnack/lado-recon.json", JSON.stringify({dias:porDia, sideGlobal, subyacentes:top},null,1));
