// ═══════════════════════════════════════════════════════════════════════════════════════════
//  EL CRÉDITO CONTRA EL CRUCE — ¿el precio que te pagan anticipa el día que duele?
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ ESTA VEZ ES DISTINTO. En la tanda de 653 días (2024-2026) el crédito salió el segundo
// mejor candidato con t=4,89 y NUNCA se probó fuera de muestra. Con 1.121 días se puede partir:
//   1. Se elige señal, dirección y umbral mirando SÓLO 2022-2023. Se escriben.
//   2. Se aplican TAL CUAL a 2024-2026.
//   3. Se repite al revés.
//   4. Sólo cuenta lo que funcione en LAS DOS DIRECCIONES.
//
// LO QUE HACE AL CRÉDITO DISTINTO DE LOS 19 FILTROS QUE MURIERON. La anatomía demostró que el
// perfil del día malo NO cambia entre períodos: lo que cambia son las UNIDADES (los ±25 puntos
// pasan del 0,61% al 0,41% del índice, t=36,6). El crédito NO tiene ese problema: se mide en
// dólares por cóndor y su media es $659 en 2022-23 contra $683 en 2024-26. Es la única señal
// del proyecto que ya viene en la unidad correcta. Por eso merece el cruce.
//
// SIN MIRAR AL FUTURO. Las cinco señales salen de la cadena de las 11:00 ET del propio día y de
// días ESTRICTAMENTE anteriores. Nada usa el cierre, ni el VIX de hoy, ni una mediana del
// período entero.
//
// PRECIOS REALES. El crédito es bid al vender y ask al comprar, las cuatro patas, ya calculado
// en mal-construir.mjs y verificado ahí contra las cadenas.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/credito-cruce.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT, tWelch } from "../lib/barreraHallazgos";

// ── PRUEBAS DECLARADAS ANTES DE CORRER. El divisor NO se toca después. ──────────────────────
const SENALES = 5;                          // credito · credRel20 · credSigma · sigmaRatio · credResid
const PRUEBAS_COLA = SENALES * 2;           // × 2 umbrales de día malo ($2.000 y $4.000)
const PRUEBAS_FILTRO = SENALES * 2 * 3;     // × 2 direcciones × 3 tamaños de corte
const PRUEBAS = PRUEBAS_COLA + PRUEBAS_FILTRO;    // = 40
const LISTON = listonT(PRUEBAS);

const CUENTA = 56389;                       // la cuenta de Lester
const ANCHO$ = 5000;                        // colateral real por cóndor en Robinhood
const MALO = 2000, MUY_MALO = 4000;
const PERM = 500;                           // sorteos del control de azar
const CORTES = [0.10, 0.20, 0.30];          // fracción de días que el filtro tira

// ── EL LISTÓN DE SUPERVIVENCIA, ESCRITO ANTES DE VER UN SOLO NÚMERO ────────────────────────
// El tamaño (operar menos contratos) cuesta $0,08 de ingreso por cada $1 de caída eliminada.
// Es gratis y no hay que acertar nada. Un filtro que cueste más que eso NO SIRVE, aunque
// "funcione": se consigue lo mismo encogiendo el vehículo.
const LISTON_RATIO = 0.08;
// Y tiene que ganarle al azar: quitar N días al bulto ya baja la cola por pura suerte.
const LISTON_AZAR = 0.95;

const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const drawdown = (pls) => { let acc = 0, pico = 0, peor = 0; for (const p of pls) { acc += p; if (acc > pico) pico = acc; if (acc - pico < peor) peor = acc - pico; } return peor; };

// ═══ 1 · CARGAR Y CONSTRUIR LAS SEÑALES DE CRÉDITO ═════════════════════════════════════════
const dias = JSON.parse(readFileSync("scripts/mal-dias.json", "utf8"))
  .sort((a, b) => a.fecha.localeCompare(b.fecha))
  .map((d) => ({ fecha: d.fecha, pl: d.pl, credito: d.credito, sigma: d.sigma, iv: d.iv, sp11: d.sp11, cierre: d.cierre }));

