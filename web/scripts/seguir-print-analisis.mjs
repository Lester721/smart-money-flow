// SEGUIR EL PRINT — el barrido: umbral de prima x plazo de salida, contra tres controles,
// mas el control decisivo (los mismos prints AL BID) y el racimo (varios prints al mismo contrato).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/seguir-print-analisis.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { media, sd, tUna, fmt, nEfectiva } from "./print-lib.mjs";
import { pasarBarrera, informe, listonT } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389, CAP = 0.10;
const PRIMAS = [250e3, 500e3, 1e6, 2.5e6, 5e6, 10e6];
const SALIDAS = [1, 3, 5, 10];
const LISTON = listonT(PRIMAS.length * SALIDAS.length);
const todo = JSON.parse(readFileSync("scripts/seguir-print-filas.json", "utf8"));
const ARM = { ask: todo.filter((f) => f.lado === 1), bid: todo.filter((f) => f.lado === -1) };

/** t sobre las MEDIAS DIARIAS: los eventos del mismo dia no son independientes. */
function tPorDia(fs, f) {
  const m = new Map();
  for (const x of fs) { const v = f(x); if (!Number.isFinite(v)) continue; if (!m.has(x.fechaY)) m.set(x.fechaY, []); m.get(x.fechaY).push(v); }
  const d = [...m.values()].map(media);
  return { t: tUna(d), nDias: d.length, m: media(d) };
}
/** Media EQUIPONDERADA POR TICKER: SPX/SPXW/MU son un tercio de la cinta. */
function porTicker(fs, f) {
  const m = new Map();
  for (const x of fs) { const v = f(x); if (!Number.isFinite(v)) continue; if (!m.has(x.ticker)) m.set(x.ticker, []); m.get(x.ticker).push(v); }
  const ms = [...m.values()].filter((v) => v.length >= 5).map(media);
  return { m: media(ms), nTk: ms.length, t: tUna(ms) };
}
const conc = (fs) => {
  const c = new Map();
  for (const f of fs) c.set(f.ticker, (c.get(f.ticker) ?? 0) + 1);
  let may = { t: "-", pct: 0 };
  for (const [t, n] of c) if (n / fs.length > may.pct) may = { t, pct: n / fs.length };
  return may;
};
const pc = (x) => (Number.isFinite(x) ? (x >= 0 ? "+" : "-") + (Math.abs(x) * 100).toFixed(2) + "%" : "  n/a");

console.log("\n" + "=".repeat(126));
console.log("SEGUIR EL PRINT · BARRIDO — comprar EL MISMO CONTRATO al ask real, vender al bid real");
console.log("=".repeat(126));
console.log(`  ${fmt(ARM.ask.length)} eventos al ASK · ${fmt(ARM.bid.length)} al BID (control) · liston |t| >= ${LISTON}\n`);

const tabla = [];
function bloque(arm, nombre) {
  const fuente = ARM[arm];
  for (const k of SALIDAS) {
    console.log(`\n## ${nombre} · SALIDA A ${k} DIA${k > 1 ? "S" : ""}`);
    console.log("  umbral      n  nEf(tk/vent)  ret/op  aciert |  azarTotal   dif     t/dia | azarTipo   dif   | horq5     dif     t/dia | x-tick  t   mayor");
    console.log("  " + "-".repeat(150));
    for (const P of PRIMAS) {
      const fs = fuente.filter((f) => f.prima >= P && Number.isFinite(f[`r${k}`]) && Number.isFinite(f[`a${k}`]) && Number.isFinite(f[`h${k}`]));
      if (fs.length < 50) { console.log(`  >=$${(P / 1e6).toFixed(2)}M  muestra ${fs.length} — insuficiente`); continue; }
      const R = fs.map((f) => f[`r${k}`]);
      const ret = media(R), acierto = R.filter((x) => x > 0).length / R.length;
      const dA = tPorDia(fs, (f) => f[`r${k}`] - f[`a${k}`]);
      const dB = tPorDia(fs, (f) => f[`r${k}`] - f[`b${k}`]);
      const dH = tPorDia(fs, (f) => f[`r${k}`] - f[`h${k}`]);
      const xt = porTicker(fs, (f) => f[`r${k}`] - f[`h${k}`]);
      const ne = nEfectiva(fs, k);
      const may = conc(fs);
      const fila = {
        arm, k, P, n: fs.length, nEfTk: ne.porTicker, nEfVent: ne.ventanas, ret, acierto,
        azarTotal: media(fs.map((f) => f[`a${k}`])), difA: dA.m, tA: dA.t,
        azarTipo: media(fs.map((f) => f[`b${k}`])), difB: dB.m, tB: dB.t,
        horq5: media(fs.map((f) => f[`h${k}`])), difH: dH.m, tH: dH.t,
        difHxTicker: xt.m, tXt: xt.t, nTk: xt.nTk, mayor: may, nDias: dA.nDias,
        primaMedia: media(fs.map((f) => f.ask)) * 100, dteMedio: media(fs.map((f) => f.dte)),
        horqPropia: media(fs.map((f) => f.horq)),
      };
      tabla.push(fila);
      console.log(`  >=$${(P / 1e6).toFixed(2)}M ${String(fs.length).padStart(6)} ${String(ne.porTicker).padStart(4)}/${String(ne.ventanas).padStart(3)}`
        + ` ${pc(ret).padStart(7)} ${(acierto * 100).toFixed(1).padStart(5)}% | ${pc(fila.azarTotal).padStart(9)} ${pc(dA.m).padStart(7)} ${dA.t.toFixed(2).padStart(6)}`
        + ` | ${pc(fila.azarTipo).padStart(8)} ${pc(dB.m).padStart(7)}`
        + ` | ${pc(fila.horq5).padStart(7)} ${pc(dH.m).padStart(7)} ${dH.t.toFixed(2).padStart(6)}`
        + ` | ${pc(xt.m).padStart(7)} ${xt.t.toFixed(1).padStart(5)} ${may.t} ${(may.pct * 100).toFixed(0)}%`);
    }
  }
}
bloque("ask", "LA REGLA (al ASK)");
bloque("bid", "CONTROL (los mismos prints gigantes pero AL BID)");

