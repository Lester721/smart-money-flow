// SEGUIR EL PRINT · 4 — LOS PLACEBOS. Intentar tumbar la regla antes de contarla.
//
// La candidata del pase 3:
//   **print AL ASK · ≥$2,5M · antes de las 15:00 → comprar la opción CONTRARIA en la esquina
//     barata al cierre, vender a los 5 días** · ventaja neutral −3,9% para el que SIGUE al print
//     (o sea +3,9% para el que lo desvanece) · t por día −3,7 · mismo signo en los tres tercios.
//
// Antes de ponerle un número en dólares delante hay que intentar matarla. Seis intentos:
//
//   1. UN DÍA TARDE   — comprar al cierre de D+1 en vez de D. Si el efecto es sesgo que revierte,
//                       sobrevive algo. Si vive ENTERO en la cotización de cierre de ese día,
//                       muere — y entonces era un artefacto del precio, no una señal.
//   2. SEÑAL DEL DÍA SIGUIENTE — usar el print de D+1 para entrar al cierre de D. Es imposible de
//                       operar; si "funciona" igual, lo que se está midiendo NO es la reacción al
//                       print sino una propiedad del (ticker, día). Es la prueba de causalidad.
//   3. SIN ÍNDICES    — fuera SPX, SPXW, NDX, RUT, QQQ, SPY, IWM, SMH, SOXL, GLD. ¿Vive en acciones?
//   4. POR HORA       — ¿da igual a las 10:00 que a las 14:30? Una señal de prisa debería.
//   5. PERMUTACIÓN    — 5.000 barajas de la dirección entre los tickers que cotizaban ESE día.
//   6. EL CONTRATO DEL PRINT — comprar exactamente lo que compraron. Es la versión más literal de
//                       "seguir el flujo" y la que un operador probaría primero.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/print-4-placebos.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import {
  cadena, cierres, diasDe, tickersConCadena, elegirEsquina, bidSalida, limpiarCache,
  dias, media, sd, tUna, pctl, fmt, rng, nEfectiva,
} from "./print-lib.mjs";
import { listonT } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389;
const DIST = 0.05, DTE_OBJ = 90, TOL_DTE = 25;
const K_SAL = Number(process.env.K_SAL || 5);
const MIN_PREM = Number(process.env.MIN_PREM || 2.5e6);
const PERM = Number(process.env.PERM || 5000);
const LISTON = listonT(120);                 // el mismo listón del pase 3: no se rebaja a posteriori
const ASK = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const BID = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);
const INDICES = new Set(["SPX", "SPXW", "NDX", "RUT", "QQQ", "SPY", "IWM", "SMH", "SOXL", "GLD", "XLF", "XLE", "DIA"]);

const conCad = tickersConCadena().filter((t) => cierres(t));
const diasPorTk = new Map(conCad.map((t) => [t, diasDe(t).filter((d) => d >= "20260422")]));
const setDias = new Map(conCad.map((t) => [t, new Set(diasPorTk.get(t))]));
const ULTIMO = [...diasPorTk.values()].flat().sort().pop() ?? "20260806";

console.log(`\n${"═".repeat(104)}`);
console.log(`SEGUIR EL PRINT · 4 — PLACEBOS · regla: ASK · ≥$${(MIN_PREM / 1e6).toFixed(1)}M · salida ${K_SAL}d · listón |t| ≥ ${LISTON}`);
console.log(`${"═".repeat(104)}`);
console.log(`  ${conCad.length} tickers con cadena y cierres · hasta ${ULTIMO}\n`);

function tPorDia(filas, campo) {
  const m = new Map();
  for (const f of filas) { if (!m.has(f.fechaY)) m.set(f.fechaY, []); m.get(f.fechaY).push(f[campo]); }
  const d = [...m.values()].map(media);
  return { t: tUna(d), n: d.length, m: media(d) };
}

