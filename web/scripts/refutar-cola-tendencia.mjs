// REFUTACIÓN del hallazgo "cóndor por debajo de sus medias" (cola-tendencia-3-veredicto.mjs)
//
// Por defecto está MAL hasta que sobreviva. Se comprueba, en este orden:
//   0 · reconstrucción exacta de las filas (mismo lector que el script original)
//   1 · ¿mira al futuro?  → auditoría explícita de qué entra en la máscara
//   2 · NULO DE ROTACIÓN — la prueba que el script original NO hizo.
//       Se gira la máscara del filtro k días. Conserva EXACTAMENTE el nº de días operados y
//       la agrupación (rachas por debajo de la media), y destruye sólo la alineación con el P&L.
//       Si la caída baja igual con la máscara girada, la mejora es MECÁNICA (operar menos días
//       acorta el camino), no informativa.
//   3 · NULO DE DESCARTE ALEATORIO — mismo nº de días, sin agrupación.
//   4 · rejilla de parámetros (longitudes de media y umbral ±20% y más)
//   5 · quitar los 3 días que más aportan
//   6 · año a año
//   7 · A contra B: los 13 días que separan una regla de la otra

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const MALO = 2000;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pct = (x) => (x * 100).toFixed(1) + "%";
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
const desv = (v) => { const m = media(v); return Math.sqrt(media(v.map((x) => (x - m) ** 2)) * v.length / Math.max(1, v.length - 1)); };

// ═══ 0 · MISMO LECTOR QUE EL ORIGINAL ══════════════════════════════════════════════════════
const dias = [];
for (const y of [2023, 2024, 2025, 2026]) {
  const j = JSON.parse(readFileSync(`scripts/cache-theta/SPY_spotmin_y_${y}.json`, "utf8"));
  for (const [d, arr] of Object.entries(j)) {
    const m = new Map(arr.map(([mi, p]) => [mi, p]));
    const o = m.get(570), c = m.get(960), p11 = m.get(660);
    if (!(o > 0) || !(c > 0) || !(p11 > 0)) continue;
    dias.push({ fecha: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, c, p11 });
  }
}
dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
const idx = new Map(dias.map((d, i) => [d.fecha, i]));

const opsBase = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const filas = [];
for (const op of opsBase) {
  const i = idx.get(op.fecha);
  if (i === undefined || i < 200) continue;
  const cierres = dias.slice(i - 200, i).map((d) => d.c);   // SÓLO cierres ANTERIORES a D
  const ma = (k) => media(cierres.slice(-k));
  const f = { fecha: op.fecha, pl: op.pl, p11: dias[i].p11, cierres,
    mov: Math.abs(op.cierre - op.sp11), sigma: op.sigma };
  for (const k of [5, 10, 15, 16, 20, 24, 25, 30, 40, 50, 60, 75, 100, 150, 200]) f["d" + k] = dias[i].p11 / ma(k) - 1;
  filas.push(f);
}
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const N = filas.length, ANOS = N / 252;
radiografia(filas, ["pl", "d20", "d50", "d200", "mov", "sigma"], "refutación", { maxCeros: 0.2 });

const dd = (ops) => { let c = 0, p = 0, w = 0; for (const o of ops) { c += o.pl; if (c > p) p = c; if (c - p < w) w = c - p; } return w; };
function res(ops, anos = ANOS) {
  const pl = ops.map((o) => o.pl).sort((a, b) => a - b);
  const n5 = Math.max(1, Math.round(pl.length * 0.05));
  const tot = pl.reduce((a, x) => a + x, 0);
  return { n: ops.length, total: tot, ano: tot / anos,
    nMalo: pl.filter((x) => x <= -MALO).length, pMalo: pl.filter((x) => x <= -MALO).length / pl.length,
    es5: media(pl.slice(0, n5)), p5: pl[Math.floor(pl.length * 0.05)], p1: pl[Math.floor(pl.length * 0.01)],
    peor: pl[0], dd: dd(ops) };
}
const B = (f) => f.d20 >= 0 && f.d50 >= 0;
const A = (f) => f.d20 >= 0;
const BASE = res(filas);
const RB = res(filas.filter(B)), RA = res(filas.filter(A));

