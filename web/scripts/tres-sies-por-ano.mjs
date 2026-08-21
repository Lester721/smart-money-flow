// LOS TRES SÍES, AÑO POR AÑO Y EN DÓLARES — la regla que está en forward test, medida entera.
//
// ═══ LA REGLA, TAL Y COMO ESTÁ PRE-REGISTRADA ═══════════════════════════════════════════════
//
// A las 11:00 ET, tres preguntas. Los tres síes o no se opera:
//   1. ¿SPX por encima de su media de 5 sesiones?
//   2. ¿SPX por encima de su media de 50 sesiones?
//   3. ¿el cóndor de ±45 con alas de 50 paga al menos $100 de crédito?
// Sí a las tres → 1 contrato. Se aguanta al cierre, sin gestión.
//
// (`scripts/PRE-REGISTRO-tres-sies.md` la congeló ANTES de este cálculo, con sus cuatro
//  debilidades escritas de antemano. Esto no la cambia: sólo la traduce a dólares.)
//
// ═══ NADA DE MIRAR AL FUTURO ════════════════════════════════════════════════════════════════
//
// · los strikes se eligen con el spot de las 11:00, que es cuando se entraría
// · las medias usan SÓLO cierres de D−1 hacia atrás; lo único del día D es el precio de las 11:00
// · se vende al BID y se compra al ASK, las cuatro patas, más $0,03 de comisión por pata
// · liquidación contra el cierre real del índice
// · ningún precio de modelo en ningún sitio
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/tres-sies-por-ano.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", COMM = 0.03, ALA = 50, DIST = 45;
const CREDITO_MIN = 1.00;          // $100 por contrato — el tercer sí
const MA_CORTA = 5, MA_LARGA = 50;

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");

// ── las cadenas ─────────────────────────────────────────────────────────────
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) return null;
  const enHora = []; let spotFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre: spotFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const cond = []; const sinCadena = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) { sinCadena.push(fecha); continue; }
  const spot = C.filas[0].spot;
  if (!(spot > 0)) { sinCadena.push(fecha); continue; }
  const S = C.cierre;
  const cC = cerca(C.filas, spot + DIST), pC = cerca(P.filas, spot - DIST);
  const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) { sinCadena.push(fecha); continue; }
  const cred = cC.bid + pC.bid - cL.ask - pL.ask;      // vendo al bid, compro al ask
  if (!(cred > 0)) { sinCadena.push(fecha); continue; }
  const aC = cL.K - cC.K, aP = pC.K - pL.K;
  const danoCall = Math.min(Math.max(S - cC.K, 0), aC), danoPut = Math.min(Math.max(pC.K - S, 0), aP);
  cond.push({
    fecha, spot, cierre: S, credito: cred * 100,
    pl: (cred - danoCall - danoPut) * 100 - 8 * COMM,
    colateral: (Math.max(aC, aP) - cred) * 100,
    tocado: danoCall > 0 || danoPut > 0,
  });
}

// ── la cinta de minutos de SPY para las medias ──────────────────────────────
const dias = [];
for (const y of [2023, 2024, 2025, 2026]) {
  const f = `scripts/cache-theta/SPY_spotmin_y_${y}.json`;
  if (!existsSync(f)) continue;
  for (const [d, arr] of Object.entries(JSON.parse(readFileSync(f, "utf8")))) {
    const m = new Map(arr.map(([mi, p]) => [mi, p]));
    const c = m.get(960), p11 = m.get(660);
    if (!(c > 0) || !(p11 > 0)) continue;
    dias.push({ fecha: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, c, p11 });
  }
}
dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
const idx = new Map(dias.map((d, i) => [d.fecha, i]));

// ── aplicar los tres síes ───────────────────────────────────────────────────
const filas = []; const sinSerie = [];
for (const f of cond) {
  const i = idx.get(f.fecha);
  if (i === undefined || i < MA_LARGA + 5) { sinSerie.push(f.fecha); continue; }
  const cierres = dias.slice(i - 200 < 0 ? 0 : i - 200, i).map((d) => d.c);   // SÓLO D−1 hacia atrás
  const p11 = dias[i].p11;
  const si1 = p11 > media(cierres.slice(-MA_CORTA));
  const si2 = p11 > media(cierres.slice(-MA_LARGA));
  const si3 = f.credito >= CREDITO_MIN * 100;
  filas.push({ ...f, si1, si2, si3, opera: si1 && si2 && si3 });
}

console.log(`\n## ${filas.length} días con cadena y serie · ${sinCadena.length} sin cadena · ${sinSerie.length} sin serie`);
console.log(`   ${filas[0].fecha} → ${filas[filas.length - 1].fecha}\n`);

