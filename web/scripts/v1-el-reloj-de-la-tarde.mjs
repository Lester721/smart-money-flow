// ═══════════════════════════════════════════════════════════════════════════════════════════
// EL MAPA DEL LADO CORTO, HORA A HORA — «¿entrar más tarde paga más?»
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ MIDE, EN CASTELLANO LLANO
// -----------------------------
// Su cóndor vivo («los tres síes») entra a las 11:00. El mapa de COMPRAR 0DTE dice que el reloj
// muele más fuerte por la tarde: una call al dinero comprada a las 15:05 pierde el 8,9% de la
// prima en una sola operación. Si comprar por la tarde es lo que más pierde, VENDER por la tarde
// debería ser lo que más gana. Esta es la pregunta madre del encargo.
//
// Así que aquí se vende SU cóndor exacto — ±45 puntos, alas de 50, centrado en el múltiplo de 5
// más cercano al SPX de ese momento — entrando en CADA una de las 66 barras de 09:35 a 15:00,
// aguantando hasta vencimiento, los 1.123 días, SIN NINGÚN FILTRO. Un contrato.
//
// EL CONTROL QUE DECIDE
// ---------------------
// Entrar tarde cobra menos crédito, pero también corre menos riesgo y menos horas. Por eso no
// basta el dinero: se mide también
//   · el retorno sobre el riesgo máximo real de la estructura,
//   · el retorno por hora de exposición,
//   · y sobre todo el DINERO POR DÓLAR DE COLATERAL REAL, que en Robinhood son $5.000 fijos por
//     cóndor (una vertical al ancho completo de 50 puntos) — el ala no cambia con la hora, así
//     que el colateral tampoco. Con $7.977 de efectivo libre eso son 1 contrato, no 2.
// Y se cuenta cuántos días el crédito NO llega a $100 a cada hora: una regla que no puede
// ejecutarse no gana nada, por muy bonita que salga la casilla.
//
// EL LISTÓN
// ---------
// Se mide TAMBIÉN «los tres síes» (11:00, SPX sobre su media de 5 días y sobre la de 50, mismo
// cóndor, sólo si paga $100 o más) sobre EXACTAMENTE los mismos días y con el mismo código, para
// comparar manzanas con manzanas en vez de contra un número recordado de otro informe.
//
// REGLAS DE LA CASA QUE SE CUMPLEN AQUÍ
// -------------------------------------
//  · precios reales, peaje en las cuatro patas y dos veces (lo hace estructura(), no se toca)
//  · sólo el pasado: las medias de 5 y 50 días usan CIERRES DE DÍAS ANTERIORES, nunca el de hoy
//  · un hueco no es un cero: se cuentan aparte
//  · 1.123 días = 2022-01-03 → 2026-08-10 = 4,60 años (NO dividir entre 252)
//  · la media no basta: mediana, peor día, días de pérdida máxima entera, caja acumulada y su
//    caída, año a año, mitades, tercios y qué pasa al quitar los 5 mejores y los 5 peores días.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { diasDisponibles, cargarDia, estructura, condor, rejilla, hayHora, resumen } from "./lib0dte.mjs";

const ANCHO = 45, ALA = 50;
const ANOS = 4.60;                 // 2022-01-03 → 2026-08-10, calendario REAL
const COLATERAL = 5000;            // $ que retiene Robinhood por cóndor (vertical al ancho completo)
const EFECTIVO = 7977;             // efectivo libre de la cuenta

