// ¿SE PUEDE SEGUIR AL DINERO GRANDE CON ACCIONES, SIN TOCAR UNA OPCIÓN?
//
// Lester, el 2026-08-26: si la ventaja de seguir el print vale 0,3% y la opción cuesta 3%, la
// única salida es un vehículo sin peaje. Las acciones no tienen horquilla que valga.
//
// ⚠ OJO CON LA TRADUCCIÓN: el +0,3% de [[seguir-el-print-vale-03]] se midió como «el contrato
// impreso rinde más que un contrato vecino». Eso es información sobre QUÉ CONTRATO, no sobre
// hacia dónde va la acción. Aquí se pregunta otra cosa: cuando alguien imprime $500,000 en puts
// de TSLA, ¿TSLA baja MÁS DE LO NORMAL en los días siguientes?
//
// EL CONTROL NO ES CERO: es la deriva propia de ese ticker en el mismo período. TSLA sube sola,
// así que una señal bajista tiene que batir esa subida para valer algo.
//
// Sin peaje de opciones, sin decaimiento, sin vencimiento. Si la señal tiene dirección, aquí se ve.
import { cargar } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
const $=(x)=>(x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
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
function mov(tk,d,n){ const ds=cad.dias(tk); const i=ds.indexOf(d);
  if(i<0||i+n>=ds.length) return null;
  const a=spotDe(tk,ds[i]), b=spotDe(tk,ds[i+n]); return (a>0&&b>0)?b/a-1:null; }
const HOR=[1,3,5,10,15,20];
const med=(v)=>v.length?v.slice().sort((a,b)=>a-b)[Math.floor(v.length/2)]:null;
const mediaDe=(v)=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
const t_de=(v)=>{ if(v.length<3)return null; const m=mediaDe(v);
  const s=Math.sqrt(v.reduce((a,x)=>a+(x-m)*(x-m),0)/(v.length-1)); return s?m/(s/Math.sqrt(v.length)):null; };

// ── 1. EL LISTÓN: la deriva propia de cada ticker ──
console.log(`\n  ═══ EL LISTÓN — lo que hace cada acción POR SÍ SOLA en N días ═══\n`);
const TK=cad.tickers().filter(t=>cad.dias(t).some(d=>d>="20210101"));
const BASE={};
console.log(`  ${"tk".padEnd(6)} ${"días".padStart(6)} ${HOR.map(n=>(n+"d").padStart(9)).join("")}`);
for(const tk of TK){
  const ds=cad.dias(tk).filter(d=>d>="20210101"&&d<="20260819");
  if(ds.length<100) continue;
  BASE[tk]={};
  const cel=HOR.map(n=>{ const v=[]; for(let i=0;i+n<ds.length;i+=3){const m=mov(tk,ds[i],n); if(m!=null)v.push(m);}
    BASE[tk][n]=mediaDe(v); return (((100*BASE[tk][n])>=0?"+":"")+(100*BASE[tk][n]).toFixed(2)+"%").padStart(9); });
  console.log(`  ${tk.padEnd(6)} ${String(ds.length).padStart(6)} ${cel.join("")}`);
}

// ── 2. LAS SEÑALES: un golpe por ticker + día + lado ──
const SIG=new Map();
for(const [y,M] of AÑOS) for(const f of cargar(M)){
  const k=`${f.tk}|${f.dC}|${f.l}`;
  const x=SIG.get(k);
  if(x){ x.prima+=f.prima; x.n++; if(f.vsOI>=12) x.doce=true; if(f.dentro) x.dentro=true; }
  else SIG.set(k,{tk:f.tk,dC:f.dC,l:f.l,y,prima:f.prima,n:1,doce:f.vsOI>=12,dentro:!!f.dentro});
}
const S=[...SIG.values()];
console.log(`\n  ═══ AUDITORÍA ═══\n`);
console.log(`  golpes agrupados por ticker + día + lado ... ${S.length}`);
console.log(`  de los cuales pasan el 12x ................ ${S.filter(x=>x.doce).length}`);
console.log(`  puts ${S.filter(x=>x.l==="P").length}  ·  calls ${S.filter(x=>x.l==="C").length}`);
let sinBase=0; for(const x of S) if(!BASE[x.tk]) sinBase++;
console.log(`  sin listón de su ticker ................... ${sinBase} ${sinBase?"⚠":"✓ ninguno"}`);

/** Rendimiento de la posición en ACCIONES, menos la deriva propia del ticker. */
function ventaja(L,n){
  const v=[];
  for(const x of L){
    if(!BASE[x.tk]) continue;
    const m=mov(x.tk,x.dC,n); if(m==null) continue;
    const lado=x.l==="P"?-1:1;                       // put = corto, call = largo
    v.push(lado*m - lado*BASE[x.tk][n]);             // menos lo que hace la acción sola
  }
  return v;
}
function tabla(titulo,grupos){
  console.log(`\n  ═══ ${titulo} ═══\n`);
  console.log(`  ${"".padEnd(26)} ${"n".padStart(6)} ${HOR.map(x=>(x+" días").padStart(14)).join("")}`);
  for(const [nom,L] of grupos){
    if(!L.length){console.log(`  ${nom.padEnd(26)} ${"0".padStart(6)}`);continue;}
    const cel=HOR.map(n=>{ const v=ventaja(L,n); if(v.length<10) return "—".padStart(14);
      const m=mediaDe(v), t=t_de(v);
      return `${((100*m)>=0?"+":"")+(100*m).toFixed(2)}% t=${t.toFixed(1)}`.padStart(14); });
    console.log(`  ${nom.padEnd(26)} ${String(ventaja(L,5).length).padStart(6)} ${cel.join("")}`);
  }
}
tabla("VENTAJA SOBRE LA DERIVA DEL PROPIO TICKER — todos los golpes",[
  ["todos los golpes",S],
  ["sólo puts",S.filter(x=>x.l==="P")],
  ["sólo calls",S.filter(x=>x.l==="C")],
  ["que pasan el 12x",S.filter(x=>x.doce)],
  ["12x + dentro del dinero",S.filter(x=>x.doce&&x.dentro)],
  ["golpe ≥ $2M",S.filter(x=>x.prima>=2e6)],
  ["3 o más contratos a la vez",S.filter(x=>x.n>=3)],
]);
tabla("AÑO POR AÑO — todos los golpes",AÑOS.map(([y])=>[y,S.filter(x=>x.y===y)]));
tabla("TICKER POR TICKER — todos los golpes",TK.map(tk=>[tk,S.filter(x=>x.tk===tk)]));
console.log(`\n  Un t por encima de 2 dice que la diferencia no es casualidad.`);
console.log(`  Recuerda: aquí NO hay peaje de opciones. Si la señal tiene dirección, se ve aquí.\n`);
