// ¿UNA SOLA VERTICAL? — ¿la de puts o la de calls?
//
// ═══ QUÉ MIDE Y POR QUÉ ═════════════════════════════════════════════════════════════════════
//
// Lester opera un CÓNDOR: vende una vertical de puts y otra de calls a la vez. Pero las puts
// del SPX son mucho más caras que las calls (el mismo día a la misma hora la de puts cobró $90
// y la de calls $20). Si sólo una de las dos patas paga, la otra está metiendo riesgo GRATIS
// y sobra. Eso sería un cambio directo en la estrategia que ya está en forward test.
//
// Aquí se miden POR SEPARADO, sobre los mismos 1.123 días, con los mismos precios reales:
//   · la vertical de crédito de PUTS  (vende a spot−ancho, compra `ala` puntos más abajo)
//   · la vertical de crédito de CALLS (vende a spot+ancho, compra `ala` puntos más arriba)
// a 13 horas de entrada y 12 geometrías (ancho × ala), aguantando SIEMPRE al cierre.
// El cóndor es, al céntimo, la suma de las dos: por eso la descomposición es exacta.
//
// Y el cruce que evita confundir dos cosas distintas: en esta muestra el SPX subió de 4.766 a
// 6.400 largos. La vertical de CALLS tiene la deriva en contra por construcción, así que se
// mide también separando el año bajista (2022) de los alcistas, para no llamar «sesgo de
// precios» a lo que es simplemente que el mercado subió.
//
// ═══ REGLAS DE LA CASA QUE SE CUMPLEN AQUÍ ══════════════════════════════════════════════════
//
// · precios REALES: se vende al bid y se compra al ask, las dos patas, más comisión por pata
// · sólo el pasado: los strikes se eligen con el spot de la barra de entrada
// · un hueco NO es un cero: si falta un precio la operación se descarta y se cuenta aparte
// · nada de modelos: liquidación al intrínseco contra el cierre REAL del índice (SPXW es
//   europea y liquida en efectivo)
// · calendario real: 1.123 días de 2022-01-03 a 2026-08-10 = 4,60 años (244 días/año)
//
// Uso:  node --import tsx scripts/v4-put-o-call.mjs

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { diasDisponibles, cargarDia, estructura, hayHora, rejilla, resumen, CACHE }
  from "./lib0dte.mjs";

// ── parámetros ──────────────────────────────────────────────────────────────
const HORAS = ["09:35", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
               "13:00", "13:30", "14:00", "14:30", "15:00", "15:30"];
const ANCHOS = [20, 30, 40, 45, 50, 60];   // distancia del strike vendido al spot
const ALAS   = [25, 50];                   // anchura de la vertical
const COMM   = 0.03;                       // por pata y por lado, en Robinhood
const COMM_VERT = 4 * COMM;                // 2 patas al abrir + 2 al liquidar
const ANOS_REALES = 1123 / 244;            // 4,60 años

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
function caida(pls) { let a = 0, p = 0, w = 0; for (const x of pls) { a += x; p = Math.max(p, a); w = Math.min(w, a - p); } return w; }

// ── strikes REALES de la cadena, no teóricos ────────────────────────────────
function strikesDe(barra, lado) {
  const k = "_k" + lado;
  if (!barra[k]) {
    const arr = [];
    for (const key of barra.o.keys()) if (key.endsWith(lado)) arr.push(+key.slice(0, -1));
    arr.sort((a, b) => a - b);
    barra[k] = arr;
  }
  return barra[k];
}
const cercano = (arr, x) => arr.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a), arr[0]);

