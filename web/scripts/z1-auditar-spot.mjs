// AUDITORÍA DEL SPOT — el precio del subyacente que usa TODO el estudio de la esquina barata.
//
// esquina-barata-10anos.mjs deduce el precio del subyacente buscando, EN TODA LA CADENA, el strike
// donde la call y la put valen casi lo mismo. Eso es paridad put-call... pero sólo para el
// vencimiento MÁS CERCANO. A dos años vista la call y la put se cruzan en el PRECIO A FUTURO, que
// está por encima del contado. Como la función mira todos los vencimientos a la vez, se queda con
// el más largo y devuelve un precio inflado.
//
// Aquí se compara, contra los cierres REALES que hay en disco:
//   viejo  = el de esquina-barata-10anos.mjs (todos los vencimientos)
//   nuevo  = paridad SÓLO en el vencimiento más cercano:  S = K + mid(C) − mid(P)
import { readFileSync, readdirSync, existsSync } from "node:fs";
const CDIR = "scripts/cache-theta/cadenas", CL = "scripts/cache-theta/cierres";
const ms=(d)=>Date.parse(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T00:00:00Z`);
const dte=(a,b)=>Math.round((ms(b)-ms(a))/86400000);
function viejo(c){let k=null,dm=Infinity;for(const g of Object.values(c))for(const [cl,ba] of Object.entries(g)){
 if(cl.slice(-1)!=="C")continue;const K=Number(cl.slice(0,-2));const p=g[`${K}|P`];if(!p)continue;
 const d=Math.abs((ba[0]+ba[1])/2-(p[0]+p[1])/2);if(d<dm){dm=d;k=K}}return k;}
function nuevo(c,hoy){
 let exp=null,md=Infinity;
 for(const e of Object.keys(c)){const d=dte(hoy,e);if(d<1)continue;if(d<md){md=d;exp=e}}
 if(!exp)return null;
 const g=c[exp];let K=null,dm=Infinity;
 for(const [cl,ba] of Object.entries(g)){if(cl.slice(-1)!=="C")continue;
  const k=Number(cl.slice(0,-2));const p=g[`${k}|P`];if(!p)continue;
  const d=Math.abs((ba[0]+ba[1])/2-(p[0]+p[1])/2);if(d<dm){dm=d;K=k}}
 if(K==null)return null;
 const C=g[`${K}|C`],P=g[`${K}|P`];
 return K+(C[0]+C[1])/2-(P[0]+P[1])/2;
}
const porSim=new Map();
for(const f of readdirSync(CDIR)){const m=f.match(/^([A-Z]+)_d(\d{8})\.json$/);if(!m)continue;
 if(!porSim.has(m[1]))porSim.set(m[1],[]);porSim.get(m[1]).push(m[2]);}
for(const v of porSim.values())v.sort();
console.log("\n  | ticker | días comparados | error VIEJO (mediana) | error VIEJO (p90) | error NUEVO (mediana) | error NUEVO (p90) | viejo > +2% |");
console.log("  |---|---|---|---|---|---|---|");
const gv=[],gn=[];
for(const t of [...porSim.keys()].sort()){
  if(!existsSync(`${CL}/${t}.json`))continue;
  const cl=JSON.parse(readFileSync(`${CL}/${t}.json`,"utf8"));
  const ev=[],en=[];let n=0,malos=0;
  const dias=porSim.get(t); const paso=Math.max(1,Math.floor(dias.length/120));
  for(let i=0;i<dias.length;i+=paso){const d=dias[i];const real=cl[d];if(!(real>0))continue;
    const c=JSON.parse(readFileSync(`${CDIR}/${t}_d${d}.json`,"utf8"));
    const v=viejo(c),u=nuevo(c,d);if(!v||!u)continue;
    n++;ev.push((v-real)/real);en.push((u-real)/real);if((v-real)/real>0.02)malos++;}
  if(n<10)continue;
  const md=(a)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]},
        p90=(a)=>{const s=[...a].map(Math.abs).sort((x,y)=>x-y);return s[Math.floor(s.length*0.9)]};
  gv.push(...ev);gn.push(...en);
  console.log(`  | ${t} | ${n} | ${(100*md(ev)).toFixed(2)}% | ${(100*p90(ev)).toFixed(2)}% | ${(100*md(en)).toFixed(2)}% | ${(100*p90(en)).toFixed(2)}% | ${(100*malos/n).toFixed(0)}% |`);
}
const md=(a)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]},
      p=(a,q)=>{const s=[...a].map(Math.abs).sort((x,y)=>x-y);return s[Math.floor(s.length*q)]};
console.log(`\n  TOTAL ${gv.length} comparaciones (2021-2026, que es donde hay cierres reales)`);
console.log(`    VIEJO (el de esquina-barata-10anos.mjs): mediana ${(100*md(gv)).toFixed(2)}% · |error| p50 ${(100*p(gv,.5)).toFixed(2)}% · p90 ${(100*p(gv,.9)).toFixed(2)}% · p99 ${(100*p(gv,.99)).toFixed(2)}%`);
console.log(`    NUEVO (paridad en el vencimiento más cercano): mediana ${(100*md(gn)).toFixed(2)}% · |error| p50 ${(100*p(gn,.5)).toFixed(2)}% · p90 ${(100*p(gn,.9)).toFixed(2)}% · p99 ${(100*p(gn,.99)).toFixed(2)}%`);
console.log(`    días en que el VIEJO se pasa más de un 2% : ${(100*gv.filter(x=>x>0.02).length/gv.length).toFixed(1)}%`);
console.log(`    días en que el VIEJO se pasa más de un 5% : ${(100*gv.filter(x=>x>0.05).length/gv.length).toFixed(1)}%\n`);
