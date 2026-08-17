// ¿HAY UN VEHÍCULO MEJOR QUE LA CALL DESNUDA PARA EL BRAZO CONVEXO?
//
// Uso:  node --max-old-space-size=8192 scripts/conv-vehiculos.mjs
// Salida: scripts/conv-vehiculos-resultado.json  (+ tablas por stdout)
//
// ═══ LA PREGUNTA ═════════════════════════════════════════════════════════════════════════════
// El brazo convexo de la cartera es hoy una call desnuda muy fuera del dinero. Ya se midió que el
// spread de calls RESTA cuando hay señal y SUMA cuando no la hay, pero sólo se probó ESE vehículo
// alternativo. Aquí se prueban cuatro contra la referencia, con el mismo subyacente, la misma
// fecha de entrada y el mismo vencimiento — comparación PAREADA, que es la potente.
//
// Lo que se busca: el vehículo que CONSERVE LA COLA (el 30x) pagando menos por esperar.
//
// ═══ CRITERIO ESCRITO ANTES DE CORRER ════════════════════════════════════════════════════════
// PRUEBAS DECLARADAS = 4 vehículos alternativos × 2 distancias (m=1,5σ y m=2,5σ) × 2 horizontes
//                      (~90 días y ~365 días) = 16.  Listón de Bonferroni: listonT(16) ≈ 2,95.
//
// Para que un vehículo se declare MEJOR que la call desnuda hace falta, TODO a la vez:
//   1. retorno medio sobre capital comprometido MAYOR que el de la call desnuda,
//   2. diferencia PAREADA con |t| ≥ listón,
//   3. mismo signo de la diferencia en los TRES TERCIOS de tiempo,
//   4. ningún ticker por encima del 20% de la muestra (con 28 tickers se cumple solo, se verifica),
//   5. la ventaja sobrevive a punto-medio-a-punto-medio (si sólo existe con horquilla real, era
//      peaje de liquidez y no vehículo — trampa nº4),
//   6. conserva la cola: el percentil 99 y el % de sucesos con ≥ 10x NO pueden caer a la mitad.
// Si un vehículo gana en media y pierde la cola, NO sirve para el brazo convexo: se dice.
//
// ═══ LAS TRAMPAS Y CÓMO SE EVITAN ════════════════════════════════════════════════════════════
// nº1 FUTURO POR EL PREPROCESADO. Todo lo que decide la operación se calcula con la cadena DE ESE
//     DÍA: el spot por paridad put-call, la distancia en sigmas por el straddle ATM (Black-Scholes
//     AL REVÉS, sacando sigma de un precio real), y los strikes listados ese día. Los 28 tickers
//     son los que hay en disco — se declara que 8 de ellos son los ganadores de la década y por eso
//     se reporta SIEMPRE la tabla por ticker.
// nº2 EL DATO NO CONTIENE LO QUE CREES. El descargador (bajar-cadenas-todos-los-dias.ts, línea del
//     filtro) TIRA toda fila con bid<=0. Consecuencia: los strikes muy lejanos que cotizan
//     0,00 × 0,05 NO ESTÁN. El "muy fuera" que se puede medir está topado por donde hay puja.
//     Se cuenta y se reporta cuántos sucesos se pierden por eso.
// nº3 LO QUE VALE CERO DESAPARECE. Por eso el vencimiento NO se lee de la cadena: se liquida por
//     intrínseco contra el precio REAL del subyacente ese día. Una call que expira sin valor da 0,
//     no "sin dato". AUSENTE = CERO = pérdida total.
// nº4 LA VENTAJA QUE ERA PEAJE. Todo se calcula DOS veces: con precios reales (se paga el ask, se
//     cobra el bid) y a punto medio. La diferencia ES el peaje, y se reporta por vehículo porque
//     el backspread y el calendario tocan más patas.
// nº5 CONTROL DE UNA SOLA TIRADA. No aplica un control aleatorio de strikes aquí (la comparación
//     es pareada suceso a suceso, que es más fuerte), pero el intervalo de confianza se da con
//     bootstrap de 2.000 remuestreos por bloques de ticker.
// nº6 CONTAR PATAS EN VEZ DE SUCESOS. La unidad es el SUCESO = (ticker, fecha de entrada). Las
//     entradas son trimestrales para el horizonte de 90 días y anuales para el de 365, así que las
//     ventanas de un mismo ticker NO se solapan y ningún vencimiento se compra dos veces.
//
// SPLITS. Un split parte el contrato: el que tenía 1 call de strike K pasa a tener f calls de
// strike K/f. El pago correcto es max(0, S_exp·f − K)·100, con f = factor acumulado entre entrada
// y vencimiento. Se detectan del propio dato (salto del spot ≥1,8x o ≤0,55x) y se reportan.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const CD = "scripts/cache-theta/cadenas";
const CIER = "scripts/cache-theta/cierres";
const INDICE = "scripts/conv-indice.json";
const SALIDA = "scripts/conv-vehiculos-resultado.json";

const PRUEBAS_DECLARADAS = 16;
const MS = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);
const dias = (a, b) => Math.round((MS(b) - MS(a)) / 86400000);
const fecha = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

// ── estadística ─────────────────────────────────────────────────────────────
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
const varianza = (v) => { if (v.length < 2) return 0; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const sd = (v) => Math.sqrt(varianza(v));
const pct = (v, p) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1)))); return s[i]; };
const mediana = (v) => pct(v, 50);
/** t de una muestra pareada (H0: media de las diferencias = 0). */
function tPareada(dif) {
  if (dif.length < 3) return 0;
  const s = sd(dif);
  return s > 0 ? media(dif) / (s / Math.sqrt(dif.length)) : 0;
}
function listonT(pruebas) {
  if (pruebas <= 1) return 2;
  const p = 0.05 / pruebas / 2;
  const t = Math.sqrt(-2 * Math.log(p));
  return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100;
}
const LISTON = listonT(PRUEBAS_DECLARADAS);

/** LANZA si un campo está muerto — el fallo silencioso de leer ceros durante 45 minutos. */
function exigir(cond, msg) { if (!cond) throw new Error(`FALLO CERRADO: ${msg}`); }

