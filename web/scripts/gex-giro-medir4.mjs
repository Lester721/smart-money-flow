// ═══════════════════════════════════════════════════════════════════════════════════════════
// RESPETAR · GIRO (4) — EL ÚNICO CABO SUELTO: comprar el straddle al ROMPER el giro sale
//                       POSITIVO en las dos mitades. ¿Es el giro, o es la hora?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/gex-giro-medir4.mjs
//
// La tercera pasada dejó esto: comprar el straddle ATM de 0DTE al ASK real en la barra en que el
// precio rompe el giro da +$6.832/año (romper abajo) y +$10.128/año (romper arriba), positivo en
// 2022-2023 Y en 2024-2026 por separado. t = 0,77 a 1,98, por debajo del listón — pero el signo no
// se cae al partir la muestra, y eso no se puede dejar sin explicar.
//
// Hay TRES explicaciones posibles y sólo una es el giro:
//   A) EL GIRO         el nivel de gamma es especial. → un nivel al azar a la misma distancia NO
//                      debería dar lo mismo.
//   B) LA ROTURA       cualquier rotura de cualquier línea sirve. → el nivel al azar SÍ da lo mismo.
//   C) LA HORA         no hace falta rotura ninguna: comprar 0DTE hacia las 11:45 es lo que paga.
//                      → entrar a la MISMA HORA en días SIN rotura da lo mismo.
//
// Se miden las tres. La que gane manda, y si gana B o C el giro no pinta nada.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from "node:fs";

const NIV = "scripts/gex-niveles.json";
const CAM = "scripts/gex-giro-camino.json";
const SALIDA = "scripts/gex-giro-resultado4.json";
const CUENTA = 56389, EFECTIVO = 7977;
const SORTEOS = 500, VENT = 12;
const PRUEBAS_DECLARADAS = 56;   // 48 de las tres pasadas + 8 nuevas

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return NaN; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const sd = (v) => Math.sqrt(varianza(v));
const pct = (v, p) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };
const mediana = (v) => pct(v, 50);
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
function tUna(v) { if (v.length < 3) return NaN; const s = sd(v) / Math.sqrt(v.length); return s > 0 ? media(v) / s : NaN; }
function listonT(p0) { const p = 0.05 / p0 / 2, t = Math.sqrt(-2 * Math.log(p)); return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100; }
const LISTON = listonT(PRUEBAS_DECLARADAS);
function rng(s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }

const J = JSON.parse(readFileSync(NIV, "utf8"));
const CAMINO = JSON.parse(readFileSync(CAM, "utf8"));
const ANOS = { "2022-2026": 4.63, "2022-2023": 2, "2024-2026": 2.63 };

console.log("\n" + "═".repeat(98));
console.log("RESPETAR · GIRO (4) — ¿el straddle al romper el giro paga por el GIRO, por la ROTURA o por la HORA?");
console.log("═".repeat(98));
console.log(`\n   listón |t| ≥ ${LISTON} con ${PRUEBAS_DECLARADAS} pruebas declaradas · ${SORTEOS} sorteos · base $${CUENTA.toLocaleString("es-ES")}`);

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
/** P&L REAL de comprar el straddle ATM en la barra j y dejarlo vencer. Sin modelo. */
function plCompra(c, j) {
  if (c.sAsk[j] == null) return null;
  const intr = Math.abs(c.px[c.px.length - 1] - c.sK[j]) * 100;
  return { pl: intr - c.sAsk[j] * 100, coste: c.sAsk[j] * 100 };
}
/** Operaciones de una regla "romper el nivel `nivelDe`". */
function opsCruce(nivelDe, quedarse = () => true) {
  const O = [];
  for (const f of J.filas) {
    const c = CAMINO[f.fecha];
    if (!c) continue;
    const cr = primerCruce(c.px, nivelDe(f));
    if (!cr || !quedarse(cr)) continue;
    const p = plCompra(c, cr.j);
    if (!p) continue;
    O.push({ fecha: f.fecha, ano: +f.fecha.slice(0, 4), j: cr.j, hora: c.h[cr.j], baja: cr.baja, ...p });
  }
  return O;
}
function resumen(O, pn) {
  const v = O.map((o) => o.pl);
  if (v.length < 20) return null;
  return { n: v.length, porOp: +media(v).toFixed(1), alAno: Math.round(v.reduce((a, b) => a + b, 0) / ANOS[pn]), acierto: +((v.filter((x) => x > 0).length / v.length) * 100).toFixed(1), t: +tUna(v).toFixed(2), peor: Math.round(Math.min(...v)), coste: Math.round(mediana(O.map((o) => o.coste))) };
}
const R = { generado: new Date().toISOString(), liston: LISTON, pruebasDeclaradas: PRUEBAS_DECLARADAS, sorteos: SORTEOS, cuenta: CUENTA, efectivo: EFECTIVO };

