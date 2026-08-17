// EL ANCHO DE LAS ALAS DEL CÓNDOR 0DTE — el segundo parámetro arbitrario
//
// Uso: node --max-old-space-size=10240 scripts/opt-alas.mjs
//
// ═══ QUÉ SE DECIDE AQUÍ ═══════════════════════════════════════════════════════════════════
//
// La distancia ya se barrió (scripts/condor-especificacion.mjs): joroba con el máximo en ±25/35.
// El ANCHO DE LAS ALAS nunca se tocó. Son 50 puntos porque sí.
//
// El ala NO cambia el crédito mucho, pero SÍ define el riesgo máximo:  (ala − crédito) × 100.
// Un ala de 100 puntos son ~$9.500 de riesgo por contrato. Con ~$8.300 de efectivo libre
// (el 85% de la cuenta está en 500 acciones de HOOD) eso NO CABE, gane lo que gane.
// Por eso aquí no se mira sólo el P&L medio: se mira el P&L SOBRE EL CAPITAL INMOVILIZADO.
//
// ═══ CRITERIO ESCRITO ANTES DE CORRER ═════════════════════════════════════════════════════
//
//   PRUEBAS DECLARADAS: 6 (alas 10, 20, 30, 50, 75, 100 puntos). Listón de Bonferroni con 6.
//   Distancia fija en ±25 puntos, hora de entrada 11:00 ET, las dos ya fijadas fuera de aquí.
//
//   Un ala GANA a las 50 de hoy sólo si cumple LAS TRES:
//     1. P&L medio positivo en los TRES años (2024, 2025, 2026) — mismo signo en los tres tercios.
//     2. |t| por encima del listón de Bonferroni para 6 pruebas.
//     3. Mejor RENDIMIENTO SOBRE CAPITAL INMOVILIZADO que el ala de 50, no sólo mejor P&L medio.
//   Y para ser OPERABLE por Lester, además:
//     4. El colateral por contrato tiene que caber en el efectivo libre (~$8.300).
//
//   AÑADIDO DESPUÉS DE CORRER, y se dice: la DIFERENCIA PAREADA contra el ala de 50. Al ver que
//   ningún ancho pasaba el listón contra CERO, había que separar dos preguntas que no son la
//   misma — "¿gana dinero el cóndor?" (decidida en otro sitio) y "¿qué ancho es mejor?" (ésta).
//   La segunda se responde día a día sobre las mismas sesiones, que cancela la varianza común y
//   es mucho más potente. No es peeking a favor: ENDURECE la conclusión, porque con la prueba
//   potente tampoco gana ninguno. Si hubiera salido a favor de algún ancho, habría que repetirlo
//   fuera de muestra antes de creérselo.
//
// ═══ LAS TRAMPAS QUE SE VIGILAN AQUÍ ══════════════════════════════════════════════════════
//
//   · UNIVERSO PAREADO. Los 6 anchos se miden sobre EXACTAMENTE LOS MISMOS DÍAS. Si un ancho
//     se midiera sobre días distintos que otro, la comparación no diría nada del ancho.
//   · ALA EXACTA O NADA. `cerca()` devuelve el strike más próximo: si el de +100 no existiera,
//     devolvería el de +75 y estaríamos midiendo un ala de 75 llamándola de 100. Aquí se exige
//     el strike EXACTO en las dos patas largas; el día que falte se cae del universo pareado.
//   · LA HORQUILLA (trampa nº4). El ala ancha compra una pata mucho más lejos y por tanto mucho
//     más barata, donde la horquilla es un porcentaje ENORME de la prima. Se mide TODO dos veces:
//     con ejecución real (cobrar bid / pagar ask) y punto-medio-a-punto-medio. La diferencia
//     entre las dos ES el peaje de liquidez que cobra cada ancho.
//   · EL PEOR DÍA. El ala es el knob del riesgo de cola. Se reporta peor día, percentil 1 y 5,
//     cuántas veces se comió la pérdida máxima y la peor racha acumulada.
//
// ⚠️ NO se toca ningún modelo de precios. Se cobra el BID de lo que se vende y se paga el ASK de
//    lo que se compra, con las cotizaciones reales de SPXW a las 11:00. Liquidación contra el
//    precio real del subyacente al final de la sesión.

import { readFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = process.env.HORA || "11:00";
const DIST = Number(process.env.DIST || 25);         // distancia de las patas cortas, en puntos
const ALAS = [10, 20, 30, 50, 75, 100];              // las 6 pruebas declaradas
const COMM = 0.03;                                    // por contrato, Robinhood
const PATAS = 8;                                      // 4 al abrir + 4 al cerrar/expirar
const EFECTIVO_LIBRE = 8313;                          // $55.419 − 85% en 500 acciones de HOOD

// ───────────────────────────────────────────────────────────────────────────────────────────
// LECTURA
// ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Lee la cadena 0DTE de un día. Devuelve las filas de la hora de entrada (con bid, ask y punto
 * medio) y el último precio real del subyacente de la sesión, que es contra el que se liquida.
 */
function leerDia(fecha, right) {
  let txt;
  try {
    txt = readFileSync(`${DIR}/iv_${fecha}_${right}.csv`, "utf8");
  } catch {
    return null;
  }
  const lin = txt.trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const col = (n) => {
    const i = cab.indexOf(n);
    // Un campo que no existe se lee como 0 y se mide cero durante 45 minutos. Que LANCE.
    if (i < 0) throw new Error(`columna "${n}" ausente en iv_${fecha}_${right}.csv`);
    return i;
  };
  const iK = col("strike"), iT = col("timestamp"), iB = col("bid"), iA = col("ask"),
        iM = col("midpoint"), iV = col("implied_vol"), iU = col("underlying_price");

  const enHora = new Map();      // strike → cotización a la hora de entrada
  const spotsEntrada = [];
  let ultimoSpot = 0, horaCierre = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const hora = String(c[iT]).slice(11, 16);
    const spot = Number(c[iU]);
    if (spot > 0 && hora >= horaCierre) { horaCierre = hora; ultimoSpot = spot; }
    if (hora !== HORA) continue;
    if (spot > 0) spotsEntrada.push(spot);
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]), mid = Number(c[iM]);
    // ask > 0 es "hay mercado". Sin mercado no se puede comprar la pata larga: el día no vale.
    if (K > 0 && bid >= 0 && ask > 0) enHora.set(K, { K, bid, ask, mid, iv: Number(c[iV]) });
  }
  if (!enHora.size || !spotsEntrada.length || !(ultimoSpot > 0)) return null;
  spotsEntrada.sort((a, b) => a - b);
  return { q: enHora, spot: spotsEntrada[spotsEntrada.length >> 1], cierre: ultimoSpot, horaCierre };
}

// ── GEX de las 11:00, para poder mirar además el subconjunto que SÍ se opera en vivo ───────
// Black-Scholes SÓLO en la dirección legítima: IV real del mercado → gamma. Nunca un precio.
const phi = (x) => 0.3989423 * Math.exp((-x * x) / 2);
const gammaBS = (S, K, T, v) => phi((Math.log(S / K) + ((v * v) / 2) * T) / (v * Math.sqrt(T))) / (S * v * Math.sqrt(T));

