// SEGUIR EL PRINT — ¿es siquiera EJECUTABLE con una plaza de $5.639? Y la unica asimetria viva.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/seguir-print-ejecutable.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { media, sd, tUna, pctl, fmt, nEfectiva } from "./print-lib.mjs";
import { pasarBarrera, informe, listonT } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389, PLAZA = Math.round(CUENTA * 0.10);   // $5.639
const todo = JSON.parse(readFileSync("scripts/seguir-print-filas.json", "utf8"));
const A = todo.filter((f) => f.lado === 1), B = todo.filter((f) => f.lado === -1);
const pc = (x) => (Number.isFinite(x) ? (x >= 0 ? "+" : "-") + (Math.abs(x) * 100).toFixed(2) + "%" : " n/a");
function tPorDia(fs, f) {
  const m = new Map();
  for (const x of fs) { const v = f(x); if (!Number.isFinite(v)) continue; if (!m.has(x.fechaY)) m.set(x.fechaY, []); m.get(x.fechaY).push(v); }
  const d = [...m.values()].map(media);
  return { t: tUna(d), nDias: d.length, m: media(d), sd: sd(d) };
}
const conc = (fs) => { const c = new Map(); for (const f of fs) c.set(f.ticker, (c.get(f.ticker) ?? 0) + 1); let y = { t: "-", pct: 0 }; for (const [t, n] of c) if (n / fs.length > y.pct) y = { t, pct: n / fs.length }; return y; };

console.log("\n" + "=".repeat(112));
console.log(`SEGUIR EL PRINT · ¿EJECUTABLE? — la plaza de Lester es $${fmt(PLAZA)} (10% de $${fmt(CUENTA)})`);
console.log("=".repeat(112));

// ── 1. EL TAMANO DEL CONTRATO QUE LA CINTA GOLPEA ───────────────────────────────────────────
const primas = A.map((f) => f.ask * 100).sort((a, b) => a - b);
console.log(`\n## 1. Lo que cuesta UN contrato de los que golpea la cinta (${fmt(A.length)} eventos)`);
console.log(`   p10 $${fmt(pctl(primas, 0.10))} · p25 $${fmt(pctl(primas, 0.25))} · MEDIANA $${fmt(pctl(primas, 0.5))}`
  + ` · p75 $${fmt(pctl(primas, 0.75))} · p90 $${fmt(pctl(primas, 0.90))}`);
const caben = A.filter((f) => f.ask * 100 <= PLAZA);
console.log(`   caben en la plaza de $${fmt(PLAZA)}: ${fmt(caben.length)} de ${fmt(A.length)} (${(caben.length / A.length * 100).toFixed(1)}%)`);

// ── 2. EL SUBCONJUNTO EJECUTABLE, MEDIDO ────────────────────────────────────────────────────
console.log(`\n## 2. El subconjunto EJECUTABLE (prima <= $${fmt(PLAZA)}), con precios reales`);
console.log("   umbral    k     n   nEf  ret/op  aciert   vs azar    t/dia   vs horq5   t/dia   $/ano   mayor");
const ejec = [];
for (const P of [250e3, 1e6, 2.5e6]) {
  for (const k of [1, 3, 5, 10]) {
    const fs = caben.filter((f) => f.prima >= P && Number.isFinite(f[`r${k}`]) && Number.isFinite(f[`h${k}`]) && Number.isFinite(f[`a${k}`]));
    if (fs.length < 50) { console.log(`   >=$${(P / 1e6).toFixed(2)}M ${String(k).padStart(3)} ${String(fs.length).padStart(6)}  insuficiente`); continue; }
    const ret = media(fs.map((f) => f[`r${k}`]));
    const ac = fs.filter((f) => f[`r${k}`] > 0).length / fs.length;
    const dA = tPorDia(fs, (f) => f[`r${k}`] - f[`a${k}`]);
    const dH = tPorDia(fs, (f) => f[`r${k}`] - f[`h${k}`]);
    const prima = media(fs.map((f) => f.ask)) * 100;
    const contratos = Math.max(1, Math.floor(PLAZA / prima));
    const anual = contratos * prima * ret * (365 / k);
    const ne = nEfectiva(fs, k), may = conc(fs);
    ejec.push({ P, k, n: fs.length, nEf: ne.porTicker, ret, ac, difA: dA.m, tA: dA.t, difH: dH.m, tH: dH.t, prima, anual, mayor: may });
    console.log(`   >=$${(P / 1e6).toFixed(2)}M ${String(k).padStart(3)} ${String(fs.length).padStart(6)} ${String(ne.porTicker).padStart(5)} ${pc(ret).padStart(7)} ${(ac * 100).toFixed(1).padStart(5)}%`
      + `  ${pc(dA.m).padStart(7)} ${dA.t.toFixed(2).padStart(7)}  ${pc(dH.m).padStart(7)} ${dH.t.toFixed(2).padStart(6)}`
      + `  ${(anual >= 0 ? "+$" : "-$") + fmt(Math.abs(anual))}  ${may.t} ${(may.pct * 100).toFixed(0)}%`);
  }
}

