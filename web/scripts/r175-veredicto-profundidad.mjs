// ══ 4 (BIS) · LA PROFUNDIDAD, LIMPIA, EN LOS DOS GRUPOS ══ Lester, 2026-08-30
//
// Ficheros de r174: cuatro profundidades a 400d, COSTE_MIN = 0, en los 27 y en el grupo A.
// Mismo número de entradas en las cuatro (~62.700), así que por fin se comparan profundidades
// y no cuánto las castigaba el filtro de coste.
//
// La entrada es la CANDIDATA de hoy: la acción a −11,2% o más de su media de 50 días.
// El `ma` NO viene en el fichero: se calcula aquí con las series de precio diarias reales
// (precios-ajustados.json para los 27, precios-A.json para el grupo A), saltando las ventanas
// que cruzan un split.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const CAST = 0.0138, kM = (1-CAST/2)/(1+CAST/2);
const CORTE = -0.112, NMA = 50;
const ms = (d) => Date.parse(d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8));
function ss(L) { const P={}; for (const x of L) (P[x.k]=P[x.k]||[]).push(x);
  const o=[]; for (const g of Object.values(P)) { let u=-1e15;
    for (const x of g.sort((a,b)=>a.dC.localeCompare(b.dC))) {
      const t=ms(x.dC); if (t-u<180*86400000) continue; u=t; o.push(x); } } return o; }
const mm = (V)=>V.reduce((a,b)=>a+b,0)/V.length;
function t2(A,B){ if(A.length<8||B.length<8) return {d:NaN,t:NaN};
  const a=mm(A),b=mm(B);
  const va=A.reduce((s,x)=>s+(x-a)**2,0)/(A.length-1), vb=B.reduce((s,x)=>s+(x-b)**2,0)/(B.length-1);
  return { d:a-b, t:(a-b)/Math.sqrt(va/A.length+vb/B.length) }; }

const PREC = { ...JSON.parse(readFileSync(join(CACHE,"precios-ajustados.json"),"utf8")),
               ...JSON.parse(readFileSync(join(CACHE,"precios-A.json"),"utf8")) };
const DIAS={}, PX={}, SPLIT={}, IDX={};
for (const tk of Object.keys(PREC)) { const D=Object.keys(PREC[tk]).sort();
  DIAS[tk]=D; PX[tk]=D.map(d=>PREC[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
  const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65) S.add(i);}
  SPLIT[tk]=S; }
function ma50(tk,d){ const i=IDX[tk]?.get(d); if(i==null||i<NMA) return null;
  for(let j=i-NMA+1;j<=i;j++) if(SPLIT[tk].has(j)) return null;
  let s=0; for(let j=i-NMA;j<i;j++) s+=PX[tk][j];
  return PX[tk][i]/(s/NMA)-1; }

const P = [15,25,35,50];
for (const H of [60, 120]) {
  console.log("");
  console.log("  ══ AGUANTE " + H + " SESIONES ══   entrada: −11,2% o más bajo la media de 50");
  console.log("  " + "profundidad".padEnd(14) + "apal.".padStart(7) + "n".padStart(6) +
    "x dentro".padStart(10) + "x fuera".padStart(10) + "dif".padStart(9) + "t".padStart(7) +
    "     sin 2020        sólo A");
  for (const p of P) {
    let T = [];
    for (const g of ["27","A"]) { const f = join(CACHE, "prof"+g+"-p"+p+"-d400.json");
      if (!existsSync(f)) continue;
      for (const o of JSON.parse(readFileSync(f,"utf8")).ops) {
        const v = ma50(o.tk, o.dC); if (v==null) continue;
        T.push({ k:g+"|"+o.tk, g, tk:o.tk, dC:o.dC, v, m:o["m"+H]*kM,
                 ap: (o.spot*100)/o.coste }); } }
    if (!T.length) { console.log("  " + (p+"% dentro").padEnd(14) + "  (sin fichero)"); continue; }
    const A = ss(T.filter(x=>x.v<=CORTE)), B = ss(T.filter(x=>x.v>CORTE));
    const r = t2(A.map(x=>x.m), B.map(x=>x.m));
    const f0 = (x)=>x.dC.slice(0,4)!=="2020";
    const r0 = t2(A.filter(f0).map(x=>x.m), B.filter(f0).map(x=>x.m));
    const fa = (x)=>x.g==="A";
    const ra = t2(A.filter(fa).map(x=>x.m), B.filter(fa).map(x=>x.m));
    const ap = [...T.map(x=>x.ap)].sort((a,b)=>a-b)[Math.floor(T.length/2)];
    console.log("  " + (p+"% dentro").padEnd(14) + (ap.toFixed(1)+"x").padStart(7) +
      String(A.length).padStart(6) + mm(A.map(x=>x.m)).toFixed(3).padStart(10) +
      mm(B.map(x=>x.m)).toFixed(3).padStart(10) +
      ((r.d>=0?"+":"")+r.d.toFixed(3)).padStart(9) + r.t.toFixed(2).padStart(7) +
      "   " + ((r0.d>=0?"+":"")+r0.d.toFixed(3)) + " (t=" + r0.t.toFixed(2) + ")" +
      "   " + ((ra.d>=0?"+":"")+ra.d.toFixed(3)) + " (t=" + ra.t.toFixed(2) + ")"); } }
console.log("");
