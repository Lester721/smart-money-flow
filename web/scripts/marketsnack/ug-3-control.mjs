// PANEL SUBYACENTE-GAMMA · EL CONTROL QUE PUEDE MATARLO.
//
// Lo que salió en ug-2: la gamma NO predice la DIRECCIÓN (0 de 28 pruebas direccionales), pero sí
// separa la AMPLITUD del movimiento. Antes de llamar a eso señal hay que descartar lo obvio:
//
//   SOSPECHA 1 — «los valores volátiles se mueven más». Un ticker con muros anchos, con flujo
//   cargado de calls o con la gamma lejos del precio puede ser sencillamente un valor nervioso.
//   Eso no es una señal: es una propiedad ESTÁTICA del ticker, ya está en el precio de su opción.
//   CONTROL: dividir el movimiento por la volatilidad realizada de los 20 días ANTERIORES.
//
//   SOSPECHA 2 — «el que separa es el ticker, no el día». CONTROL: restar a la métrica su propia
//   media de días anteriores (demedia por ticker). Lo que queda es «HOY este valor está más
//   cargado de lo que suele», que es lo único que se puede operar.
//
//   ARREGLO — distCentro estaba roto en las raíces de índice: con SPX→SPY se comparaba un strike
//   de 7.575 con un precio de 757. Ahora el centro de gamma se calcula en MONEYNESS por operación,
//   (K − S)/S con la S de esa misma operación, que es adimensional y no depende de la raíz.
//
// NADA DE FUTURO: la volatilidad previa y la media por ticker usan SÓLO días anteriores.
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
import { listonT, pasarBarrera, potencia } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const RAIZ = path.join("scripts","cache-theta","marketsnack");
const DIRF = path.join(RAIZ,"flujo-100k");
const CH   = path.join(RAIZ,"aux","chart-all");
const leer = (p)=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8"));

const CORTES = [11*60, 14*60];
const MIN_OPS = 8, MIN_SIM = 20, VENTANA_VOL = 20, MIN_PREV_TICKER = 10;
const PRUEBAS = 56 + 24;                       // 56 de ug-2 + 24 nuevas aquí
const LISTON = listonT(PRUEBAS);

const PROXY = { SPX:"SPY", SPXW:"SPY", XSP:"SPY", NDX:"QQQ", NDXP:"QQQ", RUT:"IWM" };
const APAL = new Set(["TQQQ","SOXL","SQQQ","SOXS","UVXY","TZA","TNA","SPXU","UPRO","LABU","LABD","YINN","FNGU","NVDL","TSLL","BOIL","KOLD","VXX","SVIX","UVIX"]);
const COMPRA = new Set(["ABOVE_ASK","AT_ASK","ASKSIDE"]);
const VENTA  = new Set(["BELOW_BID","AT_BID","BIDSIDE"]);
const parseOcc = (s)=>{ if(!s||s.length<16) return null;
  const k=s.slice(-8), t=s.slice(-9,-8), d=s.slice(-15,-9), u=s.slice(0,-15);
  if(!/^\d{8}$/.test(k)||!/^[CP]$/.test(t)||!/^\d{6}$/.test(d)||!u) return null;
  return { u, call:t==="C", K:Number(k)/1000 }; };
const RAZONES=[2,3,4,5,6,7,8,10,12,15,20,25,30,40,50];
const esSplit=(r)=>RAZONES.some(k=>Math.abs(r-k)/k<0.03||Math.abs(r-1/k)*k<0.03);
const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:0;
const sd=(v)=>{ if(v.length<2) return 0; const m=media(v); return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1)); };

