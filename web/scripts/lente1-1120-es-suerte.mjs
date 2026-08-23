// LENTE 1 (d) — ¿POR QUÉ LAS 11:20 NO TIENEN NINGUNA PÉRDIDA ENTERA?
//
// El informe recomienda la variante de las 11:20 «siguiendo la regla de la casa de elegir por
// riesgo»: −$3.395 de racha en contra frente a −$6.834, y CERO días con pérdida del riesgo entero
// frente a 2. Son veinte minutos de diferencia. Que veinte minutos dupliquen la racha en contra
// y borren las dos peores operaciones no suena a estructura: suena a que esos dos días concretos
// no entraron por casualidad.
//
// Aquí se mira día a día: en las jornadas donde las 11:00 pierden el riesgo entero, ¿qué hacen
// las 11:20? ¿No entran por el filtro de crédito, no entran por las medias, o entran y ganan?
// Y al revés: ¿qué días entran a las 11:20 y no a las 11:00?
//
// Si la diferencia se explica por dos o tres días sueltos que no cruzaron un listón por unos
// dólares, la «alternativa por riesgo» no es más segura — es la misma apuesta con otra mano de
// cartas, y la caída máxima de −$3.395 no es una propiedad de la regla.
//
// Uso: node --import tsx scripts/lente1-1120-es-suerte.mjs

import { diasDisponibles, cargarDia, rejilla, condor, estructura, hayHora } from "./lib0dte.mjs";

const ANCHO = 45, ALA = 50, COMISION = 0.24, DIAS_ANO = 244;
const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const suma = (v) => v.reduce((a, b) => a + b, 0);
const HH = ["11:00", "11:20"];

const R = [];
for (const d of diasDisponibles()) {
  const dia = cargarDia(d);
  if (!dia) continue;
  const ph = {};
  for (const h of HH) {
    const i = hayHora(dia, h);
    if (i < 0) { ph[h] = null; continue; }
    const spot = dia.barras[i].spot, centro = rejilla(spot);
    const patas = condor(centro, ANCHO, ALA);
    const r = estructura(dia, i, "vencimiento", patas);
    ph[h] = r ? { spot, centro, patas, credito: r.credito * 100, dolares: r.dolares - COMISION, riesgo: r.riesgoMax } : null;
  }
  R.push({ dia: d, cierre: dia.barras[dia.barras.length - 1].spot, ph });
}
const ci = R.map((x) => x.cierre);
for (let i = 0; i < R.length; i++) {
  if (i < 50) { R[i].ma50 = null; continue; }
  R[i].ma5 = media(ci.slice(i - 5, i)); R[i].ma50 = media(ci.slice(i - 50, i));
}
const C = R.filter((x) => x.ma50 != null);
const ANOS = C.length / DIAS_ANO;
const pasa = (x, h) => { const c = x.ph[h]; return c && c.spot > x.ma5 && c.spot > x.ma50 && c.credito >= 50; };

const O = {}; for (const h of HH) O[h] = C.filter((x) => pasa(x, h));
for (const h of HH) {
  const pls = O[h].map((x) => x.ph[h].dolares);
  let a = 0, pico = 0, peor = 0;
  for (const p of pls) { a += p; pico = Math.max(pico, a); peor = Math.min(peor, a - pico); }
  console.log(`${h}/$50 → n=${pls.length} · $${(suma(pls) / ANOS).toFixed(0)}/año · peor día $${Math.min(...pls).toFixed(0)} · racha en contra $${peor.toFixed(0)} · pierden el riesgo entero: ${O[h].filter((x) => x.ph[h].dolares <= -x.ph[h].riesgo * 0.99).length}`);
}
console.log("");

