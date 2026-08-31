// CONSULTAR LA TABLA MAESTRA — responde una pregunta en segundos, sin releer 150.000 ficheros.
//
// La tabla maestra (r13-tabla-maestra.mjs) tiene una fila por contrato candidato con el camino
// entero día a día. Esto la carga y la filtra.
//
// ═══ LA REGLA QUE NO SE ROMPE ═══════════════════════════════════════════════════════════════
// `simular()` recorre el camino EN ORDEN y gana lo que pase PRIMERO. No hay ningún `max()` ni
// `último` sobre el período. Ver [[simular-el-camino-nunca-un-resumen]] — un resumen del camino
// fue lo que infló el ratio un 46% el 25 de agosto.
//
// Uso desde otro script:
//   import { cargar, simular, resumir, tabla } from "./consultar.mjs";
//   const filas = cargar().filter(f => f.dentro && f.vsOI >= 12 && f.ask * 100 >= 10000);
//   tabla([["la tabla mágica", filas]], { objetivo: 1.50, suelo: 0.50 });

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

const DIR = join(CACHE, "maestra");

/** Carga la tabla maestra. `meses` opcional: ["202601","202602"]. */
export function cargar(meses = null) {
  if (!existsSync(join(DIR, "_MANIFIESTO.json")))
    throw new Error(`\n\n  ⛔ maestra/ sin manifiesto. Corre scripts/r13-tabla-maestra.mjs primero.\n`);
  const m = JSON.parse(readFileSync(join(DIR, "_MANIFIESTO.json"), "utf8"));
  if (m.mira_al_futuro !== false) throw new Error(`maestra/ marcada como mira_al_futuro`);
  const out = [];
  for (const f of readdirSync(DIR)) {
    const g = /^(\d{6})\.json$/.exec(f); if (!g) continue;
    if (meses && !meses.includes(g[1])) continue;
    out.push(...JSON.parse(readFileSync(join(DIR, f), "utf8")));
  }
  out.sort((a, b) => a.dC.localeCompare(b.dC));
  return out;
}

/**
 * Simula UNA fila recorriendo el camino en orden. Gana lo que pase primero.
 * opciones: { objetivo, suelo, salirEnDias, mitadEn }
 * Devuelve { mult, salio, dSal, dias } — mult es el múltiplo sobre lo pagado (ask).
 */
export function simular(fila, { objetivo = null, suelo = null, salirEnDias = null } = {}) {
  const coste = fila.ask;
  let n = 0;
  for (const [d, bid] of fila.camino) {
    n++;
    const m = bid / coste;
    if (objetivo != null && m >= objetivo) return { mult: objetivo, salio: "objetivo", dSal: d, dias: n };
    if (suelo != null && m <= suelo) return { mult: suelo, salio: "corte", dSal: d, dias: n };
    if (salirEnDias != null && n >= salirEnDias) return { mult: m, salio: "plazo", dSal: d, dias: n };
  }
  const u = fila.camino[fila.camino.length - 1];
  return { mult: u[1] / coste, salio: "vencimiento", dSal: u[0], dias: fila.camino.length };
}

/** Resume un grupo de filas ya simuladas. `porContrato` = dinero real; si no, $1.000 iguales. */
export function resumir(filas, opts = {}, { porContrato = true } = {}) {
  let g = 0, p = 0, gana = 0, alCorte = 0, alObjetivo = 0, aVenc = 0, coste = 0;
  const abiertas = [];
  for (const f of filas) {
    const r = simular(f, opts);
    const base = porContrato ? f.ask * 100 : 1000;
    const x = (r.mult - 1) * base;
    coste += f.ask * 100;
    if (x > 0) { g += x; gana++; } else p += -x;
    if (r.salio === "corte") alCorte++;
    else if (r.salio === "objetivo") alObjetivo++;
    else if (r.salio === "vencimiento") aVenc++;
    abiertas.push([f.dC, f.ask * 100], [r.dSal, -f.ask * 100]);
  }
  if (!filas.length) return null;
  abiertas.sort((a, b) => a[0].localeCompare(b[0]) || b[1] - a[1]);
  let cur = 0, pico = 0;
  for (const [, v] of abiertas) { cur += v; if (cur > pico) pico = cur; }
  return {
    n: filas.length, gana, pierde: filas.length - gana, pg: 100 * gana / filas.length,
    alCorte, alObjetivo, aVenc, g, p, r: p ? g / p : Infinity, neto: g - p, coste, pico,
    pctCapital: pico ? 100 * (g - p) / pico : NaN,
  };
}

const $ = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");

