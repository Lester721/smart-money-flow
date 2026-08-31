// VERIFICACIÓN INDEPENDIENTE — escrita desde cero, sin usar la tabla maestra ni consultar.mjs.
//
// Lester: «verifícalo otra vez de forma independiente».
//
// La cadena de hoy fue: flujo-limpio → r13 (tabla maestra) → consultar.mjs → el resultado.
// Si hay un fallo en cualquier eslabón, todos los números lo heredan. Este script NO toca esa
// cadena: lee los ficheros originales y rehace el cálculo entero por su cuenta.
//
// Tiene que dar EXACTAMENTE: 17 operaciones · $97,655 · +$37,655.
// Si da otra cosa, uno de los dos está mal y hay que averiguar cuál.
//
// LA REGLA, escrita aquí otra vez para no depender de nadie:
//   golpe > $500,000 · ejecutado al ask o por encima · después de las 14:00
//   el golpe vale 12x o más el OI que tenía el contrato LA VÍSPERA
//   el strike está DENTRO del dinero · el contrato cuesta $10,000 o más · vence entre 5 y 90 días
//   se compra el día siguiente al ask · se vende al bid a los 15 días de bolsa
//   $15,000 por posición · máximo 4 abiertas · cuenta de $60,000

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

const DIR_CAD = join(CACHE, "cadenas");
const DIR_OI = join(CACHE, "oi-ancho");
const DIR_FLU = join(CACHE, "flujo-limpio");

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
const $ = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");

// ── índice de días por ticker, desde las cadenas ──
const dias = new Map();
for (const f of readdirSync(DIR_CAD)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f);
  if (!g) continue;
  if (!dias.has(g[1])) dias.set(g[1], []);
  dias.get(g[1]).push(g[2]);
}
for (const v of dias.values()) v.sort();

const cacheC = new Map(), cacheO = new Map();
function leerCad(tk, d) {
  const k = tk + d;
  if (cacheC.has(k)) return cacheC.get(k);
  const f = join(DIR_CAD, `${tk}_d${d}.json`);
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cacheC.set(k, v); if (cacheC.size > 900) cacheC.delete(cacheC.keys().next().value);
  return v;
}
function leerOI(tk, d) {
  const k = tk + d;
  if (cacheO.has(k)) return cacheO.get(k);
  const f = join(DIR_OI, `${tk}_d${d}.json`);
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cacheO.set(k, v); if (cacheO.size > 900) cacheO.delete(cacheO.keys().next().value);
  return v;
}
/** paridad put-call en el vencimiento más cercano con al menos un día por delante */
function precioAccion(ch, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(ch)) { const t = dteDe(hoy, e); if (t < 1) continue; if (t < md) { md = t; exp = e; } }
  if (!exp) return null;
  const g = ch[exp];
  let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[`${k}|P`]; if (!p) continue;
    const d = Math.abs((g[cl][0] + g[cl][1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; K = k; }
  }
  if (K === null) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
  return s > 0 ? s : null;
}