// ── caché de cadenas ────────────────────────────────────────────────────────
const cacheCadena = new Map();
let LECTURAS = 0;
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cacheCadena.has(k)) return cacheCadena.get(k);
  const f = `${CD}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { v = JSON.parse(readFileSync(f, "utf8")); LECTURAS++; }
  if (cacheCadena.size > 4000) cacheCadena.clear();
  cacheCadena.set(k, v);
  return v;
}

const mid = (q) => (q[0] + q[1]) / 2;

/**
 * Spot del día a partir de la cadena, por paridad put-call sobre el vencimiento más cercano
 * (3-60 días) y el strike donde |C−P| es mínimo. Validado contra los cierres reales: 0,1% de error.
 * No usa ningún modelo: sólo precios cotizados.
 */
function spotParidad(c, dia) {
  if (!c) return null;
  const exps = Object.keys(c).sort();
  for (const e of exps) {
    const d = dias(dia, e);
    if (d < 3 || d > 60) continue;
    const g = c[e];
    let best = null;
    for (const k of Object.keys(g)) {
      if (!k.endsWith("|C")) continue;
      const K = Number(k.slice(0, -2));
      const P = g[`${K}|P`];
      if (!P) continue;
      const dd = mid(g[k]) - mid(P);
      if (!best || Math.abs(dd) < Math.abs(best.d)) best = { K, d: dd };
    }
    if (best) return best.K + best.d;
  }
  return null;
}

// ── cierres reales (2021+) ──────────────────────────────────────────────────
const cierres = new Map();
for (const f of readdirSync(CIER)) {
  const t = f.replace(".json", "");
  cierres.set(t, JSON.parse(readFileSync(`${CIER}/${f}`, "utf8")));
}

const TICKERS = [...new Set(readdirSync(CD).map((f) => (/^([A-Z]+)_d\d{8}\.json$/.exec(f) || [])[1]).filter(Boolean))].sort();
const diasDe = new Map();
for (const f of readdirSync(CD)) {
  const m = /^([A-Z]+)_d(\d{8})\.json$/.exec(f);
  if (!m) continue;
  if (!diasDe.has(m[1])) diasDe.set(m[1], []);
  diasDe.get(m[1]).push(m[2]);
}
for (const v of diasDe.values()) v.sort();

/** Spot real de un día: el cierre si existe (2021+), si no la paridad de la cadena. */
function spot(sym, dia) {
  const c = cierres.get(sym);
  if (c && c[dia] > 0) return c[dia];
  return spotParidad(cadena(sym, dia), dia);
}

// ═════════════════════════════════════════════════════════════════════════════
// ÍNDICE: serie de spot semanal por ticker (para detectar splits en 2016-2020, donde no hay
// cierres). Se cachea porque cuesta unos minutos.
// ═════════════════════════════════════════════════════════════════════════════
function construirIndice() {
  if (existsSync(INDICE)) return JSON.parse(readFileSync(INDICE, "utf8"));
  console.log("  construyendo el índice de spot semanal (una vez, ~2 min)…");
  const out = {};
  for (const t of TICKERS) {
    const ds = diasDe.get(t);
    const serie = {};
    for (let i = 0; i < ds.length; i += 5) {
      const s = spot(t, ds[i]);
      if (s > 0) serie[ds[i]] = Math.round(s * 100) / 100;
    }
    out[t] = serie;
    process.stdout.write(`\r    ${t} (${Object.keys(serie).length} puntos)      `);
  }
  console.log("");
  writeFileSync(INDICE, JSON.stringify(out), "utf8");
  return out;
}

/** Todos los strikes cotizados del día (de cualquier vencimiento). */
function todosStrikes(sym, dia) {
  const c = cadena(sym, dia);
  const s = new Set();
  if (!c) return s;
  for (const g of Object.values(c)) for (const k of Object.keys(g)) s.add(Number(k.slice(0, -2)));
  return s;
}

/**
 * Factor de split por SOLAPE DE REJILLAS. El día del split la rejilla nueva es la vieja dividida
 * por el factor: se prueban los candidatos y gana el que hace coincidir más strikes.
 * Es exacto, y no lo estropea que la acción se mueva ese día.
 */
function factorPorRejilla(sym, antes, despues, ratioPrecio) {
  const A = [...todosStrikes(sym, antes)], B = todosStrikes(sym, despues);
  if (A.length < 5 || B.size < 5) return null;
  const cand = [];
  for (let f = 2; f <= 20; f++) { cand.push(f); cand.push(1 / f); }
  cand.push(1.5, 2 / 3, 2.5, 0.4);
  let best = null;
  for (const f of cand) {
    // Sólo candidatos compatibles con el salto de precio: una acción no se mueve un 20% el día de
    // su split. Sin este cerco la rejilla le daba a GE un 1/10 cuando el precio decía 1/8 —
    // los contrasplits generan strikes ajustados que no son la rejilla vieja escalada.
    if (Math.abs(Math.log(ratioPrecio / f)) > 0.20) continue;
    let hit = 0;
    for (const k of A) {
      const v = Math.round((k / f) * 1000) / 1000;
      if (B.has(v)) hit++;
    }
    const r = hit / A.length;
    if (!best || r > best.r) best = { f, r, hit };
  }
  return best;
}

/**
 * Splits por ticker: día → factor.
 *
 * ⚠️ EL PRECIO NO DA EL FACTOR. La primera versión sacaba el factor de redondear el salto del
 * spot y le asignó a TSLA un 4:1 el 2020-08-31 cuando fue **5:1**: la acción subió 12,6% ESE
 * MISMO DÍA, así que el cociente de cierres era 4,44 y redondeaba a 4. Un factor mal por uno
 * multiplica o divide por 1,25 el pago de todos los contratos de esa ventana.
 *
 * ⚠️ Y EL STRIKE MÁXIMO TAMPOCO. La segunda versión usaba maxStrike(antes)/maxStrike(después) y
 * le dio a GE un 1:6 cuando fue **1:8**: la cola de strikes no se lista con la misma amplitud
 * antes y después, así que el máximo no es una referencia estable.
 *
 * Lo que sí es exacto es el SOLAPE DE LA REJILLA ENTERA: la rejilla nueva es la vieja dividida
 * por el factor. El salto del precio sólo sirve para encontrar el DÍA.
 */
function detectarSplits(indice) {
  const out = new Map();
  const avisos = [];
  for (const t of TICKERS) {
    const serie = indice[t];
    const ks = Object.keys(serie).sort();
    const lista = [];
    for (let i = 1; i < ks.length; i++) {
      const r = serie[ks[i - 1]] / serie[ks[i]];
      if (r < 1.8 && r > 0.56) continue;
      const ds = diasDe.get(t).filter((d) => d > ks[i - 1] && d <= ks[i]);
      let prev = serie[ks[i - 1]], prevD = ks[i - 1];
      for (const d of ds) {
        const s = spot(t, d);
        if (!(s > 0)) continue;
        const rr = prev / s;
        if (rr >= 1.8 || rr <= 0.56) {
          const b = factorPorRejilla(t, prevD, d, rr);
          if (!b) { avisos.push(`${t} ${d}: salto de precio ${rr.toFixed(2)}x pero ningún factor candidato es compatible — NO se trata como split`); prev = s; prevD = d; continue; }
          if (b.r < 0.2) avisos.push(`${t} ${d}: factor ${b.f} con sólo ${(b.r * 100).toFixed(0)}% de solape de rejilla — revisar`);
          lista.push({ dia: d, factor: b.f, de: prevD, spotAntes: prev, spotDespues: s, solape: b.r });
        }
        prev = s; prevD = d;
      }
    }
    if (lista.length) out.set(t, lista);
  }
  out.avisos = avisos;
  return out;
}

/** Factor acumulado entre dos fechas (excluyente en `a`, incluyente en `b`). */
function factorSplit(splits, sym, a, b) {
  const l = splits.get(sym);
  if (!l) return 1;
  let f = 1;
  for (const s of l) if (s.dia > a && s.dia <= b) f *= s.factor;
  return f;
}

// ═════════════════════════════════════════════════════════════════════════════
// CONSTRUCCIÓN DE UN SUCESO
// ═════════════════════════════════════════════════════════════════════════════

/** Strikes de calls cotizados en un vencimiento, ordenados. */
function strikesCall(g) {
  const out = [];
  for (const k of Object.keys(g)) if (k.endsWith("|C")) out.push(Number(k.slice(0, -2)));
  return out.sort((a, b) => a - b);
}

/** El strike cotizado más pequeño ≥ objetivo. null si no hay ninguno. */
function strikeArriba(ks, objetivo) {
  for (const K of ks) if (K >= objetivo) return K;
  return null;
}
/** El strike cotizado más cercano a un objetivo. */
function strikeCerca(ks, objetivo) {
  let best = null;
  for (const K of ks) if (best === null || Math.abs(K - objetivo) < Math.abs(best - objetivo)) best = K;
  return best;
}

/** Vencimiento con DTE más cercano al objetivo, dentro de la banda [0,6x, 1,7x]. */
function vencimientoObjetivo(c, dia, objetivo) {
  let best = null;
  for (const e of Object.keys(c)) {
    const d = dias(dia, e);
    if (d < objetivo * 0.6 || d > objetivo * 1.7) continue;
    if (!best || Math.abs(d - objetivo) < Math.abs(best.d - objetivo)) best = { e, d };
  }
  return best;
}

const HORIZONTES = [{ nombre: "90d", dte: 90, cadencia: "trimestral" }, { nombre: "365d", dte: 365, cadencia: "anual" }];
const EMES = [1.5, 2.5];

/**
 * Un suceso: (ticker, día de entrada, horizonte). Devuelve los cinco vehículos para cada m.
 * TODO con precios reales de la cadena de ese día. `null` = no se pudo construir, y se dice por qué.
 */
function construirSuceso(sym, dia, horizonte, splits, diag) {
  const c = cadena(sym, dia);
  if (!c) { diag.sinCadena++; return null; }
  const S = spot(sym, dia);
  if (!(S > 0)) { diag.sinSpot++; return null; }

  const v = vencimientoObjetivo(c, dia, horizonte.dte);
  if (!v) { diag.sinVencimiento++; return null; }
  const g = c[v.e];
  const ks = strikesCall(g);
  if (ks.length < 4) { diag.pocosStrikes++; return null; }

  // ── EM = movimiento de 1 sigma implícito por el straddle ATM (precio real, sin modelo hacia
  //    delante: es Black-Scholes AL REVÉS). straddle ≈ 0,7979·σ√T·S  →  σ√T·S ≈ 1,253·straddle.
  const kAtm = strikeCerca(ks.filter((K) => g[`${K}|P`]), S);
  if (kAtm === null) { diag.sinAtm++; return null; }
  const straddle = mid(g[`${kAtm}|C`]) + mid(g[`${kAtm}|P`]);
  const EM = 1.253 * straddle;
  if (!(EM > 0)) { diag.emCero++; return null; }

  const fTotal = factorSplit(splits, sym, dia, v.e);
  const Sexp = spot(sym, v.e);
  if (!(Sexp > 0)) { diag.sinSpotVenc++; return null; }
  const Sajust = Sexp * fTotal;   // precio al vencimiento en unidades de la ENTRADA

  const base = { sym, dia, exp: v.e, dte: v.d, S, Sexp, fTotal, EM, kAtm, straddle };
  const salida = {};

  for (const m of EMES) {
    const objFar = S + m * EM;
    const Kfar = strikeArriba(ks, objFar);
    // Si la rejilla es tan gruesa que el strike disponible se pasa más de 0,5σ del objetivo, este
    // suceso NO se mide: mediríamos otra distancia y la llamaríamos m.
    if (Kfar === null || Kfar - objFar > 0.5 * EM) {
      diag.sinStrikeFar[m] = (diag.sinStrikeFar[m] || 0) + 1;
      diag.porTicker[`${m}|${sym}`] = (diag.porTicker[`${m}|${sym}`] || 0) + 1;
      continue;
    }
    const qFar = g[`${Kfar}|C`];
    if (!qFar || !(qFar[1] > 0)) { diag.sinPrecioFar[m] = (diag.sinPrecioFar[m] || 0) + 1; continue; }

    const intr = (K) => Math.max(0, Sajust - K) * 100;

    // ══ 1. CALL DESNUDA (referencia) ══════════════════════════════════════
    const costeReal = qFar[1] * 100;          // se paga el ASK
    const costeMid = mid(qFar) * 100;
    const desnuda = {
      capital: costeReal,
      pnl: intr(Kfar) - costeReal,
      pnlMid: intr(Kfar) - costeMid,
      capitalMid: costeMid,
      patas: 1,
      detalle: { Kfar, ask: qFar[1], bid: qFar[0] },
    };

    // ══ 2. BACKSPREAD 1×2: vender 1 a (m−1)σ, comprar 2 a mσ ══════════════
    let backspread = null;
    const objNear = S + Math.max(0.25, m - 1.0) * EM;
    const Knear = strikeArriba(ks, objNear);
    if (Knear !== null && Knear < Kfar && g[`${Knear}|C`] && g[`${Knear}|C`][0] > 0) {
      const qNear = g[`${Knear}|C`];
      const coste = (2 * qFar[1] - qNear[0]) * 100;         // pago 2 asks, cobro 1 bid
      const costeM = (2 * mid(qFar) - mid(qNear)) * 100;
      const pago = 2 * intr(Kfar) - intr(Knear);
      const cap = (Kfar - Knear) * 100 + coste;             // pérdida máxima (en S = Kfar)
      const capM = (Kfar - Knear) * 100 + costeM;
      if (cap > 0 && capM > 0) {
        backspread = { capital: cap, capitalMid: capM, pnl: pago - coste, pnlMid: pago - costeM, patas: 3, detalle: { Knear, Kfar, coste } };
      }
    }

    // ══ 3. CALENDARIO: comprar la larga a mσ, vender cortas al MISMO strike, rodando ═══
    const calendario = construirCalendario(sym, dia, v.e, Kfar, splits, fTotal, Sajust, qFar, false);

    // ══ 4. DIAGONAL: igual, pero la corta a la MISMA SIGMA de SU vencimiento (más cerca en
    //    dólares, cobra prima de verdad, y por eso se come parte de la explosión) ══════
    const diagonal = construirCalendario(sym, dia, v.e, Kfar, splits, fTotal, Sajust, qFar, true, m);

    // ══ 5. ESCALERA: el MISMO PRESUPUESTO repartido a partes iguales en 5 strikes ═════
    let escalera = null;
    const peldanos = [];
    for (const mm of [m - 1.0, m - 0.5, m, m + 0.5, m + 1.0]) {
      if (mm <= 0) continue;
      const K = strikeArriba(ks, S + mm * EM);
      if (K === null) continue;
      const q = g[`${K}|C`];
      if (!q || !(q[1] > 0)) continue;
      peldanos.push({ K, q });
    }
    if (peldanos.length >= 3) {
      // partes iguales de presupuesto: el retorno es la media de los retornos por dólar
      const rs = peldanos.map((p) => intr(p.K) / (p.q[1] * 100) - 1);
      const rsM = peldanos.map((p) => intr(p.K) / (mid(p.q) * 100) - 1);
      escalera = {
        capital: costeReal, capitalMid: costeMid,       // se normaliza al mismo presupuesto
        pnl: media(rs) * costeReal, pnlMid: media(rsM) * costeMid,
        patas: peldanos.length, detalle: { peldanos: peldanos.map((p) => p.K) },
      };
    }

    salida[m] = { ...base, m, Kfar, otmPct: (Kfar / S - 1) * 100, desnuda, backspread, calendario, diagonal, escalera };
  }
  return salida;
}

/**
 * Calendario / diagonal. Compra la call larga (ask) y va vendiendo cortas (bid) hasta el
 * vencimiento largo. Cada corta se liquida por INTRÍNSECO contra el precio real del subyacente en
 * SU vencimiento — no por su cotización, que desaparece de la caché si vale cero.
 *
 * `mismaSigma=false` → corta al mismo strike que la larga (lo que pide el enunciado).
 * `mismaSigma=true`  → corta a la misma distancia en sigmas de SU propio vencimiento (diagonal).
 *
 * ⚠️ EL COLATERAL NO ES EL DÉBITO EN EL DIAGONAL. La primera versión ponía capital = lo pagado por
 * la larga en los dos casos, y el diagonal salía como el mejor vehículo del estudio: mismo retorno
 * medio que la call desnuda con un 15% de pérdidas totales en vez de un 91%. Es FALSO. En el
 * calendario la corta va al MISMO strike y con vencimiento anterior, así que la larga la cubre y
 * el colateral es el débito. En el diagonal la corta está MUY POR DEBAJO de la larga (2,5σ de 30
 * días son mucho menos dólares que 2,5σ de un año), la larga NO la cubre, y el bróker retiene
 * (K_larga − K_corta)×100. Con eso el capital se multiplica por veinte y el retorno se derrumba.
 * El P&L ya estaba bien —las cortas se liquidan por intrínseco—; lo que estaba mal era el
 * denominador, que es justo lo que decide si cabe en la cuenta.
 */
function construirCalendario(sym, dia, expLarga, Kfar, splits, fTotal, Sajust, qFar, mismaSigma, m = 0) {
  const costeLargo = qFar[1] * 100;
  const costeLargoM = mid(qFar) * 100;
  let flujo = 0, flujoM = 0;      // créditos cobrados menos liquidaciones pagadas
  let colateralExtra = 0;         // el pico de (K_larga − K_corta)×100 cuando la larga no cubre
  let cur = dia, nCortas = 0, sinCorta = 0;
  const ds = diasDe.get(sym);
  let guarda = 0;

  while (dias(cur, expLarga) > 45 && guarda++ < 20) {
    const c = cadena(sym, cur);
    if (!c) break;
    const vv = vencimientoObjetivo(c, cur, 30);
    if (!vv || vv.e >= expLarga) break;
    const gg = c[vv.e];
    const f0 = factorSplit(splits, sym, dia, cur);          // unidades de HOY vs unidades de entrada
    const kks = strikesCall(gg);
    let Kc = null;
    if (mismaSigma) {
      const Sc = spot(sym, cur);
      const kA = strikeCerca(kks.filter((K) => gg[`${K}|P`]), Sc);
      if (kA !== null && Sc > 0) {
        const EMc = 1.253 * (mid(gg[`${kA}|C`]) + mid(gg[`${kA}|P`]));
        Kc = strikeArriba(kks, Sc + m * EMc);
      }
    } else {
      Kc = Kfar / f0;                                       // el mismo strike, en unidades de hoy
      if (!gg[`${Kc}|C`]) Kc = null;
    }
    const q = Kc !== null ? gg[`${Kc}|C`] : null;
    if (q && q[0] > 0) {
      const fc = factorSplit(splits, sym, cur, vv.e);
      const Sc = spot(sym, vv.e);
      if (!(Sc > 0)) break;
      // todo en unidades de la ENTRADA: el strike de la corta multiplicado por f0
      const Kent = Kc * f0;
      const liq = Math.max(0, Sc * factorSplit(splits, sym, dia, vv.e) - Kent) * 100;
      flujo += q[0] * 100 * f0 - liq;      // f0 contratos por el split
      flujoM += mid(q) * 100 * f0 - liq;
      // colateral: la larga sólo cubre si su strike es ≤ el de la corta
      colateralExtra = Math.max(colateralExtra, Math.max(0, (Kfar - Kent) * 100));
      nCortas++;
    } else sinCorta++;
    cur = vv.e;
    // avanzar al siguiente día hábil tras el vencimiento de la corta
    const i = ds.findIndex((d) => d > cur);
    if (i < 0) break;
    cur = ds[i];
  }
  const intrLargo = Math.max(0, Sajust - Kfar) * 100;
  return {
    capital: costeLargo + colateralExtra, capitalMid: costeLargoM + colateralExtra,
    pnl: intrLargo + flujo - costeLargo,
    pnlMid: intrLargo + flujoM - costeLargoM,
    patas: 1 + nCortas, detalle: { nCortas, sinCorta, flujo, colateralExtra },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// ENTRADAS: una por (ticker, trimestre) para 90d y una por (ticker, año) para 365d.
// Ventanas NO solapadas dentro de un mismo ticker → cada suceso es terminal e independiente.
// ═════════════════════════════════════════════════════════════════════════════
function entradas(sym, horizonte) {
  const ds = diasDe.get(sym);
  const out = [];
  const vistos = new Set();
  for (const d of ds) {
    const clave = horizonte.cadencia === "trimestral"
      ? `${d.slice(0, 4)}Q${Math.floor((Number(d.slice(4, 6)) - 1) / 3)}`
      : d.slice(0, 4);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push(d);
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════
// CORRIDA
// ═════════════════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════════════════════════════════════════");
console.log("  VEHÍCULOS PARA EL BRAZO CONVEXO — call desnuda vs backspread / calendario /");
console.log("  diagonal / escalera. Precios reales, ausente = cero, unidad = suceso.");
console.log(`  ${PRUEBAS_DECLARADAS} pruebas declaradas → listón de Bonferroni |t| ≥ ${LISTON}`);
console.log("══════════════════════════════════════════════════════════════════════════════\n");

console.log(`## Radiografía del dato\n`);
console.log(`   ${TICKERS.length} tickers: ${TICKERS.join(" ")}`);
{
  let totalDias = 0;
  for (const t of TICKERS) totalDias += diasDe.get(t).length;
  console.log(`   ${totalDias} ficheros de cadena (${diasDe.get("AAPL")[0]} → ${diasDe.get("AAPL").slice(-1)[0]})`);
  console.log(`   cierres reales: ${cierres.size} tickers, ${Object.keys(cierres.get("AAPL")).length} días cada uno (2021+)`);
}

