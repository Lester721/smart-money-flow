// VERIFICACIÓN DE LA ÚNICA CELDA QUE CORTÓ LA CAÍDA EN LOS TRES TERCIOS: ±35 / alas 60
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/estructura1-verificar-35-60.mjs
//
// ═══ POR QUÉ HACE FALTA ESTO ══════════════════════════════════════════════════════════════
//
// estructura1-ancho-alas.mjs barrió 9 anchuras y luego 6 celdas exploratorias. UNA salió bien.
// Una celda que sale bien de un barrido donde yo veía los resultados mientras lo hacía NO es
// un hallazgo: es una candidata. Y la métrica que sale bien —la CAÍDA ACUMULADA— es la más
// fácil de fingir que existe, porque es UN número por serie: un solo camino, sin repeticiones.
//
// Decir "la caída baja de $15.176 a $12.595" es citar dos observaciones, no una diferencia
// medida. Aquí se convierte en una diferencia medida:
//
//   · t pareado del P&L diario (la media, que es lo que sí tiene n=653)
//   · BOOTSTRAP POR BLOQUES PAREADO de la caída: se remuestrean bloques de 20 días —los mismos
//     bloques para las dos series, para que compartan el mercado— y se cuenta en qué fracción
//     de mundos la nueva configuración tiene MENOS caída que la de hoy. Bloques y no días
//     sueltos porque la caída depende del ORDEN, y remuestrear días sueltos lo destruiría.
//   · el colateral MÁXIMO, no el mediano, que es lo que decide si cabe en la cuenta.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00", COMM = 0.03;
const EFECTIVO = 7977;
const CFG = [
  { nombre: "±25 / alas 50 (la de hoy)", d: 25, a: 50 },
  { nombre: "±35 / alas 60 (la candidata)", d: 35, a: 60 },
  { nombre: "±35 / alas 50 (control: sólo alejar)", d: 35, a: 50 },
  { nombre: "±25 / alas 60 (control: sólo ensanchar)", d: 25, a: 60 },
  // Las dos anchuras PURAS que la tabla del barrido señaló. Van al mismo bootstrap: alas 75
  // fue la única fila que "batió el listón" del precio de la caída, y hay que ver si esos $97
  // de caída eliminada sobre $15.176 son una mejora o son ruido. Alas 40 es el estrechamiento
  // más barato de los que sí reducen. Sin esto, mi propio encargo se queda sin contestar.
  { nombre: "±25 / alas 75 (la única que 'batió el listón')", d: 25, a: 75 },
  { nombre: "±25 / alas 40 (el estrechamiento más barato)", d: 25, a: 40 },
];

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) throw new Error(`columnas ausentes en ${f}`);
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
const mediana = (v) => { const s = [...v].sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]; };
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
const caida = (p) => { let a = 0, k = 0, w = 0; for (const x of p) { a += x; k = Math.max(k, a); w = Math.min(w, a - k); } return w; };
const tStat = (v) => { const m = media(v), s = Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1)); return m / (s / Math.sqrt(v.length)); };

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const S = new Map(CFG.map((c) => [c.nombre, []]));
const diasOK = [];

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const spot = C.filas[0].spot; if (!(spot > 0)) continue;
  const cierre = C.cierre;
  const fila = {};
  for (const c of CFG) {
    const cC = cerca(C.filas, spot + c.d), pC = cerca(P.filas, spot - c.d);
    const cL = cerca(C.filas, cC.K + c.a), pL = cerca(P.filas, pC.K - c.a);
    if (cL.K <= cC.K || pL.K >= pC.K) continue;
    const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K, ancho = Math.max(anchoC, anchoP);
    if (Math.abs(anchoC - c.a) > Math.max(5, 0.3 * c.a) || Math.abs(anchoP - c.a) > Math.max(5, 0.3 * c.a)) continue;
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) continue;
    fila[c.nombre] = {
      pl: (cred - Math.min(Math.max(cierre - cC.K, 0), anchoC) - Math.min(Math.max(pC.K - cierre, 0), anchoP)) * 100 - 8 * COMM,
      colateral: ancho * 100, credito: cred * 100,
    };
  }
  if (Object.keys(fila).length !== CFG.length) continue;   // sólo días donde las 4 se montan
  diasOK.push(fecha);
  for (const c of CFG) S.get(c.nombre).push({ fecha, ...fila[c.nombre] });
}

