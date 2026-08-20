// PANEL CADENA-STRIKE · paso 4 — ¿ES LEGIBLE COMO SEÑAL?
// Tres preguntas que se contestan con UNA foto (no hacen falta retornos futuros):
//   A. ¿hay DISPERSIÓN en el desequilibrio por strike, o todo está en el 50%?
//   B. ¿el detalle por strike aporta, o es una constante del ticker?
//   C. ¿cuánta prima hace falta en un strike para que el % deje de ser ruido?
import fs from "node:fs"; import zlib from "node:zlib"; import path from "node:path";

const DIA = process.argv[2] ?? "2026-08-19";
const DIRC = `scripts/cache-theta/marketsnack/aux/cadenas/${DIA}`;

const filas = [];
for (const f of fs.readdirSync(DIRC)) {
  const T = f.split("-")[0];
  for (const c of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIRC,f))).toString())) {
    const b=c.premium_breakdown??{}, l=c.legs_premium??{};
    const p = c.premium_traded ?? 0;
    if (p <= 0) continue;
    filas.push({ T, venc:c.expiration, strike:c.strike, tipo:c.type, prima:p,
      pAsk:(b.ask??0)/p, pBid:(b.bid??0)/p, pMid:(b.mid??0)/p,
      pSingle:(l.single??0)/p, pMulti:(l.multi??0)/p,
      vol:c.volume??0, oi:c.open_interest??0, iv:c.implied_volatility, delta:c.greeks?.delta });
  }
}
console.log(`═══ ${DIA} · ${filas.length.toLocaleString("es-ES")} contratos con prima negociada ═══\n`);

const pct = (a,q)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(q*s.length))];};
const desq = (r)=>r.pAsk-r.pBid;   // desequilibrio: +1 todo al ask, −1 todo al bid

// ── A · DISPERSIÓN del desequilibrio, por escalón de prima del strike
console.log(`═══ A · ¿HAY DISPERSIÓN, O TODO ESTÁ EN EL MEDIO? (desequilibrio = %ask − %bid) ═══`);
console.log(`   prima del contrato        n      p10     p25    mediana   p75     p90   │ %extremos(|d|>0,6)`);
const esc = [[0,1e4],[1e4,1e5],[1e5,1e6],[1e6,1e7],[1e7,1e12]];
for (const [lo,hi] of esc) {
  const g = filas.filter(r=>r.prima>=lo && r.prima<hi);
  if (g.length < 20) continue;
  const d = g.map(desq);
  const ext = d.filter(x=>Math.abs(x)>0.6).length/d.length;
  const et = hi>=1e12 ? "≥$10M" : `$${(lo/1000).toFixed(0)}k–$${(hi/1000).toFixed(0)}k`;
  console.log(`   ${et.padEnd(18)} ${String(g.length).padStart(6)}  ${pct(d,.10).toFixed(2).padStart(6)}  ${pct(d,.25).toFixed(2).padStart(6)}  ${pct(d,.50).toFixed(2).padStart(6)}  ${pct(d,.75).toFixed(2).padStart(6)}  ${pct(d,.90).toFixed(2).padStart(6)}  │ ${(100*ext).toFixed(0).padStart(3)}%`);
}
console.log(`   → si los extremos caen al subir la prima, el desequilibrio grande es COSA DE STRIKES PEQUEÑOS (ruido de pocos prints).`);

