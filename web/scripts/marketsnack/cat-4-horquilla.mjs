// CATÁLOGO · PASO 4 — ¿LA VENTAJA DEL FEED ES DIRECCIÓN O ES HORQUILLA?
//
// cat-3 deja un exceso sobre el azar de +2 a +3 puntos en TODOS los escalones de prima.
// Pero el control lo delata: las de una pata compradas al ask dan +4,92% y las de una pata
// NO compradas al ask dan +4,04%. Si comprar arriba y comprar abajo ganan lo mismo, lo que
// se está midiendo NO es la dirección.
//
// Hipótesis: el flujo grande vive en los strikes LÍQUIDOS. El sorteo, no. Como la horquilla
// es un % de la prima (ver memoria "la horquilla es un % de la PRIMA"), comprar al ask un
// contrato con horquilla del 4% y comprar al ask uno con horquilla del 20% se llevan 16
// puntos de diferencia SIN que nadie haya acertado nada.
//
// Prueba decisiva: sortear el contrato de control EMPAREJADO POR HORQUILLA. Si el exceso
// desaparece, la ventaja era el peaje, no la elección.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/cat-4-horquilla.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import rl from "node:readline";
import { TRADE_CONDITIONS } from "../../lib/conditions.ts";

const CIERRES = path.resolve("scripts/cache-theta/cierres");
const CADENAS = path.resolve("scripts/cache-theta/cadenas");
const SALIDA = path.resolve("scripts/marketsnack/cat-4-salida.json");

const CODE = new Map(TRADE_CONDITIONS.map((c) => [c.id, c.code]));
const SUELTA = new Set(["AUTO", "ISOI", "SLAN", "SLAI", "SLCN", "SLCI", "SLFT", "REOP"]);
const MULTI = new Set(["MLET", "MLAT", "MLCT", "MLFT", "CBMO", "MESL", "MASL", "MFSL"]);
const AL_ASK = new Set(["ASKSIDE", "ABOVE_ASK", "AT_ASK"]);
const HOLD = 23, TOL = 6, SOLAPE = 16;
const OTM = [0.02, 0.12], DTE = [45, 160];

const cierres = new Map();
for (const f of fs.readdirSync(CIERRES)) cierres.set(f.replace(".json", ""), JSON.parse(fs.readFileSync(path.join(CIERRES, f), "utf8")));
const diasCadena = new Map();
for (const f of fs.readdirSync(CADENAS)) { const m = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!m) continue; if (!diasCadena.has(m[1])) diasCadena.set(m[1], new Set()); diasCadena.get(m[1]).add(m[2]); }
const UNIV = [...diasCadena.keys()].filter((t) => cierres.has(t)).sort();
const ES_UNIV = new Set(UNIV);

const cache = new Map();
function cadena(t, d) { const k = `${t}|${d}`; if (cache.has(k)) return cache.get(k); const p = path.join(CADENAS, `${t}_d${d}.json`); let v = null; if (fs.existsSync(p)) { try { v = JSON.parse(fs.readFileSync(p, "utf8")); } catch {} } if (cache.size > 3000) cache.clear(); cache.set(k, v); return v; }
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const mas = (d, n) => { const x = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return ymd(x); };
const entre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6)) - Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6))) / 86400000);
function diaCad(t, d, tol) { const s = diasCadena.get(t); if (!s) return null; for (let i = 0; i <= tol; i++) { const x = mas(d, i); if (s.has(x)) return x; } return null; }
function cot(t, d, v, s, tp) { const q = cadena(t, d)?.[v]?.[`${s}|${tp}`]; if (!q) return null; const [b, a] = q; return a > 0 && b != null ? [b, a] : null; }
function operar(t, dia, venc, strike, tipo) {
  const dIn = diaCad(t, dia, 0); if (!dIn) return null;
  const qIn = cot(t, dIn, venc, strike, tipo); if (!qIn || !(qIn[1] >= 0.05)) return null;
  const dOut = diaCad(t, mas(dia, HOLD), TOL); if (!dOut || entre(dOut, venc) < 1) return null;
  const qOut = cot(t, dOut, venc, strike, tipo);
  const horq = (qIn[1] - qIn[0]) / qIn[1];
  return { ret: (qOut ? qOut[0] : 0) / qIn[1] - 1, horq, ask: qIn[1] };
}
function pool(t, dia, tipo) {
  const c = cadena(t, dia); if (!c) return [];
  const spot = cierres.get(t)?.[dia]; if (!(spot > 0)) return [];
  const out = [];
  for (const venc of Object.keys(c)) {
    const dte = entre(dia, venc); if (dte < DTE[0] || dte > DTE[1]) continue;
    for (const k of Object.keys(c[venc])) {
      const [sS, tp] = k.split("|"); if (tp !== tipo) continue;
      const st = +sS, otm = tp === "C" ? (st - spot) / spot : (spot - st) / spot;
      if (otm < OTM[0] || otm > OTM[1]) continue;
      const [b, a] = c[venc][k]; if (!(a >= 0.05) || b == null) continue;
      out.push({ venc, strike: String(st), tipo: tp, horq: (a - b) / a });
    }
  }
  return out;
}
let sem = 4242; const rnd = () => { sem = (sem * 1103515245 + 12345) & 0x7fffffff; return sem / 0x7fffffff; };

