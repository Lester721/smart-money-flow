// EL BANCO DE PRUEBAS DE 0DTE — una sola forma de medir, para todas las reglas.
//
// ═══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════════════════════
//
// Vamos a probar muchas reglas de entrada distintas. Si cada prueba escribe su propio lector de
// ficheros y su propia contabilidad, no se pueden comparar entre sí: una diferencia puede venir
// de la regla o de un fallo del lector, y no hay forma de saberlo.
//
// Así que el lector y la contabilidad viven AQUÍ, escritos una vez. Una regla sólo decide qué
// comprar y cuándo salir. Nunca toca los precios.
//
// ═══ LAS TRES REGLAS DE LA CASA ═════════════════════════════════════════════════════════════
//
//  1. SE COMPRA AL ASK Y SE VENDE AL BID. Siempre. El peaje de la horquilla es lo que ha matado
//     casi todo lo que hemos probado, así que va dentro y no se puede desactivar.
//  2. UNA REGLA SÓLO VE EL PASADO. Recibe las barras hasta el minuto de la decisión, nunca la
//     barra siguiente. Un efecto que crece con el horizonte es fuga del futuro.
//  3. UN HUECO NO ES UN CERO. Si falta un precio se devuelve null y la operación se descarta,
//     contándola aparte. Rellenar con cero fabrica ganancias.
//
// ═══ DE DÓNDE SALEN LOS DATOS ═══════════════════════════════════════════════════════════════
//
//   cache-theta/gex-2026/iv_<día>_C.csv   cadena de CALLS que vence ESE día, cada 5 min
//   cache-theta/gex-2026/iv_<día>_P.csv   lo mismo de PUTS
//        columnas: symbol,expiration,strike,right,timestamp,bid,...,ask,...,underlying_price
//        el precio del SPX viene en la MISMA fila — no hay que cruzar series de feeds distintos,
//        que es exactamente la trampa que ya nos selló un look-ahead una vez.
//
//        OJO CON LAS 09:30: esa barra NO EXISTE. En los 1.123 días las filas de las 09:30 traen
//        underlying_price = 0.0 y ask = 0, así que el lector las descarta. La primera barra es
//        SIEMPRE las 09:35 y siempre hay 78. Dos auditorías independientes pillaron un script que
//        pedía idxHora(d,"09:30"), recibía -1, y caía en silencio al índice 0 creyendo que medía
//        "desde la apertura". Por eso idxHora ahora LANZA si le piden una hora que no existe:
//        en este proyecto una hora que no existe se leía como el índice 0, igual que un campo que
//        no existe se lee como cero. Si de verdad quieres la primera barra, pide primeraBarra().
//
//   cache-theta/oi-spxw/<día>.json        interés abierto {"7750|C": 1500, …}
//        es el del ARRANQUE del día (viene de la compensación de la noche anterior), así que
//        se puede usar a las 09:30 sin mirar al futuro.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

export { CACHE };
export const DIR_CADENA = join(CACHE, "gex-2026");
export const DIR_OI = join(CACHE, "oi-spxw");

/** Todos los días con cadena 0DTE completa, ordenados. */
export function diasDisponibles() {
  return readdirSync(DIR_CADENA)
    .filter((f) => f.startsWith("iv_") && f.endsWith("_C.csv"))
    .map((f) => f.slice(3, 13))
    .filter((d) => existsSync(join(DIR_CADENA, `iv_${d}_P.csv`)))
    .sort();
}

/** Índices de columna, buscados por NOMBRE. Si el fichero cambia de forma, esto lanza. */
function columnas(cabecera) {
  const c = cabecera.split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = {};
  for (const n of ["strike", "timestamp", "bid", "ask", "underlying_price"]) {
    const i = c.indexOf(n);
    if (i < 0) throw new Error(`falta la columna «${n}» — el fichero tiene: ${c.join("|")}`);
    idx[n] = i;
  }
  return idx;
}

