// ═══════════════════════════════════════════════════════════════════════════════════════════
// LA GEOMETRÍA DEL CÓNDOR 0DTE, CRUZADA CON LA HORA DE ENTRADA
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ MIDE Y POR QUÉ
// ------------------
// La regla que Lester tiene en forward test («los tres síes») vende un cóndor de ±45 puntos con
// alas de 50, a las 11:00. Los ±45 y el ala de 50 nunca se han probado contra sus alternativas:
// se eligieron y se quedaron. Este script pregunta si esa geometría es la correcta.
//
// Barre las 224 combinaciones de:
//     anchura (distancia del centro a la pata VENDIDA):  15, 20, 25, 30, 35, 45, 60, 80
//     ala     (distancia de la vendida a la COMPRADA):   10, 20, 25, 50
//     hora de entrada:  10:00, 11:00, 12:00, 13:00, 13:30, 14:00, 14:30
//
// Se entra vendiendo el cóndor centrado en el strike de la rejilla más cercano al SPX de esa
// hora, y se aguanta al vencimiento (SPXW es europea y liquida en efectivo contra el cierre).
// Sin filtros de ningún tipo: esto es geometría pura, para ver la forma del mapa.
//
// LAS DOS TRAMPAS QUE HAY QUE DECIR
// ---------------------------------
// (1) EL ALA FIJA EL COLATERAL. Robinhood retiene el ancho completo de una vertical: un ala de
//     50 son $5.000 retenidos y una de 20 son $2.000. Con el mismo efectivo caben más contratos
//     de ala corta, así que comparar sólo «dólares al año por contrato» premia automáticamente
//     al ala ancha. Se da también DÓLARES AL AÑO POR DÓLAR DE COLATERAL.
// (2) LA ANCHURA FIJA LA FRECUENCIA DE TOQUE. Un cóndor de ±15 se toca casi siempre y uno de
//     ±80 casi nunca. Se da el % de días que acaban DENTRO de las patas vendidas por anchura.
//
// LAS REGLAS DE LA CASA QUE CUMPLE
// --------------------------------
// · precios REALES, se vende al bid y se compra al ask, las cuatro patas (lo hace estructura())
// · sólo el pasado: los strikes se eligen con el spot de la barra de entrada
// · un hueco NO es un cero: estructura() devuelve null y se cuenta aparte
// · nada de modelos
// · el calendario real: 1.123 días de 2022-01-03 a 2026-08-10 = 4,60 años (244 días/año)
// · comisiones de Robinhood: $0,03 por pata (4 patas al abrir; al vencimiento no hay cierre)
//
// Uso: node --import tsx scripts/v3-geometria-por-hora.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { diasDisponibles, cargarDia, estructura, condor, hayHora, rejilla } from "./lib0dte.mjs";

const ANCHOS = [15, 20, 25, 30, 35, 45, 60, 80];
const ALAS = [10, 20, 25, 50];
const HORAS = ["10:00", "11:00", "12:00", "13:00", "13:30", "14:00", "14:30"];

const COMM_PATA = 0.03;
const COMM_ABRIR = 4 * COMM_PATA;        // $0,12 por cóndor abierto
const DIAS_ANO = 244;

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const mediana = (v) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
function caidaMax(pls) { let a = 0, pico = 0, peor = 0; for (const x of pls) { a += x; pico = Math.max(pico, a); peor = Math.min(peor, a - pico); } return peor; }
function tStat(v) { const n = v.length; if (n < 2) return NaN; const m = media(v); const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return (m * Math.sqrt(n)) / (sd || Infinity); }

// ── la rejilla de 224 celdas ────────────────────────────────────────────────
const celdas = [];
const clave = (h, an, al) => h + "|" + an + "|" + al;
const porClave = new Map();
for (const h of HORAS) for (const an of ANCHOS) for (const al of ALAS) {
  const c = { hora: h, ancho: an, ala: al, ops: [], huecos: 0 };
  celdas.push(c); porClave.set(clave(h, an, al), c);
}
console.log("\nRejilla: " + HORAS.length + " horas x " + ANCHOS.length + " anchuras x " + ALAS.length + " alas = " + celdas.length + " celdas\n");

// ── una sola pasada por los días ────────────────────────────────────────────
const dias = diasDisponibles();
console.log("Días de cadena disponibles: " + dias.length + " (" + dias[0] + " -> " + dias[dias.length - 1] + ")");

const cierres = [];              // cierre del SPX de cada día, para las medias del listón
const t0 = Date.now();
let diasUsados = 0, diasSinBarras = 0, horasQueFaltan = 0;
const rangoAncho = new Map(ANCHOS.map((a) => [a, { dentro: 0, total: 0 }]));   // % dentro por anchura (a las 11:00)

