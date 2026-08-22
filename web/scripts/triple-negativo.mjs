// EL "TRIPLE NEGATIVO" — la idea de Sergio Morales del curso de Victor, medida.
//
// ═══ DE DÓNDE SALE ══════════════════════════════════════════════════════════════════════════
//
// Lester trajo una conversación del curso donde Sergio Morales enseña un panel con un semáforo
// de tres luces. Cuando las tres están en rojo lo llama TRIPLE NEGATIVO y lo lee como
// "volátil / bajista — dealer corto gamma, movimientos amplificados":
//
//   1. GAMMA EN EL SPOT   negativa  → los dealers amplifican cerca del precio
//   2. GAMMA TOTAL        negativa  → el conjunto de la cadena amplifica
//   3. SKEW IV (call−put) negativo  → los puts se pagan más caros que las calls (miedo)
//
// ═══ POR QUÉ MERECE MEDIRSE, SIENDO QUE YA MATAMOS 16 FILTROS DE RÉGIMEN ═══════════════════
//
// Porque **el tercer ingrediente es nuevo**. Los otros dos son gamma, que ya está medida: los
// días de GEX negativo dan −$49 por cóndor contra +$85 los de GEX positivo. Pero el SKEW no mide
// posición: mide **lo que se está pagando por el miedo**. Ninguna de las 16 pruebas de régimen
// (VIX, ATR, amplitud, MA…) tocó la volatilidad implícita relativa entre puts y calls.
//
// Así que la pregunta honesta no es "¿funciona el triple negativo?" —dos tercios de él ya
// sabemos que sí describen— sino: **¿AÑADE ALGO EL SKEW ENCIMA DE LA GAMMA?**
//
// ═══ LAS TRES PREGUNTAS ═════════════════════════════════════════════════════════════════════
//
//   A · ¿predice DIRECCIÓN?     ¿baja SPX los días de triple negativo?
//   B · ¿predice MOVIMIENTO?    ¿se mueve más, en valor absoluto?
//   C · ¿sirve de VETO?         ¿va peor el cóndor que en un día de GEX negativo a secas?
//
// La C es la única que podría dar dinero: sería un filtro más fino para no operar.
//
// ═══ SIN MIRAR AL FUTURO ════════════════════════════════════════════════════════════════════
//
// Las tres luces se leen a las **09:35**, con la IV de esa barra y el interés abierto publicado
// antes de abrir. El cóndor entra a las **11:00**. Nada de después de las 09:35 entra en la
// clasificación.
//
// Uso: node --import tsx --max-old-space-size=12288 scripts/triple-negativo.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const OIDIR = "scripts/cache-theta/oi-spxw";
const SALIDA = "scripts/triple-negativo.json";
const HORA_LUZ = "09:35";        // cuando se leen las tres luces
const HORA_ENTRADA = "11:00";    // cuando entraría el cóndor
const COMM = 0.03, ALA = 50, DIST = 45;
const BANDA_SKEW = 0.02;         // el skew se mide a ±2% del precio

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1)); };
const tDe = (v) => (v.length > 2 ? media(v) / (sd(v) / Math.sqrt(v.length)) : NaN);
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
const num = (x, d = 2) => (isFinite(x) ? x.toFixed(d) : "—");

const phi = (x) => 0.3989422804014327 * Math.exp((-x * x) / 2);
function gammaBS(S, K, T, v) {
  if (!(S > 0) || !(K > 0) || !(T > 0) || !(v > 0)) return 0;
  const d1 = (Math.log(S / K) + (v * v / 2) * T) / (v * Math.sqrt(T));
  const g = phi(d1) / (S * v * Math.sqrt(T));
  return isFinite(g) ? g : 0;
}

/** Lee un día: las filas de las 09:35 (con IV) y las de las 11:00 (con bid/ask), más el cierre. */
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const i = ["strike", "timestamp", "bid", "ask", "underlying_price", "implied_vol"].map((c) => cab.indexOf(c));
  if (i.slice(0, 5).some((x) => x < 0)) return null;
  const [iK, iT, iB, iA, iU, iV] = i;

  const luz = [], entrada = [];
  let spotLuz = 0, spotEnt = 0, cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; cierre = sp; }
    const K = Number(c[iK]);
    if (hora === HORA_LUZ && iV >= 0) {
      const iv = Number(c[iV]);
      if (K > 0 && iv > 0.01 && iv < 4 && sp > 0) { luz.push({ K, iv }); spotLuz = sp; }
    }
    if (hora === HORA_ENTRADA) {
      const bid = Number(c[iB]), ask = Number(c[iA]);
      if (K > 0 && bid >= 0 && ask > 0) { entrada.push({ K, bid, ask }); spotEnt = sp; }
    }
  }
  return { luz, entrada, spotLuz, spotEnt, cierre };
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

