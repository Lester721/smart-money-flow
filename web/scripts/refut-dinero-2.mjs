// ═══════════════════════════════════════════════════════════════════════════════════════════════
// REFUTACIÓN CON LA LENTE «DINERO» · SEGUNDA PARTE
//   10 · la cotización rezagada, MEDIDA (era un pendiente sin número en la memoria)
//   11 · supervivencia con arranque rodante — no una fecha de inicio afortunada, las 870
//   12 · el TAMAÑO que de verdad cabe en $7.977, y qué queda a ese tamaño
//   13 · el listón: qué gana el dinero quieto en el mismo período
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/refut-dinero-2.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import { tWelch, listonT } from "../lib/barreraHallazgos";

const PRUEBAS = 70;
const LISTON = listonT(PRUEBAS);
const EFECTIVO = 7977, CUENTA = 56389, COLATERAL = 5000, ACCIONES_HOOD = 500;
const TASA_MARGEN = 0.05, BASE_DIAS = 360, COMM_PATA = 0.03, DIAS_ANO = 252;

const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : NaN; };
const H = (t) => { console.log("\n" + "═".repeat(112)); console.log(t); console.log("═".repeat(112)); };

const filas = JSON.parse(readFileSync("scripts/refut-dinero-filas.json", "utf8"));
const HOOD = JSON.parse(readFileSync("scripts/refut-hood-cierres.json", "utf8"));
const RET = JSON.parse(readFileSync("scripts/refut-dinero-retraso.json", "utf8"));
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));

const FEST = new Set(["2022-01-17","2022-02-21","2022-04-15","2022-05-30","2022-06-20","2022-07-04","2022-09-05","2022-11-24","2022-12-26",
"2023-01-02","2023-01-16","2023-02-20","2023-04-07","2023-05-29","2023-06-19","2023-07-04","2023-09-04","2023-11-23","2023-12-25",
"2024-01-01","2024-01-15","2024-02-19","2024-03-29","2024-05-27","2024-06-19","2024-07-04","2024-09-02","2024-11-28","2024-12-25",
"2025-01-01","2025-01-09","2025-01-20","2025-02-17","2025-04-18","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-11-27","2025-12-25",
"2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25"]);
const iso = (d) => d.toISOString().slice(0, 10);
const SESIONES = [];
for (let d = new Date("2021-12-01T00:00:00Z"); iso(d) <= "2026-12-31"; d.setUTCDate(d.getUTCDate() + 1)) {
  const s = iso(d), w = d.getUTCDay();
  if (w !== 0 && w !== 6 && !FEST.has(s)) SESIONES.push(s);
}
const POS = new Map(SESIONES.map((s, i) => [s, i]));
for (const f of filas) {
  f.ultimoMes = SESIONES[POS.get(f.fecha) + 1].slice(5, 7) !== f.fecha.slice(5, 7) ? 1 : 0;
  f.pl = f.creditoNat - f.perdidaC - f.perdidaP - 8 * COMM_PATA;
  f.hood = HOOD[f.fecha] ?? null;
}
const A = filas.filter((f) => f.fecha < "2024-01-01"), B = filas.filter((f) => f.fecha >= "2024-01-01");
const sinRegla = () => false, conRegla = (f) => f.ultimoMes === 1;

