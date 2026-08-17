// ¿SIRVE EVA (o el score de MarketSnack) PARA ELEGIR QUÉ ACCIÓN COMPRAR?
//
//   node --import tsx --max-old-space-size=8192 scripts/conv-eva-selector.mjs
//   PARTE=A  → sólo EVA (flujo Theta, 8 tickers, 2024-01→2026-08)
//   PARTE=B  → sólo MarketSnack (1.057 símbolos, 2026-04-15→2026-08-12)
//
// ═══ POR QUÉ ESTA MEDICIÓN ES NUEVA ══════════════════════════════════════════════════════════
// EVA ya se midió DOS veces y las dos murieron:
//   · como señal direccional DE CONTRATO (19.465 operaciones con precios reales, no separa)
//   · comprando a largo el propio contrato (0 de 12)
// Lo que NUNCA se ha probado es EVA **agregada por TICKER y por PERÍODO como selector de qué
// ACCIÓN comprar**: no operar la opción, sino usar el flujo de opciones como termómetro para
// decidir en qué subyacente estar. Es otra pregunta y merece su propia medición.
// De MarketSnack se midió que su score no predice el resultado DE LA OPCIÓN (t=0,62, 3.321
// eventos). Aquí se pregunta otra cosa: si agregado por símbolo elige ACCIONES.
//
// ═══ EL CRITERIO, ESCRITO ANTES DE CORRER ════════════════════════════════════════════════════
// PRUEBAS DECLARADAS: 20 (parte A) + 10 (parte B) + 12 (parte C) = **42** → |t| ≥ listonT(42)
//   A: 4 señales × 2 frecuencias (mes / semana) × 2 formas (largo top-k · largo-corto) = 16
//      + 4 cortes de control (sin ETFs, k=1, k=3, sólo prima ≥ $5M)                     =  4
//   B: 3 señales × 2 horizontes (1 día / 5 días) = 6 + 4 cortes de control              = 10
//   C: 12 pruebas de DIAGNÓSTICO del negativo fuerte que salió en A (ver más abajo).
//
// ⚠ HONESTIDAD SOBRE LA PARTE C: las pruebas A y B estaban escritas antes de correr nada. La
// parte C se escribió DESPUÉS de ver que `crudoNeto` mensual salía con t=−4,17 y percentil 0 de
// 500 — o sea, la DIRECCIÓN de la parte C (comprar el flujo más bajista) se eligió mirando los
// datos. Eso es minería y se declara: la parte C no puede aprobar un hallazgo por sí sola, sólo
// puede MATARLO o dejarlo como hipótesis para medir fuera de muestra. Por eso su prueba clave no
// es el signo (que ya sé), sino si el flujo aporta algo POR ENCIMA de la reversión de un mes,
// que es un efecto conocido y gratis.
//
// PASA si, y sólo si, las CINCO:
//   1. n mínimo (200 filas ticker-período) y el nº de SUCESOS (períodos) declarado aparte.
//   2. Ningún ticker aporta más del 20% de la muestra.
//   3. MISMO SIGNO en los TRES tercios de tiempo.
//   4. |t| ≥ 3,38.
//   5. **Percentil ≥ 95 contra 500 sorteos al azar** (trampa nº5: un solo sorteo infla).
// Si sale negativo se corre potencia(): decir «no lo pudimos ver» si la muestra no daba.
//
// ═══ LO QUE ESTO NO MIDE, Y SE DICE CADA VEZ ═════════════════════════════════════════════════
// · Del scorecard EVA sólo son computables con este fichero 3 de las 6 categorías:
//   convicción (30), inusualidad (20) y agresividad (10) = **60 de 100 puntos de peso**.
//   Faltan estructura (15), IV/griegas (15) y confirmación (10): el fichero de flujo no trae
//   IV ni griegas ni la cadena completa. Los pesos se renormalizan sobre 60 y se dice.
// · Del veto de EVA sólo se puede aplicar OI<250. El de volumen<100 necesita el volumen del
//   contrato en la sesión, que no está. Se declara, no se disimula.
// · Los cierres son SIN DIVIDENDOS. Eso resta ~1,2%/año a SPY/QQQ/AAPL/MSFT y ~0 a NVDA/TSLA.
//   Como la medida principal es el EXCESO sobre la media del universo, sesga a favor de las
//   que no pagan dividendo. Se reporta el mismo test con y sin ETFs por eso.
// · Los cierres son SIN AJUSTAR POR SPLIT: NVDA 10:1 el 2024-06-10 sale como −90%. Está en la
//   tabla SPLITS y el script LANZA si aparece cualquier otro salto >40% que no esté declarado.

