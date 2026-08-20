// SEGUIR EL PRINT — la unica celda que asomo: 2-3 prints AL ASK sobre el MISMO contrato, k=5.
// Antes de llamarlo lead hay que pasarle todo: solapamiento, tercios, concentracion,
// dejar-fuera-un-ticker, permutacion, y el barrido alrededor para ver si es un pico o una meseta.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/seguir-print-racimo.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { media, sd, tUna, fmt, rng, nEfectiva } from "./print-lib.mjs";
import { listonT } from "../lib/barreraHallazgos.ts";

const todo = JSON.parse(readFileSync("scripts/seguir-print-filas.json", "utf8"));
const pc = (x) => (Number.isFinite(x) ? (x >= 0 ? "+" : "-") + (Math.abs(x) * 100).toFixed(2) + "%" : " n/a");
const LISTON = listonT(44);

/** Excesos por (ticker,dia) de un arm: media del exceso contra los vecinos de igual horquilla. */
function porTkDia(fs, k) {
  const m = new Map();
  for (const f of fs) {
    const v = f[`r${k}`] - f[`h${k}`];
    if (!Number.isFinite(v)) continue;
    const key = `${f.ticker}|${f.fechaY}`;
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(v);
  }
  const out = new Map();
  for (const [key, v] of m) out.set(key, media(v));
  return out;
}

function celda(lo, hi, k) {
  const fa = todo.filter((f) => f.lado === 1 && f.nPrints >= lo && f.nPrints <= hi);
  const fb = todo.filter((f) => f.lado === -1 && f.nPrints >= lo && f.nPrints <= hi);
  const A = porTkDia(fa, k), B = porTkDia(fb, k);
  const filas = [];
  for (const [key, va] of A) {
    if (!B.has(key)) continue;
    const [ticker, fechaY] = key.split("|");
    filas.push({ ticker, fechaY, fecha: fechaY.replace(/(\d{4})(\d\d)(\d\d)/, "$1-$2-$3"), dd: va - B.get(key) });
  }
  return { filas, nA: fa.length, nB: fb.length };
}

console.log("\n" + "=".repeat(112));
console.log("SEGUIR EL PRINT · EL RACIMO — 2-3 prints al ASK sobre el MISMO contrato, contra los mismos al BID");
console.log("=".repeat(112));

// ── 0. SOLAPAMIENTO: cuanto de la diferencia puede existir siquiera ─────────────────────────
const kk = 5;
const fa = todo.filter((f) => f.lado === 1 && f.nPrints >= 2 && f.nPrints <= 3 && Number.isFinite(f.r5));
const fb = todo.filter((f) => f.lado === -1 && f.nPrints >= 2 && f.nPrints <= 3 && Number.isFinite(f.r5));
const kA = new Set(fa.map((f) => `${f.ticker}|${f.fechaY}|${f.exp}|${f.tipo}|${f.K}`));
const kB = new Set(fb.map((f) => `${f.ticker}|${f.fechaY}|${f.exp}|${f.tipo}|${f.K}`));
let comunes = 0; for (const x of kA) if (kB.has(x)) comunes++;
console.log(`\n## 0. Solapamiento de los dos arms (el retorno del contrato es EL MISMO si esta en los dos)`);
console.log(`   contratos-dia con racimo AL ASK ${fmt(kA.size)} · AL BID ${fmt(kB.size)} · EN LOS DOS ${fmt(comunes)}`
  + ` (${(comunes / kA.size * 100).toFixed(1)}% del arm ask)`);
console.log(`   -> la diferencia solo puede venir del ${(100 - comunes / kA.size * 100).toFixed(1)}% que es exclusivo de un lado. Es un contraste real, no un artefacto.`);

// ── 1. LA CELDA ─────────────────────────────────────────────────────────────────────────────
const C = celda(2, 3, 5);
const v = C.filas.map((f) => f.dd);
console.log(`\n## 1. La celda: 2-3 prints, salida a 5 dias`);
console.log(`   ${fmt(C.filas.length)} pares (ticker,dia) · media ${pc(media(v))} · t crudo ${tUna(v).toFixed(2)} · liston ${LISTON}`);
// t por dia
const porDia = new Map();
for (const f of C.filas) { if (!porDia.has(f.fechaY)) porDia.set(f.fechaY, []); porDia.get(f.fechaY).push(f.dd); }
const dias = [...porDia.entries()].sort().map(([d, x]) => ({ d, m: media(x) }));
console.log(`   por DIA: ${dias.length} dias · media ${pc(media(dias.map((x) => x.m)))} · t ${tUna(dias.map((x) => x.m)).toFixed(2)}`);
console.log(`   dias positivos: ${dias.filter((x) => x.m > 0).length} de ${dias.length}`);