// Señales directas (todas disponibles todos los días).
for (const f of dias) {
  f.credPctAncho = (f.credito / ANCHO$) * 100;      // ordenación IDÉNTICA a credito — no cuenta aparte
  f.credSigma = f.sigma > 0 ? f.credito / f.sigma : null;   // $ de crédito por punto de movimiento esperado
  f.sigmaRatio = f.sigma > 0 ? 25 / f.sigma : null;         // a cuántas σ está el corto (el riesgo, no el precio)
}

// Señales MÓVILES: sólo días estrictamente anteriores.
// Los días sin historia suficiente NO se filtran nunca (se operan). Es lo que haría un operador
// real que aún no tiene con qué comparar, y mantiene la base idéntica en todas las variantes.
const VENT_REL = 20, VENT_REG = 250, MIN_REG = 60;
for (let i = 0; i < dias.length; i++) {
  const f = dias[i];
  // — crédito contra su propia mediana de los 20 días anteriores —
  if (i >= VENT_REL) {
    const prev = dias.slice(i - VENT_REL, i).map((x) => x.credito);
    const med = pctl(prev, 0.5);
    f.credRel20 = med > 0 ? f.credito / med : null;
  } else f.credRel20 = null;

  // — ¿me pagan más o menos DE LO NORMAL para ese nivel de riesgo? —
  // Regresión móvil del crédito sobre sigmaRatio con los 250 días anteriores (mínimo 60).
  // Re-ajustada cada día, así que absorbe cualquier deriva de unidades por construcción.
  const desde = Math.max(0, i - VENT_REG);
  const prev = dias.slice(desde, i).filter((x) => x.sigmaRatio != null);
  if (prev.length >= MIN_REG && f.sigmaRatio != null) {
    const xs = prev.map((x) => x.sigmaRatio), ys = prev.map((x) => x.credito);
    const mx = media(xs), my = media(ys);
    let sxy = 0, sxx = 0;
    for (let j = 0; j < xs.length; j++) { sxy += (xs[j] - mx) * (ys[j] - my); sxx += (xs[j] - mx) ** 2; }
    const b = sxx > 0 ? sxy / sxx : 0, a = my - b * mx;
    f.credResid = f.credito - (a + b * f.sigmaRatio);
  } else f.credResid = null;
}

radiografia(dias, ["pl", "credito", "credPctAncho", "credSigma", "sigmaRatio"], "los 1.121 días del cóndor", { cerosLegitimos: ["pl"] });
radiografia(dias.filter((f) => f.credRel20 != null), ["credRel20", "credResid"], "señales móviles (con historia)");

const SIG = [
  ["credito", "crédito en dólares", "$"],
  ["credRel20", "crédito ÷ su mediana de 20 días", "x"],
  ["credSigma", "crédito ÷ σ (por punto esperado)", "$/pt"],
  ["sigmaRatio", "25 ÷ σ (distancia del corto en σ)", "σ"],
  ["credResid", "residuo del crédito frente a σ (regresión móvil)", "$"],
];

const P22 = (f) => f.fecha < "2024-01-01";
const P24 = (f) => f.fecha >= "2024-01-01";
const A = dias.filter(P22), B = dias.filter(P24);

console.log(`\n${"═".repeat(96)}`);
console.log(`  EL CRÉDITO CONTRA EL CRUCE · ${dias.length} días (${dias[0].fecha} → ${dias[dias.length - 1].fecha})`);
console.log(`  ${PRUEBAS} pruebas declaradas (${PRUEBAS_COLA} de cola + ${PRUEBAS_FILTRO} de filtro) · listón de |t| = ${LISTON}`);
console.log(`  Listón de supervivencia: ratio ≤ $${LISTON_RATIO.toFixed(2)} de ingreso por $1 de racha, EN LAS DOS DIRECCIONES,`);
console.log(`  con la racha mejorando y el ingreso sin irse a negativo, y ganándole al percentil ${LISTON_AZAR * 100} de ${PERM} sorteos.`);
console.log(`${"═".repeat(96)}\n`);

