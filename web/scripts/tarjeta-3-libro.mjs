// ═══════════════════════════════════════════════════════════════════════════════════════════
// TARJETA (3) — EL LIBRO DE CAJA: tamaño real, filtros de "no operar", y el puente
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/tarjeta-3-libro.mjs
//
// Entra scripts/tarjeta-ops.json (516 verticales con precios reales y salida a vencimiento).
// Aquí se responde lo que falta de la tarjeta:
//   · CUÁNTO ARRIESGA — libro de caja día a día arrancando en $7.977, sin vender HOOD
//   · CUÁNDO NO OPERA — filtros extra, elegidos en una mitad y probados en la otra
//   · QUÉ HARÍA FALTA — ventaja por operación, número de operaciones, peaje máximo
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from "node:fs";

const CUENTA = 56389, EFECTIVO = 7977;
const PRUEBAS_DECLARADAS = 24;
function listonT(p0) { if (p0 <= 1) return 2; const p = 0.05 / p0 / 2, t = Math.sqrt(-2 * Math.log(p)); return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100; }
const LISTON = listonT(PRUEBAS_DECLARADAS);
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tOf = (v) => (sd(v) > 0 ? media(v) / (sd(v) / Math.sqrt(v.length)) : NaN);
const pct = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };
const mediana = (v) => pct(v, 50);
function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }

const J = JSON.parse(readFileSync("scripts/tarjeta-ops.json", "utf8"));
const OPS = J.ops.filter((o) => o.pnl !== null).sort((a, b) => a.fecha.localeCompare(b.fecha));
exigir(J.salida === "vencimiento", `la salida cambió: ${J.salida}`);
exigir(OPS.length > 400, `muestra pequeña: ${OPS.length}`);
const DIAS_ANO = J.diasAno;
const ANOS = OPS.length / DIAS_ANO;

console.log("\n" + "═".repeat(100));
console.log("TARJETA (3) — LIBRO DE CAJA, FILTROS Y PUENTE");
console.log("═".repeat(100));
console.log(`n=${OPS.length} operaciones · ${DIAS_ANO.toFixed(0)} al año · ${ANOS.toFixed(2)} años de historia · listón t=${LISTON}`);

// ═══ 1 · CUÁNDO NO OPERA — filtros extra, elegidos en una mitad y probados en la OTRA ═══════
console.log(`\n## 1 · ¿HAY ALGÚN "NO OPERAR" QUE AÑADA? (elegido en una mitad, probado en la otra)`);
const dists = OPS.map((o) => o.dist), nets = OPS.map((o) => Math.abs(o.net));
const FILTROS = { "todo (sin filtro extra)": () => true };
for (const p of [33, 50, 67]) { const u = pct(dists, p); FILTROS[`imán a ≥ ${u.toFixed(0)} pts (p${p})`] = (o) => o.dist >= u; }
for (const p of [33, 50, 67]) { const u = pct(nets, p); FILTROS[`|gamma neta| ≥ ${(u / 1e6).toFixed(0)} M$/pto (p${p})`] = (o) => Math.abs(o.net) >= u; }
const tabla = {};
console.log(`   ${"filtro".padEnd(34)} ${"n".padStart(4)} ${"$/op".padStart(8)} ${"t".padStart(6)}  ${"A n".padStart(4)} ${"A $/op".padStart(8)}  ${"B n".padStart(4)} ${"B $/op".padStart(8)}`);
for (const [et, fn] of Object.entries(FILTROS)) {
  const T = OPS.filter(fn), A = T.filter((o) => o.mitad === "A"), B = T.filter((o) => o.mitad === "B");
  if (A.length < 60 || B.length < 60) { console.log(`   ${et.padEnd(34)} muestra insuficiente en alguna mitad — NO se usa`); continue; }
  const r = { n: T.length, med: media(T.map((o) => o.pnl)), t: tOf(T.map((o) => o.pnl)),
    nA: A.length, medA: media(A.map((o) => o.pnl)), nB: B.length, medB: media(B.map((o) => o.pnl)) };
  tabla[et] = r;
  console.log(`   ${et.padEnd(34)} ${String(r.n).padStart(4)} ${r.med.toFixed(2).padStart(8)} ${r.t.toFixed(2).padStart(6)}  ${String(r.nA).padStart(4)} ${r.medA.toFixed(2).padStart(8)}  ${String(r.nB).padStart(4)} ${r.medB.toFixed(2).padStart(8)}`);
}
const claves = Object.keys(tabla);
const gA = claves.reduce((m, k) => (tabla[k].medA > tabla[m].medA ? k : m), claves[0]);
const gB = claves.reduce((m, k) => (tabla[k].medB > tabla[m].medB ? k : m), claves[0]);
console.log(`\n   el mejor filtro según 2022-2023 es «${gA}» → en 2024-2026 da $${tabla[gA].medB.toFixed(2)}/op (sin filtro: $${tabla[claves[0]].medB.toFixed(2)})`);
console.log(`   el mejor filtro según 2024-2026 es «${gB}» → en 2022-2023 da $${tabla[gB].medA.toFixed(2)}/op (sin filtro: $${tabla[claves[0]].medA.toFixed(2)})`);
const filtroSirve = gA === gB && gA !== claves[0] && tabla[gA].medB > tabla[claves[0]].medB && tabla[gA].medA > tabla[claves[0]].medA;
console.log(`   ¿algún filtro extra sobrevive al cruce en las dos direcciones? ${filtroSirve ? `SÍ: ${gA}` : "NO — la tarjeta se queda SIN filtro extra"}`);

