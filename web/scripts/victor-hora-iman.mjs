// ═══════════════════════════════════════════════════════════════════════════════════════════
// VICTOR · ¿CUÁNDO ACTÚAN LOS NIVELES?  —  la pregunta de la HORA
//
// Victor dice que hace day trading de SPX con el GEX usado como NIVELES DE PRECIO.
// Esta pieza NO pregunta si se gana dinero. Pregunta una sola cosa, y con reloj:
//
//     ¿el precio se ACERCA al imán según avanza la sesión, más de lo que se acercaría
//      a una línea puesta al azar a la misma distancia?  ¿y a qué HORA pasa eso?
//
// Momento de decisión: 09:35 (la barra de 09:30 tiene underlying_price = 0 en estos
// ficheros: la cadena aún no ha cotizado). Niveles construidos con el OI de AYER.
//
// EL CONTROL ES LO QUE DECIDE. Tres, y cada uno tapa un agujero distinto:
//   C1 ESPEJO       — mismo |distancia| exacto, signo al azar. Distancia pareada día a día.
//   C2 PERMUTACIÓN  — la distancia de OTRO día, pegada a la MISMA rejilla de strikes.
//   C3 REDONDO      — el múltiplo de 25 más cercano a la apertura. Sin nada de gamma dentro.
//                     Si el imán no le gana a esto, lo que actúa es el número redondo.
//
// PARTIR LA MUESTRA: 2022-2023 contra 2024-2026, y se exige el mismo signo en las DOS.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const NIVELES = path.join(AQUI, "gex-niveles.json");
// La entrada era un CSV de un directorio temporal de sesión, que ya no existe. Se pide
// por variable de entorno y se falla claro: una ruta muerta escrita dentro sólo sirve
// para que el script se caiga leyendo un sitio que nadie va a reconocer.
const CAMINO = process.env.CAMINO_5MIN;
if (!CAMINO) throw new Error("Falta CAMINO_5MIN: la ruta al CSV de camino de 5 minutos.");
const SALIDA = path.join(AQUI, "victor-hora-iman.json");

const SORTEOS = 500;
// Nº de pruebas declaradas para el listón de Bonferroni. Se cuenta ARRIBA, no abajo:
// 5 niveles × 13 medias horas × 3 controles ≈ 195. Se declara 200.
const PRUEBAS = 200;
const LISTON = listonT(PRUEBAS);

// ── utilidades ────────────────────────────────────────────────────────────────────────────
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => {
  if (v.length < 2) return 0;
  const m = media(v);
  return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1);
};
/** t pareado: una muestra de diferencias contra cero. */
const tPareado = (dif) => {
  if (dif.length < 3) return 0;
  const s = Math.sqrt(varianza(dif) / dif.length);
  return s > 0 ? media(dif) / s : 0;
};
const q = (v, p) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "  n/d");
const pct = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "n/d");

