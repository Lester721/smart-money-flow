// REFUTACIÓN CON LA LENTE "AJUSTE" — la hora de entrada del cóndor 0DTE.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/refuta-hora-ajuste.mjs
//
// Se reconstruye el cóndor desde las cadenas reales (mismo lector que estructura4) y se somete
// la afirmación "entrar a las 13:45 en vez de las 11:00" a seis pruebas de sobreajuste:
//   1. ±20% en CADA parámetro (separación, ancho del ala, tiempo que queda de sesión)
//   2. quitar los 3 días que más aportan (al ingreso) y los 3 que más restan (a la caída)
//   3. los tres tercios del período, con la métrica que decide, no sólo el signo
//   4. mover los bordes de la "franja de tarde"
//   5. permutar el orden de los días — cuánto de la peor racha es COLA y cuánto es RACIMO
//   6. elección de hora fuera de muestra (elegir en T1, cobrar en T2+T3)

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { resumen, media, sd, pct, eur, drawdown } from "./anatomia3-lib.mjs";

const DIR = "scripts/cache-theta/gex-2026";
const COMM = 0.03;
const TODAS = ["09:35", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30",
               "11:45", "12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "13:45",
               "14:00", "14:15", "14:30", "14:45", "15:00"];
const HORAS_P = ["11:00", "13:00", "13:15", "13:30", "13:45", "14:00", "14:15", "14:30"];
const SEPS = [20, 25, 30];      // ±20% sobre 25
const ALAS = [40, 50, 60];      // ±20% sobre 50

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid");
  const iA = cab.indexOf("ask"), iU = cab.indexOf("underlying_price");
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) throw new Error(`faltan columnas en ${f}`);
  const set = new Set(TODAS), filas = new Map(), spots = new Map();
  let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j]; if (L.length < 20) continue;
    const c = L.split(",");
    const h = c[iT].slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (!set.has(h)) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (!(K > 0) || !(ask > 0) || !(bid >= 0)) continue;
    if (!filas.has(h)) filas.set(h, []);
    filas.get(h).push({ K, bid, ask });
    if (sp > 0) spots.set(h, sp);
  }
  return { filas, spots, cierre };
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

function condor(fc, fp, spot, SEP, ALA, S) {
  const cC = cerca(fc, spot + SEP), pC = cerca(fp, spot - SEP);
  const cL = cerca(fc, cC.K + ALA), pL = cerca(fp, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) return null;
  const credito = cC.bid + pC.bid - cL.ask - pL.ask;      // BID al vender, ASK al comprar
  if (!(credito > 0)) return null;
  const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K;
  const perdC = Math.min(Math.max(S - cC.K, 0), anchoC);
  const perdP = Math.min(Math.max(pC.K - S, 0), anchoP);
  return { pl: (credito - perdC - perdP) * 100 - 8 * COMM, credito: credito * 100,
           colateral: (Math.max(anchoC, anchoP) - credito) * 100 };
}

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

// clave "hora|sep|ala" → filas
const S_ = new Map();
const clave = (h, s, a) => `${h}|${s}|${a}`;
for (const h of TODAS) S_.set(clave(h, 25, 50), []);
for (const h of HORAS_P) for (const s of SEPS) for (const a of ALAS) if (!S_.has(clave(h, s, a))) S_.set(clave(h, s, a), []);

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const S = C.cierre;
  for (const h of TODAS) {
    const fc = C.filas.get(h), fp = P.filas.get(h), spot = C.spots.get(h);
    if (!fc || !fp || !(spot > 0)) continue;
    const combos = HORAS_P.includes(h)
      ? SEPS.flatMap((s) => ALAS.map((a) => [s, a]))
      : [[25, 50]];
    for (const [s, a] of combos) {
      const c = condor(fc, fp, spot, s, a, S);
      if (c) S_.get(clave(h, s, a)).push({ fecha, ticker: "SPXW", ...c });
    }
  }
}

