// AUDITORÍA DE LA TABLA MÁGICA — cuatro comprobaciones concretas.
//
// Lester: «valida que no me estás mintiendo. Que no te inventaste nada, no estimaste nada,
// leíste el fichero bien, no tenías prisa.»
//
// LO QUE SE COMPRUEBA, y por qué cada una:
//
//  1. EL ORDEN DE LOS SUCESOS. El script original hace:
//         res = mejor >= 1.50 ? 1.50 : max(ultimo, 0.50)
//     `mejor` es el mejor múltiplo de TODA la vida del contrato y `ultimo` el del final. Eso NO
//     mira el orden: si un contrato bajó a 0.30 (el corte salta) y DESPUÉS subió a 1.60, el
//     original lo cuenta como ganador de +$500 cuando en la vida real te sacó el corte con
//     −$500. Es mirar al futuro, y va a mi favor. Aquí se recorre día a día y gana lo que pase
//     PRIMERO.
//
//  2. EL INTERÉS ABIERTO, ¿se sabe antes de comprar? El filtro usa el OI del contrato el día
//     del golpe. Si ese número se publica DESPUÉS del día en que compro, es trampa.
//
//  3. ¿HAY ALGÚN NÚMERO INVENTADO O ESTIMADO? Se comprueba que cada precio usado sale de la
//     cadena y que ninguno viene de un modelo.
//
//  4. ¿SE LEYÓ BIEN EL FICHERO? Formato de la cinta y de las cadenas, y qué pasa con los ceros.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const OBJ = 1.50, SUELO = 0.50, DTE_MIN = 5;

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

// ── recoger igual que r7 ──
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
    if (y) { y.tam += o.tam; y.prima += o.prima; }
    else cont.set(k, { tk, exp: o.exp, K: o.K, l: o.l, dia, tam: o.tam, prima: o.prima });
  }
}

const ops = [];
for (const c of cont.values()) {
  const ds = cad.dias(c.tk); const i = ds.findIndex((x) => x > c.dia);
  if (i < 0) continue; const dC = ds[i]; if (dC >= c.exp) continue;
  const ch = cad.leer(c.tk, dC); if (!ch) continue;
  const S = spotOk(ch, dC); if (!S) continue;
  if (!(c.l === "C" ? c.K < S : c.K > S)) continue;              // DENTRO del dinero
  const p0 = ch[c.exp]?.[`${c.K}|${c.l}`]; if (!p0 || !(p0[1] > 0)) continue;
  const coste = p0[1];

  // ── EL CAMINO, día a día, en orden ──
  const camino = [];
  for (const d of ds) {
    if (d <= dC) continue; if (d > c.exp) break;
    const p = cad.leer(c.tk, d)?.[c.exp]?.[`${c.K}|${c.l}`]; if (!p) continue;
    camino.push({ d, mult: p[0] / coste });
  }
  if (!camino.length) continue;

  // VERSIÓN VIEJA (la de la tabla mágica): no mira el orden
  const mejor = Math.max(...camino.map((x) => x.mult));
  const ult = camino[camino.length - 1].mult;
  const resViejo = mejor >= OBJ ? OBJ : Math.max(ult, SUELO);

  // VERSIÓN BUENA: gana lo que pase PRIMERO
  let resBueno = null, queSalio = null, dSalida = null;
  for (const x of camino) {
    if (x.mult >= OBJ) { resBueno = OBJ; queSalio = "objetivo"; dSalida = x.d; break; }
    if (x.mult <= SUELO) { resBueno = SUELO; queSalio = "corte"; dSalida = x.d; break; }
  }
  if (resBueno == null) { resBueno = ult; queSalio = "vencimiento"; dSalida = camino[camino.length - 1].d; }

  const oiPrev = oiA.leer(c.tk, c.dia)?.[c.exp]?.[`${c.K}|${c.l}`] ?? null;
  ops.push({ ...c, dC, coste, camino, mejor, ult, resViejo, resBueno, queSalio, dSalida,
             vsOI: oiPrev && oiPrev > 0 ? c.tam / oiPrev : null });
}

const R = (L, campo) => {
  if (!L.length) return null;
  let g = 0, p = 0, gana = 0;
  for (const o of L) { const x = 1000 * (o[campo] - 1); if (x > 0) { g += x; gana++; } else p += -x; }
  return { n: L.length, pg: 100 * gana / L.length, r: p ? g / p : Infinity, neto: g - p };
};

