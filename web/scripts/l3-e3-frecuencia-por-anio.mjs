import { diasDisponibles, cargarDia, idxHora, rejilla, compraEn, ventaEn } from "./lib0dte.mjs";
const H="11:00", N=25;
const dias = diasDisponibles();
const porAnio = {};
for (const dia of dias) {
  const d = cargarDia(dia); if(!d) continue;
  const y = dia.slice(0,4); porAnio[y] ??= {dias:0, disp:0, pct:[]};
  porAnio[y].dias++;
  const ap = d.barras[0].spot; const iE = idxHora(d,H); if(iE<0) continue;
  const dv = d.barras[iE].spot - ap;
  porAnio[y].pct.push(100*N/ap);
  if (Math.abs(dv) >= N) porAnio[y].disp++;
}
console.log("año   días  disparos  disparos/252d   25 pts = % del índice");
for (const [y,v] of Object.entries(porAnio))
  console.log(`${y}  ${String(v.dias).padStart(4)}  ${String(v.disp).padStart(6)}     ${(252*v.disp/v.dias).toFixed(0).padStart(6)}          ${(v.pct.reduce((a,b)=>a+b,0)/v.pct.length).toFixed(3)} %`);
