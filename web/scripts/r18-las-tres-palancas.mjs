// LAS TRES PALANCAS que quedan, probadas juntas.
//   1. UNA POR TICKER Y DÍA — 16 señales de META el mismo día son la misma apuesta
//   2. POSICIONES MÁS PEQUEÑAS — con $7,500 caben 8 huecos
//   3. SOLTAR ANTES — la mediana ocupa 11 días de bolsa
import { cargar, simular, resumir } from "./consultar.mjs";
const R = { objetivo: 1.50, suelo: 0.50 };
const $ = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const T = cargar();
const MAG = (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12;

function corre(filas, { porOp, maxAb, unaPorTicker = false, salirEnDias = null }) {
  const opts = salirEnDias ? { ...R, salirEnDias } : R;
  const L = filas.map((f) => ({ f, r: simular(f, opts) })).sort((a, b) => a.f.dC.localeCompare(b.f.dC));
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.f.dC)) porDia.set(x.f.dC, []); porDia.get(x.f.dC).push(x); }
  let caja = 60000, ab = [], tom = [], minC = 60000;
  const fechas = [...new Set([...L.map((x) => x.f.dC), ...L.map((x) => x.r.dSal)])].sort();
  for (const hoy of fechas) {
    for (const a of ab.filter((a) => a.r.dSal === hoy)) caja += a.n * a.r.mult * a.f.ask * 100;
    ab = ab.filter((a) => a.r.dSal !== hoy);
    let cand = (porDia.get(hoy) ?? []).slice().sort((a, b) => b.f.vsOI - a.f.vsOI);
    if (unaPorTicker) { const v = new Set(); cand = cand.filter((x) => (v.has(x.f.tk) ? false : (v.add(x.f.tk), true))); }
    for (const x of cand) {
      if (ab.length >= maxAb) break;
      if (unaPorTicker && ab.some((a) => a.f.tk === x.f.tk)) continue;   // ni repetir ticker abierto
      const precio = x.f.ask * 100, n = Math.floor(porOp / precio);
      if (n < 1 || n * precio > caja) continue;
      caja -= n * precio; ab.push({ ...x, n }); tom.push({ ...x, n });
    }
    if (caja < minC) minC = caja;
  }
  for (const a of ab) caja += a.n * a.r.mult * a.f.ask * 100;
  return { final: caja, gan: caja - 60000, pct: 100 * (caja / 60000 - 1), n: tom.length, minC,
           g: tom.filter((x) => x.r.mult > 1).length, p: tom.filter((x) => x.r.mult < 1).length,
           tk: new Set(tom.map((x) => x.f.tk)).size };
}
const L = T.filter(MAG);
console.log(`\n  ${L.length} señales · cuenta de $60,000\n`);
console.log(`  ${"configuración".padEnd(46)} ops  gana/pierde  tickers  termina en   ganancia   caja mín`);
const F = (nom, o) => console.log(`  ${nom.padEnd(46)} ${String(o.n).padStart(3)}  ${`${o.g} / ${o.p}`.padEnd(11)} ${String(o.tk).padStart(7)}  ${$(o.final).padEnd(11)} ${$(o.gan).padEnd(10)} ${$(o.minC)}`);
F("BASE · $15,000 · 4 huecos", corre(L, { porOp: 15000, maxAb: 4 }));
console.log("");
F("1 · una por ticker · $15,000 · 4", corre(L, { porOp: 15000, maxAb: 4, unaPorTicker: true }));
console.log("");
for (const [p, m] of [[10000, 6], [7500, 8], [6000, 10]]) F(`2 · más pequeñas · $${p.toLocaleString("en-US")} · ${m}`, corre(L, { porOp: p, maxAb: m }));
console.log("");
for (const d of [5, 10, 15]) F(`3 · soltar a los ${d} días · $15,000 · 4`, corre(L, { porOp: 15000, maxAb: 4, salirEnDias: d }));
console.log(`\n  --- LAS TRES JUNTAS ---\n`);
for (const [p, m] of [[10000, 6], [7500, 8]])
  for (const d of [null, 10])
    F(`una por ticker · $${p.toLocaleString("en-US")} · ${m}${d ? ` · soltar a ${d} días` : ""}`,
      corre(L, { porOp: p, maxAb: m, unaPorTicker: true, salirEnDias: d }));
console.log("");
