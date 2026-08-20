// LA LENTE "AZAR" CONTRA «no operar el último día hábil del mes».
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/azar-finmes.mjs
//
// LA PREGUNTA, EN UNA LÍNEA: saltarse 12 días al año quita exposición. Quitar exposición mejora
// la caída SIEMPRE, y en un período perdedor mejora también el ingreso. ¿Hace la regla algo MÁS
// que eso? Y sobre todo: ¿es «último día del mes» especial, o es simplemente el cubo que salió
// mejor de una lista de 58 que se miró entera?
//
// SEIS PRUEBAS:
//   1. AZAR PLANO        — saltarse los MISMOS n días al azar (el control encargado).
//   2. AZAR DE SELECCIÓN — los 58 cubos, uno a uno, cruzados en las dos direcciones. ¿Cuántos
//                          pasan lo mismo que pasa el fin de mes?
//   3. ROTACIÓN          — se gira el P&L contra el calendario dentro de cada mitad y se repite
//                          TODO el procedimiento de selección. Es el único null que corrige la
//                          selección: conserva volatilidad, agrupamiento y distribución, y sólo
//                          rompe el vínculo fecha↔resultado.
//   4. TAMAÑO            — la regla contra bajar el tamaño el mismo % de exposición.
//   5. COLA              — ¿vive el efecto en 5 días?
//   6. MECANISMO         — el movimiento de 15:30 al cierre, recontado y con su propio null.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { tWelch, listonT } from "../lib/barreraHallazgos";

const DIAS_ANO = 252, EFECTIVO = 7977, CUENTA = 56389;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : NaN; };
function drawdown(pls) { let acc = 0, pico = 0, peor = 0; for (const p of pls) { acc += p; if (acc > pico) pico = acc; const dd = acc - pico; if (dd < peor) peor = dd; } return peor; }

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 0 · DATOS Y CALENDARIO — copiados literalmente de dsem-calendario.mjs
// ═════════════════════════════════════════════════════════════════════════════════════════════
const filas = JSON.parse(readFileSync("scripts/dsem-filas.json", "utf8"));
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const FEST = new Set(["2022-01-17","2022-02-21","2022-04-15","2022-05-30","2022-06-20","2022-07-04","2022-09-05","2022-11-24","2022-12-26",
"2023-01-02","2023-01-16","2023-02-20","2023-04-07","2023-05-29","2023-06-19","2023-07-04","2023-09-04","2023-11-23","2023-12-25",
"2024-01-01","2024-01-15","2024-02-19","2024-03-29","2024-05-27","2024-06-19","2024-07-04","2024-09-02","2024-11-28","2024-12-25",
"2025-01-01","2025-01-09","2025-01-20","2025-02-17","2025-04-18","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-11-27","2025-12-25",
"2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25"]);
const MEDIO = new Set(["2022-11-25","2023-07-03","2023-11-24","2024-07-03","2024-11-29","2024-12-24","2025-07-03","2025-11-28","2025-12-24","2026-11-27","2026-12-24"]);
const iso = (d) => d.toISOString().slice(0, 10);
const SESIONES = [];
for (let d = new Date("2021-12-01T00:00:00Z"); iso(d) <= "2026-12-31"; d.setUTCDate(d.getUTCDate() + 1)) {
  const s = iso(d), w = d.getUTCDay();
  if (w !== 0 && w !== 6 && !FEST.has(s)) SESIONES.push(s);
}
const POS = new Map(SESIONES.map((s, i) => [s, i]));
const tercerViernes = (ano, mes) => { let n = 0; for (let d = 1; d <= 31; d++) { const dt = new Date(Date.UTC(ano, mes - 1, d)); if (dt.getUTCMonth() !== mes - 1) break; if (dt.getUTCDay() === 5 && ++n === 3) return iso(dt); } return null; };