import { readFileSync, readdirSync, existsSync, writeFileSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import {
  volumeScore, timingScore, repetitionScore, spreadScore, dominanceScore,
  executionLevel, executionScore, orderSizeScore,
} from "../lib/flow";
import { EVA_WEIGHTS, VETO, WIDE_SPREAD_PCT, MOD_LIQ_SPREAD_PCT } from "../lib/scorecardEva";
import { listonT, potencia } from "../lib/barreraHallazgos";

const PRUEBAS = 42;
const LISTON = listonT(PRUEBAS);
const SEMILLAS = 500;
const PARTE = process.env.PARTE || "ABC";

const DIR_FLUJO = "scripts/cache-theta/flujo-historico";
const DIR_CIERRES = "scripts/cache-theta/cierres";
const MS_FLUJO = "data/marketsnack/flujo-prima1000k.jsonl";
const MS_CIERRES = "data/marketsnack/cierres";

// ── utilidades ───────────────────────────────────────────────────────────────
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
const varianza = (v) => { if (v.length < 2) return 0; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const desv = (v) => Math.sqrt(varianza(v));
/** t de una media contra cero (una sola muestra: es lo que toca con excesos pareados). */
const tUna = (v) => { const s = desv(v); return v.length > 2 && s > 0 ? media(v) / (s / Math.sqrt(v.length)) : 0; };
const tWelch = (a, b) => { if (a.length < 3 || b.length < 3) return 0; const se = Math.sqrt(varianza(a) / a.length + varianza(b) / b.length); return se > 0 ? (media(a) - media(b)) / se : 0; };
const pct = (x) => `${(100 * x).toFixed(2)}%`;
const fmt = (x, d = 2) => x.toFixed(d);
/** Generador reproducible: mismo resultado en cada corrida. */
function rng(semilla) { let s = semilla >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function barajar(arr, r) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** UN CAMPO QUE NO EXISTE SE LEE COMO 0 — esto lanza en vez de medir cero en silencio. */
function exigir(cond, msg) { if (!cond) throw new Error(`FALLO CERRADO: ${msg}`); }

// ── SPLITS declarados. Cualquier otro salto >40% para la corrida. ────────────
const SPLITS = { "NVDA|20240610": 10 };  // NVDA 10:1, hecho conocido

// ═════════════════════════════════════════════════════════════════════════════
// PARTE A — EVA sobre el flujo de Theta
// ═════════════════════════════════════════════════════════════════════════════
const TICKERS_A = ["AAPL", "AMD", "META", "MSFT", "NVDA", "QQQ", "SPY", "TSLA"];
const ETFS = new Set(["SPY", "QQQ"]);

function cargarCierresTheta() {
  const cierres = {};
  for (const t of TICKERS_A) {
    const d = JSON.parse(readFileSync(`${DIR_CIERRES}/${t}.json`, "utf8"));
    const k = Object.keys(d).sort().filter((x) => x >= "20240101");
    exigir(k.length > 500, `${t}: sólo ${k.length} cierres desde 2024`);
    const malos = k.filter((x) => !(d[x] > 0)).length;
    exigir(malos === 0, `${t}: ${malos} cierres <= 0`);
    cierres[t] = { dias: k, px: d };
  }
  // calendario = días con cierre en LOS OCHO
  const cuenta = new Map();
  for (const t of TICKERS_A) for (const dia of cierres[t].dias) cuenta.set(dia, (cuenta.get(dia) ?? 0) + 1);
  const dias = [...cuenta.entries()].filter(([, n]) => n === TICKERS_A.length).map(([d]) => d).sort();
  exigir(dias.length > 600, `calendario común de sólo ${dias.length} días`);
  // saltos no declarados → lanza
  for (const t of TICKERS_A) {
    for (let i = 1; i < dias.length; i++) {
      const r = cierres[t].px[dias[i]] / cierres[t].px[dias[i - 1]] - 1;
      if (Math.abs(r) > 0.4 && !SPLITS[`${t}|${dias[i]}`]) {
        throw new Error(`FALLO CERRADO: ${t} ${dias[i]} salta ${(100 * r).toFixed(0)}% y no está en SPLITS. ` +
          `Un split sin declarar mete un −90% falso y tumba la medición entera.`);
      }
    }
  }
  return { cierres, dias };
}

/** Retorno de un tramo, corregido por los splits declarados dentro del tramo. */
function retorno(cierres, t, diaIni, diaFin, dias) {
  const p0 = cierres[t].px[diaIni], p1 = cierres[t].px[diaFin];
  exigir(p0 > 0 && p1 > 0, `precio inválido ${t} ${diaIni}/${diaFin}`);
  let factor = 1;
  const i0 = dias.indexOf(diaIni), i1 = dias.indexOf(diaFin);
  for (let i = i0 + 1; i <= i1; i++) { const f = SPLITS[`${t}|${dias[i]}`]; if (f) factor *= f; }
  return (p1 * factor) / p0 - 1;
}

/** Volatilidad realizada dentro de la ventana (desviación de los retornos diarios). */
function volRealizada(cierres, t, ventana, dias) {
  const r = [];
  for (let i = 1; i < ventana.length; i++) r.push(retorno(cierres, t, ventana[i - 1], ventana[i], dias));
  return r.length > 2 ? desv(r) : 0;
}

// ── el offset ET de una fecha, para no fiarse de la zona horaria de Windows ──
const cacheOffset = new Map();
function offsetET(diaISO) {
  if (cacheOffset.has(diaISO)) return cacheOffset.get(diaISO);
  const d = new Date(`${diaISO}T17:00:00Z`);
  const s = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" }).format(d);
  const m = s.match(/GMT([+-])(\d+)(?::(\d+))?/);
  exigir(m, `no se pudo sacar el offset ET de ${diaISO} (Intl devolvió "${s}")`);
  const off = `${m[1]}${String(m[2]).padStart(2, "0")}:${(m[3] ?? "00").padStart(2, "0")}`;
  cacheOffset.set(diaISO, off);
  return off;
}
const aISO = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

/**
 * Puntúa UNA operación del flujo con las funciones de Victor, SIN tocarlas.
 * Devuelve { eva 0-100, sesgo -1/0/+1, prima }.
 *   sesgo: compra agresiva de call = +1 · compra agresiva de put = −1
 *          venta agresiva de call = −1 · venta agresiva de put = +1  (classifyIntent del spec)
 */
function puntuar(n, dia, repeticiones) {
  const bid = n.bid, ask = n.ask;
  const anchoPct = bid > 0 && ask > 0 ? (100 * (ask - bid)) / ((ask + bid) / 2) : null;
  const nivel = executionLevel(n.price, bid ?? 0, ask ?? 0, "unclear");

  const agresividad = (executionScore(nivel) + orderSizeScore(n.prima)) / 2;
  const pesoSobreOI = n.oi > 0 ? Math.min(100, (100 * n.size) / n.oi) : 0;
  const conviccion = (spreadScore(anchoPct) + dominanceScore(pesoSobreOI)) / 2;
  const tsET = `${n.ts}${offsetET(aISO(dia))}`;
  const inusualidad = (volumeScore(n.size, n.prima) + timingScore(tsET) + repetitionScore(repeticiones)) / 3;

  // suma ponderada con los pesos de EVA, renormalizada sobre las 3 categorías presentes (60/100)
  const W = EVA_WEIGHTS.conviction + EVA_WEIGHTS.unusuality + EVA_WEIGHTS.aggression;
  const bruto = (conviccion * EVA_WEIGHTS.conviction + inusualidad * EVA_WEIGHTS.unusuality +
                 agresividad * EVA_WEIGHTS.aggression) / W * 10;   // 0-100

  let eva = bruto;
  if (n.oi < VETO.MIN_OI) eva = 0;                                  // veto duro de EVA
  else if (anchoPct != null && anchoPct > WIDE_SPREAD_PCT) eva *= 0.6;
  else if (anchoPct != null && anchoPct > MOD_LIQ_SPREAD_PCT) eva *= 0.7;

  let sesgo = 0;
  if (bid != null && ask != null && ask >= bid) {
    const esCall = n.right === "C";
    if (n.price >= ask) sesgo = esCall ? 1 : -1;        // BTO
    else if (n.price <= bid) sesgo = esCall ? -1 : 1;   // STO
  }
  if (sesgo === 0) eva *= 0.8;                          // modificador intención_indeterminada
  return { eva, sesgo, prima: n.prima, anchoPct, nivel };
}

/** Lee TODO el flujo de Theta y devuelve las operaciones puntuadas por ticker y día. */
function cargarFlujoTheta() {
  const ficheros = readdirSync(DIR_FLUJO).filter((f) => f.endsWith(".json"));
  exigir(ficheros.length > 5000, `sólo ${ficheros.length} ficheros de flujo`);
  const porTickerDia = new Map();            // "TICKER|AAAAMMDD" -> [op]
  const rad = { ficheros: 0, vacios: 0, trades: 0, sinBidAsk: 0, sinOI: 0, vetados: 0, indet: 0, primaTotal: 0 };
  for (const f of ficheros) {
    const j = JSON.parse(readFileSync(`${DIR_FLUJO}/${f}`, "utf8"));
    rad.ficheros++;
    const notables = j.notables ?? [];
    if (!notables.length) { rad.vacios++; continue; }
    const dia = j.dia, sym = j.sym;
    exigir(/^\d{8}$/.test(dia), `día raro en ${f}: ${dia}`);
    const veces = new Map();
    for (const n of notables) { const k = `${n.exp}|${n.strike}|${n.right}`; veces.set(k, (veces.get(k) ?? 0) + 1); }
    const ops = [];
    for (const n of notables) {
      rad.trades++;
      if (n.bid == null || n.ask == null) rad.sinBidAsk++;
      if (!(n.oi > 0)) rad.sinOI++;
      const p = puntuar(n, dia, veces.get(`${n.exp}|${n.strike}|${n.right}`) ?? 1);
      if (p.eva === 0) rad.vetados++;
      if (p.sesgo === 0) rad.indet++;
      rad.primaTotal += n.prima;
      ops.push(p);
    }
    porTickerDia.set(`${sym}|${dia}`, ops);
  }
  return { porTickerDia, rad };
}

/** Las 4 señales, agregadas sobre un conjunto de operaciones. `null` si no hay muestra. */
function senales(ops) {
  if (ops.length < 5) return null;
  let primaTot = 0, netoEva = 0, netoCrudo = 0, sumaEva = 0, primaAlta = 0;
  for (const o of ops) {
    primaTot += o.prima;
    netoEva += (o.eva / 100) * o.prima * o.sesgo;
    netoCrudo += o.prima * o.sesgo;
    sumaEva += o.eva;
    if (o.eva >= 70) primaAlta += o.prima;
  }
  if (!(primaTot > 0)) return null;
  return {
    evaNeto: netoEva / primaTot,        // 1. neto alcista ponderado por EVA
    crudoNeto: netoCrudo / primaTot,    // 2. neto alcista SIN EVA (el control que dice si EVA aporta)
    evaMedio: sumaEva / ops.length,     // 3. calidad media del flujo (sin dirección)
    evaAltoPct: primaAlta / primaTot,   // 4. cuota de prima en flujo de EVA >= 70
    n: ops.length,
  };
}
const SENALES = ["evaNeto", "crudoNeto", "evaMedio", "evaAltoPct"];

/**
 * Construye los períodos: para cada uno, el mapa ticker→señal (formación) y ticker→retorno.
 * `frec` = "mes" | "semana". El retorno va de la ÚLTIMA sesión del período de formación a la
 * última del siguiente: la decisión se toma con lo que ya pasó y se entra a ese cierre.
 */
function periodos(frec, dias, cierres, porTickerDia, filtroOp) {
  const bloques = [];
  if (frec === "mes") {
    let actual = null;
    for (const d of dias) {
      const m = d.slice(0, 6);
      if (!actual || actual.clave !== m) { actual = { clave: m, dias: [] }; bloques.push(actual); }
      actual.dias.push(d);
    }
  } else {
    for (let i = 0; i + 5 <= dias.length; i += 5) bloques.push({ clave: dias[i], dias: dias.slice(i, i + 5) });
  }
  const out = [];
  for (let i = 0; i + 1 < bloques.length; i++) {
    const form = bloques[i], sig = bloques[i + 1];
    const diaEntrada = form.dias[form.dias.length - 1];
    const diaSalida = sig.dias[sig.dias.length - 1];
    const fila = { clave: form.clave, fecha: aISO(diaEntrada), diaEntrada, diaSalida, tickers: {} };
    let completo = true;
    for (const t of TICKERS_A) {
      const ops = [];
      for (const d of form.dias) { const o = porTickerDia.get(`${t}|${d}`); if (o) for (const x of o) if (!filtroOp || filtroOp(x)) ops.push(x); }
      const s = senales(ops);
      if (!s) { completo = false; break; }
      fila.tickers[t] = {
        ...s,
        ret: retorno(cierres, t, diaEntrada, diaSalida, dias),
        // retorno DENTRO de la ventana de formación: sirve para saber si la señal de flujo es
        // sólo un espejo de lo que ya hizo el precio (reversión de un mes, efecto conocido).
        retForm: retorno(cierres, t, form.dias[0], diaEntrada, dias),
        // volatilidad realizada de la ventana: el otro confundidor plausible. Una cotización de
        // hasta 60 s de retraso hace que en los días movidos más operaciones se clasifiquen como
        // agresivas; si la señal fuese sólo eso, elegir por volatilidad daría lo mismo.
        volForm: volRealizada(cierres, t, form.dias, dias),
      };
    }
    if (completo) out.push(fila);
  }
  return out;
}

/** Exceso de cada ticker sobre la media del universo de ese período (mata el factor mercado). */
function conExcesos(pers, universo) {
  return pers.map((p) => {
    const rs = universo.map((t) => p.tickers[t].ret);
    const m = media(rs);
    const tickers = {};
    for (const t of universo) tickers[t] = { ...p.tickers[t], exc: p.tickers[t].ret - m };
    return { ...p, mediaUniverso: m, tickers };
  });
}

/** Una prueba: elegir top-k por `senal`, medir el exceso; control de 500 semillas. */
function probar(nombre, pers, universo, senal, k, largoCorto) {
  const excesos = [], elegidos = [];
  for (const p of pers) {
    const ord = [...universo].sort((a, b) => p.tickers[b][senal] - p.tickers[a][senal]);
    const top = ord.slice(0, k), bot = ord.slice(-k);
    const e = largoCorto
      ? media(top.map((t) => p.tickers[t].exc)) - media(bot.map((t) => p.tickers[t].exc))
      : media(top.map((t) => p.tickers[t].exc));
    excesos.push(e);
    elegidos.push(...top);
  }
  // control: 500 sorteos al azar de k tickers por período (y otros k para el corto)
  const medias = [];
  for (let s = 0; s < SEMILLAS; s++) {
    const r = rng(1000 + s * 7919);
    const ex = pers.map((p) => {
      const mez = barajar(universo, r);
      const top = mez.slice(0, k), bot = mez.slice(k, 2 * k);
      return largoCorto
        ? media(top.map((t) => p.tickers[t].exc)) - media(bot.map((t) => p.tickers[t].exc))
        : media(top.map((t) => p.tickers[t].exc));
    });
    medias.push(media(ex));
  }
  medias.sort((a, b) => a - b);
  const m = media(excesos);
  const percentil = 100 * medias.filter((x) => x < m).length / medias.length;

  // tercios de tiempo, sobre los períodos ordenados
  const kk = Math.floor(excesos.length / 3);
  const terc = [0, 1, 2].map((i) => {
    const g = i < 2 ? excesos.slice(i * kk, (i + 1) * kk) : excesos.slice(2 * kk);
    return { n: g.length, m: media(g), desde: pers[i < 2 ? i * kk : 2 * kk]?.fecha };
  });
  const mismoSigno = terc.every((x) => Math.sign(x.m) === Math.sign(m)) && m !== 0;

  // concentración: qué ticker acapara las elecciones
  const cnt = new Map();
  for (const t of elegidos) cnt.set(t, (cnt.get(t) ?? 0) + 1);
  const mayor = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];

  const porPeriodo = 252 / (pers[0] && pers.length ? (pers.length > 40 ? 5 : 21) : 21);
  return {
    nombre, senal, k, largoCorto, n: excesos.length, mediaExc: m, t: tUna(excesos),
    percentil, p05: medias[Math.floor(0.05 * medias.length)], p95: medias[Math.floor(0.95 * medias.length)],
    tercios: terc, mismoSigno, mayor: mayor ? { ticker: mayor[0], pct: mayor[1] / elegidos.length } : null,
    excesos, mediasAzar: medias,
  };
}

function informe(r) {
  const cribas = [];
  cribas.push(`${r.n >= 25 ? "✓" : "·"} sucesos ${r.n}`);
  cribas.push(`${r.mismoSigno ? "✓" : "✗"} tres tercios (${r.tercios.map((x) => pct(x.m)).join(" / ")})`);
  cribas.push(`${Math.abs(r.t) >= LISTON ? "✓" : "✗"} |t|=${fmt(Math.abs(r.t))} vs ${LISTON}`);
  cribas.push(`${r.percentil >= 95 ? "✓" : "✗"} percentil ${fmt(r.percentil, 0)} de ${SEMILLAS} sorteos`);
  if (r.mayor) cribas.push(`${r.mayor.pct <= 0.2 ? "✓" : "✗"} mayor elegido ${r.mayor.ticker} ${pct(r.mayor.pct)}`);
  return `  ${r.nombre.padEnd(46)} exceso ${pct(r.mediaExc).padStart(8)}/período · ${cribas.join(" · ")}`;
}

async function parteA() {
  console.log("\n" + "═".repeat(96));
  console.log("PARTE A — EVA AGREGADA POR TICKER Y PERÍODO COMO SELECTOR DE ACCIÓN");
  console.log("═".repeat(96));

  const { cierres, dias } = cargarCierresTheta();
  console.log(`\n── RADIOGRAFÍA (trampa nº2: abrir el fichero antes de medirlo) ──`);
  console.log(`cierres: calendario común de ${dias.length} sesiones, ${aISO(dias[0])} → ${aISO(dias[dias.length - 1])}`);
  console.log(`splits declarados: ${Object.keys(SPLITS).join(", ")} (cualquier otro salto >40% habría parado la corrida)`);

  const t0 = Date.now();
  const { porTickerDia, rad } = cargarFlujoTheta();
  console.log(`flujo: ${rad.ficheros} ficheros, ${rad.trades.toLocaleString("es-ES")} operaciones, ` +
    `$${(rad.primaTotal / 1e9).toFixed(1)}B de prima · leído en ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`  sin bid/ask: ${rad.sinBidAsk} (${pct(rad.sinBidAsk / rad.trades)}) · sin OI: ${rad.sinOI} · ` +
    `vetados por EVA (OI<250): ${rad.vetados} (${pct(rad.vetados / rad.trades)}) · ` +
    `intención indeterminada: ${rad.indet} (${pct(rad.indet / rad.trades)})`);
  console.log(`  ficheros de día sin ninguna operación ≥$1M: ${rad.vacios}`);

  // control de cordura del reloj: el timingScore tiene que ver la hora ET real, no la de Windows
  const pruebaTs = "2024-06-03T11:30:00.000";
  const min = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date(pruebaTs + offsetET("2024-06-03")));
  const h = Number(min.find((p) => p.type === "hour").value), mi = Number(min.find((p) => p.type === "minute").value);
  exigir(h === 11 && mi === 30, `el reloj ET no cuadra: ${h}:${mi} en vez de 11:30. Windows habría metido su zona horaria.`);
  console.log(`  control del reloj: 11:30 ET se lee como ${h}:${String(mi).padStart(2, "0")} ✓`);

  const resultados = [];
  const universoCompleto = TICKERS_A;

  for (const frec of ["mes", "semana"]) {
    const pers = conExcesos(periodos(frec, dias, cierres, porTickerDia), universoCompleto);
    console.log(`\n── ${frec.toUpperCase()} · ${pers.length} períodos · ${pers.length * 8} filas ticker-período ──`);
    console.log(`   retorno medio del universo por período: ${pct(media(pers.map((p) => p.mediaUniverso)))}`);
    for (const s of SENALES) {
      for (const lc of [false, true]) {
        const r = probar(`${frec} · ${s} · ${lc ? "largo-corto k=2" : "largo top-2"}`, pers, universoCompleto, s, 2, lc);
        resultados.push({ ...r, frec });
        console.log(informe(r));
      }
    }
  }

  // ── 4 cortes de control (declarados en la cabecera) ─────────────────────────
  console.log(`\n── CORTES DE CONTROL ──`);
  const cortes = [];
  {
    const uni = TICKERS_A.filter((t) => !ETFS.has(t));
    const pers = conExcesos(periodos("semana", dias, cierres, porTickerDia), uni);
    cortes.push(probar("semana · evaNeto · sin ETFs (6 acciones)", pers, uni, "evaNeto", 2, false));
  }
  {
    const pers = conExcesos(periodos("semana", dias, cierres, porTickerDia), universoCompleto);
    cortes.push(probar("semana · evaNeto · k=1 (una sola acción)", pers, universoCompleto, "evaNeto", 1, false));
    cortes.push(probar("semana · evaNeto · k=3", pers, universoCompleto, "evaNeto", 3, false));
  }
  {
    const pers = conExcesos(periodos("semana", dias, cierres, porTickerDia, (o) => o.prima >= 5e6), universoCompleto);
    cortes.push(probar("semana · evaNeto · sólo prima ≥ $5M", pers, universoCompleto, "evaNeto", 2, false));
  }
  for (const c of cortes) { console.log(informe(c)); resultados.push({ ...c, frec: "corte" }); }

  // ── la tabla que se lee: el mejor y el peor ────────────────────────────────
  const orden = [...resultados].sort((a, b) => b.mediaExc - a.mediaExc);
  console.log(`\n── LOS CINCO MEJORES Y LOS CINCO PEORES (de ${resultados.length}) ──`);
  console.log("  " + "prueba".padEnd(48) + "exceso/per   $/año(1 contr. $8.313)   t     pct");
  for (const r of [...orden.slice(0, 5), null, ...orden.slice(-5)]) {
    if (!r) { console.log("  " + "-".repeat(90)); continue; }
    const perAno = r.frec === "mes" ? 12 : 252 / 5;
    const anual = ((1 + r.mediaExc) ** perAno - 1);
    console.log(`  ${r.nombre.padEnd(48)}${pct(r.mediaExc).padStart(8)}  ${pct(anual).padStart(10)}/año  ` +
      `${fmt(r.t).padStart(6)}  ${fmt(r.percentil, 0).padStart(4)}`);
  }

  // ── potencia: ¿«no existe» o «no lo pudimos ver»? ──────────────────────────
  const persSem = conExcesos(periodos("semana", dias, cierres, porTickerDia), universoCompleto);
  const filas = [];
  for (const p of persSem) for (const t of universoCompleto) filas.push({ pnl: p.tickers[t].exc, ticker: t, fecha: p.fecha });
  console.log(`\n── POTENCIA (escepticismo simétrico) ──`);
  console.log(`  filas ticker-semana: ${filas.length} · desviación del exceso semanal: ${pct(desv(filas.map((f) => f.pnl)))}`);
  for (const efecto of [0.005, 0.01, 0.02]) {
    const pw = potencia(filas, efecto);
    console.log(`  buscando ${pct(efecto)} de exceso por semana (${pct((1 + efecto) ** 50.4 - 1)}/año): ${pw.mensaje}`);
    console.log(`    → ${pw.concluyente ? "CONCLUYENTE: se habría visto." : "NO concluyente: hace falta más muestra."}`);
  }
  return { resultados, persSem, dias, rad, cierres, porTickerDia };
}

/**
 * Períodos con formación de `form` sesiones y reajuste cada `hold` sesiones. Sirve para separar
 * dos cosas que la versión "mes natural" mezcla: el LARGO DE LA VENTANA (21 días) y la FRECUENCIA
 * de reajuste (una vez al mes). Con form=21 y hold=5 se mide la misma ventana con 4× la muestra.
 */
function periodosFlex(dias, cierres, porTickerDia, form, hold, hueco = 0) {
  const out = [];
  for (let i = form; i + hueco + hold < dias.length; i += hold) {
    const ventana = dias.slice(i - form, i);
    const diaEntrada = dias[i - 1 + hueco];        // hueco>0 = entrar más tarde (test de latencia)
    const diaSalida = dias[i - 1 + hueco + hold];
    const fila = { clave: dias[i - 1], fecha: aISO(dias[i - 1]), diaEntrada, diaSalida, tickers: {} };
    let completo = true;
    for (const t of TICKERS_A) {
      const ops = [];
      for (const d of ventana) { const o = porTickerDia.get(`${t}|${d}`); if (o) ops.push(...o); }
      const s = senales(ops);
      if (!s) { completo = false; break; }
      fila.tickers[t] = {
        ...s,
        ret: retorno(cierres, t, diaEntrada, diaSalida, dias),
        retForm: retorno(cierres, t, ventana[0], dias[i - 1], dias),
      };
    }
    if (completo) out.push(fila);
  }
  return out;
}

/** Correlación de Pearson. */
function corr(a, b) {
  const ma = media(a), mb = media(b);
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da > 0 && db > 0 ? n / Math.sqrt(da * db) : 0;
}

async function parteC(ctx) {
  console.log("\n" + "═".repeat(96));
  console.log("PARTE C — DIAGNÓSTICO DEL NEGATIVO FUERTE (dirección elegida DESPUÉS de ver los datos)");
  console.log("═".repeat(96));
  const { cierres, dias, porTickerDia } = ctx;
  const uni = TICKERS_A;
  const mes = conExcesos(periodos("mes", dias, cierres, porTickerDia), uni);

  // ── ¿la señal de flujo es sólo un espejo del precio del propio mes? ────────
  console.log("\n── ¿QUÉ ES `crudoNeto`? correlación con lo que ya hizo el precio ese mes ──");
  {
    const xs = [], ys = [];
    for (const p of mes) for (const t of uni) { xs.push(p.tickers[t].crudoNeto); ys.push(p.tickers[t].volForm); }
    console.log(`  crudoNeto    corr con la VOLATILIDAD realizada del mes: ${fmt(corr(xs, ys))}`);
  }
  for (const s of ["crudoNeto", "evaNeto", "evaAltoPct", "evaMedio"]) {
    const xs = [], ys = [], xr = [], yr = [];
    for (const p of mes) for (const t of uni) {
      xs.push(p.tickers[t][s]); ys.push(p.tickers[t].retForm);
      // rangos DENTRO del mes: es lo que de verdad usa un selector transversal
      xr.push([...uni].sort((a, b) => p.tickers[b][s] - p.tickers[a][s]).indexOf(t));
      yr.push([...uni].sort((a, b) => p.tickers[b].retForm - p.tickers[a].retForm).indexOf(t));
    }
    console.log(`  ${s.padEnd(12)} corr con el retorno del mes de formación: ${fmt(corr(xs, ys))}` +
      ` · corr de RANGOS dentro del mes: ${fmt(corr(xr, yr))}`);
  }

  const pruebas = [];
  const inv = (s) => `-${s}`;   // marca: se ordena al revés
  // Para probar "comprar el flujo MÁS BAJISTA" reutilizo probar() con una señal invertida.
  const conInversas = (pers) => pers.map((p) => {
    const tk = {};
    for (const t of Object.keys(p.tickers)) {
      const x = p.tickers[t];
      tk[t] = { ...x, "-crudoNeto": -x.crudoNeto, "-evaNeto": -x.evaNeto, "-retForm": -x.retForm, volForm: x.volForm };
    }
    return { ...p, tickers: tk };
  });

  const mesI = conInversas(mes);
  pruebas.push(probar("C1 · MES · largo el flujo MÁS BAJISTA (crudoNeto invertido) k=2", mesI, uni, inv("crudoNeto"), 2, false));
  for (const fuera of ["MSFT", "NVDA", "TSLA"]) {
    const u2 = uni.filter((t) => t !== fuera);
    const p2 = conInversas(conExcesos(periodos("mes", dias, cierres, porTickerDia), u2));
    pruebas.push(probar(`C2 · MES · lo mismo SIN ${fuera} (criba de concentración)`, p2, u2, inv("crudoNeto"), 2, false));
  }
  // El control que de verdad decide: reversión pura de un mes, sin mirar ninguna opción.
  pruebas.push(probar("C5 · MES · REVERSIÓN PURA: largo los 2 peores del mes (sin flujo)", mesI, uni, inv("retForm"), 2, false));
  pruebas.push(probar("C6 · MES · EVA invertida (¿aporta EVA sobre el crudo?) k=2", mesI, uni, inv("evaNeto"), 2, false));
  pruebas.push(probar("C6b · MES · VOLATILIDAD sola: largo los 2 más movidos", mesI, uni, "volForm", 2, false));
  // Doble orden contra la volatilidad: dentro de los 4 más movidos, ¿el flujo sigue eligiendo?
  {
    const conFlujo = [], soloVol = [];
    for (const p of mesI) {
      const porVol = [...uni].sort((a, b) => p.tickers[b].volForm - p.tickers[a].volForm).slice(0, 4);
      soloVol.push(media(porVol.map((t) => p.tickers[t].exc)));
      const ord = [...porVol].sort((a, b) => p.tickers[a].crudoNeto - p.tickers[b].crudoNeto);
      conFlujo.push(media(ord.slice(0, 2).map((t) => p.tickers[t].exc)));
    }
    const dif = conFlujo.map((x, i) => x - soloVol[i]);
    console.log(`\n── C6c · DOBLE ORDEN CONTRA LA VOLATILIDAD ──`);
    console.log(`  los 4 más movidos del mes:            exceso ${pct(media(soloVol))}/mes`);
    console.log(`  los 2 de flujo más bajista de esos:   exceso ${pct(media(conFlujo))}/mes`);
    console.log(`  APORTACIÓN DEL FLUJO sobre la volatilidad: ${pct(media(dif))}/mes · t=${fmt(tUna(dif))} (listón ${LISTON})`);
  }

  // Doble orden: dentro de la MITAD que más cayó, ¿el flujo elige mejor? Y al revés.
  {
    const excesos = [], excesosCtrl = [];
    for (const p of mesI) {
      const porRet = [...uni].sort((a, b) => p.tickers[a].retForm - p.tickers[b].retForm); // peores primero
      const mitadPeor = porRet.slice(0, 4);
      const ordFlujo = [...mitadPeor].sort((a, b) => p.tickers[a].crudoNeto - p.tickers[b].crudoNeto); // más bajista primero
      excesos.push(media(ordFlujo.slice(0, 2).map((t) => p.tickers[t].exc)));
      excesosCtrl.push(media(mitadPeor.map((t) => p.tickers[t].exc)));
    }
    const dif = excesos.map((x, i) => x - excesosCtrl[i]);
    console.log(`\n── C7 · DOBLE ORDEN — dentro de los 4 que más cayeron, ¿el flujo elige los 2 mejores? ──`);
    console.log(`  los 4 peores del mes:              exceso ${pct(media(excesosCtrl))}/mes`);
    console.log(`  los 2 de flujo más bajista de esos: exceso ${pct(media(excesos))}/mes`);
    console.log(`  APORTACIÓN DEL FLUJO: ${pct(media(dif))}/mes · t=${fmt(tUna(dif))} (listón ${LISTON})`);
    console.log(`  → ${Math.abs(tUna(dif)) >= LISTON ? "el flujo aporta" : "el flujo NO aporta nada por encima de la reversión"}`);
  }

  // ── ¿es la VENTANA de 21 días o la FRECUENCIA mensual? 4× la muestra ───────
  console.log(`\n── C8-C10 · MISMA VENTANA DE 21 DÍAS, REAJUSTE SEMANAL (4× muestra) ──`);
  for (const [form, hold, et] of [[21, 5, "ventana 21d → 5d"], [21, 21, "ventana 21d → 21d solapado"], [10, 5, "ventana 10d → 5d"]]) {
    const pers = conInversas(conExcesos(periodosFlex(dias, cierres, porTickerDia, form, hold), uni));
    pruebas.push(probar(`C · ${et} · flujo más bajista k=2`, pers, uni, inv("crudoNeto"), 2, false));
  }
  // ── latencia: entrar un día más tarde ──────────────────────────────────────
  {
    const pers = conInversas(conExcesos(periodosFlex(dias, cierres, porTickerDia, 21, 21, 1), uni));
    pruebas.push(probar("C11 · ventana 21d, ENTRAR UN DÍA MÁS TARDE", pers, uni, inv("crudoNeto"), 2, false));
  }
  // ── dinero de verdad: retorno ABSOLUTO, no exceso ──────────────────────────
  {
    const abs = mesI.map((p) => {
      const ord = [...uni].sort((a, b) => p.tickers[a].crudoNeto - p.tickers[b].crudoNeto);
      return { sel: media(ord.slice(0, 2).map((t) => p.tickers[t].ret)), uni: p.mediaUniverso, spy: p.tickers.SPY.ret };
    });
    const comp = (v) => v.reduce((a, x) => a * (1 + x), 1) - 1;
    console.log(`\n── C12 · EN DINERO DE VERDAD (retorno absoluto, ${abs.length} meses, sin dividendos) ──`);
    console.log(`  selector (2 de flujo más bajista): ${pct(media(abs.map((x) => x.sel)))}/mes · acumulado ${pct(comp(abs.map((x) => x.sel)))}`);
    console.log(`  media del universo de 8:           ${pct(media(abs.map((x) => x.uni)))}/mes · acumulado ${pct(comp(abs.map((x) => x.uni)))}`);
    console.log(`  comprar y aguantar SPY:            ${pct(media(abs.map((x) => x.spy)))}/mes · acumulado ${pct(comp(abs.map((x) => x.spy)))}`);
    const dif = abs.map((x) => x.sel - x.spy);
    console.log(`  selector − SPY: ${pct(media(dif))}/mes · t=${fmt(tUna(dif))} (listón ${LISTON}) · ` +
      `peor mes del selector ${pct(Math.min(...abs.map((x) => x.sel)))}`);
    pruebas.push({ nombre: "C12 · selector menos SPY (dinero real)", n: dif.length, mediaExc: media(dif), t: tUna(dif),
      percentil: NaN, tercios: [], mismoSigno: false, mayor: null });
  }

  // ── AÑO A AÑO Y QUIÉN SE ELIGE: dónde vive de verdad el número ────────────
  {
    const filasMes = mesI.map((p) => {
      const ord = [...uni].sort((a, b) => p.tickers[a].crudoNeto - p.tickers[b].crudoNeto);
      const sel = ord.slice(0, 2);
      return { fecha: p.fecha, ano: p.fecha.slice(0, 4), sel, exc: media(sel.map((t) => p.tickers[t].exc)), ret: media(sel.map((t) => p.tickers[t].ret)) };
    });
    console.log(`\n── AÑO A AÑO (el signo igual en los tres tercios tapa que el efecto está al final) ──`);
    console.log(`  año    meses   exceso/mes   retorno/mes   meses ganadores`);
    for (const a of ["2024", "2025", "2026"]) {
      const g = filasMes.filter((x) => x.ano === a);
      if (!g.length) continue;
      console.log(`  ${a}     ${String(g.length).padStart(2)}      ${pct(media(g.map((x) => x.exc))).padStart(8)}     ` +
        `${pct(media(g.map((x) => x.ret))).padStart(8)}      ${g.filter((x) => x.exc > 0).length}/${g.length}`);
    }
    const cnt = new Map(), apo = new Map();
    for (const f of filasMes) for (const t of f.sel) { cnt.set(t, (cnt.get(t) ?? 0) + 1); apo.set(t, (apo.get(t) ?? 0) + f.exc / 2); }
    console.log(`\n── A QUIÉN ELIGE (${filasMes.length * 2} elecciones) ──`);
    console.log(`  ticker  veces   %      aporte total al exceso`);
    for (const [t, n] of [...cnt.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${t.padEnd(7)} ${String(n).padStart(3)}   ${pct(n / (filasMes.length * 2)).padStart(6)}   ${pct(apo.get(t)).padStart(8)}`);
    }
    const sumTot = [...apo.values()].reduce((a, b) => a + b, 0);
    const mayorAp = [...apo.entries()].sort((a, b) => b[1] - a[1])[0];
    console.log(`  → ${mayorAp[0]} solo aporta el ${pct(mayorAp[1] / sumTot)} de todo el exceso acumulado`);

    // ¿MEDIA O MEDIANA? Un 3,83% de media con 19 de 31 meses ganadores puede ser un puñado de
    // meses enormes. Si al quitar los 3 mejores se cae, no es un selector: es una lotería.
    const ex = filasMes.map((x) => x.exc).sort((a, b) => a - b);
    const sinMejores = ex.slice(0, ex.length - 3), sinPeores = ex.slice(3);
    console.log(`\n── ¿MEDIA O LOTERÍA? ──`);
    console.log(`  meses ganadores: ${filasMes.filter((x) => x.exc > 0).length}/${filasMes.length} · ` +
      `media ${pct(media(ex))} · MEDIANA ${pct(ex[ex.length >> 1])}`);
    console.log(`  mejor mes ${pct(ex[ex.length - 1])} · peor mes ${pct(ex[0])}`);
    console.log(`  quitando los 3 MEJORES meses: ${pct(media(sinMejores))}/mes (t=${fmt(tUna(sinMejores))})`);
    console.log(`  quitando los 3 PEORES  meses: ${pct(media(sinPeores))}/mes`);

    // Traducción a dinero sobre la cuenta REAL. Se marca como NO cobrable porque no pasa el listón.
    const excMes = media(ex);
    const anual = (1 + excMes) ** 12 - 1;
    console.log(`\n── EN DÓLARES AL AÑO (escala, NO cobrable: la prueba no pasa el listón) ──`);
    for (const [cap, et] of [[8313, "efectivo libre"], [55419, "cuenta entera, vendiendo HOOD"]]) {
      console.log(`  sobre $${cap.toLocaleString("es-ES")} (${et}): ${pct(anual)}/año de exceso = ` +
        `$${Math.round(cap * anual).toLocaleString("es-ES")}/año · peor mes ${pct(ex[0])} = $${Math.round(cap * ex[0]).toLocaleString("es-ES")}`);
    }
  }

  console.log(`\n── RESULTADO DE LAS PRUEBAS DE LA PARTE C ──`);
  for (const p of pruebas) if (!Number.isNaN(p.percentil)) console.log(informe(p));
  return pruebas;
}

