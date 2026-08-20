// ESTRUCTURA 4 · LA HORA DE ENTRADA, MEDIDA CONTRA LA COLA (no contra la media).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/estructura4-hora.mjs
//
// ═══ QUÉ SE MIDE Y EN QUÉ SE DIFERENCIA DE LO YA HECHO ═══════════════════════════════════════
//
// La hora de entrada ya se barrió UNA VEZ, contra el P&L MEDIO, y las 11:00 salieron bien. Nadie
// la barrió contra el PEOR DÍA ni contra la PEOR RACHA. Y son dos preguntas distintas: entrar más
// tarde deja menos horas para que el índice recorra los 25 puntos que separan el strike vendido
// del dinero, pero también paga un crédito más flaco. La media puede empatar mientras la cola se
// parte por la mitad — y eso, para Lester, ES un éxito.
//
// Se barren 23 horas de entrada de 09:35 a 15:00 (la rejilla :00/:15/:30/:45 más las 09:35, que
// es la primera marca con subyacente válido; a las 09:30 el fichero trae underlying_price = 0,0 y
// ese cero NO se rellena). En cada una se reconstruye el MISMO cóndor: vender ±25 puntos del spot
// de ESA hora, comprar las alas 50 puntos más allá, cobrar BID, pagar ASK, 8 × $0,03 de comisión,
// liquidar contra el subyacente de las 16:00.
//
// Y se cruza con SALIR antes del cierre a las 15:00 / 15:30 / 15:45 cerrando a precios reales
// (recomprar lo vendido al ASK, vender lo comprado al BID: la horquilla entera otra vez).
//
// ═══ REGLAS QUE SE CUMPLEN AQUÍ ══════════════════════════════════════════════════════════════
// · NADA DE FUTURO: la entrada de la hora H sólo usa la cadena de la hora H. El desenlace es el
//   subyacente de las 16:00, que es el resultado, no un dato de decisión.
// · PRECIOS REALES: bid al vender, ask al comprar. Nunca punto medio, nunca Black-Scholes.
// · SI FALTA UN DATO, SE DICE: un día sin la marca de esa hora, o sin uno de los cuatro strikes,
//   NO se rellena — se cuenta aparte y se declara en la tabla.
// · El día que no se puede montar el cóndor (crédito ≤ 0) cuenta como día SIN OPERACIÓN: aporta
//   $0 a la serie, pero SIGUE en el calendario. Así los $/año son comparables entre horas y no
//   sale una hora "ganadora" por haberse quitado de encima los días malos.
//
// ═══ PRUEBAS DECLARADAS ══════════════════════════════════════════════════════════════════════
// 23 horas de entrada × 4 desenlaces (aguantar + 3 salidas) = 92 pruebas nuevas.
// Más 22 comparaciones pareadas de cola contra las 11:00 = 114 nuevas.
// Acumulado del proyecto sobre estos mismos 653 días: 187 previas → 301 en total.
// El listón de |t| se calcula con listonT(279) y se imprime.

import { readFileSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const DIR = "scripts/cache-theta/gex-2026";
const SEP = 25, ALA = 50, COMM = 0.03;
const BASE_H = "11:00";
const HORAS_E = ["09:35", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30",
                 "11:45", "12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "13:45",
                 "14:00", "14:15", "14:30", "14:45", "15:00"];
const HORAS_S = ["15:00", "15:30", "15:45"];
const TODAS = [...new Set([...HORAS_E, ...HORAS_S])].sort();
const PRUEBAS = 301, LISTON = listonT(PRUEBAS);

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
function drawdown(pls) { let acc = 0, pico = 0, peor = 0; for (const p of pls) { acc += p; if (acc > pico) pico = acc; const d = acc - pico; if (d < peor) peor = d; } return peor; }

/** Resumen sobre la SERIE COMPLETA de días de calendario (el día sin operación aporta $0). */
function resumen(serie, anos) {
  const op = serie.filter((x) => x !== null);
  const pl = op.map((x) => x);
  const cal = serie.map((x) => (x === null ? 0 : x));
  const total = cal.reduce((a, b) => a + b, 0);
  return {
    nDias: serie.length, nOps: pl.length, total, alAno: total / anos,
    media: pl.length ? total / pl.length : NaN,
    acierto: pl.length ? pl.filter((x) => x > 0).length / pl.length : NaN,
    peor: cal.length ? Math.min(...cal) : NaN,
    p1: pct(cal, 0.01), p5: pct(cal, 0.05),
    dd: drawdown(cal),
    // CVaR al 5%: la media del 5% de días PEORES. Mucho más estable que la peor racha (que
    // depende de un solo tramo del calendario) y que el peor día (que depende de un solo día).
    cvar5: media([...cal].sort((a, b) => a - b).slice(0, Math.max(1, Math.round(cal.length * 0.05)))),
    sd: Math.sqrt(cal.reduce((a, x) => a + (x - total / cal.length) ** 2, 0) / (cal.length - 1)),
    malos1k: cal.filter((x) => x < -1000).length,
    malos2k: cal.filter((x) => x < -2000).length,
  };
}
/** McNemar pareado: sobre los MISMOS días, ¿cuál de las dos horas rompe más veces el umbral? */
function mcnemar(a, b, umbral) {
  let soloA = 0, soloB = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] == null || b[i] == null) continue;
    const ma = a[i] < umbral, mb = b[i] < umbral;
    if (ma && !mb) soloA++; else if (mb && !ma) soloB++;
  }
  const n = soloA + soloB;
  return { soloA, soloB, z: n > 0 ? (soloA - soloB) / Math.sqrt(n) : 0 };
}
/** t pareado sobre la diferencia día a día (los mismos días, no dos muestras independientes). */
function tPareado(a, b) {
  const d = [];
  for (let i = 0; i < a.length; i++) if (a[i] != null && b[i] != null) d.push(a[i] - b[i]);
  if (d.length < 3) return { n: d.length, dif: NaN, t: NaN };
  const m = media(d), v = d.reduce((x, y) => x + (y - m) ** 2, 0) / (d.length - 1);
  return { n: d.length, dif: m, t: m / Math.sqrt(v / d.length) };
}

// ═══ LECTOR ══════════════════════════════════════════════════════════════════════════════════
// Copiado del de scripts/desde-2024.mjs y scripts/anatomia3-salir-antes.mjs: mismas columnas,
// mismo criterio de spot. Lo único nuevo es que devuelve TODAS las horas de golpe.
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid"),
        iA = cab.indexOf("ask"), iU = cab.indexOf("underlying_price");
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) throw new Error(`faltan columnas en ${f}`);
  const set = new Set(TODAS);
  const porHora = new Map(), spot = new Map();
  for (const h of TODAS) porHora.set(h, new Map());
  let hFin = "", cierre = 0;
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j]; if (L.length < 20) continue;
    const c = L.split(",");
    const h = c[iT].slice(11, 16);
    const sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }   // último subyacente del día = 16:00
    if (!set.has(h)) continue;
    const K = Number(c[iK]); if (!(K > 0)) continue;
    const bid = Number(c[iB]), ask = Number(c[iA]);
    if (!Number.isFinite(bid) || !Number.isFinite(ask)) continue;
    porHora.get(h).set(K, { bid, ask });
    if (sp > 0 && !spot.has(h)) spot.set(h, sp);
  }
  return { porHora, spot, cierre, hFin };
}
const cercaK = (mapa, objetivo) => {
  let mej = null, d = Infinity;
  for (const K of mapa.keys()) { const dd = Math.abs(K - objetivo); if (dd < d) { d = dd; mej = K; } }
  return mej;
};

