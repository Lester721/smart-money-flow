// EL CONTRATO QUE ELIGEN · 2 — ¿ES ELECCIÓN O ES HORQUILLA?
//
// El pase 1 deja un patrón que hay que resolver antes de dar nada por bueno: las ÚNICAS celdas
// con exceso positivo son exactamente aquellas donde el emparejamiento por horquilla FALLÓ.
//     ATM·31-90d   horquilla propia 2,9% · vecino emparejado 3,9%  → exceso +0,94%
//     5%·31-90d    3,4% · 4,3%                                     → exceso +0,85%
//     10%·31-90d   4,3% · 5,4%                                     → exceso +1,35%
//     DENTRO·90+d  3,3% · 3,3%  (emparejó bien)                    → exceso +0,55%
//     ATM·90+d     3,2% · 3,2%  (emparejó bien)                    → exceso −0,06%
// Un punto de horquilla sobrante = un punto de "exceso". Eso no es una señal, es un peaje.
//
// AQUÍ SE RESUELVE CON CUATRO PRUEBAS:
//   1. CALIBRE ESTRICTO — sólo vecinos con |Δhorquilla| ≤ 0,3 puntos porcentuales. Si no hay
//      ninguno, el evento SE CAE. No se emparejan peras con manzanas.
//   2. REGRESIÓN — exceso contra Δhorquilla, evento a evento. Si la pendiente es ≈1 y el corte
//      con el eje ≈0, el "hallazgo" es la horquilla entera.
//   3. PLACEBO DEL LADO — el mismo print pero al BID. Si comprar detrás de un vendedor agresivo
//      da el mismo exceso, no se está midiendo agresividad compradora.
//   4. CONTROL DE TICKER — la misma celda, mismo día, OTRO activo sorteado. ¿Eligen el activo?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/contrato-2-horquilla.mjs

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
const CALIBRE = 0.003;          // 0,3 puntos porcentuales de horquilla
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
const BID = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);

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
console.log(`EL CONTRATO QUE ELIGEN · 2 — ¿elección o horquilla?  salida a ${K_SAL} días · calibre ${(100 * CALIBRE).toFixed(1)} pp`);
console.log(`${"═".repeat(112)}\n`);

// ── 1. EVENTOS: el print más grande de cada (activo, día, celda, LADO) ──────────────────────
const porClave = new Map();
for (const dia of diasFlujo("100k")) {
  const dY = dia.replace(/-/g, "");
  for (const o of leerDia(dia, "100k")) {
    const q = parseOCC(o.symbol);
    if (!q) continue;
    if (!setCad.has(q.raiz) || !setDias.get(q.raiz)?.has(dY)) continue;
    if (clase(o.trade_condition_id) !== "UNA") continue;
    const lado = ASK.has(o.side) ? 1 : BID.has(o.side) ? -1 : 0;
    if (lado === 0) continue;
    const prem = Number(o.premium);
    if (!(prem >= MIN_PREM)) continue;
    const et = Number(o.timestamp.slice(11, 13)) - 4 + Number(o.timestamp.slice(14, 16)) / 60;
    if (!(et >= 9.5 && et < 15)) continue;
    let S = Number(o.asset_price);
    if (!(S > 0)) { const c = cierres(q.raiz); S = c ? (c[dY] ?? c[dia]) : 0; }
    if (!(S > 0)) continue;
    const dist = q.tipo === "C" ? q.strike / S - 1 : 1 - q.strike / S;
    const dte = dias(dY, q.exp);
    if (dte < 0) continue;
    const i = idx(DIST, dist), j = idx(PLAZO, dte), k = idx(PRIMA, prem);
    if (i < 0 || j < 0 || k < 0) continue;
    const key = `${q.raiz}|${dY}|${i}|${j}|${k}|${lado}`;
    const a = porClave.get(key);
    if (!a || prem > a.prem) porClave.set(key, { tk: q.raiz, dY, dia, exp: q.exp, tipo: q.tipo, K: q.strike, prem, dist, dte, i, j, k, lado, et });
  }
  process.stdout.write(`\r  leyendo ${dia}  ${fmt(porClave.size)} eventos`);
}
console.log(`\n  ${fmt(porClave.size)} eventos (activo, día, celda, lado)\n`);

