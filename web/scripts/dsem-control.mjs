// EL CONTROL · ¿la regla del calendario vale algo, o basta con operar menos?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/dsem-control.mjs
//
// ═══ POR QUÉ HACE FALTA ═════════════════════════════════════════════════════════════════════
// En 2022-2023 el cóndor pierde $65 al día. CUALQUIER filtro que se salte la mitad de los días
// parte la pérdida por la mitad y quita la mitad de la caída. Si no se compara contra saltarse
// los MISMOS días al azar, un filtro de calendario que no sabe nada se ve idéntico a uno bueno.
//
// Dos controles, y el segundo es el que de verdad aprieta:
//   · AZAR      — se saltan N días elegidos al azar, 20.000 veces. ¿En qué percentil cae la regla?
//   · CALENDARIO DESPLAZADO — la MISMA regla corrida k sesiones. Conserva el número de días y su
//     espaciado (12 al año, uno por mes), así que sólo puede fallar si la fecha concreta importa.
//     Es el control que mata a «último día del mes» si el efecto fuera de tener un día al mes.

import { readFileSync } from "node:fs";
import { tWelch, listonT } from "../lib/barreraHallazgos";

const PRUEBAS = 62, LISTON = listonT(PRUEBAS), EFECTIVO = 7977, DIAS_ANO = 252;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : NaN; };
function drawdown(pls) { let acc = 0, pico = 0, peor = 0; for (const p of pls) { acc += p; if (acc > pico) pico = acc; const dd = acc - pico; if (dd < peor) peor = dd; } return peor; }

// ── datos + calendario (idéntico a dsem-cruce.mjs) ─────────────────────────────────────────
const filas = JSON.parse(readFileSync("scripts/dsem-filas.json", "utf8"));
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const FEST = new Set(["2022-01-17","2022-02-21","2022-04-15","2022-05-30","2022-06-20","2022-07-04","2022-09-05","2022-11-24","2022-12-26",
"2023-01-02","2023-01-16","2023-02-20","2023-04-07","2023-05-29","2023-06-19","2023-07-04","2023-09-04","2023-11-23","2023-12-25",
"2024-01-01","2024-01-15","2024-02-19","2024-03-29","2024-05-27","2024-06-19","2024-07-04","2024-09-02","2024-11-28","2024-12-25",
"2025-01-01","2025-01-09","2025-01-20","2025-02-17","2025-04-18","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-11-27","2025-12-25",
"2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25"]);
const iso = (d) => d.toISOString().slice(0, 10);
const SESIONES = [];
for (let d = new Date("2021-12-01T00:00:00Z"); iso(d) <= "2026-12-31"; d.setUTCDate(d.getUTCDate() + 1)) {
  const s = iso(d), w = d.getUTCDay();
  if (w !== 0 && w !== 6 && !FEST.has(s)) SESIONES.push(s);
}
const POS = new Map(SESIONES.map((s, i) => [s, i]));
for (const f of filas) {
  const i = POS.get(f.fecha);
  f.dow = new Date(f.fecha + "T00:00:00Z").getUTCDay();
  f.mes = +f.fecha.slice(5, 7); f.ano = +f.fecha.slice(0, 4);
  let k = 0; while (SESIONES[i + k + 1] && SESIONES[i + k + 1].slice(0, 7) === f.fecha.slice(0, 7)) k++;
  f.posFin = k;
  f.ultimoMes = k === 0 ? 1 : 0;
  f.ultimos2 = k <= 1 ? 1 : 0;
  f.finTrim = k === 0 && [3, 6, 9, 12].includes(f.mes) ? 1 : 0;
  f.periodo = f.fecha < "2024-01-01" ? "A" : "B";
}
const A = filas.filter((f) => f.periodo === "A"), B = filas.filter((f) => f.periodo === "B");
const anos = (g) => g.length / DIAS_ANO;

