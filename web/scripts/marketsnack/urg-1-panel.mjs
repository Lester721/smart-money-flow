// URGENCIA · PANEL — (ticker, día) → prima pagada CON URGENCIA + movimiento futuro.
//
// LA SEÑAL. De los 7 valores de `side`, dos no son conveniencia sino PRISA:
//   ABOVE_ASK = pagó por encima del ask (comprador urgente)  · verificado: p50 = +0,44% sobre el ask
//   BELOW_BID = vendió por debajo del bid (vendedor urgente)
// El resto (AT_ASK/ASKSIDE/AT_BID/BIDSIDE) es cruzar el spread sin pagar de más. MIDMKT no lo
// inició nadie.
//
// QUÉ SE PREDICE, Y POR QUÉ ES OTRO NEGOCIO. Comprar una opción no paga por acertar la dirección,
// paga por acertar el TAMAÑO. Así que el objetivo primario es |retorno| — pero |retorno| CRUDO es
// una tautología (los tickers volátiles se mueven más y eso ya está en la prima). Se normaliza por
// la volatilidad que ESE ticker ya traía, calculada SÓLO con los 20 días ANTERIORES a D:
//     mov_h = (|ret_h| / raíz(h)) / rvPrev20        >1 = se movió más de lo que venía moviéndose
//
// NADA DE FUTURO:
//   · la métrica del día D usa SÓLO operaciones de la sesión de D con hora ET < 16:00 (el cierre).
//   · el retorno es cierre(D) → cierre(D+h); el cierre de D es POSTERIOR al corte.
//   · rvPrev20 son los 20 retornos que terminan en el cierre de D, anteriores al retorno medido.
//   · la mediana previa del surge usa sólo días ESTRICTAMENTE anteriores a D.
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";

const RAIZ = path.join("scripts","cache-theta","marketsnack");
const DIR  = path.join(RAIZ,"flujo-100k");
const CH   = path.join(RAIZ,"aux","chart-all");
// EL CORTE. La primera versión usó 12:00 ET y la radiografía la TUMBÓ: con ≥10 operaciones por
// celda, el 47,9% de los (ticker, día) tenían CERO prima urgente y el 75,9% cero en puts. Un
// predictor que es cero en la mitad de las filas no ordena nada.
// Arreglo, decidido ANTES de medir y por motivo de datos, no de resultado:
//   · el corte pasa a la SESIÓN COMPLETA (< 16:00 ET). No hay futuro: todo ese flujo ocurre antes
//     del cierre de D, y el retorno que se mide empieza EN el cierre de D. Multiplica el flujo
//     por ~3. Lo de las 16:00 en adelante SÍ sería futuro y se excluye.
//   · el suelo de operaciones por celda sube a 50, que es donde "cero urgencia" deja de ser
//     "no hay dato" y pasa a ser una observación.
const CORTE_ET = Number(process.env.CORTE_ET ?? 16*60);   // minutos ET, exclusivo
const MIN_OPS  = Number(process.env.MIN_OPS  ?? 50);      // operaciones mínimas por (ticker, día)
const MIN_SIMBOLOS = 20;         // tickers mínimos con dato ese día para que el corte transversal valga
const MIN_DIAS_PREV = 10;        // días previos mínimos para la mediana del surge
const SALIDA = process.env.SALIDA ?? "urg-panel.json";

const PROXY = { SPX:"SPY", SPXW:"SPY", XSP:"SPY", NDX:"QQQ", NDXP:"QQQ", RUT:"IWM" };
const APALANCADOS = new Set(["TQQQ","SOXL","SQQQ","SOXS","UVXY","TZA","TNA","SPXU","UPRO","LABU","LABD","YINN","FNGU","NVDL","TSLL","BOIL","KOLD","VXX","SVIX","UVIX","VIX","VIXW"]);
const DIRIGIDA = new Set(["ABOVE_ASK","AT_ASK","ASKSIDE","BELOW_BID","AT_BID","BIDSIDE"]);

const parseOcc = (s)=>{ if(!s||s.length<16) return null;
  const k=s.slice(-8),t=s.slice(-9,-8),d=s.slice(-15,-9),u=s.slice(0,-15);
  if(!/^\d{8}$/.test(k)||!/^[CP]$/.test(t)||!/^\d{6}$/.test(d)||!u) return null;
  return { u, call: t==="C" }; };

// ── cierres diarios reales ────────────────────────────────────────────────────────────────────
const serie = new Map();
for(const f of fs.readdirSync(CH)){
  if(!f.endsWith(".json.gz")) continue;
  let j; try{ j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CH,f))).toString("utf8")); }catch{ continue; }
  const d = j?.data ?? []; if(d.length < 60) continue;
  const fechas = d.map(p=>p.t.slice(0,10)), cierres = d.map(p=>p.v);
  serie.set(j.symbol ?? f.replace(".json.gz",""), { fechas, cierres, idx:new Map(fechas.map((x,i)=>[x,i])) });
}
console.log(`cierres en cache: ${serie.size} tickers · ultimo dia ${serie.get("SPY").fechas.at(-1)}`);

