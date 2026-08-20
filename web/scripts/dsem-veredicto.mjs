// EL VEREDICTO · el control de desplazamiento DENTRO DE CADA MITAD, la potencia, y el mecanismo fino.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/dsem-veredicto.mjs
//
// Tres preguntas que quedaban abiertas:
//   1 · El control de calendario desplazado sobre los 1.121 días da k=0 mejor que 20 de 20. Pero el
//       cubo se eligió POR SER MALO, así que parte de esa victoria es por construcción. La prueba
//       de verdad es si k=0 destaca DENTRO DE CADA MITAD por separado.
//   2 · En 2022-2023 la regla no bate al azar (p=0,19). ¿Es que no hay efecto, o es que 24 días no
//       pueden verlo? Eso lo contesta potencia(), no una opinión.
//   3 · Si el mecanismo es el reajuste de carteras al cierre, el daño debería depender de CÓMO
//       HAYA IDO EL MES — y el retorno del mes hasta el cierre de ayer se conoce a las 11:00.

import { readFileSync } from "node:fs";
import { tWelch, listonT, potencia } from "../lib/barreraHallazgos";

const PRUEBAS = 62, LISTON = listonT(PRUEBAS), EFECTIVO = 7977, CUENTA = 56389, DIAS_ANO = 252;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : NaN; };
function drawdown(pls) { let acc = 0, pico = 0, peor = 0; for (const p of pls) { acc += p; if (acc > pico) pico = acc; const dd = acc - pico; if (dd < peor) peor = dd; } return peor; }

