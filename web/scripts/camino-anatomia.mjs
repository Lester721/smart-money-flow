// CAMINO · PASO 2 — la ANATOMÍA de los días que duelen, sobre 1.122 días (2022-2026).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/camino-anatomia.mjs
//
// Esto es DESCRIPTIVO: no elige umbrales ni propone reglas. Sólo mide qué tienen en común los
// días malos y, sobre todo, CUÁNDO se vuelven distinguibles de los buenos. Las reglas van en el
// paso 3, y ésas sí se ajustan en un período y se prueban en el otro.

import { radiografia } from "../lib/radiografia";
import { cargar, plSalida, idx, media, pct, eur, peorRacha, auc, periodo, P1, P2, COMM, PATAS } from "./camino-lib.mjs";

const dias = cargar();
console.log(`\n═══ ${dias.length} días con cóndor abierto a las 11:00 · ±25 puntos · alas de 50 ═══`);

const HORAS = ["11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","15:45"];

// ── campos derivados que se van a usar ──
for (const d of dias) {
  d.margenMin = Math.min(...d.margen);
  const iT = d.margen.findIndex((m) => m <= 0);
  d.iToque = iT;
  d.horaToque = iT < 0 ? null : d.h[iT];
  d.minToque = iT < 0 ? null : hMin(d.h[iT]);
  d.minAlCierre = iT < 0 ? null : hMin("16:00") - hMin(d.h[iT]);
  d.plToque = iT < 0 ? null : plSalida(d, iT);
  for (const H of HORAS) { const i = idx(d, H); d[`m_${H}`] = i < 0 ? null : d.margen[i]; }
  // salto máximo de 5 minutos entre la entrada y el cierre
  let salto = 0;
  for (let i = 1; i < d.sp.length; i++) salto = Math.max(salto, Math.abs(d.sp[i] - d.sp[i - 1]));
  d.saltoMax = salto;
  d.recorrido = Math.max(...d.sp) - Math.min(...d.sp);
}
function hMin(h) { return Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)); }

radiografia(dias, ["pl", "cred", "s11", "margenMin", "m_13:00", "saltoMax", "ivEntrada"], "camino 1.122 días");

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 1 · EL REPARTO DEL DAÑO ═══`);
console.log(`(P&L de aguantar al cierre, 1 contrato, ${PATAS} patas × $${COMM} de tasas)\n`);
console.log("| período | n | % ganados | media/día | p1 | p5 | PEOR DÍA | total | peor racha |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const g of [["2022"],["2023"],["2024"],["2025"],["2026"],[P1],[P2],["TODO"]]) {
  const sel = g[0] === "TODO" ? dias : g[0].length === 4 ? dias.filter((d) => d.f.startsWith(g[0])) : dias.filter((d) => periodo(d.f) === g[0]);
  const p = sel.map((d) => d.pl);
  console.log(`| ${g[0]} | ${sel.length} | ${((p.filter((x) => x > 0).length / p.length) * 100).toFixed(0)}% | ${eur(media(p))} | ${eur(pct(p, 0.01))} | ${eur(pct(p, 0.05))} | ${eur(Math.min(...p))} | ${eur(p.reduce((a, x) => a + x, 0))} | ${eur(peorRacha(p))} |`);
}
const perd = dias.filter((d) => d.pl < 0);
const totalNeg = perd.reduce((a, d) => a + d.pl, 0);
const cola = dias.filter((d) => d.pl <= pct(dias.map((x) => x.pl), 0.05));
console.log(`\n  ${perd.length} días negativos (${((perd.length / dias.length) * 100).toFixed(0)}%) suman ${eur(totalNeg)}.`);
console.log(`  El 5% peor (${cola.length} días) suma ${eur(cola.reduce((a, d) => a + d.pl, 0))} — el ${((cola.reduce((a, d) => a + d.pl, 0) / totalNeg) * 100).toFixed(0)}% de todo lo que se pierde.`);
console.log(`  Pérdida máxima estructural: ${eur(-(50 - media(dias.map((d) => d.cred))) * 100)} (ala 50 menos el crédito medio de $${media(dias.map((d) => d.cred)).toFixed(2)}).`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 2 · ¿CUÁNDO SE ROMPE? — primera vez que el precio toca un corto ═══\n`);
const tocan = dias.filter((d) => d.iToque >= 0);
console.log(`  Tocan un corto ${tocan.length} de ${dias.length} días (${((tocan.length / dias.length) * 100).toFixed(0)}%).`);
console.log(`  De los que tocan, acaban en pérdida ${tocan.filter((d) => d.pl < 0).length} (${((tocan.filter((d) => d.pl < 0).length / tocan.length) * 100).toFixed(0)}%) — o sea que tocar NO es perder.`);
console.log(`  Días que pierden sin haber tocado nunca: ${dias.filter((d) => d.iToque < 0 && d.pl < 0).length}\n`);
console.log("| hora del PRIMER toque | días | acaban ganando | media/día | peor | pérdida total |");
console.log("|---|---|---|---|---|---|");
const franjas = [["11:00-11:59",660,719],["12:00-12:59",720,779],["13:00-13:59",780,839],["14:00-14:59",840,899],["15:00-15:29",900,929],["15:30-16:00",930,960]];
for (const [nom, a, b] of franjas) {
  const s = tocan.filter((d) => d.minToque >= a && d.minToque <= b);
  if (!s.length) continue;
  const p = s.map((d) => d.pl);
  console.log(`| ${nom} | ${s.length} | ${((p.filter((x) => x > 0).length / p.length) * 100).toFixed(0)}% | ${eur(media(p))} | ${eur(Math.min(...p))} | ${eur(p.filter((x) => x < 0).reduce((a2, x) => a2 + x, 0))} |`);
}
const sinToque = dias.filter((d) => d.iToque < 0);
console.log(`| nunca toca | ${sinToque.length} | ${((sinToque.filter((d) => d.pl > 0).length / sinToque.length) * 100).toFixed(0)}% | ${eur(media(sinToque.map((d) => d.pl)))} | ${eur(Math.min(...sinToque.map((d) => d.pl)))} | ${eur(0)} |`);

