// ═══════════════════════════════════════════════════════════════════════════════════════════
// RESPETAR · GIRO (5) — LA CRIBA FINAL del único cabo que quedó vivo.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/gex-giro-medir5.mjs
//
// Lo que quedó vivo de la pasada 4: con la lente `gam` (gamma de 0DTE con la T REAL), comprar el
// straddle ATM al ASK real en la barra en que el precio ROMPE el punto de giro —en cualquiera de
// los dos sentidos— da +$16.960/año, positivo en las dos mitades ($20.408 y $14.337), percentil
// 100 contra un nivel al azar a la misma distancia y 99,4 contra comprar a esa misma hora sin
// rotura. Y comprar a hora fija todos los días PIERDE a las siete horas probadas. O sea: hay una
// diferencia de verdad entre "el día que rompe el giro" y "un día cualquiera".
//
// Pero t = 2,01 contra un listón de 3,32 — y la MISMA idea con la otra lente (`gamD`, la que
// pintan los paneles) da +$1.199/año y t = 0,15. Dos lentes del mismo nivel que se contradicen.
//
// Aquí se le pasan las cribas que matan a la mayoría:
//   1. TRES TERCIOS, no dos mitades  (dos mitades es la partición más fácil de pasar por azar)
//   2. AÑO POR AÑO                    (¿vive de un año solo?)
//   3. SIN LOS MEJORES DÍAS           (¿son cinco lunes o son 215 operaciones?)
//   4. LA MEDIANA, no la media        (una cola gorda no es un negocio)
//   5. EL TAMAÑO QUE LA CUENTA AGUANTA (la peor racha, en dólares de verdad)
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from "node:fs";

const NIV = "scripts/gex-niveles.json";
const CAM = "scripts/gex-giro-camino.json";
const SALIDA = "scripts/gex-giro-resultado5.json";
const CUENTA = 56389, EFECTIVO = 7977, VENT = 12;
const PRUEBAS_DECLARADAS = 56;

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return NaN; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const sd = (v) => Math.sqrt(varianza(v));
const pct = (v, p) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };
const mediana = (v) => pct(v, 50);
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
function tUna(v) { if (v.length < 3) return NaN; const s = sd(v) / Math.sqrt(v.length); return s > 0 ? media(v) / s : NaN; }
function listonT(p0) { const p = 0.05 / p0 / 2, t = Math.sqrt(-2 * Math.log(p)); return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100; }
const LISTON = listonT(PRUEBAS_DECLARADAS);
function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }

const J = JSON.parse(readFileSync(NIV, "utf8"));
const CAMINO = JSON.parse(readFileSync(CAM, "utf8"));

function primerCruce(px, nivel) {
  if (!(nivel > 0)) return null;
  const arriba0 = px[0] > nivel;
  for (let j = 1; j < px.length; j++) {
    const arriba = px[j] > nivel;
    if (arriba === arriba0) continue;
    if (j < VENT || j + VENT >= px.length) return null;
    return { j, baja: arriba0 };
  }
  return null;
}
function ops(L) {
  const O = [];
  for (const f of J.filas) {
    const c = CAMINO[f.fecha];
    if (!c) continue;
    const cr = primerCruce(c.px, f.niveles[L].flip);
    if (!cr || c.sAsk[cr.j] == null) continue;
    const intr = Math.abs(c.px[c.px.length - 1] - c.sK[cr.j]) * 100;
    O.push({ fecha: f.fecha, ano: +f.fecha.slice(0, 4), baja: cr.baja, hora: c.h[cr.j], coste: c.sAsk[cr.j] * 100, pl: intr - c.sAsk[cr.j] * 100 });
  }
  return O.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}
const G = ops("gam"), GD = ops("gamD");
exigir(G.length > 200, `sólo ${G.length} operaciones en gam`);

console.log("\n" + "═".repeat(98));
console.log("RESPETAR · GIRO (5) — la criba final: tres tercios, año a año, sin los mejores días");
console.log("═".repeat(98));
console.log(`\n   listón |t| ≥ ${LISTON} · ${G.length} operaciones (gam) · ${GD.length} (gamD) · base $${CUENTA.toLocaleString("es-ES")}`);
const R = { generado: new Date().toISOString(), liston: LISTON, n: G.length, nGamD: GD.length, cuenta: CUENTA };

