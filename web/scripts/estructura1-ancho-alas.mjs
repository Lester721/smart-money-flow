// ESTRUCTURA 1 · EL ANCHO DE LAS ALAS, MEDIDO CONTRA LA COLA (no contra la media)
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/estructura1-ancho-alas.mjs
//
// ═══ POR QUÉ ESTE MANDO Y NO OTRO ═════════════════════════════════════════════════════════
//
// Se han medido 17 filtros de régimen y 30 reglas de gestión. Todos contra la MEDIA, todos
// fallaron. El ancho de las alas es distinto: no es una apuesta sobre el futuro, es ARITMÉTICA.
//
//     pérdida máxima de un cóndor = (ancho de las alas − crédito) × 100
//
// Es lo ÚNICO de la estructura que acota la pérdida por diseño. No hay que acertar nada para
// que funcione. La pregunta no es "¿reduce la caída?" —claro que sí, por construcción— sino
// **A QUÉ PRECIO**: cuántos dólares de ingreso al año cuesta cada dólar de caída eliminado.
//
// ═══ EL PRECIO DE REFERENCIA ══════════════════════════════════════════════════════════════
//
// La estrategia base (±25 puntos, alas de 50) gana ~$18.800/año y carga una caída acumulada de
// $15.176. O sea: YA está pagando ~$1,24 de ingreso por cada dólar de caída que soporta.
//
// Estrechar las alas sólo es un buen negocio si compra la caída MÁS BARATA que eso. Si cuesta
// más de $1,24 por dólar, es peor que simplemente operar menos días de la estrategia entera.
// Ése es el listón, y está escrito antes de mirar los números.
//
// ═══ LAS TRES VISTAS, Y POR QUÉ HACEN FALTA LAS TRES ══════════════════════════════════════
//
//   A · UN CONTRATO      — lo que la cuenta de Lester ve de verdad. Un contrato de alas de 10
//                          arriesga $1.000 y uno de 75 arriesga $7.500: NO son la misma apuesta.
//   B · IGUAL COLATERAL  — se escala el nº de contratos hasta ocupar los mismos $5.000. Así
//                          todas las anchuras arriesgan lo mismo y se compara ESTRUCTURA.
//   C · IGUAL INGRESO    — se escala hasta que todas den los mismos $/año de la base, y se mira
//                          cuál lo consigue con menos cola. Es literalmente lo que pidió Lester:
//                          conservar el ingreso y partir la caída.
//
// ═══ REGLAS ══════════════════════════════════════════════════════════════════════════════
//
// · Entrada 11:00 ET. Nada posterior a las 11:00 entra en la decisión.
// · BID al vender, ASK al comprar. Las cuatro patas, horquilla entera. $0,03 por pata.
// · Liquidación contra el precio REAL del subyacente al cierre.
// · Colateral = ANCHO COMPLETO × 100, sin descontar el crédito. Comprobado por Lester en
//   pantalla el 2026-08-17 (alas de 50 → $5.000 de "Collateral" por contrato).
// · Ancho REAL, no nominal: la rejilla de strikes es de 5 puntos cerca del dinero pero se abre
//   lejos; se usa el ancho que sale de los strikes que existen y se audita la desviación.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00";
const COMM = 0.03;
const DIST = 25;                 // distancia de los strikes vendidos, la de la estrategia
const CAPITAL = 5000;            // colateral de referencia (el cóndor de alas de 50)
const EFECTIVO = 7977;           // efectivo libre de la cuenta, leído de la API el 2026-08-17
const ALAS = [10, 15, 20, 25, 30, 40, 50, 60, 75];
const BASE = 50;

// Pruebas declaradas: 9 anchuras × 3 vistas = 27 aquí. Pero los datos ya llevan encima 17
// filtros de régimen + 30 reglas de gestión + 25 celdas de la rejilla anterior. El listón se
// pone sobre el TOTAL acumulado, no sobre lo de hoy, que es como se cuela un falso positivo.
const PRUEBAS_HOY = ALAS.length * 3;
const PRUEBAS_TOTAL = PRUEBAS_HOY + 17 + 30 + 25;

/** Lee un CSV de cadena 0DTE: filas de la hora pedida + último precio real del subyacente. */
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
  return enHora.length ? { filas: enHora, cierre: spotFin, horaCierre: hFin } : null;
}

