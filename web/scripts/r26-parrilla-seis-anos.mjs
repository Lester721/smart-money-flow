// LAS VARIABLES EN DESARROLLO, SOBRE LOS SEIS AÑOS.
// Lester, el 2026-08-26: «preséntame los años con las combinaciones de las variables que hemos
// dialogado». Las tres: techo de profundidad · suelo de interés abierto · media de 50 días.
// Más el tope al precio del contrato, que salió midiendo 2022.
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
const memo=new Map();
const spotDe=(tk,d)=>{const k=tk+d; if(memo.has(k))return memo.get(k);
  const c=cad.leer(tk,d); const s=c?spotOk(c,d):null; memo.set(k,s); return s;};
const D={}; let conMedia=0,total=0,futuro=0;
for(const [y,M] of AÑOS){ D[y]=cargar(M).filter(MAG);
  for(const f of D[y]){ total++;
    const ds=cad.dias(f.tk); const i=ds.indexOf(f.dC);
    if(i<50){f.sm=null;continue;}
    if(ds[i-1]>=f.dC) futuro++;
    const prev=ds.slice(i-50,i).map(d=>spotDe(f.tk,d)).filter(x=>x!=null);
    f.sm=prev.length<40?null:f.spot/(prev.reduce((a,b)=>a+b,0)/prev.length)-1;
    if(f.sm!=null) conMedia++; }}
console.log(`\n  ═══ AUDITORÍA ═══\n`);
console.log(`  señales ................................. ${total}`);
console.log(`  con media de 50 días calculable ......... ${conMedia} ${conMedia===total?"✓ todas":`(${total-conMedia} sin)`}`);
console.log(`  días de la media posteriores a la compra  ${futuro} ${futuro?"⚠ MIRA AL FUTURO":"✓ ninguno"}`);

const T75=(f)=>f.prof<=0.75, T50=(f)=>f.prof<=0.50;
const OI5=(f)=>f.oiV>=5, OI10=(f)=>f.oiV>=10;
const MED=(f)=>f.sm!=null&&f.sm<0;
const P50k=(f)=>f.ask*100<=50000;
const Y=(...fs)=>(f)=>fs.every(g=>g(f));
const COMBOS=[
  ["crudo — sin nada",()=>true],
  ["techo 75%",T75],
  ["techo 50%",T50],
  ["OI ≥ 5",OI5],
  ["OI ≥ 10",OI10],
  ["bajo la media",MED],
  ["contrato ≤ $50,000",P50k],
  ["75% + OI≥5",Y(T75,OI5)],
  ["50% + OI≥5  ← tu favorita",Y(T50,OI5)],
  ["50% + OI≥10",Y(T50,OI10)],
  ["75% + media",Y(T75,MED)],
  ["50% + media",Y(T50,MED)],
  ["OI≥5 + media",Y(OI5,MED)],
  ["50% + OI≥5 + media",Y(T50,OI5,MED)],
  ["75% + OI≥10 + media",Y(T75,OI10,MED)],
  ["50% + OI≥5 + ≤$50k + media",Y(T50,OI5,P50k,MED)],
];
function parrilla(titulo,conCuenta){
  console.log(`\n  ═══ ${titulo} ═══\n`);
  console.log(`  ${"".padEnd(28)} ${AÑOS.map(([y])=>y.padStart(12)).join("")} ${"TOTAL".padStart(13)}`);
  for(const [nom,fl] of COMBOS){
    let tot=0; const cel=[];
    for(const [y] of AÑOS){
      const L=D[y].filter(fl);
      if(!L.length){cel.push("—".padStart(12));continue;}
      const v=conCuenta?cuenta(L,{capital:60000,porOp:15000,maxAbiertas:4,...O}).ganancia:resumir(L,O).neto;
      tot+=v; cel.push($(v).padStart(12));
    }
    console.log(`  ${nom.padEnd(28)} ${cel.join("")} ${$(tot).padStart(13)}`);
  }
}
parrilla("CUENTA GRANDE — dinero por año",false);
parrilla("TU CUENTA ($60,000 · $15,000 · 4 huecos) — dinero por año",true);

console.log(`\n  ═══ CUENTA GRANDE — cuántas señales y qué ratio ═══\n`);
console.log(`  ${"".padEnd(28)} ${AÑOS.map(([y])=>y.padStart(12)).join("")} ${"n total".padStart(9)} ${"ratio".padStart(7)}`);
for(const [nom,fl] of COMBOS){
  const cel=[]; let n=0;
  for(const [y] of AÑOS){
    const L=D[y].filter(fl);
    if(!L.length){cel.push("—".padStart(12));continue;}
    const r=resumir(L,O); n+=r.n;
    cel.push(`${r.n}·${r.r===Infinity?"∞":r.r.toFixed(2)}`.padStart(12));
  }
  const TT=Object.values(D).flat().filter(fl);
  const rt=TT.length?resumir(TT,O):null;
  console.log(`  ${nom.padEnd(28)} ${cel.join("")} ${String(n).padStart(9)} ${(rt?(rt.r===Infinity?"∞":rt.r.toFixed(2)):"—").padStart(7)}`);
}
console.log(`\n  (años ganadores de cada combinación, cuenta grande)\n`);
for(const [nom,fl] of COMBOS){
  const g=AÑOS.filter(([y])=>{const L=D[y].filter(fl); return L.length&&resumir(L,O).neto>0;}).map(([y])=>y);
  console.log(`  ${nom.padEnd(28)} ${g.length}/6  ${g.join(" ")}`);
}
console.log("");