console.log(`\n═══ 1. EL ORDEN DE LOS SUCESOS ═══\n`);
const sel = ops.filter((o) => o.vsOI != null && o.vsOI > 0.60);
// ¿cuántas veces el corte habría saltado ANTES de llegar al objetivo?
const trampa = sel.filter((o) => o.resViejo === OBJ && o.resBueno !== OBJ);
const alReves = sel.filter((o) => o.resViejo !== OBJ && o.resBueno === OBJ);
console.log(`  contratos que pasan el filtro: ${sel.length}`);
console.log(`  el viejo dice "ganó al 1.50x" pero el corte del 0.50 habría saltado ANTES: ${trampa.length}`);
console.log(`  el viejo dice "no llegó" y en realidad sí: ${alReves.length}`);
console.log(`\n  ${"versión".padEnd(34)}     n  aciertos   RATIO         neto`);
const F = (nom, r) => console.log(`  ${nom.padEnd(34)} ${String(r.n).padStart(5)}    ${r.pg.toFixed(0).padStart(3)}%   ${r.r.toFixed(2).padStart(5)}   ${r.neto >= 0 ? "+" : "−"}$${Math.abs(Math.round(r.neto)).toLocaleString("en-US")}`);
F("VIEJA (la de la tabla mágica)", R(sel, "resViejo"));
F("BUENA (gana lo que pasa primero)", R(sel, "resBueno"));
console.log(`\n  las 839 (sin el filtro):`);
F("  VIEJA", R(ops, "resViejo"));
F("  BUENA", R(ops, "resBueno"));
console.log(`\n  cómo salen de verdad las ${sel.length}:`);
for (const q of ["objetivo", "corte", "vencimiento"]) {
  const L = sel.filter((o) => o.queSalio === q);
  console.log(`     ${q.padEnd(14)} ${String(L.length).padStart(4)}  (${(100 * L.length / sel.length).toFixed(0)}%)`);
}

console.log(`\n═══ 2. ¿SE SABE EL INTERÉS ABIERTO ANTES DE COMPRAR? ═══\n`);
// ¿el OI del día del golpe ya incluye el golpe? Si tam > oi(dia) - oi(vispera), es que no lo incluye.
let incluye = 0, noIncluye = 0, sinDato = 0;
for (const o of sel.slice(0, 300)) {
  const ds = cad.dias(o.tk); const i = ds.indexOf(o.dia);
  if (i < 1) { sinDato++; continue; }
  const hoy = oiA.leer(o.tk, o.dia)?.[o.exp]?.[`${o.K}|${o.l}`];
  const ayer = oiA.leer(o.tk, ds[i - 1])?.[o.exp]?.[`${o.K}|${o.l}`];
  if (hoy == null || ayer == null) { sinDato++; continue; }
  if (hoy - ayer >= o.tam * 0.5) incluye++; else noIncluye++;
}
console.log(`  de ${incluye + noIncluye} comprobados: el OI del día del golpe YA incluye el golpe en ${incluye}, no lo incluye en ${noIncluye}`);
console.log(`  (si YA lo incluye, el denominador del filtro sería circular — hay que usar la VÍSPERA)`);
// versión con el OI de la VÍSPERA, que es la única segura
let conVispera = 0;
for (const o of ops) {
  const ds = cad.dias(o.tk); const i = ds.indexOf(o.dia);
  if (i < 1) { o.vsOIvispera = null; continue; }
  const ayer = oiA.leer(o.tk, ds[i - 1])?.[o.exp]?.[`${o.K}|${o.l}`];
  o.vsOIvispera = ayer && ayer > 0 ? o.tam / ayer : null;
  if (o.vsOIvispera != null) conVispera++;
}
const selV = ops.filter((o) => o.vsOIvispera != null && o.vsOIvispera > 0.60);
console.log(`\n  ${"filtro usando el OI de la VÍSPERA".padEnd(34)}     n  aciertos   RATIO         neto`);
F("  con la versión BUENA", R(selV, "resBueno"));

console.log(`\n═══ 3. ¿ALGÚN NÚMERO INVENTADO O ESTIMADO? ═══\n`);
let precioNulo = 0, costeCero = 0, bidCero = 0, totalObs = 0;
for (const o of ops) { if (!(o.coste > 0)) costeCero++; for (const x of o.camino) { totalObs++; if (x.mult === 0) bidCero++; } }
console.log(`  ${"comprobación".padEnd(52)} resultado`);
console.log(`  ${"precios de compra con ask <= 0".padEnd(52)} ${costeCero}`);
console.log(`  ${"observaciones de seguimiento".padEnd(52)} ${totalObs.toLocaleString("en-US")}`);
console.log(`  ${"de ésas, bid en cero (la opción vale nada)".padEnd(52)} ${bidCero.toLocaleString("en-US")}  ← es un precio real, no un hueco`);
console.log(`  ${"¿se usa Black-Scholes en algún sitio?".padEnd(52)} no — el delta no se usa; el filtro es strike contra precio`);
console.log(`  ${"¿de dónde sale el precio de la acción?".padEnd(52)} paridad put-call en el vencimiento más cercano`);

