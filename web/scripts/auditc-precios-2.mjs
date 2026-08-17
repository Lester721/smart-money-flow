// AUDITORÍA 2 — contrastar CADA pata comprada contra el CIERRE REAL del subyacente
// (ficheros *_barsPAR_y_*.json, precios tal cual se negociaron) y contra el INTERÉS ABIERTO.
//
// Uso: node --max-old-space-size=8192 scripts/auditc-precios-2.mjs
//
// Lo que se comprueba (todo con datos en disco, cero peticiones):
//   A) spot de entrada estimado por paridad  vs  cierre real  → ¿el filtro >60% OTM es el que dice?
//   B) bid de salida  vs  intrínseco real (cierre − strike)   → ¿el precio de salida es real?
//   C) contratos ausentes: ¿el strike cae DENTRO del rango guardado ese día (cero de verdad)
//      o FUERA (el fichero simplemente no lo cubre → el cero es un supuesto, no una medición)?
//   D) interés abierto en la entrada de cada pata comprada  → ¿son cotizaciones fantasma?
//   E) concentración: cuánto del beneficio sale de UN (acción, mes) y de UN vencimiento.

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const OIDIR = "scripts/cache-theta/oi-ancho";
const TDIR = "scripts/cache-theta";
const POR_TICKER = 500, N_TICKERS = 3;
const OTM_MIN = 60, DTE_MIN = 365;
const ASK_MIN = 0.10, SPREAD_MAX = 0.40;
const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);

// ── cierres reales del subyacente ───────────────────────────────────────────
const barsCache = new Map();
function closes(sym) {
  if (barsCache.has(sym)) return barsCache.get(sym);
  const m = new Map();
  for (const f of readdirSync(TDIR)) {
    if (!f.startsWith(`${sym}_barsPAR_y_`) || !f.endsWith(".json")) continue;
    for (const b of JSON.parse(readFileSync(`${TDIR}/${f}`, "utf8"))) m.set(b.time.replaceAll("-", ""), b.close);
  }
  barsCache.set(sym, m);
  return m;
}

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();

const cache = new Map();
function leer(dir, sym, dia) {
  const k = `${dir}|${sym}|${dia}`;
  const hit = cache.get(k);
  if (hit !== undefined) { cache.delete(k); cache.set(k, hit); return hit; }
  const f = `${dir}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cache.set(k, v);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return v;
}
const cadena = (s, d) => leer(CDIR, s, d);
const oiDe = (s, d) => leer(OIDIR, s, d);

function spotDe(c) {
  let k = null, dm = Infinity;
  for (const g of Object.values(c)) for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`];
    if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; k = K; }
  }
  return k;
}
function idxVenc(sym, exp) {
  const dias = diasPorSim.get(sym) ?? [];
  if (!dias.length || exp > dias[dias.length - 1]) return -1;
  let lo = 0, hi = dias.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dias[m] <= exp) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
function cesta(sym, dia) {
  const c = cadena(sym, dia);
  if (!c) return null;
  const sp = spotDe(c);
  if (!sp) return null;
  const patas = [];
  for (const [exp, g] of Object.entries(c)) {
    const dte = Math.round((ms(exp) - ms(dia)) / 86_400_000);
    if (dte <= DTE_MIN) continue;
    const iu = idxVenc(sym, exp);
    if (iu < 0) continue;
    const dSal = (diasPorSim.get(sym) ?? [])[iu];
    const gSal = cadena(sym, dSal)?.[exp] ?? {};
    for (const [clave, ba] of Object.entries(g)) {
      if (clave.slice(-1) !== "C") continue;
      const K = Number(clave.slice(0, -2));
      const otm = ((K - sp) / sp) * 100;
      if (otm <= OTM_MIN) continue;
      const [bid, ask] = ba;
      if (!(ask >= ASK_MIN) || !((ask - bid) / ask <= SPREAD_MAX)) continue;
      const salLarga = gSal[clave];
      patas.push({ sym, dia, spEst: sp, clave, exp, K, dte, otm, ask, bid,
        valorDesnuda: salLarga ? salLarga[0] : 0, dSal, salLarga: salLarga ?? null,
        strikesSalida: Object.keys(gSal).filter((x) => x.endsWith("C")).map((x) => Number(x.slice(0, -2))) });
    }
  }
  return patas.length ? patas : null;
}

