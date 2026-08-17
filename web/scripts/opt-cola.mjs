// EL RIESGO DE COLA Y EL TAMAÑO — lo que decide si el cóndor 0DTE es OPERABLE
//
// Uso: node --max-old-space-size=10240 scripts/opt-cola.mjs
//      HORA=11:00 ALA=50 DIST=25 node scripts/opt-cola.mjs
//
// ═══ EL PROBLEMA QUE HAY QUE EXPLICAR ══════════════════════════════════════════════════════
//
// El barrido de especificaciones dio, con ±25 puntos y alas de 50, un P&L medio de $74/día sobre
// 653 días. A 250 sesiones al año eso son ~$18.500/año. El riesgo máximo de UN cóndor es
// (50 puntos × $100) − crédito ≈ $4.500. Dividir una cosa por la otra da >400% "sobre el riesgo",
// y eso NO es un rendimiento: es un error de unidades. El riesgo de $4.500 se compromete durante
// CINCO HORAS y se recicla 250 veces al año. El denominador correcto no es el riesgo de un día,
// es el CAPITAL que hay que tener parado para sobrevivir a la peor racha. Este script calcula ese
// capital y, con él, el rendimiento de verdad.
//
// ═══ CRITERIO ESCRITO ANTES DE CORRER ══════════════════════════════════════════════════════
//
// PRUEBAS DECLARADAS: 6 especificaciones de contraste (±15/±20/±25/±35 con ala 50; ±25 con alas
// 25 y 100) + 6 umbrales de crédito mínimo. TODAS se reportan enteras, ganen o pierdan; ninguna
// se elige como "la buena". Listón de Bonferroni para 12 pruebas: |t| ≥ 3,03.
//
// LO QUE SE MIDE, decidido antes de ver los números:
//   1. Peor día de los 653 y los 10 peores.
//   2. Cuántos días de ganancia se come el peor.
//   3. Racha máxima de días perdedores y dinero de esa racha.
//   4. Caída máxima acumulada (pico a valle).
//   5. Bootstrap por BLOQUES de 5 días × 2.000 semillas: lo observado es UNA trayectoria y hace
//      falta la distribución (trampa nº5, el control de una sola tirada).
//   6. Tamaño: cuántos contratos caben en $55.419 y cuánto paga eso AL AÑO en dólares.
//   7. Un hueco del 5% en SPX, y las dos semanas malas que SÍ hay en la muestra.
//   8. Signo en los TRES tercios de tiempo (criba 3 de la barrera).
//
// LA CRIBA DE CONCENTRACIÓN NO APLICA y hay que decirlo: la estrategia es de UN solo subyacente,
// así que SPXW es el 100% de la muestra por construcción. Eso no invalida la medición, pero sí
// significa que no hay ninguna diversificación detrás de la media: todos los contratos de un día
// ganan o pierden juntos.
//
// PRECIOS: se cobra el BID de las dos vendidas y se paga el ASK de las dos compradas. Liquidación
// contra el último precio real del subyacente del día. Ningún modelo en ninguna parte.
//
// VERIFICADO EN EL FICHERO CRUDO (scripts/opt-cola-diag.mjs, 2024-04-04 11:00): la sonrisa es
// monótona, las horquillas son estrechas y la PARIDAD PUT-CALL se cumple a menos de $0,60
// (C−P = −24,1 contra S−K = −24,7 en el strike 5270). Los precios son reales y coherentes.
// El cierre calculado (5147,2) coincide con el cierre real de SPX de ese día (5147,21).

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = process.env.HORA || "11:00";
const ALA = Number(process.env.ALA || 50);
const DIST = Number(process.env.DIST || 25);
const CUENTA = 55419;          // la cuenta real de Lester
const EFECTIVO = CUENTA * 0.15; // el 85% está en 500 acciones de HOOD
const TASA = 0.03;             // tasas por contrato en Robinhood (OCC/SEC)
const TASA_SPX = 0.65;         // tasas realistas de opciones de ÍNDICE (ORF + cuota de mercado)
const LISTON_T = 3.03;         // Bonferroni con 12 pruebas declaradas

