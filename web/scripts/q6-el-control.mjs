// EL CONTROL — la vara de medir del plano.
//
// Cada lunes, en los mismos 8 tickers, comprar A CIEGAS la call que esté al 7% por encima del
// precio y la put al 7% por debajo, con unos 64 días por delante. Sin mirar el flujo. Sin señal.
// Misma salida que el plano: vender el día que el bid llegue a 2x el ask pagado; si no, aguantar.
//
// El 7% y los 64 días NO son inventados: son la MEDIANA de las 376 señales del plano, para que
// la comparación sea entre iguales.
//
// Misma función de spot (auditada), mismo peaje (compra al ask, venta al bid), mismo período.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const DIR=join(CACHE,"cadenas");
const ms=(d)=>Date.parse(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T00:00:00Z`);
const dteDe=(a,b)=>Math.round((ms(b)-ms(a))/86_400_000);
const OTM=0.07, DTE_OBJ=64, DTE_MIN=20, OBJETIVO=2;
const TICKERS=["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY","TSLA"];
const DESDE="20210101", HASTA="20260819";

const dias=new Map();
for(const f of readdirSync(DIR)){const g=/^([A-Z]+)_d(\d{8})\.json$/.exec(f); if(!g)continue;
 if(!TICKERS.includes(g[1]))continue; if(g[2]<DESDE||g[2]>HASTA)continue;
 if(!dias.has(g[1]))dias.set(g[1],[]); dias.get(g[1]).push(g[2]);}
for(const v of dias.values())v.sort();

function spotOk(c,hoy){ let exp=null,md=Infinity;
 for(const e of Object.keys(c)){const d=dteDe(hoy,e); if(d<1)continue; if(d<md){md=d;exp=e;}}
 if(!exp)return null; const g=c[exp]; let K=null,dm=Infinity;
 for(const cl of Object.keys(g)){ if(cl.slice(-1)!=="C")continue; const k=Number(cl.slice(0,-2)); const p=g[`${k}|P`]; if(!p)continue;
  const d=Math.abs((g[cl][0]+g[cl][1])/2-(p[0]+p[1])/2); if(d<dm){dm=d;K=k;} }
 if(K==null)return null; const C=g[`${K}|C`],P=g[`${K}|P`];
 const s=K+(C[0]+C[1])/2-(P[0]+P[1])/2; return s>0?s:null; }

const ops=[]; let sinExp=0, sinStrike=0;
for(const tk of TICKERS){
 const ds=dias.get(tk)??[]; if(!ds.length){console.log(`  ${tk}: sin cadenas`); continue;}
 let abiertas=[], semana=null, n=0;
 for(const d of ds){
  const f=join(DIR,`${tk}_d${d}.json`); if(!existsSync(f))continue;
  let ch; try{ch=JSON.parse(readFileSync(f,"utf8"));}catch{continue;}
  // 1) actualizar lo abierto
  const siguen=[];
  for(const a of abiertas){
   if(d>a.exp){ a.cerrar(a.ult??0); continue; }
   const p=ch[a.exp]?.[`${a.K}|${a.l}`];
   if(p){ a.vistos++; a.ultDia=d; const m=p[0]/a.coste;
     if(m>=OBJETIVO){ a.cerrar(OBJETIVO, d, a.vistos); continue; } a.ult=m; }
   siguen.push(a); }
  abiertas=siguen;
  // 2) ¿toca abrir? una vez por semana
  const sem=Math.floor((ms(d)-ms("20210104"))/604800000);
  if(sem===semana) continue;
  semana=sem;
  const S=spotOk(ch,d); if(!S) continue;
  let exp=null,md=Infinity;
  for(const e of Object.keys(ch)){const t=dteDe(d,e); if(t<DTE_MIN)continue; const x=Math.abs(t-DTE_OBJ); if(x<md){md=x;exp=e;}}
  if(!exp){sinExp++; continue;}
  const g=ch[exp];
  for(const l of ["C","P"]){
   const obj = l==="C" ? S*(1+OTM) : S*(1-OTM);
   let K=null,dm=Infinity;
   for(const cl of Object.keys(g)){ if(cl.slice(-1)!==l)continue; const k=Number(cl.slice(0,-2));
     const x=Math.abs(k-obj); if(x<dm){dm=x;K=k;} }
   if(K==null){sinStrike++; continue;}
   const q=g[`${K}|${l}`]; if(!q||!(q[1]>0)){sinStrike++; continue;}
   const fila={tk,l,K,exp,dC:d,coste:q[1],S,ult:null,vistos:0,ultDia:null,dte:dteDe(d,exp),
               dist: l==="C"?(K-S)/S:(S-K)/S, ano:d.slice(0,4), disp:false, dias:null};
   fila.cerrar=(m,dSal,nd)=>{ fila.ult=m; fila.disp=(m>=OBJETIVO); fila.dias=nd??fila.vistos; if(fila.vistos>0) ops.push(fila); };
   abiertas.push(fila); n++; } }
 for(const a of abiertas) a.cerrar(a.ult??0);
 console.log(`  ${tk.padEnd(5)} ${String(n).padStart(4)} compras a ciegas`);
}
console.log(`\n  descartes: sin vencimiento adecuado ${sinExp} · sin strike con precio ${sinStrike}`);
console.log(`  seguidas: ${ops.length}\n`);

const R=(L)=>{ if(!L.length)return null; const d=L.filter(o=>o.disp).length;
 let g=0,p=0; for(const o of L){const x=1000*(o.ult-1); if(x>0)g+=x; else p+=-x;}
 return {n:L.length,d,pd:100*d/L.length,g,p,r:p?g/p:Infinity,neto:g-p}; };
const F=(nom,r)=>{ if(!r){console.log(`  ${nom.padEnd(14)}     —`);return;}
 console.log(`  ${nom.padEnd(14)} ${String(r.n).padStart(5)}  ${String(r.d).padStart(4)} (${r.pd.toFixed(1).padStart(5)}%)  $${Math.round(r.g).toLocaleString("en-US").padStart(9)}  $${Math.round(r.p).toLocaleString("en-US").padStart(9)}  ${(r.r===Infinity?"∞":r.r.toFixed(2)).padStart(6)}   ${r.neto>=0?"+":"−"}$${Math.abs(Math.round(r.neto)).toLocaleString("en-US")}`);};

console.log(`=== EL CONTROL: comprar A CIEGAS cada lunes, 7% del dinero, 64 días ===\n`);
console.log(`  grupo              n   doblaron        ganado     perdido   RATIO       neto`);
F("TODO", R(ops));
console.log("");
for(const a of ["2021","2022","2023","2024","2025","2026"]) F(a, R(ops.filter(o=>o.ano===a)));
console.log(`\n  por lado:`);
F("  calls", R(ops.filter(o=>o.l==="C")));
F("  puts",  R(ops.filter(o=>o.l==="P")));
console.log(`\n  por ticker:`);
for(const t of TICKERS) F("  "+t, R(ops.filter(o=>o.tk===t)));
const md=(v)=>v.length?v.slice().sort((a,b)=>a-b)[Math.floor(v.length/2)]:NaN;
console.log(`\n  mediana: ${md(ops.map(o=>o.dte))} días a vencer · ${(100*md(ops.map(o=>o.dist))).toFixed(1)}% del dinero · precio $${md(ops.map(o=>o.coste)).toFixed(2)}`);
console.log(`  las que NO doblan acaban de media en ${(ops.filter(o=>!o.disp).reduce((a,o)=>a+o.ult,0)/(ops.filter(o=>!o.disp).length||1)).toFixed(2)}x · a cero (<0.10x): ${ops.filter(o=>!o.disp&&o.ult<0.10).length} de ${ops.filter(o=>!o.disp).length}`);
console.log(`  días retenido de las que doblan (mediana): ${md(ops.filter(o=>o.disp).map(o=>o.dias))}\n`);
