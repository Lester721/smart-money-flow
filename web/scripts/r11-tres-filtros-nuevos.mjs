// TRES FILTROS QUE NO SE HABÍAN PROBADO
//
// 1. LA HORA del golpe — la cinta trae el minuto exacto y nunca se ha usado.
// 2. ¿ES UNA PATA DE SPREAD? — si compró una call y vendió otra en el mismo segundo, no es una
//    apuesta direccional y no debería contar. Esto es exactitud, no afinado.
// 3. ACUMULACIÓN — el mismo contrato golpeado en días distintos = alguien construyendo posición.
//
// Universo de prueba: los 231 (golpe >$500k al ask · dentro del dinero · 5 a 90 días). Se usa
// ése y no los 27 porque con 73 perdedores hay con qué medir; con 1 no.
//
// CRIBAS, declaradas antes de mirar:
//   · monótono (tolerancia 0.15) · las dos mitades del mes en el mismo sentido · n>=40 arriba

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

// ── cargar TODAS las operaciones del día (no sólo las agresivas) para poder detectar spreads ──
const porDia = new Map();                                   // ticker|dia -> [todas las ops de $500k+]
for (const f of readdirSync(flu.dir)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g;
  let lista; try { lista = JSON.parse(readFileSync(join(flu.dir, f), "utf8")); } catch { continue; }
  porDia.set(`${tk}|${dia}`, lista);
}

// ── 2. DETECTAR PATAS DE SPREAD ────────────────────────────────────────────
// Una pata de spread es una operación que tiene OTRA en el mismo ticker, dentro de 2 segundos,
// con tamaño parecido (±20%) y en un contrato DISTINTO. Casi siempre es la otra pata.
function marcarSpreads(lista) {
  const t = lista.map((o) => ({ ...o, ms: Date.parse(o.hora), esPata: false, patas: 0 }));
  t.sort((a, b) => a.ms - b.ms);
  for (let i = 0; i < t.length; i++) {
    for (let j = i + 1; j < t.length && t[j].ms - t[i].ms <= 2000; j++) {
      const mismoContrato = t[i].exp === t[j].exp && t[i].K === t[j].K && t[i].l === t[j].l;
      if (mismoContrato) continue;
      const rel = Math.abs(t[i].tam - t[j].tam) / Math.max(t[i].tam, t[j].tam);
      if (rel <= 0.20) { t[i].esPata = true; t[j].esPata = true; t[i].patas++; t[j].patas++; }
    }
  }
  return t;
}

// ── construir el universo ──
const cont = new Map();
for (const [clave, lista] of porDia) {
  const [tk, dia] = clave.split("|");
  const marcadas = marcarSpreads(lista);
  for (const o of marcadas) {
    if (!(o.ask > 0 && o.precio >= o.ask)) continue;
    if (dteDe(dia, o.exp) < DTE_MIN) continue;
    const k = `${tk}|${o.exp}|${o.K}|${o.l}|${dia}`;
    const y = cont.get(k);
    if (y) {
      y.tam += o.tam; y.prima += o.prima; y.golpes++;
      if (o.esPata) y.enSpread++;
      y.minutos.push(o.hora.slice(11, 16));
      if (o.prima > y.mayorPrima) { y.mayorPrima = o.prima; y.horaMayor = o.hora.slice(11, 16); }
    } else {
      cont.set(k, { tk, exp: o.exp, K: o.K, l: o.l, dia, tam: o.tam, prima: o.prima, golpes: 1,
                    enSpread: o.esPata ? 1 : 0, minutos: [o.hora.slice(11, 16)],
                    mayorPrima: o.prima, horaMayor: o.hora.slice(11, 16) });
    }
  }
}

// ── 3. ACUMULACIÓN: ¿cuántos días distintos se golpea el MISMO contrato? ──
const diasPorContrato = new Map();
for (const c of cont.values()) {
  const k = `${c.tk}|${c.exp}|${c.K}|${c.l}`;
  if (!diasPorContrato.has(k)) diasPorContrato.set(k, new Set());
  diasPorContrato.get(k).add(c.dia);
}

