// PANEL SUBYACENTE-GAMMA · ¿CUÁNTO PAGA, EN DÓLARES, CON PRECIOS REALES?
//
// El único superviviente: centroMny (dónde se sienta la gamma del flujo respecto al precio) separa
// el movimiento REALIZADO frente al IMPLÍCITO del día siguiente. Alto = se mueve MENOS de lo que
// pide su implícita → vender volatilidad. Bajo = se mueve MÁS → comprarla.
//
// El vehículo de una señal de AMPLITUD no es la acción: es un CONO (straddle). Y aquí se puede
// poner precio de verdad, sin un solo número de modelo:
//   · entrada: cierre del día D, cadena EOD real de ThetaData → se VENDE al BID, se COMPRA al ASK
//   · salida:  cierre del día D+1, misma cadena → se recompra al ASK, se vende al BID
//   · Black-Scholes NO aparece por ningún lado. El peaje de la horquilla va contado dos veces.
//
// LÍMITE QUE HAY QUE DECIR: las cadenas en disco son de 28 tickers grandes y llegan al 2026-08-06.
// La señal se calcula sobre el universo COMPLETO de cada día (60-90 símbolos) y sólo se opera el
// subconjunto que tiene cadena. Eso no cambia la señal, pero reduce la muestra y la hace de valores
// grandes y líquidos.
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
import { tWelch, listonT } from "../../lib/barreraHallazgos.ts";

const CDIR="scripts/cache-theta/cadenas";
const CH="scripts/cache-theta/marketsnack/aux/chart-all";
const CUENTA=56389;
const P5=JSON.parse(fs.readFileSync("scripts/marketsnack/ug-5-panel.json","utf8"));
const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:0;
const sd=(v)=>{ if(v.length<2) return 0; const m=media(v); return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1)); };
const tU=(v)=>v.length>2&&sd(v)>0?media(v)/(sd(v)/Math.sqrt(v.length)):0;

// calendario de días hábiles (de las barras de SPY)
const spy=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CH,"SPY.json.gz"))).toString("utf8")).data;
const CAL=spy.map(p=>p.t.slice(0,10)); const iCal=new Map(CAL.map((d,i)=>[d,i]));
const siguiente=(d)=>{ const i=iCal.get(d); return i!=null&&i+1<CAL.length?CAL[i+1]:null; };
const cierreDe=(T,d)=>{ const p=path.join(CH,`${T}.json.gz`); if(!fs.existsSync(p)) return null;
  const s=JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8")).data;
  const r=s.find(x=>x.t.slice(0,10)===d); return r?r.v:null; };

const conCadena=new Set(fs.readdirSync(CDIR).map(f=>f.split("_d")[0]));
console.log(`tickers con cadena real en disco: ${conCadena.size}`);
const cargar=(T,d)=>{ const f=`${CDIR}/${T}_d${d.replace(/-/g,"")}.json`;
  if(!fs.existsSync(f)) return null; try{ return JSON.parse(fs.readFileSync(f,"utf8")); }catch{ return null; } };

// elige vencimiento (entre 5 y 15 días naturales) y el strike más cercano al precio
function cono(cad, px, dia){
  if(!cad) return null;
  const d0=Date.parse(dia+"T00:00:00Z");
  const exps=Object.keys(cad).map(e=>({e, dte:(Date.parse(`${e.slice(0,4)}-${e.slice(4,6)}-${e.slice(6,8)}T00:00:00Z`)-d0)/86400e3}))
    .filter(x=>x.dte>=5&&x.dte<=15).sort((a,b)=>a.dte-b.dte);
  if(!exps.length) return null;
  const exp=exps[0].e, filas=cad[exp];
  let mejor=null;
  for(const k of Object.keys(filas)){
    const [Ks,right]=k.split("|"); const K=Number(Ks); if(!(K>0)) continue;
    if(right!=="C") continue;
    if(!filas[`${Ks}|P`]) continue;
    const d=Math.abs(K-px);
    if(!mejor||d<mejor.d) mejor={K,Ks,d};
  }
  if(!mejor||mejor.d/px>0.03) return null;
  const c=filas[`${mejor.Ks}|C`], p=filas[`${mejor.Ks}|P`];
  if(!c||!p||!(c[0]>0)||!(c[1]>0)||!(p[0]>0)||!(p[1]>0)) return null;
  return { exp, K:mejor.K, dte:exps[0].dte, bid:c[0]+p[0], ask:c[1]+p[1], cB:c[0],cA:c[1],pB:p[0],pA:p[1] };
}