function leerLado(ruta, barras, letra) {
  const txt = readFileSync(ruta, "utf8");
  const nl = txt.indexOf("\n");
  const idx = columnas(txt.slice(0, nl));
  let p = nl + 1;
  while (p < txt.length) {
    let f = txt.indexOf("\n", p);
    if (f < 0) f = txt.length;
    const linea = txt.slice(p, f);
    p = f + 1;
    if (!linea) continue;
    const c = linea.split(",");
    const bid = +c[idx.bid], ask = +c[idx.ask];
    // ask 0 = no cotizaba. No es un precio de cero, es la ausencia de precio.
    if (!(ask > 0)) continue;
    const spot = +c[idx.underlying_price];
    if (!(spot > 0)) continue;
    const K = +String(c[idx.strike]).replace(/"/g, "");
    const t = c[idx.timestamp].slice(11, 16);
    let b = barras.get(t);
    if (!b) { b = { t, spot, o: new Map() }; barras.set(t, b); }
    b.o.set(K + letra, [bid, ask]);
  }
}

/**
 * Un día entero, listo para simular.
 * @returns {{dia:string, barras:Array, oi:Object}|null}
 */
export function cargarDia(dia) {
  const rc = join(DIR_CADENA, `iv_${dia}_C.csv`);
  const rp = join(DIR_CADENA, `iv_${dia}_P.csv`);
  if (!existsSync(rc) || !existsSync(rp)) return null;
  const barras = new Map();
  leerLado(rc, barras, "C");
  leerLado(rp, barras, "P");
  if (barras.size < 40) return null;                       // día truncado: fuera
  const lista = [...barras.values()].sort((a, b) => a.t.localeCompare(b.t));

  let oi = null;
  const ro = join(DIR_OI, `${dia}.json`);
  if (existsSync(ro)) { try { oi = JSON.parse(readFileSync(ro, "utf8")); } catch { oi = null; } }

  return { dia, barras: lista, oi };
}

/** El precio del SPX en cada barra, para leer el día de un vistazo. */
export const spotDe = (d) => d.barras.map((b) => b.spot);

/** El strike de la rejilla (múltiplo de 5) más cercano a un precio. */
export const rejilla = (x) => Math.round(x / 5) * 5;

/** Precio de compra (ask) de un contrato en una barra. null si no cotizaba. */
export const compraEn = (barra, K, lado) => barra.o.get(K + lado)?.[1] ?? null;
/** Precio de venta (bid). null si no cotizaba. */
export const ventaEn  = (barra, K, lado) => barra.o.get(K + lado)?.[0] ?? null;

/**
 * EJECUTA UNA OPERACIÓN con precios reales.
 *  - entra en la barra `iEntrada` comprando al ASK
 *  - sale en la barra `iSalida` vendiendo al BID; si iSalida es la última, liquida al valor
 *    intrínseco contra el spot de cierre (SPXW liquida en efectivo)
 * Devuelve null si falta cualquiera de los dos precios: un hueco no es un cero.
 */
export function operar(dia, iEntrada, iSalida, K, lado) {
  const be = dia.barras[iEntrada], bs = dia.barras[iSalida];
  if (!be || !bs || iSalida <= iEntrada) return null;
  const coste = compraEn(be, K, lado);
  if (coste == null || !(coste > 0)) return null;
  let ingreso = ventaEn(bs, K, lado);
  if (ingreso == null) return null;
  // en la última barra el bid puede estar hueco: liquida como lo hace el contrato
  if (iSalida === dia.barras.length - 1) {
    const intr = lado === "C" ? Math.max(0, bs.spot - K) : Math.max(0, K - bs.spot);
    ingreso = Math.min(ingreso, intr) || intr;
  }
  return {
    coste, ingreso,
    ret: (ingreso - coste) / coste,
    dolares: (ingreso - coste) * 100,
    horquillaPct: (compraEn(be, K, lado) - ventaEn(be, K, lado)) / compraEn(be, K, lado),
  };
}

/**
 * Posición de una hora en la lista de barras ("11:00" → índice).
 * LANZA si esa hora no existe. No devuelve -1: un -1 usado como índice se convierte en
 * `undefined` o, peor, alguien lo cambia por 0 "por si acaso" y mide otra cosa sin enterarse.
 * Las barras válidas van de 09:35 a 16:00 de 5 en 5. Las 09:30 NO existen.
 */
export function idxHora(dia, hhmm) {
  const i = dia.barras.findIndex((b) => b.t === hhmm);
  if (i < 0) {
    throw new Error(
      `la barra «${hhmm}» no existe el ${dia.dia}. Las barras van de ${dia.barras[0].t} a ` +
      `${dia.barras[dia.barras.length - 1].t}. Si querías la primera, usa primeraBarra().`);
  }
  return i;
}

/** El índice de la primera barra del día (siempre 09:35), dicho a las claras. */
export const primeraBarra = () => 0;

/** Como idxHora pero devuelve -1 en vez de lanzar, para quien de verdad quiera comprobarlo. */
export const hayHora = (dia, hhmm) => dia.barras.findIndex((b) => b.t === hhmm);

/** Media, desviación y t de Student de una muestra. */
export function resumen(v) {
  const n = v.length;
  if (n < 2) return { n, media: NaN, t: NaN, aciertos: NaN };
  const m = v.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  return { n, media: m, sd, t: (m * Math.sqrt(n)) / (sd || Infinity), aciertos: v.filter((x) => x > 0).length / n };
}


// ═══ ESTRUCTURAS DE VARIAS PATAS ═══════════════════════════════════════════════════════════
//
// El mapa de las 12.780 parejas de horas dice que COMPRAR 0DTE por la tarde pierde entre el 9%
// y el 19% por operación, con 3.492 casillas a t<−2 y CERO casillas a t>+2. Eso apunta al otro
// lado: vender esa estructura. Pero vender sólo tiene sentido con riesgo definido (Lester opera
// verticales en Robinhood, nunca desnudo), y eso son varias patas.
//
// La contabilidad de varias patas es donde es fácil engañarse, así que va aquí y una sola vez:
//   - la pata que se COMPRA se paga al ASK
//   - la pata que se VENDE se cobra al BID
//   - y al cerrar, al revés: lo comprado se vende al BID y lo vendido se recompra al ASK
// Se paga la horquilla en las cuatro patas y dos veces. Es el peaje real, no una aproximación.

/**
 * Ejecuta una estructura de varias patas con precios reales.
 * @param patas  [{ K, lado:"C"|"P", dir:+1 compra / −1 venta }]
 * @param iSalida  índice de barra, o "vencimiento" para liquidar al intrínseco del cierre
 * @returns { credito, cierre, dolares, riesgoMax, retSobreRiesgo } | null si falta un precio
 */
export function estructura(dia, iEntrada, iSalida, patas) {
  const be = dia.barras[iEntrada];
  if (!be) return null;

  // ── entrada ──────────────────────────────────────────────────────────────
  let credito = 0;                       // positivo = entra dinero en la cuenta
  for (const p of patas) {
    const par = be.o.get(p.K + p.lado);
    if (!par) return null;               // un hueco no es un cero
    const [bid, ask] = par;
    if (!(ask > 0)) return null;
    credito += p.dir === -1 ? bid : -ask; // vendo al bid, compro al ask
  }

  // ── salida ───────────────────────────────────────────────────────────────
  let cierre = 0;                        // lo que cuesta deshacer (positivo = sale dinero)
  if (iSalida === "vencimiento") {
    const S = dia.barras[dia.barras.length - 1].spot;
    for (const p of patas) {
      const intr = p.lado === "C" ? Math.max(0, S - p.K) : Math.max(0, p.K - S);
      cierre += p.dir === -1 ? intr : -intr;   // lo vendido se liquida contra ti
    }
  } else {
    const bs = dia.barras[iSalida];
    if (!bs || iSalida <= iEntrada) return null;
    for (const p of patas) {
      const par = bs.o.get(p.K + p.lado);
      if (!par) return null;
      const [bid, ask] = par;
      if (!(ask > 0)) return null;
      cierre += p.dir === -1 ? ask : -bid;     // recompro al ask, vendo al bid
    }
  }

  // ── riesgo máximo: la anchura más ancha entre una vendida y su cobertura ──
  let riesgoMax = 0;
  for (const v of patas.filter((p) => p.dir === -1)) {
    const cobs = patas.filter((p) => p.dir === 1 && p.lado === v.lado);
    if (!cobs.length) return null;             // desnudo: no se mide aquí
    const anchura = Math.min(...cobs.map((c) => Math.abs(c.K - v.K)));
    riesgoMax = Math.max(riesgoMax, anchura - credito);
  }

  const dolares = (credito - cierre) * 100;
  return {
    credito, cierre, dolares,
    riesgoMax: riesgoMax * 100,
    retSobreRiesgo: riesgoMax > 0 ? (credito - cierre) / riesgoMax : NaN,
  };
}

/** Cóndor de hierro centrado en `centro`: vende a ±ancho, compra a ±(ancho+ala). */
export const condor = (centro, ancho, ala) => [
  { K: centro + ancho, lado: "C", dir: -1 },
  { K: centro + ancho + ala, lado: "C", dir: 1 },
  { K: centro - ancho, lado: "P", dir: -1 },
  { K: centro - ancho - ala, lado: "P", dir: 1 },
];

/** Vertical de crédito: vende en K, compra `ala` puntos más lejos del dinero. */
export const vertical = (K, lado, ala) => [
  { K, lado, dir: -1 },
  { K: lado === "C" ? K + ala : K - ala, lado, dir: 1 },
];


// ═══ LA HUELLA DACTILAR DEL GEX ════════════════════════════════════════════════════════════
//
// Lester: «tienes que ver qué tenía el GEX en ese momento e intentar replicarlo; cuando veas
// los mismos patrones, entonces te metes».
//
// Tenía razón en el reproche. La medición anterior cogía UN número del GEX (la distancia al
// strike con más interés abierto) y lo probaba como señal. Eso no es «ver el patrón»: es
// resumir toda la foto en un escalar y tirar el resto. Esto de aquí conserva la FORMA entera.
//
// ═══ POR QUÉ EN PORCENTAJE Y NO EN PUNTOS ══════════════════════════════════════════════════
//
// El SPX pasó de 4.700 a 7.700 en la muestra. 25 puntos eran el 0,62% en 2022 y el 0,35% en
// 2026: un umbral en puntos se afloja solo según sube el índice, y eso ya infló un hallazgo de
// este proyecto. Todo aquí va en % del nivel del índice.
//
// ═══ POR QUÉ NORMALIZADO POR EL TOTAL ══════════════════════════════════════════════════════
//
// Sumar contratos mide el TAMAÑO de la cadena, no su forma (correlación 0,756 con el simple
// recuento de contratos: por eso SPY salía en el tercio «más volátil»). Dos días con la misma
// silueta y distinto tamaño tienen que salir IGUALES. Por eso cada casilla se divide por el
// total del día: lo que queda es la silueta.

const BINS = 24;                 // de −3% a +3% del spot, en pasos de 0,25%
const PASO = 0.0025;
const BORDE = 0.03;

/**
 * La huella del GEX de un día: la silueta del interés abierto alrededor del precio.
 * @param oi   { "7750|C": 1500, … }  el del ARRANQUE del día
 * @param spot el precio de referencia (normalmente el de la primera barra)
 * @returns null si no hay OI suficiente
 */
export function perfilGex(oi, spot) {
  if (!oi || !(spot > 0)) return null;

  const callBin = new Array(BINS).fill(0);
  const putBin = new Array(BINS).fill(0);
  let totalC = 0, totalP = 0;
  let mejorC = null, mejorP = null, mejorTotal = null;
  // Los muros GLOBALES de una 0DTE caen lejísimos (el 21 de agosto: calls en 8200, +6,9%, y
  // puts en 6125, −20,2%): son strikes de lotería con OI heredado, no niveles que nadie mire.
  // Por eso se guardan TAMBIÉN los muros restringidos a ±2%, que es lo que un operador ve en
  // pantalla. Las dos lecturas son legítimas y hay que probar las dos, no elegir una a dedo.
  let cercaC = null, cercaP = null;
  const porStrike = new Map();

  for (const [clave, n] of Object.entries(oi)) {
    if (!(n > 0)) continue;
    const [ks, lado] = clave.split("|");
    const K = Number(ks);
    if (!(K > 0)) continue;
    const d = (K - spot) / spot;                       // distancia relativa, con signo

    if (lado === "C") {
      totalC += n;
      if (d > 0 && (!mejorC || n > mejorC.n)) mejorC = { K, n, d };
      if (d > 0 && d < 0.02 && (!cercaC || n > cercaC.n)) cercaC = { K, n, d };
    } else {
      totalP += n;
      if (d < 0 && (!mejorP || n > mejorP.n)) mejorP = { K, n, d };
      if (d < 0 && d > -0.02 && (!cercaP || n > cercaP.n)) cercaP = { K, n, d };
    }

    const t = (porStrike.get(K) ?? 0) + n;
    porStrike.set(K, t);
    if (Math.abs(d) < 0.02 && (!mejorTotal || t > mejorTotal.n)) mejorTotal = { K, n: t, d };

    if (Math.abs(d) < BORDE) {
      const i = Math.min(BINS - 1, Math.max(0, Math.floor((d + BORDE) / PASO)));
      (lado === "C" ? callBin : putBin)[i] += n;
    }
  }

  const total = totalC + totalP;
  if (!(total > 0)) return null;

  // desbalance calls/puts a tres distancias
  const desb = (radio) => {
    let c = 0, p = 0;
    for (const [clave, n] of Object.entries(oi)) {
      const [ks, lado] = clave.split("|");
      const d = Math.abs((Number(ks) - spot) / spot);
      if (d <= radio) { if (lado === "C") c += n; else p += n; }
    }
    return c + p > 0 ? (c - p) / (c + p) : 0;
  };

  // concentración: qué parte del OI vive en los 5 strikes más gordos
  const top5 = [...porStrike.values()].sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0);

  // punto de giro: donde el saldo calls−puts ponderado por cercanía cambia de signo
  let giro = null, ant = null;
  for (let x = spot * 0.97; x <= spot * 1.03; x += spot * 0.0005) {
    let g = 0;
    for (const [clave, n] of Object.entries(oi)) {
      const [ks, lado] = clave.split("|");
      const K = Number(ks);
      g += (n / (1 + Math.abs(K - x) / (spot * 0.0013))) * (lado === "C" ? 1 : -1);
    }
    if (ant !== null && Math.sign(g) !== Math.sign(ant.g)) { giro = (x + ant.x) / 2; break; }
    ant = { x, g };
  }

  return {
    spot,
    // LA SILUETA — 48 números normalizados. Esto es lo que se compara entre días.
    silueta: [...callBin.map((x) => x / total), ...putBin.map((x) => x / total)],
    // los escalares que la resumen, todos en % del índice
    muroCallPct: mejorC ? mejorC.d * 100 : null,
    muroPutPct: mejorP ? mejorP.d * 100 : null,
    imanPct: mejorTotal ? mejorTotal.d * 100 : null,
    giroPct: giro ? ((giro - spot) / spot) * 100 : null,
    pasilloPct: mejorC && mejorP ? (mejorC.d - mejorP.d) * 100 : null,
    desbalance05: desb(0.005), desbalance1: desb(0.01), desbalance2: desb(0.02),
    concentracion: top5 / total,
    ratioCallPut: totalP > 0 ? totalC / totalP : null,
    totalContratos: total,             // el TAMAÑO, aparte de la forma, para poder controlarlo
    muroCallCercaPct: cercaC ? cercaC.d * 100 : null,
    muroPutCercaPct: cercaP ? cercaP.d * 100 : null,
    pasilloCercaPct: cercaC && cercaP ? (cercaC.d - cercaP.d) * 100 : null,
    muroCallK: mejorC?.K ?? null, muroPutK: mejorP?.K ?? null, imanK: mejorTotal?.K ?? null,
    muroCallCercaK: cercaC?.K ?? null, muroPutCercaK: cercaP?.K ?? null,
  };
}

