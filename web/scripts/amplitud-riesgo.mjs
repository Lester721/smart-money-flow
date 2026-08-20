// LA AMPLITUD COMO HERRAMIENTA DE RIESGO — la corrección que pidió Lester.
//
// El filtro (±30 puntos + no operar por debajo de MA20/MA50) se declaró muerto porque pierde
// INGRESO fuera de muestra. Pero baja la CAÍDA en los cinco años sin excepción, y el hallazgo de
// ρ dice que el riesgo SÍ se hereda entre períodos mientras el ingreso va invertido.
//
// Tres preguntas, y la tercera es la que decide:
//   1 · ¿La reducción de caída SOBREVIVE al cruce de períodos?
//   2 · ¿Cuánto ingreso cuesta cada dólar de caída eliminado?
//   3 · ¿Lo hace más barato que el modo TONTO de bajar riesgo — operar menos contratos?
//
// Si menos contratos consiguen la misma caída por menos dinero, el filtro no aporta NADA.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/amplitud-riesgo.mjs
//      (antes: scripts/amplitud-riesgo-datos.mjs, que construye la tabla de días)

import { readFileSync } from "node:fs";
import { tWelch, listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

// ── LA CUENTA REAL ──────────────────────────────────────────────────────────────────────────
const CUENTA = 56389, EFECTIVO = 7977;

// ── cuántas pruebas se han hecho sobre estos datos (para el listón de Bonferroni) ────────────
const PRUEBAS = 24;
const LISTON = listonT(PRUEBAS);

const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(1) + "%");
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);

const { dias } = JSON.parse(readFileSync("scripts/amplitud-riesgo-dias.json", "utf8"));

// ═══ RADIOGRAFÍA — mirar de qué están hechos los datos ANTES de medir ════════════════════════
const filas = dias.map((d) => ({
  fecha: d.fecha, ano: d.ano, sp11: d.sp11, cierre: d.cierre, straddle: d.straddle,
  ma20: d.ma20, ma50: d.ma50,
  pl25: d.pnl["25"], pl30: d.pnl["30"], cred30: d.cred["30"],
  distMA20: d.sp11 / d.ma20 - 1, distMA50: d.sp11 / d.ma50 - 1,
}));
radiografia(filas, ["sp11", "cierre", "straddle", "ma20", "ma50", "pl25", "pl30", "cred30", "distMA20", "distMA50"],
  "amplitud como riesgo", { cerosLegitimos: [] });

// ═══ LAS MÉTRICAS ═══════════════════════════════════════════════════════════════════════════
// El P&L se mide sobre TODOS los días del calendario: los días que la regla no opera valen 0.
// Así la caída, el peor día y el 5% peor son comparables entre reglas que operan distinto número
// de sesiones. Es lo que ve la cuenta.

/** Caída máxima desde el máximo anterior de la curva acumulada. */
function caidaMax(pl) {
  let cur = 0, pico = 0, peor = 0;
  for (const x of pl) { cur += x; pico = Math.max(pico, cur); peor = Math.min(peor, cur - pico); }
  return peor;
}
function metricas(pl, escala = 1) {
  const v = pl.map((x) => x * escala);
  const anos = v.length / 252;
  const ord = [...v].sort((a, b) => a - b);
  const k = Math.max(1, Math.round(v.length * 0.05));
  // camino del EFECTIVO: las pérdidas salen de ahí
  let caja = EFECTIVO, minCaja = EFECTIVO, fechaMin = null, quiebra = null;
  for (let i = 0; i < v.length; i++) {
    caja += v[i];
    if (caja < minCaja) { minCaja = caja; fechaMin = dias[i].fecha; }
    if (caja <= 0 && !quiebra) quiebra = dias[i].fecha;
  }
  return {
    n: v.filter((x) => x !== 0).length,
    total: suma(v), porAno: suma(v) / anos,
    caida: caidaMax(v), peorDia: Math.min(...v), es5: media(ord.slice(0, k)),
    acierto: v.filter((x) => x > 0).length / Math.max(1, v.filter((x) => x !== 0).length),
    minCaja, fechaMin, quiebra,
  };
}

