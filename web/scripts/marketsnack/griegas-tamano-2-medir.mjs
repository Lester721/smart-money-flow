// ══════════════════════════════════════════════════════════════════════════════════════════
// GRIEGAS-TAMAÑO · PASO 2 — ¿SEPARAN EL TAMAÑO DEL MOVIMIENTO?
// ══════════════════════════════════════════════════════════════════════════════════════════
//
// Se ordenan los tickers ENTRE SÍ dentro de cada día y se compara el tercio alto contra el bajo.
// Así el movimiento del mercado se cancela solo y un día de pánico no puede fabricar el hallazgo.
//
// DOS COSAS SE MIDEN POR SEPARADO Y NO SE MEZCLAN:
//   (a) TAMAÑO  — |retorno|, que es lo que paga una opción comprada. Dos versiones:
//         · mov : (|ret_h|/raíz(h)) / rv20 previa, en exceso sobre la media del día.
//                 Normalizado por la volatilidad que ESE ticker ya traía: sin eso sería una
//                 tautología (los volátiles se mueven más, y eso se sabe sin mirar el flujo).
//         · abs : |ret_h| en puntos, en exceso sobre la media del día. Sin normalizar.
//   (b) SIGNO   — el retorno firmado. Ya se midió y falló (GEX con lado real t=−0,94). Se
//                 reporta como CONTROL, no como prueba nueva.
//
// EL SIGNO ESPERADO SE DECLARA ANTES DE MIRAR. Un resultado con el signo al revés no es el
// mecanismo, aunque la t sea grande:
//   gamma$ del dealer BAJO (corto de gamma) -> se cubre EN LA DIRECCIÓN -> AMPLIFICA  -> sep < 0
//   vega$  del dealer BAJO (corto de vega)  -> alguien le COMPRA volatilidad           -> sep < 0
//   ivRel  ALTO (pagan por encima de lo que se vende) -> esperan un salto              -> sep > 0
//
// ══ LA n EFECTIVA, QUE ES LA RESTRICCIÓN QUE MANDA ═════════════════════════════════════════
// El panel tiene ~8.000 filas, pero NO son 8.000 apuestas independientes:
//   · dentro de un día, los tickers comparten mercado. El exceso sobre la media del día quita
//     el factor común, así que el día sí es una unidad razonable.
//   · entre días, un retorno a h días SE SOLAPA con el de los h−1 días siguientes.
// Por eso, además del t por filas (comparable con lo ya publicado, y OPTIMISTA), se calcula el
// t POR DÍAS NO SOLAPADOS: un número por día (alto − bajo) y sólo un día de cada h. Ése es el
// que manda, y es el que dice si 86 días pueden establecer algo.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/griegas-tamano-2-medir.mjs

import fs from "node:fs";
import { pasarBarrera, informe, listonT, potencia, tWelch } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const ENTRADA = "scripts/marketsnack/griegas-tamano-panel.json";
const SALIDA = "scripts/marketsnack/griegas-tamano-2-salida.json";
const RUPTURA = "2026-07-16";
const HORIZONTES = [1, 5, 20];
const MIN_SIMBOLOS_DIA = 15;
const PRUEBAS = 36;                 // 6 métricas × 3 horizontes × 2 objetivos de TAMAÑO
const LISTON = listonT(PRUEBAS);

const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const desv = (a) => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tUna = (a) => (a.length < 3 ? NaN : media(a) / (desv(a) / Math.sqrt(a.length)));
const fmt = (x, d = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);

const J = JSON.parse(fs.readFileSync(ENTRADA, "utf8"));
const panel = J.panel;

console.log("═".repeat(100));
console.log("GRIEGAS-TAMAÑO · PASO 2 — ¿la gamma, la vega o la IV pagada separan el TAMAÑO del movimiento?");
console.log("═".repeat(100));
console.log(`panel: ${panel.length} filas símbolo-día · listón de |t| con ${PRUEBAS} pruebas declaradas: ${LISTON}`);

const METRICAS = [
  { id: "iGamma", nom: "gamma$ · intensidad (neto/bruto del día)", esperado: -1 },
  { id: "zGamma", nom: "gamma$ · z contra sus 20 días anteriores", esperado: -1 },
  { id: "iVega", nom: "vega$  · intensidad (neto/bruto del día)", esperado: -1 },
  { id: "zVega", nom: "vega$  · z contra sus 20 días anteriores", esperado: -1 },
  { id: "ivRel", nom: "IV pagada − IV vendida (puntos de vol)", esperado: +1 },
  { id: "zIvRel", nom: "IV pagada−vendida · z de sus 20 días", esperado: +1 },
];
const OBJETIVOS = [
  { pre: "mx", nom: "TAMAÑO · movimiento normalizado por su propia rv20", cuenta: true },
  { pre: "ax", nom: "TAMAÑO · |retorno| en puntos", cuenta: true },
  { pre: "x", nom: "SIGNO · retorno firmado (CONTROL, ya medido y muerto)", cuenta: false },
];

