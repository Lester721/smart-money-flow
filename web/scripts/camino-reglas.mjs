// CAMINO · PASO 3 — las REGLAS DE MESA, ajustadas en un período y probadas en el otro.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/camino-reglas.mjs
//
// REGLA DE HIERRO: el parámetro se elige mirando SÓLO un período y se aplica tal cual al otro.
// Después al revés. Sólo cuenta lo que funciona en las dos direcciones.
//
// SOBRE LA MÉTRICA QUE PIDIÓ LESTER — "dólares de ingreso perdidos por cada dólar de caída
// eliminado". La calculo y la enseño, pero NO se puede usar para elegir: en 2022-2023 el cóndor
// base PIERDE $30.371, así que casi cualquier freno mejora el ingreso Y la caída a la vez, el
// numerador sale negativo y "el precio más bajo" premia a la regla más rara del cuadro. Elegir con
// ella habría sido exactamente el error del filtro de amplitud. Se elige con dos criterios fijados
// ANTES de mirar, los dos atados a la cuenta:
//   CRIT-1 (protección): entre las reglas cuyo PEOR DÍA no pasa de $2.000 (el 25% del efectivo),
//                        la que más dinero deja en el período de ajuste.
//   CRIT-2 (racha):      entre las que dejan la peor racha en la MITAD o menos de la del base,
//                        la que más dinero deja.
//
// Salidas con PRECIOS REALES: se recompra lo vendido al ASK y se vende lo comprado al BID, en la
// marca de 5 minutos en que salta la regla. Última marca en la que se deja salir: 15:45 — las
// cotizaciones de 15:50 a 16:00 se ensanchan con la subasta de cierre (45 de 68.442 marcas dan un
// coste de cierre por encima del ancho del ala, y 39 de esas 45 caen en esos diez minutos).

import { radiografia } from "../lib/radiografia";
import { listonT, tWelch } from "../lib/barreraHallazgos";
import { cargar, media, pct, eur, peorRacha, periodo, P1, P2, COMM, PATAS, EFECTIVO, COLATERAL } from "./camino-lib.mjs";

const dias = cargar();
const ULTIMA = "15:45";
const TOPE_DIA = 2000;        // el 25% del efectivo de Lester — fijado antes de mirar nada

for (const d of dias) {
  d.iFin = d.h.indexOf(ULTIMA);
  d.mC = d.sp.map((s) => d.KC - s);      // margen del lado call
  d.mP = d.sp.map((s) => s - d.KP);      // margen del lado put
}
radiografia(dias, ["pl", "cred", "s11"], "reglas");

const perdCall = (S, K, ala) => Math.min(Math.max(S - K, 0), ala - K);
const perdPut = (S, K, ala) => Math.min(Math.max(K - S, 0), K - ala);

/** Simula un día bajo una regla. Devuelve el P&L en dólares por contrato. */
function aplicar(d, r) {
  if (r.tipo === "b2") {                                   // cada vertical se gestiona sola
    let costeC = null, costeP = null;
    for (let i = 0; i <= d.iFin; i++) {
      if (costeC == null && d.mC[i] <= r.U && d.salC[i] != null && (!r.hasta || d.h[i] < r.hasta)) costeC = d.salC[i];
      if (costeP == null && d.mP[i] <= r.U && d.salP[i] != null && (!r.hasta || d.h[i] < r.hasta)) costeP = d.salP[i];
    }
    const cC = costeC ?? perdCall(d.cierre, d.KC, d.KCL);
    const cP = costeP ?? perdPut(d.cierre, d.KP, d.KPL);
    return (d.cred - cC - cP) * 100 - PATAS * COMM;
  }
  for (let i = 0; i <= d.iFin; i++) {
    if (!r.dispara(d, i)) continue;
    if (r.tipo === "entero") {
      if (d.sal[i] == null) continue;
      return (d.cred - d.sal[i]) * 100 - PATAS * COMM;
    }
    const esCall = d.mC[i] < d.mP[i];                       // el lado tocado es el más cercano
    const coste = esCall ? d.salC[i] : d.salP[i];
    if (coste == null) continue;
    const otro = esCall ? perdPut(d.cierre, d.KP, d.KPL) : perdCall(d.cierre, d.KC, d.KCL);
    return (d.cred - coste - otro) * 100 - PATAS * COMM;
  }
  return d.pl;
}

