// INGREDIENTE · LADO — construcción del panel (símbolo, día) → métrica + retorno FUTURO.
//
// QUÉ ES LA SEÑAL. `side` dice quién CRUZÓ el spread en cada operación: ASKSIDE/AT_ASK/ABOVE_ASK
// = lo inició un comprador; BIDSIDE/AT_BID/BELOW_BID = lo inició un vendedor; MIDMKT = nadie
// (negociado, no agresivo) y se descarta. Con eso se mide el posicionamiento FORZADO del creador
// de mercado en vez de suponerlo.
//
// NADA DE FUTURO:
//   · la métrica de un día D usa SÓLO operaciones con hora ET < CORTE (11:00 / 12:00 / 14:00).
//   · el retorno es cierre(D) → cierre(D+h). El cierre de D es POSTERIOR al corte, así que
//     todo lo que se predice está en el futuro respecto a lo observado.
//   · la normalización (dividir por la prima dirigida total de ESE día y ESE símbolo) usa sólo
//     datos del propio corte. No hay ninguna estadística calculada con la muestra completa.
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";

const RAIZ = path.join("scripts","cache-theta","marketsnack");
const DIR  = path.join(RAIZ,"flujo-100k");
const CH   = path.join(RAIZ,"aux","chart-all");
const CORTES = [11*60, 12*60, 14*60];              // minutos ET
const MIN_OPS = 10;                                // ops dirigidas mínimas por (símbolo, día)
const MIN_SIMBOLOS = 20;                           // símbolos mínimos para que el corte transversal valga

// índices → ETF que SÍ cotiza y del que SÍ hay precio. Es una SUSTITUCIÓN, se declara.
const PROXY = { SPX:"SPY", SPXW:"SPY", XSP:"SPY", NDX:"QQQ", NDXP:"QQQ", RUT:"IWM" };
// apalancados/inversos: su retorno es 2-3x y desequilibraría una media transversal sin ser señal
const APALANCADOS = new Set(["TQQQ","SOXL","SQQQ","SOXS","UVXY","TZA","TNA","SPXU","UPRO","LABU","LABD","YINN","FNGU","NVDL","TSLL","BOIL","KOLD","VXX","SVIX","UVIX"]);

const COMPRA = new Set(["ABOVE_ASK","AT_ASK","ASKSIDE"]);
const VENTA  = new Set(["BELOW_BID","AT_BID","BIDSIDE"]);

const parseOcc = (s)=>{ if(!s||s.length<16) return null;
  const k=s.slice(-8),t=s.slice(-9,-8),d=s.slice(-15,-9),u=s.slice(0,-15);
  if(!/^\d{8}$/.test(k)||!/^[CP]$/.test(t)||!/^\d{6}$/.test(d)||!u) return null;
  return { u, call: t==="C" }; };

// ── precios: cierre diario por ticker (verificado contra ThetaData: 242/243 exactos) ─────────
const cierres = new Map();   // ticker -> { fechas:[], cierre:[], idx:Map }
for(const f of fs.readdirSync(CH)){
  if(!f.endsWith(".json.gz")) continue;
  const T = f.replace(".json.gz","");
  let j; try { j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CH,f))).toString("utf8")); } catch { continue; }
  const d = j?.data ?? []; if(d.length < 60) continue;
  const fechas = d.map(p=>p.t.slice(0,10)), cierre = d.map(p=>p.v);
  cierres.set(T, { fechas, cierre, idx: new Map(fechas.map((x,i)=>[x,i])) });
}
console.log(`precios en caché: ${cierres.size} tickers`);

// ── agregado por (corte, ticker, día) ────────────────────────────────────────────────────────
const dias = fs.readdirSync(DIR).filter(f=>f.endsWith(".jsonl.gz")).map(f=>f.slice(0,10)).sort();
const A = CORTES.map(()=> new Map());   // clave `${T}|${dia}` -> acumuladores
let leidas=0, sinLado=0, cruzadas=0, sinProxy=0;

