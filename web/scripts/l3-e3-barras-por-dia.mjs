import { diasDisponibles, cargarDia, idxHora } from "./lib0dte.mjs";
const dias = diasDisponibles();
let sin930 = 0; const primeras = new Map(); const ultimas = new Map();
const nbar = new Map();
let usados=0, desc=0;
for (const dia of dias) {
  const d = cargarDia(dia); if (!d) { desc++; continue; } usados++;
  const i = idxHora(d, "09:30");
  if (i < 0) sin930++;
  primeras.set(d.barras[0].t, (primeras.get(d.barras[0].t)||0)+1);
  ultimas.set(d.barras[d.barras.length-1].t, (ultimas.get(d.barras[d.barras.length-1].t)||0)+1);
  nbar.set(d.barras.length, (nbar.get(d.barras.length)||0)+1);
}
console.log("dias csv:", dias.length, "usados:", usados, "descartados:", desc);
console.log("dias SIN barra 09:30:", sin930);
console.log("primera barra:", [...primeras].sort((a,b)=>b[1]-a[1]).slice(0,8));
console.log("ultima barra:", [...ultimas].sort((a,b)=>b[1]-a[1]).slice(0,8));
console.log("nº barras:", [...nbar].sort((a,b)=>b[1]-a[1]).slice(0,8));
console.log("rango:", dias[0], dias[dias.length-1]);
