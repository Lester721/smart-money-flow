// ═══════════════════════════════════════════════════════════════════════════════════════════════
// REFUTACIÓN CON LA LENTE «DINERO»
//
// El hallazgo "no abrir cóndor el último día hábil del mes" sobrevive el cruce en dirección. Esto
// no lo discute. Lo que pregunta es lo otro: cuando le pasas por encima la horquilla real de las
// CUATRO patas, el colateral que retiene Robinhood, el efectivo que de verdad hay ($7.977) y el
// interés de margen al 5%, ¿QUEDA ALGO?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/refut-dinero.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { tWelch, listonT } from "../lib/barreraHallazgos";

// ── LAS PRUEBAS QUE HAGO, DECLARADAS ─────────────────────────────────────────────────────────
// El hallazgo declaró 62. Yo añado 8 comparaciones estadísticas nuevas (peaje fin-de-mes vs resto,
// peaje 2022-23 vs 2024-26, IV, hFin, HOOD en días malos, ancho, riesgo, y el corte de liquidación).
const PRUEBAS = 70;
const LISTON = listonT(PRUEBAS);

// ── LA CUENTA, TAL CUAL ──────────────────────────────────────────────────────────────────────
const EFECTIVO = 7977;         // el cuello de botella: LAS PÉRDIDAS SALEN DE AQUÍ
const PODER_COMPRA = 73874;
const ACCIONES_HOOD = 500;
const COLATERAL = 5000;        // comprobado en pantalla: una vertical al ancho completo
const TASA_MARGEN = 0.05;      // 5% anual
const BASE_DIAS = 360;         // los brókers devengan el margen sobre 360, no 365
const MANTENIMIENTO = 0.25;    // Reg-T: llamada de margen si el patrimonio < 25% del valor largo
const COMM_PATA = 0.03;
const DIAS_ANO = 252;

const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : NaN; };
const H = (t) => { console.log("\n" + "═".repeat(112)); console.log(t); console.log("═".repeat(112)); };

const filas = JSON.parse(readFileSync("scripts/refut-dinero-filas.json", "utf8"));
const HOOD = JSON.parse(readFileSync("scripts/refut-hood-cierres.json", "utf8"));
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));

// ── calendario: último día hábil del mes (misma definición que el hallazgo) ───────────────────
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
  f.ultimoMes = SESIONES[i + 1].slice(5, 7) !== f.fecha.slice(5, 7) ? 1 : 0;
  f.periodo = f.fecha < "2024-01-01" ? "A" : "B";
  f.ano = +f.fecha.slice(0, 4);
  // P&L tal como lo calcula el hallazgo: natural a la entrada, liquidación a intrínseco al cierre
  f.pl = f.creditoNat - f.perdidaC - f.perdidaP - 8 * COMM_PATA;
  // el mismo día pero cobrando el punto medio (cota SUPERIOR, imposible en la práctica)
  f.plMid = f.creditoMid - f.perdidaC - f.perdidaP - 8 * COMM_PATA;
  f.hood = HOOD[f.fecha] ?? null;
}

// ═══ 0 · RADIOGRAFÍA — antes de medir nada ══════════════════════════════════════════════════
H("0 · RADIOGRAFÍA de las filas de dinero");
// anchoC/anchoP NO van aquí a propósito: son CONSTANTES de diseño (el ala mide 50 puntos), no
// campos que ordenen nada. radiografia() las tumba con razón — "sólo 1 valor distinto" — así que
// se miran aparte, en la sección 1, contándolas. Meterlas aquí sería silenciar al guardián.
radiografia(filas, ["creditoNat", "creditoMid", "peaje", "riesgoMax", "distC", "distP", "pl", "sp11", "cierre", "hood"],
  "cóndor 0DTE · 4 patas abiertas");

