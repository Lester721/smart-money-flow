// ═══════════════════════════════════════════════════════════════════════════════════════════
// RADIOGRAFÍA antes de medir nada — ¿qué hay realmente dentro de los muros?
//
// Se mira el fichero ANTES de escribir la medición, no después de que salga raro:
//   · ¿algún campo muerto (todo cero, todo null, todo el mismo valor)?
//   · ¿el muro de calls está de verdad POR ENCIMA de la apertura? ¿cuántas veces no?
//   · ¿a qué distancia? ¿el precio LLEGA a tocarlo? (sin toques no hay nada que medir)
//   · ¿el "muro" es el precio con otro nombre — el strike de al lado?
//   · el peaje real de cada vehículo, para saber contra qué compite un rebote.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/muros-radiografia.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";

const N = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
const CAM = JSON.parse(readFileSync("scripts/muros-camino.json", "utf8"));

const pct = (v, q) => { const s = [...v].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] : NaN; };
const med = (v) => pct(v, 0.5);
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "—");

console.log(`\n${"═".repeat(92)}`);
console.log(`RADIOGRAFÍA DE LOS MUROS · ${N.filas.length} días · ${N.filas[0].fecha} → ${N.filas.at(-1).fecha}`);
console.log(`generado ${N.generado} · hora de decisión ${N.hora} · ${N.aviso ?? ""}`);
console.log(`${"═".repeat(92)}\n`);

// ── 1. CAMPOS MUERTOS ──────────────────────────────────────────────────────────────────────
console.log(`## 1 · CAMPOS MUERTOS  (un campo que no existe se lee como 0 y 0 no da error)\n`);
const campos = {};
const anota = (k, v) => { (campos[k] ??= { n: 0, nulos: 0, ceros: 0, vals: new Set(), min: Infinity, max: -Infinity })
  .n++; const c = campos[k];
  if (v == null || !Number.isFinite(v)) { c.nulos++; return; }
  if (v === 0) c.ceros++;
  if (c.vals.size < 6) c.vals.add(v);
  if (v < c.min) c.min = v; if (v > c.max) c.max = v; };

for (const f of N.filas) {
  anota("apertura", f.apertura); anota("cierre", f.cierre);
  anota("maxMuestreado", f.maxMuestreado); anota("minMuestreado", f.minMuestreado);
  anota("maxPain", f.maxPain); anota("barras5min", f.barras5min);
  anota("strikesSinIV", f.strikesSinIV); anota("strikesEnBanda", f.strikesEnBanda);
  for (const L of ["gam", "gamD", "oi"]) {
    const n = f.niveles[L];
    anota(`${L}.muroCall`, n.muroCall); anota(`${L}.muroPut`, n.muroPut);
    anota(`${L}.imanBruto`, n.imanBruto); anota(`${L}.flip`, n.flip ?? null);
    anota(`${L}.d.muroCall.pts`, n.dMuroCall?.pts ?? null);
    anota(`${L}.d.muroPut.pts`, n.dMuroPut?.pts ?? null);
  }
  anota("spy.apertura", f.spy?.apertura ?? null);
  anota("spy.razonSPX", f.spy?.razonSPX ?? null);
  anota("peaje.callATM.horquillaPct", f.peaje?.callATM?.horquillaPct ?? null);
  anota("peaje.call05.horquillaPct", f.peaje?.call05?.horquillaPct ?? null);
}
console.log(`   ${"campo".padEnd(26)} ${"n".padStart(5)} ${"nulos".padStart(6)} ${"ceros".padStart(6)}  ${"mín".padStart(10)} ${"máx".padStart(10)}  ¿vivo?`);
for (const [k, c] of Object.entries(campos)) {
  const vivo = c.vals.size > 1 ? "sí" : `MUERTO (${[...c.vals].join(",")})`;
  console.log(`   ${k.padEnd(26)} ${String(c.n).padStart(5)} ${String(c.nulos).padStart(6)} ${String(c.ceros).padStart(6)}  ${f2(c.min).padStart(10)} ${f2(c.max).padStart(10)}  ${vivo}`);
}

// ── 2. ¿EL MURO ESTÁ DEL LADO QUE DEBE? ────────────────────────────────────────────────────
console.log(`\n## 2 · ¿EL MURO CAE DEL LADO QUE LE TOCA?  (call ARRIBA de la apertura, put ABAJO)\n`);
console.log(`   ${"lente".padEnd(6)} ${"muro".padEnd(5)} ${"lado ok".padStart(12)}  ${"|dist| p25".padStart(11)} ${"p50".padStart(7)} ${"p75".padStart(7)} ${"p90".padStart(7)}   (puntos SPX)`);
const R = {};
for (const L of ["gam", "gamD", "oi"]) {
  for (const [lado, campo] of [["call", "dMuroCall"], ["put", "dMuroPut"]]) {
    const signo = lado === "call" ? 1 : -1;
    const ds = [], ok = [];
    for (const f of N.filas) {
      const d = f.niveles[L][campo]?.pts;
      if (d == null) continue;
      if (Math.sign(d) === signo && d !== 0) { ok.push(f.fecha); ds.push(Math.abs(d)); }
    }
    R[`${L}.${lado}`] = { ok: ok.length, ds };
    console.log(`   ${L.padEnd(6)} ${lado.padEnd(5)} ${`${ok.length} (${(100 * ok.length / N.filas.length).toFixed(1)}%)`.padStart(12)}  ${f1(pct(ds, .25)).padStart(11)} ${f1(med(ds)).padStart(7)} ${f1(pct(ds, .75)).padStart(7)} ${f1(pct(ds, .90)).padStart(7)}`);
  }
}