// ═══ 1 · TRES TERCIOS ══════════════════════════════════════════════════════════════════════
console.log(`\n## 1 · TRES TERCIOS por fecha (no dos mitades: dos mitades es la partición más fácil de colar)`);
console.log(`   ${"lente".padEnd(6)} ${"tercio".padEnd(24)} ${"n".padStart(5)} ${"$/op".padStart(9)} ${"acierto".padStart(8)} ${"t".padStart(7)} ${"mediana $/op".padStart(13)}`);
for (const [Ln, O] of [["gam", G], ["gamD", GD]]) {
  const k = Math.floor(O.length / 3);
  const tercios = [O.slice(0, k), O.slice(k, 2 * k), O.slice(2 * k)];
  const signos = [];
  for (let i = 0; i < 3; i++) {
    const v = tercios[i].map((o) => o.pl);
    signos.push(media(v) > 0);
    R[`tercio|${Ln}|${i + 1}`] = { desde: tercios[i][0].fecha, hasta: tercios[i][tercios[i].length - 1].fecha, n: v.length, porOp: +media(v).toFixed(1), acierto: +((v.filter((x) => x > 0).length / v.length) * 100).toFixed(1), t: +tUna(v).toFixed(2), mediana: +mediana(v).toFixed(1) };
    console.log(`   ${Ln.padEnd(6)} ${(tercios[i][0].fecha + " → " + tercios[i][tercios[i].length - 1].fecha).padEnd(24)} ${String(v.length).padStart(5)} ${eur(media(v)).padStart(9)} ${((v.filter((x) => x > 0).length / v.length) * 100).toFixed(1).padStart(7)}% ${tUna(v).toFixed(2).padStart(7)} ${eur(mediana(v)).padStart(13)}`);
  }
  R[`tercios3de3|${Ln}`] = signos.every(Boolean);
  console.log(`   ${Ln}: tercios positivos ${signos.filter(Boolean).length} de 3${signos.every(Boolean) ? "  ← los TRES" : ""}`);
}

// ═══ 2 · AÑO POR AÑO ═══════════════════════════════════════════════════════════════════════
console.log(`\n## 2 · AÑO POR AÑO — ¿vive de un año solo?`);
console.log(`   ${"lente".padEnd(6)} ${"año".padEnd(6)} ${"n".padStart(5)} ${"$/op".padStart(9)} ${"total".padStart(10)} ${"acierto".padStart(8)} ${"t".padStart(7)}`);
for (const [Ln, O] of [["gam", G], ["gamD", GD]]) {
  const anos = [...new Set(O.map((o) => o.ano))].sort();
  const pos = [];
  for (const a of anos) {
    const v = O.filter((o) => o.ano === a).map((o) => o.pl);
    pos.push(media(v) > 0);
    R[`ano|${Ln}|${a}`] = { n: v.length, porOp: +media(v).toFixed(1), total: Math.round(v.reduce((x, y) => x + y, 0)), acierto: +((v.filter((x) => x > 0).length / v.length) * 100).toFixed(1), t: +tUna(v).toFixed(2) };
    console.log(`   ${Ln.padEnd(6)} ${String(a).padEnd(6)} ${String(v.length).padStart(5)} ${eur(media(v)).padStart(9)} ${eur(v.reduce((x, y) => x + y, 0)).padStart(10)} ${((v.filter((x) => x > 0).length / v.length) * 100).toFixed(1).padStart(7)}% ${tUna(v).toFixed(2).padStart(7)}`);
  }
  R[`anosPositivos|${Ln}`] = `${pos.filter(Boolean).length} de ${pos.length}`;
  console.log(`   ${Ln}: años positivos ${pos.filter(Boolean).length} de ${pos.length}`);
}

// ═══ 3 · SIN LOS MEJORES DÍAS ══════════════════════════════════════════════════════════════
console.log(`\n## 3 · SIN LOS MEJORES DÍAS — ¿son 215 operaciones o son cinco lunes?`);
console.log(`   ${"lente".padEnd(6)} ${"quitando".padEnd(14)} ${"n".padStart(5)} ${"$/op".padStart(9)} ${"$/año".padStart(11)} ${"t".padStart(7)}`);
for (const [Ln, O] of [["gam", G], ["gamD", GD]]) {
  const orden = [...O].sort((a, b) => b.pl - a.pl);
  for (const q of [0, 1, 3, 5, 10]) {
    const v = orden.slice(q).map((o) => o.pl);
    R[`sinMejores|${Ln}|${q}`] = { n: v.length, porOp: +media(v).toFixed(1), alAno: Math.round(v.reduce((a, b) => a + b, 0) / 4.63), t: +tUna(v).toFixed(2) };
    console.log(`   ${Ln.padEnd(6)} ${(q === 0 ? "nada" : `los ${q} mejores`).padEnd(14)} ${String(v.length).padStart(5)} ${eur(media(v)).padStart(9)} ${eur(v.reduce((a, b) => a + b, 0) / 4.63).padStart(11)} ${tUna(v).toFixed(2).padStart(7)}`);
  }
  const orden2 = [...O].sort((a, b) => b.pl - a.pl);
  const top5 = orden2.slice(0, 5).reduce((a, o) => a + o.pl, 0), tot = O.reduce((a, o) => a + o.pl, 0);
  R[`concentracion|${Ln}`] = { top5: Math.round(top5), total: Math.round(tot), pctDelTotal: +((top5 / tot) * 100).toFixed(1) };
  console.log(`   ${Ln}: los 5 mejores días valen ${eur(top5)} de ${eur(tot)} en total = ${((top5 / tot) * 100).toFixed(0)}% de toda la ganancia`);
}

