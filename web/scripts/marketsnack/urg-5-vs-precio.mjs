// URGENCIA · LA PREGUNTA BIEN HECHA.
//
// Las 24 pruebas midieron "¿se mueve más de lo que ESE ticker venía moviéndose?" (mov1 = |ret|/rv).
// El test del dinero enseñó por qué eso no basta: el tercio de urgCall bajo se movió un 34% MÁS...
// y su cono costaba un 38% más. El movimiento de más YA ESTABA EN EL PRECIO.
//
// La pregunta que sí paga es otra: **¿se mueve más de lo que la OPCIÓN cobraba?** El objetivo deja
// de ser la volatilidad realizada previa y pasa a ser el precio real del cono comprado al ask.
// Objetivo primario: el retorno del cono. Objetivo secundario: |movimiento| / movimiento de empate.
//
// LÍMITE, declarado antes de mirar: sólo hay 19 tickers con cadena y una MEDIANA DE 10 POR DÍA.
// Con 10 por día un tercio son 3 nombres. La n efectiva son los 73 días, no las 762 operaciones.
import fs from "node:fs"; import path from "node:path";
import { listonT } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const RAIZ=path.join("scripts","cache-theta","marketsnack");
const CDIR=path.join("scripts","cache-theta","cadenas");
const CIERRES=path.join("scripts","cache-theta","cierres");
const DTE_OBJ=7,TOL_DTE=4,TOL_ATM=0.02, CUENTA=56389;

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
function cono(cad,S,hoy){
  let exp=null,dd=Infinity;
  for(const e of Object.keys(cad)){const d=ddias(hoy,e); if(d<1)continue; const x=Math.abs(d-DTE_OBJ); if(x<dd){dd=x;exp=e;}}
  if(!exp||dd>TOL_DTE)return null;
  let K=null,kd=Infinity;
  for(const c of Object.keys(cad[exp])){const[ks,r]=c.split("|"); if(r!=="C")continue;
    const k=Number(ks); if(!cad[exp][`${k}|P`])continue; const x=Math.abs(k-S); if(x<kd){kd=x;K=k;}}
  if(K==null||Math.abs(K/S-1)>TOL_ATM)return null;
  const c=cad[exp][`${K}|C`],p=cad[exp][`${K}|P`];
  if(!c||!p||!(c[1]>0)||!(p[1]>0))return null;
  return {exp,K,askC:c[1],bidC:c[0],askP:p[1],bidP:p[0]};}
function siguiente(t,d){const ks=Object.keys(cierres[t]).sort(); const i=ks.indexOf(d); return (i>=0&&i+1<ks.length)?ks[i+1]:null;}

const ops=[];
for(const f of P){
  if(!tickersCad.has(f.ticker)||!cierres[f.ticker])continue;
  const d0=ymd(f.fecha); const S=cierres[f.ticker][d0]; if(!(S>0))continue;
  const cad=cadena(f.ticker,d0); if(!cad)continue;
  const c=cono(cad,S,d0); if(!c)continue;
  const d1=siguiente(f.ticker,d0); if(!d1)continue;
  const cad1=cadena(f.ticker,d1), S1=cierres[f.ticker][d1];
  if(!cad1||!(S1>0))continue;
  const e=cad1[c.exp];
  const bC=e&&e[`${c.K}|C`]?e[`${c.K}|C`][0]:0, bP=e&&e[`${c.K}|P`]?e[`${c.K}|P`][0]:0;
  const coste=(c.askC+c.askP)*100, salida=(Math.max(0,bC)+Math.max(0,bP))*100;
  if(!(coste>0))continue;
  const empate=(c.askC+c.askP)/S;
  ops.push({ticker:f.ticker,fecha:f.fecha,ret:salida/coste-1,coste,
    razon:Math.abs(S1/S-1)/empate,
    q_urgShare:f.q_urgShare,q_urgCall:f.q_urgCall,q_urgSurge:f.q_urgSurge,
    q_urgDirAbs:f.q_urgDirAbs,q_totSurge:f.q_totSurge,urgPut:f.urgPut});
}
console.log(`${ops.length} conos con precio real · ${new Set(ops.map(o=>o.fecha)).size} dias · ${new Set(ops.map(o=>o.ticker)).size} tickers`);
radiografia(ops,["ret","coste","razon"],"conos con objetivo de PRECIO",{cerosLegitimos:[]});

const METRICAS=["urgShare","urgCall","urgPut","urgSurge","urgDirAbs","totSurge"];
const LISTON=listonT(24);