// ── 3. ¿EL PRECIO LLEGA A TOCARLO? ─────────────────────────────────────────────────────────
console.log(`\n## 3 · ¿EL PRECIO LO TOCA?  sobre los días en que el muro está del lado correcto\n`);
console.log(`   ${"lente".padEnd(6)} ${"muro".padEnd(5)} ${"n lado ok".padStart(10)} ${"toca".padStart(14)}  ${"minuto del 1er toque (p25/p50/p75)".padStart(34)}`);
const TOQUES = {};
for (const L of ["gam", "gamD", "oi"]) {
  for (const lado of ["call", "put"]) {
    const campo = lado === "call" ? "muroCall" : "muroPut";
    const dcampo = lado === "call" ? "dMuroCall" : "dMuroPut";
    const signo = lado === "call" ? 1 : -1;
    let nLado = 0, nToca = 0; const horas = [];
    for (const f of N.filas) {
      const d = f.niveles[L][dcampo]?.pts, K = f.niveles[L][campo];
      if (d == null || K == null || Math.sign(d) !== signo || d === 0) continue;
      nLado++;
      const c = CAM[f.fecha]; if (!c) continue;
      for (let i = 0; i < c.s.length; i++) {
        if (signo > 0 ? c.s[i] >= K : c.s[i] <= K) { nToca++; horas.push(i * 5); break; }
      }
    }
    TOQUES[`${L}.${lado}`] = { nLado, nToca };
    console.log(`   ${L.padEnd(6)} ${lado.padEnd(5)} ${String(nLado).padStart(10)} ${`${nToca} (${(100 * nToca / nLado).toFixed(1)}%)`.padStart(14)}  ${`${pct(horas, .25)} / ${med(horas)} / ${pct(horas, .75)} min tras 09:35`.padStart(34)}`);
  }
}

// ── 4. ¿EL MURO ES EL PRECIO CON OTRO NOMBRE? ──────────────────────────────────────────────
console.log(`\n## 4 · ¿EL MURO ES EL STRIKE DE AL LADO?  (si sí, no es un nivel: es el precio)\n`);
for (const L of ["gam", "gamD", "oi"]) {
  const fila = [];
  for (const [lado, campo] of [["call", "muroCall"], ["put", "muroPut"]]) {
    let pegado = 0, n = 0;
    for (const f of N.filas) {
      const K = f.niveles[L][campo]; if (K == null) continue;
      n++;
      const vecino = lado === "call" ? Math.ceil(f.apertura / 5) * 5 : Math.floor(f.apertura / 5) * 5;
      if (K === vecino) pegado++;
    }
    fila.push(`${lado} ${(100 * pegado / n).toFixed(1)}%`);
  }
  console.log(`   ${L.padEnd(6)} coincide con el strike contiguo a la apertura → ${fila.join("  ·  ")}`);
}

// ── 5. EL DÍA TÍPICO Y EL PEAJE ────────────────────────────────────────────────────────────
console.log(`\n## 5 · EL DÍA TÍPICO Y EL PEAJE  (contra qué compite cualquier rebote)\n`);
const rango = N.filas.map((f) => f.maxMuestreado - f.minMuestreado);
const rangoPct = N.filas.map((f) => 100 * (f.maxMuestreado - f.minMuestreado) / f.apertura);
console.log(`   rango del día 09:35→16:00 ... p25 ${f1(pct(rango, .25))} · p50 ${f1(med(rango))} · p75 ${f1(pct(rango, .75))} pts SPX`);
console.log(`                                p25 ${f2(pct(rangoPct, .25))}% · p50 ${f2(med(rangoPct))}% · p75 ${f2(pct(rangoPct, .75))}%`);
const razon = N.filas.map((f) => f.spy?.razonSPX).filter(Number.isFinite);
console.log(`   razón SPX/SPY ............... p05 ${f2(pct(razon, .05))} · p50 ${f2(med(razon))} · p95 ${f2(pct(razon, .95))}   (NO es 10 fijo)`);
for (const [k, n] of [["callATM", "call ATM"], ["putATM", "put ATM"], ["call05", "call +0,5%"], ["put05", "put −0,5%"]]) {
  const hs = N.filas.map((f) => f.peaje?.[k]?.horquillaPct).filter(Number.isFinite);
  const pr = N.filas.map((f) => f.peaje?.[k]?.ask).filter(Number.isFinite);
  console.log(`   horquilla ${n.padEnd(11)} p25 ${f1(pct(hs, .25))}% · p50 ${f1(med(hs))}% · p75 ${f1(pct(hs, .75))}%   prima p50 $${f1(med(pr))}  →  peaje p50 $${f2(med(hs) / 100 * med(pr))} por contrato-lado`);
}
console.log(`   SPY: horquilla de 1 céntimo = ${f2(1 / 100 * med(razon))} pts SPX de peaje por lado (ida+vuelta ${f2(2 / 100 * med(razon))} pts). Sin apalancamiento.`);

// ── 6. REPARTO POR PERÍODO (la partición) ──────────────────────────────────────────────────
console.log(`\n## 6 · LA PARTICIÓN\n`);
for (const [nom, ini, fin] of [["A · 2022-2023", "2022-01-01", "2023-12-31"], ["B · 2024-2026", "2024-01-01", "2026-12-31"]]) {
  const d = N.filas.filter((f) => f.fecha >= ini && f.fecha <= fin);
  const r = d.map((f) => 100 * (f.maxMuestreado - f.minMuestreado) / f.apertura);
  console.log(`   ${nom.padEnd(14)} ${String(d.length).padStart(4)} días · ${d[0].fecha} → ${d.at(-1).fecha} · rango p50 ${f2(med(r))}% · SPX ${f1(d[0].apertura)}→${f1(d.at(-1).cierre)}`);
}
console.log();
