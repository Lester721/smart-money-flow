// Y4 — LENTE 1e: MIRAR EL BILLETE GRANDE EN EL FICHERO, A MANO.
// El mayor ganador del hallazgo pone el 2.5% de todo el dinero ganado. Antes de creerselo hay que
// abrir los dos ficheros y leer los numeros crudos: que se pago, que se cobro, y si el movimiento
// del subyacente da para eso. Se hace lo mismo con los cinco mayores.
// Uso: node --import tsx --max-old-space-size=10240 scripts/y4-lente1e-el-billete-grande.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
const CDIR = "scripts/cache-theta/cadenas";
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const cal = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const cadena = (s, d) => { const f = `${CDIR}/${s}_d${d}.json`; return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; };
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
  return K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
}
// los cinco billetes mas grandes que salieron en el informe / en el examen
const CASOS = [
  ["SPY", "20260401", "C"], ["XOM", "20200203", "P"], ["DIS", "20200203", "P"],
  ["TSLA", "20200103", "C"], ["BAC", "20200203", "P"],
];
const ENV = { dist: 0.10, dte: 60, tolDte: 17, tolK: 0.50 };
const dias = new Map();
for (const f of readdirSync(CDIR)) { const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/); if (!m) continue; if (!dias.has(m[1])) dias.set(m[1], []); dias.get(m[1]).push(m[2]); }
for (const v of dias.values()) v.sort();

for (const [sym, dia, tipo] of CASOS) {
  const ds = dias.get(sym); if (!ds) { console.log(`${sym}: sin datos`); continue; }
  const i = ds.indexOf(dia); if (i < 0) { console.log(`${sym} ${dia}: ese dia no esta`); continue; }
  const c = cadena(sym, dia); const S = spotOk(c, dia);
  let exp = null, dd = Infinity;
  for (const e of Object.keys(c)) { const d = cal(dia, e); if (d < 1) continue; const x = Math.abs(d - ENV.dte); if (x < dd) { dd = x; exp = e; } }
  const obj = tipo === "C" ? S * 1.10 : S * 0.90;
  let K = null, ba = null, kd = Infinity;
  for (const [cl, v] of Object.entries(c[exp])) {
    if (cl.slice(-1) !== tipo) continue;
    if (!(v[1] >= 0.10)) continue;
    const k = Number(cl.slice(0, -2)); const d = Math.abs(k - obj);
    if (d < kd) { kd = d; K = k; ba = v; }
  }
  const dSal = ds[i + 30];
  const cs = cadena(sym, dSal);
  const Ssal = cs ? spotOk(cs, dSal) : null;
  const sal = cs?.[exp]?.[`${K}|${tipo}`];
  const ret = sal ? (sal[0] - ba[1]) / ba[1] : ((0 - ba[1]) / ba[1]);
  console.log(`\n${sym} ${tipo} — entrada ${dia}, salida ${dSal}, vencimiento ${exp} (${cal(dia, exp)} dias)`);
  console.log(`  accion: ${S.toFixed(2)} → ${Ssal ? Ssal.toFixed(2) : "?"}  (${Ssal ? ((Ssal / S - 1) * 100).toFixed(1) : "?"}%)`);
  console.log(`  strike ${K} (${((tipo === "C" ? K / S - 1 : 1 - K / S) * 100).toFixed(1)}% fuera) · se COMPRA al ask $${ba[1].toFixed(2)} (bid $${ba[0].toFixed(2)}, horquilla ${(100 * (ba[1] - ba[0]) / ba[1]).toFixed(1)}%)`);
  console.log(`  al salir: ${sal ? `bid $${sal[0].toFixed(2)} / ask $${sal[1].toFixed(2)}` : "EL CONTRATO NO ESTA EN EL FICHERO → se apunta 0"}`);
  console.log(`  valor intrinseco al salir: $${Ssal ? Math.max(0, tipo === "C" ? Ssal - K : K - Ssal).toFixed(2) : "?"} · le quedaban ${cal(dSal, exp)} dias`);
  console.log(`  retorno ${(100 * ret).toFixed(0)}% → sobre $1,000 arriesgados: $${Math.round(1000 * ret).toLocaleString("en-US")}`);
}
console.log("");