console.log("=".repeat(105));
console.log("  LOS PEORES DÍAS DE LAS 11:00 — ¿qué hacen las 11:20 en esas mismas jornadas?");
console.log("=".repeat(105) + "\n");
console.log("| día | P&L 11:00 | ¿entra a las 11:20? | por qué no | P&L 11:20 si entrase |");
console.log("|---|---|---|---|---|");
const peores = [...O["11:00"]].sort((a, b) => a.ph["11:00"].dolares - b.ph["11:00"].dolares).slice(0, 12);
for (const x of peores) {
  const c = x.ph["11:20"];
  let motivo = "—", entra = "SÍ";
  if (!c) { entra = "no"; motivo = "sin cadena / hueco"; }
  else {
    const a = c.spot > x.ma5, b = c.spot > x.ma50, cc = c.credito >= 50;
    if (!(a && b && cc)) {
      entra = "NO";
      motivo = [!a ? "bajo la MA5" : null, !b ? "bajo la MA50" : null,
                !cc ? `crédito $${c.credito.toFixed(0)} < $50` : null].filter(Boolean).join(" + ");
    }
  }
  console.log(`| ${x.dia} | $${x.ph["11:00"].dolares.toFixed(0)} | ${entra} | ${motivo} | ${c ? "$" + c.dolares.toFixed(0) : "—"} |`);
}

console.log("\n" + "=".repeat(105));
console.log("  LOS PEORES DÍAS DE LAS 11:20 — y qué hacen las 11:00");
console.log("=".repeat(105) + "\n");
console.log("| día | P&L 11:20 | P&L 11:00 | ¿entra a las 11:00? |");
console.log("|---|---|---|---|");
for (const x of [...O["11:20"]].sort((a, b) => a.ph["11:20"].dolares - b.ph["11:20"].dolares).slice(0, 8))
  console.log(`| ${x.dia} | $${x.ph["11:20"].dolares.toFixed(0)} | ${x.ph["11:00"] ? "$" + x.ph["11:00"].dolares.toFixed(0) : "—"} | ${pasa(x, "11:00") ? "sí" : "no"} |`);

console.log("\n" + "=".repeat(105));
console.log("  CUÁNTOS DÍAS COMPARTEN — si son casi los mismos, la diferencia son unos pocos días");
console.log("=".repeat(105) + "\n");
const s0 = new Set(O["11:00"].map((x) => x.dia)), s2 = new Set(O["11:20"].map((x) => x.dia));
const comun = [...s0].filter((d) => s2.has(d));
const solo0 = [...s0].filter((d) => !s2.has(d)), solo2 = [...s2].filter((d) => !s0.has(d));
console.log(`  días en ambas: ${comun.length} · sólo 11:00: ${solo0.length} · sólo 11:20: ${solo2.length}`);
const plDe = (dd, h) => suma(dd.map((d) => C.find((x) => x.dia === d).ph[h].dolares));
console.log(`  en los ${comun.length} días comunes: 11:00 hace $${plDe(comun, "11:00").toFixed(0)} · 11:20 hace $${plDe(comun, "11:20").toFixed(0)}`);
console.log(`  los ${solo0.length} días exclusivos de las 11:00 suman $${plDe(solo0, "11:00").toFixed(0)}`);
console.log(`  los ${solo2.length} días exclusivos de las 11:20 suman $${plDe(solo2, "11:20").toFixed(0)}\n`);
console.log("  → si en los días COMUNES las dos horas hacen casi lo mismo, las 11:20 no son una regla");
console.log("    más segura: son la misma regla a la que le tocaron menos días malos.\n");

// ¿cuánto aguanta la ventaja de las 11:20 si se le quitan sus 2 peores días?
for (const h of HH) {
  const pls = O[h].map((x) => x.ph[h].dolares).sort((a, b) => a - b);
  console.log(`  ${h}: quitando sus 2 PEORES días → $${(suma(pls.slice(2)) / ANOS).toFixed(0)}/año · añadiendo 2 pérdidas enteras (−$4.800 cada una) → $${((suma(pls) - 9600) / ANOS).toFixed(0)}/año`);
}
