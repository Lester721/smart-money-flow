// LA PRUEBA DE LESTER, CON DELTA POR ENCIMA DE 0.5
//
// «Recuerdas lo que pedí que midieras. Mídelo en enero pero con deltas de mayor de .5. Vas a
//  comprar en enero y vas a ver si se pudo haber vendido esas opciones con ganancia en el 2026.»
//
// El delta de la cinta era un Black-Scholes, no un dato, y está prohibido. Se usa el equivalente
// que SÍ es dato: delta por encima de 0.5 = la opción está DENTRO DEL DINERO. Se calcula con el
// strike y el precio real de la acción (paridad put-call). Call dentro = strike por debajo del
// precio. Put dentro = strike por encima.
//
// Compra: el día siguiente al golpe, al ASK. Seguimiento: todo 2026 (hasta vencer, o hasta el
// 19 de agosto que es donde acaban las cadenas). Venta: al BID.
//
// Se miden las DOS cosas, porque él ha pedido las dos en momentos distintos:
//   · ¿se pudo vender CON GANANCIA en algún momento?   (bid > lo pagado)
//   · ¿llegó a DOBLAR?                                  (bid >= 2x lo pagado)
// Y también qué pasa si NO vendes y lo dejas correr, que es lo único que se puede ejecutar sin
// adivinar el máximo.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const DTE_MIN = 5;

const cad = abrir("cadenas");
const flu = abrir("flujo-limpio");

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

// ── recoger los golpes de enero, agresivos, y quedarse con los que están DENTRO del dinero ──
const señales = new Map();
let noAgresiva = 0, fuera = 0, corto = 0;
for (const f of readdirSync(flu.dir)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g;
  let ops; try { ops = JSON.parse(readFileSync(join(flu.dir, f), "utf8")); } catch { continue; }
  for (const o of ops) {
    if (!(o.ask > 0 && o.precio >= o.ask)) { noAgresiva++; continue; }     // al ask o por encima
    if (dteDe(dia, o.exp) < DTE_MIN) { corto++; continue; }
    const ds = cad.dias(tk); const i = ds.findIndex((x) => x > dia);
    if (i < 0) continue; const dC = ds[i]; if (dC >= o.exp) continue;
    const ch = cad.leer(tk, dC); if (!ch) continue;
    const S = spotOk(ch, dC); if (!S) continue;
    const dentro = o.l === "C" ? o.K < S : o.K > S;                        // delta por encima de 0.5
    if (!dentro) { fuera++; continue; }
    const prof = o.l === "C" ? (S - o.K) / S : (o.K - S) / S;              // cuánto DENTRO está
    const clave = `${tk}|${o.exp}|${o.K}|${o.l}|${dia}`;
    if (!señales.has(clave)) señales.set(clave, { tk, exp: o.exp, K: o.K, l: o.l, dia, dC, S, prof, prima: o.prima });
  }
}
console.log(`\n  golpes de enero descartados: no agresivos ${noAgresiva.toLocaleString("en-US")} · FUERA del dinero ${fuera.toLocaleString("en-US")} · vencen en menos de ${DTE_MIN} días ${corto}`);
console.log(`  quedan ${señales.size} contratos DENTRO del dinero (delta por encima de 0.5)\n`);

// ── seguir cada uno durante todo 2026 ──
const ops = [];
let truncados = 0;
for (const s of señales.values()) {
  const ch = cad.leer(s.tk, s.dC);
  const p0 = ch?.[s.exp]?.[`${s.K}|${s.l}`];
  if (!p0 || !(p0[1] > 0)) continue;
  const coste = p0[1];
  const ds = cad.dias(s.tk);
  let mejor = null, dMejor = null, ult = null, ultD = null, n = 0, dias2x = null, diasGan = null;
  for (const d of ds) {
    if (d <= s.dC) continue;
    if (d > s.exp) break;
    const p = cad.leer(s.tk, d)?.[s.exp]?.[`${s.K}|${s.l}`];
    if (!p) continue;
    n++;
    const m = p[0] / coste;
    ult = m; ultD = d;
    if (mejor == null || m > mejor) { mejor = m; dMejor = d; }
    if (diasGan == null && m > 1) diasGan = n;
    if (dias2x == null && m >= 2) dias2x = n;
  }
  if (n === 0) continue;
  const llegaVenc = ultD === s.exp;
  if (!llegaVenc) truncados++;
  ops.push({ ...s, coste, mejor, dMejor, ult, ultD, dias: n, llegaVenc, dias2x, diasGan,
             gano: mejor > 1, doblo: mejor >= 2 });
}
console.log(`  seguidos ${ops.length} · sin llegar a vencimiento (las cadenas acaban el 19-ago) ${truncados}\n`);

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "—");
const md = (v) => (v.length ? v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] : NaN);