console.log("═".repeat(104));
console.log(`REFUTACIÓN · ${N} días · reconstrucción`);
console.log("═".repeat(104));
console.log("\n| serie | n | $/año | P(>-$2k) | ES5% | pct5 | pct1 | peor día | peor racha |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [n, r] of [["base", BASE], ["A (≥MA20)", RA], ["B (≥MA20 y ≥MA50)", RB]])
  console.log(`| ${n} | ${r.n} | ${eur(r.ano)} | ${pct(r.pMalo)} | ${eur(r.es5)} | ${eur(r.p5)} | ${eur(r.p1)} | ${eur(r.peor)} | ${eur(r.dd)} |`);

// ═══ 1 · AUDITORÍA DE FUTURO ═══════════════════════════════════════════════════════════════
// La máscara del día D usa: cierres de D−200…D−1 (pasado cerrado) y el precio de las 11:00 de D.
// Comprobación dura: recalcular d20 SIN el precio de las 11:00 (usando el cierre de D−1) y ver
// que el resultado no cambia de naturaleza; y comprobar que ningún cierre de D entra en la media.
{
  let peor = 0;
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i], j = idx.get(f.fecha);
    // el último cierre usado tiene que ser el de D−1
    const ultimoUsado = f.cierres[f.cierres.length - 1];
    if (Math.abs(ultimoUsado - dias[j - 1].c) > 1e-9) peor++;
  }
  console.log(`\n1 · FUTURO — filas cuya media incluye un cierre que no es de D−1 o anterior: ${peor}`);
  // variante conservadora: comparar el CIERRE DE AYER (no el spot de las 11:00) contra la media
  const B_ayer = (f) => { const c = f.cierres; return c[c.length - 1] / media(c.slice(-20)) - 1 >= 0 && c[c.length - 1] / media(c.slice(-50)) - 1 >= 0; };
  const r = res(filas.filter(B_ayer));
  console.log(`    variante 100% de AYER (cierre D−1 contra sus medias): n=${r.n} · ${eur(r.ano)}/año · P(>-2k)=${pct(r.pMalo)} · racha ${eur(r.dd)}`);
}

// ═══ 2 · NULO DE ROTACIÓN ══════════════════════════════════════════════════════════════════
function rotarNulo(fn, etiqueta) {
  const mask = filas.map(fn);
  const nOp = mask.filter(Boolean).length;
  const ddN = [], totN = [], pMaloN = [], es5N = [];
  const usados = [];
  for (let k = 1; k < N; k++) {
    if (k < 25 || k > N - 25) continue;          // se excluyen los giros pegados al original
    const s = filas.filter((_, i) => mask[(i + k) % N]);
    if (s.length < 50) continue;
    const r = res(s);
    ddN.push(Math.abs(r.dd)); totN.push(r.total); pMaloN.push(r.pMalo); es5N.push(r.es5);
    usados.push(k);
  }
  const real = res(filas.filter(fn));
  const q = (v, p) => [...v].sort((a, b) => a - b)[Math.floor(v.length * p)];
  const rank = (v, x, menorEsMejor) => (menorEsMejor ? v.filter((y) => y <= x).length : v.filter((y) => y >= x).length) / v.length;
  console.log(`\n2 · NULO DE ROTACIÓN — ${etiqueta} · ${ddN.length} giros · ${nOp} días operados en todos`);
  console.log("| métrica | real | mediana del nulo | 5% | 95% | p (fracción del nulo igual o mejor) |");
  console.log("|---|---|---|---|---|---|");
  console.log(`| peor racha (valor abs.) | ${eur(-Math.abs(real.dd))} | ${eur(-q(ddN, 0.5))} | ${eur(-q(ddN, 0.05))} | ${eur(-q(ddN, 0.95))} | **${rank(ddN, Math.abs(real.dd), true).toFixed(3)}** |`);
  console.log(`| P&L total | ${eur(real.total)} | ${eur(q(totN, 0.5))} | ${eur(q(totN, 0.05))} | ${eur(q(totN, 0.95))} | **${rank(totN, real.total, false).toFixed(3)}** |`);
  console.log(`| P(pérd>$2k) | ${pct(real.pMalo)} | ${pct(q(pMaloN, 0.5))} | ${pct(q(pMaloN, 0.05))} | ${pct(q(pMaloN, 0.95))} | **${rank(pMaloN, real.pMalo, true).toFixed(3)}** |`);
  console.log(`| déficit esperado 5% | ${eur(real.es5)} | ${eur(q(es5N, 0.5))} | ${eur(q(es5N, 0.05))} | ${eur(q(es5N, 0.95))} | **${rank(es5N, real.es5, false).toFixed(3)}** |`);
  return { real, ddN, totN, pMaloN, es5N };
}
console.log(`\n${"═".repeat(104)}`);
const rotB = rotarNulo(B, "regla B");
const rotA = rotarNulo(A, "regla A");

