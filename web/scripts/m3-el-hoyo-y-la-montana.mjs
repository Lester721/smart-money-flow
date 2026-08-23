// EL HOYO Y LA MONTAÑA — ¿la montaña da permiso y la caída dispara?
//
// ═══ LA PREGUNTA ════════════════════════════════════════════════════════════════════════════
//
// Eduardo no compró a la apertura. Compró DESPUÉS de que el precio se hundiera 12 puntos, entre
// las 09:55 y las 10:05, y compró lo que estaba entre el precio y el montón gordo de interés
// abierto que tenía justo encima (el 7700, que sobresalía casi el cuádruple de sus vecinos).
//
// Regla de dos pisos:
//   PISO 1 — el PERMISO: a la apertura hay una MONTAÑA por encima del precio (un strike que
//            sobresale de sus vecinos al menos P veces) a menos de D% de distancia.
//   PISO 2 — el DISPARADOR: y sólo esos días, el precio ha CAÍDO X% desde las 09:35 a la hora T.
//            Entonces se compra una call por encima del precio y se vende a la hora S.
//
// Y las cuatro comparaciones que dicen si la montaña aporta algo:
//   (a) la montaña sola, sin exigir hoyo
//   (b) el hoyo solo, sin exigir montaña
//   (c) los dos juntos
//   (d) el hoyo los días en que la montaña está ABAJO (o sea, cuando dice lo contrario)
// Si (c) no bate claramente a (a) y a (b), la montaña no aporta nada. Y si (b) y (d) se parecen,
// la montaña no filtra.
//
// ═══ POR QUÉ LA CAÍDA VA EN PORCENTAJE ═════════════════════════════════════════════════════
//
// 25 puntos eran el 0,62% del índice en 2022 y el 0,35% en 2026. Un umbral en puntos se afloja
// solo según sube el índice; eso ya infló un hallazgo de este proyecto. Todo va en % del nivel.
//
// ═══ EL INSTRUMENTO ES EL MISMO EN LAS CUATRO COMPARACIONES ═════════════════════════════════
//
// Para que la única diferencia entre (a), (b), (c) y (d) sea el FILTRO y no lo que se compra, se
// compra siempre lo mismo: la call del múltiplo de 5 más cercano a un 0,20% por encima del precio
// de entrada. El 21 de agosto eso da exactamente el 7690, que es donde Eduardo puso el peso.
// Aparte, y sólo como refinamiento, se prueba también SU elección literal: el strike del hueco
// más cargado de calls.
//
// ═══ LOS CONTROLES ═════════════════════════════════════════════════════════════════════════
//
//  (a) ESPEJO      — la misma distancia al otro lado: la put 0,20% por debajo, mismo día, mismo
//                    instante. Ni la volatilidad ni la hora la contaminan.
//  (b) BARAJADO    — el mapa de montañas de OTRO día, recentrado por DISTANCIA a su propia
//                    apertura (nunca por nivel en bruto: el SPX pasó de 4.700 a 7.700). Índice
//                    desplazado, nunca Math.random.
//  (c) VOLATILIDAD — tercios por el precio de la cuna al dinero a las 09:35 (call ATM al ask +
//                    put ATM al ask, dividido por el nivel del índice).
//  (d) TAMAÑO      — un strike GORDO pero PLANO (mucho OI, poca prominencia: grande en una zona
//                    donde todo es grande) contra uno prominente. Si los dos se portan igual, lo
//                    que manda es el tamaño y no el pico.
//  Y el temporal: se construye con días anteriores a 2025-01-01 y se comprueba en 2025-2026.
//
// ═══ REGLAS DE LA CASA ═════════════════════════════════════════════════════════════════════
//
//  Compra al ASK, vende al BID. Sólo el pasado. Un hueco no es un cero (se descarta y se cuenta).
//  Los NUEVE días de media sesión se bloquean enteros: la bolsa cierra a las 13:00 pero el
//  fichero sigue trayendo barras con el SPX congelado.

import {
  diasDisponibles, cargarDia, cargarDia21, picos, montanaCerca, hueco,
  operar, idxHora, hayHora, rejilla, compraEn, resumen,
} from "./lib0dte.mjs";

// ── parámetros del barrido ──────────────────────────────────────────────────────────────────
const HORAS_T = ["09:50", "09:55", "10:00", "10:05", "10:15", "10:30"];   // hora de la decisión
const HORAS_S = ["10:45", "11:00", "11:30", "12:00", "12:30", "13:00"];   // hora de la salida
const CAIDAS  = [0.0005, 0.0010, 0.0015, 0.0020, 0.0030];                  // X en tanto por uno
const PROMS   = [2, 3];                                                     // P mínima
const DISTS   = [0.5, 1.0];                                                 // D máxima en %

const OTM = 0.0020;          // el 0,20% por encima: en el 21 de agosto es el 7690 exacto
const P_REF = 2, D_REF = 1.0; // montaña "de referencia" para elegir el strike del hueco