// ── 2. PRECIOS REALES + VECINOS (con memoria de charco: 8 eventos comparten el mismo) ───────
const filas = [];
let sinPuja = 0, sinSalida = 0, sinVecinos = 0;
const ordenados = [...porClave.values()].sort((a, b) => (a.tk + a.dY).localeCompare(b.tk + b.dY));
let tkActual = null, hechos = 0;
let charcoKey = null, charco = null;

for (const e of ordenados) {
  if (e.tk !== tkActual) { limpiarCache(); tkActual = e.tk; charcoKey = null; }
  if (++hechos % 1000 === 0) process.stdout.write(`\r  midiendo ${fmt(hechos)}/${fmt(ordenados.length)}  (${fmt(filas.length)} medibles)`);
  const cad = cadena(e.tk, e.dY);
  if (!cad) continue;
  const S = cierres(e.tk)?.[e.dY];
  if (!(S > 0)) continue;
  const q = cad[e.exp]?.[`${e.K}|${e.tipo}`];
  if (!q || !(q[0] > 0) || !(q[1] > 0)) { sinPuja++; continue; }
  const [b0, a0] = q;
  const salida = diasPorTk.get(e.tk).find((d) => d > e.dY && dias(e.dY, d) >= K_SAL);
  if (!salida || salida >= e.exp) { sinSalida++; continue; }
  const vb = bidSalida(e.tk, salida, e.exp, e.tipo, e.K);
  if (vb === null) { sinSalida++; continue; }
  const ret = vb / a0 - 1;
  const horq = (a0 - b0) / a0;

  // charco de vecinos: depende sólo de (activo, día, tipo, celda, salida)
  const ck = `${e.tk}|${e.dY}|${e.tipo}|${e.i}|${e.j}|${salida}`;
  if (ck !== charcoKey) {
    charco = [];
    for (const exp of Object.keys(cad)) {
      const d2 = dias(e.dY, exp);
      if (d2 < 0 || idx(PLAZO, d2) !== e.j || exp <= salida) continue;
      const chain = cad[exp];
      for (const clave of Object.keys(chain)) {
        const [ks, tp] = clave.split("|");
        if (tp !== e.tipo) continue;
        const K2 = Number(ks);
        const dist2 = e.tipo === "C" ? K2 / S - 1 : 1 - K2 / S;
        if (idx(DIST, dist2) !== e.i) continue;
        const [bb, aa] = chain[clave];
        if (!(bb > 0) || !(aa > 0)) continue;
        const v2 = bidSalida(e.tk, salida, exp, tp, K2);
        if (v2 === null) continue;
        charco.push({ exp, K: K2, ret: v2 / aa - 1, horq: (aa - bb) / aa });
      }
    }
    charcoKey = ck;
  }
  const vec = charco.filter((v) => !(v.exp === e.exp && v.K === e.K));
  if (vec.length < 3) { sinVecinos++; continue; }

  const emp5 = [...vec].sort((x, y) => Math.abs(x.horq - horq) - Math.abs(y.horq - horq)).slice(0, 5);
  const cal = vec.filter((v) => Math.abs(v.horq - horq) <= CALIBRE);

  filas.push({
    ticker: e.tk, fechaY: e.dY, fecha: e.dia, tipo: e.tipo, prem: e.prem, lado: e.lado,
    i: e.i, j: e.j, k: e.k, dist: e.dist, dte: e.dte, et: e.et, prima: a0 * 100,
    ret, horq,
    crudo: vec.map((v) => v.ret),
    emp5: emp5.map((v) => v.ret), dHorq5: media(emp5.map((v) => v.horq)) - horq,
    cal: cal.map((v) => v.ret), nCal: cal.length,
    dHorqCal: cal.length ? media(cal.map((v) => v.horq)) - horq : null,
  });
}
console.log(`\r  ${fmt(filas.length)} eventos medibles${" ".repeat(40)}`);
console.log(`  descartes: ${fmt(sinPuja)} sin puja al cierre · ${fmt(sinSalida)} sin salida · ${fmt(sinVecinos)} sin ≥3 vecinos`);
const conCal = filas.filter((f) => f.nCal >= 3);
console.log(`  con ≥3 vecinos DENTRO del calibre de ${(100 * CALIBRE).toFixed(1)} pp: ${fmt(conCal.length)} (${(100 * conCal.length / filas.length).toFixed(1)}%)\n`);

radiografia(filas, ["ret", "horq", "dHorq5", "prima", "dte", "nCal"], "calibre de horquilla", { cerosLegitimos: ["ret", "dHorq5"] });