// ── construir un día ────────────────────────────────────────────────────────
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
console.log(`\n## ${fechas.length} días de cadena\n`);

const dias = [];
let sinOI = 0, sinDatos = 0;
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.spotLuz > 0) || !(C.spotEnt > 0) || !(C.cierre > 0)) { sinDatos++; continue; }
  const fOI = `${OIDIR}/${fecha}.json`;
  if (!existsSync(fOI)) { sinOI++; continue; }     // SIN interés abierto no se mide. No se rellena.
  const oi = JSON.parse(readFileSync(fOI, "utf8"));

  const S = C.spotLuz;
  const T = ((16 - 9) * 60 - 35) / (60 * 6.5 * 252);

  // ── LUZ 1 y 2: la gamma, pesada por interés abierto real ──────────────────
  let gexTotal = 0, gCallSpot = 0, gPutSpot = 0;
  const kSpot = cerca(C.luz, S).K;                 // el strike pegado al precio
  for (const [lado, lista] of [["C", C.luz], ["P", P.luz]]) {
    for (const s of lista) {
      const peso = Number(oi[`${s.K}|${lado}`] ?? 0);
      if (!(peso > 0)) continue;
      const g = gammaBS(S, s.K, T, s.iv) * peso * 100 * S * S * 0.01;
      if (!isFinite(g) || g <= 0) continue;
      gexTotal += lado === "C" ? g : -g;            // dealers largos de calls, cortos de puts
      // "gamma en el spot": los strikes de la banda pegada al precio (±0,25%)
      if (Math.abs(s.K - S) / S <= 0.0025) { if (lado === "C") gCallSpot += g; else gPutSpot += g; }
    }
  }
  const gammaSpot = gCallSpot - gPutSpot;
  if (gCallSpot === 0 && gPutSpot === 0) { sinDatos++; continue; }

  // ── LUZ 3: el SKEW. IV de la call a +2% menos IV de la put a −2% ──────────
  // Negativo = los puts se pagan más caros = miedo. Es el ingrediente nuevo.
  const cOTM = C.luz.length ? cerca(C.luz, S * (1 + BANDA_SKEW)) : null;
  const pOTM = P.luz.length ? cerca(P.luz, S * (1 - BANDA_SKEW)) : null;
  if (!cOTM || !pOTM) { sinDatos++; continue; }
  const skew = (cOTM.iv - pOTM.iv) * 100;           // en puntos de volatilidad

  // ── el cóndor de las 11:00, con precios reales ───────────────────────────
  let condor = null, credito = 0;
  if (C.entrada.length && P.entrada.length) {
    const sp = C.spotEnt, X = C.cierre;
    const cC = cerca(C.entrada, sp + DIST), pC = cerca(P.entrada, sp - DIST);
    const cL = cerca(C.entrada, cC.K + ALA), pL = cerca(P.entrada, pC.K - ALA);
    if (cL.K > cC.K && pL.K < pC.K) {
      const cred = cC.bid + pC.bid - cL.ask - pL.ask;
      if (cred > 0) {
        const aC = cL.K - cC.K, aP = pC.K - pL.K;
        const dC = Math.min(Math.max(X - cC.K, 0), aC), dP = Math.min(Math.max(pC.K - X, 0), aP);
        condor = (cred - dC - dP) * 100 - 8 * COMM;
        credito = cred * 100;
      }
    }
  }

  dias.push({
    fecha, gammaSpot, gexTotal, skew, condor, credito,
    // el movimiento DESPUÉS de leer las luces: de las 11:00 al cierre
    retorno: (C.cierre - C.spotEnt) / C.spotEnt * 100,
    mueve: Math.abs(C.cierre - C.spotEnt) / C.spotEnt * 100,
    // las tres luces
    l1: gammaSpot < 0, l2: gexTotal < 0, l3: skew < 0,
  });
}
for (const d of dias) {
  d.rojas = (d.l1 ? 1 : 0) + (d.l2 ? 1 : 0) + (d.l3 ? 1 : 0);
  d.triple = d.rojas === 3;
}
console.log(`${dias.length} días medibles · ${sinOI} sin interés abierto · ${sinDatos} sin datos`);
console.log(`   ${dias[0].fecha} → ${dias[dias.length - 1].fecha}\n`);

