// EL CRUCE, CON EL LISTÓN ARREGLADO · 1.121 días
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/dsem-cruce.mjs
//
// ═══ POR QUÉ HAY UN SEGUNDO SCRIPT ══════════════════════════════════════════════════════════
// En dsem-calendario.mjs la regla pre-declarada era «saltarse todo cubo con media < 0». En
// 2024-2026 eligió 9 cubos y funcionó. En 2022-2023 eligió 30 de 58 y SE SALTÓ EL 100% DE LOS
// DÍAS — porque en ese período la estrategia entera pierde ($-65/día de media), así que «por
// debajo de cero» deja de ser un filtro y se convierte en «no operar nunca».
//
// Eso no es un resultado, es un yardstick roto: la misma clase de fallo que `comprobarDescarte`
// caza cuando un filtro se come el 100% de las filas. El cero sólo es neutral si el período de
// ajuste tiene media cero, y ninguno de los dos la tiene.
//
// EL LISTÓN ARREGLADO, y sigue sin tener un solo parámetro que tocar:
//     se salta el cubo cuya media está POR DEBAJO DE LA MEDIA DEL PROPIO PERÍODO de ajuste.
// Es decir: «¿este día es peor que un día cualquiera del mismo régimen?». Neutral por
// construcción, tanto en un período alcista como en uno bajista.

import { readFileSync } from "node:fs";
import { tWelch, listonT } from "../lib/barreraHallazgos";

const PRUEBAS = 62;
const LISTON = listonT(PRUEBAS);
const CUENTA = 56389, EFECTIVO = 7977, DIAS_ANO = 252;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : NaN; };
function drawdown(pls) { let acc = 0, pico = 0, peor = 0; for (const p of pls) { acc += p; if (acc > pico) pico = acc; const dd = acc - pico; if (dd < peor) peor = dd; } return peor; }

// ── datos y calendario (mismo código que dsem-calendario.mjs) ──────────────────────────────
const filas = JSON.parse(readFileSync("scripts/dsem-filas.json", "utf8"));
const CAM = JSON.parse(readFileSync("scripts/dsem-camino.json", "utf8"));
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const FEST = new Set(["2022-01-17","2022-02-21","2022-04-15","2022-05-30","2022-06-20","2022-07-04","2022-09-05","2022-11-24","2022-12-26",
"2023-01-02","2023-01-16","2023-02-20","2023-04-07","2023-05-29","2023-06-19","2023-07-04","2023-09-04","2023-11-23","2023-12-25",
"2024-01-01","2024-01-15","2024-02-19","2024-03-29","2024-05-27","2024-06-19","2024-07-04","2024-09-02","2024-11-28","2024-12-25",
"2025-01-01","2025-01-09","2025-01-20","2025-02-17","2025-04-18","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-11-27","2025-12-25",
"2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25"]);
const MEDIO = new Set(["2022-11-25","2023-07-03","2023-11-24","2024-07-03","2024-11-29","2024-12-24","2025-07-03","2025-11-28","2025-12-24","2026-11-27","2026-12-24"]);
const iso = (d) => d.toISOString().slice(0, 10);
const SESIONES = [];
for (let d = new Date("2021-12-01T00:00:00Z"); iso(d) <= "2026-12-31"; d.setUTCDate(d.getUTCDate() + 1)) {
  const s = iso(d), w = d.getUTCDay();
  if (w !== 0 && w !== 6 && !FEST.has(s)) SESIONES.push(s);
}
const POS = new Map(SESIONES.map((s, i) => [s, i]));
const tercerViernes = (a, m) => { let n = 0; for (let d = 1; d <= 31; d++) { const dt = new Date(Date.UTC(a, m - 1, d)); if (dt.getUTCMonth() !== m - 1) break; if (dt.getUTCDay() === 5 && ++n === 3) return iso(dt); } return null; };