/** Distancia entre dos siluetas (0 = idénticas). Es la distancia euclídea de los 48 números. */
export function distanciaSilueta(a, b) {
  if (!a || !b) return Infinity;
  let s = 0;
  for (let i = 0; i < a.silueta.length; i++) s += (a.silueta[i] - b.silueta[i]) ** 2;
  return Math.sqrt(s);
}

// ═══ EL DÍA DE EDUARDO ═════════════════════════════════════════════════════════════════════
//
// El 21 de agosto de 2026 NO está en los 1.123 días descargados (la descarga llega al 10 de
// agosto). Se bajó aparte y vive en cache-theta/dia-21/, en carpeta SEPARADA a propósito para
// que nadie lo mezcle sin querer con la serie histórica.
//
// AVISO HONESTO SOBRE SU PRECIO: los ficheros del 21 vienen del endpoint de cotizaciones, que
// NO trae la columna underlying_price. El spot de cada barra está deducido por PARIDAD
// PUT-CALL (spot = K + call − put, con la mediana de todos los strikes cercanos). Eso es una
// identidad de no-arbitraje entre dos precios que existen de verdad, no un modelo de precios.
// Comprobación: da apertura 7.674,18, máximo 7.695,30 y cierre 7.674,53, contra el cierre
// oficial del índice de 7.674,37 — cuadra a 16 centésimas.

