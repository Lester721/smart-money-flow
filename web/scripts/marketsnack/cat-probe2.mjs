import fs from "node:fs";
import { TRADE_CONDITIONS } from "../../lib/conditions.ts";
const CODE=new Map(TRADE_CONDITIONS.map(c=>[c.id,c.code]));
const MULTI=new Set(["MLET","MLAT","MLCT","MLFT","CBMO","MESL","MASL","MFSL"]);
const BASE="https://app.marketsnack.com/api";
const C=fs.readFileSync(".env.local","utf8").split("\n").find(l=>l.startsWith("MARKETSNACK_COOKIE="))?.slice(19).trim();
async function lista(p){const r=await fetch(BASE+p,{headers:{Accept:"application/json",Cookie:C},redirect:"manual",signal:AbortSignal.timeout(30000)});const j=await r.json().catch(()=>({}));return j.list??[];}
function resumen(n,l){
 if(!l.length) return console.log(`${n.padEnd(28)} VACÍO`);
 const sc=l.map(x=>x.score).filter(x=>x!=null);
 const cond=l.map(x=>CODE.get(x.trade_condition_id));
 const multi=cond.filter(c=>MULTI.has(c)).length;
 const vo=l.filter(x=>x.open_interest>0).map(x=>x.volume/x.open_interest);
 const pr=l.map(x=>x.premium);
 console.log(`${n.padEnd(28)} n=${String(l.length).padStart(3)}  score ${sc.length?Math.min(...sc)+"–"+Math.max(...sc):"—"}  multi ${(multi/l.length*100).toFixed(0)}%  vol/OI med ${vo.length?(vo.sort((a,b)=>a-b)[Math.floor(vo.length/2)]).toFixed(2):"—"}  prima ${(Math.min(...pr)/1e3).toFixed(0)}k–${(Math.max(...pr)/1e6).toFixed(1)}M`);
}
const base="/flow_feed?filter[scope]=all&period=1d";
resumen("SIN FILTRO", await lista(base));
resumen("legs=single_legs", await lista(base+"&filter[legs][]=single_legs"));
resumen("legs=multi_legs", await lista(base+"&filter[legs][]=multi_legs"));
resumen("score>=80", await lista(base+"&filter[score][gte]=80"));
resumen("volume_oi_ratio>=2", await lista(base+"&filter[volume_oi_ratio][gte]=2"));
resumen("premium>=1M", await lista(base+"&filter[premium][gte]=1000000"));
resumen("delta>=0.5", await lista(base+"&filter[delta][gte]=0.5"));
resumen("dte<=7", await lista(base+"&filter[dte][lte]=7"));
resumen("side=ASKSIDE", await lista(base+"&filter[side][]=ASKSIDE"));
resumen("sentiment=bullish", await lista(base+"&filter[sentiment][]=bullish"));