const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8")).filter((x) => x.gamLejos != null);
const porMes = new Map();
for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
const meses = [...porMes.keys()].sort();
const ultimoDiaDelMes = (sym, mes) => {
  const d = (diasPorSim.get(sym) ?? []).filter((x) => x.slice(0, 6) === mes);
  return d.length ? d[d.length - 1] : null;
};

const compradas = [];
for (const mes of meses) {
  for (const e of [...porMes.get(mes)].sort((a, b) => b.gamLejos - a.gamLejos).slice(0, N_TICKERS)) {
    const dia = ultimoDiaDelMes(e.ticker, mes);
    if (!dia) continue;
    const patas = cesta(e.ticker, dia);
    if (!patas) continue;
    let queda = POR_TICKER;
    for (const p of [...patas].sort((x, y) => x.ask - y.ask)) {
      const coste = p.ask * 100;
      if (coste > queda) continue;
      queda -= coste;
      compradas.push({ ...p, mes, coste, recaudo: p.valorDesnuda * 100, beneficio: p.valorDesnuda * 100 - coste });
    }
  }
}
const inv = compradas.reduce((s, x) => s + x.coste, 0);
const rec = compradas.reduce((s, x) => s + x.recaudo, 0);
console.log(`\npatas ${compradas.length} · $${Math.round(inv).toLocaleString("es-ES")} → $${Math.round(rec).toLocaleString("es-ES")} = ${(rec / inv).toFixed(2)}x\n`);

// ── A) spot estimado vs cierre real, en la ENTRADA ──────────────────────────
console.log("=== A) SPOT DE ENTRADA: paridad estimada vs CIERRE REAL ===");
let sinBar = 0; const errs = []; let romperianFiltro = 0, costeRompen = 0, recRompen = 0;
for (const p of compradas) {
  const cl = closes(p.sym).get(p.dia);
  if (cl == null) { sinBar++; continue; }
  errs.push((p.spEst - cl) / cl);
  const otmReal = ((p.K - cl) / cl) * 100;
  if (otmReal <= OTM_MIN) { romperianFiltro++; costeRompen += p.coste; recRompen += p.recaudo; }
}
errs.sort((a, b) => a - b);
const pc = (q) => (errs[Math.floor(errs.length * q)] * 100).toFixed(2) + "%";
console.log(`   sin barra de cierre: ${sinBar}/${compradas.length}`);
console.log(`   error spot estimado: p05 ${pc(0.05)} · mediana ${pc(0.5)} · p95 ${pc(0.95)} · máx |err| ${(Math.max(...errs.map(Math.abs)) * 100).toFixed(2)}%`);
console.log(`   patas que con el cierre REAL ya NO cumplen >60% OTM: ${romperianFiltro} · coste $${Math.round(costeRompen).toLocaleString("es-ES")} · recaudo $${Math.round(recRompen).toLocaleString("es-ES")}`);

