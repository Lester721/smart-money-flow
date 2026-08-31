// ⚠️ ESTO MIRA AL FUTURO A PROPÓSITO. Es un DIAGNÓSTICO, no una estrategia.
// Pregunta de Lester: «tuvimos que haber tenido en el 2025 contratos que triplicaron en valor, no?»
// Se mide el MÁXIMO que llegó a valer cada contrato en toda su vida (al bid, con peaje).
// Eso NO se puede cobrar —no sabes cuál es el máximo hasta que pasa— pero dice si existían.
import { cargar, simular, resumir } from "./consultar.mjs";
const $=(x)=>(x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
const MAG=(f)=>f.dentro&&f.dte>=5&&f.ask*100>=10000&&f.hora>="14:00"&&f.vsOI>=12;
const yr=(y)=>[...Array(12)].map((_,i)=>y+String(i+1).padStart(2,"0"));
const AÑOS=[["2021",yr("2021")],["2022",yr("2022")],["2023",yr("2023")],["2024",yr("2024")],
            ["2025",yr("2025")],["2026",["202601","202602","202603","202604","202605","202606","202607","202608"]]];
const D={}; for(const [y,M] of AÑOS) D[y]=cargar(M).filter(MAG);
for(const [y] of AÑOS) for(const f of D[y]){
  let mx=0, dia=null, n=0, nMax=0;
  for(const [d,bid] of f.camino){ n++; const m=bid/f.ask; if(m>mx){mx=m;dia=d;nMax=n;} }
  f._max=mx; f._diaMax=dia; f._nMax=nMax;
}
console.log(`\n  ⚠️  TODO LO QUE SIGUE MIRA AL FUTURO. Es para saber si existían, no para operar.\n`);
console.log(`  ═══ ¿CUÁNTOS CONTRATOS LLEGARON A DOBLAR, TRIPLICAR O MÁS? ═══\n`);
console.log(`  ${"año".padEnd(6)} ${"señales".padStart(8)} ${"≥1.5x".padStart(7)} ${"≥2x".padStart(6)} ${"≥3x".padStart(6)} ${"≥5x".padStart(6)} ${"≥10x".padStart(6)} ${"el mayor".padStart(9)}`);
for(const [y] of AÑOS){
  const L=D[y]; if(!L.length){console.log(`  ${y.padEnd(6)}   sin señales`);continue;}
  const c=(x)=>L.filter(f=>f._max>=x).length;
  console.log(`  ${y.padEnd(6)} ${String(L.length).padStart(8)} ${String(c(1.5)).padStart(7)} ${String(c(2)).padStart(6)} ${String(c(3)).padStart(6)} ${String(c(5)).padStart(6)} ${String(c(10)).padStart(6)} ${Math.max(...L.map(f=>f._max)).toFixed(2).padStart(8)}x`);
}
console.log(`\n  ═══ LOS DE 2025 QUE LLEGARON A 2x O MÁS — uno a uno ═══\n`);
const L25=D["2025"].filter(f=>f._max>=2).sort((a,b)=>b._max-a._max);
console.log(`  ${"día".padEnd(10)} ${"tk".padEnd(5)} ${"contrato".padEnd(14)} ${"cuesta".padStart(10)} ${"MÁXIMO".padStart(8)} ${"a los".padStart(7)} ${"lo que cobramos".padStart(16)}`);
for(const f of L25){
  const r=simular(f,{objetivo:1.50,suelo:0.50,salirEnDias:15});
  console.log(`  ${f.dC.padEnd(10)} ${f.tk.padEnd(5)} ${`${f.l}${f.K} ${f.exp.slice(4)}`.padEnd(14)} ${$(f.ask*100).padStart(10)} ${(f._max.toFixed(2)+"x").padStart(8)} ${(f._nMax+"d").padStart(7)} ${(r.mult.toFixed(2)+"x").padStart(16)}`);
}
console.log(`\n  ═══ ¿CUÁNTO DEJA EL TOPE DEL 1.50x SOBRE LA MESA? ═══\n`);
console.log(`  ${"año".padEnd(6)} ${"con tope 1.50x".padStart(16)} ${"SIN tope (a 15 días)".padStart(22)} ${"diferencia".padStart(13)}`);
for(const [y] of AÑOS){
  const L=D[y]; if(!L.length)continue;
  const a=resumir(L,{objetivo:1.50,suelo:0.50,salirEnDias:15});
  const b=resumir(L,{objetivo:null,suelo:0.50,salirEnDias:15});
  console.log(`  ${y.padEnd(6)} ${$(a.neto).padStart(16)} ${$(b.neto).padStart(22)} ${$(b.neto-a.neto).padStart(13)}`);
}
console.log(`\n  ═══ ¿CUÁNTAS VECES SE TOCA EL 1.50x DE VERDAD? (salida a 15 días) ═══\n`);
for(const [y] of AÑOS){
  const L=D[y]; if(!L.length)continue;
  const R=L.map(f=>simular(f,{objetivo:1.50,suelo:0.50,salirEnDias:15}));
  const o=R.filter(r=>r.salio==="objetivo").length;
  console.log(`  ${y}: ${String(o).padStart(3)} de ${String(L.length).padStart(3)} salen por el objetivo de 1.50x`);
}
console.log("");
