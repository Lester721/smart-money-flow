// AUDITORÍA 6 — la señal LIMPIA, troceada. ¿También es sólo 2019?
// Uso: node scripts/auditc-limpio-sin2019.mjs

import { readFileSync } from "node:fs";
const tabla = JSON.parse(readFileSync("scripts/auditc-cestas-2016-2020.json", "utf8"));
const limpio = new Map();
for (const r of JSON.parse(readFileSync("scripts/auditc-gamlejos-limpio.json", "utf8"))) if (r.gamLimpio != null) limpio.set(r.ticker + r.mes, r.gamLimpio);
const N = 3;
let sem = 99; const rnd = () => { sem = (sem * 1103515245 + 12345) & 0x7fffffff; return sem / 0x7fffffff; };

function bloque(etiqueta, keep) {
  const porMes = new Map();
  for (const t of tabla) { if (!keep(t)) continue; let a = porMes.get(t.mes); if (!a) porMes.set(t.mes, (a = [])); a.push(t); }
  const meses = [...porMes.keys()].sort();
  const ev = (sel) => { let inv = 0, rec = 0, n = 0, gan = 0; for (const m of meses) { const c = porMes.get(m); if (!c.length) continue; for (const t of sel(c)) { inv += t.inv; rec += t.rec; n += t.n; gan += t.gan; } } return { inv, rec, n, gan, x: rec / inv }; };
  const sucio = (c) => [...c].sort((a, b) => b.gam - a.gam).slice(0, N);
  const lim = (c) => [...c].filter((t) => limpio.has(t.ticker + t.mes)).sort((a, b) => limpio.get(b.ticker + b.mes) - limpio.get(a.ticker + a.mes)).slice(0, N);
  const az = (c) => { const k = [...c], o = []; for (let i = 0; i < N && k.length; i++) o.push(k.splice(Math.floor(rnd() * k.length), 1)[0]); return o; };
  const xs = []; for (let i = 0; i < 2000; i++) xs.push(ev(az).x); xs.sort((a, b) => a - b);
  const q = (p) => xs[Math.min(xs.length - 1, Math.floor(xs.length * p))];
  const rs = ev(sucio), rl = ev(lim);
  const pv = (x) => (xs.filter((v) => v >= x).length / xs.length).toFixed(3);
  console.log(`\n── ${etiqueta}   (azar: mediana ${q(0.5).toFixed(2)}x · p90 ${q(0.9).toFixed(2)}x · máx ${xs[xs.length - 1].toFixed(2)}x)`);
  console.log(`   guardado ${rs.x.toFixed(2)}x  p=${pv(rs.x)}      limpio ${rl.x.toFixed(2)}x  p=${pv(rl.x)}`);
}

bloque("TODO 2016-2020", () => true);
bloque("SIN 2019", (t) => !t.mes.startsWith("2019"));
bloque("SIN TSLA ni NVDA", (t) => t.ticker !== "TSLA" && t.ticker !== "NVDA");
bloque("SIN 2019 y SIN TSLA/NVDA", (t) => !t.mes.startsWith("2019") && t.ticker !== "TSLA" && t.ticker !== "NVDA");
bloque("SÓLO 2016-2018", (t) => t.mes < "201901");

// cuánto del dinero de la señal limpia sale de 2019
const porMes = new Map();
for (const t of tabla) { let a = porMes.get(t.mes); if (!a) porMes.set(t.mes, (a = [])); a.push(t); }
const lim = (c) => [...c].filter((t) => limpio.has(t.ticker + t.mes)).sort((a, b) => limpio.get(b.ticker + b.mes) - limpio.get(a.ticker + a.mes)).slice(0, 3);
const anios = new Map();
for (const [m, c] of porMes) for (const t of lim(c)) { const a = m.slice(0, 4); const x = anios.get(a) || { inv: 0, rec: 0 }; x.inv += t.inv; x.rec += t.rec; anios.set(a, x); }
console.log("\n── señal LIMPIA, año a año ──");
for (const [a, x] of [...anios].sort()) console.log(`   ${a}  $${Math.round(x.inv).toLocaleString("es-ES").padStart(8)} → $${Math.round(x.rec).toLocaleString("es-ES").padStart(10)}  ${(x.rec / x.inv).toFixed(2)}x`);
