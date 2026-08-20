// ═══════════════════════════════════════════════════════════════════════════════════════════
//  ¿CUÁNDO ACTÚAN LOS NIVELES DE GEX?  —  la pregunta de la HORA
//
//  No es "¿opero hoy?" (eso ya se midió dos veces y no separa). Es: el imán / los muros /
//  el punto de giro, ¿tiran del precio? y si tiran, ¿A QUÉ HORA?
//
//  Todo se calcula a las 09:35 con el OI sellado ANTES de la apertura. Cero futuro.
//  El que decide es el CONTROL: 500 sorteos de niveles aleatorios A LA MISMA DISTANCIA.
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
const CORTE = "2024-01-01";
const rnd = (() => { let s = 20260820; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();

// ── 1. FILAS ────────────────────────────────────────────────────────────────────────────
const NIVELES = [
  ["gam.iman",      (f) => f.niveles.gam.imanBruto],
  ["gam.muroCall",  (f) => f.niveles.gam.muroCall],
  ["gam.muroPut",   (f) => f.niveles.gam.muroPut],
  ["gam.giro",      (f) => f.niveles.gam.flip],
  ["gamD.iman",     (f) => f.niveles.gamD.imanBruto],
  ["gamD.muroCall", (f) => f.niveles.gamD.muroCall],
  ["gamD.muroPut",  (f) => f.niveles.gamD.muroPut],
  ["gamD.giro",     (f) => f.niveles.gamD.flip],
  ["oi.iman",       (f) => f.niveles.oi.imanBruto],
  ["oi.muroCall",   (f) => f.niveles.oi.muroCall],
  ["oi.muroPut",    (f) => f.niveles.oi.muroPut],
  ["maxPain",       (f) => f.maxPain],
];

const filas = [];
for (const f of F.filas) {
  const c = CAM[f.fecha];
  if (!c) continue;
  const m = new Map(c);
  const p = MARCAS.map((h) => m.get(h));
  if (p.some((x) => !(x > 0))) continue;
  const cam5 = c.filter(([h]) => h >= "09:35");
  filas.push({
    fecha: f.fecha, apertura: f.apertura, p, cam5,
    rangoPct: f.rangoPct, netPunto: f.niveles.gam.netPunto, peaje: f.peaje,
    razonSPX: f.spy ? f.spy.razonSPX : null,
    off: Object.fromEntries(NIVELES.map(([n, g]) => {
      const L = g(f);
      return [n, L == null ? null : (100 * (L - f.apertura)) / f.apertura];
    })),
  });
}
console.log(`Dias con niveles Y camino de 5 min: ${filas.length} de ${F.filas.length}`);
console.log(`Marcas: ${MARCAS[0]} -> ${MARCAS[MARCAS.length - 1]} (${MARCAS.length} marcas, ${MARCAS.length - 1} tramos de media hora)`);
console.log(`Camino fino: ${filas[0].cam5.length} barras de 5 min por dia`);

// ── 2. RADIOGRAFÍA — antes de medir nada ────────────────────────────────────────────────
const rx = filas.map((f) => ({
  apertura: f.apertura, rangoPct: f.rangoPct, netPunto: f.netPunto,
  offGamIman: f.off["gam.iman"], offGamDIman: f.off["gamD.iman"],
  offOIIman: f.off["oi.iman"], offMaxPain: f.off["maxPain"],
  offGamGiro: f.off["gam.giro"], offGamMuroCall: f.off["gam.muroCall"],
  movDia: f.p[13] - f.p[0],
}));
radiografia(rx, ["apertura", "rangoPct", "netPunto", "offGamIman", "offGamDIman", "offOIIman",
                 "offMaxPain", "offGamGiro", "offGamMuroCall", "movDia"], "hora-niveles", { maxNulos: 0.02 });

// ── 3. HERRAMIENTAS ─────────────────────────────────────────────────────────────────────
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tPar = (v) => (v.length < 3 ? 0 : media(v) / (sd(v) / Math.sqrt(v.length)));
const barajar = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

/** Distancia |P(t) - L| en % de la apertura, a cada marca. */
function distancias(sub, offs) {
  return MARCAS.map((_, i) => media(sub.map((f, k) => Math.abs(100 * (f.p[i] - f.apertura) / f.apertura - offs[k]))));
}
/** TIRON: puntos de SPX que el precio recorre HACIA el nivel en cada tramo. */
function tirones(sub, offs) {
  const out = [];
  for (let b = 0; b < MARCAS.length - 1; b++) {
    const fila = new Array(sub.length);
    for (let k = 0; k < sub.length; k++) {
      const f = sub[k];
      const L = f.apertura * (1 + offs[k] / 100);
      const hueco = L - f.p[b];
      fila[k] = hueco === 0 ? 0 : (f.p[b + 1] - f.p[b]) * Math.sign(hueco);
    }
    out.push(fila);
  }
  return out; // [tramo][dia] en PUNTOS de SPX
}
/** Toque acumulado (%) del nivel a cada marca, con el camino de 5 min. */
function toques(sub, offs) {
  const acum = new Array(MARCAS.length).fill(0);
  for (let k = 0; k < sub.length; k++) {
    const f = sub[k];
    const L = f.apertura * (1 + offs[k] / 100);
    const arriba = L > f.p[0];
    let idx = -1;
    for (let i = 0; i < f.cam5.length; i++) {
      const h = f.cam5[i][0], v = f.cam5[i][1];
      if ((arriba && v >= L) || (!arriba && v <= L)) {
        idx = MARCAS.findIndex((m) => m >= h);
        break;
      }
    }
    if (idx >= 0) for (let i = idx; i < MARCAS.length; i++) acum[i]++;
  }
  return acum.map((x) => (100 * x) / sub.length);
}

/** El control: SORTEOS barajadas de los DESPLAZAMIENTOS entre dias (misma distancia, otro dia). */
function control(sub, offs, fn, dentroDeMes = false) {
  const draws = [];
  const grupos = new Map();
  if (dentroDeMes) sub.forEach((f, k) => { const m = f.fecha.slice(0, 7); if (!grupos.has(m)) grupos.set(m, []); grupos.get(m).push(k); });
  for (let s = 0; s < SORTEOS; s++) {
    let o;
    if (dentroDeMes) {
      o = new Array(sub.length);
      for (const idx of grupos.values()) { const bar = barajar(idx); idx.forEach((k, i) => { o[k] = offs[bar[i]]; }); }
    } else {
      o = barajar(offs);
    }
    draws.push(fn(sub, o));
  }
  return draws;
}
const pctilMenor = (real, draws) => (100 * draws.filter((d) => d <= real).length) / draws.length;

// ── 4. LA MEDICION ──────────────────────────────────────────────────────────────────────
const A = filas.filter((f) => f.fecha < CORTE);
const B = filas.filter((f) => f.fecha >= CORTE);
console.log(`\nParticion: 2022-2023 n=${A.length} - 2024-2026 n=${B.length}`);

const PRUEBAS = NIVELES.length * (MARCAS.length - 1); // 12 niveles x 13 tramos
const LISTON = listonT(PRUEBAS);
console.log(`Pruebas declaradas: ${PRUEBAS} - liston de Bonferroni |t| >= ${LISTON}\n`);

const resultado = {
  generado: new Date().toISOString(), n: filas.length, nA: A.length, nB: B.length,
  marcas: MARCAS, sorteos: SORTEOS, pruebas: PRUEBAS, liston: LISTON, niveles: {},
};

for (const [nombre] of NIVELES) {
  const sub = filas.filter((f) => f.off[nombre] != null);
  if (sub.length < 200) { console.log(`${nombre}: solo ${sub.length} dias con nivel - se salta`); continue; }
  const offs = sub.map((f) => f.off[nombre]);

  const dReal = distancias(sub, offs);
  const dCtrl = control(sub, offs, distancias);
  const dCtrlMedia = MARCAS.map((_, i) => media(dCtrl.map((d) => d[i])));
  const dPctil = MARCAS.map((_, i) => pctilMenor(dReal[i], dCtrl.map((d) => d[i])));

  const tReal = tirones(sub, offs);
  const tCtrlDraws = control(sub, offs, tirones);
  const tCtrlDia = tReal.map((_, b) => sub.map((_, k) => media(tCtrlDraws.map((d) => d[b][k]))));
  const tReales = tReal.map(media);
  const tCtrlAgg = tCtrlDraws.map((d) => d.map(media));
  const tPctil = tReal.map((_, b) => 100 - pctilMenor(tReales[b], tCtrlAgg.map((d) => d[b])));
  const tDif = tReal.map((v, b) => v.map((x, k) => x - tCtrlDia[b][k]));
  const tStat = tDif.map(tPar);

  const toqReal = toques(sub, offs);
  const toqCtrl = control(sub, offs, toques);
  const toqCtrlMedia = MARCAS.map((_, i) => media(toqCtrl.map((d) => d[i])));

  const hueco = MARCAS.slice(0, -1).map((_, b) => media(sub.map((f, k) => Math.abs(f.apertura * (1 + offs[k] / 100) - f.p[b]))));

  resultado.niveles[nombre] = {
    n: sub.length,
    offAbsP50: (() => { const s = offs.map(Math.abs).sort((a, b) => a - b); return +s[Math.floor(s.length / 2)].toFixed(4); })(),
    dist: { real: dReal.map((x) => +x.toFixed(4)), ctrl: dCtrlMedia.map((x) => +x.toFixed(4)), pctil: dPctil.map((x) => +x.toFixed(1)) },
    tiron: {
      real: tReales.map((x) => +x.toFixed(4)), ctrl: tCtrlDia.map(media).map((x) => +x.toFixed(4)),
      dif: tDif.map(media).map((x) => +x.toFixed(4)), t: tStat.map((x) => +x.toFixed(2)), pctil: tPctil.map((x) => +x.toFixed(1)),
    },
    toque: { real: toqReal.map((x) => +x.toFixed(1)), ctrl: toqCtrlMedia.map((x) => +x.toFixed(1)) },
    hueco: hueco.map((x) => +x.toFixed(1)),
  };

  const R = resultado.niveles[nombre];
  console.log(`\n== ${nombre} ==  n=${sub.length}  |offset| p50 = ${R.offAbsP50}%`);
  console.log(`  DISTANCIA al nivel (% de la apertura). pctl bajo = MAS CERCA que el azar`);
  console.log(`       ${MARCAS.map((m) => m.padStart(7)).join("")}`);
  console.log(`  real ${dReal.map((x) => x.toFixed(3).padStart(7)).join("")}`);
  console.log(`  azar ${dCtrlMedia.map((x) => x.toFixed(3).padStart(7)).join("")}`);
  console.log(`  pctl ${dPctil.map((x) => x.toFixed(0).padStart(7)).join("")}`);
  console.log(`  TIRON por tramo (puntos de SPX hacia el nivel)`);
  console.log(`       ${MARCAS.slice(0, -1).map((m) => m.padStart(7)).join("")}`);
  console.log(`  real ${tReales.map((x) => x.toFixed(2).padStart(7)).join("")}`);
  console.log(`  dif  ${tDif.map(media).map((x) => x.toFixed(2).padStart(7)).join("")}`);
  console.log(`  t    ${tStat.map((x) => x.toFixed(2).padStart(7)).join("")}`);
  console.log(`  hueco${hueco.map((x) => x.toFixed(0).padStart(7)).join("")}`);
  console.log(`  TOQUE % real ${toqReal.map((x) => x.toFixed(0)).join("/")}`);
  console.log(`  TOQUE % azar ${toqCtrlMedia.map((x) => x.toFixed(0)).join("/")}`);
}

fs.writeFileSync(path.join(DIR, "hora-niveles.json"), JSON.stringify(resultado, null, 1));
console.log(`\n-> ${path.join(DIR, "hora-niveles.json")}`);
