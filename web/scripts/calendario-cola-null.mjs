// CALENDARIO CONTRA LA COLA · SEGUNDA PARTE — el control que hace falta antes de creerse nada.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/calendario-cola-null.mjs
//
// ═══ POR QUÉ EXISTE ESTE SEGUNDO SCRIPT ═════════════════════════════════════════════════════
// La peor racha (drawdown) es una estadística de CAMINO, no de media. Si quitas del camino
// CUALQUIER conjunto de días con media por debajo del resto, la curva sube más recta y la peor
// racha se encoge. SIEMPRE. O sea: "el filtro X quita el 33% de la caída" no significa nada por
// sí solo — hay que saber cuánto la habría quitado un filtro FALSO que tirase los mismos días.
//
// Dos nulos, y el segundo es el que importa:
//   1. AZAR PURO: quitar n días elegidos al azar. Responde "¿es mejor que tirar días a boleo?".
//   2. DESPLAZAMIENTO CIRCULAR: la MISMA plantilla de días (mismo número, misma agrupación,
//      mismo ritmo mensual) corrida k días en el calendario. Responde la pregunta de verdad:
//      "¿es el ÚLTIMO día del mes, o vale cualquier día del mes con tal de tirar uno al mes?".
//      Es una prueba de aleatorización exacta: 652 recolocaciones posibles, se recorren todas.
//
// Y al final el MECANISMO, que es lo único que distingue un hallazgo de una coincidencia:
// si el fin de mes mata por el reajuste de carteras, el daño tiene que estar en el cruce de
// cierre — el tramo de 15:30 a 16:00. Se mide.

import { readFileSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { cargar, resumen, media, eur, drawdown } from "./anatomia3-lib.mjs";

const PRUEBAS = 26, LISTON = listonT(PRUEBAS), LISTON_PROY = listonT(200);
const { filas } = cargar();
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const N = filas.length, ANOS = N / 251;
const BASE = resumen(filas, ANOS);

// ── las banderas, recalculadas igual que en calendario-cola.mjs ──
const src = readFileSync("scripts/regimen-fomc.mjs", "utf8");
const i0 = src.indexOf("const FOMC = new Set([");
const FOMC = new Set(src.slice(i0, src.indexOf("]);", i0)).match(/\d{4}-\d{2}-\d{2}/g) || []);
if (FOMC.size < 20) throw new Error("el parseo de las fechas del FOMC falló");
const mes = (f) => f.fecha.slice(0, 7);
for (let i = 0; i < N; i++) {
  const f = filas[i];
  let ultimos = 0;
  for (let k = i + 1; k < N && mes(filas[k]) === mes(f); k++) ultimos++;
  const mesCompleto = filas.some((g) => mes(g) > mes(f));
  f.cFomc  = FOMC.has(f.fecha) ? 1 : 0;
  f.cFinMes = f.finMes;
  f.cUlt2  = mesCompleto && ultimos <= 1 ? 1 : 0;
  f.cUlt5  = mesCompleto && ultimos <= 4 ? 1 : 0;
}
const CANDIDATOS = [
  ["último día hábil del mes",       (f) => f.cFinMes === 1],
  ["los 2 últimos días del mes",     (f) => f.cUlt2 === 1],
  ["los 5 últimos días del mes",     (f) => f.cUlt5 === 1],
  ["2 últimos del mes + FOMC",       (f) => f.cUlt2 === 1 || f.cFomc === 1],
  ["día de FOMC",                    (f) => f.cFomc === 1],
];

// guardián: ninguna candidata puede quedarse vacía
for (const [nom, fn] of CANDIDATOS) {
  const n = filas.filter(fn).length;
  if (n < 10) throw new Error(`la candidata "${nom}" sólo marca ${n} días — el cruce falló, no se mide`);
}

const pc = (x) => (x == null || !isFinite(x) ? "—" : (x * 100).toFixed(0) + "%");
const metricas = (etiquetas) => {
  const dentro = [], pl = [];
  for (let i = 0; i < N; i++) if (!etiquetas[i]) { dentro.push(filas[i]); pl.push(filas[i].pl); }
  const total = pl.reduce((a, b) => a + b, 0);
  const dd = drawdown(pl);
  const ord = [...pl].sort((a, b) => a - b);
  return {
    n: dentro.length, alAno: total / ANOS, dd, peor: ord[0],
    p1: ord[Math.floor(ord.length * 0.01)], p5: ord[Math.floor(ord.length * 0.05)],
    colas2k: pl.filter((x) => x < -2000).length,
    ddElim: Math.abs(BASE.dd) - Math.abs(dd),
    retenido: total / ANOS / BASE.alAno,
  };
};

console.log("═".repeat(126));
console.log(`  BASE · ${N} días · ${eur(BASE.alAno)}/año · peor día ${eur(BASE.peor)} · PEOR RACHA ${eur(BASE.dd)}`);
console.log("═".repeat(126));

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1 · NULO POR AZAR PURO
// ═════════════════════════════════════════════════════════════════════════════════════════════
const SORTEOS = 20000;
let semilla = 20260819;                       // reproducible: mismo resultado cada vez que se corra
const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };

console.log("\n\n## 1 · ¿MEJOR QUE TIRAR LOS MISMOS DÍAS AL AZAR?  (20.000 sorteos)\n");
console.log("| filtro | días fuera | caída eliminada REAL | mediana del azar | percentil | $/año REAL | mediana del azar | percentil |");
console.log("|---|---|---|---|---|---|---|---|");
const azarOut = [];
for (const [nom, fn] of CANDIDATOS) {
  const etiquetas = filas.map(fn), k = etiquetas.filter(Boolean).length;
  const real = metricas(etiquetas);
  const dds = [], anos = [];
  for (let s = 0; s < SORTEOS; s++) {
    const e = new Array(N).fill(false);
    let puestos = 0;
    while (puestos < k) { const j = Math.floor(rnd() * N); if (!e[j]) { e[j] = true; puestos++; } }
    const m = metricas(e);
    dds.push(m.ddElim); anos.push(m.alAno);
  }
  dds.sort((a, b) => a - b); anos.sort((a, b) => a - b);
  const perc = (arr, v) => arr.filter((x) => x < v).length / arr.length;
  azarOut.push({ nombre: nom, k, real, ddMedianaAzar: dds[SORTEOS >> 1], percDd: perc(dds, real.ddElim),
                 anoMedianaAzar: anos[SORTEOS >> 1], percAno: perc(anos, real.alAno) });
  console.log(`| ${nom} | ${k} | ${eur(real.ddElim)} | ${eur(dds[SORTEOS >> 1])} | ${pc(perc(dds, real.ddElim))} | ${eur(real.alAno)} | ${eur(anos[SORTEOS >> 1])} | ${pc(perc(anos, real.alAno))} |`);
}
console.log("\n  Ojo con leer esto mal: el azar YA quita caída (mediana positiva) simplemente por quitar días.");
console.log("  Lo que separa a un filtro de verdad es quitar caída SIN pagar ingreso — la columna de la derecha.");

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2 · NULO POR DESPLAZAMIENTO CIRCULAR — el que responde la pregunta de verdad
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n## 2 · ¿ES ESE DÍA DEL MES, O VALE CUALQUIERA?  (la misma plantilla corrida k días; 652 recolocaciones)\n");
console.log("| filtro | caída eliminada REAL | mejor de las 652 | mediana | percentil de la real | $/año REAL | percentil |");
console.log("|---|---|---|---|---|---|---|");
const shiftOut = [];
for (const [nom, fn] of CANDIDATOS) {
  const base = filas.map(fn);
  const dds = [], anos = [];
  for (let k = 1; k < N; k++) {
    const e = new Array(N);
    for (let i = 0; i < N; i++) e[i] = base[(i + k) % N];
    const m = metricas(e);
    dds.push(m.ddElim); anos.push(m.alAno);
  }
  const real = metricas(base);
  const sD = [...dds].sort((a, b) => a - b), sA = [...anos].sort((a, b) => a - b);
  const perc = (arr, v) => arr.filter((x) => x < v).length / arr.length;
  shiftOut.push({ nombre: nom, real, percDd: perc(sD, real.ddElim), percAno: perc(sA, real.alAno),
                  mejorDd: sD[sD.length - 1], medianaDd: sD[sD.length >> 1] });
  console.log(`| ${nom} | ${eur(real.ddElim)} | ${eur(sD[sD.length - 1])} | ${eur(sD[sD.length >> 1])} | ${pc(perc(sD, real.ddElim))} | ${eur(real.alAno)} | ${pc(perc(sA, real.alAno))} |`);
}
console.log(`\n  El percentil es el p-valor de la aleatorización: 97% = sólo el 3% de las recolocaciones lo iguala.`);
console.log(`  Con ${PRUEBAS} pruebas declaradas el listón de Bonferroni es p ≤ ${(0.05 / PRUEBAS).toFixed(4)} → percentil ≥ ${(100 - 100 * 0.05 / PRUEBAS).toFixed(2)}%.`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3 · EL MECANISMO — ¿está el daño en el cruce de cierre (15:30→16:00)?
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n## 3 · EL MECANISMO: ¿dónde se hace el daño?\n");
console.log("| grupo | días | |mov 11:00→cierre| | |mov 15:30→cierre| | % del movimiento hecho tras las 15:30 | días con |15:30→cierre| > 20 pts |");
console.log("|---|---|---|---|---|---|");
const mec = [];
for (const [nom, fn] of [["último día del mes", (f) => f.cFinMes === 1], ["los 2 últimos del mes", (f) => f.cUlt2 === 1],
                          ["día de FOMC", (f) => f.cFomc === 1], ["el resto de días", (f) => f.cUlt2 === 0 && f.cFomc === 0]]) {
  const g = filas.filter(fn).filter((f) => f.zCierreAbs != null);
  const tarde = media(g.map((f) => f.zTardeAbs)), cierre = media(g.map((f) => f.zCierreAbs));
  const gordos = g.filter((f) => f.zCierreAbs > 20).length;
  mec.push({ nombre: nom, n: g.length, tarde, cierre, frac: cierre / tarde, gordos, tasaGordos: gordos / g.length });
  console.log(`| ${nom} | ${g.length} | ${tarde.toFixed(1)} pts | ${cierre.toFixed(1)} pts | ${((cierre / tarde) * 100).toFixed(0)}% | ${gordos} (${pc(gordos / g.length)}) |`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4 · LOS 15 PEORES DÍAS — ¿los caza alguna señal de calendario?
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n## 4 · LOS 15 PEORES DÍAS DEL PERÍODO Y QUÉ ETIQUETA DE CALENDARIO LLEVAN\n");
console.log("| fecha | P&L | mov 11:00→cierre | mov 15:30→cierre | etiquetas |");
console.log("|---|---|---|---|---|");
const peores = [...filas].sort((a, b) => a.pl - b.pl).slice(0, 15);
let cazados = 0;
for (const f of peores) {
  const et = [];
  if (f.cFinMes) et.push("ÚLTIMO DEL MES");
  else if (f.cUlt2) et.push("penúltimo del mes");
  if (f.cFomc) et.push("FOMC");
  if (f.opex) et.push("3er viernes");
  if (f.empleo) et.push("1er viernes (empleo)");
  if (f.primeroMes) et.push("1º del mes");
  if (f.cUlt2 || f.cFomc) cazados++;
  console.log(`| ${f.fecha} | ${eur(f.pl)} | ${(f.zTardePts >= 0 ? "+" : "−") + Math.abs(f.zTardePts).toFixed(0)} pts | ${(f.zCierrePts >= 0 ? "+" : "−") + Math.abs(f.zCierrePts).toFixed(0)} pts | ${et.join(" · ") || "—"} |`);
}
console.log(`\n  el filtro «2 últimos del mes + FOMC» (12% de los días) caza ${cazados} de los 15 peores.`);
console.log(`  esperados por azar si el filtro no supiera nada: ${(15 * filas.filter((f) => f.cUlt2 || f.cFomc).length / N).toFixed(1)}`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5 · LA FOTO FINAL DE LA CANDIDATA
// ═════════════════════════════════════════════════════════════════════════════════════════════
const fn = (f) => f.cUlt2 === 1 || f.cFomc === 1;
const F = metricas(filas.map(fn));
const fuera = filas.filter(fn);
console.log("\n\n" + "═".repeat(126));
console.log("  LA CANDIDATA: no operar los 2 últimos días hábiles del mes ni el día del FOMC");
console.log("═".repeat(126));
console.log(`  días que se dejan de operar: ${fuera.length} de ${N} (${pc(fuera.length / N)})`);
console.log(`  ingreso   ${eur(BASE.alAno)}/año → ${eur(F.alAno)}/año  (${pc(F.retenido)} del original, o sea +${eur(F.alAno - BASE.alAno)})`);
console.log(`  peor día  ${eur(BASE.peor)} → ${eur(F.peor)}   ← NO MEJORA, y hay que decirlo`);
console.log(`  p1        ${eur(BASE.p1)} → ${eur(F.p1)}`);
console.log(`  p5        ${eur(BASE.p5)} → ${eur(F.p5)}`);
console.log(`  PEOR RACHA ${eur(BASE.dd)} → ${eur(F.dd)}  (se quita ${eur(F.ddElim)}, el ${pc(F.ddElim / Math.abs(BASE.dd))})`);
console.log(`  días con pérdida > $2.000: ${filas.filter((f) => f.pl < -2000).length} → ${F.colas2k}`);
console.log(`\n  MÉTRICA QUE DECIDE · $/año retenidos por cada $ de caída eliminado: ${(F.alAno / F.ddElim).toFixed(2)}`);
console.log(`  MÉTRICA GEMELA    · $/año PERDIDOS por cada $ de caída eliminado:  ${((BASE.alAno - F.alAno) / F.ddElim).toFixed(2)}  (negativo = la caída sale gratis)`);

// tercios de la candidata, con los números y no sólo el signo
console.log("\n  los TRES tercios del período, uno a uno:");
console.log("  | tercio | días marcados | P&L medio marcados | P&L medio resto | tasa cola marcados | tasa cola resto |");
console.log("  |---|---|---|---|---|---|");
const k3 = Math.floor(N / 3);
const tercios = [];
for (let i = 0; i < 3; i++) {
  const g = i < 2 ? filas.slice(i * k3, (i + 1) * k3) : filas.slice(2 * k3);
  const si = g.filter(fn), no = g.filter((f) => !fn(f));
  const tS = si.filter((f) => f.pl < -2000).length / si.length, tN = no.filter((f) => f.pl < -2000).length / no.length;
  tercios.push({ periodo: `${g[0].fecha}→${g[g.length - 1].fecha}`, nSi: si.length,
                 mediaSi: media(si.map((f) => f.pl)), mediaNo: media(no.map((f) => f.pl)), tasaSi: tS, tasaNo: tN });
  console.log(`  | ${g[0].fecha}→${g[g.length - 1].fecha} | ${si.length} | ${eur(media(si.map((f) => f.pl)))} | ${eur(media(no.map((f) => f.pl)))} | ${pc(tS)} | ${pc(tN)} |`);
}
const signos = tercios.map((t) => (t.mediaSi - t.mediaNo < 0 ? "−" : "+")).join("");
const signosCola = tercios.map((t) => (t.tasaSi - t.tasaNo > 0 ? "+" : t.tasaSi - t.tasaNo < 0 ? "−" : "0")).join("");
console.log(`\n  signo de la diferencia de MEDIA en los tres tercios: ${signos}   (queremos − − −: los días marcados pierden)`);
console.log(`  signo de la diferencia de COLA  en los tres tercios: ${signosCola}   (queremos + + +: los días marcados tienen más cola)`);

// z de la cola de la candidata
const si = filas.filter(fn), no = filas.filter((f) => !fn(f));
for (const u of [-2000, -4000]) {
  const kS = si.filter((f) => f.pl < u).length, p0 = no.filter((f) => f.pl < u).length / no.length;
  const z = (kS / si.length - p0) / Math.sqrt((p0 * (1 - p0)) / si.length);
  console.log(`  cola <${eur(u)}: ${kS}/${si.length} = ${pc(kS / si.length)} contra ${pc(p0)} → z = ${z.toFixed(2)} (listón ${LISTON}, listón del proyecto ${LISTON_PROY})`);
}

writeFileSync("scripts/calendario-cola-null.json",
  JSON.stringify({ BASE, azar: azarOut, desplazamiento: shiftOut, mecanismo: mec, candidata: F, tercios,
                   peores: peores.map((f) => ({ fecha: f.fecha, pl: f.pl, zTardePts: f.zTardePts, zCierrePts: f.zCierrePts, cUlt2: f.cUlt2, cFomc: f.cFomc })) }, null, 2), "utf8");
console.log("\n  detalle en scripts/calendario-cola-null.json");
