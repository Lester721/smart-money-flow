// ══ LA CANDIDATA CONTRA LA PALANCA ACTUAL, EN DÓLARES AL AÑO ══ Lester, 2026-08-30
//
// ⚠️ AVISO QUE VA CON EL NÚMERO: el banco de CARTERA baraja el 100% de las operaciones cuando
//    se toca un parámetro (medido hoy: control y umbral comparten 0 de 49). Así que una
//    diferencia de pocos puntos aquí NO es evidencia. Por eso se dan DOS cuentas:
//      (a) la simulación de cartera, que es lo que preguntó
//      (b) la cuenta por operación, que no depende del orden de llenado de huecos
//    Si las dos apuntan igual, el número vale. Si no, manda la (b).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const CAP = 60000, CAST = 0.0138, kM = (1-CAST/2)/(1+CAST/2);
const NMA = 50, CORTE = -0.112;

const PREC = { ...JSON.parse(readFileSync(join(CACHE,"precios-ajustados.json"),"utf8")),
               ...JSON.parse(readFileSync(join(CACHE,"precios-A.json"),"utf8")) };
const DIAS={}, PX={}, SPLIT={}, IDX={};
for (const tk of Object.keys(PREC)) { const D=Object.keys(PREC[tk]).sort();
  DIAS[tk]=D; PX[tk]=D.map(d=>PREC[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
  const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65) S.add(i);}
  SPLIT[tk]=S; }
function ma50(tk,d){ const i=IDX[tk]?.get(d); if(i==null||i<NMA) return null;
  for(let j=i-NMA+1;j<=i;j++) if(SPLIT[tk].has(j)) return null;
  let s=0; for(let j=i-NMA;j<i;j++) s+=PX[tk][j]; return PX[tk][i]/(s/NMA)-1; }

async function correr(f, cfg, usarMA50, umbral) {
  process.env.CAMINOS = f;
  const M = await import("./motor-cartera.mjs?d=" + f + (usarMA50?"50":"20") + umbral);
  const MA0 = M.OPS.map(o=>o.ma);
  for (let i=0;i<M.OPS.length;i++) {
    const o = M.OPS[i];
    const v = usarMA50 ? ma50(o.tk, o.dC) : MA0[i];
    o.ma = (v == null || v >= umbral || v < -0.30) ? 999 : v; }
  const F=[],A=[],C=[],S=[],O=[];
  for (let i=0;i<41;i++) { const cap = CAP*(1+(i-20)*0.005);
    const q = M.simular({ ...cfg, capital: cap });
    F.push(q.final-cap); A.push(q.cagr); C.push(q.caida); S.push(q.sharpe); O.push(q.ops); }
  const q1 = M.simular({ ...cfg, capital: CAP });
  const spy = M.spyApalancado(1);
  return { g:M.med(F), a:M.med(A), c:M.med(C), s:M.med(S), o:M.med(O),
           anos:M.ANOS, spy, tom:q1.tom, med:M.med }; }

const ACTUAL = { tam:0.12, huecos:2, modo:"spy", plazo:120, castigo:CAST, suelo:0.50, costeMin:5000 };
const CAND   = { tam:0.12, huecos:2, modo:"spy", plazo:60,  castigo:CAST, suelo:0.50, costeMin:0 };

for (const [n, fA, fC] of [["los 27","largo-p25-d400.json","sincoste-p25-d400.json"],
                           ["GRUPO A","caminos-A.json","sincosteA-p25-d400.json"]]) {
  console.log("");
  console.log("  ══════ " + n + " ══════");
  const a = await correr(fA, ACTUAL, false, 0);
  const c = await correr(fC, CAND, true, CORTE);
  console.log("  " + "".padEnd(24) + "ganancia".padStart(12) + "AL AÑO".padStart(11) +
    "%/año".padStart(8) + "caída".padStart(8) + "Sharpe".padStart(8) + "ops".padStart(6));
  const fila = (et, r) => console.log("  " + et.padEnd(24) +
    ("$"+Math.round(r.g).toLocaleString("en-US")).padStart(12) +
    ("$"+Math.round(r.g/r.anos).toLocaleString("en-US")).padStart(11) +
    (r.a.toFixed(1)+"%").padStart(8) + ("−"+r.c.toFixed(0)+"%").padStart(8) +
    r.s.toFixed(2).padStart(8) + String(Math.round(r.o)).padStart(6));
  fila("LA PALANCA actual", a);
  fila("la CANDIDATA", c);
  const sg = a.spy.final - CAP;
  console.log("  " + "comprar SPY y dormir".padEnd(24) + ("$"+Math.round(sg).toLocaleString("en-US")).padStart(12) +
    ("$"+Math.round(sg/a.anos).toLocaleString("en-US")).padStart(11) +
    (a.spy.cagr.toFixed(1)+"%").padStart(8) + ("−"+a.spy.caida.toFixed(0)+"%").padStart(8) +
    a.spy.sharpe.toFixed(2).padStart(8));
  console.log("  " + "→ DIFERENCIA".padEnd(24) +
    ((c.g-a.g>=0?"+$":"−$")+Math.abs(Math.round(c.g-a.g)).toLocaleString("en-US")).padStart(12) +
    ((c.g-a.g>=0?"+$":"−$")+Math.abs(Math.round((c.g-a.g)/a.anos)).toLocaleString("en-US")).padStart(11) +
    ((c.a-a.a>=0?"+":"")+(c.a-a.a).toFixed(1)+"pt").padStart(8));
}
console.log("");
