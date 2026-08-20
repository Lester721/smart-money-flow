// EL CONTRATO QUE ELIGEN · 1 — ¿HAY UNA CELDA DONDE SEGUIR AL DINERO GRANDE FUNCIONE?
//
// LA REGLA QUE SE MIDE (la que Lester ejecutaría):
//   1. durante la sesión, antes de las 15:00 ET, ves en la cinta un print de UNA PATA ejecutado
//      AL ASK por ≥ X dólares de prima
//   2. compras ESE MISMO contrato al cierre de ese día, al ASK REAL de la cadena
//   3. lo vendes al BID REAL a los K_SAL días
//
// LOS TRES CONTROLES (sin ellos el número no vale nada):
//   A. VECINO DE CELDA      — otro contrato del MISMO activo, MISMO día, MISMA celda de la
//                             rejilla, que nadie golpeó. Pregunta: ¿eligieron bien el CONTRATO?
//   B. VECINO EMPAREJADO POR HORQUILLA — igual que A pero sorteando entre los 5 vecinos de
//                             horquilla más parecida. Es el control que mató el hallazgo del
//                             2026-08-16: el flujo vive en los strikes líquidos y la horquilla
//                             es un % de la prima, así que "seguir al flujo" paga menos peaje
//                             sin haber acertado nada.
//   C. TICKER SORTEADO      — la misma celda pero en OTRO activo del mismo día. Pregunta:
//                             ¿eligieron bien el ACTIVO?
//   500 sorteos completos de cartera para cada control → percentil empírico, no sólo una media.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/contrato-1-rejilla.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import {
  cadena, cierres, diasDe, tickersConCadena, bidSalida, limpiarCache,
  dias, media, sd, tUna, pctl, fmt, rng, nEfectiva,
} from "./print-lib.mjs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT, pasarBarrera } from "../lib/barreraHallazgos.ts";
import { conditionOf } from "../lib/conditions.ts";

const CUENTA = 56389;
const K_SAL = Number(process.env.K_SAL || 5);
const SORTEOS = 500;
const MIN_PREM = 100e3;

const MULTI = new Set(["MLET", "MLAT", "MLCT", "MLFT", "CBMO", "MCTP", "MESL", "MASL", "MFSL"]);
const ACCOPC = new Set(["TLAT", "TLET", "TLCT", "TLFT", "TESL", "TASL", "TFSL"]);
const BASURA = new Set(["CANC", "OSEQ", "CNCL", "LATE", "CNCO", "OPEN", "CNOL", "OPNL", "REOP", "EXHT"]);
function clase(id) {
  const c = conditionOf(id);
  if (!c) return "SIN_ID";
  if (BASURA.has(c.code)) return "BASURA";
  if (MULTI.has(c.code)) return "MULTI";
  if (ACCOPC.has(c.code)) return "ACCOPC";
  return "UNA";
}
const ASK = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);

const DIST = [
  { n: "DENTRO", lo: -Infinity, hi: -0.02 },
  { n: "EN EL DINERO", lo: -0.02, hi: 0.02 },
  { n: "5% fuera", lo: 0.02, hi: 0.075 },
  { n: "10% fuera", lo: 0.075, hi: 0.15 },
  { n: "20% fuera", lo: 0.15, hi: 0.30 },
  { n: "LEJÍSIMOS", lo: 0.30, hi: Infinity },
];
const PLAZO = [
  { n: "0-7d", lo: 0, hi: 8 },
  { n: "8-30d", lo: 8, hi: 31 },
  { n: "31-90d", lo: 31, hi: 91 },
  { n: "90+d", lo: 91, hi: Infinity },
];
const PRIMA = [
  { n: "$100-250k", lo: 100e3, hi: 250e3 },
  { n: "$250k-1M", lo: 250e3, hi: 1e6 },
  { n: "$1-2,5M", lo: 1e6, hi: 2.5e6 },
  { n: "$2,5M+", lo: 2.5e6, hi: Infinity },
];
const idx = (arr, v) => arr.findIndex((b) => v >= b.lo && v < b.hi);

