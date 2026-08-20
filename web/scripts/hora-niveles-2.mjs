// ═══════════════════════════════════════════════════════════════════════════════════════════
//  ¿CUANDO ACTUAN LOS NIVELES?  —  version 2, con el CONTROL ARREGLADO
//
//  La v1 barajaba los desplazamientos entre TODOS los dias. Eso esta MAL y lo dice el dato:
//     corr( |distancia del iman a la apertura| , rango del dia ) = +0,38 (gam) / +0,48 (muros)
//     quintil de |off| bajo -> el dia recorre 0,88%   |   quintil alto -> recorre 1,49%
//  Al barajar globalmente, a un dia CALMADO le cae un nivel LEJANO (y se queda lejos todo el
//  dia) y a un dia MOVIDO uno CERCANO (del que el precio se escapa). El control sale inflado
//  y el nivel real parece un iman sin serlo. La v1 media eso, no atraccion.
//
//  CONTROL BUENO (el que pide el encargo: "niveles aleatorios A LA MISMA DISTANCIA"):
//    · VIGESIMA — se baraja el desplazamiento SOLO entre dias del mismo vigesimil de |off|.
//                 Misma distancia (±1 vigesimil) y misma mezcla de lados => neutral a la deriva.
//    · ESPEJO   — el mismo dia, la misma distancia exacta, el lado contrario. Distancia clavada;
//                 sensible a la deriva intradia, por eso es el segundo y no el primero.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { radiografia } from "../lib/radiografia.ts";
import { listonT } from "../lib/barreraHallazgos.ts";

const DIR = import.meta.dirname;
const F = JSON.parse(fs.readFileSync(path.join(DIR, "gex-niveles.json"), "utf8"));
const CAM = JSON.parse(fs.readFileSync(path.join(DIR, "hora-camino5.json"), "utf8"));

const MARCAS = ["09:35", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
                "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"];
