// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASO 6 — EL VEREDICTO. Tres preguntas que deciden si hay algo que operar.
//
//  1. ¿POR QUÉ NO BAJA NUNCA EL PEOR DÍA? — hipótesis: porque el peor día NO es un suceso de
//     cola, es la pérdida MÁXIMA DE DISEÑO de la estructura ((ala − crédito) × 100). Si es eso,
//     ningún filtro del mundo lo baja, y decirle a Lester "mejora la caída" mirando el peor día
//     es mirar el sitio equivocado.
//  2. El único filtro que salió bien en la versión operable (percentil rodante de 60 días):
//     ¿aguanta los TRES años, o vive en uno?
//  3. ¿Lo hace el GEX, o lo hace la IV RELATIVA (alta contra su propio pasado reciente)?
//     Esta es la pregunta final: si la IV rodante sola da lo mismo, el GEX no aporta nada.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";

const filas = JSON.parse(readFileSync("scripts/cola-gex-filas.json", "utf8"))
  .sort((a, b) => a.fecha.localeCompare(b.fecha));
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pctil = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const ANIOS = filas.length / 252;

// ═══ 1 · ¿EL PEOR DÍA ES PÉRDIDA MÁXIMA DE DISEÑO? ═════════════════════════════════════════
console.log(`═══ 1 · ¿QUÉ ES EL "PEOR DÍA"? ═══\n`);
console.log(`Pérdida máxima de diseño del cóndor = (ala 50 − crédito) × 100 − comisiones.\n`);
console.log("| fecha | P&L | pérdida máxima de diseño | ¿tocó el máximo? | crédito | mov del día |");
console.log("|---|---|---|---|---|---|");
const peores = [...filas].sort((a, b) => a.pl - b.pl).slice(0, 12);
for (const f of peores) {
  const maxPerd = -((50 - f.credito) * 100 + 8 * 0.03);
  console.log(`| ${f.fecha} | ${eur(f.pl)} | ${eur(maxPerd)} | ${Math.abs(f.pl - maxPerd) < 1 ? "SÍ" : "no"} | $${f.credito.toFixed(2)} | ${(f.movDia * 100).toFixed(2)}% |`);
}
const tocan = filas.filter((f) => Math.abs(f.pl - (-((50 - f.credito) * 100 + 8 * 0.03))) < 1).length;
console.log(`\n→ ${tocan} de ${filas.length} días acaban EXACTAMENTE en la pérdida máxima de diseño.`);
console.log(`  El "peor día" del backtest no es un suceso raro que se pueda predecir: es el TOPE`);
console.log(`  de la estructura. Sólo se baja estrechando el ala (menos colateral), no filtrando.`);
{
  const s = filas.map((f) => (50 - f.credito) * 100).sort((a, b) => a - b);
  console.log(`  Pérdida máxima de diseño: mín ${eur(s[0])} · mediana ${eur(s[s.length >> 1])} · máx ${eur(s[s.length - 1])}`);
}

// ═══ 2 y 3 · EL FILTRO RODANTE, AÑO A AÑO, GEX vs IV RELATIVA ══════════════════════════════
function rodante(campo, q, sentido) {   // sentido: "bajo" = fuera si está en el q% más bajo
  const fuera = new Set();
  for (let i = 0; i < filas.length; i++) {
    const v = filas[i][campo]; if (v == null || !isFinite(v)) continue;
    const ven = filas.slice(Math.max(0, i - 60), i).map((r) => r[campo]).filter((x) => x != null && isFinite(x));
    if (ven.length < 30) continue;
    const p = ven.filter((x) => x < v).length / ven.length;
    if (sentido === "bajo" ? p < q : p > 1 - q) fuera.add(filas[i].fecha);
  }
  return fuera;
}
function res(ops, anios) {
  const pls = ops.map((o) => o.pl), total = pls.reduce((s, x) => s + x, 0);
  let pico = 0, ac = 0, peor = 0;
  for (const o of ops) { ac += o.pl; pico = Math.max(pico, ac); peor = Math.min(peor, ac - pico); }
  return { n: ops.length, porAnio: total / anios, peor: Math.min(...pls), p5: pctil(pls, 0.05),
           racha: peor, m2k: pls.filter((x) => x < -2000).length };
}
const BASE = res(filas, ANIOS);