for (const f of filas) {
  const d = new Date(f.fecha + "T00:00:00Z"), i = POS.get(f.fecha);
  const ant = SESIONES[i - 1], sig = SESIONES[i + 1];
  const ano = +f.fecha.slice(0, 4), mes = +f.fecha.slice(5, 7), dia = +f.fecha.slice(8, 10);
  const salto = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000;
  f.dow = d.getUTCDay(); f.dom = dia; f.mes = mes; f.ano = ano;
  f.semMes = Math.ceil(dia / 7); f.domCubo = Math.min(6, Math.ceil(dia / 5));
  f.vispFest = sig && salto(f.fecha, sig) > (f.dow === 5 ? 3 : 1) ? 1 : 0;
  f.postFest = ant && salto(ant, f.fecha) > (f.dow === 1 ? 3 : 1) ? 1 : 0;
  f.medioDia = MEDIO.has(f.fecha) ? 1 : 0;
  f.primeroMes = ant.slice(5, 7) !== f.fecha.slice(5, 7) ? 1 : 0;
  f.ultimoMes = sig.slice(5, 7) !== f.fecha.slice(5, 7) ? 1 : 0;
  // posición DESDE EL FINAL del mes: 0 = último día hábil, 1 = penúltimo…
  let k = 0; while (SESIONES[i + k + 1] && SESIONES[i + k + 1].slice(0, 7) === f.fecha.slice(0, 7)) k++;
  f.posFin = k;
  f.ultimos2 = k <= 1 ? 1 : 0; f.ultimos3 = k <= 2 ? 1 : 0;
  f.primeros2 = f.primeroMes || SESIONES[i - 2].slice(5, 7) !== f.fecha.slice(5, 7) ? 1 : 0;
  const tv = tercerViernes(ano, mes), iTv = POS.get(tv);
  f.opex = f.fecha === tv ? 1 : 0;
  f.opexTrim = f.opex && [3, 6, 9, 12].includes(mes) ? 1 : 0;
  f.dAOpex = iTv != null ? i - iTv : null;
  f.semOpex = f.dAOpex != null && f.dAOpex >= -4 && f.dAOpex <= 0 ? 1 : 0;
  f.finTrim = f.ultimoMes && [3, 6, 9, 12].includes(mes) ? 1 : 0;
  f.finTrim2 = k <= 1 && [3, 6, 9, 12].includes(mes) ? 1 : 0;
  f.periodo = f.fecha < "2024-01-01" ? "A" : "B";
  // tramo final 15:30 → cierre (DESENLACE, sólo para probar el mecanismo)
  const c = CAM[f.fecha], i1530 = c.h.indexOf("15:30");
  f.zCierrePts = i1530 >= 0 ? c.s[c.s.length - 1] - c.s[i1530] : null;
  f.zCierreSig = f.zCierrePts != null && f.sigma ? Math.abs(f.zCierrePts) / f.sigma : null;
}
const A = filas.filter((f) => f.periodo === "A"), B = filas.filter((f) => f.periodo === "B");
const anosA = A.length / DIAS_ANO, anosB = B.length / DIAS_ANO, anosT = filas.length / DIAS_ANO;

