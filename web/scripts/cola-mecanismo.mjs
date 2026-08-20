// ═══ ESTRUCTURA 3 · FASE C — POR QUÉ NO CORTA, y de qué está hecho lo que sí parece cortar ═════
//
// Dos cosas que hay que mirar a la cara antes de contar nada:
//   1. La cola de CALL sale ganando un 55%/año. Un +55% que aparece de comprar seguro es
//      exactamente el resultado que hay que auditar, no celebrar. ¿De cuántos días vive?
//   2. Ninguna cola corta el PEOR DÍA. Hay que enseñar el mecanismo, no la correlación.

import { readFileSync, existsSync } from "node:fs";
const filas = JSON.parse(readFileSync("scripts/cola-filas.json", "utf8"));
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const AÑOS = filas.length / 252, COMM = 0.03;
const pagoPut = (K, S) => Math.max(K - S, 0) * 100;
const pagoCall = (K, S) => Math.max(S - K, 0) * 100;

console.log("═".repeat(112));
console.log("  A · ¿DE CUÁNTOS DÍAS VIVE CADA COLA? (neto = pago − ASK pagado)");
console.log("═".repeat(112));
for (const [lado, d] of [["c", 100], ["c", 150], ["c", 200], ["p", 100], ["p", 150]]) {
  const netos = filas.map((f) => {
    const o = f.cola[lado + d];
    const pago = lado === "p" ? pagoPut(o.K, f.cierre) : pagoCall(o.K, f.cierre);
    return { fecha: f.fecha, neto: pago - o.ask * 100 - COMM, pago, mov: f.cierre - f.sp11, plCondor: f.pl };
  });
  const total = netos.reduce((a, x) => a + x.neto, 0);
  const top = [...netos].sort((a, b) => b.neto - a.neto).slice(0, 3);
  const sinTop1 = total - top[0].neto;
  console.log("\n  " + (lado === "p" ? "PUT −" : "CALL +") + d + "  neto total " + eur(total) + " (" + eur(total / AÑOS) + "/año)");
  for (const t of top) console.log("     " + t.fecha + "  mueve " + t.mov.toFixed(0).padStart(5) + " pts  cóndor " + eur(t.plCondor).padStart(8) + "  la pata paga " + eur(t.neto));
  console.log("     SIN el día número 1: " + eur(sinTop1) + " (" + eur(sinTop1 / AÑOS) + "/año) · pagan algo " + netos.filter((x) => x.pago > 0).length + " días de " + filas.length);
}

console.log("\n" + "═".repeat(112));
console.log("  B · EL MECANISMO — el peor día NO es un día de desastre");
console.log("═".repeat(112));
const mov = filas.map((f) => Math.abs(f.cierre - f.sp11)).sort((a, b) => a - b);
const q = (p) => mov[Math.floor(mov.length * p)];
console.log("\n  cuánto se mueve el SPX de las 11:00 al cierre (valor absoluto, en puntos):");
console.log("    p50 " + q(0.5).toFixed(0) + " · p75 " + q(0.75).toFixed(0) + " · p90 " + q(0.9).toFixed(0) + " · p95 " + q(0.95).toFixed(0) + " · p99 " + q(0.99).toFixed(0) + " · máx " + q(0.999).toFixed(0));
for (const u of [25, 75, 100, 150, 200]) {
  const n = filas.filter((f) => Math.abs(f.cierre - f.sp11) > u).length;
  console.log("    pasa de " + String(u).padStart(3) + " puntos: " + String(n).padStart(3) + " días (" + ((n / filas.length) * 100).toFixed(1) + "%)");
}
const tope = filas.filter((f) => Math.abs(f.cierre - f.sp11) >= 75);
console.log("\n  Días en los que el cóndor pierde el MÁXIMO (el precio pasa del ala, a 75 puntos): " + tope.length);
console.log("  Su P&L medio: " + eur(tope.reduce((a, f) => a + f.pl, 0) / tope.length) + " · el peor de todos: " + eur(Math.min(...tope.map((f) => f.pl))));
console.log("  Y AQUÍ ESTÁ LA CLAVE: pasando de 75 puntos la pérdida YA ESTÁ TOPADA. Moverse 80 puntos y");
console.log("  moverse 500 cuestan lo mismo. Una pata comprada MÁS ALLÁ del ala no puede tocar ese tope.");

// El día que se queda justo detrás del ala: contra ése no hay seguro exterior que valga
console.log("\n  los 8 peores días, ordenados por lo POCO que se movieron:");
console.log("  | fecha | mueve (pts) | P&L cóndor | ¿paga la put −100? | ¿paga doblar el ala (−75)? |");
console.log("  |---|---|---|---|---|");
for (const f of [...filas].sort((a, b) => a.pl - b.pl).slice(0, 8).sort((a, b) => Math.abs(a.cierre - a.sp11) - Math.abs(b.cierre - b.sp11))) {
  console.log("  | " + f.fecha + " | " + (f.cierre - f.sp11).toFixed(0) + " | " + eur(f.pl) + " | " + eur(pagoPut(f.cola.p100.K, f.cierre)) + " | " + eur(pagoPut(f.pLK, f.cierre)) + " |");
}

