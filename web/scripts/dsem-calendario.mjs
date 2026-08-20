// EL CALENDARIO CONTRA LOS DÍAS MALOS · 1.121 días (2022-01 → 2026-08), CON CRUCE.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/dsem-calendario.mjs
//
// ═══ QUÉ CAMBIA RESPECTO A scripts/calendario-cola.mjs ══════════════════════════════════════
// Aquel midió el calendario sobre 653 días (2024-2026) — los MISMOS días donde ya se habían
// elegido las 47 reglas anteriores. Aquí hay 1.121 y se pueden partir en dos mitades ajenas.
//
// ═══ LA REGLA DE SELECCIÓN, ESCRITA ANTES DE MIRAR NINGUNA TABLA ════════════════════════════
// Para no repetir el error del filtro de amplitud, la elección de qué días saltarse es MECÁNICA
// y no tiene ni un umbral que tocar:
//
//     Dentro de una familia del calendario, se calcula la MEDIA de P&L de cada cubo en el
//     período de AJUSTE. Se salta todo cubo con media < 0 y al menos 20 días en ese período.
//     Nada más. Ni un umbral, ni un percentil, ni "el peor k".
//
// El cero no es un parámetro elegido: es la frontera entre ganar y perder dinero en ese cubo.
// El mínimo de 20 días tampoco: es la única guarda contra elegir un cubo por ruido, y va fija.
//
// Luego se aplica TAL CUAL al otro período. Y se repite al revés. Sólo cuenta lo que sobrevive
// a las dos direcciones.

import { readFileSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { tWelch, listonT } from "../lib/barreraHallazgos";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 0 · CUÁNTAS PRUEBAS — se declara antes de medir
// ═════════════════════════════════════════════════════════════════════════════════════════════
const PRUEBAS = 62;   // 14 familias, 58 cubos individuales + 4 reglas compuestas (2 direcciones × 2 variantes)
const LISTON = listonT(PRUEBAS);
const CUENTA = 56389;         // la cuenta de Lester
const EFECTIVO = 7977;        // el cuello de botella real
const DIAS_ANO = 252;

const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : NaN; };
function drawdown(pls) { let acc = 0, pico = 0, peor = 0; for (const p of pls) { acc += p; if (acc > pico) pico = acc; const dd = acc - pico; if (dd < peor) peor = dd; } return peor; }

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1 · DATOS + CALENDARIO (todo conocido con años de antelación)
// ═════════════════════════════════════════════════════════════════════════════════════════════
const filas = JSON.parse(readFileSync("scripts/dsem-filas.json", "utf8"));
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));

// Festivos NYSE. Comprobados contra el disco en dsem-verificar.mjs: ninguno tiene fichero.
const FEST = new Set(["2022-01-17","2022-02-21","2022-04-15","2022-05-30","2022-06-20","2022-07-04","2022-09-05","2022-11-24","2022-12-26",
"2023-01-02","2023-01-16","2023-02-20","2023-04-07","2023-05-29","2023-06-19","2023-07-04","2023-09-04","2023-11-23","2023-12-25",
"2024-01-01","2024-01-15","2024-02-19","2024-03-29","2024-05-27","2024-06-19","2024-07-04","2024-09-02","2024-11-28","2024-12-25",
"2025-01-01","2025-01-09","2025-01-20","2025-02-17","2025-04-18","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-11-27","2025-12-25",
"2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25"]);
// Medios días (cierre a las 13:00). DETECTADOS EN LOS FICHEROS, no de memoria: el precio del
// subyacente no cambia desde las 13:00. Ver la salida de dsem-verificar.mjs.
const MEDIO = new Set(["2022-11-25","2023-07-03","2023-11-24","2024-07-03","2024-11-29","2024-12-24","2025-07-03","2025-11-28","2025-12-24","2026-11-27","2026-12-24"]);

// Calendario de sesiones NYSE completo (días hábiles menos festivos), INDEPENDIENTE de qué haya
// en disco. Hace falta para "último día del mes" y "víspera de festivo": en 2022-Q1 faltan
// martes y jueves de los DATOS, pero el mercado sí abría.
const iso = (d) => d.toISOString().slice(0, 10);
const SESIONES = [];
for (let d = new Date("2021-12-01T00:00:00Z"); iso(d) <= "2026-12-31"; d.setUTCDate(d.getUTCDate() + 1)) {
  const s = iso(d), w = d.getUTCDay();
  if (w !== 0 && w !== 6 && !FEST.has(s)) SESIONES.push(s);
}
const POS = new Map(SESIONES.map((s, i) => [s, i]));

