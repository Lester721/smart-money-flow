// PASO 5 — RADIOGRAFÍA DEL SUPERVIVIENTE: la volatilidad realizada de la mañana.
//
// rvManana = desviación típica de los 18 retornos de 5 min entre 09:35 y 11:00, anualizada.
// Es VELOCIDAD, no rango: mide lo picado del camino, no sus extremos.
//
// Aquí se pregunta lo que un umbral que sobrevive tiene que aguantar:
//   1. ¿es una MESETA o un PICO? (si sólo funciona en un valor, es un ajuste)
//   2. ¿parte la COLA o sólo baja la media? (p1, p5, peor día, P(<−2k), P(<−4k))
//   3. ¿le gana al AZAR en la cola, no sólo en la racha?
//   4. ¿tiene el mismo signo en los TRES tercios?
//   5. ¿es rvManana o es el straddle disfrazado?
import { listonT } from "../lib/barreraHallazgos";
import { construir, media, pct, eur, racha, tWelch } from "./mov-lib.mjs";

const F = construir().filter((f) => f.huecoSig != null && f.rangoAnteSig != null && f.vel30Sig != null && f.rvIv != null);
const A = F.filter((f) => f.fecha < "2024-01-01"), B = F.filter((f) => f.fecha >= "2024-01-01");
const met = (sel, nTot) => {
  const pl = sel.map((f) => f.pl); const tot = pl.reduce((a, b) => a + b, 0);
  return { n: pl.length, alAno: tot / (nTot / 252), peor: Math.min(...pl), p1: pct(pl, 0.01), p5: pct(pl, 0.05),
           dd: racha(pl), p2000: pl.filter((x) => x < -2000).length / pl.length, p4000: pl.filter((x) => x < -4000).length / pl.length,
           acierto: pl.filter((x) => x > 0).length / pl.length };
};

// ── 1. ¿MESETA O PICO? el barrido entero del umbral en los DOS períodos ──
console.log("\n## 1 · MESETA O PICO — barrido del umbral de rvManana en los dos periodos\n");
console.log("| umbral | 22-23 fuera | 22-23 D$/ano | 22-23 Dcaida | 24-26 fuera | 24-26 D$/ano | 24-26 Dcaida |");
console.log("|---|---|---|---|---|---|---|");
for (const U of [12, 14, 15, 16, 17, 18, 19, 20, 22, 25, 30]) {
  const cols = [];
  for (const G of [A, B]) {
    const b = met(G, G.length), f = met(G.filter((x) => x.rvManana <= U), G.length);
    cols.push(`${(100 * (1 - f.n / G.length)).toFixed(0)}%`, eur(f.alAno - b.alAno), eur(Math.abs(b.dd) - Math.abs(f.dd)));
  }
  console.log(`| ${U} | ${cols.join(" | ")} |`);
}

// ── 2. LA COLA ──
console.log("\n## 2 · LA COLA — el umbral se elige en un periodo y se aplica al otro, sin tocarlo\n");
console.log("| caso | n | dias fuera | $/ano | acierto | p5 | p1 | peor dia | peor racha | P(<-2k) | P(<-4k) |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const CASOS = [
  ["22-23 · TODOS los dias", A, null],
  ["22-23 · umbral 18,12 elegido en 24-26", A, 18.12],
  ["24-26 · TODOS los dias", B, null],
  ["24-26 · umbral 17,76 elegido en 22-23", B, 17.76],
  ["TODO · TODOS los dias", F, null],
  ["TODO · umbral 18 (redondo)", F, 18],
];
for (const [et, G, U] of CASOS) {
  const m = met(U == null ? G : G.filter((x) => x.rvManana <= U), G.length);
  console.log(`| ${et} | ${m.n} | ${G.length - m.n} | ${eur(m.alAno)} | ${(m.acierto * 100).toFixed(0)}% | ${eur(m.p5)} | ${eur(m.p1)} | ${eur(m.peor)} | ${eur(m.dd)} | ${(m.p2000 * 100).toFixed(1)}% | ${(m.p4000 * 100).toFixed(1)}% |`);
}

