// COSTE-REAL - cuanto margen de seguridad tiene DE VERDAD el unico tamano que sobrevive.
import { readFileSync } from "node:fs";
const F = JSON.parse(readFileSync("scripts/coste-real-base.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const EFECTIVO0 = 7977, PC0 = 73874, HOOD = 48412, TASA = 0.05;
const eur = (x) => (x == null || !isFinite(x) ? "-" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };

function sim(filas, N, W, { mant = 0.30, hood = HOOD, escala = 1 } = {}) {
  let ef = EFECTIVO0, int = 0, maxPrest = 0, llamada = null, acum = 0;
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i], a = f.porAncho[W]; if (!a) continue;
    if (i > 0 && ef < 0) { const d = dias(filas[i - 1].fecha, f.fecha); const c = (-ef) * TASA / 360 * d; int += c; ef -= c; }
    if (ef < 0) maxPrest = Math.max(maxPrest, -ef);
    if (ef < hood * (mant - 1)) { llamada ??= f.fecha; break; }
    const pl = N * (a.pl < 0 ? a.pl * escala : a.pl); ef += pl; acum += pl;
    if (ef < 0) maxPrest = Math.max(maxPrest, -ef);
  }
  return { maxPrest, llamada, neto: acum - int, interes: int };
}

console.log("=== CUANTO MARGEN DE SEGURIDAD TIENE EL 'SOBREVIVE CON 1 CONTRATO' ===");
const base = sim(F, 1, 50);
console.log(`prestamo maximo alcanzado: ${eur(base.maxPrest)}  -  linea de llamada al 30%: ${eur(HOOD * 0.7 * -1 + 0)} de patrimonio, es decir efectivo por debajo de ${eur(HOOD * (0.30 - 1))}`);
console.log(`HOLGURA REAL: ${eur(HOOD * (1 - 0.30) - base.maxPrest)}  (${((1 - base.maxPrest / (HOOD * 0.7)) * 100).toFixed(1)}% del colchon)\n`);

console.log("| las perdidas de todos los dias multiplicadas por | prestamo maximo | LLAMADA |");
console.log("|---|---|---|");
for (const e of [1.00, 1.02, 1.05, 1.10, 1.20]) {
  const r = sim(F, 1, 50, { escala: e });
  console.log(`| x${e.toFixed(2)} | ${eur(r.maxPrest)} | ${r.llamada ? "**" + r.llamada + "**" : "no"} |`);
}
console.log("\n| si HOOD (hoy $96,82) cotizara a | valor de las 500 acciones | LLAMADA con 1 contrato |");
console.log("|---|---|---|");
for (const p of [96.82, 85, 75, 65, 55, 45]) {
  const r = sim(F, 1, 50, { hood: p * 500 });
  console.log(`| $${p} | ${eur(p * 500)} | ${r.llamada ? "**" + r.llamada + "**" : "no"} |`);
}

// cuanto EFECTIVO haria falta para que 1 contrato fuese comodo
const pl = F.map((f) => f.porAncho[50].pl);
let a = 0, p = 0, w = 0; for (const x of pl) { a += x; if (a > p) p = a; w = Math.min(w, a - p); }
console.log(`\n=== CUANTO EFECTIVO PIDE ESTO DE VERDAD ===`);
console.log(`peor racha con 1 contrato: ${eur(w)}   -   efectivo de Lester: ${eur(EFECTIVO0)}   -   le falta ${eur(-w - EFECTIVO0)}`);
console.log(`el contrato mas pequeno que existe en SPX ya arriesga ${eur(5000)} en un dia, el 63% de todo su efectivo.`);
console.log(`para que la peor racha fuese la mitad de su efectivo haria falta operar ${(EFECTIVO0 / 2 / -w).toFixed(2)} contratos - y no existe la fraccion.`);

// distribucion del prestamo maximo segun cuando arranques
const prestamos = [];
for (let i = 0; i + 252 <= F.length; i++) prestamos.push(sim(F.slice(i, i + 252), 1, 50).maxPrest);
console.log(`\nprestamo maximo en un ano, segun el dia en que arranque (870 arranques):`);
console.log(`  p50 ${eur(pctl(prestamos, 0.5))} - p75 ${eur(pctl(prestamos, 0.75))} - p95 ${eur(pctl(prestamos, 0.95))} - peor ${eur(Math.max(...prestamos))}`);
console.log(`  arranques en los que NUNCA pide prestado: ${(prestamos.filter((x) => x === 0).length / prestamos.length * 100).toFixed(0)}%`);
