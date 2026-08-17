// LA HORA DE ENTRADA DEL CÓNDOR 0DTE — hoy son las 11:00 porque sí
//
// Uso: node --max-old-space-size=8192 scripts/opt-hora.mjs
//      (LIMITE=40 para una pasada corta de prueba)
//
// ═══ CRITERIO ESCRITO ANTES DE CORRER ═════════════════════════════════════════════════════
//
// PREGUNTA: ¿hay una hora de entrada mejor que las 11:00, y aguanta en los tres años?
//
// PRUEBAS DECLARADAS: 23 horas × 3 distancias = 69. El listón de |t| sale de listonT(69) de
// lib/barreraHallazgos.ts (Bonferroni). No se declara "una prueba" a posteriori.
//
// PARA QUE UNA HORA CUENTE COMO MEJOR, LAS CINCO:
//   1. P&L medio por operación superior al de las 11:00 en su misma distancia.
//   2. POSITIVA EN LOS TRES AÑOS (2024, 2025, 2026). Una hora que sólo va en 2025 no vale.
//   3. POSITIVA EN LOS TRES TERCIOS de tiempo (criba 3 de la barrera).
//   4. |t| de la media contra cero por encima del listón de Bonferroni de 69 pruebas.
//   5. La ventaja sobre las 11:00 SOBREVIVE A PUNTO-MEDIO-A-PUNTO-MEDIO. Si sólo existe con
//      bid/ask, la "ventaja" era horquilla —peaje— y no elección de hora. (Trampa 4.)
//
// ═══ CÓMO SE MIDE ═════════════════════════════════════════════════════════════════════════
//
// 653 días de SPXW 0DTE (2024-01-02 a 2026-08-10), cadenas cada 5 min con bid/ask REALES.
// Se vende call a +D y put a −D del spot de ESE MOMENTO, se compran las alas 50 puntos más
// allá. Se COBRA EL BID de lo que se vende y se PAGA EL ASK de lo que se compra, las cuatro
// patas. Se liquida contra el precio real del subyacente al cierre. Comisión 8 × $0,03.
//
// NADA de lo que entra en la decisión es futuro: el spot y los precios son los de la hora de
// entrada. Lo único posterior es la liquidación, que es el resultado.
//
// DÍAS NO OPERABLES: si el crédito sale ≤ 0 la operación no se pone. No se BORRA el día —se
// cuenta como $0 y se reporta aparte cuántos son. Tirarlos silenciosamente convertiría a las
// horas tardías (donde la prima ya no existe) en falsas ganadoras por selección de muestra.
//
// AUSENTE = CERO (trampa 3): aquí no aplica por omisión, porque la cadena trae las 259 filas
// de strikes en cada foto y el `ask` nunca es cero; se verifica y se reporta abajo.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos.ts";

const DIR = "scripts/cache-theta/gex-2026";
const ALA = 50;            // ancho de alas, en puntos — fijo, es el otro barrido
const COMM = 0.03;         // por contrato, Robinhood
const DISTANCIAS = [20, 25, 35];
const REFERENCIA = "11:00";

// 09:35 (primera foto usable: la de 09:30 trae el subyacente a 0) y luego cada 15 min
// hasta las 15:00. 23 horas.
const HORAS = ["09:35"];
for (let m = 9 * 60 + 45; m <= 15 * 60; m += 15) {
  HORAS.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
}
const SET_HORAS = new Set(HORAS);
const PRUEBAS = HORAS.length * DISTANCIAS.length;
const LISTON = listonT(PRUEBAS);

// ── índices de columna (se verifican contra la cabecera de cada fichero) ──
const COLS = ["strike", "timestamp", "bid", "implied_vol", "ask", "underlying_price"];

