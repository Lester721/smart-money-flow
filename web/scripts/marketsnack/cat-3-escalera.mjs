// CATÁLOGO · PASO 3 — LA ESCALERA DE PRIMA, Y CUÁNTO FALTA
//
// cat-2 dice que el feed NO elige mejor que el azar en la esquina barata... salvo en un
// sitio: las operaciones de una sola pata compradas al ask por ≥$1M (+10 puntos sobre el
// azar, n=50). Aquí se interroga eso: ¿es monótono en el tamaño de la prima, o es un
// accidente de 50 filas? Y si no se puede establecer: ¿cuántos días harían falta?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/cat-3-escalera.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import rl from "node:readline";
import { TRADE_CONDITIONS } from "../../lib/conditions.ts";

const CIERRES = path.resolve("scripts/cache-theta/cierres");
const CADENAS = path.resolve("scripts/cache-theta/cadenas");
const SALIDA = path.resolve("scripts/marketsnack/cat-3-salida.json");

const CODE = new Map(TRADE_CONDITIONS.map((c) => [c.id, c.code]));
const SUELTA = new Set(["AUTO", "ISOI", "SLAN", "SLAI", "SLCN", "SLCI", "SLFT", "REOP"]);
const MULTI = new Set(["MLET", "MLAT", "MLCT", "MLFT", "CBMO", "MESL", "MASL", "MFSL"]);
const AL_ASK = new Set(["ASKSIDE", "ABOVE_ASK", "AT_ASK"]);

const HOLD = 23, TOL = 6, SOLAPE = 16;
// dos esquinas: la barata medida, y una ensanchada para ganar muestra
const ESQ = {
  estrecha: { otm: [0.03, 0.08], dte: [60, 120] },
  ancha: { otm: [0.02, 0.12], dte: [45, 160] },
};

const cierres = new Map();
for (const f of fs.readdirSync(CIERRES)) cierres.set(f.replace(".json", ""), JSON.parse(fs.readFileSync(path.join(CIERRES, f), "utf8")));
const diasCadena = new Map();
for (const f of fs.readdirSync(CADENAS)) {
  const m = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!m) continue;
  if (!diasCadena.has(m[1])) diasCadena.set(m[1], new Set());
  diasCadena.get(m[1]).add(m[2]);
}
const UNIV = [...diasCadena.keys()].filter((t) => cierres.has(t)).sort();
const ES_UNIV = new Set(UNIV);

const cache = new Map();
function cadena(t, d) {
  const k = `${t}|${d}`; if (cache.has(k)) return cache.get(k);
  const p = path.join(CADENAS, `${t}_d${d}.json`);
  let v = null; if (fs.existsSync(p)) { try { v = JSON.parse(fs.readFileSync(p, "utf8")); } catch {} }
  if (cache.size > 3000) cache.clear();
  cache.set(k, v); return v;
}
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const mas = (d, n) => { const x = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return ymd(x); };
const entre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6)) - Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6))) / 86400000);
function diaCad(t, d, tol) { const s = diasCadena.get(t); if (!s) return null; for (let i = 0; i <= tol; i++) { const x = mas(d, i); if (s.has(x)) return x; } return null; }
function cot(t, d, v, s, tp) { const c = cadena(t, d); const q = c?.[v]?.[`${s}|${tp}`]; if (!q) return null; const [b, a] = q; return a > 0 && b != null ? [b, a] : null; }
function operar(t, dia, venc, strike, tipo) {
  const dIn = diaCad(t, dia, 0); if (!dIn) return null;
  const qIn = cot(t, dIn, venc, strike, tipo); if (!qIn || !(qIn[1] >= 0.05)) return null;
  const dOut = diaCad(t, mas(dia, HOLD), TOL); if (!dOut || entre(dOut, venc) < 1) return null;
  const qOut = cot(t, dOut, venc, strike, tipo);
  return { ret: (qOut ? qOut[0] : 0) / qIn[1] - 1 };
}
function esquinaDe(t, dia, tipo, esq) {
  const c = cadena(t, dia); if (!c) return [];
  const spot = cierres.get(t)?.[dia]; if (!(spot > 0)) return [];
  const out = [];
  for (const venc of Object.keys(c)) {
    const dte = entre(dia, venc); if (dte < esq.dte[0] || dte > esq.dte[1]) continue;
    for (const k of Object.keys(c[venc])) {
      const [sS, tp] = k.split("|"); if (tp !== tipo) continue;
      const st = +sS, otm = tp === "C" ? (st - spot) / spot : (spot - st) / spot;
      if (otm < esq.otm[0] || otm > esq.otm[1]) continue;
      const [b, a] = c[venc][k]; if (!(a >= 0.05) || b == null) continue;
      out.push({ venc, strike: String(st), tipo: tp });
    }
  }
  return out;
}
let sem = 7771; const rnd = () => { sem = (sem * 1103515245 + 12345) & 0x7fffffff; return sem / 0x7fffffff; };

