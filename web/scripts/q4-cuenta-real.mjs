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
  if(ya){ if(Math.abs(op.delta)>Math.abs(ya.delta))ya.delta=op.delta; }
  else unicas.set(cl,{tk,e,K,l,dOp,delta:op.delta}); } }
const ops=[];
for(const u of unicas.values()){
 if(!(Math.abs(u.delta)>=0.15&&Math.abs(u.delta)<0.30))continue;
 const ds=dias.get(u.tk)??[]; const i=ds.findIndex(d=>d>u.dOp); if(i<0)continue;
 const dC=ds[i]; if(dC>=u.e)continue;
 const ch=cad(u.tk,dC); if(!ch)continue; if(!spotOk(ch,dC))continue;
 const p0=ch[u.e]?.[`${u.K}|${u.l}`]; if(!p0||!(p0[1]>0))continue;
 const coste=p0[1]; let ult=null,n=0,dSal=null;
 for(const d of ds){ if(d<=dC)continue; if(d>u.e)break;
   const p=cad(u.tk,d)?.[u.e]?.[`${u.K}|${u.l}`]; if(!p)continue; n++; dSal=d;
   if(p[0]/coste>=2){ult=2;break;} ult=p[0]/coste; }
 if(n===0)continue;
 ops.push({...u,dC,dSal,coste,ult}); }
ops.sort((a,b)=>a.dC.localeCompare(b.dC));
function simular(cap,porOp,maxAb){
 let caja=cap,abiertas=[],saltCaja=0,saltCupo=0,saltCaro=0,comp=0,minC=cap;
 const fechas=[...new Set([...ops.map(o=>o.dC),...ops.map(o=>o.dSal)])].sort();
 for(const hoy of fechas){
  for(const a of abiertas.filter(a=>a.dSal===hoy)) caja+=a.n*a.o.ult*a.o.coste*100;
  abiertas=abiertas.filter(a=>a.dSal!==hoy);
  for(const o of ops.filter(o=>o.dC===hoy)){
   if(abiertas.length>=maxAb){saltCupo++;continue;}
   const precio=o.coste*100; if(precio>porOp){saltCaro++;continue;}
   const n=Math.floor(porOp/precio);
   if(n<1||n*precio>caja){saltCaja++;continue;}
   caja-=n*precio; comp+=n; abiertas.push({o,n,dSal:o.dSal}); }
  if(caja<minC)minC=caja; }
 for(const a of abiertas) caja+=a.n*a.o.ult*a.o.coste*100;
 return {final:caja,saltCaja,saltCupo,saltCaro,comp,minC,tomadas:ops.length-saltCaja-saltCupo-saltCaro};
}
console.log(`\n=== TU CUENTA DE VERDAD · $8,248 en efectivo · ${ops.length} señales en 7 meses ===\n`);
console.log(`  $ por posición   máx a la vez   señales cogidas   TERMINAS CON     ganancia`);
for(const [p,m] of [[2000,4],[2500,3],[3000,2],[4000,2],[8248,1]]){
 const r=simular(8248,p,m);
 console.log(`  $${String(p).padStart(5)}              ${m}            ${String(r.tomadas).padStart(2)} de ${ops.length}         $${Math.round(r.final).toLocaleString("en-US").padStart(7)}    +$${Math.round(r.final-8248).toLocaleString("en-US").padStart(6)}  (+${((r.final/8248-1)*100).toFixed(0)}%)`);
}
const r=simular(8248,2500,3);
console.log(`\n  con $2,500 y 3 a la vez: se pierden ${r.saltCupo} señales por cupo, ${r.saltCaja} por falta de efectivo, ${r.saltCaro} por ser el contrato más caro que $2,500`);
console.log(`  lo más bajo que baja la caja: $${Math.round(r.minC).toLocaleString("en-US")}\n`);