/** Imprime una tabla comparando varios grupos. `grupos` = [[nombre, filas], …] */
export function tabla(grupos, opts = {}, { porContrato = true, mitad = null } = {}) {
  console.log(`  ${"grupo".padEnd(38)}    n  gana  pierde  corte   RATIO       dinero   capital  % cap`);
  for (const [nom, filas] of grupos) {
    const r = resumir(filas, opts, { porContrato });
    if (!r) { console.log(`  ${nom.padEnd(38)}    0`); continue; }
    let extra = "";
    if (mitad) {
      const a = resumir(filas.filter((f) => f.dC < mitad), opts, { porContrato });
      const b = resumir(filas.filter((f) => f.dC >= mitad), opts, { porContrato });
      extra = `   [${a ? (a.r === Infinity ? "∞" : a.r.toFixed(1)) : "—"}/${b ? (b.r === Infinity ? "∞" : b.r.toFixed(1)) : "—"}]`;
    }
    console.log(`  ${nom.padEnd(38)} ${String(r.n).padStart(4)}  ${String(r.gana).padStart(4)}  ${String(r.pierde).padStart(6)}  ${String(r.alCorte).padStart(5)}  ${(r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(6)}  ${$(r.neto).padStart(11)}  ${$(r.pico).padStart(9)}  ${r.pctCapital.toFixed(0).padStart(4)}%${extra}`);
  }
}

/** Simula una cuenta de verdad: contratos enteros, por orden de llegada, con tope de abiertas. */
export function cuenta(filas, { capital = 60000, porOp = 15000, maxAbiertas = 4, ...opts } = {}) {
  const L = filas.map((f) => ({ f, r: simular(f, opts) })).sort((a, b) => a.f.dC.localeCompare(b.f.dC));
  let caja = capital, ab = [], tomadas = [], minCaja = capital;
  const fechas = [...new Set([...L.map((x) => x.f.dC), ...L.map((x) => x.r.dSal)])].sort();
  for (const hoy of fechas) {
    for (const a of ab.filter((a) => a.r.dSal === hoy)) caja += a.n * a.r.mult * a.f.ask * 100;
    ab = ab.filter((a) => a.r.dSal !== hoy);
    for (const x of L.filter((x) => x.f.dC === hoy)) {
      if (ab.length >= maxAbiertas) continue;
      const precio = x.f.ask * 100;
      const n = Math.floor(porOp / precio);
      if (n < 1 || n * precio > caja) continue;
      caja -= n * precio; ab.push({ ...x, n }); tomadas.push({ ...x, n });
    }
    if (caja < minCaja) minCaja = caja;
  }
  for (const a of ab) caja += a.n * a.r.mult * a.f.ask * 100;
  return { final: caja, ganancia: caja - capital, pct: 100 * (caja / capital - 1), tomadas, minCaja,
           gana: tomadas.filter((x) => x.r.mult > 1).length, pierde: tomadas.filter((x) => x.r.mult < 1).length };
}

// ── si se ejecuta directamente: comprobar que reproduce los números conocidos ──
if (process.argv[1]?.endsWith("consultar.mjs")) {
  const T = cargar(["202601"]);
  console.log(`\n  ${T.length} filas de enero 2026\n`);
  const dentro = T.filter((f) => f.dentro && f.dte <= 90);
  const R = { objetivo: 1.50, suelo: 0.50 };
  console.log(`=== ¿REPRODUCE LOS NÚMEROS CONOCIDOS? ===\n`);
  tabla([
    ["los 231 (dentro, ≤90d, vsOI>0.6)", dentro.filter((f) => f.vsOI > 0.60)],
    ["4x · $10,000+", dentro.filter((f) => f.vsOI >= 4 && f.ask * 100 >= 10000)],
    ["12x · $10,000+", dentro.filter((f) => f.vsOI >= 12 && f.ask * 100 >= 10000)],
    ["12x · $10,000+ · después 14:00", dentro.filter((f) => f.vsOI >= 12 && f.ask * 100 >= 10000 && f.hora >= "14:00")],
  ], R, { mitad: "20260116" });
  console.log(`\n  esperado del script lento: 231 → 2.87 · 4x → 13.01 · 12x → 71.96 · con hora → 69.89\n`);
  const c = cuenta(dentro.filter((f) => f.vsOI >= 12 && f.ask * 100 >= 10000 && f.hora >= "14:00"), { ...R });
  console.log(`  cuenta de $60,000: ${c.tomadas.length} operaciones · ganan ${c.gana}, pierden ${c.pierde} · ${$(c.final)} (${c.ganancia >= 0 ? "+" : ""}${$(c.ganancia)}, ${c.pct.toFixed(0)}%)`);
  console.log(`  esperado: 8 operaciones · 8/0 · $82,940 (+$22,940, 38%)\n`);
}