/** Open interest sellado a las 06:30. AUSENTE = CERO: el cero no aporta gamma. */
function leerOI(fecha) {
  const f = `${DIR}/oi_${fecha}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 20) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iR = cab.indexOf("right"), iO = cab.indexOf("open_interest");
  if (iK < 0 || iR < 0 || iO < 0) throw new Error(`${f}: faltan columnas de OI`);
  const oi = { C: new Map(), P: new Map() };
  let vivos = 0;
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const k = +c[iK], v = +c[iO];
    if (!(k > 0) || !(v > 0)) continue;
    oi[c[iR].replace(/"/g, "").trim() === "CALL" ? "C" : "P"].set(k, v);
    vivos++;
  }
  return vivos >= 20 ? oi : null;
}

/** GEX neto en millones de $ por movimiento del 1%, convención +call / −put. */
function gexDelDia(fecha, C, P, spot) {
  const oi = leerOI(fecha);
  if (!oi) return null;
  const T = Math.max((16 * 60 - (+HORA.slice(0, 2) * 60 + +HORA.slice(3))) / 60 / 24 / 365, 1 / 24 / 365);
  let gC = 0, gP = 0;
  for (const [lado, cad] of [["C", C], ["P", P]]) {
    for (const [K, q] of cad.q) {
      const o = oi[lado].get(K);
      if (!o || !(q.iv > 0.01) || q.iv > 4) continue;   // fuera de ese rango es basura del feed
      const g = gammaBS(spot, K, T, q.iv);
      if (!isFinite(g) || g <= 0) continue;
      const $ = g * o * 100 * spot * spot * 0.01;
      if (!isFinite($)) continue;
      if (lado === "C") gC += $; else gP += $;
    }
  }
  return gC > 0 && gP > 0 ? (gC - gP) / 1e6 : null;
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// CONSTRUCCIÓN DEL UNIVERSO PAREADO
// ───────────────────────────────────────────────────────────────────────────────────────────

const fechas = [...new Set(readdirSync(DIR)
  .map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

console.log(`\n## ANCHO DE LAS ALAS · SPXW 0DTE · entrada ${HORA} ET · patas cortas a ±${DIST} puntos`);
console.log(`## ${fechas.length} sesiones en disco (${fechas[0]} → ${fechas[fechas.length - 1]}) · 6 pruebas declaradas\n`);

const bruto = [];                 // un registro por día con las 6 alas resueltas (PAREADO)
const todos = [];                 // todos los días con patas cortas, aunque falte algún ala
const descarte = { sinFichero: 0, sinStrikeCorto: 0, sinAlaExacta: {}, creditoNoPositivo: {} };
for (const a of ALAS) { descarte.sinAlaExacta[a] = 0; descarte.creditoNoPositivo[a] = 0; }
const horasCierre = {};

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) { descarte.sinFichero++; continue; }
  horasCierre[C.horaCierre] = (horasCierre[C.horaCierre] || 0) + 1;

  const spot = C.spot;
  // Rejilla de 5 puntos cerca del dinero: la pata corta cae en un strike que existe de verdad.
  const kCall = Math.round((spot + DIST) / 5) * 5;
  const kPut = Math.round((spot - DIST) / 5) * 5;
  const cCorta = C.q.get(kCall), pCorta = P.q.get(kPut);
  if (!cCorta || !pCorta) { descarte.sinStrikeCorto++; continue; }

  const S = C.cierre;
  const fila = { fecha, spot, cierre: S, kCall, kPut, gex: gexDelDia(fecha, C, P, spot), alas: {} };
  let completo = true;

  for (const ala of ALAS) {
    // ALA EXACTA O NADA: nada de "el strike más cercano".
    const cLarga = C.q.get(kCall + ala), pLarga = P.q.get(kPut - ala);
    if (!cLarga || !pLarga) { descarte.sinAlaExacta[ala]++; completo = false; continue; }

    // Ejecución REAL: se cobra el bid de las cortas, se paga el ask de las largas.
    const credito = cCorta.bid + pCorta.bid - cLarga.ask - pLarga.ask;
    // Punto medio a punto medio: el mismo cóndor sin pagar la horquilla. La diferencia es el peaje.
    const creditoMid = cCorta.mid + pCorta.mid - cLarga.mid - pLarga.mid;
    if (!(credito > 0)) { descarte.creditoNoPositivo[ala]++; completo = false; continue; }

    // Liquidación contra el precio real del subyacente al cierre. Cada vertical por separado.
    const perdCall = Math.min(Math.max(S - kCall, 0), ala);
    const perdPut = Math.min(Math.max(kPut - S, 0), ala);
    const perdida = perdCall + perdPut;             // sólo una de las dos puede ser > 0
    const comision = PATAS * COMM;

    fila.alas[ala] = {
      credito: credito * 100,
      creditoMid: creditoMid * 100,
      pl: (credito - perdida) * 100 - comision,
      plMid: (creditoMid - perdida) * 100 - comision,
      // RIESGO MÁXIMO del cóndor: sólo un lado puede perder.
      riesgo: (ala - credito) * 100,
      // COLATERAL REAL en Robinhood: no admite el cóndor como una orden, van DOS verticales,
      // y cada vertical retiene su propio (ancho − su crédito). Por eso se inmoviliza el doble.
      colateral: (2 * ala - credito) * 100,
      maxPerdida: perdida >= ala - 1e-9,
      perdida: perdida * 100,
    };
  }
  fila.completo = completo;
  todos.push(fila);
  if (completo) bruto.push(fila);
}

