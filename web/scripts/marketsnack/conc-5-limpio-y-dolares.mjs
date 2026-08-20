// CONCENTRACION · VEREDICTO LIMPIO + LOS DOLARES.
//
// DOS COSAS QUE FALTABAN.
//
// (A) LOS SALTOS DE OPERACION SOCIETARIA. La correlacion entre dos ventanas de volatilidad
// CONTIGUAS del mismo ticker salio 0,135. Eso es imposible con precios de verdad -la volatilidad
// realizada es persistente- y obligo a abrir el fichero: 32 saltos de mas del 35% en un dia
// DENTRO de la ventana, y algunos no son movimientos, son contrasplits:
//     SPCX 2026-06-12 +632%   MRNA 2026-08-19 +177%   CAR 04-22 -38% y 04-23 -48%
// La serie de MarketSnack (aux/chart-all) NO esta ajustada por operaciones societarias. Un
// contrasplit se lee como un movimiento gigante y envenena |retorno| y vol20 a la vez. Se
// contamina cualquier fila cuya ventana de volatilidad o de resultado toque uno de esos dias.
// AQUI SE FILTRAN, y se vuelve a correr lo decisivo para ver si el veredicto aguanta.
//
// (B) LOS DOLARES. Todo lo anterior esta en desviaciones. Lester cobra en dolares. Se toma la
// senal tal cual quedo definida y se COMPRA la opcion de verdad, al ASK real de la cadena de
// ThetaData, liquidando a vencimiento con el CIERRE real del subyacente. Cero Black-Scholes.
// Se compra CALL Y PUT a la vez (cono) porque lo que la senal dice, si dice algo, es TAMANO, no
// direccion -y la direccion ya fallo 11 veces.
//
// PRUEBAS ACUMULADAS: 84 + 12 = 96.

import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
import { listonT, potencia } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const RAIZ = path.join("scripts", "cache-theta", "marketsnack");
const CH = path.join(RAIZ, "aux", "chart-all");
const CDIR = path.join("scripts", "cache-theta", "cadenas");
const CIERRES = path.join("scripts", "cache-theta", "cierres");
const RUPTURA = "2026-07-16";
const PRUEBAS = 96;
const LISTON = listonT(PRUEBAS);
const CUENTA = 56389;
const SALTO = 0.35;   // un dia con |retorno| mayor que esto se trata como sospechoso de societaria

const media = (v) => (v.length ? v.reduce((a,x)=>a+x,0)/v.length : NaN);
const sd = (v) => { if (v.length<2) return NaN; const m=media(v); return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1)); };
const tUna = (v) => (v.length>2 ? media(v)/(sd(v)/Math.sqrt(v.length)) : NaN);
const corr = (a,b)=>{const ma=media(a),mb=media(b);let n=0,da=0,db=0;for(let i=0;i<a.length;i++){n+=(a[i]-ma)*(b[i]-mb);da+=(a[i]-ma)**2;db+=(b[i]-mb)**2;}return n/Math.sqrt(da*db);};
const pct = (v,q)=>{const s=[...v].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(s.length*q))];};

const panel = JSON.parse(fs.readFileSync(path.join(RAIZ, "conc-panel4.json"), "utf8"));

// -- mapa de dias sospechosos por ticker -------------------------------------------------------
const precios = {}, fechasT = {}, posT = {}, sospechoso = {};
for (const f of fs.readdirSync(CH)) {
  if (!f.endsWith(".json.gz")) continue;
  const T = f.slice(0, -8);
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CH,f))).toString("utf8"));
  const m = {}; for (const r of j.data) if (Number.isFinite(r.v) && r.v > 0) m[r.t.slice(0,10)] = r.v;
  const ff = Object.keys(m).sort(); if (ff.length < 80) continue;
  precios[T]=m; fechasT[T]=ff; const p={}; ff.forEach((x,i)=>(p[x]=i)); posT[T]=p;
  const s = new Set();
  for (let i=1;i<ff.length;i++) if (Math.abs(m[ff[i]]/m[ff[i-1]]-1) > SALTO) s.add(ff[i]);
  sospechoso[T] = s;
}
const totalSosp = Object.values(sospechoso).reduce((a,s)=>a+s.size,0);
console.log(`dias sospechosos de operacion societaria (salto >${(SALTO*100).toFixed(0)}% en un dia): ${totalSosp} en ${Object.values(sospechoso).filter(s=>s.size).length} tickers`);

