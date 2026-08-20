// URGENCIA · 4 — EL VEREDICTO, y la trampa que casi me lleva por delante.
//
// EN EL PASE 3 SALIÓ TODO POSITIVO: desvanecer ABOVE_ASK +5,51%, desvanecer AT_ASK +3,57%,
// desvanecer patas de spread +2,21%, desvanecer BELOW_BID +4,64%... Cuando TODO gana, no está
// ganando la señal: está ganando algo que comparten todas. Y aquí lo que comparten es el TICKER:
// "contra la misma pata del mismo día" compara los tickers del feed contra los 39 de la rejilla,
// y en esta ventana los del feed lo hicieron mejor por razones que no tienen que ver con el lado.
//
// La descomposición lo deja a la vista:  exPata(seguir) = −1,05%  ·  exPata(desvanecer) = +5,51%
//   → parte común (elección de ticker) = (−1,05 + 5,51)/2 = +2,23%   ← no es direccional
//   → parte direccional                = (5,51 − (−1,05))/2 = +3,28% ← esto sí es el lado
//
// Así que la única medida limpia es la DIRECCIONAL: (call − put) del ticker contra (call − put)
// medio del día. Ni el mercado ni la mezcla ni la elección de ticker la pueden mover.
//
// node --import tsx --max-old-space-size=10240 scripts/urg-4-veredicto.mjs

import { writeFileSync } from "node:fs";
import { rejilla, eventos, CUENTA } from "./urg-lib.mjs";
import { media, sd, tUna, fmt, nEfectiva, rng } from "./print-lib.mjs";
import { pasarBarrera, listonT, potencia } from "../lib/barreraHallazgos.ts";

const SORTEOS = 500;
const H = 5;
const rej = rejilla(), evs = eventos();

const filasDia = new Map();
for (const [k, v] of Object.entries(rej)) {
  const [tk, dY] = k.split("|");
  if (!filasDia.has(dY)) filasDia.set(dY, []);
  filasDia.get(dY).push({ tk, ...v });
}
const mercado = new Map();
for (const [dY, fs] of filasDia) for (const h of [3, 5, 10]) {
  const c = [], p = [], sp = [], spM = [];
  for (const f of fs) { const s = f.sal[h]; if (s) { c.push(s.rC); p.push(s.rP); sp.push(s.rC - s.rP); spM.push(s.mC - s.mP); } }
  if (c.length >= 3) mercado.set(`${dY}|${h}`, { C: media(c), P: media(p), sp: media(sp), spM: media(spM) });
}

function medir(tk, dY, dir, h) {
  const f = rej[`${tk}|${dY}`]; if (!f) return null;
  const s = f.sal[h]; if (!s) return null;
  const m = mercado.get(`${dY}|${h}`); if (!m) return null;
  return {
    r: dir === 1 ? s.rC : s.rP,
    dirNeta: (dir * ((s.rC - s.rP) - m.sp)) / 2,
    dirMedio: (dir * ((s.mC - s.mP) - m.spM)) / 2,     // MEDIO a MEDIO: ¿precio u horquilla?
    prima: (dir === 1 ? f.C.ask : f.P.ask) * 100,
    primaOtra: (dir === 1 ? f.P.ask : f.C.ask) * 100,
    diasReales: s.diasReales,
  };
}
const tPorDia = (fs, c) => { const m = new Map(); for (const f of fs) { if (!m.has(f.dY)) m.set(f.dY, []); m.get(f.dY).push(f[c]); } return tUna([...m.values()].map(media)); };

function construir(sel, h, signo) {
  const mejor = new Map();
  for (const e of sel) { const k = `${e.tk}|${e.dY}`; const a = mejor.get(k); if (!a || e.prem > a.prem) mejor.set(k, e); }
  const fs = [];
  for (const e of mejor.values()) {
    const dir = signo * (e.dir !== 0 ? e.dir : (e.tipo === "C" ? 1 : -1));
    const x = medir(e.tk, e.dY, dir, h);
    if (x) fs.push({ ticker: e.tk, dY: e.dY, fecha: `${e.dY.slice(0, 4)}-${e.dY.slice(4, 6)}-${e.dY.slice(6, 8)}`, fechaY: e.dY, dir, prem: e.prem, pos: e.pos, exceso: e.pos == null ? 0 : e.pos - 1, ...x });
  }
  return fs;
}

/** Sorteo de control: mismo día, misma dirección, TICKER al azar. Devuelve crudo y direccional. */
function azar(fs, h, semilla) {
  const R = rng(semilla), cr = [], dn = [];
  for (let s = 0; s < SORTEOS; s++) {
    const a = [], b = [];
    for (const f of fs) {
      const cand = filasDia.get(f.dY)?.filter((x) => x.sal[h]);
      if (!cand?.length) continue;
      const c = cand[Math.floor(R() * cand.length)];
      const x = medir(c.tk, f.dY, f.dir, h);
      if (x) { a.push(x.r); b.push(x.dirNeta); }
    }
    if (a.length) { cr.push(media(a)); dn.push(media(b)); }
  }
  cr.sort((x, y) => x - y); dn.sort((x, y) => x - y);
  return { cr, dn };
}

