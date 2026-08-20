// ANATOMÍA 3 · VEREDICTO — el fin de mes, hasta el fondo.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/anatomia3-veredicto.mjs
//
// De todo el barrido sólo una candidata sobrevive con el signo igual en los tres tercios Y un
// mecanismo que se puede nombrar: **el último día de negociación del mes**. Aquí se le hacen las
// cuatro preguntas que matan a casi todo:
//
//   A · ¿CUÁNTOS DÍAS lo cargan?  Si seis días de 653 son todo el efecto, no es una regla.
//   B · ¿EXISTE EL MECANISMO?     El reajuste de carteras cruza en la subasta de cierre. Si es
//                                 eso, el tramo 15:30→16:00 tiene que ser MÁS GRANDE ese día.
//                                 Si no lo es, la historia es un cuento puesto encima del dato.
//   C · ¿LO BATE OPERAR MÁS PEQUEÑO?  A la MISMA caída, ¿cuál de las dos da más dinero?
//   D · ¿CUÁNTA MUESTRA HARÍA FALTA?  32 fines de mes no son una muestra: son 32.

import { writeFileSync } from "node:fs";
import { tWelch, listonT, pasarBarrera, informe, potencia } from "../lib/barreraHallazgos";
import { cargar, resumen, drawdown, media, sd, pct, eur } from "./anatomia3-lib.mjs";

const PRUEBAS = 180, LISTON = listonT(PRUEBAS);
const { filas } = cargar();
const ANOS = filas.length / 251;
const BASE = resumen(filas, ANOS);
const cvar = (fs, q = 0.05) => { const p = fs.map((f) => f.pl).sort((a, b) => a - b); return media(p.slice(0, Math.max(1, Math.floor(p.length * q)))); };

const FIN = filas.filter((f) => f.finMes === 1), RESTO = filas.filter((f) => f.finMes === 0);
console.log("═".repeat(104));
console.log(`  EL FIN DE MES · ${FIN.length} días de ${filas.length} · listón |t| ≥ ${LISTON} (Bonferroni sobre ${PRUEBAS} pruebas)`);
console.log("═".repeat(104));
console.log(`  fin de mes: ${eur(media(FIN.map((f) => f.pl)))}/día · resto: ${eur(media(RESTO.map((f) => f.pl)))}/día · t=${tWelch(FIN.map((f) => f.pl), RESTO.map((f) => f.pl)).toFixed(2)}`);

// ══ A · CONCENTRACIÓN ═══════════════════════════════════════════════════════
console.log("\n" + "─".repeat(104));
console.log("  A · ¿CUÁNTOS DÍAS CARGAN EL EFECTO?");
console.log("─".repeat(104));
const finOrd = [...FIN].sort((a, b) => a.pl - b.pl);
console.log("| fecha | P&L | crédito | IV 11:00 | mov. tarde (pts) | de 15:30 al cierre (pts) |");
console.log("|---|---|---|---|---|---|");
for (const f of finOrd) console.log(`| ${f.fecha} | ${eur(f.pl)} | ${eur(f.credito)} | ${f.ivAtm11.toFixed(1)}% | ${f.zTardePts.toFixed(0)} | ${f.zCierrePts != null ? f.zCierrePts.toFixed(1) : "—"} |`);
const totalFin = FIN.reduce((a, f) => a + f.pl, 0);
console.log(`\n  total de los ${FIN.length} fines de mes: ${eur(totalFin)} · mediana ${eur(pct(FIN.map((f) => f.pl), 0.5))}`);
const perdedores = finOrd.filter((f) => f.pl < -1000);
console.log(`  días con pérdida > $1.000: ${perdedores.length} de ${FIN.length}, y suman ${eur(perdedores.reduce((a, f) => a + f.pl, 0))}`);
console.log(`  los OTROS ${FIN.length - perdedores.length} fines de mes ganan ${eur(media(finOrd.filter((f) => f.pl >= -1000).map((f) => f.pl)))}/día — MÁS que la media general de ${eur(BASE.media)}`);
console.log(`\n  quitando SÓLO el peor fin de mes (${finOrd[0].fecha}): la media del fin de mes pasa de ${eur(media(FIN.map((f) => f.pl)))} a ${eur(media(finOrd.slice(1).map((f) => f.pl)))}`);
console.log(`  quitando los DOS peores: ${eur(media(finOrd.slice(2).map((f) => f.pl)))} · los TRES peores: ${eur(media(finOrd.slice(3).map((f) => f.pl)))}`);
const porAno = new Map();
for (const f of FIN) { const a = f.fecha.slice(0, 4); if (!porAno.has(a)) porAno.set(a, []); porAno.get(a).push(f.pl); }
console.log("\n  año a año (dejar fuera un año no puede dar la vuelta al signo si el efecto es real):");
for (const [a, v] of [...porAno.entries()].sort()) console.log(`    ${a}  n=${v.length}  media ${eur(media(v))}  peor ${eur(Math.min(...v))}`);

