// ¿QUÉ CARACTERÍSTICA REDUCE LOS CONTRATOS Y MATA A LOS QUE TOCAN EL CORTE?
//
// Lester: «231 contratos a comprar siguen siendo demasiado. Busca una característica que me
// ayude a disminuir la cantidad de contratos a comprar. Preferiblemente que afecte a los
// contratos que lleguen al corte.»
//
// Partimos de los 231 (la tabla mágica sin contratos de más de 90 días). Se busca un factor
// conocido AL COMPRAR que quite muchos de los 35 que tocan el corte sin llevarse a los ganadores.
//
// LAS CRIBAS, declaradas antes de mirar (las mismas que en r7):
//   1. MONÓTONO — que el resultado mejore escalón a escalón, no un pico suelto.
//   2. LAS DOS MITADES del mes — el factor tiene que ir en el mismo sentido en las dos.
//   3. MUESTRA — al menos 50 contratos en el cajón bueno.
// Y una cuarta, porque él pide reducir cantidad:
//   4. QUE QUITE DE VERDAD — al menos un 30% menos de contratos.
//
// TODO se simula día a día: gana lo que pase PRIMERO. Ver simular-el-camino-nunca-un-resumen.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const OBJ = 1.50, SUELO = 0.50, DTE_MIN = 5, DTE_MAX = 90;

const cad = abrir("cadenas");
const flu = abrir("flujo-limpio");
const oiA = abrir("oi-ancho");

