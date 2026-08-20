// URGENCIA · CIERRE — las tres preguntas que quedan.
//  (1) .Y AL REVES? Si el tercio alto pierde menos comprando, .se gana VENDIENDO el cono al tercio
//      bajo? Se mide de verdad: se vende al BID de D y se recompra al ASK de D+1.
//  (2) LA PEOR RACHA de la mejor configuracion.
//  (3) EL CORTE DEL 2026-07-16 sobre el objetivo que importa (el retorno del cono).
import fs from "node:fs"; import path from "node:path";
import { listonT } from "../../lib/barreraHallazgos.ts";

const RAIZ=path.join("scripts","cache-theta","marketsnack");
const CDIR=path.join("scripts","cache-theta","cadenas");
const CIERRES=path.join("scripts","cache-theta","cierres");
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
  const aC=e&&e[`${c.K}|C`]?e[`${c.K}|C`][1]:null, aP=e&&e[`${c.K}|P`]?e[`${c.K}|P`][1]:null;
  const costeCompra=(c.askC+c.askP)*100, salidaVenta=(Math.max(0,bC)+Math.max(0,bP))*100;
  if(!(costeCompra>0))continue;
  // VENDEDOR: cobra el BID de D, recompra al ASK de D+1. Si la pata ya no cotiza, se recompra por
  // su valor intrinseco (no se puede suponer que se cierra gratis).
  const cobro=(c.bidC+c.bidP)*100;
  const recompraC = aC!=null ? aC : Math.max(0,S1-c.K);
  const recompraP = aP!=null ? aP : Math.max(0,c.K-S1);
  const recompra=(recompraC+recompraP)*100;
  ops.push({ticker:f.ticker,fecha:f.fecha,
    retCompra:salidaVenta/costeCompra-1,
    retVenta: cobro>0 ? (cobro-recompra)/((c.askC+c.askP)*100) : null,   // sobre el mismo capital
    coste:costeCompra, cobro,
    q_urgPut:(f.urgPut>0?1:0), q_urgCall:f.q_urgCall, q_urgShare:f.q_urgShare});
}
console.log(`${ops.length} conos · ${new Set(ops.map(o=>o.fecha)).size} dias`);

// ── (1) el lado vendedor ─────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(96)}\n(1) .Y VENDIENDO EL CONO? (se cobra el BID de D, se recompra al ASK de D+1)`);
console.log(`  comprando al azar: ${(media(ops.map(o=>o.retCompra))*100).toFixed(2)}% por operacion`);
const vv=ops.filter(o=>o.retVenta!=null).map(o=>o.retVenta);
console.log(`  vendiendo al azar: ${(media(vv)*100).toFixed(2)}% por operacion (sobre el mismo capital)`);
console.log(`  suma de los dos lados: ${((media(ops.map(o=>o.retCompra))+media(vv))*100).toFixed(2)} puntos = LA HORQUILLA. Nadie se queda con ese dinero.`);
for(const [nom,f] of [["urgPut = SI",(o)=>o.q_urgPut===1],["urgPut = NO",(o)=>o.q_urgPut===0]]){
  const g=ops.filter(f).filter(o=>o.retVenta!=null);
  console.log(`    ${nom.padEnd(12)} n=${String(g.length).padStart(4)} comprar ${(media(g.map(o=>o.retCompra))*100).toFixed(2).padStart(7)}%  vender ${(media(g.map(o=>o.retVenta))*100).toFixed(2).padStart(7)}%`);
}

// ── (2) peor racha de la mejor configuracion (comprar el tercio con urgPut) ──────────────────
console.log(`\n${"=".repeat(96)}\n(2) PEOR RACHA — 1 cono/dia sobre el grupo urgPut=SI, comprado`);
{
  const pd=new Map();
  for(const o of ops.filter(o=>o.q_urgPut===1)){ let g=pd.get(o.fecha); if(!g){g=[];pd.set(o.fecha,g);} g.push(o); }
  const dias=[...pd.keys()].sort();
  let eq=0, pico=0, peor=0, rachaPerd=0, peorRacha=0;
  const primaM=media(ops.map(o=>o.coste));
  for(const d of dias){
    const g=pd.get(d); const r=media(g.map(o=>o.retCompra));
    eq += r*primaM; pico=Math.max(pico,eq); peor=Math.min(peor,eq-pico);
    if(r<0){rachaPerd++; peorRacha=Math.max(peorRacha,rachaPerd);} else rachaPerd=0;
  }
  console.log(`  ${dias.length} dias con operacion · resultado acumulado $${eq.toFixed(0)} · peor caida desde maximo $${peor.toFixed(0)} (${(peor/CUENTA*100).toFixed(1)}% de la cuenta)`);
  console.log(`  peor racha de dias perdedores seguidos: ${peorRacha}`);
  const anual = eq/dias.length*252;
  console.log(`  extrapolado a 252 dias: $${anual.toFixed(0)}/año · capital comprometido $${primaM.toFixed(0)} por operacion`);
}

// ── (3) el corte del 16 de julio sobre el retorno del cono ───────────────────────────────────
console.log(`\n${"=".repeat(96)}\n(3) ANTES vs DESPUES DEL 2026-07-16 (objetivo: retorno del cono)`);
function sepDias(sub,campo){
  const g=new Map();
  for(const o of sub){ const v = campo==="q_urgPut"?o.q_urgPut:o[campo]; if(v==null)continue;
    let a=g.get(o.fecha); if(!a){a=[];g.set(o.fecha,a);} a.push({v,y:o.retCompra}); }
  const s=[];
  for(const [,arr] of g){ if(arr.length<6)continue; const o=[...arr].sort((x,y)=>y.v-x.v);
    const k=Math.floor(o.length/3); if(k<2)continue;
    s.push(media(o.slice(0,k).map(x=>x.y))-media(o.slice(-k).map(x=>x.y))); }
  return s;
}
for(const campo of ["q_urgPut","q_urgCall","q_urgShare"]){
  const l=(sub)=>{const s=sepDias(sub,campo); if(s.length<8)return "sin muestra";
    const m=media(s),t=m/(sdv(s)/Math.sqrt(s.length)); return `${(m*100).toFixed(2).padStart(6)}pts t=${t.toFixed(2).padStart(5)} (${s.length}d)`;};
  console.log(`  ${campo.padEnd(11)} antes ${l(ops.filter(o=>o.fecha<"2026-07-16")).padEnd(28)} despues ${l(ops.filter(o=>o.fecha>="2026-07-16"))}`);
}
console.log(`\n  liston ${listonT(24)}`);
