// ══ ¿CABE DE VERDAD CON $60.000? ══ Lester, 2026-08-29: «espero salir de HOOD y tener $60k».
//
// El backtest YA salta las señales que no caben (n = floor(tope/coste), y si n<1 no opera).
// Pero empieza en $60.000 y acaba en $376.000: los huecos crecen y al final cabe casi todo.
// La pregunta que importa para un forward test que empieza HOY es OTRA:
//   **¿cuántas señales puede tomar de verdad el PRIMER año, con $60.000 y nada más?**
process.env.CAMINOS = "largo-p25-d250.json";
const M = await import("./motor-cartera.mjs");
for (const o of M.OPS) if (o.ma >= 0) o.ma = 999;
const CAST = 0.5*0.0244;
const D = x => (x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
const q = (X,p) => { const S=[...X].sort((a,b)=>a-b); return S[Math.floor(p*(S.length-1))]; };
const COSTES = M.OPS.filter(o=>o.ma<0).map(o=>o.coste);
console.log("");
console.log("  ══ EL PROBLEMA, EN CRUDO ══");
console.log("  coste del contrato (25% dentro, 250d):  p10 " + D(q(COSTES,0.1)) + "  ·  MEDIANA " +
  D(q(COSTES,0.5)) + "  ·  p75 " + D(q(COSTES,0.75)) + "  ·  p90 " + D(q(COSTES,0.9)));
console.log("");
console.log("  " + "hueco de…".padEnd(16) + "= tamaño con $60.000".padStart(24) + "% de señales que CABEN".padStart(26));
for (const t of [0.08,0.10,0.12,0.15,0.20,0.25,0.30]) {
  const tope = 60000*t;
  console.log("  " + ((100*t).toFixed(0)+"% por posición").padEnd(16) + D(tope).padStart(24) +
    ((100*COSTES.filter(c=>c<=tope).length/COSTES.length).toFixed(0)+"%").padStart(26)); }
console.log("");
console.log("  ══ Y EN LA PRÁCTICA: OPERACIONES POR AÑO empezando con $60.000 ══");
console.log("  (el motor ya salta lo que no cabe; aquí se ve cuánto duele al principio)");
console.log("");
console.log("  " + "config".padEnd(14) + "2016".padStart(6) + "2017".padStart(6) + "2018".padStart(6) +
  "2019".padStart(6) + "2020".padStart(6) + "2021".padStart(6) + "2022".padStart(6) + "2023".padStart(6) +
  "2024".padStart(6) + "2025".padStart(6) + "  total   al año");
const CF = [[2,0.10],[3,0.10],[2,0.15],[2,0.20],[3,0.15],[4,0.15]];
for (const [h,t] of CF) {
  const s = M.simular({tam:t,huecos:h,modo:"spy",plazo:90,castigo:CAST,capital:60000});
  let l = "  " + (h+"×"+(100*t).toFixed(0)+"%").padEnd(14);
  for (const y of ["2016","2017","2018","2019","2020","2021","2022","2023","2024","2025"])
    l += String(s.tom.filter(x=>x.y===y).length).padStart(6);
  l += String(s.ops).padStart(7) + (s.ops/10.6).toFixed(1).padStart(9);
  console.log(l); }
console.log("");
console.log("  ══ ¿Y SI EMPEZARA HOY? los 3 primeros años, con $60.000 ══");
console.log("  " + "config".padEnd(14) + "ops año 1".padStart(11) + "ops año 2".padStart(11) +
  "ops año 3".padStart(11) + "  valor al final del año 3");
for (const [h,t] of CF) {
  const s = M.simular({tam:t,huecos:h,modo:"spy",plazo:90,castigo:CAST,capital:60000});
  const n = (y) => s.tom.filter(x=>x.y===y).length;
  const iFin = M.DD.map((d,i)=>[d,i]).filter(([d])=>d.startsWith("2018")).map(([,i])=>i).pop();
  console.log("  " + (h+"×"+(100*t).toFixed(0)+"%").padEnd(14) + String(n("2016")).padStart(11) +
    String(n("2017")).padStart(11) + String(n("2018")).padStart(11) + D(s.V[iFin]).padStart(26)); }
console.log("");
console.log("  ══ ¿CUÁNTO TARDA UN FORWARD TEST EN DECIR ALGO? ══");
console.log("");
for (const [h,t] of [[2,0.10],[3,0.10]]) {
  const s = M.simular({tam:t,huecos:h,modo:"spy",plazo:90,castigo:CAST,capital:60000});
  const R = s.tom.map(x=>x.mult-1);
  const m = R.reduce((a,x)=>a+x,0)/R.length;
  const sd = Math.sqrt(R.reduce((a,x)=>a+(x-m)**2,0)/(R.length-1));
  const porAno = R.length/10.6;
  // operaciones necesarias para t=2 con este tamaño de efecto
  const nNec = Math.ceil(Math.pow(2*sd/m, 2));
  console.log("  " + h+"×"+(100*t).toFixed(0)+"%:  " + (100*m).toFixed(1) + "% por operación · desviación " +
    (100*sd).toFixed(0) + "% · " + porAno.toFixed(1) + " ops/año");
  console.log("     para t=2 hacen falta " + nNec + " operaciones  →  **" + (nNec/porAno).toFixed(1) + " AÑOS** de forward test");
  console.log(""); }
