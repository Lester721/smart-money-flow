// LA PRUEBA DE LESTER — con dato limpio, por fin.
//
// Sus palabras: «comprar aquellos contratos justo el día después de que tuvieron un aumento
// significativo de open interest o notional y cuya compra fue agresiva (ask or above) y de más
// de $500,000, sólo en 2026. ¿Después de esa compra, en algún momento antes de su expiración
// duplicaron o más su valor?»
//
// TODO el dato pasa por el guardián (datos.mjs). Si una carpeta no tiene manifiesto verificado,
// esto no corre. La cinta vieja está marcada como "mira_al_futuro" y no se puede abrir.
//
// LO QUE SE MIDE, EN ORDEN — cada condición suya, sumada a la anterior:
//   A. operaciones de más de $500,000                          (su condición de tamaño)
//   B. + pagadas al ask o por encima                           (su condición de agresividad)
//   C. + con el interés abierto subiendo al día siguiente      (su condición 1)
//
// Y EL LISTÓN, como una fila más: los mismos días, comprando un contrato cualquiera al 7% del
// dinero con ~60 días. Si la señal no lo bate, no hay señal.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const OBJETIVO = 2, DTE_MIN = 5, OTM_CIEGO = 0.07, DTE_CIEGO = 60;

const cad = abrir("cadenas");
const oi = abrir("oi-ancho");
const flu = abrir("flujo-limpio");

/** paridad put-call en el vencimiento más cercano con al menos un día por delante */
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

/** compra al ask en dC y sigue el bid hasta exp. Devuelve el múltiplo (2 si dobló). */
function seguir(tk, dC, exp, K, l) {
  const ch = cad.leer(tk, dC);
  const p0 = ch?.[exp]?.[`${K}|${l}`];
  if (!p0 || !(p0[1] > 0)) return null;
  const coste = p0[1], ds = cad.dias(tk);
  let ult = null, n = 0, dias = 0;
  for (const d of ds) {
    if (d <= dC) continue;
    if (d > exp) break;
    const p = cad.leer(tk, d)?.[exp]?.[`${K}|${l}`];
    if (!p) continue;
    n++; dias++;
    if (p[0] / coste >= OBJETIVO) return { ult: OBJETIVO, disp: true, dias, coste };
    ult = p[0] / coste;
  }
  return n ? { ult, disp: false, dias, coste } : null;
}

/** el contrato ciego de ese día y ese lado: ~7% fuera, ~60 días */
function ciego(tk, d, l) {
  const ch = cad.leer(tk, d); if (!ch) return null;
  const S = spotOk(ch, d); if (!S) return null;
  let exp = null, md = Infinity;
  for (const e of Object.keys(ch)) { const t = dteDe(d, e); if (t < 20) continue; const x = Math.abs(t - DTE_CIEGO); if (x < md) { md = x; exp = e; } }
  if (!exp) return null;
  const g = ch[exp], obj = l === "C" ? S * (1 + OTM_CIEGO) : S * (1 - OTM_CIEGO);
  let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== l) continue;
    const k = Number(cl.slice(0, -2)); const x = Math.abs(k - obj);
    if (x < dm) { dm = x; K = k; }
  }
  if (K == null) return null;
  const r = seguir(tk, d, exp, K, l);
  return r ? { ...r, K, exp, S } : null;
}

// ── 1. recoger las operaciones grandes ─────────────────────────────────────
const bruto = [];
for (const f of readdirSync(flu.dir)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g;
  let ops; try { ops = JSON.parse(readFileSync(join(flu.dir, f), "utf8")); } catch { continue; }
  for (const o of ops) bruto.push({ ...o, tk, dia });
}
console.log(`\n  ${bruto.length.toLocaleString("en-US")} operaciones de más de $500,000 en enero de 2026\n`);

// ── 2. aplicar las condiciones, una encima de otra ─────────────────────────
const ds = (tk) => cad.dias(tk);
const siguienteDia = (tk, d) => { const a = ds(tk); const i = a.findIndex((x) => x > d); return i < 0 ? null : a[i]; };

const grupos = { A: new Map(), B: new Map(), C: new Map() };
let sinManana = 0, cortoPlazo = 0, sinOI = 0;
for (const o of bruto) {
  if (dteDe(o.dia, o.exp) < DTE_MIN) { cortoPlazo++; continue; }
  const man = siguienteDia(o.tk, o.dia); if (!man) { sinManana++; continue; }
  const clave = `${o.tk}|${o.exp}|${o.K}|${o.l}|${o.dia}`;
  const fila = { tk: o.tk, exp: o.exp, K: o.K, l: o.l, dia: o.dia, man, prima: o.prima, precio: o.precio, ask: o.ask };
  grupos.A.set(clave, fila);                                        // A: sólo tamaño
  const agresiva = o.ask > 0 && o.precio >= o.ask;
  if (!agresiva) continue;
  grupos.B.set(clave, fila);                                        // B: + al ask o por encima
  const oiH = oi.leer(o.tk, o.dia)?.[o.exp]?.[`${o.K}|${o.l}`];
  const oiM = oi.leer(o.tk, man)?.[o.exp]?.[`${o.K}|${o.l}`];
  if (oiH == null || oiM == null) { sinOI++; continue; }
  if (!(oiM > oiH)) continue;
  grupos.C.set(clave, { ...fila, subeOI: oiM - oiH });               // C: + el OI sube
}
console.log(`  descartes: vence en menos de ${DTE_MIN} días ${cortoPlazo} · sin día siguiente ${sinManana} · sin dato de OI ${sinOI}\n`);

