// LA PRUEBA DE LESTER, TAL CUAL LA PIDIÓ — con el dato limpio que ya estaba en disco.
//
//   «comprar aquellos contratos justo el día después de que tuvieron un aumento significativo
//    de open interest / notional y de más de $500,000, sólo en 2026. Después de esa compra,
//    ¿en algún momento antes de su expiración duplicaron o más su valor?»
//
// DATOS (los dos limpios, sin preselección ninguna):
//   cache-theta/oi-ancho/TICKER_dAAAAMMDD.json  { "20260619": { "680|C": 12345 } }   interés abierto
//   cache-theta/cadenas/TICKER_dAAAAMMDD.json   { "20260619": { "680|C": [bid,ask] } } precios
//
// LO QUE NO SE PUEDE HACER CON ESTE DATO: saber si la compra fue AL ASK. El OI dice que alguien
// abrió posición, no de qué lado. Se dice y no se rellena.
//
// Señal: el interés abierto de un contrato SUBE de un día para otro, y ese aumento vale
//        $500,000 o más a precio de mercado.  Compra: el día siguiente, al ask.
//        Salida: el primer día que el bid llegue a 2x lo pagado. Si no, aguantar a vencimiento.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const OI=join(CACHE,"oi-ancho"), CAD=join(CACHE,"cadenas");
const ms=(d)=>Date.parse(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T00:00:00Z`);
const dteDe=(a,b)=>Math.round((ms(b)-ms(a))/86_400_000);
const MIN_NOCIONAL=500_000, ANO="2026", OBJ=2;

// días por ticker que tengan LAS DOS COSAS: interés abierto y precios
const dias=new Map();
for(const f of readdirSync(OI)){ const g=/^([A-Z]+)_d(\d{8})\.json$/.exec(f); if(!g)continue;
 if(!existsSync(join(CAD,f)))continue;
 if(!dias.has(g[1]))dias.set(g[1],[]); dias.get(g[1]).push(g[2]); }
for(const v of dias.values())v.sort();

const _c=new Map();
const leer=(dir,t,d)=>{const k=`${dir}|${t}|${d}`; if(_c.has(k))return _c.get(k);
 const f=join(dir,`${t}_d${d}.json`); const v=existsSync(f)?JSON.parse(readFileSync(f,"utf8")):null;
 _c.set(k,v); if(_c.size>900)_c.delete(_c.keys().next().value); return v;};
function spotOk(c,hoy){ let exp=null,md=Infinity;
 for(const e of Object.keys(c)){const d=dteDe(hoy,e); if(d<1)continue; if(d<md){md=d;exp=e;}}
 if(!exp)return null; const g=c[exp]; let K=null,dm=Infinity;
 for(const cl of Object.keys(g)){ if(cl.slice(-1)!=="C")continue; const k=Number(cl.slice(0,-2)); const p=g[`${k}|P`]; if(!p)continue;
  const d=Math.abs((g[cl][0]+g[cl][1])/2-(p[0]+p[1])/2); if(d<dm){dm=d;K=k;} }
 if(K==null)return null; const C=g[`${K}|C`],P=g[`${K}|P`];
 const s=K+(C[0]+C[1])/2-(P[0]+P[1])/2; return s>0?s:null; }

const señales=[];
let paresMirados=0, saltosPos=0;
for(const [tk,ds] of dias){
 const del=ds.filter(d=>d.startsWith(ANO));
 for(const hoy of del){
  const i=ds.indexOf(hoy); if(i<1) continue;
  const ayer=ds[i-1], mañana=ds[i+1]; if(!mañana) continue;
  const oiH=leer(OI,tk,hoy), oiA=leer(OI,tk,ayer), cadH=leer(CAD,tk,hoy);
  if(!oiH||!oiA||!cadH) continue;
  const S=spotOk(cadH,hoy); if(!S) continue;
  for(const e of Object.keys(oiH)){
   if(dteDe(hoy,e)<5) continue;                       // sin contratos a punto de vencer
   const gH=oiH[e], gA=oiA[e]; if(!gA) continue;
   const gP=cadH[e]; if(!gP) continue;
   for(const cl of Object.keys(gH)){
    const antes=gA[cl]; if(antes==null) continue;
    paresMirados++;
    const sube=gH[cl]-antes; if(!(sube>0)) continue;
    saltosPos++;
    const q=gP[cl]; if(!q||!(q[1]>0)) continue;
    const medio=(q[0]+q[1])/2;
    const nocional=sube*medio*100;
    if(nocional<MIN_NOCIONAL) continue;
    const K=Number(cl.slice(0,-2)), l=cl.slice(-1);
    señales.push({tk,e,K,l,hoy,mañana,sube,antes,nocional,
                  dist: l==="C"?(K-S)/S:(S-K)/S, dte:dteDe(hoy,e)});
 } } } }
console.log(`\n  ${paresMirados.toLocaleString("en-US")} contratos-día mirados · ${saltosPos.toLocaleString("en-US")} con el OI subiendo`);
console.log(`  ${señales.length.toLocaleString("en-US")} señales: el aumento vale $500,000 o más\n`);

// ── seguir cada señal ──
const ops=[]; let sinPrecio=0, sinSeg=0;
for(const s of señales){
 const ds=dias.get(s.tk); const cadC=leer(CAD,s.tk,s.mañana);
 const p0=cadC?.[s.e]?.[`${s.K}|${s.l}`];
 if(!p0||!(p0[1]>0)){sinPrecio++; continue;}
 const coste=p0[1]; let ult=null,n=0,dSal=null;
 for(const d of ds){ if(d<=s.mañana)continue; if(d>s.e)break;
   const p=leer(CAD,s.tk,d)?.[s.e]?.[`${s.K}|${s.l}`]; if(!p)continue; n++; dSal=d;
   if(p[0]/coste>=OBJ){ult=OBJ;break;} ult=p[0]/coste; }
 if(n===0){sinSeg++; continue;}
 ops.push({...s,coste,bid0:p0[0],ult,disp:ult>=OBJ,dSal,dias:n});
}
console.log(`  seguidas ${ops.length} · sin precio de entrada ${sinPrecio} · sin días después ${sinSeg}\n`);

const R=(L)=>{ if(!L.length)return null; const d=L.filter(o=>o.disp).length;
 let g=0,p=0; for(const o of L){const x=1000*(o.ult-1); if(x>0)g+=x; else p+=-x;}
 return {n:L.length,d,pd:100*d/L.length,g,p,r:p?g/p:Infinity,neto:g-p}; };
const F=(nom,r)=>{ if(!r){console.log(`  ${nom.padEnd(20)}      —`);return;}
 console.log(`  ${nom.padEnd(20)} ${String(r.n).padStart(6)}  ${String(r.d).padStart(5)} (${r.pd.toFixed(1).padStart(5)}%)  $${Math.round(r.g).toLocaleString("en-US").padStart(10)}  $${Math.round(r.p).toLocaleString("en-US").padStart(10)}  ${(r.r===Infinity?"∞":r.r.toFixed(2)).padStart(6)}   ${r.neto>=0?"+":"−"}$${Math.abs(Math.round(r.neto)).toLocaleString("en-US")}`);};
console.log(`=== SALTO DE INTERÉS ABIERTO DE $500,000+ · 2026 · arriesgando $1,000 por señal ===\n`);
console.log(`  grupo                     n   doblaron          ganado      perdido   RATIO       neto`);
F("TODO", R(ops));
console.log(`\n  por distancia al dinero al comprar:`);
for(const [a,b,n] of [[-9,-0.02,"DENTRO del dinero"],[-0.02,0.02,"en el dinero"],[0.02,0.07,"2% a 7% fuera"],[0.07,0.15,"7% a 15% fuera"],[0.15,9,"más del 15% fuera"]])
 F("  "+n, R(ops.filter(o=>o.dist>=a&&o.dist<b)));
console.log(`\n  por plazo:`);
for(const [a,b,n] of [[5,30,"5 a 30 días"],[30,60,"30 a 60"],[60,120,"60 a 120"],[120,9999,"más de 120"]])
 F("  "+n, R(ops.filter(o=>o.dte>=a&&o.dte<b)));
console.log(`\n  por lado:`);
F("  calls", R(ops.filter(o=>o.l==="C"))); F("  puts", R(ops.filter(o=>o.l==="P")));
console.log(`\n  por tamaño del salto:`);
for(const [a,b,n] of [[5e5,1e6,"$500k a $1M"],[1e6,5e6,"$1M a $5M"],[5e6,1e15,"más de $5M"]])
 F("  "+n, R(ops.filter(o=>o.nocional>=a&&o.nocional<b)));
const md=(v)=>v.length?v.slice().sort((a,b)=>a-b)[Math.floor(v.length/2)]:NaN;
console.log(`\n  COMPROBACIONES:`);
console.log(`     mediana: ${md(ops.map(o=>o.dte))} días · ${(100*md(ops.map(o=>o.dist))).toFixed(1)}% del dinero · precio $${md(ops.map(o=>o.coste)).toFixed(2)} · salto $${Math.round(md(ops.map(o=>o.nocional))).toLocaleString("en-US")}`);
const no=ops.filter(o=>!o.disp);
console.log(`     las que NO doblan acaban de media en ${(no.reduce((a,o)=>a+o.ult,0)/(no.length||1)).toFixed(2)}x · a cero (<0.10x): ${no.filter(o=>o.ult<0.10).length} de ${no.length}  (si esto es bajo, algo está mal)`);
console.log(`     días retenido de las que doblan (mediana): ${md(ops.filter(o=>o.disp).map(o=>o.dias))}`);
console.log(`     tickers distintos: ${new Set(ops.map(o=>o.tk)).size} · días distintos: ${new Set(ops.map(o=>o.hoy)).size}\n`);
