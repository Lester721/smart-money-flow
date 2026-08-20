// ═══════════════════════════════════════════════════════════════════════════════════════════
// VICTOR · LA HORA — v6, EL VEHÍCULO REAL
//
// La v5 dejó una sola candidata viva: el imán gamD, entrando a las 13:00. Aquí se convierte
// en lo único que Lester puede hacer de verdad, y con el peaje de verdad.
//
// LA APUESTA, dicha en una frase: a las 13:00 miro dónde está el imán respecto al precio; si
// está arriba compro, si está abajo vendo; cierro a las 16:00.
//
//     y = ( P(16:00) − P(h0) ) · signo( imán − P(h0) )      ← puntos de SPX ganados
//
// EL VEHÍCULO: SPY en acciones. Se elige a propósito porque es el que MENOS peaje tiene de
// los tres (un céntimo de horquilla, ~0,10 pts de SPX por ida y vuelta, contra 0,70 pts que
// cuesta abrir una mariposa de SPXW). Si la ventaja no le gana al peaje de SPY, no le gana a
// ninguno. Es la prueba más favorable que existe, no la más dura.
//
// EL PEAJE DE SPY: la horquilla de un céntimo NO está medida en estos ficheros (aquí sólo hay
// cadenas de SPXW). Se usa 1 céntimo por acción de ida y vuelta y SE DICE que es un supuesto,
// no un dato del fichero. Es el supuesto que favorece a la estrategia, así que si aun así
// pierde, el resultado aguanta.
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
const CUENTA = 56389, PODER_COMPRA = 73874, EFECTIVO = 7977;
const HORQUILLA_SPY = 0.01; // $/acción, ida y vuelta. SUPUESTO, no medido en estos ficheros.

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return 0; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const tP = (d) => { if (d.length < 3) return 0; const s = Math.sqrt(varianza(d) / d.length); return s > 0 ? media(d) / s : 0; };
const q = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : " n/d");
const pc = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "n/d");
const d0f = (x) => (Number.isFinite(x) ? "$" + Math.round(x).toLocaleString("es-ES") : "n/d");
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
    razonSPX: f.spy?.razonSPX ?? null, peaje: p,
  });
}
const P = (d, h) => d.px[d.idx.get(h)];

console.log("═".repeat(104));
console.log(`VICTOR · LA HORA — v6 · EL VEHÍCULO REAL · n=${dias.length} días · listón |t| ≥ ${LISTON}`);
console.log("y = puntos de SPX que el precio recorre HACIA el imán desde la hora de entrada hasta las 16:00");
console.log("═".repeat(104));

const LENTES = [["gam  (T real 0DTE)", (d) => d.N.gam], ["gamD (T de 1 día)", (d) => d.N.gamD], ["oi   puro", (d) => d.N.oi], ["maxPain", (d) => d.N.maxPain]];
const PERIODOS = [["TODO", () => true], ["A·2022-23", (d) => d.anio <= 2023], ["B·2024-26", (d) => d.anio >= 2024]];
const HORAS_ENTRADA = ["11:00", "12:00", "13:00", "14:00", "14:30", "15:00", "15:30"];
const res = { generado: new Date().toISOString(), n: dias.length, liston: LISTON, sorteos: SORTEOS, cuenta: CUENTA, poderCompra: PODER_COMPRA, horquillaSPY: HORQUILLA_SPY, direccional: {} };

/** y por día, y su nulo por permutación del signo/distancia en unidades del straddle. */
function direccional(sub, nivelDe, h0, semilla) {
  const r = rng(semilla);
  const u = sub.map((d) => { const p0 = P(d, h0); return { d, p0, dist: nivelDe(d) - p0, x: P(d, "16:00") - p0 }; })
               .filter((o) => o.dist !== 0);
  const y = u.map((o) => o.x * Math.sign(o.dist));
  const rat = u.map((o) => o.dist / o.d.straddle);
  const nulos = [];
  for (let s = 0; s < SORTEOS; s++) {
    const o2 = baraja(u.length, r);
    nulos.push(media(u.map((o, i) => o.x * Math.sign(rat[o2[i]]))));
  }
  const m = media(y);
  return { n: y.length, y: m, t: tP(y), pctl: nulos.filter((x) => x < m).length / nulos.length, nuloMedio: media(nulos), aciertos: y.filter((v) => v > 0).length / y.length, serie: y, fechas: u.map((o) => o.d.fecha) };
}

