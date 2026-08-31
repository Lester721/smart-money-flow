// ══ ¿6 HUECOS? CONFIRMACIÓN ══ Lester: «¿estás seguro que 6 huecos está correcto? Confirma.»
// Paso fino alrededor de 6, con los TRES umbrales contiguos, en los DOS universos, y partido
// por mitades. Si 6 es un hoyo o un pico, aquí se ve.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const CAP=60000, CAST=0.0275;
function pre(fs){const P={}; for(const f of fs) Object.assign(P,JSON.parse(readFileSync(join(CACHE,f),"utf8")));
  const PX={},IDX={},SPL={};
  for(const tk of Object.keys(P)){const D=Object.keys(P[tk]).sort();
    PX[tk]=D.map(d=>P[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
    const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);}
    SPL[tk]=S;}
  return {PX,IDX,SPL};}
const ma=(E,tk,d)=>{const i=E.IDX[tk]?.get(d); if(i==null||i<50)return null;
  for(let j=i-49;j<=i;j++) if(E.SPL[tk].has(j))return null;
  let s=0; for(let j=i-50;j<i;j++)s+=E.PX[tk][j]; return E.PX[tk][i]/(s/50)-1;};
const med=(V)=>{const B=[...V].sort((a,b)=>a-b); return B[Math.floor(B.length/2)];};

for (const [n,E,f] of [["A+B (60)",pre(["precios-A.json","precios-B.json"]),"sincosteAB-p10-d400.json"],
                       ["los 27",  pre(["precios-ajustados.json"]),         "sincoste-p10-d400.json"]]) {
  process.env.CAMINOS=f;
  const M=await import("./motor-cartera.mjs?c6="+f);
  const V=M.OPS.map(o=>ma(E,o.tk,o.dC));
  const poner=(u)=>{for(let i=0;i<M.OPS.length;i++){const v=V[i]; M.OPS[i].ma=(v!=null&&v<u&&v>=-0.30)?v:999;}};
  const banda=(h,u,desde,hasta)=>{poner(u); const F=[],S=[],C=[],O=[];
    for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
      const q=M.simular({tam:0.24/h,huecos:h,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0,
                         capital:cap,desdeD:desde,hasta});
      F.push(q.final-cap);S.push(q.sharpe);C.push(q.caida);O.push(q.ops);}
    return {d:med(F)/(desde?5.3:M.ANOS),s:med(S),c:med(C),o:med(O)};};
  console.log("");
  console.log("  ══════ " + n + " ══════");
  console.log("  " + "huecos".padEnd(8)+"−6%".padStart(12)+"−7%".padStart(12)+"−8%".padStart(12)+
    "   mediana de los 3".padStart(20)+"  Sharpe(−7%)"+"  mayor"+"  bofet.");
  const filas={};
  for (const h of [3,4,5,6,7,8,10]) {
    const R=[-0.06,-0.07,-0.08].map(u=>banda(h,u));
    const m=med(R.map(r=>r.d));
    poner(-0.07);
    const q=M.simular({tam:0.24/h,huecos:h,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0,capital:CAP});
    const L=q.tom.map(x=>x.dinero*(x.mult-1)); const tot=L.reduce((a,b)=>a+b,0);
    let may=0; for(const x of L) if(x>may)may=x;
    filas[h]={m, s:R[1].s, may:100*may/tot, bof:L.filter(x=>x<0).length/M.ANOS};
    console.log("  " + String(h).padEnd(8)+R.map(r=>("$"+Math.round(r.d/1000)+"k").padStart(12)).join("")+
      ("$"+Math.round(m).toLocaleString("en-US")).padStart(20)+R[1].s.toFixed(2).padStart(13)+
      ((100*may/tot).toFixed(0)+"%").padStart(8)+(L.filter(x=>x<0).length/M.ANOS).toFixed(0).padStart(9)+
      (h===6?"   ← 6":"")); }
  console.log("  ── las dos mitades (umbral −7%) ──");
  console.log("  " + "huecos".padEnd(8)+"2016-2021".padStart(14)+"2021-2026".padStart(14)+"   ¿las dos ganan a SPY?");
  for (const h of [4,5,6,7,8,10]) {
    const a=banda(h,-0.07,"20160104","20210630"), b=banda(h,-0.07,"20210701","20260819");
    console.log("  " + String(h).padEnd(8)+("$"+Math.round(a.d).toLocaleString("en-US")).padStart(14)+
      ("$"+Math.round(b.d).toLocaleString("en-US")).padStart(14)+
      ("   "+(a.d>19039&&b.d>19039?"sí":"NO")).padStart(12)+(h===6?"   ← 6":"")); }
}
console.log("");