// ── 3. EL AZAR, sobre TODAS las métricas de cola ──
function azar(G, nFuera, sorteos = 500) {
  let s = 987654321; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const out = { dd: [], alAno: [], p5: [], p1: [], peor: [], p2000: [], p4000: [] };
  for (let k = 0; k < sorteos; k++) {
    const idx = G.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const fuera = new Set(idx.slice(0, nFuera));
    const m = met(G.filter((_, i) => !fuera.has(i)), G.length);
    for (const k2 of Object.keys(out)) out[k2].push(m[k2]);
  }
  return out;
}
console.log("\n## 3 · LE GANA AL AZAR EN LA COLA? — 500 sorteos quitando el mismo n de dias\n");
console.log("| periodo | metrica | real | mediana del azar | % de sorteos que bate |");
console.log("|---|---|---|---|---|");
for (const [et, G, U] of [["24-26 (umbral de 22-23: 17,76)", B, 17.76], ["22-23 (umbral de 24-26: 18,12)", A, 18.12]]) {
  const sel = G.filter((x) => x.rvManana <= U), m = met(sel, G.length);
  const az = azar(G, G.length - sel.length);
  const rank = (arr, v, mayorEsMejor) => ((arr.filter((x) => (mayorEsMejor ? x < v : x > v)).length / arr.length) * 100).toFixed(0) + "%";
  console.log(`| ${et} | peor racha | ${eur(m.dd)} | ${eur(pct(az.dd, 0.5))} | ${rank(az.dd, m.dd, true)} |`);
  console.log(`| | $/ano | ${eur(m.alAno)} | ${eur(pct(az.alAno, 0.5))} | ${rank(az.alAno, m.alAno, true)} |`);
  console.log(`| | p5 | ${eur(m.p5)} | ${eur(pct(az.p5, 0.5))} | ${rank(az.p5, m.p5, true)} |`);
  console.log(`| | p1 | ${eur(m.p1)} | ${eur(pct(az.p1, 0.5))} | ${rank(az.p1, m.p1, true)} |`);
  console.log(`| | peor dia | ${eur(m.peor)} | ${eur(pct(az.peor, 0.5))} | ${rank(az.peor, m.peor, true)} |`);
  console.log(`| | P(<-2k) | ${(m.p2000 * 100).toFixed(2)}% | ${(pct(az.p2000, 0.5) * 100).toFixed(2)}% | ${rank(az.p2000, m.p2000, false)} |`);
  console.log(`| | P(<-4k) | ${(m.p4000 * 100).toFixed(2)}% | ${(pct(az.p4000, 0.5) * 100).toFixed(2)}% | ${rank(az.p4000, m.p4000, false)} |`);
}

// ── 4. LOS TRES TERCIOS ──
console.log("\n## 4 · LOS TRES TERCIOS — vive el efecto en un solo trozo del tiempo?\n");
const ord = [...F].sort((a, b) => a.fecha.localeCompare(b.fecha));
const k3 = Math.floor(ord.length / 3);
console.log("| tercio | n | opera | $/dia operando | $/dia si opera SIEMPRE | D | saltados: $/dia |");
console.log("|---|---|---|---|---|---|---|");
for (let i = 0; i < 3; i++) {
  const g = i < 2 ? ord.slice(i * k3, (i + 1) * k3) : ord.slice(2 * k3);
  const dentro = g.filter((x) => x.rvManana <= 18), fuera = g.filter((x) => x.rvManana > 18);
  const md = media(dentro.map((x) => x.pl)), mt = media(g.map((x) => x.pl)), mf = media(fuera.map((x) => x.pl));
  console.log(`| ${g[0].fecha}->${g[g.length - 1].fecha} | ${g.length} | ${dentro.length} | ${eur(md)} | ${eur(mt)} | ${eur(md - mt)} | ${eur(mf)} (n=${fuera.length}) |`);
}
console.log("\n| periodo | n operados | n saltados | $/dia operados | $/dia saltados | t |");
console.log("|---|---|---|---|---|---|");
for (const [et, G] of [["2022-2023", A], ["2024-2026", B], ["TODO", F]]) {
  const d = G.filter((x) => x.rvManana <= 18).map((x) => x.pl), f = G.filter((x) => x.rvManana > 18).map((x) => x.pl);
  console.log(`| ${et} | ${d.length} | ${f.length} | ${eur(media(d))} | ${eur(media(f))} | ${tWelch(d, f).toFixed(2)} |`);
}
console.log(`\n  liston de |t| con 60 pruebas = ${listonT(60)}`);

// ── 5. ¿ES rvManana O ES EL STRADDLE DISFRAZADO? ──
console.log("\n## 5 · ES LA VELOCIDAD, O ES EL STRADDLE DISFRAZADO?\n");
console.log("| quintil de straddle | n | rv<=18 $/dia | rv>18 $/dia | D | n saltados |");
console.log("|---|---|---|---|---|---|");
const porStrad = [...F].sort((a, b) => a.strad - b.strad);
const q = Math.floor(porStrad.length / 5);
for (let i = 0; i < 5; i++) {
  const g = i < 4 ? porStrad.slice(i * q, (i + 1) * q) : porStrad.slice(4 * q);
  const d = g.filter((x) => x.rvManana <= 18).map((x) => x.pl), f = g.filter((x) => x.rvManana > 18).map((x) => x.pl);
  console.log(`| ${g[0].strad.toFixed(1)}->${g[g.length - 1].strad.toFixed(1)} | ${g.length} | ${d.length ? eur(media(d)) : "--"} | ${f.length ? eur(media(f)) : "--"} | ${d.length && f.length ? eur(media(d) - media(f)) : "--"} | ${f.length} |`);
}
const corr = (x, y) => { const mx = media(x), my = media(y); let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; } return n / Math.sqrt(dx * dy); };
console.log(`\n  correlacion rvManana <-> straddle: ${corr(F.map((f) => f.rvManana), F.map((f) => f.strad)).toFixed(3)}`);
console.log(`  correlacion rvManana <-> IV del dinero: ${corr(F.map((f) => f.rvManana), F.map((f) => f.ivAtm)).toFixed(3)}`);
console.log(`  correlacion rvManana <-> |mov de tarde en sigmas|: ${corr(F.map((f) => f.rvManana), F.map((f) => f.zTardeSig)).toFixed(3)}`);
console.log(`  correlacion rvManana <-> rango de la manana en sigmas: ${corr(F.map((f) => f.rvManana), F.map((f) => f.rangoSig)).toFixed(3)}`);