// ═══ 1 · LA APUESTA DIRECCIONAL ══════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("1 · LA APUESTA: comprar si el imán está arriba, vender si está abajo. Cerrar a las 16:00.");
console.log(`${"═".repeat(104)}`);
for (const [nom, fn] of LENTES) {
  res.direccional[nom] = {};
  console.log(`\n  ── ${nom} ──`);
  console.log("     entrada |         TODO              |      A·2022-23       |      B·2024-26       | signo");
  console.log("             |   y pts    t    %sort  ac |   y pts    t     ac  |   y pts    t     ac  |");
  for (const h0 of HORAS_ENTRADA) {
    const cel = PERIODOS.map(([, filtro]) => direccional(dias.filter(filtro), fn, h0, 20260820));
    const mismo = cel[1].y * cel[2].y > 0 ? (cel[1].y > 0 ? "sí ++" : "sí −−") : "NO";
    res.direccional[nom][h0] = { todo: { ...cel[0], serie: undefined, fechas: undefined }, A: { ...cel[1], serie: undefined, fechas: undefined }, B: { ...cel[2], serie: undefined, fechas: undefined }, mismoSigno: mismo };
    console.log(`     ${h0}   | ${f2(cel[0].y).padStart(6)} ${f2(cel[0].t).padStart(6)} ${pc(cel[0].pctl).padStart(6)} ${pc(cel[0].aciertos).padStart(5)} |` +
                ` ${f2(cel[1].y).padStart(6)} ${f2(cel[1].t).padStart(5)} ${pc(cel[1].aciertos).padStart(5)} |` +
                ` ${f2(cel[2].y).padStart(6)} ${f2(cel[2].t).padStart(5)} ${pc(cel[2].aciertos).padStart(5)} | ${mismo}`);
  }
}

// ═══ 2 · EL CRUCE ════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("2 · EL CRUCE: elegir la hora en una mitad, cobrarla en la otra. En LAS DOS direcciones.");
console.log(`${"═".repeat(104)}`);
res.cruce = {};
for (const [nom, fn] of LENTES) {
  const A = dias.filter((d) => d.anio <= 2023), B = dias.filter((d) => d.anio >= 2024);
  const mejor = (sub) => HORAS_ENTRADA.map((h) => ({ h, ...direccional(sub, fn, h, 20260820) })).sort((a, b) => b.y - a.y)[0];
  const mA = mejor(A), mB = mejor(B);
  const AaB = direccional(B, fn, mA.h, 20260820), BaA = direccional(A, fn, mB.h, 20260820);
  const vive = AaB.y > 0 && BaA.y > 0;
  res.cruce[nom] = { horaDeA: mA.h, yEnA: mA.y, llevadaAB: AaB.y, tAB: AaB.t, horaDeB: mB.h, yEnB: mB.y, llevadaAA: BaA.y, tAA: BaA.t, sobrevive: vive };
  console.log(`  ${nom.padEnd(19)} A→B: ${mA.h} da ${f2(mA.y).padStart(6)} en A y ${f2(AaB.y).padStart(6)} en B (t ${f2(AaB.t)}) | ` +
              `B→A: ${mB.h} da ${f2(mB.y).padStart(6)} en B y ${f2(BaA.y).padStart(6)} en A (t ${f2(BaA.t)}) | ${vive ? "SOBREVIVE" : "NO"}`);
}

// ═══ 3 · EL DINERO, con el vehículo y el peaje de verdad ═════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("3 · EL DINERO · SPY en acciones, poder de compra completo, horquilla de 1 céntimo");
console.log(`${"═".repeat(104)}`);
const razones = dias.map((d) => d.razonSPX).filter((x) => x > 0);
const RAZON = q(razones, 0.5);
console.log(`   razón SPX/SPY medida en el fichero (p50 de ${razones.length} días): ${f2(RAZON)}`);
console.log(`   cuenta ${d0f(CUENTA)} · poder de compra ${d0f(PODER_COMPRA)} · efectivo ${d0f(EFECTIVO)}`);

