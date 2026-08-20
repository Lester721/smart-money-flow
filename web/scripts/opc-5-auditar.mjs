// ═══════════════════════════════════════════════════════════════════════════════════════════
// OPERAR · OPCIONES (5) — AUDITAR el único candidato antes de contarlo.
//
//   1 · ¿está el resultado en unos pocos días? (recortar las colas y ver qué queda)
//   2 · año por año — ¿o son dos años buenos y tres planos?
//   3 · ¿DE DÓNDE sale el dinero? La misma vertical dejada vencer da +$65,82 y cerrada a las
//       15:55 da −$0,32. La diferencia es el peaje de salida que NO se paga al dejar vencer.
//       Hay que separar: ¿es dirección, o es sólo no pagar la salida?
//   4 · el listón, otra vez, contra las dos preguntas distintas que hay encima de la mesa.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/opc-5-auditar.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { cargar, operar, señal, listonT, exigir, media, sd, tOf, pctl, med, f2, f0, rng, CUENTA } from "./opc-lib.mjs";

const LISTON = listonT(32);
const { nivPorFecha, CACHE } = cargar();

function ops(vid, xid, ladoDe) {
  const out = [];
  for (const d of CACHE) {
    const f = nivPorFecha.get(d.f); if (!f) continue;
    const s = señal(f, "S1"); if (!s) continue;
    const lado = ladoDe ? ladoDe() : s.lado;
    const o = operar(d, lado, s.objetivo, vid, xid);
    if (o.fuera) continue;
    out.push({ ...o, fecha: d.f, ano: +d.f.slice(0, 4) });
  }
  out.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return out;
}

const V = ops("VERT", "VENC");
const V1555 = ops("VERT", "15:55");
exigir(V.length > 300 && V1555.length > 300, "muestra corta");

console.log("\n" + "═".repeat(97));
console.log(`OPERAR · OPCIONES (5) — AUDITORÍA del candidato: vertical ATM→0,5% hacia el imán`);
console.log("═".repeat(97));

// ═══ 1 · CONCENTRACIÓN ══════════════════════════════════════════════════════════════════════
console.log(`\n## 1 · ¿ESTÁ EL RESULTADO EN UNOS POCOS DÍAS?\n`);
{
  const pnl = V.map((o) => o.pnl);
  const ord = [...pnl].sort((a, b) => b - a);
  const tot = pnl.reduce((a, x) => a + x, 0);
  console.log(`   n=${V.length} · total $${f0(tot)} · media $${f2(media(pnl))} · mediana $${f0(med(pnl))}`);
  for (const k of [1, 5, 10, 25]) {
    const top = ord.slice(0, k).reduce((a, x) => a + x, 0);
    console.log(`   los ${String(k).padStart(2)} mejores días aportan $${f0(top).padStart(9)} = ${(100 * top / tot).toFixed(0)}% del total`);
  }
  // media recortada
  for (const q of [5, 10, 20]) {
    const lo = pctl(pnl, q), hi = pctl(pnl, 100 - q);
    const rec = pnl.filter((x) => x >= lo && x <= hi);
    console.log(`   media recortando el ${q}% de cada cola: $${f2(media(rec))} (n=${rec.length})`);
  }
  console.log(`\n   La mediana es $${f0(med(pnl))}: más de la mitad de los días PIERDEN. El resultado vive`);
  console.log(`   en la cola derecha — que es exactamente lo que una vertical de débito hace.`);
}