const DIAS = ["dom", "LUN", "MAR", "MIE", "JUE", "VIE", "sab"];
const MESES = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const FAMILIAS = [
  { id: "dow", nom: "día de la semana", cubo: (f) => f.dow, et: (v) => DIAS[v] },
  { id: "domCubo", nom: "día del mes (tramos de 5)", cubo: (f) => f.domCubo, et: (v) => ["", "1-5", "6-10", "11-15", "16-20", "21-25", "26-31"][v] },
  { id: "semMes", nom: "semana del mes", cubo: (f) => f.semMes, et: (v) => `sem ${v}` },
  { id: "mes", nom: "mes del año", cubo: (f) => f.mes, et: (v) => MESES[v] },
  // `binaria` = familias de tipo «hoy es X / hoy no lo es». Sólo el cubo del SÍ puede saltarse:
  // el «no» son los otros 1.069 días, y como la media del período la levanta el cubo bueno, el
  // «no» siempre queda por debajo de ella y la regla se convierte en «no operar nunca». Ése es
  // el mismo fallo del listón roto, una capa más abajo: un complemento no es un tipo de día.
  { id: "opex", nom: "vencimiento mensual", cubo: (f) => f.opex, et: (v) => (v ? "OPEX" : "no-OPEX"), binaria: true },
  { id: "opexTrim", nom: "vencimiento trimestral", cubo: (f) => f.opexTrim, et: (v) => (v ? "trimestral" : "no"), binaria: true },
  { id: "semOpex", nom: "semana de vencimiento", cubo: (f) => f.semOpex, et: (v) => (v ? "semOPEX" : "no"), binaria: true },
  { id: "vispFest", nom: "víspera de festivo", cubo: (f) => f.vispFest, et: (v) => (v ? "víspera" : "no"), binaria: true },
  { id: "postFest", nom: "día siguiente a festivo", cubo: (f) => f.postFest, et: (v) => (v ? "post-fest" : "no"), binaria: true },
  { id: "medioDia", nom: "medio día", cubo: (f) => f.medioDia, et: (v) => (v ? "medioDía" : "no"), binaria: true },
  { id: "primeroMes", nom: "primer día del mes", cubo: (f) => f.primeroMes, et: (v) => (v ? "1º" : "no"), binaria: true },
  { id: "ultimoMes", nom: "último día del mes", cubo: (f) => f.ultimoMes, et: (v) => (v ? "último" : "no"), binaria: true },
  { id: "ultimos2", nom: "dos últimos del mes", cubo: (f) => f.ultimos2, et: (v) => (v ? "2últ" : "no"), binaria: true },
  { id: "finTrim", nom: "fin de trimestre", cubo: (f) => f.finTrim, et: (v) => (v ? "finTrim" : "no"), binaria: true },
];

