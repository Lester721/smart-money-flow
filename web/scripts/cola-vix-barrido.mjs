// ¿ES q67 UNA BANDA O UN PUNTO AFORTUNADO? — el barrido fino que decide.
//
// term9 q67 parte la racha por la mitad (p=0,02% contra el azar). Pero q80 y q90 no hacen NADA.
// Eso admite dos lecturas y sólo una permite operar:
//   · si funciona TODA una banda ancha de cortes (0,55–0,72), es un efecto y el corte es un detalle
//   · si funciona SÓLO 0,67, es un punto elegido a posteriori y no hay tal filtro
// Se barre el corte de 0,50 a 0,95 de 0,025 en 0,025, y el calentamiento en 60/120/180 días.
// Si la mejora es un pico estrecho, se dice que es un pico estrecho.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const VDIR = "scripts/cache-theta/vol-indices";
const DIAS_ANO = 252, PERMS = 2000;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pct = (x) => (x * 100).toFixed(1) + "%";
const perc = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
filas.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
const dias = new Set(filas.map((f) => f.fecha.replace(/-/g, "")));
const V = {};
for (const s of ["VIX", "VIX9D", "VIX3M", "VVIX"]) {
  const b = JSON.parse(readFileSync(VDIR + "/" + s + ".json", "utf8"));
  V[s] = Object.fromEntries(Object.entries(b).filter(([k]) => dias.has(k)));
}
const ant = (se, fe) => { const d = fe.replace(/-/g, ""), ks = Object.keys(se).filter((k) => k < d).sort(); return ks.length ? se[ks[ks.length - 1]] : null; };
for (const f of filas) {
  const v = ant(V.VIX, f.fecha), v9 = ant(V.VIX9D, f.fecha), v3 = ant(V.VIX3M, f.fecha);
  f.vix = v; f.term9 = v && v9 ? v9 / v : null; f.term3m = v && v3 ? v / v3 : null; f.vvix = ant(V.VVIX, f.fecha);
}
radiografia(filas, ["pl", "term9", "term3m", "vvix", "vix"], "barrido", { maxCeros: 0.2 });

const racha = (s) => { let c = 0, p = 0, d = 0; for (const x of s) { c += x; p = Math.max(p, c); d = Math.max(d, p - c); } return d; };

function correr(campo, q, warmup) {
  const hist = [], marca = new Map();
  for (const f of filas) {
    const v = f[campo]; let opera = true;
    if (v != null && isFinite(v) && hist.length >= warmup) { const s = [...hist].sort((a, b) => a - b); opera = v < s[Math.floor(s.length * q)]; }
    if (v != null && isFinite(v)) hist.push(v);
    marca.set(f.fecha, opera);
  }
  let vistos = 0, iOp = filas.length;
  for (let i = 0; i < filas.length; i++) { if (filas[i][campo] != null) vistos++; if (vistos >= warmup) { iOp = i + 1; break; } }
  const OP = filas.slice(iOp);
  const pls = OP.map((f) => (marca.get(f.fecha) ? f.pl : 0));
  const ddB = racha(OP.map((f) => f.pl)), ddF = racha(pls);
  const iB = OP.reduce((a, f) => a + f.pl, 0) / (OP.length / DIAS_ANO);
  const iF = pls.reduce((a, b) => a + b, 0) / (OP.length / DIAS_ANO);
  const fuera = OP.filter((f) => !marca.get(f.fecha)).length;
  return { OP, marca, ddB, ddF, iB, iF, fuera, red: 1 - ddF / ddB, ret: iF / iB, pls };
}

// p conjunto contra descartes aleatorios del mismo tamaño en el mismo período
function pAzar(r) {
  let seed = 20260819;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pl = r.OP.map((f) => f.pl), idx = pl.map((_, i) => i);
  let mejores = 0;
  for (let p = 0; p < PERMS; p++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const fu = new Set(idx.slice(0, r.fuera));
    const s = pl.map((x, i) => (fu.has(i) ? 0 : x));
    const dd = racha(s), an = s.reduce((a, b) => a + b, 0) / (pl.length / DIAS_ANO);
    if (an >= r.iF && dd <= r.ddF) mejores++;
  }
  return mejores / PERMS;
}

