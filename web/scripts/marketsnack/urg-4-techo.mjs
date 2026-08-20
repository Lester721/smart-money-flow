// URGENCIA · EL TECHO — dos preguntas que faltaban.
//
//  (A) VALIDAR que la cadena diaria es la foto del CIERRE. Si fuese de otra hora, comprar "al
//      cierre de D" con esos precios sería mentira. Prueba: paridad put-call. Para un mismo
//      strike y vencimiento, C - P + K tiene que dar el precio del subyacente (±dividendo/tipos).
//
//  (B) EL TECHO. Si la señal fuese PERFECTA — si supiéramos de antemano cuánto se va a mover cada
//      ticker — ¿cuánto pagaría el cono? Eso pone un techo a lo que puede valer CUALQUIER señal de
//      tamaño sobre este vehículo, y dice cuánta puntería hace falta para llegar a cero.
import fs from "node:fs"; import path from "node:path";

const RAIZ = path.join("scripts","cache-theta","marketsnack");
const CDIR = path.join("scripts","cache-theta","cadenas");
const CIERRES = path.join("scripts","cache-theta","cierres");
const DTE_OBJ = 7, TOL_DTE = 4, TOL_ATM = 0.02;
const CUENTA = 56389;

const P = JSON.parse(fs.readFileSync(path.join(RAIZ,"urg-panel.json"),"utf8"));
const ymd=(s)=>s.replace(/-/g,"");
const iso=(y)=>`${y.slice(0,4)}-${y.slice(4,6)}-${y.slice(6,8)}`;
const ddias=(a,b)=>Math.round((Date.parse(iso(b))-Date.parse(iso(a)))/86400000);
const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:NaN;
const pctl=(v,q)=>{const s=[...v].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(s.length*q))];};

const tickersCad=new Set(fs.readdirSync(CDIR).filter(f=>/^[A-Z]+_d\d{8}\.json$/.test(f)).map(f=>f.split("_d")[0]));
const cierres={}; for(const t of tickersCad){ const p=path.join(CIERRES,`${t}.json`); if(fs.existsSync(p)) cierres[t]=JSON.parse(fs.readFileSync(p,"utf8")); }
const cache=new Map();
function cadena(t,d){ const k=`${t}|${d}`; if(cache.has(k)) return cache.get(k);
  const p=path.join(CDIR,`${t}_d${d}.json`); let v=null;
  if(fs.existsSync(p)){ try{ v=JSON.parse(fs.readFileSync(p,"utf8")); }catch{} }
  if(cache.size>4000) cache.clear(); cache.set(k,v); return v; }
function cono(cad,S,hoy){
  let exp=null,dd=Infinity;
  for(const e of Object.keys(cad)){ const d=ddias(hoy,e); if(d<1) continue; const x=Math.abs(d-DTE_OBJ); if(x<dd){dd=x;exp=e;} }
  if(!exp||dd>TOL_DTE) return null;
  let K=null,kd=Infinity;
  for(const clave of Object.keys(cad[exp])){ const [ks,r]=clave.split("|"); if(r!=="C") continue;
    const k=Number(ks); if(!cad[exp][`${k}|P`]) continue; const x=Math.abs(k-S); if(x<kd){kd=x;K=k;} }
  if(K==null||Math.abs(K/S-1)>TOL_ATM) return null;
  const c=cad[exp][`${K}|C`],p=cad[exp][`${K}|P`];
  if(!c||!p||!(c[1]>0)||!(p[1]>0)) return null;
  return { exp,K,askC:c[1],bidC:c[0],askP:p[1],bidP:p[0],dte:ddias(hoy,exp) };
}
function siguiente(t,d){ const ks=Object.keys(cierres[t]).sort(); const i=ks.indexOf(d); return (i>=0&&i+1<ks.length)?ks[i+1]:null; }

// ══ (A) PARIDAD PUT-CALL ═════════════════════════════════════════════════════════════════════
const err=[];
for(const f of P){
  if(!tickersCad.has(f.ticker)||!cierres[f.ticker]) continue;
  const d0=ymd(f.fecha); const S=cierres[f.ticker][d0]; if(!(S>0)) continue;
  const cad=cadena(f.ticker,d0); if(!cad) continue;
  const c=cono(cad,S,d0); if(!c) continue;
  const midC=(c.askC+c.bidC)/2, midP=(c.askP+c.bidP)/2;
  err.push((midC-midP+c.K-S)/S);       // deberia ser ~0 (mas el coste de acarreo, decimas de %)
}
console.log(`${"=".repeat(100)}\n(A) VALIDACION — .la cadena diaria es la foto del CIERRE?`);
console.log(`  paridad put-call sobre ${err.length} conos ATM: (C-P+K-S)/S`);
console.log(`    p10 ${(pctl(err,.1)*100).toFixed(3)}% · p50 ${(pctl(err,.5)*100).toFixed(3)}% · p90 ${(pctl(err,.9)*100).toFixed(3)}% · |error| medio ${(media(err.map(Math.abs))*100).toFixed(3)}%`);
console.log(`    Si el p50 esta a decimas de 0, la cadena y el cierre son de la MISMA hora y la compra al cierre es real.`);