const tercerViernes = (ano, mes) => {
  let n = 0;
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(Date.UTC(ano, mes - 1, d));
    if (dt.getUTCMonth() !== mes - 1) break;
    if (dt.getUTCDay() === 5 && ++n === 3) return iso(dt);
  }
  return null;
};

for (const f of filas) {
  const d = new Date(f.fecha + "T00:00:00Z");
  const i = POS.get(f.fecha);
  if (i == null) throw new Error(`${f.fecha} no está en el calendario de sesiones — festivo mal escrito`);
  const ant = SESIONES[i - 1], sig = SESIONES[i + 1];
  const ano = +f.fecha.slice(0, 4), mes = +f.fecha.slice(5, 7), dia = +f.fecha.slice(8, 10);

  f.dow = d.getUTCDay();                                    // 1 lun … 5 vie
  f.dom = dia;
  f.mes = mes;
  f.ano = ano;
  f.semMes = Math.ceil(dia / 7);                            // 1ª..5ª vez que cae ese día del mes
  f.domCubo = Math.min(6, Math.ceil(dia / 5));              // 1-5, 6-10, … 26-31
  // ¿hay salto de más de un día natural hasta la sesión anterior/siguiente? = festivo pegado
  const salto = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000;
  f.vispFest = sig && salto(f.fecha, sig) > (f.dow === 5 ? 3 : 1) ? 1 : 0;
  f.postFest = ant && salto(ant, f.fecha) > (f.dow === 1 ? 3 : 1) ? 1 : 0;
  f.medioDia = MEDIO.has(f.fecha) ? 1 : 0;
  f.primeroMes = !ant || ant.slice(5, 7) !== f.fecha.slice(5, 7) ? 1 : 0;
  f.ultimoMes = !sig || sig.slice(5, 7) !== f.fecha.slice(5, 7) ? 1 : 0;
  f.ultimos2 = f.ultimoMes || (sig && SESIONES[i + 2] && SESIONES[i + 2].slice(5, 7) !== f.fecha.slice(5, 7)) ? 1 : 0;
  f.primeros2 = f.primeroMes || (ant && SESIONES[i - 2] && SESIONES[i - 2].slice(5, 7) !== f.fecha.slice(5, 7)) ? 1 : 0;
  const tv = tercerViernes(ano, mes);
  f.opex = f.fecha === tv ? 1 : 0;
  f.opexTrim = f.opex && [3, 6, 9, 12].includes(mes) ? 1 : 0;
  const iTv = POS.get(tv);
  f.dAOpex = iTv != null ? i - iTv : null;                  // sesiones desde el vencimiento mensual
  f.semOpex = f.dAOpex != null && f.dAOpex >= -4 && f.dAOpex <= 0 ? 1 : 0;
  f.finTrim = f.ultimoMes && [3, 6, 9, 12].includes(mes) ? 1 : 0;
  f.periodo = f.fecha < "2024-01-01" ? "A" : "B";           // A = 2022-2023 · B = 2024-2026

  // desenlace: qué lado rompió
  f.zRompeCall = f.cierre > f.kCallCorta ? 1 : 0;
  f.zRompePut = f.cierre < f.kPutCorta ? 1 : 0;
  f.zSigmas = f.sigma ? Math.abs(f.zTardePts) / f.sigma : null;
}

radiografia(filas, ["pl", "dow", "dom", "mes", "semMes", "dAOpex", "credito", "sigma"], "1.121 días con calendario",
  { cerosLegitimos: [] , maxCeros: 0.6 });

const A = filas.filter((f) => f.periodo === "A");
const B = filas.filter((f) => f.periodo === "B");