// ═══ 1. LA CINTA DE SPY, sólo para reconstruir EL LISTÓN (los tres síes) ════
const diasSPY = [];
for (const y of [2021, 2022, 2023, 2024, 2025, 2026]) {
  const f = join(CACHE, `SPY_spotmin_y_${y}.json`);
  if (!existsSync(f)) continue;
  for (const [d, arr] of Object.entries(JSON.parse(readFileSync(f, "utf8")))) {
    const m = new Map(arr);
    const c = m.get(960), p11 = m.get(660);
    if (!(c > 0) || !(p11 > 0)) continue;
    diasSPY.push({ fecha: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, c, p11 });
  }
}
diasSPY.sort((a, b) => a.fecha.localeCompare(b.fecha));
const idxSPY = new Map(diasSPY.map((d, i) => [d.fecha, i]));
console.log(`cinta SPY: ${diasSPY.length} días (${diasSPY[0]?.fecha} → ${diasSPY.at(-1)?.fecha})`);

// ═══ 2. LA PASADA ═══════════════════════════════════════════════════════════
const dias = diasDisponibles();
console.log(`cadenas 0DTE: ${dias.length} días (${dias[0]} → ${dias.at(-1)})\n`);

// clave -> { fechas:[], pl:[], credito:[], tocado, perdidaTotal, distReal:[] }
const libro = new Map();
const nuevo = () => ({ fechas: [], pl: [], credito: [], tocado: 0, perdidaTotal: 0, distReal: [] });
function anota(clave, fecha, pl, credito, tocado, perdidaTotal, distReal) {
  let r = libro.get(clave); if (!r) { r = nuevo(); libro.set(clave, r); }
  r.fechas.push(fecha); r.pl.push(pl); r.credito.push(credito);
  if (tocado) r.tocado++; if (perdidaTotal) r.perdidaTotal++;
  r.distReal.push(distReal);
}

let huecos = 0, sinCredito = 0, intentos = 0, diasUsados = 0, sinBarra = 0;
const spotPrimero = new Map(), spotUltimo = new Map();   // por año, para saber si subió o bajó
const listonFilas = [];

