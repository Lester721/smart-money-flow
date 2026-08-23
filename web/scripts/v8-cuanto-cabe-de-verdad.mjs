// ═══════════════════════════════════════════════════════════════════════════════════════════
//  ¿CUÁNTO CABE DE VERDAD EN SU CUENTA, Y QUÉ PASA EL PEOR DÍA?
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Esto NO busca una señal nueva. Es la pregunta que decide si algo de todo lo medido se puede
// operar de verdad con el dinero que hay en la cuenta.
//
// LO QUE SE SIMULA, DÍA A DÍA, CON LA CAJA DE VERDAD:
//   · $7.977 de EFECTIVO libre (el resto de la cuenta son 500 acciones de HOOD)
//   · $5.000 de colateral retenido por cada cóndor (una vertical al ancho completo: 50 pts)
//   · $73.874 de poder de compra (cuenta de margen)
//   · 5% anual de interés sobre cualquier saldo de efectivo negativo, por días naturales
//   · SPXW liquida EN EFECTIVO: la pérdida del día se cobra ESE día, no hay "aguantar la posición"
//
// LAS CUATRO REGLAS QUE SE MIDEN:
//   A) cóndor ±45 alas 50, SIN filtro, entrando a las 11:00
//   B) lo mismo a las 13:00
//   C) lo mismo a las 14:00
//   D) LOS TRES SÍES a las 11:00 (SPX sobre su media de 5 Y sobre la de 50 Y crédito ≥ $100)
//   Todas se aguantan hasta el vencimiento (liquidación al intrínseco contra el cierre real).
//
// PARA CADA UNA, CON 1, 2 Y 3 CONTRATOS:
//   · qué días concretos se queda sin efectivo
//   · si hay llamada de margen y cuándo
//   · la caída máxima de la CAJA, en dólares y en % de su cuenta ($55.419)
//   · el peor día de los 1.123, con nombre y apellidos
//
// PRECIOS REALES SIEMPRE (vende al bid, compra al ask, las cuatro patas), ningún modelo,
// y el calendario real: 1.123 días de 2022-01-03 a 2026-08-10 = 4,60 años.
//
// Uso: node --import tsx scripts/v8-cuanto-cabe-de-verdad.mjs

import { readFileSync, existsSync } from "node:fs";
import { diasDisponibles, cargarDia, estructura, condor, idxHora, hayHora, rejilla } from "./lib0dte.mjs";

// ── parámetros de la cuenta ─────────────────────────────────────────────────
const EFECTIVO0 = 7977;
const COLATERAL = 5000;           // por contrato: una vertical de 50 pts al ancho completo
const PODER_COMPRA = 73874;
const CUENTA_TOTAL = 55419;
const INTERES = 0.05;             // anual, sobre saldo negativo
const COMISION = 0.24;            // $0,03 × 4 patas × 2 (abrir + el peor caso de cerrar)

const ANCHO = 45, ALA = 50, CREDITO_MIN = 1.00;
const HORAS = ["11:00", "13:00", "14:00"];

const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); const n = s.length;
  return n === 0 ? NaN : n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
function tDe(v) { const n = v.length; if (n < 2) return NaN; const m = media(v);
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return (m * Math.sqrt(n)) / (sd || Infinity); }

// ═══ 1. LA SERIE DE MEDIAS (para los tres síes) ═════════════════════════════
// Cinta de minutos de SPY: cierre (minuto 960) y precio de las 11:00 (minuto 660).
// Las medias usan SÓLO cierres de D−1 hacia atrás. Nada del día D salvo el precio de las 11:00.
const serie = [];
for (const y of [2022, 2023, 2024, 2025, 2026]) {
  const f = `scripts/cache-theta/SPY_spotmin_y_${y}.json`;
  if (!existsSync(f)) continue;
  for (const [d, arr] of Object.entries(JSON.parse(readFileSync(f, "utf8")))) {
    const m = new Map(arr.map(([mi, p]) => [mi, p]));
    const c = m.get(960), p11 = m.get(660);
    if (!(c > 0) || !(p11 > 0)) continue;
    serie.push({ fecha: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, c, p11 });
  }
}
serie.sort((a, b) => a.fecha.localeCompare(b.fecha));
const idxSerie = new Map(serie.map((d, i) => [d.fecha, i]));
console.log(`serie de medias: ${serie.length} sesiones de SPY, ${serie[0]?.fecha} → ${serie[serie.length - 1]?.fecha}`);

