// ══ EL FILTRO DE HORQUILLA ══ Lester, 30-ago-2026: «mide el filtro de la horquilla».
//
// La horquilla es una propiedad del TICKER (META 1,6% · XLNX 10,6%) y se sabe ANTES de entrar.
// Estamos pagando un 10% a VZ y XLNX por el mismo billete que META cuesta 1,6%.
//
// ⚠️ EX-ANTE, DE VERDAD: usar la mediana de la horquilla de TODO el período sería meter el futuro
//    por la puerta de atrás — el fallo que ya convirtió una señal en un selector de ganadoras
//    conocidas. Aquí la horquilla de cada ticker se construye con una MEDIANA EXPANSIVA: en la
//    fecha d sólo entran las mediciones ESTRICTAMENTE ANTERIORES a d. Un ticker sin al menos 6
//    meses de historia de horquilla no se puede juzgar, así que se DEJA PASAR (no se excluye por
//    falta de datos: eso sería otro sesgo).
//
// Se muestrea el primer día de cada mes por ticker (~127 meses × 60 tickers) en vez de todos los
// días: la horquilla de un nombre se mueve despacio y así son 7.600 lecturas en vez de 152.000.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
import { abrir } from "./datos.mjs";
const CAP=60000, CAST=0.0275;      // ← el castigo CORREGIDO: media horquilla real (5,5%/2)

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

// ── historia de horquilla por ticker, un día por mes ──────────────────────────────────────
function historia(f, cads) {
  const O = JSON.parse(readFileSync(join(CACHE, f), "utf8")).ops;
  const porTkMes = new Map();                       // tk|AAAAMM -> primera op de ese mes
  for (const o of O) { const k = o.tk + "|" + o.dC.slice(0,6);
    if (!porTkMes.has(k)) porTkMes.set(k, o); }
  const H = {};                                     // tk -> [[AAAAMM, horquilla], ...] ordenado
  let leidas = 0;
  for (const [k, o] of porTkMes) {
    let q = null;
    for (const c of cads) { let ch; try { ch = c.leer(o.tk, o.dC); } catch { continue; }
      if (!ch || !ch[o.exp]) continue; const x = ch[o.exp][o.K+"|C"];
      if (x && x[0] > 0 && x[1] > 0) { q = x; break; } }
    if (!q) continue;
    leidas++;
    (H[o.tk] = H[o.tk] || []).push([o.dC.slice(0,6), 2*(q[1]-q[0])/(q[1]+q[0])]); }
  for (const tk of Object.keys(H)) H[tk].sort((a,b)=>a[0].localeCompare(b[0]));
  return { H, leidas };
}
// mediana EXPANSIVA: sólo meses estrictamente anteriores
function horquillaHasta(H, tk, dC) {
  const S = H[tk]; if (!S) return null;
  const mes = dC.slice(0,6); const V = [];
  for (const [m, h] of S) { if (m >= mes) break; V.push(h); }
  return V.length >= 6 ? med(V) : null;             // menos de 6 meses: no se juzga
}

const CADS = { AB: [abrir("cadenas-A",{callado:true}), abrir("cadenas-B",{callado:true})],
               V27: [abrir("cadenas",{callado:true})] };
console.log("");
for (const [n, E, f, cads] of [
  ["A+B (60)", pre(["precios-A.json","precios-B.json"]), "sincosteAB-p10-d400.json", CADS.AB],
  ["los 27",   pre(["precios-ajustados.json"]),          "sincoste-p10-d400.json",   CADS.V27]]) {
  const { H, leidas } = historia(f, cads);
  const tks = Object.keys(H).sort();
  const finales = tks.map(t=>[t, med(H[t].map(x=>x[1]))]).sort((a,b)=>a[1]-b[1]);
  console.log("  ══════ " + n + " · call 10% dentro · castigo " + (100*CAST).toFixed(2) + "% ══════");
  console.log("  historia de horquilla: " + leidas.toLocaleString("en-US") + " lecturas, " + tks.length + " tickers");
  console.log("    más estrechos: " + finales.slice(0,4).map(([k,v])=>k+" "+(100*v).toFixed(1)+"%").join("  "));
  console.log("    más anchos:    " + finales.slice(-4).map(([k,v])=>k+" "+(100*v).toFixed(1)+"%").join("  "));

  process.env.CAMINOS = f;
  const M = await import("./motor-cartera.mjs?fh=" + f);
  const V  = M.OPS.map(o=>ma50(E,o.tk,o.dC));
  const HQ = M.OPS.map(o=>horquillaHasta(H,o.tk,o.dC));
  const sinDato = HQ.filter(x=>x==null).length;
  console.log("    entradas sin historia suficiente (se dejan pasar): " +
    (100*sinDato/HQ.length).toFixed(0) + "%");
  console.log("");
  console.log("  " + "tope de horquilla".padEnd(24)+"al año".padStart(11)+"%/año".padStart(8)+
    "caída".padStart(8)+"Sharpe".padStart(8)+"ops".padStart(6)+"  tickers");
  for (const tope of [0, 0.10, 0.08, 0.06, 0.05, 0.04, 0.03]) {
    for (let i=0;i<M.OPS.length;i++){ const v=V[i];
      let ok = v!=null && v<-0.07 && v>=-0.30;
      if (ok && tope>0 && HQ[i]!=null && HQ[i]>tope) ok=false;   // null = sin historia, pasa
      M.OPS[i].ma = ok ? v : 999; }
    const F=[],A=[],C=[],S=[],O=[];
    for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
      const q=M.simular({tam:0.024,huecos:10,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0,capital:cap});
      F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);}
    const q=M.simular({tam:0.024,huecos:10,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0,capital:CAP});
    console.log("  " + (tope===0?"sin filtro":"menos del "+(100*tope).toFixed(0)+"%").padEnd(24)+
      ("$"+Math.round(M.med(F)/M.ANOS).toLocaleString("en-US")).padStart(11)+
      (M.med(A).toFixed(1)+"%").padStart(8)+("−"+M.med(C).toFixed(0)+"%").padStart(8)+
      M.med(S).toFixed(2).padStart(8)+String(Math.round(M.med(O))).padStart(6)+
      ("  "+new Set(q.tom.map(x=>x.tk)).size).padStart(9)); }
  const spy=M.spyApalancado(1);
  console.log("  " + "comprar SPY y dormir".padEnd(24)+
    ("$"+Math.round((spy.final-CAP)/M.ANOS).toLocaleString("en-US")).padStart(11)+
    (spy.cagr.toFixed(1)+"%").padStart(8)+("−"+spy.caida.toFixed(0)+"%").padStart(8)+
    spy.sharpe.toFixed(2).padStart(8));
  console.log("");
}
