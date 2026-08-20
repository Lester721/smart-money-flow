// ESTRUCTURA 2 · EL MECANISMO Y LA PRUEBA DE ESFUERZO
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/estructura2-mecanismo.mjs
//
// ═══ QUÉ QUEDA POR RESPONDER ══════════════════════════════════════════════════════════════
//
// De los dos barridos anteriores salió una sola estructura con algo que enseñar:
//
//     C+35 / P−50, alas de 50   →   caída −$15.176 → −$8.606 (−43%) conservando el 78% del ingreso
//
// Y salió también que el PEOR DÍA no se mueve casi nada (−$4.900 → −$4.734), porque el peor día
// es aritmética pura: ancho del ala × 100 − crédito. Mover los strikes cortos no lo toca.
//
// Entonces, ¿de dónde sale la caída más pequeña, si el peor día es el mismo? SÓLO puede salir de
// una cosa: de que los días malos VENGAN MENOS APELOTONADOS. Una caída es un racimo, no un día.
//
// Esa es la hipótesis a probar aquí, y es falsable: si el daño de la put viene más apelotonado
// que el de la call, alejar la put desarma racimos y baja la caída sin tocar el peor día. Si viene
// igual de apelotonado, los −$8.606 son la suerte de ESTE camino de 653 días y no hay mecanismo.
//
// ═══ Y LA PRUEBA DE ESFUERZO ══════════════════════════════════════════════════════════════
//
// Un resultado de ESTRUCTURA no puede depender de la hora exacta de entrada. Si C+35/P−50 baja la
// caída porque desarma racimos, tiene que bajarla también entrando a las 10:00, a las 12:00 y a la
// 13:00. Si sólo funciona a las 11:00, es que se ha ajustado a los 653 caminos de una hora concreta.
// Esto NO es buscar una hora mejor: la hora sigue siendo las 11:00. Es intentar tumbar el hallazgo.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const DIR = "scripts/cache-theta/gex-2026";
const COMM = 0.03;

function leerDia(fecha, right, HORA) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) return null;
  const enHora = []; let spotFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre: spotFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1)); };
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
function caidaPicoValle(pls) { let a = 0, p = 0, peor = 0; for (const x of pls) { a += x; p = Math.max(p, a); peor = Math.min(peor, a - p); } return peor; }

const ESTRUCTURAS = [
  { id: "C+25/P−25 ala 50 (la de hoy)", dC: 25, aC: 50, dP: 25, aP: 50 },
  { id: "C+35/P−50 ala 50",             dC: 35, aC: 50, dP: 50, aP: 50 },
  { id: "C+50/P−35 ala 50 (su espejo)", dC: 50, aC: 50, dP: 35, aP: 50 },
  { id: "C+35/P−35 ala 50",             dC: 35, aC: 50, dP: 35, aP: 50 },
  { id: "C+25/P−50 ala 50",             dC: 25, aC: 50, dP: 50, aP: 50 },
];
const HORAS = ["10:00", "11:00", "12:00", "13:00"];

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

/** Construye todas las estructuras para una hora de entrada. */
function correr(HORA) {
  const out = new Map();
  for (const fecha of fechas) {
    const C = leerDia(fecha, "C", HORA), P = leerDia(fecha, "P", HORA);
    if (!C || !P || !(C.cierre > 0)) continue;
    const spot = C.filas[0].spot;
    if (!(spot > 0)) continue;
    const S = C.cierre, dia = {};
    let ok = true;
    for (const e of ESTRUCTURAS) {
      const cC = cerca(C.filas, spot + e.dC), cL = cerca(C.filas, cC.K + e.aC);
      const pC = cerca(P.filas, spot - e.dP), pL = cerca(P.filas, pC.K - e.aP);
      if (cL.K <= cC.K || pL.K >= pC.K) { ok = false; break; }
      const credito = cC.bid + pC.bid - cL.ask - pL.ask;
      const danoCall = Math.min(Math.max(S - cC.K, 0), cL.K - cC.K);
      const danoPut = Math.min(Math.max(pC.K - S, 0), pC.K - pL.K);
      dia[e.id] = {
        opera: credito > 0,
        pl: credito > 0 ? (credito - danoCall - danoPut) * 100 - 8 * COMM : 0,
        credito: credito * 100, danoCall: danoCall * 100, danoPut: danoPut * 100,
      };
    }
    if (!ok || !dia[ESTRUCTURAS[0].id].opera) continue;
    out.set(fecha, dia);
  }
  return out;
}