export function cargarDia21() {
  const dir = join(CACHE, "dia-21");
  if (!existsSync(join(dir, "barras.json"))) return null;
  const crudas = JSON.parse(readFileSync(join(dir, "barras.json"), "utf8"));
  const barras = crudas.map((b) => ({ t: b.t, spot: b.spot, o: new Map(Object.entries(b.o)) }));
  const oi = JSON.parse(readFileSync(join(dir, "oi.json"), "utf8"));
  return { dia: "2026-08-21", barras, oi };
}

/** Las cuatro operaciones que Eduardo publicó, tal cual aparecen en su captura. */
export const OPERACIONES_EDUARDO = [
  { strike: 7690, lado: "C", ganancia: 900, retorno: 0.3615 },
  { strike: 7685, lado: "C", ganancia: 250, retorno: 0.3206 },
  { strike: 7685, lado: "C", ganancia: 170, retorno: 0.2099 },
  { strike: 7675, lado: "C", ganancia: 150, retorno: 0.0803 },
];


// ═══ LAS MONTAÑAS: LO QUE SOBRESALE, NO LO QUE ES MÁS GRANDE ═══════════════════════════════
//
// ═══ EL ERROR QUE ESTO CORRIGE ══════════════════════════════════════════════════════════════
//
// Todo lo que este proyecto ha medido del «imán» usaba EL MÁXIMO DE OI DENTRO DE UNA VENTANA.
// Eso no es lo que una persona ve en pantalla, y el 21 de agosto lo demuestra:
//
//   con el precio de las 09:30 el máximo dentro de ±2% era el 7700 (13.993 contratos)
//   con el de las 09:35, siete puntos más abajo, entraba el 7520 (14.979) y el «imán» saltaba
//   de estar un 0,34% POR ENCIMA a estar un 1,92% POR DEBAJO
//
// Siete puntos de índice le dan la vuelta. Un número así no puede disparar una operación.
//
// Y sin embargo el 7700 SÍ se ve, y se ve igual a las 09:30 que a las 15:00: tiene casi el
// CUÁDRUPLE de contratos que sus vecinos. El 7520 tiene más contratos en bruto pero vive en
// una zona donde todo es grande, así que en pantalla no destaca.
//
// Lo que se ve es la PROMINENCIA: cuánto sobresale un strike de lo que tiene alrededor. Eso es
// estable, no depende de dónde cortes la ventana, y es lo que mide esta función.
//
// ═══ CÓMO SE MIDE ══════════════════════════════════════════════════════════════════════════
//
//   prominencia(K) = OI(K) / mediana del OI de los vecinos dentro de ±W, sin contar K
//
// Se usa la MEDIANA de los vecinos y no la media porque la media la infla el propio pico de al
// lado. Una prominencia de 1 significa «igual que sus vecinos»; el 7700 del 21 sale por encima
// de 3,5.

