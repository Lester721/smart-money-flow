// PANEL CADENA-STRIKE · paso 7 — ¿EL ΔOI PLANO ERA UN ARTEFACTO DEL PLAZO?
// Un contrato que vence hoy no puede subir su OI. Si el grupo "ASK manda" está lleno de
// 0DTE, el resultado del paso 6 no dice nada. Se parte por plazo antes de concluir.
import fs from "node:fs"; import zlib from "node:zlib"; import path from "node:path";
const A="2026-08-19", B="2026-08-20", hoyA=Date.parse(A+"T00:00:00Z");
function cargar(dia){const D=`scripts/cache-theta/marketsnack/aux/cadenas/${dia}`;const m=new Map();
 for(const f of fs.readdirSync(D))for(const c of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(D,f))).toString())){
  const p=c.premium_traded??0,b=c.premium_breakdown??{},l=c.legs_premium??{};
  m.set(c.symbol,{prima:p,oi:c.open_interest??0,vol:c.volume??0,
   desq:p>0?((b.ask??0)-(b.bid??0))/p:null,pSingle:p>0?(l.single??0)/p:null,
   T:f.split("-")[0],venc:c.expiration,dte:Math.round((Date.parse(c.expiration+"T00:00:00Z")-hoyA)/86400000)});}
 return m;}
const ma=cargar(A), mb=cargar(B);
const act=[...ma.keys()].filter(k=>mb.has(k)).map(k=>{const a=ma.get(k),b=mb.get(k);
  return {...a,dOI:b.oi-a.oi};}).filter(r=>r.prima>=250000&&r.desq!=null&&r.pSingle>=0.80);

console.log(`═══ ¿DÓNDE VIVE CADA GRUPO? — reparto por plazo ═══`);
console.log(`   grupo                        n   %0-2 días  %3-9 días  %≥10 días`);
const G=[["ASK manda (≥+0,40)",r=>r.desq>=0.40],["repartido",r=>Math.abs(r.desq)<0.40],["BID manda (≤−0,40)",r=>r.desq<=-0.40]];
for(const [n,f] of G){const g=act.filter(f);if(!g.length)continue;
 const c1=g.filter(r=>r.dte<=2).length,c2=g.filter(r=>r.dte>2&&r.dte<10).length,c3=g.filter(r=>r.dte>=10).length;
 console.log(`   ${n.padEnd(26)} ${String(g.length).padStart(4)}   ${(100*c1/g.length).toFixed(0).padStart(6)}%   ${(100*c2/g.length).toFixed(0).padStart(7)}%   ${(100*c3/g.length).toFixed(0).padStart(7)}%`);}

const med=(a)=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:0;};
for (const [et,filtro] of [["SÓLO ≥10 DÍAS DE PLAZO (el OI ya puede crecer)",r=>r.dte>=10],
                           ["sólo 0-2 días (donde el OI no significa nada)",r=>r.dte<=2]]) {
  const sub = act.filter(filtro);
  console.log(`\n═══ ${et} · n=${sub.length} ═══`);
  console.log(`   grupo                        n    ΔOI mediano   %ΔOI>0    ΔOI/volumen`);
  for(const [n,f] of G){const g=sub.filter(f);if(g.length<8){console.log(`   ${n.padEnd(26)} ${String(g.length).padStart(4)}   — muestra insuficiente`);continue;}
   console.log(`   ${n.padEnd(26)} ${String(g.length).padStart(4)}  ${med(g.map(r=>r.dOI)).toFixed(0).padStart(11)}   ${(100*g.filter(r=>r.dOI>0).length/g.length).toFixed(0).padStart(5)}%   ${(g.reduce((s,r)=>s+(r.vol?r.dOI/r.vol:0),0)/g.length).toFixed(2).padStart(11)}`);}
}