// ═════════════════════════════════════════════════════════════════════════════
// PARTE B — el score de MarketSnack como selector de acción
// ═════════════════════════════════════════════════════════════════════════════
const BULL = new Set(["bullish"]);
const BEAR = new Set(["bearish"]);

function cargarCierresMS() {
  const files = readdirSync(MS_CIERRES).filter((f) => f.endsWith(".json"));
  const px = new Map();   // sym -> Map(fecha -> close)
  const cuentaDias = new Map();
  for (const f of files) {
    const sym = f.replace(/\.json$/, "");
    let arr;
    try { arr = JSON.parse(readFileSync(`${MS_CIERRES}/${f}`, "utf8")); } catch { continue; }
    if (!Array.isArray(arr) || arr.length < 40) continue;
    const m = new Map();
    for (const [d, c] of arr) if (c > 0) { m.set(d, c); cuentaDias.set(d, (cuentaDias.get(d) ?? 0) + 1); }
    if (m.size >= 40) px.set(sym, m);
  }
  const dias = [...cuentaDias.entries()].filter(([, n]) => n > px.size * 0.9).map(([d]) => d).sort();
  return { px, dias, nSimbolos: px.size };
}

const subyacenteOCC = (s) => (s || "").replace(/\d{6}[CP]\d{8}$/, "");