// ── eventos ──────────────────────────────────────────────────────────────────
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
      if (dte < DTE[0] || dte > DTE[1]) continue;
      const spot = x.asset_price ?? cierres.get(root)?.[dia]; if (!(spot > 0)) continue;
      const otm = tipo === "C" ? (strike - spot) / spot : (spot - strike) / spot;
      if (otm < OTM[0] || otm > OTM[1]) continue;
      const k = `${dia}|${root}|${venc}|${strike}|${tipo}`;
      const cand = { dia, root, venc, strike: String(strike), tipo, prima: x.premium ?? 0, suelta: SUELTA.has(c), alAsk: AL_ASK.has(x.side) };
      const p = ev.get(k); if (!p || cand.prima > p.prima) ev.set(k, cand);
    }
  }
}

// ── medir: evento, azar CRUDO y azar EMPAREJADO POR HORQUILLA ────────────────
const filas = [];
for (const e of ev.values()) {
  const r = operar(e.root, e.dia, e.venc, e.strike, e.tipo); if (!r) continue;
  const dIn = diaCad(e.root, e.dia, 0);
  const p = pool(e.root, dIn, e.tipo); if (!p.length) continue;

  const cCrudo = p[Math.floor(rnd() * p.length)];
  const rCrudo = operar(e.root, e.dia, cCrudo.venc, cCrudo.strike, cCrudo.tipo);

  // emparejado: de los 5 contratos con horquilla más parecida, sortear uno
  const cerca = [...p].sort((a, b) => Math.abs(a.horq - r.horq) - Math.abs(b.horq - r.horq))
    .filter((c) => !(c.venc === e.venc && c.strike === e.strike)).slice(0, 5);
  const cEmp = cerca.length ? cerca[Math.floor(rnd() * cerca.length)] : null;
  const rEmp = cEmp ? operar(e.root, e.dia, cEmp.venc, cEmp.strike, cEmp.tipo) : null;

  filas.push({
    ...e, ret: r.ret, horq: r.horq, ask: r.ask,
    azar: rCrudo?.ret ?? null, azarHorq: rCrudo?.horq ?? null,
    emp: rEmp?.ret ?? null, empHorq: rEmp?.horq ?? null,
    poolHorq: p.reduce((s, x) => s + x.horq, 0) / p.length,
  });
}

const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
function tPorDia(fs_, f) {
  const m = new Map(); for (const x of fs_) { const v = f(x); if (v == null || !isFinite(v)) continue; if (!m.has(x.dia)) m.set(x.dia, []); m.get(x.dia).push(v); }
  const s = [...m.values()].map(media); if (s.length < 4) return null;
  return { t: media(s) / (sd(s) / Math.sqrt(s.length)), dias: s.length, nEf: s.length / SOLAPE, media: media(s) };
}
function bloque(nombre, fs_) {
  if (fs_.length < 10) return { nombre, n: fs_.length };
  const cr = fs_.filter((x) => x.azar != null), em = fs_.filter((x) => x.emp != null);
  const exCr = tPorDia(cr, (x) => x.ret - x.azar), exEm = tPorDia(em, (x) => x.ret - x.emp);
  const cu = new Map(); for (const x of fs_) cu.set(x.root, (cu.get(x.root) ?? 0) + 1);
  const may = [...cu.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    nombre, n: fs_.length,
    ret: media(fs_.map((x) => x.ret)),
    horqEvento: media(fs_.map((x) => x.horq)),
    horqAzar: cr.length ? media(cr.map((x) => x.azarHorq)) : null,
    horqEmp: em.length ? media(em.map((x) => x.empHorq)) : null,
    retAzar: cr.length ? media(cr.map((x) => x.azar)) : null,
    retEmp: em.length ? media(em.map((x) => x.emp)) : null,
    excesoCrudo: exCr?.media ?? null, tCrudo: exCr?.t ?? null,
    excesoEmparejado: exEm?.media ?? null, tEmparejado: exEm?.t ?? null,
    dias: exCr?.dias ?? null, nEf: exCr?.nEf ?? null,
    mayor: may ? { t: may[0], pct: may[1] / fs_.length } : null,
  };
}

