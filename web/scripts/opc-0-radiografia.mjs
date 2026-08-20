// ═══════════════════════════════════════════════════════════════════════════════════════════
// OPERAR · OPCIONES (0) — RADIOGRAFÍA de la cadena 0DTE antes de medir nada.
//
// Se MIRA el fichero antes de escribir la medición:
//   · ¿qué timestamps hay de verdad? ¿el de 09:30 está muerto (bid=0, subyacente=0)?
//   · ¿cuántos strikes por hora? ¿la ATM tiene cotización?
//   · el ANCHO de la horquilla en % de la prima, por moneyness y por hora
//   · y el número que decide: ¿cuántos PUNTOS tiene que moverse el SPX sólo para EMPATAR?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/opc-0-radiografia.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync, readdirSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const pct = (v, p) => { const s = [...v].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))] : NaN; };
const med = (v) => pct(v, 50);
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");

// ── columnas() lanza si falta un campo: un campo que no existe se lee como 0 ────────────────
function columnas(head, req) {
  const c = head.trim().split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
  const ix = {};
  for (const r of req) { const i = c.indexOf(r); if (i < 0) throw new Error(`FALTA la columna "${r}" — hay: ${c.join(",")}`); ix[r] = i; }
  return ix;
}
const num = (s) => { const v = parseFloat(s); return Number.isFinite(v) ? v : NaN; };