async function cargarFlujoMS() {
  const porSymDia = new Map();
  const rad = { n: 0, sinSent: 0, score0: 0, scores: [], sinPrima: 0 };
  const rl = createInterface({ input: createReadStream(MS_FLUJO), crlfDelay: Infinity });
  for await (const linea of rl) {
    if (!linea.trim()) continue;
    let o; try { o = JSON.parse(linea); } catch { continue; }
    rad.n++;
    const dia = (o.timestamp || "").slice(0, 10);
    const sym = subyacenteOCC(o.symbol);
    if (!dia || !sym || !(o.premium > 0)) { rad.sinPrima++; continue; }
    if (o.sentiment == null) rad.sinSent++;
    if (!(o.score > 0)) rad.score0++; else rad.scores.push(o.score);
    const k = `${sym}|${dia}`;
    let a = porSymDia.get(k); if (!a) { a = []; porSymDia.set(k, a); }
    a.push({ score: o.score ?? 0, sent: o.sentiment, prima: o.premium });
  }
  return { porSymDia, rad };
}

function senalesMS(ops) {
  if (ops.length < 3) return null;
  let tot = 0, netoScore = 0, netoCrudo = 0, suma = 0;
  for (const o of ops) {
    const s = BULL.has(o.sent) ? 1 : BEAR.has(o.sent) ? -1 : 0;
    tot += o.prima; netoScore += (o.score / 100) * o.prima * s; netoCrudo += o.prima * s; suma += o.score;
  }
  if (!(tot > 0)) return null;
  return { msScoreNeto: netoScore / tot, msCrudoNeto: netoCrudo / tot, msScoreMedio: suma / ops.length, n: ops.length };
}
const SENALES_B = ["msScoreNeto", "msCrudoNeto", "msScoreMedio"];

