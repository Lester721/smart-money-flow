// AUDITORÍA 6 — ¿ELIGE EL MOMENTO, O SÓLO ELIGE LAS MISMAS CUATRO ACCIONES?
//
// Uso: node --max-old-space-size=10240 scripts/auditc-precios-6.mjs
//
// El control del test sortea la ACCIÓN. Si gamLejos no es más que "casi siempre TSLA, NVDA, AMD
// e INTC", ese control lo bate por goleada sin que la señal sepa nada del momento.
//
// CONTROL B (el duro): se respeta EXACTAMENTE cuántas veces eligió el filtro cada acción, pero
// los MESES se sortean entre los meses operables de esa misma acción. Misma mezcla de acciones,
// mismo número de entradas, momento al azar. Si el filtro no le gana a ESTO, no elige el momento.

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
// splits: escalera de strikes, con el precio como desempate cuando la escalera miente (GE)
const SPLITS = { AAPL: [["20200831", 4]], GE: [["20210803", 1 / 8]], NVDA: [["20210720", 4], ["20240610", 10]],
                 TSLA: [["20200831", 5], ["20220825", 3]], WMT: [["20240226", 3]] };
const factor = (sym, d0, d1) => { let r = 1; for (const [d, x] of SPLITS[sym] ?? []) if (d > d0 && d <= d1) r *= x; return r; };

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
      const r = factor(sym, dia, dSal), S = precio(sym, dSal);
      patas.push({ ask, vTest, vCorr: r === 1 ? vTest : (S != null ? Math.max(0, r * S - K) * HAIRCUT : vTest) });
    }
  }
  return patas.length ? patas : null;
}

const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8")).filter((x) => x.gamLejos != null);
const porMes = new Map();
for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
const meses = [...porMes.keys()].sort();
const ultimoDiaDelMes = (sym, mes) => { const d = (diasPorSim.get(sym) ?? []).filter((x) => x.slice(0, 6) === mes); return d.length ? d[d.length - 1] : null; };

console.log("precalculando cestas…");
const res = new Map(); const mesesDe = new Map();   // ticker -> meses operables
for (const mes of meses) for (const e of porMes.get(mes)) {
  const k = `${e.ticker}|${mes}`; if (res.has(k)) continue;
  const dia = ultimoDiaDelMes(e.ticker, mes);
  const patas = dia ? cesta(e.ticker, dia) : null;
  if (!patas) { res.set(k, null); continue; }
  let queda = POR_TICKER, coste = 0, rT = 0, rC = 0, n = 0, gT = 0, gC = 0;
  for (const p of [...patas].sort((x, y) => x.ask - y.ask)) {
    const c = p.ask * 100; if (c > queda) continue; queda -= c;
    coste += c; rT += p.vTest * 100; rC += p.vCorr * 100; n++;
    if (p.vTest > p.ask) gT++; if (p.vCorr > p.ask) gC++;
  }
  const o = n ? { coste, rT, rC, n, gT, gC } : null;
  res.set(k, o);
  if (o) { if (!mesesDe.has(e.ticker)) mesesDe.set(e.ticker, []); mesesDe.get(e.ticker).push(mes); }
}
console.log(`listas: ${[...res.values()].filter(Boolean).length} (acción,mes) operables\n`);

const suma = (pares) => {
  let coste = 0, rT = 0, rC = 0, n = 0, gT = 0, gC = 0;
  for (const [t, m] of pares) { const o = res.get(`${t}|${m}`); if (!o) continue; coste += o.coste; rT += o.rT; rC += o.rC; n += o.n; gT += o.gT; gC += o.gC; }
  return { xT: rT / coste, xC: rC / coste, acT: gT / n, acC: gC / n, coste, rT, rC, n };
};

// ── el FILTRO ───────────────────────────────────────────────────────────────
const paresF = [];
for (const mes of meses) for (const e of [...porMes.get(mes)].sort((a, b) => b.gamLejos - a.gamLejos).slice(0, N_TICKERS)) paresF.push([e.ticker, mes]);
const F = suma(paresF);
console.log(`=== FILTRO ===  ${F.xT.toFixed(2)}x (tal como está) · ${F.xC.toFixed(2)}x (splits bien) · aciertos ${(F.acT * 100).toFixed(0)}% / ${(F.acC * 100).toFixed(0)}%`);

const cuenta = new Map();
for (const [t] of paresF) cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
console.log(`\n=== A QUIÉN ELIGE EL FILTRO (de ${paresF.length} elecciones) ===`);
for (const [t, c] of [...cuenta].sort((a, b) => b[1] - a[1]).slice(0, 12))
  console.log(`   ${t.padEnd(5)} ${String(c).padStart(4)} veces (${((c / paresF.length) * 100).toFixed(1)}%) · de ${(mesesDe.get(t) ?? []).length} meses operables`);
const cuatro = ["TSLA", "NVDA", "INTC", "AMD"];
console.log(`   → las cuatro del dinero (TSLA/NVDA/INTC/AMD): ${cuatro.reduce((s, t) => s + (cuenta.get(t) ?? 0), 0)} de ${paresF.length} elecciones (${((cuatro.reduce((s, t) => s + (cuenta.get(t) ?? 0), 0) / paresF.length) * 100).toFixed(1)}%)`);

const rng = (s) => { let x = s; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; };

// ── CONTROL A: acción al azar (el del test, pero muchas semillas) ───────────
const A_T = [], A_C = [];
for (let s = 1; s <= N_SEM; s++) {
  const r = rng(s * 7919 + 13); const pares = [];
  for (const mes of meses) { const c = [...porMes.get(mes)]; for (let i = 0; i < N_TICKERS && c.length; i++) pares.push([c.splice(Math.floor(r() * c.length), 1)[0].ticker, mes]); }
  const R = suma(pares); A_T.push(R.xT); A_C.push(R.xC);
}

// ── CONTROL B: MISMA mezcla de acciones, MESES al azar ─────────────────────
const B_T = [], B_C = [], B_acT = [];
for (let s = 1; s <= N_SEM; s++) {
  const r = rng(s * 104729 + 7); const pares = [];
  for (const [t, c] of cuenta) {
    const disp = mesesDe.get(t) ?? []; if (!disp.length) continue;
    for (let i = 0; i < c; i++) pares.push([t, disp[Math.floor(r() * disp.length)]]);
  }
  const R = suma(pares); B_T.push(R.xT); B_C.push(R.xC); B_acT.push(R.acT * 100);
}

const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * p))]; };
const pct = (a, v) => (a.filter((x) => x < v).length / a.length * 100);
const linea = (nom, a, v) => console.log(`   ${nom.padEnd(34)} p05 ${q(a, .05).toFixed(2).padStart(7)} · mediana ${q(a, .5).toFixed(2).padStart(7)} · p95 ${q(a, .95).toFixed(2).padStart(7)} · máx ${q(a, .999).toFixed(2).padStart(7)}  ‖ filtro ${v.toFixed(2).padStart(7)} · percentil ${pct(a, v).toFixed(1)}% · p=${((100 - pct(a, v)) / 100).toFixed(3)}`);

console.log(`\n=== ${N_SEM} CONTROLES ===`);
linea("A · acción al azar (tal como está)", A_T, F.xT);
linea("A · acción al azar (splits bien)", A_C, F.xC);
linea("B · MISMAS acciones, mes al azar (tal cual)", B_T, F.xT);
linea("B · MISMAS acciones, mes al azar (splits ok)", B_C, F.xC);
linea("B · aciertos %", B_acT, F.acT * 100);
