// SIGMA-CREDITO · FASE 5 — LO QUE LE FALTA PARA FUNCIONAR.
//
// ═══ LO QUE ENSEÑÓ LA FASE 4 ══════════════════════════════════════════════════════════════════
// Los 26 días que se comen el riesgo entero NO son días raros: 22 de los 26 están en el tercio
// ALTO de σ, y el movimiento de tarde que los mató fue de mediana 0,94σ — un movimiento
// ABSOLUTAMENTE NORMAL. Lo que falla no es el mercado: es que los ±25 puntos son FIJOS mientras
// σ va de 16 a 385 puntos. Un día de σ=130, vender a ±25 es vender a 0,19σ: estás dentro del
// ruido y cualquier deriva corriente atraviesa las alas.
//
// Filtrar esos días NO funciona (fase 2: ningún corte bate al azar) porque son también los que
// más crédito pagan: la cola está PAGADA. Si la cola está pagada y aun así molesta, lo que hay
// que cambiar no es CUÁNDO se entra sino DÓNDE se ponen los strikes.
//
// ═══ QUÉ SE MIDE AQUÍ ═════════════════════════════════════════════════════════════════════════
// El mismo cóndor, mismos días, mismas reglas de precio (bid al vender, ask al comprar, $0,03 por
// pata, liquidado contra el cierre real), cambiando UNA sola cosa: la distancia de los strikes
// vendidos pasa de ±25 puntos FIJOS a ±k·σ, con σ la de las 11:00 — observable al operar.
// Las alas siguen a 50 puntos, así que el riesgo máximo sigue siendo $5.000 y las cifras en
// dólares son comparables con la línea base.
//
// PRUEBAS: 4 valores de k declarados de antemano + el control que reproduce los ±25 fijos.
// Van sobre las 138 anteriores → 142.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { media, pct, eur, drawdown } from "./anatomia3-lib.mjs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", ALA = 50, COMM = 0.03;
const KS = [0.35, 0.50, 0.75, 1.00];              // DECLARADOS. No se añaden después.
const PRUEBAS = 138 + KS.length;
const LISTON = listonT(PRUEBAS);
const PERM = 4000;
const CACHE = "scripts/cola-sigcred-strikes-cache.json";

const base = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const ANOS = (new Date(base[base.length - 1].fecha) - new Date(base[0].fecha)) / (365.25 * 864e5);

function leerHora(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "implied_vol", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iV, iU] = idx;
  const out = []; let spot = 0;
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    if (String(c[iT]).slice(11, 16) !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]), sp = Number(c[iU]);
    if (sp > 0) spot = sp;
    if (K > 0 && bid >= 0 && ask > 0) out.push({ K, bid, ask, iv: Number(c[iV]) });
  }
  return out.length && spot > 0 ? { filas: out, spot } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

// ── construir la serie para cada separación ────────────────────────────────
let series;
if (existsSync(CACHE)) {
  series = JSON.parse(readFileSync(CACHE, "utf8"));
  console.log("## series leídas de caché");
} else {
  console.log(`## releyendo ${base.length} días de cadena para ${KS.length + 1} separaciones…`);
  series = {};
  const nombres = ["FIJO25", ...KS.map((k) => "k" + k)];
  for (const n of nombres) series[n] = [];
  for (let i = 0; i < base.length; i++) {
    const b = base[i];
    if (i % 150 === 0) console.log(`   ${i}/${base.length} · ${b.fecha}`);
    const C = leerHora(b.fecha, "C"), P = leerHora(b.fecha, "P");
    if (!C || !P) continue;
    const sp11 = C.spot, cierre = b.cierre, sigma = b.sigma;
    if (Math.abs(sp11 - b.sp11) > 0.01) throw new Error(`spot descuadra en ${b.fecha}`);

    for (const nom of nombres) {
      const sep = nom === "FIJO25" ? 25 : sigma * KS[nombres.indexOf(nom) - 1];
      const sc = cerca(C.filas, sp11 + sep), sp = cerca(P.filas, sp11 - sep);
      const lc = cerca(C.filas, sc.K + ALA), lp = cerca(P.filas, sp.K - ALA);
      if (lc.K <= sc.K || lp.K >= sp.K) continue;
      const cred = sc.bid + sp.bid - lc.ask - lp.ask;
      if (!(cred > 0)) continue;                        // no se rellena: ese día no hay operación
      const pl = (cred - Math.min(Math.max(cierre - sc.K, 0), lc.K - sc.K)
                       - Math.min(Math.max(sp.K - cierre, 0), sp.K - lp.K)) * 100 - 8 * COMM;
      series[nom].push({ fecha: b.fecha, pl, credito: cred * 100, sep, sigma,
                         sepSigmas: sigma ? (sc.K - sp11) / sigma : null });
    }
  }
  writeFileSync(CACHE, JSON.stringify(series), "utf8");
}

// ── GUARDIÁN: el control tiene que reproducir la línea base exactamente ────
const ctrl = series.FIJO25;
let desc = 0;
const porF = new Map(base.map((f) => [f.fecha, f]));
for (const r of ctrl) { const b = porF.get(r.fecha); if (!b || Math.abs(r.pl - b.pl) > 0.01) desc++; }
if (desc) throw new Error(`el control de ±25 fijos NO reproduce regimen-filas.json en ${desc} días. Se para.`);
console.log(`\n  control ±25 fijos: reproduce los ${ctrl.length} días exactamente ✔`);