// ── PRINTS ──────────────────────────────────────────────────────────────────────────────────
const eventos = [];
const setCad = new Set(conCad);
for (const dia of diasFlujo("100k")) {
  const crudos = leerDia(dia, "100k");
  if (!crudos.length) continue;
  const inst = new Map(), filas = [];
  for (const o of crudos) {
    const q = parseOCC(o.symbol);
    if (!q) continue;
    const k = `${q.raiz}|${o.timestamp}`;
    if (!inst.has(k)) inst.set(k, new Set());
    inst.get(k).add(`${q.exp}|${q.tipo}|${q.K}`);
    filas.push([o, q, k]);
  }
  const dY = dia.replace(/-/g, "");
  for (const [o, q, k] of filas) {
    if (!setCad.has(q.raiz) || !setDias.get(q.raiz)?.has(dY)) continue;
    const et = Number(o.timestamp.slice(11, 13)) - 4 + Number(o.timestamp.slice(14, 16)) / 60;
    if (!(et >= 9.5 && et < 15)) continue;
    const lado = ASK.has(o.side) ? 1 : BID.has(o.side) ? -1 : 0;
    if (lado !== 1 || o.premium < MIN_PREM) continue;          // sólo el lado comprador agresivo
    eventos.push({
      dia, dY, tk: q.raiz, tipo: q.tipo, prem: o.premium, patas: inst.get(k).size,
      dir: q.tipo === "C" ? 1 : -1, et, exp: q.exp, K: q.strike, dtePrint: dias(dY, q.exp),
    });
  }
}
console.log(`## prints al ask ≥$${(MIN_PREM / 1e6).toFixed(1)}M antes de las 15:00 con cadena: ${fmt(eventos.length)}`);

// ── REJILLA (entradas a D y a D+1) ──────────────────────────────────────────────────────────
const rejilla = new Map();
for (const tk of conCad) {
  limpiarCache();
  const misDias = diasPorTk.get(tk), cl = cierres(tk);
  for (let i = 0; i < misDias.length; i++) {
    const dY = misDias[i];
    if (dY > ULTIMO) continue;
    const S = cl[dY];
    if (!(S > 0)) continue;
    const cad = cadena(tk, dY);
    if (!cad) continue;
    const c = elegirEsquina(cad, S, DTE_OBJ, DIST, "C", dY, TOL_DTE);
    const p = elegirEsquina(cad, S, DTE_OBJ, DIST, "P", dY, TOL_DTE);
    if (!c || !p || c.exp !== p.exp) continue;
    const salida = misDias.find((d) => d > dY && dias(dY, d) >= K_SAL);
    if (!salida || salida > c.exp) continue;
    const vC = bidSalida(tk, salida, c.exp, "C", c.K), vP = bidSalida(tk, salida, p.exp, "P", p.K);
    if (vC === null || vP === null) continue;
    const rC = vC / c.ask - 1, rP = vP / p.ask - 1;
    rejilla.set(`${tk}|${dY}`, { g: (rC - rP) / 2, m: (rC + rP) / 2, C: rC, P: rP, askC: c.ask * 100, askP: p.ask * 100 });
  }
}
const porDia = new Map();
for (const [k, r] of rejilla) {
  const [tk, dY] = k.split("|");
  if (!porDia.has(dY)) porDia.set(dY, []);
  porDia.get(dY).push({ tk, ...r });
}
const gDiaDe = new Map([...porDia.entries()].map(([d, v]) => [d, media(v.map((x) => x.g))]));
console.log(`## rejilla de la esquina: ${fmt(rejilla.size)} (ticker, día) con precios reales y salida a ${K_SAL}d\n`);

/** Entradas: una por (ticker, día) = el print MÁS GRANDE de ese día en ese activo.
 *  `desplazar` = cuántos días de cadena se retrasa la COMPRA respecto al print. */
function construir({ filtro = () => true, desplazar = 0, senalDeManana = false } = {}) {
  const mejor = new Map();
  for (const e of eventos) {
    if (!filtro(e)) continue;
    const k = `${e.tk}|${e.dY}`;
    const a = mejor.get(k);
    if (!a || e.prem > a.prem) mejor.set(k, e);
  }
  const out = [];
  for (const e of mejor.values()) {
    let dEntrada = e.dY;
    if (desplazar) {
      const misDias = diasPorTk.get(e.tk);
      const i = misDias.indexOf(e.dY);
      if (i < 0 || i + desplazar >= misDias.length) continue;
      dEntrada = misDias[i + desplazar];
    }
    if (senalDeManana) {
      // la señal de D se usa para entrar al cierre de D−1: IMPOSIBLE de operar. Es la prueba
      // de causalidad, no una estrategia.
      const misDias = diasPorTk.get(e.tk);
      const i = misDias.indexOf(e.dY);
      if (i <= 0) continue;
      dEntrada = misDias[i - 1];
    }
    const r = rejilla.get(`${e.tk}|${dEntrada}`);
    if (!r) continue;
    const gd = gDiaDe.get(dEntrada);
    if (gd == null) continue;
    out.push({
      ticker: e.tk, fechaY: dEntrada, fechaSenal: e.dY, dir: e.dir, tipo: e.tipo, prem: e.prem, et: e.et,
      seguirNeutral: e.dir * (r.g - gd),
      retDesv: e.dir === 1 ? r.P : r.C,
      primaDesv: e.dir === 1 ? r.askP : r.askC,
      retSeguir: e.dir === 1 ? r.C : r.P,
    });
  }
  return out;
}

