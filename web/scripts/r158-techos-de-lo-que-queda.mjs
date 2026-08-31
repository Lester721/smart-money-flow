// ══ EL TECHO DE LO QUE QUEDA ══ Lester, 2026-08-29: «¿algo más que valga la pena optimizar?»
//
// LA LECCIÓN DE HOY: medir el TECHO antes de buscar la regla, no después. Si hubiera medido
// el techo del régimen el primer día (+0,093) no habría montado un workflow de cinco agentes
// para perseguir algo que como mucho valía 8 puntos.
//
// Quedan dos diales sin tocar. Aquí NO se optimizan: se mide cuánto PODRÍAN valer como máximo.
//   1. LA DIRECCIÓN: el motor coge las 2 más hundidas. ¿Y las 2 más fuertes?
//   2. LA SALIDA: salimos a 120 días fijos. ¿Cuánto valdría la salida PERFECTA?
process.env.CAMINOS = "largo-p25-d400.json";
const M = await import("./motor-cartera.mjs");
const gm = M.OPS.map(o => o.ma);
const CAST = 0.5*0.0276;
const q=(X,p)=>{const S=[...X].sort((a,b)=>a-b);return S[Math.floor(p*(S.length-1))];};
const b41=(cf)=>{const S=[],A=[],C=[],O=[];
  for(let i=0;i<41;i++){const r=M.simular({...cf,capital:60000*(1+(i-20)*0.005)});
    S.push(r.sharpe);A.push(r.cagr);C.push(r.caida);O.push(r.ops);}
  return {s:q(S,0.5),a:q(A,0.5),c:q(C,0.5),ops:q(O,0.5)};};
const limpio = () => { for(let i=0;i<M.OPS.length;i++) M.OPS[i].ma = (gm[i]>=0||gm[i]<-0.30)?999:gm[i]; };
const CF = {tam:0.12,huecos:2,modo:"spy",plazo:120,castigo:CAST};
console.log("");
limpio();
const base = b41(CF);
console.log("  LA PALANCA de hoy: "+base.a.toFixed(1)+"% · caída −"+base.c.toFixed(0)+"% · Sharpe "+base.s.toFixed(2)+" · "+base.ops+" ops");
console.log("  comprar SPY:       14.9% · caída −34% · Sharpe 0.70");
console.log("");
console.log("  ══ 1 · LA DIRECCIÓN — ¿hundidas o fuertes? ══");
console.log("");
console.log("  "+"qué se elige".padEnd(34)+"al año".padStart(9)+"caída".padStart(8)+"Sharpe".padStart(8)+"ops".padStart(6));
const fila=(n,r)=>console.log("  "+n.padEnd(34)+(r.a.toFixed(1)+"%").padStart(9)+("−"+r.c.toFixed(0)+"%").padStart(8)+r.s.toFixed(2).padStart(8)+String(r.ops).padStart(6));
limpio(); fila("las 2 MÁS HUNDIDAS (lo de hoy)", b41(CF));
// invertir el orden: el motor ordena por `ma` ascendente, así que negando se coge la MENOS hundida
for(let i=0;i<M.OPS.length;i++) M.OPS[i].ma = (gm[i]>=0||gm[i]<-0.30)?999:(-1e-9 - (0.30 + gm[i]));
fila("las 2 MENOS hundidas", b41(CF));
// y las más fuertes de todas: candidatas SOBRE su media, ordenadas por fuerza
for(let i=0;i<M.OPS.length;i++) M.OPS[i].ma = gm[i] > 0.02 ? -gm[i] : 999;
fila("las 2 MÁS FUERTES (sobre su media)", b41(CF));
// aleatorio, como control de que la ordenación importa
let sem=12345; const rnd=()=>{sem=(sem*1103515245+12345)%2147483648; return sem/2147483648;};
for(let i=0;i<M.OPS.length;i++) M.OPS[i].ma = (gm[i]>=0||gm[i]<-0.30)?999:-rnd();
fila("AL AZAR entre las hundidas (control)", b41(CF));
console.log("");
console.log("  ══ 2 · EL TECHO DE LA SALIDA ══  ¿cuánto valdría salir PERFECTO?");
console.log("  (se le da a la salida el camino entero: vende en el máximo. Es trampa, es el techo.)");
console.log("");
limpio();
console.log("  "+"regla de salida".padEnd(34)+"al año".padStart(9)+"caída".padStart(8)+"Sharpe".padStart(8));
fila("120 días fijos (lo de hoy)", b41(CF));
for (const pl of [60, 90, 150, 200]) fila(pl+" días fijos", b41({...CF, plazo:pl}));
// ORÁCULO: reescribir cada camino para que termine en su MÁXIMO dentro de los 120 días
const orig = M.OPS.map(o => o.camino);
for (let i=0;i<M.OPS.length;i++){ const c=orig[i].slice(0,120);
  let mx=0,im=0; for(let j=0;j<c.length;j++) if(c[j][1]>mx){mx=c[j][1];im=j;}
  M.OPS[i].camino = c.slice(0, im+1); }
limpio();
const oracSal = b41({...CF, plazo:250});
fila("ORÁCULO: vender en el MÁXIMO", oracSal);
for (let i=0;i<M.OPS.length;i++) M.OPS[i].camino = orig[i];
console.log("");
console.log("  ⇒ el techo de una salida perfecta: +"+(oracSal.s-base.s).toFixed(3)+" de Sharpe y +"+
  (oracSal.a-base.a).toFixed(1)+" puntos al año");
console.log("  ⇒ para comparar, el techo del régimen era +0.093");
console.log("");