// ═══ 10 · LA COTIZACIÓN REZAGADA ════════════════════════════════════════════════════════════
H("10 · LA COTIZACIÓN REZAGADA, MEDIDA · mismas 4 patas, cotizadas 5 minutos antes y 5 después");
const mapRet = new Map(RET.map((r) => [r.fecha, r]));
const con = filas.filter((f) => mapRet.has(f.fecha)).map((f) => ({ ...f, r: mapRet.get(f.fecha) }));
console.log(`  ${con.length} días con las tres cotizaciones`);
const d05 = con.map((f) => f.r.c1105 - f.r.c1100), dm5 = con.map((f) => f.r.c1055 - f.r.c1100);
console.log(`  crédito natural a 11:00 (referencia):        media ${eur(media(con.map((f) => f.r.c1100)))}`);
console.log(`  si el relleno cae 5 min TARDE (11:05):       media ${eur(media(con.map((f) => f.r.c1105)))}  · diferencia ${eur(media(d05))} · p5 ${eur(pct(d05, 0.05))} · p95 ${eur(pct(d05, 0.95))}`);
console.log(`  si el precio que miré era de 5 min ANTES:    media ${eur(media(con.map((f) => f.r.c1055)))}  · diferencia ${eur(media(dm5))} · p5 ${eur(pct(dm5, 0.05))} · p95 ${eur(pct(dm5, 0.95))}`);
const desv = Math.sqrt(media(d05.map((x) => x * x)) - media(d05) ** 2);
console.log(`  desviación del ruido de 5 minutos: ${eur(desv)} sobre un crédito medio de ${eur(media(con.map((f) => f.r.c1100)))} → ${(desv / media(con.map((f) => f.r.c1100)) * 100).toFixed(1)}%`);
console.log(`\n  el escenario MALO: siempre te rellenan por el lado que te perjudica (min de las 3 horas)`);
const peor = con.map((f) => Math.min(f.r.c1055, f.r.c1100, f.r.c1105));
const plPeor = con.map((f, i) => peor[i] - f.perdidaC - f.perdidaP - 8 * COMM_PATA);
const anosCon = con.length / DIAS_ANO;
const totBase = con.reduce((a, f) => a + f.pl, 0) / anosCon;
console.log(`    crédito medio ${eur(media(peor))} (frente a ${eur(media(con.map((f) => f.r.c1100)))}) → ${eur(media(peor) - media(con.map((f) => f.r.c1100)))} por operación`);
console.log(`    $/año 1.121 días: ${eur(totBase)} → ${eur(plPeor.reduce((a, b) => a + b, 0) / anosCon)}`);
const conA = con.filter((f) => f.fecha < "2024-01-01"), conB = con.filter((f) => f.fecha >= "2024-01-01");
const plPeorDe = (f) => Math.min(f.r.c1055, f.r.c1100, f.r.c1105) - f.perdidaC - f.perdidaP - 8 * COMM_PATA;
for (const [et, g] of [["2022-2023", conA], ["2024-2026", conB]]) {
  const an = g.length / DIAS_ANO;
  console.log(`    ${et}: ${eur(g.reduce((a, f) => a + f.pl, 0) / an)} → ${eur(g.reduce((a, f) => a + plPeorDe(f), 0) / an)} (sin regla) · ${eur(g.filter((f) => !conRegla(f)).reduce((a, f) => a + plPeorDe(f), 0) / an)} (CON regla)`);
}

