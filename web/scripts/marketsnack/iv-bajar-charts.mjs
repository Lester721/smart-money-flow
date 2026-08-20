// Baja la serie de precio diario (period=all, el único histórico largo de la API) de los roots
// que aparecen en el flujo y todavía no tienen serie cacheada. Educado con el servidor.
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
const BASE="https://app.marketsnack.com/api";
const C=process.env.MARKETSNACK_COOKIE; if(!C){console.log("falta MARKETSNACK_COOKIE");process.exit(1);}
const CHART=path.join("scripts","cache-theta","marketsnack","aux","chart-all");
fs.mkdirSync(CHART,{recursive:true});
const censo=JSON.parse(fs.readFileSync(path.join("scripts","cache-theta","marketsnack","censo-roots.json"),"utf8"));
const ya=new Set(fs.readdirSync(CHART).map(f=>f.replace(".json.gz","")));
const VACIO=path.join("scripts","cache-theta","marketsnack","charts-vacios.json");
const vacios=new Set(fs.existsSync(VACIO)?JSON.parse(fs.readFileSync(VACIO,"utf8")):[]);
const cand=censo.roots.filter(r=>!ya.has(r.t)&&!vacios.has(r.t)&&r.d>=40);
console.log(`candidatos ${cand.length}`);
const dormir=ms=>new Promise(r=>setTimeout(r,ms));
let ok=0,vac=0,err=0;
for(const [i,r] of cand.entries()){
  try{
    const res=await fetch(`${BASE}/assets/${encodeURIComponent(r.t)}/chart?period=all`,
      {headers:{Accept:"application/json",Cookie:C},redirect:"manual",signal:AbortSignal.timeout(45000)});
    if(res.status===429){console.log("429 — paro");break;}
    if(res.status===401||res.status===403||(res.status>=300&&res.status<400)){console.log("cookie caducada — paro");break;}
    if(res.status!==200){err++;await dormir(150);continue;}
    const j=await res.json();
    const data=j?.data??[];
    if(!data.length){vac++;vacios.add(r.t);}
    else{fs.writeFileSync(path.join(CHART,r.t+".json.gz"),zlib.gzipSync(JSON.stringify({symbol:r.t,data})));ok++;}
  }catch(e){err++;}
  if(i%40===39)console.log(`  ${i+1}/${cand.length} ok=${ok} vacios=${vac} err=${err}`);
  await dormir(150);
}
fs.writeFileSync(VACIO,JSON.stringify([...vacios]));
console.log(`FIN ok=${ok} vacios=${vac} err=${err} · vacíos: ${[...vacios].join(" ")}`);