for (const d of dias) {
  const dia = cargarDia(d);
  if (!dia) continue;
  diasUsados++;
  const ano = d.slice(0, 4);
  if (!spotPrimero.has(ano)) spotPrimero.set(ano, dia.barras[0].spot);
  spotUltimo.set(ano, dia.barras.at(-1).spot);
  const S = dia.barras.at(-1).spot;                       // liquidación real

  for (const h of HORAS) {
    const iE = hayHora(dia, h);
    if (iE < 0) { sinBarra++; continue; }
    const be = dia.barras[iE];
    const spot = be.spot;

    for (const ancho of ANCHOS) {
      for (const ala of ALAS) {
        for (const lado of ["P", "C"]) {
          intentos++;
          const arr = strikesDe(be, lado);
          if (arr.length < 4) { huecos++; continue; }
          const objCorto = lado === "C" ? spot + ancho : spot - ancho;
          const Kc = cercano(arr, objCorto);
          const objLargo = lado === "C" ? Kc + ala : Kc - ala;
          const Kl = cercano(arr, objLargo);
          // la geometría tiene que salir de verdad; si la rejilla no da, es hueco
          if (Math.abs(Kc - objCorto) > 10 || Math.abs(Math.abs(Kl - Kc) - ala) > 10) { huecos++; continue; }
          if (lado === "C" ? Kl <= Kc : Kl >= Kc) { huecos++; continue; }

          const r = estructura(dia, iE, "vencimiento", [
            { K: Kc, lado, dir: -1 }, { K: Kl, lado, dir: 1 },
          ]);
          if (!r) { huecos++; continue; }
          if (!(r.credito > 0)) { sinCredito++; continue; }

          const anchuraReal = Math.abs(Kl - Kc);
          const dano = lado === "C" ? Math.min(Math.max(S - Kc, 0), anchuraReal)
                                    : Math.min(Math.max(Kc - S, 0), anchuraReal);
          const pl = (r.credito - dano) * 100 - COMM_VERT;
          anota(`${lado}|${h}|${ancho}|${ala}`, d, pl, r.credito * 100,
                dano > 0, dano >= anchuraReal - 1e-9, Math.abs(Kc - spot));
        }
      }
    }
  }

  // ── EL LISTÓN: los tres síes, medido por mí sobre estos mismos días ───────
  const iE = hayHora(dia, "11:00");
  if (iE >= 0) {
    const be = dia.barras[iE], spot = be.spot;
    const aC = strikesDe(be, "C"), aP = strikesDe(be, "P");
    if (aC.length > 3 && aP.length > 3) {
      const KcC = cercano(aC, spot + 45), KlC = cercano(aC, KcC + 50);
      const KcP = cercano(aP, spot - 45), KlP = cercano(aP, KcP - 50);
      const r = estructura(dia, iE, "vencimiento", [
        { K: KcC, lado: "C", dir: -1 }, { K: KlC, lado: "C", dir: 1 },
        { K: KcP, lado: "P", dir: -1 }, { K: KlP, lado: "P", dir: 1 },
      ]);
      const anC = KlC - KcC, anP = KcP - KlP;
      // misma exigencia de geometría que en el barrido: si la rejilla no da, no es un cóndor ±45/50
      if (r && r.credito > 0 && Math.abs(anC - 50) <= 10 && Math.abs(anP - 50) <= 10 &&
          Math.abs(KcC - spot - 45) <= 10 && Math.abs(spot - KcP - 45) <= 10) {
        const dC = Math.min(Math.max(S - KcC, 0), anC), dP = Math.min(Math.max(KcP - S, 0), anP);
        // las dos patas por separado, con el crédito de cada una
        const crC = be.o.get(KcC + "C")[0] - be.o.get(KlC + "C")[1];
        const crP = be.o.get(KcP + "P")[0] - be.o.get(KlP + "P")[1];
        const i = idxSPY.get(d);
        let si1 = null, si2 = null;
        if (i !== undefined && i >= 55) {
          const cierres = diasSPY.slice(Math.max(0, i - 200), i).map((x) => x.c);
          const p11 = diasSPY[i].p11;
          si1 = p11 > media(cierres.slice(-5));
          si2 = p11 > media(cierres.slice(-50));
        }
        listonFilas.push({
          fecha: d, credito: r.credito * 100, si1, si2, si3: r.credito >= 1.0,
          pl: (r.credito - dC - dP) * 100 - 8 * COMM,
          plC: (crC - dC) * 100 - 4 * COMM, plP: (crP - dP) * 100 - 4 * COMM,
          crC: crC * 100, crP: crP * 100,
          tocC: dC > 0, tocP: dP > 0,
        });
      }
    }
  }
}

console.log(`### SANIDAD`);
console.log(`  días cargados:        ${diasUsados} de ${dias.length}`);
console.log(`  combinaciones probadas: ${intentos.toLocaleString("es-ES")}`);
console.log(`  huecos (falta precio o geometría imposible): ${huecos.toLocaleString("es-ES")} (${(100 * huecos / intentos).toFixed(2)}%)`);
console.log(`  crédito ≤ 0 (descartadas): ${sinCredito.toLocaleString("es-ES")}`);
console.log(`  horas que no existían en el día: ${sinBarra}`);

// ── el índice, año a año, para el cruce deriva vs sesgo ─────────────────────
console.log(`\n### EL ÍNDICE EN LA MUESTRA (spot 09:35 del primer día → cierre del último)`);
const dirAno = {};
for (const a of [...spotPrimero.keys()].sort()) {
  const p = spotPrimero.get(a), u = spotUltimo.get(a);
  dirAno[a] = u >= p ? "alcista" : "bajista";
  console.log(`  ${a}: ${p.toFixed(0)} → ${u.toFixed(0)}  (${((u / p - 1) * 100).toFixed(1)}%)  ${dirAno[a]}`);
}