// ═══ 2. UNA SOLA PASADA POR LOS 1.123 DÍAS ══════════════════════════════════
const dias = diasDisponibles();
console.log(`\ndías con cadena 0DTE: ${dias.length}   ${dias[0]} → ${dias[dias.length - 1]}`);

const filas = [];                                  // una por día
const huecos = { "11:00": 0, "13:00": 0, "14:00": 0 };
const sinBarra = { "11:00": 0, "13:00": 0, "14:00": 0 };
let sinCargar = 0, sinSerie = 0;
const t0 = Date.now();

for (const d of dias) {
  const D = cargarDia(d);
  if (!D) { sinCargar++; continue; }
  const spotIni = D.barras[0].spot;
  const cierre = D.barras[D.barras.length - 1].spot;
  const fila = { dia: d, spotIni, cierre, mov: (cierre / spotIni - 1) * 100, h: {} };

  for (const h of HORAS) {
    const i = hayHora(D, h);
    if (i < 0) { sinBarra[h]++; fila.h[h] = null; continue; }
    const spot = D.barras[i].spot;
    const centro = rejilla(spot);
    const r = estructura(D, i, "vencimiento", condor(centro, ANCHO, ALA));
    if (!r) { huecos[h]++; fila.h[h] = null; continue; }
    fila.h[h] = {
      spot, centro,
      credito: r.credito * 100,
      pl: r.dolares - COMISION,
      riesgoMax: r.riesgoMax,
    };
  }
  filas.push(fila);
}
console.log(`pasada completa en ${((Date.now() - t0) / 1000).toFixed(0)}s · ${filas.length} días leídos · ${sinCargar} días sin cargar`);
console.log(`huecos de precio (falta una pata): 11:00 ${huecos["11:00"]} · 13:00 ${huecos["13:00"]} · 14:00 ${huecos["14:00"]}`);
console.log(`barras que no existen:            11:00 ${sinBarra["11:00"]} · 13:00 ${sinBarra["13:00"]} · 14:00 ${sinBarra["14:00"]}`);

// ── los tres síes sobre el mismo conjunto de días ───────────────────────────
for (const f of filas) {
  const c11 = f.h["11:00"];
  f.tresSies = false;
  if (!c11) continue;
  const i = idxSerie.get(f.dia);
  if (i === undefined || i < 55) { sinSerie++; continue; }
  const cierres = serie.slice(Math.max(0, i - 200), i).map((x) => x.c);   // SÓLO D−1 hacia atrás
  const p11 = serie[i].p11;
  const si1 = p11 > media(cierres.slice(-5));
  const si2 = p11 > media(cierres.slice(-50));
  const si3 = c11.credito >= CREDITO_MIN * 100;
  f.si = { si1, si2, si3 };
  f.tresSies = si1 && si2 && si3;
}
console.log(`días sin serie de medias (arranque de 2022): ${sinSerie}`);

// ── SANIDAD: rango de créditos ──────────────────────────────────────────────
console.log("\n" + "=".repeat(100));
console.log("  SANIDAD — el crédito de un cóndor ±45/50 debe caer entre $20 y $600");
console.log("=".repeat(100));
for (const h of HORAS) {
  const cr = filas.map((f) => f.h[h]?.credito).filter((x) => x != null);
  const s = [...cr].sort((a, b) => a - b);
  console.log(`  ${h}  n=${cr.length}  mín ${eur(s[0])}  p10 ${eur(s[Math.floor(s.length * 0.1)])}  ` +
              `mediana ${eur(mediana(cr))}  p90 ${eur(s[Math.floor(s.length * 0.9)])}  máx ${eur(s[s.length - 1])}` +
              `   · fuera de [$20,$600]: ${cr.filter((x) => x < 20 || x > 600).length}`);
}
const rm = filas.map((f) => f.h["11:00"]?.riesgoMax).filter((x) => x != null);
console.log(`  riesgo máximo por contrato a las 11:00: mediana ${eur(mediana(rm))} · máx ${eur(Math.max(...rm))} (el tope teórico es $5.000)`);

