// ANATOMÍA 2 · LO QUE FIJA EL PEOR DÍA NO ES LA DISTANCIA, ES EL ANCHO DE LAS ALAS.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/anatomia-alas.mjs
//
// ═══ DE DÓNDE SALE ESTO ═══════════════════════════════════════════════════════════════════
//
// anatomia-lados.mjs midió 11 formas de quitar o alejar un lado. NINGUNA mejoró el peor día:
// alejar los strikes bajó la caída acumulada un 20% pero el peor día se quedó en −$4.900 y
// hasta empeoró un poco. No es mala suerte, es ARITMÉTICA:
//
//     pérdida máxima de un cóndor = (ancho de las alas − crédito) × 100
//
// La distancia a la que se venden los strikes sólo entra por el CRÉDITO —y al alejarlos el
// crédito BAJA, así que la pérdida máxima SUBE. El único mando que toca el peor día es el ancho.
//
// Aquí se barre la rejilla entera: distancia × ancho. Y se compara de dos maneras, porque
// comparar un cóndor de alas de 10 con uno de alas de 50 a UN CONTRATO es comparar dos tamaños
// de apuesta, no dos estrategias:
//
//   A UN CONTRATO       — lo que se arriesga y se gana con un cóndor suelto.
//   A IGUAL CAPITAL     — escalando el nº de contratos hasta ocupar los mismos $5.000 de
//                         colateral. Así todas las celdas arriesgan lo mismo y la comparación
//                         es de ESTRATEGIA, no de tamaño.
//
// Precios reales (bid al vender, ask al comprar, cuatro patas), entrada 11:00 ET, liquidación
// contra el cierre real, $0,03 por pata. Nada del futuro entra en la decisión.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00";
const COMM = 0.03;
const CAPITAL = 5000;    // el colateral que retiene Robinhood por un cóndor de alas de 50

const DISTANCIAS = [25, 30, 35, 40, 50];
const ALAS = [10, 20, 30, 40, 50];
const PRUEBAS = DISTANCIAS.length * ALAS.length + 11;   // esta rejilla + las 11 de anatomia-lados

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
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]; };
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
function caidaPicoValle(pls) { let a = 0, p = 0, w = 0; for (const x of pls) { a += x; p = Math.max(p, a); w = Math.min(w, a - p); } return w; }

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const celdas = new Map();   // "d-a" -> [{fecha, pl, colateral}]
for (const d of DISTANCIAS) for (const a of ALAS) celdas.set(`${d}-${a}`, []);
const diasValidos = [];

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const spot = C.filas[0].spot;
  if (!(spot > 0)) continue;
  const S = C.cierre;
  const fila = {};
  let completo = true;
  for (const d of DISTANCIAS) for (const a of ALAS) {
    const cC = cerca(C.filas, spot + d), pC = cerca(P.filas, spot - d);
    const cL = cerca(C.filas, cC.K + a), pL = cerca(P.filas, pC.K - a);
    if (cL.K <= cC.K || pL.K >= pC.K) { completo = false; continue; }
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) { completo = false; continue; }
    const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K;
    const pl = (cred - Math.min(Math.max(S - cC.K, 0), anchoC) - Math.min(Math.max(pC.K - S, 0), anchoP)) * 100 - 8 * COMM;
    fila[`${d}-${a}`] = { pl, colateral: (Math.max(anchoC, anchoP) - cred) * 100, credito: cred * 100 };
  }
  if (!completo || Object.keys(fila).length !== DISTANCIAS.length * ALAS.length) continue;
  diasValidos.push(fecha);
  for (const k of Object.keys(fila)) celdas.get(k).push({ fecha, ...fila[k] });
}

console.log(`\n═══ REJILLA DISTANCIA × ANCHO DE ALAS · SPXW 0DTE · entrada ${HORA} ET ═══`);
console.log(`\n${diasValidos.length} días con las ${DISTANCIAS.length * ALAS.length} celdas construibles · ${diasValidos[0]} → ${diasValidos[diasValidos.length - 1]}`);

