// ¿Cuántas muestras INDEPENDIENTES hay de verdad en los 652 desplazamientos circulares?
import { readFileSync } from "node:fs";
import { cargar, resumen, drawdown, eur, media } from "./anatomia3-lib.mjs";
const { filas } = cargar();
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
const N=filas.length, ANOS=N/251;
const src=readFileSync("scripts/regimen-fomc.mjs","utf8"), i0=src.indexOf("const FOMC = new Set([");
const FOMC=new Set(src.slice(i0,src.indexOf("]);",i0)).match(/\d{4}-\d{2}-\d{2}/g)||[]);
const mes=f=>f.fecha.slice(0,7);
for(let i=0;i<N;i++){const f=filas[i];let u=0;for(let k=i+1;k<N&&mes(filas[k])===mes(f);k++)u++;
  f.cUlt2=(filas.some(g=>mes(g)>mes(f))&&u<=1)?1:0; f.cFomc=FOMC.has(f.fecha)?1:0;}
const base=filas.map(f=>f.cUlt2===1||f.cFomc===1);
const BASEDD=drawdown(filas.map(f=>f.pl)), BASEANO=filas.reduce((a,f)=>a+f.pl,0)/ANOS;
const met=e=>{const pl=[];for(let i=0;i<N;i++)if(!e[i])pl.push(filas[i].pl);
  const tot=pl.reduce((a,b)=>a+b,0);return {ddElim:Math.abs(BASEDD)-Math.abs(drawdown(pl)), alAno:tot/ANOS};};
const dds=[],anos=[];
for(let k=1;k<N;k++){const e=new Array(N);for(let i=0;i<N;i++)e[i]=base[(i+k)%N];const m=met(e);dds.push(m.ddElim);anos.push(m.alAno);}
// autocorrelación de la serie de estadísticos a lo largo de k
const ac=(v,l)=>{const m=media(v);let n=0,d=0;for(let i=0;i<v.length;i++){d+=(v[i]-m)**2;if(i+l<v.length)n+=(v[i]-m)*(v[i+l]-m);}return n/d;};
console.log("  Autocorrelación del estadístico a lo largo del desplazamiento k (si fueran independientes sería ~0):");
console.log("  retardo k:      1      2      3      5     10     21     42");
console.log("  $/año:     " + [1,2,3,5,10,21,42].map(l=>ac(anos,l).toFixed(3).padStart(6)).join(" "));
console.log("  caída elim:" + [1,2,3,5,10,21,42].map(l=>ac(dds,l).toFixed(3).padStart(6)).join(" "));
// N efectivo por la fórmula de la varianza de la media con autocorrelación
const neff=v=>{let s=1;for(let l=1;l<60;l++){const r=ac(v,l);if(r<=0)break;s+=2*r*(1-l/v.length);}return v.length/s;};
console.log(`\n  muestras EFECTIVAS (corrigiendo por autocorrelación): $/año ≈ ${neff(anos).toFixed(0)} de 652 · caída ≈ ${neff(dds).toFixed(0)} de 652`);
// dónde caen los mejores k
const idx=[...anos.keys()].sort((a,b)=>anos[b]-anos[a]).slice(0,15).map(i=>i+1);
console.log(`\n  los 15 desplazamientos con MÁS $/año (k, y k módulo 21): ${idx.map(k=>`${k}(${k%21})`).join(" ")}`);
console.log("  → si se agrupan cerca de múltiplos de ~21 es que son la MISMA fase del mes, no 652 pruebas distintas.");
const idxD=[...dds.keys()].sort((a,b)=>dds[b]-dds[a]).slice(0,15).map(i=>i+1);
console.log(`  los 15 con MÁS caída eliminada: ${idxD.map(k=>`${k}(${k%21})`).join(" ")}`);
const real=met(base);
console.log(`\n  REAL: caída eliminada ${eur(real.ddElim)} · $/año ${eur(real.alAno)}`);
console.log(`  percentil ingenuo sobre 652: caída ${(dds.filter(x=>x<real.ddElim).length/652*100).toFixed(1)}% · $/año ${(anos.filter(x=>x<real.alAno).length/652*100).toFixed(1)}%`);
console.log(`  p-valor honesto con ~${Math.round(neff(anos))} muestras efectivas: ≈ ${(1/Math.round(neff(anos))).toFixed(3)}   (listón Bonferroni 26 pruebas: 0.0019)`);