function linea(nombre, filas) {
  if (filas.length < 60) { console.log(`  ${nombre.padEnd(38)} n=${String(filas.length).padStart(4)}  — muestra corta`); return null; }
  const td = tPorDia(filas, "seguirNeutral");
  const tks = new Map();
  for (const f of filas) tks.set(f.ticker, (tks.get(f.ticker) ?? 0) + 1);
  const may = [...tks.entries()].sort((a, b) => b[1] - a[1])[0];
  const ord = [...filas].sort((a, b) => a.fechaY.localeCompare(b.fechaY));
  const kk = Math.floor(ord.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? ord.slice(i * kk, (i + 1) * kk) : ord.slice(2 * kk)).map((x) => x.seguirNeutral)));
  const mismoSigno = Math.sign(ter[0]) === Math.sign(ter[1]) && Math.sign(ter[1]) === Math.sign(ter[2]);
  console.log(`  ${nombre.padEnd(38)} n=${String(filas.length).padStart(4)} ${String(td.n).padStart(3)}d  neutral ${(100 * media(filas.map((f) => f.seguirNeutral))).toFixed(2).padStart(6)}%  tDÍA ${td.t.toFixed(2).padStart(6)}${Math.abs(td.t) >= LISTON ? " ◄" : "  "}  desv ${(100 * media(filas.map((f) => f.retDesv))).toFixed(1).padStart(5)}%  tercios ${ter.map((x) => (100 * x).toFixed(1)).join("/")}${mismoSigno ? " ✓" : " ✗"}  ${may[0]} ${((100 * may[1]) / filas.length).toFixed(0)}%`);
  return { n: filas.length, nDias: td.n, neutral: media(filas.map((f) => f.seguirNeutral)), t: td.t, tercios: ter, mismoSigno, retDesv: media(filas.map((f) => f.retDesv)), prima: media(filas.map((f) => f.primaDesv)) };
}

const R = {};
console.log(`${"═".repeat(104)}`);
console.log(`  ${"prueba".padEnd(38)} ${"n".padStart(6)} ${"días".padStart(4)}  ${"neutral".padStart(14)}  ${"t por día".padStart(8)}   desv%   tercios`);
console.log(`${"═".repeat(104)}`);
const base = construir();
R.base = linea("BASE (la candidata)", base);
R.tarde1 = linea("1a. PLACEBO · comprar 1 día tarde", construir({ desplazar: 1 }));
R.tarde2 = linea("1b. PLACEBO · comprar 2 días tarde", construir({ desplazar: 2 }));
R.antes = linea("2.  PLACEBO · comprar el día ANTES (imposible)", construir({ senalDeManana: true }));
R.sinIndices = linea("3.  sólo ACCIONES (fuera índices y ETF)", base.filter((f) => !INDICES.has(f.ticker)));
R.soloIndices = linea("3b. sólo ÍNDICES y ETF", base.filter((f) => INDICES.has(f.ticker)));
R.sueltos = linea("3c. sólo prints SUELTOS (no pata de spread)", construir({ filtro: (e) => e.patas === 1 }));
R.patas = linea("3d. sólo prints que SON pata de spread", construir({ filtro: (e) => e.patas > 1 }));
console.log(`${"─".repeat(104)}`);
R.temprano = linea("4a. print ANTES de las 12:00 ET", base.filter((f) => f.et < 12));
R.tardeDia = linea("4b. print DESPUÉS de las 12:00 ET", base.filter((f) => f.et >= 12));
R.corto = linea("4c. contrato del print a <120 días", construir({ filtro: (e) => e.dtePrint < 120 }));
R.largo = linea("4d. contrato del print a ≥120 días", construir({ filtro: (e) => e.dtePrint >= 120 }));
R.callPrint = linea("4e. sólo prints de CALL", base.filter((f) => f.tipo === "C"));
R.putPrint = linea("4f. sólo prints de PUT", base.filter((f) => f.tipo === "P"));

