// ═══ COMBINACIÓN · PASO 5 — EL CONTROL AL AZAR DE LA VARIANTE Y CUÁNTO FALTA ════════════
//
// El paso 4 destapó que el culpable NO era el sub-universo: exigir ≥3 operaciones que abren
// interés MULTIPLICA POR 4,9 la separación de `direccion` cruda (0,046% → 0,225%) y alinea
// los tres tercios. Lo que resta es calcular la dirección SÓLO con esas pocas operaciones,
// que viven en contratos con OI mediano de 4 contratos: es el trozo más ruidoso del flujo.
//
// ESO ES UN HALLAZGO POST-HOC. No se reporta como señal. Aquí se hace lo único legítimo con
// él: calibrarlo contra el azar y calcular EXACTAMENTE cuánta muestra fresca pide un
// forward-test preinscrito. Y se traduce a dólares al año con el peaje encima.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const RAIZ = path.join("scripts", "cache-theta", "marketsnack");
const DIR = path.join(RAIZ, "flujo-100k");
const CH = path.join(RAIZ, "aux", "chart-all");
const CORTE = 10 * 60 + 30, MIN_OPS = 5, MIN_NUEVAS = 3, MIN_SIM = 20, SORTEOS = 500;
const CUENTA = 56389, DIAS_ANO = 252;

const PROXY = { SPX: "SPY", SPXW: "SPY", XSP: "SPY", NDX: "QQQ", NDXP: "QQQ", RUT: "IWM" };
const APAL = new Set(["TQQQ","SOXL","SQQQ","SOXS","UVXY","TZA","TNA","SPXU","UPRO","LABU","LABD","YINN","FNGU","NVDL","TSLL","BOIL","KOLD","VXX","SVIX","UVIX"]);
const COMPRA = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const VENTA  = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);
const parseOcc = (s) => {
  const k = s.slice(-8), t = s.slice(-9, -8), d = s.slice(-15, -9), u = s.slice(0, -15);
  return (/^\d{8}$/.test(k) && /^[CP]$/.test(t) && /^\d{6}$/.test(d) && u) ? { u, call: t === "C" } : null;
};
const cierres = new Map();
for (const f of fs.readdirSync(CH)) {
  if (!f.endsWith(".json.gz")) continue;
  let j; try { j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CH, f))).toString("utf8")); } catch { continue; }
  const d = j?.data ?? []; if (d.length < 60) continue;
  cierres.set(f.slice(0, -8), { c: d.map((p) => p.v), idx: new Map(d.map((p, i) => [p.t.slice(0, 10), i])) });
}
const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();

