// ══ OPTIMIZAR LA SALIDA ══ el techo es +0,510 de Sharpe (r158), cinco veces el del régimen.
// Aguantamos 120 días pase lo que pase. El oráculo que vende en el máximo da Sharpe 1,23.
// Aquí se prueban salidas HONESTAS, todas con el vecindario a la vista.
process.env.CAMINOS = "largo-p25-d400.json";
const M = await import("./motor-cartera.mjs");
const gm = M.OPS.map(o=>o.ma), CAST=0.5*0.0276;
const q=(X,p)=>{const S=[...X].sort((a,b)=>a-b);return S[Math.floor(p*(S.length-1))];};
const b41=(cf)=>{const S=[],A=[],C=[],O=[],F=[];
  for(let i=0;i<41;i++){const r=M.simular({...cf,capital:60000*(1+(i-20)*0.005)});
    S.push(r.sharpe);A.push(r.cagr);C.push(r.caida);O.push(r.ops);F.push(r.final);}
  return {s:q(S,0.5),a:q(A,0.5),c:q(C,0.5),ops:q(O,0.5),fin:q(F,0.5)};};
for(let i=0;i<M.OPS.length;i++) M.OPS[i].ma=(gm[i]>=0||gm[i]<-0.30)?999:gm[i];
const D=x=>"$"+Math.round(x).toLocaleString("en-US");
const CF={tam:0.12,huecos:2,modo:"spy",castigo:CAST};
console.log("");
const base=b41({...CF,plazo:120});
console.log("  hoy: "+base.a.toFixed(1)+"% · −"+base.c.toFixed(0)+"% · Sharpe "+base.s.toFixed(2)+" · "+D(base.fin));
console.log("  techo de la salida perfecta: Sharpe 1.23   ·   comprar SPY: 0.70");
console.log("");
console.log("  ══ EL STOP QUE SIGUE AL MÁXIMO ══  (aguante ampliado a 250 días para dejarlo correr)");
console.log("");
console.log("  "+"arrastre".padEnd(14)+"al año".padStart(9)+"caída".padStart(8)+"Sharpe".padStart(8)+"ops".padStart(6)+"$60.000 →".padStart(13));
const fila=(n,r)=>console.log("  "+n.padEnd(14)+(r.a.toFixed(1)+"%").padStart(9)+("−"+r.c.toFixed(0)+"%").padStart(8)+
  r.s.toFixed(2).padStart(8)+String(r.ops).padStart(6)+D(r.fin).padStart(13));
fila("sin arrastre", base);
const DS=[];
for (const a of [0.10,0.15,0.20,0.25,0.30,0.35,0.40,0.50]) {
  const r=b41({...CF,plazo:250,arrastre:a}); DS.push({a,s:r.s});
  fila((100*a).toFixed(0)+"% del máx", r); }
console.log("");
const gan=DS.filter(x=>x.s>base.s+0.02).length, disp=Math.max(...DS.map(x=>x.s))-Math.min(...DS.map(x=>x.s));
console.log("  ganan al de hoy: "+gan+" de "+DS.length+"   ·   dispersión del barrido: "+disp.toFixed(3));
console.log("  "+(gan>=5?"⇒ MESETA: no depende de acertar el número":gan>=1?"⇒ sólo "+gan+" ganan — mirar el vecindario":"⇒ el arrastre no mejora"));
console.log("");
console.log("  ══ Y SI SÓLO SE ARMA DESPUÉS DE SUBIR ══  (dejar correr al principio)");
console.log("");
console.log("  "+"arrastre / armado".padEnd(20)+"al año".padStart(9)+"caída".padStart(8)+"Sharpe".padStart(8)+"ops".padStart(6)+"$60.000 →".padStart(13));
for (const a of [0.20,0.30]) for (const mn of [1.2,1.5,2.0])
  fila2(a,mn,b41({...CF,plazo:250,arrastre:a,minArrastre:mn}));
function fila2(a,mn,r){console.log("  "+((100*a).toFixed(0)+"% tras "+mn+"x").padEnd(20)+(r.a.toFixed(1)+"%").padStart(9)+
  ("−"+r.c.toFixed(0)+"%").padStart(8)+r.s.toFixed(2).padStart(8)+String(r.ops).padStart(6)+D(r.fin).padStart(13));}
console.log("");