// ── cuántos días enciende cada luz ──────────────────────────────────────────
console.log("### Cuánto enciende cada luz\n");
console.log(`  1 · gamma en el spot negativa: ${dias.filter((d) => d.l1).length} de ${dias.length} (${Math.round(dias.filter((d) => d.l1).length / dias.length * 100)}%)`);
console.log(`  2 · gamma total negativa:      ${dias.filter((d) => d.l2).length} (${Math.round(dias.filter((d) => d.l2).length / dias.length * 100)}%)`);
console.log(`  3 · skew negativo (puts caros): ${dias.filter((d) => d.l3).length} (${Math.round(dias.filter((d) => d.l3).length / dias.length * 100)}%)`);
console.log(`  **TRIPLE NEGATIVO:            ${dias.filter((d) => d.triple).length} (${Math.round(dias.filter((d) => d.triple).length / dias.length * 100)}%)**\n`);

function fila(nombre, sub) {
  if (sub.length < 20) { console.log(`| ${nombre} | ${sub.length} | muestra corta | | | |`); return; }
  const r = sub.map((d) => d.retorno), m = sub.map((d) => d.mueve);
  const c = sub.map((d) => d.condor).filter((x) => x != null);
  console.log(`| ${nombre} | ${sub.length} | ${num(media(r))}% (t ${num(tDe(r), 1)}) | ${num(media(m))}% | ${c.length ? eur(media(c)) : "—"} | ${c.length ? num(tDe(c), 1) : "—"} |`);
}

console.log("=".repeat(100));
console.log("  A · ¿PREDICE DIRECCIÓN?   B · ¿PREDICE MOVIMIENTO?   C · ¿SIRVE DE VETO?");
console.log("  (de las 11:00 al cierre — DESPUÉS de leer las luces a las 09:35)");
console.log("=".repeat(100) + "\n");
console.log("| qué días | n | retorno medio | movimiento |ndor por op | t |".replace("|ndor", "| cóndor"));
console.log("|---|---|---|---|---|---|");
fila("**TODOS**", dias);
fila("**TRIPLE NEGATIVO** (3 rojas)", dias.filter((d) => d.triple));
fila("2 rojas", dias.filter((d) => d.rojas === 2));
fila("1 roja", dias.filter((d) => d.rojas === 1));
fila("0 rojas (triple POSITIVO)", dias.filter((d) => d.rojas === 0));

console.log(`\n### La pregunta que decide: ¿AÑADE EL SKEW algo encima de la gamma?\n`);
console.log("| qué días | n | retorno medio | movimiento | cóndor por op | t |");
console.log("|---|---|---|---|---|---|");
fila("gamma total negativa (sin mirar skew)", dias.filter((d) => d.l2));
fila("· + skew negativo = TRIPLE", dias.filter((d) => d.l2 && d.l1 && d.l3));
fila("· + skew POSITIVO", dias.filter((d) => d.l2 && d.l1 && !d.l3));
console.log("");
fila("gamma total positiva", dias.filter((d) => !d.l2));
fila("· + skew negativo", dias.filter((d) => !d.l2 && d.l3));
fila("· + skew positivo = TRIPLE POSITIVO", dias.filter((d) => !d.l2 && !d.l1 && !d.l3));

// ── las dos mitades ─────────────────────────────────────────────────────────
const corte = dias[Math.floor(dias.length / 2)].fecha;
console.log(`\n### Las dos mitades · corte en ${corte}\n`);
console.log("| qué | primera mitad | segunda mitad | ¿mismo signo? |");
console.log("|---|---|---|---|");
for (const [nom, filtro, campo] of [
  ["triple negativo · retorno", (d) => d.triple, "retorno"],
  ["triple negativo · movimiento", (d) => d.triple, "mueve"],
  ["triple negativo · cóndor", (d) => d.triple, "condor"],
  ["skew negativo solo · retorno", (d) => d.l3, "retorno"],
]) {
  const a = dias.filter((d) => d.fecha < corte && filtro(d)).map((d) => d[campo]).filter((x) => x != null);
  const b = dias.filter((d) => d.fecha >= corte && filtro(d)).map((d) => d[campo]).filter((x) => x != null);
  if (a.length < 15 || b.length < 15) continue;
  const f = campo === "condor" ? eur : (x) => num(x) + "%";
  console.log(`| ${nom} | ${f(media(a))} (n ${a.length}) | ${f(media(b))} (n ${b.length}) | ${Math.sign(media(a)) === Math.sign(media(b)) ? "**sí**" : "NO"} |`);
}

