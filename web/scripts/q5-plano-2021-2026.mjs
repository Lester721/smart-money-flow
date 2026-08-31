// EL PLANO SOBRE 2021-2026 — mismas reglas, cinco años y medio en vez de siete meses.
// OJO: no se puede ir más atrás. En 2016-2020 el campo `delta` de la cinta viene a 0.000
// en TODAS las filas (y la iv también). Comprobado en scripts/_audit.mjs.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const DIR=join(CACHE,"cadenas");
const ms=(d)=>Date.parse(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T00:00:00Z`);
const dteDe=(a,b)=>Math.round((ms(b)-ms(a))/86_400_000);
const dias=new Map();
for(const f of readdirSync(DIR)){const g=/^([A-Z]+)_d(\d{8})\.json$/.exec(f); if(!g)continue; if(!dias.has(g[1]))dias.set(g[1],[]); dias.get(g[1]).push(g[2]);}
for(const v of dias.values())v.sort();
const _c=new Map();
const cad=(t,d)=>{const k=`${t}|${d}`; if(_c.has(k))return _c.get(k); const f=join(DIR,`${t}_d${d}.json`); const v=existsSync(f)?JSON.parse(readFileSync(f,"utf8")):null; _c.set(k,v); if(_c.size>600)_c.delete(_c.keys().next().value); return v;};
function spotOk(c,hoy){ let exp=null,md=Infinity;
 for(const e of Object.keys(c)){const d=dteDe(hoy,e); if(d<1)continue; if(d<md){md=d;exp=e;}}
 if(!exp)return null; const g=c[exp]; let K=null,dm=Infinity;
 for(const cl of Object.keys(g)){ if(cl.slice(-1)!=="C")continue; const k=Number(cl.slice(0,-2)); const p=g[`${k}|P`]; if(!p)continue;
  const d=Math.abs((g[cl][0]+g[cl][1])/2-(p[0]+p[1])/2); if(d<dm){dm=d;K=k;} }
 if(K==null)return null; const C=g[`${K}|C`],P=g[`${K}|P`];
 const s=K+(C[0]+C[1])/2-(P[0]+P[1])/2; return s>0?s:null; }

const fich=readdirSync(CACHE).filter(f=>/^[A-Z]+_y_20(2[1-6])\d{4}_\d{8}\.json$/.test(f)).sort();
const unicas=new Map(); let brutas=0;
for(const f of fich){let c;try{c=JSON.parse(readFileSync(join(CACHE,f),"utf8"));}catch{continue;}
 if(!Array.isArray(c))continue;
 for(const op of c){ if(!((op.premium??0)>=500000))continue;
  if(!["AT_ASK","ABOVE_ASK"].includes(op.side))continue;
  if(typeof op.delta!=="number"||op.delta===0)continue;      // 0 = campo vacío, no es un delta
  if(!(Math.abs(op.delta)>=0.15&&Math.abs(op.delta)<0.30))continue;
  const m=/^([A-Z]+)(\d{6})([CP])(\d{8})$/.exec(op.symbol??""); if(!m)continue;
  brutas++;
  const [,tk,ymd,l,K8]=m; const e=`20${ymd}`,K=Number(K8)/1000;
  const dOp=String(op.timestamp??"").slice(0,10).replace(/-/g,"");
  const cl=`${tk}|${e}|${K}|${l}|${dOp}`; const ya=unicas.get(cl);
  if(ya){ if(Math.abs(op.delta)>Math.abs(ya.delta))ya.delta=op.delta; }
  else unicas.set(cl,{tk,e,K,l,dOp,delta:op.delta}); } }
console.log(`\n  ${brutas} golpes en banda -> ${unicas.size} contratos distintos. Siguiendo...\n`);

const ops=[]; let sinCadena=0,sinPrecio=0,sinSeg=0;
for(const u of unicas.values()){
 const ds=dias.get(u.tk)??[]; const i=ds.findIndex(d=>d>u.dOp);
 if(i<0){sinCadena++;continue;} const dC=ds[i]; if(dC>=u.e){sinCadena++;continue;}
 const ch=cad(u.tk,dC); if(!ch){sinCadena++;continue;}
 const S=spotOk(ch,dC); if(!S){sinCadena++;continue;}
 const p0=ch[u.e]?.[`${u.K}|${u.l}`]; if(!p0||!(p0[1]>0)){sinPrecio++;continue;}
 const coste=p0[1]; let ult=null,n=0,dSal=null;
 for(const d of ds){ if(d<=dC)continue; if(d>u.e)break;
   const p=cad(u.tk,d)?.[u.e]?.[`${u.K}|${u.l}`]; if(!p)continue; n++; dSal=d;
   if(p[0]/coste>=2){ult=2;break;} ult=p[0]/coste; }
 if(n===0){sinSeg++;continue;}
 ops.push({...u,dC,dSal,coste,ult,disp:ult>=2,ano:dC.slice(0,4),
           dist:u.l==="C"?(u.K-S)/S:(S-u.K)/S,dte:dteDe(dC,u.e)}); }
console.log(`  seguidos ${ops.length} · sin cadena ${sinCadena} · sin precio de entrada ${sinPrecio} · sin días después ${sinSeg}\n`);

const R=(L)=>{ if(!L.length)return null; const d=L.filter(o=>o.disp).length;
 let g=0,p=0; for(const o of L){const x=1000*(o.ult-1); if(x>0)g+=x; else p+=-x;}
 return {n:L.length,d,pd:100*d/L.length,g,p,r:p?g/p:Infinity,neto:g-p}; };
const F=(nom,r)=>{ if(!r){console.log(`  ${nom.padEnd(12)}      —`); return;}
 console.log(`  ${nom.padEnd(12)} ${String(r.n).padStart(5)}  ${String(r.d).padStart(4)} (${r.pd.toFixed(1).padStart(5)}%)  $${Math.round(r.g).toLocaleString("en-US").padStart(9)}  $${Math.round(r.p).toLocaleString("en-US").padStart(8)}  ${(r.r===Infinity?"∞":r.r.toFixed(2)).padStart(6)}   ${r.neto>=0?"+":"−"}$${Math.abs(Math.round(r.neto)).toLocaleString("en-US")}`);};

console.log(`=== EL PLANO, 2021-2026 · arriesgando $1,000 en cada señal ===\n`);
console.log(`  periodo         n   doblaron        ganado    perdido   RATIO       neto`);
F("TODO", R(ops));
console.log("");
for(const a of ["2021","2022","2023","2024","2025","2026"]) F(a, R(ops.filter(o=>o.ano===a)));
console.log(`\n  por ticker:`);
for(const t of [...new Set(ops.map(o=>o.tk))].sort()) F("  "+t, R(ops.filter(o=>o.tk===t)));
console.log(`\n  por lado:`);
F("  calls", R(ops.filter(o=>o.l==="C")));
F("  puts",  R(ops.filter(o=>o.l==="P")));
const md=(v)=>v.length?v.slice().sort((a,b)=>a-b)[Math.floor(v.length/2)]:NaN;
console.log(`\n  mediana de días a vencimiento al comprar: ${md(ops.map(o=>o.dte))} · mediana de distancia al dinero: ${(100*md(ops.map(o=>o.dist))).toFixed(1)}%`);
console.log(`  las que NO doblan acaban de media en ${(ops.filter(o=>!o.disp).reduce((a,o)=>a+o.ult,0)/(ops.filter(o=>!o.disp).length||1)).toFixed(2)}x · a cero (<0.10x): ${ops.filter(o=>!o.disp&&o.ult<0.10).length}\n`);