/** Lanza si una columna no existe: un campo que no existe se lee como 0 y no da error. */
function indices(cabecera) {
  const cab = cabecera.split(",").map((x) => x.replace(/"/g, "").trim());
  const ix = {};
  for (const c of COLS) {
    const i = cab.indexOf(c);
    if (i < 0) throw new Error(`columna ausente en la cadena: ${c} — cabecera: ${cab.join("|")}`);
    ix[c] = i;
  }
  return ix;
}

/**
 * La 'T' del timestamp ISO, no cualquiera. ⚠️ `"PUT"` LLEVA UNA T y va antes en la línea: con
 * `indexOf("T")` a secas las puts salían vacías, sin error, y el barrido entero medía cero.
 * La del timestamp va precedida de un dígito (…2024-01-02T09:35…) y lleva ':' dos sitios después.
 */
function horaDeLinea(L) {
  let t = L.indexOf("T");
  while (t > 0) {
    const p = L.charCodeAt(t - 1);
    if (p >= 48 && p <= 57 && L[t + 3] === ":" && L[t + 6] === ":") return L.substring(t + 1, t + 6);
    t = L.indexOf("T", t + 1);
  }
  return null;
}

/**
 * Una pasada por el fichero del día: saca las filas de las 23 horas objetivo y el cierre.
 */
function leerDia(fecha, right, diag) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  if (lin.length < 3) return null;
  const ix = indices(lin[0]);

  const porHora = new Map();
  let cierre = 0, horaCierre = "";
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j];
    if (L.length < 40) continue;
    const hhmm = horaDeLinea(L);
    if (hhmm === null) { diag.sinHora++; continue; }

    // Cierre: última foto con subyacente válido a partir de las 15:55. underlying_price es
    // la ÚLTIMA columna.
    if (hhmm >= "15:55") {
      const s = +L.substring(L.lastIndexOf(",") + 1);
      if (s > 0 && hhmm >= horaCierre) { horaCierre = hhmm; cierre = s; }
    }
    if (!SET_HORAS.has(hhmm)) continue;

    const c = L.split(",");
    const K = +c[ix.strike], bid = +c[ix.bid], ask = +c[ix.ask];
    const iv = +c[ix.implied_vol], spot = +c[ix.underlying_price];
    diag.filas++;
    if (!(ask > 0)) { diag.askCero++; continue; }
    if (!(K > 0) || !(bid >= 0)) { diag.malas++; continue; }
    if (!(spot > 0)) { diag.spotCero++; continue; }
    let a = porHora.get(hhmm);
    if (!a) porHora.set(hhmm, (a = []));
    a.push({ K, bid, ask, iv, spot });
  }
  // FALLAR CERRADO: si un fichero existe y no ha dado NI UNA fila en las horas objetivo, es que
  // el parseo está roto, no que "no hay datos". Un vacío silencioso se lee como "no había nada".
  if (porHora.size === 0) throw new Error(`${f}: ${lin.length} líneas y CERO filas en las horas objetivo — parseo roto`);
  return { porHora, cierre, horaCierre };
}

/** La opción cuyo strike está más cerca del objetivo. */
const cerca = (filas, obj) => filas.reduce((a, b) => (Math.abs(b.K - obj) < Math.abs(a.K - obj) ? b : a));

