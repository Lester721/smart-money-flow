// ESTRUCTURA 2 · EL ESPEJO — ¿la asimetría tiene DIRECCIÓN, o sólo importa "más lejos"?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/estructura2-espejo.mjs
//
// ═══ POR QUÉ HACE FALTA ESTE SEGUNDO PASE ═════════════════════════════════════════════════
//
// El primer barrido (estructura2-asimetria.mjs) probó call ∈ {20,25,35} y put ∈ {25,35,50}. El
// mejor resultado fue "call +35 / put −50": caída −$15.176 → −$8.606 conservando el 78% del
// ingreso. Tentador leerlo como "aleja la put, que es el lado que hace daño".
//
// PERO ESA REJILLA NO PUEDE DEMOSTRARLO. Como la call llegaba sólo a +35 y la put a −50, la única
// estructura muy separada que existía era la que tiene la put lejos. **La rejilla traía la
// conclusión puesta.** Con ella no se distingue "la put lejos ayuda" de "lejos ayuda, y da igual
// de qué lado".
//
// Aquí las dos distancias barren EL MISMO conjunto {20, 25, 35, 50}, así que cada estructura
// asimétrica tiene su ESPEJO exacto:
//
//     call +35 / put −50      ←espejo→      call +50 / put −35
//
// Las dos tienen la misma distancia total, el mismo ancho de ala y el mismo colateral. Si el
// mercado "no cae como sube", NO pueden dar lo mismo — y el que gane dice hacia dónde inclinar.
// Si dan lo mismo, la asimetría no existe y lo único que había era la distancia.
//
// Precios REALES (bid al vender, ask al comprar, las cuatro patas), entrada 11:00 ET con el spot
// de las 11:00, liquidación contra el cierre real. Comisión $0,03 por pata × 8.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00";
const COMM = 0.03;

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) return null;
  const enHora = []; let spotFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre: spotFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

// ── LA REJILLA SIMÉTRICA: las dos distancias recorren el MISMO conjunto ──
const DIST = [20, 25, 35, 50];
const ALAS = [30, 50];
const VARIANTES = [];
for (const a of ALAS) for (const dC of DIST) for (const dP of DIST) VARIANTES.push({ id: `C+${dC}/P−${dP} · ala ${a}`, dC, dP, a });
const ID_BASE = "C+25/P−25 · ala 50";
const PRUEBAS = VARIANTES.length;
const PRUEBAS_FAMILIA = 17 + 30 + 11 + 93 + PRUEBAS;

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const porFecha = new Map();
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const spot = C.filas[0].spot;
  if (!(spot > 0)) continue;
  const S = C.cierre;
  const dia = {}; let armable = true;
  for (const v of VARIANTES) {
    const cC = cerca(C.filas, spot + v.dC), cL = cerca(C.filas, cC.K + v.a);
    const pC = cerca(P.filas, spot - v.dP), pL = cerca(P.filas, pC.K - v.a);
    if (cL.K <= cC.K || pL.K >= pC.K) { armable = false; break; }
    const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K;
    const credito = cC.bid + pC.bid - cL.ask - pL.ask;
    const danoCall = Math.min(Math.max(S - cC.K, 0), anchoC);
    const danoPut = Math.min(Math.max(pC.K - S, 0), anchoP);
    dia[v.id] = {
      opera: credito > 0,
      pl: credito > 0 ? (credito - danoCall - danoPut) * 100 - 8 * COMM : 0,
      credito: credito * 100, danoCall: danoCall * 100, danoPut: danoPut * 100,
      colateral: Math.max(anchoC, anchoP) * 100,
      // qué lado mandó ese día: +1 la call, −1 la put, 0 ninguno
      lado: danoCall > danoPut ? 1 : danoPut > danoCall ? -1 : 0,
    };
  }
  if (!armable || !dia[ID_BASE].opera) continue;
  porFecha.set(fecha, { cierre: S, dia });
}

const dias = [...porFecha.keys()].sort();
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]; };
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
const sd = (v) => { const m = media(v); return Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1)); };
function caidaPicoValle(pls) { let a = 0, p = 0, peor = 0; for (const x of pls) { a += x; p = Math.max(p, a); peor = Math.min(peor, a - p); } return peor; }

