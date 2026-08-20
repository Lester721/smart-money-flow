// CALENDARIO CONTRA LA COLA — ¿anticipa el calendario los días que MATAN al cóndor 0DTE?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/calendario-cola.mjs
//
// ═══ EN QUÉ SE DIFERENCIA DE LAS 47 PRUEBAS ANTERIORES ══════════════════════════════════════
// Los 17 filtros de régimen y las 30 reglas de gestión se midieron contra la MEDIA: tercio alto
// contra tercio bajo del P&L medio. Todos fallaron. Ésta mide contra la COLA: no importa si la
// media se mueve, importa si el peor día y la peor racha se parten por la mitad conservando el
// ingreso. Un filtro que tire el 20% de los días, guarde el 85% del ingreso y quite la mitad de
// la caída ES UN ÉXITO aunque la media no se entere.
//
// ═══ POR QUÉ EL CALENDARIO Y NO OTRA COSA ═══════════════════════════════════════════════════
// Es el único predictor que NO PUEDE contaminarse. Las fechas del FOMC de 2026 estaban publicadas
// en 2025; el tercer viernes de cada mes lo sabe un calendario de pared. No hay dato de mercado
// en el camino, no hay cierre de hoy colándose, no hay preprocesado que mire al futuro.
//
// LA ÚNICA EXCEPCIÓN, Y VA DICHA: `finMes` y `vispera` se derivan mirando la fila SIGUIENTE del
// fichero para saber si cambió el mes. Eso es mirar el calendario de festivos, no el mercado —
// el último día hábil de octubre de 2026 se sabe hoy. No es futuro, pero se comprueba: abajo se
// verifica que las fechas marcadas son de verdad el último día hábil de su mes.
//
// ═══ QUÉ NO ESTÁ MEDIDO, Y HAY QUE DECIRLO ══════════════════════════════════════════════════
// · `empleo` es un PROXY (primer viernes), no la fecha real de publicación del informe. Cuando
//   el primer viernes es festivo el informe se adelanta al jueves, y en octubre de 2025 el cierre
//   del gobierno lo retrasó semanas. Esas fechas reales NO están en disco, así que el proxy se
//   mide como proxy y se etiqueta como tal. Además sale a las 08:30 — YA HA PASADO al entrar.
// · El IPC, el PIB y las actas del FOMC no están medidos: sus fechas no están en disco y no se
//   escriben de memoria.

import { readFileSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { tWelch, listonT } from "../lib/barreraHallazgos";
import { cargar, resumen, media, pct, eur } from "./anatomia3-lib.mjs";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 0 · CUÁNTAS PRUEBAS. Se declara ANTES de mirar nada.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const PRUEBAS = 26;                 // 22 señales de calendario + 4 combinaciones. Se cuentan abajo.
const PRUEBAS_PROYECTO = 200;       // el acumulado del proyecto sobre ESTOS MISMOS 653 días
const LISTON = listonT(PRUEBAS);
const LISTON_PROY = listonT(PRUEBAS_PROYECTO);

const { filas } = cargar();
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const ANOS = filas.length / 251;
const BASE = resumen(filas, ANOS);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1 · RADIOGRAFÍA de los campos continuos, antes de medir nada con ellos.
// ═════════════════════════════════════════════════════════════════════════════════════════════
radiografia(filas, ["pl", "credito", "sp11", "cierre", "sigma", "ap", "zTardePts"], "cóndor 0DTE 2024-2026");

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2 · LAS FECHAS DEL FOMC — leídas del fichero, no escritas de memoria.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const src = readFileSync("scripts/regimen-fomc.mjs", "utf8");
const ini = src.indexOf("const FOMC = new Set([");
if (ini < 0) throw new Error("no encuentro el bloque FOMC en scripts/regimen-fomc.mjs");
const bloque = src.slice(ini, src.indexOf("]);", ini));
const FOMC = new Set(bloque.match(/\d{4}-\d{2}-\d{2}/g) || []);
if (FOMC.size < 20) throw new Error(`sólo se leyeron ${FOMC.size} fechas de FOMC — el parseo falló, no se mide con esto`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3 · LAS SEÑALES. Todas binarias, todas de calendario.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const mes = (f) => f.fecha.slice(0, 7);
const trimestral = (f) => ["03", "06", "09", "12"].includes(f.fecha.slice(5, 7));

for (let i = 0; i < filas.length; i++) {
  const f = filas[i], sig = filas[i + 1], ant = filas[i - 1];
  const dsem = new Date(f.fecha + "T00:00:00Z").getUTCDay();

  f.cFomc      = FOMC.has(f.fecha) ? 1 : 0;
  f.cFomcVis   = sig && FOMC.has(sig.fecha) ? 1 : 0;
  f.cFomcPost  = ant && FOMC.has(ant.fecha) ? 1 : 0;

  f.cOpex      = f.opex;                                          // tercer viernes (de anatomia3-lib)
  f.cOpexTri   = f.opex === 1 && trimestral(f) ? 1 : 0;           // triple hora bruja
  f.cOpexMen   = f.opex === 1 && !trimestral(f) ? 1 : 0;          // tercer viernes NO trimestral
  f.cEmpleo    = f.empleo;                                        // PROXY: primer viernes

  f.cFinMes    = f.finMes;
  f.cFinTri    = f.finMes === 1 && trimestral(f) ? 1 : 0;
  f.cVispera   = f.vispera;
  f.cPrimero   = f.primeroMes;

  // víspera de festivo: mañana es día hábil en el fichero pero NO es el siguiente laborable natural
  let visFest = 0;
  if (sig) {
    const d = new Date(f.fecha + "T00:00:00Z");
    do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    visFest = d.toISOString().slice(0, 10) !== sig.fecha ? 1 : 0;
  }
  f.cVisFest = visFest;

  for (let d = 1; d <= 5; d++) f["cDow" + d] = dsem === d ? 1 : 0;
}
// últimos y primeros N días hábiles del mes
for (let i = 0; i < filas.length; i++) {
  const f = filas[i];
  let ultimos = 0;
  for (let k = i + 1; k < filas.length && mes(filas[k]) === mes(f); k++) ultimos++;
  let primeros = 0;
  for (let k = i - 1; k >= 0 && mes(filas[k]) === mes(f); k--) primeros++;
  // el mes final del fichero está TRUNCADO: no se etiqueta como "últimos", igual que anatomia3-lib
  const mesCompleto = filas.some((g) => mes(g) > mes(f));
  f.cUlt2  = mesCompleto && ultimos <= 1 ? 1 : 0;
  f.cUlt3  = mesCompleto && ultimos <= 2 ? 1 : 0;
  f.cUlt5  = mesCompleto && ultimos <= 4 ? 1 : 0;
  f.cPrim3 = primeros <= 2 ? 1 : 0;
  f.cPrim5 = primeros <= 4 ? 1 : 0;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4 · GUARDIÁN DE BANDERAS. radiografia() mata cualquier binaria (2 valores distintos, >50%
//     ceros) — y aquí eso es lo NORMAL, no un fallo. El peligro de verdad es el contrario: una
//     bandera que casi nunca se enciende porque el cruce de fechas falló. Eso NO da error: da un
//     "no hay efecto" perfectamente creíble. Así que se comprueba contra el calendario, una a una.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const enRango = (d) => d >= filas[0].fecha && d <= filas[filas.length - 1].fecha;
const meses = [...new Set(filas.map(mes))];
const nMeses = meses.length;
const esperado = {
  cFomc:    [...FOMC].filter(enRango).length,
  cFinMes:  nMeses - 1,             // el mes final del fichero está truncado
  cVispera: nMeses - 1,
  cPrimero: nMeses,
};
const BANDERAS = ["cFomc","cFomcVis","cFomcPost","cOpex","cOpexTri","cOpexMen","cEmpleo","cFinMes","cFinTri",
                  "cVispera","cPrimero","cVisFest","cUlt2","cUlt3","cUlt5","cPrim3","cPrim5",
                  "cDow1","cDow2","cDow3","cDow4","cDow5"];
console.log("\n── guardián de banderas (una bandera apagada NO da error: da un 'no hay efecto' creíble) ──");
const conteos = {};
for (const b of BANDERAS) {
  const n = filas.filter((f) => f[b] === 1).length;
  conteos[b] = n;
  const esp = esperado[b];
  console.log(`  ${b.padEnd(10)} n=${String(n).padStart(4)}` + (esp != null ? `  esperados ${esp}` : "") +
              (n < 15 ? "   ⚠️ MENOS DE 15 DÍAS" : "") +
              (esp != null && n !== esp ? "   ⚠️ NO CUADRA CON EL CALENDARIO" : "   ok"));
}
if (!conteos.cFomc || !conteos.cFinMes) throw new Error("una bandera clave está a CERO: el cruce de fechas falló. No se mide.");
// las fechas de fin de mes tienen que ser de verdad el último día hábil de su mes
const finMesFechas = filas.filter((f) => f.cFinMes === 1).map((f) => f.fecha);
for (const d of finMesFechas) {
  const m = d.slice(0, 7);
  const ultimoDelMes = filas.filter((f) => mes(f) === m).map((f) => f.fecha).sort().pop();
  if (ultimoDelMes !== d) throw new Error(`fin de mes mal etiquetado: ${d} no es el último día hábil de ${m}`);
}
console.log(`  las ${finMesFechas.length} fechas de fin de mes verificadas contra el fichero  ok`);
// y los terceros viernes que faltan, DICHOS: si el tercer viernes cayó en festivo no existe día
const tercerosViernesEsperados = meses.filter((m) => m !== meses[meses.length - 1]).length;
console.log(`  terceros viernes: ${conteos.cOpex} marcados de ${tercerosViernesEsperados} meses completos` +
            (conteos.cOpex < tercerosViernesEsperados ? ` — faltan ${tercerosViernesEsperados - conteos.cOpex} porque cayeron en festivo de mercado (Viernes Santo). NO se rellenan.` : ""));

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5 · LA MEDICIÓN. Nada de medias entre tercios: FRECUENCIA DE COLA.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const UMBRALES = [-2000, -4000];

function lchoose(n, k) { let s = 0; for (let j = 0; j < k; j++) s += Math.log(n - j) - Math.log(j + 1); return s; }
/** P(X >= k) con X ~ Bin(n, p). Cola derecha exacta. */
function colaDcha(k, n, p) {
  if (p <= 0) return k > 0 ? 0 : 1;
  if (p >= 1) return 1;
  let acc = 0;
  for (let i = k; i <= n; i++) acc += Math.exp(lchoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  return Math.min(1, acc);
}
/** P(X <= k). La que hace falta cuando la señal PROTEGE en vez de dañar. */
function colaIzda(k, n, p) {
  if (p <= 0) return 1;
  if (p >= 1) return k >= n ? 1 : 0;
  let acc = 0;
  for (let i = 0; i <= k; i++) acc += Math.exp(lchoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  return Math.min(1, acc);
}

/** El signo en los TRES tercios del período. Un filtro que sólo vive en un año no sirve. */
function tercios(bandera) {
  const k = Math.floor(filas.length / 3);
  const out = [];
  for (let i = 0; i < 3; i++) {
    const g = i < 2 ? filas.slice(i * k, (i + 1) * k) : filas.slice(2 * k);
    const si = g.filter((f) => f[bandera] === 1), no = g.filter((f) => f[bandera] === 0);
    const kS = si.filter((f) => f.pl < -2000).length, kN = no.filter((f) => f.pl < -2000).length;
    out.push({
      periodo: `${g[0].fecha}→${g[g.length - 1].fecha}`, nSi: si.length,
      difMedia: si.length ? media(si.map((f) => f.pl)) - media(no.map((f) => f.pl)) : null,
      tasaSi: si.length ? kS / si.length : null, tasaNo: kN / no.length,
      difTasa: si.length ? kS / si.length - kN / no.length : null,
      colas: kS,
    });
  }
  return out;
}

function medir(bandera, desc) {
  const si = filas.filter((f) => f[bandera] === 1);
  const no = filas.filter((f) => f[bandera] === 0);
  if (si.length < 5) return null;

  const rSi = resumen(si, ANOS), rNo = resumen(no, ANOS);
  const t = tWelch(si.map((f) => f.pl), no.map((f) => f.pl));

  const colas = UMBRALES.map((u) => {
    const kS = si.filter((f) => f.pl < u).length, kN = no.filter((f) => f.pl < u).length;
    const p0 = kN / no.length;
    const z = p0 > 0 && p0 < 1 ? (kS / si.length - p0) / Math.sqrt((p0 * (1 - p0)) / si.length) : 0;
    return { umbral: u, kSi: kS, nSi: si.length, tasaSi: kS / si.length, kNo: kN, tasaNo: p0,
             esperados: p0 * si.length, z, pDcha: colaDcha(kS, si.length, p0), pIzda: colaIzda(kS, si.length, p0) };
  });

  // ── SI SE FILTRA: se dejan de operar los días marcados ──
  const rF = resumen(no, ANOS);
  const ddElim = Math.abs(BASE.dd) - Math.abs(rF.dd);           // + = la caída mejora
  const peorElim = Math.abs(BASE.peor) - Math.abs(rF.peor);
  const ingresoPerdido = BASE.alAno - rF.alAno;                 // + = cuesta ingreso, − = lo regala
  return {
    bandera, desc, nSi: si.length, nNo: no.length,
    mediaSi: rSi.media, mediaNo: rNo.media, dif: rSi.media - rNo.media, t,
    aciertoSi: rSi.acierto, aciertoNo: rNo.acierto,
    p5Si: rSi.p5, p5No: rNo.p5, p1Si: rSi.p1, p1No: rNo.p1, peorSi: rSi.peor, peorNo: rNo.peor,
    colas,
    filtrado: {
      n: rF.n, alAno: rF.alAno, retenido: rF.alAno / BASE.alAno, peor: rF.peor, p5: rF.p5, p1: rF.p1, dd: rF.dd,
      ddElim, peorElim, ingresoPerdido,
      // LA MÉTRICA QUE PIDE EL ENCARGO: $/año retenidos por cada $ de caída eliminado.
      dolarPorCaida: ddElim > 0 ? rF.alAno / ddElim : null,
      // y su gemela, la que de verdad decide: lo que CUESTA cada $ de caída quitado. Negativo = gratis.
      costePorCaida: ddElim > 0 ? ingresoPerdido / ddElim : null,
    },
    tercios: tercios(bandera),
  };
}

const SENALES = [
  ["cFomc",     "FOMC: día del comunicado (14:00, 3 h después de entrar)"],
  ["cFomcVis",  "víspera del FOMC"],
  ["cFomcPost", "día siguiente al FOMC"],
  ["cOpex",     "vencimiento mensual (tercer viernes)"],
  ["cOpexTri",  "triple hora bruja (3er viernes de mar/jun/sep/dic)"],
  ["cOpexMen",  "tercer viernes NO trimestral"],
  ["cEmpleo",   "PROXY empleo (1er viernes; sale 08:30, ya pasó al entrar)"],
  ["cFinMes",   "último día hábil del mes"],
  ["cFinTri",   "último día hábil del TRIMESTRE"],
  ["cVispera",  "penúltimo día hábil del mes"],
  ["cUlt2",     "los DOS últimos días hábiles del mes"],
  ["cUlt3",     "los TRES últimos días hábiles del mes"],
  ["cUlt5",     "los CINCO últimos días hábiles del mes"],
  ["cPrimero",  "primer día hábil del mes"],
  ["cPrim3",    "los TRES primeros días hábiles del mes"],
  ["cPrim5",    "los CINCO primeros días hábiles del mes"],
  ["cVisFest",  "víspera de festivo de mercado"],
  ["cDow1",     "lunes"],
  ["cDow2",     "martes"],
  ["cDow3",     "miércoles"],
  ["cDow4",     "jueves"],
  ["cDow5",     "viernes"],
];

const R = [];
for (const [b, d] of SENALES) {
  const m = medir(b, d);
  if (m) R.push(m); else console.log(`  ${b}: menos de 5 días marcados — NO SE MIDE, no hay muestra`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6 · SALIDA
// ═════════════════════════════════════════════════════════════════════════════════════════════
const pc = (x) => (x == null || !isFinite(x) ? "—" : (x * 100).toFixed(0) + "%");
console.log("\n" + "═".repeat(132));
console.log(`  BASE SIN FILTRAR · n=${BASE.n} días · ${eur(BASE.alAno)}/año · media ${eur(BASE.media)} · acierto ${pc(BASE.acierto)}`);
console.log(`  peor día ${eur(BASE.peor)} · p1 ${eur(BASE.p1)} · p5 ${eur(BASE.p5)} · PEOR RACHA ${eur(BASE.dd)}`);
console.log("═".repeat(132));

console.log("\n\n## A · ¿APARECE LA COLA MÁS A MENUDO EN ESOS DÍAS?\n");
console.log("| señal | días | P(<−$2.000) | resto | esperados | z | p exacta | P(<−$4.000) | resto | z |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const r of R) {
  const [c2, c4] = r.colas;
  console.log(`| ${r.desc} | ${r.nSi} | ${pc(c2.tasaSi)} (${c2.kSi}) | ${pc(c2.tasaNo)} | ${c2.esperados.toFixed(1)} | ${c2.z.toFixed(2)} | ${(c2.z > 0 ? c2.pDcha : c2.pIzda).toExponential(1)} | ${pc(c4.tasaSi)} (${c4.kSi}) | ${pc(c4.tasaNo)} | ${c4.z.toFixed(2)} |`);
}
console.log(`\n  listón |z| ≥ ${LISTON} (Bonferroni sobre mis ${PRUEBAS} pruebas) · ≥ ${LISTON_PROY} con las ~${PRUEBAS_PROYECTO} que lleva el proyecto sobre estos mismos 653 días.`);

console.log("\n\n## B · LOS PERCENTILES: dónde está la cola de cada grupo\n");
console.log("| señal | días | media | p5 | p1 | peor día | media resto | p5 resto | p1 resto | t |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const r of R)
  console.log(`| ${r.desc} | ${r.nSi} | ${eur(r.mediaSi)} | ${eur(r.p5Si)} | ${eur(r.p1Si)} | ${eur(r.peorSi)} | ${eur(r.mediaNo)} | ${eur(r.p5No)} | ${eur(r.p1No)} | ${r.t.toFixed(2)} |`);

console.log("\n\n## C · SI DEJARAS DE OPERAR ESOS DÍAS  —  lo único que decide\n");
console.log("| señal | días fuera | %ingreso retenido | $/año | peor día | p1 | p5 | PEOR RACHA | caída eliminada | $/año perdidos por $ de caída |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const r of [...R].sort((a, b) => b.filtrado.ddElim - a.filtrado.ddElim)) {
  const F = r.filtrado;
  console.log(`| ${r.desc} | ${r.nSi} (${pc(r.nSi / BASE.n)}) | ${pc(F.retenido)} | ${eur(F.alAno)} | ${eur(F.peor)} | ${eur(F.p1)} | ${eur(F.p5)} | ${eur(F.dd)} | ${eur(F.ddElim)} | ${F.costePorCaida == null ? "—" : F.costePorCaida.toFixed(2)} |`);
}
console.log("\n  «$/año perdidos por $ de caída» NEGATIVO = quitas caída Y encima ganas ingreso. Ése es el caso bueno.");

console.log("\n\n## D · EL SIGNO EN LOS TRES TERCIOS (diferencia de tasa de cola <−$2.000: señal − resto)\n");
console.log("| señal | 2024 | 2025 | 2026 | signos | días marcados por tercio |");
console.log("|---|---|---|---|---|---|");
for (const r of R) {
  const s = r.tercios.map((x) => (x.difTasa == null ? "?" : x.difTasa > 0 ? "+" : x.difTasa < 0 ? "−" : "0")).join("");
  console.log(`| ${r.desc} | ${r.tercios.map((x) => (x.difTasa == null ? "—" : (x.difTasa >= 0 ? "+" : "−") + Math.abs(x.difTasa * 100).toFixed(0) + " pts")).join(" | ")} | ${s} | ${r.tercios.map((x) => x.nSi).join("/")} |`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 7 · COMBINACIONES — las 4 pruebas que faltan de las 26 declaradas
// ═════════════════════════════════════════════════════════════════════════════════════════════
const COMBOS = [
  ["fin de mes + FOMC",              (f) => f.cFinMes === 1 || f.cFomc === 1],
  ["los 2 últimos días del mes",     (f) => f.cUlt2 === 1],
  ["2 últimos del mes + FOMC",       (f) => f.cUlt2 === 1 || f.cFomc === 1],
  ["fin de mes + FOMC + 3er viernes",(f) => f.cFinMes === 1 || f.cFomc === 1 || f.cOpex === 1],
];
console.log("\n\n## E · COMBINACIONES\n");
console.log("| filtro | días fuera | %ingreso retenido | $/año | peor día | p1 | p5 | PEOR RACHA | caída eliminada | $/año perdidos por $ de caída |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const combos = [];
for (const [nom, fn] of COMBOS) {
  const dentro = filas.filter((f) => !fn(f)), n = filas.length - dentro.length;
  const r = resumen(dentro, ANOS);
  const ddElim = Math.abs(BASE.dd) - Math.abs(r.dd), perd = BASE.alAno - r.alAno;
  // tercios de la combinación
  const k = Math.floor(filas.length / 3), ter = [];
  for (let i = 0; i < 3; i++) {
    const g = i < 2 ? filas.slice(i * k, (i + 1) * k) : filas.slice(2 * k);
    const si = g.filter(fn), no = g.filter((f) => !fn(f));
    ter.push({ periodo: `${g[0].fecha}→${g[g.length - 1].fecha}`, nSi: si.length,
               difMedia: si.length ? media(si.map((f) => f.pl)) - media(no.map((f) => f.pl)) : null,
               difTasa: si.length ? si.filter((f) => f.pl < -2000).length / si.length - no.filter((f) => f.pl < -2000).length / no.length : null });
  }
  combos.push({ nombre: nom, fuera: n, ...r, ddElim, ingresoPerdido: perd,
                costePorCaida: ddElim > 0 ? perd / ddElim : null,
                dolarPorCaida: ddElim > 0 ? r.alAno / ddElim : null,
                retenido: r.alAno / BASE.alAno, tercios: ter });
  console.log(`| ${nom} | ${n} (${pc(n / BASE.n)}) | ${pc(r.alAno / BASE.alAno)} | ${eur(r.alAno)} | ${eur(r.peor)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.dd)} | ${eur(ddElim)} | ${ddElim > 0 ? (perd / ddElim).toFixed(2) : "—"} |`);
}
console.log("\n| filtro | signo de la dif. de tasa de cola por tercio | días marcados |");
console.log("|---|---|---|");
for (const c of combos)
  console.log(`| ${c.nombre} | ${c.tercios.map((x) => (x.difTasa == null ? "?" : (x.difTasa >= 0 ? "+" : "−") + Math.abs(x.difTasa * 100).toFixed(0))).join(" · ")} | ${c.tercios.map((x) => x.nSi).join("/")} |`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 8 · FOMC: el tamaño del efecto y el n que haría falta. Se dijo ANTES de correr que no concluye.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const fom = R.find((r) => r.bandera === "cFomc");
console.log("\n\n## F · FOMC — tamaño del efecto y n necesario\n");
if (fom) {
  const [c2, c4] = fom.colas;
  console.log(`  días de FOMC en la muestra: ${fom.nSi} (de ${[...FOMC].filter(enRango).length} reuniones dentro del período)`);
  console.log(`  efecto en la MEDIA: ${eur(fom.dif)} por operación (t = ${fom.t.toFixed(2)}, listón ${LISTON})`);
  console.log(`  cola <−$2.000: ${pc(c2.tasaSi)} contra ${pc(c2.tasaNo)} → ${(c2.tasaSi - c2.tasaNo >= 0 ? "+" : "−")}${Math.abs((c2.tasaSi - c2.tasaNo) * 100).toFixed(1)} puntos (z = ${c2.z.toFixed(2)})`);
  console.log(`  cola <−$4.000: ${pc(c4.tasaSi)} contra ${pc(c4.tasaNo)} → ${(c4.tasaSi - c4.tasaNo >= 0 ? "+" : "−")}${Math.abs((c4.tasaSi - c4.tasaNo) * 100).toFixed(1)} puntos (z = ${c4.z.toFixed(2)})`);
  for (const [nom, c] of [["la cola <−$2.000", c2], ["la cola <−$4.000", c4]]) {
    if (Math.abs(c.z) > 0.01) {
      const nNec = Math.ceil(fom.nSi * (LISTON / Math.abs(c.z)) ** 2);
      console.log(`  para que ${nom} llegue al listón de ${LISTON} harían falta ${nNec} días de FOMC = ${(nNec / 8).toFixed(0)} años de reuniones` +
                  (nNec > fom.nSi ? ` → ${((nNec - fom.nSi) / 8).toFixed(0)} años MÁS de los que hay` : " → ya se tiene"));
    } else console.log(`  ${nom}: el efecto medido es CERO. No hay n que lo salve.`);
  }
  console.log("\n  los días de FOMC, uno a uno (tarde = movimiento de 11:00 al cierre, en puntos):");
  for (const f of filas.filter((x) => x.cFomc === 1))
    console.log(`    ${f.fecha}  ${eur(f.pl).padStart(9)}   tarde ${(f.zTardePts >= 0 ? "+" : "−") + Math.abs(f.zTardePts).toFixed(0)} pts`);
}

writeFileSync("scripts/calendario-cola.json",
  JSON.stringify({ BASE, conteos, senales: R, combos, LISTON, LISTON_PROY, PRUEBAS, PRUEBAS_PROYECTO }, null, 2), "utf8");
console.log("\n  detalle completo en scripts/calendario-cola.json");
