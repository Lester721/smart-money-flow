// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASO 5 — EL PUENTE. Qué SÍ corta la cola, una vez que el GEX ha resultado ser la IV.
//
// Lo que enseñó el paso 4: los 41 días de pérdida > $2.000 no están donde la gamma es negativa,
// están donde el CRÉDITO era alto — que es lo mismo que decir donde 25 puntos eran POCAS SIGMAS.
//   · crédito:  32 de los 41 días malos en el tercil alto, 2 en el bajo  (z = 5,36)
//   · 25pts/σ:  32 de los 41 en el tercil BAJO, 2 en el alto             (z = 5,36)
//   · el GEX, condicionado a la IV, se queda en z = 1,41
//
// Y eso abre una puerta que un filtro de régimen no abre: si el problema es que 25 puntos son
// pocas sigmas los días de IV alta, **no hay que saltarse el día: hay que mover el strike**.
// Se sigue operando todos los días y se cobra menos prima esos días, en vez de cobrar cero.
//
// Aquí se miden las dos salidas, con precios reales de la cadena de las 11:00:
//   A) SALTARSE el día cuando 25 pts < k·σ            (filtro; pierde ingreso)
//   B) MOVER el strike a ±k·σ en vez de ±25 puntos    (adaptación; conserva el día)
//   C) las dos a la vez
//
// σ = spot × IV_ATM_real(11:00) × √(5h/año). Observable a las 11:00. Sin modelo de precio:
// el precio de cada pata es SIEMPRE el bid/ask del fichero.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";

const dias = JSON.parse(readFileSync("scripts/cola-cadena11.json", "utf8"));
const COMM = 0.03, ALA = 50, T = 5 / 24 / 365;

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pctil = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b[0] - o) < Math.abs(a[0] - o) ? b : a));

// ── construir el cóndor de un día con una distancia dada, precios REALES ──────────────────
function condor(d, distPts, ala = ALA) {
  const { spot, cierre, C, P } = d;
  if (!C.length || !P.length) return null;
  const cC = cerca(C, spot + distPts), pC = cerca(P, spot - distPts);
  const cL = cerca(C, cC[0] + ala), pL = cerca(P, pC[0] - ala);
  if (cL[0] <= cC[0] || pL[0] >= pC[0]) return null;
  const credito = cC[1] + pC[1] - cL[2] - pL[2];          // bid de lo vendido, ask de lo comprado
  if (!(credito > 0)) return null;
  const pl = (credito
    - Math.min(Math.max(cierre - cC[0], 0), cL[0] - cC[0])
    - Math.min(Math.max(pC[0] - cierre, 0), pC[0] - pL[0])) * 100 - 8 * COMM;
  const col = (Math.max(cL[0] - cC[0], pC[0] - pL[0]) - credito) * 100;
  return { pl, credito, col, kC: cC[0], kP: pC[0], anchoReal: Math.min(cC[0] - spot, spot - pC[0]) };
}

// ── σ del día, con la IV real del dinero a las 11:00 ──────────────────────────────────────
for (const d of dias) {
  const uC = d.C.filter((r) => r[3] > 0.02 && r[3] < 3), uP = d.P.filter((r) => r[3] > 0.02 && r[3] < 3);
  if (!uC.length || !uP.length) { d.sigma = null; continue; }
  const iv = (cerca(uC, d.spot)[3] + cerca(uP, d.spot)[3]) / 2;
  d.sigma = d.spot * iv * Math.sqrt(T);
  d.ivATM = iv;
}
const utiles = dias.filter((d) => d.sigma > 0);
console.log(`${utiles.length} de ${dias.length} días con σ calculable de la IV real`);
{
  const s = utiles.map((d) => 25 / d.sigma).sort((a, b) => a - b);
  console.log(`25 puntos, medidos en sigmas: p5=${s[Math.floor(s.length*0.05)].toFixed(2)}σ · p50=${s[s.length>>1].toFixed(2)}σ · p95=${s[Math.floor(s.length*0.95)].toFixed(2)}σ`);
  console.log(`  → el MISMO cóndor de 25 puntos es una apuesta muy distinta según el día.\n`);
}

