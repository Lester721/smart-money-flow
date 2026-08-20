// CRON DIARIO · foto de option_chain_extended — la ÚNICA vista con premium_breakdown
// (bid/mid/ask) y legs_premium (single/multi/other) POR CONTRATO. Es snapshot: lo que no se
// guarda hoy no existe mañana. La API ignora el parámetro `date`.
//
// Arregla los DOS defectos del descargador viejo (scripts/marketsnack/bajar-todo.mjs, fase aux):
//   1. guardaba los 6 vencimientos MÁS CERCANOS → tope 37 días. El rincón barato (55-125d)
//      quedaba fuera, que es justo donde el peaje de horquilla es del 5,2% y no del 62,8%.
//   2. elegía los vencimientos por CERCANÍA, así que el juego de vencimientos cambiaba de un
//      día para otro y dos días seguidos NO se solapaban en plazo largo. Sin solape no se puede
//      medir el ΔOI, que es el único juez de si el flujo ABRE posición o la CIERRA.
// Aquí los vencimientos se eligen por CALENDARIO (las mensuales del tercer viernes), que son
// las mismas todos los días → panel continuo por contrato.
//
// Uso:  node --import tsx scripts/marketsnack/cadena-cron.mjs
// Correr DESPUÉS del cierre (16:00 ET) para que la foto recoja la sesión entera.

import fs from "node:fs"; import zlib from "node:zlib"; import path from "node:path";

const BASE = "https://app.marketsnack.com";
const C = fs.readFileSync(".env.local","utf8").split("\n").find(l=>l.startsWith("MARKETSNACK_COOKIE="))?.slice(19).trim();
if (!C) { console.log("✗ falta MARKETSNACK_COOKIE en .env.local"); process.exit(1); }

const HOY = new Date().toISOString().slice(0,10);
const DIR = `scripts/cache-theta/marketsnack/aux/cadenas/${HOY}`;
fs.mkdirSync(DIR, { recursive: true });
const dormir = (ms)=>new Promise(r=>setTimeout(r,ms));

// Universo: cuanto más ancho, antes se llega a la n efectiva. Con 25 tickers hacen falta ~15
// meses; con este listado (~60) la muestra llega en un tercio del tiempo.
const TK = ["SPY","QQQ","IWM","DIA","NVDA","TSLA","AAPL","MSFT","AMZN","META","GOOGL","AMD",
  "AVGO","NFLX","MU","INTC","QCOM","TXN","ORCL","CRM","ADBE","NOW","PANW","SMCI","ARM","MRVL",
  "HOOD","PLTR","COIN","MSTR","SOFI","RIVN","LCID","UBER","ABNB","SHOP","SQ","PYPL","DIS","BA",
  "CAT","GE","JPM","BAC","GS","WFC","XOM","CVX","OXY","UNH","LLY","PFE","JNJ","WMT","COST","HD",
  "XLF","XLE","XLK","GLD","SLV","TLT","USO","EEM"];

async function get(ruta){
  for(let i=0;i<3;i++){
    try{
      const r=await fetch(BASE+"/api"+ruta,{headers:{Accept:"application/json",Cookie:C},redirect:"manual",signal:AbortSignal.timeout(60000)});
      if(r.status===401||r.status===403||(r.status>=300&&r.status<400))
        return {http:r.status,j:null,err:"SESIÓN CADUCADA — renueva MARKETSNACK_COOKIE"};
      if(r.status===200) return {http:200,j:await r.json()};
      if(r.status===429){await dormir(5000);continue;}
      return {http:r.status,j:null};
    }catch(e){ if(i===2) return {http:0,j:null,err:String(e).slice(0,60)}; await dormir(2000); }
  }
  return {http:0,j:null};
}

/** ¿Es el tercer viernes del mes? Las mensuales son el ancla estable del panel. */
function esMensual(iso){
  const d=new Date(iso+"T00:00:00Z");
  return d.getUTCDay()===5 && d.getUTCDate()>=15 && d.getUTCDate()<=21;
}

