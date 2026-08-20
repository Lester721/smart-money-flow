// CATÁLOGO · PASO 5 — EL PUENTE: si la ventaja era la horquilla, cóbrala directamente.
//
// cat-4 demuestra que TODO el exceso del feed sobre el azar desaparece al emparejar por
// horquilla (+3,49% → −2,23%). El feed no elige mejor: apunta a strikes líquidos.
//
// Eso no es un callejón sin salida, es una regla: **si lo que paga es la horquilla, elige
// por horquilla y olvídate de quién compró**. Aquí se mide esa regla sola, sin el feed,
// y se compara contra el sorteo y contra el extremo caro.
//
// Para que la comparación sea justa, los quintiles de horquilla se hacen DENTRO de cada
// (ticker, día, tipo, banda de distancia): así no se está comparando un ATM con un 10% fuera.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/cat-5-puente.mjs

import fs from "node:fs";
import path from "node:path";

const CIERRES = path.resolve("scripts/cache-theta/cierres");
const CADENAS = path.resolve("scripts/cache-theta/cadenas");
const SALIDA = path.resolve("scripts/marketsnack/cat-5-salida.json");

const HOLD = 23, TOL = 6, SOLAPE = 16;
const OTM = [0.03, 0.08], DTE = [60, 120];
const DESDE = "20260422", HASTA = "20260714";   // entradas con salida completa en disco

const cierres = new Map();
for (const f of fs.readdirSync(CIERRES)) cierres.set(f.replace(".json", ""), JSON.parse(fs.readFileSync(path.join(CIERRES, f), "utf8")));
const diasCadena = new Map();
for (const f of fs.readdirSync(CADENAS)) { const m = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!m) continue; if (!diasCadena.has(m[1])) diasCadena.set(m[1], new Set()); diasCadena.get(m[1]).add(m[2]); }
const UNIV = [...diasCadena.keys()].filter((t) => cierres.has(t)).sort();

const cache = new Map();
function cadena(t, d) { const k = `${t}|${d}`; if (cache.has(k)) return cache.get(k); const p = path.join(CADENAS, `${t}_d${d}.json`); let v = null; if (fs.existsSync(p)) { try { v = JSON.parse(fs.readFileSync(p, "utf8")); } catch {} } if (cache.size > 2000) cache.clear(); cache.set(k, v); return v; }
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const mas = (d, n) => { const x = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return ymd(x); };
const entre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6)) - Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6))) / 86400000);
function diaCad(t, d, tol) { const s = diasCadena.get(t); if (!s) return null; for (let i = 0; i <= tol; i++) { const x = mas(d, i); if (s.has(x)) return x; } return null; }
function cot(t, d, v, s, tp) { const q = cadena(t, d)?.[v]?.[`${s}|${tp}`]; if (!q) return null; const [b, a] = q; return a > 0 && b != null ? [b, a] : null; }

const filas = [];
for (const t of UNIV) {
  const dias = [...diasCadena.get(t)].filter((d) => d >= DESDE && d <= HASTA).sort();
  for (const dia of dias) {
    const c = cadena(t, dia); if (!c) continue;
    const spot = cierres.get(t)?.[dia]; if (!(spot > 0)) continue;
    const dOut = diaCad(t, mas(dia, HOLD), TOL); if (!dOut) continue;
    // recoger toda la esquina de ese día
    const cand = [];
    for (const venc of Object.keys(c)) {
      const dte = entre(dia, venc); if (dte < DTE[0] || dte > DTE[1]) continue;
      if (entre(dOut, venc) < 1) continue;
      for (const k of Object.keys(c[venc])) {
        const [sS, tp] = k.split("|");
        const st = +sS, otm = tp === "C" ? (st - spot) / spot : (spot - st) / spot;
        if (otm < OTM[0] || otm > OTM[1]) continue;
        const [b, a] = c[venc][k]; if (!(a >= 0.05) || b == null) continue;
        const qOut = cot(t, dOut, venc, sS, tp);
        cand.push({
          t, dia, venc, strike: sS, tipo: tp, ask: a, horq: (a - b) / a,
          bandaOtm: otm < 0.045 ? "3-4.5%" : otm < 0.065 ? "4.5-6.5%" : "6.5-8%",
          bandaDte: dte < 80 ? "60-80" : dte < 100 ? "80-100" : "100-120",
          ret: (qOut ? qOut[0] : 0) / a - 1,
        });
      }
    }
    if (cand.length < 5) continue;
    // quintiles de horquilla DENTRO de cada celda (tipo × banda distancia × banda plazo)
    const celdas = new Map();
    for (const x of cand) { const k = `${x.tipo}|${x.bandaOtm}|${x.bandaDte}`; if (!celdas.has(k)) celdas.set(k, []); celdas.get(k).push(x); }
    for (const g of celdas.values()) {
      if (g.length < 5) continue;
      g.sort((a, b) => a.horq - b.horq);
      g.forEach((x, i) => { x.q = Math.min(4, Math.floor((i / g.length) * 5)); x.nCelda = g.length; filas.push(x); });
    }
  }
}