const ANIOS = 653 / 252;
function resumen(ops) {
  const pls = ops.map((o) => o.pl), total = pls.reduce((s, x) => s + x, 0);
  let pico = 0, acum = 0, peor = 0;
  for (const o of ops) { acum += o.pl; pico = Math.max(pico, acum); peor = Math.min(peor, acum - pico); }
  return { n: ops.length, total, porAnio: total / ANIOS, media: total / ops.length,
    peor: Math.min(...pls), p1: pctil(pls, 0.01), p5: pctil(pls, 0.05), racha: peor,
    p2k: pls.filter((x) => x < -2000).length, p4k: pls.filter((x) => x < -4000).length,
    ac: pls.filter((x) => x > 0).length / pls.length,
    colMax: Math.max(...ops.map((o) => o.col)) };
}
const linea = (nom, R, base) => `| ${nom} | ${R.n} | ${eur(R.porAnio)} | ${base ? (R.porAnio / base.porAnio * 100).toFixed(0) + "%" : "100%"} | ${(R.ac * 100).toFixed(1)}% | ${eur(R.peor)} | ${eur(R.p1)} | ${eur(R.p5)} | ${eur(R.racha)} | ${R.p2k} | ${R.p4k} | ${eur(R.colMax)} |`;
const CAB = "| variante | días | $/año | % ingreso | acierto | PEOR DÍA | p1 | p5 | PEOR RACHA | días<−2k | días<−4k | colateral máx |";
const SEP = "|---|---|---|---|---|---|---|---|---|---|---|---|";

// ── BASE ───────────────────────────────────────────────────────────────────────────────────
const base = [];
for (const d of utiles) { const c = condor(d, 25); if (c) base.push({ ...c, fecha: d.fecha, d }); }
const RB = resumen(base);
console.log(`═══ LÍNEA BASE — ±25 puntos fijos, todos los días ═══\n`);
console.log(CAB); console.log(SEP); console.log(linea("±25 pts (la de hoy)", RB, RB));

// ── A · FILTRO: saltarse el día si 25 pts < k·σ ────────────────────────────────────────────
console.log(`\n\n═══ A · SALTARSE EL DÍA cuando 25 puntos son menos de k sigmas ═══`);
console.log(`Umbral ABSOLUTO y mecánico, sin ajustar a la muestra. Se enseña la curva entera.\n`);
console.log(CAB); console.log(SEP);
const filtroA = [];
for (const k of [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3]) {
  const ops = base.filter((o) => 25 / o.d.sigma >= k);
  if (ops.length < 50) continue;
  const R = resumen(ops); filtroA.push({ k, R });
  console.log(linea(`saltar si 25pts < ${k.toFixed(1)}σ`, R, RB));
}

// ── B · ADAPTAR EL STRIKE: vender a ±k·σ ──────────────────────────────────────────────────
console.log(`\n\n═══ B · MOVER EL STRIKE — vender a ±k·σ en vez de ±25 puntos fijos ═══`);
console.log(`Se opera TODOS los días. Alas de 50 puntos → mismo colateral, misma orden de Robinhood.\n`);
console.log(CAB); console.log(SEP);
const adapt = {};
for (const k of [0.8, 1.0, 1.2, 1.4, 1.45, 1.6, 1.8, 2.0]) {
  const ops = [];
  for (const d of utiles) { const c = condor(d, k * d.sigma); if (c) ops.push({ ...c, fecha: d.fecha, d }); }
  if (ops.length < 100) continue;
  const R = resumen(ops); adapt[k] = ops;
  console.log(linea(`±${k.toFixed(2)}σ`, R, RB));
}

// ── B2 · suelo: nunca menos de 25 puntos (para no estrangular el crédito en días calmos) ───
console.log(`\n\n═══ B2 · ±k·σ pero NUNCA menos de 25 puntos (suelo) ═══\n`);
console.log(CAB); console.log(SEP);
for (const k of [1.0, 1.2, 1.4, 1.45, 1.6, 1.8]) {
  const ops = [];
  for (const d of utiles) { const c = condor(d, Math.max(25, k * d.sigma)); if (c) ops.push({ ...c, fecha: d.fecha, d }); }
  const R = resumen(ops);
  console.log(linea(`±max(25 pts, ${k.toFixed(2)}σ)`, R, RB));
}

