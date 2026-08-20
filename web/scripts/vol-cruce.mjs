// VOLATILIDAD · PASO 3 — EL CRUCE. Elegir en un período, aplicar TAL CUAL en el otro. Y al revés.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/vol-cruce.mjs
//
// LA REGLA DE HIERRO. Con 1.121 días se puede partir la muestra, y ésta es la primera vez que se
// hace de verdad. El filtro de amplitud —el mejor hallazgo del proyecto— murió el día que se probó
// fuera del período donde se eligió. Aquí eso se hace ANTES de contarlo.
//
//   1. El umbral se elige mirando SÓLO el período de ajuste.
//   2. Se aplica al otro período **como número**, no como percentil. Aplicar el percentil sería
//      volver a ajustar: es exactamente el truco que esconde el problema de las unidades.
//   3. Se repite al revés.
//   4. Sólo cuenta lo que funciona en las DOS direcciones.
//
// TRES PUERTAS, y las tres hicieron falta:
//   · La caída eliminada tiene que ser SERIA (≥20% de la racha base). Sin esto, la regla ganadora
//     de la primera corrida quitaba $9 de racha y "ganaba" con un ratio de −$287 por dólar.
//   · La regla tiene que MORDER fuera de muestra (quitar entre el 5% y el 50% de los días). Sin
//     esto sobreviven reglas cuyo umbral, escrito en unidades de un período, no descarta ni un
//     día en el otro: se aprueban por no hacer nada.
//   · Y tiene que GANARLE AL AZAR: quitar N días al azar también baja la racha. 500 sorteos.
//
// EL CALENTAMIENTO. Las señales que miran a 20 ó 60 sesiones anteriores no existen en los primeros
// días del fichero. Ahí la regla DEJA OPERAR, que es lo que pasaría de verdad: el 3 de enero de
// 2022 nadie tenía la media de los 20 días previos. Es la opción conservadora — el filtro no puede
// apuntarse los desastres del 5 y el 10 de enero de 2022, dos de los cinco peores días.

import { cargar, resumen, eur, media, sd, pct, peorRacha, P1, P2, EFECTIVO } from "./vol-lib.mjs";
import { listonT } from "../lib/barreraHallazgos.ts";

const { dias } = cargar();
const A = dias.filter((d) => d.periodo === P1);
const B = dias.filter((d) => d.periodo === P2);
console.log(`\n## ${dias.length} días · ${P1}: ${A.length} · ${P2}: ${B.length}`);

// ── LAS PRUEBAS, DECLARADAS ANTES DE MIRAR ────────────────────────────────────
export const CAND = [
  ["sigmasCorto", "≥", "25 pts ÷ straddle", "adim"],
  ["credRel", "≤", "crédito ÷ ancho (%)", "adim"],
  ["credStr", "≤", "crédito ÷ straddle", "adim"],
  ["credStr", "≥", "crédito ÷ straddle (al revés)", "adim"],
  ["straddle", "≤", "straddle del dinero (pts)", "CRUDA"],
  ["straddleP60", "≤", "percentil del straddle en 60 ses.", "adim"],
  ["ivAtm", "≤", "IV del dinero 11:00 (%)", "CRUDA"],
  ["ivPctil20", "≤", "percentil de la IV en 20 ses.", "adim"],
  ["ivRel20", "≤", "IV hoy vs media de 20 días (%)", "adim"],
  ["ivRel5", "≤", "IV hoy vs media de 5 días (%)", "adim"],
  ["rvMan", "≤", "RV de la mañana (%)", "CRUDA"],
  ["rvIv", "≤", "RV mañana ÷ IV", "adim"],
  ["rvIv", "≥", "RV mañana ÷ IV (al revés)", "adim"],
  ["rvAyerIv", "≤", "RV de ayer ÷ IV de hoy", "adim"],
  ["son25", "≥", "sonrisa a ±25 pts fijos", "CRUDA"],
  ["son15Rel", "≥", "sonrisa ±1,5% ÷ IV (%)", "CRUDA*"],
  ["son15RelP60", "≥", "percentil de la sonrisa en 60 ses.", "adim"],
  ["skew15Rel", "≥", "sesgo put−call ÷ IV (%)", "CRUDA*"],
  ["skew15RelP60", "≥", "percentil del sesgo en 60 ses.", "adim"],
  ["credRelP60", "≤", "percentil del crédito en 60 ses.", "adim"],
];
export const QS = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50];
export const PRUEBAS = CAND.length * QS.length * 2 + 38;
export const LISTON = listonT(PRUEBAS);
console.log(`   pruebas declaradas: ${PRUEBAS} (${CAND.length} señales × ${QS.length} umbrales × 2 direcciones + 38 descriptivas) → listón |t| = ${LISTON}`);