const A = filas.filter((f) => f.periodo === "A"), B = filas.filter((f) => f.periodo === "B");
const anosA = A.length / DIAS_ANO, anosB = B.length / DIAS_ANO, anosT = filas.length / DIAS_ANO;
console.log(`  A = 2022-2023 · ${A.length} días (${anosA.toFixed(2)} años)   B = 2024-2026 · ${B.length} días (${anosB.toFixed(2)} años)`);

// ═══ 1 · ¿LA ESTRUCTURA ES LA QUE DICE SER? ═════════════════════════════════════════════════
H("1 · LA ESTRUCTURA · ¿de verdad son alas de 50 y cortos a ±25?");
const cnt = (v) => { const m = new Map(); for (const x of v) m.set(x, (m.get(x) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
console.log(`  ancho del ala CALL:  ${cnt(filas.map((f) => f.anchoC)).slice(0, 5).map(([k, n]) => `${k}pts×${n}`).join(" · ")}`);
console.log(`  ancho del ala PUT :  ${cnt(filas.map((f) => f.anchoP)).slice(0, 5).map(([k, n]) => `${k}pts×${n}`).join(" · ")}`);
const noEs50 = filas.filter((f) => f.anchoC !== 50 || f.anchoP !== 50).length;
console.log(`  días donde algún ala NO mide 50 puntos: ${noEs50} de ${filas.length} (${(noEs50 / filas.length * 100).toFixed(1)}%)`);
console.log(`  distancia del corto al spot · CALL  p5 ${pct(filas.map((f) => f.distC), 0.05).toFixed(1)} · p50 ${pct(filas.map((f) => f.distC), 0.5).toFixed(1)} · p95 ${pct(filas.map((f) => f.distC), 0.95).toFixed(1)} pts`);
console.log(`  distancia del corto al spot · PUT   p5 ${pct(filas.map((f) => f.distP), 0.05).toFixed(1)} · p50 ${pct(filas.map((f) => f.distP), 0.5).toFixed(1)} · p95 ${pct(filas.map((f) => f.distP), 0.95).toFixed(1)} pts`);
console.log(`  RIESGO MÁXIMO por cóndor (ancho×100 − crédito): p50 ${eur(pct(filas.map((f) => f.riesgoMax), 0.5))} · p95 ${eur(pct(filas.map((f) => f.riesgoMax), 0.95))} · MÁXIMO ${eur(Math.max(...filas.map((f) => f.riesgoMax)))}`);

// ═══ 2 · LA HORA DE LIQUIDACIÓN — ¿estamos midiendo hasta las 16:00 de verdad? ══════════════
H("2 · LA HORA DEL CIERRE · el hallazgo dice que el daño llega en los últimos 30 minutos. ¿Los tenemos?");
console.log(`  última cotización del día en el fichero: ${cnt(filas.map((f) => f.hFin)).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(" · ")}`);
const uFin = filas.filter((f) => f.ultimoMes), rFin = filas.filter((f) => !f.ultimoMes);
console.log(`  → SPXW liquida contra el índice de las 16:00. Si el último dato es anterior, se está`);
console.log(`    liquidando ANTES de la subasta — justo el tramo donde el hallazgo pone el mecanismo.`);

// ═══ 3 · LA HORQUILLA REAL DE LAS CUATRO PATAS ══════════════════════════════════════════════
H("3 · LA HORQUILLA · lo que cuesta cruzar las cuatro patas, en dólares");
const peaje = filas.map((f) => f.peaje);
console.log(`  crédito NATURAL (bid vendido, ask comprado, lo que usa el hallazgo): media ${eur(media(filas.map((f) => f.creditoNat)))} · p50 ${eur(pct(filas.map((f) => f.creditoNat), 0.5))}`);
console.log(`  crédito al PUNTO MEDIO (cota superior, no operable):                  media ${eur(media(filas.map((f) => f.creditoMid)))} · p50 ${eur(pct(filas.map((f) => f.creditoMid), 0.5))}`);
console.log(`  PEAJE de las 4 horquillas:  media ${eur(media(peaje))} · p50 ${eur(pct(peaje, 0.5))} · p95 ${eur(pct(peaje, 0.95))}`);
console.log(`  el peaje es el ${(media(peaje) / media(filas.map((f) => f.creditoMid)) * 100).toFixed(1)}% del crédito teórico, y cuesta ${eur(media(peaje) * DIAS_ANO)}/año a 1 contrato diario`);
console.log(`\n  desglose por pata (media de la horquilla, en $ por contrato):`);
for (const [et, b, a] of [["call corta (VENDE)", "cCb", "cCa"], ["put corta (VENDE)", "pCb", "pCa"], ["call larga (COMPRA)", "cLb", "cLa"], ["put larga (COMPRA)", "pLb", "pLa"]]) {
  const h = filas.map((f) => (f[a] - f[b]) * 100), m = filas.map((f) => (f[a] + f[b]) / 2 * 100);
  console.log(`    ${et.padEnd(20)} horquilla media ${eur(media(h)).padStart(7)} · precio medio ${eur(media(m)).padStart(7)} · horquilla = ${(media(h) / media(m) * 100).toFixed(0)}% del precio`);
}
const bid0 = filas.filter((f) => f.cLb === 0 || f.pLb === 0).length;
console.log(`\n  días con ALGUNA ala a bid = 0 (horquilla del 100%): ${bid0} de ${filas.length} (${(bid0 / filas.length * 100).toFixed(1)}%)`);
console.log(`  ¿el peaje es distinto el último día del mes? último ${eur(media(uFin.map((f) => f.peaje)))} vs resto ${eur(media(rFin.map((f) => f.peaje)))}  (t=${tWelch(uFin.map((f) => f.peaje), rFin.map((f) => f.peaje)).toFixed(2)}, listón ${LISTON})`);
console.log(`  ¿y entre períodos?  2022-23 ${eur(media(A.map((f) => f.peaje)))} vs 2024-26 ${eur(media(B.map((f) => f.peaje)))}  (t=${tWelch(A.map((f) => f.peaje), B.map((f) => f.peaje)).toFixed(2)})`);

// ═══ 4 · COLATERAL vs PODER DE COMPRA ═══════════════════════════════════════════════════════
H("4 · EL COLATERAL · ¿cabe en los $73.874 de poder de compra?");
console.log(`  colateral comprobado en pantalla: ${eur(COLATERAL)} por cóndor (una vertical al ancho completo)`);
console.log(`  contratos que caben POR PODER DE COMPRA:  ${Math.floor(PODER_COMPRA / COLATERAL)}`);
console.log(`  contratos que caben POR EFECTIVO:         ${Math.floor(EFECTIVO / COLATERAL)}   ← el cuello de botella`);
console.log(`  0DTE: el colateral se retiene INTRADÍA y se libera al liquidar. No genera interés de margen.`);
console.log(`  la pérdida máxima de UN cóndor (${eur(Math.max(...filas.map((f) => f.riesgoMax)))}) es el ${(Math.max(...filas.map((f) => f.riesgoMax)) / EFECTIVO * 100).toFixed(0)}% del efectivo disponible.`);
console.log(`  → el colateral NO es la restricción. La restricción es que un solo día malo se lleva medio bolsillo.`);

// ═══ 5 · LA CAJA, DÍA A DÍA, CON INTERÉS DE MARGEN AL 5% ════════════════════════════════════
H(`5 · LA CAJA DE VERDAD · ${eur(EFECTIVO)} de efectivo, interés de margen al ${(TASA_MARGEN * 100).toFixed(0)}% sobre base ${BASE_DIAS}`);

/**
 * Simula la caja día a día.
 *  - las pérdidas y ganancias entran en efectivo el mismo día (0DTE liquida en efectivo)
 *  - si la caja queda NEGATIVA, es un préstamo de margen: se devenga al 5% sobre días naturales
 *  - `hoodVivo`: si true, el valor de las 500 HOOD es el REAL de esa fecha (escenario "llevo
 *     haciendo esto desde 2022"). Si false, se congela en el de hoy (escenario "empiezo hoy",
 *     que es OPTIMISTA: supone que HOOD no se mueve).
 *  - llamada de margen cuando el préstamo pasa del 75% del valor de las acciones (mantenimiento 25%)
 */
function caja(fs, saltar, { hoodVivo = false, contratos = 1, conInteres = true, exigirColateralEnCaja = false } = {}) {
  const hoodHoy = HOOD["2026-08-19"];
  let c = EFECTIVO, minC = EFECTIVO, diaMin = null, interes = 0, ruina = null, prev = null, opera = 0, saltados = 0;
  for (const f of fs) {
    if (conInteres && prev) {
      const dn = (new Date(f.fecha + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000;
      if (c < 0) { const i = -c * TASA_MARGEN / BASE_DIAS * dn; interes += i; c -= i; }
    }
    prev = f.fecha;
    if (saltar(f)) { saltados++; continue; }
    // ¿se puede abrir? colateral intradía
    const valorHood = ACCIONES_HOOD * (hoodVivo ? (f.hood ?? hoodHoy) : hoodHoy);
    if (exigirColateralEnCaja && c < COLATERAL * contratos) { saltados++; continue; }
    c += f.pl * contratos;
    opera++;
    if (c < minC) { minC = c; diaMin = f.fecha; }
    if (!ruina && c < -0.75 * valorHood) ruina = { fecha: f.fecha, caja: c, hood: valorHood };
  }
  return { min: minC, diaMin, final: c, interes, ruina, opera, saltados };
}

const sinRegla = () => false;
const conRegla = (f) => f.ultimoMes === 1;

function fila(et, r, anos) {
  console.log(`  ${et.padEnd(52)} caja mín ${eur(r.min).padStart(10)} (${r.diaMin ?? "—"})  final ${eur(r.final).padStart(10)}  interés ${eur(-r.interes).padStart(9)}  ${r.min < 0 ? "⛔ EN NÚMEROS ROJOS" : "✅ sobrevive"}${r.ruina ? `  💥 LLAMADA DE MARGEN el ${r.ruina.fecha}` : ""}`);
}
console.log("\n  A · escenario OPTIMISTA — 500 HOOD congeladas al precio de HOY ($" + HOOD["2026-08-19"] + ", " + eur(ACCIONES_HOOD * HOOD["2026-08-19"]) + ")");
fila("1 cóndor diario · SIN regla · 1.121 días", caja(filas, sinRegla), anosT);
fila("1 cóndor diario · CON regla fin de mes", caja(filas, conRegla), anosT);
fila("1 cóndor diario · SIN regla · sólo 2024-2026", caja(B, sinRegla), anosB);
fila("1 cóndor diario · CON regla · sólo 2024-2026", caja(B, conRegla), anosB);
fila("1 cóndor diario · SIN regla · sólo 2022-2023", caja(A, sinRegla), anosA);
fila("1 cóndor diario · CON regla · sólo 2022-2023", caja(A, conRegla), anosA);

console.log("\n  B · escenario REAL — 500 HOOD al precio DE CADA DÍA (en 2022 valían " + eur(500 * HOOD["2022-06-16"]) + ", no " + eur(500 * HOOD["2026-08-19"]) + ")");
fila("1 cóndor diario · SIN regla · 1.121 días", caja(filas, sinRegla, { hoodVivo: true }), anosT);
fila("1 cóndor diario · CON regla fin de mes", caja(filas, conRegla, { hoodVivo: true }), anosT);

console.log("\n  C · escenario DISCIPLINADO — no se abre si no hay " + eur(COLATERAL) + " en EFECTIVO (nada de margen)");
const d1 = caja(filas, sinRegla, { exigirColateralEnCaja: true });
const d2 = caja(filas, conRegla, { exigirColateralEnCaja: true });
console.log(`    SIN regla: opera ${d1.opera} días, deja de operar ${d1.saltados}, caja mín ${eur(d1.min)}, final ${eur(d1.final)}`);
console.log(`    CON regla: opera ${d2.opera} días, deja de operar ${d2.saltados}, caja mín ${eur(d2.min)}, final ${eur(d2.final)}`);

// ═══ 6 · EL CRUCE, PERO EN DÓLARES NETOS DE INTERÉS ═════════════════════════════════════════
H("6 · EL CRUCE EN LAS DOS DIRECCIONES, NETO DE INTERÉS DE MARGEN");
function serieNeta(fs, saltar, anos) {
  const r = caja(fs, saltar);
  const bruto = fs.filter((f) => !saltar(f)).reduce((a, f) => a + f.pl, 0);
  const pls = fs.map((f) => (saltar(f) ? 0 : f.pl));
  let acc = 0, pico = 0, dd = 0;
  for (const p of pls) { acc += p; if (acc > pico) pico = acc; if (acc - pico < dd) dd = acc - pico; }
  const op = fs.filter((f) => !saltar(f)).map((f) => f.pl);
  return { bruto, interes: r.interes, neto: bruto - r.interes, alAnoNeto: (bruto - r.interes) / anos,
    dd, peor: Math.min(...op), p1: pct(pls, 0.01), p5: pct(pls, 0.05), cajaMin: r.min, n: op.length };
}
console.log("| período | regla | días op. | bruto/año | interés/año | NETO/año | peor día | p1 | p5 | peor racha | caja mínima |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const [et, fs, anos] of [["2022-2023", A, anosA], ["2024-2026", B, anosB], ["1.121 días", filas, anosT]]) {
  for (const [rn, rg] of [["sin", sinRegla], ["CON fin de mes", conRegla]]) {
    const s = serieNeta(fs, rg, anos);
    console.log(`| ${et} | ${rn} | ${s.n} | ${eur(s.bruto / anos)} | ${eur(-s.interes / anos)} | **${eur(s.alAnoNeto)}** | ${eur(s.peor)} | ${eur(s.p1)} | ${eur(s.p5)} | ${eur(s.dd)} | ${eur(s.cajaMin)} |`);
  }
}
console.log("\n  LA MÉTRICA QUE DECIDE, neta de interés:");
for (const [nomAj, nomPr, fs, anos] of [["2022-2023", "2024-2026", B, anosB], ["2024-2026", "2022-2023", A, anosA]]) {
  const b = serieNeta(fs, sinRegla, anos), f = serieNeta(fs, conRegla, anos);
  const perdido = b.alAnoNeto - f.alAnoNeto, quitado = Math.abs(b.dd) - Math.abs(f.dd);
  console.log(`    elegida en ${nomAj} → probada en ${nomPr}:  ingreso ${perdido >= 0 ? "perdido" : "GANADO"} ${eur(Math.abs(perdido))}/año · caída ${quitado >= 0 ? "eliminada" : "AUMENTADA"} ${eur(Math.abs(quitado))} · caja mín ${eur(b.cajaMin)} → ${eur(f.cajaMin)}`);
}

// ═══ 7 · ¿Y SI EL RELLENO NO ES EL NATURAL? ═════════════════════════════════════════════════
H("7 · SENSIBILIDAD AL RELLENO · el natural es la cota mala; el punto medio es la imposible");
console.log("| relleno | 2022-2023 $/año | 2024-2026 $/año | 1.121 días $/año | con regla, 1.121 días |");
console.log("|---|---|---|---|---|");
for (const q of [0, 0.25, 0.5, 0.75, 1]) {
  const pl = (f) => f.creditoNat + q * f.peaje - f.perdidaC - f.perdidaP - 8 * COMM_PATA;
  const tot = (fs, sk) => fs.filter((f) => !sk(f)).reduce((a, f) => a + pl(f), 0);
  console.log(`| natural + ${(q * 100).toFixed(0)}% del peaje | ${eur(tot(A, sinRegla) / anosA)} | ${eur(tot(B, sinRegla) / anosB)} | ${eur(tot(filas, sinRegla) / anosT)} | ${eur(tot(filas, conRegla) / anosT)} |`);
}
// ¿cuánto crédito hay que perder para que 2024-2026 deje de ganar?
let corte = null;
for (let h = 0; h <= 0.6; h += 0.005) {
  const t = B.reduce((a, f) => a + (f.creditoNat * (1 - h) - f.perdidaC - f.perdidaP - 8 * COMM_PATA), 0);
  if (t <= 0) { corte = h; break; }
}
console.log(`\n  punto de no retorno: si el relleno real da un ${corte != null ? (corte * 100).toFixed(1) + "%" : ">60%"} menos de crédito que el natural, 2024-2026 deja de ganar.`);

// ═══ 8 · ¿QUÉ HACE HOOD LOS DÍAS QUE EL CÓNDOR REVIENTA? ════════════════════════════════════
H("8 · EL COLATERAL SE EVAPORA CUANDO MÁS FALTA · qué hace HOOD los días malos del cóndor");
const conHood = filas.filter((f) => f.hood != null);
const idx = new Map(conHood.map((f, i) => [f.fecha, i]));
for (const f of conHood) { const i = idx.get(f.fecha); f.rHood = i > 0 ? f.hood / conHood[i - 1].hood - 1 : null; }
const conR = conHood.filter((f) => f.rHood != null);
const peores = [...conR].sort((a, b) => a.pl - b.pl).slice(0, Math.round(conR.length * 0.05));
const restoD = [...conR].sort((a, b) => a.pl - b.pl).slice(Math.round(conR.length * 0.05));
console.log(`  el 5% peor del cóndor (${peores.length} días): HOOD hace ${(media(peores.map((f) => f.rHood)) * 100).toFixed(2)}% ese día`);
console.log(`  el otro 95% (${restoD.length} días):            HOOD hace ${(media(restoD.map((f) => f.rHood)) * 100).toFixed(2)}% ese día`);
console.log(`  t de Welch: ${tWelch(peores.map((f) => f.rHood), restoD.map((f) => f.rHood)).toFixed(2)} (listón ${LISTON})`);
console.log(`  → si el número de arriba es negativo, la garantía vale menos justo el día en que llega la pérdida.`);
console.log(`\n  y el recorrido de HOOD dentro de la muestra: ${eur(500 * Math.min(...conHood.map((f) => f.hood)))} en lo peor de 2022 · ${eur(500 * HOOD["2026-08-19"])} hoy`);

// ═══ 9 · TRADUCIDO A LO QUE IMPORTA ═════════════════════════════════════════════════════════
H("9 · EN DÓLARES AL AÑO, SOBRE LA CUENTA DE $56.389");
const CUENTA = 56389;
for (const [et, fs, anos] of [["2022-2023", A, anosA], ["2024-2026", B, anosB], ["los 4,5 años", filas, anosT]]) {
  const b = serieNeta(fs, sinRegla, anos), r = serieNeta(fs, conRegla, anos);
  console.log(`  ${et.padEnd(14)} sin regla ${eur(b.alAnoNeto).padStart(10)}/año (${(b.alAnoNeto / CUENTA * 100).toFixed(1)}% de la cuenta) · con regla ${eur(r.alAnoNeto).padStart(10)}/año (${(r.alAnoNeto / CUENTA * 100).toFixed(1)}%) · la regla aporta ${eur(r.alAnoNeto - b.alAnoNeto)}/año`);
}
const totR = serieNeta(filas, conRegla, anosT), totB = serieNeta(filas, sinRegla, anosT);
console.log(`\n  LO QUE APORTA LA REGLA EN TODA LA MUESTRA: ${eur(totR.alAnoNeto - totB.alAnoNeto)}/año — el ${((totR.alAnoNeto - totB.alAnoNeto) / CUENTA * 100).toFixed(2)}% de la cuenta.`);
console.log(`  LO QUE PIDE PRESTADO PARA CONSEGUIRLO: una caja que baja a ${eur(totR.cajaMin)} partiendo de ${eur(EFECTIVO)}.`);