console.log("\n" + "═".repeat(112));
console.log("  C · CON CADA COLA, ¿CUÁL PASA A SER EL PEOR DÍA Y CUÁNTO SE MOVIÓ?");
console.log("═".repeat(112));
console.log("\n  | estructura | peor día | fecha | se movió | por qué la cola no lo salva |");
console.log("  |---|---|---|---|---|");
const variantes = [["cóndor solo", null, null], ["put −75 (doblar ala)", "p", 75], ["put −100", "p", 100], ["put −150", "p", 150], ["put −200", "p", 200]];
for (const [nom, lado, d] of variantes) {
  const pls = filas.map((f) => {
    if (!lado) return f.pl;
    const o = f.cola[lado + d];
    return f.pl + pagoPut(o.K, f.cierre) - o.ask * 100 - COMM;
  });
  let iMin = 0; for (let i = 1; i < pls.length; i++) if (pls[i] < pls[iMin]) iMin = i;
  const f = filas[iMin], m = f.cierre - f.sp11;
  const razon = !lado ? "—" : (Math.abs(m) < d ? "el precio se quedó a " + Math.abs(m).toFixed(0) + " pts, dentro de los " + d + " de la pata: expira en cero"
    : "paga " + eur(pagoPut(f.cola[lado + d].K, f.cierre)) + " pero no llega");
  console.log("  | " + nom + " | " + eur(pls[iMin]) + " | " + f.fecha + " | " + m.toFixed(0) + " pts | " + razon + " |");
}

console.log("\n" + "═".repeat(112));
console.log("  D · DE QUÉ ESTÁ HECHA LA PEOR RACHA (−$15.176)");
console.log("═".repeat(112));
let acum = 0, pico = 0, dd = 0, iPico = 0, iValle = 0, iPicoAct = 0;
for (let i = 0; i < filas.length; i++) {
  acum += filas[i].pl;
  if (acum > pico) { pico = acum; iPicoAct = i; }
  if (acum - pico < dd) { dd = acum - pico; iPico = iPicoAct; iValle = i; }
}
const tramo = filas.slice(iPico + 1, iValle + 1);
const topes = tramo.filter((f) => Math.abs(f.cierre - f.sp11) >= 75);
console.log("\n  del " + filas[iPico].fecha + " al " + filas[iValle].fecha + " · " + tramo.length + " sesiones · " + eur(dd));
console.log("  días de pérdida máxima dentro del tramo: " + topes.length + " (" + topes.map((f) => f.fecha + " " + (f.cierre - f.sp11).toFixed(0) + "pts").join(", ") + ")");
console.log("  suman " + eur(topes.reduce((a, f) => a + f.pl, 0)) + " de los " + eur(dd) + " · el resto (" + (tramo.length - topes.length) + " días) aporta " + eur(tramo.filter((f) => Math.abs(f.cierre - f.sp11) < 75).reduce((a, f) => a + f.pl, 0)));
for (const d of [100, 150, 200]) {
  const pagos = tramo.reduce((a, f) => a + pagoPut(f.cola["p" + d].K, f.cierre) - f.cola["p" + d].ask * 100 - COMM, 0);
  console.log("    una put −" + d + " comprada todos esos días habría hecho el tramo " + (pagos >= 0 ? "MEJOR" : "PEOR") + " en " + eur(pagos));
}

console.log("\n" + "═".repeat(112));
console.log("  E · NORMALIZANDO POR COLATERAL — estrechar el ala, ¿es protección o es tamaño?");
console.log("═".repeat(112));
console.log("\n  | ala | $/año | colateral mediano | $/año por $1.000 de colateral | peor día por $1.000 de colateral |");
console.log("  |---|---|---|---|---|");
for (const w of [50, 40, 30, 20]) {
  const pls = [], cols = [];
  for (const f of filas) {
    let cK, cAsk, pK, pAsk;
    if (w === 50) { cK = f.cLK; cAsk = f.cLask; pK = f.pLK; pAsk = f.pLask; }
    else { const a = f.alas["a" + w]; if (!a) continue; cK = a.cK; cAsk = a.cAsk; pK = a.pK; pAsk = a.pAsk; }
    const cred = f.cCbid + f.pCbid - cAsk - pAsk;
    if (!(cred > 0)) { pls.push(-8 * COMM); continue; }
    pls.push((cred - Math.min(Math.max(f.cierre - f.cCK, 0), cK - f.cCK) - Math.min(Math.max(f.pCK - f.cierre, 0), f.pCK - pK)) * 100 - 8 * COMM);
    cols.push((Math.max(cK - f.cCK, f.pCK - pK) - cred) * 100);
  }
  const total = pls.reduce((a, b) => a + b, 0), col = cols.sort((a, b) => a - b)[cols.length >> 1];
  console.log("  | " + w + " | " + eur(total / AÑOS) + " | " + eur(col) + " | " + eur((total / AÑOS) / (col / 1000)) + " | " + eur(Math.min(...pls) / (col / 1000)) + " |");
}