// ── LECTURA + RADIOGRAFÍA ─────────────────────────────────────────────────────────────────
const diag = { ficheros: 0, sinFilasEnHora: 0, spotCero: 0, bidCero: 0, filasHora: 0 };

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  diag.ficheros++;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid");
  const iA = cab.indexOf("ask"), iV = cab.indexOf("implied_vol"), iU = cab.indexOf("underlying_price");
  if ([iK, iT, iB, iA, iV, iU].some((x) => x < 0)) throw new Error(`${f}: falta una columna — ${cab.join("|")}`);

  const enHora = [];
  let ultimoSpot = 0, ultimaHora = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const hora = String(c[iT]).slice(11, 16);
    const spot = Number(c[iU]);
    if (spot > 0 && hora >= ultimaHora) { ultimaHora = hora; ultimoSpot = spot; }
    if (hora !== HORA) continue;
    diag.filasHora++;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]), iv = Number(c[iV]);
    if (!(spot > 0)) { diag.spotCero++; continue; }
    if (!(bid > 0)) diag.bidCero++;
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, iv, spot });
  }
  if (!enHora.length) { diag.sinFilasEnHora++; return null; }
  return { filas: enHora, cierre: ultimoSpot, horaCierre: ultimaHora };
}

const cerca = (filas, obj) => filas.reduce((a, b) => (Math.abs(b.K - obj) < Math.abs(a.K - obj) ? b : a));

/** Construye la serie diaria de P&L de un cóndor con distancia `d` y alas `ala`. */
function serie(fechas, d, ala) {
  const out = [];
  for (const fecha of fechas) {
    const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
    if (!C || !P || !(C.cierre > 0)) continue;
    const spot = C.filas[0].spot;
    if (!(spot > 0)) continue;
    const cCorta = cerca(C.filas, spot + d), pCorta = cerca(P.filas, spot - d);
    const cLarga = cerca(C.filas, cCorta.K + ala), pLarga = cerca(P.filas, pCorta.K - ala);
    if (cLarga.K <= cCorta.K || pLarga.K >= pCorta.K) continue;
    const credito = cCorta.bid + pCorta.bid - cLarga.ask - pLarga.ask;
    if (!(credito > 0)) continue;
    const anchoC = cLarga.K - cCorta.K, anchoP = pCorta.K - pLarga.K;
    const S = C.cierre;
    const perdCall = Math.min(Math.max(S - cCorta.K, 0), anchoC);
    const perdPut = Math.min(Math.max(pCorta.K - S, 0), anchoP);
    const bruto = (credito - perdCall - perdPut) * 100;
    const riesgo = (Math.max(anchoC, anchoP) - credito) * 100;
    out.push({
      fecha, spot, cierre: S, mov: S - spot, movPct: (S - spot) / spot * 100,
      credito: credito * 100, riesgo, ratio: credito * 100 / riesgo,
      pl: bruto - 8 * TASA,
      plSpx: bruto - 8 * TASA_SPX,
      maxPerdida: perdCall + perdPut >= Math.max(anchoC, anchoP) - 1e-9,
      cCorta: cCorta.K, pCorta: pCorta.K, cLarga: cLarga.K, pLarga: pLarga.K,
    });
  }
  return out;
}