// ── recolección ──────────────────────────────────────────────────────────────
const P = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const ev = new Map();
for (const NIVEL of ["100k", "1000k"]) {
  const DIR = path.resolve(`scripts/cache-theta/marketsnack/flujo-${NIVEL}`);
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".jsonl.gz")).sort()) {
    const dia = f.replace(".jsonl.gz", "").replace(/-/g, "");
    const inp = fs.createReadStream(path.join(DIR, f)).pipe(zlib.createGunzip());
    for await (const l of rl.createInterface({ input: inp })) {
      if (!l.trim()) continue;
      let x; try { x = JSON.parse(l); } catch { continue; }
      const m = P.exec(x.symbol ?? ""); if (!m) continue;
      const [, root, yy, tipo, str] = m;
      if (!ES_UNIV.has(root)) continue;
      const c = CODE.get(x.trade_condition_id); if (!c || (!SUELTA.has(c) && !MULTI.has(c))) continue;
      const venc = `20${yy}`, strike = +str / 1000, dte = entre(dia, venc);
      if (dte < ESQ.ancha.dte[0] || dte > ESQ.ancha.dte[1]) continue;
      const spot = x.asset_price ?? cierres.get(root)?.[dia]; if (!(spot > 0)) continue;
      const otm = tipo === "C" ? (strike - spot) / spot : (spot - strike) / spot;
      if (otm < ESQ.ancha.otm[0] || otm > ESQ.ancha.otm[1]) continue;
      const k = `${dia}|${root}|${venc}|${strike}|${tipo}`;
      const cand = {
        dia, root, venc, strike: String(strike), tipo, prima: x.premium ?? 0,
        suelta: SUELTA.has(c), alAsk: AL_ASK.has(x.side),
        estrecha: otm >= ESQ.estrecha.otm[0] && otm <= ESQ.estrecha.otm[1] && dte >= ESQ.estrecha.dte[0] && dte <= ESQ.estrecha.dte[1],
      };
      const p = ev.get(k); if (!p || cand.prima > p.prima) ev.set(k, cand);
    }
  }
}

// ── medir cada evento + su control ───────────────────────────────────────────
const filas = [];
for (const e of ev.values()) {
  const r = operar(e.root, e.dia, e.venc, e.strike, e.tipo); if (!r) continue;
  const dIn = diaCad(e.root, e.dia, 0);
  const pool = esquinaDe(e.root, dIn, e.tipo, e.estrecha ? ESQ.estrecha : ESQ.ancha);
  let azar = null;
  if (pool.length) { const c = pool[Math.floor(rnd() * pool.length)]; azar = operar(e.root, e.dia, c.venc, c.strike, c.tipo)?.ret ?? null; }
  filas.push({ ...e, ret: r.ret, azar });
}

