// ¿SE PUEDE OPERAR? — el filtro de tendencia, sin umbrales elegidos a posteriori.
//
// El primer script (scripts/cola-tendencia.mjs) encontró que la distancia del spot de las 11:00
// a su media de 20 sesiones separa la COLA: el tercio bajo tiene 13,4% de días con pérdida
// mayor de $2.000 contra 2,3% del tercio alto (z = −4,29), con el mismo signo en los tres
// tercios del período y confirmado con SPX nativo (z = −3,83).
//
// PERO ESE TERCIO SE CORTÓ CON TODA LA MUESTRA. Un tercio calculado sobre los 651 días usa el
// futuro para decidir dónde está el corte. Aquí se quita esa muleta de tres maneras:
//
//   1. UMBRAL FIJO Y SIN PARÁMETRO: "el spot está por debajo de su media de 20" → cero.
//   2. UMBRAL ANDANDO HACIA DELANTE: percentil 33 de la señal calculado SÓLO con los días
//      anteriores (ventana que se expande), como se calcularía en vivo.
//   3. BARRIDO DE UMBRALES: si el efecto es real tiene que ser monótono, no un acantilado
//      que aparece justo en el corte que elegí.
//
// Y se comprueba el MECANISMO, no la correlación: de qué lado del cóndor viene el daño en cada
// tramo, y si la señal sigue viva usando SÓLO el cierre de ayer (sin el spot de las 11:00).

import { readFileSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

// Pruebas acumuladas de los DOS scripts: 24 del primero + 16 de éste.
const PRUEBAS = 40;
const LISTON = listonT(PRUEBAS);
const MALO = 2000;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pct = (x) => (x * 100).toFixed(1) + "%";
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
const percentil = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

// ─── serie diaria de SPY desde la cinta de minutos (idéntica al script 1) ───
const dias = [];
for (const y of [2023, 2024, 2025, 2026]) {
  const j = JSON.parse(readFileSync(`scripts/cache-theta/SPY_spotmin_y_${y}.json`, "utf8"));
  for (const [d, arr] of Object.entries(j)) {
    const m = new Map(arr.map(([mi, p]) => [mi, p]));
    const o = m.get(570), c = m.get(960), p11 = m.get(660);
    if (!(o > 0) || !(c > 0) || !(p11 > 0)) continue;
    dias.push({ fecha: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, o, c, p11 });
  }
}
dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
const idx = new Map(dias.map((d, i) => [d.fecha, i]));

const opsBase = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const filas = [];
for (const op of opsBase) {
  const i = idx.get(op.fecha);
  if (i === undefined || i < 200) continue;
  const cierres = dias.slice(i - 200, i).map((d) => d.c);     // SÓLO sesiones anteriores a D
  const ma20 = media(cierres.slice(-20));
  filas.push({
    fecha: op.fecha, pl: op.pl,
    dma20: dias[i].p11 / ma20 - 1,                            // con el spot de las 11:00 (D)
    dma20ayer: cierres[cierres.length - 1] / ma20 - 1,        // SÓLO con el cierre de D−1
    dma50: dias[i].p11 / media(cierres.slice(-50)) - 1,
    // hacia dónde se movió el mercado de las 11:00 al cierre: para ver de qué lado vino el daño
    mov: op.cierre - op.sp11,
  });
}
radiografia(filas, ["pl", "dma20", "dma20ayer", "dma50", "mov"], "operable", { maxCeros: 0.2 });

const ANOS = filas.length / 252;
const ordF = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha));
function racha(ops) {
  const ord = [...ops].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let c = 0, pico = 0, peor = 0;
  for (const o of ord) { c += o.pl; if (c > pico) pico = c; if (c - pico < peor) peor = c - pico; }
  return peor;
}
function res(ops, anos = ANOS) {
  const pl = ops.map((o) => o.pl);
  const nMalo = pl.filter((x) => x <= -MALO).length;
  return { n: ops.length, total: pl.reduce((a, x) => a + x, 0), ano: pl.reduce((a, x) => a + x, 0) / anos,
           media: media(pl), nMalo, pMalo: nMalo / pl.length, p5: percentil(pl, 0.05), p1: percentil(pl, 0.01),
           peor: Math.min(...pl), dd: racha(ops) };
}
const BASE = res(ordF);
const zProp = (k1, n1, k2, n2) => { const p = (k1 + k2) / (n1 + n2); const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2)); return se > 0 ? (k1 / n1 - k2 / n2) / se : 0; };

console.log("═".repeat(100));
console.log("¿SE PUEDE OPERAR EL FILTRO DE TENDENCIA? — sin umbrales elegidos con el futuro");
console.log("═".repeat(100));
console.log(`\nBase (${filas.length} días · ${ANOS.toFixed(2)} años): ${eur(BASE.ano)}/año · peor día ${eur(BASE.peor)} · peor racha ${eur(BASE.dd)} · ${BASE.nMalo} días malos (${pct(BASE.pMalo)})`);
console.log(`Listón de Bonferroni con ${PRUEBAS} pruebas acumuladas: |z| ≥ ${LISTON}`);

