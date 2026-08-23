// ¿AGUANTAR A VENCIMIENTO O CERRAR ANTES? — el barrido de SALIDAS del cóndor 0DTE.
//
// ═══ QUÉ MIDE ══════════════════════════════════════════════════════════════════════════════
//
// Todo lo que este proyecto ha medido en 0DTE entra y AGUANTA HASTA LAS 16:00. La salida nunca
// se ha barrido. Aquí se mide, sobre exactamente la misma entrada que ya opera Lester:
//
//   ENTRADA (idéntica a «LOS TRES SÍES», que está en forward test desde el 21 de agosto):
//     a las 11:00, si el SPX está por encima de su media de 5 sesiones Y de la de 50,
//     se vende un cóndor ±45 con alas de 50, y sólo si paga $100 o más de crédito. 1 contrato.
//
//   SALIDAS que se comparan (todas sobre esas MISMAS operaciones):
//     · AGUANTAR a vencimiento ................. el listón, lo que hace hoy
//     · OBJETIVO: recomprar cuando el cóndor vale el 25%, 50% o 75% del crédito cobrado
//       (recomprar al 25% = te quedas con el 75% del crédito)
//     · RELOJ: cerrar a una hora fija — 12:00, 13:00, 14:00, 14:30, 15:00, 15:30, 15:45
//     · STOP: recomprar cuando el cóndor cuesta 2× o 3× el crédito cobrado
//       (coste 2× = pérdida de 1× el crédito; coste 3× = pérdida de 2×)
//       Se mide también la lectura alternativa: parar cuando la PÉRDIDA es 2× o 3× el crédito.
//     · COMBINADAS: objetivo + stop, y objetivo + reloj.
//
// La memoria del proyecto dice que los stops PERDIERON 19 de las 20 veces que se probaron. Esa
// es la hipótesis por defecto aquí: el stop empeora. Si sale que mejora, hay que buscarle el
// fallo antes de contarlo.
//
// Lo que de verdad importa medir: cerrar antes cambia la CAÍDA MÁXIMA y el PEOR DÍA aunque baje
// el dinero. Con ~$7.977 de efectivo libre, a Lester no lo tumba ganar menos: lo tumba un día
// que no pueda pagar. Por eso cada salida lleva su tabla de dinero CONTRA susto.
//
// ═══ NADA DE MIRAR AL FUTURO ════════════════════════════════════════════════════════════════
//
// · las medias usan SÓLO cierres de D−1 hacia atrás; lo único del día D es el precio de las 11:00
// · los strikes se eligen con el spot de las 11:00, que es cuando se entra
// · la vigilancia de objetivo/stop va barra a barra hacia delante: en la barra i sólo se mira i
// · precios REALES: se vende al bid y se compra al ask, las cuatro patas, al abrir y al cerrar
// · un hueco NO es un cero: si falta un precio, estructura() devuelve null y se cuenta aparte
// · ningún precio de modelo en ningún sitio
//
// ═══ DETALLES DE CONTABILIDAD ═══════════════════════════════════════════════════════════════
//
// · las medias se calculan con los CIERRES DEL PROPIO SPX (barra 16:00 de la cadena 0DTE), no
//   con una serie de otro feed: cruzar series de feeds distintos ya nos selló un look-ahead.
//   Coste: los primeros 50 días de 2022 se van en el calentamiento de la MA50.
// · comisión: Robinhood cobra $0 + ~$0,03 de tasas por pata. Se cargan 8 patas ($0,24) a TODAS
//   las variantes por igual, aguanten o cierren, para que la comparación no la mueva la tasa.
// · el año son 244 días de bolsa, NO 252. Dividir entre 252 infla el resultado un 3%.
// · la vigilancia es a barras de 5 minutos y se rellena al precio de esa misma barra. Es lo más
//   fino que hay en el banco; es un pelo optimista y queda dicho.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/v6-cuando-soltarlo.mjs

import { diasDisponibles, cargarDia, hayHora, rejilla, condor, estructura, resumen }
  from "./lib0dte.mjs";

