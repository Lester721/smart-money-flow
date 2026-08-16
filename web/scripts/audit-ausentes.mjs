// AUDITORÍA ADVERSARIA — tratamiento de contratos AUSENTES en eva-comprar-largo.mjs
// Solo lectura. No modifica nada. Uso: node --max-old-space-size=6144 scripts/audit-ausentes.mjs

import { readFileSync } from "node:fs";

const FILAS = process.env.EVA_LARGO_FILAS || "scripts/eva-largo-filas.json";
const HOR = [30, 90, 180, 365];

const filas = JSON.parse(readFileSync(FILAS, "utf8"));
console.log(`filas: ${filas.length.toLocaleString("es-ES")}\n`);

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const tCero = (v) => {
  const m = media(v);
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
  return m / (sd / Math.sqrt(v.length));
};
const pct = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(2)}%`;

// ── 1. TASA DE AUSENCIA A CADA LADO ────────────────────────────────────────
console.log("═══ 1. TASA DE AUSENCIA: tratamiento vs cubo de control ═══\n");
console.log("horiz      n     ausT       tasa T    ausC/total C     tasa C    T−C");
for (const H of HOR) {
  const m = filas.filter((f) => f.h[H]).map((f) => f.h[H]);
  if (!m.length) continue;
  const ausT = m.filter((x) => x.ausenteT).length;
  const totC = m.reduce((a, x) => a + x.n, 0);
  const ausC = m.reduce((a, x) => a + x.ausentesC, 0);
  const tT = ausT / m.length, tC = ausC / totC;
  console.log(
    `${String(H).padStart(4)}d ${String(m.length).padStart(7)} ${String(ausT).padStart(7)}   ` +
    `${(tT * 100).toFixed(3).padStart(8)}%  ${String(ausC).padStart(8)}/${String(totC).padStart(9)}  ` +
    `${(tC * 100).toFixed(3).padStart(8)}%   ${((tT - tC) * 100).toFixed(3).padStart(7)} pp`);
}

// tasa de ausencia del control PONDERADA POR FILA (cada fila pesa 1, como en la media pareada)
console.log("\n  (tasa C ponderada por fila, que es como entra en la media pareada)");
for (const H of HOR) {
  const m = filas.filter((f) => f.h[H]).map((f) => f.h[H]);
  if (!m.length) continue;
  const tCfila = media(m.map((x) => x.ausentesC / x.n));
  const tT = m.filter((x) => x.ausenteT).length / m.length;
  console.log(`  ${String(H).padStart(3)}d  tasa T ${(tT * 100).toFixed(3)}%  ·  tasa C ${(tCfila * 100).toFixed(3)}%  ·  T−C ${((tT - tCfila) * 100).toFixed(3)} pp`);
}

// ── 2. CUÁNTO DE LA DIFERENCIA VIENE DE LOS AUSENTES ───────────────────────
// Algebra: rC = (suma_presentes + (−1)*ausentesC) / n  →  suma_presentes = rC*n + ausentesC
// media del control SOLO sobre presentes = (rC*n + ausentesC) / (n − ausentesC)
console.log("\n\n═══ 2. DESCOMPOSICIÓN: ¿de dónde sale la diferencia? ═══\n");
console.log("Escenarios:");
console.log("  BASE      = tal cual está el test (ausente = −100% en los dos lados)");
console.log("  SIN-AUS   = ausentes tirados en LOS DOS lados (trampa de supervivencia, solo diagnóstico)");
console.log("  T-CERO    = ausentes del control tirados, los del tratamiento NO (control artificialmente mejor)");
console.log("  C-CERO    = ausentes del tratamiento tirados, los del control NO (control artificialmente peor)\n");
console.log("horiz    BASE dif    t     SIN-AUS dif    t      T-CERO dif    C-CERO dif      n(sin-aus)");
for (const H of HOR) {
  const m = filas.filter((f) => f.h[H]).map((f) => f.h[H]);
  if (!m.length) continue;

  const dBase = m.map((x) => x.d);

  // control solo sobre presentes
  const cPres = (x) => (x.n - x.ausentesC > 0 ? (x.c * x.n + x.ausentesC) / (x.n - x.ausentesC) : null);

  // SIN-AUS: se tira la fila si el tratamiento está ausente, y el control se promedia sin ausentes
  const sinAus = [];
  for (const x of m) { if (x.ausenteT) continue; const c = cPres(x); if (c == null) continue; sinAus.push(x.t - c); }

  // T-CERO: tratamiento con su −100%, control SIN ausentes (control mejor artificialmente)
  const tCeroArr = [];
  for (const x of m) { const c = cPres(x); if (c == null) continue; tCeroArr.push(x.t - c); }

  // C-CERO: tratamiento sin ausentes (se tira la fila), control con sus −100%
  const cCeroArr = m.filter((x) => !x.ausenteT).map((x) => x.d);

  console.log(
    `${String(H).padStart(4)}d  ${pct(media(dBase)).padStart(9)} ${tCero(dBase).toFixed(2).padStart(6)}   ` +
    `${pct(media(sinAus)).padStart(9)} ${tCero(sinAus).toFixed(2).padStart(6)}    ` +
    `${pct(media(tCeroArr)).padStart(9)}     ${pct(media(cCeroArr)).padStart(9)}   ${String(sinAus.length).padStart(7)}`);
}

// ── 3. LA DIFERENCIA SOLO ENTRE LAS FILAS CON ausenteT ─────────────────────
console.log("\n\n═══ 3. Filas con tratamiento AUSENTE (t = −100%) vs el resto ═══\n");
console.log("horiz   n(ausT)  dif media(ausT)   n(presT)  dif media(presT)   contribución de ausT a la dif total");
for (const H of HOR) {
  const m = filas.filter((f) => f.h[H]).map((f) => f.h[H]);
  if (!m.length) continue;
  const a = m.filter((x) => x.ausenteT).map((x) => x.d);
  const p = m.filter((x) => !x.ausenteT).map((x) => x.d);
  const contrib = a.length ? (media(a) * a.length) / m.length : 0;
  console.log(`${String(H).padStart(4)}d ${String(a.length).padStart(7)}  ${(a.length ? pct(media(a)) : "—").padStart(13)}   ` +
              `${String(p.length).padStart(7)}  ${pct(media(p)).padStart(14)}    ${pct(contrib).padStart(9)} de ${pct(media(m.map((x) => x.d)))}`);
}

// ── 4. EL AGUJERO DEL DÍA DE SALIDA: exp entre `objetivo` y `diaSal` ───────
// El medidor exige exp > objetivo, pero VENDE en diaSal, que puede ser hasta 10 días después.
// Si exp cae en (objetivo, diaSal], el contrato YA VENCIÓ al vender → ausente → −100% falso.
console.log("\n\n═══ 4. ¿Vence el contrato ENTRE el objetivo y el día de salida real? ═══\n");
const ms = (ymd) => Date.parse(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T00:00:00Z`);
const sinG = (s) => String(s).replace(/-/g, "");
console.log("horiz   n    diaSal>objetivo   exp<=diaSal (tratamiento)    de esos, ausentes");
for (const H of HOR) {
  const con = filas.filter((f) => f.h[H]);
  if (!con.length) continue;
  let desfase = 0, vencido = 0, vencidoYAusente = 0;
  const dDesf = [];
  for (const f of con) {
    const obj = sinG(new Date(ms(f.dia) + H * 86_400_000).toISOString().slice(0, 10));
    const dSal = f.h[H].diaSal;
    const dd = (ms(dSal) - ms(obj)) / 86_400_000;
    dDesf.push(dd);
    if (dd > 0) desfase++;
    if (ms(sinG(f.exp)) <= ms(dSal)) { vencido++; if (f.h[H].ausenteT) vencidoYAusente++; }
  }
  console.log(`${String(H).padStart(4)}d ${String(con.length).padStart(6)}  ${String(desfase).padStart(7)} (${((desfase / con.length) * 100).toFixed(1)}%)   ` +
              `${String(vencido).padStart(7)} (${((vencido / con.length) * 100).toFixed(2)}%)          ${String(vencidoYAusente).padStart(6)}` +
              `   · desfase medio ${media(dDesf).toFixed(2)} d, máx ${Math.max(...dDesf)} d`);
}