console.log(`\n\n═══ 2 y 3 · EL FILTRO RODANTE (60 días previos) — ¿GEX o IV relativa? ═══`);
console.log(`Nada de esto usa el futuro: ni la señal ni el umbral.\n`);
const CANDIDATOS = [
  ["zonaSobreTot rodante", "zonaSobreTotal", "bajo", "GEX: % de gamma dentro de ±25 pts, contra sus 60 días"],
  ["gexNetSuave rodante", "gexNetSuave", "bajo", "GEX: neto en $, contra sus 60 días"],
  ["ivATM rodante", "ivATM", "alto", "CONTROL sin gamma: IV del dinero contra sus 60 días"],
  ["credito rodante", "credito", "alto", "CONTROL sin gamma: crédito contra sus 60 días"],
  ["anchoRel rodante", "anchoRel", "bajo", "CONTROL sin gamma: 25 pts/σ contra sus 60 días"],
];
console.log("| filtro (quita el 20% más extremo) | qué es | días fuera | $/año | % ingreso | peor día | PEOR RACHA | Δ racha | p5 | días<−2k | $año/$caída |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const guardados = {};
for (const [nom, campo, sent, que] of CANDIDATOS) {
  const fuera = rodante(campo, 0.2, sent);
  const dentro = filas.filter((f) => !fuera.has(f.fecha));
  const R = res(dentro, ANIOS); guardados[nom] = { fuera, dentro, R };
  const ah = R.racha - BASE.racha, pe = BASE.porAnio - R.porAnio;
  console.log(`| ${nom} | ${que} | ${fuera.size} | ${eur(R.porAnio)} | ${(R.porAnio / BASE.porAnio * 100).toFixed(0)}% | ${eur(R.peor)} | ${eur(R.racha)} | ${eur(ah)} | ${eur(R.p5)} | ${R.m2k} | ${ah > 0 ? "$" + (pe / ah).toFixed(2) : "—"} |`);
}
console.log(`| **sin filtro (base)** | | 0 | ${eur(BASE.porAnio)} | 100% | ${eur(BASE.peor)} | ${eur(BASE.racha)} | — | ${eur(BASE.p5)} | ${BASE.m2k} | — |`);

// solapamiento: ¿son el mismo filtro?
console.log(`\n── ¿son el MISMO filtro? días que coinciden ──`);
console.log("| | " + CANDIDATOS.map((c) => c[0]).join(" | ") + " |");
console.log("|---" + CANDIDATOS.map(() => "|---").join("") + "|");
for (const [n1] of CANDIDATOS) {
  const a = guardados[n1].fuera;
  const fila = CANDIDATOS.map(([n2]) => {
    const b = guardados[n2].fuera;
    const inter = [...a].filter((x) => b.has(x)).length;
    return `${(inter / Math.min(a.size, b.size) * 100).toFixed(0)}%`;
  });
  console.log(`| ${n1} | ${fila.join(" | ")} |`);
}

// año a año
console.log(`\n── AÑO A AÑO: ¿vive el filtro en un solo año? ──`);
console.log("| filtro | 2024 $/año | 2025 $/año | 2026 $/año | racha 2024 | 2025 | 2026 | ¿mejora la racha los 3 años? |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [nom] of [...CANDIDATOS, ["sin filtro (base)"]]) {
  const dentro = nom === "sin filtro (base)" ? filas : guardados[nom].dentro;
  const por = ["2024", "2025", "2026"].map((a) => {
    const g = dentro.filter((f) => f.fecha.startsWith(a));
    const b = filas.filter((f) => f.fecha.startsWith(a));
    if (!g.length) return null;
    return { R: res(g, g.length / 252), B: res(b, b.length / 252) };
  });
  const mejora = por.every((p) => p && p.R.racha >= p.B.racha);
  console.log(`| ${nom} | ${por.map((p) => eur(p.R.porAnio)).join(" | ")} | ${por.map((p) => eur(p.R.racha)).join(" | ")} | ${nom === "sin filtro (base)" ? "—" : mejora ? "SÍ" : "NO"} |`);
}

// ═══ 4 · ¿Y SI SE ESTRECHA EL ALA? — lo único que baja el peor día ════════════════════════
console.log(`\n\n═══ 4 · LO ÚNICO QUE BAJA EL PEOR DÍA: ESTRECHAR EL ALA ═══`);
console.log(`(mismo cóndor, ±25 pts, pero alas de 50/40/30/20/15 puntos — se rehace con precios reales)\n`);
const dias = JSON.parse(readFileSync("scripts/cola-cadena11.json", "utf8"));
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b[0] - o) < Math.abs(a[0] - o) ? b : a));
console.log("| ala | días | $/año | % ingreso | PEOR DÍA | p1 | p5 | PEOR RACHA | colateral máx | $/año por $1.000 de colateral |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const ala of [50, 40, 30, 25, 20, 15, 10]) {
  const ops = [];
  for (const d of dias) {
    const cC = cerca(d.C, d.spot + 25), pC = cerca(d.P, d.spot - 25);
    const cL = cerca(d.C, cC[0] + ala), pL = cerca(d.P, pC[0] - ala);
    if (cL[0] <= cC[0] || pL[0] >= pC[0]) continue;
    const cr = cC[1] + pC[1] - cL[2] - pL[2]; if (!(cr > 0)) continue;
    const pl = (cr - Math.min(Math.max(d.cierre - cC[0], 0), cL[0] - cC[0])
                   - Math.min(Math.max(pC[0] - d.cierre, 0), pC[0] - pL[0])) * 100 - 8 * 0.03;
    ops.push({ pl, col: (Math.max(cL[0] - cC[0], pC[0] - pL[0]) - cr) * 100 });
  }
  if (ops.length < 100) continue;
  const R = res(ops, ops.length / 252);
  const colMax = Math.max(...ops.map((o) => o.col));
  console.log(`| ${ala} pts | ${ops.length} | ${eur(R.porAnio)} | ${(R.porAnio / BASE.porAnio * 100).toFixed(0)}% | ${eur(R.peor)} | ${eur(pctil(ops.map(o=>o.pl),0.01))} | ${eur(R.p5)} | ${eur(R.racha)} | ${eur(colMax)} | ${eur(R.porAnio / (colMax / 1000))} |`);
}
