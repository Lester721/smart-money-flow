// SEGUIR EL PRINT CON ACCIONES — versión limpia.
// El primer intento tenía el listón roto: META daba +5,71% de deriva DIARIA y GE +1,82%, porque
// los splits (NVDA 4:1 y 10:1, TSLA 3:1) y tres días de spot basura de META entraban en la media.
// Aquí se DESCARTA cualquier tramo que contenga un salto de más del 25% en un solo día.
import { cargar } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
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
/** Movimiento de n días. NULL si dentro del tramo hay un salto de más del 25% (split o dato malo). */
function mov(tk,d,n){
  const ds=cad.dias(tk); const i=ds.indexOf(d); if(i<0||i+n>=ds.length) return null;
  let prev=spotDe(tk,ds[i]); if(!(prev>0)) return null;
  const a=prev;
  for(let k=i+1;k<=i+n;k++){ const s=spotDe(tk,ds[k]); if(!(s>0)) return null;
    if(Math.abs(s/prev-1)>0.25) return null;                 // ⬅ salto: se tira el tramo entero
    prev=s; }
  return prev/a-1;
}
const HOR=[1,3,5,10,15,20];
const mediaDe=(v)=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
const t_de=(v)=>{ if(v.length<3)return null; const m=mediaDe(v);
  const s=Math.sqrt(v.reduce((a,x)=>a+(x-m)*(x-m),0)/(v.length-1)); return s?m/(s/Math.sqrt(v.length)):null; };
const TK=["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY","TSLA"];
console.log(`\n  ═══ EL LISTÓN, YA LIMPIO — deriva propia de cada acción ═══\n`);
const BASE={};
console.log(`  ${"tk".padEnd(6)} ${"tramos".padStart(7)} ${"tirados".padStart(8)} ${HOR.map(n=>(n+"d").padStart(9)).join("")}`);
for(const tk of TK){
  const ds=cad.dias(tk).filter(d=>d>="20210101"&&d<="20260819");
  BASE[tk]={}; let tirados=0, usados=0;
  const cel=HOR.map(n=>{ const v=[];
    for(let i=0;i+n<ds.length;i+=3){ const m=mov(tk,ds[i],n); if(m==null){if(n===5)tirados++;} else {v.push(m); if(n===5)usados++;} }
    BASE[tk][n]=mediaDe(v);
    return (((100*BASE[tk][n])>=0?"+":"")+(100*BASE[tk][n]).toFixed(2)+"%").padStart(9); });
  console.log(`  ${tk.padEnd(6)} ${String(usados).padStart(7)} ${String(tirados).padStart(8)} ${cel.join("")}`);
}
// señales: un golpe por ticker + día + lado
const SIG=new Map();
for(const [y,M] of AÑOS) for(const f of cargar(M)){
  const k=`${f.tk}|${f.dC}|${f.l}`; const x=SIG.get(k);
  if(x){ x.prima+=f.prima; x.n++; if(f.vsOI>=12) x.doce=true; if(f.dentro) x.dentro=true; }
  else SIG.set(k,{tk:f.tk,dC:f.dC,l:f.l,y,prima:f.prima,n:1,doce:f.vsOI>=12,dentro:!!f.dentro});
}
const S=[...SIG.values()].filter(x=>BASE[x.tk]);
console.log(`\n  ═══ AUDITORÍA ═══\n`);
console.log(`  golpes agrupados por ticker + día + lado ... ${S.length}`);
console.log(`  de los cuales pasan el 12x ................ ${S.filter(x=>x.doce).length}`);
console.log(`  puts ${S.filter(x=>x.l==="P").length}  ·  calls ${S.filter(x=>x.l==="C").length}`);
console.log(`  ¿algún listón absurdo (>1% al día)? ....... ${TK.filter(t=>Math.abs(BASE[t][1])>0.01).join(" ")||"NO ✓"}`);
function ventaja(L,n){ const v=[];
  for(const x of L){ const m=mov(x.tk,x.dC,n); if(m==null) continue;
    const lado=x.l==="P"?-1:1;
    v.push(lado*(m-BASE[x.tk][n])); }
  return v; }
function tabla(titulo,grupos){
  console.log(`\n  ═══ ${titulo} ═══\n`);
  console.log(`  ${"".padEnd(26)} ${"n".padStart(6)} ${HOR.map(x=>(x+" días").padStart(15)).join("")}`);
  for(const [nom,L] of grupos){
    if(!L.length){console.log(`  ${nom.padEnd(26)} ${"0".padStart(6)}`);continue;}
    const cel=HOR.map(n=>{ const v=ventaja(L,n); if(v.length<20) return "—".padStart(15);
      const m=mediaDe(v), t=t_de(v);
      return `${((100*m)>=0?"+":"")+(100*m).toFixed(2)}%  t=${t.toFixed(1)}`.padStart(15); });
    console.log(`  ${nom.padEnd(26)} ${String(ventaja(L,5).length).padStart(6)} ${cel.join("")}`);
  }
}
tabla("VENTAJA SOBRE LA DERIVA DEL PROPIO TICKER",[
  ["todos los golpes",S],
  ["sólo puts",S.filter(x=>x.l==="P")],
  ["sólo calls",S.filter(x=>x.l==="C")],
  ["que pasan el 12x",S.filter(x=>x.doce)],
  ["12x + dentro del dinero",S.filter(x=>x.doce&&x.dentro)],
  ["golpe ≥ $2M",S.filter(x=>x.prima>=2e6)],
]);
tabla("AÑO POR AÑO",AÑOS.map(([y])=>[y,S.filter(x=>x.y===y)]));
tabla("TICKER POR TICKER",TK.map(tk=>[tk,S.filter(x=>x.tk===tk)]));
console.log(`\n  Un t por encima de 2 dice que no es casualidad. Aquí NO hay peaje de opciones.\n`);