const UNA = evs.filter((e) => e.cls === "UNA_PATA");
const AA = UNA.filter((e) => e.side === "ABOVE_ASK" && e.prem >= 1e6);
const fs = construir(AA, H, -1);          // DESVANECER: comprar la pata contraria al print

console.log(`\n${"█".repeat(112)}`);
console.log(`URGENCIA · 4 — VEREDICTO.  Regla: print ABOVE_ASK de una pata y >= $1M -> comprar la pata CONTRARIA`);
console.log(`  (esquina 5% fuera del dinero, ~90 días) al cierre de ese día, y venderla al BID a los ${H} días.`);
console.log(`${"█".repeat(112)}\n`);

// ── 1 · LA DESCOMPOSICIÓN ───────────────────────────────────────────────────────────────────
const fsSeg = construir(AA, H, +1);
const exPataSeg = media(fsSeg.map((f) => f.r)) - media(fsSeg.map((f, i) => f.r - f.dirNeta * 0));  // no usar
console.log(`1 · DE DÓNDE VIENE CADA PUNTO (n=${fs.length} operaciones, ${new Set(fs.map((f) => f.dY)).size} días)`);
const az = azar(fs, H, 777);
const crudo = media(fs.map((f) => f.r)), crudoAzar = media(az.cr);
console.log(`   retorno CRUDO de la regla (ask->bid real) : ${(100 * crudo).toFixed(2)}%`);
console.log(`   retorno CRUDO del sorteo (mismo día/lado) : ${(100 * crudoAzar).toFixed(2)}%   [p5 ${(100 * az.cr[25]).toFixed(2)}% · p95 ${(100 * az.cr[474]).toFixed(2)}%]`);
console.log(`   diferencia contra el azar                 : ${(100 * (crudo - crudoAzar)).toFixed(2)} puntos`);
const mDir = media(fs.map((f) => f.dirNeta)), tDir = tPorDia(fs, "dirNeta");
console.log(`\n   parte DIRECCIONAL aislada (la limpia)     : ${(100 * mDir).toFixed(2)}%   t/día = ${tDir.toFixed(2)}`);
console.log(`   la misma, MEDIO a MEDIO (¿precio u horquilla?): ${(100 * media(fs.map((f) => f.dirMedio))).toFixed(2)}%   t/día = ${tPorDia(fs, "dirMedio").toFixed(2)}`);
console.log(`   percentil del direccional en 500 sorteos  : ${(100 * az.dn.filter((x) => x < mDir).length / az.dn.length).toFixed(0)}%   [p5 ${(100 * az.dn[25]).toFixed(2)}% · p95 ${(100 * az.dn[474]).toFixed(2)}%]`);

// ── 2 · n EFECTIVA ──────────────────────────────────────────────────────────────────────────
const ne = nEfectiva(fs, H);
console.log(`\n2 · n EFECTIVA — las filas mienten porque los días se solapan`);
console.log(`   filas: ${fs.length} · días distintos: ${new Set(fs.map((f) => f.dY)).size}`);
console.log(`   n efectiva sin solape por ticker : ${ne.porTicker}`);
console.log(`   ventanas de calendario independientes: ${ne.ventanas}   <- el techo real`);

// ── 3 · LOS TERCIOS DE TIEMPO ───────────────────────────────────────────────────────────────
console.log(`\n3 · LOS TRES TERCIOS DE TIEMPO (direccional)`);
const ord = [...fs].sort((a, b) => a.dY.localeCompare(b.dY));
const k = Math.floor(ord.length / 3);
const tercios = [];
for (let i = 0; i < 3; i++) {
  const g = i < 2 ? ord.slice(i * k, (i + 1) * k) : ord.slice(2 * k);
  const t = { periodo: `${g[0].fecha} → ${g[g.length - 1].fecha}`, n: g.length, dir: media(g.map((x) => x.dirNeta)), crudo: media(g.map((x) => x.r)), t: tPorDia(g, "dirNeta") };
  tercios.push(t);
  console.log(`   ${t.periodo}  n=${String(t.n).padStart(3)}  direccional ${(100 * t.dir).toFixed(2).padStart(6)}%  t/día ${t.t.toFixed(2).padStart(5)}  crudo ${(100 * t.crudo).toFixed(1).padStart(6)}%`);
}
const mismoSigno = tercios.every((t) => Math.sign(t.dir) === Math.sign(tercios[0].dir));
console.log(`   mismo signo en los tres: ${mismoSigno ? "SÍ" : "NO"}`);

