// ═══════════════════════════════════════════════════════════════════════════════════════════
// VICTOR · LA HORA — v4, el control bueno y la hora exacta
//
// EL AGUJERO QUE TAPA ESTA VERSIÓN.
// En la v3 el muro de calls se pisaba MENOS que una línea al azar (7,3% contra 9,6%, percentil
// 0,0%). Parecía un muro repeliendo. No lo es necesariamente: el control por permutación le
// pone a un día CALMADO la distancia de un día MOVIDO y viceversa. Como la probabilidad de
// tocar es convexa en (distancia / movimiento esperado), barajar sin respetar la volatilidad
// INFLA el control por la desigualdad de Jensen. El "muro" saldría solo, sin muro.
//
// EL ARREGLO: barajar la distancia RELATIVA al straddle ATM de las 09:35 — que es el movimiento
// que el mercado espera para ese día, y es un dato REAL del fichero, conocido a la hora de
// decidir (correla 0,714 con el rango que el día acaba teniendo). Así el nivel de control cae
// a la misma distancia EN UNIDADES DEL DÍA, y Jensen deja de regalar diferencia.
// (El straddle se usa como REGLA DE MEDIR, no como precio de una operación.)
//
// Y se baja el reloj a 15 minutos en la última hora y media, que es donde la v3 encontró lo
// único que apuntaba igual en las dos mitades del período.
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
const SORTEOS = 500, PRUEBAS = 200, LISTON = listonT(PRUEBAS);

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return 0; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const tP = (d) => { if (d.length < 3) return 0; const s = Math.sqrt(varianza(d) / d.length); return s > 0 ? media(d) / s : 0; };
const q = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : " n/d");
const pc = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "n/d");
function rng(s0) { let s = s0 >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const baraja = (n, r) => { const o = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };

// ═══ datos ═══════════════════════════════════════════════════════════════════════════════
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
  const px = c.map((x) => x[1]);
  const p = f.peaje;
  const straddle = (p.callATM.bid + p.callATM.ask) / 2 + (p.putATM.bid + p.putATM.ask) / 2;
  if (!(straddle > 0)) continue;
  dias.push({
    fecha: f.fecha, anio: +f.fecha.slice(0, 4), A: f.apertura, px, idx, straddle,
    N: { gam: f.niveles.gam.imanBruto, gamD: f.niveles.gamD.imanBruto, oi: f.niveles.oi.imanBruto, maxPain: f.maxPain },
    muroC: f.niveles.gamD.muroCall, muroP: f.niveles.gamD.muroPut,
    peaje: p,
  });
}
const paso = (N) => (N % 25 === 0 ? 25 : 5);
const pegar = (x, p) => Math.round(x / p) * p;
const P = (d, h) => d.px[d.idx.get(h)];

console.log("═".repeat(102));
console.log(`VICTOR · LA HORA — v4  ·  n=${dias.length} días  ·  ${SORTEOS} sorteos  ·  listón |t| ≥ ${LISTON}`);
console.log("═".repeat(102));

const PERIODOS = [["TODO", () => true], ["A·2022-23", (d) => d.anio <= 2023], ["B·2024-26", (d) => d.anio >= 2024]];
const LENTES = [["gam  (T real 0DTE)", (d) => d.N.gam], ["gamD (T de 1 día)", (d) => d.N.gamD], ["oi   puro", (d) => d.N.oi], ["maxPain", (d) => d.N.maxPain]];
const res = { generado: new Date().toISOString(), n: dias.length, liston: LISTON, sorteos: SORTEOS };

// ═══ 1 · LA CONVERGENCIA TARDÍA bajo los TRES controles ══════════════════════════════════
// estadístico = [ |P(fin)−C| − |P(fin)−N| ] − [ |P(ini)−C| − |P(ini)−N| ]  con C = control
console.log(`\n${"═".repeat(102)}`);
console.log("1 · LA CONVERGENCIA DE 14:30 A 16:00, bajo tres controles distintos");
console.log("    ESPEJO  = el nivel reflejado sobre la apertura (misma distancia exacta, día a día)");
console.log("    PERM.d  = distancia de otro día (el control de la v3; puede inflarse por Jensen)");
console.log("    PERM.d/σ= distancia de otro día EN UNIDADES DEL STRADDLE de ese día (el bueno)");
console.log(`${"═".repeat(102)}`);
console.log("     lente               | período   |   n  | ESPEJO       | PERM.d       | PERM.d/σ");
console.log("                         |           |      |   g      t   |   g      t   |   g      t    %sort");