const indice = construirIndice();
const splits = detectarSplits(indice);
console.log(`\n   SPLITS detectados del propio dato:`);
let nSplits = 0;
for (const [t, l] of [...splits].sort()) for (const s of l) { console.log(`     ${t.padEnd(5)} ${fecha(s.dia)}  factor ${s.factor < 1 ? "1/" + Math.round(1 / s.factor) : s.factor}   (precio $${s.spotAntes}→$${s.spotDespues} = ${(s.spotAntes / s.spotDespues).toFixed(2)}x · solape de rejilla ${(s.solape * 100).toFixed(0)}%)`); nSplits++; }
if (!nSplits) console.log("     ninguno");
for (const a of splits.avisos ?? []) console.log(`     ⚠️  ${a}`);

// Validación cruzada paridad vs cierre real
{
  const errs = [];
  for (const t of TICKERS) {
    const ds = diasDe.get(t);
    for (let i = 0; i < ds.length; i += 31) {
      const d = ds[i];
      const cr = cierres.get(t)?.[d];
      if (!(cr > 0)) continue;
      const p = spotParidad(cadena(t, d), d);
      if (p > 0) errs.push(Math.abs(p - cr) / cr * 100);
    }
  }
  exigir(errs.length > 300, `sólo ${errs.length} puntos para validar la paridad: el campo está muerto`);
  console.log(`\n   VALIDACIÓN spot por paridad vs cierre real: n=${errs.length}, error mediano ${mediana(errs).toFixed(3)}%, p95 ${pct(errs, 95).toFixed(3)}%, máx ${Math.max(...errs).toFixed(2)}%`);
  console.log(`   (${errs.filter((x) => x > 2).length} puntos por encima del 2% — días de dividendo especial/escisión, donde la paridad no vale. Por eso el spot usado es el CIERRE REAL siempre que existe.)`);
  exigir(mediana(errs) < 0.5, `la paridad no reproduce el cierre real (mediana ${mediana(errs).toFixed(2)}%)`);
}

