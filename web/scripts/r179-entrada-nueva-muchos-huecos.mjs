// ══ LA ÚLTIMA PREGUNTA ANTES DEL GRUPO B ══ Lester, 2026-08-30: «dale».
//
// El banco de OPERACIÓN dice que entrar a −11,2% bajo la media de 50 paga +0,10 sobre 351 casos
// (t=2,96 sin 2020; t=2,43 en el grupo A solo). El banco de CARTERA no lo confirma.
// Hipótesis: los dos tienen razón — la ventaja existe pero con 2 huecos sólo se compran ~5
// billetes al año y cuál te toca lo decide el orden de llenado, no la señal.
//
// Si es eso, la ventaja se cobra comprando MÁS billetes. Nunca lo hemos probado: el barrido de
// huecos de esta mañana usó la ENTRADA VIEJA.
//
// ⚠️ Exposición total CONSTANTE al 24% (= los 2 huecos × 12% de la regla congelada), repartida:
//    tam = 0,24/huecos. Si no, subir huecos subiría el dinero invertido y mejoraría por
//    apalancamiento, no por diversificación.
// ⚠️ Aguante 120, NO 60: hoy quedó medido que 60 destroza los dólares en los dos grupos.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const CAP=60000, CAST=0.0138, EXPO=0.24, NMA=50, CORTE=-0.112;
const PREC={...JSON.parse(readFileSync(join(CACHE,"precios-ajustados.json"),"utf8")),
            ...JSON.parse(readFileSync(join(CACHE,"precios-A.json"),"utf8"))};
const PX={},IDX={},SPLIT={};
for(const tk of Object.keys(PREC)){const D=Object.keys(PREC[tk]).sort();
  PX[tk]=D.map(d=>PREC[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
  const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);} SPLIT[tk]=S;}
function ma50(tk,d){const i=IDX[tk]?.get(d); if(i==null||i<NMA)return null;
  for(let j=i-NMA+1;j<=i;j++) if(SPLIT[tk].has(j))return null;
  let s=0; for(let j=i-NMA;j<i;j++)s+=PX[tk][j]; return PX[tk][i]/(s/NMA)-1;}

for (const [n, f] of [["los 27","sincoste-p25-d400.json"], ["GRUPO A","sincosteA-p25-d400.json"]]) {
  process.env.CAMINOS=f;
  const M=await import("./motor-cartera.mjs?g="+f);
  const MA0=M.OPS.map(o=>o.ma), MA50=M.OPS.map(o=>ma50(o.tk,o.dC));
  const poner=(nuevo,u)=>{ for(let i=0;i<M.OPS.length;i++){
    const v = nuevo ? MA50[i] : MA0[i];
    M.OPS[i].ma = (v==null || v>=u || v<-0.30) ? 999 : v; } };
  const banda=(h)=>{ const F=[],A=[],C=[],S=[],O=[];
    for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
      const q=M.simular({tam:EXPO/h,huecos:h,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0,capital:cap});
      F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);}
    return {g:M.med(F),a:M.med(A),c:M.med(C),s:M.med(S),o:M.med(O)}; };
  const spy=M.spyApalancado(1), anos=M.ANOS;
  console.log("");
  console.log("  ══════ " + n + " ══════   exposición total 24% · aguante 120 · sin mínimo de coste");
  console.log("  " + "huecos".padEnd(8) +
    "│  ENTRADA VIEJA (bajo la media de 20)".padEnd(40) + "│  ENTRADA NUEVA (−11,2% bajo la de 50)");
  console.log("  " + "".padEnd(8) + "│" + "al año".padStart(10) + "%".padStart(8) + "Sharpe".padStart(8) +
    "ops".padStart(6) + "  │" + "al año".padStart(10) + "%".padStart(8) + "Sharpe".padStart(8) + "ops".padStart(6) + "  caída");
  for (const h of [2,3,4,5,6,8,10,12,16,20]) {
    poner(false, 0);  const v = banda(h);
    poner(true, CORTE); const w = banda(h);
    const c = (r) => ("$"+Math.round(r.g/anos).toLocaleString("en-US")).padStart(10) +
      (r.a.toFixed(1)+"%").padStart(8) + r.s.toFixed(2).padStart(8) + String(Math.round(r.o)).padStart(6);
    console.log("  " + String(h).padEnd(8) + "│" + c(v) + "  │" + c(w) + ("  −"+w.c.toFixed(0)+"%").padStart(8)); }
  console.log("  " + "SPY".padEnd(8) + "│" + ("$"+Math.round((spy.final-CAP)/anos).toLocaleString("en-US")).padStart(10) +
    (spy.cagr.toFixed(1)+"%").padStart(8) + spy.sharpe.toFixed(2).padStart(8) + "     —" +
    "  │   (comprar y dormir · caída −" + spy.caida.toFixed(0) + "%)");
}
console.log("");