// ── B) bid de salida vs intrínseco real ─────────────────────────────────────
console.log("\n=== B) BID DE SALIDA vs INTRÍNSECO REAL (cierre del subyacente − strike) ===");
let conValor = 0, sinBarSal = 0;
const ratios = []; const raros = [];
for (const p of compradas) {
  if (p.valorDesnuda <= 0) continue;
  conValor++;
  const cl = closes(p.sym).get(p.dSal);
  if (cl == null) { sinBarSal++; continue; }
  const intr = Math.max(0, cl - p.K);
  if (intr > 0.5) {
    const r = p.valorDesnuda / intr;
    ratios.push({ r, p, intr, cl });
    if (r > 1.10 || r < 0.85) raros.push({ r, p, intr, cl });
  } else if (p.valorDesnuda > 0.20) {
    raros.push({ r: Infinity, p, intr, cl });     // valor sin intrínseco el día del vencimiento
  }
  if (p.salLarga && p.salLarga[0] > p.salLarga[1]) raros.push({ r: -1, p, intr, cl });  // bid>ask
}
ratios.sort((a, b) => a.r - b.r);
console.log(`   patas con valor de salida > 0: ${conValor} · sin barra el día de salida: ${sinBarSal}`);
if (ratios.length) {
  const q = (x) => ratios[Math.floor(ratios.length * x)].r.toFixed(3);
  console.log(`   bid/intrínseco: mín ${ratios[0].r.toFixed(3)} · p05 ${q(0.05)} · mediana ${q(0.5)} · p95 ${q(0.95)} · máx ${ratios[ratios.length - 1].r.toFixed(3)}`);
}
console.log(`   patas RARAS (ratio fuera de 0,85–1,10, o valor sin intrínseco, o bid>ask): ${raros.length}`);
for (const x of raros.slice(0, 25))
  console.log(`     ${x.p.sym} ${x.p.mes} venc ${x.p.exp} ${x.p.clave} · salida ${x.p.dSal} bid ${x.p.salLarga?.[0]} ask ${x.p.salLarga?.[1]} · cierre real ${x.cl} · intrínseco ${x.intr.toFixed(2)} · ratio ${x.r === Infinity ? "∞ (sin intrínseco)" : x.r === -1 ? "BID>ASK" : x.r.toFixed(3)} · recaudo $${x.p.recaudo.toFixed(0)}`);
const recRaros = raros.reduce((s, x) => s + x.p.recaudo, 0);
console.log(`   recaudo implicado en las raras: $${Math.round(recRaros).toLocaleString("es-ES")} (${((recRaros / rec) * 100).toFixed(1)}% del total recuperado)`);

// ── C) los ausentes: ¿cero medido o cero supuesto? ──────────────────────────
console.log("\n=== C) CONTRATOS AUSENTES EN LA CADENA DE SALIDA ===");
let ausentes = 0, dentroRango = 0, fueraRango = 0, sinGrupo = 0, ausenteITM = 0, dineroPerdido = 0;
for (const p of compradas) {
  if (p.salLarga) continue;
  ausentes++;
  const ks = p.strikesSalida;
  if (!ks.length) { sinGrupo++; continue; }
  const mn = Math.min(...ks), mx = Math.max(...ks);
  if (p.K >= mn && p.K <= mx) dentroRango++; else fueraRango++;
  const cl = closes(p.sym).get(p.dSal);
  if (cl != null && cl > p.K) { ausenteITM++; dineroPerdido += (cl - p.K) * 100; }   // se contó 0 pero valía
}
console.log(`   ausentes: ${ausentes}/${compradas.length}`);
console.log(`   · sin NINGÚN strike guardado para ese vencimiento ese día: ${sinGrupo}  ← el cero es un SUPUESTO`);
console.log(`   · strike DENTRO del rango guardado (cero medido de verdad):  ${dentroRango}`);
console.log(`   · strike FUERA del rango guardado (cero supuesto):           ${fueraRango}`);
console.log(`   · ausentes que el día del vencimiento estaban ITM (cierre > strike): ${ausenteITM} · valor no cobrado $${Math.round(dineroPerdido).toLocaleString("es-ES")}`);

