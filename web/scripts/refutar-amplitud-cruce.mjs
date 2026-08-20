// REFUTACION CRUCE - lo que el cruce de amplitud-riesgo NO cubrio.
import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const CUENTA = 56389;
const PRUEBAS = 60, LISTON = listonT(PRUEBAS);
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(1) + "%");
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const { dias } = JSON.parse(readFileSync("scripts/amplitud-riesgo-dias.json", "utf8"));
function caidaMax(pl){let c=0,p=0,w=0;for(const x of pl){c+=x;p=Math.max(p,c);w=Math.min(w,c-p);}return w;}
function es5de(pl){const o=[...pl].sort((a,b)=>a-b);return media(o.slice(0,Math.max(1,Math.round(pl.length*0.05))));}
const raya=(t)=>{console.log("\n"+"=".repeat(100));console.log("  "+t);console.log("=".repeat(100));};

const MC=[5,10,20,50,100,200], DD=[20,25,30,35,40,45];
const MA={}; for(const k of MC) MA[k]=dias.map((_,i)=>{if(i<k)return null;let s=0;for(let j=i-k;j<i;j++)s+=dias[j].cierre;return s/k;});
const idxDe=new Map(dias.map((d,i)=>[d.fecha,i]));
// dir: +1 = por ENCIMA de las dos medias (lo del hallazgo) - -1 = por DEBAJO (control)
const serie=(ds,c)=>ds.map((d)=>{const i=idxDe.get(d.fecha),p=d.pnl[String(c.dist)];
  if(p==null)return 0; if(c.a==null)return p;
  const m1=MA[c.a][i],m2=MA[c.b][i]; if(m1==null||m2==null)return 0;
  const enc=d.sp11>=m1&&d.sp11>=m2, deb=d.sp11<m1&&d.sp11<m2;
  return ((c.dir===-1)?deb:enc)?p:0;});
const evalua=(ds,c)=>{const s=serie(ds,c);return{n:s.filter(x=>x!==0).length,a:suma(s)/(ds.length/252),c:caidaMax(s),e:es5de(s),peor:Math.min(...s),s};};
const nomC=(c)=>c.a==null?`+-${c.dist} sin filtro`:`+-${c.dist} . ${c.dir===-1?"BAJO":"sobre"} MA${c.a}+MA${c.b}`;

const m2=Math.floor(dias.length/2);
const H=[dias.slice(0,m2),dias.slice(m2)];
const T3=[dias.slice(0,356),dias.slice(356,712),dias.slice(712)];

console.log(`\n# REFUTAR EL CRUCE - amplitud como riesgo\n`);
console.log(`${dias.length} sesiones ${dias[0].fecha} a ${dias[dias.length-1].fecha} - ${PRUEBAS} pruebas - liston |t| ${LISTON}`);

raya("0 . RADIOGRAFIA de la tabla de dias");
try{
  console.log(radiografia(dias.map(d=>({fecha:d.fecha,sp11:d.sp11,cierre:d.cierre,straddle:d.straddle,
    pnl25:d.pnl["25"],pnl30:d.pnl["30"],pnl45:d.pnl["45"],cred45:d.cred["45"],ma20:d.ma20,ma50:d.ma50}))));
}catch(e){console.log("radiografia() fallo: "+e.message);}