console.log(`\n═══ ESTRUCTURA 2 · EL ESPEJO · SPXW 0DTE · entrada ${HORA} ET · 1 contrato ═══\n`);
console.log(`Días: ${dias.length}  (${dias[0]} → ${dias[dias.length - 1]}) · ${VARIANTES.length} estructuras (${DIST.length}×${DIST.length}×${ALAS.length})`);
console.log(`Listón de Bonferroni: |t| > ${listonT(PRUEBAS)} para este script · |t| > ${listonT(PRUEBAS_FAMILIA)} para las ${PRUEBAS_FAMILIA} pruebas de la familia sobre estos días`);

const filasBase = dias.map((f) => ({ fecha: f, ...porFecha.get(f).dia[ID_BASE], cierre: porFecha.get(f).cierre }));
radiografia(filasBase, ["pl", "credito", "danoCall", "danoPut", "cierre"], "base C+25/P−25 ala 50", { cerosLegitimos: ["danoCall", "danoPut"] });

function resumen(id, ds = dias) {
  const D = ds.map((f) => porFecha.get(f).dia[id]);
  const pls = D.map((x) => x.pl); const total = suma(pls);
  return {
    n: pls.length, total, alAno: total / (pls.length / 252), acierto: pls.filter((x) => x > 0).length / pls.length,
    peorDia: Math.min(...pls), p1: pct(pls, 0.01), p5: pct(pls, 0.05), ddPico: caidaPicoValle(pls),
    credito: pct(D.map((x) => x.credito), 0.5), colateral: pct(D.map((x) => x.colateral), 0.5),
    t: media(pls) / (sd(pls) / Math.sqrt(pls.length)),
    calmar: total / (pls.length / 252) / Math.abs(caidaPicoValle(pls)),
  };
}
const R = new Map(VARIANTES.map((v) => [v.id, resumen(v.id)]));
const base = R.get(ID_BASE);

// ═════════════════════════════════════════════════════════════════════════════════════════
// 1 · QUIÉN CLAVA EL TOPE — de qué lado son los días malos de la base
// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 1 · LOS DÍAS MALOS DE LA BASE: ¿de qué lado? ═══\n`);
const Bd = dias.map((f) => ({ f, ...porFecha.get(f).dia[ID_BASE] }));
for (const [etiq, umbral] of [["peores 10", 10], ["peores 25", 25], ["peores 50", 50]]) {
  const peores = [...Bd].sort((a, b) => a.pl - b.pl).slice(0, umbral);
  const c = peores.filter((x) => x.lado === 1).length, p = peores.filter((x) => x.lado === -1).length;
  console.log(`  ${etiq} días: ${c} los manda la CALL (subió) · ${p} los manda la PUT (bajó) · P&L medio ${eur(media(peores.map((x) => x.pl)))}`);
}
const maxDanoC = Math.max(...Bd.map((x) => x.danoCall)), maxDanoP = Math.max(...Bd.map((x) => x.danoPut));
console.log(`\n  Daño máximo visto: call ${eur(-maxDanoC)} · put ${eur(-maxDanoP)}  (el tope del ala de 50 son $5.000)`);
console.log(`  Días que CLAVAN el tope entero (≥$4.900 de daño): call ${Bd.filter((x) => x.danoCall >= 4900).length} · put ${Bd.filter((x) => x.danoPut >= 4900).length}`);
console.log(`  Días con daño ≥ $3.000: call ${Bd.filter((x) => x.danoCall >= 3000).length} · put ${Bd.filter((x) => x.danoPut >= 3000).length}`);