for(const dia of dias){
  const ls = zlib.gunzipSync(fs.readFileSync(path.join(DIR,`${dia}.jsonl.gz`))).toString("utf8").split("\n");
  for(const l of ls){ if(!l) continue; const r=JSON.parse(l); leidas++;
    if(r.side==null){ sinLado++; continue; }
    const comp = COMPRA.has(r.side), vend = VENTA.has(r.side);
    if(!comp && !vend) continue;                       // MIDMKT: no lo inició nadie
    if(r.ask_price===0 || r.bid_price===0 || (r.ask_price!=null && r.bid_price!=null && r.ask_price < r.bid_price)){ cruzadas++; continue; }
    const o = parseOcc(r.symbol); if(!o) continue;
    let T = PROXY[o.u] ?? o.u;
    if(APALANCADOS.has(T)) continue;
    if(!cierres.has(T)){ sinProxy++; continue; }
    const minET = (Date.parse(r.timestamp) - 4*3600e3)/60000 % 1440;
    const p = r.premium || 0;
    const dl = Number.isFinite(r.delta) ? r.delta : null;
    const sg = comp ? 1 : -1;
    for(let c=0;c<CORTES.length;c++){
      if(minET >= CORTES[c]) continue;
      const k = `${T}|${dia}`;
      let a = A[c].get(k);
      if(!a){ a = { T, dia, n:0, Cc:0, Cv:0, Pc:0, Pv:0, dn:0, dnDen:0 }; A[c].set(k,a); }
      a.n++;
      if(o.call){ if(comp) a.Cc+=p; else a.Cv+=p; } else { if(comp) a.Pc+=p; else a.Pv+=p; }
      if(dl!=null){ a.dn += sg*dl*p; a.dnDen += p; }
    }
  }
  process.stdout.write(`\r  ${dia}  ${leidas.toLocaleString("es-ES")} leídas   `);
}
console.log(`\nleídas ${leidas.toLocaleString("es-ES")} · side nulo ${sinLado} · cruzadas ${cruzadas} · sin precio ni proxy ${sinProxy.toLocaleString("es-ES")}`);

// ── panel: métricas + retornos futuros ───────────────────────────────────────────────────────
const HORIZ = [1,5,20];
const salida = {};
for(let c=0;c<CORTES.length;c++){
  const filas = [];
  for(const a of A[c].values()){
    if(a.n < MIN_OPS) continue;
    const Tot = a.Cc + a.Cv + a.Pc + a.Pv;
    if(!(Tot > 0)) continue;
    const s = cierres.get(a.T); const i = s.idx.get(a.dia);
    if(i == null) continue;                       // el ticker no tiene barra ese día
    const p0 = s.cierre[i]; if(!(p0>0)) continue;
    const rets = {};
    for(const h of HORIZ){ const j=i+h; rets[`r${h}`] = j < s.cierre.length ? s.cierre[j]/p0 - 1 : null; }
    filas.push({
      ticker: a.T, fecha: a.dia, n: a.n, primaDirigida: Tot,
      netoCall : (a.Cc - a.Cv) / Tot,
      netoPut  : (a.Pc - a.Pv) / Tot,
      direccion: (a.Cc - a.Cv - a.Pc + a.Pv) / Tot,
      deltaNeto: a.dnDen > 0 ? a.dn / a.dnDen : null,
      ...rets,
    });
  }
  // ── rango transversal DENTRO de cada día (0=más bajo, 1=más alto) ──
  const porDia = new Map();
  for(const f of filas){ let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push(f); }
  const buenos = [];
  for(const [dia,g] of porDia){
    if(g.length < MIN_SIMBOLOS) continue;
    for(const m of ["netoCall","netoPut","direccion","deltaNeto"]){
      const v = g.filter(f=>f[m]!=null).sort((x,y)=>x[m]-y[m]);
      v.forEach((f,i)=>{ f[`q_${m}`] = v.length>1 ? i/(v.length-1) : 0.5; });
    }
    // retorno demediado: lo que gana de verdad una cartera larga-corta neutral al mercado
    for(const h of HORIZ){
      const v = g.filter(f=>f[`r${h}`]!=null).map(f=>f[`r${h}`]);
      const mu = v.length ? v.reduce((a,x)=>a+x,0)/v.length : null;
      for(const f of g) f[`d${h}`] = (mu!=null && f[`r${h}`]!=null) ? f[`r${h}`]-mu : null;
    }
    buenos.push(...g);
  }
  const et = `${String(Math.floor(CORTES[c]/60)).padStart(2,"0")}:${String(CORTES[c]%60).padStart(2,"0")}`;
  const nd = new Set(buenos.map(f=>f.fecha)).size;
  console.log(`corte ${et} ET → ${buenos.length} filas · ${nd} días · ${new Set(buenos.map(f=>f.ticker)).size} tickers · mediana símbolos/día ${(()=>{const a=[...porDia.values()].filter(g=>g.length>=MIN_SIMBOLOS).map(g=>g.length).sort((x,y)=>x-y);return a[Math.floor(a.length/2)]??0;})()}`);
  salida[et] = buenos;
}
fs.writeFileSync("scripts/marketsnack/lado-panel.json", JSON.stringify(salida));
console.log(`\n✓ scripts/marketsnack/lado-panel.json`);