// ═══ 1 · BARRIDO DE UMBRALES — ¿monótono o acantilado? ═════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log("TABLA 1 · BARRIDO DE UMBRALES FIJOS sobre la distancia a la media de 20 (regla: NO operar si está por debajo)");
console.log("═".repeat(100));
console.log("\n| umbral | días fuera | P(malo) de los que SE OPERAN | P(malo) de los que SE SALTAN | $/año | retiene | peor día | peor racha | Δracha |");
console.log("|---|---|---|---|---|---|---|---|---|");
const barrido = [];
for (const u of [-0.03, -0.02, -0.015, -0.01, -0.005, 0, 0.005, 0.01, 0.015, 0.02]) {
  const dentro = ordF.filter((f) => f.dma20 >= u), fuera = ordF.filter((f) => f.dma20 < u);
  if (dentro.length < 150 || fuera.length < 20) continue;
  const d = res(dentro), o = res(fuera);
  barrido.push({ u, dentro: d, fuera: o });
  console.log(`| ${(u * 100).toFixed(1)}% | ${fuera.length} (${pct(fuera.length / ordF.length)}) | ${pct(d.pMalo)} | ${pct(o.pMalo)} | ${eur(d.ano)} | ${pct(d.total / BASE.total)} | ${eur(d.peor)} | ${eur(d.dd)} | ${eur(Math.abs(BASE.dd) - Math.abs(d.dd))} |`);
}

