// PANEL SUBYACENTE-GAMMA · LAS DOS PRUEBAS QUE SUELEN MATAR A ESTE TIPO DE HALLAZGO.
//
// Sobrevivió: centroMny (dónde está la gamma del flujo respecto al precio) separa el
// realizado/implícito a un día, y sobrevive incluso con la implícita LIMPIA (sólo contratos cerca
// del dinero, sin la sonrisa dentro). t=−5,25 y −8,08 en los dos cortes.
//
// Antes de llamarlo señal faltan dos cosas:
//   [1] ¿LO HACEN CUATRO EXPLOSIONES? El resultado tiene cola larga (máx 9 y 12 veces lo implícito
//       = movimientos de resultados trimestrales). Si el efecto es de la cola, se ve con el RANGO
//       transversal (0..1), que es inmune a los extremos. Si sobrevive al rango, es ancho.
//   [2] ¿ES DEL DÍA O DEL TICKER? Si sólo separa entre tickers, no es una señal que se observe:
//       es una propiedad fija de unos nombres ("las loterías son caras"), y eso ya lo cobra quien
//       vende prima siempre. La versión operable es "HOY este nombre está más arriba de lo suyo".
//       Se resta a la métrica su media de días ANTERIORES del mismo ticker.
import fs from "node:fs";
import { listonT, pasarBarrera, tWelch, potencia } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const PRUEBAS=124+16; const LISTON=listonT(PRUEBAS);
const P5=JSON.parse(fs.readFileSync("scripts/marketsnack/ug-5-panel.json","utf8"));
const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:0;
const sd=(v)=>{ if(v.length<2) return 0; const m=media(v); return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1)); };
const mediana=(v)=>{ const s=[...v].sort((a,b)=>a-b); return s.length?s[Math.floor(s.length/2)]:0; };

const R=[];
function prueba(nombre,filas,met,res){
  const f=filas.filter(x=>x[met]!=null&&x[res]!=null).map(x=>({pnl:x[res],ticker:x.ticker,fecha:x.fecha,m:x[met]}));
  if(f.length<200){ console.log(`  ${nombre.padEnd(58)} SIN MUESTRA (${f.length})`); return null; }
  const v=pasarBarrera(f,x=>x.m,{pruebas:PRUEBAS,nMinimo:200,maxPorTicker:0.2});
  R.push({nombre,n:f.length,sep:v.detalle.sep,t:v.detalle.t,pasa:v.pasa,motivos:v.motivos,
    tercios:v.detalle.tercios.map(x=>({p:x.periodo,sep:x.sep,t:x.t}))});
  console.log(`  ${v.pasa?"✅":"  "}${nombre.padEnd(56)} n=${String(f.length).padStart(5)} sep ${(v.detalle.sep??0).toFixed(4).padStart(9)} t=${(v.detalle.t??0).toFixed(2).padStart(6)} ${v.pasa?"PASA":v.motivos.slice(0,1).join("")}`);
  return v;
}

