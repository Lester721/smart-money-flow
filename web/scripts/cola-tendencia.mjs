// ¿PREDICE LA TENDENCIA LA COLA DEL CÓNDOR? — no la media: el PEOR DÍA y la PEOR RACHA.
//
// ═══ QUÉ ES DISTINTO DE LO YA MEDIDO ═══════════════════════════════════════════════════════
// Los 17 filtros de régimen y las 30 reglas de gestión se midieron contra la MEDIA (tercio alto
// contra tercio bajo del P&L medio). Aquí no. Aquí se define un DÍA MALO y se mide si la señal
// lo anticipa: P(pérdida > $2.000), P(pérdida > $4.000), percentil 5 y 1, peor día y peor racha.
// Un filtro que deje la media igual y parta la caída por la mitad ES UN ÉXITO.
//
// ═══ DE DÓNDE SALE CADA DATO (nada se estima, nada se rellena) ═════════════════════════════
// · P&L diario del cóndor  → scripts/regimen-filas.json (653 días, ya construido con BID/ASK
//   reales de las cuatro patas; total $48.638, peor día −$4.900, peor racha −$15.176).
// · Serie de tendencia     → scripts/cache-theta/SPY_spotmin_y_{2023..2026}.json — precios SPY
//   MINUTO A MINUTO, sin ajustar. De ahí salen apertura/máximo/mínimo/cierre reales de cada
//   sesión y el precio de las 11:00 (minuto 660). NO es Black-Scholes ni un modelo: es cinta.
//
//   ¿POR QUÉ SPY Y NO SPX? Porque el SPX de este proyecto sólo existe desde 2024-01-02 y una
//   media de 200 sesiones necesita 200 sesiones ANTERIORES al primer día medido. SPY tiene 250
//   sesiones de 2023 de precalentamiento. Alineación comprobada: la correlación de los retornos
//   cierre-a-cierre SPY vs SPX es 0,99863, y el control desplazado un día da −0,05. Al final del
//   script se REPITE la señal ganadora con SPX nativo en el tramo donde alcanza la historia.
//
// ═══ NADA DE MIRAR AL FUTURO ═══════════════════════════════════════════════════════════════
// Toda media, todo rango y toda racha se construye SÓLO con sesiones ANTERIORES al día medido
// (cierres hasta D−1). Lo único del día D que se usa es el precio de las 11:00, que es
// exactamente el momento de la entrada. El cierre del día D no toca ninguna señal.
// Ese error —medias calculadas sobre la serie completa— ya destruyó dos hallazgos aquí.

import { readFileSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

// ─── PRUEBAS DECLARADAS ────────────────────────────────────────────────────────────────────
// 10 señales × 2 direcciones (tirar el tercio alto / tirar el tercio bajo) + 4 combinaciones.
const PRUEBAS = 24;
const LISTON = listonT(PRUEBAS);

const MALO = 2000;      // "día malo"  = pérdida mayor de $2.000
const MUY_MALO = 4000;  // "día pésimo" = pérdida mayor de $4.000
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pct = (x) => (x * 100).toFixed(1) + "%";

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 1 · SERIE DIARIA DE SPY DESDE LA CINTA DE MINUTOS
// ═══════════════════════════════════════════════════════════════════════════════════════════
const dias = [];             // ordenada por fecha
const porFecha = new Map();
for (const y of [2023, 2024, 2025, 2026]) {
  const j = JSON.parse(readFileSync(`scripts/cache-theta/SPY_spotmin_y_${y}.json`, "utf8"));
  for (const [d, arr] of Object.entries(j)) {
    const fecha = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    const m = new Map(arr.map(([mi, p]) => [mi, p]));
    const px = arr.map((x) => x[1]).filter((x) => x > 0);
    if (!px.length) continue;
    const o = m.get(570), c = m.get(960), p11 = m.get(660);
    if (!(o > 0) || !(c > 0) || !(p11 > 0)) continue;   // si falta, se DICE (se cuenta abajo)
    const fila = { fecha, o, c, p11, h: Math.max(...px), l: Math.min(...px) };
    dias.push(fila);
    porFecha.set(fecha, fila);
  }
}
dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
const idx = new Map(dias.map((d, i) => [d.fecha, i]));

// True range de cada sesión (necesita el cierre anterior)
for (let i = 0; i < dias.length; i++) {
  const d = dias[i], prev = i > 0 ? dias[i - 1] : null;
  d.tr = prev ? Math.max(d.h - d.l, Math.abs(d.h - prev.c), Math.abs(d.l - prev.c)) : d.h - d.l;
  d.ret = prev ? d.c / prev.c - 1 : 0;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 2 · SEÑALES DE TENDENCIA Y ESTRÉS, TODAS OBSERVABLES A LAS 11:00
// ═══════════════════════════════════════════════════════════════════════════════════════════
const opsBase = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const media = (v) => v.reduce((a, x) => a + x, 0) / v.length;

const filas = [];
const sinSerie = [];
for (const op of opsBase) {
  const i = idx.get(op.fecha);
  if (i === undefined) { sinSerie.push(op.fecha); continue; }
  if (i < 200) { sinSerie.push(op.fecha); continue; }   // sin 200 sesiones previas no hay MA200

  const hoy = dias[i];
  const prev = dias.slice(i - 200, i);                  // SÓLO sesiones ANTERIORES a D
  const cierres = prev.map((d) => d.c);
  const ultimo = cierres[cierres.length - 1];           // cierre de D−1
  const ma = (k) => media(cierres.slice(-k));
  const p11 = hoy.p11;                                  // precio a las 11:00 del día D

  // racha con signo: +k si k cierres seguidos al alza hasta D−1, −k si a la baja
  let k = 1, signo = Math.sign(prev[prev.length - 1].c - prev[prev.length - 2].c) || 1;
  while (k < 20) {
    const a = prev[prev.length - 1 - k], b = prev[prev.length - 2 - k];
    if (!a || !b) break;
    if (Math.sign(a.c - b.c) !== signo) break;
    k++;
  }
  const trs = prev.map((d) => d.tr);
  const rets = prev.map((d) => d.ret);

  filas.push({
    fecha: op.fecha,
    pl: op.pl,
    ticker: "SPXW",
    // ── tendencia ──
    dma20:  p11 / ma(20) - 1,
    dma50:  p11 / ma(50) - 1,
    dma200: p11 / ma(200) - 1,
    dmax60: p11 / Math.max(...cierres.slice(-60)) - 1,     // ≤ 0 salvo máximo nuevo
    ret20:  ultimo / cierres[cierres.length - 21] - 1,
    racha:  signo * k,
    // ── estrés acumulado ──
    atr5:   media(trs.slice(-5)) / ultimo,
    atr20:  media(trs.slice(-20)) / ultimo,
    acel:   media(trs.slice(-5)) / media(trs.slice(-20)),
    abs10:  media(rets.slice(-10).map(Math.abs)),
    // descriptivo, no entra como señal (tiene demasiados ceros para ordenar tercios)
    grandes10: rets.slice(-10).filter((r) => Math.abs(r) >= 0.01).length,
  });
}

console.log("═".repeat(95));
console.log("PREDECIR LA COLA · TENDENCIA — cóndor de hierro 0DTE sobre SPXW, 1 contrato");
console.log("═".repeat(95));
console.log(`\nDías del cóndor: ${opsBase.length}. Medidos: ${filas.length}.`);
if (sinSerie.length) {
  console.log(`SE DICE, NO SE RELLENA — ${sinSerie.length} día(s) fuera por falta de serie de precios previa:`);
  console.log(`  ${sinSerie.join(", ")}`);
  console.log(`  (la cinta de minutos de SPY llega hasta ${dias[dias.length - 1].fecha}; esos días no tienen D−1)`);
}

// ═══ RADIOGRAFÍA — antes de medir nada ═════════════════════════════════════════════════════
radiografia(filas, ["pl", "dma20", "dma50", "dma200", "dmax60", "ret20", "racha",
                    "atr5", "atr20", "acel", "abs10"], "tendencia y estrés", { maxCeros: 0.2 });

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 3 · MÉTRICAS DE COLA
// ═══════════════════════════════════════════════════════════════════════════════════════════
const ANOS = filas.length / 252;
const percentil = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

function racha(ops) {           // peor racha acumulada (pico a valle) en orden de fecha
  const ord = [...ops].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let c = 0, pico = 0, peor = 0;
  for (const o of ord) { c += o.pl; if (c > pico) pico = c; if (c - pico < peor) peor = c - pico; }
  return peor;
}
function cola(ops) {
  const pl = ops.map((o) => o.pl);
  return {
    n: ops.length,
    media: media(pl),
    total: pl.reduce((a, x) => a + x, 0),
    pMalo: pl.filter((x) => x <= -MALO).length / pl.length,
    nMalo: pl.filter((x) => x <= -MALO).length,
    pPesimo: pl.filter((x) => x <= -MUY_MALO).length / pl.length,
    nPesimo: pl.filter((x) => x <= -MUY_MALO).length,
    p5: percentil(pl, 0.05),
    p1: percentil(pl, 0.01),
    peor: Math.min(...pl),
    dd: racha(ops),
  };
}
// z de dos proporciones (¿la tasa de días malos difiere entre tercios?)
function zProp(k1, n1, k2, n2) {
  const p = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (k1 / n1 - k2 / n2) / se : 0;
}
const tercios = (ops, campo) => {
  const ord = [...ops].sort((a, b) => a[campo] - b[campo]);
  const k = Math.floor(ord.length / 3);
  return { bajo: ord.slice(0, k), medio: ord.slice(k, ord.length - k), alto: ord.slice(-k) };
};

const BASE = cola(filas);
console.log(`\n── EL CÓNDOR SIN FILTRAR (${filas.length} días · ${ANOS.toFixed(2)} años) ──`);
console.log(`  total ${eur(BASE.total)} · ${eur(BASE.total / ANOS)}/año · media ${eur(BASE.media)}/día`);
console.log(`  días malos (pérdida > ${eur(MALO)}): ${BASE.nMalo} (${pct(BASE.pMalo)}) · pésimos (> ${eur(MUY_MALO)}): ${BASE.nPesimo} (${pct(BASE.pPesimo)})`);
console.log(`  percentil 5 ${eur(BASE.p5)} · percentil 1 ${eur(BASE.p1)} · PEOR DÍA ${eur(BASE.peor)} · PEOR RACHA ${eur(BASE.dd)}`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 4 · ¿ANTICIPA CADA SEÑAL LA COLA?
// ═══════════════════════════════════════════════════════════════════════════════════════════
const SENALES = [
  ["dma200", "distancia del spot de las 11:00 a la media de 200 sesiones"],
  ["dma50",  "distancia a la media de 50 sesiones"],
  ["dma20",  "distancia a la media de 20 sesiones"],
  ["dmax60", "distancia al máximo de 60 sesiones (caída desde el techo)"],
  ["ret20",  "retorno de las últimas 20 sesiones"],
  ["racha",  "días seguidos al alza (+) o a la baja (−)"],
  ["atr5",   "rango verdadero medio de 5 sesiones (% del precio)"],
  ["atr20",  "rango verdadero medio de 20 sesiones (% del precio)"],
  ["acel",   "aceleración del rango: ATR5 / ATR20"],
  ["abs10",  "movimiento absoluto medio de 10 sesiones"],
];

console.log(`\n${"═".repeat(95)}`);
console.log("TABLA 1 · LA COLA POR TERCIOS DE CADA SEÑAL");
console.log("═".repeat(95));
console.log("\n| señal | tercio | n | media/día | P(pérd>$2k) | P(pérd>$4k) | pct 5 | pct 1 | peor día |");
console.log("|---|---|---|---|---|---|---|---|---|");
const resumen = [];
for (const [campo, desc] of SENALES) {
  const t = tercios(filas, campo);
  const c = { bajo: cola(t.bajo), medio: cola(t.medio), alto: cola(t.alto) };
  for (const g of ["bajo", "medio", "alto"]) {
    const x = c[g];
    console.log(`| ${g === "bajo" ? campo : ""} | ${g} | ${x.n} | ${eur(x.media)} | ${pct(x.pMalo)} (${x.nMalo}) | ${pct(x.pPesimo)} (${x.nPesimo}) | ${eur(x.p5)} | ${eur(x.p1)} | ${eur(x.peor)} |`);
  }
  const z = zProp(c.alto.nMalo, c.alto.n, c.bajo.nMalo, c.bajo.n);
  resumen.push({ campo, desc, c, z });
}

console.log(`\n${"═".repeat(95)}`);
console.log(`TABLA 2 · ¿LA DIFERENCIA DE COLA ES REAL? (z de dos proporciones, listón Bonferroni |z| ≥ ${LISTON} con ${PRUEBAS} pruebas)`);
console.log("═".repeat(95));
console.log("\n| señal | P(malo) tercio bajo | P(malo) tercio alto | diferencia | z | ¿pasa? |");
console.log("|---|---|---|---|---|---|");
for (const r of resumen) {
  const d = r.c.alto.pMalo - r.c.bajo.pMalo;
  console.log(`| ${r.campo} | ${pct(r.c.bajo.pMalo)} | ${pct(r.c.alto.pMalo)} | ${(d * 100).toFixed(1)} pts | ${r.z.toFixed(2)} | ${Math.abs(r.z) >= LISTON ? "SÍ" : "no"} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 5 · SIMULACIÓN DE FILTRO — tirar un tercio y ver qué pasa con la caída y con el ingreso
// ═══════════════════════════════════════════════════════════════════════════════════════════
function simular(nombre, quedan) {
  const c = cola(quedan);
  const ingAno = c.total / ANOS;                       // el tiempo NO se acorta al saltar días
  const perdidoAno = BASE.total / ANOS - ingAno;
  const dDD = Math.abs(BASE.dd) - Math.abs(c.dd);      // dólares de racha eliminados
  const dPeor = Math.abs(BASE.peor) - Math.abs(c.peor);
  return {
    nombre, n: c.n, tirados: filas.length - c.n, pctTirado: 1 - c.n / filas.length,
    total: c.total, ingAno, retencion: c.total / BASE.total, perdidoAno,
    peor: c.peor, dPeor, dd: c.dd, dDD,
    nMalo: c.nMalo, pMalo: c.pMalo, nPesimo: c.nPesimo, p5: c.p5, p1: c.p1, media: c.media,
    // dólares de caída eliminados por cada dólar/año sacrificado (>1 = el cambio compensa)
    eficiencia: perdidoAno > 0 ? dDD / perdidoAno : (dDD > 0 ? Infinity : 0),
    // la métrica literal del encargo: $/año retenidos por cada dólar de caída eliminado
    retPorDolar: dDD > 0 ? ingAno / dDD : null,
  };
}

const sims = [];
for (const [campo] of SENALES) {
  const t = tercios(filas, campo);
  sims.push(simular(`${campo}: fuera el tercio ALTO`, [...t.bajo, ...t.medio]));
  sims.push(simular(`${campo}: fuera el tercio BAJO`, [...t.medio, ...t.alto]));
}

console.log(`\n${"═".repeat(95)}`);
console.log("TABLA 3 · SI FILTRARAS — 20 filtros de un tercio (ordenados por reducción de la PEOR RACHA)");
console.log("═".repeat(95));
console.log(`\nBase: ${eur(BASE.total / ANOS)}/año · peor día ${eur(BASE.peor)} · peor racha ${eur(BASE.dd)}\n`);
console.log("| filtro | días fuera | $/año | retiene | peor día | Δpeor día | peor racha | Δracha | caída eliminada por $/año sacrificado |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const s of [...sims].sort((a, b) => b.dDD - a.dDD)) {
  console.log(`| ${s.nombre} | ${pct(s.pctTirado)} | ${eur(s.ingAno)} | ${pct(s.retencion)} | ${eur(s.peor)} | ${eur(s.dPeor)} | ${eur(s.dd)} | ${eur(s.dDD)} | ${s.eficiencia === Infinity ? "∞" : s.eficiencia.toFixed(2)} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 6 · LOS TRES TERCIOS DEL PERÍODO — un filtro que sólo funciona en un año no sirve
// ═══════════════════════════════════════════════════════════════════════════════════════════
const ordF = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha));
const kk = Math.floor(ordF.length / 3);
const bloques = [ordF.slice(0, kk), ordF.slice(kk, 2 * kk), ordF.slice(2 * kk)];

console.log(`\n${"═".repeat(95)}`);
console.log("TABLA 4 · SIGNO EN LOS TRES TERCIOS DEL PERÍODO (diferencia de P(pérdida>$2k), tercio alto − tercio bajo)");
console.log("═".repeat(95));
console.log(`\nTercios: ${bloques.map((b) => `${b[0].fecha}→${b[b.length - 1].fecha} (n=${b.length})`).join(" · ")}\n`);
console.log("| señal | tercio 1 | tercio 2 | tercio 3 | signos | ¿mismo signo? |");
console.log("|---|---|---|---|---|---|");
const estables = [];
for (const [campo] of SENALES) {
  const difs = bloques.map((b) => {
    const t = tercios(b, campo);
    return cola(t.alto).pMalo - cola(t.bajo).pMalo;
  });
  const sg = difs.map((d) => (d > 0 ? "+" : d < 0 ? "−" : "0"));
  const mismo = sg[0] === sg[1] && sg[1] === sg[2] && sg[0] !== "0";
  if (mismo) estables.push(campo);
  console.log(`| ${campo} | ${(difs[0] * 100).toFixed(1)} pts | ${(difs[1] * 100).toFixed(1)} pts | ${(difs[2] * 100).toFixed(1)} pts | ${sg.join("")} | ${mismo ? "SÍ" : "no"} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 7 · COMBINACIONES (4 pruebas más, ya contadas en las 24 declaradas)
// ═══════════════════════════════════════════════════════════════════════════════════════════
const q = (campo, quantil) => percentil(filas.map((f) => f[campo]), quantil);
const COMBOS = [
  ["estrés alto: fuera si ATR20 en el tercio superior Y acel > 1", (f) => !(f.atr20 >= q("atr20", 2 / 3) && f.acel > 1)],
  ["debilidad: fuera si el spot está por debajo de la MA20 Y en caída desde el máximo de 60", (f) => !(f.dma20 < 0 && f.dmax60 < -0.02)],
  ["tendencia rota: fuera si el spot está por debajo de la MA50", (f) => !(f.dma50 < 0)],
  ["doble estrés: fuera si ATR5 en el tercio superior O caída >4% desde el máximo de 60", (f) => !(f.atr5 >= q("atr5", 2 / 3) || f.dmax60 < -0.04)],
];
console.log(`\n${"═".repeat(95)}`);
console.log("TABLA 5 · COMBINACIONES");
console.log("═".repeat(95));
console.log("\n| regla | días fuera | $/año | retiene | peor día | peor racha | Δracha | caída elim. por $/año sacrificado |");
console.log("|---|---|---|---|---|---|---|---|");
const simsCombo = [];
for (const [nombre, fn] of COMBOS) {
  const quedan = filas.filter(fn);
  if (quedan.length < 100) { console.log(`| ${nombre} | descarta demasiado (${filas.length - quedan.length}) — no se mide |`); continue; }
  const s = simular(nombre, quedan);
  simsCombo.push(s);
  console.log(`| ${nombre} | ${pct(s.pctTirado)} | ${eur(s.ingAno)} | ${pct(s.retencion)} | ${eur(s.peor)} | ${eur(s.dd)} | ${eur(s.dDD)} | ${s.eficiencia === Infinity ? "∞" : s.eficiencia.toFixed(2)} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 8 · RETRATO DE LOS DÍAS PÉSIMOS — si nada predice, ¿de qué están hechos?
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(95)}`);
console.log(`TABLA 6 · LOS ${MUY_MALO ? "" : ""}12 PEORES DÍAS Y QUÉ MARCABAN LAS SEÑALES ESA MAÑANA`);
console.log("═".repeat(95));
console.log("\n| fecha | P&L | dist MA200 | dist MA50 | dist MA20 | desde máx 60 | racha | ATR20 | acel |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const f of [...filas].sort((a, b) => a.pl - b.pl).slice(0, 12)) {
  console.log(`| ${f.fecha} | ${eur(f.pl)} | ${(f.dma200 * 100).toFixed(1)}% | ${(f.dma50 * 100).toFixed(1)}% | ${(f.dma20 * 100).toFixed(1)}% | ${(f.dmax60 * 100).toFixed(1)}% | ${f.racha > 0 ? "+" : ""}${f.racha} | ${(f.atr20 * 100).toFixed(2)}% | ${f.acel.toFixed(2)} |`);
}
const pesimos = filas.filter((f) => f.pl <= -MUY_MALO);
const buenos = filas.filter((f) => f.pl > 0);
console.log(`\n  Medias — días pésimos (n=${pesimos.length}) vs días ganadores (n=${buenos.length}):`);
for (const [campo] of SENALES) {
  const a = media(pesimos.map((f) => f[campo])), b = media(buenos.map((f) => f[campo]));
  console.log(`    ${campo.padEnd(8)} pésimos ${a.toFixed(4).padStart(9)}  ganadores ${b.toFixed(4).padStart(9)}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 9 · ¿TENÍA FUERZA LA PRUEBA? — un negativo con muestra corta no es una conclusión
// ═══════════════════════════════════════════════════════════════════════════════════════════
const nT = Math.floor(filas.length / 3);
const pB = BASE.pMalo;
const seDif = Math.sqrt(2 * pB * (1 - pB) / nT);
console.log(`\n${"═".repeat(95)}`);
console.log("POTENCIA — qué diferencia de cola podía ver esta muestra");
console.log("═".repeat(95));
console.log(`\n  Tasa base de días malos: ${pct(pB)} (${BASE.nMalo} de ${filas.length}). Cada tercio tiene n=${nT}.`);
console.log(`  Error estándar de la diferencia entre tercios: ${(seDif * 100).toFixed(2)} pts.`);
console.log(`  Para pasar el listón de ${LISTON} hace falta una diferencia de ${(LISTON * seDif * 100).toFixed(1)} pts,`);
console.log(`  es decir un tercio a ~${pct(Math.max(0, pB - LISTON * seDif / 2))} contra otro a ~${pct(pB + LISTON * seDif / 2)}. Es un efecto GRANDE.`);
console.log(`  Días pésimos (>${eur(MUY_MALO)}): sólo ${BASE.nPesimo} en toda la muestra → ~${(BASE.nPesimo / 3).toFixed(1)} por tercio.`);
console.log(`  SOBRE ESE UMBRAL NINGUNA PRUEBA PUEDE CONCLUIR NADA. Se reporta el recuento, no un veredicto.`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 10 · CONTROL CON SPX NATIVO — que el hallazgo no dependa de haber usado SPY
// ═══════════════════════════════════════════════════════════════════════════════════════════
const spx = opsBase.map((o) => ({ fecha: o.fecha, c: o.cierre, sp11: o.sp11 }));
const idxS = new Map(spx.map((d, i) => [d.fecha, i]));
const filasSpx = [];
for (const op of opsBase) {
  const i = idxS.get(op.fecha);
  if (i < 200) continue;                              // MA200 nativa de SPX: desde ~oct-2024
  const cierres = spx.slice(i - 200, i).map((d) => d.c);
  filasSpx.push({
    fecha: op.fecha, pl: op.pl,
    dma200: op.sp11 / media(cierres) - 1,
    dma50: op.sp11 / media(cierres.slice(-50)) - 1,
    dma20: op.sp11 / media(cierres.slice(-20)) - 1,
    dmax60: op.sp11 / Math.max(...cierres.slice(-60)) - 1,
  });
}
console.log(`\n${"═".repeat(95)}`);
console.log(`CONTROL · LAS MISMAS SEÑALES CON SPX NATIVO (${filasSpx.length} días, desde ${filasSpx[0].fecha} — antes no hay 200 sesiones de SPX)`);
console.log("═".repeat(95));
console.log("\n| señal | corr con la versión SPY (días comunes) | P(malo) tercio bajo | P(malo) tercio alto | z |");
console.log("|---|---|---|---|---|");
const mapSpy = new Map(filas.map((f) => [f.fecha, f]));
for (const campo of ["dma200", "dma50", "dma20", "dmax60"]) {
  const pares = filasSpx.filter((f) => mapSpy.has(f.fecha));
  const x = pares.map((f) => f[campo]), y = pares.map((f) => mapSpy.get(f.fecha)[campo]);
  const mx = media(x), my = media(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  const r = sxy / Math.sqrt(sxx * syy);
  const t = tercios(filasSpx, campo);
  const cb = cola(t.bajo), ca = cola(t.alto);
  console.log(`| ${campo} | ${r.toFixed(4)} | ${pct(cb.pMalo)} (${cb.nMalo}) | ${pct(ca.pMalo)} (${ca.nMalo}) | ${zProp(ca.nMalo, ca.n, cb.nMalo, cb.n).toFixed(2)} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
writeFileSync("scripts/cola-tendencia-salida.json", JSON.stringify({
  generado: new Date().toISOString(),
  fuente: { pl: "scripts/regimen-filas.json", tendencia: "scripts/cache-theta/SPY_spotmin_y_{2023..2026}.json (cinta de minutos, sin ajustar)" },
  pruebas: PRUEBAS, listonZ: LISTON,
  dias: filas.length, diasFuera: sinSerie, anos: ANOS,
  base: BASE, senales: resumen.map((r) => ({ campo: r.campo, desc: r.desc, z: r.z, alto: r.c.alto, bajo: r.c.bajo, medio: r.c.medio })),
  filtros: sims, combos: simsCombo, estables,
}, null, 2));
console.log("\n\nDetalle completo en scripts/cola-tendencia-salida.json");
