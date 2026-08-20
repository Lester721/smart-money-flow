// URGENCIA · 5 — EL PUENTE: ¿dónde vive el efecto, en la OPCIÓN o en la ACCIÓN?
//
// La regla le gana 5,45 puntos al sorteo, pero el vehículo (comprar una opción 5% fuera a 90 días)
// pierde −6,66% de base en esta ventana, así que la regla acaba en −1,21% y en dinero pierde.
//
// La pregunta que decide si hay algo que hacer con esto: **¿el efecto está en la acción o sólo en
// la superficie de volatilidad?** Si está en la ACCIÓN, se cobra con acciones: en Robinhood son
// $0 de comisión y una horquilla de céntimos, no el 26% de prima que cuesta una opción. Si sólo
// está en la opción, es un efecto de sesgo (skew) y el peaje se lo come siempre.
//
// Se mide con los CIERRES REALES del subyacente, neutralizando el mercado de ese día (la media
// de los cierres de los 39 tickers de la rejilla), en la dirección CONTRARIA al print.
//
// node --import tsx --max-old-space-size=10240 scripts/urg-5-puente.mjs

import { writeFileSync } from "node:fs";
import { rejilla, eventos, CUENTA } from "./urg-lib.mjs";
import { cierres, diasDe, tickersConCadena, media, sd, tUna, fmt, nEfectiva, rng } from "./print-lib.mjs";

const SORTEOS = 500;
const HS = [1, 2, 3, 5, 10];
const rej = rejilla(), evs = eventos();

// ── calendario y cierres ────────────────────────────────────────────────────────────────────
const TK = tickersConCadena().filter((t) => cierres(t));
const CAL = [...new Set(TK.flatMap((t) => diasDe(t)))].sort().filter((d) => d >= "20260401");
const idx = new Map(CAL.map((d, i) => [d, i]));
const CL = new Map(TK.map((t) => [t, cierres(t)]));

/** Retorno del subyacente de `tk` desde el cierre de `dY` hasta `h` días de bolsa después. */
function retAccion(tk, dY, h) {
  const i = idx.get(dY); if (i == null || i + h >= CAL.length) return null;
  const c = CL.get(tk); if (!c) return null;
  const a = c[dY], b = c[CAL[i + h]];
  return a > 0 && b > 0 ? b / a - 1 : null;
}
// mercado del día = media de los retornos de TODOS los tickers de la rejilla ese día
const mercAcc = new Map();
for (const dY of CAL) for (const h of HS) {
  const v = [];
  for (const t of TK) { const r = retAccion(t, dY, h); if (r != null) v.push(r); }
  if (v.length >= 5) mercAcc.set(`${dY}|${h}`, media(v));
}
// tickers realmente presentes en la rejilla cada día (para que el sorteo saque de ahí)
const tkDia = new Map();
for (const k of Object.keys(rej)) { const [tk, dY] = k.split("|"); if (!tkDia.has(dY)) tkDia.set(dY, new Set()); tkDia.get(dY).add(tk); }

function medirAcc(tk, dY, dir, h) {
  const r = retAccion(tk, dY, h); if (r == null) return null;
  const m = mercAcc.get(`${dY}|${h}`); if (m == null) return null;
  return { r: dir * r, ex: dir * (r - m) };
}

const tPorDia = (fs, c) => { const m = new Map(); for (const f of fs) { if (!m.has(f.dY)) m.set(f.dY, []); m.get(f.dY).push(f[c]); } return tUna([...m.values()].map(media)); };

function construir(sel) {
  const mejor = new Map();
  for (const e of sel) { const k = `${e.tk}|${e.dY}`; const a = mejor.get(k); if (!a || e.prem > a.prem) mejor.set(k, e); }
  return [...mejor.values()].filter((e) => rej[`${e.tk}|${e.dY}`]);
}

function evaluar(nombre, ev, signo, h, semilla) {
  const fs = [];
  for (const e of ev) {
    const dir = signo * (e.dir !== 0 ? e.dir : (e.tipo === "C" ? 1 : -1));
    const x = medirAcc(e.tk, e.dY, dir, h);
    if (x) fs.push({ ticker: e.tk, dY: e.dY, fechaY: e.dY, fecha: `${e.dY.slice(0, 4)}-${e.dY.slice(4, 6)}-${e.dY.slice(6, 8)}`, dir, ...x });
  }
  if (fs.length < 25) return null;
  const R = rng(semilla), az = [];
  for (let s = 0; s < SORTEOS; s++) {
    const v = [];
    for (const f of fs) {
      const cand = [...(tkDia.get(f.dY) ?? [])];
      if (!cand.length) continue;
      const x = medirAcc(cand[Math.floor(R() * cand.length)], f.dY, f.dir, h);
      if (x) v.push(x.ex);
    }
    if (v.length) az.push(media(v));
  }
  az.sort((a, b) => a - b);
  const m = media(fs.map((f) => f.ex)), ne = nEfectiva(fs, h);
  const cnt = new Map(); for (const f of fs) cnt.set(f.ticker, (cnt.get(f.ticker) ?? 0) + 1);
  const may = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
  const ord = [...fs].sort((a, b) => a.dY.localeCompare(b.dY));
  const k3 = Math.floor(ord.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? ord.slice(i * k3, (i + 1) * k3) : ord.slice(2 * k3)).map((x) => x.ex)));
  return { nombre, h, n: fs.length, nEf: ne.porTicker, nVen: ne.ventanas, dias: new Set(fs.map((f) => f.dY)).size,
    crudo: media(fs.map((f) => f.r)), ex: m, t: tPorDia(fs, "ex"), acierto: fs.filter((f) => f.ex > 0).length / fs.length,
    azP05: az[Math.floor(az.length * 0.05)], azP95: az[Math.floor(az.length * 0.95)], pctl: az.filter((x) => x < m).length / az.length,
    mayor: may[0], mayorPct: may[1] / fs.length, tercios: ter, mismoSigno: ter.every((x) => Math.sign(x) === Math.sign(ter[0])), fs };
}