radiografia(celdas.get("25-50").map((x) => ({ ...x })), ["pl", "colateral", "credito"], "celda ±25 / alas 50");

// ── comprobación de la aritmética: el peor día TIENE que ser el colateral de ese día ──
const c2550 = celdas.get("25-50");
const peorIdx = c2550.reduce((a, x, i) => (x.pl < c2550[a].pl ? i : a), 0);
console.log(`\nComprobación de la aritmética en ±25/alas 50: el peor día fue ${c2550[peorIdx].fecha}, P&L ${eur(c2550[peorIdx].pl)}`);
console.log(`  y el colateral retenido ese día era ${eur(c2550[peorIdx].colateral)} → la pérdida máxima ES el colateral (menos $0,24 de comisión).`);

function resumen(ops) {
  const pls = ops.map((x) => x.pl), total = suma(pls);
  const col = ops.map((x) => x.colateral).sort((a, b) => a - b);
  return {
    n: ops.length, alAno: total / (ops.length / 252), acierto: pls.filter((x) => x > 0).length / pls.length,
    peorDia: Math.min(...pls), p1: pct(pls, 0.01), p5: pct(pls, 0.05), dd: caidaPicoValle(pls),
    colMediano: col[col.length >> 1], colMax: col[col.length - 1], credito: media(ops.map((x) => x.credito)),
    pls,
  };
}
const R = new Map();
for (const k of celdas.keys()) R.set(k, resumen(celdas.get(k)));
const base = R.get("25-50");

// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ A · UN CONTRATO — lo que cuesta y lo que da un cóndor suelto ═══\n`);
for (const [titulo, campo, fmt] of [
  ["$/AÑO", "alAno", eur], ["PEOR DÍA", "peorDia", eur], ["percentil 5 del día", "p5", eur],
  ["CAÍDA acumulada (pico-valle)", "dd", eur], ["colateral mediano", "colMediano", eur],
  ["% de días ganados", "acierto", (x) => `${(x * 100).toFixed(0)}%`],
]) {
  console.log(`── ${titulo} ──`);
  console.log(`| distancia | ${ALAS.map((a) => `alas ${a}`).join(" | ")} |`);
  console.log(`|---|${ALAS.map(() => "---").join("|")}|`);
  for (const d of DISTANCIAS) console.log(`| ±${d} | ${ALAS.map((a) => fmt(R.get(`${d}-${a}`)[campo])).join(" | ")} |`);
  console.log("");
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// B · A IGUAL CAPITAL. Se escala el nº de contratos para ocupar los mismos $5.000 de colateral.
//     Fraccionario a propósito: es una comparación, no un plan de ejecución. Lo entero va abajo.
// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n═══ B · A IGUAL CAPITAL (${eur(CAPITAL)} de colateral en todas las celdas) ═══\n`);
const esc = new Map();
for (const k of celdas.keys()) {
  const r = R.get(k), f = CAPITAL / r.colMediano;
  esc.set(k, { f, alAno: r.alAno * f, peorDia: r.peorDia * f, p1: r.p1 * f, p5: r.p5 * f, dd: r.dd * f, pls: r.pls.map((x) => x * f) });
}
const baseE = esc.get("25-50");
for (const [titulo, campo, fmt] of [
  ["contratos que caben en $5.000", "f", (x) => x.toFixed(1)],
  ["$/AÑO", "alAno", eur], ["PEOR DÍA", "peorDia", eur], ["percentil 1 del día", "p1", eur],
  ["percentil 5 del día", "p5", eur], ["CAÍDA acumulada (pico-valle)", "dd", eur],
]) {
  console.log(`── ${titulo} ──`);
  console.log(`| distancia | ${ALAS.map((a) => `alas ${a}`).join(" | ")} |`);
  console.log(`|---|${ALAS.map(() => "---").join("|")}|`);
  for (const d of DISTANCIAS) console.log(`| ±${d} | ${ALAS.map((a) => fmt(esc.get(`${d}-${a}`)[campo])).join(" | ")} |`);
  console.log("");
}

// ── LA MÉTRICA QUE DECIDE, sobre la rejilla a igual capital ──
console.log(`── $/año perdidos por cada $ de CAÍDA eliminado (a igual capital · más bajo mejor · "—" no elimina) ──`);
console.log(`| distancia | ${ALAS.map((a) => `alas ${a}`).join(" | ")} |`);
console.log(`|---|${ALAS.map(() => "---").join("|")}|`);
for (const d of DISTANCIAS) {
  console.log(`| ±${d} | ${ALAS.map((a) => {
    const e = esc.get(`${d}-${a}`);
    const elim = Math.abs(baseE.dd) - Math.abs(e.dd), perd = baseE.alAno - e.alAno;
    return elim > 0 ? (perd / elim).toFixed(2) : "—";
  }).join(" | ")} |`);
}
console.log(`\n(listón de Bonferroni con ${PRUEBAS} pruebas: |t| ≥ ${listonT(PRUEBAS)})`);

// ═════════════════════════════════════════════════════════════════════════════════════════
// C · ¿ES UNA CRESTA SUAVE O UN PICO? Un óptimo aislado es sobreajuste; una cresta monótona
//     es un mecanismo. Y ¿aguanta en los TRES TERCIOS del período?
// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ C · LOS CANDIDATOS, TERCIO A TERCIO (a igual capital) ═══\n`);
const k3 = Math.floor(diasValidos.length / 3);
const CAND = ["25-50", "35-50", "25-30", "35-30", "25-20", "35-20", "25-10", "35-10"];
console.log("| celda | $/año | peor día | caída | $/año T1 | $/año T2 | $/año T3 | caída T1 | caída T2 | caída T3 |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const tercioTabla = {};
for (const c of CAND) {
  const e = esc.get(c);
  const ts = [0, 1, 2].map((i) => (i < 2 ? e.pls.slice(i * k3, (i + 1) * k3) : e.pls.slice(2 * k3)));
  tercioTabla[c] = { alAno: ts.map((g) => suma(g) / (g.length / 252)), dd: ts.map(caidaPicoValle) };
  console.log(`| ±${c.split("-")[0]} / alas ${c.split("-")[1]} | ${eur(e.alAno)} | ${eur(e.peorDia)} | ${eur(e.dd)} | ${tercioTabla[c].alAno.map(eur).join(" | ")} | ${tercioTabla[c].dd.map(eur).join(" | ")} |`);
}

// ── lo ENTERO, que es lo que se puede operar de verdad con su efectivo ──
console.log(`\n\n═══ D · CONTRATOS ENTEROS con el efectivo real ($7.977 libres) ═══\n`);
console.log("| celda | colateral/contrato (máx) | contratos que caben | $/año | peor día | caída |");
console.log("|---|---|---|---|---|---|");
for (const c of CAND) {
  const r = R.get(c);
  const n = Math.max(1, Math.floor(7977 / r.colMax));
  console.log(`| ±${c.split("-")[0]} / alas ${c.split("-")[1]} | ${eur(r.colMax)} | ${n} | ${eur(r.alAno * n)} | ${eur(r.peorDia * n)} | ${eur(r.dd * n)} |`);
}

writeFileSync("scripts/anatomia-alas-salida.json", JSON.stringify({
  dias: diasValidos.length, periodo: [diasValidos[0], diasValidos[diasValidos.length - 1]],
  unContrato: Object.fromEntries([...R].map(([k, v]) => [k, { ...v, pls: undefined }])),
  igualCapital: Object.fromEntries([...esc].map(([k, v]) => [k, { ...v, pls: undefined }])),
  tercios: tercioTabla,
}, null, 2));
console.log(`\n(detalle en scripts/anatomia-alas-salida.json)`);