console.log(`\n═══ 4. ¿SE LEYÓ BIEN EL FICHERO? ═══\n`);
const unF = readdirSync(flu.dir).find((f) => /^SPY_d\d{8}\.json$/.test(f));
const unaOp = JSON.parse(readFileSync(join(flu.dir, unF), "utf8"))[0];
console.log(`  una fila de la cinta: ${JSON.stringify(unaOp)}`);
const unaCad = cad.leer("SPY", "20260115");
const unExp = Object.keys(unaCad)[0], unK = Object.keys(unaCad[unExp])[0];
console.log(`  una fila de la cadena: ${unExp} ${unK} = ${JSON.stringify(unaCad[unExp][unK])}  (bid, ask)`);
console.log(`  el OI de un contrato:  ${JSON.stringify(oiA.leer("SPY", "20260115")?.[unExp]?.[unK])}`);
console.log("");

// ── los cajones del filtro, con la contabilidad BUENA ──
console.log(`\n═══ 5. LOS CAJONES DEL FILTRO, RECALCULADOS ═══\n`);
ops.sort((a, b) => a.dia.localeCompare(b.dia));
const corte2 = ops[Math.floor(ops.length / 2)].dia;
console.log(`  ${"el golpe contra el OI de la víspera".padEnd(26)}     n  aciertos   RATIO    1ª mitad  2ª mitad`);
for (const [a, b, nom] of [[0, 0.05, "menos del 5%"], [0.05, 0.20, "5% a 20%"], [0.20, 0.60, "20% a 60%"], [0.60, 1e9, "más del 60%"]]) {
  const L = ops.filter((o) => o.vsOIvispera != null && o.vsOIvispera >= a && o.vsOIvispera < b);
  const r = R(L, "resBueno"); if (!r) { console.log(`  ${nom.padEnd(26)}     —`); continue; }
  const p1 = R(L.filter((o) => o.dia < corte2), "resBueno"), p2 = R(L.filter((o) => o.dia >= corte2), "resBueno");
  console.log(`  ${nom.padEnd(26)} ${String(r.n).padStart(5)}    ${r.pg.toFixed(0).padStart(3)}%   ${r.r.toFixed(2).padStart(5)}     ${(p1 ? p1.r.toFixed(2) : "—").padStart(5)}     ${(p2 ? p2.r.toFixed(2) : "—").padStart(5)}`);
}
const selF = ops.filter((o) => o.vsOIvispera != null && o.vsOIvispera > 0.60);
console.log(`\n  ${"reparto de las que pasan".padEnd(30)} cuántas   de cada 100`);
for (const [n, f] of [["puts", (o) => o.l === "P"], ["calls", (o) => o.l === "C"]]) {
  const L = selF.filter(f);
  console.log(`  ${n.padEnd(30)} ${String(L.length).padStart(7)}   ${(100 * L.length / selF.length).toFixed(0).padStart(10)}%`);
}
console.log("");

// ═══ 6. EN DINERO DE VERDAD: comprando UN contrato de cada uno ═══
console.log(`\n═══ 6. EN DINERO DE VERDAD ═══\n`);
const S6 = ops.filter((o) => o.vsOIvispera != null && o.vsOIvispera > 0.60);
let coste = 0, resultado = 0, gan = 0, per = 0;
for (const o of S6) {
  const c = o.coste * 100;                 // lo que cuesta UN contrato
  const sale = o.resBueno * c;             // lo que sacas al vender
  coste += c; resultado += sale - c;
  if (sale - c > 0) gan += sale - c; else per += c - sale;
}
const $ = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
console.log(`  ${"comprando UN contrato de cada una de las 302".padEnd(48)}`);
console.log(`  ${"qué".padEnd(48)} cuánto`);
console.log(`  ${"contratos".padEnd(48)} ${S6.length}`);
console.log(`  ${"lo que cuesta comprarlos todos".padEnd(48)} ${$(coste)}`);
console.log(`  ${"lo que ganan los que ganan".padEnd(48)} ${$(gan)}`);
console.log(`  ${"lo que pierden los que pierden".padEnd(48)} ${$(per)}`);
console.log(`  ${"GANANCIA DEL MES".padEnd(48)} ${$(resultado)}`);
console.log(`  ${"sobre lo invertido".padEnd(48)} ${(100 * resultado / coste).toFixed(1)}%`);
console.log(`  ${"por contrato, de media".padEnd(48)} ${$(resultado / S6.length)}`);

