// ══ LAS TRES VERSIONES, UNA AL LADO DE LA OTRA ══ Lester, 30-ago-2026.
// La misma regla congelada (media 50, −7%, 10 huecos, 24% de exposición, sin mínimo de coste)
// aplicada a los tres universos, y además la versión vieja de LA PALANCA como referencia.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const CAP=60000, CAST=0.0138;
function pre(fs){ const P={}; for(const f of fs) Object.assign(P, JSON.parse(readFileSync(join(CACHE,f),"utf8")));
  const PX={},IDX={},SPL={};
  for(const tk of Object.keys(P)){const D=Object.keys(P[tk]).sort();
    PX[tk]=D.map(d=>P[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
    const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);}
    SPL[tk]=S;}
  return {PX,IDX,SPL}; }
function maN(E,tk,d,N){const i=E.IDX[tk]?.get(d); if(i==null||i<N)return null;
  for(let j=i-N+1;j<=i;j++) if(E.SPL[tk].has(j))return null;
  let s=0; for(let j=i-N;j<i;j++)s+=E.PX[tk][j]; return E.PX[tk][i]/(s/N)-1;}

const CASOS = [
  ["LOS 27  (tecnología/crecimiento)", "sincoste-p25-d400.json",  ["precios-ajustados.json"]],
  ["GRUPO A (24, defensivas)",         "sincosteA-p25-d400.json", ["precios-A.json"]],
  ["GRUPO B (36, el examen)",          "sincosteB-p25-d400.json", ["precios-B.json"]],
  ["A + B   (60 grandes caps)",        "sincosteAB-p25-d400.json",["precios-A.json","precios-B.json"]],
];
const filas = [];
for (const [n, f, pf] of CASOS) {
  const E = pre(pf);
  process.env.CAMINOS = f;
  const M = await import("./motor-cartera.mjs?tres=" + f);
  const MA20 = M.OPS.map(o=>o.ma), MA50 = M.OPS.map(o=>maN(E,o.tk,o.dC,50));
  const poner=(usa50,u)=>{for(let i=0;i<M.OPS.length;i++){const v=usa50?MA50[i]:MA20[i];
    M.OPS[i].ma=(v!=null&&v<u&&v>=-0.30)?v:999;}};
  const banda=(cfg)=>{const F=[],A=[],C=[],S=[],O=[];
    for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
      const q=M.simular({...cfg,modo:"spy",castigo:CAST,suelo:0.50,capital:cap});
      F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);}
    const q1=M.simular({...cfg,modo:"spy",castigo:CAST,suelo:0.50,capital:CAP});
    const L=q1.tom.map(x=>x.dinero*(x.mult-1)); const tot=L.reduce((a,b)=>a+b,0);
    const PA={}; q1.tom.forEach((x,i)=>{const y=x.dC.slice(0,4);PA[y]=(PA[y]||0)+L[i];});
    return {d:M.med(F)/M.ANOS,tot:M.med(F),a:M.med(A),c:M.med(C),s:M.med(S),o:M.med(O),
            may:tot>0?100*Math.max(...L)/tot:NaN,
            ap:Object.values(PA).filter(v=>v>0).length,at:Object.keys(PA).length};};
  poner(true,-0.07);
  const nueva = banda({tam:0.024,huecos:10,plazo:120,costeMin:0});
  poner(false,0);
  const vieja = banda({tam:0.12,huecos:2,plazo:120,costeMin:5000});
  const spy = M.spyApalancado(1);
  filas.push({n, nueva, vieja, spy, anos:M.ANOS, tks:new Set(M.OPS.map(o=>o.tk)).size});
}
const SPY = filas[0].spy, ANOS = filas[0].anos;
console.log("");
console.log("  ══ LA REGLA NUEVA · media 50 · −7% · 10 huecos · 24% expo · sin mínimo ══");
console.log("  " + "universo".padEnd(34)+"tks".padStart(5)+"AL AÑO".padStart(11)+"en 10,6 años".padStart(14)+
  "%/año".padStart(8)+"caída".padStart(8)+"Sharpe".padStart(8)+"ops".padStart(6)+"  mayor"+" años+");
for (const f of filas) console.log("  " + f.n.padEnd(34)+String(f.tks).padStart(5)+
  ("$"+Math.round(f.nueva.d).toLocaleString("en-US")).padStart(11)+
  ("$"+Math.round(f.nueva.tot).toLocaleString("en-US")).padStart(14)+
  (f.nueva.a.toFixed(1)+"%").padStart(8)+("−"+f.nueva.c.toFixed(0)+"%").padStart(8)+
  f.nueva.s.toFixed(2).padStart(8)+String(Math.round(f.nueva.o)).padStart(6)+
  (isNaN(f.nueva.may)?"     —":(f.nueva.may.toFixed(0)+"%").padStart(7))+("  "+f.nueva.ap+"/"+f.nueva.at).padStart(6));
console.log("");
console.log("  ══ LA PALANCA VIEJA · media 20 · bajo la media · 2 huecos · 12% · con \$5.000 ══");
console.log("  " + "universo".padEnd(34)+"tks".padStart(5)+"AL AÑO".padStart(11)+"en 10,6 años".padStart(14)+
  "%/año".padStart(8)+"caída".padStart(8)+"Sharpe".padStart(8)+"ops".padStart(6)+"  mayor"+" años+");
for (const f of filas) console.log("  " + f.n.padEnd(34)+String(f.tks).padStart(5)+
  ("$"+Math.round(f.vieja.d).toLocaleString("en-US")).padStart(11)+
  ("$"+Math.round(f.vieja.tot).toLocaleString("en-US")).padStart(14)+
  (f.vieja.a.toFixed(1)+"%").padStart(8)+("−"+f.vieja.c.toFixed(0)+"%").padStart(8)+
  f.vieja.s.toFixed(2).padStart(8)+String(Math.round(f.vieja.o)).padStart(6)+
  (isNaN(f.vieja.may)?"     —":(f.vieja.may.toFixed(0)+"%").padStart(7))+("  "+f.vieja.ap+"/"+f.vieja.at).padStart(6));
console.log("");
console.log("  " + "comprar SPY y dormir".padEnd(39)+
  ("$"+Math.round((SPY.final-CAP)/ANOS).toLocaleString("en-US")).padStart(11)+
  ("$"+Math.round(SPY.final-CAP).toLocaleString("en-US")).padStart(14)+
  (SPY.cagr.toFixed(1)+"%").padStart(8)+("−"+SPY.caida.toFixed(0)+"%").padStart(8)+
  SPY.sharpe.toFixed(2).padStart(8));
console.log("");