// ═══ 2 · ¿SIGUEN SIENDO LAS MISMAS UNIDADES? ═══════════════════════════════════════════════
console.log(`## 2 · LAS UNIDADES DEL CRÉDITO — lo que mató a los otros 19 filtros\n`);
console.log("| señal | 2022-2023 mediana | 2024-2026 mediana | t de la diferencia | ¿misma unidad? |");
console.log("|---|---|---|---|---|");
for (const [k, et] of SIG) {
  const a = A.map((f) => f[k]).filter((x) => x != null), b = B.map((f) => f[k]).filter((x) => x != null);
  const t = tWelch(a, b);
  console.log(`| ${et} | ${pctl(a, 0.5).toFixed(2)} | ${pctl(b, 0.5).toFixed(2)} | ${t.toFixed(2)} | ${Math.abs(t) < LISTON ? "SÍ" : "**NO — deriva**"} |`);
}
console.log(`\n  (control: los ±25 puntos como % del índice dieron t=36,6 y la IV del dinero t=5,74. Eso es deriva.)\n`);

// ═══ 3 · LA SEÑAL CRUDA: ¿SEPARA LA COLA? ══════════════════════════════════════════════════
function colaDe(fs) {
  const pl = fs.map((f) => f.pl);
  return {
    n: pl.length, media: media(pl), p5: pctl(pl, 0.05), p1: pctl(pl, 0.01),
    pMalo: pl.filter((x) => x <= -MALO).length / pl.length * 100,
    pMuyMalo: pl.filter((x) => x <= -MUY_MALO).length / pl.length * 100,
    peor: Math.min(...pl),
  };
}
function tercios(fs, k) {
  const ok = fs.filter((f) => f[k] != null).sort((x, y) => y[k] - x[k]);
  const t = Math.floor(ok.length / 3);
  return { alto: ok.slice(0, t), bajo: ok.slice(-t) };
}

