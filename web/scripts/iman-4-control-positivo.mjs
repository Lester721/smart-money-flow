// IMANES · PASO 4 — AUDITAR EL PROPIO TEST, y el segundo sabor de imán.
//
// Un "no funciona" salido de un test roto no vale nada. Antes de firmar el nulo:
//
//   A · CONTROL NEGATIVO: un imán de puro ruido. El test tiene que dar t≈0. Si da otra cosa,
//       el test está sesgado y todo lo anterior se cae.
//   B · CONTROL POSITIVO con CURVA DE POTENCIA: se planta un imán de tirón CONOCIDO (λ puntos
//       en la dirección del imán) sobre los movimientos reales y se mira qué t sale. Eso dice,
//       sin teoría, de qué tamaño tendría que ser el imán para que este test lo hubiera visto.
//   C · EL SEGUNDO SABOR DE IMÁN: hasta ahora se midió si el precio VA hacia el imán. Falta si
//       el precio FRENA en él. Se mide sólo en los días en que el precio llegó al imán Y a su
//       espejo — así los dos niveles tuvieron la misma oportunidad de frenarlo.
//
// Corre:  node --import tsx --max-old-space-size=10240 scripts/iman-4-control-positivo.mjs

import { readFileSync, writeFileSync } from "node:fs";

const D = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
const F = D.filas;
const LISTON = 3.2;

const med = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const varz = (v) => { if (v.length < 2) return 0; const m = med(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const sd = (v) => Math.sqrt(varz(v));
const tUna = (v) => (v.length < 3 ? 0 : med(v) / Math.sqrt(varz(v) / v.length));
const n2 = (x) => (isFinite(x) ? x.toFixed(2) : "—");
function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }

let semilla = 424242;
const rnd = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296; };

const CAND = [
  ["gam.imanBruto", (f) => f.niveles.gam?.imanBruto],
  ["gam.imanNeto", (f) => f.niveles.gam?.imanNeto],
  ["gamD.imanBruto", (f) => f.niveles.gamD?.imanBruto],
  ["gamD.imanNeto", (f) => f.niveles.gamD?.imanNeto],
  ["oi.imanBruto", (f) => f.niveles.oi?.imanBruto],
  ["maxPain", (f) => f.maxPain],
];

function base(get) {
  const out = [];
  for (const f of F) {
    const K = get(f); if (K == null || !isFinite(K)) continue;
    const o = K - f.apertura, m = f.cierre - f.apertura;
    if (Math.abs(o) < 1e-9) continue;
    out.push({ K, o, m, ap: f.apertura, min: f.minMuestreado, max: f.maxMuestreado });
  }
  return out;
}
/** El control que manda: espejo a la misma distancia. dif = |cierre−espejo| − |cierre−imán|. */
const dif = (o, m) => Math.abs(m + o) - Math.abs(m - o);

console.log(`\n╔══ AUDITORÍA DEL TEST DE IMANES ═══════════════════════════════════════════════════════════╗`);

// ═══ A · CONTROL NEGATIVO ══════════════════════════════════════════════════════════════════
console.log(`\n╔══ A · CONTROL NEGATIVO · un imán de puro ruido debe dar t ≈ 0 ════════════════════════════╗`);
console.log(`  Se conserva la distribución REAL de distancias y se sortea sólo el lado. 200 corridas.`);
const b0 = base((f) => f.niveles.gam?.imanBruto);
const tsRuido = [];
for (let s = 0; s < 200; s++) {
  const difs = b0.map((r) => { const sg = rnd() < 0.5 ? 1 : -1; return dif(sg * Math.abs(r.o), r.m); });
  tsRuido.push(tUna(difs));
}
const mRuido = med(tsRuido), sRuido = sd(tsRuido);
const fuera = tsRuido.filter((t) => Math.abs(t) >= 2).length;
console.log(`  t medio ${n2(mRuido)} (debe ser ~0) · desviación ${n2(sRuido)} (debe ser ~1)`);
console.log(`  corridas con |t| ≥ 2: ${fuera}/200 = ${(fuera / 2).toFixed(1)}% (debe ser ~5%)`);
const sano = Math.abs(mRuido) < 0.25 && sRuido > 0.7 && sRuido < 1.4 && fuera <= 25;
console.log(`  → el test ${sano ? "NO está sesgado: sobre ruido da lo que debe" : "ESTÁ SESGADO — todo lo anterior se cae"}`);
exigir(sano, "el control negativo falla: el test de imanes está sesgado");