// ═══ 2 · LA REGLA SIN PARÁMETRO ════════════════════════════════════════════════════════════
const REGLAS = [
  ["SIN FILTRO (base)", () => true],
  ["no operar si el spot de las 11:00 < media de 20", (f) => f.dma20 >= 0],
  ["no operar si el CIERRE DE AYER < media de 20 (sin mirar el spot de hoy)", (f) => f.dma20ayer >= 0],
  ["no operar si el spot de las 11:00 < media de 50", (f) => f.dma50 >= 0],
  ["no operar si está por debajo de la media de 20 O de la de 50", (f) => f.dma20 >= 0 && f.dma50 >= 0],
];
console.log(`\n${"═".repeat(100)}`);
console.log("TABLA 2 · REGLAS SIN PARÁMETRO (el umbral es CERO: por encima o por debajo de su propia media)");
console.log("═".repeat(100));
console.log("\n| regla | días | fuera | $/año | retiene | días malos | P(malo) | pct 5 | peor día | peor racha | caída elim. por $/año sacrificado |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const reglas = [];
for (const [nombre, fn] of REGLAS) {
  const dentro = ordF.filter(fn);
  const r = res(dentro);
  const perd = BASE.ano - r.ano, dDD = Math.abs(BASE.dd) - Math.abs(r.dd);
  reglas.push({ nombre, ...r, perdidoAno: perd, dDD, ef: perd > 0 ? dDD / perd : (dDD > 0 ? Infinity : 0) });
  console.log(`| ${nombre} | ${r.n} | ${pct(1 - r.n / ordF.length)} | ${eur(r.ano)} | ${pct(r.total / BASE.total)} | ${r.nMalo} | ${pct(r.pMalo)} | ${eur(r.p5)} | ${eur(r.peor)} | ${eur(r.dd)} | ${perd > 0 ? (dDD / perd).toFixed(2) : dDD > 0 ? "∞" : "—"} |`);
}

// ═══ 3 · UMBRAL ANDANDO HACIA DELANTE ══════════════════════════════════════════════════════
// El corte del tercio bajo se recalcula cada día con los días ANTERIORES solamente.
console.log(`\n${"═".repeat(100)}`);
console.log("TABLA 3 · UMBRAL ANDANDO HACIA DELANTE — el corte se recalcula cada día con lo ya visto");
console.log("═".repeat(100));
console.log("\n| arranque | días | fuera | $/año | retiene | días malos | P(malo) | peor día | peor racha | Δracha |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const walk = [];
for (const MIN of [60, 126, 252]) {
  const hist = [], dentro = [], saltados = [];
  for (const f of ordF) {
    if (hist.length >= MIN) {
      const corte = percentil(hist, 1 / 3);
      (f.dma20 < corte ? saltados : dentro).push(f);
    } else dentro.push(f);              // sin historia suficiente NO se filtra (se opera)
    hist.push(f.dma20);                 // la señal de hoy entra en la historia DESPUÉS de decidir
  }
  const r = res(dentro);
  walk.push({ MIN, ...r, fuera: saltados.length });
  console.log(`| tras ${MIN} días | ${r.n} | ${saltados.length} (${pct(saltados.length / ordF.length)}) | ${eur(r.ano)} | ${pct(r.total / BASE.total)} | ${r.nMalo} | ${pct(r.pMalo)} | ${eur(r.peor)} | ${eur(r.dd)} | ${eur(Math.abs(BASE.dd) - Math.abs(r.dd))} |`);
}

// ═══ 4 · AÑO A AÑO Y TERCIO A TERCIO ═══════════════════════════════════════════════════════
const REGLA = (f) => f.dma20 >= 0;      // la regla sin parámetro, la que se puede operar
console.log(`\n${"═".repeat(100)}`);
console.log("TABLA 4 · LA REGLA «SÓLO SI EL SPOT ESTÁ POR ENCIMA DE SU MEDIA DE 20», AÑO A AÑO");
console.log("═".repeat(100));
console.log("\n| año | días | operados | P&L sin filtro | P&L con filtro | peor día sin | peor día con | peor racha sin | peor racha con |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const a of ["2024", "2025", "2026"]) {
  const g = ordF.filter((f) => f.fecha.startsWith(a));
  const gf = g.filter(REGLA);
  const s = res(g, g.length / 252), c = res(gf, g.length / 252);
  console.log(`| ${a} | ${g.length} | ${gf.length} | ${eur(s.total)} | ${eur(c.total)} | ${eur(s.peor)} | ${eur(c.peor)} | ${eur(s.dd)} | ${eur(c.dd)} |`);
}
const kk = Math.floor(ordF.length / 3);
const bloques = [ordF.slice(0, kk), ordF.slice(kk, 2 * kk), ordF.slice(2 * kk)];
console.log(`\n  Por tercios del período (el signo tiene que repetirse en los TRES):\n`);
console.log("| tercio | P(malo) por encima de la MA20 | P(malo) por debajo | diferencia | z | Δracha |");
console.log("|---|---|---|---|---|---|");
const signos = [];
for (const b of bloques) {
  const d = b.filter(REGLA), f = b.filter((x) => !REGLA(x));
  const rd = res(d, b.length / 252), rf = res(f, b.length / 252), rb = res(b, b.length / 252);
  signos.push(Math.sign(rf.pMalo - rd.pMalo));
  console.log(`| ${b[0].fecha}→${b[b.length - 1].fecha} | ${pct(rd.pMalo)} (${rd.nMalo}/${rd.n}) | ${pct(rf.pMalo)} (${rf.nMalo}/${rf.n}) | ${((rf.pMalo - rd.pMalo) * 100).toFixed(1)} pts | ${zProp(rf.nMalo, rf.n, rd.nMalo, rd.n).toFixed(2)} | ${eur(Math.abs(rb.dd) - Math.abs(rd.dd))} |`);
}
console.log(`\n  signos: ${signos.map((s) => (s > 0 ? "+" : s < 0 ? "−" : "0")).join("")} → ${signos.every((s) => s > 0) ? "MISMO SIGNO EN LOS TRES" : "NO se repite el signo"}`);

// ═══ 5 · EL MECANISMO — ¿de qué lado viene el daño? ════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log("TABLA 5 · EL MECANISMO — a dónde se va el mercado de las 11:00 al cierre en cada tramo");
console.log("═".repeat(100));
console.log("\n(el cóndor vende a ±25 puntos: pierde si |movimiento| supera 25; la pata que se rompe es la del lado del movimiento)\n");
console.log("| tramo | n | movimiento medio 11:00→cierre | |mov| medio | rompe la PUT (mov<−25) | rompe la CALL (mov>+25) | días malos |");
console.log("|---|---|---|---|---|---|---|");
const tramos = [
  ["por debajo de la MA20", ordF.filter((f) => f.dma20 < 0)],
  ["por encima de la MA20", ordF.filter((f) => f.dma20 >= 0)],
];
for (const [nom, g] of tramos) {
  const mv = g.map((f) => f.mov);
  console.log(`| ${nom} | ${g.length} | ${media(mv).toFixed(1)} pts | ${media(mv.map(Math.abs)).toFixed(1)} pts | ${pct(mv.filter((x) => x < -25).length / g.length)} | ${pct(mv.filter((x) => x > 25).length / g.length)} | ${g.filter((f) => f.pl <= -MALO).length} |`);
}

// ═══ 6 · QUÉ SE TIRA — el día que se salta, ¿cuánto valía? ═════════════════════════════════
const fueraR = ordF.filter((f) => !REGLA(f));
const rF = res(fueraR, fueraR.length / 252);
console.log(`\n${"═".repeat(100)}`);
console.log("TABLA 6 · LO QUE SE DEJA DE COBRAR");
console.log("═".repeat(100));
console.log(`\n  Días saltados: ${fueraR.length} de ${ordF.length} (${pct(fueraR.length / ordF.length)}).`);
console.log(`  Esos días, operados, dan ${eur(rF.total)} en total (${eur(rF.media)}/día) — la base gana ${eur(BASE.media)}/día.`);
console.log(`  Entre ellos están ${rF.nMalo} de los ${BASE.nMalo} días malos de toda la muestra (${pct(rF.nMalo / BASE.nMalo)}).`);
console.log(`  Su peor día: ${eur(rF.peor)}. Su percentil 5: ${eur(rF.p5)}.`);

writeFileSync("scripts/cola-tendencia-2-salida.json", JSON.stringify({
  generado: new Date().toISOString(), pruebas: PRUEBAS, listonZ: LISTON,
  base: BASE, barrido, reglas, walk,
  regla: "no operar si el spot de las 11:00 está por debajo de la media de 20 sesiones",
}, null, 2));
console.log("\n\nDetalle en scripts/cola-tendencia-2-salida.json");
