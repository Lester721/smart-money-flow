// LENTE 3 — traza operación a operación la celda ganadora: momento, T=11:00, N=25, off=10, +2h
import { diasDisponibles, cargarDia, idxHora, rejilla, compraEn, ventaEn, resumen } from "./lib0dte.mjs";
const H="11:00", N=25, OFF=10, SAL="13:00";
const dias = diasDisponibles();
const ops=[]; let disparos=0, huecosCell=0; const huecoDetalle=[];
const diasUsados=[];
for (const dia of dias) {
  const d = cargarDia(dia); if (!d) continue;
  const iOpen = idxHora(d,"09:30")>=0 ? idxHora(d,"09:30") : 0;
  const apertura = d.barras[iOpen].spot; if (!(apertura>0)) continue;
  diasUsados.push(dia);
  const iE = idxHora(d,H); if (iE<0) continue;
  const spot = d.barras[iE].spot; const dv = spot - apertura;
  let lado=null;
  if (dv >= N) lado="C"; else if (dv <= -N) lado="P"; else continue;
  disparos++;
  const base = rejilla(spot);
  const K = lado==="C" ? base+OFF : base-OFF;
  const iS = idxHora(d,SAL);
  const ask = compraEn(d.barras[iE],K,lado);
  const bid = iS>iE ? ventaEn(d.barras[iS],K,lado) : null;
  if (!(ask>0) || bid==null) { huecosCell++; huecoDetalle.push({dia,lado,K,ask,bid,tOpen:d.barras[iOpen].t}); continue; }
  ops.push({dia, tOpen:d.barras[iOpen].t, aperturaSpot:apertura, spot11:spot, dv:+dv.toFixed(2), lado, K, ask, bid, ret:(bid-ask)/ask, dol:(bid-ask)*100});
}
const r = resumen(ops.map(o=>o.ret));
const mediaDol = ops.reduce((a,o)=>a+o.dol,0)/ops.length;
const anios = diasUsados.length/252;
console.log(`dias usados ${diasUsados.length}  disparos ${disparos}  ops ${ops.length}  huecos en la celda ${huecosCell}`);
console.log(`n=${r.n} media ${(r.media*100).toFixed(2)}% t=${r.t.toFixed(3)} aciertos ${(100*r.aciertos).toFixed(1)}% $/op ${mediaDol.toFixed(2)} $/año ${((r.n/anios)*mediaDol).toFixed(0)}`);
console.log("huecos:", JSON.stringify(huecoDetalle));
// años de calendario reales
const y0=new Date(diasUsados[0]), y1=new Date(diasUsados[diasUsados.length-1]);
const aniosCal = (y1-y0)/(365.25*24*3600*1000);
console.log(`años segun n/252 = ${anios.toFixed(3)} · años de CALENDARIO = ${aniosCal.toFixed(3)} → $/año calendario ${((r.n/aniosCal)*mediaDol).toFixed(0)}`);
// las dos operaciones a verificar a mano: la primera y la ultima
console.log("\nPRIMERA:", JSON.stringify(ops[0]));
console.log("ULTIMA :", JSON.stringify(ops[ops.length-1]));
// una PUT tambien, para verificar el otro lado
const primeraPut = ops.find(o=>o.lado==="P");
console.log("PRIMERA PUT:", JSON.stringify(primeraPut));
// la mas ganadora y la mas perdedora
const s=[...ops].sort((a,b)=>b.ret-a.ret);
console.log("MEJOR :", JSON.stringify(s[0]));
console.log("PEOR  :", JSON.stringify(s[s.length-1]));
// distribucion
const ceros = ops.filter(o=>o.bid===0).length;
console.log(`\noperaciones con bid de salida = 0 (perdida total, NO hueco): ${ceros}`);
const cont = ops.map(o=>o.ret).sort((a,b)=>a-b);
console.log("percentiles ret:", [0,.1,.25,.5,.75,.9,.99,1].map(p=>(cont[Math.min(cont.length-1,Math.floor(p*cont.length))]*100).toFixed(1)).join(" | "));
// cuanto aporta el TOP 3
const tot = ops.reduce((a,o)=>a+o.ret,0);
console.log(`suma de retornos ${ (tot*100).toFixed(0) }%  ·  top1 aporta ${(s[0].ret*100).toFixed(0)}%  top3 ${(s.slice(0,3).reduce((a,o)=>a+o.ret,0)*100).toFixed(0)}%  top10 ${(s.slice(0,10).reduce((a,o)=>a+o.ret,0)*100).toFixed(0)}%`);
const sinTop3 = resumen(s.slice(3).map(o=>o.ret));
console.log(`sin las 3 mejores: n=${sinTop3.n} media ${(sinTop3.media*100).toFixed(2)}% t=${sinTop3.t.toFixed(2)}`);