export const anos = (g) => g.length / 252;
export const cuantil = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
export const opera = (d, k, dir, u) => (d[k] == null || !Number.isFinite(d[k])) ? true : (dir === "≥" ? d[k] >= u : d[k] <= u);

export function evaluar(grupo, k, dir, u) {
  const base = resumen(grupo.map((d) => d.pl), anos(grupo));
  const sub = grupo.filter((d) => opera(d, k, dir, u));
  const filt = resumen(sub.map((d) => d.pl), anos(grupo));       // MISMOS años: no operar no alarga el año
  const perdido = base.alAno - filt.alAno;
  const quitado = Math.abs(base.racha) - Math.abs(filt.racha);
  return { base, filt, sub, perdido, quitado, ratio: quitado > 0 ? perdido / quitado : Infinity, nOp: sub.length, nQuit: grupo.length - sub.length };
}

/** ¿Le gana al AZAR? 500 sorteos quitando el MISMO número de días. */
export function contraAzar(grupo, nQuitar, sorteos = 500) {
  const base = resumen(grupo.map((d) => d.pl), anos(grupo));
  const rachas = [], perdidas = [];
  let semilla = 12345;
  const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
  for (let s = 0; s < sorteos; s++) {
    const ix = grupo.map((_, i) => i);
    for (let i = ix.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ix[i], ix[j]] = [ix[j], ix[i]]; }
    const fuera = new Set(ix.slice(0, nQuitar));
    const sub = grupo.filter((_, i) => !fuera.has(i));
    const r = resumen(sub.map((d) => d.pl), anos(grupo));
    rachas.push(Math.abs(base.racha) - Math.abs(r.racha));
    perdidas.push(base.alAno - r.alAno);
  }
  return { rachas, perdidas };
}

// ── LA BÚSQUEDA en un período, aplicada al otro ───────────────────────────────
function direccion(ajuste, prueba) {
  const filas = [];
  for (const [k, dir, nom, uni] of CAND) {
    const vals = ajuste.map((d) => d[k]).filter((x) => x != null && Number.isFinite(x));
    if (vals.length < 100) continue;
    for (const q of QS) {
      const u = dir === "≥" ? cuantil(vals, q) : cuantil(vals, 1 - q);
      const dentro = evaluar(ajuste, k, dir, u);
      const fuera = evaluar(prueba, k, dir, u);
      const serio = dentro.quitado >= 0.20 * Math.abs(dentro.base.racha);
      const muerde = fuera.nQuit >= 0.05 * prueba.length && fuera.nQuit <= 0.50 * prueba.length;
      filas.push({ k, dir, nom, uni, q, u, dentro, fuera, serio, muerde });
    }
  }
  return filas;
}

const D1 = direccion(A, B);
const D2 = direccion(B, A);

