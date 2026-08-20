// ESTRUCTURA 4 · EL PUENTE — la HORA y el ANCHO DE ALA, medidos JUNTOS.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/estructura4-combinado.mjs
//
// ═══ POR QUÉ ESTA MEDICIÓN Y NO OTRA ═════════════════════════════════════════════════════════
//
// El barrido de la hora (scripts/estructura4-hora.mjs) deja dos cosas probadas y una sin resolver:
//
//   PROBADO  · entrar más tarde recorta la FRECUENCIA de días malos, y muchísimo: la tasa de
//              rotura (el cierre más allá del strike vendido) cae del 34,2% a las 11:00 al 15,0%
//              a las 13:45. Pareado, sobre los mismos días, z = 5,14 contra un listón de 3,77.
//   PROBADO  · el reloj NO puede tocar el PEOR DÍA. La pérdida máxima de un cóndor es
//              ancho de ala − crédito. Entrar tarde cobra menos crédito, así que el techo de
//              pérdida SUBE: $4.500 a las 11:00, $4.845 a las 13:45.
//   SIN MEDIR· estrechar el ala sí baja el techo (otro agente: ala de 20 → peor día −$1.835).
//              Pero eso está medido SÓLO a las 11:00. Las dos palancas actúan sobre cosas
//              distintas —una sobre cuántas veces pierdes, otra sobre cuánto pierdes cuando
//              pierdes— y por eso NO se pueden sumar sobre el papel. Hay que medirlas juntas.
//
// Y hay una segunda razón, que es la de la cuenta de Lester: el cuello de botella es el EFECTIVO
// ($7.977 libres). Un cóndor de ala 50 inmoviliza ~$4.500; uno de ala 20 a las 13:45 inmoviliza
// ~$1.950. Con el mismo dinero caben más de dos. Comparar "$/año por contrato" entre anchos
// distintos es comparar cosas que no cuestan lo mismo — por eso la tabla que decide es la de
// IGUAL COLATERAL.
//
// ═══ REGLAS ══════════════════════════════════════════════════════════════════════════════════
// · Precios reales: BID al vender, ASK al comprar, las cuatro patas. 8 × $0,03 de comisión.
// · Nada de futuro: la entrada de la hora H usa sólo la cadena de H. Liquidación al cierre.
// · Día sin cadena, sin los 4 strikes o con crédito ≤ 0: NO se rellena, cuenta como día sin
//   operación ($0 en la serie) y se declara en la tabla de huecos.
//
// ═══ PRUEBAS DECLARADAS ══════════════════════════════════════════════════════════════════════
// 7 horas × 5 anchos de ala = 35 combinaciones nuevas.
// Acumulado del proyecto sobre estos 653 días: 301 previas → 336. El listón se imprime.

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const DIR = "scripts/cache-theta/gex-2026";
const SEP = 25, COMM = 0.03;
const HORAS = ["11:00", "12:45", "13:00", "13:30", "13:45", "14:00", "14:30"];
const ALAS = [10, 20, 30, 40, 50];
const BASE_CFG = "11:00/50";
const PRUEBAS = 336, LISTON = listonT(PRUEBAS);

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
function drawdown(pls) { let acc = 0, pico = 0, peor = 0; for (const p of pls) { acc += p; if (acc > pico) pico = acc; const d = acc - pico; if (d < peor) peor = d; } return peor; }

function resumen(serie, cols, anos) {
  const cal = serie.map((x) => (x === null ? 0 : x));
  const pl = serie.filter((x) => x !== null);
  const total = cal.reduce((a, b) => a + b, 0);
  const ord = [...cal].sort((a, b) => a - b);
  return {
    nOps: pl.length, total, alAno: total / anos,
    media: pl.length ? total / pl.length : NaN,
    acierto: pl.length ? pl.filter((x) => x > 0).length / pl.length : NaN,
    peor: Math.min(...cal), p1: pct(cal, 0.01), p5: pct(cal, 0.05), dd: drawdown(cal),
    cvar5: media(ord.slice(0, Math.max(1, Math.round(cal.length * 0.05)))),
    malos1k: cal.filter((x) => x < -1000).length,
    colMediano: cols.length ? pct(cols, 0.5) : NaN,
    colMax: cols.length ? Math.max(...cols) : NaN,
  };
}