// ── construir las operaciones ────────────────────────────────────────────────────────────────
const OPS={};
for(const et of Object.keys(P5)){
  const P=P5[et];
  const porDia=new Map();
  for(const f of P){ let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push(f); }
  const ops=[];
  let sinCadD=0, sinCadD1=0, sinCono=0, sinExp=0;
  for(const [dia,g] of [...porDia].sort()){
    if(g.length<20) continue;
    const d1=siguiente(dia); if(!d1) continue;
    const o=[...g].sort((a,b)=>a.centroMny-b.centroMny), k=Math.floor(o.length/3);
    if(k<5) continue;
    const marca=new Map();
    o.slice(0,k).forEach(f=>marca.set(f.ticker,"bajo"));
    o.slice(-k).forEach(f=>marca.set(f.ticker,"alto"));
    for(const f of g){
      const lado=marca.get(f.ticker); if(!lado) continue;
      if(!conCadena.has(f.ticker)) continue;
      const cadD=cargar(f.ticker,dia); if(!cadD){ sinCadD++; continue; }
      const cadD1=cargar(f.ticker,d1); if(!cadD1){ sinCadD1++; continue; }
      const px=f.cierreD; if(!(px>0)) continue;
      const e=cono(cadD,px,dia); if(!e){ sinCono++; continue; }
      const f1=cadD1[e.exp]; if(!f1){ sinExp++; continue; }
      const cs=f1[`${e.K}|C`]??f1[`${e.K.toFixed(1)}|C`], ps=f1[`${e.K}|P`]??f1[`${e.K.toFixed(1)}|P`];
      if(!cs||!ps||!(cs[0]>0)||!(cs[1]>0)||!(ps[0]>0)||!(ps[1]>0)){ sinExp++; continue; }
      const salidaAsk=cs[1]+ps[1], salidaBid=cs[0]+ps[0];
      const medioE=(e.bid+e.ask)/2, medioS=(salidaAsk+salidaBid)/2;
      ops.push({ ticker:f.ticker, fecha:dia, lado, dte:e.dte, K:e.K, px,
        // VENDER el cono: se cobra el BID, se recompra al ASK. En dólares por contrato.
        vender: (e.bid - salidaAsk)*100,
        // COMPRAR el cono: se paga el ASK, se vende al BID.
        comprar: (salidaBid - e.ask)*100,
        // referencia SIN peaje (medio a medio) — NO es un resultado, sirve para ver qué se come la horquilla
        vender_sinPeaje: (medioE - medioS)*100,
        horquillaEntrada: (e.ask-e.bid)/medioE, prima: medioE*100,
        rSub: (cierreDe(f.ticker,d1)??px)/px-1 });
    }
  }
  OPS[et]=ops;
  console.log(`corte ${et}: ${ops.length} conos reales · ${new Set(ops.map(o=>o.fecha)).size} días · ${new Set(ops.map(o=>o.ticker)).size} tickers` +
              `  (descartes: sin cadena D ${sinCadD}, sin cadena D+1 ${sinCadD1}, sin strike a ≤3% ${sinCono}, sin el mismo contrato en D+1 ${sinExp})`);
}