// ═══ 3 · NULO DE DESCARTE ALEATORIO (sin agrupación) ═══════════════════════════════════════
{
  let semilla = 42;
  const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
  const nOp = filas.filter(B).length;
  const ddN = [];
  for (let b = 0; b < 5000; b++) {
    const ordenados = filas.map((f, i) => ({ f, r: rnd(), i })).sort((a, b2) => a.r - b2.r).slice(0, nOp).sort((a, b2) => a.i - b2.i).map((x) => x.f);
    ddN.push(Math.abs(dd(ordenados)));
  }
  const q = (v, p) => [...v].sort((a, b2) => a - b2)[Math.floor(v.length * p)];
  const real = Math.abs(RB.dd);
  console.log(`\n3 · NULO DE DESCARTE ALEATORIO (${nOp} de ${N} días al azar, 5.000 series)`);
  console.log(`    peor racha real: ${eur(-real)} · nulo: mediana ${eur(-q(ddN, 0.5))} · 5–95% ${eur(-q(ddN, 0.05))} … ${eur(-q(ddN, 0.95))}`);
  console.log(`    p (nulo igual o mejor) = ${(ddN.filter((x) => x <= real).length / ddN.length).toFixed(4)}`);
  console.log(`    ► sólo por operar ${pct(nOp / N)} de los días, la caída ya baja de ${eur(BASE.dd)} a ${eur(-q(ddN, 0.5))} SIN NINGUNA SEÑAL.`);
}

// ═══ 4 · REJILLA DE PARÁMETROS ═════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("4 · REJILLA — pares de medias y umbral. ¿Es (20,50) en cero, o vale cualquier cosa?");
console.log("═".repeat(104));
console.log("\n| par de medias | umbral | n | $/año | P(>-$2k) | ES5% | peor racha | Δracha vs base |");
console.log("|---|---|---|---|---|---|---|---|");
const pares = [[16, 40], [20, 50], [24, 60], [10, 25], [15, 40], [25, 60], [30, 75], [40, 100], [20, 100], [50, 200], [10, 50], [5, 20]];
const rejilla = [];
for (const [a, b] of pares) {
  for (const u of [-0.004, -0.002, 0, 0.002, 0.004]) {
    const fn = (f) => f["d" + a] >= u && f["d" + b] >= u;
    const r = res(filas.filter(fn));
    rejilla.push({ a, b, u, ...r });
    if (u === 0 || (a === 20 && b === 50)) console.log(`| ${a}/${b} | ${(u * 100).toFixed(1)}% | ${r.n} | ${eur(r.ano)} | ${pct(r.pMalo)} | ${eur(r.es5)} | ${eur(r.dd)} | ${eur(Math.abs(BASE.dd) - Math.abs(r.dd))} |`);
  }
}
const mejorRacha = [...rejilla].sort((x, y) => Math.abs(x.dd) - Math.abs(y.dd));
console.log(`\n    De las ${rejilla.length} combinaciones de la rejilla:`);
console.log(`      · la MEJOR racha es ${eur(mejorRacha[0].dd)} con ${mejorRacha[0].a}/${mejorRacha[0].b} y umbral ${(mejorRacha[0].u * 100).toFixed(1)}%`);
console.log(`      · (20,50) en cero ocupa el puesto ${mejorRacha.findIndex((r) => r.a === 20 && r.b === 50 && r.u === 0) + 1} de ${rejilla.length}`);
console.log(`      · rachas: mediana ${eur(-[...rejilla].map((r) => Math.abs(r.dd)).sort((a, b) => a - b)[Math.floor(rejilla.length / 2)])} · peor ${eur(mejorRacha[mejorRacha.length - 1].dd)}`);
console.log(`      · combinaciones con racha PEOR que la base: ${rejilla.filter((r) => Math.abs(r.dd) > Math.abs(BASE.dd)).length}`);
console.log(`      · combinaciones con P(>-$2k) por debajo del 4%: ${rejilla.filter((r) => r.pMalo < 0.04).length} de ${rejilla.length}`);
console.log(`      · combinaciones que retienen ≥95% del ingreso: ${rejilla.filter((r) => r.total >= 0.95 * BASE.total).length} de ${rejilla.length}`);

