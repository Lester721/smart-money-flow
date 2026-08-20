// APAGAR-Y-ENCENDER — ¿cuánto vale de verdad la mejor señal de régimen?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/apagar-encender.mjs
//
// ═══ LA PREGUNTA ═════════════════════════════════════════════════════════════════════════════
// Suponiendo BUENA la mejor señal de régimen que ha salido del proyecto, se simula apagar y
// encender el cóndor 0DTE sobre los 1.121 días (2022-01-03 → 2026-08-10) con la cuenta real
// ($7.977 de efectivo, interés al 5% sobre saldo negativo) y se compara contra DOS controles:
//
//   1. AZAR      — apagar el MISMO número de días, sorteados. 500 sorteos.
//   2. TAMAÑO    — operar SIEMPRE con menos contratos (la mitad, y también el tamaño que iguala
//                  la caída y el que iguala la exposición).
//
// Si apagar-y-encender no le gana a "menos tamaño siempre", la señal no existe: lo único que
// hacía era reducir exposición, y eso se consigue gratis.
//
// ═══ QUÉ SEÑALES ═════════════════════════════════════════════════════════════════════════════
//   S1 · finMes — "no operar el último día hábil del mes". Es LA MEJOR de las 18 pruebas de
//        régimen (regimen-18.mjs, |t|=2,37 sobre un listón de 2,99; ninguna pasó) y la única que
//        entró en la propuesta actual. Se eligió mirando 2024-2026 → 2022-2023 es fuera de muestra.
//   S2 · bajoMA — "no operar con el índice por debajo de su MA20 Y de su MA50". Es el único
//        interruptor de régimen con PERSISTENCIA que ha tenido el proyecto (el filtro de amplitud,
//        retirado el 2026-08-19 por morir fuera de muestra). Se incluye porque la pregunta habla
//        de "meses apagado", y finMes apaga 1 día suelto al mes: no es un régimen.
//
// ═══ LA REGLA DE HIERRO ══════════════════════════════════════════════════════════════════════
// Todo se mide TRES veces: período entero, mitad A (2022-2023) y mitad B (2024-2026), y se exige
// el mismo signo en las dos mitades. Ninguna de las dos señales se ajusta aquí: son reglas fijas
// sin parámetro que tocar, así que "elegir en A y probar en B" se reduce a comprobar que la regla
// hace lo mismo en los dos lados. Se comprueba.
//
// ═══ PRUEBAS DECLARADAS ══════════════════════════════════════════════════════════════════════
// 2 señales × 2 geometrías × 3 períodos = 12. Listón de |t| = listonT(12). No se baja.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { tWelch, listonT } from "../lib/barreraHallazgos";

// ── LA CUENTA REAL ──────────────────────────────────────────────────────────────────────────
const EFECTIVO = 7977;             // el cuello de botella: LAS PÉRDIDAS SALEN DE AQUÍ
const CUENTA = 56389;              // total, para dar la caída en % de la cuenta
const HOOD = 500 * 96.82;          // 500 acciones de HOOD como colateral de margen
const LINEA = -0.70 * HOOD;        // por debajo de esto: llamada de margen
const INT = 0.05;                  // interés de margen de Robinhood
const PRUEBAS = 12;
const LISTON = listonT(PRUEBAS);
const SORTEOS = 500;

const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : NaN; };
const anos = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1 · DATOS
// ═════════════════════════════════════════════════════════════════════════════════════════════
const G = JSON.parse(readFileSync("scripts/dm-grid.json", "utf8"));
const GEOM = [
  ["s0.80_a30", "PROPUESTA  ±0,80σ / ala 30"],
  ["p25_a50", "CÓNDOR HOY ±25 pts / ala 50"],
];

// filas comunes: sólo los días donde las DOS geometrías tienen precio (para comparar lo mismo)
const dias = G.dias;
const filas = [];
for (let i = 0; i < dias.length; i++) {
  const a = G.variantes["s0.80_a30"].serie[i], b = G.variantes["p25_a50"].serie[i];
  if (!a || !b) continue;
  filas.push({
    fecha: dias[i].fecha, ano: dias[i].ano, mes: dias[i].fecha.slice(0, 7),
    sp11: dias[i].sp11, cierre: dias[i].cierre, finMes: dias[i].finMes,
    plProp: a.pl, plHoy: b.pl, credProp: a.credito, colProp: a.colateral, colHoy: b.colateral,
  });
}
filas.sort((x, y) => x.fecha.localeCompare(y.fecha));