raya("A . EL NULO DE EXPOSICION aplicado a la configuracion QUE SE RECOMIENDA (+-45 . MA5+MA50)");
console.log(`
  La parte 2 corrio el nulo sobre +-30.MA20+MA50 - la del encargo, NO la que el informe recomienda.
  Aqui se corre sobre las dos que salieron del cruce, y sobre el control INVERTIDO (bajo las medias).
`);
let rng=20260820; const rnd=()=>{rng=(rng*1103515245+12345)&0x7fffffff;return rng/0x7fffffff;};
const REPS=4000;
console.log("| tramo | config | dias op./pool | 5% peor real | mediana sorteo | percentil | caida real | percentil caida |");
console.log("|---|---|---|---|---|---|---|---|");
for(const [nom,ds] of [["entero",dias],["H1",H[0]],["H2",H[1]]]){
  for(const c of [{a:5,b:50,dist:45,dir:1},{a:5,b:20,dist:45,dir:1},{a:5,b:50,dist:45,dir:-1}]){
    const pool=ds.filter(d=>d.pnl[String(c.dist)]!=null);
    const pl=pool.map(d=>d.pnl[String(c.dist)]);
    const on=pool.map(d=>{const i=idxDe.get(d.fecha);const m1=MA[c.a][i],m2=MA[c.b][i];
      if(m1==null||m2==null)return false;
      return c.dir===-1?(d.sp11<m1&&d.sp11<m2):(d.sp11>=m1&&d.sp11>=m2);});
    const N=on.filter(Boolean).length;
    const fS=pl.map((x,i)=>on[i]?x:0);
    const real={e:es5de(fS),c:caidaMax(fS)};
    const de={e:[],c:[]}, orden=pl.map((_,i)=>i);
    for(let r=0;r<REPS;r++){
      for(let i=orden.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[orden[i],orden[j]]=[orden[j],orden[i]];}
      const m=new Uint8Array(pl.length); for(let i=0;i<N;i++)m[orden[i]]=1;
      const s=pl.map((x,i)=>m[i]?x:0); de.e.push(es5de(s)); de.c.push(caidaMax(s));
    }
    const perc=(arr,v)=>arr.filter(x=>x<v).length/arr.length;
    const med=(arr)=>{const s=[...arr].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
    console.log(`| ${nom} | ${nomC(c)} | ${N}/${pool.length} | ${eur(real.e)} | ${eur(med(de.e))} | **${(perc(de.e,real.e)*100).toFixed(1)}%** | ${eur(real.c)} | ${(perc(de.c,real.c)*100).toFixed(1)}% |`);
  }
}

raya("B . EL 5% PEOR MIDE RIESGO, O MIDE OPERAR MENOS? - las 91 combinaciones");
const combos=[]; for(const a of MC)for(const b of MC){if(b<=a)continue;for(const dist of DD)combos.push({a,b,dist,dir:1});}
combos.push({a:null,b:null,dist:25,dir:1});
const pts=combos.map(c=>{const m=evalua(dias,c);return{n:m.n,e:m.e,a:m.a};}).filter(p=>p.n>=100);
const rank=(v)=>{const s=v.map((x,i)=>[x,i]).sort((p,q)=>p[0]-q[0]);const r=Array(v.length);s.forEach(([,i],k)=>r[i]=k+1);return r;};
const spear=(x,y)=>{const rx=rank(x),ry=rank(y),mx=media(rx),my=media(ry);
  return suma(rx.map((v,i)=>(v-mx)*(ry[i]-my)))/Math.sqrt(suma(rx.map(v=>(v-mx)**2))*suma(ry.map(v=>(v-my)**2)));};
console.log(`
  Si el "5% peor" fuera una medida de calidad de eleccion, no deberia depender de cuantos dias se
  opera. Se mide sobre las ${pts.length} combinaciones con n>=100 (serie de dias naturales, ceros incluidos).
`);
console.log(`  rho de Spearman entre DIAS OPERADOS y 5% PEOR: **${spear(pts.map(p=>p.n),pts.map(p=>p.e)).toFixed(3)}**`);
console.log(`  (negativo fuerte = cuantos menos dias opera, mejor sale la metrica - artefacto, no habilidad)`);

raya("C . EL CONTROL INVERTIDO - filtrar por DEBAJO de las medias tambien mejora el 5% peor?");
console.log("| config | dias op. | $/ano | caida max | 5% peor | peor dia |");
console.log("|---|---|---|---|---|---|");
for(const c of [{a:null,b:null,dist:45,dir:1},{a:5,b:50,dist:45,dir:1},{a:5,b:50,dist:45,dir:-1},
                {a:null,b:null,dist:30,dir:1},{a:20,b:50,dist:30,dir:1},{a:20,b:50,dist:30,dir:-1}]){
  const m=evalua(dias,c);
  console.log(`| ${nomC(c)} | ${m.n} | ${eur(m.a)} | ${eur(m.c)} | ${eur(m.e)} | ${eur(m.peor)} |`);
}

raya("D . EL CRUCE SIN LA FUGA - el n>=100 se exigia TAMBIEN en la mitad de PRUEBA");
console.log(`
  En amplitud-riesgo-3.mjs, la linea del cruce:
      cand = combos.filter(c => evalua(H[aj],c).n>=100 && evalua(H[pr],c).n>=100)
  El segundo termino mira la mitad de PRUEBA para decidir que candidatos entran al concurso.
  Aqui se repite el cruce sin ese termino, y con la DIRECCION como parametro libre (182 combos).
`);
const combos2=[]; for(const a of MC)for(const b of MC){if(b<=a)continue;for(const dist of DD)for(const dir of [1,-1])combos2.push({a,b,dist,dir});}
combos2.push({a:null,b:null,dist:25,dir:1});
const BASE={a:null,b:null,dist:25,dir:1};
console.log("| variante del cruce | ajuste | elegida | 5% peor ajuste | prueba | 5% peor prueba | base prueba | mejora? | $/ano prueba |");
console.log("|---|---|---|---|---|---|---|---|---|");
for(const [etq,pool,leak] of [["original (91, con fuga)",combos,true],["sin fuga (91)",combos,false],["sin fuga + direccion libre (182)",combos2,false]]){
  for(const [aj,pr] of [[0,1],[1,0]]){
    const cand=pool.filter(c=>evalua(H[aj],c).n>=100 && (!leak||evalua(H[pr],c).n>=100));
    const mej=cand.map(c=>({c,m:evalua(H[aj],c)})).sort((x,y)=>y.m.e-x.m.e)[0];
    const mP=evalua(H[pr],mej.c), bP=evalua(H[pr],BASE);
    console.log(`| ${etq} | H${aj+1} | ${nomC(mej.c)} | ${eur(mej.m.e)} | H${pr+1} | ${eur(mP.e)} | ${eur(bP.e)} | ${mP.e>bP.e?"**si**":"no"} | ${eur(mP.a)} |`);
  }
}

raya("E . 2022 - 39 dias operados, UN solo perdedor y peor dia -$40");
const d22=dias.filter(d=>d.ano==="2022");
const op22=d22.filter(d=>{const i=idxDe.get(d.fecha);return MA[5][i]!=null&&MA[50][i]!=null&&d.sp11>=MA[5][i]&&d.sp11>=MA[50][i]&&d.pnl["45"]!=null;});
console.log(`  ${d22.length} sesiones de 2022 en la tabla - primera ${d22[0].fecha} - MA50 disponible desde el indice 50 (${dias[50].fecha})`);
console.log(`  dias con MA50 nula en 2022: ${d22.filter(d=>MA[50][idxDe.get(d.fecha)]==null).length} (imposible operar)`);
const mov=(d)=>Math.abs(d.cierre/d.sp11-1);
const noop22=d22.filter(d=>!op22.includes(d));
console.log(`  operados: ${op22.length} - movimiento 11:00 a cierre medio ${pct(media(op22.map(mov)))} - maximo ${pct(Math.max(...op22.map(mov)))}`);
console.log(`  NO operados: ${noop22.length} - movimiento medio ${pct(media(noop22.map(mov)))} - maximo ${pct(Math.max(...noop22.map(mov)))}`);
console.log(`  credito medio +-45 en los operados ${eur(media(op22.map(d=>d.cred["45"])))} - P&L total ${eur(suma(op22.map(d=>d.pnl["45"])))}`);
console.log(`\n  los 8 peores dias de 2022 operados:`);
for(const d of [...op22].sort((a,b)=>a.pnl["45"]-b.pnl["45"]).slice(0,8))
  console.log(`     ${d.fecha}  sp11 ${d.sp11.toFixed(0)} -> cierre ${d.cierre.toFixed(0)}  mov ${pct(d.cierre/d.sp11-1)}  credito ${eur(d.cred["45"])}  P&L ${eur(d.pnl["45"])}`);

raya("F . TRES TERCIOS de la configuracion recomendada (+-45 . MA5+MA50)");
console.log("| tercio | dias | dias op. | $/ano | caida max | 5% peor | base +-25 5% peor | mejora? |");
console.log("|---|---|---|---|---|---|---|---|");
for(const [i,ds] of T3.entries()){
  const m=evalua(ds,{a:5,b:50,dist:45,dir:1}), b=evalua(ds,BASE);
  console.log(`| T${i+1} ${ds[0].fecha} a ${ds[ds.length-1].fecha} | ${ds.length} | ${m.n} | ${eur(m.a)} | ${eur(m.c)} | ${eur(m.e)} | ${eur(b.e)} | ${m.e>b.e?"**si**":"no"} |`);
}
