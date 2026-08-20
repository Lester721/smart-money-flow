// PASO 7 — LA COMBINACIÓN OPERABLE: filtro rodante (recorta la RACHA) + ala más estrecha
// (recorta el PEOR DÍA). Las dos piezas atacan cosas distintas y no se pisan.
// Todo con precios reales de la cadena de las 11:00 y sin usar el futuro en ningún umbral.
import { readFileSync } from "node:fs";

const gex = JSON.parse(readFileSync("scripts/cola-gex-filas.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const dias = new Map(JSON.parse(readFileSync("scripts/cola-cadena11.json", "utf8")).map((d) => [d.fecha, d]));
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pctil = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b[0] - o) < Math.abs(a[0] - o) ? b : a));
const ANIOS = 653 / 252;

// filtro rodante sobre los 60 días previos (señal y umbral, ambos del pasado)
function fueraRodante(campo, q, sentido) {
  const fuera = new Set();
  for (let i = 0; i < gex.length; i++) {
    const v = gex[i][campo]; if (v == null || !isFinite(v)) continue;
    const ven = gex.slice(Math.max(0, i - 60), i).map((r) => r[campo]).filter((x) => x != null && isFinite(x));
    if (ven.length < 30) continue;
    const p = ven.filter((x) => x < v).length / ven.length;
    if (sentido === "bajo" ? p < q : p > 1 - q) fuera.add(gex[i].fecha);
  }
  return fuera;
}
function condor(d, ala) {
  const cC = cerca(d.C, d.spot + 25), pC = cerca(d.P, d.spot - 25);
  const cL = cerca(d.C, cC[0] + ala), pL = cerca(d.P, pC[0] - ala);
  if (cL[0] <= cC[0] || pL[0] >= pC[0]) return null;
  const cr = cC[1] + pC[1] - cL[2] - pL[2]; if (!(cr > 0)) return null;
  const pl = (cr - Math.min(Math.max(d.cierre - cC[0], 0), cL[0] - cC[0])
                 - Math.min(Math.max(pC[0] - d.cierre, 0), pC[0] - pL[0])) * 100 - 8 * 0.03;
  return { pl, col: (Math.max(cL[0] - cC[0], pC[0] - pL[0]) - cr) * 100 };
}
function res(ops) {
  const pls = ops.map((o) => o.pl), total = pls.reduce((s, x) => s + x, 0);
  let pico = 0, ac = 0, peor = 0;
  for (const o of ops) { ac += o.pl; pico = Math.max(pico, ac); peor = Math.min(peor, ac - pico); }
  return { n: ops.length, total, porAnio: total / ANIOS, peor: Math.min(...pls), p1: pctil(pls, 0.01),
    p5: pctil(pls, 0.05), racha: peor, m2k: pls.filter((x) => x < -2000).length,
    m4k: pls.filter((x) => x < -4000).length, ac: pls.filter((x) => x > 0).length / pls.length,
    col: Math.max(...ops.map((o) => o.col)) };
}

const FILTROS = [
  ["ninguno", null],
  ["GEX rodante 20% (zonaSobreTot)", fueraRodante("zonaSobreTotal", 0.2, "bajo")],
  ["crédito rodante 20% (sin gamma)", fueraRodante("credito", 0.2, "alto")],
];
const base = res([...dias.values()].map((d) => condor(d, 50)).filter(Boolean));

console.log(`═══ COMBINACIÓN: filtro rodante × anchura del ala ═══`);
console.log(`Base (±25 pts, ala 50, sin filtro): ${eur(base.porAnio)}/año · peor día ${eur(base.peor)} · peor racha ${eur(base.racha)}\n`);
console.log("| filtro | ala | días | $/año | % ingreso | acierto | PEOR DÍA | Δ peor día | p1 | p5 | PEOR RACHA | Δ racha | <−2k | <−4k | colateral | $/año por $1k colateral |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const tabla = [];
for (const [nom, fuera] of FILTROS) {
  for (const ala of [50, 40, 30]) {
    const ops = [];
    for (const [fecha, d] of dias) {
      if (fuera && fuera.has(fecha)) continue;
      const c = condor(d, ala); if (c) ops.push(c);
    }
    const R = res(ops); tabla.push({ nom, ala, R });
    console.log(`| ${nom} | ${ala} | ${R.n} | ${eur(R.porAnio)} | ${(R.porAnio / base.porAnio * 100).toFixed(0)}% | ${(R.ac * 100).toFixed(1)}% | ${eur(R.peor)} | ${eur(R.peor - base.peor)} | ${eur(R.p1)} | ${eur(R.p5)} | ${eur(R.racha)} | ${eur(R.racha - base.racha)} | ${R.m2k} | ${R.m4k} | ${eur(R.col)} | ${eur(R.porAnio / (R.col / 1000))} |`);
  }
}

// A MISMO COLATERAL: cuántos contratos caben y qué sale
console.log(`\n\n═══ A MISMO RIESGO — escalar contratos hasta el colateral de la base ($5.115) ═══`);
console.log(`El ala estrecha libera colateral. Si se reinvierte en contratos, ¿mejora o empeora?\n`);
console.log("| filtro | ala | contratos a $5.115 | $/año escalado | PEOR DÍA escalado | PEOR RACHA escalada |");
console.log("|---|---|---|---|---|---|");
for (const t of tabla) {
  const n = Math.floor(base.col / t.R.col);
  console.log(`| ${t.nom} | ${t.ala} | ${n} | ${eur(t.R.porAnio * n)} | ${eur(t.R.peor * n)} | ${eur(t.R.racha * n)} |`);
}

// año a año de la recomendación
console.log(`\n\n═══ AÑO A AÑO de la recomendación (GEX rodante 20% + ala 40) ═══\n`);
const fuera = FILTROS[1][1];
console.log("| año | días | $ del año | peor día | peor racha | días<−2k |");
console.log("|---|---|---|---|---|---|");
for (const a of ["2024", "2025", "2026"]) {
  for (const [nom, fu, ala] of [["base ±25/50", null, 50], ["GEX rod. 20% + ala 40", fuera, 40]]) {
    const ops = [];
    for (const [fecha, d] of dias) {
      if (!fecha.startsWith(a)) continue;
      if (fu && fu.has(fecha)) continue;
      const c = condor(d, ala); if (c) ops.push(c);
    }
    const R = res(ops);
    console.log(`| ${a} ${nom} | ${R.n} | ${eur(R.total)} | ${eur(R.peor)} | ${eur(R.racha)} | ${R.m2k} |`);
  }
}
