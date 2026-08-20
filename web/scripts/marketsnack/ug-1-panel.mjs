// PANEL SUBYACENTE-GAMMA → NÚMEROS.  Construye dos paneles y los guarda en disco.
//
// PANEL A — el panel de MarketSnack tal cual: net_gex, gamma_flip, muros, magnet, max_pain y el
//   precio, serie DIARIA de 40 tickers (2026-07-24 → 2026-08-19).
//   COMPROBADO en ug-0-recon: el punto diario es EL ÚLTIMO INTRADÍA DEL DÍA (160/200 coincidencias
//   exactas con la muestra de 15:30 ET; los otros 40 son el día de hoy, aún abierto). O sea: se
//   OBSERVA a las 15:30 ET y se entra al CIERRE de ese mismo día, 30 minutos después. Sin futuro.
//
// PANEL B — la misma idea reconstruida DESDE EL FLUJO con el LADO REAL (86 días, ~400 tickers):
//   por cada operación, si la cruzó un comprador (ASKSIDE) el creador de mercado queda CORTO de
//   gamma; si la cruzó un vendedor (BIDSIDE), LARGO. Eso es lo que no tenía el GEX clásico, que
//   supone el lado por el tipo de contrato (call +, put −). Se calculan LAS DOS y se comparan.
//   Métrica de un día D: sólo operaciones con hora ET < CORTE. Entrada: primer asset_price real
//   visto en la cinta A PARTIR del corte. Salida: cierre de D (y cierre de D+1).
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";

const RAIZ = path.join("scripts","cache-theta","marketsnack");
const DIRF = path.join(RAIZ,"flujo-100k");
const CH   = path.join(RAIZ,"aux","chart-all");
const GEX  = path.join(RAIZ,"aux","gex","2026-08-19");
const SAL  = path.join("scripts","marketsnack");
const leer = (p)=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8"));

const CORTES = [11*60, 14*60];
const MIN_OPS = 8, MIN_SIM = 20;
const PROXY = { SPX:"SPY", SPXW:"SPY", XSP:"SPY", NDX:"QQQ", NDXP:"QQQ", RUT:"IWM" };
const APAL = new Set(["TQQQ","SOXL","SQQQ","SOXS","UVXY","TZA","TNA","SPXU","UPRO","LABU","LABD","YINN","FNGU","NVDL","TSLL","BOIL","KOLD","VXX","SVIX","UVIX"]);
const COMPRA = new Set(["ABOVE_ASK","AT_ASK","ASKSIDE"]);
const VENTA  = new Set(["BELOW_BID","AT_BID","BIDSIDE"]);

const parseOcc = (s)=>{ if(!s||s.length<16) return null;
  const k=s.slice(-8), t=s.slice(-9,-8), d=s.slice(-15,-9), u=s.slice(0,-15);
  if(!/^\d{8}$/.test(k)||!/^[CP]$/.test(t)||!/^\d{6}$/.test(d)||!u) return null;
  return { u, call:t==="C", K:Number(k)/1000 }; };

// ── splits: mismo guardián que recon-splits.mjs ──────────────────────────────────────────────
const RAZONES=[2,3,4,5,6,7,8,10,12,15,20,25,30,40,50];
const esSplit=(r)=>RAZONES.some(k=>Math.abs(r-k)/k<0.03||Math.abs(r-1/k)*k<0.03);

// ── cierres diarios ──────────────────────────────────────────────────────────────────────────
const cierres = new Map();
for(const f of fs.readdirSync(CH)){
  if(!f.endsWith(".json.gz")) continue;
  let j; try{ j=leer(path.join(CH,f)); }catch{ continue; }
  const d=j?.data??[]; if(d.length<60) continue;
  const c=d.map(p=>p.v), fe=d.map(p=>p.t.slice(0,10));
  cierres.set(f.replace(".json.gz",""), { c, fe, idx:new Map(fe.map((x,i)=>[x,i])) });
}
console.log(`precios diarios en cache: ${cierres.size} tickers`);

function ret(T, dia, h){
  const s=cierres.get(T); if(!s) return null;
  const i=s.idx.get(dia); if(i==null||i+h>=s.c.length) return null;
  const p0=s.c[i], p1=s.c[i+h]; if(!(p0>0)||!(p1>0)) return null;
  for(let j=i;j<i+h;j++){ const r=s.c[j+1]/s.c[j]; if(Math.abs(r-1)>0.25 && esSplit(r)) return null; }
  return p1/p0-1;
}