// ═══ 3. LAS CUATRO REGLAS ═══════════════════════════════════════════════════
const REGLAS = [
  { id: "A", nombre: "cóndor ±45/50 sin filtro · 11:00", ops: filas.filter((f) => f.h["11:00"]).map((f) => ({ dia: f.dia, pl: f.h["11:00"].pl, fila: f, h: "11:00" })) },
  { id: "B", nombre: "cóndor ±45/50 sin filtro · 13:00", ops: filas.filter((f) => f.h["13:00"]).map((f) => ({ dia: f.dia, pl: f.h["13:00"].pl, fila: f, h: "13:00" })) },
  { id: "C", nombre: "cóndor ±45/50 sin filtro · 14:00", ops: filas.filter((f) => f.h["14:00"]).map((f) => ({ dia: f.dia, pl: f.h["14:00"].pl, fila: f, h: "14:00" })) },
  { id: "D", nombre: "LOS TRES SÍES · 11:00",            ops: filas.filter((f) => f.tresSies).map((f) => ({ dia: f.dia, pl: f.h["11:00"].pl, fila: f, h: "11:00" })) },
];

// calendario real
const ANOS = 1123 / 244;
console.log(`\ncalendario real: 1.123 días de mercado / 244 al año = ${ANOS.toFixed(2)} años`);

// ── caída máxima de la caja acumulada ───────────────────────────────────────
function caidaCaja(pls) {
  let acum = 0, pico = 0, peor = 0, diaPeor = null;
  for (const x of pls) { acum += x.pl ?? x; pico = Math.max(pico, acum); const d = acum - pico;
    if (d < peor) { peor = d; diaPeor = x.dia ?? null; } }
  return { peor, diaPeor };
}

console.log("\n" + "=".repeat(100));
console.log("  LAS CUATRO REGLAS, 1 CONTRATO, DINERO CRUDO (sin la cuenta todavía)");
console.log("=".repeat(100));
console.log("| regla | n ops | $/año | mediana | acierto | peor día | caída caja | t |");
console.log("|---|---|---|---|---|---|---|---|");
for (const R of REGLAS) {
  const pls = R.ops.map((o) => o.pl);
  R.total = suma(pls); R.porAno = R.total / ANOS;
  R.mediana = mediana(pls); R.peorDia = Math.min(...pls);
  R.acierto = pls.filter((x) => x > 0).length / pls.length;
  R.caida = caidaCaja(R.ops); R.t = tDe(pls);
  console.log(`| ${R.id} ${R.nombre} | ${R.ops.length} | **${eur(R.porAno)}** | ${eur(R.mediana)} | ` +
              `${(R.acierto * 100).toFixed(0)}% | ${eur(R.peorDia)} | ${eur(R.caida.peor)} (${R.caida.diaPeor}) | ${R.t.toFixed(2)} |`);
}

// ── año a año ───────────────────────────────────────────────────────────────
const anos = ["2022", "2023", "2024", "2025", "2026"];
console.log("\n### Año a año, 1 contrato\n");
console.log("| regla | " + anos.join(" | ") + " |");
console.log("|---|" + anos.map(() => "---").join("|") + "|");
for (const R of REGLAS) {
  R.porAnoDetalle = {};
  const celdas = anos.map((a) => {
    const v = R.ops.filter((o) => o.dia.startsWith(a)).map((o) => o.pl);
    R.porAnoDetalle[a] = { n: v.length, pl: suma(v) };
    return v.length ? `${eur(suma(v))} (n=${v.length})` : "—";
  });
  console.log(`| ${R.id} | ${celdas.join(" | ")} |`);
}