for (const f of filas) {
  const d = new Date(f.fecha + "T00:00:00Z"), i = POS.get(f.fecha);
  if (i == null) throw new Error(`${f.fecha} fuera del calendario de sesiones`);
  const ant = SESIONES[i - 1], sig = SESIONES[i + 1];
  const ano = +f.fecha.slice(0, 4), mes = +f.fecha.slice(5, 7), dia = +f.fecha.slice(8, 10);
  const salto = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000;
  f.dow = d.getUTCDay(); f.dom = dia; f.mes = mes; f.ano = ano;
  f.semMes = Math.ceil(dia / 7);
  f.domCubo = Math.min(6, Math.ceil(dia / 5));
  f.vispFest = sig && salto(f.fecha, sig) > (f.dow === 5 ? 3 : 1) ? 1 : 0;
  f.postFest = ant && salto(ant, f.fecha) > (f.dow === 1 ? 3 : 1) ? 1 : 0;
  f.medioDia = MEDIO.has(f.fecha) ? 1 : 0;
  f.primeroMes = !ant || ant.slice(5, 7) !== f.fecha.slice(5, 7) ? 1 : 0;
  f.ultimoMes = !sig || sig.slice(5, 7) !== f.fecha.slice(5, 7) ? 1 : 0;
  f.ultimos2 = f.ultimoMes || (sig && SESIONES[i + 2] && SESIONES[i + 2].slice(5, 7) !== f.fecha.slice(5, 7)) ? 1 : 0;
  f.primeros2 = f.primeroMes || (ant && SESIONES[i - 2] && SESIONES[i - 2].slice(5, 7) !== f.fecha.slice(5, 7)) ? 1 : 0;
  const tv = tercerViernes(ano, mes), iTv = POS.get(tv);
  f.opex = f.fecha === tv ? 1 : 0;
  f.opexTrim = f.opex && [3, 6, 9, 12].includes(mes) ? 1 : 0;
  f.dAOpex = iTv != null ? i - iTv : null;
  f.semOpex = f.dAOpex != null && f.dAOpex >= -4 && f.dAOpex <= 0 ? 1 : 0;
  f.finTrim = f.ultimoMes && [3, 6, 9, 12].includes(mes) ? 1 : 0;
  f.periodo = f.fecha < "2024-01-01" ? "A" : "B";
  f.zRompeCall = f.cierre > f.kCallCorta ? 1 : 0;
  f.zRompePut = f.cierre < f.kPutCorta ? 1 : 0;
}
radiografia(filas, ["pl", "dow", "dom", "mes", "semMes", "credito", "sigma", "ivAtm", "cierre"],
  "1.121 días · lente azar", { maxCeros: 0.6 });
// `ultimoMes` es una BANDERA de 2 valores: radiografia() la rechaza (con razón) como campo
// ordenable. Se cuenta a mano, que es lo único que hace falta saber de ella.
{
  const n1 = filas.filter((f) => f.ultimoMes === 1).length;
  const meses = new Set(filas.map((f) => f.fecha.slice(0, 7))).size;
  console.log(`  bandera ultimoMes: ${n1} días marcados de ${filas.length} · ${meses} meses en la muestra · ${n1 === meses ? "uno por mes, correcto" : `⚠ NO cuadra con ${meses} meses`}`);
  if (n1 < 40) throw new Error(`sólo ${n1} días de fin de mes — la bandera está rota`);
}

const A = filas.filter((f) => f.periodo === "A"), B = filas.filter((f) => f.periodo === "B");
const anos = (g) => g.length / DIAS_ANO;