// ── 3. seguir cada grupo, y su listón ──────────────────────────────────────
function medir(mapa) {
  const señal = [], liston = [];
  for (const s of mapa.values()) {
    const r = seguir(s.tk, s.man, s.exp, s.K, s.l);
    if (!r) continue;
    const S = spotOk(cad.leer(s.tk, s.man) ?? {}, s.man);
    señal.push({ ...s, ...r, dist: S ? (s.l === "C" ? (s.K - S) / S : (S - s.K) / S) : null, dte: dteDe(s.man, s.exp) });
    const c = ciego(s.tk, s.man, s.l);
    if (c) liston.push({ ...s, ...c });
  }
  return { señal, liston };
}
const R = (L) => {
  if (!L.length) return null;
  const d = L.filter((o) => o.disp).length;
  let g = 0, p = 0;
  for (const o of L) { const x = 1000 * (o.ult - 1); if (x > 0) g += x; else p += -x; }
  return { n: L.length, d, pd: 100 * d / L.length, g, p, r: p ? g / p : Infinity, neto: g - p };
};
const F = (nom, r) => {
  if (!r) { console.log(`  ${nom.padEnd(38)}     —`); return; }
  console.log(`  ${nom.padEnd(38)} ${String(r.n).padStart(5)}   ${String(r.d).padStart(4)} (${r.pd.toFixed(1).padStart(5)}%)  $${Math.round(r.g).toLocaleString("en-US").padStart(9)}  $${Math.round(r.p).toLocaleString("en-US").padStart(9)}  ${(r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(6)}   ${r.neto >= 0 ? "+" : "−"}$${Math.abs(Math.round(r.neto)).toLocaleString("en-US")}`);
};

console.log(`=== LA PRUEBA · enero 2026 · arriesgando $1,000 por señal ===\n`);
console.log(`  ${"grupo".padEnd(38)}     n   doblaron       ganado    perdido   RATIO       neto`);
const res = {};
for (const [k, nom] of [["A", "A · más de $500,000"], ["B", "B · + al ask o por encima"], ["C", "C · + el interés abierto SUBE"]]) {
  const m = medir(grupos[k]); res[k] = m;
  F(nom, R(m.señal));
}
console.log(`  ${"—".repeat(38)}`);
F("EL LISTÓN · contrato ciego, mismos días", R(res.C.liston));
F("EL LISTÓN · mismos días del grupo B", R(res.B.liston));

// ── 4. cortes, como información ────────────────────────────────────────────
const C = res.C.señal;
if (C.length) {
  console.log(`\n  --- el grupo C por dentro (información, no resultado) ---\n`);
  console.log(`  ${"corte".padEnd(38)}     n   doblaron       ganado    perdido   RATIO       neto`);
  for (const [a, b, n] of [[-9, 0, "dentro del dinero"], [0, 0.07, "0% a 7% fuera"], [0.07, 0.15, "7% a 15% fuera"], [0.15, 9, "más del 15% fuera"]])
    F("  " + n, R(C.filter((o) => o.dist != null && o.dist >= a && o.dist < b)));
  console.log("");
  for (const [a, b, n] of [[5, 30, "5 a 30 días"], [30, 60, "30 a 60"], [60, 120, "60 a 120"], [120, 9999, "más de 120"]])
    F("  " + n, R(C.filter((o) => o.dte >= a && o.dte < b)));
  console.log("");
  F("  calls", R(C.filter((o) => o.l === "C")));
  F("  puts", R(C.filter((o) => o.l === "P")));
  console.log("");
  for (const t of [...new Set(C.map((o) => o.tk))].sort()) F("  " + t, R(C.filter((o) => o.tk === t)));

  const md = (v) => (v.length ? v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] : NaN);
  const no = C.filter((o) => !o.disp);
  console.log(`\n  --- comprobaciones ---\n`);
  console.log(`  ${"qué".padEnd(52)} valor`);
  console.log(`  ${"mediana de días a vencimiento".padEnd(52)} ${md(C.map((o) => o.dte))}`);
  console.log(`  ${"mediana de distancia al dinero".padEnd(52)} ${(100 * md(C.filter((o) => o.dist != null).map((o) => o.dist))).toFixed(1)}%`);
  console.log(`  ${"mediana de lo que cuesta el contrato".padEnd(52)} $${md(C.map((o) => o.coste)).toFixed(2)}`);
  console.log(`  ${"las que NO doblan acaban de media en".padEnd(52)} ${(no.reduce((a, o) => a + o.ult, 0) / (no.length || 1)).toFixed(2)}x`);
  console.log(`  ${"de ésas, cuántas a cero (menos de 0.10x)".padEnd(52)} ${no.filter((o) => o.ult < 0.10).length} de ${no.length}`);
  console.log(`  ${"días retenido de las que doblan (mediana)".padEnd(52)} ${md(C.filter((o) => o.disp).map((o) => o.dias))}`);
  console.log(`  ${"tickers distintos / días distintos".padEnd(52)} ${new Set(C.map((o) => o.tk)).size} / ${new Set(C.map((o) => o.man)).size}`);
}
console.log("");
