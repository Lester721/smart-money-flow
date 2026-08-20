// ═══════════════════════════════════════════════════════════════════════════════════════════
// VICTOR · ¿CUÁNDO ACTÚAN LOS NIVELES?  —  versión 2, con el sesgo de construcción cancelado
//
// QUÉ CAMBIA RESPECTO A LA v1 Y POR QUÉ.
// En la v1 el control por permutación (C2) ya salía "ganando" +0,92 puntos A LAS 09:35, o sea
// ANTES de que pasara un solo minuto. Eso no puede ser atracción: es sesgo de construcción.
// Viene de PEGAR el nivel de control a la rejilla de strikes — al redondear se le añade un ruido
// simétrico, y por convexidad E|d+ruido| > E|d|. El control nace más lejos y parece que pierde.
//
// El arreglo NO es afinar el control: es medir el CAMBIO desde el momento de decisión.
//
//     g(h) = [ |P(h)−control| − |P(h)−nivel| ]  −  [ |A−control| − |A−nivel| ]
//
// Cualquier ventaja que ya existiera a las 09:35 se resta. Lo que queda es sólo lo que el
// tiempo construye, que es EXACTAMENTE lo que pregunta el encargo: ¿se acerca según avanza
// el día, y a qué hora? g>0 = el precio acaba más cerca del nivel real que de una línea al azar.
//
// Y se añade la prueba que de verdad define el "pinning" de la última hora:
//     dado que el precio está a menos de X puntos de una línea a las 15:00,
//     ¿a qué distancia acaba a las 16:00 — de la línea real y de una línea al azar?
// Ahí la condición es la misma para ambas, así que la comparación es limpia.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listonT } from "../lib/barreraHallazgos";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CAMINO = path.join(
  "C:/Users/leste/AppData/Local/Temp/claude/C--Users-leste-OneDrive-Desktop-Agente-Tito-Metralleta",
  "296b4519-6df7-4f7a-9e53-fef3c87e134d/scratchpad/camino5min.csv",
);
const SALIDA = path.join(AQUI, "victor-hora-iman2.json");

