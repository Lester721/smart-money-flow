// ══ ¿SE PODÍA VER VENIR 2018 Y 2022? ══ Lester, 30-ago-2026:
//   «¿existe alguna manera que yo pude haberme dado cuenta que 2018 y 2022 no era un año para
//    hacer trades y me quedaba tranquilo con todo descansando en SPY?»
//
// PRIMERO hay que deshacer una confusión: en 2022 la pérdida fue casi toda de SPY (−$29.540 de
// −$39.399). "Descansar en SPY" NO era refugio — SPY era el problema. Lo que él describe es
// estar en EFECTIVO. Se miden las dos cosas por separado.
//
// SEGUNDO: se calcula el TECHO con un oráculo que ve el futuro. Si ni sabiendo los años malos de
// antemano se gana gran cosa, ninguna regla honesta puede — y eso cierra la pregunta con número
// en vez de con opinión.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const CAP=60000, CAST=0.0275;
const P={}; for(const f of ["precios-A.json","precios-B.json"]) Object.assign(P,JSON.parse(readFileSync(join(CACHE,f),"utf8")));
const PX={},IDX={},SPL={};
for(const tk of Object.keys(P)){const D=Object.keys(P[tk]).sort();
 PX[tk]=D.map(d=>P[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
 const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);} SPL[tk]=S;}
const ma50=(tk,d)=>{const i=IDX[tk]?.get(d); if(i==null||i<50)return null;
 for(let j=i-49;j<=i;j++) if(SPL[tk].has(j))return null;
 let s=0; for(let j=i-50;j<i;j++)s+=PX[tk][j]; return PX[tk][i]/(s/50)-1;};
process.env.CAMINOS="sincosteAB-p10-d400.json";
const M=await import("./motor-cartera.mjs");
const V=M.OPS.map(o=>ma50(o.tk,o.dC));
for(let i=0;i<M.OPS.length;i++){const v=V[i]; M.OPS[i].ma=(v!=null&&v<-0.07&&v>=-0.30)?v:999;}
const CF={tam:0.024,huecos:10,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0};
const DD=M.DD, SPY=M.SPY;
// media de 200 sesiones de SPY, sin mirar al futuro
const ma200=new Map();
for(let i=200;i<DD.length;i++){let s=0; for(let j=i-200;j<i;j++)s+=SPY[DD[j]];
  ma200.set(DD[i], SPY[DD[i]]/(s/200)-1);}

function corre(cfg, desde, hasta){ const F=[],A=[],C=[],S=[],O=[];
  for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
    const q=M.simular({...CF,...cfg,capital:cap,desdeD:desde,hasta});
    F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);}
  return {d:M.med(F)/M.ANOS,a:M.med(A),c:M.med(C),s:M.med(S),o:M.med(O)};}

console.log("");
console.log("  ══ 1 · ¿QUÉ HABRÍA PASADO EN 2018 Y 2022 CON CADA REFUGIO? ══");
console.log("  " + "año".padEnd(8)+"la estrategia".padStart(15)+"todo en SPY".padStart(14)+
  "todo en EFECTIVO".padStart(18));
for (const [a, d0, d1] of [["2018","20180101","20181231"],["2022","20220101","20221231"]]) {
  const q = M.simular({...CF, capital:CAP, desdeD:d0, hasta:d1});
  const i0 = DD.findIndex(d=>d>=d0), i1 = DD.map((d,i)=>[d,i]).filter(([d])=>d<=d1).pop()[1];
  const rSPY = SPY[DD[i1]]/SPY[DD[i0]] - 1 + 0.018;   // + dividendo aproximado del año
  console.log("  " + a.padEnd(8)+
    (((q.final-CAP)>=0?"+$":"−$")+Math.abs(Math.round(q.final-CAP)).toLocaleString("en-US")).padStart(15)+
    ((rSPY>=0?"+$":"−$")+Math.abs(Math.round(CAP*rSPY)).toLocaleString("en-US")).padStart(14)+
    ("+$"+Math.round(CAP*0.033).toLocaleString("en-US")).padStart(18)); }
console.log("  (sobre $60.000 en cada caso, para que se comparen manzanas con manzanas)");

console.log("");
console.log("  ══ 2 · EL TECHO: un oráculo que VE EL FUTURO ══");
console.log("  " + "".padEnd(40)+"al año".padStart(11)+"caída".padStart(8)+"Sharpe".padStart(8));
const base = corre({});
const F=(et,r)=>console.log("  "+et.padEnd(40)+("$"+Math.round(r.d).toLocaleString("en-US")).padStart(11)+
  ("−"+r.c.toFixed(0)+"%").padStart(8)+r.s.toFixed(2).padStart(8));
F("la estrategia, tal cual", base);
// oráculo: en 2018 y 2022 todo en efectivo (se simula el resto de años y se suma el 3,3%)
{ const trozos=[["20160104","20171231"],["20190101","20211231"],["20230101","20260819"]];
  let cap=CAP, dias=0;
  for (const [d0,d1] of trozos){ const q=M.simular({...CF,capital:cap,desdeD:d0,hasta:d1}); cap=q.final; }
  cap *= Math.pow(1.033, 2);                      // 2018 y 2022 en efectivo al 3,3%
  const anos=M.ANOS;
  console.log("  "+"ORÁCULO: efectivo en 2018 y 2022".padEnd(40)+
    ("$"+Math.round((cap-CAP)/anos).toLocaleString("en-US")).padStart(11)+"      ?"+"       ?"); }
console.log("");
console.log("  ══ 3 · ¿ALGUNA REGLA HONESTA SE ACERCA? ══   (SPY bajo su media de 200)");
console.log("  " + "".padEnd(40)+"al año".padStart(11)+"caída".padStart(8)+"Sharpe".padStart(8)+"ops".padStart(6));
const F2=(et,r)=>console.log("  "+et.padEnd(40)+("$"+Math.round(r.d).toLocaleString("en-US")).padStart(11)+
  ("−"+r.c.toFixed(0)+"%").padStart(8)+r.s.toFixed(2).padStart(8)+String(Math.round(r.o)).padStart(6));
F2("sin freno (la estrategia)", base);
for (const f of [0.05, 0.10, 0.15, 0.20]) F2("no abrir si SPY cae "+(100*f).toFixed(0)+"% desde su máximo", corre({frenoSPY:f}));
// y la regla clásica: SPY por debajo de su media de 200 sesiones
{ const MA0=M.OPS.map(o=>o.ma);
  for (const bajo of [true]) {
    for(let i=0;i<M.OPS.length;i++){ const o=M.OPS[i];
      const m=ma200.get(o.dC);
      o.ma = (MA0[i]!==999 && m!=null && m>0) ? MA0[i] : 999; }   // sólo abrir si SPY sobre su MA200
    F2("sólo abrir si SPY sobre su media de 200", corre({}));
    for(let i=0;i<M.OPS.length;i++) M.OPS[i].ma=MA0[i]; } }
console.log("");
