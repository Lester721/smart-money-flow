// PANEL CADENA-STRIKE · paso 6 — LO ÚNICO QUE DOS DÍAS SÍ PUEDEN CONTESTAR:
//   (a) ¿el desequilibrio de un strike PERSISTE al día siguiente, o es un fogonazo?
//   (b) ¿el strike donde mandó el ASK ABRE posición (sube el OI) o la CIERRA?
// Si el ask-pesado no sube el OI, "compra agresiva" es mentira y la regla nace muerta.
import fs from "node:fs"; import zlib from "node:zlib"; import path from "node:path";

const A = "2026-08-19", B = "2026-08-20";
function cargar(dia) {
  const D = `scripts/cache-theta/marketsnack/aux/cadenas/${dia}`;
  const m = new Map();
  for (const f of fs.readdirSync(D)) {
    for (const c of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(D,f))).toString())) {
      const p=c.premium_traded??0, b=c.premium_breakdown??{}, l=c.legs_premium??{};
      m.set(c.symbol, { prima:p, oi:c.open_interest??0, vol:c.volume??0,
        desq: p>0 ? ((b.ask??0)-(b.bid??0))/p : null, pSingle: p>0 ? (l.single??0)/p : null,
        T:f.split("-")[0], venc:c.expiration, strike:c.strike, tipo:c.type });
    }
  }
  return m;
}
const ma = cargar(A), mb = cargar(B);
const comunes = [...ma.keys()].filter(k=>mb.has(k));
console.log(`═══ ${A} → ${B} · ${comunes.length.toLocaleString("es-ES")} contratos en AMBAS fotos ═══\n`);

// ── (b) EL OI ES EL JUEZ. El OI de la foto de B refleja la sesión de A (se publica al día siguiente).
const act = comunes.map(k=>{
  const a=ma.get(k), b=mb.get(k);
  return { ...a, oiA:a.oi, oiB:b.oi, dOI:b.oi-a.oi, desqB:b.desq, primaB:b.prima };
}).filter(r=>r.prima>=250000 && r.desq!=null && r.pSingle>=0.80);

console.log(`═══ (b) ¿ABRE O CIERRA? — contratos ≥$250k y single≥80% en ${A}: ${act.length} ═══`);
console.log(`   El OI que publica la foto de ${B} es el resultado de la sesión de ${A}.\n`);
console.log(`   grupo                          n    ΔOI mediano   %con ΔOI>0   ΔOI medio/volumen`);
const grupos = [["ASK manda (desq ≥ +0,40)", r=>r.desq>=0.40],
                ["repartido (|desq| < 0,40)", r=>Math.abs(r.desq)<0.40],
                ["BID manda (desq ≤ −0,40)", r=>r.desq<=-0.40]];
const med=(a)=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:0;};
for (const [n,f] of grupos) {
  const g = act.filter(f); if(!g.length) continue;
  const d = g.map(r=>r.dOI);
  const pos = g.filter(r=>r.dOI>0).length/g.length;
  const ratio = g.reduce((s,r)=>s+(r.vol? r.dOI/r.vol : 0),0)/g.length;
  console.log(`   ${n.padEnd(28)} ${String(g.length).padStart(4)}  ${med(d).toFixed(0).padStart(10)}   ${(100*pos).toFixed(0).padStart(8)}%   ${ratio.toFixed(2).padStart(14)}`);
}
console.log(`\n   LECTURA: si "ASK manda" sube el OI y "BID manda" lo baja, el campo `+"`side`"+` está midiendo`);
console.log(`   apertura de verdad y no ruido. Si los tres grupos dan lo mismo, el lado no significa nada.`);

// ── (a) ¿PERSISTE el desequilibrio?
const p = act.filter(r=>r.desqB!=null && r.primaB>=100000);
let n=0,sx=0,sy=0,sxx=0,syy=0,sxy=0;
for (const r of p){const x=r.desq,y=r.desqB;n++;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;}
const corr=(n*sxy-sx*sy)/Math.sqrt((n*sxx-sx*sx)*(n*syy-sy*sy));
console.log(`\n═══ (a) ¿PERSISTE AL DÍA SIGUIENTE? ═══`);
console.log(`   corr(desq ${A} , desq ${B}) = ${corr.toFixed(3)}  sobre n=${n}`);
const mismo = p.filter(r=>Math.sign(r.desq)===Math.sign(r.desqB)).length;
console.log(`   mismo signo los dos días: ${mismo}/${n} (${(100*mismo/n).toFixed(0)}%)  ·  el azar daría 50%`);
console.log(`   → ${corr>0.25?"PERSISTE: es una campaña de varios días, no un fogonazo.":"NO persiste: cada día es un sorteo nuevo; hay que operar el MISMO día."}`);

// ── concentración de tickers (para la n efectiva honesta)
const senales = act.filter(r=>Math.abs(r.desq)>=0.40);
const porT = {}; for (const r of senales) porT[r.T]=(porT[r.T]??0)+1;
console.log(`\n═══ CONCENTRACIÓN — la n efectiva depende de esto ═══`);
console.log(`   ${senales.length} señales repartidas en ${Object.keys(porT).length} tickers:`);
console.log(`   ${Object.entries(porT).sort((a,b)=>b[1]-a[1]).map(([t,c])=>`${t}:${c}`).join(" · ")}`);