function periodosMS(px, dias, porSymDia, form, hold, minOps, minPx) {
  const out = [];
  for (let i = form; i + hold < dias.length + 1; i += hold) {
    const diaEntrada = dias[i - 1], diaSalida = dias[i - 1 + hold];
    if (!diaSalida) break;
    const ventana = dias.slice(i - form, i);
    const tickers = {};
    for (const [sym, mapa] of px) {
      const p0 = mapa.get(diaEntrada), p1 = mapa.get(diaSalida);
      if (!(p0 > 0) || !(p1 > 0) || p0 < minPx) continue;
      const ops = [];
      for (const d of ventana) { const a = porSymDia.get(`${sym}|${d}`); if (a) ops.push(...a); }
      if (ops.length < minOps) continue;
      const s = senalesMS(ops);
      if (!s) continue;
      const ret = p1 / p0 - 1;
      if (Math.abs(ret) > 0.6) continue;   // salto imposible en 1-5 días: split sin ajustar
      tickers[sym] = { ...s, ret };
    }
    const syms = Object.keys(tickers);
    if (syms.length < 30) continue;
    const m = media(syms.map((s) => tickers[s].ret));
    for (const s of syms) tickers[s].exc = tickers[s].ret - m;
    out.push({ fecha: diaEntrada, diaEntrada, diaSalida, tickers, mediaUniverso: m, syms });
  }
  return out;
}