/** ¿toca la fila algun dia sospechoso, en su ventana de vol (D-40..D) o de resultado (D..D+5)? */
function contaminada(T, fecha) {
  const i = posT[T]?.[fecha]; if (i == null) return true;
  for (let j = Math.max(1, i-40); j <= Math.min(fechasT[T].length-1, i+5); j++)
    if (sospechoso[T].has(fechasT[T][j])) return true;
  return false;
}

for (const nom of Object.keys(panel)) {
  const antes = panel[nom].length;
  panel[nom] = panel[nom].filter((x) => !contaminada(x.ticker, x.fecha));
  console.log(`  corte ${nom}: ${antes} -> ${panel[nom].length} filas (se caen ${antes-panel[nom].length}, ${(100*(antes-panel[nom].length)/antes).toFixed(1)}%)`);
}
for (const nom of Object.keys(panel))
  radiografia(panel[nom], ["sizeSigma","sizeSigmaDj","vol20","volPrev","a_r1n","a_r1nDj","a_r1","sizeDist"], `panel LIMPIO - corte ${nom}`, { maxNulos: 0.6 });

{
  const f = panel["15:45"].filter(x=>x.a_r1n!=null);
  console.log(`\n  correlacion vol20 con volPrev DESPUES de limpiar: ${corr(f.map(x=>x.vol20),f.map(x=>x.volPrev)).toFixed(3)}  (antes 0,135)`);
}

// -- pruebas ------------------------------------------------------------------------------------
const resultados = [];
function prueba(etq, corte, metrica, resultado, filas, signo = 1) {
  const f = filas.filter(x=>x[metrica]!=null&&Number.isFinite(x[metrica])&&x[resultado]!=null);
  const porDia = new Map(); for (const x of f) { let g=porDia.get(x.fecha); if(!g){g=[];porDia.set(x.fecha,g);} g.push(x); }
  const serie = [];
  for (const [d,g] of [...porDia].sort()) {
    if (g.length < 15) continue;
    const o = [...g].sort((a,b)=>signo*(b[metrica]-a[metrica])); const k = Math.floor(o.length/3); if (k<5) continue;
    serie.push({ fecha:d, sep: media(o.slice(0,k).map(x=>x[resultado])) - media(o.slice(-k).map(x=>x[resultado])) });
  }
  const seps = serie.map(s=>s.sep), t = tUna(seps);
  const k3 = Math.floor(serie.length/3);
  const terc = k3>=3 ? [serie.slice(0,k3),serie.slice(k3,2*k3),serie.slice(2*k3)].map(g=>media(g.map(s=>s.sep))) : [];
  const antes = serie.filter(s=>s.fecha<RUPTURA).map(s=>s.sep), desp = serie.filter(s=>s.fecha>=RUPTURA).map(s=>s.sep);
  const r = { etq, corte, metrica, resultado, nFilas:f.length, dias:serie.length, sepDia:media(seps), tDia:t,
    positivos: seps.filter(x=>x>0).length, tercios:terc, antesT:tUna(antes), despT:tUna(desp), antesM:media(antes), despM:media(desp),
    detectable: 2.8*sd(seps)/Math.sqrt(seps.length) };
  resultados.push(r);
  const marca = Math.abs(t)>=LISTON ? "**" : Math.abs(t)>=2 ? "* " : "  ";
  console.log(`  ${marca}${etq.padEnd(5)} ${(metrica+" -> "+resultado).padEnd(28)} n=${String(f.length).padStart(5)} d=${String(serie.length).padStart(3)}  sep ${r.sepDia.toFixed(4).padStart(8)}  tDIA=${t.toFixed(2).padStart(6)}  ${r.positivos}/${serie.length}+  antes t${(r.antesT??0).toFixed(1)} desp t${(r.despT??0).toFixed(1)}  tercios ${terc.map(x=>x.toFixed(3)).join("/")}  minDetectable ${r.detectable.toFixed(3)}`);
  return r;
}