const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
function stats(fs_) {
  if (fs_.length < 4) return null;
  const rets = fs_.map((f) => f.ret);
  const conAzar = fs_.filter((f) => f.azar != null);
  const exceso = conAzar.map((f) => f.ret - f.azar);
  const porDia = new Map();
  for (const f of conAzar) { if (!porDia.has(f.dia)) porDia.set(f.dia, []); porDia.get(f.dia).push(f.ret - f.azar); }
  const serie = [...porDia.values()].map(media);
  const tDia = serie.length >= 4 ? media(serie) / (sd(serie) / Math.sqrt(serie.length)) : null;
  const cu = new Map(); for (const f of fs_) cu.set(f.root, (cu.get(f.root) ?? 0) + 1);
  const may = [...cu.entries()].sort((a, b) => b[1] - a[1])[0];
  const ord = [...fs_].sort((a, b) => a.dia.localeCompare(b.dia));
  const k = Math.floor(ord.length / 3);
  const terc = k >= 3 ? [0, 1, 2].map((i) => {
    const g = (i < 2 ? ord.slice(i * k, (i + 1) * k) : ord.slice(2 * k)).filter((x) => x.azar != null);
    return g.length ? media(g.map((x) => x.ret - x.azar)) : null;
  }) : [];
  return {
    n: fs_.length, ret: media(rets), gana: rets.filter((x) => x > 0).length / rets.length,
    azar: conAzar.length ? media(conAzar.map((f) => f.azar)) : null,
    exceso: exceso.length ? media(exceso) : null, sdExceso: exceso.length > 1 ? sd(exceso) : null,
    tExcesoDiario: tDia, dias: porDia.size, nEf: porDia.size / SOLAPE,
    mayor: may ? { t: may[0], pct: may[1] / fs_.length } : null, tercios: terc,
  };
}

// ── escalera de prima sobre las de UNA PATA COMPRADAS AL ASK ─────────────────
const base = filas.filter((f) => f.suelta && f.alAsk);
const CORTES = [0, 2.5e5, 5e5, 1e6, 2.5e6, 5e6, Infinity];
const escalera = [];
for (let i = 0; i < CORTES.length - 1; i++) {
  const g = base.filter((f) => f.prima >= CORTES[i] && f.prima < CORTES[i + 1]);
  escalera.push({ desde: CORTES[i], hasta: CORTES[i + 1], ...(stats(g) ?? { n: g.length }) });
}
// acumulados "≥ X" — es la forma en que se OPERA (un umbral, no una banda)
const acum = [];
for (const c of [1e5, 2.5e5, 5e5, 1e6, 2e6, 5e6]) {
  const g = base.filter((f) => f.prima >= c);
  acum.push({ umbral: c, esquina: "ancha", ...(stats(g) ?? { n: g.length }) });
  const ge = g.filter((f) => f.estrecha);
  acum.push({ umbral: c, esquina: "estrecha", ...(stats(ge) ?? { n: ge.length }) });
}
// controles: mismas cribas sobre lo que NO es una pata suelta al ask
const contra = {
  patas_de_spread_1M: stats(filas.filter((f) => !f.suelta && f.prima >= 1e6)),
  suelta_no_ask_1M: stats(filas.filter((f) => f.suelta && !f.alAsk && f.prima >= 1e6)),
  todo_1M: stats(filas.filter((f) => f.prima >= 1e6)),
};

// ── cuánto falta ─────────────────────────────────────────────────────────────
function cuantoFalta(s, diasMuestra) {
  if (!s?.sdExceso || !s.exceso) return null;
  // n de PRINTS necesarios para t=2 con el exceso observado, corrigiendo por solapamiento
  const nNec = Math.ceil((2 * s.sdExceso / Math.abs(s.exceso)) ** 2);
  const porDia = s.n / diasMuestra;
  return { nNecesario: nNec, opsPorDia: porDia, sesionesNecesarias: Math.ceil(nNec / porDia), nEfNecesaria: nNec / SOLAPE };
}

