import fs from "node:fs";
import { TRADE_CONDITIONS } from "../../lib/conditions.ts";
const CODE=new Map(TRADE_CONDITIONS.map(c=>[c.id,c.code]));
const MULTI=new Set(["MLET","MLAT","MLCT","MLFT","CBMO","MESL","MASL","MFSL"]);
const BASE="https://app.marketsnack.com/api";
const C=fs.readFileSync(".env.local","utf8").split("\n").find(l=>l.startsWith("MARKETSNACK_COOKIE="))?.slice(19).trim();
async function lista(p){const r=await fetch(BASE+p,{headers:{Accept:"application/json",Cookie:C},redirect:"manual",signal:AbortSignal.timeout(30000)});const j=await r.json().catch(()=>({}));return {n:j.list??[],http:r.status};}
const base="/flow_feed?filter[scope]=all&period=1d";
// cada prueba: [nombre, querystring, predicado que DEBE cumplirse]
const P=/^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const dte=(s)=>{const m=P.exec(s);if(!m)return null;const v=`20${m[2]}`;return Math.round((Date.UTC(+v.slice(0,4),+v.slice(4,6)-1,+v.slice(6))-Date.now())/86400000);};
const pruebas=[
 ["premium>=1M","&filter[premium][gte]=1000000",x=>x.premium>=1e6],
 ["score>=80","&filter[score][gte]=80",x=>x.score>=80],
 ["legs=single_legs","&filter[legs][]=single_legs",x=>!MULTI.has(CODE.get(x.trade_condition_id))],
 ["legs=multi_legs","&filter[legs][]=multi_legs",x=>MULTI.has(CODE.get(x.trade_condition_id))],
 ["side=ASKSIDE","&filter[side][]=ASKSIDE",x=>x.side==="ASKSIDE"],
 ["sentiment=bullish","&filter[sentiment][]=bullish",x=>x.sentiment==="bullish"],
 ["volume_oi_ratio>=3","&filter[volume_oi_ratio][gte]=3",x=>!x.open_interest||x.volume/x.open_interest>=3],
 ["delta>=0.5","&filter[delta][gte]=0.5",x=>x.delta==null||Math.abs(x.delta)>=0.5],
 ["dte<=7","&filter[dte][lte]=7",x=>{const d=dte(x.symbol);return d==null||d<=7;}],
 ["size>=500","&filter[size][gte]=500",x=>x.size>=500],
 ["symbol=NVDA","&filter[symbol][]=NVDA",x=>x.symbol.startsWith("NVDA")],
 ["contract_type=call","&filter[contract_type]=call",x=>P.exec(x.symbol)?.[3]==="C"],
];
for(const [nom,q,ok] of pruebas){
 const {n:l,http}=await lista(base+q);
 if(!l.length){console.log(`${nom.padEnd(22)} http=${http}  VACÍO`);continue;}
 const mal=l.filter(x=>!ok(x)).length;
 const veredicto = mal===0 ? "✔ FILTRA" : mal>=l.length*0.5 ? "✗ IGNORADO" : `~ parcial`;
 console.log(`${nom.padEnd(22)} http=${http}  n=${String(l.length).padStart(3)}  violan ${String(mal).padStart(3)}/${l.length}  ${veredicto}`);
}
