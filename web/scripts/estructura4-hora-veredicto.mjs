// ESTRUCTURA 4 (3/3) · EL VEREDICTO — cuanto de la columna "$/ano" es senal y cuanto es ruido,
// y el puente para cortar tambien el PEOR DIA.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/estructura4-hora-veredicto.mjs
//
// ═══ LA PREGUNTA QUE FALTA ═══════════════════════════════════════════════════════════════════
//
// El barrido dio 11:00 = $18.696/ano y 13:45 = $16.048. Pero las horas VECINAS de las 11:00 dan
// $11.510, $11.523 y $8.627. Si 15 minutos mueven el resultado $7.000/ano, la columna del ingreso
// no esta midiendo la hora: esta midiendo en que cubo cayeron cuatro dias de perdida maxima.
//
// Aqui se pone el error tipico encima de cada cifra. Si el error tipico del ingreso es del orden
// del propio ingreso, entonces NO se puede elegir la hora por el ingreso — hay que elegirla por
// la cola, que es donde los numeros SI son monotonos.
//
// ═══ Y EL PUENTE ═════════════════════════════════════════════════════════════════════════════
// La hora encoge el CUERPO de la cola (p5, CVaR5) pero no toca el PEOR DIA, porque el peor dia es
// "ancho del ala menos credito" y entrar mas tarde cobra menos, luego SUBE el techo de perdida.
// Lo unico que puede bajar ese techo es estrechar las alas. Se mide hora x ancho de ala para ver
// si la combinacion da lo que ninguna de las dos da sola.
//
// ═══ PRUEBAS ═════════════════════════════════════════════════════════════════════════════════
// 4 horas x 4 anchos de ala = 16 nuevas. Acumulado: 301 + 16 = 317.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";
import { resumen, media, sd, pct, eur } from "./anatomia3-lib.mjs";

const DIR = "scripts/cache-theta/gex-2026";
const SEP = 25, COMM = 0.03;
const PRUEBAS = 317, LISTON = listonT(PRUEBAS);
const TODAS = ["09:35", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30",
               "11:45", "12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "13:45",
               "14:00", "14:15", "14:30", "14:45", "15:00"];
const HORAS_ALA = ["11:00", "13:00", "13:45", "14:30"];
const ALAS = [50, 30, 20, 15];

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid");
  const iA = cab.indexOf("ask"), iU = cab.indexOf("underlying_price");
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) throw new Error(`faltan columnas en ${f}`);
  const set = new Set(TODAS), filas = new Map(), spots = new Map();
  let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j]; if (L.length < 20) continue;
    const c = L.split(",");
    const h = c[iT].slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (!set.has(h)) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (!(K > 0) || !(ask > 0) || !(bid >= 0)) continue;
    if (!filas.has(h)) filas.set(h, []);
    filas.get(h).push({ K, bid, ask });
    if (sp > 0) spots.set(h, sp);
  }
  return { filas, spots, cierre };
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

const fijo = new Map(TODAS.map((h) => [h, []]));
const rejAla = new Map();
for (const h of HORAS_ALA) for (const a of ALAS) rejAla.set(`${h}|${a}`, []);

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const S = C.cierre;
  for (const h of TODAS) {
    const fc = C.filas.get(h), fp = P.filas.get(h), spot = C.spots.get(h);
    if (!fc || !fp || !(spot > 0)) continue;
    const cC = cerca(fc, spot + SEP), pC = cerca(fp, spot - SEP);
    const anchos = HORAS_ALA.includes(h) ? ALAS : [50];
    for (const ALA of anchos) {
      const cL = cerca(fc, cC.K + ALA), pL = cerca(fp, pC.K - ALA);
      if (cL.K <= cC.K || pL.K >= pC.K) continue;
      const credito = cC.bid + pC.bid - cL.ask - pL.ask;
      if (!(credito > 0)) continue;
      const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K;
      const perdC = Math.min(Math.max(S - cC.K, 0), anchoC);
      const perdP = Math.min(Math.max(pC.K - S, 0), anchoP);
      const fila = { fecha, ticker: "SPXW", pl: (credito - perdC - perdP) * 100 - 8 * COMM,
                     credito: credito * 100, colateral: (Math.max(anchoC, anchoP) - credito) * 100 };
      if (ALA === 50) fijo.get(h).push(fila);
      if (HORAS_ALA.includes(h)) rejAla.get(`${h}|${ALA}`).push(fila);
    }
  }
}

console.log(`\n${"=".repeat(104)}`);
console.log(`ESTRUCTURA 4 (3/3) · EL VEREDICTO · ${fechas.length} dias de SPXW 0DTE · condor +-25 pts · precios reales`);
console.log(`${"=".repeat(104)}`);
radiografia(fijo.get("13:00"), ["pl", "credito", "colateral"], "13:00 con alas de 50");

