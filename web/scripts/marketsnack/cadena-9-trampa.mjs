// PANEL CADENA-STRIKE · paso 9 — LA TRAMPA QUE MATÓ TODO LO ANTERIOR.
// El catálogo lo dejó escrito: "la cinta es un DETECTOR DE LIQUIDEZ disfrazado de detector de
// opinión". Si los filtros de la regla (single≥80% y desequilibrio fuerte) sólo seleccionan
// contratos de horquilla estrecha, la regla volverá a medir peaje, no elección.
// Se comprueba ANTES de gastar meses de cron.
import fs from "node:fs"; import zlib from "node:zlib"; import path from "node:path";

const DIA=process.argv[2]??"2026-08-20";
const DIRC=`scripts/cache-theta/marketsnack/aux/cadenas/${DIA}`;
const hoyMs=Date.parse(DIA+"T00:00:00Z");
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
    const bid=c.last_quote?.bid??0, ask=c.last_quote?.ask??0; if(ask<=0) continue;
    filas.push({T,dte,otm:c.type==="call"?(c.strike-S)/S:(S-c.strike)/S,prima:p,
      desq:((b.ask??0)-(b.bid??0))/p,pSingle:(l.single??0)/p,
      horq:(ask-bid)/((ask+bid)/2), oi:c.open_interest??0, vol:c.volume??0});
  }
}
// el rincón barato, antes de aplicar los filtros de opinión
const base=filas.filter(r=>r.dte>=55&&r.dte<=125&&r.otm>=0.03&&r.otm<=0.08&&r.prima>=250000);
const med=(a)=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:NaN;};
console.log(`═══ ¿LOS FILTROS SELECCIONAN LIQUIDEZ? · rincón 3-8% OTM, 55-125d, ≥$250k · n=${base.length} ═══\n`);
console.log(`   grupo                              n    horquilla mediana   OI mediano   diferencia de peaje`);
const h0=med(base.map(r=>r.horq));
const grupos=[["TODO el rincón (referencia)",()=>true],
  ["single ≥80%",r=>r.pSingle>=0.80],
  ["single <80% (patas de spread)",r=>r.pSingle<0.80],
  ["|desequilibrio| ≥0,40",r=>Math.abs(r.desq)>=0.40],
  ["|desequilibrio| <0,40",r=>Math.abs(r.desq)<0.40],
  ["LA REGLA (single≥80 y |desq|≥0,40)",r=>r.pSingle>=0.80&&Math.abs(r.desq)>=0.40]];
for(const [n,f] of grupos){
  const g=base.filter(f); if(g.length<5){console.log(`   ${n.padEnd(34)} ${String(g.length).padStart(4)}   — muestra insuficiente`);continue;}
  const h=med(g.map(r=>r.horq));
  console.log(`   ${n.padEnd(34)} ${String(g.length).padStart(4)}   ${(100*h).toFixed(1).padStart(14)}%   ${med(g.map(r=>r.oi)).toFixed(0).padStart(10)}   ${((100*(h-h0))).toFixed(2).padStart(9)} pts`);
}
console.log(`\n   LECTURA: si "LA REGLA" tiene la horquilla MÁS ESTRECHA que el rincón entero, el`);
console.log(`   control obligatorio no es un contrato sorteado cualquiera — es un contrato sorteado`);
console.log(`   DE LA MISMA HORQUILLA. Es lo que borró el +3,49% del feed y borraría esto igual.`);