const conCad = tickersConCadena().filter((t) => cierres(t));
const diasPorTk = new Map(conCad.map((t) => [t, diasDe(t).filter((d) => d >= "20260415")]));
const setDias = new Map(conCad.map((t) => [t, new Set(diasPorTk.get(t))]));
const setCad = new Set(conCad);

console.log(`\n${"═".repeat(112)}`);
console.log(`EL CONTRATO QUE ELIGEN · seguir el print al ASK · salida a ${K_SAL} días · ${SORTEOS} sorteos de control`);
console.log(`${"═".repeat(112)}`);
console.log(`  ${conCad.length} activos con cadena en disco: ${conCad.join(" ")}\n`);

// ── 1. EVENTOS: el print más grande de cada (activo, día, celda) ────────────────────────────
const porClave = new Map();
let brutos = 0, noCad = 0, noUna = 0, noAsk = 0, tarde = 0;
for (const dia of diasFlujo("100k")) {
  const dY = dia.replace(/-/g, "");
  for (const o of leerDia(dia, "100k")) {
    brutos++;
    const q = parseOCC(o.symbol);
    if (!q) continue;
    if (!setCad.has(q.raiz) || !setDias.get(q.raiz)?.has(dY)) { noCad++; continue; }
    if (clase(o.trade_condition_id) !== "UNA") { noUna++; continue; }
    if (!ASK.has(o.side)) { noAsk++; continue; }
    const prem = Number(o.premium);
    if (!(prem >= MIN_PREM)) continue;
    const et = Number(o.timestamp.slice(11, 13)) - 4 + Number(o.timestamp.slice(14, 16)) / 60;
    if (!(et >= 9.5 && et < 15)) { tarde++; continue; }
    let S = Number(o.asset_price);
    if (!(S > 0)) { const c = cierres(q.raiz); S = c ? (c[dY] ?? c[dia]) : 0; }
    if (!(S > 0)) continue;
    const dist = q.tipo === "C" ? q.strike / S - 1 : 1 - q.strike / S;
    const dte = dias(dY, q.exp);
    if (dte < 0) continue;
    const i = idx(DIST, dist), j = idx(PLAZO, dte), k = idx(PRIMA, prem);
    if (i < 0 || j < 0 || k < 0) continue;
    const key = `${q.raiz}|${dY}|${i}|${j}|${k}`;
    const a = porClave.get(key);
    if (!a || prem > a.prem) porClave.set(key, { tk: q.raiz, dY, dia, exp: q.exp, tipo: q.tipo, K: q.strike, prem, dist, dte, i, j, k, et });
  }
  process.stdout.write(`\r  ${dia}  ${fmt(porClave.size)} eventos`);
}
console.log(`\n  de ${fmt(brutos)} prints: ${fmt(noCad)} sin cadena del activo · ${fmt(noUna)} no son de una pata · ${fmt(noAsk)} no van al ask · ${fmt(tarde)} fuera de 9:30-15:00 ET`);
console.log(`  → ${fmt(porClave.size)} eventos (activo, día, celda), el print MÁS GRANDE de cada uno\n`);

