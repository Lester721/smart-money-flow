// REFUTACIÓN · C — la fuga del CALENTAMIENTO: los cierres anteriores al 2022-01-03 se reconstruyen
// anclando en el CIERRE del 2022-01-03, que es información POSTERIOR a las 11:00 de ese día.
// Se vuelve a construir todo anclando en el SPOT DE LAS 11:00 (causal) y en ±1% (sensibilidad).
import { readFileSync, writeFileSync } from "node:fs";
const base = JSON.parse(readFileSync("scripts/tend-base.json","utf8"));
const filas0 = base.filas;
const spyArr = JSON.parse(readFileSync("scripts/cache-theta/SPY_bars_20151122_20270308.json","utf8"));
const spy = new Map(spyArr.map(b=>[b.time,b.close]));
const cierreSPX = new Map(filas0.map(f=>[f.fecha,f.cierre]));
const cal=[...new Set([...spy.keys(),...cierreSPX.keys()])].sort();
const primera = filas0[0].fecha;
const eur=x=>`$${Math.round(x).toLocaleString("es-ES")}`;
const P=(v,q)=>v[Math.min(v.length-1,Math.max(0,Math.round((v.length-1)*q)))];
console.log(`2022-01-03 · spot 11:00 = ${filas0[0].spot11.toFixed(2)} · cierre = ${filas0[0].cierre.toFixed(2)} · el ancla del memo usa el CIERRE (${((filas0[0].cierre/filas0[0].spot11-1)*100).toFixed(2)}% de diferencia)`);

const LARGOS=[5,8,10,13,15,20,25,30,40,50,65,75,100,125,150,200];
function construir(anclaValor){
  const S=new Map();
  let prev=null;
  for(const d of cal){ if(d<primera) continue;
    if(cierreSPX.has(d)){S.set(d,cierreSPX.get(d));prev=d;continue;}
    if(prev!=null&&spy.has(d)&&spy.has(prev)){S.set(d,S.get(prev)*(spy.get(d)/spy.get(prev)));prev=d;} }
  // hacia atrás desde un ancla ELEGIDA (no necesariamente el cierre)
  const antes=cal.filter(d=>d<primera).sort().reverse();
  let sig=primera, valSig=anclaValor;
  const back=new Map();
  for(const d of antes){ if(spy.has(d)&&spy.has(sig)){ const v=valSig*(spy.get(d)/spy.get(sig)); back.set(d,v); sig=d; valSig=v; } }
  for(const [k,v] of back) S.set(k,v);
  const fechas=[...S.keys()].sort();
  const idx=new Map(fechas.map((d,i)=>[d,i])), vals=fechas.map(d=>S.get(d));
  const ac=[0]; for(let i=0;i<vals.length;i++) ac.push(ac[i]+vals[i]);
  const mh=(i,N)=> i-N<-1?null:(ac[i]-ac[i-N])/N;
  const out=[];
  for(const f of filas0){ const i=idx.get(f.fecha); if(i==null) continue;
    const r={fecha:f.fecha,pl:f.pl,spot11:f.spot11}; let falta=false;
    for(const N of LARGOS){ const m=mh(i,N); if(m==null||!(m>0)){falta=true;break;} r["d"+N]=f.spot11/m-1; }
    if(!falta) out.push(r); }
  return out;
}
const VARIANTES=[
  ["ancla = CIERRE 2022-01-03 (lo que hizo el memo, MIRA AL FUTURO)", filas0[0].cierre],
  ["ancla = SPOT 11:00 2022-01-03 (causal)",                          filas0[0].spot11],
  ["ancla = cierre −1%",                                             filas0[0].cierre*0.99],
  ["ancla = cierre +1%",                                             filas0[0].cierre*1.01],
];
function met(per,pasa){ const pls=[]; let ac=0,pi=0,pe=0;
  for(const f of per){const ok=pasa(f); const p=ok?f.pl:0; if(ok)pls.push(f.pl); ac+=p;pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
  const o=pls.slice().sort((a,b)=>a-b),k5=Math.max(1,Math.floor(pls.length*0.05));
  return{pctOp:pls.length/per.length,ano:pls.reduce((a,b)=>a+b,0)/(per.length/252),peorRacha:pe,
    p5:o.length?P(o,0.05):0,es5:o.length?o.slice(0,k5).reduce((a,b)=>a+b,0)/k5:0}; }
const ge=(N,u)=>(f=>f["d"+N]*100>=u);
const ref = construir(filas0[0].cierre);
for(const [et,anc] of VARIANTES){
  const F=construir(anc);
  const A=F.filter(f=>f.fecha<"2024-01-01"), B=F.filter(f=>f.fecha>="2024-01-01");
  const dif = F.filter((f,i)=> ge(30,1)(f)!==ge(30,1)(ref[i])).length;
  const dif50 = F.filter((f,i)=> ge(50,1)(f)!==ge(50,1)(ref[i])).length;
  console.log(`\n  ${et}   (decisiones distintas al de referencia: MA30≥1% → ${dif} días · MA50≥1% → ${dif50} días)`);
  for(const [nom,r] of [["MA50≥1%",ge(50,1)],["MA30≥1%",ge(30,1)]]){
    const mA=met(A,r), mB=met(B,r), mT=met(F,r);
    console.log(`     ${nom}  A: opera ${(mA.pctOp*100).toFixed(0)}% ${eur(mA.ano)}/año racha ${eur(mA.peorRacha)}  |  B: opera ${(mB.pctOp*100).toFixed(0)}% ${eur(mB.ano)}/año racha ${eur(mB.peorRacha)}  |  TODO ${eur(mT.ano)}/año racha ${eur(mT.peorRacha)}`);
  }
}
console.log(`\n  Días de la muestra cuya media móvil TOCA el tramo reconstruido (usa el cierre del 2022-01-03):`);
for(const N of [20,25,30,50,100,200]){
  const n = filas0.filter((f,i)=> i < N).length;
  console.log(`     MA${N}: los primeros ${N} días de la muestra (hasta ${filas0[Math.min(N,filas0.length-1)].fecha})`);
}