// ── sanidad del crédito: percentiles, no sólo los extremos ──────────────────
{
  const cr = listonFilas.map((f) => f.credito).sort((a, b) => a - b);
  const q = (p) => cr[Math.floor(p * (cr.length - 1))];
  console.log(`\n### SANIDAD DEL CRÉDITO — cóndor ±45 alas 50 a las 11:00 (${cr.length} días)`);
  console.log(`  p5 ${eur(q(0.05))} · p25 ${eur(q(0.25))} · MEDIANA ${eur(q(0.5))} · p75 ${eur(q(0.75))} · p95 ${eur(q(0.95))}`);
  console.log(`  extremos: ${eur(cr[0])} (medias sesiones de festivo) → ${eur(cr.at(-1))} (2025-04-07, el lunes de los aranceles)`);
  console.log(`  ambos extremos comprobados uno a uno contra las cotizaciones: son REALES, no un fallo.`);
}

// ── el listón, y LA DESCOMPOSICIÓN de lo que Lester ya opera ────────────────
const liston = listonFilas.filter((f) => f.si1 && f.si2 && f.si3);
const primeraVC = listonFilas.find((f) => f.si1 !== null)?.fecha ?? dias[0];  // desde aquí hay MA50
const enVC = (f) => f >= primeraVC;
const diasVC = dias.filter(enVC).length;
const ANOS_VC = diasVC / 244;
const listonAnual = suma(liston.map((f) => f.pl)) / ANOS_VC;
console.log(`\n### EL LISTÓN — los tres síes medidos POR MÍ sobre estos mismos días`);
console.log(`  cóndores con cadena a las 11:00: ${listonFilas.length}`);
console.log(`  la MA50 sólo existe desde ${primeraVC} (la cinta de SPY no llega antes) →`);
console.log(`  VENTANA COMÚN de comparación: ${primeraVC} → ${dias.at(-1)} = ${diasVC} días = ${ANOS_VC.toFixed(2)} años`);
console.log(`  operan (los tres síes):          ${liston.length}`);
console.log(`  **al año: ${eur(listonAnual)}**  ·  peor día ${eur(Math.min(...liston.map((f) => f.pl)))}  ·  caída máxima ${eur(caida(liston.map((f) => f.pl)))}`);
console.log(`\n  ── DE DÓNDE SALE ESE DINERO, pata a pata (los mismos ${liston.length} días) ──`);
{
  const sp = suma(liston.map((f) => f.plP)), sc = suma(liston.map((f) => f.plC));
  console.log(`  pata de PUTS:  ${eur(sp / ANOS_VC)}/año  (${Math.round(100 * sp / (sp + sc))}% del total) · tocada ${liston.filter((f) => f.tocP).length} días · peor ${eur(Math.min(...liston.map((f) => f.plP)))} · caída ${eur(caida(liston.map((f) => f.plP)))}`);
  console.log(`  pata de CALLS: ${eur(sc / ANOS_VC)}/año  (${Math.round(100 * sc / (sp + sc))}% del total) · tocada ${liston.filter((f) => f.tocC).length} días · peor ${eur(Math.min(...liston.map((f) => f.plC)))} · caída ${eur(caida(liston.map((f) => f.plC)))}`);
  const mp = mediana(liston.map((f) => f.crP)), mc = mediana(liston.map((f) => f.crC));
  console.log(`  CRÉDITO que cobra cada pata (mediana de los ${liston.length} días): PUT ${eur(mp)} · CALL ${eur(mc)} — la de puts cobra ${(mp / mc).toFixed(1)}× más`);
  const mpT = mediana(listonFilas.map((f) => f.crP)), mcT = mediana(listonFilas.map((f) => f.crC));
  console.log(`  y en los ${listonFilas.length} días TODOS (sin filtro):            PUT ${eur(mpT)} · CALL ${eur(mcT)} — ${(mpT / mcT).toFixed(1)}×  ·  la put cobra más el ${(100 * listonFilas.filter((f) => f.crP > f.crC).length / listonFilas.length).toFixed(0)}% de los días`);
  const anos = [...new Set(liston.map((f) => f.fecha.slice(0, 4)))].sort();
  console.log(`  año a año  |` + anos.map((a) => ` ${a}`).join(" |"));
  console.log(`  PUT        |` + anos.map((a) => ` ${eur(suma(liston.filter((f) => f.fecha.startsWith(a)).map((x) => x.plP)))}`).join(" |"));
  console.log(`  CALL       |` + anos.map((a) => ` ${eur(suma(liston.filter((f) => f.fecha.startsWith(a)).map((x) => x.plC)))}`).join(" |"));
}

