// LENTE 2 (3ª parte) — EL AÑO DESDE HOY, y el puente: alas más estrechas.
//
// ═══ QUÉ MIDE Y POR QUÉ ═════════════════════════════════════════════════════════════════════
//
// Las dos partes anteriores dejaron dos cosas claras:
//   · los números del hallazgo son correctos al céntimo;
//   · pero con $7.977 de efectivo un solo día malo (−$4.725) deja a Lester por debajo de los
//     $5.000 que Robinhood retiene, y la estrategia se para sola. En 41 de 337 arranques
//     posibles (12,2 %) eso pasa. Para no pararse NUNCA haría falta $11.839 de efectivo.
//
// Matar la idea es donde empieza el trabajo. Aquí se mide:
//
//   G1. EL AÑO DESDE HOY. Arrancar con $7.977 en cada punto de la muestra, correr 12 meses y
//       dar la distribución del resultado a un año — pausando cuando no hay efectivo y
//       reanudando cuando lo vuelve a haber, que es lo que haría una persona. Eso es lo que
//       Lester puede esperar, no el $/año del backtest completo.
//
//   G2. EL PUENTE: ALAS MÁS ESTRECHAS. El problema no es la regla, es el TAMAÑO del riesgo.
//       Con alas de 50 el riesgo máximo es $5.000 y no cabe. Con alas de 25 son $2.500 y con
//       alas de 20, $2.000: caben de sobra en su efectivo, y además Robinhood retiene menos,
//       así que podría llevar más de un contrato. Se mide la MISMA regla (11:00, sobre MA5 y
//       sobre MA50, cóndor ±45) cambiando sólo el ala, y con el umbral de crédito escalado
//       al ancho (un ala la mitad de ancha cobra aproximadamente la mitad).
//
// Reglas de la casa intactas: precios reales bid/ask en las cuatro patas y dos veces, sólo el
// pasado, liquidación al intrínseco contra el SPX de las 16:00, 244 días de mercado al año.
//
// Uso: node --import tsx scripts/v2-lente2-puente-alas.mjs

import { diasDisponibles, cargarDia, rejilla, condor, estructura, hayHora, resumen } from "./lib0dte.mjs";

const ANCHO = 45, COMISION = 0.24;
const MA_CORTA = 5, MA_LARGA = 50, DIAS_ANO = 244;
const EFECTIVO = 7977;
const ALAS = [50, 25, 20, 15];
const HORA = "11:00";

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
function pct(v, p) { const s = [...v].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo); }
function caidaPV(pls) { let a = 0, pico = 0, peor = 0; for (const x of pls) { a += x; pico = Math.max(pico, a); peor = Math.min(peor, a - pico); } return peor; }

// ── UNA PASADA: todas las alas a la vez ─────────────────────────────────────────────────────
const dias = diasDisponibles();
const t0 = Date.now();
const R = [];
let huecos = 0, intentos = 0;
for (const d of dias) {
  const dia = cargarDia(d);
  if (!dia) continue;
  const cierre = dia.barras[dia.barras.length - 1].spot;
  const i = hayHora(dia, HORA);
  const porAla = {};
  if (i >= 0) {
    const spot = dia.barras[i].spot, centro = rejilla(spot);
    for (const ala of ALAS) {
      intentos++;
      const r = estructura(dia, i, "vencimiento", condor(centro, ANCHO, ala));
      if (!r) { porAla[ala] = null; huecos++; continue; }
      porAla[ala] = { spot, credito: r.credito * 100, dolares: r.dolares - COMISION, riesgo: r.riesgoMax };
    }
  }
  R.push({ dia: d, cierre, porAla, tieneHora: i >= 0 });
}
console.log(`Pasada en ${((Date.now() - t0) / 1000).toFixed(1)} s · ${R.length} días · huecos ${huecos}/${intentos} (${(100 * huecos / intentos).toFixed(2)} %)`);

const cierres = R.map((x) => x.cierre);
for (let i = 0; i < R.length; i++) {
  if (i < MA_LARGA) { R[i].ma50 = null; continue; }
  R[i].ma5 = media(cierres.slice(i - MA_CORTA, i));
  R[i].ma50 = media(cierres.slice(i - MA_LARGA, i));
}
const CONMA = R.filter((x) => x.ma50 != null);
const ANOS = CONMA.length / DIAS_ANO;
console.log(`${CONMA.length} días con medias = ${ANOS.toFixed(2)} años\n`);

