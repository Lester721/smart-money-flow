// URGENCIA · 3 — LA ESCALERA SALE INVERTIDA: se pone a prueba DESVANECER al que tiene prisa.
//
// Lo que dijo el pase 2, neutralizando la mezcla call/put: seguir al print escala con la
// agresividad, pero HACIA ABAJO.  ASKSIDE +2,30% · AT_ASK +0,80% · ABOVE_ASK −1,05% (5 días,
// contra la misma pata del mismo día), y en la medida puramente direccional
// +0,21% → −1,39% → −3,28%, monótona en los tres escalones.
//
// Aquí se prueba la regla que sale de ahí: cuando alguien paga POR ENCIMA DEL ASK, comprar la
// pata CONTRARIA. Con todo lo que tiene que acompañar a un hallazgo:
//   · escalera CONTINUA — ¿cuánto por encima del ask? Si el efecto crece con la distancia, hay
//     mecanismo; si es un escalón plano, es una etiqueta.
//   · barrido de PRIMA — ¿crece con el tamaño del print?
//   · PLACEBOS: patas de spread (no debería haber nada), el día ANTES (causalidad), el espejo
//     por debajo del bid.
//   · sorteo de 500 · n efectiva · concentración por ticker · dólares al año.
//
// node --import tsx --max-old-space-size=10240 scripts/urg-3-desvanecer.mjs

import { writeFileSync } from "node:fs";
import { rejilla, eventos, SALIDAS, CUENTA } from "./urg-lib.mjs";
import { media, tUna, fmt, nEfectiva, rng, dias } from "./print-lib.mjs";
import { pasarBarrera, listonT } from "../lib/barreraHallazgos.ts";
import { radiografia } from "../lib/radiografia.ts";

const SORTEOS = 500;
const rej = rejilla(), evs = eventos();

const filasDia = new Map();
for (const [k, v] of Object.entries(rej)) {
  const [tk, dY] = k.split("|");
  if (!filasDia.has(dY)) filasDia.set(dY, []);
  filasDia.get(dY).push({ tk, ...v });
}
const DIAS_REJ = [...filasDia.keys()].sort();
const mercado = new Map();
for (const [dY, fs] of filasDia) for (const h of SALIDAS) {
  const c = [], p = [], sp = [];
  for (const f of fs) { const s = f.sal[h]; if (s) { c.push(s.rC); p.push(s.rP); sp.push(s.rC - s.rP); } }
  if (c.length >= 3) mercado.set(`${dY}|${h}`, { C: media(c), P: media(p), sp: media(sp) });
}

/** COMPRAR la pata `dir` de la esquina barata al ASK y venderla al BID a `h` días. */
function comprar(tk, dY, dir, h) {
  const f = rej[`${tk}|${dY}`]; if (!f) return null;
  const s = f.sal[h]; if (!s) return null;
  const m = mercado.get(`${dY}|${h}`); if (!m) return null;
  const r = dir === 1 ? s.rC : s.rP;
  return { r, exPata: r - (dir === 1 ? m.C : m.P), dirNeta: (dir * ((s.rC - s.rP) - m.sp)) / 2,
           prima: (dir === 1 ? f.C.ask : f.P.ask) * 100, diasReales: s.diasReales };
}

const tPorDia = (fs, c) => { const m = new Map(); for (const f of fs) { if (!m.has(f.dY)) m.set(f.dY, []); m.get(f.dY).push(f[c]); } return tUna([...m.values()].map(media)); };
const equipTk = (fs, c) => { const m = new Map(); for (const f of fs) { if (!m.has(f.ticker)) m.set(f.ticker, []); m.get(f.ticker).push(f[c]); } return media([...m.values()].map(media)); };

function azar(fs, h, campo, semilla) {
  const R = rng(semilla), out = [];
  for (let s = 0; s < SORTEOS; s++) {
    const v = [];
    for (const f of fs) {
      const cand = filasDia.get(f.dY)?.filter((x) => x.sal[h]);
      if (!cand?.length) continue;
      const c = cand[Math.floor(R() * cand.length)];
      const x = comprar(c.tk, f.dY, f.dir, h);
      if (x) v.push(x[campo]);
    }
    if (v.length) out.push(media(v));
  }
  out.sort((a, b) => a - b);
  return out;
}

/**
 * Construye las filas de una regla. `signo` = +1 seguir el print, −1 desvanecerlo.
 * `desfase` = cuántos días de cadena se retrasa la entrada (0 = el día del print; −1 = el día
 * ANTERIOR, que es el placebo de causalidad: ahí todavía no ha pasado nada).
 */