// ── 2. TERCIOS ──────────────────────────────────────────────────────────────────────────────
console.log(`\n## 2. TERCIOS DE TIEMPO (por dia, que es lo que no se solapa)`);
const kd = Math.floor(dias.length / 3);
const tercios = [0, 1, 2].map((i) => (i < 2 ? dias.slice(i * kd, (i + 1) * kd) : dias.slice(2 * kd)));
const sig = [];
for (const g of tercios) {
  const m = media(g.map((x) => x.m));
  sig.push(Math.sign(m));
  console.log(`   ${g[0].d} -> ${g[g.length - 1].d}  n=${String(g.length).padStart(3)} dias  media ${pc(m).padStart(8)}  t ${tUna(g.map((x) => x.m)).toFixed(2).padStart(6)}`);
}
const mismoSigno = sig[0] === sig[1] && sig[1] === sig[2];
console.log(`   mismo signo en los tres tercios: ${mismoSigno ? "SI" : "NO"}`);

// ── 3. CONCENTRACION Y DEJAR FUERA UN TICKER ────────────────────────────────────────────────
console.log(`\n## 3. CONCENTRACION`);
const cnt = new Map();
for (const f of C.filas) cnt.set(f.ticker, (cnt.get(f.ticker) ?? 0) + 1);
const orden = [...cnt].sort((a, b) => b[1] - a[1]);
console.log(`   ${orden.slice(0, 6).map(([t, n]) => `${t} ${(n / C.filas.length * 100).toFixed(1)}%`).join(" · ")}`);
console.log(`   mayor: ${orden[0][0]} con ${(orden[0][1] / C.filas.length * 100).toFixed(1)}% (maximo 20%)`);
console.log(`\n   dejando fuera un ticker cada vez (t por dia):`);
let siguenCruzando = 0, probados = 0;
const fuera = [];
for (const [t, n] of orden) {
  if (n < 30) continue;
  probados++;
  const sub = C.filas.filter((f) => f.ticker !== t);
  const pd = new Map();
  for (const f of sub) { if (!pd.has(f.fechaY)) pd.set(f.fechaY, []); pd.get(f.fechaY).push(f.dd); }
  const dd = [...pd.values()].map(media);
  const tt = tUna(dd);
  if (tt >= LISTON) siguenCruzando++;
  fuera.push({ ticker: t, t: tt, m: media(dd) });
  console.log(`     sin ${t.padEnd(6)} n=${String(sub.length).padStart(5)}  media ${pc(media(dd)).padStart(8)}  t ${tt.toFixed(2).padStart(6)} ${tt >= LISTON ? "(sigue cruzando)" : ""}`);
}
console.log(`   sigue cruzando el liston sin ${siguenCruzando} de ${probados} tickers`);

// ── 4. PERMUTACION: barajar la etiqueta ASK/BID dentro de cada dia ──────────────────────────
console.log(`\n## 4. PERMUTACION — barajar el SIGNO de la diferencia por dia, 2.000 veces`);
const r = rng(987654321);
const obs = media(dias.map((x) => x.m));
let mayores = 0;
const N = 2000;
for (let i = 0; i < N; i++) {
  let s = 0;
  for (const d of dias) s += (r() < 0.5 ? -1 : 1) * d.m;
  if (Math.abs(s / dias.length) >= Math.abs(obs)) mayores++;
}
console.log(`   observado ${pc(obs)} · p = ${(mayores / N).toFixed(4)} (${mayores} de ${N} barajados igualan o superan)`);

// ── 5. EL BARRIDO ALREDEDOR: ¿pico o meseta? ────────────────────────────────────────────────
console.log(`\n## 5. ¿PICO O MESETA? — la misma celda movida en las dos dimensiones`);
console.log("   nPrints    k=1      k=3      k=5      k=10");
const malla = [];
for (const [lo, hi] of [[1, 1], [2, 2], [3, 3], [2, 3], [4, 5], [6, 9], [10, 1e9]]) {
  const l = [];
  for (const k of [1, 3, 5, 10]) {
    const c = celda(lo, hi, k);
    if (c.filas.length < 60) { l.push("   n/a  "); continue; }
    const pd = new Map();
    for (const f of c.filas) { if (!pd.has(f.fechaY)) pd.set(f.fechaY, []); pd.get(f.fechaY).push(f.dd); }
    const dd = [...pd.values()].map(media);
    malla.push({ lo, hi, k, n: c.filas.length, m: media(dd), t: tUna(dd) });
    l.push(`${pc(media(dd)).padStart(7)}/${tUna(dd).toFixed(1).padStart(4)}`);
  }
  console.log(`   ${(lo + (hi === 1e9 ? "+" : hi > lo ? "-" + hi : "")).padEnd(8)} ${l.join(" ")}`);
}
console.log("   (media / t por dia · liston " + LISTON + ")");

writeFileSync("scripts/seguir-print-racimo.json", JSON.stringify({
  liston: LISTON, solape: { nA: kA.size, nB: kB.size, comunes },
  celda: { n: C.filas.length, nDias: dias.length, media: obs, t: tUna(dias.map((x) => x.m)), diasPositivos: dias.filter((x) => x.m > 0).length },
  tercios: tercios.map((g) => ({ de: g[0].d, a: g[g.length - 1].d, m: media(g.map((x) => x.m)), t: tUna(g.map((x) => x.m)) })),
  mismoSigno, concentracion: orden.slice(0, 8), fuera, siguenCruzando, probados, p: mayores / N, malla,
}, null, 1));
console.log("\n   -> scripts/seguir-print-racimo.json\n");