// ── quitar los 5 mejores / los 5 peores ─────────────────────────────────────
console.log("\n### ¿Vive de unos pocos días? (1 contrato)\n");
console.log("| regla | $/año | sin los 5 MEJORES | sin los 5 PEORES |");
console.log("|---|---|---|---|");
for (const R of REGLAS) {
  const s = R.ops.map((o) => o.pl).sort((a, b) => a - b);
  R.sinCinco = suma(s.slice(0, -5)) / ANOS;
  R.sinCincoPeores = suma(s.slice(5)) / ANOS;
  console.log(`| ${R.id} | ${eur(R.porAno)} | ${eur(R.sinCinco)} | ${eur(R.sinCincoPeores)} |`);
}

// ═══ 4. EL PEOR DÍA DE LOS 1.123, CON NOMBRE Y APELLIDOS ════════════════════
console.log("\n" + "=".repeat(100));
console.log("  EL PEOR DÍA — con SPXW la pérdida se cobra ESE mismo día, en efectivo");
console.log("=".repeat(100));

// el peor de cualquier hora
const candidatos = [];
for (const f of filas) for (const h of HORAS) if (f.h[h]) candidatos.push({ dia: f.dia, h, pl: f.h[h].pl, fila: f });
candidatos.sort((a, b) => a.pl - b.pl);
const PEOR = candidatos[0];

console.log(`\nLos 8 peores días-hora de los 1.123:\n`);
console.log("| día | hora entrada | SPX 09:35 | SPX cierre | movimiento | crédito | P&L 1 contrato |");
console.log("|---|---|---|---|---|---|---|");
const vistos = new Set();
for (const c of candidatos) {
  if (vistos.has(c.dia + c.h)) continue; vistos.add(c.dia + c.h);
  if (vistos.size > 8) break;
  console.log(`| ${c.dia} | ${c.h} | ${c.fila.spotIni.toFixed(2)} | ${c.fila.cierre.toFixed(2)} | ` +
              `${c.fila.mov >= 0 ? "+" : ""}${c.fila.mov.toFixed(2)}% | ${eur(c.fila.h[c.h].credito)} | **${eur(c.pl)}** |`);
}

