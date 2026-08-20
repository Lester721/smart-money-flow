// LA PRUEBA QUE DECIDE — ¿es la BANDA de cortes de term3m un efecto, o la encuentra cualquier señal?
//
// De dónde viene: el barrido fino separó a las cuatro señales de la familia VIX por cuántos cortes
// (de 19 probados, de q50 a q95) consiguen a la vez bajar la racha ≥25% y conservar ≥85% del ingreso:
//     term3m 10/19 · term9 3/19 · vix 1/19 · vvix 0/19
// term9 daba la mejor cifra suelta (racha −54%, p=0,02%) pero SÓLO en q65–q67,5: un pico estrecho
// elegido después de ver el resultado. term3m da menos por corte pero lo da en TODA una banda.
//
// ═══ EL PROBLEMA DE MEDIRLO ══════════════════════════════════════════════════════════════════
// "10 de 19 cortes funcionan" no es una prueba: los 19 cortes están anidados y son casi el mismo
// experimento, y el corte se eligió mirando. Hace falta la distribución NULA de ese mismo número.
//
// ═══ EL NULO CORRECTO: DESPLAZAMIENTO CIRCULAR ═══════════════════════════════════════════════
// Permutar la señal al azar la haría demasiado fácil de batir: destruiría su autocorrelación, y una
// señal sin memoria tira días sueltos y salteados, que es la peor manera posible de cortar una racha.
// El desplazamiento circular rota la serie de la señal contra la del P&L: conserva EXACTAMENTE su
// autocorrelación y su distribución, y sólo rompe el emparejamiento con la fecha. Es el nulo duro.
//
// p = fracción de los 400 desplazamientos que consiguen TANTOS cortes buenos como la señal de verdad.

import { readFileSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const VDIR = "scripts/cache-theta/vol-indices";
const DIAS_ANO = 252, WARMUP = 120, SHIFTS = 400;
const RED_MIN = 0.25, RET_MIN = 0.85;      // los dos listones de Lester: −25% de racha, 85% de ingreso
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pct = (x) => (x * 100).toFixed(1) + "%";

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
radiografia(filas, ["pl", "term3m", "term9", "vvix", "vix"], "banda", { maxCeros: 0.2 });

const CORTES = []; for (let q = 0.50; q <= 0.951; q += 0.025) CORTES.push(Math.round(q * 1000) / 1000);
const racha = (s) => { let c = 0, p = 0, d = 0; for (const x of s) { c += x; p = Math.max(p, c); d = Math.max(d, p - c); } return d; };

// rango percentil de cada día DENTRO DE SU PROPIO PASADO (una pasada; sirve para los 19 cortes)
function rangosExpansivos(sig) {
  const orden = [], rango = new Array(sig.length).fill(null);
  for (let i = 0; i < sig.length; i++) {
    const v = sig[i];
    if (v == null || !isFinite(v)) continue;
    if (orden.length >= WARMUP) {
      let lo = 0, hi = orden.length;                       // cuántos del pasado son < v
      while (lo < hi) { const m = (lo + hi) >> 1; if (orden[m] < v) lo = m + 1; else hi = m; }
      rango[i] = lo / orden.length;
    }
    let lo = 0, hi = orden.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (orden[m] < v) lo = m + 1; else hi = m; }
    orden.splice(lo, 0, v);
  }
  return rango;
}
// nº de cortes que cumplen los dos listones, para una serie de rangos dada
function cortesBuenos(rango, pl, iOp) {
  const plOP = pl.slice(iOp), rgOP = rango.slice(iOp);
  const ddB = racha(plOP), iB = plOP.reduce((a, b) => a + b, 0);
  if (!(ddB > 0) || !(iB > 0)) return { buenos: 0, detalle: [] };
  const detalle = [];
  let buenos = 0;
  for (const q of CORTES) {
    const s = plOP.map((x, i) => (rgOP[i] == null || rgOP[i] < q ? x : 0));
    const dd = racha(s), tot = s.reduce((a, b) => a + b, 0);
    const red = 1 - dd / ddB, ret = tot / iB;
    const ok = red >= RED_MIN && ret >= RET_MIN;
    if (ok) buenos++;
    detalle.push({ q, red, ret, ok, dd, anual: tot / (plOP.length / DIAS_ANO), fuera: rgOP.filter((r, i) => r != null && r >= q).length });
  }
  return { buenos, detalle, ddB, iBanual: iB / (plOP.length / DIAS_ANO) };
}