// ── 2. PRECIOS REALES: entrada al ask, salida al bid, y los vecinos de la misma celda ───────
const filas = [];
let sinCad = 0, sinPuja = 0, sinSalida = 0, sinVecinos = 0;
const ordenados = [...porClave.values()].sort((a, b) => (a.tk + a.dY).localeCompare(b.tk + b.dY));
let tkActual = null, hechos = 0;
for (const e of ordenados) {
  if (e.tk !== tkActual) { limpiarCache(); tkActual = e.tk; }
  if (++hechos % 500 === 0) process.stdout.write(`\r  midiendo ${fmt(hechos)}/${fmt(ordenados.length)}  (${fmt(filas.length)} medibles)`);
  const cad = cadena(e.tk, e.dY);
  if (!cad) { sinCad++; continue; }
  const S = cierres(e.tk)?.[e.dY];
  if (!(S > 0)) { sinCad++; continue; }
  const q = cad[e.exp]?.[`${e.K}|${e.tipo}`];
  if (!q || !(q[0] > 0) || !(q[1] > 0)) { sinPuja++; continue; }
  const [b0, a0] = q;
  const salida = diasPorTk.get(e.tk).find((d) => d > e.dY && dias(e.dY, d) >= K_SAL);
  if (!salida || salida >= e.exp) { sinSalida++; continue; }
  const vb = bidSalida(e.tk, salida, e.exp, e.tipo, e.K);
  if (vb === null) { sinSalida++; continue; }
  const ret = vb / a0 - 1;
  const horq = (a0 - b0) / a0;

  // ── VECINOS: mismo activo, mismo día, mismo tipo, MISMA celda de distancia y plazo ──
  const vec = [];
  for (const exp of Object.keys(cad)) {
    const d2 = dias(e.dY, exp);
    if (d2 < 0 || idx(PLAZO, d2) !== e.j) continue;
    if (exp <= salida) continue;
    const chain = cad[exp];
    for (const clave of Object.keys(chain)) {
      const [ks, tp] = clave.split("|");
      if (tp !== e.tipo) continue;
      const K2 = Number(ks);
      if (exp === e.exp && K2 === e.K) continue;
      const dist2 = e.tipo === "C" ? K2 / S - 1 : 1 - K2 / S;
      if (idx(DIST, dist2) !== e.i) continue;
      const [bb, aa] = chain[clave];
      if (!(bb > 0) || !(aa > 0)) continue;
      const v2 = bidSalida(e.tk, salida, exp, tp, K2);
      if (v2 === null) continue;
      vec.push({ ret: v2 / aa - 1, horq: (aa - bb) / aa });
    }
  }
  if (vec.length < 3) { sinVecinos++; continue; }
  // los 5 vecinos de horquilla más parecida → control emparejado por liquidez
  const porHorq = [...vec].sort((x, y) => Math.abs(x.horq - horq) - Math.abs(y.horq - horq)).slice(0, 5);

  filas.push({
    ticker: e.tk, fechaY: e.dY, fecha: e.dia, tipo: e.tipo, K: e.K, exp: e.exp, prem: e.prem,
    i: e.i, j: e.j, k: e.k, dist: e.dist, dte: e.dte, et: e.et,
    ret, horq, prima: a0 * 100, salida,
    vec: vec.map((v) => v.ret), vecEmp: porHorq.map((v) => v.ret),
    horqVec: media(vec.map((v) => v.horq)), horqEmp: media(porHorq.map((v) => v.horq)),
    nVec: vec.length,
  });
}
console.log(`\r  ${fmt(filas.length)} eventos medibles con precios reales${" ".repeat(30)}`);
console.log(`  descartes: ${fmt(sinCad)} sin cadena/cierre · ${fmt(sinPuja)} el contrato no cotizaba al cierre · ${fmt(sinSalida)} sin cadena de salida o vence antes · ${fmt(sinVecinos)} sin ≥3 vecinos de celda\n`);

radiografia(filas, ["ret", "horq", "prima", "dte", "dist", "nVec", "horqVec"], "rejilla del contrato", { cerosLegitimos: ["ret"] });