const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]; };
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
const caida = (pls) => { let a = 0, p = 0, w = 0; for (const x of pls) { a += x; p = Math.max(p, a); w = Math.min(w, a - p); } return w; };
const tStat = (v) => { const m = media(v), s = Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1)); return m / (s / Math.sqrt(v.length)); };

// ══════════════════════════════════════════════════════════════════════════════════════════
// 1 · CONSTRUCCIÓN
// ══════════════════════════════════════════════════════════════════════════════════════════
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const porAla = new Map(ALAS.map((a) => [a, []]));
const descartes = new Map(ALAS.map((a) => [a, { noConstruible: 0, creditoNoPositivo: 0, anchoTorcido: 0 }]));
let diasSinCadena = 0;
const diasCadena = [];
const desbordes = [];

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) { diasSinCadena++; continue; }
  const spot = C.filas[0].spot;
  if (!(spot > 0)) { diasSinCadena++; continue; }
  diasCadena.push(fecha);
  const S = C.cierre;
  const cC = cerca(C.filas, spot + DIST), pC = cerca(P.filas, spot - DIST);

  // EL DESBORDE: cuántos puntos se pasa el cierre del strike vendido. NO depende del ancho
  // (los strikes cortos son los mismos en las nueve filas), así que es el mecanismo puro:
  // el ancho sólo decide qué PARTE de ese desborde se paga.
  desbordes.push({ fecha, exceso: Math.max(S - cC.K, 0) + Math.max(pC.K - S, 0), lado: S > cC.K ? "call" : S < pC.K ? "put" : "" });

  for (const a of ALAS) {
    const d = descartes.get(a);
    const cL = cerca(C.filas, cC.K + a), pL = cerca(P.filas, pC.K - a);
    if (cL.K <= cC.K || pL.K >= pC.K) { d.noConstruible++; continue; }
    const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K, ancho = Math.max(anchoC, anchoP);
    // El ancho REAL tiene que parecerse al nominal; si la rejilla obliga a irse >30% del
    // objetivo, ese día no es una prueba de "alas de a", es otra cosa. Se cuenta y se descarta.
    if (Math.abs(anchoC - a) > Math.max(5, 0.3 * a) || Math.abs(anchoP - a) > Math.max(5, 0.3 * a)) { d.anchoTorcido++; continue; }
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    // Crédito ≤ 0 = pagar por asumir riesgo. Es observable a las 11:00, así que NO operar ese
    // día es una regla legítima, no un filtro con futuro dentro. Se cuenta cuántas veces pasa.
    if (!(cred > 0)) { d.creditoNoPositivo++; continue; }
    const pl = (cred - Math.min(Math.max(S - cC.K, 0), anchoC) - Math.min(Math.max(pC.K - S, 0), anchoP)) * 100 - 8 * COMM;
    porAla.get(a).push({
      fecha, pl, credito: cred * 100, colateral: ancho * 100,
      anchoReal: ancho, riesgo: (ancho - cred) * 100,
      tocado: S > cC.K || S < pC.K ? 1 : 0,
    });
  }
}

console.log(`\n# ESTRUCTURA 1 · EL ANCHO DE LAS ALAS CONTRA LA COLA`);
console.log(`\nSPXW 0DTE · entrada ${HORA} ET · strikes vendidos a ±${DIST} puntos · precios reales (bid/ask) · $${COMM}/pata`);
console.log(`${fechas.length} ficheros de cadena · ${diasCadena.length} con cadena y cierre usables · ${diasSinCadena} sin datos (se DICE, no se rellena)`);

// ── Radiografía ANTES de medir nada: caza campos muertos que se leerían como cero ──
//
// NO se radiografían `anchoReal` ni `colateral`: son CONSTANTES POR DISEÑO (el ancho es la
// variable de control del experimento, vale 50 o 55 según la rejilla de strikes). La radiografía
// las marcó como muertas la primera vez, y hacía bien en marcarlas —un campo sin variación no
// ordena nada— pero aquí la falta de variación es el propósito, no un hueco de datos. Van
// auditadas una a una en la tabla de "¿el ancho REAL es el que se pide?" justo debajo.
console.log(`\n## Radiografía de la celda base (alas de ${BASE})\n`);
radiografia(porAla.get(BASE).map((x) => ({ ...x })), ["pl", "credito", "riesgo"], `alas ${BASE}`);