// ══ B · EL MECANISMO ════════════════════════════════════════════════════════
console.log("\n" + "─".repeat(104));
console.log("  B · ¿EXISTE EL MECANISMO? — el reajuste de carteras cruza en la subasta de cierre");
console.log("─".repeat(104));
console.log("  Si el fin de mes hace daño por el desequilibrio de órdenes al cierre, el tramo de las");
console.log("  15:30 al cierre tiene que ser MÁS GRANDE ese día. Y si NO lo es, la explicación no vale");
console.log("  aunque los números del P&L salgan: sería una correlación con un cuento encima.\n");
const conCierre = filas.filter((f) => f.zCierreAbs != null);
const fc = conCierre.filter((f) => f.finMes === 1).map((f) => f.zCierreAbs);
const rc = conCierre.filter((f) => f.finMes === 0).map((f) => f.zCierreAbs);
const fcs = conCierre.filter((f) => f.finMes === 1).map((f) => f.zCierreSigmas);
const rcs = conCierre.filter((f) => f.finMes === 0).map((f) => f.zCierreSigmas);
console.log(`  movimiento de 15:30 al cierre, EN PUNTOS:  fin de mes ${media(fc).toFixed(1)} · resto ${media(rc).toFixed(1)} · t=${tWelch(fc, rc).toFixed(2)}`);
console.log(`  el mismo, EN σ DEL DÍA:                    fin de mes ${media(fcs).toFixed(3)} · resto ${media(rcs).toFixed(3)} · t=${tWelch(fcs, rcs).toFixed(2)}`);
console.log(`  mediana en σ:                              fin de mes ${pct(fcs, 0.5).toFixed(3)} · resto ${pct(rcs, 0.5).toFixed(3)}`);
console.log(`  p90 en σ:                                  fin de mes ${pct(fcs, 0.9).toFixed(3)} · resto ${pct(rcs, 0.9).toFixed(3)}`);
// y el movimiento de TODA la tarde, que es lo que de verdad liquida el cóndor
const ft = FIN.map((f) => f.zTardeSigmas), rt = RESTO.map((f) => f.zTardeSigmas);
console.log(`\n  movimiento de 11:00 al cierre en σ:        fin de mes ${media(ft).toFixed(3)} · resto ${media(rt).toFixed(3)} · t=${tWelch(ft, rt).toFixed(2)}`);
console.log(`  % de días que rompen los ±25 puntos:       fin de mes ${((FIN.filter((f) => f.zTardeAbs > 25).length / FIN.length) * 100).toFixed(0)}% · resto ${((RESTO.filter((f) => f.zTardeAbs > 25).length / RESTO.length) * 100).toFixed(0)}%`);
// control: la VÍSPERA y el PRIMER día del mes no deberían tener nada si el mecanismo es la subasta
const VIS = filas.filter((f) => f.vispera === 1), PRI = filas.filter((f) => f.primeroMes === 1);
console.log(`\n  CONTROLES (si el mecanismo es la subasta del último día, estos NO deben mostrar nada):`);
console.log(`    víspera del fin de mes:  n=${VIS.length} · ${eur(media(VIS.map((f) => f.pl)))}/día · t contra el resto ${tWelch(VIS.map((f) => f.pl), RESTO.map((f) => f.pl)).toFixed(2)}`);
console.log(`    primer día del mes:      n=${PRI.length} · ${eur(media(PRI.map((f) => f.pl)))}/día · t contra el resto ${tWelch(PRI.map((f) => f.pl), RESTO.map((f) => f.pl)).toFixed(2)}`);