function ev(base, filtro) {
  const serie = base.map((f) => (filtro(f) ? 0 : f.pl));
  const op = base.filter((f) => !filtro(f)).map((f) => f.pl);
  const total = serie.reduce((a, b) => a + b, 0);
  let caja = EFECTIVO, minCaja = EFECTIVO;
  for (const x of serie) { caja += x; if (caja < minCaja) minCaja = caja; }
  return { nOp: op.length, nSalta: base.length - op.length, alAno: total / anos(base),
    peor: op.length ? Math.min(...op) : 0, p1: pct(serie, 0.01), p5: pct(serie, 0.05),
    dd: drawdown(serie), acierto: op.length ? op.filter((x) => x > 0).length / op.length : NaN, minCaja };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1 · LAS REGLAS CANDIDATAS, MEDIDAS EN LOS DOS PERÍODOS POR SEPARADO
// ═════════════════════════════════════════════════════════════════════════════════════════════
const REGLAS = [
  ["R0 · operar todos los días (base)", () => false],
  ["R1 · saltarse el ÚLTIMO día hábil del mes", (f) => f.ultimoMes === 1],
  ["R2 · saltarse los DOS últimos del mes", (f) => f.ultimos2 === 1],
  ["R3 · saltarse sólo el fin de TRIMESTRE", (f) => f.finTrim === 1],
  ["R4 · saltarse los JUEVES", (f) => f.dow === 4],
  ["R5 · R1 + R4 (último del mes y jueves)", (f) => f.ultimoMes === 1 || f.dow === 4],
];
console.log("═".repeat(122));
console.log("1 · LAS REGLAS, EN LOS DOS PERÍODOS POR SEPARADO (ninguna se ajusta: son fechas de calendario)");
console.log("═".repeat(122));
for (const [et, per, g] of [["2022-2023", "A", A], ["2024-2026", "B", B], ["TODO 2022-2026", "T", filas]]) {
  console.log(`\n### ${et} · ${g.length} días`);
  console.log("| regla | opera | salta | $/año | peor día | p1 | p5 | peor racha | acierto | caja mín. (desde $7.977) |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const [nom, fn] of REGLAS) {
    const r = ev(g, fn);
    console.log(`| ${nom} | ${r.nOp} | ${r.nSalta} | ${eur(r.alAno)} | ${eur(r.peor)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.dd)} | ${(r.acierto * 100).toFixed(0)}% | ${eur(r.minCaja)}${r.minCaja <= 0 ? " ⛔" : ""} |`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2 · CONTROL AL AZAR
// ═════════════════════════════════════════════════════════════════════════════════════════════
const SORTEOS = 20000;
function controlAzar(g, fn, nom) {
  const real = ev(g, fn);
  const n = real.nSalta;
  const base = ev(g, () => false);
  const dAno = [], dDd = [];
  const idx = g.map((_, i) => i);
  for (let s = 0; s < SORTEOS; s++) {
    // muestreo sin reemplazo de n índices (Fisher-Yates parcial)
    const c = idx.slice();
    for (let i = 0; i < n; i++) { const j = i + Math.floor(Math.random() * (c.length - i)); [c[i], c[j]] = [c[j], c[i]]; }
    const salta = new Set(c.slice(0, n));
    const serie = g.map((f, i) => (salta.has(i) ? 0 : f.pl));
    dAno.push(serie.reduce((a, b) => a + b, 0) / anos(g) - base.alAno);
    dDd.push(Math.abs(base.dd) - Math.abs(drawdown(serie)));
  }
  const pAno = dAno.filter((x) => x >= real.alAno - base.alAno).length / SORTEOS;
  const pDd = dDd.filter((x) => x >= Math.abs(base.dd) - Math.abs(real.dd)).length / SORTEOS;
  console.log(`  ${nom.padEnd(46)} salta ${String(n).padStart(4)} días`);
  console.log(`      Δ$/año real ${eur(real.alAno - base.alAno).padStart(9)}  ·  azar mediana ${eur(pct(dAno, 0.5)).padStart(9)}  p5..p95 [${eur(pct(dAno, 0.05))} … ${eur(pct(dAno, 0.95))}]  → p=${pAno.toFixed(4)}`);
  console.log(`      Δcaída real ${eur(Math.abs(base.dd) - Math.abs(real.dd)).padStart(9)}  ·  azar mediana ${eur(pct(dDd, 0.5)).padStart(9)}  p5..p95 [${eur(pct(dDd, 0.05))} … ${eur(pct(dDd, 0.95))}]  → p=${pDd.toFixed(4)}`);
  return { pAno, pDd };
}
console.log("\n" + "═".repeat(122));
console.log(`2 · CONTROL AL AZAR · ${SORTEOS.toLocaleString("es-ES")} sorteos · ¿bate la regla a saltarse los MISMOS días sin mirar el calendario?`);
console.log("═".repeat(122));
for (const [et, g] of [["2022-2023", A], ["2024-2026", B], ["TODO", filas]]) {
  console.log(`\n── ${et} ──`);
  for (const [nom, fn] of REGLAS.slice(1)) controlAzar(g, fn, nom);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3 · CONTROL DE CALENDARIO DESPLAZADO
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(122));
console.log("3 · CONTROL DE CALENDARIO DESPLAZADO · la MISMA regla corrida k sesiones (mismo nº de días, mismo espaciado)");
console.log("═".repeat(122));
console.log("   Si «no operar el último día del mes» sólo valiera por dejar de operar un día al mes, cualquier");
console.log("   desplazamiento daría lo mismo. Si la fecha importa, k=0 tiene que destacar.\n");
for (const [etReg, campo, nDesp] of [["último día del mes", "ultimoMes", 21], ["dos últimos del mes", "ultimos2", 21], ["jueves", "dow4", 5]]) {
  console.log(`### regla: saltarse ${etReg}`);
  console.log("| desplazamiento k (sesiones) | días saltados | $/año TODO | Δ$/año | peor racha | p5 |");
  console.log("|---|---|---|---|---|---|");
  const baseT = ev(filas, () => false);
  const res = [];
  for (let k = 0; k < nDesp; k++) {
    // se marca el día que está k sesiones DESPUÉS del que marcaría la regla
    const marcados = new Set();
    for (const f of filas) {
      const hit = campo === "dow4" ? f.dow === 4 : f[campo] === 1;
      if (!hit) continue;
      const j = POS.get(f.fecha) + k;
      if (SESIONES[j]) marcados.add(SESIONES[j]);
    }
    const r = ev(filas, (f) => marcados.has(f.fecha));
    res.push({ k, r });
    if (k <= 6 || k === nDesp - 1)
      console.log(`| k=${k}${k === 0 ? " ⟵ LA REGLA" : ""} | ${r.nSalta} | ${eur(r.alAno)} | ${eur(r.alAno - baseT.alAno)} | ${eur(r.dd)} | ${eur(r.p5)} |`);
  }
  const real = res[0], otros = res.slice(1);
  const mejorQue = otros.filter((o) => real.r.alAno > o.r.alAno).length;
  const mejorDd = otros.filter((o) => Math.abs(real.r.dd) < Math.abs(o.r.dd)).length;
  console.log(`  → k=0 bate a ${mejorQue} de ${otros.length} desplazamientos en $/año, y a ${mejorDd} de ${otros.length} en peor racha.`);
  console.log(`     ($/año de los desplazamientos: mediana ${eur(pct(otros.map((o) => o.r.alAno), 0.5))} · máx ${eur(Math.max(...otros.map((o) => o.r.alAno)))} · la regla ${eur(real.r.alAno)})\n`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4 · LA MÉTRICA QUE DECIDE, POR REGLA Y PERÍODO
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("═".repeat(122));
console.log("4 · DÓLARES DE INGRESO PERDIDOS POR CADA DÓLAR DE CAÍDA ELIMINADO");
console.log("═".repeat(122));
console.log("| regla | período | ingreso perdido/año | caída eliminada | $ perdido por $1 de caída |");
console.log("|---|---|---|---|---|");
for (const [nom, fn] of REGLAS.slice(1)) {
  for (const [et, g] of [["2022-2023", A], ["2024-2026", B], ["TODO", filas]]) {
    const b = ev(g, () => false), r = ev(g, fn);
    const perd = b.alAno - r.alAno, quit = Math.abs(b.dd) - Math.abs(r.dd);
    const veredicto = quit <= 0 ? "la caída NO baja — no sirve" : perd <= 0 ? `GRATIS (además +${eur(-perd)}/año)` : `$${(perd / quit).toFixed(2)}`;
    console.log(`| ${nom} | ${et} | ${eur(perd)} | ${eur(quit)} | ${veredicto} |`);
  }
}
