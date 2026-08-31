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

// ── 1. recoger las compras grandes, QUEDANDOSE CON UNA POR CONTRATO Y DIA ──
const fich=readdirSync(CACHE).filter(f=>/^[A-Z]+_y_2026\d{4}_2026\d{4}\.json$/.test(f));
const unicas=new Map(); let brutas=0, sinDelta=0;
const tickers=new Set(), meses=new Set();
for(const f of fich){let c;try{c=JSON.parse(readFileSync(join(CACHE,f),"utf8"));}catch{continue;}
 if(!Array.isArray(c))continue;
 for(const op of c){ if(!((op.premium??0)>=500000))continue;
  if(!["AT_ASK","ABOVE_ASK"].includes(op.side))continue;
  const m=/^([A-Z]+)(\d{6})([CP])(\d{8})$/.exec(op.symbol??""); if(!m)continue;
  brutas++;
  if(typeof op.delta!=="number"){sinDelta++; continue;}
  const [,tk,ymd,l,K8]=m; const e=`20${ymd}`,K=Number(K8)/1000;
  const dOp=String(op.timestamp??"").slice(0,10).replace(/-/g,"");
  const clave=`${tk}|${e}|${K}|${l}|${dOp}`;
  const ya=unicas.get(clave);
  if(ya){ ya.prima+=op.premium; ya.prints++; if(Math.abs(op.delta)>Math.abs(ya.delta))ya.delta=op.delta; }
  else unicas.set(clave,{tk,e,K,l,dOp,delta:op.delta,prima:op.premium,prints:1});
  tickers.add(tk); meses.add(dOp.slice(0,6)); } }
console.log(`\n=== LO QUE HAY ===`);
console.log(`   ${brutas} compras grandes en bruto -> ${unicas.size} contratos distintos (una por contrato y día)`);
console.log(`   ${tickers.size} tickers: ${[...tickers].sort().join(" ")}`);
console.log(`   meses: ${[...meses].sort().join(" ")}`);
if(sinDelta)console.log(`   ⚠ ${sinDelta} sin delta, descartadas`);

// ── 2. seguir cada una ─────────────────────────────────────────────────────
const ops=[];
for(const u of unicas.values()){
 const ds=dias.get(u.tk)??[]; const i=ds.findIndex(d=>d>u.dOp); if(i<0)continue;
 const dC=ds[i]; if(dC>=u.e)continue;
 const ch=cad(u.tk,dC); if(!ch)continue;
 const S=spotOk(ch,dC); if(!S)continue;
 const p0=ch[u.e]?.[`${u.K}|${u.l}`]; if(!p0||!(p0[1]>0))continue;
 const coste=p0[1]; let ult=null,n=0,disp=false,huecoFinal=false,ultD=null;
 for(const d of ds){ if(d<=dC)continue; if(d>u.e)break;
   const p=cad(u.tk,d)?.[u.e]?.[`${u.K}|${u.l}`];
   if(!p){huecoFinal=true; continue;}
   huecoFinal=false; n++; ultD=d;
   if(p[0]/coste>=2){disp=true;ult=2;break;} ult=p[0]/coste; }
 if(n===0)continue;
 ops.push({...u,S,dC,coste,ult,disp,huecoFinal,llega:ultD===u.e,
           dist:u.l==="C"?(u.K-S)/S:(S-u.K)/S, dte:dteDe(dC,u.e)}); }

// ── 3. la tabla, por delta REAL ────────────────────────────────────────────
function fila(nom,L){
 if(!L.length){console.log(`   ${nom.padEnd(24)}      0        —`); return;}
 const d=L.filter(o=>o.disp).length;
 let g=0,p=0; for(const o of L){const x=1000*(o.ult-1); if(x>0)g+=x; else p+=-x;}
 console.log(`   ${nom.padEnd(24)} ${String(L.length).padStart(5)}  ${String(d).padStart(4)} (${(100*d/L.length).toFixed(1).padStart(4)}%)  $${Math.round(g).toLocaleString("en-US").padStart(8)}  $${Math.round(p).toLocaleString("en-US").padStart(8)}  ${(p?(g/p).toFixed(2):"—").padStart(6)}`);
}
console.log(`\n=== EL NUMERO, POR DELTA REAL (${ops.length} contratos seguidos) ===\n`);
console.log(`   grupo                    n     doblaron       ganado    perdido   RATIO`);
fila("delta 0.50 o MÁS", ops.filter(o=>Math.abs(o.delta)>=0.50));
fila("delta menos de 0.50", ops.filter(o=>Math.abs(o.delta)<0.50));
console.log("");
for(const [a,b] of [[0,.15],[.15,.30],[.30,.50],[.50,.70],[.70,1.01]])
 fila(`   delta ${a.toFixed(2)}–${b.toFixed(2)}`, ops.filter(o=>Math.abs(o.delta)>=a&&Math.abs(o.delta)<b));
const alt=ops.filter(o=>Math.abs(o.delta)>=0.50);
console.log(`\n   comprobación de las de delta 0.50+: llegan a vencer ${alt.filter(o=>o.llega).length} de ${alt.length} ·`);
console.log(`   desaparecen de la cadena ${alt.filter(o=>o.huecoFinal).length} · las que no doblan acaban de media en ${(alt.filter(o=>!o.disp).reduce((a,o)=>a+o.ult,0)/(alt.filter(o=>!o.disp).length||1)).toFixed(2)}x\n`);
