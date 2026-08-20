import fs from "node:fs";
const {R,serie}=JSON.parse(fs.readFileSync("scripts/marketsnack/lado-dias.json","utf8"));
const media=(v)=>v.reduce((a,x)=>a+x,0)/v.length;
const sd=(v)=>{const m=media(v);return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1));};
const ls=serie.map(x=>x.ls).filter(Number.isFinite);
const ord=[...ls].sort((a,b)=>a-b);
console.log(`═══ EL QUE MÁS SE ACERCÓ: deltaNeto · corte 11:00 ET · cierre(D)→cierre(D+1) ═══`);
console.log(`días ${ls.length} · media ${(media(ls)*100).toFixed(4)}% · MEDIANA ${(ord[Math.floor(ord.length/2)]*100).toFixed(4)}% · sd ${(sd(ls)*100).toFixed(3)}%`);
const rec=ord.slice(4,-4);   // recortado 5% por cola
console.log(`media recortada (quita 4 días de cada cola): ${(media(rec)*100).toFixed(4)}%  ← si cae mucho, vivía en 8 días`);
console.log(`mejor día ${(ord[ord.length-1]*100).toFixed(2)}% · peor ${(ord[0]*100).toFixed(2)}% · días>0 ${ls.filter(x=>x>0).length}/${ls.length}`);
let eq=1; for(const r of ls) eq*=1+r;
console.log(`compuesto en los ${ls.length} días: ${((eq-1)*100).toFixed(1)}%  → anualizado bruto ${((eq**(250/ls.length)-1)*100).toFixed(0)}%`);

// ── el peaje, con horquillas REALES medidas hoy (mercado CERRADO: cota superior) ──
const H={SPY:[770.03,770.12],TSLA:[350.52,350.70],SNDK:[1598.80,1599.23],MSFT:[484.50,484.72],
 MU:[948.20,948.77],NVDA:[219.08,219.09],AAPL:[316.81,316.89],AMD:[471.00,471.72],QQQ:[718.93,718.99],
 AVGO:[366.57,366.86],META:[550.47,550.73],GOOGL:[345.46,345.59],AMZN:[266.83,266.94],INTC:[93.95,94.00],
 IWM:[302.01,302.07],TSM:[415.14,415.41],SMH:[566.45,567.22],NBIS:[228.74,229.15],ORCL:[144.69,144.79],GOOG:[342.32,342.58]};
const bps=Object.entries(H).map(([t,[b,a]])=>[t,1e4*(a-b)/((a+b)/2)]).sort((x,y)=>x[1]-y[1]);
console.log(`\nhorquilla real medida (20 más frecuentes, ${new Date().toISOString().slice(0,10)} fuera de sesión → COTA SUPERIOR):`);
console.log(bps.map(([t,v])=>`${t} ${v.toFixed(1)}`).join(" · ")+" pb");
const med=bps[Math.floor(bps.length/2)][1];
console.log(`mediana ${med.toFixed(1)} pb · media ${media(bps.map(x=>x[1])).toFixed(1)} pb`);

const CUENTA=56389;
for(const [nom,sp] of [["horquilla medida fuera de sesión",med],["horquilla optimista de sesión",2]]){
  for(const [v,rot] of [["rotación 100%",1.0],["rotación 70%",0.7]]){
    const peaje=rot*sp/1e4;                       // una vuelta completa = una horquilla
    const neto=media(ls)-peaje;
    console.log(`\n${nom} (${sp.toFixed(1)} pb) · ${v}:`);
    console.log(`   bruto ${(media(ls)*100).toFixed(3)}%/día − peaje ${(peaje*100).toFixed(3)}%/día = neto ${(neto*100).toFixed(3)}%/día`);
    console.log(`   sobre $${CUENTA.toLocaleString("es-ES")} · 250 días → $${Math.round(neto*250*CUENTA).toLocaleString("es-ES")}/año (bruto $${Math.round(media(ls)*250*CUENTA).toLocaleString("es-ES")})`);
  }
}
console.log(`\n⚠ y el peaje NO es lo que lo mata: lo mata que t=2,39 < listón 3,28 y que el tercer tercio`);
console.log(`  del período da ${(serie.slice(Math.floor(serie.length*2/3)).reduce((a,x)=>a+x.ls,0)/serie.slice(Math.floor(serie.length*2/3)).length*100).toFixed(3)}%/día (contra ${(serie.slice(0,Math.floor(serie.length/3)).reduce((a,x)=>a+x.ls,0)/Math.floor(serie.length/3)*100).toFixed(3)}% en el primero).`);
console.log(`\n⚠ y aunque pasara: la pata CORTA son ~26 acciones distintas vendidas en corto cada día.`);
console.log(`  Robinhood NO permite vender acciones en corto. El vehículo tal cual NO es ejecutable en su cuenta.`);