// ── 3. HERRAMIENTAS DE MEDIDA ───────────────────────────────────────────────────────────────
const tPorDia = (f, get) => {
  const m = new Map();
  for (const x of f) { const d = x.fechaY; if (!m.has(d)) m.set(d, []); m.get(d).push(get(x)); }
  const v = [...m.values()].map(media);
  return { t: tUna(v), nDias: v.length, m: media(v) };
};
const porTickerEq = (f, get) => {
  const m = new Map();
  for (const x of f) { if (!m.has(x.ticker)) m.set(x.ticker, []); m.get(x.ticker).push(get(x)); }
  return media([...m.values()].map(media));
};
/** Sorteo completo de cartera, SORTEOS veces. Devuelve media del control y percentil del real. */
function sortear(f, campo, real, semilla) {
  const r = rng(semilla);
  const medias = [];
  for (let s = 0; s < SORTEOS; s++) {
    let acc = 0;
    for (const x of f) { const v = x[campo]; acc += v[Math.floor(r() * v.length)]; }
    medias.push(acc / f.length);
  }
  medias.sort((a, b) => a - b);
  let pos = 0; while (pos < medias.length && medias[pos] < real) pos++;
  return { m: media(medias), p05: medias[Math.floor(SORTEOS * 0.05)], p95: medias[Math.floor(SORTEOS * 0.95)], percentil: pos / SORTEOS };
}
const tercios = (f, get) => {
  const ord = [...f].sort((a, b) => a.fechaY.localeCompare(b.fechaY));
  const k = Math.floor(ord.length / 3);
  if (k < 3) return null;
  const t = [0, 1, 2].map((i) => media((i < 2 ? ord.slice(i * k, (i + 1) * k) : ord.slice(2 * k)).map(get)));
  return { t, mismo: Math.sign(t[0]) === Math.sign(t[1]) && Math.sign(t[1]) === Math.sign(t[2]) };
};

// ── 4. LA REJILLA ───────────────────────────────────────────────────────────────────────────
const PRUEBAS = DIST.length * PLAZO.length + PRIMA.length + 12;
const LISTON = listonT(PRUEBAS);
console.log(`\n${"═".repeat(112)}`);
console.log(`LA REJILLA — comprar al ASK real el contrato golpeado, vender al BID real a los ${K_SAL} días`);
console.log(`${"═".repeat(112)}`);
console.log(`  EXCESO = seguir al print − vecino de la MISMA celda del MISMO activo, EMPAREJADO POR HORQUILLA`);
console.log(`  listón de |t| con ${PRUEBAS} pruebas (Bonferroni): ${LISTON}\n`);
console.log(`  ${"celda".padEnd(28)} ${"n".padStart(5)} ${"nEf".padStart(4)} ${"seguir".padStart(7)} ${"vecino".padStart(7)} ${"emparej".padStart(7)} ${"EXCESO".padStart(7)} ${"t día".padStart(6)} ${"pctil".padStart(6)}  ${"horq".padStart(5)}/${"vec".padStart(5)}  tercios`);
const rejilla = [];
for (let i = 0; i < DIST.length; i++) for (let j = 0; j < PLAZO.length; j++) {
  const f = filas.filter((x) => x.i === i && x.j === j);
  if (f.length < 40) continue;
  for (const x of f) x.exc = x.ret - media(x.vecEmp);
  const td = tPorDia(f, (x) => x.exc);
  const ne = nEfectiva(f, K_SAL);
  const rMed = media(f.map((x) => x.ret));
  const so = sortear(f, "vecEmp", rMed, 12345 + i * 100 + j);
  const ter = tercios(f, (x) => x.exc);
  const nombre = `${DIST[i].n} · ${PLAZO[j].n}`;
  console.log(`  ${nombre.padEnd(28)} ${String(f.length).padStart(5)} ${String(ne.porTicker).padStart(4)} ` +
    `${(100 * rMed).toFixed(2).padStart(6)}% ${(100 * media(f.map((x) => media(x.vec)))).toFixed(2).padStart(6)}% ${(100 * so.m).toFixed(2).padStart(6)}% ` +
    `${(100 * media(f.map((x) => x.exc))).toFixed(2).padStart(6)}% ${td.t.toFixed(2).padStart(6)}${Math.abs(td.t) >= LISTON ? "◄" : " "} ${(100 * so.percentil).toFixed(0).padStart(5)}% ` +
    ` ${(100 * media(f.map((x) => x.horq))).toFixed(1).padStart(4)}%/${(100 * media(f.map((x) => x.horqEmp))).toFixed(1).padStart(4)}%  ${ter ? ter.t.map((v) => (100 * v).toFixed(1)).join("/") + (ter.mismo ? " ✓" : " ✗") : "—"}`);
  rejilla.push({ dist: DIST[i].n, plazo: PLAZO[j].n, n: f.length, nEf: ne.porTicker, ventanas: ne.ventanas, seguir: rMed, vecino: media(f.map((x) => media(x.vec))), emparejado: so.m, exceso: media(f.map((x) => x.exc)), t: td.t, percentil: so.percentil, horq: media(f.map((x) => x.horq)), horqEmp: media(f.map((x) => x.horqEmp)), tercios: ter?.t ?? null, mismoSigno: ter?.mismo ?? null });
}

