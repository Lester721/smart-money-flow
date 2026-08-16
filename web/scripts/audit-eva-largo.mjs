// AUDITORIA ADVERSARIA (solo lectura) de scripts/eva-largo-filas.json
// No modifica nada. Uso: node --max-old-space-size=6144 scripts/audit-eva-largo.mjs
import { readFileSync } from "node:fs";

const F = process.env.EVA_LARGO_FILAS || "scripts/eva-largo-filas.json";
const filas = JSON.parse(readFileSync(F, "utf8"));
const H = [30, 90, 180, 365];
const media = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
const sd = (x) => { const m = media(x); return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / (x.length - 1)); };
const t1 = (x) => media(x) / (sd(x) / Math.sqrt(x.length));
const pct = (v) => (v * 100).toFixed(2) + "%";

console.log(`filas: ${filas.length}\n`);

// ── 1. Reproducir la cabecera ────────────────────────────────────────────────
console.log("=== 1. REPRODUCCION DE LA TABLA PUBLICADA ===");
console.log("horiz      n     flujo      cubo      DIF        t");
for (const h of H) {
  const m = filas.filter((f) => f.h[h]).map((f) => f.h[h]);
  if (!m.length) continue;
  const d = m.map((x) => x.d);
  console.log(`${String(h).padStart(4)}d ${String(m.length).padStart(7)}  ${pct(media(m.map((x) => x.t))).padStart(8)}  ${pct(media(m.map((x) => x.c))).padStart(8)}  ${pct(media(d)).padStart(8)}  ${t1(d).toFixed(2).padStart(7)}`);
}

// ── 2. ASIMETRIA DE AUSENCIAS: tratamiento a cero vs control a cero ──────────
console.log("\n=== 2. ASIMETRIA DE AUSENCIAS (contrato no encontrado en la cadena de salida) ===");
console.log("horiz   ausT%    ausC%   dif(pp)   | DIF con TODOS   DIF sin ausT   DIF sin ausT ni ausC");
for (const h of H) {
  const con = filas.filter((f) => f.h[h]);
  if (!con.length) continue;
  const ausT = con.filter((f) => f.h[h].ausenteT).length / con.length;
  const ausC = media(con.map((f) => f.h[h].ausentesC / f.h[h].n));
  const todos = media(con.map((f) => f.h[h].d));
  const sinT = con.filter((f) => !f.h[h].ausenteT).map((f) => f.h[h].d);
  const limpio = con.filter((f) => !f.h[h].ausenteT && f.h[h].ausentesC === 0).map((f) => f.h[h].d);
  console.log(`${String(h).padStart(4)}d ${(ausT * 100).toFixed(2).padStart(7)} ${(ausC * 100).toFixed(2).padStart(8)} ${((ausT - ausC) * 100).toFixed(2).padStart(9)}   | ${pct(todos).padStart(9)}  ${pct(media(sinT)).padStart(9)} (n=${sinT.length}, t=${t1(sinT).toFixed(2)})  ${pct(media(limpio)).padStart(9)} (n=${limpio.length}, t=${limpio.length > 2 ? t1(limpio).toFixed(2) : "-"})`);
}

// ── 3. Cuanto del efecto lo aporta el bloque de ausentes ─────────────────────
console.log("\n=== 3. DESCOMPOSICION POR ESTADO DE AUSENCIA (180d y 30d) ===");
for (const h of [30, 180]) {
  const con = filas.filter((f) => f.h[h]);
  const grupos = {
    "T presente, C completo": con.filter((f) => !f.h[h].ausenteT && f.h[h].ausentesC === 0),
    "T presente, C con huecos": con.filter((f) => !f.h[h].ausenteT && f.h[h].ausentesC > 0),
    "T AUSENTE (-100%)": con.filter((f) => f.h[h].ausenteT),
  };
  console.log(`-- ${h} d --`);
  for (const [k, g] of Object.entries(grupos)) {
    if (!g.length) { console.log(`  ${k.padEnd(26)} n=0`); continue; }
    const d = g.map((f) => f.h[h].d);
    console.log(`  ${k.padEnd(26)} n=${String(g.length).padStart(6)} (${((g.length / con.length) * 100).toFixed(1)}%)  DIF=${pct(media(d)).padStart(9)}  aporta ${pct((media(d) * g.length) / con.length).padStart(9)}`);
  }
}