for(const et of Object.keys(P5)){
  const P=P5[et];
  // rango transversal del resultado dentro de cada día (inmune a la cola)
  const porDia=new Map();
  for(const f of P){ let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push(f); }
  for(const [d,g] of porDia){
    const v=g.filter(f=>f.atm_r1!=null).sort((a,b)=>a.atm_r1-b.atm_r1);
    v.forEach((f,i)=>{ f.rango_atm_r1 = v.length>1 ? i/(v.length-1)-0.5 : 0; });
    const w=g.filter(f=>f.atm_rIntra!=null).sort((a,b)=>a.atm_rIntra-b.atm_rIntra);
    w.forEach((f,i)=>{ f.rango_atm_rIntra = w.length>1 ? i/(w.length-1)-0.5 : 0; });
  }
  // métrica demediada por ticker con SÓLO días anteriores
  const porT=new Map();
  for(const f of P){ let g=porT.get(f.ticker); if(!g){g=[];porT.set(f.ticker,g);} g.push(f); }
  for(const [T,g] of porT){
    g.sort((a,b)=>a.fecha.localeCompare(b.fecha));
    const prev=[];
    for(const f of g){
      f.centroMnyDes = prev.length>=10 ? f.centroMny-media(prev) : null;
      prev.push(f.centroMny);
    }
  }

  console.log(`\n═════════ corte ${et} ET · listón |t| ≥ ${LISTON} (${PRUEBAS} pruebas acumuladas) ═════════`);
  radiografia(P.filter(f=>f.atm_r1!=null),["centroMny","centroMnyDes","atm_r1","rango_atm_r1"],`ug-6 · ${et}`,{maxNulos:0.6});

  console.log(`  [1] ¿LO HACE LA COLA? el mismo test con el resultado en RANGO transversal (0..1)`);
  prueba(`${et} centroMny → RANGO de realizado/implícita D+1`, P, "centroMny", "rango_atm_r1");
  prueba(`${et} centroMny → RANGO de realizado/implícita intradía`, P, "centroMny", "rango_atm_rIntra");
  {
    const f=P.filter(x=>x.centroMny!=null&&x.atm_r1!=null).sort((a,b)=>a.centroMny-b.centroMny);
    const k=Math.floor(f.length/3);
    const B=f.slice(0,k).map(x=>x.atm_r1), A=f.slice(-k).map(x=>x.atm_r1);
    console.log(`      medias  bajo ${media(B).toFixed(3)}  alto ${media(A).toFixed(3)}  · MEDIANAS  bajo ${mediana(B).toFixed(3)}  alto ${mediana(A).toFixed(3)}  (si la mediana no separa, era la cola)`);
    const w=(v,q)=>{ const s=[...v].sort((a,b)=>a-b); const lim=s[Math.floor(s.length*q)]; return v.map(x=>Math.min(x,lim)); };
    const todos=[...B,...A], lim95=[...todos].sort((a,b)=>a-b)[Math.floor(todos.length*0.95)];
    const Bw=B.map(x=>Math.min(x,lim95)), Aw=A.map(x=>Math.min(x,lim95));
    console.log(`      recortado al percentil 95 (${lim95.toFixed(2)}): bajo ${media(Bw).toFixed(3)} alto ${media(Aw).toFixed(3)} · sep ${(media(Aw)-media(Bw)).toFixed(3)} t=${tWelch(Aw,Bw).toFixed(2)}`);
  }

  console.log(`  [2] ¿ES DEL DÍA O DEL TICKER? métrica demediada con los días anteriores del propio ticker`);
  prueba(`${et} centroMnyDes → realizado/implícita D+1`, P, "centroMnyDes", "atm_r1");
  prueba(`${et} centroMnyDes → RANGO de realizado/implícita D+1`, P, "centroMnyDes", "rango_atm_r1");
  {
    // ¿cuánta de la varianza de centroMny es ENTRE tickers y cuánta DENTRO?
    const gm=media(P.map(f=>f.centroMny));
    let entre=0, dentro=0, n=0;
    for(const [T,g] of porT){ if(g.length<10) continue;
      const m=media(g.map(f=>f.centroMny));
      entre+=g.length*(m-gm)**2;
      for(const f of g) dentro+=(f.centroMny-m)**2;
      n+=g.length; }
    console.log(`      varianza de centroMny: ENTRE tickers ${(100*entre/(entre+dentro)).toFixed(1)}% · DENTRO del ticker ${(100*dentro/(entre+dentro)).toFixed(1)}%`);
  }
  console.log(`  [3] potencia del negativo de la versión operable`);
  {
    const f=P.filter(x=>x.centroMnyDes!=null&&x.atm_r1!=null).map(x=>({pnl:x.atm_r1,ticker:x.ticker,fecha:x.fecha}));
    if(f.length>200) console.log(`      ${potencia(f,0.15).mensaje}`);
  }
}
fs.writeFileSync("scripts/marketsnack/ug-6-salida.json",JSON.stringify({liston:LISTON,pruebas:PRUEBAS,R},null,1));
console.log(`\n✓ ug-6-salida.json`);