console.log(`## 3 · LA SEÑAL CRUDA — tercio ALTO contra tercio BAJO de cada señal\n`);
console.log("| señal | período | media alto | media bajo | t | p5 alto | p5 bajo | P(>$2k) alto | P(>$2k) bajo | P(>$4k) alto | P(>$4k) bajo |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const crudo = {};
for (const [k, et] of SIG) {
  crudo[k] = {};
  for (const [pe, fs] of [["TODO", dias], ["2022-23", A], ["2024-26", B]]) {
    const { alto, bajo } = tercios(fs, k);
    if (alto.length < 30) continue;
    const ca = colaDe(alto), cb = colaDe(bajo);
    const t = tWelch(alto.map((f) => f.pl), bajo.map((f) => f.pl));
    crudo[k][pe] = { t, ca, cb };
    console.log(`| ${et} | ${pe} | ${eur(ca.media)} | ${eur(cb.media)} | **${t.toFixed(2)}** | ${eur(ca.p5)} | ${eur(cb.p5)} | ${ca.pMalo.toFixed(1)}% | ${cb.pMalo.toFixed(1)}% | ${ca.pMuyMalo.toFixed(1)}% | ${cb.pMuyMalo.toFixed(1)}% |`);
  }
}

// estabilidad en TERCIOS DE TIEMPO (la criba que mató a la inusualidad)
console.log(`\n### ¿el signo se repite en los TRES tercios de tiempo?\n`);
console.log("| señal | tercio 1 | tercio 2 | tercio 3 | ¿mismo signo? |");
console.log("|---|---|---|---|---|");
for (const [k, et] of SIG) {
  const kk = Math.floor(dias.length / 3);
  const seps = [];
  for (let i = 0; i < 3; i++) {
    const g = i < 2 ? dias.slice(i * kk, (i + 1) * kk) : dias.slice(2 * kk);
    const { alto, bajo } = tercios(g, k);
    seps.push(alto.length >= 20 ? media(alto.map((f) => f.pl)) - media(bajo.map((f) => f.pl)) : NaN);
  }
  const sg = seps.map(Math.sign);
  console.log(`| ${et} | ${eur(seps[0])} | ${eur(seps[1])} | ${eur(seps[2])} | ${sg[0] === sg[1] && sg[1] === sg[2] ? "SÍ" : "**NO**"} |`);
}

// ═══ 4 · EL CRUCE ══════════════════════════════════════════════════════════════════════════
// Un filtro es: (señal, dirección, umbral ABSOLUTO). El umbral se fija en el período de ajuste
// y viaja SIN TOCARSE al de prueba. Los días sin señal (falta de historia) SIEMPRE se operan.
function aplicar(fs, k, dir, umbral) {
  return fs.filter((f) => f[k] == null || (dir === "alto" ? f[k] >= umbral : f[k] <= umbral));
}
function metricas(fs, anos, base) {
  const pl = fs.map((f) => f.pl);
  if (!pl.length) return null;
  const total = pl.reduce((a, b) => a + b, 0);
  const m = {
    n: pl.length, alAno: total / anos, peor: Math.min(...pl),
    p1: pctl(pl, 0.01), p5: pctl(pl, 0.05), dd: drawdown(pl),
    pMalo: pl.filter((x) => x <= -MALO).length / pl.length * 100,
    pMuyMalo: pl.filter((x) => x <= -MUY_MALO).length / pl.length * 100,
  };
  if (base) {
    m.dIngreso = m.alAno - base.alAno;                 // negativo = ingreso perdido
    m.dCaida = Math.abs(base.dd) - Math.abs(m.dd);     // positivo = racha eliminada
    m.ratio = m.dCaida > 0 ? Math.max(0, -m.dIngreso) / m.dCaida : Infinity;
  }
  return m;
}

function ajustar(fit, etiqueta) {
  const anos = fit.length / 252;
  const base = metricas(fit, anos);
  const cands = [];
  for (const [k, et] of SIG) {
    const vals = fit.map((f) => f[k]).filter((x) => x != null).sort((a, b) => a - b);
    if (vals.length < 100) continue;
    for (const corte of CORTES) {
      for (const dir of ["alto", "bajo"]) {
        // "alto" = operar sólo cuando la señal está por ENCIMA del umbral (tira la cola baja)
        const q = dir === "alto" ? corte : 1 - corte;
        const umbral = pctl(vals, q);
        const m = metricas(aplicar(fit, k, dir, umbral), anos, base);
        if (!m) continue;
        cands.push({ k, et, dir, corte, umbral, ...m });
      }
    }
  }
  // ELECCIÓN, mecánica: entre los que mejoran la racha, el de menor ingreso perdido por dólar.
  const viables = cands.filter((c) => c.dCaida > 0);
  viables.sort((a, b) => (a.ratio - b.ratio) || (b.dCaida - a.dCaida));
  return { base, cands, elegido: viables[0] ?? null, anos, etiqueta };
}

function azar(test, nQuita, ddBase, alAnoBase, anos) {
  const pl = test.map((f) => f.pl);
  const mejoras = [], ingresos = [];
  for (let s = 0; s < PERM; s++) {
    const idx = new Set();
    while (idx.size < nQuita) idx.add((Math.random() * pl.length) | 0);
    const sub = pl.filter((_, i) => !idx.has(i));
    mejoras.push(Math.abs(ddBase) - Math.abs(drawdown(sub)));
    ingresos.push(sub.reduce((a, b) => a + b, 0) / anos - alAnoBase);
  }
  mejoras.sort((a, b) => a - b); ingresos.sort((a, b) => a - b);
  return { mejoras, ingresos };
}

const RES = [];
for (const [etFit, fit, etTest, test] of [
  ["2022-2023", A, "2024-2026", B],
  ["2024-2026", B, "2022-2023", A],
]) {
  console.log(`\n${"─".repeat(96)}`);
  console.log(`## 4 · AJUSTAR EN ${etFit}  →  APLICAR A ${etTest}`);
  console.log(`${"─".repeat(96)}\n`);

  const aj = ajustar(fit, etFit);
  console.log(`### base sin filtro en ${etFit}: ${eur(aj.base.alAno)}/año · peor día ${eur(aj.base.peor)} · p5 ${eur(aj.base.p5)} · racha ${eur(aj.base.dd)}\n`);
  console.log(`### las ${aj.cands.length} reglas candidatas, ordenadas por la métrica que decide (sólo se muestran las 8 mejores)\n`);
  console.log("| señal | dirección | corte | umbral | $/año | Δingreso | Δracha | $ por $ |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const c of [...aj.cands].filter((c) => c.dCaida > 0).sort((a, b) => a.ratio - b.ratio || b.dCaida - a.dCaida).slice(0, 8))
    console.log(`| ${c.et} | ${c.dir === "alto" ? "operar sólo si ≥" : "operar sólo si ≤"} | ${(c.corte * 100).toFixed(0)}% | ${c.umbral.toFixed(2)} | ${eur(c.alAno)} | ${eur(c.dIngreso)} | ${eur(c.dCaida)} | $${c.ratio.toFixed(2)} |`);

  const e = aj.elegido;
  if (!e) { console.log(`\n  ⛔ NINGUNA regla mejora la racha en ${etFit}. No hay nada que llevar fuera de muestra.`); RES.push({ etFit, etTest, elegido: null }); continue; }

  console.log(`\n### LA REGLA ELEGIDA, escrita antes de mirar ${etTest}:`);
  console.log(`\n  > **${e.et}** — operar sólo si la señal es ${e.dir === "alto" ? "≥" : "≤"} **${e.umbral.toFixed(2)}**  (tira el ${(e.corte * 100).toFixed(0)}% de los días)\n`);
  console.log(`  en ${etFit} (donde se eligió): ${eur(e.alAno)}/año · peor ${eur(e.peor)} · p5 ${eur(e.p5)} · racha ${eur(e.dd)} · **$${e.ratio.toFixed(2)} por $1**`);

  // ── APLICAR TAL CUAL ──
  const anosT = test.length / 252;
  const baseT = metricas(test, anosT);
  const mT = metricas(aplicar(test, e.k, e.dir, e.umbral), anosT, baseT);
  const nQuita = baseT.n - mT.n;

  console.log(`\n### APLICADA TAL CUAL a ${etTest} (sin tocar un número):\n`);
  console.log("| | sin filtro | con la regla | diferencia |");
  console.log("|---|---|---|---|");
  console.log(`| días operados | ${baseT.n} | ${mT.n} | −${nQuita} (${(nQuita / baseT.n * 100).toFixed(0)}%) |`);
  console.log(`| $/año | ${eur(baseT.alAno)} | ${eur(mT.alAno)} | ${eur(mT.dIngreso)} |`);
  console.log(`| peor día | ${eur(baseT.peor)} | ${eur(mT.peor)} | ${eur(Math.abs(baseT.peor) - Math.abs(mT.peor))} |`);
  console.log(`| percentil 1 | ${eur(baseT.p1)} | ${eur(mT.p1)} | ${eur(Math.abs(baseT.p1) - Math.abs(mT.p1))} |`);
  console.log(`| percentil 5 | ${eur(baseT.p5)} | ${eur(mT.p5)} | ${eur(Math.abs(baseT.p5) - Math.abs(mT.p5))} |`);
  console.log(`| P(pérdida > $2.000) | ${baseT.pMalo.toFixed(1)}% | ${mT.pMalo.toFixed(1)}% | ${(mT.pMalo - baseT.pMalo).toFixed(1)} pts |`);
  console.log(`| P(pérdida > $4.000) | ${baseT.pMuyMalo.toFixed(1)}% | ${mT.pMuyMalo.toFixed(1)}% | ${(mT.pMuyMalo - baseT.pMuyMalo).toFixed(1)} pts |`);
  console.log(`| **peor racha** | ${eur(baseT.dd)} | ${eur(mT.dd)} | **${eur(mT.dCaida)}** |`);
  console.log(`| **$ perdidos por $1 de racha** | — | — | **${mT.dCaida > 0 ? "$" + mT.ratio.toFixed(2) : "no mejora la racha"}** |`);

  // ── CONTROL DEL AZAR ──
  const az = azar(test, nQuita, baseT.dd, baseT.alAno, anosT);
  const pctMejora = az.mejoras.filter((x) => x < mT.dCaida).length / PERM;
  const pctIngreso = az.ingresos.filter((x) => x < mT.dIngreso).length / PERM;
  console.log(`\n### control del azar — ${PERM} sorteos quitando los mismos ${nQuita} días al bulto:\n`);
  console.log(`  mejora de racha del filtro: ${eur(mT.dCaida)} · mediana del azar ${eur(pctl(az.mejoras, 0.5))} · p95 del azar ${eur(pctl(az.mejoras, 0.95))}`);
  console.log(`  → el filtro está en el percentil **${(pctMejora * 100).toFixed(0)}** del azar  ${pctMejora >= LISTON_AZAR ? "(le gana)" : "(**NO le gana al azar**)"}`);
  console.log(`  ingreso: ${eur(mT.dIngreso)} · mediana del azar ${eur(pctl(az.ingresos, 0.5))} → percentil ${(pctIngreso * 100).toFixed(0)}`);

  const cumple = mT.dCaida > 0 && mT.alAno >= 0 && mT.ratio <= LISTON_RATIO && pctMejora >= LISTON_AZAR;
  console.log(`\n  ${cumple ? "✅" : "⛔"} ${etFit} → ${etTest}: ${cumple ? "CUMPLE el listón" : "NO cumple"}` +
    `  [racha mejora ${mT.dCaida > 0 ? "sí" : "NO"} · ingreso ≥0 ${mT.alAno >= 0 ? "sí" : "NO"} · ratio $${isFinite(mT.ratio) ? mT.ratio.toFixed(2) : "∞"} ≤ $${LISTON_RATIO} ${mT.ratio <= LISTON_RATIO ? "sí" : "NO"} · gana al azar ${pctMejora >= LISTON_AZAR ? "sí" : "NO"}]`);

  RES.push({ etFit, etTest, elegido: e, fuera: mT, baseT, pctMejora, cumple, nQuita, cands: aj.cands, baseFit: aj.base });
}

// ═══ 5 · TODA LA PARRILLA CRUZADA — para ver si ALGUNA regla sobrevive, no sólo la elegida ═══
console.log(`\n${"─".repeat(96)}`);
console.log(`## 5 · LAS 30 REGLAS, CADA UNA CRUZADA EN LAS DOS DIRECCIONES`);
console.log(`   (el umbral se fija SIEMPRE en el período contrario al que se mide)`);
console.log(`${"─".repeat(96)}\n`);
console.log("| señal | dir | corte | umbral 22-23 → aplicado a 24-26 | umbral 24-26 → aplicado a 22-23 | ¿las dos? |");
console.log("|---|---|---|---|---|---|");
const anosA = A.length / 252, anosB = B.length / 252;
const baseA = metricas(A, anosA), baseB = metricas(B, anosB);
let sobreviven = 0;
const parrilla = [];
for (const [k, et] of SIG) {
  for (const corte of CORTES) {
    for (const dir of ["alto", "bajo"]) {
      const q = dir === "alto" ? corte : 1 - corte;
      const uA = pctl(A.map((f) => f[k]).filter((x) => x != null).sort((a, b) => a - b), q);
      const uB = pctl(B.map((f) => f[k]).filter((x) => x != null).sort((a, b) => a - b), q);
      const AB = metricas(aplicar(B, k, dir, uA), anosB, baseB);   // ajustado en A, probado en B
      const BA = metricas(aplicar(A, k, dir, uB), anosA, baseA);   // ajustado en B, probado en A
      const ok = AB.dCaida > 0 && BA.dCaida > 0 && AB.alAno >= 0 && BA.alAno >= 0 && AB.ratio <= LISTON_RATIO && BA.ratio <= LISTON_RATIO;
      if (ok) sobreviven++;
      parrilla.push({ k, et, dir, corte, uA, uB, AB, BA, ok });
      console.log(`| ${et} | ${dir === "alto" ? "≥" : "≤"} | ${(corte * 100).toFixed(0)}% | ${eur(AB.dIngreso)} ing · ${eur(AB.dCaida)} racha · $${isFinite(AB.ratio) ? AB.ratio.toFixed(2) : "∞"} | ${eur(BA.dIngreso)} ing · ${eur(BA.dCaida)} racha · $${isFinite(BA.ratio) ? BA.ratio.toFixed(2) : "∞"} | ${ok ? "**SÍ**" : "no"} |`);
    }
  }
}
console.log(`\n  ${sobreviven} de ${parrilla.length} reglas cumplen el listón en las DOS direcciones.`);

// las que al menos mejoran la racha en las dos, aunque no lleguen al listón de $0,08
const mediaTabla = parrilla.filter((p) => p.AB.dCaida > 0 && p.BA.dCaida > 0);
console.log(`  ${mediaTabla.length} de ${parrilla.length} al menos MEJORAN la racha en las dos direcciones (sin exigir el precio).`);
if (mediaTabla.length) {
  console.log(`\n  Las que mejoran la racha en las dos, con lo que cuestan:\n`);
  console.log("| señal | dir | corte | $ por $ en 24-26 | $ por $ en 22-23 | ingreso 24-26 | ingreso 22-23 |");
  console.log("|---|---|---|---|---|---|---|");
  for (const p of mediaTabla.sort((x, y) => Math.max(x.AB.ratio, x.BA.ratio) - Math.max(y.AB.ratio, y.BA.ratio)))
    console.log(`| ${p.et} | ${p.dir === "alto" ? "≥" : "≤"} | ${(p.corte * 100).toFixed(0)}% | $${p.AB.ratio.toFixed(2)} | $${p.BA.ratio.toFixed(2)} | ${eur(p.AB.dIngreso)} | ${eur(p.BA.dIngreso)} |`);
}

// ═══ 6 · VEREDICTO ═════════════════════════════════════════════════════════════════════════
const dos = RES.filter((r) => r.cumple).length;
console.log(`\n${"═".repeat(96)}`);
console.log(`  VEREDICTO`);
console.log(`${"═".repeat(96)}\n`);
console.log(`  Direcciones del cruce que cumplen el listón completo: ${dos} de 2`);
console.log(`  Reglas de la parrilla que sobreviven en las dos direcciones: ${sobreviven} de ${parrilla.length}`);
console.log(`  sobreviveAlCruce = ${dos === 2 ? "TRUE" : "FALSE"}\n`);

const baseTodo = metricas(dias, dias.length / 252);
console.log(`  Base sin filtro, 1.121 días: ${eur(baseTodo.alAno)}/año (${(baseTodo.alAno / CUENTA * 100).toFixed(2)}% de la cuenta de ${eur(CUENTA)})`);
console.log(`  peor día ${eur(baseTodo.peor)} · p1 ${eur(baseTodo.p1)} · p5 ${eur(baseTodo.p5)} · peor racha ${eur(baseTodo.dd)}`);
console.log(`  P(pérdida > $2.000) = ${baseTodo.pMalo.toFixed(1)}% · P(pérdida > $4.000) = ${baseTodo.pMuyMalo.toFixed(1)}%\n`);

writeFileSync("scripts/credito-cruce-salida.json", JSON.stringify({
  n: dias.length, pruebas: PRUEBAS, liston: LISTON, listonRatio: LISTON_RATIO,
  crudo, resultados: RES.map((r) => ({ etFit: r.etFit, etTest: r.etTest, elegido: r.elegido && { senal: r.elegido.k, et: r.elegido.et, dir: r.elegido.dir, corte: r.elegido.corte, umbral: r.elegido.umbral, enAjuste: { alAno: r.elegido.alAno, dd: r.elegido.dd, ratio: r.elegido.ratio } }, fuera: r.fuera, baseT: r.baseT, pctMejora: r.pctMejora, cumple: r.cumple })),
  parrilla: parrilla.map((p) => ({ senal: p.k, dir: p.dir, corte: p.corte, uA: p.uA, uB: p.uB, AB: { dIngreso: p.AB.dIngreso, dCaida: p.AB.dCaida, ratio: p.AB.ratio, alAno: p.AB.alAno }, BA: { dIngreso: p.BA.dIngreso, dCaida: p.BA.dCaida, ratio: p.BA.ratio, alAno: p.BA.alAno }, ok: p.ok })),
  sobreviven, baseTodo, baseA, baseB,
}, null, 1), "utf8");
console.log(`  → scripts/credito-cruce-salida.json`);
