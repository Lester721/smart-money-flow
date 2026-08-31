// IDEA 1 — COMPRAR FUERA DEL DINERO EN VEZ DEL CONTRATO QUE COMPRÓ EL GRANDE.
//
// La tabla mágica exige DENTRO del dinero, y medimos que eso da la peor asimetría posible:
// al 150% de profundidad se gana +3% acertando y se pierde −11% fallando. Lester busca lo
// contrario: muchas pérdidas pequeñas y algún pelotazo.
//
// AQUÍ: misma señal exacta (golpe >$500k al ask, 12x el OI de la víspera, DENTRO del dinero,
// contrato de ellos >=$10,000, >=5 días, después de las 14:00). Lo único que cambia es QUÉ
// COMPRAMOS NOSOTROS: el mismo vencimiento, mismo lado, pero un strike fuera del dinero.
//
// ⚠ LA HORQUILLA: fuera del dinero el peaje es un % mucho mayor de la prima. Se mide y se enseña.
// Compra al ask, venta al bid, como siempre.
import { readFileSync } from "node:fs";
import { cargar, simular, resumir, cuenta } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
const O={objetivo:1.50,suelo:0.50,salirEnDias:15};
const $=(x)=>(x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
const MAG=(f)=>f.dentro&&f.dte>=5&&f.ask*100>=10000&&f.hora>="14:00"&&f.vsOI>=12;
const yr=(y)=>[...Array(12)].map((_,i)=>y+String(i+1).padStart(2,"0"));
const AÑOS=[["2021",yr("2021")],["2022",yr("2022")],["2023",yr("2023")],["2024",yr("2024")],
            ["2025",yr("2025")],["2026",["202601","202602","202603","202604","202605","202606","202607","202608"]]];
const cad=abrir("cadenas",{callado:true});
const ms=(d)=>Date.parse(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T00:00:00Z`);
const dteDe=(a,b)=>Math.round((ms(b)-ms(a))/86400000);
// caché acotada de cadenas — se leen muchas veces las mismas
const CC=new Map();
function chain(tk,d){const k=tk+d; if(CC.has(k))return CC.get(k);
  let v=null; try{v=cad.leer(tk,d);}catch{v=null;}
  CC.set(k,v); if(CC.size>4000) CC.delete(CC.keys().next().value); return v;}
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
  const c=chain(tk,d); const s=c?spotOk(c,d):null; SM.set(k,s); return s;};

/** Construye la fila de compra de OTRO strike del mismo vencimiento y lado. */
function filaEn(f,pctFuera){
  const ch=chain(f.tk,f.dC); if(!ch?.[f.exp]) return null;
  // fuera del dinero: para una CALL, strike por ENCIMA del spot; para una PUT, por DEBAJO
  const objetivo=f.spot*(1+(f.l==="C"?pctFuera:-pctFuera));
  let K=null,dm=Infinity;
  for(const cl of Object.keys(ch[f.exp])){
    if(cl.slice(-1)!==f.l) continue;
    const k=Number(cl.slice(0,-2));
    // exigir que esté DE VERDAD fuera del dinero (o al dinero si pctFuera===0)
    if(pctFuera>0 && (f.l==="C"?k<=f.spot:k>=f.spot)) continue;
    const d=Math.abs(k-objetivo); if(d<dm){dm=d;K=k;}
  }
  if(K==null) return null;
  const p0=ch[f.exp][`${K}|${f.l}`];
  if(!p0||!(p0[1]>0)||!(p0[0]>0)) return null;      // hace falta bid Y ask reales
  const ds=cad.dias(f.tk); const camino=[];
  for(const d of ds){ if(d<=f.dC) continue; if(d>f.exp) break;
    const p=chain(f.tk,d)?.[f.exp]?.[`${K}|${f.l}`]; if(!p) continue;
    camino.push([d,p[0],p[1]]); }
  if(!camino.length) return null;
  return { ...f, K, ask:p0[1], bid:p0[0], camino,
           horqNuestra:(p0[1]-p0[0])/((p0[1]+p0[0])/2),
           profNuestra:(f.l==="C"?(f.spot-K)/f.spot:(K-f.spot)/f.spot) };
}

// ── cargar señales y calcular la media de 50 días ──
const D={}; let n=0;
for(const [y,M] of AÑOS){ D[y]=cargar(M).filter(MAG);
  for(const f of D[y]){ n++;
    const ds=cad.dias(f.tk); const i=ds.indexOf(f.dC);
    if(i<50){f.sm=null;continue;}
    const prev=ds.slice(i-50,i).map(d=>spotDe(f.tk,d)).filter(x=>x!=null);
    f.sm=prev.length<40?null:f.spot/(prev.reduce((a,b)=>a+b,0)/prev.length)-1; }}

const VERS=[[null,"su contrato (la regla actual)"],[0,"al dinero (ATM)"],
            [0.05,"5% fuera"],[0.10,"10% fuera"],[0.15,"15% fuera"],[0.25,"25% fuera"]];
// construir todas las versiones una vez
const B={};
for(const [pct,nom] of VERS){
  B[nom]={}; 
  for(const [y] of AÑOS) B[nom][y]=D[y].map(f=>pct==null?f:filaEn(f,pct)).filter(Boolean);
}
console.log(`\n  ═══ AUDITORÍA ═══\n`);
console.log(`  señales de la tabla mágica ............ ${n}`);
for(const [,nom] of VERS){
  const t=Object.values(B[nom]).reduce((s,v)=>s+v.length,0);
  console.log(`  ${nom.padEnd(30)} ${String(t).padStart(4)} con bid y ask reales ${t<n?`(${n-t} sin cotización)`:"✓ todas"}`);
}
let futuro=0;
for(const [,nom] of VERS) for(const [y] of AÑOS) for(const f of B[nom][y]) if(f.camino[0][0]<=f.dC) futuro++;
console.log(`  caminos que empiezan el día de compra o antes: ${futuro} ${futuro?"⚠":"✓ ninguno"}`);

const med=(v)=>v.length?v.slice().sort((a,b)=>a-b)[Math.floor(v.length/2)]:null;
console.log(`\n  ═══ EL PEAJE — cuánto pesa la horquilla en cada versión ═══\n`);
console.log(`  ${"qué compramos".padEnd(30)} ${"cuesta".padStart(10)} ${"horquilla".padStart(11)} ${"profundidad".padStart(12)}`);
for(const [pct,nom] of VERS){
  const L=Object.values(B[nom]).flat(); if(!L.length)continue;
  const h=pct==null?med(L.map(f=>f.horq).filter(x=>x!=null)):med(L.map(f=>f.horqNuestra));
  const pr=pct==null?med(L.map(f=>f.prof)):med(L.map(f=>f.profNuestra));
  console.log(`  ${nom.padEnd(30)} ${$(med(L.map(f=>f.ask*100))).padStart(10)} ${((100*h).toFixed(1)+"%").padStart(11)} ${((100*pr).toFixed(0)+"%").padStart(12)}`);
}

function parrilla(titulo,filtro,conCuenta){
  console.log(`\n  ═══ ${titulo} ═══\n`);
  console.log(`  ${"qué compramos".padEnd(30)} ${AÑOS.map(([y])=>y.padStart(12)).join("")} ${"TOTAL".padStart(13)} ${"ratio".padStart(7)}`);
  for(const [,nom] of VERS){
    let tot=0; const cel=[]; const acum=[];
    for(const [y] of AÑOS){
      const L=B[nom][y].filter(filtro);
      if(!L.length){cel.push("—".padStart(12));continue;}
      acum.push(...L);
      const v=conCuenta?cuenta(L,{capital:60000,porOp:15000,maxAbiertas:4,...O}).ganancia:resumir(L,O).neto;
      tot+=v; cel.push($(v).padStart(12));
    }
    const rt=acum.length?resumir(acum,O):null;
    console.log(`  ${nom.padEnd(30)} ${cel.join("")} ${$(tot).padStart(13)} ${(rt?(rt.r===Infinity?"∞":rt.r.toFixed(2)):"—").padStart(7)}`);
  }
}
const T50=(f)=>f.prof<=0.50, MED=(f)=>f.sm!=null&&f.sm<0;
parrilla("CUENTA GRANDE — con su mejor versión: techo 50% + bajo la media",(f)=>T50(f)&&MED(f),false);
parrilla("CUENTA GRANDE — en crudo, para comparar",()=>true,false);
parrilla("TU CUENTA ($60,000) — en crudo, que es tu mejor versión",()=>true,true);
console.log("");