// ═════════════════════════════════════════════════════════════════════════════════════════
// 2 · EL ESPEJO — misma distancia total, lados intercambiados
// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 2 · EL ESPEJO — misma distancia total, mismo ala, mismo colateral ═══\n`);
console.log(`Si sólo importase "lejos", las dos columnas darían lo mismo. La flecha marca al ganador.\n`);
console.log("| ala | inclinado a la PUT (call cerca / put lejos) | inclinado a la CALL (call lejos / put cerca) | gana $/año | gana caída | gana peor día |");
console.log("|---|---|---|---|---|---|");
const espejos = [];
for (const a of ALAS) for (let i = 0; i < DIST.length; i++) for (let j = i + 1; j < DIST.length; j++) {
  const corta = DIST[i], larga = DIST[j];
  const idPut = `C+${corta}/P−${larga} · ala ${a}`;    // put LEJOS
  const idCall = `C+${larga}/P−${corta} · ala ${a}`;   // call LEJOS
  const A = R.get(idPut), B = R.get(idCall);
  espejos.push({ a, corta, larga, idPut, idCall, A, B });
  console.log(`| ${a} | ${idPut}: ${eur(A.alAno)}/año, caída ${eur(A.ddPico)}, peor ${eur(A.peorDia)} | ${idCall}: ${eur(B.alAno)}/año, caída ${eur(B.ddPico)}, peor ${eur(B.peorDia)} | ${A.alAno > B.alAno ? "PUT lejos" : "CALL lejos"} | ${Math.abs(A.ddPico) < Math.abs(B.ddPico) ? "PUT lejos" : "CALL lejos"} | ${A.peorDia > B.peorDia ? "PUT lejos" : "CALL lejos"} |`);
}
const gPutDin = espejos.filter((e) => e.A.alAno > e.B.alAno).length;
const gPutDD = espejos.filter((e) => Math.abs(e.A.ddPico) < Math.abs(e.B.ddPico)).length;
const gPutPeor = espejos.filter((e) => e.A.peorDia > e.B.peorDia).length;
console.log(`\n  RECUENTO sobre ${espejos.length} pares espejo:`);
console.log(`    inclinar hacia la PUT (alejar la put) gana en dinero  ${gPutDin}/${espejos.length}`);
console.log(`    inclinar hacia la PUT gana en CAÍDA                   ${gPutDD}/${espejos.length}`);
console.log(`    inclinar hacia la PUT gana en PEOR DÍA                ${gPutPeor}/${espejos.length}`);

