// LA TABLA MÁGICA EN CRUDO, SEIS AÑOS — sin ninguna variable en desarrollo.
// Lester, el 2026-08-26: «corre 2023, 2024 y 2025 sin ninguna variable (raw)».
// La regla, tal cual está grabada en [[tabla-magica]]: golpe >$500k al ask o por encima,
// 12x el OI de la víspera, DENTRO del dinero, contrato >=$10,000, >=5 días, después de las 14:00.
// Compra al ask del día siguiente, venta al bid, salida a los 15 días de bolsa. Peaje dentro.
import { cargar, resumir, simular, cuenta } from "./consultar.mjs";
const O={objetivo:1.50,suelo:0.50,salirEnDias:15};
const $=(x)=>(x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
const MAG=(f)=>f.dentro&&f.dte>=5&&f.ask*100>=10000&&f.hora>="14:00"&&f.vsOI>=12;
const yr=(y)=>[...Array(12)].map((_,i)=>y+String(i+1).padStart(2,"0"));
const AÑOS=[["2021",yr("2021")],["2022",yr("2022")],["2023",yr("2023")],["2024",yr("2024")],
            ["2025",yr("2025")],["2026",["202601","202602","202603","202604","202605","202606","202607","202608"]]];
const D={}; for(const [y,M] of AÑOS) D[y]=cargar(M).filter(MAG);

// ══════════════════ AUDITORÍA — antes de enseñar nada ══════════════════
console.log(`\n  ═══ AUDITORÍA ═══\n`);
let sinCamino=0, caminoAntes=0, askMalo=0, truncadas=0, total=0;
const ultDia={};
for(const [y] of AÑOS) for(const f of D[y]){
  total++;
  if(!f.camino?.length){sinCamino++;continue;}
  if(f.camino[0][0]<=f.dC) caminoAntes++;
  if(!(f.ask>0)||!(f.bid>=0)) askMalo++;
  const r=simular(f,O);
  // ¿salió porque se acabaron los datos, sin llegar ni a los 15 días ni al vencimiento?
  const dias=f.camino.findIndex(c=>c[0]===r.dSal)+1;
  const ultimo=f.camino[f.camino.length-1][0];
  if(r.dSal===ultimo && dias<15 && ultimo!==f.exp) truncadas++;
  ultDia[y]=Math.max(ultDia[y]??0,+f.camino[f.camino.length-1][0]);
}
console.log(`  1. señales totales en los seis años ................ ${total}`);
console.log(`  2. sin camino de precios .......................... ${sinCamino} ${sinCamino?"⚠":"✓"}`);
console.log(`  3. camino que empieza el día de compra o antes .... ${caminoAntes} ${caminoAntes?"⚠ MIRA AL FUTURO":"✓ todo posterior"}`);
console.log(`  4. ask o bid inválido ............................. ${askMalo} ${askMalo?"⚠":"✓"}`);
console.log(`  5. salidas por FALTA DE DATOS (dinero sin realizar) ${truncadas} ${truncadas?"⚠":"✓ ninguna"}`);
console.log(`  6. último día con datos por año: ${AÑOS.map(([y])=>`${y}→${ultDia[y]??"—"}`).join(" · ")}`);

// ══════════════════ EL RESULTADO ══════════════════
console.log(`\n  ═══ LA TABLA MÁGICA EN CRUDO — CUENTA GRANDE (todo lo que capture) ═══\n`);
console.log(`  ${"año".padEnd(6)} ${"señales".padStart(8)} ${"gana".padStart(6)} ${"pierde".padStart(7)} ${"ratio".padStart(7)} ${"dinero".padStart(12)} ${"capital".padStart(12)} ${"%".padStart(6)}`);
let TN=0,TG=0,TP=0;
for(const [y] of AÑOS){
  const r=resumir(D[y],O);
  if(!r){console.log(`  ${y.padEnd(6)} ${"0".padStart(8)}    sin señales`);continue;}
  TN+=r.neto; TG+=r.gana; TP+=r.pierde;
  const cap=D[y].reduce((s,f)=>s+f.ask*100,0);
  console.log(`  ${y.padEnd(6)} ${String(r.n).padStart(8)} ${String(r.gana).padStart(6)} ${String(r.pierde).padStart(7)} ${(r.r===Infinity?"∞":r.r.toFixed(2)).padStart(7)} ${$(r.neto).padStart(12)} ${$(cap).padStart(12)} ${((100*r.neto/cap).toFixed(0)+"%").padStart(6)}`);
}
const TODO=Object.values(D).flat(); const rt=resumir(TODO,O);
console.log(`  ${"─".repeat(70)}`);
console.log(`  ${"TOTAL".padEnd(6)} ${String(rt.n).padStart(8)} ${String(TG).padStart(6)} ${String(TP).padStart(7)} ${rt.r.toFixed(2).padStart(7)} ${$(TN).padStart(12)}`);

console.log(`\n  ═══ TU CUENTA — $60,000 · $15,000 por posición · máximo 4 abiertas ═══\n`);
console.log(`  ${"año".padEnd(6)} ${"ops".padStart(5)} ${"gana".padStart(6)} ${"pierde".padStart(7)} ${"dinero".padStart(12)} ${"% sobre $60,000".padStart(16)}`);
let TC=0;
for(const [y] of AÑOS){
  if(!D[y].length){console.log(`  ${y.padEnd(6)} sin operaciones`);continue;}
  const q=cuenta(D[y],{capital:60000,porOp:15000,maxAbiertas:4,...O});
  TC+=q.ganancia;
  console.log(`  ${y.padEnd(6)} ${String(q.tomadas.length).padStart(5)} ${String(q.gana).padStart(6)} ${String(q.pierde).padStart(7)} ${$(q.ganancia).padStart(12)} ${((100*q.ganancia/60000).toFixed(0)+"%").padStart(16)}`);
}
console.log(`  ${"─".repeat(56)}`);
console.log(`  ${"TOTAL".padEnd(6)} ${"".padStart(5)} ${"".padStart(6)} ${"".padStart(7)} ${$(TC).padStart(12)}`);

console.log(`\n  ═══ MES A MES — ¿cuándo dispara? (cuenta grande) ═══\n`);
for(const [y] of AÑOS){
  if(!D[y].length) continue;
  const meses={};
  for(const f of D[y]){const m=f.dC.slice(4,6); (meses[m]??=[]).push(f);}
  const linea=[...Array(12)].map((_,i)=>{const m=String(i+1).padStart(2,"0"); const L=meses[m];
    if(!L) return "  ·  ";
    const n=resumir(L,O).neto; return `${L.length}${n>=0?"+":"−"}`.padStart(5);}).join("");
  console.log(`  ${y}  ${linea}`);
}
console.log(`  ${"".padEnd(6)}  ${[..."EFMAMJJASOND"].map(c=>c.padStart(5)).join("")}`);
console.log(`\n  (n señales + o − según si el mes gana o pierde · "·" = ningún disparo)\n`);