// ── D) interés abierto en la entrada ────────────────────────────────────────
console.log("\n=== D) INTERÉS ABIERTO EN LA ENTRADA (¿cotización fantasma?) ===");
let oiSin = 0, oi0 = 0, oiBajo = 0; const oiv = [];
let recOi0 = 0, recOiBajo = 0;
for (const p of compradas) {
  const o = oiDe(p.sym, p.dia)?.[p.exp]?.[p.clave];
  if (o == null) { oiSin++; continue; }
  oiv.push(o);
  if (o === 0) { oi0++; recOi0 += p.recaudo; }
  else if (o < 10) { oiBajo++; recOiBajo += p.recaudo; }
}
oiv.sort((a, b) => a - b);
console.log(`   sin dato de OI: ${oiSin} · OI = 0: ${oi0} (recaudo $${Math.round(recOi0).toLocaleString("es-ES")}) · 0 < OI < 10: ${oiBajo} (recaudo $${Math.round(recOiBajo).toLocaleString("es-ES")})`);
if (oiv.length) console.log(`   OI: mín ${oiv[0]} · p10 ${oiv[Math.floor(oiv.length * 0.1)]} · mediana ${oiv[oiv.length >> 1]} · p90 ${oiv[Math.floor(oiv.length * 0.9)]} · máx ${oiv[oiv.length - 1]}`);

// ── E) concentración ────────────────────────────────────────────────────────
console.log("\n=== E) CONCENTRACIÓN DEL BENEFICIO ===");
const benTot = rec - inv;
const agrupa = (fn, nombre) => {
  const m = new Map();
  for (const p of compradas) {
    const k = fn(p);
    if (!m.has(k)) m.set(k, { inv: 0, rec: 0, n: 0 });
    const o = m.get(k); o.inv += p.coste; o.rec += p.recaudo; o.n++;
  }
  const orden = [...m].sort((a, b) => (b[1].rec - b[1].inv) - (a[1].rec - a[1].inv));
  console.log(`   ── por ${nombre} (${m.size} grupos) ──`);
  let acum = 0;
  orden.slice(0, 8).forEach(([k, o], i) => {
    acum += o.rec - o.inv;
    console.log(`     ${String(i + 1).padStart(2)}. ${k.padEnd(22)} ${String(o.n).padStart(4)} patas · $${Math.round(o.inv).toLocaleString("es-ES").padStart(7)} → $${Math.round(o.rec).toLocaleString("es-ES").padStart(10)} · beneficio ${(((o.rec - o.inv) / benTot) * 100).toFixed(1).padStart(5)}% · acumulado ${((acum / benTot) * 100).toFixed(1)}%`);
  });
  return orden;
};
agrupa((p) => `${p.sym} ${p.mes}`, "ENTRADA (acción, mes)");
agrupa((p) => `${p.sym} venc ${p.exp}`, "SALIDA (acción, vencimiento)");
agrupa((p) => p.mes.slice(0, 4), "AÑO DE ENTRADA");

// ── F) ¿aguanta sin el suceso mayor? ────────────────────────────────────────
console.log("\n=== F) SENSIBILIDAD: quitar la mejor entrada / el mejor vencimiento ===");
const quitar = (pred, etq) => {
  const q = compradas.filter((p) => !pred(p));
  const i2 = q.reduce((s, x) => s + x.coste, 0), r2 = q.reduce((s, x) => s + x.recaudo, 0);
  console.log(`   sin ${etq}: ${q.length} patas · $${Math.round(i2).toLocaleString("es-ES")} → $${Math.round(r2).toLocaleString("es-ES")} = ${(r2 / i2).toFixed(2)}x`);
};
quitar((p) => p.sym === "TSLA" && p.mes === "201905", "TSLA 201905 (una entrada, un mes)");
quitar((p) => p.sym === "TSLA" && p.exp === "20200619", "TSLA venc 20200619");
quitar((p) => p.sym === "TSLA", "TSLA entera");
quitar((p) => p.sym === "TSLA" || p.sym === "NVDA", "TSLA + NVDA");
quitar((p) => ["TSLA", "NVDA", "INTC", "AMD"].includes(p.sym), "TSLA + NVDA + INTC + AMD");
