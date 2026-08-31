// ══ PESAR EN VEZ DE FILTRAR ══ Lester, 30-ago-2026.
// El filtro de horquilla mejora el Sharpe (0,80 y 0,82) y baja la caída al −36% en los DOS
// universos, pero se lleva por delante el 75% de las operaciones (282→65). Igual que pasó con
// el filtro de volatilidad.
// La alternativa es no excluir a nadie y dar MAS dinero a los nombres baratos de operar.
// Usa motor-peso.mjs (copia del motor con `x.peso` por operación). La exposición TOTAL se
// mantiene en 24%: los pesos se normalizan para que la media sea 1.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
import { abrir } from "./datos.mjs";
const CAP=60000, CAST=0.0275;
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
const med=(V)=>{const B=[...V].sort((a,b)=>a-b); return B.length?B[Math.floor(B.length/2)]:null;};
function historia(f, cads){ const O=JSON.parse(readFileSync(join(CACHE,f),"utf8")).ops;
  const m=new Map(); for(const o of O){const k=o.tk+"|"+o.dC.slice(0,6); if(!m.has(k))m.set(k,o);}
  const H={};
  for(const [,o] of m){ let q=null;
    for(const c of cads){ let ch; try{ch=c.leer(o.tk,o.dC);}catch{continue;}
      if(!ch||!ch[o.exp])continue; const x=ch[o.exp][o.K+"|C"];
      if(x&&x[0]>0&&x[1]>0){q=x;break;} }
    if(!q)continue; (H[o.tk]=H[o.tk]||[]).push([o.dC.slice(0,6), 2*(q[1]-q[0])/(q[1]+q[0])]); }
  for(const t of Object.keys(H)) H[t].sort((a,b)=>a[0].localeCompare(b[0]));
  return H; }
const hasta=(H,tk,dC)=>{ const S=H[tk]; if(!S)return null; const m=dC.slice(0,6); const V=[];
  for(const [mm,h] of S){ if(mm>=m) break; V.push(h);} return V.length>=6?med(V):null; };

const CADS={AB:[abrir("cadenas-A",{callado:true}),abrir("cadenas-B",{callado:true})],
            V27:[abrir("cadenas",{callado:true})]};
console.log("");
for (const [n,E,f,cads] of [
  ["A+B (60)", pre(["precios-A.json","precios-B.json"]), "sincosteAB-p10-d400.json", CADS.AB],
  ["los 27",   pre(["precios-ajustados.json"]),          "sincoste-p10-d400.json",   CADS.V27]]) {
  const H=historia(f,cads);
  process.env.CAMINOS=f;
  const M=await import("./motor-peso.mjs?pp="+f);
  const V=M.OPS.map(o=>ma50(E,o.tk,o.dC));
  const HQ=M.OPS.map(o=>hasta(H,o.tk,o.dC));
  const ref=med(HQ.filter(x=>x!=null)) ?? 0.045;
  console.log("  ══════ " + n + " · call 10% dentro · castigo 2,75% ══════");
  console.log("  horquilla mediana del universo: " + (100*ref).toFixed(2) + "%");
  console.log("  " + "cómo se reparte el dinero".padEnd(32)+"al año".padStart(11)+"%/año".padStart(8)+
    "caída".padStart(8)+"Sharpe".padStart(8)+"ops".padStart(6)+"  tickers");
  // k = 0 -> todos igual · k>0 -> peso = (ref/horquilla)^k, acotado a [0,25 · 4]
  for (const [et,k,tope] of [["todos igual (como ahora)",0,0],
                             ["peso ∝ 1/horquilla (k=0,5)",0.5,0],
                             ["peso ∝ 1/horquilla (k=1)",1,0],
                             ["peso ∝ 1/horquilla (k=2)",2,0],
                             ["peso k=1 + tope de 6%",1,0.06],
                             ["sólo los de menos del 3%",0,0.03]]) {
    const pesos = HQ.map((h)=> (h==null||k===0) ? 1 : Math.max(0.25, Math.min(4, Math.pow(ref/h, k))));
    const vivos = pesos.filter((_,i)=> V[i]!=null && V[i]<-0.07 && V[i]>=-0.30 &&
                                       !(tope>0 && HQ[i]!=null && HQ[i]>tope));
    const mediaPeso = vivos.length ? vivos.reduce((a,b)=>a+b,0)/vivos.length : 1;
    for (let i=0;i<M.OPS.length;i++){ const v=V[i];
      let ok = v!=null && v<-0.07 && v>=-0.30;
      if (ok && tope>0 && HQ[i]!=null && HQ[i]>tope) ok=false;
      M.OPS[i].ma = ok ? v : 999;
      M.OPS[i].peso = pesos[i] / mediaPeso; }        // normalizado: exposición total intacta
    const F=[],A=[],C=[],S=[],O=[],I=[];
    for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
      const q=M.simular({tam:0.024,huecos:10,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0,capital:cap});
      F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);I.push(q.invertido);}
    const q=M.simular({tam:0.024,huecos:10,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0,capital:CAP});
    console.log("  " + et.padEnd(32)+("$"+Math.round(M.med(F)/M.ANOS).toLocaleString("en-US")).padStart(11)+
      (M.med(A).toFixed(1)+"%").padStart(8)+("−"+M.med(C).toFixed(0)+"%").padStart(8)+
      M.med(S).toFixed(2).padStart(8)+String(Math.round(M.med(O))).padStart(6)+
      ("  "+new Set(q.tom.map(x=>x.tk)).size).padStart(9)+
      ("   invertido "+M.med(I).toFixed(0)+"%")); }
  const spy=M.spyApalancado(1);
  console.log("  " + "comprar SPY y dormir".padEnd(32)+
    ("$"+Math.round((spy.final-CAP)/M.ANOS).toLocaleString("en-US")).padStart(11)+
    (spy.cagr.toFixed(1)+"%").padStart(8)+("−"+spy.caida.toFixed(0)+"%").padStart(8)+
    spy.sharpe.toFixed(2).padStart(8));
  console.log("");
}
