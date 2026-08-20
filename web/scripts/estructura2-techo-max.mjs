// ESTRUCTURA 2 · EL TECHO MAXIMO — la cota superior absoluta de toda esta línea de trabajo.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/estructura2-techo-max.mjs
//
// El oráculo de estructura2-techo.mjs sólo estrechaba la put los días de TOPE COMPLETO. Era
// conservador. Aquí se calcula el techo SIN restricción: elegir cada día, con visión perfecta,
// el ancho de ala que más habría convenido. Es el número que NINGUNA señal puede superar.
//
// Sirve para dos cosas opuestas y las dos honradas:
//   · si el techo de reducción de CAIDA es pequeño, la línea se cierra aunque la señal exista;
//   · si es grande, dice cuánto vale la pena pagar por buscar la señal.
//
// ⚠️⚠️ TODO LO DE ESTE FICHERO MIRA AL FUTURO A PROPOSITO. NADA DE AQUI SE PUEDE OPERAR.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00", COMM = 0.03;

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) throw new Error(`faltan columnas en ${f}`);
  const enHora = []; let spotFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre: spotFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const suma = (a) => a.reduce((x, y) => x + y, 0);
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]; };
const eur = (x) => (x < 0 ? "-$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
function dd(pls) { let ac = 0, p = 0, w = 0; for (const x of pls) { ac += x; p = Math.max(p, ac); w = Math.min(w, ac - p); } return w; }
const res = (pls) => ({ alAno: suma(pls) / (pls.length / 252), peorDia: Math.min(...pls), p1: pct(pls, 0.01), p5: pct(pls, 0.05), dd: dd(pls) });

function condor(fC, fP, spot, S, aC, aP) {
  const cc = cerca(fC, spot + 25), cl = cerca(fC, cc.K + aC);
  const pc = cerca(fP, spot - 25), pl = cerca(fP, pc.K - aP);
  if (cl.K <= cc.K || pl.K >= pc.K) return null;
  const anchoC = cl.K - cc.K, anchoP = pc.K - pl.K;
  const credito = cc.bid + pc.bid - cl.ask - pl.ask;
  if (!(credito > 0)) return null;
  return { pl: (credito - Math.min(Math.max(S - cc.K, 0), anchoC) - Math.min(Math.max(pc.K - S, 0), anchoP)) * 100 - 8 * COMM,
    colateral: (Math.max(anchoC, anchoP) - credito) * 100 };
}

const ANCHOS = [15, 25, 50];   // estrecha / media / la de hoy
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const dat = [];
for (const f of fechas) {
  const C = leerDia(f, "C"), P = leerDia(f, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const spot = C.filas[0].spot; if (!(spot > 0)) continue;
  const o = {};
  let ok = true;
  for (const aC of ANCHOS) for (const aP of ANCHOS) {
    const c = condor(C.filas, P.filas, spot, C.cierre, aC, aP);
    if (!c) { ok = false; break; }
    o[`${aC}/${aP}`] = c;
  }
  if (ok) dat.push({ fecha: f, o, base: o["50/50"].pl });
}
console.log(`\n═══ TECHO MAXIMO · ${dat.length} días · ${dat[0].fecha} -> ${dat[dat.length - 1].fecha} ═══`);
radiografia(dat.map((d) => ({ base: d.base, e25: d.o["50/25"].pl, e15: d.o["50/15"].pl, ambas25: d.o["25/25"].pl })),
  ["base", "e25", "e15", "ambas25"], "los cuatro anchos");

const BASE = dat.map((d) => d.base), rB = res(BASE);
console.log(`\nBASE (50/50): ${eur(rB.alAno)}/año · peor día ${eur(rB.peorDia)} · caída ${eur(rB.dd)}\n`);

console.log(`═══ ORACULOS (⚠️ MIRAN AL FUTURO — son cotas, no estrategias) ═══\n`);
console.log("| oráculo | días que cambia | $/año | peor día | p1 | p5 | caída | caída eliminada |");
console.log("|---|---|---|---|---|---|---|---|");
const salida = {};
const oraculos = [
  ["put 50->25 cuando conviene", (d) => (d.o["50/25"].pl > d.base ? d.o["50/25"].pl : d.base), (d) => d.o["50/25"].pl > d.base],
  ["put 50->15 cuando conviene", (d) => (d.o["50/15"].pl > d.base ? d.o["50/15"].pl : d.base), (d) => d.o["50/15"].pl > d.base],
  ["las dos alas 50->25 cuando conviene", (d) => (d.o["25/25"].pl > d.base ? d.o["25/25"].pl : d.base), (d) => d.o["25/25"].pl > d.base],
  ["el MEJOR de los 9 anchos cada día", (d) => Math.max(...Object.values(d.o).map((x) => x.pl)), (d) => Math.max(...Object.values(d.o).map((x) => x.pl)) > d.base],
  ["NO OPERAR los días perdedores", (d) => Math.max(d.base, 0), (d) => d.base < 0],
];
for (const [nom, fn, cambia] of oraculos) {
  const pls = dat.map(fn), r = res(pls);
  const n = dat.filter(cambia).length;
  salida[nom] = { ...r, diasCambia: n };
  console.log(`| ${nom} | ${n} (${((n / dat.length) * 100).toFixed(0)}%) | ${eur(r.alAno)} | ${eur(r.peorDia)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.dd)} | ${eur(Math.abs(rB.dd) - Math.abs(r.dd))} |`);
}

console.log(`\n\n═══ LO QUE ESTO SIGNIFICA ═══\n`);
const oMejor = res(dat.map((d) => Math.max(...Object.values(d.o).map((x) => x.pl))));
console.log(`Con visión PERFECTA sobre el ancho de las dos alas (9 combinaciones, elegida la mejor cada día):`);
console.log(`  $/año  ${eur(rB.alAno)} -> ${eur(oMejor.alAno)}  (${((oMejor.alAno / rB.alAno - 1) * 100).toFixed(0)}% más)`);
console.log(`  caída  ${eur(rB.dd)} -> ${eur(oMejor.dd)}  (${((1 - Math.abs(oMejor.dd) / Math.abs(rB.dd)) * 100).toFixed(0)}% menos)`);
console.log(`  peor día ${eur(rB.peorDia)} -> ${eur(oMejor.peorDia)}  (${((1 - Math.abs(oMejor.peorDia) / Math.abs(rB.peorDia)) * 100).toFixed(0)}% menos)`);
console.log(`\n=> El ancho del ala, incluso jugado con visión perfecta, es sobre todo un mando de INGRESO.`);
console.log(`   La caída baja mucho menos que el ingreso sube. Quien busque REDUCIR LA CAIDA tiene el`);
console.log(`   techo de esta línea en ${((1 - Math.abs(oMejor.dd) / Math.abs(rB.dd)) * 100).toFixed(0)}%, y eso ya es con trampa.`);
const oNoOperar = res(dat.map((d) => Math.max(d.base, 0)));
console.log(`\nPara comparar: no operar los días perdedores (el oráculo de la ENTRADA, no el de la forma)`);
console.log(`   da ${eur(oNoOperar.alAno)}/año con caída ${eur(oNoOperar.dd)}. La palanca grande está en CUANDO entrar,`);
console.log(`   no en QUE FORMA usar. Esta medición dice dónde NO seguir cavando.`);

writeFileSync("scripts/estructura2-techo-max.json", JSON.stringify({ n: dat.length, periodo: [dat[0].fecha, dat[dat.length - 1].fecha], base: rB, oraculos: salida }, null, 2));
console.log(`\n(detalle en scripts/estructura2-techo-max.json)`);
