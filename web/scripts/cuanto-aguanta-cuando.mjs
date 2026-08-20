// ¿CUÁNDO pasa la caída? — la ventana de la caída máxima y la de la caja mínima, con fechas.
// Uso: node --import tsx --max-old-space-size=10240 scripts/cuanto-aguanta-cuando.mjs

import { readFileSync } from "node:fs";
const EFECTIVO = 7977, CUENTA = 56389, INT = 0.05;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const D = JSON.parse(readFileSync("scripts/cuanto-aguanta-dias.json", "utf8")).dias;
const CFG = [
  { nom: "cóndor de HOY  ±25/50", pl: (d) => d.A.pl, abre: () => true },
  { nom: "FILTRO AMPLITUD ±30/50", pl: (d) => d.B.pl, abre: (d) => d.opera === true },
  { nom: "por STRADDLE 2,3×/30", pl: (d) => d.C.pl, abre: () => true },
];

console.log("\n### LA VENTANA DE LA CAÍDA MÁXIMA — de qué pico a qué suelo, y con cuánta caja\n");
console.log("| geometría | ctr | pico (fecha, caja) | suelo (fecha, caja) | caída | % cuenta | días | ¿la caja llegó a $0? |");
console.log("|---|---|---|---|---|---|---|---|");
for (const cfg of CFG) for (const n of [1, 2]) {
  let c = EFECTIVO, pico = EFECTIVO, fPico = D[0].fecha, dd = 0, fDD = "", fPicoDD = "", cSuelo = 0, prev = D[0].fecha;
  let iPico = 0, iPicoDD = 0, iSuelo = 0, i = 0;
  for (const d of D) {
    const nd = (new Date(d.fecha + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000; prev = d.fecha;
    if (c < 0 && nd > 0) c += c * INT * nd / 365;
    if (cfg.abre(d)) c += cfg.pl(d) * n;
    if (c > pico) { pico = c; fPico = d.fecha; iPico = i; }
    // iPicoDD se congela CON el pico que originó la caída: si no, un pico posterior lo pisa y
    // el recuento de sesiones sale negativo (lo hizo en la primera versión de este script).
    if (pico - c > dd) { dd = pico - c; fDD = d.fecha; fPicoDD = fPico; cSuelo = c; iSuelo = i; iPicoDD = iPico; }
    i++;
  }
  console.log(`| ${cfg.nom} | ${n} | ${fPicoDD} · ${eur(dd + cSuelo)} | ${fDD} · ${eur(cSuelo)} | **${eur(-dd)}** | ${(-dd / CUENTA * 100).toFixed(1)}% | ${iSuelo - iPicoDD} sesiones | ${cSuelo < 0 ? "**SÍ, y por debajo**" : "no, se quedó en " + eur(cSuelo)} |`);
}

console.log("\n\n### LOS 10 PEORES DÍAS de cada geometría (1 contrato)\n");
for (const cfg of CFG) {
  const v = D.filter((d) => cfg.abre(d)).map((d) => ({ f: d.fecha, p: cfg.pl(d) })).sort((a, b) => a.p - b.p).slice(0, 10);
  console.log(`**${cfg.nom}** — ` + v.map((x) => `${x.f} ${eur(x.p)}`).join(" · "));
}

console.log("\n\n### ¿EL FILTRO ESQUIVA LOS DÍAS MALOS, O LOS COME? (los 20 peores días del ±30/50)\n");
const peores = [...D].sort((a, b) => a.B.pl - b.B.pl).slice(0, 20);
console.log(`De los 20 peores días de la geometría ±30/50, el filtro estaba ENCENDIDO en ${peores.filter((d) => d.opera).length} y APAGADO en ${peores.filter((d) => !d.opera).length}.`);
console.log(`Tasa base: el filtro está encendido el ${(D.filter((d) => d.opera).length / D.length * 100).toFixed(1)}% de los días.`);
console.log(`Suma de esos 20 días: ${eur(peores.reduce((a, d) => a + d.B.pl, 0))} · lo que se come el filtro: ${eur(peores.filter((d) => d.opera).reduce((a, d) => a + d.B.pl, 0))}`);
console.log("\n| fecha | P&L ±30/50 | ¿filtro encendido? |");
console.log("|---|---|---|");
for (const d of peores) console.log(`| ${d.fecha} | ${eur(d.B.pl)} | ${d.opera ? "**SÍ, la come**" : "no, la esquiva"} |`);