// ═══ PANEL A ════════════════════════════════════════════════════════════════════════════════
const filasA=[];
let sinPrecioA=0, dupIndice=0;
const YA_ETF = new Set(["SPX","SPXW","NDXP","NDX","RUT","XSP"]);
for(const f of fs.readdirSync(GEX)){
  const T = f.replace(".json.gz","");
  if(APAL.has(T)) continue;
  if(YA_ETF.has(T)){ dupIndice++; continue; }
  if(!cierres.has(T)){ sinPrecioA++; continue; }
  const serie = (leer(path.join(GEX,f))["1m"]?.data??[]).slice().sort((a,b)=>a.t.localeCompare(b.t));
  const prevAbs=[];
  for(const r of serie){
    const dia = r.t.slice(0,10);
    const px  = r.asset_price;
    const media = prevAbs.length>=4 ? prevAbs.reduce((a,x)=>a+x,0)/prevAbs.length : null;
    if(r.net_gex!=null) prevAbs.push(Math.abs(r.net_gex));
    if(!(px>0) || r.net_gex==null) continue;
    const cw=r.call_wall, pw=r.put_wall;
    filasA.push({
      ticker:T, fecha:dia,
      netGex:r.net_gex,
      gexRel: (media!=null && media>0) ? r.net_gex/media : null,
      distFlip: r.gamma_flip!=null ? (px - r.gamma_flip)/px : null,
      distMagnet: r.magnet!=null ? (r.magnet - px)/px : null,
      distMaxPain: r.max_pain!=null ? (r.max_pain - px)/px : null,
      posEnMuros: (cw!=null&&pw!=null&&cw>pw) ? (px-pw)/(cw-pw) : null,
      anchoMuros: (cw!=null&&pw!=null&&cw>pw) ? (cw-pw)/px : null,
      r1: ret(T,dia,1), r5: ret(T,dia,5),
    });
  }
}
console.log(`\nPANEL A · ${filasA.length} filas · ${new Set(filasA.map(f=>f.ticker)).size} tickers · ${new Set(filasA.map(f=>f.fecha)).size} dias`);
console.log(`   descartados: ${sinPrecioA} sin serie de precio · ${dupIndice} raices de indice cuyo ETF ya esta`);

// ═══ PANEL B ════════════════════════════════════════════════════════════════════════════════
const dias = fs.readdirSync(DIRF).filter(f=>f.endsWith(".jsonl.gz")).map(f=>f.slice(0,10)).sort();
const AC = CORTES.map(()=>new Map());
const EN = new Map();
let leidas=0, sinLado=0, cruzadas=0, sinGamma=0, sinPrecio=0;

for(const dia of dias){
  const p = path.join(DIRF,`${dia}.jsonl.gz`);
  const buf = zlib.gunzipSync(fs.readFileSync(p)).toString("utf8");
  for(const l of buf.split("\n")){
    if(!l) continue; const r=JSON.parse(l); leidas++;
    const o = parseOcc(r.symbol); if(!o) continue;
    const T = PROXY[o.u] ?? o.u;
    if(APAL.has(T) || !cierres.has(T)){ sinPrecio++; continue; }
    const minET = (Date.parse(r.timestamp) - 4*3600e3)/60000 % 1440;
    const S = r.asset_price;
    if(o.u===T && S>0){
      for(let c=0;c<CORTES.length;c++){
        if(minET < CORTES[c]) continue;
        const k=`${c}|${T}|${dia}`; const b=EN.get(k);
        if(!b || minET < b.min) EN.set(k,{min:minET, px:S});
      }
    }
    if(r.side==null){ sinLado++; continue; }
    const comp=COMPRA.has(r.side), vend=VENTA.has(r.side);
    if(!comp && !vend) continue;
    if(r.ask_price===0 || r.bid_price===0 || (r.ask_price!=null && r.bid_price!=null && r.ask_price<r.bid_price)){ cruzadas++; continue; }
    if(!Number.isFinite(r.gamma) || r.gamma<=0 || !(S>0)){ sinGamma++; continue; }
    const gN = r.gamma * (r.size||0) * 100 * S*S * 0.01;
    if(!(gN>0)) continue;
    const sDealer = comp ? -1 : +1;
    const sClasico = o.call ? +1 : -1;
    for(let c=0;c<CORTES.length;c++){
      if(minET >= CORTES[c]) continue;
      const k=`${T}|${dia}`; let a=AC[c].get(k);
      if(!a){ a={T,dia,n:0,gAbs:0,gDealer:0,gClasico:0,gK:0,ultS:0,ultMin:-1,prima:0}; AC[c].set(k,a); }
      a.n++; a.gAbs+=gN; a.gDealer+=sDealer*gN; a.gClasico+=sClasico*gN; a.gK+=o.K*gN; a.prima+=r.premium||0;
      if(minET>a.ultMin && o.u===T){ a.ultMin=minET; a.ultS=S; }
    }
  }
  process.stdout.write(`\r  ${dia}  ${leidas.toLocaleString("es-ES")} leidas   `);
}
console.log(`\nleidas ${leidas.toLocaleString("es-ES")} · sin lado ${sinLado.toLocaleString("es-ES")} · cruzadas ${cruzadas} · sin gamma ${sinGamma.toLocaleString("es-ES")} · sin precio/apalancado ${sinPrecio.toLocaleString("es-ES")}`);

