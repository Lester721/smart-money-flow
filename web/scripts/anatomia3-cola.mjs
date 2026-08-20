// ANATOMÍA 3 · LA COLA — qué separa un día catastrófico, y la TRAMPA que hay debajo.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/anatomia3-cola.mjs
//
// ═══ POR QUÉ ESTE SEGUNDO SCRIPT ═════════════════════════════════════════════════════════════
//
// El retrato robot (anatomia3-retrato.mjs) sale clarísimo: los 30 peores días tienen la mitad de
// crédito ($1.082 contra $1.897, t=−6,51), la mitad de implícita y la mitad de σ que los 30
// mejores. Parece el hallazgo del proyecto.
//
// NO LO ES, o no del todo, y la razón es aritmética:
//
//     ganancia máxima del cóndor = EL CRÉDITO
//     pérdida máxima del cóndor  = $5.000 − EL CRÉDITO
//
// Los 30 MEJORES días TIENEN que ser días de crédito alto: es su techo. Y los 30 PEORES sólo
// pueden estar entre los días de crédito bajo: un día que cobró $1.900 no puede perder $4.900
// aunque el índice se vaya a la luna. Comparar las dos colas por el crédito es comparar una
// variable consigo misma.
//
// Aquí se separa lo mecánico de lo real:
//   1. cuánto de la diferencia es el tope aritmético
//   2. la cola medida sobre el P&L NORMALIZADO por el riesgo del día (quita el tope)
//   3. el barrido de cola: por cada señal, ¿qué le pasa al PEOR DÍA, al p5 y a la PEOR RACHA
//      si se dejan de operar los días de un tercio? Y sobre todo: ¿a qué precio en $/año?
//
// ═══ PRUEBAS DECLARADAS ══════════════════════════════════════════════════════════════════════
// 47 ya corridas antes sobre estos mismos días (17 de régimen + 30 de gestión) + 132 de esta
// anatomía (32 del retrato + 84 del barrido + 5 reglas + 8 del veredicto + 3 de cola) = 180.
// listonT(180) ≈ 3,64. Ése es el listón para llamar hallazgo a NADA de aquí.