const MEDIA_SESION = new Set([
  "2022-11-25", "2023-07-03", "2023-11-24", "2024-07-03", "2024-11-29",
  "2024-12-24", "2025-07-03", "2025-11-28", "2025-12-24",
]);

const PANICO_CONOCIDOS = new Set(["2022-10-13", "2025-04-08", "2025-10-10", "2026-06-09"]);

const pct = (x) => (x * 100).toFixed(2) + "%";
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "n/d");

// ═══ PASADA ÚNICA POR LOS FICHEROS ═════════════════════════════════════════════════════════
// Las cadenas enteras de 1.123 días revientan node. Se guarda sólo lo que hace falta después:
// el camino del precio en las horas que se usan, el mapa de picos cerca del dinero, la cuna, y
// la tabla de operaciones ya ejecutada con precios reales.

const dias = diasDisponibles();
console.log(`días con cadena: ${dias.length}  (${dias[0]} … ${dias[dias.length - 1]})`);

const R = [];                        // un registro por día utilizable
let sinOI = 0, mediaSes = 0, sinHora = 0, huecosPrecio = 0, opsHechas = 0;
const costes = [];

for (const dia of dias) {
  if (MEDIA_SESION.has(dia)) { mediaSes++; continue; }
  const d = cargarDia(dia);
  if (!d) continue;
  if (!d.oi) { sinOI++; continue; }

  // ¿están todas las horas que vamos a usar?
  const faltan = [...HORAS_T, ...HORAS_S].some((h) => hayHora(d, h) < 0);
  if (faltan) { sinHora++; continue; }

  const spot0 = d.barras[0].spot;                       // 09:35, la primera barra que existe
  const pk = picos(d.oi, spot0);
  if (!pk) { sinOI++; continue; }

  // ── la cuna al dinero a las 09:35: el control de volatilidad ──
  const kAtm = rejilla(spot0);
  const cAtm = compraEn(d.barras[0], kAtm, "C");
  const pAtm = compraEn(d.barras[0], kAtm, "P");
  const cuna = cAtm != null && pAtm != null ? ((cAtm + pAtm) / spot0) * 100 : null;

  // ── los picos cerca del dinero, guardados por DISTANCIA (para poder barajarlos) ──
  const picosCerca = pk.picos
    .filter((p) => Math.abs(p.distPct) <= 3)
    .map((p) => ({ distPct: p.distPct, prom: p.prominencia, total: p.total, sesgo: p.sesgo, K: p.K }));

  // ── el strike gordo-pero-plano por encima: el control (d) ──
  const arribaCerca = picosCerca.filter((p) => p.distPct > 0 && p.distPct <= D_REF);
  let gordo = null;
  for (const p of arribaCerca) if (!gordo || p.total > gordo.total) gordo = p;

  // ── la elección literal de Eduardo: el strike del hueco más cargado de calls ──
  const mont = montanaCerca(pk, spot0, P_REF, D_REF);
  let kHueco = null;
  if (mont.arriba) {
    const h = hueco(pk, spot0, mont.arriba);
    let mejor = null;
    for (const e of h) if (!mejor || e.sesgo > mejor.sesgo) mejor = e;
    kHueco = mejor ? mejor.K : null;
  }

  // ── el camino entero del precio (78 números por día: cabe de sobra en memoria) ──
  const spots = d.barras.map((b) => b.spot);
  const iDe = {}, spotEn = {};
  for (const h of [...HORAS_T, ...HORAS_S]) { iDe[h] = idxHora(d, h); spotEn[h] = spots[iDe[h]]; }

  // ── la tabla de operaciones, ya con precios reales ──
  const ops = {};   // "T|S|regla" -> { ret, dolares, coste }
  for (const T of HORAS_T) {
    const iE = idxHora(d, T);
    const sT = spotEn[T];
    const kCall = rejilla(sT * (1 + OTM));
    const kPut = rejilla(sT * (1 - OTM));
    for (const S of HORAS_S) {
      const iS = idxHora(d, S);
      if (iS <= iE) continue;
      const trio = [["call", kCall, "C"], ["put", kPut, "P"]];
      if (kHueco) trio.push(["hueco", kHueco, "C"]);
      for (const [reg, K, lado] of trio) {
        const o = operar(d, iE, iS, K, lado);
        if (!o) { huecosPrecio++; continue; }
        ops[`${T}|${S}|${reg}`] = { ret: o.ret, dolares: o.dolares, coste: o.coste };
        opsHechas++;
        if (reg === "call") costes.push(o.coste);
      }
    }
  }

  R.push({ dia, anio: +dia.slice(0, 4), spot0, spots, iDe, spotEn, picosCerca, gordo, cuna, ops, kHueco });
}