// ── ¿el skew por sí solo separa? ───────────────────────────────────────────
console.log(`\n### El skew SOLO, por tercios (es el ingrediente que nunca habíamos probado)\n`);
const orden = [...dias].sort((a, b) => a.skew - b.skew);
const k = Math.floor(orden.length / 3);
console.log("| tercio de skew | n | skew medio | retorno | movimiento | cóndor |");
console.log("|---|---|---|---|---|---|");
for (const [nom, g] of [["más negativo (puts caros)", orden.slice(0, k)], ["medio", orden.slice(k, 2 * k)], ["más positivo (calls caras)", orden.slice(2 * k)]]) {
  const c = g.map((d) => d.condor).filter((x) => x != null);
  console.log(`| ${nom} | ${g.length} | ${num(media(g.map((d) => d.skew)))} pts | ${num(media(g.map((d) => d.retorno)))}% | ${num(media(g.map((d) => d.mueve)))}% | ${eur(media(c))} |`);
}

// ═══ LA PREGUNTA DE LESTER: ¿MEJORA ALGUNA DE NUESTRAS ESTRATEGIAS? ═══════════
//
// La única desplegada es el cóndor de los TRES SÍES. Así que la pregunta concreta es:
// ¿añade algo NO OPERAR los días de triple negativo, encima de lo que ya filtran las medias?
//
// Ojo con la trampa: el triple negativo es esencialmente gamma, y la gamma ya salió que no
// aporta encima de los tres síes (2 de diferencia, t=0,15). Pero el triple no es idéntico
// al GEX solo —lleva también la gamma en el spot— así que se mide en vez de suponerse.

const serie = [];
for (const y of [2021, 2022, 2023, 2024, 2025, 2026]) {
  const f = `scripts/cache-theta/SPY_spotmin_y_${y}.json`;
  if (!existsSync(f)) continue;
  for (const [d, arr] of Object.entries(JSON.parse(readFileSync(f, "utf8")))) {
    const m = new Map(arr.map(([mi, p]) => [mi, p]));
    const c = m.get(960), p11 = m.get(660);
    if (c > 0 && p11 > 0) serie.push({ fecha: `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`, c, p11 });
  }
}
serie.sort((a, b) => a.fecha.localeCompare(b.fecha));
const idxS = new Map(serie.map((d, i) => [d.fecha, i]));

// los tres síes necesitan el crédito, que ya se calculó dentro de `condor`: se recupera
// recorriendo otra vez la cadena de las 11:00 sería caro, así que se aprovecha que el cóndor
// sólo existe cuando el crédito fue positivo, y el tercer sí (>= $100) se recalcula aparte.
for (const d of dias) {
  const i = idxS.get(d.fecha);
  if (i === undefined || i < 55) { d.tresSies = false; continue; }
  const cierres = serie.slice(Math.max(0, i - 200), i).map((x) => x.c);
  const p11 = serie[i].p11;
  d.sobreMA5 = p11 > media(cierres.slice(-5));
  d.sobreMA50 = p11 > media(cierres.slice(-50));
  // LOS TRES SÍES COMPLETOS: las dos medias Y el crédito mínimo de $100. Sin el tercero esto
  // no es la regla desplegada, es otra parecida — y compararse contra otra cosa no vale.
  d.tresSies = d.sobreMA5 && d.sobreMA50 && d.condor != null && d.credito >= 100;
}

