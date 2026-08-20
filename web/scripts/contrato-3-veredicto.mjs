// EL CONTRATO QUE ELIGEN · 3 — VEREDICTO Y DINERO.
//
// Queda UNA afirmación viva del pase 2: seguir el ACTIVO del feed da −4,33% contra −6,29% de un
// activo sorteado (+1,96 puntos, percentil 100). Pero ese sorteo NO estaba emparejado por
// horquilla, que es exactamente el error del 2026-08-16. El feed se concentra en los activos
// líquidos; los contratos sorteados de un activo cualquiera tienen la horquilla más ancha.
// Aquí se sortea el activo EMPAREJANDO POR HORQUILLA y se ve qué queda.
//
// Y se cierra con lo único que a Lester le sirve: el MAPA DE NIVEL — cuánto cuesta de verdad
// estar en cada celda de la rejilla — y los dólares al año.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/contrato-3-veredicto.mjs

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
const CALIBRE = 0.003;
const MIN_PREM = 100e3;
const MUESTRA_CHARCO = 40;      // cuántos vecinos se guardan por evento para los sorteos

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
  { n: "0-7d", lo: 0, hi: 8 }, { n: "8-30d", lo: 8, hi: 31 },
  { n: "31-90d", lo: 31, hi: 91 }, { n: "90+d", lo: 91, hi: Infinity },
];
const PRIMA = [
  { n: "$100-250k", lo: 100e3, hi: 250e3 }, { n: "$250k-1M", lo: 250e3, hi: 1e6 },
  { n: "$1-2,5M", lo: 1e6, hi: 2.5e6 }, { n: "$2,5M+", lo: 2.5e6, hi: Infinity },
];
const idx = (arr, v) => arr.findIndex((b) => v >= b.lo && v < b.hi);

const conCad = tickersConCadena().filter((t) => cierres(t));
const diasPorTk = new Map(conCad.map((t) => [t, diasDe(t).filter((d) => d >= "20260415")]));
const setDias = new Map(conCad.map((t) => [t, new Set(diasPorTk.get(t))]));
const setCad = new Set(conCad);

console.log(`\n${"═".repeat(112)}`);
console.log(`EL CONTRATO QUE ELIGEN · 3 — veredicto · salida a ${K_SAL} días · ${SORTEOS} sorteos · calibre ${(100 * CALIBRE).toFixed(1)} pp`);
console.log(`${"═".repeat(112)}\n`);

