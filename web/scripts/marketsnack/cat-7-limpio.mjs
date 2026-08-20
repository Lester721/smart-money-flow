// CATÁLOGO · PASO 7 — LA VERSIÓN LIMPIA: sin dominio de SPY, y en dólares honestos.
//
// cat-5 daba −24,23% porque su filtro de celdas dejó la muestra en 67% SPY, y la esquina
// de SPY perdió −25,33% en esta ventana. cat-6 valida la tubería (99,98% de salidas con
// cotización real) y destapa el régimen: puts −22,09% con el subyacente subiendo 1,28%.
//
// Aquí: (1) equiponderar por TICKER, (2) medir la diferencia estrecha−ancha DENTRO de cada
// ticker, (3) decir cuánto vale en dólares y qué es exactamente lo que se está cobrando.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/cat-7-limpio.mjs

import fs from "node:fs";
import path from "node:path";

const CIERRES = path.resolve("scripts/cache-theta/cierres");
const CADENAS = path.resolve("scripts/cache-theta/cadenas");
const SALIDA = path.resolve("scripts/marketsnack/cat-7-salida.json");
const HOLD = 23, TOL = 6, SOLAPE = 16;
const OTM = [0.03, 0.08], DTE = [60, 120];
const DESDE = "20260422", HASTA = "20260714";
const CAP = 56389;

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

// ── recoger toda la esquina, sin filtros de celda ────────────────────────────
const filas = [];
for (const t of UNIV) {
  for (const dia of [...diasCadena.get(t)].filter((d) => d >= DESDE && d <= HASTA).sort()) {
    const c = cadena(t, dia); if (!c) continue;
    const spot = cierres.get(t)?.[dia]; if (!(spot > 0)) continue;
    const dOut = diaCad(t, mas(dia, HOLD), TOL); if (!dOut) continue;
    const cOut = cadena(t, dOut); if (!cOut) continue;
    for (const venc of Object.keys(c)) {
      const dte = entre(dia, venc); if (dte < DTE[0] || dte > DTE[1]) continue;
      if (entre(dOut, venc) < 1) continue;
      for (const k of Object.keys(c[venc])) {
        const [sS, tp] = k.split("|");
        const st = +sS, otm = tp === "C" ? (st - spot) / spot : (spot - st) / spot;
        if (otm < OTM[0] || otm > OTM[1]) continue;
        const [b, a] = c[venc][k]; if (!(a >= 0.05) || b == null) continue;
        const q = cOut[venc]?.[k]; if (!q) continue;               // sólo salidas con cotización REAL
        filas.push({
          t, dia, venc, k, tipo: tp, ask: a, horq: (a - b) / a, ret: q[0] / a - 1,
          banda: `${tp}|${otm < 0.055 ? "cerca" : "lejos"}|${dte < 90 ? "corto" : "largo"}`,
        });
      }
    }
  }
}

const media = (x) => x.length ? x.reduce((s, y) => s + y, 0) / x.length : null;
const sd = (x) => { const m = media(x); return Math.sqrt(x.reduce((s, y) => s + (y - m) ** 2, 0) / Math.max(1, x.length - 1)); };

// ── 1 · retorno de la esquina, EQUIPONDERANDO POR TICKER ────────────────────
const porTicker = new Map();
for (const f of filas) { if (!porTicker.has(f.t)) porTicker.set(f.t, []); porTicker.get(f.t).push(f); }
const medTicker = [...porTicker.entries()].map(([t, v]) => ({ t, n: v.length, ret: media(v.map((x) => x.ret)), horq: media(v.map((x) => x.horq)) })).sort((a, b) => a.ret - b.ret);
const retEquiTicker = media(medTicker.map((x) => x.ret));
const retCrudo = media(filas.map((x) => x.ret));

// ── 2 · ESTRECHA vs ANCHA dentro de cada (ticker, día, banda) ───────────────
const celdas = new Map();
for (const f of filas) { const k = `${f.t}|${f.dia}|${f.banda}`; if (!celdas.has(k)) celdas.set(k, []); celdas.get(k).push(f); }
const pares = [];
for (const [k, g] of celdas) {
  if (g.length < 4) continue;
  g.sort((a, b) => a.horq - b.horq);
  const m = Math.max(1, Math.floor(g.length / 3));
  const estr = g.slice(0, m), anch = g.slice(-m);
  const [t, dia] = k.split("|");
  pares.push({ t, dia, d: media(estr.map((x) => x.ret)) - media(anch.map((x) => x.ret)), horqE: media(estr.map((x) => x.horq)), horqA: media(anch.map((x) => x.horq)), askE: media(estr.map((x) => x.ask)), retE: media(estr.map((x) => x.ret)), retA: media(anch.map((x) => x.ret)) });
}
function tSerie(vals, key = "d") {
  const m = new Map(); for (const x of vals) { if (!m.has(x.dia)) m.set(x.dia, []); m.get(x.dia).push(x[key]); }
  const s = [...m.entries()].sort().map(([, v]) => media(v));
  return { media: media(s), t: media(s) / (sd(s) / Math.sqrt(s.length)), dias: s.length, nEf: s.length / SOLAPE };
}
const global = tSerie(pares);
// por ticker: ¿vive en SPY o está repartido?
const porT = [...new Set(pares.map((p) => p.t))].map((tk) => {
  const g = pares.filter((p) => p.t === tk);
  const s = g.length >= 8 ? tSerie(g) : null;
  return { t: tk, nCeldas: g.length, dif: media(g.map((x) => x.d)), tStat: s?.t ?? null, dias: s?.dias ?? null };
}).sort((a, b) => b.nCeldas - a.nCeldas);
const positivos = porT.filter((x) => x.dif > 0).length;
// equiponderado por ticker (mata el dominio de SPY)
const difEquiTicker = media(porT.filter((x) => x.nCeldas >= 8).map((x) => x.dif));
// tercios
const ord = [...pares].sort((a, b) => a.dia.localeCompare(b.dia)); const kk = Math.floor(ord.length / 3);
const tercios = [0, 1, 2].map((i) => media((i < 2 ? ord.slice(i * kk, (i + 1) * kk) : ord.slice(2 * kk)).map((x) => x.d)));