// ═══ la parrilla ═════════════════════════════════════════════════════════════════════════════
const UMB = [10, 5, 2.5, 0, -5, -10, -15, -20];
const reglas = [];
for (const U of UMB) reglas.push({ id: `A · cerrar TODO si el margen ≤ ${U}`, tipo: "entero", dispara: (d, i) => Math.min(d.mC[i], d.mP[i]) <= U });
for (const U of UMB) reglas.push({ id: `B · cerrar el LADO tocado si su margen ≤ ${U}`, tipo: "lado", dispara: (d, i) => Math.min(d.mC[i], d.mP[i]) <= U });
for (const U of UMB) reglas.push({ id: `B2 · cada vertical se cierra sola al llegar a ${U}`, tipo: "b2", U });
for (const k of [1.5, 2, 3, 4, 6]) reglas.push({ id: `C · stop a ${k}× el crédito`, tipo: "entero", dispara: (d, i) => d.sal[i] != null && d.sal[i] >= k * d.cred });
for (const H of ["12:00", "13:00", "13:30", "14:00", "14:30", "15:00"]) reglas.push({ id: `D · a las ${H}, si está roto fuera`, tipo: "entero", dispara: (d, i) => d.h[i] === H && Math.min(d.mC[i], d.mP[i]) < 0 });
for (const L of ["12:00", "13:00", "14:00"]) for (const U of [0, -10]) reglas.push({ id: `E · TODO si margen ≤ ${U} antes de ${L}`, tipo: "entero", dispara: (d, i) => d.h[i] < L && Math.min(d.mC[i], d.mP[i]) <= U });
for (const L of ["12:00", "13:00", "14:00"]) for (const U of [0, -10]) reglas.push({ id: `F · LADO si margen ≤ ${U} antes de ${L}`, tipo: "lado", dispara: (d, i) => d.h[i] < L && Math.min(d.mC[i], d.mP[i]) <= U });

const PRUEBAS = reglas.length * 2;    // cada regla se mide en los dos períodos
const LISTON = listonT(PRUEBAS);
console.log(`\n## ${reglas.length} reglas × 2 períodos = ${PRUEBAS} pruebas · listón de |t| (Bonferroni) = ${LISTON}`);

// ═══ métricas ════════════════════════════════════════════════════════════════════════════════
const metricas = (p) => ({
  n: p.length, total: p.reduce((a, x) => a + x, 0), media: media(p), p1: pct(p, 0.01), p5: pct(p, 0.05),
  peor: Math.min(...p), racha: peorRacha(p), gan: p.filter((x) => x > 0).length / p.length,
  anual: (p.reduce((a, x) => a + x, 0) / p.length) * 252,
});
const grupo = { [P1]: dias.filter((d) => periodo(d.f) === P1), [P2]: dias.filter((d) => periodo(d.f) === P2), TODO: dias };
const base = Object.fromEntries(Object.entries(grupo).map(([k, v]) => [k, metricas(v.map((d) => d.pl))]));

const R = reglas.map((r) => {
  const o = { id: r.id, r, m: {}, pls: {} };
  for (const P of Object.keys(grupo)) {
    const pls = grupo[P].map((d) => aplicar(d, r));
    o.pls[P] = pls;
    const m = metricas(pls);
    m.ingresoPerdido = base[P].total - m.total;
    m.rachaEliminada = Math.abs(base[P].racha) - Math.abs(m.racha);
    m.peorEliminado = Math.abs(base[P].peor) - Math.abs(m.peor);
    m.precio = m.rachaEliminada > 0 ? m.ingresoPerdido / m.rachaEliminada : Infinity;
    m.t = tWelch(pls, grupo[P].map((d) => d.pl));
    o.m[P] = m;
  }
  return o;
});

const pr = (x) => (x === Infinity ? "no quita" : x.toFixed(2));
console.log(`\n\n═══ LAS ${reglas.length} REGLAS EN LOS DOS PERÍODOS (1 contrato, precios reales) ═══`);
console.log(`\nBase, aguantar siempre:  2022-2023 → total ${eur(base[P1].total)} · ${eur(base[P1].anual)}/año · peor día ${eur(base[P1].peor)} · peor racha ${eur(base[P1].racha)}`);
console.log(`                         2024-2026 → total ${eur(base[P2].total)} · ${eur(base[P2].anual)}/año · peor día ${eur(base[P2].peor)} · peor racha ${eur(base[P2].racha)}\n`);
console.log("| regla | 22-23 $/año | peor día | p5 | racha | 24-26 $/año | peor día | p5 | racha |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const o of R) {
  const a = o.m[P1], b = o.m[P2];
  console.log(`| ${o.id} | ${eur(a.anual)} | ${eur(a.peor)} | ${eur(a.p5)} | ${eur(a.racha)} | ${eur(b.anual)} | ${eur(b.peor)} | ${eur(b.p5)} | ${eur(b.racha)} |`);
}

// ═══ EL CRUCE ════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ EL CRUCE ═══`);
const criterios = [
  { nom: `CRIT-1 protección: peor día ≥ −$${TOPE_DIA}`, ok: (m) => m.peor >= -TOPE_DIA },
  { nom: `CRIT-2 racha: peor racha ≤ la mitad de la del base`, ok: (m, P) => Math.abs(m.racha) <= Math.abs(base[P].racha) / 2 },
];
const cruces = [];
for (const c of criterios) {
  for (const [aj, pb] of [[P1, P2], [P2, P1]]) {
    const cand = R.filter((o) => c.ok(o.m[aj], aj));
    console.log(`\n── ${c.nom} · AJUSTADO EN ${aj} → PROBADO EN ${pb} ──`);
    if (!cand.length) { console.log(`   ninguna de las ${reglas.length} reglas cumple el criterio en ${aj}.`); continue; }
    const g = cand.reduce((x, y) => (x.m[aj].total >= y.m[aj].total ? x : y));
    const a = g.m[aj], b = g.m[pb];
    console.log(`   ${cand.length} reglas cumplen. Elegida (la que más deja en ${aj}): ${g.id}`);
    console.log(`     ajuste  ${aj}: ${eur(a.anual)}/año · peor día ${eur(a.peor)} · p5 ${eur(a.p5)} · racha ${eur(a.racha)} · precio ${pr(a.precio)}`);
    console.log(`     PRUEBA  ${pb}: ${eur(b.anual)}/año · peor día ${eur(b.peor)} · p5 ${eur(b.p5)} · racha ${eur(b.racha)} · precio ${pr(b.precio)}`);
    const cumpleFuera = c.ok(b, pb);
    console.log(`     ¿el criterio se sostiene fuera de muestra? ${cumpleFuera ? "SÍ" : "NO"} · base en ${pb}: peor día ${eur(base[pb].peor)}, racha ${eur(base[pb].racha)}`);
    cruces.push({ crit: c.nom, aj, pb, g, cumpleFuera });
  }
}

