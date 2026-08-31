// IDEA 2 — LA MEDIA APLICADA SEGÚN EL LADO.
//
// El filtro que tenemos («la acción por debajo de su media de 50 días») no mira si la operación
// es put o call. Estar por debajo de la media es BUENO para una put —sigues una caída viva— y
// MALO para una call. Aplicar la misma prueba a las dos es un fallo, no una variable.
//
//   versión correcta:  put  → la acción POR DEBAJO de su media
//                      call → la acción POR ENCIMA de su media
//
// Se mide también el CONTROL (la versión al revés): si el filtro correcto no separa mejor que su
// propio reverso, es que no hay nada.
import { cargar, resumir, cuenta } from "./consultar.mjs";
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
const D={}; let n=0, futuro=0;
for(const [y,M] of AÑOS){ D[y]=cargar(M).filter(MAG);
  for(const f of D[y]){ n++;
    const ds=cad.dias(f.tk); const i=ds.indexOf(f.dC);
    if(i<50){f.sm=null;continue;}
    if(ds[i-1]>=f.dC) futuro++;
    const prev=ds.slice(i-50,i).map(d=>spotDe(f.tk,d)).filter(x=>x!=null);
    f.sm=prev.length<40?null:f.spot/(prev.reduce((a,b)=>a+b,0)/prev.length)-1; }}
console.log(`\n  ═══ AUDITORÍA ═══\n`);
console.log(`  señales ................................. ${n}`);
console.log(`  con media calculable .................... ${Object.values(D).flat().filter(f=>f.sm!=null).length} ${Object.values(D).flat().filter(f=>f.sm!=null).length===n?"✓ todas":""}`);
console.log(`  días de la media posteriores a la compra  ${futuro} ${futuro?"⚠":"✓ ninguno"}`);

const T50=(f)=>f.prof<=0.50;
const VIEJA =(f)=>f.sm!=null&&f.sm<0;                                    // la que teníamos
const LADO  =(f)=>f.sm!=null&&(f.l==="P"?f.sm<0:f.sm>0);                 // ← LA IDEA
const REVES =(f)=>f.sm!=null&&(f.l==="P"?f.sm>0:f.sm<0);                 // el control
const VERS=[["crudo — sin filtro de media",()=>true],
            ["media vieja (sin mirar el lado)",VIEJA],
            ["★ media SEGÚN EL LADO",LADO],
            ["control — la media AL REVÉS",REVES]];

function parrilla(titulo,pre,conCuenta){
  console.log(`\n  ═══ ${titulo} ═══\n`);
  console.log(`  ${"".padEnd(33)} ${AÑOS.map(([y])=>y.padStart(12)).join("")} ${"TOTAL".padStart(13)} ${"n".padStart(5)} ${"ratio".padStart(7)}`);
  for(const [nom,fl] of VERS){
    let tot=0; const cel=[]; const acum=[];
    for(const [y] of AÑOS){
      const L=D[y].filter(f=>pre(f)&&fl(f));
      if(!L.length){cel.push("—".padStart(12));continue;}
      acum.push(...L);
      tot+=conCuenta?cuenta(L,{capital:60000,porOp:15000,maxAbiertas:4,...O}).ganancia:resumir(L,O).neto;
      cel.push($(conCuenta?cuenta(L,{capital:60000,porOp:15000,maxAbiertas:4,...O}).ganancia:resumir(L,O).neto).padStart(12));
    }
    const rt=acum.length?resumir(acum,O):null;
    console.log(`  ${nom.padEnd(33)} ${cel.join("")} ${$(tot).padStart(13)} ${String(acum.length).padStart(5)} ${(rt?(rt.r===Infinity?"∞":rt.r.toFixed(2)):"—").padStart(7)}`);
  }
}
parrilla("CUENTA GRANDE — sobre techo 50% (tu mejor versión)",T50,false);
parrilla("CUENTA GRANDE — en crudo",()=>true,false);
parrilla("TU CUENTA ($60,000) — en crudo (tu mejor versión)",()=>true,true);

console.log(`\n  ═══ QUÉ DEJA PASAR CADA VERSIÓN — puts y calls ═══\n`);
console.log(`  ${"".padEnd(33)} ${AÑOS.map(([y])=>y.padStart(12)).join("")}`);
for(const [nom,fl] of VERS){
  const cel=AÑOS.map(([y])=>{const L=D[y].filter(fl);
    return `${L.filter(f=>f.l==="P").length}P ${L.filter(f=>f.l==="C").length}C`.padStart(12);});
  console.log(`  ${nom.padEnd(33)} ${cel.join("")}`);
}
console.log(`\n  ═══ LAS CALLS Y LAS PUTS POR SEPARADO (crudo) ═══\n`);
console.log(`  ${"".padEnd(33)} ${"n".padStart(5)} ${"ratio".padStart(7)} ${"dinero".padStart(12)}`);
for(const [nom,fl] of [["puts, acción BAJO su media",f=>f.l==="P"&&f.sm<0],
                       ["puts, acción SOBRE su media",f=>f.l==="P"&&f.sm>=0],
                       ["calls, acción SOBRE su media",f=>f.l==="C"&&f.sm>=0],
                       ["calls, acción BAJO su media",f=>f.l==="C"&&f.sm<0]]){
  const L=Object.values(D).flat().filter(f=>f.sm!=null&&fl(f)); if(!L.length){console.log(`  ${nom.padEnd(33)}     0`);continue;}
  const r=resumir(L,O);
  console.log(`  ${nom.padEnd(33)} ${String(r.n).padStart(5)} ${(r.r===Infinity?"∞":r.r.toFixed(2)).padStart(7)} ${$(r.neto).padStart(12)}`);
}
console.log("");