// ── seguir cada uno ──
const ops = [];
for (const c of cont.values()) {
  const ds = cad.dias(c.tk); const i = ds.findIndex((x) => x > c.dia);
  if (i < 1) continue; const dC = ds[i]; if (dC >= c.exp) continue;
  const dteC = dteDe(dC, c.exp); if (dteC > DTE_MAX) continue;
  const ch = cad.leer(c.tk, dC); if (!ch) continue;
  const S = spotOk(ch, dC); if (!S) continue;
  if (!(c.l === "C" ? c.K < S : c.K > S)) continue;
  const p0 = ch[c.exp]?.[`${c.K}|${c.l}`]; if (!p0 || !(p0[1] > 0)) continue;
  const coste = p0[1];
  const camino = [];
  for (const d of ds) {
    if (d <= dC) continue; if (d > c.exp) break;
    const p = cad.leer(c.tk, d)?.[c.exp]?.[`${c.K}|${c.l}`]; if (!p) continue;
    camino.push(p[0] / coste);
  }
  if (!camino.length) continue;
  let res = null, salio = null;
  for (const m of camino) {
    if (m >= OBJ) { res = OBJ; salio = "objetivo"; break; }
    if (m <= SUELO) { res = SUELO; salio = "corte"; break; }
  }
  if (res == null) { res = camino[camino.length - 1]; salio = "vencimiento"; }
  const j = ds.indexOf(c.dia);
  const oiV = j >= 1 ? oiA.leer(c.tk, ds[j - 1])?.[c.exp]?.[`${c.K}|${c.l}`] : null;
  // los días en que se golpeó este contrato ANTES o el mismo día — nada del futuro
  const todosLosDias = [...(diasPorContrato.get(`${c.tk}|${c.exp}|${c.K}|${c.l}`) ?? [])].sort();
  const diasHasta = todosLosDias.filter((d) => d <= c.dia).length;
  const hh = Number(c.horaMayor.slice(0, 2)) + Number(c.horaMayor.slice(3, 5)) / 60;
  ops.push({
    ...c, dC, coste, res, salio, dteC,
    valorContrato: coste * 100,
    vsOI: oiV && oiV > 0 ? c.tam / oiV : null,
    pctSpread: c.enSpread / c.golpes,
    horaDec: hh,
    diasAcumulando: diasHasta,
    dinero: (res - 1) * coste * 100,
  });
}
ops.sort((a, b) => a.dia.localeCompare(b.dia));
const corte = ops[Math.floor(ops.length / 2)].dia;

const $ = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const M = (L) => {
  if (!L.length) return null;
  let g = 0, p = 0, gana = 0, alCorte = 0;
  for (const o of L) { if (o.dinero > 0) { g += o.dinero; gana++; } else p += -o.dinero; if (o.salio === "corte") alCorte++; }
  return { n: L.length, pg: 100 * gana / L.length, alCorte, r: p ? g / p : Infinity, neto: g - p };
};
const base = M(ops);
console.log(`\n  UNIVERSO: ${base.n} contratos · ${base.pg.toFixed(0)}% ganan · ${base.alCorte} al corte · ratio ${base.r.toFixed(2)} · ${$(base.neto)}\n`);

function probar(nombre, valor, cajones) {
  const U = ops.filter((o) => valor(o) != null);
  console.log(`\n  ══ ${nombre} ══  (${U.length} con dato)`);
  console.log(`     ${"cajón".padEnd(26)}     n  al corte  ganan   RATIO         dinero   1ª mit  2ª mit`);
  const filas = [];
  for (const [a, b, nom] of cajones) {
    const L = U.filter((o) => { const v = valor(o); return v >= a && v < b; });
    const r = M(L); if (!r) { console.log(`     ${nom.padEnd(26)}     —`); continue; }
    const p1 = M(L.filter((o) => o.dia < corte)), p2 = M(L.filter((o) => o.dia >= corte));
    filas.push({ nom, r, p1, p2 });
    console.log(`     ${nom.padEnd(26)} ${String(r.n).padStart(5)}  ${String(r.alCorte).padStart(8)}  ${r.pg.toFixed(0).padStart(4)}%  ${(r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(6)}   ${$(r.neto).padStart(12)}   ${(p1 ? (p1.r === Infinity ? "∞" : p1.r.toFixed(2)) : "—").padStart(6)}  ${(p2 ? (p2.r === Infinity ? "∞" : p2.r.toFixed(2)) : "—").padStart(6)}`);
  }
  if (filas.length < 3) { console.log(`     → menos de 3 cajones con datos`); return; }
  const rs = filas.map((f) => f.r.r);
  const sube = rs.every((v, i) => i === 0 || v >= rs[i - 1] - 0.15);
  const baja = rs.every((v, i) => i === 0 || v <= rs[i - 1] + 0.15);
  if (!(sube || baja)) { console.log(`     ✗ no es monótono`); return; }
  const mejor = sube ? filas[filas.length - 1] : filas[0];
  if (mejor.r.n < 40) { console.log(`     ✗ el cajón bueno tiene ${mejor.r.n}, menos de 40`); return; }
  if (!(mejor.p1 && mejor.p2 && mejor.p1.r > base.r && mejor.p2.r > base.r)) { console.log(`     ✗ no bate al universo en las dos mitades`); return; }
  console.log(`     ✓ PASA — quedarse con "${mejor.nom}": ${mejor.r.n} contratos, ratio ${mejor.r.r.toFixed(2)} contra ${base.r.toFixed(2)}`);
}