const ANIOS = R.length / 244;
console.log(`
── SANIDAD ──────────────────────────────────────────────────────────────────
días utilizables      ${R.length}   (${R[0].dia} … ${R[R.length - 1].dia})  = ${ANIOS.toFixed(2)} años
media sesión saltados ${mediaSes}
sin OI / sin picos    ${sinOI}
sin alguna hora       ${sinHora}
operaciones ejecutadas ${opsHechas}
huecos de precio       ${huecosPrecio}  (descartadas, nunca puestas a cero)
coste de la call 0,20% fuera (por contrato): mín $${f2(Math.min(...costes) * 100)}  mediana $${f2(
  [...costes].sort((a, b) => a - b)[Math.floor(costes.length / 2)] * 100)}  máx $${f2(Math.max(...costes) * 100)}`);

// ═══ LOS FILTROS ═══════════════════════════════════════════════════════════════════════════

/** ¿hay montaña por encima a la apertura, con prominencia ≥P y a ≤D%? (lista de picos dada) */
function montArriba(lista, P, D) {
  let mejor = null;
  for (const p of lista) if (p.distPct > 0 && p.distPct <= D && p.prom >= P) {
    if (!mejor || p.distPct < mejor.distPct) mejor = p;
  }
  return mejor;
}
function montAbajo(lista, P, D) {
  let mejor = null;
  for (const p of lista) if (p.distPct < 0 && -p.distPct <= D && p.prom >= P) {
    if (!mejor || -p.distPct < -mejor.distPct) mejor = p;
  }
  return mejor;
}
/** ¿ha caído el precio X (tanto por uno) desde las 09:35 hasta T? */
const hoyo = (r, T, X) => (r.spotEn[T] - r.spot0) / r.spot0 <= -X;

/**
 * EL HOYO MEDIDO DESDE EL MÁXIMO DEL DÍA, no desde las 09:35.
 * Hace falta porque la caída de Eduardo (12 puntos) fue desde la barra de las 09:30, que en los
 * 1.123 días históricos NO EXISTE. Medida desde las 09:35, su propio día cae un 0,01% y la regla
 * ni se enteraría. La retirada desde el máximo de la mañana sí se puede medir en toda la serie
 * y es lo más parecido a «el precio se acaba de hundir» que hay disponible.
 */
function hoyoDesdeMax(r, T, X) {
  const i = r.iDe[T];
  let mx = -Infinity;
  for (let k = 0; k <= i; k++) if (r.spots[k] > mx) mx = r.spots[k];
  return (r.spots[i] - mx) / mx <= -X;
}

/** ¿toca el precio un nivel que está a `distPct` por encima del spot de las 09:35, entre T y S? */
function tocaArriba(r, distPct, T, S) {
  const nivel = r.spot0 * (1 + distPct / 100);
  for (let k = r.iDe[T]; k <= r.iDe[S]; k++) if (r.spots[k] >= nivel) return true;
  return false;
}

// ═══ LA CONTABILIDAD ═══════════════════════════════════════════════════════════════════════

function evaluar(regs, T, S, regla) {
  const v = [], dol = [], dias = [];
  for (const r of regs) {
    const o = r.ops[`${T}|${S}|${regla}`];
    if (!o) continue;
    v.push(o.ret); dol.push(o.dolares); dias.push({ dia: r.dia, d: o.dolares, ret: o.ret, anio: r.anio });
  }
  if (!v.length) return null;
  const s = resumen(v);
  const total = dol.reduce((a, b) => a + b, 0);
  const orden = [...dias].sort((a, b) => b.d - a.d);
  const sin5 = orden.slice(5).reduce((a, b) => a + b.d, 0);
  const med = [...dol].sort((a, b) => a - b);
  return {
    n: v.length, media: s.media, t: s.t, aciertos: s.aciertos,
    dolAnio: total / ANIOS, total,
    mediana: med[Math.floor(med.length / 2)],
    peor: med[0],
    sin5Anio: sin5 / ANIOS,
    top5: orden.slice(0, 5).map((x) => x.dia),
    dias,
  };
}

const linea = (etq, e) => e
  ? `${etq.padEnd(30)} n=${String(e.n).padStart(4)}  media=${pct(e.media).padStart(8)}  t=${f2(e.t).padStart(6)}` +
    `  aciertos=${pct(e.aciertos).padStart(7)}  $/año=${Math.round(e.dolAnio).toString().padStart(7)}` +
    `  sin5=${Math.round(e.sin5Anio).toString().padStart(7)}`
  : `${etq.padEnd(30)} (sin datos)`;

// ═══ 1. EL BARRIDO ═════════════════════════════════════════════════════════════════════════
// Se barre P, D, X, T y S sobre TODOS los días. Se guarda todo y luego se mira con lupa el
// mejor, sabiendo que hay muchas combinaciones y que eso infla el mejor por puro azar.

console.log(`
── 1. BARRIDO: montaña + hoyo (la regla de dos pisos), instrumento call 0,20% fuera ─────────`);