import { writeFileSync } from "node:fs";
import { tWelch, listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";
import { cargar, resumen, drawdown, media, sd, pct, eur, RIESGO_MAX } from "./anatomia3-lib.mjs";

const PRUEBAS = 180;
const LISTON = listonT(PRUEBAS);
const { filas, faltan } = cargar();
const ANOS = filas.length / 251;
if (faltan.length) console.log(`⚠️ NO EXISTEN los ficheros de ${faltan.join(", ")} — sus señales van en null y se dice`);

radiografia(filas, ["pl", "credito", "zTardeAbs", "zTardeSigmas", "zRiesgoMax", "zPlPorRiesgo", "sepPct", "nivel"],
  "desenlace y nivel", { maxCeros: 0.2 });

const PL = filas.map((f) => f.pl);
const BASE = resumen(filas, ANOS);
console.log("\n" + "═".repeat(104));
console.log(`  LÍNEA BASE · ${BASE.n} días · ${ANOS.toFixed(2)} años · listón |t| ≥ ${LISTON} (Bonferroni sobre ${PRUEBAS} pruebas)`);
console.log("═".repeat(104));
console.log(`  total ${eur(BASE.total)} · ${eur(BASE.alAno)}/año · media ${eur(BASE.media)}/op · acierto ${(BASE.acierto * 100).toFixed(1)}%`);
console.log(`  PEOR DÍA ${eur(BASE.peor)} · p1 ${eur(BASE.p1)} · p5 ${eur(BASE.p5)} · PEOR RACHA ${eur(BASE.dd)}`);

// ══ 1 · LA TRAMPA ARITMÉTICA, MEDIDA ════════════════════════════════════════
console.log("\n" + "═".repeat(104));
console.log("  1 · LO MECÁNICO — por qué el crédito NO puede leerse como una señal de la cola");
console.log("═".repeat(104));
const ord = [...filas].sort((a, b) => a.pl - b.pl);
const PEOR30 = ord.slice(0, 30), MEJOR30 = ord.slice(-30);
console.log(`  ganancia máxima posible = el crédito · pérdida máxima posible = $${RIESGO_MAX} − crédito`);
console.log(`  días que ganaron EXACTAMENTE el crédito (viento en popa): ${filas.filter((f) => Math.abs(f.pl - (f.credito - 0.24)) < 1).length} de ${filas.length}`);
console.log(`  días que perdieron la pérdida MÁXIMA: ${filas.filter((f) => f.zPerdidaTotal).length} de ${filas.length}`);
console.log(`\n  De los 30 peores: ${PEOR30.filter((f) => f.zPerdidaTotal).length} son pérdida máxima · crédito medio ${eur(media(PEOR30.map((f) => f.credito)))}`);
console.log(`  De los 30 mejores: ${MEJOR30.filter((f) => Math.abs(f.pl - (f.credito - 0.24)) < 1).length} cobraron el crédito entero · crédito medio ${eur(media(MEJOR30.map((f) => f.credito)))}`);
console.log(`\n  El TOPE de pérdida en los 30 peores era de media ${eur(media(PEOR30.map((f) => f.zRiesgoMax)))}, y perdieron ${eur(media(PEOR30.map((f) => f.pl)))}.`);
console.log(`  O sea: la cola izquierda SÓLO PUEDE VIVIR donde el crédito es bajo. No es una señal, es el techo del contrato.`);

// el mismo retrato pero con el P&L normalizado por el riesgo del día — el tope desaparece
console.log("\n  ── el retrato una vez QUITADO el tope: P&L / riesgo máximo del día ──");
const ordN = [...filas].sort((a, b) => a.zPlPorRiesgo - b.zPlPorRiesgo);
const PEORn = ordN.slice(0, 30), MEJORn = ordN.slice(-30);
console.log(`  30 peores normalizados: ${(media(PEORn.map((f) => f.zPlPorRiesgo)) * 100).toFixed(1)}% del riesgo · crédito medio ${eur(media(PEORn.map((f) => f.credito)))}`);
console.log(`  30 mejores normalizados: ${(media(MEJORn.map((f) => f.zPlPorRiesgo)) * 100).toFixed(1)}% del riesgo · crédito medio ${eur(media(MEJORn.map((f) => f.credito)))}`);
const tCredNorm = tWelch(PEORn.map((f) => f.credito), MEJORn.map((f) => f.credito));
const tIvNorm = tWelch(PEORn.map((f) => f.ivAtm11), MEJORn.map((f) => f.ivAtm11));
console.log(`  crédito: t=${tCredNorm.toFixed(2)} (era −6,51 sin normalizar) · implícita a las 11:00: t=${tIvNorm.toFixed(2)} (era −4,21)`);
console.log(`  ${Math.abs(tCredNorm) < LISTON ? "→ al quitar el tope, el crédito DEJA de separar: era el techo del contrato." : "→ el crédito SIGUE separando tras quitar el tope."}`);

// ══ 2 · ¿DÓNDE VIVEN LOS 30 PEORES? ═════════════════════════════════════════
console.log("\n" + "═".repeat(104));
console.log("  2 · CONCENTRACIÓN — un hallazgo que vive en dos semanas no es un hallazgo");
console.log("═".repeat(104));
const porMes = new Map();
for (const f of PEOR30) porMes.set(f.fecha.slice(0, 7), (porMes.get(f.fecha.slice(0, 7)) ?? 0) + 1);
const mesesOrd = [...porMes.entries()].sort((a, b) => b[1] - a[1]);
console.log("  los 30 peores días por mes: " + mesesOrd.map(([m, n]) => `${m}×${n}`).join(" · "));
const porAno = new Map();
for (const f of PEOR30) porAno.set(f.fecha.slice(0, 4), (porAno.get(f.fecha.slice(0, 4)) ?? 0) + 1);
const totalAno = new Map();
for (const f of filas) totalAno.set(f.fecha.slice(0, 4), (totalAno.get(f.fecha.slice(0, 4)) ?? 0) + 1);
console.log("  por año: " + [...porAno.entries()].sort().map(([a, n]) => `${a} ${n}/30 (de ${totalAno.get(a)} días)`).join(" · "));
console.log(`  el mes que más carga: ${mesesOrd[0][0]} con ${mesesOrd[0][1]} de los 30 (${((mesesOrd[0][1] / 30) * 100).toFixed(0)}%)`);

console.log("\n  ── los 30 peores, uno a uno ──");
console.log("| fecha | P&L | crédito | tope pérdida | ¿máxima? | IV 11:00 | σ | mov. tarde (pts) | mov/σ | nivel |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const f of PEOR30) {
  console.log(`| ${f.fecha} | ${eur(f.pl)} | ${eur(f.credito)} | ${eur(f.zRiesgoMax)} | ${f.zPerdidaTotal ? "sí" : "no"} | ${f.ivAtm11.toFixed(1)}% | ${f.sigma.toFixed(0)} | ${f.zTardePts.toFixed(0)} | ${f.zTardeSigmas.toFixed(2)} | ${f.nivel.toFixed(0)} |`);
}

// ══ 3 · EL MECANISMO — ¿la implícita del día PAGA el movimiento de la tarde? ═
console.log("\n" + "═".repeat(104));
console.log("  3 · EL MECANISMO — ¿los días baratos infrapagan la tarde?");
console.log("═".repeat(104));
console.log("  Si la respuesta es sí, el desastre no lo trae la volatilidad ALTA: lo trae la BARATA.");
console.log("  Se ordena por la implícita del dinero a las 11:00 (observable) y se mira el movimiento");
console.log("  REAL de la tarde medido en σ implícitas de ese mismo día.\n");
console.log("| quintil de IV a las 11:00 | n | IV media | σ media (pts) | mov. tarde medio (pts) | mov/σ medio | p90 de mov/σ | % días que rompen ±25 |");
console.log("|---|---|---|---|---|---|---|---|");
const porIv = [...filas].sort((a, b) => a.ivAtm11 - b.ivAtm11);
const q = Math.floor(porIv.length / 5);
for (let i = 0; i < 5; i++) {
  const g = i < 4 ? porIv.slice(i * q, (i + 1) * q) : porIv.slice(4 * q);
  const rs = g.map((f) => f.zTardeSigmas);
  console.log(`| Q${i + 1} (${g[0].ivAtm11.toFixed(1)}–${g[g.length - 1].ivAtm11.toFixed(1)}%) | ${g.length} | ${media(g.map((f) => f.ivAtm11)).toFixed(1)}% | ${media(g.map((f) => f.sigma)).toFixed(0)} | ${media(g.map((f) => f.zTardeAbs)).toFixed(0)} | ${media(rs).toFixed(3)} | ${pct(rs, 0.9).toFixed(2)} | ${((g.filter((f) => f.zTardeAbs > 25).length / g.length) * 100).toFixed(0)}% |`);
}
const ivBajo = porIv.slice(0, q).map((f) => f.zTardeSigmas), ivAlto = porIv.slice(-q).map((f) => f.zTardeSigmas);
console.log(`\n  mov/σ del quintil BARATO contra el CARO: ${media(ivBajo).toFixed(3)} contra ${media(ivAlto).toFixed(3)} · t=${tWelch(ivBajo, ivAlto).toFixed(2)} (listón ${LISTON})`);

// ══ 4 · EL BARRIDO DE COLA ══════════════════════════════════════════════════
const SENALES = [
  ["movManana", "% de la apertura a las 11:00 (signado)"],
  ["movMananaAbs", "lo mismo en valor absoluto"],
  ["rangoManana", "% de rango de la mañana"],
  ["rangoMananaPts", "rango de la mañana en PUNTOS"],
  ["posRango", "posición dentro del rango de la mañana"],
  ["extremo", "distancia al centro del rango de la mañana"],
  ["recorrido", "% de camino andado en la mañana"],
  ["recorridoPts", "camino andado en PUNTOS"],
  ["eficiencia", "neto/camino (1=recta, 0=ida y vuelta)"],
  ["zigzag", "cambios de dirección en la mañana"],
  ["rvManana", "vol realizada de la mañana anualizada"],
  ["acel", "% movido de 10:30 a 11:00"],
  ["ivAtm11", "implícita del dinero a las 11:00"],
  ["ivCambio", "% que cambió esa implícita desde las 09:35"],
  ["sigma", "movimiento esperado del resto de sesión (pts)"],
  ["sigmaRatio", "cuántas σ son los ±25 fijos"],
  ["rvIv", "realizada de la mañana / implícita"],
  ["credito", "$ cobrados"],
  ["hueco", "% de hueco de apertura (signado)"],
  ["huecoAbs", "hueco en valor absoluto"],
  ["rangoAyerReal", "% de rango de la sesión entera de ayer"],
  ["rvAyer", "vol realizada de ayer anualizada"],
  ["tardeAyerPts", "cuánto se movió AYER de 11:00 al cierre (pts)"],
  ["retAyer", "% de ayer, cierre a cierre"],
  ["vix", "VIX al cierre de ayer"],
  ["term9", "VIX9D/VIX de ayer"],
  ["vvixVix", "VVIX/VIX de ayer"],
  ["ivVsVix", "implícita 0DTE de las 11:00 / VIX de ayer"],
];
console.log("\n" + "═".repeat(104));
console.log(`  4 · BARRIDO DE COLA — ¿qué pasa si NO se opera un tercio? · ${SENALES.length} señales × 3 tercios = ${SENALES.length * 3} comparaciones`);
console.log("═".repeat(104));
console.log("  Se ordena por la señal, se parte en tres, y se quita UN tercio (se dejan de operar esos días).");
console.log("  La métrica que decide: $/año retenidos por cada dólar de PEOR RACHA eliminado.");
console.log("  Con la línea base en " + eur(BASE.dd) + " de racha y " + eur(BASE.alAno) + "/año, hay que quitar caída SIN tirar el ingreso.\n");
console.log("| señal | tercio quitado | días operados | $/año | % del ingreso retenido | peor día | p1 | p5 | peor racha | racha eliminada | $/año por $ de racha |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const barrido = [];
for (const [campo, desc] of SENALES) {
  const val = filas.filter((f) => f[campo] != null && isFinite(f[campo]));
  if (val.length < 400) { console.log(`| \`${campo}\` | — | ${val.length} | SIN MUESTRA | | | | | | | |`); continue; }
  const o = [...val].sort((a, b) => a[campo] - b[campo]);
  const k = Math.floor(o.length / 3);
  const tercios = [o.slice(0, k), o.slice(k, 2 * k), o.slice(2 * k)];
  const nom = ["BAJO", "MEDIO", "ALTO"];
  for (let i = 0; i < 3; i++) {
    const quitados = new Set(tercios[i].map((f) => f.fecha));
    const quedan = filas.filter((f) => !quitados.has(f.fecha));   // el orden temporal se conserva
    const r = resumen(quedan, ANOS);
    const ddElim = r.dd - BASE.dd;                                // positivo = racha menos profunda
    const ratio = ddElim > 0 ? r.alAno / ddElim : null;
    barrido.push({ campo, desc, tercio: nom[i], ...r, ddElim, ratio, retenido: r.total / BASE.total });
    console.log(`| \`${campo}\` | ${nom[i]} | ${r.n} | ${eur(r.alAno)} | ${((r.total / BASE.total) * 100).toFixed(0)}% | ${eur(r.peor)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.dd)} | ${eur(ddElim)} | ${ratio != null ? (ratio).toFixed(2) : "—"} |`);
  }
}

// ── ranking por lo que pide el encargo ──
console.log("\n  ── LOS 12 MEJORES del barrido por $/año retenidos por cada $ de racha eliminado ──");
console.log("  (sólo los que de verdad reducen la racha; un ratio ALTO = mucho ingreso por poco susto quitado)\n");
console.log("| # | señal | tercio | $/año | % retenido | peor día | peor racha | racha eliminada | ratio |");
console.log("|---|---|---|---|---|---|---|---|---|");
const top = barrido.filter((b) => b.ddElim > 0).sort((a, b) => b.ratio - a.ratio).slice(0, 12);
top.forEach((b, i) => console.log(`| ${i + 1} | \`${b.campo}\` | ${b.tercio} | ${eur(b.alAno)} | ${(b.retenido * 100).toFixed(0)}% | ${eur(b.peor)} | ${eur(b.dd)} | ${eur(b.ddElim)} | ${b.ratio.toFixed(2)} |`));

console.log("\n  ── LOS 8 que más recortan el PEOR DÍA ──\n");
console.log("| # | señal | tercio | peor día | mejora | $/año | % retenido | peor racha |");
console.log("|---|---|---|---|---|---|---|---|");
const topPeor = [...barrido].sort((a, b) => b.peor - a.peor).slice(0, 8);
topPeor.forEach((b, i) => console.log(`| ${i + 1} | \`${b.campo}\` | ${b.tercio} | ${eur(b.peor)} | ${eur(b.peor - BASE.peor)} | ${eur(b.alAno)} | ${(b.retenido * 100).toFixed(0)}% | ${eur(b.dd)} |`));

writeFileSync("scripts/anatomia3-cola.json", JSON.stringify({ BASE, barrido, peor30: PEOR30.map((f) => ({ fecha: f.fecha, pl: f.pl, credito: f.credito, ivAtm11: f.ivAtm11, sigma: f.sigma, zTardePts: f.zTardePts, zTardeSigmas: f.zTardeSigmas, zPerdidaTotal: f.zPerdidaTotal, nivel: f.nivel })) }, null, 2), "utf8");
console.log("\n  detalle en scripts/anatomia3-cola.json");