// ═══ 4 · LA MEDIANA y la forma del reparto ═════════════════════════════════════════════════
console.log(`\n## 4 · LA FORMA DEL REPARTO — la media puede ser una cola, la mediana no miente`);
for (const [Ln, O] of [["gam", G], ["gamD", GD]]) {
  const v = O.map((o) => o.pl);
  R[`forma|${Ln}`] = { p05: Math.round(pct(v, 5)), p25: Math.round(pct(v, 25)), p50: Math.round(mediana(v)), p75: Math.round(pct(v, 75)), p95: Math.round(pct(v, 95)), media: Math.round(media(v)) };
  console.log(`   ${Ln.padEnd(6)} p05 ${eur(pct(v, 5)).padStart(8)} · p25 ${eur(pct(v, 25)).padStart(8)} · MEDIANA ${eur(mediana(v)).padStart(8)} · p75 ${eur(pct(v, 75)).padStart(8)} · p95 ${eur(pct(v, 95)).padStart(8)} · media ${eur(media(v))}`);
}

// ═══ 5 · EL TAMAÑO QUE LA CUENTA AGUANTA ═══════════════════════════════════════════════════
console.log(`\n## 5 · EL TAMAÑO REAL — peor racha con los contratos que caben en $${EFECTIVO.toLocaleString("es-ES")} de efectivo`);
console.log(`   ${"lente".padEnd(6)} ${"contratos".padStart(10)} ${"$/año".padStart(11)} ${"% cuenta/año".padStart(13)} ${"peor día".padStart(11)} ${"peor racha".padStart(12)} ${"% cuenta".padStart(9)}`);
for (const [Ln, O] of [["gam", G], ["gamD", GD]]) {
  const costeMed = mediana(O.map((o) => o.coste));
  const n = Math.max(1, Math.floor(EFECTIVO / costeMed));
  let acum = 0, pico = 0, peorRacha = 0;
  for (const o of O) { acum += o.pl * n; pico = Math.max(pico, acum); peorRacha = Math.min(peorRacha, acum - pico); }
  const alAno = (O.reduce((a, o) => a + o.pl, 0) * n) / 4.63;
  const peorDia = Math.min(...O.map((o) => o.pl)) * n;
  R[`tamano|${Ln}`] = { contratos: n, costeMediano: Math.round(costeMed), alAno: Math.round(alAno), pctAno: +((alAno / CUENTA) * 100).toFixed(1), peorDia: Math.round(peorDia), peorRacha: Math.round(peorRacha), pctRacha: +((Math.abs(peorRacha) / CUENTA) * 100).toFixed(1) };
  console.log(`   ${Ln.padEnd(6)} ${String(n).padStart(10)} ${eur(alAno).padStart(11)} ${((alAno / CUENTA) * 100).toFixed(1).padStart(12)}% ${eur(peorDia).padStart(11)} ${eur(peorRacha).padStart(12)} ${((Math.abs(peorRacha) / CUENTA) * 100).toFixed(1).padStart(8)}%`);
}
console.log(`\n   el listón que ya está escrito en este proyecto: comprar SPY y estarse quieto = 14,1%/año = ${eur(CUENTA * 0.141)}/año`);

// ═══ 6 · VEREDICTO ═════════════════════════════════════════════════════════════════════════
console.log(`\n## 6 · VEREDICTO`);
const vG = G.map((o) => o.pl), tG = tUna(vG);
console.log(`   gam  · t = ${tG.toFixed(2)} contra un listón de ${LISTON} → ${Math.abs(tG) >= LISTON ? "PASA" : "NO PASA"}`);
console.log(`   gamD · t = ${tUna(GD.map((o) => o.pl)).toFixed(2)} → la MISMA idea con la otra lente no dice nada`);
console.log(`   tres tercios positivos: gam ${R["tercios3de3|gam"] ? "SÍ" : "NO"} · gamD ${R["tercios3de3|gamD"] ? "SÍ" : "NO"}`);
console.log(`   años positivos: gam ${R["anosPositivos|gam"]} · gamD ${R["anosPositivos|gamD"]}`);
console.log(`   sin los 5 mejores días: gam ${eur(R["sinMejores|gam|5"].alAno)}/año (t=${R["sinMejores|gam|5"].t})`);
R.veredicto = { tGam: +tG.toFixed(2), tGamD: +tUna(GD.map((o) => o.pl)).toFixed(2), pasaListon: Math.abs(tG) >= LISTON };
writeFileSync(SALIDA, JSON.stringify(R, null, 1));
console.log(`\n   escrito: ${SALIDA}\n`);
