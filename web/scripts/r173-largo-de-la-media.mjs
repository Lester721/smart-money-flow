// ══ 2 · ¿CONTRA QUÉ MEDIA HAY QUE MEDIR LO HUNDIDO? ══ Lester, 2026-08-30
//
// La media de 20 días se congeló el primer día y nunca se movió con la regla nueva. Un −10%
// contra la media de 20 es un susto de tres semanas; contra la de 200 es un mercado bajista.
//
// ⚠️ DOS TRAMPAS QUE SE EVITAN AQUÍ:
//  1. COMPARAR A MISMA FRECUENCIA. Un −10% contra una media larga se da mucho más a menudo, así
//     que comparar el mismo −10% en las cinco longitudes compararía muestras de distinto tamaño
//     y la larga ganaría por volumen. Se elige en cada longitud el corte que deja el MISMO
//     número de operaciones que el −10% de 20 días.
//  2. LOS SPLITS. El precio sale por paridad de la cadena BRUTA, así que un split es un salto.
//     Se detectan (salto diario > 35%) y se descarta cualquier ventana que cruce uno — con una
//     media de 200 días un solo split corrompe 200 observaciones.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const CAST = 0.0138, kM = (1-CAST/2)/(1+CAST/2);
const ms = (d) => Date.parse(d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8));
const mf = (c) => { let i = Math.min(120,c.length)-1;
  for (let j=0;j<=i;j++) if (c[j][1]<=0.50) { i=j; break; } return c[i][1]*kM; };
function ss(L) { const P={}; for (const x of L) (P[x.k]=P[x.k]||[]).push(x);
  const o=[]; for (const g of Object.values(P)) { let u=-1e15;
    for (const x of g.sort((a,b)=>a.dC.localeCompare(b.dC))) {
      const t=ms(x.dC); if (t-u<180*86400000) continue; u=t; o.push(x); } } return o; }
const mm = (V)=>V.reduce((a,b)=>a+b,0)/V.length;
function t2(A,B){ const a=mm(A),b=mm(B);
  const va=A.reduce((s,x)=>s+(x-a)**2,0)/(A.length-1), vb=B.reduce((s,x)=>s+(x-b)**2,0)/(B.length-1);
  return { d:a-b, t:(a-b)/Math.sqrt(va/A.length+vb/B.length) }; }

const PREC = { ...JSON.parse(readFileSync(join(CACHE,"precios-ajustados.json"),"utf8")),
               ...JSON.parse(readFileSync(join(CACHE,"precios-A.json"),"utf8")) };
// splits: índices donde el precio salta más de un 35% en un día
const SPLIT = {}, DIAS = {}, PX = {};
let nsp = 0;
for (const tk of Object.keys(PREC)) {
  const D = Object.keys(PREC[tk]).sort(); DIAS[tk]=D; PX[tk]=D.map(d=>PREC[tk][d]);
  const S = new Set();
  for (let i=1;i<D.length;i++) { const r = PX[tk][i]/PX[tk][i-1];
    if (r>1.35 || r<0.65) { S.add(i); nsp++; } }
  SPLIT[tk]=S; }
console.log("\n  saltos de precio detectados (splits): " + nsp + " en " +
  Object.keys(SPLIT).filter(t=>SPLIT[t].size).length + " tickers");

function maN(tk, d, N) {                       // media de los N días ANTERIORES, sin incluir hoy
  const D = DIAS[tk]; if (!D) return null;
  const i = D.indexOf(d); if (i < N) return null;
  for (let j=i-N+1; j<=i; j++) if (SPLIT[tk].has(j)) return null;   // la ventana cruza un split
  let s=0; for (let j=i-N;j<i;j++) s += PX[tk][j];
  return PX[tk][i] / (s/N) - 1; }

const CAM = [];
for (const [f,g] of [["largo-p25-d400.json","27|"],["caminos-A.json","A|"]]) {
  process.env.CAMINOS = f; const M = await import("./motor-cartera.mjs?u="+f);
  for (const o of M.OPS) if (o.camino && o.camino.length>=15)
    CAM.push({ k:g+o.tk, tk:o.tk, dC:o.dC, m:mf(o.camino) }); }
console.log("  entradas: " + CAM.length.toLocaleString("en-US"));

console.log("");
console.log("  ── a MISMA frecuencia que el −10% de 20 días ──");
console.log("  " + "media de".padEnd(14) + "corte".padStart(8) + "n".padStart(6) +
  "x dentro".padStart(10) + "x fuera".padStart(10) + "dif".padStart(9) + "t".padStart(7));
// ⚠️ el objetivo se fija ANTES del bucle: si no, la primera longitud compara contra null
//    (n > null es n > 0, siempre cierto) y el buscador se va al tope.
const CON20 = CAM.map((x)=>({ ...x, v: maN(x.tk, x.dC, 20) })).filter((x)=>x.v!=null);
const objetivo = ss(CON20.filter((x)=>x.v<=-0.10)).length;
console.log("  objetivo de frecuencia: " + objetivo + " operaciones (el −10% de 20 días)");

