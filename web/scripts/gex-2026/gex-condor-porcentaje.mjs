// ¿ESTÁ EL CÓNDOR MAL ESPECIFICADO? — separación en % del índice, no en puntos fijos
//
// Uso: node scripts/gex-2026/gex-condor-porcentaje.mjs
//
// ═══ DE DÓNDE SALE ════════════════════════════════════════════════════════════════════════
// El informe del 2026-08-15 encontró que el crédito mediano del cóndor se ha deshinchado
// semestre a semestre: $1.165 → $835 → $960 → $635 → $585 → $600. Y la explicación es
// mecánica, no estadística: la estructura vende a ±25 puntos FIJOS mientras el SPX subía.
// Esos 25 puntos eran el 0,477% del índice en 2024 y son el 0,329% hoy.
//
// O sea: lleva dos años y medio acercándose al dinero sin que nadie lo decidiera, mientras el
// riesgo sigue clavado. Vende cada vez más cerca por cada vez menos dinero.
//
// ═══ LA ESPECIFICACIÓN QUE SE PRUEBA, ELEGIDA ANTES DE MIRAR ══════════════════════════════
// Cortas a un PORCENTAJE CONSTANTE del índice. Alas a 50 puntos FIJOS — porque el ala es lo
// que fija el riesgo por contrato ($5.000) y el riesgo es justo lo que la cuenta no puede
// mover ([[cuenta-real-de-lester]]). Escalar también el ala cambiaría el riesgo cada año y
// haría los años incomparables. La alternativa (escalar las dos) NO se mide aquí; si se mide
// después, cuenta como pruebas nuevas y sube el listón.
//
// Los strikes del SPX van de 5 en 5: la distancia se redondea al múltiplo de 5 más cercano.
//
// ═══ EL CRITERIO, ESCRITO ANTES DE CORRER (2026-08-15, 03:10) ═════════════════════════════
// PASA sólo si las cuatro:
//   1. La MESETA ENTERA es positiva, no una celda. Se enseñan los 7 porcentajes siempre.
//   2. Los TRES tercios de tiempo con el mismo signo.
//   3. El control en GEX NEGATIVO se queda en ~cero (hoy: +0,22%, t=0,10).
//   4. |t| por encima del listón de Bonferroni para 7 pruebas (≈2,69).
//
// Y se reporta SIEMPRE, pase o no pase:
//   · cuántos días se caen por falta de crédito y qué habrían rendido (si se caen los malos,
//     el filtro es el que gana, no la estructura),
//   · dónde caen los créditos en vivo del forward-test ($205, $410, $335, $220).
//
// No se elige la mejor celda. No se cambia el criterio después. Si la meseta no está, no está.

import { obs, med, mean, COMM } from './gex-lib-gex.mjs';

const ALA = 50;                       // puntos, fijo: fija el riesgo en $5.000
const HORA = '11:00';                 // la del hallazgo original; NO se re-barren horas aquí
const PCTS = [0.28, 0.32, 0.36, 0.40, 0.44, 0.48, 0.52];   // 7 pruebas declaradas
const LISTON_T = 2.69;                // Bonferroni para 7
const VIVOS = [205, 410, 335, 220];   // créditos reales del forward-test, en dólares

const porDiaHora = new Map();
for (const o of obs) porDiaHora.set(`${o.d} ${o.h}`, o);
const dias = [...new Set(obs.map((o) => o.d))].sort();

const atm = (o) => {
  let K = null, dif = Infinity;
  for (const k of o.calls.keys()) if (o.puts.has(k) && Math.abs(k - o.U) < dif) { dif = Math.abs(k - o.U); K = k; }
  return dif <= 10 ? K : null;
};

/** Un cóndor con la separación dada EN PUNTOS. Cruza la horquilla entera: vende al bid, compra al ask. */
function condor(o, sep) {
  const K = atm(o); if (K == null) return null;
  const Kc = K + sep, Kp = K - sep;
  const c = o.calls.get(Kc), cA = o.calls.get(Kc + ALA), p = o.puts.get(Kp), pA = o.puts.get(Kp - ALA);
  if (!c || !cA || !p || !pA) return { sinCadena: true };
  const cr = c.bid + p.bid - cA.ask - pA.ask;
  const S = o.cierre;
  const perd = Math.min(Math.max(S - Kc, 0), ALA) + Math.min(Math.max(Kp - S, 0), ALA);
  const ret = ((cr - perd) * 100 - 8 * COMM) / (ALA * 100);
  return { d: o.d, U: o.U, sep, cr, ret, sinCredito: !(cr > 0.2) || cr > ALA };
}