function reglas(sel, h, signo, desfase = 0) {
  const mejor = new Map();
  for (const e of sel) { const k = `${e.tk}|${e.dY}`; const a = mejor.get(k); if (!a || e.prem > a.prem) mejor.set(k, e); }
  const fs = [];
  for (const e of mejor.values()) {
    const dir0 = e.dir !== 0 ? e.dir : (e.tipo === "C" ? 1 : -1);
    const dir = signo * dir0;
    let dY = e.dY;
    if (desfase) {
      const i = DIAS_REJ.indexOf(e.dY);
      if (i < 0 || i + desfase < 0) continue;
      dY = DIAS_REJ[i + desfase];
    }
    const x = comprar(e.tk, dY, dir, h);
    if (x) fs.push({ ticker: e.tk, dY, fecha: `${dY.slice(0, 4)}-${dY.slice(4, 6)}-${dY.slice(6, 8)}`, fechaY: dY,
                     dir, prem: e.prem, pos: e.pos, exceso: e.pos == null ? 0 : e.pos - 1, ...x });
  }
  return fs;
}

function resumen(nombre, fs, h, semilla, mostrar = true) {
  if (fs.length < 25) { if (mostrar) console.log(`  ${nombre.padEnd(34)} — muestra insuficiente (${fs.length})`); return null; }
  const ne = nEfectiva(fs, h);
  const cnt = new Map(); for (const f of fs) cnt.set(f.ticker, (cnt.get(f.ticker) ?? 0) + 1);
  const may = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
  const mEx = media(fs.map((f) => f.exPata)), mDir = media(fs.map((f) => f.dirNeta)), mR = media(fs.map((f) => f.r));
  const az = azar(fs, h, "exPata", semilla);
  const prima = media(fs.map((f) => f.prima)), dr = media(fs.map((f) => f.diasReales));
  const o = { nombre, n: fs.length, nEfTk: ne.porTicker, nEfVen: ne.ventanas, dias: new Set(fs.map((f) => f.dY)).size,
    r: mR, exPata: mEx, dirNeta: mDir, exPataEqTk: equipTk(fs, "exPata"), rEqTk: equipTk(fs, "r"),
    acierto: fs.filter((f) => f.r > 0).length / fs.length, tPata: tPorDia(fs, "exPata"), tDir: tPorDia(fs, "dirNeta"),
    prima, diasReales: dr, ciclos: 365 / dr, mayor: may[0], mayorPct: may[1] / fs.length,
    azP05: az[Math.floor(az.length * 0.05)], azP95: az[Math.floor(az.length * 0.95)], azMed: media(az),
    pctAzar: az.filter((x) => x < mEx).length / az.length };
  if (mostrar)
    console.log(`  ${nombre.padEnd(34)} ${String(o.n).padStart(4)} ${String(o.nEfTk).padStart(4)}  ${(100 * o.r).toFixed(1).padStart(6)}% ${(100 * o.exPata).toFixed(2).padStart(7)}% ${o.tPata.toFixed(2).padStart(6)} ${(100 * o.dirNeta).toFixed(2).padStart(7)}% ${o.tDir.toFixed(2).padStart(6)} ${((100 * o.pctAzar).toFixed(0) + "%").padStart(5)} ${(100 * o.exPataEqTk).toFixed(2).padStart(7)}% ${(100 * o.acierto).toFixed(0).padStart(4)}% ${(o.mayor + " " + (100 * o.mayorPct).toFixed(0) + "%").padStart(10)}`);
  return o;
}

const CAB = `  ${"regla".padEnd(34)} ${"n".padStart(4)} ${"nEf".padStart(4)}  ${"crudo".padStart(7)} ${"vs pata".padStart(8)} ${"t/día".padStart(6)} ${"direcc".padStart(8)} ${"t/día".padStart(6)} ${"pctl".padStart(5)} ${"eqTkr".padStart(8)} ${"acier".padStart(5)} ${"mayor".padStart(10)}`;

console.log(`\n${"█".repeat(120)}`);
console.log(`URGENCIA · 3 — DESVANECER AL QUE TIENE PRISA. Compra al ASK real, venta al BID real. 500 sorteos.`);
console.log(`${"█".repeat(120)}`);

const UNA = evs.filter((e) => e.cls === "UNA_PATA");
const salida = {};

// ── A · LA ESCALERA CONTINUA: ¿cuánto por encima del ask? ───────────────────────────────────
console.log(`\n${"═".repeat(120)}`);
console.log(`A · ESCALERA CONTINUA — prints de UNA PATA con prima >= $1M, por CUÁNTO pasaron del ask (pos−1)`);
console.log(`    SEGUIR el print. Si el efecto crece con la distancia por encima del ask, hay mecanismo.`);
console.log(`${"═".repeat(120)}`);
const TRAMOS = [[-0.5, 0, "dentro (0,5→1,0 ask)"], [0, 0.25, "justo encima  0–25%"], [0.25, 1, "encima  25–100%"], [1, 3, "encima 100–300%"], [3, 99, "encima >300%"]];
for (const h of [3, 5]) {
  console.log(`\n  SALIDA ${h}d${CAB.slice(1)}`);
  const acc = [];
  for (const [a, b, nom] of TRAMOS) {
    const sel = UNA.filter((e) => e.prem >= 1e6 && (e.side === "ASKSIDE" || e.side === "AT_ASK" || e.side === "ABOVE_ASK") && e.pos != null && e.pos - 1 > a && e.pos - 1 <= b);
    const o = resumen(nom, reglas(sel, h, +1), h, 900 + a * 7 + b);
    if (o) acc.push(o);
  }
  salida[`continua${h}`] = acc;
}

