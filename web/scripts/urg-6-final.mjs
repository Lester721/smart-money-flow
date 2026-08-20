// URGENCIA · 6 — LA REGLA EN ACCIONES, sometida a todo.
//
// El pase 5 encontró el puente: el efecto NO es sólo de la superficie de volatilidad, está en la
// ACCIÓN. Y eso importa porque cambia el vehículo: una opción 5% fuera a 90 días cuesta ~5 puntos
// de peaje; la acción en Robinhood cuesta ~6 puntos BÁSICOS. Un efecto de medio punto no cabe en
// una opción y sí cabe en una acción.
//
// Aquí se somete esa versión a las cribas: tercios, concentración, sorteo, quitar el ticker
// dominante, equiponderar, barrer el tamaño del print y contar cuánta muestra faltaría.
//
// node --import tsx --max-old-space-size=10240 scripts/urg-6-final.mjs

import { writeFileSync } from "node:fs";
import { rejilla, eventos, CUENTA } from "./urg-lib.mjs";
import { cierres, diasDe, tickersConCadena, media, sd, tUna, fmt, nEfectiva, rng } from "./print-lib.mjs";
import { pasarBarrera, listonT, potencia } from "../lib/barreraHallazgos.ts";
import { radiografia } from "../lib/radiografia.ts";

const SORTEOS = 500;
const rej = rejilla(), evs = eventos();
const TK = tickersConCadena().filter((t) => cierres(t));
const CAL = [...new Set(TK.flatMap((t) => diasDe(t)))].sort().filter((d) => d >= "20260401");
const idx = new Map(CAL.map((d, i) => [d, i]));
const CL = new Map(TK.map((t) => [t, cierres(t)]));
const HS = [1, 2, 3, 5];

function retAccion(tk, dY, h) {
  const i = idx.get(dY); if (i == null || i + h >= CAL.length) return null;
  const c = CL.get(tk); if (!c) return null;
  const a = c[dY], b = c[CAL[i + h]];
  return a > 0 && b > 0 ? b / a - 1 : null;
}
const mercAcc = new Map();
for (const dY of CAL) for (const h of HS) {
  const v = []; for (const t of TK) { const r = retAccion(t, dY, h); if (r != null) v.push(r); }
  if (v.length >= 5) mercAcc.set(`${dY}|${h}`, media(v));
}
const tkDia = new Map();
for (const k of Object.keys(rej)) { const [tk, dY] = k.split("|"); if (!tkDia.has(dY)) tkDia.set(dY, new Set()); tkDia.get(dY).add(tk); }

function medir(tk, dY, dir, h) {
  const r = retAccion(tk, dY, h); if (r == null) return null;
  const m = mercAcc.get(`${dY}|${h}`); if (m == null) return null;
  return { r: dir * r, ex: dir * (r - m) };
}
const tPorDia = (fs, c) => { const m = new Map(); for (const f of fs) { if (!m.has(f.dY)) m.set(f.dY, []); m.get(f.dY).push(f[c]); } return tUna([...m.values()].map(media)); };
const eqTk = (fs, c) => { const m = new Map(); for (const f of fs) { if (!m.has(f.ticker)) m.set(f.ticker, []); m.get(f.ticker).push(f[c]); } return media([...m.values()].map(media)); };

