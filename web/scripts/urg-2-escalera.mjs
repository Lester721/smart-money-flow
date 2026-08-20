// URGENCIA · 2 — LA ESCALERA, con la mezcla call/put NEUTRALIZADA.
//
// POR QUÉ ESTE SEGUNDO PASE. En el primero el "exceso contra el mercado del día" restaba la media
// de TODAS las patas (calls y puts juntas). Pero los escalones no tienen la misma mezcla:
// ASKSIDE es 60% alcista, AT_ASK 70% y ABOVE_ASK 76%. En una ventana en la que el subyacente
// subió, un cubo con más calls gana solo por eso. Ese "exceso" medía la MEZCLA, no la elección.
//
// Aquí se mide contra LA MISMA PATA del mismo día (calls contra calls, puts contra puts), y el
// sorteo de control mantiene la dirección y sólo cambia el TICKER. Así lo único que se pone a
// prueba es: ¿el feed elige mejor ticker que una moneda, dentro del mismo día y del mismo lado?
//
// Y se añade una medida puramente direccional: (call − put) del ticker contra (call − put) medio
// del día. Esa no la puede mover ni el mercado ni la mezcla.
//
// node --import tsx --max-old-space-size=10240 scripts/urg-2-escalera.mjs

import { writeFileSync } from "node:fs";
import { rejilla, eventos, SALIDAS } from "./urg-lib.mjs";
import { media, tUna, fmt, nEfectiva, rng } from "./print-lib.mjs";

const UMBRAL = Number(process.env.UMBRAL || 1e6);
const CLASE = process.env.CLASE || "UNA_PATA";
const SORTEOS = 500;
const ORDEN = ["MIDMKT", "ASKSIDE", "AT_ASK", "ABOVE_ASK", "BIDSIDE", "AT_BID", "BELOW_BID"];

const rej = rejilla(), evs = eventos();

const filasDia = new Map();
for (const [k, v] of Object.entries(rej)) {
  const [tk, dY] = k.split("|");
  if (!filasDia.has(dY)) filasDia.set(dY, []);
  filasDia.get(dY).push({ tk, ...v });
}
const mercado = new Map();
for (const [dY, fs] of filasDia) for (const h of SALIDAS) {
  const c = [], p = [], sp = [];
  for (const f of fs) { const s = f.sal[h]; if (s) { c.push(s.rC); p.push(s.rP); sp.push(s.rC - s.rP); } }
  if (c.length >= 3) mercado.set(`${dY}|${h}`, { C: media(c), P: media(p), sp: media(sp), n: c.length });
}

function seguir(tk, dY, dir, h) {
  const f = rej[`${tk}|${dY}`]; if (!f) return null;
  const s = f.sal[h]; if (!s) return null;
  const m = mercado.get(`${dY}|${h}`); if (!m) return null;
  const r = dir === 1 ? s.rC : s.rP;
  const mm = dir === 1 ? m.C : m.P;
  return {
    r,
    exPata: r - mm,                                   // contra la MISMA pata del mismo día
    dirNeta: (dir * ((s.rC - s.rP) - m.sp)) / 2,       // puramente direccional
    medio: (dir === 1 ? s.mC : s.mP) - mm,             // medio→medio, para separar precio de horquilla
    prima: (dir === 1 ? f.C.ask : f.P.ask) * 100,
    diasReales: s.diasReales,
  };
}

const tPorDia = (fs, campo) => {
  const m = new Map();
  for (const f of fs) { if (!m.has(f.dY)) m.set(f.dY, []); m.get(f.dY).push(f[campo]); }
  return tUna([...m.values()].map(media));
};

/** Sorteo: mismo día, MISMA dirección, ticker al azar. Sólo se pone a prueba la elección. */
function contraAzar(fs, h, campo, semilla) {
  const R = rng(semilla), medias = [];
  for (let s = 0; s < SORTEOS; s++) {
    const v = [];
    for (const f of fs) {
      const cand = filasDia.get(f.dY)?.filter((x) => x.sal[h]);
      if (!cand?.length) continue;
      const c = cand[Math.floor(R() * cand.length)];
      const x = seguir(c.tk, f.dY, f.dir, h);
      if (x) v.push(x[campo]);
    }
    if (v.length) medias.push(media(v));
  }
  medias.sort((a, b) => a - b);
  return medias;
}

