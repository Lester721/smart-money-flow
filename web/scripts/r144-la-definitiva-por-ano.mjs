// ══ LA DEFINITIVA, AÑO A AÑO ══ Lester, 2026-08-29: «muéstrame la tabla por año de ganancia,
// caída y descansando en SPY».
//
// LA CONFIGURACIÓN: la única de las 240 cuyo VECINDARIO está de acuerdo con ella.
//   dispersión del vecindario 0,04 (todo lo demás: 0,16 a 0,35)
//   peor vecino 0,67 (todo lo demás: 0,37 a 0,58)
//   Dos criterios de robustez independientes eligen la misma familia.
// Castigo de media horquilla MEDIDA (r140) en todas las filas.
process.env.CAMINOS = "largo-p25-d400.json";
const M = await import("./motor-cartera.mjs");
for (const o of M.OPS) if (o.ma >= 0) o.ma = 999;
const CAST = 0.5*0.0276, CAP = 60000;
const D = x => (x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
const pct = (x,n=0)=>(x>=0?"+":"−")+Math.abs(x).toFixed(n)+"%";
const spy1 = M.spyApalancado(1);
const CF = { tam:0.12, huecos:2, modo:"spy", plazo:120, castigo:CAST };
const qS = M.simular({...CF, capital:CAP});
const qE = M.simular({...CF, modo:"efectivo", capital:CAP});
const bS = M.banda(CF), bE = M.banda({...CF, modo:"efectivo"});
console.log("");
console.log("  ══ LA PALANCA — versión definitiva ══");
console.log("  CALL · 25% dentro · ~400 días · 2 huecos al 12% · aguante 120 días · sin freno");
console.log("  compra al ask cuando la acción está bajo su media de 20 · vende al bid · suelo 0,50x");
console.log("  castigo de ejecución: media horquilla medida  ·  capital " + D(CAP));
console.log("");
console.log("  " + "".padEnd(30) + "al año".padStart(9) + "caída".padStart(8) + "Sharpe".padStart(8) + "acaba en".padStart(13));
console.log("  " + "el ocioso EN SPY".padEnd(30) + (bS.a.toFixed(1)+"%").padStart(9) + ("−"+bS.c.toFixed(0)+"%").padStart(8) +
  bS.s.toFixed(2).padStart(8) + D(qS.final).padStart(13));
console.log("  " + "el ocioso en EFECTIVO al 3,3%".padEnd(30) + (bE.a.toFixed(1)+"%").padStart(9) + ("−"+bE.c.toFixed(0)+"%").padStart(8) +
  bE.s.toFixed(2).padStart(8) + D(qE.final).padStart(13));
console.log("  " + "comprar SPY y dormir".padEnd(30) + (spy1.cagr.toFixed(1)+"%").padStart(9) + ("−"+spy1.caida.toFixed(0)+"%").padStart(8) +
  spy1.sharpe.toFixed(2).padStart(8) + D(spy1.final).padStart(13));
console.log("");
console.log("  ══ AÑO A AÑO ══");
console.log("");
console.log("  " + "año".padEnd(6) + "LA PALANCA".padStart(24) + "  │" + "comprar SPY".padStart(20) + "  │" + "ops".padStart(5));
console.log("  " + " ".repeat(6) + "valor    % año   caída".padStart(24) + "  │" + "% año   caída".padStart(20) + "  │");
const idxDe = y => M.DD.map((d,i)=>[d,i]).filter(([d])=>d.startsWith(y)).map(([,i])=>i);
const spyV = M.DD.map(d => CAP * M.SPY[d] / M.SPY[M.DD[0]]);
for (const y of ["2016","2017","2018","2019","2020","2021","2022","2023","2024","2025","2026"]) {
  const I = idxDe(y); if (!I.length) continue;
  const cel = (V) => { const a = I[0]===0?CAP:V[I[0]-1], b = V[I[I.length-1]];
    let pk=a,pr=0; for(const i of I){if(V[i]>pk)pk=V[i]; const d=1-V[i]/pk; if(d>pr)pr=d;}
    return { r:100*(b/a-1), dd:100*pr, v:b }; };
  const p = cel(qS.V), s = cel(spyV);
  console.log("  " + y.padEnd(6) +
    (D(p.v).padStart(11) + pct(p.r).padStart(8) + ("−"+p.dd.toFixed(0)+"%").padStart(7)).padStart(24) + "  │" +
    (pct(s.r).padStart(11) + ("−"+s.dd.toFixed(0)+"%").padStart(7)).padStart(20) + "  │" +
    String(qS.tom.filter(o=>o.y===y).length).padStart(5)); }
console.log("");
const g = qS.tom.filter(x=>x.mult>1).length;
console.log("  TOTAL: " + D(qS.final) + "  ·  " + bS.a.toFixed(1) + "% al año  ·  caída máxima −" + bS.c.toFixed(0) +
  "%  ·  " + qS.ops + " operaciones (" + (qS.ops/10.6).toFixed(1) + "/año)  ·  acierta " +
  (100*g/qS.ops).toFixed(0) + "%");
console.log("  invertido de media: " + qS.invertido.toFixed(0) + "% de la cuenta. El resto, en SPY.");
console.log("");
console.log("  ⚠️ 2021-2026 sigue rindiendo menos que SPY (Sharpe 0,40 contra ~0,72). No está resuelto.");
console.log("");