console.log(`\n═══ ESTRUCTURA 2 · MECANISMO Y PRUEBA DE ESFUERZO ═══`);

// ═════════════════════════════════════════════════════════════════════════════════════════
// 1 · ¿VIENE APELOTONADO EL DAÑO? — el mecanismo que tendría que explicar la caída menor
// ═════════════════════════════════════════════════════════════════════════════════════════
const M11 = correr("11:00");
const dias = [...M11.keys()].sort();
const BASE = ESTRUCTURAS[0].id;
const dC = dias.map((f) => M11.get(f)[BASE].danoCall);
const dP = dias.map((f) => M11.get(f)[BASE].danoPut);

/** Máximo daño acumulado en una ventana de `w` sesiones, en múltiplos de la ventana media. */
function apelotonamiento(v, w) {
  let mx = 0;
  for (let i = 0; i + w <= v.length; i++) mx = Math.max(mx, suma(v.slice(i, i + w)));
  return { max: mx, mediaVentana: (suma(v) / v.length) * w, ratio: mx / ((suma(v) / v.length) * w) };
}
console.log(`\n\n═══ 1 · ¿VIENE APELOTONADO EL DAÑO? (base ±25, ${dias.length} días) ═══\n`);
console.log(`Un peor día igual pero una caída menor sólo puede venir de racimos más cortos.`);
console.log(`"×media" = cuánto pesa la PEOR ventana comparada con una ventana normal. Más alto = más apelotonado.\n`);
console.log("| ventana | peor racha de daño CALL | ×media | peor racha de daño PUT | ×media | ¿quién se apelotona más? |");
console.log("|---|---|---|---|---|---|");
const apel = {};
for (const w of [3, 5, 10, 20]) {
  const a = apelotonamiento(dC, w), b = apelotonamiento(dP, w);
  apel[w] = { call: a, put: b };
  console.log(`| ${w} sesiones | ${eur(-a.max)} | ${a.ratio.toFixed(1)}× | ${eur(-b.max)} | ${b.ratio.toFixed(1)}× | ${b.ratio > a.ratio ? "la PUT" : "la CALL"} |`);
}
// Y la prueba directa: ¿un día de daño en un lado predice otro día de daño en ese mismo lado?
function persistencia(v) {
  const hay = v.map((x) => x > 0);
  const tras = hay.map((h, i) => (i > 0 && hay[i - 1] ? h : null)).filter((x) => x != null);
  const base = hay.filter(Boolean).length / hay.length;
  return { base, condicional: tras.filter(Boolean).length / tras.length, n: tras.length };
}
const pC = persistencia(dC), pP = persistencia(dP);
console.log(`\n  Probabilidad de que un lado rompa HOY, sin condicionar:  call ${(pC.base * 100).toFixed(1)}% · put ${(pP.base * 100).toFixed(1)}%`);
console.log(`  Probabilidad de que rompa HOY habiendo roto AYER:        call ${(pC.condicional * 100).toFixed(1)}% (n=${pC.n}) · put ${(pP.condicional * 100).toFixed(1)}% (n=${pP.n})`);
console.log(`  Empuje del apelotonamiento (condicional − base):         call ${((pC.condicional - pC.base) * 100).toFixed(1)} pts · put ${((pP.condicional - pP.base) * 100).toFixed(1)} pts`);
console.log(`\n  Máxima racha de sesiones seguidas rompiendo: call ${maxRacha(dC)} · put ${maxRacha(dP)}`);
function maxRacha(v) { let m = 0, c = 0; for (const x of v) { c = x > 0 ? c + 1 : 0; m = Math.max(m, c); } return m; }

