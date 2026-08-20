// ANATOMÍA 3 · ESTRUCTURA 3 — LOS LÍMITES DE COMPRAR LA COLA
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/anatomia3-comprar-cola-limites.mjs
// (lee la caché scripts/anatomia3-cola-filas.json que deja anatomia3-comprar-cola.mjs)
//
// El barrido de 24 variantes salió negativo: ninguna reduce la peor racha por menos de lo que
// cuesta bajar el tamaño. Pero "no pasó" no es un informe. Aquí se contesta QUÉ LE FALTARÍA:
//
//   E1. ¿DE DÓNDE SALE EL PAGO? — cuántos días lo aportan. Si el seguro cobra en UN día, no es
//       un seguro: es un billete de lotería que tocó una vez.
//   E2. EL TECHO — la misma estructura con el seguro REGALADO (coste cero, pago real). Es el
//       máximo que esta idea puede dar aunque la prima fuese gratis. Si ni gratis corta la
//       racha, el problema NO es el precio y no hay nada que negociar.
//   E3. EL PRECIO DE EQUILIBRIO — cuánto tendría que costar la pata para batir al listón de
//       tamaño ($1,232/año perdido por $1 de caída quitada), y cuánto cuesta de verdad.
//   E4. POR QUÉ AHONDA LA RACHA — el coste diario contra la longitud de la peor racha.
//
// PRUEBAS: las 24 declaradas en anatomia3-comprar-cola.mjs + 10 contrafácticos de aquí = 34.
// Los contrafácticos NO son estrategias operables (E2 usa precio cero); se declaran igual.

import { readFileSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { drawdown, media, pct, eur } from "./anatomia3-lib.mjs";

const CACHE = "scripts/anatomia3-cola-filas.json";
const COMM = 0.03, DIST = [75, 100, 150, 200];
const PRUEBAS = 34, LISTON = listonT(PRUEBAS), LISTON_PROY = listonT(214);

const FILAS = JSON.parse(readFileSync(CACHE, "utf8")).filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const ANOS = FILAS.length / 251;
const PL0 = FILAS.map((f) => f.pl);
const DD0 = drawdown(PL0), PEOR0 = Math.min(...PL0), ALANO0 = PL0.reduce((a, b) => a + b, 0) / ANOS;
const LISTON_TAMANO = ALANO0 / -DD0;
const pcts = (x) => (x * 100).toFixed(1) + "%";
const cvar = (pl, q = 0.05) => { const p = [...pl].sort((a, b) => a - b); return media(p.slice(0, Math.max(1, Math.floor(p.length * q)))); };

const pagoPut = (f, D) => Math.max(f[`KpT${D}`] - f.cierre, 0) * 100;
const pagoCall = (f, D) => Math.max(f.cierre - f[`KcT${D}`], 0) * 100;
const costePut = (f, D) => f[`askP${D}`] * 100 + COMM;
const costeCall = (f, D) => f[`askC${D}`] * 100 + COMM;

const LADOS = [["put", pagoPut, costePut], ["call", pagoCall, costeCall]];

console.log("═".repeat(104));
console.log(`  LÍMITES DE LA ESTRUCTURA 3 · ${FILAS.length} días · ${ANOS.toFixed(2)} años`);
console.log(`  base ${eur(ALANO0)}/año · peor día ${eur(PEOR0)} · peor racha ${eur(DD0)} · listón de tamaño $${LISTON_TAMANO.toFixed(3)}/$dd`);
console.log(`  listón |t| ${LISTON} (${PRUEBAS} pruebas de la familia) · ${LISTON_PROY} (214 del proyecto)`);
console.log("═".repeat(104));

// ══════════════════════════════════════════════════════════════════════════════════════════════
// E1 · ¿DE DÓNDE SALE EL PAGO?
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(104));
console.log("  E1 · ¿EN CUÁNTOS DÍAS COBRA EL SEGURO? — si cobra en uno, es lotería, no seguro");
console.log("═".repeat(104));
console.log("| pata | días que cobran | pago total | el mejor día | top 1 | top 3 | coste total | sin el mejor día |");
console.log("|---|---|---|---|---|---|---|---|");
const E1 = [];
for (const [lado, pago, coste] of LADOS) for (const D of DIST) {
  const pagos = FILAS.map((f) => pago(f, D));
  const costes = FILAS.map((f) => coste(f, D));
  const tot = pagos.reduce((a, b) => a + b, 0), cst = costes.reduce((a, b) => a + b, 0);
  const orden = pagos.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
  const dias = pagos.filter((p) => p > 0).length;
  const top1 = orden[0].p, top3 = orden.slice(0, 3).reduce((a, x) => a + x.p, 0);
  const fechaTop = FILAS[orden[0].i].fecha;
  const sinTop = tot - top1 - cst + costes[orden[0].i];
  const r = { pata: `${lado}@${D}`, dias, tot, cst, top1, fechaTop, cuotaTop1: tot > 0 ? top1 / tot : 0,
              cuotaTop3: tot > 0 ? top3 / tot : 0, netoSinTop: sinTop };
  E1.push(r);
  console.log(`| ${r.pata} | ${dias} de ${FILAS.length} | ${eur(tot)} | ${eur(top1)} (${fechaTop}) | ${pcts(r.cuotaTop1)} | ${pcts(r.cuotaTop3)} | ${eur(cst)} | ${eur(sinTop)} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// E2 · EL TECHO — el seguro REGALADO (pago real, prima cero). Contrafáctico, no operable.
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(104));
console.log("  E2 · EL TECHO: la MISMA pata pero REGALADA (prima $0). Contrafáctico — NO es operable.");
console.log("       Si ni gratis corta la racha, el problema no es el precio.");
console.log("═".repeat(104));
console.log("| pata gratis | peor día | quita | peor racha | quita | CVaR5 | quita |");
console.log("|---|---|---|---|---|---|---|");
const E2 = [];
for (const [lado, pago] of LADOS) for (const D of DIST) {
  const pl = FILAS.map((f, i) => PL0[i] + pago(f, D));
  const peor = Math.min(...pl), dd = drawdown(pl), cv = cvar(pl);
  E2.push({ pata: `${lado}@${D}`, peor, peorElim: peor - PEOR0, dd, ddElim: dd - DD0, cvar5: cv, cvarElim: cv - cvar(PL0) });
  console.log(`| ${lado}@${D} | ${eur(peor)} | ${eur(peor - PEOR0)} | ${eur(dd)} | ${eur(dd - DD0)} | ${eur(cv)} | ${eur(cv - cvar(PL0))} |`);
}
// las dos a la vez, gratis
{
  const pl = FILAS.map((f, i) => PL0[i] + pagoPut(f, 75) + pagoCall(f, 75));
  console.log(`| put+call@75 gratis | ${eur(Math.min(...pl))} | ${eur(Math.min(...pl) - PEOR0)} | ${eur(drawdown(pl))} | ${eur(drawdown(pl) - DD0)} | ${eur(cvar(pl))} | ${eur(cvar(pl) - cvar(PL0))} |`);
  E2.push({ pata: "put+call@75 gratis", peor: Math.min(...pl), peorElim: Math.min(...pl) - PEOR0, dd: drawdown(pl), ddElim: drawdown(pl) - DD0, cvar5: cvar(pl), cvarElim: cvar(pl) - cvar(PL0) });
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// E3 · EL PRECIO DE EQUILIBRIO
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Con la pata a un precio FIJO de p dólares por contrato, el ingreso anual baja en
//   (pago_total − p·100·n_días)/años ... y la racha cambia. Se busca el p que deja el coste por
// dólar de caída justo en el listón de tamaño. Se hace por barrido de p, no analítico: la racha
// no es lineal en p.
console.log("\n" + "═".repeat(104));
console.log("  E3 · ¿A QUÉ PRECIO SALDRÍA A CUENTA? — se fija el precio de la pata y se busca el que empata");
console.log("       con bajar el tamaño. 'precio real' = mediana del ASK que hay en el fichero.");
console.log("═".repeat(104));
console.log("| pata | precio real (mediana) | precio de equilibrio | ¿existe? | descuento necesario |");
console.log("|---|---|---|---|---|");
const E3 = [];
for (const [lado, pago] of LADOS) for (const D of DIST) {
  const askReal = pct(FILAS.map((f) => (lado === "put" ? f[`askP${D}`] : f[`askC${D}`])), 0.5);
  let equilibrio = null;
  for (let p = 0; p <= 2.0001; p += 0.01) {
    const pl = FILAS.map((f, i) => PL0[i] + pago(f, D) - p * 100 - COMM);
    const dd = drawdown(pl), ddElim = dd - DD0;
    const perdido = ALANO0 - pl.reduce((a, b) => a + b, 0) / ANOS;
    if (ddElim <= 0) { equilibrio = p > 0 ? Math.round((p - 0.01) * 100) / 100 : null; break; }
    const coste = perdido / ddElim;
    if (coste > LISTON_TAMANO) { equilibrio = Math.round((p - 0.01) * 100) / 100; break; }
  }
  const existe = equilibrio != null && equilibrio >= 0.05;      // 0,05 es el tick mínimo del SPX
  E3.push({ pata: `${lado}@${D}`, askReal, equilibrio, existe, descuento: equilibrio != null && askReal > 0 ? 1 - equilibrio / askReal : null });
  console.log(`| ${lado}@${D} | $${askReal.toFixed(2)} | ${equilibrio == null ? "ninguno ≤ $2,00" : "$" + equilibrio.toFixed(2)} | ${existe ? "SÍ (≥ tick $0,05)" : "NO — por debajo del tick mínimo"} | ${equilibrio != null && askReal > 0 ? pcts(1 - equilibrio / askReal) : "—"} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// E4 · POR QUÉ AHONDA LA RACHA
// ══════════════════════════════════════════════════════════════════════════════════════════════
function tramoDD(pl) {
  let acc = 0, pico = 0, iPico = 0, peor = 0, ini = 0, fin = 0;
  for (let i = 0; i < pl.length; i++) {
    acc += pl[i];
    if (acc > pico) { pico = acc; iPico = i; }
    if (acc - pico < peor) { peor = acc - pico; ini = iPico; fin = i; }
  }
  return { peor, ini, fin, dias: fin - ini };
}
const T0 = tramoDD(PL0);
console.log("\n" + "═".repeat(104));
console.log("  E4 · POR QUÉ EL SEGURO AHONDA LA RACHA EN VEZ DE CORTARLA");
console.log("═".repeat(104));
console.log(`  La peor racha del cóndor va de ${FILAS[T0.ini].fecha} a ${FILAS[T0.fin].fecha}: ${T0.dias} días de mercado, ${eur(T0.peor)}.`);
console.log(`  Dentro de esos ${T0.dias} días, el seguro se paga ${T0.dias} veces y sólo puede cobrar los días de desplome.\n`);
console.log("| pata | coste diario | coste dentro de la racha | pago dentro de la racha | neto dentro | días que cobró dentro |");
console.log("|---|---|---|---|---|---|");
const E4 = [];
for (const [lado, pago, coste] of LADOS) for (const D of DIST) {
  const dentro = FILAS.slice(T0.ini + 1, T0.fin + 1);
  const c = dentro.reduce((a, f) => a + coste(f, D), 0);
  const p = dentro.reduce((a, f) => a + pago(f, D), 0);
  const nCobra = dentro.filter((f) => pago(f, D) > 0).length;
  const diario = media(FILAS.map((f) => coste(f, D)));
  E4.push({ pata: `${lado}@${D}`, costeDiario: diario, costeDentro: c, pagoDentro: p, netoDentro: p - c, nCobra });
  console.log(`| ${lado}@${D} | ${eur(diario)}/día | ${eur(c)} | ${eur(p)} | ${eur(p - c)} | ${nCobra} de ${dentro.length} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// E5 · ¿CUÁNTO CUESTA LA PATA EL DÍA QUE SIRVE? — la prima no es plana
// ══════════════════════════════════════════════════════════════════════════════════════════════
// El precio de equilibrio de E3 es un precio FIJO, y eso no existe. El ask de la cola vale $0,05
// el día tranquilo y $36 el día del susto. Si la prima sube justo cuando el seguro va a cobrar,
// el seguro no protege: cobra el susto por adelantado.
console.log("\n" + "═".repeat(104));
console.log("  E5 · LA PRIMA NO ES PLANA — qué cuesta la pata el día que cobra y el día que no");
console.log("═".repeat(104));
console.log("| pata | ask medio los días que COBRA | ask medio los días que NO | veces más cara | ask medio global |");
console.log("|---|---|---|---|---|");
const E5 = [];
for (const [lado, pago, coste] of LADOS) for (const D of DIST) {
  const cobra = FILAS.filter((f) => pago(f, D) > 0), no = FILAS.filter((f) => pago(f, D) === 0);
  const aC = media(cobra.map((f) => coste(f, D))), aN = media(no.map((f) => coste(f, D)));
  const aG = media(FILAS.map((f) => coste(f, D)));
  E5.push({ pata: `${lado}@${D}`, nCobra: cobra.length, askCobra: aC, askNo: aN, ratio: aN > 0 ? aC / aN : null, askGlobal: aG });
  console.log(`| ${lado}@${D} | ${eur(aC)} | ${eur(aN)} | ${aN > 0 ? (aC / aN).toFixed(1) + "×" : "—"} | ${eur(aG)} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// E6 · JACKKNIFE — quitar la semana que lo decide todo
// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2025-04-08 (−211 pts) y 2025-04-09 (+504 pts, la pausa arancelaria) aportan la mayor parte de
// todo lo que cobra la cola. Sin esa semana, ¿queda algo? Esto no es "quitar lo que molesta": es
// medir de cuántos eventos depende el resultado. Si depende de uno, no se puede planificar.
const SEMANA = new Set(["2025-04-07", "2025-04-08", "2025-04-09", "2025-04-10", "2025-04-11"]);
const idxFuera = FILAS.map((f, i) => (SEMANA.has(f.fecha) ? i : -1)).filter((i) => i >= 0);
console.log("\n" + "═".repeat(104));
console.log(`  E6 · SIN LA SEMANA DEL 7 AL 11 DE ABRIL DE 2025 (${idxFuera.length} días de ${FILAS.length})`);
console.log("═".repeat(104));
const FIL2 = FILAS.filter((f) => !SEMANA.has(f.fecha));
const PL2 = FIL2.map((f) => f.pl);
const ANOS2 = FIL2.length / 251;
const ALANO2 = PL2.reduce((a, b) => a + b, 0) / ANOS2, DD2 = drawdown(PL2), PEOR2 = Math.min(...PL2);
console.log(`  base sin esa semana: ${eur(ALANO2)}/año · peor día ${eur(PEOR2)} · peor racha ${eur(DD2)}`);
console.log("| pata | $/año con seguro | quita del ingreso | peor día | peor racha | pago total | días que cobran |");
console.log("|---|---|---|---|---|---|---|");
const E6 = [];
for (const [lado, pago, coste] of LADOS) for (const D of DIST) {
  const pl = FIL2.map((f, i) => PL2[i] + pago(f, D) - coste(f, D));
  const alAno = pl.reduce((a, b) => a + b, 0) / ANOS2;
  const r = { pata: `${lado}@${D}`, alAno, perdido: ALANO2 - alAno, peor: Math.min(...pl), dd: drawdown(pl),
              pago: FIL2.reduce((a, f) => a + pago(f, D), 0), nCobra: FIL2.filter((f) => pago(f, D) > 0).length };
  E6.push(r);
  console.log(`| ${lado}@${D} | ${eur(alAno)} | ${eur(ALANO2 - alAno)} | ${eur(r.peor)} | ${eur(r.dd)} | ${eur(r.pago)} | ${r.nCobra} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// VEREDICTO
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(104));
console.log("  QUÉ LE FALTARÍA A LA ESTRUCTURA 3 PARA SERVIR");
console.log("═".repeat(104));
const techoPut = E2.filter((x) => x.pata.startsWith("put@")).sort((a, b) => b.ddElim - a.ddElim)[0];
const techoCall = E2.filter((x) => x.pata.startsWith("call@")).sort((a, b) => b.ddElim - a.ddElim)[0];
console.log(`  · Techo del lado PUT  (gratis): la racha pasa de ${eur(DD0)} a ${eur(techoPut.dd)} — como mucho quita ${eur(techoPut.ddElim)} (${pcts(techoPut.ddElim / -DD0)}).`);
console.log(`  · Techo del lado CALL (gratis): la racha pasa de ${eur(DD0)} a ${eur(techoCall.dd)} — como mucho quita ${eur(techoCall.ddElim)} (${pcts(techoCall.ddElim / -DD0)}).`);
const conEq = E3.filter((x) => x.existe);
console.log(`  · Patas con precio de equilibrio por encima del tick mínimo ($0,05): ${conEq.length} de ${E3.length}` + (conEq.length ? " → " + conEq.map((x) => `${x.pata} a $${x.equilibrio.toFixed(2)} (hoy $${x.askReal.toFixed(2)})`).join(", ") : ""));

writeFileSync("scripts/anatomia3-comprar-cola-limites.json", JSON.stringify({
  base: { alAno: ALANO0, peor: PEOR0, dd: DD0, cvar5: cvar(PL0), listonTamano: LISTON_TAMANO },
  tramoRacha: { desde: FILAS[T0.ini].fecha, hasta: FILAS[T0.fin].fecha, dias: T0.dias, peor: T0.peor },
  E1, E2, E3, E4, E5, E6, LISTON, LISTON_PROY,
}, null, 1));
console.log("\n  → scripts/anatomia3-comprar-cola-limites.json");