// ── EXCESO SOBRE LA MEDIA DEL DÍA + RANGO PERCENTIL TRANSVERSAL ───────────────────────────
const porDia = new Map();
for (const a of panel) { if (!porDia.has(a.dia)) porDia.set(a.dia, []); porDia.get(a.dia).push(a); }
let diasUsables = 0;
for (const [, arr] of porDia) {
  if (arr.length < MIN_SIMBOLOS_DIA) continue;
  diasUsables++;
  for (const h of HORIZONTES) {
    const con = arr.filter((a) => a[`r${h}`] != null);
    if (con.length >= MIN_SIMBOLOS_DIA) {
      const mu = media(con.map((a) => a[`r${h}`]));
      const muA = media(con.map((a) => Math.abs(a[`r${h}`])));
      for (const a of con) { a[`x${h}`] = a[`r${h}`] - mu; a[`ax${h}`] = Math.abs(a[`r${h}`]) - muA; }
    }
    const conM = arr.filter((a) => a[`m${h}`] != null);
    if (conM.length >= MIN_SIMBOLOS_DIA) {
      const muM = media(conM.map((a) => a[`m${h}`]));
      for (const a of conM) a[`mx${h}`] = a[`m${h}`] - muM;
    }
  }
  for (const M of METRICAS) {
    const con = arr.filter((a) => a[M.id] != null && Number.isFinite(a[M.id]));
    if (con.length < MIN_SIMBOLOS_DIA) continue;
    con.sort((x, y) => x[M.id] - y[M.id]);
    con.forEach((a, i) => { a[`p_${M.id}`] = con.length > 1 ? i / (con.length - 1) : 0.5; });
  }
}
const tam = [...porDia.values()].filter((a) => a.length >= MIN_SIMBOLOS_DIA).map((a) => a.length).sort((a, b) => a - b);
console.log(`días con ≥${MIN_SIMBOLOS_DIA} símbolos: ${diasUsables} de ${porDia.size} · símbolos/día mín ${tam[0]} · mediana ${tam[Math.floor(tam.length / 2)]} · máx ${tam.at(-1)}`);

const listaDias = [...porDia.keys()].filter((d) => porDia.get(d).length >= MIN_SIMBOLOS_DIA).sort();

// ── RADIOGRAFÍA de los objetivos antes de medir ───────────────────────────────────────────
const conObj = panel.filter((a) => a.mx1 != null && a.ax1 != null && a.x1 != null);
radiografia(conObj, ["mx1", "ax1", "x1", "m1", "r1"], "objetivos transversales");

// ══════════════════════════════════════════════════════════════════════════════════════════
// EL TEST POR DÍAS NO SOLAPADOS — el que manda
// ══════════════════════════════════════════════════════════════════════════════════════════
/**
 * Un número por día: media del tercio ALTO menos media del tercio BAJO de ese día.
 * Para h>1 se toma sólo un día de cada h (offset elegido para maximizar la muestra, no el
 * resultado: se prueban los h offsets y se promedian sus t, no se elige el mejor).
 */
