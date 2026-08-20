// ═══ CONVEXIDAD · PASO 1 — RECON DE FORMA ═══════════════════════════════════════════════
//
// PREGUNTA: dentro del perfil convexo que YA se sabe que paga a veces (calls lejos del dinero,
// plazo largo), ¿el flujo de MarketSnack ELIGE mejor que el azar qué ticker comprar?
//
// AQUÍ NO SE MIDE NINGÚN RETORNO. Sólo se cuenta qué hay: qué tickers se solapan, cuántos días
// de entrada quedan, si existe el vencimiento a ~1 año y el strike a 1,5σ, y CUÁNTAS APUESTAS
// INDEPENDIENTES caben. Todas las decisiones de diseño se cierran con estos recuentos.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/convex-1-recon.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const RAIZ = path.join("scripts", "cache-theta");
const MS = path.join(RAIZ, "marketsnack", "flujo-100k");
const CAD = path.join(RAIZ, "cadenas");
const CIE = path.join(RAIZ, "cierres");

const COMPRA = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const VENTA = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);

const parseOcc = (s) => {
  const k = s.slice(-8), t = s.slice(-9, -8), d = s.slice(-15, -9), u = s.slice(0, -15);
  return (/^\d{8}$/.test(k) && /^[CP]$/.test(t) && /^\d{6}$/.test(d) && u)
    ? { u, call: t === "C", exp: "20" + d, strike: Number(k) / 1000 } : null;
};
const aDate = (yyyymmdd) => new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8)));
const dias360 = (a, b) => Math.round((aDate(b) - aDate(a)) / 86400e3);

// ── 1. UNIVERSO: tickers con cadena diaria de 2026 ────────────────────────────────────────
const ficherosCad = fs.readdirSync(CAD).filter((f) => /_d2026\d{4}\.json$/.test(f));
const porTicker = new Map();
for (const f of ficherosCad) {
  const t = f.split("_d")[0];
  const d = f.slice(-13, -5);
  if (!porTicker.has(t)) porTicker.set(t, []);
  porTicker.get(t).push(d);
}
for (const v of porTicker.values()) v.sort();
const TICKERS = [...porTicker.keys()].sort();
console.log(`\n## UNIVERSO`);
console.log(`tickers con cadena diaria en 2026: ${TICKERS.length} — ${TICKERS.join(" ")}`);

// calendario común = días que TODOS tienen (usa SPY como patrón y verifica)
const calendario = porTicker.get("SPY");
console.log(`días de cadena (SPY): ${calendario.length}  ${calendario[0]} → ${calendario[calendario.length - 1]}`);
for (const t of TICKERS) {
  const falt = calendario.filter((d) => !porTicker.get(t).includes(d)).length;
  if (falt) console.log(`  ojo ${t}: le faltan ${falt} días del calendario`);
}

// ── 2. DÍAS DE FLUJO ──────────────────────────────────────────────────────────────────────
const diasMS = fs.readdirSync(MS).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
const diasMScomp = diasMS.map((d) => d.replace(/-/g, ""));
const solape = diasMScomp.filter((d) => calendario.includes(d));
console.log(`\n## DÍAS`);
console.log(`flujo MS: ${diasMS.length}  ${diasMS[0]} → ${diasMS[diasMS.length - 1]}`);
console.log(`cadenas llegan hasta: ${calendario[calendario.length - 1]}`);
console.log(`SOLAPE (días con flujo Y cadena): ${solape.length}  ${solape[0]} → ${solape[solape.length - 1]}`);
console.log(`  → ${diasMS.length - solape.length} días de flujo NO tienen cadena y se pierden`);

// ── 3. PANEL DE SEÑAL (sin retornos) ──────────────────────────────────────────────────────
const setT = new Set(TICKERS);
const panel = new Map();   // "dia|T" → agregados
let tot = 0, sinOcc = 0, fueraUniverso = 0, sinLado = 0;
const largoPorTicker = new Map();