// ── 5. POR TAMAÑO DE PRIMA, dentro de la esquina barata y fuera ─────────────────────────────
console.log(`\n${"═".repeat(112)}`);
console.log(`POR TAMAÑO DE LA PRIMA — ¿el print más grande elige mejor?`);
console.log(`${"═".repeat(112)}\n`);
console.log(`  ${"grupo".padEnd(34)} ${"n".padStart(5)} ${"nEf".padStart(4)} ${"seguir".padStart(7)} ${"emparej".padStart(7)} ${"EXCESO".padStart(7)} ${"t día".padStart(6)} ${"pctil".padStart(6)}  tercios`);
const porPrima = [];
const ESQ = (x) => x.dist >= 0.03 && x.dist <= 0.08 && x.dte >= 60 && x.dte <= 120;
for (const [nombre, sel] of [["TODA la rejilla", () => true], ["ESQUINA BARATA 3-8% · 60-120d", ESQ]]) {
  for (let k = 0; k < PRIMA.length; k++) {
    const f = filas.filter((x) => x.k === k && sel(x));
    if (f.length < 40) { continue; }
    for (const x of f) x.exc = x.ret - media(x.vecEmp);
    const td = tPorDia(f, (x) => x.exc);
    const ne = nEfectiva(f, K_SAL);
    const rMed = media(f.map((x) => x.ret));
    const so = sortear(f, "vecEmp", rMed, 777 + k);
    const ter = tercios(f, (x) => x.exc);
    console.log(`  ${(nombre + " " + PRIMA[k].n).padEnd(34)} ${String(f.length).padStart(5)} ${String(ne.porTicker).padStart(4)} ${(100 * rMed).toFixed(2).padStart(6)}% ${(100 * so.m).toFixed(2).padStart(6)}% ${(100 * media(f.map((x) => x.exc))).toFixed(2).padStart(6)}% ${td.t.toFixed(2).padStart(6)}${Math.abs(td.t) >= LISTON ? "◄" : " "} ${(100 * so.percentil).toFixed(0).padStart(5)}%  ${ter ? ter.t.map((v) => (100 * v).toFixed(1)).join("/") + (ter.mismo ? " ✓" : " ✗") : "—"}`);
    porPrima.push({ grupo: nombre, prima: PRIMA[k].n, n: f.length, nEf: ne.porTicker, seguir: rMed, emparejado: so.m, exceso: media(f.map((x) => x.exc)), t: td.t, percentil: so.percentil, tercios: ter?.t ?? null, mismoSigno: ter?.mismo ?? null });
  }
}

writeFileSync("scripts/contrato-1-rejilla.json", JSON.stringify({ K_SAL, LISTON, n: filas.length, rejilla, porPrima }, null, 1));

// ── 6. GUARDAR LAS FILAS para el pase 2 (control de ticker + dinero) ────────────────────────
writeFileSync("scripts/contrato-1-filas.json", JSON.stringify(filas.map((x) => ({
  ticker: x.ticker, fechaY: x.fechaY, fecha: x.fecha, tipo: x.tipo, K: x.K, exp: x.exp, prem: x.prem,
  i: x.i, j: x.j, k: x.k, dist: x.dist, dte: x.dte, et: x.et, ret: x.ret, horq: x.horq, prima: x.prima,
  vecEmp: x.vecEmp, vec: x.vec.length > 30 ? x.vec.slice(0, 30) : x.vec, nVec: x.nVec, horqEmp: x.horqEmp,
}))));
console.log(`\n  → scripts/contrato-1-rejilla.json · scripts/contrato-1-filas.json (${fmt(filas.length)} filas)\n`);