// ── 3. HERRAMIENTAS ─────────────────────────────────────────────────────────────────────────
const tPorDia = (f, get) => {
  const m = new Map();
  for (const x of f) { if (!m.has(x.fechaY)) m.set(x.fechaY, []); m.get(x.fechaY).push(get(x)); }
  const v = [...m.values()].map(media);
  return { t: tUna(v), nDias: v.length, m: media(v) };
};
function sortear(f, campo, real, semilla) {
  const r = rng(semilla);
  const ms = [];
  for (let s = 0; s < SORTEOS; s++) {
    let acc = 0;
    for (const x of f) { const v = x[campo]; acc += v[Math.floor(r() * v.length)]; }
    ms.push(acc / f.length);
  }
  ms.sort((a, b) => a - b);
  let pos = 0; while (pos < ms.length && ms[pos] < real) pos++;
  return { m: media(ms), p05: ms[Math.floor(SORTEOS * 0.05)], p95: ms[Math.floor(SORTEOS * 0.95)], percentil: pos / SORTEOS };
}
const tercios = (f, get) => {
  const ord = [...f].sort((a, b) => a.fechaY.localeCompare(b.fechaY));
  const k = Math.floor(ord.length / 3);
  if (k < 3) return null;
  const t = [0, 1, 2].map((i) => media((i < 2 ? ord.slice(i * k, (i + 1) * k) : ord.slice(2 * k)).map(get)));
  return { t, mismo: Math.sign(t[0]) === Math.sign(t[1]) && Math.sign(t[1]) === Math.sign(t[2]) };
};
/** Mínimos cuadrados y = a + b·x, con t de la pendiente. */
function regresion(xs, ys) {
  const n = xs.length, mx = media(xs), my = media(ys);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  if (!(sxx > 0)) return null;
  const b = sxy / sxx, a = my - b * mx;
  let sse = 0; for (let i = 0; i < n; i++) sse += (ys[i] - a - b * xs[i]) ** 2;
  const seB = Math.sqrt(sse / (n - 2) / sxx);
  return { a, b, tB: b / seB, n, r2: 1 - sse / ys.reduce((s, y) => s + (y - my) ** 2, 0) };
}

const PRUEBAS = 60;
const LISTON = listonT(PRUEBAS);

// ── 4. LA REJILLA CON CALIBRE ESTRICTO ──────────────────────────────────────────────────────
console.log(`\n${"═".repeat(112)}`);
console.log(`REJILLA · sólo prints al ASK · control = vecino de la MISMA celda con la MISMA horquilla (±${(100 * CALIBRE).toFixed(1)} pp)`);
console.log(`${"═".repeat(112)}`);
console.log(`  listón de |t| con ${PRUEBAS} pruebas: ${LISTON}\n`);
console.log(`  ${"celda".padEnd(28)} ${"n".padStart(5)} ${"nEf".padStart(4)} ${"seguir".padStart(7)} ${"5+cerc".padStart(7)} ${"CALIBRE".padStart(7)} ${"exc5".padStart(6)} ${"excCAL".padStart(7)} ${"t día".padStart(6)} ${"pctil".padStart(5)}  ${"Δhq5".padStart(5)} ${"ΔhqC".padStart(5)}  tercios(cal)`);
const rejilla = [];
for (let i = 0; i < DIST.length; i++) for (let j = 0; j < PLAZO.length; j++) {
  const f0 = filas.filter((x) => x.lado === 1 && x.i === i && x.j === j);
  const f = f0.filter((x) => x.nCal >= 3);
  if (f.length < 40) continue;
  for (const x of f) { x.exc5 = x.ret - media(x.emp5); x.excCal = x.ret - media(x.cal); }
  const td = tPorDia(f, (x) => x.excCal);
  const ne = nEfectiva(f, K_SAL);
  const rMed = media(f.map((x) => x.ret));
  const so = sortear(f, "cal", rMed, 5000 + i * 10 + j);
  const ter = tercios(f, (x) => x.excCal);
  const nombre = `${DIST[i].n} · ${PLAZO[j].n}`;
  console.log(`  ${nombre.padEnd(28)} ${String(f.length).padStart(5)} ${String(ne.porTicker).padStart(4)} ` +
    `${(100 * rMed).toFixed(2).padStart(6)}% ${(100 * media(f.map((x) => media(x.emp5)))).toFixed(2).padStart(6)}% ${(100 * so.m).toFixed(2).padStart(6)}% ` +
    `${(100 * media(f.map((x) => x.exc5))).toFixed(2).padStart(5)}% ${(100 * media(f.map((x) => x.excCal))).toFixed(2).padStart(6)}% ` +
    `${td.t.toFixed(2).padStart(6)}${Math.abs(td.t) >= LISTON ? "◄" : " "} ${(100 * so.percentil).toFixed(0).padStart(4)}% ` +
    ` ${(100 * media(f.map((x) => x.dHorq5))).toFixed(2).padStart(5)} ${(100 * media(f.map((x) => x.dHorqCal))).toFixed(2).padStart(5)}  ${ter ? ter.t.map((v) => (100 * v).toFixed(1)).join("/") + (ter.mismo ? " ✓" : " ✗") : "—"}`);
  rejilla.push({ dist: DIST[i].n, plazo: PLAZO[j].n, n: f.length, nTodos: f0.length, nEf: ne.porTicker, ventanas: ne.ventanas, seguir: rMed, emp5: media(f.map((x) => media(x.emp5))), calibre: so.m, exc5: media(f.map((x) => x.exc5)), excCal: media(f.map((x) => x.excCal)), t: td.t, percentil: so.percentil, dHorq5: media(f.map((x) => x.dHorq5)), dHorqCal: media(f.map((x) => x.dHorqCal)), tercios: ter?.t ?? null, mismoSigno: ter?.mismo ?? null });
}