// ═══ LAS REGLAS ═════════════════════════════════════════════════════════════════════════════
const sobreAmbas = (d) => d.sp11 >= d.ma20 && d.sp11 >= d.ma50;
const REGLAS = [
  { nom: "A · BASE ±25 · todos los días", dist: 25, filtro: () => true },
  { nom: "B · ±30 · todos los días  (sólo el ensanche)", dist: 30, filtro: () => true },
  { nom: "C · ±25 · sobre MA20 y MA50  (sólo el filtro)", dist: 25, filtro: sobreAmbas },
  { nom: "D · ±30 · sobre MA20 y MA50  ← EL FILTRO", dist: 30, filtro: sobreAmbas },
  { nom: "E · ±35 · todos los días", dist: 35, filtro: () => true },
  { nom: "F · ±30 · sólo sobre MA20", dist: 30, filtro: (d) => d.sp11 >= d.ma20 },
  { nom: "G · ±30 · sólo sobre MA50", dist: 30, filtro: (d) => d.sp11 >= d.ma50 },
];
/** Serie diaria de una regla sobre un subconjunto de días (0 los días que no opera). */
const serie = (ds, r) => ds.map((d) => {
  const p = d.pnl[String(r.dist)];
  return r.filtro(d) && p != null ? p : 0;
});

const ANCHO = 104;
const raya = (t) => { console.log("\n" + "═".repeat(ANCHO)); console.log("  " + t); console.log("═".repeat(ANCHO)); };

console.log(`\n# LA AMPLITUD COMO HERRAMIENTA DE RIESGO`);
console.log(`\n${dias.length} sesiones · ${dias[0].fecha} → ${dias[dias.length - 1].fecha} · SPXW 0DTE, entrada a las 11:00`);
console.log(`Precios reales en las cuatro patas (bid al vender, ask al comprar) · $0,03 por pata · alas de 50 puntos`);
console.log(`Cuenta: ${eur(CUENTA)} · **efectivo ${eur(EFECTIVO)}** — de ahí salen las pérdidas`);
console.log(`${PRUEBAS} pruebas declaradas · listón de |t| = ${LISTON}`);

// ═══ A · EL PERÍODO ENTERO ══════════════════════════════════════════════════════════════════
raya("A · EL PERÍODO ENTERO — dónde baja el riesgo y dónde NO baja");
console.log("\n| regla | días op. | $/año | caída máx | % cuenta | peor día | 5% peor (media) | acierto |");
console.log("|---|---|---|---|---|---|---|---|");
const M = {};
for (const r of REGLAS) {
  const m = metricas(serie(dias, r)); M[r.nom] = m;
  console.log(`| ${r.nom} | ${m.n} | ${eur(m.porAno)} | ${eur(m.caida)} | ${pct(m.caida / CUENTA)} | ${eur(m.peorDia)} | ${eur(m.es5)} | ${pct(m.acierto)} |`);
}
const A = M[REGLAS[0].nom], D = M[REGLAS[3].nom];
console.log(`\n   El **peor día** casi no se mueve (${eur(A.peorDia)} → ${eur(D.peorDia)}): la pérdida de un cóndor la`);
console.log(`   tapa el ala, no el filtro. Lo que baja es la CAÍDA ACUMULADA y el 5% peor.`);

// ═══ B · AÑO A AÑO ══════════════════════════════════════════════════════════════════════════
raya("B · AÑO A AÑO — la reducción de caída que motivó esta prueba");
const anos = [...new Set(dias.map((d) => d.ano))].sort();
console.log("\n| año | días | caída BASE ±25 | caída FILTRO | reducción | $/año BASE | $/año FILTRO | coste |");
console.log("|---|---|---|---|---|---|---|---|");
for (const a of anos) {
  const ds = dias.filter((d) => d.ano === a);
  const b = metricas(serie(ds, REGLAS[0])), f = metricas(serie(ds, REGLAS[3]));
  console.log(`| **${a}** | ${ds.length} | ${eur(b.caida)} | ${eur(f.caida)} | ${eur(f.caida - b.caida)} | ${eur(b.total)} | ${eur(f.total)} | ${eur(f.total - b.total)} |`);
}

