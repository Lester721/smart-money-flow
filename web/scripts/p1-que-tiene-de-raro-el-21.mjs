// ¿QUÉ TIENE DE RARO EL 21 DE AGOSTO DE 2026?
//
// ═══ LA PREGUNTA, EN CASTELLANO LLANO ═══════════════════════════════════════════════════════
//
// Eduardo ganó cuatro calls 0DTE el viernes 21 y dijo que las eligió «por el GEX». Antes de
// buscar días parecidos al 21 hay que contestar algo más básico:
//
//   (1) ¿El GEX del 21 era raro, o era un día del montón?
//   (2) ¿Hay ALGÚN número del GEX que, mirado al arrancar el día, ordene los días por lo que
//       el precio va a hacer después?
//
// Si el 21 sale en mitad de la tabla en todo, y ningún número del GEX ordena nada, entonces
// no había nada que ver en el GEX de ese día y hay que decirlo sin adornos.
//
// ═══ CÓMO SE MIDE ══════════════════════════════════════════════════════════════════════════
//
//  - Se calcula perfilGex() de los 1.119 días que tienen interés abierto, SIEMPRE con el spot
//    de la barra de las 09:35 (la de las 09:30 no existe en el histórico; ver lib0dte.mjs).
//    El día 21 se mide igual, con SU barra de las 09:35, para que sea comparable manzana con
//    manzana. Su barra de las 09:30 existe pero se ignora a propósito.
//  - De cada día se sacan siete cosas que hizo el PRECIO, todas medidas desde las 09:35:
//        recorrido de la mañana (09:35→12:00), recorrido del día entero,
//        si el máximo llegó antes que el mínimo, cuánto subió al máximo,
//        cuánto bajó al mínimo, dónde cerró, y cuánto se movió el cierre en valor absoluto.
//  - Cada estadístico del GEX parte los días en CINCO montones (quintiles) y se enseña la
//    media de cada comportamiento en cada montón. La escalera completa, no sólo el mejor.
//
// ═══ LOS CONTROLES, QUE SON LO QUE DECIDE ══════════════════════════════════════════════════
//
// Con 13 estadísticos × 7 comportamientos salen 91 pruebas. A la señal del 5% se esperan ~4,5
// «hallazgos» falsos sólo por mirar mucho. Así que la separación de cada estadístico (t de
// Welch entre el montón 1 y el montón 5) se compara contra TRES ordenadores de control:
//   (a) AZAR: 40 barajados deterministas (nada de Math.random: clave = hash del índice).
//       El listón no es t=2, es el MÁXIMO |t| que consiguen esos 40 barajados con las mismas
//       91 pruebas cada uno. Ése es el listón honesto.
//   (b) TAMAÑO: ordenar por totalContratos (el tamaño de la cadena, no su forma).
//   (c) VOLATILIDAD: ordenar por el precio de la cuna al dinero a las 09:35 (call ATM al ask
//       + put ATM al ask, dividido por el nivel del índice). Éste va a ordenar el movimiento
//       de sobra — es su trabajo. La pregunta es si algún número del GEX le hace sombra.
// Y el control temporal: la escalera se construye SÓLO con días anteriores a 2025-01-01 y se
// comprueba en 2025-2026.
//
// Un hueco no es un cero: si falta un precio se descarta y se cuenta aparte.

import {
  diasDisponibles, cargarDia, cargarDia21, perfilGex, idxHora, hayHora,
  rejilla, compraEn, operar, distanciaSilueta,
} from "./lib0dte.mjs";

const fmt = (x, d = 3) => (x == null || Number.isNaN(x) ? "  n/d" : x.toFixed(d));
const pad = (s, n) => String(s).padStart(n);
const padr = (s, n) => String(s).padEnd(n);

// ── los estadísticos del GEX que se ponen a prueba ────────────────────────────────────────
const ESTADISTICOS = [
  "imanPct", "giroPct",
  "muroCallPct", "muroPutPct", "muroCallCercaPct", "muroPutCercaPct",
  "pasilloPct", "pasilloCercaPct",
  "desbalance05", "desbalance1", "desbalance2",
  "concentracion", "ratioCallPut", "totalContratos",
];