// ═══ 1 · LA REGLA, TAL CUAL, PARTIDA ═══════════════════════════════════════════════════════
console.log(`\n## 1 · LA REGLA — comprar el straddle ATM de 0DTE al ASK real en la barra de la rotura`);
console.log(`   ${"lente".padEnd(6)} ${"rotura".padEnd(9)} ${"período".padEnd(11)} ${"n".padStart(5)} ${"coste med".padStart(10)} ${"$/op".padStart(9)} ${"$/año".padStart(11)} ${"acierto".padStart(8)} ${"t".padStart(7)} ${"peor".padStart(9)}`);
const BASE = {};
for (const L of ["gam", "gamD"]) {
  for (const [rn, q] of [["ABAJO", (cr) => cr.baja], ["ARRIBA", (cr) => !cr.baja], ["cualquiera", () => true]]) {
    const O = opsCruce((f) => f.niveles[L].flip, q);
    for (const [pn, pf] of [["2022-2026", () => true], ["2022-2023", (o) => o.ano <= 2023], ["2024-2026", (o) => o.ano >= 2024]]) {
      const r = resumen(O.filter(pf), pn);
      if (!r) continue;
      BASE[`${L}|${rn}|${pn}`] = r;
      R[`regla|${L}|${rn}|${pn}`] = r;
      console.log(`   ${L.padEnd(6)} ${rn.padEnd(9)} ${pn.padEnd(11)} ${String(r.n).padStart(5)} ${eur(r.coste).padStart(10)} ${eur(r.porOp).padStart(9)} ${eur(r.alAno).padStart(11)} ${r.acierto.toFixed(1).padStart(7)}% ${r.t.toFixed(2).padStart(7)}${Math.abs(r.t) >= LISTON ? "←" : " "} ${eur(r.peor).padStart(9)}`);
    }
  }
}

// ═══ 2 · CONTROL A/B — nivel AL AZAR a la misma distancia (baraja) ══════════════════════════
console.log(`\n## 2 · ¿ES EL GIRO? — 500 barajas: la distancia con signo del día i, al camino del día j`);
console.log(`   ${"lente".padEnd(6)} ${"rotura".padEnd(9)} ${"$/año real".padStart(11)} ${"azar p50".padStart(10)} ${"azar p95".padStart(10)} ${"percentil".padStart(10)}  veredicto`);
const azar = rng(20260822);
for (const L of ["gam", "gamD"]) {
  const conFlip = J.filas.filter((f) => f.niveles[L].flip != null);
  const pos = new Map(conFlip.map((f, i) => [f.fecha, i]));
  const dists = conFlip.map((f) => f.niveles[L].dFlip.pts);
  const nulos = { ABAJO: [], ARRIBA: [], cualquiera: [] };
  for (let k = 0; k < SORTEOS; k++) {
    const perm = dists.slice();
    for (let i = perm.length - 1; i > 0; i--) { const r = Math.floor(azar() * (i + 1)); [perm[i], perm[r]] = [perm[r], perm[i]]; }
    const nivelDe = (f) => { const i = pos.get(f.fecha); return i == null ? null : f.apertura + perm[i]; };
    for (const [rn, q] of [["ABAJO", (cr) => cr.baja], ["ARRIBA", (cr) => !cr.baja], ["cualquiera", () => true]]) {
      const r = resumen(opsCruce(nivelDe, q), "2022-2026");
      if (r) nulos[rn].push(r.alAno);
    }
  }
  for (const rn of ["ABAJO", "ARRIBA", "cualquiera"]) {
    const real = BASE[`${L}|${rn}|2022-2026`].alAno, nn = nulos[rn];
    const per = (nn.filter((x) => x < real).length / nn.length) * 100;
    R[`azar$|${L}|${rn}`] = { real, p50: Math.round(mediana(nn)), p95: Math.round(pct(nn, 95)), percentil: +per.toFixed(1) };
    console.log(`   ${L.padEnd(6)} ${rn.padEnd(9)} ${eur(real).padStart(11)} ${eur(mediana(nn)).padStart(10)} ${eur(pct(nn, 95)).padStart(10)} ${per.toFixed(1).padStart(9)}%  ${per >= 95 ? "LE GANA AL AZAR" : "no le gana al azar"}`);
  }
}

