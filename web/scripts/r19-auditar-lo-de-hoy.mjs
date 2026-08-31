// AUDITORÍA DE LO ENCONTRADO HOY — la salida a 15 días y el +52%.
//
// Lester: «necesito que valides que no me estás mintiendo cometiendo un error en lo que
// encontramos». La vez anterior esta misma pregunta destapó un look-ahead que inflaba el ratio
// un 46%. Se comprueban las cinco cosas que pueden estar mal:
//
//  1. LA HORA — el filtro dice «después de las 14:00». ¿La marca de tiempo es hora de Nueva York
//     o UTC? Si es UTC, «14:00» son las 10:00 de la mañana y el filtro significa otra cosa.
//  2. EL CAMINO TRUNCADO — las cadenas acaban el 19 de agosto. Un contrato comprado en agosto
//     que vence en octubre tiene el camino cortado, y su resultado sería papel, no dinero.
//  3. LOS 15 DÍAS — ¿son 15 días de bolsa de verdad, o 15 observaciones con huecos dentro?
//  4. EL OI DE LA VÍSPERA — ¿el denominador del 12x es de ANTES del golpe, o del mismo día?
//  5. MARZO CON RATIO 144.99 — 21 aciertos de 22. Hay que mirarlo con lupa.

import { cargar, simular, resumir } from "./consultar.mjs";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";