for (const N of [10,20,50,100,200]) {
  const con = CAM.map((x)=>({ ...x, v: maN(x.tk, x.dC, N) })).filter((x)=>x.v!=null);
  // corte que deja el mismo nº de operaciones sin solapar que el −10% de 20 días
  let corte = -0.10;
  if (N !== 20) { let lo=-0.60, hi=0;
    for (let it=0; it<28; it++) { const md=(lo+hi)/2;
      const n = ss(con.filter((x)=>x.v<=md)).length;
      // lo=−60% deja POCAS, hi=0% deja MUCHAS. Si sobran, el corte tiene que bajar → hi=md.
      if (n > objetivo) hi=md; else lo=md; }
    corte = (lo+hi)/2; }
  const A = ss(con.filter((x)=>x.v<=corte)), B = ss(con.filter((x)=>x.v>corte));
  const r = t2(A.map(x=>x.m), B.map(x=>x.m));
  console.log("  " + (N+" días").padEnd(14) + ((100*corte).toFixed(1)+"%").padStart(8) +
    String(A.length).padStart(6) + mm(A.map(x=>x.m)).toFixed(3).padStart(10) +
    mm(B.map(x=>x.m)).toFixed(3).padStart(10) +
    ((r.d>=0?"+":"")+r.d.toFixed(3)).padStart(9) + r.t.toFixed(2).padStart(7) +
    (N===20 ? "   ← la actual" : "")); }
console.log("");

// ── CONTROLES sobre la candidata: media de 50, corte −11,2% ──
const C50 = CAM.map((x)=>({...x, v: maN(x.tk, x.dC, 50)})).filter((x)=>x.v!=null);
const A50 = ss(C50.filter((x)=>x.v<=-0.112)), B50 = ss(C50.filter((x)=>x.v>-0.112));
const A20 = ss(CON20.filter((x)=>x.v<=-0.10)), B20 = ss(CON20.filter((x)=>x.v>-0.10));
console.log("  ── CONTROLES · media de 50 al −11,2% (contra la de 20 al −10%) ──");
console.log("  " + "".padEnd(26) + "n".padStart(6) + "dif 50d".padStart(10) + "t".padStart(7) + "dif 20d".padStart(10) + "t".padStart(7));
const sub = (L, fl) => L.filter(fl).map(x=>x.m);
for (const [et, fl] of [["la medición", ()=>true],
                        ["quitando 2020", (x)=>x.dC.slice(0,4)!=="2020"],
                        ["quitando 2020 y 2022", (x)=>!["2020","2022"].includes(x.dC.slice(0,4))],
                        ["sólo los 27", (x)=>x.k.startsWith("27|")],
                        ["sólo el grupo A", (x)=>x.k.startsWith("A|")],
                        ["1ª mitad", (x)=>x.dC < "20210701"],
                        ["2ª mitad", (x)=>x.dC >= "20210701"]]) {
  const a5=sub(A50,fl), b5=sub(B50,fl), a2=sub(A20,fl), b2=sub(B20,fl);
  if (a5.length<8 || a2.length<8) { console.log("  " + et.padEnd(26) + String(a5.length).padStart(6) + "  (pocas)"); continue; }
  const r5=t2(a5,b5), r2=t2(a2,b2);
  console.log("  " + et.padEnd(26) + String(a5.length).padStart(6) +
    ((r5.d>=0?"+":"")+r5.d.toFixed(3)).padStart(10) + r5.t.toFixed(2).padStart(7) +
    ((r2.d>=0?"+":"")+r2.d.toFixed(3)).padStart(10) + r2.t.toFixed(2).padStart(7)); }
console.log("");

// ── ¿se combinan la media de 50 y el aguante corto? ──
const mfH = (c,h) => { let i=Math.min(h,c.length)-1;
  for (let j=0;j<=i;j++) if (c[j][1]<=0.50) { i=j; break; } return c[i][1]*kM; };
const CRUDO = [];
for (const [f,g] of [["largo-p25-d400.json","27|"],["caminos-A.json","A|"]]) {
  process.env.CAMINOS=f; const M = await import("./motor-cartera.mjs?h="+f);
  for (const o of M.OPS) if (o.camino && o.camino.length>=15)
    CRUDO.push({ k:g+o.tk, tk:o.tk, dC:o.dC, cam:o.camino, v: maN(o.tk,o.dC,50) }); }
const CV = CRUDO.filter(x=>x.v!=null);
console.log("  ── media de 50 al −11,2% · ¿cuánto aguantar? ──");
console.log("  " + "sesiones".padEnd(14) + "n".padStart(6) + "x dentro".padStart(10) +
  "x fuera".padStart(10) + "dif".padStart(9) + "t".padStart(7) + "   sin 2020");
for (const h of [20,40,60,90,120,180,250]) {
  const A = ss(CV.filter(x=>x.v<=-0.112)).map(x=>({...x,m:mfH(x.cam,h)}));
  const B = ss(CV.filter(x=>x.v>-0.112)).map(x=>({...x,m:mfH(x.cam,h)}));
  const r = t2(A.map(x=>x.m), B.map(x=>x.m));
  const f20 = (x)=>x.dC.slice(0,4)!=="2020";
  const r0 = t2(A.filter(f20).map(x=>x.m), B.filter(f20).map(x=>x.m));
  console.log("  " + (h+" ses.").padEnd(14) + String(A.length).padStart(6) +
    mm(A.map(x=>x.m)).toFixed(3).padStart(10) + mm(B.map(x=>x.m)).toFixed(3).padStart(10) +
    ((r.d>=0?"+":"")+r.d.toFixed(3)).padStart(9) + r.t.toFixed(2).padStart(7) +
    "     " + ((r0.d>=0?"+":"")+r0.d.toFixed(3)) + " (t=" + r0.t.toFixed(2) + ")"); }
console.log("");