// evaluación sobre una serie de pl ya alineada con `base`
function evalPL(base, pls, skipIdx) {
  const serie = pls.map((p, i) => (skipIdx.has(i) ? 0 : p));
  const op = [];
  for (let i = 0; i < pls.length; i++) if (!skipIdx.has(i)) op.push(pls[i]);
  const total = serie.reduce((a, b) => a + b, 0);
  let caja = EFECTIVO, minCaja = EFECTIVO;
  for (const x of serie) { caja += x; if (caja < minCaja) minCaja = caja; }
  return { nOp: op.length, nSalta: pls.length - op.length, alAno: total / anos(base), total,
    peor: op.length ? Math.min(...op) : 0, p1: pct(serie, 0.01), p5: pct(serie, 0.05),
    dd: drawdown(serie), acierto: op.length ? op.filter((x) => x > 0).length / op.length : NaN, minCaja };
}
const idxDe = (g, fn) => new Set(g.map((f, i) => (fn(f) ? i : -1)).filter((i) => i >= 0));

const PL_A = A.map((f) => f.pl), PL_B = B.map((f) => f.pl);
const VACIO = new Set();
const baseA = evalPL(A, PL_A, VACIO), baseB = evalPL(B, PL_B, VACIO);
const baseT = evalPL(filas, filas.map((f) => f.pl), VACIO);

console.log("═".repeat(118));
console.log("0 · LA BASE, PARA TENER LOS NÚMEROS DELANTE");
console.log("═".repeat(118));
console.log(`  2022-2023 (A) · ${A.length} días · ${eur(baseA.alAno)}/año · racha ${eur(baseA.dd)}`);
console.log(`  2024-2026 (B) · ${B.length} días · ${eur(baseB.alAno)}/año · racha ${eur(baseB.dd)}`);
console.log(`  TODO          · ${filas.length} días · ${eur(baseT.alAno)}/año · racha ${eur(baseT.dd)}`);