// ── 5. LA REGRESIÓN: ¿el exceso ES la horquilla? ────────────────────────────────────────────
console.log(`\n${"═".repeat(112)}`);
console.log(`LA REGRESIÓN — exceso del emparejamiento de 5 vecinos contra el sobrante de horquilla`);
console.log(`${"═".repeat(112)}\n`);
{
  const f = filas.filter((x) => x.lado === 1);
  for (const x of f) x.exc5 = x.ret - media(x.emp5);
  const reg = regresion(f.map((x) => x.dHorq5), f.map((x) => x.exc5));
  console.log(`   exceso = ${(100 * reg.a).toFixed(3)}%  +  ${reg.b.toFixed(3)} × Δhorquilla      (n=${fmt(reg.n)} · t de la pendiente ${reg.tB.toFixed(2)} · R² ${(100 * reg.r2).toFixed(1)}%)`);
  console.log(`   → si la pendiente vale ~1 y el corte ~0, el "exceso" es el peaje que NO se pagó, no una elección.`);
  console.log(`   Δhorquilla medio del emparejamiento de 5: ${(100 * media(f.map((x) => x.dHorq5))).toFixed(2)} pp   →  explica ${(100 * reg.b * media(f.map((x) => x.dHorq5))).toFixed(3)}% de los ${(100 * media(f.map((x) => x.exc5))).toFixed(3)}% de exceso`);
  // por celda
  console.log(`\n   la misma cuenta celda a celda:`);
  console.log(`   ${"celda".padEnd(28)} ${"Δhq5".padStart(6)} ${"exc5 real".padStart(10)} ${"exc5 previsto".padStart(14)} ${"resto".padStart(7)}`);
  for (const r of rejilla) {
    const prev = reg.b * (r.dHorq5) + reg.a;
    console.log(`   ${(r.dist + " · " + r.plazo).padEnd(28)} ${(100 * r.dHorq5).toFixed(2).padStart(6)} ${(100 * r.exc5).toFixed(2).padStart(9)}% ${(100 * prev).toFixed(2).padStart(13)}% ${(100 * (r.exc5 - prev)).toFixed(2).padStart(6)}%`);
  }
  writeFileSync("scripts/contrato-2-regresion.json", JSON.stringify(reg, null, 1));
}

