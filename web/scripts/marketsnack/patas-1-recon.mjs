// PATAS SUELTAS · PASO 1 — RECONOCIMIENTO
//
// Antes de medir nada: ¿qué trade_condition_id hay de verdad en los ficheros, cuántos son
// multi-pata, y con qué tickers se puede cruzar contra cierres reales?
//
// Uso: node --import tsx scripts/marketsnack/patas-1-recon.mjs [1000k|100k]

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import rl from "node:readline";
import { TRADE_CONDITIONS, MULTI_LEG_CODES, CANCELED_CODES } from "../../lib/conditions.ts";

const NIVEL = process.argv[2] || "100k";
const DIR = path.resolve(`scripts/cache-theta/marketsnack/flujo-${NIVEL}`);
const CIERRES = path.resolve("scripts/cache-theta/cierres");

const CODE = new Map(TRADE_CONDITIONS.map((c) => [c.id, c.code]));
const NOMBRE = new Map(TRADE_CONDITIONS.map((c) => [c.id, c.name]));

const conCierre = new Set(
  fs.readdirSync(CIERRES).map((f) => f.replace(".json", "")),
);
const cierres = new Map();
for (const t of conCierre) cierres.set(t, JSON.parse(fs.readFileSync(path.join(CIERRES, `${t}.json`), "utf8")));

const P = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).sort();

const cond = new Map();          // id -> n
const condPrima = new Map();     // id -> prima
const roots = new Map();         // root -> {n, prima, sueltas, multi}
const porDia = new Map();        // dia -> n
let total = 0, primaTotal = 0, sinSymbol = 0, sinCond = 0;

for (const f of dias) {
  const dia = f.replace(".jsonl.gz", "");
  const inp = fs.createReadStream(path.join(DIR, f)).pipe(zlib.createGunzip());
  let nDia = 0;
  for await (const l of rl.createInterface({ input: inp })) {
    if (!l.trim()) continue;
    let t; try { t = JSON.parse(l); } catch { continue; }
    total++; nDia++;
    const id = t.trade_condition_id;
    if (id == null) sinCond++;
    cond.set(id, (cond.get(id) ?? 0) + 1);
    condPrima.set(id, (condPrima.get(id) ?? 0) + (t.premium ?? 0));
    primaTotal += t.premium ?? 0;
    const m = P.exec(t.symbol ?? "");
    if (!m) { sinSymbol++; continue; }
    const r = m[1];
    let e = roots.get(r);
    if (!e) { e = { n: 0, prima: 0, sueltas: 0, multi: 0 }; roots.set(r, e); }
    e.n++; e.prima += t.premium ?? 0;
    const c = CODE.get(id);
    if (c && MULTI_LEG_CODES.has(c)) e.multi++; else e.sueltas++;
  }
  porDia.set(dia, nDia);
}

console.log(`═══ RECON PATAS SUELTAS · nivel ${NIVEL} ═══`);
console.log(`   ficheros-día: ${dias.length}  ·  ${dias[0].slice(0, 10)} → ${dias[dias.length - 1].slice(0, 10)}`);
console.log(`   operaciones: ${total.toLocaleString("es-ES")}  ·  prima total: $${(primaTotal / 1e9).toFixed(2)}B`);
console.log(`   sin symbol parseable: ${sinSymbol}  ·  sin trade_condition_id: ${sinCond}\n`);

console.log(`── INVENTARIO DE trade_condition_id ──`);
const orden = [...cond.entries()].sort((a, b) => b[1] - a[1]);
let nMulti = 0, primaMulti = 0, nCancel = 0;
for (const [id, n] of orden) {
  const c = CODE.get(id) ?? "(desconocido)";
  const esMulti = c && MULTI_LEG_CODES.has(c);
  const esCancel = c && CANCELED_CODES.has(c);
  if (esMulti) { nMulti += n; primaMulti += condPrima.get(id) ?? 0; }
  if (esCancel) nCancel += n;
  console.log(
    `  ${String(id).padStart(4)} ${c.padEnd(6)} ${(esMulti ? "MULTI" : esCancel ? "CANC " : "suelt").padEnd(6)}` +
    ` n=${String(n).padStart(9)} (${((n / total) * 100).toFixed(2)}%)` +
    `  prima=$${((condPrima.get(id) ?? 0) / 1e9).toFixed(3)}B (${(((condPrima.get(id) ?? 0) / primaTotal) * 100).toFixed(2)}%)` +
    `  ${NOMBRE.get(id) ?? ""}`,
  );
}
console.log(`\n  MULTI-PATA: ${((nMulti / total) * 100).toFixed(1)}% de las operaciones · ${((primaMulti / primaTotal) * 100).toFixed(1)}% de la prima`);
console.log(`  CANCELADAS: ${nCancel}\n`);

console.log(`── SOLAPAMIENTO CON CIERRES REALES ──`);
const ordRoots = [...roots.entries()].sort((a, b) => b[1].n - a[1].n);
let nCon = 0, primaCon = 0;
const filas = [];
for (const [r, e] of ordRoots) {
  if (cierres.has(r)) {
    const cs = cierres.get(r);
    const tieneVentana = Object.keys(cs).filter((d) => d >= "20260422").length;
    if (tieneVentana > 0) { nCon += e.n; primaCon += e.prima; filas.push([r, e, tieneVentana]); }
  }
}
console.log(`   roots distintos en el flujo: ${roots.size}`);
console.log(`   con cierres en la ventana : ${filas.length}`);
console.log(`   filas medibles: ${nCon.toLocaleString("es-ES")} de ${total.toLocaleString("es-ES")} (${((nCon / total) * 100).toFixed(1)}%)`);
console.log(`   prima medible : ${((primaCon / primaTotal) * 100).toFixed(1)}%\n`);
console.log(`   ticker      n      %multi   dias-cierre`);
for (const [r, e, d] of filas) {
  console.log(`   ${r.padEnd(7)} ${String(e.n).padStart(8)}   ${((e.multi / e.n) * 100).toFixed(1).padStart(5)}%   ${d}`);
}

console.log(`\n── TOP 15 ROOTS SIN CIERRE (lo que NO se puede medir) ──`);
let i = 0;
for (const [r, e] of ordRoots) {
  if (cierres.has(r) && Object.keys(cierres.get(r)).some((d) => d >= "20260422")) continue;
  console.log(`   ${r.padEnd(7)} ${String(e.n).padStart(8)} (${((e.n / total) * 100).toFixed(2)}%)  %multi=${((e.multi / e.n) * 100).toFixed(1)}%`);
  if (++i >= 15) break;
}

fs.writeFileSync(
  path.resolve(`scripts/marketsnack/patas-1-recon-${NIVEL}.json`),
  JSON.stringify({
    nivel: NIVEL, dias: dias.length, total, primaTotal,
    condiciones: orden.map(([id, n]) => ({ id, code: CODE.get(id) ?? null, n, prima: condPrima.get(id) ?? 0, multi: !!(CODE.get(id) && MULTI_LEG_CODES.has(CODE.get(id))) })),
    pctMultiOps: nMulti / total, pctMultiPrima: primaMulti / primaTotal,
    medibles: filas.map(([r, e]) => ({ t: r, n: e.n, pctMulti: e.multi / e.n })),
    nMedibles: nCon, pctMedible: nCon / total,
  }, null, 1),
);