function leerDia(fecha, right, horas) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid"),
        iA = cab.indexOf("ask"), iU = cab.indexOf("underlying_price");
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) throw new Error(`faltan columnas en ${f}`);
  const set = new Set(horas);
  const porHora = new Map(), spot = new Map();
  for (const h of horas) porHora.set(h, new Map());
  let hFin = "", cierre = 0;
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j]; if (L.length < 20) continue;
    const c = L.split(",");
    const h = c[iT].slice(11, 16);
    const sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (!set.has(h)) continue;
    const K = Number(c[iK]); if (!(K > 0)) continue;
    const bid = Number(c[iB]), ask = Number(c[iA]);
    if (!Number.isFinite(bid) || !Number.isFinite(ask)) continue;
    porHora.get(h).set(K, { bid, ask });
    if (sp > 0 && !spot.has(h)) spot.set(h, sp);
  }
  return { porHora, spot, cierre };
}
const cercaK = (mapa, o) => { let mej = null, d = Infinity; for (const K of mapa.keys()) { const dd = Math.abs(K - o); if (dd < d) { d = dd; mej = K; } } return mej; };

const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const ANOS = filas.length / 251;
console.log("═".repeat(112));
console.log(`  ESTRUCTURA 4 · EL PUENTE — HORA × ANCHO DE ALA · ${filas.length} días · ${HORAS.length}×${ALAS.length}=${HORAS.length * ALAS.length} combinaciones`);
console.log(`  listón |t| ≥ ${LISTON} (Bonferroni sobre ${PRUEBAS} pruebas acumuladas)`);
console.log("═".repeat(112));

