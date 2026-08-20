// URGENCIA · EL PLAZO — el peaje se paga UNA VEZ. .Se diluye aguantando?
// Mismo cono ATM comprado al ASK del cierre de D. Tres salidas: 1 dia (al BID), 3 dias (al BID)
// y a VENCIMIENTO (valor intrinseco con el cierre REAL del subyacente, nunca la cadena, porque el
// descargador tira las filas con bid<=0 y sobrevivirian solo las ganadoras).
import fs from "node:fs"; import path from "node:path";
const CDIR=path.join("scripts","cache-theta","cadenas");
const CIERRES=path.join("scripts","cache-theta","cierres");
const RAIZ=path.join("scripts","cache-theta","marketsnack");
const DTE_OBJ=7,TOL_DTE=4,TOL_ATM=0.02,CUENTA=56389;
const P=JSON.parse(fs.readFileSync(path.join(RAIZ,"urg-panel.json"),"utf8"));
const ymd=(s)=>s.replace(/-/g,""); const iso=(y)=>`${y.slice(0,4)}-${y.slice(4,6)}-${y.slice(6,8)}`;
const ddias=(a,b)=>Math.round((Date.parse(iso(b))-Date.parse(iso(a)))/86400000);
const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:NaN;
const sdv=(v)=>{const m=media(v);return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1));};
const tickersCad=new Set(fs.readdirSync(CDIR).filter(f=>/^[A-Z]+_d\d{8}\.json$/.test(f)).map(f=>f.split("_d")[0]));
const cierres={}; for(const t of tickersCad){const p=path.join(CIERRES,`${t}.json`); if(fs.existsSync(p)) cierres[t]=JSON.parse(fs.readFileSync(p,"utf8"));}
const cache=new Map();
function cadena(t,d){const k=`${t}|${d}`; if(cache.has(k))return cache.get(k);
  const p=path.join(CDIR,`${t}_d${d}.json`); let v=null;
  if(fs.existsSync(p)){try{v=JSON.parse(fs.readFileSync(p,"utf8"));}catch{}}
  if(cache.size>4000)cache.clear(); cache.set(k,v); return v;}
function cono(cad,S,hoy){let exp=null,dd=Infinity;
  for(const e of Object.keys(cad)){const d=ddias(hoy,e); if(d<1)continue; const x=Math.abs(d-DTE_OBJ); if(x<dd){dd=x;exp=e;}}
  if(!exp||dd>TOL_DTE)return null;
  let K=null,kd=Infinity;
  for(const c of Object.keys(cad[exp])){const[ks,r]=c.split("|"); if(r!=="C")continue;
    const k=Number(ks); if(!cad[exp][`${k}|P`])continue; const x=Math.abs(k-S); if(x<kd){kd=x;K=k;}}
  if(K==null||Math.abs(K/S-1)>TOL_ATM)return null;
  const c=cad[exp][`${K}|C`],p=cad[exp][`${K}|P`];
  if(!c||!p||!(c[1]>0)||!(p[1]>0))return null;
  return {exp,K,askC:c[1],bidC:c[0],askP:p[1],bidP:p[0],dte:ddias(hoy,exp)};}
function avanzar(t,d,n){const ks=Object.keys(cierres[t]).sort(); let i=ks.indexOf(d); if(i<0)return null;
  i+=n; return i<ks.length?ks[i]:null;}