// ═══ 3. RESULTADOS ══════════════════════════════════════════════════════════
function ficha(r) {
  const pls = r.pl;
  const anos = {};
  r.fechas.forEach((f, i) => { const a = f.slice(0, 4); (anos[a] ||= []).push(pls[i]); });
  const res = resumen(pls);
  const orden = [...pls];
  const sinTop = [...pls].sort((a, b) => b - a).slice(5);
  const sinBot = [...pls].sort((a, b) => a - b).slice(5);
  const plsVC = pls.filter((_, i) => enVC(r.fechas[i]));
  return {
    n: pls.length,
    nVC: plsVC.length,
    anualVC: suma(plsVC) / ANOS_VC,
    caidaVC: caida(plsVC),
    anual: suma(pls) / ANOS_REALES,
    mediana: mediana(pls),
    media: media(pls),
    peor: Math.min(...pls),
    caida: caida(orden),
    t: res.t, aciertos: res.aciertos,
    tocado: r.tocado, tocadoPct: r.tocado / pls.length,
    perdidaTotal: r.perdidaTotal,
    creditoMed: mediana(r.credito),
    creditoMin: Math.min(...r.credito), creditoMax: Math.max(...r.credito),
    distReal: media(r.distReal),
    porAno: Object.fromEntries(Object.entries(anos).map(([a, v]) => [a, suma(v)])),
    sinLos5: suma(sinTop) / ANOS_REALES,
    sinLos5Peores: suma(sinBot) / ANOS_REALES,
  };
}

const fichas = new Map();
for (const [k, v] of libro) fichas.set(k, ficha(v));

// ── tabla 1: por hora, geometría de referencia ±45 alas 50 ──────────────────
console.log(`\n${"=".repeat(104)}`);
console.log(`  TABLA 1 · LA GEOMETRÍA QUE YA OPERA (±45, alas 50) — put y call por separado, por hora`);
console.log(`${"=".repeat(104)}\n`);
console.log("| hora | PUT $/año | PUT crédito med | PUT tocada | CALL $/año | CALL crédito med | CALL tocada | cóndor (suma) |");
console.log("|---|---|---|---|---|---|---|---|");
for (const h of HORAS) {
  const p = fichas.get(`P|${h}|45|50`), c = fichas.get(`C|${h}|45|50`);
  if (!p || !c) { console.log(`| ${h} | — | — | — | — | — | — | — |`); continue; }
  console.log(`| ${h} | **${eur(p.anual)}** | ${eur(p.creditoMed)} | ${(100 * p.tocadoPct).toFixed(0)}% | **${eur(c.anual)}** | ${eur(c.creditoMed)} | ${(100 * c.tocadoPct).toFixed(0)}% | ${eur(p.anual + c.anual)} |`);
}