console.log(`── universo ────────────────────────────────────────────────────────────────────────`);
console.log(`  días con las 6 alas resueltas (universo PAREADO):  ${bruto.length} de ${fechas.length}`);
console.log(`  descartados · sin fichero/cotización: ${descarte.sinFichero} · sin strike corto: ${descarte.sinStrikeCorto}`);
console.log(`  descartados · sin ala exacta: ${ALAS.map((a) => `${a}p:${descarte.sinAlaExacta[a]}`).join(" ")}`);
console.log(`  descartados · crédito ≤ 0:    ${ALAS.map((a) => `${a}p:${descarte.creditoNoPositivo[a]}`).join(" ")}`);
const hc = Object.entries(horasCierre).sort((a, b) => b[1] - a[1]).slice(0, 3);
console.log(`  hora del último precio del subyacente (liquidación): ${hc.map(([h, n]) => `${h} ×${n}`).join(" · ")}`);

if (bruto.length < 200) {
  console.log(`\n⛔ El universo pareado tiene ${bruto.length} días. Insuficiente. Se para aquí.`);
  process.exit(1);
}

// RADIOGRAFÍA — que ningún campo esté muerto antes de medir con él.
for (const ala of ALAS) {
  const cr = bruto.map((f) => f.alas[ala].credito);
  const pl = bruto.map((f) => f.alas[ala].pl);
  const ceros = cr.filter((x) => x === 0).length;
  const dist = new Set(pl.map((x) => Math.round(x))).size;
  if (ceros > cr.length * 0.05) throw new Error(`ala ${ala}: ${ceros}/${cr.length} créditos a cero`);
  if (dist < 20) throw new Error(`ala ${ala}: sólo ${dist} P&L distintos, campo sin variación`);
}
console.log(`  radiografía: los 6 anchos tienen crédito y P&L vivos y con variación ✓`);

// ───────────────────────────────────────────────────────────────────────────────────────────
// ESTADÍSTICA
// ───────────────────────────────────────────────────────────────────────────────────────────

