// ¿MEJORA LA GESTIÓN ACTIVA DEL CÓNDOR 0DTE? — medido con precios reales cada 5 minutos
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/opt-gestion.mjs
//      (variables: HORA=11:00  ALA=50)
//
// ═══ LA PREGUNTA ══════════════════════════════════════════════════════════════════════════
//
// Hoy el cóndor se abre a las 11:00 y se AGUANTA hasta el cierre. Con las cadenas de SPXW 0DTE
// cada 5 minutos se puede probar si tocarlo antes mejora algo:
//   · recomprar cuando ya se ha ganado el 25 / 50 / 75 % del crédito
//   · cortar cuando la pérdida llega a 1x / 2x / 3x el crédito
//   · cerrar a las 15:00 / 15:30 / 15:45 pase lo que pase
//   · y las combinaciones que un operador usaría de verdad
//
// ═══ CRITERIO, ESCRITO ANTES DE CORRER ════════════════════════════════════════════════════
//
// PRUEBAS DECLARADAS: 30 (15 reglas de gestión contra "aguantar", en 2 distancias: ±25 y ±35).
// Listón de |t| por Bonferroni con 30 pruebas ≈ 3,14 (lo calcula listonT()).
//
// HONESTIDAD SOBRE EL RECUENTO: la primera pasada declaró 12 reglas. Las tres últimas —stop a 5x,
// stop a 8x y "cerrar si el precio TOCA el strike corto"— se añadieron DESPUÉS de ver que los
// stops 1x/2x/3x empeoraban de forma ordenada, para comprobar si el daño se invierte cuando el
// stop es muy ancho, y porque la regla del toque es la más usada en 0DTE y faltaba. Se añaden al
// recuento y suben el listón para TODAS, no sólo para ellas.
//
// UNIDAD = EL DÍA. Un cóndor por día, un suceso terminal por día. No hay patas contadas dos veces.
//
// SE DECLARA GANADORA una regla sólo si, CONTRA AGUANTAR:
//   1. la diferencia media por operación es positiva,
//   2. |t| pareado ≥ el listón de Bonferroni,
//   3. el signo de la diferencia se repite en los TRES tercios de tiempo,
//   4. y sigue siendo positiva con la MISMA regla medida a punto medio (si sólo gana a precios
//      reales, lo que se está midiendo es la horquilla, no la gestión).
// La criba de concentración por activo NO APLICA: sólo hay un subyacente (SPXW). Se dice y no se
// disimula — es la debilidad estructural de todo lo 0DTE de este proyecto.
//
// SE DECLARA PERDEDORA con el mismo listón al revés. Si no llega a ninguno de los dos, se reporta
// como "no se pudo ver" y se acompaña de la separación mínima detectable (potencia).
//
// ⚠️ AVISO PREVIO: este proyecto ya midió que los stops pierden en 19 de 20 configuraciones de
// otras estrategias. Eso NO condiciona nada aquí: se mide y se reporta lo que salga.
//
// ═══ PRECIOS ══════════════════════════════════════════════════════════════════════════════
//
// ENTRADA:  se cobra el BID de las dos cortas y se paga el ASK de las dos largas.
// CIERRE:   se paga el ASK de las dos cortas (recomprar) y se cobra el BID de las dos largas.
//           Es decir: gestionar activamente paga la horquilla DOS VECES. Aguantar la paga una.
// LIQUIDACIÓN (si no se cerró): intrínseco contra el precio real del subyacente al cierre.
// Ningún modelo. Ningún Black-Scholes. Nunca.
//
// ═══ LO QUE ESTA MEDICIÓN NO PUEDE VER ════════════════════════════════════════════════════
//
// · Se mira cada 5 minutos, no tick a tick. Una orden límite GTC real podría dispararse ANTES y
//   a mejor precio en el take-profit; un stop real podría dispararse antes y a PEOR precio. La
//   foto de 5 minutos es conservadora para el take-profit y conservadora para el stop.
// · Se supone que se llena a bid/ask NBBO. Con 4 patas y una orden combinada real se suele llenar
//   mejor que eso; el resultado de aquí es el suelo, no el techo.
// · Un solo subyacente y 2,6 años. No hay 2008 ni 2020 dentro.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = process.env.HORA || "11:00";
const ALA = Number(process.env.ALA || 50);
const COMM = 0.03;                 // por contrato, Robinhood
const PATAS_ENTRADA = 4, PATAS_SALIDA = 4;
const PRUEBAS_DECLARADAS = 30;
const LISTON = listonT(PRUEBAS_DECLARADAS);
const DISTANCIAS = [25, 35];
const ULTIMO_VIGILADO = "15:55";   // después de esto ya no se toca: se liquida