// ── MONOTONIA ───────────────────────────────────────────────────────────────────────────────
console.log("\n\n## MONOTONIA — a mas prima, mejor? (un pico es coincidencia; una escalera es mecanismo)");
console.log("  columnas: " + PRIMAS.map((p) => "$" + (p / 1e6).toFixed(2) + "M").join("   "));
const mono = (v) => {
  let sube = true, baja = true;
  for (let i = 1; i < v.length; i++) { if (v[i] < v[i - 1]) sube = false; if (v[i] > v[i - 1]) baja = false; }
  return sube ? "SUBE monotona" : baja ? "BAJA monotona" : "no monotona";
};
for (const arm of ["ask", "bid"]) {
  for (const k of SALIDAS) {
    const f = tabla.filter((x) => x.k === k && x.arm === arm);
    if (f.length < PRIMAS.length) continue;
    const linea = (c) => f.map((x) => ((x[c] >= 0 ? "+" : "") + (x[c] * 100).toFixed(2)).padStart(6)).join(" ");
    console.log(`  ${arm} k=${String(k).padStart(2)}  ret/op   : ${linea("ret")}   ${mono(f.map((x) => x.ret))}`);
    console.log(`           vs horq5 : ${linea("difH")}   ${mono(f.map((x) => x.difH))}`);
  }
}

// ── EL RACIMO: varios prints gigantes sobre EL MISMO contrato el mismo dia ──────────────────
console.log("\n\n## EL RACIMO — clusteredTrades: varios prints >=$250k sobre EL MISMO contrato, el mismo dia");
console.log("   (es la unica hipotesis de MarketSnack que el agregado por dia destruia)");
const racimo = [];
for (const k of SALIDAS) {
  const linea = [];
  for (const [lo, hi] of [[1, 1], [2, 2], [3, 4], [5, 9], [10, 1e9]]) {
    const fs = ARM.ask.filter((f) => f.nPrints >= lo && f.nPrints <= hi && Number.isFinite(f[`r${k}`]) && Number.isFinite(f[`h${k}`]));
    if (fs.length < 50) { linea.push(`${lo}-${hi === 1e9 ? "+" : hi}: n=${fs.length}`); continue; }
    const dH = tPorDia(fs, (f) => f[`r${k}`] - f[`h${k}`]);
    const r = media(fs.map((f) => f[`r${k}`]));
    racimo.push({ k, lo, hi, n: fs.length, ret: r, difH: dH.m, tH: dH.t, nEf: nEfectiva(fs, k).porTicker });
    linea.push(`${lo}${hi === 1e9 ? "+" : hi > lo ? "-" + hi : ""} n=${fs.length} ret ${pc(r)} vsHorq ${pc(dH.m)} t=${dH.t.toFixed(2)}`);
  }
  console.log(`   k=${String(k).padStart(2)}  ` + linea.join(" | "));
}