// ── precios + volatilidad realizada previa (SOLO días anteriores) ────────────────────────────
const cierres = new Map();
for(const f of fs.readdirSync(CH)){
  if(!f.endsWith(".json.gz")) continue;
  let j; try{ j=leer(path.join(CH,f)); }catch{ continue; }
  const d=j?.data??[]; if(d.length<60) continue;
  const c=d.map(p=>p.v), fe=d.map(p=>p.t.slice(0,10));
  // vol previa: sd de los retornos diarios de las VENTANA_VOL sesiones ANTERIORES a cada día
  const volPrev = new Array(c.length).fill(null);
  for(let i=0;i<c.length;i++){
    if(i < VENTANA_VOL+1) continue;
    const rs=[];
    for(let j2=i-VENTANA_VOL; j2<i; j2++){ if(c[j2]>0&&c[j2-1]>0) rs.push(c[j2]/c[j2-1]-1); }
    const s = sd(rs.filter(x=>Math.abs(x)<0.25));
    volPrev[i] = s>0 ? s : null;
  }
  cierres.set(f.replace(".json.gz",""), { c, idx:new Map(fe.map((x,i)=>[x,i])), volPrev });
}
console.log(`precios+vol previa: ${cierres.size} tickers · ventana ${VENTANA_VOL} sesiones anteriores`);
function ret(T,dia,h){
  const s=cierres.get(T); if(!s) return null; const i=s.idx.get(dia);
  if(i==null||i+h>=s.c.length) return null;
  const p0=s.c[i], p1=s.c[i+h]; if(!(p0>0)||!(p1>0)) return null;
  for(let j=i;j<i+h;j++){ const r=s.c[j+1]/s.c[j]; if(Math.abs(r-1)>0.25&&esSplit(r)) return null; }
  return p1/p0-1;
}

// ── agregación desde el flujo, con el centro de gamma EN MONEYNESS ───────────────────────────
const dias = fs.readdirSync(DIRF).filter(f=>f.endsWith(".jsonl.gz")).map(f=>f.slice(0,10)).sort();
const AC = CORTES.map(()=>new Map()); const EN=new Map();
let leidas=0;
for(const dia of dias){
  const buf = zlib.gunzipSync(fs.readFileSync(path.join(DIRF,`${dia}.jsonl.gz`))).toString("utf8");
  for(const l of buf.split("\n")){
    if(!l) continue; const r=JSON.parse(l); leidas++;
    const o=parseOcc(r.symbol); if(!o) continue;
    const T=PROXY[o.u]??o.u; if(APAL.has(T)||!cierres.has(T)) continue;
    const minET=(Date.parse(r.timestamp)-4*3600e3)/60000%1440, S=r.asset_price;
    if(o.u===T && S>0) for(let c=0;c<CORTES.length;c++){
      if(minET<CORTES[c]) continue; const k=`${c}|${T}|${dia}`, b=EN.get(k);
      if(!b||minET<b.min) EN.set(k,{min:minET,px:S});
    }
    if(r.side==null) continue;
    const comp=COMPRA.has(r.side), vend=VENTA.has(r.side); if(!comp&&!vend) continue;
    if(r.ask_price===0||r.bid_price===0||(r.ask_price!=null&&r.bid_price!=null&&r.ask_price<r.bid_price)) continue;
    if(!Number.isFinite(r.gamma)||r.gamma<=0||!(S>0)) continue;
    const gN=r.gamma*(r.size||0)*100*S*S*0.01; if(!(gN>0)) continue;
    const mny=(o.K-S)/S; if(!Number.isFinite(mny)||Math.abs(mny)>2) continue;   // moneyness sana
    for(let c=0;c<CORTES.length;c++){
      if(minET>=CORTES[c]) continue;
      const k=`${T}|${dia}`; let a=AC[c].get(k);
      if(!a){ a={T,dia,n:0,gAbs:0,gDealer:0,gClasico:0,gMny:0,prima:0}; AC[c].set(k,a); }
      a.n++; a.gAbs+=gN; a.gDealer+=(comp?-1:1)*gN; a.gClasico+=(o.call?1:-1)*gN;
      a.gMny+=mny*gN; a.prima+=r.premium||0;
    }
  }
  process.stdout.write(`\r  ${dia}  ${leidas.toLocaleString("es-ES")}   `);
}
console.log("");

