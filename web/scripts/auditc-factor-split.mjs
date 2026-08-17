// AUDITORÍA 4 — el gamLejos guardado NO es el que sale de aplicar su propia fórmula.
//
// Hipótesis: en puente-se-veia-venir.mjs el factor de split F se aplica AL REVÉS en el precio.
//   K  → K / F        (líneas 204)
//   sp → sp / F       (se guardó ya dividido)
//   mid→ mid * F      (línea 217)   ← el precio va multiplicado, no dividido
// Con F=40 (NVDA: 4:1 en 2021 y 10:1 en 2024) el precio queda 1.600 veces desencajado del strike,
// impliedVol revienta y sólo sobreviven los contratos baratísimos = los de MUY fuera del dinero.
// Resultado: gamLejos ≈ 1 exactamente en los símbolos que luego se partieron.
//
// Uso: node --import tsx --max-old-space-size=8192 scripts/auditc-factor-split.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { impliedVol, bsGamma } from "../lib/blackScholes";

const CDIR = "scripts/cache-theta/cadenas";
const OIDIR = "scripts/cache-theta/oi-ancho";
const aMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
const cal = new Map();
for (const n of readdirSync(CDIR)) {
  const m = /^([A-Z]+)_d(\d{8})\.json$/.exec(n); if (!m) continue;
  let a = cal.get(m[1]); if (!a) cal.set(m[1], (a = [])); a.push(m[2]);
}
for (const a of cal.values()) a.sort();
const leer = (dir, s, d) => { const r = `${dir}/${s}_d${d}.json`; return existsSync(r) ? JSON.parse(readFileSync(r, "utf8")) : null; };
const maxK = (c) => { let m = 0; for (const g of Object.values(c)) for (const k of Object.keys(g)) { const v = +k.slice(0, -2); if (v > m) m = v; } return m; };

// ── mismo detector de splits que usa puente-se-veia-venir.mjs ────────────────
console.log("══ SPLITS DETECTADOS (mismo criterio que el generador de señales) ══\n");
const splitsPorSim = new Map();
for (const [sym, dias] of cal) {
  const sp = []; let prev = 0;
  for (const d of dias) {
    const c = leer(CDIR, sym, d); if (!c) continue;
    const mk = maxK(c);
    if (prev && mk > 0 && prev / mk >= 1.8) sp.push({ desde: d, ratio: prev / mk });
    prev = mk;
  }
  splitsPorSim.set(sym, sp);
  if (sp.length) console.log(`  ${sym.padEnd(5)} ${sp.map((s) => `${s.desde}÷${s.ratio.toFixed(1)}`).join("  ")}`);
}
const factor = (sym, d) => (splitsPorSim.get(sym) || []).reduce((f, s) => (s.desde > d ? f * s.ratio : f), 1);