const med = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const pct = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mediana = (v) => pct(v, 0.5);
const desv = (v) => { const m = med(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); };
const tUna = (v) => med(v) / (desv(v) / Math.sqrt(v.length));       // t de una muestra contra cero
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.round(Math.abs(x)).toLocaleString("es-ES");
/** Listón de Bonferroni: dos colas al 5% repartido entre las pruebas declaradas. */
const listonT = (pruebas) => {
  const p = 0.05 / pruebas / 2;
  // inversa de la normal (Acklam), suficiente con n>600
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let x;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  else { const q = p - 0.5, r = q * q; x = (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
  return Math.abs(x);
};
const LISTON = listonT(ALAS.length);

const años = [...new Set(bruto.map((f) => f.fecha.slice(0, 4)))].sort();
const SESIONES_AÑO = 252;                   // se abre el cóndor todos los días hábiles
const N_AÑOS = bruto.length / SESIONES_AÑO; // sesiones del universo → años de calendario

const R = new Map();
for (const ala of ALAS) {
  const v = bruto.map((f) => f.alas[ala]);
  const pl = v.map((x) => x.pl), plMid = v.map((x) => x.plMid);
  const riesgo = med(v.map((x) => x.riesgo)), colateral = med(v.map((x) => x.colateral));
  // Peor racha acumulada, en dólares, operando 1 contrato todos los días.
  let acc = 0, pico = 0, peorRacha = 0;
  for (const x of pl) { acc += x; pico = Math.max(pico, acc); peorRacha = Math.min(peorRacha, acc - pico); }
  R.set(ala, {
    n: v.length, credito: mediana(v.map((x) => x.credito)), creditoMid: mediana(v.map((x) => x.creditoMid)),
    riesgo, colateral, plMedio: med(pl), plMid: med(plMid), t: tUna(pl),
    acierto: v.filter((x) => x.pl > 0).length / v.length,
    sobreRiesgo: med(v.map((x) => x.pl / x.riesgo)) * 100,
    sobreColateral: med(v.map((x) => x.pl / x.colateral)) * 100,
    peor: Math.min(...pl), p1: pct(pl, 0.01), p5: pct(pl, 0.05), peorRacha,
    maxPerd: v.filter((x) => x.maxPerdida).length / v.length,
    porAño: Object.fromEntries(años.map((a) => {
      const g = bruto.filter((f) => f.fecha.startsWith(a)).map((f) => f.alas[ala].pl);
      return [a, { n: g.length, m: med(g), peor: Math.min(...g) }];
    })),
    pl, acc,
  });
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// SALIDA
// ───────────────────────────────────────────────────────────────────────────────────────────

console.log(`\n── LA TABLA (n=${bruto.length} días, los MISMOS para los 6 anchos) ─────────────────────`);
console.log(`  ala   crédito   acierto   P&L medio    riesgo máx   colateral 2v   P&L/riesgo   P&L/colat`);
for (const ala of ALAS) {
  const r = R.get(ala);
  console.log(`${String(ala + "p").padStart(5)}   ${eur(r.credito).padStart(7)}    ${(r.acierto * 100).toFixed(0).padStart(3)}%   ` +
    `${eur(r.plMedio).padStart(9)}   ${eur(r.riesgo).padStart(10)}   ${eur(r.colateral).padStart(12)}   ` +
    `${r.sobreRiesgo.toFixed(2).padStart(9)}%   ${r.sobreColateral.toFixed(2).padStart(8)}%`);
}

// ── EL NIVEL vs LA COMPARACIÓN ───────────────────────────────────────────────────────────
// El universo pareado tira los días a los que les falta ALGÚN ala (sobre todo la de 100 puntos,
// que es la que más strikes lejanos necesita). Esos días NO son aleatorios: son días QUIETOS,
// y un día quieto es un día ganador para un cóndor. Por tanto el universo pareado subestima el
// NIVEL absoluto de las 6 por igual. Para COMPARAR anchos hay que usar el pareado; para dar el
// $/año hay que usar todos los días de cada ancho. Se dan los dos y se enseña la diferencia.
console.log(`\n── EL NIVEL (cada ancho con TODOS sus días) vs LA COMPARACIÓN (pareado) ────────────`);
console.log(`  ala    n propio   P&L medio propio      n pareado   P&L medio pareado   sesgo del pareado`);
const propio = new Map();
for (const ala of ALAS) {
  const v = todos.filter((f) => f.alas[ala]).map((f) => f.alas[ala]);
  propio.set(ala, v);
  const r = R.get(ala);
  console.log(`${String(ala + "p").padStart(5)}   ${String(v.length).padStart(8)}   ${eur(med(v.map((x) => x.pl))).padStart(16)}   ` +
    `${String(r.n).padStart(12)}   ${eur(r.plMedio).padStart(17)}   ${eur(r.plMedio - med(v.map((x) => x.pl))).padStart(17)}`);
}
const fuera = todos.filter((f) => !f.completo && f.alas[50]);
if (fuera.length) {
  console.log(`  los ${fuera.length} días que el pareado tira valían $${Math.round(med(fuera.map((f) => f.alas[50].pl)))} de media con el ala de 50 ` +
    `(contra $${Math.round(R.get(50).plMedio)} dentro): son días quietos, y quieto = ganador.`);
}

console.log(`\n── EN DÓLARES AL AÑO, 1 CONTRATO (${SESIONES_AÑO} sesiones/año) ────────────────────────────`);
console.log(`  Con los días propios de cada ancho, y CON BARRA DE ERROR: el intervalo importa más`);
console.log(`  que el punto, porque ninguno de los 6 se separa de cero con seguridad.`);
console.log(`  ala      $/año   intervalo al 95%          capital inmovilizado por contrato`);
const alAño = new Map();
for (const ala of ALAS) {
  const v = propio.get(ala).map((x) => x.pl);
  const opsAño = SESIONES_AÑO;              // se opera todos los días hábiles de mercado
  const anual = med(v) * opsAño;
  const err = (desv(v) / Math.sqrt(v.length)) * 1.96 * opsAño;
  alAño.set(ala, anual);
  const r = R.get(ala);
  console.log(`${String(ala + "p").padStart(5)}   ${eur(anual).padStart(8)}   ${(eur(anual - err) + " a " + eur(anual + err)).padStart(18)}   ` +
    `${eur(r.colateral)} (dos verticales) · ${eur(r.riesgo)} (neteado)`);
}

console.log(`\n── ¿CABE EN SU CUENTA? (efectivo libre ≈ ${eur(EFECTIVO_LIBRE)}; el 85% está en 500 HOOD) ──`);
console.log(`  El colateral real depende de una pregunta ABIERTA: Robinhood no admite el cóndor como`);
console.log(`  una sola orden, van dos verticales. Si retiene cada una por separado, se inmoviliza el`);
console.log(`  doble. Se dan los dos escenarios porque cambian la respuesta.`);
console.log(`\n          ── DOS VERTICALES (conservador) ──      ── NETEADO (optimista) ──`);
console.log(`  ala   contratos    $/año     peor día      contratos    $/año     peor día`);
for (const ala of ALAS) {
  const r = R.get(ala);
  const anual = alAño.get(ala);
  const linea = (cap) => {
    const n = Math.floor(EFECTIVO_LIBRE / cap);
    return n < 1 ? `${"NO CABE".padStart(9)}${"—".padStart(9)}${"—".padStart(12)}`
                 : `${String(n).padStart(9)}${eur(anual * n).padStart(9)}${eur(r.peor * n).padStart(12)}`;
  };
  console.log(`${String(ala + "p").padStart(5)}   ${linea(r.colateral)}   ${linea(r.riesgo)}`);
}

console.log(`\n── ¿MISMO SIGNO EN LOS TRES AÑOS? (P&L medio por año) ──────────────────────────────`);
console.log(`  ala  ${años.map((a) => (a + " (n)").padStart(16)).join("")}   mismo signo`);
for (const ala of ALAS) {
  const r = R.get(ala);
  const signos = años.map((a) => Math.sign(r.porAño[a].m));
  console.log(`${String(ala + "p").padStart(5)}  ` +
    años.map((a) => `${eur(r.porAño[a].m)} (${r.porAño[a].n})`.padStart(16)).join("") +
    `   ${signos.every((s) => s > 0) ? "sí ✓" : "NO ✗"}`);
}

console.log(`\n── RIESGO DE COLA — el ala ES el knob del peor día ─────────────────────────────────`);
console.log(`  ala   peor día   percentil 1   percentil 5   % días a pérdida máx   peor racha acum.`);
for (const ala of ALAS) {
  const r = R.get(ala);
  console.log(`${String(ala + "p").padStart(5)}   ${eur(r.peor).padStart(8)}   ${eur(r.p1).padStart(11)}   ${eur(r.p5).padStart(11)}   ` +
    `${(r.maxPerd * 100).toFixed(1).padStart(19)}%   ${eur(r.peorRacha).padStart(16)}`);
}
console.log(`  peor día por año:`);
for (const ala of ALAS) {
  const r = R.get(ala);
  console.log(`${String(ala + "p").padStart(5)}   ${años.map((a) => eur(r.porAño[a].peor).padStart(10)).join("")}`);
}

console.log(`\n── EL PEAJE DE LA HORQUILLA (trampa nº4: ¿es ventaja o es liquidez?) ───────────────`);
console.log(`  ala   crédito real   crédito medio-a-medio   peaje   P&L real   P&L medio-a-medio   peaje`);
for (const ala of ALAS) {
  const r = R.get(ala);
  console.log(`${String(ala + "p").padStart(5)}   ${eur(r.credito).padStart(12)}   ${eur(r.creditoMid).padStart(21)}   ` +
    `${eur(r.credito - r.creditoMid).padStart(5)}   ${eur(r.plMedio).padStart(8)}   ${eur(r.plMid).padStart(17)}   ${eur(r.plMedio - r.plMid).padStart(5)}`);
}

console.log(`\n── SIGNIFICACIÓN (listón de Bonferroni con ${ALAS.length} pruebas: |t| > ${LISTON.toFixed(2)}) ───────────`);
console.log(`  ala        t     ¿pasa?     P&L medio ± error típico`);
for (const ala of ALAS) {
  const r = R.get(ala);
  const err = desv(r.pl) / Math.sqrt(r.n);
  console.log(`${String(ala + "p").padStart(5)}   ${r.t.toFixed(2).padStart(6)}   ${(Math.abs(r.t) > LISTON ? "sí ✓" : "NO ✗").padStart(7)}     ${eur(r.plMedio)} ± ${eur(err)}`);
}

// ── LA PRUEBA QUE DE VERDAD ELIGE EL ANCHO: DIFERENCIA PAREADA CONTRA LAS 50 ─────────────
// Cada ancho contra cero tiene una t pequeña porque la varianza diaria del cóndor es enorme.
// Pero la pregunta no es "¿gana dinero el cóndor?" (eso se decidió en otro sitio): es "¿qué
// ancho es mejor?". Como los 632 días son LOS MISMOS para los 6 anchos, la diferencia se mide
// día a día y casi toda esa varianza común se cancela. Es la prueba potente y es la correcta.
console.log(`\n── DIFERENCIA PAREADA CONTRA EL ALA DE 50 (misma sesión, mismo movimiento) ─────────`);
console.log(`  ala   Δ P&L medio      t pareada   ¿distinto de las 50?      Δ P&L/riesgo    t pareada`);
for (const ala of ALAS) {
  if (ala === 50) { console.log(`${"50p".padStart(5)}   ${"referencia".padStart(11)}`); continue; }
  const r = R.get(ala);
  const d = bruto.map((f) => f.alas[ala].pl - f.alas[50].pl);
  const dr = bruto.map((f) => f.alas[ala].pl / f.alas[ala].riesgo - f.alas[50].pl / f.alas[50].riesgo);
  const t = tUna(d), tr = tUna(dr);
  console.log(`${String(ala + "p").padStart(5)}   ${eur(med(d)).padStart(11)}   ${t.toFixed(2).padStart(12)}   ` +
    `${(Math.abs(t) > LISTON ? "sí, " + (med(d) > 0 ? "MEJOR" : "PEOR") : "no, cabe en el ruido").padStart(20)}   ` +
    `${(med(dr) * 100).toFixed(2).padStart(11)}%   ${tr.toFixed(2).padStart(10)}`);
}

// ── VISTA SECUNDARIA: el subconjunto que SE OPERA DE VERDAD ──────────────────────────────
// No es una prueba nueva ni un hallazgo: la estrategia en vivo sólo abre el cóndor los días de
// GEX neto positivo. La joroba del ancho podría estar en otro sitio dentro de ese subconjunto,
// y el $/año cambia porque se opera la mitad de los días. Se mira, no se optimiza.
const conGex = bruto.filter((f) => f.gex !== null);
const gexPos = conGex.filter((f) => f.gex > 0);
console.log(`\n── VISTA SECUNDARIA · sólo los días de GEX > 0 (los que la estrategia abre en vivo) ──`);
console.log(`  ${gexPos.length} de ${conGex.length} días con GEX calculable (${bruto.length - conGex.length} sin fichero de OI)`);
if (gexPos.length >= 150) {
  console.log(`  ala   acierto   P&L medio      t     $/año 1 contrato   P&L/riesgo   peor día`);
  for (const ala of ALAS) {
    const v = gexPos.map((f) => f.alas[ala]);
    const pl = v.map((x) => x.pl);
    const opsAño = gexPos.length / N_AÑOS;
    console.log(`${String(ala + "p").padStart(5)}     ${((v.filter((x) => x.pl > 0).length / v.length) * 100).toFixed(0).padStart(3)}%   ` +
      `${eur(med(pl)).padStart(9)}   ${tUna(pl).toFixed(2).padStart(5)}   ${eur(med(pl) * opsAño).padStart(15)}   ` +
      `${(med(v.map((x) => x.pl / x.riesgo)) * 100).toFixed(2).padStart(9)}%   ${eur(Math.min(...pl)).padStart(8)}`);
  }
} else {
  console.log(`  muestra insuficiente (${gexPos.length} días): no se reporta.`);
}

// ── VEREDICTO CONTRA EL CRITERIO ESCRITO ARRIBA ──────────────────────────────────────────
console.log(`\n── VEREDICTO CONTRA EL CRITERIO ESCRITO ANTES DE CORRER ────────────────────────────`);
const base = R.get(50);
for (const ala of ALAS) {
  const r = R.get(ala);
  const c1 = años.every((a) => r.porAño[a].m > 0);
  const c2 = Math.abs(r.t) > LISTON;
  const c3 = r.sobreColateral > base.sobreColateral;
  const c4 = r.colateral <= EFECTIVO_LIBRE;
  const fallos = [];
  if (!c1) fallos.push("signo cambia entre años");
  if (!c2) fallos.push("no pasa Bonferroni");
  if (ala !== 50 && !c3) fallos.push("no mejora el rendimiento sobre capital de las 50");
  if (!c4) fallos.push(`NO CABE (${eur(r.colateral)} > ${eur(EFECTIVO_LIBRE)})`);
  console.log(`${String(ala + "p").padStart(5)}   ${fallos.length === 0 ? (ala === 50 ? "referencia, cumple 1-2-4" : "GANA a las 50 ✓") : "✗ " + fallos.join(" · ")}`);
}