const REGLA = (f) => f.ultimoMes === 1;
const rA = evalPL(A, PL_A, idxDe(A, REGLA)), rB = evalPL(B, PL_B, idxDe(B, REGLA));
console.log(`\n  REGLA «saltarse el último día del mes»`);
console.log(`    en A: ${eur(rA.alAno)}/año (Δ ${eur(rA.alAno - baseA.alAno)}) · racha ${eur(rA.dd)} (Δ ${eur(Math.abs(baseA.dd) - Math.abs(rA.dd))}) · salta ${rA.nSalta}`);
console.log(`    en B: ${eur(rB.alAno)}/año (Δ ${eur(rB.alAno - baseB.alAno)}) · racha ${eur(rB.dd)} (Δ ${eur(Math.abs(baseB.dd) - Math.abs(rB.dd))}) · salta ${rB.nSalta}`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1 · AZAR PLANO — el control encargado, 5.000 sorteos (más de los 500 pedidos)
// ═════════════════════════════════════════════════════════════════════════════════════════════
const SORTEOS = 5000;
function azarPlano(g, pls, base, n, real, et) {
  const dAno = [], dDd = [], idx = pls.map((_, i) => i);
  for (let s = 0; s < SORTEOS; s++) {
    const c = idx.slice();
    for (let i = 0; i < n; i++) { const j = i + Math.floor(Math.random() * (c.length - i)); [c[i], c[j]] = [c[j], c[i]]; }
    const salta = new Set(c.slice(0, n));
    const r = evalPL(g, pls, salta);
    dAno.push(r.alAno - base.alAno);
    dDd.push(Math.abs(base.dd) - Math.abs(r.dd));
  }
  const dRealAno = real.alAno - base.alAno, dRealDd = Math.abs(base.dd) - Math.abs(real.dd);
  const pAno = dAno.filter((x) => x >= dRealAno).length / SORTEOS;
  const pDd = dDd.filter((x) => x >= dRealDd).length / SORTEOS;
  console.log(`\n  ${et} · se saltan ${n} de ${pls.length} días (${(n / pls.length * 100).toFixed(1)}% de la exposición)`);
  console.log(`     Δ$/año   regla ${eur(dRealAno).padStart(9)} │ azar: mediana ${eur(pct(dAno, 0.5)).padStart(8)}  p95 ${eur(pct(dAno, 0.95)).padStart(8)}  máx ${eur(Math.max(...dAno)).padStart(8)} │ percentil ${((1 - pAno) * 100).toFixed(1)}%  p=${pAno.toFixed(4)}  ${pAno < 0.05 ? "PASA" : "NO PASA"}`);
  console.log(`     Δcaída   regla ${eur(dRealDd).padStart(9)} │ azar: mediana ${eur(pct(dDd, 0.5)).padStart(8)}  p95 ${eur(pct(dDd, 0.95)).padStart(8)}  máx ${eur(Math.max(...dDd)).padStart(8)} │ percentil ${((1 - pDd) * 100).toFixed(1)}%  p=${pDd.toFixed(4)}  ${pDd < 0.05 ? "PASA" : "NO PASA"}`);
  return { pAno, pDd };
}
console.log("\n" + "═".repeat(118));
console.log(`1 · AZAR PLANO · ${SORTEOS.toLocaleString("es-ES")} sorteos · saltarse los MISMOS días sin mirar el calendario`);
console.log("═".repeat(118));
const z1A = azarPlano(A, PL_A, baseA, rA.nSalta, rA, "2022-2023 (donde la regla se PRUEBA en la dirección B→A)");
const z1B = azarPlano(B, PL_B, baseB, rB.nSalta, rB, "2024-2026 (donde la regla se PRUEBA en la dirección A→B)");

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2 · AZAR DE SELECCIÓN — los 58 cubos, uno a uno, cruzados en las DOS direcciones
// ═════════════════════════════════════════════════════════════════════════════════════════════
const DIAS = ["dom", "LUN", "MAR", "MIE", "JUE", "VIE", "sab"];
const MESES = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const FAMILIAS = [
  { id: "dow", cubo: (f) => f.dow, et: (v) => DIAS[v] },
  { id: "domCubo", cubo: (f) => f.domCubo, et: (v) => ["", "1-5", "6-10", "11-15", "16-20", "21-25", "26-31"][v] },
  { id: "semMes", cubo: (f) => f.semMes, et: (v) => `sem ${v}` },
  { id: "mes", cubo: (f) => f.mes, et: (v) => MESES[v] },
  { id: "opex", cubo: (f) => f.opex, et: (v) => (v ? "OPEX" : "resto") },
  { id: "opexTrim", cubo: (f) => f.opexTrim, et: (v) => (v ? "trimestral" : "resto") },
  { id: "semOpex", cubo: (f) => f.semOpex, et: (v) => (v ? "semOPEX" : "resto") },
  { id: "vispFest", cubo: (f) => f.vispFest, et: (v) => (v ? "víspera" : "resto") },
  { id: "postFest", cubo: (f) => f.postFest, et: (v) => (v ? "postFest" : "resto") },
  { id: "medioDia", cubo: (f) => f.medioDia, et: (v) => (v ? "medioDía" : "resto") },
  { id: "primeroMes", cubo: (f) => f.primeroMes, et: (v) => (v ? "1ºmes" : "resto") },
  { id: "ultimoMes", cubo: (f) => f.ultimoMes, et: (v) => (v ? "últimoMes" : "resto") },
  { id: "ultimos2", cubo: (f) => f.ultimos2, et: (v) => (v ? "2últ" : "resto") },
  { id: "finTrim", cubo: (f) => f.finTrim, et: (v) => (v ? "finTrim" : "resto") },
];
const MIN_N = 20;
// La lista de cubos candidatos, exactamente la misma que miró el informe.
const CUBOS = [];
for (const fam of FAMILIAS) {
  for (const v of [...new Set(filas.map(fam.cubo))].sort((a, b) => a - b)) {
    const nA = A.filter((f) => fam.cubo(f) === v).length, nB = B.filter((f) => fam.cubo(f) === v).length;
    if (nA >= MIN_N && nB >= MIN_N) CUBOS.push({ id: `${fam.id}=${fam.et(v)}`, fam, v, nA, nB });
  }
}
console.log("\n" + "═".repeat(118));
console.log(`2 · AZAR DE SELECCIÓN · los ${CUBOS.length} cubos con n≥${MIN_N} en las dos mitades, cada uno saltado POR SEPARADO`);
console.log("═".repeat(118));
console.log("   La pregunta no es «¿funciona el fin de mes?» sino «¿cuántos de los cubos que se miraron");
console.log("   funcionan igual de bien?». Si son muchos, el fin de mes es el ganador de una rifa.\n");

function evaluarCubo(c) {
  const iA = idxDe(A, (f) => c.fam.cubo(f) === c.v), iB = idxDe(B, (f) => c.fam.cubo(f) === c.v);
  const eA = evalPL(A, PL_A, iA), eB = evalPL(B, PL_B, iB);
  return {
    ...c,
    dAnoA: eA.alAno - baseA.alAno, dAnoB: eB.alAno - baseB.alAno,
    dDdA: Math.abs(baseA.dd) - Math.abs(eA.dd), dDdB: Math.abs(baseB.dd) - Math.abs(eB.dd),
  };
}
const EV = CUBOS.map(evaluarCubo);
// "pasa el cruce" con el mismo criterio que usó el informe: Δ$/año>0 Y Δcaída>0 en LAS DOS mitades
const pasa = (e) => e.dAnoA > 0 && e.dAnoB > 0 && e.dDdA > 0 && e.dDdB > 0;
const pasan = EV.filter(pasa);
const ordEV = [...EV].sort((a, b) => Math.min(b.dAnoA, b.dAnoB) - Math.min(a.dAnoA, a.dAnoB));
console.log("| cubo | nA | nB | Δ$/año A | Δ$/año B | Δcaída A | Δcaída B | ¿pasa las 4? |");
console.log("|---|---|---|---|---|---|---|---|");
for (const e of ordEV)
  console.log(`| ${e.id} | ${e.nA} | ${e.nB} | ${eur(e.dAnoA)} | ${eur(e.dAnoB)} | ${eur(e.dDdA)} | ${eur(e.dDdB)} | ${pasa(e) ? "SÍ" : "no"} |`);
const fm = EV.find((e) => e.id === "ultimoMes=últimoMes");
const rank = ordEV.findIndex((e) => e.id === fm.id) + 1;
console.log(`\n  → ${pasan.length} de ${CUBOS.length} cubos pasan el MISMO cruce en las dos direcciones (${(pasan.length / CUBOS.length * 100).toFixed(0)}%).`);
console.log(`     Son: ${pasan.map((e) => e.id).join(" · ")}`);
console.log(`  → «último día del mes» queda el ${rank}º de ${CUBOS.length} por el peor de sus dos Δ$/año.`);
console.log(`  → p de selección (fracción de cubos mirados que pasan igual) = ${(pasan.length / CUBOS.length).toFixed(3)}`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3 · ROTACIÓN — el null que corrige la selección
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Se gira el vector de P&L dentro de cada mitad (circular). Eso conserva la distribución, la
// volatilidad, el agrupamiento y hasta la racha; sólo destruye el vínculo fecha↔resultado.
// Sobre cada giro se repite TODO: se miran los 58 cubos, se elige el mejor por el mismo criterio,
// y se anota su resultado. Si en datos girados sale igual de bueno, el calendario no sabe nada.
const ROT = 2000;
function rotar(v, r) { const n = v.length; const o = new Array(n); for (let i = 0; i < n; i++) o[i] = v[(i + r) % n]; return o; }

// pre-computo de índices por cubo (no cambian al rotar el P&L)
const IDX = CUBOS.map((c) => ({ c, iA: idxDe(A, (f) => c.fam.cubo(f) === c.v), iB: idxDe(B, (f) => c.fam.cubo(f) === c.v) }));

function mejorCuboDe(plA, plB) {
  const bA = evalPL(A, plA, VACIO), bB = evalPL(B, plB, VACIO);
  let mejor = -Infinity, nPasan = 0;
  for (const { iA, iB } of IDX) {
    const eA = evalPL(A, plA, iA), eB = evalPL(B, plB, iB);
    const dA = eA.alAno - bA.alAno, dB = eB.alAno - bB.alAno;
    const ddA = Math.abs(bA.dd) - Math.abs(eA.dd), ddB = Math.abs(bB.dd) - Math.abs(eB.dd);
    if (dA > 0 && dB > 0 && ddA > 0 && ddB > 0) nPasan++;
    const s = Math.min(dA, dB);
    if (s > mejor) mejor = s;
  }
  return { mejor, nPasan };
}
console.log("\n" + "═".repeat(118));
console.log(`3 · ROTACIÓN · ${ROT.toLocaleString("es-ES")} giros del P&L contra el calendario, dentro de cada mitad`);
console.log("═".repeat(118));
const realMejor = Math.min(fm.dAnoA, fm.dAnoB);
console.log(`   El estadístico real: el MEJOR cubo de los ${CUBOS.length}, medido por el peor de sus dos Δ$/año.`);
console.log(`   En los datos de verdad ese mejor cubo es «${ordEV[0].id}» con ${eur(Math.min(ordEV[0].dAnoA, ordEV[0].dAnoB))}.`);
console.log(`   «último día del mes» da ${eur(realMejor)}.\n`);
const mejores = [], pasanRot = [];
for (let s = 0; s < ROT; s++) {
  const rA2 = 1 + Math.floor(Math.random() * (A.length - 1));
  const rB2 = 1 + Math.floor(Math.random() * (B.length - 1));
  const r = mejorCuboDe(rotar(PL_A, rA2), rotar(PL_B, rB2));
  mejores.push(r.mejor); pasanRot.push(r.nPasan);
  if ((s + 1) % 500 === 0) console.log(`   ... ${s + 1}/${ROT}`);
}
const pRotMejor = mejores.filter((x) => x >= realMejor).length / ROT;
const pRotTop = mejores.filter((x) => x >= Math.min(ordEV[0].dAnoA, ordEV[0].dAnoB)).length / ROT;
console.log(`\n   MEJOR cubo bajo rotación: mediana ${eur(pct(mejores, 0.5))} · p95 ${eur(pct(mejores, 0.95))} · máx ${eur(Math.max(...mejores))}`);
console.log(`   → p(un calendario sin información produzca un cubo ≥ el fin de mes)    = ${pRotMejor.toFixed(4)}  ${pRotMejor < 0.05 ? "PASA" : "NO PASA"}`);
console.log(`   → p(… ≥ el MEJOR cubo real)                                            = ${pRotTop.toFixed(4)}  ${pRotTop < 0.05 ? "PASA" : "NO PASA"}`);
console.log(`   Cubos que «pasan las 4 cribas» bajo rotación: mediana ${pct(pasanRot, 0.5)} · p95 ${pct(pasanRot, 0.95)} · real ${pasan.length}`);
const pRotN = pasanRot.filter((x) => x >= pasan.length).length / ROT;
console.log(`   → p(un calendario sin información produzca ≥ ${pasan.length} cubos que pasan) = ${pRotN.toFixed(4)}`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4 · ¿ES SÓLO REDUCIR EXPOSICIÓN? — la regla contra bajar el tamaño
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(118));
console.log("4 · LA REGLA CONTRA BAJAR EL TAMAÑO EL MISMO % — sin mirar el calendario, gratis");
console.log("═".repeat(118));
console.log("| período | base | regla (salta fin de mes) | tamaño × (1−exposición saltada) | ¿gana la regla? |");
console.log("|---|---|---|---|---|");
for (const [et, g, pls, base, r] of [["2022-2023", A, PL_A, baseA, rA], ["2024-2026", B, PL_B, baseB, rB]]) {
  const frac = 1 - r.nSalta / pls.length;
  const escAno = base.alAno * frac, escDd = base.dd * frac;
  console.log(`| ${et} $/año | ${eur(base.alAno)} | ${eur(r.alAno)} | ${eur(escAno)} | ${r.alAno > escAno ? "SÍ +" + eur(r.alAno - escAno) : "NO"} |`);
  console.log(`| ${et} racha | ${eur(base.dd)} | ${eur(r.dd)} | ${eur(escDd)} | ${Math.abs(r.dd) < Math.abs(escDd) ? "SÍ" : "NO"} |`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5 · LA COLA — ¿vive el efecto en un puñado de días?
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(118));
console.log("5 · LA COLA · quitar los k peores días del cubo «fin de mes» y del resto, y volver a medir");
console.log("═".repeat(118));
const fmDias = filas.filter(REGLA), restoDias = filas.filter((f) => !REGLA(f));
const fmPL = fmDias.map((f) => f.pl).sort((a, b) => a - b), rsPL = restoDias.map((f) => f.pl).sort((a, b) => a - b);
console.log(`  fin de mes n=${fmPL.length} · media ${eur(media(fmPL))} · mediana ${eur(pct(fmPL, 0.5))}`);
console.log(`  resto      n=${rsPL.length} · media ${eur(media(rsPL))} · mediana ${eur(pct(rsPL, 0.5))}`);
console.log(`\n| k peores quitados de CADA grupo | media fin de mes | media resto | diferencia | t |`);
console.log("|---|---|---|---|---|");
for (const k of [0, 1, 2, 3, 5, 8]) {
  const a2 = fmPL.slice(k), b2 = rsPL.slice(Math.round(k * rsPL.length / fmPL.length));
  console.log(`| ${k} | ${eur(media(a2))} | ${eur(media(b2))} | ${eur(media(a2) - media(b2))} | ${tWelch(a2, b2).toFixed(2)} |`);
}
// remuestreo de los 55 días de fin de mes
const BOOT = 20000, difs = [];
for (let s = 0; s < BOOT; s++) {
  let acc = 0;
  for (let i = 0; i < fmPL.length; i++) acc += fmPL[Math.floor(Math.random() * fmPL.length)];
  difs.push(acc / fmPL.length - media(rsPL));
}
console.log(`\n  remuestreo de los ${fmPL.length} días de fin de mes (${BOOT.toLocaleString("es-ES")} veces):`);
console.log(`    diferencia media ${eur(media(difs))} · IC 90% [${eur(pct(difs, 0.05))} … ${eur(pct(difs, 0.95))}] · fracción ≥ 0: ${(difs.filter((x) => x >= 0).length / BOOT * 100).toFixed(1)}%`);

// año a año
console.log(`\n  año a año (exceso del fin de mes sobre su año):`);
console.log("| año | n fin de mes | media fin de mes | media resto | exceso |");
console.log("|---|---|---|---|---|");
for (const y of [2022, 2023, 2024, 2025, 2026]) {
  const g = filas.filter((f) => f.ano === y);
  const a2 = g.filter(REGLA).map((f) => f.pl), b2 = g.filter((f) => !REGLA(f)).map((f) => f.pl);
  console.log(`| ${y} | ${a2.length} | ${eur(media(a2))} | ${eur(media(b2))} | ${eur(media(a2) - media(b2))} |`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6 · EL MECANISMO — recontado, y con su propio null de selección
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(118));
console.log("6 · EL MECANISMO · movimiento de 15:30 al cierre — ¿es del fin de mes o de cualquier cubo?");
console.log("═".repeat(118));
const CAM = JSON.parse(readFileSync("scripts/dsem-camino.json", "utf8"));
for (const f of filas) {
  const c = CAM[f.fecha];
  if (!c) { f.mov30 = null; continue; }
  const i1530 = c.h.indexOf("15:30");
  f.mov30 = i1530 >= 0 ? Math.abs(c.s[c.s.length - 1] - c.s[i1530]) : null;
}
const conMov = filas.filter((f) => f.mov30 != null);
console.log(`  días con cotización a las 15:30 en el fichero: ${conMov.length} de ${filas.length}`);
const mFm = conMov.filter(REGLA).map((f) => f.mov30), mRs = conMov.filter((f) => !REGLA(f)).map((f) => f.mov30);
const tMec = tWelch(mFm, mRs);
console.log(`  movimiento 15:30→cierre · fin de mes ${media(mFm).toFixed(1)} pts (n=${mFm.length}) · resto ${media(mRs).toFixed(1)} pts · t=${tMec.toFixed(2)}`);
// el mismo t para TODOS los cubos: ¿es el fin de mes el que más destaca, o hay muchos?
const tsMec = [];
for (const c of CUBOS) {
  const g = conMov.filter((f) => c.fam.cubo(f) === c.v), r = conMov.filter((f) => c.fam.cubo(f) !== c.v);
  if (g.length < MIN_N) continue;
  tsMec.push({ id: c.id, t: tWelch(g.map((f) => f.mov30), r.map((f) => f.mov30)), n: g.length });
}
tsMec.sort((a, b) => Math.abs(b.t) - Math.abs(a.t));
console.log(`\n  el mismo contraste, en los ${tsMec.length} cubos, ordenado por |t|:`);
for (const x of tsMec.slice(0, 8)) console.log(`    ${x.id.padEnd(22)} n=${String(x.n).padStart(4)}  t=${x.t.toFixed(2)}`);
const LISTON = listonT(62);
console.log(`\n  listón de Bonferroni con 62 pruebas: |t| ≥ ${LISTON}`);
console.log(`  cubos que lo pasan en el mecanismo: ${tsMec.filter((x) => Math.abs(x.t) >= LISTON).map((x) => `${x.id} (t=${x.t.toFixed(2)})`).join(" · ") || "ninguno"}`);
// ¿y el crédito? si el mecanismo es real, el mercado no lo cobra
const cFm = filas.filter(REGLA).map((f) => f.credito), cRs = filas.filter((f) => !REGLA(f)).map((f) => f.credito);
console.log(`\n  crédito cobrado · fin de mes ${eur(media(cFm))} · resto ${eur(media(cRs))} · t=${tWelch(cFm, cRs).toFixed(2)}`);
const ivFm = filas.filter(REGLA).map((f) => f.ivAtm).filter(Boolean), ivRs = filas.filter((f) => !REGLA(f)).map((f) => f.ivAtm).filter(Boolean);
console.log(`  IV del dinero  · fin de mes ${(media(ivFm) * 100).toFixed(1)}% · resto ${(media(ivRs) * 100).toFixed(1)}% · t=${tWelch(ivFm, ivRs).toFixed(2)}`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 7 · EN DÓLARES SOBRE LA CUENTA
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(118));
console.log(`7 · EN DÓLARES SOBRE LA CUENTA DE ${eur(CUENTA)} (efectivo ${eur(EFECTIVO)})`);
console.log("═".repeat(118));
const rT = evalPL(filas, filas.map((f) => f.pl), idxDe(filas, REGLA));
console.log(`  4,5 años completos · base ${eur(baseT.alAno)}/año (${(baseT.alAno / CUENTA * 100).toFixed(1)}% de la cuenta) · caja mínima ${eur(baseT.minCaja)}`);
console.log(`  con la regla       · ${eur(rT.alAno)}/año (${(rT.alAno / CUENTA * 100).toFixed(1)}%) · caja mínima ${eur(rT.minCaja)}`);
console.log(`  diferencia         · ${eur(rT.alAno - baseT.alAno)}/año`);
console.log(`  Las dos series revientan el efectivo. La regla NO salva la cuenta en 4,5 años.`);