const salidaB={};
for(let c=0;c<CORTES.length;c++){
  const et=`${String(Math.floor(CORTES[c]/60)).padStart(2,"0")}:${String(CORTES[c]%60).padStart(2,"0")}`;
  const porTicker=new Map();
  for(const a of AC[c].values()){ let g=porTicker.get(a.T); if(!g){g=[];porTicker.set(a.T,g);} g.push(a); }
  const filas=[];
  for(const [T,g] of porTicker){
    g.sort((x,y)=>x.dia.localeCompare(y.dia));
    const prev=[];
    for(const a of g){
      const mediaPrev = prev.length>=5 ? prev.reduce((s,x)=>s+x,0)/prev.length : null;
      prev.push(a.gAbs);
      if(a.n<MIN_OPS || !(a.gAbs>0)) continue;
      const e=EN.get(`${c}|${T}|${a.dia}`); if(!e) continue;
      const s=cierres.get(T), i=s.idx.get(a.dia); if(i==null) continue;
      const cie=s.c[i]; if(!(cie>0) || !(e.px>0) || Math.abs(e.px/cie-1)>0.15) continue;
      const centro=a.gK/a.gAbs;
      filas.push({
        ticker:T, fecha:a.dia, n:a.n, retraso:e.min-CORTES[c], primaDirigida:a.prima,
        gammaNeta: a.gDealer/a.gAbs,
        gammaClasica: a.gClasico/a.gAbs,
        gammaRel: (mediaPrev!=null && mediaPrev>0) ? a.gDealer/mediaPrev : null,
        distCentro: a.ultS>0 ? (a.ultS-centro)/a.ultS : null,
        rIntra: cie/e.px-1,
        r1: ret(T,a.dia,1),
      });
    }
  }
  const porDia=new Map();
  for(const f of filas){ let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push(f); }
  const buenos=[];
  for(const [dia,g] of porDia){
    if(g.length<MIN_SIM) continue;
    for(const campo of ["rIntra","r1"]){
      const v=g.filter(f=>f[campo]!=null).map(f=>f[campo]);
      if(!v.length) continue;
      const mu=v.reduce((a,x)=>a+x,0)/v.length;
      const av=v.map(x=>Math.abs(x-mu));
      const mua=av.reduce((a,x)=>a+x,0)/av.length;
      for(const f of g){
        f[`d_${campo}`] = f[campo]!=null ? f[campo]-mu : null;
        f[`a_${campo}`] = f[campo]!=null ? Math.abs(f[campo]-mu)-mua : null;
      }
    }
    buenos.push(...g);
  }
  const tam=[...porDia.values()].filter(g=>g.length>=MIN_SIM).map(g=>g.length).sort((a,b)=>a-b);
  console.log(`PANEL B · corte ${et} ET → ${buenos.length} filas · ${new Set(buenos.map(f=>f.fecha)).size} dias · ${new Set(buenos.map(f=>f.ticker)).size} tickers · mediana simbolos/dia ${tam[Math.floor(tam.length/2)]??0}`);
  salidaB[et]=buenos;
}

const porDiaA=new Map();
for(const f of filasA){ let g=porDiaA.get(f.fecha); if(!g){g=[];porDiaA.set(f.fecha,g);} g.push(f); }
const buenosA=[];
for(const [dia,g] of porDiaA){
  if(g.length<MIN_SIM) continue;
  for(const campo of ["r1","r5"]){
    const v=g.filter(f=>f[campo]!=null).map(f=>f[campo]); if(!v.length) continue;
    const mu=v.reduce((a,x)=>a+x,0)/v.length;
    const av=v.map(x=>Math.abs(x-mu));
    const mua=av.reduce((a,x)=>a+x,0)/av.length;
    for(const f of g){ f[`d_${campo}`]=f[campo]!=null?f[campo]-mu:null; f[`a_${campo}`]=f[campo]!=null?Math.abs(f[campo]-mu)-mua:null; }
  }
  buenosA.push(...g);
}
console.log(`PANEL A (demediado) → ${buenosA.length} filas · ${new Set(buenosA.map(f=>f.fecha)).size} dias`);

fs.writeFileSync(path.join(SAL,"ug-panel.json"), JSON.stringify({A:buenosA, B:salidaB}));
console.log(`\n✓ ${path.join(SAL,"ug-panel.json")}`);
