import fs from "node:fs";
const BASE="https://app.marketsnack.com/api";
const C=fs.readFileSync(".env.local","utf8").split("\n").find(l=>l.startsWith("MARKETSNACK_COOKIE="))?.slice(19).trim();
async function g(p){try{const r=await fetch(BASE+p,{headers:{Accept:"application/json",Cookie:C},redirect:"manual",signal:AbortSignal.timeout(30000)});
const txt=await r.text(); let j=null; try{j=JSON.parse(txt);}catch{}
const l=j?.data??j?.list??j; const n=Array.isArray(l)?l.length:(l&&typeof l==="object"?Object.keys(l).length+"k":0);
let rango="";
if(Array.isArray(l)&&l.length&&l[0]?.t) rango=` ${l[0].t.slice(0,10)}→${l[l.length-1].t.slice(0,10)}`;
return `${String(r.status).padEnd(4)} n=${String(n).padEnd(6)}${rango}  ${txt.length}b`;}catch(e){return "ERR "+String(e.message).slice(0,40);}}
const rutas=[
 ["GEX 1d (5min)","/assets/SPY/gex_stats_chart?period=1d"],
 ["GEX 1w","/assets/SPY/gex_stats_chart?period=1w"],
 ["GEX 1m","/assets/SPY/gex_stats_chart?period=1m"],
 ["GEX 3m","/assets/SPY/gex_stats_chart?period=3m"],
 ["GEX 6m","/assets/SPY/gex_stats_chart?period=6m"],
 ["GEX 1y","/assets/SPY/gex_stats_chart?period=1y"],
 ["chain_ext hoy","/assets/SPY/option_chain_extended?expiration_date=2026-09-18"],
 ["chain_ext +date","/assets/SPY/option_chain_extended?expiration_date=2026-09-18&date=2026-08-10"],
 ["premium_traded 1m","/option_contracts/SPY260918C00800000/premium_traded?period=1m"],
 ["premium_traded 1y","/option_contracts/SPY260918C00800000/premium_traded?period=1y"],
 ["trade_summaries 1d","/option_contracts/SPY260918C00800000/trade_summaries?period=1d&interval=5m"],
 ["trade_summaries 1m","/option_contracts/SPY260918C00800000/trade_summaries?period=1m&interval=1d"],
 ["wap 1y","/option_contracts/SPY260918C00800000/weighted_avg_price?period=1y"],
 ["sentiment 1y","/assets/SPY/sentiment?period=1y"],
 ["exp_premiums","/assets/SPY/expiration_premiums"],
 ["oi_by_exp","/assets/SPY/open_interest_by_expiration?expiration_date=2026-09-18"],
 ["flow 1m SPY","/flow_feed?filter[scope]=all&filter[symbol][]=SPY&period=1m"],
 ["flow volOI","/flow_feed?filter[scope]=all&period=1d&filter[volume_oi_ratio][gte]=2"],
 ["flow legs","/flow_feed?filter[scope]=all&period=1d&filter[legs][]=single_legs"],
 ["flow score","/flow_feed?filter[scope]=all&period=1d&filter[score][gte]=80"],
 ["flow cluster","/flow_feed?filter[scope]=all&period=1d&filter[preset]=large_value_cluster"],
 ["smart_counts","/flow_feed/smart_filters_trades_counts?filter[scope]=all&filter[symbol][]=SPY"],
];
for(const [n,p] of rutas) console.log(`${n.padEnd(20)} ${await g(p)}`);