console.log(`=== ¿SE PUDO VENDER CON GANANCIA EN 2026? ===\n`);
console.log(`  ${"".padEnd(30)}   cuántas   de cada 100`);
console.log(`  ${"contratos comprados en enero".padEnd(30)} ${String(ops.length).padStart(9)}`);
console.log(`  ${"se pudo vender CON GANANCIA".padEnd(30)} ${String(ops.filter((o) => o.gano).length).padStart(9)}   ${pct(ops.filter((o) => o.gano).length, ops.length)}`);
console.log(`  ${"llegó a DOBLAR".padEnd(30)} ${String(ops.filter((o) => o.doblo).length).padStart(9)}   ${pct(ops.filter((o) => o.doblo).length, ops.length)}`);
console.log(`  ${"llegó a TRIPLICAR".padEnd(30)} ${String(ops.filter((o) => o.mejor >= 3).length).padStart(9)}   ${pct(ops.filter((o) => o.mejor >= 3).length, ops.length)}`);

console.log(`\n=== Y CUÁNTO DINERO, arriesgando $1,000 en cada uno ===\n`);
const R = (L, campo) => {
  if (!L.length) return null;
  let g = 0, p = 0, gana = 0;
  for (const o of L) { const m = campo(o); const x = 1000 * (m - 1); if (x > 0) { g += x; gana++; } else p += -x; }
  return { n: L.length, gana, pg: 100 * gana / L.length, g, p, r: p ? g / p : Infinity, neto: g - p };
};
const F = (nom, r) => {
  if (!r) { console.log(`  ${nom.padEnd(40)}    —`); return; }
  console.log(`  ${nom.padEnd(40)} ${String(r.n).padStart(5)}  ${r.pg.toFixed(1).padStart(5)}%  $${Math.round(r.g).toLocaleString("en-US").padStart(9)}  $${Math.round(r.p).toLocaleString("en-US").padStart(9)}  ${(r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(6)}  ${r.neto >= 0 ? "+" : "−"}$${Math.abs(Math.round(r.neto)).toLocaleString("en-US")}`);
};
console.log(`  ${"cómo se vende".padEnd(40)}     n  aciertos      ganado    perdido   RATIO       neto`);
F("vendiendo en el MEJOR momento", R(ops, (o) => o.mejor));
F("vendiendo el primer día que dobla (2x)", R(ops, (o) => (o.doblo ? 2 : o.ult)));
F("vendiendo el primer día que va en verde", R(ops, (o) => (o.gano ? 1 + (o.mejor > 1 ? 0.0001 : 0) : o.ult)));
F("SIN vender: aguantar a vencimiento", R(ops, (o) => o.ult));

console.log(`\n  --- por lo DENTRO del dinero que estaba (información) ---\n`);
console.log(`  ${"".padEnd(40)}     n  aciertos      ganado    perdido   RATIO       neto`);
for (const [a, b, n] of [[0, 0.03, "poco dentro (0% a 3%)"], [0.03, 0.10, "3% a 10% dentro"], [0.10, 0.25, "10% a 25% dentro"], [0.25, 9, "muy dentro (más del 25%)"]])
  F("  " + n + " · al doblar", R(ops.filter((o) => o.prof >= a && o.prof < b), (o) => (o.doblo ? 2 : o.ult)));

console.log("");
for (const l of ["C", "P"]) F(`  ${l === "C" ? "calls" : "puts"} · al doblar`, R(ops.filter((o) => o.l === l), (o) => (o.doblo ? 2 : o.ult)));
console.log("");
for (const t of [...new Set(ops.map((o) => o.tk))].sort())
  F(`  ${t} · al doblar`, R(ops.filter((o) => o.tk === t), (o) => (o.doblo ? 2 : o.ult)));