console.log("\n" + "=".repeat(100));
console.log("  BARRIDO FINO DEL CORTE · ¿banda ancha o pico estrecho?");
console.log("=".repeat(100));

const cortes = [];
for (let q = 0.50; q <= 0.951; q += 0.025) cortes.push(Math.round(q * 1000) / 1000);

for (const campo of ["term9", "term3m", "vvix", "vix"]) {
  console.log("\n## `" + campo + "` · calentamiento 120 días\n");
  console.log("| corte | días fuera | ingreso retenido | racha base | racha filtro | reducción racha | p vs azar |");
  console.log("|---|---|---|---|---|---|---|");
  let buenos = 0;
  for (const q of cortes) {
    const r = correr(campo, q, 120);
    const pv = pAzar(r);
    if (r.red >= 0.25 && r.ret >= 0.85) buenos++;
    console.log("| q" + (q * 100).toFixed(1) + " | " + r.fuera + " (" + pct(r.fuera / r.OP.length) + ") | " + pct(r.ret) +
      " | " + eur(r.ddB) + " | " + eur(r.ddF) + " | " + (r.red >= 0.25 && r.ret >= 0.85 ? "**" + pct(r.red) + "**" : pct(r.red)) +
      " | " + (pv * 100).toFixed(2) + "% |");
  }
  console.log("\ncortes que cumplen a la vez (racha −25% o más) Y (ingreso ≥ 85%): **" + buenos + " de " + cortes.length + "**");
}

console.log("\n## SENSIBILIDAD AL CALENTAMIENTO — `term9` q67\n");
console.log("| calentamiento | primer día operable | días | días fuera | ingreso retenido | racha base | racha filtro | reducción | p vs azar |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const w of [60, 90, 120, 150, 180, 250]) {
  const r = correr("term9", 2 / 3, w);
  console.log("| " + w + " | " + r.OP[0].fecha + " | " + r.OP.length + " | " + r.fuera + " | " + pct(r.ret) + " | " + eur(r.ddB) +
    " | " + eur(r.ddF) + " | " + pct(r.red) + " | " + (pAzar(r) * 100).toFixed(2) + "% |");
}

console.log("\n## Y CON UMBRAL FIJO, sin ventana ninguna (lo más simple de operar)\n");
console.log("| regla | días fuera | ingreso/año base | ingreso/año filtro | retenido | racha base | racha filtro | reducción | peor día |");
console.log("|---|---|---|---|---|---|---|---|---|");
const OPfull = filas.filter((f) => f.term9 != null);
const ddBase = racha(OPfull.map((f) => f.pl));
const iBase = OPfull.reduce((a, f) => a + f.pl, 0) / (OPfull.length / DIAS_ANO);
for (const u of [0.88, 0.90, 0.92, 0.94, 0.96, 1.0]) {
  const pls = OPfull.map((f) => (f.term9 < u ? f.pl : 0));
  const fuera = OPfull.filter((f) => !(f.term9 < u)).length;
  const op = pls.filter((x) => x !== 0);
  console.log("| operar sólo si VIX9D/VIX < " + u.toFixed(2) + " | " + fuera + " (" + pct(fuera / OPfull.length) + ") | " + eur(iBase) +
    " | " + eur(pls.reduce((a, b) => a + b, 0) / (OPfull.length / DIAS_ANO)) + " | " +
    pct(pls.reduce((a, b) => a + b, 0) / (iBase * OPfull.length / DIAS_ANO)) + " | " + eur(ddBase) + " | " + eur(racha(pls)) +
    " | " + pct(1 - racha(pls) / ddBase) + " | " + eur(Math.min(...op)) + " |");
}
