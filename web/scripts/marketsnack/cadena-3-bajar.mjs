// PANEL CADENA-STRIKE · paso 3 — BAJAR la foto de hoy LLEGANDO AL RINCÓN BARATO.
// El descargador viejo guardaba los 6 vencimientos MÁS CERCANOS → tope 37 días.
// El rincón barato es 60-120 días. Aquí se eligen los vencimientos POR PLAZO, no por cercanía.
import fs from "node:fs"; import zlib from "node:zlib"; import path from "node:path";

const BASE = "https://app.marketsnack.com";
const C = fs.readFileSync(".env.local","utf8").split("\n").find(l=>l.startsWith("MARKETSNACK_COOKIE="))?.slice(19).trim();
if (!C) { console.log("✗ sin cookie"); process.exit(1); }
const HOY = new Date().toISOString().slice(0,10);
const DIR = `scripts/cache-theta/marketsnack/aux/cadenas/${HOY}`;
fs.mkdirSync(DIR, { recursive: true });
const dormir = (ms) => new Promise(r=>setTimeout(r,ms));

async function get(ruta) {
  for (let i=0;i<3;i++) {
    try {
      const r = await fetch(BASE+"/api"+ruta, { headers:{Accept:"application/json",Cookie:C}, redirect:"manual", signal:AbortSignal.timeout(60000) });
      if (r.status===200) return { http:200, j: await r.json() };
      if (r.status===429) { await dormir(4000); continue; }
      return { http:r.status, j:null };
    } catch(e) { if (i===2) return { http:0, j:null, err:String(e).slice(0,60) }; await dormir(2000); }
  }
  return { http:0, j:null };
}

// tickers con CADENA REAL en disco (los que se pueden medir después) + los que mueven prima
const TK = ["SPY","QQQ","NVDA","TSLA","AAPL","MSFT","AMZN","META","GOOGL","AMD","AVGO","NFLX",
            "HOOD","PLTR","COIN","MSTR","MU","INTC","IWM","BAC","XLF","XLE","GLD","TLT","SMCI"];

const hoyMs = Date.parse(HOY+"T00:00:00Z");
let okCad=0, contratos=0, fallos=[];
for (const T of TK) {
  const ex = await get(`/assets/${T}/expirations`);
  const lista = (Array.isArray(ex.j)?ex.j:(ex.j?.data??[])).map(e=>e.date).filter(Boolean).sort();
  await dormir(300);
  if (!lista.length) { fallos.push(`${T}: sin expirations (HTTP ${ex.http})`); continue; }
  const conDte = lista.map(v => ({ v, d: Math.round((Date.parse(v+"T00:00:00Z")-hoyMs)/86400000) }));
  // elegir: 3 cercanos (contexto) + TODOS los del rincón barato 60-120d + el más cercano a 90d
  const cercanos = conDte.filter(x=>x.d>=0 && x.d<=10).slice(0,3);
  const rincon   = conDte.filter(x=>x.d>=55 && x.d<=125);
  const elegidos = [...new Map([...cercanos,...rincon].map(x=>[x.v,x])).values()];
  for (const {v,d} of elegidos) {
    const rel = path.join(DIR, `${T}-${v}.json.gz`);
    if (fs.existsSync(rel)) { okCad++; continue; }
    const r = await get(`/assets/${T}/option_chain_extended?expiration_date=${v}`);
    const arr = Array.isArray(r.j)?r.j:(r.j?.data??[]);
    if (r.http===200 && arr.length) {
      fs.writeFileSync(rel, zlib.gzipSync(Buffer.from(JSON.stringify(r.j),"utf8"),{level:9}));
      okCad++; contratos+=arr.length;
    } else fallos.push(`${T}-${v} (${d}d): HTTP ${r.http}`);
    await dormir(300);
  }
  process.stdout.write(`\r   ${T.padEnd(6)} ${elegidos.length} vencimientos · ${contratos.toLocaleString("es-ES")} contratos      `);
}
console.log(`\n\n   ${okCad} cadenas · ${contratos.toLocaleString("es-ES")} contratos guardados en ${DIR}`);
if (fallos.length) console.log(`   fallos (${fallos.length}): ${fallos.slice(0,10).join(" · ")}`);
