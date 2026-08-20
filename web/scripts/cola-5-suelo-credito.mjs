// ETAPA 2 — 5 reglas más, declaradas después de ver la Etapa 1. Total de pruebas: 25.
//
// ═══ HONESTIDAD SOBRE EL ORDEN ═══════════════════════════════════════════════════════════════
// Estas 5 se escriben DESPUÉS de mirar los resultados de las 20 primeras. Eso las hace más
// débiles, no más fuertes: son una segunda pasada sobre los mismos 653 días. Por eso el divisor
// del listón sube a 25 y NO se baja. Lo que las justifica no es que hayan salido bien —todavía
// no se han corrido— sino un hecho ESTRUCTURAL que la Etapa 1 destapó:
//
//   La pérdida máxima de un cóndor de ala 50 es (50 − crédito) × 100.
//   El día que MENOS te pagan es el día que MÁS puedes perder.
//
// Los 12 peores días lo confirman: el peor de todos, −$4.900, cobró $100 de crédito, con el VIX
// de ayer en 14,33. El desastre no vive en el pánico: vive en la calma, porque en la calma te
// pagan $100 por arriesgar $4.900.
//
// Eso explica por qué NINGUNA regla de volatilidad de la Etapa 1 bajó el PEOR DÍA: bajan tamaño
// justo donde la pérdida máxima ya es pequeña, y lo dejan entero donde es grande.
//
// Las dos ideas nuevas, las dos sobre la pérdida máxima y no sobre la volatilidad:
//   · TOPE DURO DE RIESGO — contratos = presupuesto / pérdida máxima del día. Acota el peor día
//     por construcción, no por estadística.
//   · SUELO DE CRÉDITO — no vender por menos de X. No es un filtro de régimen: es negarse a un
//     precio. 43:1 de riesgo a premio no es una operación, es vender billetes de lotería.
//
// SIN FUTURO: crédito y pérdida máxima son de las 11:00, del propio precio que se cobra.
// σ entra por percentil MÓVIL de 250 días previos, igual que en la Etapa 1.

import { readFileSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { tWelch, listonT } from "../lib/barreraHallazgos";

const PRUEBAS = 25, PERM = 4000;
const CAPITAL = 56389, COLATERAL = 5000, ALA = 50, VENTANA = 250, MINCAL = 60;
const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

for (const f of filas) f.perdidaMax = ALA * 100 - f.credito;
radiografia(filas, ["pl", "credito", "perdidaMax", "sigma"], "días del cóndor", { maxCeros: 0.2 });

const pSigma = (() => {
  const out = new Array(filas.length).fill(null);
  for (let i = 0; i < filas.length; i++) {
    const h = []; for (let j = Math.max(0, i - VENTANA); j < i; j++) h.push(filas[j].sigma);
    if (h.length < MINCAL) continue;
    out[i] = h.filter((x) => x <= filas[i].sigma).length / h.length;
  }
  return out;
})();

// ── 1 · el hecho estructural, en una tabla ─────────────────────────────────
console.log("═".repeat(120));
console.log("  ETAPA 2 · EL DÍA QUE MENOS TE PAGAN ES EL DÍA QUE MÁS PUEDES PERDER");
console.log("═".repeat(120));
console.log("\n## Riesgo a premio por nivel de crédito · " + filas.length + " días\n");
console.log("| crédito cobrado | días | % gana | media | p5 | PEOR día | pérdida máx. posible | riesgo:premio |");
console.log("|---|---|---|---|---|---|---|---|");
const CORTES = [0, 150, 250, 400, 600, 900, 1400, 1e9];
for (let i = 0; i < CORTES.length - 1; i++) {
  const g = filas.filter((x) => x.credito >= CORTES[i] && x.credito < CORTES[i + 1]);
  if (!g.length) continue;
  const p = g.map((x) => x.pl), c = media(g.map((x) => x.credito));
  console.log("| " + eur(CORTES[i]) + "–" + (CORTES[i + 1] > 1e8 ? "∞" : eur(CORTES[i + 1])) + " | " + g.length +
    " | " + ((g.filter((x) => x.pl > 0).length / g.length) * 100).toFixed(0) + "% | " + eur(media(p)) +
    " | " + eur(pctl(p, 0.05)) + " | " + eur(Math.min(...p)) + " | " + eur(5000 - c) + " | " + ((5000 - c) / c).toFixed(1) + ":1 |");
}
console.log("\n  La pérdida máxima NO es una estimación: es (ancho − crédito) × 100, aritmética del contrato.");

// ── 2 · el suelo de crédito, con TRES TERCIOS ──────────────────────────────
console.log("\n## El suelo de crédito, período a período (tres tercios, no dos mitades)\n");
const t3 = Math.floor(filas.length / 3);
const periodos = [["1er tercio", filas.slice(0, t3)], ["2º tercio", filas.slice(t3, 2 * t3)],
                  ["3er tercio", filas.slice(2 * t3)], ["TODO", filas]];
console.log("| suelo | período | días cortados | media de los CORTADOS | media del resto | diferencia | t |");
console.log("|---|---|---|---|---|---|---|");
const suelos = [150, 250];
for (const S of suelos) {
  for (const [nom, g] of periodos) {
    const bajo = g.filter((f) => f.credito < S).map((f) => f.pl);
    const alto = g.filter((f) => f.credito >= S).map((f) => f.pl);
    if (bajo.length < 3) { console.log("| " + eur(S) + " | " + nom + " | " + bajo.length + " | muestra corta | | | |"); continue; }
    console.log("| " + eur(S) + " | " + nom + " | " + bajo.length + " | " + eur(media(bajo)) + " | " + eur(media(alto)) +
      " | " + eur(media(bajo) - media(alto)) + " | " + tWelch(bajo, alto).toFixed(2) + " |");
  }
}
console.log("\n  listón de |t| con " + PRUEBAS + " pruebas declaradas: " + listonT(PRUEBAS));

// ── 3 · las 5 reglas nuevas ────────────────────────────────────────────────
const acota = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const mC2 = (i) => (pSigma[i] != null && pSigma[i] > 2 / 3 ? 0.5 : 1);
const REGLAS = [
  ["E1", "tope duro de riesgo: contratos = $3.900 / pérdida máxima del día (sin cota superior)",
    (i) => 3900 / filas[i].perdidaMax],
  ["E2", "el mínimo de las dos: tope duro de riesgo Y mitad si σ en tercio alto",
    (i) => Math.min(3900 / filas[i].perdidaMax, mC2(i))],
  ["E3", "SUELO: no operar si el crédito no llega a $150 (riesgo:premio peor que 32:1)",
    (i) => (filas[i].credito < 150 ? 0 : 1)],
  ["E4", "SUELO: no operar si el crédito no llega a $250 (riesgo:premio peor que 19:1)",
    (i) => (filas[i].credito < 250 ? 0 : 1)],
  ["E5", "suelo de $150 + mitad si σ está en el tercio alto",
    (i) => (filas[i].credito < 150 ? 0 : mC2(i))],
];

function metricas(tams) {
  const p = filas.map((f, i) => f.pl * tams[i]);
  const n = p.length, tot = p.reduce((a, b) => a + b, 0);
  let pico = 0, ac = 0, dd = 0;
  for (const x of p) { ac += x; pico = Math.max(pico, ac); dd = Math.min(dd, ac - pico); }
  return { anual: tot / (n / 252), peorDia: Math.min(...p), p1: pctl(p, 0.01), p5: pctl(p, 0.05), dd,
           tamMedio: media(tams), maxTam: Math.max(...tams), fuera: tams.filter((t) => t === 0).length, p };
}
const base = metricas(filas.map(() => 1));
const TRIVIAL = base.anual / -base.dd;

console.log("\n## Las 5 reglas de la Etapa 2 · tamaño base 1 contrato\n");
console.log("| id | regla | tam. medio | días fuera | $/año | % ingreso | peor día | p1 | p5 | PEOR RACHA | cambio $/$ |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const res = [];
for (const [id, desc, fn] of REGLAS) {
  const tams = filas.map((_, i) => fn(i));
  const m = metricas(tams);
  const perd = base.anual - m.anual, quit = -base.dd - -m.dd;
  const cambio = quit > 0 ? perd / quit : null;
  res.push({ id, desc, tams, ...m, cambio, perd, quit });
  console.log("| **" + id + "** | " + desc.slice(0, 58) + " | " + m.tamMedio.toFixed(2) + " | " + m.fuera +
    " | " + eur(m.anual) + " | " + ((m.anual / base.anual) * 100).toFixed(0) + "% | " + eur(m.peorDia) +
    " | " + eur(m.p1) + " | " + eur(m.p5) + " | " + eur(m.dd) + " | " +
    (cambio == null ? (quit > 0 ? "0 (gratis)" : "—") : cambio <= 0 ? "**" + cambio.toFixed(2) + " (GRATIS: sube el ingreso)**" : cambio.toFixed(2)) + " |");
}
console.log("\n  listón trivial (operar más pequeño): " + TRIVIAL.toFixed(2) + " $ de ingreso por $ de caída.");
console.log("  Un cambio NEGATIVO significa que la regla quita caída Y AÑADE ingreso: no hay nada que cambiar.");

// ── 4 · la misma prueba de permutación de la Etapa 1 ──────────────────────
let sem = 424242; const rnd = () => { sem ^= sem << 13; sem ^= sem >>> 17; sem ^= sem << 5; sem >>>= 0; return sem / 4294967296; };
function medirEsc(tams) {
  const p = filas.map((f, i) => f.pl * tams[i]);
  const tot = p.reduce((a, b) => a + b, 0), anual = tot / (p.length / 252);
  if (!(anual > 0)) return null;
  const k = base.anual / anual;
  let pico = 0, ac = 0, dd = 0;
  for (const x of p) { ac += x; pico = Math.max(pico, ac); dd = Math.min(dd, ac - pico); }
  return { k, dd: dd * k, peorDia: Math.min(...p) * k, p1: pctl(p, 0.01) * k, p5: pctl(p, 0.05) * k };
}
const UMBRAL = 5 / PRUEBAS;
console.log("\n## ¿Eligen días o sólo operan más pequeño? · " + PERM.toLocaleString("es-ES") +
            " barajados · todo reescalado a " + eur(base.anual) + "/año\n");
console.log("  Referencia del contrato fijo: peor día " + eur(base.peorDia) + " · p1 " + eur(base.p1) +
            " · p5 " + eur(base.p5) + " · caída " + eur(base.dd));
console.log("  Listón de percentil por azar con " + PRUEBAS + " pruebas: " + UMBRAL.toFixed(2) + "%\n");
console.log("| id | factor | peor día | pct | p1 | pct | p5 | pct | PEOR RACHA | pct | medidas que pasan |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const veredicto = [];
for (const r of res) {
  const real = medirEsc(r.tams);
  const d = { dd: [], peorDia: [], p1: [], p5: [] }, t = [...r.tams];
  for (let s = 0; s < PERM; s++) {
    for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const x = t[i]; t[i] = t[j]; t[j] = x; }
    const m = medirEsc(t); if (!m) continue;
    d.dd.push(m.dd); d.peorDia.push(m.peorDia); d.p1.push(m.p1); d.p5.push(m.p5);
  }
  const pc = (v, x) => (v.filter((y) => y >= x).length / v.length) * 100;
  const q = { dd: pc(d.dd, real.dd), peorDia: pc(d.peorDia, real.peorDia), p1: pc(d.p1, real.p1), p5: pc(d.p5, real.p5) };
  const pasan = [q.peorDia, q.p1, q.p5, q.dd].filter((x) => x <= UMBRAL).length;
  const mk = (x) => (x <= UMBRAL ? "**" + x.toFixed(2) + "%**" : x.toFixed(1) + "%");
  console.log("| **" + r.id + "** | ×" + real.k.toFixed(2) + " | " + eur(real.peorDia) + " | " + mk(q.peorDia) +
    " | " + eur(real.p1) + " | " + mk(q.p1) + " | " + eur(real.p5) + " | " + mk(q.p5) +
    " | " + eur(real.dd) + " | " + mk(q.dd) + " | " + (pasan ? "🟢 **" + pasan + "/4**" : "0/4") + " |");
  veredicto.push({ id: r.id, desc: r.desc, real, q, pasan, medBaraj: { p1: pctl(d.p1, 0.5), p5: pctl(d.p5, 0.5), dd: pctl(d.dd, 0.5), peorDia: pctl(d.peorDia, 0.5) } });
}

console.log("\n## Cuánto capital hace falta y qué se lleva a casa\n");
console.log("| id | contratos medios | contratos máx | colateral máximo | $/año a 1 contrato base | caída | caída / capital |");
console.log("|---|---|---|---|---|---|---|");
console.log("| fijo | 1.00 | 1 | " + eur(COLATERAL) + " | " + eur(base.anual) + " | " + eur(base.dd) + " | " + ((-base.dd / CAPITAL) * 100).toFixed(1) + "% |");
for (const r of res)
  console.log("| **" + r.id + "** | " + r.tamMedio.toFixed(2) + " | " + r.maxTam.toFixed(2) + " | " + eur(r.maxTam * COLATERAL) +
    " | " + eur(r.anual) + " | " + eur(r.dd) + " | " + ((-r.dd / CAPITAL) * 100).toFixed(1) + "% |");

writeFileSync("scripts/cola-5-suelo-credito.json", JSON.stringify(
  { base: { anual: base.anual, dd: base.dd, peorDia: base.peorDia, p1: base.p1, p5: base.p5 },
    reglas: res.map(({ tams, p, ...r }) => r), permutacion: veredicto }, null, 2), "utf8");
console.log("\n  detalle en scripts/cola-5-suelo-credito.json");