// ── 4 · LA BARRERA con el criterio continuo ─────────────────────────────────────────────────
console.log(`\n4 · LA BARRERA — ¿ordena "cuánto se pasó del ask" el resultado direccional?`);
const todos = construir(UNA.filter((e) => e.prem >= 1e6 && ["ASKSIDE", "AT_ASK", "ABOVE_ASK"].includes(e.side) && e.pos != null), H, -1);
const PRUEBAS = 70;
const ver = pasarBarrera(todos.map((f) => ({ pnl: f.dirNeta, ticker: f.ticker, fecha: f.fecha, exceso: f.exceso })), (f) => f.exceso, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
console.log(`   n=${ver.detalle.n} · separación tercio alto − tercio bajo = ${(100 * (ver.detalle.sep ?? 0)).toFixed(2)}% · t=${(ver.detalle.t ?? 0).toFixed(2)} · listón ${ver.detalle.listonT}`);
for (const a of ver.aprobadas) console.log(`    ✔ ${a}`);
for (const m of ver.motivos) console.log(`    ✗ ${m}`);
console.log(`   VEREDICTO: ${ver.pasa ? "PASA" : "NO PASA"}`);

// ── 5 · ¿TENÍA FUERZA LA PRUEBA? ────────────────────────────────────────────────────────────
const pot = potencia(fs.map((f) => ({ pnl: f.dirNeta, ticker: f.ticker, fecha: f.fecha })), 0.03);
console.log(`\n5 · POTENCIA — ${pot.mensaje}`);

// ── 6 · DÓLARES ─────────────────────────────────────────────────────────────────────────────
console.log(`\n6 · DÓLARES AL AÑO sobre $${fmt(CUENTA)}`);
const diasFlujo = new Set(evs.map((e) => e.dY)).size;
const evAno = (fs.length / diasFlujo) * 252;
const prima = media(fs.map((f) => f.prima));
const diasR = media(fs.map((f) => f.diasReales));
const simult = (evAno / 252) * diasR * (7 / 5);          // posiciones abiertas a la vez, en días naturales
const comprometido = simult * prima;
console.log(`   eventos: ${fs.length} en ${diasFlujo} días de flujo  ->  ${evAno.toFixed(0)} al año`);
console.log(`   prima media por contrato: $${fmt(prima)} · días en posición: ${diasR.toFixed(1)}`);
console.log(`   posiciones simultáneas: ${simult.toFixed(1)} -> capital comprometido ~$${fmt(comprometido)}`);
console.log(`   retorno CRUDO ${(100 * crudo).toFixed(2)}%/op  ->  ${("$" + fmt(evAno * prima * crudo))}/año  (1 contrato por señal)`);
console.log(`   el SORTEO en el mismo sitio: ${(100 * crudoAzar).toFixed(2)}%/op  ->  ${("$" + fmt(evAno * prima * crudoAzar))}/año`);
console.log(`   SPY sobre el mismo capital comprometido: $${fmt(comprometido * 0.14)}/año`);
const nCtr = Math.max(1, Math.floor((CUENTA * 0.1) / (simult * prima) * simult) / simult);
console.log(`\n   Con el 10% de la cuenta ($${fmt(CUENTA * 0.1)}) no se pueden llevar ${simult.toFixed(1)} posiciones de $${fmt(prima)}:`);
console.log(`   harían falta $${fmt(comprometido)}. Tomando sólo 1 de cada ${Math.ceil(comprometido / (CUENTA * 0.1))} señales, ${("$" + fmt(evAno * prima * crudo / Math.ceil(comprometido / (CUENTA * 0.1))))}/año.`);

// ── 7 · CUÁNTOS DÍAS HARÍAN FALTA ───────────────────────────────────────────────────────────
const sdDia = (() => { const m = new Map(); for (const f of fs) { if (!m.has(f.dY)) m.set(f.dY, []); m.get(f.dY).push(f.dirNeta); } return sd([...m.values()].map(media)); })();
const nDiasAhora = new Set(fs.map((f) => f.dY)).size;
const liston = listonT(PRUEBAS);
const nDiasNec = Math.ceil(((liston * sdDia) / mDir) ** 2);
console.log(`\n7 · CUÁNTA MUESTRA HARÍA FALTA`);
console.log(`   hoy: ${nDiasAhora} días con señal · desviación entre días ${(100 * sdDia).toFixed(2)}% · efecto ${(100 * mDir).toFixed(2)}%`);
console.log(`   para llegar al listón de ${liston} (${PRUEBAS} pruebas) harían falta ~${nDiasNec} días con señal`);
console.log(`   = ${nDiasNec - nDiasAhora} días más ~= ${((nDiasNec - nDiasAhora) / 21).toFixed(1)} meses de bolsa capturando el feed hacia delante`);

writeFileSync("scripts/cache-theta/marketsnack/urg2-veredicto.json", JSON.stringify({
  n: fs.length, nEfTk: ne.porTicker, nEfVen: ne.ventanas, dias: nDiasAhora,
  crudo, crudoAzar, dirNeta: mDir, tDir, dirMedio: media(fs.map((f) => f.dirMedio)),
  tercios, mismoSigno, barrera: { pasa: ver.pasa, motivos: ver.motivos, detalle: ver.detalle }, potencia: pot,
  prima, diasReales: diasR, evAno, comprometido, dolaresAno: evAno * prima * crudo, nDiasNec, liston,
}, null, 1));
console.log(`\n  → scripts/cache-theta/marketsnack/urg2-veredicto.json\n`);