const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
function serieDiaria(fs_) { const m = new Map(); for (const x of fs_) { if (!m.has(x.dia)) m.set(x.dia, []); m.get(x.dia).push(x.ret); } return [...m.entries()].sort().map(([d, v]) => media(v)); }
function res(fs_) {
  if (fs_.length < 20) return { n: fs_.length };
  const s = serieDiaria(fs_);
  const cu = new Map(); for (const x of fs_) cu.set(x.t, (cu.get(x.t) ?? 0) + 1);
  const may = [...cu.entries()].sort((a, b) => b[1] - a[1])[0];
  const ord = [...fs_].sort((a, b) => a.dia.localeCompare(b.dia)); const k = Math.floor(ord.length / 3);
  const terc = [0, 1, 2].map((i) => media((i < 2 ? ord.slice(i * k, (i + 1) * k) : ord.slice(2 * k)).map((x) => x.ret)));
  return {
    n: fs_.length, ret: media(fs_.map((x) => x.ret)), horq: media(fs_.map((x) => x.horq)),
    ask: media(fs_.map((x) => x.ask)), gana: fs_.filter((x) => x.ret > 0).length / fs_.length,
    tDia: media(s) / (sd(s) / Math.sqrt(s.length)), dias: s.length, nEf: s.length / SOLAPE,
    mayor: { t: may[0], pct: may[1] / fs_.length }, tercios: terc,
  };
}

const porQ = [0, 1, 2, 3, 4].map((q) => ({ q, ...res(filas.filter((f) => f.q === q)) }));
const todo = res(filas);
// diferencia Q0 (más estrecha) − Q4 (más ancha), emparejada por celda-día
const parejas = new Map();
for (const f of filas) { const k = `${f.t}|${f.dia}|${f.tipo}|${f.bandaOtm}|${f.bandaDte}`; if (!parejas.has(k)) parejas.set(k, {}); if (f.q === 0) (parejas.get(k).q0 ??= []).push(f.ret); if (f.q === 4) (parejas.get(k).q4 ??= []).push(f.ret); }
const dif = [];
for (const [k, v] of parejas) if (v.q0 && v.q4) dif.push({ dia: k.split("|")[1], d: media(v.q0) - media(v.q4) });
const mDia = new Map(); for (const x of dif) { if (!mDia.has(x.dia)) mDia.set(x.dia, []); mDia.get(x.dia).push(x.d); }
const sDif = [...mDia.values()].map(media);
const tDif = sDif.length >= 4 ? media(sDif) / (sd(sDif) / Math.sqrt(sDif.length)) : null;

// ── dinero ───────────────────────────────────────────────────────────────────
const CAP = 56389;
const diasBolsa = new Set(filas.map((f) => f.dia)).size;
function dinero(r, opsPorSemana = 2) {
  if (!r?.ret) return null;
  const opsAno = opsPorSemana * 52;
  const costePorOp = r.ask * 100;                       // 1 contrato
  const simultaneas = opsAno / (252 / HOLD);            // posiciones vivas a la vez
  return { opsAno, costePorOp, capitalComprometido: costePorOp * simultaneas, dolaresAlAno: opsAno * costePorOp * r.ret };
}

const salida = { filas: filas.length, diasBolsa, universo: UNIV, todo, porQ, difQ0Q4: { n: dif.length, media: media(dif.map((x) => x.d)), t: tDif, dias: sDif.length, nEf: sDif.length / SOLAPE }, dinero: { q0: dinero(porQ[0]), azar: dinero(todo) } };
fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 1));

const F = (x, d = 2) => x == null ? "   —  " : ((x >= 0 ? "+" : "") + (x * 100).toFixed(d) + "%").padStart(8);
console.log(`═══ EL PUENTE · elegir por HORQUILLA dentro de la esquina barata, SIN feed ═══`);
console.log(`   ${DESDE} → ${HASTA} · ${diasBolsa} sesiones · ${UNIV.length} tickers · ${filas.length.toLocaleString("es-ES")} contratos-día\n`);
console.log(`quintil de horquilla     n     horq    ask    ret/op   gana   t(diario)  nEf   mayor      tercios`);
for (const q of porQ) {
  if (!q.ret) { console.log(`Q${q.q}  (sin muestra)`); continue; }
  const et = q.q === 0 ? "Q0 más ESTRECHA" : q.q === 4 ? "Q4 más ANCHA" : `Q${q.q}`;
  console.log(`${et.padEnd(20)} ${String(q.n).padStart(6)} ${(q.horq * 100).toFixed(1).padStart(5)}% $${q.ask.toFixed(2).padStart(6)} ${F(q.ret)} ${(q.gana * 100).toFixed(0).padStart(4)}%  ${q.tDia.toFixed(2).padStart(7)}  ${q.nEf.toFixed(1)}  ${(q.mayor.t + " " + (q.mayor.pct * 100).toFixed(0) + "%").padEnd(9)} ${q.tercios.map((x) => F(x, 1)).join("")}`);
}
console.log(`\n   TODA la esquina (= el azar): n=${todo.n} ret ${F(todo.ret)} horquilla ${(todo.horq * 100).toFixed(1)}%`);
console.log(`\n── Q0 − Q4, emparejado por (ticker, día, tipo, banda) ──`);
console.log(`   parejas: ${dif.length}  ·  diferencia media ${F(media(dif.map((x) => x.d)))}  ·  t=${(tDif ?? 0).toFixed(2)}  ·  días ${sDif.length}  ·  nEf ${(sDif.length / SOLAPE).toFixed(1)}`);
console.log(`\n── EN DÓLARES (2 operaciones por semana, 1 contrato) ──`);
for (const [k, d] of Object.entries(salida.dinero)) {
  if (!d) continue;
  console.log(`   ${k.padEnd(6)} coste/op $${d.costePorOp.toFixed(0)} · capital comprometido $${d.capitalComprometido.toFixed(0)} · ${d.dolaresAlAno >= 0 ? "+" : ""}$${d.dolaresAlAno.toFixed(0)}/año sobre $${CAP.toLocaleString("es-ES")}`);
}
console.log(`\n   guardado en ${SALIDA}`);
