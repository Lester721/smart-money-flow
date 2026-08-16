// AUDITORÍA ADVERSARIA 2 (solo lectura) — mecánica del pareado y estabilidad por mes.
//
// Uso: node --max-old-space-size=6144 scripts/audit-eva-largo-mecanica.mjs
//
// 10. Prueba de signos por mes de entrada + quitar el mejor mes.
// 11. ASIMETRÍA DE AUSENTES. El medidor trata "contrato ausente en la cadena de salida" como
//     pérdida total (-100%). El contrato del flujo es, por construcción, uno que movió >= $3M:
//     es el más negociado de su cadena. Los del cubo de control son strikes cualesquiera con
//     prima parecida, muchos ilíquidos. Si los del cubo desaparecen MÁS a menudo que el del
//     flujo, la regla del -100% hunde al control y fabrica una diferencia positiva sin que nadie
//     haya elegido mejor contrato.

import { readFileSync } from "node:fs";

const filas = JSON.parse(readFileSync("scripts/eva-largo-filas.json", "utf8"));
const HORIZONTES = [30, 90, 180, 365];

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tCero = (v) => (v.length < 2 ? NaN : media(v) / (sd(v) / Math.sqrt(v.length)));
const pct = (x) => (Number.isFinite(x) ? `${x >= 0 ? "+" : "-"}${Math.abs(x * 100).toFixed(2)}%` : "  n/a");

// ── 10. PRUEBA DE SIGNOS POR MES ────────────────────────────────────────────
console.log("═══ 10 · ESTABILIDAD MES A MES (prueba de signos sobre el mes de entrada) ═══\n");
console.log("horiz  meses  positivos  negativos   media de medias mensuales   t entre meses   sin el mejor mes");
for (const H of HORIZONTES) {
  const g = new Map();
  for (const f of filas) { const m = f.h[H]; if (!m) continue; const k = f.dia.slice(0, 6); (g.get(k) ?? g.set(k, []).get(k)).push(m.d); }
  const meses = [...g].sort().map(([k, v]) => ({ k, n: v.length, d: media(v) }));
  const pos = meses.filter((m) => m.d > 0).length;
  const mejor = meses.reduce((a, b) => (b.d > a.d ? b : a));
  const sinMejor = meses.filter((m) => m.k !== mejor.k).map((m) => m.d);
  console.log(`${String(H).padStart(4)} d  ${String(meses.length).padStart(5)}  ${String(pos).padStart(9)}  ${String(meses.length - pos).padStart(9)}   ` +
    `${pct(media(meses.map((m) => m.d))).padStart(12)}   ${tCero(meses.map((m) => m.d)).toFixed(2).padStart(8)}      ` +
    `${pct(media(sinMejor))} (fuera ${mejor.k}, ${pct(mejor.d)})`);
}

// ── 11. ASIMETRÍA DE AUSENTES ───────────────────────────────────────────────
console.log("\n\n═══ 11 · ¿DESAPARECEN MÁS LOS DEL CUBO QUE EL DEL FLUJO? ═══\n");
console.log("horiz   n filas   ausente el del flujo   ausentes del cubo (medio)   RATIO cubo/flujo");
for (const H of HORIZONTES) {
  let n = 0, ausT = 0, sumaTasaC = 0, sumaC = 0, sumaN = 0;
  for (const f of filas) {
    const m = f.h[H]; if (!m) continue;
    n++; if (m.ausenteT) ausT++;
    sumaTasaC += m.ausentesC / m.n;
    sumaC += m.ausentesC; sumaN += m.n;
  }
  const tasaT = ausT / n, tasaC = sumaTasaC / n;
  console.log(`${String(H).padStart(4)} d ${String(n).padStart(8)}   ${(tasaT * 100).toFixed(2).padStart(18)}%   ${(tasaC * 100).toFixed(2).padStart(22)}%   ` +
    `${(tasaC / tasaT).toFixed(2).padStart(12)}x   (ponderado global cubo ${((sumaC / sumaN) * 100).toFixed(2)}%)`);
}