function tabla(D, nAjuste, et) {
  const cand = D.filter((f) => f.serio).sort((a, b) => a.dentro.ratio - b.dentro.ratio);
  console.log(`\n${"═".repeat(104)}`);
  console.log(`  ${et}`);
  console.log("═".repeat(104));
  console.log(`  ${D.filter((f) => f.dentro.quitado > 0).length} de ${D.length} reglas bajan algo la racha dentro de muestra · ${cand.length} la bajan EN SERIO (≥20%)`);
  console.log(`\n| regla | umbral | q | opera | ratio DENTRO | fuera: racha | fuera: $/año | fuera: ratio | ¿muerde fuera? |`);
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const f of cand.slice(0, 12)) {
    const o = f.fuera;
    console.log(`| ${f.nom} ${f.dir} | ${f.u.toFixed(3)} | ${(f.q * 100).toFixed(0)}% | ${f.dentro.nOp}/${nAjuste} | $${f.dentro.ratio.toFixed(2)} | ${eur(o.base.racha)}→${eur(o.filt.racha)} | ${eur(o.base.alAno)}→${eur(o.filt.alAno)} | ${o.quitado > 0 ? "$" + o.ratio.toFixed(2) : "NO QUITA"} | ${o.nQuit} días (${(o.nQuit / (o.nOp + o.nQuit) * 100).toFixed(0)}%) |`);
  }
  return cand;
}
const C1 = tabla(D1, A.length, `DIRECCIÓN 1 — se ELIGE con 2022-2023, se APLICA a 2024-2026`);
const C2 = tabla(D2, B.length, `DIRECCIÓN 2 — se ELIGE con 2024-2026, se APLICA a 2022-2023`);

// ── LA ELEGIDA de cada dirección, con la cola completa ────────────────────────
function detalle(f, etAj, etPr, grupoPr) {
  const d = f.dentro, o = f.fuera;
  console.log(`\n  ELEGIDA con ${etAj} delante → **${f.nom} ${f.dir} ${f.u.toFixed(4)}** (percentil ${(f.q * 100).toFixed(0)}%, unidad ${f.uni})`);
  const fila = (et, r, n) => `    ${et.padEnd(22)} $/año ${eur(r.alAno).padStart(9)} · racha ${eur(r.racha).padStart(9)} · peor ${eur(r.peor).padStart(7)} · p1 ${eur(r.p1).padStart(7)} · p5 ${eur(r.p5).padStart(7)} · ES5 ${eur(r.es5).padStart(7)} · P(>$2k) ${r.p2000.toFixed(1)}% · P(>$4k) ${r.p4000.toFixed(1)}%`;
  console.log(`   ── DENTRO (${etAj}) · opera ${d.nOp}/${d.nOp + d.nQuit}`);
  console.log(fila("sin filtro", d.base));
  console.log(fila("con filtro", d.filt));
  console.log(`   ── FUERA (${etPr}) · opera ${o.nOp}/${o.nOp + o.nQuit}`);
  console.log(fila("sin filtro", o.base));
  console.log(fila("con filtro", o.filt));
  // control del azar, fuera de muestra
  if (o.nQuit > 0) {
    const az = contraAzar(grupoPr, o.nQuit);
    const mejorQue = az.rachas.filter((x) => x < o.quitado).length / az.rachas.length * 100;
    const perdMenor = az.perdidas.filter((x) => x > o.perdido).length / az.perdidas.length * 100;
    console.log(`   ── CONTRA EL AZAR fuera de muestra (500 sorteos quitando los mismos ${o.nQuit} días):`);
    console.log(`      caída eliminada: la regla ${eur(o.quitado)} · el azar mediana ${eur(pct(az.rachas, 0.5))} → la regla está en el percentil ${mejorQue.toFixed(0)}`);
    console.log(`      ingreso perdido: la regla ${eur(o.perdido)}/año · el azar mediana ${eur(pct(az.perdidas, 0.5))}/año → percentil ${perdMenor.toFixed(0)}`);
    console.log(`      ${mejorQue >= 95 && o.quitado > 0 ? "LE GANA AL AZAR" : "NO le gana al azar: lo único que hacía era operar menos, y eso sale gratis con menos contratos"}`);
  }
  return f;
}
if (C1.length) detalle(C1[0], P1, P2, B);
if (C2.length) detalle(C2[0], P2, P1, A);

