// ══ EL −7% CON 2 HUECOS: ¿MESETA O PICO? ══
// $84.248/año y Sharpe 0,97 en el grupo A. Sus vecinos de la rejilla gruesa dan $39k y $32k.
// Si al afinar el paso aparece una MESETA, es real. Si sigue siendo un pincho, es la casilla
// afortunada — y son 45 operaciones en el régimen de 2 huecos, que es donde dos versiones de
// la misma regla comparten 0 operaciones.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const CAP=60000, CAST=0.0138;
function cargarPrecios(f){ const P=JSON.parse(readFileSync(join(CACHE,f),"utf8"));
  const PX={},IDX={},SPLIT={};
  for(const tk of Object.keys(P)){const D=Object.keys(P[tk]).sort();
    PX[tk]=D.map(d=>P[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
    const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);}
    SPLIT[tk]=S;}
  return {PX,IDX,SPLIT}; }
const P = { ...cargarPrecios("precios-A.json").PX ? {} : {} };
const A = cargarPrecios("precios-A.json"), B = cargarPrecios("precios-ajustados.json");
function maN(E,tk,d,N){const i=E.IDX[tk]?.get(d); if(i==null||i<N)return null;
 for(let j=i-N+1;j<=i;j++)if(E.SPLIT[tk].has(j))return null;
 let s=0;for(let j=i-N;j<i;j++)s+=E.PX[tk][j];return E.PX[tk][i]/(s/N)-1;}

for (const [n, f, E] of [["GRUPO A","sincosteA-p25-d400.json",A], ["los 27","sincoste-p25-d400.json",B]]) {
  process.env.CAMINOS=f;
  const M=await import("./motor-cartera.mjs?p3="+f);
  const V=M.OPS.map(o=>maN(E,o.tk,o.dC,50));
  const poner=(u)=>{for(let i=0;i<M.OPS.length;i++){const v=V[i];M.OPS[i].ma=(v!=null&&v<u&&v>=-0.30)?v:999;}};
  const banda=(u,h)=>{poner(u); const F=[],S=[],C=[],O=[];
    for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
      const q=M.simular({tam:0.24/h,huecos:h,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0,capital:cap});
      F.push(q.final-cap);S.push(q.sharpe);C.push(q.caida);O.push(q.ops);}
    return {d:M.med(F)/M.ANOS,s:M.med(S),c:M.med(C),o:M.med(O)};};
  console.log("");
  console.log("  ══ " + n + " · paso fino alrededor del −7%, 2 huecos ══");
  console.log("  " + "umbral".padEnd(9)+"al año".padStart(11)+"Sharpe".padStart(8)+"caída".padStart(8)+"ops".padStart(6));
  for (const u of [-0.04,-0.05,-0.06,-0.065,-0.07,-0.075,-0.08,-0.09,-0.10]) {
    const r=banda(u,2);
    console.log("  " + ((100*u).toFixed(1)+"%").padEnd(9) +
      ("$"+Math.round(r.d).toLocaleString("en-US")).padStart(11) + r.s.toFixed(2).padStart(8) +
      ("−"+r.c.toFixed(0)+"%").padStart(8) + String(Math.round(r.o)).padStart(6) +
      (Math.abs(u+0.07)<1e-9?"   ← el pico":"")); }
  // concentración y años del −7%
  poner(-0.07);
  const q=M.simular({tam:0.12,huecos:2,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0,capital:CAP});
  const L=q.tom.map(x=>({tk:x.tk,dC:x.dC,g:x.dinero*(x.mult-1)})).sort((a,b)=>b.g-a.g);
  const tot=L.reduce((a,x)=>a+x.g,0);
  console.log("  la mayor: "+(100*L[0].g/tot).toFixed(0)+"% ("+L[0].tk+" "+L[0].dC+")   ·   las 3 mejores: "+
    (100*L.slice(0,3).reduce((a,x)=>a+x.g,0)/tot).toFixed(0)+"%   ·   acierta "+
    (100*L.filter(x=>x.g>0).length/L.length).toFixed(0)+"%");
  const PA={}; for(const x of L) PA[x.dC.slice(0,4)]=(PA[x.dC.slice(0,4)]||0)+x.g;
  console.log("  por año: "+Object.keys(PA).sort().map(a=>a.slice(2)+":$"+Math.round(PA[a]/1000)+"k").join(" "));
}
console.log("");