const SORTEOS = 500;
const PRUEBAS = 200;
const LISTON = listonT(PRUEBAS);

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return 0; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const tPareado = (d) => { if (d.length < 3) return 0; const s = Math.sqrt(varianza(d) / d.length); return s > 0 ? media(d) / s : 0; };
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : " n/d");
const pc = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "n/d");
function rng(s0) { let s = s0 >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ═══ CARGA ═══════════════════════════════════════════════════════════════════════════════
const filas = JSON.parse(fs.readFileSync(path.join(AQUI, "gex-niveles.json"), "utf8")).filas;
const camino = new Map();
for (const l of fs.readFileSync(CAMINO, "utf8").split("\n")) {
  if (!l) continue;
  const [fe, ts, p] = l.split(",");
  const v = Number(p);
  if (!Number.isFinite(v) || v <= 0) continue;
  if (!camino.has(fe)) camino.set(fe, []);
  camino.get(fe).push([ts.slice(11, 16), v]);
}

const HORAS = ["09:35", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"];
const dias = [];
for (const f of filas) {
  const c = camino.get(f.fecha); if (!c) continue;
  const m = new Map(c);
  const P = HORAS.map((h) => m.get(h));
  if (P.some((x) => x == null)) continue;
  const hs = c.map((x) => x[0]);
  const tramos = [];
  for (let k = 1; k < HORAS.length; k++) {
    const t = c.slice(hs.indexOf(HORAS[k - 1]), hs.indexOf(HORAS[k]) + 1).map((x) => x[1]);
    tramos.push([Math.min(...t), Math.max(...t)]);
  }
  dias.push({
    fecha: f.fecha, anio: +f.fecha.slice(0, 4), A: f.apertura, P, tramos,
    N: { gam: f.niveles.gam.imanBruto, gamD: f.niveles.gamD.imanBruto, oi: f.niveles.oi.imanBruto, maxPain: f.maxPain },
    muroC: f.niveles.gamD.muroCall, muroP: f.niveles.gamD.muroPut,
  });
}

const paso = (N) => (N % 25 === 0 ? 25 : 5);
const pegar = (x, p) => Math.round(x / p) * p;

/** Los dos controles que SÍ deciden. Ambos a la misma distancia; el sesgo se cancela con g(h). */
function sortear(sub, nivelDe, semilla) {
  const d0 = sub.map((d) => nivelDe(d) - d.A);
  const r = rng(semilla);
  const espejo = [], perm = [];
  for (let s = 0; s < SORTEOS; s++) {
    espejo.push(sub.map((d, i) => (r() < 0.5 ? nivelDe(d) : pegar(2 * d.A - nivelDe(d), paso(nivelDe(d))))));
    const o = d0.map((_, i) => i);
    for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    perm.push(sub.map((d, i) => pegar(d.A + d0[o[i]], paso(nivelDe(d)))));
  }
  return { espejo, perm };
}

// ═══ MEDIDA 1 · la ventaja que construye el TIEMPO, hora a hora ══════════════════════════
function medirHoras(sub, nivelDe, semilla) {
  const { espejo, perm } = sortear(sub, nivelDe, semilla);
  const N = sub.map(nivelDe);
  const out = [];
  for (let h = 0; h < HORAS.length; h++) {
    const real = sub.map((d, i) => Math.abs(d.P[h] - N[i]));
    const fila = { hora: HORAS[h], real: media(real), n: sub.length };
    for (const [nom, sor] of [["esp", espejo], ["per", perm]]) {
      // g por día = (ventaja a la hora h) − (ventaja a las 09:35). Cancela el sesgo de rejilla.
      const gDia = sub.map((d, i) => {
        let acc = 0;
        for (const lv of sor) acc += (Math.abs(d.P[h] - lv[i]) - real[i]) - (Math.abs(d.A - lv[i]) - Math.abs(d.A - N[i]));
        return acc / sor.length;
      });
      // distribución de los 500 sorteos, para el percentil
      const gSorteo = sor.map((lv) => media(sub.map((d, i) =>
        (Math.abs(d.P[h] - lv[i]) - real[i]) - (Math.abs(d.A - lv[i]) - Math.abs(d.A - N[i])))));
      fila[nom + "G"] = media(gDia);
      fila[nom + "T"] = tPareado(gDia);
      fila[nom + "Pctl"] = gSorteo.filter((x) => x > 0).length / gSorteo.length;
    }
    out.push(fila);
  }
  return out;
}

// ═══ MEDIDA 2 · el PINNING de la última hora, con la misma condición para los dos ════════
// "dado que el precio está a ≤X de una línea a la hora h, ¿a qué distancia acaba a las 16:00?"
function pinning(sub, nivelDe, semilla, X, hIdx) {
  const { espejo, perm } = sortear(sub, nivelDe, semilla);
  const N = sub.map(nivelDe);
  const fin = HORAS.length - 1;

  const cerca = [];
  for (let i = 0; i < sub.length; i++) if (Math.abs(sub[i].P[hIdx] - N[i]) <= X) cerca.push(Math.abs(sub[i].P[fin] - N[i]));
  const real = media(cerca);

  const salida = { X, hora: HORAS[hIdx], nReal: cerca.length, real };
  for (const [nom, sor] of [["esp", espejo], ["per", perm]]) {
    const medias = [], ns = [];
    for (const lv of sor) {
      const v = [];
      for (let i = 0; i < sub.length; i++) if (Math.abs(sub[i].P[hIdx] - lv[i]) <= X) v.push(Math.abs(sub[i].P[fin] - lv[i]));
      if (v.length >= 20) { medias.push(media(v)); ns.push(v.length); }
    }
    salida[nom] = media(medias);
    salida[nom + "N"] = media(ns);
    salida[nom + "Vent"] = media(medias) - real;
    salida[nom + "Pctl"] = medias.length ? medias.filter((x) => x > real).length / medias.length : NaN;
  }
  return salida;
}

// ═══ MEDIDA 3 · TOQUES por media hora (con las barras de 5 min de dentro) ════════════════
function toques(sub, nivelDe, semilla) {
  const { espejo } = sortear(sub, nivelDe, semilla);
  const N = sub.map(nivelDe);
  const out = [];
  for (let k = 0; k < HORAS.length - 1; k++) {
    let real = 0;
    for (let i = 0; i < sub.length; i++) { const [lo, hi] = sub[i].tramos[k]; if (N[i] >= lo && N[i] <= hi) real++; }
    const ctrl = espejo.map((lv) => {
      let c = 0;
      for (let i = 0; i < sub.length; i++) { const [lo, hi] = sub[i].tramos[k]; if (lv[i] >= lo && lv[i] <= hi) c++; }
      return c / sub.length;
    });
    out.push({ tramo: `${HORAS[k]}→${HORAS[k + 1]}`, real: real / sub.length, ctrl: media(ctrl), vent: real / sub.length - media(ctrl), pctl: ctrl.filter((x) => x < real / sub.length).length / ctrl.length });
  }
  return out;
}

// ═══ EJECUCIÓN ═══════════════════════════════════════════════════════════════════════════
const LENTES = [["gam (T real 0DTE)", (d) => d.N.gam], ["gamD (T de 1 día)", (d) => d.N.gamD], ["oi puro", (d) => d.N.oi], ["max pain", (d) => d.N.maxPain]];
const PERIODOS = [["TODO", (d) => true], ["A·2022-23", (d) => d.anio <= 2023], ["B·2024-26", (d) => d.anio >= 2024]];
const res = { generado: new Date().toISOString(), sorteos: SORTEOS, pruebas: PRUEBAS, liston: LISTON, n: dias.length, lentes: {} };

console.log("═".repeat(100));
console.log("VICTOR · ¿CUÁNDO ACTÚAN LOS NIVELES?  ·  ventaja que construye el TIEMPO (sesgo de rejilla cancelado)");
console.log(`n=${dias.length} días · ${SORTEOS} sorteos · listón |t| ≥ ${LISTON} (${PRUEBAS} pruebas declaradas)`);
console.log("g > 0  =  el precio acaba MÁS CERCA del nivel real que de una línea al azar a la misma distancia");
console.log("═".repeat(100));

for (const [nom, fn] of LENTES) {
  res.lentes[nom] = {};
  console.log(`\n${"═".repeat(100)}\nIMÁN · ${nom}\n${"═".repeat(100)}`);
  for (const [pn, filtro] of PERIODOS) {
    const sub = dias.filter(filtro);
    const m = medirHoras(sub, fn, 20260820);
    res.lentes[nom][pn] = { horas: m };
    console.log(`\n  ── ${pn} · n=${sub.length} ──`);
    console.log("     hora   | dist real |   ESPEJO (mismo |d|)      |   PERMUTACIÓN (otro día)");
    console.log("            |    pts    |     g      t     %sorteos |     g      t     %sorteos");
    console.log("     " + "-".repeat(78));
    for (const f of m) {
      console.log(`     ${f.hora}  |  ${f2(f.real).padStart(7)}  | ${f2(f.espG).padStart(6)} ${f2(f.espT).padStart(6)}  ${pc(f.espPctl).padStart(7)} |` +
                  ` ${f2(f.perG).padStart(6)} ${f2(f.perT).padStart(6)}  ${pc(f.perPctl).padStart(7)}`);
    }
  }
}

// ── pinning de la última hora ──
console.log(`\n${"═".repeat(100)}\nPINNING · dado que el precio está a ≤X de una línea a las 15:00, ¿dónde acaba a las 16:00?\n(la MISMA condición para la línea real y para la del azar — comparación limpia)\n${"═".repeat(100)}`);
res.pinning = {};
const H15 = HORAS.indexOf("15:00"), H14 = HORAS.indexOf("14:00"), H12 = HORAS.indexOf("12:00");
for (const [nom, fn] of LENTES) {
  res.pinning[nom] = [];
  console.log(`\n  ── ${nom} ──`);
  console.log("     desde  ≤X  |  n real | dist 16:00 real | espejo  vent  %sort | perm    vent  %sort");
  for (const [hIdx, hn] of [[H12, "12:00"], [H14, "14:00"], [H15, "15:00"]]) {
    for (const X of [10, 20, 30]) {
      const p = pinning(dias, fn, 20260820, X, hIdx);
      res.pinning[nom].push(p);
      console.log(`     ${hn} ${String(X).padStart(3)} |  ${String(p.nReal).padStart(5)}  |     ${f2(p.real).padStart(7)}     | ${f2(p.esp).padStart(6)} ${f2(p.espVent).padStart(6)} ${pc(p.espPctl).padStart(6)} |` +
                  ` ${f2(p.per).padStart(6)} ${f2(p.perVent).padStart(6)} ${pc(p.perPctl).padStart(6)}`);
    }
  }
}

// ── toques por media hora ──
console.log(`\n${"═".repeat(100)}\nTOQUES · ¿en qué media hora se pisa el nivel más que una línea al azar? (barras de 5 min)\n${"═".repeat(100)}`);
res.toques = {};
for (const [nom, fn] of LENTES) {
  const t = toques(dias, fn, 20260820);
  res.toques[nom] = t;
  console.log(`\n  ── ${nom} ──`);
  console.log("     tramo          | toca real | toca azar |  vent  | %sorteos");
  for (const x of t) console.log(`     ${x.tramo}  |   ${pc(x.real).padStart(6)}  |   ${pc(x.ctrl).padStart(6)}  | ${pc(x.vent).padStart(6)} | ${pc(x.pctl)}`);
}

fs.writeFileSync(SALIDA, JSON.stringify(res, null, 1));
console.log(`\n→ ${SALIDA}`);