// ── B · ¿el strike aporta sobre el ticker? varianza dentro vs entre
console.log(`\n═══ B · ¿APORTA EL DETALLE POR STRIKE, O ES UNA CONSTANTE DEL TICKER? ═══`);
const grandes = filas.filter(r=>r.prima>=1e5);
const porT = new Map();
for (const r of grandes) { if(!porT.has(r.T)) porT.set(r.T,[]); porT.get(r.T).push(desq(r)); }
const media = (a)=>a.reduce((s,x)=>s+x,0)/a.length;
const varr = (a,m)=>a.reduce((s,x)=>s+(x-m)*(x-m),0)/Math.max(1,a.length-1);
const mg = media(grandes.map(desq));
let dentro=0, entre=0, n=0;
for (const [T,a] of porT) { if(a.length<10) continue; const m=media(a); dentro+=varr(a,m)*(a.length-1); entre+=a.length*(m-mg)**2; n+=a.length; }
console.log(`   contratos con ≥$100k de prima: ${grandes.length.toLocaleString("es-ES")} en ${[...porT.values()].filter(a=>a.length>=10).length} tickers`);
console.log(`   varianza DENTRO del ticker (strike a strike) : ${(dentro/n).toFixed(3)}`);
console.log(`   varianza ENTRE tickers                       : ${(entre/n).toFixed(3)}`);
console.log(`   → ${(100*(dentro/n)/((dentro/n)+(entre/n))).toFixed(0)}% de la señal vive DENTRO del ticker. El agregado por ticker-día la tiraba a la basura.`);

// ── C · ¿se puede limpiar el lado con el eje de patas?
console.log(`\n═══ C · EL CRUCE QUE FALTA — y el puente que sí se puede construir ═══`);
console.log(`   AVISO: premium_breakdown y legs_premium son DOS MARGINALES, no una tabla cruzada.`);
console.log(`   No se sabe el %ask DE LA PARTE single. Pero si single domina el strike, el %ask ES del single.`);
for (const u of [0.7,0.8,0.9,0.95]) {
  const g = grandes.filter(r=>r.pSingle>=u);
  const d = g.map(desq);
  const ext = d.filter(x=>Math.abs(x)>0.5).length;
  console.log(`   single ≥${(100*u).toFixed(0)}%  →  ${String(g.length).padStart(5)} contratos (${(100*g.length/grandes.length).toFixed(0)}% de los ≥$100k)  ·  |desq|>0,5 en ${String(ext).padStart(4)} (${(100*ext/Math.max(1,g.length)).toFixed(0)}%)`);
}
const sucios = grandes.filter(r=>r.pMulti>=0.5);
console.log(`\n   contratos ≥$100k donde MANDA el spread (multi≥50%): ${sucios.length.toLocaleString("es-ES")} (${(100*sucios.length/grandes.length).toFixed(0)}%) — ahí el lado NO significa nada y hay que TIRARLOS.`);

// ── D · la escalera legible: NVDA
console.log(`\n═══ D · CÓMO SE VE EN PANTALLA — escalera de un ticker ═══`);
for (const T of ["NVDA","SPY"]) {
  const g = filas.filter(r=>r.T===T && r.prima>=2.5e5).sort((a,b)=>b.prima-a.prima).slice(0,12);
  if (!g.length) continue;
  console.log(`\n   ${T} · los 12 strikes con más prima (≥$250k)`);
  console.log(`   venc        strike  t   prima      %ask  %bid │ %single %multi │  vol/OI   veredicto`);
  for (const r of g.sort((a,b)=>a.venc.localeCompare(b.venc)||a.strike-b.strike)) {
    const d = desq(r);
    const limpio = r.pSingle>=0.8;
    const ver = !limpio ? "SPREAD — el lado no dice nada"
      : d>0.5 ? "COMPRA limpia" : d<-0.5 ? "VENTA limpia" : "repartido";
    console.log(`   ${r.venc}  ${String(r.strike).padStart(6)}  ${r.tipo[0].toUpperCase()}  $${(r.prima/1e6).toFixed(2).padStart(6)}M  ${(100*r.pAsk).toFixed(0).padStart(3)}%  ${(100*r.pBid).toFixed(0).padStart(3)}% │  ${(100*r.pSingle).toFixed(0).padStart(3)}%   ${(100*r.pMulti).toFixed(0).padStart(3)}%  │ ${(r.oi?r.vol/r.oi:0).toFixed(2).padStart(5)}   ${ver}`);
  }
}
