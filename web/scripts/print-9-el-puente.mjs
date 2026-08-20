// SEGUIR EL PRINT · 9 — EL PUENTE. Qué habría que cambiar para que esto valiera dinero.
//
// El veredicto: la señal le gana ~4 puntos a una moneda por operación, y el vehículo cuesta 4,13
// puntos. Neto −0,05%. **El problema no es la señal: es el peaje de entrar y salir.**
//
// Esto NO es una estrategia: es la CUENTA de cuánto valdría cada arreglo, para decidir cuál
// perseguir. Los precios al medio NO son un P&L —comprar al medio no está garantizado— y se
// marcan como lo que son: el techo de lo que se podría recuperar si las órdenes limitadas
// entraran. Lo que decide si ese techo se alcanza es un estudio de EJECUCIÓN, no de señal.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/print-9-el-puente.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import { cadena, cierres, diasDe, tickersConCadena, elegirEsquina, limpiarCache, dias, media, tUna, pctl, fmt } from "./print-lib.mjs";

const CUENTA = 56389;
const DIST = 0.05, DTE_OBJ = 90, TOL_DTE = 25, MIN_PREM = 2.5e6;
const SALIDAS = [3, 5, 10, 15, 23];
const ASK = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);

const conCad = tickersConCadena().filter((t) => cierres(t));
const diasPorTk = new Map(conCad.map((t) => [t, diasDe(t).filter((d) => d >= "20260422")]));
const setDias = new Map(conCad.map((t) => [t, new Set(diasPorTk.get(t))]));
const ULTIMO = [...diasPorTk.values()].flat().sort().pop();
const setCad = new Set(conCad);
const tDia = (f, c) => { const m = new Map(); for (const x of f) { if (!m.has(x.dY)) m.set(x.dY, []); m.get(x.dY).push(x[c]); } return tUna([...m.values()].map(media)); };

console.log(`\n${"█".repeat(100)}`);
console.log(`SEGUIR EL PRINT · 9 — EL PUENTE: cuánto vale cada arreglo`);
console.log(`${"█".repeat(100)}\n`);

// prints
const eventos = [];
for (const dia of diasFlujo("100k")) {
  const crudos = leerDia(dia, "100k");
  if (!crudos.length) continue;
  const inst = new Map(), tmp = [];
  for (const o of crudos) {
    const q = parseOCC(o.symbol);
    if (!q) continue;
    const k = `${q.raiz}|${o.timestamp}`;
    if (!inst.has(k)) inst.set(k, new Set());
    inst.get(k).add(`${q.exp}|${q.tipo}|${q.K}`);
    tmp.push([o, q, k]);
  }
  const dY = dia.replace(/-/g, "");
  for (const [o, q, k] of tmp) {
    if (!setCad.has(q.raiz) || !setDias.get(q.raiz)?.has(dY)) continue;
    const et = Number(o.timestamp.slice(11, 13)) - 4 + Number(o.timestamp.slice(14, 16)) / 60;
    if (!(et >= 9.5 && et < 15) || !ASK.has(o.side) || o.premium < MIN_PREM) continue;
    eventos.push({ dY, tk: q.raiz, prem: o.premium, dir: q.tipo === "C" ? 1 : -1, patas: inst.get(k).size });
  }
}
const mejorPrint = new Map();
for (const e of eventos) { const k = `${e.tk}|${e.dY}`; const a = mejorPrint.get(k); if (!a || e.prem > a.prem) mejorPrint.set(k, e); }

// rejilla con las TRES convenciones de precio, para cada salida
const rej = new Map();
for (const tk of conCad) {
  limpiarCache();
  const md = diasPorTk.get(tk), cl = cierres(tk);
  for (const dY of md) {
    if (dY > ULTIMO) continue;
    const S = cl[dY];
    if (!(S > 0)) continue;
    const cad = cadena(tk, dY);
    if (!cad) continue;
    const c = elegirEsquina(cad, S, DTE_OBJ, DIST, "C", dY, TOL_DTE);
    const p = elegirEsquina(cad, S, DTE_OBJ, DIST, "P", dY, TOL_DTE);
    if (!c || !p || c.exp !== p.exp) continue;
    const o = {};
    for (const k of SALIDAS) {
      const sal = md.find((d) => d > dY && dias(dY, d) >= k);
      if (!sal || sal > c.exp) continue;
      const cs = cadena(tk, sal);
      if (!cs) continue;
      const qC = cs[c.exp]?.[`${c.K}|C`], qP = cs[p.exp]?.[`${p.K}|P`];
      const bC = qC ? qC[0] : 0, aC = qC ? qC[1] : 0, bP = qP ? qP[0] : 0, aP = qP ? qP[1] : 0;
      o[k] = {
        // REAL: compra al ask, venta al bid
        realC: bC / c.ask - 1, realP: bP / p.ask - 1,
        // TECHO: compra y venta al punto medio (NO garantizado — es el techo, no un P&L)
        midC: (qC ? (aC + bC) / 2 : 0) / ((c.ask + c.bid) / 2) - 1,
        midP: (qP ? (aP + bP) / 2 : 0) / ((p.ask + p.bid) / 2) - 1,
        // MITAD DE CAMINO: entrar al medio (limitada) y salir al bid (por si hay que salir ya)
        medioC: bC / ((c.ask + c.bid) / 2) - 1, medioP: bP / ((p.ask + p.bid) / 2) - 1,
        askC: c.ask * 100, askP: p.ask * 100, midPrimaC: (c.ask + c.bid) / 2 * 100, midPrimaP: (p.ask + p.bid) / 2 * 100,
        diasPos: dias(dY, sal),
      };
    }
    if (Object.keys(o).length) rej.set(`${tk}|${dY}`, o);
  }
}

