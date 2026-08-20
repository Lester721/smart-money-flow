// URGENCIA · EL DINERO — traducir la única candidata a dólares, con precios REALES de opciones.
//
// QUÉ SE COMPRA. La señal de tamaño no tiene lado, así que el vehículo es el CONO: call ATM +
// put ATM del mismo vencimiento (~7 días). Se COMPRA al ASK en el cierre de D y se VENDE al BID
// en el cierre de D+1. Cero Black-Scholes, cero punto medio.
//
// TRAMPA DEL FICHERO DE CADENAS: el descargador tira toda fila con bid<=0. Si una pata falta en
// la cadena de D+1 es porque no tenía bid: se liquida a CERO, no se descarta. Descartarla sería
// quedarse sólo con las ganadoras.
//
// LÍMITE DECLARADO: sólo 19 de los 172 tickers del panel tienen cadena, y la mediana es de 10 por
// día. Con 10 no se puede partir el día en tercios. Por eso la SEÑAL se calcula sobre el universo
// completo (172 tickers) y la OPERACIÓN sólo se coloca en los que se pueden precivar. Es lo que
// haría un operador de verdad: mira todo el mercado, opera donde tiene precio.
import fs from "node:fs"; import path from "node:path";
import { tWelch, listonT } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const RAIZ = path.join("scripts","cache-theta","marketsnack");
const CDIR = path.join("scripts","cache-theta","cadenas");
const CIERRES = path.join("scripts","cache-theta","cierres");
const CUENTA = 56389;
const DTE_OBJ = 7, TOL_DTE = 4, TOL_ATM = 0.02;

const P = JSON.parse(fs.readFileSync(path.join(RAIZ,"urg-panel.json"),"utf8"));
const ymd=(s)=>s.replace(/-/g,"");
const iso=(y)=>`${y.slice(0,4)}-${y.slice(4,6)}-${y.slice(6,8)}`;
const ddias=(a,b)=>Math.round((Date.parse(iso(b))-Date.parse(iso(a)))/86400000);
const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:NaN;
const pctl=(v,q)=>{const s=[...v].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(s.length*q))];};

const tickersCad = new Set(fs.readdirSync(CDIR).filter(f=>/^[A-Z]+_d\d{8}\.json$/.test(f)).map(f=>f.split("_d")[0]));
const cierres={};
for(const t of tickersCad){ const p=path.join(CIERRES,`${t}.json`); if(fs.existsSync(p)) cierres[t]=JSON.parse(fs.readFileSync(p,"utf8")); }
const cache=new Map();
function cadena(t,d){ const k=`${t}|${d}`; if(cache.has(k)) return cache.get(k);
  const p=path.join(CDIR,`${t}_d${d}.json`); let v=null;
  if(fs.existsSync(p)){ try{ v=JSON.parse(fs.readFileSync(p,"utf8")); }catch{} }
  if(cache.size>4000) cache.clear();
  cache.set(k,v); return v; }

/** Call y put ATM del vencimiento más cercano a DTE_OBJ. Devuelve null si no llega. */
function cono(cad, S, hoy){
  let exp=null, dd=Infinity;
  for(const e of Object.keys(cad)){ const d=ddias(hoy,e); if(d<1) continue; const x=Math.abs(d-DTE_OBJ); if(x<dd){dd=x;exp=e;} }
  if(!exp || dd>TOL_DTE) return null;
  let K=null, kd=Infinity;
  for(const clave of Object.keys(cad[exp])){
    const [ks,r]=clave.split("|"); if(r!=="C") continue;
    const k=Number(ks); if(!cad[exp][`${k}|P`]) continue;      // hace falta la put del mismo strike
    const x=Math.abs(k-S); if(x<kd){kd=x;K=k;}
  }
  if(K==null || Math.abs(K/S-1)>TOL_ATM) return null;
  const c=cad[exp][`${K}|C`], p=cad[exp][`${K}|P`];
  if(!c||!p) return null;
  if(!(c[1]>0)||!(p[1]>0)||c[1]<c[0]||p[1]<p[0]) return null;
  return { exp, K, askC:c[1], bidC:c[0], askP:p[1], bidP:p[0], dte:ddias(hoy,exp) };
}

// ── siguiente día hábil con cierre para ese ticker ───────────────────────────────────────────
function siguiente(t, d){ const ks=Object.keys(cierres[t]).sort(); const i=ks.indexOf(d); return (i>=0 && i+1<ks.length) ? ks[i+1] : null; }