// ── ESTADÍSTICA ───────────────────────────────────────────────────────────────────────────
const suma = (v) => v.reduce((a, b) => a + b, 0);
const med = (v) => (v.length ? suma(v) / v.length : NaN);
const de = (v) => { const m = med(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tStat = (v) => med(v) / (de(v) / Math.sqrt(v.length));
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const eur = (x) => (!Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));

function cola(v) {
  const pls = v.map((x) => x.pl);
  const gan = pls.filter((x) => x > 0), per = pls.filter((x) => x <= 0);
  let racha = 0, rachaMax = 0, dineroRacha = 0, dineroRachaMax = 0, rachaFin = "";
  let acum = 0, pico = 0, caida = 0, caidaIni = "", caidaFin = "", curIni = v[0]?.fecha ?? "";
  for (const x of v) {
    if (x.pl <= 0) {
      racha++; dineroRacha += x.pl;
      if (racha > rachaMax) { rachaMax = racha; rachaFin = x.fecha; }
      if (dineroRacha < dineroRachaMax) dineroRachaMax = dineroRacha;
    } else { racha = 0; dineroRacha = 0; }
    acum += x.pl;
    if (acum > pico) { pico = acum; curIni = x.fecha; }
    if (pico - acum > caida) { caida = pico - acum; caidaFin = x.fecha; caidaIni = curIni; }
  }
  return {
    n: v.length, total: suma(pls), medio: med(pls), mediana: pct(pls, 0.5), de: de(pls), t: tStat(pls),
    acierto: gan.length / v.length, ganMedia: med(gan), perMedia: med(per),
    peor: Math.min(...pls), mejor: Math.max(...pls),
    p01: pct(pls, 0.01), p05: pct(pls, 0.05), p10: pct(pls, 0.10),
    diezPeores: [...v].sort((a, b) => a.pl - b.pl).slice(0, 10),
    rachaMax, rachaFin, dineroRachaMax, caida, caidaIni, caidaFin,
    maxPerdidas: v.filter((x) => x.maxPerdida).length,
    riesgoMedio: med(v.map((x) => x.riesgo)), creditoMedio: med(v.map((x) => x.credito)),
    plSpxMedio: med(v.map((x) => x.plSpx)),
  };
}

/** Bootstrap por BLOQUES (conserva el apelotonamiento de las pérdidas). */
function bootstrapBloques(pls, semillas = 2000, bloque = 5) {
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const caidas = [], rachas = [], anios = [];
  const N = pls.length;
  for (let it = 0; it < semillas; it++) {
    const camino = [];
    while (camino.length < N) {
      const ini = Math.floor(rnd() * N);
      for (let k = 0; k < bloque && camino.length < N; k++) camino.push(pls[(ini + k) % N]);
    }
    let acum = 0, pico = 0, caida = 0, racha = 0, rMax = 0;
    for (const p of camino) {
      acum += p; if (acum > pico) pico = acum;
      if (pico - acum > caida) caida = pico - acum;
      if (p <= 0) { racha++; if (racha > rMax) rMax = racha; } else racha = 0;
    }
    caidas.push(caida); rachas.push(rMax); anios.push(acum / N * 250);
  }
  return {
    caidaP50: pct(caidas, 0.5), caidaP90: pct(caidas, 0.9), caidaP95: pct(caidas, 0.95), caidaP99: pct(caidas, 0.99),
    rachaP50: pct(rachas, 0.5), rachaP95: pct(rachas, 0.95), rachaP99: pct(rachas, 0.99),
    anioP05: pct(anios, 0.05), anioP50: pct(anios, 0.5), anioP95: pct(anios, 0.95),
    anioNegativos: anios.filter((x) => x < 0).length / semillas,
  };
}

/** Criba 3 de la barrera: ¿mismo signo en los tres tercios de tiempo? */
function tercios(v) {
  const ord = [...v].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const k = Math.floor(ord.length / 3);
  const out = [];
  for (let i = 0; i < 3; i++) {
    const g = i < 2 ? ord.slice(i * k, (i + 1) * k) : ord.slice(2 * k);
    const pls = g.map((x) => x.pl);
    out.push({ periodo: `${g[0].fecha}→${g[g.length - 1].fecha}`, n: g.length, medio: med(pls), t: tStat(pls) });
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════════════════
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
console.log(`\n═══ RIESGO DE COLA Y TAMAÑO · cóndor SPXW 0DTE · ±${DIST} puntos · alas ${ALA} · entrada ${HORA} ET ═══`);
console.log(`    ${fechas.length} sesiones en disco, de ${fechas[0]} a ${fechas[fechas.length - 1]}\n`);

const v = serie(fechas, DIST, ALA);

console.log("── 0. RADIOGRAFÍA (mirar el fichero antes de medirlo) ──");
console.log(`  ficheros abiertos ${diag.ficheros} · filas a las ${HORA} ${diag.filasHora.toLocaleString("es-ES")} · spot=0 descartados ${diag.spotCero}`);
console.log(`  bid=0 en el ${(diag.bidCero / diag.filasHora * 100).toFixed(1)}% de las filas (son strikes muy lejanos; los cuatro del cóndor NO)`);
console.log(`  días con cóndor construible: ${v.length} de ${fechas.length}`);
if (v.length < fechas.length * 0.85) throw new Error(`sólo ${v.length}/${fechas.length} días construibles — bug de lectura, no resultado`);
const movs = v.map((x) => Math.abs(x.movPct));
console.log(`  |movimiento| tras entrar: mediana ${pct(movs, 0.5).toFixed(2)}% · p95 ${pct(movs, 0.95).toFixed(2)}% · máx ${Math.max(...movs).toFixed(2)}%`);
const creds = v.map((x) => x.credito);
if (new Set(creds.map((c) => Math.round(c))).size < 20) throw new Error("el crédito no varía — campo muerto");
console.log(`  crédito: p05 ${eur(pct(creds, 0.05))} · p10 ${eur(pct(creds, 0.1))} · mediana ${eur(pct(creds, 0.5))} · p90 ${eur(pct(creds, 0.9))}`);
const rat = v.map((x) => x.ratio * 100);
console.log(`  crédito ÷ riesgo: p10 ${pct(rat, 0.1).toFixed(1)}% · mediana ${pct(rat, 0.5).toFixed(1)}% · p90 ${pct(rat, 0.9).toFixed(1)}%`);
console.log(`  ⚠ "±25 PUNTOS" no es una regla de riesgo: el mismo cóndor cobra ${eur(pct(creds, 0.05))} un día y ${eur(pct(creds, 0.95))} otro\n`);

const c = cola(v);

console.log("── 1. UN CONTRATO, LOS 653 DÍAS ──");
console.log(`  P&L total ......................... ${eur(c.total)}   (${eur(c.medio)}/día · mediana ${eur(c.mediana)})`);
console.log(`  desviación típica diaria .......... ${eur(c.de)}   →  t = ${c.t.toFixed(2)} (listón Bonferroni ${LISTON_T})`);
console.log(`  acierto ........................... ${(c.acierto * 100).toFixed(1)}%   (gana ${eur(c.ganMedia)} · pierde ${eur(c.perMedia)})`);
console.log(`  riesgo máximo por cóndor .......... ${eur(c.riesgoMedio)} de media`);
console.log(`  días de PÉRDIDA MÁXIMA ............ ${c.maxPerdidas} (${(c.maxPerdidas / c.n * 100).toFixed(1)}%)`);
console.log(`  percentiles: p01 ${eur(c.p01)} · p05 ${eur(c.p05)} · p10 ${eur(c.p10)} · mejor ${eur(c.mejor)}`);
console.log(`  con tasas de ÍNDICE ($${TASA_SPX}/contrato) el medio baja a ${eur(c.plSpxMedio)}/día (−${((1 - c.plSpxMedio / c.medio) * 100).toFixed(0)}%)`);
const ee = c.de / Math.sqrt(c.n);
console.log(`\n  ⛔ EL NÚMERO QUE MANDA: con ${eur(c.de)} de desviación diaria y n=${c.n}, el error típico de la media`);
console.log(`  es ${eur(ee)}. El intervalo del 95% para el P&L/día va de ${eur(c.medio - 1.96 * ee)} a ${eur(c.medio + 1.96 * ee)},`);
console.log(`  y AL AÑO de ${eur((c.medio - 1.96 * ee) * 250)} a ${eur((c.medio + 1.96 * ee) * 250)}. El cero está DENTRO.`);
console.log(`  t=${c.t.toFixed(2)} no llega ni al listón de una sola prueba (2,0), y mucho menos al de ${LISTON_T} de las 12 declaradas.`);
console.log(`  Los "$18.621/año" son la mejor estimación puntual, pero la muestra NO distingue esa cifra de cero.\n`);

console.log("── 2. LOS DIEZ PEORES DÍAS ──");
console.log("  fecha         P&L      mov.SPX   crédito   riesgo   cred/riesgo   strikes vendidos");
for (const d of c.diezPeores) {
  console.log(`  ${d.fecha}  ${eur(d.pl).padStart(7)}   ${((d.movPct >= 0 ? "+" : "") + d.movPct.toFixed(2) + "%").padStart(7)}   ` +
              `${eur(d.credito).padStart(7)}  ${eur(d.riesgo).padStart(7)}   ${(d.ratio * 100).toFixed(1).padStart(9)}%   ${d.pCorta}/${d.cCorta}`);
}
const peor = c.diezPeores[0];
const d10 = suma(c.diezPeores.map((x) => x.pl));
console.log(`\n  El peor día (${peor.fecha}) se come ${Math.abs(peor.pl / c.ganMedia).toFixed(1)} días GANADORES y ${Math.abs(peor.pl / c.medio).toFixed(0)} días de P&L medio.`);
console.log(`  Los 10 peores suman ${eur(d10)}: el ${(Math.abs(d10) / c.total * 100).toFixed(0)}% de todo lo ganado en 2 años y medio, en 10 sesiones.`);
console.log(`  Crédito de esos 10 días: mediana ${eur(pct(c.diezPeores.map((x) => x.credito), 0.5))} contra ${eur(pct(creds, 0.5))} del conjunto — o sea que NO son`);
console.log(`  días de cobrar poco: son mañanas con la prima ALTA que aun así se quedaron cortas. Cobrar más`);
console.log(`  no protege del día malo, porque el día malo es justo el que la prima estaba anticipando.\n`);

// ── DECILES DE CRÉDITO: ¿el crédito de entrada dice algo del resultado? ──
console.log("  ¿Predice el crédito? (deciles por crédito de entrada, ordenados de menos a más)");
const ordCred = [...v].sort((a, b) => a.credito - b.credito);
const kD = Math.floor(ordCred.length / 10);
const filaD = [], filaP = [];
for (let i = 0; i < 10; i++) {
  const g = i < 9 ? ordCred.slice(i * kD, (i + 1) * kD) : ordCred.slice(9 * kD);
  filaD.push(eur(med(g.map((x) => x.credito))).padStart(7));
  filaP.push(eur(med(g.map((x) => x.pl))).padStart(7));
}
console.log(`    crédito medio  ${filaD.join("")}`);
console.log(`    P&L medio      ${filaP.join("")}\n`);

console.log("── 3. RACHAS Y CAÍDA ACUMULADA (un contrato) ──");
console.log(`  racha máxima de días perdedores ... ${c.rachaMax} sesiones seguidas (acaba el ${c.rachaFin})`);
console.log(`  dinero de la peor racha ........... ${eur(c.dineroRachaMax)}`);
console.log(`  CAÍDA MÁXIMA pico-a-valle ......... ${eur(-c.caida)}   (${c.caidaIni} → ${c.caidaFin})`);
console.log(`  = ${(c.caida / c.total * 100).toFixed(0)}% de todo lo ganado · ${(c.caida / c.riesgoMedio).toFixed(1)}× el riesgo de un cóndor · ${(c.caida / (c.medio * 250) * 100).toFixed(0)}% de un año de P&L\n`);

const bs = bootstrapBloques(v.map((x) => x.pl));
console.log("── 4. LO OBSERVADO ES UNA SOLA TRAYECTORIA — 2.000 remuestreos por bloques de 5 días ──");
console.log(`  caída máxima:  mediana ${eur(-bs.caidaP50)} · p90 ${eur(-bs.caidaP90)} · p95 ${eur(-bs.caidaP95)} · p99 ${eur(-bs.caidaP99)}`);
console.log(`  racha:         mediana ${bs.rachaP50} · p95 ${bs.rachaP95} · p99 ${bs.rachaP99} días seguidos perdiendo`);
console.log(`  año simulado:  p05 ${eur(bs.anioP05)} · mediana ${eur(bs.anioP50)} · p95 ${eur(bs.anioP95)}`);
console.log(`  años perdedores en la simulación ... ${(bs.anioNegativos * 100).toFixed(1)}%`);
console.log(`  ⚠ La caída MEDIANA simulada (${eur(-bs.caidaP50)}) es PEOR que la observada (${eur(-c.caida)}): la trayectoria`);
console.log(`    real fue de las afortunadas. Y el bootstrap sólo REORDENA los días que hubo — no puede`);
console.log(`    inventar un crash que no está en la muestra.\n`);

console.log("── 5. ¿DE DÓNDE SALE EL '>400% SOBRE EL RIESGO'? ──");
console.log(`  ${eur(c.medio)}/día × 250 sesiones = ${eur(c.medio * 250)}/año. Dividido por el riesgo de UN cóndor`);
console.log(`  (${eur(c.riesgoMedio)}) da ${(c.medio * 250 / c.riesgoMedio * 100).toFixed(0)}%. Ese número NO existe: mezcla un flujo anual con un riesgo de 5 horas.`);
console.log(`  El riesgo se recicla 250 veces al año, así que el denominador correcto es el capital que`);
console.log(`  hay que tener PARADO todo el año para no quebrar en la peor racha. Con la caída p95 del`);
console.log(`  bootstrap (${eur(bs.caidaP95)}) y un colchón que la aguante al 100%, el rendimiento real por contrato es`);
console.log(`  ${eur(c.medio * 250)} ÷ ${eur(bs.caidaP95)} = ${(c.medio * 250 / bs.caidaP95 * 100).toFixed(0)}%/año — y ese ${(c.medio * 250 / bs.caidaP95 * 100).toFixed(0)}% arrastra el mismo intervalo que la sección 1:`);
console.log(`  va de ${((c.medio - 1.96 * c.de / Math.sqrt(c.n)) * 250 / bs.caidaP95 * 100).toFixed(0)}% a ${((c.medio + 1.96 * c.de / Math.sqrt(c.n)) * 250 / bs.caidaP95 * 100).toFixed(0)}%. El 431% no es que esté exagerado: es que está mal calculado.\n`);

console.log("── 6. TAMAÑO EN LA CUENTA REAL ──");
console.log(`  Cuenta ${eur(CUENTA)} · 85% (≈${eur(CUENTA * 0.85)}) en 500 acciones de HOOD · efectivo libre ≈${eur(EFECTIVO)}`);
console.log(`  Colateral por cóndor: ${eur(ALA * 100)} si el bróker lo neta, ${eur(ALA * 200)} si retiene las DOS verticales.`);
console.log(`  ⚠ En Robinhood el cóndor NO entra como una sola orden: son dos verticales. Si retiene las dos`);
console.log(`    por separado, el colateral es el doble. ESO ESTÁ SIN VERIFICAR y cambia el tamaño a la mitad.\n`);
console.log("  N   colateral(neto)  colateral(2 vert.)   peor día   peor racha   caída obs.   caída p95   $/año     caída p95 sobre la cuenta");
for (const N of [1, 2, 3, 4, 5, 8, 11]) {
  const col1 = N * ALA * 100, col2 = N * ALA * 200;
  const marca = (x, tope) => (x > tope ? "✗" : " ");
  console.log(`  ${String(N).padStart(2)}   ${eur(col1).padStart(9)}${marca(col1, CUENTA)}      ${eur(col2).padStart(9)}${marca(col2, CUENTA)}     ` +
              `${eur(N * peor.pl).padStart(8)}   ${eur(N * c.dineroRachaMax).padStart(9)}   ${eur(-N * c.caida).padStart(9)}   ${eur(-N * bs.caidaP95).padStart(9)}   ` +
              `${eur(N * c.medio * 250).padStart(8)}   ${(N * bs.caidaP95 / CUENTA * 100).toFixed(0).padStart(5)}%`);
}
console.log(`\n  ✗ = no cabe en la cuenta entera. Todos los contratos son del MISMO subyacente el MISMO día:`);
console.log(`  la correlación es 1, no hay diversificación, multiplicar contratos multiplica la pérdida exacta.\n`);
console.log("  LO QUE CABE DE VERDAD — y la respuesta es incómoda:");
console.log(`  El colateral deja meter ${Math.floor(CUENTA / (ALA * 100))} cóndores con la cuenta entera (${Math.floor(EFECTIVO / (ALA * 100))} sólo con el efectivo libre).`);
console.log(`  Pero la COLA manda antes que el colateral. Con UN SOLO contrato la caída p95 del bootstrap es`);
console.log(`  ${eur(bs.caidaP95)} = ${(bs.caidaP95 / CUENTA * 100).toFixed(0)}% de la cuenta, y la caída p99 es ${eur(bs.caidaP99)} = ${(bs.caidaP99 / CUENTA * 100).toFixed(0)}%.`);
console.log("");
console.log("  tolerancia de caída   cuánto es    contratos que la respetan   cuenta necesaria para 1 contrato");
for (const tol of [0.15, 0.25, 0.50]) {
  const nCaida = Math.floor(CUENTA * tol / bs.caidaP95);
  console.log(`  ${(tol * 100).toFixed(0).padStart(17)}%   ${eur(CUENTA * tol).padStart(9)}    ${String(nCaida).padStart(23)}   ${eur(bs.caidaP95 / tol).padStart(31)}`);
}
console.log(`\n  NINGUNA tolerancia razonable deja ni un contrato: para llevar UNO respetando un tope de caída`);
console.log(`  del 25% harían falta ${eur(bs.caidaP95 / 0.25)} de cuenta, casi tres veces lo que hay.`);
console.log(`  Si aun así opera 1 contrato: ${eur(c.medio * 250)}/año = ${(c.medio * 250 / CUENTA * 100).toFixed(1)}% de la cuenta, con un ${(bs.caidaP95 / CUENTA * 100).toFixed(0)}% de caída p95.`);
console.log(`  Y ese ${(c.medio * 250 / CUENTA * 100).toFixed(1)}% no es fiable: el intervalo del 95% de la sección 1 lo lleva de ${((c.medio - 1.96 * c.de / Math.sqrt(c.n)) * 250 / CUENTA * 100).toFixed(1)}% a ${((c.medio + 1.96 * c.de / Math.sqrt(c.n)) * 250 / CUENTA * 100).toFixed(1)}%.\n`);

console.log("── 7. LAS DOS SEMANAS MALAS QUE SÍ HAY, Y EL HUECO DEL 5% ──");
const spotMedio = med(v.map((x) => x.spot));
for (const [nombre, ini, fin] of [["arancel abril 2025", "2025-04-01", "2025-04-16"], ["carry trade agosto 2024", "2024-08-01", "2024-08-09"], ["marzo 2025", "2025-03-03", "2025-03-14"]]) {
  const g = v.filter((x) => x.fecha >= ini && x.fecha <= fin);
  if (!g.length) continue;
  const s = suma(g.map((x) => x.pl));
  console.log(`  ${nombre.padEnd(24)} ${g.length} sesiones · ${eur(s)} · ${g.filter((x) => x.pl <= 0).length} perdedoras · máx.pérdidas ${g.filter((x) => x.maxPerdida).length}`);
}
console.log(`  → La premisa "2024-2026 no tiene ningún crash" no es del todo cierta: abril de 2025 fue`);
console.log(`    una caída del ~12% de SPX en pocas sesiones y ESTÁ dentro. Lo que NO hay es un 2008 ni`);
console.log(`    un marzo de 2020 ni un 5 de febrero de 2018.\n`);
console.log(`  UN HUECO DEL 5%: son ${Math.round(spotMedio * 0.05)} puntos sobre ${Math.round(spotMedio)}. La corta está a ${DIST} y la larga a ${DIST + ALA}.`);
console.log(`  · Cualquier movimiento de más de ${DIST + ALA} puntos ya es PÉRDIDA MÁXIMA. El 5% multiplica la distancia`);
console.log(`    por ${(spotMedio * 0.05 / (DIST + ALA)).toFixed(1)} pero NO el dinero: el cóndor es de riesgo definido y topa en ${eur(c.riesgoMedio)}.`);
console.log(`  · El hueco NOCTURNO no le toca: se entra a las ${HORA} y se liquida el mismo día, sin posición al abrir.`);
console.log(`  · SPXW es EUROPEA y liquida en efectivo: no hay asignación anticipada ni acciones sorpresa.`);
console.log(`  · Lo que sí le toca: el movimiento INTRADÍA tras las ${HORA}. Máximo observado ${Math.max(...movs).toFixed(2)}%;`);
console.log(`    ${v.filter((x) => Math.abs(x.movPct) > 1.2).length} sesiones por encima del ±1,2%.`);
const maxSeguidos = (() => { let m = 0, k = 0; for (const x of v) { if (x.maxPerdida) { k++; if (k > m) m = k; } else k = 0; } return m; })();
console.log(`  · El escenario de ruina no es UN día, es una SEMANA de tendencia. Máximas seguidas observadas: ${maxSeguidos}.`);
console.log(`    Cinco seguidas costarían N × ${eur(-5 * c.riesgoMedio)} — con N=3 son ${eur(-15 * c.riesgoMedio)}, el ${(15 * c.riesgoMedio / CUENTA * 100).toFixed(0)}% de la cuenta.`);
console.log(`  · LO QUE NO ESTÁ MEDIDO y en un crash decide: si a las ${HORA} de un día de pánico habrá horquilla`);
console.log(`    para entrar a esos precios. Estos bid/ask son de sesiones normales.`);
const porMes = {};
for (const d of v.filter((x) => x.maxPerdida)) porMes[d.fecha.slice(0, 7)] = (porMes[d.fecha.slice(0, 7)] ?? 0) + 1;
console.log(`  · Meses con más pérdidas máximas: ${Object.entries(porMes).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([m, n]) => `${m}(${n})`).join(" · ")}\n`);

console.log("── 8. CRIBA DE TERCIOS (¿vive el resultado en un solo período?) ──");
const t3 = tercios(v);
for (const x of t3) console.log(`  ${x.periodo}  n=${String(x.n).padStart(3)}  ${eur(x.medio).padStart(7)}/día  t=${x.t.toFixed(2).padStart(5)}`);
const signos = t3.map((x) => Math.sign(x.medio));
console.log(`  ${signos.every((s) => s === signos[0]) ? "✓ mismo signo en los tres tercios" : "✗ el signo NO se repite en los tres tercios"}` +
            ` · ${Math.abs(c.t) >= LISTON_T ? `✓ t=${c.t.toFixed(2)} ≥ ${LISTON_T}` : `✗ t=${c.t.toFixed(2)} < ${LISTON_T}`}` +
            ` · ✗ concentración: SPXW es el 100% de la muestra (un solo subyacente, por construcción)\n`);

console.log("── 9. CONTRASTE — la cola de otras especificaciones (se reportan TODAS) ──");
console.log("  espec.           n   P&L/día     t    acierto   peor día   racha   caída máx   riesgo/cóndor   $año/caída");
const variantes = [
  { n: "±15 / ala 50", d: 15, a: 50 }, { n: "±20 / ala 50", d: 20, a: 50 },
  { n: "±25 / ala 50", d: 25, a: 50 }, { n: "±35 / ala 50", d: 35, a: 50 },
  { n: "±25 / ala 25", d: 25, a: 25 }, { n: "±25 / ala 100", d: 25, a: 100 },
];
const tabla = [];
for (const x of variantes) {
  const s = x.d === DIST && x.a === ALA ? v : serie(fechas, x.d, x.a);
  if (s.length < 100) { console.log(`  ${x.n}: sólo ${s.length} días`); continue; }
  const q = cola(s);
  const anual = q.medio * 250;
  tabla.push({ espec: x.n, n: q.n, medio: q.medio, t: q.t, acierto: q.acierto, peor: q.peor, racha: q.rachaMax, caida: q.caida, riesgo: q.riesgoMedio, ratio: anual / q.caida });
  console.log(`  ${x.n.padEnd(14)} ${String(q.n).padStart(3)}  ${eur(q.medio).padStart(8)}  ${q.t.toFixed(2).padStart(5)}   ${(q.acierto * 100).toFixed(0).padStart(5)}%   ` +
              `${eur(q.peor).padStart(8)}   ${String(q.rachaMax).padStart(5)}   ${eur(-q.caida).padStart(9)}   ${eur(q.riesgoMedio).padStart(13)}   ${(anual / q.caida).toFixed(2).padStart(10)}`);
}
console.log(`  "$año/caída" = dólares al año por cada dólar de la peor caída. Es lo que manda para el tamaño.\n`);

console.log("── 10. ¿Y SI SE EXIGE UN CRÉDITO MÍNIMO? (observable al entrar, sin futuro) ──");
console.log("  El decil de crédito más bajo es el único con P&L medio negativo. Filtrar por crédito es una");
console.log("  decisión que se puede tomar A LAS 11:00 mirando la pantalla, sin ningún dato del futuro.");
console.log("  Se reporta la rejilla ENTERA, sin elegir umbral. Ojo: subir el umbral quita DÍAS, y el");
console.log("  dinero al año depende de operar muchos días — por eso el P&L/día sube y el P&L/año baja.");
console.log("  crédito mín.   días   % días   P&L/día     t    P&L/año   peor día   caída máx   $año/caída   3 tercios");
for (const u of [0, 200, 300, 400, 500, 700]) {
  const g = v.filter((x) => x.credito >= u);
  if (g.length < 60) { console.log(`  ≥${eur(u)}: sólo ${g.length} días`); continue; }
  const q = cola(g), t3u = tercios(g), sg = t3u.map((x) => Math.sign(x.medio));
  // El P&L/año se escala por los días en que SÍ se opera: menos días, menos operaciones.
  const anual = q.medio * 250 * (g.length / v.length);
  console.log(`  ${eur(u).padStart(11)}   ${String(q.n).padStart(4)}   ${(q.n / v.length * 100).toFixed(0).padStart(5)}%  ${eur(q.medio).padStart(8)}  ${q.t.toFixed(2).padStart(5)}   ` +
              `${eur(anual).padStart(8)}   ${eur(q.peor).padStart(8)}   ${eur(-q.caida).padStart(9)}   ${(anual / q.caida).toFixed(2).padStart(10)}   ${sg.every((s) => s === sg[0]) ? "✓ igual" : "✗ cambia"}`);
}
console.log("");

writeFileSync("scripts/opt-cola-resultado.json", JSON.stringify({
  espec: { HORA, DIST, ALA }, diag,
  principal: { ...c, diezPeores: c.diezPeores.map((d) => ({ fecha: d.fecha, pl: d.pl, movPct: d.movPct, credito: d.credito })) },
  bootstrap: bs, tercios: t3, variantes: tabla,
}, null, 2));
console.log("→ scripts/opt-cola-resultado.json\n");