const A = new Map(), EN = new Map();
for (const dia of dias) {
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR, `${dia}.jsonl.gz`))).toString("utf8").trim();
  if (!txt) continue;
  for (const l of txt.split("\n")) {
    if (!l) continue;
    const r = JSON.parse(l);
    const o = parseOcc(r.symbol); if (!o) continue;
    const T = PROXY[o.u] ?? o.u; if (APAL.has(T) || !cierres.has(T)) continue;
    const min = ((Date.parse(r.timestamp) - 4 * 3600e3) / 60000) % 1440;
    const k = `${T}|${dia}`;
    if (o.u === T && r.asset_price > 0 && min >= CORTE) { const b = EN.get(k); if (!b || min < b.min) EN.set(k, { min, px: r.asset_price }); }
    if (min >= CORTE) continue;
    if (r.side == null || r.open_interest == null || r.size == null || r.premium == null) continue;
    const comp = COMPRA.has(r.side), vend = VENTA.has(r.side); if (!comp && !vend) continue;
    if (r.ask_price === 0 || r.bid_price === 0) continue;
    const p = r.premium || 0;
    let a = A.get(k); if (!a) { a = { T, dia, ops: 0, nOps: 0, Cc:0,Cv:0,Pc:0,Pv:0 }; A.set(k, a); }
    a.ops++; if (r.size > r.open_interest) a.nOps++;
    if (o.call) { comp ? a.Cc += p : a.Cv += p; } else { comp ? a.Pc += p : a.Pv += p; }
  }
}

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
const sd = (v) => { if (v.length < 2) return 0; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tUna = (v) => { const s = sd(v); return s > 0 ? media(v) / (s / Math.sqrt(v.length)) : 0; };

const porDia = new Map();
for (const a of A.values()) {
  if (a.ops < MIN_OPS || a.nOps < MIN_NUEVAS) continue;
  const Tot = a.Cc + a.Cv + a.Pc + a.Pv; if (!(Tot > 0)) continue;
  const s = cierres.get(a.T), i = s.idx.get(a.dia); if (i == null) continue;
  const cie = s.c[i], pe = EN.get(`${a.T}|${a.dia}`);
  if (!pe || !(cie > 0) || !(pe.px > 0) || Math.abs(pe.px / cie - 1) > 0.15) continue;
  const f = { T: a.T, dia: a.dia, r: cie / pe.px - 1, direccion: (a.Cc - a.Cv - a.Pc + a.Pv) / Tot };
  if (!porDia.has(a.dia)) porDia.set(a.dia, []); porDia.get(a.dia).push(f);
}

const S = [], Slargo = [], tickersUsados = new Map();
for (const [d, g] of [...porDia].sort()) {
  if (g.length < MIN_SIM) continue;
  const o = [...g].sort((a, b) => a.direccion - b.direccion), k = Math.floor(o.length / 3);
  if (k < 5) continue;
  const alto = o.slice(-k), bajo = o.slice(0, k), md = media(g.map((x) => x.r));
  S.push(media(alto.map((x) => x.r)) - media(bajo.map((x) => x.r)));
  Slargo.push(media(alto.map((x) => x.r)) - md);
  for (const f of alto) tickersUsados.set(f.T, (tickersUsados.get(f.T) ?? 0) + 1);
}
const sep = media(S), sdS = sd(S), t = tUna(S), n = S.length;
const sepL = media(Slargo), tL = tUna(Slargo);

console.log("═══ VARIANTE POST-HOC · `direccion` cruda en símbolos con ≥3 operaciones nuevas ═══");
console.log(`  ventanas ${n} · símbolos/día ${media([...porDia.values()].filter(g=>g.length>=MIN_SIM).map(g=>g.length)).toFixed(0)}`);
console.log(`  largo/corto : sep ${(sep * 100).toFixed(3)}%/día · sd ${(sdS * 100).toFixed(3)}% · t=${t.toFixed(2)} · días>0 ${S.filter(x=>x>0).length}/${n}`);
console.log(`  sólo largo  : sep ${(sepL * 100).toFixed(3)}%/día · t=${tL.toFixed(2)}   (contra la media del día)`);
const tot = [...tickersUsados.values()].reduce((a, b) => a + b, 0);
const may = [...tickersUsados].sort((a, b) => b[1] - a[1])[0];
console.log(`  concentración de la pata larga: ${tickersUsados.size} tickers distintos, mayor ${may[0]} ${((may[1] / tot) * 100).toFixed(1)}%`);

// ── control al azar ──────────────────────────────────────────────────────────────────────
let semilla = 20260819;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
const ts = [];
for (let s = 0; s < SORTEOS; s++) {
  const Sa = [];
  for (const [d, g] of [...porDia].sort()) {
    if (g.length < MIN_SIM) continue;
    const k = Math.floor(g.length / 3); if (k < 5) continue;
    const m = [...g];
    for (let i = m.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [m[i], m[j]] = [m[j], m[i]]; }
    Sa.push(media(m.slice(0, k).map((x) => x.r)) - media(m.slice(k, 2 * k).map((x) => x.r)));
  }
  ts.push(Math.abs(tUna(Sa)));
}
ts.sort((a, b) => a - b);
const gana = ts.filter((x) => x < Math.abs(t)).length;
console.log(`\n── CONTROL AL AZAR (${SORTEOS} sorteos) ──`);
console.log(`  |t| al azar: p50=${ts[250].toFixed(2)}  p90=${ts[449].toFixed(2)}  p95=${ts[474].toFixed(2)}  p99=${ts[494].toFixed(2)}`);
console.log(`  |t| real = ${Math.abs(t).toFixed(2)} → percentil ${((gana / SORTEOS) * 100).toFixed(1)}%  ·  p empírico = ${((SORTEOS - gana) / SORTEOS).toFixed(3)}`);
console.log(`  ${Math.abs(t) > ts[474] ? "GANA al azar al 95%" : "NO gana al azar al 95%"}`);

// ── cuánta muestra ───────────────────────────────────────────────────────────────────────
console.log(`\n── CUÁNTA MUESTRA PIDE UN FORWARD-TEST PREINSCRITO (listón 2,0, UNA prueba) ──`);
const nec = Math.ceil(((2.0 * sdS) / Math.abs(sep)) ** 2);
const tasa = n / dias.length;   // ventanas utilizables por día de flujo
console.log(`  ventanas necesarias con ESTE tamaño de efecto : ${nec}`);
console.log(`  ventanas en muestra hoy                        : ${n}  → faltarían ${Math.max(0, nec - n)} para cruzar el listón AQUÍ`);
console.log(`  pero AQUÍ es donde se encontró: una confirmación limpia necesita ${nec} ventanas FRESCAS`);
console.log(`  a ${(tasa * 100).toFixed(0)} ventanas por cada 100 días de flujo → ${Math.ceil(nec / tasa)} días de mercado ≈ ${(nec / tasa / 21).toFixed(1)} meses de captura diaria`);

console.log(`\n── EN DÓLARES AL AÑO (sobre $${CUENTA.toLocaleString("es-ES")}) ──`);
const ee = sdS / Math.sqrt(n);
console.log(`  bruto largo/corto : $${(sep * CUENTA * DIAS_ANO).toFixed(0)}/año  (IC 95%: $${((sep - 2 * ee) * CUENTA * DIAS_ANO).toFixed(0)} … $${((sep + 2 * ee) * CUENTA * DIAS_ANO).toFixed(0)} — CRUZA EL CERO)`);
console.log(`  bruto sólo largo  : $${(sepL * CUENTA * DIAS_ANO).toFixed(0)}/año`);
for (const pb of [2, 5, 10]) {
  const peajeLS = (pb / 10000) * 4, peajeL = (pb / 10000) * 2;
  console.log(`  peaje ${String(pb).padStart(2)} pb/cruce → L/S neto $${((sep - peajeLS) * CUENTA * DIAS_ANO).toFixed(0)}  ·  sólo largo neto $${((sepL - peajeL) * CUENTA * DIAS_ANO).toFixed(0)}`);
}
console.log(`  AVISO: la horquilla de ACCIONES no está en MarketSnack. Esos pb son escenario declarado, no medido.`);
console.log(`  AVISO: la pata corta son ~9 acciones vendidas en corto cada día y Robinhood NO permite corto de acciones.`);

fs.writeFileSync(path.join("scripts", "marketsnack", "comb-5-salida.json"), JSON.stringify({
  n, sep, sdS, t, sepL, tL, azar: { p50: ts[250], p95: ts[474], p99: ts[494], percentil: gana / SORTEOS },
  nec, tasa, diasMercado: Math.ceil(nec / tasa), meses: nec / tasa / 21,
  brutoLS: sep * CUENTA * DIAS_ANO, brutoL: sepL * CUENTA * DIAS_ANO,
  tickersDistintos: tickersUsados.size, mayor: { t: may[0], pct: may[1] / tot },
}, null, 1));
console.log("\n(guardado comb-5-salida.json)");
