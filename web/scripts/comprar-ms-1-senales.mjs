// PASO 1 — construye la tabla de SEÑALES por (ticker, día) desde el flujo de MarketSnack.
//
// Decisión al CIERRE del día D usando SÓLO flujo con timestamp < 19:55Z (15:55 ET). Se
// descarta el 3% de operaciones posteriores para que nada observable después del momento de
// decidir entre en la decisión: la cadena que se paga es el EOD de ese mismo día.
//
// Salida: scripts/cache-theta/marketsnack/senales-tickerdia.json
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import zlib from "node:zlib";

const MS = "scripts/cache-theta/marketsnack/flujo-100k";
const CDIR = "scripts/cache-theta/cadenas";
const CORTE_MIN = 19 * 60 + 55;            // 19:55Z = 15:55 ET
const RUPTURA = "2026-07-16";              // MS cambió su tubería aquí (trampa verificada)

// tickers y días que TIENEN cadena real (sin precio real no hay operación)
const diasCad = new Map(), tickCad = new Set();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/); if (!m) continue;
  tickCad.add(m[1]);
  (diasCad.get(m[1]) ?? diasCad.set(m[1], []).get(m[1])).push(m[2]);
}
for (const v of diasCad.values()) v.sort();

const root = (s) => { const m = String(s).match(/^([A-Z]+)\d{6}[CP]\d{8}$/); return m ? m[1] : null; };
const derecho = (s) => { const m = String(s).match(/^[A-Z]+\d{6}([CP])\d{8}$/); return m ? m[1] : null; };

const dias = readdirSync(MS).filter((f) => f.endsWith(".jsonl.gz")).sort();
const tabla = [];
let opsLeidas = 0, opsTarde = 0, opsUsadas = 0;
const censoDia = [];

for (const fich of dias) {
  const fecha = fich.slice(0, 10), ymd = fecha.replace(/-/g, "");
  const agg = new Map();
  let nDia = 0, nulosAP = 0, score0 = 0;
  for (const L of zlib.gunzipSync(readFileSync(`${MS}/${fich}`)).toString("utf8").split("\n")) {
    if (!L) continue;
    const r = JSON.parse(L); opsLeidas++; nDia++;
    if (r.asset_price == null) nulosAP++;
    if (r.score === 0) score0++;
    const hm = Number(r.timestamp.slice(11, 13)) * 60 + Number(r.timestamp.slice(14, 16));
    if (hm >= CORTE_MIN) { opsTarde++; continue; }               // nada posterior a la decisión
    const t = root(r.symbol), d = derecho(r.symbol);
    if (!t || !d || !tickCad.has(t)) continue;
    if (!(r.premium > 0)) continue;
    opsUsadas++;
    let a = agg.get(t);
    if (!a) agg.set(t, a = { n: 0, prima: 0, bull: 0, bear: 0, iv: 0, ivP: 0, sz: 0, oi: 0,
                             call: 0, put: 0, n1M: 0, prima1M: 0, bull1M: 0, bear1M: 0 });
    a.n++; a.prima += r.premium;
    const bull = r.sentiment === "bullish", bear = r.sentiment === "bearish";
    if (bull) a.bull += r.premium; else if (bear) a.bear += r.premium;
    if (Number.isFinite(r.implied_volatility) && r.implied_volatility > 0) { a.iv += r.implied_volatility * r.premium; a.ivP += r.premium; }
    if (Number.isFinite(r.size)) a.sz += r.size;
    if (Number.isFinite(r.open_interest)) a.oi += r.open_interest;
    if (d === "C") a.call += r.premium; else a.put += r.premium;
    if (r.premium >= 1e6) { a.n1M++; a.prima1M += r.premium; if (bull) a.bull1M += r.premium; else if (bear) a.bear1M += r.premium; }
  }
  censoDia.push({ fecha, n: nDia, pctNuloAssetPrice: nulosAP / nDia, pctScore0: score0 / nDia });
  for (const [ticker, a] of agg) {
    if (!diasCad.get(ticker)?.includes(ymd)) continue;           // sin cadena ese día no hay precio real
    tabla.push({
      ticker, fecha, ymd,
      nOps: a.n, prima: a.prima,
      neto: (a.bull - a.bear) / a.prima,                         // panel "el lado"/sentiment
      ivFlujo: a.ivP > 0 ? a.iv / a.ivP : null,                  // panel "IV del flujo" (el más cerca)
      sizeSobreOI: a.oi > 0 ? a.sz / a.oi : null,                // panel "OI por operación"
      callPct: a.call / a.prima,
      n1M: a.n1M, prima1M: a.prima1M,
      neto1M: a.prima1M > 0 ? (a.bull1M - a.bear1M) / a.prima1M : null,
      tramo: fecha < RUPTURA ? "A" : "B",
    });
  }
}

console.log(`ops leídas ${opsLeidas} · descartadas por hora (≥19:55Z) ${opsTarde} (${(opsTarde/opsLeidas*100).toFixed(2)}%) · usadas ${opsUsadas}`);
console.log(`filas ticker-día: ${tabla.length} · días distintos ${new Set(tabla.map(f=>f.fecha)).size} · tickers ${new Set(tabla.map(f=>f.ticker)).size}`);
const porTramo = { A: tabla.filter(f=>f.tramo==="A").length, B: tabla.filter(f=>f.tramo==="B").length };
console.log(`tramo A (antes 2026-07-16): ${porTramo.A} · tramo B: ${porTramo.B}`);
console.log("\nRUPTURA — % asset_price nulo y % score=0 por semana:");
for (let i = 0; i < censoDia.length; i += 5) {
  const c = censoDia[i];
  console.log(`  ${c.fecha}  n=${String(c.n).padStart(6)}  nulos ${(c.pctNuloAssetPrice*100).toFixed(1).padStart(5)}%  score0 ${(c.pctScore0*100).toFixed(1).padStart(5)}%`);
}
const porT = new Map();
for (const f of tabla) porT.set(f.ticker, (porT.get(f.ticker)??0)+1);
console.log("\nfilas por ticker:", [...porT].sort((a,b)=>b[1]-a[1]).map(([t,n])=>`${t}:${n}`).join(" "));
writeFileSync("scripts/cache-theta/marketsnack/senales-tickerdia.json", JSON.stringify(tabla), "utf8");
console.log("\nescrito senales-tickerdia.json");