// ─────────────────────────────────────────────────────────────────────────────────────────
// LECTURA
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Lee un día entero de una cadena 0DTE.
 * Devuelve { horas:[...], porStrike: Map(K -> Map(hora -> {bid,ask,iv})), spot: Map(hora->px) }.
 * NO filtra bid<=0: en esta caché el bid 0 SÍ está guardado (comprobado: 3.534 de 13.114 filas
 * del 2024-01-02 tienen bid 0). Un bid 0 es un precio, no un hueco.
 */
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid");
  const iA = cab.indexOf("ask"), iV = cab.indexOf("implied_vol"), iU = cab.indexOf("underlying_price");
  // Un campo que no existe se lee como 0 y se mide cero durante 45 minutos. Aquí se lanza.
  if ([iK, iT, iB, iA, iV, iU].some((x) => x < 0)) throw new Error(`${f}: falta alguna columna (${cab.join("|")})`);

  const porStrike = new Map();
  const spot = new Map();
  const horas = new Set();
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16);
    const K = +c[iK], bid = +c[iB], ask = +c[iA], iv = +c[iV], px = +c[iU];
    if (!(K > 0) || !(ask > 0) || !(bid >= 0)) continue;
    horas.add(h);
    if (px > 0 && !spot.has(h)) spot.set(h, px);
    let m = porStrike.get(K);
    if (!m) { m = new Map(); porStrike.set(K, m); }
    m.set(h, { bid, ask, iv, mid: (bid + ask) / 2 });
  }
  return { porStrike, spot, horas: [...horas].sort() };
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// LAS REGLAS DE GESTIÓN
// ─────────────────────────────────────────────────────────────────────────────────────────
//
// Cada una recibe el crédito de entrada (por acción), el coste de recomprar AHORA y el contexto
// del minuto (hora, precio del subyacente, strikes cortos). Devuelve si se cierra.
const REGLAS = [
  { id: "aguantar",  nombre: "AGUANTAR al cierre (la de hoy)", base: true, trig: () => false },
  { id: "tp25",      nombre: "recomprar al 25% del crédito",   trig: (cr, co) => co <= cr * 0.75 },
  { id: "tp50",      nombre: "recomprar al 50% del crédito",   trig: (cr, co) => co <= cr * 0.50 },
  { id: "tp75",      nombre: "recomprar al 75% del crédito",   trig: (cr, co) => co <= cr * 0.25 },
  { id: "sl1",       nombre: "stop a 1x el crédito",           trig: (cr, co) => co >= cr * 2 },
  { id: "sl2",       nombre: "stop a 2x el crédito",           trig: (cr, co) => co >= cr * 3 },
  { id: "sl3",       nombre: "stop a 3x el crédito",           trig: (cr, co) => co >= cr * 4 },
  { id: "sl5",       nombre: "stop a 5x el crédito",           trig: (cr, co) => co >= cr * 6 },
  { id: "sl8",       nombre: "stop a 8x el crédito",           trig: (cr, co) => co >= cr * 9 },
  // La más usada en 0DTE y la que faltaba: salir en cuanto el índice toca el strike corto.
  { id: "toque",     nombre: "cerrar si TOCA el strike corto", trig: (cr, co, x) => x.spot >= x.kcC || x.spot <= x.kpC },
  { id: "t1500",     nombre: "cerrar a las 15:00",             trig: (cr, co, x) => x.h >= "15:00" },
  { id: "t1530",     nombre: "cerrar a las 15:30",             trig: (cr, co, x) => x.h >= "15:30" },
  { id: "t1545",     nombre: "cerrar a las 15:45",             trig: (cr, co, x) => x.h >= "15:45" },
  { id: "tp50sl2",   nombre: "50% de beneficio ó stop 2x",     trig: (cr, co) => co <= cr * 0.5 || co >= cr * 3 },
  { id: "tp50t1530", nombre: "50% de beneficio ó 15:30",       trig: (cr, co, x) => co <= cr * 0.5 || x.h >= "15:30" },
  { id: "todo",      nombre: "50% ó stop 2x ó 15:30",          trig: (cr, co, x) => co <= cr * 0.5 || co >= cr * 3 || x.h >= "15:30" },
];