console.log(`\n# VERIFICACIÓN · ±35 / alas 60 contra la estrategia de hoy\n`);
console.log(`${diasOK.length} días en los que las ${CFG.length} configuraciones se montan con crédito positivo · ${diasOK[0]} → ${diasOK[diasOK.length - 1]}`);
radiografia(S.get(CFG[1].nombre).map((x) => ({ ...x })), ["pl", "credito"], "±35/60");

console.log(`\n## Las cuatro configuraciones, un contrato\n`);
console.log(`| configuración | $/año | $/op | acierto | crédito medio | peor día | p1 | p5 | **peor racha** | colateral mediano | colateral MÁX | t |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|---|---|`);
const M = new Map();
for (const c of CFG) {
  const v = S.get(c.nombre), pls = v.map((x) => x.pl), col = v.map((x) => x.colateral);
  const m = {
    alAno: suma(pls) / (v.length / 252), porOp: media(pls), acierto: pls.filter((x) => x > 0).length / pls.length,
    credito: media(v.map((x) => x.credito)), peorDia: Math.min(...pls), p1: pct(pls, 0.01), p5: pct(pls, 0.05),
    dd: caida(pls), colMed: mediana(col), colMax: Math.max(...col), t: tStat(pls), pls,
  };
  M.set(c.nombre, m);
  console.log(`| ${c.nombre} | ${eur(m.alAno)} | ${eur(m.porOp)} | ${(m.acierto * 100).toFixed(0)}% | ${eur(m.credito)} | ${eur(m.peorDia)} | ${eur(m.p1)} | ${eur(m.p5)} | ${eur(m.dd)} | ${eur(m.colMed)} | ${eur(m.colMax)} | ${m.t.toFixed(2)} |`);
}
const A = M.get(CFG[0].nombre), B = M.get(CFG[1].nombre);

// ── ¿Es el ancho, la distancia, o hacen falta los dos? Los dos controles de una variable ──
console.log(`\n## ¿De dónde viene la mejora? Los dos controles de una sola variable\n`);
console.log(`| cambio | $/año | peor racha | vs hoy en caída |`);
console.log(`|---|---|---|---|`);
for (const c of CFG) {
  const m = M.get(c.nombre);
  const dif = ((Math.abs(m.dd) - Math.abs(A.dd)) / Math.abs(A.dd)) * 100;
  console.log(`| ${c.nombre} | ${eur(m.alAno)} | ${eur(m.dd)} | ${c === CFG[0] ? "—" : (dif < 0 ? "−" : "+") + Math.abs(dif).toFixed(0) + "%"} |`);
}

// ── t pareado de la media ──
const dif = B.pls.map((x, i) => x - A.pls[i]);
const PRUEBAS = 27 + 6 + 4 + 72;   // 9 anchuras×3 vistas + 6 esquina + 4 controles + 72 previas
console.log(`\n## La media: t pareado (mismos días, mismo mercado)\n`);
console.log(`| | valor |`);
console.log(`|---|---|`);
console.log(`| Δ$/operación | ${eur(media(dif))} |`);
console.log(`| t pareado | **${tStat(dif).toFixed(2)}** |`);
console.log(`| listón Bonferroni con ${PRUEBAS} pruebas | ${listonT(PRUEBAS)} |`);
console.log(`| ¿pasa? | ${Math.abs(tStat(dif)) >= listonT(PRUEBAS) ? "sí" : "**no**"} |`);
console.log(`\n(la media no es lo que se buscaba — se buscaba la COLA — pero si la media hubiera empeorado`);
console.log(` de forma significativa, la mejora de caída sería un trueque, no una mejora)`);