const cvar = (pls, q) => { const v = [...pls].sort((a, b) => a - b); return media(v.slice(0, Math.max(1, Math.floor(v.length * q)))); };
const met = (v, anos) => {
  const pls = v.map((x) => x.pl);
  const r = resumen(v, anos ?? v.length / 251);
  return { ...r, cvar5: cvar(pls, 0.05), cvar1: cvar(pls, 0.01) };
};
const G = (h, s = 25, a = 50) => S_.get(clave(h, s, a));

console.log(`\n${"=".repeat(104)}`);
console.log(`REFUTACIÓN · LENTE "AJUSTE" · ${fechas.length} días de SPXW 0DTE · precios reales (bid/ask), comisión $${COMM}/pata`);
console.log(`${"=".repeat(104)}`);
radiografia(G("13:45"), ["pl", "credito", "colateral"], "13:45 · ±25 · ala 50");
radiografia(G("11:00"), ["pl", "credito", "colateral"], "11:00 · ±25 · ala 50");

const B = met(G("11:00")), T = met(G("13:45"));
console.log(`\nreproducción: 11:00 ${eur(B.alAno)}/año · dd ${eur(B.dd)} · p5 ${eur(B.p5)} · CVaR5 ${eur(B.cvar5)} · peor ${eur(B.peor)}`);
console.log(`              13:45 ${eur(T.alAno)}/año · dd ${eur(T.dd)} · p5 ${eur(T.p5)} · CVaR5 ${eur(T.cvar5)} · peor ${eur(T.peor)}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1 · ±20% EN CADA PARÁMETRO
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n-- 1 · ±20% EN CADA PARÁMETRO ------------------------------------------------------------------`);
console.log(`\n  (a) separación y ancho del ala · para cada celda: 13:45 contra 11:00 con LOS MISMOS parámetros`);
console.log(`\n| sep | ala | 11:00 $/año | 13:45 $/año | % ingreso retenido | 11:00 dd | 13:45 dd | % caída eliminada | coste $/$ | ¿mejora eficiencia? |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|`);
const grid = [];
for (const s of SEPS) for (const a of ALAS) {
  const b = met(G("11:00", s, a)), t = met(G("13:45", s, a));
  const retenido = b.alAno > 0 ? t.alAno / b.alAno : NaN;
  const ddQuitada = Math.abs(b.dd) - Math.abs(t.dd);
  const coste = ddQuitada > 0 ? (b.alAno - t.alAno) / ddQuitada : null;
  const efB = b.alAno / Math.abs(b.dd), efT = t.alAno / Math.abs(t.dd);
  grid.push({ sep: s, ala: a, b, t, retenido, ddQuitada, coste, efB, efT, mejora: efT > efB });
  console.log(`| ${s} | ${a} | ${eur(b.alAno)} | ${eur(t.alAno)} | ${(retenido * 100).toFixed(0)}% | ${eur(b.dd)} | ${eur(t.dd)} | ` +
              `${((ddQuitada / Math.abs(b.dd)) * 100).toFixed(0)}% | ${coste != null ? coste.toFixed(2) : "no la reduce"} | ${efT > efB ? `SÍ (${efT.toFixed(2)} vs ${efB.toFixed(2)})` : `NO (${efT.toFixed(2)} vs ${efB.toFixed(2)})`} |`);
}
const pasanGrid = grid.filter((g) => g.mejora).length;
console.log(`\n  → 13:45 mejora la eficiencia en ${pasanGrid} de las ${grid.length} celdas de (separación × ala).`);
console.log(`  → ingreso retenido: mín ${(Math.min(...grid.map((g) => g.retenido)) * 100).toFixed(0)}% · máx ${(Math.max(...grid.map((g) => g.retenido)) * 100).toFixed(0)}%`);