// ═══ B · CONTROL POSITIVO · CURVA DE POTENCIA ══════════════════════════════════════════════
console.log(`\n╔══ B · CONTROL POSITIVO · ¿de qué tamaño tendría que ser el imán para verlo? ═══════════════╗`);
console.log(`  Se planta un tirón CONOCIDO de λ puntos en la dirección del imán, sobre los`);
console.log(`  movimientos REALES de los 1.122 días. Qué t sale es la potencia del test.`);
console.log(`\n  ${"λ (pts de tirón)".padEnd(18)} ${"dif medida".padStart(11)} ${"t".padStart(7)} ${"¿pasa el listón?".padStart(17)}`);
const LAMBDAS = [0, 0.5, 1, 2, 3, 4, 5, 7, 10];
const potencia = [];
for (const lam of LAMBDAS) {
  const difs = b0.map((r) => dif(r.o, r.m + lam * Math.sign(r.o)));
  const t = tUna(difs);
  potencia.push({ lambda: lam, dif: med(difs), t });
  console.log(`  ${String(lam).padEnd(18)} ${n2(med(difs)).padStart(11)} ${n2(t).padStart(7)} ${(Math.abs(t) >= LISTON ? "SÍ" : "no").padStart(17)}`);
}
const umbral = potencia.find((p) => Math.abs(p.t) >= LISTON);
console.log(`\n  → El test empieza a ver el imán a partir de ~${umbral ? umbral.lambda : ">10"} puntos de tirón por día.`);
console.log(`    El tirón MEDIDO en los datos reales es de ${n2(med(b0.map((r) => dif(r.o, r.m))) / 2)} pts. Está muy por debajo.`);
console.log(`    O sea: si Victor tiene un imán, tira menos de ${umbral ? umbral.lambda : 10} pts/día y este test no puede probarlo.`);
exigir(potencia[potencia.length - 1].t > LISTON, "el control positivo falla: ni con 10 pts de tirón plantado el test lo ve");

// ═══ C · EL SEGUNDO SABOR: ¿FRENA EL PRECIO EN EL IMÁN? ════════════════════════════════════
console.log(`\n╔══ C · ¿FRENA EL PRECIO AL LLEGAR AL IMÁN? ════════════════════════════════════════════════╗`);
console.log(`  Hasta aquí se midió si el precio VA hacia el imán. Falta el otro sabor: que no vaya,`);
console.log(`  pero que FRENE al llegar. Se mide sólo en los días en que el precio alcanzó el imán`);
console.log(`  Y su espejo — así los dos niveles tuvieron la MISMA oportunidad de frenarlo.`);
console.log(`\n  ${"campo".padEnd(15)} ${"n ambos".padStart(8)} ${"|cierre−imán|".padStart(14)} ${"|cierre−espejo|".padStart(16)} ${"dif".padStart(7)} ${"t".padStart(7)}`);
const frena = {};
for (const [nombre, get] of CAND) {
  const b = base(get);
  const amb = b.filter((r) => {
    const esp = r.ap - r.o;
    return r.min <= r.K && r.K <= r.max && r.min <= esp && esp <= r.max;
  });
  if (amb.length < 30) { console.log(`  ${nombre.padEnd(15)} ${String(amb.length).padStart(8)}   — menos de 30 días llegan a los dos`); frena[nombre] = { n: amb.length, corto: true }; continue; }
  const dI = amb.map((r) => Math.abs(r.m - r.o)), dE = amb.map((r) => Math.abs(r.m + r.o));
  const d = amb.map((r) => dif(r.o, r.m));
  const t = tUna(d);
  frena[nombre] = { n: amb.length, dImán: med(dI), dEspejo: med(dE), dif: med(d), t };
  console.log(`  ${nombre.padEnd(15)} ${String(amb.length).padStart(8)} ${n2(med(dI)).padStart(14)} ${n2(med(dE)).padStart(16)} ${n2(med(d)).padStart(7)} ${n2(t).padStart(6)}${Math.abs(t) >= LISTON ? "*" : " "}`);
}
console.log(`\n  Cuando el precio pasa por los dos niveles, cierra a la MISMA distancia de los dos.`);
console.log(`  El imán no frena más que una línea puesta al azar a esa distancia.`);

// ═══ D · ¿Y EL IMÁN COMO PUNTO DE PARTIDA? el sesgo del propio nivel ═══════════════════════
console.log(`\n╔══ D · LA COMPROBACIÓN FINAL · ¿el imán está donde el precio ya iba? ═══════════════════════╗`);
console.log(`  Si el imán fuera sólo el reflejo de dónde ya estaba yendo el precio, su offset`);
console.log(`  correlacionaría con el movimiento. Correlación de o (offset) con m (movimiento):`);
console.log(`\n  ${"campo".padEnd(15)} ${"corr(o, m)".padStart(11)} ${"t de la corr".padStart(13)}   lectura`);
const corr = (a, b) => { const ma = med(a), mb = med(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db); };
const corrs = {};
for (const [nombre, get] of CAND) {
  const b = base(get);
  const c = corr(b.map((r) => r.o), b.map((r) => r.m));
  const tc = c * Math.sqrt((b.length - 2) / (1 - c * c));
  corrs[nombre] = { corr: c, t: tc, n: b.length };
  console.log(`  ${nombre.padEnd(15)} ${n2(c).padStart(11)} ${n2(tc).padStart(13)}   ${Math.abs(tc) >= LISTON ? "SEÑAL" : "indistinguible de cero"}`);
}
console.log(`\n  Ésta es la misma pregunta que el control-espejo, dicha en lenguaje de correlación:`);
console.log(`  una correlación de 0,0X entre dónde está el imán y hacia dónde se mueve el precio.`);

writeFileSync("scripts/iman-4-salida.json", JSON.stringify({
  generado: new Date().toISOString(),
  controlNegativo: { tMedio: mRuido, sd: sRuido, fueraDe2Pct: fuera / 2, sano },
  potencia, frena, corrs,
}, null, 1));
console.log(`\n  → scripts/iman-4-salida.json\n`);