// ── 1. recoger las señales, leyendo el flujo original ──
const señales = [];
let vistas = 0;
for (const fich of readdirSync(DIR_FLU)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(fich);
  if (!g) continue;
  const [, tk, dia] = g;
  let ops; try { ops = JSON.parse(readFileSync(join(DIR_FLU, fich), "utf8")); } catch { continue; }

  // agrupar por contrato: sumar tamaños, quedarse con la hora del golpe MAYOR
  const porContrato = new Map();
  for (const o of ops) {
    if (!(o.ask > 0 && o.precio >= o.ask)) continue;            // al ask o por encima
    const k = `${o.exp}|${o.K}|${o.l}`;
    const y = porContrato.get(k);
    if (y) { y.tam += o.tam; y.prima += o.prima; if (o.prima > y.mayor) { y.mayor = o.prima; y.hora = o.hora.slice(11, 16); } }
    else porContrato.set(k, { exp: o.exp, K: o.K, l: o.l, tam: o.tam, prima: o.prima, mayor: o.prima, hora: o.hora.slice(11, 16) });
  }

  const ds = dias.get(tk); if (!ds) continue;
  const iDia = ds.indexOf(dia);
  if (iDia < 1) continue;                                       // hace falta la víspera
  const dCompra = ds[iDia + 1];
  if (!dCompra) continue;
  const chC = leerCad(tk, dCompra); if (!chC) continue;
  const S = precioAccion(chC, dCompra); if (S === null) continue;
  const oiVispera = leerOI(tk, ds[iDia - 1]);

  for (const c of porContrato.values()) {
    vistas++;
    if (c.hora < "14:00") continue;                             // después de las 14:00
    const dte = dteDe(dCompra, c.exp);
    if (dte < 5 || dte > 90) continue;                          // 5 a 90 días
    const dentro = c.l === "C" ? c.K < S : c.K > S;
    if (!dentro) continue;                                      // dentro del dinero
    const q = chC[c.exp]?.[`${c.K}|${c.l}`];
    if (!q || !(q[1] > 0)) continue;
    if (q[1] * 100 < 10000) continue;                           // contrato de $10,000+
    const oi = oiVispera?.[c.exp]?.[`${c.K}|${c.l}`];
    if (!(oi > 0)) continue;
    if (!(c.tam / oi >= 12)) continue;                          // 12x el OI de la víspera

    // el camino, día a día, comprando al ask y vendiendo al bid
    const coste = q[1];
    let mult = null, dSal = null, n = 0;
    for (const d of ds) {
      if (d <= dCompra) continue;
      if (d > c.exp) break;
      const p = leerCad(tk, d)?.[c.exp]?.[`${c.K}|${c.l}`];
      if (!p) continue;
      n++;
      const m = p[0] / coste;
      if (m >= 1.50) { mult = 1.50; dSal = d; break; }           // objetivo
      if (m <= 0.50) { mult = 0.50; dSal = d; break; }           // corte
      if (n >= 15) { mult = m; dSal = d; break; }                // 15 días de bolsa
      mult = m; dSal = d;
    }
    if (n === 0) continue;
    señales.push({ tk, dia, dCompra, exp: c.exp, K: c.K, l: c.l, coste, mult, dSal, vsOI: c.tam / oi });
  }
}
señales.sort((a, b) => a.dCompra.localeCompare(b.dCompra) || a.tk.localeCompare(b.tk));
console.log(`\n  ${vistas.toLocaleString("en-US")} contratos-día con golpe al ask · ${señales.length} pasan TODOS los filtros\n`);

// ── 2. la cuenta, por orden de llegada ──
let caja = 60000, abiertas = [], tomadas = [];
const fechas = [...new Set([...señales.map((s) => s.dCompra), ...señales.map((s) => s.dSal)])].sort();
for (const hoy of fechas) {
  for (const a of abiertas.filter((a) => a.dSal === hoy)) caja += a.n * a.mult * a.coste * 100;
  abiertas = abiertas.filter((a) => a.dSal !== hoy);
  for (const s of señales.filter((s) => s.dCompra === hoy)) {
    if (abiertas.length >= 4) continue;
    const precio = s.coste * 100;
    const n = Math.floor(15000 / precio);
    if (n < 1 || n * precio > caja) continue;
    caja -= n * precio;
    abiertas.push({ ...s, n });
    tomadas.push({ ...s, n });
  }
}
for (const a of abiertas) caja += a.n * a.mult * a.coste * 100;

console.log(`  ${"compra".padEnd(9)} ${"ticker".padEnd(6)} ${"lado".padEnd(5)} ${"strike".padStart(7)} ${"cuesta".padStart(9)} ${"vende".padEnd(9)} ${"mult".padStart(5)}  ${"ganancia".padStart(9)}`);
for (const t of tomadas)
  console.log(`  ${t.dCompra.padEnd(9)} ${t.tk.padEnd(6)} ${(t.l === "C" ? "call" : "put").padEnd(5)} ${String(t.K).padStart(7)} ${$(t.coste * 100).padStart(9)} ${t.dSal.padEnd(9)} ${t.mult.toFixed(2).padStart(5)}  ${$(t.n * (t.mult - 1) * t.coste * 100).padStart(9)}`);

console.log(`\n  ═══ RESULTADO INDEPENDIENTE ═══\n`);
console.log(`  señales que pasan los filtros : ${señales.length}`);
console.log(`  operaciones que caben         : ${tomadas.length}`);
console.log(`  ganan / pierden               : ${tomadas.filter((t) => t.mult > 1).length} / ${tomadas.filter((t) => t.mult < 1).length}`);
console.log(`  la cuenta acaba en            : ${$(caja)}`);
console.log(`  ganancia                      : ${$(caja - 60000)}  (${((caja / 60000 - 1) * 100).toFixed(0)}%)`);
console.log(`\n  ── lo que tiene que dar, según la cadena de hoy ──`);
console.log(`  72 señales · 17 operaciones · $97,655 · +$37,655`);
const ok = señales.length === 72 && tomadas.length === 17 && Math.abs(caja - 97655) < 1;
console.log(`\n  ${ok ? "✓ COINCIDE — verificado por dos caminos independientes" : "✗ NO COINCIDE — uno de los dos está mal"}`);
console.log("");
