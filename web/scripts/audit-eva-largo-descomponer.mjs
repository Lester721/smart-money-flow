// AUDITORÍA 2 — descomponer el hueco 180 d (−15,41%) vs 365 d (−5,16%).
// Solo lectura. Uso: node --max-old-space-size=6144 scripts/audit-eva-largo-descomponer.mjs

import { readFileSync } from "node:fs";
const filas = JSON.parse(readFileSync(process.env.EVA_LARGO_FILAS || "scripts/eva-largo-filas.json", "utf8"));
const media = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
const pct = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(2)}%`;
const sd = (x) => { const m = media(x); return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / (x.length - 1)); };
const tC = (x) => media(x) / (sd(x) / Math.sqrt(x.length));

// Último día de entrada que el brazo de 365 d pudo usar
const ULT365 = filas.filter((f) => f.h[365]).map((f) => f.dia).sort().pop();
console.log(`última entrada usable a 365 d: ${ULT365}\n`);

const linea = (nom, s, h) => {
  if (!s.length) return console.log(`${nom.padEnd(52)} n=0`);
  console.log(`${nom.padEnd(52)} n=${String(s.length).padStart(6)}  DTE=${media(s.map((f) => f.dte)).toFixed(0).padStart(4)}  ` +
    `flujo ${pct(media(s.map((f) => f.h[h].t))).padStart(9)}  cubo ${pct(media(s.map((f) => f.h[h].c))).padStart(9)}  ` +
    `difer ${pct(media(s.map((f) => f.h[h].d))).padStart(8)}  t=${tC(s.map((f) => f.h[h].d)).toFixed(2).padStart(6)}`);
};

console.log("═══ A · el universo de 180 d, troceado ═══");
const s180 = filas.filter((f) => f.h[180]);
linea("TODO 180 d (el −15,41% atacado)", s180, 180);
linea("  · los que TAMBIÉN tienen 365 d", s180.filter((f) => f.h[365]), 180);
linea("  · los que NO tienen 365 d", s180.filter((f) => !f.h[365]), 180);
linea("      ↳ excluidos por DTE (entró a tiempo, DTE≤365)", s180.filter((f) => !f.h[365] && f.dia <= ULT365), 180);
linea("      ↳ excluidos por CENSURA (entró después)", s180.filter((f) => !f.h[365] && f.dia > ULT365), 180);

console.log("\n═══ B · igualar la VENTANA DE ENTRADA (solo entradas ≤ " + ULT365 + ") ═══");
const vent = filas.filter((f) => f.dia <= ULT365);
for (const h of [30, 90, 180, 365]) linea(`  ${h} d · misma ventana de entrada`, vent.filter((f) => f.h[h]), h);

console.log("\n═══ C · igualar VENTANA **y** DTE (DTE > 365, entradas ≤ " + ULT365 + ") ═══");
const par = filas.filter((f) => f.h[180] && f.h[365]);
for (const h of [30, 90, 180, 365]) linea(`  ${h} d · población idéntica`, par.filter((f) => f.h[h]), h);

console.log("\n═══ D · ¿es un bug del tratamiento? el CUBO DE CONTROL en la misma población ═══");
console.log("Si el −15,41% fuese un bug de la pata del flujo, el cubo NO lo replicaría.");
console.log("  180 d todo   : flujo " + pct(media(s180.map((f) => f.h[180].t))) + "  cubo " + pct(media(s180.map((f) => f.h[180].c))));
const s365 = filas.filter((f) => f.h[365]);
console.log("  365 d todo   : flujo " + pct(media(s365.map((f) => f.h[365].t))) + "  cubo " + pct(media(s365.map((f) => f.h[365].c))));
console.log("  población fija 180 vs 365:");
console.log("      @180 : flujo " + pct(media(par.map((f) => f.h[180].t))) + "  cubo " + pct(media(par.map((f) => f.h[180].c))));
console.log("      @365 : flujo " + pct(media(par.map((f) => f.h[365].t))) + "  cubo " + pct(media(par.map((f) => f.h[365].c))));

console.log("\n═══ E · contribución de cada trozo al −15,41% ═══");
const tot = s180.length;
for (const [nom, sub] of [
  ["con 365 d (DTE>365, entrada ≤ " + ULT365 + ")", s180.filter((f) => f.h[365])],
  ["sin 365 d por DTE ≤ 365", s180.filter((f) => !f.h[365] && f.dia <= ULT365)],
  ["sin 365 d por censura (entrada > " + ULT365 + ")", s180.filter((f) => !f.h[365] && f.dia > ULT365)],
]) {
  const m = media(sub.map((f) => f.h[180].t));
  console.log(`  ${nom.padEnd(50)} peso ${((sub.length / tot) * 100).toFixed(1).padStart(5)}%  media ${pct(m).padStart(9)}  aporta ${pct((sub.length / tot) * m).padStart(9)}`);
}

console.log("\n═══ F · ¿cuántas filas son operaciones INDEPENDIENTES? ═══");
console.log("(varias operaciones de ≥$3M sobre el MISMO contrato el mismo día comparten t, c y d idénticos)");
for (const h of [30, 90, 180, 365]) {
  const s = filas.filter((f) => f.h[h]);
  const contratos = new Set(s.map((f) => `${f.ticker}|${f.dia}|${f.exp}|${f.strike}|${f.right}`));
  const tickerDia = new Set(s.map((f) => `${f.ticker}|${f.dia}`));
  // t agrupado a nivel contrato-día: una observación por contrato (media de sus filas)
  const g = new Map();
  for (const f of s) {
    const k = `${f.ticker}|${f.dia}|${f.exp}|${f.strike}|${f.right}`;
    (g.get(k) ?? g.set(k, []).get(k)).push(f.h[h].d);
  }
  const dAgr = [...g.values()].map(media);
  // y a nivel ticker-día
  const g2 = new Map();
  for (const f of s) { const k = `${f.ticker}|${f.dia}`; (g2.get(k) ?? g2.set(k, []).get(k)).push(f.h[h].d); }
  const dAgr2 = [...g2.values()].map(media);
  console.log(`${String(h).padStart(4)} d  filas ${String(s.length).padStart(6)} · contratos-día ${String(contratos.size).padStart(6)} · ticker-día ${String(tickerDia.size).padStart(5)}` +
    `   |   t crudo ${tC(s.map((f) => f.h[h].d)).toFixed(2).padStart(6)}` +
    `   t por contrato-día ${tC(dAgr).toFixed(2).padStart(6)} (dif ${pct(media(dAgr))})` +
    `   t por ticker-día ${tC(dAgr2).toFixed(2).padStart(6)} (dif ${pct(media(dAgr2))})`);
}
