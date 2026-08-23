import { diasDisponibles, cargarDia, operar, idxHora, rejilla, compraEn } from "./lib0dte.mjs";
const dias = diasDisponibles(); const fichas=[];
for (const d of dias){
  const D=cargarDia(d); if(!D) continue;
  const i0=idxHora(D,"09:35"); if(i0<0) continue;
  const b0=D.barras[i0], spot0=b0.spot, K=rejilla(spot0);
  const aC=compraEn(b0,K,"C"), aP=compraEn(b0,K,"P");
  if(!(aC>0)||!(aP>0)) continue;
  const iUlt=D.barras.length-1, iFin=idxHora(D,"15:55")>=0?idxHora(D,"15:55"):iUlt;
  let mom=null; const iE=idxHora(D,"10:00");
  if(iE>i0){const bm=D.barras[iE];const lado=bm.spot>=spot0?"C":"P";mom=operar(D,iE,iFin,rejilla(bm.spot),lado);}
  fichas.push({dia:d,rel:(aC+aP)/spot0,mom});
}
const mediana=v=>{const s=[...v].sort((a,b)=>a-b);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
for(let i=0;i<fichas.length;i++){const p=fichas.slice(Math.max(0,i-20),i).map(f=>f.rel);fichas[i].ratio=p.length>=20?fichas[i].rel/mediana(p):null;}
for(let i=0;i<fichas.length;i++){if(fichas[i].ratio==null){fichas[i].cubo=null;continue;}
  const h=[];for(let j=Math.max(0,i-250);j<i;j++) if(fichas[j].ratio!=null)h.push(fichas[j].ratio);
  if(h.length<60){fichas[i].cubo=null;continue;}
  fichas[i].cubo=Math.min(4,Math.floor(h.filter(x=>x<fichas[i].ratio).length/h.length*5));}
const conCubo=fichas.filter(f=>f.cubo!=null);
const A=(new Date(conCubo.at(-1).dia)-new Date(conCubo[0].dia))/(365.25*24*3600*1000);
const media=v=>v.reduce((a,b)=>a+b,0)/v.length;
const tDe=v=>{const n=v.length,m=media(v);const sd=Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/(n-1));return m*Math.sqrt(n)/sd;};
const ETQ=["1 BARATO","2","3 normal","4","5 CARO"];
console.log(`ventana de la señal: ${conCubo[0].dia} → ${conCubo.at(-1).dia} = ${A.toFixed(2)} años\n`);
console.log(`ESCALERA EN DÓLARES (regla de la casa nº5) — momento 10:00→15:55`);
console.log(`escalón      n   $/op   t($)   media%   t(%)   ops/año   $/AÑO`);
for(let c=0;c<5;c++){
  const g=conCubo.filter(f=>f.cubo===c&&f.mom);
  const d=g.map(f=>f.mom.dolares), r=g.map(f=>f.mom.ret);
  console.log(`${ETQ[c].padEnd(10)} ${String(d.length).padStart(4)} ${media(d).toFixed(0).padStart(6)} ${tDe(d).toFixed(2).padStart(6)} ${(media(r)*100).toFixed(2).padStart(8)}% ${tDe(r).toFixed(2).padStart(6)} ${(d.length/A).toFixed(1).padStart(8)} ${((d.length/A)*media(d)).toFixed(0).padStart(8)}`);
}
const todos=conCubo.filter(f=>f.mom), dt=todos.map(f=>f.mom.dolares);
console.log(`\nCONTROL TONTO (mismo momento, TODOS los días con señal disponible):`);
console.log(`  n=${dt.length}  $/op ${media(dt).toFixed(0)}  t($) ${tDe(dt).toFixed(2)}  media% ${(media(todos.map(f=>f.mom.ret))*100).toFixed(2)}%  ops/año ${(dt.length/A).toFixed(0)}  $/AÑO ${((dt.length/A)*media(dt)).toFixed(0)}`);
const todos2=fichas.filter(f=>f.mom), dt2=todos2.map(f=>f.mom.dolares);
const A2=(new Date(fichas.at(-1).dia)-new Date(fichas[0].dia))/(365.25*24*3600*1000);
console.log(`  (el que usa e9, 1118 días / ${A2.toFixed(2)}a): n=${dt2.length} $/op ${media(dt2).toFixed(0)} media% ${(media(todos2.map(f=>f.mom.ret))*100).toFixed(2)}% $/AÑO ${((dt2.length/A2)*media(dt2)).toFixed(0)}`);
