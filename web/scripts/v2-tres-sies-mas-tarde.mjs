// «LOS TRES SÍES, PERO ENTRANDO MÁS TARDE» — la regla exacta de Lester, moviendo sólo el reloj.
//
// ═══ QUÉ MIDE Y POR QUÉ ═════════════════════════════════════════════════════════════════════
//
// La regla que está en forward test dice: a las 11:00, si el SPX está por encima de su media de
// 5 sesiones Y por encima de la de 50, se vende el cóndor de ±45 con alas de 50 sobre SPXW del
// mismo día, y sólo si paga $100 o más de crédito. Un contrato, aguantado al cierre.
//
// El mapa de las 12.780 parejas de horas dice que COMPRAR 0DTE por la tarde es lo que más
// pierde (−8,93% una call al dinero entrando a las 15:05). Si comprar por la tarde pierde más,
// VENDER por la tarde debería cobrar más. Esta es la pregunta: ¿el reloj de la tarde mejora la
// regla, o simplemente cobra menos prima por el mismo riesgo?
//
// Se barre la hora de entrada por TODAS las barras de 09:35 a 15:00 (66 horas) y el umbral de
// crédito por $50/$100/$150/$200/$300 (5 umbrales). Son 330 puertas abiertas: con tantas, el
// listón de la t deja de ser 2 y sube a ≈3,7. Está contado y avisado en la salida.
//
// ═══ NADA DE MIRAR AL FUTURO ════════════════════════════════════════════════════════════════
//
// · las medias se calculan con los cierres (spot de la barra de las 16:00) de los días
//   ANTERIORES del propio banco. El cierre de hoy NO entra nunca.
// · los strikes se eligen con el spot de la barra de entrada, que es cuando se entraría.
// · precios reales: se vende al BID y se compra al ASK, las cuatro patas y dos veces
//   (lo pone estructura() de lib0dte, no se puede desactivar).
// · liquidación al intrínseco contra el spot real de las 16:00 (SPXW es europea y en efectivo).
// · comisión $0,03 por pata y contrato, 8 patas (abrir 4 + liquidar 4) = $0,24 por operación,
//   igual que el script del proyecto (scripts/tres-sies-por-ano.mjs).
// · un hueco NO es un cero: si falta un precio, estructura() devuelve null y ese día-hora se
//   cuenta aparte como hueco.
//
// ═══ EL CALENDARIO ══════════════════════════════════════════════════════════════════════════
// 1.123 días de 2022-01-03 a 2026-08-10 = 4,60 años (244 días de mercado al año, NO 252).
// Los días que se pierden por falta de media de 50 se descuentan del calendario.
//
// Uso: node --import tsx scripts/v2-tres-sies-mas-tarde.mjs

import { diasDisponibles, cargarDia, rejilla, condor, estructura, hayHora, resumen } from "./lib0dte.mjs";

const ANCHO = 45, ALA = 50, COMISION = 0.24;   // $ por operación (8 patas × $0,03)
const MA_CORTA = 5, MA_LARGA = 50;
const UMBRALES = [50, 100, 150, 200, 300];     // $ de crédito mínimo
const DIAS_ANO = 244;

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const mediana = (v) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
function caidaMax(pls) { let a = 0, pico = 0, peor = 0; for (const x of pls) { a += x; pico = Math.max(pico, a); peor = Math.min(peor, a - pico); } return peor; }

// ── LA PASADA ÚNICA sobre los 1.123 días ────────────────────────────────────────────────────
// Cargar el banco entero a memoria son varios GB. En su lugar, en una sola pasada se resume
// cada día a lo que hace falta: el cierre, y para cada una de las 66 horas de entrada el
// crédito cobrado, el resultado a vencimiento y el riesgo máximo.

const HORAS = [];
for (let h = 9, m = 35; h < 15 || (h === 15 && m === 0); ) {
  HORAS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  m += 5; if (m === 60) { m = 0; h++; }
}
console.log(`Horas de entrada barridas: ${HORAS.length} (${HORAS[0]} → ${HORAS[HORAS.length - 1]})`);

const dias = diasDisponibles();
console.log(`Días en el banco: ${dias.length} (${dias[0]} → ${dias[dias.length - 1]})`);

