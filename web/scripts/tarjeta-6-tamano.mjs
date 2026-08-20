// TARJETA (6) — ¿CUÁNTOS CONTRATOS? El tamaño más grande que sobrevive con $7.977.
// Uso: node --import tsx --max-old-space-size=10240 scripts/tarjeta-6-tamano.mjs
// Reconstruye la tarjeta ESTRECHA (ATM, corta 10 pts fuera) y barre el tamaño fijo,
// midiendo en cada uno: dinero al año y % de órdenes barajados en los que se queda tirada.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026";
const CUENTA = 56389, EFECTIVO = 7977, TASA = 0.03;
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const pct = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };
const mediana = (v) => pct(v, 50);
function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }
function rng(s0) { let a = s0 >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function columnas(cab) { const c = cab.split(",").map((s) => s.trim()); const idx = {};
  for (const n of ["strike", "timestamp", "bid", "ask"]) { const i = c.indexOf(n); if (i < 0) throw new Error("FALLO CERRADO: falta " + n); idx[n] = i; } return idx; }
function leer0935(ruta) { const txt = readFileSync(ruta, "utf8"); const nl = txt.indexOf("\n"); const idx = columnas(txt.slice(0, nl));
  const cot = new Map(); let pos = nl + 1;
  while (pos < txt.length) { let fin = txt.indexOf("\n", pos); if (fin < 0) fin = txt.length;
    const l = txt.slice(pos, fin); pos = fin + 1; if (l.length < 20) continue;
    const p = l.split(","); if (p[idx.timestamp].slice(11, 16) !== "09:35") continue;
    cot.set(+p[idx.strike], [+p[idx.bid], +p[idx.ask]]); } return cot; }
const J = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
const OPS = [];
for (const f of J.filas) {
  const net = f.niveles?.gam?.netPunto, K = f.niveles?.gamD?.imanNeto;
  if (!Number.isFinite(net) || net >= 0) continue;
  if (!(K > 0) || !(f.apertura > 0) || !(f.cierre > 0)) continue;
  const lado = Math.sign(K - f.apertura); if (lado === 0) continue;
  const KL = lado > 0 ? f.peaje?.callATM?.K : f.peaje?.putATM?.K; if (!(KL > 0)) continue;
  const ruta = DIR + "/iv_" + f.fecha + "_" + (lado > 0 ? "C" : "P") + ".csv"; if (!existsSync(ruta)) continue;
  const cot = leer0935(ruta);
  const ref = lado > 0 ? f.peaje.callATM : f.peaje.putATM; const qref = cot.get(KL);
  if (!qref || Math.abs(qref[1] - ref.ask) > 0.011) continue;
  const KC = KL + lado * 10; const qL = cot.get(KL), qC = cot.get(KC);
  if (!qL || !qC || !(qL[1] > 0)) continue;
  const debito = qL[1] - qC[0]; if (!(debito > 0) || debito >= 10) continue;
  const intr = lado > 0 ? Math.max(0, f.cierre - KL) : Math.max(0, KL - f.cierre);
  OPS.push({ fecha: f.fecha, riesgo: debito * 100, pnl: (Math.min(intr, 10) - debito) * 100 - 2 * TASA });
}
OPS.sort((a, b) => a.fecha.localeCompare(b.fecha));
exigir(OPS.length > 400, "muestra pequeña: " + OPS.length);
const diasAno = 252 * (OPS.length / 1122), anos = OPS.length / diasAno;
console.log("\n" + "=".repeat(96));
console.log("TARJETA (6) — TAMANO: el mayor numero de contratos que sobrevive con $" + EFECTIVO.toLocaleString("es-ES"));
console.log("=".repeat(96));
console.log("n=" + OPS.length + " · debito p50 $" + mediana(OPS.map(o => o.riesgo)).toFixed(0) + " · " + anos.toFixed(2) + " anos");
console.log("\n" + "contratos".padEnd(10) + "compromiso".padStart(12) + "$/ano".padStart(10) + "% cuenta".padStart(10) + "peor dia".padStart(10) + "peor caida".padStart(12) + "min caja".padStart(10) + "ruina%".padStart(9));
const FILAS = [];
for (const N of [1, 2, 3, 4, 5, 6, 8, 10]) {
  const rnd = rng(31337); let arr = 0;
  for (let s = 0; s < 2000; s++) {
    const b = [...OPS];
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    let caja = EFECTIVO, parado = false;
    for (const o of b) { if (N * o.riesgo > caja) { parado = true; break; } caja += N * o.pnl; }
    if (parado) arr++;
  }
  let caja = EFECTIVO, minC = EFECTIVO, peorDia = 0, pico = EFECTIVO, caida = 0, saltados = 0;
  for (const o of OPS) { const coste = N * o.riesgo; if (coste > caja) { saltados++; continue; }
    minC = Math.min(minC, caja - coste); caja += N * o.pnl;
    peorDia = Math.min(peorDia, N * o.pnl); pico = Math.max(pico, caja); caida = Math.min(caida, caja - pico); }
  const alAno = (caja - EFECTIVO) / anos;
  const ruina = 100 * arr / 2000;
  FILAS.push({ N, compromiso: +(N * mediana(OPS.map(o => o.riesgo))).toFixed(0), alAno: +alAno.toFixed(0), pctCuenta: +(100 * alAno / CUENTA).toFixed(1), peorDia: +peorDia.toFixed(0), peorCaida: +caida.toFixed(0), minCaja: +minC.toFixed(0), ruina: +ruina.toFixed(1), saltados });
  console.log(String(N).padEnd(10) + ("$" + (N * mediana(OPS.map(o => o.riesgo))).toFixed(0)).padStart(12) + ("$" + alAno.toFixed(0)).padStart(10) + ((100 * alAno / CUENTA).toFixed(1) + "%").padStart(10) + ("$" + peorDia.toFixed(0)).padStart(10) + ("$" + caida.toFixed(0)).padStart(12) + ("$" + minC.toFixed(0)).padStart(10) + (ruina.toFixed(1) + "%").padStart(9) + (ruina <= 5 ? "  <- aguanta" : ""));
}
const seguro = FILAS.filter(f => f.ruina <= 5).sort((a, b) => b.N - a.N)[0];
console.log("\n   TAMANO DE LA TARJETA: " + (seguro ? seguro.N + " contrato(s) — $" + seguro.alAno + "/ano = " + seguro.pctCuenta + "% de la cuenta" : "NINGUNO aguanta por debajo del 5% de ruina"));
writeFileSync("scripts/tarjeta-tamano.json", JSON.stringify({ generado: new Date().toISOString(), n: OPS.length, diasAno: +diasAno.toFixed(0), filas: FILAS, tamanoSeguro: seguro ? seguro.N : null }, null, 1));
console.log("\n   -> scripts/tarjeta-tamano.json\n");
