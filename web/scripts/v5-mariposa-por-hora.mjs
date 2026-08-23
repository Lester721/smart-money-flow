// ════════════════════════════════════════════════════════════════════════════════════════════
// LA MARIPOSA DE HIERRO, HORA A HORA
// ════════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ ES LA ESTRUCTURA
//   Una mariposa de hierro 0DTE sobre SPXW: se venden a la vez la call y la put del strike
//   MÁS PEGADO AL PRECIO (las dos patas vendidas en el MISMO strike, al dinero), y se compran
//   una call «A» puntos más arriba y una put «A» puntos más abajo como techo de pérdida.
//   Cobra muchísimo más crédito que el cóndor ±45 — porque vende justo donde el precio está —
//   pero a cambio la tocan casi todos los días: basta que el índice se mueva para entrar en
//   pérdida. El riesgo máximo es A menos el crédito.
//
// POR QUÉ SE MIDE AHORA
//   La mariposa ya fue candidata en este proyecto (61% de acierto, +4,49% sobre riesgo, t=2,12)
//   y murió cuando se le castigó la ejecución un 10%: se quedó en +0,49%. Pero NUNCA se le
//   barrió la hora de entrada. Y el mapa de las 12.780 parejas de horas dice que el reloj de la
//   tarde es una máquina de moler para el COMPRADOR — lo que apunta a que el VENDEDOR debería
//   cobrar ahí. Si la mariposa tiene una hora buena, tiene que estar en la tarde.
//
// QUÉ MIDE ESTE SCRIPT
//   Rejilla completa:  13 horas de entrada (09:35 y luego cada media hora hasta 15:30)
//                    ×  6 anchuras de ala A ∈ {20,30,40,50,60,80}
//                    ×  5 formas de salir (a vencimiento, +30min, +1h, +2h, y a las 15:30)
//   = 390 variantes, cada una sobre los 1.123 días, con bid y ask REALES y el peaje pagado en
//   las cuatro patas y dos veces (al abrir y al cerrar).
//
// EL CASTIGO DE EJECUCIÓN
// LAS MEDIAS SESIONES — un hallazgo del propio control de sanidad
//   Nueve días del período (víspera de Navidad, 3 de julio, día después de Acción de Gracias)
//   la bolsa cierra a las 13:00. El fichero SIGUE trayendo 78 barras hasta las 16:00, pero el
//   SPX está CONGELADO desde las 13:05 y las cotizaciones son las viejas. Entrar ahí es entrar
//   en un mercado cerrado sabiendo ya dónde va a liquidar: dinero gratis fabricado por el dato.
//   Se detectan solos (el spot no se mueve de 13:05 a 16:00) y NO se permite entrar después de
//   las 13:00 en esos nueve días. La primera versión de este script no lo hacía y la variante
//   ganadora (13:30) se llevaba nueve operaciones regaladas.
//
//   El banco ya ejecuta en el peor lado de la horquilla (vende al bid, compra al ask), que es
//   lo más duro que se puede pedir con estos datos. Aun así se repite la medición con un
//   deslizamiento EXTRA del 10% de la horquilla en cada pata y en cada dirección — ocho peajes
//   extra por operación — para ver si el hallazgo aguanta un mercado peor que el de los datos.
//   Y, sólo como referencia histórica, se muestra también qué habría salido midiendo al punto
//   medio castigado un 10% (que es lo que hacía la medición vieja: MUCHO más blando que la
//   regla de la casa).
//
// EL LISTÓN
//   «Los tres síes» reimplementado aquí mismo, sobre exactamente los mismos días, para comparar
//   manzanas con manzanas: a las 11:00, si el SPX está por encima de su media de 5 cierres Y de
//   la de 50, se vende un cóndor ±45 con alas de 50, y sólo si paga $100 o más.
//
// SE EJECUTA:  node --import tsx scripts/v5-mariposa-por-hora.mjs
// ════════════════════════════════════════════════════════════════════════════════════════════

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  diasDisponibles, cargarDia, estructura, idxHora, hayHora, rejilla, condor, resumen, CACHE,
} from "./lib0dte.mjs";

const ANOS = 4.60;                       // 2022-01-03 → 2026-08-10. NO se divide entre 252.

// ── horas de entrada y salidas ──────────────────────────────────────────────────────────────
const HORAS = ["09:35","10:00","10:30","11:00","11:30","12:00","12:30",
               "13:00","13:30","14:00","14:30","15:00","15:30"];
const ALAS  = [20, 30, 40, 50, 60, 80];
// salida: "venc" liquida al intrínseco del cierre; los "+Nm" son barras después de la entrada
const SALIDAS = [
  { id: "venc",  desc: "a vencimiento" },
  { id: "+30m",  saltos: 6,  desc: "cerrando 30 min después" },
  { id: "+1h",   saltos: 12, desc: "cerrando 1 hora después" },
  { id: "+2h",   saltos: 24, desc: "cerrando 2 horas después" },
  { id: "15:30", fija: "15:30", desc: "cerrando a las 15:30" },
];