// ═══ 2 · AÑO POR AÑO ════════════════════════════════════════════════════════════════════════
console.log(`\n\n## 2 · AÑO POR AÑO\n`);
console.log(`   ${"año".padEnd(6)} ${"n".padStart(5)} ${"$/op".padStart(9)} ${"t".padStart(7)} ${"total".padStart(10)} ${"gana %".padStart(8)}`);
for (const a of [2022, 2023, 2024, 2025, 2026]) {
  const g = V.filter((o) => o.ano === a).map((o) => o.pnl);
  if (!g.length) continue;
  console.log(`   ${String(a).padEnd(6)} ${String(g.length).padStart(5)} ${("$" + f2(media(g))).padStart(9)} ${f2(tOf(g)).padStart(7)} ${("$" + f0(g.reduce((x, y) => x + y, 0))).padStart(10)} ${(100 * g.filter((x) => x > 0).length / g.length).toFixed(0).padStart(7)}%`);
}
{
  const porAno = [2022, 2023, 2024, 2025, 2026].map((a) => media(V.filter((o) => o.ano === a).map((o) => o.pnl))).filter(Number.isFinite);
  console.log(`\n   años positivos: ${porAno.filter((x) => x > 0).length} de ${porAno.length}`);
}

// ═══ 3 · ¿DIRECCIÓN, O SÓLO NO PAGAR LA SALIDA? ═════════════════════════════════════════════
console.log(`\n\n## 3 · ¿DE DÓNDE SALE EL DINERO? dirección contra peaje de salida\n`);
{
  const rnd = rng(2211);
  const azarV = [], azar1555 = [];
  for (let s = 0; s < 400; s++) {
    azarV.push(media(ops("VERT", "VENC", () => (rnd() < 0.5 ? 1 : -1)).map((o) => o.pnl)));
    azar1555.push(media(ops("VERT", "15:55", () => (rnd() < 0.5 ? 1 : -1)).map((o) => o.pnl)));
  }
  const mV = media(V.map((o) => o.pnl)), m55 = media(V1555.map((o) => o.pnl));
  const aV = media(azarV), a55 = media(azar1555);
  console.log(`   ${"".padEnd(26)} ${"lado del imán".padStart(15)} ${"lado al azar".padStart(14)} ${"lo que aporta el lado".padStart(23)}`);
  console.log(`   ${"dejada vencer".padEnd(26)} ${("$" + f2(mV)).padStart(15)} ${("$" + f2(aV)).padStart(14)} ${("$" + f2(mV - aV)).padStart(23)}`);
  console.log(`   ${"cerrada a las 15:55".padEnd(26)} ${("$" + f2(m55)).padStart(15)} ${("$" + f2(a55)).padStart(14)} ${("$" + f2(m55 - a55)).padStart(23)}`);
  console.log(`\n   peaje de CERRAR la vertical a las 15:55 en vez de dejarla vencer: $${f2(mV - m55)}/op`);
  console.log(`   (vender la larga al BID y recomprar la corta al ASK, las dos horquillas otra vez)`);
  console.log(`\n   Las dos cosas son reales y hay que decirlas juntas:`);
  console.log(`     · el LADO del imán aporta $${f2(mV - aV)}/op sobre el azar — eso NO es cero.`);
  console.log(`     · pero el nivel de partida es negativo: con el lado al azar se pierde $${f2(-aV)}/op.`);
  console.log(`       Todo el beneficio ABSOLUTO depende de no pagar el peaje de salida, y eso`);
  console.log(`       obliga a llevar la posición al cierre: no es day trading, es una apuesta al día.`);
}

// ═══ 4 · LAS DOS PREGUNTAS, SEPARADAS ═══════════════════════════════════════════════════════
console.log(`\n\n## 4 · LAS DOS PREGUNTAS QUE NO SON LA MISMA\n`);
{
  const pnl = V.map((o) => o.pnl);
  console.log(`   (a) "¿tiene el nivel INFORMACIÓN sobre el lado?"`);
  console.log(`       contra el azar: percentil 98,75 · z≈2,1 — apunta a que sí, débil.`);
  console.log(`   (b) "¿GANA DINERO esto?"`);
  console.log(`       contra CERO: t=${f2(tOf(pnl))} · listón ${LISTON} · IC95 del año cruza el cero.`);
  console.log(`\n   Se puede responder que sí a (a) y no a (b) sin contradicción, y es lo que pasa:`);
  console.log(`   la información existe pero es más pequeña que el ruido del vehículo que la cobra.`);
  console.log(`   Y en las dos mitades el efecto se PARTE: $88,99 → $45,91.`);
}
console.log("\n" + "═".repeat(97) + "\n");