function rvPrev(T, fecha, N=20){
  const s = serie.get(T); if(!s) return null;
  const i = s.idx.get(fecha); if(i==null || i < N+1) return null;
  const r=[]; for(let k=i-N+1;k<=i;k++) r.push(s.cierres[k]/s.cierres[k-1]-1);
  const mu=r.reduce((a,x)=>a+x,0)/r.length;
  const sd=Math.sqrt(r.reduce((a,x)=>a+(x-mu)**2,0)/(r.length-1));
  return sd>0 ? sd : null;
}

// ── agregado por (ticker, día) ────────────────────────────────────────────────────────────────
const dias = fs.readdirSync(DIR).filter(f=>f.endsWith(".jsonl.gz")).map(f=>f.slice(0,10)).sort();
const A = new Map();     // `${T}|${dia}`
let leidas=0, sinLado=0, cruzadas=0, sinPrecio=0, fueraDeCorte=0, midmkt=0;
const sinPrecioRoots = new Map();

for(const dia of dias){
  const ls = zlib.gunzipSync(fs.readFileSync(path.join(DIR,`${dia}.jsonl.gz`))).toString("utf8").split("\n");
  for(const l of ls){ if(!l) continue; const r=JSON.parse(l); leidas++;
    if(r.side==null){ sinLado++; continue; }
    if(!DIRIGIDA.has(r.side)){ midmkt++; continue; }
    if(r.ask_price===0 || r.bid_price===0 || (r.ask_price!=null && r.bid_price!=null && r.ask_price<r.bid_price)){ cruzadas++; continue; }
    const o = parseOcc(r.symbol); if(!o) continue;
    const T = PROXY[o.u] ?? o.u;
    if(APALANCADOS.has(T)) continue;
    if(!serie.has(T)){ sinPrecio++; sinPrecioRoots.set(o.u,(sinPrecioRoots.get(o.u)??0)+1); continue; }
    const minET = ((Date.parse(r.timestamp) - 4*3600e3)/60000) % 1440;
    if(minET >= CORTE_ET){ fueraDeCorte++; continue; }
    const p = r.premium || 0;
    const k = `${T}|${dia}`;
    let a = A.get(k);
    if(!a){ a = { T, dia, n:0, tot:0, AAc:0, BBc:0, AAp:0, BBp:0, nUrg:0 }; A.set(k,a); }
    a.n++; a.tot += p;
    if(r.side==="ABOVE_ASK"){ a.nUrg++; if(o.call) a.AAc+=p; else a.AAp+=p; }
    else if(r.side==="BELOW_BID"){ a.nUrg++; if(o.call) a.BBc+=p; else a.BBp+=p; }
  }
  process.stdout.write(`\r  ${dia}  ${leidas.toLocaleString("es-ES")}   `);
}
console.log(`\nleidas ${leidas.toLocaleString("es-ES")} · side nulo ${sinLado} · MIDMKT ${midmkt.toLocaleString("es-ES")} · cotizacion cruzada ${cruzadas.toLocaleString("es-ES")} · fuera del corte ${fueraDeCorte.toLocaleString("es-ES")} · SIN PRECIO ${sinPrecio.toLocaleString("es-ES")}`);
const peoresSinPrecio=[...sinPrecioRoots].sort((a,b)=>b[1]-a[1]).slice(0,10);
console.log(`  roots sin cierre (top 10): ${peoresSinPrecio.map(([t,n])=>`${t} ${n.toLocaleString("es-ES")}`).join(" · ")}`);

// ── surge: prima urgente de hoy frente a la mediana de los días ANTERIORES de ese ticker ─────
const porTicker = new Map();
for(const a of [...A.values()].sort((x,y)=> x.dia.localeCompare(y.dia))){
  let h = porTicker.get(a.T); if(!h){ h=[]; porTicker.set(a.T,h); }
  const urgUSD = a.AAc + a.BBc + a.AAp + a.BBp;
  const totUSD = a.tot;
  if(h.length >= MIN_DIAS_PREV){
    const mu = [...h.map(x=>x.urg)].sort((p,q)=>p-q)[Math.floor(h.length/2)];
    const mt = [...h.map(x=>x.tot)].sort((p,q)=>p-q)[Math.floor(h.length/2)];
    a.urgSurge = Math.log((urgUSD+1)/(mu+1));
    a.totSurge = mt>0 ? Math.log((totUSD+1)/(mt+1)) : null;
  } else { a.urgSurge=null; a.totSurge=null; }
  h.push({ urg:urgUSD, tot:totUSD });
}

