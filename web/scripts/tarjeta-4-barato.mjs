// ═══════════════════════════════════════════════════════════════════════════════════════════
// TARJETA (4) — EL BILLETE MÁS BARATO: ¿aguanta la ventaja con un ticket que SÍ cabe?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/tarjeta-4-barato.mjs
//
// POR QUÉ: la tarjeta funciona a 1 contrato ($7.418/año) pero pide $20.000 de caja para que una
// mala racha no la deje tirada, y Lester tiene $7.977. El cuello de botella NO es la ventaja,
// es el TAMAÑO DEL BILLETE: la vertical ATM→0,5% cuesta $920 de débito mediano.
//
// Aquí se prueba la MISMA señal (mismo día, mismo lado, misma hora) con verticales más baratas:
// se mueve el strike LARGO hacia fuera del dinero. El débito cae y la caja aguanta más rachas.
// La pregunta es si la ventaja sobrevive o si se la come el hecho de comprar más lejos.
//
// Precios REALES: larga al ASK, corta al BID; valor final = intrínseco topado (SPXW liquida en
// efectivo, sin peaje de salida). Elección cruzada: se mira en una mitad y se prueba en la otra.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const CUENTA = 56389, EFECTIVO = 7977, TASA = 0.03;
const PRUEBAS_DECLARADAS = 24;
function listonT(p0) { if (p0 <= 1) return 2; const p = 0.05 / p0 / 2, t = Math.sqrt(-2 * Math.log(p)); return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100; }
const LISTON = listonT(PRUEBAS_DECLARADAS);
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tOf = (v) => (sd(v) > 0 ? media(v) / (sd(v) / Math.sqrt(v.length)) : NaN);
const pct = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };
const mediana = (v) => pct(v, 50);
function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }
function rng(s0) { let a = s0 >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function columnas(cab) {
  const c = cab.split(",").map((s) => s.trim());
  const idx = {};
  for (const n of ["strike", "timestamp", "bid", "ask"]) {
    const i = c.indexOf(n);
    if (i < 0) throw new Error(`FALLO CERRADO: falta la columna ${n}`);
    idx[n] = i;
  }
  return idx;
}
// Sólo hace falta la foto de las 09:35: la salida es a vencimiento (intrínseco exacto).
function leer0935(ruta) {
  const txt = readFileSync(ruta, "utf8");
  const nl = txt.indexOf("\n");
  const idx = columnas(txt.slice(0, nl));
  const cot = new Map();
  let pos = nl + 1;
  while (pos < txt.length) {
    let fin = txt.indexOf("\n", pos); if (fin < 0) fin = txt.length;
    const linea = txt.slice(pos, fin); pos = fin + 1;
    if (linea.length < 20) continue;
    const p = linea.split(",");
    if (p[idx.timestamp].slice(11, 16) !== "09:35") continue;
    cot.set(+p[idx.strike], [+p[idx.bid], +p[idx.ask]]);
  }
  return cot;
}

const J = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
console.log("\n" + "═".repeat(100));
console.log("TARJETA (4) — ¿aguanta la ventaja con un billete más barato?");
console.log("═".repeat(100));

// ═══ ESTRUCTURAS DECLARADAS (5, ni una más) ════════════════════════════════════════════════
// desplazamiento de la LARGA respecto a la ATM, en puntos, hacia fuera del dinero; ancho fijo 25
const ESTRUCTURAS = [
  { et: "ATM → 25 fuera   (la de la tarjeta)", off: 0, ancho: 25 },
  { et: "10 fuera → 35    ", off: 10, ancho: 25 },
  { et: "20 fuera → 45    ", off: 20, ancho: 25 },
  { et: "ATM → 10 fuera   ", off: 0, ancho: 10 },
  { et: "ATM → 15 fuera   ", off: 0, ancho: 15 },
];

const DATOS = [];
const fuera = {};
const cae = (k) => { fuera[k] = (fuera[k] || 0) + 1; };
let hecho = 0; const t0 = Date.now();
for (const f of J.filas) {
  const net = f.niveles?.gam?.netPunto, K = f.niveles?.gamD?.imanNeto;
  if (!Number.isFinite(net) || net >= 0) { cae("gamma neta no negativa"); continue; }
  if (!(K > 0) || !(f.apertura > 0) || !(f.cierre > 0)) { cae("sin imán/apertura/cierre"); continue; }
  const lado = Math.sign(K - f.apertura);
  if (lado === 0) { cae("imán en la apertura"); continue; }
  const base = lado > 0 ? f.peaje?.callATM?.K : f.peaje?.putATM?.K;
  if (!(base > 0)) { cae("sin strike ATM"); continue; }
  const ruta = `${DIR}/iv_${f.fecha}_${lado > 0 ? "C" : "P"}.csv`;
  if (!existsSync(ruta)) { cae("cadena ausente"); continue; }
  const cot = leer0935(ruta);
  // FALLO CERRADO: la ATM leída ahora tiene que cuadrar con la ya guardada
  const ref = lado > 0 ? f.peaje.callATM : f.peaje.putATM;
  const q = cot.get(base);
  if (!q || Math.abs(q[0] - ref.bid) > 0.011 || Math.abs(q[1] - ref.ask) > 0.011) { cae("la cadena no cuadra a las 09:35"); continue; }
  DATOS.push({ fecha: f.fecha, ano: +f.fecha.slice(0, 4), mitad: +f.fecha.slice(0, 4) <= 2023 ? "A" : "B",
    lado, base, ci: f.cierre, cot });
  if (++hecho % 200 === 0) console.log(`   ${hecho} días · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
for (const [k, v] of Object.entries(fuera)) console.log(`   descartados por ${k}: ${v}`);
exigir(DATOS.length > 400, `muestra pequeña: ${DATOS.length}`);
console.log(`\ndías con señal: ${DATOS.length}`);

// ═══ MEDIR CADA ESTRUCTURA ═════════════════════════════════════════════════════════════════
const RES = {};
for (const E of ESTRUCTURAS) {
  const ops = [];
  let sinStrike = 0, sinPrecio = 0, imposible = 0;
  for (const d of DATOS) {
    const KL = d.base + d.lado * E.off;
    const KC = KL + d.lado * E.ancho;
    const qL = d.cot.get(KL), qC = d.cot.get(KC);
    if (!qL || !qC) { sinStrike++; continue; }
    if (!(qL[1] > 0) || !(qC[0] >= 0)) { sinPrecio++; continue; }
    const debito = qL[1] - qC[0];
    if (!(debito > 0) || debito >= E.ancho) { imposible++; continue; }
    const intr = d.lado > 0 ? Math.max(0, d.ci - KL) : Math.max(0, KL - d.ci);
    const pnl = (Math.min(intr, E.ancho) - debito) * 100 - 2 * TASA;
    ops.push({ fecha: d.fecha, ano: d.ano, mitad: d.mitad, riesgo: debito * 100, pnl, debito });
  }
  if (ops.length < 400) { console.log(`   ${E.et} → sólo ${ops.length} operaciones (${sinStrike} sin strike) — NO se usa`); continue; }
  ops.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const p = ops.map((o) => o.pnl), r = ops.map((o) => o.riesgo);
  const A = ops.filter((o) => o.mitad === "A").map((o) => o.pnl), B = ops.filter((o) => o.mitad === "B").map((o) => o.pnl);
  // ruina con la caja real, 2.000 barajados, 1 contrato
  const rnd = rng(31337); let arr = 0;
  for (let s = 0; s < 2000; s++) {
    const b = [...ops];
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    let caja = EFECTIVO, parado = false;
    for (const o of b) { if (o.riesgo > caja) { parado = true; break; } caja += o.pnl; }
    if (parado) arr++;
  }
  const diasAno = 252 * (ops.length / 1122);
  RES[E.et] = { n: ops.length, debitoP50: +mediana(r).toFixed(0), med: +media(p).toFixed(2), t: +tOf(p).toFixed(2),
    pctRiesgo: +(100 * media(p) / media(r)).toFixed(2), alAno: +(media(p) * diasAno).toFixed(0),
    A: +media(A).toFixed(2), B: +media(B).toFixed(2), gana: +(100 * p.filter((x) => x > 0).length / p.length).toFixed(1),
    ruina: +(100 * arr / 2000).toFixed(1), sinStrike };
}
console.log(`\n${"estructura".padEnd(36)} ${"n".padStart(4)} ${"débito".padStart(7)} ${"$/op".padStart(8)} ${"t".padStart(6)} ${"%riesgo".padStart(8)} ${"$/año".padStart(8)} ${"A".padStart(8)} ${"B".padStart(8)} ${"ruina%".padStart(7)}`);
for (const [et, r] of Object.entries(RES)) {
  console.log(`${et.padEnd(36)} ${String(r.n).padStart(4)} ${("$" + r.debitoP50).padStart(7)} ${r.med.toFixed(2).padStart(8)} ${r.t.toFixed(2).padStart(6)} ${(r.pctRiesgo + "%").padStart(8)} ${("$" + r.alAno).padStart(8)} ${r.A.toFixed(2).padStart(8)} ${r.B.toFixed(2).padStart(8)} ${(r.ruina + "%").padStart(7)}`);
}
const claves = Object.keys(RES);
const gA = claves.reduce((m, k) => (RES[k].A > RES[m].A ? k : m), claves[0]);
const gB = claves.reduce((m, k) => (RES[k].B > RES[m].B ? k : m), claves[0]);
console.log(`\n   mejor estructura según 2022-2023: «${gA.trim()}» → en 2024-2026 da $${RES[gA].B.toFixed(2)}/op`);
console.log(`   mejor estructura según 2024-2026: «${gB.trim()}» → en 2022-2023 da $${RES[gB].A.toFixed(2)}/op`);
console.log(`   ¿coinciden y ganan en las dos direcciones? ${gA === gB && RES[gA].A > 0 && RES[gA].B > 0 ? "SÍ: " + gA.trim() : "NO"}`);
const conCaja = Object.entries(RES).filter(([, r]) => r.ruina <= 5 && r.med > 0);
console.log(`\n   estructuras que SÍ caben en $${EFECTIVO.toLocaleString("es-ES")} (ruina ≤ 5%) y ganan dinero: ${conCaja.length ? conCaja.map(([k]) => k.trim()).join(" · ") : "NINGUNA"}`);

writeFileSync("scripts/tarjeta-barato.json", JSON.stringify({ generado: new Date().toISOString(), liston: LISTON, n: DATOS.length, estructuras: RES, mejorA: gA, mejorB: gB }, null, 1));
console.log(`\n   → scripts/tarjeta-barato.json\n`);