const hoyMs=Date.parse(HOY+"T00:00:00Z");
let cad=0, contratos=0, bytes=0; const fallos=[];
let sesionMuerta=false;

for(const T of TK){
  if(sesionMuerta) break;
  const ex=await get(`/assets/${T}/expirations`);
  if(ex.err?.startsWith("SESIÓN")){ console.log(`\n✗ ${ex.err}`); sesionMuerta=true; break; }
  const lista=(Array.isArray(ex.j)?ex.j:(ex.j?.data??[])).map(e=>e.date).filter(Boolean).sort();
  await dormir(250);
  if(!lista.length){ fallos.push(`${T}: sin expirations (HTTP ${ex.http})`); continue; }

  const conDte=lista.map(v=>({v,d:Math.round((Date.parse(v+"T00:00:00Z")-hoyMs)/86400000)})).filter(x=>x.d>=0);
  // ANCLA ESTABLE: las 4 mensuales que caen entre 20 y 200 días. Son las mismas mañana → hay
  // solape y por tanto ΔOI medible. Cubren el rincón barato (55-125d) por construcción.
  const mensuales=conDte.filter(x=>esMensual(x.v)&&x.d>=20&&x.d<=200).slice(0,4);
  // contexto de corto plazo (cambia cada día, no sirve para ΔOI pero sí para el panel en vivo)
  const cortas=conDte.filter(x=>x.d<=9).slice(0,3);
  const elegidos=[...new Map([...mensuales,...cortas].map(x=>[x.v,x])).values()];

  for(const {v} of elegidos){
    const rel=path.join(DIR,`${T}-${v}.json.gz`);
    if(fs.existsSync(rel)){ cad++; continue; }
    const r=await get(`/assets/${T}/option_chain_extended?expiration_date=${v}`);
    if(r.err?.startsWith("SESIÓN")){ console.log(`\n✗ ${r.err}`); sesionMuerta=true; break; }
    const arr=Array.isArray(r.j)?r.j:(r.j?.data??[]);
    // VALIDAR POR CONTENIDO, no por código HTTP: un 200 vacío no es un éxito.
    if(r.http===200&&arr.length){
      fs.writeFileSync(rel,zlib.gzipSync(Buffer.from(JSON.stringify(r.j),"utf8"),{level:9}));
      cad++; contratos+=arr.length; bytes+=fs.statSync(rel).size;
    } else fallos.push(`${T}-${v}: HTTP ${r.http}${arr.length?"":" · cuerpo VACÍO"}`);
    await dormir(250);
  }
  process.stdout.write(`\r   ${T.padEnd(6)} · ${cad} cadenas · ${contratos.toLocaleString("es-ES")} contratos      `);
}

// ── validación de salida: contar desde el DISCO, no desde el contador de la corrida
let realFich=0, realCon=0, vacios=[];
for(const f of fs.readdirSync(DIR)){
  const a=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR,f))).toString());
  const arr=Array.isArray(a)?a:(a.data??[]);
  if(!arr.length){ vacios.push(f); continue; }
  realFich++; realCon+=arr.length;
}
console.log(`\n\n═══ ${HOY} ═══`);
console.log(`   ${realFich} cadenas con datos · ${realCon.toLocaleString("es-ES")} contratos · ${(bytes/1048576).toFixed(1)} MB`);
if(vacios.length) console.log(`   ⚠ ${vacios.length} ficheros VACÍOS: ${vacios.slice(0,5).join(", ")}`);
if(fallos.length) console.log(`   ⚠ ${fallos.length} fallos: ${fallos.slice(0,8).join(" · ")}`);
if(sesionMuerta) process.exit(1);
if(!realFich){ console.log("   ✗ NO SE GUARDÓ NADA — la corrida cuenta como fallida."); process.exit(1); }
