import fs from "node:fs";
import { radiografia } from "../../lib/radiografia.ts";
import { pasarBarrera, listonT, informe, potencia } from "../../lib/barreraHallazgos.ts";
const P=JSON.parse(fs.readFileSync("scripts/marketsnack/lado-intradia.json","utf8"));
const METRICAS=["netoCall","netoPut","direccion","deltaNeto"], CORTES=Object.keys(P);
const PRUEBAS = 4*3*3 /* cierre→cierre 1/5/20d */ + 4*3 /* corte→cierre */;   // 48 DECLARADAS
const LIST=listonT(PRUEBAS);
console.log(`PRUEBAS DECLARADAS EN TODO EL ENCARGO: ${PRUEBAS} → listón |t| = ${LIST}\n`);
radiografia(P["11:00"], ["netoCall","netoPut","direccion","deltaNeto","rIntra","n","pxEntrada"], "panel intradía 11:00");

const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:0;
const sd=(v)=>{if(v.length<2)return 0;const m=media(v);return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1));};
const tUna=(v)=>{const s=sd(v);return s>0?media(v)/(s/Math.sqrt(v.length)):0;};

function serieDiaria(filas,m){
  const porDia=new Map();
  for(const f of filas){ if(f[`q_${m}`]==null||f.rIntra==null)continue; let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push(f); }
  const out=[];
  for(const [dia,g] of [...porDia].sort()){ if(g.length<20)continue;
    const o=[...g].sort((a,b)=>a[`q_${m}`]-b[`q_${m}`]); const k=Math.floor(o.length/3); if(k<5)continue;
    const alto=media(o.slice(-k).map(x=>x.rIntra)), bajo=media(o.slice(0,k).map(x=>x.rIntra)), todo=media(o.map(x=>x.rIntra));
    out.push({dia, ls:alto-bajo, largo:alto-todo, k}); }
  return out;
}
console.log(`\n═══ SEÑAL EN EL CORTE → SALIDA AL CIERRE (unidad = el día) ═══`);
console.log(`corte  métrica     días   L/S medio   t    días>0   3 tercios   largo-solo`);
const R=[];
for(const c of CORTES) for(const m of METRICAS){
  const s=serieDiaria(P[c],m); if(s.length<30) continue;
  const ls=s.map(x=>x.ls); const k=Math.floor(s.length/3);
  const ter=[s.slice(0,k),s.slice(k,2*k),s.slice(2*k)].map(g=>media(g.map(x=>x.ls)));
  const r={c,m,nDias:s.length,mediaLS:media(ls),t:tUna(ls),gan:ls.filter(x=>x>0).length,ter,sd:sd(ls),
           mediaLargo:media(s.map(x=>x.largo))};
  R.push(r);
}
R.sort((a,b)=>Math.abs(b.t)-Math.abs(a.t));
for(const r of R) console.log(`${r.c}  ${r.m.padEnd(10)} ${String(r.nDias).padStart(4)}  ${(r.mediaLS*100).toFixed(3).padStart(7)}%  ${r.t.toFixed(2).padStart(6)}  ${String(r.gan).padStart(3)}/${r.nDias}   ${r.ter.map(x=>x>=0?"+":"−").join("")}  [${r.ter.map(x=>(x*100).toFixed(2)).join(" ")}]  ${(r.mediaLargo*100).toFixed(3)}%`);

const B=R[0];
console.log(`\n═══ DETALLE · ${B.c} · ${B.m} ═══`);
const filas=P[B.c].filter(f=>f[`q_${B.m}`]!=null&&f.rIntra!=null).map(f=>({pnl:f.rIntra,ticker:f.ticker,fecha:f.fecha,q:f[`q_${B.m}`]}));
const v=pasarBarrera(filas,f=>f.q,{pruebas:PRUEBAS,nMinimo:200,maxPorTicker:0.2});
console.log(informe(v,`LADO intradía · ${B.m} · corte ${B.c} → cierre`));
console.log("\n"+potencia(filas,0.005).mensaje);

console.log(`\n═══ QUINTILES (${B.c} · retorno corte→cierre, %) ═══`);
for(const m of METRICAS){
  const f=P[B.c].filter(x=>x[`q_${m}`]!=null&&x.rIntra!=null);
  const q=[0,1,2,3,4].map(k=>f.filter(x=>x[`q_${m}`]>=k/5&&x[`q_${m}`]<(k+1)/5+(k===4?0.001:0)));
  console.log(`${m.padEnd(10)} `+q.map((g,i)=>`Q${i+1} ${(media(g.map(x=>x.rIntra))*100).toFixed(3)}%`).join("  "));
}
console.log(`\n═══ ANTES / DESPUÉS de la ruptura 2026-07-16 (${B.c} · ${B.m}) ═══`);
for(const [et,fi] of [["antes",(f)=>f.fecha<"2026-07-16"],["después",(f)=>f.fecha>="2026-07-16"]]){
  const s=serieDiaria(P[B.c].filter(fi),B.m); const ls=s.map(x=>x.ls);
  console.log(`  ${et.padEnd(8)} ${s.length} días · ${(media(ls)*100).toFixed(3)}% · t=${tUna(ls).toFixed(2)} · ${ls.filter(x=>x>0).length}/${s.length} días>0`);
}
fs.writeFileSync("scripts/marketsnack/lado-intradia-resumen.json",JSON.stringify(R,null,1));