// ─────────────────────────────────────────────────────────────────────────────────────────
// SIMULACIÓN
// ─────────────────────────────────────────────────────────────────────────────────────────

const fechas = [...new Set(readdirSync(DIR)
  .map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

console.log(`\n╔═══ GESTIÓN ACTIVA DEL CÓNDOR SPXW 0DTE ═══════════════════════════════════════════════╗`);
console.log(`   ${fechas.length} días · entrada ${HORA} ET · alas ${ALA} puntos · vigilancia cada 5 min hasta ${ULTIMO_VIGILADO}`);
console.log(`   precios REALES: se paga el ask, se cobra el bid, en la entrada Y en la salida`);
console.log(`   ${PRUEBAS_DECLARADAS} pruebas declaradas → listón de |t| = ${LISTON}\n`);

const cerca = (ks, obj) => ks.reduce((a, b) => (Math.abs(b - obj) < Math.abs(a - obj) ? b : a));

/** Resultados: resultados[dist][reglaId] = [{fecha, pl, plMid, hora, motivo, ...}] */
const resultados = new Map();
for (const d of DISTANCIAS) resultados.set(d, new Map(REGLAS.map((r) => [r.id, []])));
const diagnostico = [];   // para la radiografía
let saltados = { sinFichero: 0, sinHoraEntrada: 0, sinStrikes: 0, creditoNoPositivo: 0, mediasJornadas: 0 };

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) { saltados.sinFichero++; continue; }
  if (!C.horas.includes(HORA)) { saltados.sinHoraEntrada++; continue; }
  const spot = C.spot.get(HORA);
  if (!(spot > 0)) { saltados.sinHoraEntrada++; continue; }

  // El cierre real: el último precio del subyacente del día (16:00 en jornada completa).
  const horasDia = C.horas;
  const ultima = horasDia[horasDia.length - 1];
  const cierre = C.spot.get(ultima) ?? [...C.spot.values()].pop();
  if (!(cierre > 0)) { saltados.sinFichero++; continue; }
  if (ultima < "16:00") saltados.mediasJornadas++;

  // Los minutos que se vigilan: desde el siguiente a la entrada hasta ULTIMO_VIGILADO.
  const vigilar = horasDia.filter((h) => h > HORA && h <= ULTIMO_VIGILADO);

  const ksC = [...C.porStrike.keys()], ksP = [...P.porStrike.keys()];

  for (const D of DISTANCIAS) {
    const kcC = cerca(ksC, spot + D), kpC = cerca(ksP, spot - D);
    const kcL = cerca(ksC, kcC + ALA), kpL = cerca(ksP, kpC - ALA);
    if (kcL <= kcC || kpL >= kpC) { saltados.sinStrikes++; continue; }

    const q = (mapa, K, h) => mapa.get(K)?.get(h) ?? null;
    const e = [q(C.porStrike, kcC, HORA), q(P.porStrike, kpC, HORA),
               q(C.porStrike, kcL, HORA), q(P.porStrike, kpL, HORA)];
    if (e.some((x) => !x)) { saltados.sinStrikes++; continue; }
    const [ecC, epC, ecL, epL] = e;

    const credito = ecC.bid + epC.bid - ecL.ask - epL.ask;          // real
    const creditoMid = ecC.mid + epC.mid - ecL.mid - epL.mid;       // punto medio
    if (!(credito > 0)) { saltados.creditoNoPositivo++; continue; }

    const anchoC = kcL - kcC, anchoP = kpC - kpL;
    const riesgo = (Math.max(anchoC, anchoP) - credito) * 100;

    // ── La trayectoria: coste de recomprar en cada minuto vigilado ──
    const camino = [];
    for (const h of vigilar) {
      const a = q(C.porStrike, kcC, h), b = q(P.porStrike, kpC, h);
      const c = q(C.porStrike, kcL, h), d2 = q(P.porStrike, kpL, h);
      if (!a || !b || !c || !d2) continue;   // hueco de cotización: no se puede operar ese minuto
      camino.push({
        h, kcC, kpC,
        spot: C.spot.get(h) ?? spot,                    // el índice EN ESE MINUTO, para la regla del toque
        coste: a.ask + b.ask - c.bid - d2.bid,          // recomprar de verdad
        costeMid: a.mid + b.mid - c.mid - d2.mid,       // recomprar sin horquilla
      });
    }

    // ── Liquidación si se aguanta ──
    const perdCall = Math.min(Math.max(cierre - kcC, 0), anchoC);
    const perdPut = Math.min(Math.max(kpC - cierre, 0), anchoP);
    const costeFinal = perdCall + perdPut;      // lo que "cuesta" el vencimiento
    const feeEntrada = PATAS_ENTRADA * COMM;
    const feeSalida = PATAS_SALIDA * COMM;

    // Alguna trayectoria vacía = día inservible para gestión. Se apunta.
    for (const r of REGLAS) {
      // (1) MUNDO REAL: se decide con precios reales y se ejecuta a precios reales.
      let salida = null;
      if (!r.base) for (const p of camino) if (r.trig(credito, p.coste, p)) { salida = p; break; }
      const cerrado = salida !== null;
      const coste = cerrado ? salida.coste : costeFinal;
      const fees = feeEntrada + feeSalida;   // la liquidación en efectivo también se cobra
      const pl = (credito - coste) * 100 - fees;

      // (2) MISMO SUCESO, SIN HORQUILLA: la misma salida, valorada a punto medio. Aísla el peaje.
      const plMid = (creditoMid - (cerrado ? salida.costeMid : costeFinal)) * 100 - fees;

      // (3) MUNDO IDEAL COMPLETO: se DECIDE con punto medio y se EJECUTA a punto medio. Cierra el
      //     hueco de "la gestión pierde sólo porque la horquilla la castiga": aquí no hay horquilla
      //     ni al decidir ni al ejecutar. Si aun así pierde, lo que falla es la regla.
      let salidaP = null;
      if (!r.base) for (const p of camino) if (r.trig(creditoMid, p.costeMid, p)) { salidaP = p; break; }
      const plPuro = (creditoMid - (salidaP ? salidaP.costeMid : costeFinal)) * 100 - fees;

      resultados.get(D).get(r.id).push({
        fecha, pl, plMid, plPuro, cerrado, hora: cerrado ? salida.h : "cierre",
        credito: credito * 100, riesgo, coste: coste * 100,
        ancho: Math.max(anchoC, anchoP) * 100,
      });
    }

    if (D === DISTANCIAS[0]) {
      diagnostico.push({
        fecha, credito: credito * 100, creditoMid: creditoMid * 100,
        minutos: camino.length, costeFinal: costeFinal * 100,
        horquillaEntrada: (creditoMid - credito) * 100,
      });
    }
  }
}

