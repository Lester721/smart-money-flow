// ═══════════════════════════════════════════════════════════════════════════════════════════
//  SIGMA-CREDITO · ¿el desajuste entre lo que el mercado ESPERA y lo que nos PAGAN anticipa
//  la COLA del cóndor 0DTE?
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// LO QUE ES DISTINTO DE LAS 17 PRUEBAS DE RÉGIMEN Y LAS 30 DE GESTIÓN
// Aquéllas comparaban MEDIAS: tercio alto contra tercio bajo del P&L medio. Todas fallaron.
// Aquí NO se mide la media. Se define un DÍA MALO y se mide si la señal lo anticipa:
//   · P(pérdida > $2.000) y P(pérdida > $4.000) en el tercio alto contra el bajo
//   · percentil 5 y percentil 1 del P&L en cada tercio
//   · y, si se filtrara: cuánto baja el PEOR DÍA, cuánto baja la PEOR RACHA, cuánto ingreso cuesta
//
// EL CONTROL QUE HACE FALTA Y QUE NADIE HABÍA PUESTO
// Tirar el 20% de los días REDUCE la cola aunque el filtro sea puro ruido: el peor día se cae
// con probabilidad 0,20 por pura suerte. Por eso cada filtro se compara contra 2.000 filtros
// ALEATORIOS del mismo tamaño (permutación). Si la mejora del peor día o de la racha no está
// fuera de lo que consigue el azar tirando los mismos días al bulto, NO es una señal.
//
// SIN MIRAR AL FUTURO
// Las 13 señales salen de la cadena de las 11:00 ET del propio día y de días ANTERIORES. Nada
// usa el cierre. `credRel60` compara con la mediana de los 60 días previos, nunca con la del
// período entero. Los índices de volatilidad no entran aquí en absoluto.
//
// PRECIOS REALES
// El crédito viene de bid al vender y ask al comprar, en las cuatro patas. Verificado en la fase
// de extracción: los 653 días reconstruyen exactamente el crédito ya guardado.

import { readFileSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";
import { media, sd, pct, eur, drawdown } from "./anatomia3-lib.mjs";

// ── PRUEBAS DECLARADAS ANTES DE CORRER. El divisor no se toca luego. ────────────────────────
const SENALES = 13;
const PRUEBAS_COLA = SENALES * 2;          // 13 señales × 2 umbrales ($2.000 y $4.000)
const PRUEBAS_FILTRO = SENALES * 2 * 3;    // 13 señales × 2 direcciones × 3 tamaños de corte
const PRUEBAS = PRUEBAS_COLA + PRUEBAS_FILTRO;   // = 104
const LISTON = listonT(PRUEBAS);
const PERM = 2000;                          // permutaciones por filtro
const MALO = 2000, MUY_MALO = 4000;         // qué es un día malo, en dólares de pérdida

const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"))
  .sort((a, b) => a.fecha.localeCompare(b.fecha));
const CAD = JSON.parse(readFileSync("scripts/cola-sigcred-cadena.json", "utf8"));

const ANOS = (new Date(filas[filas.length - 1].fecha) - new Date(filas[0].fecha)) / (365.25 * 864e5);
const ANCHO_$ = 5000;

// ═══ 1 · CONSTRUIR LAS 13 SEÑALES ══════════════════════════════════════════════════════════
const credHist = [];
for (const f of filas) {
  const c = CAD[f.fecha];
  if (!c) throw new Error(`sin cadena para ${f.fecha}: no se rellena, se para`);
  const ivAtm = (c.ivAtmC + c.ivAtmP) / 2;

  // — lo que el mercado ESPERA —
  f.sigmaPts = f.sigma;                                  // movimiento esperado del resto de sesión
  f.sigmaRatio = 25 / f.sigma;                           // los ±25 fijos, en sigmas
  f.sigmaPct = (f.sigma / f.sp11) * 100;                 // sigma normalizado por nivel del índice
  // — lo que nos PAGAN —
  f.cred = f.credito;
  f.credPct = (f.credito / ANCHO_$) * 100;               // % del ancho de $5.000
  f.credPorSigma = f.credito / f.sigma;                  // $ de crédito por punto esperado
  // mediana de los 60 días ANTERIORES. Sólo pasado.
  const prev = credHist.slice(-60);
  f.credRel60 = prev.length >= 30 ? f.credito / pct(prev, 0.5) : null;
  credHist.push(f.credito);
  // — la SONRISA —
  f.skew = c.ivSP - c.ivSC;                              // put a −25 menos call a +25
  f.sonrisa = (c.ivLC + c.ivLP) / 2 - ivAtm;             // alas (±75) menos el dinero
  f.sonrisaCall = c.ivLC - ivAtm;
  f.sonrisaPut = c.ivLP - ivAtm;
  f.ivAtm = ivAtm;
  f.credDesbal = (c.credPut - c.credCall) / f.credito;   // qué lado paga más
  // contexto (no es señal): la horquilla como % de la prima cobrada
  f.horqPct = (c.horquilla / f.credito) * 100;
}

const CAMPOS = [
  ["σ",  "sigmaPts",    "movimiento esperado del resto de sesión, en puntos"],
  ["σ",  "sigmaRatio",  "los ±25 fijos expresados en sigmas (bajo = se vende casi en el dinero)"],
  ["σ",  "sigmaPct",    "sigma como % del índice"],
  ["$",  "cred",        "crédito cobrado, en dólares"],
  ["$",  "credPct",     "crédito como % del ancho de $5.000"],
  ["$",  "credPorSigma","$ de crédito por punto de movimiento esperado ← la hipótesis"],
  ["$",  "credRel60",   "crédito contra la mediana de los 60 días anteriores"],
  ["$",  "credDesbal",  "desequilibrio put−call del crédito"],
  ["◡",  "skew",        "IV de la put vendida menos IV de la call vendida"],
  ["◡",  "sonrisa",     "IV media de las alas menos IV del dinero"],
  ["◡",  "sonrisaCall", "IV del ala call menos IV del dinero"],
  ["◡",  "sonrisaPut",  "IV del ala put menos IV del dinero"],
  ["◡",  "ivAtm",       "IV del dinero a las 11:00"],
];
if (CAMPOS.length !== SENALES) throw new Error(`declaré ${SENALES} señales y hay ${CAMPOS.length}`);

// ── EL GUARDIÁN: un campo muerto se lee como 0 y se mide durante horas sin enterarse ────────
radiografia(filas, ["pl", ...CAMPOS.map((c) => c[1])], "señales sigma-crédito",
  { maxCeros: 0.2, cerosLegitimos: ["pl"] });

// ═══ 2 · HERRAMIENTAS ══════════════════════════════════════════════════════════════════════
const P = (v, q) => pct(v, q);
const zProp = (x1, n1, x2, n2) => {
  if (!n1 || !n2) return NaN;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (x1 / n1 - x2 / n2) / se : NaN;
};
const tW = (a, b) => {
  const va = sd(a) ** 2 / a.length, vb = sd(b) ** 2 / b.length;
  return (media(a) - media(b)) / Math.sqrt(va + vb);
};
function foto(fs) {
  const pl = fs.map((f) => f.pl);
  const tot = pl.reduce((a, b) => a + b, 0);
  return {
    n: pl.length, total: tot, alAno: tot / ANOS, media: media(pl),
    peor: Math.min(...pl), p1: P(pl, 0.01), p5: P(pl, 0.05),
    dd: drawdown(pl), acierto: pl.filter((x) => x > 0).length / pl.length,
    nMalo: pl.filter((x) => x < -MALO).length, nMuyMalo: pl.filter((x) => x < -MUY_MALO).length,
  };
}
const BASE = foto(filas);

// ═══ 3 · ¿ANTICIPA LA COLA? — tercio alto contra tercio bajo ═══════════════════════════════
console.log("═".repeat(112));
console.log("  SIGMA-CREDITO · ¿el desajuste esperado/pagado anticipa la COLA del cóndor 0DTE?");
console.log(`  ${filas.length} días (${filas[0].fecha} → ${filas[filas.length - 1].fecha}, ${ANOS.toFixed(2)} años) · P&L de 1 contrato, precios reales`);
console.log(`  PRUEBAS DECLARADAS: ${PRUEBAS_COLA} de cola + ${PRUEBAS_FILTRO} de filtro = ${PRUEBAS} · listón Bonferroni |t| ≥ ${LISTON}`);
console.log("═".repeat(112));
console.log(`\n  LÍNEA BASE — sin filtrar:`);
console.log(`    ${BASE.n} días · ${eur(BASE.total)} · ${eur(BASE.alAno)}/año · media ${eur(BASE.media)} · acierto ${(BASE.acierto * 100).toFixed(1)}%`);
console.log(`    PEOR DÍA ${eur(BASE.peor)} · p1 ${eur(BASE.p1)} · p5 ${eur(BASE.p5)} · PEOR RACHA ${eur(BASE.dd)}`);
console.log(`    días con pérdida > $2.000: ${BASE.nMalo} (${(BASE.nMalo / BASE.n * 100).toFixed(1)}%) · > $4.000: ${BASE.nMuyMalo} (${(BASE.nMuyMalo / BASE.n * 100).toFixed(1)}%)`);
console.log(`\n  ⚠️  Con sólo ${BASE.nMuyMalo} días de pérdida > $4.000 en toda la serie, el umbral de $4.000 NO tiene`);
console.log(`     potencia para separar nada. Se mide igual y se declara, pero su lectura es informativa.`);

const anosDe = (f) => f.fecha.slice(0, 4);
const ANOS_LISTA = [...new Set(filas.map(anosDe))].sort();

const cola = [];
console.log("\n## 3.1 · ¿EL TERCIO ALTO SUFRE MÁS COLA QUE EL BAJO?\n");
console.log("| | señal | tercio | media | P(>$2k) | P(>$4k) | p5 | p1 | peor |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [g, campo, desc] of CAMPOS) {
  const val = filas.filter((f) => f[campo] != null && isFinite(f[campo]));
  const ord = [...val].sort((a, b) => b[campo] - a[campo]);
  const k = Math.floor(ord.length / 3);
  const A = ord.slice(0, k), M = ord.slice(k, ord.length - k), B = ord.slice(-k);
  const fA = foto(A), fM = foto(M), fB = foto(B);
  const z2 = zProp(fA.nMalo, fA.n, fB.nMalo, fB.n);
  const z4 = zProp(fA.nMuyMalo, fA.n, fB.nMuyMalo, fB.n);
  const tMedia = tW(A.map((f) => f.pl), B.map((f) => f.pl));

  // signo del efecto de cola en cada año, con los tercios recalculados DENTRO del año
  const porAno = ANOS_LISTA.map((y) => {
    const v = val.filter((f) => anosDe(f) === y).sort((a, b) => b[campo] - a[campo]);
    const kk = Math.floor(v.length / 3);
    if (kk < 20) return { y, s: "?", n: v.length, d: NaN };
    const a = foto(v.slice(0, kk)), b = foto(v.slice(-kk));
    const d = a.nMalo / a.n - b.nMalo / b.n;
    return { y, s: d > 0 ? "+" : d < 0 ? "−" : "0", n: v.length, d };
  });

  cola.push({ g, campo, desc, fA, fM, fB, z2, z4, tMedia, porAno, monot: (fA.nMalo / fA.n >= fM.nMalo / fM.n && fM.nMalo / fM.n >= fB.nMalo / fB.n) || (fA.nMalo / fA.n <= fM.nMalo / fM.n && fM.nMalo / fM.n <= fB.nMalo / fB.n) });

  const fila = (nom, x) => `| | | ${nom} | ${eur(x.media)} | ${(x.nMalo / x.n * 100).toFixed(1)}% | ${(x.nMuyMalo / x.n * 100).toFixed(1)}% | ${eur(x.p5)} | ${eur(x.p1)} | ${eur(x.peor)} |`;
  console.log(`| ${g} | **${campo}** (n=${val.length}) | ALTO | ${eur(fA.media)} | ${(fA.nMalo / fA.n * 100).toFixed(1)}% | ${(fA.nMuyMalo / fA.n * 100).toFixed(1)}% | ${eur(fA.p5)} | ${eur(fA.p1)} | ${eur(fA.peor)} |`);
  console.log(fila("medio", fM));
  console.log(fila("BAJO", fB));
  console.log(`| | ↳ z de P(>$2k) = **${(z2 || 0).toFixed(2)}** · z de P(>$4k) = ${(z4 || 0).toFixed(2)} · t de la media = ${tMedia.toFixed(2)} · monótona: ${cola[cola.length - 1].monot ? "sí" : "no"} · años ${porAno.map((p) => p.s).join("")} | | | | | | | |`);
}

console.log("\n## 3.2 · ORDENADO POR |z| DE LA COLA (el estadístico que decide)\n");
console.log("| señal | z P(>$2k) | monótona | signo por años | ¿pasa el listón (" + LISTON + ")? | qué dice |");
console.log("|---|---|---|---|---|---|");
for (const c of [...cola].sort((a, b) => Math.abs(b.z2 || 0) - Math.abs(a.z2 || 0))) {
  const pasa = Math.abs(c.z2 || 0) >= LISTON && c.monot && new Set(c.porAno.map((p) => p.s)).size === 1;
  console.log(`| \`${c.campo}\` | **${(c.z2 || 0).toFixed(2)}** | ${c.monot ? "sí" : "no"} | ${c.porAno.map((p) => p.s).join("")} | ${pasa ? "🟢 SÍ" : "no"} | ${c.desc} |`);
}

// ═══ 4 · LOS FILTROS, CONTRA 2.000 FILTROS ALEATORIOS DEL MISMO TAMAÑO ══════════════════════
// Un rng reproducible: el resultado no puede depender de la suerte de la corrida.
function rng(semilla) {
  let s = semilla >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function permutar(arr, r) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const CORTES = [0.10, 0.20, 1 / 3];
const filtros = [];
console.log("\n## 4 · SI FILTRARAS — y qué consigue tirar los MISMOS días AL AZAR\n");
console.log("| señal | corte | días | % ingreso | $/año | peor día | peor racha | Calmar | perm. peor | perm. racha |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const [g, campo, desc] of CAMPOS) {
  const val = filas.filter((f) => f[campo] != null && isFinite(f[campo]));
  for (const dir of ["alto", "bajo"]) {
    for (const corte of CORTES) {
      const ord = [...val].sort((a, b) => (dir === "alto" ? b[campo] - a[campo] : a[campo] - b[campo]));
      const nFuera = Math.round(ord.length * corte);
      const fuera = new Set(ord.slice(0, nFuera).map((f) => f.fecha));
      const dentro = val.filter((f) => !fuera.has(f.fecha));       // ya en orden cronológico
      const F = foto(dentro);
      const baseVal = foto(val);                                    // base con la misma muestra

      // ── PERMUTACIÓN: tirar nFuera días AL AZAR, 2.000 veces ──
      const r = rng(0x5eed + campo.length * 977 + (dir === "alto" ? 1 : 2) * 31 + Math.round(corte * 1000));
      const idx = val.map((_, i) => i);
      let mejorPeor = 0, mejorDD = 0, mejorCalmar = 0;
      for (let p = 0; p < PERM; p++) {
        const q = new Set(permutar(idx, r).slice(0, nFuera));
        const pls = [];
        for (let i = 0; i < val.length; i++) if (!q.has(i)) pls.push(val[i].pl);
        const peor = Math.min(...pls), dd = drawdown(pls);
        const tot = pls.reduce((a, b) => a + b, 0);
        if (peor >= F.peor) mejorPeor++;                            // el azar iguala o mejora
        if (dd >= F.dd) mejorDD++;
        if (dd < 0 && (tot / ANOS) / -dd >= F.alAno / -F.dd) mejorCalmar++;
      }
      const pPeor = mejorPeor / PERM, pDD = mejorDD / PERM;
      const calmar = F.dd < 0 ? F.alAno / -F.dd : Infinity;
      const calmarBase = baseVal.dd < 0 ? baseVal.alAno / -baseVal.dd : Infinity;

      filtros.push({ g, campo, desc, dir, corte, F, baseVal, pPeor, pDD, calmar, calmarBase,
        pctIngreso: F.total / baseVal.total, ddEliminado: baseVal.dd - F.dd,
        ingresoPerdido: baseVal.alAno - F.alAno });

      const marca = (pDD <= 0.05 || pPeor <= 0.05) ? " 🟢" : "";
      console.log(`| \`${campo}\` | ${dir} ${(corte * 100).toFixed(0)}% | ${F.n} | ${(F.total / baseVal.total * 100).toFixed(0)}% | ${eur(F.alAno)} | ${eur(F.peor)} | ${eur(F.dd)} | ${calmar.toFixed(2)} | ${pPeor.toFixed(3)} | ${pDD.toFixed(3)}${marca} |`);
    }
  }
}

// ═══ 5 · LOS MEJORES, EN LA MÉTRICA QUE DECIDE ═════════════════════════════════════════════
console.log(`\n## 5 · LA MÉTRICA QUE DECIDE — $/año conservados por cada $ de caída\n`);
console.log(`  Línea base: ${eur(BASE.alAno)}/año con ${eur(BASE.dd)} de peor racha → Calmar ${(BASE.alAno / -BASE.dd).toFixed(2)}`);
console.log(`  Un filtro sólo sirve si sube ese ${(BASE.alAno / -BASE.dd).toFixed(2)} **y** su ventaja no la iguala el azar.\n`);
console.log("| señal | corte | Calmar | $/año | peor racha | $/año perdidos por cada $1.000 de racha eliminada | p permutación (racha) | años |");
console.log("|---|---|---|---|---|---|---|---|");
const ranking = [...filtros].sort((a, b) => b.calmar - a.calmar).slice(0, 12);
for (const f of ranking) {
  const coste = f.ddEliminado > 0 ? (f.ingresoPerdido / f.ddEliminado) * 1000 : NaN;
  // signo por años: ¿el filtro mejora el peor día de CADA año?
  const val = filas.filter((x) => x[f.campo] != null && isFinite(x[f.campo]));
  const ord = [...val].sort((a, b) => (f.dir === "alto" ? b[f.campo] - a[f.campo] : a[f.campo] - b[f.campo]));
  const fuera = new Set(ord.slice(0, Math.round(ord.length * f.corte)).map((x) => x.fecha));
  const sg = ANOS_LISTA.map((y) => {
    const v = val.filter((x) => anosDe(x) === y), d = v.filter((x) => !fuera.has(x.fecha));
    if (!d.length) return "?";
    return drawdown(d.map((x) => x.pl)) > drawdown(v.map((x) => x.pl)) ? "+" : "−";
  }).join("");
  console.log(`| \`${f.campo}\` | ${f.dir} ${(f.corte * 100).toFixed(0)}% | **${f.calmar.toFixed(2)}** | ${eur(f.F.alAno)} | ${eur(f.F.dd)} | ${isFinite(coste) ? "$" + Math.round(coste).toLocaleString("es-ES") : "no elimina racha"} | ${f.pDD.toFixed(3)} | ${sg} |`);
}

// ═══ 6 · VEREDICTO ═════════════════════════════════════════════════════════════════════════
const pasanCola = cola.filter((c) => Math.abs(c.z2 || 0) >= LISTON && c.monot && new Set(c.porAno.map((p) => p.s)).size === 1);
const pasanFiltro = filtros.filter((f) => f.pDD <= 0.05 / PRUEBAS_FILTRO && f.calmar > BASE.alAno / -BASE.dd);
const mejorCola = [...cola].sort((a, b) => Math.abs(b.z2 || 0) - Math.abs(a.z2 || 0))[0];
const mejorFiltro = [...filtros].sort((a, b) => a.pDD - b.pDD || b.calmar - a.calmar)[0];

console.log("\n" + "═".repeat(112));
console.log(`  VEREDICTO · señales de cola que pasan: ${pasanCola.length}/${SENALES} · filtros que pasan: ${pasanFiltro.length}/${PRUEBAS_FILTRO}`);
console.log("═".repeat(112));
console.log(`\n  La señal de cola más fuerte: \`${mejorCola.campo}\` — z = ${(mejorCola.z2 || 0).toFixed(2)} contra un listón de ${LISTON}`);
console.log(`     ${mejorCola.desc}`);
console.log(`     tercio ALTO: ${(mejorCola.fA.nMalo / mejorCola.fA.n * 100).toFixed(1)}% de días con pérdida > $2.000 · tercio BAJO: ${(mejorCola.fB.nMalo / mejorCola.fB.n * 100).toFixed(1)}%`);
console.log(`     monótona: ${mejorCola.monot ? "sí" : "no"} · signo por años: ${mejorCola.porAno.map((p) => p.s).join("")}`);
console.log(`\n  El filtro que mejor bate al azar: \`${mejorFiltro.campo}\` ${mejorFiltro.dir} ${(mejorFiltro.corte * 100).toFixed(0)}%`);
console.log(`     p de permutación (racha) = ${mejorFiltro.pDD.toFixed(4)} · p (peor día) = ${mejorFiltro.pPeor.toFixed(4)}`);
console.log(`     conserva ${(mejorFiltro.pctIngreso * 100).toFixed(0)}% del ingreso (${eur(mejorFiltro.F.alAno)}/año), peor racha ${eur(mejorFiltro.F.dd)} (base ${eur(BASE.dd)})`);

writeFileSync("scripts/cola-sigma-credito-salida.json", JSON.stringify({
  base: BASE, anos: ANOS, liston: LISTON, pruebas: { cola: PRUEBAS_COLA, filtro: PRUEBAS_FILTRO, total: PRUEBAS },
  cola: cola.map((c) => ({ campo: c.campo, desc: c.desc, z2: c.z2, z4: c.z4, tMedia: c.tMedia, monot: c.monot,
    porAno: c.porAno, alto: c.fA, medio: c.fM, bajo: c.fB })),
  filtros: filtros.map((f) => ({ campo: f.campo, dir: f.dir, corte: f.corte, pPeor: f.pPeor, pDD: f.pDD,
    calmar: f.calmar, pctIngreso: f.pctIngreso, ddEliminado: f.ddEliminado, ingresoPerdido: f.ingresoPerdido, F: f.F })),
}, null, 2), "utf8");
console.log("\n  detalle en scripts/cola-sigma-credito-salida.json");
