// FASE D · POR QUÉ no avisa, y QUÉ HARÍA FALTA para que un aviso de este tipo fuese medible.
//
// Aquí no se busca una regla nueva: se mide (a) dónde vive de verdad el daño, (b) si la señal
// va por delante o por detrás, y (c) cuánto tendría que separar una señal para pasar el listón
// con esta muestra. El (c) es la respuesta a "dime qué le falta para funcionar", en dólares.
//
// PRUEBAS DECLARADAS EN TODO EL ENCARGO: 66
//   15 cruce A→B · 15 cruce B→A · 15 caminante (media) · 15 caminante (frecuencia de golpe)
//   · 3 control de P&L pasado · 3 diagnósticos de mecanismo.

import { readFileSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos";

const CUENTA = 56389;
const PRUEBAS = 66;
const LISTON = listonT(PRUEBAS);
const VENTANAS = [20, 40, 60];
const CUANTILES = [0.10, 0.20, 0.30, 0.40, 0.50];
const MIN_HIST = 250;
const GOLPE = -2000; // un día que se lleva ~40% del colateral de un cóndor

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1)); };
const cuantil = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]; };
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
const pc = (x) => (x * 100).toFixed(1) + "%";
const corr = (a, b) => {
  const ma = media(a), mb = media(b);
  const num = suma(a.map((x, i) => (x - ma) * (b[i] - mb)));
  return num / Math.sqrt(suma(a.map((x) => (x - ma) ** 2)) * suma(b.map((x) => (x - mb) ** 2)));
};
/** z de dos proporciones. */
const zProp = (x1, n1, x2, n2) => {
  const p = (x1 + x2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (x1 / n1 - x2 / n2) / se : 0;
};

const filas = JSON.parse(readFileSync("scripts/aviso2023-filas.json", "utf8"));
for (const N of VENTANAS) {
  for (let i = 0; i < filas.length; i++) {
    if (i < N) { filas[i]["R" + N] = null; continue; }
    const v = filas.slice(i - N, i);
    filas[i]["R" + N] = suma(v.map((f) => f.credito)) / suma(v.map((f) => f.mov));
  }
}

console.log("═".repeat(112));
console.log("  D1 · ¿DÓNDE VIVE EL DAÑO? Si son un puñado de días, ningún interruptor lento llega");
console.log("═".repeat(112));
const pls = filas.map((f) => f.pl);
const orden = [...filas].sort((a, b) => a.pl - b.pl);
console.log("| concepto | valor |");
console.log("|---|---|");
console.log("| días totales | " + filas.length + " |");
console.log("| suma de TODO (1 contrato) | " + eur(suma(pls)) + " |");
console.log("| suma de los 10 peores días | " + eur(suma(orden.slice(0, 10).map((f) => f.pl))) + " |");
console.log("| suma de los 25 peores días | " + eur(suma(orden.slice(0, 25).map((f) => f.pl))) + " |");
console.log("| suma de los 56 peores (5%) | " + eur(suma(orden.slice(0, 56).map((f) => f.pl))) + " |");
console.log("| suma de los otros " + (filas.length - 56) + " | " + eur(suma(orden.slice(56).map((f) => f.pl))) + " |");
console.log("| desviación típica del día | " + eur(sd(pls)) + " |");
console.log("| media del día | " + eur(media(pls)) + " |");
console.log("\n## los 12 peores días de los 1.121, y qué marcaba la señal esa mañana\n");
console.log("| fecha | P&L | crédito (pts) | movimiento (pts) | R20 ese día | percentil de R20 en la historia previa |");
console.log("|---|---|---|---|---|---|");
for (const f of orden.slice(0, 12)) {
  const prev = filas.filter((g) => g.fecha < f.fecha && g.R20 != null).map((g) => g.R20);
  const p = f.R20 != null && prev.length > 50 ? pc(prev.filter((x) => x < f.R20).length / prev.length) : "—";
  console.log("| " + f.fecha + " | " + eur(f.pl) + " | " + f.credito.toFixed(2) + " | " + f.mov.toFixed(1) + " | " + (f.R20 != null ? f.R20.toFixed(3) : "—") + " | " + p + " |");
}

console.log("\n" + "═".repeat(112));
console.log("  D2 · ¿VA POR DELANTE O POR DETRÁS? R contra el P&L de los 40 días ANTERIORES y de los 40 SIGUIENTES");
console.log("═".repeat(112));
console.log("| ventana | ρ con el P&L de los 40 días PREVIOS | ρ con el P&L de los 40 días SIGUIENTES |");
console.log("|---|---|---|");
for (const N of VENTANAS) {
  const xs = [], atras = [], alante = [];
  for (let i = 0; i < filas.length; i++) {
    if (filas[i]["R" + N] == null || i < 40 || i + 40 >= filas.length) continue;
    xs.push(filas[i]["R" + N]);
    atras.push(media(filas.slice(i - 40, i).map((f) => f.pl)));
    alante.push(media(filas.slice(i + 1, i + 41).map((f) => f.pl)));
  }
  console.log("| R" + N + " | " + corr(xs, atras).toFixed(3) + " | " + corr(xs, alante).toFixed(3) + " |");
}

console.log("\n" + "═".repeat(112));
console.log("  D3 · LA OTRA VÍA — ¿predice al menos la FRECUENCIA de los golpes (P&L < −$2.000)?");
console.log("  (el filtro de tendencia que sí sobrevivió lo hizo por aquí: corta frecuencia, no medias)");
console.log("═".repeat(112));
console.log("| ventana | percentil | n | % golpes si OPERAS | % golpes en los días APAGADOS | z de dos proporciones |");
console.log("|---|---|---|---|---|---|");
for (const N of VENTANAS) {
  for (const q of CUANTILES) {
    const campo = "R" + N, hist = [], marcadas = [];
    for (const f of filas) {
      const v = f[campo]; if (v == null) continue;
      if (hist.length >= MIN_HIST) marcadas.push({ ...f, on: v >= cuantil(hist, q) });
      hist.push(v);
    }
    const on = marcadas.filter((f) => f.on), off = marcadas.filter((f) => !f.on);
    if (off.length < 30) { console.log("| " + N + " | p" + q * 100 + " | " + marcadas.length + " | — | — | **sin muestra** |"); continue; }
    const gOn = on.filter((f) => f.pl < GOLPE).length, gOff = off.filter((f) => f.pl < GOLPE).length;
    console.log("| " + N + " | p" + q * 100 + " | " + marcadas.length + " | " + pc(gOn / on.length) + " (" + gOn + "/" + on.length + ") | " +
      pc(gOff / off.length) + " (" + gOff + "/" + off.length + ") | " + zProp(gOff, off.length, gOn, on.length).toFixed(2) + " |");
  }
}

console.log("\n" + "═".repeat(112));
console.log("  D4 · QUÉ LE FALTA · cuánto tendría que separar CUALQUIER señal para pasar el listón aquí");
console.log("═".repeat(112));
const s = sd(pls), n = filas.length;
console.log("| % de días que apaga | días operados | días apagados | separación mínima $/día para |t| = " + LISTON + " | eso son, al año |");
console.log("|---|---|---|---|---|");
for (const off of [0.10, 0.20, 0.30, 0.40, 0.50]) {
  const n2 = Math.round(n * off), n1 = n - n2;
  const se = s * Math.sqrt(1 / n1 + 1 / n2);
  const delta = LISTON * se;
  console.log("| " + pc(off) + " | " + n1 + " | " + n2 + " | " + eur(delta) + " | " + eur(delta * 252 * off) + " de pérdida evitada |");
}
console.log("\nLa estrategia entera gana " + eur(suma(pls) / (n / 252)) + " al año con 1 contrato (" + pc(suma(pls) / (n / 252) / CUENTA) + " de la cuenta de " + eur(CUENTA) + ").");
console.log("La mejor de las 15 combinaciones caminantes llegó a |t| = 1,91. Para el listón de " + LISTON + " hace falta " + (LISTON / 1.91).toFixed(1) + "× más separación,");
console.log("o " + Math.round((LISTON / 1.91) ** 2) + "× más días — es decir, del orden de " + Math.round(n * (LISTON / 1.91) ** 2 / 252) + " años de cadenas 0DTE en vez de los " + (n / 252).toFixed(1) + " que hay.");

console.log("\n" + "═".repeat(112));
console.log("  D5 · LO QUE SÍ SE VE SIN NINGÚN AJUSTE · el año a año contra la señal");
console.log("═".repeat(112));
console.log("| año | días | $ del año (1 contrato) | R20 medio del año | ¿la señal habría apagado el año? |");
console.log("|---|---|---|---|---|");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const g = filas.filter((f) => f.fecha.startsWith(a));
  const rs = g.map((f) => f.R20).filter((x) => x != null);
  const r = rs.length ? media(rs) : NaN;
  console.log("| " + a + " | " + g.length + " | " + eur(suma(g.map((f) => f.pl))) + " | " + (rs.length ? r.toFixed(3) : "—") + " | " +
    (rs.length ? (r < 0.24 ? "sí (R bajo)" : "no (R alto)") : "—") + " |");
}
