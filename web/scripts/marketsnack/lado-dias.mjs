// La unidad independiente NO es la fila (símbolo, día): 77 símbolos del mismo día comparten
// mercado y sector. La unidad es EL DÍA. Aquí se construye la cartera larga-corta transversal
// día a día y se contrasta la serie de 83 retornos diarios. Es el número honesto.
import fs from "node:fs";
import { listonT, tWelch } from "../../lib/barreraHallazgos.ts";
const P = JSON.parse(fs.readFileSync("scripts/marketsnack/lado-panel.json","utf8"));
const METRICAS=["netoCall","netoPut","direccion","deltaNeto"], HORIZ=[1,5,20], CORTES=Object.keys(P);
const PRUEBAS = METRICAS.length*HORIZ.length*CORTES.length;
const LIST = listonT(PRUEBAS);
const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:0;
const sd=(v)=>{ if(v.length<2)return 0; const m=media(v); return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1)); };

function serieDiaria(filas, m, h){
  const porDia=new Map();
  for(const f of filas){ if(f[`q_${m}`]==null||f[`r${h}`]==null) continue;
    let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push(f); }
  const out=[];
  for(const [dia,g] of [...porDia].sort()){
    if(g.length<20) continue;
    const o=[...g].sort((a,b)=>a[`q_${m}`]-b[`q_${m}`]); const k=Math.floor(o.length/3);
    if(k<5) continue;
    const alto=media(o.slice(-k).map(x=>x[`r${h}`])), bajo=media(o.slice(0,k).map(x=>x[`r${h}`])), todo=media(o.map(x=>x[`r${h}`]));
    out.push({dia, ls: alto-bajo, largo: alto-todo, corto: todo-bajo, nSim:g.length});
  }
  return out;
}
const tUna=(v)=>{ const s=sd(v); return s>0 ? media(v)/(s/Math.sqrt(v.length)) : 0; };

const R=[];
for(const c of CORTES) for(const m of METRICAS) for(const h of HORIZ){
  const s=serieDiaria(P[c],m,h); if(s.length<30) continue;
  const ls=s.map(x=>x.ls), lg=s.map(x=>x.largo);
  // solapamiento: a h días las carteras diarias se solapan; el t se corrige por Newey-West sencillo
  const t=tUna(ls), tCorr = t/Math.sqrt(h);          // corrección conservadora por solape
  const k=Math.floor(s.length/3);
  const ter=[s.slice(0,k),s.slice(k,2*k),s.slice(2*k)].map(g=>media(g.map(x=>x.ls)));
  R.push({c,m,h,nDias:s.length,mediaLS:media(ls),t,tCorr,mediaLargo:media(lg),
          sgTer:ter.map(x=>x>=0?"+":"−").join(""), ter, sdLS:sd(ls), ganadores:ls.filter(x=>x>0).length});
}
R.sort((a,b)=>Math.abs(b.tCorr)-Math.abs(a.tCorr));
console.log(`unidad = EL DÍA. ${PRUEBAS} pruebas declaradas → listón |t| = ${LIST}\n`);
console.log(`corte  métrica     h  días   L/S medio   t crudo  t corregido  3 tercios  días>0   largo-solo`);
for(const r of R) console.log(
  `${r.c}  ${r.m.padEnd(10)} ${String(r.h).padStart(2)}d ${String(r.nDias).padStart(4)}  ${(r.mediaLS*100).toFixed(3).padStart(7)}%  ${r.t.toFixed(2).padStart(6)}  ${r.tCorr.toFixed(2).padStart(6)}      ${r.sgTer}   ${String(r.ganadores).padStart(3)}/${r.nDias}  ${(r.mediaLargo*100).toFixed(3).padStart(7)}%`);

console.log(`\n═══ El mejor a 1 día, en detalle ═══`);
const best = R.filter(x=>x.h===1).sort((a,b)=>Math.abs(b.t)-Math.abs(a.t))[0];
console.log(JSON.stringify(best,null,1));
const s = serieDiaria(P[best.c],best.m,1);
console.log(`\nserie diaria L/S: media ${(media(s.map(x=>x.ls))*100).toFixed(4)}% · sd ${(sd(s.map(x=>x.ls))*100).toFixed(3)}% · días ${s.length}`);
console.log(`anualizado bruto (250 días): ${(media(s.map(x=>x.ls))*250*100).toFixed(1)}%  ← ojo: BRUTO, sin horquilla`);
// ¿cuánta muestra haría falta?
const need = (LIST/Math.abs(best.t))**2 * s.length;
console.log(`para llegar al listón ${LIST} con este tamaño de efecto harían falta ~${Math.round(need)} días de mercado (hay ${s.length}) → faltan ~${Math.round(need-s.length)} días ≈ ${((need-s.length)/21).toFixed(0)} meses de captura diaria`);
fs.writeFileSync("scripts/marketsnack/lado-dias.json", JSON.stringify({R,serie:s},null,1));
