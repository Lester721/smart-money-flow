// SIGMA-CREDITO · FASE 6 — LA LEY DE CONSERVACIÓN, Y LA ÚNICA PALANCA QUE LA MUEVE.
//
// ═══ LO QUE SALIÓ DE LAS FASES 2-5 ════════════════════════════════════════════════════════════
//   pérdida máxima del día = ANCHO − crédito
// Es una identidad, no un resultado de mercado. De ella salen las tres cosas que se midieron:
//   · 13 señales predicen la cola con z hasta 5,97 … pero ninguna la CORTA, porque los días de
//     cola son los que más crédito pagan y quitarlos quita el ingreso con ellos.
//   · alejar los strikes (±0,5σ, ±0,75σ) sube el acierto al 83-94% y baja el p5 … pero EMPEORA
//     el p1 y el peor día, porque el crédito se hunde y el techo sube hacia los $5.000 enteros.
//   · el borde izquierdo de la cola NO se mueve con ninguna señal. Lo fija el ANCHO.
//
// Queda una sola palanca sin probar en todo el proyecto: **el ancho de las alas**. Si el ancho
// baja de 50 a 25 puntos, el riesgo máximo baja de $5.000 a $2.500 por definición. La pregunta
// que decide es si el ingreso baja MENOS que proporcionalmente.
//
// ═══ LA COMPARACIÓN JUSTA ═════════════════════════════════════════════════════════════════════
// Un cóndor de 25 puntos de ala retiene $2.500 de colateral, la mitad. Compararlo por contrato
// contra el de 50 sería comparar media posición con una entera. Se dan las DOS columnas:
// por contrato, y escalado al MISMO colateral de $5.000 (que es el que Lester ya sabe que
// Robinhood retiene por cóndor). El escalado es un múltiplo exacto, no un modelo.
//
// PRUEBAS: 4 anchos declarados sobre las 142 anteriores → 146.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";
import { media, pct, eur, drawdown } from "./anatomia3-lib.mjs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", SEP = 25, COMM = 0.03;
const ALAS = [15, 20, 25, 30];                    // DECLARADOS. El de 50 es el control.
const PRUEBAS = 142 + ALAS.length;
const LISTON = listonT(PRUEBAS);
const CACHE = "scripts/cola-sigcred-alas-cache.json";

const base = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const ANOS = (new Date(base[base.length - 1].fecha) - new Date(base[0].fecha)) / (365.25 * 864e5);

function leerHora(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU] = idx;
  const out = []; let spot = 0;
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    if (String(c[iT]).slice(11, 16) !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]), sp = Number(c[iU]);
    if (sp > 0) spot = sp;
    if (K > 0 && bid >= 0 && ask > 0) out.push({ K, bid, ask });
  }
  return out.length && spot > 0 ? { filas: out, spot } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

let series;
if (existsSync(CACHE)) { series = JSON.parse(readFileSync(CACHE, "utf8")); console.log("## series leídas de caché"); }
else {
  console.log(`## releyendo ${base.length} días para ${ALAS.length + 1} anchos de ala…`);
  series = {};
  for (const a of [50, ...ALAS]) series["a" + a] = [];
  for (let i = 0; i < base.length; i++) {
    const b = base[i];
    if (i % 150 === 0) console.log(`   ${i}/${base.length} · ${b.fecha}`);
    const C = leerHora(b.fecha, "C"), P = leerHora(b.fecha, "P");
    if (!C || !P) continue;
    const sp11 = C.spot, cierre = b.cierre;
    if (Math.abs(sp11 - b.sp11) > 0.01) throw new Error(`spot descuadra en ${b.fecha}`);
    const sc = cerca(C.filas, sp11 + SEP), sp = cerca(P.filas, sp11 - SEP);
    for (const ala of [50, ...ALAS]) {
      const lc = cerca(C.filas, sc.K + ala), lp = cerca(P.filas, sp.K - ala);
      if (lc.K <= sc.K || lp.K >= sp.K) continue;
      const anchoC = lc.K - sc.K, anchoP = sp.K - lp.K;
      const cred = sc.bid + sp.bid - lc.ask - lp.ask;
      if (!(cred > 0)) continue;
      const pl = (cred - Math.min(Math.max(cierre - sc.K, 0), anchoC)
                       - Math.min(Math.max(sp.K - cierre, 0), anchoP)) * 100 - 8 * COMM;
      series["a" + ala].push({ fecha: b.fecha, pl, credito: cred * 100,
                               riesgo: Math.max(anchoC, anchoP) * 100 - cred * 100 });
    }
  }
  writeFileSync(CACHE, JSON.stringify(series), "utf8");
}

// ── GUARDIÁN: el ancho 50 tiene que reproducir la línea base ───────────────
const porF = new Map(base.map((f) => [f.fecha, f]));
let desc = 0;
for (const r of series.a50) { const b = porF.get(r.fecha); if (!b || Math.abs(r.pl - b.pl) > 0.01) desc++; }
if (desc) throw new Error(`el control de alas 50 NO reproduce regimen-filas.json en ${desc} días. Se para.`);
console.log(`\n  control alas 50: reproduce los ${series.a50.length} días exactamente ✔`);
radiografia(series.a50.concat(series.a25), ["pl", "credito", "riesgo"], "series por ancho", { maxCeros: 0.2, cerosLegitimos: ["pl"] });

function foto(pls) {
  const tot = pls.reduce((a, b) => a + b, 0);
  return { n: pls.length, total: tot, alAno: tot / ANOS, media: media(pls), peor: Math.min(...pls),
           p1: pct(pls, 0.01), p5: pct(pls, 0.05), dd: drawdown(pls),
           acierto: pls.filter((x) => x > 0).length / pls.length };
}
const B = foto(series.a50.map((r) => r.pl));
const COLATERAL = 5000;