const O = { objetivo: 1.50, suelo: 0.50, salirEnDias: 15 };
const $ = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const T = cargar();
const MAG = (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12;
const L = T.filter(MAG);

// ═══ 1. LA HORA ═══
console.log(`\n═══ 1. ¿LA HORA ES DE NUEVA YORK O UTC? ═══\n`);
const flu = abrir("flujo-limpio", { callado: true });
const horas = new Map();
let primera = "99:99", ultima = "00:00";
for (const f of readdirSync(flu.dir).slice(0, 60)) {
  if (!/^[A-Z]+_d\d{8}\.json$/.test(f)) continue;
  let lista; try { lista = JSON.parse(readFileSync(join(flu.dir, f), "utf8")); } catch { continue; }
  for (const o of lista) {
    const h = o.hora.slice(11, 16);
    horas.set(h.slice(0, 2), (horas.get(h.slice(0, 2)) ?? 0) + 1);
    if (h < primera) primera = h;
    if (h > ultima) ultima = h;
  }
}
console.log(`  la operación más temprana de la muestra: ${primera}`);
console.log(`  la más tardía:                          ${ultima}`);
console.log(`  reparto por hora: ${[...horas].sort().map(([h, n]) => `${h}h:${n}`).join(" · ")}`);
console.log(`\n  El mercado americano abre a las 9:30 y cierra a las 16:00 hora de Nueva York.`);
console.log(`  → ${primera >= "09:2" && ultima <= "16:1" ? "✓ ENCAJA con hora de Nueva York. El filtro de las 14:00 es correcto." : "⚠ NO encaja: la marca de tiempo NO es hora de Nueva York"}`);

// ═══ 2. CAMINOS TRUNCADOS ═══
console.log(`\n═══ 2. ¿HAY CAMINOS CORTADOS POR FALTA DE DATOS? ═══\n`);
const truncados = L.filter((f) => !f.llegaVenc);
console.log(`  de las ${L.length} señales, ${truncados.length} no llegan a su vencimiento en los datos`);
if (truncados.length) {
  const r = resumir(truncados, O);
  console.log(`  esas ${r.n} aportan ${$(r.neto)}  ← sería dinero NO cobrado`);
  console.log(`  meses: ${[...new Set(truncados.map((f) => f.dC.slice(0, 6)))].sort().join(" ")}`);
}
// ¿y cuántas de las que salen a 15 días llegan a los 15 antes de que se acabe el dato?
const cortas = L.filter((f) => f.camino.length < 15 && f.llegaVenc);
console.log(`  ${cortas.length} vencen ANTES de los 15 días (salen por vencimiento, no por plazo) — eso es normal`);
const sinDatos = L.filter((f) => f.camino.length < 15 && !f.llegaVenc);
console.log(`  ${sinDatos.length} tienen menos de 15 días de camino Y no llegan a vencer  ← esas sí son un problema`);

// ═══ 3. LOS 15 DÍAS ═══
console.log(`\n═══ 3. ¿SON 15 DÍAS DE BOLSA DE VERDAD? ═══\n`);
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
let malos = 0;
const muestras = [];
for (const f of L) {
  const r = simular(f, O);
  if (r.salio !== "plazo") continue;
  const natural = Math.round((ms(r.dSal) - ms(f.dC)) / 86400000);
  // 15 días de bolsa son ~21 naturales. Si son muchos más, hay huecos en el camino.
  if (natural > 30) malos++;
  if (muestras.length < 5) muestras.push({ f, r, natural });
}
console.log(`  salidas por plazo: ${L.filter((f) => simular(f, O).salio === "plazo").length}`);
console.log(`  de ésas, con más de 30 días naturales entre compra y venta (= huecos): ${malos}`);
for (const m of muestras)
  console.log(`     ${m.f.tk} ${m.f.dC} → ${m.r.dSal}: ${m.r.dias} observaciones, ${m.natural} días naturales`);

// ═══ 4. EL OI DE LA VÍSPERA ═══
console.log(`\n═══ 4. ¿EL OI DEL 12x ES DE ANTES DEL GOLPE? ═══\n`);
const cad = abrir("cadenas", { callado: true });
const oiA = abrir("oi-ancho", { callado: true });
let ok = 0, mal = 0, sinD = 0;
for (const f of L) {
  const ds = cad.dias(f.tk);
  const i = ds.indexOf(f.dia);
  if (i < 1) { sinD++; continue; }
  const guardado = f.oiV;
  const vispera = oiA.leer(f.tk, ds[i - 1])?.[f.exp]?.[`${f.K}|${f.l}`];
  const mismoDia = oiA.leer(f.tk, f.dia)?.[f.exp]?.[`${f.K}|${f.l}`];
  if (guardado === vispera) ok++;
  else if (guardado === mismoDia) mal++;
  else sinD++;
}
console.log(`  el OI guardado coincide con el de LA VÍSPERA: ${ok}`);
console.log(`  coincide con el del MISMO DÍA del golpe:      ${mal}   ← si esto es alto, el filtro es circular`);
console.log(`  no coincide con ninguno:                      ${sinD}`);

// ═══ 5. MARZO ═══
console.log(`\n═══ 5. MARZO, RATIO 144.99 — CON LUPA ═══\n`);
const mar = L.filter((f) => f.dC.slice(0, 6) === "202603");
console.log(`  ${"ticker".padEnd(6)} ${"compra".padEnd(9)} ${"lado".padEnd(5)} ${"strike".padStart(7)} ${"vence".padEnd(9)} ${"paga".padStart(9)} ${"sale".padEnd(9)} ${"mult".padStart(6)}  ${"dinero".padStart(9)}`);
for (const f of mar) {
  const r = simular(f, O);
  console.log(`  ${f.tk.padEnd(6)} ${f.dC.padEnd(9)} ${(f.l === "C" ? "call" : "put").padEnd(5)} ${String(f.K).padStart(7)} ${f.exp.padEnd(9)} ${$(f.ask * 100).padStart(9)} ${r.dSal.padEnd(9)} ${r.mult.toFixed(2).padStart(6)}  ${$((r.mult - 1) * f.ask * 100).padStart(9)}`);
}
const rm = resumir(mar, O);
console.log(`\n  ${rm.n} operaciones · gana ${rm.gana} · pierde ${rm.pierde} · ganado ${$(rm.g)} · perdido ${$(rm.p)} · ratio ${rm.r.toFixed(2)}`);
console.log(`  el ratio es alto porque LO PERDIDO es diminuto (${$(rm.p)}), no porque lo ganado sea enorme.`);
console.log(`  tickers distintos: ${new Set(mar.map((f) => f.tk)).size} · días distintos: ${new Set(mar.map((f) => f.dC)).size}`);
console.log("");