console.log(`\n  --- comprobaciones ---\n`);
console.log(`  ${"qué".padEnd(50)} valor`);
console.log(`  ${"lo que cuesta el contrato (mediana)".padEnd(50)} $${(md(ops.map((o) => o.coste)) * 100).toLocaleString("en-US")}`);
console.log(`  ${"días a vencimiento al comprar (mediana)".padEnd(50)} ${md(ops.map((o) => dteDe(o.dC, o.exp)))}`);
console.log(`  ${"lo DENTRO del dinero que estaba (mediana)".padEnd(50)} ${(100 * md(ops.map((o) => o.prof))).toFixed(1)}%`);
console.log(`  ${"el MEJOR momento medio (mediana)".padEnd(50)} ${md(ops.map((o) => o.mejor)).toFixed(2)}x`);
console.log(`  ${"días hasta el mejor momento (mediana)".padEnd(50)} ${md(ops.filter((o) => o.dMejor).map((o) => o.dias))}`);
console.log(`  ${"días hasta poder vender en verde (mediana)".padEnd(50)} ${md(ops.filter((o) => o.diasGan).map((o) => o.diasGan))}`);
console.log(`  ${"si aguantas: acaban de media en".padEnd(50)} ${(ops.reduce((a, o) => a + o.ult, 0) / ops.length).toFixed(2)}x`);
console.log(`  ${"de los que NO doblan, cuántos a cero".padEnd(50)} ${ops.filter((o) => !o.doblo && o.ult < 0.10).length} de ${ops.filter((o) => !o.doblo).length}`);
console.log("");

// ═══ LA PREGUNTA QUE PIDE ESTE RESULTADO: ¿a qué múltiplo hay que vender? ═══
// El 82% se pudo vender con ganancia, pero el mejor momento medio fue 1.30x. O sea que la
// ganancia estaba ahí pero era pequeña. Salir al 2x se pierde casi todas. Se barre el múltiplo.
console.log(`\n=== ¿A QUÉ MÚLTIPLO CONVIENE VENDER? (mismos 839 contratos) ===\n`);
console.log(`  vender al   cuántas llegan     ganado    perdido   RATIO         neto   $ por contrato`);
for (const obj of [1.05, 1.10, 1.15, 1.20, 1.30, 1.50, 1.75, 2.00, 2.50, 3.00]) {
  let g = 0, p = 0, tocan = 0;
  for (const o of ops) {
    const m = o.mejor >= obj ? obj : o.ult;      // si toca el objetivo, sale ahí; si no, aguanta
    if (o.mejor >= obj) tocan++;
    const x = 1000 * (m - 1);
    if (x > 0) g += x; else p += -x;
  }
  const neto = g - p;
  console.log(`  ${obj.toFixed(2).padStart(9)}x  ${String(tocan).padStart(5)} (${(100 * tocan / ops.length).toFixed(0).padStart(3)}%)  $${Math.round(g).toLocaleString("en-US").padStart(9)}  $${Math.round(p).toLocaleString("en-US").padStart(9)}  ${(p ? g / p : Infinity).toFixed(2).padStart(6)}  ${neto >= 0 ? "+" : "−"}$${Math.abs(Math.round(neto)).toLocaleString("en-US").padStart(8)}   ${neto >= 0 ? "+" : "−"}$${Math.abs(Math.round(neto / ops.length))}`);
}
// y con corte de pérdidas
console.log(`\n=== LO MISMO, PERO CORTANDO LAS PÉRDIDAS AL 50% ===\n`);
console.log(`  vender al        ganado    perdido   RATIO         neto`);
for (const obj of [1.15, 1.20, 1.30, 1.50, 2.00]) {
  let g = 0, p = 0;
  for (const o of ops) {
    const m = o.mejor >= obj ? obj : Math.max(o.ult, 0.5);   // suelo aproximado: no bajar de 0.5x
    const x = 1000 * (m - 1);
    if (x > 0) g += x; else p += -x;
  }
  console.log(`  ${obj.toFixed(2).padStart(9)}x  $${Math.round(g).toLocaleString("en-US").padStart(9)}  $${Math.round(p).toLocaleString("en-US").padStart(9)}  ${(p ? g / p : Infinity).toFixed(2).padStart(6)}  ${g - p >= 0 ? "+" : "−"}$${Math.abs(Math.round(g - p)).toLocaleString("en-US")}`);
}
console.log("");