function porDiaNoSolapado(metricaId, objetivo, h, filtro = null) {
  const diarios = [];
  for (const d of listaDias) {
    if (filtro && !filtro(d)) continue;
    const arr = porDia.get(d).filter((a) => a[`p_${metricaId}`] != null && a[`${objetivo}${h}`] != null);
    if (arr.length < MIN_SIMBOLOS_DIA) continue;
    const ord = [...arr].sort((x, y) => y[`p_${metricaId}`] - x[`p_${metricaId}`]);
    const k = Math.floor(ord.length / 3);
    if (k < 3) continue;
    const alto = media(ord.slice(0, k).map((a) => a[`${objetivo}${h}`]));
    const bajo = media(ord.slice(-k).map((a) => a[`${objetivo}${h}`]));
    diarios.push({ dia: d, dif: alto - bajo });
  }
  if (diarios.length < 5) return { nDias: diarios.length, t: NaN, sep: NaN, nEf: 0, tSolapado: NaN };
  const tSolapado = tUna(diarios.map((x) => x.dif));      // todos los días, solapados: OPTIMISTA
  // no solapados: un día de cada h, promediando los h desfases posibles
  const ts = [];
  for (let off = 0; off < h; off++) {
    const sub = diarios.filter((_, i) => i % h === off).map((x) => x.dif);
    if (sub.length >= 5) ts.push(tUna(sub));
  }
  const nEf = Math.floor(diarios.length / h);
  return { nDias: diarios.length, sep: media(diarios.map((x) => x.dif)), t: ts.length ? media(ts) : NaN, nEf, tSolapado, tsOffsets: ts };
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// LAS PRUEBAS
// ══════════════════════════════════════════════════════════════════════════════════════════
const resultados = [];
for (const O of OBJETIVOS) {
  console.log("\n" + "═".repeat(100));
  console.log(`OBJETIVO: ${O.nom}`);
  console.log("═".repeat(100));
  console.log("métrica                                  h      n    sep    t(filas)  t(días)  n_ef  signo  PASA");
  console.log("─".repeat(100));
  for (const M of METRICAS) {
    for (const h of HORIZONTES) {
      const filas = panel
        .filter((a) => a[`p_${M.id}`] != null && a[`${O.pre}${h}`] != null)
        .map((a) => ({ pnl: a[`${O.pre}${h}`], ticker: a.raiz, fecha: a.dia, rango: a[`p_${M.id}`] }));
      if (filas.length < 200) { console.log(`  ${M.nom.padEnd(40)} ${String(h).padStart(2)}  muestra insuficiente (${filas.length})`); continue; }
      const v = pasarBarrera(filas, (f) => f.rango, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
      const dd = porDiaNoSolapado(M.id, O.pre, h);
      const sep = v.detalle.sep, t = v.detalle.t;
      const signoOk = Math.sign(sep) === M.esperado;
      const pasa = v.pasa && signoOk && Math.abs(dd.t) >= LISTON;
      console.log(`  ${M.nom.padEnd(40)} ${String(h).padStart(2)} ${String(filas.length).padStart(6)} ${fmt(sep, 3).padStart(7)} ${fmt(t).padStart(8)}  ${fmt(dd.t).padStart(7)} ${String(dd.nEf).padStart(5)}   ${signoOk ? "ok " : "AL REVÉS"}  ${pasa ? "SÍ" : "no"}`);
      resultados.push({
        metrica: M.id, nom: M.nom, objetivo: O.pre, h, cuenta: O.cuenta, n: filas.length,
        sep, t, tDias: dd.t, tDiasSolapado: dd.tSolapado, nDias: dd.nDias, nEfDias: dd.nEf,
        esperado: M.esperado, signoOk, pasaBarrera: v.pasa, pasa, motivos: v.motivos,
        tercios: v.detalle.tercios.map((x) => ({ periodo: x.periodo, n: x.n, sep: x.sep, t: x.t })),
        tickerMayor: v.detalle.tickerMayor,
      });
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// LOS DOS TRAMOS DE LA RUPTURA DEL 2026-07-16
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log(`LOS DOS TRAMOS · ruptura de la tubería de MarketSnack el ${RUPTURA}`);
console.log("═".repeat(100));
console.log("  asset_price nulo en 54-68% ANTES y 0,0% DESPUÉS; score=0 pasa de 64-77% a 11-21%.");
console.log("  Este panel NO usa asset_price (escala = cierre de D−1) ni score, pero el corte se hace igual.");
console.log("\nmétrica                                  h    ANTES: n / sep / t        DESPUÉS: n / sep / t     mismo signo");
console.log("─".repeat(100));
const tramos = [];
for (const M of METRICAS) {
  for (const h of HORIZONTES) {
    const g = {};
    for (const [nom, f] of [["antes", (d) => d < RUPTURA], ["despues", (d) => d >= RUPTURA]]) {
      const filas = panel
        .filter((a) => f(a.dia) && a[`p_${M.id}`] != null && a[`mx${h}`] != null)
        .map((a) => ({ pnl: a[`mx${h}`], ticker: a.raiz, fecha: a.dia, rango: a[`p_${M.id}`] }));
      if (filas.length < 100) { g[nom] = null; continue; }
      const ord = [...filas].sort((x, y) => y.rango - x.rango);
      const k = Math.floor(ord.length / 3);
      const alto = ord.slice(0, k).map((x) => x.pnl), bajo = ord.slice(-k).map((x) => x.pnl);
      g[nom] = { n: filas.length, sep: media(alto) - media(bajo), t: tWelch(alto, bajo) };
    }
    if (!g.antes || !g.despues) continue;
    const mismo = Math.sign(g.antes.sep) === Math.sign(g.despues.sep);
    tramos.push({ metrica: M.id, h, ...g, mismoSigno: mismo });
    console.log(`  ${M.nom.padEnd(40)} ${String(h).padStart(2)}   ${String(g.antes.n).padStart(5)} ${fmt(g.antes.sep, 3).padStart(7)} ${fmt(g.antes.t).padStart(6)}      ` +
      `${String(g.despues.n).padStart(5)} ${fmt(g.despues.sep, 3).padStart(7)} ${fmt(g.despues.t).padStart(6)}       ${mismo ? "sí" : "NO"}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// LA n EFECTIVA
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log("LA n EFECTIVA — cuántas apuestas INDEPENDIENTES hay de verdad");
console.log("═".repeat(100));
console.log(`  filas del panel                                  : ${panel.length.toLocaleString()}`);
console.log(`  días de mercado usables (≥${MIN_SIMBOLOS_DIA} símbolos)          : ${diasUsables}`);
console.log(`  → dentro de un día, el exceso sobre la media del día quita el factor común de mercado,`);
console.log(`    así que el DÍA es la unidad. Entre días, un retorno a h días se solapa con h−1 más.`);
for (const h of HORIZONTES) {
  console.log(`  horizonte ${String(h).padStart(2)}d → ${Math.floor(diasUsables / h)} días NO solapados` +
    `  (una separación de ${(2.8 / Math.sqrt(Math.floor(diasUsables / h) / 2)).toFixed(2)} desviaciones diarias es lo mínimo detectable)`);
}
const potencias = {};
for (const h of HORIZONTES) {
  const dif = [];
  for (const d of listaDias) {
    const arr = porDia.get(d).filter((a) => a.p_iVega != null && a[`mx${h}`] != null);
    if (arr.length < MIN_SIMBOLOS_DIA) continue;
    const ord = [...arr].sort((x, y) => y.p_iVega - x.p_iVega);
    const k = Math.floor(ord.length / 3);
    dif.push(media(ord.slice(0, k).map((a) => a[`mx${h}`])) - media(ord.slice(-k).map((a) => a[`mx${h}`])));
  }
  const nEf = Math.floor(dif.length / h);
  const s = desv(dif);
  potencias[h] = { nDias: dif.length, nEf, sd: s, detectable: nEf >= 5 ? 2.8 * s / Math.sqrt(nEf) : null };
  console.log(`  h=${String(h).padStart(2)}: sd de la diferencia diaria ${s.toFixed(3)} · n efectiva ${nEf} → separación mínima detectable ` +
    `${nEf >= 5 ? (2.8 * s / Math.sqrt(nEf)).toFixed(3) : "—"} (en unidades de rv diaria)`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// RESUMEN
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log("RESUMEN");
console.log("═".repeat(100));
const deTamano = resultados.filter((r) => r.cuenta);
const pasan = deTamano.filter((r) => r.pasa);
const mejor = [...deTamano].sort((a, b) => Math.abs(b.tDias) - Math.abs(a.tDias))[0];
console.log(`  pruebas de TAMAÑO declaradas: ${PRUEBAS} · realizadas: ${deTamano.length} · listón |t| = ${LISTON}`);
console.log(`  pasan las cuatro cribas + signo esperado + t por días no solapados: ${pasan.length}`);
if (pasan.length) for (const p of pasan) console.log(`    ✔ ${p.nom} · ${p.objetivo} · h=${p.h} · sep ${fmt(p.sep, 3)} · t(días) ${fmt(p.tDias)}`);
console.log(`  el mejor por t de días no solapados: ${mejor.nom} · ${mejor.objetivo} · h=${mejor.h} · t(días)=${fmt(mejor.tDias)} · t(filas)=${fmt(mejor.t)} · signo ${mejor.signoOk ? "ok" : "AL REVÉS"}`);
const conSigno = deTamano.filter((r) => r.signoOk);
console.log(`  pruebas con el signo del MECANISMO (no al revés): ${conSigno.length} de ${deTamano.length}`);
const mejorSigno = [...conSigno].sort((a, b) => Math.abs(b.tDias) - Math.abs(a.tDias))[0];
if (mejorSigno) console.log(`  la mejor CON el signo correcto: ${mejorSigno.nom} · ${mejorSigno.objetivo} · h=${mejorSigno.h} · t(días)=${fmt(mejorSigno.tDias)} · t(filas)=${fmt(mejorSigno.t)} · sep ${fmt(mejorSigno.sep, 3)}`);

fs.writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString(),
  parametros: { RUPTURA, HORIZONTES, MIN_SIMBOLOS_DIA, PRUEBAS, LISTON },
  diasUsables, filasPanel: panel.length, potencias,
  resultados, tramos,
}, null, 1));
console.log(`\n→ ${SALIDA}`);
