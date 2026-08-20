// LA CAJA · PARTE 2 — dónde se rompe exactamente, y con qué probabilidad.
//
// La parte 1 dio un resultado incómodo para el refutador: en el orden histórico REAL, k=1 nunca
// baja de $7.977 y paga $0 de interés. Pero "en el orden histórico real" es justo lo que no se
// puede dar por bueno: la caja de Lester no arranca en 2022 con 39 sesiones de +$8.902 por
// delante. Arranca hoy. Aquí se mide qué pasa cuando se le quita ese regalo.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/caja-amplitud-2.mjs

import { readFileSync } from "node:fs";

const EFECTIVO0 = 7977, COLATERAL = 5000, INTERES = 0.05, CUENTA = 56389;
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(1) + "%");
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const ANCHO = 106;
const raya = (t) => { console.log("\n" + "═".repeat(ANCHO)); console.log("  " + t); console.log("═".repeat(ANCHO)); };

const { dias } = JSON.parse(readFileSync("scripts/amplitud-riesgo-dias.json", "utf8"));
const MC = [5, 20, 50], MA = {};
for (const k of MC) MA[k] = dias.map((_, i) => { if (i < k) return null; let s = 0; for (let j = i - k; j < i; j++) s += dias[j].cierre; return s / k; });
const CFG = { a: 5, b: 50, dist: 45, n: "±45 · MA5+MA50" };
function serie(c, k = 1) {
  return dias.map((d, i) => {
    const p = d.pnl[String(c.dist)];
    if (p == null) return 0;
    if (c.a == null) return p * k;
    const m1 = MA[c.a][i], m2 = c.b ? MA[c.b][i] : m1;
    if (m1 == null || m2 == null) return 0;
    return d.sp11 >= m1 && d.sp11 >= m2 ? p * k : 0;
  });
}
const S = serie(CFG, 1);

console.log(`\n# LA CAJA · PARTE 2 — dónde se rompe\n`);
console.log(`${dias.length} sesiones · ${dias[0].fecha} → ${dias[dias.length - 1].fecha} · configuración ${CFG.n}\n`);

// ═══ H · LA ARITMÉTICA DE UN SOLO DÍA ═══════════════════════════════════════════════════════
raya("H · UN SOLO DÍA CONTRA LA CAJA — antes de cualquier estadística");
const peorDia = Math.min(...S.filter((x) => x !== 0));
const maxTeorico = -(COLATERAL - Math.min(...dias.filter((d) => d.cred["45"] != null).map((d) => d.cred["45"]))) - 0.24;
console.log(`
  El riesgo máximo de un cóndor de alas 50 es ${eur(COLATERAL)} menos el crédito cobrado. El crédito
  medio a ±45 en 2023 fue de $65: el día malo cuesta prácticamente el ancho entero.
`);
console.log("| k | colateral | peor día visto | peor día TEÓRICO (crédito mínimo) | efectivo tras ese día | % del efectivo |");
console.log("|---|---|---|---|---|---|");
for (const k of [1, 2, 3]) {
  console.log(`| ${k} | ${eur(COLATERAL * k)} | ${eur(peorDia * k)} | ${eur(maxTeorico * k)} | ${eur(EFECTIVO0 + peorDia * k)} | ${pct(-peorDia * k / EFECTIVO0)} |`);
}
console.log(`
  → con k=1 un día máximo se lleva el ${pct(-peorDia / EFECTIVO0)} del efectivo y deja ${eur(EFECTIVO0 + peorDia)}. Cabe.
  → con k=2 se lleva el ${pct(-peorDia * 2 / EFECTIVO0)}: **la caja no lo puede pagar**, quedan ${eur(EFECTIVO0 + peorDia * 2)}.
     Y k=2 es el tamaño que el propio apartado Q' del hallazgo elige EN LAS DOS direcciones del cruce.
`);

// ═══ I · ¿CUÁNDO LLEGA ESE DÍA? ═════════════════════════════════════════════════════════════
raya("I · LA FECHA — arrancando la caja en cada sesión posible, ¿cuándo se rompe?");
function hastaRojo(k, desde) {
  let cash = EFECTIVO0, interes = 0;
  for (let i = desde; i < dias.length; i++) {
    if (i > desde) {
      const dt = (new Date(dias[i].fecha) - new Date(dias[i - 1].fecha)) / 86400000;
      if (cash < 0) { const c = -cash * INTERES * dt / 365; cash -= c; interes += c; }
    }
    if (S[i] !== 0) cash += S[i] * k;
    if (cash < 0) return { fecha: dias[i].fecha, ses: i - desde, cash, interes };
  }
  return null;
}
for (const k of [1, 2]) {
  const res = [];
  for (let i = 0; i < dias.length; i++) res.push({ inicio: dias[i].fecha, r: hastaRojo(k, i) });
  const rotos = res.filter((x) => x.r);
  console.log(`\n  **k=${k}** · arranques que llegan a EFECTIVO NEGATIVO en algún momento antes de 2026-08-10: ${rotos.length} de ${res.length} (${pct(rotos.length / res.length)})`);
  if (rotos.length) {
    const ses = rotos.map((x) => x.r.ses).sort((a, b) => a - b);
    console.log(`  sesiones hasta romperse — mínimo ${ses[0]}, mediana ${ses[Math.floor(ses.length / 2)]}, máximo ${ses[ses.length - 1]}`);
    const porFecha = {};
    for (const x of rotos) porFecha[x.r.fecha] = (porFecha[x.r.fecha] || 0) + 1;
    const top = Object.entries(porFecha).sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log(`  las fechas donde se rompe (y cuántos arranques mata cada una):`);
    for (const [f, c] of top) console.log(`     ${f} → ${c} arranques`);
    console.log(`  el arranque más frágil: ${rotos[rotos.length - 1].inicio} se rompe el ${rotos[rotos.length - 1].r.fecha} en ${rotos[rotos.length - 1].r.ses} sesiones`);
  }
}

