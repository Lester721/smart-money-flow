// PENDIENTE DE LESTER — ¿comprar el SPREAD COMPLETO bate a comprar sólo la pata larga?
// Cuando el golpe tiene una pata VENDIDA emparejada (mismo vencimiento, mismo lado, otro strike,
// ±2 segundos, tamaño parecido, ejecutada al bid o por debajo), copiamos las DOS patas.
//   entrar: compras la tuya al ASK, vendes la de ellos al BID  → cuesta ask - bid
//   salir:  vendes la tuya al BID,  recompras la de ellos al ASK
// El peaje va en contra en las CUATRO puntas.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cargar, resumir } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const $=(x)=>(x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
const MAG=(f)=>f.dentro&&f.dte>=5&&f.ask*100>=10000&&f.hora>="14:00"&&f.vsOI>=12;
const yr=(y)=>[...Array(12)].map((_,i)=>y+String(i+1).padStart(2,"0"));
const M=[...yr("2021"),...yr("2022"),...yr("2023"),...yr("2024"),...yr("2025"),
         "202601","202602","202603","202604","202605","202606","202607","202608"];
const cad=abrir("cadenas",{callado:true});
const FDIR=join(CACHE,"flujo-limpio");
const _f=new Map();
function flujo(tk,dia){ const k=tk+dia; if(_f.has(k))return _f.get(k);
  const p=join(FDIR,`${tk}_d${dia}.json`); let v=[];
  try{ if(existsSync(p)) v=JSON.parse(readFileSync(p,"utf8")); }catch{v=[];}
  _f.set(k,v); if(_f.size>400) _f.delete(_f.keys().next().value); return v; }
const CC=new Map();
const chain=(tk,d)=>{const k=tk+d; if(CC.has(k))return CC.get(k);
  let v=null; try{v=cad.leer(tk,d);}catch{} CC.set(k,v); if(CC.size>3000)CC.delete(CC.keys().next().value); return v;};
function pataVendida(f){
  const L=flujo(f.tk,f.dia); if(!L.length) return null;
  const mias=L.filter(o=>o.exp===f.exp&&o.K===f.K&&o.l===f.l&&o.ask>0&&o.precio>=o.ask);
  if(!mias.length) return null;
  const mayor=mias.reduce((a,b)=>b.prima>a.prima?b:a);
  const t=Date.parse(mayor.hora);
  let mejor=null;
  for(const o of L){
    if(o.exp!==f.exp||o.l!==f.l||o.K===f.K) continue;
    if(Math.abs(Date.parse(o.hora)-t)>2000) continue;
    if(!(o.bid>0)||!(o.precio<=o.bid)) continue;
    const rel=Math.abs(o.tam-mayor.tam)/Math.max(o.tam,mayor.tam);
    if(rel>0.20) continue;
    if(!mejor||o.prima>mejor.prima) mejor=o;
  }
  return mejor?mejor.K:null;
}
const T=cargar(M).filter(MAG);
console.log(`\n  ═══ ¿CUÁNTAS SEÑALES TIENEN PATA VENDIDA? ═══\n`);
const CON=[];
for(const f of T){ const K2=pataVendida(f); if(K2!=null) CON.push({...f,K2}); }
console.log(`  ${CON.length} de ${T.length} señales (${(100*CON.length/T.length).toFixed(0)}%)`);
for(const y of ["2021","2022","2023","2024","2025","2026"])
  console.log(`     ${y}: ${String(CON.filter(f=>f.dC.startsWith(y)).length).padStart(3)} de ${String(T.filter(f=>f.dC.startsWith(y)).length).padStart(3)}`);
function vertical(f,salirEnDias=15){
  const c0=chain(f.tk,f.dC); const p2=c0?.[f.exp]?.[`${f.K2}|${f.l}`];
  if(!p2||!(p2[0]>0)) return null;
  const coste=f.ask-p2[0];
  if(!(coste>0)) return null;
  const ds=cad.dias(f.tk); let n=0,ult=null;
  for(const d of ds){
    if(d<=f.dC) continue; if(d>f.exp) break;
    const c=chain(f.tk,d); const a=c?.[f.exp]?.[`${f.K}|${f.l}`], b=c?.[f.exp]?.[`${f.K2}|${f.l}`];
    if(!a||!b) continue;
    n++;
    ult={pl:((a[0]-b[1])-coste)*100,coste:coste*100,dSal:d};
    if(n>=salirEnDias) return ult;
  }
  return ult;
}
console.log(`\n  ═══ EL VERTICAL CONTRA LA PATA SOLA — sólo las señales con pareja ═══\n`);
console.log(`  ${"año".padEnd(6)} ${"n".padStart(4)} ${"SÓLO LA PATA LARGA".padStart(28)} ${"EL VERTICAL ENTERO".padStart(28)}`);
console.log(`  ${"".padEnd(6)} ${"".padStart(4)} ${"gana · ratio ·    dinero".padStart(28)} ${"gana · ratio ·    dinero".padStart(28)}`);
let TA=0,TB=0,NA=0,GA=0,PA=0;
for(const y of ["2021","2022","2023","2024","2025","2026"]){
  const L=CON.filter(f=>f.dC.startsWith(y)); if(!L.length){console.log(`  ${y.padEnd(6)} ${"0".padStart(4)}`);continue;}
  const ra=resumir(L,{objetivo:1.50,suelo:0.50,salirEnDias:15});
  let g=0,p=0,gn=0,n=0;
  for(const f of L){ const v=vertical(f); if(!v)continue; n++; if(v.pl>0){g+=v.pl;gn++;} else p+=-v.pl; }
  TA+=ra.neto; TB+=g-p; NA+=n; GA+=g; PA+=p;
  console.log(`  ${y.padEnd(6)} ${String(L.length).padStart(4)} ${`${ra.gana} · ${(ra.r===Infinity?"∞":ra.r.toFixed(2))} · ${$(ra.neto)}`.padStart(28)} ${`${gn} · ${(p?g/p:Infinity).toFixed(2)} · ${$(g-p)}`.padStart(28)}`);
}
const rt=resumir(CON,{objetivo:1.50,suelo:0.50,salirEnDias:15});
console.log(`  ${"─".repeat(70)}`);
console.log(`  ${"TOTAL".padEnd(6)} ${String(CON.length).padStart(4)} ${`ratio ${rt.r.toFixed(2)} · ${$(TA)}`.padStart(28)} ${`ratio ${(PA?GA/PA:Infinity).toFixed(2)} · ${$(TB)}`.padStart(28)}`);
console.log(`\n  (${NA} de ${CON.length} verticales tienen cotización de las dos patas el día de compra)\n`);
