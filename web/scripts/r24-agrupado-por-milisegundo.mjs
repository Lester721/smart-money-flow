// LA TABLA MÁGICA AGRUPADA POR MILISEGUNDO — una orden en paquete es UNA apuesta, no diez.
//
// Lester, el 2026-08-26, después de ver que el 29 de enero de 2026 hubo DIEZ señales en el mismo
// milisegundo (TSLA puts 610, 615, 620, 630, 630, 635, 645, 655, 660 y 700):
// «agrupa por milisegundo y vuelve a correr los tres años».
//
// POR QUÉ IMPORTA: diez strikes consecutivos comprados en el mismo instante son UNA orden en
// paquete. Contarlas como diez señales independientes infla la muestra y hace que un acierto
// (o un fallo) valga por diez. El "68 de 83 aciertos" nunca fue lo que parecía.
//
// CÓMO SE AGRUPA: por ticker + el milisegundo exacto del golpe MAYOR de cada contrato.
// Dentro de un paquete se coge UNA sola operación: la del golpe más grande en dólares, que es
// lo que un humano miraría en la pantalla.
//
// TODO lo demás igual: misma regla, misma salida a 15 días, mismo peaje.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cargar, simular, resumir, cuenta } from "./consultar.mjs";
import { CACHE } from "./raiz.mjs";

const O = { objetivo: 1.50, suelo: 0.50, salirEnDias: 15 };
const $ = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const DIR = join(CACHE, "flujo-limpio");
const MAG = (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12;
const yr = (y) => [...Array(12)].map((_, i) => y + String(i + 1).padStart(2, "0"));

const _flu = new Map();
function flujo(tk, dia) {
  const k = tk + dia;
  if (_flu.has(k)) return _flu.get(k);
  const p = join(DIR, `${tk}_d${dia}.json`);
  let v = [];
  try { if (existsSync(p)) v = JSON.parse(readFileSync(p, "utf8")); } catch { v = []; }
  _flu.set(k, v);
  if (_flu.size > 600) _flu.delete(_flu.keys().next().value);
  return v;
}

/** El milisegundo exacto del golpe mayor de este contrato, y su prima. */
function selloDe(f) {
  const mias = flujo(f.tk, f.dia).filter((o) => o.exp === f.exp && o.K === f.K && o.l === f.l && o.ask > 0 && o.precio >= o.ask);
  if (!mias.length) return null;
  const mayor = mias.reduce((a, b) => (b.prima > a.prima ? b : a));
  return { sello: `${f.tk}|${mayor.hora}`, prima: mayor.prima };
}

/** Agrupa por milisegundo y devuelve UNA operación por paquete: la del golpe mayor. */
function agrupar(L) {
  const paq = new Map();
  const sueltas = [];
  for (const f of L) {
    const s = selloDe(f);
    if (!s) { sueltas.push(f); continue; }
    const y = paq.get(s.sello);
    if (!y || s.prima > y.prima) paq.set(s.sello, { f, prima: s.prima, n: (y?.n ?? 0) + 1 });
    else paq.set(s.sello, { ...y, n: y.n + 1 });
  }
  return { elegidas: [...paq.values()].map((x) => x.f).concat(sueltas), paquetes: paq, sueltas };
}

const AÑOS = [["2021", yr("2021")], ["2022", yr("2022")], ["2026", ["202601", "202602", "202603", "202604", "202605", "202606", "202607", "202608"]]];

console.log(`\n═══ ANTES Y DESPUÉS DE AGRUPAR POR MILISEGUNDO ═══\n`);
console.log(`  ${"año".padEnd(6)} ${"SIN agrupar".padStart(30)}      ${"AGRUPADO (una por paquete)".padStart(30)}`);
console.log(`  ${"".padEnd(6)} ${"n  gana/pierde   ratio    dinero".padStart(30)}      ${"n  gana/pierde   ratio    dinero".padStart(30)}`);
const guardado = {};
for (const [y, M] of AÑOS) {
  const L = cargar(M).filter(MAG);
  const g = agrupar(L);
  guardado[y] = { L, g };
  const a = resumir(L, O), b = resumir(g.elegidas, O);
  const F = (r) => r ? `${String(r.n).padStart(3)}  ${(r.gana + "/" + r.pierde).padEnd(7)} ${(r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(7)} ${$(r.neto).padStart(11)}` : `${"0".padStart(3)}  ${"—".padEnd(7)} ${"—".padStart(7)} ${"—".padStart(11)}`;
  console.log(`  ${y.padEnd(6)} ${F(a).padStart(30)}      ${F(b).padStart(30)}`);
}

console.log(`\n═══ CUÁNTOS PAQUETES HAY, Y DE QUÉ TAMAÑO ═══\n`);
console.log(`  ${"año".padEnd(6)} ${"señales".padStart(8)} ${"paquetes".padStart(9)} ${"el mayor".padStart(9)}   reparto de tamaños`);
for (const [y] of AÑOS) {
  const { L, g } = guardado[y];
  const tam = [...g.paquetes.values()].map((x) => x.n).sort((a, b) => b - a);
  const rep = {};
  for (const t of tam) rep[t] = (rep[t] ?? 0) + 1;
  console.log(`  ${y.padEnd(6)} ${String(L.length).padStart(8)} ${String(g.paquetes.size).padStart(9)} ${String(tam[0] ?? 0).padStart(9)}   ${Object.entries(rep).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => `${v}×${k}`).join(" · ")}`);
}

console.log(`\n═══ LA CUENTA DE $60,000, AGRUPADA ═══\n`);
console.log(`  ${"año".padEnd(6)} ${"sin agrupar".padStart(24)}      ${"agrupado".padStart(24)}`);
for (const [y] of AÑOS) {
  const { L, g } = guardado[y];
  const a = L.length ? cuenta(L, { capital: 60000, porOp: 15000, maxAbiertas: 4, ...O }) : null;
  const b = g.elegidas.length ? cuenta(g.elegidas, { capital: 60000, porOp: 15000, maxAbiertas: 4, ...O }) : null;
  const F = (c) => c ? `${String(c.tomadas.length).padStart(2)} ops · ${c.gana}/${c.pierde} · ${$(c.ganancia)}` : "sin operaciones";
  console.log(`  ${y.padEnd(6)} ${F(a).padStart(24)}      ${F(b).padStart(24)}`);
}

console.log(`\n═══ LOS PAQUETES DE 2026, UNO POR UNO ═══\n`);
const { g: g26 } = guardado["2026"];
const filas = [...g26.paquetes.entries()].map(([sello, x]) => ({ sello, ...x, r: simular(x.f, O) }))
  .sort((a, b) => a.sello.split("|")[1].localeCompare(b.sello.split("|")[1]));
console.log(`  ${"momento".padEnd(26)} ${"tk".padEnd(5)} ${"señales".padStart(8)} ${"la elegida".padEnd(12)} ${"golpe".padStart(12)} ${"mult".padStart(6)} ${"dinero".padStart(10)}`);
for (const f of filas) {
  const [tk, hora] = f.sello.split("|");
  console.log(`  ${hora.slice(0, 19).replace("T", " ").padEnd(26)} ${tk.padEnd(5)} ${String(f.n).padStart(8)} ${`${f.f.l}${f.f.K}`.padEnd(12)} ${$(f.prima).padStart(12)} ${f.r.mult.toFixed(2).padStart(6)} ${$((f.r.mult - 1) * f.f.ask * 100).padStart(10)}`);
}
console.log("");