// ── cuánto corta cada sí ────────────────────────────────────────────────────
console.log("### Cuánto filtra cada pregunta\n");
console.log(`  sobre la MA5:            ${filas.filter((f) => f.si1).length} de ${filas.length} días`);
console.log(`  sobre la MA50:           ${filas.filter((f) => f.si2).length}`);
console.log(`  crédito ≥ $100:          ${filas.filter((f) => f.si3).length}`);
console.log(`  **los tres a la vez:     ${filas.filter((f) => f.opera).length}**\n`);

// ── año por año ─────────────────────────────────────────────────────────────
function ddPico(pls) { let a = 0, p = 0, w = 0; for (const x of pls) { a += x; p = Math.max(p, a); w = Math.min(w, a - p); } return w; }

const opera = filas.filter((f) => f.opera);
const anos = [...new Set(filas.map((f) => f.fecha.slice(0, 4)))].sort();

console.log("=".repeat(96));
console.log("  AÑO POR AÑO · 1 CONTRATO");
console.log("=".repeat(96) + "\n");
console.log("| año | días de bolsa | opera | % de días | ganancia | acierto | peor día | caída máxima |");
console.log("|---|---|---|---|---|---|---|---|");
for (const a of anos) {
  const t = filas.filter((f) => f.fecha.startsWith(a));
  const o = opera.filter((f) => f.fecha.startsWith(a));
  if (!o.length) { console.log(`| ${a} | ${t.length} | 0 | — | — | — | — | — |`); continue; }
  const pls = o.map((x) => x.pl);
  console.log(`| ${a} | ${t.length} | ${o.length} | ${Math.round((o.length / t.length) * 100)}% | **${eur(suma(pls))}** | ${Math.round((pls.filter((x) => x > 0).length / pls.length) * 100)}% | ${eur(Math.min(...pls))} | ${eur(ddPico(pls))} |`);
}
const plsT = opera.map((x) => x.pl);
const anosT = filas.length / 252;
console.log(`|  |  |  |  |  |  |  |  |`);
console.log(`| **TODO** | ${filas.length} | ${opera.length} | ${Math.round((opera.length / filas.length) * 100)}% | **${eur(suma(plsT))}** | ${Math.round((plsT.filter((x) => x > 0).length / plsT.length) * 100)}% | ${eur(Math.min(...plsT))} | ${eur(ddPico(plsT))} |`);

console.log(`\n  al año: **${eur(suma(plsT) / anosT)}** por contrato · ${Math.round(opera.length / anosT)} operaciones/año · ${eur(media(plsT))} por operación`);
console.log(`  colateral que retiene cada cóndor: ${eur(media(opera.map((x) => x.colateral)))} de media, ${eur(Math.max(...opera.map((x) => x.colateral)))} como máximo`);

// ── el tamaño: qué aguanta la cuenta ────────────────────────────────────────
console.log("\n" + "=".repeat(96));
console.log("  CON MÁS CONTRATOS — el riesgo escala igual que el ingreso, sin descuento");
console.log("=".repeat(96) + "\n");
console.log("| contratos | al año | peor día | caída máxima | colateral máximo |");
console.log("|---|---|---|---|---|");
for (const n of [1, 2, 3, 5]) {
  console.log(`| ${n} | **${eur((suma(plsT) / anosT) * n)}** | ${eur(Math.min(...plsT) * n)} | ${eur(ddPico(plsT) * n)} | ${eur(Math.max(...opera.map((x) => x.colateral)) * n)} |`);
}

// ── el año que peor lo pasa, mes a mes ──────────────────────────────────────
const porAno = anos.map((a) => ({ a, pl: suma(opera.filter((f) => f.fecha.startsWith(a)).map((x) => x.pl)) })).filter((x) => x.pl !== 0);
const peorAno = porAno.sort((x, y) => x.pl - y.pl)[0];
if (peorAno) {
  console.log(`\n### El peor año fue ${peorAno.a} (${eur(peorAno.pl)}) — mes a mes\n`);
  const meses = [...new Set(opera.filter((f) => f.fecha.startsWith(peorAno.a)).map((f) => f.fecha.slice(0, 7)))].sort();
  console.log("| mes | " + meses.map((m) => m.slice(5)).join(" | ") + " |");
  console.log("|---|" + meses.map(() => "---").join("|") + "|");
  console.log("| $ | " + meses.map((m) => eur(suma(opera.filter((f) => f.fecha.startsWith(m)).map((x) => x.pl)))).join(" | ") + " |");
}

console.log(`\n${"=".repeat(96)}`);
console.log(`  ESTO ES BACKTEST, NO RESULTADO. La regla lleva desde el 2026-08-19 en forward test`);
console.log(`  (cuaderno forward:tres-sies) y ahí es donde se sabrá si aguanta en directo.`);
console.log(`  Su propio pre-registro dice que NO cruza el listón de Bonferroni: t=3,57 contra ≈4,0.`);
console.log("=".repeat(96) + "\n");
