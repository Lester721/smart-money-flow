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
const cad=(t,d)=>{const k=`${t}|${d}`; if(_c.has(k))return _c.get(k); const f=join(DIR,`${t}_d${d}.json`); const v=existsSync(f)?JSON.parse(readFileSync(f,"utf8")):null; _c.set(k,v); if(_c.size>400)_c.delete(_c.keys().next().value); return v;};
function spotOk(c,hoy){ let exp=null,md=Infinity;
 for(const e of Object.keys(c)){const d=dteDe(hoy,e); if(d<1)continue; if(d<md){md=d;exp=e;}}
 if(!exp)return null; const g=c[exp]; let K=null,dm=Infinity;
 for(const cl of Object.keys(g)){ if(cl.slice(-1)!=="C")continue; const k=Number(cl.slice(0,-2)); const p=g[`${k}|P`]; if(!p)continue;
  const d=Math.abs((g[cl][0]+g[cl][1])/2-(p[0]+p[1])/2); if(d<dm){dm=d;K=k;} }
 if(K==null)return null; const C=g[`${K}|C`],P=g[`${K}|P`];
 const s=K+(C[0]+C[1])/2-(P[0]+P[1])/2; return s>0?s:null; }
const fich=readdirSync(CACHE).filter(f=>/^[A-Z]+_y_2026\d{4}_2026\d{4}\.json$/.test(f));
const unicas=new Map();
for(const f of fich){let c;try{c=JSON.parse(readFileSync(join(CACHE,f),"utf8"));}catch{continue;}
 if(!Array.isArray(c))continue;
 for(const op of c){ if(!((op.premium??0)>=500000))continue;
  if(!["AT_ASK","ABOVE_ASK"].includes(op.side))continue;
  const m=/^([A-Z]+)(\d{6})([CP])(\d{8})$/.exec(op.symbol??""); if(!m)continue;
  if(typeof op.delta!=="number")continue;
  const [,tk,ymd,l,K8]=m; const e=`20${ymd}`,K=Number(K8)/1000;
  const dOp=String(op.timestamp??"").slice(0,10).replace(/-/g,"");
  const cl=`${tk}|${e}|${K}|${l}|${dOp}`; const ya=unicas.get(cl);
  if(ya){ ya.prima+=op.premium; if(Math.abs(op.delta)>Math.abs(ya.delta))ya.delta=op.delta; }
  else unicas.set(cl,{tk,e,K,l,dOp,delta:op.delta,prima:op.premium}); } }
const ops=[];
for(const u of unicas.values()){
 if(!(Math.abs(u.delta)>=0.15&&Math.abs(u.delta)<0.30))continue;
 const ds=dias.get(u.tk)??[]; const i=ds.findIndex(d=>d>u.dOp); if(i<0)continue;
 const dC=ds[i]; if(dC>=u.e)continue;
 const ch=cad(u.tk,dC); if(!ch)continue; const S=spotOk(ch,dC); if(!S)continue;
 const p0=ch[u.e]?.[`${u.K}|${u.l}`]; if(!p0||!(p0[1]>0))continue;
 const coste=p0[1]; let ult=null,n=0,dSal=null;
 for(const d of ds){ if(d<=dC)continue; if(d>u.e)break;
   const p=cad(u.tk,d)?.[u.e]?.[`${u.K}|${u.l}`]; if(!p)continue; n++; dSal=d;
   if(p[0]/coste>=2){ult=2;break;} ult=p[0]/coste; }
 if(n===0)continue;
 ops.push({...u,S,dC,dSal,coste,bid0:p0[0],ult,disp:ult>=2,
           dist:u.l==="C"?(u.K-S)/S:(S-u.K)/S,dte:dteDe(dC,u.e),
           dtenat:dteDe(dC,dSal)}); }
ops.sort((a,b)=>a.dC.localeCompare(b.dC));

console.log(`\n=== LAS ${ops.length}, UNA POR UNA ===`);
console.log(`  compra    ticker l strike venc      delta  pagas  horquilla  vendes    x     $ de $1,000`);
let ent=0,sal=0;
for(const o of ops){
 const h=(100*(o.coste-o.bid0)/((o.coste+o.bid0)/2)).toFixed(0)+"%";
 const fin=1000*o.ult; ent+=1000; sal+=fin;
 console.log(`  ${o.dC}  ${o.tk.padEnd(4)} ${o.l} ${String(o.K).padStart(6)} ${o.e} ${Math.abs(o.delta).toFixed(2)}  $${o.coste.toFixed(2).padStart(6)}  ${h.padStart(5)}  ${(o.dSal??"—")} ${o.ult.toFixed(2).padStart(5)}  $${Math.round(fin).toLocaleString("en-US").padStart(6)}`);
}
console.log(`\n=== LA RESPUESTA ===`);
console.log(`   metes  $${ent.toLocaleString("en-US")}   (${ops.length} intentos de $1,000)`);
console.log(`   sacas  $${Math.round(sal).toLocaleString("en-US")}`);
console.log(`   neto   $${Math.round(sal-ent).toLocaleString("en-US")}   ·  ${((sal/ent-1)*100).toFixed(1)}% sobre lo metido`);
// ── los peros que hay que contar ───────────────────────────────────────────
const caros=ops.filter(o=>o.coste*100>1000);
console.log(`\n=== LOS PEROS ===`);
console.log(`   1. contratos que cuestan MÁS de $1,000 (no cabe ni uno): ${caros.length} de ${ops.length}`);
if(caros.length)console.log(`      el más caro $${Math.round(Math.max(...caros.map(o=>o.coste))*100).toLocaleString("en-US")} el contrato`);
const hh=ops.map(o=>100*(o.coste-o.bid0)/((o.coste+o.bid0)/2)).sort((a,b)=>a-b);
console.log(`   2. horquilla (lo que te comen al entrar y salir): mediana ${hh[Math.floor(hh.length/2)].toFixed(0)}% · peor ${hh[hh.length-1].toFixed(0)}%`);
// solapamiento: cuanto dinero hace falta a la vez
const ev=[]; for(const o of ops){ev.push([o.dC,1]); ev.push([o.dSal,-1]);}
ev.sort((a,b)=>a[0].localeCompare(b[0])||a[1]-b[1]);
let ab=0,mx=0; for(const [,d] of ev){ab+=d; if(ab>mx)mx=ab;}
console.log(`   3. a la vez abiertas como mucho: ${mx}  ->  hacen falta $${(mx*1000).toLocaleString("en-US")} en la cuenta, no $1,000`);
const meses={}; for(const o of ops){const k=o.dC.slice(0,6); meses[k]=(meses[k]||0)+(1000*o.ult-1000);}
console.log(`   4. mes a mes:`);
for(const k of Object.keys(meses).sort())console.log(`      ${k}  ${meses[k]>=0?"+":"−"}$${Math.abs(Math.round(meses[k])).toLocaleString("en-US")}`);
const porT={}; for(const o of ops){porT[o.tk]=(porT[o.tk]||0)+(1000*o.ult-1000);}
console.log(`   5. por ticker:`);
for(const [k,v] of Object.entries(porT).sort((a,b)=>b[1]-a[1]))console.log(`      ${k.padEnd(5)} ${v>=0?"+":"−"}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`);
console.log("");
