import fs from "node:fs";
import { TRADE_CONDITIONS } from "../../lib/conditions.ts";
const CODE=new Map(TRADE_CONDITIONS.map(c=>[c.id,c.code]));
const MULTI=new Set(["MLET","MLAT","MLCT","MLFT","CBMO","MESL","MASL","MFSL"]);
const BASE="https://app.marketsnack.com/api";
const C=fs.readFileSync(".env.local","utf8").split("\n").find(l=>l.startsWith("MARKETSNACK_COOKIE="))?.slice(19).trim();
async function lista(p){const r=await fetch(BASE+p,{headers:{Accept:"application/json",Cookie:C},redirect:"manual",signal:AbortSignal.timeout(30000)});const j=await r.json().catch(()=>({}));return {l:j.list??[],http:r.status};}
// base CON piso de prima: así el universo SÍ contiene multi-pata (66% medido)
const base="/flow_feed?filter[scope]=all&period=1d&filter[premium][gte]=1000000&limit=100";
const cands=[
 ["(sin filtro)",""],
 ["filter[legs][]","&filter[legs][]=multi_legs"],
 ["filter[trade_structure][]","&filter[trade_structure][]=multi_legs"],
 ["filter[tradeStructure][]","&filter[tradeStructure][]=multi_legs"],
 ["filter[structure][]","&filter[structure][]=multi_legs"],
 ["filter[leg_type][]","&filter[leg_type][]=multi_legs"],
 ["filter[legs_type][]","&filter[legs_type][]=multi_legs"],
 ["filter[trade_structure]","&filter[trade_structure]=multi_legs"],
 ["SINGLE filter[trade_structure][]","&filter[trade_structure][]=single_legs"],
 ["SINGLE filter[legs][]","&filter[legs][]=single_legs"],
];
for(const [nom,q] of cands){
 const {l,http}=await lista(base+q);
 if(!l.length){console.log(`${nom.padEnd(34)} http=${http} VACÍO`);continue;}
 const m=l.filter(x=>MULTI.has(CODE.get(x.trade_condition_id))).length;
 console.log(`${nom.padEnd(34)} http=${http} n=${String(l.length).padStart(3)}  multi=${(m/l.length*100).toFixed(0)}%`);
}