probar("1 · LA HORA del golpe mayor (ET)", (o) => o.horaDec,
  [[0, 10, "antes de las 10:00"], [10, 12, "10:00 a 12:00"], [12, 14, "12:00 a 14:00"], [14, 24, "después de las 14:00"]]);

probar("2 · ¿ES PATA DE SPREAD?", (o) => o.pctSpread,
  [[0, 0.01, "no, ninguno"], [0.01, 0.5, "algunos golpes sí"], [0.5, 1.01, "sí, la mayoría"]]);

probar("3 · DÍAS ACUMULANDO el contrato", (o) => o.diasAcumulando,
  [[1, 2, "1 día (primera vez)"], [2, 3, "2 días"], [3, 99, "3 días o más"]]);

// ── y lo que más importa del nº2: cuántos de los 27 de la tabla mágica son patas de spread ──
console.log(`\n\n  ══ ¿CUÁNTOS DE LA TABLA MÁGICA SON PATAS DE SPREAD? ══\n`);
console.log(`  ${"universo".padEnd(34)}     n  son pata  ratio SIN patas  ratio con todo`);
for (const [nom, f] of [
  ["los 231 (base)", () => true],
  ["4x · $10,000+ (77)", (o) => o.vsOI >= 4 && o.valorContrato >= 10000],
  ["12x · $10,000+ (27)", (o) => o.vsOI >= 12 && o.valorContrato >= 10000],
]) {
  const L = ops.filter(f);
  const sinPatas = L.filter((o) => o.pctSpread < 0.5);
  const a = M(sinPatas), b = M(L);
  console.log(`  ${nom.padEnd(34)} ${String(L.length).padStart(5)}  ${String(L.filter((o) => o.pctSpread >= 0.5).length).padStart(8)}  ${(a ? (a.r === Infinity ? "∞" : a.r.toFixed(2)) : "—").padStart(15)}  ${(b ? (b.r === Infinity ? "∞" : b.r.toFixed(2)) : "—").padStart(14)}`);
}
console.log("");

// ═══ LA TABLA MÁGICA CON LA HORA DENTRO ═══
console.log(`\n═══ AÑADIENDO "DESPUÉS DE LAS 14:00" ═══\n`);
console.log(`  ${"regla".padEnd(38)}    n  al corte  ganan   RATIO       dinero   capital   % cap`);
function ver(nom, f) {
  const L = ops.filter(f).sort((a, b) => a.dC.localeCompare(b.dC));
  const r = M(L); if (!r) { console.log(`  ${nom.padEnd(38)}    0`); return null; }
  for (const o of L) {
    let i = -1;
    // recalcular el día de salida recorriendo el camino
    const ds = cad.dias(o.tk); const cam = [];
    for (const d of ds) { if (d <= o.dC) continue; if (d > o.exp) break;
      const p = cad.leer(o.tk, d)?.[o.exp]?.[`${o.K}|${o.l}`]; if (!p) continue; cam.push({ d, m: p[0] / o.coste }); }
    const hit = cam.findIndex((x) => x.m >= OBJ || x.m <= SUELO);
    o.dSal = hit >= 0 ? cam[hit].d : (cam.length ? cam[cam.length - 1].d : o.dC);
  }
  const ev = []; for (const o of L) { ev.push([o.dC, o.valorContrato]); ev.push([o.dSal, -o.valorContrato]); }
  ev.sort((a, b) => a[0].localeCompare(b[0]) || b[1] - a[1]);
  let cur = 0, pico = 0; for (const [, v] of ev) { cur += v; if (cur > pico) pico = cur; }
  console.log(`  ${nom.padEnd(38)} ${String(r.n).padStart(4)}  ${String(r.alCorte).padStart(8)}  ${r.pg.toFixed(0).padStart(4)}%  ${(r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(6)}  ${$(r.neto).padStart(11)}  ${$(pico).padStart(9)}  ${(100 * r.neto / pico).toFixed(0).padStart(4)}%`);
  return { L, r, pico };
}
ver("12x · $10,000+", (o) => o.vsOI >= 12 && o.valorContrato >= 10000);
const T = ver("12x · $10,000+ · después de las 14:00", (o) => o.vsOI >= 12 && o.valorContrato >= 10000 && o.horaDec >= 14);
ver("4x · $10,000+", (o) => o.vsOI >= 4 && o.valorContrato >= 10000);
const T4 = ver("4x · $10,000+ · después de las 14:00", (o) => o.vsOI >= 4 && o.valorContrato >= 10000 && o.horaDec >= 14);

