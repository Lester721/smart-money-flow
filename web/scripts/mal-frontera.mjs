// LA FRONTERA · dónde está el punto que la CAJA de Lester aguanta, y qué queda de ingreso ahí.
//
// AVISO DE MÉTODO, escrito antes de correr: minimizar ES5 a secas es un objetivo DEGENERADO —
// siempre elige "operar lo más lejos posible", porque no operar tiene ES5 = 0. Por eso aquí el
// objetivo NO es minimizar el riesgo: es la MÉTRICA QUE DECIDE del encargo, dólares de ingreso
// perdidos por dólar de caída eliminado, con la restricción de que el ingreso siga siendo
// positivo en el período donde se ajusta. Eso sí se puede ganar o perder.
//
// Y se añade lo que faltaba en todas las cuentas anteriores: EL INTERÉS DE MARGEN. Con $7.977
// de efectivo, una racha de $30.000 se financia al 5% y eso son $1.500 al año que nadie contó.

import { readFileSync } from "node:fs";
const COMM = 0.03, EFECTIVO = 7977, PODER = 73874, MARGEN = 0.05, CUENTA = 56389;
const dias = JSON.parse(readFileSync("scripts/mal-dias.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const CAD = JSON.parse(readFileSync("scripts/mal-cadenas.json", "utf8"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const n2 = (x) => (x == null || !isFinite(x) ? "—" : x.toFixed(2));
for (const d of dias) { d.ano = d.fecha.slice(0, 4); d.per = d.fecha < "2024-01-01" ? "2022-23" : "2024-26"; }

const cercaK = (ch, o) => ch.reduce((a, b) => (Math.abs(b[0] - o) < Math.abs(a[0] - o) ? b : a));
function operar(d, modo, ala) {
  const c = CAD[d.fecha]; if (!c) return null;
  let objC, objP;
  if (modo.tipo === "pts") { objC = d.sp11 + modo.sep; objP = d.sp11 - modo.sep; }
  else { if (!(d.sigma > 0)) return null; objC = d.sp11 + modo.k * d.sigma; objP = d.sp11 - modo.k * d.sigma; }
  const cC = cercaK(c.C, objC), pC = cercaK(c.P, objP);
  const cL = cercaK(c.C, cC[0] + ala), pL = cercaK(c.P, pC[0] - ala);
  if (cL[0] <= cC[0] || pL[0] >= pC[0]) return null;
  const aC = cL[0] - cC[0], aP = pC[0] - pL[0];
  const cred = cC[1] + pC[1] - cL[2] - pL[2];
  if (!(cred > 0)) return null;
  const S = d.cierre;
  const penC = Math.min(Math.max(S - cC[0], 0), aC), penP = Math.min(Math.max(pC[0] - S, 0), aP);
  return { fecha: d.fecha, per: d.per, ano: d.ano, pl: (cred - penC - penP) * 100 - 8 * COMM,
           credito: cred * 100, colateral: Math.max(aC, aP) * 100 - cred * 100,
           tope: (penC >= aC - 0.001 || penP >= aP - 0.001) ? 1 : 0 };
}
/** Caja día a día CON interés de margen sobre el saldo negativo. */
function cajaConInteres(ops, contratos, efectivo) {
  let c = efectivo, min = efectivo, minF = "", interes = 0, diasNeg = 0;
  for (const o of ops) {
    if (c < 0) { const i = -c * MARGEN / 252; interes += i; c -= i; }
    c += o.pl * contratos;
    if (c < 0) diasNeg++;
    if (c < min) { min = c; minF = o.fecha; }
  }
  return { final: c, min, minF, interes, diasNeg };
}
function met(ops, anos) {
  if (!ops.length) return null;
  const pl = ops.map((o) => o.pl), tot = pl.reduce((a, b) => a + b, 0);
  const s = [...pl].sort((a, b) => a - b), k5 = Math.max(1, Math.floor(s.length * 0.05));
  let acc = 0, pico = 0, dd = 0;
  for (const p of pl) { acc += p; if (acc > pico) pico = acc; if (acc - pico < dd) dd = acc - pico; }
  const cj = cajaConInteres(ops, 1, EFECTIVO);
  return { n: pl.length, tot, alAno: tot / anos, peor: s[0], p1: pct(pl, 0.01), p5: pct(pl, 0.05),
           es5: Math.abs(media(s.slice(0, k5))), dd, tope: ops.reduce((a, o) => a + o.tope, 0),
           acierto: pl.filter((x) => x > 0).length / pl.length, colMax: Math.max(...ops.map((o) => o.colateral)),
           cajaMin: cj.min, interes: cj.interes, netoAno: (tot - cj.interes) / anos };
}

// ── la rejilla, ahora ancha de verdad ────────────────────────────────────────
const KS = [0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00, 1.20, 1.40, 1.60];
const ALAS = [20, 30, 50];
const V = new Map();
V.set("BASE ±25pts/50", dias.map((d) => operar(d, { tipo: "pts", sep: 25 }, 50)).filter(Boolean));
for (const ala of ALAS) for (const k of KS) V.set(`±${k.toFixed(2)}s/${ala}`, dias.map((d) => operar(d, { tipo: "sig", k }, ala)).filter(Boolean));
const parte = (ops, p) => ops.filter((o) => o.per === p);
const anosT = dias.length / 252, anosA = dias.filter((d) => d.per === "2022-23").length / 252, anosB = dias.filter((d) => d.per === "2024-26").length / 252;

console.log(`\n====== 13 · LA FRONTERA COMPLETA · 1 contrato, con interés de margen al 5% ======\n`);
console.log("| variante | $/año bruto | interés pagado | $/año NETO | peor día | p5 | peor racha | caja mínima | TOPE | % ganados | colateral |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const [nom, ops] of V) {
  const m = met(ops, anosT);
  console.log(`| ${nom} | ${eur(m.alAno)} | ${eur(m.interes)} | ${eur(m.netoAno)} | ${eur(m.peor)} | ${eur(m.p5)} | ${eur(m.dd)} | ${eur(m.cajaMin)} | ${m.tope} | ${(m.acierto * 100).toFixed(0)}% | ${eur(m.colMax)} |`);
}

console.log(`\n====== 14 · LA MISMA FRONTERA, PERO PARTIDA · ¿el orden se mantiene? ======\n`);
console.log("Si el mando del riesgo es estable, el ORDEN de las variantes por caída tiene que ser el");
console.log("mismo en los dos períodos. Si el ingreso fuera estable, el orden por $/año también.\n");
const filas = [];
for (const [nom, ops] of V) {
  const a = met(parte(ops, "2022-23"), anosA), b = met(parte(ops, "2024-26"), anosB);
  if (a && b) filas.push({ nom, a, b });
}
const rank = (arr, f) => { const o = [...arr].sort((x, y) => f(y) - f(x)); const m = new Map(); o.forEach((v, i) => m.set(v.nom, i + 1)); return m; };
const rDDa = rank(filas, (v) => v.a.dd), rDDb = rank(filas, (v) => v.b.dd);
const rIna = rank(filas, (v) => v.a.alAno), rInb = rank(filas, (v) => v.b.alAno);
console.log("| variante | 22-23 $/año | 24-26 $/año | 22-23 racha | 24-26 racha | puesto racha 22-23 | puesto racha 24-26 | puesto ingreso 22-23 | puesto ingreso 24-26 |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const v of filas) console.log(`| ${v.nom} | ${eur(v.a.alAno)} | ${eur(v.b.alAno)} | ${eur(v.a.dd)} | ${eur(v.b.dd)} | ${rDDa.get(v.nom)} | ${rDDb.get(v.nom)} | ${rIna.get(v.nom)} | ${rInb.get(v.nom)} |`);
function spearman(m1, m2, noms) {
  const n = noms.length; let s = 0;
  for (const x of noms) s += (m1.get(x) - m2.get(x)) ** 2;
  return 1 - (6 * s) / (n * (n * n - 1));
}
const noms = filas.map((v) => v.nom);
console.log(`\n  correlación de ORDEN entre los dos períodos:`);
console.log(`    por PEOR RACHA  : ${n2(spearman(rDDa, rDDb, noms))}   ← el mando del riesgo`);
console.log(`    por INGRESO     : ${n2(spearman(rIna, rInb, noms))}   ← el mando del dinero`);

console.log(`\n====== 15 · LA REGLA DE HIERRO CON LA MÉTRICA QUE DECIDE ======\n`);
console.log("Objetivo NO degenerado: entre las variantes que dejan el ingreso POSITIVO en el período");
console.log("de ajuste, se elige la que más caída quita por cada dólar de ingreso sacrificado.\n");
for (const [ajP, prP, aAj, aPr] of [["2022-23", "2024-26", anosA, anosB], ["2024-26", "2022-23", anosB, anosA]]) {
  const bAj = met(parte(V.get("BASE ±25pts/50"), ajP), aAj);
  const bPr = met(parte(V.get("BASE ±25pts/50"), prP), aPr);
  let mejor = null, positivas = 0;
  for (const [nom, ops] of V) {
    if (nom.startsWith("BASE")) continue;
    const g = parte(ops, ajP); if (g.length < 200) continue;
    const m = met(g, aAj);
    if (m.alAno <= 0) continue;
    positivas++;
    const dIng = m.alAno - bAj.alAno, dDD = m.dd - bAj.dd;
    if (dDD <= 0) continue;                              // no quita caída
    const score = dIng >= 0 ? Infinity : dDD / -dIng;    // $ de caída quitada por cada $ de ingreso
    if (!mejor || score > mejor.score) mejor = { nom, ops, m, score };
  }
  console.log(`── ajustado en ${ajP} · base ${eur(bAj.alAno)}/año, racha ${eur(bAj.dd)} ──`);
  if (!mejor) {
    console.log(`   NINGUNA variante deja el ingreso positivo Y quita caída en ${ajP}.`);
    console.log(`   (variantes con ingreso positivo en ${ajP}: ${positivas} de ${V.size - 1})`);
    console.log(`   → no hay nada que llevar a ${prP}. Y esto YA es el resultado: en un período la`);
    console.log(`     elección no existe.\n`);
    continue;
  }
  const mPr = met(parte(mejor.ops, prP), aPr);
  const dIng = mPr.alAno - bPr.alAno, dDD = mPr.dd - bPr.dd;
  console.log(`   elegido: ${mejor.nom} · en ${ajP} da ${eur(mejor.m.alAno)}/año y racha ${eur(mejor.m.dd)}`);
  console.log(`   PROBADO EN ${prP}: base ${eur(bPr.alAno)}/año racha ${eur(bPr.dd)} → regla ${eur(mPr.alAno)}/año racha ${eur(mPr.dd)}`);
  console.log(`   ingreso ${dIng >= 0 ? "+" : ""}${eur(dIng)}/año · caída ${dDD > 0 ? "mejora " : "empeora "}${eur(Math.abs(dDD))}`);
  console.log(`   MÉTRICA QUE DECIDE: ${dDD > 0 ? (dIng >= 0 ? "0 — gratis" : n2(-dIng / dDD) + " $/año perdidos por cada $ de caída quitado") : "no aplica, no quita caída"}\n`);
}

console.log(`\n====== 16 · EL MECANISMO · el cóndor es una apuesta a que la RV sea menor que la IV ======\n`);
console.log("El cóndor a ±25 gana si el índice cierra dentro de ±25 del precio de las 11:00. El");
console.log("mercado ya cobra por eso: el crédito ES el precio de esa probabilidad. Sólo se gana si");
console.log("el índice se queda dentro MÁS veces de las que el crédito daba por hechas.\n");
const base = V.get("BASE ±25pts/50");
const porFecha = new Map(base.map((o) => [o.fecha, o]));
console.log("| año | IV del dinero a las 11:00 | movimiento real de la tarde en sigmas (media) | % de días DENTRO de ±25 | crédito medio / riesgo | resultado |");
console.log("|---|---|---|---|---|---|");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const g = dias.filter((d) => d.ano === a && porFecha.has(d.fecha));
  const ivm = media(g.map((d) => d.iv * 100));
  const rs = media(g.map((d) => Math.abs(d.cierre - d.sp11) / d.sigma));
  const dentro = g.filter((d) => Math.abs(d.cierre - d.sp11) <= 25).length / g.length * 100;
  const ops = g.map((d) => porFecha.get(d.fecha));
  const ratio = media(ops.map((o) => o.credito / (o.credito + o.colateral)));
  const tot = ops.reduce((s, o) => s + o.pl, 0);
  console.log(`| ${a} | ${n2(ivm)}% | ${n2(rs)} sigmas | ${dentro.toFixed(0)}% | ${(ratio * 100).toFixed(1)}% | ${eur(tot)} |`);
}
console.log("\n  Y el mismo cuadro por SEMESTRE, que es donde se ve el giro:\n");
console.log("| semestre | mov. real de tarde en sigmas | % dentro de ±25 | crédito/riesgo | P&L |");
console.log("|---|---|---|---|---|");
for (const [nom, i, f] of [["2022 S1","2022-01-01","2022-07-01"],["2022 S2","2022-07-01","2023-01-01"],
                           ["2023 S1","2023-01-01","2023-07-01"],["2023 S2","2023-07-01","2024-01-01"],
                           ["2024 S1","2024-01-01","2024-07-01"],["2024 S2","2024-07-01","2025-01-01"],
                           ["2025 S1","2025-01-01","2025-07-01"],["2025 S2","2025-07-01","2026-01-01"],
                           ["2026 S1","2026-01-01","2026-07-01"],["2026 S2","2026-07-01","2027-01-01"]]) {
  const g = dias.filter((d) => d.fecha >= i && d.fecha < f && porFecha.has(d.fecha));
  if (!g.length) continue;
  const ops = g.map((d) => porFecha.get(d.fecha));
  console.log(`| ${nom} | ${n2(media(g.map((d) => Math.abs(d.cierre - d.sp11) / d.sigma)))} | ${(g.filter((d) => Math.abs(d.cierre - d.sp11) <= 25).length / g.length * 100).toFixed(0)}% | ${(media(ops.map((o) => o.credito / (o.credito + o.colateral))) * 100).toFixed(1)}% | ${eur(ops.reduce((s, o) => s + o.pl, 0))} |`);
}

console.log(`\n====== 17 · ¿QUÉ CABE EN $7.977 DE EFECTIVO? ======\n`);
console.log("Criterio: la caja NUNCA puede quedar en negativo en los 4,5 años (los $7.977 son lo");
console.log("único líquido; el resto son 500 acciones de HOOD que habría que vender para cubrir).\n");
console.log("| variante | contratos que aguantan la caja | $/año NETO a ese tamaño | % de la cuenta | caja mínima | colateral pedido | ¿cabe en el poder de compra? |");
console.log("|---|---|---|---|---|---|---|");
for (const [nom, ops] of V) {
  let max = 0;
  for (let n = 1; n <= 10; n++) { if (cajaConInteres(ops, n, EFECTIVO).min >= 0) max = n; else break; }
  const m = met(ops, anosT);
  const col = m.colMax * Math.max(max, 1);
  const neto = max ? (ops.reduce((s, o) => s + o.pl, 0) * max - cajaConInteres(ops, max, EFECTIVO).interes) / anosT : null;
  console.log(`| ${nom} | ${max === 0 ? "**0 — ni uno**" : max} | ${max ? eur(neto) : "—"} | ${max ? ((neto / CUENTA) * 100).toFixed(2) + "%" : "—"} | ${eur(cajaConInteres(ops, Math.max(max, 1), EFECTIVO).min)} | ${eur(col)} | ${col <= PODER ? "sí" : "NO"} |`);
}
console.log(`\n  Referencia: comprar y aguantar SPY dio ~14%/año = ${eur(CUENTA * 0.14)}/año sobre esta cuenta.`);
