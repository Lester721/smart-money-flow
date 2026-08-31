// ¿EL DINERO GRANDE TE DICE **CUÁNDO** O TE DICE **CUÁL**?
//
// El control a ciegas dobla el 40.5%; la señal el 84.5%. Pero el control compra TODAS las semanas
// y la señal sólo cuando alguien suelta $500k — y esos golpes se amontonan en semanas movidas.
//
// Este script compara el control CONTRA SÍ MISMO, en las mismas semanas y tickers donde hubo señal:
//   · si en esas semanas el ciego también dobla el ~80%  -> el dinero grande dice **CUÁNDO**
//   · si en esas semanas el ciego sigue en ~45%          -> además dice **CUÁL**
// Las dos son ventajas. Pero se explotan de forma distinta.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const DIR=join(CACHE,"cadenas");
const ms=(d)=>Date.parse(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T00:00:00Z`);
const dteDe=(a,b)=>Math.round((ms(b)-ms(a))/86_400_000);
const semDe=(d)=>Math.floor((ms(d)-ms("20210104"))/604800000);
const OTM=0.07,DTE_OBJ=64,DTE_MIN=20,OBJ=2;
const TICKERS=["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY","TSLA"];
const dias=new Map();
for(const f of readdirSync(DIR)){const g=/^([A-Z]+)_d(\d{8})\.json$/.exec(f); if(!g)continue;
 if(!TICKERS.includes(g[1]))continue; if(g[2]<"20210101"||g[2]>"20260819")continue;
 if(!dias.has(g[1]))dias.set(g[1],[]); dias.get(g[1]).push(g[2]);}
for(const v of dias.values())v.sort();
const _c=new Map();
const cad=(t,d)=>{const k=`${t}|${d}`; if(_c.has(k))return _c.get(k); const f=join(DIR,`${t}_d${d}.json`); const v=existsSync(f)?JSON.parse(readFileSync(f,"utf8")):null; _c.set(k,v); if(_c.size>700)_c.delete(_c.keys().next().value); return v;};
function spotOk(c,hoy){ let exp=null,md=Infinity;
 for(const e of Object.keys(c)){const d=dteDe(hoy,e); if(d<1)continue; if(d<md){md=d;exp=e;}}
 if(!exp)return null; const g=c[exp]; let K=null,dm=Infinity;
 for(const cl of Object.keys(g)){ if(cl.slice(-1)!=="C")continue; const k=Number(cl.slice(0,-2)); const p=g[`${k}|P`]; if(!p)continue;
  const d=Math.abs((g[cl][0]+g[cl][1])/2-(p[0]+p[1])/2); if(d<dm){dm=d;K=k;} }
 if(K==null)return null; const C=g[`${K}|C`],P=g[`${K}|P`];
 const s=K+(C[0]+C[1])/2-(P[0]+P[1])/2; return s>0?s:null; }
/** sigue un contrato desde dC hasta exp; devuelve el múltiplo final (2 si dobló) */
function seguir(tk,dC,exp,K,l){
 const ch=cad(tk,dC); const p0=ch?.[exp]?.[`${K}|${l}`]; if(!p0||!(p0[1]>0))return null;
 const coste=p0[1], ds=dias.get(tk)??[]; let ult=null,n=0;
 for(const d of ds){ if(d<=dC)continue; if(d>exp)break;
   const p=cad(tk,d)?.[exp]?.[`${K}|${l}`]; if(!p)continue; n++;
   if(p[0]/coste>=OBJ)return {ult:OBJ,disp:true,n}; ult=p[0]/coste; }
 return n?{ult,disp:false,n}:null; }
/** el contrato ciego de ese día: 7% fuera, ~64 días */
function ciego(tk,d,l){
 const ch=cad(tk,d); if(!ch)return null; const S=spotOk(ch,d); if(!S)return null;
 let exp=null,md=Infinity;
 for(const e of Object.keys(ch)){const t=dteDe(d,e); if(t<DTE_MIN)continue; const x=Math.abs(t-DTE_OBJ); if(x<md){md=x;exp=e;}}
 if(!exp)return null; const g=ch[exp], obj=l==="C"?S*(1+OTM):S*(1-OTM);
 let K=null,dm=Infinity;
 for(const cl of Object.keys(g)){ if(cl.slice(-1)!==l)continue; const k=Number(cl.slice(0,-2));
   const x=Math.abs(k-obj); if(x<dm){dm=x;K=k;} }
 if(K==null)return null;
 const r=seguir(tk,d,exp,K,l); return r?{...r,K,exp}:null; }

// ── 1. las señales ──
const fich=readdirSync(CACHE).filter(f=>/^[A-Z]+_y_20(2[1-6])\d{4}_\d{8}\.json$/.test(f)).sort();
const U=new Map();
for(const f of fich){let c;try{c=JSON.parse(readFileSync(join(CACHE,f),"utf8"));}catch{continue;}
 if(!Array.isArray(c))continue;
 for(const op of c){ if(!((op.premium??0)>=500000))continue;
  if(!["AT_ASK","ABOVE_ASK"].includes(op.side))continue;
  if(typeof op.delta!=="number"||op.delta===0)continue;
  if(!(Math.abs(op.delta)>=0.15&&Math.abs(op.delta)<0.30))continue;
  const m=/^([A-Z]+)(\d{6})([CP])(\d{8})$/.exec(op.symbol??""); if(!m)continue;
  const [,tk,ymd,l,K8]=m; if(!TICKERS.includes(tk))continue;
  const dOp=String(op.timestamp??"").slice(0,10).replace(/-/g,"");
  const k=`${tk}|20${ymd}|${Number(K8)/1000}|${l}|${dOp}`;
  if(!U.has(k))U.set(k,{tk,e:`20${ymd}`,K:Number(K8)/1000,l,dOp}); } }

const sen=[], ctrl=[];
for(const u of U.values()){
 const ds=dias.get(u.tk)??[]; const i=ds.findIndex(d=>d>u.dOp); if(i<0)continue;
 const dC=ds[i]; if(dC>=u.e)continue;
 const r=seguir(u.tk,dC,u.e,u.K,u.l); if(!r)continue;
 sen.push({...u,dC,...r,sem:semDe(dC),ano:dC.slice(0,4)});
 // el MISMO día y el MISMO lado, pero el contrato lo elige la regla ciega
 const c=ciego(u.tk,dC,u.l);
 if(c) ctrl.push({tk:u.tk,l:u.l,dC,...c,sem:semDe(dC),ano:dC.slice(0,4)});
}
const R=(L)=>{ if(!L.length)return null; const d=L.filter(o=>o.disp).length;
 let g=0,p=0; for(const o of L){const x=1000*(o.ult-1); if(x>0)g+=x; else p+=-x;}
 return {n:L.length,d,pd:100*d/L.length,r:p?g/p:Infinity,neto:g-p}; };
const F=(nom,r)=>{ if(!r){console.log(`  ${nom.padEnd(38)}    —`);return;}
 console.log(`  ${nom.padEnd(38)} ${String(r.n).padStart(5)}   ${String(r.d).padStart(4)} (${r.pd.toFixed(1).padStart(5)}%)   ratio ${(r.r===Infinity?"∞":r.r.toFixed(2)).padStart(6)}   ${r.neto>=0?"+":"−"}$${Math.abs(Math.round(r.neto)).toLocaleString("en-US")}`);};
console.log(`\n=== MISMO DÍA, MISMO TICKER, MISMO LADO — sólo cambia QUÉ CONTRATO ===\n`);
console.log(`  ${"".padEnd(38)}     n   doblaron          ratio         neto`);
F("el contrato que compró el dinero grande", R(sen));
F("el contrato ciego (7% fuera, 64 días)", R(ctrl));
console.log(`\n  por año:`);
for(const a of ["2021","2022","2023","2024","2025","2026"]){
 const s=R(sen.filter(o=>o.ano===a)), c=R(ctrl.filter(o=>o.ano===a));
 if(s&&c) console.log(`     ${a}   señal ${s.pd.toFixed(1).padStart(5)}%  ciego ${c.pd.toFixed(1).padStart(5)}%   diferencia ${(s.pd-c.pd>=0?"+":"")}${(s.pd-c.pd).toFixed(1)} puntos`);
}
console.log(`\n  por lado:`);
for(const l of ["C","P"]){
 const s=R(sen.filter(o=>o.l===l)), c=R(ctrl.filter(o=>o.l===l));
 if(s&&c) console.log(`     ${l==="C"?"calls":"puts "}   señal ${s.pd.toFixed(1).padStart(5)}%  ciego ${c.pd.toFixed(1).padStart(5)}%   diferencia ${(s.pd-c.pd>=0?"+":"")}${(s.pd-c.pd).toFixed(1)} puntos`);
}
console.log("");
