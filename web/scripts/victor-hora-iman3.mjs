// ═══════════════════════════════════════════════════════════════════════════════════════════
// VICTOR · LA HORA — v3, las tres cosas que faltaban
//
// 1) EL ESPEJO PURO. En la v2 el control "espejo" sorteaba entre el nivel REAL y su espejo al
//    50%. Es un control legítimo ("una línea al azar a la misma distancia") pero DILUYE el
//    efecto a la mitad: la mitad de los sorteos son el propio nivel. Aquí se añade el espejo
//    determinista (nunca es el nivel real), que es la comparación con más potencia posible a
//    distancia exactamente pareada. Si el imán no le gana ni a su propio espejo, no hay imán.
//
// 2) LA ÚLTIMA HORA Y MEDIA, con su t. Es lo ÚNICO que apuntaba igual en las dos mitades del
//    período. Se mide como estadístico propio: g(16:00) − g(14:30), pareado día a día.
//
// 3) LOS MUROS. "¿Cuándo actúan los niveles?" no es sólo el imán. ¿A qué hora se pisa el muro
//    de calls y a qué hora RECHAZA — el precio lo toca y se da la vuelta?
//
// Y al final, el PEAJE real: cuánto cuesta en puntos de SPX cobrar lo que se haya encontrado.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listonT } from "../lib/barreraHallazgos";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
// La entrada era un CSV de un directorio temporal de sesión, que ya no existe. Se pide
// por variable de entorno y se falla claro: una ruta muerta escrita dentro sólo sirve
// para que el script se caiga leyendo un sitio que nadie va a reconocer.
const CAMINO = process.env.CAMINO_5MIN;
if (!CAMINO) throw new Error("Falta CAMINO_5MIN: la ruta al CSV de camino de 5 minutos.");
const SORTEOS = 500, PRUEBAS = 200, LISTON = listonT(PRUEBAS);

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return 0; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const tP = (d) => { if (d.length < 3) return 0; const s = Math.sqrt(varianza(d) / d.length); return s > 0 ? media(d) / s : 0; };
const q = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : " n/d");
const pc = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "n/d");
function rng(s0) { let s = s0 >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

const filasRaw = JSON.parse(fs.readFileSync(path.join(AQUI, "gex-niveles.json"), "utf8")).filas;
const camino = new Map();
for (const l of fs.readFileSync(CAMINO, "utf8").split("\n")) {
  if (!l) continue;
  const [fe, ts, p] = l.split(","); const v = Number(p);
  if (!Number.isFinite(v) || v <= 0) continue;
  if (!camino.has(fe)) camino.set(fe, []);
  camino.get(fe).push([ts.slice(11, 16), v]);
}
const HORAS = ["09:35", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"];
const dias = [];
for (const f of filasRaw) {
  const c = camino.get(f.fecha); if (!c) continue;
  const m = new Map(c); const P = HORAS.map((h) => m.get(h));
  if (P.some((x) => x == null)) continue;
  const hs = c.map((x) => x[0]); const tramos = [];
  for (let k = 1; k < HORAS.length; k++) {
    const t = c.slice(hs.indexOf(HORAS[k - 1]), hs.indexOf(HORAS[k]) + 1).map((x) => x[1]);
    tramos.push([Math.min(...t), Math.max(...t), t[0], t.at(-1)]);
  }
  dias.push({
    fecha: f.fecha, anio: +f.fecha.slice(0, 4), A: f.apertura, P, tramos,
    N: { gam: f.niveles.gam.imanBruto, gamD: f.niveles.gamD.imanBruto, oi: f.niveles.oi.imanBruto, maxPain: f.maxPain },
    muroC: f.niveles.gamD.muroCall, muroP: f.niveles.gamD.muroPut, peaje: f.peaje,
  });
}
const paso = (N) => (N % 25 === 0 ? 25 : 5);
const pegar = (x, p) => Math.round(x / p) * p;

console.log("═".repeat(100));
console.log("VICTOR · LA HORA — v3   ·   n=" + dias.length + " días · listón |t| ≥ " + LISTON);
console.log("═".repeat(100));

// ═══ 1 · ESPEJO PURO — máxima potencia, distancia exactamente pareada ════════════════════
console.log(`\n${"═".repeat(100)}\n1 · ESPEJO PURO (el nivel reflejado sobre la apertura; NUNCA es el nivel real)`);
console.log(`   g > 0 = el precio acaba más cerca del imán REAL que de su espejo, a la misma distancia.\n${"═".repeat(100)}`);

const LENTES = [["gam  (T real 0DTE)", (d) => d.N.gam], ["gamD (T de 1 día)", (d) => d.N.gamD], ["oi   puro", (d) => d.N.oi], ["maxPain", (d) => d.N.maxPain]];
const PERIODOS = [["TODO", () => true], ["A·2022-23", (d) => d.anio <= 2023], ["B·2024-26", (d) => d.anio >= 2024]];
const res = { generado: new Date().toISOString(), n: dias.length, liston: LISTON, sorteos: SORTEOS, espejoPuro: {}, ultimaHoraMedia: {}, muros: {}, peaje: {} };

for (const [nom, fn] of LENTES) {
  res.espejoPuro[nom] = {};
  console.log(`\n  ── ${nom} ──`);
  console.log("     hora   |     TODO      |   A·2022-23   |   B·2024-26   | ¿mismo signo?");
  console.log("            |    g      t   |    g      t   |    g      t   |");
  for (let h = 0; h < HORAS.length; h++) {
    const celdas = PERIODOS.map(([pn, filtro]) => {
      const sub = dias.filter(filtro);
      const g = sub.map((d) => {
        const N = fn(d), E = pegar(2 * d.A - N, paso(N));
        return (Math.abs(d.P[h] - E) - Math.abs(d.P[h] - N)) - (Math.abs(d.A - E) - Math.abs(d.A - N));
      });
      return { g: media(g), t: tP(g) };
    });
    const mismo = celdas[1].g * celdas[2].g > 0 ? (celdas[1].g > 0 ? "sí, + y +" : "sí, − y −") : "NO";
    res.espejoPuro[nom][HORAS[h]] = { todo: celdas[0], A: celdas[1], B: celdas[2], mismoSigno: mismo };
    console.log(`     ${HORAS[h]}  | ${f2(celdas[0].g).padStart(6)} ${f2(celdas[0].t).padStart(6)} | ${f2(celdas[1].g).padStart(6)} ${f2(celdas[1].t).padStart(6)} |` +
                ` ${f2(celdas[2].g).padStart(6)} ${f2(celdas[2].t).padStart(6)} | ${mismo}`);
  }
}

// ═══ 2 · LA ÚLTIMA HORA Y MEDIA como estadístico propio ══════════════════════════════════
console.log(`\n${"═".repeat(100)}\n2 · ¿VIVE EL EFECTO EN LA ÚLTIMA HORA Y MEDIA?  g(16:00) − g(14:30), pareado día a día`);
console.log(`   Es lo único que apuntaba igual en las dos mitades. Aquí con su t y su control de azar.\n${"═".repeat(100)}`);
console.log("     lente               | período    |   n  |  ganancia 14:30→16:00 |    t    | %sorteos azar");
const H1430 = HORAS.indexOf("14:30"), H16 = HORAS.length - 1;
for (const [nom, fn] of LENTES) {
  res.ultimaHoraMedia[nom] = {};
  for (const [pn, filtro] of PERIODOS) {
    const sub = dias.filter(filtro);
    const g = sub.map((d) => {
      const N = fn(d), E = pegar(2 * d.A - N, paso(N));
      const gh = (h) => (Math.abs(d.P[h] - E) - Math.abs(d.P[h] - N));
      return gh(H16) - gh(H1430);
    });
    // control: 500 sorteos de "línea al azar" por permutación de distancias, mismo estadístico
    const r = rng(20260820);
    const d0 = sub.map((d) => fn(d) - d.A);
    const nulos = [];
    for (let s = 0; s < SORTEOS; s++) {
      const o = d0.map((_, i) => i);
      for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
      const v = sub.map((d, i) => {
        const N = pegar(d.A + d0[o[i]], paso(fn(d))), E = pegar(2 * d.A - N, paso(fn(d)));
        const gh = (h) => (Math.abs(d.P[h] - E) - Math.abs(d.P[h] - N));
        return gh(H16) - gh(H1430);
      });
      nulos.push(media(v));
    }
    const m = media(g), t = tP(g), pctl = nulos.filter((x) => x < m).length / nulos.length;
    res.ultimaHoraMedia[nom][pn] = { n: sub.length, g: m, t, pctl };
    console.log(`     ${nom.padEnd(19)} | ${pn.padEnd(10)} | ${String(sub.length).padStart(4)} |        ${f2(m).padStart(6)} pts     | ${f2(t).padStart(6)} |  ${pc(pctl)}`);
  }
}

// ═══ 3 · LOS MUROS — toque y RECHAZO por media hora ══════════════════════════════════════
// rechazo = en el tramo se pisa el muro Y el tramo cierra al otro lado (vuelta atrás).
console.log(`\n${"═".repeat(100)}\n3 · LOS MUROS (lente gamD, la que el constructor señaló como la única con recorrido)`);
console.log(`   toque = el precio pisa el nivel dentro de la media hora · rechazo = lo pisa y cierra la media hora de vuelta\n${"═".repeat(100)}`);
function murosPorHora(sub, nivelDe, semilla) {
  const r = rng(semilla);
  const d0 = sub.map((d) => nivelDe(d) - d.A);
  const sorteos = [];
  for (let s = 0; s < SORTEOS; s++) {
    const o = d0.map((_, i) => i);
    for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    sorteos.push(sub.map((d, i) => pegar(d.A + d0[o[i]], paso(nivelDe(d)))));
  }
  const out = [];
  for (let k = 0; k < HORAS.length - 1; k++) {
    const contar = (niv) => {
      let toca = 0, rech = 0;
      for (let i = 0; i < sub.length; i++) {
        const [lo, hi, ini, fin] = sub[i].tramos[k]; const L = niv[i];
        if (L >= lo && L <= hi) { toca++; if ((ini < L && fin < L) || (ini > L && fin > L)) rech++; }
      }
      return { toca: toca / sub.length, rechDeToques: toca ? rech / toca : NaN };
    };
    const real = contar(sub.map(nivelDe));
    const ctrl = sorteos.map(contar);
    out.push({
      tramo: `${HORAS[k]}→${HORAS[k + 1]}`,
      toca: real.toca, tocaCtrl: media(ctrl.map((c) => c.toca)),
      tocaPctl: ctrl.filter((c) => c.toca < real.toca).length / ctrl.length,
      rech: real.rechDeToques, rechCtrl: media(ctrl.map((c) => c.rechDeToques).filter(Number.isFinite)),
      rechPctl: ctrl.filter((c) => Number.isFinite(c.rechDeToques) && c.rechDeToques < real.rechDeToques).length / ctrl.length,
    });
  }
  return out;
}
for (const [nom, fn] of [["MURO DE CALLS", (d) => d.muroC], ["MURO DE PUTS", (d) => d.muroP]]) {
  const m = murosPorHora(dias, fn, 20260820);
  res.muros[nom] = m;
  console.log(`\n  ── ${nom} ──`);
  console.log("     tramo          | toca real | toca azar | %sort | rechaza real | rechaza azar | %sort");
  for (const x of m) console.log(`     ${x.tramo}  |   ${pc(x.toca).padStart(6)}  |   ${pc(x.tocaCtrl).padStart(6)}  | ${pc(x.tocaPctl).padStart(6)} |    ${pc(x.rech).padStart(6)}    |    ${pc(x.rechCtrl).padStart(6)}    | ${pc(x.rechPctl)}`);
}

// ═══ 4 · EL PEAJE — qué cuesta cobrar 0,4 puntos ═════════════════════════════════════════
console.log(`\n${"═".repeat(100)}\n4 · EL PEAJE REAL (del propio fichero, bid/ask de verdad)\n${"═".repeat(100)}`);
const conPeaje = dias.filter((d) => d.peaje?.callATM?.bid > 0 && d.peaje?.putATM?.bid > 0);
const horqATM = conPeaje.map((d) => (d.peaje.callATM.ask - d.peaje.callATM.bid) + (d.peaje.putATM.ask - d.peaje.putATM.bid));
const horqAla = conPeaje.map((d) => (d.peaje.call05.ask - d.peaje.call05.bid) + (d.peaje.put05.ask - d.peaje.put05.bid));
const pctATM = conPeaje.map((d) => (d.peaje.callATM.horquillaPct + d.peaje.putATM.horquillaPct) / 2);
res.peaje = {
  nDias: conPeaje.length,
  horquillaCuerpoP50: q(horqATM, 0.5), horquillaAlasP50: q(horqAla, 0.5),
  mariposaIdaYVuelta: q(horqATM, 0.5) + q(horqAla, 0.5),
  pctPrimaATMp50: q(pctATM, 0.5), pctPrimaATMp90: q(pctATM, 0.9),
};
console.log(`   días con peaje en el fichero: ${conPeaje.length}`);
console.log(`   horquilla del CUERPO (call+put ATM), p50: ${f2(q(horqATM, 0.5))} pts · p90 ${f2(q(horqATM, 0.9))}`);
console.log(`   horquilla de las ALAS (±0,5%),      p50: ${f2(q(horqAla, 0.5))} pts · p90 ${f2(q(horqAla, 0.9))}`);
console.log(`   mariposa de hierro completa, IDA (4 patas): ${f2(q(horqATM, 0.5) + q(horqAla, 0.5))} pts`);
console.log(`   ida y vuelta (abrir y cerrar):              ${f2(2 * (q(horqATM, 0.5) + q(horqAla, 0.5)))} pts`);
console.log(`   horquilla ATM como % de la prima: p50 ${f2(q(pctATM, 0.5))}% · p90 ${f2(q(pctATM, 0.9))}%`);
console.log(`\n   SPY (100 acciones, 1 céntimo de horquilla) = 0,10 pts de SPX por ida y vuelta.`);
console.log(`   PERO SPY es lineal: la "distancia a un nivel" no se cobra con acciones, sólo con gamma.`);

// ═══ 5 · ¿SE ACERCA EL PRECIO AL IMÁN SEGÚN AVANZA EL DÍA? — la pregunta literal ═════════
console.log(`\n${"═".repeat(100)}\n5 · LA PREGUNTA LITERAL: distancia media al imán, hora a hora (sin control)\n${"═".repeat(100)}`);
console.log("     hora   |  gam   |  gamD  |   oi   | maxPain |  ¿se acerca?");
for (let h = 0; h < HORAS.length; h++) {
  const v = LENTES.map(([, fn]) => media(dias.map((d) => Math.abs(d.P[h] - fn(d)))));
  const prev = h ? LENTES.map(([, fn]) => media(dias.map((d) => Math.abs(d.P[h - 1] - fn(d))))) : null;
  const flecha = prev ? (v[0] < prev[0] ? "SÍ, se acerca" : "no, se aleja") : "—";
  console.log(`     ${HORAS[h]}  | ${f2(v[0]).padStart(6)} | ${f2(v[1]).padStart(6)} | ${f2(v[2]).padStart(6)} | ${f2(v[3]).padStart(7)} |  ${flecha}`);
}

fs.writeFileSync(path.join(AQUI, "victor-hora-iman3.json"), JSON.stringify(res, null, 1));
console.log(`\n→ ${path.join(AQUI, "victor-hora-iman3.json")}`);