// ═══ 3 · CONTROL C — la MISMA HORA, sin rotura ninguna ═════════════════════════════════════
// Si comprar 0DTE a media sesión paga por sí solo, el giro no está aportando nada. Se replica el
// reparto de horas de entrada de la regla real, pero sobre días SORTEADOS (con y sin rotura).
console.log(`\n## 3 · ¿ES LA HORA? — misma hora de entrada, días al azar, SIN condición de rotura`);
console.log(`   ${"lente".padEnd(6)} ${"rotura".padEnd(9)} ${"$/año real".padStart(11)} ${"misma hora p50".padStart(15)} ${"p95".padStart(10)} ${"percentil".padStart(10)}  veredicto`);
const azar3 = rng(20260823);
const TODOS = J.filas.map((f) => f.fecha).filter((d) => CAMINO[d]);
for (const L of ["gam", "gamD"]) {
  for (const rn of ["ABAJO", "ARRIBA", "cualquiera"]) {
    const q = rn === "ABAJO" ? (cr) => cr.baja : rn === "ARRIBA" ? (cr) => !cr.baja : () => true;
    const O = opsCruce((f) => f.niveles[L].flip, q);
    const horasJ = O.map((o) => o.j);                 // el mismo reparto de barras de entrada
    const nn = [];
    for (let k = 0; k < SORTEOS; k++) {
      const v = [];
      for (const j of horasJ) {
        const d = TODOS[Math.floor(azar3() * TODOS.length)];
        const p = plCompra(CAMINO[d], j);
        if (p) v.push(p.pl);
      }
      if (v.length > 20) nn.push(v.reduce((a, b) => a + b, 0) / ANOS["2022-2026"]);
    }
    const real = BASE[`${L}|${rn}|2022-2026`].alAno;
    const per = (nn.filter((x) => x < real).length / nn.length) * 100;
    R[`hora$|${L}|${rn}`] = { real, p50: Math.round(mediana(nn)), p95: Math.round(pct(nn, 95)), percentil: +per.toFixed(1) };
    console.log(`   ${L.padEnd(6)} ${rn.padEnd(9)} ${eur(real).padStart(11)} ${eur(mediana(nn)).padStart(15)} ${eur(pct(nn, 95)).padStart(10)} ${per.toFixed(1).padStart(9)}%  ${per >= 95 ? "LE GANA A LA HORA" : "no le gana a comprar a esa hora sin más"}`);
  }
}

