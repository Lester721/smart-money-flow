// LOS DECILES QUE CONCENTRAN LA COLA, MEDIDOS EN DÓLARES.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/parar-y-volver-deciles.mjs
//
// ═══ POR QUÉ ESTE PASO ES OBLIGATORIO ════════════════════════════════════════════════════════
// El barrido anterior encontró 14 colas de decil que concentran los días de pérdida grande muy
// por encima del listón (z hasta 5,58). Eso es CONTEO, no dinero. Y en esta estrategia el conteo
// engaña de una forma concreta y conocida: los días de mucha volatilidad tienen la cola más
// gorda **y también pagan más crédito**. Por eso los 17 filtros de régimen salieron planos.
//
// Así que se mide en dólares lo que se encontró en cuentas: se salta el decil entero y se mira
// $/año, peor día, peor racha — con el mismo control de azar y los tres tercios.
//
// ═══ NADA DE ELEGIR DESPUÉS ══════════════════════════════════════════════════════════════════
// Se corren los 66 filtros (33 señales × decil alto y bajo), no sólo los 14 que salieron altos.
// El listón cuenta TODO lo hecho hoy sobre estos 653 días: 40 reglas de parada + 142 colas de
// decil + 66 filtros en dólares = 248 pruebas.
//
// El control es el mismo de siempre y aquí sale gratis: TODOS los filtros paran exactamente 65
// días, así que la distribución nula de "parar 65 días al azar" se calcula UNA vez con 20.000
// sorteos y se reutiliza. Es la misma nula, no 66 nulas distintas.

import { writeFileSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";
import { cargar, drawdown, media, pct, eur } from "./anatomia3-lib.mjs";

const PRUEBAS = 40 + 142 + 66;
const LISTON = listonT(PRUEBAS);
const SORTEOS = 20000;

const { filas } = cargar();
const N = filas.length, ANOS = N / 252;
const PL = filas.map((f) => f.pl);
radiografia(filas, ["pl", "acel", "recorrido", "rvManana", "credito", "sigma", "ivAtm11", "vix"], "señales", { maxCeros: 0.3 });

const BASE = { alAno: PL.reduce((a, b) => a + b, 0) / ANOS, dd: drawdown(PL), peor: Math.min(...PL) };
const cvar = (v, q = 0.05) => { const s = [...v].sort((a, b) => a - b); return media(s.slice(0, Math.max(1, Math.floor(s.length * q)))); };
BASE.cvar5 = cvar(PL);

function metricas(op) {
  const serie = PL.map((p, i) => (op[i] ? p : 0));
  const oper = PL.filter((_, i) => op[i]);
  return { n: oper.length, alAno: serie.reduce((a, b) => a + b, 0) / ANOS, dd: drawdown(serie),
           peor: Math.min(...oper), cvar5: cvar(oper), p5op: pct(oper, 0.05), acierto: oper.filter((x) => x > 0).length / oper.length };
}

const SENALES = ["movManana", "movMananaAbs", "rangoManana", "rangoMananaPts", "posRango", "extremo", "recorrido",
  "recorridoPts", "eficiencia", "zigzag", "rvManana", "acel", "ivAtm11", "ivCambio", "sigmaRatio", "rvIv", "hueco",
  "huecoAbs", "rangoAyerReal", "rvAyer", "tardeAyerPts", "retAyer", "vix", "vixCambio", "term9", "term3m", "vvix",
  "vvixVix", "ivVsVix", "nivel", "sepPct", "credito", "sigma"];

// ── LA NULA, UNA SOLA VEZ: parar 65 días al azar ────────────────────────────────────────────
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const K = Math.floor(N / 10);
const rnd = mulberry32(20260819);
const nula = { alAno: [], dd: [], peor: [], cvar5: [], coste: [] };
console.log(`\n## la nula: parar ${K} días al azar · ${SORTEOS} sorteos…`);
for (let s = 0; s < SORTEOS; s++) {
  const op = new Array(N).fill(true);
  let p = 0; while (p < K) { const i = Math.floor(rnd() * N); if (op[i]) { op[i] = false; p++; } }
  const m = metricas(op);
  nula.alAno.push(m.alAno); nula.dd.push(m.dd); nula.peor.push(m.peor); nula.cvar5.push(m.cvar5);
  const de = Math.abs(BASE.dd) - Math.abs(m.dd);
  nula.coste.push(de > 0 ? (BASE.alAno - m.alAno) / de : Infinity);
}
for (const k of Object.keys(nula)) nula[k].sort((a, b) => a - b);
const pDe = (arr, v, mayorEsMejor = true) => {
  // fracción de sorteos que iguala o mejora al valor observado
  let c = 0; for (const x of arr) if (mayorEsMejor ? x >= v : x <= v) c++;
  return (c + 1) / (arr.length + 1);
};
console.log(`   nula: $/año mediana ${eur(pct(nula.alAno, 0.5))} · peor racha mediana ${eur(pct(nula.dd, 0.5))} · peor día mediano ${eur(pct(nula.peor, 0.5))}`);
console.log(`   el azar quitando ${K} días mejora la racha por debajo de ${eur(pct(nula.dd, 0.95))} sólo el 5% de las veces\n`);

console.log("═".repeat(126));
console.log(`  66 FILTROS DE DECIL EN DÓLARES · listón |t| = ${LISTON} · Bonferroni p < ${(0.05 / PRUEBAS).toExponential(2)} sobre ${PRUEBAS} pruebas`);
console.log(`  BASE: ${eur(BASE.alAno)}/año · peor día ${eur(BASE.peor)} · CVaR5 ${eur(BASE.cvar5)} · peor racha ${eur(BASE.dd)}`);
console.log("═".repeat(126));
console.log("\n| señal | decil | $/año | retenido | peor día | CVaR5 op. | peor racha | racha quitada | COSTE $/$ | p(racha) | p($/año) | media DÍAS SALTADOS | t | tercios |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");

const res = [];
const k3 = Math.floor(N / 3);
for (const campo of SENALES) {
  const val = filas.filter((f) => f[campo] != null && isFinite(f[campo]));
  if (val.length < 500) { console.log(`| \`${campo}\` | — sólo ${val.length} días con dato — |`); continue; }
  const ord = [...val].sort((a, b) => a[campo] - b[campo]);
  const kk = Math.floor(ord.length / 10);
  for (const lado of ["alto", "bajo"]) {
    const fuera = new Set((lado === "alto" ? ord.slice(-kk) : ord.slice(0, kk)).map((f) => f.fecha));
    const op = filas.map((f) => !fuera.has(f.fecha));
    const m = metricas(op);
    const ddElim = Math.abs(BASE.dd) - Math.abs(m.dd);
    const coste = ddElim > 0 ? (BASE.alAno - m.alAno) / ddElim : null;
    const saltados = PL.filter((_, i) => !op[i]), dentro = PL.filter((_, i) => op[i]);
    const t = tWelch(saltados, dentro);
    const signos = [0, 1, 2].map((g) => {
      const a = [], b = [];
      for (let i = g * k3; i < (g === 2 ? N : (g + 1) * k3); i++) (op[i] ? b : a).push(PL[i]);
      return a.length < 3 || b.length < 3 ? "·" : (media(a) - media(b) >= 0 ? "+" : "−");
    }).join("");
    const p = { dd: pDe(nula.dd, m.dd), alAno: pDe(nula.alAno, m.alAno), peor: pDe(nula.peor, m.peor), cvar5: pDe(nula.cvar5, m.cvar5),
                coste: coste == null ? null : pDe(nula.coste, coste, false) };
    res.push({ campo, lado, m, ddElim, coste, t, signos, p, mediaSaltados: media(saltados) });
    console.log(`| \`${campo}\` | ${lado} | ${eur(m.alAno)} | ${((m.alAno / BASE.alAno) * 100).toFixed(0)}% | ${eur(m.peor)} | ${eur(m.cvar5)} | ${eur(m.dd)} | ${eur(ddElim)} | ${coste == null ? "no quita" : coste.toFixed(2)} | ${p.dd.toFixed(4)} | ${p.alAno.toFixed(4)} | ${eur(media(saltados))} | ${t.toFixed(2)} | ${signos} |`);
  }
}

// ── VEREDICTO ────────────────────────────────────────────────────────────────────────────────
// Para servir: quitar racha de verdad, conservar ≥90% del ingreso, ganarle al azar con Bonferroni,
// y mismo signo en los tres tercios (los días saltados peores que los operados SIEMPRE).
const alpha = 0.05 / PRUEBAS;
for (const r of res) {
  const f = [];
  if (r.ddElim < 3000) f.push(`sólo quita ${eur(r.ddElim)} de racha`);
  if (r.m.alAno < BASE.alAno * 0.9) f.push(`retiene ${((r.m.alAno / BASE.alAno) * 100).toFixed(0)}% del ingreso`);
  if (r.p.dd > alpha) f.push(`p(racha)=${r.p.dd.toFixed(4)} > ${alpha.toExponential(1)}`);
  if (r.signos !== "−−−") f.push(`los días saltados no son peores en los tres tercios (${r.signos})`);
  if (Math.abs(r.t) < LISTON) f.push(`|t|=${Math.abs(r.t).toFixed(2)} < ${LISTON}`);
  r.falla = f;
}
const pasan = res.filter((r) => !r.falla.length);
console.log(`\n${"═".repeat(126)}`);
console.log(`  VEREDICTO: ${pasan.length} de ${res.length} filtros de decil pasan`);
console.log(`${"═".repeat(126)}\n`);

// las que más quitan de racha y las que menos cuestan, pasen o no
const conRacha = res.filter((r) => r.coste != null).sort((a, b) => a.coste - b.coste).slice(0, 6);
console.log("  LAS 6 MÁS BARATAS (menos $/año perdido por cada $ de racha quitado):\n");
console.log("| señal · decil | $/año | retenido | peor día | peor racha | racha quitada | COSTE | p(racha) | tercios | le falta |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const r of conRacha) {
  console.log(`| \`${r.campo}\` ${r.lado} | ${eur(r.m.alAno)} | ${((r.m.alAno / BASE.alAno) * 100).toFixed(0)}% | ${eur(r.m.peor)} | ${eur(r.m.dd)} | ${eur(r.ddElim)} | ${r.coste.toFixed(2)} | ${r.p.dd.toFixed(4)} | ${r.signos} | ${r.falla.join(" · ") || "—"} |`);
}
if (pasan.length) { console.log("\n  🟢 PASAN:\n"); for (const r of pasan) console.log(`  · \`${r.campo}\` decil ${r.lado} — ${eur(r.m.alAno)}/año (${((r.m.alAno / BASE.alAno) * 100).toFixed(0)}%) · peor día ${eur(r.m.peor)} · racha ${eur(r.m.dd)} · coste ${r.coste.toFixed(2)} · p ${r.p.dd.toFixed(5)} · tercios ${r.signos}`); }

writeFileSync("scripts/parar-y-volver-deciles.json", JSON.stringify({ base: BASE, pruebas: PRUEBAS, liston: LISTON, alpha, K, sorteos: SORTEOS, res }, null, 2), "utf8");
console.log("\n  detalle en scripts/parar-y-volver-deciles.json");