// ═══ 5 · QUITAR LOS 3 DÍAS QUE MÁS APORTAN ═════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("5 · QUITAR LOS 3 DÍAS QUE MÁS APORTAN A LA MEJORA");
console.log("═".repeat(104));
{
  const saltados = filas.filter((f) => !B(f)).sort((a, b) => a.pl - b.pl);
  console.log(`\n    Los 6 peores días que el filtro SALTA: ${saltados.slice(0, 6).map((f) => `${f.fecha} ${eur(f.pl)}`).join(" · ")}`);
  const fuera = new Set(saltados.slice(0, 3).map((f) => f.fecha));
  const sub = filas.filter((f) => !fuera.has(f.fecha));
  const anos2 = sub.length / 252;
  const b2 = res(sub, anos2), f2 = res(sub.filter(B), anos2);
  console.log(`\n    Sin esos 3 días (quedan ${sub.length}):`);
  console.log(`      base:   ${eur(b2.ano)}/año · P(>-2k)=${pct(b2.pMalo)} · ES5 ${eur(b2.es5)} · racha ${eur(b2.dd)}`);
  console.log(`      regla B: ${eur(f2.ano)}/año · P(>-2k)=${pct(f2.pMalo)} · ES5 ${eur(f2.es5)} · racha ${eur(f2.dd)}`);
  console.log(`      mejora de la racha: ${eur(Math.abs(b2.dd) - Math.abs(f2.dd))}  (con los 3 días dentro era ${eur(Math.abs(BASE.dd) - Math.abs(RB.dd))})`);
  const p = (b2.nMalo) / sub.length;
  const dEn = sub.filter(B), fu = sub.filter((f) => !B(f));
  const k1 = fu.filter((x) => x.pl <= -MALO).length, k2 = dEn.filter((x) => x.pl <= -MALO).length;
  const se = Math.sqrt(p * (1 - p) * (1 / fu.length + 1 / dEn.length));
  console.log(`      z de la tasa de días malos sin esos 3: ${((k1 / fu.length - k2 / dEn.length) / se).toFixed(2)}`);
}

// ═══ 6 · AÑO A AÑO ═════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("6 · AÑO A AÑO");
console.log("═".repeat(104));
console.log("\n| año | días | base $/año | B $/año | base racha | B racha | base P(>-2k) | B P(>-2k) | base ES5 | B ES5 |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const y of ["2024", "2025", "2026"]) {
  const g = filas.filter((f) => f.fecha.startsWith(y));
  const an = g.length / 252;
  const rb = res(g, an), rf = res(g.filter(B), an);
  console.log(`| ${y} | ${g.length} | ${eur(rb.ano)} | ${eur(rf.ano)} | ${eur(rb.dd)} | ${eur(rf.dd)} | ${pct(rb.pMalo)} | ${pct(rf.pMalo)} | ${eur(rb.es5)} | ${eur(rf.es5)} |`);
}

// ═══ 7 · A CONTRA B — los 13 días ══════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("7 · DE DÓNDE SALE LA DIFERENCIA ENTRE A (racha −$12.312) Y B (racha −$7.829)");
console.log("═".repeat(104));
{
  const soloA = filas.filter((f) => A(f) && !B(f));
  console.log(`\n    Días que A opera y B no: ${soloA.length}. P&L total: ${eur(soloA.reduce((a, f) => a + f.pl, 0))}`);
  console.log(`    ${soloA.map((f) => `${f.fecha} ${eur(f.pl)}`).join(" · ")}`);
  // ¿la racha de A cae dentro de qué ventana?
  const trace = (ops) => { let c = 0, p = 0, w = 0, ini = null, iniW = null, finW = null, pi = 0; ops.forEach((o, i) => { c += o.pl; if (c > p) { p = c; pi = i; } if (c - p < w) { w = c - p; iniW = ops[pi].fecha; finW = o.fecha; } }); return { w, iniW, finW }; };
  for (const [n, fn] of [["base", () => true], ["A", A], ["B", B]]) {
    const t = trace(filas.filter(fn));
    console.log(`    peor racha ${n}: ${eur(t.w)} entre ${t.iniW} y ${t.finW}`);
  }
}

// ═══ 8 · ¿EL INGRESO SE CONSERVA DE VERDAD? ════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("8 · EL INGRESO — ¿105,8% es una señal o es ruido?");
console.log("═".repeat(104));
{
  const dEn = filas.filter(B).map((f) => f.pl), fu = filas.filter((f) => !B(f)).map((f) => f.pl);
  const t = (media(dEn) - media(fu)) / Math.sqrt(desv(dEn) ** 2 / dEn.length + desv(fu) ** 2 / fu.length);
  console.log(`\n    media dentro ${eur(media(dEn))} (n=${dEn.length}) · fuera ${eur(media(fu))} (n=${fu.length}) · t = ${t.toFixed(2)} · listón(56) = ${listonT(56)}`);
  console.log(`    ► ${Math.abs(t) >= listonT(56) ? "pasa" : "NO pasa"} el listón. El propio remuestreo del autor da 52,9% de series con más ingreso: una moneda.`);
}
console.log(`\n    Métrica que decide: $/año retenidos por cada dólar de caída eliminado`);
console.log(`      regla B: se retienen ${eur(RB.ano)}/año (base ${eur(BASE.ano)}) y se elimina ${eur(Math.abs(BASE.dd) - Math.abs(RB.dd))} de caída.`);
console.log(`      nulo de rotación (mediana): se retendrían ${eur(media(rotB.totN) / ANOS)}/año eliminando ${eur(Math.abs(BASE.dd) - media(rotB.ddN))} de caída.`);