function probarMS(nombre, pers, senal, cuota) {
  const excesos = [], elegidos = [];
  for (const p of pers) {
    const k = Math.max(3, Math.round(p.syms.length * cuota));
    const ord = [...p.syms].sort((a, b) => p.tickers[b][senal] - p.tickers[a][senal]);
    excesos.push(media(ord.slice(0, k).map((t) => p.tickers[t].exc)));
    elegidos.push(...ord.slice(0, k));
  }
  const medias = [];
  for (let s = 0; s < SEMILLAS; s++) {
    const r = rng(5000 + s * 104729);
    medias.push(media(pers.map((p) => {
      const k = Math.max(3, Math.round(p.syms.length * cuota));
      return media(barajar(p.syms, r).slice(0, k).map((t) => p.tickers[t].exc));
    })));
  }
  medias.sort((a, b) => a - b);
  const m = media(excesos);
  const percentil = 100 * medias.filter((x) => x < m).length / medias.length;
  const kk = Math.floor(excesos.length / 3);
  const terc = [0, 1, 2].map((i) => media(i < 2 ? excesos.slice(i * kk, (i + 1) * kk) : excesos.slice(2 * kk)));
  const cnt = new Map(); for (const t of elegidos) cnt.set(t, (cnt.get(t) ?? 0) + 1);
  const mayor = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    nombre, n: excesos.length, mediaExc: m, t: tUna(excesos), percentil,
    tercios: terc.map((x) => ({ m: x })), mismoSigno: terc.every((x) => Math.sign(x) === Math.sign(m)) && m !== 0,
    mayor: mayor ? { ticker: mayor[0], pct: mayor[1] / elegidos.length } : null, excesos,
  };
}

