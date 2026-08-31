// LA CUENTA CON ACCIONES — el 12x, sin tocar una sola opción.
//
// La señal: golpe >$500,000 al ask, 12 veces o más el OI de la víspera. Agrupado por ticker+día+lado.
// La operación: comprar la ACCIÓN si el golpe fue en calls, venderla en corto si fue en puts.
// Entrada al cierre del día siguiente al golpe, salida al cierre N días después. Los dos precios
// son conocidos en su momento; ningún tramo con salto >25% (splits y spots malos) entra.
//
// ⚠️ ROBINHOOD NO PERMITE VENDER ACCIONES EN CORTO. Por eso se mide también la versión SÓLO LARGO,
// que es lo único que Lester podría ejecutar tal cual.
//
// COSTE: las acciones no tienen horquilla que valga en estos nombres, pero no es cero. Se prueba
// con 0, 5 y 10 puntos básicos de ida y vuelta.
import { cargar } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
const $=(x)=>(x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
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
function tramo(tk,d,n){ const ds=cad.dias(tk); const i=ds.indexOf(d); if(i<0||i+n>=ds.length) return null;
  let prev=spotDe(tk,ds[i]); if(!(prev>0)) return null; const a=prev;
  for(let k=i+1;k<=i+n;k++){ const s=spotDe(tk,ds[k]); if(!(s>0)) return null;
    if(Math.abs(s/prev-1)>0.25) return null; prev=s; }
  return {r:prev/a-1, salida:ds[i+n]}; }

// ── las señales ──
const SIG=new Map();
for(const [y,M] of AÑOS) for(const f of cargar(M)){
  const k=`${f.tk}|${f.dC}|${f.l}`; const x=SIG.get(k);
  if(x){ x.prima+=f.prima; if(f.vsOI>x.vsOI) x.vsOI=f.vsOI; }
  else SIG.set(k,{tk:f.tk,dC:f.dC,l:f.l,y,prima:f.prima,vsOI:f.vsOI});
}
const TK=["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY","TSLA"];
const S=[...SIG.values()].filter(x=>x.vsOI>=12&&TK.includes(x.tk)).sort((a,b)=>a.dC.localeCompare(b.dC));
console.log(`\n  ═══ AUDITORÍA ═══\n`);
console.log(`  señales 12x .................. ${S.length}`);
console.log(`  largas (calls) ${S.filter(x=>x.l==="C").length}  ·  cortas (puts) ${S.filter(x=>x.l==="P").length}`);
console.log(`  ⚠ Robinhood NO permite vender acciones en corto — la versión larga es la ejecutable`);

/** Cuenta real: N huecos, cada uno un % del capital, entrada y salida al cierre. */
function cuenta({dias=5,pct=0.25,maxAb=4,coste=0.0005,capital=60000,soloLargo=false}={}){
  const L=soloLargo?S.filter(x=>x.l==="C"):S;
  let caja=capital, ab=[], tomadas=0, ganadas=0, pico=capital, peor=0;
  const eventos=new Map();
  for(const x of L){ const t=tramo(x.tk,x.dC,dias); if(!t) continue;
    if(!eventos.has(x.dC)) eventos.set(x.dC,[]); eventos.get(x.dC).push({...x,...t}); }
  const fechas=[...new Set([...eventos.keys(),...[...eventos.values()].flat().map(e=>e.salida)])].sort();
  for(const hoy of fechas){
    for(let i=ab.length-1;i>=0;i--) if(ab[i].salida<=hoy){
      const e=ab[i]; const lado=e.l==="P"?-1:1;
      const bruto=e.dinero*(1+lado*e.r);
      caja+=bruto-e.dinero*coste;                       // ida y vuelta del coste
      if(lado*e.r>coste) ganadas++;
      ab.splice(i,1);
    }
    for(const e of (eventos.get(hoy)||[])){
      if(ab.length>=maxAb) continue;
      const dinero=Math.min((caja+ab.reduce((a,b)=>a+b.dinero,0))*pct,caja);
      if(dinero<100) continue;
      caja-=dinero; ab.push({...e,dinero}); tomadas++;
    }
    const valor=caja+ab.reduce((a,b)=>a+b.dinero,0);
    if(valor>pico) pico=valor;
    const dd=1-valor/pico; if(dd>peor) peor=dd;
  }
  for(const e of ab){ const lado=e.l==="P"?-1:1; caja+=e.dinero*(1+lado*e.r)-e.dinero*coste; }
  const anos=5.63;
  return {final:caja,anual:100*(Math.pow(Math.max(caja,1)/capital,1/anos)-1),tomadas,ganadas,caida:100*peor};
}
console.log(`\n  ═══ LARGO Y CORTO (necesita cuenta que permita vender en corto) ═══\n`);
console.log(`  ${"regla".padEnd(30)} ${"acaba con".padStart(13)} ${"al año".padStart(8)} ${"ops".padStart(6)} ${"ganan".padStart(7)} ${"peor caída".padStart(11)}`);
for(const dias of [5,10])
  for(const [pct,maxAb] of [[0.25,4],[0.125,8],[0.0625,16]]){
    const q=cuenta({dias,pct,maxAb});
    console.log(`  ${(`${dias} días · ${(100*pct).toFixed(0)}% × ${maxAb} huecos`).padEnd(30)} ${$(q.final).padStart(13)} ${(q.anual.toFixed(1)+"%").padStart(8)} ${String(q.tomadas).padStart(6)} ${((100*q.ganadas/q.tomadas).toFixed(0)+"%").padStart(7)} ${("−"+q.caida.toFixed(0)+"%").padStart(11)}`);
  }
console.log(`\n  ═══ SÓLO LARGO — lo único ejecutable en Robinhood ═══\n`);
console.log(`  ${"regla".padEnd(30)} ${"acaba con".padStart(13)} ${"al año".padStart(8)} ${"ops".padStart(6)} ${"ganan".padStart(7)} ${"peor caída".padStart(11)}`);
for(const dias of [5,10])
  for(const [pct,maxAb] of [[0.25,4],[0.125,8],[0.0625,16]]){
    const q=cuenta({dias,pct,maxAb,soloLargo:true});
    console.log(`  ${(`${dias} días · ${(100*pct).toFixed(0)}% × ${maxAb} huecos`).padEnd(30)} ${$(q.final).padStart(13)} ${(q.anual.toFixed(1)+"%").padStart(8)} ${String(q.tomadas).padStart(6)} ${((100*q.ganadas/q.tomadas).toFixed(0)+"%").padStart(7)} ${("−"+q.caida.toFixed(0)+"%").padStart(11)}`);
  }
console.log(`\n  ═══ ¿AGUANTA SI EL COSTE ES MAYOR? (5 días · 25% × 4) ═══\n`);
for(const c of [0,0.0005,0.001,0.002,0.005]){
  const a=cuenta({dias:5,coste:c}), b=cuenta({dias:5,coste:c,soloLargo:true});
  console.log(`  coste ida y vuelta ${(100*c).toFixed(2).padStart(5)}%:  largo+corto ${(a.anual.toFixed(1)+"%").padStart(7)}   ·   sólo largo ${(b.anual.toFixed(1)+"%").padStart(7)}`);
}
console.log(`\n  ═══ EL LISTÓN ═══\n`);
const ds=cad.dias("SPY").filter(d=>d>="20210101"&&d<="20260819");
const a=spotDe("SPY",ds[0]), b=spotDe("SPY",ds[ds.length-1]);
console.log(`  $60,000 en SPY, 2021-01-04 → 2026-08-19:  ${$(60000*b/a)}   (${(100*(Math.pow(b/a,1/5.63)-1)).toFixed(1)}% al año)`);
console.log(`  (sin dividendos, que sumarían ~1.3% más)\n`);
