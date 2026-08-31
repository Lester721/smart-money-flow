// ══ LAS CASILLAS ESTABLES — con la caída, que es lo que faltaba ══
// r184 encontró que con exposición alta Y muchos huecos hay casillas con 229-285 operaciones y
// dispersión baja entre umbrales contiguos. Antes de proponer nada hay que ver la CAÍDA: con
// 75% de exposición en calls apalancadas 3,5x, la cartera va al 2,6x del mercado.
// Se comprueban las dos cosas que hoy han matado todo: caída real y concentración.
// Y se corre en LOS DOS grupos: si el grupo A dice una cosa y los 27 otra, no vale.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const CAP=60000, CAST=0.0138;
function pre(f){const P=JSON.parse(readFileSync(join(CACHE,f),"utf8"));const PX={},IDX={},S2={};
 for(const tk of Object.keys(P)){const D=Object.keys(P[tk]).sort();
  PX[tk]=D.map(d=>P[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
  const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);}
  S2[tk]=S;} return {PX,IDX,SPLIT:S2};}
const EA=pre("precios-A.json"), E27=pre("precios-ajustados.json");
function ma50(E,tk,d){const i=E.IDX[tk]?.get(d);if(i==null||i<50)return null;
 for(let j=i-49;j<=i;j++)if(E.SPLIT[tk].has(j))return null;
 let s=0;for(let j=i-50;j<i;j++)s+=E.PX[tk][j];return E.PX[tk][i]/(s/50)-1;}

for (const [n,f,E] of [["GRUPO A","sincosteA-p25-d400.json",EA],["los 27","sincoste-p25-d400.json",E27]]) {
  process.env.CAMINOS=f;
  const M=await import("./motor-cartera.mjs?c5="+f);
  const V=M.OPS.map(o=>ma50(E,o.tk,o.dC));
  const poner=(u)=>{for(let i=0;i<M.OPS.length;i++){const v=V[i];M.OPS[i].ma=(v!=null&&v<u&&v>=-0.30)?v:999;}};
  const SPY=M.spyApalancado(1);
  console.log("");
  console.log("  ══════ " + n + " ══════   (mediana de 41 capitales · media 50 · aguante 120)");
  console.log("  " + "expo".padEnd(6)+"huecos".padStart(7)+"umbral".padStart(8)+"al año".padStart(11)+
    "%/año".padStart(8)+"CAÍDA".padStart(8)+"Sharpe".padStart(8)+"ops".padStart(6)+
    "  invert."+"  la mayor"+"  años+");
  for (const [expo,h] of [[0.24,10],[0.48,10],[0.60,10],[0.75,10],[0.75,14],[0.60,14],[0.48,14],[0.24,20]])
    for (const u of [-0.06,-0.07,-0.08]) {
      poner(u);
      const F=[],A=[],C=[],S=[],O=[],I=[];
      for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
        const q=M.simular({tam:expo/h,huecos:h,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0,capital:cap});
        F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);I.push(q.invertido);}
      const q1=M.simular({tam:expo/h,huecos:h,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0,capital:CAP});
      const L=q1.tom.map(x=>x.dinero*(x.mult-1));
      const tot=L.reduce((a,b)=>a+b,0);
      const may=tot>0?100*Math.max(...L)/tot:NaN;
      const PA={}; q1.tom.forEach((x,i)=>{const y=x.dC.slice(0,4);PA[y]=(PA[y]||0)+L[i];});
      const anosPos=Object.values(PA).filter(v=>v>0).length, anosTot=Object.keys(PA).length;
      console.log("  " + ((100*expo).toFixed(0)+"%").padEnd(6)+String(h).padStart(7)+
        ((100*u).toFixed(0)+"%").padStart(8)+("$"+Math.round(M.med(F)/M.ANOS).toLocaleString("en-US")).padStart(11)+
        (M.med(A).toFixed(1)+"%").padStart(8)+("−"+M.med(C).toFixed(0)+"%").padStart(8)+
        M.med(S).toFixed(2).padStart(8)+String(Math.round(M.med(O))).padStart(6)+
        (M.med(I).toFixed(0)+"%").padStart(9)+(isNaN(may)?"    —":(may.toFixed(0)+"%").padStart(9))+
        ("  "+anosPos+"/"+anosTot).padStart(7)); }
  console.log("  " + "SPY".padEnd(6)+"".padStart(7)+"".padStart(8)+
    ("$"+Math.round((SPY.final-CAP)/M.ANOS).toLocaleString("en-US")).padStart(11)+
    (SPY.cagr.toFixed(1)+"%").padStart(8)+("−"+SPY.caida.toFixed(0)+"%").padStart(8)+
    SPY.sharpe.toFixed(2).padStart(8));
}
console.log("");
