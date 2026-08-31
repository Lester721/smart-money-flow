// ¿QUÉ ESTAMOS SIGUIENDO DE VERDAD?
//
// Lester, el 2026-08-25: «la estrategia no se diseñó para trabajar sólo en bajista, se diseñó
// para atrapar transacciones con intención, y lo extraño es que las que atrapa son spreads, no
// son transacciones de dirección, y aun así ganamos, ¿no?»
//
// Tiene razón en que no cuadra. Si lo que atrapamos son patas de estructuras, no es intención
// direccional. Y hay una explicación que lo encajaría todo y que sería mala: que sean
// operaciones de FINANCIACIÓN (conversiones, reversals, cajas), que no tienen dirección.
//
// El perfil encaja sospechosamente: 31.7% dentro del dinero · 16 días · $3.4M de tamaño ·
// emparejadas · 461 puts contra 13 calls.
//
// SE MIRA LA FORMA DE CADA PAREJA:
//   · mismo vencimiento, mismo lado, otro strike      → VERTICAL (apuesta direccional con techo)
//   · mismo strike, mismo vencimiento, call y put     → CONVERSIÓN / CAJA (financiación, sin dirección)
//   · distinto vencimiento                            → ROLL (mover algo viejo, no abrir)
//   · sin pareja                                      → suelta, apuesta direccional de verdad

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";

const flu = abrir("flujo-limpio", { callado: true });
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);

// ── para cada operación grande, buscar su pareja y clasificarla ──
const clases = new Map();
const ejemplos = [];
let total = 0, sinPareja = 0;

for (const f of readdirSync(flu.dir)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g;
  let lista; try { lista = JSON.parse(readFileSync(join(flu.dir, f), "utf8")); } catch { continue; }
  if (lista.length < 2) continue;
  const t = lista.map((o, i) => ({ ...o, i, ms: Date.parse(o.hora) })).sort((a, b) => a.ms - b.ms);

  for (let i = 0; i < t.length; i++) {
    const a = t[i];
    // sólo nos interesan las que la tabla mágica compraría: al ask o por encima
    if (!(a.ask > 0 && a.precio >= a.ask)) continue;
    if (dteDe(dia, a.exp) < 5 || dteDe(dia, a.exp) > 90) continue;
    total++;
    // buscar la pareja más cercana en tiempo y tamaño
    let par = null, mejorDist = Infinity;
    for (let j = 0; j < t.length; j++) {
      if (j === i) continue;
      const b = t[j];
      if (Math.abs(b.ms - a.ms) > 2000) continue;
      if (a.exp === b.exp && a.K === b.K && a.l === b.l) continue;
      const rel = Math.abs(a.tam - b.tam) / Math.max(a.tam, b.tam);
      if (rel > 0.20) continue;
      const d = Math.abs(b.ms - a.ms) + rel * 1000;
      if (d < mejorDist) { mejorDist = d; par = b; }
    }
    if (!par) { sinPareja++; continue; }

    // ¿la pareja se VENDIÓ? (al bid o por debajo)
    const parVendida = par.bid > 0 && par.precio <= par.bid;
    let clase;
    if (a.exp !== par.exp) clase = "ROLL — distinto vencimiento";
    else if (a.l !== par.l && a.K === par.K) clase = "CONVERSIÓN/CAJA — mismo strike, call y put";
    else if (a.l !== par.l) clase = "COMBO — call y put, distinto strike";
    else if (parVendida) clase = "VERTICAL — misma pata, otro strike, la otra VENDIDA";
    else clase = "DOS COMPRAS — misma pata, otro strike, las dos compradas";

    clases.set(clase, (clases.get(clase) ?? 0) + 1);
    if (ejemplos.length < 400) ejemplos.push({ tk, dia, a, par, clase, parVendida });
  }
}

const pct = (x) => ((100 * x) / total).toFixed(1) + "%";
console.log(`\n═══ ¿QUÉ FORMA TIENEN LAS OPERACIONES QUE COMPRARÍAMOS? ═══\n`);
console.log(`  ${total.toLocaleString("en-US")} operaciones grandes al ask, de 5 a 90 días\n`);
console.log(`  ${"forma".padEnd(52)} cuántas   de cada 100`);
console.log(`  ${"SIN PAREJA — apuesta suelta de verdad".padEnd(52)} ${String(sinPareja).padStart(7)}   ${pct(sinPareja).padStart(11)}`);
for (const [c, n] of [...clases].sort((a, b) => b[1] - a[1]))
  console.log(`  ${c.padEnd(52)} ${String(n).padStart(7)}   ${pct(n).padStart(11)}`);

console.log(`\n\n═══ DIEZ CASOS CONCRETOS, PARA MIRARLOS CON LOS OJOS ═══\n`);
console.log(`  ${"ticker".padEnd(6)} ${"día".padEnd(9)} ${"LA QUE COMPRARÍAMOS".padEnd(30)} ${"SU PAREJA".padEnd(30)} qué es`);
const vistos = new Set();
for (const e of ejemplos) {
  if (vistos.has(e.clase) && vistos.size >= 5) continue;
  if ([...vistos].filter((v) => v === e.clase).length >= 2) continue;
  vistos.add(e.clase);
  const d1 = `${e.a.l}${e.a.K} v${e.a.exp.slice(4)} x${e.a.tam} @${e.a.precio}`;
  const d2 = `${e.par.l}${e.par.K} v${e.par.exp.slice(4)} x${e.par.tam} @${e.par.precio}${e.parVendida ? " (VENDIDA)" : " (comprada)"}`;
  console.log(`  ${e.tk.padEnd(6)} ${e.dia.padEnd(9)} ${d1.padEnd(30)} ${d2.padEnd(30)} ${e.clase.split(" — ")[0]}`);
  if (vistos.size >= 5 && ejemplos.indexOf(e) > 200) break;
}
// dos de cada clase, ordenados
console.log(`\n  --- dos ejemplos de cada forma ---\n`);
for (const c of [...clases.keys()]) {
  const L = ejemplos.filter((e) => e.clase === c).slice(0, 2);
  console.log(`  ${c}`);
  for (const e of L) {
    console.log(`     ${e.tk} ${e.dia}  compramos ${e.a.l}${e.a.K} v${e.a.exp.slice(4)} x${e.a.tam} a ${e.a.precio} (bid ${e.a.bid} ask ${e.a.ask})`);
    console.log(`     ${" ".repeat(e.tk.length)} ${" ".repeat(9)}  su pareja ${e.par.l}${e.par.K} v${e.par.exp.slice(4)} x${e.par.tam} a ${e.par.precio} (bid ${e.par.bid} ask ${e.par.ask}) ${e.parVendida ? "← VENDIDA" : "← comprada"}`);
  }
  console.log("");
}