// ═════════════════════════════════════════════════════════════════════════════════════════
// 2 · PRUEBA DE ESFUERZO POR HORA DE ENTRADA
// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 2 · PRUEBA DE ESFUERZO: ¿aguanta a otras horas de entrada? ═══\n`);
console.log(`La hora de operar sigue siendo las 11:00. Esto es un intento de TUMBAR el hallazgo:`);
console.log(`una ventaja de estructura no puede vivir en una hora concreta.\n`);
const porHora = {};
console.log("| hora | estructura | días | $/año | caída | peor día | acierto | vs base: % ingreso | vs base: caída |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const H of HORAS) {
  const M = H === "11:00" ? M11 : correr(H);
  const ds = [...M.keys()].sort();
  const res = {};
  for (const e of ESTRUCTURAS) {
    const pls = ds.map((f) => M.get(f)[e.id].pl);
    res[e.id] = {
      n: pls.length, alAno: suma(pls) / (pls.length / 252), dd: caidaPicoValle(pls),
      peorDia: Math.min(...pls), acierto: pls.filter((x) => x > 0).length / pls.length,
      t: media(pls) / (sd(pls) / Math.sqrt(pls.length)),
    };
  }
  porHora[H] = res;
  const b = res[BASE];
  for (const e of ESTRUCTURAS) {
    const r = res[e.id];
    console.log(`| ${H} | ${e.id} | ${r.n} | ${eur(r.alAno)} | ${eur(r.dd)} | ${eur(r.peorDia)} | ${(r.acierto * 100).toFixed(0)}% | ${((r.alAno / b.alAno) * 100).toFixed(0)}% | ${e.id === BASE ? "—" : (((Math.abs(b.dd) - Math.abs(r.dd)) / Math.abs(b.dd)) * 100).toFixed(0) + "% menor"} |`);
  }
  console.log(`|---|---|---|---|---|---|---|---|---|`);
}

// ¿en cuántas horas de las 4 baja la caída C+35/P−50?
const CAND = "C+35/P−50 ala 50", ESP = "C+50/P−35 ala 50 (su espejo)";
const bajanC = HORAS.filter((H) => Math.abs(porHora[H][CAND].dd) < Math.abs(porHora[H][BASE].dd)).length;
const bajanE = HORAS.filter((H) => Math.abs(porHora[H][ESP].dd) < Math.abs(porHora[H][BASE].dd)).length;
console.log(`\n  ${CAND} baja la caída en ${bajanC} de las ${HORAS.length} horas · su ESPEJO ${ESP} en ${bajanE} de ${HORAS.length}`);
console.log(`  (si el espejo también la baja, lo que funciona es ALEJAR, no alejar la PUT)`);