// ── y con una cuenta de tamaño real: X por operación, contratos enteros ──
console.log(`\n  --- con una cuenta de verdad, comprando por orden de llegada ---\n`);
console.log(`  ${"capital".padEnd(12)} ${"$ por operación".padEnd(17)} ${"señales cogidas".padEnd(17)} ${"termina en".padEnd(14)} ganancia`);
S6.sort((a, b) => a.dC.localeCompare(b.dC));
for (const [cap, porOp] of [[10000, 10000], [25000, 12500], [50000, 12500], [100000, 12500], [250000, 12500]]) {
  let caja = cap, abiertas = [], tomadas = 0;
  const fechas = [...new Set([...S6.map((o) => o.dC), ...S6.map((o) => o.dSalida)])].sort();
  for (const hoy of fechas) {
    for (const a of abiertas.filter((a) => a.dSalida === hoy)) caja += a.n * a.resBueno * a.coste * 100;
    abiertas = abiertas.filter((a) => a.dSalida !== hoy);
    for (const o of S6.filter((o) => o.dC === hoy)) {
      const precio = o.coste * 100;
      const n = Math.floor(porOp / precio);
      if (n < 1 || n * precio > caja) continue;
      caja -= n * precio; tomadas++; abiertas.push({ ...o, n });
    }
  }
  for (const a of abiertas) caja += a.n * a.resBueno * a.coste * 100;
  console.log(`  ${$(cap).padEnd(12)} ${$(porOp).padEnd(17)} ${`${tomadas} de ${S6.length}`.padEnd(17)} ${$(caja).padEnd(14)} ${$(caja - cap)}  (${((caja / cap - 1) * 100).toFixed(0)}%)`);
}
console.log("");

// ═══ 7. DE LAS 302: CUÁNTAS GANAN Y CUÁNTAS PIERDEN ═══
console.log(`\n═══ 7. DE LAS 302 ═══\n`);
const S7 = ops.filter((o) => o.vsOIvispera != null && o.vsOIvispera > 0.60);
const gana7 = S7.filter((o) => o.resBueno > 1), pierde7 = S7.filter((o) => o.resBueno < 1), tabla7 = S7.filter((o) => o.resBueno === 1);
const $$ = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const din = (L) => L.reduce((a, o) => a + (o.resBueno - 1) * o.coste * 100, 0);
console.log(`  ${"".padEnd(32)} cuántas  de cada 100        dinero`);
console.log(`  ${"GANAN".padEnd(32)} ${String(gana7.length).padStart(6)}   ${(100 * gana7.length / S7.length).toFixed(0).padStart(6)}%   ${$$(din(gana7)).padStart(12)}`);
console.log(`  ${"PIERDEN".padEnd(32)} ${String(pierde7.length).padStart(6)}   ${(100 * pierde7.length / S7.length).toFixed(0).padStart(6)}%   ${$$(din(pierde7)).padStart(12)}`);
if (tabla7.length) console.log(`  ${"ni gana ni pierde".padEnd(32)} ${String(tabla7.length).padStart(6)}   ${(100 * tabla7.length / S7.length).toFixed(0).padStart(6)}%`);
console.log(`  ${"".padEnd(32)} ${"—".repeat(6)}                ${"—".repeat(12)}`);
console.log(`  ${"TOTAL".padEnd(32)} ${String(S7.length).padStart(6)}                   ${$$(din(S7)).padStart(12)}`);

console.log(`\n  --- por dónde sale cada una ---\n`);
console.log(`  ${"sale por".padEnd(32)} cuántas  de cada 100        dinero   por contrato`);
for (const q of ["objetivo", "corte", "vencimiento"]) {
  const L = S7.filter((o) => o.queSalio === q);
  if (!L.length) continue;
  const d = din(L);
  console.log(`  ${(q === "objetivo" ? "el objetivo de 1.50x" : q === "corte" ? "el corte de 0.50x" : "vencimiento").padEnd(32)} ${String(L.length).padStart(6)}   ${(100 * L.length / S7.length).toFixed(0).padStart(6)}%   ${$$(d).padStart(12)}   ${$$(d / L.length)}`);
}
console.log(`\n  --- las que llegan a vencimiento, por dentro ---\n`);
const venc = S7.filter((o) => o.queSalio === "vencimiento");
const vg = venc.filter((o) => o.resBueno > 1), vp = venc.filter((o) => o.resBueno < 1);
console.log(`  ${"acaban en verde".padEnd(32)} ${String(vg.length).padStart(6)}   ${(100 * vg.length / venc.length).toFixed(0).padStart(6)}%   ${$$(din(vg)).padStart(12)}`);
console.log(`  ${"acaban en rojo".padEnd(32)} ${String(vp.length).padStart(6)}   ${(100 * vp.length / venc.length).toFixed(0).padStart(6)}%   ${$$(din(vp)).padStart(12)}`);
console.log(`\n  ${"el ganador más grande".padEnd(40)} ${$$(Math.max(...S7.map((o) => (o.resBueno - 1) * o.coste * 100)))}`);
console.log(`  ${"el perdedor más grande".padEnd(40)} ${$$(Math.min(...S7.map((o) => (o.resBueno - 1) * o.coste * 100)))}`);
console.log(`  ${"ganador medio".padEnd(40)} ${$$(din(gana7) / gana7.length)}`);
console.log(`  ${"perdedor medio".padEnd(40)} ${$$(din(pierde7) / pierde7.length)}`);
console.log("");

