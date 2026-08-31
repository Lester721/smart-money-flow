// ══ REHACER LO QUE r145 MIDIÓ MAL, Y LA SALIDA POR RECUPERACIÓN ══
//
// ⛔ EL FALLO: la media móvil rodante hacía P[-1] = undefined en i=n y toda la serie salía NaN.
//    2.624 de 2.624 valores. Con `ma` = NaN, `x.ma >= 0` es FALSO, así que el motor consideraba
//    ELEGIBLES todas las operaciones (no sólo las hundidas) y ordenaba por NaN.
//    → r145 secciones 1 y 2 («el largo de la media da igual», «el umbral es inerte») ANULADAS.
//    → r162 (salir al recuperar) nunca llegó a correr: 0 de 10.791 recuperaban.
//
// Aquí todo con la media calculada por suma directa y con un CONTROL DE SANIDAD delante.
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
// ── LA MEDIA, BIEN ──
const SER = new Map();
for (const tk of Object.keys(PX)) {
  const Dd=Object.keys(PX[tk]).sort(), P=Dd.map(d=>PX[tk][d]);
  const iD=new Map(Dd.map((d,i)=>[d,i])), MAS={};
  for (const n of [5,10,20,30,50,100]) { const m=new Array(P.length).fill(null);
    for(let i=n;i<P.length;i++){ let s=0; for(let k=i-n;k<i;k++) s+=P[k]; m[i]=P[i]/(s/n)-1; }
    MAS[n]=m; }
  SER.set(tk,{Dd,P,iD,MAS});
}
// CONTROL DE SANIDAD — antes de leer un solo resultado
{ const S=SER.get("AAPL"), m=S.MAS[20];
  const nan=m.filter(x=>x!==null&&!isFinite(x)).length, val=m.filter(x=>x!==null).length;
  console.log("");
  console.log("  ══ CONTROL DE SANIDAD ══");
  console.log("    medias válidas: "+val+"   NaN: "+nan+(nan?"  ⛔ PARAR":"  ✓"));
  if (nan) process.exit(1);
  const bajo = m.filter(x=>x!==null&&x<0).length;
  console.log("    días de AAPL bajo su media de 20: "+bajo+" de "+val+" ("+(100*bajo/val).toFixed(0)+"%)  ✓ plausible"); }
const poner = (n, umb) => { let ok=0;
  for (const o of M.OPS) { const S=SER.get(o.tk); const i=S?S.iD.get(o.dC):null;
    const v = (i!=null&&S.MAS[n][i]!=null) ? S.MAS[n][i] : null;
    o.ma = (v==null || !isFinite(v) || v>=umb || v<-0.30) ? 999 : v; if(o.ma!==999) ok++; }
  return ok; };
const CF={tam:0.12,huecos:2,modo:"spy",plazo:120,castigo:CAST};
console.log("");
poner(20,0);
const base=b41(CF);
console.log("  BASE con la media de 20 BIEN calculada: "+base.a.toFixed(1)+"% · −"+base.c.toFixed(0)+
  "% · Sharpe "+base.s.toFixed(2)+" · "+base.ops+" ops · "+D(base.fin));
console.log("  (r145 decía 21,3% con la media rota; el original con `ma` guardada da 20,9%)");
console.log("");
console.log("  ══ 1 · EL LARGO DE LA MEDIA — REHECHO ══");
console.log("");
console.log("  "+"media".padEnd(14)+"elegibles".padStart(11)+"al año".padStart(9)+"caída".padStart(8)+
  "Sharpe".padStart(8)+"ops".padStart(6)+"$60.000 →".padStart(13));
const R1=[];
for (const n of [5,10,20,30,50,100]) { const el=poner(n,0); const r=b41(CF); R1.push(r.s);
  console.log("  "+(n+" sesiones").padEnd(14)+el.toLocaleString("en-US").padStart(11)+(r.a.toFixed(1)+"%").padStart(9)+
    ("−"+r.c.toFixed(0)+"%").padStart(8)+r.s.toFixed(2).padStart(8)+String(r.ops).padStart(6)+D(r.fin).padStart(13)); }