function resumen(fs, anos) {
  const pl = fs.map((f) => f.pl);
  const total = pl.reduce((a, b) => a + b, 0);
  return { n: pl.length, total, alAno: total / anos, media: media(pl), peor: Math.min(...pl),
           p1: pct(pl, 0.01), p5: pct(pl, 0.05), dd: drawdown(pl), acierto: pl.filter((x) => x > 0).length / pl.length };
}
const anosA = A.length / DIAS_ANO, anosB = B.length / DIAS_ANO, anosT = filas.length / DIAS_ANO;

console.log("\n" + "═".repeat(112));
console.log("1 · LA BASE — el cóndor sin filtro, por período");
console.log("═".repeat(112));
console.log("| período | días | total | $/año | media/día | acierto | peor día | p1 | p5 | peor racha |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const PER = [["2022-2023 (A)", A, anosA], ["2024-2026 (B)", B, anosB], ["TODO", filas, anosT],
  ...[2022, 2023, 2024, 2025, 2026].map((y) => { const g = filas.filter((f) => f.ano === y); return ["  " + y, g, g.length / DIAS_ANO]; })];
for (const [et, g, an] of PER) {
  const r = resumen(g, an);
  console.log(`| ${et} | ${r.n} | ${eur(r.total)} | ${eur(r.alAno)} | ${eur(r.media)} | ${(r.acierto*100).toFixed(0)}% | ${eur(r.peor)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.dd)} |`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2 · RETRATO DE LOS DÍAS MALOS — descripción, no prueba
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(112));
console.log("2 · QUÉ TIENEN EN COMÚN LOS DÍAS QUE DUELEN");
console.log("═".repeat(112));
const ord = [...filas].sort((a, b) => a.pl - b.pl);
const totalBruto = filas.reduce((a, f) => a + f.pl, 0);
const ganan = filas.filter((f) => f.pl > 0);
console.log(`  días que ganan: ${ganan.length} (${(ganan.length / filas.length * 100).toFixed(1)}%) · suman ${eur(ganan.reduce((a, f) => a + f.pl, 0))}`);
console.log(`  días que pierden: ${filas.length - ganan.length} · restan ${eur(filas.filter((f) => f.pl <= 0).reduce((a, f) => a + f.pl, 0))}`);
for (const k of [5, 10, 20, 40, 56]) {
  const peores = ord.slice(0, k);
  console.log(`    los ${String(k).padStart(3)} peores días (${(k / filas.length * 100).toFixed(1)}% del tiempo) restan ${eur(peores.reduce((a, f) => a + f.pl, 0)).padStart(9)} · el resto suma ${eur(totalBruto - peores.reduce((a, f) => a + f.pl, 0))}`);
}
const p5v = pct(filas.map((f) => f.pl), 0.05);
const malos = filas.filter((f) => f.pl <= p5v);
const buenos = filas.filter((f) => f.pl > p5v);
console.log(`\n  RETRATO del 5% peor (n=${malos.length}, corte ${eur(p5v)}) frente al resto:`);
const cmp = (nom, g, u = "", esc = 1) => console.log(`    ${nom.padEnd(30)} malos ${(media(malos.map(g)) * esc).toFixed(2).padStart(9)}${u}   resto ${(media(buenos.map(g)) * esc).toFixed(2).padStart(9)}${u}`);
cmp("crédito cobrado ($)", (f) => f.credito);
cmp("IV del dinero a las 11:00 (%)", (f) => f.ivAtm, "", 100);
cmp("σ implícita hasta el cierre (pts)", (f) => f.sigma);
cmp("rango de la mañana (pts)", (f) => f.maxM - f.minM);
cmp("|mov. mañana| (pts)", (f) => Math.abs(f.sp11 - f.ap));
cmp("|mov. de tarde| (pts)", (f) => Math.abs(f.zTardePts));
cmp("mov. de tarde en σ", (f) => f.zSigmas);
console.log(`    ${"rompe por CALL / por PUT".padEnd(30)} malos ${malos.filter((f) => f.zRompeCall).length} / ${malos.filter((f) => f.zRompePut).length}      resto ${buenos.filter((f) => f.zRompeCall).length} / ${buenos.filter((f) => f.zRompePut).length}`);
const sub = malos.filter((f) => f.zTardePts > 0).length;
console.log(`    ${"dirección del día malo".padEnd(30)} ${sub} al alza · ${malos.length - sub} a la baja`);
// ¿se agrupan?
let seguidos = 0;
for (let i = 1; i < filas.length; i++) if (filas[i].pl <= p5v && filas[i - 1].pl <= p5v) seguidos++;
console.log(`    días malos consecutivos: ${seguidos} de ${malos.length} (azar esperado ≈ ${(malos.length * 0.05).toFixed(1)}) — ${seguidos > malos.length * 0.05 * 2 ? "SE AGRUPAN" : "no se agrupan de forma clara"}`);
console.log(`\n  los 15 peores días de los 4,5 años:`);
for (const f of ord.slice(0, 15))
  console.log(`    ${f.fecha}  ${["dom","lun","mar","mié","jue","vie"][f.dow]}  ${eur(f.pl).padStart(8)}  crédito ${eur(f.credito).padStart(7)}  tarde ${f.zTardePts.toFixed(0).padStart(6)} pts (${f.zSigmas.toFixed(1)}σ)  ${f.zRompeCall ? "CALL" : f.zRompePut ? "PUT " : "—   "}  ${f.opex ? "OPEX " : ""}${f.ultimoMes ? "finMes " : ""}${f.vispFest ? "vispFest " : ""}${f.postFest ? "postFest " : ""}${f.medioDia ? "medioDía" : ""}`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3 · LAS FAMILIAS DEL CALENDARIO, LADO A LADO EN LOS DOS PERÍODOS
// ═════════════════════════════════════════════════════════════════════════════════════════════
const DIAS = ["dom", "LUN", "MAR", "MIE", "JUE", "VIE", "sab"];
const MESES = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const FAMILIAS = [
  { id: "dow", nom: "día de la semana", cubo: (f) => f.dow, et: (v) => DIAS[v] },
  { id: "domCubo", nom: "día del mes (tramos de 5)", cubo: (f) => f.domCubo, et: (v) => ["", "1-5", "6-10", "11-15", "16-20", "21-25", "26-31"][v] },
  { id: "semMes", nom: "semana del mes", cubo: (f) => f.semMes, et: (v) => `sem ${v}` },
  { id: "mes", nom: "mes del año", cubo: (f) => f.mes, et: (v) => MESES[v] },
  { id: "opex", nom: "vencimiento mensual (3er viernes)", cubo: (f) => f.opex, et: (v) => (v ? "OPEX" : "resto") },
  { id: "opexTrim", nom: "vencimiento trimestral", cubo: (f) => f.opexTrim, et: (v) => (v ? "trimestral" : "resto") },
  { id: "semOpex", nom: "semana de vencimiento", cubo: (f) => f.semOpex, et: (v) => (v ? "sem OPEX" : "resto") },
  { id: "vispFest", nom: "víspera de festivo", cubo: (f) => f.vispFest, et: (v) => (v ? "víspera" : "resto") },
  { id: "postFest", nom: "día siguiente a festivo", cubo: (f) => f.postFest, et: (v) => (v ? "post-festivo" : "resto") },
  { id: "medioDia", nom: "medio día (cierre 13:00)", cubo: (f) => f.medioDia, et: (v) => (v ? "medio día" : "resto") },
  { id: "primeroMes", nom: "primer día del mes", cubo: (f) => f.primeroMes, et: (v) => (v ? "1º del mes" : "resto") },
  { id: "ultimoMes", nom: "último día del mes", cubo: (f) => f.ultimoMes, et: (v) => (v ? "último" : "resto") },
  { id: "ultimos2", nom: "dos últimos del mes", cubo: (f) => f.ultimos2, et: (v) => (v ? "2 últimos" : "resto") },
  { id: "finTrim", nom: "fin de trimestre", cubo: (f) => f.finTrim, et: (v) => (v ? "fin trim" : "resto") },
];

const tabla = {};
console.log("\n" + "═".repeat(112));
console.log(`3 · CADA FAMILIA, EN LOS DOS PERÍODOS · listón de |t| = ${LISTON} (Bonferroni, ${PRUEBAS} pruebas)`);
console.log("═".repeat(112));
for (const fam of FAMILIAS) {
  const vals = [...new Set(filas.map(fam.cubo))].sort((a, b) => a - b);
  console.log(`\n### ${fam.nom}`);
  console.log("| cubo | nA | media A | peor A | nB | media B | peor B | t A | t B | mismo signo |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  tabla[fam.id] = {};
  for (const v of vals) {
    const gA = A.filter((f) => fam.cubo(f) === v), rA = A.filter((f) => fam.cubo(f) !== v);
    const gB = B.filter((f) => fam.cubo(f) === v), rB = B.filter((f) => fam.cubo(f) !== v);
    if (!gA.length && !gB.length) continue;
    const mA = gA.length ? media(gA.map((f) => f.pl)) : NaN, mB = gB.length ? media(gB.map((f) => f.pl)) : NaN;
    const tA = tWelch(gA.map((f) => f.pl), rA.map((f) => f.pl)), tB = tWelch(gB.map((f) => f.pl), rB.map((f) => f.pl));
    const signo = isFinite(mA) && isFinite(mB) && Math.sign(mA) === Math.sign(mB) ? (mA < 0 ? "SÍ (los dos −)" : "sí (+)") : "no";
    tabla[fam.id][v] = { et: fam.et(v), nA: gA.length, mA, nB: gB.length, mB, tA, tB };
    console.log(`| ${fam.et(v)} | ${gA.length} | ${eur(mA)} | ${gA.length ? eur(Math.min(...gA.map((f) => f.pl))) : "—"} | ${gB.length} | ${eur(mB)} | ${gB.length ? eur(Math.min(...gB.map((f) => f.pl))) : "—"} | ${tA.toFixed(2)} | ${tB.toFixed(2)} | ${signo} |`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4 · EL CRUCE — se elige en uno, se aplica en el otro. Sin tocar un número.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const MIN_N = 20;   // guarda fija contra elegir un cubo por ruido. NO es un parámetro que se toque.

/** Cubos a saltar, elegidos SÓLO con el período de ajuste: media < 0 y n ≥ MIN_N. */
function elegir(ajuste) {
  const skip = [];
  for (const fam of FAMILIAS) {
    const vals = [...new Set(ajuste.map(fam.cubo))];
    for (const v of vals) {
      const g = ajuste.filter((f) => fam.cubo(f) === v);
      if (g.length >= MIN_N && media(g.map((f) => f.pl)) < 0) skip.push({ fam, v, n: g.length, m: media(g.map((f) => f.pl)) });
    }
  }
  return skip;
}
const salta = (skip) => (f) => skip.some((s) => s.fam.cubo(f) === s.v);

function evaluar(base, anos, filtro, et) {
  const serie = base.map((f) => (filtro(f) ? 0 : f.pl));      // saltarse un día es un 0, no un hueco
  const operados = base.filter((f) => !filtro(f));
  const pl = operados.map((f) => f.pl);
  const total = serie.reduce((a, b) => a + b, 0);
  return { et, nTotal: base.length, nOpera: operados.length, total, alAno: total / anos,
    peor: pl.length ? Math.min(...pl) : 0, p1: pct(serie, 0.01), p5: pct(serie, 0.05), dd: drawdown(serie),
    acierto: pl.length ? pl.filter((x) => x > 0).length / pl.length : NaN };
}

function cruce(nomA, ajuste, anosAj, nomB, prueba, anosPr) {
  const skip = elegir(ajuste);
  console.log(`\n${"─".repeat(112)}`);
  console.log(`AJUSTADO EN ${nomA} → PROBADO EN ${nomB}`);
  console.log(`${"─".repeat(112)}`);
  console.log(`  cubos con media < 0 y n ≥ ${MIN_N} en ${nomA} (${skip.length}):`);
  for (const s of skip) console.log(`    · ${s.fam.nom.padEnd(34)} ${String(s.fam.et(s.v)).padEnd(12)} n=${String(s.n).padStart(4)}  media ${eur(s.m)}`);
  if (!skip.length) { console.log("    ninguno — el calendario no marca nada negativo en este período"); return null; }
  const f = salta(skip);
  const bAj = evaluar(ajuste, anosAj, () => false, `${nomA} base`);
  const fAj = evaluar(ajuste, anosAj, f, `${nomA} filtrado (donde se eligió)`);
  const bPr = evaluar(prueba, anosPr, () => false, `${nomB} base`);
  const fPr = evaluar(prueba, anosPr, f, `${nomB} filtrado ⟵ FUERA DE MUESTRA`);
  console.log(`\n| serie | días | opera | $/año | peor día | p1 | p5 | peor racha | acierto |`);
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const r of [bAj, fAj, bPr, fPr])
    console.log(`| ${r.et} | ${r.nTotal} | ${r.nOpera} | ${eur(r.alAno)} | ${eur(r.peor)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.dd)} | ${(r.acierto*100).toFixed(0)}% |`);
  const perdido = bPr.alAno - fPr.alAno, quitado = Math.abs(bPr.dd) - Math.abs(fPr.dd);
  console.log(`\n  FUERA DE MUESTRA · ingreso perdido ${eur(perdido)}/año · caída eliminada ${eur(quitado)}`);
  console.log(`  MÉTRICA QUE DECIDE: ${quitado > 0 ? `$${(perdido / quitado).toFixed(2)} de ingreso por cada $1 de caída quitado` : "la caída NO se redujo — la regla no sirve"}`);
  return { skip, bAj, fAj, bPr, fPr, perdido, quitado, ratio: quitado > 0 ? perdido / quitado : null };
}

console.log("\n" + "═".repeat(112));
console.log("4 · EL CRUCE EN LAS DOS DIRECCIONES");
console.log("═".repeat(112));
const AB = cruce("2022-2023", A, anosA, "2024-2026", B, anosB);
const BA = cruce("2024-2026", B, anosB, "2022-2023", A, anosA);

// ── ¿coinciden los cubos elegidos en las dos direcciones? ────────────────────────────────────
console.log("\n" + "═".repeat(112));
console.log("5 · ¿QUÉ CUBOS ELIGEN LOS DOS PERÍODOS A LA VEZ?");
console.log("═".repeat(112));
const clave = (s) => `${s.fam.id}=${s.v}`;
const setA = new Map((AB?.skip ?? []).map((s) => [clave(s), s]));
const setB = new Map((BA?.skip ?? []).map((s) => [clave(s), s]));
const comunes = [...setA.keys()].filter((k) => setB.has(k));
console.log(`  elegidos en 2022-2023: ${setA.size} · en 2024-2026: ${setB.size} · EN LOS DOS: ${comunes.length}`);
for (const k of comunes) {
  const s = setA.get(k), t = setB.get(k);
  console.log(`    ✓ ${s.fam.nom} = ${s.fam.et(s.v)}   media A ${eur(s.m)} (n=${s.n}) · media B ${eur(t.m)} (n=${t.n})`);
}
if (!comunes.length) console.log("    NINGUNO. El calendario no señala el mismo cubo en los dos períodos.");

// Si hay comunes, se mide la regla hecha SÓLO con ellos, sobre el total y sobre cada mitad.
if (comunes.length) {
  const reglaComun = (f) => comunes.some((k) => { const s = setA.get(k); return s.fam.cubo(f) === s.v; });
  console.log(`\n  LA REGLA COMÚN (sólo los cubos que salen en los dos períodos):`);
  console.log(`| serie | días | opera | $/año | peor día | p1 | p5 | peor racha | acierto |`);
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const [et, g, an] of [["2022-2023", A, anosA], ["2024-2026", B, anosB], ["TODO", filas, anosT]]) {
    const b = evaluar(g, an, () => false, `${et} base`), r = evaluar(g, an, reglaComun, `${et} con la regla`);
    console.log(`| ${b.et} | ${b.nTotal} | ${b.nOpera} | ${eur(b.alAno)} | ${eur(b.peor)} | ${eur(b.p1)} | ${eur(b.p5)} | ${eur(b.dd)} | ${(b.acierto*100).toFixed(0)}% |`);
    console.log(`| ${r.et} | ${r.nTotal} | ${r.nOpera} | ${eur(r.alAno)} | ${eur(r.peor)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.dd)} | ${(r.acierto*100).toFixed(0)}% |`);
  }
}

writeFileSync("scripts/dsem-calendario.json", JSON.stringify({ tabla, comunes, PRUEBAS, LISTON }, null, 1));
console.log(`\n(escrito scripts/dsem-calendario.json · cuenta ${eur(CUENTA)} · efectivo ${eur(EFECTIVO)})`);
