// ═══════════════════════════════════════════════════════════════════════════════════════════
// ¿SON MUROS? · CIERRE — las cifras agregadas del informe, calculadas, no estimadas a mano.
//
// Junta lo medido en las vueltas 2-5 y saca: la tasa de rebote AGRUPADA con su azar, el peor día
// y la peor racha de desvanecer el muro (que es la operación que la hipótesis de Victor implica),
// y el peaje real de cada vehículo. Nada aquí se calcula a mano en el informe.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/muros-respetar-6.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const N = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
const R2 = JSON.parse(readFileSync("scripts/muros-respetar-2.json", "utf8"));
const SALIDA = "scripts/muros-respetar-cierre.json";
const CUENTA = 56389, HORQUILLA_SPY = 0.01;

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (v, q) => { const s = [...v].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] : NaN; };
const tUna = (v) => { const s = sd(v); return s > 0 ? media(v) / (s / Math.sqrt(v.length)) : 0; };
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "—");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const eur = (x) => (Number.isFinite(x) ? `$${Math.round(x).toLocaleString("es-ES")}` : "—");
function peorRacha(pls) { let a = 0, pico = 0, peor = 0; for (const p of pls) { a += p; pico = Math.max(pico, a); peor = Math.min(peor, a - pico); } return peor; }

// ═══ 1 · LA TASA DE REBOTE AGRUPADA ════════════════════════════════════════════════════════
console.log(`\n## 1 · TASA DE REBOTE AGRUPADA sobre las 6 casillas del período completo\n`);
let dec = 0, reb = 0, azarPond = 0;
const zs = [], zsS = [];
for (const [k, v] of Object.entries(R2.carrera)) {
  if (!k.endsWith("|T")) continue;
  dec += v.dec; reb += (v.rebPct / 100) * v.dec; azarPond += v.azar * v.dec;
  zs.push(v.z); zsS.push(v.zS);
  console.log(`   ${k.replace(/\|/g, " ").padEnd(16)} decid ${String(v.dec).padStart(4)} · rebote ${f1(v.rebPct).padStart(5)}% · azar ${f1(v.azar).padStart(5)}% · z ${f2(v.z).padStart(6)} · z estrat ${f2(v.zS).padStart(6)}`);
}
const rebPool = (100 * reb) / dec, azarPool = azarPond / dec;
console.log(`\n   AGRUPADO: ${dec} toques decididos · rebote ${f1(rebPool)}% · azar ${f1(azarPool)}% · diferencia ${f1(rebPool - azarPool)} puntos`);
console.log(`   (las 6 casillas comparten días: NO son independientes, así que no se suman sus z como si lo fueran)`);
const todos = Object.values(R2.carrera);
console.log(`   z de las ${todos.length} casillas: media ${f2(media(todos.map((v) => v.z)))} (simple) · ${f2(media(todos.map((v) => v.zS)))} (estratificado)`);
console.log(`   negativas: ${todos.filter((v) => v.z < 0).length}/${todos.length} simple · ${todos.filter((v) => v.zS < 0).length}/${todos.length} estratificado`);