const t0 = Date.now();
const R = [];                     // un elemento por día
let huecosTot = 0, intentosTot = 0, diasSinBarras = 0;
for (const d of dias) {
  const dia = cargarDia(d);
  if (!dia) { diasSinBarras++; continue; }
  const cierre = dia.barras[dia.barras.length - 1].spot;
  const porHora = {};
  // referencia ±25 alas 50 a las 11:00 — para cotejar contra el $11.552/año del proyecto
  let ref25 = null;
  for (const hh of HORAS) {
    const i = hayHora(dia, hh);
    if (i < 0) { porHora[hh] = null; continue; }
    intentosTot++;
    const spot = dia.barras[i].spot;
    const r = estructura(dia, i, "vencimiento", condor(rejilla(spot), ANCHO, ALA));
    if (!r) { porHora[hh] = null; huecosTot++; continue; }
    porHora[hh] = { spot, credito: r.credito * 100, dolares: r.dolares - COMISION, riesgo: r.riesgoMax };
    if (hh === "11:00") {
      const r2 = estructura(dia, i, "vencimiento", condor(rejilla(spot), 25, ALA));
      if (r2) ref25 = { credito: r2.credito * 100, dolares: r2.dolares - COMISION, riesgo: r2.riesgoMax };
    }
  }
  R.push({ dia: d, cierre, porHora, ref25 });
}
console.log(`Pasada completa en ${((Date.now() - t0) / 1000).toFixed(1)} s · ${R.length} días leídos · ${diasSinBarras} sin barras`);
console.log(`Huecos (falta un precio en alguna pata): ${huecosTot} de ${intentosTot} intentos día-hora (${(100 * huecosTot / intentosTot).toFixed(2)} %)\n`);

// ── LAS MEDIAS, con los cierres del propio banco y sólo del pasado ───────────────────────────
const cierres = R.map((x) => x.cierre);
for (let i = 0; i < R.length; i++) {
  if (i < MA_LARGA) { R[i].ma5 = null; R[i].ma50 = null; continue; }
  R[i].ma5 = media(cierres.slice(i - MA_CORTA, i));      // D−5 … D−1
  R[i].ma50 = media(cierres.slice(i - MA_LARGA, i));     // D−50 … D−1
}
const CONMA = R.filter((x) => x.ma50 != null);
const ANOS = CONMA.length / DIAS_ANO;
console.log(`Días con las dos medias disponibles: ${CONMA.length} (${CONMA[0].dia} → ${CONMA[CONMA.length - 1].dia}) = ${ANOS.toFixed(2)} años de calendario\n`);

// ── APLICAR LA REGLA a una hora y un umbral ──────────────────────────────────────────────────
function correr(hora, umbral) {
  const ops = [];
  let sinDato = 0, si1 = 0, si2 = 0, si3 = 0;
  for (const x of CONMA) {
    const c = x.porHora[hora];
    if (!c) { sinDato++; continue; }
    const a = c.spot > x.ma5, b = c.spot > x.ma50, cc = c.credito >= umbral;
    if (a) si1++; if (b) si2++; if (cc) si3++;
    if (a && b && cc) ops.push({ dia: x.dia, pl: c.dolares, credito: c.credito, riesgo: c.riesgo });
  }
  return { ops, sinDato, si1, si2, si3 };
}

function metricas(ops) {
  const pls = ops.map((o) => o.pl);
  const r = resumen(pls);
  const orden = [...pls].sort((a, b) => a - b);
  const total = suma(pls);
  const perdidaEntera = ops.filter((o) => o.pl <= -o.riesgo * 0.99).length;
  const sin5buenos = suma(orden.slice(0, -5)) / ANOS;
  const sin5malos = suma(orden.slice(5)) / ANOS;
  return {
    n: pls.length, total, porAno: total / ANOS, media: r.media, t: r.t, aciertos: r.aciertos,
    mediana: mediana(pls), peor: Math.min(...pls), mejor: Math.max(...pls),
    caida: caidaMax(pls), perdidaEntera, sin5buenos, sin5malos,
    credMed: mediana(ops.map((o) => o.credito)),
    credMin: Math.min(...ops.map((o) => o.credito)), credMax: Math.max(...ops.map((o) => o.credito)),
  };
}
const anosDe = (ops) => {
  const as = [...new Set(ops.map((o) => o.dia.slice(0, 4)))].sort();
  return as.map((a) => {
    const s = ops.filter((o) => o.dia.startsWith(a));
    return { a, n: s.length, pl: suma(s.map((o) => o.pl)) };
  });
};