// ═══ EL DESGLOSE DE LA REGLA GANADORA: vender al 1.50x, cortar al 50% ═══
const OBJ = 1.50, SUELO = 0.50;
const grupos = { toca: [], verde: [], rojo: [], suelo: [] };
for (const o of ops) {
  if (o.mejor >= OBJ) grupos.toca.push(o);
  else if (o.ult >= 1) grupos.verde.push(o);
  else if (o.ult >= SUELO) grupos.rojo.push(o);
  else grupos.suelo.push(o);
}
const dinero = (L, m) => L.reduce((a, o) => a + 1000 * ((typeof m === "function" ? m(o) : m) - 1), 0);
console.log(`\n=== DESGLOSE · vender al ${OBJ}x, cortar al ${SUELO}x · ${ops.length} contratos comprados ===\n`);
console.log(`  ${"qué pasó".padEnd(40)} cuántas  de cada 100        dinero   por contrato`);
const filas = [
  ["llegó a 1.50x y se vendió ahí", grupos.toca, OBJ],
  ["no llegó, pero acabó en verde", grupos.verde, (o) => o.ult],
  ["acabó en rojo, sin tocar el suelo", grupos.rojo, (o) => o.ult],
  ["tocó el suelo del 50% y se cortó", grupos.suelo, SUELO],
];
let tot = 0;
for (const [nom, L, m] of filas) {
  const d = dinero(L, m); tot += d;
  console.log(`  ${nom.padEnd(40)} ${String(L.length).padStart(6)}   ${(100 * L.length / ops.length).toFixed(1).padStart(6)}%   ${d >= 0 ? "+" : "−"}$${Math.abs(Math.round(d)).toLocaleString("en-US").padStart(8)}   ${d >= 0 ? "+" : "−"}$${Math.abs(Math.round(d / (L.length || 1)))}`);
}
console.log(`  ${"".padEnd(40)} ${"—".repeat(6)}            ${"—".repeat(9)}`);
console.log(`  ${"TOTAL".padEnd(40)} ${String(ops.length).padStart(6)}            ${tot >= 0 ? "+" : "−"}$${Math.abs(Math.round(tot)).toLocaleString("en-US").padStart(8)}   ${tot >= 0 ? "+" : "−"}$${Math.abs(Math.round(tot / ops.length))}`);

// ── lo que hace falta en la cuenta ──
const md2 = (v) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
const diasDist = [...new Set(ops.map((o) => o.dC))].sort();
console.log(`\n=== LO QUE HACE FALTA PARA COGERLAS TODAS ===\n`);
console.log(`  ${"qué".padEnd(46)} valor`);
console.log(`  ${"contratos en el mes".padEnd(46)} ${ops.length}`);
console.log(`  ${"días de bolsa con señal".padEnd(46)} ${diasDist.length}`);
console.log(`  ${"contratos por día".padEnd(46)} ${(ops.length / diasDist.length).toFixed(0)}`);
console.log(`  ${"lo que cuesta el contrato (mediana)".padEnd(46)} $${(md2(ops.map((o) => o.coste)) * 100).toLocaleString("en-US")}`);
console.log(`  ${"lo que cuesta el contrato (el más caro)".padEnd(46)} $${Math.round(Math.max(...ops.map((o) => o.coste)) * 100).toLocaleString("en-US")}`);
console.log(`  ${"comprando UNO de cada uno costaría".padEnd(46)} $${Math.round(ops.reduce((a, o) => a + o.coste * 100, 0)).toLocaleString("en-US")}`);
// cuántas abiertas a la vez
const ev = [];
for (const o of ops) { ev.push([o.dC, 1]); ev.push([o.mejor >= OBJ ? o.dC : (o.ultD ?? o.dC), -1]); }
ev.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
let ab = 0, mx = 0; for (const [, d] of ev) { ab += d; if (ab > mx) mx = ab; }
console.log(`  ${"como mucho, abiertas a la vez".padEnd(46)} ${mx}`);
console.log("");