// ── 6. PLACEBO DEL LADO — el mismo print, pero al BID ───────────────────────────────────────
console.log(`\n${"═".repeat(112)}`);
console.log(`PLACEBO DEL LADO — si comprar detrás de un VENDEDOR agresivo da lo mismo, no es agresividad`);
console.log(`${"═".repeat(112)}\n`);
console.log(`  ${"grupo".padEnd(34)} ${"lado".padEnd(5)} ${"n".padStart(5)} ${"seguir".padStart(7)} ${"CALIBRE".padStart(7)} ${"exceso".padStart(7)} ${"t día".padStart(6)}`);
const placebo = [];
const GRUPOS = [
  ["TODO", () => true],
  ["EN EL DINERO · 31-90d", (x) => x.i === 1 && x.j === 2],
  ["5% fuera · 31-90d", (x) => x.i === 2 && x.j === 2],
  ["ESQUINA BARATA 3-8%·60-120d", (x) => x.dist >= 0.03 && x.dist <= 0.08 && x.dte >= 60 && x.dte <= 120],
  ["prima ≥$1M", (x) => x.prem >= 1e6],
];
for (const [nombre, sel] of GRUPOS) for (const lado of [1, -1]) {
  const f = filas.filter((x) => x.lado === lado && x.nCal >= 3 && sel(x));
  if (f.length < 40) { console.log(`  ${nombre.padEnd(34)} ${(lado === 1 ? "ASK" : "BID").padEnd(5)} ${String(f.length).padStart(5)}  — muestra corta`); continue; }
  for (const x of f) x.excCal = x.ret - media(x.cal);
  const td = tPorDia(f, (x) => x.excCal);
  console.log(`  ${nombre.padEnd(34)} ${(lado === 1 ? "ASK" : "BID").padEnd(5)} ${String(f.length).padStart(5)} ${(100 * media(f.map((x) => x.ret))).toFixed(2).padStart(6)}% ${(100 * media(f.map((x) => media(x.cal)))).toFixed(2).padStart(6)}% ${(100 * media(f.map((x) => x.excCal))).toFixed(2).padStart(6)}% ${td.t.toFixed(2).padStart(6)}${Math.abs(td.t) >= LISTON ? "◄" : " "}`);
  placebo.push({ grupo: nombre, lado, n: f.length, seguir: media(f.map((x) => x.ret)), calibre: media(f.map((x) => media(x.cal))), exceso: media(f.map((x) => x.excCal)), t: td.t });
}

// ── 7. CONTROL DE TICKER — la misma celda, mismo día, OTRO activo ───────────────────────────
console.log(`\n${"═".repeat(112)}`);
console.log(`CONTROL DE TICKER — ¿eligen el ACTIVO? misma celda y mismo día, activo sorteado`);
console.log(`${"═".repeat(112)}\n`);
const charcoTk = new Map();          // día|celda → [{ticker, rets[]}]
for (const x of filas) {
  if (x.lado !== 1) continue;
  const k = `${x.fechaY}|${x.i}|${x.j}`;
  if (!charcoTk.has(k)) charcoTk.set(k, []);
  charcoTk.get(k).push({ ticker: x.ticker, rets: x.crudo });
}
console.log(`  ${"grupo".padEnd(34)} ${"n".padStart(5)} ${"seguir".padStart(7)} ${"otro activo".padStart(11)} ${"exceso".padStart(7)} ${"pctil".padStart(6)}`);
const ctrlTk = [];
for (const [nombre, sel] of GRUPOS) {
  const f = filas.filter((x) => x.lado === 1 && sel(x)).filter((x) => (charcoTk.get(`${x.fechaY}|${x.i}|${x.j}`) ?? []).some((c) => c.ticker !== x.ticker));
  if (f.length < 40) continue;
  const r = rng(999);
  const ms = [];
  for (let s = 0; s < SORTEOS; s++) {
    let acc = 0;
    for (const x of f) {
      const pool = charcoTk.get(`${x.fechaY}|${x.i}|${x.j}`).filter((c) => c.ticker !== x.ticker);
      const c = pool[Math.floor(r() * pool.length)];
      acc += c.rets[Math.floor(r() * c.rets.length)];
    }
    ms.push(acc / f.length);
  }
  ms.sort((a, b) => a - b);
  const rMed = media(f.map((x) => x.ret));
  let pos = 0; while (pos < ms.length && ms[pos] < rMed) pos++;
  console.log(`  ${nombre.padEnd(34)} ${String(f.length).padStart(5)} ${(100 * rMed).toFixed(2).padStart(6)}% ${(100 * media(ms)).toFixed(2).padStart(10)}% ${(100 * (rMed - media(ms))).toFixed(2).padStart(6)}% ${(100 * pos / SORTEOS).toFixed(0).padStart(5)}%`);
  ctrlTk.push({ grupo: nombre, n: f.length, seguir: rMed, otroActivo: media(ms), exceso: rMed - media(ms), percentil: pos / SORTEOS });
}

writeFileSync("scripts/contrato-2-horquilla.json", JSON.stringify({ K_SAL, CALIBRE, LISTON, n: filas.length, nCal: conCal.length, rejilla, placebo, ctrlTk }, null, 1));
console.log(`\n  → scripts/contrato-2-horquilla.json\n`);