function correr(ala, umbral) {
  const ops = [];
  for (const x of CONMA) {
    const c = x.porAla[ala];
    if (!c) continue;
    if (c.spot > x.ma5 && c.spot > x.ma50 && c.credito >= umbral)
      ops.push({ dia: x.dia, pl: c.dolares, credito: c.credito, riesgo: c.riesgo });
  }
  return ops;
}

// ══════════════════════════════════════════════════════════════════════════════════════════
//  G1 — EL AÑO DESDE HOY, con la caja real (pausa y reanuda)
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("=".repeat(102));
console.log("  G1 · UN AÑO EMPEZANDO CON $7.977, ARRANCANDO EN CADA PUNTO DE LA MUESTRA");
console.log("       Si el efectivo no llega al colateral, ese día NO se opera y se espera.");
console.log("=".repeat(102) + "\n");

function anoDesde(ops, k, colateralDe, contratos = 1) {
  const fin = new Date(ops[k].dia); fin.setFullYear(fin.getFullYear() + 1);
  const finS = fin.toISOString().slice(0, 10);
  let cash = EFECTIVO, hechas = 0, saltadas = 0, minCash = EFECTIVO;
  for (let i = k; i < ops.length && ops[i].dia < finS; i++) {
    const col = colateralDe(ops[i]) * contratos;
    if (cash < col) { saltadas++; continue; }
    cash += ops[i].pl * contratos; hechas++;
    if (cash < minCash) minCash = cash;
  }
  return { gan: cash - EFECTIVO, hechas, saltadas, minCash, completo: ops[ops.length - 1].dia >= finS };
}

function bloqueG1(ops, etiqueta, colFn, contratos = 1) {
  const res = [];
  for (let k = 0; k < ops.length; k++) { const a = anoDesde(ops, k, colFn, contratos); if (a.completo) res.push(a); }
  const g = res.map((x) => x.gan);
  const conSalto = res.filter((x) => x.saltadas > 0).length;
  console.log(`  ${etiqueta}  (${contratos} contrato${contratos > 1 ? "s" : ""})`);
  console.log(`     ${res.length} ventanas de 12 meses completas`);
  console.log(`     resultado a 12 meses: peor ${eur(Math.min(...g))} · p10 ${eur(pct(g, 0.1))} · MEDIANA ${eur(pct(g, 0.5))} · p90 ${eur(pct(g, 0.9))} · mejor ${eur(Math.max(...g))}`);
  console.log(`     ventanas con resultado NEGATIVO: ${g.filter((x) => x < 0).length} de ${res.length} (${(100 * g.filter((x) => x < 0).length / res.length).toFixed(0)} %)`);
  console.log(`     ventanas donde en algún momento NO PUDO abrir por falta de efectivo: ${conSalto} de ${res.length} (${(100 * conSalto / res.length).toFixed(0)} %)`);
  console.log(`     operaciones medianas hechas en el año: ${pct(res.map((x) => x.hechas), 0.5)} · saltadas (mediana) ${pct(res.map((x) => x.saltadas), 0.5)}`);
  console.log(`     efectivo mínimo mediano tocado: ${eur(pct(res.map((x) => x.minCash), 0.5))} · el peor de todos ${eur(Math.min(...res.map((x) => x.minCash)))}\n`);
  return { mediana: pct(g, 0.5), negativas: g.filter((x) => x < 0).length / res.length, conSalto: conSalto / res.length };
}

const ops50_50 = correr(50, 50), ops50_100 = correr(50, 100);
bloqueG1(ops50_100, "ALA 50 · umbral $100 — la que ya opera", () => 5000);
bloqueG1(ops50_50, "ALA 50 · umbral $50 — la «mejor» del hallazgo", () => 5000);