// ═══ 11 · SUPERVIVENCIA CON ARRANQUE RODANTE ════════════════════════════════════════════════
H("11 · SUPERVIVENCIA · no una fecha de inicio, TODAS · 1 cóndor, 252 sesiones, desde $7.977");
/** Recorre una ventana desde `i` durante `n` sesiones. Devuelve caja mínima y si revienta. */
function ventana(fs, i, n, saltar, contratos, { conInteres = true } = {}) {
  let c = EFECTIVO, minC = EFECTIVO, prev = null, fin = c;
  for (let j = i; j < Math.min(i + n, fs.length); j++) {
    const f = fs[j];
    if (conInteres && prev && c < 0) {
      const dn = (new Date(f.fecha + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000;
      c -= -c * TASA_MARGEN / BASE_DIAS * dn;
    }
    prev = f.fecha;
    if (saltar(f)) continue;
    c += f.pl * contratos;
    if (c < minC) minC = c;
  }
  return { min: minC, fin: c };
}
const VENT = 252;
function rodante(saltar, contratos) {
  const res = [];
  for (let i = 0; i + VENT <= filas.length; i++) res.push(ventana(filas, i, VENT, saltar, contratos));
  const rojo = res.filter((r) => r.min < 0).length;
  const bajo3 = res.filter((r) => r.min < EFECTIVO - COLATERAL).length;  // ya no puede reponer colateral
  return { n: res.length, rojo, bajo3, pctRojo: rojo / res.length, minPeor: Math.min(...res.map((r) => r.min)),
           minMediano: pct(res.map((r) => r.min), 0.5), finMediano: pct(res.map((r) => r.fin), 0.5),
           finPeor: Math.min(...res.map((r) => r.fin)), finMejor: Math.max(...res.map((r) => r.fin)) };
}
console.log("| regla | contratos | ventanas de 1 año | acaban en NÚMEROS ROJOS | caja mín. mediana | caja mín. peor | resultado mediano |");
console.log("|---|---|---|---|---|---|---|");
for (const [rn, rg] of [["sin", sinRegla], ["CON fin de mes", conRegla]]) {
  for (const k of [1]) {
    const r = rodante(rg, k);
    console.log(`| ${rn} | ${k} | ${r.n} | **${r.rojo} (${(r.pctRojo * 100).toFixed(0)}%)** | ${eur(r.minMediano)} | ${eur(r.minPeor)} | ${eur(r.finMediano - EFECTIVO)} |`);
  }
}
console.log(`\n  y separando por período de arranque:`);
for (const [et, lo, hi] of [["arranca en 2022-2023", "2022-01-01", "2024-01-01"], ["arranca en 2024-2025", "2024-01-01", "2025-09-01"]]) {
  for (const [rn, rg] of [["sin regla", sinRegla], ["CON regla", conRegla]]) {
    const res = [];
    for (let i = 0; i + VENT <= filas.length; i++) if (filas[i].fecha >= lo && filas[i].fecha < hi) res.push(ventana(filas, i, VENT, rg, 1));
    const rojo = res.filter((r) => r.min < 0).length;
    console.log(`    ${et} · ${rn.padEnd(10)} ${String(res.length).padStart(3)} ventanas · ${String(rojo).padStart(3)} en rojo (${(rojo / res.length * 100).toFixed(0)}%) · caja mín mediana ${eur(pct(res.map((r) => r.min), 0.5))}`);
  }
}

// ═══ 12 · EL TAMAÑO QUE CABE ════════════════════════════════════════════════════════════════
H("12 · ¿QUÉ TAMAÑO CABE DE VERDAD EN $7.977? · y qué queda a ese tamaño");
console.log("  (fracción de cóndor = lo que haría XSP, el mismo índice a 1/10. Aquí sólo se escala; la");
console.log("   horquilla de XSP NO está medida y en un contrato 10 veces menor el peaje relativo muerde más.)");
console.log("\n| tamaño | ventanas en rojo, SIN regla | ventanas en rojo, CON regla | $/año 1.121 días CON regla | % de la cuenta |");
console.log("|---|---|---|---|---|");
const anosT = filas.length / DIAS_ANO;
const netoConRegla = filas.filter((f) => !conRegla(f)).reduce((a, f) => a + f.pl, 0) / anosT;
for (const k of [1, 0.5, 0.3, 0.2, 0.1, 0.05]) {
  const rs = rodante(sinRegla, k), rc = rodante(conRegla, k);
  console.log(`| ${k === 1 ? "1 cóndor SPXW" : `${k} (≈ ${Math.round(k * 10)} cóndor${Math.round(k * 10) === 1 ? "" : "es"} XSP)`} | ${rs.rojo} (${(rs.pctRojo * 100).toFixed(0)}%) | ${rc.rojo} (${(rc.pctRojo * 100).toFixed(0)}%) | ${eur(netoConRegla * k)} | ${(netoConRegla * k / CUENTA * 100).toFixed(1)}% |`);
}
// tamaño máximo que nunca deja la caja en rojo en NINGUNA ventana de un año
let kMax = 0;
for (let k = 1; k >= 0.005; k -= 0.005) { if (rodante(conRegla, k).rojo === 0) { kMax = k; break; } }
console.log(`\n  TAMAÑO MÁXIMO que NUNCA deja la caja en rojo en ninguna de las ${rodante(conRegla, 1).n} ventanas de un año, CON la regla: ${kMax.toFixed(3)} cóndores SPXW`);
console.log(`  = ${(kMax * 10).toFixed(1)} cóndores XSP · rinde ${eur(netoConRegla * kMax)}/año = ${(netoConRegla * kMax / CUENTA * 100).toFixed(2)}% de la cuenta`);
let kMaxSin = 0;
for (let k = 1; k >= 0.005; k -= 0.005) { if (rodante(sinRegla, k).rojo === 0) { kMaxSin = k; break; } }
const netoSin = filas.reduce((a, f) => a + f.pl, 0) / anosT;
console.log(`  el mismo tamaño SIN la regla: ${kMaxSin.toFixed(3)} cóndores · rinde ${eur(netoSin * kMaxSin)}/año`);
console.log(`\n  → LO QUE APORTA LA REGLA, AL TAMAÑO QUE LA CUENTA AGUANTA: ${eur(netoConRegla * kMax - netoSin * kMaxSin)}/año`);

// ═══ 13 · EL LISTÓN ═════════════════════════════════════════════════════════════════════════
H("13 · EL LISTÓN · qué hizo el propio índice en el mismo período");
const spx0 = filas[0].cierre, spx1 = filas[filas.length - 1].cierre;
const anosSpx = (new Date(filas[filas.length - 1].fecha) - new Date(filas[0].fecha)) / 86400000 / 365.25;
const cagr = (spx1 / spx0) ** (1 / anosSpx) - 1;
console.log(`  SPX ${filas[0].fecha} ${spx0.toFixed(0)} → ${filas[filas.length - 1].fecha} ${spx1.toFixed(0)} · ${(cagr * 100).toFixed(1)}%/año sin dividendos (${anosSpx.toFixed(2)} años)`);
console.log(`  sobre los ${eur(CUENTA)} de la cuenta eso son ${eur(CUENTA * cagr)}/año.`);
// peor caída del propio índice, de cierre a cierre, dentro de la muestra
let pico = 0, ddSpx = 0;
for (const f of filas) { if (f.cierre > pico) pico = f.cierre; const d = f.cierre / pico - 1; if (d < ddSpx) ddSpx = d; }
console.log(`  peor caída del índice en la muestra: ${(ddSpx * 100).toFixed(1)}% (sobre ${eur(CUENTA)} serían ${eur(CUENTA * ddSpx)})`);
console.log(`\n  el cóndor CON la regla, AL TAMAÑO QUE CABE: ${eur(netoConRegla * kMax)}/año.`);
console.log(`  el índice, con la cuenta entera dentro:  ${eur(CUENTA * cagr)}/año.`);

// ═══ 14 · EL RESUMEN QUE IMPORTA ════════════════════════════════════════════════════════════
H("14 · ¿QUEDA ALGO DESPUÉS DE TODO ESO?");
const chk = [];
chk.push(["horquilla real de las 4 patas", true, `peaje medio ${eur(media(filas.map((f) => f.peaje)))} = 2,7% del crédito; el hallazgo YA paga el natural`]);
chk.push(["la hora de liquidación", true, `las 1.121 filas cierran a las 16:00 — los últimos 30 min SÍ están en el dato`]);
chk.push(["colateral en $73.874 de poder de compra", true, `caben 14 cóndores; el colateral no es la restricción`]);
chk.push(["pérdidas en $7.977 de efectivo", false, `un solo día malo se lleva ${eur(Math.max(...filas.map((f) => f.riesgoMax)))} = 64% del efectivo`]);
chk.push(["interés de margen al 5%", false, `${eur(432)}/año con regla, ${eur(726)}/año sin ella — pequeño, pero es que la caja no debería estar negativa nunca`]);
chk.push(["la regla en sí, neta de todo", true, `+$7.646/año fuera de muestra en B, +$4.085/año fuera de muestra en A`]);
for (const [q, ok, txt] of chk) console.log(`  ${ok ? "✅" : "⛔"} ${q.padEnd(42)} ${txt}`);