const SORTEOS = 500;
const GRUPOS = 20;          // vigesimiles de |off| para emparejar la distancia
const CORTE = "2024-01-01";
const rnd = (() => { let s = 20260820; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();

const NIVELES = [
  ["gam.iman", (f) => f.niveles.gam.imanBruto],
  ["gam.muroCall", (f) => f.niveles.gam.muroCall],
  ["gam.muroPut", (f) => f.niveles.gam.muroPut],
  ["gam.giro", (f) => f.niveles.gam.flip],
  ["gamD.iman", (f) => f.niveles.gamD.imanBruto],
  ["gamD.muroCall", (f) => f.niveles.gamD.muroCall],
  ["gamD.muroPut", (f) => f.niveles.gamD.muroPut],
  ["gamD.giro", (f) => f.niveles.gamD.flip],
  ["oi.iman", (f) => f.niveles.oi.imanBruto],
  ["oi.muroCall", (f) => f.niveles.oi.muroCall],
  ["oi.muroPut", (f) => f.niveles.oi.muroPut],
  ["maxPain", (f) => f.maxPain],
];

// ── filas ───────────────────────────────────────────────────────────────────────────────
const filas = [];
for (const f of F.filas) {
  const c = CAM[f.fecha];
  if (!c) continue;
  const m = new Map(c);
  const p = MARCAS.map((h) => m.get(h));
  if (p.some((x) => !(x > 0))) continue;
  filas.push({
    fecha: f.fecha, apertura: f.apertura, p,
    cam5: c.filter(([h]) => h >= "09:35"),
    rangoPct: f.rangoPct, netPunto: f.niveles.gam.netPunto, peaje: f.peaje,
    razonSPX: f.spy ? f.spy.razonSPX : null,
    off: Object.fromEntries(NIVELES.map(([n, g]) => {
      const L = g(f);
      return [n, L == null ? null : (100 * (L - f.apertura)) / f.apertura];
    })),
  });
}

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tPar = (v) => (v.length < 3 ? 0 : media(v) / (sd(v) / Math.sqrt(v.length)));
const barajar = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const cor = (a, b) => { const n = a.length, ma = media(a), mb = media(b); let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { const u = a[i] - ma, v = b[i] - mb; s += u * v; sa += u * u; sb += v * v; } return s / Math.sqrt(sa * sb); };

// ── radiografia ─────────────────────────────────────────────────────────────────────────
radiografia(filas.map((f) => ({
  apertura: f.apertura, rangoPct: f.rangoPct, netPunto: f.netPunto,
  offGamIman: f.off["gam.iman"], offGamDIman: f.off["gamD.iman"], offOIIman: f.off["oi.iman"],
  offMaxPain: f.off["maxPain"], offGamGiro: f.off["gam.giro"], movDia: f.p[13] - f.p[0],
})), ["apertura", "rangoPct", "netPunto", "offGamIman", "offGamDIman", "offOIIman", "offMaxPain", "offGamGiro", "movDia"],
  "hora-niveles-2", { maxNulos: 0.02 });

// ── el confundido, escrito con numeros ──────────────────────────────────────────────────
console.log("EL CONFUNDIDO QUE OBLIGA A EMPAREJAR LA DISTANCIA");
for (const [n] of NIVELES) {
  const s = filas.filter((f) => f.off[n] != null);
  console.log(`  corr(|off ${n}| , rango del dia) = ${cor(s.map((f) => Math.abs(f.off[n])), s.map((f) => f.rangoPct)).toFixed(3)}`);
}

// ── generadores de control ──────────────────────────────────────────────────────────────
/** Indices agrupados por vigesimil de |off|. */
function vigesimiles(offs) {
  const idx = [...offs.keys()].sort((a, b) => Math.abs(offs[a]) - Math.abs(offs[b]));
  const g = [];
  const k = Math.ceil(idx.length / GRUPOS);
  for (let i = 0; i < idx.length; i += k) g.push(idx.slice(i, i + k));
  return g;
}
function sorteoVigesimil(offs, grupos) {
  const o = new Array(offs.length);
  for (const idx of grupos) { const bar = barajar(idx); idx.forEach((k, i) => { o[k] = offs[bar[i]]; }); }
  return o;
}
/** Espejo aleatorio: cada dia conserva |off| y le cae un lado al azar. */
function sorteoEspejo(offs) {
  return offs.map((x) => (rnd() < 0.5 ? x : -x));
}

// ── medidas ─────────────────────────────────────────────────────────────────────────────
function distancias(sub, offs) {
  return MARCAS.map((_, i) => sub.map((f, k) => Math.abs(100 * (f.p[i] - f.apertura) / f.apertura - offs[k])));
}
function tirones(sub, offs) {
  const out = [];
  for (let b = 0; b < MARCAS.length - 1; b++) {
    const fila = new Array(sub.length);
    for (let k = 0; k < sub.length; k++) {
      const f = sub[k];
      const hueco = f.apertura * (1 + offs[k] / 100) - f.p[b];
      fila[k] = hueco === 0 ? 0 : (f.p[b + 1] - f.p[b]) * Math.sign(hueco);
    }
    out.push(fila);
  }
  return out;
}
function toques(sub, offs) {
  const out = MARCAS.map(() => new Array(sub.length).fill(0));
  for (let k = 0; k < sub.length; k++) {
    const f = sub[k];
    const L = f.apertura * (1 + offs[k] / 100);
    const arriba = L > f.p[0];
    for (let i = 0; i < f.cam5.length; i++) {
      const h = f.cam5[i][0], v = f.cam5[i][1];
      if ((arriba && v >= L) || (!arriba && v <= L)) {
        const j = MARCAS.findIndex((m) => m >= h);
        if (j >= 0) for (let x = j; x < MARCAS.length; x++) out[x][k] = 100;
        break;
      }
    }
  }
  return out;
}

/** Corre las tres medidas con un generador de offsets y devuelve la media por columna. */
function correr(sub, offs) {
  return {
    dist: distancias(sub, offs).map(media),
    tir: tirones(sub, offs).map(media),
    toq: toques(sub, offs).map(media),
  };
}

const PRUEBAS = NIVELES.length * (MARCAS.length - 1);
const LISTON = listonT(PRUEBAS);
const A = filas.filter((f) => f.fecha < CORTE);
const B = filas.filter((f) => f.fecha >= CORTE);
console.log(`\nn=${filas.length}  ·  2022-2023 n=${A.length}  ·  2024-2026 n=${B.length}`);
console.log(`Pruebas declaradas: ${PRUEBAS} · liston de Bonferroni |t| >= ${LISTON}`);
console.log(`Control: ${SORTEOS} sorteos · VIGESIMIL (${GRUPOS} grupos de |off|) y ESPEJO\n`);

const salida = { generado: new Date().toISOString(), n: filas.length, nA: A.length, nB: B.length, marcas: MARCAS, sorteos: SORTEOS, grupos: GRUPOS, pruebas: PRUEBAS, liston: LISTON, niveles: {} };

function analizar(sub, nombre, imprimir = true) {
  const offs = sub.map((f) => f.off[nombre]);
  const grupos = vigesimiles(offs);
  const real = correr(sub, offs);
  // por dia: distancia y tiron reales (para el t emparejado)
  const distRealDia = distancias(sub, offs);
  const tirRealDia = tirones(sub, offs);
  const toqRealDia = toques(sub, offs);

  // acumuladores del control por dia (media sobre sorteos)
  const acDist = MARCAS.map(() => new Array(sub.length).fill(0));
  const acTir = MARCAS.slice(0, -1).map(() => new Array(sub.length).fill(0));
  const acToq = MARCAS.map(() => new Array(sub.length).fill(0));
  const aggDist = [], aggTir = [], aggToq = [];
  const acDistE = MARCAS.map(() => new Array(sub.length).fill(0));
  const aggDistE = [];

  for (let s = 0; s < SORTEOS; s++) {
    const o = sorteoVigesimil(offs, grupos);
    const d = distancias(sub, o), t = tirones(sub, o), q = toques(sub, o);
    d.forEach((col, i) => col.forEach((v, k) => { acDist[i][k] += v / SORTEOS; }));
    t.forEach((col, i) => col.forEach((v, k) => { acTir[i][k] += v / SORTEOS; }));
    q.forEach((col, i) => col.forEach((v, k) => { acToq[i][k] += v / SORTEOS; }));
    aggDist.push(d.map(media)); aggTir.push(t.map(media)); aggToq.push(q.map(media));
    const oe = sorteoEspejo(offs);
    const de = distancias(sub, oe);
    de.forEach((col, i) => col.forEach((v, k) => { acDistE[i][k] += v / SORTEOS; }));
    aggDistE.push(de.map(media));
  }

  const pctilMenor = (r, col) => (100 * col.filter((x) => x <= r).length) / col.length;
  const pctilMayor = (r, col) => (100 * col.filter((x) => x >= r).length) / col.length;

  const R = {
    n: sub.length,
    offAbsP50: (() => { const s = offs.map(Math.abs).sort((a, b) => a - b); return +s[Math.floor(s.length / 2)].toFixed(4); })(),
    dist: {
      real: real.dist.map((x) => +x.toFixed(4)),
      vig: acDist.map(media).map((x) => +x.toFixed(4)),
      esp: acDistE.map(media).map((x) => +x.toFixed(4)),
      tVig: distRealDia.map((col, i) => +tPar(col.map((v, k) => acDist[i][k] - v)).toFixed(2)),  // >0 = real MAS CERCA
      tEsp: distRealDia.map((col, i) => +tPar(col.map((v, k) => acDistE[i][k] - v)).toFixed(2)),
      pctil: real.dist.map((r, i) => +pctilMenor(r, aggDist.map((d) => d[i])).toFixed(1)),
    },
    tiron: {
      real: real.tir.map((x) => +x.toFixed(4)),
      vig: acTir.map(media).map((x) => +x.toFixed(4)),
      t: tirRealDia.map((col, i) => +tPar(col.map((v, k) => v - acTir[i][k])).toFixed(2)),
      pctil: real.tir.map((r, i) => +pctilMayor(r, aggTir.map((d) => d[i])).toFixed(1)),
    },
    toque: {
      real: real.toq.map((x) => +x.toFixed(1)),
      vig: acToq.map(media).map((x) => +x.toFixed(1)),
      t: toqRealDia.map((col, i) => +tPar(col.map((v, k) => v - acToq[i][k])).toFixed(2)),
    },
    hueco: MARCAS.slice(0, -1).map((_, b) => +media(sub.map((f, k) => Math.abs(f.apertura * (1 + offs[k] / 100) - f.p[b]))).toFixed(1)),
  };

  if (imprimir) {
    console.log(`\n== ${nombre} ==  n=${sub.length}  |off| p50 = ${R.offAbsP50}%`);
    console.log(`       ${MARCAS.map((m) => m.padStart(7)).join("")}`);
    console.log(`  DISTANCIA (% apertura)`);
    console.log(`  real ${R.dist.real.map((x) => x.toFixed(3).padStart(7)).join("")}`);
    console.log(`  vige ${R.dist.vig.map((x) => x.toFixed(3).padStart(7)).join("")}`);
    console.log(`  espj ${R.dist.esp.map((x) => x.toFixed(3).padStart(7)).join("")}`);
    console.log(`  t(v) ${R.dist.tVig.map((x) => x.toFixed(2).padStart(7)).join("")}   (>0 = real MAS CERCA que el azar)`);
    console.log(`  t(e) ${R.dist.tEsp.map((x) => x.toFixed(2).padStart(7)).join("")}`);
    console.log(`  TOQUE acumulado %`);
    console.log(`  real ${R.toque.real.map((x) => x.toFixed(0).padStart(7)).join("")}`);
    console.log(`  vige ${R.toque.vig.map((x) => x.toFixed(0).padStart(7)).join("")}`);
    console.log(`  t    ${R.toque.t.map((x) => x.toFixed(2).padStart(7)).join("")}`);
    console.log(`  TIRON por tramo (puntos SPX hacia el nivel)`);
    console.log(`       ${MARCAS.slice(0, -1).map((m) => m.padStart(7)).join("")}`);
    console.log(`  real ${R.tiron.real.map((x) => x.toFixed(2).padStart(7)).join("")}`);
    console.log(`  vige ${R.tiron.vig.map((x) => x.toFixed(2).padStart(7)).join("")}`);
    console.log(`  t    ${R.tiron.t.map((x) => x.toFixed(2).padStart(7)).join("")}`);
    console.log(`  hueco${R.hueco.map((x) => x.toFixed(0).padStart(7)).join("")}`);
  }
  return R;
}

for (const [nombre] of NIVELES) {
  const sub = filas.filter((f) => f.off[nombre] != null);
  if (sub.length < 200) continue;
  salida.niveles[nombre] = { todo: analizar(sub, nombre) };
}

fs.writeFileSync(path.join(DIR, "hora-niveles-2.json"), JSON.stringify(salida, null, 1));
console.log(`\n-> ${path.join(DIR, "hora-niveles-2.json")}`);