const ops=[];
let sinCadena=0, sinCono=0, sinSalida=0, pataMuerta=0;
for(const f of P){
  if(!tickersCad.has(f.ticker) || !cierres[f.ticker]) continue;
  const d0=ymd(f.fecha);
  const S=cierres[f.ticker][d0]; if(!(S>0)) continue;
  const cad=cadena(f.ticker,d0); if(!cad){ sinCadena++; continue; }
  const c=cono(cad,S,d0); if(!c){ sinCono++; continue; }
  const d1=siguiente(f.ticker,d0); if(!d1){ sinSalida++; continue; }
  const cad1=cadena(f.ticker,d1);
  const S1=cierres[f.ticker][d1];
  if(!cad1 || !(S1>0)){ sinSalida++; continue; }
  // SALIDA al BID del cierre de D+1. Pata ausente = sin bid = CERO.
  const e=cad1[c.exp];
  const bC = e && e[`${c.K}|C`] ? e[`${c.K}|C`][0] : 0;
  const bP = e && e[`${c.K}|P`] ? e[`${c.K}|P`][0] : 0;
  if(!e || !e[`${c.K}|C`] || !e[`${c.K}|P`]) pataMuerta++;
  const coste=(c.askC+c.askP)*100;
  const salida=(Math.max(0,bC)+Math.max(0,bP))*100;
  if(!(coste>0)) continue;
  ops.push({
    ticker:f.ticker, fecha:f.fecha, coste, salida, ret:salida/coste-1,
    peaje:((c.askC-c.bidC)+(c.askP-c.bidP))/(c.askC+c.askP),
    empate:(c.askC+c.askP)/S,                 // cuánto tiene que moverse el subyacente para empatar
    movReal:Math.abs(S1/S-1), dte:c.dte, K:c.K, S,
    q_urgCall:f.q_urgCall, q_urgShare:f.q_urgShare, q_urgDirAbs:f.q_urgDirAbs, mov1:f.mov1,
  });
}
console.log(`OPERACIONES con precios reales: ${ops.length}`);
console.log(`  descartes: sin cadena de D ${sinCadena} · sin cono ATM a ~7 dias ${sinCono} · sin cadena/cierre de D+1 ${sinSalida}`);
console.log(`  patas que DESAPARECEN de la cadena de D+1 (bid<=0 -> se liquidan a CERO): ${pataMuerta} (${(pataMuerta/ops.length*100).toFixed(1)}%)`);
console.log(`  dias ${new Set(ops.map(o=>o.fecha)).size} · tickers ${new Set(ops.map(o=>o.ticker)).size} · ${[...new Set(ops.map(o=>o.ticker))].sort().join(" ")}`);

radiografia(ops, ["coste","salida","peaje","empate","movReal","dte"], "conos ATM comprables", { cerosLegitimos:["salida"] });

// ── economía del vehículo, sin señal ─────────────────────────────────────────────────────────
const rets=ops.map(o=>o.ret);
console.log(`\n${"=".repeat(100)}\nEL VEHICULO SIN SEÑAL — cono ATM a ~${DTE_OBJ} dias, comprado al ask y vendido al bid 1 dia despues`);
console.log(`  prima media por cono: $${media(ops.map(o=>o.coste)).toFixed(0)} · mediana $${pctl(ops.map(o=>o.coste),.5).toFixed(0)}`);
console.log(`  PEAJE (horquilla de ida y vuelta como % de la prima): media ${(media(ops.map(o=>o.peaje))*100).toFixed(1)}% · p50 ${(pctl(ops.map(o=>o.peaje),.5)*100).toFixed(1)}%`);
console.log(`  MOVIMIENTO para EMPATAR a vencimiento: ${(media(ops.map(o=>o.empate))*100).toFixed(2)}% del subyacente · el que hubo en 1 dia: ${(media(ops.map(o=>o.movReal))*100).toFixed(2)}%`);
console.log(`  retorno por operacion: ${(media(rets)*100).toFixed(2)}% · p10 ${(pctl(rets,.1)*100).toFixed(1)}% · p50 ${(pctl(rets,.5)*100).toFixed(1)}% · p90 ${(pctl(rets,.9)*100).toFixed(1)}% · max ${(pctl(rets,1)*100).toFixed(1)}%`);
console.log(`  ganadoras: ${(ops.filter(o=>o.ret>0).length/ops.length*100).toFixed(1)}%`);