// ── 1. EVENTOS ──────────────────────────────────────────────────────────────────────────────
const porClave = new Map();
for (const dia of diasFlujo("100k")) {
  const dY = dia.replace(/-/g, "");
  for (const o of leerDia(dia, "100k")) {
    const q = parseOCC(o.symbol);
    if (!q || !setCad.has(q.raiz) || !setDias.get(q.raiz)?.has(dY)) continue;
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

// ── 2. PRECIOS REALES + CHARCO CON HORQUILLAS ───────────────────────────────────────────────
const filas = [];
const ordenados = [...porClave.values()].sort((a, b) => (a.tk + a.dY).localeCompare(b.tk + b.dY));
let tkActual = null, hechos = 0, charcoKey = null, charco = null;
const rMuestra = rng(4242);
for (const e of ordenados) {
  if (e.tk !== tkActual) { limpiarCache(); tkActual = e.tk; charcoKey = null; }
  if (++hechos % 2000 === 0) process.stdout.write(`\r  midiendo ${fmt(hechos)}/${fmt(ordenados.length)}  (${fmt(filas.length)})`);
  const cad = cadena(e.tk, e.dY);
  const S = cierres(e.tk)?.[e.dY];
  if (!cad || !(S > 0)) continue;
  const q = cad[e.exp]?.[`${e.K}|${e.tipo}`];
  if (!q || !(q[0] > 0) || !(q[1] > 0)) continue;
  const [b0, a0] = q;
  const salida = diasPorTk.get(e.tk).find((d) => d > e.dY && dias(e.dY, d) >= K_SAL);
  if (!salida || salida >= e.exp) continue;
  const vb = bidSalida(e.tk, salida, e.exp, e.tipo, e.K);
  if (vb === null) continue;
  const ret = vb / a0 - 1;
  const horq = (a0 - b0) / a0;

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
  if (vec.length < 3) continue;
  const cal = vec.filter((v) => Math.abs(v.horq - horq) <= CALIBRE);
  // muestra del charco (con horquilla) para los sorteos entre activos
  let muestra = vec;
  if (vec.length > MUESTRA_CHARCO) {
    muestra = [];
    for (let s = 0; s < MUESTRA_CHARCO; s++) muestra.push(vec[Math.floor(rMuestra() * vec.length)]);
  }

  filas.push({
    ticker: e.tk, fechaY: e.dY, fecha: e.dia, tipo: e.tipo, prem: e.prem, lado: e.lado,
    i: e.i, j: e.j, k: e.k, dist: e.dist, dte: e.dte, et: e.et, prima: a0 * 100,
    ret, horq,
    cal: cal.map((v) => v.ret), nCal: cal.length,
    pool: muestra.map((v) => [v.ret, v.horq]),
  });
}
console.log(`\r  ${fmt(filas.length)} eventos medibles${" ".repeat(40)}\n`);
radiografia(filas, ["ret", "horq", "prima", "dte", "dist", "nCal"], "veredicto", { cerosLegitimos: ["ret"] });

const PRUEBAS = 60, LISTON = listonT(PRUEBAS);
const tPorDia = (f, get) => {
  const m = new Map();
  for (const x of f) { if (!m.has(x.fechaY)) m.set(x.fechaY, []); m.get(x.fechaY).push(get(x)); }
  const v = [...m.values()].map(media);
  return { t: tUna(v), nDias: v.length };
};

// ── 3. CONTROL DE ACTIVO, EMPAREJADO POR HORQUILLA ──────────────────────────────────────────
console.log(`\n${"═".repeat(112)}`);
console.log(`CONTROL DE ACTIVO — misma celda, mismo día, OTRO activo. CRUDO contra EMPAREJADO POR HORQUILLA`);
console.log(`${"═".repeat(112)}\n`);
const pools = new Map();                     // día|celda → [{ticker, pares}]
for (const x of filas) {
  if (x.lado !== 1) continue;
  const k = `${x.fechaY}|${x.i}|${x.j}`;
  if (!pools.has(k)) pools.set(k, []);
  pools.get(k).push({ ticker: x.ticker, pares: x.pool });
}
function sorteoActivo(f, emparejar, semilla) {
  const r = rng(semilla);
  const ms = [];
  let usados = 0, fallos = 0;
  for (let s = 0; s < SORTEOS; s++) {
    let acc = 0, n = 0;
    for (const x of f) {
      const pool = pools.get(`${x.fechaY}|${x.i}|${x.j}`).filter((c) => c.ticker !== x.ticker);
      if (!pool.length) continue;
      let cand = [];
      for (const c of pool) for (const p of c.pares) if (!emparejar || Math.abs(p[1] - x.horq) <= CALIBRE) cand.push(p[0]);
      if (!cand.length) { if (s === 0) fallos++; continue; }
      acc += cand[Math.floor(r() * cand.length)]; n++;
      if (s === 0) usados++;
    }
    if (n) ms.push(acc / n);
  }
  ms.sort((a, b) => a - b);
  return { m: media(ms), p05: ms[Math.floor(ms.length * 0.05)], p95: ms[Math.floor(ms.length * 0.95)], usados, fallos, ms };
}
const GRUPOS = [
  ["TODO", () => true],
  ["EN EL DINERO · 31-90d", (x) => x.i === 1 && x.j === 2],
  ["5% fuera · 31-90d", (x) => x.i === 2 && x.j === 2],
  ["ESQUINA BARATA 3-8%·60-120d", (x) => x.dist >= 0.03 && x.dist <= 0.08 && x.dte >= 60 && x.dte <= 120],
  ["prima ≥$1M", (x) => x.prem >= 1e6],
  ["prima ≥$2,5M", (x) => x.prem >= 2.5e6],
];
console.log(`  ${"grupo".padEnd(30)} ${"n".padStart(5)} ${"seguir".padStart(7)} ${"otro CRUDO".padStart(11)} ${"excC".padStart(6)} ${"otro EMPAREJADO".padStart(16)} ${"excE".padStart(6)} ${"pctil".padStart(6)}`);
const ctrlActivo = [];
for (const [nombre, sel] of GRUPOS) {
  const f = filas.filter((x) => x.lado === 1 && sel(x) && (pools.get(`${x.fechaY}|${x.i}|${x.j}`) ?? []).some((c) => c.ticker !== x.ticker));
  if (f.length < 40) continue;
  const rMed = media(f.map((x) => x.ret));
  const crudo = sorteoActivo(f, false, 101);
  const emp = sorteoActivo(f, true, 101);
  let pos = 0; while (pos < emp.ms.length && emp.ms[pos] < rMed) pos++;
  console.log(`  ${nombre.padEnd(30)} ${String(f.length).padStart(5)} ${(100 * rMed).toFixed(2).padStart(6)}% ${(100 * crudo.m).toFixed(2).padStart(10)}% ${(100 * (rMed - crudo.m)).toFixed(2).padStart(5)}% ${(100 * emp.m).toFixed(2).padStart(15)}% ${(100 * (rMed - emp.m)).toFixed(2).padStart(5)}% ${(100 * pos / emp.ms.length).toFixed(0).padStart(5)}%   (empareja ${emp.usados}/${f.length})`);
  ctrlActivo.push({ grupo: nombre, n: f.length, seguir: rMed, crudo: crudo.m, excCrudo: rMed - crudo.m, emparejado: emp.m, excEmparejado: rMed - emp.m, percentil: pos / emp.ms.length, usados: emp.usados });
}

// ── 4. EL MAPA DE NIVEL — dónde cuesta menos estar ──────────────────────────────────────────
console.log(`\n${"═".repeat(112)}`);
console.log(`EL MAPA DE NIVEL — cuánto pierde de verdad COMPRAR en cada celda (ask real → bid real, ${K_SAL} días)`);
console.log(`${"═".repeat(112)}`);
console.log(`  esto NO es una señal: es el coste del terreno. Dice DÓNDE puede sobrevivir una ventaja, no que la haya.\n`);
console.log(`  ${"celda".padEnd(28)} ${"n".padStart(5)} ${"nEf".padStart(4)} ${"CALL".padStart(8)} ${"PUT".padStart(8)} ${"TODO".padStart(8)} ${"horq".padStart(6)} ${"gana".padStart(6)} ${"a cero".padStart(7)}`);
const nivel = [];
for (let i = 0; i < DIST.length; i++) for (let j = 0; j < PLAZO.length; j++) {
  const f = filas.filter((x) => x.lado === 1 && x.i === i && x.j === j);
  if (f.length < 40) continue;
  const c = f.filter((x) => x.tipo === "C"), p = f.filter((x) => x.tipo === "P");
  const ne = nEfectiva(f, K_SAL);
  console.log(`  ${(DIST[i].n + " · " + PLAZO[j].n).padEnd(28)} ${String(f.length).padStart(5)} ${String(ne.porTicker).padStart(4)} ` +
    `${(c.length >= 20 ? (100 * media(c.map((x) => x.ret))).toFixed(2) + "%" : "—").padStart(8)} ${(p.length >= 20 ? (100 * media(p.map((x) => x.ret))).toFixed(2) + "%" : "—").padStart(8)} ` +
    `${((100 * media(f.map((x) => x.ret))).toFixed(2) + "%").padStart(8)} ${((100 * media(f.map((x) => x.horq))).toFixed(1) + "%").padStart(6)} ` +
    `${((100 * f.filter((x) => x.ret > 0).length / f.length).toFixed(1) + "%").padStart(6)} ${((100 * f.filter((x) => x.ret <= -0.99).length / f.length).toFixed(1) + "%").padStart(7)}`);
  nivel.push({ dist: DIST[i].n, plazo: PLAZO[j].n, n: f.length, nEf: ne.porTicker, call: c.length >= 20 ? media(c.map((x) => x.ret)) : null, put: p.length >= 20 ? media(p.map((x) => x.ret)) : null, todo: media(f.map((x) => x.ret)), horq: media(f.map((x) => x.horq)), gana: f.filter((x) => x.ret > 0).length / f.length });
}

// ── 5. LA ESQUINA BARATA AL DETALLE ─────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(112)}`);
console.log(`LA ESQUINA BARATA (3-8% fuera, 60-120 días) — donde el dinero grande pone el 12% de sus dólares`);
console.log(`${"═".repeat(112)}\n`);
const esq = filas.filter((x) => x.dist >= 0.03 && x.dist <= 0.08 && x.dte >= 60 && x.dte <= 120);
const esqAsk = esq.filter((x) => x.lado === 1);
console.log(`  ${"corte".padEnd(30)} ${"n".padStart(5)} ${"nEf".padStart(4)} ${"seguir".padStart(8)} ${"calibre".padStart(8)} ${"exceso".padStart(7)} ${"t día".padStart(6)}  tercios`);
const cortesEsq = [];
const CORTES = [
  ["todo el ASK", (x) => true],
  ["CALLS", (x) => x.tipo === "C"],
  ["PUTS", (x) => x.tipo === "P"],
  ["prima $100-250k", (x) => x.k === 0],
  ["prima $250k-1M", (x) => x.k === 1],
  ["prima ≥$1M", (x) => x.prem >= 1e6],
  ["antes de las 12:00 ET", (x) => x.et < 12],
  ["después de las 12:00 ET", (x) => x.et >= 12],
  ["horquilla estrecha (<3%)", (x) => x.horq < 0.03],
  ["horquilla ancha (≥3%)", (x) => x.horq >= 0.03],
];
for (const [nombre, sel] of CORTES) {
  const f = esqAsk.filter((x) => x.nCal >= 3 && sel(x));
  if (f.length < 40) { console.log(`  ${nombre.padEnd(30)} ${String(f.length).padStart(5)}  — muestra corta`); continue; }
  for (const x of f) x.exc = x.ret - media(x.cal);
  const td = tPorDia(f, (x) => x.exc);
  const ne = nEfectiva(f, K_SAL);
  const ord = [...f].sort((a, b) => a.fechaY.localeCompare(b.fechaY));
  const kk = Math.floor(ord.length / 3);
  const ter = [0, 1, 2].map((z) => media((z < 2 ? ord.slice(z * kk, (z + 1) * kk) : ord.slice(2 * kk)).map((x) => x.exc)));
  const mismo = Math.sign(ter[0]) === Math.sign(ter[1]) && Math.sign(ter[1]) === Math.sign(ter[2]);
  console.log(`  ${nombre.padEnd(30)} ${String(f.length).padStart(5)} ${String(ne.porTicker).padStart(4)} ${((100 * media(f.map((x) => x.ret))).toFixed(2) + "%").padStart(8)} ${((100 * media(f.map((x) => media(x.cal)))).toFixed(2) + "%").padStart(8)} ${(100 * media(f.map((x) => x.exc))).toFixed(2).padStart(6)}% ${td.t.toFixed(2).padStart(6)}${Math.abs(td.t) >= LISTON ? "◄" : " "} ${ter.map((v) => (100 * v).toFixed(1)).join("/")}${mismo ? " ✓" : " ✗"}`);
  cortesEsq.push({ corte: nombre, n: f.length, nEf: ne.porTicker, seguir: media(f.map((x) => x.ret)), calibre: media(f.map((x) => media(x.cal))), exceso: media(f.map((x) => x.exc)), t: td.t, tercios: ter, mismoSigno: mismo });
}

// ── 6. LA BARRERA sobre el mejor candidato ──────────────────────────────────────────────────
console.log(`\n${"═".repeat(112)}`);
console.log(`LA BARRERA — sobre el mejor candidato de toda la rejilla`);
console.log(`${"═".repeat(112)}\n`);
const candidatos = [...cortesEsq].sort((a, b) => Math.abs(b.t) - Math.abs(a.t));
const mejor = candidatos[0];
{
  const f = esqAsk.filter((x) => x.nCal >= 3);
  for (const x of f) x.exc = x.ret - media(x.cal);
  const v = pasarBarrera(f.map((x) => ({ pnl: x.exc, ticker: x.ticker, fecha: x.fecha })), (x) => x.pnl, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
  console.log(`  ESQUINA BARATA al ask, exceso contra vecino de misma horquilla — ¿pasa? ${v.pasa ? "SÍ" : "NO"}`);
  for (const m of v.motivos) console.log(`     ✗ ${m}`);
  for (const a of v.aprobadas) console.log(`     ✓ ${a}`);
}

// ── 7. DINERO ───────────────────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(112)}`);
console.log(`EN DÓLARES AL AÑO sobre $${fmt(CUENTA)}`);
console.log(`${"═".repeat(112)}\n`);
const dinero = [];
for (const [nombre, f] of [
  ["seguir el print — TODA la rejilla", filas.filter((x) => x.lado === 1)],
  ["seguir el print — ESQUINA BARATA", esqAsk],
  ["seguir el print — ESQUINA BARATA, prima ≥$1M", esqAsk.filter((x) => x.prem >= 1e6)],
]) {
  if (f.length < 40) continue;
  const r = media(f.map((x) => x.ret));
  const primaMedia = media(f.map((x) => x.prima));
  const ne = nEfectiva(f, K_SAL);
  const ciclos = 252 / K_SAL;                        // plazas rotando cada K_SAL días
  const plazas = 4;                                   // 4 contratos a la vez
  const capital = primaMedia * plazas;
  const anual = r * primaMedia * plazas * ciclos;
  console.log(`  ${nombre}`);
  console.log(`     ${fmt(f.length)} operaciones · n EFECTIVA ${ne.porTicker} (ventanas de calendario independientes: ${ne.ventanas})`);
  console.log(`     ${(100 * r).toFixed(2)}% por operación sobre una prima media de $${fmt(primaMedia)}  →  $${fmt(r * primaMedia)} por operación`);
  console.log(`     con ${plazas} plazas rotando cada ${K_SAL} días: capital comprometido $${fmt(capital)} · ${ciclos.toFixed(0)} ciclos/año  →  $${fmt(anual)}/año`);
  console.log(`     (SPY sobre ese mismo capital, al 14%: $${fmt(capital * 0.14)}/año)\n`);
  dinero.push({ nombre, n: f.length, nEf: ne.porTicker, ret: r, primaMedia, capital, anual, spy: capital * 0.14 });
}

writeFileSync("scripts/contrato-3-veredicto.json", JSON.stringify({ K_SAL, CALIBRE, LISTON, n: filas.length, ctrlActivo, nivel, cortesEsq, dinero }, null, 1));
console.log(`  → scripts/contrato-3-veredicto.json\n`);