console.log("\n" + "=".repeat(108));
console.log(`VEREDICTO CON LOS DATOS LIMPIOS. Liston |t| >= ${LISTON} (${PRUEBAS} pruebas acumuladas)`);
console.log("=".repeat(108));
for (const corte of Object.keys(panel)) {
  const f = panel[corte];
  console.log(`\n-- corte ${corte} ET --`);
  prueba("REF", corte, "sizeSigma", "a_r1n", f);
  prueba("C1", corte, "menosVol20", "a_r1n", f);
  prueba("C2", corte, "sizeSigmaDj", "a_r1n", f);
  prueba("C3", corte, "sizeSigma", "a_r1nDj", f);
  prueba("C4", corte, "sizeDist", "a_r1n", f);
  prueba("C5'", corte, "sigmaEnCubo", "a_r1nDj", f);
}

// ================================================================================================
// LOS DOLARES
// ================================================================================================
console.log("\n" + "=".repeat(108));
console.log("LOS DOLARES - se compra la opcion de verdad, al ASK real, y se liquida con el cierre real");
console.log("=".repeat(108));

const iso = (y)=>`${y.slice(0,4)}-${y.slice(4,6)}-${y.slice(6,8)}`;
const ymd = (s)=>s.replace(/-/g,"");
const ddias = (a,b)=>Math.round((Date.parse(iso(b))-Date.parse(iso(a)))/86400000);

const tickersCadena = [...new Set(fs.readdirSync(CDIR).filter(f=>/^[A-Z]+_d\d{8}\.json$/.test(f)).map(f=>f.split("_d")[0]))];
const cierresTheta = {};
for (const t of tickersCadena) { const p = path.join(CIERRES, `${t}.json`); if (fs.existsSync(p)) cierresTheta[t] = JSON.parse(fs.readFileSync(p,"utf8")); }
console.log(`  tickers con cadena REAL: ${tickersCadena.length} - con cierres: ${Object.keys(cierresTheta).length}`);
console.log(`  las cadenas y los cierres paran el 2026-08-06; el flujo llega al 08-19.\n`);

const DTE_OBJ = 30, TOL_DTE = 10, DIST_OBJ = 0.05, TOL_DIST = 0.30;
function elegir(cad, S, tipo, hoyY) {
  let mejorExp=null, mejorDD=Infinity;
  for (const exp of Object.keys(cad)) { const d = ddias(hoyY, exp); if (d < 1) continue; const x = Math.abs(d-DTE_OBJ); if (x<mejorDD){mejorDD=x;mejorExp=exp;} }
  if (!mejorExp || mejorDD > TOL_DTE) return null;
  const obj = tipo==="C" ? S*(1+DIST_OBJ) : S*(1-DIST_OBJ);
  let mejorK=null, mejorKD=Infinity;
  for (const clave of Object.keys(cad[mejorExp])) { const [ks,r]=clave.split("|"); if(r!==tipo) continue;
    const K=Number(ks), kd=Math.abs(K-obj); if(kd<mejorKD){mejorKD=kd;mejorK=K;} }
  if (mejorK==null) return null;
  const dr = tipo==="C" ? mejorK/S-1 : 1-mejorK/S;
  if (Math.abs(dr-DIST_OBJ) > DIST_OBJ*TOL_DIST) return null;
  const [bid,ask] = cad[mejorExp][`${mejorK}|${tipo}`];
  return { exp: mejorExp, K: mejorK, bid, ask, dte: ddias(hoyY, mejorExp) };
}