// ═══ 8. EL PLAZO DE LAS 302 ═══
console.log(`\n═══ 8. ¿A CUÁNTO PLAZO SE COMPRAN? ═══\n`);
const S8 = ops.filter((o) => o.vsOIvispera != null && o.vsOIvispera > 0.60);
for (const o of S8) o.dteC = dteDe(o.dC, o.exp);
const mdd = (v) => { const s = v.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const rgg = (v, p) => { const s = v.slice().sort((a, b) => a - b); return s[Math.floor(s.length * p)]; };
const dd = S8.map((o) => o.dteC);
console.log(`  ${"días hasta vencer al comprar".padEnd(34)} valor`);
console.log(`  ${"el más corto".padEnd(34)} ${Math.min(...dd)}`);
console.log(`  ${"el 25% más corto, por debajo de".padEnd(34)} ${rgg(dd, 0.25)}`);
console.log(`  ${"MEDIANA".padEnd(34)} ${mdd(dd)}`);
console.log(`  ${"el 25% más largo, por encima de".padEnd(34)} ${rgg(dd, 0.75)}`);
console.log(`  ${"el más largo".padEnd(34)} ${Math.max(...dd)}`);

const $3 = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const din3 = (L) => L.reduce((a, o) => a + (o.resBueno - 1) * o.coste * 100, 0);
console.log(`\n  ${"cajón de plazo".padEnd(24)} cuántas  de cada 100  aciertos   RATIO         dinero   por contrato`);
for (const [a, b, n] of [[5, 15, "5 a 15 días"], [15, 30, "15 a 30"], [30, 60, "30 a 60"], [60, 120, "60 a 120"], [120, 250, "120 a 250"], [250, 99999, "más de 250"]]) {
  const L = S8.filter((o) => o.dteC >= a && o.dteC < b);
  if (!L.length) { console.log(`  ${n.padEnd(24)}      0`); continue; }
  const r = R(L, "resBueno"), d = din3(L);
  console.log(`  ${n.padEnd(24)} ${String(L.length).padStart(6)}   ${(100 * L.length / S8.length).toFixed(0).padStart(9)}%   ${r.pg.toFixed(0).padStart(6)}%   ${r.r.toFixed(2).padStart(5)}   ${$3(d).padStart(12)}   ${$3(d / L.length)}`);
}

// ¿y cuánto tiempo lo TIENES en cartera?
console.log(`\n  ${"cuánto tiempo lo tienes en cartera".padEnd(34)} días`);
const ret = S8.map((o) => { const i = o.camino.findIndex((x) => x.d === o.dSalida); return i >= 0 ? i + 1 : o.camino.length; });
console.log(`  ${"MEDIANA (días de bolsa)".padEnd(34)} ${mdd(ret)}`);
console.log(`  ${"el 25% más corto".padEnd(34)} ${rgg(ret, 0.25)}`);
console.log(`  ${"el 25% más largo".padEnd(34)} ${rgg(ret, 0.75)}`);
console.log(`  ${"el más largo".padEnd(34)} ${Math.max(...ret)}`);
console.log("");

// ═══ 9. LAS 195 QUE LLEGAN A VENCIMIENTO ═══
console.log(`\n═══ 9. LAS QUE LLEGAN A VENCIMIENTO ═══\n`);
const S9 = ops.filter((o) => o.vsOIvispera != null && o.vsOIvispera > 0.60);
for (const o of S9) o.dteC = dteDe(o.dC, o.exp);
const V = S9.filter((o) => o.queSalio === "vencimiento");
const md9 = (v) => { const s = v.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const rg9 = (v, p) => { const s = v.slice().sort((a, b) => a - b); return s[Math.floor(s.length * p)]; };
const d9 = V.map((o) => o.dteC);
console.log(`  ${V.length} contratos · días hasta vencer AL COMPRAR:\n`);
console.log(`  ${"".padEnd(34)} días`);
console.log(`  ${"el más corto".padEnd(34)} ${Math.min(...d9)}`);
console.log(`  ${"el 25% más corto, por debajo de".padEnd(34)} ${rg9(d9, 0.25)}`);
console.log(`  ${"MEDIANA".padEnd(34)} ${md9(d9)}`);
console.log(`  ${"el 25% más largo, por encima de".padEnd(34)} ${rg9(d9, 0.75)}`);
console.log(`  ${"el más largo".padEnd(34)} ${Math.max(...d9)}`);

const $9 = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const din9 = (L) => L.reduce((a, o) => a + (o.resBueno - 1) * o.coste * 100, 0);
console.log(`\n  ${"cajón de plazo".padEnd(20)} cuántas  de cada 100  en verde   RATIO         dinero   por contrato`);
for (const [a, b, n] of [[0, 15, "menos de 15 días"], [15, 30, "15 a 30"], [30, 60, "30 a 60"], [60, 120, "60 a 120"], [120, 250, "120 a 250"], [250, 99999, "más de 250"]]) {
  const L = V.filter((o) => o.dteC >= a && o.dteC < b);
  if (!L.length) { console.log(`  ${n.padEnd(20)}      0`); continue; }
  const r = R(L, "resBueno"), d = din9(L);
  console.log(`  ${n.padEnd(20)} ${String(L.length).padStart(6)}   ${(100 * L.length / V.length).toFixed(0).padStart(9)}%   ${r.pg.toFixed(0).padStart(6)}%   ${r.r.toFixed(2).padStart(5)}   ${$9(d).padStart(12)}   ${$9(d / L.length)}`);
}
console.log(`\n  ${"cuánto las tienes en cartera".padEnd(34)} días de bolsa`);
const ret9 = V.map((o) => o.camino.length);
console.log(`  ${"MEDIANA".padEnd(34)} ${md9(ret9)}`);
console.log(`  ${"el 25% más largo".padEnd(34)} ${rg9(ret9, 0.75)}`);
console.log(`  ${"el más largo".padEnd(34)} ${Math.max(...ret9)}`);
console.log(`\n  OJO: ${V.filter((o) => o.camino[o.camino.length - 1].d !== o.exp).length} de las ${V.length} NO llegaron al vencimiento de verdad — se les acabó la cadena el 19 de agosto.`);
console.log("");

// ═══ 10. ¿LOS 27 TRUNCADOS SON LOS DE MÁS DE 250 DÍAS? ═══
console.log(`\n═══ 10. LO QUE NO ESTÁ REALIZADO ═══\n`);
const S10 = ops.filter((o) => o.vsOIvispera != null && o.vsOIvispera > 0.60);
for (const o of S10) { o.dteC = dteDe(o.dC, o.exp); o.trunc = o.camino[o.camino.length - 1].d !== o.exp; }
const T = S10.filter((o) => o.trunc);
const $A = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const dA = (L) => L.reduce((a, o) => a + (o.resBueno - 1) * o.coste * 100, 0);
console.log(`  ${"".padEnd(44)} cuántas        dinero`);
console.log(`  ${"CERRADAS de verdad (llegaron a vencer o tocaron)".padEnd(44)} ${String(S10.length - T.length).padStart(6)}  ${$A(dA(S10.filter((o) => !o.trunc))).padStart(12)}`);
console.log(`  ${"ABIERTAS todavía (se acabó la cadena el 19-ago)".padEnd(44)} ${String(T.length).padStart(6)}  ${$A(dA(T)).padStart(12)}  ← papel, no cobrado`);
console.log(`  ${"".padEnd(44)} ${"—".repeat(6)}  ${"—".repeat(12)}`);
console.log(`  ${"TOTAL que se publicó".padEnd(44)} ${String(S10.length).padStart(6)}  ${$A(dA(S10)).padStart(12)}`);
console.log(`\n  los ${T.length} sin cerrar, por plazo:`);
for (const [a, b, n] of [[0, 30, "menos de 30 días"], [30, 120, "30 a 120"], [120, 250, "120 a 250"], [250, 99999, "más de 250"]]) {
  const L = T.filter((o) => o.dteC >= a && o.dteC < b);
  if (L.length) console.log(`     ${n.padEnd(20)} ${String(L.length).padStart(4)}   ${$A(dA(L))}`);
}
const rC = R(S10.filter((o) => !o.trunc), "resBueno");
console.log(`\n  ${"SÓLO con las cerradas de verdad".padEnd(44)}  n=${rC.n}  aciertos ${rC.pg.toFixed(0)}%  RATIO ${rC.r.toFixed(2)}  ${$A(dA(S10.filter((o) => !o.trunc)))}`);
console.log("");

// ═══ 11. CORREGIDO: sólo está SIN CERRAR el que salió por vencimiento sin llegar a vencer ═══
console.log(`\n═══ 11. REALIZADO CONTRA PAPEL (bien contado) ═══\n`);
const S11 = ops.filter((o) => o.vsOIvispera != null && o.vsOIvispera > 0.60);
for (const o of S11) {
  o.dteC = dteDe(o.dC, o.exp);
  // cerrado de verdad = tocó una barrera, O llegó al vencimiento real
  o.cerrado = o.queSalio !== "vencimiento" || o.camino[o.camino.length - 1].d === o.exp;
}
const cer = S11.filter((o) => o.cerrado), abi = S11.filter((o) => !o.cerrado);
const $B = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const dB = (L) => L.reduce((a, o) => a + (o.resBueno - 1) * o.coste * 100, 0);
console.log(`  ${"".padEnd(46)} cuántas   aciertos   RATIO         dinero`);
const rc = R(cer, "resBueno"), ra = abi.length ? R(abi, "resBueno") : null;
console.log(`  ${"CERRADAS — tocó barrera o venció de verdad".padEnd(46)} ${String(cer.length).padStart(6)}     ${rc.pg.toFixed(0).padStart(4)}%   ${rc.r.toFixed(2).padStart(5)}   ${$B(dB(cer)).padStart(12)}`);
if (ra) console.log(`  ${"SIN CERRAR — sigue viva el 19-ago (papel)".padEnd(46)} ${String(abi.length).padStart(6)}     ${ra.pg.toFixed(0).padStart(4)}%   ${ra.r.toFixed(2).padStart(5)}   ${$B(dB(abi)).padStart(12)}`);
console.log(`  ${"".padEnd(46)} ${"—".repeat(6)}                    ${"—".repeat(12)}`);
console.log(`  ${"TOTAL publicado".padEnd(46)} ${String(S11.length).padStart(6)}     ${R(S11, "resBueno").pg.toFixed(0).padStart(4)}%   ${R(S11, "resBueno").r.toFixed(2).padStart(5)}   ${$B(dB(S11)).padStart(12)}`);
if (abi.length) {
  console.log(`\n  las ${abi.length} sin cerrar, por plazo:`);
  for (const [a, b, n] of [[0, 30, "menos de 30 días"], [30, 120, "30 a 120"], [120, 250, "120 a 250"], [250, 99999, "más de 250"]]) {
    const L = abi.filter((o) => o.dteC >= a && o.dteC < b);
    if (L.length) console.log(`     ${n.padEnd(20)} ${String(L.length).padStart(4)}   ${$B(dB(L))}`);
  }
}
console.log("");

// ═══ 12. LA MISMA TABLA, SIN CONTRATOS DE MÁS DE 90 DÍAS ═══
console.log(`\n═══ 12. SIN CONTRATOS DE MÁS DE 90 DÍAS ═══\n`);
const S12 = ops.filter((o) => o.vsOIvispera != null && o.vsOIvispera > 0.60);
for (const o of S12) {
  o.dteC = dteDe(o.dC, o.exp);
  o.cerrado = o.queSalio !== "vencimiento" || o.camino[o.camino.length - 1].d === o.exp;
}
const C90 = S12.filter((o) => o.dteC <= 90);
const $C = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const dC_ = (L) => L.reduce((a, o) => a + (o.resBueno - 1) * o.coste * 100, 0);
console.log(`  de las ${S12.length} se quedan ${C90.length} (se caen ${S12.length - C90.length} de más de 90 días)\n`);
console.log(`  ${"sale por".padEnd(24)} cuántas  de cada 100         dinero   por contrato`);
for (const q of ["objetivo", "corte", "vencimiento"]) {
  const L = C90.filter((o) => o.queSalio === q);
  const nom = q === "objetivo" ? "el objetivo de 1.50x" : q === "corte" ? "el corte de 0.50x" : "vencimiento";
  if (!L.length) { console.log(`  ${nom.padEnd(24)}      0`); continue; }
  const d = dC_(L);
  console.log(`  ${nom.padEnd(24)} ${String(L.length).padStart(6)}   ${(100 * L.length / C90.length).toFixed(0).padStart(9)}%   ${$C(d).padStart(12)}   ${$C(d / L.length)}`);
}
console.log(`  ${"".padEnd(24)} ${"—".repeat(6)}              ${"—".repeat(12)}`);
console.log(`  ${"TOTAL".padEnd(24)} ${String(C90.length).padStart(6)}                ${$C(dC_(C90)).padStart(12)}   ${$C(dC_(C90) / C90.length)}`);

const r90 = R(C90, "resBueno"), rTodo = R(S12, "resBueno");
console.log(`\n  ${"".padEnd(30)}      n  aciertos   RATIO         dinero`);
console.log(`  ${"CON los de más de 90 días".padEnd(30)} ${String(rTodo.n).padStart(6)}     ${rTodo.pg.toFixed(0).padStart(3)}%   ${rTodo.r.toFixed(2).padStart(5)}   ${$C(dC_(S12)).padStart(12)}`);
console.log(`  ${"SIN los de más de 90 días".padEnd(30)} ${String(r90.n).padStart(6)}     ${r90.pg.toFixed(0).padStart(3)}%   ${r90.r.toFixed(2).padStart(5)}   ${$C(dC_(C90)).padStart(12)}`);

const ab90 = C90.filter((o) => !o.cerrado);
console.log(`\n  ${"sin cerrar el 19-ago".padEnd(30)} ${String(ab90.length).padStart(6)}                   ${$C(dC_(ab90))}  ← papel`);
const ce90 = C90.filter((o) => o.cerrado); const rc90 = R(ce90, "resBueno");
console.log(`  ${"SÓLO lo cerrado de verdad".padEnd(30)} ${String(rc90.n).padStart(6)}     ${rc90.pg.toFixed(0).padStart(3)}%   ${rc90.r.toFixed(2).padStart(5)}   ${$C(dC_(ce90)).padStart(12)}`);

// ganan / pierden
const g90 = C90.filter((o) => o.resBueno > 1), p90 = C90.filter((o) => o.resBueno < 1);
console.log(`\n  ${"".padEnd(30)} cuántas  de cada 100         dinero`);
console.log(`  ${"GANAN".padEnd(30)} ${String(g90.length).padStart(6)}   ${(100 * g90.length / C90.length).toFixed(0).padStart(9)}%   ${$C(dC_(g90)).padStart(12)}`);
console.log(`  ${"PIERDEN".padEnd(30)} ${String(p90.length).padStart(6)}   ${(100 * p90.length / C90.length).toFixed(0).padStart(9)}%   ${$C(dC_(p90)).padStart(12)}`);
console.log(`\n  ${"coste de comprar las ".padEnd(30)}${C90.length}: ${$C(C90.reduce((a, o) => a + o.coste * 100, 0))}  ·  sobre lo invertido ${(100 * dC_(C90) / C90.reduce((a, o) => a + o.coste * 100, 0)).toFixed(1)}%`);
console.log(`  ${"contratos al día".padEnd(30)} ${(C90.length / new Set(C90.map((o) => o.dC)).size).toFixed(1)}`);
console.log("");

// ═══ 13. SIN OBJETIVO Y SIN CORTE: comprar y aguantar a vencimiento ═══
console.log(`\n═══ 13. SIN OBJETIVO Y SIN CORTE (comprar y aguantar) ═══\n`);
const S13 = ops.filter((o) => o.vsOIvispera != null && o.vsOIvispera > 0.60);
for (const o of S13) { o.dteC = dteDe(o.dC, o.exp); o.aguantar = o.camino[o.camino.length - 1].mult; }
const A = S13.filter((o) => o.dteC <= 90);
const $D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const dinA = (L, campo) => L.reduce((a, o) => a + (o[campo] - 1) * o.coste * 100, 0);
const RD = (L, campo) => {
  let g = 0, p = 0, gana = 0;
  for (const o of L) { const x = (o[campo] - 1) * o.coste * 100; if (x > 0) { g += x; gana++; } else p += -x; }
  return { n: L.length, pg: 100 * gana / L.length, g, p, r: p ? g / p : Infinity, neto: g - p };
};
const conR = RD(A, "resBueno"), sinR = RD(A, "aguantar");
console.log(`  ${"".padEnd(34)}     n  aciertos      ganado     perdido   RATIO         neto   por contrato`);
const FD = (nom, r) => console.log(`  ${nom.padEnd(34)} ${String(r.n).padStart(5)}     ${r.pg.toFixed(0).padStart(3)}%  ${$D(r.g).padStart(10)}  ${$D(r.p).padStart(10)}   ${r.r.toFixed(2).padStart(5)}   ${$D(r.neto).padStart(11)}   ${$D(r.neto / r.n)}`);
FD("CON objetivo 1.50x y corte 0.50x", conR);
FD("SIN nada: comprar y aguantar", sinR);

console.log(`\n  ¿qué pasa con cada grupo al quitar las reglas?\n`);
console.log(`  ${"los que ANTES salían por...".padEnd(30)} cuántas   con reglas    sin reglas    diferencia`);
for (const q of ["objetivo", "corte", "vencimiento"]) {
  const L = A.filter((o) => o.queSalio === q);
  if (!L.length) continue;
  const c = dinA(L, "resBueno"), s = dinA(L, "aguantar");
  const nom = q === "objetivo" ? "el objetivo de 1.50x" : q === "corte" ? "el corte de 0.50x" : "vencimiento";
  console.log(`  ${nom.padEnd(30)} ${String(L.length).padStart(6)}   ${$D(c).padStart(11)}   ${$D(s).padStart(11)}   ${$D(s - c).padStart(11)}`);
}

const gA = A.filter((o) => o.aguantar > 1), pA = A.filter((o) => o.aguantar < 1), cero = A.filter((o) => o.aguantar < 0.05);
console.log(`\n  ${"".padEnd(30)} cuántas  de cada 100         dinero`);
console.log(`  ${"GANAN".padEnd(30)} ${String(gA.length).padStart(6)}   ${(100 * gA.length / A.length).toFixed(0).padStart(9)}%   ${$D(dinA(gA, "aguantar")).padStart(12)}`);
console.log(`  ${"PIERDEN".padEnd(30)} ${String(pA.length).padStart(6)}   ${(100 * pA.length / A.length).toFixed(0).padStart(9)}%   ${$D(dinA(pA, "aguantar")).padStart(12)}`);
console.log(`  ${"de ésos, a cero (menos de 0.05x)".padEnd(30)} ${String(cero.length).padStart(6)}   ${(100 * cero.length / A.length).toFixed(0).padStart(9)}%   ${$D(dinA(cero, "aguantar")).padStart(12)}`);
const coste13 = A.reduce((a, o) => a + o.coste * 100, 0);
console.log(`\n  ${"coste de comprar los ".padEnd(24)}${A.length}: ${$D(coste13)}  ·  sobre lo invertido ${(100 * sinR.neto / coste13).toFixed(1)}%`);
console.log(`  ${"ganador medio".padEnd(24)} ${$D(dinA(gA, "aguantar") / gA.length)}   ·  perdedor medio ${$D(dinA(pA, "aguantar") / pA.length)}`);
console.log("");