console.log("\n── La diferencia, quitando el efecto de los ausentes ──");
console.log("horiz  |  TODAS: n / dif / t  |  SOLO filas donde NADIE desapareció: n / dif / t  |  filas con algún ausente: n / dif / t");
for (const H of HORIZONTES) {
  const todas = [], limpias = [], sucias = [];
  for (const f of filas) {
    const m = f.h[H]; if (!m) continue;
    todas.push(m.d);
    if (!m.ausenteT && m.ausentesC === 0) limpias.push(m.d); else sucias.push(m.d);
  }
  console.log(`${String(H).padStart(4)} d | ${String(todas.length).padStart(6)} ${pct(media(todas)).padStart(8)} ${tCero(todas).toFixed(2).padStart(6)} | ` +
    `${String(limpias.length).padStart(6)} ${pct(media(limpias)).padStart(8)} ${tCero(limpias).toFixed(2).padStart(6)} | ` +
    `${String(sucias.length).padStart(6)} ${pct(media(sucias)).padStart(8)} ${tCero(sucias).toFixed(2).padStart(6)}`);
}

// Cuánto de la diferencia explica la asimetría, en aritmética directa:
// cada ausente del cubo aporta -100% a la media del cubo.
console.log("\n── Aritmética: cuánto de la DIFERENCIA cabe explicar por la asimetría de ausentes ──");
console.log("(un ausente vale -100%; si el cubo tiene tasa Tc y el flujo Tt, la diferencia mecánica");
console.log(" es aprox (Tc - Tt) x 100%, ANTES de que nadie elija mejor contrato)\n");
for (const H of HORIZONTES) {
  let n = 0, ausT = 0, sumaTasaC = 0, sumaD = 0;
  for (const f of filas) {
    const m = f.h[H]; if (!m) continue;
    n++; if (m.ausenteT) ausT++; sumaTasaC += m.ausentesC / m.n; sumaD += m.d;
  }
  const tasaT = ausT / n, tasaC = sumaTasaC / n, dif = sumaD / n;
  const mecanica = tasaC - tasaT;
  console.log(`${String(H).padStart(4)} d  diferencia observada ${pct(dif)}  ·  mecánica por ausentes ${pct(mecanica)}  ·  ` +
    `cubre el ${((mecanica / dif) * 100).toFixed(0)}% de la diferencia`);
}

// ── 12. ¿Y si el ausente del cubo NO se cuenta como -100% sino que se descarta? ──
// No se puede recalcular sin releer las cadenas (el fichero sólo guarda la media del cubo),
// así que se acota: media del cubo SIN los ausentes = (media*n + ausentes*1) / (n - ausentes)
// suponiendo que el ausente valía exactamente -100% (que es lo que el medidor le puso).
console.log("\n\n═══ 12 · COTA: la misma medida SIN la regla del -100% en el cubo ═══");
console.log("(se le devuelve al cubo lo que la regla le quitó: c* = (c*n + ausentes) / (n - ausentes).");
console.log(" NO es una re-medición, es despejar la aritmética que el propio fichero guarda)\n");
console.log("horiz  |  dif original / t  |  dif quitando los ausentes del cubo / t");
for (const H of HORIZONTES) {
  const orig = [], ajus = [];
  for (const f of filas) {
    const m = f.h[H]; if (!m) continue;
    orig.push(m.d);
    const vivos = m.n - m.ausentesC;
    if (vivos <= 0) continue;
    const cAjust = (m.c * m.n + m.ausentesC) / vivos;   // el ausente aportaba -1
    ajus.push(m.t - cAjust);
  }
  console.log(`${String(H).padStart(4)} d | ${String(orig.length).padStart(6)} ${pct(media(orig)).padStart(8)} ${tCero(orig).toFixed(2).padStart(6)} | ` +
    `${String(ajus.length).padStart(6)} ${pct(media(ajus)).padStart(8)} ${tCero(ajus).toFixed(2).padStart(6)}`);
}
