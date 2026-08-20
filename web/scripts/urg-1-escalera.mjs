// URGENCIA · 1 — ¿ESCALA el resultado con la agresividad?
//
// LA REGLA QUE SE PRUEBA: "cuando veas un print de prima alta ejecutado POR ENCIMA DEL ASK,
// cómpralo": comprar al cierre de ese día la opción de la esquina barata (5% fuera, ~90 días) en
// la dirección del print, y venderla al bid a los 3/5/10 días.
//
// Se comparan los TRES escalones de compra —ASKSIDE (dentro de la horquilla, por encima del
// medio) · AT_ASK (justo en el ask) · ABOVE_ASK (por encima del ask)— y sus tres espejos de
// venta. Si el resultado ESCALA con la agresividad hay mecanismo; si no, son etiquetas sobre
// ruido. MIDMKT va de placebo: ahí no hay urgencia por definición.
//
// node --import tsx --max-old-space-size=10240 scripts/urg-1-escalera.mjs

import { writeFileSync } from "node:fs";
import { rejilla, eventos, SALIDAS, CUENTA } from "./urg-lib.mjs";
import { media, sd, tUna, fmt, nEfectiva, rng } from "./print-lib.mjs";
import { radiografia } from "../lib/radiografia.ts";

const UMBRAL = Number(process.env.UMBRAL || 1e6);
const CLASE = process.env.CLASE || "UNA_PATA";
const SORTEOS = 500;
const ORDEN = ["MIDMKT", "ASKSIDE", "AT_ASK", "ABOVE_ASK", "BIDSIDE", "AT_BID", "BELOW_BID"];

const rej = rejilla(), evs = eventos();

// ── mercado del día: la media de TODAS las patas de la rejilla ese día ──────────────────────
const filasDia = new Map();
for (const [k, v] of Object.entries(rej)) {
  const [tk, dY] = k.split("|");
  if (!filasDia.has(dY)) filasDia.set(dY, []);
  filasDia.get(dY).push({ tk, ...v });
}
const mercado = new Map();   // dY|h -> {todo, C, P}
for (const [dY, fs] of filasDia) for (const h of SALIDAS) {
  const c = [], p = [];
  for (const f of fs) { const s = f.sal[h]; if (s) { c.push(s.rC); p.push(s.rP); } }
  if (c.length >= 3) mercado.set(`${dY}|${h}`, { todo: media([...c, ...p]), C: media(c), P: media(p), n: c.length });
}

/** Resultado de SEGUIR un evento: comprar la pata de su dirección. */
function seguir(tk, dY, dir, h) {
  const f = rej[`${tk}|${dY}`]; if (!f) return null;
  const s = f.sal[h]; if (!s) return null;
  const m = mercado.get(`${dY}|${h}`); if (!m) return null;
  const r = dir === 1 ? s.rC : s.rP;
  const rm = dir === 1 ? s.mC : s.mP;                       // medio→medio, sólo diagnóstico
  const mm = dir === 1 ? m.C : m.P;
  const prima = (dir === 1 ? f.C.ask : f.P.ask) * 100;
  return { r, exDia: r - m.todo, exPata: r - mm, medio: rm, prima, diasReales: s.diasReales, rS: s.rS };
}

/** t agrupando por DÍA — dos entradas del mismo día no son dos pruebas. */
const tPorDia = (fs, campo) => {
  const m = new Map();
  for (const f of fs) { if (!m.has(f.dY)) m.set(f.dY, []); m.get(f.dY).push(f[campo]); }
  return tUna([...m.values()].map(media));
};

/** Control contra el azar: mismo día, mismo nº de operaciones, ticker y dirección SORTEADOS. */
function contraAzar(fs, h, semilla = 7) {
  const R = rng(semilla), medias = [];
  for (let s = 0; s < SORTEOS; s++) {
    const v = [];
    for (const f of fs) {
      const cand = filasDia.get(f.dY)?.filter((x) => x.sal[h]);
      if (!cand?.length) continue;
      const c = cand[Math.floor(R() * cand.length)];
      const dir = R() < 0.5 ? 1 : -1;
      const x = seguir(c.tk, f.dY, dir, h);
      if (x) v.push(x.exDia);
    }
    if (v.length) medias.push(media(v));
  }
  medias.sort((a, b) => a - b);
  return medias;
}

function bloque(titulo, sel, h, semilla) {
  // un evento por (ticker, día): el de MÁS PRIMA
  const mejor = new Map();
  for (const e of sel) { const k = `${e.tk}|${e.dY}`; const a = mejor.get(k); if (!a || e.prem > a.prem) mejor.set(k, e); }
  const fs = [];
  for (const e of mejor.values()) {
    const x = seguir(e.tk, e.dY, e.dir, h);
    if (x) fs.push({ ticker: e.tk, dY: e.dY, fecha: `${e.dY.slice(0, 4)}-${e.dY.slice(4, 6)}-${e.dY.slice(6, 8)}`, fechaY: e.dY, dir: e.dir, prem: e.prem, pos: e.pos, agr: e.pos == null ? 0 : Math.abs(e.pos - 0.5) * 2, ...x });
  }
  if (fs.length < 25) return null;
  const ne = nEfectiva(fs, h);
  const cnt = new Map(); for (const f of fs) cnt.set(f.ticker, (cnt.get(f.ticker) ?? 0) + 1);
  const may = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
  const az = contraAzar(fs, h, semilla);
  const mEx = media(fs.map((f) => f.exDia));
  const pct = az.filter((x) => x < mEx).length / az.length;
  return {
    titulo, n: fs.length, nEfTk: ne.porTicker, nEfVen: ne.ventanas, dias: new Set(fs.map((f) => f.dY)).size,
    r: media(fs.map((f) => f.r)), exDia: mEx, exPata: media(fs.map((f) => f.exPata)), medio: media(fs.map((f) => f.medio)),
    acierto: fs.filter((f) => f.r > 0).length / fs.length,
    tDia: tPorDia(fs, "exDia"), tCrudo: tUna(fs.map((f) => f.exDia)),
    prima: media(fs.map((f) => f.prima)), diasReales: media(fs.map((f) => f.diasReales)),
    mayor: may[0], mayorPct: may[1] / fs.length,
    azarMed: media(az), azarP05: az[Math.floor(az.length * 0.05)], azarP95: az[Math.floor(az.length * 0.95)], pctAzar: pct,
    alcistas: fs.filter((f) => f.dir === 1).length / fs.length,
    fs,
  };
}

