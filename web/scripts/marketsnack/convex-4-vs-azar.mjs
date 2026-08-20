// ═══ CONVEXIDAD · PASO 4 — ¿ELIGE MEJOR QUE EL AZAR? ════════════════════════════════════
//
// El perfil convexo (call fuera del dinero a un año) YA se sabe que a veces multiplica y que
// NO SE PUEDE ELEGIR cuál: el mismo perfil dio 22,66x en 2019 y 0,11x en 2021. La pregunta,
// entonces, no es si el perfil paga: es si el flujo de MarketSnack SELECCIONA dentro de él.
//
// EL NULO ES EL AZAR, NO EL CERO. Cada día se compara la elección de MS contra 500 sorteos que
// eligen entre EXACTAMENTE los mismos candidatos, el mismo día, con el mismo perfil y los mismos
// precios reales. Lo único que cambia es QUIÉN elige. Así el mercado se cancela: si abril subió
// para todos, subió también para el azar.
//
// DOS NULOS, porque uno solo se puede engañar:
//   A · SORTEO UNIFORME     — elige al azar entre los candidatos del día. Mide composición+momento.
//   B · BARAJA DE FECHAS    — conserva EXACTAMENTE los tickers que eligió MS y les cambia la
//                             fecha. Si MS gana en A pero no en B, no eligió el ticker: se
//                             inclinó a los tickers volátiles, que es otra cosa y no es señal.
//
// n EFECTIVA: entrando cada día y aguantando H, las operaciones SE SOLAPAN. La n que cuenta no
// es el número de filas ni el de días: es la que sale de descontar esa autocorrelación
// (Newey-West sobre la serie diaria del exceso). Se imprime siempre.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/convex-4-vs-azar.mjs

import fs from "node:fs";
import path from "node:path";
import { listonT } from "../../lib/barreraHallazgos.ts";

const filas = JSON.parse(fs.readFileSync(path.join("scripts", "marketsnack", "convex-3-tabla.json"), "utf8"));
const CUENTA = 56389;
const SORTEOS = 500;
const SEÑALES = { s1: "lado de las calls", s2: "lado de las calls a ≥180d", s3: "inusualidad de la compra" };
const HS = [5, 10, 20, 40];
const KS = [1, 3];

// generador reproducible
let semilla = 20260820;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };

const media = (v) => v.reduce((s, x) => s + x, 0) / v.length;

/** t y n efectiva de una serie diaria con operaciones que se solapan H días (Newey-West). */
function neweyWest(serie, H) {
  const n = serie.length, m = media(serie);
  const dev = serie.map((x) => x - m);
  const g0 = dev.reduce((s, x) => s + x * x, 0) / n;
  if (!(g0 > 0)) return { m, t: 0, nEf: n, se: 0 };
  let S = g0;
  const L = Math.max(0, H - 1);
  for (let k = 1; k <= L && k < n; k++) {
    let gk = 0;
    for (let i = k; i < n; i++) gk += dev[i] * dev[i - k];
    gk /= n;
    S += 2 * (1 - k / (L + 1)) * gk;
  }
  if (!(S > 0)) S = g0;                       // si la corrección se pasa de frenada, no se inventa
  const se = Math.sqrt(S / n);
  return { m, t: m / se, nEf: n * g0 / S, se };
}

const resultados = [];