// t pareada día a día del contraste espejo, promediado sobre los pares
console.log(`\n  Contraste pareado día a día (P&L de "put lejos" − P&L de "call lejos"):`);
console.log("| par espejo | dif. media/día | dif. $/año | t pareada | ¿supera el listón ${listonT(PRUEBAS_FAMILIA)}? |".replace("${listonT(PRUEBAS_FAMILIA)}", listonT(PRUEBAS_FAMILIA)));
console.log("|---|---|---|---|---|");
for (const e of espejos) {
  const dif = dias.map((f) => porFecha.get(f).dia[e.idPut].pl - porFecha.get(f).dia[e.idCall].pl);
  const t = media(dif) / (sd(dif) / Math.sqrt(dif.length));
  console.log(`| ala ${e.a}: +${e.corta}/−${e.larga} vs +${e.larga}/−${e.corta} | ${eur(media(dif))} | ${eur(media(dif) * 252)} | ${t.toFixed(2)} | ${Math.abs(t) > listonT(PRUEBAS_FAMILIA) ? (t > 0 ? "SÍ, put lejos" : "SÍ, call lejos") : "no"} |`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// 3 · LA REJILLA ENTERA
// ═════════════════════════════════════════════════════════════════════════════════════════
for (const a of ALAS) {
  console.log(`\n\n═══ 3 · REJILLA ala ${a} — filas = distancia de la CALL, columnas = distancia de la PUT ═══\n`);
  for (const met of [["$/año", (r) => eur(r.alAno)], ["caída pico-valle", (r) => eur(r.ddPico)], ["peor día", (r) => eur(r.peorDia)], ["$/año por $ de caída", (r) => r.calmar.toFixed(2)]]) {
    console.log(`  ── ${met[0]} ──`);
    console.log(`  | call \\ put | ${DIST.map((d) => `−${d}`.padStart(9)).join(" | ")} |`);
    console.log(`  |---|${DIST.map(() => "---").join("|")}|`);
    for (const dC of DIST) console.log(`  | +${dC} | ${DIST.map((dP) => String(met[1](R.get(`C+${dC}/P−${dP} · ala ${a}`))).padStart(9)).join(" | ")} |`);
    console.log("");
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// 4 · ¿AGUANTA EL RÉGIMEN DE HOY? — tercios y últimos 6 meses
// El crédito en vivo hoy es ~$220 contra los ~$500 de mediana del backtest. Una estructura que
// sólo funcionaba cuando la prima era gorda no sirve para operar mañana.
// ═════════════════════════════════════════════════════════════════════════════════════════
const k = Math.floor(dias.length / 3);
const TERCIOS = [dias.slice(0, k), dias.slice(k, 2 * k), dias.slice(2 * k)];
const ULT6 = dias.filter((f) => f >= "2026-02-10");
const TOP = [ID_BASE, ...VARIANTES.map((v) => v.id).filter((id) => id !== ID_BASE).sort((x, y) => R.get(y).calmar - R.get(x).calmar).slice(0, 9)];
console.log(`\n\n═══ 4 · ¿AGUANTA EL RÉGIMEN DE HOY? ═══\n`);
console.log(`tercios: ${TERCIOS.map((t) => `${t[0]}→${t[t.length - 1]}`).join(" · ")} · últimos 6 meses: ${ULT6.length} días desde ${ULT6[0]}\n`);
console.log("| estructura | $/año total | T1 | T2 | T3 | últimos 6 meses | créd.med total | créd.med últ.6m | caída | colateral |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const regimen = {};
for (const id of TOP) {
  const r = R.get(id), t3 = TERCIOS.map((t) => resumen(id, t)), u = resumen(id, ULT6);
  regimen[id] = { alAno: r.alAno, tercios: t3.map((x) => x.alAno), ult6: u.alAno, credUlt6: u.credito };
  console.log(`| ${id} | ${eur(r.alAno)} | ${t3.map((x) => eur(x.alAno)).join(" | ")} | ${eur(u.alAno)} | ${eur(r.credito)} | ${eur(u.credito)} | ${eur(r.ddPico)} | ${eur(r.colateral)} |`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// 5 · LO QUE CABE EN EL EFECTIVO — la restricción de verdad
// ═════════════════════════════════════════════════════════════════════════════════════════
const EFECTIVO = 7977;
console.log(`\n\n═══ 5 · LO QUE CABE EN LOS ${eur(EFECTIVO)} DE EFECTIVO ═══\n`);
console.log(`Las pérdidas salen de EFECTIVO, no del poder de compra. Una estructura cuya peor racha`);
console.log(`pasa de ${eur(EFECTIVO)} obliga a pedir margen contra HOOD a un tipo que nadie ha medido.\n`);
console.log("| estructura | caída | ¿cabe en efectivo? | colateral | $/año | $/año por $ de caída | últimos 6 meses |");
console.log("|---|---|---|---|---|---|---|");
const caben = VARIANTES.map((v) => ({ v, r: R.get(v.id), u: resumen(v.id, ULT6) })).sort((a, b) => b.r.calmar - a.r.calmar);
for (const x of caben.slice(0, 12)) {
  console.log(`| ${x.v.id} | ${eur(x.r.ddPico)} | ${Math.abs(x.r.ddPico) <= EFECTIVO ? "SÍ" : "no, falta " + eur(Math.abs(x.r.ddPico) - EFECTIVO)} | ${eur(x.r.colateral)} | ${eur(x.r.alAno)} | ${x.r.calmar.toFixed(2)} | ${eur(x.u.alAno)} |`);
}
console.log(`\n  base ${ID_BASE}: caída ${eur(base.ddPico)} → falta ${eur(Math.abs(base.ddPico) - EFECTIVO)} de efectivo para aguantarla`);
const cabenTodas = VARIANTES.filter((v) => Math.abs(R.get(v.id).ddPico) <= EFECTIVO);
console.log(`  De las ${VARIANTES.length} estructuras, ${cabenTodas.length} caben en el efectivo:`);
for (const v of cabenTodas.sort((a, b) => R.get(b.id).alAno - R.get(a.id).alAno)) {
  const r = R.get(v.id), u = resumen(v.id, ULT6);
  console.log(`     ${v.id.padEnd(24)} ${eur(r.alAno).padStart(9)}/año · caída ${eur(r.ddPico)} · peor día ${eur(r.peorDia)} · colateral ${eur(r.colateral)} · últ.6m ${eur(u.alAno)}/año`);
}

writeFileSync("scripts/estructura2-espejo.json", JSON.stringify({
  dias: dias.length, periodo: [dias[0], dias[dias.length - 1]], pruebas: PRUEBAS, pruebasFamilia: PRUEBAS_FAMILIA,
  base: { id: ID_BASE, ...base },
  variantes: Object.fromEntries(VARIANTES.map((v) => [v.id, { ...v, ...R.get(v.id) }])),
  espejos: espejos.map((e) => ({ ala: e.a, corta: e.corta, larga: e.larga, putLejos: e.A, callLejos: e.B })),
  recuentoEspejo: { n: espejos.length, ganaPutLejosDinero: gPutDin, ganaPutLejosCaida: gPutDD, ganaPutLejosPeorDia: gPutPeor },
  regimen, cabenEnEfectivo: cabenTodas.map((v) => v.id),
}, null, 2));
console.log(`\n(detalle en scripts/estructura2-espejo.json)`);