// ── C · las dos ────────────────────────────────────────────────────────────────────────────
console.log(`\n\n═══ C · MOVER EL STRIKE **y** saltarse los días más extremos ═══\n`);
console.log(CAB); console.log(SEP);
for (const k of [1.2, 1.45]) {
  for (const corte of [0.7, 0.8, 0.9]) {
    const ops = [];
    for (const d of utiles) {
      if (25 / d.sigma < corte) continue;
      const c = condor(d, Math.max(25, k * d.sigma)); if (c) ops.push({ ...c, fecha: d.fecha, d });
    }
    const R = resumen(ops);
    console.log(linea(`±max(25, ${k}σ) + saltar <${corte}σ`, R, RB));
  }
}

// ── ESTABILIDAD: los tres tercios del período, para la mejor de cada familia ───────────────
console.log(`\n\n═══ ESTABILIDAD — los tres años, por separado ═══\n`);
const variantes = [
  ["±25 pts (base)", base],
  ["saltar si 25pts < 0,9σ", base.filter((o) => 25 / o.d.sigma >= 0.9)],
  ["±1,45σ", adapt[1.45] ?? []],
  ["±max(25 pts, 1,45σ)", utiles.map((d) => { const c = condor(d, Math.max(25, 1.45 * d.sigma)); return c && { ...c, fecha: d.fecha, d }; }).filter(Boolean)],
];
console.log("| variante | 2024 $/año | 2025 $/año | 2026 $/año | peor día 24 | 25 | 26 | días<−2k 24/25/26 |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [nom, ops] of variantes) {
  if (!ops.length) continue;
  const por = ["2024", "2025", "2026"].map((a) => {
    const g = ops.filter((o) => o.fecha.startsWith(a));
    if (!g.length) return null;
    const pls = g.map((x) => x.pl);
    return { anio: g.reduce((s, x) => s + x.pl, 0) / (g.length / 252), peor: Math.min(...pls), m2k: pls.filter((x) => x < -2000).length };
  });
  console.log(`| ${nom} | ${por.map((p) => (p ? eur(p.anio) : "—")).join(" | ")} | ${por.map((p) => (p ? eur(p.peor) : "—")).join(" | ")} | ${por.map((p) => (p ? p.m2k : "—")).join("/")} |`);
}

// ── ¿y el GEX ENCIMA de la adaptación? el último cartucho ──────────────────────────────────
console.log(`\n\n═══ ¿APORTA EL GEX ENCIMA DE LA ADAPTACIÓN? ═══`);
console.log(`Si el problema era la IV y ya está corregido moviendo el strike, ¿queda cola que el GEX explique?\n`);
const gex = new Map(JSON.parse(readFileSync("scripts/cola-gex-filas.json", "utf8")).map((r) => [r.fecha, r]));
const adaptado = utiles.map((d) => { const c = condor(d, Math.max(25, 1.45 * d.sigma)); return c && { ...c, fecha: d.fecha, g: gex.get(d.fecha) }; }).filter((x) => x && x.g);
console.log("| señal GEX | T1 días<−2k | T2 | T3 | peor día T1 | peor día T3 | media T1 | media T3 |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [id, f] of [["gexNetSuave", (r) => r.g.gexNetSuave], ["zonaSobreTot", (r) => r.g.zonaSobreTotal], ["gexRatio", (r) => r.g.gexRatio], ["distFlip", (r) => r.g.distFlip]]) {
  const v = adaptado.filter((r) => f(r) != null && isFinite(f(r)));
  const o = [...v].sort((a, b) => f(a) - f(b)); const k = Math.floor(o.length / 3);
  const T = [o.slice(0, k), o.slice(k, o.length - k), o.slice(-k)];
  const c = T.map((g) => g.filter((x) => x.pl < -2000).length);
  const m = T.map((g) => g.reduce((s, x) => s + x.pl, 0) / g.length);
  const p = T.map((g) => Math.min(...g.map((x) => x.pl)));
  console.log(`| ${id} | ${c[0]} | ${c[1]} | ${c[2]} | ${eur(p[0])} | ${eur(p[2])} | ${eur(m[0])} | ${eur(m[2])} |`);
}