const todas = [];
for (const P of PROMS) for (const D of DISTS) {
  const conMont = R.filter((r) => montArriba(r.picosCerca, P, D));
  for (const X of CAIDAS) for (const T of HORAS_T) {
    const c = conMont.filter((r) => hoyo(r, T, X));
    if (c.length < 40) continue;
    for (const S of HORAS_S) {
      const e = evaluar(c, T, S, "call");
      if (!e || e.n < 40) continue;
      todas.push({ P, D, X, T, S, e });
    }
  }
}
todas.sort((a, b) => b.e.dolAnio - a.e.dolAnio);
console.log(`combinaciones con n≥40: ${todas.length}`);
console.log(`las 10 mejores por $/año:`);
for (const c of todas.slice(0, 10)) {
  console.log(`  P≥${c.P} D≤${c.D}% X≥${pct(c.X)} T=${c.T} S=${c.S}  ` +
    `n=${String(c.e.n).padStart(3)} media=${pct(c.e.media).padStart(8)} t=${f2(c.e.t).padStart(6)} ` +
    `$/año=${Math.round(c.e.dolAnio).toString().padStart(7)} sin5=${Math.round(c.e.sin5Anio).toString().padStart(7)}`);
}
console.log(`las 5 peores por $/año:`);
for (const c of todas.slice(-5)) {
  console.log(`  P≥${c.P} D≤${c.D}% X≥${pct(c.X)} T=${c.T} S=${c.S}  ` +
    `n=${String(c.e.n).padStart(3)} media=${pct(c.e.media).padStart(8)} t=${f2(c.e.t).padStart(6)} ` +
    `$/año=${Math.round(c.e.dolAnio).toString().padStart(7)}`);
}
const positivas = todas.filter((c) => c.e.media > 0).length;
const conT2 = todas.filter((c) => c.e.t > 2).length;
console.log(`de ${todas.length} combinaciones: ${positivas} con media positiva (${pct(positivas / todas.length)}), ${conT2} con t>+2`);

// ═══ 2. LAS CUATRO COMPARACIONES ═══════════════════════════════════════════════════════════
// Con la combinación más parecida a lo que hizo Eduardo (P≥2, D≤1%, X≥0,15%, T=10:00) y con la
// mejor del barrido.

function cuatro(titulo, P, D, X, T, S) {
  console.log(`
── ${titulo}: P≥${P}  D≤${D}%  X≥${pct(X)}  T=${T}  S=${S} ───────────────────`);
  const conM = R.filter((r) => montArriba(r.picosCerca, P, D));
  const conH = R.filter((r) => hoyo(r, T, X));
  const ambos = R.filter((r) => montArriba(r.picosCerca, P, D) && hoyo(r, T, X));
  const contra = R.filter((r) => montAbajo(r.picosCerca, P, D) && !montArriba(r.picosCerca, P, D) && hoyo(r, T, X));
  const a = evaluar(conM, T, S, "call");
  const b = evaluar(conH, T, S, "call");
  const c = evaluar(ambos, T, S, "call");
  const dd = evaluar(contra, T, S, "call");
  console.log(linea("(a) montaña sola", a));
  console.log(linea("(b) hoyo solo", b));
  console.log(linea("(c) los dos juntos", c));
  console.log(linea("(d) hoyo con montaña ABAJO", dd));
  console.log(linea("     todos los días (listón)", evaluar(R, T, S, "call")));
  if (c) {
    console.log(`     mediana del día: $${f2(c.mediana)}   peor día: $${f2(c.peor)}`);
    console.log(`     los 5 mejores días: ${c.top5.join(", ")}`);
    const solapa = c.top5.filter((x) => PANICO_CONOCIDOS.has(x));
    console.log(`     ¿son los cuatro días de pánico conocidos? ${solapa.length ? solapa.join(", ") : "NO, ninguno"}`);
    const porAnio = {};
    for (const x of c.dias) { porAnio[x.anio] = porAnio[x.anio] || { n: 0, d: 0 }; porAnio[x.anio].n++; porAnio[x.anio].d += x.d; }
    console.log(`     año a año: ` + Object.entries(porAnio).map(([y, v]) => `${y}: n=${v.n} $${Math.round(v.d)}`).join("  |  "));
  }
  return { a, b, c, dd, ambos, conH };
}

const REF = { P: 2, D: 1.0, X: 0.0015, T: "10:00", S: "11:30" };
const ref = cuatro("2. LA COMBINACIÓN DE EDUARDO", REF.P, REF.D, REF.X, REF.T, REF.S);
const mej = todas[0];
const best = cuatro("3. LA MEJOR DEL BARRIDO", mej.P, mej.D, mej.X, mej.T, mej.S);

// ═══ 4. LOS CUATRO CONTROLES sobre la mejor ════════════════════════════════════════════════

console.log(`
── 4. LOS CUATRO CONTROLES sobre la mejor (P≥${mej.P} D≤${mej.D}% X≥${pct(mej.X)} T=${mej.T} S=${mej.S}) ──`);

