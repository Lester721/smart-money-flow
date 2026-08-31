// IDEA 5 — OPERAR EL RACIMO EN EL ÍNDICE, NO LOS CONTRATOS.
//
// 72 de las 83 señales de 2026 caben en 15 días. Si lo que vale es el RACIMO —que mucho dinero
// se mueva a la vez— entonces la operación debería ser UNA posición en SPY, no 16 contratos de
// META. Además es la única versión que cabe sin problemas en una cuenta de $60,000.
//
// PRIMERO lo básico: ¿el racimo tiene información direccional? Se mide sobre SPY EN ACCIONES,
// sin peaje de opciones y sin decaimiento, para no confundir la señal con el vehículo.
// El listón NO es cero: es COMPRAR SPY Y ESTARSE QUIETO, que es la alternativa real de Lester.
import { cargar, resumir } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
const $=(x)=>(x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
const MAG=(f)=>f.dentro&&f.dte>=5&&f.ask*100>=10000&&f.hora>="14:00"&&f.vsOI>=12;
const yr=(y)=>[...Array(12)].map((_,i)=>y+String(i+1).padStart(2,"0"));
const AÑOS=[["2021",yr("2021")],["2022",yr("2022")],["2023",yr("2023")],["2024",yr("2024")],
            ["2025",yr("2025")],["2026",["202601","202602","202603","202604","202605","202606","202607","202608"]]];
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

// ── los racimos ──
const TODAS=[]; for(const [y,M] of AÑOS) for(const f of cargar(M).filter(MAG)) TODAS.push(f);
const porDia=new Map();
for(const f of TODAS){ if(!porDia.has(f.dC)) porDia.set(f.dC,[]); porDia.get(f.dC).push(f); }
const dias=[...porDia.keys()].sort();

const dSPY=cad.dias("SPY");
function mov(tk,d,n){ const ds=cad.dias(tk); const i=ds.findIndex(x=>x>=d);
  if(i<0||i+n>=ds.length) return null;
  const a=spotDe(tk,ds[i]), b=spotDe(tk,ds[i+n]); return (a>0&&b>0)?b/a-1:null; }

console.log(`\n  ═══ AUDITORÍA ═══\n`);
console.log(`  señales totales ................. ${TODAS.length}`);
console.log(`  días con al menos una señal ..... ${dias.length}`);
console.log(`  días de bolsa de SPY con dato ... ${dSPY.length}`);
let futuro=0; for(const d of dias){ const i=dSPY.findIndex(x=>x>=d); if(i>=0&&dSPY[i]<d) futuro++; }
console.log(`  entradas antes del día de señal . ${futuro} ${futuro?"⚠":"✓ ninguna"}`);

// ── el listón: comprar SPY y estarse quieto ──
console.log(`\n  ═══ EL LISTÓN — comprar SPY cualquier día y aguantar N días ═══\n`);
const base={};
for(const n of [5,10,15,20]){
  const v=[]; for(let i=0;i+n<dSPY.length;i++){ const m=mov("SPY",dSPY[i],n); if(m!=null) v.push(m); }
  base[n]=v.reduce((a,b)=>a+b,0)/v.length;
  console.log(`  ${n} días: ${v.length} tramos · media ${((100*base[n])>=0?"+":"")+(100*base[n]).toFixed(2)}% · sube el ${(100*v.filter(x=>x>0).length/v.length).toFixed(0)}%`);
}

console.log(`\n  ═══ 1. EL RACIMO EN ACCIONES DE SPY — sin peaje de opciones ═══\n`);
console.log(`  ${"racimo".padEnd(26)} ${"días".padStart(5)} ${"a favor".padStart(9)} ${"5 días".padStart(9)} ${"10 días".padStart(9)} ${"15 días".padStart(9)} ${"20 días".padStart(9)}`);
for(const N of [1,2,3,5,8]){
  const ds=dias.filter(d=>porDia.get(d).length>=N);
  const cel=[5,10,15,20].map(n=>{
    const r=[];
    for(const d of ds){
      const L=porDia.get(d);
      const puts=L.filter(f=>f.l==="P").length, calls=L.length-puts;
      const lado=puts>calls?-1:puts<calls?1:0;      // puts mandan = corto; calls = largo
      if(lado===0) continue;
      const m=mov("SPY",d,n); if(m==null) continue;
      r.push(lado*m);                                // rendimiento de la posición
    }
    if(!r.length) return "—".padStart(9);
    const media=r.reduce((a,b)=>a+b,0)/r.length;
    return (((100*media)>=0?"+":"")+(100*media).toFixed(2)+"%").padStart(9);
  });
  const conLado=ds.filter(d=>{const L=porDia.get(d); const p=L.filter(f=>f.l==="P").length; return p!==L.length-p;});
  console.log(`  ${(N+" o más señales").padEnd(26)} ${String(ds.length).padStart(5)} ${String(conLado.length).padStart(9)} ${cel.join(" ")}`);
}
console.log(`\n  (el listón de estar SIEMPRE largo, para comparar:  ${[5,10,15,20].map(n=>(((100*base[n])>=0?"+":"")+(100*base[n]).toFixed(2)+"%").padStart(9)).join(" ")})`);

console.log(`\n  ═══ 2. ¿Y SI EL RACIMO SÓLO ES DE PUTS? (el caso de 2026) ═══\n`);
console.log(`  ${"racimo".padEnd(26)} ${"días".padStart(5)} ${"5 días".padStart(9)} ${"10 días".padStart(9)} ${"15 días".padStart(9)} ${"20 días".padStart(9)}`);
for(const N of [2,3,5,8]){
  const ds=dias.filter(d=>{const L=porDia.get(d); return L.length>=N && L.every(f=>f.l==="P");});
  const cel=[5,10,15,20].map(n=>{ const r=ds.map(d=>mov("SPY",d,n)).filter(x=>x!=null);
    if(!r.length) return "—".padStart(9);
    const media=r.reduce((a,b)=>a+b,0)/r.length;
    return (((100*-media)>=0?"+":"")+(100*-media).toFixed(2)+"%").padStart(9); });   // corto: signo cambiado
  console.log(`  ${(N+" o más, TODAS puts").padEnd(26)} ${String(ds.length).padStart(5)} ${cel.join(" ")}`);
}
console.log(`\n  ═══ 3. AÑO POR AÑO — racimo de 3 o más, 15 días, en acciones ═══\n`);
console.log(`  ${"año".padEnd(6)} ${"racimos".padStart(8)} ${"a favor".padStart(9)} ${"acierta".padStart(9)} ${"media".padStart(9)} ${"SPY el mismo período".padStart(21)}`);
for(const [y] of AÑOS){
  const ds=dias.filter(d=>d.startsWith(y)&&porDia.get(d).length>=3);
  const r=[],b=[];
  for(const d of ds){ const L=porDia.get(d); const p=L.filter(f=>f.l==="P").length;
    const lado=p>L.length-p?-1:p<L.length-p?1:0; if(lado===0)continue;
    const m=mov("SPY",d,15); if(m==null)continue; r.push(lado*m); b.push(m); }
  if(!r.length){console.log(`  ${y.padEnd(6)} ${String(ds.length).padStart(8)}   sin racimos con lado claro`);continue;}
  const media=r.reduce((a,b)=>a+b,0)/r.length, bm=b.reduce((a,x)=>a+x,0)/b.length;
  console.log(`  ${y.padEnd(6)} ${String(ds.length).padStart(8)} ${String(r.length).padStart(9)} ${((100*r.filter(x=>x>0).length/r.length).toFixed(0)+"%").padStart(9)} ${(((100*media)>=0?"+":"")+(100*media).toFixed(2)+"%").padStart(9)} ${(((100*bm)>=0?"+":"")+(100*bm).toFixed(2)+"%").padStart(21)}`);
}
console.log("");
