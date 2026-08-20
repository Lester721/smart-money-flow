// ═══════════════════════════════════════════════════════════════════════════════════════════
// LOS NIVELES DE GEX DE SPX, DÍA A DÍA — la infraestructura para la pregunta de Victor.
//
// ═══ QUÉ PREGUNTA RESPONDE (y cuál NO) ═════════════════════════════════════════════════════
//
// En este proyecto el GEX ya se midió DOS veces como INTERRUPTOR ("¿opero hoy o no?") y las dos
// salió que no separa. Lo que hace Victor es otra cosa: usarlo como NIVELES DE PRECIO — muro de
// calls, muro de puts, punto de giro, imán. Eso NUNCA se ha medido aquí. Este fichero sólo
// CONSTRUYE los niveles; no mide si sirven. Eso viene después.
//
// ═══ EL MOMENTO DE DECISIÓN: 09:35, NO 09:30 ═══════════════════════════════════════════════
//
// Mirado antes de escribir nada (no después): en estos ficheros la barra de las **09:30 tiene
// underlying_price = 0 y ninguna IV resoluble** — la cadena aún no ha cotizado. La primera barra
// con precio del subyacente y con IV real es la de las **09:35**. Así que el momento de decisión
// es 09:35 y se dice, en vez de fingir un 09:30 que el dato no soporta.
//
// ═══ DE DÓNDE SALE CADA COSA — y por qué no hay futuro dentro ═══════════════════════════════
//
//   INTERÉS ABIERTO  scripts/cache-theta/gex-2026/oi_AAAA-MM-DD.csv
//                    Sello de tiempo ~06:30–07:00 ET, ANTES de abrir: es la foto que publica la
//                    OCC por la mañana y que refleja el CIERRE DE AYER. El script COMPRUEBA que
//                    ninguna fila lleve hora ≥ 09:30 y descarta el día si la lleva.
//   IV POR STRIKE    la barra de 09:35 de iv_AAAA-MM-DD_{C,P}.csv. Es la IV REAL del fichero.
//                    NO se estima, NO se interpola: un strike sin IV utilizable se salta y se
//                    cuenta. Black-Scholes se usa SÓLO para la griega, jamás para un precio.
//   PRECIO           underlying_price de la misma barra (= el índice SPX a esa hora).
//
// ═══ LAS TRES FAMILIAS DE NIVELES — y por qué tres ══════════════════════════════════════════
//
// A 6 horas de vencer la gamma es un cuchillo: a IV 15% una sigma es ~0,4% del índice, así que
// un strike al 3% está a 7 sigmas y su gamma es CERO EXACTO. Con la T real, los "muros" se
// pegarían al dinero por construcción y no dirían nada. Por eso se sacan tres versiones y se
// deja que la fase siguiente elija — no se elige aquí:
//
//   gam   gamma Black-Scholes con la T REAL (09:35 → 16:00). El 0DTE de verdad.
//   gamD  la misma gamma con T = 1 día. Ensancha el perfil; es lo que hacen los paneles para
//         que el muro no colapse al dinero. NO es más "correcto": es otra lente.
//   oi    interés abierto puro, sin gamma. El "muro" como lo pinta la mayoría de tableros.
//
// ═══ EL SIGNO ══════════════════════════════════════════════════════════════════════════════
//
// El supuesto de calle es cliente compra calls / vende puts → creador largo de calls, corto de
// puts → net = Σcalls − Σputs. En ESTE proyecto ese supuesto se midió con el lado real y NO se
// sostuvo. Así que se guardan LAS DOS versiones —neta (con signo) y bruta (sin signo)— y decide
// la fase que mide, no ésta.
//
// Salida: scripts/gex-niveles.json
// Uso:    node --import tsx --max-old-space-size=10240 scripts/gex-niveles-construir.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const DIR_SPY = "scripts/cache-theta";
const SALIDA = "scripts/gex-niveles.json";
const HORA = "09:35";                 // momento de decisión (ver cabecera)
const CIERRE_H = "16:00";
const T_REAL = (6 + 25 / 60) / 24 / 365;   // 09:35 → 16:00 ET, en años
const T_DIA = 1 / 365;                     // la lente ancha
const BANDA_GAMMA = 0.10;             // ±10% del spot: más allá la gamma es cero exacto
const BANDA_OI = 0.05;                // ±5% para los muros de OI puro (donde vive el intradía)