// ── comparar gamLejos guardado contra el recalculado con F=1 ─────────────────
const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8")).filter((f) => f.gamLejos != null);
const ultimoDelMes = (s, m) => { const a = (cal.get(s) || []).filter((d) => d.startsWith(m)); return a.length ? a[a.length - 1] : null; };
function spotDe(c) {
  let mj = null, df = Infinity;
  for (const g of Object.values(c)) for (const k of Object.keys(g)) {
    if (!k.endsWith("|C")) continue;
    const K = +k.slice(0, -2), p = g[K + "|P"]; if (!p) continue;
    const cc = g[k], d = Math.abs((cc[0] + cc[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < df) { df = d; mj = K; }
  }
  return mj;
}
/** gamLejos SIN el desajuste: todo en las mismas unidades (las del día). */
function gamLejosLimpio(sym, mes) {
  const d = ultimoDelMes(sym, mes); if (!d) return null;
  const c = leer(CDIR, sym, d), oi = leer(OIDIR, sym, d); if (!c || !oi) return null;
  const sp = spotDe(c); if (!sp) return null;
  let g = 0, gl = 0, n = 0;
  for (const [exp, grupo] of Object.entries(oi)) {
    for (const [clave, q] of Object.entries(grupo)) {
      if (!clave.endsWith("|C")) continue;
      const K = +clave.slice(0, -2), num = Number(q) || 0;
      if (!(K > 0) || !(num > 0)) continue;
      const ba = c?.[exp]?.[clave]; if (!ba || !(ba[0] > 0) || !(ba[1] > 0)) continue;
      const T = (aMs(exp) - aMs(d)) / (365 * 86400000); if (!(T > 0)) continue;
      const iv = impliedVol((ba[0] + ba[1]) / 2, sp, K, T, "call");
      if (!(iv > 0) || !Number.isFinite(iv)) continue;
      const gm = bsGamma(sp, K, T, iv) * num * 100 * sp * sp;
      if (!Number.isFinite(gm)) continue;
      g += gm; n++; if (K > sp * 1.6) gl += gm;
    }
  }
  return g > 0 ? { v: gl / g, n } : null;
}

console.log("\n══ gamLejos GUARDADO vs RECALCULADO EN UNIDADES COHERENTES ══\n");
console.log("  acción mes     F    guardado  recalculado  contratos");
const filas2020 = filas.filter((f) => f.mes >= "201601" && f.mes <= "202012");
const muestra = [...filas2020].sort((a, b) => b.gamLejos - a.gamLejos).slice(0, 10)
  .concat(filas2020.filter((f) => ["KO", "XOM", "JPM", "F", "BAC"].includes(f.ticker)).slice(0, 6));
for (const f of muestra) {
  const F = factor(f.ticker, ultimoDelMes(f.ticker, f.mes) || "");
  const r = gamLejosLimpio(f.ticker, f.mes);
  console.log(`  ${f.ticker.padEnd(5)} ${f.mes}  ${String(F.toFixed(0)).padStart(3)}   ${f.gamLejos.toFixed(4)}      ${r ? r.v.toFixed(4) : "—"}       ${r ? r.n : "—"}`);
}

// ── ¿el ranking del filtro cambia si se usa el gamLejos limpio? ──────────────
console.log("\n══ ¿A QUIÉN ELIGE EL FILTRO CON CADA VERSIÓN? (2016-2020) ══\n");
const limpio = new Map();
for (const f of filas2020) { const r = gamLejosLimpio(f.ticker, f.mes); if (r) limpio.set(f.ticker + f.mes, r.v); }
const porMes = new Map();
for (const f of filas2020) { let a = porMes.get(f.mes); if (!a) porMes.set(f.mes, (a = [])); a.push(f); }
const cA = new Map(), cB = new Map(), coincide = [];
for (const [mes, arr] of porMes) {
  const a = [...arr].sort((x, y) => y.gamLejos - x.gamLejos).slice(0, 3).map((x) => x.ticker);
  const conL = arr.filter((x) => limpio.has(x.ticker + x.mes));
  const b = [...conL].sort((x, y) => limpio.get(y.ticker + y.mes) - limpio.get(x.ticker + x.mes)).slice(0, 3).map((x) => x.ticker);
  for (const t of a) cA.set(t, (cA.get(t) || 0) + 1);
  for (const t of b) cB.set(t, (cB.get(t) || 0) + 1);
  coincide.push(a.filter((t) => b.includes(t)).length);
}
console.log("  GUARDADO (con el desajuste): " + [...cA].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}:${v}`).join("  "));
console.log("  LIMPIO   (unidades coherentes): " + [...cB].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}:${v}`).join("  "));
console.log(`  solapamiento medio de los tres elegidos: ${(coincide.reduce((a, b) => a + b, 0) / coincide.length).toFixed(2)} de 3`);

// escribir el gamLejos limpio para la re-simulación
const salida = filas2020.map((f) => ({ ticker: f.ticker, mes: f.mes, gamLimpio: limpio.get(f.ticker + f.mes) ?? null }));
readFileSync; // no-op
import("node:fs").then(({ writeFileSync }) => {
  writeFileSync("scripts/auditc-gamlejos-limpio.json", JSON.stringify(salida));
  console.log("\n  escrito scripts/auditc-gamlejos-limpio.json");
});