// ══════════════════════════════════════════════════════════════════════════════════════════
//  G2 — EL PUENTE: alas más estrechas, misma regla
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("=".repeat(102));
console.log("  G2 · EL PUENTE — MISMA REGLA, ALAS MÁS ESTRECHAS (el riesgo sí cabe en su caja)");
console.log("       El umbral de crédito se escala al ancho: $50 con ala 50 → $25 con ala 25, etc.");
console.log("=".repeat(102) + "\n");
console.log("| ala | riesgo máx | colateral | umbral | ops | $/año | mediana/op | acierto | t | peor día | caída pico-valle | sin 5 peores | sin 5 mejores |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const guardar = {};
for (const ala of ALAS) {
  for (const escala of [1, 0.5]) {                       // umbral proporcional, y la mitad
    const umbral = Math.round(50 * (ala / 50) * (escala === 1 ? 1 : 1) * (escala === 1 ? 1 : 0.5) * 2) / 2 * (escala === 1 ? 1 : 1);
    const u = escala === 1 ? Math.round(50 * ala / 50) : Math.round(100 * ala / 50);
    const ops = correr(ala, u);
    if (ops.length < 20) { console.log(`| ${ala} | — | — | $${u} | ${ops.length} | muestra corta |`); continue; }
    const pls = ops.map((o) => o.pl), s = [...pls].sort((a, b) => a - b);
    const r = resumen(pls);
    const key = `${ala}/${u}`;
    guardar[key] = ops;
    console.log(`| ${ala} | ${eur(ala * 100)} | ${eur(ala * 100)} | $${u} | ${ops.length} | **${eur(suma(pls) / ANOS)}** | ${eur(pct(pls, 0.5))} | ${(r.aciertos * 100).toFixed(0)}% | ${r.t.toFixed(2)} | ${eur(s[0])} | ${eur(caidaPV(pls))} | ${eur(suma(s.slice(5)) / ANOS)} | ${eur(suma(s.slice(0, -5)) / ANOS)} |`);
  }
}

console.log("\n### Año a año de cada ala\n");
const anos = [...new Set(CONMA.map((x) => x.dia.slice(0, 4)))].sort();
console.log("| ala/umbral | " + anos.join(" | ") + " | años en rojo |");
console.log("|---|" + anos.map(() => "---").join("|") + "|---|");
for (const [k, ops] of Object.entries(guardar)) {
  const fila = anos.map((a) => { const q = ops.filter((o) => o.dia.startsWith(a)); return q.length ? `${eur(suma(q.map((z) => z.pl)))} (${q.length})` : "—"; });
  const rojos = anos.filter((a) => { const q = ops.filter((o) => o.dia.startsWith(a)); return q.length && suma(q.map((z) => z.pl)) < 0; }).length;
  console.log(`| ${k} | ${fila.join(" | ")} | ${rojos} |`);
}

// ── el año desde hoy, con las alas estrechas y el número de contratos que la caja permite ──
console.log("\n" + "=".repeat(102));
console.log("  G3 · EL AÑO DESDE HOY CON ALAS ESTRECHAS — y cuántos contratos caben en $7.977");
console.log("=".repeat(102) + "\n");
for (const [k, ops] of Object.entries(guardar)) {
  const ala = +k.split("/")[0];
  const col = ala * 100;
  const maxC = Math.floor(EFECTIVO / col);
  if (ops.length < 40) continue;
  bloqueG1(ops, `ALA ${ala} · umbral $${k.split("/")[1]} · colateral ${eur(col)} → caben ${maxC} contratos`, () => col, Math.min(maxC, 2));
}

// ── comprobación de los días malos con alas estrechas ──────────────────────────────────────
console.log("=".repeat(102));
console.log("  G4 · LOS DÍAS MALOS CON CADA ALA (mismos días, riesgo distinto)");
console.log("=".repeat(102) + "\n");
console.log("| día | " + ALAS.map((a) => `ala ${a}`).join(" | ") + " |");
console.log("|---|" + ALAS.map(() => "---").join("|") + "|");
for (const d of ["2024-12-18", "2025-11-20", "2025-01-31", "2026-06-17", "2025-10-16"]) {
  const x = R.find((z) => z.dia === d);
  console.log(`| ${d} | ` + ALAS.map((a) => { const c = x.porAla[a]; return c ? `${eur(c.dolares)} (créd ${eur(c.credito)})` : "—"; }).join(" | ") + " |");
}
console.log("\n  ESTO ES BACKTEST. Las alas estrechas se han elegido sobre los mismos días.\n");
