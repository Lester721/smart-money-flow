// PANEL CADENA-STRIKE · paso 5 — LA REGLA, y CUÁNTOS EVENTOS DA AL DÍA.
// Prepara el terreno: no demuestra que gane. Cuenta cuántas veces dispara, que es lo que
// decide cuántos meses de cron hacen falta para poder juzgarla.
import fs from "node:fs"; import zlib from "node:zlib"; import path from "node:path";

const DIA = process.argv[2] ?? "2026-08-20";
const DIRC = `scripts/cache-theta/marketsnack/aux/cadenas/${DIA}`;
const hoyMs = Date.parse(DIA+"T00:00:00Z");

// precio del subyacente: cierre REAL de disco (nada de modelo)
const precio = {};
for (const f of fs.readdirSync("scripts/cache-theta/cierres")) {
  const T = f.replace(".json","");
  const j = JSON.parse(fs.readFileSync(`scripts/cache-theta/cierres/${f}`,"utf8"));
  const ks = Object.keys(j).sort();
  precio[T] = { px: j[ks[ks.length-1]], fecha: ks[ks.length-1] };
}

const filas = [];
for (const f of fs.readdirSync(DIRC)) {
  const T = f.split("-")[0];
  for (const c of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIRC,f))).toString())) {
    const p = c.premium_traded ?? 0; if (p<=0) continue;
    const b=c.premium_breakdown??{}, l=c.legs_premium??{};
    const dte = Math.round((Date.parse(c.expiration+"T00:00:00Z")-hoyMs)/86400000);
    const S = precio[T]?.px ?? null;
    const otm = S ? (c.type==="call" ? (c.strike-S)/S : (S-c.strike)/S) : null;
    filas.push({ T, venc:c.expiration, dte, strike:c.strike, tipo:c.type, prima:p, S, otm,
      desq:((b.ask??0)-(b.bid??0))/p, pSingle:(l.single??0)/p,
      vol:c.volume??0, oi:c.open_interest??0,
      bid:c.last_quote?.bid??0, ask:c.last_quote?.ask??0 });
  }
}
const corner = filas.filter(r=>r.dte>=55 && r.dte<=125);
console.log(`═══ ${DIA} · ${filas.length.toLocaleString("es-ES")} contratos con prima · ${corner.length.toLocaleString("es-ES")} en el RINCÓN (55-125 días) ═══`);
console.log(`   precio de cierre de disco para ${Object.keys(precio).length} tickers (fecha ${precio.AAPL?.fecha})\n`);

// ── EL EMBUDO DE LA REGLA
console.log(`═══ EL EMBUDO — cada filtro, y lo que deja vivo ═══`);
const paso = (nom, arr) => { console.log(`   ${nom.padEnd(46)} ${String(arr.length).padStart(6)}`); return arr; };
let a = paso("contratos en el rincón 55-125d con prima", corner);
a = paso("· con precio de subyacente en disco", a.filter(r=>r.S!=null));
a = paso("· 3%–8% FUERA del dinero (la esquina barata)", a.filter(r=>r.otm>=0.03 && r.otm<=0.08));
const conPrima = paso("· ≥$250k de prima en ESE strike", a.filter(r=>r.prima>=250000));
const limpio = paso("· single ≥80% (no es pata de spread)", conPrima.filter(r=>r.pSingle>=0.80));
const horq = paso("· horquilla ≤15% de la prima (peaje bajo)", limpio.filter(r=>r.ask>0 && (r.ask-r.bid)/((r.ask+r.bid)/2)<=0.15));
const compra = paso("· desequilibrio ≥ +0,40 (manda el ASK)", horq.filter(r=>r.desq>=0.40));
const venta  = paso("· desequilibrio ≤ −0,40 (manda el BID)", horq.filter(r=>r.desq<=-0.40));

console.log(`\n   ⇒ ${compra.length} señales de COMPRA y ${venta.length} de VENTA en UN día, con 25 tickers.`);

// ── qué son
const ver = (t,g) => {
  if (!g.length) return;
  console.log(`\n   ── ${t} ──`);
  console.log(`   ticker venc        strike  t   %OTM   prima     desq  %single  horq   vol/OI   coste 1 contrato`);
  for (const r of g.sort((x,y)=>y.prima-x.prima).slice(0,14))
    console.log(`   ${r.T.padEnd(6)} ${r.venc}  ${String(r.strike).padStart(6)}  ${r.tipo[0].toUpperCase()}  ${(100*r.otm).toFixed(1).padStart(4)}%  $${(r.prima/1e6).toFixed(2).padStart(5)}M  ${r.desq>=0?"+":""}${r.desq.toFixed(2)}   ${(100*r.pSingle).toFixed(0).padStart(3)}%  ${(100*(r.ask-r.bid)/((r.ask+r.bid)/2)).toFixed(0).padStart(3)}%  ${(r.oi?r.vol/r.oi:0).toFixed(2).padStart(6)}   $${(r.ask*100).toFixed(0)}`);
};
ver("COMPRA — el ask manda y no es spread", compra);
ver("VENTA — el bid manda y no es spread", venta);

// ── CUÁNTO CAPITAL Y CUÁNTOS MESES
console.log(`\n═══ CUÁNTO CUESTA Y CUÁNTOS MESES DE CRON ═══`);
const todas = [...compra, ...venta];
if (todas.length) {
  const costes = todas.map(r=>r.ask*100).sort((x,y)=>x-y);
  const medio = costes.reduce((s,x)=>s+x,0)/costes.length;
  console.log(`   coste medio de 1 contrato al ASK: $${medio.toFixed(0)}  (mediana $${costes[Math.floor(costes.length/2)].toFixed(0)})`);
  console.log(`   señales/día observadas: ${todas.length} con 25 tickers`);
  for (const n of [200, 400]) {
    const dias = n / todas.length;
    console.log(`   para n=${n} eventos → ${Math.ceil(dias)} días de mercado ≈ ${(dias/21).toFixed(1)} meses de cron`);
  }
  console.log(`   OJO: eventos ≠ n EFECTIVA. Con salida a 23 días, los eventos de días vecinos se solapan;`);
  console.log(`        la n efectiva es más bien nº de VENTANAS independientes ≈ días/23 × señales por ventana.`);
}
