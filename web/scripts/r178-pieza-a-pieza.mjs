// ══ ¿QUÉ PIEZA DE LA CANDIDATA HACE DAÑO? ══ Lester quiere dólares al año.
// La candidata cambia CUATRO cosas a la vez (media 50, corte −11,2%, aguante 60, sin mínimo de
// coste) y pierde. Aquí se enciende una a una. El nivel de operación decía que la ENTRADA era
// mejor; si eso es cierto, el daño está en la SALIDA.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const CAP=60000, CAST=0.0138, NMA=50;
const PREC={...JSON.parse(readFileSync(join(CACHE,"precios-ajustados.json"),"utf8")),
            ...JSON.parse(readFileSync(join(CACHE,"precios-A.json"),"utf8"))};
const PX={},IDX={},SPLIT={};
for(const tk of Object.keys(PREC)){const D=Object.keys(PREC[tk]).sort();
  PX[tk]=D.map(d=>PREC[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
  const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);} SPLIT[tk]=S;}
function ma50(tk,d){const i=IDX[tk]?.get(d); if(i==null||i<NMA)return null;
  for(let j=i-NMA+1;j<=i;j++) if(SPLIT[tk].has(j))return null;
  let s=0; for(let j=i-NMA;j<i;j++)s+=PX[tk][j]; return PX[tk][i]/(s/NMA)-1;}

async function correr(f,{ma:usa50, u, hold, cm }) {
  process.env.CAMINOS=f;
  const M=await import("./motor-cartera.mjs?e="+f+usa50+u+hold+cm);
  const MA0=M.OPS.map(o=>o.ma);
  for(let i=0;i<M.OPS.length;i++){const o=M.OPS[i];
    const v = usa50 ? ma50(o.tk,o.dC) : MA0[i];
    o.ma = (v==null || v>=u || v<-0.30) ? 999 : v;}
  const F=[],A=[],C=[],S=[],O=[];
  for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
    const q=M.simular({tam:0.12,huecos:2,modo:"spy",plazo:hold,castigo:CAST,suelo:0.50,costeMin:cm,capital:cap});
    F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);}
  return {g:M.med(F),a:M.med(A),c:M.med(C),s:M.med(S),o:M.med(O),anos:M.ANOS};}

for (const [n, fCON, fSIN] of [["los 27","largo-p25-d400.json","sincoste-p25-d400.json"],
                               ["GRUPO A","caminos-A.json","sincosteA-p25-d400.json"]]) {
  console.log("");
  console.log("  ══════ " + n + " ══════   (mediana de 41 capitales)");
  console.log("  " + "qué se cambia".padEnd(38) + "AL AÑO".padStart(10) + "%/año".padStart(8) +
    "caída".padStart(8) + "Sharpe".padStart(8) + "ops".padStart(6));
  const F = (et, r) => console.log("  " + et.padEnd(38) +
    ("$"+Math.round(r.g/r.anos).toLocaleString("en-US")).padStart(10) +
    (r.a.toFixed(1)+"%").padStart(8) + ("−"+r.c.toFixed(0)+"%").padStart(8) +
    r.s.toFixed(2).padStart(8) + String(Math.round(r.o)).padStart(6));
  F("ACTUAL (media 20, bajo, 120 ses., $5k)", await correr(fCON,{ma:false,u:0,hold:120,cm:5000}));
  F("+ sólo la ENTRADA (media 50 al −11,2%)", await correr(fCON,{ma:true,u:-0.112,hold:120,cm:5000}));
  F("+ y sin mínimo de coste",                await correr(fSIN,{ma:true,u:-0.112,hold:120,cm:0}));
  F("+ y aguante 60  = LA CANDIDATA",         await correr(fSIN,{ma:true,u:-0.112,hold:60, cm:0}));
  F("(control) entrada nueva, aguante 120,\n     con mínimo — pero corte −20%", await correr(fCON,{ma:true,u:-0.20,hold:120,cm:5000}));
}
console.log("");
