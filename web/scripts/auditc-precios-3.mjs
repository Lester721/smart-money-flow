// AUDITORÍA 3 — los CUATRO vencimientos que llevan el 90% del beneficio, contrato a contrato.
// Y el desglose fino de los 643 "ausentes = cero".
//
// Uso: node --max-old-space-size=8192 scripts/auditc-precios-3.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const OIDIR = "scripts/cache-theta/oi-ancho";
const TDIR = "scripts/cache-theta";
const POR_TICKER = 500, N_TICKERS = 3;
const OTM_MIN = 60, DTE_MIN = 365, ASK_MIN = 0.10, SPREAD_MAX = 0.40;
const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);

const barsCache = new Map();
function closes(sym) {
  if (barsCache.has(sym)) return barsCache.get(sym);
  const m = new Map();
  for (const f of readdirSync(TDIR))
    if (f.startsWith(`${sym}_barsPAR_y_`) && f.endsWith(".json"))
      for (const b of JSON.parse(readFileSync(`${TDIR}/${f}`, "utf8"))) m.set(b.time.replaceAll("-", ""), b.close);
  barsCache.set(sym, m); return m;
}

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/); if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();

const cache = new Map();
function leer(dir, sym, dia) {
  const k = `${dir}|${sym}|${dia}`; const hit = cache.get(k);
  if (hit !== undefined) { cache.delete(k); cache.set(k, hit); return hit; }
  const f = `${dir}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cache.set(k, v); if (cache.size > 300) cache.delete(cache.keys().next().value);
  return v;
}
const cadena = (s, d) => leer(CDIR, s, d);
const oiDe = (s, d) => leer(OIDIR, s, d);
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
/** Paridad DENTRO de un vencimiento concreto: el strike con menor |C−P|, spot = K + C − P. */
function spotParidadGrupo(g) {
  let best = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const q = g[`${K}|P`]; if (!q) continue;
    const mc = (ba[0] + ba[1]) / 2, mq = (q[0] + q[1]) / 2;
    if (Math.abs(mc - mq) < dm) { dm = Math.abs(mc - mq); best = { K, mc, mq, spot: K + mc - mq }; }
  }
  return best;
}
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
      const otm = ((K - sp) / sp) * 100; if (otm <= OTM_MIN) continue;
      const [bid, ask] = ba;
      if (!(ask >= ASK_MIN) || !((ask - bid) / ask <= SPREAD_MAX)) continue;
      const sl = gSal[clave];
      const ksSal = Object.keys(gSal).filter((x) => x.endsWith("C")).map((x) => Number(x.slice(0, -2)));
      patas.push({ sym, dia, spEst: sp, clave, exp, K, dte, otm, ask, bid,
        valorDesnuda: sl ? sl[0] : 0, dSal, salLarga: sl ?? null, ksSal });
    }
  }
  return patas.length ? patas : null;
}

const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8")).filter((x) => x.gamLejos != null);
const porMes = new Map();
for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
const meses = [...porMes.keys()].sort();
const ultimoDiaDelMes = (sym, mes) => { const d = (diasPorSim.get(sym) ?? []).filter((x) => x.slice(0, 6) === mes); return d.length ? d[d.length - 1] : null; };

const compradas = [];
for (const mes of meses)
  for (const e of [...porMes.get(mes)].sort((a, b) => b.gamLejos - a.gamLejos).slice(0, N_TICKERS)) {
    const dia = ultimoDiaDelMes(e.ticker, mes); if (!dia) continue;
    const patas = cesta(e.ticker, dia); if (!patas) continue;
    let queda = POR_TICKER;
    for (const p of [...patas].sort((x, y) => x.ask - y.ask)) {
      const coste = p.ask * 100; if (coste > queda) continue; queda -= coste;
      compradas.push({ ...p, mes, coste, recaudo: p.valorDesnuda * 100 });
    }
  }
const rec = compradas.reduce((s, x) => s + x.recaudo, 0);

// ── 1) LOS AUSENTES, DESGLOSADOS POR LADO ───────────────────────────────────
console.log("\n=== 1) LOS 643 AUSENTES: ¿por encima o por debajo del rango guardado? ===");
let arriba = 0, abajo = 0;
const ejemplos = [];
for (const p of compradas) {
  if (p.salLarga || !p.ksSal.length) continue;
  const mx = Math.max(...p.ksSal), mn = Math.min(...p.ksSal);
  const g = cadena(p.sym, p.dSal)?.[p.exp];
  const par = g ? spotParidadGrupo(g) : null;
  if (p.K > mx) { arriba++; if (ejemplos.length < 6) ejemplos.push({ p, mn, mx, spot: par?.spot }); }
  else if (p.K < mn) { abajo++; ejemplos.push({ p, mn, mx, spot: par?.spot, ITM: true }); }
}
console.log(`   strike POR ENCIMA del máximo guardado (muy fuera del dinero → cero razonable): ${arriba}`);
console.log(`   strike POR DEBAJO del mínimo guardado (estaría DENTRO del dinero → cero MAL):   ${abajo}`);
for (const e of ejemplos.slice(0, 8))
  console.log(`     ej: ${e.p.sym} ${e.p.dSal} venc ${e.p.exp} K=${e.p.K} · rango guardado [${e.mn}, ${e.mx}] · spot paridad ${e.spot?.toFixed(2) ?? "n/d"}${e.ITM ? "  *** ITM ZEROED ***" : ""}`);

// ── 2) LOS CUATRO VENCIMIENTOS DEL DINERO, CONTRATO A CONTRATO ──────────────
const objetivo = [["TSLA", "20200619"], ["INTC", "20260618"], ["NVDA", "20210115"], ["NVDA", "20240119"], ["AMD", "20260618"], ["TSLA", "20210115"]];
for (const [sym, exp] of objetivo) {
  const ps = compradas.filter((p) => p.sym === sym && p.exp === exp);
  if (!ps.length) continue;
  const dSal = ps[0].dSal;
  const g = cadena(sym, dSal)?.[exp] ?? {};
  const par = spotParidadGrupo(g);
  const clReal = closes(sym).get(dSal);
  const ks = Object.keys(g).filter((x) => x.endsWith("C")).map((x) => Number(x.slice(0, -2))).sort((a, b) => a - b);
  const i = ps.reduce((s, x) => s + x.coste, 0), r = ps.reduce((s, x) => s + x.recaudo, 0);
  console.log(`\n=== 2) ${sym} venc ${exp} · salida ${dSal} · ${ps.length} patas · $${Math.round(i).toLocaleString("es-ES")} → $${Math.round(r).toLocaleString("es-ES")} = ${(r / i).toFixed(1)}x  (${((r - i) / (rec - compradas.reduce((s, x) => s + x.coste, 0)) * 100).toFixed(1)}% del beneficio) ===`);
  console.log(`   spot por PARIDAD el día de salida: ${par ? par.spot.toFixed(2) : "n/d"}  (K=${par?.K} C=${par?.mc.toFixed(2)} P=${par?.mq.toFixed(2)})`);
  console.log(`   cierre REAL del subyacente (barsPAR): ${clReal ?? "NO HAY FICHERO DE BARRAS PARA ESTE SÍMBOLO"}`);
  console.log(`   strikes de call guardados ese día: ${ks.length} · [${ks[0]}, ${ks[ks.length - 1]}]`);
  const ref = clReal ?? par?.spot;
  for (const p of ps.sort((a, b) => b.recaudo - a.recaudo).slice(0, 10)) {
    const intr = ref != null ? Math.max(0, ref - p.K) : null;
    const oiE = oiDe(p.sym, p.dia)?.[p.exp]?.[p.clave];
    const oiS = oiDe(p.sym, p.dSal)?.[p.exp]?.[p.clave];
    console.log(`     ${p.mes} K=${String(p.K).padStart(5)} ask ${String(p.ask).padStart(5)} → bid ${String(p.salLarga?.[0] ?? "AUSENTE").padStart(7)} (ask ${p.salLarga?.[1] ?? "-"}) · intrínseco ${intr != null ? intr.toFixed(2).padStart(7) : "  n/d"} · ratio ${intr > 0 ? (p.valorDesnuda / intr).toFixed(3) : "n/d"} · OI entrada ${String(oiE ?? "n/d").padStart(6)} salida ${String(oiS ?? "n/d").padStart(6)} · recaudo $${Math.round(p.recaudo).toLocaleString("es-ES")}`);
  }
}

// ── 3) EL RECAUDO QUE NO SE PUDO CONTRASTAR CON PRECIO REAL ─────────────────
console.log("\n=== 3) ¿CUÁNTO DEL DINERO RECUPERADO SE PUDO CONTRASTAR CON EL CIERRE REAL? ===");
let conBar = 0, sinBar = 0;
for (const p of compradas) {
  if (p.recaudo <= 0) continue;
  if (closes(p.sym).get(p.dSal) != null) conBar += p.recaudo; else sinBar += p.recaudo;
}
console.log(`   contrastado con cierre real: $${Math.round(conBar).toLocaleString("es-ES")} (${((conBar / rec) * 100).toFixed(1)}%)`);
console.log(`   SIN barra de subyacente (sólo paridad de la propia cadena): $${Math.round(sinBar).toLocaleString("es-ES")} (${((sinBar / rec) * 100).toFixed(1)}%)`);
const symsSinBar = new Set();
for (const p of compradas) if (p.recaudo > 0 && closes(p.sym).get(p.dSal) == null) symsSinBar.add(p.sym + " " + p.exp);
console.log(`   símbolos/vencimientos sin barra: ${[...symsSinBar].join(", ")}`);

// ── 4) ¿EL DÍA DE SALIDA ES EL VENCIMIENTO? ────────────────────────────────
console.log("\n=== 4) DÍA DE SALIDA vs VENCIMIENTO (todas las patas con recaudo > 0) ===");
const h = new Map();
for (const p of compradas) {
  if (p.recaudo <= 0) continue;
  const d = Math.round((ms(p.exp) - ms(p.dSal)) / 86_400_000);
  h.set(d, (h.get(d) ?? 0) + 1);
}
console.log(`   hueco (días) → nº patas: ${[...h].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}d:${v}`).join("  ")}`);