console.log(`\n  --- con la cuenta de $60,000 ---\n`);
console.log(`  ${"regla".padEnd(38)} ${"$ pos".padEnd(9)} ${"máx".padEnd(4)} ${"cogidas".padEnd(10)} ${"gana/pierde".padEnd(12)} ${"termina en".padEnd(12)} ganancia`);
function sim(L, porOp, maxAb, nom) {
  let caja = 60000, ab = [], tom = [];
  const fechas = [...new Set([...L.map((o) => o.dC), ...L.map((o) => o.dSal)])].sort();
  for (const hoy of fechas) {
    for (const a of ab.filter((a) => a.dSal === hoy)) caja += a.n * a.res * a.valorContrato;
    ab = ab.filter((a) => a.dSal !== hoy);
    for (const o of L.filter((o) => o.dC === hoy)) {
      if (ab.length >= maxAb) continue;
      const n = Math.floor(porOp / o.valorContrato);
      if (n < 1 || n * o.valorContrato > caja) continue;
      caja -= n * o.valorContrato; ab.push({ ...o, n }); tom.push({ ...o, n });
    }
  }
  for (const a of ab) caja += a.n * a.res * a.valorContrato;
  console.log(`  ${nom.padEnd(38)} ${$(porOp).padEnd(9)} ${String(maxAb).padEnd(4)} ${`${tom.length} de ${L.length}`.padEnd(10)} ${`${tom.filter((o) => o.res > 1).length} / ${tom.filter((o) => o.res < 1).length}`.padEnd(12)} ${$(caja).padEnd(12)} ${$(caja - 60000)}  (${((caja / 60000 - 1) * 100).toFixed(0)}%)`);
  return tom;
}
for (const [p, m] of [[12000, 5], [15000, 4], [15000, 3], [20000, 3]]) {
  if (T) sim(T.L, p, m, "12x · $10,000+ · después de 14:00");
  if (T4) sim(T4.L, p, m, "4x · $10,000+ · después de 14:00");
  console.log("");
}
if (T) {
  const tom = sim(T.L, 15000, 4, "«la elegida» 12x·$10k·14:00 · $15,000/4");
  console.log(`\n  las ${tom.length} operaciones:\n`);
  console.log(`  ${"compra".padEnd(10)} ${"ticker".padEnd(6)} ${"lado".padEnd(5)} ${"strike".padStart(7)} ${"vence".padEnd(10)} ${"hora".padEnd(6)} ${"cuesta".padStart(9)} ${"sale".padEnd(12)} ganancia`);
  for (const o of tom) console.log(`  ${o.dC.padEnd(10)} ${o.tk.padEnd(6)} ${(o.l === "C" ? "call" : "put").padEnd(5)} ${String(o.K).padStart(7)} ${o.exp.padEnd(10)} ${o.horaMayor.padEnd(6)} ${$(o.valorContrato).padStart(9)} ${o.salio.padEnd(12)} ${$(o.n * (o.res - 1) * o.valorContrato)}`);
}
console.log("");

// ═══ EL GRUPO DE "3 DÍAS O MÁS", PARTIDO POR MITADES ═══
console.log(`\n═══ ACUMULACIÓN DE 3 DÍAS O MÁS — las dos mitades del mes ═══\n`);
const A3 = ops.filter((o) => o.diasAcumulando >= 3);
console.log(`  ${"".padEnd(22)}     n   ganan   pierden   ganado    perdido    RATIO        neto`);
const fl = (nom, L) => {
  if (!L.length) { console.log(`  ${nom.padEnd(22)}     0`); return; }
  let g = 0, p = 0, gana = 0;
  for (const o of L) { if (o.dinero > 0) { g += o.dinero; gana++; } else p += -o.dinero; }
  console.log(`  ${nom.padEnd(22)} ${String(L.length).padStart(5)}   ${(100 * gana / L.length).toFixed(0).padStart(4)}%   ${String(L.length - gana).padStart(7)}  ${$(g).padStart(9)}  ${$(p).padStart(9)}  ${(p ? g / p : Infinity).toFixed(2).padStart(7)}  ${$(g - p).padStart(10)}`);
};
fl("todo el mes", A3);
fl("  1ª mitad", A3.filter((o) => o.dia < corte));
fl("  2ª mitad", A3.filter((o) => o.dia >= corte));
console.log(`\n  para comparar, el grupo de 1 día:`);
const A1 = ops.filter((o) => o.diasAcumulando === 1);
fl("  1ª mitad", A1.filter((o) => o.dia < corte));
fl("  2ª mitad", A1.filter((o) => o.dia >= corte));
console.log(`\n  el corte del mes está en ${corte}`);
console.log("");