function leerCadena(fecha, lado) {
  const p = `${DIR}/iv_${fecha}_${lado}.csv`;
  if (!existsSync(p)) return null;
  const L = readFileSync(p, "utf8").split("\n");
  const ix = columnas(L[0], ["strike", "right", "timestamp", "bid", "ask", "implied_vol", "underlying_price"]);
  const porHora = new Map();
  for (let i = 1; i < L.length; i++) {
    const l = L[i]; if (!l) continue;
    const c = l.split(",");
    const ts = (c[ix.timestamp] || "").replace(/"/g, "");
    const hh = ts.slice(11, 16); if (!hh) continue;
    const row = { K: num(c[ix.strike]), bid: num(c[ix.bid]), ask: num(c[ix.ask]), iv: num(c[ix.implied_vol]), S: num(c[ix.underlying_price]) };
    if (!porHora.has(hh)) porHora.set(hh, []);
    porHora.get(hh).push(row);
  }
  return porHora;
}

const dias = readdirSync(DIR).filter((f) => /^iv_\d{4}-\d{2}-\d{2}_C\.csv$/.test(f)).map((f) => f.slice(3, 13)).sort();
console.log("\n" + "═".repeat(95));
console.log(`RADIOGRAFÍA · cadena 0DTE de SPXW · ${dias.length} días · ${dias[0]} → ${dias.at(-1)}`);
console.log("═".repeat(95));

// muestra repartida por los 5 años, no los primeros N (los primeros son todos de enero-2022)
const MUESTRA = [];
for (let i = 0; i < 40; i++) MUESTRA.push(dias[Math.floor((i + 0.5) * dias.length / 40)]);

// ── 1 · ¿QUÉ TIMESTAMPS HAY, Y CUÁLES ESTÁN MUERTOS? ───────────────────────────────────────
console.log(`\n## 1 · LOS TIMESTAMPS  (muestra de ${MUESTRA.length} días repartidos por los 5 años)\n`);
const horas = new Map(); // hh -> {dias, filas, bidCero, subCero}
for (const d of MUESTRA) {
  const C = leerCadena(d, "C"); if (!C) continue;
  for (const [hh, rows] of C) {
    const h = horas.get(hh) || { dias: 0, filas: 0, bidCero: 0, subCero: 0 };
    h.dias++; h.filas += rows.length;
    h.bidCero += rows.filter((r) => !(r.bid > 0)).length;
    h.subCero += rows.filter((r) => !(r.S > 0)).length;
    horas.set(hh, h);
  }
}
const hOrd = [...horas.keys()].sort();
console.log(`   primer sello ${hOrd[0]} · último ${hOrd.at(-1)} · ${hOrd.length} sellos distintos`);
console.log(`\n   ${"hora".padEnd(6)} ${"días".padStart(5)} ${"filas/día".padStart(10)} ${"bid=0".padStart(7)} ${"subyacente=0".padStart(13)}   ¿vivo?`);
for (const hh of [hOrd[0], hOrd[1], hOrd[2], "09:35", "10:00", "12:00", "15:00", "15:55", hOrd.at(-1)]) {
  const h = horas.get(hh); if (!h) { console.log(`   ${hh.padEnd(6)}  — no existe`); continue; }
  const sc = (100 * h.subCero / h.filas);
  console.log(`   ${hh.padEnd(6)} ${String(h.dias).padStart(5)} ${(h.filas / h.dias).toFixed(0).padStart(10)} ${(100 * h.bidCero / h.filas).toFixed(0).padStart(6)}% ${sc.toFixed(0).padStart(12)}%   ${sc > 50 ? "MUERTO" : "sí"}`);
}

// ── 2 · LA HORQUILLA, EN % DE LA PRIMA ─────────────────────────────────────────────────────
console.log(`\n## 2 · LA HORQUILLA por moneyness y hora — en % de la prima (se paga sobre la PRIMA, no sobre el índice)\n`);
const cubos = {}; // `${hh}|${banda}` -> []
for (const d of MUESTRA) {
  for (const lado of ["C", "P"]) {
    const M = leerCadena(d, lado); if (!M) continue;
    for (const hh of ["09:35", "11:00", "13:00", "15:00"]) {
      const rows = M.get(hh); if (!rows) continue;
      const S = med(rows.map((r) => r.S)); if (!(S > 0)) continue;
      for (const r of rows) {
        if (!(r.bid > 0) || !(r.ask > 0) || r.ask < r.bid) continue;
        const mid = (r.bid + r.ask) / 2; if (mid < 0.05) continue;
        const dpct = 100 * (r.K - S) / S;
        const otm = lado === "C" ? dpct : -dpct;          // + = fuera del dinero
        let banda = null;
        if (Math.abs(dpct) <= 0.1) banda = "ATM";
        else if (otm > 0.15 && otm <= 0.35) banda = "0,25% fuera";
        else if (otm > 0.4 && otm <= 0.6) banda = "0,5% fuera";
        else if (otm > 0.9 && otm <= 1.1) banda = "1% fuera";
        if (!banda) continue;
        (cubos[`${hh}|${banda}`] ??= []).push({ h: 100 * (r.ask - r.bid) / mid, mid, ancho: r.ask - r.bid });
      }
    }
  }
}
console.log(`   ${"banda".padEnd(14)} ${"hora".padEnd(6)} ${"n".padStart(6)} ${"prima p50".padStart(10)} ${"ancho pts".padStart(10)} ${"horquilla % prima".padStart(19)}`);
for (const banda of ["ATM", "0,25% fuera", "0,5% fuera", "1% fuera"]) {
  for (const hh of ["09:35", "11:00", "13:00", "15:00"]) {
    const v = cubos[`${hh}|${banda}`]; if (!v || !v.length) continue;
    console.log(`   ${banda.padEnd(14)} ${hh.padEnd(6)} ${String(v.length).padStart(6)} ${f2(med(v.map((x) => x.mid))).padStart(10)} ${f2(med(v.map((x) => x.ancho))).padStart(10)} ${(f2(med(v.map((x) => x.h))) + "%").padStart(19)}`);
  }
}

// ── 3 · EL NÚMERO QUE DECIDE: PUNTOS PARA EMPATAR ──────────────────────────────────────────
console.log(`\n## 3 · ¿CUÁNTO TIENE QUE MOVERSE EL SPX SÓLO PARA EMPATAR?`);
console.log(`   Se compra al ASK y se vende al BID. Si se cierra en el acto, se pierde el ancho entero.`);
console.log(`   "Puntos para empatar" = el ancho de la horquilla dividido por la delta: lo que tiene`);
console.log(`   que subir el índice para que el BID de vuelta iguale al ASK que se pagó.\n`);
const emp = {};
for (const d of MUESTRA) {
  const M = leerCadena(d, "C"); if (!M) continue;
  const rows = M.get("09:35"); if (!rows) continue;
  const S = med(rows.map((r) => r.S)); if (!(S > 0)) continue;
  for (const [banda, lo, hi, delta] of [["ATM", -0.1, 0.1, 0.50], ["0,25% fuera", 0.15, 0.35, 0.38], ["0,5% fuera", 0.4, 0.6, 0.27], ["1% fuera", 0.9, 1.1, 0.12]]) {
    const cand = rows.filter((r) => { const dp = 100 * (r.K - S) / S; return dp >= lo && dp <= hi && r.bid > 0 && r.ask > r.bid; });
    if (!cand.length) continue;
    const r = cand[0], ancho = r.ask - r.bid;
    (emp[banda] ??= []).push({ ancho, ptsDelta: ancho / delta, S, pctIdx: 100 * (ancho / delta) / S });
  }
}
console.log(`   ${"banda".padEnd(14)} ${"n".padStart(5)} ${"ancho pts".padStart(10)} ${"delta sup.".padStart(11)} ${"PUNTOS SPX para empatar".padStart(24)} ${"% del índice".padStart(13)}`);
for (const [banda, delta] of [["ATM", 0.50], ["0,25% fuera", 0.38], ["0,5% fuera", 0.27], ["1% fuera", 0.12]]) {
  const v = emp[banda]; if (!v) continue;
  console.log(`   ${banda.padEnd(14)} ${String(v.length).padStart(5)} ${f2(med(v.map((x) => x.ancho))).padStart(10)} ${delta.toFixed(2).padStart(11)} ${f2(med(v.map((x) => x.ptsDelta))).padStart(24)} ${(f2(med(v.map((x) => x.pctIdx))) + "%").padStart(13)}`);
}
console.log(`\n   (la delta es la SUPUESTA por moneyness, sólo para traducir el ancho a puntos;`);
console.log(`    la medición de verdad no usa delta ninguna: usa el intrínseco exacto al vencimiento.)`);
console.log("\n" + "═".repeat(95) + "\n");
