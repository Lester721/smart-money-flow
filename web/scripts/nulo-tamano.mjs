// EL CONTROL TONTO DE TAMAÑO — y el nulo del LADO CONTRARIO.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/nulo-tamano.mjs
//      (necesita scripts/nulo-tamano-dias.json, que escribe nulo-tamano-datos.mjs)
//
// El informe descarta el filtro de amplitud diciendo, sin medirlo: "operar menos días se consigue
// gratis bajando el tamaño". Aquí se mide. Para un cóndor de riesgo definido, bajar el tamaño sin
// tocar el número de contratos es ESTRECHAR EL ALA: colateral y pérdida máxima son ancho × 100.
//
//   el filtro opera el 60,6% de los días con alas de 50  →  riesgo-días = 648 × $5.000
//   alas de 30 TODOS los días                            →  riesgo-días = 1.069 × $3.000
//   son la MISMA exposición (3,24 M vs 3,21 M) y una no necesita ninguna regla.
//
// Y el nulo de supervivencia: COMPRAR el cóndor en vez de venderlo. Es malo por construcción
// (paga la horquilla en 8 patas). Si la cuenta también lo "aguanta" a 1-2 contratos, entonces
// "¿aguanta la cuenta?" no es una pregunta que separe estrategias.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const EFECTIVO = 7977, CUENTA = 56389, HOOD = 48135, LINEA = -0.70 * HOOD, INT = 0.05;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(1) + "%";
const anosEntre = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;

const J = JSON.parse(readFileSync("scripts/nulo-tamano-dias.json", "utf8"));
const D = J.dias;
const ANOS = anosEntre(D[0].fecha, D[D.length - 1].fecha);
const FECHAS = D.map((d) => d.fecha);

radiografia(
  D.map((d) => ({
    sp11: d.sp11, cierre: d.cierre,
    pl_d25a50: d.g.d25a50.pl, pl_d30a50: d.g.d30a50.pl, pl_d30a30: d.g.d30a30.pl,
    pl_d30a20: d.g.d30a20.pl, pl_d30a10: d.g.d30a10.pl,
    inv_d25a50: d.g.d25a50.plInv, cred_d30a30: d.g.d30a30.cred,
  })),
  ["sp11", "cierre", "pl_d25a50", "pl_d30a50", "pl_d30a30", "pl_d30a20", "pl_d30a10", "inv_d25a50", "cred_d30a30"],
  "nulo de tamaño · 10 geometrías + lado contrario",
);
// El COLATERAL es una constante de diseño (ancho del ala × 100), no un campo medido: la
// radiografía lo rechazaría por no ordenar nada. Se cuenta a mano, que es lo que hay que ver.
for (const a of [50, 30, 20, 10]) {
  const v = D.map((d) => d.g[`d30a${a}`].col);
  const u = [...new Set(v)].sort((x, y) => x - y);
  console.log(`  colateral real ±30/alas ${a}: ${u.map((x) => `$${x} (${v.filter((y) => y === x).length})`).join(" · ")}`);
}
console.log(`  ${D.length} sesiones · ${D[0].fecha} → ${D[D.length - 1].fecha} · filtro: ${D.filter((d) => d.opera).length} sí / ${D.filter((d) => !d.opera).length} no\n`);