console.log(`días saltados: ${JSON.stringify(saltados)}`);
console.log(`(medias jornadas = días que cierran antes de las 16:00; se liquidan con su propio último precio)`);

// ── RADIOGRAFÍA: mirar el fichero ANTES de medir con él ──
// `minutos` NO va en la radiografía porque su valor bueno es CONSTANTE (59 = 11:05→15:55 sin un
// solo hueco) y la radiografía —con razón— mata los campos de un solo valor. Se comprueba aparte,
// que es justo lo que hace falta saber: si faltan minutos, la gestión se está midiendo a ciegas.
{
  const cuenta = new Map();
  for (const d of diagnostico) cuenta.set(d.minutos, (cuenta.get(d.minutos) ?? 0) + 1);
  const esperados = 59;
  const completos = cuenta.get(esperados) ?? 0;
  console.log(`\n── minutos vigilados por día (${HORA}→${ULTIMO_VIGILADO}, esperados ${esperados}) ──`);
  for (const [m, n] of [...cuenta].sort((a, b) => b[1] - a[1])) console.log(`  ${m} minutos: ${n} días`);
  if (completos < diagnostico.length * 0.95)
    throw new Error(`sólo ${completos} de ${diagnostico.length} días tienen la trayectoria completa: ` +
      `las reglas de gestión se estarían midiendo sobre huecos de cotización`);
}
radiografia(diagnostico, ["credito", "creditoMid", "costeFinal", "horquillaEntrada"],
  `cóndor ±${DISTANCIAS[0]} entrada ${HORA}`, { cerosLegitimos: ["costeFinal"] });

// ─────────────────────────────────────────────────────────────────────────────────────────
// ESTADÍSTICA
// ─────────────────────────────────────────────────────────────────────────────────────────

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return 0; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const sd = (v) => Math.sqrt(varianza(v));
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const eur = (x) => (Number.isFinite(x) ? `$${Math.round(x).toLocaleString("es-ES")}` : "—");