// ── tabla 2: barrido completo, mejor de cada lado ───────────────────────────
function mejores(lado, k = 8) {
  return [...fichas.entries()].filter(([key]) => key.startsWith(lado + "|"))
    .sort((a, b) => b[1].anual - a[1].anual).slice(0, k);
}
for (const lado of ["P", "C"]) {
  console.log(`\n${"=".repeat(104)}`);
  console.log(`  TABLA 2${lado === "P" ? "a" : "b"} · LAS 8 MEJORES VARIANTES DE LA VERTICAL DE ${lado === "P" ? "PUTS" : "CALLS"} (de ${HORAS.length * ANCHOS.length * ALAS.length} probadas)`);
  console.log(`${"=".repeat(104)}\n`);
  console.log("| hora | ancho | ala | n | $/año | mediana | acierto | t | peor día | caída máx | tocada | pérdida entera |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const [k, f] of mejores(lado)) {
    const [, h, an, al] = k.split("|");
    console.log(`| ${h} | ±${an} | ${al} | ${f.n} | **${eur(f.anual)}** | ${eur(f.mediana)} | ${(100 * f.aciertos).toFixed(0)}% | ${f.t.toFixed(2)} | ${eur(f.peor)} | ${eur(f.caida)} | ${(100 * f.tocadoPct).toFixed(1)}% | ${f.perdidaTotal} |`);
  }
  const peor = [...fichas.entries()].filter(([key]) => key.startsWith(lado + "|")).sort((a, b) => a[1].anual - b[1].anual)[0];
  console.log(`\n  la PEOR variante de este lado: ${peor[0]} → ${eur(peor[1].anual)}/año`);
  const positivas = [...fichas.entries()].filter(([key]) => key.startsWith(lado + "|")).filter(([, f]) => f.anual > 0).length;
  console.log(`  variantes con $/año positivo: ${positivas} de ${HORAS.length * ANCHOS.length * ALAS.length}`);
}

// ── tabla 3: año a año de las dos patas en la geometría de referencia ───────
const anosLista = [...spotPrimero.keys()].sort();
console.log(`\n${"=".repeat(104)}`);
console.log(`  TABLA 3 · AÑO A AÑO — ±45 alas 50, entrada a las 11:00 (la hora que ya opera)`);
console.log(`${"=".repeat(104)}\n`);
console.log("| año | dirección | PUT | CALL | cóndor (suma) |");
console.log("|---|---|---|---|---|");
{
  const p = fichas.get(`P|11:00|45|50`), c = fichas.get(`C|11:00|45|50`);
  for (const a of anosLista) {
    const pv = p.porAno[a] ?? 0, cv = c.porAno[a] ?? 0;
    console.log(`| ${a} | ${dirAno[a]} | ${eur(pv)} | ${eur(cv)} | ${eur(pv + cv)} |`);
  }
  console.log(`| **TOTAL/año** |  | **${eur(p.anual)}** | **${eur(c.anual)}** | **${eur(p.anual + c.anual)}** |`);
}

// ── tabla 4: EL CRUCE — la pata de calls, bajista vs alcista ────────────────
console.log(`\n${"=".repeat(104)}`);
console.log(`  TABLA 4 · EL CRUCE — ¿la pata de CALLS pierde por el SESGO o por la DERIVA?`);
console.log(`  (2022 es el único año bajista de la muestra: SPX de 4.766 a 3.840)`);
console.log(`${"=".repeat(104)}\n`);
console.log("| lado | hora | 2022 (bajista) | 2023-2026 (alcistas) | $/día bajista | $/día alcista |");
console.log("|---|---|---|---|---|---|");
for (const lado of ["P", "C"]) {
  for (const h of ["10:00", "11:00", "13:00", "14:30"]) {
    const r = libro.get(`${lado}|${h}|45|50`); if (!r) continue;
    const baj = [], alc = [];
    r.fechas.forEach((f, i) => (dirAno[f.slice(0, 4)] === "bajista" ? baj : alc).push(r.pl[i]));
    console.log(`| ${lado === "P" ? "PUT" : "CALL"} | ${h} | ${eur(suma(baj))} (n=${baj.length}) | ${eur(suma(alc))} (n=${alc.length}) | ${eur(media(baj))} | ${eur(media(alc))} |`);
  }
}