// ── 5. PERMUTACIÓN ──────────────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log(`5. PERMUTACIÓN — ${fmt(PERM)} barajas: misma fecha, misma dirección, TICKER sorteado entre los que cotizaban`);
console.log(`${"═".repeat(104)}\n`);
{
  const azar = rng(20260821);
  const porFecha = new Map();
  for (const f of base) { if (!porFecha.has(f.fechaY)) porFecha.set(f.fechaY, []); porFecha.get(f.fechaY).push(f.dir); }
  const nulos = [];
  for (let it = 0; it < PERM; it++) {
    const md = [];
    for (const [dY, dirs] of porFecha) {
      const cand = porDia.get(dY);
      if (!cand?.length) continue;
      const gd = gDiaDe.get(dY);
      let s = 0;
      for (const d of dirs) { const x = cand[Math.floor(azar() * cand.length)]; s += d * (x.g - gd); }
      md.push(s / dirs.length);
    }
    nulos.push(media(md));
  }
  const obs = tPorDia(base, "seguirNeutral").m;
  const mN = media(nulos), sN = sd(nulos);
  const p = (nulos.filter((x) => Math.abs(x - mN) >= Math.abs(obs - mN)).length + 1) / (nulos.length + 1);
  console.log(`   observado ${(100 * obs).toFixed(2)}%  ·  nulo ${(100 * mN).toFixed(2)}% ± ${(100 * sN).toFixed(2)}%  ·  z = ${((obs - mN) / sN).toFixed(2)}  ·  p = ${p.toFixed(4)}`);
  console.log(`   percentiles del nulo: p1 ${(100 * pctl(nulos, 0.01)).toFixed(2)}%  p50 ${(100 * pctl(nulos, 0.5)).toFixed(2)}%  p99 ${(100 * pctl(nulos, 0.99)).toFixed(2)}%`);
  R.perm = { obs, nuloMedia: mN, nuloSd: sN, z: (obs - mN) / sN, p };
}

// ── 6. EL CONTRATO DEL PRINT ────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log(`6. EL CONTRATO DEL PRINT — comprar EXACTAMENTE lo que compraron, al cierre, y vender a los ${K_SAL} días`);
console.log(`${"═".repeat(104)}\n`);
{
  const mejor = new Map();
  for (const e of eventos) { const k = `${e.tk}|${e.dY}`; const a = mejor.get(k); if (!a || e.prem > a.prem) mejor.set(k, e); }
  const filas = [];
  let sinCad = 0, sinContrato = 0;
  for (const e of [...mejor.values()].sort((a, b) => (a.tk + a.dY).localeCompare(b.tk + b.dY))) {
    const misDias = diasPorTk.get(e.tk);
    const cad = cadena(e.tk, e.dY);
    if (!cad) { sinCad++; continue; }
    const q = cad[e.exp]?.[`${e.K}|${e.tipo}`];
    if (!q) { sinContrato++; continue; }                       // sin puja al cierre: no se compra
    const [b0, a0] = q;
    if (!(a0 > 0 && b0 > 0)) { sinContrato++; continue; }
    const salida = misDias.find((d) => d > e.dY && dias(e.dY, d) >= K_SAL);
    if (!salida) continue;
    const vb = bidSalida(e.tk, salida, e.exp, e.tipo, e.K);
    if (vb === null) continue;
    filas.push({
      ticker: e.tk, fechaY: e.dY, ret: vb / a0 - 1, prima: a0 * 100,
      peaje: (a0 - b0) / a0, dte: e.dtePrint, tipo: e.tipo,
      seguirNeutral: 0,
    });
  }
  if (filas.length < 60) console.log(`   sólo ${filas.length} contratos comprables — muestra corta`);
  else {
    const r = filas.map((f) => f.ret);
    const m = new Map();
    for (const f of filas) { if (!m.has(f.fechaY)) m.set(f.fechaY, []); m.get(f.fechaY).push(f.ret); }
    const md = [...m.values()].map(media);
    console.log(`   n=${fmt(filas.length)} contratos (${sinCad} sin cadena, ${fmt(sinContrato)} sin puja al cierre — ésos NO se pueden comprar)`);
    console.log(`   retorno medio comprando al ASK y vendiendo al BID a los ${K_SAL} días: ${(100 * media(r)).toFixed(2)}%  ·  mediana ${(100 * pctl(r, 0.5)).toFixed(2)}%  ·  t por día ${tUna(md).toFixed(2)}`);
    console.log(`   peaje del contrato que ellos compraron: mediana ${(100 * pctl(filas.map((f) => f.peaje), 0.5)).toFixed(1)}% de la prima  ·  plazo mediano ${pctl(filas.map((f) => f.dte), 0.5)} días`);
    console.log(`   prima mediana por contrato: $${fmt(pctl(filas.map((f) => f.prima), 0.5))}`);
    const gan = r.filter((x) => x > 0).length / r.length;
    console.log(`   gana dinero en el ${(100 * gan).toFixed(1)}% de los casos`);
    R.contratoDelPrint = { n: filas.length, ret: media(r), t: tUna(md), peaje: pctl(filas.map((f) => f.peaje), 0.5), gan };
  }
}

writeFileSync("scripts/print-4-placebos.json", JSON.stringify(R, null, 1));
console.log(`\n  → scripts/print-4-placebos.json\n`);