// ── EJECUTOR CON DESLIZAMIENTO ──────────────────────────────────────────────────────────────
// f = cuántas medias-horquillas te comes en contra en cada pata.
//   f = 1.0  → vendes al bid y compras al ask. ES EXACTAMENTE la regla de la casa (se valida
//              contra estructura() del banco, al céntimo, antes de medir nada).
//   f = 1.2  → un 10% de la horquilla ENTERA peor que eso, en cada pata y cada dirección.
//   f = 0.2  → punto medio castigado un 10% (la vara vieja, mucho más blanda; sólo referencia).
function ejec(dia, iE, iS, patas, f) {
  const be = dia.barras[iE];
  if (!be) return null;

  let credito = 0;                                   // positivo = entra dinero
  for (const p of patas) {
    const par = be.o.get(p.K + p.lado);
    if (!par) return null;                           // un hueco no es un cero
    const [bid, ask] = par;
    if (!(ask > 0)) return null;
    const mid = (bid + ask) / 2, h = (ask - bid) / 2;
    credito += p.dir === -1 ? (mid - f * h) : -(mid + f * h);
  }

  let cierre = 0;                                    // positivo = sale dinero al deshacer
  if (iS === "venc") {
    const S = dia.barras[dia.barras.length - 1].spot;
    for (const p of patas) {
      const intr = p.lado === "C" ? Math.max(0, S - p.K) : Math.max(0, p.K - S);
      cierre += p.dir === -1 ? intr : -intr;
    }
  } else {
    const bs = dia.barras[iS];
    if (!bs || iS <= iE) return null;
    for (const p of patas) {
      const par = bs.o.get(p.K + p.lado);
      if (!par) return null;
      const [bid, ask] = par;
      if (!(ask > 0)) return null;
      const mid = (bid + ask) / 2, h = (ask - bid) / 2;
      cierre += p.dir === -1 ? (mid + f * h) : -(mid - f * h);
    }
  }

  let riesgoMax = 0;
  for (const v of patas.filter((p) => p.dir === -1)) {
    const cobs = patas.filter((p) => p.dir === 1 && p.lado === v.lado);
    if (!cobs.length) return null;
    const anchura = Math.min(...cobs.map((c) => Math.abs(c.K - v.K)));
    riesgoMax = Math.max(riesgoMax, anchura - credito);
  }
  return { credito, cierre, dolares: (credito - cierre) * 100, riesgoMax: riesgoMax * 100 };
}

/** Mariposa de hierro: vende call y put en `centro`, compra las alas a ±A. */
const mariposa = (centro, A) => [
  { K: centro,     lado: "C", dir: -1 },
  { K: centro + A, lado: "C", dir:  1 },
  { K: centro,     lado: "P", dir: -1 },
  { K: centro - A, lado: "P", dir:  1 },
];

// ── ESTADÍSTICA DE UNA SERIE DE DÍAS ────────────────────────────────────────────────────────
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function caja(v) {                                   // caja acumulada y su caída máxima
  let acc = 0, pico = 0, peor = 0, minAcc = 0;
  for (const x of v) { acc += x; if (acc > pico) pico = acc; if (pico - acc > peor) peor = pico - acc;
    if (acc < minAcc) minAcc = acc; }
  return { final: acc, caidaMax: peor, pico, minAcc };
}