// ═══ 2 · EL PEOR DÍA Y LA PEOR RACHA de desvanecer el muro ═════════════════════════════════
const spyPorDia = {};
for (const y of [2022, 2023, 2024, 2025, 2026]) {
  const p = `scripts/cache-theta/SPY_spotmin_y_${y}.json`;
  if (existsSync(p)) Object.assign(spyPorDia, JSON.parse(readFileSync(p, "utf8")));
}
console.log(`\n\n## 2 · DESVANECER EL MURO — peor día y peor racha, en SPY con toda la cuenta`);
console.log(`   Vender en el muro de calls / comprar en el de puts al tocarlo y aguantar al cierre.`);
console.log(`   Peaje: 1 céntimo de SPY, SUPUESTO declarado (esta caché guarda spot por minuto, no bid/ask).\n`);
console.log(`   ${"lente".padEnd(5)} ${"muro".padEnd(4)} ${"ops".padStart(5)} ${"media/op".padStart(9)} ${"t".padStart(6)} ${"$/año".padStart(9)} ${"peor día".padStart(10)} ${"peor racha".padStart(11)} ${"peor fecha".padStart(12)}`);
console.log(`   ${"─".repeat(88)}`);
const CIERRE = {};
for (const lente of ["gam", "gamD", "oi"]) {
  for (const [lado, sg] of [["call", 1], ["put", -1]]) {
    const kM = lado === "call" ? "muroCall" : "muroPut", kD = lado === "call" ? "dMuroCall" : "dMuroPut";
    const ops = [];
    for (const f of N.filas) {
      const bruto = spyPorDia[f.fecha.replace(/-/g, "")], razon = f.spy?.razonSPX ?? null;
      if (!bruto || !(razon > 0)) continue;
      const s = [];
      for (const [t, p] of bruto) if (t >= 575 && p > 0) s.push(p * razon);
      if (s.length < 300) continue;
      const K = f.niveles[lente][kM], dd = f.niveles[lente][kD]?.pts;
      if (K == null || dd == null || Math.sign(dd) !== sg) continue;
      let toca = false;
      for (const p of s) if (sg > 0 ? p >= K : p <= K) { toca = true; break; }
      if (!toca) continue;
      const aCierre = sg > 0 ? K - s[s.length - 1] : s[s.length - 1] - K;   // + = el desvanecimiento gana
      const acciones = Math.floor(CUENTA / (f.apertura / razon));
      ops.push({ fecha: f.fecha, pl: (aCierre / razon) * acciones - HORQUILLA_SPY * acciones });
    }
    if (ops.length < 20) continue;
    ops.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const pls = ops.map((o) => o.pl);
    const anios = (new Date(ops.at(-1).fecha) - new Date(ops[0].fecha)) / (365.25 * 864e5);
    const peor = ops.reduce((a, o) => (o.pl < a.pl ? o : a), ops[0]);
    const r = { ops: ops.length, mediaOp: media(pls), t: tUna(pls), anual: media(pls) * (ops.length / anios), peorDia: peor.pl, peorFecha: peor.fecha, peorRacha: peorRacha(pls) };
    CIERRE[`${lente}|${lado}`] = r;
    console.log(`   ${lente.padEnd(5)} ${lado.padEnd(4)} ${String(ops.length).padStart(5)} ${eur(r.mediaOp).padStart(9)} ${f2(r.t).padStart(6)} ${eur(r.anual).padStart(9)} ${eur(r.peorDia).padStart(10)} ${eur(r.peorRacha).padStart(11)} ${peor.fecha.padStart(12)}`);
  }
}

// ═══ 3 · EL PEAJE, EN LOS DOS VEHÍCULOS ════════════════════════════════════════════════════
console.log(`\n\n## 3 · EL PEAJE REAL — contra qué compite un rebote de 33 puntos\n`);
const hATM = [], hOTM = [], primaATM = [], primaOTM = [];
for (const f of N.filas) {
  if (f.peaje?.callATM?.horquillaPct > 0) { hATM.push(f.peaje.callATM.horquillaPct); primaATM.push((f.peaje.callATM.bid + f.peaje.callATM.ask) / 2); }
  if (f.peaje?.call05?.horquillaPct > 0) { hOTM.push(f.peaje.call05.horquillaPct); primaOTM.push((f.peaje.call05.bid + f.peaje.call05.ask) / 2); }
}
const ptsATM = pct(primaATM, 0.5) * pct(hATM, 0.5) / 100, ptsOTM = pct(primaOTM, 0.5) * pct(hOTM, 0.5) / 100;
console.log(`   SPXW 0DTE ATM ...... horquilla p50 ${f1(pct(hATM, 0.5))}% de una prima p50 de ${f1(pct(primaATM, 0.5))} pts → ${f2(ptsATM)} pts por lado (${eur(ptsATM * 100)}/contrato)`);
console.log(`   SPXW 0DTE +0,5% .... horquilla p50 ${f1(pct(hOTM, 0.5))}% de una prima p50 de ${f1(pct(primaOTM, 0.5))} pts → ${f2(ptsOTM)} pts por lado (${eur(ptsOTM * 100)}/contrato)`);
console.log(`   SPY ................ 1 céntimo = 0,10 pts de SPX por lado · 0,20 ida y vuelta (SUPUESTO, no medido aquí)`);
console.log(`\n   El rechazo mediano cuando SÍ rebota es ${f1(R2.arrastre["gam|call|T"].recRebP50)} pts.`);
console.log(`   → el peaje NO es lo que mata esto: hay sitio de sobra. Lo que falla es que el muro no elige.`);

writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), agrupado: { dec, rebPool, azarPool, dif: rebPool - azarPool }, zMedio: media(todos.map((v) => v.z)), zMedioS: media(todos.map((v) => v.zS)), desvanecer: CIERRE, peaje: { hATM: pct(hATM, 0.5), hOTM: pct(hOTM, 0.5), ptsATM, ptsOTM } }, null, 1));
console.log(`\n   escrito ${SALIDA}\n`);