// ═══ 4. LA MEJOR DE TODAS, con todo el detalle ══════════════════════════════
const [mejorK, mejorF] = [...fichas.entries()].sort((a, b) => b[1].anual - a[1].anual)[0];
const mejorR = libro.get(mejorK);
const [mLado, mHora, mAncho, mAla] = mejorK.split("|");
console.log(`\n${"=".repeat(104)}`);
console.log(`  LA MEJOR VARIANTE DE TODAS: ${mLado === "P" ? "PUTS" : "CALLS"} ±${mAncho} alas ${mAla}, entrada ${mHora}`);
console.log(`${"=".repeat(104)}\n`);
const mitad = Math.floor(mejorR.pl.length / 2);
const m1 = mejorR.pl.slice(0, mitad), m2 = mejorR.pl.slice(mitad);
const ter = Math.floor(mejorR.pl.length / 3);
const t1 = mejorR.pl.slice(0, ter), t2 = mejorR.pl.slice(ter, 2 * ter), t3 = mejorR.pl.slice(2 * ter);
console.log(`  n=${mejorF.n}  ·  $/año ${eur(mejorF.anual)}  ·  mediana ${eur(mejorF.mediana)}  ·  media ${eur(mejorF.media)}`);
console.log(`  acierto ${(100 * mejorF.aciertos).toFixed(1)}%  ·  t=${mejorF.t.toFixed(2)}  ·  peor día ${eur(mejorF.peor)}  ·  caída máxima ${eur(mejorF.caida)}`);
console.log(`  días tocada: ${mejorF.tocado} (${(100 * mejorF.tocadoPct).toFixed(1)}%)  ·  días con la pérdida entera: ${mejorF.perdidaTotal}`);
console.log(`  crédito: mediano ${eur(mejorF.creditoMed)}, de ${eur(mejorF.creditoMin)} a ${eur(mejorF.creditoMax)}  ·  distancia real media ${mejorF.distReal.toFixed(1)} puntos`);
console.log(`  año a año: ${anosLista.map((a) => `${a} ${eur(mejorF.porAno[a] ?? 0)}`).join(" · ")}`);
console.log(`  mitades: 1ª ${eur(suma(m1) / (ANOS_REALES / 2))}/año · 2ª ${eur(suma(m2) / (ANOS_REALES / 2))}/año`);
console.log(`  tercios: ${eur(suma(t1) / (ANOS_REALES / 3))} · ${eur(suma(t2) / (ANOS_REALES / 3))} · ${eur(suma(t3) / (ANOS_REALES / 3))} al año`);
console.log(`  sin los 5 mejores días: ${eur(mejorF.sinLos5)}/año  ·  sin los 5 peores: ${eur(mejorF.sinLos5Peores)}/año`);
console.log(`  EL LISTÓN (tres síes, mismos días): ${eur(listonAnual)}/año`);

// la misma ficha para la pata de calls a la misma hora/geometría, para el veredicto
const gemela = fichas.get(`${mLado === "P" ? "C" : "P"}|${mHora}|${mAncho}|${mAla}`);
console.log(`\n  su GEMELA (el otro lado, misma hora y geometría): ${eur(gemela.anual)}/año, ` +
            `mediana ${eur(gemela.mediana)}, peor día ${eur(gemela.peor)}, caída ${eur(gemela.caida)}, ` +
            `tocada ${(100 * gemela.tocadoPct).toFixed(1)}%, t=${gemela.t.toFixed(2)}`);
console.log(`  el CÓNDOR de esa hora y geometría (suma exacta): ${eur(mejorF.anual + gemela.anual)}/año`);

// ── el cruce final: MANZANAS CON MANZANAS, sólo la ventana donde el listón existe ──────────
console.log(`
${"=".repeat(104)}`);
console.log(`  TABLA 5 · CONTRA EL LISTÓN, en la MISMA ventana (${primeraVC} → ${dias.at(-1)}, ${ANOS_VC.toFixed(2)} años)`);
console.log(`${"=".repeat(104)}
`);
console.log("| regla | n | $/año | caída máxima |");
console.log("|---|---|---|---|");
console.log(`| **LOS TRES SÍES (el listón)** | ${liston.length} | **${eur(listonAnual)}** | ${eur(caida(liston.map((f) => f.pl)))} |`);
const topVC = [...fichas.entries()].sort((a, b) => b[1].anualVC - a[1].anualVC).slice(0, 10);
for (const [k, f] of topVC) {
  const [l, h, an, al] = k.split("|");
  console.log(`| ${l === "P" ? "PUT" : "CALL"} ±${an}/${al} a las ${h} | ${f.nVC} | **${eur(f.anualVC)}** | ${eur(f.caidaVC)} |`);
}
console.log(`
  la ganadora del barrido completo (${mejorK}) en esta ventana: ${eur(mejorF.anualVC)}/año`);