// ── con la señal: tercio BAJO de urgCall (el que la medicion dice que se mueve MAS) ──────────
console.log(`\n${"=".repeat(100)}\nCON LA SEÑAL — urgCall (rango transversal sobre los 172 tickers, operado solo donde hay precio)`);
const conQ=ops.filter(o=>o.q_urgCall!=null);
const bajo=conQ.filter(o=>o.q_urgCall<=1/3), alto=conQ.filter(o=>o.q_urgCall>=2/3), medio=conQ.filter(o=>o.q_urgCall>1/3&&o.q_urgCall<2/3);
const linea=(nom,g)=>{ if(!g.length){console.log(`  ${nom}: sin operaciones`);return;}
  console.log(`  ${nom.padEnd(26)} n=${String(g.length).padStart(4)} · retorno ${(media(g.map(o=>o.ret))*100).toFixed(2).padStart(7)}% · mov real ${(media(g.map(o=>o.movReal))*100).toFixed(2)}% · mov norm ${media(g.filter(o=>o.mov1!=null).map(o=>o.mov1)).toFixed(3)}x · lo que COSTABA (empate) ${(media(g.map(o=>o.empate))*100).toFixed(2)}% · prima $${media(g.map(o=>o.coste)).toFixed(0)} · gana ${(g.filter(o=>o.ret>0).length/g.length*100).toFixed(1)}%`); };
linea("tercio BAJO urgCall", bajo); linea("tercio MEDIO", medio); linea("tercio ALTO urgCall", alto);
if(bajo.length>3&&alto.length>3) console.log(`  separacion BAJO-ALTO: ${((media(bajo.map(o=>o.ret))-media(alto.map(o=>o.ret)))*100).toFixed(2)} puntos · t=${tWelch(bajo.map(o=>o.ret),alto.map(o=>o.ret)).toFixed(2)}  (liston ${listonT(24)})`);

// ── EL MECANISMO: ¿el movimiento de más ya estaba pagado? ────────────────────────────────────
console.log(`\n  MECANISMO — movimiento de 1 dia dividido por lo que costaba el cono (>1 = se movio mas de lo que pagaste):`);
const razon=(g)=> media(g.map(o=>o.movReal/o.empate));
if(bajo.length&&alto.length){
  console.log(`    BAJO urgCall  mov/empate ${razon(bajo).toFixed(3)}   ·   ALTO urgCall  mov/empate ${razon(alto).toFixed(3)}   ·   MEDIO ${razon(medio).toFixed(3)}`);
  console.log(`    el tercio BAJO se movio un ${((media(bajo.map(o=>o.movReal))/media(alto.map(o=>o.movReal))-1)*100).toFixed(1)}% MAS que el ALTO...`);
  console.log(`    ...pero su cono costaba un ${((media(bajo.map(o=>o.empate))/media(alto.map(o=>o.empate))-1)*100).toFixed(1)}% MAS. El movimiento de mas YA ESTABA EN EL PRECIO.`);
}

// ── mismo test pero partiendo DENTRO del dia entre los tickers con precio (quita el efecto dia) ──
console.log(`\n  CONTRASTE DENTRO DEL DIA (mediana de q_urgCall entre los tickers con precio de ese dia):`);
{
  const pd=new Map(); for(const o of conQ){ let g=pd.get(o.fecha); if(!g){g=[];pd.set(o.fecha,g);} g.push(o); }
  const seps=[]; let nA=0,nB=0; const rB=[],rA=[];
  for(const [,g] of pd){
    if(g.length<6) continue;
    const o=[...g].sort((x,y)=>x.q_urgCall-y.q_urgCall);
    const k=Math.floor(o.length/2);
    const b=o.slice(0,k), a=o.slice(-k);
    seps.push(media(b.map(x=>x.ret))-media(a.map(x=>x.ret))); nB+=b.length; nA+=a.length;
    rB.push(...b.map(x=>x.ret)); rA.push(...a.map(x=>x.ret));
  }
  const m=media(seps); const s=Math.sqrt(seps.reduce((x,y)=>x+(y-m)**2,0)/(seps.length-1));
  console.log(`    ${seps.length} dias · mitad BAJA ${(media(rB)*100).toFixed(2)}% vs mitad ALTA ${(media(rA)*100).toFixed(2)}% · separacion ${(m*100).toFixed(2)} puntos · t=${(m/(s/Math.sqrt(seps.length))).toFixed(2)} · n EFECTIVA ${seps.length} dias`);
}