// ── 4. INDEPENDENCIA: duplicados de contrato y agrupamiento por dia ──────────
console.log("\n=== 4. INDEPENDENCIA DE LAS OBSERVACIONES ===");
for (const h of H) {
  const con = filas.filter((f) => f.h[h]);
  if (!con.length) continue;
  const kC = (f) => `${f.ticker}|${f.dia}|${f.exp}|${f.strike}|${f.right}`;
  const kD = (f) => `${f.ticker}|${f.dia}`;
  const kS = (f) => f.ticker;
  const uc = new Set(con.map(kC)).size, ud = new Set(con.map(kD)).size, us = new Set(con.map(kS)).size;
  // ¿los duplicados del mismo contrato tienen EXACTAMENTE el mismo resultado?
  const porC = new Map();
  for (const f of con) { const k = kC(f); (porC.get(k) ?? porC.set(k, []).get(k)).push(f.h[h].d); }
  let dupsIdenticos = 0, dupsTotal = 0;
  for (const v of porC.values()) if (v.length > 1) { dupsTotal++; if (v.every((x) => Math.abs(x - v[0]) < 1e-12)) dupsIdenticos++; }
  // t agrupado (cluster-robust) por contrato-dia y por dia
  const clusterT = (keyFn) => {
    const g = new Map();
    for (const f of con) { const k = keyFn(f); g.set(k, (g.get(k) ?? []).concat(f.h[h].d)); }
    const n = con.length, m = media(con.map((f) => f.h[h].d));
    let s = 0;
    for (const v of g.values()) { const u = v.reduce((a, x) => a + (x - m), 0); s += u * u; }
    return m / (Math.sqrt(s) / n);
  };
  const d = con.map((f) => f.h[h].d);
  console.log(`${String(h).padStart(4)}d  n=${String(con.length).padStart(6)}  contratos unicos=${String(uc).padStart(6)}  ticker-dia=${String(ud).padStart(5)}  tickers=${us}`);
  console.log(`        grupos de contrato repetido: ${dupsTotal}, de los cuales con resultado IDENTICO: ${dupsIdenticos}`);
  console.log(`        t ingenuo=${t1(d).toFixed(2)}   t agrupado por contrato=${clusterT(kC).toFixed(2)}   por ticker-dia=${clusterT(kD).toFixed(2)}   por ticker=${clusterT(kS).toFixed(2)}`);
  // media de medias por contrato unico (una observacion por contrato)
  const porContrato = [...porC.values()].map(media);
  console.log(`        una fila por contrato unico: n=${porContrato.length} DIF=${pct(media(porContrato))} t=${t1(porContrato).toFixed(2)}`);
}

// ── 5. Concentracion por ticker y por dia ────────────────────────────────────
console.log("\n=== 5. CONCENTRACION (30 d) ===");
{
  const con = filas.filter((f) => f.h[30]);
  const porT = new Map();
  for (const f of con) porT.set(f.ticker, (porT.get(f.ticker) ?? []).concat(f.h[30].d));
  for (const [k, v] of [...porT].sort((a, b) => b[1].length - a[1].length))
    console.log(`  ${k.padEnd(5)} n=${String(v.length).padStart(6)} (${((v.length / con.length) * 100).toFixed(1)}%)  DIF=${pct(media(v)).padStart(9)}  t=${t1(v).toFixed(2)}`);
}

// ── 6. Sanidad de campos ─────────────────────────────────────────────────────
console.log("\n=== 6. SANIDAD DE CAMPOS ===");
const nulo = (k) => filas.filter((f) => f[k] == null || (typeof f[k] === "number" && !Number.isFinite(f[k]))).length;
for (const k of ["ts", "condition", "dte", "prima", "size", "oi", "precioOper", "bidOper", "askOper", "askEnt", "bidEnt", "strike"])
  console.log(`  ${k.padEnd(12)} nulos/no-finitos: ${nulo(k)}`);
const horas = filas.map((f) => Number(String(f.ts).slice(11, 13))).filter(Number.isFinite);
const hh = new Map();
for (const h of horas) hh.set(h, (hh.get(h) ?? 0) + 1);
console.log(`  rango horario de ts (hora literal): ${Math.min(...horas)}..${Math.max(...horas)}`);
console.log(`  reparto: ${[...hh].sort((a, b) => a[0] - b[0]).map(([h, n]) => `${h}h:${n}`).join(" ")}`);
console.log(`  ejemplo ts: ${filas[0].ts}`);
const dtes = filas.map((f) => f.dte).sort((a, b) => a - b);
console.log(`  dte: min=${dtes[0]} mediana=${dtes[dtes.length >> 1]} max=${dtes[dtes.length - 1]}`);
const lados = new Map();
for (const f of filas) lados.set(f.lado, (lados.get(f.lado) ?? 0) + 1);
console.log(`  lado: ${[...lados].map(([k, v]) => `${k}=${v}`).join(" ")}`);
const cubos = filas.map((f) => f.cubo).sort((a, b) => a - b);
console.log(`  tamano del cubo: min=${cubos[0]} mediana=${cubos[cubos.length >> 1]} max=${cubos[cubos.length - 1]}`);
console.log(`  rango de dias: ${filas.map((f) => f.dia).reduce((a, b) => (a < b ? a : b))} .. ${filas.map((f) => f.dia).reduce((a, b) => (a > b ? a : b))}`);
