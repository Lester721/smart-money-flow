import { readFileSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const G = JSON.parse(readFileSync("scripts/dm-grid.json", "utf8"));
const D = G.dias, V = G.variantes;
const N = D.length;

// ── RADIOGRAFÍA antes de medir nada ─────────────────────────────────────────────
const planas = D.map((d, i) => ({
  sp11: d.sp11, cierre: d.cierre, sigma: d.sigma, iv: d.iv, mov: d.mov, movSig: d.movSig,
  rangoMan: d.rangoMan,
  plBase: V["p25_a50"].serie[i] ? V["p25_a50"].serie[i].pl : null,
  credBase: V["p25_a50"].serie[i] ? V["p25_a50"].serie[i].credito : null,
  plProp: V["s1.00_a30"].serie[i] ? V["s1.00_a30"].serie[i].pl : null,
  credProp: V["s1.00_a30"].serie[i] ? V["s1.00_a30"].serie[i].credito : null,
}));
radiografia(planas, ["sp11","cierre","sigma","iv","mov","movSig","rangoMan","plBase","credBase","plProp","credProp"],
  "cóndor 0DTE 1.121 días", { maxCeros: 0.2 });

// ── utilidades ──────────────────────────────────────────────────────────────────
const anosEntre = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;
const pct = (v, q) => { const s = [...v].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const suma = (v) => v.reduce((a, x) => a + x, 0);

function metricas(pls, fechas, ini, fin) {
  const op = pls.filter((x) => x !== 0 && x !== null);
  const anos = anosEntre(ini, fin);
  let acc = 0, pico = 0, dd = 0, minAcc = 0;
  for (const x of pls) { acc += x; if (acc > pico) pico = acc; if (pico - acc > dd) dd = pico - acc; if (acc < minAcc) minAcc = acc; }
  const s = suma(pls);
  return {
    total: s, anual: s / anos, anos,
    peorDia: pls.length ? Math.min(...pls) : 0,
    p1: pct(op, 0.01), p5: pct(op, 0.05),
    es5: (() => { const so = [...op].sort((a, b) => a - b); const k = Math.max(1, Math.floor(so.length * 0.05)); return suma(so.slice(0, k)) / k; })(),
    racha: -dd, minAcc,
    opera: op.length, dias: pls.length,
    acierto: op.length ? op.filter((x) => x > 0).length / op.length : 0,
  };
}

// máscaras de período
const idxA = D.map((d, i) => (d.ano <= 2023 ? i : -1)).filter((i) => i >= 0);
const idxB = D.map((d, i) => (d.ano >= 2024 ? i : -1)).filter((i) => i >= 0);
const rango = (idx) => [D[idx[0]].fecha, D[idx[idx.length - 1]].fecha];
const [aI, aF] = rango(idxA), [bI, bF] = rango(idxB);
console.log(`\n## A = ${aI}→${aF} (${idxA.length} días) · B = ${bI}→${bF} (${idxB.length} días)`);

// serie de P&L de una variante con filtro opcional (null = no opera → 0)
function serie(vid, filtro = () => true) {
  return D.map((d, i) => { const r = V[vid].serie[i]; return (r && filtro(d, r)) ? r.pl : 0; });
}
const medir = (pls, idx, ini, fin) => metricas(idx.map((i) => pls[i]), idx.map((i) => D[i].fecha), ini, fin);

// ── CONTROL: ¿reproduzco el cóndor conocido? ────────────────────────────────────
const base = serie("p25_a50");
const mT = medir(base, D.map((_, i) => i), D[0].fecha, D[N - 1].fecha);
console.log(`\n## CONTROL cóndor de hoy (±25 pts, ala 50, 1 contrato, 8 patas de comisión)`);
console.log(`   1.121 días: $${mT.anual.toFixed(0)}/año · peor día $${mT.peorDia.toFixed(0)} · peor racha $${mT.racha.toFixed(0)} · acierto ${(mT.acierto*100).toFixed(1)}%`);
console.log(`   A (2022-23): $${medir(base, idxA, aI, aF).anual.toFixed(0)}/año · B (2024-26): $${medir(base, idxB, bI, bF).anual.toFixed(0)}/año`);
const porAno = {};
for (let i = 0; i < N; i++) (porAno[D[i].ano] = porAno[D[i].ano] || []).push(base[i]);
console.log("   año a año:", Object.entries(porAno).map(([a, v]) => `${a} $${suma(v).toFixed(0)}`).join(" · "));

// ── LA REJILLA en las dos mitades ───────────────────────────────────────────────
const ids = Object.keys(V).filter((k) => V[k].tipo === "sigma" && V[k].k <= 1.20);
console.log(`\n## REJILLA · ${ids.length} geometrías (±k·σ, ala W). σ = IV_ATM(11:00)·spot·√(5h/año)`);
console.log("id            | A $/año | A ES5  | A p5   | A racha  | B $/año | B ES5  | B p5   | B racha  | T $/año | T racha  | opera");
const tabla = {};
for (const id of ids) {
  const s = serie(id);
  const a = medir(s, idxA, aI, aF), b = medir(s, idxB, bI, bF), t = medir(s, D.map((_, i) => i), D[0].fecha, D[N - 1].fecha);
  tabla[id] = { a, b, t };
  console.log(`${id.padEnd(13)} | ${a.anual.toFixed(0).padStart(7)} | ${a.es5.toFixed(0).padStart(6)} | ${a.p5.toFixed(0).padStart(6)} | ${a.racha.toFixed(0).padStart(8)} | ${b.anual.toFixed(0).padStart(7)} | ${b.es5.toFixed(0).padStart(6)} | ${b.p5.toFixed(0).padStart(6)} | ${b.racha.toFixed(0).padStart(8)} | ${t.anual.toFixed(0).padStart(7)} | ${t.racha.toFixed(0).padStart(8)} | ${t.opera}`);
}
writeFileSync("scripts/dm-tabla.json", JSON.stringify({ tabla, ids }), "utf8");

// ── CORRELACIÓN DE ORDEN entre períodos (¿qué se puede elegir?) ─────────────────
function spearman(x, y) {
  const r = (v) => { const s = v.map((val, i) => [val, i]).sort((a, b) => a[0] - b[0]); const o = new Array(v.length); s.forEach(([, i], k) => o[i] = k); return o; };
  const rx = r(x), ry = r(y), n = x.length;
  const mx = suma(rx) / n, my = suma(ry) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  const rho = num / Math.sqrt(dx * dy);
  return { rho, t: rho * Math.sqrt((n - 2) / (1 - rho * rho)) };
}
console.log(`\n## ¿Qué ORDEN de las ${ids.length} geometrías se conserva entre A y B?`);
for (const m of ["anual", "es5", "p5", "racha", "peorDia"]) {
  const s = spearman(ids.map((i) => tabla[i].a[m]), ids.map((i) => tabla[i].b[m]));
  console.log(`   ${m.padEnd(8)} ρ = ${s.rho.toFixed(2).padStart(6)}  (t=${s.t.toFixed(2)})`);
}