// ── EL OBJETIVO ROBUSTO ──────────────────────────────────────────────────────────────────
// Todo lo mecánico del cóndor es SUAVE con la hora: el crédito mediano cae 860→255, los días que
// rompe la call caen 168→68, el movimiento que queda cae 31→18 puntos. Monótono, sin saltos.
// El P&L, que es la resta de dos cantidades grandes y suaves, sale A DIENTES DE SIERRA. Eso es
// la firma del ruido, no la de un mecanismo: las 11:00 son el pico de una curva picuda.
//
// Consecuencia práctica: **una estructura no se juzga en una hora, se juzga en la MEDIA de varias.**
// Optimizar a las 11:00 es optimizar sobre el pico. Esta tabla es el listón que hay que usar para
// comparar estructuras a partir de ahora.
console.log(`\n\n── EL OBJETIVO ROBUSTO: media de las ${HORAS.length} horas, no el pico de una ──\n`);
console.log("| estructura | $/año medio de las 4 horas | mín | máx | caída media | $/año por $ de caída | ¿bate a la base? |");
console.log("|---|---|---|---|---|---|---|");
const mediaHoras = {};
const baseMed = media(HORAS.map((H) => porHora[H][BASE].alAno));
for (const e of ESTRUCTURAS) {
  const a = HORAS.map((H) => porHora[H][e.id].alAno), d = HORAS.map((H) => Math.abs(porHora[H][e.id].dd));
  mediaHoras[e.id] = { alAno: media(a), min: Math.min(...a), max: Math.max(...a), dd: media(d), calmar: media(a) / media(d) };
  const m = mediaHoras[e.id];
  console.log(`| ${e.id} | ${eur(m.alAno)} | ${eur(m.min)} | ${eur(m.max)} | ${eur(-m.dd)} | ${m.calmar.toFixed(2)} | ${e.id === BASE ? "—" : m.alAno > baseMed ? "SÍ" : "NO"} |`);
}
console.log(`\n  La base a las 11:00 da ${eur(porHora["11:00"][BASE].alAno)}/año; su media de las 4 horas es ${eur(baseMed)}.`);
console.log(`  El ${eur(porHora["11:00"][BASE].alAno)} publicado está en el PICO de una curva que va de ${eur(Math.min(...HORAS.map((H) => porHora[H][BASE].alAno)))} a ${eur(Math.max(...HORAS.map((H) => porHora[H][BASE].alAno)))}.`);

// ═════════════════════════════════════════════════════════════════════════════════════════
// 3 · EL LISTÓN — ¿alguna diferencia supera el ruido?
// ═════════════════════════════════════════════════════════════════════════════════════════
const PRUEBAS_FAMILIA = 17 + 30 + 11 + 93 + 32 + ESTRUCTURAS.length * HORAS.length;
console.log(`\n\n═══ 3 · EL LISTÓN ═══\n`);
console.log(`Pruebas acumuladas sobre estos mismos 653 días: ${PRUEBAS_FAMILIA} · listón de Bonferroni |t| > ${listonT(PRUEBAS_FAMILIA)}\n`);
console.log("| estructura (entrada 11:00) | $/día medio | t del P&L | ¿supera el listón? |");
console.log("|---|---|---|---|");
for (const e of ESTRUCTURAS) {
  const pls = dias.map((f) => M11.get(f)[e.id].pl);
  const t = media(pls) / (sd(pls) / Math.sqrt(pls.length));
  console.log(`| ${e.id} | ${eur(media(pls))} | ${t.toFixed(2)} | ${Math.abs(t) > listonT(PRUEBAS_FAMILIA) ? "SÍ" : "NO"} |`);
}
console.log(`\n  Y el contraste que decide la asimetría, pareado día a día:`);
const dif = dias.map((f) => M11.get(f)[CAND].pl - M11.get(f)[ESP].pl);
const tDif = media(dif) / (sd(dif) / Math.sqrt(dif.length));
console.log(`  ${CAND} − ${ESP}: ${eur(media(dif))}/día · ${eur(media(dif) * 252)}/año · t = ${tDif.toFixed(2)} · ${Math.abs(tDif) > listonT(PRUEBAS_FAMILIA) ? "SUPERA" : "NO supera"} el listón`);

writeFileSync("scripts/estructura2-mecanismo.json", JSON.stringify({
  dias: dias.length, periodo: [dias[0], dias[dias.length - 1]],
  apelotonamiento: apel, persistencia: { call: pC, put: pP, maxRachaCall: maxRacha(dC), maxRachaPut: maxRacha(dP) },
  porHora, mediaHoras, bajanCaida: { candidata: bajanC, espejo: bajanE, deHoras: HORAS.length },
  pruebasFamilia: PRUEBAS_FAMILIA, listonT: listonT(PRUEBAS_FAMILIA), tContrasteEspejo: tDif,
}, null, 2));
console.log(`\n(detalle en scripts/estructura2-mecanismo.json)`);