// ═══ 2 · EL LIBRO DE CAJA — tamaño real con $7.977 ══════════════════════════════════════════
console.log(`\n## 2 · LIBRO DE CAJA — arranca en $${EFECTIVO.toLocaleString("es-ES")}, sin vender HOOD, sin margen (las largas se pagan al contado)`);
function libro(tam, etiqueta) {
  let caja = EFECTIVO, minCaja = EFECTIVO, pico = EFECTIVO, caida = 0;
  let ops = 0, saltados = 0, contratosTot = 0, peorDia = 0, peorFecha = "", racha = 0, peorRacha = 0;
  const serie = [];
  for (const o of OPS) {
    const n = tam(o, caja);
    if (n < 1) { saltados++; serie.push({ fecha: o.fecha, pnl: 0, caja }); continue; }
    const coste = n * o.riesgo;
    if (coste > caja) { saltados++; serie.push({ fecha: o.fecha, pnl: 0, caja }); continue; }
    minCaja = Math.min(minCaja, caja - coste);          // durante el día el débito ya salió y el resultado aún no ha entrado
    const p = n * o.pnl;
    caja += p; ops++; contratosTot += n;
    if (p < peorDia) { peorDia = p; peorFecha = o.fecha; }
    if (p < 0) { racha++; peorRacha = Math.max(peorRacha, racha); } else racha = 0;
    pico = Math.max(pico, caja); caida = Math.min(caida, caja - pico);
    serie.push({ fecha: o.fecha, pnl: p, caja });
  }
  const total = caja - EFECTIVO;
  const alAno = total / ANOS;
  console.log(`   ${etiqueta}`);
  console.log(`      operaciones ${ops} (saltadas por falta de caja: ${saltados}) · contratos/op medio ${(contratosTot / Math.max(1, ops)).toFixed(2)}`);
  console.log(`      caja final $${caja.toFixed(0)} · total $${total.toFixed(0)} en ${ANOS.toFixed(2)} años → $${alAno.toFixed(0)}/año = ${(100 * alAno / CUENTA).toFixed(1)}% de la cuenta`);
  console.log(`      caja mínima vista $${minCaja.toFixed(0)} · peor día $${peorDia.toFixed(0)} (${peorFecha}) · racha perdedora más larga ${peorRacha} · peor caída acumulada $${caida.toFixed(0)}`);
  return { etiqueta, ops, saltados, cajaFinal: +caja.toFixed(0), total: +total.toFixed(0), alAno: +alAno.toFixed(0),
    pctCuenta: +(100 * alAno / CUENTA).toFixed(1), minCaja: +minCaja.toFixed(0), peorDia: +peorDia.toFixed(0), peorFecha,
    peorRacha, peorCaida: +caida.toFixed(0), contratosMedio: +(contratosTot / Math.max(1, ops)).toFixed(2), serie };
}
const LIB = {};
LIB.uno = libro(() => 1, "A) 1 contrato siempre — el tamaño más pequeño que existe");
LIB.dos = libro(() => 2, "B) 2 contratos siempre");
LIB.riesgo2 = libro((o) => Math.max(1, Math.floor(0.02 * CUENTA / o.riesgo)), "C) riesgo fijo del 2% de la cuenta ($1.128) por operación");
LIB.mitadCaja = libro((o, caja) => Math.max(1, Math.floor(0.5 * caja / o.riesgo)), "D) la mitad de la caja disponible (nunca menos de 1 contrato)");
LIB.todaCaja = libro((o, caja) => Math.floor(caja / o.riesgo), "E) TODA la caja cada día (lo que 'cabe': ~8 contratos)");
LIB.tercioCaja = libro((o, caja) => Math.max(1, Math.floor(caja / (3 * o.riesgo))), "F) un TERCIO de la caja (nunca menos de 1 contrato)");
LIB.por4000 = libro((o, caja) => Math.max(1, Math.floor(caja / 4000)), "G) 1 contrato por cada $4.000 de caja (nunca menos de 1)");

