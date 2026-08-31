// ══ EL MÍNIMO, LIMPIO, CON LA ENTRADA NUEVA ══ Lester: «¿estás seguro? hace un par de horas
// decías que no había diferencia».
//
// Tenía razón en desconfiar. Son DOS preguntas y yo las mezclé:
//   (A) FILTRAR   — mismo fichero, misma elección de contrato, se descartan los baratos.
//   (B) SUSTITUIR — fichero construido con el mínimo: elegir() coge otro contrato (más profundo
//                   o más largo) para llegar a los $5.000. Cambian DOS cosas a la vez.
// r166 midió (A) con la entrada VIEJA → sin diferencia.
// r186 midió (B) con la entrada nueva → diferencia grande, y lo conté como si fuera (A).
// Aquí se mide (A) con la entrada NUEVA, que es la casilla que faltaba.
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

for (const [n, f, E] of [["los 27","sincoste-p25-d400.json",E27],
                         ["GRUPO A","sincosteA-p25-d400.json",EA]]) {
  process.env.CAMINOS=f;
  const M=await import("./motor-cartera.mjs?limpio="+f);
  const V=M.OPS.map(o=>ma50(E,o.tk,o.dC));
  for(let i=0;i<M.OPS.length;i++){const v=V[i];M.OPS[i].ma=(v!=null&&v<-0.07&&v>=-0.30)?v:999;}
  const banda=(h,expo,cm)=>{const F=[],A=[],C=[],S=[],O=[];
    for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
      const q=M.simular({tam:expo/h,huecos:h,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:cm,capital:cap});
      F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);}
    return {d:M.med(F)/M.ANOS,a:M.med(A),c:M.med(C),s:M.med(S),o:M.med(O)};};
  const cos=M.OPS.filter(o=>o.ma!==999).map(o=>o.coste).sort((a,b)=>a-b);
  console.log("");
  console.log("  ══════ " + n + " ══════   MISMO fichero · entrada nueva (media 50, −7%) · sólo cambia el filtro");
  console.log("  coste de los contratos elegibles: mediana $" +
    Math.round(cos[Math.floor(cos.length/2)]).toLocaleString("en-US") +
    "  ·  por debajo de $5.000: " + (100*cos.filter(x=>x<5000).length/cos.length).toFixed(0) + "%");
  console.log("  " + "config".padEnd(28)+"al año".padStart(11)+"%/año".padStart(8)+
    "caída".padStart(8)+"Sharpe".padStart(8)+"ops".padStart(6));
  for (const [h,expo] of [[2,0.24],[10,0.24],[10,0.48]]) {
    for (const cm of [0,5000]) { const r=banda(h,expo,cm);
      console.log("  " + ((cm?"con \$5.000":"sin mínimo")+" · "+h+" hue · "+(100*expo).toFixed(0)+"%").padEnd(28)+
        ("$"+Math.round(r.d).toLocaleString("en-US")).padStart(11)+(r.a.toFixed(1)+"%").padStart(8)+
        ("−"+r.c.toFixed(0)+"%").padStart(8)+r.s.toFixed(2).padStart(8)+String(Math.round(r.o)).padStart(6)); } }
  const spy=M.spyApalancado(1);
  console.log("  " + "comprar SPY y dormir".padEnd(28)+
    ("$"+Math.round((spy.final-CAP)/M.ANOS).toLocaleString("en-US")).padStart(11)+
    (spy.cagr.toFixed(1)+"%").padStart(8)+("−"+spy.caida.toFixed(0)+"%").padStart(8)+
    spy.sharpe.toFixed(2).padStart(8));
}
console.log("");
