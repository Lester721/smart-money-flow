// Y4 — LENTE 1f: EL PRECIO DE LA ACCION, CONTRA EL CIERRE DE VERDAD.
//
// Todo el hallazgo cuelga de un precio del subyacente deducido de la propia cadena por paridad
// put-call. Si ese precio esta sesgado, tanto la senal (la cuna se divide por el) como el envase
// (el strike se elige a un 10% de el) estan sesgados. Ayer ya se cazo un fallo asi.
//
// Aqui se compara, dia a dia, con el fichero de cierres reales del subyacente.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y4-lente1f-el-spot-contra-el-cierre.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
const CDIR = "scripts/cache-theta/cadenas", KDIR = "scripts/cache-theta/cierres";
const pct = (x) => (100 * x).toFixed(2) + "%";
const num = (n) => Math.round(n).toLocaleString("en-US");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const cal = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = cal(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
  if (!exp) return null;
  const g = c[exp]; let K = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[`${k}|P`]; if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
  return s > 0 ? s : null;
}
/** la version CON EL FALLO de ayer: la paridad mirada en TODA la cadena a la vez */
function spotMalo(c) {
  let K = null, dm = Infinity, best = null;
  for (const [e, g] of Object.entries(c)) for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[`${k}|P`]; if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; K = k; best = { C: ba, P: p }; }
  }
  if (K == null) return null;
  return K + (best.C[0] + best.C[1]) / 2 - (best.P[0] + best.P[1]) / 2;
}

const dias = new Map();
for (const f of readdirSync(CDIR)) { const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/); if (!m) continue; if (!dias.has(m[1])) dias.set(m[1], []); dias.get(m[1]).push(m[2]); }
for (const v of dias.values()) v.sort();

const errB = [], errM = [];
let sinCierre = 0, comparados = 0;
const peores = [];
for (const [sym, ds] of [...dias.entries()].sort()) {
  const kf = `${KDIR}/${sym}.json`;
  if (!existsSync(kf)) { sinCierre++; continue; }
  const K = JSON.parse(readFileSync(kf, "utf8"));
  const vistos = new Set();
  for (const dia of ds) {
    const mes = dia.slice(0, 6); if (vistos.has(mes)) continue; vistos.add(mes);   // los mismos dias de entrada
    const real = K[dia]; if (!(real > 0)) continue;
    const f = `${CDIR}/${sym}_d${dia}.json`; if (!existsSync(f)) continue;
    let c; try { c = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
    const b = spotOk(c, dia), m = spotMalo(c);
    if (!(b > 0)) continue;
    comparados++;
    const eb = b / real - 1, em = m > 0 ? m / real - 1 : null;
    errB.push(eb); if (em != null) errM.push(em);
    peores.push({ sym, dia, real, b, eb });
  }
}
errB.sort((a, b) => a - b); errM.sort((a, b) => a - b);
const q = (v, p) => v[Math.min(v.length - 1, Math.floor(v.length * p))];
console.log(`\n${"=".repeat(96)}`);
console.log("  EL SPOT POR PARIDAD CONTRA EL CIERRE REAL (mismos dias de entrada del backtest)");
console.log(`${"=".repeat(96)}`);
console.log(`  ${num(comparados)} dias comparados · ${sinCierre} tickers sin fichero de cierres`);
console.log(`\n  | version | mediana del error | 1% | 99% | mas de 2% arriba | mas de 2% abajo |`);
console.log(`  |---|---|---|---|---|---|`);
console.log(`  | la BUENA (solo el vencimiento mas cercano) | ${pct(q(errB, 0.50))} | ${pct(q(errB, 0.01))} | ${pct(q(errB, 0.99))} | ${pct(errB.filter((x) => x > 0.02).length / errB.length)} | ${pct(errB.filter((x) => x < -0.02).length / errB.length)} |`);
if (errM.length) console.log(`  | la MALA (toda la cadena a la vez) | ${pct(q(errM, 0.50))} | ${pct(q(errM, 0.01))} | ${pct(q(errM, 0.99))} | ${pct(errM.filter((x) => x > 0.02).length / errM.length)} | ${pct(errM.filter((x) => x < -0.02).length / errM.length)} |`);
console.log(`\n  (el cierre oficial y la cadena no tienen por que estar tomados a la misma hora, asi que un`);
console.log(`   error pequeno y SIMETRICO es normal; lo que delataria el fallo es un sesgo hacia arriba)`);
peores.sort((a, b) => Math.abs(b.eb) - Math.abs(a.eb));
console.log(`\n  Los 8 dias con mas diferencia:`);
for (const p of peores.slice(0, 8)) console.log(`    ${p.sym} ${p.dia}: paridad ${p.b.toFixed(2)} · cierre real ${p.real.toFixed(2)} · ${pct(p.eb)}`);
console.log("");
