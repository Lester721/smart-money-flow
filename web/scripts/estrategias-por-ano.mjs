// LAS ESTRATEGIAS DESARROLLADAS, AÑO POR AÑO — con lo que de verdad duele.
//
// ═══ QUÉ PIDIÓ LESTER Y POR QUÉ TIENE RAZÓN ═════════════════════════════════════════════════
//
// "una tablita con lo que ganaría de años anteriores, la pérdida más grande por año, y la racha
// de pérdida y de ganancia por año".
//
// Las tres columnas que faltaban. Un $/año promedio esconde exactamente lo que hace que alguien
// abandone una estrategia buena: **la racha**. Doce perdedoras seguidas en marzo y da igual que
// el año cierre en verde — nadie llega a diciembre.
//
// Por eso aquí van, para cada año:
//   · la ganancia
//   · la PEOR operación suelta
//   · la peor CAÍDA ACUMULADA (que no es lo mismo: son muchas pequeñas seguidas)
//   · la racha más larga de perdedoras  ← la que echa a la gente
//   · la racha más larga de ganadoras
//
// ═══ LAS TRES ESTRATEGIAS, Y DE DÓNDE SALE CADA UNA ═════════════════════════════════════════
//
//   1. CÓNDOR · los tres síes   — cadenas de SPXW 0DTE, precios bid/ask reales, 2023-2026
//   2. CÓNDOR · ±25 sin filtro  — el mismo cóndor sin ninguna regla, para ver qué aporta filtrar
//   3. LA MEZCLA · QQQ + put    — mitad índice, mitad venta de put semanal 3% fuera, 2020-2026
//
// El cóndor se mide POR CONTRATO (dólares absolutos). La mezcla es una CARTERA, así que se mide
// en porcentaje y se traduce a dólares sobre un capital declarado. No son la misma unidad y no
// se suman: por eso van en tablas separadas.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/estrategias-por-ano.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

// LA SALIDA VA A UN JSON QUE LEE LA WEB. Nada de transcribir números a mano a una página:
// eso es la vía más rápida a que la tabla y el cálculo digan cosas distintas.
const SALIDA = "lib/estrategias-por-ano.json";
const recogido = [];

const CAPITAL = 50_000;            // base declarada para la mezcla; escala lineal
const DIST_PUT = 0.03;             // la put al 3% fuera del dinero
const PESO_INDICE = 0.5;           // mitad y mitad

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");

/** La racha más larga de signo negativo y la más larga de signo positivo. */
function rachas(pls) {
  let perd = 0, gan = 0, cp = 0, cg = 0;
  for (const x of pls) {
    if (x < 0) { cp++; cg = 0; } else if (x > 0) { cg++; cp = 0; } else { cp = 0; cg = 0; }
    perd = Math.max(perd, cp); gan = Math.max(gan, cg);
  }
  return { perd, gan };
}
/** La peor caída acumulada: muchas pequeñas seguidas duelen igual que una grande. */
function caida(pls) { let a = 0, p = 0, w = 0; for (const x of pls) { a += x; p = Math.max(p, a); w = Math.min(w, a - p); } return w; }

