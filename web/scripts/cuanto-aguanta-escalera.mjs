// ¿QUÉ AGUANTA SU CUENTA? · LA ESCALERA — de 1 a 6 contratos, y qué pasa si HOOD cae a la vez.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/cuanto-aguanta-escalera.mjs
//
// El 85% de la cuenta es HOOD. La línea de llamada de margen es el 70% del valor de HOOD, así que
// NO es una constante: si el mercado se rompe, el cóndor pierde Y HOOD cae, y la línea sube a
// buscar la caja. Aquí se mide con HOOD entero, a −30% y a −50%.

import { readFileSync } from "node:fs";

const EFECTIVO = 7977, CUENTA = 56389, HOOD = 48135, BP0 = 73874, INT = 0.05;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const J = JSON.parse(readFileSync("scripts/cuanto-aguanta-dias.json", "utf8"));
const D = J.dias;
const anos = (new Date(D[D.length - 1].fecha + "T00:00:00Z") - new Date(D[0].fecha + "T00:00:00Z")) / 86400000 / 365.25;

const CFG = [
  { nom: "cóndor de HOY  ±25/50", ala: 50, pl: (d) => d.A.pl, abre: () => true },
  { nom: "FILTRO AMPLITUD ±30/50", ala: 50, pl: (d) => d.B.pl, abre: (d) => d.opera === true },
  { nom: "por STRADDLE 2,3×/30", ala: 30, pl: (d) => d.C.pl, abre: () => true },
];

function caja(cfg, n, hoodMult = 1) {
  const linea = -0.70 * HOOD * hoodMult;
  let c = EFECTIVO, interes = 0, min = EFECTIVO, fMin = "", rojo = null, llam = null;
  let pico = EFECTIVO, dd = 0, diasRojo = 0, sinPoder = 0, prev = D[0].fecha;
  for (const d of D) {
    const nd = (new Date(d.fecha + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000; prev = d.fecha;
    if (c < 0 && nd > 0) { const i2 = c * INT * nd / 365; interes += i2; c += i2; }
    if (cfg.abre(d)) {
      const disponible = BP0 + (c - EFECTIVO);
      if (cfg.ala * 100 * n > disponible) sinPoder++;
      else c += cfg.pl(d) * n;
    }
    if (c > pico) pico = c;
    if (pico - c > dd) dd = pico - c;
    if (c < min) { min = c; fMin = d.fecha; }
    if (c < 0) { diasRojo++; if (!rojo) rojo = d.fecha; }
    if (c < linea && !llam) llam = d.fecha;
  }
  return { anual: (c - EFECTIVO) / anos, dd, ddPct: dd / CUENTA, min, fMin, rojo, diasRojo, llam, interes, sinPoder, colat: cfg.ala * 100 * n };
}

console.log(`\n### LA ESCALERA — ${D.length} sesiones ${D[0].fecha} → ${D[D.length - 1].fecha} (${anos.toFixed(2)} años)\n`);
console.log("| geometría | ctr | colateral | $/año NETO | caída máx | % cuenta | caja mínima (fecha) | días con la caja en rojo | préstamo máx | interés | LLAMADA |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const cfg of CFG) for (const n of [1, 2, 3, 4]) {
  const r = caja(cfg, n);
  console.log(`| ${cfg.nom} | ${n} | ${eur(r.colat)} | ${eur(r.anual)} | ${eur(-r.dd)} | ${(-r.ddPct * 100).toFixed(1)}% | ${eur(r.min)} (${r.fMin}) | ${r.diasRojo} de ${D.length} | ${eur(Math.min(0, r.min))} | ${eur(r.interes)} | ${r.llam || "no"} |`);
}

console.log(`\n\n### EL RIESGO CORRELACIONADO — la línea de llamada se mueve si HOOD cae\n`);
console.log(`HOOD entero: línea ${eur(-0.70 * HOOD)} · HOOD −30%: línea ${eur(-0.70 * HOOD * 0.7)} · HOOD −50%: línea ${eur(-0.70 * HOOD * 0.5)}\n`);
console.log("| geometría | ctr | préstamo máximo | HOOD entero | HOOD −30% | HOOD −50% |");
console.log("|---|---|---|---|---|---|");
for (const cfg of CFG) for (const n of [1, 2, 3, 4]) {
  const cel = [1, 0.7, 0.5].map((m) => { const r = caja(cfg, n, m); return r.llam ? `**LLAMADA ${r.llam}**` : "sin llamada"; });
  console.log(`| ${cfg.nom} | ${n} | ${eur(Math.min(0, caja(cfg, n).min))} | ${cel.join(" | ")} |`);
}

console.log(`\n\n### QUÉ TAMAÑO NO PIDE PRESTADO NUNCA (la caja no baja de $0 ningún día)\n`);
console.log("| geometría | ¿1 contrato mantiene la caja en positivo? | días en rojo con 1 ctr | lo más hondo |");
console.log("|---|---|---|---|");
for (const cfg of CFG) {
  const r = caja(cfg, 1);
  console.log(`| ${cfg.nom} | ${r.diasRojo === 0 ? "SÍ" : "**NO**"} | ${r.diasRojo} | ${eur(r.min)} el ${r.fMin} |`);
}

// fracciones: ¿existe un tamaño que nunca pide prestado? (XSP = 1/10 de SPX, pero NO hay cadena
// de XSP en disco: esto es el mismo P&L escalado, y se dice como supuesto, no como dato)
console.log(`\n(SUPUESTO DECLARADO, no medido: escalar el P&L equivale a operar XSP, que es el mismo`);
console.log(` índice a 1/10. NO hay cadena de XSP en disco, así que la horquilla de XSP no está medida.)\n`);
console.log("| geometría | fracción | $/año | caída máx | caja mínima | días en rojo |");
console.log("|---|---|---|---|---|---|");
for (const cfg of CFG) for (const f of [0.5, 0.3, 0.2, 0.1]) {
  const r = caja(cfg, f);
  console.log(`| ${cfg.nom} | ${f}× | ${eur(r.anual)} | ${eur(-r.dd)} | ${eur(r.min)} | ${r.diasRojo} |`);
}