// ══════════════════════════════════════════════════════════════════════════════════════════
const fechas = [...new Set(readdirSync(DIR)
  .map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort()
  .slice(0, Number(process.env.LIMITE || 1e9));

console.log(`\n## HORA DE ENTRADA DEL CÓNDOR 0DTE · SPXW · ${fechas.length} días · alas ${ALA} puntos`);
console.log(`   ${HORAS.length} horas × ${DISTANCIAS.length} distancias = ${PRUEBAS} pruebas · listón de |t| = ${LISTON}\n`);

const clave = (h, d) => `${h}|${d}`;
const res = new Map();
for (const h of HORAS) for (const d of DISTANCIAS) res.set(clave(h, d), []);

const diag = { filas: 0, askCero: 0, malas: 0, spotCero: 0, sinHora: 0 };
const horasCierre = new Map();
let sinCierre = 0, sinDatos = 0, diasOK = 0;
const t0 = Date.now();

for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  const C = leerDia(fecha, "C", diag), P = leerDia(fecha, "P", diag);
  if (!C || !P) { sinDatos++; continue; }
  if (!(C.cierre > 0)) { sinCierre++; continue; }
  horasCierre.set(C.horaCierre, (horasCierre.get(C.horaCierre) || 0) + 1);
  diasOK++;
  const S = C.cierre;

  for (const h of HORAS) {
    const fc = C.porHora.get(h), fp = P.porHora.get(h);
    if (!fc || !fp || fc.length < 20 || fp.length < 20) continue;
    const spot = fc[0].spot;
    const atm = cerca(fc, spot);

    for (const d of DISTANCIAS) {
      const cCorta = cerca(fc, spot + d), pCorta = cerca(fp, spot - d);
      const cLarga = cerca(fc, cCorta.K + ALA), pLarga = cerca(fp, pCorta.K - ALA);
      if (cLarga.K <= cCorta.K || pLarga.K >= pCorta.K) continue;

      // REAL: se cobra el bid, se paga el ask.
      const credito = cCorta.bid + pCorta.bid - cLarga.ask - pLarga.ask;
      // PUNTO MEDIO: el mismo cóndor sin horquilla. La diferencia ES el peaje.
      const mid = (x) => (x.bid + x.ask) / 2;
      const creditoMid = mid(cCorta) + mid(pCorta) - mid(cLarga) - mid(pLarga);

      const anchoC = cLarga.K - cCorta.K, anchoP = pCorta.K - pLarga.K;
      const perdCall = Math.min(Math.max(S - cCorta.K, 0), anchoC);
      const perdPut = Math.min(Math.max(pCorta.K - S, 0), anchoP);
      const operable = credito > 0;
      const pl = operable ? (credito - perdCall - perdPut) * 100 - 8 * COMM : 0;
      const plMid = creditoMid > 0 ? (creditoMid - perdCall - perdPut) * 100 - 8 * COMM : 0;

      res.get(clave(h, d)).push({
        fecha, año: fecha.slice(0, 4), operable,
        credito: credito * 100, creditoMid: creditoMid * 100,
        pl, plMid, gana: operable && pl > 0,
        riesgo: (Math.max(anchoC, anchoP) - credito) * 100,
        ala: (anchoC + anchoP) / 2, iv: atm.iv, spot,
      });
    }
  }
  if ((i + 1) % 100 === 0) {
    const s = (Date.now() - t0) / 1000;
    console.log(`   … ${i + 1}/${fechas.length} días · ${s.toFixed(0)}s · quedan ~${((s / (i + 1)) * (fechas.length - i - 1)).toFixed(0)}s`);
  }
}

// ── RADIOGRAFÍA: si el dato está roto, esto lo canta antes de mirar ningún resultado ──
console.log(`\n── RADIOGRAFÍA DEL DATO ──`);
console.log(`días con cadena C y P y cierre válido: ${diasOK}   sin ficheros: ${sinDatos}   sin cierre: ${sinCierre}`);
console.log(`filas leídas en las horas objetivo: ${diag.filas.toLocaleString("es-ES")}`);
console.log(`  ask ≤ 0 (descartadas): ${diag.askCero}   strike/bid inválidos: ${diag.malas}   spot = 0: ${diag.spotCero}   sin hora legible: ${diag.sinHora}`);
console.log(`hora del cierre usado: ${[...horasCierre.entries()].sort().map(([h, n]) => `${h}=${n}`).join("  ")}`);
if (diag.filas === 0) throw new Error("no se leyó ninguna fila — el parseo está roto");
{ // el cóndor de referencia tiene que reproducir lo ya medido: 11:00 ±25 ≈ $74 y 75% de acierto
  const v = res.get(clave("11:00", 25)).filter((x) => x.operable);
  const m = v.reduce((a, b) => a + b.pl, 0) / v.length;
  const ac = v.filter((x) => x.gana).length / v.length;
  console.log(`CONTROL — 11:00 ±25 (lo ya medido: n≈653, P&L medio ≈ $74, acierto ≈ 75%):  n=${v.length}  P&L medio $${m.toFixed(0)}  acierto ${(ac * 100).toFixed(0)}%`);
}

const AÑOS = ["2024", "2025", "2026"];
const suma = (v) => v.reduce((a, b) => a + b, 0);
const med = (v) => (v.length ? suma(v) / v.length : NaN);
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
const eur = (x) => (Number.isFinite(x) ? `$${Math.round(x).toLocaleString("es-ES")}` : "—");
/** t de una muestra contra cero. */
function tUna(v) {
  if (v.length < 3) return 0;
  const m = med(v), s2 = suma(v.map((x) => (x - m) ** 2)) / (v.length - 1);
  return s2 > 0 ? m / Math.sqrt(s2 / v.length) : 0;
}

const AÑOS_CAL = fechas.length / 252; // años de calendario cubiertos

function resumen(h, d) {
  const v = res.get(clave(h, d));
  if (!v.length) return null;
  const op = v.filter((x) => x.operable);
  const pls = op.map((x) => x.pl);
  const porAño = Object.fromEntries(AÑOS.map((a) => {
    const g = op.filter((x) => x.año === a);
    return [a, g.length ? { n: g.length, medio: med(g.map((x) => x.pl)), total: suma(g.map((x) => x.pl)),
      acierto: g.filter((x) => x.gana).length / g.length } : null];
  }));
  // Tercios de tiempo sobre las operables, ordenadas por fecha.
  const ord = [...op].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const k = Math.floor(ord.length / 3);
  const tercios = k >= 3 ? [0, 1, 2].map((i) => {
    const g = i < 2 ? ord.slice(i * k, (i + 1) * k) : ord.slice(2 * k);
    return { desde: g[0].fecha, hasta: g[g.length - 1].fecha, n: g.length, medio: med(g.map((x) => x.pl)) };
  }) : [];
  return {
    hora: h, dist: d, nDias: v.length, nOp: op.length, noOperables: v.length - op.length,
    credMed: mediana(op.map((x) => x.credito)), credMedio: med(op.map((x) => x.credito)),
    acierto: op.length ? op.filter((x) => x.gana).length / op.length : NaN,
    plMedio: med(pls), plTotal: suma(pls),
    plMedioTodos: med(v.map((x) => x.pl)),        // días no operables cuentan $0
    porAño: suma(v.map((x) => x.pl)) / AÑOS_CAL,  // $/año sobre el calendario completo
    peor: pls.length ? Math.min(...pls) : NaN,
    p5: (() => { const s = [...pls].sort((a, b) => a - b); return s[Math.floor(s.length * 0.05)]; })(),
    t: tUna(pls),
    plMedioMid: med(op.map((x) => x.plMid)), credMedioMid: med(op.map((x) => x.creditoMid)),
    ala: med(op.map((x) => x.ala)), iv: med(op.map((x) => x.iv)),
    años: porAño, tercios,
  };
}

const R = new Map();
for (const h of HORAS) for (const d of DISTANCIAS) { const r = resumen(h, d); if (r) R.set(clave(h, d), r); }

const pct = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(0)}%` : "—");

for (const d of DISTANCIAS) {
  console.log(`\n\n════ ±${d} PUNTOS · alas ${ALA} ═══════════════════════════════════════════════════════════`);
  console.log(`hora     n   no-op  crédito  acierto  P&L medio   P&L/día  $/año(*)     peor   pct5     |t|   IVatm  ala`);
  for (const h of HORAS) {
    const r = R.get(clave(h, d)); if (!r) continue;
    const marca = h === REFERENCIA ? " ←hoy" : "";
    console.log(
      `${h}  ${String(r.nOp).padStart(4)}  ${String(r.noOperables).padStart(5)}  ` +
      `${eur(r.credMed).padStart(7)}  ${pct(r.acierto).padStart(6)}  ${eur(r.plMedio).padStart(8)}  ` +
      `${eur(r.plMedioTodos).padStart(8)}  ${eur(r.porAño).padStart(8)}  ${eur(r.peor).padStart(8)}  ` +
      `${eur(r.p5).padStart(6)}  ${r.t.toFixed(2).padStart(6)}  ${(r.iv * 100).toFixed(1).padStart(5)}  ${r.ala.toFixed(0).padStart(3)}${marca}`);
  }
  console.log(`(*) $/año = P&L total ÷ ${AÑOS_CAL.toFixed(2)} años de calendario; los días no operables cuentan $0.`);

  console.log(`\n── P&L MEDIO POR AÑO (¿aguanta en los tres?) ──`);
  console.log(`hora        2024 (n)          2025 (n)          2026 (n)      ¿3 años +?  ¿3 tercios +?`);
  for (const h of HORAS) {
    const r = R.get(clave(h, d)); if (!r) continue;
    const cel = AÑOS.map((a) => { const g = r.años[a]; return (g ? `${eur(g.medio)} (${g.n})` : "—").padStart(17); });
    const tresAños = AÑOS.every((a) => r.años[a] && r.años[a].medio > 0);
    const tresTercios = r.tercios.length === 3 && r.tercios.every((t) => t.medio > 0);
    console.log(`${h}  ${cel.join(" ")}      ${(tresAños ? "SÍ" : "no").padEnd(9)}  ${tresTercios ? "SÍ" : "no"}`);
  }

  console.log(`\n── EL PEAJE: bid/ask real contra punto-medio-a-punto-medio ──`);
  console.log(`hora     crédito real  crédito medio  P&L real   P&L medio-a-medio    peaje   peaje/crédito`);
  for (const h of HORAS) {
    const r = R.get(clave(h, d)); if (!r) continue;
    const peaje = r.plMedioMid - r.plMedio;
    console.log(`${h}  ${eur(r.credMedio).padStart(12)}  ${eur(r.credMedioMid).padStart(13)}  ${eur(r.plMedio).padStart(8)}  ` +
      `${eur(r.plMedioMid).padStart(18)}  ${eur(peaje).padStart(7)}  ${(r.credMedioMid > 0 ? (peaje / r.credMedioMid) * 100 : NaN).toFixed(0).padStart(11)}%`);
  }
}

// ══ VEREDICTO ═════════════════════════════════════════════════════════════════════════════
console.log(`\n\n════ VEREDICTO — las cinco condiciones escritas antes de correr ═════════════════════════`);
console.log(`hora  dist   P&L medio   vs 11:00   1.mejor  2.3años  3.3tercios  4.|t|≥${LISTON}  5.peaje  PASA`);
const ganadoras = [];
for (const d of DISTANCIAS) {
  const ref = R.get(clave(REFERENCIA, d));
  for (const h of HORAS) {
    const r = R.get(clave(h, d)); if (!r || h === REFERENCIA) continue;
    const c1 = r.plMedio > ref.plMedio;
    const c2 = AÑOS.every((a) => r.años[a] && r.años[a].medio > 0);
    const c3 = r.tercios.length === 3 && r.tercios.every((t) => t.medio > 0);
    const c4 = Math.abs(r.t) >= LISTON;
    const c5 = r.plMedioMid > ref.plMedioMid; // la ventaja existe también sin horquilla
    const pasa = c1 && c2 && c3 && c4 && c5;
    if (pasa) ganadoras.push(r);
    if (c1) console.log(`${h}  ±${String(d).padStart(2)}  ${eur(r.plMedio).padStart(10)}  ${eur(r.plMedio - ref.plMedio).padStart(9)}   ` +
      `${(c1 ? "sí" : "no").padStart(6)}  ${(c2 ? "sí" : "NO").padStart(7)}  ${(c3 ? "sí" : "NO").padStart(10)}  ` +
      `${(c4 ? "sí" : "NO").padStart(8)}  ${(c5 ? "sí" : "NO").padStart(7)}  ${pasa ? "SÍ" : "no"}`);
  }
}
console.log(`\nhoras que pasan las CINCO: ${ganadoras.length}`);
for (const g of ganadoras.sort((a, b) => b.plMedio - a.plMedio)) {
  console.log(`  ${g.hora} ±${g.dist}: P&L medio ${eur(g.plMedio)} · ${eur(g.porAño)}/año · acierto ${pct(g.acierto)} · t=${g.t.toFixed(2)} · ` +
    `años ${AÑOS.map((a) => eur(g.años[a]?.medio)).join(" / ")} · tercios ${g.tercios.map((t) => eur(t.medio)).join(" / ")}`);
}

// ══ PRUEBA PAREADA ════════════════════════════════════════════════════════════════════════
// Las 23 horas se miden sobre LOS MISMOS 653 DÍAS. Comparar sus medias con una t independiente
// desperdicia casi toda la información: el ruido —que el S&P se mueva 60 puntos ese martes— es
// COMÚN a las dos horas y se cancela al restar. La comparación honrada es día a día.
// Se compara cada hora contra las 11:00 en su misma distancia: 22 × 3 = 66 pruebas, mismo listón.
console.log(`\n\n════ PAREADO CONTRA LAS 11:00 — mismo día, misma distancia ═════════════════════════════`);
console.log(`   (la diferencia se mide día a día; el listón sigue siendo |t| ≥ ${LISTON})`);
const porDia = new Map();
for (const [k, v] of res) porDia.set(k, new Map(v.map((x) => [x.fecha, x])));

for (const d of DISTANCIAS) {
  const ref = porDia.get(clave(REFERENCIA, d));
  console.log(`\n±${d} puntos      n   dif. media   dif. mediana      |t|   gana el %   dif. medio-a-medio`);
  for (const h of HORAS) {
    if (h === REFERENCIA) continue;
    const cur = porDia.get(clave(h, d));
    const dif = [], difMid = [];
    for (const [f, a] of cur) { const b = ref.get(f); if (b) { dif.push(a.pl - b.pl); difMid.push(a.plMid - b.plMid); } }
    if (dif.length < 100) continue;
    const t = tUna(dif);
    console.log(`${h}        ${String(dif.length).padStart(4)}   ${eur(med(dif)).padStart(10)}   ${eur(mediana(dif)).padStart(12)}   ` +
      `${t.toFixed(2).padStart(6)}   ${((dif.filter((x) => x > 0).length / dif.length) * 100).toFixed(0).padStart(8)}%   ` +
      `${eur(med(difMid)).padStart(18)}${Math.abs(t) >= LISTON ? "   ← pasa el listón" : ""}`);
  }
}

// ══ BLOQUES DE LA SESIÓN ══════════════════════════════════════════════════════════════════
// Una hora suelta entre 23 puede salir bien por sorteo. Un BLOQUE de horas contiguas que va
// mejor que otro bloque, en las tres distancias y los tres años, ya no es sorteo.
const BLOQUES = [
  { n: "apertura 09:35-10:15", h: ["09:35", "09:45", "10:00", "10:15"] },
  { n: "media mañana 10:30-11:15", h: ["10:30", "10:45", "11:00", "11:15"] },
  { n: "mediodía 11:30-12:45", h: ["11:30", "11:45", "12:00", "12:15", "12:30", "12:45"] },
  { n: "tarde 13:00-14:30", h: ["13:00", "13:15", "13:30", "13:45", "14:00", "14:15", "14:30"] },
  { n: "cierre 14:45-15:00", h: ["14:45", "15:00"] },
];
console.log(`\n\n════ POR BLOQUES DE LA SESIÓN ══════════════════════════════════════════════════════════`);
for (const d of DISTANCIAS) {
  console.log(`\n±${d} puntos                     P&L medio   acierto   2024    2025    2026   pareado vs media mañana`);
  const serie = (b) => { // P&L medio del día promediando las horas del bloque
    const m = new Map();
    for (const h of b.h) for (const [f, x] of porDia.get(clave(h, d))) {
      const a = m.get(f) || { s: 0, n: 0, sm: 0, g: 0 };
      a.s += x.pl; a.sm += x.plMid; a.n++; a.g += x.gana ? 1 : 0; m.set(f, a);
    }
    return new Map([...m].map(([f, a]) => [f, { pl: a.s / a.n, plMid: a.sm / a.n, gana: a.g / a.n }]));
  };
  const base = serie(BLOQUES[1]);
  for (const b of BLOQUES) {
    const s = serie(b);
    const v = [...s.entries()];
    const dif = v.map(([f, x]) => x.pl - (base.get(f)?.pl ?? 0));
    const añoM = AÑOS.map((a) => eur(med(v.filter(([f]) => f.startsWith(a)).map(([, x]) => x.pl))).padStart(6));
    const t = b === BLOQUES[1] ? NaN : tUna(dif);
    console.log(`${b.n.padEnd(28)} ${eur(med(v.map(([, x]) => x.pl))).padStart(9)}   ` +
      `${((med(v.map(([, x]) => x.gana))) * 100).toFixed(0).padStart(6)}%  ${añoM.join("  ")}   ` +
      `${b === BLOQUES[1] ? "—(referencia)" : `${eur(med(dif))}  t=${t.toFixed(2)}${Math.abs(t) >= LISTON ? " ← pasa" : ""}`}`);
  }
}

writeFileSync("scripts/opt-hora-resultado.json", JSON.stringify({
  generado: new Date().toISOString(), dias: fechas.length, ala: ALA, pruebas: PRUEBAS, liston: LISTON,
  filas: [...R.values()],
}, null, 1));
console.log(`\ndetalle completo en scripts/opt-hora-resultado.json · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