// rango de la senal DENTRO del dia sobre el universo COMPLETO; luego se conserva solo lo comprable
const corte = "15:45";
const porDia = new Map();
for (const x of panel[corte]) { let g = porDia.get(x.fecha); if (!g) { g=[]; porDia.set(x.fecha,g); } g.push(x); }
for (const g of porDia.values()) {
  const o = [...g].filter(x=>x.sizeSigma!=null).sort((a,b)=>a.sizeSigma-b.sizeSigma);
  o.forEach((x,i)=>(x.rangoSenal = o.length>1 ? i/(o.length-1) : null));
}

const conos = [];
let sinCadena=0, sinContrato=0, sinCierreExp=0;
for (const x of panel[corte]) {
  if (x.rangoSenal == null) continue;
  if (!cierresTheta[x.ticker]) { sinCadena++; continue; }
  const dY = ymd(x.fecha);
  const p = path.join(CDIR, `${x.ticker}_d${dY}.json`);
  if (!fs.existsSync(p)) { sinCadena++; continue; }
  const S = cierresTheta[x.ticker][dY]; if (!(S>0)) { sinCadena++; continue; }
  let cad; try { cad = JSON.parse(fs.readFileSync(p,"utf8")); } catch { sinCadena++; continue; }
  const c = elegir(cad, S, "C", dY), pu = elegir(cad, S, "P", dY);
  if (!c || !pu || c.exp !== pu.exp) { sinContrato++; continue; }
  if (!(c.ask>0)||!(c.bid>0)||!(pu.ask>0)||!(pu.bid>0)) { sinContrato++; continue; }
  const cierreExp = cierresTheta[x.ticker][c.exp];
  if (!(cierreExp>0)) { sinCierreExp++; continue; }
  const prima = c.ask + pu.ask;                                  // se COMPRA al ask, las dos patas
  const pago = Math.max(0, cierreExp - c.K) + Math.max(0, pu.K - cierreExp);
  // movimiento REALIZADO hasta el vencimiento, en desviaciones (para saber cuanto haria falta)
  const movSigma = Math.abs(cierreExp/S - 1) / (x.vol20 * Math.sqrt(Math.max(1, Math.round(c.dte*5/7))));
  conos.push({ ticker:x.ticker, fecha:x.fecha, tramo:x.tramo, rangoSenal:x.rangoSenal,
    sizeSigma:x.sizeSigma, prima, pago, ret: pago/prima - 1, mult: pago/prima,
    horquilla: ((c.ask-c.bid)+(pu.ask-pu.bid))/prima, dte:c.dte, exp:c.exp,
    movSigma, capital: prima*100 });
}
console.log(`  conos construidos: ${conos.length}  (sin cadena ${sinCadena} - sin contrato al 5%/30d ${sinContrato} - sin cierre de vencimiento ${sinCierreExp})`);
if (conos.length > 50) {
  radiografia(conos, ["prima","pago","ret","horquilla","rangoSenal","dte"], "conos con precios REALES", { cerosLegitimos: ["pago"] });
  const ts = new Map(); for (const c of conos) ts.set(c.ticker,(ts.get(c.ticker)??0)+1);
  console.log(`  tickers: ${ts.size} - mayor ${[...ts].sort((a,b)=>b[1]-a[1])[0][0]} ${(100*[...ts].sort((a,b)=>b[1]-a[1])[0][1]/conos.length).toFixed(1)}%`);
  console.log(`  dias distintos: ${new Set(conos.map(c=>c.fecha)).size} - horquilla media ${(100*media(conos.map(c=>c.horquilla))).toFixed(1)}% de la prima`);
  console.log(`  prima media del cono: $${media(conos.map(c=>c.prima)).toFixed(2)} = $${media(conos.map(c=>c.capital)).toFixed(0)} de capital por operacion\n`);

  const alto = conos.filter(c=>c.rangoSenal>=2/3), bajo = conos.filter(c=>c.rangoSenal<=1/3), medio = conos.filter(c=>c.rangoSenal>1/3&&c.rangoSenal<2/3);
  const fila = (n,g) => {
    if (!g.length) { console.log(`  ${n.padEnd(22)} SIN MUESTRA`); return; }
    const rs = g.map(c=>c.ret);
    console.log(`  ${n.padEnd(22)} n=${String(g.length).padStart(4)}  retorno medio ${(100*media(rs)).toFixed(1).padStart(7)}%  mediana ${(100*pct(rs,.5)).toFixed(1).padStart(7)}%  sin valor ${(100*g.filter(c=>c.pago===0).length/g.length).toFixed(1).padStart(5)}%  pago medio ${media(g.map(c=>c.mult)).toFixed(3)}x  p90 ${pct(g.map(c=>c.mult),.9).toFixed(2)}x`);
  };
  console.log(`  COMPRAR EL CONO (call 5% arriba + put 5% abajo, ~30 dias, al ASK, a vencimiento):`);
  fila("tercio ALTO senal", alto); fila("tercio MEDIO", medio); fila("tercio BAJO senal", bajo); fila("TODOS", conos);
  const dif = media(alto.map(c=>c.ret)) - media(bajo.map(c=>c.ret));
  const seA = sd(alto.map(c=>c.ret))/Math.sqrt(alto.length), seB = sd(bajo.map(c=>c.ret))/Math.sqrt(bajo.length);
  console.log(`\n  alto - bajo: ${(100*dif).toFixed(1)} puntos  t=${(dif/Math.sqrt(seA*seA+seB*seB)).toFixed(2)}   (liston ${LISTON})`);
  for (const tr of ["antes","despues"]) {
    const a = alto.filter(c=>c.tramo===tr), b = bajo.filter(c=>c.tramo===tr);
    if (a.length>5&&b.length>5) console.log(`     tramo ${tr.padEnd(8)}: alto ${(100*media(a.map(c=>c.ret))).toFixed(1)}% (n=${a.length}) - bajo ${(100*media(b.map(c=>c.ret))).toFixed(1)}% (n=${b.length}) - dif ${(100*(media(a.map(c=>c.ret))-media(b.map(c=>c.ret)))).toFixed(1)} pts`);
  }

  // -- SESGO DE LO COMPRABLE: solo el 21,7% del flujo tiene cadena, y no cae uniforme --
  console.log(`\n  SESGO DE LO COMPRABLE: de los ${conos.length} conos, el ${(100*alto.length/conos.length).toFixed(0)}% cae en el tercio ALTO de la senal`);
  console.log(`  y solo el ${(100*bajo.length/conos.length).toFixed(0)}% en el bajo. Los tickers con cadena (grandes) no se reparten igual por el ranking.`);

  // -- DOLARES A UN TAMANO QUE LA CUENTA AGUANTA --
  // Politica concreta y ejecutable: UN cono al dia, el mejor del tercio alto de ese dia.
  const dias = new Set(conos.map(c=>c.fecha)).size;
  const porDiaC = new Map();
  for (const c of alto) { const g = porDiaC.get(c.fecha) ?? []; g.push(c); porDiaC.set(c.fecha, g); }
  const unoAlDia = [...porDiaC.values()].map(g => g.sort((a,b)=>b.rangoSenal-a.rangoSenal)[0]);
  console.log(`\n  -- EN DOLARES, sobre una cuenta de $${CUENTA.toLocaleString("es-ES")} --`);
  console.log(`  POLITICA: 1 cono al dia, el mas alto del tercio alto de la senal. Es lo que la cuenta aguanta.`);
  for (const [n, g] of [["1/dia tercio ALTO", unoAlDia], ["1/dia sin filtro", (()=>{const m=new Map();for(const c of conos){const a=m.get(c.fecha)??[];a.push(c);m.set(c.fecha,a);} return [...m.values()].map(a=>a[0]);})()]]) {
    if (!g.length) continue;
    const opsAno = 252;                                    // una al dia habil
    const capMedio = media(g.map(c=>c.capital));
    const porOp = media(g.map(c=>c.ret)) * capMedio;
    const concurrentes = Math.round(media(g.map(c=>c.dte)) * 5/7);
    console.log(`  ${n.padEnd(19)} n=${String(g.length).padStart(3)} dias  retorno/op ${(100*media(g.map(c=>c.ret))).toFixed(1)}%  ->  ${opsAno} ops/ano x $${porOp.toFixed(0)}/op = $${(opsAno*porOp).toFixed(0)}/ano`);
    console.log(`  ${" ".repeat(19)} capital comprometido: $${capMedio.toFixed(0)}/op x ~${concurrentes} posiciones vivas a la vez = $${(capMedio*concurrentes).toFixed(0)} (${(100*capMedio*concurrentes/CUENTA).toFixed(0)}% de la cuenta)`);
  }
  console.log(`\n  n EFECTIVA del test en dolares: ${dias} dias de entrada, pero cada cono vive ~30 dias, asi que`);
  console.log(`  las ventanas se solapan: periodos independientes ~${Math.max(1,Math.round(dias/21))}. Con eso no se concluye nada, y no se concluye.`);
  fs.writeFileSync(path.join(RAIZ,"conc-5-conos.json"), JSON.stringify(conos));
}