/**
 * Las montañas de interés abierto de un día.
 * @param oi        { "7700|C": 8404, "7700|P": 5589, … } el del arranque
 * @param spot      precio de referencia
 * @param vecindad  radio en puntos para calcular la mediana de vecinos (por defecto 30)
 * @returns { picos, mapa } o null
 *   picos: ordenados por prominencia, cada uno
 *     { K, total, calls, puts, prominencia, distPct, sesgo }
 *     sesgo = (calls − puts)/(calls + puts) del PROPIO strike
 */
export function picos(oi, spot, vecindad = 30) {
  if (!oi || !(spot > 0)) return null;
  const mapa = new Map();
  for (const [clave, n] of Object.entries(oi)) {
    if (!(n > 0)) continue;
    const [ks, lado] = clave.split("|");
    const K = Number(ks);
    if (!(K > 0)) continue;
    const e = mapa.get(K) ?? { K, calls: 0, puts: 0 };
    if (lado === "C") e.calls += n; else e.puts += n;
    mapa.set(K, e);
  }
  const ks = [...mapa.keys()].sort((a, b) => a - b);
  if (ks.length < 5) return null;
  for (const K of ks) { const e = mapa.get(K); e.total = e.calls + e.puts; }

  const lista = [];
  for (const K of ks) {
    const vec = ks.filter((x) => x !== K && Math.abs(x - K) <= vecindad).map((x) => mapa.get(x).total);
    if (vec.length < 3) continue;                     // sin vecinos suficientes no hay prominencia
    vec.sort((a, b) => a - b);
    const medianaVec = vec[Math.floor(vec.length / 2)];
    if (!(medianaVec > 0)) continue;
    const e = mapa.get(K);
    lista.push({
      K, total: e.total, calls: e.calls, puts: e.puts,
      prominencia: e.total / medianaVec,
      distPct: ((K - spot) / spot) * 100,
      sesgo: e.total > 0 ? (e.calls - e.puts) / e.total : 0,
    });
  }
  lista.sort((a, b) => b.prominencia - a.prominencia);
  return { picos: lista, mapa };
}