function caja(pls) {
  let ef = EFECTIVO, interes = 0, minC = EFECTIVO, pico = EFECTIVO, dd = 0;
  let rojo = 0, llamada = null, prev = FECHAS[0], fMin = FECHAS[0];
  for (let i = 0; i < pls.length; i++) {
    const nd = Math.max(0, (new Date(FECHAS[i] + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000);
    prev = FECHAS[i];
    if (ef < 0 && nd > 0) { const it = ef * INT * nd / 365; interes += it; ef += it; }
    ef += pls[i];
    if (ef > pico) pico = ef;
    if (pico - ef > dd) dd = pico - ef;
    if (ef < minC) { minC = ef; fMin = FECHAS[i]; }
    if (ef < 0) rojo++;
    if (ef < LINEA && !llamada) llamada = FECHAS[i];
  }
  return { anual: (ef - EFECTIVO) / ANOS, interes, minC, fMin, dd, ddPct: dd / CUENTA, rojo, llamada };
}
const serie = (k, n, filtro, inv) => D.map((d) => (filtro && !d.opera ? 0 : (inv ? d.g[k].plInv : d.g[k].pl) * n));
const riesgoDias = (k, n, filtro) => D.reduce((a, d) => a + (filtro && !d.opera ? 0 : d.g[k].col * n), 0);

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log("═".repeat(122));
console.log("### A · EL CONTROL TONTO — la MISMA exposición comprada con ALA ESTRECHA en vez de con el filtro");
console.log("═".repeat(122) + "\n");
console.log("Exposición = Σ (colateral × contratos) sobre los días que se opera. Se busca el ala que iguala la del filtro.\n");
console.log("| variante (1 contrato) | días op. | riesgo-días | vs. filtro | caída máxima | caída % cuenta | suelo de caja | días en rojo | $/año | ¿llamada? |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const REGLA = { k: "d30a50", filtro: true, nom: "**LA REGLA** · filtro amplitud ±30 / alas 50" };
const rRegla = caja(serie(REGLA.k, 1, true));
const expRegla = riesgoDias(REGLA.k, 1, true);
const linea = (nom, k, filtro, n = 1) => {
  const r = caja(serie(k, n, filtro)), e = riesgoDias(k, n, filtro);
  console.log(`| ${nom} | ${filtro ? D.filter((d) => d.opera).length : D.length} | ${(e / 1e6).toFixed(2)} M | ${(e / expRegla * 100).toFixed(0)}% | ${eur(-r.dd)} | ${pct(-r.ddPct)} | ${eur(r.minC)} (${r.fMin}) | ${r.rojo} | ${eur(r.anual)} | ${r.llamada || "NO"} |`);
  return r;
};
linea(REGLA.nom, "d30a50", true);
for (const a of [50, 30, 25, 20, 10]) linea(`control TONTO · ±30 / alas ${a}, TODOS los días`, `d30a${a}`, false);
console.log("");
for (const a of [50, 30, 20, 10]) linea(`(referencia) cóndor de HOY ±25 / alas ${a}, TODOS los días`, `d25a${a}`, false);

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n" + "═".repeat(122));
console.log("### B · ¿Y SI SE IGUALA LA CAÍDA? — cuánto paga el filtro por cada dólar de caída evitada");
console.log("═".repeat(122) + "\n");
const base = caja(serie("d30a50", 1, false));
console.log("| variante | caída máxima | $/año | caída evitada vs. base | $/año sacrificados | $ pagados por cada $1.000 de caída evitada |");
console.log("|---|---|---|---|---|---|");
console.log(`| ±30/50 TODOS los días (base) | ${eur(-base.dd)} | ${eur(base.anual)} | — | — | — |`);
for (const [nom, r] of [["±30/50 CON filtro de amplitud (la regla)", rRegla], ...[30, 25, 20].map((a) => [`±30 / alas ${a}, TODOS los días (tamaño)`, caja(serie(`d30a${a}`, 1, false))])]) {
  const ev = base.dd - r.dd, sac = base.anual - r.anual;
  console.log(`| ${nom} | ${eur(-r.dd)} | ${eur(r.anual)} | ${eur(ev)} | ${eur(sac)} | ${ev > 0 ? eur(sac / (ev / 1000)) : "—"} |`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n" + "═".repeat(122));
console.log("### C · NULO DE SUPERVIVENCIA — COMPRAR el cóndor (estrategia mala por construcción)");
console.log("═".repeat(122) + "\n");
console.log("Comprar el cóndor paga la horquilla en las 8 patas y regala la prima. Si la cuenta también lo");
console.log("\"aguanta\" a 1-2 contratos, la pregunta \"¿aguanta la cuenta?\" no separa una estrategia buena de una mala.\n");
console.log("| lado | geometría | ctr | $/año | caída máxima | suelo de caja | días en rojo | ¿LLAMADA DE MARGEN? |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [lado, inv] of [["VENDIDO (el informe)", false], ["**COMPRADO** (el nulo)", true]])
  for (const k of ["d25a50", "d30a50"]) for (const n of [1, 2]) {
    const r = caja(serie(k, n, false, inv));
    console.log(`| ${lado} | ${k.replace("d", "±").replace("a", " / alas ")} | ${n} | ${eur(r.anual)} | ${eur(-r.dd)} | ${eur(r.minC)} | ${r.rojo} | ${r.llamada ? "**SÍ** " + r.llamada : "**NO**"} |`);
  }

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n" + "═".repeat(122));
console.log("### D · LA REGLA DE HIERRO sobre el control tonto — ¿aguanta el cruce de mitades?");
console.log("═".repeat(122) + "\n");
const idxA = D.map((d, i) => i).filter((i) => D[i].ano <= 2023);
const idxB = D.map((d, i) => i).filter((i) => D[i].ano >= 2024);
function cajaIdx(idx, k, filtro, inv) {
  let ef = EFECTIVO, minC = EFECTIVO, pico = EFECTIVO, dd = 0, prev = FECHAS[idx[0]];
  for (const i of idx) {
    const nd = Math.max(0, (new Date(FECHAS[i] + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000);
    prev = FECHAS[i];
    if (ef < 0 && nd > 0) ef += ef * INT * nd / 365;
    ef += (filtro && !D[i].opera ? 0 : (inv ? D[i].g[k].plInv : D[i].g[k].pl));
    if (ef > pico) pico = ef;
    if (pico - ef > dd) dd = pico - ef;
    if (ef < minC) minC = ef;
  }
  const an = anosEntre(FECHAS[idx[0]], FECHAS[idx[idx.length - 1]]);
  return { anual: (ef - EFECTIVO) / an, minC, dd };
}
console.log("| variante | caída A (2022-23) | caída B (2024-26) | suelo caja A | suelo caja B | $/año A | $/año B |");
console.log("|---|---|---|---|---|---|---|");
const cand = [["filtro ±30/50 (la regla)", "d30a50", true], ["±30 / alas 30 TODOS (tamaño)", "d30a30", false], ["±30 / alas 50 TODOS (base)", "d30a50", false], ["±25 / alas 50 TODOS (el de HOY)", "d25a50", false]];
const rr = {};
for (const [nom, k, f] of cand) {
  const a = cajaIdx(idxA, k, f), b = cajaIdx(idxB, k, f); rr[nom] = { a, b };
  console.log(`| ${nom} | ${eur(-a.dd)} | ${eur(-b.dd)} | ${eur(a.minC)} | ${eur(b.minC)} | ${eur(a.anual)} | ${eur(b.anual)} |`);
}
const gana = (m, s) => {
  const f = rr["filtro ±30/50 (la regla)"][s], t = rr["±30 / alas 30 TODOS (tamaño)"][s];
  return m === "dd" ? (f.dd < t.dd ? "regla" : "TAMAÑO") : (f.minC > t.minC ? "regla" : "TAMAÑO");
};
console.log(`\n**Regla vs. control de tamaño (alas 30) — caída:** mitad A gana ${gana("dd", "a")} · mitad B gana ${gana("dd", "b")}`);
console.log(`**Regla vs. control de tamaño (alas 30) — suelo de caja:** mitad A gana ${gana("min", "a")} · mitad B gana ${gana("min", "b")}`);