// ── las otras metricas sobre el subconjunto con precio ───────────────────────────────────────
console.log(`\n  LAS OTRAS METRICAS sobre estas mismas ${conQ.length} operaciones (tercio bajo - tercio alto, en puntos de retorno):`);
for(const m of ["urgShare","urgDirAbs"]){
  const c=ops.filter(o=>o[`q_${m}`]!=null);
  const b=c.filter(o=>o[`q_${m}`]<=1/3), a=c.filter(o=>o[`q_${m}`]>=2/3);
  if(b.length<10||a.length<10){ console.log(`    ${m}: sin muestra`); continue; }
  console.log(`    ${m.padEnd(10)} BAJO n=${String(b.length).padStart(3)} ${(media(b.map(o=>o.ret))*100).toFixed(2)}%  ALTO n=${String(a.length).padStart(3)} ${(media(a.map(o=>o.ret))*100).toFixed(2)}%  sep ${((media(b.map(o=>o.ret))-media(a.map(o=>o.ret)))*100).toFixed(2)} pts  t=${tWelch(b.map(o=>o.ret),a.map(o=>o.ret)).toFixed(2)}`);
}

// ── CUANTO FALTA — el numero que manda ───────────────────────────────────────────────────────
console.log(`\n${"=".repeat(100)}\nCUANTO FALTA PARA QUE PAGUE`);
const rBase=media(rets);
const movBase=media(ops.map(o=>o.movReal));
// El pago de un cono crece de forma casi lineal con el tamano del movimiento. Se estima el factor
// k que haria falta sobre el movimiento medio para que el retorno medio llegue a 0.
const k=1/(1+rBase);
console.log(`  retorno medio del cono: ${(rBase*100).toFixed(2)}% -> el pago tiene que subir x${k.toFixed(3)} (+${((k-1)*100).toFixed(1)}%) para EMPATAR`);
console.log(`  eso es un movimiento medio de ${(movBase*k*100).toFixed(2)}% al dia en vez del ${(movBase*100).toFixed(2)}% que hubo`);
const movNorm=media(ops.filter(o=>o.mov1!=null).map(o=>o.mov1));
console.log(`  en unidades de la medicion (mov1, veces la volatilidad propia): hace falta separar ${((k-1)*movNorm).toFixed(4)}x`);
console.log(`  la mejor separacion MEDIDA en las 24 pruebas fue 0.0925x (urgCall a 1 dia, y con el signo al reves)`);
console.log(`  -> la señal entrega el ${(0.0925/((k-1)*movNorm)*100).toFixed(0)}% de lo que haria falta`);

// ── dolares al año ───────────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(100)}\nDOLARES AL AÑO sobre una cuenta de $${CUENTA.toLocaleString("es-ES")}`);
const nDias=new Set(ops.map(o=>o.fecha)).size;
const opsPorDia = bajo.length/nDias;
const primaMedia = media(bajo.length?bajo.map(o=>o.coste):ops.map(o=>o.coste));
const retSenal = bajo.length? media(bajo.map(o=>o.ret)) : rBase;
for(const [nom,nOps,ret,prima] of [
  ["sin señal (cono al azar)", 252*1, rBase, media(ops.map(o=>o.coste))],
  ["con la señal, 1 cono/dia en el tercio BAJO", 252*1, retSenal, primaMedia],
]){
  console.log(`  ${nom.padEnd(44)} ${nOps} ops/año x $${prima.toFixed(0)} x ${(ret*100).toFixed(2)}% = $${(nOps*prima*ret).toFixed(0)}/año · capital comprometido $${prima.toFixed(0)} por operacion`);
}
console.log(`  (oportunidades reales medidas: ${opsPorDia.toFixed(1)} conos/dia en el tercio bajo sobre ${nDias} dias con precio)`);

fs.writeFileSync(path.join(RAIZ,"urg-dolares.json"), JSON.stringify({
  n:ops.length, dias:nDias, retMedio:rBase, peaje:media(ops.map(o=>o.peaje)), empate:media(ops.map(o=>o.empate)),
  primaMedia:media(ops.map(o=>o.coste)), ganadoras:ops.filter(o=>o.ret>0).length/ops.length,
  bajo:{n:bajo.length,ret:bajo.length?media(bajo.map(o=>o.ret)):null},
  alto:{n:alto.length,ret:alto.length?media(alto.map(o=>o.ret)):null},
  kNecesario:k, movNorm,
},null,1));
console.log(`\nOK ${path.join(RAIZ,"urg-dolares.json")}`);