// ══ C · ¿LO BATE OPERAR MÁS PEQUEÑO? ════════════════════════════════════════
console.log("\n" + "─".repeat(104));
console.log("  C · A LA MISMA CAÍDA, ¿QUÉ DA MÁS DINERO: el filtro o operar más pequeño?");
console.log("─".repeat(104));
const REGLAS = [
  ["quitar fin de mes", (f) => f.finMes === 1],
  ["quitar fin de mes Y su víspera", (f) => f.finMes === 1 || f.vispera === 1],
];
console.log("| regla | días fuera | $/año | peor día | peor racha | tamaño equivalente | $/año operando pequeño | ¿gana el filtro? |");
console.log("|---|---|---|---|---|---|---|---|");
const salida = [];
for (const [nom, fn] of REGLAS) {
  const dentro = filas.filter((f) => !fn(f));
  const r = resumen(dentro, ANOS);
  const escala = Math.abs(r.dd) / Math.abs(BASE.dd);            // tamaño que da ESA misma caída
  const alAnoPequeno = BASE.alAno * escala;
  salida.push({ nom, ...r, escala, alAnoPequeno, gana: r.alAno > alAnoPequeno });
  console.log(`| ${nom} | ${filas.length - dentro.length} | ${eur(r.alAno)} | ${eur(r.peor)} | ${eur(r.dd)} | ×${escala.toFixed(2)} | ${eur(alAnoPequeno)} | ${r.alAno > alAnoPequeno ? "🟢 sí, ×" + (r.alAno / alAnoPequeno).toFixed(2) : "no"} |`);
}
console.log("\n  Ojo con leer esto de más: la caída del filtro está medida EN LA MISMA MUESTRA en la que");
console.log("  se eligió el filtro. Operar más pequeño no tiene ese problema: funciona igual mañana.");

// ══ D · LA BARRERA Y LA MUESTRA ═════════════════════════════════════════════
console.log("\n" + "─".repeat(104));
console.log("  D · LA BARRERA · y cuánta muestra haría falta");
console.log("─".repeat(104));
const fh = filas.map((f) => ({ pnl: f.pl, ticker: f.fecha.slice(0, 7), fecha: f.fecha }));
const porFecha = new Map(filas.map((f) => [f.fecha, f]));
const v = pasarBarrera(fh, (x) => porFecha.get(x.fecha).finMes, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
console.log(informe(v, "fin de mes (tercio alto contra bajo por `finMes`)"));
console.log("\n  ⚠️ `finMes` es BINARIA: partirla en tercios la deja sin sentido (dos tercios valen 0).");
console.log("     La prueba que vale es la de los 32 días marcados contra los otros 621:\n");
const t = tWelch(FIN.map((f) => f.pl), RESTO.map((f) => f.pl));
const dif = media(FIN.map((f) => f.pl)) - media(RESTO.map((f) => f.pl));
const sPool = Math.sqrt((sd(FIN.map((f) => f.pl)) ** 2 + sd(RESTO.map((f) => f.pl)) ** 2) / 2);
const nNec = Math.ceil(2 * ((LISTON + 0.84) ** 2) * (sPool ** 2) / (dif ** 2));
console.log(`     diferencia ${eur(dif)}/día · t=${t.toFixed(2)} contra un listón de ${LISTON} → NO PASA`);
console.log(`     para ver esta diferencia con potencia 80% al listón de Bonferroni harían falta ${nNec} fines de mes`);
console.log(`     por grupo. A 12 al año son ${(nNec / 12).toFixed(0)} AÑOS de datos. Tenemos ${(FIN.length / 12).toFixed(1)}.`);
const pot = potencia(fh, dif / 1000);
console.log(`\n     ${pot.mensaje}`);

writeFileSync("scripts/anatomia3-veredicto.json", JSON.stringify({
  BASE, finMes: { n: FIN.length, media: media(FIN.map((f) => f.pl)), t, dif, nNec,
    dias: finOrd.map((f) => ({ fecha: f.fecha, pl: f.pl, zTardePts: f.zTardePts, zCierrePts: f.zCierrePts })) },
  mecanismo: { cierrePtsFin: media(fc), cierrePtsResto: media(rc), tCierrePts: tWelch(fc, rc),
    cierreSigFin: media(fcs), cierreSigResto: media(rcs), tCierreSig: tWelch(fcs, rcs) },
  controles: { vispera: { n: VIS.length, media: media(VIS.map((f) => f.pl)) }, primero: { n: PRI.length, media: media(PRI.map((f) => f.pl)) } },
  tamano: salida,
}, null, 2), "utf8");
console.log("\n  detalle en scripts/anatomia3-veredicto.json");