for (const tipo of ["C", "P"]) {
  for (const sen of ["s1", "s2", "s3"]) {
    for (const H of HS) {
      const rk = `r${H}`;
      // candidatos válidos: mismo tipo, con retorno a H y con la señal disponible
      const val = filas.filter((f) => f.tipo === tipo && f[rk] != null && f[sen] != null);
      const porDia = new Map();
      for (const f of val) { if (!porDia.has(f.dia)) porDia.set(f.dia, []); porDia.get(f.dia).push(f); }
      for (const K of KS) {
        const dias = [...porDia.keys()].sort().filter((d) => porDia.get(d).length >= K + 2);
        if (dias.length < 20) continue;

        // ── elección de MS ──
        // call → el flujo MÁS alcista.   put → el flujo MÁS bajista. Es el mecanismo, no una opción.
        const elegidos = [], serieMS = [], serieExc = [], serieMed = [];
        for (const d of dias) {
          const c = [...porDia.get(d)].sort((a, b) => tipo === "C" ? b[sen] - a[sen] : a[sen] - b[sen]);
          const pick = c.slice(0, K);
          const rMS = media(pick.map((x) => x[rk]));
          const rDia = media(c.map((x) => x[rk]));
          elegidos.push(...pick);
          serieMS.push(rMS); serieMed.push(rDia); serieExc.push(rMS - rDia);
        }
        const R = media(serieMS), RM = media(serieMed);

        // ── NULO A: sorteo uniforme entre los mismos candidatos ──
        const nulA = [];
        for (let s = 0; s < SORTEOS; s++) {
          const v = [];
          for (const d of dias) {
            const c = porDia.get(d), idxs = new Set();
            while (idxs.size < K) idxs.add(Math.floor(rnd() * c.length));
            v.push(media([...idxs].map((i) => c[i][rk])));
          }
          nulA.push(media(v));
        }
        nulA.sort((a, b) => a - b);
        const pctA = nulA.filter((x) => x < R).length / SORTEOS;

        // ── NULO B: los MISMOS tickers, otra fecha ──
        const porTicker = new Map();
        for (const f of val) { if (!porTicker.has(f.ticker)) porTicker.set(f.ticker, []); porTicker.get(f.ticker).push(f); }
        const nulB = [];
        for (let s = 0; s < SORTEOS; s++) {
          const v = elegidos.map((e) => {
            const pool = porTicker.get(e.ticker);
            return pool[Math.floor(rnd() * pool.length)][rk];
          });
          nulB.push(media(v));
        }
        nulB.sort((a, b) => a - b);
        const pctB = nulB.filter((x) => x < R).length / SORTEOS;

        const nw = neweyWest(serieExc, H);
        // dinero: se entra cada día y se aguanta H → hay K×H contratos vivos a la vez
        const primaMedia = media(elegidos.map((e) => e.ask * 100));
        const capital = K * H * primaMedia;
        const anual = 252 * R / H;                       // retorno anual sobre el capital desplegado
        resultados.push({
          tipo, sen, H, K, dias: dias.length, nEf: nw.nEf,
          R, RM, exceso: nw.m, t: nw.t, pctA, pctB,
          nulAmed: media(nulA), nulAp95: nulA[Math.floor(SORTEOS * 0.95)],
          primaMedia, capital, anual, dolares: anual * Math.min(capital, CUENTA),
        });
      }
    }
  }
}

// ── SALIDA ────────────────────────────────────────────────────────────────────────────────
const nPruebas = resultados.length;
const LISTON = listonT(nPruebas);
const LISTON_FAM = listonT(nPruebas + 12);   // + las 11 métricas y el score ya medidos de MS

console.log(`\n═══ ¿ELIGE MARKETSNACK MEJOR QUE EL AZAR DENTRO DEL PERFIL CONVEXO? ═══`);
console.log(`\n${nPruebas} pruebas en este estudio · listón t = ${LISTON}`);
console.log(`con las 12 de MS ya hechas: ${nPruebas + 12} pruebas · listón t = ${LISTON_FAM}`);
console.log(`\ncolumnas:  R = retorno medio por operación de la elección de MS`);
console.log(`           azar = retorno medio de los 500 sorteos uniformes`);
console.log(`           %A = percentil de R en el sorteo uniforme (hace falta >95 para ganar)`);
console.log(`           %B = percentil con los MISMOS tickers y otra fecha (aísla el momento)`);
console.log(`           t = t de Newey-West del exceso diario (descuenta el solape)`);
console.log(`           nEf = n EFECTIVA tras descontar el solape (los días son ${resultados[0]?.dias})\n`);