function ficha(filas) {                              // filas: [{dia, d}]
  const v = filas.map((f) => f.d);
  const r = resumen(v);
  const c = caja(v);
  const porAno = {};
  for (const f of filas) { const a = f.dia.slice(0, 4); (porAno[a] ??= []).push(f.d); }
  const anos = Object.fromEntries(Object.entries(porAno).map(([a, xs]) =>
    [a, { n: xs.length, dol: xs.reduce((s, x) => s + x, 0) }]));
  const ord = [...v].sort((a, b) => a - b);
  const sin5mej = v.length > 5 ? ord.slice(0, -5).reduce((s, x) => s + x, 0) / ANOS : NaN;
  const sin5peo = v.length > 5 ? ord.slice(5).reduce((s, x) => s + x, 0) / ANOS : NaN;
  const mit = Math.floor(filas.length / 2);
  const t3 = Math.floor(filas.length / 3);
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  const nAnosDe = (fs) => (fs.length / filas.length) * ANOS || 1;
  return {
    n: r.n, media: r.media, t: r.t, aciertos: r.aciertos,
    dolAno: sum(v) / ANOS, mediana: mediana(v), peor: ord[0], mejor: ord[ord.length - 1],
    total: sum(v), caidaMax: c.caidaMax, minAcc: c.minAcc,
    anos, sin5mej, sin5peo,
    mitad1: sum(v.slice(0, mit)) / nAnosDe(filas.slice(0, mit)),
    mitad2: sum(v.slice(mit)) / nAnosDe(filas.slice(mit)),
    tercios: [v.slice(0, t3), v.slice(t3, 2 * t3), v.slice(2 * t3)]
      .map((xs, i, arr) => sum(xs) / ((xs.length / filas.length) * ANOS)),
    p: [0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99]
      .map((q) => ord[Math.min(ord.length - 1, Math.floor(q * ord.length))]),
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════
//  PASADA ÚNICA SOBRE LOS 1.123 DÍAS
// ════════════════════════════════════════════════════════════════════════════════════════════
const dias = diasDisponibles();
console.log(`días disponibles: ${dias.length}  (${dias[0]} → ${dias[dias.length - 1]})`);

const combos = [];                                   // la rejilla completa
for (const h of HORAS) for (const A of ALAS) for (const s of SALIDAS)
  combos.push({ h, A, s: s.id, key: `${h}|${A}|${s.id}`, filas: [], filasCastigo: [],
                filasMid: [], huecos: 0, dentro: 0, creditos: [], perdidaTotal: 0, riesgos: [] });
const porKey = new Map(combos.map((c) => [c.key, c]));

// el listón: «los tres síes» sobre los mismos días
const cierres = [];                                  // cierre del SPX de cada día, en orden
const liston = { filas: [], huecos: 0, saltadosFiltro: 0, saltadosCredito: 0, sinMA: 0, creditos: [] };

// EL PUENTE QUE SE PRUEBA: ¿arregla el filtro de tendencia del listón a la mariposa?
// La mariposa pierde en 2022 (mercado bajista) y gana en 2024-2025 (mercado alcista). El
// filtro MA5+MA50 de «los tres síes» apaga justo los días de caída. Se mide sobre las horas
// buenas y las alas que caben en la cuenta.
const PUENTE = [];
for (const h of HORAS) for (const A of ALAS)
  PUENTE.push({ h, A, key: `${h}|${A}`, filas: [], filasCastigo: [], huecos: 0, saltados: 0,
                creditos: [], dentro: 0, perdidaTotal: 0, riesgos: [] });
const porPuente = new Map(PUENTE.map((p) => [p.key, p]));

let t0 = Date.now(), diasOk = 0, validado = false;
const mediasSesiones = [];
let entradasBloqueadas = 0;

for (const d of dias) {
  const dia = cargarDia(d);
  if (!dia) continue;
  if (dia.barras.length !== 78) { console.log(`  ¡OJO! ${d} tiene ${dia.barras.length} barras`); }
  diasOk++;
  const cierreHoy = dia.barras[dia.barras.length - 1].spot;

  // ── ¿media sesión? el SPX congelado de 13:05 al cierre = la bolsa cerró a las 13:00 ───────
  const i1305 = hayHora(dia, "13:05");
  let ultimaEntrada = dia.barras.length - 1;
  if (i1305 >= 0) {
    const sp = dia.barras.slice(i1305).map((b) => b.spot);
    if (sp.every((x) => x === sp[0])) {
      mediasSesiones.push(d);
      ultimaEntrada = hayHora(dia, "13:00");   // después de esto el mercado ya no existe
    }
  }

  // ── validación una sola vez: mi ejecutor con f=1 == estructura() del banco ────────────────
  if (!validado) {
    const iv = idxHora(dia, "11:00");
    const pat = mariposa(rejilla(dia.barras[iv].spot), 50);
    const a = estructura(dia, iv, "vencimiento", pat);
    const b = ejec(dia, iv, "venc", pat, 1.0);
    const a2 = estructura(dia, iv, iv + 12, pat);
    const b2 = ejec(dia, iv, iv + 12, pat, 1.0);
    const cerca = (x, y) => Math.abs(x - y) < 1e-9;
    if (!a || !b || !cerca(a.dolares, b.dolares) || !cerca(a.riesgoMax, b.riesgoMax) ||
        !a2 || !b2 || !cerca(a2.dolares, b2.dolares)) {
      throw new Error(`el ejecutor NO coincide con estructura(): ` +
        `venc ${a?.dolares} vs ${b?.dolares} | intradía ${a2?.dolares} vs ${b2?.dolares}`);
    }
    console.log(`validación OK — ejec(f=1) == estructura() al céntimo ` +
      `(${d} 11:00 A=50: $${a.dolares.toFixed(2)}, riesgo $${a.riesgoMax.toFixed(2)})`);
    validado = true;
  }

  // ── la rejilla de mariposas ──────────────────────────────────────────────────────────────
  for (const h of HORAS) {
    const iE = hayHora(dia, h);
    if (iE < 0) continue;
    if (iE > ultimaEntrada) { entradasBloqueadas++; continue; }   // mercado ya cerrado
    const centro = rejilla(dia.barras[iE].spot);
    for (const A of ALAS) {
      const pat = mariposa(centro, A);
      const dentro = Math.abs(cierreHoy - centro) < A;
      for (const s of SALIDAS) {
        const c = porKey.get(`${h}|${A}|${s.id}`);
        let iS;
        if (s.id === "venc") iS = "venc";
        else if (s.fija) { const j = hayHora(dia, s.fija); if (j <= iE) continue; iS = j; }
        else { const j = iE + s.saltos; if (j > dia.barras.length - 1) continue; iS = j; }

        const r = ejec(dia, iE, iS, pat, 1.0);
        if (!r) { c.huecos++; continue; }
        const rc = ejec(dia, iE, iS, pat, 1.2);      // 10% de horquilla EXTRA en cada pata
        const rm = ejec(dia, iE, iS, pat, 0.2);      // punto medio castigado 10% (vara vieja)
        c.filas.push({ dia: d, d: r.dolares, rr: r.riesgoMax ? r.dolares / r.riesgoMax : NaN });
        if (rc) c.filasCastigo.push({ dia: d, d: rc.dolares });
        if (rm) c.filasMid.push({ dia: d, d: rm.dolares });
        c.creditos.push(r.credito * 100);
        c.riesgos.push(r.riesgoMax);
        if (dentro) c.dentro++;
        if (r.dolares <= -r.riesgoMax * 0.999) c.perdidaTotal++;
      }
    }
  }

  // ── el listón: «los tres síes» ───────────────────────────────────────────────────────────
  if (cierres.length >= 50) {
    const iv = hayHora(dia, "11:00");
    if (iv >= 0) {
      const S = dia.barras[iv].spot;
      const ma5  = cierres.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const ma50 = cierres.slice(-50).reduce((a, b) => a + b, 0) / 50;
      if (S > ma5 && S > ma50) {
        const pat = condor(rejilla(S), 45, 50);
        const r = ejec(dia, iv, "venc", pat, 1.0);
        if (!r) liston.huecos++;
        else if (r.credito * 100 < 100) liston.saltadosCredito++;
        else { liston.filas.push({ dia: d, d: r.dolares }); liston.creditos.push(r.credito * 100); }
      } else liston.saltadosFiltro++;
    }

    // ── el puente: la misma mariposa, pero sólo los días de tendencia al alza ──────────────
    for (const p of PUENTE) {
      const iE = hayHora(dia, p.h);
      if (iE < 0 || iE > ultimaEntrada) continue;
      const S = dia.barras[iE].spot;
      const ma5  = cierres.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const ma50 = cierres.slice(-50).reduce((a, b) => a + b, 0) / 50;
      if (!(S > ma5 && S > ma50)) { p.saltados++; continue; }
      const centro = rejilla(S);
      const pat = mariposa(centro, p.A);
      const r = ejec(dia, iE, "venc", pat, 1.0);
      if (!r) { p.huecos++; continue; }
      const rc = ejec(dia, iE, "venc", pat, 1.2);
      p.filas.push({ dia: d, d: r.dolares });
      if (rc) p.filasCastigo.push({ dia: d, d: rc.dolares });
      p.creditos.push(r.credito * 100);
      p.riesgos.push(r.riesgoMax);
      if (Math.abs(cierreHoy - centro) < p.A) p.dentro++;
      if (r.dolares <= -r.riesgoMax * 0.999) p.perdidaTotal++;
    }
  } else liston.sinMA++;
  cierres.push(cierreHoy);
}

console.log(`pasada completa: ${diasOk} días en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`medias sesiones detectadas (bolsa cerrada a las 13:00): ${mediasSesiones.length} → ` +
  mediasSesiones.join(" "));
console.log(`entradas bloqueadas por caer en mercado cerrado: ${entradasBloqueadas}\n`);

// ════════════════════════════════════════════════════════════════════════════════════════════
//  EL LISTÓN
// ════════════════════════════════════════════════════════════════════════════════════════════
const fL = ficha(liston.filas);
const credL = liston.creditos.sort((a, b) => a - b);
console.log("═══ LISTÓN — «LOS TRES SÍES» medido aquí, sobre los mismos días ═══");
console.log(`  operaciones: ${fL.n}   (saltadas por filtro MA: ${liston.saltadosFiltro}, ` +
  `por crédito<$100: ${liston.saltadosCredito}, huecos: ${liston.huecos}, sin MA50 aún: ${liston.sinMA})`);
console.log(`  crédito del cóndor ±45/50: min $${credL[0]?.toFixed(0)}  mediana ` +
  `$${mediana(credL).toFixed(0)}  max $${credL[credL.length - 1]?.toFixed(0)}   ← debe caer en $20–$600`);
console.log(`  $/año: $${fL.dolAno.toFixed(0)}   mediana op: $${fL.mediana.toFixed(0)}   ` +
  `peor día: $${fL.peor.toFixed(0)}   caída máx caja: $${fL.caidaMax.toFixed(0)}`);
console.log(`  por año: ${Object.entries(fL.anos).map(([a, x]) => `${a}:$${x.dol.toFixed(0)}`).join("  ")}`);
console.log();

// ════════════════════════════════════════════════════════════════════════════════════════════
//  LA REJILLA DE MARIPOSAS — $/año con precios reales
// ════════════════════════════════════════════════════════════════════════════════════════════
const res = combos.filter((c) => c.filas.length >= 300).map((c) => {
  const f = ficha(c.filas);
  const fc = c.filasCastigo.length ? ficha(c.filasCastigo) : null;
  const fm = c.filasMid.length ? ficha(c.filasMid) : null;
  const cr = [...c.creditos].sort((a, b) => a - b);
  return { ...c, f, fc, fm, credMed: mediana(cr), credMin: cr[0], credMax: cr[cr.length - 1],
           pctDentro: c.dentro / c.filas.length, pctTotal: c.perdidaTotal / c.filas.length,
           riesgoMed: mediana(c.riesgos) };
});

for (const sid of SALIDAS.map((s) => s.id)) {
  const sub = res.filter((r) => r.s === sid);
  if (!sub.length) continue;
  console.log(`═══ SALIDA «${sid}» — $/año por hora de entrada × ala ═══`);
  console.log("hora   " + ALAS.map((a) => String("A=" + a).padStart(10)).join(""));
  for (const h of HORAS) {
    const fila = ALAS.map((A) => {
      const r = sub.find((x) => x.h === h && x.A === A);
      return (r ? Math.round(r.f.dolAno).toLocaleString("en-US") : "—").padStart(10);
    }).join("");
    console.log(h.padEnd(7) + fila);
  }
  console.log();
}

// ── sanidad de créditos y riesgos ───────────────────────────────────────────────────────────
console.log("═══ SANIDAD — crédito y riesgo de la mariposa (entrada 11:00, a vencimiento) ═══");
for (const A of ALAS) {
  const r = res.find((x) => x.h === "11:00" && x.A === A && x.s === "venc");
  if (!r) continue;
  console.log(`  A=${String(A).padStart(2)}  n=${r.f.n}  huecos=${r.huecos}  ` +
    `crédito min/med/max $${r.credMin.toFixed(0)}/$${r.credMed.toFixed(0)}/$${r.credMax.toFixed(0)}  ` +
    `riesgo medio $${r.riesgoMed.toFixed(0)}  (tope teórico $${A * 100})  ` +
    `dentro de alas ${(r.pctDentro * 100).toFixed(1)}%`);
}
console.log();

// ════════════════════════════════════════════════════════════════════════════════════════════
//  LA MEJOR VARIANTE
// ════════════════════════════════════════════════════════════════════════════════════════════
const ord = [...res].sort((a, b) => b.f.dolAno - a.f.dolAno);
console.log("═══ TOP 15 de las 390 variantes, por $/año (precios reales, peaje completo) ═══");
console.log("  hora   A  salida    n   $/año    mediana    peor     caídaMáx  dentro%  t     $/año c/castigo 10%");
for (const r of ord.slice(0, 15)) {
  console.log(`  ${r.h}  ${String(r.A).padStart(2)}  ${r.s.padEnd(6)} ${String(r.f.n).padStart(4)} ` +
    `${("$" + Math.round(r.f.dolAno).toLocaleString("en-US")).padStart(8)} ` +
    `${("$" + Math.round(r.f.mediana)).padStart(8)} ` +
    `${("$" + Math.round(r.f.peor).toLocaleString("en-US")).padStart(9)} ` +
    `${("$" + Math.round(r.f.caidaMax).toLocaleString("en-US")).padStart(10)} ` +
    `${(r.pctDentro * 100).toFixed(1).padStart(6)}  ${r.f.t.toFixed(2).padStart(5)}  ` +
    `${("$" + Math.round(r.fc ? r.fc.dolAno : NaN).toLocaleString("en-US")).padStart(10)}`);
}
console.log();

console.log("═══ TOP 15 tras el castigo del 10% EXTRA de horquilla en las cuatro patas ═══");
const ordC = [...res].filter((r) => r.fc).sort((a, b) => b.fc.dolAno - a.fc.dolAno);
for (const r of ordC.slice(0, 15)) {
  console.log(`  ${r.h}  A=${String(r.A).padStart(2)}  ${r.s.padEnd(6)} ` +
    `real $${Math.round(r.f.dolAno).toLocaleString("en-US")}  →  castigado ` +
    `$${Math.round(r.fc.dolAno).toLocaleString("en-US")}   ` +
    `(vara vieja, medio−10%: $${Math.round(r.fm ? r.fm.dolAno : NaN).toLocaleString("en-US")})`);
}
console.log();

// ── ficha completa de la mejor ──────────────────────────────────────────────────────────────
function detalle(r, titulo) {
  const f = r.f;
  console.log(`═══ ${titulo} ═══`);
  console.log(`  regla: a las ${r.h} vender la mariposa de hierro al dinero con alas de ${r.A} puntos, ` +
    `${SALIDAS.find((s) => s.id === r.s).desc}`);
  console.log(`  n=${f.n}  huecos=${r.huecos}  crédito $${r.credMin.toFixed(0)}/$${r.credMed.toFixed(0)}/$${r.credMax.toFixed(0)} (min/med/max)`);
  console.log(`  riesgo máximo mediano: $${r.riesgoMed.toFixed(0)}`);
  console.log(`  $/año: $${f.dolAno.toFixed(0)}    media/op: $${f.media.toFixed(1)}  t=${f.t.toFixed(2)}  aciertos=${(f.aciertos * 100).toFixed(1)}%`);
  console.log(`  mediana op: $${f.mediana.toFixed(0)}   mejor día: $${f.mejor.toFixed(0)}   PEOR DÍA: $${f.peor.toFixed(0)}`);
  console.log(`  días que pierden el riesgo máximo ENTERO: ${r.perdidaTotal} (${(r.pctTotal * 100).toFixed(1)}%)`);
  console.log(`  días que acaban DENTRO de las alas: ${(r.pctDentro * 100).toFixed(1)}%`);
  console.log(`  caja: final $${f.total.toFixed(0)}   caída máxima $${f.caidaMax.toFixed(0)}   punto más bajo $${f.minAcc.toFixed(0)}`);
  console.log(`  año a año: ${Object.entries(f.anos).map(([a, x]) => `${a}: $${Math.round(x.dol).toLocaleString("en-US")} (n=${x.n})`).join("   ")}`);
  console.log(`  mitades: $${Math.round(f.mitad1).toLocaleString("en-US")}/año  y  $${Math.round(f.mitad2).toLocaleString("en-US")}/año`);
  console.log(`  tercios: ${f.tercios.map((x) => "$" + Math.round(x).toLocaleString("en-US")).join("  ")}`);
  console.log(`  sin los 5 mejores días: $${Math.round(f.sin5mej).toLocaleString("en-US")}/año   ` +
    `sin los 5 peores: $${Math.round(f.sin5peo).toLocaleString("en-US")}/año`);
  console.log(`  reparto (percentiles 1/5/10/25/50/75/90/95/99): ` +
    f.p.map((x) => "$" + Math.round(x)).join(" | "));
  if (r.fc) console.log(`  CON 10% EXTRA de horquilla: $${Math.round(r.fc.dolAno).toLocaleString("en-US")}/año  ` +
    `(caída máx $${Math.round(r.fc.caidaMax).toLocaleString("en-US")}, peor día $${Math.round(r.fc.peor).toLocaleString("en-US")})`);
  if (r.fm) console.log(`  con la vara VIEJA (punto medio −10%): $${Math.round(r.fm.dolAno).toLocaleString("en-US")}/año  ← no es la regla de la casa`);
  console.log();
}

detalle(ord[0], "LA MEJOR VARIANTE DE LAS 390");
if (ordC.length && ordC[0].key !== ord[0].key) detalle(ordC[0], "LA MEJOR TRAS EL CASTIGO");

// la mejor a vencimiento (la forma clásica de la mariposa) por si difiere
const mejorVenc = [...res].filter((r) => r.s === "venc").sort((a, b) => b.f.dolAno - a.f.dolAno)[0];
if (mejorVenc && mejorVenc.key !== ord[0].key) detalle(mejorVenc, "LA MEJOR AGUANTANDO A VENCIMIENTO");

// ── LA QUE DE VERDAD CABE EN LA CUENTA ──────────────────────────────────────────────────────
// Robinhood retiene el ancho entero de la vertical más ancha. Con A=80 son $8.000 de colateral
// y Lester tiene ~$7.977 de EFECTIVO libre: NO cabe. A=50 son $5.000, lo mismo que el cóndor
// que ya opera. Así que la mejor variante realista es la mejor con A ≤ 50.
const mejorCabe = [...res].filter((r) => r.A <= 50).sort((a, b) => b.f.dolAno - a.f.dolAno)[0];
if (mejorCabe) detalle(mejorCabe, "LA MEJOR QUE CABE EN LA CUENTA (ala ≤ 50 → $5.000 de colateral)");

// ── ¿es la hora lo que manda, o el ala? ─────────────────────────────────────────────────────
console.log("═══ ¿MANDA LA HORA? — media de $/año por hora (salida a vencimiento) ═══");
for (const h of HORAS) {
  const sub = res.filter((r) => r.h === h && r.s === "venc");
  if (!sub.length) continue;
  const m = sub.reduce((s, r) => s + r.f.dolAno, 0) / sub.length;
  const tm = sub.reduce((s, r) => s + r.f.t, 0) / sub.length;
  console.log(`  ${h}  media entre las 6 alas: $${Math.round(m).toLocaleString("en-US")}/año   t medio ${tm.toFixed(2)}`);
}
console.log();
console.log("═══ ¿MANDA EL ALA? — media de $/año por ala (salida a vencimiento) ═══");
for (const A of ALAS) {
  const sub = res.filter((r) => r.A === A && r.s === "venc");
  if (!sub.length) continue;
  const m = sub.reduce((s, r) => s + r.f.dolAno, 0) / sub.length;
  const dentro = sub.reduce((s, r) => s + r.pctDentro, 0) / sub.length;
  console.log(`  A=${String(A).padStart(2)}  media entre las 13 horas: $${Math.round(m).toLocaleString("en-US")}/año   ` +
    `dentro de alas ${(dentro * 100).toFixed(1)}%`);
}
console.log();

// ── cuántas de las 390 baten al listón ──────────────────────────────────────────────────────
const baten = res.filter((r) => r.f.dolAno > fL.dolAno);
const batenYCastigo = baten.filter((r) => r.fc && r.fc.dolAno > fL.dolAno);
const batenTodo = batenYCastigo.filter((r) => Object.values(r.f.anos).every((x) => x.dol > 0) &&
  r.f.caidaMax <= fL.caidaMax);
console.log("═══ CUÁNTAS DE LAS 390 BATEN AL LISTÓN ═══");
console.log(`  en $/año con precios reales: ${baten.length} de ${res.length}`);
console.log(`  ...y siguen batiéndolo con el castigo del 10%: ${batenYCastigo.length}`);
console.log(`  ...y además sin ningún año perdedor Y con caída ≤ la del listón: ${batenTodo.length}`);
if (batenTodo.length) for (const r of batenTodo.slice(0, 10))
  console.log(`     ${r.h} A=${r.A} ${r.s}: $${Math.round(r.f.dolAno).toLocaleString("en-US")}/año, caída $${Math.round(r.f.caidaMax).toLocaleString("en-US")}`);
console.log();

// ════════════════════════════════════════════════════════════════════════════════════════════
//  EL PUENTE — ¿la salva el filtro de tendencia del listón?
// ════════════════════════════════════════════════════════════════════════════════════════════
console.log("═══ EL PUENTE — la mariposa SÓLO los días en que el SPX está sobre su MA5 y su MA50 ═══");
console.log("  (el mismo filtro que usa «los tres síes»; el problema de la mariposa es 2022, y ese filtro apaga las caídas)");
const puentes = PUENTE.filter((p) => p.filas.length >= 100).map((p) => {
  const cr = [...p.creditos].sort((a, b) => a - b);
  return { ...p, f: ficha(p.filas), fc: p.filasCastigo.length ? ficha(p.filasCastigo) : null,
    credMin: cr[0], credMed: mediana(cr), credMax: cr[cr.length - 1],
    riesgoMed: mediana(p.riesgos), pctDentro: p.dentro / p.filas.length,
    pctTotal: p.perdidaTotal / p.filas.length };
});
console.log("  $/año por hora × ala (con el filtro, a vencimiento):");
console.log("hora   " + ALAS.map((a) => String("A=" + a).padStart(10)).join(""));
for (const h of HORAS) {
  console.log(h.padEnd(7) + ALAS.map((A) => {
    const p = puentes.find((x) => x.h === h && x.A === A);
    return (p ? Math.round(p.f.dolAno).toLocaleString("en-US") : "—").padStart(10);
  }).join(""));
}
console.log();
console.log("  TOP 10 del puente:");
console.log("  hora   A    n   $/año   mediana    peor    caídaMáx   t    c/castigo   por año");
const ordP = [...puentes].sort((a, b) => b.f.dolAno - a.f.dolAno);
for (const p of ordP.slice(0, 10)) {
  console.log(`  ${p.h}  ${String(p.A).padStart(2)} ${String(p.f.n).padStart(4)} ` +
    `${("$" + Math.round(p.f.dolAno).toLocaleString("en-US")).padStart(8)} ` +
    `${("$" + Math.round(p.f.mediana)).padStart(8)} ` +
    `${("$" + Math.round(p.f.peor).toLocaleString("en-US")).padStart(8)} ` +
    `${("$" + Math.round(p.f.caidaMax).toLocaleString("en-US")).padStart(9)} ` +
    `${p.f.t.toFixed(2).padStart(5)} ` +
    `${("$" + Math.round(p.fc ? p.fc.dolAno : NaN).toLocaleString("en-US")).padStart(9)}   ` +
    Object.entries(p.f.anos).map(([a, x]) => `${a}:$${Math.round(x.dol).toLocaleString("en-US")}`).join(" "));
}
console.log();

function detallePuente(p, titulo) {
  const f = p.f;
  console.log(`═══ ${titulo} ═══`);
  console.log(`  regla: a las ${p.h}, SI el SPX está sobre su media de 5 cierres Y sobre la de 50,`);
  console.log(`         vender la mariposa de hierro al dinero con alas de ${p.A} puntos y aguantar a vencimiento.`);
  console.log(`  opera ${f.n} días de ${f.n + p.saltados + p.huecos} (${(100 * f.n / (f.n + p.saltados + p.huecos)).toFixed(0)}%)  huecos=${p.huecos}`);
  console.log(`  crédito $${p.credMin.toFixed(0)}/$${p.credMed.toFixed(0)}/$${p.credMax.toFixed(0)} (min/med/max)   riesgo máximo mediano $${p.riesgoMed.toFixed(0)}`);
  console.log(`  $/año: $${Math.round(f.dolAno).toLocaleString("en-US")}   media/op $${f.media.toFixed(1)}   t=${f.t.toFixed(2)}   aciertos ${(f.aciertos * 100).toFixed(1)}%`);
  console.log(`  mediana op $${f.mediana.toFixed(0)}   mejor $${f.mejor.toFixed(0)}   PEOR DÍA $${f.peor.toFixed(0)}`);
  console.log(`  días que pierden el riesgo máximo ENTERO: ${p.perdidaTotal} (${(p.pctTotal * 100).toFixed(1)}%)`);
  console.log(`  días que acaban DENTRO de las alas: ${(p.pctDentro * 100).toFixed(1)}%`);
  console.log(`  caja: final $${Math.round(f.total).toLocaleString("en-US")}   CAÍDA MÁXIMA $${Math.round(f.caidaMax).toLocaleString("en-US")}   punto más bajo $${Math.round(f.minAcc).toLocaleString("en-US")}`);
  console.log(`  año a año: ${Object.entries(f.anos).map(([a, x]) => `${a}: $${Math.round(x.dol).toLocaleString("en-US")} (n=${x.n})`).join("   ")}`);
  console.log(`  mitades: $${Math.round(f.mitad1).toLocaleString("en-US")}/año  y  $${Math.round(f.mitad2).toLocaleString("en-US")}/año`);
  console.log(`  tercios: ${f.tercios.map((x) => "$" + Math.round(x).toLocaleString("en-US")).join("  ")}`);
  console.log(`  sin los 5 mejores días: $${Math.round(f.sin5mej).toLocaleString("en-US")}/año   sin los 5 peores: $${Math.round(f.sin5peo).toLocaleString("en-US")}/año`);
  console.log(`  reparto (1/5/10/25/50/75/90/95/99): ` + f.p.map((x) => "$" + Math.round(x)).join(" | "));
  if (p.fc) console.log(`  CON 10% EXTRA de horquilla en las 4 patas: $${Math.round(p.fc.dolAno).toLocaleString("en-US")}/año  ` +
    `(caída máx $${Math.round(p.fc.caidaMax).toLocaleString("en-US")}, t=${p.fc.t.toFixed(2)}, años ` +
    Object.entries(p.fc.anos).map(([a, x]) => `${a}:$${Math.round(x.dol).toLocaleString("en-US")}`).join(" ") + ")");
  console.log(`  LISTÓN: $${Math.round(fL.dolAno).toLocaleString("en-US")}/año con caída $${Math.round(fL.caidaMax).toLocaleString("en-US")} y peor día $${Math.round(fL.peor).toLocaleString("en-US")}`);
  console.log();
}
if (ordP.length) detallePuente(ordP[0], "EL MEJOR PUENTE DE TODOS");
const puenteCabe = [...puentes].filter((p) => p.A <= 50).sort((a, b) => b.f.dolAno - a.f.dolAno)[0];
if (puenteCabe && puenteCabe.key !== ordP[0].key)
  detallePuente(puenteCabe, "EL MEJOR PUENTE QUE CABE EN LA CUENTA (ala ≤ 50 → $5.000 de colateral)");

// ── el listón pide DOS cosas: más dinero Y menos caída. ¿Alguna las cumple las dos? ─────────
const ganaTodo = puentes.filter((p) => p.f.dolAno > fL.dolAno && p.f.caidaMax < fL.caidaMax &&
  Object.values(p.f.anos).every((x) => x.dol > 0) && p.f.sin5mej > 0 && p.A <= 50);
console.log("═══ LAS QUE BATEN AL LISTÓN EN DINERO **Y** EN CAÍDA, sin año perdedor, sin vivir de 5 días,");
console.log("    y que además caben en la cuenta (ala ≤ 50) ═══");
if (!ganaTodo.length) console.log("  ninguna.");
for (const p of ganaTodo.sort((a, b) => b.f.dolAno - a.f.dolAno))
  console.log(`  ${p.h} A=${p.A}: $${Math.round(p.f.dolAno).toLocaleString("en-US")}/año  ` +
    `caída $${Math.round(p.f.caidaMax).toLocaleString("en-US")}  t=${p.f.t.toFixed(2)}`);
console.log();
if (ganaTodo.length) detallePuente(ganaTodo.sort((a, b) => b.f.dolAno - a.f.dolAno)[0],
  "LA ÚNICA QUE PASA LAS CUATRO CRIBAS Y CABE EN LA CUENTA");
console.log();

writeFileSync(join(CACHE, "..", "v5-mariposa-por-hora-salida.json"), JSON.stringify({
  puente: puentes.map((p) => ({ h: p.h, A: p.A, n: p.f.n, dolAno: p.f.dolAno, t: p.f.t,
    caidaMax: p.f.caidaMax, peor: p.f.peor, anos: p.f.anos, mitad1: p.f.mitad1, mitad2: p.f.mitad2 })),
  liston: { ...fL, creditos: { min: credL[0], med: mediana(credL), max: credL[credL.length - 1] } },
  rejilla: res.map((r) => ({ h: r.h, A: r.A, s: r.s, n: r.f.n, huecos: r.huecos,
    dolAno: r.f.dolAno, dolAnoCastigo: r.fc?.dolAno, dolAnoMid: r.fm?.dolAno,
    mediana: r.f.mediana, peor: r.f.peor, caidaMax: r.f.caidaMax, t: r.f.t,
    aciertos: r.f.aciertos, pctDentro: r.pctDentro, pctPerdidaTotal: r.pctTotal,
    credMed: r.credMed, anos: r.f.anos, mitad1: r.f.mitad1, mitad2: r.f.mitad2,
    tercios: r.f.tercios, sin5mej: r.f.sin5mej, sin5peo: r.f.sin5peo })),
}, null, 1));
console.log("salida completa escrita en scripts/v5-mariposa-por-hora-salida.json");