function filas(sel, h, signo) {
  const mejor = new Map();
  for (const e of sel) { const k = `${e.tk}|${e.dY}`; const a = mejor.get(k); if (!a || e.prem > a.prem) mejor.set(k, e); }
  const out = [];
  for (const e of mejor.values()) {
    if (!rej[`${e.tk}|${e.dY}`]) continue;
    const dir = signo * (e.dir !== 0 ? e.dir : (e.tipo === "C" ? 1 : -1));
    const x = medir(e.tk, e.dY, dir, h);
    if (x) out.push({ ticker: e.tk, dY: e.dY, fechaY: e.dY, fecha: `${e.dY.slice(0, 4)}-${e.dY.slice(4, 6)}-${e.dY.slice(6, 8)}`,
                      dir, prem: e.prem, pos: e.pos, exceso: e.pos == null ? 0 : e.pos - 1, ...x });
  }
  return out;
}
function sorteo(fs, h, semilla) {
  const R = rng(semilla), az = [];
  for (let s = 0; s < SORTEOS; s++) {
    const v = [];
    for (const f of fs) {
      const cand = [...(tkDia.get(f.dY) ?? [])]; if (!cand.length) continue;
      const x = medir(cand[Math.floor(R() * cand.length)], f.dY, f.dir, h);
      if (x) v.push(x.ex);
    }
    if (v.length) az.push(media(v));
  }
  az.sort((a, b) => a - b);
  return az;
}
function linea(nom, fs, h, semilla) {
  if (fs.length < 25) { console.log(`  ${nom.padEnd(30)} — muestra insuficiente (${fs.length})`); return null; }
  const az = sorteo(fs, h, semilla), m = media(fs.map((f) => f.ex)), ne = nEfectiva(fs, h);
  const cnt = new Map(); for (const f of fs) cnt.set(f.ticker, (cnt.get(f.ticker) ?? 0) + 1);
  const may = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
  const ord = [...fs].sort((a, b) => a.dY.localeCompare(b.dY)), k = Math.floor(ord.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? ord.slice(i * k, (i + 1) * k) : ord.slice(2 * k)).map((x) => x.ex)));
  const o = { nom, h, n: fs.length, nEf: ne.porTicker, nVen: ne.ventanas, ex: m, eqTk: eqTk(fs, "ex"), t: tPorDia(fs, "ex"),
    acierto: fs.filter((f) => f.ex > 0).length / fs.length, pctl: az.filter((x) => x < m).length / az.length,
    azP05: az[Math.floor(az.length * 0.05)], azP95: az[Math.floor(az.length * 0.95)],
    mayor: may[0], mayorPct: may[1] / fs.length, tercios: ter, mismoSigno: ter.every((x) => Math.sign(x) === Math.sign(ter[0])) };
  console.log(`  ${nom.padEnd(30)} ${String(o.n).padStart(4)} ${String(o.nVen).padStart(4)}  ${(100 * o.ex).toFixed(3).padStart(7)}% ${o.t.toFixed(2).padStart(6)} ${((100 * o.pctl).toFixed(0) + "%").padStart(5)} ${(100 * o.eqTk).toFixed(3).padStart(7)}% ${(100 * o.acierto).toFixed(0).padStart(4)}%  ${o.tercios.map((x) => (100 * x).toFixed(2).padStart(6)).join(" ")} ${(o.mismoSigno ? "sí" : "NO").padStart(4)} ${(o.mayor + " " + (100 * o.mayorPct).toFixed(0) + "%").padStart(9)}`);
  return o;
}
const CAB = `  ${"variante".padEnd(30)} ${"n".padStart(4)} ${"vent".padStart(4)}  ${"exceso".padStart(8)} ${"t/día".padStart(6)} ${"pctl".padStart(5)} ${"eqTkr".padStart(8)} ${"acier".padStart(5)}  ${"tercio1 tercio2 tercio3".padStart(21)} ${"=?".padStart(4)} ${"mayor".padStart(9)}`;

const UNA = evs.filter((e) => e.cls === "UNA_PATA");
const AA = UNA.filter((e) => e.side === "ABOVE_ASK" && e.prem >= 1e6);

console.log(`\n${"█".repeat(118)}`);
console.log(`URGENCIA · 6 — LA REGLA EN ACCIONES: print ABOVE_ASK, una pata, >=$1M -> posición CONTRARIA en la acción`);
console.log(`${"█".repeat(118)}`);

const salida = {};

// ── 1 · la escalera completa, en la acción ──────────────────────────────────────────────────
console.log(`\n1 · LA ESCALERA EN LA ACCIÓN — SEGUIR el print. Salida 1 día (la de más muestra independiente).`);
console.log(CAB);
salida.escalera = [];
let i = 0;
for (const L of ["MIDMKT", "ASKSIDE", "AT_ASK", "ABOVE_ASK", "BIDSIDE", "AT_BID", "BELOW_BID"]) {
  const o = linea(`seguir ${L}`, filas(UNA.filter((e) => e.side === L && e.prem >= 1e6), 1, +1), 1, 3000 + (i++) * 11);
  if (o) salida.escalera.push(o);
}

// ── 2 · la regla y sus variantes ────────────────────────────────────────────────────────────
console.log(`\n2 · LA REGLA (desvanecer ABOVE_ASK) Y SUS VARIANTES`);
console.log(CAB);
salida.reglas = [];
for (const h of HS) salida.reglas.push(linea(`DESVANECER · salida ${h}d`, filas(AA, h, -1), h, 3100 + h));
console.log(`  ${"·".repeat(112)}`);
salida.sinMayor = linea("sin MU · 1d", filas(AA.filter((e) => e.tk !== "MU"), 1, -1), 1, 3200);
salida.sinIdx = linea("sin índices (SPX/SPXW) · 1d", filas(AA.filter((e) => !["SPX", "SPXW", "NDX"].includes(e.tk)), 1, -1), 1, 3201);
salida.multi = linea("PLACEBO patas de spread · 1d", filas(evs.filter((e) => e.cls === "MULTI" && e.side === "ABOVE_ASK" && e.prem >= 1e6), 1, -1), 1, 3202);
salida.basura = linea("PLACEBO clase BASURA · 1d", filas(evs.filter((e) => e.cls === "BASURA" && e.side === "ABOVE_ASK" && e.prem >= 1e6), 1, -1), 1, 3203);
salida.espejo = linea("ESPEJO desvanecer BELOW_BID · 1d", filas(UNA.filter((e) => e.side === "BELOW_BID" && e.prem >= 1e6), 1, -1), 1, 3204);

