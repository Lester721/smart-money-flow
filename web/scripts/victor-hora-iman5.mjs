// ═══════════════════════════════════════════════════════════════════════════════════════════
// VICTOR · LA HORA — v5, LA PRUEBA QUE DECIDE
//
// EL PROBLEMA DE LAS v3/v4. La "convergencia de la tarde" se medía contra un nivel espejo
// anclado en la APERTURA. Pero por la mañana el precio se había ALEJADO del imán real (g era
// −1,62 a las 13:00). Que por la tarde vuelva puede ser magnetismo... o puede ser simple
// reversión: lo que se alejó, vuelve. Las dos cosas dan el mismo número.
//
// EL ARREGLO: anclar el control en el precio de la HORA DE ENTRADA, no en la apertura.
//
//     d = nivel − P(h0)          distancia con signo desde donde está el precio AHORA
//     espejo = P(h0) − d         la misma distancia, al otro lado, desde el mismo sitio
//     g = |P(16:00) − espejo| − |P(16:00) − nivel|
//
// Con x = P(16:00) − P(h0), sale g = 2·min(|x|,|d|)·signo(x·d). O sea que g > 0 significa,
// literalmente: EL PRECIO SE MOVIÓ HACIA EL NIVEL. Ya no hay historia previa dentro. Y deja
// de ser una medida de "distancia": es DIRECCIÓN, que es lo que sí se puede cobrar.
//
// EL CONTROL QUE DECIDE: si el mercado sube por la tarde y el imán suele estar arriba, g sale
// positiva sin ningún imán. Por eso el nulo baraja las distancias CON SIGNO entre días (en
// unidades del straddle): el nulo se queda con la deriva y se le quita el nivel. Si lo real
// no le gana al nulo, lo que hay es deriva.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CAMINO = path.join(
  "C:/Users/leste/AppData/Local/Temp/claude/C--Users-leste-OneDrive-Desktop-Agente-Tito-Metralleta",
  "296b4519-6df7-4f7a-9e53-fef3c87e134d/scratchpad/camino5min.csv",
);
const SORTEOS = 500, PRUEBAS = 200, LISTON = listonT(PRUEBAS);

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return 0; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const tP = (d) => { if (d.length < 3) return 0; const s = Math.sqrt(varianza(d) / d.length); return s > 0 ? media(d) / s : 0; };
const q = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : " n/d");
const pc = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "n/d");
function rng(s0) { let s = s0 >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const baraja = (n, r) => { const o = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };

const filasRaw = JSON.parse(fs.readFileSync(path.join(AQUI, "gex-niveles.json"), "utf8")).filas;
const camino = new Map();
for (const l of fs.readFileSync(CAMINO, "utf8").split("\n")) {
  if (!l) continue;
  const [fe, ts, p] = l.split(","); const v = Number(p);
  if (!Number.isFinite(v) || v <= 0) continue;
  if (!camino.has(fe)) camino.set(fe, []);
  camino.get(fe).push([ts.slice(11, 16), v]);
}
const dias = [];
for (const f of filasRaw) {
  const c = camino.get(f.fecha); if (!c || c.length < 70) continue;
  const idx = new Map(c.map(([h], i) => [h, i]));
  const p = f.peaje;
  const straddle = (p.callATM.bid + p.callATM.ask) / 2 + (p.putATM.bid + p.putATM.ask) / 2;
  if (!(straddle > 0)) continue;
  dias.push({
    fecha: f.fecha, anio: +f.fecha.slice(0, 4), A: f.apertura, px: c.map((x) => x[1]), idx, straddle,
    N: { gam: f.niveles.gam.imanBruto, gamD: f.niveles.gamD.imanBruto, oi: f.niveles.oi.imanBruto, maxPain: f.maxPain },
    muroC: f.niveles.gamD.muroCall, muroP: f.niveles.gamD.muroPut, peaje: p,
  });
}
const paso = (N) => (N % 25 === 0 ? 25 : 5);
const pegar = (x, pp) => Math.round(x / pp) * pp;
const P = (d, h) => d.px[d.idx.get(h)];

console.log("═".repeat(104));
console.log(`VICTOR · LA HORA — v5 · LA PRUEBA QUE DECIDE · n=${dias.length} días · ${SORTEOS} sorteos · listón |t| ≥ ${LISTON}`);
console.log("g > 0  =  desde la hora de entrada, el precio se movió HACIA el nivel (en puntos de SPX)");
console.log("═".repeat(104));

radiografia(
  dias.map((d) => ({
    straddle: d.straddle,
    dGamD13: d.N.gamD - P(d, "13:00"),
    dGam13: d.N.gam - P(d, "13:00"),
    mov13a16: P(d, "16:00") - P(d, "13:00"),
    mov1430a16: P(d, "16:00") - P(d, "14:30"),
  })),
  ["straddle", "dGamD13", "dGam13", "mov13a16", "mov1430a16"],
  "entradas de tarde",
);

const LENTES = [["gam  (T real 0DTE)", (d) => d.N.gam], ["gamD (T de 1 día)", (d) => d.N.gamD], ["oi   puro", (d) => d.N.oi], ["maxPain", (d) => d.N.maxPain]];
const PERIODOS = [["TODO", () => true], ["A·2022-23", (d) => d.anio <= 2023], ["B·2024-26", (d) => d.anio >= 2024]];
const HORAS_ENTRADA = ["11:00", "12:00", "13:00", "14:00", "14:30", "15:00", "15:30"];
const res = { generado: new Date().toISOString(), n: dias.length, liston: LISTON, sorteos: SORTEOS, tabla: {} };

/** g y su nulo, entrando a h0 y midiendo a las 16:00. */
function prueba(sub, nivelDe, h0, semilla, filtroD = null) {
  const r = rng(semilla);
  let usados = sub.map((d) => ({ d, N: nivelDe(d), p0: P(d, h0) }));
  usados = usados.map((u) => ({ ...u, dist: u.N - u.p0 }));
  if (filtroD) usados = usados.filter((u) => filtroD(Math.abs(u.dist), u.d));
  if (usados.length < 30) return null;

  const g = usados.map((u) => {
    const E = pegar(u.p0 - u.dist, paso(u.N));
    const pf = P(u.d, "16:00");
    return Math.abs(pf - E) - Math.abs(pf - u.N);
  });

  // NULO: mismas distancias con signo, en unidades del straddle, barajadas entre días.
  const rat = usados.map((u) => u.dist / u.d.straddle);
  const nulos = [];
  for (let s = 0; s < SORTEOS; s++) {
    const o = baraja(usados.length, r);
    nulos.push(media(usados.map((u, i) => {
      const Nn = pegar(u.p0 + rat[o[i]] * u.d.straddle, paso(u.N));
      const En = pegar(u.p0 - (Nn - u.p0), paso(u.N));
      const pf = P(u.d, "16:00");
      return Math.abs(pf - En) - Math.abs(pf - Nn);
    })));
  }
  const m = media(g);
  return { n: usados.length, g: m, t: tP(g), pctl: nulos.filter((x) => x < m).length / nulos.length, nuloMedio: media(nulos), distP50: q(usados.map((u) => Math.abs(u.dist)), 0.5) };
}

// ═══ 1 · LA TABLA PRINCIPAL ══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("1 · ¿SE MUEVE EL PRECIO HACIA EL IMÁN? · entrada a cada hora, medido a las 16:00");
console.log(`${"═".repeat(104)}`);
for (const [nom, fn] of LENTES) {
  res.tabla[nom] = {};
  console.log(`\n  ── ${nom} ──`);
  console.log("     entrada |  |d| p50 |        TODO           |      A·2022-23      |      B·2024-26      | signo");
  console.log("             |   pts    |    g      t    %sort  |    g      t    %sort |    g      t    %sort |");
  for (const h0 of HORAS_ENTRADA) {
    const cel = PERIODOS.map(([, filtro]) => prueba(dias.filter(filtro), fn, h0, 20260820));
    if (cel.some((c) => !c)) continue;
    const mismo = cel[1].g * cel[2].g > 0 ? (cel[1].g > 0 ? "sí ++" : "sí −−") : "NO";
    res.tabla[nom][h0] = { todo: cel[0], A: cel[1], B: cel[2], mismoSigno: mismo };
    console.log(`     ${h0}   |  ${f2(cel[0].distP50).padStart(6)}  | ${f2(cel[0].g).padStart(5)} ${f2(cel[0].t).padStart(6)} ${pc(cel[0].pctl).padStart(6)} |` +
                ` ${f2(cel[1].g).padStart(5)} ${f2(cel[1].t).padStart(6)} ${pc(cel[1].pctl).padStart(6)} |` +
                ` ${f2(cel[2].g).padStart(5)} ${f2(cel[2].t).padStart(6)} ${pc(cel[2].pctl).padStart(6)} | ${mismo}`);
  }
}

// ═══ 2 · ¿ACTÚA MÁS CUANDO ESTÁ CERCA? (la gamma es local) ═══════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("2 · ¿ACTÚA MÁS DE CERCA? · entrada a las 14:30, por distancia al nivel (la gamma es local)");
console.log(`${"═".repeat(104)}`);
res.porDistancia = {};
for (const [nom, fn] of [LENTES[0], LENTES[1]]) {
  res.porDistancia[nom] = {};
  console.log(`\n  ── ${nom} ── (entrada 14:30 → 16:00)`);
  console.log("     |d| en pts   |   n  |    TODO          |   A·2022-23   |   B·2024-26   | signo");
  for (const [et, lo, hi] of [["0 a 10", 0, 10], ["10 a 20", 10, 20], ["20 a 40", 20, 40], ["40 a 80", 40, 80], ["más de 80", 80, 1e9]]) {
    const cel = PERIODOS.map(([, filtro]) => prueba(dias.filter(filtro), fn, "14:30", 20260820, (ad) => ad >= lo && ad < hi));
    if (cel.some((c) => !c)) { console.log(`     ${et.padEnd(12)} | muestra insuficiente en alguna mitad`); continue; }
    const mismo = cel[1].g * cel[2].g > 0 ? (cel[1].g > 0 ? "sí ++" : "sí −−") : "NO";
    res.porDistancia[nom][et] = { todo: cel[0], A: cel[1], B: cel[2], mismoSigno: mismo };
    console.log(`     ${et.padEnd(12)} | ${String(cel[0].n).padStart(4)} | ${f2(cel[0].g).padStart(5)} ${f2(cel[0].t).padStart(5)} ${pc(cel[0].pctl).padStart(6)} |` +
                ` ${f2(cel[1].g).padStart(5)} ${f2(cel[1].t).padStart(5)} | ${f2(cel[2].g).padStart(5)} ${f2(cel[2].t).padStart(5)} | ${mismo}`);
  }
}

// ═══ 3 · ¿ES SÓLO REVERSIÓN DE LA MAÑANA? ════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("3 · ¿ES MAGNETISMO O ES QUE VUELVE LO QUE SE FUE? · entrada 13:00, partido por la mañana");
console.log("    'se alejó' = a las 13:00 el precio está MÁS lejos del nivel que a las 09:35.");
console.log("    Si el efecto sólo vive en 'se alejó', es reversión, no imán.");
console.log(`${"═".repeat(104)}`);
res.reversion = {};
for (const [nom, fn] of [LENTES[0], LENTES[1]]) {
  res.reversion[nom] = {};
  console.log(`\n  ── ${nom} ──`);
  console.log("     mañana      |   n  |    TODO          |   A·2022-23   |   B·2024-26   | signo");
  for (const [et, cond] of [
    ["se alejó", (ad, d) => Math.abs(fn(d) - P(d, "13:00")) > Math.abs(fn(d) - d.A)],
    ["se acercó", (ad, d) => Math.abs(fn(d) - P(d, "13:00")) <= Math.abs(fn(d) - d.A)],
  ]) {
    const cel = PERIODOS.map(([, filtro]) => prueba(dias.filter(filtro), fn, "13:00", 20260820, cond));
    if (cel.some((c) => !c)) continue;
    const mismo = cel[1].g * cel[2].g > 0 ? (cel[1].g > 0 ? "sí ++" : "sí −−") : "NO";
    res.reversion[nom][et] = { todo: cel[0], A: cel[1], B: cel[2], mismoSigno: mismo };
    console.log(`     ${et.padEnd(11)} | ${String(cel[0].n).padStart(4)} | ${f2(cel[0].g).padStart(5)} ${f2(cel[0].t).padStart(5)} ${pc(cel[0].pctl).padStart(6)} |` +
                ` ${f2(cel[1].g).padStart(5)} ${f2(cel[1].t).padStart(5)} | ${f2(cel[2].g).padStart(5)} ${f2(cel[2].t).padStart(5)} | ${mismo}`);
  }
}

// ═══ 4 · ELEGIR EL UMBRAL EN UNA MITAD Y PROBARLO EN LA OTRA ═════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("4 · PARTIR LA MUESTRA DE VERDAD: elegir la mejor hora en una mitad y probarla en la OTRA");
console.log(`${"═".repeat(104)}`);
res.cruce = {};
for (const [nom, fn] of LENTES) {
  const A = dias.filter((d) => d.anio <= 2023), B = dias.filter((d) => d.anio >= 2024);
  const mejorDe = (sub) => {
    let mejor = null;
    for (const h0 of HORAS_ENTRADA) { const p = prueba(sub, fn, h0, 20260820); if (p && (!mejor || p.g > mejor.g)) mejor = { h0, ...p }; }
    return mejor;
  };
  const mA = mejorDe(A), mB = mejorDe(B);
  const enB = prueba(B, fn, mA.h0, 20260820), enA = prueba(A, fn, mB.h0, 20260820);
  res.cruce[nom] = { elegidaEnA: mA.h0, gEnA: mA.g, gEnB: enB.g, tEnB: enB.t, pctlEnB: enB.pctl,
                     elegidaEnB: mB.h0, gEnB2: mB.g, gEnA2: enA.g, tEnA: enA.t, pctlEnA: enA.pctl };
  console.log(`\n  ── ${nom} ──`);
  console.log(`     mejor hora en A (2022-23): ${mA.h0} con ${f2(mA.g)} pts  →  llevada a B: ${f2(enB.g)} pts (t ${f2(enB.t)}, ${pc(enB.pctl)} del azar)`);
  console.log(`     mejor hora en B (2024-26): ${mB.h0} con ${f2(mB.g)} pts  →  llevada a A: ${f2(enA.g)} pts (t ${f2(enA.t)}, ${pc(enA.pctl)} del azar)`);
  const vive = enB.g > 0 && enA.g > 0;
  console.log(`     ¿sobrevive al cruce en las DOS direcciones? ${vive ? "SÍ" : "NO"}`);
}

fs.writeFileSync(path.join(AQUI, "victor-hora-iman5.json"), JSON.stringify(res, null, 1));
console.log(`\n→ ${path.join(AQUI, "victor-hora-iman5.json")}`);