for (const d of dias) {
  const dia = cargarDia(d);
  if (!dia) { diasSinBarras++; continue; }
  diasUsados++;
  const cierre = dia.barras[dia.barras.length - 1].spot;
  cierres.push({ fecha: d, cierre });

  for (const h of HORAS) {
    const i = hayHora(dia, h);
    if (i < 0) { horasQueFaltan++; continue; }
    const centro = rejilla(dia.barras[i].spot);
    for (const an of ANCHOS) {
      const dentro = cierre > centro - an && cierre < centro + an;
      if (h === "11:00") { const r = rangoAncho.get(an); r.total++; if (dentro) r.dentro++; }
      for (const al of ALAS) {
        const c = porClave.get(clave(h, an, al));
        const r = estructura(dia, i, "vencimiento", condor(centro, an, al));
        if (!r) { c.huecos++; continue; }
        c.ops.push({ fecha: d, dolares: r.dolares - COMM_ABRIR * 100, credito: r.credito * 100, riesgo: r.riesgoMax, dentro, spot: dia.barras[i].spot, cierre });
      }
    }
  }
}
console.log("Días cargados: " + diasUsados + " · días descartados por el lector: " + diasSinBarras + " · horas que no existían: " + horasQueFaltan);
console.log("Pasada completa en " + ((Date.now() - t0) / 1000).toFixed(0) + " s\n");

const ANOS_REALES = diasUsados / DIAS_ANO;
console.log("Calendario real: " + diasUsados + " días / " + DIAS_ANO + " = " + ANOS_REALES.toFixed(2) + " años\n");

// ── CONTROL DE SANIDAD ──────────────────────────────────────────────────────
const patron = porClave.get(clave("11:00", 45, 50));
const creds = patron.ops.map((o) => o.credito).sort((a, b) => a - b);
console.log("=".repeat(92));
console.log("CONTROL DE SANIDAD — el cóndor ±45 con alas de 50 a las 11:00 (el de la regla viva)");
console.log("=".repeat(92));
console.log("  operaciones: " + patron.ops.length + " · huecos: " + patron.huecos);
console.log("  crédito  mín " + eur(creds[0]) + " · p5 " + eur(creds[Math.floor(creds.length * 0.05)]) + " · mediana " + eur(mediana(creds)) + " · p95 " + eur(creds[Math.floor(creds.length * 0.95)]) + " · máx " + eur(creds[creds.length - 1]));
console.log("  (esperado por el encargo: entre $20 y $600 · si sale $5 o $3.000 hay un fallo)");
const riesgos = patron.ops.map((o) => o.riesgo);
console.log("  riesgo máx por contrato: mediana " + eur(mediana(riesgos)) + " (ala 50 = $5.000 menos el crédito)\n");

const huecosTot = suma(celdas.map((c) => c.huecos));
const opsTot = suma(celdas.map((c) => c.ops.length));
console.log("  TOTAL de la rejilla: " + opsTot.toLocaleString("es-ES") + " operaciones · " + huecosTot.toLocaleString("es-ES") + " huecos (" + (100 * huecosTot / (opsTot + huecosTot)).toFixed(2) + "%)\n");

// ── EL LISTÓN: los tres síes, medido POR MÍ sobre estos mismos días ─────────
const idxFecha = new Map(cierres.map((c, i) => [c.fecha, i]));
const cierreArr = cierres.map((c) => c.cierre);
function pasaMedias(fecha, spot) {
  const i = idxFecha.get(fecha);
  if (i === undefined || i < 50) return false;
  const prev = cierreArr.slice(Math.max(0, i - 50), i);
  return spot > media(prev.slice(-5)) && spot > media(prev);
}
const opsListon = patron.ops.filter((o) => pasaMedias(o.fecha, o.spot) && o.credito >= 100);
const listonAno = suma(opsListon.map((o) => o.dolares)) / ANOS_REALES;
console.log("=".repeat(92));
console.log("EL LISTÓN — «los tres síes» medido por mí sobre estos mismos días");
console.log("=".repeat(92));
console.log("  " + opsListon.length + " operaciones de " + patron.ops.length + " días · " + eur(listonAno) + "/año con 1 contrato");
console.log("  mediana " + eur(mediana(opsListon.map((o) => o.dolares))) + " · peor día " + eur(Math.min(...opsListon.map((o) => o.dolares))) + " · caída máx " + eur(caidaMax(opsListon.map((o) => o.dolares))));
console.log("  (referencia pre-registrada: $11.552/año — si mi cifra se le parece, la tubería es la misma)\n");

// ── % DE DÍAS QUE ACABAN DENTRO DE LAS PATAS VENDIDAS, POR ANCHURA ─────────
console.log("=".repeat(92));
console.log("CUÁNTO SE TOCA CADA ANCHURA — % de días que el cierre acaba DENTRO de las vendidas");
console.log("(centrado en el spot de las 11:00)");
console.log("=".repeat(92));
console.log("| anchura | días dentro | % dentro | % tocado |");
console.log("|---|---|---|---|");
for (const an of ANCHOS) { const r = rangoAncho.get(an); console.log("| ±" + an + " | " + r.dentro + "/" + r.total + " | " + (100 * r.dentro / r.total).toFixed(1) + "% | " + (100 - 100 * r.dentro / r.total).toFixed(1) + "% |"); }
console.log();

