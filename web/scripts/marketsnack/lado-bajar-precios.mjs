// Baja y CACHEA las series de precio que faltan para el universo del ingrediente LADO.
// /assets/{T}/chart?period=all — la única serie larga de la API. Educado con el servidor.
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
const BASE="https://app.marketsnack.com/api";
const C=process.env.MARKETSNACK_COOKIE; if(!C){console.log("✗ falta MARKETSNACK_COOKIE");process.exit(1);}
const CH=path.join("scripts","cache-theta","marketsnack","aux","chart-all");
fs.mkdirSync(CH,{recursive:true});
const dormir=(ms)=>new Promise(r=>setTimeout(r,ms));
const faltan=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
console.log(`${faltan.length} tickers por bajar`);
let ok=0, vacios=[], errores=[];
for(const T of faltan){
  const dest=path.join(CH,`${T}.json.gz`);
  if(fs.existsSync(dest)){ ok++; continue; }
  let r=null;
  for(let k=1;k<=3;k++){
    try{ r=await fetch(`${BASE}/assets/${encodeURIComponent(T)}/chart?period=all`,
      {headers:{Accept:"application/json",Cookie:C},redirect:"manual",signal:AbortSignal.timeout(60000)}); }
    catch(e){ if(k===3){errores.push([T,String(e.message).slice(0,60)]); r=null;} await dormir(1500*k); continue; }
    if(r.status===429){ console.log("⚠ 429 — paro"); process.exit(0); }
    if(r.status===401||r.status===403||(r.status>=300&&r.status<400)){ console.log(`✗ ${r.status} cookie caducada`); process.exit(1); }
    break;
  }
  if(!r||r.status!==200){ errores.push([T, r?`HTTP ${r.status}`:"red"]); await dormir(120); continue; }
  const j=await r.json().catch(()=>null);
  const d=j?.data??[];
  if(!d.length){ vacios.push(T); await dormir(120); continue; }
  fs.writeFileSync(dest, zlib.gzipSync(Buffer.from(JSON.stringify(j),"utf8"),{level:9}));
  ok++; console.log(`   ${T.padEnd(7)} ${d.length} barras  ${d[0].t.slice(0,10)} → ${d[d.length-1].t.slice(0,10)}`);
  await dormir(150);
}
console.log(`\n✓ ${ok} con serie · VACÍOS (la API no sirve precio): ${vacios.join(" ")||"—"} · errores: ${JSON.stringify(errores)}`);
