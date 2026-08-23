// LENTE 2 (parte 3) - de donde sale el p-valor: los botes gordos
import { diasDisponibles, cargarDia, operar, idxHora, rejilla, compraEn, resumen } from "./lib0dte.mjs";
const pc=(x)=>Number.isFinite(x)?(x*100).toFixed(2).replace(".",",")+"%":"--";
const d0=(x)=>Number.isFinite(x)?"$"+Math.round(x).toLocaleString("es-ES"):"--";
const n2=(x)=>Number.isFinite(x)?x.toFixed(2).replace(".",","):"--";
const media=(v)=>v.reduce((a,b)=>a+b,0)/v.length;
const mediana=(v)=>{const s=[...v].sort((a,b)=>a-b);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};

const fichas=[];
for (const d of diasDisponibles()){
  const D=cargarDia(d); if(!D) continue;
  const i0=idxHora(D,"09:35"); if(i0<0) continue;
  const b0=D.barras[i0], spot0=b0.spot, K0=rejilla(spot0);
  const aC=compraEn(b0,K0,"C"), aP=compraEn(b0,K0,"P");
  if(aC==null||aP==null||!(aC>0)||!(aP>0)) continue;
  const iE=idxHora(D,"10:00"), iS=idxHora(D,"15:55");
  let op=null;
  if(iE>i0 && iS>iE){
    const bm=D.barras[iE], lado=bm.spot>=spot0?"C":"P", Km=rejilla(bm.spot);
    const o=operar(D,iE,iS,Km,lado);
    if(o) op={ret:o.ret,dol:o.dolares};
  }
  fichas.push({dia:d, ano:d.slice(0,4), rel:(aC+aP)/spot0, op});
}
for(let i=0;i<fichas.length;i++){
  const prev=fichas.slice(Math.max(0,i-20),i).map(f=>f.rel);
  fichas[i].ratio = prev.length>=20 ? fichas[i].rel/mediana(prev) : null;
}
for(let i=0;i<fichas.length;i++){
  fichas[i].cubo=null;
  if(fichas[i].ratio==null) continue;
  const h=[]; for(let j=Math.max(0,i-250);j<i;j++) if(fichas[j].ratio!=null) h.push(fichas[j].ratio);
  if(h.length<60) continue;
  fichas[i].cubo=Math.min(4,Math.floor((h.filter(x=>x<fichas[i].ratio).length/h.length)*5));
}
const conCubo=fichas.filter(f=>f.cubo!=null && f.op);
const barato=conCubo.filter(f=>f.cubo===0);
const todos=fichas.filter(f=>f.op);
const ANOS=4.60;

console.log("==== A) LOS 15 MAYORES BOTES DE TODA LA MUESTRA - en que escalon cayeron ====");
const orden=[...todos].sort((a,b)=>b.op.ret-a.op.ret);
console.log("   (escalon 1 = prima mas BARATA; '-' = dia sin escalon asignado)");
let enBarato=0;
orden.slice(0,15).forEach((f,i)=>{
  const e = f.cubo==null? "-" : String(f.cubo+1);
  if(f.cubo===0) enBarato++;
  console.log("   #"+String(i+1).padStart(2)+"  "+f.dia+"  ret "+pc(f.op.ret).padStart(10)+"  "+d0(f.op.dol).padStart(8)+"   escalon "+e);
});
console.log("   de los 15 mayores botes, "+enBarato+" cayeron en el escalon BARATO (si fuera al azar tocarian "+n2(15*barato.length/todos.length)+")");
const top3=orden.slice(0,3);
console.log("   los 3 MAYORES de toda la muestra: "+top3.map(f=>f.dia+"(esc "+(f.cubo==null?"-":f.cubo+1)+")").join("  "));

console.log("\n==== B) EL MISMO p-VALOR, PERO SIN LOS 3 BOTES MAYORES DE LA MUESTRA ====");
{
  const excl=new Set(top3.map(f=>f.dia));
  const todosT=todos.filter(f=>!excl.has(f.dia));
  const baratoT=barato.filter(f=>!excl.has(f.dia));
  const R=resumen(baratoT.map(f=>f.op.ret));
  const dolReal=media(baratoT.map(f=>f.op.dol));
  console.log("   barato SIN esos 3 dias  n="+R.n+"  media "+pc(R.media)+"  t="+n2(R.t)+"  "+d0(dolReal)+"/op  "+d0((R.n/ANOS)*dolReal)+"/ano");
  let s=123456789; const rnd=()=>{s=(1103515245*s+12345)>>>0; return s/4294967296;};
  const N=todosT.length,K=baratoT.length; const mp=[],md=[];
  for(let it=0;it<2000;it++){
    const idx=new Set(); while(idx.size<K) idx.add(Math.floor(rnd()*N));
    const g=[...idx].map(i=>todosT[i]);
    mp.push(media(g.map(f=>f.op.ret))); md.push(media(g.map(f=>f.op.dol)));
  }
  const supP=mp.filter(x=>x>=R.media).length, supD=md.filter(x=>x>=dolReal).length;
  console.log("   subconjuntos al azar que lo igualan o superan:  en % "+supP+"/2000 = "+pc(supP/2000)+"   |   en $/op "+supD+"/2000 = "+pc(supD/2000));
  console.log("   (con los 3 dias dentro era 0,40% y 1,00%)");
}

console.log("\n==== C) QUE PASA SI EL DIA GORDO NO ESTA - probabilidad de pescarlo ====");
{
  const p = barato.length/todos.length;
  console.log("   el escalon barato es el "+pc(p)+" de los dias");
  console.log("   probabilidad de que 3 dias cualesquiera caigan los 3 en el barato por puro azar: "+pc(p*p*p));
  console.log("   -> el p-valor de 0,40% es del MISMO orden: el filtro no separa, pescó 3 botes");
}

console.log("\n==== D) LA MISMA REGLA MEDIDA EN LO QUE SE COBRA (mediana y percentiles del $) ====");
for(const [etq,g] of [["BARATO",barato],["TODOS",todos]]){
  const v=g.map(f=>f.op.dol).sort((a,b)=>a-b);
  const q=(p)=>v[Math.floor(p*(v.length-1))];
  console.log("   "+etq.padEnd(7)+" n="+String(v.length).padStart(4)+"  p10 "+d0(q(.1)).padStart(7)+"  p25 "+d0(q(.25)).padStart(7)+"  MEDIANA "+d0(q(.5)).padStart(7)+"  p75 "+d0(q(.75)).padStart(7)+"  p90 "+d0(q(.9)).padStart(7)+"  MEDIA "+d0(media(v)).padStart(7));
}