// ═══ C · EL CRUCE DE PERÍODOS ═══════════════════════════════════════════════════════════════
raya("C · EL CRUCE — se elige en una mitad y se aplica TAL CUAL a la otra");
const mitad = Math.floor(dias.length / 2);
const H = [dias.slice(0, mitad), dias.slice(mitad)];
const nomH = [`H1 ${H[0][0].fecha}→${H[0][H[0].length - 1].fecha}`, `H2 ${H[1][0].fecha}→${H[1][H[1].length - 1].fecha}`];

console.log("\n### Las dos mitades, regla a regla\n");
console.log("| regla | " + nomH.map((x) => `$/año · caída · 5% peor — ${x.slice(0, 2)}`).join(" | ") + " |");
console.log("|---|---|---|");
const MH = [{}, {}];
for (const r of REGLAS) {
  const c = [0, 1].map((i) => { const m = metricas(serie(H[i], r)); MH[i][r.nom] = m; return `${eur(m.porAno)} · ${eur(m.caida)} · ${eur(m.es5)}`; });
  console.log(`| ${r.nom} | ${c[0]} | ${c[1]} |`);
}
console.log(`\n(${nomH[0]} · ${H[0].length} días — ${nomH[1]} · ${H[1].length} días)`);

const nB = REGLAS[0].nom, nD = REGLAS[3].nom;
console.log("\n### ¿SOBREVIVE la reducción de caída al cruce?\n");
console.log("| mitad | caída BASE | caída FILTRO | ¿baja? | 5% peor BASE | 5% peor FILTRO | ¿baja? |");
console.log("|---|---|---|---|---|---|---|");
for (const i of [0, 1]) {
  const b = MH[i][nB], f = MH[i][nD];
  console.log(`| ${nomH[i]} | ${eur(b.caida)} | ${eur(f.caida)} | ${f.caida > b.caida ? "**SÍ**" : "no"} | ${eur(b.es5)} | ${eur(f.es5)} | ${f.es5 > b.es5 ? "**SÍ**" : "no"} |`);
}

// ═══ D · CONTRA EL MODO TONTO: OPERAR MENOS CONTRATOS ═══════════════════════════════════════
raya("D · LA COMPARACIÓN QUE DECIDE — filtro contra operar MENOS CONTRATOS");
console.log(`
  Bajar el tamaño es lineal: con f contratos el ingreso y la caída se multiplican los DOS por f.
  Su precio por dólar de caída eliminado es constante e igual a la EFICIENCIA de la base:

        eficiencia = ($/año) ÷ |caída máxima|      ← dólares al año por cada dólar de caída

  El filtro sólo aporta si su eficiencia es MAYOR que la de la base. Si es igual o menor, un
  contrato menos consigue lo mismo por menos dinero y el filtro es adorno.
`);
console.log("| regla | período entero | " + nomH.map((x) => x.slice(0, 2)).join(" | ") + " |");
console.log("|---|---|---|---|");
for (const r of REGLAS) {
  const e = (m) => (m.caida < 0 ? (m.porAno / -m.caida).toFixed(3) : "—");
  console.log(`| ${r.nom} | ${e(M[r.nom])} | ${e(MH[0][r.nom])} | ${e(MH[1][r.nom])} |`);
}

