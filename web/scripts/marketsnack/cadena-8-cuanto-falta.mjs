// PANEL CADENA-STRIKE · paso 8 — CUÁNTO FALTA PARA PODER JUZGAR LA REGLA.
// No mide si gana (con 1-2 fotos es imposible). Mide cuántas señales da al día y traduce
// eso a MESES DE CRON, distinguiendo eventos de n EFECTIVA.
import fs from "node:fs"; import zlib from "node:zlib"; import path from "node:path";

const DIA = process.argv[2] ?? "2026-08-20";
const DIRC = `scripts/cache-theta/marketsnack/aux/cadenas/${DIA}`;
const hoyMs = Date.parse(DIA+"T00:00:00Z");

const precio={};
for(const f of fs.readdirSync("scripts/cache-theta/cierres")){
  const j=JSON.parse(fs.readFileSync(`scripts/cache-theta/cierres/${f}`,"utf8"));
  const ks=Object.keys(j).sort(); precio[f.replace(".json","")]=j[ks[ks.length-1]];
}

const filas=[];
for(const f of fs.readdirSync(DIRC)){
  const T=f.replace(/-\d{4}-\d{2}-\d{2}\.json\.gz$/,"");
  for(const c of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIRC,f))).toString())){
    const p=c.premium_traded??0; if(p<=0) continue;
    const b=c.premium_breakdown??{},l=c.legs_premium??{};
    const S=precio[T]; if(S==null) continue;
    const dte=Math.round((Date.parse(c.expiration+"T00:00:00Z")-hoyMs)/86400000);
    const otm=c.type==="call"?(c.strike-S)/S:(S-c.strike)/S;
    filas.push({T,dte,otm,prima:p,desq:((b.ask??0)-(b.bid??0))/p,pSingle:(l.single??0)/p,
      bid:c.last_quote?.bid??0,ask:c.last_quote?.ask??0});
  }
}
const sen=filas.filter(r=>r.dte>=55&&r.dte<=125&&r.otm>=0.03&&r.otm<=0.08
  &&r.prima>=250000&&r.pSingle>=0.80&&r.ask>0&&(r.ask-r.bid)/((r.ask+r.bid)/2)<=0.15
  &&Math.abs(r.desq)>=0.40);

const tickersCubiertos=new Set(fs.readdirSync(DIRC).map(f=>f.replace(/-\d{4}-\d{2}-\d{2}\.json\.gz$/,""))).size;
const conPrecio=new Set(filas.map(r=>r.T)).size;
const dist=new Set(sen.map(r=>r.T));
console.log(`═══ ${DIA} · universo ${tickersCubiertos} tickers bajados · ${conPrecio} con cierre en disco ═══\n`);
console.log(`   señales de la regla en UN día : ${sen.length}`);
console.log(`   tickers distintos que disparan: ${dist.size}  →  ${[...dist].join(" ")}`);
const coste=sen.map(r=>r.ask*100);
if(coste.length){
  const s=[...coste].sort((a,b)=>a-b);
  console.log(`   coste de 1 contrato al ASK   : mediana $${s[Math.floor(s.length/2)].toFixed(0)} · rango $${s[0].toFixed(0)}–$${s[s.length-1].toFixed(0)}`);
}

console.log(`\n═══ EVENTOS vs n EFECTIVA — la diferencia que decide los meses ═══`);
const HOLD=23, DIASMES=21;
const ventanasMes=DIASMES/HOLD;
console.log(`   tenencia ${HOLD} días → ventanas INDEPENDIENTES por mes: ${ventanasMes.toFixed(2)}`);
console.log(`   dentro de una ventana, las señales del mismo ticker son LA MISMA APUESTA (mismo`);
console.log(`   movimiento del subyacente). La unidad independiente es TICKER × VENTANA.\n`);
const porMes = ventanasMes * dist.size;
console.log(`   n efectiva por mes (ticker×ventana)     : ${porMes.toFixed(1)}`);
for(const n of [100,200]) console.log(`   meses de cron para n efectiva = ${n}      : ${(n/porMes).toFixed(1)}`);
console.log(`\n   Y AÚN ASÍ eso es optimista: los tickers están correlacionados entre sí. Contando`);
console.log(`   racimos de verdad independientes (índices · megacap tech · semis · resto) ≈ 4:`);
const porMesCons = ventanasMes * 4;
for(const n of [100,200]) console.log(`   meses para n efectiva = ${n} (racimos)   : ${(n/porMesCons).toFixed(1)}`);

console.log(`\n═══ CÓMO ACORTARLO ═══`);
for(const [et,h,t] of [["tal cual (tenencia 23d)",23,dist.size],
                       ["tenencia 10 días",10,dist.size],
                       ["tenencia 10d + universo ×2",10,dist.size*2]]){
  const pm=(DIASMES/h)*t;
  console.log(`   ${et.padEnd(30)} n efectiva/mes ${pm.toFixed(1).padStart(5)}  →  n=200 en ${(200/pm).toFixed(1)} meses`);
}
console.log(`\n   (acortar la tenencia SUBE el peaje: los 5,2% del rincón están medidos a ~23 días.`);
console.log(`    Hay que volver a medir el peaje a 10 días antes de dar por buena esa vía.)`);
console.log(`\n   disco: ~${(fs.readdirSync(DIRC).reduce((s,f)=>s+fs.statSync(path.join(DIRC,f)).size,0)/1048576).toFixed(1)} MB/día → ${(fs.readdirSync(DIRC).reduce((s,f)=>s+fs.statSync(path.join(DIRC,f)).size,0)/1048576*21/1024).toFixed(2)} GB/año. No es una restricción.`);