function convergencia(sub, nivelDe, hIni, hFin, semilla) {
  const r = rng(semilla);
  const N = sub.map(nivelDe);
  const d0 = sub.map((d, i) => N[i] - d.A);
  const rat = sub.map((d, i) => d0[i] / d.straddle);
  const g = (d, N_, C_) => (Math.abs(P(d, hFin) - C_) - Math.abs(P(d, hFin) - N_)) - (Math.abs(P(d, hIni) - C_) - Math.abs(P(d, hIni) - N_));

  const esp = sub.map((d, i) => g(d, N[i], pegar(2 * d.A - N[i], paso(N[i]))));
  const salida = { espG: media(esp), espT: tP(esp) };

  for (const [nom, hacer] of [["perD", (d, i, o) => pegar(d.A + d0[o[i]], paso(N[i]))],
                              ["perR", (d, i, o) => pegar(d.A + rat[o[i]] * d.straddle, paso(N[i]))]]) {
    // valor real medido con el mismo estadístico pero comparando el nivel real contra el nivel sorteado
    const muestras = [], nulos = [];
    for (let s = 0; s < SORTEOS; s++) {
      const o = baraja(sub.length, r);
      const C = sub.map((d, i) => hacer(d, i, o));
      muestras.push(media(sub.map((d, i) => g(d, N[i], C[i]))));
      // nulo: el sorteado contra SU propio espejo — cuánto sale de esto por pura mecánica
      nulos.push(media(sub.map((d, i) => g(d, C[i], pegar(2 * d.A - C[i], paso(N[i]))))));
    }
    const porDia = sub.map((d, i) => {
      let acc = 0, o;
      for (let s = 0; s < 60; s++) { o = baraja(sub.length, r); acc += g(d, N[i], hacer(d, i, o)); }
      return acc / 60;
    });
    salida[nom + "G"] = media(muestras);
    salida[nom + "T"] = tP(porDia);
    salida[nom + "Pctl"] = nulos.filter((x) => x < media(muestras)).length / nulos.length;
  }
  return salida;
}

res.convergencia = {};
for (const [nom, fn] of LENTES) {
  res.convergencia[nom] = {};
  for (const [pn, filtro] of PERIODOS) {
    const sub = dias.filter(filtro);
    const c = convergencia(sub, fn, "14:30", "16:00", 20260820);
    res.convergencia[nom][pn] = c;
    console.log(`     ${nom.padEnd(19)} | ${pn.padEnd(9)} | ${String(sub.length).padStart(4)} | ${f2(c.espG).padStart(5)} ${f2(c.espT).padStart(5)}  |` +
                ` ${f2(c.perDG).padStart(5)} ${f2(c.perDT).padStart(5)}  | ${f2(c.perRG).padStart(5)} ${f2(c.perRT).padStart(5)}  ${pc(c.perRPctl)}`);
  }
}

// ═══ 2 · EL RELOJ FINO — ¿a qué minuto empieza? ══════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("2 · EL RELOJ FINO · convergencia acumulada desde las 13:00, en pasos de 15 min (control ESPEJO)");
console.log(`${"═".repeat(102)}`);
const FINAS = ["13:00", "13:15", "13:30", "13:45", "14:00", "14:15", "14:30", "14:45", "15:00", "15:15", "15:30", "15:45", "16:00"];
res.relojFino = {};
for (const [nom, fn] of [LENTES[0], LENTES[1]]) {
  res.relojFino[nom] = {};
  console.log(`\n  ── ${nom} ── (g acumulada desde las 13:00; g>0 = se acerca al nivel real más que a su espejo)`);
  console.log("     hora   |    TODO      |   A·2022-23  |  B·2024-26   | ¿mismo signo?");
  for (const h of FINAS) {
    const cel = PERIODOS.map(([, filtro]) => {
      const sub = dias.filter(filtro);
      const v = sub.map((d) => {
        const N = fn(d), E = pegar(2 * d.A - N, paso(N));
        const gg = (hh) => Math.abs(P(d, hh) - E) - Math.abs(P(d, hh) - N);
        return gg(h) - gg("13:00");
      });
      return { g: media(v), t: tP(v) };
    });
    const mismo = cel[1].g * cel[2].g > 0 ? (cel[1].g > 0 ? "sí, + y +" : "sí, − y −") : "NO";
    res.relojFino[nom][h] = { todo: cel[0], A: cel[1], B: cel[2], mismoSigno: mismo };
    console.log(`     ${h}  | ${f2(cel[0].g).padStart(5)} ${f2(cel[0].t).padStart(5)}  | ${f2(cel[1].g).padStart(5)} ${f2(cel[1].t).padStart(5)}  | ${f2(cel[2].g).padStart(5)} ${f2(cel[2].t).padStart(5)}  | ${mismo}`);
  }
}