const pl = filas.map((f) => f.pl);

console.log("\n" + "=".repeat(104));
console.log("  ¿LA BANDA ES REAL? · nulo por desplazamiento circular (" + SHIFTS + " rotaciones) · listones: racha −" +
            pct(RED_MIN) + " y ingreso ≥ " + pct(RET_MIN) + " · " + CORTES.length + " cortes de q50 a q95");
console.log("=".repeat(104));
console.log("\n| señal | cortes buenos de " + CORTES.length + " | nulo: mediana | nulo: p90 | nulo: máx | p (rotaciones con ≥ los suyos) | veredicto |");
console.log("|---|---|---|---|---|---|---|");

const resumen = [];
for (const campo of ["term3m", "term9", "vix", "vvix"]) {
  const sig = filas.map((f) => f[campo]);
  let vistos = 0, iOp = filas.length;
  for (let i = 0; i < filas.length; i++) { if (sig[i] != null) vistos++; if (vistos >= WARMUP) { iOp = i + 1; break; } }
  const real = cortesBuenos(rangosExpansivos(sig), pl, iOp);

  const nulos = [];
  for (let s = 1; s <= SHIFTS; s++) {
    const k = Math.floor((s * filas.length) / (SHIFTS + 1));
    const rot = sig.map((_, i) => sig[(i + k) % sig.length]);
    nulos.push(cortesBuenos(rangosExpansivos(rot), pl, iOp).buenos);
  }
  nulos.sort((a, b) => a - b);
  const p = nulos.filter((x) => x >= real.buenos).length / SHIFTS;
  resumen.push({ campo, buenos: real.buenos, p, detalle: real.detalle, ddB: real.ddB, iBanual: real.iBanual });
  console.log("| `" + campo + "` | **" + real.buenos + "** | " + nulos[Math.floor(SHIFTS / 2)] + " | " + nulos[Math.floor(SHIFTS * 0.9)] +
    " | " + nulos[SHIFTS - 1] + " | **" + (p * 100).toFixed(2) + "%** | " +
    (p < 0.05 / 26 ? "🟢 pasa Bonferroni (26 pruebas)" : p < 0.05 ? "pasa al 5% pero NO Bonferroni" : "no se distingue del azar") + " |");
}

// ── la banda de term3m, corte a corte, con lo que Lester pidió ──────────────
const t3 = resumen.find((r) => r.campo === "term3m");
console.log("\n## LA BANDA DE `term3m` CORTE A CORTE — base: racha " + eur(t3.ddB) + " · ingreso " + eur(t3.iBanual) + "/año\n");
console.log("| corte | días fuera | ingreso/año | % retenido | racha | reducción | ¿cumple los dos listones? |");
console.log("|---|---|---|---|---|---|---|");
for (const d of t3.detalle)
  console.log("| q" + (d.q * 100).toFixed(1) + " | " + d.fuera + " | " + eur(d.anual) + " | " + pct(d.ret) + " | " + eur(d.dd) +
    " | " + pct(d.red) + " | " + (d.ok ? "🟢 sí" : "no") + " |");

const banda = t3.detalle.filter((d) => d.ok);
if (banda.length) {
  const medio = banda[Math.floor(banda.length / 2)];
  console.log("\nbanda que cumple: q" + (banda[0].q * 100).toFixed(1) + " → q" + (banda[banda.length - 1].q * 100).toFixed(1) +
    " · " + banda.length + " cortes · CORTE MEDIO DE LA BANDA = q" + (medio.q * 100).toFixed(1) +
    " (ese es el que se opera, no el mejor)");
  console.log("  con q" + (medio.q * 100).toFixed(1) + ": tira " + medio.fuera + " días · ingreso " + eur(medio.anual) + "/año (" +
    pct(medio.ret) + ") · racha " + eur(medio.dd) + " (" + pct(medio.red) + ")");
}

writeFileSync("scripts/cola-vix-banda-salida.json", JSON.stringify(resumen, null, 1), "utf8");
console.log("\n-> scripts/cola-vix-banda-salida.json");