const cab = `tipo señal H  K | días  nEf |     R      azar   exceso |   t    %A   %B | anual   $/año`;
console.log(cab); console.log("─".repeat(cab.length));
for (const r of resultados) {
  console.log(
    `${r.tipo}    ${r.sen}   ${String(r.H).padStart(2)} ${r.K} | ${String(r.dias).padStart(3)}  ${r.nEf.toFixed(1).padStart(4)} |` +
    ` ${(r.R * 100).toFixed(1).padStart(6)}% ${(r.nulAmed * 100).toFixed(1).padStart(6)}% ${(r.exceso * 100).toFixed(1).padStart(6)}% |` +
    ` ${r.t.toFixed(2).padStart(5)} ${(r.pctA * 100).toFixed(0).padStart(3)} ${(r.pctB * 100).toFixed(0).padStart(3)} |` +
    ` ${(r.anual * 100).toFixed(0).padStart(5)}% ${("$" + Math.round(r.dolares).toLocaleString("es")).padStart(9)}`,
  );
}

// ── el pre-registrado ─────────────────────────────────────────────────────────────────────
const P = resultados.find((r) => r.tipo === "C" && r.sen === "s1" && r.H === 20 && r.K === 3);
console.log(`\n─── EL PRE-REGISTRADO: call · lado de las calls · H=20 · top-3 ───`);
if (P) {
  console.log(`  MS elige   : ${(P.R * 100).toFixed(1)}% por operación`);
  console.log(`  el azar    : ${(P.nulAmed * 100).toFixed(1)}% de media · p95 del sorteo ${(P.nulAp95 * 100).toFixed(1)}%`);
  console.log(`  exceso     : ${(P.exceso * 100).toFixed(1)} puntos · t ${P.t.toFixed(2)} contra un listón de ${LISTON}`);
  console.log(`  percentil  : A=${(P.pctA * 100).toFixed(0)}  B=${(P.pctB * 100).toFixed(0)}   (hace falta >95)`);
  console.log(`  n efectiva : ${P.nEf.toFixed(1)} de ${P.dias} días  → cada bet independiente vale ${(P.dias / P.nEf).toFixed(1)} días`);
  console.log(`  capital    : $${Math.round(P.capital).toLocaleString("es")} vivos a la vez (${P.K}×${P.H} contratos × $${Math.round(P.primaMedia)} de prima)`);
  console.log(`  en dinero  : ${(P.anual * 100).toFixed(0)}%/año sobre ese capital = $${Math.round(P.dolares).toLocaleString("es")}/año`);
}

// ── cuántas de las 48 superan el azar ─────────────────────────────────────────────────────
const ganA = resultados.filter((r) => r.pctA > 0.95);
const ganAB = resultados.filter((r) => r.pctA > 0.95 && r.pctB > 0.95);
const ganListon = resultados.filter((r) => r.t > LISTON);
console.log(`\n─── RECUENTO SOBRE LAS ${nPruebas} PRUEBAS ───`);
console.log(`  superan el sorteo uniforme (pct>95): ${ganA.length}  · esperadas por azar: ${(nPruebas * 0.05).toFixed(1)}`);
console.log(`  superan A Y B a la vez            : ${ganAB.length}`);
console.log(`  superan el listón de t (${LISTON})     : ${ganListon.length}`);
if (ganA.length) console.log(`  las que pasan A: ${ganA.map((r) => `${r.tipo}/${r.sen}/H${r.H}/K${r.K} (A=${(r.pctA * 100).toFixed(0)} B=${(r.pctB * 100).toFixed(0)} t=${r.t.toFixed(2)})`).join(" · ")}`);

const medPct = [...resultados].sort((a, b) => a.pctA - b.pctA);
console.log(`  percentil A: mediana ${(medPct[Math.floor(nPruebas / 2)].pctA * 100).toFixed(0)} · min ${(medPct[0].pctA * 100).toFixed(0)} · max ${(medPct[nPruebas - 1].pctA * 100).toFixed(0)}`);
console.log(`  (si MS no aportara nada, la mediana debería estar en 50 y repartirse uniforme)`);

fs.writeFileSync(path.join("scripts", "marketsnack", "convex-4-salida.json"),
  JSON.stringify({ nPruebas, LISTON, LISTON_FAM, resultados, preRegistrado: P }), "utf8");
console.log(`\n## guardado en scripts/marketsnack/convex-4-salida.json`);