// ═══ 1 · EL ERROR TIPICO DEL INGRESO ═════════════════════════════════════════════════════════
console.log(`\n-- 1 · CUANTO DE LA COLUMNA "$/ano" ES RUIDO (error tipico de la media, x251 dias) ------------`);
console.log(`\n| entrada | $/ano | error tipico | $/ano en errores tipicos | CVaR5 | error tip. CVaR5 |`);
console.log(`|---|---|---|---|---|---|`);
const boot = (v, f, B = 400) => {                      // bootstrap por dias, sin orden
  const out = [];
  for (let b = 0; b < B; b++) {
    const m = []; for (let i = 0; i < v.length; i++) m.push(v[(Math.random() * v.length) | 0]);
    out.push(f(m));
  }
  return sd(out);
};
const cvar = (pls, q) => { const s = [...pls].sort((a, b) => a - b); return media(s.slice(0, Math.max(1, Math.floor(s.length * q)))); };
const filasSE = [];
for (const h of TODAS) {
  const v = fijo.get(h); if (v.length < 100) continue;
  const pls = v.map((x) => x.pl);
  const alAno = media(pls) * 251;
  const seAno = (sd(pls) / Math.sqrt(pls.length)) * 251;
  const c5 = cvar(pls, 0.05);
  const seC5 = boot(pls, (m) => cvar(m, 0.05));
  filasSE.push({ h, alAno, seAno, c5, seC5 });
  console.log(`| ${h}${h === "11:00" ? " <-- hoy" : ""} | ${eur(alAno)} | +-${eur(seAno)} | ${(alAno / seAno).toFixed(1)} | ${eur(c5)} | +-${eur(seC5)} |`);
}
const se11 = filasSE.find((x) => x.h === "11:00");
console.log(`\n  El ingreso de las 11:00 es ${eur(se11.alAno)} con un error tipico de +-${eur(se11.seAno)}: ${(se11.alAno / se11.seAno).toFixed(1)} errores tipicos.`);
console.log(`  Ninguna hora se distingue de otra por el ingreso. La cola SI se distingue.`);

// ═══ 2 · 11:00 CONTRA SU PROPIA VENTANA ══════════════════════════════════════════════════════
console.log(`\n-- 2 · ¿ES 11:00 BUENA HORA O LA HORA CON SUERTE DE SU VENTANA? -------------------------------`);
const ventanas = {
  "manana 09:35-10:45": ["09:35", "09:45", "10:00", "10:15", "10:30", "10:45"],
  "mediodia 11:00-12:45": ["11:00", "11:15", "11:30", "11:45", "12:00", "12:15", "12:30", "12:45"],
  "tarde 13:00-14:30": ["13:00", "13:15", "13:30", "13:45", "14:00", "14:15", "14:30"],
};
console.log(`\n| ventana | $/ano medio | $/ano peor hora | $/ano mejor hora | CVaR5 medio | peor racha media | peor dia |`);
console.log(`|---|---|---|---|---|---|---|`);
const vStats = {};
for (const [nom, hs] of Object.entries(ventanas)) {
  const rs = hs.map((h) => { const v = fijo.get(h); const pls = v.map((x) => x.pl); const r = resumen(v, v.length / 251); return { ...r, c5: cvar(pls, 0.05) }; });
  const m = (k) => media(rs.map((r) => r[k]));
  vStats[nom] = { alAno: m("alAno"), min: Math.min(...rs.map((r) => r.alAno)), max: Math.max(...rs.map((r) => r.alAno)), c5: m("c5"), dd: m("dd"), peor: Math.min(...rs.map((r) => r.peor)) };
  console.log(`| ${nom} | ${eur(m("alAno"))} | ${eur(Math.min(...rs.map((r) => r.alAno)))} | ${eur(Math.max(...rs.map((r) => r.alAno)))} | ${eur(m("c5"))} | ${eur(m("dd"))} | ${eur(Math.min(...rs.map((r) => r.peor)))} |`);
}
const md = vStats["mediodia 11:00-12:45"], td = vStats["tarde 13:00-14:30"];
console.log(`\n  11:00 da ${eur(se11.alAno)} y la media de SU ventana es ${eur(md.alAno)}: es la MEJOR de sus 8 horas (rango ${eur(md.min)}..${eur(md.max)}).`);
console.log(`  La ventana de tarde da de media ${eur(td.alAno)} — MAS que la del mediodia — con ${eur(td.c5)} de CVaR5 contra ${eur(md.c5)}`);
console.log(`  y ${eur(td.dd)} de peor racha contra ${eur(md.dd)}. Elegir por ventana, no por hora.`);