// ═══ 4 · LA COMPARACIÓN DIRECTA — comprar TODOS los días a la misma hora ════════════════════
console.log(`\n## 4 · SIN GIRO NINGUNO — comprar el straddle a una hora FIJA, todos los días`);
console.log(`   si esto ya paga, el giro sólo está seleccionando 1 de cada 5 días de algo que funciona solo`);
console.log(`   ${"hora".padEnd(7)} ${"n".padStart(5)} ${"coste med".padStart(10)} ${"$/op".padStart(9)} ${"$/año".padStart(11)} ${"acierto".padStart(8)} ${"t".padStart(7)} ${"22-23 $/año".padStart(12)} ${"24-26 $/año".padStart(12)}`);
for (const jj of [0, 12, 24, 27, 36, 48, 60]) {
  const O = [];
  for (const f of J.filas) {
    const c = CAMINO[f.fecha];
    if (!c || jj >= c.px.length) continue;
    const p = plCompra(c, jj);
    if (p) O.push({ ano: +f.fecha.slice(0, 4), ...p });
  }
  const r = resumen(O, "2022-2026");
  const a = resumen(O.filter((o) => o.ano <= 2023), "2022-2023"), b = resumen(O.filter((o) => o.ano >= 2024), "2024-2026");
  R[`horaFija|${jj}`] = { hora: CAMINO[J.filas[0].fecha].h[jj], ...r, a2223: a ? a.alAno : null, b2426: b ? b.alAno : null };
  console.log(`   ${CAMINO[J.filas[0].fecha].h[jj].padEnd(7)} ${String(r.n).padStart(5)} ${eur(r.coste).padStart(10)} ${eur(r.porOp).padStart(9)} ${eur(r.alAno).padStart(11)} ${r.acierto.toFixed(1).padStart(7)}% ${r.t.toFixed(2).padStart(7)}  ${eur(a ? a.alAno : null).padStart(11)} ${eur(b ? b.alAno : null).padStart(12)}`);
}

// ═══ 5 · LA CUENTA DE VERDAD ═══════════════════════════════════════════════════════════════
console.log(`\n## 5 · LA CUENTA — cuántos contratos caben y qué pasa el peor día`);
const O = opsCruce((f) => f.niveles.gam.flip, () => true);
const costeMed = mediana(O.map((o) => o.coste)), peor = Math.min(...O.map((o) => o.pl));
const nContr = Math.floor(EFECTIVO / costeMed);
R.cuenta = { costeMediano: Math.round(costeMed), efectivo: EFECTIVO, contratos: nContr, peorDia1: Math.round(peor), peorDiaN: Math.round(peor * nContr), peorPctCuenta: +((Math.abs(peor * nContr) / CUENTA) * 100).toFixed(1) };
console.log(`   coste mediano de un straddle en la barra de la rotura: ${eur(costeMed)} · efectivo disponible ${eur(EFECTIVO)}`);
console.log(`   caben ${nContr} contratos. El PEOR día de los ${O.length} fue ${eur(peor)} por contrato = ${eur(peor * nContr)} con ${nContr}, un ${((Math.abs(peor * nContr) / CUENTA) * 100).toFixed(1)}% de la cuenta en una sesión.`);
console.log(`   días con rotura: ${O.length} en ${J.filas.length} sesiones = ${((O.length / J.filas.length) * 100).toFixed(1)}% (1 de cada ${(J.filas.length / O.length).toFixed(1)} días).`);

// ═══ 6 · VEREDICTO ═════════════════════════════════════════════════════════════════════════
console.log(`\n## 6 · VEREDICTO`);
const ganaAzar = Object.entries(R).filter(([k, v]) => k.startsWith("azar$|") && v.percentil >= 95).map(([k]) => k);
const ganaHora = Object.entries(R).filter(([k, v]) => k.startsWith("hora$|") && v.percentil >= 95).map(([k]) => k);
const pasaListon = Object.entries(R).filter(([k, v]) => k.startsWith("regla|") && Number.isFinite(v.t) && Math.abs(v.t) >= LISTON).map(([k, v]) => `${k} t=${v.t}`);
console.log(`   A) es el GIRO — le gana a un nivel al azar a la misma distancia: ${ganaAzar.length ? ganaAzar.join(" · ") : "NINGUNO"}`);
console.log(`   C) es la HORA — le gana a comprar a esa misma hora sin rotura:   ${ganaHora.length ? ganaHora.join(" · ") : "NINGUNO"}`);
console.log(`   pasa el listón de significación:                                ${pasaListon.length ? pasaListon.join(" · ") : "NINGUNO"}`);
R.veredicto = { ganaAlAzar: ganaAzar, ganaALaHora: ganaHora, pasaListon };
writeFileSync(SALIDA, JSON.stringify(R, null, 1));
console.log(`\n   escrito: ${SALIDA}\n`);
