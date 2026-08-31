// ══ ¿ES MESETA EL UMBRAL DEL 4%? ══
// Con las medias BIEN calculadas, exigir >4% bajo la media da Sharpe 0,74 contra 0,69.
// Vecinos: 2%→0,61 y 6%→0,72. Barrido fino + las dos cribas que matan picos.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
process.env.CAMINOS = "largo-p25-d400.json";
const M = await import("./motor-cartera.mjs");
const PX = JSON.parse(readFileSync(join(CACHE, "precios-ajustados.json"), "utf8"));
const CAST=0.5*0.0276;
const q=(X,p)=>{const S=[...X].sort((a,b)=>a-b);return S[Math.floor(p*(S.length-1))];};
const D=x=>"$"+Math.round(x).toLocaleString("en-US");
const b41=(cf)=>{const S=[],A=[],C=[],O=[],F=[];
  for(let i=0;i<41;i++){const r=M.simular({...cf,capital:60000*(1+(i-20)*0.005)});
    S.push(r.sharpe);A.push(r.cagr);C.push(r.caida);O.push(r.ops);F.push(r.final);}
  return {s:q(S,0.5),a:q(A,0.5),c:q(C,0.5),ops:q(O,0.5),fin:q(F,0.5)};};
const SER=new Map();
for (const tk of Object.keys(PX)) { const Dd=Object.keys(PX[tk]).sort(), P=Dd.map(d=>PX[tk][d]);
  const iD=new Map(Dd.map((d,i)=>[d,i])), MAS={};
  for (const n of [10,20,30]) { const m=new Array(P.length).fill(null);
    for(let i=n;i<P.length;i++){ let s=0; for(let k=i-n;k<i;k++) s+=P[k]; m[i]=P[i]/(s/n)-1; }
    MAS[n]=m; }
  SER.set(tk,{iD,MAS}); }
const poner=(n,umb)=>{ let ok=0;
  for(const o of M.OPS){ const S=SER.get(o.tk); const i=S?S.iD.get(o.dC):null;
    const v=(i!=null&&S.MAS[n][i]!=null)?S.MAS[n][i]:null;
    o.ma=(v==null||!isFinite(v)||v>=umb||v<-0.30)?999:v; if(o.ma!==999) ok++; }
  return ok; };
const CF={tam:0.12,huecos:2,modo:"spy",plazo:120,castigo:CAST};
poner(20,0); const base=b41(CF);
console.log("");
console.log("  sin umbral (hoy): "+base.a.toFixed(1)+"% · −"+base.c.toFixed(0)+"% · Sharpe "+base.s.toFixed(2)+" · "+D(base.fin));
console.log("");
console.log("  ══ BARRIDO FINO DEL UMBRAL, en tres medias ══");
console.log("");
const UMB=[0,-0.01,-0.02,-0.03,-0.04,-0.05,-0.06,-0.07,-0.08];
console.log("  "+"media".padEnd(9)+UMB.map(u=>((-100*u).toFixed(0)+"%").padStart(8)).join(""));
const TAB={};
for (const n of [10,20,30]) { let l="  "+(n+"d").padEnd(9);
  for (const u of UMB){ poner(n,u); const r=b41(CF); TAB[n+"|"+u]=r;
    l+=(r.s.toFixed(2)+(r.s>base.s+0.02?"*":" ")).padStart(8); }
  console.log(l); }
console.log("");
console.log("  * = gana al de hoy ("+base.s.toFixed(2)+")");
const t20=UMB.map(u=>TAB["20|"+u].s);
const gan=Object.values(TAB).filter(x=>x.s>base.s+0.02).length;
console.log("  ganan "+gan+" de "+Object.keys(TAB).length+" casillas");
console.log("  fila de la media 20: "+t20.map(x=>x.toFixed(2)).join(" → "));
console.log("");
// la mejor y sus cribas
const mejor=Object.entries(TAB).sort((a,b)=>b[1].s-a[1].s)[0];
const [mn,mu]=mejor[0].split("|").map(Number);
console.log("  la mejor: media "+mn+" · más de "+(-100*mu).toFixed(0)+"% debajo → Sharpe "+mejor[1].s.toFixed(2)+
  " · "+mejor[1].a.toFixed(1)+"% · caída −"+mejor[1].c.toFixed(0)+"% · "+D(mejor[1].fin));
const iu=UMB.indexOf(mu);
const vec=[UMB[iu-1],UMB[iu+1]].filter(x=>x!=null).map(u=>TAB[mn+"|"+u].s);
console.log("  sus vecinos en umbral: "+vec.map(x=>x.toFixed(2)).join(", "));
const vecN=[10,20,30].filter(x=>x!==mn).map(n=>TAB[n+"|"+mu].s);
console.log("  sus vecinos en media : "+vecN.map(x=>x.toFixed(2)).join(", "));
const okV=vec.filter(x=>x>base.s+0.02).length, okN=vecN.filter(x=>x>base.s+0.02).length;
console.log("");
console.log("  "+(gan>=10 && okV>=1 && okN>=1
  ? "⇒ MESETA en las DOS direcciones. Es la primera mejora real del día."
  : gan>=6 && okV>=1
  ? "⇒ meseta en umbral pero no en media. Mejora probable, no segura."
  : "⇒ PICO. No se toca."));
console.log("");