const filas = JSON.parse(readFileSync("scripts/dsem-filas.json", "utf8"));
const CAM = JSON.parse(readFileSync("scripts/dsem-camino.json", "utf8"));
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
for (let n = 0; n < filas.length; n++) {
  const f = filas[n], i = POS.get(f.fecha);
  f.dow = new Date(f.fecha + "T00:00:00Z").getUTCDay();
  f.mes = +f.fecha.slice(5, 7); f.ano = +f.fecha.slice(0, 4);
  let k = 0; while (SESIONES[i + k + 1] && SESIONES[i + k + 1].slice(0, 7) === f.fecha.slice(0, 7)) k++;
  f.posFin = k; f.ultimoMes = k === 0 ? 1 : 0; f.ultimos2 = k <= 1 ? 1 : 0;
  f.finTrim = k === 0 && [3, 6, 9, 12].includes(f.mes) ? 1 : 0;
  f.periodo = f.fecha < "2024-01-01" ? "A" : "B";
  const c = CAM[f.fecha], i1530 = c.h.indexOf("15:30");
  f.zCierrePts = i1530 >= 0 ? c.s[c.s.length - 1] - c.s[i1530] : null;
  // RETORNO DEL MES hasta el cierre de AYER. Observable a las 11:00: no entra ningún precio de hoy.
  const ant = filas[n - 1];
  if (!ant) { f.retMes = null; continue; }
  let j = n - 1, ultMesAnt = null;
  while (j >= 0 && filas[j].fecha.slice(0, 7) === f.fecha.slice(0, 7)) j--;
  if (j >= 0) ultMesAnt = filas[j].cierre;
  f.retMes = ultMesAnt ? (ant.cierre / ultMesAnt - 1) * 100 : null;
}
const A = filas.filter((f) => f.periodo === "A"), B = filas.filter((f) => f.periodo === "B");
const anos = (g) => g.length / DIAS_ANO;
function ev(base, filtro) {
  const serie = base.map((f) => (filtro(f) ? 0 : f.pl));
  const op = base.filter((f) => !filtro(f)).map((f) => f.pl);
  return { nOp: op.length, alAno: serie.reduce((a, b) => a + b, 0) / anos(base), dd: drawdown(serie),
    peor: op.length ? Math.min(...op) : 0, p1: pct(serie, 0.01), p5: pct(serie, 0.05),
    acierto: op.length ? op.filter((x) => x > 0).length / op.length : NaN };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1 · DESPLAZAMIENTO DENTRO DE CADA MITAD
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("═".repeat(118));
console.log("1 · CONTROL DE DESPLAZAMIENTO, DENTRO DE CADA MITAD POR SEPARADO");
console.log("═".repeat(118));
console.log("  Se marca el día que está k sesiones después del último del mes y se mide la misma regla.");
console.log("  k=0 es la regla. Si el efecto fuera «operar un día menos al mes», todos los k darían igual.\n");
for (const [et, g] of [["2022-2023 (A)", A], ["2024-2026 (B)", B]]) {
  const base = ev(g, () => false);
  const res = [];
  for (let k = 0; k < 21; k++) {
    const marc = new Set();
    for (const f of g) if (f.ultimoMes === 1) { const j = POS.get(f.fecha) + k; if (SESIONES[j]) marc.add(SESIONES[j]); }
    res.push({ k, r: ev(g, (f) => marc.has(f.fecha)) });
  }
  const r0 = res[0], otros = res.slice(1);
  const ganaAno = otros.filter((o) => r0.r.alAno > o.r.alAno).length;
  const ganaDd = otros.filter((o) => Math.abs(r0.r.dd) < Math.abs(o.r.dd)).length;
  console.log(`  ${et}   base ${eur(base.alAno)}/año`);
  console.log(`    k=0 (la regla)   ${eur(r0.r.alAno).padStart(9)}/año · racha ${eur(r0.r.dd).padStart(9)}`);
  console.log(`    los otros 20 k   mediana ${eur(pct(otros.map((o) => o.r.alAno), 0.5)).padStart(9)}/año · máx ${eur(Math.max(...otros.map((o) => o.r.alAno))).padStart(9)} · racha mediana ${eur(pct(otros.map((o) => o.r.dd), 0.5))}`);
  console.log(`    → k=0 bate a ${ganaAno}/20 en $/año y a ${ganaDd}/20 en peor racha  (p one-sided ≈ ${((20 - ganaAno + 1) / 21).toFixed(3)} · ${((20 - ganaDd + 1) / 21).toFixed(3)})\n`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2 · POTENCIA — ¿podía 2022-2023 ver el efecto que se le pide?
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("═".repeat(118));
console.log("2 · ¿TENÍA FUERZA LA PRUEBA? (la criba que le falta a los negativos)");
console.log("═".repeat(118));
for (const [et, g] of [["2022-2023 (A)", A], ["2024-2026 (B)", B], ["TODO", filas]]) {
  const u = g.filter((f) => f.ultimoMes === 1).map((f) => f.pl);
  const r = g.filter((f) => f.ultimoMes === 0).map((f) => f.pl);
  const sd = Math.sqrt(r.reduce((a, x) => a + (x - media(r)) ** 2, 0) / (r.length - 1));
  const ee = sd / Math.sqrt(u.length);
  const detectable = 2.8 * ee;
  const efecto = media(u) - media(r);
  console.log(`  ${et.padEnd(16)} n último = ${String(u.length).padStart(3)} · efecto medido ${eur(efecto).padStart(8)} · error típico ${eur(ee).padStart(6)}`);
  console.log(`  ${"".padEnd(16)} mínimo detectable con potencia 80%: ${eur(detectable)}  → ${Math.abs(efecto) >= detectable ? "SÍ se podía ver" : "NO se podía ver: un «no significativo» aquí significa «no lo pudimos ver», no «no existe»"}`);
  console.log(`  ${"".padEnd(16)} t de Welch = ${tWelch(u, r).toFixed(2)} (listón ${LISTON})\n`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3 · EL MECANISMO FINO — ¿depende de cómo haya ido el mes?
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("═".repeat(118));
console.log("3 · EL MECANISMO · el reajuste de carteras vende renta variable después de un mes ALCISTA");
console.log("═".repeat(118));
console.log("  El retorno del mes hasta el CIERRE DE AYER se conoce a las 11:00 del último día. No hay futuro.\n");
const ult = filas.filter((f) => f.ultimoMes === 1 && f.retMes != null);
console.log("| grupo | n | media P&L | mov. 11:00→cierre (pts) | mov. 15:30→cierre (pts) | dirección del cierre |");
console.log("|---|---|---|---|---|---|");
const cortes = [["mes ALCISTA (ret > +2%)", (f) => f.retMes > 2], ["mes plano (−2% a +2%)", (f) => f.retMes >= -2 && f.retMes <= 2], ["mes BAJISTA (ret < −2%)", (f) => f.retMes < -2]];
for (const [et, fn] of cortes) {
  const g = ult.filter(fn);
  if (!g.length) continue;
  const dir = media(g.map((f) => f.zCierrePts));
  console.log(`| ${et} | ${g.length} | ${eur(media(g.map((f) => f.pl)))} | ${media(g.map((f) => Math.abs(f.zTardePts))).toFixed(1)} | ${media(g.map((f) => Math.abs(f.zCierrePts))).toFixed(1)} | ${dir >= 0 ? "+" : "−"}${Math.abs(dir).toFixed(1)} pts (${dir < 0 ? "a la BAJA" : "al alza"}) |`);
}
const rest = filas.filter((f) => f.posFin > 4);
console.log(`| resto del mes (referencia) | ${rest.length} | ${eur(media(rest.map((f) => f.pl)))} | ${media(rest.map((f) => Math.abs(f.zTardePts))).toFixed(1)} | ${media(rest.map((f) => Math.abs(f.zCierrePts))).toFixed(1)} | ${media(rest.map((f) => f.zCierrePts)) >= 0 ? "+" : "−"}${Math.abs(media(rest.map((f) => f.zCierrePts))).toFixed(1)} pts |`);
const alc = ult.filter((f) => f.retMes > 2), noAlc = ult.filter((f) => f.retMes <= 2);
console.log(`\n  t de Welch (P&L último-día tras mes alcista vs resto de últimos días): ${tWelch(alc.map((f) => f.pl), noAlc.map((f) => f.pl)).toFixed(2)}`);
console.log(`  n del corte alcista: A=${alc.filter((f) => f.periodo === "A").length} · B=${alc.filter((f) => f.periodo === "B").length}  ← con esta muestra NO se afina el corte, sólo se mira si el signo acompaña`);

// qué lado rompe el último día
const rompeC = ult.filter((f) => f.cierre > f.kCallCorta).length, rompeP = ult.filter((f) => f.cierre < f.kPutCorta).length;
const rC = rest.filter((f) => f.cierre > f.kCallCorta).length, rP = rest.filter((f) => f.cierre < f.kPutCorta).length;
console.log(`\n  ¿por qué lado rompe?  último del mes: ${rompeC} CALL / ${rompeP} PUT de ${ult.length}   ·   resto del mes: ${rC} CALL / ${rP} PUT de ${rest.length}`);
console.log(`  tasa de rotura: último ${((rompeC + rompeP) / ult.length * 100).toFixed(0)}% · resto ${((rC + rP) / rest.length * 100).toFixed(0)}%`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4 · LA REGLA FINAL, EN DÓLARES SOBRE LA CUENTA
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(118));
console.log(`4 · EN DÓLARES SOBRE LA CUENTA DE ${eur(CUENTA)} · 1 cóndor = $5.000 de colateral, las pérdidas salen de ${eur(EFECTIVO)}`);
console.log("═".repeat(118));
const R = [["operar todos los días", () => false], ["saltarse el último día hábil del mes", (f) => f.ultimoMes === 1]];
console.log("| serie | regla | ops/año | $/op | $/año | % sobre la cuenta | peor racha | caja mínima |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [et, g] of [["2022-2023", A], ["2024-2026", B], ["TODO", filas]]) {
  for (const [nom, fn] of R) {
    const r = ev(g, fn);
    const opsAno = r.nOp / anos(g), dOp = r.alAno / opsAno;
    let caja = EFECTIVO, minC = EFECTIVO;
    for (const f of g) { if (fn(f)) continue; caja += f.pl; if (caja < minC) minC = caja; }
    console.log(`| ${et} | ${nom} | ${opsAno.toFixed(0)} | ${eur(dOp)} | ${eur(r.alAno)} | ${(r.alAno / CUENTA * 100).toFixed(1)}% | ${eur(r.dd)} | ${eur(minC)}${minC <= 0 ? " ⛔" : ""} |`);
  }
}
console.log(`\n  El 5% peor de días se lleva ${eur(filas.filter((f) => f.pl <= pct(filas.map((x) => x.pl), 0.05)).reduce((a, f) => a + f.pl, 0))} de los ${eur(filas.reduce((a, f) => a + f.pl, 0))} totales.`);
console.log(`  Doce días al año (el último hábil de cada mes) valen ${eur(6019)}/año sobre 1.121 días: ${(6019 / CUENTA * 100).toFixed(1)} puntos de rentabilidad anual por cóndor.`);