// ── 3 · dinero ───────────────────────────────────────────────────────────────
const askMedio = media(pares.map((x) => x.askE)) * 100;
const OPS = 104; // 2 por semana
const simultaneas = OPS / (252 / HOLD);
const dinero = {
  costePorOp: askMedio,
  capitalComprometido: askMedio * simultaneas,
  ahorroAlAno: OPS * askMedio * global.media,
  perdidaEsquinaAlAno: OPS * askMedio * retEquiTicker,
};

const salida = {
  filas: filas.length, dias: new Set(filas.map((f) => f.dia)).size, universo: UNIV,
  retCrudo, retEquiTicker, porTicker: medTicker,
  estrechaVsAncha: { ...global, pares: pares.length, tercios, difEquiTicker, tickersPositivos: positivos, tickersTotal: porT.length, porT },
  dinero,
};
fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 1));

const F = (x, d = 2) => x == null ? "   —  " : ((x >= 0 ? "+" : "") + (x * 100).toFixed(d) + "%").padStart(8);
console.log(`═══ LIMPIO · ${filas.length.toLocaleString("es-ES")} contratos-día · ${salida.dias} sesiones · ${UNIV.length} tickers ═══\n`);
console.log(`── 1 · ¿CUÁNTO PIERDE LA ESQUINA BARATA EN ESTA VENTANA? ──`);
console.log(`   crudo (cada contrato pesa igual):  ${F(retCrudo)}   ← SPY es ${(porTicker.get("SPY").length / filas.length * 100).toFixed(0)}% de las filas`);
console.log(`   equiponderando por TICKER:         ${F(retEquiTicker)}   ← el número honesto`);
console.log(`   mejor/peor ticker: ${medTicker[medTicker.length - 1].t} ${F(medTicker[medTicker.length - 1].ret)} / ${medTicker[0].t} ${F(medTicker[0].ret)}`);
console.log(`   (esto es RÉGIMEN, no ley: puts −22,1% con el subyacente subiendo 1,3%)\n`);
console.log(`── 2 · ESTRECHA − ANCHA, dentro de (ticker, día, tipo, distancia, plazo) ──`);
console.log(`   celdas emparejadas: ${pares.length}  ·  horquilla ${(media(pares.map((x) => x.horqE)) * 100).toFixed(1)}% vs ${(media(pares.map((x) => x.horqA)) * 100).toFixed(1)}%`);
console.log(`   diferencia media:   ${F(global.media)}  ·  t = ${global.t.toFixed(2)}  ·  días ${global.dias}  ·  nEf ${global.nEf.toFixed(1)}`);
console.log(`   equiponderado por ticker: ${F(difEquiTicker)}`);
console.log(`   tickers con diferencia positiva: ${positivos} de ${porT.length}`);
console.log(`   tercios de tiempo: ${tercios.map((x) => F(x)).join("  ")}`);
console.log(`\n   por ticker (los 12 con más celdas):`);
for (const x of porT.slice(0, 12)) console.log(`     ${x.t.padEnd(6)} celdas ${String(x.nCeldas).padStart(4)}  dif ${F(x.dif)}  ${x.tStat != null ? "t=" + x.tStat.toFixed(2) : ""}`);
console.log(`\n── 3 · EN DÓLARES (2 operaciones/semana, 1 contrato) ──`);
console.log(`   coste medio por operación:    $${dinero.costePorOp.toFixed(0)}`);
console.log(`   capital comprometido:         $${dinero.capitalComprometido.toFixed(0)}  (${(dinero.capitalComprometido / CAP * 100).toFixed(1)}% de $${CAP.toLocaleString("es-ES")})`);
console.log(`   AHORRO por elegir estrecha:   ${dinero.ahorroAlAno >= 0 ? "+" : ""}$${dinero.ahorroAlAno.toFixed(0)}/año`);
console.log(`   pérdida de la esquina:        ${dinero.perdidaEsquinaAlAno >= 0 ? "+" : ""}$${dinero.perdidaEsquinaAlAno.toFixed(0)}/año   ← el ahorro NO la compensa`);
console.log(`\n   guardado en ${SALIDA}`);
