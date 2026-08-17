// AUDITORÍA 4 — SPLITS: el emparejamiento por strike literal rompe la identidad del contrato.
//
// Uso: node --max-old-space-size=8192 scripts/auditc-precios-4.mjs
//
// 1. Detecta automáticamente los splits mirando el salto del spot por paridad de un día al
//    siguiente en las propias cadenas (nada externo, nada inventado).
// 2. Marca cada pata comprada cuyo intervalo entrada→vencimiento cruza un split.
// 3. Recalcula esas patas como es debido: 1 contrato viejo = r contratos nuevos de strike K/r,
//    o sea, valor a vencimiento = max(0, r·S − K) por contrato original.
// 4. Vuelve a correr FILTRO y CONTROL con y sin la corrección.

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const TDIR = "scripts/cache-theta";
const POR_TICKER = 500, N_TICKERS = 3;
const OTM_MIN = 60, DTE_MIN = 365, ASK_MIN = 0.10, SPREAD_MAX = 0.40;
const HAIRCUT = 0.97;   // el bid medido el día del vencimiento fue 0,96–0,99 del intrínseco
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
  cache.set(k, v); if (cache.size > 300) cache.delete(cache.keys().next().value);
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
const precio = (sym, dia) => {
  const b = closes(sym).get(dia);
  if (b != null) return b;
  const c = cadena(sym, dia);
  return c ? spotParidad(c) : null;
};

// ── 1) DETECTAR SPLITS: salto del precio de un día de datos al siguiente ────
console.log("=== 1) SPLITS DETECTADOS EN LOS PROPIOS DATOS (salto del precio día a día) ===");
const splits = new Map();   // sym -> [{dia, r}]
for (const [sym, dias] of diasPorSim) {
  const lista = [];
  let prev = null, prevDia = null;
  for (const d of dias) {
    const p = precio(sym, d);
    if (p == null || p <= 0) continue;
    if (prev != null) {
      const q = prev / p;                       // r = precio antes / precio después
      if (q > 1.6 || q < 0.62) {
        const cands = [2, 3, 4, 5, 6, 7, 10, 15, 20, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 8, 1 / 10, 1 / 20];
        let r = cands.reduce((a, b) => (Math.abs(b - q) < Math.abs(a - q) ? b : a));
        if (Math.abs(r - q) / q < 0.12) lista.push({ dia: d, r, obs: q, prevDia, antes: prev, despues: p });
      }
    }
    prev = p; prevDia = d;
  }
  if (lista.length) { splits.set(sym, lista); for (const s of lista) console.log(`   ${sym}  ${s.prevDia} → ${s.dia}   ${s.antes.toFixed(2)} → ${s.despues.toFixed(2)}   observado ${s.obs.toFixed(2)}  →  r = ${s.r === 0.125 ? "1:8 INVERSO" : s.r + ":1"}`); }
}
if (!splits.size) console.log("   ninguno");
const factor = (sym, d0, d1) => {   // producto de los splits en (d0, d1]
  let r = 1;
  for (const s of splits.get(sym) ?? []) if (s.dia > d0 && s.dia <= d1) r *= s.r;
  return r;
};

// ── 2) el motor, idéntico al del test, pero guardando lo necesario ──────────
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
      patas.push({ sym, dia, clave, exp, K, ask, valorTest: sl ? sl[0] : 0, dSal, presente: !!sl });
    }
  }
  return patas.length ? patas : null;
}

const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8")).filter((x) => x.gamLejos != null);
const porMes = new Map();
for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
const meses = [...porMes.keys()].sort();
const ultimoDiaDelMes = (sym, mes) => { const d = (diasPorSim.get(sym) ?? []).filter((x) => x.slice(0, 6) === mes); return d.length ? d[d.length - 1] : null; };