// (a) ESPEJO: la put a la misma distancia, mismo día, mismo instante
console.log(linea("regla (call arriba)", best.c));
console.log(linea("ESPEJO (put abajo, mismo día)", evaluar(best.ambos, mej.T, mej.S, "put")));
// para saber si esa diferencia call−put es de la regla o es de todos los días
const eCallTodos = evaluar(R, mej.T, mej.S, "call"), ePutTodos = evaluar(R, mej.T, mej.S, "put");
const eCallHoyo = evaluar(best.conH, mej.T, mej.S, "call"), ePutHoyo = evaluar(best.conH, mej.T, mej.S, "put");
console.log(`  la brecha call−put: regla ${pct(best.c.media - evaluar(best.ambos, mej.T, mej.S, "put").media)}` +
  `  ·  sólo hoyo ${pct(eCallHoyo.media - ePutHoyo.media)}  ·  todos los días ${pct(eCallTodos.media - ePutTodos.media)}`);

// (b) BARAJADO: el mapa de picos de otro día, recentrado por distancia
for (const desp of [137, 411, 733]) {
  const baraj = R.filter((r, i) => {
    const otro = R[(i + desp) % R.length];
    return montArriba(otro.picosCerca, mej.P, mej.D) && hoyo(r, mej.T, mej.X);
  });
  console.log(linea(`BARAJADO (desplazo ${desp})`, evaluar(baraj, mej.T, mej.S, "call")));
}

// (c) VOLATILIDAD: tercios por la cuna al dinero de las 09:35
const conCuna = R.filter((r) => r.cuna != null).map((r) => r.cuna).sort((a, b) => a - b);
const q1 = conCuna[Math.floor(conCuna.length / 3)], q2 = conCuna[Math.floor((2 * conCuna.length) / 3)];
console.log(`  cortes de la cuna ATM: ${f2(q1)}%  y  ${f2(q2)}%  del índice`);
const tercio = (r) => (r.cuna == null ? -1 : r.cuna <= q1 ? 0 : r.cuna <= q2 ? 1 : 2);
for (let k = 0; k < 3; k++) {
  const dentro = best.ambos.filter((r) => tercio(r) === k);
  const suelo = R.filter((r) => tercio(r) === k && hoyo(r, mej.T, mej.X));
  console.log(linea(`  VOL tercio ${k} · regla`, evaluar(dentro, mej.T, mej.S, "call")));
  console.log(linea(`  VOL tercio ${k} · hoyo solo`, evaluar(suelo, mej.T, mej.S, "call")));
}

// (d) PROMINENCIA contra TAMAÑO BRUTO
const gordoPlano = R.filter((r) =>
  r.gordo && r.gordo.prom < 1.5 && !montArriba(r.picosCerca, mej.P, mej.D) && hoyo(r, mej.T, mej.X));
console.log(linea("TAMAÑO: gordo pero PLANO (prom<1,5)", evaluar(gordoPlano, mej.T, mej.S, "call")));
console.log(linea("PROMINENCIA: la montaña", best.c));
// y al revés: entre los días con montaña, ¿manda el tamaño del pico o su prominencia?
const conMontTodos = R.filter((r) => montArriba(r.picosCerca, mej.P, mej.D) && hoyo(r, mej.T, mej.X));
const tot = conMontTodos.map((r) => montArriba(r.picosCerca, mej.P, mej.D).total).sort((a, b) => a - b);
if (tot.length > 6) {
  const medTot = tot[Math.floor(tot.length / 2)];
  console.log(linea("  montañas GRANDES (OI > mediana)",
    evaluar(conMontTodos.filter((r) => montArriba(r.picosCerca, mej.P, mej.D).total > medTot), mej.T, mej.S, "call")));
  console.log(linea("  montañas PEQUEÑAS (OI ≤ mediana)",
    evaluar(conMontTodos.filter((r) => montArriba(r.picosCerca, mej.P, mej.D).total <= medTot), mej.T, mej.S, "call")));
}

// ═══ 5. FUERA DE MUESTRA ═══════════════════════════════════════════════════════════════════

console.log(`
── 5. FUERA DE MUESTRA: se construye antes de 2025-01-01 y se comprueba en 2025-2026 ────────`);
const antes = R.filter((r) => r.dia < "2025-01-01");
const desp = R.filter((r) => r.dia >= "2025-01-01");
console.log(`  días antes: ${antes.length}   días después: ${desp.length}`);

