// ¿ES DE FIAR EL CAMPO `side`? Todo el titular descansa en él, así que se comprueba solo.
// Si dice ASKSIDE, el precio pactado tiene que estar pegado al ASK; si dice BIDSIDE, al BID.
// Y de paso: ¿cuánto se parece el signo REAL al signo SUPUESTO por el GEX clásico (call+/put−)?
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
const DIRF="scripts/cache-theta/marketsnack/flujo-100k";
const COMPRA=new Set(["ABOVE_ASK","AT_ASK","ASKSIDE"]), VENTA=new Set(["BELOW_BID","AT_BID","BIDSIDE"]);
const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:0;

const dias=fs.readdirSync(DIRF).filter(f=>f.endsWith(".jsonl.gz")).map(f=>f.slice(0,10)).sort();
const muestra=[dias[2],dias[20],dias[40],dias[60],dias[80]];
const cuenta=new Map(); let n=0;
const posAsk=[], posBid=[];
for(const dia of muestra){
  for(const l of zlib.gunzipSync(fs.readFileSync(path.join(DIRF,`${dia}.jsonl.gz`))).toString("utf8").split("\n")){
    if(!l) continue; const r=JSON.parse(l); n++;
    cuenta.set(r.side??"(nulo)",(cuenta.get(r.side??"(nulo)")??0)+1);
    const b=r.bid_price, a=r.ask_price, p=r.price;
    if(!(b>0)||!(a>b)||!(p>0)) continue;
    const pos=(p-b)/(a-b);                       // 0 = en el bid, 1 = en el ask
    if(COMPRA.has(r.side)) posAsk.push(pos); else if(VENTA.has(r.side)) posBid.push(pos);
  }
}
console.log(`muestra: ${muestra.join(" ")} · ${n.toLocaleString("es-ES")} operaciones\n`);
console.log("reparto del campo side:");
for(const [k,v] of [...cuenta].sort((a,b)=>b[1]-a[1])) console.log(`  ${String(k).padEnd(12)} ${String(v).padStart(7)}  ${(100*v/n).toFixed(1)}%`);
const pct=(v,q)=>{ const s=[...v].sort((a,b)=>a-b); return s[Math.floor(s.length*q)]; };
console.log(`\nposición del precio dentro de la horquilla (0=bid, 1=ask):`);
console.log(`  marcadas COMPRA (ask): n=${posAsk.length} · p25 ${pct(posAsk,0.25).toFixed(2)} · mediana ${pct(posAsk,0.5).toFixed(2)} · p75 ${pct(posAsk,0.75).toFixed(2)} · media ${media(posAsk).toFixed(2)}`);
console.log(`  marcadas VENTA  (bid): n=${posBid.length} · p25 ${pct(posBid,0.25).toFixed(2)} · mediana ${pct(posBid,0.5).toFixed(2)} · p75 ${pct(posBid,0.75).toFixed(2)} · media ${media(posBid).toFixed(2)}`);
console.log(`  → si el campo fuera ruido, las dos medianas serían 0,5. Separadas = el lado es real.`);

// ¿el signo real y el supuesto son la misma cosa?
const P5=JSON.parse(fs.readFileSync("scripts/marketsnack/ug-5-panel.json","utf8"));
const sd=(v)=>{ const m=media(v); return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1)); };
for(const et of Object.keys(P5)){
  const P=P5[et], x=P.map(f=>f.gammaNeta), y=P.map(f=>f.gammaClasica);
  const mx=media(x), my=media(y);
  const r=media(x.map((v,i)=>(v-mx)*(y[i]-my)))/(sd(x)*sd(y));
  const mismo=P.filter(f=>Math.sign(f.gammaNeta)===Math.sign(f.gammaClasica)).length;
  console.log(`\n${et} · corr(lado REAL, signo SUPUESTO) = ${r.toFixed(3)} · coinciden en signo el ${(100*mismo/P.length).toFixed(1)}% de los (ticker,día)`);
  console.log(`     signo real:    ${(100*P.filter(f=>f.gammaNeta<0).length/P.length).toFixed(1)}% de días el creador queda CORTO de gamma`);
  console.log(`     signo supuesto: ${(100*P.filter(f=>f.gammaClasica<0).length/P.length).toFixed(1)}% de días el GEX clásico sale negativo`);
}