console.log(`${"═".repeat(100)}`);
console.log(`DESVANECER EL PRINT — el mismo trato, pagando de tres maneras distintas`);
console.log(`${"═".repeat(100)}\n`);
console.log(`  ${"salida".padEnd(7)} ${"n".padStart(5)}  ${"REAL ask→bid".padStart(13)}  ${"medio→bid".padStart(11)}  ${"TECHO medio→medio".padStart(18)}  ${"moneda(real)".padStart(13)} ${"prima".padStart(7)} ${"$/año 1ctr".padStart(10)}`);
const salida = [];
for (const k of SALIDAS) {
  const f = [], mon = [];
  for (const e of mejorPrint.values()) {
    const r = rej.get(`${e.tk}|${e.dY}`)?.[k];
    if (!r) continue;
    const real = e.dir === 1 ? r.realP : r.realC;       // desvanecer = la pata contraria
    const mid = e.dir === 1 ? r.midP : r.midC;
    const medio = e.dir === 1 ? r.medioP : r.medioC;
    f.push({ dY: e.dY, tk: e.tk, real, mid, medio, prima: e.dir === 1 ? r.askP : r.askC, midPrima: e.dir === 1 ? r.midPrimaP : r.midPrimaC, diasPos: r.diasPos });
    mon.push((r.realC + r.realP) / 2);
  }
  if (f.length < 100) continue;
  const prima = media(f.map((x) => x.prima)), diasPos = media(f.map((x) => x.diasPos)), ciclos = 365 / diasPos;
  const mR = media(f.map((x) => x.real)), mM = media(f.map((x) => x.mid)), mE = media(f.map((x) => x.medio));
  console.log(`  ${(k + "d").padEnd(7)} ${String(f.length).padStart(5)}  ${(100 * mR).toFixed(2).padStart(12)}%  ${(100 * mE).toFixed(2).padStart(10)}%  ${(100 * mM).toFixed(2).padStart(17)}%  ${(100 * media(mon)).toFixed(2).padStart(12)}% $${fmt(prima).padStart(6)} ${("$" + fmt(prima * mR * ciclos)).padStart(10)}`);
  salida.push({ k, n: f.length, real: mR, medioBid: mE, techoMid: mM, moneda: media(mon), prima, ciclos, anualReal: prima * mR * ciclos, anualMedio: prima * mE * ciclos, anualTecho: media(f.map((x) => x.midPrima)) * mM * ciclos, tReal: tDia(f, "real"), tMedio: tDia(f, "medio") });
}

console.log(`\n${"═".repeat(100)}`);
console.log(`LO QUE VALE CADA ARREGLO, EN DÓLARES AL AÑO sobre $${fmt(CUENTA)}`);
console.log(`${"═".repeat(100)}\n`);
for (const s of salida) {
  const nR = Math.max(1, Math.floor((CUENTA * 0.1) / s.prima));
  console.log(`  salida ${String(s.k).padStart(2)}d · ${nR} contrato(s) con el 10% de la cuenta ($${fmt(nR * s.prima)} comprometidos):`);
  console.log(`      pagando el ask y vendiendo al bid   : ${(100 * s.real).toFixed(2).padStart(6)}%/op → ${("$" + fmt(s.anualReal * nR)).padStart(9)}/año   (t por día ${s.tReal.toFixed(2)})`);
  console.log(`      entrando al MEDIO, saliendo al bid  : ${(100 * s.medioBid).toFixed(2).padStart(6)}%/op → ${("$" + fmt(s.anualMedio * nR)).padStart(9)}/año   (t por día ${s.tMedio.toFixed(2)})`);
  console.log(`      TECHO, medio a medio (no garantizado): ${(100 * s.techoMid).toFixed(2).padStart(6)}%/op → ${("$" + fmt(s.anualTecho * nR)).padStart(9)}/año`);
  console.log("");
}
console.log(`  SPY sobre el 10% de la cuenta: $${fmt(CUENTA * 0.1 * 0.14)}/año.`);
console.log(`\n  LEER ASÍ: la diferencia entre la primera línea y la tercera NO es señal, es EJECUCIÓN.`);
console.log(`  Si media horquilla se puede capturar con órdenes limitadas, la regla pasa de perder a ganar.`);
console.log(`  Eso no lo decide más análisis del flujo: lo decide medir cuántas limitadas al medio ENTRAN.`);

writeFileSync("scripts/print-9-el-puente.json", JSON.stringify({ salida }, null, 1));
console.log(`\n  → scripts/print-9-el-puente.json\n`);