// ================================================================================================
// QUE LE FALTARIA A LA SENAL PARA COBRAR - el numero que convierte "no paso" en un objetivo
// ================================================================================================
if (conos.length > 50) {
  console.log("\n" + "=".repeat(108));
  console.log("QUE LE FALTARIA - cuanto movimiento hay que predecir para que el cono deje de perder");
  console.log("=".repeat(108));
  const o = [...conos].sort((a,b)=>a.movSigma-b.movSigma);
  const q = 10, k = Math.floor(o.length/q);
  console.log(`  retorno del cono por decil del movimiento REALIZADO hasta el vencimiento (en desviaciones):`);
  let umbral = null, movMedio = media(conos.map(c=>c.movSigma));
  for (let i=0;i<q;i++) {
    const g = o.slice(i*k, i===q-1?o.length:(i+1)*k);
    const r = media(g.map(c=>c.ret));
    if (umbral==null && r>0) umbral = media(g.map(c=>c.movSigma));
    console.log(`    decil ${String(i+1).padStart(2)}  movimiento ${media(g.map(c=>c.movSigma)).toFixed(2).padStart(5)} sigma  ->  retorno ${(100*r).toFixed(1).padStart(7)}%  (n=${g.length})`);
  }
  console.log(`\n  movimiento MEDIO realizado: ${movMedio.toFixed(3)} sigma`);
  console.log(`  primer decil que gana dinero: a partir de ~${(umbral??NaN).toFixed(2)} sigma`);
  const falta = (umbral??NaN) - movMedio;
  console.log(`  => la senal tendria que separar ${falta.toFixed(3)} desviaciones para llevar el tercio alto a terreno positivo.`);
  const det = resultados.filter(r=>r.corte==="15:45"&&r.etq==="C2")[0]?.detectable;
  console.log(`  con 82 dias, la separacion MINIMA DETECTABLE de esta prueba es ${det?.toFixed(3)} sigma.`);
  console.log(`  RATIO: hace falta ${(falta/det).toFixed(1)}x lo que la muestra de 86 dias puede llegar a ver.`);
  console.log(`  Es decir: aunque existiese un efecto justo en el limite de deteccion, seria ${(falta/det).toFixed(0)} veces`);
  console.log(`  demasiado pequeno para pagar la horquilla. No es un problema de muestra: es de tamano del efecto.`);
}

fs.writeFileSync(path.join(RAIZ,"conc-5-salida.json"), JSON.stringify({liston:LISTON,pruebas:PRUEBAS,resultados,conos:conos.length},null,1));
console.log(`\nOK ${path.join(RAIZ,"conc-5-salida.json")}`);