function foto(pls) {
  const tot = pls.reduce((a, b) => a + b, 0);
  return { n: pls.length, total: tot, alAno: tot / ANOS, media: media(pls),
           peor: Math.min(...pls), p1: pct(pls, 0.01), p5: pct(pls, 0.05), dd: drawdown(pls),
           acierto: pls.filter((x) => x > 0).length / pls.length,
           nMalo: pls.filter((x) => x < -2000).length, nMuyMalo: pls.filter((x) => x < -4000).length };
}
const B = foto(ctrl.map((r) => r.pl));

console.log("\n" + "═".repeat(116));
console.log("  STRIKES PROPORCIONALES A σ · lo mismo, movida sólo la distancia de venta");
console.log(`  ${PRUEBAS} pruebas declaradas · listón |t| ≥ ${LISTON} · alas a 50 pts (riesgo máx. $5.000 en todas)`);
console.log("═".repeat(116));
console.log("\n| separación | días | σ vendidos (med) | crédito medio | $/año | media | acierto | peor día | p5 | p1 | PEOR RACHA | Calmar |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
const resu = [];
for (const nom of ["FIJO25", ...KS.map((k) => "k" + k)]) {
  const s = series[nom];
  if (!s || !s.length) { console.log(`| ${nom} | 0 | — | — | — | — | — | — | — | — | — | — |`); continue; }
  const f = foto(s.map((r) => r.pl));
  const sepS = pct(s.map((r) => r.sepSigmas).filter((x) => x != null), 0.5);
  const etiqueta = nom === "FIJO25" ? "**±25 pts FIJOS** (base)" : `±${KS[["FIJO25", ...KS.map((k) => "k" + k)].indexOf(nom) - 1]}σ`;
  resu.push({ nom, etiqueta, f, sepS, s });
  console.log(`| ${etiqueta} | ${f.n} | ${sepS.toFixed(2)}σ | ${eur(media(s.map((r) => r.credito)))} | ${eur(f.alAno)} | ${eur(f.media)} | ${(f.acierto * 100).toFixed(1)}% | ${eur(f.peor)} | ${eur(f.p5)} | ${eur(f.p1)} | ${eur(f.dd)} | ${f.dd < 0 ? (f.alAno / -f.dd).toFixed(2) : "—"} |`);
}

// ── ¿sobrevive por años? un cambio de estructura tiene que valer en los tres ──
const ANOS_L = [...new Set(base.map((f) => f.fecha.slice(0, 4)))].sort();
console.log("\n## POR AÑOS — un cambio de estructura tiene que valer en los tres tercios del período\n");
console.log("| separación | " + ANOS_L.map((y) => `${y} $/año`).join(" | ") + " | " + ANOS_L.map((y) => `${y} peor racha`).join(" | ") + " |");
console.log("|---|" + ANOS_L.map(() => "---").join("|") + "|" + ANOS_L.map(() => "---").join("|") + "|");
for (const r of resu) {
  const cel = [], dds = [];
  for (const y of ANOS_L) {
    const v = r.s.filter((x) => x.fecha.slice(0, 4) === y).map((x) => x.pl);
    const anosY = v.length / 252;
    cel.push(v.length ? eur(v.reduce((a, b) => a + b, 0) / anosY) : "—");
    dds.push(v.length ? eur(drawdown(v)) : "—");
  }
  console.log(`| ${r.etiqueta} | ${cel.join(" | ")} | ${dds.join(" | ")} |`);
}

// ── ¿la mejora del peor día / racha bate al azar? aquí no hay filtro: es OTRA serie.
// El control correcto es el emparejado día a día contra la base.
console.log("\n## EL MISMO DÍA, LAS DOS ESTRUCTURAS — comparación emparejada\n");
console.log("| separación | días comunes | media base | media nueva | dif. media | t emparejada | días base <−$2k que la nueva salva |");
console.log("|---|---|---|---|---|---|---|");
const mapaB = new Map(ctrl.map((r) => [r.fecha, r.pl]));
for (const r of resu.slice(1)) {
  const pares = r.s.filter((x) => mapaB.has(x.fecha)).map((x) => ({ b: mapaB.get(x.fecha), n: x.pl }));
  const d = pares.map((p) => p.n - p.b);
  const m = media(d), s = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / (d.length - 1));
  const t = m / (s / Math.sqrt(d.length));
  const malosB = pares.filter((p) => p.b < -2000);
  const salvados = malosB.filter((p) => p.n > -2000).length;
  console.log(`| ${r.etiqueta} | ${pares.length} | ${eur(media(pares.map((p) => p.b)))} | ${eur(media(pares.map((p) => p.n)))} | ${eur(m)} | **${t.toFixed(2)}** | ${salvados} de ${malosB.length} |`);
}

console.log("\n" + "═".repeat(116));
console.log(`  BASE: ${eur(B.alAno)}/año · peor día ${eur(B.peor)} · peor racha ${eur(B.dd)} · Calmar ${(B.alAno / -B.dd).toFixed(2)} · acierto ${(B.acierto * 100).toFixed(1)}%`);
console.log("═".repeat(116));

writeFileSync("scripts/cola-sigcred-strikes-salida.json", JSON.stringify({
  liston: LISTON, pruebas: PRUEBAS, anos: ANOS,
  series: resu.map((r) => ({ nom: r.nom, etiqueta: r.etiqueta, sepSigmasMediana: r.sepS, ...r.f })),
}, null, 2), "utf8");
console.log("\n  detalle en scripts/cola-sigcred-strikes-salida.json");