console.log("\n### El cruce, en dinero: se calibra el tamaño en una mitad y se aplica a la otra\n");
console.log(`Se busca en la mitad de AJUSTE el número de contratos f que le da a la BASE la MISMA caída`);
console.log(`que el filtro. Ese f se aplica TAL CUAL a la otra mitad y se comparan los ingresos.\n`);
console.log("| ajuste en | f de contratos | prueba en | $/año FILTRO | $/año BASE×f | caída FILTRO | caída BASE×f | gana |");
console.log("|---|---|---|---|---|---|---|---|");
const cruce = [];
for (const [aj, pr] of [[0, 1], [1, 0]]) {
  const f = MH[aj][nD].caida / MH[aj][nB].caida;          // fracción de contratos
  const fil = MH[pr][nD], bas = metricas(serie(H[pr], REGLAS[0]), f);
  const gana = fil.porAno > bas.porAno ? "**FILTRO**" : "**TAMAÑO**";
  cruce.push({ f, fil, bas, gana });
  console.log(`| ${nomH[aj].slice(0, 2)} | ${f.toFixed(3)} | ${nomH[pr].slice(0, 2)} | ${eur(fil.porAno)} | ${eur(bas.porAno)} | ${eur(fil.caida)} | ${eur(bas.caida)} | ${gana} |`);
}
const sobrevive = cruce.every((c) => c.gana.includes("FILTRO"));
console.log(`\n   → **${sobrevive ? "El filtro gana en LAS DOS direcciones" : "NO gana en las dos direcciones"}**`);

console.log("\n### El precio del filtro: cuánto ingreso cuesta cada dólar de caída eliminado\n");
console.log("| mitad | ingreso perdido/año | caída eliminada | precio del FILTRO | precio del TAMAÑO | más barato |");
console.log("|---|---|---|---|---|---|");
for (const i of [0, 1]) {
  const b = MH[i][nB], f = MH[i][nD];
  const dIng = b.porAno - f.porAno, dCai = -(b.caida - f.caida) * -1;   // caída eliminada, positiva
  const elim = f.caida - b.caida;                                       // >0 si el filtro cae menos
  const precioF = elim > 0 ? dIng / elim : NaN;
  const precioT = b.caida < 0 ? b.porAno / -b.caida : NaN;
  const mejor = !Number.isFinite(precioF) ? "—" : precioF < precioT ? "**FILTRO**" : "**TAMAÑO**";
  console.log(`| ${nomH[i]} | ${eur(dIng)} | ${eur(elim)} | ${Number.isFinite(precioF) ? precioF.toFixed(3) : "—"} | ${precioT.toFixed(3)} | ${mejor} |`);
}
console.log(`\n   (precio = $/año que se pierden por cada $1 de caída máxima que se quita. Menos es mejor.)`);

// ═══ E · ¿ES LA MISMA MÁQUINA? el ranking de riesgo entre mitades ════════════════════════════
raya("E · ¿SE HEREDA EL RIESGO EN ESTA FAMILIA? — ranking de 32 variantes entre las dos mitades");
const VAR = [];
for (const dist of [15, 20, 25, 30, 35, 40, 45, 50]) {
  for (const [fn, ff] of [["todos", () => true], ["MA20+MA50", sobreAmbas], ["MA20", (d) => d.sp11 >= d.ma20], ["MA50", (d) => d.sp11 >= d.ma50]]) {
    const r = { nom: `±${dist} ${fn}`, dist, filtro: ff };
    const m = [metricas(serie(H[0], r)), metricas(serie(H[1], r))];
    if (m[0].n < 30 || m[1].n < 30) continue;
    VAR.push({ nom: r.nom, h1: m[0], h2: m[1] });
  }
}
function spearman(a, b) {
  const rk = (v) => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = new Array(v.length); o.forEach(([, i], j) => (r[i] = j + 1)); return r; };
  const x = rk(a), y = rk(b), n = a.length;
  const mx = media(x), my = media(y);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  return num / Math.sqrt(dx * dy);
}
console.log(`\n| métrica ordenada en las ${VAR.length} variantes | ρ de Spearman H1 ↔ H2 |`);
console.log("|---|---|");
for (const [nom, get] of [["caída máxima", (v) => v.caida], ["5% peor (media)", (v) => v.es5], ["peor día", (v) => v.peorDia], ["**$/año (ingreso)**", (v) => v.porAno]]) {
  console.log(`| ${nom} | ${spearman(VAR.map((v) => get(v.h1)), VAR.map((v) => get(v.h2))).toFixed(2)} |`);
}

