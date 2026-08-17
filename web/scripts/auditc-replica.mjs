// AUDITORÍA — réplica instrumentada de cartera-cesta.mjs. NO toca el original.
// Uso: node scripts/auditc-replica.mjs [MODO] [REGLA] [LAG]
//   MODO  = fraccion|enteros|repartido      (por defecto enteros)
//   REGLA = filtro|azar                     (por defecto filtro)
//   LAG   = 0 (señal del mismo mes) | 1,2.. (señal de N meses antes)
// Variables de entorno extra:
//   CORTE=YYYYMMDD  → sólo se admiten contratos cuyo vencimiento sea <= CORTE (horizonte fijo)
//   SOLO_YA_VENCIDO_AL_ENTRAR=1 → exige que el vencimiento sea <= último día de datos (igual que el original)
//   SIN_SPLIT=1 → descarta patas en cuyo intervalo hubo split detectado

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const POR_TICKER = Number(process.env.POR_TICKER || 500);
const N_TICKERS = Number(process.env.N_TICKERS || 3);
const OTM_MIN = Number(process.env.OTM_MIN || 60), DTE_MIN = 365;
const DTE_MAX = Number(process.env.DTE_MAX || 1e9);
const ASK_MIN = 0.10, SPREAD_MAX = 0.40;
const MODO = process.argv[2] || "enteros";
const REGLA = process.argv[3] || "filtro";
const LAG = Number(process.argv[4] || 0);
const CORTE = process.env.CORTE || null;
const SIN_SPLIT = process.env.SIN_SPLIT === "1";
const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();

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
function idxVenc(sym, exp) {
  const dias = diasPorSim.get(sym) ?? [];
  if (!dias.length || exp > dias[dias.length - 1]) return -1;
  let lo = 0, hi = dias.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dias[m] <= exp) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}

// ── splits detectados igual que en puente-se-veia-venir (por caída del strike máximo)
const splitsPorSim = new Map();
{
  const cacheMax = existsSync("scripts/auditc-maxk.json")
    ? JSON.parse(readFileSync("scripts/auditc-maxk.json", "utf8")) : null;
  if (cacheMax) {
    for (const [sym, dias] of diasPorSim) {
      const sp = []; let prev = 0;
      for (const d of dias) {
        const maxK = cacheMax[`${sym}|${d}`]; if (maxK == null) continue;
        if (prev && maxK > 0 && prev / maxK >= 1.8) sp.push({ desde: d, ratio: prev / maxK });
        prev = maxK;
      }
      splitsPorSim.set(sym, sp);
    }
  }
}
const huboSplit = (sym, d1, d2) => (splitsPorSim.get(sym) ?? []).some((s) => s.desde > d1 && s.desde <= d2);

function cesta(sym, dia) {
  const c = cadena(sym, dia);
  if (!c) return null;
  const sp = spotDe(c);
  if (!sp) return null;
  const patas = [];
  for (const [exp, g] of Object.entries(c)) {
    const dte = Math.round((ms(exp) - ms(dia)) / 86_400_000);
    if (dte <= DTE_MIN || dte > DTE_MAX) continue;
    if (CORTE && exp > CORTE) continue;
    const iu = idxVenc(sym, exp);
    if (iu < 0) continue;
    const dSal = (diasPorSim.get(sym) ?? [])[iu];
    if (SIN_SPLIT && huboSplit(sym, dia, dSal)) continue;
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
      patas.push({ exp, K, dte, otm, ask, bid, valorDesnuda, dSal, ausente: !salLarga, spot: sp });
    }
  }
  return patas.length ? patas : null;
}

let filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8"));
if (process.env.POOL) {
  // universo COMPLETO: los 28 tickers cada mes, sin el filtro `res.length>=20` (que usa el futuro)
  const P = JSON.parse(readFileSync(process.env.POOL, "utf8"));
  const mesesOrig = new Set(filas.filter((x) => x.gamLejos != null).map((x) => x.mes));
  filas = Object.entries(P).map(([k, v]) => ({ ticker: k.split("|")[0], mes: k.split("|")[1], gamLejos: v.gamLejos }))
                           .filter((f) => mesesOrig.has(f.mes));
}
if (process.env.SENAL) {                       // señal recalculada (p.ej. sin factor de split)
  const S = JSON.parse(readFileSync(process.env.SENAL, "utf8"));
  filas = filas.map((f) => ({ ...f, gamLejos: S[`${f.ticker}|${f.mes}`]?.gamLejos ?? null }));
}
filas = filas.filter((x) => x.gamLejos != null);
const porMes = new Map();
for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
const meses = [...porMes.keys()].sort();
const señalPrev = new Map();  // ticker|mes -> gamLejos
for (const f of filas) señalPrev.set(`${f.ticker}|${f.mes}`, f.gamLejos);
const mesMenos = (m, k) => {
  let y = Number(m.slice(0, 4)), mm = Number(m.slice(4, 6)) - k;
  while (mm <= 0) { mm += 12; y--; }
  return `${y}${String(mm).padStart(2, "0")}`;
};
const ultimoDiaDelMes = (sym, mes) => {
  const d = (diasPorSim.get(sym) ?? []).filter((x) => x.slice(0, 6) === mes);
  return d.length ? d[d.length - 1] : null;
};
let semilla = 42;
const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };

