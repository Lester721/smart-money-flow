import { diasDisponibles, cargarDia, idxHora, rejilla, compraEn, ventaEn, resumen } from "./lib0dte.mjs";
const H="11:00", N=25, OFF=10, SAL="13:00";
const dias = diasDisponibles(); const ops=[]; const diasUsados=[];
for (const dia of dias) {
  const d = cargarDia(dia); if (!d) continue;
  const ap = d.barras[0].spot; if(!(ap>0)) continue; diasUsados.push(dia);
  const iE = idxHora(d,H); if(iE<0) continue;
  const sp = d.barras[iE].spot, dv = sp-ap;
  let lado = dv>=N?"C":(dv<=-N?"P":null); if(!lado) continue;
  const K = lado==="C"?rejilla(sp)+OFF:rejilla(sp)-OFF;
  const iS = idxHora(d,SAL); const ask=compraEn(d.barras[iE],K,lado), bid=iS>iE?ventaEn(d.barras[iS],K,lado):null;
  if(!(ask>0)||bid==null) continue;
  ops.push({dia,lado,ask,bid,ret:(bid-ask)/ask,dol:(bid-ask)*100, idx:diasUsados.length-1});
}
const anios = diasUsados.length/252;
const F=(a,et)=>{ if(a.length<2) return `${et} n=${a.length} —`; const r=resumen(a.map(o=>o.ret)); const md=a.reduce((s,o)=>s+o.dol,0)/a.length;
  return `${et.padEnd(26)} n=${String(r.n).padStart(3)}  media ${(r.media*100).toFixed(2).padStart(7)}%  t=${r.t.toFixed(2).padStart(5)}  mediana ${(100*a.map(o=>o.ret).sort((x,y)=>x-y)[Math.floor(a.length/2)]).toFixed(1).padStart(6)}%  $/op ${md.toFixed(0).padStart(5)}  $/año ${((a.length/anios)*md).toFixed(0).padStart(7)}  total $${a.reduce((s,o)=>s+o.dol,0).toFixed(0)}`; };
console.log(F(ops,"TODAS"));
const sd=[...ops].sort((a,b)=>b.dol-a.dol);
console.log("\nlas 10 mejores por DÓLARES:");
for(const o of sd.slice(0,10)) console.log(`  ${o.dia} ${o.lado} ask ${o.ask.toFixed(2)} bid ${o.bid.toFixed(2)}  $${o.dol.toFixed(0)}  (${(100*o.ret).toFixed(0)}%)`);
console.log();
console.log(F(sd.slice(1),"sin la MEJOR (1)"));
console.log(F(sd.slice(3),"sin las 3 mejores"));
console.log(F(sd.slice(5),"sin las 5 mejores"));
console.log(F(sd.slice(10),"sin las 10 mejores"));
const totD=ops.reduce((s,o)=>s+o.dol,0);
console.log(`\nGanancia total $${totD.toFixed(0)} · las 5 mejores aportan $${sd.slice(0,5).reduce((s,o)=>s+o.dol,0).toFixed(0)} (${(100*sd.slice(0,5).reduce((s,o)=>s+o.dol,0)/totD).toFixed(0)}%) · las 10 mejores $${sd.slice(0,10).reduce((s,o)=>s+o.dol,0).toFixed(0)} (${(100*sd.slice(0,10).reduce((s,o)=>s+o.dol,0)/totD).toFixed(0)}%)`);
// mitades y tercios EN DÓLARES
const nD=diasUsados.length;
const rec=(lo,hi,et)=>F(ops.filter(o=>o.idx>=lo&&o.idx<hi),et);
console.log();
console.log(rec(0,Math.floor(nD/2),"MITAD 1"));
console.log(rec(Math.floor(nD/2),nD,"MITAD 2"));
console.log(rec(0,Math.floor(nD/3),"TERCIO 1"));
console.log(rec(Math.floor(nD/3),Math.floor(2*nD/3),"TERCIO 2"));
console.log(rec(Math.floor(2*nD/3),nD,"TERCIO 3"));
// por año natural
console.log();
for(const y of ["2022","2023","2024","2025","2026"]) console.log(rec(diasUsados.findIndex(x=>x.startsWith(y)), diasUsados.findLastIndex(x=>x.startsWith(y))+1, "AÑO "+y));
// por lado
console.log();
console.log(F(ops.filter(o=>o.lado==="C"),"solo CALLS (tras subida)"));
console.log(F(ops.filter(o=>o.lado==="P"),"solo PUTS (tras bajada)"));
// N en % en vez de puntos