// ── Validación: ¿reproduzco la línea base publicada? ──
const b = porAla.get(BASE);
console.log(`\n## Validación contra la línea base publicada\n`);
console.log(`| | medido aquí | publicado |`);
console.log(`|---|---|---|`);
console.log(`| días | ${b.length} | 653 |`);
console.log(`| $/operación | ${eur(media(b.map((x) => x.pl)))} | $74 |`);
console.log(`| acumulado | ${eur(suma(b.map((x) => x.pl)))} | $48.638 |`);
console.log(`| acierto | ${((b.filter((x) => x.pl > 0).length / b.length) * 100).toFixed(0)}% | 75% |`);
console.log(`| peor día | ${eur(Math.min(...b.map((x) => x.pl)))} | −$4.900 |`);
console.log(`| peor racha acumulada | ${eur(caida(b.map((x) => x.pl)))} | −$15.176 |`);
console.log(`| t | ${tStat(b.map((x) => x.pl)).toFixed(2)} | 1,70 |`);

// ── Auditoría de la rejilla de strikes: ¿el ancho real es el nominal? ──
console.log(`\n## ¿El ancho REAL es el que se pide? (la rejilla de strikes se abre lejos del dinero)\n`);
console.log(`| alas pedidas | n | ancho real medio | mediana | días descartados por ancho torcido | días sin crédito |`);
console.log(`|---|---|---|---|---|---|`);
for (const a of ALAS) {
  const v = porAla.get(a), d = descartes.get(a);
  console.log(`| ${a} | ${v.length} | ${media(v.map((x) => x.anchoReal)).toFixed(1)} | ${mediana(v.map((x) => x.anchoReal))} | ${d.anchoTorcido} | ${d.creditoNoPositivo} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// 2 · EL CONJUNTO COMÚN. Comparar anchuras sobre días distintos es comparar mercados distintos.
// ══════════════════════════════════════════════════════════════════════════════════════════
const cuenta = new Map();
for (const a of ALAS) for (const x of porAla.get(a)) cuenta.set(x.fecha, (cuenta.get(x.fecha) || 0) + 1);
const comunes = new Set([...cuenta].filter(([, n]) => n === ALAS.length).map(([f]) => f));
console.log(`\n**Conjunto común: ${comunes.size} días** en los que las ${ALAS.length} anchuras se pueden montar con crédito positivo.`);
console.log(`Todo lo que sigue se mide sobre esos mismos ${comunes.size} días, salvo donde se diga lo contrario.\n`);

const serie = new Map(ALAS.map((a) => [a, porAla.get(a).filter((x) => comunes.has(x.fecha))]));

function resumen(ops) {
  const pls = ops.map((x) => x.pl);
  const col = ops.map((x) => x.colateral);
  return {
    n: ops.length,
    alAno: suma(pls) / (ops.length / 252),
    porOp: media(pls),
    total: suma(pls),
    acierto: pls.filter((x) => x > 0).length / pls.length,
    peorDia: Math.min(...pls), p1: pct(pls, 0.01), p5: pct(pls, 0.05),
    dd: caida(pls),
    colMediano: mediana(col), colMax: Math.max(...col),
    credito: media(ops.map((x) => x.credito)),
    t: tStat(pls),
    pls,
  };
}
const R = new Map(ALAS.map((a) => [a, resumen(serie.get(a))]));
const base = R.get(BASE);
const PRECIO_BASE = base.alAno / Math.abs(base.dd);   // $/año de ingreso por cada $ de caída soportado

// ══════════════════════════════════════════════════════════════════════════════════════════
// A · UN CONTRATO
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n## A · UN CONTRATO — lo que la cuenta ve de verdad\n`);
console.log(`| alas | $/año | $/op | acierto | crédito medio | peor día | p1 | p5 | peor racha | colateral/contrato | t |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|---|`);
for (const a of ALAS) {
  const r = R.get(a);
  console.log(`| ${a}${a === BASE ? " (hoy)" : ""} | ${eur(r.alAno)} | ${eur(r.porOp)} | ${(r.acierto * 100).toFixed(0)}% | ${eur(r.credito)} | ${eur(r.peorDia)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.dd)} | ${eur(mediana(serie.get(a).map((x) => x.colateral)))} | ${r.t.toFixed(2)} |`);
}

console.log(`\n### La cifra que decide — $ de ingreso al año perdidos por cada $ de caída eliminado\n`);
console.log(`El listón está escrito antes de mirar: la estrategia base ya paga **${(1 / PRECIO_BASE).toFixed(2)} $ de ingreso por cada $ de caída** que carga.`);
console.log(`Comprar caída más barata que eso es un buen negocio; más cara, es peor que operar menos.\n`);
console.log(`| alas | $/año perdidos | caída eliminada | **precio por $ de caída** | peor día eliminado | **precio por $ de peor día** | ¿bate al listón? |`);
console.log(`|---|---|---|---|---|---|---|`);
const cambio = {};
for (const a of ALAS) {
  const r = R.get(a);
  const perd = base.alAno - r.alAno;
  const elimDD = Math.abs(base.dd) - Math.abs(r.dd);
  const elimPD = Math.abs(base.peorDia) - Math.abs(r.peorDia);
  const pDD = elimDD > 0 ? perd / elimDD : null;
  const pPD = elimPD > 0 ? perd / elimPD : null;
  cambio[a] = { perd, elimDD, elimPD, precioDD: pDD, precioPD: pPD };
  const veredicto = a === BASE ? "— (es la base)" : pDD == null ? "no elimina caída" : pDD < 1 / PRECIO_BASE ? "**SÍ**" : "no";
  console.log(`| ${a} | ${eur(perd)} | ${eur(elimDD)} | ${pDD == null ? "—" : "$" + pDD.toFixed(2)} | ${eur(elimPD)} | ${pPD == null ? "—" : "$" + pPD.toFixed(2)} | ${veredicto} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// B · IGUAL COLATERAL — quita el efecto tamaño y deja ver la estructura
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n## B · IGUAL COLATERAL (${eur(CAPITAL)} en todas las anchuras · contratos fraccionarios, es una comparación no un plan)\n`);
console.log(`| alas | contratos | $/año | peor día | p1 | p5 | peor racha | $/año por $ de caída |`);
console.log(`|---|---|---|---|---|---|---|---|`);
const escB = new Map();
for (const a of ALAS) {
  const r = R.get(a), f = CAPITAL / mediana(serie.get(a).map((x) => x.colateral));
  const e = { f, alAno: r.alAno * f, peorDia: r.peorDia * f, p1: r.p1 * f, p5: r.p5 * f, dd: r.dd * f };
  escB.set(a, e);
  console.log(`| ${a} | ${f.toFixed(2)} | ${eur(e.alAno)} | ${eur(e.peorDia)} | ${eur(e.p1)} | ${eur(e.p5)} | ${eur(e.dd)} | ${(e.alAno / Math.abs(e.dd)).toFixed(2)} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// C · IGUAL INGRESO — literalmente lo que pidió Lester: mismo dinero, ¿cuál trae menos cola?
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n## C · IGUAL INGRESO (todas escaladas a los ${eur(base.alAno)}/año de la base)\n`);
console.log(`| alas | contratos | colateral que exige | peor día | p1 | p5 | **peor racha** | vs base |`);
console.log(`|---|---|---|---|---|---|---|---|`);
const escC = new Map();
for (const a of ALAS) {
  const r = R.get(a), f = base.alAno / r.alAno;
  const e = { f, peorDia: r.peorDia * f, p1: r.p1 * f, p5: r.p5 * f, dd: r.dd * f, col: mediana(serie.get(a).map((x) => x.colateral)) * f };
  escC.set(a, e);
  const mejora = f > 0 ? ((Math.abs(base.dd) - Math.abs(e.dd)) / Math.abs(base.dd)) * 100 : NaN;
  console.log(`| ${a} | ${f > 0 ? f.toFixed(2) : "imposible (pierde dinero)"} | ${f > 0 ? eur(e.col) : "—"} | ${f > 0 ? eur(e.peorDia) : "—"} | ${f > 0 ? eur(e.p1) : "—"} | ${f > 0 ? eur(e.p5) : "—"} | ${f > 0 ? eur(e.dd) : "—"} | ${f > 0 ? (mejora >= 0 ? "−" : "+") + Math.abs(mejora).toFixed(0) + "% de caída" : "—"} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// D · ¿AGUANTA EN LOS TRES TERCIOS? Un óptimo que sólo vive en un tercio es sobreajuste.
// ══════════════════════════════════════════════════════════════════════════════════════════
const dias = [...comunes].sort();
const k3 = Math.floor(dias.length / 3);
const corte = [dias[k3], dias[2 * k3]];
console.log(`\n## D · LOS TRES TERCIOS (cortes en ${corte[0]} y ${corte[1]}) — un contrato\n`);
console.log(`| alas | $/año T1 | T2 | T3 | signo | caída T1 | T2 | T3 |`);
console.log(`|---|---|---|---|---|---|---|---|`);
const tercios = {};
for (const a of ALAS) {
  const s = serie.get(a);
  const g = [s.slice(0, k3), s.slice(k3, 2 * k3), s.slice(2 * k3)];
  const anos = g.map((x) => suma(x.map((y) => y.pl)) / (x.length / 252));
  const dds = g.map((x) => caida(x.map((y) => y.pl)));
  tercios[a] = { anos, dds };
  console.log(`| ${a} | ${anos.map(eur).join(" | ")} | ${anos.map((x) => (x > 0 ? "+" : "−")).join("")} | ${dds.map(eur).join(" | ")} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// E · ¿ES DIFERENCIA DE VERDAD? t pareado contra la base, sobre los mismos días
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n## E · Diferencia pareada contra las alas de ${BASE} (mismos días)\n`);
console.log(`| alas | Δ$/op | t pareado | listón Bonferroni |`);
console.log(`|---|---|---|---|`);
const LISTON = listonT(PRUEBAS_TOTAL);
for (const a of ALAS) {
  if (a === BASE) continue;
  const d = serie.get(a).map((x, i) => x.pl - serie.get(BASE)[i].pl);
  console.log(`| ${a} | ${eur(media(d))} | ${tStat(d).toFixed(2)} | ${LISTON} |`);
}
console.log(`\nPruebas declaradas: ${PRUEBAS_HOY} hoy (9 anchuras × 3 vistas) + 72 ya hechas sobre estos mismos datos = **${PRUEBAS_TOTAL}**.`);
console.log(`Listón de Bonferroni: |t| ≥ **${LISTON}** (con ${PRUEBAS_HOY} pruebas sería ${listonT(PRUEBAS_HOY)}).`);

// ══════════════════════════════════════════════════════════════════════════════════════════
// F · LA CUENTA REAL — contratos enteros, colateral de ancho completo, efectivo de $7.977
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n## F · ¿QUÉ CABE EN LA CUENTA? ($56.389 de valor · ${eur(EFECTIVO)} de efectivo · colateral = ancho completo × 100)\n`);
console.log(`| alas | colateral máx./contrato | ¿cabe 1 con el efectivo? | contratos que caben | $/año a ese tamaño | peor día | peor racha | ¿la racha cabe en el efectivo? |`);
console.log(`|---|---|---|---|---|---|---|---|`);
let masAncha = null;
for (const a of ALAS) {
  const r = R.get(a);
  const colMax = Math.max(...serie.get(a).map((x) => x.colateral));
  const cabe = colMax <= EFECTIVO;
  if (cabe) masAncha = a;
  const n = Math.floor(EFECTIVO / colMax);
  console.log(`| ${a} | ${eur(colMax)} | ${cabe ? "**sí**" : "no"} | ${n} | ${eur(r.alAno * Math.max(n, 0))} | ${eur(r.peorDia * Math.max(n, 1))} | ${eur(r.dd * Math.max(n, 1))} | ${Math.abs(r.dd) <= EFECTIVO ? "**sí**" : "no — sale de margen contra HOOD"} |`);
}
console.log(`\n**La más ancha que cabe con ${eur(EFECTIVO)} de efectivo: alas de ${masAncha} puntos** (colateral máximo ${eur(Math.max(...serie.get(masAncha).map((x) => x.colateral)))}).`);
console.log(`Ojo: el colateral sale del PODER DE COMPRA ($73.874) y ahí cabe cualquiera de las nueve.`);
console.log(`Lo que sale de EFECTIVO son las PÉRDIDAS. Ése es el cuello de botella de verdad.`);

// ── El ancho más ancho cuya peor racha cabe en el efectivo sin pedir margen ──
const sinMargen = ALAS.filter((a) => Math.abs(R.get(a).dd) <= EFECTIVO);
console.log(`\n**Anchuras cuya peor racha histórica cabe entera en el efectivo (sin préstamo de margen): ${sinMargen.length ? sinMargen.join(", ") : "ninguna"}.**`);

// ══════════════════════════════════════════════════════════════════════════════════════════
// G · EL MECANISMO — por qué estrechar sale caro. No es estadística, es geometría.
//
// Los strikes VENDIDOS son los mismos en las nueve filas (±25 puntos). Así que el ancho no
// cambia CUÁNTAS veces se rompe el cóndor: cambia QUÉ PARTE del ala se come cada rotura.
// ══════════════════════════════════════════════════════════════════════════════════════════
const desComunes = desbordes.filter((x) => comunes.has(x.fecha));
const rotos = desComunes.filter((x) => x.exceso > 0);
console.log(`\n## G · EL MECANISMO — el desborde, que es el mismo para las nueve anchuras\n`);
console.log(`De ${desComunes.length} días, el cierre se pasó de un strike vendido en **${rotos.length} (${((rotos.length / desComunes.length) * 100).toFixed(0)}%)**.`);
console.log(`Esa frecuencia NO la toca el ancho de las alas: los strikes cortos son idénticos en las nueve filas.\n`);
const ex = rotos.map((x) => x.exceso);
console.log(`| percentil del desborde | p10 | p25 | **mediana** | p75 | p90 | máximo |`);
console.log(`|---|---|---|---|---|---|---|`);
console.log(`| puntos por encima del strike vendido | ${pct(ex, 0.10).toFixed(0)} | ${pct(ex, 0.25).toFixed(0)} | **${pct(ex, 0.50).toFixed(0)}** | ${pct(ex, 0.75).toFixed(0)} | ${pct(ex, 0.90).toFixed(0)} | ${Math.max(...ex).toFixed(0)} |`);
console.log(`\n### Qué fracción del ala se come el desborde típico\n`);
console.log(`| alas | roturas que se comen el ala ENTERA (pérdida máxima) | fracción media del ala consumida |`);
console.log(`|---|---|---|`);
for (const a of ALAS) {
  const llenas = rotos.filter((x) => x.exceso >= a).length;
  const frac = media(rotos.map((x) => Math.min(x.exceso, a) / a));
  console.log(`| ${a} | ${llenas} de ${rotos.length} (**${((llenas / rotos.length) * 100).toFixed(0)}%**) | ${(frac * 100).toFixed(0)}% |`);
}
console.log(`\nAhí está el precio: con alas de 10 **casi toda rotura es pérdida máxima**; con alas de 75 la rotura`);
console.log(`media se come una parte pequeña. El ala estrecha cobra más prima por dólar de colateral —`);
const cr = ALAS.map((a) => ({ a, r: (R.get(a).credito / (R.get(a).colMediano || mediana(serie.get(a).map((x) => x.colateral)))) * 100 }));
console.log(`crédito/colateral: ${cr.map((x) => `alas ${x.a} → ${x.r.toFixed(1)}%`).join(" · ")} —`);
console.log(`pero paga el siniestro entero cada vez. La prima extra no compensa la severidad extra.`);

// ══════════════════════════════════════════════════════════════════════════════════════════
// H · ¿ES CRESTA O ES PICO? La eficiencia a igual colateral, tercio a tercio.
//     Un orden que se mantiene en los tres tercios y en las nueve anchuras es un mecanismo.
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n## H · ¿MECANISMO O SUERTE? — $/año por $ de caída, a igual colateral, tercio a tercio\n`);
console.log(`| alas | período entero | T1 | T2 | T3 |`);
console.log(`|---|---|---|---|---|`);
const efT = {};
for (const a of ALAS) {
  const s = serie.get(a), f = CAPITAL / mediana(s.map((x) => x.colateral));
  const g = [s.slice(0, k3), s.slice(k3, 2 * k3), s.slice(2 * k3)];
  const v = g.map((x) => {
    const pls = x.map((y) => y.pl * f);
    const d = Math.abs(caida(pls));
    return d > 0 ? suma(pls) / (x.length / 252) / d : NaN;
  });
  efT[a] = v;
  console.log(`| ${a} | ${(escB.get(a).alAno / Math.abs(escB.get(a).dd)).toFixed(2)} | ${v.map((x) => x.toFixed(2)).join(" | ")} |`);
}
const mono = (v) => v.every((x, i) => i === 0 || x >= v[i - 1]);
console.log(`\n¿Monótono creciente con el ancho? entero: **${mono(ALAS.map((a) => escB.get(a).alAno / Math.abs(escB.get(a).dd))) ? "SÍ" : "no"}** · ` +
  [0, 1, 2].map((i) => `T${i + 1}: ${mono(ALAS.map((a) => efT[a][i])) ? "sí" : "no"}`).join(" · "));

// ══════════════════════════════════════════════════════════════════════════════════════════
// I · EL HUECO QUE NADIE HA MEDIDO — alas ANCHAS con strikes vendidos MÁS LEJOS.
//
// La rejilla anterior (anatomia-alas.mjs) barrió distancias 25-50 × alas 10-50. Este barrido
// fijó la distancia en 25 y llegó hasta alas de 75. **La esquina de arriba a la derecha —
// lejos Y ancho— está sin medir**, y es justo donde los dos efectos empujan a favor:
// alejar baja la FRECUENCIA de rotura, ensanchar baja la SEVERIDAD de cada rotura.
// EXPLORATORIO: 6 celdas más, contadas en el listón.
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n## I · EXPLORATORIO — la esquina sin medir: strikes lejos × alas anchas\n`);
const ESQ = [[25, 50], [25, 75], [35, 60], [35, 75], [50, 60], [50, 75]];
const esqDatos = new Map(ESQ.map((k) => [k.join("-"), []]));
for (const fecha of diasCadena) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) continue;
  const spot = C.filas[0].spot, S = C.cierre;
  for (const [d, a] of ESQ) {
    const cC = cerca(C.filas, spot + d), pC = cerca(P.filas, spot - d);
    const cL = cerca(C.filas, cC.K + a), pL = cerca(P.filas, pC.K - a);
    if (cL.K <= cC.K || pL.K >= pC.K) continue;
    const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K, ancho = Math.max(anchoC, anchoP);
    if (Math.abs(anchoC - a) > Math.max(5, 0.3 * a) || Math.abs(anchoP - a) > Math.max(5, 0.3 * a)) continue;
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) continue;
    const pl = (cred - Math.min(Math.max(S - cC.K, 0), anchoC) - Math.min(Math.max(pC.K - S, 0), anchoP)) * 100 - 8 * COMM;
    esqDatos.get(`${d}-${a}`).push({ fecha, pl, colateral: ancho * 100 });
  }
}
console.log(`| distancia / alas | n | $/año | peor día | p1 | p5 | peor racha | colateral | vs base: precio por $ de caída |`);
console.log(`|---|---|---|---|---|---|---|---|---|`);
const esqRes = {};
for (const [d, a] of ESQ) {
  const v = esqDatos.get(`${d}-${a}`);
  if (v.length < 200) { console.log(`| ±${d} / ${a} | sólo ${v.length} días — no llega al mínimo de muestra |`); continue; }
  const pls = v.map((x) => x.pl), alAno = suma(pls) / (v.length / 252), dd = caida(pls);
  const perd = base.alAno - alAno, elim = Math.abs(base.dd) - Math.abs(dd);
  esqRes[`${d}-${a}`] = { n: v.length, alAno, peorDia: Math.min(...pls), p1: pct(pls, 0.01), p5: pct(pls, 0.05), dd, col: mediana(v.map((x) => x.colateral)), t: tStat(pls) };
  console.log(`| ±${d} / ${a} | ${v.length} | ${eur(alAno)} | ${eur(Math.min(...pls))} | ${eur(pct(pls, 0.01))} | ${eur(pct(pls, 0.05))} | ${eur(dd)} | ${eur(mediana(v.map((x) => x.colateral)))} | ${elim > 0 ? (perd <= 0 ? "**gana ingreso Y quita caída**" : "$" + (perd / elim).toFixed(2)) : "no quita caída"} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// J · LA ESQUINA, TERCIO A TERCIO. Un candidato salido de un barrido con el resultado a la
//     vista no es un hallazgo hasta que aguanta partido en tres. Y aquí se mide lo que Lester
//     pidió —la CAÍDA— tercio a tercio, no la media.
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n## J · LA ESQUINA SOMETIDA A LOS TRES TERCIOS\n`);
console.log(`| distancia / alas | $/año T1 | T2 | T3 | signo | caída T1 | T2 | T3 | ¿corta la caída en los 3? |`);
console.log(`|---|---|---|---|---|---|---|---|---|`);
const baseSerie = porAla.get(BASE);
const bg = [baseSerie.slice(0, 217), baseSerie.slice(217, 435), baseSerie.slice(435)];
const baseDD = bg.map((x) => caida(x.map((y) => y.pl)));
const baseAno = bg.map((x) => suma(x.map((y) => y.pl)) / (x.length / 252));
console.log(`| ±25 / 50 (la base) | ${baseAno.map(eur).join(" | ")} | ${baseAno.map((x) => (x > 0 ? "+" : "−")).join("")} | ${baseDD.map(eur).join(" | ")} | — |`);
const esqTercios = {};
for (const [d, a] of ESQ) {
  const v = esqDatos.get(`${d}-${a}`);
  if (v.length < 200 || (d === 25 && a === 50)) continue;
  const t3 = Math.floor(v.length / 3);
  const g = [v.slice(0, t3), v.slice(t3, 2 * t3), v.slice(2 * t3)];
  const anos = g.map((x) => suma(x.map((y) => y.pl)) / (x.length / 252));
  const dds = g.map((x) => caida(x.map((y) => y.pl)));
  const corta = dds.map((x, i) => Math.abs(x) < Math.abs(baseDD[i]));
  esqTercios[`${d}-${a}`] = { anos, dds, corta };
  console.log(`| ±${d} / ${a} | ${anos.map(eur).join(" | ")} | ${anos.map((x) => (x > 0 ? "+" : "−")).join("")} | ${dds.map(eur).join(" | ")} | ${corta.every(Boolean) ? "**SÍ, los 3**" : corta.filter(Boolean).length + " de 3"} |`);
}

// ── Aritmética: el "peor día" NO es una medición, es la definición del ancho ──
console.log(`\n## Aviso sobre la columna "peor día"\n`);
console.log(`| alas | pérdida máxima por diseño (ancho×100 − crédito mín.) | peor día medido | ¿coinciden? |`);
console.log(`|---|---|---|---|`);
for (const a of ALAS) {
  const s = serie.get(a);
  // La cota hay que calcularla DÍA A DÍA y quedarse con la peor. El ancho más grande y el
  // crédito más pequeño no caen el mismo día: mezclarlos daba una cota imposible, y un "no
  // coinciden" que era un fallo mío de aritmética, no un desajuste de los datos.
  const teor = -Math.max(...s.map((x) => x.anchoReal * 100 - x.credito + 8 * COMM));
  const peor = R.get(a).peorDia;
  console.log(`| ${a} | ${eur(teor)} | ${eur(peor)} | ${Math.abs(teor - peor) < 1 ? "**exacto**" : eur(peor - teor) + " de holgura"} |`);
}
console.log(`\nEl peor día de cada anchura ES su colateral menos el crédito de ese día. Comparar anchuras`);
console.log(`por el peor día es comparar la definición, no el comportamiento. Las métricas de cola que`);
console.log(`SÍ dicen algo son la **caída acumulada** y los **percentiles**, que dependen de cuántas`);
console.log(`veces y con qué profundidad se rompe — no sólo de dónde está el tope.`);

writeFileSync("scripts/estructura1-ancho-alas.json", JSON.stringify({
  desborde: { rotos: rotos.length, de: desComunes.length, p50: pct(ex, 0.5), p90: pct(ex, 0.9), max: Math.max(...ex) },
  eficienciaPorTercio: efT, esquina: esqRes, esquinaTercios: esqTercios,
  dias: comunes.size, periodo: [dias[0], dias[dias.length - 1]],
  precioBaseDelRiesgo: 1 / PRECIO_BASE,
  unContrato: Object.fromEntries(ALAS.map((a) => [a, { ...R.get(a), pls: undefined }])),
  cambio, igualColateral: Object.fromEntries(escB), igualIngreso: Object.fromEntries(escC),
  tercios, masAnchaQueCabe: masAncha, liston: LISTON, pruebas: PRUEBAS_TOTAL,
  descartes: Object.fromEntries(ALAS.map((a) => [a, descartes.get(a)])),
}, null, 2));
console.log(`\n(detalle en scripts/estructura1-ancho-alas.json)`);