let inv = 0, rec = 0, n = 0, gan = 0, nAusentes = 0, invAusente = 0;
const detalle = [];
for (const mes of meses) {
  const delMes = porMes.get(mes);
  let elegidos;
  if (REGLA === "azar") {
    const copia = [...delMes]; elegidos = [];
    for (let i = 0; i < N_TICKERS && copia.length; i++) elegidos.push(copia.splice(Math.floor(azar() * copia.length), 1)[0]);
  } else {
    let cand = delMes;
    if (LAG > 0) {
      cand = delMes.map((f) => ({ ...f, gamLejos: señalPrev.get(`${f.ticker}|${mesMenos(mes, LAG)}`) }))
                   .filter((f) => f.gamLejos != null);
    }
    elegidos = REGLA === "inverso"
      ? [...cand].sort((a, b) => a.gamLejos - b.gamLejos).slice(0, N_TICKERS)
      : [...cand].sort((a, b) => b.gamLejos - a.gamLejos).slice(0, N_TICKERS);
  }
  for (const e of elegidos) {
    const dia = ultimoDiaDelMes(e.ticker, mes);
    if (!dia) continue;
    const patas = cesta(e.ticker, dia);
    if (!patas) continue;
    let compras;
    if (MODO === "fraccion") {
      const cuota = POR_TICKER / patas.length;
      compras = patas.map((p) => ({ p, uD: cuota / (p.ask * 100), gasto: cuota }));
    } else {
      const orden = MODO === "enteros" ? [...patas].sort((x, y) => x.ask - y.ask)
        : (() => { const k = Math.max(1, Math.floor(patas.length / 20)); return patas.filter((_, i) => i % k === 0); })();
      compras = []; let queda = POR_TICKER;
      for (const p of orden) { const coste = p.ask * 100; if (coste > queda) continue; queda -= coste; compras.push({ p, uD: 1, gasto: coste }); }
    }
    let iT = 0, rT = 0;
    for (const { p, uD, gasto } of compras) {
      inv += gasto; rec += uD * p.valorDesnuda * 100; n++;
      iT += gasto; rT += uD * p.valorDesnuda * 100;
      if (p.valorDesnuda > p.ask) gan++;
      if (p.ausente) { nAusentes++; invAusente += gasto; }
    }
    detalle.push({ mes, ticker: e.ticker, dia, spot: patas[0].spot, nPatas: patas.length, nComp: compras.length, inv: iT, rec: rT,
                   sinSalida: compras.filter((x) => x.p.ausente).length,
                   expMin: compras.length ? compras.map(x=>x.p.exp).sort()[0] : null,
                   expMax: compras.length ? compras.map(x=>x.p.exp).sort().slice(-1)[0] : null });
  }
}
console.log(`MODO=${MODO} REGLA=${REGLA} LAG=${LAG} CORTE=${CORTE ?? "-"} SIN_SPLIT=${SIN_SPLIT} OTM_MIN=${OTM_MIN}`);
console.log(`  ${n} patas · ganan ${((gan / n) * 100).toFixed(0)}% · $${Math.round(inv)} → $${Math.round(rec)}  =  ${(rec / inv).toFixed(2)}x`);
console.log(`  patas SIN contrato de salida (valen 0 por ausencia): ${nAusentes} (${((nAusentes/n)*100).toFixed(1)}%), $${Math.round(invAusente)} invertidos`);
{ const pa = new Map();
  for (const x of detalle) { const a = x.mes.slice(0,4); if(!pa.has(a)) pa.set(a,[0,0,0]); const v=pa.get(a); v[0]+=x.inv; v[1]+=x.rec; v[2]++; }
  console.log("  por año: " + [...pa].sort().map(([a,v])=>`${a}:${(v[1]/v[0]).toFixed(1)}x(${v[2]})`).join("  ")); }
writeFileSync(`scripts/auditc-detalle-${MODO}-${REGLA}-L${LAG}${process.env.POOL?"-pool":""}${process.env.DTE_MAX?"-dte"+process.env.DTE_MAX:""}${CORTE?"-"+CORTE:""}${SIN_SPLIT?"-nosplit":""}.json`, JSON.stringify(detalle), "utf8");
