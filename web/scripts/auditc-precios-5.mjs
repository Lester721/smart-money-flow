// AUDITORÍA 5 — LA PRUEBA DECISIVA
//
// Uso: node --max-old-space-size=10240 scripts/auditc-precios-5.mjs
//
// Dos cosas:
//  (a) Splits bien detectados: por la ESCALERA DE STRIKES (exacta), no por el precio (que mezcla
//      el salto del split con el movimiento del día — así se me coló TSLA 5:1 leído como 4:1).
//  (b) El CONTROL con UNA semilla no vale nada cuando el pago es de cola larga: si el sorteo
//      pilla TSLA en 2019 el control gana, si no lo pilla, pierde. Se corre el control 500 veces
//      y se mira EN QUÉ PERCENTIL cae el filtro. Ese es el listón honesto.

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const TDIR = "scripts/cache-theta";
const POR_TICKER = 500, N_TICKERS = 3;
const OTM_MIN = 60, DTE_MIN = 365, ASK_MIN = 0.10, SPREAD_MAX = 0.40;
const HAIRCUT = 0.97;
const N_SEM = Number(process.env.N_SEM || 500);
const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/); if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();

const barsCache = new Map();
function closes(sym) {
  if (barsCache.has(sym)) return barsCache.get(sym);
  const m = new Map();
  for (const f of readdirSync(TDIR))
    if (f.startsWith(`${sym}_barsPAR_y_`) && f.endsWith(".json"))
      for (const b of JSON.parse(readFileSync(`${TDIR}/${f}`, "utf8"))) m.set(b.time.replaceAll("-", ""), b.close);
  barsCache.set(sym, m); return m;
}
const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`; const hit = cache.get(k);
  if (hit !== undefined) { cache.delete(k); cache.set(k, hit); return hit; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cache.set(k, v); if (cache.size > 200) cache.delete(cache.keys().next().value);
  return v;
}
function spotDe(c) {
  let k = null, dm = Infinity;
  for (const g of Object.values(c)) for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`]; if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; k = K; }
  }
  return k;
}
function spotParidad(c) {
  let s = null, dm = Infinity;
  for (const g of Object.values(c)) for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`]; if (!p) continue;
    const mc = (ba[0] + ba[1]) / 2, mq = (p[0] + p[1]) / 2;
    if (Math.abs(mc - mq) < dm) { dm = Math.abs(mc - mq); s = K + mc - mq; }
  }
  return s;
}
const precio = (sym, dia) => closes(sym).get(dia) ?? (cadena(sym, dia) ? spotParidad(cadena(sym, dia)) : null);
const maxStrike = (sym, dia) => {
  const c = cadena(sym, dia); if (!c) return null;
  let mx = 0;
  for (const g of Object.values(c)) for (const cl of Object.keys(g)) { const K = Number(cl.slice(0, -2)); if (K > mx) mx = K; }
  return mx || null;
};

// ── (a) SPLITS POR LA ESCALERA DE STRIKES ───────────────────────────────────
console.log("=== SPLITS · detectados por el TECHO DE LA ESCALERA DE STRIKES (exacto) ===");
console.log("    sym   día        strike máx antes → después   r(strikes)   r(precio)   → r usado");
const splits = new Map();
for (const [sym, dias] of diasPorSim) {
  let pMx = null, pPr = null, pDia = null;
  for (const d of dias) {
    const mx = maxStrike(sym, d), pr = precio(sym, d);
    if (mx != null && pMx != null && pPr != null && pr != null && pr > 0) {
      const rP = pPr / pr;
      if (rP > 1.6 || rP < 0.62) {
        const rS = pMx / mx;
        const cands = [2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 8, 1 / 10, 1 / 20];
        const r = cands.reduce((a, b) => (Math.abs(b - rS) < Math.abs(a - rS) ? b : a));
        if (!splits.has(sym)) splits.set(sym, []);
        splits.get(sym).push({ dia: d, r });
        console.log(`    ${sym.padEnd(5)} ${d}   ${String(pMx).padStart(7)} → ${String(mx).padEnd(7)}   ${rS.toFixed(3).padStart(7)}    ${rP.toFixed(3).padStart(7)}    → ${r < 1 ? `1:${Math.round(1 / r)} INVERSO` : `${r}:1`}`);
      }
    }
    if (mx != null) pMx = mx;
    if (pr != null) pPr = pr;
    pDia = d;
  }
}
const factor = (sym, d0, d1) => { let r = 1; for (const s of splits.get(sym) ?? []) if (s.dia > d0 && s.dia <= d1) r *= s.r; return r; };

// ── cestas precalculadas ────────────────────────────────────────────────────
function idxVenc(sym, exp) {
  const dias = diasPorSim.get(sym) ?? [];
  if (!dias.length || exp > dias[dias.length - 1]) return -1;
  let lo = 0, hi = dias.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dias[m] <= exp) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
function cesta(sym, dia) {
  const c = cadena(sym, dia); if (!c) return null;
  const sp = spotDe(c); if (!sp) return null;
  const patas = [];
  for (const [exp, g] of Object.entries(c)) {
    const dte = Math.round((ms(exp) - ms(dia)) / 86_400_000);
    if (dte <= DTE_MIN) continue;
    const iu = idxVenc(sym, exp); if (iu < 0) continue;
    const dSal = (diasPorSim.get(sym) ?? [])[iu];
    const gSal = cadena(sym, dSal)?.[exp] ?? {};
    for (const [clave, ba] of Object.entries(g)) {
      if (clave.slice(-1) !== "C") continue;
      const K = Number(clave.slice(0, -2));
      if (((K - sp) / sp) * 100 <= OTM_MIN) continue;
      const [bid, ask] = ba;
      if (!(ask >= ASK_MIN) || !((ask - bid) / ask <= SPREAD_MAX)) continue;
      const sl = gSal[clave];
      const vTest = sl ? sl[0] : 0;
      const r = factor(sym, dia, dSal);
      const S = precio(sym, dSal);
      const vCorr = r === 1 ? vTest : (S != null ? Math.max(0, r * S - K) * HAIRCUT : vTest);
      patas.push({ K, exp, ask, vTest, vCorr, r });
    }
  }
  return patas.length ? patas : null;
}

const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8")).filter((x) => x.gamLejos != null);
const porMes = new Map();
for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
const meses = [...porMes.keys()].sort();
const ultimoDiaDelMes = (sym, mes) => { const d = (diasPorSim.get(sym) ?? []).filter((x) => x.slice(0, 6) === mes); return d.length ? d[d.length - 1] : null; };

// precalcular el resultado de cada (ticker, mes): coste, recaudo test, recaudo corregido
console.log("\nprecalculando cestas…");
const res = new Map();   // "SYM|MES" -> {coste, rTest, rCorr, n, gTest, gCorr}
for (const mes of meses) for (const e of porMes.get(mes)) {
  const k = `${e.ticker}|${mes}`;
  if (res.has(k)) continue;
  const dia = ultimoDiaDelMes(e.ticker, mes);
  if (!dia) { res.set(k, null); continue; }
  const patas = cesta(e.ticker, dia);
  if (!patas) { res.set(k, null); continue; }
  let queda = POR_TICKER, coste = 0, rTest = 0, rCorr = 0, n = 0, gTest = 0, gCorr = 0;
  for (const p of [...patas].sort((x, y) => x.ask - y.ask)) {
    const c = p.ask * 100; if (c > queda) continue; queda -= c;
    coste += c; rTest += p.vTest * 100; rCorr += p.vCorr * 100; n++;
    if (p.vTest > p.ask) gTest++; if (p.vCorr > p.ask) gCorr++;
  }
  res.set(k, n ? { coste, rTest, rCorr, n, gTest, gCorr } : null);
}
console.log(`cestas listas: ${[...res.values()].filter(Boolean).length} (acción,mes) operables\n`);

function evaluar(elegirFn) {
  let coste = 0, rTest = 0, rCorr = 0, n = 0, gTest = 0, gCorr = 0;
  for (const mes of meses) for (const e of elegirFn(mes)) {
    const o = res.get(`${e.ticker}|${mes}`); if (!o) continue;
    coste += o.coste; rTest += o.rTest; rCorr += o.rCorr; n += o.n; gTest += o.gTest; gCorr += o.gCorr;
  }
  return { coste, rTest, rCorr, n, xTest: rTest / coste, xCorr: rCorr / coste, acT: gTest / n, acC: gCorr / n };
}

const F = evaluar((mes) => [...porMes.get(mes)].sort((a, b) => b.gamLejos - a.gamLejos).slice(0, N_TICKERS));
console.log("=== FILTRO ===");
console.log(`   tal como está : ${F.xTest.toFixed(2)}x · aciertos ${(F.acT * 100).toFixed(0)}% · ${F.n} patas · $${Math.round(F.coste).toLocaleString("es-ES")} → $${Math.round(F.rTest).toLocaleString("es-ES")}`);
console.log(`   splits bien   : ${F.xCorr.toFixed(2)}x · aciertos ${(F.acC * 100).toFixed(0)}% · $${Math.round(F.rCorr).toLocaleString("es-ES")}`);

// ── (b) 500 CONTROLES AL AZAR ───────────────────────────────────────────────
console.log(`\n=== ${N_SEM} CONTROLES AL AZAR (el del test usa UNA sola semilla) ===`);
const xT = [], xC = [], acT = [], acC = [];
for (let s = 1; s <= N_SEM; s++) {
  let sem = s * 7919 + 13;
  const rnd = () => { sem = (sem * 1103515245 + 12345) & 0x7fffffff; return sem / 0x7fffffff; };
  const R = evaluar((mes) => {
    const copia = [...porMes.get(mes)], out = [];
    for (let i = 0; i < N_TICKERS && copia.length; i++) out.push(copia.splice(Math.floor(rnd() * copia.length), 1)[0]);
    return out;
  });
  xT.push(R.xTest); xC.push(R.xCorr); acT.push(R.acT); acC.push(R.acC);
}
const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * p))]; };
const pct = (a, v) => (a.filter((x) => x < v).length / a.length * 100);
const linea = (nom, a, v) => console.log(`   ${nom.padEnd(22)} p05 ${q(a, .05).toFixed(2).padStart(7)} · mediana ${q(a, .5).toFixed(2).padStart(7)} · p95 ${q(a, .95).toFixed(2).padStart(7)} · máx ${q(a, .999).toFixed(2).padStart(7)}   ‖ filtro ${v.toFixed(2).padStart(7)} → percentil ${pct(a, v).toFixed(1)}%  (p = ${((100 - pct(a, v)) / 100).toFixed(3)})`);
linea("múltiplo tal como está", xT, F.xTest);
linea("múltiplo splits bien", xC, F.xCorr);
linea("aciertos tal como está", acT.map((x) => x * 100), F.acT * 100);
linea("aciertos splits bien", acC.map((x) => x * 100), F.acC * 100);

// la semilla concreta del test (42, tal cual está escrita en cartera-cesta.mjs)
let sem42 = 42;
const rnd42 = () => { sem42 = (sem42 * 1103515245 + 12345) & 0x7fffffff; return sem42 / 0x7fffffff; };
const R42 = evaluar((mes) => {
  const copia = [...porMes.get(mes)], out = [];
  for (let i = 0; i < N_TICKERS && copia.length; i++) out.push(copia.splice(Math.floor(rnd42() * copia.length), 1)[0]);
  return out;
});
console.log(`\n   la semilla 42 del test: ${R42.xTest.toFixed(2)}x (tal como está) → percentil ${pct(xT, R42.xTest).toFixed(1)}% de los controles`);
console.log(`                          ${R42.xCorr.toFixed(2)}x (splits bien)   → percentil ${pct(xC, R42.xCorr).toFixed(1)}%`);