// ═══ F · ¿EVITA DÍAS MALOS, O SÓLO OPERA MENOS? ═════════════════════════════════════════════
raya("F · ¿EVITA DÍAS MALOS O SÓLO OPERA MENOS? — los días que el filtro se salta");
console.log(`\nMisma geometría (±30) en TODOS los días. Se compara el P&L de los días que el filtro`);
console.log(`opera contra los que se salta. Si el filtro sabe algo, los saltados son peores.\n`);
console.log("| período | n opera | n salta | media OPERA | media SALTA | diferencia | t de Welch | ¿pasa " + LISTON + "? |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [nom, ds] of [["período entero", dias], [nomH[0], H[0]], [nomH[1], H[1]]]) {
  const op = ds.filter((d) => sobreAmbas(d) && d.pnl["30"] != null).map((d) => d.pnl["30"]);
  const sa = ds.filter((d) => !sobreAmbas(d) && d.pnl["30"] != null).map((d) => d.pnl["30"]);
  const t = tWelch(op, sa);
  console.log(`| ${nom} | ${op.length} | ${sa.length} | ${eur(media(op))} | ${eur(media(sa))} | ${eur(media(op) - media(sa))} | **${t.toFixed(2)}** | ${Math.abs(t) >= LISTON ? "sí" : "NO"} |`);
}

// ═══ G · LA CUENTA REAL ═════════════════════════════════════════════════════════════════════
raya("G · LA CUENTA REAL — contratos enteros y el efectivo de " + eur(EFECTIVO));
console.log(`\nColateral $5.000 por cóndor (sale del poder de compra, ${eur(73874)}). Las PÉRDIDAS salen`);
console.log(`del efectivo. Se sigue el camino del efectivo día a día desde ${eur(EFECTIVO)}.\n`);
console.log("| regla · contratos | $/año | caída máx | % cuenta | efectivo mínimo | fecha | ¿se queda sin efectivo? |");
console.log("|---|---|---|---|---|---|---|");
for (const [r, k] of [[REGLAS[0], 1], [REGLAS[0], 2], [REGLAS[3], 1], [REGLAS[3], 2], [REGLAS[3], 3]]) {
  const m = metricas(serie(dias, r), k);
  console.log(`| ${r.nom.split(" ·")[0]} ${r.nom.includes("BASE") ? "±25 todos" : "±30 + medias"} · **${k} contrato${k > 1 ? "s" : ""}** | ${eur(m.porAno)} | ${eur(m.caida)} | ${pct(m.caida / CUENTA)} | ${eur(m.minCaja)} | ${m.fechaMin} | ${m.quiebra ? "**SÍ · " + m.quiebra + "**" : "no"} |`);
}

// ═══ VEREDICTO ══════════════════════════════════════════════════════════════════════════════
raya("VEREDICTO");
const c0 = cruce[0], c1 = cruce[1];
console.log(`
  1 · La reducción de CAÍDA sobrevive al cruce: ${[0, 1].every((i) => MH[i][nD].caida > MH[i][nB].caida) ? "SÍ, en las dos mitades" : "NO"}.
  2 · ¿Bate a operar menos contratos? ${sobrevive ? "SÍ, en las dos direcciones del cruce" : "NO en las dos direcciones"}.
      · ajustando en H1 (f=${c0.f.toFixed(3)}) y probando en H2: filtro ${eur(c0.fil.porAno)}/año contra ${eur(c0.bas.porAno)}/año del tamaño
      · ajustando en H2 (f=${c1.f.toFixed(3)}) y probando en H1: filtro ${eur(c1.fil.porAno)}/año contra ${eur(c1.bas.porAno)}/año del tamaño
  3 · El peor DÍA no lo toca: ${eur(A.peorDia)} → ${eur(D.peorDia)}. El ala es lo que tapa la pérdida de un día.
`);