// ══ (B) EL TECHO ═════════════════════════════════════════════════════════════════════════════
const ops=[];
for(const f of P){
  if(!tickersCad.has(f.ticker)||!cierres[f.ticker]) continue;
  const d0=ymd(f.fecha); const S=cierres[f.ticker][d0]; if(!(S>0)) continue;
  const cad=cadena(f.ticker,d0); if(!cad) continue;
  const c=cono(cad,S,d0); if(!c) continue;
  const d1=siguiente(f.ticker,d0); if(!d1) continue;
  const cad1=cadena(f.ticker,d1), S1=cierres[f.ticker][d1];
  if(!cad1||!(S1>0)) continue;
  const e=cad1[c.exp];
  const bC=e&&e[`${c.K}|C`]?e[`${c.K}|C`][0]:0, bP=e&&e[`${c.K}|P`]?e[`${c.K}|P`][0]:0;
  const coste=(c.askC+c.askP)*100, salida=(Math.max(0,bC)+Math.max(0,bP))*100;
  if(!(coste>0)) continue;
  ops.push({ ticker:f.ticker, fecha:f.fecha, ret:salida/coste-1, coste,
             movReal:Math.abs(S1/S-1), empate:(c.askC+c.askP)/S, mov1:f.mov1,
             razon:Math.abs(S1/S-1)/((c.askC+c.askP)/S), q_urgCall:f.q_urgCall });
}
console.log(`\n${"=".repeat(100)}\n(B) EL TECHO — .cuanto pagaria una señal de tamaño PERFECTA?`);
console.log(`  ${ops.length} conos, ${new Set(ops.map(o=>o.fecha)).size} dias, ${new Set(ops.map(o=>o.ticker)).size} tickers. Retorno medio sin señal: ${(media(ops.map(o=>o.ret))*100).toFixed(2)}%`);
for(const [nom,campo] of [["|movimiento| de manana (oraculo puro)","movReal"],["|movimiento| / lo que costaba (oraculo del precio)","razon"]]){
  const o=[...ops].sort((a,b)=>b[campo]-a[campo]);
  const linea=(n,g)=>`${n} n=${g.length} ret ${(media(g.map(x=>x.ret))*100).toFixed(2)}%`;
  console.log(`\n  ordenando por ${nom}:`);
  console.log(`    ${linea("decil ALTO ",o.slice(0,Math.floor(o.length*0.1)))} · ${linea("tercio ALTO",o.slice(0,Math.floor(o.length/3)))} · ${linea("tercio BAJO",o.slice(-Math.floor(o.length/3)))}`);
}
// cuanta punteria hace falta: mezcla de oraculo y azar
console.log(`\n  CUANTA PUNTERIA HACE FALTA para llegar a CERO (mezcla de oraculo del precio + eleccion al azar):`);
const ord=[...ops].sort((a,b)=>b.razon-a.razon);
const tercioOraculo=ord.slice(0,Math.floor(ord.length/3));
const rOraculo=media(tercioOraculo.map(o=>o.ret)), rAzar=media(ops.map(o=>o.ret));
for(const p of [0,0.1,0.25,0.5,0.75,1]){
  const r=rAzar+(rOraculo-rAzar)*p;
  console.log(`    ${(p*100).toFixed(0).padStart(3)}% de acierto del oraculo -> retorno ${(r*100).toFixed(2).padStart(7)}% por cono · $${(252*media(ops.map(o=>o.coste))*r).toFixed(0)}/año con 1 cono/dia`);
}
const pCero=(0-rAzar)/(rOraculo-rAzar);
console.log(`  -> hace falta el ${(pCero*100).toFixed(0)}% de la clarividencia del oraculo solo para NO PERDER.`);

// que separacion en unidades de la medicion equivale a ese oraculo
const mOra=media(tercioOraculo.filter(o=>o.mov1!=null).map(o=>o.mov1));
const mBajo=media(ord.slice(-Math.floor(ord.length/3)).filter(o=>o.mov1!=null).map(o=>o.mov1));
console.log(`\n  EN UNIDADES DE LA MEDICION (mov1 = veces la volatilidad propia):`);
console.log(`    el oraculo separa ${(mOra-mBajo).toFixed(3)}x entre su tercio alto y su bajo`);
console.log(`    la mejor de las 24 pruebas separo 0.0925x  ->  el ${((0.0925/(mOra-mBajo))*100).toFixed(0)}% de lo que separa el oraculo`);
console.log(`    y el oraculo COMPLETO, al ${(pCero*100).toFixed(0)}% haria falta para empatar: se necesita ${((pCero*(mOra-mBajo))).toFixed(3)}x de separacion util`);
console.log(`    (util = separacion en movimiento QUE NO ESTE YA EN EL PRECIO; la de urgCall si lo estaba)`);

fs.writeFileSync(path.join(RAIZ,"urg-techo.json"), JSON.stringify({
  paridadP50:pctl(err,.5), paridadAbs:media(err.map(Math.abs)),
  n:ops.length, retAzar:rAzar, retOraculoTercio:rOraculo, pCero,
  sepOraculo:mOra-mBajo, primaMedia:media(ops.map(o=>o.coste)),
},null,1));
console.log(`\nOK ${path.join(RAIZ,"urg-techo.json")}`);
