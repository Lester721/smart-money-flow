// AUDITORÍA 5 — el veredicto.
//
// (1) Reproduce EXACTAMENTE el gamLejos guardado aplicando el desajuste de F  → prueba del bug
// (2) Cuenta cuántos contratos sobreviven al filtro de no-arbitraje en cada versión
// (3) Re-simula 2016-2020 con el gamLejos LIMPIO y lo somete al mismo test de permutación
//
// Uso: node --import tsx --max-old-space-size=8192 scripts/auditc-veredicto.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { impliedVol, bsGamma } from "../lib/blackScholes";

const CDIR = "scripts/cache-theta/cadenas", OIDIR = "scripts/cache-theta/oi-ancho";
const aMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
const cal = new Map();
for (const n of readdirSync(CDIR)) { const m = /^([A-Z]+)_d(\d{8})\.json$/.exec(n); if (!m) continue; let a = cal.get(m[1]); if (!a) cal.set(m[1], (a = [])); a.push(m[2]); }
for (const a of cal.values()) a.sort();
const leer = (dir, s, d) => { const r = `${dir}/${s}_d${d}.json`; return existsSync(r) ? JSON.parse(readFileSync(r, "utf8")) : null; };
const maxK = (c) => { let m = 0; for (const g of Object.values(c)) for (const k of Object.keys(g)) { const v = +k.slice(0, -2); if (v > m) m = v; } return m; };
const ultimoDelMes = (s, m) => { const a = (cal.get(s) || []).filter((d) => d.startsWith(m)); return a.length ? a[a.length - 1] : null; };

const splits = new Map();
for (const [sym, dias] of cal) {
  const sp = []; let prev = 0;
  for (const d of dias) { const c = leer(CDIR, sym, d); if (!c) continue; const mk = maxK(c); if (prev && mk > 0 && prev / mk >= 1.8) sp.push({ desde: d, ratio: prev / mk }); prev = mk; }
  splits.set(sym, sp);
}
const factor = (sym, d) => (splits.get(sym) || []).reduce((f, s) => (s.desde > d ? f * s.ratio : f), 1);

/** El cálculo TAL CUAL está en puente-se-veia-venir.mjs: K/F, sp/F, precio*F. */
function gamLejosComoEsta(sym, mes) {
  const d = ultimoDelMes(sym, mes); if (!d) return null;
  const c = leer(CDIR, sym, d), oi = leer(OIDIR, sym, d); if (!c || !oi) return null;
  const F = factor(sym, d);
  let spN = null, df = Infinity;
  for (const g of Object.values(c)) for (const k of Object.keys(g)) {
    if (!k.endsWith("|C")) continue; const K = +k.slice(0, -2), p = g[K + "|P"]; if (!p) continue;
    const cc = g[k], dd = Math.abs((cc[0] + cc[1]) / 2 - (p[0] + p[1]) / 2);
    if (dd < df) { df = dd; spN = K / F; }
  }
  if (!spN) return null;
  let g = 0, gl = 0, n = 0, descartados = 0;
  for (const [exp, grupo] of Object.entries(oi)) for (const [clave, q] of Object.entries(grupo)) {
    if (!clave.endsWith("|C")) continue;
    const K = +clave.slice(0, -2) / F, num = Number(q) || 0;
    if (!(K > 0) || !(num > 0)) continue;
    const ba = c?.[exp]?.[clave]; if (!ba || !(ba[0] > 0) || !(ba[1] > 0)) continue;
    const T = (aMs(exp) - aMs(d)) / (365 * 86400000); if (!(T > 0)) continue;
    const mid = ((ba[0] + ba[1]) / 2) * F;                        // ← el desajuste
    const iv = impliedVol(mid, spN, K, T, "call");
    if (!(iv > 0) || !Number.isFinite(iv)) { descartados++; continue; }
    const gm = bsGamma(spN, K, T, iv) * num * 100 * spN * spN;
    if (!Number.isFinite(gm)) { descartados++; continue; }
    g += gm; n++; if (K > spN * 1.6) gl += gm;
  }
  return g > 0 ? { v: gl / g, n, descartados, F } : null;
}

const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8")).filter((f) => f.gamLejos != null && f.mes >= "201601" && f.mes <= "202012");
console.log("══ (1) ¿REPRODUZCO EL VALOR GUARDADO APLICANDO EL DESAJUSTE? ══\n");
console.log("  acción mes     F   guardado  con-desajuste  contratos-que-sobreviven  contratos-descartados");
for (const f of [...filas].sort((a, b) => b.gamLejos - a.gamLejos).slice(0, 8).concat(filas.filter((x) => x.ticker === "AMD").slice(0, 2))) {
  const r = gamLejosComoEsta(f.ticker, f.mes);
  console.log(`  ${f.ticker.padEnd(5)} ${f.mes} ${String(r?.F.toFixed(0) ?? "?").padStart(3)}   ${f.gamLejos.toFixed(4)}     ${r ? r.v.toFixed(4) : "—"}` +
              `            ${String(r?.n ?? "—").padStart(5)}                  ${String(r?.descartados ?? "—").padStart(5)}`);
}