// ── Black-Scholes SÓLO para la griega, alimentado con la IV REAL del fichero ────────────────
const phi = (x) => 0.3989422804014327 * Math.exp((-x * x) / 2);
function gammaBS(S, K, t, v) {
  const st = v * Math.sqrt(t);
  if (!(st > 0) || !(S > 0) || !(K > 0)) return 0;
  const d1 = (Math.log(S / K) + (v * v / 2) * t) / st;
  const g = phi(d1) / (S * st);
  return Number.isFinite(g) ? g : 0;
}

// ── GUARDIÁN DE COLUMNAS ───────────────────────────────────────────────────────────────────
// Un campo que no existe se lee como 0 y 0 no da error: da un resultado plausible y falso.
// Ese fallo costó 45 minutos midiendo ceros. Aquí LANZA.
function columnas(cabecera, pedidas, fichero) {
  const cab = cabecera.split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = {};
  const faltan = [];
  for (const p of pedidas) {
    const i = cab.indexOf(p);
    if (i < 0) faltan.push(p);
    idx[p] = i;
  }
  if (faltan.length)
    throw new Error(`${fichero}: faltan columnas [${faltan.join(", ")}]. Cabecera real: ${cab.join("|")}`);
  return idx;
}

// ═══ LECTURA DE UN LADO DE LA CADENA ═══════════════════════════════════════════════════════
// Devuelve la foto de las 09:35 (strike → {bid, ask, iv}) y el CAMINO del subyacente cada 5 min.
function leerLado(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  if (lin.length < 3) return null;
  const I = columnas(lin[0], ["strike", "timestamp", "bid", "ask", "implied_vol", "underlying_price"], f);

  const foto = new Map();               // strike → {bid, ask, iv}
  const camino = new Map();             // "HH:MM" → precio del subyacente
  let horaMin = "99:99";

  for (let j = 1; j < lin.length; j++) {
    const l = lin[j];
    if (l.length < 20) continue;
    const c = l.split(",");
    const ts = c[I.timestamp];
    if (ts.length < 16) continue;
    const h = ts.slice(11, 16);
    const sp = +c[I.underlying_price];
    if (sp > 0) { if (!camino.has(h)) camino.set(h, sp); if (h < horaMin) horaMin = h; }
    if (h !== HORA) continue;
    foto.set(+c[I.strike], { bid: +c[I.bid], ask: +c[I.ask], iv: +c[I.implied_vol] });
  }
  return { foto, camino, horaMin };
}

