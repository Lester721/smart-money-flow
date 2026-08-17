// AUDITORÍA 3 — ¿qué mide gamLejos de verdad, y eran operables los ganadores?
//
// (a) descompone gamC / gamLejosC: cuántos contratos entran en cada uno
// (b) interés abierto REAL de los contratos que producen el dinero
// (c) ¿gamLejos es sólo "acción que se ha desplomado desde un máximo reciente"?
//
// Uso: node --max-old-space-size=8192 scripts/auditc-gamma-y-liquidez.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { impliedVol, bsGamma } from "../lib/blackScholes";

const CDIR = "scripts/cache-theta/cadenas";
const OIDIR = "scripts/cache-theta/oi-ancho";
const aMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));

const cal = new Map();
for (const n of readdirSync(CDIR)) {
  const m = /^([A-Z]+)_d(\d{8})\.json$/.exec(n);
  if (!m) continue;
  let a = cal.get(m[1]); if (!a) cal.set(m[1], (a = []));
  a.push(m[2]);
}
for (const a of cal.values()) a.sort();
const leer = (dir, s, d) => { const r = `${dir}/${s}_d${d}.json`; return existsSync(r) ? JSON.parse(readFileSync(r, "utf8")) : null; };
function spot(c) {
  let mj = null, df = Infinity;
  for (const g of Object.values(c)) for (const k of Object.keys(g)) {
    if (!k.endsWith("|C")) continue;
    const K = +k.slice(0, -2), p = g[K + "|P"]; if (!p) continue;
    const cc = g[k], d = Math.abs((cc[0] + cc[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < df) { df = d; mj = K; }
  }
  return mj;
}
const ultimoDelMes = (s, m) => { const a = (cal.get(s) || []).filter((d) => d.startsWith(m)); return a.length ? a[a.length - 1] : null; };

// ── (a) descomposición de la gamma ───────────────────────────────────────────
console.log("══ (a) DE QUÉ ESTÁ HECHO gamLejos ══\n");
console.log("  acción  mes     spot   contratos-en-gamC  de-ellos-lejos   gamC($)      gamLejos");
for (const [sym, mes] of [["NVDA", "201810"], ["NVDA", "201811"], ["NVDA", "201812"], ["NVDA", "201906"],
                          ["TSLA", "202002"], ["TSLA", "201905"], ["NVDA", "201905"], ["AAPL", "201601"], ["MSFT", "201906"]]) {
  const d = ultimoDelMes(sym, mes); if (!d) continue;
  const c = leer(CDIR, sym, d), oi = leer(OIDIR, sym, d);
  if (!c || !oi) { console.log(`  ${sym} ${mes}  SIN DATO`); continue; }
  const sp = spot(c);
  let gam = 0, gamL = 0, n = 0, nL = 0, oiTot = 0, oiLejos = 0;
  for (const [exp, g] of Object.entries(oi)) {
    for (const [clave, q] of Object.entries(g)) {
      if (!clave.endsWith("|C")) continue;
      const K = +clave.slice(0, -2), num = Number(q) || 0;
      if (!(K > 0) || !(num > 0)) continue;
      oiTot += num; if (K > sp * 1.6) oiLejos += num;
      const ba = c?.[exp]?.[clave];
      if (!ba || !(ba[0] > 0) || !(ba[1] > 0)) continue;
      const T = (aMs(exp) - aMs(d)) / (365 * 86400000); if (!(T > 0)) continue;
      const iv = impliedVol((ba[0] + ba[1]) / 2, sp, K, T, "call");
      if (!(iv > 0) || !Number.isFinite(iv)) continue;
      const gm = bsGamma(sp, K, T, iv) * num * 100 * sp * sp;
      if (!Number.isFinite(gm)) continue;
      gam += gm; n++;
      if (K > sp * 1.6) { gamL += gm; nL++; }
    }
  }
  console.log(`  ${sym.padEnd(6)} ${mes}  ${String(sp).padStart(6)}   ${String(n).padStart(6)}            ${String(nL).padStart(6)}        ` +
              `${gam.toExponential(2).padStart(10)}    ${(gam ? gamL / gam : 0).toFixed(4)}` +
              `   · OI calls ${oiTot} de los cuales lejos ${oiLejos} (${((oiLejos / oiTot) * 100).toFixed(0)}%)`);
}

// ── (b) liquidez de los contratos ganadores ──────────────────────────────────
console.log("\n══ (b) INTERÉS ABIERTO DE LOS CONTRATOS QUE PRODUCEN EL DINERO ══\n");
const objetivo = [["TSLA", "201905", "20200619", 580], ["TSLA", "201905", "20200619", 590], ["TSLA", "201904", "20200619", 600],
                  ["TSLA", "201905", "20200619", 600], ["TSLA", "201903", "20200619", 680], ["TSLA", "201902", "20200619", 690],
                  ["NVDA", "201907", "20210115", 315], ["TSLA", "201907", "20210115", 620]];
console.log("  acción mes    venc      K     OI-entrada  bid/ask-entrada   OI-salida  bid-salida");
for (const [sym, mes, exp, K] of objetivo) {
  const d = ultimoDelMes(sym, mes);
  const c = leer(CDIR, sym, d), oi = leer(OIDIR, sym, d);
  const clave = `${K}|C`;
  const ba = c?.[exp]?.[clave];
  const q = oi?.[exp]?.[clave];
  const dias = cal.get(sym) || [];
  let ds = null; for (const x of dias) if (x <= exp) ds = x;
  const cs = leer(CDIR, sym, ds), ois = leer(OIDIR, sym, ds);
  const bas = cs?.[exp]?.[clave], qs = ois?.[exp]?.[clave];
  console.log(`  ${sym.padEnd(5)} ${mes} ${exp} ${String(K).padStart(5)}   ${String(q ?? "—").padStart(8)}   ` +
              `${ba ? ba[0] + "/" + ba[1] : "—"}`.padEnd(20) + `${String(qs ?? "—").padStart(8)}   ${bas ? bas[0] : "—"}`);
}

// ── (c) ¿gamLejos = caída desde el máximo reciente? ──────────────────────────
console.log("\n══ (c) ¿gamLejos ES OTRA COSA? correlación con la caída desde el máximo de 12 meses ══\n");
const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8"))
  .filter((f) => f.gamLejos != null && f.mes >= "201601" && f.mes <= "202012");
const spotCache = new Map();
function spotMes(sym, mes) {
  const k = sym + mes; if (spotCache.has(k)) return spotCache.get(k);
  const d = ultimoDelMes(sym, mes); const c = d ? leer(CDIR, sym, d) : null;
  const v = c ? spot(c) : null; spotCache.set(k, v); return v;
}
const mesesAtras = (m, k) => { let y = +m.slice(0, 4), mm = +m.slice(4, 6) - k; while (mm < 1) { mm += 12; y--; } return `${y}${String(mm).padStart(2, "0")}`; };
const pares = [];
for (const f of filas) {
  const sp = spotMes(f.ticker, f.mes); if (!sp) continue;
  let mx = sp;
  for (let k = 1; k <= 12; k++) { const s = spotMes(f.ticker, mesesAtras(f.mes, k)); if (s && s > mx) mx = s; }
  pares.push({ gam: f.gamLejos, caida: 1 - sp / mx, sp, mx, ticker: f.ticker, mes: f.mes, barata: f.barata });
}
function rho(a, b) {
  const r = (v) => { const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const o = new Array(v.length); idx.forEach(([, i], j) => (o[i] = j)); return o; };
  const x = r(a), y = r(b), n = a.length;
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxy / Math.sqrt(sxx * syy);
}
console.log(`  n = ${pares.length}`);
console.log(`  Spearman gamLejos vs caída-desde-máximo-12m : ${rho(pares.map((p) => p.gam), pares.map((p) => p.caida)).toFixed(3)}`);
console.log(`  Spearman gamLejos vs 'barata' (prima/precio): ${rho(pares.filter((p) => p.barata != null).map((p) => p.gam), pares.filter((p) => p.barata != null).map((p) => p.barata)).toFixed(3)}`);
const alto = pares.filter((p) => p.gam > 0.5), bajo = pares.filter((p) => p.gam <= 0.5);
const med = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
console.log(`  caída mediana desde el máximo · gamLejos>0,5: ${(med(alto.map((p) => p.caida)) * 100).toFixed(1)}%  ·  resto: ${(med(bajo.map((p) => p.caida)) * 100).toFixed(1)}%`);
console.log(`\n  las 12 filas con más gamLejos, con su caída desde el máximo de 12 meses:`);
for (const p of [...pares].sort((a, b) => b.gam - a.gam).slice(0, 12))
  console.log(`   ${p.ticker.padEnd(5)} ${p.mes}  gam ${p.gam.toFixed(3)}  precio ${String(p.sp).padStart(6)}  máx12m ${String(p.mx).padStart(6)}  caída ${(p.caida * 100).toFixed(0)}%`);