const est = (r) => {
  if (r.length < 15) return null;
  const m = mean(r), sd = Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1));
  return { n: r.length, m, med: med(r), t: m / (sd / Math.sqrt(r.length)), win: r.filter((x) => x > 0).length / r.length };
};

/** Corre una especificación sobre los días con el signo de GEX pedido. */
function correr(pct, gexPositivo) {
  const ops = [], tirados = [];
  let sinCadena = 0, candidatos = 0;
  for (const d of dias) {
    const o = porDiaHora.get(`${d} ${HORA}`);
    if (!o) continue;
    if (gexPositivo ? !(o.net1 > 0) : !(o.net1 < 0)) continue;
    // Separación como % del índice, redondeada al múltiplo de 5 (los strikes del SPX van de 5 en 5).
    const sep = Math.max(5, Math.round((o.U * pct / 100) / 5) * 5);
    candidatos++;
    const c = condor(o, sep);
    if (!c || c.sinCadena) { sinCadena++; continue; }
    if (c.sinCredito) { tirados.push(c); continue; }
    ops.push(c);
  }
  return { ops, tirados, sinCadena, candidatos };
}

/** Los tres tercios de tiempo, por fecha. Tres, no dos: dos mitades aprobaron un hallazgo falso. */
function tercios(ops) {
  const o = [...ops].sort((a, b) => a.d.localeCompare(b.d));
  const k = Math.floor(o.length / 3);
  return [o.slice(0, k), o.slice(k, 2 * k), o.slice(2 * k)].map((g) => ({
    desde: g[0]?.d, hasta: g[g.length - 1]?.d, ...est(g.map((x) => x.ret)),
  }));
}

console.log(`═══ CÓNDOR CON SEPARACIÓN EN % DEL ÍNDICE — alas ${ALA} pts, entrada ${HORA} ═══\n`);
console.log(`días con datos: ${dias.length} (${dias[0]} → ${dias[dias.length - 1]})`);
console.log(`el ±25 fijo de hoy equivale a: ${(100 * 25 / obs.find((o) => o.h === HORA).U).toFixed(3)}% del índice ` +
            `al principio de la serie\n`);

// ── Referencia: la especificación actual, ±25 fijos, sobre los mismos días ───────────────
{
  const ops = [];
  for (const d of dias) {
    const o = porDiaHora.get(`${d} ${HORA}`);
    if (!o || !(o.net1 > 0)) continue;
    const c = condor(o, 25);
    if (c && !c.sinCadena && !c.sinCredito) ops.push(c);
  }
  const e = est(ops.map((x) => x.ret));
  console.log(`REFERENCIA · ±25 puntos fijos (lo que corre hoy)`);
  console.log(`  n=${e.n} · ${(100 * e.m).toFixed(2)}% · t=${e.t.toFixed(2)} · acierto ${(100 * e.win).toFixed(0)}% ` +
              `· crédito mediano $${(100 * med(ops.map((x) => x.cr))).toFixed(0)}\n`);
}

// ── La meseta: los 7 porcentajes, TODOS ─────────────────────────────────────────────────
console.log('MESETA — se enseñan los siete, no el mejor:\n');
console.log('   %      n    retorno       t   acierto   crédito   sin cadena en el fichero');
const meseta = [];
for (const pct of PCTS) {
  const r = correr(pct, true);
  const { ops, tirados } = r;
  const e = est(ops.map((x) => x.ret));
  if (!e) { console.log(`  ${pct.toFixed(2)}   — muestra insuficiente`); continue; }
  const cred = 100 * med(ops.map((x) => x.cr));
  meseta.push({ pct, e, cred, ops, tirados, sinCadena: r.sinCadena, candidatos: r.candidatos });
  console.log(`  ${pct.toFixed(2)}  ${String(e.n).padStart(4)}  ${(100 * e.m).toFixed(2).padStart(7)}%  ` +
              `${e.t.toFixed(2).padStart(6)}   ${(100 * e.win).toFixed(0).padStart(4)}%   ` +
              `$${cred.toFixed(0).padStart(6)}   ${String(r.sinCadena).padStart(4)} de ${r.candidatos}`);
}