// ── panel con controles ──────────────────────────────────────────────────────────────────────
const paneles={};
for(let c=0;c<CORTES.length;c++){
  const et=`${String(Math.floor(CORTES[c]/60)).padStart(2,"0")}:${String(CORTES[c]%60).padStart(2,"0")}`;
  const porTicker=new Map();
  for(const a of AC[c].values()){ let g=porTicker.get(a.T); if(!g){g=[];porTicker.set(a.T,g);} g.push(a); }
  const filas=[];
  for(const [T,g] of porTicker){
    g.sort((x,y)=>x.dia.localeCompare(y.dia));
    const prevCl=[], prevCe=[];
    for(const a of g){
      const mCl = prevCl.length>=MIN_PREV_TICKER ? media(prevCl) : null;
      const mCe = prevCe.length>=MIN_PREV_TICKER ? media(prevCe) : null;
      const clasica = a.gAbs>0 ? a.gClasico/a.gAbs : null;
      const centro  = a.gAbs>0 ? a.gMny/a.gAbs : null;      // moneyness medio ponderado por gamma
      if(clasica!=null) prevCl.push(clasica);
      if(centro!=null)  prevCe.push(centro);
      if(a.n<MIN_OPS||!(a.gAbs>0)) continue;
      const e=EN.get(`${c}|${T}|${a.dia}`); if(!e) continue;
      const s=cierres.get(T), i=s.idx.get(a.dia); if(i==null) continue;
      const cie=s.c[i], vp=s.volPrev[i];
      if(!(cie>0)||!(e.px>0)||Math.abs(e.px/cie-1)>0.15||!(vp>0)) continue;
      filas.push({
        ticker:T, fecha:a.dia, n:a.n, volPrev:vp,
        gammaNeta:a.gDealer/a.gAbs,
        gammaClasica:clasica,
        centroMny:centro,                                    // + = la gamma está POR ENCIMA del precio
        gammaClasicaDes: mCl!=null ? clasica-mCl : null,     // demediada por ticker (sólo pasado)
        centroMnyDes:    mCe!=null ? centro-mCe  : null,
        rIntra: cie/e.px-1,
        r1: ret(T,a.dia,1),
      });
    }
  }
  // demedia transversal + versión NORMALIZADA POR VOLATILIDAD PREVIA
  const porDia=new Map();
  for(const f of filas){ let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push(f); }
  const buenos=[];
  for(const [dia,g] of porDia){
    if(g.length<MIN_SIM) continue;
    for(const campo of ["rIntra","r1"]){
      const v=g.filter(f=>f[campo]!=null).map(f=>f[campo]); if(!v.length) continue;
      const mu=media(v);
      const abs=g.filter(f=>f[campo]!=null).map(f=>Math.abs(f[campo]-mu));
      const muA=media(abs);
      const nrm=g.filter(f=>f[campo]!=null).map(f=>Math.abs(f[campo]-mu)/f.volPrev);
      const muN=media(nrm);
      for(const f of g){
        f[`a_${campo}`] = f[campo]!=null ? Math.abs(f[campo]-mu)-muA : null;                 // amplitud cruda
        f[`z_${campo}`] = f[campo]!=null ? Math.abs(f[campo]-mu)/f.volPrev - muN : null;     // amplitud / vol previa
      }
    }
    buenos.push(...g);
  }
  paneles[et]=buenos;
  console.log(`corte ${et} → ${buenos.length} filas · ${new Set(buenos.map(f=>f.fecha)).size} días · ${new Set(buenos.map(f=>f.ticker)).size} tickers`);
}

// ── pruebas ──────────────────────────────────────────────────────────────────────────────────
const salida=[];
function prueba(nombre, filas, met, res){
  const f=filas.filter(x=>x[met]!=null&&x[res]!=null).map(x=>({pnl:x[res],ticker:x.ticker,fecha:x.fecha,m:x[met]}));
  if(f.length<200){ console.log(`  ${nombre.padEnd(52)} SIN MUESTRA (${f.length})`); return; }
  const v=pasarBarrera(f,x=>x.m,{pruebas:PRUEBAS,nMinimo:200,maxPorTicker:0.2});
  const porDia=new Map(); for(const x of f){ let g=porDia.get(x.fecha); if(!g){g=[];porDia.set(x.fecha,g);} g.push(x); }
  const LS=[];
  for(const [d,g] of [...porDia].sort()){ if(g.length<20) continue;
    const o=[...g].sort((a,b)=>a.m-b.m), k=Math.floor(o.length/3); if(k<5) continue;
    LS.push(media(o.slice(-k).map(x=>x.pnl))-media(o.slice(0,k).map(x=>x.pnl))); }
  const tLS=LS.length>2?media(LS)/(sd(LS)/Math.sqrt(LS.length)):0;
  salida.push({nombre,n:f.length,sep:v.detalle.sep,t:v.detalle.t,pasa:v.pasa,motivos:v.motivos,
    tercios:v.detalle.tercios.map(t=>({p:t.periodo,sep:t.sep,t:t.t})), diarioT:tLS, diarioMedia:media(LS), dias:LS.length});
  console.log(`  ${v.pasa?"✅":"  "}${nombre.padEnd(50)} n=${String(f.length).padStart(5)} sep ${((v.detalle.sep??0)).toFixed(4).padStart(9)} t=${(v.detalle.t??0).toFixed(2).padStart(6)} diaria t=${tLS.toFixed(2).padStart(6)} ${v.pasa?"PASA":v.motivos.length+" fallo(s)"}`);
}

