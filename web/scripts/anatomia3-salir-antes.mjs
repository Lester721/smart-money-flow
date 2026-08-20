// ANATOMÍA 3 · EL PUENTE — si el daño entra por la subasta de cierre, salir antes de la subasta.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/anatomia3-salir-antes.mjs
//
// ═══ DE DÓNDE SALE ESTA PRUEBA ═══════════════════════════════════════════════════════════════
//
// El fin de mes mueve 0,196 σ de las 15:30 al cierre contra 0,126 σ de un día normal, y el 61%
// de los fines de mes rompen los ±25 puntos contra el 33% del resto. Si el mecanismo es el
// desequilibrio de órdenes de la subasta de cierre, entonces NO hace falta dejar de operar ese
// día: basta con no estar dentro cuando cruza.
//
// Y eso no hay que estimarlo: las cadenas en disco tienen cotización cada 5 minutos hasta las
// 16:00. Se puede CERRAR el cóndor a cualquier hora con precios reales.
//
// ═══ CÓMO SE CIERRA ══════════════════════════════════════════════════════════════════════════
// Comprar de vuelta lo vendido al ASK y vender lo comprado al BID — la horquilla entera OTRA VEZ,
// que es justo lo que mató a media docena de hallazgos de este proyecto. Mismas comisiones que
// aguantar al cierre (8 × $0,03) para que la comparación sea limpia.
//
// ═══ PRUEBAS ═════════════════════════════════════════════════════════════════════════════════
// 3 horas de salida × 2 grupos (todos los días / sólo fin de mes) = 6, más 1 de interacción = 7.
// Total acumulado sobre estos mismos 653 días: 187. listonT(187) ≈ 3,65.

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";
import { cargar, resumen, media, pct, eur } from "./anatomia3-lib.mjs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", ALA = 50, SEP = 25, COMM = 0.03;
const SALIDAS = ["15:00", "15:30", "15:45"];
const PRUEBAS = 187, LISTON = listonT(PRUEBAS);

const { filas } = cargar();
const ANOS = filas.length / 251;
const BASE = resumen(filas, ANOS);

/** Lee un día y devuelve, por hora, el mapa strike → {bid, ask}. Sólo las horas que hagan falta. */
function leerDia(fecha, right, horas) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid"), iA = cab.indexOf("ask"), iU = cab.indexOf("underlying_price");
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) throw new Error(`faltan columnas en ${f}`);
  const set = new Set(horas);
  const out = new Map(); for (const h of horas) out.set(h, new Map());
  let spot11 = 0;
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j]; if (L.length < 20) continue;
    const c = L.split(",");
    const h = c[iT].slice(11, 16);
    if (!set.has(h)) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (!(K > 0)) continue;
    out.get(h).set(K, { bid, ask });
    if (h === HORA) { const sp = Number(c[iU]); if (sp > 0) spot11 = sp; }
  }
  return { out, spot11 };
}
const cercaK = (mapa, o) => { let mej = null, d = Infinity; for (const K of mapa.keys()) { const dd = Math.abs(K - o); if (dd < d) { d = dd; mej = K; } } return mej; };

console.log("═".repeat(104));
console.log(`  SALIR ANTES DE LA SUBASTA · ${filas.length} días · listón |t| ≥ ${LISTON} (Bonferroni sobre ${PRUEBAS})`);
console.log("═".repeat(104));
console.log(`  aguantando al cierre (línea base): ${eur(BASE.alAno)}/año · peor día ${eur(BASE.peor)} · peor racha ${eur(BASE.dd)}\n`);