// ── BOOTSTRAP POR BLOQUES PAREADO sobre la CAÍDA ──
// Se corre contra las TRES alternativas, no sólo contra la candidata. Los controles de una
// variable ya enseñaron que la mejora venía de alejar y no de ensanchar; si no se les aplica
// el mismo listón que a la candidata, el listón deja de ser un listón y pasa a ser un adorno.
// La caída es UN número por serie. Sin esto, "baja un 17%" son dos observaciones, no una medida.
const BLOQUE = 20, REPS = 20000;
const n = A.pls.length, nb = Math.ceil(n / BLOQUE);
console.log(`\n## La cola: BOOTSTRAP POR BLOQUES PAREADO (${REPS.toLocaleString("es-ES")} mundos · bloques de ${BLOQUE} días)\n`);
console.log(`Se remuestrean los MISMOS bloques de días para todas las configuraciones, así que en cada`);
console.log(`mundo comparten el mercado. Bloques y no días sueltos porque la caída depende del ORDEN.`);
console.log(`Un 50% es "indistinguible de la de hoy"; hace falta bastante más para llamarlo mejora.\n`);
console.log(`| configuración | mundos con MENOS caída | mundos con MEJOR p5 | gana en LAS DOS | Δcaída mediana | intervalo 90% |`);
console.log(`|---|---|---|---|---|---|`);
for (const c of CFG.slice(1)) {
  const X = M.get(c.nombre);
  let ganaDD = 0, ganaP5 = 0, ganaAmbas = 0;
  const difDD = [];
  let semilla = 20260819;   // misma semilla para las tres: los mismos mundos, comparación limpia
  const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
  for (let r = 0; r < REPS; r++) {
    const ini = [], sA = [], sX = [];
    for (let k = 0; k < nb; k++) ini.push(Math.floor(rnd() * (n - BLOQUE + 1)));
    for (const i0 of ini) for (let j = 0; j < BLOQUE && sA.length < n; j++) { sA.push(A.pls[i0 + j]); sX.push(X.pls[i0 + j]); }
    const dA = caida(sA), dX = caida(sX);
    difDD.push(Math.abs(dX) - Math.abs(dA));
    const mejorDD = Math.abs(dX) < Math.abs(dA), mejorP5 = pct(sX, 0.05) > pct(sA, 0.05);
    if (mejorDD) ganaDD++;
    if (mejorP5) ganaP5++;
    if (mejorDD && mejorP5) ganaAmbas++;
  }
  console.log(`| ${c.nombre} | **${((ganaDD / REPS) * 100).toFixed(1)}%** | ${((ganaP5 / REPS) * 100).toFixed(1)}% | ${((ganaAmbas / REPS) * 100).toFixed(1)}% | ${eur(mediana(difDD))} | ${eur(pct(difDD, 0.05))} … ${eur(pct(difDD, 0.95))} |`);
}

// ── La cuenta ──
console.log(`\n## ¿Cabe en la cuenta? ($56.389 de valor · ${eur(EFECTIVO)} de efectivo · colateral = ancho completo × 100)\n`);
console.log(`| configuración | colateral MÁX/contrato | ¿cabe 1 con el efectivo? | peor racha a 1 contrato | ¿la racha cabe en el efectivo? |`);
console.log(`|---|---|---|---|---|`);
for (const c of CFG) {
  const m = M.get(c.nombre);
  console.log(`| ${c.nombre} | ${eur(m.colMax)} | ${m.colMax <= EFECTIVO ? "**sí**" : "no"} | ${eur(m.dd)} | ${Math.abs(m.dd) <= EFECTIVO ? "sí" : "**no**"} |`);
}

console.log(`\n## Lo que esta configuración NO arregla\n`);
console.log(`| | hoy (±25/50) | ±35/60 | |`);
console.log(`|---|---|---|---|`);
console.log(`| peor día | ${eur(A.peorDia)} | ${eur(B.peorDia)} | **${(((Math.abs(B.peorDia) - Math.abs(A.peorDia)) / Math.abs(A.peorDia)) * 100).toFixed(0)}% peor** — y es aritmética: el tope es el ancho |`);
console.log(`| percentil 1 | ${eur(A.p1)} | ${eur(B.p1)} | ${(((Math.abs(B.p1) - Math.abs(A.p1)) / Math.abs(A.p1)) * 100).toFixed(0)}% peor |`);
console.log(`| percentil 5 | ${eur(A.p5)} | ${eur(B.p5)} | ${(((Math.abs(B.p5) - Math.abs(A.p5)) / Math.abs(A.p5)) * 100).toFixed(0)}% |`);
console.log(`| colateral | ${eur(A.colMax)} | ${eur(B.colMax)} | ${eur(B.colMax - A.colMax)} más de poder de compra retenido |`);
