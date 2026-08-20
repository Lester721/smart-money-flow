// ═══════════════════════════════════════════════════════════════════════════════════════════
// OPERAR · OPCIONES (1) — EXTRAER una caché compacta de la cadena 0DTE.
//
// De los 5,2 GB de CSV se saca sólo lo que hace falta para operar:
//   · el CAMINO del subyacente cada 5 min (misma serie que las cotizaciones — un solo feed,
//     nunca se cruza con barras de otro sitio)
//   · bid/ask REALES de call y put para la banda de strikes de ±1,25% alrededor de la apertura
//
// Salida: scripts/opc-cache.ndjson (una línea por día)
// Uso: node --import tsx --max-old-space-size=10240 scripts/opc-1-extraer.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const OUT = "scripts/opc-cache.ndjson";
const BANDA = 1.25; // % alrededor de la apertura

function columnas(head, req) {
  const c = head.trim().split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
  const ix = {};
  for (const r of req) { const i = c.indexOf(r); if (i < 0) throw new Error(`FALTA la columna "${r}" — hay: ${c.join(",")}`); ix[r] = i; }
  return ix;
}
const num = (s) => { const v = parseFloat(s); return Number.isFinite(v) ? v : NaN; };
const REQ = ["strike", "right", "timestamp", "bid", "ask", "underlying_price"];

/** Lee un lado y devuelve Map<hh, Map<K,[bid,ask]>> + Map<hh, S>. */
function leerLado(fecha, lado) {
  const p = `${DIR}/iv_${fecha}_${lado}.csv`;
  if (!existsSync(p)) return null;
  const L = readFileSync(p, "utf8").split("\n");
  const ix = columnas(L[0], REQ);
  const q = new Map(), sub = new Map();
  for (let i = 1; i < L.length; i++) {
    const l = L[i]; if (!l) continue;
    const c = l.split(",");
    if (c.length <= ix.underlying_price) continue;
    const hh = (c[ix.timestamp] || "").replace(/"/g, "").slice(11, 16); if (!hh) continue;
    const K = num(c[ix.strike]), bid = num(c[ix.bid]), ask = num(c[ix.ask]), S = num(c[ix.underlying_price]);
    if (!Number.isFinite(K)) continue;
    if (!q.has(hh)) { q.set(hh, new Map()); sub.set(hh, []); }
    q.get(hh).set(K, [bid, ask]);
    if (S > 0) sub.get(hh).push(S);
  }
  const Sm = new Map();
  for (const [hh, v] of sub) { if (v.length) { v.sort((a, b) => a - b); Sm.set(hh, v[v.length >> 1]); } }
  return { q, S: Sm };
}

const dias = readdirSync(DIR).filter((f) => /^iv_\d{4}-\d{2}-\d{2}_C\.csv$/.test(f)).map((f) => f.slice(3, 13)).sort();
writeFileSync(OUT, "", "utf8");

let ok = 0, sin = 0, buf = [];
const t0 = Date.now();
for (let n = 0; n < dias.length; n++) {
  const d = dias[n];
  const C = leerLado(d, "C"), P = leerLado(d, "P");
  if (!C || !P) { sin++; continue; }
  // sellos comunes a los dos lados, con subyacente vivo (09:30 está MUERTO: subyacente = 0)
  const ts = [...C.S.keys()].filter((hh) => C.S.get(hh) > 0 && P.S.has(hh) && P.S.get(hh) > 0).sort();
  if (ts.length < 60) { sin++; continue; }
  const ap = C.S.get(ts[0]);
  if (!(ap > 0)) { sin++; continue; }
  const lo = ap * (1 - BANDA / 100), hi = ap * (1 + BANDA / 100);
  const Ks = [...new Set([...C.q.get(ts[0]).keys()])].filter((K) => K >= lo && K <= hi).sort((a, b) => a - b);
  if (Ks.length < 5) { sin++; continue; }
  const r2 = (x) => (Number.isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : -1);
  const rec = {
    f: d,
    ts,
    S: ts.map((hh) => Math.round(C.S.get(hh) * 100) / 100),
    K: Ks,
    cb: Ks.map((K) => ts.map((hh) => r2(C.q.get(hh)?.get(K)?.[0]))),
    ca: Ks.map((K) => ts.map((hh) => r2(C.q.get(hh)?.get(K)?.[1]))),
    pb: Ks.map((K) => ts.map((hh) => r2(P.q.get(hh)?.get(K)?.[0]))),
    pa: Ks.map((K) => ts.map((hh) => r2(P.q.get(hh)?.get(K)?.[1]))),
  };
  buf.push(JSON.stringify(rec));
  ok++;
  if (buf.length >= 25) { appendFileSync(OUT, buf.join("\n") + "\n", "utf8"); buf = []; }
  if (n % 100 === 0) process.stdout.write(`\r   ${n}/${dias.length}  ${d}  ${((Date.now() - t0) / 1000).toFixed(0)}s   `);
}
if (buf.length) appendFileSync(OUT, buf.join("\n") + "\n", "utf8");
console.log(`\n   días con caché: ${ok} · descartados: ${sin} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`   escrito ${OUT}`);