// las 66 horas de entrada, de 09:35 a 15:00
const HORAS = [];
for (let m = 9 * 60 + 35; m <= 15 * 60; m += 5) {
  HORAS.push(String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"));
}

// ── utilidades de estadística descriptiva ────────────────────────────────────────────────
const mediana = (v) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const suma = (v) => v.reduce((a, b) => a + b, 0);

function caidaMaxima(serie) {          // serie = $ de cada operación en orden cronológico
  let caja = 0, pico = 0, peor = 0;
  for (const x of serie) { caja += x; if (caja > pico) pico = caja; if (pico - caja > peor) peor = pico - caja; }
  return peor;
}

function porAno(dias, dolares) {
  const acc = new Map();
  for (let i = 0; i < dias.length; i++) {
    const a = dias[i].slice(0, 4);
    acc.set(a, (acc.get(a) || 0) + dolares[i]);
  }
  return [...acc.entries()].sort();
}

function trozo(dolares, ini, fin) {    // $/año de un trozo, escalando por su fracción de días
  const sub = dolares.slice(ini, fin);
  const frac = sub.length / dolares.length;
  return suma(sub) / (ANOS * frac);
}

// ═══ PASADA ÚNICA SOBRE LOS 1.123 DÍAS ════════════════════════════════════════════════════
const dias = diasDisponibles();
console.log(`días disponibles: ${dias.length}  (${dias[0]} → ${dias[dias.length - 1]})`);

// acumuladores por hora de entrada
const R = new Map();
for (const h of HORAS) R.set(h, { dia: [], dol: [], cred: [], riesgo: [], rsr: [], huecos: 0, sinHora: 0 });

// listón: los tres síes, medido por mí
const cierres = [];       // cierre diario del SPX (16:00) de días ANTERIORES
const tsDia = [], tsDol = [];
let tsNoCredito = 0, tsNoTendencia = 0, tsSinHistoria = 0, tsHuecos = 0;

let cargados = 0, nulos = 0;
const t0 = Date.now();

for (const d of dias) {
  const D = cargarDia(d);
  if (!D) { nulos++; continue; }
  cargados++;

  // ── el mapa: 66 horas de entrada, salida a vencimiento, sin filtro ──
  for (const h of HORAS) {
    const i = hayHora(D, h);
    const r = R.get(h);
    if (i < 0) { r.sinHora++; continue; }
    const centro = rejilla(D.barras[i].spot);
    const e = estructura(D, i, "vencimiento", condor(centro, ANCHO, ALA));
    if (!e) { r.huecos++; continue; }
    r.dia.push(d); r.dol.push(e.dolares); r.cred.push(e.credito * 100);
    r.riesgo.push(e.riesgoMax); r.rsr.push(e.retSobreRiesgo);
  }

  // ── el listón: los tres síes a las 11:00, con medias de días ANTERIORES ──
  const i11 = hayHora(D, "11:00");
  if (i11 >= 0) {
    if (cierres.length < 50) {
      tsSinHistoria++;
    } else {
      const ma5 = suma(cierres.slice(-5)) / 5;
      const ma50 = suma(cierres.slice(-50)) / 50;
      const spot = D.barras[i11].spot;
      if (spot > ma5 && spot > ma50) {
        const e = estructura(D, i11, "vencimiento", condor(rejilla(spot), ANCHO, ALA));
        if (!e) tsHuecos++;
        else if (e.credito * 100 < 100) tsNoCredito++;
        else { tsDia.push(d); tsDol.push(e.dolares); }
      } else tsNoTendencia++;
    }
  }

  cierres.push(D.barras[D.barras.length - 1].spot);   // el cierre de HOY entra DESPUÉS de usarse
}

console.log(`cargados ${cargados}, nulos ${nulos}, en ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);

// ═══ SANIDAD ══════════════════════════════════════════════════════════════════════════════
{
  const r = R.get("11:00");
  console.log("SANIDAD (11:00, sin filtro):");
  console.log(`  operaciones ${r.dol.length}, huecos ${r.huecos}, días sin esa barra ${r.sinHora}`);
  console.log(`  crédito  min $${Math.min(...r.cred).toFixed(0)}  mediana $${mediana(r.cred).toFixed(0)}  max $${Math.max(...r.cred).toFixed(0)}`);
  console.log(`  riesgoMax mediana $${mediana(r.riesgo).toFixed(0)}  (debe ser 5000 − crédito)`);
  console.log(`  peor día $${Math.min(...r.dol).toFixed(0)}   mejor día $${Math.max(...r.dol).toFixed(0)}\n`);
}

// ── EL DÉBITO IMPOSIBLE ─────────────────────────────────────────────────────────────────
// Un cóndor de crédito de 50 puntos de ala no puede valer más de $5.000, así que perder
// $13.150 en uno es imposible… salvo que la ENTRADA se pague con dinero. Y eso es lo que
// pasa cuando las horquillas se abren: el 2025-04-09 a las 13:20 (el día del +9,5%) la 5190C
// cotizaba 2,5 / 25 y la 5100P 1 / 110. Vendiendo al bid y comprando al ask, abrir el cóndor
// cuesta $8.150 de DÉBITO. Ningún humano paga 85 puntos por una estructura que puede cobrar
// como mucho 50 — el precio existe, pero la operación no. No se borra el dato: se cuenta,
// se enseña, y se pone la puerta mínima que cualquiera pondría (abrir sólo si ENTRA dinero).
{
  let neg = 0, peorCred = 0, maxCred = 0, total = 0;
  for (const h of HORAS) {
    const r = R.get(h);
    total += r.cred.length;
    for (const c of r.cred) { if (c <= 0) neg++; if (c < peorCred) peorCred = c; if (c > maxCred) maxCred = c; }
  }
  console.log(`ENTRADAS CON DÉBITO (crédito ≤ 0): ${neg} de ${total} (${(neg / total * 100).toFixed(2)}%)`);
  console.log(`  peor débito de entrada $${peorCred.toFixed(0)} · mayor crédito $${maxCred.toFixed(0)} (tope teórico $5.000)\n`);
}

// ═══ EL MAPA ══════════════════════════════════════════════════════════════════════════════
console.log("═══ MAPA HORA A HORA — cóndor ±45 alas 50, a vencimiento, sin filtro, 1 contrato ═══");
console.log("hora   n   huec   $/año   medi   peor$   caída$   %acier   t     cred$  <$100  perdTot  ret/riesgo  $/hora  $/año-por-$col");
const tabla = [];
for (const h of HORAS) {
  const r = R.get(h);
  const n = r.dol.length;
  if (!n) continue;
  const dpa = suma(r.dol) / ANOS;
  const st = resumen(r.dol);
  const perdTot = r.dol.filter((x, k) => x <= -r.riesgo[k] * 0.999).length;
  const bajo100 = r.cred.filter((x) => x < 100).length;
  const horasExp = (16 * 60 - (+h.slice(0, 2) * 60 + +h.slice(3))) / 60;
  const fila = {
    h, n, huecos: r.huecos, dpa,
    mediana: mediana(r.dol), peor: Math.min(...r.dol), caida: caidaMaxima(r.dol),
    aciertos: st.aciertos, t: st.t,
    credMed: mediana(r.cred), bajo100, perdTot,
    rsr: suma(r.rsr) / n, porHora: st.media / horasExp,
    porColateral: dpa / COLATERAL,
    anos: porAno(r.dia, r.dol),
    dol: r.dol, dias: r.dia, riesgo: r.riesgo,
  };
  tabla.push(fila);
  console.log(
    `${h} ${String(n).padStart(4)} ${String(r.huecos).padStart(4)} ` +
    `${dpa.toFixed(0).padStart(8)} ${fila.mediana.toFixed(0).padStart(6)} ${fila.peor.toFixed(0).padStart(7)} ` +
    `${fila.caida.toFixed(0).padStart(8)} ${(fila.aciertos * 100).toFixed(1).padStart(6)} ${fila.t.toFixed(2).padStart(6)} ` +
    `${fila.credMed.toFixed(0).padStart(7)} ${String(bajo100).padStart(6)} ${String(perdTot).padStart(7)} ` +
    `${(fila.rsr * 100).toFixed(2).padStart(10)}% ${fila.porHora.toFixed(1).padStart(8)} ${fila.porColateral.toFixed(3).padStart(12)}`);
}

// ═══ HORA A HORA, AÑO A AÑO ═══════════════════════════════════════════════════════════════
console.log("\n═══ AÑO A AÑO (sólo las horas en punto y la media hora, para que se lea) ═══");
const destac = HORAS.filter((h) => h.endsWith(":00") || h.endsWith(":30"));
const anosLista = [...new Set(tabla[0].anos.map((a) => a[0]))];
console.log("hora    " + anosLista.map((a) => a.padStart(9)).join(""));
for (const h of destac) {
  const f = tabla.find((x) => x.h === h);
  if (!f) continue;
  const m = new Map(f.anos);
  console.log(h + "  " + anosLista.map((a) => (m.get(a) || 0).toFixed(0).padStart(9)).join(""));
}

// ═══ LA MEJOR HORA, EN DETALLE ════════════════════════════════════════════════════════════
const mejor = tabla.reduce((a, b) => (b.dpa > a.dpa ? b : a));
function detalle(f) {
  const n = f.dol.length;
  const orden = [...f.dol].sort((a, b) => a - b);
  const sin5mej = (suma(f.dol) - suma(orden.slice(-5))) / ANOS;
  const sin5peo = (suma(f.dol) - suma(orden.slice(0, 5))) / ANOS;
  const m1 = trozo(f.dol, 0, Math.floor(n / 2)), m2 = trozo(f.dol, Math.floor(n / 2), n);
  const t1 = trozo(f.dol, 0, Math.floor(n / 3));
  const t2 = trozo(f.dol, Math.floor(n / 3), Math.floor((2 * n) / 3));
  const t3 = trozo(f.dol, Math.floor((2 * n) / 3), n);
  return { sin5mej, sin5peo, m1, m2, t1, t2, t3 };
}
for (const f of [mejor, tabla.find((x) => x.h === "11:00"), tabla.find((x) => x.h === "14:00"), tabla.find((x) => x.h === "15:00")]) {
  if (!f) continue;
  const d = detalle(f);
  console.log(`\n── ${f.h} ── n=${f.n} $/año=${f.dpa.toFixed(0)} t=${f.t.toFixed(2)} aciertos=${(f.aciertos * 100).toFixed(1)}%`);
  console.log(`   mediana $${f.mediana.toFixed(0)} · peor día $${f.peor.toFixed(0)} · caída máx $${f.caida.toFixed(0)} · pérdida total ${f.perdTot} días`);
  console.log(`   sin los 5 MEJORES: $${d.sin5mej.toFixed(0)}/año · sin los 5 PEORES: $${d.sin5peo.toFixed(0)}/año`);
  console.log(`   mitades: $${d.m1.toFixed(0)} / $${d.m2.toFixed(0)}   tercios: $${d.t1.toFixed(0)} / $${d.t2.toFixed(0)} / $${d.t3.toFixed(0)}`);
  console.log(`   años: ${f.anos.map(([a, v]) => a + "=" + v.toFixed(0)).join("  ")}`);
}

// ═══ EL CONTROL DEL TAMAÑO ════════════════════════════════════════════════════════════════
console.log("\n═══ ¿DOS CONTRATOS TARDE BATEN A UNO A LAS 11:00? ═══");
console.log(`colateral Robinhood por cóndor: $${COLATERAL} (ala de ${ALA} pts) — NO cambia con la hora`);
console.log(`efectivo libre $${EFECTIVO} → contratos que caben: ${Math.floor(EFECTIVO / COLATERAL)}`);
for (const h of ["11:00", "13:00", "14:00", "15:00"]) {
  const f = tabla.find((x) => x.h === h);
  if (!f) continue;
  const cabe = Math.floor(EFECTIVO / COLATERAL);
  console.log(`  ${h}: $${f.dpa.toFixed(0)}/año × ${cabe} contrato(s) = $${(f.dpa * cabe).toFixed(0)}/año · caída ×${cabe} = $${(f.caida * cabe).toFixed(0)}`);
}
// y el mismo cálculo SI el colateral siguiera al riesgo real (no es el caso en Robinhood, es referencia)
console.log("  (referencia teórica, NO ejecutable en Robinhood: si el colateral siguiera al riesgo real de la estructura)");
for (const h of ["11:00", "14:00", "15:00"]) {
  const f = tabla.find((x) => x.h === h);
  if (!f) continue;
  const rmed = mediana(f.riesgo);
  console.log(`  ${h}: riesgo real mediano $${rmed.toFixed(0)} → $${(f.dpa / rmed * 100).toFixed(2)} al año por cada $100 arriesgados`);
}

// ═══ EL LISTÓN, MEDIDO POR MÍ ═════════════════════════════════════════════════════════════
console.log("\n═══ LISTÓN «LOS TRES SÍES» medido aquí, mismos días, mismo código ═══");
const tsSt = resumen(tsDol);
console.log(`  opera ${tsDol.length} días de ${cargados} · descartados: ${tsSinHistoria} sin 50 días de historia, ` +
  `${tsNoTendencia} por tendencia, ${tsNoCredito} por crédito <$100, ${tsHuecos} huecos`);
console.log(`  $/año ${(suma(tsDol) / ANOS).toFixed(0)} · mediana $${mediana(tsDol).toFixed(0)} · peor día $${Math.min(...tsDol).toFixed(0)}`);
console.log(`  caída máxima $${caidaMaxima(tsDol).toFixed(0)} · aciertos ${(tsSt.aciertos * 100).toFixed(1)}% · t ${tsSt.t.toFixed(2)}`);
console.log(`  años: ${porAno(tsDia, tsDol).map(([a, v]) => a + "=" + v.toFixed(0)).join("  ")}`);

// ═══ LOS DOS MAPAS CON PUERTA DE CRÉDITO ══════════════════════════════════════════════════
function mapaConPuerta(minCred, titulo) {
  console.log(`\n═══ ${titulo} ═══`);
  console.log("hora    n  opera%    $/año   medi   peor$   caída$  %acier     t   por año…");
  const filas = [];
  for (const h of HORAS) {
    const r = R.get(h);
    const idx = r.cred.map((c, k) => (c >= minCred ? k : -1)).filter((k) => k >= 0);
    const dol = idx.map((k) => r.dol[k]), dd = idx.map((k) => r.dia[k]);
    if (dol.length < 20) { console.log(`${h} ${String(dol.length).padStart(4)}  (muestra insuficiente)`); continue; }
    const st = resumen(dol);
    const perdTot = idx.filter((k) => r.dol[k] <= -r.riesgo[k] * 0.999).length;
    const f = { h, n: dol.length, opera: dol.length / r.cred.length, dpa: suma(dol) / ANOS,
                mediana: mediana(dol), peor: Math.min(...dol), caida: caidaMaxima(dol),
                aciertos: st.aciertos, t: st.t, perdTot, dol, dias: dd, anos: porAno(dd, dol) };
    filas.push(f);
    console.log(`${h} ${String(f.n).padStart(4)} ${(f.opera * 100).toFixed(0).padStart(5)}% ` +
      `${f.dpa.toFixed(0).padStart(8)} ${f.mediana.toFixed(0).padStart(6)} ${f.peor.toFixed(0).padStart(7)} ` +
      `${f.caida.toFixed(0).padStart(8)} ${(f.aciertos * 100).toFixed(1).padStart(6)} ${f.t.toFixed(2).padStart(6)}   ` +
      f.anos.map(([a, v]) => `${a}:${v.toFixed(0)}`).join(" "));
  }
  return filas;
}
const conPuerta0 = mapaConPuerta(0.01, "PUERTA MÍNIMA: sólo si al abrir ENTRA dinero (crédito > 0)");
const conPuerta100 = mapaConPuerta(100, "PUERTA DE SU REGLA: sólo si paga ≥$100 (sin filtro de tendencia)");

// ── detalle de la mejor hora bajo la puerta ejecutable de $100 ──
const mej100 = conPuerta100.reduce((a, b) => (b.dpa > a.dpa ? b : a));
const d100 = detalle(mej100);
console.log(`\n── MEJOR CON PUERTA DE $100: ${mej100.h} ── n=${mej100.n} (opera el ${(mej100.opera * 100).toFixed(0)}% de los días)`);
console.log(`   $/año ${mej100.dpa.toFixed(0)} · t ${mej100.t.toFixed(2)} · aciertos ${(mej100.aciertos * 100).toFixed(1)}%`);
console.log(`   mediana $${mej100.mediana.toFixed(0)} · peor día $${mej100.peor.toFixed(0)} · caída máx $${mej100.caida.toFixed(0)} · pérdida total ${mej100.perdTot} días`);
console.log(`   sin los 5 MEJORES: $${d100.sin5mej.toFixed(0)}/año · sin los 5 PEORES: $${d100.sin5peo.toFixed(0)}/año`);
console.log(`   mitades: $${d100.m1.toFixed(0)} / $${d100.m2.toFixed(0)}   tercios: $${d100.t1.toFixed(0)} / $${d100.t2.toFixed(0)} / $${d100.t3.toFixed(0)}`);
console.log(`   años: ${mej100.anos.map(([a, v]) => a + "=" + v.toFixed(0)).join("  ")}`);
// y la de las 11:00 con la misma puerta, que es su regla sin el filtro de tendencia
{
  const f = conPuerta100.find((x) => x.h === "11:00"), d = detalle(f);
  console.log(`── 11:00 con puerta de $100 ── $/año ${f.dpa.toFixed(0)} · caída $${f.caida.toFixed(0)} · t ${f.t.toFixed(2)}`);
  console.log(`   mitades: $${d.m1.toFixed(0)} / $${d.m2.toFixed(0)}  ·  años: ${f.anos.map(([a, v]) => a + "=" + v.toFixed(0)).join("  ")}`);
}

// ═══ resumen máquina ══════════════════════════════════════════════════════════════════════
const dm = detalle(mejor);
const dLis = detalle({ dol: tsDol });
console.log("\n===JSON===");
console.log(JSON.stringify({
  sinFiltro: {
    mejorHora: mejor.h, n: mejor.n, huecos: mejor.huecos, dpa: mejor.dpa,
    mediana: mejor.mediana, peor: mejor.peor, caida: mejor.caida, t: mejor.t,
    aciertos: mejor.aciertos, perdTot: mejor.perdTot, ...dm, anos: mejor.anos,
  },
  conPuerta100: {
    mejorHora: mej100.h, n: mej100.n, opera: mej100.opera, dpa: mej100.dpa,
    mediana: mej100.mediana, peor: mej100.peor, caida: mej100.caida, t: mej100.t,
    aciertos: mej100.aciertos, perdTot: mej100.perdTot, ...d100, anos: mej100.anos,
  },
  liston: {
    n: tsDol.length, dpa: suma(tsDol) / ANOS, caida: caidaMaxima(tsDol),
    mediana: mediana(tsDol), peor: Math.min(...tsDol), t: tsSt.t, aciertos: tsSt.aciertos,
    ...dLis, anos: porAno(tsDia, tsDol),
  },
  huecosTotales: HORAS.reduce((a, h) => a + R.get(h).huecos, 0),
  operacionesTotales: HORAS.reduce((a, h) => a + R.get(h).dol.length, 0),
}, null, 1));