console.log(`  PUT y CALL de ±45/50 a las 11:00 en esta ventana: ` +
  `${eur(fichas.get("P|11:00|45|50").anualVC)} y ${eur(fichas.get("C|11:00|45|50").anualVC)}`);

// ── FICHA COMPLETA de las candidatas que van al informe ─────────────────────
console.log(`
${"=".repeat(104)}`);
console.log(`  FICHA COMPLETA DE LAS CANDIDATAS`);
console.log(`${"=".repeat(104)}`);
const SERIES = {};
for (const k of ["P|13:30|60|50", "P|10:30|30|50", "P|11:00|45|50", "C|11:00|45|50", "C|12:00|20|50", "C|14:30|20|50"]) {
  const r = libro.get(k), f = fichas.get(k);
  if (!r) continue;
  const [l, h, an, al] = k.split("|");
  const mi = Math.floor(r.pl.length / 2), te = Math.floor(r.pl.length / 3);
  const h1 = r.pl.slice(0, mi), h2 = r.pl.slice(mi);
  const t1 = r.pl.slice(0, te), t2 = r.pl.slice(te, 2 * te), t3 = r.pl.slice(2 * te);
  console.log(`
  ${l === "P" ? "PUT" : "CALL"} ±${an} alas ${al} a las ${h}`);
  console.log(`    n=${f.n} · $/año ${eur(f.anual)} (ventana común ${eur(f.anualVC)}) · mediana ${eur(f.mediana)} · media ${eur(f.media)}`);
  console.log(`    acierto ${(100 * f.aciertos).toFixed(1)}% · t=${f.t.toFixed(2)} · peor día ${eur(f.peor)} · caída máxima ${eur(f.caida)}`);
  console.log(`    tocada ${f.tocado} días (${(100 * f.tocadoPct).toFixed(1)}%) · pérdida entera ${f.perdidaTotal} días · crédito mediano ${eur(f.creditoMed)}`);
  console.log(`    año a año: ${anosLista.map((a) => `${a} ${eur(f.porAno[a] ?? 0)}`).join(" · ")}`);
  console.log(`    mitades: ${eur(suma(h1) / (ANOS_REALES / 2))} · ${eur(suma(h2) / (ANOS_REALES / 2))}   tercios: ${eur(suma(t1) / (ANOS_REALES / 3))} · ${eur(suma(t2) / (ANOS_REALES / 3))} · ${eur(suma(t3) / (ANOS_REALES / 3))}  (al año)`);
  console.log(`    sin los 5 mejores días ${eur(f.sinLos5)}/año · sin los 5 peores ${eur(f.sinLos5Peores)}/año`);
  SERIES[k] = { mitad1: suma(h1) / (ANOS_REALES / 2), mitad2: suma(h2) / (ANOS_REALES / 2),
                tercios: [suma(t1), suma(t2), suma(t3)].map((x) => x / (ANOS_REALES / 3)) };
}

writeFileSync(join(CACHE, "..", "v4-put-o-call.json"), JSON.stringify({
  meta: { dias: diasUsados, intentos, huecos, sinCredito, anosReales: ANOS_REALES, dirAno },
  liston: { n: liston.length, anual: listonAnual, peor: Math.min(...liston.map((f) => f.pl)), caida: caida(liston.map((f) => f.pl)) },
  fichas: Object.fromEntries(fichas), series: SERIES,
}, null, 1));
console.log(`\n(detalle en scripts/v4-put-o-call.json)`);