const DIAS_MUESTRA = 74; // días de bolsa con cadena en el tramo 2026-04-22 → 2026-08-06
const salida = { nFilas: filas.length, universo: UNIV, escalera, acum, contra, diasMuestra: DIAS_MUESTRA };
const mejor = acum.filter((a) => a.n >= 30).sort((a, b) => (b.exceso ?? -9) - (a.exceso ?? -9))[0];
salida.mejor = mejor ? { ...mejor, falta: cuantoFalta(mejor, DIAS_MUESTRA) } : null;
fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 1));

const F = (x, d = 2) => x == null ? "   —  " : ((x >= 0 ? "+" : "") + (x * 100).toFixed(d) + "%").padStart(8);
console.log(`═══ ESCALERA DE PRIMA · una sola pata, comprada al ask · salida ${HOLD}d ═══`);
console.log(`   filas con precio real: ${filas.length}  ·  base (suelta+ask): ${base.length}\n`);
console.log(`banda de prima          n     ret/op    azar    exceso   t(exc)  días  nEf   mayor`);
for (const e of escalera) {
  const et = `$${(e.desde / 1e3).toFixed(0)}k–${e.hasta === Infinity ? "∞" : "$" + (e.hasta / 1e6).toFixed(1) + "M"}`;
  console.log(`${et.padEnd(20)} ${String(e.n).padStart(5)} ${F(e.ret)} ${F(e.azar)} ${F(e.exceso)} ${(e.tExcesoDiario ?? 0).toFixed(2).padStart(7)} ${String(e.dias ?? 0).padStart(5)} ${(e.nEf ?? 0).toFixed(1).padStart(4)}  ${e.mayor ? e.mayor.t + " " + (e.mayor.pct * 100).toFixed(0) + "%" : ""}`);
}
console.log(`\n═══ UMBRAL "≥ X" (así se opera) ═══`);
console.log(`umbral   esquina      n     ret/op    azar    exceso   t(exc)  días  nEf   mayor      tercios`);
for (const a of acum) {
  console.log(`≥$${(a.umbral / 1e6).toFixed(2)}M ${a.esquina.padEnd(9)} ${String(a.n).padStart(5)} ${F(a.ret)} ${F(a.azar)} ${F(a.exceso)} ${(a.tExcesoDiario ?? 0).toFixed(2).padStart(7)} ${String(a.dias ?? 0).padStart(5)} ${(a.nEf ?? 0).toFixed(1).padStart(4)}  ${(a.mayor ? a.mayor.t + " " + (a.mayor.pct * 100).toFixed(0) + "%" : "").padEnd(9)} ${(a.tercios ?? []).map((x) => F(x, 1)).join("")}`);
}
console.log(`\n═══ CONTROLES (mismo umbral, otra clase de print) ═══`);
for (const [k, v] of Object.entries(contra)) {
  if (!v) { console.log(`   ${k}: sin muestra`); continue; }
  console.log(`   ${k.padEnd(22)} n=${String(v.n).padStart(4)} ret ${F(v.ret)} azar ${F(v.azar)} exceso ${F(v.exceso)} t ${(v.tExcesoDiario ?? 0).toFixed(2)}`);
}
if (salida.mejor) {
  const m = salida.mejor;
  console.log(`\n═══ EL MEJOR ESCALÓN CON n≥30 ═══`);
  console.log(`   ≥$${(m.umbral / 1e6).toFixed(2)}M · esquina ${m.esquina} · n=${m.n} · exceso ${F(m.exceso)} · t=${(m.tExcesoDiario ?? 0).toFixed(2)} · nEf=${(m.nEf ?? 0).toFixed(1)}`);
  console.log(`   tercios: ${(m.tercios ?? []).map((x) => F(x)).join(" ")}`);
  if (m.falta) console.log(`   para t=2 harían falta ${m.falta.nNecesario} operaciones → ${m.falta.sesionesNecesarias} sesiones (${(m.falta.sesionesNecesarias / 252).toFixed(1)} años) al ritmo actual de ${m.falta.opsPorDia.toFixed(2)}/día`);
}
console.log(`\n   guardado en ${SALIDA}`);
