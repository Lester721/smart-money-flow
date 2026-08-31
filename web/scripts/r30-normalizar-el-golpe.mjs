// IDEA 3 — NORMALIZAR EL GOLPE POR TICKER Y POR ÉPOCA.
//
// El listón de $500,000 es absoluto: en SPY es rutina, en AMD es una declaración, y $500,000 de
// 2021 no son los de 2026. 2025 disparó 116 veces (61% TSLA) contra 30 en 2024.
//
// ⚠ LÍMITE DEL DATO: flujo-limpio ya viene filtrado a >=$500,000, así que NO existe la
// distribución completa de operaciones. Lo que se mide es la posición del golpe DENTRO de la
// población de golpes grandes de ese mismo ticker en los 90 días anteriores. Se dice y ya está.
//
// Tres normalizadores + el control:
//   (a) percentil del golpe dentro de su ticker, 90 días hacia atrás (sólo pasado)
//   (b) los contratos del golpe contra el interés abierto TOTAL de la cadena de ese ticker
//   (c) CONTROL: subir el listón absoluto a $1M, $2M, $5M. Si el control empata, normalizar no aporta.
import { cargar, resumir, cuenta } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
const O={objetivo:1.50,suelo:0.50,salirEnDias:15};
const $=(x)=>(x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
const MAG=(f)=>f.dentro&&f.dte>=5&&f.ask*100>=10000&&f.hora>="14:00"&&f.vsOI>=12;
const yr=(y)=>[...Array(12)].map((_,i)=>y+String(i+1).padStart(2,"0"));
const AÑOS=[["2021",yr("2021")],["2022",yr("2022")],["2023",yr("2023")],["2024",yr("2024")],
            ["2025",yr("2025")],["2026",["202601","202602","202603","202604","202605","202606","202607","202608"]]];
const cad=abrir("cadenas",{callado:true});
const oiA=abrir("oi-ancho",{callado:true});
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

// ── universo: TODOS los golpes >=$500k, sin filtro de la tabla mágica ──
const POB=new Map();                     // ticker -> [{dia, prima}] ordenado por día
const D={};
for(const [y,M] of AÑOS){
  const todos=cargar(M);
  for(const f of todos){ if(!POB.has(f.tk)) POB.set(f.tk,[]); POB.get(f.tk).push({d:f.dia,p:f.prima}); }
  D[y]=todos.filter(MAG);
}
for(const v of POB.values()) v.sort((a,b)=>a.d.localeCompare(b.d));
console.log(`\n  ═══ EL UNIVERSO DE GOLPES GRANDES (>= $500,000) ═══\n`);
console.log(`  ${"tk".padEnd(6)} ${"golpes".padStart(8)} ${"mediano".padStart(11)} ${"el 10% mayor desde".padStart(19)}`);
const med=(v)=>v.length?v.slice().sort((a,b)=>a-b)[Math.floor(v.length/2)]:null;
for(const [tk,v] of [...POB].sort((a,b)=>b[1].length-a[1].length)){
  const ps=v.map(x=>x.p).sort((a,b)=>a-b);
  console.log(`  ${tk.padEnd(6)} ${String(v.length).padStart(8)} ${$(med(ps)).padStart(11)} ${$(ps[Math.floor(ps.length*0.9)]).padStart(19)}`);
}

// ── (a) percentil dentro del ticker, 90 días hacia atrás ──
function pctTicker(f){
  const v=POB.get(f.tk); if(!v) return null;
  const desde=new Date(ms(f.dia)-90*86400000).toISOString().slice(0,10).replace(/-/g,"");
  const prev=[]; for(const x of v){ if(x.d>=f.dia) break; if(x.d>=desde) prev.push(x.p); }
  if(prev.length<20) return null;                       // muestra mínima para un percentil
  return prev.filter(p=>p<f.prima).length/prev.length;
}
// ── (b) contra el interés abierto total de la cadena ──
const OIT=new Map();
function oiTotal(tk,d){ const k=tk+d; if(OIT.has(k))return OIT.get(k);
  const o=oiA.leer(tk,d); let s=0;
  if(o) for(const e of Object.keys(o)) for(const c of Object.keys(o[e])) s+=o[e][c]||0;
  OIT.set(k,s||null); if(OIT.size>3000) OIT.delete(OIT.keys().next().value); return s||null; }

let sinPct=0,total=0,futuro=0;
for(const [y] of AÑOS) for(const f of D[y]){
  total++;
  f.pctTk=pctTicker(f); if(f.pctTk==null) sinPct++;
  const ds=cad.dias(f.tk); const i=ds.indexOf(f.dC);
  const dOI=ds[i-2]??ds[i-1];
  if(dOI&&dOI>=f.dC) futuro++;
  const t=dOI?oiTotal(f.tk,dOI):null;
  f.vsCadena=t?f.tam/t:null;
  // la media, para poder combinar con la mejor versión de la cuenta grande
  if(i>=50){ const prev=ds.slice(i-50,i).map(d=>spotDe(f.tk,d)).filter(x=>x!=null);
    f.sm=prev.length<40?null:f.spot/(prev.reduce((a,b)=>a+b,0)/prev.length)-1; } else f.sm=null;
}
console.log(`\n  ═══ AUDITORÍA ═══\n`);
console.log(`  señales ..................................... ${total}`);
console.log(`  con percentil de ticker calculable .......... ${total-sinPct} (${sinPct} sin muestra de 20 golpes previos)`);
console.log(`  con interés abierto de la cadena ............ ${Object.values(D).flat().filter(f=>f.vsCadena!=null).length}`);
console.log(`  días de OI posteriores al día de compra ..... ${futuro} ${futuro?"⚠":"✓ ninguno"}`);
const mm=Object.values(D).flat().filter(f=>f.vsCadena!=null).map(f=>f.vsCadena);
console.log(`  el golpe es, de mediana, el ${(100*med(mm)).toFixed(3)}% del interés abierto de toda la cadena`);

const _vs=Object.values(D).flat().map(f=>f.vsCadena).filter(x=>x!=null).sort((a,b)=>a-b);
const CORTE={0.75:_vs[Math.floor(_vs.length*0.75)],0.90:_vs[Math.floor(_vs.length*0.90)],0.95:_vs[Math.floor(_vs.length*0.95)]};
console.log(`  cortes del golpe contra la cadena: top25%=${(100*CORTE[0.75]).toFixed(4)}% · top10%=${(100*CORTE[0.90]).toFixed(4)}% · top5%=${(100*CORTE[0.95]).toFixed(4)}%`);
const T50=(f)=>f.prof<=0.50, MED=(f)=>f.sm!=null&&f.sm<0;
const VERS=[
  ["la regla actual ($500k a secas)",()=>true],
  ["(a) top 25% de su ticker",f=>f.pctTk!=null&&f.pctTk>=0.75],
  ["(a) top 10% de su ticker",f=>f.pctTk!=null&&f.pctTk>=0.90],
  ["(a) top 5% de su ticker",f=>f.pctTk!=null&&f.pctTk>=0.95],
  ["(b) top 25% contra su cadena",f=>f.vsCadena!=null&&f.vsCadena>=CORTE[0.75]],
  ["(b) top 10% contra su cadena",f=>f.vsCadena!=null&&f.vsCadena>=CORTE[0.90]],
  ["(b) top 5% contra su cadena",f=>f.vsCadena!=null&&f.vsCadena>=CORTE[0.95]],
  ["(c) CONTROL: golpe ≥ $1M",f=>f.prima>=1e6],
  ["(c) CONTROL: golpe ≥ $2M",f=>f.prima>=2e6],
  ["(c) CONTROL: golpe ≥ $5M",f=>f.prima>=5e6],
];
function parrilla(t,pre,conCuenta){
  console.log(`\n  ═══ ${t} ═══\n`);
  console.log(`  ${"".padEnd(33)} ${AÑOS.map(([y])=>y.padStart(12)).join("")} ${"TOTAL".padStart(13)} ${"n".padStart(5)} ${"ratio".padStart(7)} ${"años+".padStart(6)}`);
  for(const [nom,fl] of VERS){
    let tot=0,gan=0; const cel=[],acum=[];
    for(const [y] of AÑOS){
      const L=D[y].filter(f=>pre(f)&&fl(f)); if(!L.length){cel.push("—".padStart(12));continue;}
      acum.push(...L);
      const v=conCuenta?cuenta(L,{capital:60000,porOp:15000,maxAbiertas:4,...O}).ganancia:resumir(L,O).neto;
      tot+=v; if(v>0)gan++; cel.push($(v).padStart(12));
    }
    const rt=acum.length?resumir(acum,O):null;
    console.log(`  ${nom.padEnd(33)} ${cel.join("")} ${$(tot).padStart(13)} ${String(acum.length).padStart(5)} ${(rt?(rt.r===Infinity?"∞":rt.r.toFixed(2)):"—").padStart(7)} ${(gan+"/6").padStart(6)}`);
  }
}
parrilla("CUENTA GRANDE — en crudo",()=>true,false);
parrilla("CUENTA GRANDE — sobre techo 50% + media (tu mejor versión)",(f)=>T50(f)&&MED(f),false);
parrilla("TU CUENTA ($60,000) — en crudo (tu mejor versión)",()=>true,true);
console.log("");
