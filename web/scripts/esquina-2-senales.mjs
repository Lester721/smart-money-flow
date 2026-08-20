// ESQUINA · PASO 2 — LAS SEÑALES, ya con el filtro de condición OPRA.
//
// El 56% de la cinta son PATAS DE SPREAD: ahí el "lado" no significa nada. Todo lo medido antes
// mezclaba las dos cosas. Aquí se clasifica por trade_condition_id real (lib/conditions.ts),
// se tiran las canceladas y las de fuera de horario, y se usa SÓLO una pata.
//
// Nada posterior al momento de decidir: se descarta todo print con timestamp >= 19:55Z, porque
// la compra se hace al cierre de ESE mismo día.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import zlib from "node:zlib";
import { TRADE_CONDITIONS, MULTI_LEG_CODES, CANCELED_CODES } from "../lib/conditions.ts";

const MS = "scripts/cache-theta/marketsnack/flujo-100k";
const CORTE = 19 * 60 + 55;

// Una pata ESTRICTA: fuera los multi-pata de MarketSnack Y los "against single leg(s)" que él
// etiqueta mal como single (MESL/MASL/MFSL y sus gemelos de stock-options), fuera las canceladas,
// fuera lo tardío/fuera de horario/compresión.
const COD = new Map(TRADE_CONDITIONS.map((c) => [c.id, c.code]));
const MULTI_REAL = new Set([...MULTI_LEG_CODES, "MESL", "MASL", "MFSL", "TESL", "TASL", "TFSL"]);
const BASURA = new Set([...CANCELED_CODES, "OSEQ", "LATE", "OPEN", "OPNL", "EXHT", "MCTP"]);
const ACCOPC = new Set(["TLAT", "TLET", "TLCT", "TLFT"]);

const rootDe = (s) => { const m = String(s).match(/^([A-Z]+)\d{6}[CP]\d{8}$/); return m ? m[1] : null; };
const derDe  = (s) => { const m = String(s).match(/^[A-Z]+\d{6}([CP])\d{8}$/); return m ? m[1] : null; };

const rej = JSON.parse(readFileSync("scripts/esquina-1-rejilla.json", "utf8"));
const validos = new Set(rej.filas.map((f) => `${f.ticker}|${f.ymd}`));
const tickOK = new Set(rej.filas.map((f) => f.ticker));

const clases = new Map();
const tabla = [];
let leidos = 0, tarde = 0, usados = 0;
for (const fich of readdirSync(MS).filter((f) => f.endsWith(".jsonl.gz")).sort()) {
  const ymd = fich.slice(0, 10).replace(/-/g, "");
  const agg = new Map();
  for (const L of zlib.gunzipSync(readFileSync(`${MS}/${fich}`)).toString("utf8").split("\n")) {
    if (!L) continue;
    const r = JSON.parse(L); leidos++;
    const code = COD.get(r.trade_condition_id) ?? "?";
    const clase = BASURA.has(code) ? "basura" : ACCOPC.has(code) ? "accion+opcion" : MULTI_REAL.has(code) ? "multi" : "una";
    clases.set(clase, (clases.get(clase) ?? 0) + 1);
    if (clase !== "una") continue;
    const hm = Number(r.timestamp.slice(11, 13)) * 60 + Number(r.timestamp.slice(14, 16));
    if (hm >= CORTE) { tarde++; continue; }
    const t = rootDe(r.symbol), d = derDe(r.symbol);
    if (!t || !d || !tickOK.has(t) || !(r.premium > 0)) continue;
    usados++;
    let a = agg.get(t);
    if (!a) agg.set(t, a = { n: 0, prima: 0, aC: 0, aP: 0, bC: 0, bP: 0, sc: 0, scP: 0, iv: 0, ivP: 0, primaC: 0, primaP: 0, n1M: 0, prima1M: 0, aC1M: 0, aP1M: 0 });
    a.n++; a.prima += r.premium;
    const arriba = r.side === "ASKSIDE" || r.side === "AT_ASK" || r.side === "ABOVE_ASK";
    const abajo  = r.side === "BIDSIDE" || r.side === "AT_BID" || r.side === "BELOW_BID";
    if (d === "C") { a.primaC += r.premium; if (arriba) a.aC += r.premium; if (abajo) a.bC += r.premium; }
    else           { a.primaP += r.premium; if (arriba) a.aP += r.premium; if (abajo) a.bP += r.premium; }
    if (Number.isFinite(r.score)) { a.sc += r.score * r.premium; a.scP += r.premium; }
    if (r.implied_volatility > 0) { a.iv += r.implied_volatility * r.premium; a.ivP += r.premium; }
    if (r.premium >= 1e6) { a.n1M++; a.prima1M += r.premium; if (d === "C" && arriba) a.aC1M += r.premium; if (d === "P" && arriba) a.aP1M += r.premium; }
  }
  for (const [ticker, a] of agg) {
    if (!validos.has(`${ticker}|${ymd}`)) continue;
    const ask = a.aC + a.aP;
    tabla.push({
      ticker, ymd,
      nOps: a.n, prima: a.prima, primaAsk: ask,
      desq: ask > 0 ? (a.aC - a.aP) / ask : null,                       // desequilibrio de prima al ASK, una pata
      desqNeto: (a.aC - a.bC - a.aP + a.bP) / a.prima,                  // ask menos bid, sobre toda la prima
      desq1M: (a.aC1M + a.aP1M) > 0 ? (a.aC1M - a.aP1M) / (a.aC1M + a.aP1M) : null,
      callPct: a.prima > 0 ? a.primaC / a.prima : null,
      urgencia: a.prima > 0 ? ask / a.prima : null,                     // cuánta prima entra AL ASK
      score: a.scP > 0 ? a.sc / a.scP : null,
      ivFlujo: a.ivP > 0 ? a.iv / a.ivP : null,
      n1M: a.n1M, prima1M: a.prima1M,
    });
  }
}

// INUSUALIDAD: prima de hoy contra la MEDIANA de los 20 días previos DEL MISMO TICKER. Sólo mira
// hacia atrás. Se calcula después de tener la tabla, recorriendo cada ticker en orden.
const porT = new Map();
for (const f of tabla) (porT.get(f.ticker) ?? porT.set(f.ticker, []).get(f.ticker)).push(f);
for (const v of porT.values()) {
  v.sort((a, b) => a.ymd.localeCompare(b.ymd));
  for (let i = 0; i < v.length; i++) {
    const prev = v.slice(Math.max(0, i - 20), i).map((x) => x.prima).sort((a, b) => a - b);
    v[i].inusual = prev.length >= 10 ? v[i].prima / prev[Math.floor(prev.length / 2)] : null;
    const pd = v.slice(Math.max(0, i - 20), i).map((x) => x.desq).filter((x) => x != null);
    v[i].desqRel = pd.length >= 10 && v[i].desq != null ? v[i].desq - pd.reduce((a, x) => a + x, 0) / pd.length : null;
  }
}

console.log("CLASE de print por condición OPRA real:");
const tot = [...clases.values()].reduce((a, x) => a + x, 0);
for (const [k, n] of [...clases].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${String(n).padStart(9)}  ${(n / tot * 100).toFixed(2)}%`);
console.log(`\nleídos ${leidos} · de una pata y antes de 19:55Z y con cadena: ${usados} · tirados por hora ${tarde}`);
console.log(`filas ticker-día ${tabla.length} · tickers ${porT.size} · días ${new Set(tabla.map(f=>f.ymd)).size}`);
writeFileSync("scripts/esquina-2-senales.json", JSON.stringify(tabla), "utf8");
console.log("escrito scripts/esquina-2-senales.json");