console.log(`\n  (b) el TIEMPO QUE QUEDA de sesión, que es el parámetro del mecanismo alegado.`);
console.log(`      a las 13:45 quedan 2,25 h · −20% → 1,80 h ≈ 14:15 · +20% → 2,70 h ≈ 13:15`);
console.log(`\n| entrada | h. vivas | $/año | dd | p5 | CVaR5 | eficiencia $/año por $dd | coste vs 11:00 |`);
console.log(`|---|---|---|---|---|---|---|---|`);
for (const h of ["13:15", "13:45", "14:15", "11:00"]) {
  const r = met(G(h));
  const hv = 16 - Number(h.slice(0, 2)) - Number(h.slice(3)) / 60;
  const dq = Math.abs(B.dd) - Math.abs(r.dd);
  console.log(`| ${h}${h === "13:45" ? " ←" : ""} | ${hv.toFixed(2)} | ${eur(r.alAno)} | ${eur(r.dd)} | ${eur(r.p5)} | ${eur(r.cvar5)} | ` +
              `${(r.alAno / Math.abs(r.dd)).toFixed(2)} | ${dq > 0 ? ((B.alAno - r.alAno) / dq).toFixed(2) : "—"} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2 · QUITAR LOS 3 DÍAS QUE MÁS APORTAN / MÁS RESTAN
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n-- 2 · QUITAR LOS 3 DÍAS QUE MÁS APORTAN Y LOS 3 QUE MÁS RESTAN --------------------------------`);
const sinTop = (v, k) => { const o = [...v].sort((a, b) => b.pl - a.pl).slice(k).map((x) => x.fecha); const S = new Set(o); return v.filter((x) => S.has(x.fecha)); };
const sinBot = (v, k) => { const o = [...v].sort((a, b) => a.pl - b.pl).slice(k).map((x) => x.fecha); const S = new Set(o); return v.filter((x) => S.has(x.fecha)); };
console.log(`\n| serie | $/año entero | $/año sin top-3 | Δ | dd entera | dd sin peores-3 | Δ |`);
console.log(`|---|---|---|---|---|---|---|`);
const drop = {};
for (const h of ["11:00", "13:00", "13:30", "13:45", "14:15", "14:30"]) {
  const v = G(h), anos = v.length / 251;
  const r = met(v, anos), rT = met(sinTop(v, 3), anos), rB = met(sinBot(v, 3), anos);
  drop[h] = { entero: r.alAno, sinTop3: rT.alAno, dd: r.dd, ddSinPeores3: rB.dd };
  console.log(`| ${h}${h === "11:00" ? " (hoy)" : ""} | ${eur(r.alAno)} | ${eur(rT.alAno)} | ${((rT.alAno / r.alAno - 1) * 100).toFixed(0)}% | ${eur(r.dd)} | ${eur(rB.dd)} | ${((Math.abs(rB.dd) / Math.abs(r.dd) - 1) * 100).toFixed(0)}% |`);
}
{
  const b = drop["11:00"], t = drop["13:45"];
  console.log(`\n  sin los 3 mejores días: 11:00 ${eur(b.sinTop3)} vs 13:45 ${eur(t.sinTop3)} → retenido ${((t.sinTop3 / b.sinTop3) * 100).toFixed(0)}% (entero ${(( t.entero / b.entero) * 100).toFixed(0)}%)`);
  console.log(`  sin los 3 peores días: dd 11:00 ${eur(b.ddSinPeores3)} vs 13:45 ${eur(t.ddSinPeores3)} → caída eliminada ${(((Math.abs(b.ddSinPeores3) - Math.abs(t.ddSinPeores3)) / Math.abs(b.ddSinPeores3)) * 100).toFixed(0)}% (entera ${(((Math.abs(b.dd) - Math.abs(t.dd)) / Math.abs(b.dd)) * 100).toFixed(0)}%)`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3 · LOS TRES TERCIOS CON LA MÉTRICA QUE DECIDE
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n-- 3 · LOS TRES TERCIOS, PERO CON LA MÉTRICA QUE DECIDE (no sólo el signo) ---------------------`);
const tercio = (v, i) => { const s = [...v].sort((a, b) => a.fecha.localeCompare(b.fecha)); const k = Math.floor(s.length / 3); return i === 2 ? s.slice(2 * k) : s.slice(i * k, (i + 1) * k); };
console.log(`\n| tercio | 11:00 $/año | 13:45 $/año | retenido | 11:00 dd | 13:45 dd | caída elim. | coste $/$ | 11:00 CVaR5 | 13:45 CVaR5 |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|`);
const tercios = [];
for (let i = 0; i < 3; i++) {
  const vb = tercio(G("11:00"), i), vt = tercio(G("13:45"), i);
  const b = met(vb), t = met(vt);
  const dq = Math.abs(b.dd) - Math.abs(t.dd);
  const coste = dq > 0 ? (b.alAno - t.alAno) / dq : null;
  tercios.push({ i, b, t, coste });
  console.log(`| T${i + 1} ${vb[0].fecha}→${vb[vb.length - 1].fecha} | ${eur(b.alAno)} | ${eur(t.alAno)} | ${((t.alAno / b.alAno) * 100).toFixed(0)}% | ` +
              `${eur(b.dd)} | ${eur(t.dd)} | ${dq > 0 ? eur(dq) : "NO la reduce"} | ${coste != null ? coste.toFixed(2) : "—"} | ${eur(b.cvar5)} | ${eur(t.cvar5)} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4 · LOS BORDES DE LA FRANJA
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n-- 4 · MOVER LOS BORDES DE LA "FRANJA DE TARDE" ------------------------------------------------`);
const idx = (h) => TODAS.indexOf(h);
const franjas = {
  "13:00-14:30 (la del informe)": ["13:00", "14:30"],
  "13:00-14:45 (+1 slot)": ["13:00", "14:45"],
  "13:00-15:00 (+2 slots)": ["13:00", "15:00"],
  "12:45-14:45 (±1 slot)": ["12:45", "14:45"],
  "12:30-15:00 (±2 slots)": ["12:30", "15:00"],
  "12:00-15:00 (toda la tarde)": ["12:00", "15:00"],
  "11:00-12:45 (mediodía, la de hoy)": ["11:00", "12:45"],
};
console.log(`\n| franja | horas | $/año medio | CVaR5 medio | dd medio | ¿bate en dinero al mediodía ($10.741)? |`);
console.log(`|---|---|---|---|---|---|`);
const franjaStats = {};
for (const [nom, [a, b]] of Object.entries(franjas)) {
  const hs = TODAS.slice(idx(a), idx(b) + 1);
  const rs = hs.map((h) => met(G(h)));
  const m = (k) => media(rs.map((r) => r[k]));
  franjaStats[nom] = { horas: hs.length, alAno: m("alAno"), cvar5: m("cvar5"), dd: m("dd") };
  console.log(`| ${nom} | ${hs.length} | ${eur(m("alAno"))} | ${eur(m("cvar5"))} | ${eur(m("dd"))} | ${m("alAno") > 10741 ? "SÍ" : "NO"} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5 · PERMUTAR EL ORDEN — cuánto de la peor racha es COLA y cuánto es RACIMO
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n-- 5 · PERMUTAR EL ORDEN DE LOS DÍAS · ¿la peor racha mide la cola o mide un racimo? -----------`);
console.log(`   (mismos P&L diarios, orden barajado 2.000 veces: si la dd real es mucho peor que la mediana`);
console.log(`    permutada, esa dd no es una propiedad de la cola sino de que los días malos se juntaron)`);
let seed = 20260819;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
console.log(`\n| serie | dd real | dd permutada p50 | p05 | p95 | percentil de la real |`);
console.log(`|---|---|---|---|---|---|`);
const perm = {};
for (const h of ["11:00", "13:00", "13:30", "13:45", "14:15", "14:30"]) {
  const pls = G(h).map((x) => x.pl);
  const real = drawdown(pls);
  const sim = [];
  for (let b = 0; b < 2000; b++) {
    const c = [...pls];
    for (let i = c.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [c[i], c[j]] = [c[j], c[i]]; }
    sim.push(drawdown(c));
  }
  sim.sort((a, b) => a - b);
  const pctReal = sim.filter((x) => x < real).length / sim.length;
  perm[h] = { real, p50: pct(sim, 0.5), p05: pct(sim, 0.05), p95: pct(sim, 0.95), pctReal };
  console.log(`| ${h}${h === "11:00" ? " (hoy)" : ""} | ${eur(real)} | ${eur(pct(sim, 0.5))} | ${eur(pct(sim, 0.05))} | ${eur(pct(sim, 0.95))} | ${(pctReal * 100).toFixed(0)}% |`);
}
console.log(`\n  comparación limpia, sin el racimo: dd MEDIANA permutada 11:00 ${eur(perm["11:00"].p50)} vs 13:45 ${eur(perm["13:45"].p50)} → ` +
            `${(((Math.abs(perm["11:00"].p50) - Math.abs(perm["13:45"].p50)) / Math.abs(perm["11:00"].p50)) * 100).toFixed(0)}% menos (el informe dice 31% con la dd realizada)`);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6 · ELEGIR LA HORA FUERA DE MUESTRA
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n-- 6 · ELEGIR LA HORA CON DATOS PASADOS Y COBRARLA EN EL FUTURO -------------------------------`);
console.log(`   (la pregunta honesta: si en su día hubiera elegido la hora con el criterio del informe,`);
console.log(`    ¿habría acertado la hora buena del período siguiente?)`);
const criterios = {
  "eficiencia $/año ÷ |dd|": (r) => (r.dd < 0 ? r.alAno / Math.abs(r.dd) : -Infinity),
  "menor |CVaR5|": (r) => -Math.abs(r.cvar5),
  "menor |dd|": (r) => -Math.abs(r.dd),
  "mayor $/año": (r) => r.alAno,
};
const HH = TODAS.filter((h) => G(h).length >= 600);
console.log(`\n| criterio | elige en T1 | resultado T2+T3 | elige en T1+T2 | resultado T3 | 11:00 en T2+T3 | 11:00 en T3 |`);
console.log(`|---|---|---|---|---|---|---|`);
const wf = {};
for (const [nom, f] of Object.entries(criterios)) {
  const enT1 = HH.map((h) => ({ h, r: met(tercio(G(h), 0)) })).sort((a, b) => f(b.r) - f(a.r))[0].h;
  const enT12 = HH.map((h) => { const v = G(h); const s = [...v].sort((a, b) => a.fecha.localeCompare(b.fecha)); const k = Math.floor(s.length / 3); return { h, r: met(s.slice(0, 2 * k)) }; }).sort((a, b) => f(b.r) - f(a.r))[0].h;
  const fuera1 = met([...tercio(G(enT1), 1), ...tercio(G(enT1), 2)]);
  const fuera2 = met(tercio(G(enT12), 2));
  const base1 = met([...tercio(G("11:00"), 1), ...tercio(G("11:00"), 2)]);
  const base2 = met(tercio(G("11:00"), 2));
  wf[nom] = { enT1, enT12, fuera1: { alAno: fuera1.alAno, dd: fuera1.dd, cvar5: fuera1.cvar5 }, fuera2: { alAno: fuera2.alAno, dd: fuera2.dd, cvar5: fuera2.cvar5 } };
  console.log(`| ${nom} | ${enT1} | ${eur(fuera1.alAno)}/año, dd ${eur(fuera1.dd)} | ${enT12} | ${eur(fuera2.alAno)}/año, dd ${eur(fuera2.dd)} | ${eur(base1.alAno)}/año, dd ${eur(base1.dd)} | ${eur(base2.alAno)}/año, dd ${eur(base2.dd)} |`);
}

// ¿y una REGLA de franja en vez de una hora? "entrar en la tarde" = media de las 7 horas, fuera de muestra
console.log(`\n  la versión sin elegir hora: "entrar por la tarde", medida sólo en el TERCER tercio (nunca usado para elegir):`);
for (const [nom, [a, b]] of Object.entries(franjas)) {
  const hs = TODAS.slice(idx(a), idx(b) + 1);
  const rs = hs.map((h) => met(tercio(G(h), 2)));
  console.log(`    ${nom.padEnd(34)} $/año ${eur(media(rs.map((r) => r.alAno))).padStart(9)} · CVaR5 ${eur(media(rs.map((r) => r.cvar5))).padStart(8)} · dd ${eur(media(rs.map((r) => r.dd))).padStart(9)}`);
}

writeFileSync("scripts/refuta-hora-ajuste.json", JSON.stringify({ grid, drop, tercios, franjaStats, perm, wf }, null, 2));
console.log(`\n-> scripts/refuta-hora-ajuste.json`);