// ═══ DÍAS ════════════════════════════════════════════════════════════════════════════════════
let filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"))
  .sort((a, b) => a.fecha.localeCompare(b.fecha));
// SOLO para una prueba rápida de fontanería. Sin LIMITE, corre los 653 días.
if (process.env.LIMITE) { filas = filas.slice(0, Number(process.env.LIMITE)); console.log(`### PRUEBA CORTA: ${filas.length} días ###`); }
const ANOS = filas.length / 251;
console.log("═".repeat(112));
console.log(`  ESTRUCTURA 4 · LA HORA CONTRA LA COLA · ${filas.length} días (${filas[0].fecha} → ${filas[filas.length - 1].fecha})`);
console.log(`  ${HORAS_E.length} horas de entrada × ${HORAS_S.length + 1} desenlaces = ${HORAS_E.length * (HORAS_S.length + 1)} pruebas nuevas · listón |t| ≥ ${LISTON} (Bonferroni sobre ${PRUEBAS})`);
console.log("═".repeat(112));

// series[hora][desenlace] = array alineado con `filas`, null = ese día no hubo operación
const DESENLACES = ["16:00", ...HORAS_S];
const S = {};
for (const he of HORAS_E) { S[he] = {}; for (const d of DESENLACES) S[he][d] = new Array(filas.length).fill(null); }
const creditos = {}; for (const he of HORAS_E) creditos[he] = [];
const faltas = { fichero: 0, marca: {}, strikes: {}, credito: {}, salida: {} };
for (const he of HORAS_E) { faltas.marca[he] = 0; faltas.strikes[he] = 0; faltas.credito[he] = 0; }
for (const he of HORAS_E) { faltas.salida[he] = {}; for (const d of HORAS_S) faltas.salida[he][d] = 0; }