console.log(`\n${"█".repeat(112)}`);
console.log(`URGENCIA · 5 — EL PUENTE: el mismo efecto medido en la ACCIÓN (cierres reales, mercado del día restado)`);
console.log(`${"█".repeat(112)}`);

const UNA = evs.filter((e) => e.cls === "UNA_PATA");
const grupos = [
  ["DESVANECER ABOVE_ASK >=$1M", construir(UNA.filter((e) => e.side === "ABOVE_ASK" && e.prem >= 1e6)), -1],
  ["seguir     ABOVE_ASK >=$1M", construir(UNA.filter((e) => e.side === "ABOVE_ASK" && e.prem >= 1e6)), +1],
  ["seguir     AT_ASK    >=$1M", construir(UNA.filter((e) => e.side === "AT_ASK" && e.prem >= 1e6)), +1],
  ["seguir     ASKSIDE   >=$1M", construir(UNA.filter((e) => e.side === "ASKSIDE" && e.prem >= 1e6)), +1],
  ["seguir     BELOW_BID >=$1M", construir(UNA.filter((e) => e.side === "BELOW_BID" && e.prem >= 1e6)), +1],
  ["PLACEBO patas de spread AA", construir(evs.filter((e) => e.cls === "MULTI" && e.side === "ABOVE_ASK" && e.prem >= 1e6)), -1],
];

const salida = {};
for (const h of HS) {
  console.log(`\n  ── ACCIÓN a ${h} día(s) de bolsa ${"─".repeat(70)}`);
  console.log(`  ${"grupo".padEnd(28)} ${"n".padStart(4)} ${"nEf".padStart(4)} ${"vent".padStart(4)}  ${"crudo".padStart(7)} ${"vs mercado".padStart(11)} ${"t/día".padStart(6)} ${"azar p5..p95".padStart(14)} ${"pctl".padStart(5)} ${"acier".padStart(5)} ${"3 tercios".padStart(9)} ${"mayor".padStart(10)}`);
  const acc = [];
  let i = 0;
  for (const [nom, ev, sg] of grupos) {
    const o = evaluar(nom, ev, sg, h, 2000 + (i++) * 37 + h);
    if (!o) { console.log(`  ${nom.padEnd(28)} — muestra insuficiente`); continue; }
    acc.push({ ...o, fs: undefined });
    console.log(`  ${nom.padEnd(28)} ${String(o.n).padStart(4)} ${String(o.nEf).padStart(4)} ${String(o.nVen).padStart(4)}  ${(100 * o.crudo).toFixed(2).padStart(6)}% ${(100 * o.ex).toFixed(2).padStart(10)}% ${o.t.toFixed(2).padStart(6)} ${(100 * o.azP05).toFixed(2).padStart(6)}%..${(100 * o.azP95).toFixed(2).padStart(5)}% ${((100 * o.pctl).toFixed(0) + "%").padStart(5)} ${(100 * o.acierto).toFixed(0).padStart(4)}% ${(o.mismoSigno ? "sí" : "NO").padStart(9)} ${(o.mayor + " " + (100 * o.mayorPct).toFixed(0) + "%").padStart(10)}`);
  }
  salida[h] = acc;
}

// ── ¿cuánto vale en dinero si se opera con ACCIONES? ────────────────────────────────────────
console.log(`\n${"═".repeat(112)}`);
console.log(`SI EL EFECTO ESTUVIERA EN LA ACCIÓN — lo que valdría con acciones en Robinhood ($0 comisión)`);
console.log(`${"═".repeat(112)}`);
const diasF = new Set(evs.map((e) => e.dY)).size;
for (const h of [2, 3, 5]) {
  const o = salida[h]?.find((x) => x.nombre.startsWith("DESVANECER"));
  if (!o) continue;
  const evAno = (o.n / diasF) * 252;
  const simult = (evAno / 252) * h;
  const pos = Math.min(CUENTA * 0.5 / Math.max(1, simult), 5000);   // tamaño por posición, tope prudente
  const bruto = evAno * pos * o.ex;
  const peaje = evAno * pos * 0.0006;                               // ~6 pb ida y vuelta de horquilla
  console.log(`  salida ${h}d · ${evAno.toFixed(0)} señales/año · ${simult.toFixed(1)} a la vez · $${fmt(pos)} por posición ($${fmt(simult * pos)} comprometidos)`);
  console.log(`      exceso ${(100 * o.ex).toFixed(2)}%/op  ->  bruto $${fmt(bruto)}/año  −  horquilla $${fmt(peaje)}/año  =  $${fmt(bruto - peaje)}/año   (t/día ${o.t.toFixed(2)}, tercios ${o.mismoSigno ? "coherentes" : "ROTOS"})`);
}
console.log(`\n  SPY sobre $28.000 comprometidos: $${fmt(28000 * 0.14)}/año.`);

writeFileSync("scripts/cache-theta/marketsnack/urg2-puente.json", JSON.stringify(salida, null, 1));
console.log(`\n  → scripts/cache-theta/marketsnack/urg2-puente.json\n`);
