// EL OI LEJANO, CONVERTIDO EN DINERO.
//
// La separación existe (27% de meses ganadores en el tercio alto contra 18% en el bajo) y sobrevive
// a quitar las filas contaminadas. Lo que nunca se hizo es lo que Lester pide siempre:
// **¿cuánto dinero deja, en una cuenta de verdad, contra comprar SPY y dormir?**
//
// DOS COSAS QUE LA VERSIÓN ANTERIOR NO TENÍA:
//  1) EL TERCIL SE CALCULA SÓLO CON EL PASADO — los 24 meses anteriores. Conocer los cortes de
//     toda la historia por adelantado es meter el futuro por la puerta de atrás.
//  2) Una cuenta que COMPONE, con el dinero atado hasta que vence el contrato.
//
// El múltiplo ya trae el peaje dentro (compra al ask, venta al bid, topado a 50x) y los splits
// ajustados — comprobado en puente-se-veia-venir.mjs líneas 147-177.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";
import { RAIZ } from "./raiz.mjs";
const $=(x)=>(x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
const F=JSON.parse(readFileSync(join(RAIZ,"scripts","puente-filas.json"),"utf8"));
const mesN=(m)=>(+m.slice(0,4))*12+(+m.slice(4,6))-1;
const nMes=(n)=>String(Math.floor(n/12))+String(n%12+1).padStart(2,"0");
for(const r of F) r._n=mesN(r.mes);
const MESES=[...new Set(F.map(r=>r._n))].sort((a,b)=>a-b);
const PORMES=new Map(); for(const r of F){ if(!PORMES.has(r._n)) PORMES.set(r._n,[]); PORMES.get(r._n).push(r); }

console.log(`\n  ═══ AUDITORÍA ═══\n`);
console.log(`  filas ....................... ${F.length}`);
console.log(`  meses ....................... ${MESES.length}  (${nMes(MESES[0])} a ${nMes(MESES[MESES.length-1])})`);
console.log(`  tickers ..................... ${new Set(F.map(r=>r.ticker)).size}`);
console.log(`  el múltiplo trae el peaje ... SÍ (ask → bid, topado a 50x, splits ajustados)`);

/** Corte del tercil alto usando SÓLO los 24 meses anteriores. */
function corte(n,ventana=24){
  const v=[];
  for(let k=n-ventana;k<n;k++){ const L=PORMES.get(k); if(L) for(const r of L) v.push(r.oiLejos); }
  if(v.length<100) return null;
  v.sort((a,b)=>a-b);
  return v[Math.floor(v.length*2/3)];
}
/** Simula una cuenta. `pctMes` = qué fracción del capital se apuesta cada mes. */
function simular({pctMes=0.05,meses=15,soloAlto=true,ventana=24,capital=60000}={}){
  let caja=capital, invertido=0, pico=capital, minCaja=capital;
  const pendientes=[];                       // {vence, dinero}
  const hist=[]; let apuestas=0, ganadas=0;
  for(const n of MESES){
    for(let i=pendientes.length-1;i>=0;i--) if(pendientes[i].vence<=n){ caja+=pendientes[i].dinero; invertido-=pendientes[i].coste; pendientes.splice(i,1); }
    const c=corte(n,ventana);
    if(c==null) { hist.push({n,valor:caja+invertido}); continue; }
    const L=(PORMES.get(n)||[]).filter(r=>soloAlto?r.oiLejos>=c:true);
    if(L.length){
      const total=(caja+invertido)*pctMes;
      const cada=Math.min(total,caja)/L.length;
      if(cada>0){
        for(const r of L){ caja-=cada; invertido+=cada; apuestas++;
          if(r.resultado>1) ganadas++;
          pendientes.push({vence:n+meses,dinero:cada*r.resultado,coste:cada}); }
      }
    }
    const valor=caja+invertido;
    if(valor>pico) pico=valor;
    if(caja<minCaja) minCaja=caja;
    hist.push({n,valor});
  }
  for(const p of pendientes) caja+=p.dinero;
  const anos=(MESES[MESES.length-1]-MESES[0])/12;
  let peor=0; let mx=capital;
  for(const h of hist){ if(h.valor>mx) mx=h.valor; const dd=1-h.valor/mx; if(dd>peor) peor=dd; }
  return {final:caja,anual:100*(Math.pow(Math.max(caja,1)/capital,1/anos)-1),apuestas,ganadas,caida:100*peor,anos};
}
console.log(`\n  ═══ ¿CUÁNTO DINERO DEJA? — cuenta de $60,000, tercil calculado sólo con el pasado ═══\n`);
console.log(`  ${"regla".padEnd(34)} ${"acaba con".padStart(14)} ${"al año".padStart(8)} ${"apuestas".padStart(9)} ${"ganan".padStart(7)} ${"peor caída".padStart(11)}`);
for(const pct of [0.02,0.05,0.10,0.20]){
  const a=simular({pctMes:pct,soloAlto:true});
  console.log(`  ${(`tercio ALTO · ${(100*pct).toFixed(0)}% al mes`).padEnd(34)} ${$(a.final).padStart(14)} ${(a.anual.toFixed(1)+"%").padStart(8)} ${String(a.apuestas).padStart(9)} ${((100*a.ganadas/a.apuestas).toFixed(0)+"%").padStart(7)} ${("−"+a.caida.toFixed(0)+"%").padStart(11)}`);
}
console.log("");
for(const pct of [0.02,0.05,0.10,0.20]){
  const b=simular({pctMes:pct,soloAlto:false});
  console.log(`  ${(`CONTROL: TODAS · ${(100*pct).toFixed(0)}% al mes`).padEnd(34)} ${$(b.final).padStart(14)} ${(b.anual.toFixed(1)+"%").padStart(8)} ${String(b.apuestas).padStart(9)} ${((100*b.ganadas/b.apuestas).toFixed(0)+"%").padStart(7)} ${("−"+b.caida.toFixed(0)+"%").padStart(11)}`);
}
console.log(`\n  ═══ ¿AGUANTA SI CAMBIO LOS SUPUESTOS? ═══\n`);
console.log(`  ${"supuesto".padEnd(34)} ${"acaba con".padStart(14)} ${"al año".padStart(8)}`);
for(const m of [12,15,18,24]){ const a=simular({pctMes:0.05,meses:m});
  console.log(`  ${(`el dinero vuelve a los ${m} meses`).padEnd(34)} ${$(a.final).padStart(14)} ${(a.anual.toFixed(1)+"%").padStart(8)}`); }
for(const v of [12,24,36,48]){ const a=simular({pctMes:0.05,ventana:v});
  console.log(`  ${(`tercil con ${v} meses de historia`).padEnd(34)} ${$(a.final).padStart(14)} ${(a.anual.toFixed(1)+"%").padStart(8)}`); }
console.log(`\n  ═══ EL LISTÓN ═══\n`);
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
const d0=nMes(MESES[0])+"01", d1=nMes(MESES[MESES.length-1])+"28";
const ds=cad.dias("SPY").filter(d=>d>=d0&&d<=d1);
if(ds.length>10){
  const a=spotOk(cad.leer("SPY",ds[0]),ds[0]), b=spotOk(cad.leer("SPY",ds[ds.length-1]),ds[ds.length-1]);
  const anos=(MESES[MESES.length-1]-MESES[0])/12;
  console.log(`  $60,000 en SPY de ${ds[0]} a ${ds[ds.length-1]}: ${$(60000*b/a)}  (${(100*(Math.pow(b/a,1/anos)-1)).toFixed(1)}% al año)`);
}
console.log("");