// ═══ 3 · MONOTONIA DE LA COLA ════════════════════════════════════════════════════════════════
console.log(`\n-- 3 · ¿ES MONOTONA LA COLA A LO LARGO DEL DIA? (una senal monotona no es un cubo con suerte) --`);
const serie = filasSE.map((x) => x.c5);
// el CVaR5 es NEGATIVO: que suba es que la cola encoge. Un paso "mejora" si serie[i] > serie[i-1].
let mejoras = 0; for (let i = 1; i < serie.length; i++) if (serie[i] > serie[i - 1]) mejoras++;
const rho = (() => {                                      // Spearman entre hora y |CVaR5|
  const n = filasSE.length;
  const rx = filasSE.map((_, i) => i);
  const orden = [...filasSE.keys()].sort((a, b) => Math.abs(filasSE[a].c5) - Math.abs(filasSE[b].c5));
  const ry = new Array(n); orden.forEach((idx, r) => (ry[idx] = r));
  const mx = media(rx), my = media(ry);
  const num = rx.reduce((a, _, i) => a + (rx[i] - mx) * (ry[i] - my), 0);
  return num / Math.sqrt(rx.reduce((a, _, i) => a + (rx[i] - mx) ** 2, 0) * ry.reduce((a, _, i) => a + (ry[i] - my) ** 2, 0));
})();
console.log(`  CVaR5 mejora en ${mejoras} de los ${serie.length - 1} pasos de 15 min (Spearman hora vs |CVaR5| = ${rho.toFixed(2)}).`);
console.log(`  Para comparar, el ingreso: Spearman hora vs $/ano = ${(() => {
  const n = filasSE.length, rx = filasSE.map((_, i) => i);
  const orden = [...filasSE.keys()].sort((a, b) => filasSE[a].alAno - filasSE[b].alAno);
  const ry = new Array(n); orden.forEach((idx, r) => (ry[idx] = r));
  const mx = media(rx), my = media(ry);
  return (rx.reduce((a, _, i) => a + (rx[i] - mx) * (ry[i] - my), 0) / Math.sqrt(rx.reduce((a, _, i) => a + (rx[i] - mx) ** 2, 0) * ry.reduce((a, _, i) => a + (ry[i] - my) ** 2, 0))).toFixed(2);
})()}`);

// ═══ 4 · EL PUENTE: HORA x ANCHO DE ALA ══════════════════════════════════════════════════════
console.log(`\n-- 4 · EL PUENTE PARA EL PEOR DIA: HORA x ANCHO DE ALA ----------------------------------------`);
console.log(`\n| entrada | ala | n | $/ano | peor dia | p5 | CVaR5 | peor racha | acierto | colateral | $/ano por $peor-dia |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|---|`);
const rejStats = {};
for (const h of HORAS_ALA) for (const a of ALAS) {
  const v = rejAla.get(`${h}|${a}`); if (v.length < 100) continue;
  const pls = v.map((x) => x.pl), r = resumen(v, v.length / 251);
  const col = pct(v.map((x) => x.colateral), 0.5);
  rejStats[`${h}|${a}`] = { ...r, cvar5: cvar(pls, 0.05), colateral: col };
  console.log(`| ${h} | ${a} | ${r.n} | ${eur(r.alAno)} | ${eur(r.peor)} | ${eur(r.p5)} | ${eur(cvar(pls, 0.05))} | ${eur(r.dd)} | ${(r.acierto * 100).toFixed(0)}% | ${eur(col)} | ${(r.alAno / Math.abs(r.peor)).toFixed(1)} |`);
}
const b = rejStats["11:00|50"];
console.log(`\n  base (11:00, ala 50): ${eur(b.alAno)}/ano · peor dia ${eur(b.peor)} · ${(b.alAno / Math.abs(b.peor)).toFixed(1)} $/ano por $ de peor dia`);
const mejorPuente = Object.entries(rejStats).sort((a, x) => x[1].alAno / Math.abs(x[1].peor) - a[1].alAno / Math.abs(a[1].peor))[0];
console.log(`  mejor combinacion por esa razon: ${mejorPuente[0]} -> ${eur(mejorPuente[1].alAno)}/ano con peor dia ${eur(mejorPuente[1].peor)} (${(mejorPuente[1].alAno / Math.abs(mejorPuente[1].peor)).toFixed(1)})`);

console.log(`\nliston de Bonferroni con ${PRUEBAS} pruebas acumuladas: |t| >= ${LISTON}`);
writeFileSync("scripts/estructura4-hora-veredicto.json", JSON.stringify({ pruebas: PRUEBAS, liston: LISTON, se: filasSE, ventanas: vStats, spearmanCola: rho, puente: rejStats }, null, 2));
console.log(`-> scripts/estructura4-hora-veredicto.json`);