// ── métricas por celda ──────────────────────────────────────────────────────
const ANOS = ["2022", "2023", "2024", "2025", "2026"];
for (const c of celdas) {
  const pls = c.ops.map((o) => o.dolares);
  c.n = pls.length;
  c.total = suma(pls);
  c.ano = c.total / ANOS_REALES;
  c.colateral = c.ala * 100;                       // lo que retiene Robinhood: el ancho de una vertical
  c.porDolar = c.ano / c.colateral;                // dólares al año POR DÓLAR retenido
  c.mediana = mediana(pls);
  c.peor = pls.length ? Math.min(...pls) : NaN;
  c.caida = caidaMax(pls);
  c.t = tStat(pls);
  c.aciertos = pls.filter((x) => x > 0).length / (pls.length || 1);
  c.perdidaTotal = c.ops.filter((o) => o.dolares <= -o.riesgo + 1).length;
  c.porAno = ANOS.map((a) => suma(c.ops.filter((o) => o.fecha.startsWith(a)).map((o) => o.dolares)));
  c.anosPerdedores = c.porAno.filter((x) => x < 0).length;
  const orden = [...pls].sort((a, b) => b - a);
  c.sinCinco = (c.total - suma(orden.slice(0, 5))) / ANOS_REALES;
  c.sinCincoPeores = (c.total - suma(orden.slice(-5))) / ANOS_REALES;
}

// ── EL MAPA: cuántas celdas son positivas ───────────────────────────────────
const positivas = celdas.filter((c) => c.ano > 0);
console.log("=".repeat(92));
console.log("EL MAPA · " + celdas.length + " celdas · " + positivas.length + " positivas (" + (100 * positivas.length / celdas.length).toFixed(0) + "%) · " + (celdas.length - positivas.length) + " negativas");
console.log("         · " + celdas.filter((c) => c.ano > listonAno).length + " celdas baten al listón en dólares por contrato");
console.log("=".repeat(92) + "\n");

for (const al of ALAS) {
  console.log("\n### $/año por contrato · ala de " + al + " (colateral $" + al * 100 + ")\n");
  console.log("| hora | " + ANCHOS.map((a) => "±" + a).join(" | ") + " |");
  console.log("|---".repeat(ANCHOS.length + 1) + "|");
  for (const h of HORAS) {
    console.log("| " + h + " | " + ANCHOS.map((a) => { const c = porClave.get(clave(h, a, al)); return (c.ano > 0 ? "**" : "") + eur(c.ano) + (c.ano > 0 ? "**" : ""); }).join(" | ") + " |");
  }
}

console.log("\n\n### $/año POR CADA $1.000 DE COLATERAL — la comparación justa\n");
for (const al of ALAS) {
  console.log("\n  ala de " + al + " (colateral $" + al * 100 + "):");
  console.log("  | hora | " + ANCHOS.map((a) => "±" + a).join(" | ") + " |");
  console.log("  |---".repeat(ANCHOS.length + 1) + "|");
  for (const h of HORAS) {
    console.log("  | " + h + " | " + ANCHOS.map((a) => { const c = porClave.get(clave(h, a, al)); return eur(c.porDolar * 1000); }).join(" | ") + " |");
  }
}

// ── LOS MEJORES ─────────────────────────────────────────────────────────────
function ficha(c, etiqueta) {
  console.log("\n" + "-".repeat(92));
  console.log(etiqueta + ": " + c.hora + " · ±" + c.ancho + " · ala " + c.ala);
  console.log("-".repeat(92));
  console.log("  n=" + c.n + " · huecos " + c.huecos + " · " + eur(c.ano) + "/año por contrato · " + eur(c.porDolar * 1000) + "/año por cada $1.000 retenidos");
  console.log("  mediana " + eur(c.mediana) + " · acierto " + (100 * c.aciertos).toFixed(1) + "% · t=" + c.t.toFixed(2));
  console.log("  peor día " + eur(c.peor) + " · días que pierden el riesgo entero: " + c.perdidaTotal + " · caída máx de la caja " + eur(c.caida));
  console.log("  año a año: " + ANOS.map((a, i) => a + " " + eur(c.porAno[i])).join(" · ") + "  -> años perdedores: " + c.anosPerdedores);
  console.log("  sin los 5 mejores días: " + eur(c.sinCinco) + "/año · sin los 5 peores: " + eur(c.sinCincoPeores) + "/año");
  const pls = c.ops.map((o) => o.dolares);
  const m = Math.floor(pls.length / 2);
  console.log("  mitades: " + eur(suma(pls.slice(0, m))) + " / " + eur(suma(pls.slice(m))));
  const t3 = Math.floor(pls.length / 3);
  console.log("  tercios: " + eur(suma(pls.slice(0, t3))) + " / " + eur(suma(pls.slice(t3, 2 * t3))) + " / " + eur(suma(pls.slice(2 * t3))));
}

const porContrato = [...celdas].sort((a, b) => b.ano - a.ano);
const porColateral = [...celdas].sort((a, b) => b.porDolar - a.porDolar);

