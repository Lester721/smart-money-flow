// TENDENCIA-OTRA-VEZ · PASO 9 — EL NULO QUE DECIDE.
// Se desplaza la SERIE DE LA SEÑAL en círculo (conserva entera su autocorrelación: sigue siendo
// una tendencia lenta con tramos largos arriba y abajo) y se rompe SÓLO su alineación con el P&L.
// Si la región de 20 reglas «encima» que pasa el cruce apareciera igual con la señal desalineada,
// no habría nada. Es el nulo correcto para una señal de tendencia.
import { readFileSync } from "node:fs";
const { filas } = JSON.parse(readFileSync("scripts/tend-filas.json","utf8"));
const { largos } = JSON.parse(readFileSync("scripts/tend-filas.json","utf8"));
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
const n = filas.length, iA = filas.findIndex(f=>f.fecha>="2024-01-01");
const pl = filas.map(f=>f.pl);
const eur=x=>`$${Math.round(x).toLocaleString("es-ES")}`;
const P=(v,q)=>v[Math.min(v.length-1,Math.max(0,Math.round((v.length-1)*q)))];

function metRango(ini,fin,mask){
  const pls=[]; let ac=0,pi=0,pe=0;
  for(let i=ini;i<fin;i++){const p=mask[i]?pl[i]:0; if(mask[i])pls.push(pl[i]); ac+=p;pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
  const o=[...pls].sort((a,b)=>a-b),k5=Math.max(1,Math.floor(pls.length*0.05));
  return{nOp:pls.length,pctOp:pls.length/(fin-ini),ano:pls.reduce((a,b)=>a+b,0)/((fin-ini)/252),
    peorRacha:pe,p5:o.length?P(o,0.05):0,es5:o.length?o.slice(0,k5).reduce((a,b)=>a+b,0)/k5:0,
    n2000:pls.filter(x=>x<=-2000).length};
}
const bA=metRango(0,iA,new Array(n).fill(true)), bB=metRango(iA,n,new Array(n).fill(true));

const UMB=[]; for(let u=-5;u<=5.0001;u+=0.5) UMB.push(+u.toFixed(2));
// series de señal (una por largo de media)
const señales = largos.map(N=>filas.map(f=>f["d"+N]*100));

function contarYCruzar(desp){
  const sh = señales.map(s=>{ const r=new Array(n); for(let i=0;i<n;i++) r[i]=s[(i+desp)%n]; return r; });
  let pasan=0, mejorA=null;
  for(let li=0; li<largos.length; li++){
    for(const u of UMB){
      const mask=new Array(n); const s=sh[li];
      for(let i=0;i<n;i++) mask[i]= s[i]>=u;
      const mA=metRango(0,iA,mask), mB=metRango(iA,n,mask);
      const seis = mA.peorRacha>=bA.peorRacha*0.75 && mB.peorRacha>=bB.peorRacha*0.75 &&
                   mA.p5>bA.p5 && mB.p5>bB.p5 && mA.es5>bA.es5 && mB.es5>bB.es5 &&
                   mA.n2000/(iA)<bA.n2000/(iA) && mB.n2000/(n-iA)<bB.n2000/(n-iA) &&
                   mA.pctOp>=0.4 && mB.pctOp>=0.4 &&
                   mA.ano>=bA.ano-2000 && mB.ano>=bB.ano-2000;
      if(seis) pasan++;
      if(mA.pctOp>=0.4 && (!mejorA || mA.peorRacha>mejorA.mA.peorRacha)) mejorA={li,u,mA,mB};
    }
  }
  return { pasan, mejorA };
}

const real = contarYCruzar(0);
console.log(`═══ EL DATO REAL (desplazamiento 0) ═══`);
console.log(`  reglas «MA_N ≥ u%» que pasan las SEIS condiciones del cruce: ${real.pasan} de ${largos.length*UMB.length}`);
console.log(`  la mejor elegida en 2022-23 por peor racha: MA${largos[real.mejorA.li]} ≥ ${real.mejorA.u}%`);
console.log(`     fuera de muestra (2024-26): racha ${eur(real.mejorA.mB.peorRacha)} vs base ${eur(bB.peorRacha)} · ${eur(real.mejorA.mB.ano)}/año vs base ${eur(bB.ano)}`);

const SORTEOS = 300;
const pasanNulo=[], mejRachaNulo=[], mejIngNulo=[];
const usados=new Set();
for(let s=0;s<SORTEOS;s++){
  let d; do { d = 30 + ((Math.random()*(n-60))|0); } while(usados.has(d)); usados.add(d);
  const r = contarYCruzar(d);
  pasanNulo.push(r.pasan);
  mejRachaNulo.push(r.mejorA.mB.peorRacha - bB.peorRacha);   // mejora fuera de muestra
  mejIngNulo.push(r.mejorA.mB.ano - bB.ano);
  if((s+1)%50===0) process.stdout.write(`  ${s+1}/${SORTEOS}\r`);
}
const ord=a=>a.slice().sort((x,y)=>x-y);
const pctl=(arr,v)=>arr.filter(x=>x<v).length/arr.length;
const pn=ord(pasanNulo), mr=ord(mejRachaNulo), mi=ord(mejIngNulo);
console.log(`\n\n═══ EL NULO — ${SORTEOS} desplazamientos circulares de la señal ═══`);
console.log(`  nº de reglas que pasan las seis condiciones:`);
console.log(`     real ${real.pasan} · nulo p50 ${P(pn,0.5)} · p90 ${P(pn,0.9)} · p99 ${P(pn,0.99)} · máx ${pn[pn.length-1]}`);
console.log(`     el real está en el percentil ${(pctl(pn,real.pasan)*100).toFixed(1)}% del nulo`);
const mejReal = real.mejorA.mB.peorRacha - bB.peorRacha, ingReal = real.mejorA.mB.ano - bB.ano;
console.log(`\n  mejora de la peor racha FUERA DE MUESTRA de la regla elegida en 2022-23:`);
console.log(`     real ${eur(mejReal)} · nulo p50 ${eur(P(mr,0.5))} · p90 ${eur(P(mr,0.9))} · p99 ${eur(P(mr,0.99))} · máx ${eur(mr[mr.length-1])}`);
console.log(`     el real está en el percentil ${(pctl(mr,mejReal)*100).toFixed(1)}% del nulo`);
console.log(`\n  cambio del ingreso FUERA DE MUESTRA de la regla elegida en 2022-23:`);
console.log(`     real ${eur(ingReal)}/año · nulo p50 ${eur(P(mi,0.5))} · p90 ${eur(P(mi,0.9))} · máx ${eur(mi[mi.length-1])}`);
console.log(`     el real está en el percentil ${(pctl(mi,ingReal)*100).toFixed(1)}% del nulo`);
console.log(`\n  (percentil alto = el dato real es mejor que el nulo. p<95% = indistinguible del azar)`);
