// ¿Cuántas operaciones tiene UN DÍA ENTERO sin piso de prima? Contadas una a una.
import fs from "node:fs";
const C = fs.readFileSync(".env.local","utf8").split("\n").find(l=>l.startsWith("MARKETSNACK_COOKIE="))?.slice(19).trim();
const BASE="https://app.marketsnack.com/api";
const dormir=ms=>new Promise(r=>setTimeout(r,ms));
const DIA=process.argv[2]||"2026-08-18";
let token=null,n=0,pag=0,bytes=0;const t0=Date.now();
while(pag<3000){
  pag++;
  const q=`filter[scope]=all&filter[date][gte]=${DIA}&filter[date][lte]=${DIA}&limit=100`+(token?`&next_page_token=${token}`:"");
  const r=await fetch(`${BASE}/flow_feed?${q}`,{headers:{Accept:"application/json",Cookie:C},redirect:"manual",signal:AbortSignal.timeout(90000)});
  if(r.status!==200){console.log("HTTP",r.status,"en pag",pag);break;}
  const txt=await r.text();bytes+=txt.length;const j=JSON.parse(txt);
  n+=(j.list||[]).length;token=j.meta?.next_page_token||null;
  if(!(j.list||[]).length||!token)break;
  if(pag%200===0)console.log("  ...",pag,"pags",n,"ops",((Date.now()-t0)/1000).toFixed(0)+"s");
  await dormir(80);
}
const seg=(Date.now()-t0)/1000;
console.log(`DÍA ${DIA} SIN PISO DE PRIMA: ${n} operaciones · ${pag} páginas · ${seg.toFixed(0)}s · ${(bytes/1e6).toFixed(1)} MB · completo: ${!token}`);
if(!token) console.log(`archivo entero (85 días de mercado): ${(n*85).toLocaleString("es-ES")} ops · ${(seg*85/60).toFixed(0)} min · ${(bytes*85/1e9).toFixed(1)} GB`);
