// ══ LA HORQUILLA REAL A 10% DENTRO DEL DINERO ══ Lester, 30-ago-2026: «mide la horquilla real
// a esa profundidad».
//
// POR QUÉ IMPORTA: el castigo de 0,0138 se midió en r140 sobre calls **25% dentro** (horquilla
// medida 2,76%, se usa la mitad como margen extra). Una call 10% dentro está mucho más cerca del
// dinero, y lo medido para las ATM era 4,0%. Si la horquilla real es peor, el hallazgo del
// ultracode se encoge.
//
// OJO — QUÉ ES EL CASTIGO Y QUÉ NO: los caminos guardados YA usan ask al entrar y bid al salir,
// o sea que la horquilla cotizada ya está dentro. El `castigo` es un margen EXTRA por deslizamiento
// por encima de la cotización. Aquí se mide la horquilla cotizada de verdad para saber si ese
// margen extra sigue siendo proporcionado.
//
// Se miden las operaciones que la regla COGE de verdad (no todas las candidatas), a la ENTRADA
// y a la SALIDA, en las dos profundidades, y en los dos universos.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
import { abrir } from "./datos.mjs";
const CAP=60000, CAST=0.0138;
function pre(fs){const P={}; for(const f of fs) Object.assign(P,JSON.parse(readFileSync(join(CACHE,f),"utf8")));
  const PX={},IDX={},SPL={};
  for(const tk of Object.keys(P)){const D=Object.keys(P[tk]).sort();
    PX[tk]=D.map(d=>P[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
    const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);}
    SPL[tk]=S;}
  return {PX,IDX,SPL};}
const ma50=(E,tk,d)=>{const i=E.IDX[tk]?.get(d); if(i==null||i<50)return null;
  for(let j=i-49;j<=i;j++) if(E.SPL[tk].has(j))return null;
  let s=0; for(let j=i-50;j<i;j++)s+=E.PX[tk][j]; return E.PX[tk][i]/(s/50)-1;};
const pct=(V,q)=>{const B=[...V].sort((a,b)=>a-b); return B[Math.floor(B.length*q)];};

// cadenas: un ticker puede estar en cadenas-A, cadenas-B o cadenas
const CAD = { A: abrir("cadenas-A",{callado:true}), B: abrir("cadenas-B",{callado:true}),
              C: abrir("cadenas",{callado:true}) };
function quote(tk, dia, exp, K) {
  for (const c of [CAD.A, CAD.B, CAD.C]) {
    let ch; try { ch = c.leer(tk, dia); } catch { continue; }
    if (!ch || !ch[exp]) continue;
    const q = ch[exp][K + "|C"];
    if (q && q[0] > 0 && q[1] > 0) return q; }
  return null; }

console.log("");
console.log("  ══ HORQUILLA COTIZADA, sobre las operaciones que la regla COGE de verdad ══");
console.log("  " + "".padEnd(30)+"n".padStart(5)+"  ENTRADA (ask-bid)/medio".padStart(26)+
  "     SALIDA".padStart(24));
console.log("  " + "".padEnd(35)+"p25".padStart(8)+"mediana".padStart(9)+"p75".padStart(8)+
  "     p25".padStart(11)+"mediana".padStart(9)+"p75".padStart(8));
for (const [n, E, FS] of [
  ["A+B (60)", pre(["precios-A.json","precios-B.json"]),
    [["25% dentro","sincosteAB-p25-d400.json"],["10% dentro","sincosteAB-p10-d400.json"]]],
  ["los 27", pre(["precios-ajustados.json"]),
    [["25% dentro","sincoste-p25-d400.json"],["10% dentro","sincoste-p10-d400.json"]]]]) {
  for (const [et, f] of FS) {
    process.env.CAMINOS=f;
    const M=await import("./motor-cartera.mjs?hq="+f);
    const V=M.OPS.map(o=>ma50(E,o.tk,o.dC));
    const idx=new Map();
    for(let i=0;i<M.OPS.length;i++){const v=V[i]; M.OPS[i].ma=(v!=null&&v<-0.07&&v>=-0.30)?v:999;
      idx.set(M.OPS[i].tk+"|"+M.OPS[i].dC, M.OPS[i]);}
    const q=M.simular({tam:0.024,huecos:10,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0,capital:CAP});
    const hE=[], hS=[];
    for (const t of q.tom) {
      const o = idx.get(t.tk+"|"+t.dC); if (!o) continue;
      const qe = quote(o.tk, o.dC, o.exp, o.K);
      if (qe) hE.push(2*(qe[1]-qe[0])/(qe[1]+qe[0]));
      // día de salida: el último del camino recortado al aguante
      const iF = Math.min(120, o.camino.length) - 1;
      let iSal = iF; for(let j=0;j<=iF;j++) if(o.camino[j][1]<=0.50){iSal=j;break;}
      const qs = quote(o.tk, o.camino[iSal][0], o.exp, o.K);
      if (qs) hS.push(2*(qs[1]-qs[0])/(qs[1]+qs[0])); }
    console.log("  " + (n+" · "+et).padEnd(30)+String(hE.length).padStart(5)+
      (hE.length?((100*pct(hE,0.25)).toFixed(2)+"%").padStart(8):"—".padStart(8))+
      (hE.length?((100*pct(hE,0.50)).toFixed(2)+"%").padStart(9):"—".padStart(9))+
      (hE.length?((100*pct(hE,0.75)).toFixed(2)+"%").padStart(8):"—".padStart(8))+
      (hS.length?((100*pct(hS,0.25)).toFixed(2)+"%").padStart(11):"—".padStart(11))+
      (hS.length?((100*pct(hS,0.50)).toFixed(2)+"%").padStart(9):"—".padStart(9))+
      (hS.length?((100*pct(hS,0.75)).toFixed(2)+"%").padStart(8):"—".padStart(8)));
  }
}
console.log("");
console.log("  referencia de r140: 25% dentro daba 2,4-2,8% · las ATM 4,0% · castigo actual 1,38% (media horquilla)");
console.log("");