function correr(regla) {
  let semilla = 42;
  const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
  const out = [];
  for (const mes of meses) {
    const delMes = porMes.get(mes);
    let elegidos;
    if (regla === "azar") {
      const copia = [...delMes]; elegidos = [];
      for (let i = 0; i < N_TICKERS && copia.length; i++) elegidos.push(copia.splice(Math.floor(azar() * copia.length), 1)[0]);
    } else elegidos = [...delMes].sort((a, b) => b.gamLejos - a.gamLejos).slice(0, N_TICKERS);
    for (const e of elegidos) {
      const dia = ultimoDiaDelMes(e.ticker, mes); if (!dia) continue;
      const patas = cesta(e.ticker, dia); if (!patas) continue;
      let queda = POR_TICKER;
      for (const p of [...patas].sort((x, y) => x.ask - y.ask)) {
        const coste = p.ask * 100; if (coste > queda) continue; queda -= coste;
        const r = factor(p.sym, p.dia, p.dSal);
        const S = precio(p.sym, p.dSal);
        // valor CORREGIDO por split: 1 contrato viejo = r contratos nuevos de strike K/r
        const corregido = r === 1 ? p.valorTest
          : (S != null ? Math.max(0, r * S - p.K) * HAIRCUT : p.valorTest);
        out.push({ ...p, mes, coste, recTest: p.valorTest * 100, recCorr: corregido * 100, r, S });
      }
    }
  }
  return out;
}

const tot = (a, k) => a.reduce((s, x) => s + x[k], 0);
console.log("\n=== 2) EFECTO DE CORREGIR LOS SPLITS ===");
for (const regla of ["azar", "filtro"]) {
  const a = correr(regla);
  const cruzan = a.filter((x) => x.r !== 1);
  const i = tot(a, "coste");
  console.log(`\n   ── ${regla.toUpperCase()} ── ${a.length} patas · ${cruzan.length} cruzan un split (${((cruzan.length / a.length) * 100).toFixed(1)}%)`);
  console.log(`      TAL COMO ESTÁ:   $${Math.round(i).toLocaleString("es-ES")} → $${Math.round(tot(a, "recTest")).toLocaleString("es-ES")}  =  ${(tot(a, "recTest") / i).toFixed(2)}x`);
  console.log(`      CON SPLITS BIEN: $${Math.round(i).toLocaleString("es-ES")} → $${Math.round(tot(a, "recCorr")).toLocaleString("es-ES")}  =  ${(tot(a, "recCorr") / i).toFixed(2)}x`);
  const gT = a.filter((x) => x.recTest > x.coste).length, gC = a.filter((x) => x.recCorr > x.coste).length;
  console.log(`      aciertos: ${((gT / a.length) * 100).toFixed(0)}% → ${((gC / a.length) * 100).toFixed(0)}%`);
  const dif = cruzan.map((x) => ({ ...x, d: x.recCorr - x.recTest })).sort((p, q) => q.d - p.d);
  const sube = dif.filter((x) => x.d > 1).length, baja = dif.filter((x) => x.d < -1).length;
  console.log(`      de las que cruzan: ${sube} valían MÁS de lo contado · ${baja} valían MENOS · diferencia neta $${Math.round(tot(dif, "d")).toLocaleString("es-ES")}`);
  if (regla === "filtro") {
    console.log(`      las 8 peor contadas:`);
    for (const x of dif.slice(0, 8))
      console.log(`        ${x.sym} ${x.mes} venc ${x.exp} K=${x.K} · r=${x.r} · precio salida ${x.S?.toFixed(2)} · el test contó $${Math.round(x.recTest).toLocaleString("es-ES")} · valía $${Math.round(x.recCorr).toLocaleString("es-ES")}`);
    const falsos = dif.filter((x) => x.recTest > x.coste && x.recCorr <= x.coste);
    console.log(`      GANADORAS FALSAS (el test las dio ganadoras y con el split bien pierden): ${falsos.length} · recaudo falso $${Math.round(tot(falsos, "recTest")).toLocaleString("es-ES")}`);
    for (const x of falsos.slice(0, 10)) console.log(`        ${x.sym} ${x.mes} venc ${x.exp} K=${x.K} r=${x.r} · contó $${Math.round(x.recTest).toLocaleString("es-ES")} · vale $${Math.round(x.recCorr).toLocaleString("es-ES")}`);
  }
}