const ops=[];
let sinExp=0;
for(const f of P){
  if(!tickersCad.has(f.ticker)||!cierres[f.ticker])continue;
  const d0=ymd(f.fecha); const S=cierres[f.ticker][d0]; if(!(S>0))continue;
  const cad=cadena(f.ticker,d0); if(!cad)continue;
  const c=cono(cad,S,d0); if(!c)continue;
  const coste=(c.askC+c.askP)*100; if(!(coste>0))continue;
  const salidaBid=(t,d)=>{ const cd=cadena(t,d); if(!cd)return null; const e=cd[c.exp]; if(!e)return 0;
    const bC=e[`${c.K}|C`]?e[`${c.K}|C`][0]:0, bP=e[`${c.K}|P`]?e[`${c.K}|P`][0]:0;
    return (Math.max(0,bC)+Math.max(0,bP))*100; };
  const d1=avanzar(f.ticker,d0,1), d3=avanzar(f.ticker,d0,3);
  const s1=d1?salidaBid(f.ticker,d1):null, s3=d3?salidaBid(f.ticker,d3):null;
  // vencimiento: intrinseco con el cierre REAL
  const Sexp=cierres[f.ticker][c.exp];
  let sExp=null;
  if(Sexp>0) sExp=(Math.max(0,Sexp-c.K)+Math.max(0,c.K-Sexp))*100; else sinExp++;
  ops.push({ticker:f.ticker,fecha:f.fecha,coste,dte:c.dte,
    r1:s1!=null?s1/coste-1:null, r3:s3!=null?s3/coste-1:null, rExp:sExp!=null?sExp/coste-1:null,
    urgPut:f.urgPut>0?1:0});
}
console.log(`${ops.length} conos ATM · sin cierre en el vencimiento: ${sinExp}`);
console.log(`\n${"=".repeat(96)}\n.SE DILUYE EL PEAJE AGUANTANDO? (cono ATM ~7 dias, comprado al ASK)`);
console.log(`salida            n     retorno/op   dias en riesgo   retorno POR DIA   $/año con 1 cono/dia`);
const prima=media(ops.map(o=>o.coste));
for(const [nom,campo,dias] of [["1 dia (al BID)","r1",1],["3 dias (al BID)","r3",3],["a VENCIMIENTO (intrinseco)","rExp",media(ops.map(o=>o.dte))]]){
  const g=ops.filter(o=>o[campo]!=null); const r=media(g.map(o=>o[campo]));
  const opsAno=252/dias;
  console.log(`${nom.padEnd(28)} ${String(g.length).padStart(4)} ${(r*100).toFixed(2).padStart(9)}%  ${dias.toFixed(1).padStart(9)}  ${((r/dias)*100).toFixed(3).padStart(12)}%   $${(opsAno*prima*r).toFixed(0).padStart(8)}`);
}
console.log(`\nprima media $${prima.toFixed(0)} por cono · cuenta $${CUENTA.toLocaleString("es-ES")}`);
console.log(`\n${"=".repeat(96)}\nCON LA SEÑAL (urgPut = hubo prisa en puts hoy)`);
for(const [nom,campo,dias] of [["1 dia","r1",1],["3 dias","r3",3],["vencimiento","rExp",media(ops.map(o=>o.dte))]]){
  const si=ops.filter(o=>o.urgPut===1&&o[campo]!=null), no=ops.filter(o=>o.urgPut===0&&o[campo]!=null);
  const rs=media(si.map(o=>o[campo])), rn=media(no.map(o=>o[campo]));
  // t agrupado por dia
  const pd=new Map();
  for(const o of ops){ if(o[campo]==null)continue; let g=pd.get(o.fecha); if(!g){g=[];pd.set(o.fecha,g);} g.push(o); }
  const seps=[];
  for(const [,g] of pd){ const a=g.filter(o=>o.urgPut===1).map(o=>o[campo]), b=g.filter(o=>o.urgPut===0).map(o=>o[campo]);
    if(a.length<2||b.length<2)continue; seps.push(media(a)-media(b)); }
  const t=seps.length>8 ? media(seps)/(sdv(seps)/Math.sqrt(seps.length)) : NaN;
  console.log(`  ${nom.padEnd(12)} urgPut SI ${(rs*100).toFixed(2).padStart(7)}% (n=${si.length})  ·  NO ${(rn*100).toFixed(2).padStart(7)}% (n=${no.length})  ·  sep ${((rs-rn)*100).toFixed(2).padStart(6)}pts  t=${t.toFixed(2)} (${seps.length} dias)  ·  $${(252/dias*prima*rs).toFixed(0)}/año`);
}