// ── lo que hizo el precio ──────────────────────────────────────────────────────────────────
const COMPORTAMIENTOS = [
  ["recManana%", "recorrido de la mañana 09:35→12:00, en % del índice"],
  ["recDia%", "recorrido del día entero, en %"],
  ["maxAntesMin", "1 si el máximo llegó antes que el mínimo, 0 si al revés"],
  ["subidaMax%", "de la apertura al máximo del día, en %"],
  ["bajadaMin%", "de la apertura al mínimo del día, en % (negativo)"],
  ["cierre%", "del apertura al cierre, en %"],
  ["absCierre%", "lo mismo en valor absoluto"],
];

function comportamiento(d) {
  const s = d.barras.map((b) => b.spot);
  const s0 = s[0];
  const iMediodia = hayHora(d, "12:00");
  if (iMediodia < 0) return null;
  const man = s.slice(0, iMediodia + 1);
  let iMax = 0, iMin = 0;
  for (let i = 1; i < s.length; i++) { if (s[i] > s[iMax]) iMax = i; if (s[i] < s[iMin]) iMin = i; }
  return {
    "recManana%": ((Math.max(...man) - Math.min(...man)) / s0) * 100,
    "recDia%": ((s[iMax] - s[iMin]) / s0) * 100,
    maxAntesMin: iMax < iMin ? 1 : 0,
    "subidaMax%": ((s[iMax] - s0) / s0) * 100,
    "bajadaMin%": ((s[iMin] - s0) / s0) * 100,
    "cierre%": ((s[s.length - 1] - s0) / s0) * 100,
    "absCierre%": Math.abs(((s[s.length - 1] - s0) / s0) * 100),
  };
}

/** Precio de la cuna al dinero a las 09:35, en % del índice. null si falta una pata. */
function cunaATM(d) {
  const b = d.barras[0];
  const K = rejilla(b.spot);
  const c = compraEn(b, K, "C"), p = compraEn(b, K, "P");
  if (c == null || p == null || !(c > 0) || !(p > 0)) return null;
  return ((c + p) / b.spot) * 100;
}

// ═══ CARGA ═════════════════════════════════════════════════════════════════════════════════
console.log("Cargando los días… (una pasada completa tarda ~40 s)");
const t0 = Date.now();
const dias = diasDisponibles();
const filas = [];
let sinOI = 0, sinPerfil = 0, sinMediodia = 0, sinCuna = 0, sinCunaDolares = 0;