/** Generador reproducible. Un sorteo que no se puede repetir no es un control. */
function rng(semilla) {
  let s = semilla >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// ═══ 1. CARGA ════════════════════════════════════════════════════════════════════════════
console.log("═".repeat(95));
console.log("VICTOR · ¿CUÁNDO ACTÚAN LOS NIVELES?  —  distancia al imán media hora a media hora");
console.log("═".repeat(95));

const raw = JSON.parse(fs.readFileSync(NIVELES, "utf8"));
const filas = raw.filas;
console.log(`\nniveles: ${filas.length} días · ${filas[0].fecha} → ${filas.at(-1).fecha} · hora de decisión ${raw.hora}`);

// camino de 5 minutos: fecha → [ [hhmm, precio], ... ]
const camino = new Map();
for (const linea of fs.readFileSync(CAMINO, "utf8").split("\n")) {
  if (!linea) continue;
  const [fecha, ts, p] = linea.split(",");
  const precio = Number(p);
  // la barra de 09:30 viene con underlying_price = 0: la cadena aún no cotiza. NO se rellena.
  if (!Number.isFinite(precio) || precio <= 0) continue;
  const hhmm = ts.slice(11, 16); // string, NUNCA Date: en Windows Date convierte a UTC sin avisar
  if (!camino.has(fecha)) camino.set(fecha, []);
  camino.get(fecha).push([hhmm, precio]);
}
console.log(`camino 5 min: ${camino.size} días · ${[...camino.values()][0].length} barras/día`);

// ═══ 2. VALIDACIÓN CRUZADA — el camino que extraje contra el que guardó el constructor ═══
let maxDif = 0, comparados = 0, sinCamino = 0;
for (const f of filas) {
  const c = camino.get(f.fecha);
  if (!c) { sinCamino++; continue; }
  const mapa = new Map(c);
  for (const [h, p] of f.cada30) {
    const mio = mapa.get(h);
    if (mio == null) { maxDif = Infinity; continue; }
    maxDif = Math.max(maxDif, Math.abs(mio - p));
    comparados++;
  }
  const ap = mapa.get("09:35");
  if (ap != null) maxDif = Math.max(maxDif, Math.abs(ap - f.apertura));
}
console.log(`\n── validación cruzada ──`);
console.log(`  ${comparados} puntos comparados contra cada30 + apertura · diferencia máxima ${maxDif.toFixed(6)} · días sin camino ${sinCamino}`);
if (maxDif > 0.005) throw new Error(`el camino de 5 min NO cuadra con gex-niveles.json (dif ${maxDif}). Se para aquí.`);
console.log(`  ✓ el camino de 5 min y los niveles son la MISMA serie.`);

// ═══ 3. RADIOGRAFÍA ══════════════════════════════════════════════════════════════════════
const HORAS = ["09:35", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"];

const dias = [];
for (const f of filas) {
  const c = camino.get(f.fecha);
  if (!c) continue;
  const mapa = new Map(c);
  const P = HORAS.map((h) => mapa.get(h));
  if (P.some((x) => x == null)) continue;
  // extremos reales de cada media hora, con las 5 barras de dentro (para los TOQUES)
  const idx = c.map(([h]) => h);
  const tramos = [];
  for (let k = 1; k < HORAS.length; k++) {
    const a = idx.indexOf(HORAS[k - 1]), b = idx.indexOf(HORAS[k]);
    const trozo = c.slice(a, b + 1).map((x) => x[1]);
    tramos.push({ max: Math.max(...trozo), min: Math.min(...trozo) });
  }
  dias.push({
    fecha: f.fecha,
    anio: Number(f.fecha.slice(0, 4)),
    apertura: f.apertura,
    P,
    tramos,
    rango: f.maxMuestreado - f.minMuestreado,
    niveles: {
      gam: f.niveles.gam.imanBruto,
      gamNeto: f.niveles.gam.imanNeto,
      gamD: f.niveles.gamD.imanBruto,
      oi: f.niveles.oi.imanBruto,
      maxPain: f.maxPain,
    },
    muroCallGamD: f.niveles.gamD.muroCall,
    muroPutGamD: f.niveles.gamD.muroPut,
  });
}
console.log(`\ndías utilizables: ${dias.length} de ${filas.length}`);

radiografia(
  dias.map((d) => ({
    apertura: d.apertura,
    cierre: d.P.at(-1),
    rango: d.rango,
    dGam: d.niveles.gam - d.apertura,
    dGamD: d.niveles.gamD - d.apertura,
    dOi: d.niveles.oi - d.apertura,
    dMaxPain: d.niveles.maxPain - d.apertura,
    movMedio: Math.abs(d.P.at(-1) - d.apertura),
  })),
  ["apertura", "cierre", "rango", "dGam", "dGamD", "dOi", "dMaxPain", "movMedio"],
  "días para la pregunta de la hora",
);

// ═══ 4. CONSTRUCCIÓN DE LOS CONTROLES ════════════════════════════════════════════════════
/** paso de rejilla del nivel real de ese día: si es múltiplo de 25, el control también. */
const paso = (N) => (N % 25 === 0 ? 25 : 5);
const pegar = (x, p) => Math.round(x / p) * p;

/**
 * Devuelve, para un nivel, las tres familias de control ya sorteadas.
 *   C1 espejo      · apertura − d      (mismo |d| exacto, signo al azar por sorteo)
 *   C2 permutación · apertura + d_otro (distancia de otro día, pegada a la misma rejilla)
 *   C3 redondo     · múltiplo de 25 más cercano a la apertura (sin gamma dentro)
 */
function controles(sub, nivelDe, semilla) {
  const d0 = sub.map((d) => nivelDe(d) - d.apertura);
  const r = rng(semilla);

  const c1 = [];   // [sorteo][dia]
  for (let s = 0; s < SORTEOS; s++) {
    c1.push(sub.map((d, i) => (r() < 0.5 ? nivelDe(d) : d.apertura - d0[i])));
  }
  const c2 = [];
  for (let s = 0; s < SORTEOS; s++) {
    const orden = d0.map((_, i) => i);
    for (let i = orden.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [orden[i], orden[j]] = [orden[j], orden[i]]; }
    c2.push(sub.map((d, i) => pegar(d.apertura + d0[orden[i]], paso(nivelDe(d)))));
  }
  const c3 = sub.map((d) => pegar(d.apertura, 25));
  return { c1, c2, c3, d0 };
}

// ═══ 5. LA MEDICIÓN ══════════════════════════════════════════════════════════════════════
/**
 * Para un nivel y un subconjunto de días devuelve, hora a hora:
 *   real     — distancia media |precio − nivel|
 *   c1,c2,c3 — lo mismo con cada control
 *   ventaja  — control − real  (POSITIVO = el nivel atrae más que el azar)
 *   pctl     — % de los 500 sorteos en los que el control queda MÁS LEJOS que el real
 *   t        — t pareado día a día de (control − real)
 */
function medir(sub, nivelDe, semilla) {
  const { c1, c2, c3 } = controles(sub, nivelDe, semilla);
  const N = sub.map(nivelDe);
  const out = [];

  for (let h = 0; h < HORAS.length; h++) {
    const real = sub.map((d, i) => Math.abs(d.P[h] - N[i]));
    const mReal = media(real);

    const fila = { hora: HORAS[h], real: mReal, n: sub.length };
    for (const [nom, sorteos] of [["c1", c1], ["c2", c2]]) {
      const medias = sorteos.map((lv) => media(sub.map((d, i) => Math.abs(d.P[h] - lv[i]))));
      // media por día sobre los 500 sorteos → t pareado
      const porDia = sub.map((d, i) => media(sorteos.map((lv) => Math.abs(d.P[h] - lv[i]))));
      const dif = porDia.map((x, i) => x - real[i]);
      fila[nom] = media(medias);
      fila[nom + "Vent"] = media(medias) - mReal;
      fila[nom + "Pctl"] = medias.filter((x) => x > mReal).length / medias.length;
      fila[nom + "T"] = tPareado(dif);
    }
    const c3d = sub.map((d, i) => Math.abs(d.P[h] - c3[i]));
    fila.c3 = media(c3d);
    fila.c3Vent = media(c3d) - mReal;
    fila.c3T = tPareado(c3d.map((x, i) => x - real[i]));
    out.push(fila);
  }
  return out;
}

const NIVELES_A_MEDIR = [
  ["gam (T real 0DTE)", (d) => d.niveles.gam],
  ["gamD (T de 1 día)", (d) => d.niveles.gamD],
  ["oi puro", (d) => d.niveles.oi],
  ["max pain", (d) => d.niveles.maxPain],
];

const PERIODOS = [
  ["TODO 2022-2026", (d) => true],
  ["A · 2022-2023", (d) => d.anio <= 2023],
  ["B · 2024-2026", (d) => d.anio >= 2024],
];

const resultado = { generado: new Date().toISOString(), sorteos: SORTEOS, pruebas: PRUEBAS, liston: LISTON, horas: HORAS, niveles: {} };

console.log(`\nlistón de Bonferroni con ${PRUEBAS} pruebas declaradas: |t| ≥ ${LISTON}`);

for (const [nom, fn] of NIVELES_A_MEDIR) {
  console.log("\n" + "═".repeat(95));
  console.log(`IMÁN · ${nom}`);
  console.log("═".repeat(95));
  resultado.niveles[nom] = {};

  for (const [pn, filtro] of PERIODOS) {
    const sub = dias.filter(filtro);
    const m = medir(sub, fn, 20260820);
    resultado.niveles[nom][pn] = m;

    console.log(`\n  ── ${pn} · n=${sub.length} días ──`);
    console.log("     hora   |  real  |  C1 espejo         |  C2 permutación     |  C3 redondo");
    console.log("            |  dist  |  dist  vent  %sort |  dist  vent  %sort  |  dist  vent");
    console.log("     " + "-".repeat(84));
    for (const f of m) {
      console.log(
        `     ${f.hora}  | ${f2(f.real).padStart(6)} | ${f2(f.c1).padStart(6)} ${f2(f.c1Vent).padStart(6)} ${pct(f.c1Pctl).padStart(6)} |` +
        ` ${f2(f.c2).padStart(6)} ${f2(f.c2Vent).padStart(6)} ${pct(f.c2Pctl).padStart(6)} |` +
        ` ${f2(f.c3).padStart(6)} ${f2(f.c3Vent).padStart(6)}`,
      );
    }
    const fin = m.at(-1), ini = m[0];
    console.log(`     ventaja NETA construida de 09:35 a 16:00 (C1): ${f2(fin.c1Vent - ini.c1Vent)} pts · t pareado al cierre ${f2(fin.c1T)} (listón ${LISTON})`);
    console.log(`                                            (C2): ${f2(fin.c2Vent - ini.c2Vent)} pts · t pareado al cierre ${f2(fin.c2T)}`);
  }
}

fs.writeFileSync(SALIDA, JSON.stringify(resultado, null, 1));
console.log(`\n→ ${SALIDA}`);