// la mejor combinación buscada SÓLO con los días de antes
const busca = [];
for (const P of PROMS) for (const D of DISTS) {
  const cm = antes.filter((r) => montArriba(r.picosCerca, P, D));
  for (const X of CAIDAS) for (const T of HORAS_T) {
    const c = cm.filter((r) => hoyo(r, T, X));
    if (c.length < 25) continue;
    for (const S of HORAS_S) {
      const e = evaluar(c, T, S, "call");
      if (!e || e.n < 25) continue;
      busca.push({ P, D, X, T, S, e });
    }
  }
}
busca.sort((a, b) => b.e.dolAnio - a.e.dolAnio);
const elegida = busca[0];
console.log(`  la mejor SÓLO con 2022-2024: P≥${elegida.P} D≤${elegida.D}% X≥${pct(elegida.X)} T=${elegida.T} S=${elegida.S}`);
console.log(linea("  dentro de muestra (2022-2024)", elegida.e));
const fuera = desp.filter((r) => montArriba(r.picosCerca, elegida.P, elegida.D) && hoyo(r, elegida.T, elegida.X));
console.log(linea("  FUERA de muestra (2025-2026)", evaluar(fuera, elegida.T, elegida.S, "call")));
// y la mejor global, partida en dos
console.log(linea("  la mejor global · 2022-2024",
  evaluar(antes.filter((r) => montArriba(r.picosCerca, mej.P, mej.D) && hoyo(r, mej.T, mej.X)), mej.T, mej.S, "call")));
console.log(linea("  la mejor global · 2025-2026",
  evaluar(desp.filter((r) => montArriba(r.picosCerca, mej.P, mej.D) && hoyo(r, mej.T, mej.X)), mej.T, mej.S, "call")));

// ═══ 6. TRES TERCIOS DEL CALENDARIO ════════════════════════════════════════════════════════
console.log(`
── 6. TRES TERCIOS del calendario (la mejor global) ─────────────────────────────────────────`);
const tramo = Math.ceil(R.length / 3);
for (let k = 0; k < 3; k++) {
  const sub = R.slice(k * tramo, (k + 1) * tramo);
  const q = sub.filter((r) => montArriba(r.picosCerca, mej.P, mej.D) && hoyo(r, mej.T, mej.X));
  console.log(linea(`  tercio ${k + 1} (${sub[0].dia}…${sub[sub.length - 1].dia})`, evaluar(q, mej.T, mej.S, "call")));
}

// ═══ 7. ¿SUBE EL PRECIO HACIA LA MONTAÑA? — el hecho, aunque no haya regla ══════════════════
console.log(`
── 7. EL HECHO: ¿sube el precio hacia la montaña más veces de lo normal? ─────────────────────`);
function subeHacia(regs, T, S, etq) {
  let sube = 0, n = 0, mov = 0;
  for (const r of regs) {
    const a = r.spotEn[T], b = r.spotEn[S];
    n++; if (b > a) sube++;
    mov += ((b - a) / a) * 100;
  }
  if (!n) return;
  const p = sube / n, z = (p - 0.536) / Math.sqrt((0.536 * 0.464) / n);
  console.log(`  ${etq.padEnd(42)} n=${String(n).padStart(4)}  sube=${pct(p).padStart(7)}  ` +
    `(contra 53,60% del listón, z=${(z >= 0 ? "+" : "") + f2(z)})  movimiento medio ${(mov / n >= 0 ? "+" : "") + f2(mov / n)}%`);
}
const T7 = mej.T, S7 = mej.S;
subeHacia(R, T7, S7, "todos los días (la raya al azar)");
subeHacia(R.filter((r) => hoyo(r, T7, mej.X)), T7, S7, "sólo hoyo");
subeHacia(R.filter((r) => montArriba(r.picosCerca, mej.P, mej.D)), T7, S7, "sólo montaña arriba");
subeHacia(R.filter((r) => montArriba(r.picosCerca, mej.P, mej.D) && hoyo(r, T7, mej.X)), T7, S7, "montaña + hoyo");
subeHacia(R.filter((r) => montAbajo(r.picosCerca, mej.P, mej.D) && !montArriba(r.picosCerca, mej.P, mej.D) && hoyo(r, T7, mej.X)), T7, S7, "hoyo con montaña ABAJO");

// ── ¿LLEGA a tocar la montaña? La montaña de verdad contra una montaña PRESTADA de otro día ──
console.log(`  ¿toca el precio el nivel, entre ${T7} y ${S7}?`);
function toque(etq, pares) {
  let n = 0, t = 0, dsum = 0;
  for (const [r, dist] of pares) { n++; if (tocaArriba(r, dist, T7, S7)) t++; dsum += dist; }
  if (!n) return;
  console.log(`    ${etq.padEnd(46)} n=${String(n).padStart(4)}  toca=${pct(t / n).padStart(7)}  (distancia media +${f2(dsum / n)}%)`);
}
const conMontHoyo = R.filter((r) => montArriba(r.picosCerca, mej.P, mej.D) && hoyo(r, T7, mej.X));
toque("la MONTAÑA de verdad", conMontHoyo.map((r) => [r, montArriba(r.picosCerca, mej.P, mej.D).distPct]));
for (const dsp of [137, 411, 733]) {
  const pares = [];
  for (let i = 0; i < R.length; i++) {
    const r = R[i]; if (!hoyo(r, T7, mej.X)) continue;
    const m = montArriba(R[(i + dsp) % R.length].picosCerca, mej.P, mej.D);
    if (m) pares.push([r, m.distPct]);
  }
  toque(`montaña PRESTADA de otro día (desplazo ${dsp})`, pares);
}