const todasPositivas = meseta.length === PCTS.length && meseta.every((m) => m.e.m > 0);
const todasSobreListon = meseta.every((m) => Math.abs(m.e.t) >= LISTON_T);
console.log(`\n  meseta entera positiva: ${todasPositivas ? 'SÍ' : 'NO'} · ` +
            `todas sobre el listón ${LISTON_T}: ${todasSobreListon ? 'SÍ' : 'NO'}`);

// ── Los tres tercios, para cada porcentaje ──────────────────────────────────────────────
console.log('\nTRES TERCIOS DE TIEMPO (el mismo signo en los tres, o no vale):\n');
for (const m of meseta) {
  const t3 = tercios(m.ops);
  const signos = t3.map((x) => (x?.m ?? 0) > 0 ? '+' : '−').join(' ');
  const ok = t3.every((x) => x && x.m > 0);
  console.log(`  ${m.pct.toFixed(2)}%  ${ok ? '✓' : '✗'}  ${signos}   ` +
              t3.map((x) => x ? `${x.desde?.slice(2)}→${x.hasta?.slice(2)} ${(100 * x.m).toFixed(2)}% (n=${x.n})` : '—').join('  ·  '));
}

// ── Control: los mismos porcentajes en días de GEX NEGATIVO. Tiene que dar ~cero ─────────
console.log('\nCONTROL — días de GEX NEGATIVO (si aquí también gana, no era el GEX):\n');
for (const pct of PCTS) {
  const { ops } = correr(pct, false);
  const e = est(ops.map((x) => x.ret));
  console.log(`  ${pct.toFixed(2)}%  ` + (e
    ? `n=${String(e.n).padStart(4)} · ${(100 * e.m).toFixed(2).padStart(6)}% · t=${e.t.toFixed(2).padStart(5)}`
    : 'muestra insuficiente'));
}

// ── Los días tirados por falta de crédito: ¿qué habrían rendido? ─────────────────────────
console.log('\nDÍAS TIRADOS POR FALTA DE CRÉDITO — si eran los malos, gana el filtro, no la estructura:\n');
for (const m of meseta) {
  if (!m.tirados.length) { console.log(`  ${m.pct.toFixed(2)}%  ninguno`); continue; }
  const e = est(m.tirados.map((x) => x.ret));
  console.log(`  ${m.pct.toFixed(2)}%  ${String(m.tirados.length).padStart(4)} días · ` +
              (e ? `habrían dado ${(100 * e.m).toFixed(2)}%` : 'muestra corta para medirlos'));
}

// ── ¿Dónde caen los créditos que está cobrando en vivo? ──────────────────────────────────
console.log('\nLOS CRÉDITOS EN VIVO CONTRA LA DISTRIBUCIÓN DE CADA ESPECIFICACIÓN:\n');
for (const m of meseta) {
  const cr = m.ops.map((x) => 100 * x.cr).sort((a, b) => a - b);
  const pct10 = cr[Math.floor(cr.length * 0.10)], pct90 = cr[Math.floor(cr.length * 0.90)];
  const dentro = VIVOS.filter((v) => v >= pct10 && v <= pct90).length;
  console.log(`  ${m.pct.toFixed(2)}%  p10=$${pct10.toFixed(0)} mediana=$${m.cred.toFixed(0)} p90=$${pct90.toFixed(0)}  ` +
              `→ ${dentro} de ${VIVOS.length} créditos en vivo caen dentro del rango p10-p90`);
}

// ── Veredicto mecánico ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(78));
const tercios3ok = meseta.every((m) => tercios(m.ops).every((x) => x && x.m > 0));
console.log(`1. meseta entera positiva ......... ${todasPositivas ? 'SÍ' : 'NO'}`);
console.log(`2. tres tercios en TODAS .......... ${tercios3ok ? 'SÍ' : 'NO'}`);
console.log(`3. |t| ≥ ${LISTON_T} en TODAS ............. ${todasSobreListon ? 'SÍ' : 'NO'}`);
console.log(`\n${todasPositivas && tercios3ok && todasSobreListon
  ? 'PASA la especificación por porcentaje. Sigue sin creerse: toca atacarla.'
  : 'NO PASA. Se dice que no pasó y por qué; no se busca la celda que sí pasaba.'}`);