function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
  if (!exp) return null;
  const g = c[exp]; let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[`${k}|P`]; if (!p) continue;
    const d = Math.abs((g[cl][0] + g[cl][1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
  return s > 0 ? s : null;
}

// ── recoger con TODOS los campos ──
const cont = new Map();
for (const f of readdirSync(flu.dir)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g;
  let lista; try { lista = JSON.parse(readFileSync(join(flu.dir, f), "utf8")); } catch { continue; }
  for (const o of lista) {
    if (!(o.ask > 0 && o.precio >= o.ask)) continue;
    if (dteDe(dia, o.exp) < DTE_MIN) continue;
    const k = `${tk}|${o.exp}|${o.K}|${o.l}|${dia}`;
    const y = cont.get(k);
    const h = (o.ask - o.bid) / ((o.ask + o.bid) / 2 || 1);
    if (y) { y.tam += o.tam; y.prima += o.prima; y.golpes++; y.horq += h; if (o.precio > o.ask) y.porEnc++; y.horas.push(o.hora); }
    else cont.set(k, { tk, exp: o.exp, K: o.K, l: o.l, dia, tam: o.tam, prima: o.prima, golpes: 1, horq: h, porEnc: o.precio > o.ask ? 1 : 0, horas: [o.hora] });
  }
}

const ops = [];
for (const c of cont.values()) {
  const ds = cad.dias(c.tk); const i = ds.findIndex((x) => x > c.dia);
  if (i < 1) continue; const dC = ds[i]; if (dC >= c.exp) continue;
  const dteC = dteDe(dC, c.exp);
  if (dteC > DTE_MAX) continue;                                  // sin los de más de 90 días
  const ch = cad.leer(c.tk, dC); if (!ch) continue;
  const S = spotOk(ch, dC); if (!S) continue;
  if (!(c.l === "C" ? c.K < S : c.K > S)) continue;               // DENTRO del dinero
  const p0 = ch[c.exp]?.[`${c.K}|${c.l}`]; if (!p0 || !(p0[1] > 0)) continue;
  // el filtro de la tabla mágica: el golpe contra el OI de la VÍSPERA
  const j = ds.indexOf(c.dia); if (j < 1) continue;
  const oiV = oiA.leer(c.tk, ds[j - 1])?.[c.exp]?.[`${c.K}|${c.l}`];
  if (!(oiV > 0)) continue;
  const vsOI = c.tam / oiV;
  if (!(vsOI > 0.60)) continue;

  const coste = p0[1];
  const camino = [];
  for (const d of ds) {
    if (d <= dC) continue; if (d > c.exp) break;
    const p = cad.leer(c.tk, d)?.[c.exp]?.[`${c.K}|${c.l}`]; if (!p) continue;
    camino.push({ d, mult: p[0] / coste });
  }
  if (!camino.length) continue;
  let res = null, salio = null;
  for (const x of camino) {
    if (x.mult >= OBJ) { res = OBJ; salio = "objetivo"; break; }
    if (x.mult <= SUELO) { res = SUELO; salio = "corte"; break; }
  }
  if (res == null) { res = camino[camino.length - 1].mult; salio = "vencimiento"; }
  // el precio de la acción los 20 días antes, para saber de dónde venía
  const i20 = ds[i - 20];
  const S20 = i20 ? spotOk(cad.leer(c.tk, i20) ?? {}, i20) : null;
  ops.push({
    ...c, dC, S, coste, camino, res, salio, vsOI, dteC,
    prof: c.l === "C" ? (S - c.K) / S : (c.K - S) / S,
    horqMed: c.horq / c.golpes,
    pctEnc: c.porEnc / c.golpes,
    valorContrato: coste * 100,
    // ¿cuánto del precio es valor intrínseco? Cerca de 1 = casi pura acción, sin prima de tiempo
    intrinseco: (c.l === "C" ? Math.max(0, S - c.K) : Math.max(0, c.K - S)) / coste,
    venia20: S20 ? (c.l === "C" ? S / S20 - 1 : 1 - S / S20) : null,   // a favor de la opción
    dinero: 0,
  });
}
for (const o of ops) o.dinero = (o.res - 1) * o.valorContrato;
ops.sort((a, b) => a.dia.localeCompare(b.dia));
const corte = ops[Math.floor(ops.length / 2)].dia;

const $ = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const M = (L) => {
  if (!L.length) return null;
  let g = 0, p = 0, gana = 0, alCorte = 0;
  for (const o of L) { if (o.dinero > 0) { g += o.dinero; gana++; } else p += -o.dinero; if (o.salio === "corte") alCorte++; }
  return { n: L.length, pg: 100 * gana / L.length, pc: 100 * alCorte / L.length, alCorte, r: p ? g / p : Infinity, neto: g - p };
};
const base = M(ops);
console.log(`\n  BASE: ${base.n} contratos · ${base.pg.toFixed(0)}% ganan · ${base.alCorte} tocan el corte (${base.pc.toFixed(0)}%) · ratio ${base.r.toFixed(2)} · ${$(base.neto)}\n`);

const buenos = [];
function probar(nombre, valor, cajones) {
  const usables = ops.filter((o) => valor(o) != null);
  if (usables.length < 100) return;
  console.log(`\n  ── ${nombre} ──`);
  console.log(`     ${"cajón".padEnd(24)}     n   al corte   ganan   RATIO         dinero    1ª mit  2ª mit`);
  const filas = [];
  for (const [a, b, nom] of cajones) {
    const L = usables.filter((o) => { const v = valor(o); return v >= a && v < b; });
    const r = M(L); if (!r) { console.log(`     ${nom.padEnd(24)}     —`); filas.push({ nom, r: null }); continue; }
    const p1 = M(L.filter((o) => o.dia < corte)), p2 = M(L.filter((o) => o.dia >= corte));
    filas.push({ nom, r, p1, p2, a, b });
    console.log(`     ${nom.padEnd(24)} ${String(r.n).padStart(5)}   ${(r.alCorte + " (" + r.pc.toFixed(0) + "%)").padStart(9)}   ${r.pg.toFixed(0).padStart(4)}%   ${r.r.toFixed(2).padStart(5)}   ${$(r.neto).padStart(12)}    ${(p1 ? p1.r.toFixed(2) : "—").padStart(5)}   ${(p2 ? p2.r.toFixed(2) : "—").padStart(5)}`);
  }
  const conD = filas.filter((f) => f.r);
  if (conD.length < 3) return;
  const rs = conD.map((f) => f.r.r);
  const sube = rs.every((v, i) => i === 0 || v >= rs[i - 1] - 0.15);
  const baja = rs.every((v, i) => i === 0 || v <= rs[i - 1] + 0.15);
  if (!(sube || baja)) { console.log(`     → no es monótono`); return; }
  const mejor = sube ? conD[conD.length - 1] : conD[0];
  if (mejor.r.n < 50) { console.log(`     → el cajón bueno tiene ${mejor.r.n}, menos de 50`); return; }
  if (!(mejor.p1 && mejor.p2 && mejor.p1.r > 1 && mejor.p2.r > 1)) { console.log(`     → no gana en las dos mitades`); return; }
  const quita = 100 * (1 - mejor.r.n / base.n);
  if (quita < 30) { console.log(`     → sólo quita el ${quita.toFixed(0)}% de los contratos`); return; }
  if (mejor.r.pc >= base.pc) { console.log(`     → no reduce los que tocan el corte (${mejor.r.pc.toFixed(0)}% contra ${base.pc.toFixed(0)}%)`); return; }
  console.log(`     ✓ PASA: quedarse con "${mejor.nom}" quita el ${quita.toFixed(0)}% de los contratos y baja los cortes del ${base.pc.toFixed(0)}% al ${mejor.r.pc.toFixed(0)}%`);
  buenos.push({ nombre, cajon: mejor.nom, valor, a: mejor.a, b: mejor.b, r: mejor.r, quita });
}

probar("lo DENTRO del dinero que está", (o) => o.prof,
  [[0, 0.03, "0% a 3%"], [0.03, 0.08, "3% a 8%"], [0.08, 0.15, "8% a 15%"], [0.15, 0.30, "15% a 30%"], [0.30, 9, "más del 30%"]]);
probar("cuánto es valor INTRÍNSECO", (o) => o.intrinseco,
  [[0, 0.4, "menos del 40%"], [0.4, 0.6, "40% a 60%"], [0.6, 0.8, "60% a 80%"], [0.8, 9, "más del 80%"]]);
probar("el golpe contra el OI de la víspera", (o) => o.vsOI,
  [[0.6, 1.5, "0.6x a 1.5x"], [1.5, 4, "1.5x a 4x"], [4, 12, "4x a 12x"], [12, 1e9, "más de 12x"]]);
probar("tamaño del golpe", (o) => o.prima,
  [[5e5, 1e6, "$500k a $1M"], [1e6, 2e6, "$1M a $2M"], [2e6, 5e6, "$2M a $5M"], [5e6, 1e15, "más de $5M"]]);
probar("días hasta vencer", (o) => o.dteC,
  [[5, 10, "5 a 10 días"], [10, 20, "10 a 20"], [20, 45, "20 a 45"], [45, 91, "45 a 90"]]);
probar("horquilla al comprar", (o) => o.horqMed,
  [[0, 0.005, "menos del 0.5%"], [0.005, 0.02, "0.5% a 2%"], [0.02, 0.05, "2% a 5%"], [0.05, 9, "más del 5%"]]);
probar("lo que cuesta el contrato", (o) => o.valorContrato,
  [[0, 3000, "menos de $3,000"], [3000, 7000, "$3,000 a $7,000"], [7000, 15000, "$7,000 a $15,000"], [15000, 1e9, "más de $15,000"]]);
probar("de dónde venía la acción (20 días)", (o) => o.venia20,
  [[-9, -0.05, "en contra más del 5%"], [-0.05, 0, "algo en contra"], [0, 0.05, "algo a favor"], [0.05, 9, "a favor más del 5%"]]);

console.log(`\n  ── lado y ticker (no aplica lo monótono) ──`);
console.log(`     ${"".padEnd(24)}     n   al corte   ganan   RATIO         dinero`);
for (const [n, f] of [["calls", (o) => o.l === "C"], ["puts", (o) => o.l === "P"]]) {
  const r = M(ops.filter(f));
  console.log(`     ${n.padEnd(24)} ${String(r.n).padStart(5)}   ${(r.alCorte + " (" + r.pc.toFixed(0) + "%)").padStart(9)}   ${r.pg.toFixed(0).padStart(4)}%   ${r.r.toFixed(2).padStart(5)}   ${$(r.neto).padStart(12)}`);
}

console.log(`\n\n═══ LO QUE PASA LAS CUATRO CRIBAS ═══\n`);
if (!buenos.length) console.log(`  NINGUNO.\n`);
else {
  console.log(`  ${"factor".padEnd(38)} ${"quedarse con".padEnd(20)}     n  al corte  RATIO       dinero`);
  for (const b of buenos.sort((x, y) => y.r.r - x.r.r))
    console.log(`  ${b.nombre.padEnd(38)} ${b.cajon.padEnd(20)} ${String(b.r.n).padStart(5)}   ${b.r.pc.toFixed(0).padStart(5)}%  ${b.r.r.toFixed(2).padStart(5)}  ${$(b.r.neto).padStart(11)}`);
  if (buenos.length > 1) {
    const todos = ops.filter((o) => buenos.every((b) => { const v = b.valor(o); return v != null && v >= b.a && v < b.b; }));
    const r = M(todos);
    if (r) console.log(`\n  ${"LOS DOS A LA VEZ".padEnd(38)} ${"".padEnd(20)} ${String(r.n).padStart(5)}   ${r.pc.toFixed(0).padStart(5)}%  ${r.r.toFixed(2).padStart(5)}  ${$(r.neto).padStart(11)}`);
  }
}
console.log("");

// ═══ SUBIR EL LISTÓN DEL FILTRO QUE YA TENEMOS ═══
console.log(`\n═══ SUBIR EL LISTÓN: el golpe contra el OI de la víspera ═══\n`);
console.log(`  ${"listón".padEnd(14)} contratos  al día   tocan el corte   ganan   RATIO         dinero   coste de comprarlos`);
for (const u of [0.6, 1.5, 2, 3, 4, 6, 8, 12]) {
  const L = ops.filter((o) => o.vsOI >= u);
  const r = M(L); if (!r) continue;
  const coste = L.reduce((a, o) => a + o.valorContrato, 0);
  const dias = new Set(L.map((o) => o.dC)).size;
  console.log(`  ${(u + "x o más").padEnd(14)} ${String(r.n).padStart(9)}   ${(r.n / dias).toFixed(1).padStart(5)}   ${(r.alCorte + " (" + r.pc.toFixed(0) + "%)").padStart(14)}   ${r.pg.toFixed(0).padStart(4)}%   ${r.r.toFixed(2).padStart(5)}   ${$(r.neto).padStart(12)}   ${$(coste).padStart(12)}`);
}
console.log(`\n  --- y con el mes partido por la mitad, para ver si aguanta ---\n`);
console.log(`  ${"listón".padEnd(14)}   1ª mitad          2ª mitad`);
for (const u of [0.6, 2, 4, 6]) {
  const L = ops.filter((o) => o.vsOI >= u);
  const p1 = M(L.filter((o) => o.dia < corte)), p2 = M(L.filter((o) => o.dia >= corte));
  console.log(`  ${(u + "x o más").padEnd(14)} ${p1 ? `n=${String(p1.n).padStart(3)} ratio ${p1.r.toFixed(2).padStart(5)}` : "—"}   ${p2 ? `n=${String(p2.n).padStart(3)} ratio ${p2.r.toFixed(2).padStart(5)}` : "—"}`);
}
// y separando calls de puts, que es el elefante
console.log(`\n  --- con el listón en 4x, separando lado ---\n`);
const L4 = ops.filter((o) => o.vsOI >= 4);
console.log(`  ${"".padEnd(14)} contratos   tocan el corte   ganan   RATIO         dinero`);
for (const [n, f] of [["todo", () => true], ["sólo puts", (o) => o.l === "P"], ["sólo calls", (o) => o.l === "C"]]) {
  const r = M(L4.filter(f)); if (!r) { console.log(`  ${n.padEnd(14)}     0`); continue; }
  console.log(`  ${n.padEnd(14)} ${String(r.n).padStart(9)}   ${(r.alCorte + " (" + r.pc.toFixed(0) + "%)").padStart(14)}   ${r.pg.toFixed(0).padStart(4)}%   ${r.r.toFixed(2).padStart(5)}   ${$(r.neto).padStart(12)}`);
}
console.log("");

// ═══ EL LISTÓN EN 12x: ¿cuánto dinero hace falta de verdad? ═══
console.log(`\n═══ LISTÓN 12x — LA CUENTA DE CAPITAL ═══\n`);
const L12 = ops.filter((o) => o.vsOI >= 12).sort((a, b) => a.dC.localeCompare(b.dC));
for (const o of L12) {
  const i = o.camino.findIndex((x) => x.mult >= OBJ || x.mult <= SUELO);
  o.dSal = i >= 0 ? o.camino[i].d : o.camino[o.camino.length - 1].d;
}
const r12 = M(L12);
const costeTotal = L12.reduce((a, o) => a + o.valorContrato, 0);
// pico de capital simultáneo
const ev = [];
for (const o of L12) { ev.push([o.dC, o.valorContrato]); ev.push([o.dSal, -o.valorContrato]); }
ev.sort((a, b) => a[0].localeCompare(b[0]) || b[1] - a[1]);
let cur = 0, pico = 0, nAb = 0, picoN = 0;
for (const [, v] of ev) { cur += v; if (v > 0) nAb++; else nAb--; if (cur > pico) pico = cur; if (nAb > picoN) picoN = nAb; }
console.log(`  ${"qué".padEnd(46)} valor`);
console.log(`  ${"contratos en el mes".padEnd(46)} ${L12.length}`);
console.log(`  ${"ganancia del mes".padEnd(46)} ${$(r12.neto)}`);
console.log(`  ${"comprarlos TODOS costaría".padEnd(46)} ${$(costeTotal)}`);
console.log(`  ${"pero no coinciden: capital MÁXIMO a la vez".padEnd(46)} ${$(pico)}`);
console.log(`  ${"posiciones abiertas como mucho".padEnd(46)} ${picoN}`);
console.log(`  ${"sobre el capital que hace falta".padEnd(46)} ${(100 * r12.neto / pico).toFixed(1)}% en el mes`);
console.log(`  ${"lo que cuesta el contrato (mediana)".padEnd(46)} ${$(L12.map((o) => o.valorContrato).sort((a, b) => a - b)[Math.floor(L12.length / 2)])}`);
console.log(`  ${"el más caro".padEnd(46)} ${$(Math.max(...L12.map((o) => o.valorContrato)))}`);
console.log(`  ${"contratos por día de bolsa".padEnd(46)} ${(L12.length / new Set(L12.map((o) => o.dC)).size).toFixed(1)}`);
console.log(`  ${"puts / calls".padEnd(46)} ${L12.filter((o) => o.l === "P").length} / ${L12.filter((o) => o.l === "C").length}`);
console.log(`\n  --- con una cuenta más pequeña, cogiendo por orden de llegada ---\n`);
console.log(`  ${"capital".padEnd(12)} ${"$ por posición".padEnd(16)} ${"cogidas".padEnd(12)} ${"termina en".padEnd(13)} ganancia`);
for (const [cap, porOp] of [[25000, 12500], [50000, 12500], [100000, 15000], [200000, 15000], [400000, 15000]]) {
  let caja = cap, ab = [], tom = 0;
  const fechas = [...new Set([...L12.map((o) => o.dC), ...L12.map((o) => o.dSal)])].sort();
  for (const hoy of fechas) {
    for (const a of ab.filter((a) => a.dSal === hoy)) caja += a.n * a.res * a.valorContrato;
    ab = ab.filter((a) => a.dSal !== hoy);
    for (const o of L12.filter((o) => o.dC === hoy)) {
      const n = Math.floor(porOp / o.valorContrato);
      if (n < 1 || n * o.valorContrato > caja) continue;
      caja -= n * o.valorContrato; tom++; ab.push({ ...o, n });
    }
  }
  for (const a of ab) caja += a.n * a.res * a.valorContrato;
  console.log(`  ${$(cap).padEnd(12)} ${$(porOp).padEnd(16)} ${`${tom} de ${L12.length}`.padEnd(12)} ${$(caja).padEnd(13)} ${$(caja - cap)}  (${((caja / cap - 1) * 100).toFixed(0)}%)`);
}
console.log("");

// ═══ UN SEGUNDO ATRIBUTO ═══
console.log(`\n═══ UN SEGUNDO ATRIBUTO ═══\n`);
const L12b = ops.filter((o) => o.vsOI >= 12);
const L4b = ops.filter((o) => o.vsOI >= 4);
console.log(`  los 53 (listón 12x): ${L12b.filter((o) => o.dinero <= 0).length} pierden`);
console.log(`  los ${L4b.length} (listón 4x): ${L4b.filter((o) => o.dinero <= 0).length} pierden  ← aquí sí hay con qué probar\n`);

function segundo(nombre, valor, cajones, universo, etiqueta) {
  const U = universo.filter((o) => valor(o) != null);
  if (U.length < 40) return;
  console.log(`\n  ── ${nombre}  ·  ${etiqueta} ──`);
  console.log(`     ${"cajón".padEnd(24)}     n  pierden  al corte  ganan   RATIO         dinero   1ª mit  2ª mit`);
  const filas = [];
  for (const [a, b, nom] of cajones) {
    const L = U.filter((o) => { const v = valor(o); return v >= a && v < b; });
    const r = M(L); if (!r) { console.log(`     ${nom.padEnd(24)}     —`); continue; }
    const p1 = M(L.filter((o) => o.dia < corte)), p2 = M(L.filter((o) => o.dia >= corte));
    filas.push({ nom, r, p1, p2 });
    console.log(`     ${nom.padEnd(24)} ${String(r.n).padStart(5)}  ${String(L.filter((o) => o.dinero <= 0).length).padStart(7)}  ${(r.alCorte + "").padStart(8)}  ${r.pg.toFixed(0).padStart(4)}%   ${r.r.toFixed(2).padStart(5)}   ${$(r.neto).padStart(12)}   ${(p1 ? p1.r.toFixed(2) : "—").padStart(5)}   ${(p2 ? p2.r.toFixed(2) : "—").padStart(5)}`);
  }
  return filas;
}
const CAJ = {
  prof: [[0, 0.05, "0% a 5% dentro"], [0.05, 0.12, "5% a 12%"], [0.12, 0.25, "12% a 25%"], [0.25, 9, "más del 25%"]],
  dte: [[5, 10, "5 a 10 días"], [10, 20, "10 a 20"], [20, 45, "20 a 45"], [45, 91, "45 a 90"]],
  prima: [[5e5, 1.5e6, "$500k a $1.5M"], [1.5e6, 4e6, "$1.5M a $4M"], [4e6, 1e15, "más de $4M"]],
  coste: [[0, 5000, "menos de $5,000"], [5000, 10000, "$5,000 a $10,000"], [10000, 20000, "$10,000 a $20,000"], [20000, 1e9, "más de $20,000"]],
  horq: [[0, 0.01, "menos del 1%"], [0.01, 0.03, "1% a 3%"], [0.03, 9, "más del 3%"]],
  intr: [[0, 0.7, "menos del 70%"], [0.7, 0.85, "70% a 85%"], [0.85, 0.95, "85% a 95%"], [0.95, 9, "más del 95%"]],
  golp: [[1, 2, "1 golpe"], [2, 100, "2 o más"]],
  venia: [[-9, 0, "la acción venía en contra"], [0, 0.03, "a favor, poco"], [0.03, 9, "a favor, más del 3%"]],
};
for (const [nom, campo, caj] of [
  ["lo DENTRO del dinero", (o) => o.prof, CAJ.prof],
  ["días hasta vencer", (o) => o.dteC, CAJ.dte],
  ["tamaño del golpe", (o) => o.prima, CAJ.prima],
  ["lo que cuesta el contrato", (o) => o.valorContrato, CAJ.coste],
  ["horquilla al comprar", (o) => o.horqMed, CAJ.horq],
  ["cuánto es valor intrínseco", (o) => o.intrinseco, CAJ.intr],
  ["golpes en el contrato ese día", (o) => o.golpes, CAJ.golp],
  ["de dónde venía la acción", (o) => o.venia20, CAJ.venia],
]) segundo(nom, campo, caj, L4b, `listón 4x · ${L4b.length} contratos`);

console.log(`\n\n  ═══ LOS 53 DEL LISTÓN 12x, UNO POR UNO — LOS 4 QUE PIERDEN ═══\n`);
console.log(`  ${"ticker".padEnd(7)} ${"lado".padEnd(5)} ${"strike".padStart(7)} ${"vence".padEnd(9)} ${"dte".padStart(4)} ${"dentro".padStart(7)} ${"golpe".padStart(11)} ${"vsOI".padStart(7)} ${"cuesta".padStart(9)} ${"sale por".padEnd(12)} dinero`);
for (const o of L12b.filter((x) => x.dinero <= 0).sort((a, b) => a.dinero - b.dinero))
  console.log(`  ${o.tk.padEnd(7)} ${(o.l === "C" ? "call" : "put").padEnd(5)} ${String(o.K).padStart(7)} ${o.exp.padEnd(9)} ${String(o.dteC).padStart(4)} ${(100 * o.prof).toFixed(0).padStart(6)}% ${$(o.prima).padStart(11)} ${o.vsOI.toFixed(1).padStart(6)}x ${$(o.valorContrato).padStart(9)} ${o.salio.padEnd(12)} ${$(o.dinero)}`);
console.log(`\n  y los 5 que más ganan:\n`);
for (const o of L12b.filter((x) => x.dinero > 0).sort((a, b) => b.dinero - a.dinero).slice(0, 5))
  console.log(`  ${o.tk.padEnd(7)} ${(o.l === "C" ? "call" : "put").padEnd(5)} ${String(o.K).padStart(7)} ${o.exp.padEnd(9)} ${String(o.dteC).padStart(4)} ${(100 * o.prof).toFixed(0).padStart(6)}% ${$(o.prima).padStart(11)} ${o.vsOI.toFixed(1).padStart(6)}x ${$(o.valorContrato).padStart(9)} ${o.salio.padEnd(12)} ${$(o.dinero)}`);
console.log("");

// ═══ COMBINANDO: listón del OI + coste del contrato ═══
console.log(`\n═══ LISTÓN DEL OI  +  COSTE DEL CONTRATO ═══\n`);
console.log(`  ${"combinación".padEnd(34)}   n  pierden  cortes  ganan   RATIO       dinero   capital máx   % sobre capital`);
for (const [u, c, nom] of [
  [0.6, 0, "0.6x · cualquier coste (la base)"],
  [4, 0, "4x · cualquier coste"],
  [12, 0, "12x · cualquier coste"],
  [0.6, 10000, "0.6x · contrato de $10,000+"],
  [2, 10000, "2x · contrato de $10,000+"],
  [4, 10000, "4x · contrato de $10,000+"],
  [12, 10000, "12x · contrato de $10,000+"],
  [4, 7000, "4x · contrato de $7,000+"],
]) {
  const L = ops.filter((o) => o.vsOI >= u && o.valorContrato >= c).sort((a, b) => a.dC.localeCompare(b.dC));
  const r = M(L); if (!r) { console.log(`  ${nom.padEnd(34)}   0`); continue; }
  for (const o of L) { const i = o.camino.findIndex((x) => x.mult >= OBJ || x.mult <= SUELO); o.dSal = i >= 0 ? o.camino[i].d : o.camino[o.camino.length - 1].d; }
  const ev = []; for (const o of L) { ev.push([o.dC, o.valorContrato]); ev.push([o.dSal, -o.valorContrato]); }
  ev.sort((a, b) => a[0].localeCompare(b[0]) || b[1] - a[1]);
  let cur = 0, pico = 0; for (const [, v] of ev) { cur += v; if (cur > pico) pico = cur; }
  const p1 = M(L.filter((o) => o.dia < corte)), p2 = M(L.filter((o) => o.dia >= corte));
  console.log(`  ${nom.padEnd(34)} ${String(r.n).padStart(3)}  ${String(L.filter((o) => o.dinero <= 0).length).padStart(7)}  ${String(r.alCorte).padStart(6)}  ${r.pg.toFixed(0).padStart(4)}%  ${r.r.toFixed(2).padStart(6)}  ${$(r.neto).padStart(11)}  ${$(pico).padStart(11)}  ${(100 * r.neto / pico).toFixed(1).padStart(8)}%   [${p1 ? p1.r.toFixed(1) : "—"} / ${p2 ? p2.r.toFixed(1) : "—"}]`);
}
console.log(`\n  (los dos números entre corchetes son el ratio en la 1ª y la 2ª mitad del mes)`);
console.log("");

// ═══ ¿CABE EN UNA CUENTA DE $60,000? — contratos BARATOS ═══
console.log(`\n═══ CONTRATOS BARATOS: ¿cabe en $60,000? ═══\n`);
function fila(u, cmin, cmax, nom) {
  const L = ops.filter((o) => o.vsOI >= u && o.valorContrato >= cmin && o.valorContrato <= cmax).sort((a, b) => a.dC.localeCompare(b.dC));
  const r = M(L);
  if (!r) { console.log(`  ${nom.padEnd(30)}   0 contratos`); return; }
  for (const o of L) { const i = o.camino.findIndex((x) => x.mult >= OBJ || x.mult <= SUELO); o.dSal = i >= 0 ? o.camino[i].d : o.camino[o.camino.length - 1].d; }
  const ev = []; for (const o of L) { ev.push([o.dC, o.valorContrato]); ev.push([o.dSal, -o.valorContrato]); }
  ev.sort((a, b) => a[0].localeCompare(b[0]) || b[1] - a[1]);
  let cur = 0, pico = 0; for (const [, v] of ev) { cur += v; if (cur > pico) pico = cur; }
  const p1 = M(L.filter((o) => o.dia < corte)), p2 = M(L.filter((o) => o.dia >= corte));
  console.log(`  ${nom.padEnd(30)} ${String(r.n).padStart(3)}  ${String(L.filter((o) => o.dinero <= 0).length).padStart(7)}  ${String(r.alCorte).padStart(6)}  ${r.pg.toFixed(0).padStart(4)}%  ${(r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(6)}  ${$(r.neto).padStart(10)}  ${$(pico).padStart(10)}  ${(100 * r.neto / pico).toFixed(1).padStart(7)}%  [${p1 ? (p1.r === Infinity ? "∞" : p1.r.toFixed(1)) : "—"}/${p2 ? (p2.r === Infinity ? "∞" : p2.r.toFixed(1)) : "—"}]`);
}
console.log(`  ${"combinación".padEnd(30)}   n  pierden  cortes  ganan   RATIO      dinero   capital   % capital   mitades`);
fila(12, 0, 3000, "12x · contrato hasta $3,000");
fila(12, 0, 5000, "12x · hasta $5,000");
fila(12, 0, 7000, "12x · hasta $7,000");
fila(4, 0, 3000, "4x · hasta $3,000");
fila(4, 0, 5000, "4x · hasta $5,000");
fila(4, 0, 7000, "4x · hasta $7,000");
fila(2, 0, 5000, "2x · hasta $5,000");
console.log(`  ${"—".repeat(110)}`);
fila(12, 3000, 1e9, "12x · de $3,000 en adelante");
fila(4, 10000, 1e9, "4x · $10,000+ (la tabla mágica)");

// ¿qué esquinas caben de verdad en $60,000?
console.log(`\n\n  --- simulación con CUENTA DE $60,000, contratos enteros, por orden de llegada ---\n`);
console.log(`  ${"combinación".padEnd(32)} cogidas   termina en    ganancia`);
function sim60(u, cmin, cmax, nom, porOp) {
  const L = ops.filter((o) => o.vsOI >= u && o.valorContrato >= cmin && o.valorContrato <= cmax).sort((a, b) => a.dC.localeCompare(b.dC));
  if (!L.length) { console.log(`  ${nom.padEnd(32)} sin contratos`); return; }
  for (const o of L) { const i = o.camino.findIndex((x) => x.mult >= OBJ || x.mult <= SUELO); o.dSal = i >= 0 ? o.camino[i].d : o.camino[o.camino.length - 1].d; }
  let caja = 60000, ab = [], tom = 0;
  const fechas = [...new Set([...L.map((o) => o.dC), ...L.map((o) => o.dSal)])].sort();
  for (const hoy of fechas) {
    for (const a of ab.filter((a) => a.dSal === hoy)) caja += a.n * a.res * a.valorContrato;
    ab = ab.filter((a) => a.dSal !== hoy);
    for (const o of L.filter((o) => o.dC === hoy)) {
      const n = Math.floor(porOp / o.valorContrato);
      if (n < 1 || n * o.valorContrato > caja) continue;
      caja -= n * o.valorContrato; tom++; ab.push({ ...o, n });
    }
  }
  for (const a of ab) caja += a.n * a.res * a.valorContrato;
  console.log(`  ${nom.padEnd(32)} ${`${tom} de ${L.length}`.padEnd(9)} ${$(caja).padEnd(13)} ${$(caja - 60000)}  (${((caja / 60000 - 1) * 100).toFixed(0)}%)`);
}
for (const [u, cmin, cmax, nom] of [
  [12, 0, 3000, "12x · hasta $3,000"], [12, 0, 5000, "12x · hasta $5,000"],
  [4, 0, 5000, "4x · hasta $5,000"], [4, 0, 7000, "4x · hasta $7,000"],
  [12, 0, 1e9, "12x · cualquier coste"], [4, 10000, 1e9, "4x · $10,000+"],
]) sim60(u, cmin, cmax, nom, 15000);
console.log("");

// ═══ LA ESTRATEGIA PARA UNA CUENTA DE $60,000 ═══
console.log(`\n═══ CUENTA DE $60,000 — ¿qué tamaño por posición? ═══\n`);
const EST = ops.filter((o) => o.vsOI >= 4 && o.valorContrato >= 10000).sort((a, b) => a.dC.localeCompare(b.dC));
for (const o of EST) { const i = o.camino.findIndex((x) => x.mult >= OBJ || x.mult <= SUELO); o.dSal = i >= 0 ? o.camino[i].d : o.camino[o.camino.length - 1].d; }
function sim(cap, porOp, maxAb) {
  let caja = cap, ab = [], tom = 0, saltCaja = 0, saltCupo = 0, minC = cap, ops2 = [];
  const fechas = [...new Set([...EST.map((o) => o.dC), ...EST.map((o) => o.dSal)])].sort();
  for (const hoy of fechas) {
    for (const a of ab.filter((a) => a.dSal === hoy)) caja += a.n * a.res * a.valorContrato;
    ab = ab.filter((a) => a.dSal !== hoy);
    for (const o of EST.filter((o) => o.dC === hoy)) {
      if (ab.length >= maxAb) { saltCupo++; continue; }
      const n = Math.floor(porOp / o.valorContrato);
      if (n < 1 || n * o.valorContrato > caja) { saltCaja++; continue; }
      caja -= n * o.valorContrato; tom++; ab.push({ ...o, n }); ops2.push({ ...o, n });
    }
    if (caja < minC) minC = caja;
  }
  for (const a of ab) caja += a.n * a.res * a.valorContrato;
  return { final: caja, tom, saltCaja, saltCupo, minC, ops2 };
}
console.log(`  ${"$ por posición".padEnd(16)} ${"máx a la vez".padEnd(14)} ${"cogidas".padEnd(12)} ${"termina en".padEnd(13)} ${"ganancia".padEnd(20)} caja mínima`);
let mejor = null;
for (const [p, m] of [[12000, 5], [15000, 4], [15000, 3], [20000, 3], [30000, 2], [60000, 1]]) {
  const r = sim(60000, p, m);
  console.log(`  ${$(p).padEnd(16)} ${String(m).padEnd(14)} ${`${r.tom} de ${EST.length}`.padEnd(12)} ${$(r.final).padEnd(13)} ${`${$(r.final - 60000)}  (${((r.final / 60000 - 1) * 100).toFixed(0)}%)`.padEnd(20)} ${$(r.minC)}`);
  if (!mejor || r.final > mejor.final) mejor = { ...r, p, m };
}
const R2 = sim(60000, 15000, 4);
console.log(`\n\n  ═══ LAS ${R2.tom} OPERACIONES QUE HARÍAS (con $15,000 por posición, máximo 4 abiertas) ═══\n`);
console.log(`  ${"compra".padEnd(10)} ${"ticker".padEnd(6)} ${"lado".padEnd(5)} ${"strike".padStart(7)} ${"vence".padEnd(10)} ${"cuesta".padStart(9)} ${"n".padStart(2)} ${"sale".padEnd(11)} ${"vende".padEnd(10)} ganancia`);
let tot = 0;
for (const o of R2.ops2) {
  const g = o.n * (o.res - 1) * o.valorContrato; tot += g;
  console.log(`  ${o.dC.padEnd(10)} ${o.tk.padEnd(6)} ${(o.l === "C" ? "call" : "put").padEnd(5)} ${String(o.K).padStart(7)} ${o.exp.padEnd(10)} ${$(o.valorContrato).padStart(9)} ${String(o.n).padStart(2)} ${o.salio.padEnd(11)} ${o.dSal.padEnd(10)} ${$(g)}`);
}
console.log(`  ${"".padEnd(76)} ${"—".repeat(10)}`);
console.log(`  ${"TOTAL".padEnd(76)} ${$(tot)}`);
console.log(`\n  ganan ${R2.ops2.filter((o) => o.res > 1).length} · pierden ${R2.ops2.filter((o) => o.res < 1).length} · se quedan sin coger ${R2.saltCupo + R2.saltCaja} por falta de cupo o de dinero`);
console.log("");

// ═══ 12x vs 4x, ambos con contratos de $10,000+, EN LA CUENTA DE $60,000 ═══
console.log(`\n═══ 12x CONTRA 4x, los dos con contratos de $10,000+ ═══\n`);
function comparar(u) {
  const L = ops.filter((o) => o.vsOI >= u && o.valorContrato >= 10000).sort((a, b) => a.dC.localeCompare(b.dC));
  for (const o of L) { const i = o.camino.findIndex((x) => x.mult >= OBJ || x.mult <= SUELO); o.dSal = i >= 0 ? o.camino[i].d : o.camino[o.camino.length - 1].d; }
  const r = M(L);
  const ev = []; for (const o of L) { ev.push([o.dC, o.valorContrato]); ev.push([o.dSal, -o.valorContrato]); }
  ev.sort((a, b) => a[0].localeCompare(b[0]) || b[1] - a[1]);
  let cur = 0, pico = 0; for (const [, v] of ev) { cur += v; if (cur > pico) pico = cur; }
  return { L, r, pico };
}
const A4 = comparar(4), A12 = comparar(12);
console.log(`  ${"".padEnd(26)} ${"4x · $10,000+".padStart(16)} ${"12x · $10,000+".padStart(16)}`);
const cmp = (n, a, b) => console.log(`  ${n.padEnd(26)} ${String(a).padStart(16)} ${String(b).padStart(16)}`);
cmp("contratos en el mes", A4.r.n, A12.r.n);
cmp("contratos al día", (A4.r.n / new Set(A4.L.map((o) => o.dC)).size).toFixed(1), (A12.r.n / new Set(A12.L.map((o) => o.dC)).size).toFixed(1));
cmp("ganan", `${A4.r.pg.toFixed(0)}%`, `${A12.r.pg.toFixed(0)}%`);
cmp("pierden", A4.L.filter((o) => o.dinero <= 0).length, A12.L.filter((o) => o.dinero <= 0).length);
cmp("tocan el corte", A4.r.alCorte, A12.r.alCorte);
cmp("ratio", A4.r.r === Infinity ? "∞" : A4.r.r.toFixed(2), A12.r.r === Infinity ? "∞" : A12.r.r.toFixed(2));
cmp("dinero del mes", $(A4.r.neto), $(A12.r.neto));
cmp("capital máximo", $(A4.pico), $(A12.pico));
cmp("% sobre el capital", `${(100 * A4.r.neto / A4.pico).toFixed(1)}%`, `${(100 * A12.r.neto / A12.pico).toFixed(1)}%`);

console.log(`\n  --- LOS DOS con una cuenta de $60,000 ---\n`);
console.log(`  ${"regla".padEnd(20)} ${"$ pos".padEnd(9)} ${"máx".padEnd(5)} ${"cogidas".padEnd(11)} ${"gana".padEnd(4)} ${"pierde".padEnd(7)} ${"termina en".padEnd(12)} ganancia`);
function sim60b(L, porOp, maxAb, nom) {
  let caja = 60000, ab = [], tomadas = [];
  const fechas = [...new Set([...L.map((o) => o.dC), ...L.map((o) => o.dSal)])].sort();
  for (const hoy of fechas) {
    for (const a of ab.filter((a) => a.dSal === hoy)) caja += a.n * a.res * a.valorContrato;
    ab = ab.filter((a) => a.dSal !== hoy);
    for (const o of L.filter((o) => o.dC === hoy)) {
      if (ab.length >= maxAb) continue;
      const n = Math.floor(porOp / o.valorContrato);
      if (n < 1 || n * o.valorContrato > caja) continue;
      caja -= n * o.valorContrato; ab.push({ ...o, n }); tomadas.push({ ...o, n });
    }
  }
  for (const a of ab) caja += a.n * a.res * a.valorContrato;
  console.log(`  ${nom.padEnd(20)} ${$(porOp).padEnd(9)} ${String(maxAb).padEnd(5)} ${`${tomadas.length} de ${L.length}`.padEnd(11)} ${String(tomadas.filter((o) => o.res > 1).length).padEnd(4)} ${String(tomadas.filter((o) => o.res < 1).length).padEnd(7)} ${$(caja).padEnd(12)} ${$(caja - 60000)}  (${((caja / 60000 - 1) * 100).toFixed(0)}%)`);
}
for (const [p, m] of [[12000, 5], [15000, 4], [15000, 3], [20000, 3]]) {
  sim60b(A4.L, p, m, "4x · $10,000+");
  sim60b(A12.L, p, m, "12x · $10,000+");
  console.log("");
}
