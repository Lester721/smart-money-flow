// LENTE 2 (parte 2) - subconjunto al azar, agrupamiento de los dias baratos, y dependencia de 1 dia
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
    if(o) op={ret:o.ret,dol:o.dolares,coste:o.coste};
  }
  fichas.push({dia:d, ano:d.slice(0,4), rel:(aC+aP)/spot0, op});
}
const ANOS=(new Date(fichas.at(-1).dia)-new Date(fichas[0].dia))/(365.25*24*3600*1000);
console.log("fichas "+fichas.length+", "+n2(ANOS)+" anos");

// senal identica a e9
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
const conCubo=fichas.filter(f=>f.cubo!=null);
const barato=conCubo.filter(f=>f.cubo===0 && f.op);
const todos=fichas.filter(f=>f.op);
const R=resumen(barato.map(f=>f.op.ret));
console.log("REAL barato 10:00>15:55  n="+R.n+"  media "+pc(R.media)+"  t="+n2(R.t)+"  "+d0(media(barato.map(f=>f.op.dol)))+"/op");

// A) SUBCONJUNTO AL AZAR del mismo tamano (LCG con semilla fija, reproducible; nada de Math.random)
console.log("\n==== A) 2.000 SUBCONJUNTOS AL AZAR de 192 dias, sin ningun filtro ====");
{
  let s=123456789;
  const rnd=()=>{ s=(1103515245*s+12345)>>>0; return s/4294967296; };
  const N=todos.length, K=barato.length;
  const pctMejor=[], dolMejor=[], muestrasPct=[], muestrasDol=[];
  for(let it=0; it<2000; it++){
    const idx=new Set();
    while(idx.size<K) idx.add(Math.floor(rnd()*N));
    const g=[...idx].map(i=>todos[i]);
    const m=media(g.map(f=>f.op.ret)), dm=media(g.map(f=>f.op.dol));
    muestrasPct.push(m); muestrasDol.push(dm);
  }
  muestrasPct.sort((a,b)=>a-b); muestrasDol.sort((a,b)=>a-b);
  const supPct=muestrasPct.filter(x=>x>=R.media).length;
  const dolReal=media(barato.map(f=>f.op.dol));
  const supDol=muestrasDol.filter(x=>x>=dolReal).length;
  console.log("   al azar, media%: p5 "+pc(muestrasPct[100])+"  p50 "+pc(muestrasPct[1000])+"  p95 "+pc(muestrasPct[1900])+"  max "+pc(muestrasPct[1999]));
  console.log("   al azar, $/op  : p5 "+d0(muestrasDol[100])+"  p50 "+d0(muestrasDol[1000])+"  p95 "+d0(muestrasDol[1900])+"  max "+d0(muestrasDol[1999]));
  console.log("   subconjuntos al azar que IGUALAN o superan el filtro barato:  en % "+supPct+"/2000 = "+pc(supPct/2000)+"   |   en $/op "+supDol+"/2000 = "+pc(supDol/2000));
}

// B) AGRUPAMIENTO de los dias baratos
console.log("\n==== B) AGRUPAMIENTO - los dias de prima barata no son independientes ====");
{
  const pos=[]; conCubo.forEach((f,i)=>{ if(f.cubo===0) pos.push(i); });
  let seguidos=0, rachas=[], r=1;
  for(let i=1;i<pos.length;i++){ if(pos[i]-pos[i-1]===1){seguidos++; r++;} else {rachas.push(r); r=1;} }
  rachas.push(r);
  rachas.sort((a,b)=>b-a);
  console.log("   dias baratos: "+pos.length+"  de los cuales pegados al anterior: "+seguidos+" ("+pc(seguidos/pos.length)+")");
  console.log("   rachas: "+rachas.length+" bloques  |  la mas larga "+rachas[0]+" dias  |  las 8 mayores: "+rachas.slice(0,8).join(", "));
  console.log("   n EFECTIVO (bloques independientes, no dias): "+rachas.length+"  -> el t de "+n2(R.t)+" se calculo como si fueran "+pos.length+" tiradas independientes");
  const tEf = R.media*Math.sqrt(rachas.length)/(resumen(barato.map(f=>f.op.ret)).sd||Infinity);
  console.log("   t re-escalado a bloques: "+n2(tEf));
  // por ano
  const porAno={}; for(const f of conCubo){ if(f.cubo===0) porAno[f.ano]=(porAno[f.ano]||0)+1; }
  console.log("   reparto por ano: "+Object.entries(porAno).map(([a,n])=>a+":"+n).join("  "));
}

// C) DEPENDENCIA DE UN SOLO DIA
console.log("\n==== C) QUITAR DIAS UNO A UNO (jackknife por el mejor) ====");
{
  const arr=barato.map(f=>({dia:f.dia, ret:f.op.ret, dol:f.op.dol})).sort((a,b)=>b.ret-a.ret);
  for(const k of [0,1,2,3,5,10]){
    const q=arr.slice(k);
    const r=resumen(q.map(x=>x.ret));
    console.log("   sin los "+String(k).padStart(2)+" mejores dias  n="+r.n+"  media "+pc(r.media).padStart(9)+"  t="+n2(r.t).padStart(6)+"  "+d0(media(q.map(x=>x.dol))).padStart(7)+"/op  "+d0((q.length/ANOS)*media(q.map(x=>x.dol))).padStart(10)+"/ano");
  }
  console.log("   ...y el CONTROL TONTO (todos los dias) sin sus 3 mejores, para comparar en igualdad:");
  const at=todos.map(f=>({ret:f.op.ret,dol:f.op.dol})).sort((a,b)=>b.ret-a.ret);
  for(const k of [0,3]){
    const q=at.slice(k); const r=resumen(q.map(x=>x.ret));
    console.log("      todos sin los "+k+" mejores  n="+r.n+"  media "+pc(r.media)+"  "+d0(media(q.map(x=>x.dol)))+"/op");
  }
}

// D) CAMINO DEL DINERO ano a ano, acumulado
console.log("\n==== D) EL CAMINO DEL DINERO, 1 contrato, dia a dia ====");
{
  let acum=0; const porAno={};
  for(const f of barato){ acum+=f.op.dol; porAno[f.ano]=(porAno[f.ano]||0)+f.op.dol; }
  console.log("   total acumulado en "+n2(ANOS)+" anos: "+d0(acum)+"  ("+d0(acum/ANOS)+"/ano)");
  for(const a of Object.keys(porAno).sort()) console.log("      "+a+": "+d0(porAno[a]));
  const arr=barato.map(f=>f.op.dol);
  console.log("   operaciones ganadoras "+arr.filter(x=>x>0).length+"/"+arr.length+"  |  mediana "+d0(mediana(arr))+"  |  peor "+d0(Math.min(...arr))+"  |  mejor "+d0(Math.max(...arr)));
  // racha de perdida maxima
  let pico=0, cur=0, dd=0;
  for(const f of barato){ cur+=f.op.dol; if(cur>pico) pico=cur; if(pico-cur>dd) dd=pico-cur; }
  console.log("   peor bajon acumulado (1 contrato): "+d0(-dd));
}
