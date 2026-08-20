// LA PRUEBA FUERA DE MUESTRA — el filtro de amplitud contra 2022 y 2023.
//
// ═══ POR QUÉ ESTA PRUEBA ES DISTINTA DE TODAS LAS ANTERIORES ═══════════════════════════════
//
// La regla se ELIGIÓ mirando 2024-2026. Aquí se aplica TAL CUAL a dos años que no participaron
// en elegirla. Ni un parámetro se toca: ±30 puntos, alas de 50, entrada 11:00, y no operar si
// el spot de las 11:00 está por debajo de su media de 20 o de 50 sesiones.
//
// Si alguien "afina" algo mirando este resultado, la prueba deja de valer y hay que empezar de
// cero con otros años que ya no existen. NO SE TOCA NADA.
//
// Y 2022 aporta lo que ningún otro año del proyecto tiene: SPX cayó un 25%. El filtro nunca ha
// visto un mercado bajista. Esto no es sólo más muestra: es OTRO RÉGIMEN.
//
// ═══ NOTA HONESTA SOBRE 2022 ══════════════════════════════════════════════════════════════
//
// Hasta marzo de 2022 SPX sólo vencía lunes, miércoles y viernes: los martes y jueves NO había
// contrato que vender. Son 220 días, no 250, y esos 30 días no faltan — no existían. La
// estrategia habría operado 3 días por semana ese trimestre. Se dice, no se rellena.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/fuera-de-muestra-2022.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", ALA = 50, COMM = 0.03;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const med = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU] = idx;
  const enHora = [];
  let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

// ── una pasada por todo lo que hay en disco ─────────────────────────────────
const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
console.log(`\n## FUERA DE MUESTRA · ${fechas.length} días en disco (${fechas[0]} → ${fechas[fechas.length - 1]})\n`);

const dias = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const sp11 = C.filas[0].spot;
  if (!(sp11 > 0)) continue;

  const pl = (SEP) => {
    const cC = cerca(C.filas, sp11 + SEP), pC = cerca(P.filas, sp11 - SEP);
    const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) return null;
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) return null;
    const S = C.cierre;
    return { pl: (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K)
                       - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * COMM,
             credito: cred * 100 };
  };
  const a25 = pl(25), a30 = pl(30);
  if (!a25 || !a30) continue;
  dias.push({ fecha, sp11, cierre: C.cierre, pl25: a25.pl, pl30: a30.pl, cred30: a30.credito });
}

// ── el filtro: medias con cierres ESTRICTAMENTE anteriores ──────────────────
for (let i = 0; i < dias.length; i++) {
  if (i < 50) { dias[i].opera = null; continue; }
  const c = dias.slice(i - 50, i).map((x) => x.cierre);      // D−50 … D−1
  dias[i].opera = dias[i].sp11 >= med(c.slice(-20)) && dias[i].sp11 >= med(c);
}

/** Peor racha acumulada de una serie de P&L. */
const racha = (v) => { let cur = 0, peor = 0; for (const x of v) { cur = Math.min(0, cur + x); peor = Math.min(peor, cur); } return peor; };

function medir(sub, etiqueta) {
  const base = sub.filter((d) => d.opera !== null);
  const op = base.filter((d) => d.opera === true);
  if (base.length < 30) { console.log(`  ${etiqueta}: sólo ${base.length} días, no se mide`); return null; }
  const anos = base.length / 252;
  const b = { pl: base.map((d) => d.pl25) }, g = { pl: op.map((d) => d.pl30) };
  const r = {
    etiqueta, n: base.length, nOp: op.length,
    baseAno: b.pl.reduce((a, x) => a + x, 0) / anos, baseRacha: racha(b.pl), basePeor: Math.min(...b.pl),
    filtAno: g.pl.reduce((a, x) => a + x, 0) / anos, filtRacha: racha(g.pl), filtPeor: g.pl.length ? Math.min(...g.pl) : NaN,
    baseAcierto: (b.pl.filter((x) => x > 0).length / b.pl.length) * 100,
    filtAcierto: g.pl.length ? (g.pl.filter((x) => x > 0).length / g.pl.length) * 100 : NaN,
    fuera: base.length - op.length,
  };
  return r;
}

const P = [
  ["2022-2023  ⟵ FUERA DE MUESTRA", (d) => d.fecha < "2024-01-01"],
  ["2024-2026  (donde se eligió)", (d) => d.fecha >= "2024-01-01"],
  ["TODO 2022-2026", () => true],
  ["  · sólo 2022 (mercado bajista)", (d) => d.fecha < "2023-01-01"],
  ["  · sólo 2023", (d) => d.fecha >= "2023-01-01" && d.fecha < "2024-01-01"],
];

console.log("| período | días | opera | **base ±25 $/año** | **filtro ±30 $/año** | **racha base** | **racha filtro** |");
console.log("|---|---|---|---|---|---|---|");
const res = [];
for (const [et, f] of P) {
  const r = medir(dias.filter(f), et);
  if (!r) continue;
  res.push(r);
  console.log(`| ${et} | ${r.n} | ${r.nOp} (${Math.round(r.nOp / r.n * 100)}%) | ${eur(r.baseAno)} | **${eur(r.filtAno)}** | ${eur(r.baseRacha)} | **${eur(r.filtRacha)}** |`);
}

console.log(`\n## Acierto y peor día\n`);
console.log("| período | acierto base | acierto filtro | peor día base | peor día filtro |");
console.log("|---|---|---|---|---|");
for (const r of res) console.log(`| ${r.etiqueta} | ${r.baseAcierto.toFixed(0)}% | ${r.filtAcierto.toFixed(0)}% | ${eur(r.basePeor)} | ${eur(r.filtPeor)} |`);

// ── EL VEREDICTO, con el criterio escrito antes de mirar ────────────────────
const fm = res.find((r) => r.etiqueta.includes("FUERA DE MUESTRA"));
console.log(`\n${"═".repeat(78)}`);
if (fm) {
  const mejorRacha = fm.filtRacha > fm.baseRacha;
  const conservaIngreso = fm.filtAno >= fm.baseAno * 0.85;
  console.log(`  FUERA DE MUESTRA (2022-2023, ${fm.n} días):`);
  console.log(`    ¿parte la caída?      ${mejorRacha ? "SÍ" : "NO"}  ${eur(fm.baseRacha)} → ${eur(fm.filtRacha)}` +
              `  (${((1 - fm.filtRacha / fm.baseRacha) * 100).toFixed(0)}% menos)`);
  console.log(`    ¿conserva el ingreso? ${conservaIngreso ? "SÍ" : "NO"}  ${eur(fm.baseAno)} → ${eur(fm.filtAno)}/año`);
  console.log(`    se queda fuera ${fm.fuera} días de ${fm.n} (${Math.round(fm.fuera / fm.n * 100)}%)`);
  console.log(`\n  ${mejorRacha && conservaIngreso ? "🟢 LA REGLA SOBREVIVE FUERA DE MUESTRA" : "🔴 LA REGLA NO SOBREVIVE — no se ajusta, se retira"}`);
}
console.log("═".repeat(78));
