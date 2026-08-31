// DOS PENDIENTES: el TAMAÑO de la posición y el INVERSO.
//
// TAMAÑO: todo lo medido usa $15,000 por posición sobre $60,000 = 25% del capital por apuesta y
// el 100% desplegado con cuatro abiertas. Aquí se escala la cuenta y se arriesga un % fijo.
// UNA SOLA CUENTA, seis años seguidos, sin reponer nada.
//
// INVERSO: en seis años el ratio en crudo es 0.58 — el lado perdedor domina. ¿Se puede cobrar
// vendiendo en vez de comprando? OJO: el peaje va EN CONTRA en las dos direcciones —
//   comprar = pagas el ASK, cobras el BID   ·   vender = cobras el BID, pagas el ASK
import { cargar, resumir, cuenta, simular } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
const $=(x)=>(x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
const MAG=(f)=>f.dentro&&f.dte>=5&&f.ask*100>=10000&&f.hora>="14:00"&&f.vsOI>=12;
const yr=(y)=>[...Array(12)].map((_,i)=>y+String(i+1).padStart(2,"0"));
const M=[...yr("2021"),...yr("2022"),...yr("2023"),...yr("2024"),...yr("2025"),
         "202601","202602","202603","202604","202605","202606","202607","202608"];
const cad=abrir("cadenas",{callado:true});
const ms=(d)=>Date.parse(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T00:00:00Z`);
const dteDe=(a,b)=>Math.round((ms(b)-ms(a))/86400000);
function spotOk(c,hoy){let e0=null,md=Infinity;
  for(const e of Object.keys(c)){const d=dteDe(hoy,e); if(d<1)continue; if(d<md){md=d;e0=e;}}
  if(!e0)return null; const g=c[e0]; let K=null,dm=Infinity;
  for(const cl of Object.keys(g)){ if(cl.slice(-1)!=="C")continue;
    const k=Number(cl.slice(0,-2)); const p=g[`${k}|P`]; if(!p)continue;
    const d=Math.abs((g[cl][0]+g[cl][1])/2-(p[0]+p[1])/2); if(d<dm){dm=d;K=k;}}
  if(K==null)return null; const C=g[`${K}|C`],P=g[`${K}|P`];
  const s=K+(C[0]+C[1])/2-(P[0]+P[1])/2; return s>0?s:null;}
const SM=new Map();
const spotDe=(tk,d)=>{const k=tk+d; if(SM.has(k))return SM.get(k);
  const c=cad.leer(tk,d); const s=c?spotOk(c,d):null; SM.set(k,s); return s;};
const O15={objetivo:1.50,suelo:0.50,salirEnDias:15}, O0={objetivo:1.50,suelo:0.50};
function salir8(f){ const coste=f.ask; let n=0,ult=null;
  for(const [d,bid] of f.camino){ n++; const m=bid/coste; ult={mult:m,dSal:d};
    if(m>=1.50) return {mult:1.50,dSal:d}; if(m<=0.50) return {mult:0.50,dSal:d};
    const s=spotDe(f.tk,d);
    if(s!=null){ const mov=f.l==="P"?(f.spot-s)/f.spot:(s-f.spot)/f.spot; if(mov>=0.08) return {mult:m,dSal:d}; }
    if(n>=60) return {mult:m,dSal:d}; }
  return ult; }
const con8=(L)=>L.map(f=>{const r=salir8(f); return {...f,camino:[[r.dSal,r.mult*f.ask,r.mult*f.ask]]};});

const T=cargar(M).filter(MAG);
for(const f of T){ const ds=cad.dias(f.tk); const i=ds.indexOf(f.dC);
  if(i<50){f.sm=null;continue;}
  const prev=ds.slice(i-50,i).map(d=>spotDe(f.tk,d)).filter(x=>x!=null);
  f.sm=prev.length<40?null:f.spot/(prev.reduce((a,b)=>a+b,0)/prev.length)-1; }
const T50=(f)=>f.prof<=0.50, MED=(f)=>f.sm!=null&&f.sm<0;
const GRANDE=con8(T.filter(f=>T50(f)&&MED(f)));
const CRUDO=T.slice();
console.log(`\n  ═══ AUDITORÍA ═══\n`);
console.log(`  señales ................ ${T.length}`);
console.log(`  contrato mediano cuesta  ${$(T.map(f=>f.ask*100).sort((a,b)=>a-b)[Math.floor(T.length/2)])}`);
console.log(`  el más caro ............ ${$(Math.max(...T.map(f=>f.ask*100)))}`);

console.log(`\n  ═══ 1. EL TAMAÑO — una sola cuenta, seis años, ${"%"} fijo por posición ═══\n`);
for(const [nom,L,op] of [["EN CRUDO · 15 días",CRUDO,O15],["FILTRADA (techo 50% + media) · salida 8%",GRANDE,O0]]){
  console.log(`  ── ${nom} ──`);
  console.log(`  ${"capital".padStart(10)} ${"por op".padStart(9)} ${"% ".padStart(5)} ${"abiertas".padStart(9)} ${"acaba con".padStart(12)} ${"al año".padStart(8)} ${"ops".padStart(5)} ${"caja mín".padStart(11)}`);
  for(const cap of [60000,150000,300000,600000,1000000]){
    for(const pct of [0.05,0.10,0.25]){
      const q=cuenta(L,{capital:cap,porOp:cap*pct,maxAbiertas:Math.round(0.9/pct),...op});
      const an=100*(Math.pow(Math.max(q.final,1)/cap,1/5.6)-1);
      console.log(`  ${$(cap).padStart(10)} ${$(cap*pct).padStart(9)} ${((100*pct).toFixed(0)+"%").padStart(5)} ${String(Math.round(0.9/pct)).padStart(9)} ${$(q.final).padStart(12)} ${(an.toFixed(1)+"%").padStart(8)} ${String(q.tomadas.length).padStart(5)} ${$(q.minCaja).padStart(11)}`);
    }
  }
  console.log("");
}
console.log(`  (el listón, mismos seis años: SPY hace +14.0% al año)\n`);

console.log(`  ═══ 2. EL INVERSO — vender en vez de comprar, con el peaje en contra ═══\n`);
function corto(f,{salirEnDias=15}={}){
  const entra=f.bid;                        // vendes: cobras el BID
  let n=0,ult=null;
  for(const [d,bid,ask] of f.camino){
    n++; ult={pl:(entra-ask)*100,dSal:d};   // recompras: pagas el ASK
    if(n>=salirEnDias) return {pl:(entra-ask)*100,dSal:d};
  }
  return ult;
}
console.log(`  ${"".padEnd(30)} ${"n".padStart(5)} ${"gana".padStart(6)} ${"pierde".padStart(7)} ${"ratio".padStart(7)} ${"dinero".padStart(13)}`);
for(const [nom,L] of [["COMPRAR (la regla actual)",CRUDO],["VENDER (el inverso)",CRUDO]]){
  if(nom.startsWith("COMPRAR")){
    const r=resumir(L,O15);
    console.log(`  ${nom.padEnd(30)} ${String(r.n).padStart(5)} ${String(r.gana).padStart(6)} ${String(r.pierde).padStart(7)} ${r.r.toFixed(2).padStart(7)} ${$(r.neto).padStart(13)}`);
  } else {
    let g=0,p=0,gn=0,pn=0;
    for(const f of L){ const c=corto(f); if(c.pl>0){g+=c.pl;gn++;} else {p+=-c.pl;pn++;} }
    console.log(`  ${nom.padEnd(30)} ${String(L.length).padStart(5)} ${String(gn).padStart(6)} ${String(pn).padStart(7)} ${(p?g/p:Infinity).toFixed(2).padStart(7)} ${$(g-p).padStart(13)}`);
  }
}
console.log(`\n  año por año, el inverso:`);
console.log(`  ${"año".padEnd(6)} ${"n".padStart(5)} ${"gana".padStart(6)} ${"ratio".padStart(7)} ${"dinero".padStart(13)}`);
for(const y of ["2021","2022","2023","2024","2025","2026"]){
  const L=CRUDO.filter(f=>f.dC.startsWith(y)); if(!L.length)continue;
  let g=0,p=0,gn=0;
  for(const f of L){ const c=corto(f); if(c.pl>0){g+=c.pl;gn++;} else p+=-c.pl; }
  console.log(`  ${y.padEnd(6)} ${String(L.length).padStart(5)} ${String(gn).padStart(6)} ${(p?g/p:Infinity).toFixed(2).padStart(7)} ${$(g-p).padStart(13)}`);
}
console.log("");