const chk = [];
const t0 = Date.now();
for (let i = 0; i < filas.length; i++) {
  const f = filas[i];
  if (i % 50 === 0) console.log(`   ${i}/${filas.length} · ${f.fecha} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const C = leerDia(f.fecha, "C"), P = leerDia(f.fecha, "P");
  if (!C || !P) { faltas.fichero++; continue; }
  const liq = C.cierre;                                   // subyacente de las 16:00 = liquidación
  if (!(liq > 0)) { faltas.fichero++; continue; }

  for (const he of HORAS_E) {
    const sp = C.spot.get(he);
    const cm = C.porHora.get(he), pm = P.porHora.get(he);
    if (!(sp > 0) || !cm.size || !pm.size) { faltas.marca[he]++; continue; }
    const kcC = cercaK(cm, sp + SEP), kpC = cercaK(pm, sp - SEP);
    if (kcC == null || kpC == null) { faltas.strikes[he]++; continue; }
    const kcL = cercaK(cm, kcC + ALA), kpL = cercaK(pm, kpC - ALA);
    if (kcL == null || kpL == null || kcL <= kcC || kpL >= kpC) { faltas.strikes[he]++; continue; }
    // crédito: BID de lo vendido, ASK de lo comprado. Horquilla entera.
    const cred = (cm.get(kcC).bid + pm.get(kpC).bid - cm.get(kcL).ask - pm.get(kpL).ask) * 100;
    if (!(cred > 0)) { faltas.credito[he]++; continue; }
    creditos[he].push(cred);
    if (he === BASE_H) chk.push({ fecha: f.fecha, cred, guardado: f.credito });
    // aguantar al cierre
    const perdC = Math.min(Math.max(liq - kcC, 0), kcL - kcC) * 100;
    const perdP = Math.min(Math.max(kpC - liq, 0), kpC - kpL) * 100;
    S[he]["16:00"][i] = cred - perdC - perdP - 8 * COMM;
    // salir antes: recomprar al ASK lo vendido, vender al BID lo comprado
    for (const hs of HORAS_S) {
      if (hs <= he) continue;                             // no se cierra antes de abrir
      const cs = C.porHora.get(hs), ps = P.porHora.get(hs);
      if (!cs.has(kcC) || !cs.has(kcL) || !ps.has(kpC) || !ps.has(kpL)) { faltas.salida[he][hs]++; continue; }
      const coste = (cs.get(kcC).ask + ps.get(kpC).ask - cs.get(kcL).bid - ps.get(kpL).bid) * 100;
      S[he][hs][i] = cred - coste - 8 * COMM;
    }
  }
}
console.log(`   ${filas.length}/${filas.length} · ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);

// ═══ INTEGRIDAD — el cóndor de las 11:00 tiene que dar EXACTAMENTE lo ya guardado ════════════
const desv = chk.filter((x) => Math.abs(x.cred - x.guardado) > 1);
if (desv.length) throw new Error(`${desv.length} días donde el crédito reconstruido de las 11:00 NO cuadra con regimen-filas.json (p.ej. ${desv[0].fecha}: ${desv[0].cred} contra ${desv[0].guardado})`);
const desvPl = filas.map((f, i) => ({ f, d: S[BASE_H]["16:00"][i] })).filter((x) => x.d != null && Math.abs(x.d - x.f.pl) > 1);
if (desvPl.length) throw new Error(`${desvPl.length} días donde el P&L reconstruido de las 11:00 NO cuadra (p.ej. ${desvPl[0].f.fecha})`);
console.log(`  ✓ INTEGRIDAD: el cóndor de las 11:00 reconstruido cuadra con regimen-filas.json en ${chk.length} días (crédito y P&L)`);
if (faltas.fichero) console.log(`  ⚠️ ${faltas.fichero} días sin fichero o sin subyacente de cierre — NO se rellenan, quedan fuera`);

// ═══ RADIOGRAFÍA antes de medir ══════════════════════════════════════════════════════════════
const radio = filas.map((f, i) => {
  const o = { fecha: f.fecha };
  for (const he of HORAS_E) o["pl_" + he] = S[he]["16:00"][i];
  o.credito11 = creditos[BASE_H].length ? (S[BASE_H]["16:00"][i] != null ? 1 : 0) : 0;
  return o;
});
radiografia(radio, HORAS_E.map((h) => "pl_" + h), "P&L por hora de entrada", { maxCeros: 0.05, maxNulos: 0.6 });

// ═══ TABLA 1 — LA HORA DE ENTRADA, AGUANTANDO AL CIERRE ══════════════════════════════════════
const BASE = resumen(S[BASE_H]["16:00"], ANOS);
console.log("═".repeat(112));
console.log("  TABLA 1 · HORA DE ENTRADA (se aguanta hasta las 16:00). Todo sobre los mismos 653 días de calendario.");
console.log("═".repeat(112));
console.log("| entrada | días op. | crédito mediano | $/año | % ingreso | media/op | acierto | PEOR DÍA | p1 | p5 | PEOR RACHA | días < −$1.000 |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
const R1 = {};
for (const he of HORAS_E) {
  const r = resumen(S[he]["16:00"], ANOS);
  r.credMed = creditos[he].length ? pct(creditos[he], 0.5) : NaN;
  R1[he] = r;
  const marca = he === BASE_H ? "**" : "";
  console.log(`| ${marca}${he}${marca} | ${r.nOps} | ${eur(r.credMed)} | ${eur(r.alAno)} | ${((r.total / BASE.total) * 100).toFixed(0)}% | ${eur(r.media)} | ${(r.acierto * 100).toFixed(0)}% | ${eur(r.peor)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.dd)} | ${r.malos1k} |`);
}

// ═══ TABLA 2 — LA MÉTRICA QUE DECIDE ═════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(112));
console.log("  TABLA 2 · LO QUE CUESTA Y LO QUE COMPRA — contra las 11:00. Positivo en 'ingreso perdido' = se paga.");
console.log("═".repeat(112));
console.log("| entrada | ingreso perdido $/año | peor día eliminado | racha eliminada | $ perdidos por $ de racha | t de la diferencia de media |");
console.log("|---|---|---|---|---|---|");
const T2 = {};
for (const he of HORAS_E) {
  const r = R1[he];
  const cuesta = BASE.alAno - r.alAno;
  const quitaPeor = r.peor - BASE.peor;                 // > 0 = el peor día es menos malo
  const quitaDd = r.dd - BASE.dd;                       // > 0 = la racha es menos profunda
  const ratio = quitaDd > 0 ? cuesta / quitaDd : null;
  const a = filas.map((_, i) => S[he]["16:00"][i]).filter((x) => x != null);
  const b = filas.map((_, i) => S[BASE_H]["16:00"][i]).filter((x) => x != null);
  const t = tWelch(a, b);
  T2[he] = { cuesta, quitaPeor, quitaDd, ratio, t };
  console.log(`| ${he} | ${eur(cuesta)} | ${eur(quitaPeor)} | ${eur(quitaDd)} | ${ratio == null ? "no quita racha" : ratio.toFixed(2)} | ${t.toFixed(2)} |`);
}

// ═══ TABLA 3 — SALIR ANTES, CRUZADO CON LA HORA DE ENTRADA ═══════════════════════════════════
console.log("\n" + "═".repeat(112));
console.log("  TABLA 3 · SALIR ANTES DEL CIERRE (hora fija, precios reales, horquilla entera otra vez)");
console.log("═".repeat(112));
console.log("| entrada | aguantar $/año | aguantar peor día | 15:00 $/año | 15:00 peor | 15:30 $/año | 15:30 peor | 15:45 $/año | 15:45 peor |");
console.log("|---|---|---|---|---|---|---|---|---|");
const R3 = {};
for (const he of HORAS_E) {
  R3[he] = {};
  const cel = [];
  for (const hs of HORAS_S) {
    if (hs <= he) { R3[he][hs] = null; cel.push("—", "—"); continue; }
    const r = resumen(S[he][hs], ANOS);
    R3[he][hs] = r;
    cel.push(eur(r.alAno), eur(r.peor));
  }
  console.log(`| ${he} | ${eur(R1[he].alAno)} | ${eur(R1[he].peor)} | ${cel.join(" | ")} |`);
}

// ═══ TABLA 4 — ESTABILIDAD POR TERCIOS del período (la criba que mató hallazgos antes) ═══════
console.log("\n" + "═".repeat(112));
console.log("  TABLA 4 · TERCIOS DEL PERÍODO — ¿la hora buena lo es en los TRES tercios, o vive en uno?");
console.log("═".repeat(112));
const k = Math.floor(filas.length / 3);
const cortes = [[0, k], [k, 2 * k], [2 * k, filas.length]];
const etiq = cortes.map(([a, b]) => `${filas[a].fecha}→${filas[b - 1].fecha}`);
console.log(`| entrada | ${etiq.map((e) => e + " $/año").join(" | ")} | ${etiq.map((_, i) => "peor T" + (i + 1)).join(" | ")} |`);
console.log("|---|" + "---|".repeat(6));
const T4 = {};
for (const he of HORAS_E) {
  const trozos = cortes.map(([a, b]) => resumen(S[he]["16:00"].slice(a, b), (b - a) / 251));
  T4[he] = trozos;
  console.log(`| ${he} | ${trozos.map((t) => eur(t.alAno)).join(" | ")} | ${trozos.map((t) => eur(t.peor)).join(" | ")} |`);
}

// ═══ HUECOS DECLARADOS ═══════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(112));
console.log("  HUECOS — días que NO entraron en cada hora, y por qué. Nada de esto se rellenó.");
console.log("═".repeat(112));
console.log("| entrada | sin marca de esa hora | sin los 4 strikes | crédito ≤ 0 (no se monta) | total sin operación |");
console.log("|---|---|---|---|---|");
for (const he of HORAS_E) {
  const tot = faltas.marca[he] + faltas.strikes[he] + faltas.credito[he] + faltas.fichero;
  console.log(`| ${he} | ${faltas.marca[he]} | ${faltas.strikes[he]} | ${faltas.credito[he]} | ${tot} |`);
}

// ═══ TABLA 5 — A IGUAL RIESGO. La pregunta que de verdad decide. ═════════════════════════════
//
// Comparar $/año entre horas es tramposo si cada hora corre un riesgo distinto. El cóndor se
// escala con el número de contratos, así que la comparación limpia es: **escalar cada hora hasta
// que su cola iguale la de las 11:00 y ver quién ingresa más entonces**.
// Se escala por CVaR al 5% (media del 5% de días peores) porque la peor racha depende de un solo
// tramo del calendario y el peor día de un solo día — los dos son demasiado inestables para
// dividir por ellos.
console.log("\n" + "═".repeat(112));
console.log("  TABLA 5 · A IGUAL COLA — cada hora escalada en contratos hasta igualar el CVaR 5% de las 11:00");
console.log("═".repeat(112));
console.log("| entrada | CVaR 5% | contratos para igualar la cola de las 11:00 | $/año a igual cola | contra 11:00 | peor racha escalada |");
console.log("|---|---|---|---|---|---|");
const T5 = {};
for (const he of HORAS_E) {
  const r = R1[he];
  const s = r.cvar5 < 0 ? BASE.cvar5 / r.cvar5 : NaN;      // factor de escala en contratos
  const igual = r.alAno * s;
  T5[he] = { cvar5: r.cvar5, escala: s, alAnoIgual: igual, ddEscalado: r.dd * s };
  console.log(`| ${he} | ${eur(r.cvar5)} | ${s.toFixed(2)}× | ${eur(igual)} | ${eur(igual - BASE.alAno)} | ${eur(r.dd * s)} |`);
}

// ═══ TABLA 6 — LA COLA, PAREADA. Mismos días, prueba de McNemar. ═════════════════════════════
console.log("\n" + "═".repeat(112));
console.log(`  TABLA 6 · LA COLA DÍA A DÍA CONTRA LAS 11:00 (McNemar pareado, |z| listón ${LISTON})`);
console.log("═".repeat(112));
console.log("| entrada | días < −$1.000 | sólo 11:00 rompe | sólo esta hora rompe | z | días < −$2.000 | z | dif. media pareada | t pareado |");
console.log("|---|---|---|---|---|---|---|---|---|");
const T6 = {};
for (const he of HORAS_E) {
  const a = S[he]["16:00"], b = S[BASE_H]["16:00"];
  const m1 = mcnemar(b, a, -1000), m2 = mcnemar(b, a, -2000), tp = tPareado(a, b);
  T6[he] = { m1, m2, tp };
  console.log(`| ${he} | ${R1[he].malos1k} | ${m1.soloA} | ${m1.soloB} | ${m1.z.toFixed(2)} | ${R1[he].malos2k} | ${m2.z.toFixed(2)} | ${eur(tp.dif)} | ${tp.t.toFixed(2)} |`);
}

writeFileSync("scripts/estructura4-hora.json", JSON.stringify({
  meta: { dias: filas.length, anos: ANOS, pruebas: PRUEBAS, liston: LISTON, sep: SEP, ala: ALA, comm: COMM },
  base: BASE, entradas: R1, contraBase: T2, salidas: R3, tercios: T4, etiquetasTercios: etiq,
  igualCola: T5, cola: T6, faltas,
  fechas: filas.map((f) => f.fecha),
  series: Object.fromEntries(HORAS_E.map((h) => [h, S[h]["16:00"]])),
}, null, 2), "utf8");
console.log("\n  detalle en scripts/estructura4-hora.json");
