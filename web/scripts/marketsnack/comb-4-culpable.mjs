// ═══ COMBINACIÓN · PASO 4 — ¿QUÉ MATÓ LA COMBINACIÓN: LA MÉTRICA O EL SUB-UNIVERSO? ═════
//
// La combinación cae a t=0,80. Hay DOS culpables posibles y llevan a arreglos opuestos:
//   (a) la MÉTRICA `direccionNueva` no vale → hay que cambiar cómo se marca "posición nueva"
//   (b) el SUB-UNIVERSO (símbolos con ≥3 operaciones nuevas antes de las 10:30) no vale →
//       el filtro se lleva por delante justo los símbolos donde el LADO funcionaba
//
// Se separa corriendo `direccion` cruda sobre los dos universos: el completo (ops≥5, que es
// el del hallazgo original) y el restringido. Si `direccion` cruda también se hunde en el
// restringido, el culpable es el universo. Esto NO es una prueba nueva de una señal: las dos
// cifras son de una métrica YA medida y descartada. Es diagnóstico de la caída.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const RAIZ = path.join("scripts", "cache-theta", "marketsnack");
const DIR = path.join(RAIZ, "flujo-100k");
const CH = path.join(RAIZ, "aux", "chart-all");
const CORTE = 10 * 60 + 30, MIN_OPS = 5, MIN_SIM = 20;

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
    const T = PROXY[o.u] ?? o.u;
    if (APAL.has(T) || !cierres.has(T)) continue;
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

function correr(minNuevas) {
  const filas = [];
  for (const a of A.values()) {
    if (a.ops < MIN_OPS || a.nOps < minNuevas) continue;
    const Tot = a.Cc + a.Cv + a.Pc + a.Pv; if (!(Tot > 0)) continue;
    const s = cierres.get(a.T), i = s.idx.get(a.dia); if (i == null) continue;
    const cie = s.c[i], pe = EN.get(`${a.T}|${a.dia}`);
    if (!pe || !(cie > 0) || !(pe.px > 0) || Math.abs(pe.px / cie - 1) > 0.15) continue;
    filas.push({ T: a.T, dia: a.dia, r: cie / pe.px - 1, direccion: (a.Cc - a.Cv - a.Pc + a.Pv) / Tot });
  }
  const porDia = new Map();
  for (const f of filas) { if (!porDia.has(f.dia)) porDia.set(f.dia, []); porDia.get(f.dia).push(f); }
  const S = [], nn = [];
  for (const [d, g] of [...porDia].sort()) {
    if (g.length < MIN_SIM) continue;
    const o = [...g].sort((a, b) => a.direccion - b.direccion), k = Math.floor(o.length / 3);
    if (k < 5) continue;
    S.push(media(o.slice(-k).map((x) => x.r)) - media(o.slice(0, k).map((x) => x.r)));
    nn.push(g.length);
  }
  const k = Math.floor(S.length / 3);
  const ter = [S.slice(0, k), S.slice(k, 2 * k), S.slice(2 * k)].map(media);
  return { filas: filas.length, ventanas: S.length, simb: media(nn), sep: media(S), t: tUna(S), ter, sd: sd(S) };
}

console.log("═══ `direccion` CRUDA sobre los dos universos (misma métrica, mismo corte 10:30) ═══");
console.log("universo                          filas  ventanas  simb/dia   sep L/S      t     tercios");
const etiquetas = [[0, "completo (ops≥5) — el original"], [1, "con ≥1 operacion nueva"], [3, "con ≥3 operaciones nuevas"], [5, "con ≥5 operaciones nuevas"]];
const salida = [];
for (const [mn, et] of etiquetas) {
  const R = correr(mn);
  salida.push({ minNuevas: mn, ...R });
  console.log(`${et.padEnd(33)} ${String(R.filas).padStart(5)}  ${String(R.ventanas).padStart(8)}  ${R.simb.toFixed(0).padStart(7)}  ${(R.sep * 100).toFixed(3).padStart(8)}%  ${R.t.toFixed(2).padStart(6)}   ${R.ter.map((x) => (x >= 0 ? "+" : "−")).join("")}`);
}
console.log("\n  Si `direccion` cruda aguanta en el universo completo y se hunde al exigir operaciones");
console.log("  nuevas, el culpable es el FILTRO, no la métrica.");

fs.writeFileSync(path.join("scripts", "marketsnack", "comb-4-salida.json"), JSON.stringify(salida, null, 1));
console.log("\n(guardado comb-4-salida.json)");
