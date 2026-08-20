// EL RETRATO DE UN DÍA MALO · 1.121 días (2022-01 → 2026-08), cóndor 0DTE SPXW ±25/alas 50.
//
// ═══ LO QUE SE DECLARA ANTES DE MIRAR ════════════════════════════════════════════════════════
// Los peldaños del daño NO se eligen mirando el resultado. Se definen por la ESTRUCTURA de la
// posición: cuántos puntos pasa el cierre del strike vendido, medido en fracciones del ala.
//   PLENO  penetración = 0            → se cobra el crédito entero
//   ROZADO 0 < p ≤ 1/4 del ala        (≤12,5 pts)
//   MEDIO  1/4 < p < ala entera
//   TOPE   p ≥ el ala entera          → pérdida máxima, no hay nada peor
// PRUEBAS FORMALES DECLARADAS: 24 (comparaciones de perfil entre los dos períodos). listonT(24).
//
// Nada de aquí decide una entrada: es el desenlace, y sólo explica.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT, tWelch } from "../lib/barreraHallazgos";

const PRUEBAS = 24;
const LISTON = listonT(PRUEBAS);
const CUENTA = 56389;

const dias = JSON.parse(readFileSync("scripts/mal-dias.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const n1 = (x) => (x == null || !isFinite(x) ? "—" : x.toFixed(1));
const n2 = (x) => (x == null || !isFinite(x) ? "—" : x.toFixed(2));

// ── campos derivados ─────────────────────────────────────────────────────────
for (let i = 0; i < dias.length; i++) {
  const d = dias[i], ant = dias[i - 1];
  d.anchoC = d.kcL - d.kcC;
  d.anchoP = d.kpC - d.kpL;
  d.penC = Math.min(Math.max(d.cierre - d.kcC, 0), d.anchoC);
  d.penP = Math.min(Math.max(d.kpC - d.cierre, 0), d.anchoP);
  d.pen = Math.max(d.penC, d.penP);
  d.ancho = d.penC > 0 ? d.anchoC : d.anchoP;
  d.lado = d.penC > 0 ? "CALL" : d.penP > 0 ? "PUT" : "—";
  d.tope = (d.penC >= d.anchoC - 0.001) || (d.penP >= d.anchoP - 0.001) ? 1 : 0;
  d.peldano = d.pen === 0 ? "PLENO" : d.tope ? "TOPE" : d.pen <= d.ancho / 4 ? "ROZADO" : "MEDIO";

  // el camino DE LA TARDE (después de las 11:00)
  const i11 = d.h.indexOf("11:00");
  const tarde = d.s.slice(i11);
  const hTarde = d.h.slice(i11);
  d.tardePts = d.cierre - d.sp11;
  d.tardeAbs = Math.abs(d.tardePts);
  d.tardeSig = d.sigma ? d.tardeAbs / d.sigma : null;
  // excursión adversa máxima: lo más lejos que se metió DENTRO de un ala en toda la tarde
  let mae = 0, hCruce = null, maeSigno = 0;
  for (let j = 0; j < tarde.length; j++) {
    const pc = Math.max(tarde[j] - d.kcC, 0), pp = Math.max(d.kpC - tarde[j], 0);
    const p = Math.max(pc, pp);
    if (p > mae) { mae = p; maeSigno = pc > pp ? 1 : -1; }
    if (p > 0 && hCruce === null) hCruce = hTarde[j];
  }
  d.mae = Math.min(mae, d.ancho);
  d.maeSigno = maeSigno;
  d.hCruce = hCruce;
  d.recupero = mae > 0 && d.pen === 0 ? 1 : 0;         // cruzó y volvió a casa
  // morfología de la MAÑANA (observable a las 11:00)
  d.movManana = (d.sp11 / d.ap - 1) * 100;
  d.movMananaAbs = Math.abs(d.movManana);
  d.rangoMananaPts = d.maxM - d.minM;
  d.hueco = ant ? (d.ap / ant.cierre - 1) * 100 : null;
  // ESTRUCTURA: qué % del índice son los 25 puntos fijos, y cuántas sigmas
  d.sepPct = (25 / d.sp11) * 100;
  d.sigmaRatio = d.sigma ? 25 / d.sigma : null;
  d.ivPct = d.iv != null ? d.iv * 100 : null;
  d.per = d.fecha < "2024-01-01" ? "2022-23" : "2024-26";
  d.ano = d.fecha.slice(0, 4);
}
radiografia(dias, ["pl", "credito", "sp11", "cierre", "sigma", "sepPct", "tardeAbs", "movMananaAbs"], "1.121 dias del condor", { maxCeros: 0.2 });

const A = dias.filter((d) => d.per === "2022-23");
const B = dias.filter((d) => d.per === "2024-26");
const anos = { "2022-23": A.length / 252, "2024-26": B.length / 252 };

console.log(`\n====== 0 · LA CAJA · ${dias.length} días · listón t = ${LISTON} (Bonferroni, ${PRUEBAS} pruebas) ======\n`);
console.log("| período | días | años | P&L total | $/año | media/día | % ganados | peor día | p1 | p5 | peor racha |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const [nom, g] of [["2022-23", A], ["2024-26", B], ["TODO", dias]]) {
  const pl = g.map((x) => x.pl), tot = pl.reduce((a, b) => a + b, 0);
  let acc = 0, pico = 0, dd = 0;
  for (const p of pl) { acc += p; if (acc > pico) pico = acc; if (acc - pico < dd) dd = acc - pico; }
  console.log(`| ${nom} | ${g.length} | ${n1(g.length / 252)} | ${eur(tot)} | ${eur(tot / (g.length / 252))} | ${eur(tot / g.length)} | ${((pl.filter((x) => x > 0).length / pl.length) * 100).toFixed(0)}% | ${eur(Math.min(...pl))} | ${eur(pct(pl, 0.01))} | ${eur(pct(pl, 0.05))} | ${eur(dd)} |`);
}

console.log(`\n====== 1 · CUÁNTOS TOCAN EL TOPE Y CUÁNTO PESAN DEL DAÑO ======\n`);
console.log("| período | días | PLENO | ROZADO | MEDIO | TOPE | daño total | daño del TOPE | % del daño | ingreso bruto |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const [nom, g] of [["2022-23", A], ["2024-26", B], ["TODO", dias]]) {
  const c = (p) => g.filter((x) => x.peldano === p).length;
  const dano = g.filter((x) => x.pl < 0).reduce((a, x) => a + x.pl, 0);
  const danoTope = g.filter((x) => x.tope).reduce((a, x) => a + x.pl, 0);
  const bruto = g.filter((x) => x.pl > 0).reduce((a, x) => a + x.pl, 0);
  console.log(`| ${nom} | ${g.length} | ${c("PLENO")} (${((c("PLENO") / g.length) * 100).toFixed(0)}%) | ${c("ROZADO")} | ${c("MEDIO")} | **${c("TOPE")}** (${((c("TOPE") / g.length) * 100).toFixed(1)}%) | ${eur(dano)} | ${eur(danoTope)} | **${((danoTope / dano) * 100).toFixed(0)}%** | ${eur(bruto)} |`);
}
console.log("\n  -- el daño por peldaño, en dólares y por año --");
console.log("| peldaño | 2022-23 n | 2022-23 $/año | 2024-26 n | 2024-26 $/año | media $/día del peldaño |");
console.log("|---|---|---|---|---|---|");
for (const p of ["PLENO", "ROZADO", "MEDIO", "TOPE"]) {
  const a = A.filter((x) => x.peldano === p), b = B.filter((x) => x.peldano === p);
  const g = dias.filter((x) => x.peldano === p);
  console.log(`| ${p} | ${a.length} | ${eur(a.reduce((s, x) => s + x.pl, 0) / anos["2022-23"])} | ${b.length} | ${eur(b.reduce((s, x) => s + x.pl, 0) / anos["2024-26"])} | ${eur(media(g.map((x) => x.pl)))} |`);
}

console.log(`\n====== 2 · EL REPARTO CALL / PUT ======\n`);
console.log("| período | días con penetración | lado CALL | lado PUT | daño CALL | daño PUT | % daño CALL | TOPE call | TOPE put |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [nom, g] of [["2022", dias.filter((d) => d.ano === "2022")], ["2023", dias.filter((d) => d.ano === "2023")],
                        ["2024", dias.filter((d) => d.ano === "2024")], ["2025", dias.filter((d) => d.ano === "2025")],
                        ["2026", dias.filter((d) => d.ano === "2026")],
                        ["2022-23", A], ["2024-26", B], ["TODO", dias]]) {
  const per = g.filter((x) => x.pen > 0);
  const c = per.filter((x) => x.lado === "CALL"), p = per.filter((x) => x.lado === "PUT");
  const dC = c.reduce((a, x) => a + Math.min(x.pl, 0), 0), dP = p.reduce((a, x) => a + Math.min(x.pl, 0), 0);
  console.log(`| ${nom} | ${per.length} | ${c.length} (${((c.length / per.length) * 100).toFixed(0)}%) | ${p.length} (${((p.length / per.length) * 100).toFixed(0)}%) | ${eur(dC)} | ${eur(dP)} | ${((dC / (dC + dP)) * 100).toFixed(0)}% | ${c.filter((x) => x.tope).length} | ${p.filter((x) => x.tope).length} |`);
}

console.log(`\n====== 3 · RACIMOS O SUELTOS ======\n`);
function racimo(g, filtro) {
  const idx = g.map((d, i) => (filtro(d) ? i : -1)).filter((i) => i >= 0);
  const base = idx.length / g.length;
  let sigCon = 0, conAnt = 0;
  for (const i of idx) { if (i + 1 < g.length) { conAnt++; if (filtro(g[i + 1])) sigCon++; } }
  const cond = conAnt ? sigCon / conAnt : NaN;
  let rachas = 0, enRacha = false, maxR = 0, cur = 0;
  for (let i = 0; i < g.length; i++) {
    if (filtro(g[i])) { if (!enRacha) { rachas++; cur = 0; } enRacha = true; cur++; if (cur > maxR) maxR = cur; }
    else enRacha = false;
  }
  let solos = 0;
  for (let i = 0; i < g.length; i++) if (filtro(g[i]) && !(i > 0 && filtro(g[i - 1])) && !(i + 1 < g.length && filtro(g[i + 1]))) solos++;
  return { n: idx.length, base, cond, lift: cond / base, rachas, maxR, solos, pctSolos: idx.length ? solos / idx.length : NaN };
}
console.log("| período | tipo de día | n | tasa base | tasa el día SIGUIENTE a uno | multiplicador | rachas | racha máx | sueltos | % sueltos |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const tipos = [["TOPE (catastrófico)", (d) => d.tope === 1], ["MEDIO (mediano)", (d) => d.peldano === "MEDIO"],
               ["cualquier pérdida", (d) => d.pl < 0], ["pérdida > $500", (d) => d.pl < -500]];
for (const [nom, g] of [["2022", dias.filter((d) => d.ano === "2022")], ["2023", dias.filter((d) => d.ano === "2023")],
                        ["2022-23", A], ["2024-26", B], ["TODO", dias]]) {
  for (const [tn, tf] of tipos) {
    const r = racimo(g, tf);
    if (r.n < 3) { console.log(`| ${nom} | ${tn} | ${r.n} | — | — | — | — | — | — | — |`); continue; }
    console.log(`| ${nom} | ${tn} | ${r.n} | ${(r.base * 100).toFixed(1)}% | ${(r.cond * 100).toFixed(1)}% | **${n2(r.lift)}x** | ${r.rachas} | ${r.maxR} | ${r.solos} | ${(r.pctSolos * 100).toFixed(0)}% |`);
  }
}

console.log(`\n====== 4 · DÍAS MALOS POR AÑO ======\n`);
console.log("| año | días | perdedores | % | TOPE | MEDIO | ROZADO | daño total | daño/perdedor | P&L del año | $/año equiv |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const g = dias.filter((d) => d.ano === a);
  const per = g.filter((x) => x.pl < 0);
  const dano = per.reduce((s, x) => s + x.pl, 0);
  const tot = g.reduce((s, x) => s + x.pl, 0);
  console.log(`| ${a} | ${g.length} | ${per.length} | ${((per.length / g.length) * 100).toFixed(0)}% | ${g.filter((x) => x.tope).length} | ${g.filter((x) => x.peldano === "MEDIO").length} | ${g.filter((x) => x.peldano === "ROZADO").length} | ${eur(dano)} | ${eur(dano / per.length)} | ${eur(tot)} | ${eur(tot / (g.length / 252))} |`);
}

console.log(`\n====== 5 · EL PERFIL · 2022-23 CONTRA 2024-26 ======\n`);
const campos = [
  ["sepPct", "los 25 pts como % del índice", "%"],
  ["sigma", "sigma del resto de sesión (pts)", "pts"],
  ["sigmaRatio", "25 pts medidos en sigmas", "s"],
  ["ivPct", "IV del dinero a las 11:00", "%"],
  ["credito", "crédito cobrado", "$"],
  ["tardeAbs", "|movimiento 11:00 al cierre|", "pts"],
  ["tardeSig", "ese movimiento en sigmas", "s"],
  ["movMananaAbs", "|movimiento de la mañana|", "%"],
  ["rangoMananaPts", "rango de la mañana", "pts"],
  ["mae", "penetración máxima intradía", "pts"],
  ["pen", "penetración al cierre", "pts"],
];
function comparar(fA, fB, campo) {
  const a = fA.map((x) => x[campo]).filter((x) => x != null && isFinite(x));
  const b = fB.map((x) => x[campo]).filter((x) => x != null && isFinite(x));
  return { a: media(a), b: media(b), t: tWelch(a, b), na: a.length, nb: b.length };
}
console.log("A) TODOS los días — el terreno de juego\n");
console.log("| variable | 2022-23 | 2024-26 | cambio | t | supera el listón |");
console.log("|---|---|---|---|---|---|");
for (const [c, nom, u] of campos) {
  const r = comparar(A, B, c);
  const cambio = r.a ? ((r.b / r.a - 1) * 100) : NaN;
  console.log(`| ${nom} | ${n2(r.a)} ${u} | ${n2(r.b)} ${u} | ${cambio >= 0 ? "+" : ""}${n1(cambio)}% | ${n2(r.t)} | ${Math.abs(r.t) >= LISTON ? "**SÍ**" : "no"} |`);
}
console.log("\nB) SÓLO los días perdedores — el retrato del día que duele\n");
const mA = A.filter((d) => d.pl < 0), mB = B.filter((d) => d.pl < 0);
console.log(`   n = ${mA.length} (2022-23) contra ${mB.length} (2024-26)\n`);
console.log("| variable | 2022-23 | 2024-26 | cambio | t | supera el listón |");
console.log("|---|---|---|---|---|---|");
for (const [c, nom, u] of campos) {
  const r = comparar(mA, mB, c);
  const cambio = r.a ? ((r.b / r.a - 1) * 100) : NaN;
  console.log(`| ${nom} | ${n2(r.a)} ${u} | ${n2(r.b)} ${u} | ${cambio >= 0 ? "+" : ""}${n1(cambio)}% | ${n2(r.t)} | ${Math.abs(r.t) >= LISTON ? "**SÍ**" : "no"} |`);
}

console.log(`\n====== 6 · CUÁNDO SE ROMPE EL DÍA · hora del primer cruce ======\n`);
const franjas = [["11:00-12:00", "11:00", "12:00"], ["12:00-13:00", "12:00", "13:00"], ["13:00-14:00", "13:00", "14:00"],
                 ["14:00-15:00", "14:00", "15:00"], ["15:00-15:30", "15:00", "15:30"], ["15:30-16:00", "15:30", "99:99"]];
console.log("| franja del primer cruce | 22-23 n | 22-23 acaba TOPE | 22-23 recupera | 24-26 n | 24-26 acaba TOPE | 24-26 recupera | P&L medio |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [nom, ini, fin] of franjas) {
  const sel = (g) => g.filter((d) => d.hCruce && d.hCruce >= ini && d.hCruce < fin);
  const a = sel(A), b = sel(B), t = sel(dias);
  console.log(`| ${nom} | ${a.length} | ${a.length ? ((a.filter((x) => x.tope).length / a.length) * 100).toFixed(0) + "%" : "—"} | ${a.length ? ((a.filter((x) => x.recupero).length / a.length) * 100).toFixed(0) + "%" : "—"} | ${b.length} | ${b.length ? ((b.filter((x) => x.tope).length / b.length) * 100).toFixed(0) + "%" : "—"} | ${b.length ? ((b.filter((x) => x.recupero).length / b.length) * 100).toFixed(0) + "%" : "—"} | ${eur(media(t.map((x) => x.pl)))} |`);
}
const nunca = dias.filter((d) => !d.hCruce);
console.log(`| nunca cruzó | ${A.filter((d) => !d.hCruce).length} | — | — | ${B.filter((d) => !d.hCruce).length} | — | — | ${eur(media(nunca.map((x) => x.pl)))} |`);

console.log(`\n====== 7 · LOS 15 PEORES DÍAS DE LOS 4,5 AÑOS ======\n`);
console.log("| # | fecha | P&L | lado | peldaño | mov. mañana | mov. tarde (pts) | tarde en sigmas | hueco | IV 11:00 | crédito | primer cruce |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
[...dias].sort((a, b) => a.pl - b.pl).slice(0, 15).forEach((d, i) => {
  console.log(`| ${i + 1} | ${d.fecha} | ${eur(d.pl)} | ${d.lado} | ${d.peldano} | ${n2(d.movManana)}% | ${n1(d.tardePts)} | ${n2(d.tardeSig)} | ${n2(d.hueco)}% | ${n1(d.ivPct)}% | ${eur(d.credito)} | ${d.hCruce || "—"} |`);
});

console.log(`\n====== 8 · TRADUCCIÓN A LA CUENTA DE $${CUENTA.toLocaleString("es-ES")} · 1 contrato ======\n`);
for (const [nom, g] of [["2022-23", A], ["2024-26", B], ["TODO", dias]]) {
  const pl = g.map((x) => x.pl), tot = pl.reduce((a, b) => a + b, 0), y = g.length / 252;
  let acc = 0, pico = 0, dd = 0;
  for (const p of pl) { acc += p; if (acc > pico) pico = acc; if (acc - pico < dd) dd = acc - pico; }
  console.log(`  ${nom}: ${eur(tot / y)}/año = ${((tot / y / CUENTA) * 100).toFixed(2)}% de la cuenta · peor racha ${eur(dd)} = ${((-dd / 7977) * 100).toFixed(0)}% del EFECTIVO ($7.977) · peor día ${eur(Math.min(...pl))}`);
}