// ── 3. LA UNICA ASIMETRIA VIVA: el racimo, ASK contra BID ───────────────────────────────────
console.log("\n\n## 3. LA UNICA ASIMETRIA — el racimo (varios prints al MISMO contrato el mismo dia)");
console.log("   En todo lo demas el arm ASK y el arm BID dan lo mismo. Aqui no. Se mira de cerca.");
console.log("   nPrints    k   ASK: n / vs horq5 / t   |   BID: n / vs horq5 / t   |   ASK-BID");
const asim = [];
for (const [lo, hi] of [[1, 1], [2, 3], [4, 9], [10, 1e9]]) {
  for (const k of [1, 3, 5, 10]) {
    const fa = A.filter((f) => f.nPrints >= lo && f.nPrints <= hi && Number.isFinite(f[`r${k}`]) && Number.isFinite(f[`h${k}`]));
    const fb = B.filter((f) => f.nPrints >= lo && f.nPrints <= hi && Number.isFinite(f[`r${k}`]) && Number.isFinite(f[`h${k}`]));
    if (fa.length < 100 || fb.length < 100) continue;
    const da = tPorDia(fa, (f) => f[`r${k}`] - f[`h${k}`]);
    const db = tPorDia(fb, (f) => f[`r${k}`] - f[`h${k}`]);
    // diferencia en diferencias, emparejada POR DIA
    const ma = new Map(), mb = new Map();
    for (const f of fa) { if (!ma.has(f.fechaY)) ma.set(f.fechaY, []); ma.get(f.fechaY).push(f[`r${k}`] - f[`h${k}`]); }
    for (const f of fb) { if (!mb.has(f.fechaY)) mb.set(f.fechaY, []); mb.get(f.fechaY).push(f[`r${k}`] - f[`h${k}`]); }
    const dd = [];
    for (const [d, v] of ma) if (mb.has(d)) dd.push(media(v) - media(mb.get(d)));
    const tdd = tUna(dd);
    asim.push({ lo, hi, k, nA: fa.length, difA: da.m, tA: da.t, nB: fb.length, difB: db.m, tB: db.t, dd: media(dd), tdd, nDias: dd.length });
    console.log(`   ${(lo + (hi === 1e9 ? "+" : hi > lo ? "-" + hi : "")).padEnd(6)} k=${String(k).padStart(2)}   ${String(fa.length).padStart(5)} ${pc(da.m).padStart(7)} t=${da.t.toFixed(2).padStart(5)}`
      + `   |   ${String(fb.length).padStart(5)} ${pc(db.m).padStart(7)} t=${db.t.toFixed(2).padStart(5)}`
      + `   |   ${pc(media(dd)).padStart(7)} t=${tdd.toFixed(2).padStart(5)} (${dd.length} dias)`);
  }
}
const liston = listonT(44);
console.log(`\n   liston para 44 pruebas: |t| >= ${liston}`);
const mejor = asim.filter((x) => x.tdd > 0).sort((a, b) => b.tdd - a.tdd)[0];
if (mejor) {
  const faltan = Math.ceil(mejor.nDias * (liston / mejor.tdd) ** 2) - mejor.nDias;
  console.log(`   la celda mas fuerte: ${mejor.lo}${mejor.hi === 1e9 ? "+" : "-" + mejor.hi} prints, k=${mejor.k}, ASK-BID ${pc(mejor.dd)} t=${mejor.tdd.toFixed(2)} con ${mejor.nDias} dias`);
  console.log(`   para llegar al liston con este tamano de efecto harian falta ${mejor.nDias + faltan} dias -> ${faltan} DIAS MAS (~${Math.ceil(faltan / 21)} meses de cinta)`);
}

writeFileSync("scripts/seguir-print-ejecutable.json", JSON.stringify({
  plaza: PLAZA, primaMediana: pctl(primas, 0.5), cabenPct: caben.length / A.length,
  ejecutable: ejec, asimetria: asim, liston,
}, null, 1));
console.log("\n   -> scripts/seguir-print-ejecutable.json\n");