const HORA = "11:00", ANCHO = 45, ALA = 50;
const CREDITO_MIN = 1.00;            // $100 por contrato — el tercer sí
const MA_CORTA = 5, MA_LARGA = 50;
const COMM = 0.03 * 8;               // $0,24 por operación, igual para todas las variantes
const DIAS_ANO = 244;

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
const pct = (x) => (x * 100).toFixed(1) + "%";
function caidaMax(pls) { let a = 0, p = 0, w = 0; for (const x of pls) { a += x; p = Math.max(p, a); w = Math.min(w, a - p); } return w; }

// ════════════════════════════════════════════════════════════════════════════
// 1. CARGAR LOS DÍAS UNA SOLA VEZ
// ════════════════════════════════════════════════════════════════════════════
const t0 = Date.now();
const fechas = diasDisponibles();
console.log(`\nCargando ${fechas.length} días (${fechas[0]} → ${fechas[fechas.length - 1]})…`);
const dias = [];
for (const f of fechas) { const d = cargarDia(f); if (d) dias.push(d); }
console.log(`  ${dias.length} días cargados en ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);

const cierres = dias.map((d) => d.barras[d.barras.length - 1].spot);

// ════════════════════════════════════════════════════════════════════════════
// 2. LAS ENTRADAS — los tres síes, medidos aquí sobre estos mismos días
// ════════════════════════════════════════════════════════════════════════════
// Para cada día que opera se guarda: el crédito, la serie completa de "cuánto cuesta cerrar"
// barra a barra desde la entrada, y la liquidación a vencimiento. Con eso se evalúan TODAS las
// reglas de salida sin volver a tocar los ficheros.

const ops = [];
let sinHora = 0, sinEntrada = 0, noTresSies = 0, calentamiento = 0, barrasHueco = 0;
const filtro = { si1: 0, si2: 0, si3: 0, conCadena: 0 };

for (let k = 0; k < dias.length; k++) {
  const d = dias[k];
  if (k < MA_LARGA) { calentamiento++; continue; }               // MA50 sin historia suficiente
  const iE = hayHora(d, HORA);
  if (iE < 0) { sinHora++; continue; }

  const spot11 = d.barras[iE].spot;
  const ma5 = media(cierres.slice(k - MA_CORTA, k));             // SÓLO D−1 hacia atrás
  const ma50 = media(cierres.slice(k - MA_LARGA, k));
  const si1 = spot11 > ma5;
  const si2 = spot11 > ma50;

  const centro = rejilla(spot11);
  const patas = condor(centro, ANCHO, ALA);
  const venc = estructura(d, iE, "vencimiento", patas);
  if (!venc) { sinEntrada++; continue; }                          // hueco en la cadena
  filtro.conCadena++;
  const si3 = venc.credito >= CREDITO_MIN;
  if (si1) filtro.si1++; if (si2) filtro.si2++; if (si3) filtro.si3++;
  if (!(si1 && si2 && si3)) { noTresSies++; continue; }

  // Serie de coste de cierre, barra a barra, desde la entrada+1 hasta las 15:55.
  //
  // ⚠ LA BARRA DE LAS 16:00 NO ES NEGOCIABLE Y NO ENTRA AQUÍ. Su bid/ask es el print de
  // liquidación, no una cotización con la que se pueda operar: el mercado ya está cerrado y
  // la SPXW liquida en efectivo contra el cierre del índice. Medido sobre estas mismas 216
  // operaciones, el mark cotizado de las 16:00 se aparta de la liquidación real más de $2.000
  // en 2 días (el peor, $5.065), mientras que a las 15:55 el peor desvío es de $1.185.
  // La primera versión de este script SÍ dejaba disparar en las 16:00 y el 2026-08-05 un stop
  // de $500 convertía un cóndor que vencía ganando $560 en una pérdida de $4.505 — sobre un
  // precio que no existe. Es el mismo fallo de siempre en este proyecto: una barra que no se
  // puede operar leída como si se pudiera. Si a las 15:55 no ha saltado nada, se va a liquidación.
  const ULTIMA_NEGOCIABLE = d.barras.length - 1;          // índice de las 16:00, EXCLUIDO
  const costes = [];
  for (let i = iE + 1; i < ULTIMA_NEGOCIABLE; i++) {
    const e = estructura(d, iE, i, patas);
    if (!e) { costes.push(null); barrasHueco++; continue; }
    costes.push(e.cierre);
  }
  ops.push({
    fecha: d.dia, ano: d.dia.slice(0, 4), iE, credito: venc.credito,
    costes,                                    // costes[j] = coste de cerrar en la barra iE+1+j
    horas: d.barras.slice(iE + 1, ULTIMA_NEGOCIABLE).map((b) => b.t),
    cierreVenc: venc.cierre,                   // liquidación intrínseca contra el spot de 16:00
    riesgoMax: venc.riesgoMax,
  });
}

const nDiasBolsa = filtro.conCadena;           // días con cadena buena y MA lista = universo
const ANOS = nDiasBolsa / DIAS_ANO;

console.log("=".repeat(100));
console.log("  SANIDAD");
console.log("=".repeat(100));
console.log(`  días cargados ................ ${dias.length}`);
console.log(`  se van en calentamiento MA50 . ${calentamiento}`);
console.log(`  sin barra de las 11:00 ....... ${sinHora}`);
console.log(`  hueco en la cadena a las 11:00 ${sinEntrada}   (un hueco no es un cero)`);
console.log(`  días de bolsa medibles ....... ${nDiasBolsa}  →  ${ANOS.toFixed(2)} años a ${DIAS_ANO} días/año`);
console.log(`     sobre la MA5 .............. ${filtro.si1}`);
console.log(`     sobre la MA50 ............. ${filtro.si2}`);
console.log(`     crédito ≥ $100 ............ ${filtro.si3}`);
console.log(`  **los tres síes → OPERA** .... ${ops.length}  (${Math.round(ops.length / nDiasBolsa * 100)}% de los días)`);
console.log(`  no operan (falta algún sí) ... ${noTresSies}`);
console.log(`  barras huecas dentro del día . ${barrasHueco} (no se puede cerrar ahí; se sigue vigilando)`);
const creds = ops.map((o) => o.credito * 100);
console.log(`\n  crédito por cóndor: mínimo ${eur(Math.min(...creds))} · mediana ${eur(mediana(creds))} · máximo ${eur(Math.max(...creds))}`);
console.log(`  (el rango sano de un ±45/50 a media sesión es $20–$600; el suelo aquí es $100 por el tercer sí)`);
console.log(`  riesgo máximo por cóndor: mediana ${eur(mediana(ops.map((o) => o.riesgoMax)))}\n`);

if (!ops.length) { console.log("SIN OPERACIONES — algo está roto."); process.exit(1); }

// ════════════════════════════════════════════════════════════════════════════
// 3. LAS REGLAS DE SALIDA
// ════════════════════════════════════════════════════════════════════════════
// Cada regla recibe una operación y devuelve { dolares, salida } en dólares por contrato.
// Camina las barras HACIA DELANTE. Si nada dispara, liquida a vencimiento.

let impossible = 0;   // barras descartadas por mark imposible (se informa al final)

function aVencimiento(o) {
  return { dolares: (o.credito - o.cierreVenc) * 100 - COMM, salida: "liquida" };
}

/** Vigilancia barra a barra. tpFrac = cerrar si coste ≤ tpFrac×crédito. slMult = cerrar si coste ≥ slMult×crédito.
 *  slDol = cerrar si la pérdida abierta llega a esos dólares. horaTope = cerrar sí o sí a esa hora. */
function vigilar(o, { tpFrac = null, slMult = null, slDol = null, horaTope = null } = {}) {
  for (let j = 0; j < o.costes.length; j++) {
    const c = o.costes[j];
    const h = o.horas[j];
    // ⚠ UN MARK IMPOSIBLE NO ES UN PRECIO. Cerrar un cóndor de 50 puntos de ancho no puede
    // costar más de 50 puntos: a partir de ahí sale más barato dejarlo vencer. Cuando el coste
    // calculado se pasa de ahí, lo que hay al otro lado no es una cotización sino un relleno.
    // Ejemplo real: el 2025-04-09 a las 13:20 (el día del +9,5%) la call 4995, unos 149 puntos
    // dentro del dinero, cotizaba bid 0,15 / ask 203,90. Recomprarla a 203,90 fabricaba una
    // pérdida de $17.490 en una estructura cuyo máximo son $5.000. Sin este filtro, TODOS los
    // stops disparan sobre ese relleno y contabilizan una pérdida que no existe.
    // Esas barras se saltan: no se puede operar contra un precio de mentira.
    if (c != null && c > ALA) { impossible++; continue; }
    if (horaTope && h >= horaTope) {
      if (c == null) continue;                          // no cotiza: se cierra en la siguiente
      return { dolares: (o.credito - c) * 100 - COMM, salida: h };
    }
    if (c == null) continue;                            // hueco: no se puede actuar
    if (tpFrac != null && c <= tpFrac * o.credito) return { dolares: (o.credito - c) * 100 - COMM, salida: h };
    if (slMult != null && c >= slMult * o.credito) return { dolares: (o.credito - c) * 100 - COMM, salida: h };
    if (slDol != null && (o.credito - c) * 100 <= -slDol) return { dolares: (o.credito - c) * 100 - COMM, salida: h };
  }
  return aVencimiento(o);
}

const REGLAS = [
  ["AGUANTAR a vencimiento (el listón)", aVencimiento, "listón"],

  ["OBJETIVO: recomprar al 75% del crédito (te quedas el 25%)", (o) => vigilar(o, { tpFrac: 0.75 }), "objetivo"],
  ["OBJETIVO: recomprar al 50% del crédito (te quedas el 50%)", (o) => vigilar(o, { tpFrac: 0.50 }), "objetivo"],
  ["OBJETIVO: recomprar al 25% del crédito (te quedas el 75%)", (o) => vigilar(o, { tpFrac: 0.25 }), "objetivo"],

  ["RELOJ: cerrar a las 12:00", (o) => vigilar(o, { horaTope: "12:00" }), "reloj"],
  ["RELOJ: cerrar a las 13:00", (o) => vigilar(o, { horaTope: "13:00" }), "reloj"],
  ["RELOJ: cerrar a las 14:00", (o) => vigilar(o, { horaTope: "14:00" }), "reloj"],
  ["RELOJ: cerrar a las 14:30", (o) => vigilar(o, { horaTope: "14:30" }), "reloj"],
  ["RELOJ: cerrar a las 15:00", (o) => vigilar(o, { horaTope: "15:00" }), "reloj"],
  ["RELOJ: cerrar a las 15:30", (o) => vigilar(o, { horaTope: "15:30" }), "reloj"],
  ["RELOJ: cerrar a las 15:45", (o) => vigilar(o, { horaTope: "15:45" }), "reloj"],
  ["RELOJ: cerrar a las 15:55 (la última barra negociable)", (o) => vigilar(o, { horaTope: "15:55" }), "reloj"],

  ["STOP: recomprar si cuesta 2× el crédito (pierdes 1×)", (o) => vigilar(o, { slMult: 2 }), "stop"],
  ["STOP: recomprar si cuesta 3× el crédito (pierdes 2×)", (o) => vigilar(o, { slMult: 3 }), "stop"],
  ["STOP: parar cuando la PÉRDIDA es 2× el crédito (coste 3×)", (o) => vigilar(o, { slMult: 3 }), "stop-bis"],
  ["STOP: parar cuando la PÉRDIDA es 3× el crédito (coste 4×)", (o) => vigilar(o, { slMult: 4 }), "stop-bis"],

  ["COMBINADA: objetivo 50% + stop a coste 2×", (o) => vigilar(o, { tpFrac: 0.50, slMult: 2 }), "combo"],
  ["COMBINADA: objetivo 50% + stop a coste 3×", (o) => vigilar(o, { tpFrac: 0.50, slMult: 3 }), "combo"],
  ["COMBINADA: objetivo 25% + stop a coste 3×", (o) => vigilar(o, { tpFrac: 0.25, slMult: 3 }), "combo"],
  ["COMBINADA: objetivo 50% + reloj 15:00", (o) => vigilar(o, { tpFrac: 0.50, horaTope: "15:00" }), "combo"],
  ["COMBINADA: objetivo 50% + reloj 15:30", (o) => vigilar(o, { tpFrac: 0.50, horaTope: "15:30" }), "combo"],
  ["COMBINADA: objetivo 25% + reloj 15:30", (o) => vigilar(o, { tpFrac: 0.25, horaTope: "15:30" }), "combo"],
  ["COMBINADA: objetivo 50% + stop 3× + reloj 15:30", (o) => vigilar(o, { tpFrac: 0.50, slMult: 3, horaTope: "15:30" }), "combo"],

  // ── el stop medido en DÓLARES, no en múltiplos del crédito ──────────────────
  // Un stop de 2× el crédito significa una cosa distinta cada día: con $100 de crédito corta a
  // los $100 de pérdida y con $2.110 corta a los $2.110. Lo que tumba a Lester es el DÍA, no el
  // múltiplo. Así que el stop se mide también en dinero, que es la unidad de su cuenta corriente.
  ["STOP en dinero: cerrar si pierde $500", (o) => vigilar(o, { slDol: 500 }), "stop$"],
  ["STOP en dinero: cerrar si pierde $1.000", (o) => vigilar(o, { slDol: 1000 }), "stop$"],
  ["STOP en dinero: cerrar si pierde $1.500", (o) => vigilar(o, { slDol: 1500 }), "stop$"],
  ["STOP en dinero: cerrar si pierde $2.000", (o) => vigilar(o, { slDol: 2000 }), "stop$"],
  ["STOP en dinero: cerrar si pierde $3.000", (o) => vigilar(o, { slDol: 3000 }), "stop$"],
  ["STOP coste 5× el crédito", (o) => vigilar(o, { slMult: 5 }), "stop"],
  ["STOP coste 8× el crédito", (o) => vigilar(o, { slMult: 8 }), "stop"],
  ["OBJETIVO 25% + STOP en dinero $1.500", (o) => vigilar(o, { tpFrac: 0.25, slDol: 1500 }), "combo$"],
  ["OBJETIVO 25% + STOP en dinero $2.000", (o) => vigilar(o, { tpFrac: 0.25, slDol: 2000 }), "combo$"],
  ["OBJETIVO 25% + STOP en dinero $3.000", (o) => vigilar(o, { tpFrac: 0.25, slDol: 3000 }), "combo$"],
];

// ════════════════════════════════════════════════════════════════════════════
// 4. EVALUAR
// ════════════════════════════════════════════════════════════════════════════
const anos = [...new Set(ops.map((o) => o.ano))].sort();

function evaluar(fn) {
  const res = ops.map((o) => ({ ...fn(o), fecha: o.fecha, ano: o.ano, riesgoMax: o.riesgoMax }));
  const pls = res.map((r) => r.dolares);
  const total = suma(pls);
  const r = resumen(pls);
  const orden = [...pls].sort((a, b) => a - b);
  const sinCinco = (suma(orden.slice(0, -5))) / ANOS;             // quitando los 5 MEJORES días
  const sinCincoPeores = (suma(orden.slice(5))) / ANOS;           // quitando los 5 PEORES
  const m1 = res.slice(0, Math.floor(res.length / 2)), m2 = res.slice(Math.floor(res.length / 2));
  const t3 = Math.floor(res.length / 3);
  const tercios = [res.slice(0, t3), res.slice(t3, 2 * t3), res.slice(2 * t3)];
  const anoDolar = {};
  for (const a of anos) anoDolar[a] = suma(res.filter((x) => x.ano === a).map((x) => x.dolares));
  const perdidaTotal = res.filter((x) => x.dolares <= -(x.riesgoMax - COMM) + 1).length;
  const alVenc = res.filter((x) => x.salida === "liquida").length;
  return {
    n: res.length, total, porAno: total / ANOS, mediaOp: r.media, medianaOp: mediana(pls),
    t: r.t, aciertos: r.aciertos, peor: Math.min(...pls), mejor: Math.max(...pls),
    caida: caidaMax(pls), sinCinco, sinCincoPeores, perdidaTotal, alVenc,
    m1: suma(m1.map((x) => x.dolares)) / (m1.length / DIAS_ANO * (nDiasBolsa / ops.length)),
    m2: suma(m2.map((x) => x.dolares)) / (m2.length / DIAS_ANO * (nDiasBolsa / ops.length)),
    tercios: tercios.map((tt) => suma(tt.map((x) => x.dolares)) / (tt.length / DIAS_ANO * (nDiasBolsa / ops.length))),
    anoDolar, res,
    anoPerdedor: anos.some((a) => anoDolar[a] < 0),
  };
}

const tabla = REGLAS.map(([nombre, fn, fam]) => ({ nombre, fam, ...evaluar(fn) }));
const base = tabla[0];

console.log("=".repeat(100));
console.log("  DINERO CONTRA SUSTO — todas las salidas, sobre las MISMAS " + ops.length + " operaciones, 1 contrato");
console.log("=".repeat(100) + "\n");
console.log("| salida | $/año | acierto | mediana op | peor día | caída máx | pérdidas totales | llega a liquidación |");
console.log("|---|---|---|---|---|---|---|---|");
for (const f of tabla) {
  console.log(`| ${f.nombre} | **${eur(f.porAno)}** | ${pct(f.aciertos)} | ${eur(f.medianaOp)} | ${eur(f.peor)} | ${eur(f.caida)} | ${f.perdidaTotal} | ${Math.round(f.alVenc / f.n * 100)}% |`);
}

console.log("\n" + "=".repeat(100));
console.log("  AÑO A AÑO ($/año, 1 contrato) — un año perdedor descalifica");
console.log("=".repeat(100) + "\n");
console.log("| salida | " + anos.join(" | ") + " | mitad 1 | mitad 2 | t |");
console.log("|---|" + anos.map(() => "---").join("|") + "|---|---|---|");
for (const f of tabla) {
  console.log(`| ${f.nombre} | ` + anos.map((a) => eur(f.anoDolar[a])).join(" | ") +
    ` | ${eur(f.m1)} | ${eur(f.m2)} | ${f.t.toFixed(2)} |`);
}

console.log("\n" + "=".repeat(100));
console.log("  ¿VIVE DE CINCO DÍAS? — $/año quitando los 5 mejores y los 5 peores");
console.log("=".repeat(100) + "\n");
console.log("| salida | $/año | sin los 5 mejores | sin los 5 peores | tercios |");
console.log("|---|---|---|---|---|");
for (const f of tabla) {
  console.log(`| ${f.nombre} | ${eur(f.porAno)} | ${eur(f.sinCinco)} | ${eur(f.sinCincoPeores)} | ${f.tercios.map(eur).join(" · ")} |`);
}

// ════════════════════════════════════════════════════════════════════════════
// 5. ¿QUÉ CABE EN LA CUENTA? — el efectivo, que es el cuello de botella
// ════════════════════════════════════════════════════════════════════════════
console.log("\n" + "=".repeat(100));
console.log("  LO QUE TUMBA A LESTER NO ES GANAR MENOS — $7.977 de efectivo libre, 1 y 2 contratos");
console.log("=".repeat(100) + "\n");
console.log("| salida | $/año ×1 | peor día ×1 | caída ×1 | $/año ×2 | peor día ×2 | caída ×2 | ¿peor día > efectivo con 2? |");
console.log("|---|---|---|---|---|---|---|---|");
const EFECTIVO = 7977;
for (const f of tabla) {
  console.log(`| ${f.nombre} | ${eur(f.porAno)} | ${eur(f.peor)} | ${eur(f.caida)} | ${eur(f.porAno * 2)} | ${eur(f.peor * 2)} | ${eur(f.caida * 2)} | ${Math.abs(f.peor * 2) > EFECTIVO ? "**SÍ — llamada de margen**" : "no"} |`);
}

// ════════════════════════════════════════════════════════════════════════════
// 6. DÓNDE SALEN — reparto de la hora de salida de la mejor candidata
// ════════════════════════════════════════════════════════════════════════════
const candidatas = tabla.slice(1)
  .filter((f) => f.porAno > base.porAno && Math.abs(f.caida) <= Math.abs(base.caida) && !f.anoPerdedor);
console.log("\n" + "=".repeat(100));
console.log("  ¿ALGUNA BATE AL LISTÓN EN DINERO **Y** EN CAÍDA, SIN AÑO PERDEDOR?");
console.log("=".repeat(100) + "\n");
if (!candidatas.length) {
  console.log("  NINGUNA. El listón (aguantar a vencimiento) no se bate en las dos cosas a la vez.\n");
} else {
  for (const c of candidatas) console.log(`  · ${c.nombre}: ${eur(c.porAno)}/año, caída ${eur(c.caida)}, t=${c.t.toFixed(2)}`);
  console.log("");
}

// ── LA FRONTERA: cuánto dinero cuesta cada dólar de susto que te quitas ─────
console.log("=".repeat(100));
console.log("  LA FRONTERA — ordenadas de menos susto a más. ¿Cuánto cuesta cada dólar de tranquilidad?");
console.log("=".repeat(100) + "\n");
console.log("| salida | caída máxima | peor día | $/año | pierde vs aguantar | $ perdidos por cada $1 de caída evitada |");
console.log("|---|---|---|---|---|---|");
for (const f of [...tabla].sort((a, b) => b.caida - a.caida)) {
  const menosSusto = Math.abs(base.caida) - Math.abs(f.caida);
  const menosDinero = base.porAno - f.porAno;
  const precio = menosSusto > 0 ? (menosDinero / menosSusto).toFixed(2) : "—";
  console.log(`| ${f.nombre} | ${eur(f.caida)} | ${eur(f.peor)} | ${eur(f.porAno)} | ${eur(-menosDinero)} | ${precio} |`);
}
console.log("");

// reparto horario de la mejor por dinero entre las que reducen el susto
const mejorSusto = tabla.slice(1).filter((f) => Math.abs(f.caida) < Math.abs(base.caida) && Math.abs(f.peor) < Math.abs(base.peor))
  .sort((a, b) => b.porAno - a.porAno)[0];
if (mejorSusto) {
  console.log(`  La que MÁS dinero deja entre las que bajan a la vez la caída y el peor día:`);
  console.log(`    ${mejorSusto.nombre}`);
  console.log(`    ${eur(mejorSusto.porAno)}/año (listón ${eur(base.porAno)}) · caída ${eur(mejorSusto.caida)} (listón ${eur(base.caida)}) · peor día ${eur(mejorSusto.peor)} (listón ${eur(base.peor)})`);
  const rep = {};
  for (const r of mejorSusto.res) rep[r.salida] = (rep[r.salida] || 0) + 1;
  const top = Object.entries(rep).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`    reparto de la hora de salida: ` + top.map(([h, c]) => `${h}:${c}`).join(" · "));
}

// ════════════════════════════════════════════════════════════════════════════
// 7. LOS 10 PEORES DÍAS DEL LISTÓN — y qué habría hecho cada salida en ellos
// ════════════════════════════════════════════════════════════════════════════
console.log("\n" + "=".repeat(100));
console.log("  LOS 10 PEORES DÍAS AGUANTANDO — y qué habría pasado cerrando antes");
console.log("=".repeat(100) + "\n");
const peores = [...base.res].sort((a, b) => a.dolares - b.dolares).slice(0, 10).map((r) => r.fecha);
const cols = [["obj. 50%", "OBJETIVO: recomprar al 50% del crédito (te quedas el 50%)"],
  ["reloj 15:00", "RELOJ: cerrar a las 15:00"],
  ["stop coste 2×", "STOP: recomprar si cuesta 2× el crédito (pierdes 1×)"],
  ["stop $1.500", "STOP en dinero: cerrar si pierde $1.500"],
  ["stop $2.000", "STOP en dinero: cerrar si pierde $2.000"]].map(([k, v]) => v);
console.log("| día | aguantar | obj. 50% | reloj 15:00 | stop coste 2× | stop $1.500 | stop $2.000 |");
console.log("|---|---|" + cols.map(() => "---").join("|") + "|");
for (const f of peores) {
  const fila = [eur(base.res.find((r) => r.fecha === f).dolares)];
  for (const c of cols) { const r = tabla.find((x) => x.nombre === c).res.find((r) => r.fecha === f); fila.push(`${eur(r.dolares)} (${r.salida})`); }
  console.log(`| ${f} | ` + fila.join(" | ") + " |");
}

// ════════════════════════════════════════════════════════════════════════════
// 8. EL PRECIO DEL SEGURO, MEDIDO CON MÁS SUCESOS
// ════════════════════════════════════════════════════════════════════════════
// El stop de $3.000 sale casi gratis, pero SÓLO DISPARA 5 VECES en 4,3 años. Cinco sucesos no
// bastan para poner precio a un seguro: dos salieron a favor y tres en contra, y el neto es
// calderilla. Así que el mismo stop se vuelve a medir sobre TODOS los días con crédito ≥ $100,
// quitando el filtro de las dos medias. La entrada es peor (por eso este bloque NO es una
// propuesta de operar así), pero el cóndor es el mismo y hay tres veces más sucesos, que es lo
// que hace falta para saber qué cuesta el seguro de verdad.

const opsAmplio = [];
for (let k = MA_LARGA; k < dias.length; k++) {
  const d = dias[k];
  const iE = hayHora(d, HORA);
  if (iE < 0) continue;
  const centro = rejilla(d.barras[iE].spot);
  const patas = condor(centro, ANCHO, ALA);
  const venc = estructura(d, iE, "vencimiento", patas);
  if (!venc || venc.credito < CREDITO_MIN) continue;
  const U = d.barras.length - 1;
  const costes = [];
  for (let i = iE + 1; i < U; i++) { const e = estructura(d, iE, i, patas); costes.push(e ? e.cierre : null); }
  opsAmplio.push({ fecha: d.dia, ano: d.dia.slice(0, 4), credito: venc.credito, costes,
    horas: d.barras.slice(iE + 1, U).map((b) => b.t), cierreVenc: venc.cierre, riesgoMax: venc.riesgoMax });
}
const ANOS_A = nDiasBolsa / DIAS_ANO;

console.log("\n" + "=".repeat(100));
console.log(`  EL PRECIO DEL SEGURO — el mismo cóndor en los ${opsAmplio.length} días con crédito ≥ $100, sin filtro de medias`);
console.log("  (más sucesos = precio más fiable. NO es una propuesta de operar sin el filtro)");
console.log("=".repeat(100) + "\n");
console.log("| stop | días que dispara | $/año aguantando | $/año con stop | lo que cuesta el seguro | peor día | caída máxima |");
console.log("|---|---|---|---|---|---|---|");
const baseA = opsAmplio.map((o) => aVencimiento(o).dolares);
console.log(`| — (aguantar) | 0 | ${eur(suma(baseA) / ANOS_A)} | ${eur(suma(baseA) / ANOS_A)} | — | ${eur(Math.min(...baseA))} | ${eur(caidaMax(baseA))} |`);
for (const L of [1000, 1500, 2000, 3000, 4000]) {
  const r = opsAmplio.map((o) => vigilar(o, { slDol: L }));
  const pl = r.map((x) => x.dolares);
  const disp = r.filter((x) => x.salida !== "liquida").length;
  console.log(`| $${L.toLocaleString("es-ES")} | ${disp} | ${eur(suma(baseA) / ANOS_A)} | ${eur(suma(pl) / ANOS_A)} | **${eur(suma(pl) / ANOS_A - suma(baseA) / ANOS_A)}/año** | ${eur(Math.min(...pl))} | ${eur(caidaMax(pl))} |`);
}

console.log(`\n  tiempo total: ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);

// volcado para el informe
console.log("JSON_RESUMEN " + JSON.stringify({
  nOps: ops.length, nDiasBolsa, anos: +ANOS.toFixed(3), huecos: sinEntrada, barrasHueco,
  reglas: tabla.map((f) => ({
    nombre: f.nombre, porAno: Math.round(f.porAno), medianaOp: +f.medianaOp.toFixed(2),
    peor: Math.round(f.peor), caida: Math.round(f.caida), aciertos: +f.aciertos.toFixed(4),
    t: +f.t.toFixed(2), sinCinco: Math.round(f.sinCinco), sinCincoPeores: Math.round(f.sinCincoPeores),
    m1: Math.round(f.m1), m2: Math.round(f.m2), tercios: f.tercios.map(Math.round),
    perdidaTotal: f.perdidaTotal, alVenc: f.alVenc,
    anos: Object.fromEntries(Object.entries(f.anoDolar).map(([a, v]) => [a, Math.round(v)])),
  })),
}));
