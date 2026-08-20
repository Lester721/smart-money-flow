// RECON del panel SUBYACENTE-GAMMA. Antes de medir: ¿qué es exactamente cada fila?
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
const RAIZ = path.join("scripts","cache-theta","marketsnack");
const GEX = path.join(RAIZ,"aux","gex","2026-08-19");
const CH  = path.join(RAIZ,"aux","chart-all");
const leer=(p)=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8"));

const tickers = fs.readdirSync(GEX).map(f=>f.replace(".json.gz",""));
console.log(`tickers con GEX: ${tickers.length} → ${tickers.join(" ")}`);

// 1) ¿el punto DIARIO de un día es el ÚLTIMO intradía de ese día, el primero, o una media?
let comparados=0, igualUltimo=0, igualPrimero=0, ni=0;
const ejem=[];
for(const T of tickers){
  const j = leer(path.join(GEX,`${T}.json.gz`));
  const d1 = j["1m"]?.data??[], dw = j["1w"]?.data??[];
  const porDia = new Map();
  for(const r of dw){ const dia=r.t.slice(0,10); let g=porDia.get(dia); if(!g){g=[];porDia.set(dia,g);} g.push(r); }
  for(const [dia,g] of porDia){
    const diario = d1.find(r=>r.t.slice(0,10)===dia); if(!diario) continue;
    g.sort((a,b)=>a.t.localeCompare(b.t));
    comparados++;
    const eq=(a,b)=>a!=null&&b!=null&&Math.abs(a-b)<1e-6;
    if(eq(diario.net_gex,g[g.length-1].net_gex)) igualUltimo++;
    else if(eq(diario.net_gex,g[0].net_gex)) igualPrimero++;
    else { ni++; if(ejem.length<4) ejem.push({T,dia,diario:diario.net_gex,prim:g[0].net_gex,ult:g[g.length-1].net_gex,horas:g.map(x=>x.t.slice(11,16)).join(",")}); }
  }
}
console.log(`\n¿qué es el punto diario? comparados ${comparados} · = último intradía ${igualUltimo} · = primero ${igualPrimero} · ninguno ${ni}`);
for(const e of ejem) console.log("   ", JSON.stringify(e));

// 2) rango horario intradía real (para saber a qué hora se puede OBSERVAR)
const horas = new Set();
for(const T of tickers.slice(0,10)){ const j=leer(path.join(GEX,`${T}.json.gz`)); for(const r of (j["1w"]?.data??[])) horas.add(r.t.slice(11,16)); }
console.log(`\nhoras UTC del intradía (1w): ${[...horas].sort().join(" ")}`);

// 3) cobertura de precios diarios (chart-all) para esos tickers
const sinPrecio = tickers.filter(T=>!fs.existsSync(path.join(CH,`${T}.json.gz`)));
console.log(`\nsin serie de precio en chart-all: ${sinPrecio.length ? sinPrecio.join(" ") : "ninguno"}`);

// 4) ¿coincide el asset_price del GEX con el cierre del chart? (mismo día)
let n=0, difMax=0, difs=[];
for(const T of tickers){
  if(!fs.existsSync(path.join(CH,`${T}.json.gz`))) continue;
  const px = leer(path.join(CH,`${T}.json.gz`)).data??[];
  const idx = new Map(px.map(p=>[p.t.slice(0,10),p.v]));
  for(const r of (leer(path.join(GEX,`${T}.json.gz`))["1m"]?.data??[])){
    const c = idx.get(r.t.slice(0,10)); if(c==null||!(r.asset_price>0)) continue;
    const d = Math.abs(r.asset_price/c-1); difs.push(d); n++; if(d>difMax) difMax=d;
  }
}
difs.sort((a,b)=>a-b);
console.log(`\nasset_price(GEX) vs cierre(chart): n=${n} · p50 ${(difs[Math.floor(n/2)]*100).toFixed(3)}% · p90 ${(difs[Math.floor(n*0.9)]*100).toFixed(3)}% · max ${(difMax*100).toFixed(2)}%`);
console.log(`   (si p50 ≈ 0 el punto diario es de CIERRE → observarlo el día D y entrar al cierre de D es mirar al futuro)`);

// 5) nulos por campo en la serie diaria
const campos=["net_gex","call_wall","put_wall","magnet","max_pain","gamma_flip","asset_price"];
const cnt=Object.fromEntries(campos.map(c=>[c,0])); let tot=0;
for(const T of tickers) for(const r of (leer(path.join(GEX,`${T}.json.gz`))["1m"]?.data??[])){ tot++; for(const c of campos) if(r[c]==null) cnt[c]++; }
console.log(`\nnulos en la serie diaria (n=${tot}):`);
for(const c of campos) console.log(`   ${c.padEnd(12)} ${cnt[c]} (${(100*cnt[c]/tot).toFixed(1)}%)`);