// ═══ 7b. EL HOYO MEDIDO DESDE EL MÁXIMO DE LA MAÑANA ═══════════════════════════════════════
console.log(`
── 7b. El hoyo medido desde el MÁXIMO de la mañana (la caída de Eduardo era desde las 09:30) ─`);
const barridoDD = [];
for (const P of PROMS) for (const D of DISTS) {
  const cm = R.filter((r) => montArriba(r.picosCerca, P, D));
  for (const X of CAIDAS) for (const T of HORAS_T) {
    const c = cm.filter((r) => hoyoDesdeMax(r, T, X));
    if (c.length < 40) continue;
    for (const S of HORAS_S) {
      const e = evaluar(c, T, S, "call");
      if (!e || e.n < 40) continue;
      barridoDD.push({ P, D, X, T, S, e });
    }
  }
}
barridoDD.sort((a, b) => b.e.dolAnio - a.e.dolAnio);
console.log(`  combinaciones con n≥40: ${barridoDD.length}   con t>+2: ${barridoDD.filter((c) => c.e.t > 2).length}`);
for (const c of barridoDD.slice(0, 5)) {
  console.log(`  P≥${c.P} D≤${c.D}% retirada≥${pct(c.X)} T=${c.T} S=${c.S}  n=${String(c.e.n).padStart(3)} ` +
    `media=${pct(c.e.media).padStart(8)} t=${f2(c.e.t).padStart(6)} $/año=${Math.round(c.e.dolAnio).toString().padStart(7)} ` +
    `sin5=${Math.round(c.e.sin5Anio).toString().padStart(7)}`);
}
if (barridoDD.length) {
  const m2 = barridoDD[0];
  const soloDD = R.filter((r) => hoyoDesdeMax(r, m2.T, m2.X));
  console.log(linea("  (b) retirada sola, sin montaña", evaluar(soloDD, m2.T, m2.S, "call")));
  console.log(linea("  (c) montaña + retirada", m2.e));
  console.log(linea("  fuera de muestra 2025-2026",
    evaluar(R.filter((r) => r.dia >= "2025-01-01" && montArriba(r.picosCerca, m2.P, m2.D) && hoyoDesdeMax(r, m2.T, m2.X)), m2.T, m2.S, "call")));

  // ═══ 7c. LOS CUATRO CONTROLES sobre la MEJOR CANDIDATA de todo el encargo ════════════════
  console.log(`
── 7c. LOS CUATRO CONTROLES sobre la mejor candidata (P≥${m2.P} D≤${m2.D}% retirada≥${pct(m2.X)} T=${m2.T} S=${m2.S}) ──`);
  const S2 = R.filter((r) => montArriba(r.picosCerca, m2.P, m2.D) && hoyoDesdeMax(r, m2.T, m2.X));
  const eR = evaluar(S2, m2.T, m2.S, "call");
  console.log(linea("regla", eR));
  console.log(linea("ESPEJO (put abajo, mismo instante)", evaluar(S2, m2.T, m2.S, "put")));
  console.log(linea("(a) montaña sola, sin retirada",
    evaluar(R.filter((r) => montArriba(r.picosCerca, m2.P, m2.D)), m2.T, m2.S, "call")));
  console.log(linea("(d) retirada + montaña ABAJO",
    evaluar(R.filter((r) => montAbajo(r.picosCerca, m2.P, m2.D) && !montArriba(r.picosCerca, m2.P, m2.D) && hoyoDesdeMax(r, m2.T, m2.X)), m2.T, m2.S, "call")));
  for (const dsp of [137, 411, 733]) {
    const baraj = R.filter((r, i) => montArriba(R[(i + dsp) % R.length].picosCerca, m2.P, m2.D) && hoyoDesdeMax(r, m2.T, m2.X));
    console.log(linea(`BARAJADO (desplazo ${dsp})`, evaluar(baraj, m2.T, m2.S, "call")));
  }
  for (let k = 0; k < 3; k++) {
    console.log(linea(`  VOL tercio ${k} · regla`, evaluar(S2.filter((r) => tercio(r) === k), m2.T, m2.S, "call")));
    console.log(linea(`  VOL tercio ${k} · retirada sola`, evaluar(soloDD.filter((r) => tercio(r) === k), m2.T, m2.S, "call")));
  }
  console.log(linea("TAMAÑO: gordo pero PLANO (prom<1,5)",
    evaluar(R.filter((r) => r.gordo && r.gordo.prom < 1.5 && !montArriba(r.picosCerca, m2.P, m2.D) && hoyoDesdeMax(r, m2.T, m2.X)), m2.T, m2.S, "call")));
  const tramo2 = Math.ceil(R.length / 3);
  for (let k = 0; k < 3; k++) {
    const sub = R.slice(k * tramo2, (k + 1) * tramo2);
    console.log(linea(`  tercio del calendario ${k + 1}`,
      evaluar(sub.filter((r) => montArriba(r.picosCerca, m2.P, m2.D) && hoyoDesdeMax(r, m2.T, m2.X)), m2.T, m2.S, "call")));
  }
  if (eR) {
    const porAnio = {};
    for (const x of eR.dias) { porAnio[x.anio] = porAnio[x.anio] || { n: 0, d: 0 }; porAnio[x.anio].n++; porAnio[x.anio].d += x.d; }
    console.log(`  año a año: ` + Object.entries(porAnio).map(([y, v]) => `${y}: n=${v.n} $${Math.round(v.d)}`).join("  |  "));
    console.log(`  mediana del día $${f2(eR.mediana)}   peor día $${f2(eR.peor)}`);
    console.log(`  los 5 mejores días: ${eR.top5.join(", ")}`);
    console.log(`  ¿son los cuatro de pánico conocidos? ${eR.top5.filter((x) => PANICO_CONOCIDOS.has(x)).join(", ") || "NO, ninguno"}`);
    const orden = [...eR.dias].sort((a, b) => b.d - a.d);
    console.log(`  reparto del dinero: los 5 mejores suman $${Math.round(orden.slice(0, 5).reduce((a, b) => a + b.d, 0))} ` +
      `de un total de $${Math.round(eR.total)}  (los otros ${eR.n - 5} días suman $${Math.round(orden.slice(5).reduce((a, b) => a + b.d, 0))})`);
  }
  // y la elegida SÓLO con 2022-2024, comprobada en 2025-2026
  const buscaDD = [];
  for (const P of PROMS) for (const D of DISTS) {
    const cm = antes.filter((r) => montArriba(r.picosCerca, P, D));
    for (const X of CAIDAS) for (const T of HORAS_T) {
      const c = cm.filter((r) => hoyoDesdeMax(r, T, X));
      if (c.length < 25) continue;
      for (const S of HORAS_S) { const e = evaluar(c, T, S, "call"); if (e && e.n >= 25) buscaDD.push({ P, D, X, T, S, e }); }
    }
  }
  buscaDD.sort((a, b) => b.e.dolAnio - a.e.dolAnio);
  const el2 = buscaDD[0];
  console.log(`  elegida SÓLO con 2022-2024: P≥${el2.P} D≤${el2.D}% retirada≥${pct(el2.X)} T=${el2.T} S=${el2.S}`);
  console.log(linea("    dentro (2022-2024)", el2.e));
  console.log(linea("    FUERA (2025-2026)",
    evaluar(desp.filter((r) => montArriba(r.picosCerca, el2.P, el2.D) && hoyoDesdeMax(r, el2.T, el2.X)), el2.T, el2.S, "call")));
}

