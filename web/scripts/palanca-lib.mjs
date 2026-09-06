// ╔══════════════════════════════════════════════════════════════════════════════════════════╗
// ║  PALANCA-LIB — la regla congelada de LA PALANCA y sus lectores de datos                   ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════╝
//
// Sale TAL CUAL de forward-la-palanca.mjs (lineas 39-109), movido sin reescribir una linea.
// Lo usan el cuaderno de La Palanca a solas y el COMBINADO (Missile + Palanca sobre una unica
// cuenta de $60.000) que Lester pidio el 2026-08-31.
//
// Una copia del detector en cada cuaderno se separa sin avisar y entonces los dos miden reglas
// distintas creyendo medir la misma. Una sola fuente.

import { NUEVOS } from "./EXAMEN-grupo-A.mjs";

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/,"").replace(/\/v3$/,"") + "/v3";
const CLAVE = "forward:la-palanca";
const STORE = (process.env.PALANCA_STORE || (process.env.REDIS_URL ? "redis" : "file")).toLowerCase();
// ── la regla, congelada ──
const R = { umbral:-0.07, roto:-0.30, mediaN:50, prof:0.10, tolProf:0.45,
            dte:400, tolDte:0.55, huecos:4, tam:0.1667, aguante:120, suelo:0.50, capital:60000 };
// ⚠️ EL HUECO CAMBIO EL 2026-09-05: era huecos:10, tam:0.024 -> $1.440 por hueco.
//    Con eso el cuaderno NO PODIA COMPRAR NADA: en sus primeros 8 dias vio 6-7 señales diarias y
//    abrio CERO, porque el contrato mas barato que aparecio costaba $4.350 y la mediana $9.300.
//    No estaba rota: pedia comprar con un hueco que no llegaba al precio de la mercancia.
//    Ahora 4 huecos x 1/6 del patrimonio = $10.000 cada uno; dos tercios invertidos como maximo
//    y un tercio descansando en SPY. Lester lo eligio sobre las alternativas medidas:
//      $1.440 -> 0 de 20 señales · $6.000 -> 5 de 20 · $10.000 -> 12 de 20 · $20.000 -> 20 de 20
//
// 🔴 EL BACKTEST NO CUBRE ESTA VERSION. Se midio con $1.440 por hueco. Hay que rehacerlo con
//    4 x $10.000 antes de creerse ningun numero de rentabilidad -- si no, tendriamos otra vez un
//    forward test que no corresponde a lo que se midio, que es lo que se auditó el 4 de sept.
const TK = NUEVOS;                       // los 60 de A+B; los 27 quedan fuera a propósito

const iso=(d)=>d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8);
const ms=(d)=>Date.parse(iso(d)+"T00:00:00Z");
const dias=(a,b)=>Math.round((ms(b)-ms(a))/86400000);
const hoyYMD=()=>{const n=new Date(); const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",
  year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(n);
  return p.find(x=>x.type==="year").value+p.find(x=>x.type==="month").value+p.find(x=>x.type==="day").value;};

async function csv(ruta, intentos=3){
  for(let i=0;i<intentos;i++){
    try{ const r=await fetch(B+"/"+ruta,{signal:AbortSignal.timeout(120000)});
      const t=await r.text();
      // ⚠️ EL HTTP 200 VACÍO: se comprueba el CONTENIDO, no el código. Ya nos comió una vez.
      if(r.ok && t.split("\n").length>1 && t.includes(",")) return t;
      if(i===intentos-1) return null;
    }catch{ if(i===intentos-1) return null; }
    await new Promise(s=>setTimeout(s,1500)); }
  return null; }

// ── cierres diarios del subyacente (para la media de 50) ──────────────────────────────────
async function cierres(tk, desde, hasta){
  const t=await csv(`stock/history/eod?symbol=${tk}&start_date=${desde}&end_date=${hasta}`);
  if(!t) return null;
  const L=t.trim().split("\n"), c=L[0].split(",");
  const iC=c.indexOf("close"), iD=c.findIndex(x=>x==="date"||x==="created"||x==="ms_of_day2"||x==="quote_date");
  if(iC<0||iD<0) return null;
  const out=[];
  for(let i=1;i<L.length;i++){ const f=L[i].split(",");
    const d=String(f[iD]??"").replace(/[-"]/g,"").slice(0,8), p=Number(f[iC]);
    if(/^\d{8}$/.test(d) && p>0) out.push([d,p]); }
  out.sort((a,b)=>a[0].localeCompare(b[0]));
  return out.length?out:null; }

// ── cadena de opciones de un día: sólo calls, sólo lo que nos sirve ────────────────────────
async function calls(tk, dia){
  const t=await csv(`option/history/eod?symbol=${tk}&expiration=*&start_date=${dia}&end_date=${dia}`);
  if(!t) return null;
  const L=t.trim().split("\n"), c=L[0].split(",");
  const iE=c.indexOf("expiration"), iK=c.indexOf("strike"), iR=c.indexOf("right"),
        iB=c.indexOf("bid"), iA=c.indexOf("ask");
  if([iE,iK,iR,iB,iA].some(x=>x<0)) return null;
  const out=[];
  for(let i=1;i<L.length;i++){ const f=L[i].split(",");
    if(f.length<c.length) continue;
    const q=(s)=>String(s??"").replace(/^"|"$/g,"");
    if(!q(f[iR]).toUpperCase().startsWith("C")) continue;
    const exp=q(f[iE]).replace(/-/g,""), K=Number(f[iK]), bid=Number(f[iB]), ask=Number(f[iA]);
    if(!/^\d{8}$/.test(exp) || !(K>0) || !(bid>0) || !(ask>0) || ask<bid) continue;
    out.push({exp,K,bid,ask}); }
  return out.length?out:null; }

function elegir(cad, spot, dia){
  let mejor=null, dm=Infinity;
  for(const o of cad){
    if(o.K>=spot) continue;
    const dte=dias(dia,o.exp);
    if(dte<R.dte*(1-R.tolDte) || dte>R.dte*(1+R.tolDte)) continue;
    const prof=(spot-o.K)/spot;
    if(Math.abs(prof-R.prof)>R.prof*R.tolProf) continue;
    const d=Math.abs(prof-R.prof)/R.prof + Math.abs(dte-R.dte)/R.dte;
    if(d<dm){ dm=d; mejor={...o, dte, prof}; } }
  return mejor; }

export {
  B, CLAVE, STORE, R, TK, iso, ms, dias, hoyYMD, csv, cierres, calls, elegir,
};