const S = {}, COL = {}, faltas = {};
for (const h of HORAS) for (const a of ALAS) { const k = `${h}/${a}`; S[k] = new Array(filas.length).fill(null); COL[k] = []; faltas[k] = { marca: 0, strikes: 0, credito: 0 }; }
let sinFichero = 0;
const t0 = Date.now();
for (let i = 0; i < filas.length; i++) {
  const f = filas[i];
  if (i % 100 === 0) console.log(`   ${i}/${filas.length} · ${f.fecha} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const C = leerDia(f.fecha, "C", HORAS), P = leerDia(f.fecha, "P", HORAS);
  if (!C || !P || !(C.cierre > 0)) { sinFichero++; continue; }
  const liq = C.cierre;
  for (const h of HORAS) {
    const sp = C.spot.get(h), cm = C.porHora.get(h), pm = P.porHora.get(h);
    if (!(sp > 0) || !cm.size || !pm.size) { for (const a of ALAS) faltas[`${h}/${a}`].marca++; continue; }
    const kcC = cercaK(cm, sp + SEP), kpC = cercaK(pm, sp - SEP);
    for (const a of ALAS) {
      const k = `${h}/${a}`;
      const kcL = cercaK(cm, kcC + a), kpL = cercaK(pm, kpC - a);
      if (kcL == null || kpL == null || kcL <= kcC || kpL >= kpC) { faltas[k].strikes++; continue; }
      const cred = (cm.get(kcC).bid + pm.get(kpC).bid - cm.get(kcL).ask - pm.get(kpL).ask) * 100;
      if (!(cred > 0)) { faltas[k].credito++; continue; }
      const anchoC = (kcL - kcC) * 100, anchoP = (kpC - kpL) * 100;
      const perdC = Math.min(Math.max(liq - kcC, 0) * 100, anchoC);
      const perdP = Math.min(Math.max(kpC - liq, 0) * 100, anchoP);
      S[k][i] = cred - perdC - perdP - 8 * COMM;
      COL[k].push(Math.max(anchoC, anchoP) - cred);       // colateral que retiene Robinhood
    }
  }
}
console.log(`   ${filas.length}/${filas.length} · ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
if (sinFichero) console.log(`  ⚠️ ${sinFichero} días sin fichero o sin cierre — NO se rellenan, quedan fuera\n`);

// integridad: 11:00 / ala 50 tiene que ser el cóndor ya guardado
const mal = filas.filter((f, i) => S[BASE_CFG][i] != null && Math.abs(S[BASE_CFG][i] - f.pl) > 1);
if (mal.length) throw new Error(`${mal.length} días donde 11:00/ala 50 NO cuadra con regimen-filas.json (p.ej. ${mal[0].fecha})`);
console.log(`  ✓ INTEGRIDAD: ${BASE_CFG} reproduce exactamente el P&L de regimen-filas.json`);

const radio = filas.map((f, i) => { const o = { fecha: f.fecha }; for (const h of HORAS) for (const a of ALAS) o[`x${h.replace(":", "")}_${a}`] = S[`${h}/${a}`][i]; return o; });
radiografia(radio, Object.keys(radio[0]).filter((k) => k !== "fecha"), "P&L hora × ala", { maxCeros: 0.05, maxNulos: 0.6 });

const R = {};
for (const h of HORAS) for (const a of ALAS) R[`${h}/${a}`] = resumen(S[`${h}/${a}`], COL[`${h}/${a}`], ANOS);
const B = R[BASE_CFG];

// ═══ TABLA A — UN CONTRATO ═══════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(112));
console.log("  TABLA A · UN CONTRATO. La palanca del reloj (filas) contra la del ancho de ala (columnas).");
console.log("═".repeat(112));
for (const campo of [["alAno", "$/año"], ["peor", "PEOR DÍA"], ["dd", "PEOR RACHA"], ["p5", "p5"], ["colMediano", "colateral mediano"]]) {
  console.log(`\n  ── ${campo[1]} ──`);
  console.log(`| entrada | ${ALAS.map((a) => "ala " + a).join(" | ")} |`);
  console.log("|---|" + "---|".repeat(ALAS.length));
  for (const h of HORAS) console.log(`| ${h}${h === "11:00" ? " (hoy)" : ""} | ${ALAS.map((a) => eur(R[`${h}/${a}`][campo[0]])).join(" | ")} |`);
}

// ═══ TABLA B — A IGUAL COLATERAL, que es como se compara en una cuenta de verdad ═════════════
console.log("\n" + "═".repeat(112));
console.log(`  TABLA B · A IGUAL COLATERAL — cada configuración escalada hasta inmovilizar los mismos ${eur(B.colMediano)}`);
console.log("  que el cóndor de hoy (11:00, ala 50). Es la comparación honesta: un ala estrecha cuesta menos dinero,");
console.log("  así que caben más contratos con el mismo efectivo.");
console.log("═".repeat(112));
console.log(`| entrada | ancho | contratos | $/año | % del ingreso de hoy | PEOR DÍA | PEOR RACHA | p5 | días < −$1.000 |`);
console.log("|---|---|---|---|---|---|---|---|---|");
const T = [];
for (const h of HORAS) for (const a of ALAS) {
  const k = `${h}/${a}`, r = R[k];
  const n = B.colMediano / r.colMediano;
  const fila = { cfg: k, hora: h, ala: a, n, alAno: r.alAno * n, peor: r.peor * n, dd: r.dd * n, p5: r.p5 * n, cvar5: r.cvar5 * n, malos1k: r.malos1k, colMediano: r.colMediano, nOps: r.nOps };
  T.push(fila);
  console.log(`| ${h} | ${a} | ${n.toFixed(2)}× | ${eur(fila.alAno)} | ${((fila.alAno / B.alAno) * 100).toFixed(0)}% | ${eur(fila.peor)} | ${eur(fila.dd)} | ${eur(fila.p5)} | ${r.malos1k} |`);
}

// ═══ TABLA C — LO QUE PIDIÓ LESTER ═══════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(112));
console.log("  TABLA C · $/AÑO RETENIDOS POR CADA DÓLAR DE CAÍDA ELIMINADO (a igual colateral)");
console.log("  Ordenado por lo que de verdad decide: quien más ingreso conserva por cada dólar de peor día que quita.");
console.log("═".repeat(112));
console.log("| configuración | $/año | ingreso perdido | peor día | peor día eliminado | $ perdidos por $ de peor día | racha eliminada |");
console.log("|---|---|---|---|---|---|---|");
const ranking = T.filter((x) => x.peor > B.peor).sort((a, b) => (B.alAno - a.alAno) / (a.peor - B.peor) - (B.alAno - b.alAno) / (b.peor - B.peor));
for (const x of ranking) {
  const cuesta = B.alAno - x.alAno, quita = x.peor - B.peor;
  console.log(`| ${x.cfg} (${x.n.toFixed(2)}×) | ${eur(x.alAno)} | ${eur(cuesta)} | ${eur(x.peor)} | ${eur(quita)} | ${(cuesta / quita).toFixed(2)} | ${eur(x.dd - B.dd)} |`);
}
console.log(`\n  línea base (${BASE_CFG}, 1,00×): ${eur(B.alAno)}/año · peor día ${eur(B.peor)} · peor racha ${eur(B.dd)} · p5 ${eur(B.p5)} · ${B.malos1k} días < −$1.000`);
console.log("  ⚠️ Las que NO aparecen en esta tabla es porque su peor día NO mejora al de hoy. No se ocultan: no cortan cola.");

// ═══ HUECOS ══════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(112));
console.log("  HUECOS — días sin operación por configuración. Nada rellenado.");
console.log("═".repeat(112));
console.log("| configuración | sin marca | sin los 4 strikes | crédito ≤ 0 | días operados |");
console.log("|---|---|---|---|---|");
for (const h of HORAS) for (const a of ALAS) {
  const k = `${h}/${a}`, x = faltas[k];
  console.log(`| ${k} | ${x.marca} | ${x.strikes} | ${x.credito} | ${R[k].nOps} |`);
}

writeFileSync("scripts/estructura4-combinado.json", JSON.stringify({
  meta: { dias: filas.length, anos: ANOS, pruebas: PRUEBAS, liston: LISTON, sep: SEP, comm: COMM, base: BASE_CFG },
  unContrato: R, igualColateral: T, faltas,
  fechas: filas.map((f) => f.fecha), series: S,
}, null, 2), "utf8");
console.log("\n  detalle en scripts/estructura4-combinado.json");