// ═══ Y AHORA LO QUE IMPORTA: ¿qué forma tienen LAS QUE COMPRA LA TABLA MÁGICA? ═══
import { cargar, resumir } from "./consultar.mjs";
const T = cargar();
const oiA2 = abrir("oi-ancho", { callado: true });
// reconstruir la clasificación pero guardándola por contrato-día, para cruzarla con la maestra
const forma = new Map();       // tk|dia|exp|K|l -> clase
for (const f of readdirSync(flu.dir)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g;
  let lista; try { lista = JSON.parse(readFileSync(join(flu.dir, f), "utf8")); } catch { continue; }
  if (!lista.length) continue;
  const t = lista.map((o) => ({ ...o, ms: Date.parse(o.hora) })).sort((a, b) => a.ms - b.ms);
  for (let i = 0; i < t.length; i++) {
    const a = t[i];
    if (!(a.ask > 0 && a.precio >= a.ask)) continue;
    let par = null, mejorDist = Infinity;
    for (let j = 0; j < t.length; j++) {
      if (j === i) continue;
      const b = t[j];
      if (Math.abs(b.ms - a.ms) > 2000) continue;
      if (a.exp === b.exp && a.K === b.K && a.l === b.l) continue;
      const rel = Math.abs(a.tam - b.tam) / Math.max(a.tam, b.tam);
      if (rel > 0.20) continue;
      const d = Math.abs(b.ms - a.ms) + rel * 1000;
      if (d < mejorDist) { mejorDist = d; par = b; }
    }
    const k = `${tk}|${dia}|${a.exp}|${a.K}|${a.l}`;
    let clase;
    if (!par) clase = "suelta";
    else {
      const pv = par.bid > 0 && par.precio <= par.bid;
      if (a.exp !== par.exp) clase = "roll";
      else if (a.l !== par.l && a.K === par.K) clase = "conversion";
      else if (a.l !== par.l) clase = "combo";
      else if (pv) clase = "vertical";
      else clase = "dos compras";
    }
    // si un contrato tiene varios golpes, se queda con el más informativo (suelta gana)
    const y = forma.get(k);
    if (!y || (y !== "suelta" && clase === "suelta")) forma.set(k, clase);
  }
}
const MAG = (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.vsOI >= 12 && f.ask * 100 >= 10000 && f.hora >= "14:00";
const L = T.filter(MAG).map((f) => ({ ...f, forma: forma.get(`${f.tk}|${f.dia}|${f.exp}|${f.K}|${f.l}`) ?? "?" }));
const $$ = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
console.log(`\n\n═══ LAS ${L.length} DE LA TABLA MÁGICA, POR FORMA ═══\n`);
console.log(`  ${"forma".padEnd(16)} cuántas  de cada 100   gana  pierde   RATIO        dinero`);
const cuentas = {};
for (const f of L) cuentas[f.forma] = (cuentas[f.forma] ?? 0) + 1;
for (const [c, n] of Object.entries(cuentas).sort((a, b) => b[1] - a[1])) {
  const sub = L.filter((f) => f.forma === c);
  const r = resumir(sub, { objetivo: 1.50, suelo: 0.50 });
  console.log(`  ${c.padEnd(16)} ${String(n).padStart(7)}  ${((100 * n / L.length).toFixed(0) + "%").padStart(11)}   ${String(r.gana).padStart(4)}  ${String(r.pierde).padStart(6)}  ${(r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(6)}  ${$$(r.neto).padStart(12)}`);
}
console.log(`\n  --- lo mismo en el universo grande (4x, más señales) ---\n`);
const L4 = T.filter((f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.vsOI >= 4 && f.ask * 100 >= 10000)
            .map((f) => ({ ...f, forma: forma.get(`${f.tk}|${f.dia}|${f.exp}|${f.K}|${f.l}`) ?? "?" }));
console.log(`  ${"forma".padEnd(16)} cuántas  de cada 100   gana  pierde   RATIO        dinero`);
const c4 = {};
for (const f of L4) c4[f.forma] = (c4[f.forma] ?? 0) + 1;
for (const [c, n] of Object.entries(c4).sort((a, b) => b[1] - a[1])) {
  const sub = L4.filter((f) => f.forma === c);
  const r = resumir(sub, { objetivo: 1.50, suelo: 0.50 });
  console.log(`  ${c.padEnd(16)} ${String(n).padStart(7)}  ${((100 * n / L4.length).toFixed(0) + "%").padStart(11)}   ${String(r.gana).padStart(4)}  ${String(r.pierde).padStart(6)}  ${(r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(6)}  ${$$(r.neto).padStart(12)}`);
}
console.log("");
