// PANEL CADENA-STRIKE · paso 1 — RADIOGRAFÍA del snapshot option_chain_extended
// Antes de medir nada: ¿qué campos vienen, cuántos ceros, y qué es identidad de qué?
import fs from "node:fs"; import zlib from "node:zlib"; import path from "node:path";

const DIR = "scripts/cache-theta/marketsnack/aux/cadenas";
const dias = fs.readdirSync(DIR).sort();
console.log(`═══ DÍAS DE SNAPSHOT EN DISCO: ${dias.length} → ${dias.join(", ")} ═══\n`);

const DIA = dias[dias.length - 1];
const ficheros = fs.readdirSync(path.join(DIR, DIA));
const leer = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, DIA, f))).toString());

// ── censo global de contratos
let filas = [];
for (const f of ficheros) {
  const T = f.split("-")[0];
  for (const c of leer(f)) filas.push({ T, ...c });
}
console.log(`   ${ficheros.length} ficheros · ${filas.length.toLocaleString("es-ES")} contratos\n`);

// ── relleno de campos (contar CEROS, no sólo nulos)
console.log(`═══ RELLENO — %nulo y %cero (el cero se lee como dato y no lo es) ═══`);
const campos = {
  "premium_breakdown.bid": (r) => r.premium_breakdown?.bid,
  "premium_breakdown.mid": (r) => r.premium_breakdown?.mid,
  "premium_breakdown.ask": (r) => r.premium_breakdown?.ask,
  "legs_premium.single":   (r) => r.legs_premium?.single,
  "legs_premium.multi":    (r) => r.legs_premium?.multi,
  "legs_premium.other":    (r) => r.legs_premium?.other,
  "premium_traded":        (r) => r.premium_traded,
  "volume":                (r) => r.volume,
  "open_interest":         (r) => r.open_interest,
  "last_quote.bid":        (r) => r.last_quote?.bid,
  "last_quote.ask":        (r) => r.last_quote?.ask,
  "implied_volatility":    (r) => r.implied_volatility,
  "greeks.delta":          (r) => r.greeks?.delta,
  "last_unusual_trade":    (r) => r.last_unusual_trade,
};
for (const [n, g] of Object.entries(campos)) {
  let nulo = 0, cero = 0;
  for (const r of filas) { const v = g(r); if (v == null) nulo++; else if (v === 0) cero++; }
  console.log(`   ${n.padEnd(24)} nulo ${(100*nulo/filas.length).toFixed(1).padStart(5)}%  ·  cero ${(100*cero/filas.length).toFixed(1).padStart(5)}%`);
}

// ── ¿IDENTIDADES? bid+mid+ask == premium_traded ; single+multi+other == premium_traded
console.log(`\n═══ ¿SON IDENTIDADES? (si suman al total, no hay información nueva en el total) ═══`);
const conFlujo = filas.filter((r) => (r.premium_traded ?? 0) > 0);
console.log(`   contratos CON prima negociada hoy: ${conFlujo.length.toLocaleString("es-ES")} de ${filas.length.toLocaleString("es-ES")} (${(100*conFlujo.length/filas.length).toFixed(1)}%)`);
let okLado = 0, okPatas = 0, difLado = [], difPatas = [];
for (const r of conFlujo) {
  const b = r.premium_breakdown ?? {}, l = r.legs_premium ?? {};
  const sL = (b.bid??0)+(b.mid??0)+(b.ask??0), sP = (l.single??0)+(l.multi??0)+(l.other??0);
  const eL = Math.abs(sL - r.premium_traded) / r.premium_traded, eP = Math.abs(sP - r.premium_traded) / r.premium_traded;
  if (eL < 0.005) okLado++; else difLado.push(eL);
  if (eP < 0.005) okPatas++; else difPatas.push(eP);
}
const med = (a) => a.length ? a.sort((x,y)=>x-y)[Math.floor(a.length/2)] : null;
console.log(`   bid+mid+ask == premium_traded    : ${(100*okLado/conFlujo.length).toFixed(1)}%  (desvío mediano de los que no: ${difLado.length?(100*med(difLado)).toFixed(1)+"%":"—"})`);
console.log(`   single+multi+other == premium_traded: ${(100*okPatas/conFlujo.length).toFixed(1)}%  (desvío mediano: ${difPatas.length?(100*med(difPatas)).toFixed(1)+"%":"—"})`);

// ── ¿son las DOS descomposiciones la misma? correlación entre %ask y %single
let n=0, sx=0, sy=0, sxx=0, syy=0, sxy=0;
for (const r of conFlujo) {
  const b=r.premium_breakdown??{}, l=r.legs_premium??{};
  const tot=(b.bid??0)+(b.mid??0)+(b.ask??0), tp=(l.single??0)+(l.multi??0)+(l.other??0);
  if (tot<=0||tp<=0) continue;
  const x=(b.ask??0)/tot, y=(l.single??0)/tp;
  n++; sx+=x; sy+=y; sxx+=x*x; syy+=y*y; sxy+=x*y;
}
const corr = (n*sxy-sx*sy)/Math.sqrt((n*sxx-sx*sx)*(n*syy-sy*sy));
console.log(`\n   corr(%ask , %single) = ${corr.toFixed(3)}  sobre n=${n.toLocaleString("es-ES")}  → ${Math.abs(corr)>0.8?"MISMA COSA":"son EJES DISTINTOS"}`);

// ── vencimientos disponibles: ¿llega el snapshot al rincón barato (60-120 días)?
console.log(`\n═══ ¿LLEGA AL RINCÓN BARATO (60-120 días de plazo)? ═══`);
const hoy = Date.parse(DIA + "T00:00:00Z");
const vencs = [...new Set(filas.map(r=>r.expiration))].sort();
for (const v of vencs) {
  const d = Math.round((Date.parse(v+"T00:00:00Z") - hoy)/86400000);
  console.log(`   ${v}  ${String(d).padStart(4)} días  ·  ${filas.filter(r=>r.expiration===v).length} contratos`);
}
console.log(`\n   ⚠ el descargador guarda sólo los 6 vencimientos MÁS CERCANOS → máximo ${Math.round((Date.parse(vencs[vencs.length-1]+"T00:00:00Z")-hoy)/86400000)} días. El rincón barato NO está cubierto.`);
