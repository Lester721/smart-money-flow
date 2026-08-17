// AUDITORÍA — los PRECIOS DE SALIDA de las patas más rentables (MODO=enteros, filtro)
//
// Uso: node scripts/auditc-precios.mjs
//
// Replica EXACTAMENTE la mecánica de cartera-cesta.mjs (MODO=enteros, regla=filtro),
// guarda TODAS las patas compradas, y audita una a una las 15 más rentables:
//   1. ¿existe de verdad el bid de salida en la cadena de ese día?
//   2. ¿es coherente con spot - strike (paridad put/call en el día de salida)?
//   3. ¿es dSal el último día hábil <= vencimiento?
// NO toca ningún fichero del test. NO pide nada a ThetaData.

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const POR_TICKER = 500, N_TICKERS = 3;
const OTM_MIN = 60, DTE_MIN = 365;
const ASK_MIN = 0.10, SPREAD_MAX = 0.40;
const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();

// Calendario GLOBAL de días con datos (unión de todos los símbolos) — para comprobar
// si el día de salida de un símbolo es realmente el último hábil, o si le faltan ficheros.
const calendario = [...new Set([...diasPorSim.values()].flat())].sort();
const setCal = new Set(calendario);
const ultimoHabilGlobal = (exp) => {
  let lo = 0, hi = calendario.length - 1, r = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (calendario[m] <= exp) { r = calendario[m]; lo = m + 1; } else hi = m - 1; }
  return r;
};