// ── 5. DIF SIN LAS FILAS DONDE EL TRATAMIENTO YA HABÍA VENCIDO AL VENDER ───
console.log("\n\n═══ 5. Diferencia quitando las filas con exp <= diaSal (vencido al vender) ═══\n");
for (const H of HOR) {
  const con = filas.filter((f) => f.h[H]);
  if (!con.length) continue;
  const ok = con.filter((f) => ms(sinG(f.exp)) > ms(f.h[H].diaSal)).map((f) => f.h[H].d);
  const todo = con.map((f) => f.h[H].d);
  console.log(`${String(H).padStart(4)}d  todo: ${pct(media(todo))} (t=${tCero(todo).toFixed(2)}, n=${todo.length})   ` +
              `· sin vencidos: ${pct(media(ok))} (t=${tCero(ok).toFixed(2)}, n=${ok.length})`);
}

// ── 6. MUESTRA DE CONTRATOS AUSENTES para preguntar a ThetaData ────────────
console.log("\n\n═══ 6. 15 contratos con tratamiento AUSENTE a 30 días (para preguntar a Theta) ═══\n");
const cand = [];
for (const f of filas) {
  const m = f.h[30];
  if (m && m.ausenteT) cand.push({ ticker: f.ticker, dia: f.dia, exp: sinG(f.exp), strike: f.strike, right: f.right,
                                   diaSal: m.diaSal, askEnt: f.askEnt, bidEnt: f.bidEnt, dte: f.dte });
}
console.log(`total candidatos a 30d: ${cand.length}`);
// espaciados a lo largo de la lista para no coger 15 del mismo día
const paso = Math.max(1, Math.floor(cand.length / 15));
const muestra = [];
const vistos = new Set();
for (let i = 0; i < cand.length && muestra.length < 15; i += paso) {
  const c = cand[i];
  const k = `${c.ticker}|${c.exp}|${c.strike}|${c.right}|${c.diaSal}`;
  if (vistos.has(k)) continue;
  vistos.add(k); muestra.push(c);
}
for (const c of muestra) {
  console.log(`  ${c.ticker.padEnd(5)} entrada ${c.dia} ask ${String(c.askEnt).padStart(6)} · exp ${c.exp} K ${String(c.strike).padStart(7)} ${c.right} · VENDER ${c.diaSal}` +
              `  →  /v3/option/history/eod?symbol=${c.ticker}&expiration=${c.exp}&strike=${Math.round(c.strike * 1000)}&right=${c.right}&start_date=${c.diaSal}&end_date=${c.diaSal}`);
}
