// ══ OPTIMIZAR LA REGLA DEL GRUPO A, EN CARTERA ══ Lester, 30-ago-2026:
//   «asegúrate que optimizaste la regla del grupo A a su perfección y que generas más dinero
//    con esa regla que ninguna anterior, entonces la grabas y me dices estoy listo para B.»
//
// ⚠️ DISCIPLINA: NO se coge el máximo de la rejilla. Se ordena por la MEDIANA DEL VECINDARIO
//    (la casilla y sus vecinas inmediatas). Una casilla alta rodeada de bajas es ruido — es lo
//    que mató seis hallazgos el 29 de agosto y el umbral del 3% esta mañana.
// ⚠️ Todo con la mediana de 41 capitales de partida.
// ⚠️ El grupo A YA está gastado como examen (se gastó con el umbral del 3%). Optimizar aquí es
//    legítimo; el examen limpio que queda es B, y se gasta una sola vez.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const CAP=60000, CAST=0.0138;
const PREC={...JSON.parse(readFileSync(join(CACHE,"precios-A.json"),"utf8"))};
const PX={},IDX={},SPLIT={};
for(const tk of Object.keys(PREC)){const D=Object.keys(PREC[tk]).sort();
 PX[tk]=D.map(d=>PREC[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
 const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);}
 SPLIT[tk]=S;}
const cacheMA={};
function maN(tk,d,N){const key=tk+d+N; if(key in cacheMA) return cacheMA[key];
 const i=IDX[tk]?.get(d); let r=null;
 if(i!=null&&i>=N){ let ok=true;
   for(let j=i-N+1;j<=i;j++) if(SPLIT[tk].has(j)){ok=false;break;}
   if(ok){ let s=0; for(let j=i-N;j<i;j++)s+=PX[tk][j]; r=PX[tk][i]/(s/N)-1; } }
 cacheMA[key]=r; return r;}

process.env.CAMINOS="sincosteA-p25-d400.json";
const M=await import("./motor-cartera.mjs");
const OPS=M.OPS, ANOS=M.ANOS, SPY=M.spyApalancado(1);
const MAcache={};
function poner(N,u){ if(!(N in MAcache)) MAcache[N]=OPS.map(o=>maN(o.tk,o.dC,N));
  const V=MAcache[N];
  for(let i=0;i<OPS.length;i++){const v=V[i]; OPS[i].ma=(v!=null&&v<u&&v>=-0.30)?v:999;} }
function banda(cfg,nb=41){ const F=[],A=[],C=[],S=[],O=[];
  for(let i=0;i<nb;i++){const cap=CAP*(1+(i-(nb-1)/2)*(nb===41?0.005:0.01));
    const q=M.simular({...cfg,capital:cap,modo:"spy",castigo:CAST,suelo:0.50,costeMin:0});
    F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);}
  return {d:M.med(F)/ANOS,a:M.med(A),c:M.med(C),s:M.med(S),o:M.med(O)};}

const UMBRALES=[-0.04,-0.07,-0.10,-0.13,-0.16], HUECOS=[2,3,4,6,8,10,14,20];
const EXPO=Number(process.argv[2]||0.24), NMA=Number(process.argv[3]||50), HOLD=Number(process.argv[4]||120);
console.log("");
console.log("  ══ REJILLA · media "+NMA+" · aguante "+HOLD+" · exposición total "+(100*EXPO).toFixed(0)+"% ══");
console.log("  $ al año — mediana de 41 capitales");
console.log("  " + "umbral".padEnd(9) + HUECOS.map(h=>(h+" hue.").padStart(10)).join(""));
const G={};
for (const u of UMBRALES) {
  poner(NMA,u);
  const fila=[];
  for (const h of HUECOS) { const r=banda({tam:EXPO/h,huecos:h,plazo:HOLD}); G[u+"|"+h]=r; fila.push(r); }
  console.log("  " + ((100*u).toFixed(0)+"%").padEnd(9) +
    fila.map(r=>("$"+Math.round(r.d/1000)+"k").padStart(10)).join("")); }
console.log("  " + "Sharpe".padEnd(9) + HUECOS.map(h=>"".padStart(10)).join(""));
for (const u of UMBRALES) console.log("  " + ((100*u).toFixed(0)+"%").padEnd(9) +
  HUECOS.map(h=>G[u+"|"+h].s.toFixed(2).padStart(10)).join(""));

// ── VECINDARIO: mediana de la casilla y sus vecinas inmediatas ────────────────────────────
const med=(V)=>{const B=[...V].sort((a,b)=>a-b);return B[Math.floor(B.length/2)];};
const R=[];
for (let iu=0;iu<UMBRALES.length;iu++) for (let ih=0;ih<HUECOS.length;ih++) {
  const V=[];
  for (let a=-1;a<=1;a++) for (let b=-1;b<=1;b++) {
    const u=UMBRALES[iu+a], h=HUECOS[ih+b];
    if (u!==undefined && h!==undefined) V.push(G[u+"|"+h].d); }
  R.push({u:UMBRALES[iu],h:HUECOS[ih],prop:G[UMBRALES[iu]+"|"+HUECOS[ih]],vec:med(V),n:V.length}); }
R.sort((a,b)=>b.vec-a.vec);
console.log("");
console.log("  ── las 6 mejores POR VECINDARIO (no por su propia casilla) ──");
console.log("  " + "umbral".padEnd(9)+"huecos".padStart(8)+"vecindario".padStart(12)+
  "su casilla".padStart(12)+"%/año".padStart(8)+"caída".padStart(8)+"Sharpe".padStart(8)+"ops".padStart(6));
for (const x of R.slice(0,6)) console.log("  " + ((100*x.u).toFixed(0)+"%").padEnd(9) +
  String(x.h).padStart(8) + ("$"+Math.round(x.vec/1000)+"k").padStart(12) +
  ("$"+Math.round(x.prop.d).toLocaleString("en-US")).padStart(12) +
  (x.prop.a.toFixed(1)+"%").padStart(8) + ("−"+x.prop.c.toFixed(0)+"%").padStart(8) +
  x.prop.s.toFixed(2).padStart(8) + String(Math.round(x.prop.o)).padStart(6));
console.log("");
console.log("  listones:  SPY $"+Math.round((SPY.final-CAP)/ANOS).toLocaleString("en-US")+
  " (Sharpe "+SPY.sharpe.toFixed(2)+")   ·   LA PALANCA actual $21,764 (0.59)   ·   mejor previo $30,854 (0.66)");
console.log("");