// ── resultados ───────────────────────────────────────────────────────────────────────────────
for(const et of Object.keys(OPS)){
  const ops=OPS[et]; if(!ops.length) continue;
  const alto=ops.filter(o=>o.lado==="alto"), bajo=ops.filter(o=>o.lado==="bajo");
  console.log(`\n═════ corte ${et} ET · CONO REAL a un día · ${ops.length} operaciones ═════`);
  console.log(`  horquilla de entrada del cono: mediana ${(100*[...ops.map(o=>o.horquillaEntrada)].sort((a,b)=>a-b)[Math.floor(ops.length/2)]).toFixed(1)}% de la prima · prima media $${media(ops.map(o=>o.prima)).toFixed(0)} por contrato · DTE mediano ${[...ops.map(o=>o.dte)].sort((a,b)=>a-b)[Math.floor(ops.length/2)]} días`);
  console.log(`  ¿separa el movimiento? |retorno| del subyacente D→D+1: tercio ALTO ${(100*media(alto.map(o=>Math.abs(o.rSub)))).toFixed(2)}% vs BAJO ${(100*media(bajo.map(o=>Math.abs(o.rSub)))).toFixed(2)}%  t=${tWelch(bajo.map(o=>Math.abs(o.rSub)),alto.map(o=>Math.abs(o.rSub))).toFixed(2)}`);

  const filas=[
    ["VENDER el cono en el tercio ALTO (la señal)", alto.map(o=>o.vender)],
    ["COMPRAR el cono en el tercio BAJO (la señal)", bajo.map(o=>o.comprar)],
    ["— control: vender el cono en el tercio BAJO", bajo.map(o=>o.vender)],
    ["— control: comprar el cono en el tercio ALTO", alto.map(o=>o.comprar)],
    ["— referencia SIN peaje: vender ALTO a precio medio", alto.map(o=>o.vender_sinPeaje)],
    ["— referencia SIN peaje: vender BAJO a precio medio", bajo.map(o=>o.vender_sinPeaje)],
  ];
  for(const [nom,v] of filas){
    if(v.length<20){ console.log(`  ${nom.padEnd(50)} muestra ${v.length}`); continue; }
    console.log(`  ${nom.padEnd(50)} n=${String(v.length).padStart(4)} · $${media(v).toFixed(2).padStart(8)}/contrato · t=${tU(v).toFixed(2).padStart(6)} · ganan ${(100*v.filter(x=>x>0).length/v.length).toFixed(0)}%`);
  }
  // combinación: vender ALTO + comprar BAJO, un contrato de cada por día
  const porDia=new Map();
  for(const o of ops){ let g=porDia.get(o.fecha); if(!g){g={a:[],b:[]};porDia.set(o.fecha,g);} (o.lado==="alto"?g.a:g.b).push(o); }
  const dias=[], soloVender=[];
  for(const [d,g] of [...porDia].sort()){
    if(!g.a.length||!g.b.length) continue;
    dias.push(media(g.a.map(o=>o.vender))+media(g.b.map(o=>o.comprar)));
    soloVender.push(media(g.a.map(o=>o.vender)));
  }
  if(dias.length>2){
    console.log(`\n  CARTERA (1 cono vendido en el tercio alto + 1 comprado en el bajo, cada día):`);
    console.log(`    $${media(dias).toFixed(2)}/día por par · t=${tU(dias).toFixed(2)} · ${dias.filter(x=>x>0).length}/${dias.length} días positivos`);
    console.log(`    → ${(media(dias)*250).toFixed(0)} $/año con UN par abierto cada día · sobre $${CUENTA.toLocaleString("es-ES")} = ${(media(dias)*250/CUENTA*100).toFixed(2)}%/año`);
    const k3=Math.floor(dias.length/3);
    console.log(`    tercios del período: ${[dias.slice(0,k3),dias.slice(k3,2*k3),dias.slice(2*k3)].map(g=>"$"+media(g).toFixed(2)).join(" · ")}`);
    console.log(`  SÓLO VENDER el tercio alto: $${media(soloVender).toFixed(2)}/día · t=${tU(soloVender).toFixed(2)} → ${(media(soloVender)*250).toFixed(0)} $/año por contrato`);
  }
}
fs.writeFileSync("scripts/marketsnack/ug-7-salida.json",JSON.stringify(OPS,null,1));
console.log(`\n✓ ug-7-salida.json`);