// ── B · BARRIDO DE PRIMA sobre ABOVE_ASK ────────────────────────────────────────────────────
console.log(`\n${"═".repeat(120)}`);
console.log(`B · ABOVE_ASK por TAMAÑO del print — DESVANECER (comprar la pata contraria). Salida 5 días.`);
console.log(`${"═".repeat(120)}`);
console.log(CAB);
const UMBS = [[1e5, 5e5], [5e5, 1e6], [1e6, 2.5e6], [2.5e6, 1e9], [1e6, 1e9]];
const accB = [];
for (const [a, b] of UMBS) {
  const sel = UNA.filter((e) => e.side === "ABOVE_ASK" && e.prem >= a && e.prem < b);
  const o = resumen(`desvanecer $${fmt(a / 1000)}k–${b >= 1e9 ? "∞" : fmt(b / 1000) + "k"}`, reglas(sel, 5, -1), 5, 300 + a / 1e5);
  if (o) accB.push(o);
}
salida.prima = accB;

// ── C · LA REGLA CANDIDATA y sus PLACEBOS ───────────────────────────────────────────────────
console.log(`\n${"═".repeat(120)}`);
console.log(`C · LA REGLA y sus PLACEBOS — ABOVE_ASK, una pata, prima >= $1M`);
console.log(`${"═".repeat(120)}`);
console.log(CAB);
const AA = UNA.filter((e) => e.side === "ABOVE_ASK" && e.prem >= 1e6);
const MULTI_AA = evs.filter((e) => e.cls === "MULTI" && e.side === "ABOVE_ASK" && e.prem >= 1e6);
const BB = UNA.filter((e) => e.side === "BELOW_BID" && e.prem >= 1e6);
const AT = UNA.filter((e) => e.side === "AT_ASK" && e.prem >= 1e6);
const accC = {};
for (const h of SALIDAS) {
  accC[`regla${h}`] = resumen(`DESVANECER ABOVE_ASK · ${h}d`, reglas(AA, h, -1), h, 401 + h);
}
console.log(`  ${"·".repeat(110)}`);
accC.seguir5 = resumen("(control) SEGUIR ABOVE_ASK · 5d", reglas(AA, 5, +1), 5, 411);
accC.antes5 = resumen("PLACEBO día ANTES del print · 5d", reglas(AA, 5, -1, -1), 5, 412);
accC.multi5 = resumen("PLACEBO patas de spread · 5d", reglas(MULTI_AA, 5, -1), 5, 413);
accC.espejo5 = resumen("ESPEJO desvanecer BELOW_BID · 5d", reglas(BB, 5, -1), 5, 414);
accC.atask5 = resumen("(escalón previo) desv. AT_ASK · 5d", reglas(AT, 5, -1), 5, 415);
salida.regla = accC;

// ── D · LA BARRERA sobre el criterio continuo ───────────────────────────────────────────────
console.log(`\n${"═".repeat(120)}`);
console.log(`D · LA BARRERA — criterio continuo "cuánto se pasó del ask", resultado = DESVANECER. Salida 5d.`);
console.log(`${"═".repeat(120)}`);
const todosAsk = UNA.filter((e) => e.prem >= 1e6 && ["ASKSIDE", "AT_ASK", "ABOVE_ASK"].includes(e.side) && e.pos != null);
const fsB = reglas(todosAsk, 5, -1).map((f) => ({ pnl: f.exPata, ticker: f.ticker, fecha: f.fecha, exceso: f.exceso }));
radiografia(fsB, ["pnl", "exceso"], "desvanecer por exceso sobre el ask", { cerosLegitimos: ["pnl"] });
const PRUEBAS = 60;
const ver = pasarBarrera(fsB, (f) => f.exceso, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
console.log(`\n  n=${ver.detalle.n} · separación alto−bajo = ${(100 * (ver.detalle.sep ?? 0)).toFixed(2)}% · t=${(ver.detalle.t ?? 0).toFixed(2)} · listón ${ver.detalle.listonT} (${PRUEBAS} pruebas)`);
for (const a of ver.aprobadas) console.log(`   ✔ ${a}`);
for (const m of ver.motivos) console.log(`   ✗ ${m}`);
console.log(`\n  VEREDICTO DE LA BARRERA: ${ver.pasa ? "PASA" : "NO PASA"}`);
salida.barrera = { pasa: ver.pasa, motivos: ver.motivos, aprobadas: ver.aprobadas, detalle: ver.detalle, pruebas: PRUEBAS };

writeFileSync("scripts/cache-theta/marketsnack/urg2-desvanecer.json", JSON.stringify(salida, null, 1));
console.log(`\n  → scripts/cache-theta/marketsnack/urg2-desvanecer.json\n`);
