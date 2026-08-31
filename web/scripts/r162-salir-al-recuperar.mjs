// ══ SALIR CUANDO LA ACCIÓN RECUPERA SU MEDIA ══ Lester: «pruébalo, optimiza lo que puedas».
//
// EL MECANISMO: LA PALANCA compra una caída apalancada. La tesis se cumple cuando la acción
// se recupera. Hoy aguantamos 120 días pase lo que pase — si recupera el día 10, seguimos
// dentro 110 días más sin razón; si no recupera nunca, salimos igual a los 120.
//
// El techo de una salida perfecta es +0,510 de Sharpe (r158), cinco veces el del régimen.
// Ésta es la primera regla de salida con MECANISMO, no un stop numérico.
//
// Precios AJUSTADOS por split (r161): sin eso, «recuperó su media» es basura 200 días después
// de cada split.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
process.env.CAMINOS = "largo-p25-d400.json";
const M = await import("./motor-cartera.mjs");
const PX = JSON.parse(readFileSync(join(CACHE, "precios-ajustados.json"), "utf8"));
const gm = M.OPS.map(o=>o.ma), CAST=0.5*0.0276;
const q=(X,p)=>{const S=[...X].sort((a,b)=>a-b);return S[Math.floor(p*(S.length-1))];};
const D=x=>"$"+Math.round(x).toLocaleString("en-US");
const b41=(cf)=>{const S=[],A=[],C=[],O=[],F=[];
  for(let i=0;i<41;i++){const r=M.simular({...cf,capital:60000*(1+(i-20)*0.005)});
    S.push(r.sharpe);A.push(r.cagr);C.push(r.caida);O.push(r.ops);F.push(r.final);}
  return {s:q(S,0.5),a:q(A,0.5),c:q(C,0.5),ops:q(O,0.5),fin:q(F,0.5)};};

// series por ticker con medias precalculadas
const SER = new Map();
for (const tk of Object.keys(PX)) {
  const Dd = Object.keys(PX[tk]).sort(), P = Dd.map(d=>PX[tk][d]);
  const iD = new Map(Dd.map((d,i)=>[d,i]));
  const MAS = {};
  for (const n of [10,20,50]) { const m = new Array(P.length).fill(null); let sum=0;
    for (let i=0;i<P.length;i++){ if(i>=n){ sum += P[i-1]-P[i-1-n]; m[i]=P[i]/(sum/n)-1; } else if(i>0) sum+=P[i-1]; }
    MAS[n]=m; }
  SER.set(tk, {Dd,P,iD,MAS});
}
// para cada operación: el día en que la acción vuelve por encima de su media (con margen)
function marcarRec(nMA, margen, espera) {
  let con=0, sin=0, dias=[];
  for (const o of M.OPS) {
    o.iRec = null;
    const S = SER.get(o.tk); if (!S) continue;
    const m = S.MAS[nMA];
    for (let j = 0; j < o.camino.length; j++) {
      const i = S.iD.get(o.camino[j][0]); if (i == null || m[i] == null) continue;
      if (m[i] > margen) {
        const k = Math.min(o.camino.length-1, j + espera);
        o.iRec = k; break; }
    }
    if (o.ma < 0 && o.ma > -0.30) { if (o.iRec != null) { con++; dias.push(o.iRec); } else sin++; }
  }
  dias.sort((a,b)=>a-b);
  return { con, sin, mediana: dias.length ? dias[Math.floor(dias.length/2)] : null };
}
for(let i=0;i<M.OPS.length;i++) M.OPS[i].ma=(gm[i]>=0||gm[i]<-0.30)?999:gm[i];
const base = b41({tam:0.12,huecos:2,modo:"spy",plazo:120,castigo:CAST});
console.log("");
console.log("  hoy (120 días fijos): "+base.a.toFixed(1)+"% · −"+base.c.toFixed(0)+"% · Sharpe "+base.s.toFixed(2)+" · "+D(base.fin));
console.log("  techo de la salida perfecta: Sharpe 1.23   ·   comprar SPY: 0.70");
const inf = marcarRec(20, 0, 0);
console.log("  recuperan su media de 20 dentro del plazo: "+inf.con+" de "+(inf.con+inf.sin)+
  "   ·   mediana: día "+inf.mediana);
console.log("");
console.log("  ══ SALIR AL RECUPERAR ══  (aguante ampliado a 250; la recuperación manda)");
console.log("");
console.log("  "+"media / margen / espera".padEnd(30)+"al año".padStart(9)+"caída".padStart(8)+
  "Sharpe".padStart(8)+"ops".padStart(6)+"$60.000 →".padStart(13));
const fila=(n,r)=>{console.log("  "+n.padEnd(30)+(r.a.toFixed(1)+"%").padStart(9)+("−"+r.c.toFixed(0)+"%").padStart(8)+
  r.s.toFixed(2).padStart(8)+String(r.ops).padStart(6)+D(r.fin).padStart(13)); return r.s;};
fila("120 días fijos (lo de hoy)", base);
const T={};
for (const nMA of [10,20,50]) for (const mar of [0, 0.02, 0.05]) {
  marcarRec(nMA, mar, 0);
  for(let i=0;i<M.OPS.length;i++) if(gm[i]>=0||gm[i]<-0.30) M.OPS[i].ma=999; else M.OPS[i].ma=gm[i];
  const r = b41({tam:0.12,huecos:2,modo:"spy",plazo:250,castigo:CAST,usarRec:true});
  T[nMA+"|"+mar] = r.s;
  fila("media "+nMA+"  ·  +"+(100*mar).toFixed(0)+"%  ·  al día", r);
}
console.log("");
const vals = Object.values(T);
const gan = vals.filter(x=>x>base.s+0.02).length;
console.log("  ganan "+gan+" de "+vals.length+"   ·   rango "+Math.min(...vals).toFixed(2)+" a "+Math.max(...vals).toFixed(2));
console.log("");
console.log("  ══ Y CON ESPERA DESPUÉS DE RECUPERAR ══  (dejar correr unos días más)");
console.log("");
console.log("  "+"espera tras recuperar".padEnd(30)+"al año".padStart(9)+"caída".padStart(8)+
  "Sharpe".padStart(8)+"ops".padStart(6)+"$60.000 →".padStart(13));
const E={};
for (const esp of [0, 5, 10, 20, 40, 60]) {
  marcarRec(20, 0, esp);
  for(let i=0;i<M.OPS.length;i++) if(gm[i]>=0||gm[i]<-0.30) M.OPS[i].ma=999; else M.OPS[i].ma=gm[i];
  E[esp] = fila(esp+" días más", b41({tam:0.12,huecos:2,modo:"spy",plazo:250,castigo:CAST,usarRec:true}));
}
console.log("");
const ev = Object.values(E), eg = ev.filter(x=>x>base.s+0.02).length;
console.log("  ganan "+eg+" de "+ev.length+"   ·   rango "+Math.min(...ev).toFixed(2)+" a "+Math.max(...ev).toFixed(2));
console.log("  ¿monótono en la espera? "+ev.map(x=>x.toFixed(2)).join(" → "));
console.log("");
