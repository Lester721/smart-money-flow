// ══ ¿LOS 27 SALEN MEJOR CON EL MÍNIMO DE $5.000? ══ Lester, 30-ago-2026.
//
// Pregunta suya, y es un hueco real: el mínimo se midió SÓLO en la configuración vieja
// (media 20, «bajo la media», 2 huecos). Nunca con la nueva (media 50, −7%, 10 huecos).
//
// ⚠️ El mínimo NO se puede aplicar al medir: tiene que estar DENTRO de la construcción, porque
//    `elegir()` sustituye por un contrato más profundo o más largo para llegar a los $5.000.
//    Aplicarlo después sólo RECHAZA los baratos, que es otra regla distinta.
//    Por eso:  CON mínimo = largo-p25-d400 / caminos-A     ·   SIN mínimo = sincoste* 
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

// ⚠️ El motor se carga UNA VEZ por fichero. Importarlo con ?query distinto por configuración
//    metía 16 copias de 62.000 caminos en memoria y tumbaba el proceso.
async function abrir(f, E) {
  process.env.CAMINOS = f;
  const M = await import("./motor-cartera.mjs?once=" + f);
  const V = M.OPS.map(o => ma50(E, o.tk, o.dC));
  return { M, V };
}
function corre({M,V}, u, h, expo) {
  for (let i=0;i<M.OPS.length;i++){const v=V[i];M.OPS[i].ma=(v!=null&&v<u&&v>=-0.30)?v:999;}
  const F=[],A=[],C=[],S=[],O=[];
  for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
    const q=M.simular({tam:expo/h,huecos:h,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0,capital:cap});
    F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);}
  const q1=M.simular({tam:expo/h,huecos:h,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0,capital:CAP});
  const L=q1.tom.map(x=>x.dinero*(x.mult-1)); const tot=L.reduce((a,b)=>a+b,0);
  const PA={}; q1.tom.forEach((x,i)=>{const y=x.dC.slice(0,4);PA[y]=(PA[y]||0)+L[i];});
  return {d:M.med(F)/M.ANOS,a:M.med(A),c:M.med(C),s:M.med(S),o:M.med(O),
          may:tot>0?100*Math.max(...L)/tot:NaN,
          ap:Object.values(PA).filter(v=>v>0).length, at:Object.keys(PA).length,
          spy:M.spyApalancado(1), anos:M.ANOS};
}

for (const [n, fCON, fSIN, E] of [["los 27","largo-p25-d400.json","sincoste-p25-d400.json",E27],
                                  ["GRUPO A","caminos-A.json","sincosteA-p25-d400.json",EA]]) {
  const CON = await abrir(fCON, E), SIN = await abrir(fSIN, E);
  console.log("");
  console.log("  ══════ " + n + " ══════   media 50 · umbral −7% · aguante 120 · mediana de 41 capitales");
  console.log("  " + "config".padEnd(34)+"al año".padStart(11)+"%/año".padStart(8)+
    "caída".padStart(8)+"Sharpe".padStart(8)+"ops".padStart(6)+"  la mayor"+"  años+");
  const F=(et,r)=>console.log("  "+et.padEnd(34)+
    ("$"+Math.round(r.d).toLocaleString("en-US")).padStart(11)+(r.a.toFixed(1)+"%").padStart(8)+
    ("−"+r.c.toFixed(0)+"%").padStart(8)+r.s.toFixed(2).padStart(8)+String(Math.round(r.o)).padStart(6)+
    (isNaN(r.may)?"    —":(r.may.toFixed(0)+"%").padStart(9))+("  "+r.ap+"/"+r.at).padStart(7));
  for (const [h,expo] of [[2,0.24],[10,0.24],[10,0.48],[14,0.48]]) {
    F("CON $5.000 · "+h+" hue · "+(100*expo).toFixed(0)+"% expo", corre(CON,-0.07,h,expo));
    F("  SIN minimo · mismo todo",                                corre(SIN,-0.07,h,expo)); }
  const r=corre(CON,-0.07,2,0.24);
  console.log("  " + "comprar SPY y dormir".padEnd(34)+
    ("$"+Math.round((r.spy.final-CAP)/r.anos).toLocaleString("en-US")).padStart(11)+
    (r.spy.cagr.toFixed(1)+"%").padStart(8)+("−"+r.spy.caida.toFixed(0)+"%").padStart(8)+
    r.spy.sharpe.toFixed(2).padStart(8));
}
console.log("");