// ═══ 3 · LOS MUROS con el control bueno ══════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("3 · LOS MUROS con el control VOLATILIDAD-PAREADA (misma distancia en unidades del straddle)");
console.log(`${"═".repeat(102)}`);
const MEDIAS = ["09:35", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"];
function murosBien(sub, nivelDe, semilla) {
  const r = rng(semilla);
  const N = sub.map(nivelDe);
  const rat = sub.map((d, i) => (N[i] - d.A) / d.straddle);
  const sorteos = [];
  for (let s = 0; s < SORTEOS; s++) {
    const o = baraja(sub.length, r);
    sorteos.push(sub.map((d, i) => pegar(d.A + rat[o[i]] * d.straddle, paso(N[i]))));
  }
  const out = [];
  for (let k = 0; k < MEDIAS.length - 1; k++) {
    const contar = (niv) => {
      let toca = 0, rech = 0;
      for (let i = 0; i < sub.length; i++) {
        const a = sub[i].idx.get(MEDIAS[k]), b = sub[i].idx.get(MEDIAS[k + 1]);
        const t = sub[i].px.slice(a, b + 1);
        const lo = Math.min(...t), hi = Math.max(...t), L = niv[i];
        if (L >= lo && L <= hi) { toca++; if ((t[0] < L && t.at(-1) < L) || (t[0] > L && t.at(-1) > L)) rech++; }
      }
      return { toca: toca / sub.length, rech: toca ? rech / toca : NaN };
    };
    const real = contar(N), ctrl = sorteos.map(contar);
    out.push({
      tramo: `${MEDIAS[k]}→${MEDIAS[k + 1]}`,
      toca: real.toca, tocaCtrl: media(ctrl.map((c) => c.toca)),
      tocaPctl: ctrl.filter((c) => c.toca < real.toca).length / ctrl.length,
      rech: real.rech, rechCtrl: media(ctrl.map((c) => c.rech).filter(Number.isFinite)),
      rechPctl: ctrl.filter((c) => Number.isFinite(c.rech) && c.rech < real.rech).length / ctrl.length,
    });
  }
  return out;
}
res.muros = {};
for (const [nom, fn] of [["MURO DE CALLS", (d) => d.muroC], ["MURO DE PUTS", (d) => d.muroP]]) {
  const m = murosBien(dias, fn, 20260820);
  res.muros[nom] = m;
  console.log(`\n  ── ${nom} ──`);
  console.log("     tramo          | toca real | toca azar | %sort | rechaza real | rechaza azar | %sort");
  for (const x of m) console.log(`     ${x.tramo}  |   ${pc(x.toca).padStart(6)}  |   ${pc(x.tocaCtrl).padStart(6)}  | ${pc(x.tocaPctl).padStart(6)} |    ${pc(x.rech).padStart(6)}    |    ${pc(x.rechCtrl).padStart(6)}    | ${pc(x.rechPctl)}`);
}

// ═══ 4 · EL DINERO QUE PODRÍA HABER (cota superior honesta) ══════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("4 · LA COTA: 1 punto de SPX = $100. ¿Cuánto pesa el peaje contra la convergencia?");
console.log(`${"═".repeat(102)}`);
const horqCuerpo = dias.map((d) => (d.peaje.callATM.ask - d.peaje.callATM.bid) + (d.peaje.putATM.ask - d.peaje.putATM.bid));
const horqAlas = dias.map((d) => (d.peaje.call05.ask - d.peaje.call05.bid) + (d.peaje.put05.ask - d.peaje.put05.bid));
const abrirFly = q(horqCuerpo, 0.5) + q(horqAlas, 0.5);
const conv = res.convergencia["gamD (T de 1 día)"]["TODO"].espG;
res.cota = {
  convergenciaPts: conv, convergenciaDolares: conv * 100,
  abrirMariposaPts: abrirFly, abrirMariposaDolares: abrirFly * 100,
  idaYVueltaPts: 2 * abrirFly,
  razonEdgePeaje: conv / abrirFly,
  diasAlAno: 252,
};
console.log(`   convergencia tardía medida (gamD, espejo): ${f2(conv)} pts = $${(conv * 100).toFixed(0)} por contrato y día`);
console.log(`   abrir una mariposa de hierro (4 patas, p50): ${f2(abrirFly)} pts = $${(abrirFly * 100).toFixed(0)}`);
console.log(`   ida y vuelta si se cierra antes del vencimiento: ${f2(2 * abrirFly)} pts = $${(2 * abrirFly * 100).toFixed(0)}`);
console.log(`   razón ventaja/peaje (dejándola vencer, sin cerrar): ${f2(conv / abrirFly)}×`);
console.log(`   ⚠ la ventaja está medida contra un NIVEL ESPEJO, no contra no-operar: NO es un P&L.`);

fs.writeFileSync(path.join(AQUI, "victor-hora-iman4.json"), JSON.stringify(res, null, 1));
console.log(`\n→ ${path.join(AQUI, "victor-hora-iman4.json")}`);