for (const dia of diasMS) {
  const comp = dia.replace(/-/g, "");
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(MS, `${dia}.jsonl.gz`))).toString("utf8").trim();
  if (!txt) continue;
  for (const l of txt.split("\n")) {
    if (!l) continue;
    const r = JSON.parse(l);
    tot++;
    const o = parseOcc(r.symbol);
    if (!o) { sinOcc++; continue; }
    if (!setT.has(o.u)) { fueraUniverso++; continue; }
    const c = COMPRA.has(r.side), v = VENTA.has(r.side);
    if (!c && !v) { sinLado++; continue; }
    const dte = dias360(comp, o.exp);
    const k = `${comp}|${o.u}`;
    let a = panel.get(k);
    if (!a) {
      a = { dia: comp, T: o.u, ops: 0, cAsk: 0, cBid: 0, nCall: 0, pAsk: 0, pBid: 0, nPut: 0,
            lAsk: 0, lBid: 0, nLargo: 0 };
      panel.set(k, a);
    }
    a.ops++;
    const p = r.premium || 0;
    if (o.call) { a.nCall++; if (c) a.cAsk += p; else a.cBid += p;
      if (dte >= 180) { a.nLargo++; if (c) a.lAsk += p; else a.lBid += p;
        largoPorTicker.set(o.u, (largoPorTicker.get(o.u) ?? 0) + 1); } }
    else { a.nPut++; if (c) a.pAsk += p; else a.pBid += p; }
  }
}
console.log(`\n## FLUJO LEÍDO`);
console.log(`operaciones totales ${tot} · sin OCC ${sinOcc} · fuera del universo ${fueraUniverso} (${(100 * fueraUniverso / tot).toFixed(1)}%) · sin lado ${sinLado}`);
const enUniverso = tot - sinOcc - fueraUniverso - sinLado;
console.log(`operaciones USABLES (universo + lado): ${enUniverso} (${(100 * enUniverso / tot).toFixed(1)}%)`);
console.log(`celdas (día,ticker) con flujo: ${panel.size}`);

// cobertura por ticker
console.log(`\n## COBERTURA POR TICKER (días con ≥1 call con lado / con ≥5 calls / calls a ≥180 días)`);
const filaT = [];
for (const t of TICKERS) {
  const cs = [...panel.values()].filter((a) => a.T === t);
  const d1 = cs.filter((a) => a.nCall >= 1).length;
  const d5 = cs.filter((a) => a.nCall >= 5).length;
  filaT.push({ t, d1, d5, largo: largoPorTicker.get(t) ?? 0 });
}
filaT.sort((a, b) => b.d5 - a.d5);
for (const f of filaT) console.log(`  ${f.t.padEnd(5)} dias≥1call ${String(f.d1).padStart(3)} · dias≥5calls ${String(f.d5).padStart(3)} · ops calls ≥180d ${String(f.largo).padStart(5)}`);

// ── 4. ¿EXISTE EL PERFIL CONVEXO EN LA CADENA? ────────────────────────────────────────────
// vol realizada de 60 días (SOLO pasado) desde cierres reales
const cierres = {};
for (const t of TICKERS) {
  try { cierres[t] = JSON.parse(fs.readFileSync(path.join(CIE, `${t}.json`), "utf8")); } catch { cierres[t] = null; }
}
const faltanCierres = TICKERS.filter((t) => !cierres[t]);
if (faltanCierres.length) console.log(`\nSIN FICHERO DE CIERRES: ${faltanCierres.join(" ")}`);

function rv60(t, dia) {
  const c = cierres[t]; if (!c) return null;
  const ds = Object.keys(c).sort().filter((d) => d < dia);   // ESTRICTAMENTE ANTES
  if (ds.length < 61) return null;
  const u = ds.slice(-61);
  const r = [];
  for (let i = 1; i < u.length; i++) {
    const a = c[u[i - 1]], b = c[u[i]];
    if (!(a > 0) || !(b > 0)) return null;
    r.push(Math.log(b / a));
  }
  const m = r.reduce((s, x) => s + x, 0) / r.length;
  const v = r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v * 252);
}

const cacheCad = new Map();
const leerCad = (t, d) => {
  const k = `${t}|${d}`;
  if (cacheCad.has(k)) return cacheCad.get(k);
  let j = null;
  try { j = JSON.parse(fs.readFileSync(path.join(CAD, `${t}_d${d}.json`), "utf8")); } catch {}
  if (cacheCad.size > 3000) cacheCad.clear();
  cacheCad.set(k, j);
  return j;
};

console.log(`\n## ¿EXISTE EL PERFIL (call a ~1 año, strike ≥ 1,5σ, con bid Y ask)?`);
console.log(`   probado sobre los ${solape.length} días de solape × ${TICKERS.length} tickers`);
let hay = 0, noCad = 0, noExp = 0, noStrike = 0, noRV = 0;
const moneyness = [], dtes = [], primas = [], ivImplied = [];
const hayPorTicker = new Map();
const expsPorDia = new Map();