// ── (3) re-simulación con el gamLejos limpio ────────────────────────────────
const tabla = JSON.parse(readFileSync("scripts/auditc-cestas-2016-2020.json", "utf8"));
const limpio = new Map();
for (const r of JSON.parse(readFileSync("scripts/auditc-gamlejos-limpio.json", "utf8"))) if (r.gamLimpio != null) limpio.set(r.ticker + r.mes, r.gamLimpio);
const porMes = new Map();
for (const t of tabla) { let a = porMes.get(t.mes); if (!a) porMes.set(t.mes, (a = [])); a.push(t); }
const meses = [...porMes.keys()].sort();
const N = 3;
function evaluar(sel) { let inv = 0, rec = 0, n = 0, gan = 0; for (const m of meses) { for (const t of sel(porMes.get(m))) { inv += t.inv; rec += t.rec; n += t.n; gan += t.gan; } } return { inv, rec, n, gan, x: rec / inv }; }
let sem = 7; const rnd = () => { sem = (sem * 1103515245 + 12345) & 0x7fffffff; return sem / 0x7fffffff; };
const azar = (c) => { const k = [...c], o = []; for (let i = 0; i < N && k.length; i++) o.push(k.splice(Math.floor(rnd() * k.length), 1)[0]); return o; };
const topSucio = (c) => [...c].sort((a, b) => b.gam - a.gam).slice(0, N);
const topLimpio = (c) => [...c].filter((t) => limpio.has(t.ticker + t.mes)).sort((a, b) => limpio.get(b.ticker + b.mes) - limpio.get(a.ticker + a.mes)).slice(0, N);

console.log("\n══ (3) EL RESULTADO CON LA SEÑAL LIMPIA ══\n");
const xs = []; for (let i = 0; i < 2000; i++) xs.push(evaluar(azar).x); xs.sort((a, b) => a - b);
const q = (p) => xs[Math.min(xs.length - 1, Math.floor(xs.length * p))];
for (const [et, sel] of [["gamLejos GUARDADO (con el desajuste de F)", topSucio], ["gamLejos LIMPIO (mismas unidades)", topLimpio]]) {
  const r = evaluar(sel);
  const sup = xs.filter((v) => v >= r.x).length;
  console.log(`  ${et}`);
  console.log(`     ${r.n} patas · ganan ${((r.gan / r.n) * 100).toFixed(0)}% · $${Math.round(r.inv).toLocaleString("es-ES")} → $${Math.round(r.rec).toLocaleString("es-ES")} = ${r.x.toFixed(2)}x` +
              `   · percentil frente al azar: ${(100 - (sup / xs.length) * 100).toFixed(1)}  (p=${(sup / xs.length).toFixed(3)})`);
}
console.log(`  AZAR: p10 ${q(0.1).toFixed(2)}x · mediana ${q(0.5).toFixed(2)}x · p90 ${q(0.9).toFixed(2)}x · máx ${xs[xs.length - 1].toFixed(2)}x`);

// ── ¿el filtro sucio es sólo "va a hacer split"? ─────────────────────────────
console.log("\n══ (4) ¿EL FILTRO ES UN DETECTOR DE 'ESTA ACCIÓN SE PARTIRÁ EN EL FUTURO'? ══\n");
let conF = 0, total = 0, conFL = 0, totalL = 0;
for (const m of meses) {
  for (const t of topSucio(porMes.get(m))) { total++; if (factor(t.ticker, ultimoDelMes(t.ticker, t.mes) || "") > 1) conF++; }
  for (const t of topLimpio(porMes.get(m))) { totalL++; if (factor(t.ticker, ultimoDelMes(t.ticker, t.mes) || "") > 1) conFL++; }
}
console.log(`  elegidos por el filtro GUARDADO que tienen un split POSTERIOR: ${conF} de ${total} (${((conF / total) * 100).toFixed(0)}%)`);
console.log(`  elegidos por el filtro LIMPIO   que tienen un split POSTERIOR: ${conFL} de ${totalL} (${((conFL / totalL) * 100).toFixed(0)}%)`);
const universo = new Set(tabla.map((t) => t.ticker));
let uF = 0; for (const s of universo) if ((splits.get(s) || []).length) uF++;
console.log(`  en el universo: ${uF} de ${universo.size} acciones tienen algún split detectado (${((uF / universo.size) * 100).toFixed(0)}%)`);