async function parteB() {
  console.log("\n" + "═".repeat(96));
  console.log("PARTE B — EL SCORE DE MARKETSNACK COMO SELECTOR DE ACCIÓN (universo ancho)");
  console.log("═".repeat(96));
  if (!existsSync(MS_FLUJO)) { console.log("no hay fichero de flujo de MarketSnack — parte B no se puede correr"); return null; }

  const { px, dias, nSimbolos } = cargarCierresMS();
  const { porSymDia, rad } = await cargarFlujoMS();
  rad.scores.sort((a, b) => a - b);
  console.log(`\n── RADIOGRAFÍA ──`);
  console.log(`cierres: ${nSimbolos} símbolos · ${dias.length} sesiones ${dias[0]} → ${dias[dias.length - 1]}`);
  console.log(`flujo: ${rad.n.toLocaleString("es-ES")} operaciones ≥$1M · sin sentimiento: ${rad.sinSent} · ` +
    `score = 0: ${rad.score0} (${pct(rad.score0 / rad.n)})`);
  console.log(`  score>0: n=${rad.scores.length} · mediana ${rad.scores[rad.scores.length >> 1]} · ` +
    `p90 ${rad.scores[Math.floor(0.9 * rad.scores.length)]} · máx ${rad.scores[rad.scores.length - 1]}`);
  exigir(dias.length >= 60, `sólo ${dias.length} sesiones de cierres de MarketSnack`);

  const resultados = [];
  for (const [form, hold, etiqueta] of [[5, 1, "form 5d → 1 día"], [5, 5, "form 5d → 5 días"]]) {
    const pers = periodosMS(px, dias, porSymDia, form, hold, 3, 5);
    if (!pers.length) { console.log(`  ${etiqueta}: 0 períodos`); continue; }
    const tamanos = pers.map((p) => p.syms.length);
    console.log(`\n── ${etiqueta} · ${pers.length} períodos · universo por período: ` +
      `mín ${Math.min(...tamanos)} · mediana ${tamanos.sort((a, b) => a - b)[tamanos.length >> 1]} · máx ${Math.max(...tamanos)} ──`);
    for (const s of SENALES_B) {
      const r = probarMS(`${etiqueta} · ${s} · decil alto`, pers, s, 0.1);
      resultados.push(r);
      console.log(informe(r));
    }
  }
  // 4 cortes de control
  console.log(`\n── CORTES DE CONTROL ──`);
  const persC = periodosMS(px, dias, porSymDia, 5, 5, 3, 5);
  for (const [cuota, et] of [[0.05, "top 5%"], [0.2, "top 20%"], [0.5, "mitad alta"]]) {
    const r = probarMS(`form 5d → 5 días · msScoreNeto · ${et}`, persC, "msScoreNeto", cuota);
    resultados.push(r); console.log(informe(r));
  }
  {
    const pers = periodosMS(px, dias, porSymDia, 5, 5, 10, 5);   // sólo símbolos con ≥10 operaciones
    const r = probarMS("form 5d → 5 días · msScoreNeto · ≥10 ops (símbolos calientes)", pers, "msScoreNeto", 0.1);
    resultados.push(r); console.log(informe(r));
  }

  const filas = [];
  for (const p of persC) for (const s of p.syms) filas.push({ pnl: p.tickers[s].exc, ticker: s, fecha: p.fecha });
  console.log(`\n── POTENCIA ──`);
  console.log(`  filas símbolo-período: ${filas.length} · desviación del exceso a 5 días: ${pct(desv(filas.map((f) => f.pnl)))}`);
  for (const efecto of [0.005, 0.01, 0.02]) {
    const pw = potencia(filas, efecto);
    console.log(`  buscando ${pct(efecto)} de exceso a 5 días: ${pw.mensaje}`);
    console.log(`    → ${pw.concluyente ? "CONCLUYENTE." : "NO concluyente."}`);
  }
  return resultados;
}