// ═══ PASO 1 — REPRODUCIR LAS 11:00 ══════════════════════════════════════════════════════════
console.log("=".repeat(100));
console.log("  PASO 1 · LA REGLA TAL CUAL, A LAS 11:00 — ¿mido lo mismo que el proyecto?");
console.log("=".repeat(100) + "\n");

const base = correr("11:00", 100);
const mB = metricas(base.ops);
console.log(`  días evaluables a las 11:00: ${CONMA.length - base.sinDato}  ·  sin cadena a esa hora: ${base.sinDato}`);
console.log(`  filtra el sí nº1 (sobre MA5):   ${base.si1}`);
console.log(`  filtra el sí nº2 (sobre MA50):  ${base.si2}`);
console.log(`  filtra el sí nº3 (crédito≥$100): ${base.si3}`);
console.log(`  LOS TRES A LA VEZ: ${mB.n} operaciones (${(mB.n / ANOS).toFixed(0)}/año)\n`);
console.log(`  crédito: mínimo ${eur(mB.credMin)} · mediano ${eur(mB.credMed)} · máximo ${eur(mB.credMax)}   [cordura: $20–$600]`);
console.log(`  total ${eur(mB.total)}  ·  **${eur(mB.porAno)}/año**  ·  mediana ${eur(mB.mediana)}  ·  media ${eur(mB.media)}`);
console.log(`  acierto ${(mB.aciertos * 100).toFixed(1)}%  ·  t=${mB.t.toFixed(2)}  ·  peor día ${eur(mB.peor)}  ·  caída máxima ${eur(mB.caida)}`);
console.log(`  días que pierden el riesgo máximo entero: ${mB.perdidaEntera}`);
console.log(`  sin los 5 mejores: ${eur(mB.sin5buenos)}/año  ·  sin los 5 peores: ${eur(mB.sin5malos)}/año`);
console.log(`  año a año: ${anosDe(base.ops).map((x) => `${x.a} ${eur(x.pl)} (${x.n})`).join(" · ")}\n`);

const ref = R.filter((x) => x.ref25).map((x) => ({ dia: x.dia, pl: x.ref25.dolares, credito: x.ref25.credito, riesgo: x.ref25.riesgo }));
const mR = metricas(ref);
console.log(`  [cotejo] cóndor ±25 alas 50 a las 11:00 TODOS los días, sin filtros: n=${mR.n} · ${eur(mR.porAno)}/año · caída ${eur(mR.caida)}`);
console.log(`           año a año: ${anosDe(ref).map((x) => `${x.a} ${eur(x.pl)}`).join(" · ")}\n`);