function bloque(titulo, sel, h, semilla) {
  const mejor = new Map();
  for (const e of sel) { const k = `${e.tk}|${e.dY}`; const a = mejor.get(k); if (!a || e.prem > a.prem) mejor.set(k, e); }
  const fs = [];
  for (const e of mejor.values()) {
    const dir = e.dir !== 0 ? e.dir : (e.tipo === "C" ? 1 : -1);   // MIDMKT no tiene lado: se usa el tipo
    const x = seguir(e.tk, e.dY, dir, h);
    if (x) fs.push({ ticker: e.tk, dY: e.dY, fecha: `${e.dY.slice(0, 4)}-${e.dY.slice(4, 6)}-${e.dY.slice(6, 8)}`, fechaY: e.dY, dir, prem: e.prem, pos: e.pos, ...x });
  }
  if (fs.length < 25) return null;
  const ne = nEfectiva(fs, h);
  const cnt = new Map(); for (const f of fs) cnt.set(f.ticker, (cnt.get(f.ticker) ?? 0) + 1);
  const may = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
  const az = contraAzar(fs, h, "exPata", semilla);
  const azD = contraAzar(fs, h, "dirNeta", semilla + 5000);
  const mEx = media(fs.map((f) => f.exPata)), mDir = media(fs.map((f) => f.dirNeta));
  return {
    titulo, n: fs.length, nEfTk: ne.porTicker, nEfVen: ne.ventanas, dias: new Set(fs.map((f) => f.dY)).size,
    r: media(fs.map((f) => f.r)), exPata: mEx, dirNeta: mDir, medio: media(fs.map((f) => f.medio)),
    acierto: fs.filter((f) => f.r > 0).length / fs.length,
    tPata: tPorDia(fs, "exPata"), tDir: tPorDia(fs, "dirNeta"),
    prima: media(fs.map((f) => f.prima)), diasReales: media(fs.map((f) => f.diasReales)),
    mayor: may[0], mayorPct: may[1] / fs.length, alcistas: fs.filter((f) => f.dir === 1).length / fs.length,
    azP05: az[Math.floor(az.length * 0.05)], azP95: az[Math.floor(az.length * 0.95)],
    pctAzar: az.filter((x) => x < mEx).length / az.length,
    azDP05: azD[Math.floor(azD.length * 0.05)], azDP95: azD[Math.floor(azD.length * 0.95)],
    pctAzarDir: azD.filter((x) => x < mDir).length / azD.length,
    fs,
  };
}

console.log(`\n${"█".repeat(112)}`);
console.log(`URGENCIA · 2 — ESCALERA con la mezcla call/put NEUTRALIZADA · prima >= $${fmt(UMBRAL / 1000)}k · clase ${CLASE}`);
console.log(`  vehículo: 5% fuera del dinero, ~90 días · COMPRA al ask real, VENTA al bid real de la cadena`);
console.log(`${"█".repeat(112)}`);

const base = evs.filter((e) => e.prem >= UMBRAL && (CLASE === "TODO" || e.cls === CLASE));
console.log(`\n  prints que cumplen: ${fmt(base.length)}`);

const salida = {};
for (const h of SALIDAS) {
  console.log(`\n${"═".repeat(112)}`);
  console.log(`SALIDA A ${h} DÍAS`);
  console.log(`${"═".repeat(112)}`);
  console.log(`  ${"lado".padEnd(11)} ${"n".padStart(5)} ${"nEf".padStart(4)}  ${"crudo".padStart(7)} ${"vs MISMA PATA".padStart(14)} ${"t/día".padStart(6)} ${"azar p5..p95".padStart(14)} ${"pctl".padStart(4)} ${"DIRECCIONAL".padStart(12)} ${"t/día".padStart(6)} ${"pctl".padStart(4)}  ${"alcis".padStart(5)} ${"mayor".padStart(10)}`);
  const filas = [];
  let i = 0;
  for (const L of ORDEN) {
    const b = bloque(L, base.filter((e) => e.side === L), h, 100 + (i++) * 13);
    if (!b) { console.log(`  ${L.padEnd(11)} — muestra insuficiente`); continue; }
    filas.push(b);
    console.log(`  ${L.padEnd(11)} ${String(b.n).padStart(5)} ${String(b.nEfTk).padStart(4)}  ${(100 * b.r).toFixed(1).padStart(6)}% ${(100 * b.exPata).toFixed(2).padStart(13)}% ${b.tPata.toFixed(2).padStart(6)} ${(100 * b.azP05).toFixed(1).padStart(5)}%..${(100 * b.azP95).toFixed(1).padStart(4)}% ${(100 * b.pctAzar).toFixed(0).padStart(3)}% ${(100 * b.dirNeta).toFixed(2).padStart(11)}% ${b.tDir.toFixed(2).padStart(6)} ${(100 * b.pctAzarDir).toFixed(0).padStart(3)}%  ${(100 * b.alcistas).toFixed(0).padStart(4)}% ${(b.mayor + " " + (100 * b.mayorPct).toFixed(0) + "%").padStart(10)}`);
  }
  salida[h] = filas.map(({ fs, ...r }) => r);

  for (const [nom, ks] of [["COMPRA", ["ASKSIDE", "AT_ASK", "ABOVE_ASK"]], ["VENTA ", ["BIDSIDE", "AT_BID", "BELOW_BID"]]]) {
    const e = ks.map((L) => filas.find((f) => f.titulo === L)).filter(Boolean);
    if (e.length !== 3) continue;
    const mo = (a) => (a[0] <= a[1] && a[1] <= a[2]) || (a[0] >= a[1] && a[1] >= a[2]);
    console.log(`  ESCALA ${nom} vs misma pata: ${e.map((x) => (100 * x.exPata).toFixed(2) + "%").join(" -> ")}  ${mo(e.map((x) => x.exPata)) ? "MONOTONA" : "NO monotona"}`);
    console.log(`  ESCALA ${nom} direccional  : ${e.map((x) => (100 * x.dirNeta).toFixed(2) + "%").join(" -> ")}  ${mo(e.map((x) => x.dirNeta)) ? "MONOTONA" : "NO monotona"}`);
  }
}

writeFileSync(`scripts/cache-theta/marketsnack/urg2-neutral-${CLASE}-${UMBRAL}.json`, JSON.stringify({ UMBRAL, CLASE, salida }, null, 1));
console.log(`\n  → scripts/cache-theta/marketsnack/urg2-neutral-${CLASE}-${UMBRAL}.json\n`);