console.log(`\n  Minutos entre el primer toque y el cierre (los que tocan):`);
for (const [nom, sel] of [["acaban en pérdida", tocan.filter((d) => d.pl < 0)], ["acaban ganando", tocan.filter((d) => d.pl >= 0)]]) {
  const m = sel.map((d) => d.minAlCierre);
  console.log(`    ${nom.padEnd(20)} n=${String(sel.length).padStart(4)} · mediana ${pct(m, 0.5)} min · p25 ${pct(m, 0.25)} · p75 ${pct(m, 0.75)}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 3 · ¿SE DISTINGUEN POR SU FORMA? — poder de separación hora a hora ═══`);
console.log(`(P = probabilidad de que un día malo tenga MENOS margen que uno bueno. 50% = no se distingue)\n`);
console.log("| hora | P(malo<bueno) margen | P con el PRECIO de salida | margen medio día malo | margen medio día bueno |");
console.log("|---|---|---|---|---|");
const malos = dias.filter((d) => d.pl < 0), buenos = dias.filter((d) => d.pl >= 0);
for (const H of HORAS) {
  const i = (d) => idx(d, H);
  const mm = malos.filter((d) => i(d) >= 0), bb = buenos.filter((d) => i(d) >= 0);
  const a1 = 1 - auc(mm.map((d) => d.margen[i(d)]), bb.map((d) => d.margen[i(d)]));
  const ms = mm.filter((d) => d.sal[i(d)] != null), bs = bb.filter((d) => d.sal[i(d)] != null);
  const a2 = auc(ms.map((d) => d.sal[i(d)]), bs.map((d) => d.sal[i(d)]));   // coste de salir: más alto = peor
  console.log(`| ${H} | ${(a1 * 100).toFixed(0)}% | ${(a2 * 100).toFixed(0)}% | ${media(mm.map((d) => d.margen[i(d)])).toFixed(1)} pts | ${media(bb.map((d) => d.margen[i(d)])).toFixed(1)} pts |`);
}

console.log(`\n  Margen a las 13:00 (puntos hasta el corto más cercano) contra lo que pasa después:\n`);
console.log("| margen 13:00 | días | % pierden | media/día | peor día |");
console.log("|---|---|---|---|---|");
const cortes = [[-999, -10], [-10, 0], [0, 5], [5, 10], [10, 15], [15, 20], [20, 999]];
for (const [a, b] of cortes) {
  const s = dias.filter((d) => d["m_13:00"] != null && d["m_13:00"] >= a && d["m_13:00"] < b);
  if (!s.length) continue;
  const p = s.map((d) => d.pl);
  const et = a === -999 ? "roto >10 pts" : b === 999 ? "más de 20" : `${a} a ${b}`;
  console.log(`| ${et} | ${s.length} | ${((p.filter((x) => x < 0).length / p.length) * 100).toFixed(0)}% | ${eur(media(p))} | ${eur(Math.min(...p))} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 4 · ¿AVISA O SALTA? ═══\n`);
const gr = [["el 5% peor", cola], ["resto de negativos", dias.filter((d) => d.pl < 0 && !cola.includes(d))], ["positivos", buenos]];
console.log("| grupo | n | recorrido del día | salto máx de 5 min | margen 12:00 | margen 13:00 | margen 14:00 | IV entrada |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [nom, s] of gr) {
  const g = (c) => media(s.filter((d) => d[c] != null).map((d) => d[c])).toFixed(1);
  console.log(`| ${nom} | ${s.length} | ${media(s.map((d) => d.recorrido)).toFixed(1)} pts | ${media(s.map((d) => d.saltoMax)).toFixed(1)} pts | ${g("m_12:00")} | ${g("m_13:00")} | ${g("m_14:00")} | ${(media(s.filter((d) => d.ivEntrada != null).map((d) => d.ivEntrada)) * 100).toFixed(1)}% |`);
}
console.log(`\n  El salto: en los días del 5% peor, ¿el toque llegó de golpe o andando?`);
const salto5 = cola.filter((d) => d.iToque >= 0).map((d) => {
  const desde = Math.max(0, d.iToque - 6);   // media hora antes del toque
  return d.sp[d.iToque] - d.sp[desde];
});
console.log(`    movimiento en la media hora previa al toque: mediana ${pct(salto5.map(Math.abs), 0.5).toFixed(1)} pts · p90 ${pct(salto5.map(Math.abs), 0.9).toFixed(1)} pts`);
const gradual = cola.filter((d) => d.iToque >= 6 && Math.abs(d.sp[d.iToque] - d.sp[d.iToque - 6]) < 15).length;
console.log(`    de los ${cola.filter((d) => d.iToque >= 0).length} días del 5% peor que tocan, ${gradual} llegaron andando (menos de 15 pts en la media hora previa)`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 5 · LO QUE CUESTA SALIR EN EL MOMENTO DEL TOQUE ═══`);
console.log(`(cerrar = recomprar los cortos al ASK y vender las alas al BID; ${PATAS} patas de tasas)\n`);
const conT = tocan.filter((d) => d.plToque != null);
console.log("| grupo | n | aguantar al cierre | salir en el toque | diferencia |");
console.log("|---|---|---|---|---|");
for (const [nom, s] of [["todos los que tocan", conT], ["los que acaban en pérdida", conT.filter((d) => d.pl < 0)], ["los que acaban ganando", conT.filter((d) => d.pl >= 0)], ["el 5% peor", conT.filter((d) => cola.includes(d))]]) {
  if (!s.length) continue;
  const a = media(s.map((d) => d.pl)), b = media(s.map((d) => d.plToque));
  console.log(`| ${nom} | ${s.length} | ${eur(a)} | ${eur(b)} | ${eur(b - a)} |`);
}
console.log(`\n  En el instante del toque el cóndor ya vale, de media, ${(media(conT.map((d) => d.sal[d.iToque])) / media(conT.map((d) => d.cred))).toFixed(2)}× el crédito cobrado.`);
console.log(`  Peor día aguantando: ${eur(Math.min(...conT.map((d) => d.pl)))} · peor día saliendo en el toque: ${eur(Math.min(...conT.map((d) => d.plToque)))}`);
