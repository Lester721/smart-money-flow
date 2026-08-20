// ═══ ESTRUCTURA 3 · FASE D — LO QUE LE FALTA A LA COLA PARA SERVIR ════════════════════════════
//
// Las pruebas 1–21 dicen que comprar cola MÁS ALLÁ del ala no puede cortar el peor día. El
// mecanismo es geométrico, no estadístico: pasando del ala la pérdida ya está topada, y los días
// que topan se apelotonan JUSTO detrás del ala (−76, −76, −86, −86, −98 puntos). Una pata a −100
// expira en cero en todos ellos.
//
// Conclusión que se deduce del mecanismo: la única pata que puede tocar el tope es una que esté
// DENTRO del ala, no fuera. Pruebas 22–24, declaradas en la lista original como reserva:
//   22 · ESCALERA DE PUTS — vender en −25, comprar en −55 Y en −75 (el ala de siempre)
//   23 · la misma escalera con el segundo largo en −45
//   24 · escalera de puts + cola de call a +150 (el lado que no duele, por si suma)
//
// Precios reales: BID al vender, ASK al comprar, en las tres/cuatro patas. Comisión por pata.

import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
const filas = JSON.parse(readFileSync("scripts/cola-filas.json", "utf8"));
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const AÑOS = filas.length / 252, COMM = 0.03;

function met(pls) {
  let acum = 0, pico = 0, dd = 0;
  for (const p of pls) { acum += p; pico = Math.max(pico, acum); dd = Math.min(dd, acum - pico); }
  return { año: pls.reduce((a, b) => a + b, 0) / AÑOS, peor: Math.min(...pls), p1: pctl(pls, 0.01),
    p5: pctl(pls, 0.05), dd, acierto: pls.filter((x) => x > 0).length / pls.length, pls };
}
const BASE = met(filas.map((f) => f.pl));

/** Cóndor de siempre + una put larga extra DENTRO del ala (escalera). `w` = ancho de esa pata. */
function escalera(w, colaCall = null) {
  const pls = [], costes = [];
  for (const f of filas) {
    const extra = f.alas["a" + w];
    if (!extra) return null;                       // sin precio real no se inventa
    const K2 = extra.pK, ask2 = extra.pAsk;
    if (!(K2 < f.pCK && K2 > f.pLK)) return null;  // tiene que quedar DENTRO del ala
    let coste = ask2 * 100 + COMM, pago = Math.max(K2 - f.cierre, 0) * 100;
    if (colaCall) { const c = f.cola["c" + colaCall]; coste += c.ask * 100 + COMM; pago += Math.max(f.cierre - c.K, 0) * 100; }
    pls.push(f.pl + pago - coste);
    costes.push(coste);
  }
  const m = met(pls);
  return { ...m, costeAño: costes.reduce((a, b) => a + b, 0) / AÑOS };
}

const canje = (m, campo) => {
  const cortado = Math.abs(BASE[campo]) - Math.abs(m[campo]);
  const perdido = BASE.año - m.año;
  return cortado > 0 ? (perdido / cortado) : null;
};
const linea = (nom, m) => "| " + nom + " | " + eur(m.año) + " | " + ((m.año / BASE.año - 1) * 100).toFixed(0) + "% | " + eur(m.peor)
  + " | " + eur(m.p1) + " | " + eur(m.p5) + " | " + eur(m.dd) + " | " + (m.acierto * 100).toFixed(0) + "% | "
  + (canje(m, "peor") != null ? "$" + canje(m, "peor").toFixed(2) : "no corta") + " | "
  + (canje(m, "dd") != null ? "$" + canje(m, "dd").toFixed(2) : "no corta") + " |";

console.log("═".repeat(126));
console.log("  22–24 · LA PATA VA DENTRO DEL ALA, NO FUERA · listón |t| = " + listonT(24) + " (24 pruebas)");
console.log("═".repeat(126) + "\n");
console.log("| estructura | $/año | vs base | peor día | p1 | p5 | caída máx | acierto | $/año por $1 de peor día | $/año por $1 de caída |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
console.log(linea("**cóndor solo (partida)**", BASE));
const E = {};
for (const w of [40, 30, 20]) {
  const m = escalera(w); if (!m) { console.log("| escalera con largo a −" + (25 + w) + " | sin precio real algún día — NO se mide |"); continue; }
  E[w] = m;
  console.log(linea("escalera: largo extra a −" + (25 + w) + " pts", m));
}
const mix = escalera(30, 150);
if (mix) console.log(linea("escalera −55 + cola de call +150", mix));

console.log("\n## coste anual de la pata extra y estabilidad del recorte por tercios\n");
console.log("| estructura | coste/año de la pata | T1 peor día | T2 peor día | T3 peor día | ¿corta en los TRES? |");
console.log("|---|---|---|---|---|---|");
const k = Math.floor(filas.length / 3), rango = [[0, k], [k, 2 * k], [2 * k, filas.length]];
const baseT = rango.map(([a, b]) => Math.min(...BASE.pls.slice(a, b)));
console.log("| **cóndor solo** | — | " + baseT.map(eur).join(" | ") + " | — |");
for (const w of [40, 30, 20]) {
  const m = E[w]; if (!m) continue;
  const t = rango.map(([a, b]) => Math.min(...m.pls.slice(a, b)));
  const ok = t.every((x, i) => Math.abs(x) < Math.abs(baseT[i]));
  console.log("| largo a −" + (25 + w) + " | " + eur(-m.costeAño) + " | " + t.map(eur).join(" | ") + " | " + (ok ? "SÍ ✅" : "no") + " |");
}

// ── ¿qué pasa el día que más duele? ──
console.log("\n## los 8 peores días del cóndor, con la escalera de −55 encima\n");
console.log("| fecha | mueve | cóndor solo | escalera −55 | diferencia |");
console.log("|---|---|---|---|---|");
const idx = filas.map((f, i) => i).sort((a, b) => filas[a].pl - filas[b].pl).slice(0, 8);
for (const i of idx) {
  const f = filas[i];
  console.log("| " + f.fecha + " | " + (f.cierre - f.sp11).toFixed(0) + " pts | " + eur(f.pl) + " | " + eur(E[30].pls[i]) + " | " + eur(E[30].pls[i] - f.pl) + " |");
}

// ── comparación a IGUAL peor día: ¿escalera o simplemente menos tamaño? ──
console.log("\n## A IGUAL PEOR DÍA — ¿la escalera bate a bajar el tamaño?\n");
console.log("| estructura | escala para igualar el peor día de la escalera | $/año escalado | caída máx escalada |");
console.log("|---|---|---|---|");
const obj = Math.abs(E[30].peor);
console.log("| escalera −55 (1 contrato) | 1,00× | " + eur(E[30].año) + " | " + eur(E[30].dd) + " |");
const esc = obj / Math.abs(BASE.peor);
console.log("| cóndor de siempre, tamaño reducido | " + esc.toFixed(2) + "× | " + eur(BASE.año * esc) + " | " + eur(BASE.dd * esc) + " |");
