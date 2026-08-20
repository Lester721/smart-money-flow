import { readFileSync } from "node:fs";
const G = JSON.parse(readFileSync("scripts/dm-grid.json", "utf8"));
const D = G.dias, V = G.variantes, N = D.length;
const suma = (v) => v.reduce((a, x) => a + x, 0);
const anosEntre = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;
const AN_T = anosEntre(D[0].fecha, D[N - 1].fecha);
const idxA = [], idxB = [];
D.forEach((d, i) => (d.ano <= 2023 ? idxA : idxB).push(i));
const AN_A = anosEntre(D[idxA[0]].fecha, D[idxA[idxA.length - 1]].fecha), AN_B = anosEntre(D[idxB[0]].fecha, D[idxB[idxB.length - 1]].fecha);
const serie = (vid, fm) => D.map((d, i) => { const r = V[vid].serie[i]; return (r && !(fm && d.finMes)) ? r.pl : 0; });
const anos = [...new Set(D.map((d) => d.ano))].sort();
function m(s, idx, an) { const sub = idx.map((i) => s[i]); let acc = 0, pico = 0, dd = 0;
  for (const x of sub) { acc += x; if (acc > pico) pico = acc; if (pico - acc > dd) dd = pico - acc; }
  const op = sub.filter((x) => x !== 0).sort((a, b) => a - b), k = Math.max(1, Math.floor(op.length * 0.05));
  return { anual: suma(sub) / an, racha: -dd, peorDia: Math.min(0, ...sub), es5: suma(op.slice(0, k)) / k, opera: op.length }; }
const TODO = D.map((_, i) => i);

console.log("=== MESETA alrededor de +-0,80 sigma / ala 30 (con salto de fin de mes) ===");
console.log("            |  2022  |  2023  |  2024  |  2025  |  2026  |  $/ano | peorDia |  racha  |   ES5  | A $/ano | B $/ano");
for (const id of Object.keys(V).filter((k) => V[k].tipo === "sigma")) {
  const s = serie(id, true);
  const t = m(s, TODO, AN_T), a = m(s, idxA, AN_A), b = m(s, idxB, AN_B);
  const py = anos.map((y) => suma(D.map((d, i) => (d.ano === y ? s[i] : 0))));
  console.log(`${id.padEnd(11)} | ${py.map((x) => x.toFixed(0).padStart(6)).join(" | ")} | ${t.anual.toFixed(0).padStart(6)} | ${t.peorDia.toFixed(0).padStart(7)} | ${t.racha.toFixed(0).padStart(7)} | ${t.es5.toFixed(0).padStart(6)} | ${a.anual.toFixed(0).padStart(7)} | ${b.anual.toFixed(0).padStart(7)}`);
}

console.log("\n=== LA MISMA REJILLA SIN el salto de fin de mes (para ver de que depende que) ===");
console.log("            |  2022  |  2023  |  2024  |  2025  |  2026  |  $/ano | peorDia |  racha  |   ES5  | A $/ano | B $/ano");
for (const id of Object.keys(V).filter((k) => V[k].tipo === "sigma" && (V[k].k === 0.7 || V[k].k === 0.8 || V[k].k === 0.9))) {
  const s = serie(id, false);
  const t = m(s, TODO, AN_T), a = m(s, idxA, AN_A), b = m(s, idxB, AN_B);
  const py = anos.map((y) => suma(D.map((d, i) => (d.ano === y ? s[i] : 0))));
  console.log(`${id.padEnd(11)} | ${py.map((x) => x.toFixed(0).padStart(6)).join(" | ")} | ${t.anual.toFixed(0).padStart(6)} | ${t.peorDia.toFixed(0).padStart(7)} | ${t.racha.toFixed(0).padStart(7)} | ${t.es5.toFixed(0).padStart(6)} | ${a.anual.toFixed(0).padStart(7)} | ${b.anual.toFixed(0).padStart(7)}`);
}

// CAJA de las candidatas, con y sin fin de mes
const EFECTIVO = 7977, HOOD = 500 * 96.82, LINEA = -0.70 * HOOD, INT = 0.05;
function caja(s, mult) {
  let c = EFECTIVO, minC = c, interes = 0, fechaMin = "", llamada = null, prev = D[0].fecha;
  for (let i = 0; i < N; i++) {
    const dd = Math.max(1, (new Date(D[i].fecha + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000); prev = D[i].fecha;
    if (c < 0) { const it = c * INT * dd / 365; interes += it; c += it; }
    c += s[i] * mult;
    if (c < minC) { minC = c; fechaMin = D[i].fecha; }
    if (c < LINEA && !llamada) llamada = D[i].fecha;
  }
  return { neto: c - EFECTIVO, anual: (c - EFECTIVO) / AN_T, minC, fechaMin, interes, llamada };
}
console.log("\n=== CAJA (efectivo $7.977, interes 5%) - 1 contrato de SPX ===");
for (const [nom, id, fm] of [["+-25/50 HOY", "p25_a50", false], ["+-0,80sig/30 SIN finmes", "s0.80_a30", false], ["+-0,80sig/30 CON finmes", "s0.80_a30", true],
                             ["+-0,70sig/30 CON finmes", "s0.70_a30", true], ["+-0,90sig/30 CON finmes", "s0.90_a30", true],
                             ["+-0,80sig/25 CON finmes", "s0.80_a25", true], ["+-0,80sig/40 CON finmes", "s0.80_a40", true]]) {
  const r = caja(serie(id, fm), 1);
  console.log(`${nom.padEnd(26)} | $/ano neto ${r.anual.toFixed(0).padStart(6)} | caja minima ${r.minC.toFixed(0).padStart(7)} (${r.fechaMin}) | interes ${r.interes.toFixed(0).padStart(6)} | llamada: ${r.llamada || "NO"}`);
}