/**
 * La montaña más cercana por encima (y por debajo) del precio, con una prominencia mínima.
 * Ésta es la lectura de Eduardo: «hay un montón gordo justo encima».
 */
export function montanaCerca(pk, spot, minProminencia = 2, maxDistPct = 1.5) {
  if (!pk) return { arriba: null, abajo: null };
  const val = pk.picos.filter((p) => p.prominencia >= minProminencia && Math.abs(p.distPct) <= maxDistPct);
  const arr = val.filter((p) => p.K > spot).sort((a, b) => a.K - b.K)[0] ?? null;
  const aba = val.filter((p) => p.K < spot).sort((a, b) => b.K - a.K)[0] ?? null;
  return { arriba: arr, abajo: aba };
}

/**
 * EL HUECO: los strikes que quedan entre el precio y una montaña.
 * Es donde Eduardo compró: 7675, 7685 y 7690, con la montaña en 7700 y el precio en 7674.
 * Devuelve los strikes ordenados del más cercano al precio al más pegado a la montaña, con el
 * sesgo calls/puts de cada uno — el 7690 era el más cargado de calls de todo el hueco.
 */
export function hueco(pk, spot, montana) {
  if (!pk || !montana) return [];
  const arriba = montana.K > spot;
  const dentro = [...pk.mapa.values()].filter((e) =>
    arriba ? (e.K > spot && e.K < montana.K) : (e.K < spot && e.K > montana.K));
  dentro.sort((a, b) => (arriba ? a.K - b.K : b.K - a.K));
  return dentro.map((e) => ({
    K: e.K, calls: e.calls, puts: e.puts, total: e.total,
    sesgo: e.total > 0 ? (e.calls - e.puts) / e.total : 0,
    distPct: ((e.K - spot) / spot) * 100,
  }));
}