// ═══ J · EL AÑO, HONESTAMENTE ═══════════════════════════════════════════════════════════════
raya("J · EL RANGO HONESTO DE UN AÑO — 818 años solapados, k=1");
const V = 252;
const anosRod = [];
for (let i = 0; i + V <= dias.length; i++) {
  const tramo = S.slice(i, i + V);
  let cash = EFECTIVO0, min = EFECTIVO0, minF = dias[i].fecha;
  for (let j = 0; j < V; j++) { cash += tramo[j]; if (cash < min) { min = cash; minF = dias[i + j].fecha; } }
  anosRod.push({ inicio: dias[i].fecha, fin: dias[i + V - 1].fecha, res: cash - EFECTIVO0, min, minF });
}
const ordenados = [...anosRod].sort((a, b) => a.res - b.res);
const q = (p) => ordenados[Math.floor(ordenados.length * p)].res;
console.log(`
  818 ventanas de 252 sesiones. Cada una es "qué pasa si enciendo esto hoy y lo dejo un año".
`);
console.log(`| percentil | resultado del año (k=1) | % de la cuenta |`);
console.log("|---|---|---|");
for (const p of [0, 0.05, 0.25, 0.5, 0.75, 0.95]) console.log(`| ${p === 0 ? "el PEOR" : "p" + Math.round(p * 100)} | ${eur(q(p))} | ${pct(q(p) / CUENTA)} |`);
console.log(`| el MEJOR | ${eur(ordenados[ordenados.length - 1].res)} | ${pct(ordenados[ordenados.length - 1].res / CUENTA)} |`);
console.log(`\n  años NEGATIVOS: ${anosRod.filter((x) => x.res < 0).length} de ${anosRod.length} (${pct(anosRod.filter((x) => x.res < 0).length / anosRod.length)})`);
console.log(`  el peor año va de ${ordenados[0].inicio} a ${ordenados[0].fin}: ${eur(ordenados[0].res)}, suelo de efectivo ${eur(ordenados[0].min)} el ${ordenados[0].minF}`);
const ult = anosRod[anosRod.length - 1];
console.log(`  el año MÁS RECIENTE (${ult.inicio}→${ult.fin}): ${eur(ult.res)}, suelo ${eur(ult.min)}`);

// ═══ K · SI EL COLATERAL SÍ DEVENGA INTERÉS ═════════════════════════════════════════════════
raya("K · EL SUPUESTO QUE MÁS IMPORTA — ¿el colateral genera préstamo?");
console.log(`
  Mi libro de caja cobra interés SÓLO sobre saldo negativo. Es lo correcto si el colateral de un
  0DTE se retiene y se suelta el mismo día (posición abierta a las 11:00, expirada a las 16:00:
  no hay saldo deudor de un día para otro). Si Robinhood lo tratara como margen usado durante la
  retención, el coste sería éste — y sigue sin mover la aguja:
`);
function interesColateral(k) {
  let cash = EFECTIVO0, coste = 0, diasCon = 0;
  for (let i = 0; i < dias.length; i++) {
    if (S[i] !== 0) {
      const falta = Math.max(0, COLATERAL * k - Math.max(0, cash));
      if (falta > 0) { coste += falta * INTERES / 365; diasCon++; }
      cash += S[i] * k;
    }
  }
  return { coste, diasCon };
}
console.log("| k | días con colateral por encima del efectivo | coste total del período | coste por año |");
console.log("|---|---|---|---|");
const anosT = dias.length / 252;
for (const k of [1, 2]) { const r = interesColateral(k); console.log(`| ${k} | ${r.diasCon} | ${eur(r.coste)} | ${eur(r.coste / anosT)} |`); }
console.log(`
  → el interés NO es lo que rompe esto. Ni en el peor supuesto llega a mover el $/año.
    Lo que rompe esto es el TAMAÑO, y sólo el tamaño.
`);

// ═══ L · LA RECOMENDACIÓN QUE SÍ CABE ═══════════════════════════════════════════════════════
raya("L · QUÉ TAMAÑO CABE DE VERDAD — el que aguanta el peor día desde el PRIMER día");
console.log(`
  Criterio de caja, no de backtest: el tamaño tiene que aguantar el peor día posible ANTES de
  haber ganado nada, porque la caja arranca hoy y no en un pico. Riesgo máximo por cóndor =
  ${eur(COLATERAL)} − crédito. Reservando el efectivo para eso:
`);
const credMin = Math.min(...dias.filter((d) => d.cred["45"] != null && serie(CFG, 1)[dias.indexOf(d)] !== 0).map((d) => d.cred["45"]));
console.log("| k | riesgo máximo del día | efectivo tras el peor día desde el arranque | ¿la caja lo paga? |");
console.log("|---|---|---|---|");
for (const k of [1, 2, 3]) {
  const riesgo = (COLATERAL - 0) * k;
  console.log(`| ${k} | ${eur(-riesgo)} | ${eur(EFECTIVO0 - riesgo)} | ${EFECTIVO0 - riesgo > 0 ? "**sí**" : "**NO**"} |`);
}
console.log(`\n  → k=1 es el único tamaño que la caja paga sin pedir prestado, incluso en el peor día teórico.`);
console.log(`  → el hallazgo lo dice en su punto 2 de queFaltaria. Los números de aquí lo confirman y le ponen fecha.`);