// ═════════════════════════════════════════════════════════════════════════════
(async function main() {
  console.log(`PRUEBAS DECLARADAS: ${PRUEBAS} → listón de Bonferroni |t| ≥ ${LISTON} · control de ${SEMILLAS} semillas`);
  const salida = {};
  const limpia = (r) => { const { excesos, mediasAzar, ...x } = r; return x; };
  if (PARTE.includes("A") || PARTE.includes("C")) {
    const a = await parteA();
    salida.A = a.resultados.map(limpia);
    if (PARTE.includes("C")) salida.C = (await parteC(a)).map(limpia);
  }
  if (PARTE.includes("B")) { const b = await parteB(); if (b) salida.B = b.map(limpia); }

  const todas = [...(salida.A ?? []), ...(salida.B ?? []), ...(salida.C ?? [])];
  const pasan = todas.filter((r) => r.mismoSigno && Math.abs(r.t) >= LISTON && r.percentil >= 95 && (!r.mayor || r.mayor.pct <= 0.2));
  console.log("\n" + "═".repeat(96));
  console.log(`VEREDICTO: pasan las cinco cribas ${pasan.length} de ${todas.length} pruebas`);
  for (const p of pasan) console.log(`  ✓ ${p.nombre}`);
  if (!pasan.length) console.log("  NINGUNA.");
  writeFileSync("scripts/conv-eva-selector-resultado.json", JSON.stringify(salida, null, 1));
  console.log(`\nDetalle en scripts/conv-eva-selector-resultado.json`);
})();