function dinero(dir, sub) {
  // acciones que caben con el poder de compra, al precio de SPY de cada día
  const porDia = dir.serie.map((yPts, i) => {
    const d = sub.find((x) => x.fecha === dir.fechas[i]);
    const spy = P(d, "13:00") / RAZON;
    const acciones = Math.floor(PODER_COMPRA / spy);
    const bruto = (yPts / RAZON) * acciones;          // 1 pt de SPX = 1/RAZON $ por acción de SPY
    const peaje = HORQUILLA_SPY * acciones;
    return { fecha: d.fecha, bruto, neto: bruto - peaje, acciones };
  });
  const netos = porDia.map((x) => x.neto);
  const anios = new Set(sub.map((d) => d.anio)).size;
  let peorRacha = 0, acc = 0;
  for (const v of netos) { acc = Math.min(0, acc + v); peorRacha = Math.min(peorRacha, acc); }
  return {
    nOps: netos.length, brutoTotal: porDia.reduce((a, x) => a + x.bruto, 0), netoTotal: netos.reduce((a, b) => a + b, 0),
    peajeTotal: porDia.reduce((a, x) => a + (x.bruto - x.neto), 0),
    porOp: media(netos), alAno: (netos.reduce((a, b) => a + b, 0) / netos.length) * 252,
    peorDia: Math.min(...netos), mejorDia: Math.max(...netos), peorRacha,
    accionesP50: q(porDia.map((x) => x.acciones), 0.5), aciertos: netos.filter((v) => v > 0).length / netos.length,
    anios,
  };
}

res.dinero = {};
for (const [nom, fn] of LENTES) {
  console.log(`\n  ── ${nom} ──`);
  console.log("     entrada |  n  | bruto/día | peaje/día | NETO/día |  $/año  | acierto | peor día | peor racha");
  res.dinero[nom] = {};
  for (const h0 of ["12:00", "13:00", "14:30", "15:30"]) {
    const dir = direccional(dias, fn, h0, 20260820);
    const m = dinero(dir, dias);
    res.dinero[nom][h0] = m;
    console.log(`     ${h0}   |${String(m.nOps).padStart(5)}| ${d0f(m.brutoTotal / m.nOps).padStart(9)} | ${d0f(m.peajeTotal / m.nOps).padStart(9)} |` +
                ` ${d0f(m.porOp).padStart(8)} | ${d0f(m.alAno).padStart(7)} |  ${pc(m.aciertos).padStart(5)}  | ${d0f(m.peorDia).padStart(8)} | ${d0f(m.peorRacha)}`);
  }
}

// ═══ 4 · LA CANDIDATA, mirada de cerca ═══════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("4 · LA ÚNICA CANDIDATA QUE PASÓ EL CRUCE (gamD a las 13:00), año por año");
console.log(`${"═".repeat(104)}`);
const fnD = (d) => d.N.gamD;
console.log("     año  |  n  |  y pts  |   t   | acierto |  $/año equivalente");
res.porAnio = {};
for (const a of [2022, 2023, 2024, 2025, 2026]) {
  const sub = dias.filter((d) => d.anio === a);
  const dir = direccional(sub, fnD, "13:00", 20260820);
  const m = dinero(dir, sub);
  res.porAnio[a] = { n: dir.n, y: dir.y, t: dir.t, aciertos: dir.aciertos, alAno: m.alAno, netoTotal: m.netoTotal };
  console.log(`     ${a} |${String(dir.n).padStart(5)}| ${f2(dir.y).padStart(7)} | ${f2(dir.t).padStart(5)} |  ${pc(dir.aciertos).padStart(5)}  | ${d0f(m.alAno)}`);
}

fs.writeFileSync(path.join(AQUI, "victor-hora-iman6.json"), JSON.stringify(res, null, 1));
console.log(`\n→ ${path.join(AQUI, "victor-hora-iman6.json")}`);