console.log("\n\n" + "=".repeat(92) + "\nTOP 12 POR DÓLARES AL AÑO Y CONTRATO\n" + "=".repeat(92));
console.log("| # | hora | anchura | ala | $/año | $/año por $1.000 | mediana | peor día | caída máx | años perdedores | sin los 5 mejores |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
porContrato.slice(0, 12).forEach((c, i) => console.log("| " + (i + 1) + " | " + c.hora + " | ±" + c.ancho + " | " + c.ala + " | **" + eur(c.ano) + "** | " + eur(c.porDolar * 1000) + " | " + eur(c.mediana) + " | " + eur(c.peor) + " | " + eur(c.caida) + " | " + c.anosPerdedores + " | " + eur(c.sinCinco) + " |"));

console.log("\n\n" + "=".repeat(92) + "\nTOP 12 POR DÓLARES AL AÑO Y DÓLAR DE COLATERAL\n" + "=".repeat(92));
console.log("| # | hora | anchura | ala | $/año por $1.000 | $/año | contratos con $7.977 | $/año con ese tamaño | años perdedores |");
console.log("|---|---|---|---|---|---|---|---|---|");
porColateral.slice(0, 12).forEach((c, i) => { const nc = Math.floor(7977 / c.colateral); console.log("| " + (i + 1) + " | " + c.hora + " | ±" + c.ancho + " | " + c.ala + " | **" + eur(c.porDolar * 1000) + "** | " + eur(c.ano) + " | " + nc + " | " + eur(c.ano * nc) + " | " + c.anosPerdedores + " |"); });

// ── ¿MESETA O DIENTE? vecinos de la mejor ───────────────────────────────────
function vecinas(c) {
  const iH = HORAS.indexOf(c.hora), iA = ANCHOS.indexOf(c.ancho), iL = ALAS.indexOf(c.ala);
  const out = [];
  for (const dh of [-1, 0, 1]) for (const da of [-1, 0, 1]) for (const dl of [-1, 0, 1]) {
    if (!dh && !da && !dl) continue;
    const h = HORAS[iH + dh], a = ANCHOS[iA + da], l = ALAS[iL + dl];
    if (h === undefined || a === undefined || l === undefined) continue;
    if (iH + dh < 0 || iA + da < 0 || iL + dl < 0) continue;
    out.push(porClave.get(clave(h, a, l)));
  }
  return out;
}
function meseta(c, etiqueta, metrica) {
  const v = vecinas(c);
  const buenas = v.filter((x) => metrica(x) > 0).length;
  const mediaV = media(v.map(metrica));
  console.log("\n  " + etiqueta + " (" + c.hora + " ±" + c.ancho + "/" + c.ala + "): " + v.length + " vecinas · " + buenas + " positivas · su media es el " + (100 * mediaV / metrica(c)).toFixed(0) + "% de la mejor");
  console.log("     -> " + (buenas === v.length && mediaV / metrica(c) > 0.5 ? "MESETA (las vecinas acompañan)" : buenas >= v.length * 0.7 ? "meseta blanda" : "DIENTE (la mejor está sola)"));
}
console.log("\n\n" + "=".repeat(92) + "\n¿MESETA O DIENTE?\n" + "=".repeat(92));
meseta(porContrato[0], "mejor por contrato", (x) => x.ano);
meseta(porColateral[0], "mejor por colateral", (x) => x.porDolar);

ficha(porContrato[0], "MEJOR POR CONTRATO");
ficha(porColateral[0], "MEJOR POR COLATERAL");
ficha(patron, "LA GEOMETRÍA ACTUAL, SIN FILTROS (±45/50 a las 11:00)");

// ── ¿y si a las mejores geometrías les pongo los filtros de los tres síes? ──
console.log("\n\n" + "=".repeat(92) + "\nLAS MEJORES GEOMETRÍAS CON LOS FILTROS DE LOS TRES SÍES ENCIMA");
console.log("(MA5 y MA50 con cierres de D-1 hacia atrás · crédito mínimo $100)\n" + "=".repeat(92));
console.log("| hora | anchura | ala | n | $/año | $/año por $1.000 | mediana | peor día | caída máx | años perdedores |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const candidatas = [...new Set([...porContrato.slice(0, 6), ...porColateral.slice(0, 6), patron])];
const conFiltro = [];
for (const c of candidatas) {
  const ops = c.ops.filter((o) => pasaMedias(o.fecha, o.spot) && o.credito >= 100);
  const pls = ops.map((o) => o.dolares);
  const ano = suma(pls) / ANOS_REALES;
  const py = ANOS.map((a) => suma(ops.filter((o) => o.fecha.startsWith(a)).map((o) => o.dolares)));
  const reg = { c, ops, pls, ano, caida: caidaMax(pls), perdedores: py.filter((x) => x < 0).length, py };
  conFiltro.push(reg);
  console.log("| " + c.hora + " | ±" + c.ancho + " | " + c.ala + " | " + pls.length + " | **" + eur(ano) + "** | " + eur(1000 * ano / c.colateral) + " | " + (pls.length ? eur(mediana(pls)) : "—") + " | " + (pls.length ? eur(Math.min(...pls)) : "—") + " | " + eur(reg.caida) + " | " + reg.perdedores + " |");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// SEGUNDA VUELTA — LOS DOS CONTROLES QUE HACEN FALTA PARA NO ENGAÑARSE
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// PROBLEMA: el tercer sí de la regla viva («que pague $100») NO significa lo mismo en cada
// geometría. Un cóndor de ±25 cobra mucho más que uno de ±45, así que el mismo umbral de $100
// deja pasar el 37% de los días con ±25 y sólo el 19% con ±45. Comparar los dos con ese filtro
// encima mezcla «mejor geometría» con «opera el doble de días», que no es lo mismo.
//
// CONTROL A: sólo las dos medias, sin filtro de crédito. Todas las celdas operan LOS MISMOS
//            días, así que la única diferencia que queda es la geometría.
// CONTROL B: las medias + un umbral de crédito CALIBRADO por celda para que cada geometría
//            opere el mismo número de días que la regla viva (mismo percentil). Así se compara
//            manzana con manzana también en frecuencia. (Es un percentil de la muestra entera:
//            se dice, es un diagnóstico, no una regla operable tal cual.)
// ═══════════════════════════════════════════════════════════════════════════════════════════

function metricas(ops) {
  const pls = ops.map((o) => o.dolares);
  const total = suma(pls);
  const py = ANOS.map((a) => suma(ops.filter((o) => o.fecha.startsWith(a)).map((o) => o.dolares)));
  const orden = [...pls].sort((a, b) => b - a);
  const m = Math.floor(pls.length / 2), t3 = Math.floor(pls.length / 3);
  return {
    n: pls.length, total, ano: total / ANOS_REALES, mediana: mediana(pls),
    peor: pls.length ? Math.min(...pls) : NaN, caida: caidaMax(pls), t: tStat(pls),
    aciertos: pls.filter((x) => x > 0).length / (pls.length || 1),
    perdidaTotal: ops.filter((o) => o.dolares <= -o.riesgo + 1).length,
    porAno: py, perdedores: py.filter((x) => x < 0).length,
    sinCinco: (total - suma(orden.slice(0, 5))) / ANOS_REALES,
    sinCincoPeores: (total - suma(orden.slice(-5))) / ANOS_REALES,
    mitad1: suma(pls.slice(0, m)), mitad2: suma(pls.slice(m)),
    t1: suma(pls.slice(0, t3)), t2: suma(pls.slice(t3, 2 * t3)), t3: suma(pls.slice(2 * t3)),
  };
}

const N_LISTON = opsListon.length;
for (const c of celdas) {
  const conMedias = c.ops.filter((o) => pasaMedias(o.fecha, o.spot));
  c.A = metricas(conMedias.filter((o) => o.credito >= 100));      // el filtro tal cual (bite desigual)
  c.soloMedias = metricas(conMedias);                              // CONTROL A
  const ordCred = [...conMedias].sort((a, b) => b.credito - a.credito);
  c.umbralCal = ordCred.length > N_LISTON ? ordCred[N_LISTON - 1].credito : 0;
  c.B = metricas(ordCred.slice(0, N_LISTON));                      // CONTROL B: misma frecuencia
}

console.log("\n\n" + "=".repeat(92));
console.log("CONTROL A — sólo las dos medias (MA5 y MA50). TODAS las celdas operan los mismos días");
console.log("=".repeat(92));
console.log("días que pasan las medias: " + celdas[0].soloMedias.n + " de " + patron.ops.length + "\n");
for (const al of ALAS) {
  console.log("\n  $/año por contrato · ala " + al + ":");
  console.log("  | hora | " + ANCHOS.map((a) => "±" + a).join(" | ") + " |");
  console.log("  |---".repeat(ANCHOS.length + 1) + "|");
  for (const h of HORAS) console.log("  | " + h + " | " + ANCHOS.map((a) => eur(porClave.get(clave(h, a, al)).soloMedias.ano)).join(" | ") + " |");
}
const posA = celdas.filter((c) => c.soloMedias.ano > 0).length;
console.log("\n  celdas positivas con CONTROL A: " + posA + " de " + celdas.length);
const topA = [...celdas].sort((a, b) => b.soloMedias.ano - a.soloMedias.ano).slice(0, 10);
console.log("\n| # | hora | anchura | ala | n | $/año | $/año por $1.000 | t | peor día | caída máx | años perdedores | sin los 5 mejores | mitad1 / mitad2 |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
topA.forEach((c, i) => { const m = c.soloMedias; console.log("| " + (i + 1) + " | " + c.hora + " | ±" + c.ancho + " | " + c.ala + " | " + m.n + " | **" + eur(m.ano) + "** | " + eur(1000 * m.ano / c.colateral) + " | " + m.t.toFixed(2) + " | " + eur(m.peor) + " | " + eur(m.caida) + " | " + m.perdedores + " | " + eur(m.sinCinco) + " | " + eur(m.mitad1) + " / " + eur(m.mitad2) + " |"); });

console.log("\n\n" + "=".repeat(92));
console.log("CONTROL B — medias + crédito calibrado para que cada celda opere " + N_LISTON + " días (los mismos que la regla viva)");
console.log("=".repeat(92));
const posB = celdas.filter((c) => c.B.ano > 0).length;
console.log("  celdas positivas con CONTROL B: " + posB + " de " + celdas.length + "\n");
const topB = [...celdas].sort((a, b) => b.B.ano - a.B.ano).slice(0, 12);
console.log("| # | hora | anchura | ala | umbral de crédito | $/año | $/año por $1.000 | t | mediana | peor día | caída máx | años perdedores | sin los 5 mejores | mitad1 / mitad2 |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
topB.forEach((c, i) => { const m = c.B; console.log("| " + (i + 1) + " | " + c.hora + " | ±" + c.ancho + " | " + c.ala + " | " + eur(c.umbralCal) + " | **" + eur(m.ano) + "** | " + eur(1000 * m.ano / c.colateral) + " | " + m.t.toFixed(2) + " | " + eur(m.mediana) + " | " + eur(m.peor) + " | " + eur(m.caida) + " | " + m.perdedores + " | " + eur(m.sinCinco) + " | " + eur(m.mitad1) + " / " + eur(m.mitad2) + " |"); });
console.log("\n  la regla viva (11:00 ±45/50) en el CONTROL B: " + eur(patron.B.ano) + "/año (umbral " + eur(patron.umbralCal) + ") · puesto " +
  ([...celdas].sort((a, b) => b.B.ano - a.B.ano).findIndex((c) => c === patron) + 1) + " de 224");

// ── ficha completa de las finalistas ────────────────────────────────────────
function fichaFiltro(c, m, etiqueta) {
  console.log("\n" + "-".repeat(92));
  console.log(etiqueta + " -> " + c.hora + " · ±" + c.ancho + " · ala " + c.ala + " (colateral $" + c.colateral + ")");
  console.log("-".repeat(92));
  console.log("  n=" + m.n + " · " + eur(m.ano) + "/año por contrato · " + eur(1000 * m.ano / c.colateral) + "/año por cada $1.000 · t=" + m.t.toFixed(2));
  console.log("  mediana " + eur(m.mediana) + " · acierto " + (100 * m.aciertos).toFixed(1) + "% · peor día " + eur(m.peor) + " · pierden el riesgo entero: " + m.perdidaTotal);
  console.log("  caída máx de la caja " + eur(m.caida));
  console.log("  año a año: " + ANOS.map((a, i) => a + " " + eur(m.porAno[i])).join(" · ") + "  -> perdedores: " + m.perdedores);
  console.log("  sin los 5 mejores: " + eur(m.sinCinco) + "/año · sin los 5 peores: " + eur(m.sinCincoPeores) + "/año");
  console.log("  mitades: " + eur(m.mitad1) + " / " + eur(m.mitad2) + "   tercios: " + eur(m.t1) + " / " + eur(m.t2) + " / " + eur(m.t3));
}
fichaFiltro(patron, patron.A, "LA REGLA VIVA — los tres síes tal cual, medida por mí");
for (const c of [porClave.get(clave("12:00", 25, 50)), porClave.get(clave("11:00", 35, 50)), porClave.get(clave("12:00", 30, 50)), porClave.get(clave("12:00", 30, 25))]) {
  fichaFiltro(c, c.A, "CON EL FILTRO DE $100 TAL CUAL (opera más días que la regla viva)");
}
fichaFiltro(topB[0], topB[0].B, "MEJOR DEL CONTROL B (misma frecuencia que la regla viva)");
fichaFiltro(topA[0], topA[0].soloMedias, "MEJOR DEL CONTROL A (sólo medias)");

// ── ¿meseta o diente en el mapa filtrado? ───────────────────────────────────
console.log("\n\n" + "=".repeat(92) + "\n¿MESETA O DIENTE EN LOS MAPAS FILTRADOS?\n" + "=".repeat(92));
meseta(topA[0], "mejor CONTROL A", (x) => x.soloMedias.ano);
meseta(topB[0], "mejor CONTROL B", (x) => x.B.ano);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// TERCERA VUELTA — LA COMPARACIÓN QUE LE IMPORTA A LA CUENTA
// ═══════════════════════════════════════════════════════════════════════════════════════════
// El ala fija el colateral y el efectivo libre son $7.977. Un ala de 50 retiene $5.000 (cabe
// 1 contrato) y una de 25 retiene $2.500 (caben 3). Aquí se ordena por dólares al año POR DÓLAR
// RETENIDO y se traduce a lo que ganaría la cuenta de verdad.
console.log("\n\n" + "=".repeat(92));
console.log("CONTROL A ORDENADO POR DÓLAR DE COLATERAL — y traducido a la cuenta ($7.977 de efectivo)");
console.log("=".repeat(92));
console.log("| # | hora | anchura | ala | $/año por $1.000 | $/año 1 contrato | contratos que caben | $/año de la cuenta | caída de la cuenta | días que pierden el riesgo entero |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
[...celdas].sort((a, b) => b.soloMedias.ano / b.colateral - a.soloMedias.ano / a.colateral).slice(0, 12)
  .forEach((c, i) => { const m = c.soloMedias, nc = Math.floor(7977 / c.colateral); console.log("| " + (i + 1) + " | " + c.hora + " | ±" + c.ancho + " | " + c.ala + " | **" + eur(1000 * m.ano / c.colateral) + "** | " + eur(m.ano) + " | " + nc + " | " + eur(m.ano * nc) + " | " + eur(m.caida * nc) + " | " + m.perdidaTotal + "/" + m.n + " |"); });

console.log("\n\n" + "=".repeat(92));
console.log("CON EL FILTRO DE LOS TRES SÍES TAL CUAL, ORDENADO POR DÓLAR DE COLATERAL");
console.log("=".repeat(92));
console.log("| # | hora | anchura | ala | n | días que opera | $/operación | $/año por $1.000 | $/año 1 contrato | contratos | $/año de la cuenta | caída de la cuenta | años perdedores |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
[...celdas].sort((a, b) => b.A.ano / b.colateral - a.A.ano / a.colateral).slice(0, 15)
  .forEach((c, i) => { const m = c.A, nc = Math.floor(7977 / c.colateral); console.log("| " + (i + 1) + " | " + c.hora + " | ±" + c.ancho + " | " + c.ala + " | " + m.n + " | " + (100 * m.n / c.n).toFixed(0) + "% | " + eur(m.total / (m.n || 1)) + " | **" + eur(1000 * m.ano / c.colateral) + "** | " + eur(m.ano) + " | " + nc + " | " + eur(m.ano * nc) + " | " + eur(m.caida * nc) + " | " + m.perdedores + " |"); });

console.log("\n  para comparar, la REGLA VIVA: " + eur(1000 * patron.A.ano / patron.colateral) + "/año por $1.000 · " + eur(patron.A.total / patron.A.n) + "/operación · " + patron.A.n + " días de " + patron.n + " (" + (100 * patron.A.n / patron.n).toFixed(0) + "%)");

// ── el filtro de $100 NO muerde igual en cada anchura: decirlo con números ──
console.log("\n\n" + "=".repeat(92));
console.log("POR QUÉ EL FILTRO DE $100 NO ES EL MISMO FILTRO EN CADA GEOMETRÍA (ala 50, 12:00)");
console.log("=".repeat(92));
console.log("| anchura | crédito mediano | días con crédito ≥ $100 | días que además pasan las medias |");
console.log("|---|---|---|---|");
for (const an of ANCHOS) {
  const c = porClave.get(clave("12:00", an, 50));
  console.log("| ±" + an + " | " + eur(mediana(c.ops.map((o) => o.credito))) + " | " + c.ops.filter((o) => o.credito >= 100).length + "/" + c.n + " (" + (100 * c.ops.filter((o) => o.credito >= 100).length / c.n).toFixed(0) + "%) | " + c.A.n + " |");
}

// ── de dónde salen los créditos extremos ────────────────────────────────────
console.log("\n\n" + "=".repeat(92));
console.log("LOS CRÉDITOS EXTREMOS DEL ±45/50 A LAS 11:00 — ¿fallo o días de pánico?");
console.log("=".repeat(92));
const altos = [...patron.ops].sort((a, b) => b.credito - a.credito).slice(0, 8);
console.log("| día | crédito | SPX 11:00 | SPX cierre | movimiento | resultado |");
console.log("|---|---|---|---|---|---|");
for (const o of altos) console.log("| " + o.fecha + " | " + eur(o.credito) + " | " + o.spot.toFixed(0) + " | " + o.cierre.toFixed(0) + " | " + (100 * (o.cierre - o.spot) / o.spot).toFixed(2) + "% | " + eur(o.dolares) + " |");
console.log("  días con crédito > $600: " + patron.ops.filter((o) => o.credito > 600).length + " de " + patron.n +
  " · de ellos en 2022: " + patron.ops.filter((o) => o.credito > 600 && o.fecha.startsWith("2022")).length);
console.log("  días con crédito ≤ $0 (las alas cuestan más que las vendidas): " + patron.ops.filter((o) => o.credito <= 0).length);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CRIBA FINAL — la prueba del encargo, aplicada a las 224 celdas en los tres regímenes
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Sobrevive quien: (1) gana más dinero al año que la regla viva, (2) con una caída máxima MENOR,
// (3) sin ningún año perdedor, (4) sigue siendo positiva si le quitas los 5 mejores días, y
// (5) tiene las dos mitades del período positivas.
const listonCaida = patron.A.caida;
console.log("\n\n" + "=".repeat(92));
console.log("CRIBA FINAL — contra la regla viva medida por mí: " + eur(patron.A.ano) + "/año y caída " + eur(listonCaida));
console.log("=".repeat(92));
function criba(nombre, saca) {
  const sup = celdas.filter((c) => {
    const m = saca(c);
    return m.n >= 100 && m.ano > patron.A.ano && m.caida > listonCaida && m.perdedores === 0 && m.sinCinco > 0 && m.mitad1 > 0 && m.mitad2 > 0;
  });
  console.log("\n  ── " + nombre + ": " + sup.length + " supervivientes de 224");
  if (!sup.length) { console.log("     (ninguna)"); return sup; }
  console.log("  | hora | anchura | ala | n | $/año | $/año por $1.000 | t | caída máx | peor día | sin los 5 mejores | mitad1 / mitad2 | tercios |");
  console.log("  |---|---|---|---|---|---|---|---|---|---|---|---|");
  sup.sort((a, b) => saca(b).ano - saca(a).ano).forEach((c) => { const m = saca(c); console.log("  | " + c.hora + " | ±" + c.ancho + " | " + c.ala + " | " + m.n + " | **" + eur(m.ano) + "** | " + eur(1000 * m.ano / c.colateral) + " | " + m.t.toFixed(2) + " | " + eur(m.caida) + " | " + eur(m.peor) + " | " + eur(m.sinCinco) + " | " + eur(m.mitad1) + " / " + eur(m.mitad2) + " | " + eur(m.t1) + "/" + eur(m.t2) + "/" + eur(m.t3) + " |"); });
  return sup;
}
const supSin = criba("geometría pura, sin ningún filtro", (c) => metricas(c.ops));
const supA = criba("CONTROL A (sólo las dos medias, todas operan los mismos días)", (c) => c.soloMedias);
const supF = criba("con el filtro de los tres síes tal cual (medias + $100)", (c) => c.A);
const supB = criba("CONTROL B (medias + crédito calibrado a la misma frecuencia)", (c) => c.B);

const GANA = supF[0] || supA[0] || supB[0] || null;
if (GANA) {
  const m = supF[0] ? GANA.A : supA[0] ? GANA.soloMedias : GANA.B;
  fichaFiltro(GANA, m, "LA SUPERVIVIENTE");
  console.log("  $/operación: " + eur(m.total / m.n) + " · contra los " + eur(patron.A.total / patron.A.n) + "/operación de la regla viva");
  console.log("  opera " + m.n + " días contra los " + patron.A.n + " de la regla viva");
  console.log("\n  CRUDO_GANADORA " + JSON.stringify({ hora: GANA.hora, ancho: GANA.ancho, ala: GANA.ala, colateral: GANA.colateral, n: m.n, ano: Math.round(m.ano), t: +m.t.toFixed(2), aciertos: +m.aciertos.toFixed(4), mediana: Math.round(m.mediana), peor: Math.round(m.peor), caida: Math.round(m.caida), perdidaTotal: m.perdidaTotal, porAno: m.porAno.map(Math.round), sinCinco: Math.round(m.sinCinco), sinCincoPeores: Math.round(m.sinCincoPeores), mitad1: Math.round(m.mitad1), mitad2: Math.round(m.mitad2), tercios: [m.t1, m.t2, m.t3].map(Math.round), huecos: GANA.huecos }));
}

// ── VOLCADO para el informe ─────────────────────────────────────────────────
const mejor = porColateral[0], mejorC = porContrato[0];
console.log("\n\n" + "=".repeat(92) + "\nRESUMEN PARA EL INFORME\n" + "=".repeat(92));
console.log(JSON.stringify({
  celdas: celdas.length, positivas: positivas.length,
  batenListonPorContrato: celdas.filter((c) => c.ano > listonAno).length,
  listonAno: Math.round(listonAno), listonN: opsListon.length,
  anosReales: +ANOS_REALES.toFixed(2), diasUsados, huecosTot,
  mejorPorContrato: { hora: mejorC.hora, ancho: mejorC.ancho, ala: mejorC.ala, ano: Math.round(mejorC.ano), n: mejorC.n, t: +mejorC.t.toFixed(2), mediana: Math.round(mejorC.mediana), peor: Math.round(mejorC.peor), caida: Math.round(mejorC.caida), porAno: mejorC.porAno.map(Math.round), sinCinco: Math.round(mejorC.sinCinco), sinCincoPeores: Math.round(mejorC.sinCincoPeores), perdidaTotal: mejorC.perdidaTotal, aciertos: +(mejorC.aciertos).toFixed(4), huecos: mejorC.huecos },
  mejorPorColateral: { hora: mejor.hora, ancho: mejor.ancho, ala: mejor.ala, ano: Math.round(mejor.ano), n: mejor.n, t: +mejor.t.toFixed(2), mediana: Math.round(mejor.mediana), peor: Math.round(mejor.peor), caida: Math.round(mejor.caida), porAno: mejor.porAno.map(Math.round), sinCinco: Math.round(mejor.sinCinco), sinCincoPeores: Math.round(mejor.sinCincoPeores), perdidaTotal: mejor.perdidaTotal, aciertos: +(mejor.aciertos).toFixed(4), huecos: mejor.huecos },
}, null, 2));

// mitades y tercios de las dos mejores, en crudo
for (const c of [mejorC, mejor]) {
  const pls = c.ops.map((o) => o.dolares);
  const m = Math.floor(pls.length / 2), t3 = Math.floor(pls.length / 3);
  console.log("\nCRUDO " + c.hora + "/" + c.ancho + "/" + c.ala + " mitades " + Math.round(suma(pls.slice(0, m))) + " " + Math.round(suma(pls.slice(m))) +
    " tercios " + Math.round(suma(pls.slice(0, t3))) + " " + Math.round(suma(pls.slice(t3, 2 * t3))) + " " + Math.round(suma(pls.slice(2 * t3))));
}