for (const d of solape) {
  for (const t of TICKERS) {
    const s = cierres[t]?.[d];
    const sig = rv60(t, d);
    if (!(s > 0) || !sig) { noRV++; continue; }
    const j = leerCad(t, d);
    if (!j) { noCad++; continue; }
    // vencimiento: el más cercano a 365 días dentro de [300, 450]
    let mejor = null;
    for (const e of Object.keys(j)) {
      const dte = dias360(d, e);
      if (dte < 300 || dte > 450) continue;
      if (!mejor || Math.abs(dte - 365) < Math.abs(dias360(d, mejor) - 365)) mejor = e;
    }
    if (!mejor) { noExp++; continue; }
    const dte = dias360(d, mejor);
    const objetivo = s * Math.exp(1.5 * sig * Math.sqrt(dte / 365));
    // strike listado más bajo que sea ≥ objetivo y con call cotizada (bid y ask)
    let K = null;
    for (const key of Object.keys(j[mejor])) {
      if (!key.endsWith("|C")) continue;
      const k = Number(key.slice(0, -2));
      if (!(k >= objetivo)) continue;
      const [b, a] = j[mejor][key];
      if (!(b > 0) || !(a > 0)) continue;
      if (K === null || k < K) K = k;
    }
    if (K === null) { noStrike++; continue; }
    hay++;
    hayPorTicker.set(t, (hayPorTicker.get(t) ?? 0) + 1);
    moneyness.push(K / s);
    dtes.push(dte);
    primas.push(j[mejor][`${K}|C`][1] * 100);
    ivImplied.push(sig);
    expsPorDia.set(`${d}|${t}`, mejor);
  }
}
const pc = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
console.log(`  CON perfil: ${hay}  ·  sin cadena ${noCad} · sin vencimiento en [300,450]d ${noExp} · sin strike ≥1,5σ cotizado ${noStrike} · sin rv/cierre ${noRV}`);
console.log(`  moneyness K/S : p10 ${pc(moneyness, .1).toFixed(2)} · p50 ${pc(moneyness, .5).toFixed(2)} · p90 ${pc(moneyness, .9).toFixed(2)}`);
console.log(`  DTE           : p10 ${pc(dtes, .1)} · p50 ${pc(dtes, .5)} · p90 ${pc(dtes, .9)}`);
console.log(`  prima al ASK $: p10 ${pc(primas, .1).toFixed(0)} · p50 ${pc(primas, .5).toFixed(0)} · p90 ${pc(primas, .9).toFixed(0)}`);
console.log(`  rv60 anual    : p10 ${(pc(ivImplied, .1) * 100).toFixed(0)}% · p50 ${(pc(ivImplied, .5) * 100).toFixed(0)}% · p90 ${(pc(ivImplied, .9) * 100).toFixed(0)}%`);
console.log(`\n  días con perfil por ticker:`);
for (const t of TICKERS) console.log(`    ${t.padEnd(5)} ${String(hayPorTicker.get(t) ?? 0).padStart(3)} / ${solape.length}`);

// ── 5. ELEGIBLES POR DÍA (cuántos candidatos hay que ordenar) ─────────────────────────────
console.log(`\n## CANDIDATOS POR DÍA (perfil disponible Y con ≥5 calls de flujo ese día)`);
const cands = [];
for (const d of solape) {
  let n = 0;
  for (const t of TICKERS) {
    if (!expsPorDia.has(`${d}|${t}`)) continue;
    const a = panel.get(`${d}|${t}`);
    if (!a || a.nCall < 5) continue;
    n++;
  }
  cands.push({ d, n });
}
console.log(`  p10 ${pc(cands.map(c => c.n), .1)} · p50 ${pc(cands.map(c => c.n), .5)} · p90 ${pc(cands.map(c => c.n), .9)} · min ${Math.min(...cands.map(c => c.n))} · max ${Math.max(...cands.map(c => c.n))}`);
console.log(`  días con <5 candidatos: ${cands.filter(c => c.n < 5).length}`);

// ── 6. LA RESTRICCIÓN QUE MANDA: APUESTAS INDEPENDIENTES ──────────────────────────────────
console.log(`\n## APUESTAS INDEPENDIENTES`);
for (const H of [5, 10, 20, 40]) {
  const entradas = solape.filter((d, i) => i + H < calendario.indexOf(solape[0]) + 999 && calendario.indexOf(d) + H < calendario.length).length;
  console.log(`  H=${H} días: entradas con salida dentro de la cadena = ${entradas} · bloques SIN SOLAPE = ${Math.floor(entradas / H)}`);
}

// ── 7. LA RUPTURA DEL 16-JUL ──────────────────────────────────────────────────────────────
const antes = solape.filter((d) => d < "20260716");
const desp = solape.filter((d) => d >= "20260716");
console.log(`\n## RUPTURA 2026-07-16`);
console.log(`  días de solape ANTES: ${antes.length} (${antes[0]} → ${antes[antes.length - 1]})`);
console.log(`  días de solape DESPUÉS: ${desp.length} (${desp[0]} → ${desp[desp.length - 1]})`);

fs.writeFileSync(path.join("scripts", "marketsnack", "convex-1-salida.json"), JSON.stringify({
  tickers: TICKERS, solape, hay, noCad, noExp, noStrike, noRV,
  moneyness: { p10: pc(moneyness, .1), p50: pc(moneyness, .5), p90: pc(moneyness, .9) },
  cands, antes: antes.length, desp: desp.length,
}), "utf8");
console.log(`\n## guardado en scripts/marketsnack/convex-1-salida.json`);