console.log("");
console.log("  dispersión: "+(Math.max(...R1)-Math.min(...R1)).toFixed(3)+"   "+
  (Math.max(...R1)-Math.min(...R1) < 0.08 ? "→ PLANO de verdad, la media no importa" : "→ SÍ importa, hay que elegir"));
console.log("");
console.log("  ══ 2 · CUÁNTO POR DEBAJO — REHECHO ══  (media de 20)");
console.log("");
console.log("  "+"umbral".padEnd(14)+"elegibles".padStart(11)+"al año".padStart(9)+"caída".padStart(8)+
  "Sharpe".padStart(8)+"ops".padStart(6)+"$60.000 →".padStart(13));
const R2=[];
for (const u of [0,-0.02,-0.04,-0.06,-0.10]) { const el=poner(20,u); const r=b41(CF); R2.push(r.s);
  console.log("  "+(u===0?"sólo debajo":"más de "+(-100*u).toFixed(0)+"%").padEnd(14)+el.toLocaleString("en-US").padStart(11)+
    (r.a.toFixed(1)+"%").padStart(9)+("−"+r.c.toFixed(0)+"%").padStart(8)+r.s.toFixed(2).padStart(8)+
    String(r.ops).padStart(6)+D(r.fin).padStart(13)); }
console.log("");
console.log("  dispersión: "+(Math.max(...R2)-Math.min(...R2)).toFixed(3));
console.log("");
console.log("  ══ 3 · SALIR CUANDO LA ACCIÓN RECUPERA SU MEDIA ══");
console.log("");
function marcar(nMA, margen, espera) { let con=0,sin=0,dd=[];
  for (const o of M.OPS) { o.iRec=null; const S=SER.get(o.tk); if(!S) continue; const m=S.MAS[nMA];
    for (let j=0;j<o.camino.length;j++){ const i=S.iD.get(o.camino[j][0]);
      if(i==null||m[i]==null) continue;
      if(m[i]>margen){ o.iRec=Math.min(o.camino.length-1, j+espera); break; } }
    if(o.ma!==999){ if(o.iRec!=null){con++;dd.push(o.iRec);} else sin++; } }
  dd.sort((a,b)=>a-b); return {con,sin,med:dd.length?dd[Math.floor(dd.length/2)]:null}; }
poner(20,0);
const inf=marcar(20,0,0);
console.log("  recuperan dentro del plazo: "+inf.con+" de "+(inf.con+inf.sin)+
  "  ("+(100*inf.con/(inf.con+inf.sin)).toFixed(0)+"%)   ·   mediana: día "+inf.med+
  (inf.con>0?"   ✓ el mando responde":"   ⛔ SIGUE ROTO"));
console.log("");
console.log("  "+"media / espera".padEnd(24)+"al año".padStart(9)+"caída".padStart(8)+
  "Sharpe".padStart(8)+"ops".padStart(6)+"$60.000 →".padStart(13));
console.log("  "+"120 días fijos (hoy)".padEnd(24)+(base.a.toFixed(1)+"%").padStart(9)+
  ("−"+base.c.toFixed(0)+"%").padStart(8)+base.s.toFixed(2).padStart(8)+String(base.ops).padStart(6)+D(base.fin).padStart(13));
const R3=[];
for (const nMA of [10,20,50]) for (const esp of [0,10,30]) {
  poner(20,0); marcar(nMA,0,esp);
  const r=b41({...CF,plazo:250,usarRec:true}); R3.push({nMA,esp,s:r.s});
  console.log("  "+("media "+nMA+" · +"+esp+" días").padEnd(24)+(r.a.toFixed(1)+"%").padStart(9)+
    ("−"+r.c.toFixed(0)+"%").padStart(8)+r.s.toFixed(2).padStart(8)+String(r.ops).padStart(6)+D(r.fin).padStart(13)); }
console.log("");
const gan=R3.filter(x=>x.s>base.s+0.02).length;
console.log("  ganan al de hoy: "+gan+" de "+R3.length+"   ·   rango "+
  Math.min(...R3.map(x=>x.s)).toFixed(2)+" a "+Math.max(...R3.map(x=>x.s)).toFixed(2));
console.log("  "+(gan>=6?"⇒ MESETA: la salida por recuperación MEJORA":gan>=1?"⇒ sólo "+gan+" ganan — mirar vecindario":"⇒ no mejora"));
console.log("");
