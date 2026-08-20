// PASO 5 — EL VEREDICTO. El paso 4 deja una sospecha muy concreta:
//
//   · ordenando GLOBAL o DENTRO DEL DIA, la compuerta de «IV del flujo» sube el cono
//   · ordenando DENTRO DE CADA TICKER, la compuerta lo BAJA en las 48 celdas
//
// Las dos cosas juntas solo tienen una lectura: «IV del flujo alta» no es un momento, es un
// NOMBRE. Aqui se comprueba de frente, descontando el ticker de las dos variables.
import { readFileSync } from "node:fs";
import { tWelch, listonT } from "../lib/barreraHallazgos.ts";

const ops = JSON.parse(readFileSync("scripts/cache-theta/marketsnack/ops-comprar.json", "utf8"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (x) => (x * 100).toFixed(2) + "%";
const HOLD = [1, 5, 10, 20];

function tBloques(vals, fechas, h) {
  const d = new Map();
  for (let i = 0; i < vals.length; i++) (d.get(fechas[i]) ?? d.set(fechas[i], []).get(fechas[i])).push(vals[i]);
  const ds = [...d.keys()].sort(); const b = [];
  for (let i = 0; i < ds.length; i += h) b.push(media(d.get(ds[i])));
  return b.length >= 3 ? { t: media(b) / (sd(b) / Math.sqrt(b.length)), n: b.length, m: media(b) } : { t: NaN, n: b.length, m: NaN };
}

console.log("\n" + "=".repeat(100));
console.log("VEREDICTO · es «IV del flujo» un MOMENTO o es un NOMBRE?");
console.log("=".repeat(100));

// === 1. EL EFECTO CRUDO, TICKER A TICKER: media de IV del flujo vs media de |movimiento| ===
console.log("\n### 1 · LA SECCION CRUZADA — cada ticker con su media (salida a 5 dias)\n");
const g5 = ops.filter((o) => o.plazo === 30 && o.dist === 0 && o.h === 5 && o.ivFlujo != null && o.Ssal != null);
const porT = new Map();
for (const o of g5) {
  (porT.get(o.ticker) ?? porT.set(o.ticker, { iv: [], mov: [] }).get(o.ticker)).iv.push(o.ivFlujo);
  porT.get(o.ticker).mov.push(Math.abs(o.Ssal - o.S) / o.S);
}
const puntos = [...porT].map(([t, v]) => ({ t, iv: media(v.iv), mov: media(v.mov), n: v.iv.length }))
  .sort((a, b) => b.iv - a.iv);
console.log("ticker   IV media del flujo   |mov| medio a 5d   n dias");
for (const p of puntos) console.log(`${p.t.padEnd(7)}  ${p.iv.toFixed(3).padStart(17)}   ${pct(p.mov).padStart(16)}   ${String(p.n).padStart(6)}`);
const mx = media(puntos.map((p) => p.iv)), my = media(puntos.map((p) => p.mov));
const cov = media(puntos.map((p) => (p.iv - mx) * (p.mov - my)));
const corr = cov / (sd(puntos.map((p) => p.iv)) * sd(puntos.map((p) => p.mov)) * (puntos.length - 1) / puntos.length);
console.log(`\n  correlacion ENTRE TICKERS (n=${puntos.length} tickers): ${corr.toFixed(3)}`);
console.log("  Si esto es alto, el «tercio alto de IV del flujo» es simplemente la lista de los nombres volatiles.");

// === 2. EL MISMO EFECTO, DESCONTANDO EL TICKER ===
console.log("\n\n### 2 · EL MISMO EFECTO CON EL TICKER DESCONTADO\n");
console.log("A cada ticker se le resta SU PROPIA media de IV del flujo y SU PROPIA media de |movimiento|.");
console.log("Lo que quede es el MOMENTO: «hoy este ticker tiene el flujo mas caro de lo habitual EN EL».\n");
console.log("salida    n     CRUDO alto-bajo   t(bloq)   DESCONTANDO EL TICKER   t(bloq)   bloques");
const N_PRUEBAS = 144, LISTON = listonT(N_PRUEBAS);
for (const h of HOLD) {
  const g = ops.filter((o) => o.plazo === 30 && o.dist === 0 && o.h === h && o.ivFlujo != null && o.Ssal != null);
  if (g.length < 100) continue;
  const mT = new Map();
  for (const o of g) {
    (mT.get(o.ticker) ?? mT.set(o.ticker, { iv: [], mv: [] }).get(o.ticker)).iv.push(o.ivFlujo);
    mT.get(o.ticker).mv.push(Math.abs(o.Ssal - o.S) / o.S);
  }
  for (const v of mT.values()) { v.miv = media(v.iv); v.mmv = media(v.mv); }
  const filas = g.map((o) => {
    const r = mT.get(o.ticker);
    return { ticker: o.ticker, fecha: o.fecha,
             iv: o.ivFlujo, mov: Math.abs(o.Ssal - o.S) / o.S,
             ivD: o.ivFlujo - r.miv, movD: Math.abs(o.Ssal - o.S) / o.S - r.mmv };
  });
  const tercios = (key, val) => {
    const ord = [...filas].sort((a, b) => b[key] - a[key]);
    const k = Math.floor(ord.length / 3);
    const A = ord.slice(0, k), B = ord.slice(-k);
    const sep = media(A.map((x) => x[val])) - media(B.map((x) => x[val]));
    // t por bloques de dia sobre la DIFERENCIA emparejada por dia
    const dA = new Map(), dB = new Map();
    for (const x of A) (dA.get(x.fecha) ?? dA.set(x.fecha, []).get(x.fecha)).push(x[val]);
    for (const x of B) (dB.get(x.fecha) ?? dB.set(x.fecha, []).get(x.fecha)).push(x[val]);
    const com = [...dA.keys()].filter((d) => dB.has(d)).sort();
    const dif = []; for (let i = 0; i < com.length; i += h) dif.push(media(dA.get(com[i])) - media(dB.get(com[i])));
    const t = dif.length >= 3 ? media(dif) / (sd(dif) / Math.sqrt(dif.length)) : NaN;
    return { sep, t, n: dif.length };
  };
  const crudo = tercios("iv", "mov"), desc = tercios("ivD", "movD");
  console.log(`${String(h).padStart(4)}d ${String(g.length).padStart(6)}   ${pct(crudo.sep).padStart(15)}  ${crudo.t.toFixed(2).padStart(7)}   ${pct(desc.sep).padStart(21)}  ${desc.t.toFixed(2).padStart(7)}   ${String(desc.n).padStart(4)}${Math.abs(desc.t) >= LISTON ? "  ***" : ""}`);
}
console.log(`\n  liston con ${N_PRUEBAS} pruebas: |t| >= ${LISTON}`);

// === 3. Y LO QUE DE VERDAD IMPORTA: el movimiento contra lo que COBRA la cadena ===
console.log("\n\n### 3 · EL MOVIMIENTO CONTRA SU PRECIO — «se mueve mas» no es «se mueve mas de lo que cuesta»\n");
console.log("El cono ATM cobra por adelantado un movimiento: su punto muerto es (askC+askP)/S.");
console.log("La pregunta buena no es si el tercio alto se mueve mas, es si se mueve mas QUE SU PROPIO PUNTO MUERTO.\n");
console.log("salida  tercio   n    |mov| real   punto muerto que cobra   exceso    t(bloq)   bloques");
for (const h of HOLD) {
  const g = ops.filter((o) => o.plazo === 30 && o.dist === 0 && o.h === h && o.ivFlujo != null && o.Ssal != null);
  if (g.length < 100) continue;
  const ord = [...g].sort((a, b) => b.ivFlujo - a.ivFlujo);
  const k = Math.floor(ord.length / 3);
  for (const [nom, sub] of [["ALTO", ord.slice(0, k)], ["BAJO", ord.slice(-k)]]) {
    const mov = sub.map((o) => Math.abs(o.Ssal - o.S) / o.S);
    const be = sub.map((o) => (o.askC + o.askP) / o.S);
    const ex = sub.map((o, i) => mov[i] - be[i]);
    const tb = tBloques(ex, sub.map((o) => o.fecha), h);
    console.log(`${String(h).padStart(5)}d  ${nom.padEnd(6)} ${String(sub.length).padStart(5)}  ${pct(media(mov)).padStart(10)}   ${pct(media(be)).padStart(21)}   ${pct(media(ex)).padStart(7)}   ${tb.t.toFixed(2).padStart(7)}   ${String(tb.n).padStart(4)}`);
  }
}

// === 4. POTENCIA DEL LADO: era esta muestra capaz de ver una ventaja que valiera la pena? ===
console.log("\n\n### 4 · TENIA FUERZA LA PRUEBA? — la criba que le falta a todo resultado negativo\n");
console.log("La ventaja del LADO se mide contra el peaje que hay que superar (la tasa base del vehiculo).");
console.log("Si la muestra podia ver una ventaja MAYOR que el peaje, el negativo es CONCLUYENTE.\n");
console.log("plazo dist salida  ventaja medida  detectable(80%)   peaje a superar   negativo concluyente?");
for (const plazo of [7, 30, 60]) for (const dist of [0, 0.05]) for (const h of [1, 5]) {
  const g = ops.filter((o) => o.plazo === plazo && o.dist === dist && o.h === h && o.neto !== 0);
  if (g.length < 100) continue;
  const vent = g.map((o) => (o.neto > 0 ? o.retC : o.retP) - (o.retC + o.retP) / 2);
  const azar = media(g.flatMap((o) => [o.retC, o.retP]));
  const tb = tBloques(vent, g.map((o) => o.fecha), h);
  const dBloq = new Map();
  for (let i = 0; i < vent.length; i++) (dBloq.get(g[i].fecha) ?? dBloq.set(g[i].fecha, []).get(g[i].fecha)).push(vent[i]);
  const ds = [...dBloq.keys()].sort(); const bl = [];
  for (let i = 0; i < ds.length; i += h) bl.push(media(dBloq.get(ds[i])));
  const detectable = 2.8 * sd(bl) / Math.sqrt(bl.length);
  const peaje = Math.abs(azar);
  console.log(`${String(plazo).padStart(4)}d ${String(dist * 100).padStart(3)}% ${String(h).padStart(5)}d  ${pct(media(vent)).padStart(14)}  ${pct(detectable).padStart(15)}   ${pct(peaje).padStart(15)}   ${detectable <= peaje ? "SI — la muestra veria una ventaja que cubriera el peaje" : "no — haria falta mas muestra"}`);
}

// === 5. N EFECTIVA, dicha de una vez ===
console.log("\n\n### 5 · LA N EFECTIVA\n");
const dias = [...new Set(ops.map((o) => o.fecha))].sort();
console.log(`  filas construidas (ticker-dia x plazo x distancia x salida): ${ops.length}`);
console.log(`  ticker-dia distintos: ${new Set(ops.map((o) => o.ticker + o.fecha)).size}`);
console.log(`  DIAS DE MERCADO distintos: ${dias.length}  (${dias[0]} -> ${dias[dias.length - 1]})`);
for (const h of HOLD) console.log(`  con salida a ${String(h).padStart(2)}d, apuestas que NO se solapan en el tiempo: ${Math.ceil(dias.length / h)}`);
console.log(`\n  Y dentro de un mismo dia los 27 tickers no son 27 apuestas: son megacapitalizadas`);
console.log(`  americanas mas dos indices. La n efectiva REAL esta entre esos numeros y ellos partidos`);
console.log(`  por la correlacion de mercado. Con salida a 20 dias son TRES apuestas independientes.`);