// ═══ ¿ALGUNA REGLA CUMPLE EN LOS DOS PERÍODOS A LA VEZ? ══════════════════════════════════════
for (const c of criterios) {
  const dobles = R.filter((o) => c.ok(o.m[P1], P1) && c.ok(o.m[P2], P2));
  console.log(`\n\n═══ REGLAS QUE CUMPLEN ${c.nom} EN LOS DOS PERÍODOS (${dobles.length}) ═══`);
  if (!dobles.length) { console.log("   ninguna."); continue; }
  console.log("\n| regla | $/año 22-23 | $/año 24-26 | peor día 22-23 | peor día 24-26 | racha 22-23 | racha 24-26 | precio 22-23 | precio 24-26 |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const o of dobles.sort((x, y) => y.m.TODO.total - x.m.TODO.total)) {
    const a = o.m[P1], b = o.m[P2];
    console.log(`| ${o.id} | ${eur(a.anual)} | ${eur(b.anual)} | ${eur(a.peor)} | ${eur(b.peor)} | ${eur(a.racha)} | ${eur(b.racha)} | ${pr(a.precio)} | ${pr(b.precio)} |`);
  }
}

// ═══ LAS QUE GANAN DINERO EN LOS DOS PERÍODOS ════════════════════════════════════════════════
console.log(`\n\n═══ REGLAS CON $/AÑO POSITIVO EN LOS DOS PERÍODOS (el base NO lo es: ${eur(base[P1].anual)} vs ${eur(base[P2].anual)}) ═══\n`);
const pos = R.filter((o) => o.m[P1].anual > 0 && o.m[P2].anual > 0).sort((x, y) => Math.min(y.m[P1].anual, y.m[P2].anual) - Math.min(x.m[P1].anual, x.m[P2].anual));
console.log("| regla | $/año 22-23 | $/año 24-26 | $/año todo | peor día | p1 | p5 | racha 22-26 | t vs base 22-23 | t vs base 24-26 |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const o of pos) {
  const a = o.m[P1], b = o.m[P2], T = o.m.TODO;
  console.log(`| ${o.id} | ${eur(a.anual)} | ${eur(b.anual)} | ${eur(T.anual)} | ${eur(T.peor)} | ${eur(T.p1)} | ${eur(T.p5)} | ${eur(T.racha)} | ${a.t.toFixed(2)} | ${b.t.toFixed(2)} |`);
}
if (!pos.length) console.log("   ninguna.");

// ═══ LA CUENTA ═══════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ LA CUENTA DE LESTER · efectivo $${EFECTIVO.toLocaleString("es-ES")} · colateral $${COLATERAL.toLocaleString("es-ES")}/cóndor · poder de compra $73.874 ═══`);
console.log(`\nLas pérdidas salen del EFECTIVO. Tamaño = efectivo ÷ peor racha por contrato, sin pasar de`);
console.log(`${Math.floor(73874 / COLATERAL)} contratos (lo que deja el poder de compra).\n`);
console.log("| estrategia | racha 22-26 | racha 24-26 | contratos (racha 22-26) | $/año a ese tamaño | contratos (sólo 24-26) | $/año |");
console.log("|---|---|---|---|---|---|---|");
function fila(nom, m22, m24) {
  const n1 = Math.max(0, Math.min(Math.floor(EFECTIVO / Math.abs(m22.racha)), Math.floor(73874 / COLATERAL)));
  const n2 = Math.max(0, Math.min(Math.floor(EFECTIVO / Math.abs(m24.racha)), Math.floor(73874 / COLATERAL)));
  console.log(`| ${nom} | ${eur(m22.racha)} | ${eur(m24.racha)} | ${n1} | ${n1 ? eur(m22.anual * n1) : "no cabe ni 1"} | ${n2} | ${n2 ? eur(m24.anual * n2) : "no cabe ni 1"} |`);
}
fila("aguantar siempre (base)", base.TODO, base[P2]);
for (const o of [...pos.slice(0, 4), ...R.filter((x) => x.m.TODO.peor >= -TOPE_DIA).slice(0, 3)]) fila(o.id, o.m.TODO, o.m[P2]);