console.log("\n" + "═".repeat(122));
console.log("  EL ANCHO DE LAS ALAS · la única palanca que mueve el borde izquierdo de la cola");
console.log(`  ${PRUEBAS} pruebas declaradas · listón |t| ≥ ${LISTON} · mismos días, mismos strikes vendidos (±25), precios reales`);
console.log("═".repeat(122));

console.log("\n## POR CONTRATO\n");
console.log("| ala | días | colateral | crédito medio | $/año | acierto | peor día | p5 | p1 | PEOR RACHA | Calmar |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const resu = [];
for (const ala of [50, ...ALAS].sort((a, b) => b - a)) {
  const s = series["a" + ala];
  if (!s || !s.length) continue;
  const f = foto(s.map((r) => r.pl));
  const col = ala * 100;
  resu.push({ ala, f, s, col });
  console.log(`| ${ala === 50 ? "**50** (base)" : ala} pts | ${f.n} | $${col.toLocaleString("es-ES")} | ${eur(media(s.map((r) => r.credito)))} | ${eur(f.alAno)} | ${(f.acierto * 100).toFixed(1)}% | ${eur(f.peor)} | ${eur(f.p5)} | ${eur(f.p1)} | ${eur(f.dd)} | ${(f.alAno / -f.dd).toFixed(2)} |`);
}

console.log(`\n## ESCALADO AL MISMO COLATERAL DE $${COLATERAL.toLocaleString("es-ES")} — la comparación que decide\n`);
console.log("| ala | contratos | $/año | peor día | p5 | p1 | PEOR RACHA | Calmar | $/año conservados por cada $1.000 de racha eliminada |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const r of resu) {
  const m = COLATERAL / r.col;                              // múltiplo exacto de contratos
  const pls = r.s.map((x) => x.pl * m);
  const f = foto(pls);
  const ddElim = B.dd - f.dd;                               // + = elimina racha
  const ratio = ddElim > 0 ? (f.alAno / ddElim) * 1000 : NaN;
  console.log(`| ${r.ala} pts | ×${m} | ${eur(f.alAno)} | ${eur(f.peor)} | ${eur(f.p5)} | ${eur(f.p1)} | ${eur(f.dd)} | **${(f.alAno / -f.dd).toFixed(2)}** | ${isFinite(ratio) ? "$" + Math.round(ratio).toLocaleString("es-ES") : "no elimina racha"} |`);
  r.esc = f; r.m = m;
}

console.log("\n## POR AÑOS, ESCALADO A $5.000 DE COLATERAL\n");
const ANOS_L = [...new Set(base.map((f) => f.fecha.slice(0, 4)))].sort();
console.log("| ala | " + ANOS_L.map((y) => `${y} $/año`).join(" | ") + " | " + ANOS_L.map((y) => `${y} racha`).join(" | ") + " |");
console.log("|---|" + ANOS_L.map(() => "---").join("|") + "|" + ANOS_L.map(() => "---").join("|") + "|");
for (const r of resu) {
  const ing = [], dds = [];
  for (const y of ANOS_L) {
    const v = r.s.filter((x) => x.fecha.slice(0, 4) === y).map((x) => x.pl * r.m);
    ing.push(v.length ? eur(v.reduce((a, b) => a + b, 0) / (v.length / 252)) : "—");
    dds.push(v.length ? eur(drawdown(v)) : "—");
  }
  console.log(`| ${r.ala} pts | ${ing.join(" | ")} | ${dds.join(" | ")} |`);
}

console.log("\n## EL MISMO DÍA, LOS DOS ANCHOS — emparejada contra el ala de 50\n");
console.log("| ala | días | dif. media por contrato | t emparejada | dif. media a igual colateral | t emparejada |");
console.log("|---|---|---|---|---|---|");
const mapaB = new Map(series.a50.map((r) => [r.fecha, r.pl]));
for (const r of resu.filter((x) => x.ala !== 50)) {
  const par = r.s.filter((x) => mapaB.has(x.fecha));
  const tPar = (arr) => { const m = media(arr), s = Math.sqrt(arr.reduce((a, x) => a + (x - m) ** 2, 0) / (arr.length - 1)); return { m, t: m / (s / Math.sqrt(arr.length)) }; };
  const d1 = tPar(par.map((x) => x.pl - mapaB.get(x.fecha)));
  const d2 = tPar(par.map((x) => x.pl * r.m - mapaB.get(x.fecha)));
  console.log(`| ${r.ala} pts | ${par.length} | ${eur(d1.m)} | ${d1.t.toFixed(2)} | ${eur(d2.m)} | **${d2.t.toFixed(2)}** |`);
}

console.log("\n" + "═".repeat(122));
console.log(`  BASE (ala 50, 1 contrato, $5.000 de colateral): ${eur(B.alAno)}/año · peor día ${eur(B.peor)} · peor racha ${eur(B.dd)} · Calmar ${(B.alAno / -B.dd).toFixed(2)}`);
console.log("═".repeat(122));

writeFileSync("scripts/cola-sigcred-alas-salida.json", JSON.stringify({
  liston: LISTON, pruebas: PRUEBAS, base: B, colateral: COLATERAL,
  anchos: resu.map((r) => ({ ala: r.ala, colateral: r.col, contratos: r.m, porContrato: r.f, escalado: r.esc })),
}, null, 2), "utf8");
console.log("\n  detalle en scripts/cola-sigcred-alas-salida.json");