/** t pareado: la misma serie de días, dos reglas. La unidad es el DÍA. */
function tPareado(a, b) {
  const dif = a.map((x, i) => x - b[i]);
  const s = sd(dif);
  return { dif: media(dif), t: s > 0 ? media(dif) / (s / Math.sqrt(dif.length)) : 0, sd: s, n: dif.length };
}

/** Separación mínima detectable al 80% de potencia, para no confundir "no hay" con "no se vio". */
const detectable = (a, b) => {
  const dif = a.map((x, i) => x - b[i]);
  return 2.8 * sd(dif) / Math.sqrt(dif.length);
};

const salidaJson = { hora: HORA, ala: ALA, pruebas: PRUEBAS_DECLARADAS, liston: LISTON, distancias: {} };

for (const D of DISTANCIAS) {
  const R = resultados.get(D);
  const base = R.get("aguantar");
  if (!base.length) continue;
  const años = [...new Set(base.map((x) => x.fecha.slice(0, 4)))].sort();

  console.log(`\n\n╔═══ DISTANCIA ±${D} PUNTOS · alas ${ALA} · n = ${base.length} días ════════════════════════════╗`);
  console.log(`   crédito mediano de entrada ${eur(pct(base.map((x) => x.credito), 0.5))} · riesgo máximo ${eur(media(base.map((x) => x.riesgo)))}\n`);

  console.log(`regla                              cerr.  acierto   P&L med   P&L tot    peor día    p05     desv.   dif.vs aguantar    t`);
  console.log(`${"─".repeat(125)}`);

  const filas = [];
  for (const r of REGLAS) {
    const v = R.get(r.id);
    const pls = v.map((x) => x.pl);
    const tot = pls.reduce((a, b) => a + b, 0);
    const acierto = (v.filter((x) => x.pl > 0).length / v.length) * 100;
    const cerr = (v.filter((x) => x.cerrado).length / v.length) * 100;
    const cmp = r.base ? null : tPareado(pls, base.map((x) => x.pl));
    filas.push({ r, v, pls, tot, acierto, cerr, cmp });
    console.log(
      `${r.nombre.padEnd(34)} ${cerr.toFixed(0).padStart(3)}%    ${acierto.toFixed(0).padStart(3)}%  ` +
      `${eur(media(pls)).padStart(8)}  ${eur(tot).padStart(9)}  ${eur(Math.min(...pls)).padStart(9)}  ` +
      `${eur(pct(pls, 0.05)).padStart(7)}  ${eur(sd(pls)).padStart(7)}   ` +
      (cmp ? `${eur(cmp.dif).padStart(9)}  ${cmp.t.toFixed(2).padStart(7)}` : `        base         —`),
    );
  }

  // ── PUNTO MEDIO: cuánto de la diferencia es horquilla y cuánto es gestión ──
  console.log(`\n── LO MISMO A PUNTO MEDIO (sin horquilla): si una regla sólo gana aquí, lo que gana es liquidez ──`);
  console.log(`regla                             P&L med real   P&L med punto medio   peaje de la gestión   dif.vs aguantar (medio)`);
  const baseMid = base.map((x) => x.plMid);
  for (const { r, v, pls } of filas) {
    const mids = v.map((x) => x.plMid);
    const cmpMid = r.base ? null : tPareado(mids, baseMid);
    console.log(
      `${r.nombre.padEnd(34)} ${eur(media(pls)).padStart(9)}   ${eur(media(mids)).padStart(15)}   ` +
      `${eur(media(mids) - media(pls)).padStart(15)}   ` +
      (cmpMid ? `${eur(cmpMid.dif).padStart(17)}  (t ${cmpMid.t.toFixed(2)})` : `             base`),
    );
  }

  // ── EL MUNDO IDEAL: decidir Y ejecutar sin horquilla ──
  // Si la gestión ganase aquí y perdiese arriba, la conclusión sería "la idea es buena pero el
  // mercado se la come". Si pierde también aquí, la idea es mala.
  const basePuro = base.map((x) => x.plPuro);
  console.log(`\n── MUNDO IDEAL: se DECIDE y se EJECUTA a punto medio (horquilla = 0 en todo) ──`);
  console.log(`regla                            P&L medio ideal   dif.vs aguantar ideal      t      ¿se salva la regla?`);
  for (const { r, v } of filas) {
    const p = v.map((x) => x.plPuro);
    const c = r.base ? null : tPareado(p, basePuro);
    console.log(`${r.nombre.padEnd(33)} ${eur(media(p)).padStart(12)}   ` +
      (c ? `${eur(c.dif).padStart(20)}  ${c.t.toFixed(2).padStart(6)}      ${c.dif > 0 ? "sí, mirar de cerca" : "no: pierde hasta sin horquilla"}` : `                base`));
  }

  // ── POR AÑO ──
  console.log(`\n── ¿AGUANTA EN EL TIEMPO? P&L medio por año ──`);
  console.log(`regla                            ${años.map((a) => a.padStart(10)).join("")}`);
  for (const { r, v } of filas) {
    const f = años.map((a) => {
      const g = v.filter((x) => x.fecha.startsWith(a)).map((x) => x.pl);
      return (g.length ? eur(media(g)) : "—").padStart(10);
    });
    console.log(`${r.nombre.padEnd(33)}${f.join("")}`);
  }

  // ── TERCIOS DE TIEMPO sobre la DIFERENCIA contra aguantar ──
  console.log(`\n── EL SIGNO DE LA DIFERENCIA CONTRA AGUANTAR, EN LOS TRES TERCIOS ──`);
  const k = Math.floor(base.length / 3);
  const rangos = [[0, k], [k, 2 * k], [2 * k, base.length]];
  console.log(`regla                          ${rangos.map((_, i) => `tercio ${i + 1}`.padStart(14)).join("")}   ¿mismo signo?`);
  const veredictos = [];
  for (const { r, v, cmp } of filas) {
    if (r.base) continue;
    const porTercio = rangos.map(([a, b]) => media(v.slice(a, b).map((x) => x.pl)) - media(base.slice(a, b).map((x) => x.pl)));
    const signos = porTercio.map((x) => Math.sign(x));
    const mismo = signos[0] === signos[1] && signos[1] === signos[2];
    console.log(`${r.nombre.padEnd(30)} ${porTercio.map((x) => eur(x).padStart(14)).join("")}   ${mismo ? "SÍ" : "no"}`);
    veredictos.push({ r, cmp, mismo, porTercio });
  }

  // ── VEREDICTO ──
  console.log(`\n── VEREDICTO (listón |t| ≥ ${LISTON} con ${PRUEBAS_DECLARADAS} pruebas declaradas) ──`);
  for (const { r, cmp, mismo } of veredictos) {
    const v = R.get(r.id);
    const mids = v.map((x) => x.plMid);
    const cmpMid = tPareado(mids, baseMid);
    const det = detectable(v.map((x) => x.pl), base.map((x) => x.pl));
    let ver;
    if (cmp.dif > 0 && Math.abs(cmp.t) >= LISTON && mismo && cmpMid.dif > 0) ver = "✅ GANA a aguantar";
    else if (cmp.dif < 0 && Math.abs(cmp.t) >= LISTON) ver = "❌ PIERDE contra aguantar";
    else if (Math.abs(cmp.dif) < det) ver = `— no se pudo ver (haría falta ${eur(det)}/op para detectarlo)`;
    else ver = "— no llega al listón";
    const pegas = [];
    if (cmp.dif > 0 && !mismo) pegas.push("el signo no se repite en los tres tercios");
    if (cmp.dif > 0 && cmpMid.dif <= 0) pegas.push("a punto medio NO gana: era horquilla");
    if (cmp.dif > 0 && Math.abs(cmp.t) < LISTON) pegas.push(`t=${cmp.t.toFixed(2)} < ${LISTON}`);
    console.log(`  ${r.nombre.padEnd(34)} ${ver}${pegas.length ? "  ·  " + pegas.join(" · ") : ""}`);
  }

  // ── COLA Y PEOR DÍA: lo que los stops dicen arreglar ──
  console.log(`\n── LA COLA: ¿arreglan los stops el desastre? ──`);
  console.log(`regla                            peor día    2º peor    3º peor    p01      p05    suma de los 10 peores`);
  for (const { r, pls } of filas) {
    const s = [...pls].sort((a, b) => a - b);
    console.log(`${r.nombre.padEnd(33)} ${eur(s[0]).padStart(9)}  ${eur(s[1]).padStart(9)}  ${eur(s[2]).padStart(9)}  ` +
      `${eur(pct(pls, 0.01)).padStart(7)} ${eur(pct(pls, 0.05)).padStart(8)}   ${eur(s.slice(0, 10).reduce((a, b) => a + b, 0)).padStart(10)}`);
  }

  // ── EL MECANISMO: ¿qué hace de verdad cada regla el día que se dispara? ──
  console.log(`\n── ¿QUÉ PASA EL DÍA QUE LA REGLA SE DISPARA? (sólo los días en que cierra antes) ──`);
  console.log(`regla                            días   acertó salir   se equivocó   ahorro medio   coste medio   NETO`);
  for (const { r, v } of filas) {
    if (r.base) continue;
    const disp = v.map((x, i) => ({ ...x, hold: base[i].pl })).filter((x) => x.cerrado);
    if (!disp.length) { console.log(`${r.nombre.padEnd(33)} nunca se dispara`); continue; }
    const bien = disp.filter((x) => x.pl > x.hold), mal = disp.filter((x) => x.pl < x.hold);
    const ahorro = bien.reduce((a, x) => a + (x.pl - x.hold), 0);
    const coste = mal.reduce((a, x) => a + (x.hold - x.pl), 0);
    console.log(`${r.nombre.padEnd(33)} ${String(disp.length).padStart(4)}   ` +
      `${String(bien.length).padStart(6)} (${((bien.length / disp.length) * 100).toFixed(0)}%)   ` +
      `${String(mal.length).padStart(6)} (${((mal.length / disp.length) * 100).toFixed(0)}%)   ` +
      `${eur(bien.length ? ahorro / bien.length : 0).padStart(10)}   ${eur(mal.length ? coste / mal.length : 0).padStart(10)}   ${eur(ahorro - coste).padStart(9)}`);
  }

  // ── EJECUCIONES ROTAS: cuando recomprar cuesta MÁS que el ancho de las alas ──
  // El cóndor no puede perder más que (ala − crédito) al vencimiento. Pero recomprar SÍ puede
  // costar más que el ala si la horquilla se abre. Es el momento exacto en que el stop debería
  // salvarte, y es el momento en que no hay a quién vendérselo a un precio decente.
  console.log(`\n── EJECUCIONES ROTAS: días en que RECOMPRAR cuesta más que el ancho de las alas ──`);
  for (const { r, v } of filas) {
    if (r.base) continue;
    const rotas = v.filter((x) => x.cerrado && x.coste > x.ancho);
    if (!rotas.length) continue;
    console.log(`${r.nombre.padEnd(33)} ${rotas.length} día(s): ` +
      rotas.slice(0, 4).map((x) => `${x.fecha} ${x.hora} coste ${eur(x.coste)} vs ala ${eur(x.ancho)} (P&L ${eur(x.pl)})`).join(" · "));
  }

  // ── ¿DE DÓNDE SALE EL DINERO? el resultado del cóndor vive en la cola, no en la media ──
  console.log(`\n── CONCENTRACIÓN DEL RESULTADO Y RACHA MALA (1 contrato) ──`);
  console.log(`regla                            P&L total   los 10 peores   % del total que borran   peor racha (pico→valle)`);
  for (const { r, v, pls, tot } of filas) {
    const s = [...pls].sort((a, b) => a - b);
    const diez = s.slice(0, 10).reduce((a, b) => a + b, 0);
    let acum = 0, pico = 0, dd = 0;
    for (const x of v) { acum += x.pl; if (acum > pico) pico = acum; if (pico - acum > dd) dd = pico - acum; }
    console.log(`${r.nombre.padEnd(33)} ${eur(tot).padStart(9)}   ${eur(diez).padStart(12)}   ` +
      `${(tot > 0 ? ((-diez / tot) * 100).toFixed(0) + "%" : "—").padStart(20)}   ${eur(-dd).padStart(20)}`);
  }

  // ── DÓLARES AL AÑO ──
  const dias = new Set(base.map((x) => x.fecha)).size;
  const años_n = (new Date(base[base.length - 1].fecha) - new Date(base[0].fecha)) / (365.25 * 24 * 3600 * 1000);
  const opsAño = dias / años_n;
  console.log(`\n── DÓLARES AL AÑO por 1 contrato (${dias} días en ${años_n.toFixed(2)} años → ${opsAño.toFixed(0)} operaciones/año) ──`);
  for (const { r, pls } of filas) {
    console.log(`${r.nombre.padEnd(33)} ${eur(media(pls) * opsAño).padStart(10)} /año   (${opsAño.toFixed(0)} ops × ${eur(media(pls))}/op)`);
  }

  salidaJson.distancias[D] = filas.map(({ r, v, pls, tot, acierto, cerr, cmp }) => ({
    id: r.id, nombre: r.nombre, n: v.length, cerradas: cerr, acierto,
    plMedio: media(pls), plTotal: tot, plMid: media(v.map((x) => x.plMid)),
    peorDia: Math.min(...pls), p05: pct(pls, 0.05), sd: sd(pls),
    difVsAguantar: cmp?.dif ?? 0, t: cmp?.t ?? 0, alAño: media(pls) * opsAño,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// EL RECUENTO GLOBAL — ninguna prueba suelta llega al listón, pero ¿cuántas apuntan al mismo lado?
// ─────────────────────────────────────────────────────────────────────────────────────────
{
  const todas = DISTANCIAS.flatMap((D) => salidaJson.distancias[D].filter((x) => x.id !== "aguantar"));
  const neg = todas.filter((x) => x.difVsAguantar < 0).length;
  // Prueba de signos: si gestionar fuera neutral, cada regla saldría hacia arriba o hacia abajo
  // con la misma probabilidad. NO son independientes entre sí (comparten días y trayectoria), así
  // que esto NO es una p-valor limpio: es un recuento, y como tal se presenta.
  console.log(`\n\n╔═══ RECUENTO GLOBAL ═══════════════════════════════════════════════════════════════════╗`);
  console.log(`  ${neg} de ${todas.length} reglas de gestión salen POR DEBAJO de aguantar.`);
  console.log(`  (las reglas no son independientes entre sí —comparten días y trayectoria—, así que`);
  console.log(`   esto es un recuento, no un p-valor. Pero ${todas.length - neg} de ${todas.length} hacia arriba es un dato.)`);
  const mejor = todas.reduce((a, b) => (b.difVsAguantar > a.difVsAguantar ? b : a));
  console.log(`  la menos mala: "${mejor.nombre}" a ${eur(mejor.difVsAguantar)}/op contra aguantar (t ${mejor.t.toFixed(2)}).`);
  const holds = DISTANCIAS.map((D) => salidaJson.distancias[D].find((x) => x.id === "aguantar"));
  DISTANCIAS.forEach((D, i) => console.log(`  AGUANTAR ±${D}: ${eur(holds[i].plMedio)}/op · ${eur(holds[i].alAño)}/año por contrato · peor día ${eur(holds[i].peorDia)}`));

  // ── LO QUE CABE EN LA CUENTA REAL ──
  // $55.419, el 85% en 500 acciones de HOOD → efectivo libre ≈ $8.300.
  // Colateral de un cóndor con alas de 50 puntos = el ancho menos el crédito, ~$4.500 POR VERTICAL.
  // En Robinhood el cóndor NO entra como una sola orden: son dos verticales. Si retiene el
  // colateral de LAS DOS, un solo cóndor pide ~$9.000 y NO le cabe. Ese dato sigue sin confirmar.
  const CUENTA = 55419, EFECTIVO = CUENTA * 0.15;
  const colUno = 4500, colDos = 9000;
  console.log(`\n  ── ¿CABE EN SU CUENTA? ──`);
  console.log(`  cuenta ${eur(CUENTA)} · el 85% en HOOD → efectivo libre ≈ ${eur(EFECTIVO)}`);
  console.log(`  si Robinhood retiene UNA vertical (${eur(colUno)}): caben ${Math.floor(EFECTIVO / colUno)} cóndor(es) → ${eur(Math.floor(EFECTIVO / colUno) * holds[0].alAño)}/año`);
  console.log(`  si retiene LAS DOS (${eur(colDos)}): caben ${Math.floor(EFECTIVO / colDos)} cóndor(es) → NO le cabe ninguno sin vender HOOD`);
  console.log(`  ⚠️ cuál de las dos es, SIGUE SIN CONFIRMAR. Es la diferencia entre operar esto y no operarlo.`);
}

writeFileSync("scripts/opt-gestion-resultado.json", JSON.stringify(salidaJson, null, 2));
console.log(`\n(detalle en scripts/opt-gestion-resultado.json)`);