function porDias(metrica,objetivo){
  const g=new Map();
  for(const o of ops){
    const v = metrica==="urgPut" ? (o.urgPut>0?1:0) : o[`q_${metrica}`];
    if(v==null||!Number.isFinite(v))continue;
    if(o[objetivo]==null||!Number.isFinite(o[objetivo]))continue;
    let a=g.get(o.fecha); if(!a){a=[];g.set(o.fecha,a);} a.push({v,y:o[objetivo]});
  }
  const seps=[];
  for(const [,arr] of g){
    if(arr.length<6)continue;
    const o=[...arr].sort((x,y)=>y.v-x.v);
    const k=Math.floor(o.length/3);
    if(k<2)continue;
    seps.push(media(o.slice(0,k).map(x=>x.y))-media(o.slice(-k).map(x=>x.y)));
  }
  return seps;
}
console.log(`\n${"=".repeat(104)}`);
console.log(`.SEPARA EL RETORNO DEL CONO?  (tercio ALTO - tercio BAJO del mismo dia, en puntos de retorno)`);
console.log(`liston de |t| = ${LISTON}. n EFECTIVA = dias, no operaciones.`);
console.log(`${"=".repeat(104)}`);
console.log(`metrica      objetivo             dias   sep      t      minima detectable (80%)`);
const out=[];
for(const m of METRICAS) for(const [obj,nom,esc] of [["ret","retorno del cono",100],["razon","movimiento/empate",1]]){
  const s=porDias(m,obj); const D=s.length;
  if(D<10){ console.log(`${m.padEnd(12)} ${nom.padEnd(20)} ${String(D).padStart(4)}   sin muestra`); continue; }
  const mu=media(s), se=sdv(s)/Math.sqrt(D), t=mu/se, det=2.8*sdv(s)/Math.sqrt(D);
  console.log(`${m.padEnd(12)} ${nom.padEnd(20)} ${String(D).padStart(4)} ${(mu*esc).toFixed(2).padStart(7)}${esc===100?"pts":"   "} ${t.toFixed(2).padStart(6)}   ${(det*esc).toFixed(2)}${esc===100?"pts":""}`);
  out.push({metrica:m,objetivo:obj,dias:D,sep:mu,t,detectable:det});
}
const mejor=[...out].sort((a,b)=>Math.abs(b.t)-Math.abs(a.t))[0];
console.log(`\nEl mayor |t| de los ${out.length}: ${mejor.metrica} -> ${mejor.objetivo}, t=${mejor.t.toFixed(2)} (liston ${LISTON}). ${Math.abs(mejor.t)>=LISTON?"PASA":"NO PASA"}.`);

// ── cuanto haria falta, en dolares ───────────────────────────────────────────────────────────
const rBase=media(ops.map(o=>o.ret)), prima=media(ops.map(o=>o.coste));
const sRet=porDias("urgShare","ret");
const detRet=2.8*sdv(sRet)/Math.sqrt(sRet.length);
console.log(`\n${"=".repeat(104)}\nEL LISTON EN DOLARES`);
console.log(`  el cono al azar pierde ${(rBase*100).toFixed(2)}% -> el tercio elegido tiene que batir a la media en ${(-rBase*1.5*100).toFixed(1)} puntos`);
console.log(`     (batir en X al tercio bajo significa aproximadamente batir en X/1,5 a la media)`);
console.log(`  con ${sRet.length} dias, la separacion minima que se habria VISTO es ${(detRet*100).toFixed(1)} puntos`);
console.log(`  hace falta ${(-rBase*3*100).toFixed(1)} puntos de separacion ALTO-BAJO para que el tercio alto llegue a cero`);
console.log(`  -> la prueba ${detRet*100 <= -rBase*3*100 ? "SI" : "NO"} tenia potencia para ver un efecto que pagase.`);
console.log(`  la mayor separacion medida fue ${(Math.max(...out.filter(o=>o.objetivo==="ret").map(o=>Math.abs(o.sep)))*100).toFixed(1)} puntos.`);
console.log(`\n  DOLARES AL AÑO sobre $${CUENTA.toLocaleString("es-ES")}, 1 cono/dia, capital comprometido $${prima.toFixed(0)} por operacion:`);
for(const o of out.filter(x=>x.objetivo==="ret")){
  const rAlto=rBase+o.sep/1.5;
  console.log(`    tercio alto de ${o.metrica.padEnd(10)} ${(rAlto*100).toFixed(2).padStart(7)}% por cono  ->  $${(252*prima*rAlto).toFixed(0)}/año`);
}
fs.writeFileSync(path.join(RAIZ,"urg-vs-precio.json"),JSON.stringify({n:ops.length,dias:new Set(ops.map(o=>o.fecha)).size,rBase,prima,out},null,1));
console.log(`\nOK ${path.join(RAIZ,"urg-vs-precio.json")}`);