// ═══ 2b · LA PRUEBA DE RUINA — ¿y si la mala racha hubiera venido PRIMERO? ══════════════════
// El orden histórico regaló ganancias antes que la peor racha. Se baraja 2.000 veces el MISMO
// conjunto de operaciones: si la caja no aguanta ni un contrato, la estrategia se para.
console.log(`\n## 2b · PRUEBA DE RUINA — el mismo conjunto de operaciones, en 2.000 órdenes distintas`);
function rng(s0) { let a = s0 >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const RUINA = {};
for (const [et, nFijo] of [["1 contrato", 1], ["2 contratos", 2], ["3 contratos", 3]]) {
  const rnd = rng(31337);
  let arruinados = 0; const finales = []; const minimos = [];
  for (let s = 0; s < 2000; s++) {
    const barajado = [...OPS];
    for (let i = barajado.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [barajado[i], barajado[j]] = [barajado[j], barajado[i]]; }
    let caja = EFECTIVO, minC = EFECTIVO, parado = false;
    for (const o of barajado) {
      const coste = nFijo * o.riesgo;
      if (coste > caja) { parado = true; break; }        // no puede poner el tamaño de la tarjeta
      minC = Math.min(minC, caja - coste);
      caja += nFijo * o.pnl;
    }
    if (parado) arruinados++;
    finales.push(caja); minimos.push(minC);
  }
  const pr = 100 * arruinados / 2000;
  RUINA[et] = { pctRuina: +pr.toFixed(1), finalP05: +pct(finales, 5).toFixed(0), finalP50: +mediana(finales).toFixed(0), minP05: +pct(minimos, 5).toFixed(0) };
  console.log(`   ${et.padEnd(12)} se queda sin caja para poner el tamaño en el ${pr.toFixed(1)}% de los órdenes · caja final p05 $${pct(finales, 5).toFixed(0)} · p50 $${mediana(finales).toFixed(0)}`);
}
console.log(`   (el orden histórico fue AMABLE: las ganancias llegaron antes que la peor racha. Esto mide qué pasa si no.)`);

// ═══ 2c · ¿CUÁNTA CAJA HACE FALTA para que 1 contrato NO se quede tirado? ═══════════════════
console.log(`
## 2c · ¿CUÁNTA CAJA HACE FALTA? (mismo conjunto de operaciones, 2.000 órdenes, 1 contrato)`);
const CAJA_NEC = [];
for (const caja0 of [7977, 10000, 12500, 15000, 20000, 25000, 30000, 40000]) {
  const rnd = rng(31337);
  let arruinados = 0;
  for (let s = 0; s < 2000; s++) {
    const b = [...OPS];
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    let caja = caja0, parado = false;
    for (const o of b) { if (o.riesgo > caja) { parado = true; break; } caja += o.pnl; }
    if (parado) arruinados++;
  }
  const pr = 100 * arruinados / 2000;
  CAJA_NEC.push({ caja0, pctRuina: +pr.toFixed(1) });
  console.log(`   arrancando con $${String(caja0).padStart(6)} → se queda tirada el ${pr.toFixed(1)}% de las veces  ${pr <= 5 ? "← aguanta" : ""}`);
}
const minimoSeguro = CAJA_NEC.find((x) => x.pctRuina <= 5);
console.log(`   caja mínima para que la ruina baje del 5%: ${minimoSeguro ? "$" + minimoSeguro.caja0.toLocaleString("es-ES") : "más de $40.000"}  ·  Lester tiene $${EFECTIVO.toLocaleString("es-ES")}`);

// ═══ 3 · LA FORMA DEL RESULTADO ════════════════════════════════════════════════════════════
console.log(`\n## 3 · LA FORMA DEL RESULTADO (1 contrato)`);
const p = OPS.map((o) => o.pnl);
console.log(`   p05 $${pct(p, 5).toFixed(0)} · p25 $${pct(p, 25).toFixed(0)} · mediana $${mediana(p).toFixed(0)} · p75 $${pct(p, 75).toFixed(0)} · p95 $${pct(p, 95).toFixed(0)} · media $${media(p).toFixed(2)}`);
console.log(`   gana ${(100 * p.filter((x) => x > 0).length / p.length).toFixed(1)}% · pierde TODO el débito ${(100 * OPS.filter((o) => o.pnl <= -o.riesgo + 1).length / p.length).toFixed(1)}% · cobra el ancho entero ${(100 * OPS.filter((o) => o.pnl >= o.techo - 1).length / p.length).toFixed(1)}%`);
const orden = [...OPS].sort((a, b) => b.pnl - a.pnl);
const top5 = orden.slice(0, 5).reduce((a, o) => a + o.pnl, 0), tot = p.reduce((a, x) => a + x, 0);
console.log(`   los 5 mejores días valen $${top5.toFixed(0)} de $${tot.toFixed(0)} totales = ${(100 * top5 / tot).toFixed(1)}%  ${top5 / tot > 0.5 ? "← CONCENTRADO: casi todo sale de un puñado de días" : ""}`);
for (const k of [1, 3, 5, 10]) {
  const sin = orden.slice(k).map((o) => o.pnl);
  console.log(`      sin los ${String(k).padStart(2)} mejores días: $${media(sin).toFixed(2)}/op → $${(media(sin) * DIAS_ANO).toFixed(0)}/año (t=${tOf(sin).toFixed(2)})`);
}
console.log(`\n   AÑO A AÑO (1 contrato):`);
for (const a of [...new Set(OPS.map((o) => o.ano))].sort()) {
  const g = OPS.filter((o) => o.ano === a).map((o) => o.pnl);
  console.log(`      ${a}: n=${String(g.length).padStart(3)} · $${media(g).toFixed(2)}/op · total $${g.reduce((x, y) => x + y, 0).toFixed(0)} · t=${tOf(g).toFixed(2)}`);
}
const anos = [...new Set(OPS.map((o) => o.ano))].sort();
const positivos = anos.filter((a) => OPS.filter((o) => o.ano === a).reduce((x, o) => x + o.pnl, 0) > 0).length;
console.log(`   años positivos: ${positivos} de ${anos.length}`);

// ═══ 4 · TERCIOS (no dos mitades) ═══════════════════════════════════════════════════════════
console.log(`\n## 4 · TRES TERCIOS por orden de fecha`);
const T3 = [];
for (let i = 0; i < 3; i++) {
  const g = OPS.slice(Math.floor(i * OPS.length / 3), Math.floor((i + 1) * OPS.length / 3));
  const v = g.map((o) => o.pnl);
  T3.push({ desde: g[0].fecha, hasta: g[g.length - 1].fecha, n: g.length, med: +media(v).toFixed(2), t: +tOf(v).toFixed(2) });
  console.log(`   ${g[0].fecha} → ${g[g.length - 1].fecha}: n=${g.length} · $${media(v).toFixed(2)}/op · t=${tOf(v).toFixed(2)}`);
}
console.log(`   los tres tercios del mismo signo: ${T3.every((x) => x.med > 0) ? "SÍ" : "NO"}`);

// ═══ 5 · EL PUENTE ═════════════════════════════════════════════════════════════════════════
console.log(`\n## 5 · EL PUENTE — qué haría falta para que esto DIERA DINERO de verdad`);
const s = sd(p), m = media(p);
const nNec = Math.pow(LISTON * s / m, 2);
console.log(`   Hoy: $${m.toFixed(2)}/op con desviación $${s.toFixed(0)} → t=${tOf(p).toFixed(2)}. El listón es ${LISTON}.`);
console.log(`   · POR MUESTRA: harían falta ${nNec.toFixed(0)} operaciones = ${(nNec / DIAS_ANO).toFixed(0)} años. Descartado: nadie espera eso.`);
const ventajaNec = LISTON * s / Math.sqrt(OPS.length);
console.log(`   · POR VENTAJA: con estas ${OPS.length} operaciones haría falta $${ventajaNec.toFixed(2)}/op (hoy $${m.toFixed(2)}) → falta ${(ventajaNec / m).toFixed(1)}× más.`);
console.log(`     En acierto direccional: el punto muerto de esta vertical está en ${(100 * mediana(OPS.map((o) => o.riesgo)) / (mediana(OPS.map((o) => o.riesgo)) + mediana(OPS.map((o) => o.techo)))).toFixed(1)}% y se acierta el ${(100 * p.filter((x) => x > 0).length / p.length).toFixed(1)}%.`);
const peajeMed = mediana(OPS.map((o) => o.debito));
console.log(`   · POR PEAJE: el débito mediano es ${peajeMed.toFixed(2)} pts sobre un ancho de ${mediana(OPS.map((o) => o.ancho)).toFixed(0)} pts (${(100 * peajeMed / mediana(OPS.map((o) => o.ancho))).toFixed(0)}% del ancho).`);
// cuánto peaje aguanta antes de irse a cero: cada céntimo de horquilla ahorrado son $100/op... no:
// 1 punto de débito menos = $100 más por operación. Lo que aguanta:
console.log(`     Cada punto de débito que se ahorre son $100 por operación. Para llegar a los $${ventajaNec.toFixed(0)}/op que exige el listón`);
console.log(`     habría que entrar ${((ventajaNec - m) / 100).toFixed(2)} pts más barato — el ${(100 * ((ventajaNec - m) / 100) / peajeMed).toFixed(0)}% del débito. Con horquilla p50 de 0,20 pts en cada pata,`);
console.log(`     el peaje TOTAL de entrada es ~0,40 pts = $40: aunque se entrara a punto medio en las dos patas (imposible), sólo se ganan $20/op.`);
console.log(`   · MÁXIMO PEAJE TOLERABLE hoy: la ventaja bruta antes de horquilla es $${(m + 20).toFixed(2)}/op; el peaje se come $20. Aguanta hasta $${(m + 20).toFixed(0)} de peaje antes de irse a cero.`);

writeFileSync("scripts/tarjeta-resultado.json", JSON.stringify({
  generado: new Date().toISOString(), n: OPS.length, diasAno: DIAS_ANO, anos: +ANOS.toFixed(2), liston: LISTON,
  salida: J.salida, control: J.control, tasaAlcista: J.tasaAlcista,
  porOp: +m.toFixed(2), t: +tOf(p).toFixed(2), sd: +s.toFixed(0),
  filtroExtraSirve: filtroSirve, filtroA: gA, filtroB: gB,
  tercios: T3, anosPositivos: `${positivos} de ${anos.length}`,
  concentracionTop5: +(100 * top5 / tot).toFixed(1),
  ruina: RUINA, cajaNecesaria: CAJA_NEC, cajaMinimaSegura: minimoSeguro ? minimoSeguro.caja0 : null,
  libros: Object.fromEntries(Object.entries(LIB).map(([k, v]) => [k, { ...v, serie: undefined }])),
  puente: { opsNecesarias: +nNec.toFixed(0), anosNecesarios: +(nNec / DIAS_ANO).toFixed(0), ventajaNecesariaPorOp: +ventajaNec.toFixed(2), faltaVeces: +(ventajaNec / m).toFixed(1) },
}, null, 1));
console.log(`\n   → scripts/tarjeta-resultado.json\n`);