const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  const hit = cache.get(k);
  if (hit !== undefined) { cache.delete(k); cache.set(k, hit); return hit; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cache.set(k, v);
  if (cache.size > 250) cache.delete(cache.keys().next().value);
  return v;
}
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
/** Igual que en el test: spot por paridad pero devolviendo también el detalle. */
function spotDetalle(c) {
  let k = null, dm = Infinity, det = null;
  for (const [exp, g] of Object.entries(c)) for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`];
    if (!p) continue;
    const mc = (ba[0] + ba[1]) / 2, mp = (p[0] + p[1]) / 2;
    const d = Math.abs(mc - mp);
    if (d < dm) { dm = d; k = K; det = { exp, K, mc, mp, dif: d, spotParidad: K + mc - mp }; }
  }
  return { K: k, det };
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
      const valorDesnuda = salLarga ? salLarga[0] : 0;
      patas.push({ sym, dia, spEntrada: sp, clave, exp, K, dte, otm, ask, bid, valorDesnuda, dSal, salLarga: salLarga ?? null });
    }
  }
  return patas.length ? patas : null;
}

// ── Selección: el FILTRO, MODO=enteros ──────────────────────────────────────
const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8")).filter((x) => x.gamLejos != null);
const porMes = new Map();
for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
const meses = [...porMes.keys()].sort();
const ultimoDiaDelMes = (sym, mes) => {
  const d = (diasPorSim.get(sym) ?? []).filter((x) => x.slice(0, 6) === mes);
  return d.length ? d[d.length - 1] : null;
};

const compradas = [];
let inv = 0, rec = 0;
for (const mes of meses) {
  const elegidos = [...porMes.get(mes)].sort((a, b) => b.gamLejos - a.gamLejos).slice(0, N_TICKERS);
  for (const e of elegidos) {
    const dia = ultimoDiaDelMes(e.ticker, mes);
    if (!dia) continue;
    const patas = cesta(e.ticker, dia);
    if (!patas) continue;
    const orden = [...patas].sort((x, y) => x.ask - y.ask);
    let queda = POR_TICKER;
    for (const p of orden) {
      const coste = p.ask * 100;
      if (coste > queda) continue;
      queda -= coste;
      const recaudo = p.valorDesnuda * 100;
      inv += coste; rec += recaudo;
      compradas.push({ ...p, mes, coste, recaudo, beneficio: recaudo - coste });
    }
  }
}

console.log(`\n=== REPLICA DE CONTROL ===`);
console.log(`patas compradas: ${compradas.length}`);
console.log(`invertido $${Math.round(inv).toLocaleString("es-ES")} → recuperado $${Math.round(rec).toLocaleString("es-ES")}  =  ${(rec / inv).toFixed(2)}x`);

const top = [...compradas].sort((a, b) => b.beneficio - a.beneficio).slice(0, 15);
const totalBen = rec - inv;
console.log(`beneficio total $${Math.round(totalBen).toLocaleString("es-ES")} · las 15 mejores suman $${Math.round(top.reduce((s, x) => s + x.beneficio, 0)).toLocaleString("es-ES")} (${((top.reduce((s, x) => s + x.beneficio, 0) / totalBen) * 100).toFixed(1)}%)`);

// ── AUDITORÍA UNA A UNA ─────────────────────────────────────────────────────
console.log(`\n=== LAS 15 PATAS MÁS RENTABLES, UNA A UNA ===`);
const alarmas = [];
let i = 0;
for (const p of top) {
  i++;
  const cSal = cadena(p.sym, p.dSal);
  const gSal = cSal?.[p.exp] ?? null;
  const enCadena = !!(gSal && gSal[p.clave]);
  const { det } = cSal ? spotDetalle(cSal) : { det: null };
  const spotSal = det ? det.spotParidad : null;

  // paridad DENTRO del vencimiento de salida (más limpio: mismo grupo)
  let spotGrupo = null, spotGrupoDet = null;
  if (gSal) {
    let dm = Infinity;
    for (const [cl, ba] of Object.entries(gSal)) {
      if (cl.slice(-1) !== "C") continue;
      const K = Number(cl.slice(0, -2)); const q = gSal[`${K}|P`];
      if (!q) continue;
      const mc = (ba[0] + ba[1]) / 2, mq = (q[0] + q[1]) / 2;
      if (Math.abs(mc - mq) < dm) { dm = Math.abs(mc - mq); spotGrupo = K + mc - mq; spotGrupoDet = { K, mc, mq }; }
    }
  }
  const refSpot = spotGrupo ?? spotSal;
  const intrinseco = refSpot != null ? Math.max(0, refSpot - p.K) : null;
  const desvio = intrinseco != null && intrinseco > 0 ? (p.valorDesnuda - intrinseco) / intrinseco : null;

  const ultGlobal = ultimoHabilGlobal(p.exp);
  const expEsHabil = setCal.has(p.exp);
  const huecoDias = Math.round((ms(p.exp) - ms(p.dSal)) / 86_400_000);
  const salOk = p.dSal === ultGlobal;

  const flags = [];
  if (!enCadena) flags.push("BID-SALIDA-AUSENTE");
  if (p.valorDesnuda === 0) flags.push("VALOR-CERO");
  if (!salOk) flags.push(`SALIDA-NO-ES-ULTIMO-HABIL(global=${ultGlobal})`);
  if (huecoDias > 0) flags.push(`HUECO-${huecoDias}d`);
  if (desvio != null && Math.abs(desvio) > 0.15) flags.push(`PARIDAD-DESVIO-${(desvio * 100).toFixed(0)}%`);
  if (intrinseco === 0 && p.valorDesnuda > 0.05) flags.push("VALOR-SIN-INTRINSECO");
  if (refSpot == null) flags.push("SIN-SPOT-SALIDA");

  console.log(`
[${String(i).padStart(2)}] ${p.sym}  ${p.mes}  entrada ${p.dia}  →  salida ${p.dSal}  (venc ${p.exp})
     contrato ${p.clave}   DTE ${p.dte}   OTM entrada ${p.otm.toFixed(0)}%   spot entrada (paridad) ${p.spEntrada}
     compra: ask $${p.ask}  (bid $${p.bid})  coste $${p.coste.toFixed(0)}
     salida: ${enCadena ? `bid $${p.salLarga[0]}  ask $${p.salLarga[1]}` : "CONTRATO NO ESTÁ EN LA CADENA DE SALIDA"}   recaudo $${p.recaudo.toFixed(0)}  beneficio $${p.beneficio.toFixed(0)}  (${(p.recaudo / p.coste).toFixed(1)}x)
     spot salida: grupo=${spotGrupo != null ? spotGrupo.toFixed(2) : "n/d"}  global=${spotSal != null ? spotSal.toFixed(2) : "n/d"}   intrínseco (spot-K) = ${intrinseco != null ? intrinseco.toFixed(2) : "n/d"}
     ${desvio != null ? `bid/intrínseco = ${(p.valorDesnuda / intrinseco).toFixed(3)}` : "sin intrínseco comparable"}
     último hábil global <= venc = ${ultGlobal}   venc es día hábil: ${expEsHabil}   hueco salida→venc = ${huecoDias}d
     ${flags.length ? "*** " + flags.join(" | ") : "OK"}`);
  if (flags.length) alarmas.push({ i, sym: p.sym, exp: p.exp, clave: p.clave, flags });
}

console.log(`\n=== RESUMEN DE ALARMAS ===`);
if (!alarmas.length) console.log("ninguna de las 15 dispara alarma");
for (const a of alarmas) console.log(`[${a.i}] ${a.sym} ${a.exp} ${a.clave}: ${a.flags.join(" | ")}`);

// ── AGREGADOS SOBRE TODAS LAS PATAS ─────────────────────────────────────────
console.log(`\n=== AGREGADOS (todas las patas compradas) ===`);
let ausentes = 0, ceros = 0, salNoUlt = 0, huecoGrande = 0, recAusentes = 0, recSalNoUlt = 0;
const huecos = [];
for (const p of compradas) {
  const gSal = cadena(p.sym, p.dSal)?.[p.exp];
  const enCad = !!(gSal && gSal[p.clave]);
  if (!enCad) { ausentes++; }
  if (p.valorDesnuda === 0) ceros++;
  const ug = ultimoHabilGlobal(p.exp);
  if (p.dSal !== ug) { salNoUlt++; recSalNoUlt += p.recaudo; }
  const h = Math.round((ms(p.exp) - ms(p.dSal)) / 86_400_000);
  huecos.push(h);
  if (h > 4) huecoGrande++;
  if (!enCad) recAusentes += p.recaudo;
}
huecos.sort((a, b) => a - b);
console.log(`contrato ausente en la cadena de salida: ${ausentes}/${compradas.length} (${((ausentes / compradas.length) * 100).toFixed(1)}%)`);
console.log(`valor de salida = 0: ${ceros}/${compradas.length} (${((ceros / compradas.length) * 100).toFixed(1)}%)`);
console.log(`día de salida != último hábil global: ${salNoUlt} patas · recaudo implicado $${Math.round(recSalNoUlt).toLocaleString("es-ES")} (${((recSalNoUlt / rec) * 100).toFixed(1)}% de todo lo recuperado)`);
console.log(`hueco salida→venc:  mediana ${huecos[huecos.length >> 1]}d · p90 ${huecos[Math.floor(huecos.length * 0.9)]}d · máx ${huecos[huecos.length - 1]}d · >4d en ${huecoGrande} patas`);

// ¿de dónde sale el dinero? concentración
const porSym = new Map();
for (const p of compradas) {
  if (!porSym.has(p.sym)) porSym.set(p.sym, { inv: 0, rec: 0, n: 0 });
  const o = porSym.get(p.sym); o.inv += p.coste; o.rec += p.recaudo; o.n++;
}
console.log(`\n=== CONCENTRACIÓN POR ACCIÓN (beneficio) ===`);
for (const [s, o] of [...porSym].sort((a, b) => (b[1].rec - b[1].inv) - (a[1].rec - a[1].inv)).slice(0, 10))
  console.log(`   ${s.padEnd(5)} ${String(o.n).padStart(5)} patas · $${Math.round(o.inv).toLocaleString("es-ES").padStart(9)} → $${Math.round(o.rec).toLocaleString("es-ES").padStart(11)} · beneficio $${Math.round(o.rec - o.inv).toLocaleString("es-ES").padStart(11)} (${((o.rec - o.inv) / totalBen * 100).toFixed(1)}%)`);