// el día completo del peor: qué hizo a cada hora
const F = PEOR.fila;
console.log(`\n### ${PEOR.dia} — el día entero, hora por hora\n`);
console.log(`  el SPX abrió (09:35) en ${F.spotIni.toFixed(2)} y cerró en ${F.cierre.toFixed(2)} → ${F.mov >= 0 ? "+" : ""}${F.mov.toFixed(2)}%`);
{
  const D = cargarDia(PEOR.dia);
  const marcas = ["09:35", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
  console.log("\n  camino del índice: " + marcas.filter((m) => hayHora(D, m) >= 0)
    .map((m) => `${m} ${D.barras[idxHora(D, m)].spot.toFixed(0)}`).join(" · "));
}
console.log("\n| entrada | centro del cóndor | crédito cobrado | pérdida 1 contrato | 2 contratos | 3 contratos |");
console.log("|---|---|---|---|---|---|");
for (const h of HORAS) {
  const c = F.h[h];
  if (!c) { console.log(`| ${h} | — | — | hueco de precio | — | — |`); continue; }
  console.log(`| ${h} | ${c.centro} (vende ${c.centro - ANCHO}P / ${c.centro + ANCHO}C) | ${eur(c.credito)} | ` +
              `**${eur(c.pl)}** | ${eur(c.pl * 2)} | ${eur(c.pl * 3)} |`);
}
console.log(`\n  ¿operaban los tres síes ese día? ${F.tresSies ? "SÍ" : "NO"}` +
            (F.si ? `  (MA5 ${F.si.si1 ? "sí" : "no"} · MA50 ${F.si.si2 ? "sí" : "no"} · crédito≥$100 ${F.si.si3 ? "sí" : "no"})` : "  (sin serie de medias)"));

// el peor día de cada regla
console.log("\n### El peor día de CADA regla\n");
console.log("| regla | su peor día | movimiento del SPX | pérdida 1 contrato | 2 | 3 |");
console.log("|---|---|---|---|---|---|");
for (const R of REGLAS) {
  const p = R.ops.reduce((a, b) => (b.pl < a.pl ? b : a));
  console.log(`| ${R.id} | ${p.dia} | ${p.fila.mov >= 0 ? "+" : ""}${p.fila.mov.toFixed(2)}% | **${eur(p.pl)}** | ${eur(p.pl * 2)} | ${eur(p.pl * 3)} |`);
}

// días que pierden el riesgo máximo entero
console.log("\n### Días que pierden el riesgo máximo ENTERO (el cóndor se sale por completo de un lado)\n");
console.log("| regla | n ops | días al máximo | % | con 3 contratos son |");
console.log("|---|---|---|---|---|");
for (const R of REGLAS) {
  const tope = R.ops.filter((o) => {
    const c = o.fila.h[o.h];
    return o.pl <= -(c.riesgoMax - 1) + 0.01;      // dentro de $1 del riesgo máximo
  });
  R.diasTope = tope.length;
  console.log(`| ${R.id} | ${R.ops.length} | ${tope.length} | ${((tope.length / R.ops.length) * 100).toFixed(1)}% | ${eur(media(tope.map((o) => o.pl)) * 3 || 0)} de media |`);
}

// ═══ 5. LA CUENTA DE VERDAD, DÍA A DÍA ══════════════════════════════════════
//
// Modelo:
//   efectivo empieza en $7.977. Cada día con señal se retienen $5.000×n de colateral.
//   Ese colateral sale del efectivo si lo hay; si no, del margen (cuenta de margen, poder de
//   compra $73.874). Al cierre el cóndor liquida en efectivo y el P&L entra o sale del efectivo.
//   Si el efectivo queda negativo, es deuda de margen al 5% anual por días naturales.
//   LLAMADA DE MARGEN cuando el colateral retenido + la deuda superan el poder de compra.
//
// Lo que este modelo NO simula: el precio de HOOD (el 85% de la cuenta). Si HOOD cae, el poder
// de compra cae con él. Es un modelo OPTIMISTA en ese punto, y hay que decirlo.

function simularCuenta(ops, n) {
  let efectivo = EFECTIVO0, acum = 0, pico = 0, caidaMax = 0, diaCaida = null;
  let interesTotal = 0, minEfectivo = EFECTIVO0, diaMinEfectivo = null;
  const diasSinEfectivo = [];       // el colateral no cabe en el efectivo → tira de margen
  const diasEnRojo = [];            // el efectivo se queda por debajo de cero
  const llamadas = [];
  const colat = COLATERAL * n;
  let fechaPrev = null;

  for (const o of ops) {
    // interés de margen desde el día anterior
    if (fechaPrev && efectivo < 0) {
      const dd = (new Date(o.dia) - new Date(fechaPrev)) / 86400000;
      const i = -efectivo * INTERES * (dd / 365);
      interesTotal += i; efectivo -= i; acum -= i;
    }
    fechaPrev = o.dia;

    // ¿cabe el colateral en el efectivo?
    if (efectivo < colat) diasSinEfectivo.push({ dia: o.dia, efectivo, falta: colat - efectivo });

    // ¿llamada de margen? colateral + deuda contra el poder de compra
    const deuda = Math.max(0, -efectivo);
    if (colat + deuda > PODER_COMPRA + Math.min(0, acum)) llamadas.push({ dia: o.dia, colat, deuda });

    // liquidación del día
    efectivo += o.pl * n;
    acum += o.pl * n;
    if (efectivo < 0) diasEnRojo.push({ dia: o.dia, efectivo });
    if (efectivo < minEfectivo) { minEfectivo = efectivo; diaMinEfectivo = o.dia; }
    pico = Math.max(pico, acum);
    if (acum - pico < caidaMax) { caidaMax = acum - pico; diaCaida = o.dia; }
  }
  return {
    n, final: acum, porAno: acum / ANOS, efectivoFinal: efectivo,
    minEfectivo, diaMinEfectivo, caidaMax, diaCaida, interesTotal,
    diasSinEfectivo, diasEnRojo, llamadas,
  };
}

console.log("\n" + "=".repeat(100));
console.log("  LA CUENTA DE VERDAD — $7.977 de efectivo, $5.000 de colateral por contrato");
console.log("=".repeat(100));

const RES = {};
for (const R of REGLAS) {
  RES[R.id] = {};
  for (const n of [1, 2, 3]) RES[R.id][n] = simularCuenta(R.ops, n);
}

for (const R of REGLAS) {
  console.log(`\n### ${R.id}) ${R.nombre}\n`);
  console.log("| contratos | colateral | $/año (con interés) | efectivo mínimo | días en rojo | llamadas de margen | caída caja $ | caída % cuenta |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const n of [1, 2, 3]) {
    const s = RES[R.id][n];
    console.log(`| ${n} | ${eur(COLATERAL * n)} | **${eur(s.porAno)}** | ${eur(s.minEfectivo)} (${s.diaMinEfectivo}) | ` +
                `${s.diasEnRojo.length} | ${s.llamadas.length ? `**${s.llamadas.length}** (1ª ${s.llamadas[0].dia})` : "0"} | ` +
                `${eur(s.caidaMax)} | ${((-s.caidaMax / CUENTA_TOTAL) * 100).toFixed(1)}% |`);
  }
  // primeros días sin efectivo
  const s1 = RES[R.id][1], s3 = RES[R.id][3];
  if (s1.diasSinEfectivo.length) {
    console.log(`\n  con 1 contrato el colateral ($5.000) NO cabe en el efectivo en ${s1.diasSinEfectivo.length} de ${R.ops.length} días.`);
    console.log(`  primeros: ${s1.diasSinEfectivo.slice(0, 5).map((d) => `${d.dia} (efectivo ${eur(d.efectivo)})`).join(" · ")}`);
  } else {
    console.log(`\n  con 1 contrato el colateral cabe en el efectivo TODOS los días.`);
  }
  if (s3.diasEnRojo.length) {
    console.log(`  con 3 contratos el efectivo se pone en rojo ${s3.diasEnRojo.length} veces. Primeras 5: ${s3.diasEnRojo.slice(0, 5).map((d) => `${d.dia} ${eur(d.efectivo)}`).join(" · ")}`);
    console.log(`  interés de margen pagado con 3 contratos: ${eur(s3.interesTotal)} en total (${eur(s3.interesTotal / ANOS)}/año)`);
  }
}

// ── la peor racha desde cero: lo que sufre quien EMPIEZA HOY ────────────────
// Que la caja "nunca baje" en el backtest es un accidente del ORDEN: la regla ganó desde el
// primer día del histórico, así que el colchón se construyó ANTES de la mala racha. Si empieza
// hoy y la mala racha llega primero, ese colchón no existe. La caída máxima de una curva
// acumulada es exactamente la peor suma de un tramo seguido.
function peorTramo(pls) {
  let mejor = 0, act = 0, ini = 0, iniAct = 0, fin = 0;
  for (let i = 0; i < pls.length; i++) {
    if (act > 0) { act = 0; iniAct = i; }
    act += pls[i];
    if (act < mejor) { mejor = act; ini = iniAct; fin = i; }
  }
  return { suma: mejor, ini, fin };
}
for (const R of REGLAS) R.peorTramo = peorTramo(R.ops.map((o) => o.pl));

// ═══ 6. LA TABLA QUE MANDA ══════════════════════════════════════════════════
console.log("\n" + "=".repeat(100));
console.log("  LA TABLA — hora de entrada × contratos");
console.log("=".repeat(100) + "\n");
// El veredicto se juzga con el PEOR ARRANQUE, no con el orden que tocó en el histórico:
// nadie puede elegir empezar en 2022 ni saltarse la mala racha.
console.log("| regla | contratos | $/año | caída máxima $ | caída % de su cuenta | efectivo al fondo si empieza HOY | ¿sobrevive con su efectivo? |");
console.log("|---|---|---|---|---|---|---|");
for (const R of REGLAS) {
  for (const n of [1, 2, 3]) {
    const s = RES[R.id][n];
    const anoMalo = anos.some((a) => R.porAnoDetalle[a].n > 0 && R.porAnoDetalle[a].pl * n < 0);
    const fondo = EFECTIVO0 + R.peorTramo.suma * n;               // arrancando en el peor momento
    const deuda = Math.max(0, -fondo);
    let marca;
    if (s.porAno <= 0) marca = "NO — pierde dinero";
    else if (COLATERAL * n + deuda > PODER_COMPRA) marca = "**NO — llamada de margen**";
    else if (deuda > 0) marca = `sólo con margen (${eur(deuda)} prestados)`;
    else marca = "**SÍ — le cabe en efectivo**";
    console.log(`| ${R.id} ${R.nombre.split("·")[0].trim()} | ${n} | **${eur(s.porAno)}** | ${eur(s.caidaMax)} | ` +
                `${((-s.caidaMax / CUENTA_TOTAL) * 100).toFixed(1)}% | ${eur(fondo)} | ${marca}${anoMalo ? " · algún año perdedor" : ""} |`);
  }
}

console.log(`\n  LISTÓN: los tres síes dan ${eur(RES.D[1].porAno)}/año con 1 contrato en ESTA medición,`);
console.log(`  sobre el calendario COMPLETO de 4,60 años. Sólo pude evaluar la regla en ` +
            `${filas.length - sinSerie - huecos["11:00"]} días`);
console.log(`  (la cinta de SPY para las medias empieza en 2022, así que pierdo el arranque de 2022):`);
console.log(`  sobre esos días son ${eur(suma(REGLAS[3].ops.map((o) => o.pl)) / ((filas.length - sinSerie - huecos["11:00"]) / 244))}/año.`);

// ═══ 6b. EL PEOR ARRANQUE — la pregunta de verdad si empieza HOY ════════════
//
// Que la caja "nunca baje" en el backtest es un accidente del ORDEN: la regla ganó desde el
// primer día del histórico, así que el colchón se construyó antes de la mala racha. Si Lester
// empieza HOY y la mala racha llega primero, el colchón no existe.
// La caída máxima de una curva acumulada es exactamente la peor suma de un tramo seguido: eso
// es lo que pierde quien arranca en el peor momento posible.
console.log("\n" + "=".repeat(100));
console.log("  EL PEOR ARRANQUE — si empieza HOY y la mala racha llega ANTES que las ganancias");
console.log("=".repeat(100) + "\n");
console.log("| regla | contratos | peor racha desde cero | efectivo al fondo | ¿aguanta? | fechas de la racha |");
console.log("|---|---|---|---|---|---|");
for (const R of REGLAS) {
  const pt = R.peorTramo;
  for (const n of [1, 2, 3]) {
    const fondo = EFECTIVO0 + pt.suma * n;
    const colatMasDeuda = COLATERAL * n + Math.max(0, -fondo);
    const veredicto = colatMasDeuda > PODER_COMPRA ? "**NO — llamada de margen**"
      : fondo < 0 ? `tira ${eur(-fondo)} del margen` : "sí, con el efectivo";
    console.log(`| ${R.id} | ${n} | ${eur(pt.suma * n)} | ${eur(fondo)} | ${veredicto} | ` +
                `${R.ops[pt.ini].dia} → ${R.ops[pt.fin].dia} (${pt.fin - pt.ini + 1} ops) |`);
  }
}

// ── la mala racha de la regla que sí gana, operación por operación ──────────
{
  const R = REGLAS[3], pt = R.peorTramo;
  console.log(`\n### La mala racha de LOS TRES SÍES, una por una — ${pt.fin - pt.ini + 1} operaciones en ${Math.round((new Date(R.ops[pt.fin].dia) - new Date(R.ops[pt.ini].dia)) / 86400000)} días naturales\n`);
  console.log("| día | SPX 11:00 | SPX cierre | movimiento | crédito | P&L 1 contrato | P&L 3 contratos |");
  console.log("|---|---|---|---|---|---|---|");
  for (let i = pt.ini; i <= pt.fin; i++) {
    const o = R.ops[i], c = o.fila.h["11:00"];
    console.log(`| ${o.dia} | ${c.spot.toFixed(2)} | ${o.fila.cierre.toFixed(2)} | ` +
                `${o.fila.mov >= 0 ? "+" : ""}${o.fila.mov.toFixed(2)}% | ${eur(c.credito)} | ${eur(o.pl)} | ${eur(o.pl * 3)} |`);
  }
}

// ── verificación de los créditos gordos ─────────────────────────────────────
console.log("\n### Verificación: los 5 créditos más altos a las 11:00 (¿son reales o un fallo?)\n");
const gordos = filas.filter((f) => f.h["11:00"]).sort((a, b) => b.h["11:00"].credito - a.h["11:00"].credito).slice(0, 5);
console.log("| día | SPX 11:00 | centro | crédito | ±45 en % del índice | P&L del día |");
console.log("|---|---|---|---|---|---|");
for (const f of gordos) {
  const c = f.h["11:00"];
  console.log(`| ${f.dia} | ${c.spot.toFixed(2)} | ${c.centro} | ${eur(c.credito)} | ` +
              `±${((ANCHO / c.spot) * 100).toFixed(2)}% | ${eur(c.pl)} |`);
}
console.log("\n### Y los créditos negativos (pagar por entrar en un cóndor de crédito)\n");
for (const h of HORAS) {
  const neg = filas.filter((f) => f.h[h] && f.h[h].credito < 0);
  console.log(`  ${h}: ${neg.length} días con crédito negativo. Es real: las patas vendidas ` +
              `tienen bid 0 y las compradas siguen teniendo ask. Es el peaje, no un fallo.`);
}

// ── mitades y tercios de la mejor ───────────────────────────────────────────
console.log("\n### Estabilidad de cada regla (1 contrato)\n");
console.log("| regla | 1ª mitad $/año | 2ª mitad $/año | T1 | T2 | T3 |");
console.log("|---|---|---|---|---|---|");
for (const R of REGLAS) {
  const o = R.ops;
  const m = Math.floor(o.length / 2);
  const a1 = suma(o.slice(0, m).map((x) => x.pl)), a2 = suma(o.slice(m).map((x) => x.pl));
  R.mitad1 = a1 / (ANOS / 2); R.mitad2 = a2 / (ANOS / 2);
  const t = Math.floor(o.length / 3);
  R.tercios = [0, 1, 2].map((k) => suma(o.slice(k * t, k === 2 ? o.length : (k + 1) * t).map((x) => x.pl)) / (ANOS / 3));
  console.log(`| ${R.id} | ${eur(R.mitad1)} | ${eur(R.mitad2)} | ${eur(R.tercios[0])} | ${eur(R.tercios[1])} | ${eur(R.tercios[2])} |`);
}

console.log("\n" + "=".repeat(100));
console.log("  AVISO: este modelo NO simula el precio de HOOD, que es el 85% de la cuenta.");
console.log("  El poder de compra de $73.874 se apoya en esas 500 acciones. Si HOOD cae un 30%");
console.log("  el mismo día que el cóndor pierde, el margen disponible cae con él. Es optimista.");
console.log("=".repeat(100) + "\n");

// ── volcado para el informe ─────────────────────────────────────────────────
const mejor = REGLAS.reduce((a, b) => (RES[b.id][1].porAno > RES[a.id][1].porAno ? b : a));
console.log("JSON_RESUMEN " + JSON.stringify({
  mejorId: mejor.id, mejorNombre: mejor.nombre,
  n: mejor.ops.length, porAno: RES[mejor.id][1].porAno, mediana: mejor.mediana,
  peorDia: mejor.peorDia, caida: RES[mejor.id][1].caidaMax, t: mejor.t, acierto: mejor.acierto,
  sinCinco: mejor.sinCinco, sinCincoPeores: mejor.sinCincoPeores,
  mitad1: mejor.mitad1, mitad2: mejor.mitad2, tercios: mejor.tercios,
  porAnoDetalle: mejor.porAnoDetalle, diasTope: mejor.diasTope,
  tresSies: { porAno: RES.D[1].porAno, n: REGLAS[3].ops.length, caida: RES.D[1].caidaMax },
  huecos: huecos["11:00"] + huecos["13:00"] + huecos["14:00"],
  peorDiaGlobal: { dia: PEOR.dia, hora: PEOR.h, pl: PEOR.pl, mov: PEOR.fila.mov },
}));
