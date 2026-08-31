// ¿EL 96% VIENE DE LA SEÑAL O DE COMPRAR CONTRATOS CAROS DENTRO DEL DINERO?
//
// Lester: «¿realmente escogiendo contratos de $15,000 tengo un 96% de ganar?»
//
// Se compra A CIEGAS, sin señal ninguna: cada día de enero, en cada ticker, el contrato que esté
// DENTRO del dinero, cueste $10,000 o más y venza entre 5 y 90 días. Mismas reglas de salida.
// Si eso también gana el 96%, el mérito es del PRECIO, no del dinero grande.
import { abrir } from "./datos.mjs";
const ms = (d) => Date.parse(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T00:00:00Z`);
const dteDe = (a,b) => Math.round((ms(b)-ms(a))/86_400_000);
const OBJ=1.50, SUELO=0.50;
const TICKERS=["AAPL","AMD","HOOD","META","MSFT","NVDA","QQQ","SPY","TSLA"];
const cad = abrir("cadenas");
function spotOk(c,hoy){ let exp=null,md=Infinity;
 for(const e of Object.keys(c)){const d=dteDe(hoy,e); if(d<1)continue; if(d<md){md=d;exp=e;}}
 if(!exp)return null; const g=c[exp]; let K=null,dm=Infinity;
 for(const cl of Object.keys(g)){ if(cl.slice(-1)!=="C")continue; const k=Number(cl.slice(0,-2)); const p=g[`${k}|P`]; if(!p)continue;
  const d=Math.abs((g[cl][0]+g[cl][1])/2-(p[0]+p[1])/2); if(d<dm){dm=d;K=k;} }
 if(K==null)return null; const C=g[`${K}|C`],P=g[`${K}|P`];
 const s=K+(C[0]+C[1])/2-(P[0]+P[1])/2; return s>0?s:null; }
function seguir(tk,dC,exp,K,l){
 const ch=cad.leer(tk,dC); const p0=ch?.[exp]?.[`${K}|${l}`]; if(!p0||!(p0[1]>0))return null;
 const coste=p0[1], ds=cad.dias(tk); const cam=[];
 for(const d of ds){ if(d<=dC)continue; if(d>exp)break;
   const p=cad.leer(tk,d)?.[exp]?.[`${K}|${l}`]; if(!p)continue; cam.push(p[0]/coste); }
 if(!cam.length)return null;
 for(const m of cam){ if(m>=OBJ)return {res:OBJ,coste}; if(m<=SUELO)return {res:SUELO,coste}; }
 return {res:cam[cam.length-1],coste}; }

const ciego=[];
for(const tk of TICKERS){
 const ds=cad.dias(tk).filter(d=>d>="20260102"&&d<="20260131");
 for(const d of ds){
  const ch=cad.leer(tk,d); if(!ch)continue; const S=spotOk(ch,d); if(!S)continue;
  for(const e of Object.keys(ch)){
   const t=dteDe(d,e); if(t<5||t>90)continue;
   const g=ch[e];
   for(const cl of Object.keys(g)){
    const l=cl.slice(-1), K=Number(cl.slice(0,-2));
    if(!(l==="C"?K<S:K>S))continue;                 // dentro del dinero
    const q=g[cl]; if(!q||!(q[1]>0))continue;
    if(q[1]*100<10000)continue;                     // cuesta $10,000 o más
    const r=seguir(tk,d,e,K,l); if(!r)continue;
    ciego.push({tk,d,l,K,e,...r,dinero:(r.res-1)*r.coste*100});
 } } } }
const $=(x)=>(x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
const M=(L)=>{ if(!L.length)return null; let g=0,p=0,gana=0;
 for(const o of L){ if(o.dinero>0){g+=o.dinero;gana++;} else p+=-o.dinero; }
 return {n:L.length,pg:100*gana/L.length,r:p?g/p:Infinity,neto:g-p}; };
console.log(`\n=== COMPRAR A CIEGAS: dentro del dinero, $10,000+, 5 a 90 días, enero 2026 ===\n`);
console.log(`  ${"grupo".padEnd(24)}      n   ganan   RATIO         dinero`);
const F=(n,r)=>{ if(!r){console.log(`  ${n.padEnd(24)}      0`);return;}
 console.log(`  ${n.padEnd(24)} ${String(r.n).padStart(6)}   ${r.pg.toFixed(0).padStart(4)}%  ${(r.r===Infinity?"∞":r.r.toFixed(2)).padStart(6)}   ${$(r.neto).padStart(12)}`);};
F("TODO", M(ciego));
F("  sólo puts", M(ciego.filter(o=>o.l==="P")));
F("  sólo calls", M(ciego.filter(o=>o.l==="C")));
console.log(`\n  por ticker:`);
for(const t of TICKERS) F("  "+t, M(ciego.filter(o=>o.tk===t)));
console.log("");