// ═══ PASO 2 — EL BARRIDO DE LA HORA (umbral $100, el original) ═══════════════════════════════
console.log("=".repeat(100));
console.log("  PASO 2 · MISMA REGLA, MOVIENDO SÓLO EL RELOJ (umbral $100)");
console.log("=".repeat(100) + "\n");
console.log("| hora | ops | $/año | mediana | acierto | t | crédito med | peor día | caída máx | sin 5 mejores | años en rojo |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const porHoraRes = [];
for (const h of HORAS) {
  const r = correr(h, 100);
  if (r.ops.length < 20) { console.log(`| ${h} | ${r.ops.length} | — muestra corta — |`); continue; }
  const m = metricas(r.ops);
  const aa = anosDe(r.ops);
  const rojos = aa.filter((x) => x.pl < 0).length;
  porHoraRes.push({ h, m, aa, rojos });
  console.log(`| ${h} | ${m.n} | **${eur(m.porAno)}** | ${eur(m.mediana)} | ${(m.aciertos * 100).toFixed(0)}% | ${m.t.toFixed(2)} | ${eur(m.credMed)} | ${eur(m.peor)} | ${eur(m.caida)} | ${eur(m.sin5buenos)} | ${rojos} |`);
}

console.log("\n### Año a año de cada hora (1 contrato)\n");
const anosLista = [...new Set(CONMA.map((x) => x.dia.slice(0, 4)))].sort();
console.log("| hora | " + anosLista.join(" | ") + " |");
console.log("|---|" + anosLista.map(() => "---").join("|") + "|");
for (const p of porHoraRes) {
  console.log(`| ${p.h} | ` + anosLista.map((a) => { const y = p.aa.find((z) => z.a === a); return y ? `${eur(y.pl)} (${y.n})` : "—"; }).join(" | ") + " |");
}

// ═══ PASO 3 — HORA × UMBRAL ═════════════════════════════════════════════════════════════════
console.log("\n" + "=".repeat(100));
console.log(`  PASO 3 · HORA × UMBRAL DE CRÉDITO — ${HORAS.length} horas × ${UMBRALES.length} umbrales = ${HORAS.length * UMBRALES.length} PUERTAS ABIERTAS`);
console.log("  Con 330 pruebas el listón de la t no es 2: es ≈3,7 (Bonferroni). Y sobre estos mismos");
console.log("  días el proyecto lleva ya ~300 configuraciones probadas, así que el listón real es peor.");
console.log("=".repeat(100) + "\n");
console.log("| hora | " + UMBRALES.map((u) => `$${u}`).join(" | ") + " |");
console.log("|---|" + UMBRALES.map(() => "---").join("|") + "|");
const todas = [];
for (const h of HORAS) {
  const cel = [];
  for (const u of UMBRALES) {
    const r = correr(h, u);
    if (r.ops.length < 20) { cel.push("—"); continue; }
    const m = metricas(r.ops);
    const aa = anosDe(r.ops);
    const rojos = aa.filter((x) => x.pl < 0).length;
    todas.push({ h, u, m, aa, rojos });
    cel.push(`${eur(m.porAno)} n${m.n} t${m.t.toFixed(1)}`);
  }
  console.log(`| ${h} | ${cel.join(" | ")} |`);
}

// ═══ PASO 4 — LAS QUE SOBREVIVEN ════════════════════════════════════════════════════════════
console.log("\n" + "=".repeat(100));
console.log("  PASO 4 · CRIBA — batir a las 11:00/$100 en dinero Y en caída, sin año perdedor,");
console.log("           y que no viva de 5 días (que siga positiva al quitar los 5 mejores)");
console.log("=".repeat(100) + "\n");

const vivas = todas.filter((x) => x.m.porAno > mB.porAno && Math.abs(x.m.caida) < Math.abs(mB.caida) && x.rojos === 0 && x.m.sin5buenos > 0);
console.log(`  Sobreviven ${vivas.length} de ${todas.length} celdas.\n`);
vivas.sort((a, b) => b.m.porAno - a.m.porAno);
console.log("| hora | umbral | ops | $/año | mediana | acierto | t | peor día | caída máx | sin 5 mej | sin 5 peor | pierde riesgo entero |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const v of vivas.slice(0, 25)) {
  console.log(`| ${v.h} | $${v.u} | ${v.m.n} | **${eur(v.m.porAno)}** | ${eur(v.m.mediana)} | ${(v.m.aciertos * 100).toFixed(0)}% | ${v.m.t.toFixed(2)} | ${eur(v.m.peor)} | ${eur(v.m.caida)} | ${eur(v.m.sin5buenos)} | ${eur(v.m.sin5malos)} | ${v.m.perdidaEntera} |`);
}

console.log("\n### Las supervivientes, año a año y por tercios\n");
console.log("| hora/umbral | " + anosLista.join(" | ") + " | T1 | T2 | T3 | crédito med |");
console.log("|---|" + anosLista.map(() => "---").join("|") + "|---|---|---|---|");
for (const v of vivas) {
  const o = correr(v.h, v.u).ops;
  const k = Math.floor(o.length / 3);
  const tt = [o.slice(0, k), o.slice(k, 2 * k), o.slice(2 * k)].map((s) => eur(suma(s.map((z) => z.pl))));
  console.log(`| ${v.h}/$${v.u} | ` + anosLista.map((a) => { const y = v.aa.find((z) => z.a === a); return y ? `${eur(y.pl)} (${y.n})` : "—"; }).join(" | ") + ` | ${tt.join(" | ")} | ${eur(v.m.credMed)} |`);
}

// ── la mejor, en detalle, con mitades y tercios ─────────────────────────────────────────────
const mejor = vivas[0] || todas.sort((a, b) => b.m.porAno - a.m.porAno)[0];
console.log("\n" + "=".repeat(100));
console.log(`  LA MEJOR: entrar a las ${mejor.h} con umbral de $${mejor.u}`);
console.log("=".repeat(100) + "\n");
const ops = correr(mejor.h, mejor.u).ops;
const m = metricas(ops);
console.log(`  n=${m.n} (${(m.n / ANOS).toFixed(0)}/año) · ${eur(m.porAno)}/año · mediana ${eur(m.mediana)} · media ${eur(m.media)} · t=${m.t.toFixed(2)}`);
console.log(`  acierto ${(m.aciertos * 100).toFixed(1)}% · peor día ${eur(m.peor)} · caída máxima ${eur(m.caida)} · pierden el riesgo entero: ${m.perdidaEntera}`);
console.log(`  crédito: mín ${eur(m.credMin)} · mediano ${eur(m.credMed)} · máx ${eur(m.credMax)}`);
console.log(`  sin los 5 mejores días: ${eur(m.sin5buenos)}/año · sin los 5 peores: ${eur(m.sin5malos)}/año`);
console.log(`  año a año: ${anosDe(ops).map((x) => `${x.a} ${eur(x.pl)} (${x.n})`).join(" · ")}`);
const mit = Math.floor(ops.length / 2);
const h1 = suma(ops.slice(0, mit).map((o) => o.pl)), h2 = suma(ops.slice(mit).map((o) => o.pl));
console.log(`  MITADES por operación: 1ª ${eur(h1)} (${ops[0].dia}→${ops[mit - 1].dia}) · 2ª ${eur(h2)} (${ops[mit].dia}→${ops[ops.length - 1].dia})`);
const t3 = Math.floor(ops.length / 3);
const T = [ops.slice(0, t3), ops.slice(t3, 2 * t3), ops.slice(2 * t3)];
console.log(`  TERCIOS: ${T.map((s, k) => `T${k + 1} ${eur(suma(s.map((o) => o.pl)))} (${s[0].dia}→${s[s.length - 1].dia})`).join(" · ")}`);

// mismos días, medidos con la regla original de las 11:00 — manzanas con manzanas
const diasMejor = new Set(ops.map((o) => o.dia));
const baseMismos = base.ops.filter((o) => diasMejor.has(o.dia));
console.log(`\n  [manzanas con manzanas] de esos ${ops.length} días, la regla de las 11:00 opera ${baseMismos.length}`);
console.log(`  y en ellos habría hecho ${eur(suma(baseMismos.map((o) => o.pl)))} (${eur(suma(baseMismos.map((o) => o.pl)) / ANOS)}/año)`);

// ── LA BANDA $50–$100 A SOLAS: ¿los días que añade bajar el listón ganan por sí mismos? ──────
console.log("\n### La banda de crédito $50–$100 a solas, a las 11:00 (los días que añade bajar el listón)\n");
const banda = correr("11:00", 50).ops.filter((o) => o.credito < 100);
const mBa = metricas(banda);
console.log(`  n=${mBa.n} · total ${eur(mBa.total)} (${eur(mBa.porAno)}/año) · media ${eur(mBa.media)}/op · mediana ${eur(mBa.mediana)}`);
console.log(`  acierto ${(mBa.aciertos * 100).toFixed(1)}% · t=${mBa.t.toFixed(2)} · peor día ${eur(mBa.peor)} · caída máxima ${eur(mBa.caida)}`);
console.log(`  año a año: ${anosDe(banda).map((x) => `${x.a} ${eur(x.pl)} (${x.n})`).join(" · ")}`);
console.log(`  → arriesga hasta ~$4.900 por operación para cobrar una mediana de ${eur(mBa.mediana)}.\n`);

console.log("\n" + "=".repeat(100));
console.log("  ESTO ES BACKTEST, NO RESULTADO. 330 puertas abiertas sobre los mismos días donde ya se");
console.log("  eligieron ±45, alas 50, MA5, MA50 y el $100. La hora nueva no ha sido probada nunca");
console.log("  fuera de muestra.");
console.log("=".repeat(100) + "\n");