// ── CORTES ──────────────────────────────────────────────────────────────────────────────────
console.log("\n\n## CORTES sobre >=$1M, salida a 5 dias (ret/op y diferencia contra los vecinos de igual horquilla)");
const cortes = {};
const base1M = ARM.ask.filter((f) => f.prima >= 1e6 && Number.isFinite(f.r5) && Number.isFinite(f.h5));
function corte(nombre, fs) {
  if (fs.length < 40) { console.log(`   ${nombre.padEnd(30)} n=${fs.length} — insuficiente`); return; }
  const dH = tPorDia(fs, (f) => f.r5 - f.h5);
  const dA = tPorDia(fs, (f) => f.r5 - f.a5);
  const r = media(fs.map((f) => f.r5));
  const ne = nEfectiva(fs, 5);
  const may = conc(fs);
  cortes[nombre] = { n: fs.length, nEf: ne.porTicker, ret: r, difH: dH.m, tH: dH.t, difA: dA.m, tA: dA.t, mayor: may };
  console.log(`   ${nombre.padEnd(30)} n=${String(fs.length).padStart(5)} nEf=${String(ne.porTicker).padStart(4)}  ret ${pc(r).padStart(8)}`
    + `  vsAzar ${pc(dA.m).padStart(7)} t=${dA.t.toFixed(2).padStart(6)}  vsHorq ${pc(dH.m).padStart(7)} t=${dH.t.toFixed(2).padStart(6)}  ${may.t} ${(may.pct * 100).toFixed(0)}%`);
}
corte("TODO >=$1M", base1M);
corte("solo CALLS", base1M.filter((f) => f.tipo === "C"));
corte("solo PUTS", base1M.filter((f) => f.tipo === "P"));
corte("solo ACCIONES", base1M.filter((f) => !f.indice));
corte("solo INDICES", base1M.filter((f) => f.indice));
corte("antes de las 11:00 ET", base1M.filter((f) => f.horaN < 11));
corte("11:00-13:00 ET", base1M.filter((f) => f.horaN >= 11 && f.horaN < 13));
corte("13:00-15:00 ET", base1M.filter((f) => f.horaN >= 13));
corte("dte 2-30", base1M.filter((f) => f.dte <= 30));
corte("dte 31-90", base1M.filter((f) => f.dte > 30 && f.dte <= 90));
corte("dte 91-200", base1M.filter((f) => f.dte > 90 && f.dte <= 200));
corte("dte >200", base1M.filter((f) => f.dte > 200));
corte("dentro del dinero", base1M.filter((f) => f.dist < -0.01));
corte("al dinero (+-1%)", base1M.filter((f) => Math.abs(f.dist) <= 0.01));
corte("fuera 1-5%", base1M.filter((f) => f.dist > 0.01 && f.dist <= 0.05));
corte("fuera 5-15%", base1M.filter((f) => f.dist > 0.05 && f.dist <= 0.15));
corte("fuera >15%", base1M.filter((f) => f.dist > 0.15));
corte("ESQUINA BARATA 3-8%/60-120d", base1M.filter((f) => f.dist >= 0.03 && f.dist <= 0.08 && f.dte >= 60 && f.dte <= 120));
corte("esquina, todos los umbrales", ARM.ask.filter((f) => f.dist >= 0.03 && f.dist <= 0.08 && f.dte >= 60 && f.dte <= 120 && Number.isFinite(f.r5) && Number.isFinite(f.h5)));

// ── LA BARRERA ──────────────────────────────────────────────────────────────────────────────
console.log("\n\n## LA BARRERA — el escalon central: >=$1M, salida a 5 dias, contra los vecinos de igual horquilla");
const V = pasarBarrera(
  base1M.map((f) => ({ pnl: f.r5 - f.h5, ticker: f.ticker, fecha: f.fecha, prima: f.prima })),
  (f) => f.prima, { pruebas: 24, nMinimo: 200, maxPorTicker: 0.2 },
);
console.log(informe(V, "seguir el print >=$1M a 5 dias contra los vecinos de igual horquilla"));

// ── LA HORQUILLA: de donde sale TODO el exceso contra el azar ───────────────────────────────
console.log("\n## DE DONDE SALE EL EXCESO CONTRA EL AZAR — la HORQUILLA");
const hh = ARM.ask.filter((f) => Number.isFinite(f.horqAzar) && Number.isFinite(f.horqVec));
const hb = ARM.bid.filter((f) => Number.isFinite(f.horqAzar));
console.log(`   horquilla del contrato del print AL ASK : ${(media(hh.map((f) => f.horq)) * 100).toFixed(2)}%  (n=${fmt(hh.length)})`);
console.log(`   horquilla del contrato del print AL BID : ${(media(hb.map((f) => f.horq)) * 100).toFixed(2)}%  (n=${fmt(hb.length)})`);
console.log(`   horquilla del contrato SORTEADO         : ${(media(hh.map((f) => f.horqAzar)) * 100).toFixed(2)}%`);
console.log(`   horquilla de los 5 vecinos emparejados  : ${(media(hh.map((f) => f.horqVec)) * 100).toFixed(2)}%`);
console.log(`   candidatos por vencimiento (mediana)    : ${media(hh.map((f) => f.nCand)).toFixed(0)}`);

writeFileSync("scripts/seguir-print-analisis.json", JSON.stringify({ liston: LISTON, tabla, racimo, cortes, barrera: V }, null, 1));
console.log("\n   -> scripts/seguir-print-analisis.json\n");