// ═══ INTERÉS ABIERTO — la foto de la mañana (= cierre de AYER) ══════════════════════════════
// Devuelve null si algo huele a futuro; la razón se anota, no se rellena.
function leerOI(fecha) {
  const f = `${DIR}/oi_${fecha}.csv`;
  if (!existsSync(f)) return { error: "sin fichero de OI" };
  const lin = readFileSync(f, "utf8").split("\n");
  if (lin.length < 3) return { error: "fichero de OI vacío" };
  const I = columnas(lin[0], ["strike", "right", "timestamp", "open_interest"], f);

  const C = new Map(), P = new Map();
  let horaMax = "", horaMin = "99:99", tardias = 0, tardiasConOI = 0, otraFecha = 0;
  for (let j = 1; j < lin.length; j++) {
    const l = lin[j];
    if (l.length < 10) continue;
    const c = l.split(",");
    const ts = c[I.timestamp];
    if (ts.slice(0, 10) !== fecha) { otraFecha++; continue; }   // sólo la foto del propio día
    const h = ts.slice(11, 16);
    const v = +c[I.open_interest];
    // ── NADA DE MIRAR AL FUTURO ──────────────────────────────────────────────────────────
    // Una fila sellada a las 09:30 o después no es "lo último conocido al abrir".
    // MIRADO, no supuesto: en los 1.124 ficheros hay 335 filas así, todas a las 17:30–17:42 ET
    // (después del cierre) y **las 335 con open_interest = 0** — son contratos que vencieron sin
    // interés, republicados al cierre. No aportan nada, así que se saltan y se cuentan.
    // Si alguna vez una llega con OI > 0, eso SÍ sería información del futuro y el día se cae.
    if (h >= "09:30") {
      tardias++;
      if (v > 0) tardiasConOI++;
      continue;
    }
    if (h > horaMax) horaMax = h;
    if (h < horaMin) horaMin = h;
    if (!(v > 0)) continue;
    (c[I.right].replace(/"/g, "") === "CALL" ? C : P).set(+c[I.strike], v);
  }
  if (tardiasConOI > 0)
    return { error: `OI con ${tardiasConOI} filas de después de abrir Y con interés > 0 — sería futuro` };
  if (C.size + P.size < 20) return { error: `OI con sólo ${C.size + P.size} strikes` };
  return { C, P, horaMax, horaMin, otraFecha, tardias };
}

// ═══ PERFIL DE GAMMA EN DÓLARES ════════════════════════════════════════════════════════════
// Une la IV real de la cadena con el OI de la mañana. Un strike sin IV utilizable NO se
// interpola: se salta y se cuenta.
function construirPerfil(fotoC, fotoP, oi, spot) {
  const filas = [];                     // {K, oiC, oiP, ivC, ivP}
  const ks = new Set([...oi.C.keys(), ...oi.P.keys()]);
  let enBanda = 0, sinIV = 0;
  for (const K of ks) {
    if (!(K > 0)) continue;
    if (Math.abs(K - spot) / spot > BANDA_GAMMA) continue;
    enBanda++;
    const fc = fotoC.get(K), fp = fotoP.get(K);
    const ivC = fc && fc.iv > 0.02 && fc.iv < 3 ? fc.iv : null;
    const ivP = fp && fp.iv > 0.02 && fp.iv < 3 ? fp.iv : null;
    if (ivC === null && ivP === null) { sinIV++; continue; }
    filas.push({ K, oiC: oi.C.get(K) || 0, oiP: oi.P.get(K) || 0, ivC, ivP });
  }
  return { filas, enBanda, sinIV };
}

/** Gamma en dólares por strike, evaluada en el precio S con el plazo t. */
function gammaPorStrike(perfil, S, t) {
  const out = [];
  for (const f of perfil) {
    const gc = f.ivC !== null ? gammaBS(S, f.K, t, f.ivC) : 0;
    const gp = f.ivP !== null ? gammaBS(S, f.K, t, f.ivP) : 0;
    // $ por cada 1% de movimiento (la fórmula del encargo)
    const dC = gc * f.oiC * 100 * S * S * 0.01;
    const dP = gp * f.oiP * 100 * S * S * 0.01;
    // $ por PUNTO de movimiento
    const pC = gc * f.oiC * 100 * S;
    const pP = gp * f.oiP * 100 * S;
    if (dC || dP) out.push({ K: f.K, dC, dP, pC, pP });
  }
  return out;
}

const argmax = (arr, val) => {
  let mejor = null, m = -Infinity;
  for (const a of arr) { const v = val(a); if (v > m) { m = v; mejor = a; } }
  return mejor === null || m <= 0 ? null : { K: mejor.K, v: m };
};

/** Punto de giro: el precio donde la gamma NETA del creador cambia de signo. */
function puntoDeGiro(perfil, spot, t) {
  const paso = 0.0005;                  // 0,05% del spot
  const pts = [];
  for (let i = -60; i <= 60; i++) {
    const S = spot * (1 + i * paso);
    let net = 0;
    for (const g of gammaPorStrike(perfil, S, t)) net += g.dC - g.dP;
    pts.push({ S, net });
  }
  let mejor = null, dist = Infinity, cruces = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if ((a.net < 0 && b.net >= 0) || (a.net > 0 && b.net <= 0)) {
      cruces++;
      const S0 = a.S + (b.S - a.S) * (0 - a.net) / (b.net - a.net);
      if (Math.abs(S0 - spot) < dist) { dist = Math.abs(S0 - spot); mejor = S0; }
    }
  }
  return { flip: mejor, cruces };
}

/** Max pain clásico: el strike que deja el menor pago total a los tenedores. Sólo OI. */
function maxPain(oi) {
  const ks = [...new Set([...oi.C.keys(), ...oi.P.keys()])].sort((a, b) => a - b);
  if (ks.length < 5) return null;
  let mejor = null, min = Infinity;
  for (const S of ks) {
    let pago = 0;
    for (const [K, n] of oi.C) if (S > K) pago += (S - K) * n;
    for (const [K, n] of oi.P) if (K > S) pago += (K - S) * n;
    if (pago < min) { min = pago; mejor = S; }
  }
  return mejor;
}

const dist = (nivel, spot) => nivel == null ? null
  : { pts: +(nivel - spot).toFixed(2), pct: +(((nivel - spot) / spot) * 100).toFixed(3) };

// ═══ EL VEHÍCULO QUE SÍ PUEDE COMPRAR: SPY ═════════════════════════════════════════════════
// Lester NO puede comprar el índice SPX. Los niveles salen en puntos de SPX; el vehículo cotiza
// en dólares de SPY. La razón NO es 10 fijo —se mueve entre 10,000 y 10,047 en el período, o sea
// 26 puntos de SPX, más que la distancia mediana al muro— así que se guarda la razón DEL DÍA y
// se convierte día a día. Convertir con un 10 fijo sería un error mayor que el nivel medido.
// Minuto 570 = 09:30 · 575 = 09:35 · 960 = 16:00.
const spyPorDia = {};
for (const y of [2022, 2023, 2024, 2025, 2026]) {
  const p = `${DIR_SPY}/SPY_spotmin_y_${y}.json`;
  if (existsSync(p)) Object.assign(spyPorDia, JSON.parse(readFileSync(p, "utf8")));
}
function leerSPY(fecha) {
  const d = spyPorDia[fecha.replace(/-/g, "")];
  if (!d || !d.length) return null;
  const m = new Map(d);
  const ap = m.get(575), ci = m.get(960) ?? d[d.length - 1][1];
  if (!(ap > 0) || !(ci > 0)) return null;
  let max = -Infinity, min = Infinity;
  for (const [t, p] of d) if (t >= 575 && p > 0) { if (p > max) max = p; if (p < min) min = p; }
  return { apertura: +ap.toFixed(2), cierre: +ci.toFixed(2), max: +max.toFixed(2), min: +min.toFixed(2), minutos: d.length };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
const fechas = [...new Set(readdirSync(DIR)
  .map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

console.log(`\n## NIVELES DE GEX DE SPXW · ${fechas.length} días con cadena de calls`);
console.log(`   momento de decisión ${HORA} · T real ${(T_REAL * 365 * 24).toFixed(2)} h · banda gamma ±${BANDA_GAMMA * 100}%\n`);

const filas = [];
const descartes = {};
const anota = (k) => { descartes[k] = (descartes[k] || 0) + 1; };
let horaOImax = "", horaOImin = "99:99";
const t0 = Date.now();

for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  if (i % 100 === 0)
    console.log(`  ${String(i).padStart(4)}/${fechas.length} · ${fecha} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  const C = leerLado(fecha, "C"), P = leerLado(fecha, "P");
  if (!C || !P) { anota("falta un lado de la cadena"); continue; }

  // ── camino del subyacente: unión de los dos lados, cada 5 minutos ──
  const camino = new Map([...P.camino, ...C.camino]);
  const horas = [...camino.keys()].sort();
  if (!horas.length) { anota("cadena sin precio del subyacente"); continue; }
  const spot = camino.get(HORA);
  if (!(spot > 0)) { anota(`sin precio del subyacente a las ${HORA}`); continue; }
  const cierre = camino.get(CIERRE_H) ?? camino.get(horas[horas.length - 1]);
  if (!(cierre > 0)) { anota("sin precio de cierre"); continue; }

  const oi = leerOI(fecha);
  if (oi.error) { anota(oi.error.replace(/\d+/g, "N")); continue; }
  if (oi.horaMax > horaOImax) horaOImax = oi.horaMax;
  if (oi.horaMin < horaOImin) horaOImin = oi.horaMin;

  const { filas: perfil, enBanda, sinIV } = construirPerfil(C.foto, P.foto, oi, spot);
  if (perfil.length < 20) { anota("menos de 20 strikes con OI e IV en banda"); continue; }

  // ── recorrido del día, sólo desde HORA en adelante (lo anterior no se opera) ──
  const desde = horas.filter((h) => h >= HORA);
  let max = -Infinity, min = Infinity;
  for (const h of desde) { const p = camino.get(h); if (p > max) max = p; if (p < min) min = p; }
  // resumen cada 30 minutos (el fichero completo son 5 min y sigue en el CSV)
  const cada30 = desde.filter((h) => h.endsWith(":00") || h.endsWith(":30")).map((h) => [h, +camino.get(h).toFixed(2)]);

  // ── LOS NIVELES, en las tres lentes ──────────────────────────────────────────────────────
  const niveles = {};
  for (const [nombre, t] of [["gam", T_REAL], ["gamD", T_DIA]]) {
    const g = gammaPorStrike(perfil, spot, t);
    const muroC = argmax(g, (x) => x.dC);
    const muroP = argmax(g, (x) => x.dP);
    const imanBruto = argmax(g, (x) => x.dC + x.dP);          // sin signo
    const imanNeto = argmax(g, (x) => Math.abs(x.dC - x.dP)); // signo supuesto
    let netPct = 0, absPct = 0, netPunto = 0, absPunto = 0;
    for (const x of g) { netPct += x.dC - x.dP; absPct += x.dC + x.dP; netPunto += x.pC - x.pP; absPunto += x.pC + x.pP; }
    const { flip, cruces } = puntoDeGiro(perfil, spot, t);
    niveles[nombre] = {
      muroCall: muroC?.K ?? null, muroPut: muroP?.K ?? null,
      imanBruto: imanBruto?.K ?? null, imanNeto: imanNeto?.K ?? null,
      flip: flip == null ? null : +flip.toFixed(2), crucesFlip: cruces,
      netPct: +netPct.toFixed(0), absPct: +absPct.toFixed(0),      // $ por 1% de movimiento
      netPunto: +netPunto.toFixed(0), absPunto: +absPunto.toFixed(0), // $ por punto
      dMuroCall: dist(muroC?.K, spot), dMuroPut: dist(muroP?.K, spot),
      dImanBruto: dist(imanBruto?.K, spot), dImanNeto: dist(imanNeto?.K, spot),
      dFlip: dist(flip, spot),
    };
  }
  // ── lente 3: interés abierto puro, sin gamma ──
  {
    const enB = [];
    for (const K of new Set([...oi.C.keys(), ...oi.P.keys()]))
      if (Math.abs(K - spot) / spot <= BANDA_OI) enB.push({ K, c: oi.C.get(K) || 0, p: oi.P.get(K) || 0 });
    const muroC = argmax(enB, (x) => x.c), muroP = argmax(enB, (x) => x.p);
    const iman = argmax(enB, (x) => x.c + x.p);
    let oiC = 0, oiP = 0; for (const x of enB) { oiC += x.c; oiP += x.p; }
    niveles.oi = {
      muroCall: muroC?.K ?? null, muroPut: muroP?.K ?? null, imanBruto: iman?.K ?? null,
      oiCall: oiC, oiPut: oiP, ratioPutCall: oiC > 0 ? +(oiP / oiC).toFixed(3) : null,
      dMuroCall: dist(muroC?.K, spot), dMuroPut: dist(muroP?.K, spot), dImanBruto: dist(iman?.K, spot),
    };
  }
  const mp = maxPain(oi);

  // ── el PEAJE real, para que la fase que mida no lo invente ───────────────────────────────
  // bid/ask REALES de las 09:35 en el dinero y a ±0,5%. Nunca el punto medio como resultado.
  const cotiza = (foto, objetivo) => {
    let mejor = null, d = Infinity;
    for (const [K, q] of foto) if (q.ask > 0 && Math.abs(K - objetivo) < d) { d = Math.abs(K - objetivo); mejor = { K, bid: q.bid, ask: q.ask }; }
    if (!mejor) return null;
    const mid = (mejor.bid + mejor.ask) / 2;
    return { K: mejor.K, bid: +mejor.bid.toFixed(2), ask: +mejor.ask.toFixed(2), horquillaPct: mid > 0 ? +(((mejor.ask - mejor.bid) / mid) * 100).toFixed(2) : null };
  };
  const peaje = {
    callATM: cotiza(C.foto, spot), putATM: cotiza(P.foto, spot),
    call05: cotiza(C.foto, spot * 1.005), put05: cotiza(P.foto, spot * 0.995),
  };

  filas.push({
    fecha, hora: HORA,
    apertura: +spot.toFixed(2), cierre: +cierre.toFixed(2),
    // OJO: máximo y mínimo MUESTREADOS cada 5 min desde las 09:35, no el máximo de la cinta.
    maxMuestreado: +max.toFixed(2), minMuestreado: +min.toFixed(2),
    movDiaPct: +(((cierre - spot) / spot) * 100).toFixed(3),
    rangoPct: +(((max - min) / spot) * 100).toFixed(3),
    niveles, maxPain: mp, dMaxPain: dist(mp, spot),
    peaje, cada30,
    // el vehículo real (null si ese día no hay minuto a minuto de SPY — se dice, no se rellena)
    spy: (() => {
      const s = leerSPY(fecha);
      return s ? { ...s, razonSPX: +(spot / s.apertura).toFixed(4) } : null;
    })(),
    // procedencia y salud del dato — para que nadie tenga que fiarse
    horaOI: oi.horaMax, strikesPerfil: perfil.length, strikesEnBanda: enBanda, strikesSinIV: sinIV,
    barras5min: horas.length,
  });
}

const dur = ((Date.now() - t0) / 1000 / 60).toFixed(1);
writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString(),
  fuente: DIR, hora: HORA, tReal: T_REAL, tDia: T_DIA,
  bandaGamma: BANDA_GAMMA, bandaOI: BANDA_OI,
  aviso: "maxMuestreado/minMuestreado son de barras de 5 min, NO el máximo/mínimo de la cinta.",
  avisoSPY: "spy=null en los días sin minuto a minuto de SPY en caché. NO se rellena. " +
            "razonSPX = SPX(09:35)/SPY(09:35): convertir un nivel con ella, no con un 10 fijo.",
  descartes, filas,
}, null, 0), "utf8");

console.log(`\n── HECHO en ${dur} min ──`);
console.log(`  días con niveles: ${filas.length} de ${fechas.length}`);
console.log(`  descartes:`);
for (const [k, v] of Object.entries(descartes).sort((a, b) => b[1] - a[1])) console.log(`     ${String(v).padStart(4)}  ${k}`);
console.log(`  sello del OI usado: entre ${horaOImin} y ${horaOImax} ET (tiene que ser ANTES de 09:30)`);
console.log(`  escrito: ${SALIDA}`);