function tabla(nombre, ops, unidad, nota) {
  // ops: [{ fecha, pl }]
  const anos = [...new Set(ops.map((o) => o.fecha.slice(0, 4)))].sort();
  console.log(`\n### ${nombre}`);
  console.log(`_${unidad}_\n`);
  console.log("| año | ops | ganancia | peor operación | peor caída seguida | racha perdedora | racha ganadora |");
  console.log("|---|---|---|---|---|---|---|");
  const porAno = [];
  for (const a of anos) {
    const g = ops.filter((o) => o.fecha.startsWith(a));
    if (!g.length) continue;
    const pls = g.map((o) => o.pl);
    const r = rachas(pls);
    porAno.push({ ano: a, ops: g.length, ganancia: suma(pls), peorOp: Math.min(...pls), peorCaida: caida(pls), rachaPerd: r.perd, rachaGan: r.gan });
    console.log(`| ${a} | ${g.length} | **${eur(suma(pls))}** | ${eur(Math.min(...pls))} | ${eur(caida(pls))} | ${r.perd} seguidas | ${r.gan} seguidas |`);
  }
  const pls = ops.map((o) => o.pl);
  const r = rachas(pls);
  const anosT = (Date.parse(ops[ops.length - 1].fecha) - Date.parse(ops[0].fecha)) / 86_400_000 / 365.25;
  console.log(`| | | | | | | |`);
  console.log(`| **TODO** | ${ops.length} | **${eur(suma(pls))}** | ${eur(Math.min(...pls))} | ${eur(caida(pls))} | **${r.perd} seguidas** | ${r.gan} seguidas |`);
  console.log(`\n  **${eur(suma(pls) / anosT)} al año** · ${Math.round(pls.filter((x) => x > 0).length / pls.length * 100)}% de acierto · ${eur(media(pls))} por operación\n`);

  recogido.push({
    nombre, unidad, nota: nota ?? null,
    porAno,
    total: {
      ops: ops.length, ganancia: suma(pls), alAno: suma(pls) / anosT,
      peorOp: Math.min(...pls), peorCaida: caida(pls),
      rachaPerd: r.perd, rachaGan: r.gan,
      acierto: pls.filter((x) => x > 0).length / pls.length,
      porOperacion: media(pls),
      desde: ops[0].fecha, hasta: ops[ops.length - 1].fecha,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 y 2 · LOS DOS CÓNDORES — desde las cadenas, precios reales
// ═══════════════════════════════════════════════════════════════════════════
const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", COMM = 0.03, ALA = 50;

function leerDia(fecha, right) {
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

function condorDe(C, P, dist) {
  const spot = C.filas[0].spot, S = C.cierre;
  const cC = cerca(C.filas, spot + dist), pC = cerca(P.filas, spot - dist);
  const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) return null;
  const cred = cC.bid + pC.bid - cL.ask - pL.ask;      // vendo al bid, compro al ask
  if (!(cred > 0)) return null;
  const aC = cL.K - cC.K, aP = pC.K - pL.K;
  const dC = Math.min(Math.max(S - cC.K, 0), aC), dP = Math.min(Math.max(pC.K - S, 0), aP);
  return { pl: (cred - dC - dP) * 100 - 8 * COMM, credito: cred * 100, spot };
}

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const dias45 = [], dias25 = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0) || !(C.filas[0].spot > 0)) continue;
  const a = condorDe(C, P, 45), b = condorDe(C, P, 25);
  if (a) dias45.push({ fecha, ...a });
  if (b) dias25.push({ fecha, ...b });
}

// la cinta de minutos de SPY para las medias (sólo cierres de D−1 hacia atrás)
const serie = [];
for (const y of [2021, 2022, 2023, 2024, 2025, 2026]) {
  const f = `scripts/cache-theta/SPY_spotmin_y_${y}.json`;
  if (!existsSync(f)) continue;
  for (const [d, arr] of Object.entries(JSON.parse(readFileSync(f, "utf8")))) {
    const m = new Map(arr.map(([mi, p]) => [mi, p]));
    const c = m.get(960), p11 = m.get(660);
    if (c > 0 && p11 > 0) serie.push({ fecha: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, c, p11 });
  }
}
serie.sort((a, b) => a.fecha.localeCompare(b.fecha));
const idxSerie = new Map(serie.map((d, i) => [d.fecha, i]));

const tresSies = [];
for (const d of dias45) {
  const i = idxSerie.get(d.fecha);
  if (i === undefined || i < 55) continue;
  const cierres = serie.slice(Math.max(0, i - 200), i).map((x) => x.c);
  const p11 = serie[i].p11;
  if (p11 > media(cierres.slice(-5)) && p11 > media(cierres.slice(-50)) && d.credito >= 100) tresSies.push(d);
}

console.log(`\n${"=".repeat(104)}`);
console.log(`  LOS CÓNDORES · SPX 0DTE · POR CONTRATO`);
console.log("=".repeat(104));
tabla("Cóndor · LOS TRES SÍES", tresSies, "por contrato · retiene ~$5.000 de colateral",
  "En 2022 operó sólo 13 días de 219 y ganó los 13. Eso NO demuestra que resista un año malo: demuestra que casi no juega. Cuál de esos 13 días le tocó puede ser suerte.");
tabla("Cóndor · ±25 sin ningún filtro", dias25, "por contrato · opera todos los días",
  "El cóndor crudo, para ver qué aporta filtrar. Pierde en 2022 y 2023, y encadena 6 perdedoras seguidas.");

// EL AGUJERO QUE HAY QUE ENSEÑAR: los tres síes NO se pueden evaluar en 2022 porque la cinta de
// minutos de SPY empieza en 2023 — y 2022 es justo el año que hundió al cóndor crudo. Lo que SÍ
// se puede ver es si la GEOMETRÍA de ±45 aguanta 2022 por sí sola, sin el filtro de medias.
tabla("Cóndor · ±45 sin filtro", dias45, "por contrato · la misma geometría, sin las tres preguntas",
  "Alejar los strikes NO salva 2022 por sí solo: −$22.074. Lo que cambia el año es el filtro de medias, no la geometría.");

// Y con el tercer sí solo (el crédito ≥ $100), que sí es calculable en 2022.
tabla("Cóndor · ±45 con sólo el crédito ≥ $100", dias45.filter((d) => d.credito >= 100), "por contrato · el tercer sí, a solas",
  "El tercer sí solo tampoco salva 2022 (−$19.128). Los tres síes funcionan JUNTOS o no funcionan.");

// ═══════════════════════════════════════════════════════════════════════════
// 3 · LA MEZCLA — mitad QQQ, mitad venta de put semanal al 3%
// ═══════════════════════════════════════════════════════════════════════════
const R = "scripts/cache-theta";
const ops = JSON.parse(readFileSync(`${R}/_mezcla-ops.json`, "utf8")).filter((o) => Math.abs(o.dist - DIST_PUT) < 1e-9);
const oc = JSON.parse(readFileSync(`${R}/noche-2026-08-10/qqq-oc.json`, "utf8"));
const cQQQ = new Map(oc.map((x) => [x.d, x.c]));
const mas = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const px = (m, d) => { for (let k = 0; k < 7; k++) { const x = mas(d, -k); if (m.has(x)) return m.get(x); } return null; };

const mezcla = [];
for (const o of ops) {
  const a = px(cQQQ, o.fecha), b = px(cQQQ, o.exp);
  if (a == null || b == null) continue;
  const rQ = b / a - 1;                                  // la mitad de índice
  const rP = o.rPut;                                     // la mitad de put, sobre su colateral
  if (!isFinite(rQ) || !isFinite(rP)) continue;
  mezcla.push({ fecha: o.fecha, pl: (PESO_INDICE * rQ + (1 - PESO_INDICE) * rP) * CAPITAL });
}

console.log(`\n${"=".repeat(104)}`);
console.log(`  LA MEZCLA · mitad QQQ, mitad venta de put semanal al 3% fuera · SEMANAL`);
console.log("=".repeat(104));
tabla("La mezcla · mitad QQQ, mitad venta de put", mezcla, `sobre ${eur(CAPITAL)} de capital · escala lineal`,
  "Gana MENOS dinero que comprar QQQ a secas ($5.906 contra $6.792 al año). Lo que compra es tranquilidad: la peor caída es la mitad y 2022 costó −$3.494 en vez de −$11.821.");

// ── el índice pelado, como control ─────────────────────────────────────────
const soloQQQ = [];
for (const o of ops) {
  const a = px(cQQQ, o.fecha), b = px(cQQQ, o.exp);
  if (a == null || b == null) continue;
  soloQQQ.push({ fecha: o.fecha, pl: (b / a - 1) * CAPITAL });
}
tabla("CONTROL · sólo QQQ, sin vender nada", soloQQQ, `sobre ${eur(CAPITAL)} de capital`,
  "El listón de verdad. Cualquier estrategia de cartera tiene que compararse contra esto, no contra cero.");

console.log("=".repeat(104));
console.log("  CÓMO LEER ESTO");
console.log("=".repeat(104));
console.log(`
  · el cóndor va POR CONTRATO y la mezcla va sobre ${eur(CAPITAL)} de capital: NO son la misma
    unidad y no se suman. El cóndor se escala comprando más contratos —y el susto escala igual—;
    la mezcla se escala metiendo más capital.

  · "peor caída seguida" no es lo mismo que "peor operación": son varias pequeñas encadenadas.
    En el cóndor casi siempre coinciden (una sola operación mala hace todo el daño). En la mezcla
    no coinciden, y ahí está la diferencia de carácter entre las dos.

  · la RACHA PERDEDORA es la columna que decide si aguantarías la estrategia en la vida real.
    Un año en verde con nueve perdedoras seguidas en medio se abandona antes de llegar al verde.
`);

writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString().slice(0, 10), capital: CAPITAL, tablas: recogido }, null, 1), "utf8");
console.log(`
  → ${SALIDA} escrito para la web
`);