console.log("\n" + "=".repeat(100));
console.log("  ¿MEJORA EL TRIPLE NEGATIVO NUESTRA REGLA DESPLEGADA (los tres síes)?");
console.log("=".repeat(100) + "\n");
console.log("| qué días | n | cóndor por operación | t | al año (1 contrato) |");
console.log("|---|---|---|---|---|");
const anos = (Date.parse(dias[dias.length-1].fecha) - Date.parse(dias[0].fecha)) / 86400000 / 365.25;
for (const [nom, filtro] of [
  ["**los tres síes** (como está desplegado)", (d) => d.tresSies],
  ["· quitando los de TRIPLE NEGATIVO", (d) => d.tresSies && !d.triple],
  ["· sólo los de triple negativo", (d) => d.tresSies && d.triple],
  ["", null],
  ["sin ningún filtro", () => true],
  ["· sólo NO triple negativo", (d) => !d.triple],
]) {
  if (!filtro) { console.log("| | | | | |"); continue; }
  const c = dias.filter(filtro).map((d) => d.condor).filter((x) => x != null);
  if (c.length < 20) { console.log(`| ${nom} | ${c.length} | muestra corta | | |`); continue; }
  console.log(`| ${nom} | ${c.length} | ${eur(media(c))} | ${num(tDe(c), 2)} | **${eur(suma(c) / anos)}** |`);
}
console.log("");

// ── LA PREGUNTA DIRECTA, CON TODA LA MUESTRA ────────────────────────────────
// Antes la contesté con 21 días —la interseccion con los tres síes— y con 21 datos no se puede
// afirmar nada. Pero la pregunta no necesita esa interseccion: "¿son los días de triple negativo
// malos para vender un cóndor?" se mide sobre TODOS los días. Y encima se puede separar en dos:
//   · ¿el efecto existe?            → triple vs no triple, sobre los 1.112
//   · ¿lo capturan ya las medias?   → lo mismo, pero sólo dentro de los días que pasan las medias
console.log("### ¿SON MALOS ESOS DÍAS? — con toda la muestra, no con 21\n");
console.log("| población | triple negativo | resto | diferencia | t de la diferencia |");
console.log("|---|---|---|---|---|");
function comparar(nom, filtro) {
  const a = dias.filter((d) => filtro(d) && d.triple).map((d) => d.condor).filter((x) => x != null);
  const b = dias.filter((d) => filtro(d) && !d.triple).map((d) => d.condor).filter((x) => x != null);
  if (a.length < 20 || b.length < 20) { console.log("| " + nom + " | muestra corta | | | |"); return; }
  const dif = media(a) - media(b);
  const se = Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length);
  console.log("| " + nom + " | " + eur(media(a)) + " (n " + a.length + ") | " + eur(media(b)) + " (n " + b.length + ") | **" + eur(dif) + "** | " + num(dif / se, 2) + " |");
}
comparar("todos los días", () => true);
comparar("sólo los que pasan las DOS medias", (d) => d.sobreMA5 && d.sobreMA50);
comparar("sólo los que NO pasan las medias", (d) => !(d.sobreMA5 && d.sobreMA50));
console.log("");

// LAS DOS MITADES. Quitar 62 días de 491 puede mejorar por casualidad; si la mejora es real
// tiene que aparecer en las dos mitades del período, no en una.
const mitad = dias[Math.floor(dias.length / 2)].fecha;
console.log("### Las dos mitades — corte en " + mitad + "\n");
console.log("| qué | primera mitad | segunda mitad | ¿mejora en las DOS? |");
console.log("|---|---|---|---|");
for (const [nom, con, sin] of [["los tres síes, quitando el triple negativo", (d) => d.tresSies, (d) => d.tresSies && !d.triple]]) {
  const trozo = (f, desde, hasta) => dias.filter((d) => d.fecha >= desde && d.fecha < hasta && f(d)).map((d) => d.condor).filter((x) => x != null);
  const a1 = trozo(con, "0000", mitad), a2 = trozo(sin, "0000", mitad);
  const b1 = trozo(con, mitad, "9999"), b2 = trozo(sin, mitad, "9999");
  const m1 = media(a2) - media(a1), m2 = media(b2) - media(b1);
  console.log("| " + nom + " | " + eur(media(a1)) + " -> " + eur(media(a2)) + " (" + (m1>=0?"+":"") + eur(m1) + ") | " +
    eur(media(b1)) + " -> " + eur(media(b2)) + " (" + (m2>=0?"+":"") + eur(m2) + ") | " +
    (m1 > 0 && m2 > 0 ? "**sí**" : "NO") + " |");
}
console.log("");

writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString().slice(0, 10), n: dias.length,
  triple: dias.filter((d) => d.triple).length,
}, null, 1), "utf8");
console.log(`\nresumen en ${SALIDA}\n`);