console.log(`\n${"█".repeat(104)}`);
console.log(`URGENCIA · 1 — LA ESCALERA:  prima >= $${fmt(UMBRAL / 1000)}k · clase ${CLASE} · esquina 5% fuera / ~90d · compra al ASK, venta al BID`);
console.log(`${"█".repeat(104)}`);

const base = evs.filter((e) => e.prem >= UMBRAL && (CLASE === "TODO" || e.cls === CLASE));
console.log(`\n  prints que cumplen: ${fmt(base.length)}   (de ${fmt(evs.length)} en ticker con cadena y en horario)`);
radiografia(base.map((e) => ({ prem: e.prem, pos: e.pos ?? 0.5, esc: e.esc, dteP: e.dteP, size: e.size })),
  ["prem", "pos", "dteP", "size"], "prints con urgencia", {});

const salida = {};
const detalle = {};
for (const h of SALIDAS) {
  console.log(`\n${"═".repeat(104)}`);
  console.log(`SALIDA A ${h} DÍAS — seguir la dirección del print. "exceso" = contra el mercado de ESE día.`);
  console.log(`${"═".repeat(104)}`);
  console.log(`  ${"lado".padEnd(11)} ${"n".padStart(5)} ${"nEf".padStart(4)} ${"días".padStart(4)}  ${"crudo".padStart(8)} ${"EXCESO".padStart(8)} ${"t/día".padStart(6)}  ${"azar p5..p95".padStart(15)} ${"pctl".padStart(5)}  ${"acierto".padStart(7)} ${"alcis".padStart(6)} ${"mayor".padStart(11)}`);
  const filas = [];
  let i = 0;
  for (const L of ORDEN) {
    const b = bloque(L, base.filter((e) => e.side === L), h, 100 + (i++));
    if (!b) { console.log(`  ${L.padEnd(11)} — muestra insuficiente`); continue; }
    filas.push(b);
    console.log(`  ${L.padEnd(11)} ${String(b.n).padStart(5)} ${String(b.nEfTk).padStart(4)} ${String(b.dias).padStart(4)}  ${(100 * b.r).toFixed(2).padStart(7)}% ${(100 * b.exDia).toFixed(2).padStart(7)}% ${b.tDia.toFixed(2).padStart(6)}  ${(100 * b.azarP05).toFixed(1).padStart(6)}%..${(100 * b.azarP95).toFixed(1).padStart(5)}% ${(100 * b.pctAzar).toFixed(0).padStart(4)}%  ${(100 * b.acierto).toFixed(1).padStart(6)}% ${(100 * b.alcistas).toFixed(0).padStart(5)}% ${(b.mayor + " " + (100 * b.mayorPct).toFixed(0) + "%").padStart(11)}`);
  }
  salida[h] = filas.map(({ fs, ...r }) => r);
  if (h === 5) for (const b of filas) detalle[b.titulo] = b.fs.map((f) => ({ tk: f.ticker, dY: f.dY, dir: f.dir, prem: f.prem, pos: f.pos, r: f.r, exDia: f.exDia, prima: f.prima }));

  const esc = ["ASKSIDE", "AT_ASK", "ABOVE_ASK"].map((L) => filas.find((f) => f.titulo === L)).filter(Boolean);
  if (esc.length === 3) {
    const mono = (esc[0].exDia <= esc[1].exDia && esc[1].exDia <= esc[2].exDia) || (esc[0].exDia >= esc[1].exDia && esc[1].exDia >= esc[2].exDia);
    console.log(`\n  ESCALA COMPRA (ASKSIDE -> AT_ASK -> ABOVE_ASK): ${esc.map((e) => (100 * e.exDia).toFixed(2) + "%").join("  ->  ")}   ${mono ? "MONOTONA" : "NO monotona"}`);
  }
  const vnt = ["BIDSIDE", "AT_BID", "BELOW_BID"].map((L) => filas.find((f) => f.titulo === L)).filter(Boolean);
  if (vnt.length === 3) {
    const mono = (vnt[0].exDia <= vnt[1].exDia && vnt[1].exDia <= vnt[2].exDia) || (vnt[0].exDia >= vnt[1].exDia && vnt[1].exDia >= vnt[2].exDia);
    console.log(`  ESCALA VENTA  (BIDSIDE -> AT_BID -> BELOW_BID): ${vnt.map((e) => (100 * e.exDia).toFixed(2) + "%").join("  ->  ")}   ${mono ? "MONOTONA" : "NO monotona"}`);
  }
}

writeFileSync("scripts/cache-theta/marketsnack/urg2-escalera.json", JSON.stringify({ UMBRAL, CLASE, salida }, null, 1));
writeFileSync("scripts/cache-theta/marketsnack/urg2-detalle5.json", JSON.stringify(detalle));
console.log(`\n  → scripts/cache-theta/marketsnack/urg2-escalera.json\n`);