// ── ¿SOBREVIVE ALGUNA AL CRUCE EN LAS DOS DIRECCIONES? ────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log(`  ¿SOBREVIVE ALGUNA REGLA AL CRUCE EN LAS DOS DIRECCIONES?`);
console.log(`  (quita caída EN SERIO dentro de muestra · muerde fuera · quita caída fuera · en las DOS direcciones)`);
console.log("═".repeat(104));
const clave = (f) => `${f.k}|${f.dir}|${f.q}`;
const m2 = new Map(D2.map((f) => [clave(f), f]));
const sup = [];
for (const f1 of D1) {
  const f2 = m2.get(clave(f1));
  if (!f2) continue;
  const ok = f1.serio && f2.serio && f1.muerde && f2.muerde && f1.fuera.quitado > 0 && f2.fuera.quitado > 0;
  if (ok) sup.push({ f1, f2, peorRatio: Math.max(f1.fuera.ratio, f2.fuera.ratio) });
}
sup.sort((a, b) => a.peorRatio - b.peorRatio);
if (!sup.length) {
  console.log(`\n  NINGUNA de las ${CAND.length * QS.length} reglas pasa las cuatro puertas en las dos direcciones.`);
  // ¿dónde mueren?
  const cuenta = { "no quita caída EN SERIO al ajustar": 0, "no muerde fuera de muestra": 0, "no quita caída fuera": 0 };
  for (const f1 of D1) {
    const f2 = m2.get(clave(f1)); if (!f2) continue;
    if (!(f1.serio && f2.serio)) cuenta["no quita caída EN SERIO al ajustar"]++;
    else if (!(f1.muerde && f2.muerde)) cuenta["no muerde fuera de muestra"]++;
    else cuenta["no quita caída fuera"]++;
  }
  console.log(`  dónde mueren las ${CAND.length * QS.length}: ${JSON.stringify(cuenta)}`);
} else {
  console.log(`\n  ${sup.length} de ${CAND.length * QS.length} reglas pasan las cuatro puertas en las dos direcciones:\n`);
  console.log(`| regla | q | umbral 22-23 | umbral 24-26 | →24-26: racha, $/año, ratio | →22-23: racha, $/año, ratio |`);
  console.log("|---|---|---|---|---|---|");
  for (const s of sup.slice(0, 20)) {
    const a = s.f1.fuera, b = s.f2.fuera;
    console.log(`| ${s.f1.nom} ${s.f1.dir} | ${(s.f1.q * 100).toFixed(0)}% | ${s.f1.u.toFixed(3)} | ${s.f2.u.toFixed(3)} | ${eur(a.filt.racha)}, ${eur(a.filt.alAno)}, $${a.ratio.toFixed(2)} | ${eur(b.filt.racha)}, ${eur(b.filt.alAno)}, $${b.ratio.toFixed(2)} |`);
  }
  // el azar, para los supervivientes
  console.log(`\n  ── ¿LE GANAN AL AZAR? (500 sorteos por celda, quitando el mismo nº de días)\n`);
  console.log(`| regla | q | percentil vs azar →24-26 | percentil vs azar →22-23 |`);
  console.log("|---|---|---|---|");
  for (const s of sup.slice(0, 20)) {
    const az1 = contraAzar(B, s.f1.fuera.nQuit), az2 = contraAzar(A, s.f2.fuera.nQuit);
    const p1 = az1.rachas.filter((x) => x < s.f1.fuera.quitado).length / az1.rachas.length * 100;
    const p2 = az2.rachas.filter((x) => x < s.f2.fuera.quitado).length / az2.rachas.length * 100;
    console.log(`| ${s.f1.nom} ${s.f1.dir} | ${(s.f1.q * 100).toFixed(0)}% | ${p1.toFixed(0)} | ${p2.toFixed(0)} |`);
  }
}

export { dias, A, B, D1, D2, sup };