// ── panel ────────────────────────────────────────────────────────────────────────────────────
const HORIZ=[1,5,20];
const filas=[];
let sinRv=0;
for(const a of A.values()){
  if(a.n < MIN_OPS) continue;
  if(!(a.tot>0)) continue;
  const s = serie.get(a.T); const i = s.idx.get(a.dia); if(i==null) continue;
  const p0 = s.cierres[i]; if(!(p0>0)) continue;
  const rv = rvPrev(a.T, a.dia); if(rv==null){ sinRv++; continue; }
  const urgUSD = a.AAc+a.BBc+a.AAp+a.BBp;
  const f = {
    ticker:a.T, fecha:a.dia, n:a.n, nUrg:a.nUrg, totUSD:a.tot, urgUSD, rvPrev:rv,
    urgShare : urgUSD / a.tot,
    urgCall  : (a.AAc+a.BBc) / a.tot,
    urgPut   : (a.AAp+a.BBp) / a.tot,
    urgDir   : (a.AAc + a.BBp - a.BBc - a.AAp) / a.tot,
    urgSurge : a.urgSurge, totSurge : a.totSurge,
  };
  f.urgDirAbs = Math.abs(f.urgDir);
  f.urgCP = f.urgCall - f.urgPut;
  for(const h of HORIZ){
    const j=i+h;
    const ret = j < s.cierres.length ? s.cierres[j]/p0 - 1 : null;
    f[`ret${h}`] = ret;
    f[`mov${h}`] = ret!=null ? Math.abs(ret)/Math.sqrt(h)/rv : null;
    f[`abs${h}`] = ret!=null ? Math.abs(ret) : null;          // CRUDO — solo para ensenar la tautologia
  }
  filas.push(f);
}
console.log(`celdas (ticker,dia) con >=${MIN_OPS} ops: ${filas.length.toLocaleString("es-ES")} · descartadas por falta de 21 barras previas: ${sinRv}`);

// ── rango transversal DENTRO de cada día + demediado dentro del día ───────────────────────────
const METRICAS=["urgShare","urgCall","urgPut","urgSurge","urgDirAbs","totSurge","urgDir","urgCP"];
const porDia=new Map();
for(const f of filas){ let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push(f); }
const buenos=[]; const simbolosPorDia=[];
for(const [,g] of porDia){
  if(g.length < MIN_SIMBOLOS) continue;
  simbolosPorDia.push(g.length);
  for(const m of METRICAS){
    // rango PROMEDIO en los empates: la mitad de las celdas empatan en cero y un orden arbitrario
    // dentro del empate metería ruido que parecería señal.
    const v=g.filter(f=>f[m]!=null && Number.isFinite(f[m])).sort((x,y)=>x[m]-y[m]);
    let i=0;
    while(i<v.length){
      let j=i; while(j+1<v.length && v[j+1][m]===v[i][m]) j++;
      const r = v.length>1 ? ((i+j)/2)/(v.length-1) : 0.5;
      for(let k=i;k<=j;k++) v[k][`q_${m}`]=r;
      i=j+1;
    }
  }
  for(const h of HORIZ){
    for(const campo of [`mov${h}`,`ret${h}`,`abs${h}`]){
      const v=g.filter(f=>f[campo]!=null).map(f=>f[campo]);
      const mu = v.length ? v.reduce((a,x)=>a+x,0)/v.length : null;
      for(const f of g) f[`d_${campo}`] = (mu!=null && f[campo]!=null) ? f[campo]-mu : null;
    }
  }
  buenos.push(...g);
}
simbolosPorDia.sort((a,b)=>a-b);
const nd=new Set(buenos.map(f=>f.fecha)).size;
console.log(`PANEL: ${buenos.length.toLocaleString("es-ES")} filas · ${nd} dias · ${new Set(buenos.map(f=>f.ticker)).size} tickers · mediana tickers/dia ${simbolosPorDia[Math.floor(simbolosPorDia.length/2)]}`);
const dd=[...new Set(buenos.map(f=>f.fecha))].sort();
console.log(`  dias: ${dd[0]} -> ${dd.at(-1)} · antes del 16-jul ${dd.filter(x=>x<"2026-07-16").length} · despues ${dd.filter(x=>x>="2026-07-16").length}`);
for(const h of HORIZ){ const c=buenos.filter(f=>f[`mov${h}`]!=null); console.log(`  con mov${h}: ${c.length.toLocaleString("es-ES")} filas · ${new Set(c.map(f=>f.fecha)).size} dias`); }

fs.writeFileSync(path.join(RAIZ,SALIDA), JSON.stringify(buenos));
console.log(`\nOK ${path.join(RAIZ,"urg-panel.json")}`);