function evaluar(base, anos, filtro) {
  const serie = base.map((f) => (filtro(f) ? 0 : f.pl));
  const op = base.filter((f) => !filtro(f)).map((f) => f.pl);
  const total = serie.reduce((a, b) => a + b, 0);
  return { nTotal: base.length, nOpera: op.length, total, alAno: total / anos,
    peor: op.length ? Math.min(...op) : 0, p1: pct(serie, 0.01), p5: pct(serie, 0.05),
    dd: drawdown(serie), acierto: op.length ? op.filter((x) => x > 0).length / op.length : NaN };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1 · EL CRUCE CON EL LISTÓN NEUTRAL
// ═════════════════════════════════════════════════════════════════════════════════════════════
const MIN_N = 20;
function elegir(ajuste, soloPeorDeFamilia = false) {
  const base = media(ajuste.map((f) => f.pl));
  const skip = [];
  for (const fam of FAMILIAS) {
    const vals = fam.binaria ? [1] : [...new Set(ajuste.map(fam.cubo))];
    const cand = [];
    for (const v of vals) {
      const g = ajuste.filter((f) => fam.cubo(f) === v);
      if (g.length < MIN_N) continue;
      const m = media(g.map((f) => f.pl));
      if (m < base) cand.push({ fam, v, n: g.length, m, exceso: m - base });
    }
    cand.sort((a, b) => a.exceso - b.exceso);
    skip.push(...(soloPeorDeFamilia ? cand.slice(0, 1) : cand));
  }
  return skip;
}
const salta = (skip) => (f) => skip.some((s) => s.fam.cubo(f) === s.v);

function cruce(nomA, aj, anAj, nomB, pr, anPr, soloPeor) {
  const skip = elegir(aj, soloPeor);
  console.log(`\n${"─".repeat(110)}`);
  console.log(`AJUSTADO EN ${nomA} → PROBADO EN ${nomB}${soloPeor ? "   [variante: sólo el PEOR cubo de cada familia]" : ""}`);
  console.log(`${"─".repeat(110)}`);
  console.log(`  cubos por debajo de la media del período (${skip.length}):  ${skip.map((s) => `${s.fam.id}=${s.fam.et(s.v)}`).join(" · ")}`);
  const f = salta(skip);
  const filas2 = [["base " + nomA, evaluar(aj, anAj, () => false)], ["filtrado " + nomA + " (donde se eligió)", evaluar(aj, anAj, f)],
                  ["base " + nomB, evaluar(pr, anPr, () => false)], ["FILTRADO " + nomB + " ⟵ FUERA DE MUESTRA", evaluar(pr, anPr, f)]];
  console.log(`\n| serie | días | opera | $/año | peor día | p1 | p5 | peor racha | acierto |`);
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const [et, r] of filas2)
    console.log(`| ${et} | ${r.nTotal} | ${r.nOpera} | ${eur(r.alAno)} | ${eur(r.peor)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.dd)} | ${(r.acierto * 100).toFixed(0)}% |`);
  const b = filas2[2][1], fl = filas2[3][1];
  const perdido = b.alAno - fl.alAno, quitado = Math.abs(b.dd) - Math.abs(fl.dd);
  console.log(`\n  FUERA DE MUESTRA: ingreso ${perdido >= 0 ? "perdido" : "GANADO"} ${eur(Math.abs(perdido))}/año · caída ${quitado >= 0 ? "eliminada" : "AUMENTADA"} ${eur(Math.abs(quitado))}`);
  console.log(`  MÉTRICA QUE DECIDE: ${quitado <= 0 ? "la caída NO baja → la regla NO sirve" : perdido <= 0 ? `GRATIS — quita ${eur(quitado)} de caída y encima suma ${eur(-perdido)}/año` : `$${(perdido / quitado).toFixed(2)} de ingreso por cada $1 de caída quitado`}`);
  return { skip, out: fl, base: b, perdido, quitado };
}
console.log("═".repeat(110));
console.log("1 · EL CRUCE EN LAS DOS DIRECCIONES, con el listón neutral (media del cubo < media del período)");
console.log("═".repeat(110));
const AB = cruce("2022-2023", A, anosA, "2024-2026", B, anosB, false);
const BA = cruce("2024-2026", B, anosB, "2022-2023", A, anosA, false);
console.log("\n" + "═".repeat(110));
console.log("2 · LA MISMA COSA, VARIANTE ESTRECHA: sólo el PEOR cubo de cada familia");
console.log("═".repeat(110));
const AB2 = cruce("2022-2023", A, anosA, "2024-2026", B, anosB, true);
const BA2 = cruce("2024-2026", B, anosB, "2022-2023", A, anosA, true);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3 · CUBO A CUBO: ¿cuál repite el signo del EXCESO en los dos períodos?
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(110));
console.log(`3 · CUBO A CUBO · exceso = media del cubo − media de SU período · listón |t| = ${LISTON} (${PRUEBAS} pruebas)`);
console.log("═".repeat(110));
const mA = media(A.map((f) => f.pl)), mB = media(B.map((f) => f.pl)), mT = media(filas.map((f) => f.pl));
console.log(`  (media de referencia: 2022-2023 ${eur(mA)}/día · 2024-2026 ${eur(mB)}/día · todo ${eur(mT)}/día)\n`);
console.log("| familia | cubo | nA | exceso A | nB | exceso B | n todo | exceso todo | t todo | repite |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const repiten = [];
for (const fam of FAMILIAS) {
  for (const v of (fam.binaria ? [1] : [...new Set(filas.map(fam.cubo))]).sort((a, b) => b - a)) {
    const gA = A.filter((f) => fam.cubo(f) === v), gB = B.filter((f) => fam.cubo(f) === v);
    const gT = filas.filter((f) => fam.cubo(f) === v), rT = filas.filter((f) => fam.cubo(f) !== v);
    if (gA.length < 8 || gB.length < 8) continue;
    const eA = media(gA.map((f) => f.pl)) - mA, eB = media(gB.map((f) => f.pl)) - mB, eT = media(gT.map((f) => f.pl)) - mT;
    const t = tWelch(gT.map((f) => f.pl), rT.map((f) => f.pl));
    const rep = Math.sign(eA) === Math.sign(eB) ? (eA < 0 ? "SÍ ↓↓" : "sí ↑↑") : "no";
    if (rep.startsWith("SÍ")) repiten.push({ fam, v, eA, eB, eT, t, nT: gT.length });
    console.log(`| ${fam.id} | ${fam.et(v)} | ${gA.length} | ${eur(eA)} | ${gB.length} | ${eur(eB)} | ${gT.length} | ${eur(eT)} | ${t.toFixed(2)} | ${rep} |`);
  }
}
console.log(`\n  CUBOS QUE REPITEN SIGNO NEGATIVO EN LOS DOS PERÍODOS (${repiten.length}), ordenados por daño:`);
repiten.sort((a, b) => a.eT - b.eT);
for (const r of repiten) console.log(`    ${r.fam.nom.padEnd(28)} ${String(r.fam.et(r.v)).padEnd(10)} n=${String(r.nT).padStart(4)}  exceso A ${eur(r.eA).padStart(8)} · B ${eur(r.eB).padStart(8)} · todo ${eur(r.eT).padStart(8)}  t=${r.t.toFixed(2)}`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4 · EL FIN DE MES A FONDO — el único candidato con un mecanismo detrás
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(110));
console.log("4 · POSICIÓN DESDE EL FINAL DEL MES · ¿es monótono?");
console.log("═".repeat(110));
console.log("| posFin (0 = último día hábil) | nA | media A | nB | media B | n todo | media todo | t todo |");
console.log("|---|---|---|---|---|---|---|---|");
for (const k of [0, 1, 2, 3, 4]) {
  const gA = A.filter((f) => f.posFin === k), gB = B.filter((f) => f.posFin === k);
  const gT = filas.filter((f) => f.posFin === k), rT = filas.filter((f) => f.posFin > 4);
  console.log(`| ${k} | ${gA.length} | ${eur(media(gA.map((f) => f.pl)))} | ${gB.length} | ${eur(media(gB.map((f) => f.pl)))} | ${gT.length} | ${eur(media(gT.map((f) => f.pl)))} | ${tWelch(gT.map((f) => f.pl), rT.map((f) => f.pl)).toFixed(2)} |`);
}
const resto = filas.filter((f) => f.posFin > 4);
console.log(`| ≥5 (el resto del mes) | ${A.filter((f) => f.posFin > 4).length} | ${eur(media(A.filter((f) => f.posFin > 4).map((f) => f.pl)))} | ${B.filter((f) => f.posFin > 4).length} | ${eur(media(B.filter((f) => f.posFin > 4).map((f) => f.pl)))} | ${resto.length} | ${eur(media(resto.map((f) => f.pl)))} | — |`);

// año a año: ¿vive en un año?
console.log(`\n  EL ÚLTIMO DÍA DEL MES, AÑO A AÑO (la criba de concentración):`);
console.log("| año | n último | media último | media resto | diferencia |");
console.log("|---|---|---|---|---|");
for (const y of [2022, 2023, 2024, 2025, 2026]) {
  const g = filas.filter((f) => f.ano === y && f.ultimoMes), r = filas.filter((f) => f.ano === y && !f.ultimoMes);
  console.log(`| ${y} | ${g.length} | ${eur(media(g.map((f) => f.pl)))} | ${eur(media(r.map((f) => f.pl)))} | ${eur(media(g.map((f) => f.pl)) - media(r.map((f) => f.pl)))} |`);
}
// tercios de tiempo
console.log(`\n  EL ÚLTIMO DÍA DEL MES, POR TERCIOS DE TIEMPO (la criba que mató a EVA):`);
const k3 = Math.floor(filas.length / 3);
for (let i = 0; i < 3; i++) {
  const g = i < 2 ? filas.slice(i * k3, (i + 1) * k3) : filas.slice(2 * k3);
  const u = g.filter((f) => f.ultimoMes), r = g.filter((f) => !f.ultimoMes);
  console.log(`    ${g[0].fecha}→${g[g.length - 1].fecha}  n último=${String(u.length).padStart(3)}  media ${eur(media(u.map((f) => f.pl))).padStart(8)}  resto ${eur(media(r.map((f) => f.pl))).padStart(7)}  dif ${eur(media(u.map((f) => f.pl)) - media(r.map((f) => f.pl))).padStart(8)}`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5 · EL MECANISMO — no la correlación
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(110));
console.log("5 · EL MECANISMO: si el fin de mes duele por el reajuste de carteras, tiene que verse EN LOS ÚLTIMOS 30 MINUTOS");
console.log("═".repeat(110));
const grupos = [["último día del mes", (f) => f.ultimoMes === 1], ["penúltimo", (f) => f.posFin === 1],
  ["fin de TRIMESTRE", (f) => f.finTrim === 1], ["resto del mes", (f) => f.posFin > 4]];
console.log("| grupo | n | mov. 11:00→cierre (pts) | mov. 15:30→cierre (pts) | 15:30→cierre en σ | % del mov. de tarde que ocurre en los últimos 30' |");
console.log("|---|---|---|---|---|---|");
for (const [et, g] of grupos) {
  const gr = filas.filter(g).filter((f) => f.zCierrePts != null);
  const tarde = media(gr.map((f) => Math.abs(f.zTardePts))), cierre = media(gr.map((f) => Math.abs(f.zCierrePts)));
  console.log(`| ${et} | ${gr.length} | ${tarde.toFixed(1)} | ${cierre.toFixed(1)} | ${media(gr.map((f) => f.zCierreSig)).toFixed(3)} | ${(cierre / tarde * 100).toFixed(0)}% |`);
}
const uCierre = filas.filter((f) => f.ultimoMes && f.zCierrePts != null).map((f) => Math.abs(f.zCierrePts));
const rCierre = filas.filter((f) => f.posFin > 4 && f.zCierrePts != null).map((f) => Math.abs(f.zCierrePts));
console.log(`\n  t del |movimiento de los últimos 30 minutos| último-día vs resto: ${tWelch(uCierre, rCierre).toFixed(2)} (listón ${LISTON})`);
const uT = filas.filter((f) => f.ultimoMes).map((f) => Math.abs(f.zTardePts));
const rT2 = filas.filter((f) => f.posFin > 4).map((f) => Math.abs(f.zTardePts));
console.log(`  t del |movimiento de toda la tarde| último-día vs resto:        ${tWelch(uT, rT2).toFixed(2)}`);
const uIv = filas.filter((f) => f.ultimoMes).map((f) => f.ivAtm), rIv = filas.filter((f) => f.posFin > 4).map((f) => f.ivAtm);
console.log(`  IV del dinero a las 11:00: último ${(media(uIv) * 100).toFixed(1)}% vs resto ${(media(rIv) * 100).toFixed(1)}%  (t=${tWelch(uIv, rIv).toFixed(2)})`);
const uCr = filas.filter((f) => f.ultimoMes).map((f) => f.credito), rCr = filas.filter((f) => f.posFin > 4).map((f) => f.credito);
console.log(`  crédito cobrado:           último ${eur(media(uCr))} vs resto ${eur(media(rCr))}  (t=${tWelch(uCr, rCr).toFixed(2)})`);
console.log(`\n  → si el movimiento de tarde es mayor pero la IV (y por tanto el crédito) NO lo compensa,`);
console.log(`    el fin de mes es un día en el que te pagan lo mismo por correr más riesgo. Ése es el mecanismo.`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6 · ¿SOBREVIVE LA CUENTA? — el efectivo es el cuello de botella, no el colateral
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(110));
console.log(`6 · LA CUENTA DE VERDAD · ${eur(CUENTA)} totales pero sólo ${eur(EFECTIVO)} en efectivo, y LAS PÉRDIDAS SALEN DEL EFECTIVO`);
console.log("═".repeat(110));
function ruina(fs, filtro, et) {
  let caja = EFECTIVO, minCaja = EFECTIVO, dia = null;
  for (const f of fs) { if (filtro(f)) continue; caja += f.pl; if (caja < minCaja) { minCaja = caja; dia = f.fecha; } }
  console.log(`  ${et.padEnd(46)} caja mínima ${eur(minCaja).padStart(9)} el ${dia ?? "—"}  ${minCaja <= 0 ? "⛔ CUENTA REVENTADA" : "sobrevive"}   caja final ${eur(caja)}`);
}
ruina(filas, () => false, "1 cóndor, todos los días, desde 2022-01");
ruina(B, () => false, "1 cóndor, todos los días, sólo desde 2024-01");
if (BA.skip.length) ruina(filas, salta(BA.skip), "1 cóndor con el filtro elegido en 2024-2026");
const soloFinMes = (f) => f.ultimos2 === 1;
ruina(filas, soloFinMes, "1 cóndor saltándose los 2 últimos días del mes");