// ═══ 8. LA ELECCIÓN LITERAL DE EDUARDO: el strike del hueco más cargado de calls ════════════
console.log(`
── 8. Su elección literal (strike del hueco con más sesgo a calls) ──────────────────────────`);
const conHueco = R.filter((r) => r.kHueco && hoyo(r, REF.T, REF.X));
console.log(linea("  hueco+sesgo · montaña+hoyo", evaluar(conHueco, REF.T, REF.S, "hueco")));
console.log(linea("  call 0,20% fuera · mismos días", evaluar(conHueco, REF.T, REF.S, "call")));

// ═══ 9. EL 21 DE AGOSTO ════════════════════════════════════════════════════════════════════
console.log(`
── 9. ¿Habría disparado la regla el 21 de agosto? ───────────────────────────────────────────`);
const d21 = cargarDia21();
if (d21) {
  const i35 = idxHora(d21, "09:35");
  const s0 = d21.barras[i35].spot;
  const pk21 = picos(d21.oi, s0);
  const lista21 = pk21.picos.filter((p) => Math.abs(p.distPct) <= 3)
    .map((p) => ({ distPct: p.distPct, prom: p.prominencia, total: p.total, sesgo: p.sesgo, K: p.K }));
  const m = montArriba(lista21, mej.P, mej.D);
  const iT = idxHora(d21, mej.T), iS = idxHora(d21, mej.S);
  const sT = d21.barras[iT].spot;
  const caida = (sT - s0) / s0;
  console.log(`  09:35 spot=${f2(s0)}   ${mej.T} spot=${f2(sT)}   caída=${pct(caida)}`);
  console.log(`  montaña arriba: ${m ? `K=${m.K} a +${f2(m.distPct)}% prominencia ${f2(m.prom)}` : "NO"}`);
  console.log(`  ¿dispara? ${m && caida <= -mej.X ? "SÍ" : "NO"}`);
  const K21 = rejilla(sT * (1 + OTM));
  const o = operar(d21, iT, iS, K21, "C");
  console.log(`  la operación de la regla: call ${K21}  ${o ? `coste $${f2(o.coste * 100)} → $${f2(o.ingreso * 100)}  = ${pct(o.ret)} ($${f2(o.dolares)})` : "sin precio"}`);
} else {
  console.log("  el día 21 no está descargado en esta máquina");
}
console.log("\nfin.");