const VEH = ["desnuda", "backspread", "calendario", "diagonal", "escalera"];
const NOMBRE = { desnuda: "call desnuda", backspread: "backspread 1×2", calendario: "calendario", diagonal: "diagonal", escalera: "escalera 5 strikes" };
const resultados = {};
const salidaJsonDiag = {};

for (const H of HORIZONTES) {
  for (const m of EMES) resultados[`${H.nombre}|${m}`] = [];
  const diag = { sinCadena: 0, sinSpot: 0, sinVencimiento: 0, pocosStrikes: 0, sinAtm: 0, emCero: 0, sinSpotVenc: 0, sinStrikeFar: {}, sinPrecioFar: {}, porTicker: {} };
  let intentos = 0;
  const t0 = Date.now();
  for (const sym of TICKERS) {
    for (const d of entradas(sym, H)) {
      intentos++;
      const s = construirSuceso(sym, d, H, splits, diag);
      if (!s) continue;
      for (const m of EMES) if (s[m]) resultados[`${H.nombre}|${m}`].push(s[m]);
    }
    process.stdout.write(`\r   ${H.nombre}: ${sym}   `);
  }
  console.log(`\r   ${H.nombre}: ${intentos} entradas intentadas · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log(`      descartes: sin cadena ${diag.sinCadena} · sin spot ${diag.sinSpot} · sin vencimiento en banda ${diag.sinVencimiento} · pocos strikes ${diag.pocosStrikes} · sin ATM ${diag.sinAtm} · SIN RESOLVER (vence después del último dato) ${diag.sinSpotVenc}`);
  for (const m of EMES) {
    const n = diag.sinStrikeFar[m] || 0;
    const porT = Object.entries(diag.porTicker).filter(([k]) => k.startsWith(`${m}|`)).map(([k, v]) => `${k.split("|")[1]} ${v}`).sort();
    console.log(`      ⚠️ ${m}σ: ${n} entradas SIN strike lo bastante lejos cotizado (el descargador tira bid≤0, así que la cola de strikes no está). NO es aleatorio — se lo comen los tranquilos: ${porT.join(" · ")}`);
  }
  salidaJsonDiag[H.nombre] = diag;
}

// ── CONTROL A MANO: un suceso entero verificado fuera del script contra el fichero crudo.
//    NVDA 2023-01-03 → vencimiento 2024-01-19: spot $143,15 · straddle ATM (K=145) $62,40 →
//    EM 1σ = $78,19 · objetivo 1,5σ = $260,43 → strike cotizado 265 (bid 5,60 / ask 5,95) →
//    se paga $595 · NVDA cierra $594,91 el 2024-01-19 → pago $32.991 → +5.445%.
{
  const s = resultados["365d|1.5"].find((x) => x.sym === "NVDA" && x.dia === "20230103");
  exigir(s, "el suceso de control NVDA 2023-01-03 no está en la muestra");
  const r = s.desnuda.pnl / s.desnuda.capital;
  console.log(`\n   CONTROL A MANO — NVDA 2023-01-03 → ${s.exp}: EM ${s.EM.toFixed(2)} · strike ${s.Kfar} · capital $${s.desnuda.capital.toFixed(0)} · cierre ${s.Sexp} · retorno ${(r * 100).toFixed(0)}%`);
  exigir(s.Kfar === 265 && Math.abs(s.desnuda.capital - 595) < 1 && Math.abs(r - 54.45) < 0.05,
    `el control a mano NO cuadra: strike ${s.Kfar} (esperado 265), capital ${s.desnuda.capital} (esperado 595), retorno ${(r * 100).toFixed(0)}% (esperado 5445%)`);
}

// ── CONTROL DE CORDURA: el intrínseco calculado contra la cotización real del contrato el día
//    del vencimiento, cuando todavía está en la caché (sólo puede estarlo si acabó con valor).
{
  let n = 0, err = [];
  for (const s of resultados["90d|1.5"]) {
    const c = cadena(s.sym, s.exp);
    if (!c || !c[s.exp]) continue;
    const K = s.Kfar / s.fTotal;
    const q = c[s.exp][`${K}|C`];
    if (!q) continue;
    const intr = Math.max(0, s.Sexp - K);
    if (intr < 0.5) continue;
    err.push(Math.abs(mid(q) - intr) / intr * 100);
    n++;
  }
  console.log(`\n   CONTROL el día del vencimiento: ${n} contratos seguían cotizados con valor;`);
  if (n > 20) console.log(`   mi intrínseco vs su punto medio real → error mediano ${mediana(err).toFixed(2)}%, p90 ${pct(err, 90).toFixed(2)}%`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TABLAS
// ═════════════════════════════════════════════════════════════════════════════
function resumenVeh(sucesos, veh) {
  const r = [], rM = [], cap = [], dol = [], porT = new Map();
  for (const s of sucesos) {
    const v = s[veh];
    if (!v || !(v.capital > 0) || !(v.capitalMid > 0)) continue;
    const x = v.pnl / v.capital;
    r.push(x); rM.push(v.pnlMid / v.capitalMid); cap.push(v.capital); dol.push(v.pnl);
    if (!porT.has(s.sym)) porT.set(s.sym, []);
    porT.get(s.sym).push(x);
  }
  if (!r.length) return null;
  // ── BOOTSTRAP POR TICKER (trampa nº5: nunca una sola tirada). Se remuestrean los 28 tickers con
  //    reemplazo, no los sucesos sueltos: si el resultado vive en NVDA, remuestrear sucesos lo
  //    esconde y remuestrear tickers lo saca a la luz.
  const tks = [...porT.keys()];
  const medias = [];
  let semilla = 12345;
  const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
  for (let b = 0; b < 2000; b++) {
    const acc = [];
    for (let i = 0; i < tks.length; i++) acc.push(...porT.get(tks[Math.floor(rnd() * tks.length)]));
    medias.push(media(acc));
  }
  // sin los DOS tickers que más aportan
  const aporte = [...porT].map(([t, v]) => ({ t, s: v.reduce((a, x) => a + x, 0) })).sort((a, b) => b.s - a.s);
  const fuera = new Set(aporte.slice(0, 2).map((x) => x.t));
  const sinTop2 = [];
  for (const [t, v] of porT) if (!fuera.has(t)) sinTop2.push(...v);
  return {
    n: r.length,
    medio: media(r), mediana: mediana(r), medioMid: media(rM),
    peaje: media(rM) - media(r),
    ganan: r.filter((x) => x > 0).length / r.length,
    ceros: r.filter((x) => x <= -0.999).length / r.length,
    p90: pct(r, 90), p99: pct(r, 99), max: Math.max(...r),
    de10x: r.filter((x) => x >= 9).length / r.length,
    de3x: r.filter((x) => x >= 2).length / r.length,
    capMedio: media(cap), dolMedio: media(dol), t: tPareada(r),
    ic05: pct(medias, 5), ic95: pct(medias, 95),
    sinTop2: media(sinTop2), top2: [...fuera].join("+"),
  };
}

const salidaJson = { generado: new Date().toISOString(), pruebas: PRUEBAS_DECLARADAS, liston: LISTON, splits: [...splits], bloques: {} };

for (const H of HORIZONTES) for (const m of EMES) {
  const clave = `${H.nombre}|${m}`;
  const S = resultados[clave];
  if (!S.length) { console.log(`\n### ${clave}: sin sucesos`); continue; }

  console.log(`\n\n════════════════════════════════════════════════════════════════════════════`);
  console.log(`### HORIZONTE ${H.nombre} · distancia ${m}σ · ${S.length} sucesos`);
  console.log(`    DTE mediano ${mediana(S.map((s) => s.dte))} · OTM mediano ${mediana(S.map((s) => s.otmPct)).toFixed(1)}% · ${new Set(S.map((s) => s.sym)).size} tickers`);
  console.log(`    período ${fecha(S.map((s) => s.dia).sort()[0])} → ${fecha(S.map((s) => s.dia).sort().slice(-1)[0])}`);
  console.log(`════════════════════════════════════════════════════════════════════════════`);

  // universo PAREADO: sucesos donde TODOS los vehículos se pudieron construir
  const pareado = S.filter((s) => VEH.every((v) => s[v] && s[v].capital > 0 && s[v].capitalMid > 0));
  console.log(`\n    universo pareado (los 5 vehículos construibles): ${pareado.length} de ${S.length}`);

  console.log(`\n| vehículo | n | retorno medio | IC 95% (bootstrap por ticker) | mediana | % gana | % a cero | p99 | máx | % ≥3x | % ≥10x | capital medio | P&L medio $ | peaje | sin los 2 mejores |`);
  console.log(`|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
  const tabla = {};
  for (const veh of VEH) {
    const x = resumenVeh(pareado, veh);
    if (!x) continue;
    tabla[veh] = x;
    console.log(`| ${NOMBRE[veh]} | ${x.n} | ${(x.medio * 100).toFixed(1)}% | ${(x.ic05 * 100).toFixed(0)}% a ${(x.ic95 * 100).toFixed(0)}% | ${(x.mediana * 100).toFixed(1)}% | ${(x.ganan * 100).toFixed(0)}% | ${(x.ceros * 100).toFixed(0)}% | ${(x.p99 * 100).toFixed(0)}% | ${(x.max * 100).toFixed(0)}% | ${(x.de3x * 100).toFixed(1)}% | ${(x.de10x * 100).toFixed(1)}% | $${x.capMedio.toFixed(0)} | $${x.dolMedio.toFixed(0)} | ${(x.peaje * 100).toFixed(1)} pts | ${(x.sinTop2 * 100).toFixed(0)}% (fuera ${x.top2}) |`);
  }
  // ¿Es siquiera positiva la REFERENCIA? Si su IC contiene el cero, la pregunta "¿hay algo mejor
  // que la call desnuda?" se responde sobre un listón que todavía no está demostrado.
  const ref = tabla.desnuda;
  console.log(`\n    LA REFERENCIA: retorno medio ${(ref.medio * 100).toFixed(0)}% · IC 95% [${(ref.ic05 * 100).toFixed(0)}%, ${(ref.ic95 * 100).toFixed(0)}%] → ${ref.ic05 > 0 ? "el cero queda FUERA" : "EL CERO ESTÁ DENTRO: la call desnuda tampoco está demostrada"}`);
  console.log(`    ${ref.n >= 200 ? `muestra ${ref.n} ≥ 200 · PASA` : `muestra ${ref.n} < 200 · NO PASA la criba de muestra`}`);

  // ── DIFERENCIA PAREADA contra la call desnuda ─────────────────────────────
  console.log(`\n    DIFERENCIA PAREADA vs call desnuda (mismo ticker, mismo día, mismo vencimiento):`);
  console.log(`\n| vehículo | Δ retorno | t pareada | ¿pasa ${LISTON}? | Δ a punto medio | tercio 1 | tercio 2 | tercio 3 | ¿mismo signo? | detectable |`);
  console.log(`|---|---|---|---|---|---|---|---|---|---|`);
  const ord = [...pareado].sort((a, b) => a.dia.localeCompare(b.dia));
  const k3 = Math.floor(ord.length / 3);
  const comparaciones = {};
  for (const veh of VEH) {
    if (veh === "desnuda") continue;
    const dif = pareado.map((s) => s[veh].pnl / s[veh].capital - s.desnuda.pnl / s.desnuda.capital);
    const difM = pareado.map((s) => s[veh].pnlMid / s[veh].capitalMid - s.desnuda.pnlMid / s.desnuda.capitalMid);
    const t = tPareada(dif);
    const ter = [0, 1, 2].map((i) => {
      const g = i < 2 ? ord.slice(i * k3, (i + 1) * k3) : ord.slice(2 * k3);
      return media(g.map((s) => s[veh].pnl / s[veh].capital - s.desnuda.pnl / s.desnuda.capital));
    });
    const mismo = ter.every((x) => Math.sign(x) === Math.sign(ter[0]));
    // POTENCIA (la criba que le faltaba al lado negativo): diferencia mínima que esta muestra
    // podía haber detectado con el listón de Bonferroni. Un "no hay diferencia" por debajo de
    // esto significa "no lo pudimos ver", no "no existe".
    const detectable = LISTON * sd(dif) / Math.sqrt(dif.length);
    comparaciones[veh] = { dif: media(dif), t, difMid: media(difM), tercios: ter, mismoSigno: mismo, detectable, pasa: media(dif) > 0 && Math.abs(t) >= LISTON && mismo };
    console.log(`| ${NOMBRE[veh]} | ${(media(dif) * 100).toFixed(1)} pts | ${t.toFixed(2)} | ${Math.abs(t) >= LISTON ? "SÍ" : "no"} | ${(media(difM) * 100).toFixed(1)} pts | ${(ter[0] * 100).toFixed(1)} | ${(ter[1] * 100).toFixed(1)} | ${(ter[2] * 100).toFixed(1)} | ${mismo ? "sí" : "NO"} | ±${(detectable * 100).toFixed(0)} pts |`);
  }

  // ── por ticker (la criba de concentración, y el aviso del universo elegido) ──
  const porT = new Map();
  for (const s of pareado) {
    if (!porT.has(s.sym)) porT.set(s.sym, []);
    porT.get(s.sym).push(s);
  }
  const filas = [...porT].map(([t, l]) => ({
    t, n: l.length,
    desnuda: media(l.map((s) => s.desnuda.pnl / s.desnuda.capital)),
    mejor: Math.max(...VEH.filter((v) => v !== "desnuda").map((v) => media(l.map((s) => s[v].pnl / s[v].capital)))),
  })).sort((a, b) => b.desnuda - a.desnuda);
  const mayor = Math.max(...filas.map((f) => f.n)) / pareado.length;
  console.log(`\n    concentración: el ticker mayor es el ${(mayor * 100).toFixed(1)}% de la muestra (listón 20%) → ${mayor <= 0.2 ? "PASA" : "NO PASA"}`);
  console.log(`    call desnuda por ticker (retorno medio): ${filas.map((f) => `${f.t} ${(f.desnuda * 100).toFixed(0)}%`).join(" · ")}`);

  // ── AÑOS ────────────────────────────────────────────────────────────────
  const porA = new Map();
  for (const s of pareado) {
    const a = s.dia.slice(0, 4);
    if (!porA.has(a)) porA.set(a, []);
    porA.get(a).push(s);
  }
  console.log(`\n    por año de entrada (retorno medio de cada vehículo):`);
  console.log(`\n| año | n | ${VEH.map((v) => NOMBRE[v]).join(" | ")} |`);
  console.log(`|---|---|${VEH.map(() => "---").join("|")}|`);
  for (const [a, l] of [...porA].sort()) {
    console.log(`| ${a} | ${l.length} | ${VEH.map((v) => (media(l.map((s) => s[v].pnl / s[v].capital)) * 100).toFixed(0) + "%").join(" | ")} |`);
  }

  // ── DÓLARES AL AÑO. Un % por operación esconde la frecuencia: hay que decir cuántas veces al
  //    año se puede poner y sobre cuánto capital. Se calcula sobre un SLEEVE de $1.000 que se
  //    reinvierte entero cada vencimiento (ops/año = 365/DTE mediano).
  const dteMed = mediana(pareado.map((s) => s.dte));
  const opsAno = 365 / dteMed;
  console.log(`\n    DÓLARES AL AÑO sobre un sobre de $1.000 dedicado al brazo convexo (${opsAno.toFixed(1)} vueltas/año, DTE mediano ${dteMed}):`);
  console.log(`\n| vehículo | $/año por $1.000 | IC 95% | contratos que caben en $1.000 | $/año sin los 2 mejores tickers |`);
  console.log(`|---|---|---|---|---|`);
  for (const veh of VEH) {
    const x = tabla[veh];
    if (!x) continue;
    console.log(`| ${NOMBRE[veh]} | $${(1000 * x.medio * opsAno).toFixed(0)} | $${(1000 * x.ic05 * opsAno).toFixed(0)} a $${(1000 * x.ic95 * opsAno).toFixed(0)} | ${(1000 / x.capMedio).toFixed(1)} | $${(1000 * x.sinTop2 * opsAno).toFixed(0)} |`);
  }

  salidaJson.bloques[clave] = { n: S.length, nPareado: pareado.length, dteMed, opsAno, tabla, comparaciones, porTicker: filas, mayorTicker: mayor };
}

// ═════════════════════════════════════════════════════════════════════════════
// DIAGNÓSTICO 1 — ¿la ventaja de la escalera es el VEHÍCULO o es la DISTANCIA?
//
// La escalera a 2,5σ reparte el presupuesto entre 1,5σ y 3,5σ, así que arrastra la posición hacia
// dentro. Si el 1,5σ a secas gana más que la escalera de 2,5σ, entonces "repartir" no era un
// hallazgo de vehículo: era cambiar de distancia con más pasos y más peaje.
// ═════════════════════════════════════════════════════════════════════════════
console.log(`\n\n════════════════════════════════════════════════════════════════════════════`);
console.log(`### DIAGNÓSTICO 1 — ¿vehículo o distancia?`);
console.log(`════════════════════════════════════════════════════════════════════════════\n`);
for (const H of HORIZONTES) {
  const A = new Map(resultados[`${H.nombre}|1.5`].map((s) => [`${s.sym}|${s.dia}`, s]));
  const B = resultados[`${H.nombre}|2.5`].filter((s) => A.has(`${s.sym}|${s.dia}`));
  if (B.length < 30) continue;
  const rDesn15 = B.map((s) => { const a = A.get(`${s.sym}|${s.dia}`); return a.desnuda.pnl / a.desnuda.capital; });
  const rEsc25 = B.map((s) => s.escalera.pnl / s.escalera.capital);
  const rCal25 = B.map((s) => s.calendario.pnl / s.calendario.capital);
  const dif = rDesn15.map((x, i) => x - rEsc25[i]);
  console.log(`   ${H.nombre} · ${B.length} sucesos con las dos distancias construibles:`);
  console.log(`     call desnuda a 1,5σ ............ ${(media(rDesn15) * 100).toFixed(0)}%`);
  console.log(`     escalera centrada en 2,5σ ...... ${(media(rEsc25) * 100).toFixed(0)}%`);
  console.log(`     calendario a 2,5σ .............. ${(media(rCal25) * 100).toFixed(0)}%`);
  console.log(`     diferencia pareada 1,5σ desnuda − escalera 2,5σ: ${(media(dif) * 100).toFixed(0)} pts · t=${tPareada(dif).toFixed(2)}\n`);
}

// ═════════════════════════════════════════════════════════════════════════════
// DIAGNÓSTICO 2 — ¿CUÁNTOS BILLETES HAY QUE COMPRAR PARA COBRAR ESA MEDIA?
//
// La media de un billete de lotería no se cobra comprando un billete. La mediana de la call
// desnuda es −100%: el resultado más probable de UNA operación es perderlo todo. Se simula un año
// entero: se sortea un AÑO (para conservar la correlación de mercado dentro del año) y luego N
// operaciones de ese año. Es la traducción a lo que se sentiría en la cuenta.
// ═════════════════════════════════════════════════════════════════════════════
console.log(`\n════════════════════════════════════════════════════════════════════════════`);
console.log(`### DIAGNÓSTICO 2 — la media no se cobra con un billete`);
console.log(`════════════════════════════════════════════════════════════════════════════`);
let sem = 987654321;
const rnd2 = () => { sem = (sem * 1103515245 + 12345) & 0x7fffffff; return sem / 0x7fffffff; };
for (const clave of ["90d|1.5", "365d|1.5"]) {
  const S = resultados[clave].filter((s) => s.desnuda && s.desnuda.capital > 0);
  const porA = new Map();
  for (const s of S) { const a = s.dia.slice(0, 4); if (!porA.has(a)) porA.set(a, []); porA.get(a).push(s.desnuda.pnl / s.desnuda.capital); }
  const anos = [...porA.keys()];
  const dteMed = mediana(S.map((s) => s.dte));
  const vueltas = Math.max(1, Math.round(365 / dteMed));
  console.log(`\n   ${clave} · ${vueltas} vuelta(s) al año, 5.000 años simulados. DOS formas de apostar:`);
  console.log(`   (A) APUESTA FIJA: $1.000 nuevos cada vuelta, sale del sueldo, no se reinvierte.`);
  console.log(`   (B) REINVERTIR: un sobre de $1.000 que se juega ENTERO cada vuelta.\n`);
  console.log(`| N contratos a la vez | (A) $/año mediano | (A) p05 | (A) p95 | (A) % años en pérdida | (B) mediana del año | (B) % años a cero |`);
  console.log(`|---|---|---|---|---|---|---|`);
  for (const N of [1, 3, 5, 10, 28]) {
    const fija = [], comp = [];
    for (let b = 0; b < 5000; b++) {
      let cap = 1, suma = 0;
      for (let v = 0; v < vueltas; v++) {
        const a = anos[Math.floor(rnd2() * anos.length)];
        const pool = porA.get(a);
        let r = 0;
        for (let i = 0; i < N; i++) r += pool[Math.floor(rnd2() * pool.length)];
        r /= N;
        suma += 1000 * r;      // apuesta fija de $1.000 cada vuelta
        cap *= 1 + r;          // sobre que se reinvierte entero
      }
      fija.push(suma); comp.push(cap - 1);
    }
    console.log(`| ${N} | $${mediana(fija).toFixed(0)} | $${pct(fija, 5).toFixed(0)} | $${pct(fija, 95).toFixed(0)} | ${(fija.filter((x) => x < 0).length / fija.length * 100).toFixed(0)}% | ${(mediana(comp) * 100).toFixed(0)}% | ${(comp.filter((x) => x <= -0.99).length / comp.length * 100).toFixed(0)}% |`);
  }
}

salidaJson.diagnosticos = "ver stdout";
salidaJson.descartes = salidaJsonDiag;
writeFileSync(SALIDA, JSON.stringify(salidaJson, null, 1), "utf8");
console.log(`\n\n   ${LECTURAS} ficheros de cadena leídos · resultado en ${SALIDA}\n`);