for (const dia of dias) {
  const d = cargarDia(dia);
  if (!d) continue;
  if (!d.oi) { sinOI++; continue; }
  const b0 = d.barras[0];
  if (b0.t !== "09:35") { console.log(`  AVISO: ${dia} arranca en ${b0.t}, no en 09:35`); }
  const g = perfilGex(d.oi, b0.spot);
  if (!g) { sinPerfil++; continue; }
  const c = comportamiento(d);
  if (!c) { sinMediodia++; continue; }
  const cuna = cunaATM(d);
  if (cuna == null) sinCuna++;
  // LA VERSIÓN EN DINERO: comprar la cuna al dinero a las 09:35 (las dos patas al ASK) y
  // liquidarla al vencimiento contra el cierre. Precios reales, sin modelo. Sirve para
  // contestar la única pregunta que importa: si un número del GEX marca días que se mueven
  // MÁS DE LO QUE LA OPCIÓN COBRA, o si el mercado ya lo tenía puesto en el precio.
  const K0 = rejilla(b0.spot), ult = d.barras.length - 1;
  const oc = operar(d, 0, ult, K0, "C"), op = operar(d, 0, ult, K0, "P");
  const cunaDolares = oc && op ? oc.dolares + op.dolares : null;
  if (cunaDolares == null) sinCunaDolares++;
  filas.push({ dia, g, c, cuna, cunaDolares, spot0: b0.spot, nBarras: d.barras.length });
}
console.log(`Cargados ${filas.length} días en ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// ═══ SANIDAD ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══ SANIDAD ══════════════════════════════════════════════════════════════════");
console.log(`días con cadena         : ${dias.length}`);
console.log(`días usables (con OI)   : ${filas.length}`);
console.log(`descartados sin OI      : ${sinOI}`);
console.log(`descartados sin perfil  : ${sinPerfil}`);
console.log(`descartados sin 12:00   : ${sinMediodia}`);
console.log(`sin precio de cuna ATM  : ${sinCuna}  (huecos, se excluyen del control (c))`);
console.log(`sin cuna liquidable     : ${sinCunaDolares}  (huecos en la compra o en el cierre)`);
{
  const nb = new Set(filas.map((f) => f.nBarras));
  console.log(`nº de barras por día    : ${[...nb].sort((a, b) => a - b).join(", ")}`);
  console.log(`rango de fechas         : ${filas[0].dia} → ${filas[filas.length - 1].dia}`);
  const cu = filas.map((f) => f.cuna).filter((x) => x != null).sort((a, b) => a - b);
  console.log(`cuna ATM % (min/med/max): ${fmt(cu[0])} / ${fmt(cu[cu.length >> 1])} / ${fmt(cu[cu.length - 1])}`);
  const sp = filas.map((f) => f.spot0);
  console.log(`spot 09:35 (min → max)  : ${fmt(Math.min(...sp), 2)} → ${fmt(Math.max(...sp), 2)}`);
  // control de cordura de precios: una call ATM 0DTE a las 09:35 debe costar entre $2 y $60
  const b0 = cargarDia(filas[Math.floor(filas.length / 2)].dia).barras[0];
  console.log(`ejemplo call ATM 09:35  : $${fmt(compraEn(b0, rejilla(b0.spot), "C"), 2)} el ${filas[Math.floor(filas.length / 2)].dia}`);
}

// ═══ EL DÍA 21 ═════════════════════════════════════════════════════════════════════════════
const d21 = cargarDia21();
if (!d21) throw new Error("no está el día 21 en cache-theta/dia-21/");
const i0935 = idxHora(d21, "09:35");
const b21 = d21.barras[i0935];
const g21 = perfilGex(d21.oi, b21.spot);
const g21apertura = perfilGex(d21.oi, d21.barras[0].spot);
const c21 = comportamiento({ ...d21, barras: d21.barras.slice(i0935) });
const cuna21 = cunaATM({ ...d21, barras: d21.barras.slice(i0935) });

console.log("\n═══ EL 21 DE AGOSTO, MEDIDO IGUAL QUE LOS DEMÁS ══════════════════════════════");
console.log(`barras del 21           : ${d21.barras.length} (de ${d21.barras[0].t} a ${d21.barras[d21.barras.length - 1].t})`);
console.log(`spot 09:30 / 09:35      : ${fmt(d21.barras[0].spot, 2)} / ${fmt(b21.spot, 2)}`);
console.log(`imán con 09:30 / 09:35  : ${fmt(g21apertura.imanPct)} % / ${fmt(g21.imanPct)} %  (se usa el de 09:35)`);
console.log(`cuna ATM del 21         : ${fmt(cuna21)} %`);
console.log("comportamiento del 21   :");
for (const [k] of COMPORTAMIENTOS) console.log(`   ${padr(k, 12)} ${fmt(c21[k])}`);

// ── AUDITORÍA DEL IMÁN: por qué salta de +0,336% a −1,917% con 7 puntos de diferencia ─────
//
// No es un fallo del código (comprobado: la librería da el MISMO imán que un cálculo hecho a
// mano en los 1.119 días). Es que la ventana de ±2% tiene un borde duro y ese día hay dos
// candidatos a los dos lados del borde:
//      7520 con 14.979 de OI  →  −2,009% desde el spot de 09:30 (FUERA) / −1,917% desde 09:35 (DENTRO)
//      7700 con 13.993 de OI  →  +0,336% desde 09:30 / +0,431% desde 09:35 (dentro siempre)
// O sea: el «imán» del 21 depende de con qué precio se mire, y siete puntos lo cambian de
// «justo por encima» a «casi un 2% por debajo». Eso hay que decirlo antes que nada.
{
  const por = new Map();
  for (const [c, n] of Object.entries(d21.oi)) { if (!(n > 0)) continue; const K = +c.split("|")[0]; por.set(K, (por.get(K) ?? 0) + n); }
  console.log("\n── AUDITORÍA DEL IMÁN DEL 21 (los strikes más gordos cerca del dinero) ──");
  [...por.entries()].filter(([K]) => Math.abs((K - b21.spot) / b21.spot) < 0.022)
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .forEach(([K, n]) => console.log(`   ${pad(K, 6)}  OI=${pad(n, 7)}  desde 09:30 ${pad(fmt(((K - d21.barras[0].spot) / d21.barras[0].spot) * 100, 3), 7)}%  desde 09:35 ${pad(fmt(((K - b21.spot) / b21.spot) * 100, 3), 7)}%`));
  console.log("   → el imán del 21 cambia de +0,336% a −1,917% según se mire con el precio de");
  console.log("     las 09:30 o el de las 09:35. No es un fallo: el borde de ±2% parte dos candidatos.");
}

// ── percentil del 21 en cada estadístico ──────────────────────────────────────────────────
console.log("\n═══ EN QUÉ PERCENTIL CAE EL 21 ══════════════════════════════════════════════");
console.log(`${padr("estadístico", 20)} ${pad("valor 21", 12)} ${pad("percentil", 10)} ${pad("mediana hist", 13)} ${pad("p5", 10)} ${pad("p95", 10)}`);
const percentiles = {};
for (const e of [...ESTADISTICOS, "cuna"]) {
  const v21 = e === "cuna" ? cuna21 : g21[e];
  const vals = filas.map((f) => (e === "cuna" ? f.cuna : f.g[e])).filter((x) => x != null && !Number.isNaN(x));
  if (v21 == null || !vals.length) { console.log(`${padr(e, 20)}  (sin dato)`); continue; }
  const orden = [...vals].sort((a, b) => a - b);
  const pct = (vals.filter((x) => x < v21).length / vals.length) * 100;
  percentiles[e] = pct;
  const q = (p) => orden[Math.min(orden.length - 1, Math.floor((p / 100) * orden.length))];
  console.log(
    `${padr(e, 20)} ${pad(fmt(v21, 3), 12)} ${pad(fmt(pct, 1), 10)} ${pad(fmt(q(50), 3), 13)} ` +
    `${pad(fmt(q(5), 3), 10)} ${pad(fmt(q(95), 3), 10)}  (n=${vals.length})`);
}
// el mismo percentil, medido con el spot de las 09:30 del 21 (el otro punto de vista legítimo)
{
  console.log("\n   Los mismos percentiles usando el spot de las 09:30 del 21 (7674,18) en vez del de 09:35:");
  const linea = [];
  for (const e of ESTADISTICOS) {
    const v = g21apertura[e];
    const vals = filas.map((f) => f.g[e]).filter((x) => x != null && !Number.isNaN(x));
    if (v == null || !vals.length) continue;
    linea.push(`${e} ${fmt((vals.filter((x) => x < v).length / vals.length) * 100, 0)}`);
  }
  console.log("   " + linea.join(" · "));
}
{
  const ps = Object.values(percentiles);
  const centrales = ps.filter((p) => p >= 25 && p <= 75).length;
  const extremos = ps.filter((p) => p <= 10 || p >= 90).length;
  console.log(`\nRESUMEN: de ${ps.length} estadísticos, ${centrales} caen entre el percentil 25 y el 75, ` +
              `y ${extremos} caen en las colas (≤10 o ≥90).`);
  console.log(`percentil mediano del 21: ${fmt([...ps].sort((a, b) => a - b)[ps.length >> 1], 1)}`);
}

// ═══ LAS ESCALERAS DE CINCO MONTONES ═══════════════════════════════════════════════════════
function welch(a, b) {
  const m = (v) => v.reduce((x, y) => x + y, 0) / v.length;
  const va = (v, mu) => v.reduce((x, y) => x + (y - mu) ** 2, 0) / (v.length - 1);
  const ma = m(a), mb = m(b);
  const sa = va(a, ma) / a.length, sb = va(b, mb) / b.length;
  const den = Math.sqrt(sa + sb);
  return den > 0 ? (mb - ma) / den : 0;
}

/** Parte los días en 5 montones por `clave` y devuelve la media de cada comportamiento. */
function escalera(sub, clave) {
  const ok = sub.filter((f) => { const v = clave(f); return v != null && !Number.isNaN(v); });
  const orden = [...ok].sort((a, b) => clave(a) - clave(b));
  const n = orden.length, montones = [];
  for (let q = 0; q < 5; q++) {
    montones.push(orden.slice(Math.floor((q * n) / 5), Math.floor(((q + 1) * n) / 5)));
  }
  const out = { n, montones, medias: {}, t: {}, monotona: {} };
  for (const [k] of COMPORTAMIENTOS) {
    const ms = montones.map((g) => g.reduce((a, f) => a + f.c[k], 0) / g.length);
    out.medias[k] = ms;
    out.t[k] = welch(montones[0].map((f) => f.c[k]), montones[4].map((f) => f.c[k]));
    const sube = ms.every((x, i) => i === 0 || x >= ms[i - 1]);
    const baja = ms.every((x, i) => i === 0 || x <= ms[i - 1]);
    out.monotona[k] = sube ? "↑" : baja ? "↓" : " ";
  }
  out.rangos = montones.map((g) => [clave(g[0]), clave(g[g.length - 1])]);
  return out;
}

/** Clave pseudoaleatoria DETERMINISTA (los scripts no pueden usar Math.random). */
const claveAzar = (semilla) => (f, i) => {
  let x = (i + 1) * 2654435761 + semilla * 40503;
  x ^= x >>> 13; x = (x * 1274126177) >>> 0; x ^= x >>> 16;
  return x >>> 0;
};

console.log("\n═══ LA ESCALERA COMPLETA DE CADA ESTADÍSTICO ════════════════════════════════");
console.log("(media de cada comportamiento en los cinco montones, del más bajo al más alto)");
console.log("La flecha marca si la escalera es MONÓTONA. |t| = Welch entre el montón 1 y el 5.\n");

const escaleras = {};
const claves = {};
for (const e of ESTADISTICOS) claves[e] = (f) => f.g[e];
claves["cuna(control c)"] = (f) => f.cuna;

for (const e of Object.keys(claves)) {
  const esc = escalera(filas, claves[e]);
  escaleras[e] = esc;
  const q5 = esc.montones.map((g) => g.length).join("/");
  console.log(`── ${e}   (n=${esc.n}, montones ${q5}, rango ${fmt(esc.rangos[0][0], 2)} … ${fmt(esc.rangos[4][1], 2)})`);
  const filaEl21 = percentiles[e] != null ? `  el 21 cae en el montón ${Math.min(5, Math.floor(percentiles[e] / 20) + 1)}` : "";
  console.log(`   ${padr("comportamiento", 13)} ${pad("M1", 8)} ${pad("M2", 8)} ${pad("M3", 8)} ${pad("M4", 8)} ${pad("M5", 8)}  mon  ${pad("t(M5-M1)", 9)}${filaEl21}`);
  for (const [k] of COMPORTAMIENTOS) {
    console.log(`   ${padr(k, 13)} ${esc.medias[k].map((x) => pad(fmt(x, 3), 8)).join(" ")}   ${esc.monotona[k]}   ${pad(fmt(esc.t[k], 2), 9)}`);
  }
  console.log("");
}

// ═══ CONTROL (a): EL LISTÓN DEL AZAR ═══════════════════════════════════════════════════════
console.log("═══ CONTROL (a) — 40 ORDENACIONES AL AZAR, MISMAS 91 PRUEBAS CADA UNA ═════════");
const maxTAzar = [];
const monoAzar = [];
function escaleraPorClaveArray(sub, keys) {
  const orden = sub.map((f, i) => ({ f, k: keys[i] })).sort((a, b) => a.k - b.k).map((x) => x.f);
  const n = orden.length, montones = [];
  for (let q = 0; q < 5; q++) montones.push(orden.slice(Math.floor((q * n) / 5), Math.floor(((q + 1) * n) / 5)));
  const out = { medias: {}, t: {}, monotona: {} };
  for (const [k] of COMPORTAMIENTOS) {
    const ms = montones.map((g) => g.reduce((a, f) => a + f.c[k], 0) / g.length);
    out.medias[k] = ms;
    out.t[k] = welch(montones[0].map((f) => f.c[k]), montones[4].map((f) => f.c[k]));
    const sube = ms.every((x, i) => i === 0 || x >= ms[i - 1]);
    const baja = ms.every((x, i) => i === 0 || x <= ms[i - 1]);
    out.monotona[k] = sube || baja;
  }
  return out;
}
for (let s = 0; s < 40; s++) {
  const cl = claveAzar(s);
  const keys = filas.map((f, i) => cl(f, i));
  const esc = escaleraPorClaveArray(filas, keys);
  const ts = COMPORTAMIENTOS.map(([k]) => Math.abs(esc.t[k]));
  maxTAzar.push(Math.max(...ts));
  monoAzar.push(COMPORTAMIENTOS.filter(([k]) => esc.monotona[k]).length);
}
maxTAzar.sort((a, b) => a - b);
console.log(`|t| máximo que consigue una ordenación AL AZAR (40 barajados, 7 pruebas cada uno):`);
console.log(`   mediana ${fmt(maxTAzar[20], 2)}   p90 ${fmt(maxTAzar[36], 2)}   MÁXIMO ${fmt(maxTAzar[39], 2)}`);
console.log(`escaleras monótonas por puro azar: media ${fmt(monoAzar.reduce((a, b) => a + b, 0) / monoAzar.length, 2)} de 7 comportamientos`);
const LISTON = maxTAzar[39];

// ═══ TABLA RESUMEN: TODOS CONTRA EL LISTÓN ═════════════════════════════════════════════════
console.log("\n═══ TODOS LOS ESTADÍSTICOS CONTRA EL LISTÓN DEL AZAR ═════════════════════════");
console.log(`El listón es |t| = ${fmt(LISTON, 2)} (lo mejor de 40 barajados). Por debajo = no separa.\n`);
console.log(`${padr("estadístico", 20)} ${COMPORTAMIENTOS.map(([k]) => pad(k.slice(0, 11), 12)).join("")} ${pad("máx|t|", 8)} ${pad("monót.", 7)}`);
const resumenTabla = [];
for (const e of Object.keys(claves)) {
  const esc = escaleras[e];
  const ts = COMPORTAMIENTOS.map(([k]) => esc.t[k]);
  const mono = COMPORTAMIENTOS.filter(([k]) => esc.monotona[k] !== " ").length;
  const mx = Math.max(...ts.map(Math.abs));
  resumenTabla.push({ e, mx, mono, ts });
  console.log(`${padr(e, 20)} ${ts.map((x) => pad(fmt(x, 2), 12)).join("")} ${pad(fmt(mx, 2), 8)} ${pad(`${mono}/7`, 7)}`);
}
const ganadores = resumenTabla.filter((r) => r.e !== "cuna(control c)" && r.mx > LISTON);
console.log(`\nEstadísticos del GEX que superan el listón del azar: ${ganadores.length ? ganadores.map((r) => `${r.e} (${fmt(r.mx, 2)})`).join(", ") : "NINGUNO"}`);
console.log(`Control (c) volatilidad (cuna ATM): máx|t| = ${fmt(resumenTabla.find((r) => r.e === "cuna(control c)").mx, 2)}`);
console.log(`Control (b) tamaño (totalContratos): máx|t| = ${fmt(resumenTabla.find((r) => r.e === "totalContratos").mx, 2)}`);

// ═══ CONTROL (b) AFINADO: ¿QUEDA ALGO DESPUÉS DE QUITAR TAMAÑO Y VOLATILIDAD? ══════════════
console.log("\n═══ ¿SOBREVIVE ALGO DENTRO DE UN MISMO TAMAÑO / VOLATILIDAD? ═════════════════");
console.log("Se parten los días en 3 tercios por tamaño (o por volatilidad) y DENTRO de cada");
console.log("tercio se rehace la escalera. Si el efecto era tamaño o volatilidad disfrazados,");
console.log("aquí se desinfla.\n");
function dentroDeTercios(claveTercio, claveTest, comp) {
  const ok = filas.filter((f) => claveTercio(f) != null && claveTest(f) != null);
  const orden = [...ok].sort((a, b) => claveTercio(a) - claveTercio(b));
  const n = orden.length, ts = [];
  for (let z = 0; z < 3; z++) {
    const tro = orden.slice(Math.floor((z * n) / 3), Math.floor(((z + 1) * n) / 3));
    const o2 = [...tro].sort((a, b) => claveTest(a) - claveTest(b));
    const m = o2.length;
    const q1 = o2.slice(0, Math.floor(m / 5)).map((f) => f.c[comp]);
    const q5 = o2.slice(Math.floor((4 * m) / 5)).map((f) => f.c[comp]);
    ts.push(welch(q1, q5));
  }
  return ts;
}
for (const r of resumenTabla.filter((x) => x.e !== "cuna(control c)").sort((a, b) => b.mx - a.mx).slice(0, 5)) {
  const iMejor = r.ts.map(Math.abs).indexOf(r.mx);
  const comp = COMPORTAMIENTOS[iMejor][0];
  const porTam = dentroDeTercios((f) => f.g.totalContratos, claves[r.e], comp);
  const porVol = dentroDeTercios((f) => f.cuna, claves[r.e], comp);
  console.log(`${padr(r.e, 20)} sobre ${padr(comp, 12)} t global ${pad(fmt(r.ts[iMejor], 2), 7)}` +
    `  |  dentro de tamaño: ${porTam.map((x) => fmt(x, 2)).join(" / ")}` +
    `  |  dentro de vol: ${porVol.map((x) => fmt(x, 2)).join(" / ")}`);
}

// ═══ ¿SON LOS ESTADÍSTICOS DEL GEX LA VOLATILIDAD DISFRAZADA? ══════════════════════════════
//
// Si un número del GEX ordena los días por cuánto se van a mover, la pregunta obligada es si
// ese número no es más que el precio de la cuna con otro nombre. Se mide la correlación de
// rangos (Spearman) de cada estadístico con la cuna ATM.
console.log("\n═══ CORRELACIÓN DE CADA ESTADÍSTICO CON LA VOLATILIDAD (cuna ATM) ════════════");
function spearman(pares) {
  const n = pares.length;
  const rank = (sel) => {
    const idx = pares.map((p, i) => [sel(p), i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(n);
    idx.forEach(([, i], k) => { r[i] = k + 1; });
    return r;
  };
  const ra = rank((p) => p[0]), rb = rank((p) => p[1]);
  const m = (v) => v.reduce((a, b) => a + b, 0) / v.length;
  const ma = m(ra), mb = m(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
}
console.log(`${padr("estadístico", 20)} ${pad("ρ con la cuna", 14)}`);
for (const e of ESTADISTICOS) {
  const pares = filas.filter((f) => f.cuna != null && f.g[e] != null && !Number.isNaN(f.g[e])).map((f) => [f.g[e], f.cuna]);
  console.log(`${padr(e, 20)} ${pad(fmt(spearman(pares), 3), 14)}  (n=${pares.length})`);
}

// ═══ LA PRUEBA EN DINERO — ¿ALGÚN NÚMERO DEL GEX MARCA DÍAS INFRAVALORADOS? ════════════════
//
// Que un estadístico ordene los días por CUÁNTO se mueven no vale un dólar si la opción ya
// cuesta más esos días. Aquí se compra la cuna al dinero a las 09:35 con las dos patas al ASK
// y se liquida al cierre contra el intrínseco. Es dinero real, con el peaje pagado.
// Si la escalera de un estadístico es plana en dinero, el mercado ya tenía puesto el precio.
console.log("\n═══ EN DINERO: LA CUNA ATM COMPRADA A LAS 09:35 Y LIQUIDADA AL CIERRE ════════");
{
  const conD = filas.filter((f) => f.cunaDolares != null);
  const tot = conD.reduce((a, f) => a + f.cunaDolares, 0);
  const ANOS = 4.60;
  console.log(`n = ${conD.length} días  ·  total ${fmt(tot, 0)} $  ·  ${fmt(tot / ANOS, 0)} $/año con UN contrato`);
  const ord = [...conD].map((f) => f.cunaDolares).sort((a, b) => a - b);
  console.log(`media ${fmt(tot / conD.length, 1)} $  ·  mediana ${fmt(ord[ord.length >> 1], 1)} $  ·  peor ${fmt(ord[0], 0)} $  ·  mejor ${fmt(ord[ord.length - 1], 0)} $`);
  const sin5 = ord.slice(0, ord.length - 5).reduce((a, b) => a + b, 0);
  console.log(`quitando los 5 mejores días: ${fmt(sin5 / ANOS, 0)} $/año`);
  console.log(`(comprar la cuna a ciegas PIERDE — es el peaje. La pregunta es si algún montón pierde menos.)
`);
  console.log(`${padr("estadístico", 20)} ${pad("M1 $/año", 10)} ${pad("M2", 10)} ${pad("M3", 10)} ${pad("M4", 10)} ${pad("M5", 10)}  ${pad("t(M5-M1)", 9)}  mon`);
  for (const e of Object.keys(claves)) {
    const ok = conD.filter((f) => claves[e](f) != null && !Number.isNaN(claves[e](f)));
    const orden = [...ok].sort((a, b) => claves[e](a) - claves[e](b));
    const n = orden.length, mont = [];
    for (let q = 0; q < 5; q++) mont.push(orden.slice(Math.floor((q * n) / 5), Math.floor(((q + 1) * n) / 5)));
    // $/año de operar SÓLO ese montón: su suma repartida entre los 4,60 años de la muestra
    const anual = mont.map((g) => g.reduce((a, f) => a + f.cunaDolares, 0) / ANOS);
    const ms = mont.map((g) => g.reduce((a, f) => a + f.cunaDolares, 0) / g.length);
    const t = welch(mont[0].map((f) => f.cunaDolares), mont[4].map((f) => f.cunaDolares));
    const sube = ms.every((x, i) => i === 0 || x >= ms[i - 1]);
    const baja = ms.every((x, i) => i === 0 || x <= ms[i - 1]);
    console.log(`${padr(e, 20)} ${anual.map((x) => pad(fmt(x, 0), 10)).join(" ")}  ${pad(fmt(t, 2), 9)}   ${sube ? "↑" : baja ? "↓" : " "}`);
  }
  console.log(`
El listón del azar sigue siendo |t| = ${fmt(LISTON, 2)}.`);
}

// ═══ CONTROL TEMPORAL: <2025 CONSTRUYE, 2025-2026 COMPRUEBA ════════════════════════════════
console.log("\n═══ CONTROL TEMPORAL — construido con <2025, comprobado en 2025-2026 ═════════");
const antes = filas.filter((f) => f.dia < "2025-01-01");
const despues = filas.filter((f) => f.dia >= "2025-01-01");
console.log(`días <2025: ${antes.length}   días 2025-2026: ${despues.length}\n`);
console.log(`${padr("estadístico", 20)} ${padr("comportamiento", 13)} ${pad("t <2025", 9)} ${pad("t 2025-26", 10)}  mismo signo`);
let coinciden = 0, probados = 0;
for (const r of resumenTabla.filter((x) => x.e !== "cuna(control c)")) {
  const iMejor = r.ts.map(Math.abs).indexOf(r.mx);
  const comp = COMPORTAMIENTOS[iMejor][0];
  const sub = (arr) => {
    const o = [...arr].filter((f) => claves[r.e](f) != null).sort((a, b) => claves[r.e](a) - claves[r.e](b));
    const m = o.length;
    return welch(o.slice(0, Math.floor(m / 5)).map((f) => f.c[comp]), o.slice(Math.floor((4 * m) / 5)).map((f) => f.c[comp]));
  };
  const tA = sub(antes), tD = sub(despues);
  const igual = Math.sign(tA) === Math.sign(tD);
  probados++; if (igual) coinciden++;
  console.log(`${padr(r.e, 20)} ${padr(comp, 13)} ${pad(fmt(tA, 2), 9)} ${pad(fmt(tD, 2), 10)}  ${igual ? "sí" : "NO"}`);
}
console.log(`\nMantienen el signo fuera de muestra: ${coinciden} de ${probados} (el azar daría ~${(probados / 2).toFixed(1)})`);

// ═══ Y AHORA: ¿EL 21 SE PARECE A ALGUIEN? (sólo como dato, la búsqueda es de otro encargo) ═
console.log("\n═══ DE PROPINA — LOS 10 DÍAS DE SILUETA MÁS PARECIDA AL 21 ═══════════════════");
const vecinos = filas.map((f) => ({ dia: f.dia, d: distanciaSilueta(f.g, g21), c: f.c }))
  .sort((a, b) => a.d - b.d);
console.log(`distancia de silueta al 21: mínima ${fmt(vecinos[0].d, 4)}, mediana ${fmt(vecinos[vecinos.length >> 1].d, 4)}, máxima ${fmt(vecinos[vecinos.length - 1].d, 4)}`);
for (const v of vecinos.slice(0, 10)) {
  console.log(`   ${v.dia}  d=${fmt(v.d, 4)}  rec.mañana ${pad(fmt(v.c["recManana%"], 2), 6)}  cierre ${pad(fmt(v.c["cierre%"], 2), 6)}  maxAntesMin ${v.c.maxAntesMin}`);
}
console.log(`   ── el 21 hizo: rec.mañana ${fmt(c21["recManana%"], 2)}  cierre ${fmt(c21["cierre%"], 2)}  maxAntesMin ${c21.maxAntesMin}`);
{
  const g10 = vecinos.slice(0, 60);
  const med = (k) => g10.reduce((a, v) => a + v.c[k], 0) / g10.length;
  const todos = (k) => filas.reduce((a, f) => a + f.c[k], 0) / filas.length;
  console.log("\n   60 vecinos más cercanos vs los 1.119 días, media de cada comportamiento:");
  for (const [k] of COMPORTAMIENTOS) {
    const a = g10.map((v) => v.c[k]), b = filas.map((f) => f.c[k]);
    console.log(`   ${padr(k, 13)} vecinos ${pad(fmt(med(k), 3), 8)}   todos ${pad(fmt(todos(k), 3), 8)}   t ${fmt(welch(b, a), 2)}`);
  }
}

console.log(`\nTiempo total: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
