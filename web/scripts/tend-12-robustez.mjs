// TENDENCIA-OTRA-VEZ · PASO 12 — robustez: los días rellenados, los tercios, la barrera y las horas.
import { readFileSync } from "node:fs";
import { pasarBarrera, informe, listonT, tWelch, potencia } from "../lib/barreraHallazgos.ts";
const { filas } = JSON.parse(readFileSync("scripts/tend-filas.json","utf8"));
const base = JSON.parse(readFileSync("scripts/tend-base.json","utf8")).filas;
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
const eur=x=>`$${Math.round(x).toLocaleString("es-ES")}`, pc=x=>`${(x*100).toFixed(0)}%`;
const P=(v,q)=>v[Math.min(v.length-1,Math.max(0,Math.round((v.length-1)*q)))];
function met(per,f){const pls=[];let ac=0,pi=0,pe=0;
  for(const d of per){const p=f(d)?d.pl:0;if(f(d))pls.push(d.pl);ac+=p;pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
  const o=[...pls].sort((a,b)=>a-b),k5=Math.max(1,Math.floor(pls.length*0.05));
  return{n:pls.length,pctOp:pls.length/per.length,total:pls.reduce((a,b)=>a+b,0),
    ano:pls.reduce((a,b)=>a+b,0)/(per.length/252),peorRacha:pe,p5:o.length?P(o,0.05):0,
    es5:o.length?o.slice(0,k5).reduce((a,b)=>a+b,0)/k5:0,n2000:pls.filter(x=>x<=-2000).length};}

// ═══ 1 · ¿CAMBIA ALGO SI LA MEDIA SE CALCULA SÓLO CON CIERRES DE CADENA? ═══
// (los 33 días de enero-mayo de 2022 encadenados del SPY son el único dato no-SPX de la señal;
//  aquí se rehace la media usando ÚNICAMENTE los cierres reales de SPX, sin rellenar nada)
const cier = base.map(f=>({fecha:f.fecha,c:f.cierre}));
const idx = new Map(cier.map((x,i)=>[x.fecha,i]));
const ac=[0]; for(let i=0;i<cier.length;i++) ac.push(ac[i]+cier[i].c);
for(const f of filas){ const i=idx.get(f.fecha);
  for(const N of [25,30,50]){ f["c"+N] = i>=N ? f.spot11/((ac[i]-ac[i-N])/N)-1 : null; } }
const conAmbas = filas.filter(f=>f.c30!=null);
console.log(`═══ 1 · LA MEDIA SIN RELLENAR NADA (sólo cierres reales de SPX) · ${conAmbas.length} días ═══`);
console.log("  | regla | versión de la media | opera | $/año | racha | p5 | <−$2k |");
console.log("  |---|---|---|---|---|---|---|");
for(const [N,u] of [[50,1],[30,1],[25,1.5]]){
  for(const [et,f] of [["con relleno SPY (33 días)",x=>x["d"+N]*100>=u],["sólo cierres SPX",x=>x["c"+N]*100>=u]]){
    const m=met(conAmbas,f);
    console.log(`  | MA${N} ≥ ${u}% | ${et} | ${pc(m.pctOp)} | ${eur(m.ano)} | ${eur(m.peorRacha)} | ${eur(m.p5)} | ${m.n2000} |`);
  }
}
const dif = conAmbas.filter(x=>(x.d30*100>=1)!==(x.c30*100>=1)).length;
console.log(`  · las dos versiones deciden distinto en ${dif} de ${conAmbas.length} días (${pc(dif/conAmbas.length)})`);

// ═══ 2 · TERCIOS DE TIEMPO sobre lo que sí sobrevive: LA COLA ═══
const R = x=>x.d30*100>=1;
const k=Math.floor(filas.length/3), ter=[filas.slice(0,k),filas.slice(k,2*k),filas.slice(2*k)];
console.log(`\n═══ 2 · TERCIOS DE TIEMPO — MA30 ≥ 1% ═══`);
console.log("  | tercio | fechas | opera | p5 regla | p5 base | ES5 regla | ES5 base | racha regla | racha base | $/año regla | $/año base |");
console.log("  |---|---|---|---|---|---|---|---|---|---|---|");
let sp5=0,ses=0,srac=0,sing=0;
for(let i=0;i<3;i++){ const m=met(ter[i],R), b=met(ter[i],()=>true);
  if(m.p5>b.p5)sp5++; if(m.es5>b.es5)ses++; if(m.peorRacha>b.peorRacha)srac++; if(m.ano>=b.ano)sing++;
  console.log(`  | ${i+1} | ${ter[i][0].fecha}→${ter[i][ter[i].length-1].fecha} | ${pc(m.pctOp)} | ${eur(m.p5)} | ${eur(b.p5)} | ${eur(m.es5)} | ${eur(b.es5)} | ${eur(m.peorRacha)} | ${eur(b.peorRacha)} | ${eur(m.ano)} | ${eur(b.ano)} |`);}
console.log(`  → p5 mejor en ${sp5}/3 tercios · ES5 en ${ses}/3 · racha en ${srac}/3 · ingreso igual o mejor en ${sing}/3`);

// ═══ 3 · LA BARRERA formal sobre la separación día a día ═══
console.log(`\n═══ 3 · LA BARRERA — ¿separa día a día? (4.904 pruebas declaradas, listón ${listonT(4904)}) ═══`);
const fh = filas.map(f=>({pnl:f.pl/1000, ticker:"SPXW", fecha:f.fecha, d30:f.d30}));
const v = pasarBarrera(fh, f=>f.d30, { pruebas: 4904, nMinimo: 200, maxPorTicker: 1.01 });
console.log(informe(v, "distancia a la MA30 como ordenador del P&L diario"));
const dentro=filas.filter(R).map(x=>x.pl), fuera=filas.filter(x=>!R(x)).map(x=>x.pl);
console.log(`\n  t de Welch dentro vs fuera: ${tWelch(dentro,fuera).toFixed(2)} (listón ${listonT(4904)})`);
const pot = potencia(fh, 0.150);
console.log(`  potencia: ${pot.mensaje}`);

// ═══ 4 · ¿DEPENDE DE LA HORA DE ENTRADA O DEL ANCHO? — no se puede medir aquí, se DICE ═══
console.log(`\n═══ 4 · LO QUE NO SE HA MEDIDO (y por qué) ═══`);
console.log("  · otras horas de entrada y otros anchos de ala: la señal es de CIERRES DIARIOS, así que");
console.log("    no cambia con la hora; pero el P&L sí. No está medido aquí. Se dice, no se rellena.");
console.log("  · el colateral: $5.000 por cóndor contra el valor REAL de la cartera de cada día:");
const hood=new Map(JSON.parse(readFileSync("scripts/cache-theta/HOOD_bars_20201122_20270308.json","utf8")).map(b=>[b.time,b.close]));
let uh=null; const hd=d=>{if(hood.has(d))uh=hood.get(d);return uh??18.44;};
let apretado=0, minCart=Infinity, fMin="";
for(const d of filas){ const cart=7977+500*hd(d.fecha); if(cart<minCart){minCart=cart;fMin=d.fecha;} if(R(d)&&cart<5000*2) apretado++; }
console.log(`    cartera más pequeña de los 4,6 años: ${eur(minCart)} el ${fMin} (HOOD a $${hd(fMin)})`);
console.log(`    días operados en que la cartera no llegaba a cubrir DOS cóndores: ${apretado}`);
console.log(`    → con la cartera de 2022 el colateral por sí solo ya limitaba a 1-2 contratos, sin contar pérdidas.`);
