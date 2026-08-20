// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASO 8 — LA RECETA. Las tres piezas que sobrevivieron, juntas y por separado.
//   1. filtro GEX rodante 20% (percentil de zonaSobreTotal contra sus 60 días previos)
//   2. crédito mínimo de $2 (no arriesgar $4.900 por $100 — es una regla de riesgo/recompensa,
//      no un umbral ajustado: la rejilla $0→$8 está en la salida de /tmp y en el informe)
//   3. ala de 40 puntos en vez de 50 (lo ÚNICO que baja el peor día, porque el peor día es la
//      pérdida máxima de diseño, no un suceso de cola)
// Todo con bid/ask reales de la cadena de las 11:00. Ningún umbral mira al futuro.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
const g = JSON.parse(readFileSync("scripts/cola-gex-filas.json","utf8")).sort((a,b)=>a.fecha.localeCompare(b.fecha));
const dias = new Map(JSON.parse(readFileSync("scripts/cola-cadena11.json","utf8")).map(d=>[d.fecha,d]));
const eur=(x)=>(x<0?"−":"")+"$"+Math.abs(Math.round(x)).toLocaleString("es-ES");
const cerca=(f,o)=>f.reduce((a,b)=>(Math.abs(b[0]-o)<Math.abs(a[0]-o)?b:a));
const A=653/252;
function fuera(campo,q,sent){const s=new Set();
 for(let i=0;i<g.length;i++){const v=g[i][campo];if(v==null||!isFinite(v))continue;
  const w=g.slice(Math.max(0,i-60),i).map(r=>r[campo]).filter(x=>x!=null&&isFinite(x));
  if(w.length<30)continue;const p=w.filter(x=>x<v).length/w.length;
  if(sent==="bajo"?p<q:p>1-q)s.add(g[i].fecha);} return s;}
function condor(d,ala){const cC=cerca(d.C,d.spot+25),pC=cerca(d.P,d.spot-25);
 const cL=cerca(d.C,cC[0]+ala),pL=cerca(d.P,pC[0]-ala);
 if(cL[0]<=cC[0]||pL[0]>=pC[0])return null;
 const cr=cC[1]+pC[1]-cL[2]-pL[2]; if(!(cr>0))return null;
 const pl=(cr-Math.min(Math.max(d.cierre-cC[0],0),cL[0]-cC[0])-Math.min(Math.max(pC[0]-d.cierre,0),pC[0]-pL[0]))*100-8*0.03;
 return{pl,cr,col:(Math.max(cL[0]-cC[0],pC[0]-pL[0])-cr)*100};}
const res=(o)=>{const p=o.map(x=>x.pl),t=p.reduce((s,x)=>s+x,0);let pi=0,ac=0,pe=0;
 for(const x of o){ac+=x.pl;pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
 const s=[...p].sort((a,b)=>a-b);
 return{n:o.length,total:t,anio:t/A,peor:s[0],p1:s[Math.floor(s.length*0.01)],p5:s[Math.floor(s.length*0.05)],racha:pe,
   m2k:p.filter(x=>x<-2000).length,m4k:p.filter(x=>x<-4000).length,ac:p.filter(x=>x>0).length/p.length,col:Math.max(...o.map(x=>x.col))};};
const FG=fuera("zonaSobreTotal",0.2,"bajo");
const base=res([...dias.values()].map(d=>condor(d,50)).filter(Boolean));
console.log("| variante | días | $/año | % | acierto | PEOR DÍA | p1 | p5 | PEOR RACHA | <−2k | <−4k | colateral | $año/$caída |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const V=[
 ["base ±25/ala 50", ()=>true, 50],
 ["+ GEX rodante 20%", (f,c)=>!FG.has(f), 50],
 ["+ crédito ≥ $2", (f,c)=>c>=2, 50],
 ["+ GEX rod. + crédito ≥ $2", (f,c)=>!FG.has(f)&&c>=2, 50],
 ["+ GEX rod. + créd≥$2 + ala 40", (f,c)=>!FG.has(f)&&c>=2, 40],
 ["+ GEX rod. + créd≥$2 + ala 30", (f,c)=>!FG.has(f)&&c>=2, 30],
];
for(const [nom,ok,ala] of V){
 const o=[]; for(const [f,d] of dias){const c=condor(d,ala); if(!c)continue; if(!ok(f,c.cr))continue; o.push(c);}
 const R=res(o); const ah=R.racha-base.racha, pe=base.anio-R.anio;
 console.log(`| ${nom} | ${R.n} | ${eur(R.anio)} | ${(R.anio/base.anio*100).toFixed(0)}% | ${(R.ac*100).toFixed(1)}% | ${eur(R.peor)} | ${eur(R.p1)} | ${eur(R.p5)} | ${eur(R.racha)} | ${R.m2k} | ${R.m4k} | ${eur(R.col)} | ${ah>0?"$"+(pe/ah).toFixed(2):"—"} |`);}
console.log("\n── año a año de la mejor combinación (GEX rod. + créd≥$2 + ala 40) ──");
console.log("| año | días | $ del año | peor día | peor racha | <−2k |");
console.log("|---|---|---|---|---|---|");
for(const a of ["2024","2025","2026"]){
 for(const [nom,ok,ala] of [["base",()=>true,50],["combinada",(f,c)=>!FG.has(f)&&c>=2,40]]){
  const o=[]; for(const [f,d] of dias){if(!f.startsWith(a))continue;const c=condor(d,ala);if(!c)continue;if(!ok(f,c.cr))continue;o.push(c);}
  const R=res(o); console.log(`| ${a} ${nom} | ${R.n} | ${eur(R.total)} | ${eur(R.peor)} | ${eur(R.racha)} | ${R.m2k} |`);}}
console.log(`\nlistón con 87 pruebas acumuladas: |z| ≥ ${listonT(87)}`);
