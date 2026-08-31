// IDEA 4 — SALIR POR LO QUE HACE LA ACCIÓN, NO POR EL CALENDARIO.
//
// La regla actual suelta a los 15 días de bolsa. Ese número se eligió probando 5, 10 y 15, y el
// barrido posterior mostró que el resultado se mueve como una veleta según el día (2021 da
// +$13,233 a 15 días, +$63 a 20 y +$23,533 a 30). Que dependa tanto del día significa que el
// calendario no está capturando la tesis.
//
// Aquí la salida la decide EL SUBYACENTE. Se camina día a día, en orden, y se vende al bid del
// día en que se dispara la regla. El spot y el bid salen de la MISMA cadena del MISMO día, así
// que no hay desfase entre las dos series.
//
// CONTROLES: (1) la regla actual de 15 días; (2) el mismo tope de 60 días SIN regla de acción —
// para separar lo que aporta la regla de lo que aporta simplemente aguantar más.
import { cargar, resumir, cuenta } from "./consultar.mjs";
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

/** Camina el camino EN ORDEN. Vende el día que se dispara. Nunca mira un día futuro. */
function salir(f,{objetivo=1.50,suelo=0.50,tope=60,regla=null}={}){
  const coste=f.ask; let mejor=0, n=0, ult=null;
  const ventana=[];                                   // spots recientes, para la media de 20
  for(const [d,bid] of f.camino){
    n++; ult={mult:bid/coste,dSal:d,dias:n,por:"tope"};
    const m=bid/coste;
    if(objetivo!=null&&m>=objetivo) return {mult:objetivo,dSal:d,dias:n,por:"objetivo"};
    if(suelo!=null&&m<=suelo)       return {mult:suelo,dSal:d,dias:n,por:"corte"};
    const s=spotDe(f.tk,d);
    if(s!=null){
      ventana.push(s); if(ventana.length>20) ventana.shift();
      const mov=f.l==="P"?(f.spot-s)/f.spot:(s-f.spot)/f.spot;   // + = a nuestro favor
      if(mov>mejor) mejor=mov;
      const ma20=ventana.length>=10?ventana.reduce((a,b)=>a+b,0)/ventana.length:null;
      if(regla&&regla({mov,mejor,s,ma20,f})) return {mult:m,dSal:d,dias:n,por:"acción"};
    }
    if(n>=tope) return {mult:m,dSal:d,dias:n,por:"tope"};
  }
  return {...ult,por:"vencimiento"};
}
/** resumir/cuenta con una salida propia: se reescribe el camino a un solo paso. */
function conSalida(L,opts){
  return L.map(f=>{const r=salir(f,opts);
    return {...f,camino:[[r.dSal,r.mult*f.ask,r.mult*f.ask]],_por:r.por,_dias:r.dias};});
}
const O0={objetivo:1.50,suelo:0.50};   // al reescribir el camino, la salida ya está decidida

const D={};
for(const [y,M] of AÑOS){ D[y]=cargar(M).filter(MAG);
  for(const f of D[y]){ const ds=cad.dias(f.tk); const i=ds.indexOf(f.dC);
    if(i<50){f.sm=null;continue;}
    const prev=ds.slice(i-50,i).map(d=>spotDe(f.tk,d)).filter(x=>x!=null);
    f.sm=prev.length<40?null:f.spot/(prev.reduce((a,b)=>a+b,0)/prev.length)-1; }}

const REGLAS=[
  ["la regla actual — 15 días",{tope:15,regla:null}],
  ["CONTROL — 60 días, sin regla",{tope:60,regla:null}],
  ["la acción se mueve 3% a favor",{tope:60,regla:({mov})=>mov>=0.03}],
  ["la acción se mueve 5% a favor",{tope:60,regla:({mov})=>mov>=0.05}],
  ["la acción se mueve 8% a favor",{tope:60,regla:({mov})=>mov>=0.08}],
  ["trailing: retrocede 2%",{tope:60,regla:({mov,mejor})=>mejor>=0.02&&mov<=mejor-0.02}],
  ["trailing: retrocede 4%",{tope:60,regla:({mov,mejor})=>mejor>=0.04&&mov<=mejor-0.04}],
  ["stop: 3% en contra",{tope:60,regla:({mov})=>mov<=-0.03}],
  ["cruza su media de 20 en contra",{tope:60,regla:({s,ma20,f})=>ma20!=null&&(f.l==="P"?s>ma20:s<ma20)}],
];
console.log(`\n  ═══ AUDITORÍA ═══\n`);
const pr=conSalida(D["2026"],{...REGLAS[0][1]});
console.log(`  ¿reproduce la regla actual? 2026 = ${$(resumir(pr,O0).neto)} (esperado $147,639) ${Math.abs(resumir(pr,O0).neto-147639)<1?"✓":"⚠ NO CUADRA"}`);
let mal=0; for(const [y] of AÑOS) for(const f of conSalida(D[y],{tope:60,regla:({mov})=>mov>=0.03})) if(f.camino[0][0]<=f.dC) mal++;
console.log(`  días de salida anteriores o iguales al de compra: ${mal} ${mal?"⚠":"✓ ninguno"}`);

function parrilla(t,pre,conCuenta){
  console.log(`\n  ═══ ${t} ═══\n`);
  console.log(`  ${"".padEnd(32)} ${AÑOS.map(([y])=>y.padStart(12)).join("")} ${"TOTAL".padStart(13)} ${"ratio".padStart(6)} ${"días".padStart(5)} ${"años+".padStart(6)}`);
  for(const [nom,op] of REGLAS){
    let tot=0,gan=0; const cel=[],acum=[];
    for(const [y] of AÑOS){
      const L=conSalida(D[y].filter(pre),op); if(!L.length){cel.push("—".padStart(12));continue;}
      acum.push(...L);
      const v=conCuenta?cuenta(L,{capital:60000,porOp:15000,maxAbiertas:4,...O0}).ganancia:resumir(L,O0).neto;
      tot+=v; if(v>0)gan++; cel.push($(v).padStart(12));
    }
    const rt=acum.length?resumir(acum,O0):null;
    const dm=acum.length?acum.map(f=>f._dias).sort((a,b)=>a-b)[Math.floor(acum.length/2)]:0;
    console.log(`  ${nom.padEnd(32)} ${cel.join("")} ${$(tot).padStart(13)} ${(rt?(rt.r===Infinity?"∞":rt.r.toFixed(2)):"—").padStart(6)} ${String(dm).padStart(5)} ${(gan+"/6").padStart(6)}`);
  }
}
const T50=(f)=>f.prof<=0.50, MED=(f)=>f.sm!=null&&f.sm<0;
parrilla("CUENTA GRANDE — sobre techo 50% + media (tu mejor versión)",(f)=>T50(f)&&MED(f),false);
parrilla("CUENTA GRANDE — en crudo",()=>true,false);
parrilla("TU CUENTA ($60,000) — en crudo (tu mejor versión)",()=>true,true);
console.log("");