for(const et of Object.keys(paneles)){
  const P=paneles[et];
  radiografia(P,["gammaClasica","centroMny","gammaClasicaDes","centroMnyDes","volPrev","a_rIntra","z_rIntra"],`control · corte ${et}`,{maxNulos:0.6});
  console.log(`\n═══ corte ${et} ET · listón |t| ≥ ${LISTON} (${PRUEBAS} pruebas acumuladas) ═══`);
  console.log(`  [1] SIN control (repite ug-2, con el centro ARREGLADO en moneyness)`);
  prueba(`${et} gammaClasica → amplitud cruda intradía`, P, "gammaClasica", "a_rIntra");
  prueba(`${et} centroMny    → amplitud cruda intradía`, P, "centroMny",    "a_rIntra");
  prueba(`${et} gammaClasica → amplitud cruda D+1`,      P, "gammaClasica", "a_r1");
  prueba(`${et} centroMny    → amplitud cruda D+1`,      P, "centroMny",    "a_r1");
  console.log(`  [2] CONTROL 1 — movimiento dividido por la volatilidad de los 20 días anteriores`);
  prueba(`${et} gammaClasica → amplitud / vol previa intradía`, P, "gammaClasica", "z_rIntra");
  prueba(`${et} centroMny    → amplitud / vol previa intradía`, P, "centroMny",    "z_rIntra");
  prueba(`${et} gammaClasica → amplitud / vol previa D+1`,      P, "gammaClasica", "z_r1");
  prueba(`${et} centroMny    → amplitud / vol previa D+1`,      P, "centroMny",    "z_r1");
  console.log(`  [3] CONTROL 2 — métrica demediada por ticker (sólo días anteriores): "hoy más de lo habitual"`);
  prueba(`${et} gammaClasicaDes → amplitud cruda intradía`, P, "gammaClasicaDes", "a_rIntra");
  prueba(`${et} centroMnyDes    → amplitud cruda intradía`, P, "centroMnyDes",    "a_rIntra");
  prueba(`${et} gammaClasicaDes → amplitud / vol previa intradía`, P, "gammaClasicaDes", "z_rIntra");
  prueba(`${et} centroMnyDes    → amplitud / vol previa intradía`, P, "centroMnyDes",    "z_rIntra");
}

// ── ¿la métrica es sólo un termómetro de volatilidad? correlación con la vol previa ──────────
console.log(`\n═══ ¿QUÉ ES la métrica en realidad? correlación con la volatilidad de los 20 días anteriores ═══`);
for(const et of Object.keys(paneles)){
  const P=paneles[et];
  for(const m of ["gammaClasica","centroMny","gammaNeta"]){
    const xs=P.filter(f=>f[m]!=null).map(f=>f[m]), ys=P.filter(f=>f[m]!=null).map(f=>f.volPrev);
    const mx=media(xs), my=media(ys);
    const cov=media(xs.map((x,i)=>(x-mx)*(ys[i]-my)));
    const r=cov/(sd(xs)*sd(ys));
    // vol previa media del tercio alto y del bajo
    const o=P.filter(f=>f[m]!=null).sort((a,b)=>a[m]-b[m]); const k=Math.floor(o.length/3);
    console.log(`  ${et} ${m.padEnd(13)} corr con vol previa = ${r.toFixed(3)} · vol previa diaria tercio bajo ${(media(o.slice(0,k).map(f=>f.volPrev))*100).toFixed(2)}% vs alto ${(media(o.slice(-k).map(f=>f.volPrev))*100).toFixed(2)}%`);
  }
}

fs.writeFileSync("scripts/marketsnack/ug-3-salida.json", JSON.stringify({liston:LISTON,pruebas:PRUEBAS,salida},null,1));
fs.writeFileSync("scripts/marketsnack/ug-3-panel.json", JSON.stringify(paneles));
console.log(`\n✓ scripts/marketsnack/ug-3-salida.json  ·  ug-3-panel.json`);