// ── MA20 / MA50 con cierres ESTRICTAMENTE anteriores. sp11 es observable a las 11:00.
for (let i = 0; i < filas.length; i++) {
  const prev = filas.slice(Math.max(0, i - 50), i).map((f) => f.cierre);
  const p20 = filas.slice(Math.max(0, i - 20), i).map((f) => f.cierre);
  filas[i].ma20 = p20.length === 20 ? media(p20) : null;
  filas[i].ma50 = prev.length === 50 ? media(prev) : null;
  filas[i].bajoMA = (filas[i].ma20 != null && filas[i].ma50 != null && filas[i].sp11 < filas[i].ma20 && filas[i].sp11 < filas[i].ma50) ? 1 : 0;
}

// EL GUARDIÁN: un campo muerto se lee como 0 y se mide durante horas sin enterarse.
radiografia(filas, ["plProp", "plHoy", "credProp", "sp11", "cierre", "ma20", "ma50"], "días del cóndor 0DTE",
  { cerosLegitimos: ["plProp", "plHoy"] });

const F0 = filas[0].fecha, F1 = filas[filas.length - 1].fecha;
const AN = anos(F0, F1);
console.log("\n" + "═".repeat(100));
console.log("  APAGAR Y ENCENDER · " + filas.length + " días · " + F0 + " → " + F1 + " (" + AN.toFixed(2) + " años)");
console.log("  cuenta real: " + eur(EFECTIVO) + " de EFECTIVO · interés " + (INT * 100) + "% · llamada de margen en " + eur(LINEA));
console.log("  listón de |t| = " + LISTON + " (Bonferroni sobre " + PRUEBAS + " pruebas declaradas)");
console.log("═".repeat(100));

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2 · EL MOTOR — la caja día a día, con interés sobre saldo negativo
// ═════════════════════════════════════════════════════════════════════════════════════════════
/** off: array de 0/1 (1 = apagado). mult: contratos (puede ser fraccionario → XSP). */
function correr(fs, campo, off, mult) {
  let caja = EFECTIVO, minCaja = caja, fechaMin = fs[0].fecha, interes = 0, llamada = null;
  let acc = 0, pico = 0, dd = 0, fechaDD = "";
  let prev = fs[0].fecha, nOp = 0, cambios = 0, estado = null, rachaOff = 0, maxRachaOff = 0;
  const serie = [], opera = [], mesesOp = new Map();
  for (let i = 0; i < fs.length; i++) {
    const d = Math.max(1, (new Date(fs[i].fecha + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000);
    prev = fs[i].fecha;
    if (caja < 0) { const it = caja * INT * d / 365; interes += it; caja += it; }
    const encendido = !off[i];
    if (estado !== null && encendido !== estado) cambios++;
    estado = encendido;
    if (encendido) { rachaOff = 0; nOp++; opera.push(fs[i][campo] * mult); }
    else { rachaOff++; if (rachaOff > maxRachaOff) maxRachaOff = rachaOff; }
    const pl = encendido ? fs[i][campo] * mult : 0;
    serie.push(pl);
    mesesOp.set(fs[i].mes, (mesesOp.get(fs[i].mes) || 0) + (encendido ? 1 : 0));
    caja += pl; acc += pl;
    if (acc > pico) pico = acc;
    if (pico - acc > dd) { dd = pico - acc; fechaDD = fs[i].fecha; }
    if (caja < minCaja) { minCaja = caja; fechaMin = fs[i].fecha; }
    if (caja < LINEA && !llamada) llamada = fs[i].fecha;
  }
  const A = anos(fs[0].fecha, fs[fs.length - 1].fecha);
  const mesesApagados = [...mesesOp.values()].filter((x) => x === 0).length;
  return {
    anual: (caja - EFECTIVO) / A, total: caja - EFECTIVO, caja, minCaja, fechaMin, interes, llamada,
    dd: -dd, fechaDD, ddPct: (dd / CUENTA) * 100, peorDia: opera.length ? Math.min(...opera) : 0,
    es5: media([...opera].sort((a, b) => a - b).slice(0, Math.max(1, Math.floor(opera.length * 0.05)))),
    nOp, nOff: fs.length - nOp, pctOff: ((fs.length - nOp) / fs.length) * 100, cambios,
    mesesApagados, mesesTotal: mesesOp.size, maxRachaOff, acierto: opera.length ? opera.filter((x) => x > 0).length / opera.length * 100 : 0,
    serie,
  };
}
const SIEMPRE = (n) => new Array(n).fill(0);
const desde = (fs, campo) => fs.map((f) => f[campo]);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3 · LA SEÑAL, ANTES DE LA SIMULACIÓN — ¿qué dice el t en cada mitad?
// ═════════════════════════════════════════════════════════════════════════════════════════════
const A = filas.filter((f) => f.fecha < "2024-01-01");
const B = filas.filter((f) => f.fecha >= "2024-01-01");
const PERIODOS = [["TODO 2022-2026", filas], ["A · 2022-2023", A], ["B · 2024-2026", B]];

console.log("\n## 3 · LA SEÑAL EN CRUDO — media de los días APAGADOS contra los ENCENDIDOS");
console.log("   (si la señal vale, los días apagados tienen que perder dinero en LAS DOS mitades)\n");
console.log("| señal | geometría | período | n apagados | media APAGADO | media ENCENDIDO | diferencia | t | ¿pasa " + LISTON + "? |");
console.log("|---|---|---|---|---|---|---|---|---|");
const tabla = [];
for (const [sig, nomSig] of [["finMes", "finMes"], ["bajoMA", "bajoMA"]]) {
  for (const [gid, nomG] of GEOM) {
    const campo = gid === "s0.80_a30" ? "plProp" : "plHoy";
    for (const [nomP, fs] of PERIODOS) {
      const si = fs.filter((f) => f[sig] === 1).map((f) => f[campo]);
      const no = fs.filter((f) => f[sig] === 0).map((f) => f[campo]);
      const t = tWelch(si, no);
      const pasa = Math.abs(t) >= LISTON && si.length >= 30;
      tabla.push({ sig, gid, nomP, t, n: si.length, mSi: media(si), mNo: media(no) });
      console.log("| " + nomSig + " | " + nomG + " | " + nomP + " | " + si.length + " | " + eur(media(si)) +
        " | " + eur(media(no)) + " | " + eur(media(si) - media(no)) + " | **" + t.toFixed(2) + "** | " + (pasa ? "🟢 SÍ" : "no") + " |");
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4 · LA SIMULACIÓN — apagar y encender, con la caja real
// ═════════════════════════════════════════════════════════════════════════════════════════════
function bloque(gid, nomG, campo) {
  console.log("\n" + "═".repeat(100));
  console.log("  4 · " + nomG + " · 1 contrato · colateral " + eur(media(filas.map((f) => f[gid === "s0.80_a30" ? "colProp" : "colHoy"]))));
  console.log("═".repeat(100));

  const base = correr(filas, campo, SIEMPRE(filas.length), 1);
  const sFin = correr(filas, campo, desde(filas, "finMes"), 1);
  const sMA = correr(filas, campo, desde(filas, "bajoMA"), 1);
  const mitad = correr(filas, campo, SIEMPRE(filas.length), 0.5);

  console.log("\n| configuración | días ON | $/año NETO | caída máx | % cuenta | peor día | ES5 | acierto | meses apagado | cambios estado | caja mín | llamada |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
  const fila = (nom, r) => console.log("| " + nom + " | " + r.nOp + " | **" + eur(r.anual) + "** | " + eur(r.dd) + " | " +
    r.ddPct.toFixed(1) + "% | " + eur(r.peorDia) + " | " + eur(r.es5) + " | " + r.acierto.toFixed(1) + "% | " +
    r.mesesApagados + "/" + r.mesesTotal + " | " + r.cambios + " | " + eur(r.minCaja) + " | " + (r.llamada || "no") + " |");
  fila("SIEMPRE ENCENDIDO (1 contrato)", base);
  fila("S1 · apagar finMes", sFin);
  fila("S2 · apagar bajo MA20 y MA50", sMA);
  fila("TAMAÑO · la MITAD siempre (0,5)", mitad);

  // ── control 1 · AZAR: apagar los MISMOS días al azar, 500 sorteos ──────────────────────────
  console.log("\n### CONTROL 1 · AZAR — apagar el MISMO número de días, sorteados (" + SORTEOS + " sorteos)\n");
  console.log("| señal | días apagados | $/año de la SEÑAL | azar p5 | azar mediana | azar p95 | percentil de la señal | caída señal | caída azar mediana |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  const azar = {};
  for (const [sig, r] of [["finMes", sFin], ["bajoMA", sMA]]) {
    const k = r.nOff, anuales = [], ddes = [];
    let rng = 20260820;                                     // semilla fija: reproducible
    const rnd = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
    for (let s = 0; s < SORTEOS; s++) {
      const idx = [...filas.keys()];
      for (let i = idx.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
      const off = new Array(filas.length).fill(0);
      for (let i = 0; i < k; i++) off[idx[i]] = 1;
      const rr = correr(filas, campo, off, 1);
      anuales.push(rr.anual); ddes.push(rr.dd);
    }
    const perc = anuales.filter((x) => x < r.anual).length / anuales.length * 100;
    azar[sig] = { anuales, ddes, perc };
    console.log("| " + sig + " | " + k + " | **" + eur(r.anual) + "** | " + eur(pctl(anuales, 0.05)) + " | " +
      eur(pctl(anuales, 0.50)) + " | " + eur(pctl(anuales, 0.95)) + " | **" + perc.toFixed(0) + "%** | " +
      eur(r.dd) + " | " + eur(pctl(ddes, 0.50)) + " |");
  }

  // ── control 2 · TAMAÑO: la curva entera, y el tamaño que iguala riesgo/exposición ──────────
  console.log("\n### CONTROL 2 · TAMAÑO — operar SIEMPRE con menos contratos\n");
  console.log("| contratos | $/año NETO | caída máx | % cuenta | peor día | ES5 |");
  console.log("|---|---|---|---|---|---|");
  for (const m of [1, 0.9, 0.75, 0.5, 0.25]) {
    const r = correr(filas, campo, SIEMPRE(filas.length), m);
    console.log("| " + m.toFixed(2) + " | " + eur(r.anual) + " | " + eur(r.dd) + " | " + r.ddPct.toFixed(1) + "% | " + eur(r.peorDia) + " | " + eur(r.es5) + " |");
  }

  // el tamaño que iguala la CAÍDA de cada señal, y el que iguala la EXPOSICIÓN
  const igualarDD = (objetivo) => { let mejor = 0, res = null; for (let m = 0.01; m <= 1.5001; m += 0.01) { const r = correr(filas, campo, SIEMPRE(filas.length), m); if (Math.abs(r.dd) <= Math.abs(objetivo) && m > mejor) { mejor = m; res = r; } } return { m: mejor, r: res }; };
  console.log("\n### EL CARA A CARA — la señal contra el MISMO riesgo comprado con tamaño\n");
  console.log("| señal | $/año señal | caída señal | tamaño que iguala esa caída | $/año de ese tamaño | **quién gana** | tamaño que iguala EXPOSICIÓN | $/año |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const [sig, r] of [["finMes", sFin], ["bajoMA", sMA]]) {
    const g = igualarDD(r.dd);
    const mExp = r.nOp / filas.length;
    const rExp = correr(filas, campo, SIEMPRE(filas.length), mExp);
    const gana = r.anual > (g.r ? g.r.anual : -Infinity) ? "**SEÑAL**" : "tamaño";
    console.log("| " + sig + " | " + eur(r.anual) + " | " + eur(r.dd) + " | " + g.m.toFixed(2) + " contratos | " +
      (g.r ? eur(g.r.anual) : "—") + " | " + gana + " | " + mExp.toFixed(3) + " | " + eur(rExp.anual) + " |");
  }

  // ── control 3 · ROTACIÓN del calendario (sólo finMes: conserva "1 día suelto al mes") ──────
  console.log("\n### CONTROL 3 · ROTACIÓN — mover el día apagado ±k sesiones (conserva 1 día/mes, rompe 'el último')\n");
  const rot = [];
  for (let k = -10; k <= 10; k++) {
    if (k === 0) continue;
    const off = new Array(filas.length).fill(0);
    for (let i = 0; i < filas.length; i++) if (filas[i].finMes) { const j = i + k; if (j >= 0 && j < filas.length) off[j] = 1; }
    rot.push({ k, anual: correr(filas, campo, off, 1).anual });
  }
  const rAn = rot.map((x) => x.anual);
  const mejorK = rot.slice().sort((a, b) => b.anual - a.anual)[0];
  console.log("   finMes real (k=0): **" + eur(sFin.anual) + "**  ·  de los 20 desplazamientos: p5 " + eur(pctl(rAn, 0.05)) +
    " · mediana " + eur(pctl(rAn, 0.50)) + " · p95 " + eur(pctl(rAn, 0.95)) + " · mejor k=" + mejorK.k + " → " + eur(mejorK.anual));
  console.log("   desplazamientos que BATEN al día real: " + rAn.filter((x) => x > sFin.anual).length + " de 20");

  // ── la regla de hierro · las dos mitades ──────────────────────────────────────────────────
  console.log("\n### LA REGLA DE HIERRO — la MISMA regla en las dos mitades, sin tocar nada\n");
  console.log("| período | base $/año | finMes $/año | ganancia finMes | bajoMA $/año | ganancia bajoMA | mitad tamaño $/año |");
  console.log("|---|---|---|---|---|---|---|");
  const porPeriodo = {};
  for (const [nomP, fs] of PERIODOS) {
    const b = correr(fs, campo, SIEMPRE(fs.length), 1);
    const f1 = correr(fs, campo, desde(fs, "finMes"), 1);
    const f2 = correr(fs, campo, desde(fs, "bajoMA"), 1);
    const mh = correr(fs, campo, SIEMPRE(fs.length), 0.5);
    porPeriodo[nomP] = { b, f1, f2, mh };
    console.log("| " + nomP + " | " + eur(b.anual) + " | " + eur(f1.anual) + " | **" + eur(f1.anual - b.anual) +
      "** | " + eur(f2.anual) + " | **" + eur(f2.anual - b.anual) + "** | " + eur(mh.anual) + " |");
  }
  // año a año
  console.log("\n| año | días | base $/año | finMes | bajoMA | mitad tamaño | caída base | caída finMes | caída bajoMA |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const a of [...new Set(filas.map((f) => f.ano))].sort()) {
    const fs = filas.filter((f) => f.ano === a);
    if (fs.length < 20) continue;
    const b = correr(fs, campo, SIEMPRE(fs.length), 1);
    const f1 = correr(fs, campo, desde(fs, "finMes"), 1);
    const f2 = correr(fs, campo, desde(fs, "bajoMA"), 1);
    const mh = correr(fs, campo, SIEMPRE(fs.length), 0.5);
    console.log("| " + a + " | " + fs.length + " | " + eur(b.anual) + " | " + eur(f1.anual) + " | " + eur(f2.anual) +
      " | " + eur(mh.anual) + " | " + eur(b.dd) + " | " + eur(f1.dd) + " | " + eur(f2.dd) + " |");
  }
  return { base, sFin, sMA, mitad, azar, porPeriodo };
}

const RES = {};
for (const [gid, nomG] of GEOM) RES[gid] = bloque(gid, nomG, gid === "s0.80_a30" ? "plProp" : "plHoy");

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5 · VEREDICTO
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log("  VEREDICTO");
console.log("═".repeat(100));
for (const [gid, nomG] of GEOM) {
  const R = RES[gid];
  console.log("\n" + nomG);
  for (const [sig, r] of [["finMes", R.sFin], ["bajoMA", R.sMA]]) {
    const ganaAzar = R.azar[sig].perc >= 95;
    const ganaMitad = r.anual > R.mitad.anual;
    console.log("  " + sig.padEnd(7) + " · $/año " + eur(r.anual).padStart(9) + " (base " + eur(R.base.anual) +
      ", mitad " + eur(R.mitad.anual) + ")  ·  percentil vs azar " + R.azar[sig].perc.toFixed(0) + "%" +
      "  ·  ¿bate al azar? " + (ganaAzar ? "SÍ" : "NO") + "  ·  ¿bate a menos tamaño? " + (ganaMitad ? "SÍ" : "NO"));
  }
}
console.log("\n  (todo con precios reales: bid al vender, ask al comprar, 8 patas de comisión a $0,03)");