// ── 3 · barrido de tamaño ───────────────────────────────────────────────────────────────────
console.log(`\n3 · ¿CRECE CON EL TAMAÑO DEL PRINT? (desvanecer ABOVE_ASK, salida 1d)`);
console.log(CAB);
salida.tamano = [];
for (const [a, b] of [[1e5, 5e5], [5e5, 1e6], [1e6, 2.5e6], [2.5e6, 1e9]]) {
  const o = linea(`$${fmt(a / 1000)}k–${b >= 1e9 ? "inf" : fmt(b / 1000) + "k"}`, filas(UNA.filter((e) => e.side === "ABOVE_ASK" && e.prem >= a && e.prem < b), 1, -1), 1, 3300 + a / 1e5);
  if (o) salida.tamano.push(o);
}

// ── 4 · la barrera ──────────────────────────────────────────────────────────────────────────
console.log(`\n4 · LA BARRERA — criterio continuo "cuánto se pasó del ask", resultado = desvanecer, acción, 1d`);
const todos = filas(UNA.filter((e) => e.prem >= 1e6 && ["ASKSIDE", "AT_ASK", "ABOVE_ASK"].includes(e.side) && e.pos != null), 1, -1);
radiografia(todos, ["ex", "exceso", "prem"], "desvanecer en la acción", { cerosLegitimos: [] });
const PRUEBAS = 95;
const ver = pasarBarrera(todos.map((f) => ({ pnl: f.ex, ticker: f.ticker, fecha: f.fecha, exceso: f.exceso })), (f) => f.exceso, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
console.log(`\n  n=${ver.detalle.n} · separación tercio alto − bajo = ${(100 * (ver.detalle.sep ?? 0)).toFixed(3)}% · t=${(ver.detalle.t ?? 0).toFixed(2)} · listón ${ver.detalle.listonT} (${PRUEBAS} pruebas)`);
for (const a of ver.aprobadas) console.log(`   ✔ ${a}`);
for (const m of ver.motivos) console.log(`   ✗ ${m}`);
console.log(`  VEREDICTO: ${ver.pasa ? "PASA" : "NO PASA"}`);
salida.barrera = { pasa: ver.pasa, motivos: ver.motivos, aprobadas: ver.aprobadas, detalle: ver.detalle, pruebas: PRUEBAS };

// ── 5 · dinero y muestra que falta ──────────────────────────────────────────────────────────
const base = filas(AA, 1, -1);
const diasF = new Set(evs.map((e) => e.dY)).size;
const evAno = (base.length / diasF) * 252;
const ex = media(base.map((f) => f.ex));
const sdDia = (() => { const m = new Map(); for (const f of base) { if (!m.has(f.dY)) m.set(f.dY, []); m.get(f.dY).push(f.ex); } return sd([...m.values()].map(media)); })();
const nDias = new Set(base.map((f) => f.dY)).size;
const liston = listonT(PRUEBAS);
const nNec = Math.ceil(((liston * sdDia) / ex) ** 2);
console.log(`\n5 · DINERO Y MUESTRA (salida 1 día — la variante con más ventanas independientes: ${nEfectiva(base, 1).ventanas})`);
const simult = evAno / 252;
for (const cap of [0.25, 0.5]) {
  const comprometido = CUENTA * cap;
  const pos = comprometido / Math.max(1, simult);
  const bruto = evAno * pos * ex, peaje = evAno * pos * 0.0006;
  console.log(`   con el ${(100 * cap).toFixed(0)}% de la cuenta ($${fmt(comprometido)}): ${simult.toFixed(1)} posiciones a la vez de $${fmt(pos)}`);
  console.log(`      ${evAno.toFixed(0)} señales/año × ${(100 * ex).toFixed(3)}% = $${fmt(bruto)} bruto − $${fmt(peaje)} de horquilla = ${("$" + fmt(bruto - peaje))}/año`);
  console.log(`      SPY sobre el mismo capital: $${fmt(comprometido * 0.14)}/año`);
}
const pot = potencia(base.map((f) => ({ pnl: f.ex, ticker: f.ticker, fecha: f.fecha })), 0.005);
console.log(`\n   POTENCIA: ${pot.mensaje}`);
console.log(`   días con señal hoy: ${nDias} · desviación entre días ${(100 * sdDia).toFixed(3)}% · efecto ${(100 * ex).toFixed(3)}%`);
console.log(`   para llegar al listón de ${liston}: ~${nNec} días con señal = ${Math.max(0, nNec - nDias)} más ≈ ${((nNec - nDias) / 21).toFixed(1)} meses`);
salida.dinero = { evAno, ex, sdDia, nDias, nNec, liston, potencia: pot, simult };

writeFileSync("scripts/cache-theta/marketsnack/urg2-final.json", JSON.stringify(salida, null, 1));
console.log(`\n  → scripts/cache-theta/marketsnack/urg2-final.json\n`);