const bloques = [
  bloque("TODO", filas),
  bloque("suelta+ask", filas.filter((f) => f.suelta && f.alAsk)),
  bloque("suelta+ask ≥$1M", filas.filter((f) => f.suelta && f.alAsk && f.prima >= 1e6)),
  bloque("suelta NO-ask ≥$1M", filas.filter((f) => f.suelta && !f.alAsk && f.prima >= 1e6)),
  bloque("pata de spread ≥$1M", filas.filter((f) => !f.suelta && f.prima >= 1e6)),
  bloque("≥$1M cualquiera", filas.filter((f) => f.prima >= 1e6)),
];

// ¿cuánto del exceso explica la horquilla? regresión simple exceso ~ (horqAzar - horqEvento)
const reg = filas.filter((f) => f.azar != null && f.azarHorq != null);
const dx = reg.map((f) => f.azarHorq - f.horq), dy = reg.map((f) => f.ret - f.azar);
const mx = media(dx), my = media(dy);
const cov = media(dx.map((x, i) => (x - mx) * (dy[i] - my)));
const beta = cov / (sd(dx) ** 2);
const correl = cov / (sd(dx) * sd(dy));

fs.writeFileSync(SALIDA, JSON.stringify({ n: filas.length, bloques, horquilla: { beta, correl, difMedia: mx, excesoMedio: my, explicado: beta * mx } }, null, 1));

const F = (x, d = 2) => x == null ? "   —  " : ((x >= 0 ? "+" : "") + (x * 100).toFixed(d) + "%").padStart(8);
const H = (x) => x == null ? "  — " : (x * 100).toFixed(1).padStart(5) + "%";
console.log(`═══ ¿DIRECCIÓN O HORQUILLA? · ${filas.length} eventos con precio real ═══\n`);
console.log(`grupo                    n   ret/op   horq_ev horq_az horq_emp | exceso CRUDO  t  | exceso EMPAREJADO  t   nEf  mayor`);
for (const b of bloques) {
  if (!b.ret) { console.log(`${b.nombre.padEnd(22)} ${String(b.n).padStart(4)}  (sin muestra)`); continue; }
  console.log(
    `${b.nombre.padEnd(22)} ${String(b.n).padStart(4)} ${F(b.ret)}  ${H(b.horqEvento)} ${H(b.horqAzar)} ${H(b.horqEmp)} | ${F(b.excesoCrudo)} ${(b.tCrudo ?? 0).toFixed(2).padStart(6)} | ${F(b.excesoEmparejado)} ${(b.tEmparejado ?? 0).toFixed(2).padStart(6)}  ${(b.nEf ?? 0).toFixed(1)}  ${b.mayor.t} ${(b.mayor.pct * 100).toFixed(0)}%`,
  );
}
console.log(`\n── ¿CUÁNTO DEL EXCESO ES PEAJE? ──`);
console.log(`   horquilla del contrato del feed:   ${(media(filas.map((f) => f.horq)) * 100).toFixed(1)}%`);
console.log(`   horquilla del contrato sorteado:   ${(media(filas.filter((f) => f.azarHorq != null).map((f) => f.azarHorq)) * 100).toFixed(1)}%`);
console.log(`   diferencia media de horquilla:     ${(mx * 100).toFixed(1)} puntos`);
console.log(`   exceso medio observado:            ${(my * 100).toFixed(2)}%`);
console.log(`   pendiente exceso~Δhorquilla:       ${beta.toFixed(2)}  (correlación ${correl.toFixed(2)})`);
console.log(`   exceso EXPLICADO por la horquilla: ${(beta * mx * 100).toFixed(2)} de ${(my * 100).toFixed(2)} puntos = ${((beta * mx) / my * 100).toFixed(0)}%`);
console.log(`\n   guardado en ${SALIDA}`);