const horas = [HORA, ...SALIDAS];
const porFecha = new Map(filas.map((f) => [f.fecha, f]));
let sinDato = 0;
const t0 = Date.now();
for (let i = 0; i < filas.length; i++) {
  const f = filas[i];
  if (i % 100 === 0) console.log(`   ${i}/${filas.length} · ${f.fecha} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const C = leerDia(f.fecha, "C", horas), P = leerDia(f.fecha, "P", horas);
  if (!C || !P) { sinDato++; continue; }
  const c11 = C.out.get(HORA), p11 = P.out.get(HORA);
  const sp11 = C.spot11;
  const kcC = cercaK(c11, sp11 + SEP), kpC = cercaK(p11, sp11 - SEP);
  const kcL = cercaK(c11, kcC + ALA), kpL = cercaK(p11, kpC - ALA);
  // se reconstruye el MISMO cóndor y se comprueba contra el crédito ya guardado
  const cred = (c11.get(kcC).bid + p11.get(kpC).bid - c11.get(kcL).ask - p11.get(kpL).ask) * 100;
  f.zCredChk = cred;
  for (const h of SALIDAS) {
    const cs = C.out.get(h), ps = P.out.get(h);
    if (!cs.has(kcC) || !cs.has(kcL) || !ps.has(kpC) || !ps.has(kpL)) { f["pl" + h] = null; continue; }
    // cerrar: recomprar lo vendido al ASK, vender lo comprado al BID
    const coste = (cs.get(kcC).ask + ps.get(kpC).ask - cs.get(kcL).bid - ps.get(kpL).bid) * 100;
    f["pl" + h] = cred - coste - 8 * COMM;
  }
}
if (sinDato) console.log(`\n  ⚠️ ${sinDato} días sin fichero — NO se rellenan, se quedan fuera`);

// el crédito reconstruido tiene que cuadrar con el que ya estaba guardado
const desv = filas.filter((f) => f.zCredChk != null && Math.abs(f.zCredChk - f.credito) > 1);
if (desv.length) throw new Error(`${desv.length} días donde el crédito reconstruido NO cuadra con regimen-filas.json (p.ej. ${desv[0].fecha}: ${desv[0].zCredChk} contra ${desv[0].credito})`);
console.log(`\n  ✓ el crédito reconstruido cuadra con regimen-filas.json en los ${filas.length} días`);

radiografia(filas, ["pl", ...SALIDAS.map((h) => "pl" + h)], "P&L cerrando antes", { maxCeros: 0.2 });

console.log("| salida | n | $/año | % del ingreso | media/op | acierto | PEOR DÍA | p1 | p5 | PEOR RACHA |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
console.log(`| **16:00 (aguantar)** | ${BASE.n} | ${eur(BASE.alAno)} | 100% | ${eur(BASE.media)} | ${(BASE.acierto * 100).toFixed(0)}% | ${eur(BASE.peor)} | ${eur(BASE.p1)} | ${eur(BASE.p5)} | ${eur(BASE.dd)} |`);
const res = {};
for (const h of SALIDAS) {
  const g = filas.filter((f) => f["pl" + h] != null).map((f) => ({ ...f, pl: f["pl" + h] }));
  const r = resumen(g, ANOS);
  res[h] = r;
  console.log(`| ${h} | ${r.n} | ${eur(r.alAno)} | ${((r.total / BASE.total) * 100).toFixed(0)}% | ${eur(r.media)} | ${(r.acierto * 100).toFixed(0)}% | ${eur(r.peor)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.dd)} |`);
}

console.log("\n  ── y SÓLO en los fines de mes, que es donde la subasta pega ──\n");
console.log("| salida | n | media/op | total | PEOR DÍA |");
console.log("|---|---|---|---|---|");
const FIN = filas.filter((f) => f.finMes === 1);
console.log(`| **16:00 (aguantar)** | ${FIN.length} | ${eur(media(FIN.map((f) => f.pl)))} | ${eur(FIN.reduce((a, f) => a + f.pl, 0))} | ${eur(Math.min(...FIN.map((f) => f.pl)))} |`);
for (const h of SALIDAS) {
  const g = FIN.filter((f) => f["pl" + h] != null).map((f) => f["pl" + h]);
  if (!g.length) { console.log(`| ${h} | 0 | SIN DATO | | |`); continue; }
  console.log(`| ${h} | ${g.length} | ${eur(media(g))} | ${eur(g.reduce((a, b) => a + b, 0))} | ${eur(Math.min(...g))} |`);
}

// la comparación que decide: ¿cuánto cuesta la horquilla de salir, y cuánta cola compra?
console.log("\n  ── lo que se paga y lo que se compra ──");
for (const h of SALIDAS) {
  const r = res[h];
  const cuesta = BASE.alAno - r.alAno;
  const compra = r.dd - BASE.dd;
  console.log(`  ${h}: cuesta ${eur(cuesta)}/año · peor día ${eur(BASE.peor)} → ${eur(r.peor)} (${eur(r.peor - BASE.peor)}) · racha ${eur(BASE.dd)} → ${eur(r.dd)} (${eur(compra)})`);
}

// ══ LA INTERACCIÓN, con su aviso ════════════════════════════════════════════
// ⚠️ ESTO NO ES EVIDENCIA NUEVA. "Salir a las 15:00 gana más el último día del mes" y "el índice
// se mueve más después de las 15:00 el último día del mes" son LA MISMA FRASE contada de dos
// maneras. Sirve para ponerle cifra a la decisión, no para sumar una segunda confirmación.
// Y el confundido que hay que decir en voz alta: cerrar antes recorta la cola de CUALQUIER día
// de cola. Parte de la ventaja no es del calendario, es de estar menos tiempo dentro.
console.log("\n" + "═".repeat(104));
console.log("  LA INTERACCIÓN — ¿salir antes ayuda MÁS el último día del mes? (1 prueba más: total 187)");
console.log("═".repeat(104));
console.log("| salida | ganancia de cerrar, fin de mes | ganancia de cerrar, resto | diferencia | t | listón |");
console.log("|---|---|---|---|---|---|");
const inter = {};
for (const h of SALIDAS) {
  const g = filas.filter((f) => f["pl" + h] != null);
  const a = g.filter((f) => f.finMes === 1).map((f) => f["pl" + h] - f.pl);
  const b = g.filter((f) => f.finMes === 0).map((f) => f["pl" + h] - f.pl);
  const t = tWelch(a, b);
  inter[h] = { finMes: media(a), resto: media(b), dif: media(a) - media(b), t };
  console.log(`| ${h} | ${eur(media(a))}/día | ${eur(media(b))}/día | ${eur(media(a) - media(b))} | **${t.toFixed(2)}** | ${LISTON} |`);
}
console.log("\n  Léase así: cerrar antes CUESTA dinero un día normal (la horquilla de las cuatro patas)");
console.log("  y lo AHORRA el último día del mes. Pero con n=31 y siendo la misma medida que el");
console.log("  movimiento en σ, esto NO añade una confirmación: pone el precio, nada más.");

writeFileSync("scripts/anatomia3-salir-antes.json", JSON.stringify({ BASE, res, inter,
  finMes: Object.fromEntries(SALIDAS.map((h) => [h, { n: FIN.filter((f) => f["pl" + h] != null).length, media: media(FIN.filter((f) => f["pl" + h] != null).map((f) => f["pl" + h])) }])) }, null, 2), "utf8");
console.log("\n  detalle en scripts/anatomia3-salir-antes.json");
